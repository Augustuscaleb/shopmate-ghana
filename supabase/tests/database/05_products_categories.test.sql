-- Stage 1C, task T3: product and category management.
--   public.create_product        new product, optional opening stock and cost (04 §2.1; C-21)
--   public.update_product        name, category, unit, selling price, low-stock level (audit-logged)
--   public.set_product_archived  archive / restore with active = false (D4); never deletes
--   categories                   direct writes (RLS), archive refused while active products use it (D5)
-- Called as signed-in owners exactly as the API does (role authenticated + JWT claims).
-- Fixtures are fictitious and everything is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(109);

create schema tests;
grant usage on schema tests to authenticated, anon;
create table tests.ids (k text primary key, v uuid);
grant select, insert, update on tests.ids to authenticated;
grant select on tests.ids to anon;
create function tests.id(p_k text) returns uuid language sql stable as $$ select v from tests.ids where k = p_k $$;
grant execute on function tests.id(text) to authenticated, anon;
create function tests.cur(p_product uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name', p.name, 'selling_price', p.selling_price, 'category_id', p.category_id,
                            'unit', p.unit, 'low_stock_level', p.low_stock_level)
  from public.products p where p.id = p_product $$;  -- the five fields as last read (update_product p_expected)
grant execute on function tests.cur(uuid) to authenticated;
create table tests.results (k text primary key, r jsonb);
grant select, insert on tests.results to authenticated;
create function tests.r(p_k text) returns jsonb language sql stable as $$ select r from tests.results where k = p_k $$;
grant execute on function tests.r(text) to authenticated;

create function tests.as_user(p_user text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end $$;

-- create_product with only the required fields plus named options (keeps calls readable)
create function tests.mk(p_biz uuid, p_name text, p_price bigint) returns uuid language sql as $$
  select (public.create_product(gen_random_uuid(), p_biz, p_name, p_price) ->> 'product_id')::uuid
$$;
grant execute on function tests.mk(uuid, text, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures: owners A and B, each with a shop (IDs from create_business results)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner.a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner.b@example.test');

select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
insert into tests.ids select 'biz_b',
  (public.create_business(gen_random_uuid(), 'Kofi Test Mart', 'provision', 'Kumasi', null) ->> 'business_id')::uuid;
insert into public.categories (business_id, name) values (tests.id('biz_b'), 'B drinks');
insert into tests.ids select 'cat_b', id from public.categories where business_id = tests.id('biz_b');
reset role;

select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
insert into tests.ids select 'biz_a',
  (public.create_business(gen_random_uuid(), 'Ama Test Provisions', 'provision', 'Accra', null) ->> 'business_id')::uuid;
insert into public.categories (business_id, name) values (tests.id('biz_a'), 'Beverages'), (tests.id('biz_a'), 'Toiletries');
insert into tests.ids select 'cat_bev', id from public.categories where business_id = tests.id('biz_a') and name = 'Beverages';
insert into tests.ids select 'cat_toil', id from public.categories where business_id = tests.id('biz_a') and name = 'Toiletries';

-- ===========================================================================
-- Function definitions and privileges
-- ===========================================================================
reset role;
select ok((select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
           from pg_proc p where p.oid in ('public.create_product(uuid,uuid,text,bigint,uuid,text,bigint,integer,integer)'::regprocedure,
                                          'public.update_product(uuid,uuid,uuid,text,bigint,uuid,text,integer,jsonb)'::regprocedure,
                                          'public.set_product_archived(uuid,uuid,uuid,boolean)'::regprocedure)),
  'TC-INV-20a: the three product functions exist, run as SECURITY DEFINER with explicit checks, and have an empty search_path');
select ok(not exists (
  select 1 from (values ('public.create_product(uuid,uuid,text,bigint,uuid,text,bigint,integer,integer)'),
                        ('public.update_product(uuid,uuid,uuid,text,bigint,uuid,text,integer,jsonb)'),
                        ('public.set_product_archived(uuid,uuid,uuid,boolean)')) f(sig)
  where has_function_privilege('anon', f.sig, 'execute')
     or not has_function_privilege('authenticated', f.sig, 'execute')),
  'TC-INV-20b: signed-in users can call them; anonymous callers cannot');
select ok(not exists (select 1 from information_schema.routine_privileges
                      where routine_schema = 'public' and grantee = 'PUBLIC'
                        and routine_name in ('create_product', 'update_product', 'set_product_archived')),
  'TC-INV-20c: none is granted to PUBLIC');
select ok(not has_table_privilege('authenticated', 'public.products', 'insert')
          and not has_table_privilege('authenticated', 'public.products', 'update')
          and not has_table_privilege('authenticated', 'public.products', 'delete')
          and not has_table_privilege('anon', 'public.products', 'select'),
  'TC-INV-20d: still no direct client writes (or deletes) on products');

-- ===========================================================================
-- create_product
-- ===========================================================================
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;

insert into tests.results select 'milo_res',
  public.create_product('44444444-4444-4444-4444-444444444401', tests.id('biz_a'), '  Milo sachet  ', 150,
                        p_category_id => tests.id('cat_bev'), p_unit => ' sachet ', p_cost_price => 110,
                        p_opening_stock => 10, p_low_stock_level => 3);
insert into tests.ids select 'milo', (tests.r('milo_res') ->> 'product_id')::uuid;
select ok((select name = 'Milo sachet' and selling_price = 150 and category_id = tests.id('cat_bev') and unit = 'sachet'
                  and low_stock_level = 3 and active and deleted_at is null
           from public.products where id = tests.id('milo')),
  'TC-INV-21a: a product is created with its fields stored, name and unit trimmed');
select ok((select stock_qty = 10 and stock_value = 1100 and cost_known from public.products where id = tests.id('milo')),
  'TC-INV-21b: opening stock 10 at cost 110 gives stock 10, value 1100, cost known (C-21)');
select ok((select count(*) = 1 and bool_and(type = 'opening' and qty_change = 10 and value = 1100 and unit_cost = 110
                                           and user_id = '00000000-0000-0000-0000-0000000000a1')
           from public.stock_movements where product_id = tests.id('milo')),
  'TC-INV-21c: the opening stock is one movement of type opening, recorded with the signed-in user');
select ok((select count(*) = 1 and bool_and(cause = 'opening' and avg_cost = 110.0000)
           from public.product_cost_history where product_id = tests.id('milo')),
  'TC-INV-21d: one history row with average 110.0000');
select is((tests.r('milo_res') ->> 'movement_id')::uuid,
          (select id from public.stock_movements where product_id = tests.id('milo')),
  'TC-INV-21e: the result returns the product and its opening movement');
select ok((select count(*) = 1 and bool_and(after ->> 'name' = 'Milo sachet' and (after ->> 'selling_price')::bigint = 150
                                           and user_id = '00000000-0000-0000-0000-0000000000a1')
           from public.audit_log where action = 'create_product' and entity_id = tests.id('milo')),
  'TC-INV-21f: creation is audit-logged');

-- Repeating the same request returns the original result and creates nothing new
select is(public.create_product('44444444-4444-4444-4444-444444444401', tests.id('biz_a'), 'Milo sachet', 150,
                                p_opening_stock => 10, p_cost_price => 110) ->> 'product_id',
          tests.id('milo')::text, 'TC-INV-21g: repeating create_product with the same request ID returns the original product');
select is((select count(*) from public.products where business_id = tests.id('biz_a') and lower(name) = 'milo sachet')::int, 1,
  'TC-INV-21h: the repeat created no second product');
select is((select count(*) from public.stock_movements where product_id = tests.id('milo'))::int, 1,
  'TC-INV-21i: the repeat wrote no second opening movement');
select throws_ok($q$select public.update_product('44444444-4444-4444-4444-444444444401', tests.id('biz_a'), tests.id('milo'), 'X', 1, null, null, 5, tests.cur(tests.id('milo')))$q$,
  '22023', 'request_id_reused', 'TC-INV-21j: a request ID cannot be reused for a different function');

-- Only required fields
insert into tests.ids select 'soap', tests.mk(tests.id('biz_a'), 'Soap bar', 500);
select ok((select stock_qty = 0 and stock_value = 0 and not cost_known and low_stock_level = 5 and category_id is null and unit is null
           from public.products where id = tests.id('soap')),
  'TC-INV-21k: with only name and price: stock 0, value 0, cost unknown, low-stock level 5 (default)');
select is((select count(*) from public.stock_movements where product_id = tests.id('soap'))::int, 0,
  'TC-INV-21l: no opening stock means no movement');

-- Opening stock without a cost, and a zero cost
insert into tests.ids select 'rice', (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Rice 1kg', 1500, p_opening_stock => 4) ->> 'product_id')::uuid;
select ok((select stock_qty = 4 and stock_value = 0 and not cost_known from public.products where id = tests.id('rice'))
          and (select avg_cost is null from public.product_cost_history where product_id = tests.id('rice')),
  'TC-INV-21m: opening stock without a cost: value 0, cost unknown, no average (C-24)');
insert into tests.ids select 'gift', (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Free sample', 100, p_cost_price => 0, p_opening_stock => 2) ->> 'product_id')::uuid;
select ok((select stock_qty = 2 and stock_value = 0 and cost_known from public.products where id = tests.id('gift'))
          and (select avg_cost = 0 from public.product_cost_history where product_id = tests.id('gift')),
  'TC-INV-21n: a cost of 0 is a known cost (average 0.0000)');
select throws_ok($q$select public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Cost no stock', 100, p_cost_price => 50)$q$,
  '22023', 'cost_price_needs_opening_stock', 'TC-INV-21o: a cost price without opening stock is refused (nothing to value)');

-- Selling price: > 0 and at most GH₵ 1,000,000
select throws_ok($q$select tests.mk(tests.id('biz_a'), 'Price zero', 0)$q$, '22023', 'invalid_selling_price', 'TC-INV-22a: price 0 is refused');
select throws_ok($q$select tests.mk(tests.id('biz_a'), 'Price negative', -1)$q$, '22023', 'invalid_selling_price', 'TC-INV-22b: a negative price is refused');
select throws_ok($q$select tests.mk(tests.id('biz_a'), 'Price null', null)$q$, '22023', 'invalid_selling_price', 'TC-INV-22c: a missing price is refused');
select throws_ok($q$select tests.mk(tests.id('biz_a'), 'Price too high', 100000001)$q$, '22023', 'invalid_selling_price', 'TC-INV-22d: GH₵ 1,000,000.01 is refused');
select isnt(tests.mk(tests.id('biz_a'), 'Price one pesewa', 1), null, 'TC-INV-22e: 1 pesewa (GH₵ 0.01) is accepted');
select isnt(tests.mk(tests.id('biz_a'), 'Price maximum', 100000000), null, 'TC-INV-22f: exactly GH₵ 1,000,000.00 is accepted');

-- Name
select throws_ok($q$select tests.mk(tests.id('biz_a'), null, 100)$q$, '22023', 'name_required', 'TC-INV-23a: a missing name is refused');
select throws_ok($q$select tests.mk(tests.id('biz_a'), '   ', 100)$q$, '22023', 'name_required', 'TC-INV-23b: a blank name is refused');
select throws_ok(format('select tests.mk(tests.id(''biz_a''), %L, 100)', repeat('x', 101)), '22023', 'name_too_long',
  'TC-INV-23c: a name of 101 characters is refused');
select isnt(tests.mk(tests.id('biz_a'), repeat('y', 100), 100), null, 'TC-INV-23d: a name of exactly 100 characters is accepted');
select throws_ok($q$select tests.mk(tests.id('biz_a'), 'MILO SACHET', 100)$q$, '23505', 'duplicate_product_name',
  'TC-INV-23e: the same name in different letter case is refused within one shop');
select throws_ok($q$select tests.mk(tests.id('biz_a'), '  milo sachet ', 100)$q$, '23505', 'duplicate_product_name',
  'TC-INV-23f: the same name with extra spaces is refused');

-- Other fields
select throws_ok(format('select public.create_product(gen_random_uuid(), tests.id(''biz_a''), ''Unit long'', 100, p_unit => %L)', repeat('u', 31)),
  '22023', 'unit_too_long', 'TC-INV-24a: a unit of more than 30 characters is refused');
-- (volatile calls are made once, into tests.ids, never inside a WHERE predicate)
insert into tests.ids select 'unit_blank', (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Unit blank', 100, p_unit => '   ') ->> 'product_id')::uuid;
select is((select unit from public.products where id = tests.id('unit_blank')), null, 'TC-INV-24b: a blank unit is stored as no unit');
select throws_ok($q$select public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Stock negative', 100, p_opening_stock => -1)$q$,
  '22023', 'invalid_opening_stock', 'TC-INV-24c: negative opening stock is refused');
select throws_ok($q$select public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Stock too high', 100, p_opening_stock => 100001)$q$,
  '22023', 'invalid_opening_stock', 'TC-INV-24d: opening stock above 100,000 is refused (D6)');
insert into tests.ids select 'stock_max',
  (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Stock maximum', 100000000, p_opening_stock => 100000, p_cost_price => 100000000) ->> 'product_id')::uuid;
select is((select stock_value from public.products where id = tests.id('stock_max')),
  10000000000000::bigint, 'TC-INV-24e: the largest opening (100,000 x GH₵ 1,000,000) is valued exactly at 10^13 pesewas');
select throws_ok($q$select public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Cost negative', 100, p_opening_stock => 1, p_cost_price => -1)$q$,
  '22023', 'invalid_cost_price', 'TC-INV-24f: a negative cost price is refused');
select throws_ok($q$select public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Cost too high', 100, p_opening_stock => 1, p_cost_price => 100000001)$q$,
  '22023', 'invalid_cost_price', 'TC-INV-24g: a cost price above GH₵ 1,000,000 is refused (D6)');
select throws_ok($q$select public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Level negative', 100, p_low_stock_level => -1)$q$,
  '22023', 'invalid_low_stock_level', 'TC-INV-24h: a negative low-stock level is refused');
select throws_ok($q$select public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Level too high', 100, p_low_stock_level => 100001)$q$,
  '22023', 'invalid_low_stock_level', 'TC-INV-24i: a low-stock level above 100,000 is refused (D6)');
select throws_ok($q$select public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Level null', 100, p_low_stock_level => null)$q$,
  '22023', 'invalid_low_stock_level', 'TC-INV-24j: a missing low-stock level is refused');
select throws_ok($q$select public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Stock null', 100, p_opening_stock => null)$q$,
  '22023', 'invalid_opening_stock', 'TC-INV-24k: a missing opening stock is refused');

-- Categories in create_product
select throws_ok($q$select public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Foreign category', 100, p_category_id => tests.id('cat_b'))$q$,
  'P0002', 'category_not_found', 'TC-INV-25a: another shop''s category cannot be used');
select throws_ok($q$select public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Unknown category', 100, p_category_id => gen_random_uuid())$q$,
  'P0002', 'category_not_found', 'TC-INV-25b: an unknown category is refused the same way');

-- A refused request writes nothing (and leaves no idempotency record that would block a retry)
reset role;
create temp table before_refusal as select (select count(*) from public.products) as products, (select count(*) from public.audit_log) as audit;
grant select on before_refusal to authenticated;
set local role authenticated;
select throws_ok($q$select public.create_product('44444444-4444-4444-4444-444444444402', tests.id('biz_a'), 'Retry me', 0)$q$,
  '22023', 'invalid_selling_price', 'TC-INV-25c: (setup) a refused request');
reset role;   -- compare with the same (superuser) view of all rows that the snapshot used
select ok((select products = (select count(*) from public.products) and audit = (select count(*) from public.audit_log) from before_refusal),
  'TC-INV-25d: a refused request writes nothing');
set local role authenticated;
select isnt(public.create_product('44444444-4444-4444-4444-444444444402', tests.id('biz_a'), 'Retry me', 100) ->> 'product_id', null,
  'TC-INV-25e: the same request ID can be retried after a refusal');
reset role;

-- ===========================================================================
-- Business isolation and membership
-- ===========================================================================
select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select lives_ok($q$insert into tests.ids select 'b_milo', tests.mk(tests.id('biz_b'), 'Milo sachet', 160)$q$,
  'TC-INV-26a: the same product name is allowed in a different shop');
select throws_ok($q$select tests.mk(tests.id('biz_a'), 'Intruder product', 100)$q$, '42501', 'not_a_member',
  'TC-INV-26b: owner B cannot create a product in shop A');
select throws_ok($q$select public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), 'Hacked', 1, null, null, 5, tests.cur(tests.id('milo')))$q$,
  '42501', 'not_a_member', 'TC-INV-26c: owner B cannot update shop A''s product through shop A');
select throws_ok($q$select public.update_product(gen_random_uuid(), tests.id('biz_b'), tests.id('milo'), 'Hacked', 1, null, null, 5, tests.cur(tests.id('milo')))$q$,
  'P0002', 'product_not_found', 'TC-INV-26d: owner B cannot update shop A''s product by passing their own shop');
select throws_ok($q$select public.set_product_archived(gen_random_uuid(), tests.id('biz_b'), tests.id('milo'), true)$q$,
  'P0002', 'product_not_found', 'TC-INV-26e: owner B cannot archive shop A''s product');
select throws_ok($q$select public.set_product_archived(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), true)$q$,
  '42501', 'not_a_member', 'TC-INV-26f: owner B cannot archive through shop A');
select is((select count(*) from public.products where business_id = tests.id('biz_a'))::int, 0,
  'TC-INV-26g: owner B cannot even see shop A''s products');
reset role;
select ok((select name = 'Milo sachet' and selling_price = 150 and active from public.products where id = tests.id('milo')),
  'TC-INV-26h: shop A''s product is unchanged after B''s attempts');

-- Inactive membership, no user, anonymous
update public.business_members set active = false where business_id = tests.id('biz_b');
select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select throws_ok($q$select tests.mk(tests.id('biz_b'), 'After deactivation', 100)$q$, '42501', 'not_a_member',
  'TC-INV-26i: an inactive membership cannot create products');
reset role;
update public.business_members set active = true where business_id = tests.id('biz_b');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_ok($q$select tests.mk(tests.id('biz_a'), 'No user', 100)$q$, '42501', 'not_authenticated',
  'TC-INV-26j: a call without a signed-in user is refused');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($q$select public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Anon', 100)$q$, '42501', null,
  'TC-INV-26k: an anonymous caller cannot create products');
reset role;

-- ===========================================================================
-- update_product
-- ===========================================================================
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
insert into tests.results select 'upd1',
  public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), 'Milo sachet 20g', 175, tests.id('cat_toil'), 'pack', 4, tests.cur(tests.id('milo')));
select ok((select name = 'Milo sachet 20g' and selling_price = 175 and category_id = tests.id('cat_toil') and unit = 'pack' and low_stock_level = 4
           from public.products where id = tests.id('milo')) and (tests.r('upd1') ->> 'changed')::boolean,
  'TC-INV-27a: name, price, category, unit and low-stock level are updated');
select ok((select stock_qty = 10 and stock_value = 1100 and cost_known from public.products where id = tests.id('milo'))
          and (select count(*) = 1 from public.stock_movements where product_id = tests.id('milo')),
  'TC-INV-27b: updating never changes stock, value or cost, and writes no movement');
select ok((select (before ->> 'selling_price')::bigint = 150 and (after ->> 'selling_price')::bigint = 175
                  and before ->> 'name' = 'Milo sachet' and after ->> 'name' = 'Milo sachet 20g'
           from public.audit_log where action = 'update_product' and entity_id = tests.id('milo')),
  'TC-INV-27c: the change is audit-logged old -> new, including the price (04 §2.1)');
select lives_ok($q$select public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('soap'), 'Soap bar', 550, null, null, 5, tests.cur(tests.id('soap')))$q$,
  'TC-INV-27d: (setup) a quick price change: only the price of Soap bar changes');
select ok((select (select array_agg(k order by k) from jsonb_object_keys(before) k) = array['selling_price']
              and (select array_agg(k order by k) from jsonb_object_keys(after) k) = array['selling_price']
              and (before ->> 'selling_price')::bigint = 500 and (after ->> 'selling_price')::bigint = 550
           from public.audit_log where action = 'update_product' and entity_id = tests.id('soap')),
  'TC-INV-27d: the audit entry lists only the fields that changed (price 500 -> 550)');

insert into tests.results select 'upd_same',
  public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), 'Milo sachet 20g', 175, tests.id('cat_toil'), 'pack', 4, tests.cur(tests.id('milo')));
select ok(not (tests.r('upd_same') ->> 'changed')::boolean
          and (select count(*) = 1 from public.audit_log where action = 'update_product' and entity_id = tests.id('milo')),
  'TC-INV-27e: an update that changes nothing is reported as unchanged and not audit-logged');

-- (a statement does not see changes made by a function it calls, so calls and checks are separate)
insert into tests.results select 'upd_case', public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), 'MILO SACHET 20G', 175, null, null, 4, tests.cur(tests.id('milo')));
select ok((tests.r('upd_case') ->> 'changed')::boolean
          and (select name = 'MILO SACHET 20G' and category_id is null and unit is null from public.products where id = tests.id('milo')),
  'TC-INV-27f: a product can change the letter case of its own name, and clear its category and unit');
select throws_ok($q$select public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), ' soap BAR ', 175, null, null, 4, tests.cur(tests.id('milo')))$q$,
  '23505', 'duplicate_product_name', 'TC-INV-27g: renaming to another product''s name (any case) is refused');
select throws_ok($q$select public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), 'Milo', 0, null, null, 4, tests.cur(tests.id('milo')))$q$,
  '22023', 'invalid_selling_price', 'TC-INV-27h: update refuses price 0');
select throws_ok($q$select public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), 'Milo', 100000001, null, null, 4, tests.cur(tests.id('milo')))$q$,
  '22023', 'invalid_selling_price', 'TC-INV-27i: update refuses a price above GH₵ 1,000,000');
select throws_ok($q$select public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), '  ', 100, null, null, 4, tests.cur(tests.id('milo')))$q$,
  '22023', 'name_required', 'TC-INV-27j: update refuses a blank name');
select throws_ok($q$select public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), 'Milo', 100, null, null, 100001, tests.cur(tests.id('milo')))$q$,
  '22023', 'invalid_low_stock_level', 'TC-INV-27k: update refuses a low-stock level above 100,000');
select throws_ok($q$select public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), 'Milo', 100, tests.id('cat_b'), null, 4, tests.cur(tests.id('milo')))$q$,
  'P0002', 'category_not_found', 'TC-INV-27l: update refuses another shop''s category');
select throws_ok($q$select public.update_product(gen_random_uuid(), tests.id('biz_a'), gen_random_uuid(), 'Milo', 100, null, null, 4, tests.cur(gen_random_uuid()))$q$,
  'P0002', 'product_not_found', 'TC-INV-27m: update refuses an unknown product');

-- ===========================================================================
-- Archive and restore (D4): active = false, history and name kept, never deleted
-- ===========================================================================
insert into tests.results select 'arch', public.set_product_archived(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), true);
select ok((select not active and deleted_at is null and stock_qty = 10 and stock_value = 1100 from public.products where id = tests.id('milo'))
          and (tests.r('arch') ->> 'changed')::boolean and not (tests.r('arch') ->> 'active')::boolean,
  'TC-INV-28a: archiving sets active = false and keeps stock, value and the row (not deleted)');
select ok((select count(*) = 1 from public.stock_movements where product_id = tests.id('milo'))
          and (select count(*) = 1 from public.product_cost_history where product_id = tests.id('milo')),
  'TC-INV-28b: the product''s movement and cost history are preserved');
select is((select count(*) from public.audit_log where action = 'archive_product' and entity_id = tests.id('milo'))::int, 1,
  'TC-INV-28c: archiving is audit-logged');
select throws_ok($q$select tests.mk(tests.id('biz_a'), 'milo sachet 20g', 100)$q$, '23505', 'duplicate_product_name',
  'TC-INV-28d: an archived product keeps its name reserved (D4)');
select ok(not (public.set_product_archived(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), true) ->> 'changed')::boolean
          and (select count(*) = 1 from public.audit_log where action = 'archive_product' and entity_id = tests.id('milo')),
  'TC-INV-28e: archiving an archived product changes nothing and is not logged again');
insert into tests.results select 'upd_archived', public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), 'Milo sachet 20g', 180, null, null, 4, tests.cur(tests.id('milo')));
select ok((tests.r('upd_archived') ->> 'changed')::boolean
          and (select not active and selling_price = 180 from public.products where id = tests.id('milo')),
  'TC-INV-28f: an archived product can still be edited (it stays archived)');
insert into tests.results select 'restore', public.set_product_archived(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), false);
select ok((tests.r('restore') ->> 'active')::boolean
          and (select active from public.products where id = tests.id('milo'))
          and (select count(*) = 1 from public.audit_log where action = 'restore_product' and entity_id = tests.id('milo')),
  'TC-INV-28g: restoring makes it active again, audit-logged');
select ok((public.inventory_summary(tests.id('biz_a')) ->> 'product_count')::int =
          (select count(*) from public.products where business_id = tests.id('biz_a') and active and deleted_at is null),
  'TC-INV-28h: the dashboard summary counts only active products');
reset role;

-- A deleted product (deleted_at set; not used by the app in 1C) no longer reserves its name
update public.products set deleted_at = now() where id = tests.id('rice');
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select isnt(tests.mk(tests.id('biz_a'), 'RICE 1KG', 1600), null,
  'TC-INV-28i: a deleted product''s name can be reused (uniqueness covers non-deleted products only)');
select throws_ok($q$select public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('rice'), 'Rice', 100, null, null, 5, tests.cur(tests.id('rice')))$q$,
  'P0002', 'product_not_found', 'TC-INV-28j: a deleted product cannot be edited');
select throws_ok($q$select public.set_product_archived(gen_random_uuid(), tests.id('biz_a'), tests.id('rice'), false)$q$,
  'P0002', 'product_not_found', 'TC-INV-28k: a deleted product cannot be restored');

-- ===========================================================================
-- Categories: direct writes under RLS; archive refused while active products use it (D5)
-- ===========================================================================
select throws_ok($q$insert into public.categories (business_id, name) values (tests.id('biz_a'), ' beverages ')$q$,
  '23505', null, 'TC-INV-30a: a duplicate category name (any case, extra spaces) is refused');
select throws_ok(format('insert into public.categories (business_id, name) values (tests.id(''biz_a''), %L)', repeat('c', 61)),
  '23514', null, 'TC-INV-30b: a category name over 60 characters is refused');
select throws_ok($q$insert into public.categories (business_id, name) values (tests.id('biz_a'), '   ')$q$,
  '23514', null, 'TC-INV-30c: a blank category name is refused');
select throws_ok($q$update public.categories set business_id = tests.id('biz_b') where id = tests.id('cat_bev')$q$,
  '42501', null, 'TC-INV-30d: a category cannot be moved to another shop');

-- Toiletries: used by the active product 'Soap bar'
select lives_ok($q$select public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('soap'), 'Soap bar', 500, tests.id('cat_toil'), null, 5, tests.cur(tests.id('soap')))$q$,
  'TC-INV-30e: (setup) Soap bar is put in Toiletries');
select throws_ok($q$update public.categories set deleted_at = now() where id = tests.id('cat_toil')$q$,
  'P0001', 'category_in_use', 'TC-INV-30f: a category used by an active product cannot be archived (D5)');
select ok((select deleted_at is null from public.categories where id = tests.id('cat_toil')),
  'TC-INV-30g: the category is still active after the refusal');
select lives_ok($q$update public.categories set name = 'Toiletries & soap' where id = tests.id('cat_toil')$q$,
  'TC-INV-30h: a category in use can still be renamed');

-- Once its only product is archived, the category can be archived
select lives_ok($q$select public.set_product_archived(gen_random_uuid(), tests.id('biz_a'), tests.id('soap'), true)$q$,
  'TC-INV-30i: (setup) Soap bar is archived');
select lives_ok($q$update public.categories set deleted_at = now() where id = tests.id('cat_toil')$q$,
  'TC-INV-30j: a category used only by archived products can be archived');
select throws_ok($q$select public.set_product_archived(gen_random_uuid(), tests.id('biz_a'), tests.id('soap'), false)$q$,
  '22023', 'category_archived', 'TC-INV-30k: an archived product in an archived category cannot be restored until its category changes');
select lives_ok($q$select public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('soap'), 'Soap bar', 500, null, null, 5, tests.cur(tests.id('soap')))$q$,
  'TC-INV-30l: (setup) its category is cleared');
select ok((public.set_product_archived(gen_random_uuid(), tests.id('biz_a'), tests.id('soap'), false) ->> 'active')::boolean,
  'TC-INV-30m: then it can be restored');
select throws_ok($q$select public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Shampoo', 900, p_category_id => tests.id('cat_toil'))$q$,
  '22023', 'category_archived', 'TC-INV-30n: a new product cannot be put in an archived category');
select throws_ok($q$select public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('soap'), 'Soap bar', 500, tests.id('cat_toil'), null, 5, tests.cur(tests.id('soap')))$q$,
  '22023', 'category_archived', 'TC-INV-30o: an existing product cannot be moved into an archived category');
select lives_ok($q$update public.categories set deleted_at = null where id = tests.id('cat_toil')$q$,
  'TC-INV-30p: an archived category can be restored');
select lives_ok($q$update public.categories set deleted_at = now() where id = tests.id('cat_bev')$q$,
  'TC-INV-30q: an unused category can be archived');
reset role;

-- Other shops cannot touch A's categories
select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select is((select count(*) from (select 1 from public.categories where business_id = tests.id('biz_a')) x)::int, 0,
  'TC-INV-31a: owner B cannot see shop A''s categories');
select throws_ok($q$insert into public.categories (business_id, name) values (tests.id('biz_a'), 'Intruder')$q$,
  '42501', null, 'TC-INV-31b: owner B cannot add a category to shop A');
select is_empty($q$with u as (update public.categories set deleted_at = null, name = 'Hacked' where id = tests.id('cat_bev') returning 1) select * from u$q$,
  'TC-INV-31c: owner B cannot rename, archive or restore shop A''s category (no rows affected)');
reset role;
select ok((select name = 'Beverages' and deleted_at is not null from public.categories where id = tests.id('cat_bev')),
  'TC-INV-31d: shop A''s category is unchanged');

-- ===========================================================================
-- No hard deletes; T1 and T2 objects intact
-- ===========================================================================
select ok(not exists (select 1 from information_schema.role_table_grants
                      where table_schema = 'public' and table_name in ('products', 'categories')
                        and grantee in ('authenticated', 'anon') and privilege_type = 'DELETE'),
  'TC-INV-32a: the API cannot hard-delete products or categories');
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname in ('create_product', 'update_product', 'set_product_archived')
                        and p.prosrc ~* 'delete\s+from'),
  'TC-INV-32b: none of the product functions deletes rows');
select ok(not has_function_privilege('authenticated',
            'private.apply_movement(uuid,uuid,text,integer,bigint,text,numeric,uuid,uuid,text,boolean)', 'execute')
          and has_function_privilege('authenticated', 'public.inventory_summary(uuid)', 'execute'),
  'TC-INV-32c: T1 helpers remain internal; T2 summary unchanged');
select ok(not has_function_privilege('authenticated', 'private.category_archive_guard()', 'execute')
          and not has_function_privilege('authenticated', 'private.validate_product_fields(text,bigint,text,integer)', 'execute')
          and not has_function_privilege('authenticated', 'private.usable_category(uuid,uuid)', 'execute'),
  'TC-INV-32d: the new internal helpers are not callable through the API');

-- T10 (I3, additive): stock integrity of every shop this file used: no discrepancy
reset role;
select is((select count(*)::int from tests.ids i cross join lateral private.stock_integrity(i.v) s where i.k like 'biz%'), 0,
  'TC-INV-123b (T10 I3): stock integrity: no discrepancy in any shop of this file');

select * from finish();
rollback;
