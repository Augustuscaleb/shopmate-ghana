-- Stage 1C, task T1: shared inventory helpers (database only).
--   private.round_half_up        rounding of money amounts (05 C-21)
--   private.max_movement_qty / private.max_entered_amount   input limits (decision D6)
--   private.lock_products        product locks in ID order (09 §4.2 step 2)
--   private.apply_movement       one movement -> product pool + one history row (C-21, C-22),
--                                then the pool rules C-25a and C-25b (05 §3.4)
--   private.raise_attention      Needs attention items without duplicates (decision D8)
-- These helpers are internal: only server functions (T3 onwards) call them, so no API role may
-- execute them. Fixtures are fictitious and everything is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(62);

create schema tests;
grant usage on schema tests to authenticated;
-- IDs captured during the test. v may be null, so that a missing result (e.g. no adjustment
-- created) is reported by the named assertions below instead of aborting the file.
create table tests.ids (k text primary key, v uuid);
grant select, insert on tests.ids to authenticated;
create function tests.id(p_k text) returns uuid language sql stable as $$ select v from tests.ids where k = p_k $$;
-- Full results of apply_movement calls, for assertions on the pool adjustment and attention item.
create table tests.results (k text primary key, r jsonb);
create function tests.r(p_k text) returns jsonb language sql stable as $$ select r from tests.results where k = p_k $$;

-- Conservation (05 §3.2): stock_qty = Σ qty_change, stock_value = Σ value, and the latest
-- history row matches the product, for every product of a business.
create function tests.pool_conserved(p_business uuid) returns boolean language sql stable as $$
  select coalesce(bool_and(
           p.stock_qty = coalesce((select sum(m.qty_change) from public.stock_movements m where m.product_id = p.id), 0)
       and p.stock_value = coalesce((select sum(m.value) from public.stock_movements m where m.product_id = p.id), 0)
       and (not exists (select 1 from public.stock_movements m where m.product_id = p.id)
            or exists (select 1 from (select h.stock_qty_after, h.stock_value_after from public.product_cost_history h
                                      where h.product_id = p.id order by h.effective_at desc limit 1) last
                       where last.stock_qty_after = p.stock_qty and last.stock_value_after = p.stock_value))), true)
  from public.products p where p.business_id = p_business
$$;

-- ---------------------------------------------------------------------------
-- Fixtures: two fictitious owners, each with a shop (created through create_business)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner.a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner.b@example.test');

-- Business IDs are taken from the create_business results (never looked up by name), so the
-- file is repeatable even when other test suites have left shops in the local database.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
insert into tests.ids select 'biz_b',
  (public.create_business(gen_random_uuid(), 'Kofi Test Mart', 'provision', 'Kumasi', null) ->> 'business_id')::uuid;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
insert into tests.ids select 'biz_a',
  (public.create_business(gen_random_uuid(), 'Ama Test Provisions', 'provision', 'Accra', null) ->> 'business_id')::uuid;
reset role;

-- Products are inserted directly here (as the test superuser) only to set up fixtures;
-- the API cannot write products, and create_product comes in T3.
insert into tests.ids (k, v) values
  ('milo',    'a0000000-0000-0000-0000-000000000001'),
  ('sardine', 'a0000000-0000-0000-0000-000000000002'),
  ('rice',    'a0000000-0000-0000-0000-000000000003'),
  ('soap',    'a0000000-0000-0000-0000-000000000004'),
  ('oil',     'a0000000-0000-0000-0000-000000000005'),
  ('sugar',   'a0000000-0000-0000-0000-000000000006'),
  ('kofi',    'b0000000-0000-0000-0000-000000000001');
insert into public.products (id, business_id, name, selling_price)
select tests.id(k), tests.id('biz_a'), n, 150
from (values ('milo','Milo sachet'), ('sardine','Sardine tin'), ('rice','Rice 1kg'),
             ('soap','Soap bar'), ('oil','Cooking oil'), ('sugar','Sugar cube')) as f(k, n);
insert into public.products (id, business_id, name, selling_price)
values (tests.id('kofi'), tests.id('biz_b'), 'Kofi product', 200);

-- ===========================================================================
-- Rounding and limits
-- ===========================================================================
select is(private.round_half_up(2.5), 3::bigint, 'TC-INV-01a: round_half_up(2.5) = 3');
select is(private.round_half_up(2.4999), 2::bigint, 'TC-INV-01b: round_half_up(2.4999) = 2');
select is(private.round_half_up(-2.5), -3::bigint, 'TC-INV-01c: round_half_up(-2.5) = -3 (half away from zero)');
select is(private.round_half_up(-2.4), -2::bigint, 'TC-INV-01d: round_half_up(-2.4) = -2');
select is(private.round_half_up(5 * (24920::numeric / 22)), 5664::bigint, 'TC-INV-01e: 5 x average 1132.7272... = 5663.63... rounds to 5664');
select is(private.round_half_up(null), null::bigint, 'TC-INV-01f: round_half_up(null) is null');
select throws_ok('select private.round_half_up(1e19)', '22003', 'amount_out_of_range',
  'TC-INV-01g: an amount beyond the bigint range is refused, not wrapped');
select is(private.max_movement_qty(), 100000, 'TC-INV-02a: movement quantity limit is 100,000 (D6)');
select is(private.max_entered_amount(), 100000000::bigint, 'TC-INV-02b: entered amount limit is GH₵ 1,000,000 = 100,000,000 pesewas (D6)');

-- ===========================================================================
-- Product locking (09 §4.2 step 2)
-- ===========================================================================
select lives_ok(format('select private.lock_products(%L, array[%L, %L]::uuid[])',
  tests.id('biz_a'), tests.id('sardine'), tests.id('milo')),
  'TC-INV-03a: products of the business can be locked (in any order of input)');
select throws_ok(format('select private.lock_products(%L, array[%L, %L]::uuid[])',
  tests.id('biz_a'), tests.id('milo'), tests.id('kofi')),
  'P0002', 'product_not_found', 'TC-INV-03b: another business''s product cannot be locked');
select throws_ok(format('select private.lock_products(%L, array[]::uuid[])', tests.id('biz_a')),
  '22023', 'products_required', 'TC-INV-03c: an empty product list is refused');
select throws_ok(format('select private.lock_products(%L, array[%L]::uuid[])', tests.id('biz_a'), gen_random_uuid()),
  'P0002', 'product_not_found', 'TC-INV-03d: an unknown product is refused');

-- ===========================================================================
-- apply_movement: pool, movement and history (C-21, C-22). TC-COST-01 at helper level.
-- ===========================================================================
insert into tests.ids select 'mv_open',
  (private.apply_movement(tests.id('biz_a'), tests.id('milo'), 'opening', 10, 11000, p_marks_cost_known => true) ->> 'movement_id')::uuid;
select ok((select stock_qty = 10 and stock_value = 11000 and cost_known from public.products where id = tests.id('milo')),
  'TC-INV-04a: opening stock 10 at 11000 sets qty 10, value 11000 and marks the cost as known');
select ok((select h.cause = 'opening' and h.stock_qty_after = 10 and h.stock_value_after = 11000 and h.avg_cost = 1100.0000
                  and h.movement_id = tests.id('mv_open')
           from public.product_cost_history h where h.product_id = tests.id('milo')),
  'TC-INV-04b: the opening movement wrote one history row: qty 10, value 11000, average 1100.0000');
select is((select user_id from public.stock_movements where id = tests.id('mv_open')),
  '00000000-0000-0000-0000-0000000000a1'::uuid, 'TC-INV-04c: the movement records the signed-in user');

insert into public.purchases (id, business_id, product_id, qty, purchase_cost, purchased_on)
values ('c0000000-0000-0000-0000-000000000001', tests.id('biz_a'), tests.id('milo'), 12, 13920, current_date);
insert into tests.ids values ('pur_milo', 'c0000000-0000-0000-0000-000000000001');
select is(private.apply_movement(tests.id('biz_a'), tests.id('milo'), 'restock', 12, 13920,
            p_purchase_id => tests.id('pur_milo'), p_marks_cost_known => true) -> 'pool_adjustment',
  'null'::jsonb, 'TC-INV-04d: a normal restock needs no pool adjustment');
select ok((select stock_qty = 22 and stock_value = 24920 from public.products where id = tests.id('milo')),
  'TC-COST-01 (helper): 10 / 11000 plus 12 costing 13920 gives 22 / 24920');
select is((select avg_cost from public.product_cost_history where product_id = tests.id('milo') order by effective_at desc limit 1),
  1132.7273::numeric(18,4), 'TC-COST-01 (helper): average after the restock is 1132.7273 (4 dp)');
select is((select purchase_id from public.stock_movements where product_id = tests.id('milo') and type = 'restock'),
  tests.id('pur_milo'), 'TC-INV-04e (D3): the restock movement links to its purchase');

select private.apply_movement(tests.id('biz_a'), tests.id('milo'), 'adjustment', -2,
  -private.round_half_up(2 * (24920::numeric / 22)), p_reason => 'damaged');
select ok((select stock_qty = 20 and stock_value = 22655 from public.products where id = tests.id('milo')),
  'TC-INV-04f: a loss of 2 at the average (2265) gives 20 / 22655');
select is((select count(*) from public.product_cost_history where product_id = tests.id('milo'))::int,
  (select count(*) from public.stock_movements where product_id = tests.id('milo'))::int,
  'TC-COST-04 (helper): exactly one history row per movement');
select ok((select bool_and(effective_at > prev) from (
             select effective_at, lag(effective_at) over (order by effective_at) as prev
             from public.product_cost_history where product_id = tests.id('milo')) x where prev is not null),
  'TC-INV-04g: history rows of one product are strictly ordered in time, even within one transaction');

-- ===========================================================================
-- Pool rule C-25a: stock reaches 0 but value is not 0 -> cost adjustment (TC-COST-03)
-- ===========================================================================
select private.apply_movement(tests.id('biz_a'), tests.id('sardine'), 'opening', 3, 1000, p_marks_cost_known => true);
insert into tests.results select 'sardine',
  private.apply_movement(tests.id('biz_a'), tests.id('sardine'), 'adjustment', -3, -990, p_reason => 'count_correction');
insert into tests.ids select 'adj_sardine', (tests.r('sardine') -> 'pool_adjustment' ->> 'movement_id')::uuid;
select is(tests.r('sardine') -> 'pool_adjustment' ->> 'reason', 'zero_stock_residue',
  'TC-COST-03: leftover 10 at stock 0: a pool adjustment is created, reason zero_stock_residue');
select is((tests.r('sardine') -> 'pool_adjustment' ->> 'value')::bigint, -10::bigint,
  'TC-COST-03: the pool adjustment value is -10');
select isnt(tests.r('sardine') ->> 'attention_item_id', null,
  'TC-COST-03: threshold: a leftover of exactly GH₵ 0.10 returns a Needs attention item');
select ok((select stock_qty = 0 and stock_value = 0 from public.products where id = tests.id('sardine')),
  'TC-COST-03: stock 0 with value 10 left over: the leftover is removed, value is 0');
select ok((select type = 'cost_adjustment' and reason = 'zero_stock_residue' and qty_change = 0 and value = -10
           from public.stock_movements where id = tests.id('adj_sardine')),
  'TC-COST-03: the leftover is posted as a visible cost adjustment (zero_stock_residue, -10)');
select ok((select h.cause = 'cost_adjustment' and h.stock_qty_after = 0 and h.stock_value_after = 0 and h.avg_cost is null
           from public.product_cost_history h where h.movement_id = tests.id('adj_sardine')),
  'TC-COST-03: the cost adjustment wrote its own history row (qty 0, value 0, no average)');
select is((select count(*) from public.attention_items
           where business_id = tests.id('biz_a') and type = 'cost_adjustment'
             and entity = 'stock_movement' and entity_id = tests.id('adj_sardine') and status = 'open')::int, 1,
  'TC-COST-03: a leftover of GH₵ 0.10 or more raises a Needs attention item (C-122)');

select private.apply_movement(tests.id('biz_a'), tests.id('rice'), 'opening', 3, 1000, p_marks_cost_known => true);
insert into tests.results select 'rice',
  private.apply_movement(tests.id('biz_a'), tests.id('rice'), 'adjustment', -3, -995, p_reason => 'count_correction');
insert into tests.ids select 'adj_rice', (tests.r('rice') -> 'pool_adjustment' ->> 'movement_id')::uuid;
select is(tests.r('rice') -> 'pool_adjustment' ->> 'reason', 'zero_stock_residue',
  'TC-COST-03: leftover 5 at stock 0: a pool adjustment is also created, reason zero_stock_residue');
select ok((select stock_value = 0 from public.products where id = tests.id('rice'))
          and (select value = -5 from public.stock_movements where id = tests.id('adj_rice')),
  'TC-COST-03: a leftover under GH₵ 0.10 is also adjusted to 0 (value -5; shown as rounding)');
select is(tests.r('rice') ->> 'attention_item_id', null,
  'TC-COST-03: threshold: a leftover of GH₵ 0.05 returns no Needs attention item');
select is((select count(*) from public.attention_items where entity_id = tests.id('adj_rice'))::int, 0,
  'TC-COST-03: a leftover under GH₵ 0.10 raises no Needs attention item');

select private.apply_movement(tests.id('biz_a'), tests.id('soap'), 'opening', 2, 200, p_marks_cost_known => true);
insert into tests.results select 'soap',
  private.apply_movement(tests.id('biz_a'), tests.id('soap'), 'adjustment', -2, -207, p_reason => 'count_correction');
select is(tests.r('soap') -> 'pool_adjustment' ->> 'reason', 'zero_stock_residue',
  'TC-COST-03: a negative leftover (value -7 at stock 0) creates a pool adjustment, reason zero_stock_residue');
select is((tests.r('soap') -> 'pool_adjustment' ->> 'value')::bigint, 7::bigint,
  'TC-COST-03: the negative leftover is adjusted upwards by +7');
select is(tests.r('soap') ->> 'attention_item_id', null,
  'TC-COST-03: threshold uses the size of the amount: GH₵ 0.07 (either sign) raises no item');

-- ===========================================================================
-- Pool rule C-25b: stock positive but value negative -> adjustment + "Cost check needed"
-- ===========================================================================
select private.apply_movement(tests.id('biz_a'), tests.id('oil'), 'opening', 5, 500, p_marks_cost_known => true);
insert into tests.ids select 'adj_oil',
  (private.apply_movement(tests.id('biz_a'), tests.id('oil'), 'adjustment', -1, -700, p_reason => 'other')
     -> 'pool_adjustment' ->> 'movement_id')::uuid;
select ok((select stock_qty = 4 and stock_value = 0 from public.products where id = tests.id('oil')),
  'TC-INV-05a (C-25b): stock 4 with value -200 is brought to value 0');
select ok((select type = 'cost_adjustment' and reason = 'negative_value_correction' and value = 200
           from public.stock_movements where id = tests.id('adj_oil')),
  'TC-INV-05b (C-25b): the correction is a visible cost adjustment (negative_value_correction, +200)');
select ok((select count(*) = 1 and bool_and(entity = 'product' and status = 'open')
           from public.attention_items where type = 'cost_check' and entity_id = tests.id('oil')),
  'TC-INV-05c (C-25b, C-123): one open "Cost check needed" item for the product');
select ok((select avg_cost is null from public.product_cost_history h
           join public.stock_movements m on m.id = h.movement_id
           where m.product_id = tests.id('oil') and m.type = 'adjustment'),
  'TC-INV-05d: the history row for the moment value was negative has no average (never a negative average)');

-- A second C-25b on the same product while the first item is still open (D8)
select private.apply_movement(tests.id('biz_a'), tests.id('oil'), 'adjustment', -1, -50, p_reason => 'other');
select ok((select count(*) = 1 and bool_and((message_data ->> 'occurrences')::int = 2)
           from public.attention_items where type = 'cost_check' and entity_id = tests.id('oil')),
  'TC-INV-05e (D8): a repeat keeps one open item and counts the occurrence instead of duplicating it');

select ok(tests.pool_conserved(tests.id('biz_a')),
  'TC-COST-20 (helper): conservation holds for every product after all movements and adjustments');

-- ===========================================================================
-- Refusals change nothing (D6 limits, overflow, business isolation)
-- ===========================================================================
create temp table before_counts as
  select (select count(*) from public.stock_movements) as movements, (select count(*) from public.product_cost_history) as history;

select throws_ok(format('select private.apply_movement(%L, %L, ''adjustment'', -100001, -1, p_reason => ''other'')',
  tests.id('biz_a'), tests.id('milo')), '22023', 'qty_limit_exceeded',
  'TC-INV-06a (D6): a movement of more than 100,000 units is refused');
select throws_ok(format('select private.apply_movement(%L, %L, ''opening'', 1, 100)', tests.id('biz_a'), tests.id('kofi')),
  'P0002', 'product_not_found', 'TC-INV-06b: a movement cannot touch another business''s product');
select throws_ok(format('select private.apply_movement(%L, %L, ''opening'', 1, null)', tests.id('biz_a'), tests.id('milo')),
  '22023', 'value_required', 'TC-INV-06c: a movement without a value is refused');

update public.products set stock_qty = 2147480000 where id = tests.id('sugar');
select throws_ok(format('select private.apply_movement(%L, %L, ''adjustment'', 100000, 0, p_reason => ''count_correction'')',
  tests.id('biz_a'), tests.id('sugar')), '22003', 'stock_qty_out_of_range',
  'TC-INV-06d (D6): a quantity that would overflow is refused');
update public.products set stock_qty = 1, stock_value = 9223372036854775000 where id = tests.id('sugar');
select throws_ok(format('select private.apply_movement(%L, %L, ''adjustment'', 1, 1000, p_reason => ''count_correction'')',
  tests.id('biz_a'), tests.id('sugar')), '22003', 'stock_value_out_of_range',
  'TC-INV-06e (D6): a value that would overflow is refused');
update public.products set stock_qty = 0, stock_value = 0 where id = tests.id('sugar');

select throws_ok(format('select private.apply_movement(%L, %L, ''value_correction'', 0, 0)', tests.id('biz_a'), tests.id('milo')),
  '22023', 'empty_movement', 'TC-INV-06h (H3): a movement with no quantity and no value is refused');
select throws_ok(format('select private.write_movement(%L, %L, ''value_correction'', 0, 0, null, null, null, null, null)',
  tests.id('biz_a'), tests.id('milo')), '22023', 'empty_movement',
  'TC-INV-06i (H3): write_movement refuses an empty movement too');
select throws_ok(format('select private.write_movement(%L, %L, ''opening'', 1, 100, null, null, null, null, null)',
  tests.id('biz_a'), tests.id('kofi')), 'P0002', 'product_not_found',
  'TC-INV-06j: write_movement cannot touch another business''s product');

update public.products set stock_qty = 1, stock_value = 0, cost_known = true where id = tests.id('sugar');
select throws_ok(format('select private.apply_movement(%L, %L, ''value_correction'', 0, 100000000000000)',
  tests.id('biz_a'), tests.id('sugar')), '22003', 'average_out_of_range',
  'TC-INV-06k (H2): an average of 10^14 pesewas or more is refused with a clear error, not a raw numeric overflow');

select ok((select movements = (select count(*) from public.stock_movements)
              and history = (select count(*) from public.product_cost_history) from before_counts),
  'TC-INV-06f: refused movements wrote nothing');
select ok((select stock_qty = 0 and stock_value = 0 from public.products where id = tests.id('kofi')),
  'TC-INV-06g: the other business''s product is unchanged');
select is((private.apply_movement(tests.id('biz_a'), tests.id('sugar'), 'value_correction', 0, 99999999999999)
             ->> 'stock_value')::bigint, 99999999999999::bigint,
  'TC-INV-06l (H2): the largest average that fits numeric(18,4) (99,999,999,999,999 at qty 1) is accepted');

-- ===========================================================================
-- Needs attention without duplicates (D8)
-- ===========================================================================
select has_index('public', 'attention_items', 'attention_items_open_uq', 'TC-INV-07a: unique index on open attention items exists');
select throws_ok(format($q$insert into public.attention_items (business_id, type, entity, entity_id, message_data)
                           values (%L, 'cost_check', 'product', %L, '{}')$q$, tests.id('biz_a'), tests.id('oil')),
  '23505', null, 'TC-INV-07b (D8): the database itself refuses a second open item of the same type for the same product');
update public.attention_items set status = 'acknowledged', acknowledged_by = '00000000-0000-0000-0000-0000000000a1',
                                  acknowledged_at = now()
where type = 'cost_check' and entity_id = tests.id('oil');
insert into tests.ids select 'att_oil_new',
  private.raise_attention(tests.id('biz_a'), 'cost_check', 'product', tests.id('oil'), '{"rule":"C-25b"}');
select ok(tests.id('att_oil_new') is not null
          and (select status = 'open' from public.attention_items where id = tests.id('att_oil_new'))
          and tests.id('att_oil_new') not in (select id from public.attention_items
                                              where type = 'cost_check' and entity_id = tests.id('oil') and status = 'acknowledged'),
  'TC-INV-07c: after the owner acknowledges an item, a new event raises a new open item');
select throws_ok(format($q$select private.raise_attention(%L, 'cost_check', 'product', %L, '"text"')$q$,
  tests.id('biz_a'), tests.id('oil')), '22023', 'message_data_must_be_object',
  'TC-INV-07d: attention message data must be a JSON object');

-- ===========================================================================
-- Indexes and privileges: the helpers are internal only
-- ===========================================================================
select has_index('public', 'products', 'products_active_idx', 'TC-INV-08a: partial index on active products exists (for exact counts, D7)');
select ok(not exists (
  select 1 from (values
    ('private.round_half_up(numeric)'), ('private.max_movement_qty()'), ('private.max_entered_amount()'),
    ('private.lock_products(uuid,uuid[])'),
    ('private.apply_movement(uuid,uuid,text,integer,bigint,text,numeric,uuid,uuid,text,boolean)'),
    ('private.write_movement(uuid,uuid,text,integer,bigint,text,numeric,uuid,uuid,text)'),
    ('private.raise_attention(uuid,text,text,uuid,jsonb)')) f(sig),
  (values ('anon'), ('authenticated')) r(role)
  where has_function_privilege(r.role, f.sig, 'execute')),
  'TC-INV-08b (SEC-11): no API role (anon, authenticated) can execute any inventory helper');
select ok(not has_table_privilege('authenticated', 'public.products', 'insert')
          and not has_table_privilege('authenticated', 'public.products', 'update')
          and not has_table_privilege('authenticated', 'public.stock_movements', 'insert')
          and not has_table_privilege('authenticated', 'public.attention_items', 'insert'),
  'TC-INV-08c: the API still cannot write products, movements or attention items directly');

select * from finish();
rollback;
