-- Stage 1C, task T2: exact inventory counts for the Today dashboard (S-10; decision D7).
-- The dashboard previously fetched product rows and counted them on the phone, which the API's
-- 1,000-row limit (max_rows) would silently cap. This function counts inside PostgreSQL and
-- returns only the two numbers. max_rows is NOT changed.
--
-- Definitions (04 §2.1, §2.4; F-07; D4):
--   product_count    active products of the business: active = true and deleted_at is null
--   low_stock_count  those active products with stock_qty <= low_stock_level
--                    (includes zero and negative stock)
--
-- Security model:
--   * SECURITY INVOKER: runs with the caller's own rights, so the existing Row Level Security
--     policy on products (members_read: private.is_member(business_id)) still applies.
--   * It also checks membership explicitly first and REFUSES non-members (42501 not_a_member)
--     instead of returning zeros, so a wrong or foreign business ID can never look like an
--     empty shop. Unknown and foreign IDs get the same refusal (nothing reveals which exist).
--   * STABLE: read-only; PostgreSQL rejects any write inside it.
--   * Executable by signed-in users (authenticated) only; not by anon or PUBLIC.
-- No existing table, constraint, policy or grant is changed.

create or replace function public.inventory_summary(p_business_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_products bigint;
  v_low      bigint;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_business_id is null or not private.is_member(p_business_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  -- Uses products_active_idx (T1): (business_id) where active and deleted_at is null
  select count(*),
         count(*) filter (where p.stock_qty <= p.low_stock_level)
    into v_products, v_low
  from public.products p
  where p.business_id = p_business_id
    and p.active
    and p.deleted_at is null;

  return jsonb_build_object('product_count', v_products, 'low_stock_count', v_low);
end;
$$;

revoke all on function public.inventory_summary(uuid) from public, anon;
grant execute on function public.inventory_summary(uuid) to authenticated;
