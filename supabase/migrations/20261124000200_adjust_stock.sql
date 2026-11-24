-- Stage 1C, task T6: stock adjustment, "Adjust stock" (04 §2.3; 05 C-21, C-25a, C-30 – C-32, C-37;
-- 03 S-34; 09 §3 adjust_stock(product, count or change, reason); 06 SY-75; 07 SEC-21).
--
-- One transaction, in this order:
--   1. sign-in, active membership, business-scoped idempotency claim (private.claim_request)
--   2. validation, then the product row lock (09 §4.2: claim -> product)
--   3. the change is worked out from the LOCKED stock (a counted quantity becomes count - stock),
--      so a concurrent change can never make it stale
--   4. direction and stock checks, then the value:
--        stock > 0: round_half_up(|change| × stock_value ÷ stock_qty), so the average is unchanged (C-21)
--        stock found while stock <= 0 (S1): round_half_up(change × the last known average), the
--          latest non-empty product_cost_history.avg_cost (the "last average" of 05 L3); none -> 0
--   5. ONE adjustment movement through T1's apply_movement (one history row; C-25a / C-25b rules)
--   6. if the resulting stock is >= 0, every open stock discrepancy of the product is resolved
--      (resolution adjustment) and linked to this movement (04 §2.3, SY-75)
--   7. one audit entry (SEC-21); the result is stored for replays
-- Any error rolls back everything, including the claim.
--
-- Reasons (schema, S-34) and how they are reported (derived from reason and direction; no new column):
--   damaged, expired, missing   decrease only -> stock loss (C-30)
--   own_use                     decrease only -> own use, below net profit (C-37, decision 39)
--   count_correction            either way; the result must be >= 0 (Q1) -> loss down, stock found up (C-30, C-31)
--   other                       either way; a note is required (S3) -> loss down, stock found up
-- Owner decisions: Q1 (23 Nov 2026) a decrease larger than the available stock is refused, except a
-- count correction to an absolute count >= 0. T6 (24 Nov 2026):
--   S1  stock found while stock <= 0 is valued at the last known average (above); with none, at 0,
--       and an unknown cost stays unknown
--   S2  archived products can be adjusted; missing and deleted products are not found
--   S3  "other": both directions, trimmed non-empty note required
--   S4  a count equal to the current stock returns no_change: no movement, no audit entry, stock
--       unchanged; the result is stored, so retries return the same outcome
--   S5  only stock discrepancies are resolved here; negative-stock and other Needs attention items
--       are created by sales and are resolved in Stage 1D
-- Limits (D6): change at most 100,000 units either way; note at most 300 characters.
-- Security as for the other Stage 1C write functions: SECURITY DEFINER with explicit checks,
-- executable by authenticated only. No existing table, constraint, policy, grant or function is
-- changed.

create or replace function public.adjust_stock(
  p_request_id  uuid,
  p_business_id uuid,
  p_product_id  uuid,
  p_reason      text,
  p_counted_qty integer default null,
  p_qty_change  integer default null,
  p_note        text    default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user       uuid := auth.uid();
  v_prior      jsonb;
  v_note       text;
  v_product    public.products%rowtype;
  v_change     bigint;
  v_avg        numeric;
  v_num        numeric;
  v_mag        numeric;
  v_value      bigint;
  v_kind       text;
  v_movement   jsonb;
  v_movement_id uuid;
  v_resolved   integer := 0;
  v_result     jsonb;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_business_id is null or not private.is_member(p_business_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  v_prior := private.claim_request(p_request_id, 'adjust_stock', p_business_id);
  if v_prior is not null then
    return v_prior;
  end if;

  -- Validation (S-34, D6, S3)
  if p_reason is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if p_reason not in ('damaged', 'expired', 'missing', 'own_use', 'count_correction', 'other') then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  if (p_counted_qty is null) = (p_qty_change is null) then
    raise exception 'count_or_change_required' using errcode = '22023';   -- exactly one of the two
  end if;
  if p_counted_qty is not null and p_counted_qty < 0 then
    raise exception 'invalid_count' using errcode = '22023';
  end if;
  if p_qty_change is not null and (p_qty_change = 0 or abs(p_qty_change::bigint) > private.max_movement_qty()) then
    raise exception 'invalid_qty' using errcode = '22023';
  end if;
  v_note := nullif(btrim(p_note), '');
  if char_length(v_note) > 300 then
    raise exception 'note_too_long' using errcode = '22023';
  end if;
  if p_reason = 'other' and v_note is null then
    raise exception 'note_required' using errcode = '22023';             -- S3
  end if;

  -- Lock the product (09 §4.2); archived products are allowed (S2), deleted ones are not found
  select * into v_product from public.products p
  where p.id = p_product_id and p.business_id = p_business_id and p.deleted_at is null
  for update;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

  -- The change, from the locked stock (bigint: count - stock cannot overflow)
  v_change := coalesce(p_qty_change::bigint, p_counted_qty::bigint - v_product.stock_qty);

  if v_change = 0 then                                                     -- S4
    v_result := jsonb_build_object('product_id', p_product_id, 'outcome', 'no_change', 'changed', false,
                                   'qty_change', 0, 'value_change', 0,
                                   'stock_qty', v_product.stock_qty, 'stock_value', v_product.stock_value);
    return private.complete_request(p_request_id, v_result);
  end if;
  if abs(v_change) > private.max_movement_qty() then
    raise exception 'invalid_qty' using errcode = '22023';                -- D6
  end if;

  -- Direction and available stock (04 §2.3, Q1)
  if v_change > 0 and p_reason in ('damaged', 'expired', 'missing', 'own_use') then
    raise exception 'reason_requires_decrease' using errcode = '22023';
  end if;
  if p_reason = 'count_correction' then
    if v_product.stock_qty + v_change < 0 then
      raise exception 'count_below_zero' using errcode = '22023';
    end if;
  elsif v_change < 0 and v_product.stock_qty + v_change < 0 then
    raise exception 'insufficient_stock' using errcode = '22023';
  end if;

  -- Value (C-21; S1)
  if v_product.stock_qty > 0 then
    -- round_half_up(|change| × stock_value ÷ stock_qty) in exact integer arithmetic (no division
    -- rounding): floor((2·|n·v| + q) ÷ 2q). A positive pool has value >= 0 (C-25b); with an
    -- unknown cost the value is 0, so the adjustment moves no value.
    v_num := abs(v_change)::numeric * v_product.stock_value;
    v_mag := div(2 * abs(v_num) + v_product.stock_qty, 2 * v_product.stock_qty::numeric);
    v_avg := round(v_product.stock_value::numeric / v_product.stock_qty, 4);
  else
    -- S1: the last known average (05 L3) = the latest product_cost_history row that has one.
    -- avg_cost is only recorded when stock > 0, value >= 0 and the cost is known, so a product
    -- whose cost was never known has none and its found stock is valued at 0.
    select h.avg_cost into v_avg from public.product_cost_history h
    where h.product_id = p_product_id and h.business_id = p_business_id and h.avg_cost is not null
    order by h.effective_at desc
    limit 1;
    v_avg := coalesce(v_avg, 0);
    v_num := abs(v_change) * v_avg;                                        -- exact (avg has 4 dp)
    v_mag := sign(v_num) * floor(abs(v_num) + 0.5);
  end if;
  if abs(v_mag) > 9223372036854775807 then
    raise exception 'stock_value_out_of_range' using errcode = '22003';
  end if;
  v_value := sign(v_change)::bigint * sign(v_num)::bigint * abs(v_mag)::bigint;

  v_kind := case when v_change > 0 then 'stock_found'
                 when p_reason = 'own_use' then 'own_use'
                 else 'stock_loss' end;

  v_movement := private.apply_movement(
    p_business_id, p_product_id, 'adjustment', v_change::integer, v_value,
    p_reason => p_reason,
    p_unit_cost => case when v_product.cost_known then v_avg end,
    p_note => v_note);
  v_movement_id := (v_movement ->> 'movement_id')::uuid;

  -- Discrepancies are resolved once stock is back to >= 0 (04 §2.3, SY-75; S5)
  if (v_movement ->> 'stock_qty')::integer >= 0 then
    update public.stock_discrepancies d
    set status = 'resolved', resolution = 'adjustment', resolved_by_movement_id = v_movement_id, resolved_at = now()
    where d.business_id = p_business_id and d.product_id = p_product_id and d.status = 'open';
    get diagnostics v_resolved = row_count;
  end if;

  insert into public.audit_log (business_id, user_id, action, entity, entity_id, before, after, reason)
  values (p_business_id, v_user, 'adjust_stock', 'product', p_product_id,
          jsonb_build_object('stock_qty', v_product.stock_qty, 'stock_value', v_product.stock_value,
                             'cost_known', v_product.cost_known),
          jsonb_build_object('stock_qty', (v_movement ->> 'stock_qty')::integer,
                             'stock_value', (v_movement ->> 'stock_value')::bigint,
                             'reason', p_reason, 'kind', v_kind, 'counted_qty', p_counted_qty,
                             'qty_change', v_change, 'value_change', v_value,
                             'movement_id', v_movement_id, 'pool_adjustment', v_movement -> 'pool_adjustment',
                             'resolved_discrepancies', v_resolved),
          v_note);

  v_result := jsonb_build_object(
    'product_id', p_product_id,
    'outcome', 'adjusted',
    'changed', true,
    'movement_id', v_movement_id,
    'kind', v_kind,
    'qty_change', v_change,
    'value_change', v_value,
    'stock_qty', (v_movement ->> 'stock_qty')::integer,
    'stock_value', (v_movement ->> 'stock_value')::bigint,
    'pool_adjustment', v_movement -> 'pool_adjustment',
    'resolved_discrepancies', v_resolved);
  return private.complete_request(p_request_id, v_result);
end;
$$;

revoke all on function public.adjust_stock(uuid, uuid, uuid, text, integer, integer, text) from public, anon;
grant execute on function public.adjust_stock(uuid, uuid, uuid, text, integer, integer, text) to authenticated;
