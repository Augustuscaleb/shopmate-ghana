-- Stage 1C, task T7: Pay supplier and the Unpaid purchases list (04 §2.2; 05 C-112 – C-115, §12.1;
-- 03 S-38; 07 "Pay supplier more than owed"; 09 §3 pay_supplier(purchase, amount, paid_from, date),
-- §4.2 lock order step 3a).
--
-- A supplier payment is linked to one purchase. It changes ONLY the amount owed (and, through the
-- cash count later, expected cash / MoMo, C-80, C-115): no stock movement, no stock value, no
-- profit, never an expense (C-113, §12.1). No cash ledger is introduced: expected cash is calculated
-- at the cash count from supplier_payments (paid_from, paid_on).
--
-- Owner decisions for T7 (24 Nov 2026):
--   P1  the payment date defaults to today's Ghana date (UTC); future dates and dates before the
--       purchase date are refused (invalid_payment_date)
--   P2  no closed-day adjustment here: day closing does not exist yet (follow-up for that stage)
--   P3  no payment reversal or correction: payments and audit entries stay append-only
--   P4  ONE shared unpaid-balance helper, private.purchase_unpaid, with the formula of 09:
--         unpaid = purchase_cost − paid_now − Σ supplier payments
--                  + Σ purchase cost corrections (signed cost_change)
--                  − Σ supplier-return credits that reduce this purchase's unpaid amount
--       The correction and return terms are 0 until T8 and T9 write those tables; T8 and T9 must
--       use this helper rather than a competing calculation.
--   P5  a read-only, server-side paginated unpaid_purchases list with the total owed and count
--       across ALL qualifying purchases (the API's 1,000-row limit never applies to them)
--   P6  purchases of archived products can be paid
--   P7  no reference column: the existing note is used
-- A negative unpaid figure is never shown: a purchase is listed and payable only while the helper
-- gives more than 0 (C-112: the amount owed never goes below zero).
-- Security as for the other Stage 1C functions: SECURITY DEFINER with explicit checks (signed-in
-- user, active membership, rows looked up with the business), executable by authenticated only;
-- the helper is internal. No existing table, constraint, policy, grant or function is changed.

-- ---------------------------------------------------------------------------
-- Indexes for the helper's sums (new objects only)
-- ---------------------------------------------------------------------------
create index supplier_payments_purchase_idx on public.supplier_payments (purchase_id);
create index purchase_corrections_purchase_idx on public.purchase_corrections (purchase_id);
create index supplier_returns_purchase_idx on public.supplier_returns (purchase_id) where purchase_id is not null;
create index purchases_business_idx on public.purchases (business_id, purchased_on, created_at, id);

-- ---------------------------------------------------------------------------
-- purchase_unpaid: the ONE unpaid-balance calculation (C-112, 09; P4). Returns the exact signed
-- figure (null if the purchase is not in that business). Callers treat <= 0 as "nothing owed".
-- Sign semantics: a payment reduces it; a cost correction adds its signed cost_change (an increase
-- of the agreed cost raises the amount owed, a decrease lowers it); a return credit of type
-- reduce_unpaid on this purchase reduces it. Cash/MoMo refunds (purchase_corrections.refund_amount,
-- supplier_returns refund_cash / refund_momo) are money received, not part of the amount owed.
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
          - coalesce((select sum(r.credit_amount) from public.supplier_returns r
                      where r.purchase_id = p.id and r.business_id = p.business_id
                        and r.credit_type = 'reduce_unpaid'), 0))::bigint
  from public.purchases p
  where p.id = p_purchase_id and p.business_id = p_business_id
$$;

revoke all on function private.purchase_unpaid(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- pay_supplier (C-113, §12.1; P1, P3, P6, P7)
-- ---------------------------------------------------------------------------
create or replace function public.pay_supplier(
  p_request_id  uuid,
  p_business_id uuid,
  p_purchase_id uuid,
  p_amount      bigint,
  p_paid_from   text,
  p_paid_on     date default null,
  p_note        text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user       uuid := auth.uid();
  v_prior      jsonb;
  v_today      date := (now() at time zone 'UTC')::date;
  v_date       date;
  v_note       text;
  v_purchase   public.purchases%rowtype;
  v_unpaid     bigint;
  v_payment_id uuid;
  v_result     jsonb;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_business_id is null or not private.is_member(p_business_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  v_prior := private.claim_request(p_request_id, 'pay_supplier', p_business_id);
  if v_prior is not null then
    return v_prior;
  end if;

  -- Validation (SEC-12, D6)
  if p_amount is null or p_amount <= 0 or p_amount > private.max_entered_amount() then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_paid_from is null or p_paid_from not in ('cash_drawer', 'momo', 'other') then
    raise exception 'invalid_paid_from' using errcode = '22023';
  end if;
  v_note := nullif(btrim(p_note), '');
  if char_length(v_note) > 300 then
    raise exception 'note_too_long' using errcode = '22023';
  end if;

  -- Lock the purchase row (09 §4.2 step 3a): payments on one purchase are processed one at a time
  select * into v_purchase from public.purchases p
  where p.id = p_purchase_id and p.business_id = p_business_id
  for update;
  if not found then
    raise exception 'purchase_not_found' using errcode = 'P0002';
  end if;

  v_date := coalesce(p_paid_on, v_today);                                  -- P1
  if v_date > v_today or v_date < v_purchase.purchased_on then
    raise exception 'invalid_payment_date' using errcode = '22023';
  end if;

  -- Amount owed, read under the lock (C-112)
  v_unpaid := private.purchase_unpaid(p_business_id, p_purchase_id);
  if v_unpaid <= 0 then
    raise exception 'nothing_owed' using errcode = '22023';
  end if;
  if p_amount > v_unpaid then
    raise exception 'amount_exceeds_unpaid' using errcode = '22023',
      detail = json_build_object('unpaid', v_unpaid)::text;
  end if;

  insert into public.supplier_payments (business_id, purchase_id, amount, paid_from, paid_on, note, user_id)
  values (p_business_id, p_purchase_id, p_amount, p_paid_from, v_date, v_note, v_user)
  returning id into v_payment_id;

  insert into public.audit_log (business_id, user_id, action, entity, entity_id, before, after)
  values (p_business_id, v_user, 'pay_supplier', 'supplier_payment', v_payment_id,
          jsonb_build_object('purchase_id', p_purchase_id, 'unpaid', v_unpaid),
          jsonb_build_object('purchase_id', p_purchase_id, 'amount', p_amount, 'paid_from', p_paid_from,
                             'paid_on', v_date, 'note', v_note, 'unpaid', v_unpaid - p_amount));

  v_result := jsonb_build_object(
    'payment_id', v_payment_id,
    'purchase_id', p_purchase_id,
    'amount', p_amount,
    'paid_from', p_paid_from,
    'paid_on', v_date,
    'unpaid_before', v_unpaid,
    'unpaid_after', v_unpaid - p_amount);
  return private.complete_request(p_request_id, v_result);
end;
$$;

revoke all on function public.pay_supplier(uuid, uuid, uuid, bigint, text, date, text) from public, anon;
grant execute on function public.pay_supplier(uuid, uuid, uuid, bigint, text, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- unpaid_purchases (S-38, C-114; P5): read-only. total_owed and purchase_count cover every
-- purchase of the business with an amount owed; purchases is one page of them, oldest first
-- (purchased_on, then created_at, then id: deterministic). paid = paid now + later payments.
-- Each purchase's payment history is read directly from supplier_payments (members_read).
-- ---------------------------------------------------------------------------
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
           (select coalesce(sum(s.amount), 0) from public.supplier_payments s where s.purchase_id = q.id and s.business_id = p_business_id) as paid_later
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
                     'paid', paid_now + paid_later, 'payments', payments, 'unpaid', unpaid)
                     order by purchased_on, created_at, id) from page), '[]'::jsonb)
    into v_total, v_count, v_page;

  return jsonb_build_object('total_owed', v_total, 'purchase_count', v_count,
                            'limit', p_limit, 'offset', p_offset, 'purchases', v_page);
end;
$$;

revoke all on function public.unpaid_purchases(uuid, integer, integer) from public, anon;
grant execute on function public.unpaid_purchases(uuid, integer, integer) to authenticated;
