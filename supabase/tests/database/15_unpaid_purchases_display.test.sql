-- Owner decision M2, Option B (approved 24 Nov 2026): the display fields of public.unpaid_purchases
-- (migration 20261125000200). Four new fields per purchase: corrected_cost, cost_corrections,
-- refunds_received, return_credits; every row satisfies
--   unpaid = corrected_cost - paid + refunds_received - return_credits
-- and every existing field, filter, order, total, error and privilege is unchanged (T7 P4, P5).
-- Fixtures are fictitious and everything is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

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
create function tests.mkp(p_biz uuid, p_name text) returns uuid language sql as $$
  select (public.create_product(gen_random_uuid(), p_biz, p_name, 1000) ->> 'product_id')::uuid
$$;
grant execute on function tests.mkp(uuid, text) to authenticated;
create function tests.buy(p_biz uuid, p_product uuid, p_qty integer, p_cost bigint, p_paid bigint,
                          p_on date default null) returns uuid language sql as $$
  select (public.restock(gen_random_uuid(), p_biz, p_product, p_qty, p_cost, p_paid,
                         case when p_paid > 0 then 'cash_drawer' end, p_on) ->> 'purchase_id')::uuid
$$;
grant execute on function tests.buy(uuid, uuid, integer, bigint, bigint, date) to authenticated;
create function tests.pay(p_biz uuid, p_purchase uuid, p_amount bigint) returns jsonb language sql as $$
  select public.pay_supplier(gen_random_uuid(), p_biz, p_purchase, p_amount, 'momo')
$$;
grant execute on function tests.pay(uuid, uuid, bigint) to authenticated;
create function tests.cc(p_biz uuid, p_purchase uuid, p_dc bigint, p_refund bigint default null, p_method text default null)
returns jsonb language sql as $$
  select public.correct_purchase(gen_random_uuid(), p_biz, p_purchase, 'cost', 'Invoice corrected',
                                 p_cost_change => p_dc, p_refund_amount => p_refund, p_refund_method => p_method)
$$;
grant execute on function tests.cc(uuid, uuid, bigint, bigint, text) to authenticated;
create function tests.ret(p_biz uuid, p_product uuid, p_qty integer, p_credit bigint, p_type text, p_purchase uuid)
returns jsonb language sql as $$
  select public.return_to_supplier(gen_random_uuid(), p_biz, p_product, p_qty, p_credit, p_type, 'Damaged on arrival', p_purchase)
$$;
grant execute on function tests.ret(uuid, uuid, integer, bigint, text, uuid) to authenticated;
-- one purchase's row in a stored list result
create function tests.row(p_k text, p_purchase text) returns jsonb language sql stable as $$
  select e from jsonb_array_elements(tests.r(p_k) -> 'purchases') e where e ->> 'purchase_id' = tests.id(p_purchase)::text
$$;
grant execute on function tests.row(text, text) to authenticated;
-- the four new fields of a row, as one object
create function tests.m2(p_row jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('corrected_cost', p_row -> 'corrected_cost', 'cost_corrections', p_row -> 'cost_corrections',
                            'refunds_received', p_row -> 'refunds_received', 'return_credits', p_row -> 'return_credits')
$$;
grant execute on function tests.m2(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures: owner A with shops A and A3 (empty), owner B with shop B
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner.a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner.b@example.test');

select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
insert into tests.ids select 'biz_b', (public.create_business(gen_random_uuid(), 'Kofi Test Mart', 'provision', 'Kumasi', null) ->> 'business_id')::uuid;
insert into tests.ids select 'b_prod', tests.mkp(tests.id('biz_b'), 'B sugar');
insert into tests.ids select 'p_b', tests.buy(tests.id('biz_b'), tests.id('b_prod'), 10, 5000, 0);
select tests.cc(tests.id('biz_b'), tests.id('p_b'), 700);                          -- B's own correction
select tests.ret(tests.id('biz_b'), tests.id('b_prod'), 1, 400, 'reduce_unpaid', tests.id('p_b'));
reset role;

select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
insert into tests.ids select 'biz_a',  (public.create_business(gen_random_uuid(), 'Ama Test Provisions', 'provision', 'Accra', null) ->> 'business_id')::uuid;
insert into tests.ids select 'biz_a3', (public.create_business(gen_random_uuid(), 'Ama Empty Shop', 'minimart', 'Tema', null) ->> 'business_id')::uuid;
-- purchases dated in the past need a shop created before them (T5 R3), as in the T7 tests
reset role;
update public.businesses set created_at = now() - interval '30 days' where id = tests.id('biz_a');
set local role authenticated;
insert into tests.ids select 'rice', tests.mkp(tests.id('biz_a'), 'Rice bag');
insert into tests.ids select 'oil', tests.mkp(tests.id('biz_a'), 'Oil gallon');
insert into tests.ids select 'gari', tests.mkp(tests.id('biz_a'), 'Gari bag');
insert into tests.ids select 'milo', tests.mkp(tests.id('biz_a'), 'Milo tin');
insert into tests.ids select 'soap', tests.mkp(tests.id('biz_a'), 'Soap box');
-- plain: 1000, paid 200 at purchase -> owes 800 (no corrections, refunds or credits)
insert into tests.ids select 'p_plain', tests.buy(tests.id('biz_a'), tests.id('rice'), 10, 1000, 200, (now() at time zone 'UTC')::date - 5);
-- up: 2000, payment 500, correction +300 -> owes 1800
insert into tests.ids select 'p_up', tests.buy(tests.id('biz_a'), tests.id('oil'), 10, 2000, 0, (now() at time zone 'UTC')::date - 4);
select tests.pay(tests.id('biz_a'), tests.id('p_up'), 500);
select tests.cc(tests.id('biz_a'), tests.id('p_up'), 300);
-- and a quantity correction (+2 units, total cost unchanged, C-116f): it must add nothing to the cost fields
select public.correct_purchase(gen_random_uuid(), tests.id('biz_a'), tests.id('p_up'), 'quantity', 'Two more received', p_qty_change => 2);
-- down: 3000, paid 1000 at purchase, correction -500 -> owes 1500
insert into tests.ids select 'p_down', tests.buy(tests.id('biz_a'), tests.id('gari'), 10, 3000, 1000, (now() at time zone 'UTC')::date - 3);
select tests.cc(tests.id('biz_a'), tests.id('p_down'), -500);
-- credit: 1000 owed in full; returns of 2 units with a reduce_unpaid credit of 150, then 1 unit
-- refunded in cash (90) and 1 in MoMo (80), both linked to the purchase -> owes 850
insert into tests.ids select 'p_credit', tests.buy(tests.id('biz_a'), tests.id('milo'), 10, 1000, 0, (now() at time zone 'UTC')::date - 2);
select tests.ret(tests.id('biz_a'), tests.id('milo'), 2, 150, 'reduce_unpaid', tests.id('p_credit'));
select tests.ret(tests.id('biz_a'), tests.id('milo'), 1, 90, 'refund_cash', tests.id('p_credit'));
select tests.ret(tests.id('biz_a'), tests.id('milo'), 1, 80, 'refund_momo', tests.id('p_credit'));
-- combined: 1000 paid in full; correction -300 with the excess refunded (300, cash) -> owes 0 (not listed);
-- correction +500 -> owes 500; return credit 100 -> 400; payment 50 -> 350
insert into tests.ids select 'p_combo', tests.buy(tests.id('biz_a'), tests.id('soap'), 10, 1000, 1000, (now() at time zone 'UTC')::date - 1);
select tests.cc(tests.id('biz_a'), tests.id('p_combo'), -300, 300, 'cash');
insert into tests.results select 'after_refund', public.unpaid_purchases(tests.id('biz_a'), 200, 0);
select tests.cc(tests.id('biz_a'), tests.id('p_combo'), 500);
select tests.ret(tests.id('biz_a'), tests.id('soap'), 1, 100, 'reduce_unpaid', tests.id('p_combo'));
select tests.pay(tests.id('biz_a'), tests.id('p_combo'), 50);
-- paid in full, never listed
insert into tests.ids select 'p_paid', tests.buy(tests.id('biz_a'), tests.id('rice'), 5, 500, 500);
insert into tests.results select 'all', public.unpaid_purchases(tests.id('biz_a'), 200, 0);
insert into tests.results select 'pg0', public.unpaid_purchases(tests.id('biz_a'), 2, 0);
insert into tests.results select 'pg1', public.unpaid_purchases(tests.id('biz_a'), 2, 2);
insert into tests.results select 'pg2', public.unpaid_purchases(tests.id('biz_a'), 2, 4);
insert into tests.results select 'pg3', public.unpaid_purchases(tests.id('biz_a'), 2, 6);
insert into tests.results select 'dflt', public.unpaid_purchases(tests.id('biz_a'));
insert into tests.results select 'empty', public.unpaid_purchases(tests.id('biz_a3'));
reset role;

-- ===========================================================================
-- Function definition and privileges unchanged (T7 TC-INV-81a/b)
-- ===========================================================================
select ok((select prosecdef and provolatile = 's' and proconfig = array['search_path=""']
           from pg_proc where oid = 'public.unpaid_purchases(uuid,integer,integer)'::regprocedure),
  'M2-01: unpaid_purchases is still SECURITY DEFINER, STABLE, with an empty search_path');
select ok(has_function_privilege('authenticated', 'public.unpaid_purchases(uuid,integer,integer)', 'execute')
          and not has_function_privilege('anon', 'public.unpaid_purchases(uuid,integer,integer)', 'execute')
          and not exists (select 1 from information_schema.routine_privileges
                          where routine_schema = 'public' and routine_name = 'unpaid_purchases' and grantee = 'PUBLIC'),
  'M2-02: only signed-in users can execute it (no anon, no PUBLIC grant)');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'unpaid_purchases'), 1,
  'M2-03: one function, the same signature (no overload added)');

-- ===========================================================================
-- Output shape: same top-level keys; exactly four new keys per purchase
-- ===========================================================================
select is((select array_agg(k order by k) from jsonb_object_keys(tests.r('all')) k),
          array['limit','offset','purchase_count','purchases','total_owed'],
  'M2-04: the top-level keys are unchanged');
select ok((select bool_and((select array_agg(k order by k) from jsonb_object_keys(e) k)
                           = array['corrected_cost','cost_corrections','paid','payments','product_active','product_id',
                                   'product_name','purchase_cost','purchase_id','purchased_on','refunds_received',
                                   'return_credits','supplier_name','unpaid'])
           from jsonb_array_elements(tests.r('all') -> 'purchases') e),
  'M2-05: every purchase has the ten existing keys plus exactly corrected_cost, cost_corrections, refunds_received, return_credits');
select ok((select bool_and(jsonb_typeof(e -> f) = 'number' and (e ->> f) ~ '^-?[0-9]+$')
           from jsonb_array_elements(tests.r('all') -> 'purchases') e,
                unnest(array['corrected_cost','cost_corrections','refunds_received','return_credits']) f),
  'M2-06: the four new fields are whole numbers of pesewas');

-- ===========================================================================
-- The new fields, scenario by scenario
-- ===========================================================================
select is(tests.m2(tests.row('all', 'p_plain')),
          '{"corrected_cost":1000,"cost_corrections":0,"refunds_received":0,"return_credits":0}'::jsonb,
  'M2-10 (no history): corrected cost equals the original cost; no corrections, refunds or credits');
select ok(tests.row('all', 'p_plain') @> '{"purchase_cost":1000,"paid":200,"payments":0,"unpaid":800}',
  'M2-11 (no history): existing fields unchanged: cost 1000, paid 200, no payments, owes 800');
select is(tests.m2(tests.row('all', 'p_up')),
          '{"corrected_cost":2300,"cost_corrections":300,"refunds_received":0,"return_credits":0}'::jsonb,
  'M2-12 (positive correction +300): corrected cost 2300');
select ok(tests.row('all', 'p_up') @> '{"purchase_cost":2000,"paid":500,"payments":1,"unpaid":1800}',
  'M2-13 (positive correction): purchase_cost stays the original 2000; paid 500; owes 1800');
select ok((select count(*) = 2 and count(*) filter (where type = 'quantity' and cost_change = 0) = 1
           from public.purchase_corrections where purchase_id = tests.id('p_up')),
  'M2-13a setup: the purchase also has a quantity correction (cost_change 0), which adds nothing to cost_corrections');
select is(tests.m2(tests.row('all', 'p_down')),
          '{"corrected_cost":2500,"cost_corrections":-500,"refunds_received":0,"return_credits":0}'::jsonb,
  'M2-14 (negative correction -500): corrected cost 2500, cost_corrections signed -500');
select ok(tests.row('all', 'p_down') @> '{"purchase_cost":3000,"paid":1000,"payments":0,"unpaid":1500}',
  'M2-15 (negative correction): purchase_cost stays 3000; owes 1500');
select is(tests.m2(tests.row('all', 'p_credit')),
          '{"corrected_cost":1000,"cost_corrections":0,"refunds_received":0,"return_credits":150}'::jsonb,
  'M2-16 (return credits): only the reduce_unpaid credit (150) counts; the cash (90) and MoMo (80) refunds are excluded');
select ok(tests.row('all', 'p_credit') @> '{"purchase_cost":1000,"paid":0,"unpaid":850}',
  'M2-17 (return credits): owes 850; the cash and MoMo return refunds change neither paid nor unpaid');
select is((select count(*)::int from public.supplier_returns where purchase_id = tests.id('p_credit') and credit_type in ('refund_cash','refund_momo')), 2,
  'M2-18 setup: the two refund returns really are linked to the purchase (so their exclusion is tested)');
select is(tests.row('after_refund', 'p_combo'), null,
  'M2-19 (refund): after -300 with the 300 excess refunded, nothing is owed and the purchase is not listed');
select is(tests.m2(tests.row('all', 'p_combo')),
          '{"corrected_cost":1200,"cost_corrections":200,"refunds_received":300,"return_credits":100}'::jsonb,
  'M2-20 (combined): -300 and +500 net to +200 (corrected 1200), refund 300, return credit 100: all four non-zero');
select ok(tests.row('all', 'p_combo') @> '{"purchase_cost":1000,"paid":1050,"payments":1,"unpaid":350}',
  'M2-21 (combined): purchase_cost 1000, paid 1050 (1000 at purchase + 50 later), owes 350 = 1200 - 1050 + 300 - 100');
select is(tests.row('all', 'p_paid'), null, 'M2-22: a purchase paid in full is still not listed');

-- ===========================================================================
-- The identity, and the existing fields' meanings, for every returned row
-- ===========================================================================
select ok((select bool_and((e ->> 'unpaid')::bigint = (e ->> 'corrected_cost')::bigint - (e ->> 'paid')::bigint
                                                     + (e ->> 'refunds_received')::bigint - (e ->> 'return_credits')::bigint)
                  and count(*) = 5
           from jsonb_array_elements(tests.r('all') -> 'purchases') e),
  'M2-30: unpaid = corrected_cost - paid + refunds_received - return_credits for every row (5 rows)');
select ok((select bool_and((e ->> 'corrected_cost')::bigint = (e ->> 'purchase_cost')::bigint + (e ->> 'cost_corrections')::bigint)
           from jsonb_array_elements(tests.r('all') -> 'purchases') e),
  'M2-31: corrected_cost = purchase_cost + cost_corrections for every row');
select ok((select bool_and((e ->> 'unpaid')::bigint = private.purchase_unpaid(tests.id('biz_a'), (e ->> 'purchase_id')::uuid))
           from jsonb_array_elements(tests.r('all') -> 'purchases') e),
  'M2-32: unpaid is still exactly private.purchase_unpaid for every row (the single authoritative balance)');
select ok((select bool_and((e ->> 'purchase_cost')::bigint = p.purchase_cost
                       and (e ->> 'paid')::bigint = p.paid_now + coalesce((select sum(s.amount) from public.supplier_payments s where s.purchase_id = p.id), 0)
                       and (e ->> 'payments')::int = (select count(*) from public.supplier_payments s where s.purchase_id = p.id))
           from jsonb_array_elements(tests.r('all') -> 'purchases') e
           join public.purchases p on p.id = (e ->> 'purchase_id')::uuid),
  'M2-33: purchase_cost is the original cost, paid is paid now + later payments (gross), payments is their count, for every row');
select ok((select bool_and((e ->> 'cost_corrections')::bigint = coalesce((select sum(c.cost_change) from public.purchase_corrections c where c.purchase_id = p.id), 0)
                       and (e ->> 'refunds_received')::bigint = coalesce((select sum(c.refund_amount) from public.purchase_corrections c where c.purchase_id = p.id), 0)
                       and (e ->> 'return_credits')::bigint = coalesce((select sum(r.credit_amount) from public.supplier_returns r
                                                                       where r.purchase_id = p.id and r.credit_type = 'reduce_unpaid'), 0))
           from jsonb_array_elements(tests.r('all') -> 'purchases') e
           join public.purchases p on p.id = (e ->> 'purchase_id')::uuid),
  'M2-34: each new field equals its sum over the purchase''s own records, computed independently');

-- ===========================================================================
-- Totals, ordering and pagination unchanged
-- ===========================================================================
select ok(tests.r('all') @> '{"total_owed":5300,"purchase_count":5,"limit":200,"offset":0}',
  'M2-40: total owed 5300 (800 + 1800 + 1500 + 850 + 350) and count 5');
select ok((select bool_and(r @> '{"total_owed":5300,"purchase_count":5}') from tests.results where k in ('pg0','pg1','pg2','pg3','dflt')),
  'M2-41: every page reports the totals across all unpaid purchases, not just its own');
select is((select jsonb_agg(e ->> 'purchase_id' order by n) from jsonb_array_elements(tests.r('all') -> 'purchases') with ordinality x(e, n)),
          (select jsonb_agg(p.id::text order by p.purchased_on, p.created_at, p.id) from public.purchases p
           where p.business_id = tests.id('biz_a') and private.purchase_unpaid(p.business_id, p.id) > 0),
  'M2-42: oldest purchase date first, then recording time, then ID');
select is((select jsonb_agg(e order by k, n) from tests.results, jsonb_array_elements(r -> 'purchases') with ordinality x(e, n)
           where k in ('pg0','pg1','pg2')), tests.r('all') -> 'purchases',
  'M2-43: pages of 2 put together give exactly the full list, new fields included');
select ok(jsonb_array_length(tests.r('pg2') -> 'purchases') = 1 and tests.r('pg3') -> 'purchases' = '[]'::jsonb
          and tests.r('pg3') @> '{"limit":2,"offset":6}' and tests.r('dflt') @> '{"limit":50,"offset":0}',
  'M2-44: the last page is partial, a page past the end is empty, defaults are 50 / 0');
select is(tests.r('empty'), '{"total_owed":0,"purchase_count":0,"limit":50,"offset":0,"purchases":[]}'::jsonb,
  'M2-45: a shop with no unpaid purchases returns exactly the existing empty result');

-- ===========================================================================
-- Errors, authentication, membership and isolation unchanged
-- ===========================================================================
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select throws_ok($q$select public.unpaid_purchases(tests.id('biz_a'), 0, 0)$q$, '22023', 'invalid_limit', 'M2-50: page size 0 is refused');
select throws_ok($q$select public.unpaid_purchases(tests.id('biz_a'), 201, 0)$q$, '22023', 'invalid_limit', 'M2-51: page size over 200 is refused');
select throws_ok($q$select public.unpaid_purchases(tests.id('biz_a'), null, 0)$q$, '22023', 'invalid_limit', 'M2-52: a missing page size is refused');
select throws_ok($q$select public.unpaid_purchases(tests.id('biz_a'), 10, -1)$q$, '22023', 'invalid_offset', 'M2-53: a negative offset is refused');
select throws_ok($q$select public.unpaid_purchases(tests.id('biz_a'), 10, null)$q$, '22023', 'invalid_offset', 'M2-54: a missing offset is refused');
select throws_ok($q$select public.unpaid_purchases(tests.id('biz_b'))$q$, '42501', 'not_a_member', 'M2-55: owner A cannot read shop B''s list');
select throws_ok($q$select public.unpaid_purchases(null)$q$, '42501', 'not_a_member', 'M2-56: a missing shop is refused like a foreign one');
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
insert into tests.results select 'list_b', public.unpaid_purchases(tests.id('biz_b'), 200, 0);
select throws_ok($q$select public.unpaid_purchases(tests.id('biz_a'))$q$, '42501', 'not_a_member', 'M2-57: owner B cannot read shop A''s list');
reset role;
select ok(tests.r('list_b') @> '{"purchase_count":1,"total_owed":5300}'
          and tests.m2(tests.r('list_b') -> 'purchases' -> 0) = '{"corrected_cost":5700,"cost_corrections":700,"refunds_received":0,"return_credits":400}'::jsonb,
  'M2-58 (isolation): shop B sees only its own purchase, with its own correction (+700) and credit (400): 5700 - 0 + 0 - 400 = 5300');
select ok(not exists (select 1 from jsonb_array_elements(tests.r('all') -> 'purchases') e where e ->> 'purchase_id' = tests.id('p_b')::text),
  'M2-59 (isolation): shop A''s list never contains shop B''s purchase');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_ok($q$select public.unpaid_purchases(tests.id('biz_a'))$q$, '42501', 'not_authenticated', 'M2-60: no signed-in user is refused');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($q$select public.unpaid_purchases(tests.id('biz_a'))$q$, '42501', null, 'M2-61: anonymous callers cannot execute it');
reset role;

-- ===========================================================================
-- Performance observation (no threshold; owner decision M2: measure, don't optimise)
-- ===========================================================================
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
insert into tests.ids select 'biz_s', (public.create_business(gen_random_uuid(), 'Ama Busy Shop', 'provision', 'Accra', null) ->> 'business_id')::uuid;
insert into tests.ids select 'big', tests.mkp(tests.id('biz_s'), 'Busy item');
do $$
declare i integer; v uuid;
begin
  for i in 1 .. 2000 loop
    v := tests.buy(tests.id('biz_s'), tests.id('big'), 1, 1000, 0);
    if i % 4 = 0 then perform tests.pay(tests.id('biz_s'), v, 100); end if;
    if i % 10 = 0 then perform tests.cc(tests.id('biz_s'), v, 50); end if;
  end loop;
end $$;
analyze public.purchases, public.supplier_payments, public.purchase_corrections, public.supplier_returns;
create temp table perf as select clock_timestamp() as t0, null::timestamptz as t1, null::jsonb as r;
update perf set r = public.unpaid_purchases(tests.id('biz_s'), 200, 0);
update perf set t1 = clock_timestamp();
select ok((select r @> '{"purchase_count":2000}' and (r ->> 'total_owed')::bigint = 2000 * 1000 - 500 * 100 + 200 * 50
                  and jsonb_array_length(r -> 'purchases') = 200 from perf),
  'M2-70: with 2,000 unpaid purchases (500 payments, 200 corrections) the totals are exact and one page has 200 rows');
select diag('M2-70 measurement: unpaid_purchases over 2000 unpaid purchases (page of 200) in '
            || round(extract(epoch from (t1 - t0)) * 1000, 1) || ' ms') from perf;

select * from finish();
rollback;
