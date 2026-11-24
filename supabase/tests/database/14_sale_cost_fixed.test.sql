-- Stage 1C-1 closure: TC-COST-07 (a void returns the original line cost, C-21, C-26) and TC-COST-13
-- (a recorded sale's cost never changes, C-29) after the Stage 1C operations that change a product's
-- cost: restock (including the C-25 revaluation of negative stock), cost correction (set_cost) and
-- purchase correction (cost and quantity); and the currently testable part of TC-COST-17 (C-25b,
-- C-123): the GH₵ effect recorded on the "Cost check needed" item. Tests only; no production change.
-- TC-COST-17's own trigger, a late-uploaded sale, needs the Stage 1D sale functions and is NOT covered
-- here: the negative value is produced by a fixture sale and by the real adjust_stock instead.
-- Sales and voids are fixtures until Stage 1D (Stage 1C plan §3, D9): a fixture sale writes the sale,
-- its sale item and the sale movement as 05 C-23b defines them; a fixture void sets the sale to voided
-- and applies the void movement through the shared helper with the sale item's recorded line cost, as
-- C-21 and C-26 require of the Stage 1D void function. What these tests prove in 1C: the stock pool
-- takes back exactly that recorded cost (never a recalculation at the current average), and no 1C
-- function rewrites the recorded sale, its sale item or its stock movement. Note that `sales` and
-- `sale_items` are not append-only tables, so C-29 depends on no function writing to them.
-- Fixtures are fictitious and everything is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

create schema tests;
grant usage on schema tests to authenticated;
create table tests.ids (k text primary key, v uuid);
grant select, insert on tests.ids to authenticated;
create function tests.id(p_k text) returns uuid language sql stable as $$ select v from tests.ids where k = p_k $$;
grant execute on function tests.id(text) to authenticated;
create table tests.results (k text primary key, r jsonb);
grant select, insert on tests.results to authenticated;
create function tests.r(p_k text) returns jsonb language sql stable as $$ select r from tests.results where k = p_k $$;
grant execute on function tests.r(text) to authenticated;
create function tests.as_user(p_user text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end $$;
create function tests.pv(p_product uuid) returns text language sql stable as $$
  select stock_qty || ' / ' || stock_value from public.products where id = p_product
$$;
create function tests.pool_conserved(p_business uuid) returns boolean language sql stable as $$
  select coalesce(bool_and(
           p.stock_qty = coalesce((select sum(m.qty_change) from public.stock_movements m where m.product_id = p.id), 0)
       and p.stock_value = coalesce((select sum(m.value) from public.stock_movements m where m.product_id = p.id), 0)
       and (select count(*) from public.stock_movements m where m.product_id = p.id)
           = (select count(*) from public.product_cost_history h where h.product_id = p.id)), true)
  from public.products p where p.business_id = p_business
$$;
-- The recorded sale exactly as stored: the sale row, its sale item and its stock movement
create function tests.sale_record(p_sale uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'sale', (select to_jsonb(s) from public.sales s where s.id = p_sale),
    'items', (select jsonb_agg(to_jsonb(i) order by i.id) from public.sale_items i where i.sale_id = p_sale),
    'movements', (select jsonb_agg(to_jsonb(m) order by m.id) from public.stock_movements m
                  where m.sale_id = p_sale and m.type = 'sale'))
$$;
create table tests.snap (k text primary key, r jsonb);
-- A fixture sale of one product (Stage 1D brings real ones): sale, sale item and sale movement,
-- with the sale-time unit cost and line cost given explicitly (C-23, C-23b)
create function tests.sell(p_key text, p_receipt text, p_product uuid, p_qty integer, p_price bigint,
                           p_unit_cost numeric, p_line_cost bigint) returns void language plpgsql as $$
declare v_sale uuid := gen_random_uuid();
begin
  insert into tests.ids values (p_key, v_sale);
  insert into public.sales (id, business_id, device_id, receipt_no, subtotal, total, payment_method, mode,
                            occurred_at_device, occurred_at, time_confidence, cost_basis, payload_version)
  values (v_sale, tests.id('biz'), tests.id('dev'), p_receipt, p_qty * p_price, p_qty * p_price, 'cash', 'online',
          now(), now(), 'high', 'occurred_at', 1);
  insert into public.sale_items (business_id, sale_id, product_id, qty, unit_price, line_total, unit_cost,
                                 avg_at_upload, line_cost)
  values (tests.id('biz'), v_sale, p_product, p_qty, p_price, p_qty * p_price, p_unit_cost, p_unit_cost, p_line_cost);
  perform private.apply_movement(tests.id('biz'), p_product, 'sale', -p_qty, -p_line_cost,
                                 p_unit_cost => p_unit_cost, p_sale_id => v_sale);
end $$;
-- A fixture void of a whole sale, as C-21 / C-26 require of the Stage 1D void function: the sale is
-- marked voided and each item's quantity and RECORDED line cost go back to the pool
create function tests.void_sale(p_sale uuid) returns void language plpgsql as $$
declare i record;
begin
  update public.sales set status = 'voided', voided_at = now(), void_reason = 'Customer returned the goods'
  where id = p_sale;
  for i in select * from public.sale_items where sale_id = p_sale order by id loop
    perform private.apply_movement(i.business_id, i.product_id, 'void', i.qty, i.line_cost,
                                   p_unit_cost => i.unit_cost, p_sale_id => p_sale);
  end loop;
end $$;
create function tests.void_mv(p_sale uuid) returns public.stock_movements language sql stable as $$
  select * from public.stock_movements where sale_id = p_sale and type = 'void'
$$;

-- ---------------------------------------------------------------------------
-- Fixtures: one owner, one shop, one device
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'owner.a@example.test');
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
insert into tests.ids select 'biz', (public.create_business(gen_random_uuid(), 'Ama Test Provisions', 'provision', 'Accra', null) ->> 'business_id')::uuid;
insert into tests.ids select 'dev', (public.register_device(gen_random_uuid(), tests.id('biz'), 'Phone') ->> 'device_id')::uuid;
-- TC-COST-07: soap (average rises after the sale) and oil (average falls after the sale)
insert into tests.ids select 'soap', (public.create_product(gen_random_uuid(), tests.id('biz'), 'Void soap', 150, p_cost_price => 100, p_opening_stock => 10) ->> 'product_id')::uuid;
insert into tests.ids select 'oil', (public.create_product(gen_random_uuid(), tests.id('biz'), 'Void oil', 300, p_cost_price => 200, p_opening_stock => 10) ->> 'product_id')::uuid;
-- TC-COST-13: rice (restock), tea (restock while negative, C-25), sugar (set_cost), beans (purchase correction)
insert into tests.ids select 'rice', (public.create_product(gen_random_uuid(), tests.id('biz'), 'Fixed rice', 150, p_cost_price => 100, p_opening_stock => 10) ->> 'product_id')::uuid;
insert into tests.ids select 'tea', (public.create_product(gen_random_uuid(), tests.id('biz'), 'Fixed tea', 150, p_cost_price => 100, p_opening_stock => 2) ->> 'product_id')::uuid;
insert into tests.ids select 'beans', (public.create_product(gen_random_uuid(), tests.id('biz'), 'Fixed beans', 150) ->> 'product_id')::uuid;
insert into tests.ids select 'p_beans', (public.restock(gen_random_uuid(), tests.id('biz'), tests.id('beans'), 10, 1000, 0, null) ->> 'purchase_id')::uuid;
-- TC-COST-17 (testable part): milo (the C-123 example, -GH₵3.40) and milk (through adjust_stock)
insert into tests.ids select 'milo', (public.create_product(gen_random_uuid(), tests.id('biz'), 'Check milo', 300, p_cost_price => 200, p_opening_stock => 3) ->> 'product_id')::uuid;
insert into tests.ids select 'milk', (public.create_product(gen_random_uuid(), tests.id('biz'), 'Check milk', 1500, p_cost_price => 1000, p_opening_stock => 3) ->> 'product_id')::uuid;
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');

-- ===========================================================================
-- TC-COST-07: a void returns the original line cost to the pool (C-21, C-26)
-- ===========================================================================
-- Soap: 10 / 1000 (avg 100). Sale of 2 at the sale-time cost 100: line cost 200 -> 8 / 800.
-- A restock of 8 for 1600 then raises the average to 150 (16 / 2400) before the void.
select tests.sell('s_soap', 'A-000001', tests.id('soap'), 2, 150, 100, 200);
set local role authenticated;
select public.restock(gen_random_uuid(), tests.id('biz'), tests.id('soap'), 8, 1600, 0, null);
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
insert into tests.snap values ('soap', tests.sale_record(tests.id('s_soap')));
select is(tests.pv(tests.id('soap')), '16 / 2400', 'TC-COST-07 setup: soap is 16 / 2400 (average 150) before the void');
select tests.void_sale(tests.id('s_soap'));

select is((tests.void_mv(tests.id('s_soap'))).value,
          (select line_cost from public.sale_items where sale_id = tests.id('s_soap')),
  'TC-COST-07a: the void movement returns exactly the sale item''s recorded line cost');
select is((tests.void_mv(tests.id('s_soap'))).value, 200::bigint,
  'TC-COST-07b: the void returns 200 (2 x the sale-time cost 100), not 300 (2 x the current average 150)');
select ok((select qty_change = 2 and unit_cost = 100.0000 and reason is null
           from tests.void_mv(tests.id('s_soap'))),
  'TC-COST-07c: the void movement is +2 units at the sale-time unit cost 100');
select is(tests.pv(tests.id('soap')), '18 / 2600', 'TC-COST-07d: stock after the void is 18 / 2600 (2400 + 200)');
select ok((select h.stock_qty_after = 18 and h.stock_value_after = 2600 and h.avg_cost = 144.4444 and h.cause = 'void'
           from public.product_cost_history h where h.movement_id = (tests.void_mv(tests.id('s_soap'))).id),
  'TC-COST-07e: one history row for the void: 18 / 2600, average 144.4444 (2600 / 18)');
select is(tests.sale_record(tests.id('s_soap')) - 'sale', (select r from tests.snap where k = 'soap') - 'sale',
  'TC-COST-07f: the void leaves the recorded sale item and sale movement exactly as they were');
select ok((select status = 'voided' and subtotal = 300 and total = 300 from public.sales where id = tests.id('s_soap')),
  'TC-COST-07g: only the sale''s status changed (voided); its amounts are unchanged');
select is((select count(*) from public.stock_movements where product_id = tests.id('soap') and type = 'cost_adjustment'), 0::bigint,
  'TC-COST-07h: the void created no cost adjustment (the difference from the average is not hidden in an adjustment)');

-- Oil: 10 / 2000 (avg 200). Sale of 3 at 200: line cost 600 -> 7 / 1400. The owner then corrects
-- the cost to 120 (set_cost: 7 / 840) before the void.
select tests.sell('s_oil', 'A-000002', tests.id('oil'), 3, 300, 200, 600);
set local role authenticated;
select public.set_cost(gen_random_uuid(), tests.id('biz'), tests.id('oil'), 120, 'Supplier price list');
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
insert into tests.snap values ('oil', tests.sale_record(tests.id('s_oil')));
select is(tests.pv(tests.id('oil')), '7 / 840', 'TC-COST-07 setup: oil is 7 / 840 (average 120) before the void');
select tests.void_sale(tests.id('s_oil'));
select ok((select value = 600 and qty_change = 3 and unit_cost = 200.0000 from tests.void_mv(tests.id('s_oil'))),
  'TC-COST-07i: the void returns the recorded 600 (3 x 200), not 360 (3 x the current average 120)');
select is(tests.pv(tests.id('oil')), '10 / 1440', 'TC-COST-07j: stock after the void is 10 / 1440 (840 + 600), average 144');
select is(tests.sale_record(tests.id('s_oil')) - 'sale', (select r from tests.snap where k = 'oil') - 'sale',
  'TC-COST-07k: the void leaves the recorded sale item and sale movement exactly as they were');

-- ===========================================================================
-- TC-COST-13: a recorded sale's cost never changes (C-29)
-- ===========================================================================
-- Rice: 10 / 1000. Sale of 3 at 100: line cost 300 -> 7 / 700. Then a restock of 10 for 2000.
select tests.sell('s_rice', 'A-000003', tests.id('rice'), 3, 150, 100, 300);
insert into tests.snap values ('rice', tests.sale_record(tests.id('s_rice')));
set local role authenticated;
select public.restock(gen_random_uuid(), tests.id('biz'), tests.id('rice'), 10, 2000, 0, null);
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
select is(tests.pv(tests.id('rice')), '17 / 2700', 'TC-COST-13 setup: the restock raised rice to 17 / 2700 (average 158.8235)');
select is(tests.sale_record(tests.id('s_rice')), (select r from tests.snap where k = 'rice'),
  'TC-COST-13a (restock): the recorded sale, its sale item and its sale movement are exactly unchanged');
select ok((select unit_cost = 100.0000 and avg_at_upload = 100.0000 and line_cost = 300
           from public.sale_items where sale_id = tests.id('s_rice')),
  'TC-COST-13b (restock): the sale item still has unit cost 100 and line cost 300');
select ok((select value = -300 and qty_change = -3 and unit_cost = 100.0000
           from public.stock_movements where sale_id = tests.id('s_rice') and type = 'sale'),
  'TC-COST-13c (restock): the sale movement still removed exactly 300');

-- Tea: 2 / 200. Sale of 3 at 100 (line cost 300) takes stock to -1 / -100. A restock of 5 for 1000
-- (unit cost 200) first revalues the negative unit at 200 (C-25: cost adjustment -100), then adds the
-- purchase: 4 / 800. The difference is recorded as a visible cost adjustment, not by changing the sale.
select tests.sell('s_tea', 'A-000004', tests.id('tea'), 3, 150, 100, 300);
insert into tests.snap values ('tea', tests.sale_record(tests.id('s_tea')));
select is(tests.pv(tests.id('tea')), '-1 / -100', 'TC-COST-13 setup: the sale took tea to -1 / -100');
set local role authenticated;
select public.restock(gen_random_uuid(), tests.id('biz'), tests.id('tea'), 5, 1000, 0, null);
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
select ok((select count(*) = 1 and sum(value) = -100 from public.stock_movements
           where product_id = tests.id('tea') and type = 'cost_adjustment' and reason = 'negative_stock_revaluation'),
  'TC-COST-13 setup: the restock revalued the negative unit with one visible cost adjustment of -100 (C-25)');
select is(tests.pv(tests.id('tea')), '4 / 800', 'TC-COST-13 setup: tea is 4 / 800 after the restock');
select is(tests.sale_record(tests.id('s_tea')), (select r from tests.snap where k = 'tea'),
  'TC-COST-13d (restock after negative stock): the recorded sale, its sale item and its sale movement are exactly unchanged');

-- Rice again: an owner cost correction (set_cost to 90) after the sale
set local role authenticated;
select public.set_cost(gen_random_uuid(), tests.id('biz'), tests.id('rice'), 90, 'Counted invoice');
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
select is(tests.pv(tests.id('rice')), '17 / 1530', 'TC-COST-13 setup: set_cost brought rice to 17 / 1530');
select is(tests.sale_record(tests.id('s_rice')), (select r from tests.snap where k = 'rice'),
  'TC-COST-13e (cost correction): the recorded sale, its sale item and its sale movement are exactly unchanged');

-- Beans: purchase P of 10 for 1000 (10 / 1000). Sale of 4 at 100: line cost 400 -> 6 / 600.
-- Cost correction of P by +500: 4 of the 10 units are already sold, so S = 200 is recognised in the
-- correction's allocation (C-116a) and only R = 300 goes into stock value: 6 / 900.
select tests.sell('s_beans', 'A-000005', tests.id('beans'), 4, 150, 100, 400);
insert into tests.snap values ('beans', tests.sale_record(tests.id('s_beans')));
set local role authenticated;
insert into tests.results select 'cc', public.correct_purchase(gen_random_uuid(), tests.id('biz'), tests.id('p_beans'),
  'cost', 'Invoice corrected', p_cost_change => 500);
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
select ok(((tests.r('cc') -> 'allocation' -> 'parts' ->> 'already_sold')::bigint = 200
           and (tests.r('cc') -> 'allocation' -> 'parts' ->> 'remaining_stock')::bigint = 300),
  'TC-COST-13 setup: the correction allocates 200 to the units already sold and 300 to remaining stock');
select is(tests.pv(tests.id('beans')), '6 / 900', 'TC-COST-13 setup: beans are 6 / 900 after the cost correction');
select is(tests.sale_record(tests.id('s_beans')), (select r from tests.snap where k = 'beans'),
  'TC-COST-13f (purchase cost correction): the recorded sale, its sale item and its sale movement are exactly unchanged');
select ok((select unit_cost = 100.0000 and line_cost = 400 from public.sale_items where sale_id = tests.id('s_beans')),
  'TC-COST-13g (purchase cost correction): the sale item still has unit cost 100 and line cost 400; the sold share is only in the allocation');
select ok((select count(*) = 1 and bool_and(value = 300 and qty_change = 0)
           from public.stock_movements where purchase_id = tests.id('p_beans') and type = 'purchase_correction'),
  'TC-COST-13h (purchase cost correction): the correction wrote one stock movement of +300 (R) and no sale or void movement');

-- Beans: then a quantity correction of P (+2 units received, total cost unchanged, C-116f)
set local role authenticated;
insert into tests.results select 'qc', public.correct_purchase(gen_random_uuid(), tests.id('biz'), tests.id('p_beans'),
  'quantity', 'Different quantity received', p_qty_change => 2);
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
select is((select sum(qty_change) from public.stock_movements where product_id = tests.id('beans')), 8::bigint,
  'TC-COST-13 setup: the quantity correction added the 2 units (8 in stock)');
select is(tests.sale_record(tests.id('s_beans')), (select r from tests.snap where k = 'beans'),
  'TC-COST-13i (purchase quantity correction): the recorded sale, its sale item and its sale movement are exactly unchanged');

-- ===========================================================================
-- TC-COST-17 (currently testable part): the GH₵ effect on the "Cost check needed" item (C-25b, C-123)
-- The late-sale trigger itself is deferred to Stage 1D and is not claimed here.
-- ===========================================================================
-- Milo: 3 / 600 (avg 200). A fixture sale of 2 recorded at a sale-time cost of 470 (line cost 940)
-- removes more value than remains: 1 / -340. C-25b corrects the value to 0 with +340 and raises the
-- item; C-123's example: "stock value went below zero (-GH₵3.40) ... Cost of items sold increased by GH₵3.40".
select tests.sell('s_milo', 'A-000006', tests.id('milo'), 2, 300, 470, 940);
select is(tests.pv(tests.id('milo')), '1 / 0', 'TC-COST-17 (testable part) setup: milo went to 1 / -340 and was corrected to 1 / 0');
insert into tests.ids select 'milo_adj', id from public.stock_movements
  where product_id = tests.id('milo') and type = 'cost_adjustment' and reason = 'negative_value_correction';
select is((select value from public.stock_movements where id = tests.id('milo_adj')), 340::bigint,
  'TC-COST-17a (C-25b): one visible cost adjustment of +340 brings the value to 0');
select ok((select count(*) = 1 and bool_and(status = 'open' and entity = 'product' and message_data ->> 'rule' = 'C-25b'
                                            and (message_data ->> 'product_id')::uuid = tests.id('milo'))
           from public.attention_items where type = 'cost_check' and entity_id = tests.id('milo')),
  'TC-COST-17b (C-123): one open "Cost check needed" item for milo (rule C-25b)');
select is((select (message_data ->> 'value_before')::bigint from public.attention_items
           where type = 'cost_check' and entity_id = tests.id('milo')), -340::bigint,
  'TC-COST-17c (C-123): the item records the value before the correction: -340 (-GH₵3.40)');
select is((select (message_data ->> 'value_change')::bigint from public.attention_items
           where type = 'cost_check' and entity_id = tests.id('milo')), 340::bigint,
  'TC-COST-17d (C-123): the item records the GH₵ effect: +340 (cost of items sold up GH₵3.40)');
select ok((select (message_data ->> 'movement_id')::uuid = tests.id('milo_adj')
                  and (message_data ->> 'value_change')::bigint = (select value from public.stock_movements where id = tests.id('milo_adj'))
           from public.attention_items where type = 'cost_check' and entity_id = tests.id('milo')),
  'TC-COST-17e: the item points to the cost adjustment movement and its GH₵ effect equals that movement''s value');

-- Milk, through the real adjust_stock: 3 / 3000 (avg 1000); a fixture sale of 5 at 1600 (line cost
-- 8000) leaves -2 / -5000. A count correction to 1 values the 3 units found at the last known
-- average 1000 (T6 S1): 1 / -2000, corrected to 0 by C-25b with +2000.
select tests.sell('s_milk', 'A-000007', tests.id('milk'), 5, 1500, 1600, 8000);
set local role authenticated;
select public.adjust_stock(gen_random_uuid(), tests.id('biz'), tests.id('milk'), 'count_correction', 1, null);
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
select is(tests.pv(tests.id('milk')), '1 / 0', 'TC-COST-17 (testable part) setup: the count correction left milk at 1 / -2000, corrected to 1 / 0');
select ok((select (message_data ->> 'value_before')::bigint = -2000 and (message_data ->> 'value_change')::bigint = 2000
                  and (message_data ->> 'value_change')::bigint
                      = (select value from public.stock_movements m where m.id = (message_data ->> 'movement_id')::uuid
                         and m.type = 'cost_adjustment' and m.reason = 'negative_value_correction')
           from public.attention_items where type = 'cost_check' and entity_id = tests.id('milk') and status = 'open'),
  'TC-COST-17f (C-123, via adjust_stock): the item records value before -2000 and GH₵ effect +2000, equal to its cost adjustment');

-- ===========================================================================
-- Invariants for the whole shop after every scenario
-- ===========================================================================
select ok(tests.pool_conserved(tests.id('biz')),
  'TC-COST-20: every product''s stock equals the sum of its movements, with one history row per movement');
set local role authenticated;
select is(public.check_stock_integrity(tests.id('biz')) -> 'discrepancies', '[]'::jsonb,
  'check_stock_integrity: the shop has no discrepancies after the voids, restocks and corrections');
reset role;

select * from finish();
rollback;
