-- Stage 1C, task T4: owner cost correction, "Correct cost price" (04 §2.1; 05 C-27, C-27a, C-29,
-- C-57; 09 §3 set_cost(product, cost, reason)).
--
--   stock_value := stock_qty × new cost. The difference is ONE value_correction movement (quantity 0,
--   through private.apply_movement, so ONE history row with cause set_cost), plus ONE audit entry.
--   Past sales are never touched (C-29). It is an information line ("Stock value corrections",
--   C-57), not profit: no cost adjustment and no Needs attention item are created.
--
-- Owner decisions for T4 (23 Nov 2026):
--   A  stock 0         -> refused (zero_stock): there is no stock to value
--   B  stock below 0   -> refused (negative_stock): record the restock or count first
--   C  same cost       -> "no change": no movement, history row or audit entry
--   D  reason          -> required, trimmed, 1..300 characters (stored in the movement note and the
--                         audit entry; stock_movements.reason is reserved for adjustment codes)
--   E  archived        -> allowed when stock is positive, fully recorded
--   +  first cost 0 for a product whose cost is unknown (value already 0) -> refused
--         (zero_cost_for_unknown_cost). Owner-approved decision (23 Nov 2026): recording it would need a
--         movement with no quantity and no value, which the T1 helpers refuse (empty_movement); the
--         owner can instead enter a cost of 0 when creating the product.
--
-- Security model as for the other Stage 1C write functions: SECURITY DEFINER with explicit checks
-- (signed-in user, active membership, product looked up with the business), the business-scoped
-- idempotency key (private.claim_request), executable by authenticated only.
-- No existing table, constraint, policy, grant or function is changed.

create or replace function public.set_cost(
  p_request_id  uuid,
  p_business_id uuid,
  p_product_id  uuid,
  p_cost        bigint,
  p_reason      text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user      uuid := auth.uid();
  v_prior     jsonb;
  v_reason    text;
  v_product   public.products%rowtype;
  v_new_value numeric;
  v_change    bigint;
  v_old_avg   numeric;
  v_movement  jsonb;
  v_result    jsonb;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_business_id is null or not private.is_member(p_business_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  v_prior := private.claim_request(p_request_id, 'set_cost', p_business_id);
  if v_prior is not null then
    return v_prior;
  end if;

  if p_cost is null or p_cost < 0 or p_cost > private.max_entered_amount() then
    raise exception 'invalid_cost_price' using errcode = '22023';
  end if;
  v_reason := btrim(p_reason);
  if v_reason is null or v_reason = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if char_length(v_reason) > 300 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;

  -- Lock the product (09 §4.2); archived products are allowed (E), deleted ones are not found
  select * into v_product from public.products p
  where p.id = p_product_id and p.business_id = p_business_id and p.deleted_at is null
  for update;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

  if v_product.stock_qty = 0 then
    raise exception 'zero_stock' using errcode = '22023';          -- A
  end if;
  if v_product.stock_qty < 0 then
    raise exception 'negative_stock' using errcode = '22023';      -- B
  end if;

  -- C-27: exact integer arithmetic (at most 2,147,483,647 × 100,000,000, well inside bigint)
  v_new_value := v_product.stock_qty::numeric * p_cost;
  v_change := (v_new_value - v_product.stock_value)::bigint;

  if v_change = 0 then
    if v_product.cost_known then
      v_result := jsonb_build_object('product_id', p_product_id, 'changed', false,
                                     'value_change', 0, 'stock_value', v_product.stock_value);
      return private.complete_request(p_request_id, v_result);      -- C
    end if;
    raise exception 'zero_cost_for_unknown_cost' using errcode = '22023';
  end if;

  v_old_avg := case when v_product.cost_known and v_product.stock_value >= 0
                    then round(v_product.stock_value::numeric / v_product.stock_qty, 4) end;

  v_movement := private.apply_movement(
    p_business_id, p_product_id, 'value_correction', 0, v_change,
    p_unit_cost => p_cost, p_note => v_reason, p_marks_cost_known => true);

  insert into public.audit_log (business_id, user_id, action, entity, entity_id, before, after, reason)
  values (p_business_id, v_user, 'set_cost', 'product', p_product_id,
          jsonb_build_object('stock_qty', v_product.stock_qty, 'stock_value', v_product.stock_value,
                             'average_cost', v_old_avg, 'cost_known', v_product.cost_known),
          jsonb_build_object('stock_qty', v_product.stock_qty, 'stock_value', v_new_value::bigint,
                             'unit_cost', p_cost, 'cost_known', true, 'value_change', v_change,
                             'movement_id', v_movement ->> 'movement_id'),
          v_reason);

  v_result := jsonb_build_object('product_id', p_product_id, 'changed', true, 'value_change', v_change,
                                 'stock_value', v_new_value::bigint, 'movement_id', v_movement ->> 'movement_id');
  return private.complete_request(p_request_id, v_result);
end;
$$;

revoke all on function public.set_cost(uuid, uuid, uuid, bigint, text) from public, anon;
grant execute on function public.set_cost(uuid, uuid, uuid, bigint, text) to authenticated;
