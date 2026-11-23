-- Stage 1C, task T1: shared inventory helpers (09 §3, §4.2; 05 §3.2, §3.4).
-- Internal building blocks for the Stage 1C server functions (create_product, restock,
-- adjust_stock, ...), which come in later tasks. Nothing here is callable through the API:
-- every function is revoked from PUBLIC, anon and authenticated (SEC-11).
--
-- Owner decisions applied here (docs/stages/STAGE-1C-PLAN.md §6a):
--   D3  restock movements link to their purchase through stock_movements.purchase_id;
--       purchases.movement_id stays empty (append-only rows, non-deferrable circular keys).
--   D6  movement quantity limit 100,000; entered amounts at most GH₵ 1,000,000;
--       every stock_qty / stock_value change and every stored average is range-checked
--       before it is written; empty movements (no quantity and no value) are refused.
--   D7  partial index for exact active-product counts (used by inventory_summary in T2).
--   D8  at most one OPEN attention item per (business, type, entity, entity_id), enforced by a
--       unique index so concurrent requests cannot create duplicates.
-- No existing table, constraint, policy or grant is changed.

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index products_active_idx on public.products (business_id)
  where active and deleted_at is null;

create unique index attention_items_open_uq
  on public.attention_items (business_id, type, entity, entity_id) nulls not distinct
  where status = 'open';

-- ---------------------------------------------------------------------------
-- Limits (D6)
-- ---------------------------------------------------------------------------
create or replace function private.max_movement_qty()
returns integer
language sql
immutable
set search_path = ''
as $$ select 100000 $$;

create or replace function private.max_entered_amount()
returns bigint
language sql
immutable
set search_path = ''
as $$ select 100000000::bigint $$;   -- GH₵ 1,000,000 in pesewas (same as the selling-price cap)

-- ---------------------------------------------------------------------------
-- round_half_up: halves round away from zero (2.5 -> 3, -2.5 -> -3). Used for every value
-- calculated from an average, e.g. round_half_up(qty × stock_value / stock_qty) (05 C-21).
-- ---------------------------------------------------------------------------
create or replace function private.round_half_up(p_amount numeric)
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
declare
  v numeric;
begin
  if p_amount is null then
    return null;
  end if;
  v := sign(p_amount) * floor(abs(p_amount) + 0.5);
  if abs(v) > 9223372036854775807 then
    raise exception 'amount_out_of_range' using errcode = '22003';
  end if;
  return v::bigint;
end;
$$;

-- ---------------------------------------------------------------------------
-- lock_products: step 2 of the lock order (09 §4.2). Locks every listed product of the
-- business, sorted by product ID, so concurrent requests never deadlock on products.
-- Refuses if any product is missing or belongs to another business.
-- ---------------------------------------------------------------------------
create or replace function private.lock_products(p_business_id uuid, p_product_ids uuid[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_wanted integer;
  v_locked integer;
begin
  if p_product_ids is null or cardinality(p_product_ids) = 0 or array_position(p_product_ids, null) is not null then
    raise exception 'products_required' using errcode = '22023';
  end if;
  select count(distinct x) into v_wanted from unnest(p_product_ids) as x;

  select count(*) into v_locked
  from (select p.id from public.products p
        where p.business_id = p_business_id and p.id = any (p_product_ids)
        order by p.id
        for update) as locked;

  if v_locked <> v_wanted then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- raise_attention: opens a Needs attention item, or, if an identical item is already open,
-- keeps that one and records the repeat (occurrences, latest details). Concurrency-safe
-- through attention_items_open_uq (D8).
-- ---------------------------------------------------------------------------
create or replace function private.raise_attention(
  p_business_id uuid, p_type text, p_entity text, p_entity_id uuid, p_message_data jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_message_data is null or jsonb_typeof(p_message_data) <> 'object' then
    raise exception 'message_data_must_be_object' using errcode = '22023';
  end if;

  insert into public.attention_items (business_id, type, entity, entity_id, message_data)
  values (p_business_id, p_type, p_entity, p_entity_id, p_message_data)
  on conflict (business_id, type, entity, entity_id) where status = 'open'
  do update set
    message_data = public.attention_items.message_data || jsonb_build_object(
      'occurrences', coalesce((public.attention_items.message_data ->> 'occurrences')::integer, 1) + 1,
      'latest', excluded.message_data),
    updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- write_movement: records ONE movement exactly as given (C-21) and its ONE history row (C-22).
-- No pool rules (apply_movement adds them). Locks the product row itself (FOR UPDATE) before
-- reading it. Callers that change several products must still call lock_products first, so the
-- approved ID order is kept; re-locking a row the transaction already holds is a no-op.
-- ---------------------------------------------------------------------------
create or replace function private.write_movement(
  p_business_id uuid,
  p_product_id  uuid,
  p_type        text,
  p_qty_change  integer,
  p_value       bigint,
  p_reason      text,
  p_unit_cost   numeric,
  p_purchase_id uuid,
  p_sale_id     uuid,
  p_note        text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_product   public.products%rowtype;
  v_new_qty   bigint;
  v_new_value numeric;
  v_last_at   timestamptz;
  v_at        timestamptz;
  v_avg_exact numeric;
  v_avg       numeric(18,4);
  v_id        uuid;
begin
  if p_qty_change = 0 and p_value = 0 then
    raise exception 'empty_movement' using errcode = '22023';
  end if;

  select * into v_product from public.products
  where id = p_product_id and business_id = p_business_id
  for update;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

  -- D6: range checks before anything is written
  v_new_qty := v_product.stock_qty::bigint + p_qty_change;
  if v_new_qty < -2147483648 or v_new_qty > 2147483647 then
    raise exception 'stock_qty_out_of_range' using errcode = '22003';
  end if;
  v_new_value := v_product.stock_value::numeric + p_value;
  if abs(v_new_value) > 9223372036854775807 then
    raise exception 'stock_value_out_of_range' using errcode = '22003';
  end if;

  -- Average (4 dp) only when it is meaningful: stock positive, value not negative, cost known.
  -- Checked against the numeric(18,4) column range (below 10^14) before it is assigned.
  if v_new_qty > 0 and v_new_value >= 0 and v_product.cost_known then
    v_avg_exact := round(v_new_value / v_new_qty, 4);
    if v_avg_exact >= 100000000000000 then
      raise exception 'average_out_of_range' using errcode = '22003';
    end if;
    v_avg := v_avg_exact;
  end if;

  insert into public.stock_movements
    (business_id, product_id, type, qty_change, value, unit_cost, reason, purchase_id, sale_id, note, user_id)
  values
    (p_business_id, p_product_id, p_type, p_qty_change, p_value, p_unit_cost, p_reason, p_purchase_id, p_sale_id,
     p_note, auth.uid())
  returning id into v_id;

  update public.products
  set stock_qty = stock_qty + p_qty_change,
      stock_value = stock_value + p_value
  where id = p_product_id;

  -- History time is strictly increasing per product, even for several movements in one
  -- transaction (now() is constant within a transaction; the product row is locked).
  select max(h.effective_at) into v_last_at from public.product_cost_history h where h.product_id = p_product_id;
  v_at := greatest(clock_timestamp(), coalesce(v_last_at + interval '1 microsecond', clock_timestamp()));

  insert into public.product_cost_history
    (business_id, product_id, effective_at, stock_qty_after, stock_value_after, avg_cost, cause, movement_id)
  values
    (p_business_id, p_product_id, v_at, v_new_qty::integer, v_new_value::bigint, v_avg,
     case p_type when 'value_correction' then 'set_cost' else p_type end, v_id);

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- apply_movement: the single entry point server functions use to change a product's stock.
-- Validates, locks the product, writes the movement and history, then applies the visible
-- pool rules (05 §3.4):
--   C-25a  stock 0 but value not 0  -> cost adjustment to value 0 ("zero_stock_residue");
--          a Needs attention item (cost_adjustment, C-122) when the amount is GH₵ 0.10 or more
--   C-25b  stock > 0 but value < 0  -> cost adjustment to value 0 ("negative_value_correction")
--          and a "Cost check needed" item (cost_check, C-123)
-- Returns {movement_id, pool_adjustment: null | {movement_id, reason, value},
--          attention_item_id, stock_qty, stock_value}.
-- ---------------------------------------------------------------------------
create or replace function private.apply_movement(
  p_business_id      uuid,
  p_product_id       uuid,
  p_type             text,
  p_qty_change       integer,
  p_value            bigint,
  p_reason           text    default null,
  p_unit_cost        numeric default null,
  p_purchase_id      uuid    default null,
  p_sale_id          uuid    default null,
  p_note             text    default null,
  p_marks_cost_known boolean default false)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_movement_id uuid;
  v_adj_id      uuid;
  v_adj_reason  text;
  v_adj_value   bigint;
  v_attention   uuid;
  v_qty         integer;
  v_value       bigint;
begin
  if p_type is null then
    raise exception 'type_required' using errcode = '22023';
  end if;
  if p_qty_change is null then
    raise exception 'qty_required' using errcode = '22023';
  end if;
  if p_value is null then
    raise exception 'value_required' using errcode = '22023';
  end if;
  if p_qty_change = 0 and p_value = 0 then
    raise exception 'empty_movement' using errcode = '22023';
  end if;
  if abs(p_qty_change::bigint) > private.max_movement_qty() then
    raise exception 'qty_limit_exceeded' using errcode = '22023';
  end if;

  -- Lock (re-locking a row this transaction already holds is a no-op, so callers that locked
  -- several products in ID order first keep the approved lock order).
  perform 1 from public.products where id = p_product_id and business_id = p_business_id for update;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

  if p_marks_cost_known then
    update public.products set cost_known = true where id = p_product_id and not cost_known;
  end if;

  v_movement_id := private.write_movement(p_business_id, p_product_id, p_type, p_qty_change, p_value,
                                          p_reason, p_unit_cost, p_purchase_id, p_sale_id, p_note);

  select stock_qty, stock_value into v_qty, v_value from public.products where id = p_product_id;

  if v_qty = 0 and v_value <> 0 then
    v_adj_reason := 'zero_stock_residue';                  -- C-25a
  elsif v_qty > 0 and v_value < 0 then
    v_adj_reason := 'negative_value_correction';           -- C-25b
  end if;

  if v_adj_reason is not null then
    v_adj_value := -v_value;
    v_adj_id := private.write_movement(p_business_id, p_product_id, 'cost_adjustment', 0, v_adj_value,
                                       v_adj_reason, null, null, null, null);
    if v_adj_reason = 'negative_value_correction' then
      v_attention := private.raise_attention(p_business_id, 'cost_check', 'product', p_product_id,
        jsonb_build_object('rule', 'C-25b', 'product_id', p_product_id, 'movement_id', v_adj_id,
                           'value_before', v_value, 'value_change', v_adj_value));
    elsif abs(v_adj_value) >= 10 then
      v_attention := private.raise_attention(p_business_id, 'cost_adjustment', 'stock_movement', v_adj_id,
        jsonb_build_object('rule', 'C-25a', 'product_id', p_product_id, 'movement_id', v_adj_id,
                           'value_change', v_adj_value));
    end if;
    select stock_qty, stock_value into v_qty, v_value from public.products where id = p_product_id;
  end if;

  return jsonb_build_object(
    'movement_id', v_movement_id,
    'pool_adjustment', case when v_adj_id is null then null
                            else jsonb_build_object('movement_id', v_adj_id, 'reason', v_adj_reason, 'value', v_adj_value) end,
    'attention_item_id', v_attention,
    'stock_qty', v_qty,
    'stock_value', v_value);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: internal only. Functions in schema private are executable by PUBLIC by
-- default (the default-privilege rules in migration 0400 cover schema public only), so
-- revoke explicitly.
-- ---------------------------------------------------------------------------
revoke all on function private.max_movement_qty() from public, anon, authenticated;
revoke all on function private.max_entered_amount() from public, anon, authenticated;
revoke all on function private.round_half_up(numeric) from public, anon, authenticated;
revoke all on function private.lock_products(uuid, uuid[]) from public, anon, authenticated;
revoke all on function private.raise_attention(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function private.write_movement(uuid, uuid, text, integer, bigint, text, numeric, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function private.apply_movement(uuid, uuid, text, integer, bigint, text, numeric, uuid, uuid, text, boolean)
  from public, anon, authenticated;
