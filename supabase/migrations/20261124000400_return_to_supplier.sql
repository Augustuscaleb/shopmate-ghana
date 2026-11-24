-- Stage 1C, task T8: Return to supplier (04 §2.2; 05 C-21, C-25c, C-117, C-122, §3.2; 03 S-39;
-- 09 §3 return_to_supplier(product, qty, credit_amount, credit_type, purchase?, reason), §4.2).
-- Plan and accounting reconciliation: docs/stages/STAGE-1C-T8-RETURN-TO-SUPPLIER-PLAN.md.
--
-- Symbols: Q, S = stock quantity and value before; q = units returned;
--   V = value_removed = round_half_up(q × S ÷ Q)   (the average; exact integer arithmetic)
--   C = credit_amount (refund received, or reduction of a chosen purchase's unpaid amount)
--   D = C − V (the supplier-return difference); cost impact = V − C = −D
--     negative D: cost up, profit down;  positive D: cost down, profit up.
--
-- One transaction, in this order:
--   1. sign-in, active membership, business-scoped idempotency claim (private.claim_request)
--   2. validation, then locks in the approved order (09 §4.2): product, then (reduce_unpaid only)
--      the purchase row
--   3. ONE supplier_return movement through T1's apply_movement: − q, − V. This is the ONLY change
--      to stock value. D never changes stock value: no cost_adjustment (or any other) movement is
--      written for it (R1). It is recorded on the supplier_returns row (credit_amount − value_removed)
--   4. a Needs attention item (cost_adjustment, C-25c/C-122) when abs(D) >= 10 pesewas (R8); it only
--      inserts into attention_items
--   5. one audit entry; the result is stored for replays
-- Any error rolls back everything, including the claim.
--
-- Owner decisions (24 Nov 2026): R1 Model 1 (above); R2 more than the available stock is refused
-- (insufficient_stock); R3 a reduce_unpaid credit above the purchase's outstanding balance is refused
-- (credit_exceeds_unpaid); R4 a supplied purchase must be of the same shop and product (optional for
-- refunds); R5 no per-purchase quantity limit; R6 archived products allowed; R7 zero credit allowed;
-- R8 attention when abs(D) >= 10 pesewas; Q1 unknown cost (cost_known = false) is refused
-- (set_cost_first); O1 a known cost with stock value 0 is allowed and valued at V = 0.
-- The amount owed comes ONLY from T7's private.purchase_unpaid, which already subtracts reduce_unpaid
-- credits on that purchase and ignores refunds; it is not changed here.
-- Limits (D6): quantity 1 … 100,000; credit at most GH₵ 1,000,000; reason 1 … 300 characters.
-- Security as for the other Stage 1C write functions: SECURITY DEFINER with explicit checks,
-- executable by authenticated only. No existing table, constraint, policy, grant or function is
-- changed.

create or replace function public.return_to_supplier(
  p_request_id    uuid,
  p_business_id   uuid,
  p_product_id    uuid,
  p_qty           integer,
  p_credit_amount bigint,
  p_credit_type   text,
  p_reason        text,
  p_purchase_id   uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user        uuid := auth.uid();
  v_prior       jsonb;
  v_reason      text;
  v_product     public.products%rowtype;
  v_purchase    public.purchases%rowtype;
  v_unpaid      bigint;
  v_value       bigint;          -- V
  v_diff        bigint;          -- D = C - V
  v_movement    jsonb;
  v_movement_id uuid;
  v_return_id   uuid;
  v_attention   uuid;
  v_result      jsonb;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_business_id is null or not private.is_member(p_business_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  v_prior := private.claim_request(p_request_id, 'return_to_supplier', p_business_id);
  if v_prior is not null then
    return v_prior;
  end if;

  -- Validation (D6, 09 §3, schema)
  if p_qty is null or p_qty < 1 or p_qty > private.max_movement_qty() then
    raise exception 'invalid_qty' using errcode = '22023';
  end if;
  if p_credit_amount is null or p_credit_amount < 0 or p_credit_amount > private.max_entered_amount() then
    raise exception 'invalid_credit_amount' using errcode = '22023';
  end if;
  if p_credit_type is null or p_credit_type not in ('refund_cash', 'refund_momo', 'reduce_unpaid') then
    raise exception 'invalid_credit_type' using errcode = '22023';
  end if;
  v_reason := nullif(btrim(p_reason), '');
  if v_reason is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if char_length(v_reason) > 300 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;
  if p_credit_type = 'reduce_unpaid' and p_purchase_id is null then
    raise exception 'purchase_required' using errcode = '22023';
  end if;

  -- Lock 1: the product (09 §4.2 step 2); archived allowed (R6), deleted not found
  select * into v_product from public.products p
  where p.id = p_product_id and p.business_id = p_business_id and p.deleted_at is null
  for update;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;
  if not v_product.cost_known then
    raise exception 'set_cost_first' using errcode = '22023';                -- Q1 (a value of 0 with a known cost passes: O1)
  end if;

  -- The purchase (R4). Lock 2 (09 §4.2 step 3a) only when the credit reduces its unpaid amount;
  -- otherwise a plain read is enough: purchases are append-only, so its product cannot change.
  if p_purchase_id is not null then
    if p_credit_type = 'reduce_unpaid' then
      select * into v_purchase from public.purchases pu
      where pu.id = p_purchase_id and pu.business_id = p_business_id
      for update;
    else
      select * into v_purchase from public.purchases pu
      where pu.id = p_purchase_id and pu.business_id = p_business_id;
    end if;
    if not found then
      raise exception 'purchase_not_found' using errcode = 'P0002';
    end if;
    if v_purchase.product_id <> p_product_id then
      raise exception 'purchase_product_mismatch' using errcode = '22023';
    end if;
    v_unpaid := private.purchase_unpaid(p_business_id, p_purchase_id);    -- read under the lock
  end if;

  if v_product.stock_qty <= 0 or p_qty > v_product.stock_qty then
    raise exception 'insufficient_stock' using errcode = '22023';            -- R2
  end if;
  if p_credit_type = 'reduce_unpaid' and p_credit_amount > greatest(v_unpaid, 0) then
    raise exception 'credit_exceeds_unpaid' using errcode = '22023',         -- R3
      detail = json_build_object('unpaid', greatest(v_unpaid, 0))::text;
  end if;

  -- V = round_half_up(q × S ÷ Q), exactly: floor((2·q·S + Q) ÷ 2Q). S >= 0 here (C-25b), so
  -- 0 <= V <= S: the pool never goes negative and returning all stock removes exactly S.
  v_value := div(2 * p_qty::numeric * v_product.stock_value + v_product.stock_qty,
                 2 * v_product.stock_qty::numeric)::bigint;
  v_diff := p_credit_amount - v_value;

  -- The ONLY stock-value change (R1)
  v_movement := private.apply_movement(
    p_business_id, p_product_id, 'supplier_return', -p_qty, -v_value,
    p_unit_cost => round(v_product.stock_value::numeric / v_product.stock_qty, 4),
    p_purchase_id => p_purchase_id,
    p_note => v_reason);
  v_movement_id := (v_movement ->> 'movement_id')::uuid;

  insert into public.supplier_returns
    (business_id, product_id, movement_id, qty, value_removed, credit_amount, credit_type, purchase_id, reason, user_id)
  values
    (p_business_id, p_product_id, v_movement_id, p_qty, v_value, p_credit_amount, p_credit_type, p_purchase_id, v_reason, v_user)
  returning id into v_return_id;

  -- C-25c / C-122: visible, with no stock-value effect (R8)
  if abs(v_diff) >= 10 then
    v_attention := private.raise_attention(p_business_id, 'cost_adjustment', 'supplier_return', v_return_id,
      jsonb_build_object('rule', 'C-25c', 'product_id', p_product_id, 'return_id', v_return_id,
                         'movement_id', v_movement_id, 'qty', p_qty, 'value_removed', v_value,
                         'credit_amount', p_credit_amount, 'credit_type', p_credit_type,
                         'purchase_id', p_purchase_id, 'difference', v_diff, 'cost_impact', -v_diff));
  end if;

  insert into public.audit_log (business_id, user_id, action, entity, entity_id, before, after, reason)
  values (p_business_id, v_user, 'return_to_supplier', 'supplier_return', v_return_id,
          jsonb_build_object('stock_qty', v_product.stock_qty, 'stock_value', v_product.stock_value,
                             'unpaid', v_unpaid),
          jsonb_build_object('stock_qty', (v_movement ->> 'stock_qty')::integer,
                             'stock_value', (v_movement ->> 'stock_value')::bigint,
                             'qty', p_qty, 'value_removed', v_value, 'credit_amount', p_credit_amount,
                             'credit_type', p_credit_type, 'purchase_id', p_purchase_id,
                             'difference', v_diff, 'cost_impact', -v_diff,
                             'unpaid', case when p_purchase_id is not null then private.purchase_unpaid(p_business_id, p_purchase_id) end,
                             'movement_id', v_movement_id, 'attention_item_id', v_attention),
          v_reason);

  v_result := jsonb_build_object(
    'return_id', v_return_id,
    'movement_id', v_movement_id,
    'qty', p_qty,
    'value_removed', v_value,
    'credit_amount', p_credit_amount,
    'credit_type', p_credit_type,
    'purchase_id', p_purchase_id,
    'difference', v_diff,
    'cost_impact', -v_diff,
    'unpaid_after', case when p_purchase_id is not null then private.purchase_unpaid(p_business_id, p_purchase_id) end,
    'stock_qty', (v_movement ->> 'stock_qty')::integer,
    'stock_value', (v_movement ->> 'stock_value')::bigint,
    'attention_item_id', v_attention);
  return private.complete_request(p_request_id, v_result);
end;
$$;

revoke all on function public.return_to_supplier(uuid, uuid, uuid, integer, bigint, text, text, uuid) from public, anon;
grant execute on function public.return_to_supplier(uuid, uuid, uuid, integer, bigint, text, text, uuid) to authenticated;
