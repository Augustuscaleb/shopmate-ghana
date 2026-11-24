-- Stage 1C, task T5: public.restock (04 §2.2; 05 C-21, C-25, C-110 – C-112, C-122; 09 §3).
-- Full purchase cost enters stock value whatever is paid now; negative stock is revalued at this
-- purchase's unit cost FIRST (C-25), then the restock movement is added; one purchase row
-- (movement_id empty, D3), one history row per movement, one audit entry; atomic.
-- Owner decisions (T5): R1 total cost only; R2 units only; R3 date defaults to today (UTC), no
-- future dates, none before the shop was created; R4 archived refused; R5 zero cost accepted;
-- R6 positive stock with unknown cost refused (set_cost_first); R7 negative stock with unknown
-- cost is revalued (C-25). Fixtures are fictitious and everything is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(82);

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

-- restock with a fresh request ID: product, qty, total cost, paid now, paid from
create function tests.rs(p_biz uuid, p_product uuid, p_qty integer, p_cost bigint, p_paid bigint, p_from text) returns jsonb language sql as $$
  select public.restock(gen_random_uuid(), p_biz, p_product, p_qty, p_cost, p_paid, p_from)
$$;
grant execute on function tests.rs(uuid, uuid, integer, bigint, bigint, text) to authenticated;
-- a product with a given (possibly negative) stock, as late sales would leave it: opening stock,
-- then an adjustment through apply_movement (fixture only; adjust_stock comes in T6)
create function tests.mk(p_biz uuid, p_name text, p_open integer, p_cost bigint, p_take integer, p_take_value bigint) returns uuid
language plpgsql as $$
declare v uuid;
begin
  v := (public.create_product(gen_random_uuid(), p_biz, p_name, 100, p_cost_price => p_cost, p_opening_stock => p_open) ->> 'product_id')::uuid;
  if p_take <> 0 then
    perform private.apply_movement(p_biz, v, 'adjustment', -p_take, -p_take_value, p_reason => 'other');
  end if;
  return v;
end $$;

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
insert into tests.ids select 'milo',     (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Milo sachet', 150, p_cost_price => 1100, p_opening_stock => 10) ->> 'product_id')::uuid;
insert into tests.ids select 'empty',    (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'New item', 500) ->> 'product_id')::uuid;
insert into tests.ids select 'free',     (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Free sample', 100) ->> 'product_id')::uuid;
insert into tests.ids select 'unknownpos',(public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Rice 1kg', 1500, p_opening_stock => 4) ->> 'product_id')::uuid;
insert into tests.ids select 'arch',     (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Old torch', 2500, p_cost_price => 50, p_opening_stock => 3) ->> 'product_id')::uuid;
insert into tests.ids select 'gone',     (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Gone item', 2500, p_cost_price => 50, p_opening_stock => 3) ->> 'product_id')::uuid;
insert into tests.ids select 'big',      (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Bulk item', 100) ->> 'product_id')::uuid;
insert into tests.ids select 'dated',    (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Dated item', 100) ->> 'product_id')::uuid;
insert into tests.ids select 'a2_prod',  (public.create_product(gen_random_uuid(), tests.id('biz_a2'), 'Second shop oil', 900, p_cost_price => 700, p_opening_stock => 3) ->> 'product_id')::uuid;
select public.set_product_archived(gen_random_uuid(), tests.id('biz_a'), tests.id('arch'), true);
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
-- Negative stock fixtures (value as late sales at the average would leave it)
insert into tests.ids select 'neg',     tests.mk(tests.id('biz_a'), 'Sardine tin', 2, 1000, 4, 4000);      -- -2 / -2000
insert into tests.ids select 'frac',    tests.mk(tests.id('biz_a'), 'Biscuit pack', 1, 333, 2, 666);       -- -1 / -333
insert into tests.ids select 'tozero',  tests.mk(tests.id('biz_a'), 'Soap bar', 3, 1000, 6, 6000);         -- -3 / -3000
insert into tests.ids select 'still',   tests.mk(tests.id('biz_a'), 'Sugar cube', 5, 1000, 10, 10000);     -- -5 / -5000
insert into tests.ids select 'unkneg',  tests.mk(tests.id('biz_a'), 'Matches box', 2, null, 5, 0);        -- -3 / 0, cost unknown
insert into tests.ids select 'freeneg', tests.mk(tests.id('biz_a'), 'Promo pen', 1, 400, 3, 1200);        -- -2 / -800
update public.products set deleted_at = now() where id = tests.id('gone');
-- Shop A was created 30 days ago (so past purchase dates can be recorded)
update public.businesses set created_at = now() - interval '30 days' where id = tests.id('biz_a');

-- A recorded fictitious sale of Milo at cost 1100 (sales arrive in Stage 1D; fixture only)
insert into tests.ids values ('sale1', 'd0000000-0000-0000-0000-000000000005');
insert into public.sales (id, business_id, device_id, receipt_no, subtotal, total, payment_method, mode,
                          occurred_at_device, occurred_at, time_confidence, cost_basis, payload_version)
values (tests.id('sale1'), tests.id('biz_a'), tests.id('dev_a'), 'A-000001', 150, 150, 'cash', 'online', now(), now(), 'high', 'occurred_at', 1);
insert into public.sale_items (business_id, sale_id, product_id, qty, unit_price, line_total, unit_cost, line_cost)
values (tests.id('biz_a'), tests.id('sale1'), tests.id('milo'), 1, 150, 150, 1100, 1100);
select private.apply_movement(tests.id('biz_a'), tests.id('milo'), 'sale', -1, -1100, p_sale_id => tests.id('sale1'));
-- Milo is now 9 / 9900; restore it to 10 / 11000 for TC-COST-01 with a fixture opening movement
select private.apply_movement(tests.id('biz_a'), tests.id('milo'), 'opening', 1, 1100);

-- ===========================================================================
-- Definition and privileges
-- ===========================================================================
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc
           where oid = 'public.restock(uuid,uuid,uuid,integer,bigint,bigint,text,date,text,text)'::regprocedure),
  'TC-INV-60a: restock exists, SECURITY DEFINER with explicit checks and an empty search_path');
select ok(has_function_privilege('authenticated', 'public.restock(uuid,uuid,uuid,integer,bigint,bigint,text,date,text,text)', 'execute')
          and not has_function_privilege('anon', 'public.restock(uuid,uuid,uuid,integer,bigint,bigint,text,date,text,text)', 'execute')
          and not exists (select 1 from information_schema.routine_privileges
                          where routine_schema = 'public' and routine_name = 'restock' and grantee = 'PUBLIC'),
  'TC-INV-60b: signed-in users can call it; anonymous callers and PUBLIC cannot');
select ok(not has_table_privilege('authenticated', 'public.purchases', 'insert')
          and not has_table_privilege('authenticated', 'public.stock_movements', 'insert')
          and not has_table_privilege('authenticated', 'public.products', 'update'),
  'TC-INV-60c: the app still cannot write purchases, movements or product values directly');

-- ===========================================================================
-- Weighted average with positive stock (TC-COST-01)
-- ===========================================================================
set local role authenticated;
insert into tests.results select 'c01', public.restock('88888888-8888-8888-8888-888888888801', tests.id('biz_a'), tests.id('milo'),
  12, 13920, 13920, 'cash_drawer', p_supplier_name => '  Makola Wholesale  ', p_note => '  Monday delivery  ');
insert into tests.ids select 'pur_c01', (tests.r('c01') ->> 'purchase_id')::uuid;
insert into tests.ids select 'mv_c01',  (tests.r('c01') ->> 'movement_id')::uuid;
select ok((select stock_qty = 22 and stock_value = 24920 and cost_known from public.products where id = tests.id('milo')),
  'TC-COST-01a: 10 / 11000 plus 12 costing 13920 gives 22 / 24920');
select is((select avg_cost from public.product_cost_history where movement_id = tests.id('mv_c01')), 1132.7273::numeric(18,4),
  'TC-COST-01b: one history row with the new average 1132.7273 (cause restock)');
select ok((select type = 'restock' and qty_change = 12 and value = 13920 and unit_cost = 1160.0000 and purchase_id = tests.id('pur_c01')
                  and user_id = '00000000-0000-0000-0000-0000000000a1'
           from public.stock_movements where id = tests.id('mv_c01')),
  'TC-COST-01c: one restock movement: +12 units, +13920, unit cost 1160.0000, linked to the purchase, signed-in user');
select ok((select product_id = tests.id('milo') and qty = 12 and purchase_cost = 13920 and paid_now = 13920 and paid_now_from = 'cash_drawer'
                  and supplier_name = 'Makola Wholesale' and note = 'Monday delivery' and purchased_on = (now() at time zone 'UTC')::date
                  and movement_id is null and user_id = '00000000-0000-0000-0000-0000000000a1'
           from public.purchases where id = tests.id('pur_c01')),
  'TC-INV-61a: the purchase row: fields stored and trimmed; purchase date defaults to today (UTC, R3); movement_id empty (D3)');
select is(tests.r('c01') ->> 'unpaid', '0', 'TC-INV-61b: fully paid, so nothing is owed');
select is(tests.r('c01') -> 'revaluation', 'null'::jsonb, 'TC-INV-61c: positive stock needs no revaluation');
select ok((select count(*) = 1 and bool_and(entity = 'purchase' and entity_id = tests.id('pur_c01')
                  and (after ->> 'qty')::int = 12 and (after ->> 'purchase_cost')::bigint = 13920
                  and (after -> 'stock_before' ->> 'stock_value')::bigint = 11000 and (after -> 'stock_after' ->> 'stock_value')::bigint = 24920)
           from public.audit_log where action = 'restock' and entity_id = tests.id('pur_c01')),
  'TC-INV-61d: one audit entry, with the purchase and the stock before and after');
select ok((select unit_cost = 1100 and line_cost = 1100 from public.sale_items where sale_id = tests.id('sale1')),
  'TC-INV-61e (C-29): the earlier sale keeps its cost');

-- ===========================================================================
-- Full cost enters stock value, whatever is paid now (TC-PUR-01, C-111, C-112)
-- ===========================================================================
insert into tests.results select 'pur01', tests.rs(tests.id('biz_a'), tests.id('empty'), 10, 50000, 30000, 'cash_drawer');
select ok((select stock_qty = 10 and stock_value = 50000 and cost_known from public.products where id = tests.id('empty')),
  'TC-PUR-01a: goods worth GH₵500 with GH₵300 paid: stock value +GH₵500 (the full cost, not the amount paid)');
select is((tests.r('pur01') ->> 'unpaid')::bigint, 20000::bigint, 'TC-PUR-01b: GH₵200 is owed to the supplier (C-112)');
select ok((select purchase_cost = 50000 and paid_now = 30000 and paid_now_from = 'cash_drawer'
           from public.purchases where id = (tests.r('pur01') ->> 'purchase_id')::uuid),
  'TC-PUR-01c: the purchase records cost 50000, paid now 30000 from the cash drawer');
reset role;
select is((select count(*)::int from public.stock_movements where product_id = tests.id('empty') and type = 'cost_adjustment'), 0,
  'TC-PUR-01d: profit is unaffected: no cost adjustment is posted');
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select is(tests.rs(tests.id('biz_a'), tests.id('empty'), 1, 500, 0, null) ->> 'unpaid', '500',
  'TC-INV-61f: nothing paid now: the whole cost is owed, and no "paid from" is needed');
select is((select paid_now_from from public.purchases where product_id = tests.id('empty') and paid_now = 0), null,
  'TC-INV-61g: with nothing paid now, "paid from" is stored empty');

-- ===========================================================================
-- Negative stock: revaluation first, then the restock (C-25, C-122)
-- ===========================================================================
insert into tests.results select 'c02', tests.rs(tests.id('biz_a'), tests.id('neg'), 10, 15000, 15000, 'momo');
insert into tests.ids select 'mv_c02',  (tests.r('c02') ->> 'movement_id')::uuid;
insert into tests.ids select 'adj_c02', (tests.r('c02') -> 'revaluation' ->> 'movement_id')::uuid;
select ok((select stock_qty = 8 and stock_value = 12000 from public.products where id = tests.id('neg')),
  'TC-COST-02a: -2 / -2000 plus 10 costing 15000 gives 8 / 12000 (average 1500)');
select ok((select type = 'cost_adjustment' and reason = 'negative_stock_revaluation' and qty_change = 0 and value = -1000
                  and purchase_id = (tests.r('c02') ->> 'purchase_id')::uuid
           from public.stock_movements where id = tests.id('adj_c02')),
  'TC-COST-02b: the 2 negative units are revalued at 1500: one cost adjustment of -1000 (cost of items sold +GH₵10.00), linked to the purchase');
select is((tests.r('c02') -> 'revaluation' ->> 'value_change')::bigint, -1000::bigint, 'TC-COST-02c: the result reports the revaluation');
select ok((select h1.effective_at < h2.effective_at and h1.stock_qty_after = -2 and h1.stock_value_after = -3000
                  and h2.stock_qty_after = 8 and h2.stock_value_after = 12000 and h2.avg_cost = 1500.0000
           from public.product_cost_history h1, public.product_cost_history h2
           where h1.movement_id = tests.id('adj_c02') and h2.movement_id = tests.id('mv_c02')),
  'TC-COST-02d: the revaluation comes BEFORE the restock in history (-2 / -3000, then 8 / 12000 at 1500.0000)');
select ok((select count(*) = 1 and bool_and(type = 'cost_adjustment' and entity = 'stock_movement' and entity_id = tests.id('adj_c02')
                  and status = 'open' and message_data ->> 'rule' = 'C-25' and (message_data ->> 'units_revalued')::int = 2
                  and (message_data ->> 'value_change')::bigint = -1000)
           from public.attention_items where entity_id = tests.id('adj_c02')),
  'TC-COST-02e (C-122): one Needs attention item explains the revaluation');
select is((tests.r('c02') -> 'revaluation' ->> 'attention_item_id')::uuid,
          (select id from public.attention_items where entity_id = tests.id('adj_c02')),
  'TC-COST-02f: the result returns the attention item');

insert into tests.results select 'frac', tests.rs(tests.id('biz_a'), tests.id('frac'), 3, 1000, 0, null);
select ok((select stock_qty = 2 and stock_value = 667 from public.products where id = tests.id('frac'))
          and tests.r('frac') -> 'revaluation' = 'null'::jsonb
          and (select count(*) = 0 from public.stock_movements where product_id = tests.id('frac') and type = 'cost_adjustment'),
  'TC-INV-62a: unit cost 333.33...: -1 unit revalued to -round(333.33) = -333, no change, so no adjustment: 2 / 667');
select is((select count(*)::int from public.attention_items
           where business_id = tests.id('biz_a') and type = 'cost_adjustment'
             and message_data ->> 'rule' = 'C-25' and message_data ->> 'product_id' = tests.id('frac')::text), 0,
  'TC-INV-62a2 (C-122): with a revaluation change of 0, no C-25 Needs attention item is raised for the product');
insert into tests.results select 'tozero', tests.rs(tests.id('biz_a'), tests.id('tozero'), 3, 1000, 1000, 'other');
select ok((select stock_qty = 0 and stock_value = 0 from public.products where id = tests.id('tozero'))
          and (tests.r('tozero') -> 'revaluation' ->> 'value_change')::bigint = 2000,
  'TC-INV-62b: -3 / -3000 plus 3 costing 1000: revaluation +2000, then exactly 0 / 0');
insert into tests.results select 'still', tests.rs(tests.id('biz_a'), tests.id('still'), 2, 3000, 3000, 'cash_drawer');
select ok((select stock_qty = -3 and stock_value = -4500 from public.products where id = tests.id('still'))
          and (tests.r('still') -> 'revaluation' ->> 'value_change')::bigint = -2500,
  'TC-INV-62c: -5 / -5000 plus 2 costing 3000: all 5 negative units revalued at 1500 (-2500), leaving -3 / -4500');
insert into tests.results select 'unkneg', tests.rs(tests.id('biz_a'), tests.id('unkneg'), 6, 6000, 6000, 'momo');
select ok((select stock_qty = 3 and stock_value = 3000 and cost_known from public.products where id = tests.id('unkneg'))
          and (tests.r('unkneg') -> 'revaluation' ->> 'value_change')::bigint = -3000,
  'TC-INV-62d (R7): -3 units with unknown cost are revalued at the purchase''s 1000 (-3000), giving 3 / 3000');
insert into tests.results select 'freeneg', tests.rs(tests.id('biz_a'), tests.id('freeneg'), 5, 0, 0, null);
select ok((select stock_qty = 3 and stock_value = 0 from public.products where id = tests.id('freeneg'))
          and (tests.r('freeneg') -> 'revaluation' ->> 'value_change')::bigint = 800,
  'TC-INV-62e (R5, C-25): a free purchase revalues -2 / -800 to 0 (+800), giving 3 / 0');

-- ===========================================================================
-- Owner decisions R3 – R6
-- ===========================================================================
insert into tests.results select 'free', tests.rs(tests.id('biz_a'), tests.id('free'), 5, 0, 0, null);
select ok((select stock_qty = 5 and stock_value = 0 and cost_known from public.products where id = tests.id('free'))
          and (select avg_cost = 0 from public.product_cost_history where movement_id = (tests.r('free') ->> 'movement_id')::uuid),
  'TC-INV-63a (R5): a zero-cost purchase is accepted: 5 / 0, cost known, average 0.0000');
select throws_ok($q$select tests.rs(tests.id('biz_a'), tests.id('unknownpos'), 5, 5000, 5000, 'cash_drawer')$q$,
  '22023', 'set_cost_first', 'TC-INV-63b (R6): positive stock with unknown cost is refused');
select throws_ok($q$select tests.rs(tests.id('biz_a'), tests.id('arch'), 5, 500, 500, 'cash_drawer')$q$,
  '22023', 'product_archived', 'TC-INV-63c (R4): an archived product is refused');
select throws_ok($q$select tests.rs(tests.id('biz_a'), tests.id('gone'), 5, 500, 500, 'cash_drawer')$q$,
  'P0002', 'product_not_found', 'TC-INV-63d: a deleted product is not found');

insert into tests.results select 'dated', public.restock(gen_random_uuid(), tests.id('biz_a'), tests.id('dated'), 2, 200, 200, 'cash_drawer',
  p_purchased_on => (now() at time zone 'UTC')::date - 5);
select ok((select purchased_on = (now() at time zone 'UTC')::date - 5 from public.purchases where id = (tests.r('dated') ->> 'purchase_id')::uuid)
          and (select occurred_at = now() from public.stock_movements where id = (tests.r('dated') ->> 'movement_id')::uuid),
  'TC-INV-63e (Q4, R3): a purchase 5 days ago keeps that date, while the movement uses the server''s recording time');
select throws_ok($q$select public.restock(gen_random_uuid(), tests.id('biz_a'), tests.id('dated'), 1, 100, 100, 'cash_drawer',
                   p_purchased_on => (now() at time zone 'UTC')::date + 1)$q$,
  '22023', 'invalid_purchase_date', 'TC-INV-63f (R3): a future purchase date is refused');
select throws_ok($q$select public.restock(gen_random_uuid(), tests.id('biz_a'), tests.id('dated'), 1, 100, 100, 'cash_drawer',
                   p_purchased_on => (now() at time zone 'UTC')::date - 31)$q$,
  '22023', 'invalid_purchase_date', 'TC-INV-63g (R3): a date before the shop was created is refused');
select lives_ok($q$select public.restock(gen_random_uuid(), tests.id('biz_a'), tests.id('dated'), 1, 100, 100, 'cash_drawer',
                   p_purchased_on => ((now() - interval '30 days') at time zone 'UTC')::date)$q$,
  'TC-INV-63h (R3): the shop''s creation date itself is accepted');

-- ===========================================================================
-- Validation
-- ===========================================================================
select throws_ok($q$select tests.rs(tests.id('biz_a'), tests.id('milo'), 0, 100, 0, null)$q$, '22023', 'invalid_qty', 'TC-INV-64a: quantity 0 is refused');
select throws_ok($q$select tests.rs(tests.id('biz_a'), tests.id('milo'), -1, 100, 0, null)$q$, '22023', 'invalid_qty', 'TC-INV-64b: a negative quantity is refused');
select throws_ok($q$select tests.rs(tests.id('biz_a'), tests.id('milo'), null, 100, 0, null)$q$, '22023', 'invalid_qty', 'TC-INV-64c: a missing quantity is refused');
select throws_ok($q$select tests.rs(tests.id('biz_a'), tests.id('milo'), 100001, 100, 0, null)$q$, '22023', 'invalid_qty', 'TC-INV-64d (D6): more than 100,000 units is refused');
select throws_ok($q$select tests.rs(tests.id('biz_a'), tests.id('milo'), 1, -1, 0, null)$q$, '22023', 'invalid_purchase_cost', 'TC-INV-64e: a negative cost is refused');
select throws_ok($q$select tests.rs(tests.id('biz_a'), tests.id('milo'), 1, null, 0, null)$q$, '22023', 'invalid_purchase_cost', 'TC-INV-64f: a missing cost is refused');
select throws_ok($q$select tests.rs(tests.id('biz_a'), tests.id('milo'), 1, 100000001, 0, null)$q$, '22023', 'invalid_purchase_cost', 'TC-INV-64g (D6): a cost above GH₵1,000,000 is refused');
select throws_ok($q$select tests.rs(tests.id('biz_a'), tests.id('milo'), 1, 500, 501, 'cash_drawer')$q$, '22023', 'invalid_paid_now', 'TC-PUR-02: paid now above the purchase cost is refused');
select throws_ok($q$select tests.rs(tests.id('biz_a'), tests.id('milo'), 1, 500, -1, 'cash_drawer')$q$, '22023', 'invalid_paid_now', 'TC-INV-64h: a negative amount paid now is refused');
select throws_ok($q$select tests.rs(tests.id('biz_a'), tests.id('milo'), 1, 500, null, 'cash_drawer')$q$, '22023', 'invalid_paid_now', 'TC-INV-64i: a missing amount paid now is refused');
select throws_ok($q$select tests.rs(tests.id('biz_a'), tests.id('milo'), 1, 500, 100, null)$q$, '22023', 'paid_from_required', 'TC-INV-64j: paying something now needs "paid from"');
select throws_ok($q$select tests.rs(tests.id('biz_a'), tests.id('milo'), 1, 500, 100, 'bank')$q$, '22023', 'invalid_paid_from', 'TC-INV-64k: an unknown "paid from" is refused');
select throws_ok(format('select public.restock(gen_random_uuid(), tests.id(''biz_a''), tests.id(''milo''), 1, 100, 0, null, p_supplier_name => %L)', repeat('s', 101)),
  '22023', 'supplier_name_too_long', 'TC-INV-64l: a supplier name over 100 characters is refused');
select throws_ok(format('select public.restock(gen_random_uuid(), tests.id(''biz_a''), tests.id(''milo''), 1, 100, 0, null, p_note => %L)', repeat('n', 301)),
  '22023', 'note_too_long', 'TC-INV-64m: a note over 300 characters is refused');
insert into tests.results select 'blank', public.restock(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), 1, 1100, 0, null,
  p_supplier_name => '   ', p_note => '  ' || repeat('n', 300) || '  ');
select ok((select supplier_name is null and char_length(note) = 300 from public.purchases where id = (tests.r('blank') ->> 'purchase_id')::uuid),
  'TC-INV-64n: a blank supplier name is stored empty; a 300-character note (after trimming) is accepted');
insert into tests.results select 'big', tests.rs(tests.id('biz_a'), tests.id('big'), 100000, 100000000, 100000000, 'other');
select ok((select stock_qty = 100000 and stock_value = 100000000 from public.products where id = tests.id('big'))
          and (select unit_cost = 1000.0000 from public.stock_movements where id = (tests.r('big') ->> 'movement_id')::uuid),
  'TC-INV-64o (D6): the largest restock (100,000 units costing GH₵1,000,000) is recorded exactly');

-- ===========================================================================
-- Isolation and membership
-- ===========================================================================
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select throws_ok($q$select tests.rs(tests.id('biz_a'), tests.id('milo'), 1, 100, 0, null)$q$, '42501', 'not_a_member',
  'TC-INV-65a: owner B cannot restock through shop A');
select throws_ok($q$select tests.rs(tests.id('biz_b'), tests.id('milo'), 1, 100, 0, null)$q$, 'P0002', 'product_not_found',
  'TC-INV-65b: owner B cannot restock shop A''s product by passing their own shop');
select throws_ok($q$select tests.rs(tests.id('biz_b'), gen_random_uuid(), 1, 100, 0, null)$q$, 'P0002', 'product_not_found',
  'TC-INV-65c: an unknown product is refused the same way');
reset role;
update public.business_members set active = false where business_id = tests.id('biz_b');
select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select throws_ok($q$select tests.rs(tests.id('biz_b'), tests.id('b_prod'), 1, 100, 0, null)$q$, '42501', 'not_a_member',
  'TC-INV-65d: an inactive membership cannot restock');
reset role;
update public.business_members set active = true where business_id = tests.id('biz_b');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_ok($q$select tests.rs(tests.id('biz_a'), tests.id('milo'), 1, 100, 0, null)$q$, '42501', 'not_authenticated',
  'TC-INV-65e: a call without a signed-in user is refused');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($q$select public.restock(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), 1, 100, 0, null)$q$, '42501', null,
  'TC-INV-65f: an anonymous caller cannot restock');
reset role;
select ok((select stock_qty = 23 and stock_value = 26020 from public.products where id = tests.id('milo')),
  'TC-INV-65g: shop A''s product is unchanged by the refused attempts (22 / 24920 + 1 / 1100)');
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;

-- ===========================================================================
-- Idempotency and atomicity
-- ===========================================================================
select is(public.restock('88888888-8888-8888-8888-888888888801', tests.id('biz_a'), tests.id('milo'), 12, 13920, 13920, 'cash_drawer'),
  tests.r('c01'), 'TC-INV-66a: repeating the first restock returns its original result');
reset role;
select is(tests.n(format('select count(*) from public.purchases where product_id = %L', tests.id('milo'))), 2,
  'TC-INV-66b: the repeat created no extra purchase (the first restock and the 1-unit restock)');
select is((select stock_qty from public.products where id = tests.id('milo')), 23,
  'TC-INV-66c: the repeat did not increase the stock again');
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select throws_ok($q$select public.restock('88888888-8888-8888-8888-888888888801', tests.id('biz_a2'), tests.id('a2_prod'), 12, 13920, 13920, 'cash_drawer')$q$,
  '22023', 'request_id_reused', 'TC-INV-66d: the same request ID for the owner''s other shop is refused');
select throws_ok($q$select public.set_cost('88888888-8888-8888-8888-888888888801', tests.id('biz_a'), tests.id('milo'), 1200, 'Reason')$q$,
  '22023', 'request_id_reused', 'TC-INV-66e: the same request ID for a different function is refused');
reset role;
select ok((select stock_qty = 3 and stock_value = 2100 from public.products where id = tests.id('a2_prod')),
  'TC-INV-66f: the other shop''s product is unchanged');
create temp table before_fail as select (select count(*) from public.purchases) as purchases, (select count(*) from public.stock_movements) as mv,
  (select count(*) from public.product_cost_history) as hist, (select count(*) from public.audit_log) as audit,
  (select count(*) from public.attention_items) as att;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select throws_ok($q$select public.restock('88888888-8888-8888-8888-888888888802', tests.id('biz_a'), tests.id('milo'), 1, 500, 600, 'cash_drawer')$q$,
  '22023', 'invalid_paid_now', 'TC-INV-66g: (setup) a refused request');
reset role;
select ok((select purchases = (select count(*) from public.purchases) and mv = (select count(*) from public.stock_movements)
                  and hist = (select count(*) from public.product_cost_history) and audit = (select count(*) from public.audit_log)
                  and att = (select count(*) from public.attention_items) from before_fail)
          and tests.n($q$select count(*) from public.request_log where request_id = '88888888-8888-8888-8888-888888888802'$q$) = 0,
  'TC-INV-66h: a refused restock writes nothing at all (no purchase, movement, history, audit, attention item or claim)');
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select ok((public.restock('88888888-8888-8888-8888-888888888802', tests.id('biz_a'), tests.id('milo'), 1, 500, 500, 'cash_drawer') ->> 'purchase_id') is not null,
  'TC-INV-66i: the same request ID then succeeds');
reset role;

-- An error after the purchase is written rolls back everything (atomic): quantity overflow
update public.products set stock_qty = 2147480000, stock_value = 2147480000 where id = tests.id('free');
create temp table before_overflow as select (select count(*) from public.purchases) as purchases, (select count(*) from public.audit_log) as audit;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select throws_ok($q$select tests.rs(tests.id('biz_a'), tests.id('free'), 100000, 100, 0, null)$q$, '22003', 'stock_qty_out_of_range',
  'TC-INV-66j: a restock that would overflow the stock quantity is refused');
reset role;
select ok((select purchases = (select count(*) from public.purchases) and audit = (select count(*) from public.audit_log) from before_overflow),
  'TC-INV-66k (atomic): the purchase written before the failing movement was rolled back too');
update public.products set stock_qty = 5, stock_value = 0 where id = tests.id('free');

-- ===========================================================================
-- Purchases are append-only; history and conservation
-- ===========================================================================
select throws_ok(format('update public.purchases set purchase_cost = 1 where id = %L', tests.id('pur_c01')), 'P0001', null,
  'TC-INV-67a: a recorded purchase cannot be changed');
select throws_ok(format('delete from public.purchases where id = %L', tests.id('pur_c01')), 'P0001', null,
  'TC-INV-67b: a recorded purchase cannot be deleted');
select ok((select bool_and(m.purchase_id is not null) and count(*) = (select count(*) from public.purchases where business_id = tests.id('biz_a'))
           from public.stock_movements m where m.business_id = tests.id('biz_a') and m.type = 'restock'),
  'TC-INV-67c (D3): every purchase has exactly one restock movement linked to it');
select is((select count(*)::int from public.audit_log where action = 'restock' and business_id = tests.id('biz_a')),
          (select count(*)::int from public.purchases where business_id = tests.id('biz_a')),
  'TC-INV-67d: every purchase has exactly one audit entry');
select is((select count(*)::int from public.attention_items where business_id = tests.id('biz_a') and type = 'cost_adjustment' and message_data ->> 'rule' = 'C-25'),
          (select count(*)::int from public.stock_movements where business_id = tests.id('biz_a') and reason = 'negative_stock_revaluation'),
  'TC-INV-67e (C-122): every revaluation has exactly one Needs attention item');
select ok((select bool_and(effective_at > prev) from (
             select effective_at, lag(effective_at) over (partition by product_id order by effective_at) as prev
             from public.product_cost_history where business_id = tests.id('biz_a')) x where prev is not null),
  'TC-INV-67f: history rows are strictly ordered in time for every product');
-- (the overflow fixture above set Free's value directly and restored it; Free is checked separately)
select ok(tests.pool_conserved(tests.id('biz_a2')) and tests.pool_conserved(tests.id('biz_b')),
  'TC-COST-20 (restock): conservation holds in the other shops');
select ok((select bool_and(
             p.stock_qty = (select sum(m.qty_change) from public.stock_movements m where m.product_id = p.id)
         and p.stock_value = (select sum(m.value) from public.stock_movements m where m.product_id = p.id))
           from public.products p where p.business_id = tests.id('biz_a') and p.id <> tests.id('free')
             and exists (select 1 from public.stock_movements m where m.product_id = p.id)),
  'TC-COST-20 (restock): conservation holds for every restocked product in shop A');
select ok((select count(*) from public.stock_movements m where m.product_id = p.id)
          = (select count(*) from public.product_cost_history h where h.product_id = p.id), 'TC-COST-04 (restock): one history row per movement (Milo)')
  from public.products p where p.id = tests.id('milo');
select ok(not has_function_privilege('authenticated',
            'private.apply_movement(uuid,uuid,text,integer,bigint,text,numeric,uuid,uuid,text,boolean)', 'execute'),
  'TC-INV-67g: the T1 helpers remain internal');

-- T10 (I3, additive): stock integrity of every shop this file used: no discrepancy
reset role;
select is((select count(*)::int from tests.ids i cross join lateral private.stock_integrity(i.v) s where i.k like 'biz%'), 0,
  'TC-INV-123d (T10 I3): stock integrity: no discrepancy in any shop of this file');

select * from finish();
rollback;
