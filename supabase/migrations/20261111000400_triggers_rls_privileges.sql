-- Triggers, Row Level Security and privileges (SEC-10, SEC-11, SEC-20, SEC-23, SEC-27)

-- ===========================================================================
-- 1. Generic triggers
-- ===========================================================================
do $$
declare
  t text;
begin
  -- updated_at maintenance on every table that has the column
  for t in
    select c.table_name from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'updated_at'
  loop
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function private.set_updated_at()', t);
  end loop;

  -- business_id can never change on mutable business tables
  for t in
    select c.table_name from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'business_id'
      and exists (select 1 from information_schema.columns u
                  where u.table_schema = 'public' and u.table_name = c.table_name
                    and u.column_name = 'updated_at')
  loop
    execute format('create trigger forbid_business_change before update on public.%I
                    for each row execute function private.forbid_business_change()', t);
  end loop;

  -- append-only tables: no UPDATE or DELETE for anyone (TRUNCATE revoked below)
  foreach t in array array[
    'device_anchors','device_time_events','product_cost_history','stock_movements',
    'purchases','supplier_payments','purchase_corrections','supplier_returns',
    'customer_ledger','debt_recoveries','cash_counts','day_closings','day_adjustments',
    'subscription_payments','audit_log']
  loop
    execute format('create trigger forbid_update_delete before update or delete on public.%I
                    for each row execute function private.forbid_update_delete()', t);
  end loop;
end;
$$;

create trigger request_log_guard before update or delete on public.request_log
  for each row execute function private.request_log_guard();

-- A customer can only be archived when nothing is owed (04 §3.1)
create or replace function private.customer_archive_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance bigint;
begin
  if (new.active = false and old.active = true)
     or (new.deleted_at is not null and old.deleted_at is null) then
    select coalesce(sum(l.amount), 0) into v_balance
    from public.customer_ledger l
    where l.customer_id = new.id;
    if v_balance <> 0 then
      raise exception 'customer_has_balance: % pesewas still owed', v_balance
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.customer_archive_guard() from public;

create trigger customer_archive_guard before update on public.customers
  for each row execute function private.customer_archive_guard();

-- ===========================================================================
-- 2. Row Level Security: enabled on EVERY table in public (SEC-10)
-- ===========================================================================
do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- Members can read their own business's rows, on every table that has business_id
-- (except request_log, which is not readable through the API at all).
do $$
declare
  t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join pg_tables p on p.schemaname = 'public' and p.tablename = c.table_name
    where c.table_schema = 'public' and c.column_name = 'business_id'
      and c.table_name not in ('request_log', 'business_members')
  loop
    execute format('create policy members_read on public.%I for select to authenticated
                    using (private.is_member(business_id))', t);
  end loop;
end;
$$;

create policy members_read on public.businesses for select to authenticated
  using (private.is_member(id));

create policy members_read on public.business_members for select to authenticated
  using (user_id = (select auth.uid()) or private.is_member(business_id));

create policy own_profile_read on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy own_profile_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- The only tables owners may write directly (simple reference data, no money or stock).
-- Everything else changes only through server functions (SEC-11).
create policy members_insert on public.categories for insert to authenticated
  with check (private.is_member(business_id));
create policy members_update on public.categories for update to authenticated
  using (private.is_member(business_id)) with check (private.is_member(business_id));

create policy members_insert on public.expense_categories for insert to authenticated
  with check (private.is_member(business_id));
create policy members_update on public.expense_categories for update to authenticated
  using (private.is_member(business_id)) with check (private.is_member(business_id));

create policy members_insert on public.customers for insert to authenticated
  with check (private.is_member(business_id));
create policy members_update on public.customers for update to authenticated
  using (private.is_member(business_id)) with check (private.is_member(business_id));

-- ===========================================================================
-- 3. Privileges (defence in depth, on top of RLS)
-- ===========================================================================
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke truncate, references, trigger on all tables in schema public from service_role;

grant select on all tables in schema public to authenticated;
revoke select on public.request_log from authenticated;

grant insert (business_id, name), update (name, deleted_at) on public.categories to authenticated;
grant insert (business_id, name), update (name, deleted_at) on public.expense_categories to authenticated;
grant insert (business_id, name, phone, credit_limit, note),
      update (name, phone, credit_limit, note, active, deleted_at)
  on public.customers to authenticated;
grant update (full_name) on public.profiles to authenticated;

-- Future tables and functions get no automatic access for anon/authenticated.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
