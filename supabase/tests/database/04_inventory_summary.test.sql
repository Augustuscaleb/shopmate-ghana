-- Stage 1C, task T2: public.inventory_summary(p_business_id) for the Today dashboard (D7).
-- Exact active-product and low-stock counts computed inside PostgreSQL, so the API's
-- 1,000-row limit (max_rows) never affects them. Low stock (04 §2.4, F-07): an ACTIVE product
-- (active = true and not deleted) with stock_qty <= low_stock_level, including negative stock.
-- Called as the signed-in owner exactly as the API does (role authenticated + JWT claims).
-- Fixtures are fictitious and everything is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

create schema tests;
grant usage on schema tests to authenticated, anon;
create table tests.ids (k text primary key, v uuid);
grant select, insert on tests.ids to authenticated;
grant select on tests.ids to anon;
create function tests.id(p_k text) returns uuid language sql stable as $$ select v from tests.ids where k = p_k $$;
grant execute on function tests.id(text) to authenticated, anon;
-- Results captured while acting as an owner (so assertions can run afterwards as any role)
create table tests.results (k text primary key, r jsonb);
grant select, insert on tests.results to authenticated;
create function tests.r(p_k text) returns jsonb language sql stable as $$ select r from tests.results where k = p_k $$;

create function tests.as_owner(p_user text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures: three fictitious owners. Business IDs come from create_business results.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner.a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner.b@example.test'),
  ('00000000-0000-0000-0000-0000000000c1', 'owner.c@example.test');

select tests.as_owner('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
insert into tests.ids select 'biz_a',
  (public.create_business(gen_random_uuid(), 'Ama Test Provisions', 'provision', 'Accra', null) ->> 'business_id')::uuid;
-- Empty inventory, before any product exists
insert into tests.results select 'a_empty', public.inventory_summary(tests.id('biz_a'));
reset role;

select tests.as_owner('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
insert into tests.ids select 'biz_b',
  (public.create_business(gen_random_uuid(), 'Kofi Test Mart', 'provision', 'Kumasi', null) ->> 'business_id')::uuid;
reset role;

select tests.as_owner('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;
insert into tests.ids select 'biz_c',
  (public.create_business(gen_random_uuid(), 'Esi Scale Store', 'minimart', 'Tema', null) ->> 'business_id')::uuid;
reset role;

-- Products are inserted directly (as the test superuser) only to set up fixtures; the API
-- cannot write products, and create_product comes in T3.
-- Business A: the boundary cases of the low-stock rule
insert into public.products (business_id, name, selling_price, stock_qty, low_stock_level, active, deleted_at)
select tests.id('biz_a'), n, 150, q, l, a, d
from (values
  ('Above level',        10, 5, true,  null::timestamptz),   -- active, not low
  ('One above level',     6, 5, true,  null),                -- active, not low (boundary + 1)
  ('Equal to level',      5, 5, true,  null),                -- active, LOW (boundary: <=)
  ('Zero at level zero',  0, 0, true,  null),                -- active, LOW (0 <= 0)
  ('One at level zero',   1, 0, true,  null),                -- active, not low
  ('Negative stock',     -2, 5, true,  null),                -- active, LOW (negative counts)
  ('Archived low',        0, 5, false, null),                -- archived (D4): excluded
  ('Archived high',      50, 5, false, null),                -- archived: excluded
  ('Deleted low',         0, 5, true,  now()),               -- deleted: excluded
  ('Archived and deleted',0, 5, false, now())                -- excluded
) as f(n, q, l, a, d);

-- Business B: two products of its own (one low)
insert into public.products (business_id, name, selling_price, stock_qty, low_stock_level)
values (tests.id('biz_b'), 'B product low', 200, 1, 5),
       (tests.id('biz_b'), 'B product ok', 200, 20, 5);

-- Business C: more than 1,000 products. 1,500 active (1,001 low, 499 not low),
-- plus 250 archived and 50 deleted products that must not be counted.
insert into public.products (business_id, name, selling_price, stock_qty, low_stock_level, active, deleted_at)
select tests.id('biz_c'), 'Scale product ' || i, 100,
       case when i <= 1001 then (i % 7) - 1 else 10 + (i % 7) end,   -- low ones: -1..5 (all <= 5, some exactly 5)
       5, true, null
from generate_series(1, 1500) as i;
insert into public.products (business_id, name, selling_price, stock_qty, low_stock_level, active)
select tests.id('biz_c'), 'Archived scale product ' || i, 100, 0, 5, false from generate_series(1, 250) as i;
insert into public.products (business_id, name, selling_price, stock_qty, low_stock_level, active, deleted_at)
select tests.id('biz_c'), 'Deleted scale product ' || i, 100, 0, 5, true, now() from generate_series(1, 50) as i;

-- Capture the summaries as each owner
select tests.as_owner('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
insert into tests.results select 'a', public.inventory_summary(tests.id('biz_a'));
reset role;
select tests.as_owner('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
insert into tests.results select 'b', public.inventory_summary(tests.id('biz_b'));
reset role;
select tests.as_owner('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;
insert into tests.results select 'c', public.inventory_summary(tests.id('biz_c'));
reset role;

-- ===========================================================================
-- Function definition and privileges
-- ===========================================================================
select has_function('public', 'inventory_summary', array['uuid'], 'TC-INV-10a: public.inventory_summary(uuid) exists');
select is((select prosecdef from pg_proc where oid = 'public.inventory_summary(uuid)'::regprocedure), false,
  'TC-INV-10b: it runs with the caller''s rights (SECURITY INVOKER), so Row Level Security still applies');
select is((select provolatile from pg_proc where oid = 'public.inventory_summary(uuid)'::regprocedure), 's'::"char",
  'TC-INV-10c: it is STABLE (read-only: PostgreSQL refuses writes inside it)');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.inventory_summary(uuid)'::regprocedure),
  'TC-INV-10d: it has a fixed, empty search_path');
select ok(has_function_privilege('authenticated', 'public.inventory_summary(uuid)', 'execute'),
  'TC-INV-10e: signed-in users can call it');
select ok(not has_function_privilege('anon', 'public.inventory_summary(uuid)', 'execute'),
  'TC-INV-10f: anonymous (signed-out) callers cannot call it');
select ok(not exists (select 1 from information_schema.routine_privileges
                      where routine_schema = 'public' and routine_name = 'inventory_summary' and grantee = 'PUBLIC'),
  'TC-INV-10g: it is not granted to PUBLIC');

-- ===========================================================================
-- Counts
-- ===========================================================================
select is(tests.r('a_empty'), '{"product_count": 0, "low_stock_count": 0}'::jsonb,
  'TC-INV-11a: an empty inventory gives exactly 0 products and 0 low stock');
select is((tests.r('a') ->> 'product_count')::int, 6,
  'TC-INV-11b: product count includes only active, non-deleted products (6 of 10)');
select is((tests.r('a') ->> 'low_stock_count')::int, 3,
  'TC-INV-11c: low stock = active products with stock <= level: equal (5/5), 0/0 and negative stock (3)');
select is((select count(*) from jsonb_object_keys(tests.r('a')))::int, 2,
  'TC-INV-11d: the result contains only the two counts, nothing else');
select is(tests.r('b'), '{"product_count": 2, "low_stock_count": 1}'::jsonb,
  'TC-INV-11e: business B sees only its own 2 products (1 low)');

select is((tests.r('c') ->> 'product_count')::int, 1500,
  'TC-INV-12a (scale): 1,500 active products are counted exactly (250 archived and 50 deleted excluded)');
select is((tests.r('c') ->> 'low_stock_count')::int, 1001,
  'TC-INV-12b (scale): 1,001 low-stock products are counted exactly');
select is((select count(*) from public.products where business_id = tests.id('biz_c'))::int, 1800,
  'TC-INV-12c (scale): the scale business really holds 1,800 product rows');
select is(jsonb_typeof(tests.r('c') -> 'product_count'), 'number',
  'TC-INV-12d: counts are JSON numbers');

-- Live re-count after changes (no caching): one product becomes low, one is archived
update public.products set stock_qty = 5 where business_id = tests.id('biz_a') and name = 'One above level';
update public.products set active = false where business_id = tests.id('biz_a') and name = 'Above level';
select tests.as_owner('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
insert into tests.results select 'a_after', public.inventory_summary(tests.id('biz_a'));
reset role;
select is(tests.r('a_after'), '{"product_count": 5, "low_stock_count": 4}'::jsonb,
  'TC-INV-11f: counts reflect the current data (one product now low, one archived)');

-- ===========================================================================
-- Isolation and refusals
-- ===========================================================================
select tests.as_owner('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select throws_ok(format('select public.inventory_summary(%L)', tests.id('biz_a')), '42501', 'not_a_member',
  'TC-INV-13a: owner B cannot get business A''s counts (refused, not zeros)');
select throws_ok(format('select public.inventory_summary(%L)', tests.id('biz_c')), '42501', 'not_a_member',
  'TC-INV-13b: owner B cannot get the scale business''s counts');
select throws_ok(format('select public.inventory_summary(%L)', gen_random_uuid()), '42501', 'not_a_member',
  'TC-INV-13c: an unknown business ID is refused the same way (does not reveal whether it exists)');
select throws_ok('select public.inventory_summary(null)', '42501', 'not_a_member',
  'TC-INV-13d: a missing business ID is refused');
reset role;

-- Signed-in role but no user in the token
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_ok(format('select public.inventory_summary(%L)', tests.id('biz_a')), '42501', 'not_authenticated',
  'TC-INV-13e: a call without a signed-in user is refused');
reset role;

-- Signed-out (anon) role
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok(format('select public.inventory_summary(%L)', tests.id('biz_a')), '42501', null,
  'TC-INV-13f: an anonymous caller is refused (no execute permission)');
reset role;

-- An owner whose membership is deactivated loses access
update public.business_members set active = false where business_id = tests.id('biz_b');
select tests.as_owner('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select throws_ok(format('select public.inventory_summary(%L)', tests.id('biz_b')), '42501', 'not_a_member',
  'TC-INV-13g: an inactive membership gives no access');
reset role;
update public.business_members set active = true where business_id = tests.id('biz_b');

-- ===========================================================================
-- Read-only and unchanged surroundings
-- ===========================================================================
select tests.as_owner('00000000-0000-0000-0000-0000000000a1');
create temp table counts_before as
  select (select count(*) from public.products) as products, (select count(*) from public.audit_log) as audit,
         (select count(*) from public.stock_movements) as movements;
set local role authenticated;
select public.inventory_summary(tests.id('biz_a'));
reset role;
select ok((select products = (select count(*) from public.products) and audit = (select count(*) from public.audit_log)
                  and movements = (select count(*) from public.stock_movements) from counts_before),
  'TC-INV-14a: calling it writes nothing');
select ok(not has_table_privilege('authenticated', 'public.products', 'insert')
          and not has_table_privilege('authenticated', 'public.products', 'update')
          and not has_table_privilege('authenticated', 'public.products', 'delete'),
  'TC-INV-14b: the API still cannot write products directly');
select ok(not has_function_privilege('authenticated',
            'private.apply_movement(uuid,uuid,text,integer,bigint,text,numeric,uuid,uuid,text,boolean)', 'execute'),
  'TC-INV-14c: the T1 helpers are still internal only');
select ok((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'inventory_summary') = 1,
  'TC-INV-14d: exactly one inventory_summary function (no overloads)');
select ok((select indexdef like '%WHERE (active AND (deleted_at IS NULL))%' from pg_indexes
           where schemaname = 'public' and indexname = 'products_active_idx'),
  'TC-INV-14e: the partial index it uses (from T1) covers exactly active, non-deleted products');

select * from finish();
rollback;
