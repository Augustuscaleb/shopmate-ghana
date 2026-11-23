-- Stage 1C, task T3: product and category management (04 §2.1; 09 §3; C-21, C-24).
--
--   public.create_product        new product; optional category, unit, low-stock level, and
--                                opening stock (one `opening` movement, valued at the cost price)
--   public.update_product        name, category, unit, selling price, low-stock level
--                                (never stock, value or cost: those change only through movements
--                                and the later set_cost / restock / adjust_stock functions)
--   public.set_product_archived  archive (active = false) or restore; never deletes (D4)
--   categories                   still written directly by the app under RLS (members_insert /
--                                members_update); a trigger refuses archiving a category while an
--                                active product uses it (D5)
--
-- Security model (the same as create_business and register_device): the app has no write
-- privilege on products, so these functions are SECURITY DEFINER and enforce access themselves:
-- signed-in user (auth.uid()), active membership of the given business (private.is_member), and
-- every product or category looked up WITH that business_id, so another shop's rows are never
-- found. Each call takes an idempotency key (private.claim_request): a repeated request returns
-- the original result and writes nothing twice. All three are executable by authenticated only.
--
-- Rules applied (owner decisions D4–D6, Stage 1C plan §6a):
--   * selling price 1 … 100,000,000 pesewas (GH₵ 0.01 … GH₵ 1,000,000); cost price 0 … the same cap
--   * opening stock 0 … 100,000; low-stock level 0 … 100,000; unit at most 30 characters
--   * names trimmed; unique per shop ignoring letter case and surrounding spaces among
--     non-deleted products (the existing products_name_uq index). Archived products keep their
--     name reserved (D4). Products are never hard-deleted.
--   * a cost price needs opening stock: with no stock there is nothing to value (C-21), and the
--     first restock sets the average. (Refused rather than silently dropped.)
-- No existing table, constraint, policy or grant is changed.

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
create or replace function private.validate_product_fields(
  p_name text, p_selling_price bigint, p_unit text, p_low_stock_level integer)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'name_required' using errcode = '22023';
  end if;
  if char_length(btrim(p_name)) > 100 then
    raise exception 'name_too_long' using errcode = '22023';
  end if;
  if p_selling_price is null or p_selling_price < 1 or p_selling_price > private.max_entered_amount() then
    raise exception 'invalid_selling_price' using errcode = '22023';
  end if;
  if p_unit is not null and char_length(btrim(p_unit)) > 30 then
    raise exception 'unit_too_long' using errcode = '22023';
  end if;
  if p_low_stock_level is null or p_low_stock_level < 0 or p_low_stock_level > 100000 then   -- D6
    raise exception 'invalid_low_stock_level' using errcode = '22023';
  end if;
end;
$$;

-- A category the product may be put in: it must belong to this business (otherwise it is
-- "not found", whether it exists elsewhere or not) and must not be archived. The row is locked
-- FOR SHARE until the transaction ends, so it cannot be archived concurrently while a product is
-- being put in it (the archive guard below then sees the product).
create or replace function private.usable_category(p_business_id uuid, p_category_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_deleted_at timestamptz;
begin
  if p_category_id is null then
    return;
  end if;
  select c.deleted_at into v_deleted_at
  from public.categories c
  where c.id = p_category_id and c.business_id = p_business_id
  for share;
  if not found then
    raise exception 'category_not_found' using errcode = 'P0002';
  end if;
  if v_deleted_at is not null then
    raise exception 'category_archived' using errcode = '22023';
  end if;
end;
$$;

-- D5: a category cannot be archived while an active (non-deleted) product uses it.
-- SECURITY DEFINER so the check sees every product of the category, like customer_archive_guard.
create or replace function private.category_archive_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null
     and exists (select 1 from public.products p
                 where p.category_id = new.id and p.business_id = new.business_id
                   and p.active and p.deleted_at is null) then
    raise exception 'category_in_use' using errcode = 'P0001',
      detail = 'Move or archive the products in this category first.';
  end if;
  return new;
end;
$$;

create trigger category_archive_guard before update on public.categories
  for each row execute function private.category_archive_guard();

-- ---------------------------------------------------------------------------
-- create_product
-- ---------------------------------------------------------------------------
create or replace function public.create_product(
  p_request_id      uuid,
  p_business_id     uuid,
  p_name            text,
  p_selling_price   bigint,
  p_category_id     uuid    default null,
  p_unit            text    default null,
  p_cost_price      bigint  default null,
  p_opening_stock   integer default 0,
  p_low_stock_level integer default 5)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user       uuid := auth.uid();
  v_prior      jsonb;
  v_name       text;
  v_unit       text;
  v_product_id uuid;
  v_movement   jsonb;
  v_result     jsonb;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_business_id is null or not private.is_member(p_business_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  v_prior := private.claim_request(p_request_id, 'create_product', p_business_id);
  if v_prior is not null then
    return v_prior;
  end if;

  perform private.validate_product_fields(p_name, p_selling_price, p_unit, p_low_stock_level);
  if p_cost_price is not null and (p_cost_price < 0 or p_cost_price > private.max_entered_amount()) then
    raise exception 'invalid_cost_price' using errcode = '22023';
  end if;
  if p_opening_stock is null or p_opening_stock < 0 or p_opening_stock > private.max_movement_qty() then
    raise exception 'invalid_opening_stock' using errcode = '22023';
  end if;
  if p_cost_price is not null and p_opening_stock = 0 then
    raise exception 'cost_price_needs_opening_stock' using errcode = '22023';
  end if;
  perform private.usable_category(p_business_id, p_category_id);

  v_name := btrim(p_name);
  v_unit := nullif(btrim(p_unit), '');

  if exists (select 1 from public.products p
             where p.business_id = p_business_id and p.deleted_at is null
               and lower(btrim(p.name)) = lower(v_name)) then
    raise exception 'duplicate_product_name' using errcode = '23505';
  end if;

  begin
    insert into public.products (business_id, name, category_id, unit, selling_price, low_stock_level)
    values (p_business_id, v_name, p_category_id, v_unit, p_selling_price, p_low_stock_level)
    returning id into v_product_id;
  exception when unique_violation then
    -- a concurrent request created the same name between the check and the insert
    raise exception 'duplicate_product_name' using errcode = '23505';
  end;

  if p_opening_stock > 0 then
    -- C-21: opening stock adds qty and qty × entered cost; without a cost the value is 0 and
    -- the cost stays unknown (C-24). At most 100,000 × GH₵ 1,000,000 = 10^13 pesewas.
    v_movement := private.apply_movement(
      p_business_id, v_product_id, 'opening', p_opening_stock,
      coalesce(p_opening_stock::bigint * p_cost_price, 0),
      p_unit_cost => p_cost_price,
      p_marks_cost_known => p_cost_price is not null);
  end if;

  insert into public.audit_log (business_id, user_id, action, entity, entity_id, after)
  values (p_business_id, v_user, 'create_product', 'product', v_product_id,
          jsonb_build_object('name', v_name, 'selling_price', p_selling_price, 'category_id', p_category_id,
                             'unit', v_unit, 'low_stock_level', p_low_stock_level,
                             'opening_stock', p_opening_stock, 'cost_price', p_cost_price));

  v_result := jsonb_build_object('product_id', v_product_id, 'movement_id', v_movement ->> 'movement_id');
  return private.complete_request(p_request_id, v_result);
end;
$$;

-- ---------------------------------------------------------------------------
-- update_product: the editable fields, given in full (the form sends all of them; null clears
-- category or unit). Stock, value and cost are never changed here.
-- ---------------------------------------------------------------------------
create or replace function public.update_product(
  p_request_id      uuid,
  p_business_id     uuid,
  p_product_id      uuid,
  p_name            text,
  p_selling_price   bigint,
  p_category_id     uuid,
  p_unit            text,
  p_low_stock_level integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := auth.uid();
  v_prior  jsonb;
  v_old    public.products%rowtype;
  v_name   text;
  v_unit   text;
  v_before jsonb := '{}'::jsonb;
  v_after  jsonb := '{}'::jsonb;
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_business_id is null or not private.is_member(p_business_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  v_prior := private.claim_request(p_request_id, 'update_product', p_business_id);
  if v_prior is not null then
    return v_prior;
  end if;

  perform private.validate_product_fields(p_name, p_selling_price, p_unit, p_low_stock_level);

  -- Lock order (09 §4.2): the product first, then its category
  select * into v_old from public.products p
  where p.id = p_product_id and p.business_id = p_business_id and p.deleted_at is null
  for update;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

  if p_category_id is distinct from v_old.category_id then
    perform private.usable_category(p_business_id, p_category_id);
  end if;

  v_name := btrim(p_name);
  v_unit := nullif(btrim(p_unit), '');

  if exists (select 1 from public.products p
             where p.business_id = p_business_id and p.deleted_at is null and p.id <> p_product_id
               and lower(btrim(p.name)) = lower(v_name)) then
    raise exception 'duplicate_product_name' using errcode = '23505';
  end if;

  -- Only the fields that change are recorded (04 §2.1: price changes audit-logged old -> new)
  if v_name is distinct from v_old.name then
    v_before := v_before || jsonb_build_object('name', v_old.name);
    v_after  := v_after  || jsonb_build_object('name', v_name);
  end if;
  if p_selling_price is distinct from v_old.selling_price then
    v_before := v_before || jsonb_build_object('selling_price', v_old.selling_price);
    v_after  := v_after  || jsonb_build_object('selling_price', p_selling_price);
  end if;
  if p_category_id is distinct from v_old.category_id then
    v_before := v_before || jsonb_build_object('category_id', v_old.category_id);
    v_after  := v_after  || jsonb_build_object('category_id', p_category_id);
  end if;
  if v_unit is distinct from v_old.unit then
    v_before := v_before || jsonb_build_object('unit', v_old.unit);
    v_after  := v_after  || jsonb_build_object('unit', v_unit);
  end if;
  if p_low_stock_level is distinct from v_old.low_stock_level then
    v_before := v_before || jsonb_build_object('low_stock_level', v_old.low_stock_level);
    v_after  := v_after  || jsonb_build_object('low_stock_level', p_low_stock_level);
  end if;

  if v_after = '{}'::jsonb then
    v_result := jsonb_build_object('product_id', p_product_id, 'changed', false);
    return private.complete_request(p_request_id, v_result);
  end if;

  begin
    update public.products
    set name = v_name, selling_price = p_selling_price, category_id = p_category_id,
        unit = v_unit, low_stock_level = p_low_stock_level
    where id = p_product_id;
  exception when unique_violation then
    raise exception 'duplicate_product_name' using errcode = '23505';
  end;

  insert into public.audit_log (business_id, user_id, action, entity, entity_id, before, after)
  values (p_business_id, v_user, 'update_product', 'product', p_product_id, v_before, v_after);

  v_result := jsonb_build_object('product_id', p_product_id, 'changed', true);
  return private.complete_request(p_request_id, v_result);
end;
$$;

-- ---------------------------------------------------------------------------
-- set_product_archived: archive (true) or restore (false). The row, its stock, value, movements
-- and history are all kept; the name stays reserved (D4). Restoring into an archived category is
-- refused, so D5 (no active product in an archived category) always holds.
-- ---------------------------------------------------------------------------
create or replace function public.set_product_archived(
  p_request_id  uuid,
  p_business_id uuid,
  p_product_id  uuid,
  p_archived    boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_prior   jsonb;
  v_product public.products%rowtype;
  v_result  jsonb;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_business_id is null or not private.is_member(p_business_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  v_prior := private.claim_request(p_request_id, 'set_product_archived', p_business_id);
  if v_prior is not null then
    return v_prior;
  end if;

  if p_archived is null then
    raise exception 'archived_flag_required' using errcode = '22023';
  end if;

  select * into v_product from public.products p
  where p.id = p_product_id and p.business_id = p_business_id and p.deleted_at is null
  for update;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

  if v_product.active = not p_archived then
    v_result := jsonb_build_object('product_id', p_product_id, 'active', v_product.active, 'changed', false);
    return private.complete_request(p_request_id, v_result);
  end if;

  if not p_archived then
    perform private.usable_category(p_business_id, v_product.category_id);
  end if;

  update public.products set active = not p_archived where id = p_product_id;

  insert into public.audit_log (business_id, user_id, action, entity, entity_id, before, after)
  values (p_business_id, v_user, case when p_archived then 'archive_product' else 'restore_product' end,
          'product', p_product_id,
          jsonb_build_object('active', v_product.active), jsonb_build_object('active', not p_archived));

  v_result := jsonb_build_object('product_id', p_product_id, 'active', not p_archived, 'changed', true);
  return private.complete_request(p_request_id, v_result);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function private.validate_product_fields(text, bigint, text, integer) from public, anon, authenticated;
revoke all on function private.usable_category(uuid, uuid) from public, anon, authenticated;
revoke all on function private.category_archive_guard() from public, anon, authenticated;

revoke all on function public.create_product(uuid, uuid, text, bigint, uuid, text, bigint, integer, integer) from public, anon;
revoke all on function public.update_product(uuid, uuid, uuid, text, bigint, uuid, text, integer) from public, anon;
revoke all on function public.set_product_archived(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.create_product(uuid, uuid, text, bigint, uuid, text, bigint, integer, integer) to authenticated;
grant execute on function public.update_product(uuid, uuid, uuid, text, bigint, uuid, text, integer) to authenticated;
grant execute on function public.set_product_archived(uuid, uuid, uuid, boolean) to authenticated;
