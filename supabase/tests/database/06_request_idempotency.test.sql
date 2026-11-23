-- Idempotency keys (09 §4.3): private.claim_request and every server function that uses it.
-- A replayed request ID returns the stored result only to the SAME user, for the SAME function
-- and for the SAME business. Anything else is refused with request_id_reused. The one exception:
-- create_business replayed with no business (it claims before the shop exists) is not compared
-- by business, so its retries stay idempotent. Owner A has two shops here, so cross-shop replay
-- can be tested.
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
-- Request-log rows, read as the superuser (the API cannot read request_log at all)
create function tests.log_rows(p_request uuid) returns integer language sql stable security definer as $$
  select count(*)::integer from public.request_log where request_id = p_request
$$;
grant execute on function tests.log_rows(uuid) to authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner.a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner.b@example.test');

-- Fixed request IDs, so replays are explicit
insert into tests.ids (k, v) values
  ('rq_biz_a1',  '55555555-5555-5555-5555-555555555501'),
  ('rq_biz_a2',  '55555555-5555-5555-5555-555555555502'),
  ('rq_biz_b',   '55555555-5555-5555-5555-555555555503'),
  ('rq_prod',    '55555555-5555-5555-5555-555555555511'),
  ('rq_dev',     '55555555-5555-5555-5555-555555555512'),
  ('rq_arch',    '55555555-5555-5555-5555-555555555513'),
  ('rq_upd',     '55555555-5555-5555-5555-555555555514'),
  ('rq_fail',    '55555555-5555-5555-5555-555555555515');

-- ---------------------------------------------------------------------------
-- Fixtures: owner A has two shops (A1, A2); owner B has one (B)
-- ---------------------------------------------------------------------------
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
insert into tests.results select 'biz_a1', public.create_business(tests.id('rq_biz_a1'), 'Ama Main Shop', 'provision', 'Accra', null);
insert into tests.ids select 'biz_a1', (tests.r('biz_a1') ->> 'business_id')::uuid;
insert into tests.ids select 'biz_a2', (public.create_business(tests.id('rq_biz_a2'), 'Ama Second Shop', 'minimart', 'Tema', null) ->> 'business_id')::uuid;
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
insert into tests.ids select 'biz_b', (public.create_business(tests.id('rq_biz_b'), 'Kofi Shop', 'provision', 'Kumasi', null) ->> 'business_id')::uuid;
reset role;

-- ===========================================================================
-- create_business: claims with no business; retries stay idempotent
-- ===========================================================================
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select is(public.create_business(tests.id('rq_biz_a1'), 'Ama Main Shop', 'provision', 'Accra', null), tests.r('biz_a1'),
  'TC-IDEM-01: repeating create_business with the same request ID returns the original result (business and reference)');
select is((select count(*) from public.businesses where id in (tests.id('biz_a1'), tests.id('biz_a2')))::int, 2,
  'TC-IDEM-02: the repeat created no extra shop (owner A still has exactly two)');
select is((select count(*) from public.business_members where user_id = '00000000-0000-0000-0000-0000000000a1')::int, 2,
  'TC-IDEM-03: the repeat created no extra membership');
reset role;
select is((select business_id from public.request_log where request_id = tests.id('rq_biz_a1')), tests.id('biz_a1'),
  'TC-IDEM-04: create_business recorded its new shop on the request (set once, from empty)');

-- ===========================================================================
-- Same user, same function, same business: the original result is returned
-- ===========================================================================
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
insert into tests.results select 'prod', public.create_product(tests.id('rq_prod'), tests.id('biz_a1'), 'Milo sachet', 150, p_opening_stock => 5, p_cost_price => 100);
insert into tests.ids select 'prod_a1', (tests.r('prod') ->> 'product_id')::uuid;
select is(public.create_product(tests.id('rq_prod'), tests.id('biz_a1'), 'Milo sachet', 150, p_opening_stock => 5, p_cost_price => 100), tests.r('prod'),
  'TC-IDEM-05: create_product retried with the same ID and shop returns the original result');
select is((select count(*) from public.products where business_id = tests.id('biz_a1'))::int, 1,
  'TC-IDEM-06: the retry created no second product');
select is((select count(*) from public.stock_movements where product_id = tests.id('prod_a1'))::int, 1,
  'TC-IDEM-07: the retry wrote no second opening movement');

insert into tests.results select 'dev', public.register_device(tests.id('rq_dev'), tests.id('biz_a1'), 'Phone');
select is(public.register_device(tests.id('rq_dev'), tests.id('biz_a1'), 'Phone'), tests.r('dev'),
  'TC-IDEM-08: register_device retried with the same ID and shop returns the original device');
select is((select count(*) from public.devices where business_id = tests.id('biz_a1'))::int, 1,
  'TC-IDEM-09: the retry registered no second device');

insert into tests.results select 'upd', public.update_product(tests.id('rq_upd'), tests.id('biz_a1'), tests.id('prod_a1'), 'Milo sachet 20g', 175, null, null, 5);
select is(public.update_product(tests.id('rq_upd'), tests.id('biz_a1'), tests.id('prod_a1'), 'Milo sachet 20g', 175, null, null, 5), tests.r('upd'),
  'TC-IDEM-10: update_product retried with the same ID and shop returns the original result');
select is((select count(*) from public.audit_log where action = 'update_product' and entity_id = tests.id('prod_a1'))::int, 1,
  'TC-IDEM-11: the retry wrote no second audit entry');

-- ===========================================================================
-- Same user, same function, DIFFERENT business: refused (the fix)
-- ===========================================================================
select throws_ok($q$select public.create_product(tests.id('rq_prod'), tests.id('biz_a2'), 'Milo sachet', 150, p_opening_stock => 5, p_cost_price => 100)$q$,
  '22023', 'request_id_reused', 'TC-IDEM-12: create_product with a request ID already used for another shop is refused');
select is((select count(*) from public.products where business_id = tests.id('biz_a2'))::int, 0,
  'TC-IDEM-13: no product was created in the second shop');
select throws_ok($q$select public.register_device(tests.id('rq_dev'), tests.id('biz_a2'), 'Phone')$q$,
  '22023', 'request_id_reused', 'TC-IDEM-14: register_device with a request ID already used for another shop is refused');
select is((select count(*) from public.devices where business_id = tests.id('biz_a2'))::int, 0,
  'TC-IDEM-15: no device was registered in the second shop');

insert into tests.ids select 'prod_a2', (public.create_product(gen_random_uuid(), tests.id('biz_a2'), 'Second shop soap', 500) ->> 'product_id')::uuid;
select throws_ok($q$select public.update_product(tests.id('rq_upd'), tests.id('biz_a2'), tests.id('prod_a2'), 'Renamed', 999, null, null, 5)$q$,
  '22023', 'request_id_reused', 'TC-IDEM-16: update_product with a request ID already used for another shop is refused');
select ok((select name = 'Second shop soap' and selling_price = 500 from public.products where id = tests.id('prod_a2')),
  'TC-IDEM-17: the second shop''s product is unchanged');
select lives_ok($q$select public.set_product_archived(tests.id('rq_arch'), tests.id('biz_a1'), tests.id('prod_a1'), true)$q$,
  'TC-IDEM-18: (setup) a product in shop A1 is archived with a request ID');
select throws_ok($q$select public.set_product_archived(tests.id('rq_arch'), tests.id('biz_a2'), tests.id('prod_a2'), true)$q$,
  '22023', 'request_id_reused', 'TC-IDEM-19: set_product_archived with a request ID already used for another shop is refused');
select ok((select active from public.products where id = tests.id('prod_a2')),
  'TC-IDEM-20: the second shop''s product is still active');
select is(public.set_product_archived(tests.id('rq_arch'), tests.id('biz_a1'), tests.id('prod_a1'), true) ->> 'changed', 'true',
  'TC-IDEM-21: the original shop''s retry still returns the original result after a refused cross-shop replay');
reset role;
select is(tests.log_rows(tests.id('rq_prod')), 1, 'TC-IDEM-22: the refused replays added no request-log row');
select is((select business_id from public.request_log where request_id = tests.id('rq_prod')), tests.id('biz_a1'),
  'TC-IDEM-23: the stored request still belongs to the original shop');

-- ===========================================================================
-- Existing refusals unchanged: another user, another function
-- ===========================================================================
select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select throws_ok($q$select public.create_product(tests.id('rq_prod'), tests.id('biz_b'), 'Milo sachet', 150)$q$,
  '22023', 'request_id_reused', 'TC-IDEM-24: another user cannot reuse a request ID, even for their own shop');
select throws_ok($q$select public.create_business(tests.id('rq_biz_a1'), 'Copy', 'other')$q$,
  '22023', 'request_id_reused', 'TC-IDEM-25: another user cannot replay someone else''s create_business');
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select throws_ok($q$select public.update_product(tests.id('rq_prod'), tests.id('biz_a1'), tests.id('prod_a1'), 'X', 100, null, null, 5)$q$,
  '22023', 'request_id_reused', 'TC-IDEM-26: the same user cannot reuse a request ID for a different function (same shop)');
select throws_ok($q$select public.register_device(tests.id('rq_biz_a1'), tests.id('biz_a1'), 'Phone')$q$,
  '22023', 'request_id_reused', 'TC-IDEM-27: a create_business request ID cannot be reused for another function');

-- ===========================================================================
-- Failed requests still roll back their claim
-- ===========================================================================
select throws_ok($q$select public.create_product(tests.id('rq_fail'), tests.id('biz_a1'), 'Bad price', 0)$q$,
  '22023', 'invalid_selling_price', 'TC-IDEM-28: (setup) a request that fails validation');
select is(tests.log_rows(tests.id('rq_fail')), 0, 'TC-IDEM-29: the failed request left no claim behind');
select isnt(public.create_product(tests.id('rq_fail'), tests.id('biz_a1'), 'Good price', 100) ->> 'product_id', null,
  'TC-IDEM-30: the same request ID can then be used successfully (the failed attempt was rolled back)');
reset role;

-- ===========================================================================
-- claim_request itself
-- ===========================================================================
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc
           where oid = 'private.claim_request(uuid,text,uuid)'::regprocedure),
  'TC-IDEM-31: claim_request is SECURITY DEFINER with an empty search_path');
select ok(not has_function_privilege('authenticated', 'private.claim_request(uuid,text,uuid)', 'execute')
          and not has_function_privilege('anon', 'private.claim_request(uuid,text,uuid)', 'execute'),
  'TC-IDEM-32: claim_request is still not callable through the API');


-- Matching rules, called directly (as the superuser, with owner A's token claims)
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
select is(private.claim_request('66666666-6666-6666-6666-666666666601', 'unit_test', null), null,
  'TC-IDEM-33: (setup) a first claim with no business proceeds');
select throws_ok(format('select private.claim_request(%L, ''unit_test'', %L)', '66666666-6666-6666-6666-666666666601', tests.id('biz_a1')),
  '22023', 'request_id_reused', 'TC-IDEM-34: a claim stored with no business cannot be replayed for a business');
select is(private.claim_request('66666666-6666-6666-6666-666666666602', 'unit_test', tests.id('biz_a1')), null,
  'TC-IDEM-35: (setup) a first claim for shop A1 proceeds');
select is(private.complete_request('66666666-6666-6666-6666-666666666602', '{"done": 1}'), '{"done": 1}'::jsonb,
  'TC-IDEM-36: (setup) its result is stored');
select is(private.claim_request('66666666-6666-6666-6666-666666666602', 'unit_test', tests.id('biz_a1')), '{"done": 1}'::jsonb,
  'TC-IDEM-37: a replay for the same shop returns the stored result');
select is(private.claim_request(tests.id('rq_biz_a1'), 'create_business', null), tests.r('biz_a1'),
  'TC-IDEM-38: create_business replayed with no business returns its stored result (the business it created)');
select throws_ok(format('select private.claim_request(%L, ''unit_test'', %L)', '66666666-6666-6666-6666-666666666602', tests.id('biz_a2')),
  '22023', 'request_id_reused', 'TC-IDEM-39: a replay for a different shop is refused');
select throws_ok($q$select private.claim_request('66666666-6666-6666-6666-666666666602', 'unit_test', null)$q$,
  '22023', 'request_id_reused',
  'TC-IDEM-44: any other function replayed with no business against a stored business is refused (only create_business is exempt)');

select * from finish();
rollback;
