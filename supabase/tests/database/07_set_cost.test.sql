-- Stage 1C, task T4: public.set_cost, the owner's "Correct cost price" (04 §2.1; 05 C-27, C-27a,
-- C-29, C-57; 09 §3). stock_value := stock_qty × new cost; the difference is ONE value_correction
-- movement with ONE history row (cause set_cost) and an audit entry; past sales never change; it is
-- an information line, not profit (no cost adjustment, no Needs attention item).
-- Owner decisions (T4): A zero stock refused; B negative stock refused; C same cost = no change
-- (no movement, history or audit); D reason required, trimmed, 1..300 characters; E archived
-- products allowed when stock is positive.
-- Fixtures are fictitious and everything is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(61);

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
-- Counts read as the superuser (request_log and every shop's rows)
create function tests.n(p_sql text) returns integer language plpgsql security definer as $$
declare v integer; begin execute p_sql into v; return v; end $$;
grant execute on function tests.n(text) to authenticated;
-- Conservation (05 §3.2) and history integrity for every product of a business
create function tests.pool_conserved(p_business uuid) returns boolean language sql stable security definer as $$
  select coalesce(bool_and(
           p.stock_qty = coalesce((select sum(m.qty_change) from public.stock_movements m where m.product_id = p.id), 0)
       and p.stock_value = coalesce((select sum(m.value) from public.stock_movements m where m.product_id = p.id), 0)
       and (select count(*) from public.stock_movements m where m.product_id = p.id)
           = (select count(*) from public.product_cost_history h where h.product_id = p.id)
       and (not exists (select 1 from public.stock_movements m where m.product_id = p.id)
            or exists (select 1 from (select h.stock_qty_after, h.stock_value_after from public.product_cost_history h
                                      where h.product_id = p.id order by h.effective_at desc limit 1) last
                       where last.stock_qty_after = p.stock_qty and last.stock_value_after = p.stock_value))), true)
  from public.products p where p.business_id = p_business
$$;
grant execute on function tests.pool_conserved(uuid) to authenticated;

-- set_cost with a fresh request ID
create function tests.sc(p_biz uuid, p_product uuid, p_cost bigint, p_reason text) returns jsonb language sql as $$
  select public.set_cost(gen_random_uuid(), p_biz, p_product, p_cost, p_reason)
$$;
grant execute on function tests.sc(uuid, uuid, bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures: owner A with shops A and A2, owner B with shop B
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner.a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner.b@example.test');

select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
insert into tests.ids select 'biz_b', (public.create_business(gen_random_uuid(), 'Kofi Test Mart', 'provision', 'Kumasi', null) ->> 'business_id')::uuid;
insert into tests.ids select 'b_prod', (public.create_product(gen_random_uuid(), tests.id('biz_b'), 'B milo', 160, p_cost_price => 120, p_opening_stock => 6) ->> 'product_id')::uuid;
reset role;

select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
insert into tests.ids select 'biz_a',  (public.create_business(gen_random_uuid(), 'Ama Test Provisions', 'provision', 'Accra', null) ->> 'business_id')::uuid;
insert into tests.ids select 'biz_a2', (public.create_business(gen_random_uuid(), 'Ama Second Shop', 'minimart', 'Tema', null) ->> 'business_id')::uuid;
insert into tests.ids select 'dev_a', (public.register_device(gen_random_uuid(), tests.id('biz_a'), 'Phone') ->> 'device_id')::uuid;
insert into tests.ids select 'milo',  (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Milo sachet', 150, p_cost_price => 110, p_opening_stock => 10) ->> 'product_id')::uuid;
insert into tests.ids select 'rice',  (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Rice 1kg', 1500, p_opening_stock => 4) ->> 'product_id')::uuid;
insert into tests.ids select 'free',  (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Free sample', 100, p_opening_stock => 5) ->> 'product_id')::uuid;
insert into tests.ids select 'gift',  (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Gift card holder', 100, p_cost_price => 10, p_opening_stock => 2) ->> 'product_id')::uuid;
insert into tests.ids select 'thirds',(public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Biscuit pack', 500, p_cost_price => 333, p_opening_stock => 2) ->> 'product_id')::uuid;
insert into tests.ids select 'soap',  (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Soap bar', 500) ->> 'product_id')::uuid;
insert into tests.ids select 'neg',   (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Sugar cube', 300, p_cost_price => 100, p_opening_stock => 2) ->> 'product_id')::uuid;
insert into tests.ids select 'arch',  (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Old torch', 2500, p_cost_price => 50, p_opening_stock => 3) ->> 'product_id')::uuid;
insert into tests.ids select 'arch0', (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Old radio', 9000) ->> 'product_id')::uuid;
insert into tests.ids select 'big',   (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Bulk item', 100, p_cost_price => 1, p_opening_stock => 100000) ->> 'product_id')::uuid;
insert into tests.ids select 'a2_prod', (public.create_product(gen_random_uuid(), tests.id('biz_a2'), 'Second shop oil', 900, p_cost_price => 700, p_opening_stock => 3) ->> 'product_id')::uuid;
select public.set_product_archived(gen_random_uuid(), tests.id('biz_a'), tests.id('arch'), true);
select public.set_product_archived(gen_random_uuid(), tests.id('biz_a'), tests.id('arch0'), true);
reset role;

-- Thirds: a fractional average arising the normal way. Opening 2 at 333 (value 666), then a restock
-- of 1 unit costing 334 (fixture purchase; restock() itself comes in T5), recorded through
-- apply_movement so the movement and its history row stay consistent: 3 / 1000, average 333.33...
insert into tests.ids values ('pur_thirds', 'c0000000-0000-0000-0000-0000000000f1');
insert into public.purchases (id, business_id, product_id, qty, purchase_cost, purchased_on)
values (tests.id('pur_thirds'), tests.id('biz_a'), tests.id('thirds'), 1, 334, current_date);
select private.apply_movement(tests.id('biz_a'), tests.id('thirds'), 'restock', 1, 334,
  p_unit_cost => 334, p_purchase_id => tests.id('pur_thirds'), p_marks_cost_known => true);

-- Negative stock (as late sales would leave it): 2 / 200, then -5 / -500 -> -3 / -300
select private.apply_movement(tests.id('biz_a'), tests.id('neg'), 'adjustment', -5, -500, p_reason => 'other');

-- A recorded fictitious sale of 2 Milo at the old cost 110 (sales arrive in Stage 1D; fixture only)
insert into tests.ids values ('sale1', 'd0000000-0000-0000-0000-000000000001');
insert into public.sales (id, business_id, device_id, receipt_no, subtotal, total, payment_method, mode,
                          occurred_at_device, occurred_at, time_confidence, cost_basis, payload_version)
values (tests.id('sale1'), tests.id('biz_a'), tests.id('dev_a'), 'A-000001', 300, 300, 'cash', 'online',
        now(), now(), 'high', 'occurred_at', 1);
insert into public.sale_items (business_id, sale_id, product_id, qty, unit_price, line_total, unit_cost, line_cost)
values (tests.id('biz_a'), tests.id('sale1'), tests.id('milo'), 2, 150, 300, 110, 220);
select private.apply_movement(tests.id('biz_a'), tests.id('milo'), 'sale', -2, -220, p_sale_id => tests.id('sale1'));
-- Milo is now 8 / 880 (average 110)

create temp table baseline as select
  (select count(*) from public.stock_movements where type = 'cost_adjustment') as cost_adj,
  (select count(*) from public.attention_items) as attention;

-- ===========================================================================
-- Definition and privileges
-- ===========================================================================
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc
           where oid = 'public.set_cost(uuid,uuid,uuid,bigint,text)'::regprocedure),
  'TC-INV-50a: set_cost exists, SECURITY DEFINER with explicit checks and an empty search_path');
select ok(has_function_privilege('authenticated', 'public.set_cost(uuid,uuid,uuid,bigint,text)', 'execute')
          and not has_function_privilege('anon', 'public.set_cost(uuid,uuid,uuid,bigint,text)', 'execute'),
  'TC-INV-50b: signed-in users can call it; anonymous callers cannot');
select ok(not exists (select 1 from information_schema.routine_privileges
                      where routine_schema = 'public' and routine_name = 'set_cost' and grantee = 'PUBLIC'),
  'TC-INV-50c: it is not granted to PUBLIC');
select ok(not has_table_privilege('authenticated', 'public.stock_movements', 'insert')
          and not has_table_privilege('authenticated', 'public.product_cost_history', 'insert')
          and not has_table_privilege('authenticated', 'public.products', 'update'),
  'TC-INV-50d: the app still cannot write movements, history or product values directly');

-- ===========================================================================
-- Positive stock: correction up and down (C-27); past sales unchanged (C-29)
-- ===========================================================================
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
insert into tests.results select 'up', public.set_cost('77777777-7777-7777-7777-777777777701', tests.id('biz_a'), tests.id('milo'), 125, '  Supplier invoice re-checked  ');
insert into tests.ids select 'mv_up', (tests.r('up') ->> 'movement_id')::uuid;
select ok((select stock_qty = 8 and stock_value = 1000 and cost_known and active from public.products where id = tests.id('milo')),
  'TC-COST-08a: 8 units at the new cost 125 gives stock value 1000 (stock_qty x new cost); quantity unchanged');
select is(tests.r('up') - 'movement_id',
  jsonb_build_object('product_id', tests.id('milo'), 'changed', true, 'value_change', 120, 'stock_value', 1000),
  'TC-COST-08b: the result reports the change (+120) and the new stock value');
select ok((select type = 'value_correction' and qty_change = 0 and value = 120 and unit_cost = 125 and reason is null
                  and note = 'Supplier invoice re-checked' and user_id = '00000000-0000-0000-0000-0000000000a1'
           from public.stock_movements where id = tests.id('mv_up')),
  'TC-COST-08c: one value_correction movement: quantity 0, value +120, unit cost 125, reason trimmed into the note, signed-in user');
select ok((select count(*) = 1 and bool_and(cause = 'set_cost' and stock_qty_after = 8 and stock_value_after = 1000 and avg_cost = 125.0000)
           from public.product_cost_history where movement_id = tests.id('mv_up')),
  'TC-COST-04 (set_cost): exactly one history row, cause set_cost, average 125.0000');
select ok((select count(*) = 1 and bool_and(entity = 'product' and reason = 'Supplier invoice re-checked'
                  and (before ->> 'stock_value')::bigint = 880 and (after ->> 'stock_value')::bigint = 1000
                  and (before ->> 'average_cost')::numeric = 110 and (after ->> 'unit_cost')::bigint = 125
                  and user_id = '00000000-0000-0000-0000-0000000000a1')
           from public.audit_log where action = 'set_cost' and entity_id = tests.id('milo')),
  'TC-COST-08d: one audit entry with the old and new value and average, and the reason');
select ok((select unit_cost = 110 and line_cost = 220 from public.sale_items where sale_id = tests.id('sale1')),
  'TC-COST-08e (C-29): the earlier sale keeps its cost (unit cost 110, line cost 220)');
select ok((select value = -220 and qty_change = -2 from public.stock_movements where sale_id = tests.id('sale1')),
  'TC-COST-08f (C-29): the earlier sale''s stock movement is unchanged');

insert into tests.results select 'down', tests.sc(tests.id('biz_a'), tests.id('milo'), 100, 'Price dropped at the market');
select ok((select stock_value = 800 from public.products where id = tests.id('milo'))
          and (tests.r('down') ->> 'value_change')::bigint = -200,
  'TC-COST-08g: a lower cost reduces the value (8 x 100 = 800, change -200)');
select ok((select bool_and(type = 'value_correction') and count(*) = 2
           from public.stock_movements where product_id = tests.id('milo') and type not in ('opening', 'sale')),
  'TC-COST-08h: each correction is one value_correction movement, nothing else');

-- Not profit: no cost adjustment, no Needs attention item (C-57: information line only)
reset role;
select ok((select cost_adj = (select count(*) from public.stock_movements where type = 'cost_adjustment')
              and attention = (select count(*) from public.attention_items) from baseline),
  'TC-COST-08i (C-57): corrections create no cost adjustment and no Needs attention item');
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;

-- An average that is not a whole number is corrected exactly
insert into tests.results select 'thirds', tests.sc(tests.id('biz_a'), tests.id('thirds'), 333, 'Round to the invoice unit cost');
select ok((select stock_qty = 3 and stock_value = 999 from public.products where id = tests.id('thirds'))
          and (tests.r('thirds') ->> 'value_change')::bigint = -1
          and (select (before ->> 'average_cost')::numeric = 333.3333 from public.audit_log
               where action = 'set_cost' and entity_id = tests.id('thirds')),
  'TC-INV-51a: average 333.33... (3 / 1000) corrected to 333 gives 3 x 333 = 999 (change -1), exact to the pesewa; the audit shows the old average 333.3333');

-- ===========================================================================
-- First cost for a product with unknown cost (C-27a)
-- ===========================================================================
insert into tests.results select 'first', tests.sc(tests.id('biz_a'), tests.id('rice'), 300, 'First cost from receipt');
select ok((select stock_qty = 4 and stock_value = 1200 and cost_known from public.products where id = tests.id('rice')),
  'TC-COST-05a (C-27a): first cost 300 for 4 units with unknown cost: value 1200, cost now known');
select ok((select h.cause = 'set_cost' and h.avg_cost = 300.0000 from public.product_cost_history h
           where h.movement_id = (tests.r('first') ->> 'movement_id')::uuid),
  'TC-COST-05b (C-27a): the history now has the average 300.0000 (it had none before)');
select ok((select (before ->> 'cost_known')::boolean = false and before ->> 'average_cost' is null and (after ->> 'cost_known')::boolean
           from public.audit_log where action = 'set_cost' and entity_id = tests.id('rice')),
  'TC-COST-05c (C-27a): the audit entry shows the cost was unknown before');
select throws_ok($q$select tests.sc(tests.id('biz_a'), tests.id('free'), 0, 'Free goods')$q$,
  '22023', 'zero_cost_for_unknown_cost',
  'TC-INV-51b: a first cost of 0 for an unknown-cost product is refused (it would need an empty movement; see the T4 report)');
select ok((select not cost_known and stock_value = 0 from public.products where id = tests.id('free')),
  'TC-INV-51c: the refused product is unchanged');

-- A known cost may be corrected to 0 (value removed exactly)
insert into tests.results select 'gift0', tests.sc(tests.id('biz_a'), tests.id('gift'), 0, 'Received free of charge');
select ok((select stock_value = 0 and cost_known from public.products where id = tests.id('gift'))
          and (tests.r('gift0') ->> 'value_change')::bigint = -20
          and (select avg_cost = 0 from public.product_cost_history where movement_id = (tests.r('gift0') ->> 'movement_id')::uuid),
  'TC-INV-51d: a known cost corrected to 0 removes the value exactly (2 x 10 -> 0, change -20), average 0.0000');

-- ===========================================================================
-- Owner decisions A, B, C, E
-- ===========================================================================
select throws_ok($q$select tests.sc(tests.id('biz_a'), tests.id('soap'), 200, 'Cost check')$q$,
  '22023', 'zero_stock', 'TC-INV-52a (A): a correction with zero stock is refused');
select throws_ok($q$select tests.sc(tests.id('biz_a'), tests.id('neg'), 200, 'Cost check')$q$,
  '22023', 'negative_stock', 'TC-INV-52b (B): a correction with negative stock is refused');
select ok((select stock_qty = -3 and stock_value = -300 from public.products where id = tests.id('neg'))
          and (select count(*) = 2 from public.stock_movements where product_id = tests.id('neg')),
  'TC-INV-52c (B): the negative-stock product is unchanged (no movement added)');

reset role;
create temp table before_same as select
  (select count(*) from public.stock_movements where product_id = tests.id('milo')) as mv,
  (select count(*) from public.product_cost_history where product_id = tests.id('milo')) as hist,
  (select count(*) from public.audit_log where entity_id = tests.id('milo') and action = 'set_cost') as audit;
grant select on before_same to authenticated;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
insert into tests.results select 'same', tests.sc(tests.id('biz_a'), tests.id('milo'), 100, 'No real change');
select is(tests.r('same'), jsonb_build_object('product_id', tests.id('milo'), 'changed', false, 'value_change', 0, 'stock_value', 800),
  'TC-INV-52d (C): the same cost returns "no change"');
reset role;
select ok((select mv = (select count(*) from public.stock_movements where product_id = tests.id('milo'))
              and hist = (select count(*) from public.product_cost_history where product_id = tests.id('milo'))
              and audit = (select count(*) from public.audit_log where entity_id = tests.id('milo') and action = 'set_cost')
           from before_same),
  'TC-INV-52e (C): no movement, no history row and no audit entry for an unchanged cost');
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;

insert into tests.results select 'arch', tests.sc(tests.id('biz_a'), tests.id('arch'), 60, 'Stock count valuation');
select ok((select not active and stock_qty = 3 and stock_value = 180 from public.products where id = tests.id('arch'))
          and (tests.r('arch') ->> 'changed')::boolean,
  'TC-INV-52f (E): an archived product with positive stock can be corrected (3 x 60 = 180) and stays archived');
select ok((select count(*) = 1 from public.product_cost_history where movement_id = (tests.r('arch') ->> 'movement_id')::uuid)
          and (select count(*) = 1 from public.audit_log where action = 'set_cost' and entity_id = tests.id('arch')),
  'TC-INV-52g (E): the archived product''s correction has its history row and audit entry');
select throws_ok($q$select tests.sc(tests.id('biz_a'), tests.id('arch0'), 60, 'Valuation')$q$,
  '22023', 'zero_stock', 'TC-INV-52h (A, E): an archived product with zero stock is still refused');

-- ===========================================================================
-- Reason (D) and cost validation
-- ===========================================================================
select throws_ok($q$select tests.sc(tests.id('biz_a'), tests.id('milo'), 101, null)$q$, '22023', 'reason_required', 'TC-INV-53a (D): a missing reason is refused');
select throws_ok($q$select tests.sc(tests.id('biz_a'), tests.id('milo'), 101, '   ')$q$, '22023', 'reason_required', 'TC-INV-53b (D): a blank reason is refused');
select throws_ok(format('select tests.sc(tests.id(''biz_a''), tests.id(''milo''), 101, %L)', repeat('r', 301)), '22023', 'reason_too_long',
  'TC-INV-53c (D): a reason over 300 characters is refused');
insert into tests.results select 'r300', tests.sc(tests.id('biz_a'), tests.id('milo'), 102, '  ' || repeat('s', 300) || '  ');
select ok((select char_length(note) = 300 from public.stock_movements where id = (tests.r('r300') ->> 'movement_id')::uuid)
          and exists (select 1 from public.audit_log where action = 'set_cost' and entity_id = tests.id('milo')
                        and reason = repeat('s', 300)),
  'TC-INV-53d (D): a reason of exactly 300 characters (after trimming) is accepted and stored trimmed');
select throws_ok($q$select tests.sc(tests.id('biz_a'), tests.id('milo'), null, 'Reason')$q$, '22023', 'invalid_cost_price', 'TC-INV-53e: a missing cost is refused');
select throws_ok($q$select tests.sc(tests.id('biz_a'), tests.id('milo'), -1, 'Reason')$q$, '22023', 'invalid_cost_price', 'TC-INV-53f: a negative cost is refused');
select throws_ok($q$select tests.sc(tests.id('biz_a'), tests.id('milo'), 100000001, 'Reason')$q$, '22023', 'invalid_cost_price',
  'TC-INV-53g (D6): a cost above GH₵ 1,000,000 is refused');
insert into tests.results select 'big', tests.sc(tests.id('biz_a'), tests.id('big'), 100000000, 'Valuation at the cap');
select ok((select stock_value = 10000000000000 from public.products where id = tests.id('big'))
          and (tests.r('big') ->> 'value_change')::bigint = 9999999900000
          and (select avg_cost = 100000000.0000 from public.product_cost_history where movement_id = (tests.r('big') ->> 'movement_id')::uuid),
  'TC-INV-53h: 100,000 units at GH₵ 1,000,000 are valued exactly (10^13 pesewas), with no blanket value cap');

-- ===========================================================================
-- Isolation and membership
-- ===========================================================================
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select throws_ok($q$select tests.sc(tests.id('biz_a'), tests.id('milo'), 1, 'Hack')$q$, '42501', 'not_a_member',
  'TC-INV-54a: owner B cannot correct a cost through shop A');
select throws_ok($q$select tests.sc(tests.id('biz_b'), tests.id('milo'), 1, 'Hack')$q$, 'P0002', 'product_not_found',
  'TC-INV-54b: owner B cannot correct shop A''s product by passing their own shop');
select throws_ok($q$select tests.sc(tests.id('biz_b'), gen_random_uuid(), 1, 'Hack')$q$, 'P0002', 'product_not_found',
  'TC-INV-54c: an unknown product is refused the same way');
reset role;
select ok((select stock_value = 816 from public.products where id = tests.id('milo')),
  'TC-INV-54d: shop A''s product is unchanged by owner B''s attempts (8 x 102 = 816)');

update public.business_members set active = false where business_id = tests.id('biz_b');
select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select throws_ok($q$select tests.sc(tests.id('biz_b'), tests.id('b_prod'), 130, 'Reason')$q$, '42501', 'not_a_member',
  'TC-INV-54e: an inactive membership cannot correct costs');
reset role;
update public.business_members set active = true where business_id = tests.id('biz_b');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_ok($q$select tests.sc(tests.id('biz_a'), tests.id('milo'), 101, 'Reason')$q$, '42501', 'not_authenticated',
  'TC-INV-54f: a call without a signed-in user is refused');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($q$select public.set_cost(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), 101, 'Reason')$q$, '42501', null,
  'TC-INV-54g: an anonymous caller cannot call set_cost');
reset role;

-- A deleted product (deleted_at set; not used by the app in 1C) is not found
update public.products set deleted_at = now() where id = tests.id('gift');
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select throws_ok($q$select tests.sc(tests.id('biz_a'), tests.id('gift'), 5, 'Reason')$q$, 'P0002', 'product_not_found',
  'TC-INV-54h: a deleted product cannot be corrected');

-- ===========================================================================
-- Idempotency (business-scoped request IDs)
-- ===========================================================================
select is(public.set_cost('77777777-7777-7777-7777-777777777701', tests.id('biz_a'), tests.id('milo'), 125, 'Supplier invoice re-checked'),
  tests.r('up'), 'TC-INV-55a: repeating the first request returns its original result');
reset role;
select is(tests.n(format('select count(*) from public.stock_movements where product_id = %L and type = ''value_correction''', tests.id('milo'))), 3,
  'TC-INV-55b: the repeat wrote no extra movement (still 3 corrections: 125, 100, 102)');
select is((select stock_value from public.products where id = tests.id('milo')), 816::bigint,
  'TC-INV-55c: the repeat did not re-apply the old correction (value stays 816)');
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select throws_ok($q$select public.set_cost('77777777-7777-7777-7777-777777777701', tests.id('biz_a2'), tests.id('a2_prod'), 650, 'Reason')$q$,
  '22023', 'request_id_reused', 'TC-INV-55d: the same request ID for the owner''s other shop is refused');
select throws_ok($q$select public.update_product('77777777-7777-7777-7777-777777777701', tests.id('biz_a'), tests.id('milo'), 'X', 150, null, null, 5)$q$,
  '22023', 'request_id_reused', 'TC-INV-55e: the same request ID for a different function is refused');
reset role;
select ok((select stock_value = 2100 from public.products where id = tests.id('a2_prod')),
  'TC-INV-55f: the other shop''s product is unchanged');
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select throws_ok($q$select public.set_cost('77777777-7777-7777-7777-777777777702', tests.id('biz_a'), tests.id('milo'), -5, 'Reason')$q$,
  '22023', 'invalid_cost_price', 'TC-INV-55g: (setup) a refused request');
reset role;
select is(tests.n($q$select count(*) from public.request_log where request_id = '77777777-7777-7777-7777-777777777702'$q$), 0,
  'TC-INV-55h: the refused request left no claim behind');
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select ok((public.set_cost('77777777-7777-7777-7777-777777777702', tests.id('biz_a'), tests.id('milo'), 105, 'Retry after a mistake') ->> 'changed')::boolean,
  'TC-INV-55i: the same request ID then succeeds (the refused attempt was rolled back)');
reset role;

-- ===========================================================================
-- History integrity and conservation
-- ===========================================================================
select ok((select bool_and(effective_at > prev) from (
             select effective_at, lag(effective_at) over (order by effective_at) as prev
             from public.product_cost_history where product_id = tests.id('milo')) x where prev is not null),
  'TC-INV-56a: Milo''s history rows are strictly ordered in time');
select ok((select h.stock_qty_after = p.stock_qty and h.stock_value_after = p.stock_value and h.avg_cost = 105.0000
           from public.products p
           join lateral (select * from public.product_cost_history where product_id = p.id order by effective_at desc limit 1) h on true
           where p.id = tests.id('milo')),
  'TC-INV-56b: the latest history row matches the product (8 / 840, average 105.0000)');
select ok(tests.pool_conserved(tests.id('biz_a')),
  'TC-COST-20 (set_cost): conservation and one-history-row-per-movement hold for every product of shop A');
select ok(tests.pool_conserved(tests.id('biz_a2')) and tests.pool_conserved(tests.id('biz_b')),
  'TC-COST-20 (set_cost): and for the other shops');
select is((select count(*)::int from public.stock_movements where type = 'value_correction' and business_id = tests.id('biz_a')),
          (select count(*)::int from public.audit_log where action = 'set_cost' and business_id = tests.id('biz_a')),
  'TC-INV-56c: every value correction has exactly one audit entry, and every audit entry one correction');
select ok(not has_function_privilege('authenticated',
            'private.apply_movement(uuid,uuid,text,integer,bigint,text,numeric,uuid,uuid,text,boolean)', 'execute'),
  'TC-INV-56d: the T1 helpers remain internal');

-- T10 (I3, additive): stock integrity of every shop this file used: no discrepancy
reset role;
select is((select count(*)::int from tests.ids i cross join lateral private.stock_integrity(i.v) s where i.k like 'biz%'), 0,
  'TC-INV-123c (T10 I3): stock integrity: no discrepancy in any shop of this file');

select * from finish();
rollback;
