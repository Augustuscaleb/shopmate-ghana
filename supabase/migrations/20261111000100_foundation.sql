-- ShopMate Ghana — Stage 1 foundation
-- Spec: docs/product-specification/09-data-model.md (revision 5.1)
--
-- Conventions (09 §1):
--   * money = BIGINT pesewas; average-cost snapshots = NUMERIC(18,4) pesewas
--   * quantities = INTEGER
--   * every business table carries business_id; RLS on every table
--   * enumerated values are TEXT + CHECK constraints (easier to evolve than enums)
--   * security-definer helpers live in schema "private" (not exposed by the API)

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Generic trigger functions
-- ---------------------------------------------------------------------------

-- Keeps updated_at current on mutable tables.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Append-only tables (ledgers, history, closings, audit): no UPDATE or DELETE,
-- for any role, including server functions (SEC-20, SEC-27).
create or replace function private.forbid_update_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'append_only: % on % is not allowed', tg_op, tg_table_name
    using errcode = 'P0001';
end;
$$;

-- A row may never be moved to another business.
create or replace function private.forbid_business_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.business_id is distinct from old.business_id then
    raise exception 'business_id cannot be changed on %', tg_table_name
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- request_log is append-only except that the result of an in-progress claim
-- may be filled in exactly once (null -> value), and a missing business_id
-- may be set once (create_business). See 09 §4.3.
create or replace function private.request_log_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'append_only: DELETE on request_log is not allowed' using errcode = 'P0001';
  end if;
  if old.result is not null
     or new.request_id is distinct from old.request_id
     or (old.business_id is not null and new.business_id is distinct from old.business_id)
     or new.user_id is distinct from old.user_id
     or new.function_name is distinct from old.function_name then
    raise exception 'append_only: request_log rows can only have their result set once'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sequences used by server functions
-- ---------------------------------------------------------------------------
create sequence if not exists private.business_reference_seq start 1;
