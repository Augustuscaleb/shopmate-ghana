-- Stage 1C-2 increment 2 review (owner approval, 25 Nov 2026, LOCAL preparation only; not applied
-- to any cloud project, D11): optimistic concurrency for public.update_product.
--
-- Problem: update_product sets all five editable fields (name, selling price, category, unit,
-- low-stock level) on every call, so a client holding an older copy of the product could overwrite
-- another user's newer change to a field it never meant to edit.
--
-- Change: one new trailing parameter, p_expected jsonb DEFAULT NULL: the five fields exactly as the
-- caller last read them, e.g.
--   {"name": "Milo sachet", "selling_price": 150, "category_id": null, "unit": "sachet", "low_stock_level": 5}
-- After the product row is locked FOR UPDATE (same transaction as the update), they are compared
-- with the current row; any difference is refused with `product_changed` (P0001) and nothing is
-- written (no update, no audit entry; the request ID is not consumed).
--
-- Callers that omit p_expected (or pass null) are REFUSED with `expected_values_required` (22023):
-- there is no unconditional-overwrite path. The parameter keeps a default only so that the
-- argument list stays compatible and such callers get this clear refusal rather than a
-- "function not found" error. No deployed client calls update_product yet (the Stage 1C migrations
-- are not in the cloud, and the only app caller is the uncommitted increment 2 code).
-- A malformed p_expected (not an object, a missing key, a wrong type) is refused with
-- `invalid_expected_values` (22023).
--
-- Unchanged: authorisation (signed-in member of the business), the idempotency key (a repeated
-- request returns the original result before any comparison, so a retry after a lost reply still
-- succeeds), field validation and its error codes, the category and duplicate-name checks, the lock
-- order (product, then category), the audit log entry, and the response {product_id, changed}.
-- The comparison runs after the product lookup so product_not_found and validation errors keep
-- their precedence.
--
-- The argument list changes, so the old function is dropped and recreated (CREATE OR REPLACE
-- would add an overload). Privileges are re-applied exactly as before: authenticated only.
-- No table, constraint, index, policy or other function is changed.

drop function public.update_product(uuid, uuid, uuid, text, bigint, uuid, text, integer);

create or replace function public.update_product(
  p_request_id      uuid,
  p_business_id     uuid,
  p_product_id      uuid,
  p_name            text,
  p_selling_price   bigint,
  p_category_id     uuid,
  p_unit            text,
  p_low_stock_level integer,
  p_expected        jsonb default null)
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
  v_key    text;
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

  -- Optimistic concurrency (increment 2 review): the caller states the five editable fields as it
  -- last read them. They are compared with the row locked above, in this transaction, so another
  -- change can't land between the check and the update. Omitting them is refused (no unconditional
  -- overwrite). Checked after the product lookup and field validation, so existing error codes keep
  -- their order; an idempotent replay never reaches here (claim_request returned above).
  if p_expected is null then
    raise exception 'expected_values_required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_expected) <> 'object' then
    raise exception 'invalid_expected_values' using errcode = '22023';
  end if;
  foreach v_key in array array['name', 'selling_price', 'category_id', 'unit', 'low_stock_level'] loop
    if not (p_expected ? v_key) then
      raise exception 'invalid_expected_values' using errcode = '22023';
    end if;
  end loop;
  if jsonb_typeof(p_expected -> 'name') <> 'string'
     or jsonb_typeof(p_expected -> 'selling_price') <> 'number'
     or jsonb_typeof(p_expected -> 'low_stock_level') <> 'number'
     or jsonb_typeof(p_expected -> 'category_id') not in ('string', 'null')
     or jsonb_typeof(p_expected -> 'unit') not in ('string', 'null') then
    raise exception 'invalid_expected_values' using errcode = '22023';
  end if;
  if (p_expected ->> 'name') is distinct from v_old.name
     or (p_expected ->> 'selling_price')::numeric is distinct from v_old.selling_price::numeric
     or (p_expected ->> 'low_stock_level')::numeric is distinct from v_old.low_stock_level::numeric
     or (p_expected ->> 'category_id') is distinct from v_old.category_id::text
     or (p_expected ->> 'unit') is distinct from v_old.unit then
    raise exception 'product_changed' using errcode = 'P0001',
      hint = 'The product was changed after it was read. Read it again and resubmit.';
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
revoke all on function public.update_product(uuid, uuid, uuid, text, bigint, uuid, text, integer, jsonb) from public, anon;
grant execute on function public.update_product(uuid, uuid, uuid, text, bigint, uuid, text, integer, jsonb) to authenticated;
