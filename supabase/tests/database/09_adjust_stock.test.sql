-- Stage 1C, task T6: public.adjust_stock (04 §2.3; 05 C-21, C-25a, C-25b, C-30 – C-32, C-37; 03 S-34;
-- 09 §3; 06 SY-75; 07 SEC-21).
-- A counted quantity or a +/- change with a reason; losses, own use and stock found valued at
-- round_half_up(qty × average) so the average is unchanged; one movement, one history row and one
-- audit entry; open discrepancies resolved once stock is >= 0; atomic and idempotent.
-- Owner decisions: Q1 decreases beyond the available stock refused, except count corrections to an
-- absolute count >= 0. T6: S1 stock found while stock <= 0 valued at the last known average (none:
-- 0, cost stays unknown); S2 archived allowed; S3 "other" both ways with a required note; S4 a count
-- equal to the stock returns no_change and writes nothing; S5 only discrepancies are resolved.
-- Fixtures are fictitious and everything is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(92);

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
-- product state as text "qty / value" (read as the superuser)
create function tests.pv(p_product uuid) returns text language sql stable security definer as $$
  select stock_qty || ' / ' || stock_value from public.products where id = p_product
$$;
grant execute on function tests.pv(uuid) to authenticated;

-- adjust_stock with a fresh request ID
create function tests.adj(p_biz uuid, p_product uuid, p_reason text, p_count integer, p_change integer, p_note text default null)
returns jsonb language sql as $$
  select public.adjust_stock(gen_random_uuid(), p_biz, p_product, p_reason, p_count, p_change, p_note)
$$;
grant execute on function tests.adj(uuid, uuid, text, integer, integer, text) to authenticated;
-- a product left with a given stock as late sales would leave it: opening stock, then a fixture
-- movement through apply_movement (sales arrive in Stage 1D; fixture only)
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
insert into tests.ids select 'milo',    (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Milo sachet', 150, p_cost_price => 1100, p_opening_stock => 10) ->> 'product_id')::uuid;
insert into tests.ids select 'reasons', (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Tomato paste', 500, p_cost_price => 400, p_opening_stock => 20) ->> 'product_id')::uuid;
insert into tests.ids select 'third',   (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Biscuit pack', 500, p_cost_price => 333, p_opening_stock => 3) ->> 'product_id')::uuid;
insert into tests.ids select 'half',    (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Sweet', 10, p_cost_price => 1, p_opening_stock => 2) ->> 'product_id')::uuid;
insert into tests.ids select 'unknown', (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Rice 1kg', 1500, p_opening_stock => 4) ->> 'product_id')::uuid;
insert into tests.ids select 'tozero',  (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Soap bar', 800, p_cost_price => 500, p_opening_stock => 2) ->> 'product_id')::uuid;
insert into tests.ids select 'never',   (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'New item', 500) ->> 'product_id')::uuid;
insert into tests.ids select 'arch',    (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Old torch', 2500, p_cost_price => 50, p_opening_stock => 3) ->> 'product_id')::uuid;
insert into tests.ids select 'gone',    (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Gone item', 2500, p_cost_price => 50, p_opening_stock => 3) ->> 'product_id')::uuid;
insert into tests.ids select 'big',     (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Bulk item', 100) ->> 'product_id')::uuid;
insert into tests.ids select 'a2_prod', (public.create_product(gen_random_uuid(), tests.id('biz_a2'), 'Second shop oil', 900, p_cost_price => 700, p_opening_stock => 3) ->> 'product_id')::uuid;
select public.set_product_archived(gen_random_uuid(), tests.id('biz_a'), tests.id('arch'), true);
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
-- Half: 2 / 3 (a fixture value correction), so one unit is worth exactly 1.5 pesewas
select private.apply_movement(tests.id('biz_a'), tests.id('half'), 'value_correction', 0, 1);
-- Negative stock fixtures (value as late sales at the average would leave it)
insert into tests.ids select 'neg',     tests.mk(tests.id('biz_a'), 'Sardine tin', 2, 1000, 4, 4000);   -- -2 / -2000, last average 1000
insert into tests.ids select 'negunk',  tests.mk(tests.id('biz_a'), 'Matches box', 2, null, 5, 0);      -- -3 / 0, cost unknown
insert into tests.ids select 'negcheck',tests.mk(tests.id('biz_a'), 'Milk tin', 1, 1000, 3, 6000);      -- -2 / -5000, last average 1000
insert into tests.ids select 'stale',   tests.mk(tests.id('biz_a'), 'Sugar cube', 2, 1000, 5, 5000);    -- -3 / -3000, last average 1000
update public.products set deleted_at = now() where id = tests.id('gone');

-- Two recorded fictitious sales of Sardine (sales arrive in Stage 1D; fixtures only)
insert into tests.ids values ('sale1', 'd0000000-0000-0000-0000-000000000001'), ('sale2', 'd0000000-0000-0000-0000-000000000002'),
                             ('sale3', 'd0000000-0000-0000-0000-000000000003');
insert into public.sales (id, business_id, device_id, receipt_no, subtotal, total, payment_method, mode,
                          occurred_at_device, occurred_at, time_confidence, cost_basis, payload_version)
select tests.id(k), tests.id('biz_a'), tests.id('dev_a'), r, 100, 100, 'cash', 'offline', now(), now(), 'high', 'occurred_at', 1
from (values ('sale1', 'A-000001'), ('sale2', 'A-000002'), ('sale3', 'A-000003')) as s(k, r);
-- Discrepancies: two open on Sardine, one already resolved on Sardine, one open on Milo
insert into public.stock_discrepancies (id, business_id, product_id, sale_id, shortfall_qty) values
  ('e0000000-0000-0000-0000-000000000001', tests.id('biz_a'), tests.id('neg'), tests.id('sale1'), 1),
  ('e0000000-0000-0000-0000-000000000002', tests.id('biz_a'), tests.id('neg'), tests.id('sale2'), 1),
  ('e0000000-0000-0000-0000-000000000004', tests.id('biz_a'), tests.id('milo'), tests.id('sale3'), 1);
insert into public.stock_discrepancies (id, business_id, product_id, sale_id, shortfall_qty, status, resolution, resolved_at) values
  ('e0000000-0000-0000-0000-000000000003', tests.id('biz_a'), tests.id('neg'), tests.id('sale3'), 1, 'resolved', 'sale_voided', now() - interval '1 day');
-- A negative-stock Needs attention item for Sardine (created by sales in Stage 1D; S5 leaves it alone)
insert into tests.ids values ('attn_neg', 'f0000000-0000-0000-0000-000000000001');
insert into public.attention_items (id, business_id, type, entity, entity_id, message_data)
values (tests.id('attn_neg'), tests.id('biz_a'), 'negative_stock', 'product', tests.id('neg'), '{"rule":"C-120"}');

-- Stale (05 L3 limitation): a restock of 1 costing 3000 while at -3 revalues the negative units
-- (C-25) and leaves -2 / -6000 with no average recorded, so the last known average stays 1000
set local role authenticated;
select public.restock(gen_random_uuid(), tests.id('biz_a'), tests.id('stale'), 1, 3000, 0, null);
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');

-- ===========================================================================
-- Definition and privileges
-- ===========================================================================
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc
           where oid = 'public.adjust_stock(uuid,uuid,uuid,text,integer,integer,text)'::regprocedure),
  'TC-INV-70a: adjust_stock exists, SECURITY DEFINER with explicit checks and an empty search_path');
select ok(has_function_privilege('authenticated', 'public.adjust_stock(uuid,uuid,uuid,text,integer,integer,text)', 'execute')
          and not has_function_privilege('anon', 'public.adjust_stock(uuid,uuid,uuid,text,integer,integer,text)', 'execute')
          and not exists (select 1 from information_schema.routine_privileges
                          where routine_schema = 'public' and routine_name = 'adjust_stock' and grantee = 'PUBLIC'),
  'TC-INV-70b: signed-in users can call it; anonymous callers and PUBLIC cannot');
select ok(not has_table_privilege('authenticated', 'public.stock_movements', 'insert')
          and not has_table_privilege('authenticated', 'public.products', 'update')
          and not has_table_privilege('authenticated', 'public.stock_discrepancies', 'update')
          and not has_table_privilege('authenticated', 'public.stock_discrepancies', 'insert'),
  'TC-INV-70c: the app still cannot write movements, product values or discrepancies directly');

-- ===========================================================================
-- Stock losses at the average, with a counted quantity and with a change (TC-LOSS-01, TC-COST-06)
-- ===========================================================================
set local role authenticated;
insert into tests.results select 'l1', public.adjust_stock('77777777-7777-7777-7777-777777777701', tests.id('biz_a'), tests.id('milo'),
  'count_correction', p_counted_qty => 7, p_note => '  Shelf count Monday  ');
insert into tests.ids select 'mv_l1', (tests.r('l1') ->> 'movement_id')::uuid;
reset role;
select is(tests.pv(tests.id('milo')), '7 / 7700', 'TC-LOSS-01 (count down): counted 7 of 10 at 1100: -3 units, -3300; average still 1100');
select ok((select type = 'adjustment' and qty_change = -3 and value = -3300 and reason = 'count_correction' and unit_cost = 1100
                  and note = 'Shelf count Monday' and user_id = '00000000-0000-0000-0000-0000000000a1'
           from public.stock_movements where id = tests.id('mv_l1')),
  'TC-INV-71a: one adjustment movement: reason, unit cost (the average), trimmed note and user recorded');
select ok((select count(*) = 1 and bool_and(cause = 'adjustment' and stock_qty_after = 7 and stock_value_after = 7700 and avg_cost = 1100)
           from public.product_cost_history where movement_id = tests.id('mv_l1')),
  'TC-COST-04 (adjust): one history row (cause adjustment) with the new pool and the unchanged average');
select ok(tests.r('l1') @> '{"outcome":"adjusted","changed":true,"kind":"stock_loss","qty_change":-3,"value_change":-3300,"stock_qty":7,"stock_value":7700,"resolved_discrepancies":1}'::jsonb
          and tests.r('l1') -> 'pool_adjustment' = 'null'::jsonb,
  'TC-INV-71b: the result: a stock loss of 3 / 3300 (C-30), no pool adjustment, Milo''s open discrepancy resolved');
select ok((select count(*) = 1
                  and bool_and(user_id = '00000000-0000-0000-0000-0000000000a1' and entity = 'product' and entity_id = tests.id('milo')
                               and before = '{"stock_qty":10,"stock_value":11000,"cost_known":true}'::jsonb
                               and after @> jsonb_build_object('stock_qty', 7, 'stock_value', 7700, 'reason', 'count_correction',
                                              'kind', 'stock_loss', 'counted_qty', 7, 'qty_change', -3, 'value_change', -3300,
                                              'movement_id', tests.id('mv_l1'), 'resolved_discrepancies', 1)
                               and reason = 'Shelf count Monday')
           from public.audit_log where action = 'adjust_stock' and entity_id = tests.id('milo')),
  'TC-INV-71c (SEC-21): one audit entry, with the stock before and after, reason, count, change and note');

set local role authenticated;
insert into tests.results select 'dmg', tests.adj(tests.id('biz_a'), tests.id('reasons'), 'damaged', null, -2);
insert into tests.results select 'exp', tests.adj(tests.id('biz_a'), tests.id('reasons'), 'expired', 15, null);
insert into tests.results select 'mis', tests.adj(tests.id('biz_a'), tests.id('reasons'), 'missing', null, -1, 'Shelf 3');
insert into tests.results select 'own', tests.adj(tests.id('biz_a'), tests.id('reasons'), 'own_use', null, -4, 'Family dinner');
insert into tests.results select 'oth_dn', tests.adj(tests.id('biz_a'), tests.id('reasons'), 'other', null, -1, 'Given to a neighbour shop');
insert into tests.results select 'cc_up', tests.adj(tests.id('biz_a'), tests.id('reasons'), 'count_correction', 12, null);
insert into tests.results select 'oth_up', tests.adj(tests.id('biz_a'), tests.id('reasons'), 'other', null, 2, 'Box found in the store room');
reset role;
select ok(tests.r('dmg') @> '{"kind":"stock_loss","qty_change":-2,"value_change":-800}'
          and tests.r('exp') @> '{"kind":"stock_loss","qty_change":-3,"value_change":-1200}'
          and tests.r('mis') @> '{"kind":"stock_loss","qty_change":-1,"value_change":-400}',
  'TC-LOSS-01: damaged (change -2), expired (counted 15 of 18) and missing (-1) are stock losses at the average 400');
select ok(tests.r('own') @> '{"kind":"own_use","qty_change":-4,"value_change":-1600}'
          and (select reason = 'own_use' and value = -1600 from public.stock_movements
               where id = (tests.r('own') ->> 'movement_id')::uuid),
  'TC-PUR-09 (C-37): own use is recorded with its own reason and kind, stock reduced at the average');
select ok(tests.r('oth_dn') @> '{"kind":"stock_loss","qty_change":-1,"value_change":-400}'
          and tests.r('oth_up') @> '{"kind":"stock_found","qty_change":2,"value_change":800}',
  'TC-INV-71d (S3): "other" can reduce (a stock loss) or increase (stock found) stock');
select ok(tests.r('cc_up') @> '{"kind":"stock_found","qty_change":3,"value_change":1200,"stock_qty":12,"stock_value":4800}',
  'TC-LOSS-02 (C-31): counting up (9 -> 12) is stock found at the average, not income');
select is(tests.pv(tests.id('reasons')), '14 / 5600', 'TC-COST-06: after every reason, Tomato paste is 14 / 5600: the average is still exactly 400');
select is((select count(*)::int from public.stock_movements where product_id = tests.id('reasons') and type = 'adjustment'), 7,
  'TC-INV-71e: one movement per adjustment');
select is((select count(*)::int from public.audit_log where action = 'adjust_stock' and entity_id = tests.id('reasons')), 7,
  'TC-INV-71f: one audit entry per adjustment');
select is((select count(*)::int from public.attention_items where business_id = tests.id('biz_a')
             and type in ('cost_adjustment','cost_check') and (message_data ->> 'product_id')::uuid in (tests.id('milo'), tests.id('reasons'))), 0,
  'TC-INV-71g: ordinary losses, own use and stock found raise no Needs attention item');

-- ===========================================================================
-- Rounding (round_half_up of qty × value ÷ qty, exact)
-- ===========================================================================
set local role authenticated;
insert into tests.results select 'r1', tests.adj(tests.id('biz_a'), tests.id('third'), 'damaged', null, -1);
insert into tests.results select 'r2', tests.adj(tests.id('biz_a'), tests.id('half'), 'damaged', null, -1);
reset role;
select ok(tests.r('r1') @> '{"value_change":-333}' and tests.pv(tests.id('third')) = '2 / 666',
  'TC-INV-72a: 3 / 999: one unit removed at exactly 333 -> 2 / 666');
select ok(tests.r('r2') @> '{"value_change":-2}' and tests.pv(tests.id('half')) = '1 / 1',
  'TC-INV-72b: 2 / 3: one unit is worth 1.5, rounded half up to 2 -> 1 / 1');
set local role authenticated;
insert into tests.results select 'r3', tests.adj(tests.id('biz_a'), tests.id('half'), 'count_correction', 0, null);
reset role;
select ok(tests.r('r3') @> '{"qty_change":-1,"value_change":-1,"stock_qty":0,"stock_value":0}' and tests.r('r3') -> 'pool_adjustment' = 'null'::jsonb,
  'TC-INV-72c: removing all remaining stock removes exactly the remaining value, so no zero-stock residue (C-25a) arises');

-- ===========================================================================
-- Unknown cost (C-24)
-- ===========================================================================
set local role authenticated;
insert into tests.results select 'u1', tests.adj(tests.id('biz_a'), tests.id('unknown'), 'damaged', null, -1);
insert into tests.results select 'u2', tests.adj(tests.id('biz_a'), tests.id('unknown'), 'count_correction', 6, null);
reset role;
select ok(tests.r('u1') @> '{"qty_change":-1,"value_change":0}' and tests.r('u2') @> '{"qty_change":3,"value_change":0}'
          and tests.pv(tests.id('unknown')) = '6 / 0'
          and (select not cost_known from public.products where id = tests.id('unknown')),
  'TC-INV-73a: unknown cost: quantities change, no value moves, and the cost stays unknown');
select ok((select bool_and(unit_cost is null) from public.stock_movements where product_id = tests.id('unknown') and type = 'adjustment')
          and (select bool_and(avg_cost is null) from public.product_cost_history where product_id = tests.id('unknown')),
  'TC-INV-73b: no unit cost or average is recorded for a product whose cost is unknown');

-- ===========================================================================
-- Stock found while stock is 0 or negative: the last known average (S1)
-- ===========================================================================
set local role authenticated;
insert into tests.results select 'z1', tests.adj(tests.id('biz_a'), tests.id('tozero'), 'count_correction', 0, null);
insert into tests.results select 'z2', tests.adj(tests.id('biz_a'), tests.id('tozero'), 'count_correction', 5, null);
reset role;
select ok(tests.r('z1') @> '{"kind":"stock_loss","qty_change":-2,"value_change":-1000,"stock_qty":0,"stock_value":0}',
  'TC-INV-74a: counting 2 / 1000 down to 0 is a loss of the whole value');
select ok(tests.r('z2') @> '{"kind":"stock_found","qty_change":5,"value_change":2500,"stock_qty":5,"stock_value":2500}'
          and (select unit_cost = 500 from public.stock_movements where id = (tests.r('z2') ->> 'movement_id')::uuid),
  'TC-INV-74b (S1): from 0, 5 found units are valued at the last known average 500 (+2500)');

set local role authenticated;
insert into tests.results select 'n0', tests.adj(tests.id('biz_a'), tests.id('neg'), 'other', null, 1, 'One tin found behind the counter');
reset role;
select ok(tests.r('n0') @> '{"kind":"stock_found","qty_change":1,"value_change":1000,"stock_qty":-1,"stock_value":-1000,"resolved_discrepancies":0}',
  'TC-INV-74c (S1): -2 / -2000 plus 1 found at the last average 1000 -> -1 / -1000');
select is((select count(*)::int from public.stock_discrepancies where product_id = tests.id('neg') and status = 'open'), 2,
  'TC-SYNC-13: while stock is still negative, the discrepancies stay open');
set local role authenticated;
insert into tests.results select 'n1', public.adjust_stock('77777777-7777-7777-7777-777777777702', tests.id('biz_a'), tests.id('neg'),
  'count_correction', p_counted_qty => 10);
insert into tests.ids select 'mv_n1', (tests.r('n1') ->> 'movement_id')::uuid;
reset role;
select ok(tests.r('n1') @> '{"kind":"stock_found","qty_change":11,"value_change":11000,"stock_qty":10,"stock_value":10000,"resolved_discrepancies":2}'
          and tests.r('n1') -> 'pool_adjustment' = 'null'::jsonb,
  'TC-INV-74d (S1, C-32): counted 10 at -1: 11 found at the last average 1000 -> 10 / 10000, no cost adjustment');
select ok((select bool_and(status = 'resolved' and resolution = 'adjustment' and resolved_by_movement_id = tests.id('mv_n1') and resolved_at is not null)
                  and count(*) = 2
           from public.stock_discrepancies where id in ('e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002')),
  'TC-SYNC-13: once stock is >= 0 both open discrepancies are resolved and linked to this adjustment');
select ok((select status = 'resolved' and resolution = 'sale_voided' and resolved_by_movement_id is null and resolved_at < now() - interval '1 hour'
           from public.stock_discrepancies where id = 'e0000000-0000-0000-0000-000000000003'),
  'TC-INV-74e: a discrepancy resolved earlier is left exactly as it was');
select ok((select status = 'open' from public.attention_items where id = tests.id('attn_neg')),
  'TC-INV-74f (S5): the negative-stock Needs attention item is not resolved here (Stage 1D)');
select is((select count(*)::int from public.stock_discrepancies where product_id = tests.id('milo') and status = 'resolved'
             and resolved_by_movement_id = tests.id('mv_l1')), 1,
  'TC-INV-74g: an adjustment that keeps stock >= 0 (Milo''s count) also resolves that product''s open discrepancy');

set local role authenticated;
insert into tests.results select 'nu', tests.adj(tests.id('biz_a'), tests.id('negunk'), 'count_correction', 1, null);
insert into tests.results select 'nv', tests.adj(tests.id('biz_a'), tests.id('never'), 'count_correction', 4, null);
reset role;
select ok(tests.r('nu') @> '{"qty_change":4,"value_change":0,"stock_qty":1,"stock_value":0}'
          and (select not cost_known from public.products where id = tests.id('negunk'))
          and (select unit_cost is null from public.stock_movements where id = (tests.r('nu') ->> 'movement_id')::uuid),
  'TC-INV-74h (S1): no known average (cost never known): found units valued at 0 and the cost stays unknown');
select ok(tests.r('nv') @> '{"qty_change":4,"value_change":0,"stock_qty":4,"stock_value":0}'
          and (select not cost_known from public.products where id = tests.id('never')),
  'TC-INV-74i (S1): the same for a new product with no stock and no cost');

set local role authenticated;
insert into tests.results select 'nc', tests.adj(tests.id('biz_a'), tests.id('negcheck'), 'count_correction', 1, null);
reset role;
select ok(tests.r('nc') @> '{"qty_change":3,"value_change":3000,"stock_qty":1,"stock_value":0}'
          and tests.r('nc') -> 'pool_adjustment' @> '{"reason":"negative_value_correction","value":2000}',
  'TC-INV-74j (C-25b): -2 / -5000 counted to 1 at the last average 1000 leaves value -2000, corrected to 0 by T1''s rule');
select is((select count(*)::int from public.attention_items where type = 'cost_check' and entity_id = tests.id('negcheck') and status = 'open'), 1,
  'TC-INV-74k (C-123): and a "Cost check needed" item is raised');

set local role authenticated;
insert into tests.results select 'st', tests.adj(tests.id('biz_a'), tests.id('stale'), 'count_correction', 0, null);
reset role;
select ok(tests.r('st') @> '{"qty_change":2,"value_change":2000,"stock_qty":0,"stock_value":0}'
          and tests.r('st') -> 'pool_adjustment' @> '{"reason":"zero_stock_residue","value":4000}',
  'TC-INV-74l (S1 limitation, L3): after a restock left -2 / -6000, the last recorded average is still 1000; the 4000 left at 0 stock is a visible cost adjustment (C-25a)');
select is((select count(*)::int from public.attention_items where type = 'cost_adjustment' and status = 'open'
             and entity_id = (tests.r('st') -> 'pool_adjustment' ->> 'movement_id')::uuid), 1,
  'TC-INV-74m (C-122): with its Needs attention item');

-- ===========================================================================
-- No change (S4)
-- ===========================================================================
create temp table before_nc as select (select count(*) from public.stock_movements) as mv, (select count(*) from public.product_cost_history) as hist,
  (select count(*) from public.audit_log) as audit, (select count(*) from public.stock_discrepancies where status = 'open') as open_disc;
grant select on before_nc to authenticated;
set local role authenticated;
insert into tests.results select 'nochg', public.adjust_stock('77777777-7777-7777-7777-777777777703', tests.id('biz_a'), tests.id('milo'),
  'count_correction', p_counted_qty => 7);
reset role;
select is(tests.r('nochg'), jsonb_build_object('product_id', tests.id('milo'), 'outcome', 'no_change', 'changed', false,
  'qty_change', 0, 'value_change', 0, 'stock_qty', 7, 'stock_value', 7700),
  'TC-INV-75a (S4): a count equal to the stock returns no_change');
select ok((select mv = (select count(*) from public.stock_movements) and hist = (select count(*) from public.product_cost_history)
                  and audit = (select count(*) from public.audit_log)
                  and open_disc = (select count(*) from public.stock_discrepancies where status = 'open') from before_nc)
          and tests.pv(tests.id('milo')) = '7 / 7700',
  'TC-INV-75b (S4): no movement, history row, audit entry or discrepancy change; stock unchanged');
select is((select result from public.request_log where request_id = '77777777-7777-7777-7777-777777777703'), tests.r('nochg'),
  'TC-INV-75c (S4): the no_change result is stored for retries');

-- ===========================================================================
-- Refusals: direction, available stock (Q1), validation
-- ===========================================================================
set local role authenticated;
select throws_ok($q$select tests.adj(tests.id('biz_a'), tests.id('milo'), 'damaged', null, -8)$q$, '22023', 'insufficient_stock',
  'TC-INV-76a (Q1): damaging 8 when 7 are in stock is refused');
select throws_ok($q$select tests.adj(tests.id('biz_a'), tests.id('milo'), 'own_use', null, -8)$q$, '22023', 'insufficient_stock',
  'TC-INV-76b (Q1): own use beyond the stock is refused');
select throws_ok($q$select tests.adj(tests.id('biz_a'), tests.id('milo'), 'other', null, -8, 'Note')$q$, '22023', 'insufficient_stock',
  'TC-INV-76c (Q1): "other" beyond the stock is refused');
select throws_ok($q$select tests.adj(tests.id('biz_a'), tests.id('stale'), 'missing', null, -1)$q$, '22023', 'insufficient_stock',
  'TC-INV-76d (Q1): no decrease is allowed at 0 stock');
select throws_ok($q$select tests.adj(tests.id('biz_a'), tests.id('milo'), 'count_correction', null, -8)$q$, '22023', 'count_below_zero',
  'TC-INV-76e (Q1): a count correction given as a change must not leave stock below 0');
select lives_ok($q$select tests.adj(tests.id('biz_a'), tests.id('milo'), 'count_correction', null, -7)$q$,
  'TC-INV-76f (Q1): a count correction down to exactly 0 is accepted');
select lives_ok($q$select tests.adj(tests.id('biz_a'), tests.id('milo'), 'count_correction', 7, null)$q$,
  'TC-INV-76g: (setup) Milo counted back to 7');
select throws_ok($q$select tests.adj(tests.id('biz_a'), tests.id('milo'), 'damaged', null, 1)$q$, '22023', 'reason_requires_decrease',
  'TC-INV-76h: "damaged" cannot increase stock');
select throws_ok($q$select tests.adj(tests.id('biz_a'), tests.id('milo'), 'expired', 9, null)$q$, '22023', 'reason_requires_decrease',
  'TC-INV-76i: "expired" with a count above the stock is refused');
select throws_ok($q$select tests.adj(tests.id('biz_a'), tests.id('milo'), 'missing', null, 2)$q$, '22023', 'reason_requires_decrease',
  'TC-INV-76j: "missing" cannot increase stock');
select throws_ok($q$select tests.adj(tests.id('biz_a'), tests.id('milo'), 'own_use', null, 2)$q$, '22023', 'reason_requires_decrease',
  'TC-INV-76k: "own use" cannot increase stock');
select throws_ok($q$select tests.adj(tests.id('biz_a'), tests.id('milo'), null, 5, null)$q$, '22023', 'reason_required',
  'TC-INV-76l: a reason is required');
select throws_ok($q$select tests.adj(tests.id('biz_a'), tests.id('milo'), 'theft', 5, null)$q$, '22023', 'invalid_reason',
  'TC-INV-76m: an unknown reason is refused');
select throws_ok($q$select tests.adj(tests.id('biz_a'), tests.id('milo'), 'count_correction', 5, -2)$q$, '22023', 'count_or_change_required',
  'TC-INV-76n: a count and a change together are refused');
select throws_ok($q$select tests.adj(tests.id('biz_a'), tests.id('milo'), 'count_correction', null, null)$q$, '22023', 'count_or_change_required',
  'TC-INV-76o: neither a count nor a change is refused');
select throws_ok($q$select tests.adj(tests.id('biz_a'), tests.id('milo'), 'count_correction', -1, null)$q$, '22023', 'invalid_count',
  'TC-INV-76p: a negative count is refused');
select throws_ok($q$select tests.adj(tests.id('biz_a'), tests.id('milo'), 'damaged', null, 0)$q$, '22023', 'invalid_qty',
  'TC-INV-76q: a change of 0 is refused');
select throws_ok($q$select tests.adj(tests.id('biz_a'), tests.id('big'), 'other', null, 100001, 'Note')$q$, '22023', 'invalid_qty',
  'TC-INV-76r (D6): a change of more than 100,000 units is refused');
select throws_ok($q$select tests.adj(tests.id('biz_a'), tests.id('big'), 'count_correction', 100001, null)$q$, '22023', 'invalid_qty',
  'TC-INV-76s (D6): a count more than 100,000 above the stock is refused');
select lives_ok($q$select tests.adj(tests.id('biz_a'), tests.id('big'), 'count_correction', 100000, null)$q$,
  'TC-INV-76t (D6): a change of exactly 100,000 is accepted');
select throws_ok($q$select tests.adj(tests.id('biz_a'), tests.id('big'), 'count_correction', 2147483647, null)$q$, '22023', 'invalid_qty',
  'TC-INV-76u: the largest possible count is refused cleanly (no overflow)');
select throws_ok($q$select tests.adj(tests.id('biz_a'), tests.id('milo'), 'other', null, -1)$q$, '22023', 'note_required',
  'TC-INV-76v (S3): "other" needs a note');
select throws_ok($q$select tests.adj(tests.id('biz_a'), tests.id('milo'), 'other', null, -1, '   ')$q$, '22023', 'note_required',
  'TC-INV-76w (S3): a blank note does not count');
select throws_ok(format('select tests.adj(tests.id(''biz_a''), tests.id(''milo''), ''damaged'', null, -1, %L)', repeat('n', 301)),
  '22023', 'note_too_long', 'TC-INV-76x: a note over 300 characters is refused');
insert into tests.results select 'n300', tests.adj(tests.id('biz_a'), tests.id('milo'), 'damaged', null, -1, '  ' || repeat('n', 300) || '  ');
reset role;
select ok((select char_length(note) = 300 from public.stock_movements where id = (tests.r('n300') ->> 'movement_id')::uuid)
          and (select a.reason is null from public.stock_movements m join public.audit_log a on a.after ->> 'movement_id' = m.id::text
               where m.id = (tests.r('dmg') ->> 'movement_id')::uuid),
  'TC-INV-76y: a 300-character note (after trimming) is accepted; without a note nothing is stored');
select is(tests.pv(tests.id('milo')), '6 / 6600', 'TC-INV-76z: the refused attempts changed nothing (7 / 7700 less the 1 damaged)');

-- ===========================================================================
-- Archived and deleted products (S2)
-- ===========================================================================
set local role authenticated;
insert into tests.results select 'ar', tests.adj(tests.id('biz_a'), tests.id('arch'), 'damaged', null, -1);
select throws_ok($q$select tests.adj(tests.id('biz_a'), tests.id('gone'), 'damaged', null, -1)$q$, 'P0002', 'product_not_found',
  'TC-INV-77a (S2): a deleted product is not found');
reset role;
select ok(tests.r('ar') @> '{"qty_change":-1,"value_change":-50}' and tests.pv(tests.id('arch')) = '2 / 100'
          and (select not active from public.products where id = tests.id('arch')),
  'TC-INV-77b (S2): an archived product can be adjusted and stays archived');

-- ===========================================================================
-- Isolation and membership
-- ===========================================================================
select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select throws_ok($q$select tests.adj(tests.id('biz_a'), tests.id('milo'), 'damaged', null, -1)$q$, '42501', 'not_a_member',
  'TC-INV-78a: owner B cannot adjust through shop A');
select throws_ok($q$select tests.adj(tests.id('biz_b'), tests.id('milo'), 'damaged', null, -1)$q$, 'P0002', 'product_not_found',
  'TC-INV-78b: owner B cannot adjust shop A''s product by passing their own shop');
select throws_ok($q$select tests.adj(tests.id('biz_b'), gen_random_uuid(), 'damaged', null, -1)$q$, 'P0002', 'product_not_found',
  'TC-INV-78c: an unknown product is refused the same way');
reset role;
update public.business_members set active = false where business_id = tests.id('biz_b');
select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select throws_ok($q$select tests.adj(tests.id('biz_b'), tests.id('b_prod'), 'damaged', null, -1)$q$, '42501', 'not_a_member',
  'TC-INV-78d: an inactive membership cannot adjust stock');
reset role;
update public.business_members set active = true where business_id = tests.id('biz_b');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_ok($q$select tests.adj(tests.id('biz_a'), tests.id('milo'), 'damaged', null, -1)$q$, '42501', 'not_authenticated',
  'TC-INV-78e: a call without a signed-in user is refused');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($q$select public.adjust_stock(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), 'damaged', null, -1)$q$, '42501', null,
  'TC-INV-78f: an anonymous caller cannot adjust stock');
reset role;
select ok(tests.pv(tests.id('milo')) = '6 / 6600' and tests.pv(tests.id('b_prod')) = '6 / 720',
  'TC-INV-78g: the refused attempts changed nothing in shop A or shop B');
select tests.as_user('00000000-0000-0000-0000-0000000000a1');

-- ===========================================================================
-- Idempotency and atomicity
-- ===========================================================================
create temp table before_replay as select (select count(*) from public.stock_movements) as mv, (select count(*) from public.audit_log) as audit;
grant select on before_replay to authenticated;
set local role authenticated;
insert into tests.results select 'l1_again', public.adjust_stock('77777777-7777-7777-7777-777777777701', tests.id('biz_a'), tests.id('milo'),
  'count_correction', p_counted_qty => 7, p_note => '  Shelf count Monday  ');
insert into tests.results select 'nochg_again', public.adjust_stock('77777777-7777-7777-7777-777777777703', tests.id('biz_a'), tests.id('milo'),
  'count_correction', p_counted_qty => 7);
reset role;
select is(tests.r('l1_again'), tests.r('l1'), 'TC-INV-79a: repeating the first adjustment returns its original result');
select ok((select mv = (select count(*) from public.stock_movements) and audit = (select count(*) from public.audit_log) from before_replay)
          and tests.pv(tests.id('milo')) = '6 / 6600',
  'TC-INV-79b: the repeat wrote nothing and did not apply the count again (Milo is still 6 / 6600, not 7)');
select is(tests.r('nochg_again'), tests.r('nochg'),
  'TC-INV-79c (S4): repeating the no_change request returns the same outcome, although the stock has changed since');
set local role authenticated;
select throws_ok($q$select public.adjust_stock('77777777-7777-7777-7777-777777777701', tests.id('biz_a2'), tests.id('a2_prod'), 'damaged', null, -1)$q$,
  '22023', 'request_id_reused', 'TC-INV-79d: the same request ID for the owner''s other shop is refused');
select throws_ok($q$select public.set_cost('77777777-7777-7777-7777-777777777701', tests.id('biz_a'), tests.id('milo'), 1200, 'Reason')$q$,
  '22023', 'request_id_reused', 'TC-INV-79e: the same request ID for a different function is refused');
select throws_ok($q$select public.adjust_stock('77777777-7777-7777-7777-777777777704', tests.id('biz_a'), tests.id('milo'), 'damaged', null, -99)$q$,
  '22023', 'insufficient_stock', 'TC-INV-79f: (setup) a refused request');
reset role;
select ok((select mv = (select count(*) from public.stock_movements) and audit = (select count(*) from public.audit_log) from before_replay)
          and not exists (select 1 from public.request_log where request_id = '77777777-7777-7777-7777-777777777704'),
  'TC-INV-79g: a refused adjustment writes nothing at all (no movement, audit entry or claim)');
set local role authenticated;
insert into tests.results select 'retry', public.adjust_stock('77777777-7777-7777-7777-777777777704', tests.id('biz_a'), tests.id('milo'), 'damaged', null, -1);
reset role;
select ok(tests.r('retry') @> '{"qty_change":-1,"stock_qty":5}', 'TC-INV-79h: the same request ID then succeeds');

-- Atomic: an adjustment refused inside the movement helper (stock quantity overflow) after the
-- discrepancy-bearing product was locked leaves nothing behind
update public.products set stock_qty = 2147483600 where id = tests.id('big');
insert into public.stock_discrepancies (id, business_id, product_id, sale_id, shortfall_qty) values
  ('e0000000-0000-0000-0000-000000000005', tests.id('biz_a'), tests.id('big'), tests.id('sale1'), 1);
create temp table before_overflow as select (select count(*) from public.stock_movements) as mv,
  (select count(*) from public.product_cost_history) as hist, (select count(*) from public.audit_log) as audit;
grant select on before_overflow to authenticated;
set local role authenticated;
select throws_ok($q$select public.adjust_stock('77777777-7777-7777-7777-777777777705', tests.id('biz_a'), tests.id('big'), 'other', null, 100, 'Note')$q$,
  '22003', 'stock_qty_out_of_range', 'TC-INV-79i: an adjustment that would overflow the stock quantity is refused');
reset role;
select ok((select mv = (select count(*) from public.stock_movements) and hist = (select count(*) from public.product_cost_history)
                  and audit = (select count(*) from public.audit_log) from before_overflow)
          and (select status = 'open' from public.stock_discrepancies where id = 'e0000000-0000-0000-0000-000000000005')
          and not exists (select 1 from public.request_log where request_id = '77777777-7777-7777-7777-777777777705'),
  'TC-INV-79j (atomic): no movement, discrepancy change or claim survives the refusal');
update public.products set stock_qty = 100000 where id = tests.id('big');
delete from public.stock_discrepancies where id = 'e0000000-0000-0000-0000-000000000005';

-- ===========================================================================
-- History, audit and conservation
-- ===========================================================================
select is((select count(*)::int from public.audit_log where action = 'adjust_stock' and business_id = tests.id('biz_a')),
          (select count(*)::int from public.stock_movements m where m.business_id = tests.id('biz_a') and m.type = 'adjustment'
             and exists (select 1 from public.audit_log a where a.action = 'adjust_stock' and a.after ->> 'movement_id' = m.id::text)),
  'TC-INV-79k: every audit entry points to its own adjustment movement');
select is((select count(*)::int from public.audit_log where action = 'adjust_stock' and business_id = tests.id('biz_a')), 27,
  'TC-INV-79l: exactly one audit entry per accepted adjustment in shop A (27), none for refusals or no_change');
select ok((select bool_and(effective_at > prev) from (
             select effective_at, lag(effective_at) over (partition by product_id order by effective_at) as prev
             from public.product_cost_history where business_id = tests.id('biz_a')) x where prev is not null),
  'TC-INV-79m: history rows are strictly ordered in time for every product');
select ok(tests.pool_conserved(tests.id('biz_a')), 'TC-COST-20 (adjust): conservation holds for every product in shop A');
select ok(tests.pool_conserved(tests.id('biz_a2')) and tests.pool_conserved(tests.id('biz_b')),
  'TC-COST-20 (adjust): conservation holds in the other shops');
select ok(not has_function_privilege('authenticated',
            'private.apply_movement(uuid,uuid,text,integer,bigint,text,numeric,uuid,uuid,text,boolean)', 'execute'),
  'TC-INV-79n: the T1 helpers remain internal');
select throws_ok(format('update public.stock_movements set value = 0 where id = %L', tests.id('mv_l1')), 'P0001', null,
  'TC-INV-79o: a recorded adjustment cannot be changed');
select throws_ok(format('delete from public.stock_movements where id = %L', tests.id('mv_l1')), 'P0001', null,
  'TC-INV-79p: a recorded adjustment cannot be deleted');

select * from finish();
rollback;
