-- Stage 1C, task T10: acknowledge_attention, check_stock_integrity (+ internal core), low_stock_products.
-- Plan: docs/stages/STAGE-1C-T10-ATTENTION-INTEGRITY-LOWSTOCK-PLAN.md. Owner decisions A1 – A3, I1 – I3, L1 – L3.
-- Acknowledging changes no figures (S-36, TC-ATTN-05); the check and the list write nothing; the
-- low-stock definition is inventory_summary's (04 §2.4). Fixtures are fictitious; everything is
-- rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(76);

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
create function tests.mkp(p_biz uuid, p_name text, p_cost bigint, p_open integer, p_level integer default 5) returns uuid language sql as $$
  select (public.create_product(gen_random_uuid(), p_biz, p_name, 1000, p_cost_price => p_cost, p_opening_stock => p_open,
                                p_low_stock_level => p_level) ->> 'product_id')::uuid
$$;
grant execute on function tests.mkp(uuid, text, bigint, integer, integer) to authenticated;
create function tests.buy(p_biz uuid, p_product uuid, p_qty integer, p_cost bigint, p_paid bigint) returns uuid language sql as $$
  select (public.restock(gen_random_uuid(), p_biz, p_product, p_qty, p_cost, p_paid,
                         case when p_paid > 0 then 'cash_drawer' end) ->> 'purchase_id')::uuid
$$;
grant execute on function tests.buy(uuid, uuid, integer, bigint, bigint) to authenticated;
create function tests.ack(p_biz uuid, p_item uuid) returns jsonb language sql as $$
  select public.acknowledge_attention(gen_random_uuid(), p_biz, p_item)
$$;
grant execute on function tests.ack(uuid, uuid) to authenticated;
create function tests.chk(p_biz uuid, p_product uuid default null, p_limit integer default 200) returns jsonb language sql as $$
  select public.check_stock_integrity(p_biz, p_product, p_limit)
$$;
grant execute on function tests.chk(uuid, uuid, integer) to authenticated;
-- the codes reported by the core for one product (superuser)
create function tests.codes(p_biz uuid, p_product uuid) returns text[] language sql stable as $$
  select coalesce(array_agg(check_code order by check_code), '{}') from private.stock_integrity(p_biz, p_product)
$$;
create function tests.hit(p_biz uuid, p_product uuid, p_code text) returns jsonb language sql stable as $$
  select jsonb_build_object('expected', expected, 'actual', actual) from private.stock_integrity(p_biz, p_product) where check_code = p_code
$$;
-- a fingerprint of every figure-bearing table of a shop (read as the superuser)
create function tests.figures(p_biz uuid) returns text language sql stable security definer as $$
  select md5(coalesce((select string_agg(to_jsonb(p)::text, '|' order by p.id) from public.products p where p.business_id = p_biz), '')
          || coalesce((select string_agg(to_jsonb(m)::text, '|' order by m.id) from public.stock_movements m where m.business_id = p_biz), '')
          || coalesce((select string_agg(to_jsonb(h)::text, '|' order by h.id) from public.product_cost_history h where h.business_id = p_biz), '')
          || coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.purchases x where x.business_id = p_biz), '')
          || coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.supplier_payments x where x.business_id = p_biz), '')
          || coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.supplier_returns x where x.business_id = p_biz), '')
          || coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.purchase_corrections x where x.business_id = p_biz), ''))
$$;
grant execute on function tests.figures(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures: owner A with shops A (clean), A2 (corruptions), A3 (low stock), A4 (scale); owner B with shop B
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner.a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner.b@example.test');

select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
insert into tests.ids select 'biz_b', (public.create_business(gen_random_uuid(), 'Kofi Test Mart', 'provision', 'Kumasi', null) ->> 'business_id')::uuid;
insert into tests.ids select 'b_prod', tests.mkp(tests.id('biz_b'), 'B milo', 120, 6);
reset role;

select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
insert into tests.ids select 'biz_a',  (public.create_business(gen_random_uuid(), 'Ama Test Provisions', 'provision', 'Accra', null) ->> 'business_id')::uuid;
insert into tests.ids select 'biz_a2', (public.create_business(gen_random_uuid(), 'Ama Second Shop', 'minimart', 'Tema', null) ->> 'business_id')::uuid;
insert into tests.ids select 'biz_a3', (public.create_business(gen_random_uuid(), 'Ama Low Shop', 'other', 'Accra', null) ->> 'business_id')::uuid;
insert into tests.ids select 'biz_a4', (public.create_business(gen_random_uuid(), 'Ama Wholesale', 'other', 'Accra', null) ->> 'business_id')::uuid;
insert into tests.ids select 'dev_a', (public.register_device(gen_random_uuid(), tests.id('biz_a'), 'Phone') ->> 'device_id')::uuid;
-- Shop A: every T3 – T9 operation kind
insert into tests.ids select 'milo',  tests.mkp(tests.id('biz_a'), 'Milo tin', 1500, 10);
insert into tests.ids select 'p_milo', tests.buy(tests.id('biz_a'), tests.id('milo'), 10, 15000, 0);
select public.update_product(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), 'Milo tin', 1600, null, 'tin', 4);
select public.set_cost(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), 1550, 'Supplier price list');
select public.adjust_stock(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), 'damaged', null, -2);
select public.pay_supplier(gen_random_uuid(), tests.id('biz_a'), tests.id('p_milo'), 5000, 'momo');
insert into tests.results select 'ret', public.return_to_supplier(gen_random_uuid(), tests.id('biz_a'), tests.id('milo'), 2, 2000, 'refund_cash', 'Dented', tests.id('p_milo'));
insert into tests.results select 'corr', public.correct_purchase(gen_random_uuid(), tests.id('biz_a'), tests.id('p_milo'), 'cost', 'Invoice', p_cost_change => 700);
select public.correct_purchase(gen_random_uuid(), tests.id('biz_a'), tests.id('p_milo'), 'quantity', 'Short', p_qty_change => -1);
-- near-boundary products that must NOT be reported (121k)
insert into tests.ids select 'soldout', tests.mkp(tests.id('biz_a'), 'Sold out soap', 500, 3);
select public.adjust_stock(gen_random_uuid(), tests.id('biz_a'), tests.id('soldout'), 'count_correction', 0, null);
insert into tests.ids select 'thirds', tests.mkp(tests.id('biz_a'), 'Biscuit thirds', 333, 3);
insert into tests.ids select 'unknown', tests.mkp(tests.id('biz_a'), 'Rice no cost', null, 4);
insert into tests.ids select 'empty', tests.mkp(tests.id('biz_a'), 'Never stocked', null, 0);
insert into tests.ids select 'arch', tests.mkp(tests.id('biz_a'), 'Old torch', 50, 3);
select public.set_product_archived(gen_random_uuid(), tests.id('biz_a'), tests.id('arch'), true);
insert into tests.ids select 'neg', tests.mkp(tests.id('biz_a'), 'Sardine oversold', 1000, 2);
insert into tests.ids select 'gone', tests.mkp(tests.id('biz_a'), 'Gone item', 100, 2);
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
update public.products set deleted_at = now() where id = tests.id('gone');
select private.apply_movement(tests.id('biz_a'), tests.id('thirds'), 'value_correction', 0, 1);   -- 3 / 1000: average 333.3333
insert into tests.ids values ('sale', 'd0000000-0000-0000-0000-000000000001');
insert into public.sales (id, business_id, device_id, receipt_no, subtotal, total, payment_method, mode,
                          occurred_at_device, occurred_at, time_confidence, cost_basis, payload_version)
values (tests.id('sale'), tests.id('biz_a'), tests.id('dev_a'), 'A-000001', 100, 100, 'cash', 'offline', now(), now(), 'high', 'occurred_at', 1);
select private.apply_movement(tests.id('biz_a'), tests.id('neg'), 'sale', -4, -4000, p_sale_id => tests.id('sale'));   -- -2 / -2000
select private.apply_movement(tests.id('biz_a'), tests.id('neg'), 'void', 1, 1000, p_sale_id => tests.id('sale'));      -- -1 / -1000

-- Attention items in shop A: real ones (T8 C-25c, T9 correction, T1 C-25b) and fixtures for the types
-- nothing raises yet (Stage 1D)
insert into tests.ids select 'i_c25c', (tests.r('ret') ->> 'attention_item_id')::uuid;
insert into tests.ids select 'i_corr', (tests.r('corr') ->> 'attention_item_id')::uuid;
insert into tests.ids select 'cc', tests.mkp(tests.id('biz_a'), 'Milk tin', 1000, 4);
select private.apply_movement(tests.id('biz_a'), tests.id('cc'), 'value_correction', 0, -5000);        -- C-25b -> cost_check
insert into tests.ids select 'i_check', id from public.attention_items where type = 'cost_check' and entity_id = tests.id('cc');
insert into tests.ids values ('i_time', 'f0000000-0000-0000-0000-000000000001'), ('i_closed', 'f0000000-0000-0000-0000-000000000002'),
  ('i_negstock', 'f0000000-0000-0000-0000-000000000003'), ('i_disc', 'f0000000-0000-0000-0000-000000000004'),
  ('i_missing', 'f0000000-0000-0000-0000-000000000005'), ('i_resolved', 'f0000000-0000-0000-0000-000000000006'),
  ('i_a2', 'f0000000-0000-0000-0000-000000000007'), ('i_rep', 'f0000000-0000-0000-0000-000000000008');
insert into public.attention_items (id, business_id, type, entity, entity_id, message_data, status) values
  (tests.id('i_time'),     tests.id('biz_a'),  'time_uncertain',     'sale',       tests.id('sale'), '{"rule":"C-125"}', 'open'),
  (tests.id('i_closed'),   tests.id('biz_a'),  'closed_day_changed', 'day',        null,             '{"rule":"C-126"}', 'open'),
  (tests.id('i_negstock'), tests.id('biz_a'),  'negative_stock',     'product',    tests.id('neg'),  '{"rule":"C-120"}', 'open'),
  (tests.id('i_disc'),     tests.id('biz_a'),  'stock_discrepancy',  'product',    tests.id('neg'),  '{"rule":"C-120"}', 'open'),
  (tests.id('i_missing'),  tests.id('biz_a'),  'cost_missing',       'product',    tests.id('unknown'), '{"rule":"C-124"}', 'open'),
  (tests.id('i_resolved'), tests.id('biz_a'),  'cost_adjustment',    'stock_movement', null,        '{"rule":"C-25a"}', 'resolved'),
  (tests.id('i_a2'),       tests.id('biz_a2'), 'cost_adjustment',    'stock_movement', null,        '{"rule":"C-25a"}', 'open'),
  (tests.id('i_rep'),      tests.id('biz_a'),  'cost_check',         'product',    tests.id('milo'), '{"rule":"C-25b"}', 'open');
create temp table item_before as select id, to_jsonb(a) - 'status' - 'acknowledged_by' - 'acknowledged_at' - 'updated_at' as row
  from public.attention_items a where business_id = tests.id('biz_a');
create temp table figs_before as select tests.figures(tests.id('biz_a')) as f;
grant select on item_before, figs_before to authenticated;

-- ===========================================================================
-- Definitions and privileges (security model, plan §4.1)
-- ===========================================================================
select ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc
           where oid in ('public.acknowledge_attention(uuid,uuid,uuid)'::regprocedure, 'public.check_stock_integrity(uuid,uuid,integer)'::regprocedure))
          and (select not prosecdef and proconfig @> array['search_path=""'] and provolatile = 's'
               from pg_proc where oid = 'public.low_stock_products(uuid,integer,integer)'::regprocedure)
          and (select provolatile = 's' from pg_proc where oid = 'public.check_stock_integrity(uuid,uuid,integer)'::regprocedure)
          and (select provolatile = 's' and proconfig @> array['search_path=""'] from pg_proc where oid = 'private.stock_integrity(uuid,uuid)'::regprocedure),
  'TC-INV-120a: acknowledge and the integrity wrapper are SECURITY DEFINER, the list INVOKER; all pin search_path; check, core and list are read-only (STABLE)');
select ok((select bool_and(has_function_privilege('authenticated', f, 'execute') and not has_function_privilege('anon', f, 'execute'))
           from unnest(array['public.acknowledge_attention(uuid,uuid,uuid)', 'public.check_stock_integrity(uuid,uuid,integer)',
                             'public.low_stock_products(uuid,integer,integer)']) f)
          and not exists (select 1 from information_schema.routine_privileges where routine_schema = 'public'
                          and routine_name in ('acknowledge_attention', 'check_stock_integrity', 'low_stock_products') and grantee = 'PUBLIC'),
  'TC-INV-120a2: signed-in users can call the three public functions; anonymous callers and PUBLIC cannot');
select ok(not has_function_privilege('authenticated', 'private.stock_integrity(uuid,uuid)', 'execute')
          and not has_function_privilege('anon', 'private.stock_integrity(uuid,uuid)', 'execute')
          and not has_function_privilege('public', 'private.stock_integrity(uuid,uuid)', 'execute'),
  'TC-INV-121o: the internal integrity core is not executable by authenticated, anon or PUBLIC');
set local role authenticated;
select throws_ok($q$select * from private.stock_integrity(tests.id('biz_a'))$q$, '42501', null,
  'TC-INV-121o2: a signed-in user calling the internal core directly is refused (permission denied)');
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
select ok(not has_table_privilege('authenticated', 'public.attention_items', 'update')
          and not has_table_privilege('authenticated', 'public.attention_items', 'delete'),
  'TC-INV-120g2: the app still cannot update or delete attention items directly');

-- ===========================================================================
-- acknowledge_attention (A1 – A3)
-- ===========================================================================
set local role authenticated;
insert into tests.results select 'ack1', public.acknowledge_attention('33333333-3333-3333-3333-333333333301', tests.id('biz_a'), tests.id('i_c25c'));
reset role;
select ok(tests.r('ack1') @> jsonb_build_object('item_id', tests.id('i_c25c'), 'type', 'cost_adjustment', 'status', 'acknowledged', 'changed', true,
                                               'acknowledged_by', '00000000-0000-0000-0000-0000000000a1')
          and (select status = 'acknowledged' and acknowledged_by = '00000000-0000-0000-0000-0000000000a1' and acknowledged_at = now()
               from public.attention_items where id = tests.id('i_c25c')),
  'TC-INV-120b: an open C-25c item is acknowledged: status, who and when recorded');
select ok((select bool_and(b.row = (to_jsonb(a) - 'status' - 'acknowledged_by' - 'acknowledged_at' - 'updated_at'))
           from item_before b join public.attention_items a on a.id = b.id),
  'TC-INV-120b2: message_data, type, entity, entity_id and created_at of every item are unchanged');
select is(tests.figures(tests.id('biz_a')), (select f from figs_before),
  'TC-ATTN-05: acknowledging changes no figures (products, movements, history, purchases, payments, returns, corrections identical)');
select ok((select count(*) = 1 and bool_and(user_id = '00000000-0000-0000-0000-0000000000a1' and entity = 'attention_item'
                  and before = '{"status":"open","type":"cost_adjustment"}'::jsonb and after ->> 'status' = 'acknowledged')
           from public.audit_log where action = 'acknowledge_attention' and entity_id = tests.id('i_c25c')),
  'TC-INV-120c (A3): one audit entry with the status before and after');

set local role authenticated;
insert into tests.results select 'ack_check',  tests.ack(tests.id('biz_a'), tests.id('i_check'));
insert into tests.results select 'ack_corr',   tests.ack(tests.id('biz_a'), tests.id('i_corr'));
insert into tests.results select 'ack_time',   tests.ack(tests.id('biz_a'), tests.id('i_time'));
insert into tests.results select 'ack_closed', tests.ack(tests.id('biz_a'), tests.id('i_closed'));
select throws_ok($q$select tests.ack(tests.id('biz_a'), tests.id('i_negstock'))$q$, '22023', 'not_acknowledgeable',
  'TC-ATTN-06 (A1): a negative-stock item cannot be acknowledged (it clears only when stock >= 0)');
select throws_ok($q$select tests.ack(tests.id('biz_a'), tests.id('i_disc'))$q$, '22023', 'not_acknowledgeable',
  'TC-INV-120d (A1): a stock discrepancy cannot be acknowledged (resolved by an adjustment)');
select throws_ok($q$select tests.ack(tests.id('biz_a'), tests.id('i_missing'))$q$, '22023', 'not_acknowledgeable',
  'TC-INV-120d2 (A1): a cost-missing item cannot be acknowledged (cleared by setting the cost)');
reset role;
select ok((select bool_and((r ->> 'changed')::boolean and r ->> 'status' = 'acknowledged') from tests.results
           where k in ('ack_check', 'ack_corr', 'ack_time', 'ack_closed'))
          and (select count(*) = 4 from public.attention_items where status = 'acknowledged'
               and id in (tests.id('i_check'), tests.id('i_corr'), tests.id('i_time'), tests.id('i_closed'))),
  'TC-INV-120d3 (A1): cost_check, purchase_correction, time_uncertain and closed_day_changed can be acknowledged');
select ok((select bool_and(status = 'open' and acknowledged_by is null and acknowledged_at is null) from public.attention_items
           where id in (tests.id('i_negstock'), tests.id('i_disc'), tests.id('i_missing'))),
  'TC-INV-120d4 (A1): the refused items are unchanged (still open)');

-- A2: already acknowledged / resolved
create temp table audit_before as select count(*) as n from public.audit_log where action = 'acknowledge_attention';
grant select on audit_before to authenticated;
set local role authenticated;
insert into tests.results select 'again', tests.ack(tests.id('biz_a'), tests.id('i_c25c'));
insert into tests.results select 'res', tests.ack(tests.id('biz_a'), tests.id('i_resolved'));
reset role;
select ok(tests.r('again') @> '{"changed":false,"status":"acknowledged"}'
          and tests.r('again') ->> 'acknowledged_by' = tests.r('ack1') ->> 'acknowledged_by'
          and tests.r('again') ->> 'acknowledged_at' = tests.r('ack1') ->> 'acknowledged_at',
  'TC-INV-120e (A2): acknowledging again is a no-change result with the original who and when');
select ok(tests.r('res') @> '{"changed":false,"status":"resolved","acknowledged_by":null,"acknowledged_at":null}'
          and (select status = 'resolved' from public.attention_items where id = tests.id('i_resolved')),
  'TC-INV-120e2 (A2): a resolved item returns a no-change result and stays resolved');
select is((select count(*) from public.audit_log where action = 'acknowledge_attention'), (select n from audit_before),
  'TC-INV-120c2 (A2, A3): no audit entry for a no-change result');

-- idempotency
set local role authenticated;
insert into tests.results select 'ack1_again', public.acknowledge_attention('33333333-3333-3333-3333-333333333301', tests.id('biz_a'), tests.id('i_c25c'));
select throws_ok($q$select public.acknowledge_attention('33333333-3333-3333-3333-333333333301', tests.id('biz_a2'), tests.id('i_a2'))$q$,
  '22023', 'request_id_reused', 'TC-INV-120f2: the same request ID for the owner''s other shop is refused');
select throws_ok($q$select public.adjust_stock('33333333-3333-3333-3333-333333333301', tests.id('biz_a'), tests.id('milo'), 'damaged', null, -1)$q$,
  '22023', 'request_id_reused', 'TC-INV-120f3: the same request ID for a different function is refused');
select throws_ok($q$select public.acknowledge_attention('33333333-3333-3333-3333-333333333302', tests.id('biz_a'), tests.id('i_negstock'))$q$,
  '22023', 'not_acknowledgeable', 'TC-INV-120f4: (setup) a refused acknowledgement');
reset role;
select is(tests.r('ack1_again'), tests.r('ack1'), 'TC-INV-120f: a replay returns the original (changed) result');
select ok(not exists (select 1 from public.request_log where request_id = '33333333-3333-3333-3333-333333333302'),
  'TC-INV-120f5: a refused acknowledgement leaves no claim');

-- isolation
set local role authenticated;
select throws_ok($q$select tests.ack(tests.id('biz_a'), gen_random_uuid())$q$, 'P0002', 'attention_item_not_found', 'TC-INV-120g: an unknown item is not found');
select throws_ok($q$select tests.ack(tests.id('biz_a'), tests.id('i_a2'))$q$, 'P0002', 'attention_item_not_found',
  'TC-INV-120g3: an item of the owner''s other shop is not found through this shop');
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select throws_ok($q$select tests.ack(tests.id('biz_a'), tests.id('i_rep'))$q$, '42501', 'not_a_member', 'TC-INV-120g4: owner B cannot acknowledge through shop A');
select throws_ok($q$select tests.ack(tests.id('biz_b'), tests.id('i_rep'))$q$, 'P0002', 'attention_item_not_found',
  'TC-INV-120g5: owner B cannot acknowledge shop A''s item by passing their own shop');
reset role;
update public.business_members set active = false where business_id = tests.id('biz_b');
select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select throws_ok($q$select tests.ack(tests.id('biz_b'), gen_random_uuid())$q$, '42501', 'not_a_member', 'TC-INV-120g6: an inactive membership cannot acknowledge');
reset role;
update public.business_members set active = true where business_id = tests.id('biz_b');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_ok($q$select tests.ack(tests.id('biz_a'), tests.id('i_rep'))$q$, '42501', 'not_authenticated', 'TC-INV-120g7: no signed-in user is refused');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($q$select public.acknowledge_attention(gen_random_uuid(), tests.id('biz_a'), tests.id('i_rep'))$q$, '42501', null,
  'TC-INV-120g8: an anonymous caller cannot acknowledge');
reset role;
select ok((select status = 'open' from public.attention_items where id = tests.id('i_rep')), 'TC-INV-120g9: the refused attempts changed nothing');
select tests.as_user('00000000-0000-0000-0000-0000000000a1');

-- a repeat after acknowledgement opens a new item; the acknowledged one is kept (T1 D8)
select private.apply_movement(tests.id('biz_a'), tests.id('cc'), 'value_correction', 0, -100);   -- 4 / 0 -> -100 -> C-25b again
select ok((select count(*) = 2 from public.attention_items where type = 'cost_check' and entity_id = tests.id('cc'))
          and (select status = 'acknowledged' from public.attention_items where id = tests.id('i_check'))
          and (select count(*) = 1 from public.attention_items where type = 'cost_check' and entity_id = tests.id('cc') and status = 'open'),
  'TC-INV-120h: a repeat C-25b after acknowledgement opens a new item; the acknowledged one is kept');

-- ===========================================================================
-- check_stock_integrity (I1): clean shop, near-boundary cases, read-only
-- ===========================================================================
set local role authenticated;
insert into tests.results select 'clean', tests.chk(tests.id('biz_a'));
insert into tests.results select 'clean2', tests.chk(tests.id('biz_a'));
reset role;
select ok(tests.r('clean') @> '{"ok":true,"discrepancy_count":0,"discrepancies":[],"truncated":false}'
          and (tests.r('clean') ->> 'products_checked')::int = (select count(*) from public.products where business_id = tests.id('biz_a'))
          and (tests.r('clean') ->> 'movements_checked')::int = (select count(*) from public.stock_movements where business_id = tests.id('biz_a')),
  'TC-INV-121a: a shop exercised by every T3 – T9 operation is consistent; products and movements counted');
select ok((select count(*) = 0 from private.stock_integrity(tests.id('biz_a')))
          and tests.r('clean') ->> 'business_id' = tests.id('biz_a')::text,
  'TC-INV-121k: none of the near-boundary products is reported: 0 / 0, negative stock with negative value (and a void), archived and deleted products with movements, unknown cost at 0, a 333.3333 average, a product with no movements');
select ok((tests.r('clean') - 'checked_at') = (tests.r('clean2') - 'checked_at'),
  'TC-INV-121l: running the check twice gives the same result');
create temp table counts_before as select (select count(*) from public.attention_items) as items, (select count(*) from public.audit_log) as audit,
  (select count(*) from public.stock_movements) as mv, (select count(*) from public.request_log) as req;
grant select on counts_before to authenticated;
set local role authenticated;
select tests.chk(tests.id('biz_a'));
select tests.chk(tests.id('biz_a2'));
reset role;
select ok((select items = (select count(*) from public.attention_items) and audit = (select count(*) from public.audit_log)
                  and mv = (select count(*) from public.stock_movements) and req = (select count(*) from public.request_log) from counts_before),
  'TC-INV-121l2: the check writes nothing: no attention item, audit entry, movement or claim (even with discrepancies present)');

-- ===========================================================================
-- Each check detects its corruption (121b – 121j), in shop A2
-- ===========================================================================
set local role authenticated;
insert into tests.ids select 'x_qty',   tests.mkp(tests.id('biz_a2'), 'X qty', 100, 5);
insert into tests.ids select 'x_val',   tests.mkp(tests.id('biz_a2'), 'X value', 100, 5);
insert into tests.ids select 'x_last',  tests.mkp(tests.id('biz_a2'), 'X latest', 100, 5);
insert into tests.ids select 'x_link',  tests.mkp(tests.id('biz_a2'), 'X link', 100, 5);
insert into tests.ids select 'x_chain', tests.mkp(tests.id('biz_a2'), 'X chain', 100, 5);
insert into tests.ids select 'x_zero',  tests.mkp(tests.id('biz_a2'), 'X zero', null, 0);
insert into tests.ids select 'x_negv',  tests.mkp(tests.id('biz_a2'), 'X negative', 100, 5);
insert into tests.ids select 'x_unk',   tests.mkp(tests.id('biz_a2'), 'X unknown', null, 5);
insert into tests.ids select 'x_avg',   tests.mkp(tests.id('biz_a2'), 'X average', 100, 5);
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
update public.products set stock_qty = 6 where id = tests.id('x_qty');                           -- 6 / 500, movements 5 / 500
update public.products set stock_value = 507 where id = tests.id('x_val');                       -- 5 / 507, movements 5 / 500
insert into public.product_cost_history (business_id, product_id, effective_at, stock_qty_after, stock_value_after, avg_cost, cause)
values (tests.id('biz_a2'), tests.id('x_last'), now() + interval '1 hour', 9, 900, null, 'adjustment');   -- unlinked, later, wrong
insert into public.stock_movements (business_id, product_id, type, qty_change, value, reason)
values (tests.id('biz_a2'), tests.id('x_link'), 'adjustment', 0, 0, 'other');                  -- a movement with no history row
update public.products set stock_qty = 7 where id = tests.id('x_chain');                         -- then a real movement on top
select private.apply_movement(tests.id('biz_a2'), tests.id('x_chain'), 'value_correction', 0, 10);
update public.products set stock_value = 5 where id = tests.id('x_zero');                        -- 0 / 5
update public.products set stock_value = -5 where id = tests.id('x_negv');                       -- 5 / -5
update public.products set stock_value = 100 where id = tests.id('x_unk');                       -- unknown cost, 5 / 100
insert into tests.ids select 'x_avg_mv', id from (
  select gen_random_uuid() as id) g;
insert into public.stock_movements (id, business_id, product_id, type, qty_change, value)
values (tests.id('x_avg_mv'), tests.id('biz_a2'), tests.id('x_avg'), 'value_correction', 0, 10);
insert into public.product_cost_history (business_id, product_id, effective_at, stock_qty_after, stock_value_after, avg_cost, cause, movement_id)
values (tests.id('biz_a2'), tests.id('x_avg'), now() + interval '1 hour', 5, 510, 101.9999, 'set_cost', tests.id('x_avg_mv'));
update public.products set stock_value = 510 where id = tests.id('x_avg');                       -- consistent except the average (102.0000)

select is(tests.hit(tests.id('biz_a2'), tests.id('x_qty'), 'qty_mismatch'), '{"expected":"5","actual":"6"}'::jsonb,
  'TC-INV-121b (check 1): stock 6 against movements 5 is qty_mismatch, expected 5, actual 6');
select is(tests.hit(tests.id('biz_a2'), tests.id('x_val'), 'value_mismatch'), '{"expected":"500","actual":"507"}'::jsonb,
  'TC-INV-121c (check 2): value 507 against movements 500 is value_mismatch');
select is(tests.hit(tests.id('biz_a2'), tests.id('x_last'), 'history_latest_mismatch'), '{"expected":"5 / 500","actual":"9 / 900"}'::jsonb,
  'TC-INV-121d (check 3): the latest history row (9 / 900) differs from the product (5 / 500)');
select is(tests.hit(tests.id('biz_a2'), tests.id('x_link'), 'history_link_mismatch'), '{"expected":"0, 0","actual":"1, 0"}'::jsonb,
  'TC-INV-121e (check 4): one movement without a history row');
select ok(tests.hit(tests.id('biz_a2'), tests.id('x_last'), 'history_link_mismatch') = '{"expected":"0, 0","actual":"0, 1"}'::jsonb,
  'TC-INV-121e2 (check 4): one history row without a movement');
select is(tests.hit(tests.id('biz_a2'), tests.id('x_chain'), 'history_chain_mismatch'), '{"expected":"5 / 510","actual":"7 / 510"}'::jsonb,
  'TC-INV-121f (check 5): the first history row that disagrees with the running sums (expected 5 / 510, recorded 7 / 510)');
select is(tests.hit(tests.id('biz_a2'), tests.id('x_zero'), 'zero_stock_value'), '{"expected":"0","actual":"5"}'::jsonb,
  'TC-INV-121g (check 6): value 5 at 0 stock');
select is(tests.hit(tests.id('biz_a2'), tests.id('x_negv'), 'negative_value'), '{"expected":">= 0","actual":"-5"}'::jsonb,
  'TC-INV-121h (check 7): value -5 with positive stock');
select is(tests.hit(tests.id('biz_a2'), tests.id('x_unk'), 'unknown_cost_value'), '{"expected":"0, 0","actual":"100, 0"}'::jsonb,
  'TC-INV-121i (check 8): value 100 for a product whose cost is unknown');
select is(tests.codes(tests.id('biz_a2'), tests.id('x_avg')), '{average_mismatch}'::text[],
  'TC-INV-121j (check 9): a recorded average of 101.9999 where 510 / 5 = 102.0000 is reported, and nothing else');
select is(tests.hit(tests.id('biz_a2'), tests.id('x_avg'), 'average_mismatch'), '{"expected":"102.0000","actual":"101.9999"}'::jsonb,
  'TC-INV-121j2 (check 9): expected and actual of the average');

-- wrapper: product filter, limit, truncation, ordering, validation
set local role authenticated;
insert into tests.results select 'w_all', tests.chk(tests.id('biz_a2'));
insert into tests.results select 'w_one', tests.chk(tests.id('biz_a2'), tests.id('x_avg'));
insert into tests.results select 'w_lim', tests.chk(tests.id('biz_a2'), null, 2);
select throws_ok($q$select tests.chk(tests.id('biz_a2'), gen_random_uuid())$q$, 'P0002', 'product_not_found', 'TC-INV-121m: an unknown product is refused');
select throws_ok($q$select tests.chk(tests.id('biz_a2'), tests.id('milo'))$q$, 'P0002', 'product_not_found', 'TC-INV-121m2: another shop''s product is refused');
select throws_ok($q$select tests.chk(tests.id('biz_a2'), null, 0)$q$, '22023', 'invalid_limit', 'TC-INV-121m3: a limit of 0 is refused');
select throws_ok($q$select tests.chk(tests.id('biz_a2'), null, 1001)$q$, '22023', 'invalid_limit', 'TC-INV-121m4: a limit over 1000 is refused');
select throws_ok($q$select tests.chk(tests.id('biz_a2'), null, null)$q$, '22023', 'invalid_limit', 'TC-INV-121m5: a missing limit is refused');
reset role;
select ok(tests.r('w_all') @> '{"ok":false,"truncated":false}'
          and (tests.r('w_all') ->> 'discrepancy_count')::int = (select count(*) from private.stock_integrity(tests.id('biz_a2')))
          and jsonb_array_length(tests.r('w_all') -> 'discrepancies') = (tests.r('w_all') ->> 'discrepancy_count')::int,
  'TC-INV-121m6: the wrapper reports every discrepancy of the shop');
select ok(tests.r('w_one') @> '{"ok":false,"discrepancy_count":1,"products_checked":1,"movements_checked":2}'
          and tests.r('w_one') -> 'discrepancies' -> 0 @> jsonb_build_object('product_id', tests.id('x_avg'), 'check', 'average_mismatch'),
  'TC-INV-121m7: the product filter limits the check to one product');
select ok(tests.r('w_lim') @> '{"truncated":true}' and jsonb_array_length(tests.r('w_lim') -> 'discrepancies') = 2
          and tests.r('w_lim') ->> 'discrepancy_count' = tests.r('w_all') ->> 'discrepancy_count'
          and tests.r('w_lim') -> 'discrepancies' = (select jsonb_agg(e order by n) from jsonb_array_elements(tests.r('w_all') -> 'discrepancies') with ordinality x(e, n) where n <= 2),
  'TC-INV-121m8: a limit of 2 returns the first 2 in the same order, flags truncation and keeps the full count');
select ok((select bool_and(prev is null or (lower(prev_name), prev_id::text, prev_check) <= (lower(name), id::text, chk))
           from (select e ->> 'product_name' as name, (e ->> 'product_id')::uuid as id, e ->> 'check' as chk,
                        lag(e ->> 'product_name') over (order by n) as prev_name, lag((e ->> 'product_id')::uuid) over (order by n) as prev_id,
                        lag(e ->> 'check') over (order by n) as prev_check, lag(n) over (order by n) as prev
                 from jsonb_array_elements(tests.r('w_all') -> 'discrepancies') with ordinality x(e, n)) z),
  'TC-INV-121m9: discrepancies are ordered by product name, product ID and check code');

-- isolation of the wrapper
select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select throws_ok($q$select tests.chk(tests.id('biz_a2'))$q$, '42501', 'not_a_member', 'TC-INV-121n: owner B cannot check shop A2');
insert into tests.results select 'b_chk', tests.chk(tests.id('biz_b'));
select throws_ok($q$select tests.chk(tests.id('biz_b'), tests.id('x_qty'))$q$, 'P0002', 'product_not_found',
  'TC-INV-121n2: owner B cannot check shop A2''s product through their own shop');
reset role;
select ok(tests.r('b_chk') @> '{"ok":true,"discrepancy_count":0}', 'TC-INV-121n3: shop A2''s corruptions never appear in shop B''s result');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_ok($q$select tests.chk(tests.id('biz_a'))$q$, '42501', 'not_authenticated', 'TC-INV-121n4: no signed-in user is refused');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($q$select public.check_stock_integrity(tests.id('biz_a'))$q$, '42501', null, 'TC-INV-121n5: an anonymous caller is refused');
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');

-- ===========================================================================
-- TC-COST-10: 100 random operations through the functions (and fixture sales / voids): consistent
-- ===========================================================================
do $$
declare i integer; prod uuid; pur uuid; q integer; op double precision; un bigint; dc bigint; prods uuid[] := '{}'; purs uuid[] := '{}';
begin
  perform setseed(0.1010);
  for i in 1..4 loop
    prod := tests.mkp(tests.id('biz_a'), 'Random ' || i, 100 + i * 37, 20);
    prods := prods || prod;
    purs := purs || tests.buy(tests.id('biz_a'), prod, 10, 2000 + i * 111, 0);
  end loop;
  for i in 1..100 loop
    prod := prods[1 + floor(random() * 4)::int];
    pur := purs[1 + floor(random() * 4)::int];
    select stock_qty into q from public.products where id = prod;
    op := random();
    if op < 0.2 then
      perform tests.buy(tests.id('biz_a'), prod, 1 + floor(random() * 8)::int, 100 + floor(random() * 3000)::int, 0);
    elsif op < 0.4 and q > 1 then
      perform private.apply_movement(tests.id('biz_a'), prod, 'sale', -1, -private.round_half_up_ratio(
                (select stock_value from public.products where id = prod), q), p_sale_id => tests.id('sale'));
    elsif op < 0.48 then
      perform private.apply_movement(tests.id('biz_a'), prod, 'void', 1, 50, p_sale_id => tests.id('sale'));
    elsif op < 0.65 and q > 1 then
      perform public.adjust_stock(gen_random_uuid(), tests.id('biz_a'), prod, 'damaged', null, -1);
    elsif op < 0.72 then
      perform public.adjust_stock(gen_random_uuid(), tests.id('biz_a'), prod, 'count_correction', greatest(q, 0) + 2, null);
    elsif op < 0.82 and q > 1 then
      perform public.return_to_supplier(gen_random_uuid(), tests.id('biz_a'), prod, 1, 80, 'refund_momo', 'Random return');
    elsif op < 0.92 then
      if (select product_id from public.purchases where id = pur) = prod then
        dc := 1 + floor(random() * 500)::int;
        perform public.correct_purchase(gen_random_uuid(), tests.id('biz_a'), pur, 'cost', 'Random', p_cost_change => dc);
      end if;
    else
      perform public.set_cost(gen_random_uuid(), tests.id('biz_a'), prod, 150 + floor(random() * 300)::int, 'Random')
      from public.products where id = prod and stock_qty > 0;
    end if;
  end loop;
end $$;
select is((select count(*)::int from private.stock_integrity(tests.id('biz_a'))), 0,
  'TC-COST-10: after 100 random restocks, fixture sales and voids, adjustments, returns, corrections and cost corrections: no discrepancy');

-- ===========================================================================
-- TC-INV-121p: performance with >= 20,000 movements (U5-style measurement)
-- ===========================================================================
do $$
declare i integer; prods uuid[] := '{}'; t1 timestamptz; res jsonb;
begin
  for i in 1..4 loop
    prods := prods || tests.mkp(tests.id('biz_a4'), 'Bulk ' || i, 100, 10);
  end loop;
  for i in 1..20000 loop
    perform private.apply_movement(tests.id('biz_a4'), prods[1 + (i % 4)], 'opening', 1, 100);
  end loop;
end $$;
-- statistics as autovacuum would keep them in production (fresh, unanalysed rows inside this test
-- transaction make the planner choose nested loops: about 66 s instead of about 0.1 s)
analyze public.stock_movements;
analyze public.product_cost_history;
analyze public.products;
create temp table perf (ms numeric, res jsonb);
grant all on perf to authenticated;
set local role authenticated;
do $$ declare t1 timestamptz := clock_timestamp(); r jsonb;
begin
  r := public.check_stock_integrity(tests.id('biz_a4'));
  insert into perf values (round(extract(epoch from clock_timestamp() - t1)::numeric * 1000, 1), r);
end $$;
reset role;
select ok((select res @> '{"ok":true}' and (res ->> 'movements_checked')::int >= 20004 from perf),
  'TC-INV-121p: a shop with more than 20,000 movements is checked in one call and is consistent');
select diag(format('TC-INV-121p measurement: %s movements in %s products checked in %s ms',
  (select res ->> 'movements_checked' from perf), (select res ->> 'products_checked' from perf), (select ms from perf)));

-- ===========================================================================
-- low_stock_products (L1, L2): definition = inventory_summary's, paging, order
-- ===========================================================================
set local role authenticated;
insert into tests.ids select 'l_below', tests.mkp(tests.id('biz_a3'), 'Below level', 100, 2, 5);      -- shortfall 3
insert into tests.ids select 'l_at',    tests.mkp(tests.id('biz_a3'), 'At level', 100, 5, 5);         -- 0
insert into tests.ids select 'l_above', tests.mkp(tests.id('biz_a3'), 'Above level', 100, 6, 5);      -- excluded
insert into tests.ids select 'l_zero',  tests.mkp(tests.id('biz_a3'), 'zero stock', null, 0, 3);      -- 3
insert into tests.ids select 'l_lvl0',  tests.mkp(tests.id('biz_a3'), 'Level zero empty', null, 0, 0);  -- 0
insert into tests.ids select 'l_lvl0b', tests.mkp(tests.id('biz_a3'), 'Level zero one', 100, 1, 0);   -- excluded
insert into tests.ids select 'l_neg',   tests.mkp(tests.id('biz_a3'), 'Negative stock', 100, 1, 2);   -- -3 below: shortfall 5
insert into tests.ids select 'l_arch',  tests.mkp(tests.id('biz_a3'), 'Archived low', 100, 1, 5);
insert into tests.ids select 'l_del',   tests.mkp(tests.id('biz_a3'), 'Deleted low', 100, 1, 5);
insert into tests.ids select 'l_tie',   tests.mkp(tests.id('biz_a3'), 'apple tie', 100, 2, 5);       -- shortfall 3, sorts before "Below"
select public.set_product_archived(gen_random_uuid(), tests.id('biz_a3'), tests.id('l_arch'), true);
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
select private.apply_movement(tests.id('biz_a3'), tests.id('l_neg'), 'adjustment', -4, -400, p_reason => 'other');   -- fixture: 1 -> -3
update public.products set deleted_at = now() where id = tests.id('l_del');
set local role authenticated;
insert into tests.results select 'low_all', public.low_stock_products(tests.id('biz_a3'), 200, 0);
insert into tests.results select 'low_sum', public.inventory_summary(tests.id('biz_a3'));
insert into tests.results select 'low_p0', public.low_stock_products(tests.id('biz_a3'), 2, 0);
insert into tests.results select 'low_p1', public.low_stock_products(tests.id('biz_a3'), 2, 2);
insert into tests.results select 'low_p2', public.low_stock_products(tests.id('biz_a3'), 2, 4);
insert into tests.results select 'low_p3', public.low_stock_products(tests.id('biz_a3'), 2, 6);
insert into tests.results select 'low_def', public.low_stock_products(tests.id('biz_a3'));
insert into tests.results select 'sum_a', public.inventory_summary(tests.id('biz_a'));
insert into tests.results select 'low_a', public.low_stock_products(tests.id('biz_a'), 200, 0);
reset role;
select is((select jsonb_agg(e ->> 'name' order by n) from jsonb_array_elements(tests.r('low_all') -> 'products') with ordinality x(e, n)),
          '["Negative stock", "apple tie", "Below level", "zero stock", "At level", "Level zero empty"]'::jsonb,
  'TC-INV-122a / 122c (04 §2.4, L2): exactly the low products (at or below level; 0, negative and level 0 included; above, archived and deleted excluded), largest shortfall first, then name (case-insensitive)');
select ok((select bool_and((e ->> 'shortfall')::bigint = (e ->> 'low_stock_level')::bigint - (e ->> 'stock_qty')::bigint)
           from jsonb_array_elements(tests.r('low_all') -> 'products') e)
          and (select e ->> 'shortfall' = '5' and e ->> 'stock_qty' = '-3' from jsonb_array_elements(tests.r('low_all') -> 'products') e
               where e ->> 'product_id' = tests.id('l_neg')::text),
  'TC-INV-122a2: shortfall = level - stock (negative stock -3 at level 2: shortfall 5)');
select ok((tests.r('low_all') ->> 'total_count')::int = (tests.r('low_sum') ->> 'low_stock_count')::int
          and (tests.r('low_a') ->> 'total_count')::int = (tests.r('sum_a') ->> 'low_stock_count')::int,
  'TC-INV-122b: total_count equals inventory_summary.low_stock_count (shop A3 with every edge case; shop A)');
select ok((select bool_and((r ->> 'total_count')::int = 6) from tests.results where k in ('low_p0','low_p1','low_p2','low_p3'))
          and (select jsonb_agg(e order by k, n) from tests.results, jsonb_array_elements(r -> 'products') with ordinality x(e, n)
               where k in ('low_p0','low_p1','low_p2')) = tests.r('low_all') -> 'products'
          and tests.r('low_p3') -> 'products' = '[]'::jsonb,
  'TC-INV-122c2: pages of 2 concatenate to the full list with no repeats; a page past the end is empty; totals on every page');
select ok(tests.r('low_def') @> '{"limit":50,"offset":0,"total_count":6}', 'TC-INV-122c3: defaults are 50 from 0');

-- more than 1,000 low-stock products (shop A4 already has 4 bulk products above level)
insert into public.products (business_id, name, selling_price, stock_qty, low_stock_level)
select tests.id('biz_a4'), 'Low ' || g, 100, 0, 5 from generate_series(1, 1005) g;
create temp table perf_low (ms numeric, res jsonb, sum jsonb);
grant all on perf_low to authenticated;
set local role authenticated;
do $$ declare t1 timestamptz := clock_timestamp(); r jsonb;
begin
  r := public.low_stock_products(tests.id('biz_a4'), 200, 1000);
  insert into perf_low values (round(extract(epoch from clock_timestamp() - t1)::numeric * 1000, 1), r, public.inventory_summary(tests.id('biz_a4')));
end $$;
reset role;
select ok((select res @> '{"total_count":1005}' and jsonb_array_length(res -> 'products') = 5
                  and (sum ->> 'low_stock_count')::int = 1005 from perf_low),
  'TC-INV-122d: with 1,005 low products the count is exact, the last page (from 1,000) holds 5, and it equals inventory_summary');
select diag(format('TC-INV-122d measurement: low_stock_products over %s low products (of %s active) in %s ms',
  (select res ->> 'total_count' from perf_low), (select sum ->> 'product_count' from perf_low), (select ms from perf_low)));

set local role authenticated;
select throws_ok($q$select public.low_stock_products(tests.id('biz_a3'), 0, 0)$q$, '22023', 'invalid_limit', 'TC-INV-122e: a page size of 0 is refused');
select throws_ok($q$select public.low_stock_products(tests.id('biz_a3'), 201, 0)$q$, '22023', 'invalid_limit', 'TC-INV-122e2: a page size over 200 is refused');
select throws_ok($q$select public.low_stock_products(tests.id('biz_a3'), null, 0)$q$, '22023', 'invalid_limit', 'TC-INV-122e3: a missing page size is refused');
select throws_ok($q$select public.low_stock_products(tests.id('biz_a3'), 10, -1)$q$, '22023', 'invalid_offset', 'TC-INV-122e4: a negative offset is refused');
select throws_ok($q$select public.low_stock_products(tests.id('biz_a3'), 10, null)$q$, '22023', 'invalid_offset', 'TC-INV-122e5: a missing offset is refused');
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select throws_ok($q$select public.low_stock_products(tests.id('biz_a3'))$q$, '42501', 'not_a_member', 'TC-INV-122e6: owner B cannot list shop A3');
reset role;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_ok($q$select public.low_stock_products(tests.id('biz_a3'))$q$, '42501', 'not_authenticated', 'TC-INV-122e7: no signed-in user is refused');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($q$select public.low_stock_products(tests.id('biz_a3'))$q$, '42501', null, 'TC-INV-122e8: an anonymous caller is refused');
reset role;

select * from finish();
rollback;
