-- Stage 1C-1 follow-up, owner decision M2 (Option B, approved 24 Nov 2026): display fields for
-- public.unpaid_purchases (S-38). ADDITIVE: the T7 function (20261124000300_supplier_payments.sql,
-- frozen, not edited) is redefined here with the same signature, checks, privileges, filters,
-- ordering, pagination, totals, error codes and existing output fields; four integer fields (pesewas)
-- are added to every element of `purchases` and nothing else changes:
--
--   cost_corrections  Σ purchase_corrections.cost_change for the purchase (signed; quantity
--                     corrections carry cost_change = 0 by table constraint, so they add nothing)
--   corrected_cost    purchase_cost + cost_corrections
--   refunds_received  Σ purchase_corrections.refund_amount for the purchase (T9 C2)
--   return_credits    Σ supplier_returns.credit_amount for the purchase, credit_type = 'reduce_unpaid'
--                     only (cash and MoMo return refunds are money received, not part of the amount owed)
--
-- Unchanged: purchase_cost (original), paid (paid now + later payments, gross), payments (count of
-- later payments) and unpaid (private.purchase_unpaid, the single authoritative balance, T7 P4).
-- Each sum uses the same rows and business filter as private.purchase_unpaid, so every row satisfies
--   unpaid = corrected_cost - paid + refunds_received - return_credits
-- No table, constraint, index, policy, grant or other function is changed.

create or replace function public.unpaid_purchases(
  p_business_id uuid,
  p_limit       integer default 50,
  p_offset      integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_total bigint;
  v_count bigint;
  v_page  jsonb;
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

  with owed as (
    select p.id, p.product_id, p.supplier_name, p.purchased_on, p.created_at, p.purchase_cost, p.paid_now,
           private.purchase_unpaid(p.business_id, p.id) as unpaid
    from public.purchases p
    where p.business_id = p_business_id
  ), q as (
    select * from owed where unpaid > 0
  ), page as (
    select q.*, pr.name as product_name, pr.active as product_active,
           (select count(*) from public.supplier_payments s where s.purchase_id = q.id and s.business_id = p_business_id) as payments,
           (select coalesce(sum(s.amount), 0) from public.supplier_payments s where s.purchase_id = q.id and s.business_id = p_business_id) as paid_later,
           -- M2 display fields (page rows only), with the same rows and filters as private.purchase_unpaid
           (select coalesce(sum(c.cost_change), 0) from public.purchase_corrections c
            where c.purchase_id = q.id and c.business_id = p_business_id) as cost_corrections,
           (select coalesce(sum(c.refund_amount), 0) from public.purchase_corrections c
            where c.purchase_id = q.id and c.business_id = p_business_id) as refunds_received,
           (select coalesce(sum(r.credit_amount), 0) from public.supplier_returns r
            where r.purchase_id = q.id and r.business_id = p_business_id and r.credit_type = 'reduce_unpaid') as return_credits
    from q
    join public.products pr on pr.id = q.product_id and pr.business_id = p_business_id
    order by q.purchased_on, q.created_at, q.id
    limit p_limit offset p_offset
  )
  select (select coalesce(sum(unpaid), 0) from q),
         (select count(*) from q),
         coalesce((select jsonb_agg(jsonb_build_object(
                     'purchase_id', id, 'product_id', product_id, 'product_name', product_name,
                     'product_active', product_active, 'supplier_name', supplier_name,
                     'purchased_on', purchased_on, 'purchase_cost', purchase_cost,
                     'paid', paid_now + paid_later, 'payments', payments, 'unpaid', unpaid,
                     'corrected_cost', purchase_cost + cost_corrections,
                     'cost_corrections', cost_corrections,
                     'refunds_received', refunds_received,
                     'return_credits', return_credits)
                     order by purchased_on, created_at, id) from page), '[]'::jsonb)
    into v_total, v_count, v_page;

  return jsonb_build_object('total_owed', v_total, 'purchase_count', v_count,
                            'limit', p_limit, 'offset', p_offset, 'purchases', v_page);
end;
$$;

revoke all on function public.unpaid_purchases(uuid, integer, integer) from public, anon;
grant execute on function public.unpaid_purchases(uuid, integer, integer) to authenticated;
