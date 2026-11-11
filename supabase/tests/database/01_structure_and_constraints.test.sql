-- Stage 1 database tests: structure, privileges and constraints.
-- Test IDs refer to docs/product-specification/10-test-plan.md (§0a, Stage 1 foundation tests).
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

-- ===========================================================================
-- TC-DB-01  All approved tables exist (09 §2)
-- ===========================================================================
select set_eq(
  $$ select tablename::text from pg_tables where schemaname = 'public' $$,
  array['businesses','profiles','business_members','devices','device_anchors','device_time_events',
        'categories','products','product_cost_history','stock_movements','stock_discrepancies',
        'purchases','supplier_payments','purchase_corrections','supplier_returns','attention_items',
        'sales','sale_items','customers','customer_ledger','debt_recoveries',
        'expense_categories','expenses','cash_counts','day_closings','day_adjustments',
        'subscriptions','subscription_payments','audit_log','request_log'],
  'TC-DB-01: exactly the 30 approved tables exist in public'
);

-- ===========================================================================
-- TC-DB-02 .. 07  Security structure (SEC-10, SEC-11, SEC-15)
-- ===========================================================================
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity $$,
  'TC-DB-02: Row Level Security is enabled on every public table'
);

select is_empty(
  $$ select table_name, privilege_type from information_schema.role_table_grants
     where grantee = 'anon' and table_schema = 'public' $$,
  'TC-DB-03: anon has no table privileges at all'
);

select is_empty(
  $$ select table_name, privilege_type from information_schema.role_table_grants
     where grantee = 'authenticated' and table_schema = 'public' and privilege_type <> 'SELECT' $$,
  'TC-DB-04: authenticated has no table-wide INSERT/UPDATE/DELETE/TRUNCATE on any table'
);

select set_eq(
  $$ select distinct table_name::text from information_schema.column_privileges
     where grantee = 'authenticated' and table_schema = 'public' and privilege_type in ('INSERT','UPDATE') $$,
  array['categories','expense_categories','customers','profiles'],
  'TC-DB-05: direct writes allowed only on categories, expense categories, customers, own profile'
);

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'request_log'
       and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) $$,
  'TC-DB-06: every table except request_log has at least one RLS policy'
);

select ok(
  not has_function_privilege('anon', 'public.create_business(uuid,text,text,text,text)', 'execute')
  and not has_function_privilege('anon', 'public.register_device(uuid,uuid,text)', 'execute')
  and has_function_privilege('authenticated', 'public.create_business(uuid,text,text,text,text)', 'execute'),
  'TC-DB-07: server functions are callable by signed-in users only, never anon'
);

select set_eq(
  $$ select event_object_table::text from information_schema.triggers
     where trigger_schema = 'public' and trigger_name = 'forbid_update_delete' and event_manipulation = 'UPDATE' $$,
  array['device_anchors','device_time_events','product_cost_history','stock_movements',
        'purchases','supplier_payments','purchase_corrections','supplier_returns',
        'customer_ledger','debt_recoveries','cash_counts','day_closings','day_adjustments',
        'subscription_payments','audit_log'],
  'TC-DB-08: append-only protection exists on every ledger, history, closing and audit table'
);

-- ===========================================================================
-- Fixtures (fictitious data only): two businesses, as the database owner
-- ===========================================================================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner.a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'owner.b@example.test');

insert into public.businesses (id, name, type, reference_code) values
  ('a0000000-0000-0000-0000-000000000001', 'Test Shop A', 'provision', 'SM-9001'),
  ('b0000000-0000-0000-0000-000000000001', 'Test Shop B', 'boutique',  'SM-9002');

insert into public.devices (id, business_id, user_id, device_code) values
  ('a0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'A'),
  ('b0000000-0000-0000-0000-0000000000d1', 'b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'A');

insert into public.products (id, business_id, name, selling_price) values
  ('a0000000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-000000000001', 'Milo sachet', 500);

insert into public.customers (id, business_id, name) values
  ('a0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-000000000001', 'Kofi Test'),
  ('a0000000-0000-0000-0000-0000000000c2', 'a0000000-0000-0000-0000-000000000001', 'Esi Test');

-- a valid sale used by later tests
insert into public.sales (id, business_id, device_id, receipt_no, subtotal, discount, total, payment_method,
                          customer_id, mode, occurred_at_device, occurred_at, time_confidence, cost_basis, payload_version)
values ('a0000000-0000-0000-0000-0000000000e1', 'a0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-0000000000d1', 'A-000001', 8500, 0, 8500, 'credit',
        'a0000000-0000-0000-0000-0000000000c1', 'online', now(), now(), 'high', 'occurred_at', 1);

-- Sale template for constraint tests: only the listed fields vary
create function pg_temp.sale_sql(p_id text, p_receipt text, p_business text, p_device text,
                                 p_subtotal int, p_discount int, p_total int, p_method text,
                                 p_customer text default null, p_conf text default 'high', p_basis text default 'occurred_at')
returns text language sql as $f$
  select format($q$insert into public.sales (id, business_id, device_id, receipt_no, subtotal, discount, total,
                   payment_method, customer_id, mode, occurred_at_device, occurred_at, time_confidence, cost_basis, payload_version)
                   values (%L, %L, %L, %L, %s, %s, %s, %L, %L, 'offline', now(), now(), %L, %L, 1)$q$,
                p_id, p_business, p_device, p_receipt, p_subtotal, p_discount, p_total, p_method, p_customer, p_conf, p_basis);
$f$;

-- ===========================================================================
-- TC-DB-10 .. 19  Sales and receipts (09 §4.4, 05 §2)
-- ===========================================================================
select throws_ok(pg_temp.sale_sql('a0000000-0000-0000-0000-0000000000e1', 'A-000002', 'a0000000-0000-0000-0000-000000000001',
                 'a0000000-0000-0000-0000-0000000000d1', 100, 0, 100, 'cash'),
  '23505', null, 'TC-DB-10: a sale ID can only be recorded once (duplicate prevention)');

select throws_ok(pg_temp.sale_sql(gen_random_uuid()::text, 'A-000001', 'a0000000-0000-0000-0000-000000000001',
                 'a0000000-0000-0000-0000-0000000000d1', 100, 0, 100, 'cash'),
  '23505', null, 'TC-DB-11: a receipt number is unique within a business');

select lives_ok(pg_temp.sale_sql(gen_random_uuid()::text, 'A-000001', 'b0000000-0000-0000-0000-000000000001',
                 'b0000000-0000-0000-0000-0000000000d1', 100, 0, 100, 'cash'),
  'TC-DB-12: the same receipt number may exist in a different business');

select throws_ok(pg_temp.sale_sql(gen_random_uuid()::text, 'A-000003', 'a0000000-0000-0000-0000-000000000001',
                 'a0000000-0000-0000-0000-0000000000d1', 100, 200, 0, 'cash'),
  '23514', null, 'TC-DB-13: discount cannot exceed subtotal');

select throws_ok(pg_temp.sale_sql(gen_random_uuid()::text, 'A-000004', 'a0000000-0000-0000-0000-000000000001',
                 'a0000000-0000-0000-0000-0000000000d1', 1000, 100, 950, 'cash'),
  '23514', null, 'TC-DB-14: total must equal subtotal minus discount');

select throws_ok(pg_temp.sale_sql(gen_random_uuid()::text, 'A-000005', 'a0000000-0000-0000-0000-000000000001',
                 'a0000000-0000-0000-0000-0000000000d1', 100, 0, 100, 'credit'),
  '23514', null, 'TC-DB-15: a credit sale must name a customer');

select throws_ok(pg_temp.sale_sql(gen_random_uuid()::text, 'A-000006', 'a0000000-0000-0000-0000-000000000001',
                 'b0000000-0000-0000-0000-0000000000d1', 100, 0, 100, 'cash'),
  '23503', null, 'TC-DB-16: a sale cannot reference a device from another business');

select throws_ok(pg_temp.sale_sql(gen_random_uuid()::text, 'A-000007', 'a0000000-0000-0000-0000-000000000001',
                 'a0000000-0000-0000-0000-0000000000d1', 100, 0, 100, 'cash', null, 'low', 'occurred_at'),
  '23514', null, 'TC-DB-17: a low-confidence sale must be costed at upload time (05 C-96)');

select throws_ok($$ insert into public.sale_items (business_id, sale_id, product_id, qty, unit_price, line_total, unit_cost, line_cost)
                   values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000e1',
                           'a0000000-0000-0000-0000-0000000000f1', 2, 500, 999, 400, 800) $$,
  '23514', null, 'TC-DB-18: line total must equal quantity × unit price');

select throws_ok($$ insert into public.devices (business_id, user_id, device_code)
                   values ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'A') $$,
  '23505', null, 'TC-DB-19: device codes are unique within a business');

-- ===========================================================================
-- TC-DB-20 .. 29  Credit, purchases, stock (05 §7, §12, C-21)
-- ===========================================================================
select throws_ok($$ insert into public.customer_ledger (business_id, customer_id, type, amount, method)
                   values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000c1', 'repayment', 500, 'cash') $$,
  '23514', null, 'TC-DB-20: a repayment must reduce the balance (negative amount)');

select throws_ok($$ insert into public.customer_ledger (business_id, customer_id, type, amount)
                   values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000c1', 'write_off', -500) $$,
  '23514', null, 'TC-DB-21: a write-off requires a reason');

select throws_ok($$ insert into public.customer_ledger (business_id, customer_id, type, amount, reason)
                   values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000c1', 'write_off_undo', 500, 'mistake') $$,
  '23514', null, 'TC-DB-22: an undo must reference the write-off it undoes');

select throws_ok($$ insert into public.purchases (business_id, product_id, qty, purchase_cost, paid_now, paid_now_from, purchased_on)
                   values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000f1', 10, 50000, 60000, 'cash_drawer', current_date) $$,
  '23514', null, 'TC-DB-23: amount paid now cannot exceed the purchase cost');

insert into public.purchases (id, business_id, product_id, qty, purchase_cost, paid_now, paid_now_from, purchased_on)
values ('a0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-0000000000f1', 10, 50000, 30000, 'cash_drawer', current_date);

select throws_ok($$ insert into public.purchase_corrections (business_id, purchase_id, type, cost_change, reason, allocation, allocation_exact)
                   values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000b1', 'cost', 2000,
                           'invoice was GH₵520', '{"remaining": 2000}', false) $$,
  '23514', null, 'TC-DB-24: an approximate cost correction must state why it is approximate (owner condition)');

select lives_ok($$ insert into public.purchase_corrections (business_id, purchase_id, type, cost_change, reason, allocation, allocation_exact, approximation_reasons)
                  values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000b1', 'cost', 2000,
                          'invoice was GH₵520', '{"remaining": 2000}', false, array['late_upload']) $$,
  'TC-DB-25: a flagged approximate correction with reasons is accepted');

select throws_ok($$ insert into public.purchase_corrections (business_id, purchase_id, type, cost_change, reason)
                   values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000b1', 'cost', 2000, 'x') $$,
  '23514', null, 'TC-DB-26: a cost correction must record its allocation');

select throws_ok($$ insert into public.stock_movements (business_id, product_id, type, qty_change, value)
                   values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000f1', 'adjustment', -1, -400) $$,
  '23514', null, 'TC-DB-27: a stock adjustment requires a reason');

select throws_ok($$ insert into public.stock_movements (business_id, product_id, type, qty_change, value, reason)
                   values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000f1', 'cost_adjustment', 1, 100, 'zero_stock_residue') $$,
  '23514', null, 'TC-DB-28: a cost adjustment never changes quantity (05 §3.4)');

select throws_ok($$ insert into public.products (business_id, name, selling_price)
                   values ('a0000000-0000-0000-0000-000000000001', '  MILO SACHET ', 600) $$,
  '23505', null, 'TC-DB-29: product names are unique per business, ignoring case and spaces');

-- ===========================================================================
-- TC-DB-30 .. 34  Closing, cash, subscription uniqueness
-- ===========================================================================
insert into public.day_closings (id, business_id, day, figures)
values ('a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-000000000001', '2026-11-12', '{"sales": 124050}');

select throws_ok($$ insert into public.day_closings (business_id, day, figures)
                   values ('a0000000-0000-0000-0000-000000000001', '2026-11-12', '{"sales": 1}') $$,
  '23505', null, 'TC-DB-30: only one original closing per business per day (05 C-100)');

insert into public.cash_counts (business_id, count_date, opening_cash, expected_cash, counted_cash, difference)
values ('a0000000-0000-0000-0000-000000000001', '2026-11-12', 20000, 22700, 22700, 0);

select throws_ok($$ insert into public.cash_counts (business_id, count_date, opening_cash, expected_cash, counted_cash, difference)
                   values ('a0000000-0000-0000-0000-000000000001', '2026-11-12', 20000, 22700, 24900, 2200) $$,
  '23505', null, 'TC-DB-31: the original cash count cannot be replaced (recounts are adjustments)');

select throws_ok($$ insert into public.cash_counts (business_id, count_date, opening_cash, expected_cash, counted_cash, difference)
                   values ('a0000000-0000-0000-0000-000000000001', '2026-11-13', 20000, 22700, 22000, 0) $$,
  '23514', null, 'TC-DB-32: cash difference must equal counted minus expected');

insert into public.subscription_payments (business_id, amount, momo_transaction_id, confirmed_by, paid_at)
values ('a0000000-0000-0000-0000-000000000001', 3000, 'MOMO-TEST-0001', 'admin', now());

select throws_ok($$ insert into public.subscription_payments (business_id, amount, momo_transaction_id, confirmed_by, paid_at)
                   values ('b0000000-0000-0000-0000-000000000001', 3000, 'MOMO-TEST-0001', 'admin', now()) $$,
  '23505', null, 'TC-DB-33: a MoMo transaction ID can only be recorded once');

select throws_ok($$ insert into public.customers (business_id, name, phone)
                   values ('a0000000-0000-0000-0000-000000000001', 'Bad Phone', '12345') $$,
  '23514', null, 'TC-DB-34: phone numbers must be Ghanaian format (0XXXXXXXXX or +233XXXXXXXXX)');

-- ===========================================================================
-- TC-DB-40 .. 49  Append-only and immutability (SEC-20, SEC-27)
-- ===========================================================================
insert into public.stock_movements (id, business_id, product_id, type, qty_change, value, reason)
values ('a0000000-0000-0000-0000-0000000000f2', 'a0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-0000000000f1', 'adjustment', -1, -400, 'damaged');
insert into public.customer_ledger (id, business_id, customer_id, type, amount, sale_id)
values ('a0000000-0000-0000-0000-0000000000e2', 'a0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-0000000000c1', 'credit_sale', 8500, 'a0000000-0000-0000-0000-0000000000e1');
insert into public.day_adjustments (business_id, closing_id, type, figure_changes, occurred_at)
values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a1', 'late_sale', '{"sales": 2200}', now());
insert into public.audit_log (business_id, action, entity) values ('a0000000-0000-0000-0000-000000000001', 'test', 'test');

select throws_ok($$ update public.stock_movements set value = 0 where id = 'a0000000-0000-0000-0000-0000000000f2' $$,
  'P0001', null, 'TC-DB-40: stock movements cannot be edited');
select throws_ok($$ delete from public.stock_movements where id = 'a0000000-0000-0000-0000-0000000000f2' $$,
  'P0001', null, 'TC-DB-41: stock movements cannot be deleted');
select throws_ok($$ update public.customer_ledger set amount = 1 where id = 'a0000000-0000-0000-0000-0000000000e2' $$,
  'P0001', null, 'TC-DB-42: customer ledger entries cannot be edited');
select throws_ok($$ update public.day_closings set figures = '{"sales": 0}' where id = 'a0000000-0000-0000-0000-0000000000a1' $$,
  'P0001', null, 'TC-DB-43: an original day closing cannot be edited (05 C-100)');
select throws_ok($$ delete from public.day_closings where id = 'a0000000-0000-0000-0000-0000000000a1' $$,
  'P0001', null, 'TC-DB-44: an original day closing cannot be deleted');
select throws_ok($$ delete from public.day_adjustments $$,
  'P0001', null, 'TC-DB-45: day adjustments cannot be deleted');
select throws_ok($$ update public.audit_log set action = 'changed' $$,
  'P0001', null, 'TC-DB-46: the audit log cannot be edited');
select throws_ok($$ update public.purchases set purchase_cost = 1 where id = 'a0000000-0000-0000-0000-0000000000b1' $$,
  'P0001', null, 'TC-DB-47: purchases are never edited (corrections are separate records, 05 C-116)');
select throws_ok($$ update public.customers set business_id = 'b0000000-0000-0000-0000-000000000001'
                   where id = 'a0000000-0000-0000-0000-0000000000c2' $$,
  'P0001', null, 'TC-DB-48: a row can never be moved to another business');

-- ===========================================================================
-- TC-DB-50 .. 53  Customer archive rule, request log
-- ===========================================================================
select throws_ok($$ update public.customers set active = false where id = 'a0000000-0000-0000-0000-0000000000c1' $$,
  'P0001', null, 'TC-DB-50: a customer who still owes money cannot be archived (04 §3.1)');
select lives_ok($$ update public.customers set active = false where id = 'a0000000-0000-0000-0000-0000000000c2' $$,
  'TC-DB-51: a customer with a zero balance can be archived');

insert into public.request_log (request_id, user_id, function_name)
values ('a0000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', 'test');
select lives_ok($$ update public.request_log set result = '{"ok": true}' where request_id = 'a0000000-0000-0000-0000-0000000000a2' $$,
  'TC-DB-52: a request result can be stored once');
select throws_ok($$ update public.request_log set result = '{"ok": false}' where request_id = 'a0000000-0000-0000-0000-0000000000a2' $$,
  'P0001', null, 'TC-DB-53: a stored request result can never be changed');

select * from finish();
rollback;
