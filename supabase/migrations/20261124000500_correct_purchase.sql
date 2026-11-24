-- Stage 1C, task T9: Correct purchase (05 C-116 – C-116f, §3.2, §12.2; 09 §3, §4.2; 03 S-39).
-- Plan (owner-approved, all fifteen decisions): docs/stages/STAGE-1C-T9-CORRECT-PURCHASE-PLAN.md.
--
-- 1. private.purchase_unpaid is EXTENDED (C2): money the supplier refunded against a purchase
--    correction is added back. T8 cash / MoMo return refunds stay excluded. Same signature; the T7
--    migration file is not modified.
--      unpaid = purchase_cost − paid_now − Σ payments + Σ cost_change + Σ correction refund_amount
--               − Σ reduce_unpaid return credits
-- 2. public.correct_purchase records a cost correction (ΔC, proportional allocation) or a quantity
--    correction (Δq, no value change) against a purchase that is never edited.
--
-- Cost correction (C-116a – C-116c, Model A / C1):
--   Walk the product's movements after the purchase's restock movement, in recorded order (history
--   effective_at), keeping the remaining fraction f and the shares of each outflow kind as EXACT
--   rationals (integer numerator / denominator, Q10). Outflow of q with stock before Q > 0 and
--   Q − q > 0: share = f·q/Q, f ← f·(Q − q)/Q; an outflow taking stock to 0 or below (or with Q ≤ 0)
--   takes all of f. Inflows and quantity-0 movements leave f unchanged.
--     sale → S (already sold)         adjustment own_use → U (own use)
--     adjustment other decrease → L    supplier_return → T (returns to supplier)
--     quantity correction of ANOTHER purchase: increase = inflow; decrease → L, as an accounting
--       allocation only (not evidence of physical loss), flagged approximate (U3)
--     quantity correction of THIS purchase: ignored for f, flagged approximate (Q3)
--   Parts are ΔC × share rounded half up exactly; the leftover goes to R (or to S if f = 0), so
--   R + S + L + U + T = ΔC. ONE purchase_correction movement carries R (none if R = 0): the ONLY
--   stock-value change. S, L, U, T live in purchase_corrections.allocation (no stock movement).
--   Approximations (L8) are flagged: negative_stock, void, late_upload, quantity_correction.
-- Quantity correction (C-116f): ONE purchase_correction movement (Δq, value 0). Stock may reach
--   exactly 0 (U2; T1's C-25a then applies) but never below (insufficient_stock, Q4); the corrected
--   quantity stays >= 1 (Q5).
-- Unpaid and refunds (C-116e, Q6): excess = max(0, −(unpaid before + ΔC)) under the purchase lock;
--   a refund of exactly the excess (cash / MoMo) is required when excess > 0 and refused otherwise.
-- Limits (U4, D6): abs(ΔC) and the corrected purchase cost at most 100,000,000 pesewas; corrected
--   cost >= 0; abs(Δq) at most 100,000.
-- Attention (Q8, C-116d): exactly one purchase_correction item per correction, whatever the amount.
-- Movement link (Q9): the movement ID is stored in allocation and in the audit entry.
-- Lock order (09 §4.2): claim → product → purchase, as in T8. Archived products allowed (Q7).
-- Security as for the other Stage 1C write functions. No existing table, constraint or policy is
-- changed; the only existing function changed is private.purchase_unpaid (C2).

-- ---------------------------------------------------------------------------
-- 1. The shared unpaid-balance helper, extended (C2)
-- ---------------------------------------------------------------------------
create or replace function private.purchase_unpaid(p_business_id uuid, p_purchase_id uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  select (p.purchase_cost::numeric
          - p.paid_now
          - coalesce((select sum(s.amount) from public.supplier_payments s
                      where s.purchase_id = p.id and s.business_id = p.business_id), 0)
          + coalesce((select sum(c.cost_change) from public.purchase_corrections c
                      where c.purchase_id = p.id and c.business_id = p.business_id), 0)
          + coalesce((select sum(c.refund_amount) from public.purchase_corrections c
                      where c.purchase_id = p.id and c.business_id = p.business_id), 0)
          - coalesce((select sum(r.credit_amount) from public.supplier_returns r
                      where r.purchase_id = p.id and r.business_id = p.business_id
                        and r.credit_type = 'reduce_unpaid'), 0))::bigint
  from public.purchases p
  where p.id = p_purchase_id and p.business_id = p_business_id
$$;

revoke all on function private.purchase_unpaid(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Exact rounding of a rational a / b (b > 0), half up: sign(a) · floor((2|a| + b) / 2b)
-- ---------------------------------------------------------------------------
create or replace function private.round_half_up_ratio(p_num numeric, p_den numeric)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select (sign(p_num) * div(2 * abs(p_num) + p_den, 2 * p_den))::bigint
$$;

revoke all on function private.round_half_up_ratio(numeric, numeric) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. correct_purchase
-- ---------------------------------------------------------------------------
create or replace function public.correct_purchase(
  p_request_id    uuid,
  p_business_id   uuid,
  p_purchase_id   uuid,
  p_type          text,
  p_reason        text,
  p_cost_change   bigint  default null,
  p_qty_change    integer default null,
  p_refund_amount bigint  default null,
  p_refund_method text    default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user          uuid := auth.uid();
  v_prior         jsonb;
  v_reason        text;
  v_purchase      public.purchases%rowtype;
  v_product       public.products%rowtype;
  v_unpaid_before bigint;
  v_unpaid_after  bigint;
  v_prior_cost    bigint;
  v_prior_qty     bigint;
  v_corrected_cost bigint;
  v_corrected_qty bigint;
  v_excess        bigint := 0;
  v_refund        bigint := 0;
  v_refund_method text;
  -- walk
  v_start_at      timestamptz;
  v_start_created timestamptz;
  v_start_after   integer;
  v_start_qty     integer;
  r               record;
  v_walked        integer := 0;
  v_reasons       text[] := '{}';
  v_cat           text;
  v_q             numeric;
  v_qb            numeric;
  v_g             numeric;
  fn numeric := 1;  fd numeric := 1;     -- remaining fraction f
  sn numeric := 0;  sd numeric := 1;     -- already sold
  xn numeric := 0;  xd numeric := 1;     -- stock losses (incl. U3 quantity-correction decreases)
  un numeric := 0;  ud numeric := 1;     -- own use
  tn numeric := 0;  td numeric := 1;     -- returns to supplier
  hn numeric;       hd numeric;          -- one outflow's share
  v_qc_loss       boolean := false;
  -- parts
  v_r bigint; v_s bigint; v_l bigint; v_u bigint; v_t bigint; v_left bigint;
  v_movement      jsonb;
  v_movement_id   uuid;
  v_allocation    jsonb;
  v_exact         boolean;
  v_correction_id uuid;
  v_attention     uuid;
  v_qty_after     integer;
  v_value_after   bigint;
  v_result        jsonb;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_business_id is null or not private.is_member(p_business_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  v_prior := private.claim_request(p_request_id, 'correct_purchase', p_business_id);
  if v_prior is not null then
    return v_prior;
  end if;

  -- Validation of the inputs (schema, D6, U4)
  if p_type is null or p_type not in ('cost', 'quantity') then
    raise exception 'invalid_correction_type' using errcode = '22023';
  end if;
  if p_type = 'cost' then
    if p_qty_change is not null then
      raise exception 'change_mismatch' using errcode = '22023';
    end if;
    if p_cost_change is null or p_cost_change = 0 or abs(p_cost_change::numeric) > private.max_entered_amount() then
      raise exception 'invalid_cost_change' using errcode = '22023';
    end if;
    if p_refund_amount is not null and p_refund_amount < 0 then
      raise exception 'invalid_refund_amount' using errcode = '22023';
    end if;
  else
    if p_cost_change is not null then
      raise exception 'change_mismatch' using errcode = '22023';
    end if;
    if p_qty_change is null or p_qty_change = 0 or abs(p_qty_change::bigint) > private.max_movement_qty() then
      raise exception 'invalid_qty_change' using errcode = '22023';
    end if;
    if coalesce(p_refund_amount, 0) <> 0 or p_refund_method is not null then
      raise exception 'refund_not_needed' using errcode = '22023';         -- quantity corrections never refund
    end if;
  end if;
  v_reason := nullif(btrim(p_reason), '');
  if v_reason is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if char_length(v_reason) > 300 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;

  -- The purchase's product (purchases are append-only, so it cannot change), then the locks in the
  -- approved order (09 §4.2): product, then purchase
  select * into v_purchase from public.purchases pu
  where pu.id = p_purchase_id and pu.business_id = p_business_id;
  if not found then
    raise exception 'purchase_not_found' using errcode = 'P0002';
  end if;
  select * into v_product from public.products p
  where p.id = v_purchase.product_id and p.business_id = p_business_id and p.deleted_at is null
  for update;                                                                -- archived allowed (Q7)
  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;
  perform 1 from public.purchases pu where pu.id = p_purchase_id and pu.business_id = p_business_id for update;

  select coalesce(sum(c.cost_change), 0), coalesce(sum(c.qty_change), 0)
    into v_prior_cost, v_prior_qty
  from public.purchase_corrections c
  where c.purchase_id = p_purchase_id and c.business_id = p_business_id;
  v_unpaid_before := private.purchase_unpaid(p_business_id, p_purchase_id);

  -- =========================================================================
  -- Quantity correction (C-116f, Q4, Q5, U2)
  -- =========================================================================
  if p_type = 'quantity' then
    v_corrected_qty := v_purchase.qty::bigint + v_prior_qty + p_qty_change;
    if v_corrected_qty < 1 then
      raise exception 'invalid_corrected_qty' using errcode = '22023';       -- Q5
    end if;
    if v_product.stock_qty::bigint + p_qty_change < 0 then
      raise exception 'insufficient_stock' using errcode = '22023';          -- Q4 / U2 (exactly 0 allowed)
    end if;

    v_movement := private.apply_movement(p_business_id, v_product.id, 'purchase_correction', p_qty_change, 0,
                                         p_purchase_id => p_purchase_id, p_note => v_reason);
    v_movement_id := (v_movement ->> 'movement_id')::uuid;
    v_qty_after := (v_movement ->> 'stock_qty')::integer;
    v_value_after := (v_movement ->> 'stock_value')::bigint;
    v_allocation := jsonb_build_object(
      'kind', 'quantity', 'movement_id', v_movement_id, 'qty_change', p_qty_change,
      'corrected_qty', v_corrected_qty,
      'stock_before', jsonb_build_object('stock_qty', v_product.stock_qty, 'stock_value', v_product.stock_value),
      'stock_after', jsonb_build_object('stock_qty', v_qty_after, 'stock_value', v_value_after),
      'average_after', case when v_qty_after > 0 and v_value_after >= 0 then round(v_value_after::numeric / v_qty_after, 4) end,
      'pool_adjustment', v_movement -> 'pool_adjustment');

    insert into public.purchase_corrections (business_id, purchase_id, type, qty_change, cost_change, reason, allocation, user_id)
    values (p_business_id, p_purchase_id, 'quantity', p_qty_change, 0, v_reason, v_allocation, v_user)
    returning id into v_correction_id;
    v_unpaid_after := private.purchase_unpaid(p_business_id, p_purchase_id);

    v_attention := private.raise_attention(p_business_id, 'purchase_correction', 'purchase_correction', v_correction_id,
      jsonb_build_object('rule', 'C-116f', 'correction_id', v_correction_id, 'purchase_id', p_purchase_id,
                         'product_id', v_product.id, 'type', 'quantity', 'qty_change', p_qty_change,
                         'corrected_qty', v_corrected_qty, 'stock_qty_after', v_qty_after,
                         'stock_value_after', v_value_after, 'average_after', v_allocation -> 'average_after',
                         'movement_id', v_movement_id));

  -- =========================================================================
  -- Cost correction (C-116 – C-116e, C1, Q3, Q6, Q10, U3, U4)
  -- =========================================================================
  else
    v_corrected_cost := v_purchase.purchase_cost + v_prior_cost + p_cost_change;
    if v_corrected_cost < 0 or v_corrected_cost > private.max_entered_amount() then
      raise exception 'invalid_corrected_cost' using errcode = '22023';      -- C-110, U4
    end if;

    -- Refund (C-116e, Q6): exactly the excess paid, under the purchase lock
    v_excess := greatest(0, -(v_unpaid_before + p_cost_change));
    if v_excess > 0 then
      if coalesce(p_refund_amount, 0) <> v_excess then
        raise exception 'refund_required' using errcode = '22023',
          detail = json_build_object('refund_amount', v_excess)::text;
      end if;
      if p_refund_method is null or p_refund_method not in ('cash', 'momo') then
        raise exception 'invalid_refund_method' using errcode = '22023';
      end if;
      v_refund := v_excess;
      v_refund_method := p_refund_method;
    elsif coalesce(p_refund_amount, 0) <> 0 or p_refund_method is not null then
      raise exception 'refund_not_needed' using errcode = '22023';
    end if;

    -- The purchase's restock movement starts the walk (C-116a)
    select h.effective_at, m.created_at, h.stock_qty_after, m.qty_change
      into v_start_at, v_start_created, v_start_after, v_start_qty
    from public.stock_movements m
    join public.product_cost_history h on h.movement_id = m.id
    where m.purchase_id = p_purchase_id and m.business_id = p_business_id and m.type = 'restock';
    if not found then
      raise exception 'purchase_movement_not_found' using errcode = 'P0002';
    end if;
    if v_start_after - v_start_qty < 0 then
      v_reasons := array_append(v_reasons, 'negative_stock');               -- bought while stock was negative (L8)
    end if;

    for r in
      select m.type, m.qty_change, m.reason, m.purchase_id, m.sale_id, h.stock_qty_after
      from public.product_cost_history h
      join public.stock_movements m on m.id = h.movement_id
      where h.product_id = v_product.id and h.business_id = p_business_id and h.effective_at > v_start_at
      order by h.effective_at
    loop
      v_walked := v_walked + 1;
      if r.stock_qty_after < 0 and not ('negative_stock' = any (v_reasons)) then
        v_reasons := array_append(v_reasons, 'negative_stock');
      end if;
      if r.type = 'void' and not ('void' = any (v_reasons)) then
        v_reasons := array_append(v_reasons, 'void');
      end if;
      if r.type = 'sale' and not ('late_upload' = any (v_reasons))
         and exists (select 1 from public.sales s where s.id = r.sale_id and s.business_id = p_business_id
                     and s.occurred_at < v_start_created) then
        v_reasons := array_append(v_reasons, 'late_upload');
      end if;
      if r.type = 'purchase_correction' and r.qty_change <> 0 then
        if r.purchase_id = p_purchase_id then                                -- Q3: this purchase: ignored, approximate
          if not ('quantity_correction' = any (v_reasons)) then
            v_reasons := array_append(v_reasons, 'quantity_correction');
          end if;
          continue;
        end if;
        if r.qty_change < 0 and not ('quantity_correction' = any (v_reasons)) then
          v_reasons := array_append(v_reasons, 'quantity_correction');      -- U3: another purchase's decrease
        end if;
      end if;
      continue when r.qty_change >= 0;                                       -- inflows and quantity-0 movements

      v_cat := case
                 when r.type = 'sale' then 'S'
                 when r.type = 'supplier_return' then 'T'
                 when r.type = 'adjustment' and r.reason = 'own_use' then 'U'
                 when r.type = 'adjustment' then 'L'
                 when r.type = 'purchase_correction' then 'L'                -- U3: accounting allocation only
               end;
      if v_cat is null then
        raise exception 'unexpected_outflow_movement' using errcode = 'XX000', detail = r.type;
      end if;
      if r.type = 'purchase_correction' then
        v_qc_loss := true;
      end if;
      continue when fn = 0;

      v_q  := -r.qty_change;
      v_qb := r.stock_qty_after + v_q;                                       -- stock before the outflow
      if v_qb > 0 and v_qb - v_q > 0 then
        hn := fn * v_q;  hd := fd * v_qb;
        fn := fn * (v_qb - v_q);  fd := fd * v_qb;
        v_g := gcd(fn, fd);  fn := div(fn, v_g);  fd := div(fd, v_g);
      else                                                                   -- takes stock to 0 or below: all of f
        hn := fn;  hd := fd;
        fn := 0;   fd := 1;
      end if;
      v_g := gcd(hn, hd);  hn := div(hn, v_g);  hd := div(hd, v_g);

      if v_cat = 'S' then
        sn := sn * hd + hn * sd;  sd := sd * hd;  v_g := gcd(sn, sd);  sn := div(sn, v_g);  sd := div(sd, v_g);
      elsif v_cat = 'L' then
        xn := xn * hd + hn * xd;  xd := xd * hd;  v_g := gcd(xn, xd);  xn := div(xn, v_g);  xd := div(xd, v_g);
      elsif v_cat = 'U' then
        un := un * hd + hn * ud;  ud := ud * hd;  v_g := gcd(un, ud);  un := div(un, v_g);  ud := div(ud, v_g);
      else
        tn := tn * hd + hn * td;  td := td * hd;  v_g := gcd(tn, td);  tn := div(tn, v_g);  td := div(td, v_g);
      end if;
    end loop;

    -- C-116b / C-116c: parts rounded half up exactly; the leftover to R (or to S if f = 0)
    v_r := private.round_half_up_ratio(p_cost_change * fn, fd);
    v_s := private.round_half_up_ratio(p_cost_change * sn, sd);
    v_l := private.round_half_up_ratio(p_cost_change * xn, xd);
    v_u := private.round_half_up_ratio(p_cost_change * un, ud);
    v_t := private.round_half_up_ratio(p_cost_change * tn, td);
    v_left := p_cost_change - (v_r + v_s + v_l + v_u + v_t);
    if fn > 0 then
      v_r := v_r + v_left;
    else
      v_s := v_s + v_left;
    end if;
    v_exact := cardinality(v_reasons) = 0;

    -- Model A: the ONLY stock-value change
    if v_r <> 0 then
      v_movement := private.apply_movement(p_business_id, v_product.id, 'purchase_correction', 0, v_r,
                                           p_purchase_id => p_purchase_id, p_note => v_reason);
      v_movement_id := (v_movement ->> 'movement_id')::uuid;
    end if;
    select p.stock_qty, p.stock_value into v_qty_after, v_value_after from public.products p where p.id = v_product.id;

    v_allocation := jsonb_build_object(
      'kind', 'cost', 'cost_change', p_cost_change, 'movement_id', v_movement_id,
      'remaining_fraction', jsonb_build_object('num', fn::text, 'den', fd::text),
      'shares', jsonb_build_object(
        'already_sold',        jsonb_build_object('num', sn::text, 'den', sd::text),
        'stock_losses',        jsonb_build_object('num', xn::text, 'den', xd::text),
        'own_use',             jsonb_build_object('num', un::text, 'den', ud::text),
        'returns_to_supplier', jsonb_build_object('num', tn::text, 'den', td::text)),
      'parts', jsonb_build_object('remaining_stock', v_r, 'already_sold', v_s, 'stock_losses', v_l,
                                  'own_use', v_u, 'returns_to_supplier', v_t),
      'rounding_leftover', v_left,
      'stock_losses_include_quantity_corrections', v_qc_loss,
      'movements_walked', v_walked,
      'exact', v_exact, 'reasons', to_jsonb(v_reasons),
      'pool_adjustment', v_movement -> 'pool_adjustment');

    insert into public.purchase_corrections
      (business_id, purchase_id, type, qty_change, cost_change, reason, allocation, allocation_exact,
       approximation_reasons, refund_amount, refund_method, user_id)
    values
      (p_business_id, p_purchase_id, 'cost', 0, p_cost_change, v_reason, v_allocation, v_exact,
       case when v_exact then null else v_reasons end, v_refund, v_refund_method, v_user)
    returning id into v_correction_id;
    v_unpaid_after := private.purchase_unpaid(p_business_id, p_purchase_id);

    v_attention := private.raise_attention(p_business_id, 'purchase_correction', 'purchase_correction', v_correction_id,
      jsonb_build_object('rule', 'C-116', 'correction_id', v_correction_id, 'purchase_id', p_purchase_id,
                         'product_id', v_product.id, 'type', 'cost', 'cost_change', p_cost_change,
                         'parts', v_allocation -> 'parts', 'exact', v_exact, 'reasons', to_jsonb(v_reasons),
                         'refund_amount', v_refund, 'refund_method', v_refund_method,
                         'unpaid_after', v_unpaid_after, 'movement_id', v_movement_id));
  end if;

  insert into public.audit_log (business_id, user_id, action, entity, entity_id, before, after, reason)
  values (p_business_id, v_user, 'correct_purchase', 'purchase_correction', v_correction_id,
          jsonb_build_object('purchase_id', p_purchase_id, 'unpaid', v_unpaid_before,
                             'corrected_cost', v_purchase.purchase_cost + v_prior_cost,
                             'corrected_qty', v_purchase.qty + v_prior_qty,
                             'stock_qty', v_product.stock_qty, 'stock_value', v_product.stock_value),
          jsonb_build_object('purchase_id', p_purchase_id, 'type', p_type, 'unpaid', v_unpaid_after,
                             'cost_change', p_cost_change, 'qty_change', p_qty_change,
                             'corrected_cost', v_purchase.purchase_cost + v_prior_cost + coalesce(p_cost_change, 0),
                             'corrected_qty', v_purchase.qty + v_prior_qty + coalesce(p_qty_change, 0),
                             'stock_qty', v_qty_after, 'stock_value', v_value_after,
                             'allocation', v_allocation, 'refund_amount', v_refund, 'refund_method', v_refund_method,
                             'movement_id', v_movement_id, 'attention_item_id', v_attention),
          v_reason);

  v_result := jsonb_build_object(
    'correction_id', v_correction_id,
    'purchase_id', p_purchase_id,
    'type', p_type,
    'cost_change', p_cost_change,
    'qty_change', p_qty_change,
    'corrected_cost', v_purchase.purchase_cost + v_prior_cost + coalesce(p_cost_change, 0),
    'corrected_qty', v_purchase.qty + v_prior_qty + coalesce(p_qty_change, 0),
    'movement_id', v_movement_id,
    'allocation', v_allocation,
    'refund_amount', v_refund,
    'refund_method', v_refund_method,
    'unpaid_before', v_unpaid_before,
    'unpaid_after', v_unpaid_after,
    'stock_qty', v_qty_after,
    'stock_value', v_value_after,
    'attention_item_id', v_attention);
  return private.complete_request(p_request_id, v_result);
end;
$$;

revoke all on function public.correct_purchase(uuid, uuid, uuid, text, text, bigint, integer, bigint, text) from public, anon;
grant execute on function public.correct_purchase(uuid, uuid, uuid, text, text, bigint, integer, bigint, text) to authenticated;
