-- Stage 1C, task T10: acknowledge attention, stock integrity check, low-stock list.
-- Plan (accepted): docs/stages/STAGE-1C-T10-ATTENTION-INTEGRITY-LOWSTOCK-PLAN.md.
-- Owner decisions (24 Nov 2026): A1 – A3, I1 – I3, L1 – L3, M2 (deferred).
--
-- 1. public.acknowledge_attention   SECURITY DEFINER; writes only attention_items status fields,
--                                  one audit entry per actual change (A3); no figures (S-36, TC-ATTN-05)
-- 2. private.stock_integrity       internal core: the nine checks of plan §4.3.1, ONE SELECT
--                                  (one snapshot), read-only; not executable by app roles
--    public.check_stock_integrity  SECURITY DEFINER wrapper: sign-in, membership, limits; read-only
-- 3. public.low_stock_products     SECURITY INVOKER as inventory_summary (T2), the SAME predicate
--                                  (04 §2.4), paginated, ordered by shortfall, name, id (L1, L2)
-- None of them repairs stock, raises or resolves attention items (other than acknowledging one),
-- or changes any figure. No table, constraint, index, policy or existing function is changed
-- (L3: no index; M2: the T7 unpaid_purchases function is untouched).

-- ---------------------------------------------------------------------------
-- 1. acknowledge_attention (A1, A2, A3)
-- ---------------------------------------------------------------------------
create or replace function public.acknowledge_attention(
  p_request_id  uuid,
  p_business_id uuid,
  p_item_id     uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := auth.uid();
  v_prior  jsonb;
  v_item   public.attention_items%rowtype;
  v_now    timestamptz := now();
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_business_id is null or not private.is_member(p_business_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  v_prior := private.claim_request(p_request_id, 'acknowledge_attention', p_business_id);
  if v_prior is not null then
    return v_prior;
  end if;

  select * into v_item from public.attention_items a
  where a.id = p_item_id and a.business_id = p_business_id
  for update;
  if not found then
    raise exception 'attention_item_not_found' using errcode = 'P0002';
  end if;

  -- A1: items that clear only through a corrective action cannot be acknowledged away
  if v_item.type not in ('cost_adjustment', 'cost_check', 'purchase_correction', 'time_uncertain', 'closed_day_changed') then
    raise exception 'not_acknowledgeable' using errcode = '22023';
  end if;

  if v_item.status = 'open' then
    update public.attention_items
    set status = 'acknowledged', acknowledged_by = v_user, acknowledged_at = v_now
    where id = v_item.id;

    insert into public.audit_log (business_id, user_id, action, entity, entity_id, before, after)
    values (p_business_id, v_user, 'acknowledge_attention', 'attention_item', v_item.id,
            jsonb_build_object('status', 'open', 'type', v_item.type),
            jsonb_build_object('status', 'acknowledged', 'type', v_item.type,
                               'acknowledged_by', v_user, 'acknowledged_at', v_now));

    v_result := jsonb_build_object('item_id', v_item.id, 'type', v_item.type, 'status', 'acknowledged',
                                   'changed', true, 'acknowledged_by', v_user, 'acknowledged_at', v_now);
  else
    -- A2: already acknowledged or resolved: no change, the original details, no audit entry
    v_result := jsonb_build_object('item_id', v_item.id, 'type', v_item.type, 'status', v_item.status,
                                   'changed', false, 'acknowledged_by', v_item.acknowledged_by,
                                   'acknowledged_at', v_item.acknowledged_at);
  end if;

  return private.complete_request(p_request_id, v_result);
end;
$$;

revoke all on function public.acknowledge_attention(uuid, uuid, uuid) from public, anon;
grant execute on function public.acknowledge_attention(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2a. private.stock_integrity: the nine checks (I1, plan §4.3.1). Read-only, one statement.
--     Products in scope: every product of the shop (archived and deleted included), or one.
-- ---------------------------------------------------------------------------
create or replace function private.stock_integrity(p_business_id uuid, p_product_id uuid default null)
returns table (product_id uuid, product_name text, check_code text, expected text, actual text)
language sql
stable
set search_path = ''
as $$
  with prods as (
    select p.id, p.name, p.stock_qty::bigint as stock_qty, p.stock_value::numeric as stock_value, p.cost_known
    from public.products p
    where p.business_id = p_business_id and (p_product_id is null or p.id = p_product_id)
  ),
  mv as (                                   -- movement sums (checks 1, 2)
    select m.product_id, sum(m.qty_change)::bigint as q, sum(m.value)::numeric as v
    from public.stock_movements m
    join prods on prods.id = m.product_id
    where m.business_id = p_business_id
    group by m.product_id
  ),
  hist as (                                 -- history rows with their linked movement (checks 3, 5, 8, 9)
    select h.product_id, h.id, h.effective_at, h.stock_qty_after::bigint as qa, h.stock_value_after::numeric as va,
           h.avg_cost, m.id as mid, m.qty_change, m.value,
           row_number() over (partition by h.product_id order by h.effective_at desc, h.id desc) as rn_desc
    from public.product_cost_history h
    join prods on prods.id = h.product_id
    left join public.stock_movements m
      on m.id = h.movement_id and m.product_id = h.product_id and m.business_id = p_business_id
    where h.business_id = p_business_id
  ),
  chain as (                                -- running sums over linked rows in recorded order (check 5)
    select x.product_id, x.effective_at, x.qa, x.va,
           sum(x.qty_change) over w as rq, sum(x.value) over w as rv
    from hist x
    where x.mid is not null
    window w as (partition by x.product_id order by x.effective_at, x.id rows between unbounded preceding and current row)
  ),
  chain_first as (
    select distinct on (c.product_id) c.product_id, c.rq, c.rv, c.qa, c.va
    from chain c
    where c.rq::bigint <> c.qa or c.rv::numeric <> c.va
    order by c.product_id, c.effective_at
  ),
  mv_hist as (                              -- check 4: history rows per movement, as one grouped join
    select m.product_id, m.id, count(h.id) as nh
    from public.stock_movements m
    join prods on prods.id = m.product_id
    left join public.product_cost_history h
      on h.movement_id = m.id and h.product_id = m.product_id and h.business_id = p_business_id
    where m.business_id = p_business_id
    group by m.product_id, m.id
  ),
  link as (
    select p.id as product_id,
           coalesce((select count(*) from mv_hist y where y.product_id = p.id and y.nh <> 1), 0) as bad_mv,
           coalesce((select count(*) from hist x where x.product_id = p.id and x.mid is null), 0) as bad_hist
    from prods p
  ),
  avg_first as (                            -- check 9
    select distinct on (x.product_id) x.product_id, x.qa, x.va, x.avg_cost
    from hist x
    where x.avg_cost is not null
      and not (x.qa > 0 and x.va >= 0 and x.avg_cost = round(x.va / x.qa, 4))
    order by x.product_id, x.effective_at
  ),
  issues as (
    -- 1 qty_mismatch
    select p.id, p.name, 'qty_mismatch' as code, coalesce(mv.q, 0)::text as e, p.stock_qty::text as a
    from prods p left join mv on mv.product_id = p.id
    where p.stock_qty <> coalesce(mv.q, 0)
    union all
    -- 2 value_mismatch
    select p.id, p.name, 'value_mismatch', coalesce(mv.v, 0)::text, p.stock_value::text
    from prods p left join mv on mv.product_id = p.id
    where p.stock_value <> coalesce(mv.v, 0)
    union all
    -- 3 history_latest_mismatch (only when there is history)
    select p.id, p.name, 'history_latest_mismatch', p.stock_qty || ' / ' || p.stock_value, x.qa || ' / ' || x.va
    from prods p join hist x on x.product_id = p.id and x.rn_desc = 1
    where x.qa <> p.stock_qty or x.va <> p.stock_value
    union all
    -- 4 history_link_mismatch: movements without exactly one history row, history rows without a movement
    select p.id, p.name, 'history_link_mismatch', '0, 0', l.bad_mv || ', ' || l.bad_hist
    from prods p join link l on l.product_id = p.id
    where l.bad_mv > 0 or l.bad_hist > 0
    union all
    -- 5 history_chain_mismatch: the first linked row whose after-values differ from the running sums
    select p.id, p.name, 'history_chain_mismatch', c.rq::bigint || ' / ' || c.rv::numeric, c.qa || ' / ' || c.va
    from prods p join chain_first c on c.product_id = p.id
    union all
    -- 6 zero_stock_value (C-25a)
    select p.id, p.name, 'zero_stock_value', '0', p.stock_value::text
    from prods p where p.stock_qty = 0 and p.stock_value <> 0
    union all
    -- 7 negative_value (C-25b)
    select p.id, p.name, 'negative_value', '>= 0', p.stock_value::text
    from prods p where p.stock_qty > 0 and p.stock_value < 0
    union all
    -- 8 unknown_cost_value (C-24): value 0 and no averaged history row
    select p.id, p.name, 'unknown_cost_value', '0, 0',
           p.stock_value || ', ' || (select count(*) from hist x where x.product_id = p.id and x.avg_cost is not null)
    from prods p
    where not p.cost_known
      and (p.stock_value <> 0 or exists (select 1 from hist x where x.product_id = p.id and x.avg_cost is not null))
    union all
    -- 9 average_mismatch: the first recorded average that differs from the writer's own expression
    select p.id, p.name, 'average_mismatch',
           case when a.qa > 0 and a.va >= 0 then round(a.va / a.qa, 4)::text else 'null' end,
           a.avg_cost::text
    from prods p join avg_first a on a.product_id = p.id
  )
  select f.id, f.name, f.code, f.e, f.a from issues f
$$;

revoke all on function private.stock_integrity(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2b. public.check_stock_integrity: the wrapper (I1, plan §4.3, §4.3.2). Read-only.
-- ---------------------------------------------------------------------------
create or replace function public.check_stock_integrity(
  p_business_id uuid,
  p_product_id  uuid    default null,
  p_limit       integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_business_id is null or not private.is_member(p_business_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'invalid_limit' using errcode = '22023';
  end if;
  if p_product_id is not null
     and not exists (select 1 from public.products p where p.id = p_product_id and p.business_id = p_business_id) then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

  -- ONE statement: one snapshot for the counts and every check
  with d as (
    select s.product_id, s.product_name, s.check_code, s.expected, s.actual
    from private.stock_integrity(p_business_id, p_product_id) s
  ), page as (
    select * from d order by lower(d.product_name), d.product_id, d.check_code limit p_limit
  )
  select jsonb_build_object(
    'business_id', p_business_id,
    'product_id', p_product_id,
    'checked_at', now(),
    'products_checked', (select count(*) from public.products p
                         where p.business_id = p_business_id and (p_product_id is null or p.id = p_product_id)),
    'movements_checked', (select count(*) from public.stock_movements m
                          where m.business_id = p_business_id and (p_product_id is null or m.product_id = p_product_id)),
    'ok', (select count(*) = 0 from d),
    'discrepancy_count', (select count(*) from d),
    'discrepancies', coalesce((select jsonb_agg(jsonb_build_object(
                         'product_id', g.product_id, 'product_name', g.product_name, 'check', g.check_code,
                         'expected', g.expected, 'actual', g.actual)
                       order by lower(g.product_name), g.product_id, g.check_code) from page g), '[]'::jsonb),
    'truncated', (select count(*) > p_limit from d))
  into v_result;
  return v_result;
end;
$$;

revoke all on function public.check_stock_integrity(uuid, uuid, integer) from public, anon;
grant execute on function public.check_stock_integrity(uuid, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. low_stock_products (L1, L2): the same predicate as inventory_summary, paginated
-- ---------------------------------------------------------------------------
create or replace function public.low_stock_products(
  p_business_id uuid,
  p_limit       integer default 50,
  p_offset      integer default 0)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_business_id is null or not private.is_member(p_business_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'invalid_limit' using errcode = '22023';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception 'invalid_offset' using errcode = '22023';
  end if;

  -- inventory_summary's predicate, verbatim (04 §2.4): active, not deleted, stock_qty <= low_stock_level
  with low as (
    select p.id, p.name, p.unit, p.category_id, p.stock_qty, p.low_stock_level,
           (p.low_stock_level::bigint - p.stock_qty::bigint) as shortfall
    from public.products p
    where p.business_id = p_business_id
      and p.active
      and p.deleted_at is null
      and p.stock_qty <= p.low_stock_level
  ), page as (
    select * from low order by low.shortfall desc, lower(btrim(low.name)), low.id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'total_count', (select count(*) from low),
    'limit', p_limit,
    'offset', p_offset,
    'products', coalesce((select jsonb_agg(jsonb_build_object(
                    'product_id', g.id, 'name', g.name, 'unit', g.unit, 'category_id', g.category_id,
                    'stock_qty', g.stock_qty, 'low_stock_level', g.low_stock_level, 'shortfall', g.shortfall)
                  order by g.shortfall desc, lower(btrim(g.name)), g.id) from page g), '[]'::jsonb))
  into v_result;
  return v_result;
end;
$$;

revoke all on function public.low_stock_products(uuid, integer, integer) from public, anon;
grant execute on function public.low_stock_products(uuid, integer, integer) to authenticated;
