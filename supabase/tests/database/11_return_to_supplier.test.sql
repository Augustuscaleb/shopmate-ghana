-- Stage 1C, task T8: public.return_to_supplier (04 §2.2; 05 C-21, C-25c, C-117, C-122, §3.2; 09 §3, §4.2).
-- Plan: docs/stages/STAGE-1C-T8-RETURN-TO-SUPPLIER-PLAN.md. V = value_removed at average; C = credit;
-- D = C − V; cost impact = V − C = −D. ONE supplier_return movement (− q, − V) is the only stock-value
-- change; D is recorded on the return row and never moves stock value; attention when abs(D) >= 10.
-- Owner decisions: R1–R8, Q1 (unknown cost refused), O1 (known cost with value 0 allowed, V = 0).
-- Fixtures are fictitious and everything is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(94);

create schema tests;
grant usage on schema tests to authenticated, anon;
create table tests.ids (k text primary key, v uuid);
grant select, insert on tests.ids to authenticated;
grant select on tests.ids to anon;
create function tests.id(p_k text) returns uuid language sql stable as $$ select v from tests.ids where k = p_k $$;
grant execute on function tests.id(text) to authenticated, anon;
create table tests.results (k text primary key, r jsonb);
grant select, insert on tests.results to authenticated;
create function tests.r(p_k text) returns jsonb language sql stable as $$ select r from tests.results where k = p_k $$;
grant execute on function tests.r(text) to authenticated;
create function tests.as_user(p_user text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end $$;
create function tests.pv(p_product uuid) returns text language sql stable security definer as $$
  select stock_qty || ' / ' || stock_value from public.products where id = p_product
$$;
grant execute on function tests.pv(uuid) to authenticated;
create function tests.unpaid(p_biz uuid, p_purchase uuid) returns bigint language sql stable security definer as $$
  select private.purchase_unpaid(p_biz, p_purchase)
$$;
grant execute on function tests.unpaid(uuid, uuid) to authenticated;
create function tests.pool_conserved(p_business uuid) returns boolean language sql stable security definer as $$
  select coalesce(bool_and(
           p.stock_qty = coalesce((select sum(m.qty_change) from public.stock_movements m where m.product_id = p.id), 0)
       and p.stock_value = coalesce((select sum(m.value) from public.stock_movements m where m.product_id = p.id), 0)
       and (select count(*) from public.stock_movements m where m.product_id = p.id)
           = (select count(*) from public.product_cost_history h where h.product_id = p.id)), true)
  from public.products p where p.business_id = p_business
$$;
grant execute on function tests.pool_conserved(uuid) to authenticated;
-- return with a fresh request ID
create function tests.rt(p_biz uuid, p_product uuid, p_qty integer, p_credit bigint, p_type text,
                         p_purchase uuid default null, p_reason text default 'Damaged on delivery')
returns jsonb language sql as $$
  select public.return_to_supplier(gen_random_uuid(), p_biz, p_product, p_qty, p_credit, p_type, p_reason, p_purchase)
$$;
grant execute on function tests.rt(uuid, uuid, integer, bigint, text, uuid, text) to authenticated;
create function tests.mkp(p_biz uuid, p_name text, p_cost bigint, p_open integer) returns uuid language sql as $$
  select (public.create_product(gen_random_uuid(), p_biz, p_name, 1000, p_cost_price => p_cost, p_opening_stock => p_open) ->> 'product_id')::uuid
$$;
grant execute on function tests.mkp(uuid, text, bigint, integer) to authenticated;
create function tests.buy(p_biz uuid, p_product uuid, p_qty integer, p_cost bigint, p_paid bigint) returns uuid language sql as $$
  select (public.restock(gen_random_uuid(), p_biz, p_product, p_qty, p_cost, p_paid,
                         case when p_paid > 0 then 'cash_drawer' end) ->> 'purchase_id')::uuid
$$;
grant execute on function tests.buy(uuid, uuid, integer, bigint, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures: owner A with shops A and A2, owner B with shop B
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner.a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner.b@example.test');

select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
insert into tests.ids select 'biz_b', (public.create_business(gen_random_uuid(), 'Kofi Test Mart', 'provision', 'Kumasi', null) ->> 'business_id')::uuid;
insert into tests.ids select 'b_prod', tests.mkp(tests.id('biz_b'), 'B milo', 120, 6);
reset role;

select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
insert into tests.ids select 'biz_a',  (public.create_business(gen_random_uuid(), 'Ama Test Provisions', 'provision', 'Accra', null) ->> 'business_id')::uuid;
insert into tests.ids select 'biz_a2', (public.create_business(gen_random_uuid(), 'Ama Second Shop', 'minimart', 'Tema', null) ->> 'business_id')::uuid;
insert into tests.ids select 'sard',    tests.mkp(tests.id('biz_a'), 'Sardine tin', 1500, 10);     -- 10 / 15000 (example A)
insert into tests.ids select 'milo',    tests.mkp(tests.id('biz_a'), 'Milo tin', 1500, 2);         -- + P below: 12 / 18000 (example B)
insert into tests.ids select 'bisc',    tests.mkp(tests.id('biz_a'), 'Biscuit pack', 333, 3);      -- 3 / 999, + 1 below: 3 / 1000 (C)
insert into tests.ids select 'cart',    tests.mkp(tests.id('biz_a'), 'Biscuit carton', 1200, 2);   -- 2 / 2400 (D)
insert into tests.ids select 'pen',     tests.mkp(tests.id('biz_a'), 'Promo pen', 0, 5);           -- 5 / 0, cost known (E1)
insert into tests.ids select 'milk',    tests.mkp(tests.id('biz_a'), 'Milk tin', 1000, 4);         -- 4 / 4000, reset to 4 / 0 below (E2)
insert into tests.ids select 'thr',     tests.mkp(tests.id('biz_a'), 'Threshold item', 100, 10);   -- 10 / 1000, avg 100
insert into tests.ids select 'half',    tests.mkp(tests.id('biz_a'), 'Sweet', 1, 2);               -- 2 / 2, + 1 below: 2 / 3
insert into tests.ids select 'oil',     tests.mkp(tests.id('biz_a'), 'Palm oil', 700, 6);          -- purchases for R3 / R4
insert into tests.ids select 'unknown', (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Rice 1kg', 1500, p_opening_stock => 4) ->> 'product_id')::uuid;
insert into tests.ids select 'arch',    tests.mkp(tests.id('biz_a'), 'Old torch', 50, 3);
insert into tests.ids select 'gone',    tests.mkp(tests.id('biz_a'), 'Gone item', 50, 3);
insert into tests.ids select 'a2_prod', tests.mkp(tests.id('biz_a2'), 'Second shop oil', 700, 3);
-- Purchases (T5): P for Milo (10 for 15000, nothing paid); oil purchases; another shop's purchase
insert into tests.ids select 'p_milo', tests.buy(tests.id('biz_a'), tests.id('milo'), 10, 15000, 0);
insert into tests.ids select 'p_oil',  tests.buy(tests.id('biz_a'), tests.id('oil'), 4, 2800, 800);    -- owes 2000
insert into tests.ids select 'p_oil2', tests.buy(tests.id('biz_a'), tests.id('oil'), 2, 1400, 400);    -- owes 1000
insert into tests.ids select 'p_oilp', tests.buy(tests.id('biz_a'), tests.id('oil'), 1, 700, 700);     -- fully paid
insert into tests.ids select 'p_sard', tests.buy(tests.id('biz_a'), tests.id('sard'), 1, 1500, 0);     -- Sardine purchase (R4)
insert into tests.ids select 'p_a2',   tests.buy(tests.id('biz_a2'), tests.id('a2_prod'), 1, 700, 0);
select public.set_product_archived(gen_random_uuid(), tests.id('biz_a'), tests.id('arch'), true);
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
update public.products set deleted_at = now() where id = tests.id('gone');
-- Biscuit 3 / 999 -> 3 / 1000 (fixture value correction)
select private.apply_movement(tests.id('biz_a'), tests.id('bisc'), 'value_correction', 0, 1);
-- Sweet 2 / 2 -> 2 / 3 (fixture value correction): one unit is worth exactly 1.5
select private.apply_movement(tests.id('biz_a'), tests.id('half'), 'value_correction', 0, 1);
-- E2: a late-sale-like value change leaves Milk at 4 / -1000; T1's C-25b rule corrects it to 4 / 0
-- and raises "Cost check needed" (fixture movement; the correction itself is T1's real code)
select private.apply_movement(tests.id('biz_a'), tests.id('milk'), 'value_correction', 0, -5000);
create temp table e2_before as
  select (select to_jsonb(m) from public.stock_movements m where m.product_id = tests.id('milk') and m.type = 'cost_adjustment') as c25b,
         (select to_jsonb(a) from public.attention_items a where a.type = 'cost_check' and a.entity_id = tests.id('milk')) as check_item;
create temp table before_all as
  select (select count(*) from public.stock_movements where type = 'cost_adjustment'
            and business_id in (tests.id('biz_a'), tests.id('biz_a2'), tests.id('biz_b'))) as cost_adj;
grant select on e2_before, before_all to authenticated;
-- Sardine's restock made it 11 / 16500; take that one back out so example A starts at 10 / 15000
select private.apply_movement(tests.id('biz_a'), tests.id('sard'), 'adjustment', -1, -1500, p_reason => 'other');

-- ===========================================================================
-- Definition and privileges
-- ===========================================================================
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc
           where oid = 'public.return_to_supplier(uuid,uuid,uuid,integer,bigint,text,text,uuid)'::regprocedure),
  'TC-INV-91a: return_to_supplier exists, SECURITY DEFINER with explicit checks and an empty search_path');
select ok(has_function_privilege('authenticated', 'public.return_to_supplier(uuid,uuid,uuid,integer,bigint,text,text,uuid)', 'execute')
          and not has_function_privilege('anon', 'public.return_to_supplier(uuid,uuid,uuid,integer,bigint,text,text,uuid)', 'execute')
          and not exists (select 1 from information_schema.routine_privileges
                          where routine_schema = 'public' and routine_name = 'return_to_supplier' and grantee = 'PUBLIC'),
  'TC-INV-91b: signed-in users can call it; anonymous callers and PUBLIC cannot');
select ok(not has_table_privilege('authenticated', 'public.supplier_returns', 'insert')
          and not has_table_privilege('authenticated', 'public.stock_movements', 'insert')
          and not has_function_privilege('authenticated', 'private.purchase_unpaid(uuid,uuid)', 'execute'),
  'TC-INV-91c: the app cannot write returns or movements directly; the unpaid helper stays internal');
select is((tests.unpaid(tests.id('biz_a'), tests.id('p_milo'))), 15000::bigint, 'TC-INV-91d: (setup) Milo purchase P owes 15000');

-- ===========================================================================
-- A. Cash refund below book value (TC-PUR-07)
-- ===========================================================================
set local role authenticated;
insert into tests.results select 'a', public.return_to_supplier('55555555-5555-5555-5555-555555555501', tests.id('biz_a'), tests.id('sard'),
  3, 4200, 'refund_cash', '  Dented tins  ');
insert into tests.ids select 'ret_a', (tests.r('a') ->> 'return_id')::uuid;
insert into tests.ids select 'mv_a',  (tests.r('a') ->> 'movement_id')::uuid;
reset role;
select is(tests.pv(tests.id('sard')), '7 / 10500', 'TC-PUR-07 (C-21, C-117): 3 of 10 / 15000 returned: V = 4500 removed at the average; 7 / 10500 (average still 1500)');
select ok((select type = 'supplier_return' and qty_change = -3 and value = -4500 and unit_cost = 1500 and reason is null
                  and note = 'Dented tins' and purchase_id is null and user_id = '00000000-0000-0000-0000-0000000000a1'
           from public.stock_movements where id = tests.id('mv_a')),
  'TC-INV-92a: ONE supplier_return movement: -3, -4500, unit cost the average, note = trimmed reason, no purchase');
select ok((select count(*) = 1 and bool_and(cause = 'supplier_return' and stock_qty_after = 7 and stock_value_after = 10500 and avg_cost = 1500)
           from public.product_cost_history where movement_id = tests.id('mv_a')),
  'TC-INV-92b: one history row, cause supplier_return');
select ok((select movement_id = tests.id('mv_a') and qty = 3 and value_removed = 4500 and credit_amount = 4200 and credit_type = 'refund_cash'
                  and purchase_id is null and reason = 'Dented tins' and user_id = '00000000-0000-0000-0000-0000000000a1'
           from public.supplier_returns where id = tests.id('ret_a')),
  'TC-INV-92c: the return row: V (value_removed) and C (credit_amount) stored, so D = C - V is derivable');
select ok(tests.r('a') @> jsonb_build_object('return_id', tests.id('ret_a'), 'qty', 3, 'value_removed', 4500, 'credit_amount', 4200,
                                            'credit_type', 'refund_cash', 'difference', -300, 'cost_impact', 300,
                                            'stock_qty', 7, 'stock_value', 10500)
          and tests.r('a') -> 'unpaid_after' = 'null'::jsonb and tests.r('a') -> 'purchase_id' = 'null'::jsonb,
  'TC-PUR-07 (C-25c): D = 4200 - 4500 = -300, cost impact +300 (cost up, profit down)');
select ok((select count(*) = 1 and bool_and(type = 'cost_adjustment' and entity = 'supplier_return' and status = 'open'
                  and message_data @> jsonb_build_object('rule', 'C-25c', 'return_id', tests.id('ret_a'), 'movement_id', tests.id('mv_a'),
                                                         'value_removed', 4500, 'credit_amount', 4200, 'difference', -300, 'cost_impact', 300))
                  and bool_and(id = (tests.r('a') ->> 'attention_item_id')::uuid)
           from public.attention_items where entity_id = tests.id('ret_a')),
  'TC-ATTN-02 (C-122): abs(D) = 300 raises ONE cost-adjustment item for the return, with amounts and direction');
select ok((select count(*) = 1 and bool_and(user_id = '00000000-0000-0000-0000-0000000000a1' and entity = 'supplier_return'
                  and before = '{"stock_qty":10,"stock_value":15000,"unpaid":null}'::jsonb
                  and after @> jsonb_build_object('stock_qty', 7, 'stock_value', 10500, 'value_removed', 4500, 'credit_amount', 4200,
                                                  'difference', -300, 'cost_impact', 300, 'movement_id', tests.id('mv_a'))
                  and reason = 'Dented tins')
           from public.audit_log where action = 'return_to_supplier' and entity_id = tests.id('ret_a')),
  'TC-INV-92d (SEC-21): one audit entry with the stock before and after, V, C and D');

-- ===========================================================================
-- B. Credit above book value against an unpaid purchase (TC-PUR-08)
-- ===========================================================================
select is(tests.pv(tests.id('milo')), '12 / 18000', 'TC-INV-93a: (setup) Milo 12 / 18000');
set local role authenticated;
insert into tests.results select 'b', tests.rt(tests.id('biz_a'), tests.id('milo'), 2, 3200, 'reduce_unpaid', tests.id('p_milo'));
reset role;
select ok(tests.r('b') @> '{"value_removed":3000,"credit_amount":3200,"difference":200,"cost_impact":-200,"unpaid_after":11800,"stock_qty":10,"stock_value":15000}'
          and tests.pv(tests.id('milo')) = '10 / 15000',
  'TC-PUR-08: 2 returned at the average (V = 3000) for a 3200 credit: D = +200 (cost down); stock 10 / 15000');
select is(tests.unpaid(tests.id('biz_a'), tests.id('p_milo')), 11800::bigint,
  'TC-PUR-08: P owes 15000 - 3200 = 11800, through T7''s private.purchase_unpaid');
select ok((select purchase_id = tests.id('p_milo') from public.stock_movements where id = (tests.r('b') ->> 'movement_id')::uuid)
          and (select purchase_id = tests.id('p_milo') and credit_type = 'reduce_unpaid' from public.supplier_returns where id = (tests.r('b') ->> 'return_id')::uuid),
  'TC-INV-93b: the movement and the return row both link the purchase');
select is((select (after ->> 'unpaid')::bigint from public.audit_log where entity_id = (tests.r('b') ->> 'return_id')::uuid), 11800::bigint,
  'TC-INV-93c: the audit entry records the amount owed after the credit');

-- R3: credit above the outstanding balance refused; equal accepted; a fully paid purchase takes no credit (but 0 is allowed, R7)
set local role authenticated;
select throws_ok($q$select tests.rt(tests.id('biz_a'), tests.id('oil'), 1, 2001, 'reduce_unpaid', tests.id('p_oil'))$q$, '22023', 'credit_exceeds_unpaid',
  'TC-PUR-08 (R3): a 2001 credit on a purchase owing 2000 is refused');
insert into tests.results select 'r3eq', tests.rt(tests.id('biz_a'), tests.id('oil'), 1, 2000, 'reduce_unpaid', tests.id('p_oil'));
select throws_ok($q$select tests.rt(tests.id('biz_a'), tests.id('oil'), 1, 1, 'reduce_unpaid', tests.id('p_oil'))$q$, '22023', 'credit_exceeds_unpaid',
  'TC-PUR-08 (R3): once it owes nothing, even 1 pesewa is refused (never below 0)');
select throws_ok($q$select tests.rt(tests.id('biz_a'), tests.id('oil'), 1, 1, 'reduce_unpaid', tests.id('p_oilp'))$q$, '22023', 'credit_exceeds_unpaid',
  'TC-INV-93d (R3): a purchase fully paid at purchase time takes no credit');
insert into tests.results select 'r3zero', tests.rt(tests.id('biz_a'), tests.id('oil'), 1, 0, 'reduce_unpaid', tests.id('p_oilp'));
reset role;
select ok(tests.r('r3eq') @> '{"credit_amount":2000,"unpaid_after":0}' and tests.unpaid(tests.id('biz_a'), tests.id('p_oil')) = 0,
  'TC-PUR-08 (R3): a credit equal to the amount owed is accepted and leaves 0');
select ok(tests.r('r3zero') @> '{"credit_amount":0,"unpaid_after":0}' and tests.unpaid(tests.id('biz_a'), tests.id('p_oilp')) = 0,
  'TC-INV-93e (R7): a zero credit against a fully paid purchase is accepted; nothing goes below 0');

-- Refunds never reduce a purchase balance (T7 helper unchanged)
set local role authenticated;
insert into tests.results select 'rfp', tests.rt(tests.id('biz_a'), tests.id('oil'), 1, 700, 'refund_cash', tests.id('p_oil2'));
insert into tests.results select 'rfm', tests.rt(tests.id('biz_a'), tests.id('oil'), 1, 700, 'refund_momo', tests.id('p_oil2'));
reset role;
select ok(tests.unpaid(tests.id('biz_a'), tests.id('p_oil2')) = 1000
          and tests.r('rfp') @> '{"unpaid_after":1000}' and tests.r('rfm') @> '{"unpaid_after":1000}'
          and (select count(*) = 2 from public.supplier_returns where purchase_id = tests.id('p_oil2')),
  'TC-INV-93f: cash and MoMo refunds linked to a purchase are recorded with it but do not reduce what it owes (1000)');

-- ===========================================================================
-- C. Rounding and the attention threshold (R8, TC-ATTN-02)
-- ===========================================================================
set local role authenticated;
insert into tests.results select 'c', tests.rt(tests.id('biz_a'), tests.id('bisc'), 1, 330, 'refund_momo');
insert into tests.results select 'half', tests.rt(tests.id('biz_a'), tests.id('half'), 1, 2, 'refund_cash');
insert into tests.results select 't90',  tests.rt(tests.id('biz_a'), tests.id('thr'), 1, 90, 'refund_cash');
insert into tests.results select 't91',  tests.rt(tests.id('biz_a'), tests.id('thr'), 1, 91, 'refund_cash');
insert into tests.results select 't100', tests.rt(tests.id('biz_a'), tests.id('thr'), 1, 100, 'refund_cash');
insert into tests.results select 't109', tests.rt(tests.id('biz_a'), tests.id('thr'), 1, 109, 'refund_cash');
insert into tests.results select 't110', tests.rt(tests.id('biz_a'), tests.id('thr'), 1, 110, 'refund_cash');
reset role;
select ok(tests.r('c') @> '{"value_removed":333,"difference":-3,"cost_impact":3,"stock_qty":2,"stock_value":667}'
          and tests.r('c') -> 'attention_item_id' = 'null'::jsonb,
  'TC-INV-94a (example C): 3 / 1000, one returned: V = round(333.33) = 333; D = -3 is rounding: no item');
select ok(tests.r('half') @> '{"value_removed":2,"difference":0,"stock_qty":1,"stock_value":1}',
  'TC-INV-94c: 2 / 3, one returned: V = 1.5 rounded half up to 2 (exact integer arithmetic); 1 / 1 left');
select ok(tests.r('t90') @> '{"value_removed":100,"difference":-10}' and tests.r('t90') -> 'attention_item_id' <> 'null'::jsonb,
  'TC-ATTN-02 (R8): D = -10 (abs 10) raises an item');
select ok(tests.r('t91') @> '{"difference":-9}' and tests.r('t91') -> 'attention_item_id' = 'null'::jsonb,
  'TC-ATTN-02 (R8): D = -9 does not');
select ok(tests.r('t100') @> '{"difference":0,"cost_impact":0}' and tests.r('t100') -> 'attention_item_id' = 'null'::jsonb,
  'TC-ATTN-02 (R8): D = 0 does not');
select ok(tests.r('t109') @> '{"difference":9}' and tests.r('t109') -> 'attention_item_id' = 'null'::jsonb,
  'TC-ATTN-02 (R8): D = +9 does not');
select ok(tests.r('t110') @> '{"difference":10,"cost_impact":-10}' and tests.r('t110') -> 'attention_item_id' <> 'null'::jsonb,
  'TC-ATTN-02 (R8): D = +10 (abs 10) raises an item');
select is((select count(*)::int from public.attention_items where entity = 'supplier_return'
             and entity_id in (select (r ->> 'return_id')::uuid from tests.results where k in ('t90','t91','t100','t109','t110'))), 2,
  'TC-ATTN-02 (R8): exactly two items for the five threshold returns');
select is(tests.pv(tests.id('thr')), '5 / 500', 'TC-INV-94b: five returns at the average of 100 leave 5 / 500 (average unchanged)');

-- ===========================================================================
-- D. Zero credit, entire stock (R7)
-- ===========================================================================
set local role authenticated;
insert into tests.results select 'd', tests.rt(tests.id('biz_a'), tests.id('cart'), 2, 0, 'refund_cash', p_reason => 'Expired, supplier took them back');
reset role;
select ok(tests.r('d') @> '{"value_removed":2400,"credit_amount":0,"difference":-2400,"cost_impact":2400,"stock_qty":0,"stock_value":0}'
          and tests.r('d') -> 'attention_item_id' <> 'null'::jsonb,
  'TC-INV-95a (example D, R7): the whole 2 / 2400 returned for nothing: movement -2 / -2400, stock 0 / 0, D = -2400, item raised');
select ok((select count(*) = 1 from public.stock_movements where product_id = tests.id('cart') and type = 'supplier_return')
          and not exists (select 1 from public.stock_movements where product_id = tests.id('cart') and type = 'cost_adjustment'),
  'TC-INV-95b: returning all stock removes exactly the remaining value: no zero-stock residue (C-25a) movement');

-- ===========================================================================
-- E. Known cost with stock value 0 (O1): E1 genuine zero cost, E2 value reset by C-25b
-- ===========================================================================
select ok(tests.pv(tests.id('pen')) = '5 / 0' and tests.pv(tests.id('milk')) = '4 / 0'
          and (select bool_and(cost_known) from public.products where id in (tests.id('pen'), tests.id('milk'))),
  'TC-INV-96a: (setup) E1 Promo pen 5 / 0 and E2 Milk 4 / 0 (after C-25b), both with a known cost');
set local role authenticated;
select lives_ok($q$insert into tests.results select 'e1', tests.rt(tests.id('biz_a'), tests.id('pen'), 2, 2000, 'refund_cash')$q$,
  'TC-INV-96a2 (O1, E1): a return of genuine zero-cost stock (known cost 0) is accepted');
select lives_ok($q$insert into tests.results select 'e2', tests.rt(tests.id('biz_a'), tests.id('milk'), 2, 2000, 'refund_cash')$q$,
  'TC-INV-96a3 (O1, E2): a return of stock reset to value 0 by C-25b is accepted');
insert into tests.results select 'e1z', tests.rt(tests.id('biz_a'), tests.id('pen'), 1, 0, 'refund_momo');
reset role;
select ok(tests.r('e1') @> '{"value_removed":0,"credit_amount":2000,"difference":2000,"cost_impact":-2000,"stock_qty":3,"stock_value":0}'
          and tests.r('e1') -> 'attention_item_id' <> 'null'::jsonb,
  'TC-INV-96b (O1, E1): genuine zero-cost stock passes: V = 0, D = +2000 (cost -2000), item raised, stock 3 / 0');
select ok(tests.r('e2') @> '{"value_removed":0,"credit_amount":2000,"difference":2000,"cost_impact":-2000,"stock_qty":2,"stock_value":0}'
          and tests.r('e2') -> 'attention_item_id' <> 'null'::jsonb,
  'TC-INV-96c (O1, E2): stock reset to 0 by C-25b passes: V = 0, D = +2000, item raised, stock 2 / 0');
select ok((select bool_and(qty_change < 0 and value = 0 and unit_cost = 0) and count(*) = 3 from public.stock_movements
           where id in (select (r ->> 'movement_id')::uuid from tests.results where k in ('e1','e2','e1z'))),
  'TC-INV-96d (O1): each is a quantity-only movement (value 0, unit cost 0)');
select ok(tests.r('e1z') @> '{"value_removed":0,"credit_amount":0,"difference":0}' and tests.r('e1z') -> 'attention_item_id' = 'null'::jsonb,
  'TC-INV-96e (O1, R7): a zero credit on zero-value stock: D = 0, no item');
select ok(not exists (select 1 from public.stock_movements where product_id = tests.id('pen') and type = 'cost_adjustment')
          and (select count(*) = 1 from public.stock_movements where product_id = tests.id('milk') and type = 'cost_adjustment')
          and (select count(*) = 3 from public.stock_movements where product_id in (tests.id('pen'), tests.id('milk')) and type = 'supplier_return')
          and tests.pv(tests.id('pen')) = '2 / 0',
  'TC-INV-96f (O1): neither case wrote a cost adjustment or any second stock-value movement (one return movement each)');
-- E2 safeguards
select is((select to_jsonb(m) from public.stock_movements m where m.id = (select (c25b ->> 'id')::uuid from e2_before)),
          (select c25b from e2_before),
  'TC-INV-96g (E2): the original C-25b correction movement is unchanged');
select ok((select count(*) = 1 from public.stock_movements where product_id = tests.id('milk') and type = 'cost_adjustment')
          and (select c25b ->> 'reason' = 'negative_value_correction' and (c25b ->> 'value')::bigint = 1000 from e2_before),
  'TC-INV-96h (E2): Milk still has exactly one cost adjustment: the C-25b correction (+1000)');
select is((select to_jsonb(a) from public.attention_items a where a.type = 'cost_check' and a.entity_id = tests.id('milk')),
          (select check_item from e2_before),
  'TC-INV-96i (E2): the "Cost check needed" item is neither resolved nor changed by the return');
select is((select count(*)::int from public.attention_items where type = 'cost_check' and entity_id = tests.id('milk')), 1,
  'TC-INV-96j (E2): and it is not duplicated');
select ok((select count(*) = 1 from public.supplier_returns where product_id = tests.id('milk'))
          and (select count(*) = 1 from public.attention_items where entity = 'supplier_return'
               and entity_id = (tests.r('e2') ->> 'return_id')::uuid)
          and (select count(*) = 1 from public.attention_items where (message_data ->> 'product_id')::uuid = tests.id('milk') and type = 'cost_adjustment'),
  'TC-INV-96k (E2): the supplier-return difference is recorded exactly once (one return row, one C-25c item)');
-- No duplicate financial recognition: each cost-impact source for Milk is counted once and only once.
-- Model of the planned report calculation (plan §3.3–§3.4; reports come in a later stage):
--   movement-based cost adjustments (stock_movements.type = cost_adjustment)  +  supplier-return
--   differences (supplier_returns: value_removed - credit_amount). The return movement itself is a
--   stock outflow at V, not a cost adjustment.
select is((select jsonb_agg(src order by src) from (
             select 'movement:' || m.reason as src from public.stock_movements m
             where m.product_id = tests.id('milk') and m.type = 'cost_adjustment'
             union all
             select 'return:' || (r.value_removed - r.credit_amount) from public.supplier_returns r
             where r.product_id = tests.id('milk')) x),
          '["movement:negative_value_correction", "return:-2000"]'::jsonb,
  'TC-INV-96l (E2): exactly two cost-impact records for Milk: the C-25b correction and the return difference (cost impact -2000), nothing else');
select ok((select value = 0 from public.stock_movements where id = (tests.r('e2') ->> 'movement_id')::uuid)
          and tests.pv(tests.id('milk')) = '2 / 0'
          and (select sum(value) = 0 from public.stock_movements where product_id = tests.id('milk')),
  'TC-INV-96m (E2): stock value is the sum of its movements (4000 - 5000 + 1000 + 0 = 0): the return moved no value');

-- ===========================================================================
-- Unknown cost (Q1), archived (R6), deleted, purchase rules (R4), stock (R2)
-- ===========================================================================
set local role authenticated;
select throws_ok($q$select tests.rt(tests.id('biz_a'), tests.id('unknown'), 1, 500, 'refund_cash')$q$, '22023', 'set_cost_first',
  'TC-INV-97a (Q1): a product with an unknown cost is refused');
select public.set_cost(gen_random_uuid(), tests.id('biz_a'), tests.id('unknown'), 1000, 'First invoice found');
insert into tests.results select 'q1', tests.rt(tests.id('biz_a'), tests.id('unknown'), 1, 1000, 'refund_cash');
insert into tests.results select 'arch', tests.rt(tests.id('biz_a'), tests.id('arch'), 1, 50, 'refund_momo');
select throws_ok($q$select tests.rt(tests.id('biz_a'), tests.id('gone'), 1, 50, 'refund_cash')$q$, 'P0002', 'product_not_found',
  'TC-INV-97b: a deleted product is not found');
select throws_ok($q$select tests.rt(tests.id('biz_a'), tests.id('sard'), 1, 100, 'reduce_unpaid', tests.id('p_milo'))$q$, '22023', 'purchase_product_mismatch',
  'TC-INV-97c (R4): a purchase of another product is refused (credit)');
select throws_ok($q$select tests.rt(tests.id('biz_a'), tests.id('sard'), 1, 100, 'refund_cash', tests.id('p_milo'))$q$, '22023', 'purchase_product_mismatch',
  'TC-INV-97d (R4): a purchase of another product is refused (refund)');
select throws_ok($q$select tests.rt(tests.id('biz_a'), tests.id('sard'), 1, 100, 'refund_cash', tests.id('p_a2'))$q$, 'P0002', 'purchase_not_found',
  'TC-INV-97e (R4): a purchase of another shop is not found');
select throws_ok($q$select tests.rt(tests.id('biz_a'), tests.id('sard'), 1, 100, 'reduce_unpaid', gen_random_uuid())$q$, 'P0002', 'purchase_not_found',
  'TC-INV-97f: an unknown purchase is not found');
select throws_ok($q$select tests.rt(tests.id('biz_a'), tests.id('sard'), 8, 100, 'refund_cash')$q$, '22023', 'insufficient_stock',
  'TC-INV-97g (R2): returning 8 with 7 in stock is refused');
select throws_ok($q$select tests.rt(tests.id('biz_a'), tests.id('cart'), 1, 0, 'refund_cash')$q$, '22023', 'insufficient_stock',
  'TC-INV-97h (R2): nothing can be returned at 0 stock');
insert into tests.results select 'r5', tests.rt(tests.id('biz_a'), tests.id('sard'), 7, 10500, 'refund_cash', tests.id('p_sard'));
reset role;
select ok(tests.r('q1') @> '{"value_removed":1000,"difference":0}',
  'TC-INV-97i (Q1): after the cost is set (T4), the return is accepted at the new average');
select ok(tests.r('arch') @> '{"value_removed":50}' and (select not active from public.products where id = tests.id('arch')),
  'TC-INV-97j (R6): an archived product can be returned and stays archived');
select ok(tests.r('r5') @> '{"qty":7,"value_removed":10500,"stock_qty":0,"stock_value":0}',
  'TC-INV-97k (R5): against a 1-unit purchase, all 7 in stock can be returned: only the stock limits it');

-- Validation
set local role authenticated;
select throws_ok($q$select tests.rt(tests.id('biz_a'), tests.id('milo'), 0, 100, 'refund_cash')$q$, '22023', 'invalid_qty', 'TC-INV-97l: quantity 0 is refused');
select throws_ok($q$select tests.rt(tests.id('biz_a'), tests.id('milo'), null, 100, 'refund_cash')$q$, '22023', 'invalid_qty', 'TC-INV-97m: a missing quantity is refused');
select throws_ok($q$select tests.rt(tests.id('biz_a'), tests.id('milo'), 100001, 100, 'refund_cash')$q$, '22023', 'invalid_qty', 'TC-INV-97n (D6): more than 100,000 is refused');
select throws_ok($q$select tests.rt(tests.id('biz_a'), tests.id('milo'), 1, -1, 'refund_cash')$q$, '22023', 'invalid_credit_amount', 'TC-INV-97o: a negative credit is refused');
select throws_ok($q$select tests.rt(tests.id('biz_a'), tests.id('milo'), 1, null, 'refund_cash')$q$, '22023', 'invalid_credit_amount', 'TC-INV-97p: a missing credit is refused');
select throws_ok($q$select tests.rt(tests.id('biz_a'), tests.id('milo'), 1, 100000001, 'refund_cash')$q$, '22023', 'invalid_credit_amount', 'TC-INV-97q (D6): a credit above GH₵1,000,000 is refused');
select throws_ok($q$select tests.rt(tests.id('biz_a'), tests.id('milo'), 1, 100, 'cash')$q$, '22023', 'invalid_credit_type', 'TC-INV-97r: an unknown credit type is refused');
select throws_ok($q$select tests.rt(tests.id('biz_a'), tests.id('milo'), 1, 100, null)$q$, '22023', 'invalid_credit_type', 'TC-INV-97s: a missing credit type is refused');
select throws_ok($q$select tests.rt(tests.id('biz_a'), tests.id('milo'), 1, 100, 'refund_cash', null, '   ')$q$, '22023', 'reason_required', 'TC-INV-97t: a blank reason is refused');
select throws_ok($q$select tests.rt(tests.id('biz_a'), tests.id('milo'), 1, 100, 'refund_cash', null, null)$q$, '22023', 'reason_required', 'TC-INV-97u: a missing reason is refused');
select throws_ok(format('select tests.rt(tests.id(''biz_a''), tests.id(''milo''), 1, 100, ''refund_cash'', null, %L)', repeat('r', 301)),
  '22023', 'reason_too_long', 'TC-INV-97v: a reason over 300 characters is refused');
select throws_ok($q$select tests.rt(tests.id('biz_a'), tests.id('milo'), 1, 100, 'reduce_unpaid')$q$, '22023', 'purchase_required',
  'TC-INV-97w: a credit against the unpaid amount needs a purchase');
reset role;
select is(tests.pv(tests.id('milo')), '10 / 15000', 'TC-INV-97x: the refused attempts changed nothing');

-- ===========================================================================
-- Isolation and membership
-- ===========================================================================
select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select throws_ok($q$select tests.rt(tests.id('biz_a'), tests.id('milo'), 1, 100, 'refund_cash')$q$, '42501', 'not_a_member',
  'TC-INV-98a: owner B cannot return through shop A');
select throws_ok($q$select tests.rt(tests.id('biz_b'), tests.id('milo'), 1, 100, 'refund_cash')$q$, 'P0002', 'product_not_found',
  'TC-INV-98b: owner B cannot return shop A''s product by passing their own shop');
select throws_ok($q$select tests.rt(tests.id('biz_b'), tests.id('b_prod'), 1, 100, 'reduce_unpaid', tests.id('p_milo'))$q$, 'P0002', 'purchase_not_found',
  'TC-INV-98c: owner B cannot credit shop A''s purchase');
reset role;
update public.business_members set active = false where business_id = tests.id('biz_b');
select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select throws_ok($q$select tests.rt(tests.id('biz_b'), tests.id('b_prod'), 1, 100, 'refund_cash')$q$, '42501', 'not_a_member',
  'TC-INV-98d: an inactive membership cannot return');
reset role;
update public.business_members set active = true where business_id = tests.id('biz_b');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_ok($q$select tests.rt(tests.id('biz_a'), tests.id('milo'), 1, 100, 'refund_cash')$q$, '42501', 'not_authenticated',
  'TC-INV-98e: a call without a signed-in user is refused');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($q$select public.return_to_supplier(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), 1, 100, 'refund_cash', 'R')$q$, '42501', null,
  'TC-INV-98f: an anonymous caller cannot return');
reset role;
select ok(tests.pv(tests.id('milo')) = '10 / 15000' and tests.pv(tests.id('b_prod')) = '6 / 720'
          and tests.unpaid(tests.id('biz_a'), tests.id('p_milo')) = 11800,
  'TC-INV-98g: the refused attempts changed nothing in either shop');
select tests.as_user('00000000-0000-0000-0000-0000000000a1');

-- ===========================================================================
-- Idempotency and atomicity
-- ===========================================================================
set local role authenticated;
insert into tests.results select 'idem1', public.return_to_supplier('55555555-5555-5555-5555-555555555502', tests.id('biz_a'), tests.id('milo'),
  1, 1600, 'reduce_unpaid', 'Torn label', tests.id('p_milo'));
insert into tests.results select 'idem2', public.return_to_supplier('55555555-5555-5555-5555-555555555502', tests.id('biz_a'), tests.id('milo'),
  1, 1600, 'reduce_unpaid', 'Torn label', tests.id('p_milo'));
reset role;
select ok(tests.r('idem2') = tests.r('idem1') and tests.pv(tests.id('milo')) = '9 / 13500'
          and tests.unpaid(tests.id('biz_a'), tests.id('p_milo')) = 10200
          and (select count(*) = 1 from public.supplier_returns where id = (tests.r('idem1') ->> 'return_id')::uuid)
          and (select count(*) = 1 from public.audit_log where action = 'return_to_supplier' and entity_id = (tests.r('idem1') ->> 'return_id')::uuid),
  'TC-INV-99c: a replay while stock and credit room remain is applied once (stock 9 / 13500, owes 10200, one row, one audit entry)');
create temp table before_replay as select (select count(*) from public.supplier_returns) as rets, (select count(*) from public.stock_movements) as mv,
  (select count(*) from public.audit_log) as audit, (select count(*) from public.attention_items) as items;
grant select on before_replay to authenticated;
set local role authenticated;
insert into tests.results select 'a_again', public.return_to_supplier('55555555-5555-5555-5555-555555555501', tests.id('biz_a'), tests.id('sard'),
  3, 4200, 'refund_cash', '  Dented tins  ');
reset role;
select is(tests.r('a_again'), tests.r('a'), 'TC-INV-99a: repeating the first return returns its original result');
select ok((select rets = (select count(*) from public.supplier_returns) and mv = (select count(*) from public.stock_movements)
                  and audit = (select count(*) from public.audit_log) and items = (select count(*) from public.attention_items) from before_replay),
  'TC-INV-99b: the repeat wrote nothing (Sardine is at 0 now, so a second return would have been refused)');
set local role authenticated;
select throws_ok($q$select public.return_to_supplier('55555555-5555-5555-5555-555555555501', tests.id('biz_a2'), tests.id('a2_prod'), 1, 100, 'refund_cash', 'R')$q$,
  '22023', 'request_id_reused', 'TC-INV-99d: the same request ID for the owner''s other shop is refused');
select throws_ok($q$select public.adjust_stock('55555555-5555-5555-5555-555555555501', tests.id('biz_a'), tests.id('milo'), 'damaged', null, -1)$q$,
  '22023', 'request_id_reused', 'TC-INV-99e: the same request ID for a different function is refused');
select throws_ok($q$select public.return_to_supplier('55555555-5555-5555-5555-555555555503', tests.id('biz_a'), tests.id('milo'), 50, 100, 'refund_cash', 'R')$q$,
  '22023', 'insufficient_stock', 'TC-INV-99f: (setup) a refused return');
reset role;
select ok(not exists (select 1 from public.request_log where request_id = '55555555-5555-5555-5555-555555555503')
          and tests.pv(tests.id('milo')) = '9 / 13500',
  'TC-INV-99g: a refused return writes nothing at all (no claim)');

-- ===========================================================================
-- Append-only records, audit, history, conservation
-- ===========================================================================
select throws_ok(format('update public.supplier_returns set credit_amount = 1 where id = %L', tests.id('ret_a')), 'P0001', null,
  'TC-INV-99h: a recorded return cannot be changed');
select throws_ok(format('delete from public.supplier_returns where id = %L', tests.id('ret_a')), 'P0001', null,
  'TC-INV-99i: a recorded return cannot be deleted');
select ok((select count(*) = (select count(*) from public.supplier_returns where business_id = tests.id('biz_a'))
           from public.stock_movements where business_id = tests.id('biz_a') and type = 'supplier_return')
          and (select bool_and(m.value = -r.value_removed and m.qty_change = -r.qty and m.product_id = r.product_id)
               from public.supplier_returns r join public.stock_movements m on m.id = r.movement_id
               where r.business_id = tests.id('biz_a')),
  'TC-INV-99j (R1): every return has exactly one movement, and its value is exactly -V');
select is((select count(*)::int from public.stock_movements where reason = 'supplier_return_difference'
             and business_id in (tests.id('biz_a'), tests.id('biz_a2'), tests.id('biz_b'))), 0,
  'TC-COST-20 (R1): no movement is ever written for a supplier-return difference');
select is((select count(*)::int from public.stock_movements where type = 'cost_adjustment'
             and business_id in (tests.id('biz_a'), tests.id('biz_a2'), tests.id('biz_b'))), (select cost_adj::int from before_all),
  'TC-COST-20 (R1): returns added no cost-adjustment movement anywhere');
select is((select count(*)::int from public.audit_log where action = 'return_to_supplier' and business_id = tests.id('biz_a')),
          (select count(*)::int from public.supplier_returns where business_id = tests.id('biz_a')),
  'TC-INV-99k: every return has exactly one audit entry');
select is((select count(*)::int from public.attention_items where entity = 'supplier_return' and business_id = tests.id('biz_a')),
          (select count(*)::int from public.supplier_returns where business_id = tests.id('biz_a') and abs(credit_amount - value_removed) >= 10),
  'TC-INV-99l (R8): exactly one item per return with abs(D) >= 10, none for the others');
select ok(tests.pool_conserved(tests.id('biz_a')) and tests.pool_conserved(tests.id('biz_a2')) and tests.pool_conserved(tests.id('biz_b')),
  'TC-COST-20 (returns): stock pools equal their movements, one history row each, in every shop');

select * from finish();
rollback;
