-- ShopMate Ghana: READ-ONLY verification of the cloud database after `supabase db push`.
-- Paste into Supabase Dashboard → SQL Editor and run. It changes nothing.
-- Every row should say PASS. Share the result table (it contains no secrets).
with
expected_tables(name) as (
  values ('businesses'),('profiles'),('business_members'),('devices'),('device_anchors'),('device_time_events'),
         ('categories'),('products'),('product_cost_history'),('stock_movements'),('stock_discrepancies'),
         ('purchases'),('supplier_payments'),('purchase_corrections'),('supplier_returns'),('attention_items'),
         ('sales'),('sale_items'),('customers'),('customer_ledger'),('debt_recoveries'),
         ('expense_categories'),('expenses'),('cash_counts'),('day_closings'),('day_adjustments'),
         ('subscriptions'),('subscription_payments'),('audit_log'),('request_log')),
public_tables as (
  select c.relname::text as name, c.relrowsecurity as rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'),
checks(n, check_name, ok, detail) as (
  select 1, 'Migrations recorded in supabase_migrations (expect 5)',
         (select count(*) from supabase_migrations.schema_migrations) = 5,
         (select string_agg(version, ', ' order by version) from supabase_migrations.schema_migrations)
  union all
  select 2, 'All 30 approved tables exist',
         (select count(*) from expected_tables e join public_tables p using (name)) = 30,
         'found ' || (select count(*) from expected_tables e join public_tables p using (name)) || ' of 30'
  union all
  select 3, 'No unexpected tables in public',
         not exists (select 1 from public_tables p where p.name not in (select name from expected_tables)),
         coalesce((select string_agg(name, ', ') from public_tables p where p.name not in (select name from expected_tables)), 'none')
  union all
  select 4, 'Row Level Security enabled on EVERY public table',
         not exists (select 1 from public_tables where not rls),
         coalesce((select 'RLS OFF: ' || string_agg(name, ', ') from public_tables where not rls), 'all on')
  union all
  select 5, 'Every table except request_log has an RLS policy',
         not exists (select 1 from public_tables p where p.name <> 'request_log'
                     and not exists (select 1 from pg_policies pp where pp.schemaname = 'public' and pp.tablename = p.name)),
         (select count(*) from pg_policies where schemaname = 'public') || ' policies'
  union all
  select 6, 'Anonymous role has NO table privileges',
         not exists (select 1 from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'),
         (select count(*) from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public') || ' grants'
  union all
  select 7, 'Signed-in role has no table-wide write privileges',
         not exists (select 1 from information_schema.role_table_grants
                     where grantee = 'authenticated' and table_schema = 'public' and privilege_type <> 'SELECT'),
         'only SELECT expected'
  union all
  select 8, 'Direct writes only on categories, expense_categories, customers, profiles',
         (select coalesce(array_agg(distinct table_name::text order by table_name::text), '{}')
          from information_schema.column_privileges
          where grantee = 'authenticated' and table_schema = 'public' and privilege_type in ('INSERT','UPDATE'))
           = array['categories','customers','expense_categories','profiles'],
         (select string_agg(distinct table_name::text, ', ') from information_schema.column_privileges
          where grantee = 'authenticated' and table_schema = 'public' and privilege_type in ('INSERT','UPDATE'))
  union all
  select 9, 'Append-only protection on 15 ledger/history/closing tables',
         (select count(distinct event_object_table) from information_schema.triggers
          where trigger_schema = 'public' and trigger_name = 'forbid_update_delete') = 15,
         (select count(distinct event_object_table) from information_schema.triggers
          where trigger_schema = 'public' and trigger_name = 'forbid_update_delete') || ' tables'
  union all
  select 10, 'Server functions callable by signed-in users, not anonymous',
         has_function_privilege('authenticated', 'public.create_business(uuid,text,text,text,text)', 'execute')
         and not has_function_privilege('anon', 'public.create_business(uuid,text,text,text,text)', 'execute')
         and not has_function_privilege('anon', 'public.register_device(uuid,uuid,text)', 'execute'),
         'create_business, register_device'
  union all
  select 11, 'New-user profile trigger installed on auth.users',
         exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'auth' and c.relname = 'users' and t.tgname = 'on_auth_user_created'),
         'on_auth_user_created'
  union all
  select 12, 'No business data yet (fresh project)',
         (select count(*) from public.businesses) = 0,
         (select count(*) from public.businesses) || ' businesses'
)
select n as "#", check_name as "Check", case when ok then 'PASS' else 'FAIL' end as "Result", detail as "Detail"
from checks order by n;
