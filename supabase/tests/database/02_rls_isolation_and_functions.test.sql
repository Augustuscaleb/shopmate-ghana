-- Stage 1 database tests: business-data isolation (RLS), privileges as real roles,
-- and the Stage 1 server functions (create_business, register_device).
-- Users are simulated exactly as the Supabase API does: role "authenticated" plus JWT claims.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- ---------------------------------------------------------------------------
-- Helpers (created inside this transaction; rolled back at the end)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to authenticated, anon;

create table tests.ids (k text primary key, v uuid not null);
grant select, insert on tests.ids to authenticated;

create function tests.id(p_k text) returns uuid language sql stable as $$ select v from tests.ids where k = p_k $$;
grant execute on function tests.id(text) to authenticated;

-- Tables (with business_id) where the CURRENT user can see rows of p_business.
create function tests.tables_with_rows_of(p_business uuid) returns setof text
language plpgsql security invoker set search_path = '' as $$
declare t text; n bigint;
begin
  for t in
    select c.relname::text
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attname = 'business_id' and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r'
      and pg_catalog.has_table_privilege(c.oid, 'select')
  loop
    execute format('select count(*) from public.%I where business_id = $1', t) into n using p_business;
    if n > 0 then return next t; end if;
  end loop;
  if exists (select 1 from public.businesses where id = p_business) then return next 'businesses'; end if;
end $$;
grant execute on function tests.tables_with_rows_of(uuid) to authenticated;

-- Fictitious users
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner.a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner.b@example.test');

-- ===========================================================================
-- TC-FN-01 .. 03  create_business (as owner A, then owner B)
-- ===========================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

insert into tests.ids
select 'biz_a', (public.create_business('11111111-1111-1111-1111-111111111111', 'Ama Test Provisions', 'provision', 'Accra', '0240000001') ->> 'business_id')::uuid;

select is(
  public.create_business('11111111-1111-1111-1111-111111111111', 'Ama Test Provisions', 'provision', 'Accra', '0240000001') ->> 'business_id',
  tests.id('biz_a')::text,
  'TC-FN-01: repeating create_business with the same request ID returns the original result'
);
select is((select count(*) from public.businesses)::int, 1,
  'TC-FN-02: the repeated request did not create a second business');
select ok(
  (select count(*) from public.expense_categories where business_id = tests.id('biz_a')) = 10
  and (select plan from public.subscriptions where business_id = tests.id('biz_a')) = 'pilot'
  and not exists (select 1 from public.expense_categories where lower(name) like '%stock purchase%'),
  'TC-FN-03: new business gets pilot plan and default expense categories (no stock-purchase category)'
);

-- Devices for A
insert into tests.ids select 'dev_a1', (public.register_device('22222222-2222-2222-2222-222222222221', tests.id('biz_a'), 'Phone') ->> 'device_id')::uuid;
select is(public.register_device('22222222-2222-2222-2222-222222222222', tests.id('biz_a'), 'Tablet') ->> 'device_code', 'B',
  'TC-FN-04: the second device of a business gets code B (first got A)');
select is(public.register_device('22222222-2222-2222-2222-222222222221', tests.id('biz_a'), 'Phone') ->> 'device_code', 'A',
  'TC-FN-05: repeating register_device with the same request ID returns the original code');
select is((select count(*) from public.devices)::int, 2, 'TC-FN-06: no extra device was created by the repeat');

reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;

insert into tests.ids
select 'biz_b', (public.create_business('33333333-3333-3333-3333-333333333333', 'Kwame Test Boutique', 'boutique') ->> 'business_id')::uuid;

select throws_ok($$ select public.create_business('11111111-1111-1111-1111-111111111111', 'Copy', 'other') $$,
  '22023', null, 'TC-FN-07: another user cannot reuse a request ID to read someone else''s result');
select throws_ok(format($$ select public.register_device(gen_random_uuid(), %L, 'Intruder') $$, tests.id('biz_a')),
  '42501', null, 'TC-FN-08: a user cannot register a device on another business');
select throws_ok($$ select private.claim_request(gen_random_uuid(), 'x', null) $$,
  '42501', null, 'TC-FN-09: internal helper functions cannot be called directly');

reset role;

-- ---------------------------------------------------------------------------
-- Fixture rows in EVERY business table, for both businesses (fictitious data)
-- ---------------------------------------------------------------------------
create function tests.seed(p_business uuid, p_user uuid, p_receipt text) returns void
language plpgsql as $$
declare
  v_dev uuid; v_anchor uuid; v_cat uuid; v_prod uuid; v_cust uuid; v_sale uuid := gen_random_uuid();
  v_mov uuid; v_pur uuid; v_close uuid; v_ecat uuid;
begin
  select id into v_dev from public.devices where business_id = p_business limit 1;
  if v_dev is null then
    insert into public.devices (business_id, user_id, device_code) values (p_business, p_user, 'A') returning id into v_dev;
  end if;
  insert into public.device_anchors (business_id, device_id, elapsed_ms, boot_id, wall_clock, clock_offset_ms)
    values (p_business, v_dev, 1000, 'boot-1', now(), 0) returning id into v_anchor;
  insert into public.device_time_events (business_id, device_id, type, detected_at) values (p_business, v_dev, 'reboot_detected', now());
  insert into public.categories (business_id, name) values (p_business, 'Beverages') returning id into v_cat;
  insert into public.products (business_id, name, category_id, selling_price, stock_qty, stock_value, cost_known)
    values (p_business, 'Test item', v_cat, 500, 10, 4000, true) returning id into v_prod;
  insert into public.customers (business_id, name) values (p_business, 'Test customer') returning id into v_cust;
  insert into public.sales (id, business_id, device_id, receipt_no, subtotal, total, payment_method, customer_id, mode,
                            occurred_at_device, occurred_at, time_confidence, cost_basis, payload_version, anchor_id)
    values (v_sale, p_business, v_dev, p_receipt, 500, 500, 'credit', v_cust, 'offline', now(), now(), 'high', 'occurred_at', 1, v_anchor);
  insert into public.sale_items (business_id, sale_id, product_id, qty, unit_price, line_total, unit_cost, line_cost)
    values (p_business, v_sale, v_prod, 1, 500, 500, 400, 400);
  insert into public.stock_movements (business_id, product_id, type, qty_change, value, sale_id)
    values (p_business, v_prod, 'sale', -1, -400, v_sale) returning id into v_mov;
  insert into public.product_cost_history (business_id, product_id, stock_qty_after, stock_value_after, avg_cost, cause, movement_id)
    values (p_business, v_prod, 9, 3600, 400, 'sale', v_mov);
  insert into public.customer_ledger (business_id, customer_id, type, amount, sale_id) values (p_business, v_cust, 'credit_sale', 500, v_sale);
  insert into public.debt_recoveries (business_id, customer_id, amount, method) values (p_business, v_cust, 100, 'cash');
  insert into public.purchases (business_id, product_id, qty, purchase_cost, paid_now, paid_now_from, purchased_on)
    values (p_business, v_prod, 10, 50000, 30000, 'cash_drawer', current_date) returning id into v_pur;
  insert into public.supplier_payments (business_id, purchase_id, amount, paid_from, paid_on) values (p_business, v_pur, 10000, 'momo', current_date);
  insert into public.purchase_corrections (business_id, purchase_id, type, qty_change, reason) values (p_business, v_pur, 'quantity', -1, 'counted 9');
  insert into public.supplier_returns (business_id, product_id, qty, value_removed, credit_amount, credit_type, reason)
    values (p_business, v_prod, 1, 400, 400, 'refund_cash', 'expired');
  insert into public.stock_discrepancies (business_id, product_id, sale_id, shortfall_qty) values (p_business, v_prod, v_sale, 1);
  insert into public.attention_items (business_id, type, entity, message_data) values (p_business, 'negative_stock', 'product', '{}');
  select id into v_ecat from public.expense_categories where business_id = p_business limit 1;
  insert into public.expenses (business_id, category_id, amount, paid_from, expense_date) values (p_business, v_ecat, 1500, 'cash_drawer', current_date);
  insert into public.cash_counts (business_id, count_date, opening_cash, expected_cash, counted_cash, difference)
    values (p_business, current_date, 20000, 20000, 20000, 0);
  insert into public.day_closings (business_id, day, figures) values (p_business, current_date, '{}') returning id into v_close;
  insert into public.day_adjustments (business_id, closing_id, type, figure_changes, occurred_at) values (p_business, v_close, 'late_sale', '{}', now());
  insert into public.subscription_payments (business_id, amount, momo_transaction_id, confirmed_by, paid_at)
    values (p_business, 3000, 'TEST-' || p_receipt || '-' || p_business, 'admin', now());
end $$;

select tests.seed(tests.id('biz_a'), '00000000-0000-0000-0000-0000000000a1', 'A-000001');
select tests.seed(tests.id('biz_b'), '00000000-0000-0000-0000-0000000000b1', 'A-000001');

-- Sanity: as the database owner, every business table has rows for business B
select set_eq(
  $$ select tables_with_rows_of from tests.tables_with_rows_of(tests.id('biz_b')) where tables_with_rows_of <> 'businesses' $$,
  $$ select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
     join pg_attribute a on a.attrelid = c.oid and a.attname = 'business_id'
     where n.nspname = 'public' and c.relkind = 'r' $$,
  'TC-SEC-00: fixtures cover every business table (so the isolation tests are meaningful)'
);

-- ===========================================================================
-- TC-SEC-01  Isolation: what owner A can read
-- ===========================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

select is_empty(
  $$ select * from tests.tables_with_rows_of(tests.id('biz_b')) $$,
  'TC-SEC-01a: owner A cannot read a single row of business B, in any table'
);
select set_eq(
  $$ select * from tests.tables_with_rows_of(tests.id('biz_a')) $$,
  $$ select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
     join pg_attribute a on a.attrelid = c.oid and a.attname = 'business_id'
     where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'request_log'
     union select 'businesses' $$,
  'TC-SEC-01b: owner A can read their own rows in every business table (except request_log)'
);
select is((select count(*) from public.profiles)::int, 1, 'TC-SEC-01c: owner A sees only their own profile');
select is((select count(*) from public.business_members)::int, 1, 'TC-SEC-01d: owner A sees only their own membership');

-- ===========================================================================
-- TC-SEC-01 / TC-SEC-03  Writes as owner A
-- ===========================================================================
select throws_ok(format($$ insert into public.categories (business_id, name) values (%L, 'Hack') $$, tests.id('biz_b')),
  '42501', null, 'TC-SEC-01e: A cannot add a category to business B');
select throws_ok(format($$ insert into public.customers (business_id, name) values (%L, 'Hack') $$, tests.id('biz_b')),
  '42501', null, 'TC-SEC-01f: A cannot add a customer to business B');
select is_empty(
  format($$ with u as (update public.customers set name = 'Changed' where business_id = %L returning 1) select * from u $$, tests.id('biz_b')),
  'TC-SEC-01g: A cannot change business B customers (no rows affected)'
);
select is_empty(
  format($$ with u as (update public.categories set name = 'Changed' where business_id = %L returning 1) select * from u $$, tests.id('biz_b')),
  'TC-SEC-01h: A cannot change business B categories (no rows affected)'
);
select throws_ok($$ delete from public.customers $$, '42501', null,
  'TC-SEC-01i: customers cannot be deleted through the API (archive instead)');

select lives_ok(format($$ insert into public.categories (business_id, name) values (%L, 'Toiletries') $$, tests.id('biz_a')),
  'TC-SEC-01j: A can add a category to their own business');
select lives_ok(format($$ insert into public.customers (business_id, name, phone) values (%L, 'Akosua Test', '0201234567') $$, tests.id('biz_a')),
  'TC-SEC-01k: A can add a customer to their own business');

select throws_ok(format($$ insert into public.sales (id, business_id, device_id, receipt_no, subtotal, total, payment_method, mode,
                          occurred_at_device, occurred_at, time_confidence, cost_basis, payload_version)
                          values (gen_random_uuid(), %L, %L, 'A-000099', 100, 100, 'cash', 'online', now(), now(), 'high', 'occurred_at', 1) $$,
                         tests.id('biz_a'), tests.id('dev_a1')),
  '42501', null, 'TC-SEC-03a: sales cannot be written directly, even for your own business (server functions only)');
select throws_ok(format($$ update public.products set stock_qty = 1000 where business_id = %L $$, tests.id('biz_a')),
  '42501', null, 'TC-SEC-03b: stock cannot be changed directly');
select throws_ok(format($$ insert into public.customer_ledger (business_id, customer_id, type, amount, method)
                          select %L, id, 'repayment', -100, 'cash' from public.customers where business_id = %L limit 1 $$,
                         tests.id('biz_a'), tests.id('biz_a')),
  '42501', null, 'TC-SEC-03c: customer balances cannot be changed directly');
select throws_ok(format($$ update public.subscriptions set plan = 'plus', status = 'active' where business_id = %L $$, tests.id('biz_a')),
  '42501', null, 'TC-SEC-03d: an owner cannot change their own subscription (admin only, SEC-16)');
select throws_ok($$ update public.customers set business_id = gen_random_uuid() $$,
  '42501', null, 'TC-SEC-03e: business_id of a customer cannot be changed through the API');
select throws_ok($$ select * from public.request_log $$,
  '42501', null, 'TC-SEC-03f: the idempotency log is not readable through the API');

-- ===========================================================================
-- TC-SEC-01  Isolation: owner B, symmetric check
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
select is_empty(
  $$ select * from tests.tables_with_rows_of(tests.id('biz_a')) $$,
  'TC-SEC-01l: owner B cannot read a single row of business A, in any table'
);

-- ===========================================================================
-- Anonymous (not signed in)
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$ select * from public.businesses $$, '42501', null, 'TC-SEC-04a: anonymous users cannot read businesses');
select throws_ok($$ select * from public.customers $$, '42501', null, 'TC-SEC-04b: anonymous users cannot read customers');
select throws_ok($$ select public.create_business(gen_random_uuid(), 'X', 'other') $$, '42501', null,
  'TC-SEC-04c: anonymous users cannot create a business');

reset role;
select * from finish();
rollback;
