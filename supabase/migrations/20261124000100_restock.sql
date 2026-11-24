-- Stage 1C, task T5: restock (purchase) (04 §2.2; 05 C-21, C-25, C-110 – C-112, C-122, §3.8;
-- 09 §3 restock(product, qty, purchase_cost, paid_now, paid_from, supplier_name)).
--
-- One transaction, in this order:
--   1. sign-in, active membership, business-scoped idempotency claim (private.claim_request)
--   2. validation, then the product row lock (09 §4.2: claim -> product)
--   3. the purchase row (movement_id stays empty: D3; the movement links to the purchase)
--   4. C-25: if stock is negative, the negative units are FIRST revalued at this purchase's unit
--      cost: target value = -round_half_up(n × purchase_cost ÷ qty) for n negative units; the
--      difference is a visible cost adjustment (negative_stock_revaluation) with a Needs attention
--      item (C-122). No adjustment when the difference is 0.
--   5. the restock movement: +qty, +the FULL purchase cost (C-21, C-111), whatever is paid now.
--      T1's apply_movement writes its history row and applies the pool rules (C-25a / C-25b).
--   6. one audit entry; the result (including the unpaid amount, C-112) is stored for replays.
-- Any error rolls back everything, including the claim.
--
-- Owner decisions for T5 (24 Nov 2026):
--   R1  the server takes the TOTAL purchase cost (the app converts a per-unit entry)
--   R2  the server takes total units (the app works out packs × units per pack)
--   R3  purchase date defaults to today's Ghana date (UTC); future dates and dates before the
--       shop was created are refused (invalid_purchase_date). Costing uses the server's recording
--       time, not the purchase date (Q4).
--   R4  archived products are refused (product_archived)
--   R5  zero-cost purchases are accepted
--   R6  positive stock with unknown cost is refused (set_cost_first): those units are valued at 0
--       and would silently understate the average; the owner corrects the cost first (T4)
--   R7  negative stock with unknown cost is revalued by C-25 at this purchase's unit cost
-- Limits (D6): quantity 1 … 100,000; purchase cost and amount paid now at most GH₵ 1,000,000.
-- Security as for the other Stage 1C write functions: SECURITY DEFINER with explicit checks,
-- executable by authenticated only. No existing table, constraint, policy, grant or function is
-- changed.

create or replace function public.restock(
  p_request_id    uuid,
  p_business_id   uuid,
  p_product_id    uuid,
  p_qty           integer,
  p_purchase_cost bigint,
  p_paid_now      bigint,
  p_paid_from     text,
  p_purchased_on  date default null,
  p_supplier_name text default null,
  p_note          text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user        uuid := auth.uid();
  v_prior       jsonb;
  v_today       date := (now() at time zone 'UTC')::date;
  v_shop_start  date;
  v_date        date;
  v_paid_from   text;
  v_supplier    text;
  v_note        text;
  v_product     public.products%rowtype;
  v_purchase_id uuid;
  v_target      bigint;
  v_change      bigint;
  v_adj         jsonb;
  v_attention   uuid;
  v_revaluation jsonb;
  v_movement    jsonb;
  v_result      jsonb;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_business_id is null or not private.is_member(p_business_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  v_prior := private.claim_request(p_request_id, 'restock', p_business_id);
  if v_prior is not null then
    return v_prior;
  end if;

  -- Validation (D6, C-110, R3)
  if p_qty is null or p_qty < 1 or p_qty > private.max_movement_qty() then
    raise exception 'invalid_qty' using errcode = '22023';
  end if;
  if p_purchase_cost is null or p_purchase_cost < 0 or p_purchase_cost > private.max_entered_amount() then
    raise exception 'invalid_purchase_cost' using errcode = '22023';
  end if;
  if p_paid_now is null or p_paid_now < 0 or p_paid_now > p_purchase_cost then
    raise exception 'invalid_paid_now' using errcode = '22023';
  end if;
  if p_paid_from is not null and p_paid_from not in ('cash_drawer', 'momo', 'other') then
    raise exception 'invalid_paid_from' using errcode = '22023';
  end if;
  if p_paid_now > 0 and p_paid_from is null then
    raise exception 'paid_from_required' using errcode = '22023';
  end if;
  v_paid_from := case when p_paid_now > 0 then p_paid_from end;   -- nothing paid now: no source

  select (b.created_at at time zone 'UTC')::date into v_shop_start from public.businesses b where b.id = p_business_id;
  v_date := coalesce(p_purchased_on, v_today);
  if v_date > v_today or v_date < v_shop_start then
    raise exception 'invalid_purchase_date' using errcode = '22023';
  end if;

  v_supplier := nullif(btrim(p_supplier_name), '');
  if char_length(v_supplier) > 100 then
    raise exception 'supplier_name_too_long' using errcode = '22023';
  end if;
  v_note := nullif(btrim(p_note), '');
  if char_length(v_note) > 300 then
    raise exception 'note_too_long' using errcode = '22023';
  end if;

  -- Lock the product (09 §4.2); deleted products are not found
  select * into v_product from public.products p
  where p.id = p_product_id and p.business_id = p_business_id and p.deleted_at is null
  for update;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;
  if not v_product.active then
    raise exception 'product_archived' using errcode = '22023';             -- R4
  end if;
  if v_product.stock_qty > 0 and not v_product.cost_known then
    raise exception 'set_cost_first' using errcode = '22023';               -- R6
  end if;

  insert into public.purchases
    (business_id, product_id, qty, purchase_cost, paid_now, paid_now_from, supplier_name, purchased_on, note, user_id)
  values
    (p_business_id, p_product_id, p_qty, p_purchase_cost, p_paid_now, v_paid_from, v_supplier, v_date, v_note, v_user)
  returning id into v_purchase_id;

  -- C-25 (and R7): revalue negative units at this purchase's unit cost BEFORE adding it
  if v_product.stock_qty < 0 then
    v_target := -private.round_half_up((-v_product.stock_qty)::numeric * p_purchase_cost / p_qty);
    v_change := v_target - v_product.stock_value;
    if v_change <> 0 then
      v_adj := private.apply_movement(
        p_business_id, p_product_id, 'cost_adjustment', 0, v_change,
        p_reason => 'negative_stock_revaluation', p_purchase_id => v_purchase_id);
      v_attention := private.raise_attention(p_business_id, 'cost_adjustment', 'stock_movement',
        (v_adj ->> 'movement_id')::uuid,
        jsonb_build_object('rule', 'C-25', 'product_id', p_product_id, 'purchase_id', v_purchase_id,
                           'movement_id', v_adj ->> 'movement_id', 'units_revalued', -v_product.stock_qty,
                           'previous_unit_cost', round(v_product.stock_value::numeric / v_product.stock_qty, 4),
                           'purchase_unit_cost', round(p_purchase_cost::numeric / p_qty, 4),
                           'value_before', v_product.stock_value, 'value_change', v_change));
      v_revaluation := jsonb_build_object('movement_id', v_adj ->> 'movement_id', 'value_change', v_change,
                                          'attention_item_id', v_attention);
    end if;
  end if;

  -- C-21, C-111: +qty and +the full purchase cost
  v_movement := private.apply_movement(
    p_business_id, p_product_id, 'restock', p_qty, p_purchase_cost,
    p_unit_cost => round(p_purchase_cost::numeric / p_qty, 4),
    p_purchase_id => v_purchase_id, p_marks_cost_known => true);

  insert into public.audit_log (business_id, user_id, action, entity, entity_id, after)
  values (p_business_id, v_user, 'restock', 'purchase', v_purchase_id,
          jsonb_build_object('product_id', p_product_id, 'qty', p_qty, 'purchase_cost', p_purchase_cost,
                             'paid_now', p_paid_now, 'paid_from', v_paid_from, 'unpaid', p_purchase_cost - p_paid_now,
                             'purchased_on', v_date, 'supplier_name', v_supplier, 'note', v_note,
                             'movement_id', v_movement ->> 'movement_id', 'revaluation', v_revaluation,
                             'stock_before', jsonb_build_object('stock_qty', v_product.stock_qty, 'stock_value', v_product.stock_value),
                             'stock_after', jsonb_build_object('stock_qty', (v_movement ->> 'stock_qty')::integer,
                                                               'stock_value', (v_movement ->> 'stock_value')::bigint)));

  v_result := jsonb_build_object(
    'purchase_id', v_purchase_id,
    'movement_id', v_movement ->> 'movement_id',
    'unpaid', p_purchase_cost - p_paid_now,
    'stock_qty', (v_movement ->> 'stock_qty')::integer,
    'stock_value', (v_movement ->> 'stock_value')::bigint,
    'revaluation', v_revaluation);
  return private.complete_request(p_request_id, v_result);
end;
$$;

revoke all on function public.restock(uuid, uuid, uuid, integer, bigint, bigint, text, date, text, text) from public, anon;
grant execute on function public.restock(uuid, uuid, uuid, integer, bigint, bigint, text, date, text, text) to authenticated;
