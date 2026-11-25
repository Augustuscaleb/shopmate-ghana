-- Stage 1C-2 increment 2 review: optimistic concurrency for public.update_product
-- (migration 20261125000300_update_product_expected_values.sql; LOCAL preparation, not cloud-applied).
-- The caller passes the five editable fields as it last read them (p_expected); they are compared
-- with the locked row in the same transaction; any difference is refused with product_changed.
-- Omitting them is refused (no unconditional overwrite). Fictitious data only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

create schema tests;
grant usage on schema tests to authenticated, anon;
create table tests.ids (k text primary key, v uuid);
grant select, insert on tests.ids to authenticated;
create function tests.id(p_k text) returns uuid language sql stable as $$ select v from tests.ids where k = p_k $$;
grant execute on function tests.id(text) to authenticated;
create function tests.cur(p_product uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name', p.name, 'selling_price', p.selling_price, 'category_id', p.category_id,
                            'unit', p.unit, 'low_stock_level', p.low_stock_level)
  from public.products p where p.id = p_product $$;
grant execute on function tests.cur(uuid) to authenticated;
create table tests.snap (k text primary key, v jsonb);
grant select, insert on tests.snap to authenticated;
create function tests.snap(p_k text) returns jsonb language sql stable as $$ select v from tests.snap where k = p_k $$;
grant execute on function tests.snap(text) to authenticated;
create table tests.results (k text primary key, r jsonb);
grant select, insert on tests.results to authenticated;
create function tests.r(p_k text) returns jsonb language sql stable as $$ select r from tests.results where k = p_k $$;
grant execute on function tests.r(text) to authenticated;
create function tests.as_user(p_user text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end $$;
create function tests.audits(p_product uuid) returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.audit_log where action = 'update_product' and entity_id = p_product $$;
grant execute on function tests.audits(uuid) to authenticated;
create function tests.row(p_product uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(p) - 'updated_at' from public.products p where p.id = p_product $$;
grant execute on function tests.row(uuid) to authenticated;

-- Fixtures: owner A with a shop; user A2, a second active member of the same shop (stands for a
-- second phone or person); owner B with another shop.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000016a1', 'owner.a16@example.test'),
  ('00000000-0000-0000-0000-0000000016a2', 'member.a16@example.test'),
  ('00000000-0000-0000-0000-0000000016b1', 'owner.b16@example.test');

select tests.as_user('00000000-0000-0000-0000-0000000016b1');
set local role authenticated;
insert into tests.ids select 'biz_b', (public.create_business(gen_random_uuid(), 'B Test Shop 16', 'provision', 'Kumasi', null) ->> 'business_id')::uuid;
reset role;

select tests.as_user('00000000-0000-0000-0000-0000000016a1');
set local role authenticated;
insert into tests.ids select 'biz_a', (public.create_business(gen_random_uuid(), 'A Test Shop 16', 'provision', 'Accra', null) ->> 'business_id')::uuid;
insert into public.categories (business_id, name) values (tests.id('biz_a'), 'Drinks');
insert into tests.ids select 'cat', id from public.categories where business_id = tests.id('biz_a');
insert into tests.ids select 'milo', (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Milo sachet', 150, null, 'sachet', 110, 10, 5) ->> 'product_id')::uuid;
insert into tests.ids select 'coke', (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Coke 50cl', 600) ->> 'product_id')::uuid;
reset role;
insert into public.business_members (business_id, user_id) values (tests.id('biz_a'), '00000000-0000-0000-0000-0000000016a2');

-- ===========================================================================
-- Definition and privileges
-- ===========================================================================
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'update_product'), 1,
  'UPX-01: exactly one update_product exists (the old 8-argument version was replaced, no overload)');
select ok((select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p
           where p.oid = 'public.update_product(uuid,uuid,uuid,text,bigint,uuid,text,integer,jsonb)'::regprocedure),
  'UPX-02: SECURITY DEFINER with an empty search_path');
select ok(has_function_privilege('authenticated', 'public.update_product(uuid,uuid,uuid,text,bigint,uuid,text,integer,jsonb)', 'execute')
          and not has_function_privilege('anon', 'public.update_product(uuid,uuid,uuid,text,bigint,uuid,text,integer,jsonb)', 'execute'),
  'UPX-03: signed-in users can call it; anonymous callers cannot');
select ok(not exists (select 1 from information_schema.routine_privileges
                      where routine_schema = 'public' and grantee = 'PUBLIC' and routine_name = 'update_product'),
  'UPX-04: not granted to PUBLIC');

-- ===========================================================================
-- Normal update with the expected values
-- ===========================================================================
select tests.as_user('00000000-0000-0000-0000-0000000016a1');
set local role authenticated;
insert into tests.snap select 'milo0', tests.cur(tests.id('milo'));
select is(public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), 'Milo sachet', 175, tests.id('cat'), 'sachet', 5, tests.snap('milo0')),
          jsonb_build_object('product_id', tests.id('milo'), 'changed', true),
  'UPX-10: matching expected values: the update succeeds with the same response as before');
select is(tests.cur(tests.id('milo')), jsonb_build_object('name', 'Milo sachet', 'selling_price', 175, 'category_id', tests.id('cat'), 'unit', 'sachet', 'low_stock_level', 5),
  'UPX-11: the new values are stored');
select is(tests.audits(tests.id('milo')), 1, 'UPX-12: one audit entry, as before');
select is((select (after ->> 'selling_price')::int from public.audit_log where action = 'update_product' and entity_id = tests.id('milo')), 175,
  'UPX-13: the audit entry records the changed fields as before');
select is(public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), 'Milo sachet', 175, tests.id('cat'), 'sachet', 5, tests.cur(tests.id('milo'))),
          jsonb_build_object('product_id', tests.id('milo'), 'changed', false),
  'UPX-14: no change with matching expected values reports changed = false, no audit entry');
select is(tests.audits(tests.id('milo')), 1, 'UPX-15: still one audit entry');
select lives_ok($q$select public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('coke'), 'Coke 50cl', 650, null, null, 5,
                  '{"name": "Coke 50cl", "selling_price": 600, "category_id": null, "unit": null, "low_stock_level": 5}'::jsonb)$q$,
  'UPX-16: null category and unit are compared as null');

-- ===========================================================================
-- Missing or malformed expected values are refused; nothing is written
-- ===========================================================================
insert into tests.snap select 'coke_row', tests.row(tests.id('coke'));
select throws_ok($q$select public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('coke'), 'Coke', 1, null, null, 5)$q$,
  '22023', 'expected_values_required', 'UPX-20: a caller that omits the expected values is refused (no unconditional overwrite)');
select throws_ok($q$select public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('coke'), 'Coke', 1, null, null, 5, null)$q$,
  '22023', 'expected_values_required', 'UPX-21: an explicit null is refused the same way');
select throws_ok($q$select public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('coke'), 'Coke', 1, null, null, 5, '[]'::jsonb)$q$,
  '22023', 'invalid_expected_values', 'UPX-22: not an object');
select throws_ok($q$select public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('coke'), 'Coke', 1, null, null, 5,
                  '{"name": "Coke 50cl", "selling_price": 650, "category_id": null, "unit": null}'::jsonb)$q$,
  '22023', 'invalid_expected_values', 'UPX-23: a missing key (low_stock_level)');
select throws_ok($q$select public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('coke'), 'Coke', 1, null, null, 5,
                  '{"name": "Coke 50cl", "selling_price": "650", "category_id": null, "unit": null, "low_stock_level": 5}'::jsonb)$q$,
  '22023', 'invalid_expected_values', 'UPX-24: a wrong type (price as text)');
select throws_ok($q$select public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('coke'), 'Coke', 1, null, null, 5,
                  '{"name": "Coke 50cl", "selling_price": 650, "category_id": 5, "unit": null, "low_stock_level": 5}'::jsonb)$q$,
  '22023', 'invalid_expected_values', 'UPX-25: a wrong type (category as a number)');
select is(tests.row(tests.id('coke')), tests.snap('coke_row'), 'UPX-26: none of the refused calls changed the product');

-- Existing error precedence is kept: product lookup and field validation come first
select throws_ok($q$select public.update_product(gen_random_uuid(), tests.id('biz_a'), gen_random_uuid(), 'X', 100, null, null, 5)$q$,
  'P0002', 'product_not_found', 'UPX-27: an unknown product is still product_not_found, even without expected values');
select throws_ok($q$select public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('coke'), '  ', 100, null, null, 5)$q$,
  '22023', 'name_required', 'UPX-28: field validation still comes first');

-- ===========================================================================
-- A change between the client's read and its update is not overwritten
-- ===========================================================================
-- A reads the product (its form opens) ...
insert into tests.snap select 'milo_by_a', tests.cur(tests.id('milo'));
reset role;
-- ... then A2 (another phone or person of the same shop) renames it and raises the low-stock level
select tests.as_user('00000000-0000-0000-0000-0000000016a2');
set local role authenticated;
select is(public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), 'Milo sachet 20g', 175, tests.id('cat'), 'sachet', 8, tests.cur(tests.id('milo'))) ->> 'changed', 'true',
  'UPX-30: the second member updates the product with current expected values');
reset role;
-- ... then A saves a new price from the copy read before A2's change
select tests.as_user('00000000-0000-0000-0000-0000000016a1');
set local role authenticated;
insert into tests.snap select 'milo_after_a2', tests.row(tests.id('milo'));
select throws_ok($q$select public.update_product('16000000-0000-4000-a000-000000000001', tests.id('biz_a'), tests.id('milo'), 'Milo sachet', 200, tests.id('cat'), 'sachet', 5, tests.snap('milo_by_a'))$q$,
  'P0001', 'product_changed', 'UPX-31: the stale save is refused with product_changed');
select is(tests.row(tests.id('milo')), tests.snap('milo_after_a2'), 'UPX-32: A2''s name and low-stock level were NOT overwritten, and the price is unchanged');
select is(tests.audits(tests.id('milo')), 2, 'UPX-33: no audit entry for the refused save');
-- The refused request ID was not consumed: re-read and resubmit with the same ID succeeds
select is(public.update_product('16000000-0000-4000-a000-000000000001', tests.id('biz_a'), tests.id('milo'), 'Milo sachet 20g', 200, tests.id('cat'), 'sachet', 8, tests.cur(tests.id('milo'))),
          jsonb_build_object('product_id', tests.id('milo'), 'changed', true),
  'UPX-34: after reading again, the same save succeeds (the refused request ID was not used up)');
select is(tests.cur(tests.id('milo')) ->> 'name', 'Milo sachet 20g', 'UPX-35: A2''s name is kept alongside A''s new price');
-- A difference in any one field is detected (here only the unit)
select throws_ok($q$select public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), 'Milo sachet 20g', 210, tests.id('cat'), 'sachet', 8,
                  jsonb_set(tests.cur(tests.id('milo')), '{unit}', '"pack"'))$q$,
  'P0001', 'product_changed', 'UPX-36: a stale unit alone is enough to refuse');
select throws_ok($q$select public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), 'Milo sachet 20g', 210, tests.id('cat'), 'sachet', 8,
                  jsonb_set(tests.cur(tests.id('milo')), '{category_id}', 'null'))$q$,
  'P0001', 'product_changed', 'UPX-37: a stale category alone is enough to refuse');

-- ===========================================================================
-- Retries (request-ID idempotency) are unaffected
-- ===========================================================================
insert into tests.results select 'retry', public.update_product('16000000-0000-4000-a000-000000000002', tests.id('biz_a'), tests.id('coke'), 'Coke 50cl', 700, null, null, 5, tests.cur(tests.id('coke')));
-- The reply was lost; the app retries the same change with the same ID. The row now holds the new
-- values, so the expected values differ, but the stored result is returned first.
select is(public.update_product('16000000-0000-4000-a000-000000000002', tests.id('biz_a'), tests.id('coke'), 'Coke 50cl', 700, null, null, 5,
                                '{"name": "Coke 50cl", "selling_price": 650, "category_id": null, "unit": null, "low_stock_level": 5}'::jsonb),
          tests.r('retry'), 'UPX-40: a retry with the same request ID returns the original result, not product_changed');
select is((select count(*)::int from public.audit_log where action = 'update_product' and entity_id = tests.id('coke')), 2,
  'UPX-41: the retry recorded nothing twice (two audit entries: UPX-16 and this change)');
reset role;

-- ===========================================================================
-- Access is unchanged
-- ===========================================================================
select tests.as_user('00000000-0000-0000-0000-0000000016b1');
set local role authenticated;
select throws_ok($q$select public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), 'Hacked', 1, null, null, 0, tests.cur(tests.id('milo')))$q$,
  '42501', 'not_a_member', 'UPX-50: another shop''s owner is refused, even with correct expected values');
select throws_ok($q$select public.update_product(gen_random_uuid(), tests.id('biz_b'), tests.id('milo'), 'Hacked', 1, null, null, 0, tests.cur(tests.id('milo')))$q$,
  'P0002', 'product_not_found', 'UPX-51: naming their own shop does not reach another shop''s product');
reset role;
set local role anon;
select throws_ok($q$select public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), 'Hacked', 1, null, null, 0, '{}'::jsonb)$q$,
  '42501', null, 'UPX-52: anonymous callers cannot execute it');
reset role;
select is(tests.cur(tests.id('milo')) ->> 'name', 'Milo sachet 20g', 'UPX-53: the product is unchanged by the refused calls');

select * from finish();
rollback;
