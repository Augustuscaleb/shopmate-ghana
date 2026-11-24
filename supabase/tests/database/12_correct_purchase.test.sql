-- Stage 1C, task T9: public.correct_purchase and the extended private.purchase_unpaid
-- (05 C-116 – C-116f, §3.2, §12.2; 09 §3, §4.2). Plan: docs/stages/STAGE-1C-T9-CORRECT-PURCHASE-PLAN.md.
-- Model A (C1): ONE purchase_correction movement carries R; S, L, U, T only in the allocation.
-- Exact rationals (Q10); leftover to R (or to S if f = 0); refunds exactly the excess (Q6) and added
-- back to the amount owed (C2); one attention item per correction (Q8). Sales and voids are
-- fixtures (Stage 1C plan §3). Fixtures are fictitious and everything is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(107);

create schema tests;
grant usage on schema tests to authenticated, anon;
create table tests.ids (k text primary key, v uuid);
grant select, insert on tests.ids to authenticated;
grant select on tests.ids to anon;
create function tests.id(p_k text) returns uuid language sql stable as $$ select v from tests.ids where k = p_k $$;
grant execute on function tests.id(text) to authenticated, anon;
create table tests.results (k text primary key, r jsonb);
grant select, insert on tests.results to authenticated;
create function tests.r(p_k text) returns jsonb language sql stable as $$ select r from tests.results where k = p_k $$;
grant execute on function tests.r(text) to authenticated;
create function tests.as_user(p_user text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end $$;
create function tests.pv(p_product uuid) returns text language sql stable security definer as $$
  select stock_qty || ' / ' || stock_value from public.products where id = p_product
$$;
grant execute on function tests.pv(uuid) to authenticated;
create function tests.unpaid(p_biz uuid, p_purchase uuid) returns bigint language sql stable security definer as $$
  select private.purchase_unpaid(p_biz, p_purchase)
$$;
grant execute on function tests.unpaid(uuid, uuid) to authenticated;
create function tests.pool_conserved(p_business uuid) returns boolean language sql stable security definer as $$
  select coalesce(bool_and(
           p.stock_qty = coalesce((select sum(m.qty_change) from public.stock_movements m where m.product_id = p.id), 0)
       and p.stock_value = coalesce((select sum(m.value) from public.stock_movements m where m.product_id = p.id), 0)
       and (select count(*) from public.stock_movements m where m.product_id = p.id)
           = (select count(*) from public.product_cost_history h where h.product_id = p.id)), true)
  from public.products p where p.business_id = p_business
$$;
grant execute on function tests.pool_conserved(uuid) to authenticated;
create function tests.mkp(p_biz uuid, p_name text, p_cost bigint, p_open integer) returns uuid language sql as $$
  select (public.create_product(gen_random_uuid(), p_biz, p_name, 1000, p_cost_price => p_cost, p_opening_stock => p_open) ->> 'product_id')::uuid
$$;
grant execute on function tests.mkp(uuid, text, bigint, integer) to authenticated;
create function tests.buy(p_biz uuid, p_product uuid, p_qty integer, p_cost bigint, p_paid bigint) returns uuid language sql as $$
  select (public.restock(gen_random_uuid(), p_biz, p_product, p_qty, p_cost, p_paid,
                         case when p_paid > 0 then 'cash_drawer' end) ->> 'purchase_id')::uuid
$$;
grant execute on function tests.buy(uuid, uuid, integer, bigint, bigint) to authenticated;
-- cost correction / quantity correction with a fresh request ID
create function tests.cc(p_biz uuid, p_purchase uuid, p_dc bigint, p_refund bigint default null, p_method text default null,
                         p_reason text default 'Invoice corrected') returns jsonb language sql as $$
  select public.correct_purchase(gen_random_uuid(), p_biz, p_purchase, 'cost', p_reason, p_cost_change => p_dc,
                                 p_refund_amount => p_refund, p_refund_method => p_method)
$$;
grant execute on function tests.cc(uuid, uuid, bigint, bigint, text, text) to authenticated;
create function tests.qc(p_biz uuid, p_purchase uuid, p_dq integer) returns jsonb language sql as $$
  select public.correct_purchase(gen_random_uuid(), p_biz, p_purchase, 'quantity', 'Different quantity received', p_qty_change => p_dq)
$$;
grant execute on function tests.qc(uuid, uuid, integer) to authenticated;
-- a fixture outflow at the current average (as real functions value them); sales need a fixture sale
create function tests.out(p_biz uuid, p_product uuid, p_type text, p_qty integer, p_reason text default null, p_sale uuid default null)
returns void language plpgsql as $$
declare q integer; v bigint;
begin
  select stock_qty, stock_value into q, v from public.products where id = p_product;
  perform private.apply_movement(p_biz, p_product, p_type, -p_qty,
    -(case when q > 0 then private.round_half_up_ratio(p_qty::numeric * v, q) else 0 end),
    p_reason => p_reason, p_sale_id => p_sale);
end $$;
-- a fixture inflow (an "opening"-type movement) of q units worth v
create function tests.inn(p_biz uuid, p_product uuid, p_qty integer, p_value bigint) returns void language sql as $$
  select null from (select private.apply_movement(p_biz, p_product, 'opening', p_qty, p_value)) x
$$;
-- part of a correction's allocation
create function tests.part(p_res jsonb, p_part text) returns bigint language sql immutable as $$
  select (p_res -> 'allocation' -> 'parts' ->> p_part)::bigint
$$;
grant execute on function tests.part(jsonb, text) to authenticated;

-- Rationals for the independent full recalculation (TC-PUR-13): {num, den}, den > 0, reduced
create function tests.rat(n numeric, d numeric) returns numeric[] language sql immutable as $$
  select case when n = 0 then array[0::numeric, 1::numeric]
              else array[sign(d) * div(n, gcd(n, d)), div(abs(d), gcd(n, d))] end
$$;
create function tests.radd(a numeric[], b numeric[]) returns numeric[] language sql immutable as $$
  select tests.rat(a[1] * b[2] + b[1] * a[2], a[2] * b[2])
$$;
create function tests.rmul(a numeric[], b numeric[]) returns numeric[] language sql immutable as $$
  select tests.rat(a[1] * b[1], a[2] * b[2])
$$;
-- Full recalculation, written independently of the function under test: replay the product's
-- movements after the purchase twice, with the pool value V exact (no rounding) — once as recorded,
-- once with the purchase's cost changed by dC — and return, per outflow kind, the exact difference
-- in the value taken out, plus the difference left in the pool.
create function tests.recalc(p_product uuid, p_purchase uuid, p_dc bigint) returns jsonb language plpgsql as $$
declare
  v1 numeric[]; v2 numeric[]; q numeric; vv numeric; m record; out1 numeric[]; out2 numeric[]; k text;
  d jsonb := '{}'; acc numeric[]; t0 timestamptz;
begin
  select h.effective_at, h.stock_value_after, h.stock_qty_after into t0, vv, q
  from public.stock_movements sm join public.product_cost_history h on h.movement_id = sm.id
  where sm.purchase_id = p_purchase and sm.type = 'restock';
  v1 := array[vv, 1::numeric];
  v2 := tests.radd(v1, array[p_dc::numeric, 1::numeric]);
  for k in select unnest(array['already_sold','stock_losses','own_use','returns_to_supplier']) loop
    d := d || jsonb_build_object(k, jsonb_build_array(0, 1));
  end loop;
  for m in select sm.type, sm.qty_change, sm.reason, sm.value from public.product_cost_history h
           join public.stock_movements sm on sm.id = h.movement_id
           where h.product_id = p_product and h.effective_at > t0 order by h.effective_at loop
    if m.qty_change > 0 then
      v1 := tests.radd(v1, array[m.value::numeric, 1]); v2 := tests.radd(v2, array[m.value::numeric, 1]); q := q + m.qty_change;
    elsif m.qty_change < 0 then
      out1 := tests.rmul(v1, tests.rat(-m.qty_change, q)); out2 := tests.rmul(v2, tests.rat(-m.qty_change, q));
      v1 := tests.radd(v1, tests.rmul(out1, array[-1::numeric, 1])); v2 := tests.radd(v2, tests.rmul(out2, array[-1::numeric, 1]));
      q := q + m.qty_change;
      k := case when m.type = 'sale' then 'already_sold' when m.type = 'supplier_return' then 'returns_to_supplier'
                when m.reason = 'own_use' then 'own_use' else 'stock_losses' end;
      acc := array[(d -> k ->> 0)::numeric, (d -> k ->> 1)::numeric];
      acc := tests.radd(acc, tests.radd(out2, tests.rmul(out1, array[-1::numeric, 1])));
      d := d || jsonb_build_object(k, jsonb_build_array(acc[1], acc[2]));
    end if;
  end loop;
  acc := tests.radd(v2, tests.rmul(v1, array[-1::numeric, 1]));
  return d || jsonb_build_object('remaining_stock', jsonb_build_array(acc[1], acc[2]));
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures: owner A with shops A and A2, owner B with shop B
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner.a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner.b@example.test');

select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
insert into tests.ids select 'biz_b', (public.create_business(gen_random_uuid(), 'Kofi Test Mart', 'provision', 'Kumasi', null) ->> 'business_id')::uuid;
insert into tests.ids select 'b_prod', tests.mkp(tests.id('biz_b'), 'B milo', 120, 6);
insert into tests.ids select 'p_b', tests.buy(tests.id('biz_b'), tests.id('b_prod'), 2, 240, 0);
reset role;

select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
insert into tests.ids select 'biz_a',  (public.create_business(gen_random_uuid(), 'Ama Test Provisions', 'provision', 'Accra', null) ->> 'business_id')::uuid;
insert into tests.ids select 'biz_a2', (public.create_business(gen_random_uuid(), 'Ama Second Shop', 'minimart', 'Tema', null) ->> 'business_id')::uuid;
insert into tests.ids select 'dev_a', (public.register_device(gen_random_uuid(), tests.id('biz_a'), 'Phone') ->> 'device_id')::uuid;
-- worked example (TC-PUR-12): 10 / 8000, then P = 10 for 10000 (nothing paid)
insert into tests.ids select 'wk', tests.mkp(tests.id('biz_a'), 'Worked example', 800, 10);
insert into tests.ids select 'p_wk', tests.buy(tests.id('biz_a'), tests.id('wk'), 10, 10000, 0);
-- f = 1 (TC-PUR-05), f = 0 (TC-PUR-06)
insert into tests.ids select 'f1', tests.mkp(tests.id('biz_a'), 'Untouched item', 500, 4);
insert into tests.ids select 'p_f1', tests.buy(tests.id('biz_a'), tests.id('f1'), 6, 3000, 3000);
insert into tests.ids select 'f0', (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Sold-out item', 1000) ->> 'product_id')::uuid;
insert into tests.ids select 'p_f0', tests.buy(tests.id('biz_a'), tests.id('f0'), 4, 2000, 0);
-- rounding: thirds to 0 (leftover to S), halves (leftover to R)
insert into tests.ids select 'thirds', (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Thirds', 1000) ->> 'product_id')::uuid;
insert into tests.ids select 'p_thirds', tests.buy(tests.id('biz_a'), tests.id('thirds'), 3, 300, 0);
insert into tests.ids select 'halves', (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Halves', 1000) ->> 'product_id')::uuid;
insert into tests.ids select 'p_halves', tests.buy(tests.id('biz_a'), tests.id('halves'), 2, 200, 0);
-- every outflow kind (§4.2)
insert into tests.ids select 'kinds', (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'All kinds', 1000) ->> 'product_id')::uuid;
insert into tests.ids select 'p_kinds', tests.buy(tests.id('biz_a'), tests.id('kinds'), 10, 1000, 0);
-- approximation flags
insert into tests.ids select 'av', (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Void item', 1000) ->> 'product_id')::uuid;
insert into tests.ids select 'p_av', tests.buy(tests.id('biz_a'), tests.id('av'), 5, 500, 0);
insert into tests.ids select 'an', (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Oversold item', 1000) ->> 'product_id')::uuid;
insert into tests.ids select 'p_an', tests.buy(tests.id('biz_a'), tests.id('an'), 2, 200, 0);
insert into tests.ids select 'al', (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Late item', 1000) ->> 'product_id')::uuid;
insert into tests.ids select 'p_al', tests.buy(tests.id('biz_a'), tests.id('al'), 4, 400, 0);
insert into tests.ids select 'aq', (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Qty item', 1000) ->> 'product_id')::uuid;
insert into tests.ids select 'p_aq', tests.buy(tests.id('biz_a'), tests.id('aq'), 4, 400, 0);
insert into tests.ids select 'p_aq2', tests.buy(tests.id('biz_a'), tests.id('aq'), 4, 400, 0);
insert into tests.ids select 'ao', (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Other-qty item', 1000) ->> 'product_id')::uuid;
insert into tests.ids select 'p_ao', tests.buy(tests.id('biz_a'), tests.id('ao'), 4, 400, 0);
insert into tests.ids select 'p_ao2', tests.buy(tests.id('biz_a'), tests.id('ao'), 4, 400, 0);
insert into tests.ids select 'ai', (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Inflow qty item', 1000) ->> 'product_id')::uuid;
insert into tests.ids select 'p_ai', tests.buy(tests.id('biz_a'), tests.id('ai'), 4, 400, 0);
insert into tests.ids select 'p_ai2', tests.buy(tests.id('biz_a'), tests.id('ai'), 4, 400, 0);
-- quantity corrections
insert into tests.ids select 'qty', (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Quantity item', 1000) ->> 'product_id')::uuid;
insert into tests.ids select 'p_qty', tests.buy(tests.id('biz_a'), tests.id('qty'), 10, 1000, 0);
insert into tests.ids select 'qz', (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Zero item', 1000) ->> 'product_id')::uuid;
insert into tests.ids select 'p_qz', tests.buy(tests.id('biz_a'), tests.id('qz'), 3, 1000, 0);
-- refunds and the unpaid amount (C2)
insert into tests.ids select 'ref', (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Refund item', 1000) ->> 'product_id')::uuid;
insert into tests.ids select 'p_ref', tests.buy(tests.id('biz_a'), tests.id('ref'), 10, 1000, 1000);   -- the 3-step example
insert into tests.ids select 'p_part', tests.buy(tests.id('biz_a'), tests.id('ref'), 10, 1000, 400);   -- owes 600
insert into tests.ids select 'mix', (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Mixed item', 1000) ->> 'product_id')::uuid;
insert into tests.ids select 'p_mix', tests.buy(tests.id('biz_a'), tests.id('mix'), 10, 5000, 0);
-- limits (U4): a zero-cost purchase and a GH₵1,000,000 purchase
insert into tests.ids select 'lim', (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Limit item', 1000) ->> 'product_id')::uuid;
insert into tests.ids select 'p_zero', tests.buy(tests.id('biz_a'), tests.id('lim'), 1, 0, 0);
insert into tests.ids select 'p_max', tests.buy(tests.id('biz_a'), tests.id('lim'), 1, 100000000, 0);
insert into tests.ids select 'p_small', tests.buy(tests.id('biz_a'), tests.id('lim'), 1, 1000, 0);
-- general (validation, archived, idempotency)
insert into tests.ids select 'gen', (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'General item', 1000) ->> 'product_id')::uuid;
insert into tests.ids select 'p_gen', tests.buy(tests.id('biz_a'), tests.id('gen'), 10, 1000, 0);
insert into tests.ids select 'arch', (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Old torch', 1000) ->> 'product_id')::uuid;
insert into tests.ids select 'p_arch', tests.buy(tests.id('biz_a'), tests.id('arch'), 3, 300, 0);
insert into tests.ids select 'gone', (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Gone item', 1000) ->> 'product_id')::uuid;
insert into tests.ids select 'p_gone', tests.buy(tests.id('biz_a'), tests.id('gone'), 3, 300, 0);
insert into tests.ids select 'a2_prod', tests.mkp(tests.id('biz_a2'), 'Second shop oil', 700, 3);
insert into tests.ids select 'p_a2', tests.buy(tests.id('biz_a2'), tests.id('a2_prod'), 1, 700, 0);
select public.set_product_archived(gen_random_uuid(), tests.id('biz_a'), tests.id('arch'), true);
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
update public.products set deleted_at = now() where id = tests.id('gone');
-- Fixture sales (Stage 1D brings real ones): one recorded now, one that happened an hour before
insert into tests.ids values ('sale', 'd0000000-0000-0000-0000-000000000001'), ('sale_late', 'd0000000-0000-0000-0000-000000000002');
insert into public.sales (id, business_id, device_id, receipt_no, subtotal, total, payment_method, mode,
                          occurred_at_device, occurred_at, time_confidence, cost_basis, payload_version)
values (tests.id('sale'), tests.id('biz_a'), tests.id('dev_a'), 'A-000001', 100, 100, 'cash', 'online', now(), now(), 'high', 'occurred_at', 1),
       (tests.id('sale_late'), tests.id('biz_a'), tests.id('dev_a'), 'A-000002', 100, 100, 'cash', 'offline',
        now() - interval '1 hour', now() - interval '1 hour', 'high', 'occurred_at', 1);

-- Worked-example history after P: sale 5, own use 1, purchase of 6 (6000), sale 4 -> 16 / 14880
select tests.out(tests.id('biz_a'), tests.id('wk'), 'sale', 5, p_sale => tests.id('sale'));
select tests.out(tests.id('biz_a'), tests.id('wk'), 'adjustment', 1, 'own_use');
set local role authenticated;
select tests.buy(tests.id('biz_a'), tests.id('wk'), 6, 6000, 6000);
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
select tests.out(tests.id('biz_a'), tests.id('wk'), 'sale', 4, p_sale => tests.id('sale'));
-- f = 0: all 4 sold
select tests.out(tests.id('biz_a'), tests.id('f0'), 'sale', 4, p_sale => tests.id('sale'));
-- thirds: damaged 1 (L 1/3), own use 1 (U 1/3), return 1 (T 1/3, to 0)
select tests.out(tests.id('biz_a'), tests.id('thirds'), 'adjustment', 1, 'damaged');
select tests.out(tests.id('biz_a'), tests.id('thirds'), 'adjustment', 1, 'own_use');
select tests.out(tests.id('biz_a'), tests.id('thirds'), 'supplier_return', 1);
-- halves: damaged 1 of 2 (L 1/2, f 1/2)
select tests.out(tests.id('biz_a'), tests.id('halves'), 'adjustment', 1, 'damaged');
-- kinds: damaged 1 (L 1/10), own use 1 (U 1/10), return 2 (T 2/10), sale 2 (S 2/10), found +2 (inflow),
-- count correction down 3 of 6 (L + 2/10): f = 2/10
select tests.out(tests.id('biz_a'), tests.id('kinds'), 'adjustment', 1, 'damaged');
select tests.out(tests.id('biz_a'), tests.id('kinds'), 'adjustment', 1, 'own_use');
select tests.out(tests.id('biz_a'), tests.id('kinds'), 'supplier_return', 2);
select tests.out(tests.id('biz_a'), tests.id('kinds'), 'sale', 2, p_sale => tests.id('sale'));
select private.apply_movement(tests.id('biz_a'), tests.id('kinds'), 'adjustment', 2, 200, p_reason => 'count_correction');
select tests.out(tests.id('biz_a'), tests.id('kinds'), 'adjustment', 3, 'count_correction');
-- void after the purchase; sold past 0 (negative stock); a late-uploaded sale
select tests.out(tests.id('biz_a'), tests.id('av'), 'sale', 1, p_sale => tests.id('sale'));
select private.apply_movement(tests.id('biz_a'), tests.id('av'), 'void', 1, 100, p_sale_id => tests.id('sale'));
select tests.out(tests.id('biz_a'), tests.id('an'), 'sale', 3, p_sale => tests.id('sale'));            -- 2 -> -1
select tests.out(tests.id('biz_a'), tests.id('al'), 'sale', 1, p_sale => tests.id('sale_late'));
-- bought while stock was negative: 2 / 2000 oversold to -2 / -2000, then P_bn (5 for 5000; T5 revalues
-- the -2 at the purchase's unit cost first, C-25); no movements after P_bn
insert into tests.ids select 'bn', tests.mkp(tests.id('biz_a'), 'Bought-while-negative item', 1000, 2);
select tests.out(tests.id('biz_a'), tests.id('bn'), 'sale', 4, p_sale => tests.id('sale'));
set local role authenticated;
insert into tests.ids select 'p_bn', tests.buy(tests.id('biz_a'), tests.id('bn'), 5, 5000, 0);
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
-- other purchases' quantity corrections: aq2 decreased by 2 (outflow, U3); ai2 increased by 2 (inflow)
set local role authenticated;
insert into tests.results select 'aq2_qc', tests.qc(tests.id('biz_a'), tests.id('p_aq2'), -2);
insert into tests.results select 'ai2_qc', tests.qc(tests.id('biz_a'), tests.id('p_ai2'), 2);
insert into tests.results select 'ao2_qc', tests.qc(tests.id('biz_a'), tests.id('p_ao2'), -2);
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
create temp table purchases_before as select id, to_jsonb(p) as row from public.purchases p;
grant select on purchases_before to authenticated;

-- ===========================================================================
-- Definition, privileges and the extended helper (C2)
-- ===========================================================================
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc
           where oid = 'public.correct_purchase(uuid,uuid,uuid,text,text,bigint,integer,bigint,text)'::regprocedure),
  'TC-INV-101a: correct_purchase exists, SECURITY DEFINER with explicit checks and an empty search_path');
select ok(has_function_privilege('authenticated', 'public.correct_purchase(uuid,uuid,uuid,text,text,bigint,integer,bigint,text)', 'execute')
          and not has_function_privilege('anon', 'public.correct_purchase(uuid,uuid,uuid,text,text,bigint,integer,bigint,text)', 'execute')
          and not exists (select 1 from information_schema.routine_privileges
                          where routine_schema = 'public' and routine_name = 'correct_purchase' and grantee = 'PUBLIC'),
  'TC-INV-101b: signed-in users can call it; anonymous callers and PUBLIC cannot');
select ok(to_regprocedure('private.purchase_unpaid(uuid,uuid)') is not null
          and (select count(*) = 1 from pg_proc where proname = 'purchase_unpaid')
          and (select prorettype = 'bigint'::regtype and provolatile = 's' from pg_proc where oid = 'private.purchase_unpaid(uuid,uuid)'::regprocedure)
          and not has_function_privilege('authenticated', 'private.purchase_unpaid(uuid,uuid)', 'execute')
          and not has_function_privilege('anon', 'private.purchase_unpaid(uuid,uuid)', 'execute')
          and not has_function_privilege('authenticated', 'private.round_half_up_ratio(numeric,numeric)', 'execute'),
  'TC-INV-101c (C2): the extended helper keeps its signature (one function, bigint, stable) and stays internal');
select ok(not has_table_privilege('authenticated', 'public.purchase_corrections', 'insert')
          and not has_table_privilege('authenticated', 'public.stock_movements', 'insert'),
  'TC-INV-101d: the app cannot write corrections or movements directly');

-- ===========================================================================
-- TC-PUR-12: the worked example of 05 §12.2
-- ===========================================================================
select is(tests.pv(tests.id('wk')), '16 / 14880', 'TC-PUR-12: (setup) the history leaves 16 / 148.80, as in 05 §12.2');
set local role authenticated;
insert into tests.results select 'wk', public.correct_purchase('44444444-4444-4444-4444-444444444401', tests.id('biz_a'), tests.id('p_wk'),
  'cost', '  Invoice was GH₵120  ', p_cost_change => 2000);
reset role;
select ok(tests.part(tests.r('wk'), 'already_sold') = 780 and tests.part(tests.r('wk'), 'own_use') = 100
          and tests.part(tests.r('wk'), 'remaining_stock') = 1120 and tests.part(tests.r('wk'), 'stock_losses') = 0
          and tests.part(tests.r('wk'), 'returns_to_supplier') = 0,
  'TC-PUR-12 (C-116b): +2000 splits into 780 already sold, 100 own use, 1120 remaining stock');
select is(tests.pv(tests.id('wk')), '16 / 16000', 'TC-PUR-12 (C1): stock becomes 16 / 160.00, as a full recalculation gives');
select ok(tests.r('wk') -> 'allocation' -> 'remaining_fraction' = '{"num":"14","den":"25"}'::jsonb
          and tests.r('wk') -> 'allocation' -> 'shares' -> 'already_sold' = '{"num":"39","den":"100"}'::jsonb
          and tests.r('wk') -> 'allocation' -> 'shares' -> 'own_use' = '{"num":"1","den":"20"}'::jsonb
          and (tests.r('wk') -> 'allocation' ->> 'exact')::boolean and tests.r('wk') -> 'allocation' -> 'reasons' = '[]'::jsonb,
  'TC-PUR-12 (Q10): exact rationals f = 14/25 (0.56), sold 39/100, own use 1/20; the allocation is exact');
select ok((select count(*) = 1 and bool_and(m.type = 'purchase_correction' and m.qty_change = 0 and m.value = 1120
                  and m.purchase_id = tests.id('p_wk') and m.id = (tests.r('wk') ->> 'movement_id')::uuid
                  and m.id = (tests.r('wk') -> 'allocation' ->> 'movement_id')::uuid and m.note = 'Invoice was GH₵120')
           from public.stock_movements m where m.product_id = tests.id('wk') and m.type = 'purchase_correction'),
  'TC-INV-102a (C1, Q9): ONE purchase_correction movement carries R = 1120; its ID is in the allocation');
select ok((select count(*) = 1 and bool_and(cause = 'purchase_correction' and stock_qty_after = 16 and stock_value_after = 16000)
           from public.product_cost_history where movement_id = (tests.r('wk') ->> 'movement_id')::uuid),
  'TC-INV-102b: one history row, cause purchase_correction');
select ok((select type = 'cost' and cost_change = 2000 and qty_change = 0 and reason = 'Invoice was GH₵120' and allocation_exact
                  and approximation_reasons is null and refund_amount = 0 and refund_method is null
                  and allocation = tests.r('wk') -> 'allocation' and user_id = '00000000-0000-0000-0000-0000000000a1'
           from public.purchase_corrections where id = (tests.r('wk') ->> 'correction_id')::uuid),
  'TC-INV-102c: the correction row stores ΔC, the trimmed reason and the allocation');
select ok(tests.r('wk') @> '{"unpaid_before":10000,"unpaid_after":12000,"corrected_cost":12000,"stock_qty":16,"stock_value":16000}'
          and tests.unpaid(tests.id('biz_a'), tests.id('p_wk')) = 12000,
  'TC-PUR-12 (C-116e): the amount owed rises by ΔC: 10000 -> 12000');
select ok((select count(*) = 1 and bool_and(type = 'purchase_correction' and entity = 'purchase_correction' and status = 'open'
                  and message_data @> '{"rule":"C-116","cost_change":2000,"parts":{"already_sold":780,"own_use":100,"remaining_stock":1120}}')
           from public.attention_items where entity_id = (tests.r('wk') ->> 'correction_id')::uuid),
  'TC-INV-102d (C-116d, Q8): ONE Needs attention item lists each part');
select ok((select count(*) = 1 and bool_and(entity = 'purchase_correction'
                  and after -> 'allocation' = tests.r('wk') -> 'allocation'
                  and after ->> 'movement_id' = tests.r('wk') ->> 'movement_id' and reason = 'Invoice was GH₵120'
                  and (before ->> 'unpaid')::bigint = 10000 and (after ->> 'unpaid')::bigint = 12000)
           from public.audit_log where action = 'correct_purchase' and entity_id = (tests.r('wk') ->> 'correction_id')::uuid),
  'TC-INV-102e (SEC-21, Q9): one audit entry with the allocation, the movement ID and the amount owed before and after');
select ok((select bool_and(p.row = b.row) from purchases_before b join public.purchases pu on pu.id = b.id
           cross join lateral (select to_jsonb(pu) as row) p),
  'TC-PUR-14 (C-116): no purchase row was edited');

-- ===========================================================================
-- TC-PUR-05 (f = 1), TC-PUR-06 (f = 0), rounding (C-116c)
-- ===========================================================================
set local role authenticated;
insert into tests.results select 'f1', tests.cc(tests.id('biz_a'), tests.id('p_f1'), 600);
insert into tests.results select 'f0', tests.cc(tests.id('biz_a'), tests.id('p_f0'), 400);
insert into tests.results select 'thirds', tests.cc(tests.id('biz_a'), tests.id('p_thirds'), 100);
insert into tests.results select 'halves', tests.cc(tests.id('biz_a'), tests.id('p_halves'), 1);
insert into tests.results select 'halves_neg', tests.cc(tests.id('biz_a'), tests.id('p_halves'), -1);
reset role;
select ok(tests.part(tests.r('f1'), 'remaining_stock') = 600 and tests.r('f1') -> 'allocation' -> 'remaining_fraction' = '{"num":"1","den":"1"}'
          and tests.pv(tests.id('f1')) = '10 / 5600' and tests.unpaid(tests.id('biz_a'), tests.id('p_f1')) = 600,
  'TC-PUR-05: no units consumed: f = 1, all 600 to stock value (10 / 5600), owed 0 + 600');
select ok(tests.part(tests.r('f0'), 'already_sold') = 400 and tests.part(tests.r('f0'), 'remaining_stock') = 0
          and tests.r('f0') ->> 'movement_id' is null and tests.pv(tests.id('f0')) = '0 / 0'
          and not exists (select 1 from public.stock_movements where product_id = tests.id('f0') and type = 'purchase_correction'),
  'TC-PUR-06: all sold: f = 0, all 400 already sold, no movement, stock untouched');
select ok((select message_data @> '{"parts":{"already_sold":400,"remaining_stock":0}}' from public.attention_items
           where entity_id = (tests.r('f0') ->> 'correction_id')::uuid),
  'TC-PUR-06 (C-122): the attention item lists the parts');
select ok(tests.r('thirds') -> 'allocation' -> 'parts' = '{"remaining_stock":0,"already_sold":1,"stock_losses":33,"own_use":33,"returns_to_supplier":33}'
          and (tests.r('thirds') -> 'allocation' ->> 'rounding_leftover')::int = 1,
  'TC-INV-103a (C-116c): thirds of 100 round to 33 each; with f = 0 the leftover pesewa goes to already sold');
select ok(tests.r('halves') -> 'allocation' -> 'parts' = '{"remaining_stock":0,"already_sold":0,"stock_losses":1,"own_use":0,"returns_to_supplier":0}'
          and (tests.r('halves') -> 'allocation' ->> 'rounding_leftover')::int = -1 and tests.r('halves') ->> 'movement_id' is null,
  'TC-INV-103b (C-116c): halves of +1 both round up to 1; the -1 leftover goes to remaining stock, leaving R = 0 and no movement');
select ok(tests.r('halves_neg') -> 'allocation' -> 'parts' = '{"remaining_stock":0,"already_sold":0,"stock_losses":-1,"own_use":0,"returns_to_supplier":0}',
  'TC-INV-103c (C-116c): halves of -1 round away from zero; parts still add up to ΔC');
select ok((select bool_and((allocation -> 'parts' ->> 'remaining_stock')::bigint + (allocation -> 'parts' ->> 'already_sold')::bigint
                  + (allocation -> 'parts' ->> 'stock_losses')::bigint + (allocation -> 'parts' ->> 'own_use')::bigint
                  + (allocation -> 'parts' ->> 'returns_to_supplier')::bigint = cost_change)
           from public.purchase_corrections where type = 'cost' and business_id = tests.id('biz_a')),
  'TC-PUR-14 (C-116c): for every cost correction the parts add up to ΔC exactly');

-- ===========================================================================
-- Outflow kinds (§4.2) and approximation flags (L8, Q3, U3)
-- ===========================================================================
set local role authenticated;
insert into tests.results select 'kinds', tests.cc(tests.id('biz_a'), tests.id('p_kinds'), 1000);
reset role;
select ok(tests.r('kinds') -> 'allocation' -> 'parts' = '{"remaining_stock":200,"already_sold":200,"stock_losses":300,"own_use":100,"returns_to_supplier":200}'
          and (tests.r('kinds') -> 'allocation' ->> 'exact')::boolean,
  'TC-INV-104a (C-116a): damaged, own use, return, sale, stock found, count down: 200 / 200 / 300 / 100 / 200, exact');
set local role authenticated;
insert into tests.results select 'av', tests.cc(tests.id('biz_a'), tests.id('p_av'), 100);
insert into tests.results select 'an', tests.cc(tests.id('biz_a'), tests.id('p_an'), 100);
insert into tests.results select 'al', tests.cc(tests.id('biz_a'), tests.id('p_al'), 100);
insert into tests.results select 'aq_self_qc', tests.qc(tests.id('biz_a'), tests.id('p_aq'), -1);
insert into tests.results select 'aq', tests.cc(tests.id('biz_a'), tests.id('p_aq'), 800);
insert into tests.results select 'ai', tests.cc(tests.id('biz_a'), tests.id('p_ai'), 800);
insert into tests.results select 'ao', tests.cc(tests.id('biz_a'), tests.id('p_ao'), 800);
reset role;
select ok(tests.r('av') -> 'allocation' -> 'reasons' = '["void"]' and not (tests.r('av') -> 'allocation' ->> 'exact')::boolean
          and (select not allocation_exact and approximation_reasons = '{void}' from public.purchase_corrections where id = (tests.r('av') ->> 'correction_id')::uuid),
  'TC-INV-104b (L8): a void after the purchase flags the allocation approximate (void)');
select ok(tests.r('an') -> 'allocation' -> 'reasons' = '["negative_stock"]' and tests.part(tests.r('an'), 'already_sold') = 100,
  'TC-INV-104c (L8): stock sold below 0 takes all of f and flags negative_stock');
set local role authenticated;
insert into tests.results select 'bn_before', jsonb_build_object('pv', tests.pv(tests.id('bn')));
insert into tests.results select 'bn', tests.cc(tests.id('biz_a'), tests.id('p_bn'), 500);
reset role;
select ok(tests.r('bn') -> 'allocation' -> 'reasons' = '["negative_stock"]' and not (tests.r('bn') -> 'allocation' ->> 'exact')::boolean
          and tests.r('bn') -> 'allocation' -> 'remaining_fraction' = '{"num":"1","den":"1"}'
          and tests.r('bn') -> 'allocation' -> 'parts' = '{"remaining_stock":500,"already_sold":0,"stock_losses":0,"own_use":0,"returns_to_supplier":0}'
          and tests.r('bn_before') ->> 'pv' = '3 / 3000' and tests.pv(tests.id('bn')) = '3 / 3500',
  'TC-INV-104g (L8): a purchase made while stock was negative only sets the negative_stock flag: f stays 1 (C-116a), the amounts are the plain C-116b split (all 500 to stock: 3 / 3000 -> 3 / 3500), conservation unchanged');
select ok(tests.r('al') -> 'allocation' -> 'reasons' = '["late_upload"]' and tests.part(tests.r('al'), 'already_sold') = 25,
  'TC-INV-104d (L8): a sale recorded after the purchase but made before it flags late_upload');
-- aq: purchases aq (4) and aq2 (4) -> 8; aq2 decreased by 2 (outflow at 8: L = 2/8, f = 6/8); aq itself decreased by 1 (ignored)
select ok(tests.r('aq') -> 'allocation' -> 'reasons' = '["quantity_correction"]'
          and tests.part(tests.r('aq'), 'stock_losses') = 200 and tests.part(tests.r('aq'), 'remaining_stock') = 600
          and (tests.r('aq') -> 'allocation' ->> 'stock_losses_include_quantity_corrections')::boolean,
  'TC-INV-104e (Q3, U3): another purchase''s decrease is an outflow to stock losses (accounting allocation, marked); this purchase''s own quantity correction is ignored for f; approximate');
select ok(tests.r('ao') -> 'allocation' -> 'reasons' = '["quantity_correction"]' and not (tests.r('ao') -> 'allocation' ->> 'exact')::boolean
          and tests.part(tests.r('ao'), 'stock_losses') = 200 and tests.part(tests.r('ao'), 'remaining_stock') = 600
          and (tests.r('ao') -> 'allocation' ->> 'stock_losses_include_quantity_corrections')::boolean,
  'TC-INV-104h (U3): ONLY another purchase''s decrease (no correction of this purchase): stock losses 200 as an accounting allocation, flagged approximate');
select ok(tests.r('ai') -> 'allocation' -> 'reasons' = '[]' and (tests.r('ai') -> 'allocation' ->> 'exact')::boolean
          and tests.part(tests.r('ai'), 'remaining_stock') = 800
          and not (tests.r('ai') -> 'allocation' ->> 'stock_losses_include_quantity_corrections')::boolean,
  'TC-INV-104f (U3): another purchase''s quantity INCREASE is an ordinary inflow: no flag, exact, all to stock');

-- ===========================================================================
-- Quantity corrections (C-116f, Q4, Q5, U2)
-- ===========================================================================
set local role authenticated;
insert into tests.results select 'q_up', tests.qc(tests.id('biz_a'), tests.id('p_qty'), 2);
insert into tests.results select 'q_down', tests.qc(tests.id('biz_a'), tests.id('p_qty'), -4);
select throws_ok($q$select tests.qc(tests.id('biz_a'), tests.id('p_qty'), -9)$q$, '22023', 'invalid_corrected_qty',
  'TC-INV-105a (Q5): 10 + 2 - 4 - 9 = -1 received is refused (at least 1)');
select throws_ok($q$select tests.qc(tests.id('biz_a'), tests.id('p_qz'), -3)$q$, '22023', 'invalid_corrected_qty',
  'TC-INV-105b (Q5): a corrected quantity of 0 is refused even though the stock would allow it');
insert into tests.results select 'q_zero', tests.qc(tests.id('biz_a'), tests.id('p_qz'), -2);
select throws_ok($q$select tests.qc(tests.id('biz_a'), tests.id('p_qty'), 100001)$q$, '22023', 'invalid_qty_change', 'TC-INV-105c (D6): more than 100,000 is refused');
select throws_ok($q$select public.correct_purchase(gen_random_uuid(), tests.id('biz_a'), tests.id('p_qty'), 'quantity', 'R', p_qty_change => 1, p_refund_amount => 5, p_refund_method => 'cash')$q$,
  '22023', 'refund_not_needed', 'TC-INV-105d: a quantity correction takes no refund');
reset role;
select ok(tests.r('q_up') @> '{"qty_change":2,"corrected_qty":12,"stock_qty":12,"stock_value":1000}' and tests.unpaid(tests.id('biz_a'), tests.id('p_qty')) = 1000,
  'TC-PUR-16 (C-116f): +2 received: stock 12, value unchanged 1000 (average falls), owed unchanged');
select ok(tests.r('q_down') @> '{"corrected_qty":8,"stock_qty":8,"stock_value":1000}'
          and (tests.r('q_down') -> 'allocation' ->> 'average_after')::numeric = 125,
  'TC-PUR-16: -4: stock 8 / 1000, average 125.0000 recorded');
select ok(tests.r('q_zero') @> '{"corrected_qty":1}' and tests.pv(tests.id('qz')) = '1 / 1000',
  'TC-INV-105e: (setup) Zero item now 1 / 1000');
set local role authenticated;
select throws_ok($q$select tests.qc(tests.id('biz_a'), tests.id('p_qz'), -2)$q$, '22023', 'invalid_corrected_qty',
  'TC-INV-105f (Q5): the purchase''s corrected quantity cannot go below 1');
insert into tests.ids select 'p_qz2', tests.buy(tests.id('biz_a'), tests.id('qz'), 5, 0, 0);   -- 6 / 1000
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
select tests.out(tests.id('biz_a'), tests.id('qz'), 'adjustment', 4, 'damaged');               -- 2 / 333 (fixture, as the superuser)
set local role authenticated;
insert into tests.results select 'q_to0', tests.qc(tests.id('biz_a'), tests.id('p_qz2'), -2);
select throws_ok($q$select tests.qc(tests.id('biz_a'), tests.id('p_qz2'), -1)$q$, '22023', 'insufficient_stock',
  'TC-INV-105g (Q4, U2): below 0 is refused');
reset role;
select ok(tests.r('q_to0') @> '{"stock_qty":0,"stock_value":0}'
          and tests.r('q_to0') -> 'allocation' -> 'pool_adjustment' @> '{"reason":"zero_stock_residue","value":-333}',
  'TC-INV-105h (U2, C-25a): a decrease to exactly 0 is allowed; T1 posts the 333 left over as a zero-stock residue');
select ok((select count(*) = 1 from public.attention_items where entity = 'purchase_correction' and entity_id = (tests.r('q_to0') ->> 'correction_id')::uuid)
          and (select count(*) = 1 from public.attention_items where type = 'cost_adjustment'
               and entity_id = (tests.r('q_to0') -> 'allocation' -> 'pool_adjustment' ->> 'movement_id')::uuid),
  'TC-INV-105i (Q8, TC-ATTN-02): the correction''s own item plus T1''s residue item (333 >= GH₵0.10)');
select ok((select count(*) = 3 and bool_and(qty_change <> 0 and value = 0) from public.stock_movements
           where id in (select (r ->> 'movement_id')::uuid from tests.results where k in ('q_up','q_down','q_to0'))),
  'TC-PUR-16: each quantity correction is ONE purchase_correction movement with no value');

-- ===========================================================================
-- Refunds and the amount owed (C2, Q6): the three-step example (§5.2)
-- ===========================================================================
select is(tests.unpaid(tests.id('biz_a'), tests.id('p_ref')), 0::bigint, 'TC-INV-106a: step 1: cost 1000, paid 1000: nothing owed');
set local role authenticated;
select throws_ok($q$select tests.cc(tests.id('biz_a'), tests.id('p_ref'), -300)$q$, '22023', 'refund_required',
  'TC-PUR-15 (C-116e): a -300 reduction when nothing is owed requires a refund');
select throws_ok($q$select tests.cc(tests.id('biz_a'), tests.id('p_ref'), -300, 299, 'cash')$q$, '22023', 'refund_required',
  'TC-INV-106b (Q6): a refund of 299 is not exactly the 300 excess');
select throws_ok($q$select tests.cc(tests.id('biz_a'), tests.id('p_ref'), -300, 301, 'cash')$q$, '22023', 'refund_required',
  'TC-INV-106c (Q6): a refund of 301 is not exactly the excess either');
select throws_ok($q$select tests.cc(tests.id('biz_a'), tests.id('p_ref'), -300, 300, 'bank')$q$, '22023', 'invalid_refund_method',
  'TC-INV-106d: the refund method must be cash or MoMo');
select throws_ok($q$select tests.cc(tests.id('biz_a'), tests.id('p_ref'), -300, 300, null)$q$, '22023', 'invalid_refund_method',
  'TC-INV-106e: a refund needs a method');
insert into tests.results select 'ref2', tests.cc(tests.id('biz_a'), tests.id('p_ref'), -300, 300, 'cash');
select throws_ok($q$select tests.cc(tests.id('biz_a'), tests.id('p_ref'), 200, 50, 'cash')$q$, '22023', 'refund_not_needed',
  'TC-INV-106f (Q6): a refund is refused when nothing is overpaid');
insert into tests.results select 'ref3', tests.cc(tests.id('biz_a'), tests.id('p_ref'), 200);
reset role;
select ok(tests.r('ref2') @> '{"refund_amount":300,"refund_method":"cash","unpaid_before":0,"unpaid_after":0}'
          and (select refund_amount = 300 and refund_method = 'cash' from public.purchase_corrections where id = (tests.r('ref2') ->> 'correction_id')::uuid),
  'TC-PUR-15 / TC-INV-106g: step 2: -300 with exactly 300 refunded in cash: owed stays 0 (not -300)');
select ok(tests.r('ref3') @> '{"unpaid_before":0,"unpaid_after":200,"corrected_cost":900}' and tests.unpaid(tests.id('biz_a'), tests.id('p_ref')) = 200,
  'TC-INV-106h (C2): step 3: +200 later: GH₵2.00 owed (cost 9.00, net paid 10.00 - 3.00 = 7.00)');
set local role authenticated;
select throws_ok($q$select public.pay_supplier(gen_random_uuid(), tests.id('biz_a'), tests.id('p_ref'), 201, 'momo')$q$, '22023', 'amount_exceeds_unpaid',
  'TC-INV-106i (T7): pay_supplier sees the revised figure: 201 is refused');
insert into tests.results select 'ref_pay', public.pay_supplier(gen_random_uuid(), tests.id('biz_a'), tests.id('p_ref'), 200, 'momo');
-- partial excess: owes 600, -800 -> excess 200
insert into tests.results select 'part', tests.cc(tests.id('biz_a'), tests.id('p_part'), -800, 200, 'momo');
reset role;
select ok(tests.r('ref_pay') @> '{"unpaid_before":200,"unpaid_after":0}', 'TC-INV-106j: and exactly 200 pays it off');
select ok(tests.r('part') @> '{"refund_amount":200,"refund_method":"momo","unpaid_before":600,"unpaid_after":0}',
  'TC-INV-106k (Q6): owes 600, a -800 correction needs exactly the 200 excess back: owed 0');
-- Payments, credits, returns and corrections together; T8 refunds excluded
set local role authenticated;
select public.pay_supplier(gen_random_uuid(), tests.id('biz_a'), tests.id('p_mix'), 1000, 'cash_drawer');
select public.return_to_supplier(gen_random_uuid(), tests.id('biz_a'), tests.id('mix'), 1, 500, 'reduce_unpaid', 'Credit', tests.id('p_mix'));
select public.return_to_supplier(gen_random_uuid(), tests.id('biz_a'), tests.id('mix'), 1, 500, 'refund_cash', 'Cash back', tests.id('p_mix'));
insert into tests.results select 'mix_up', tests.cc(tests.id('biz_a'), tests.id('p_mix'), 1000);
insert into tests.results select 'mix_down', tests.cc(tests.id('biz_a'), tests.id('p_mix'), -4600, 100, 'cash');
reset role;
select ok(tests.r('mix_up') @> '{"unpaid_before":3500,"unpaid_after":4500}',
  'TC-INV-106l (C2): 5000 - 1000 paid - 500 credit (the 500 cash return refund is NOT counted) + 1000 = 4500');
select ok(tests.r('mix_down') @> '{"refund_amount":100,"unpaid_after":0}' and tests.unpaid(tests.id('biz_a'), tests.id('p_mix')) = 0,
  'TC-INV-106m (C2, Q6): -4600 needs exactly the 100 excess back; owed 0');
select is((tests.r('mix_up') -> 'allocation' -> 'shares' -> 'returns_to_supplier'), '{"num":"1","den":"5"}'::jsonb,
  'TC-INV-106n (T8): the two returns (2 of 10) are the returns-to-supplier share');
select is(tests.unpaid(tests.id('biz_b'), tests.id('p_mix')), null::bigint, 'TC-INV-106o: the helper is scoped to the shop');

-- ===========================================================================
-- Limits (U4) and attention for a 1-pesewa correction (Q8)
-- ===========================================================================
set local role authenticated;
select throws_ok($q$select tests.cc(tests.id('biz_a'), tests.id('p_zero'), 100000001)$q$, '22023', 'invalid_cost_change',
  'TC-INV-107a (U4): abs(ΔC) of 100,000,001 pesewas is refused');
select throws_ok($q$select tests.cc(tests.id('biz_a'), tests.id('p_max'), -100000001)$q$, '22023', 'invalid_cost_change',
  'TC-INV-107b (U4): abs(ΔC) of -100,000,001 is refused');
insert into tests.results select 'lim_up', tests.cc(tests.id('biz_a'), tests.id('p_zero'), 100000000);
select throws_ok($q$select tests.cc(tests.id('biz_a'), tests.id('p_max'), 1)$q$, '22023', 'invalid_corrected_cost',
  'TC-INV-107c (U4): a corrected cost of 100,000,001 is refused');
select throws_ok($q$select tests.cc(tests.id('biz_a'), tests.id('p_small'), -1001)$q$, '22023', 'invalid_corrected_cost',
  'TC-INV-107d (C-110): a corrected cost below 0 is refused');
insert into tests.results select 'lim_down', tests.cc(tests.id('biz_a'), tests.id('p_max'), -100000000);
insert into tests.results select 'one', tests.cc(tests.id('biz_a'), tests.id('p_small'), 1);
insert into tests.results select 'one_neg', tests.cc(tests.id('biz_a'), tests.id('p_small'), -1);
reset role;
select ok(tests.r('lim_up') @> '{"corrected_cost":100000000}' and tests.r('lim_down') @> '{"corrected_cost":0,"refund_amount":0}',
  'TC-INV-107e (U4): exactly 100,000,000 (up to the limit, and back down to 0) is accepted');
select ok((select count(*) = 1 from public.attention_items where entity = 'purchase_correction' and entity_id = (tests.r('one') ->> 'correction_id')::uuid)
          and (select count(*) = 1 from public.attention_items where entity = 'purchase_correction' and entity_id = (tests.r('one_neg') ->> 'correction_id')::uuid),
  'TC-INV-107f (Q8): a correction of +1 or -1 pesewa still gets exactly one item (no GH₵0.10 threshold)');
select is((select count(*)::int from public.attention_items where business_id = tests.id('biz_a') and entity = 'purchase_correction'),
          (select count(*)::int from public.purchase_corrections where business_id = tests.id('biz_a')),
  'TC-INV-107g (Q8): exactly one item per correction');

-- ===========================================================================
-- Validation, archived (Q7), deleted, isolation
-- ===========================================================================
set local role authenticated;
select throws_ok($q$select public.correct_purchase(gen_random_uuid(), tests.id('biz_a'), tests.id('p_gen'), 'price', 'R', p_cost_change => 1)$q$, '22023', 'invalid_correction_type', 'TC-INV-108a: an unknown type is refused');
select throws_ok($q$select public.correct_purchase(gen_random_uuid(), tests.id('biz_a'), tests.id('p_gen'), null, 'R', p_cost_change => 1)$q$, '22023', 'invalid_correction_type', 'TC-INV-108b: a missing type is refused');
select throws_ok($q$select public.correct_purchase(gen_random_uuid(), tests.id('biz_a'), tests.id('p_gen'), 'cost', 'R', p_cost_change => 1, p_qty_change => 1)$q$, '22023', 'change_mismatch', 'TC-INV-108c: a cost correction with a quantity change is refused');
select throws_ok($q$select public.correct_purchase(gen_random_uuid(), tests.id('biz_a'), tests.id('p_gen'), 'quantity', 'R', p_cost_change => 1, p_qty_change => 1)$q$, '22023', 'change_mismatch', 'TC-INV-108d: a quantity correction with a cost change is refused');
select throws_ok($q$select tests.cc(tests.id('biz_a'), tests.id('p_gen'), 0)$q$, '22023', 'invalid_cost_change', 'TC-INV-108e: ΔC = 0 is refused');
select throws_ok($q$select tests.cc(tests.id('biz_a'), tests.id('p_gen'), null)$q$, '22023', 'invalid_cost_change', 'TC-INV-108f: a missing ΔC is refused');
select throws_ok($q$select tests.qc(tests.id('biz_a'), tests.id('p_gen'), 0)$q$, '22023', 'invalid_qty_change', 'TC-INV-108g: Δq = 0 is refused');
select throws_ok($q$select tests.qc(tests.id('biz_a'), tests.id('p_gen'), null)$q$, '22023', 'invalid_qty_change', 'TC-INV-108h: a missing Δq is refused');
select throws_ok($q$select tests.cc(tests.id('biz_a'), tests.id('p_gen'), 1, p_reason => '   ')$q$, '22023', 'reason_required', 'TC-INV-108i: a blank reason is refused');
select throws_ok(format('select tests.cc(tests.id(''biz_a''), tests.id(''p_gen''), 1, p_reason => %L)', repeat('r', 301)), '22023', 'reason_too_long', 'TC-INV-108j: a reason over 300 characters is refused');
select throws_ok($q$select tests.cc(tests.id('biz_a'), tests.id('p_gen'), -1, -5, 'cash')$q$, '22023', 'invalid_refund_amount', 'TC-INV-108k: a negative refund is refused');
select throws_ok($q$select tests.cc(tests.id('biz_a'), gen_random_uuid(), 1)$q$, 'P0002', 'purchase_not_found', 'TC-INV-108l: an unknown purchase is not found');
select throws_ok($q$select tests.cc(tests.id('biz_a'), tests.id('p_a2'), 1)$q$, 'P0002', 'purchase_not_found', 'TC-INV-108m: another shop''s purchase is not found');
select throws_ok($q$select tests.cc(tests.id('biz_a'), tests.id('p_gone'), 1)$q$, 'P0002', 'product_not_found', 'TC-INV-108n: a deleted product''s purchase is not found');
insert into tests.results select 'arch', tests.cc(tests.id('biz_a'), tests.id('p_arch'), 300);
reset role;
select ok(tests.r('arch') @> '{"stock_value":600}' and (select not active from public.products where id = tests.id('arch')),
  'TC-INV-108o (Q7): an archived product''s purchase can be corrected; the product stays archived');
select is(tests.pv(tests.id('gen')), '10 / 1000', 'TC-INV-108p: the refused attempts changed nothing');

select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select throws_ok($q$select tests.cc(tests.id('biz_a'), tests.id('p_gen'), 1)$q$, '42501', 'not_a_member', 'TC-INV-109a: owner B cannot correct through shop A');
select throws_ok($q$select tests.cc(tests.id('biz_b'), tests.id('p_gen'), 1)$q$, 'P0002', 'purchase_not_found', 'TC-INV-109b: owner B cannot correct shop A''s purchase by passing their own shop');
reset role;
update public.business_members set active = false where business_id = tests.id('biz_b');
select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select throws_ok($q$select tests.cc(tests.id('biz_b'), tests.id('p_b'), 1)$q$, '42501', 'not_a_member', 'TC-INV-109c: an inactive membership cannot correct');
reset role;
update public.business_members set active = true where business_id = tests.id('biz_b');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_ok($q$select tests.cc(tests.id('biz_a'), tests.id('p_gen'), 1)$q$, '42501', 'not_authenticated', 'TC-INV-109d: a call without a signed-in user is refused');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($q$select public.correct_purchase(gen_random_uuid(), tests.id('biz_a'), tests.id('p_gen'), 'cost', 'R', p_cost_change => 1)$q$, '42501', null,
  'TC-INV-109e: an anonymous caller cannot correct');
reset role;
select ok(tests.pv(tests.id('gen')) = '10 / 1000' and tests.unpaid(tests.id('biz_a'), tests.id('p_gen')) = 1000
          and tests.unpaid(tests.id('biz_b'), tests.id('p_b')) = 240,
  'TC-INV-109f: the refused attempts changed nothing in either shop');
select tests.as_user('00000000-0000-0000-0000-0000000000a1');

-- ===========================================================================
-- Idempotency and atomicity
-- ===========================================================================
create temp table before_replay as select (select count(*) from public.purchase_corrections) as pc, (select count(*) from public.stock_movements) as mv,
  (select count(*) from public.audit_log) as audit, (select count(*) from public.attention_items) as items;
grant select on before_replay to authenticated;
set local role authenticated;
insert into tests.results select 'wk_again', public.correct_purchase('44444444-4444-4444-4444-444444444401', tests.id('biz_a'), tests.id('p_wk'),
  'cost', '  Invoice was GH₵120  ', p_cost_change => 2000);
reset role;
select is(tests.r('wk_again'), tests.r('wk'), 'TC-INV-109g: repeating the worked-example correction returns its original result');
select ok((select pc = (select count(*) from public.purchase_corrections) and mv = (select count(*) from public.stock_movements)
                  and audit = (select count(*) from public.audit_log) and items = (select count(*) from public.attention_items) from before_replay)
          and tests.pv(tests.id('wk')) = '16 / 16000' and tests.unpaid(tests.id('biz_a'), tests.id('p_wk')) = 12000,
  'TC-INV-109h: the repeat wrote nothing (a second +2000 would have been accepted, so this proves the replay)');
set local role authenticated;
select throws_ok($q$select public.correct_purchase('44444444-4444-4444-4444-444444444401', tests.id('biz_a2'), tests.id('p_a2'), 'cost', 'R', p_cost_change => 1)$q$,
  '22023', 'request_id_reused', 'TC-INV-109i: the same request ID for the owner''s other shop is refused');
select throws_ok($q$select public.adjust_stock('44444444-4444-4444-4444-444444444401', tests.id('biz_a'), tests.id('gen'), 'damaged', null, -1)$q$,
  '22023', 'request_id_reused', 'TC-INV-109j: the same request ID for a different function is refused');
select throws_ok($q$select public.correct_purchase('44444444-4444-4444-4444-444444444402', tests.id('biz_a'), tests.id('p_ref'), 'cost', 'R', p_cost_change => -100)$q$,
  '22023', 'refund_required', 'TC-INV-109k: (setup) a refused correction');
reset role;
select ok(not exists (select 1 from public.request_log where request_id = '44444444-4444-4444-4444-444444444402')
          and (select pc = (select count(*) from public.purchase_corrections) and mv = (select count(*) from public.stock_movements) from before_replay),
  'TC-INV-109l: a refused correction writes nothing at all (no claim)');

-- ===========================================================================
-- Append-only, Model A conservation, T6 / T8 behaviour unchanged
-- ===========================================================================
select throws_ok(format('update public.purchase_corrections set cost_change = 1 where id = %L', tests.r('wk') ->> 'correction_id'), 'P0001', null,
  'TC-INV-109m: a recorded correction cannot be changed');
select throws_ok(format('delete from public.purchase_corrections where id = %L', tests.r('wk') ->> 'correction_id'), 'P0001', null,
  'TC-INV-109n: a recorded correction cannot be deleted');
select ok((select bool_and(case when c.allocation ->> 'movement_id' is null
                                then (c.allocation -> 'parts' ->> 'remaining_stock')::bigint = 0
                                else (select m.value = (c.allocation -> 'parts' ->> 'remaining_stock')::bigint and m.qty_change = 0
                                      from public.stock_movements m where m.id = (c.allocation ->> 'movement_id')::uuid) end)
           from public.purchase_corrections c where c.type = 'cost' and c.business_id = tests.id('biz_a')),
  'TC-COST-20 (C1): every cost correction changed stock value by exactly R (one movement, or none when R = 0)');
select is((select count(*)::int from public.stock_movements where business_id = tests.id('biz_a')
             and (reason = 'purchase_correction_after_sale' or (type = 'purchase_correction' and qty_change = 0 and value = 0))), 0,
  'TC-COST-20 (C1): no movement was written for consumed shares');
select is((select count(*)::int from public.stock_movements m where m.business_id = tests.id('biz_a') and m.type = 'purchase_correction'),
          (select count(*)::int from public.purchase_corrections c where c.business_id = tests.id('biz_a') and c.allocation ->> 'movement_id' is not null),
  'TC-INV-109o (Q9): every purchase_correction movement belongs to exactly one correction''s allocation');
select is((select count(*)::int from public.audit_log where action = 'correct_purchase' and business_id = tests.id('biz_a')),
          (select count(*)::int from public.purchase_corrections where business_id = tests.id('biz_a')),
  'TC-INV-109p: every correction has exactly one audit entry');
select ok(tests.pool_conserved(tests.id('biz_a')) and tests.pool_conserved(tests.id('biz_a2')) and tests.pool_conserved(tests.id('biz_b')),
  'TC-COST-20 (corrections): stock pools equal their movements, one history row each, in every shop');
select is((select count(*)::int from public.attention_items a join public.supplier_returns r on r.id = a.entity_id
             where r.product_id = tests.id('mix')), 0,
  'TC-INV-109q (T8 unchanged): the two mixed-item returns at the average (D = 0) raised no C-25c item, as before');

-- ===========================================================================
-- TC-PUR-13: equivalence with a full recalculation, random in-order histories; performance (U5)
-- ===========================================================================
create temp table pur13 (k integer primary key, product uuid, purchase uuid, dc bigint, res jsonb, recalc jsonb, movements integer, ms numeric);
grant all on pur13 to authenticated;
do $$
declare k integer; i integer; prod uuid; pur uuid; q integer; op double precision; n integer; t1 timestamptz; res jsonb; dc bigint;
begin
  perform setseed(0.4242);
  for k in 1..25 loop
    prod := (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Random ' || k, 1000,
                                   p_cost_price => 50 + floor(random() * 500)::int, p_opening_stock => 5 + floor(random() * 20)::int) ->> 'product_id')::uuid;
    pur := tests.buy(tests.id('biz_a'), prod, 3 + floor(random() * 30)::int, 10000 + floor(random() * 40000)::int, 0);
    n := case when k = 25 then 2000 else 10 + floor(random() * 40)::int end;      -- the last history is long (U5)
    for i in 1..n loop
      select stock_qty into q from public.products where id = prod;
      op := random();
      if q <= 2 or op < 0.25 then
        perform tests.inn(tests.id('biz_a'), prod, 1 + floor(random() * 10)::int, floor(random() * 5000)::int);
      elsif op < 0.55 then
        perform tests.out(tests.id('biz_a'), prod, 'sale', 1 + floor(random() * (q - 1))::int, p_sale => tests.id('sale'));
      elsif op < 0.70 then
        perform tests.out(tests.id('biz_a'), prod, 'adjustment', 1 + floor(random() * least(q - 1, 3))::int, 'damaged');
      elsif op < 0.80 then
        perform tests.out(tests.id('biz_a'), prod, 'adjustment', 1, 'own_use');
      elsif op < 0.90 then
        perform tests.out(tests.id('biz_a'), prod, 'supplier_return', 1 + floor(random() * least(q - 1, 4))::int);
      else
        perform private.apply_movement(tests.id('biz_a'), prod, 'adjustment', 1 + floor(random() * 3)::int, 0, p_reason => 'count_correction');
      end if;
    end loop;
    dc := (case when random() < 0.5 then -1 else 1 end) * (1 + floor(random() * 9999)::int);
    t1 := clock_timestamp();
    res := public.correct_purchase(gen_random_uuid(), tests.id('biz_a'), pur, 'cost', 'Random check', p_cost_change => dc,
             p_refund_amount => greatest(0, -(private.purchase_unpaid(tests.id('biz_a'), pur) + dc))::bigint,
             p_refund_method => case when private.purchase_unpaid(tests.id('biz_a'), pur) + dc < 0 then 'cash' end);
    insert into pur13 values (k, prod, pur, dc, res, tests.recalc(prod, pur, dc), n,
                              round(extract(epoch from clock_timestamp() - t1)::numeric * 1000, 2));
  end loop;
end $$;
-- exact: share × ΔC equals the recalculated difference, for every part (rational cross-multiplication)
select ok((select bool_and(
             (p.res -> 'allocation' -> 'shares' -> x.part ->> 'num')::numeric * p.dc * (p.recalc -> x.part ->> 1)::numeric
             = (p.recalc -> x.part ->> 0)::numeric * (p.res -> 'allocation' -> 'shares' -> x.part ->> 'den')::numeric)
           from pur13 p cross join (values ('already_sold'), ('stock_losses'), ('own_use'), ('returns_to_supplier')) x(part))
          and (select bool_and(
             (p.res -> 'allocation' -> 'remaining_fraction' ->> 'num')::numeric * p.dc * (p.recalc -> 'remaining_stock' ->> 1)::numeric
             = (p.recalc -> 'remaining_stock' ->> 0)::numeric * (p.res -> 'allocation' -> 'remaining_fraction' ->> 'den')::numeric) from pur13 p),
  'TC-PUR-13 (Q10): in 25 random in-order histories every exact share × ΔC equals the full recalculation''s difference');
select ok((select bool_and(abs(tests.part(p.res, x.part) - (p.recalc -> x.part ->> 0)::numeric / (p.recalc -> x.part ->> 1)::numeric) <= 0.5)
           from pur13 p cross join (values ('already_sold'), ('stock_losses'), ('own_use'), ('returns_to_supplier')) x(part)),
  'TC-PUR-13 (C-116c; owner-approved bound): each consumed part is within 0.5 pesewa (inclusive) of the exact recalculated amount');
select ok((select bool_and(abs(tests.part(p.res, 'remaining_stock') - (p.recalc -> 'remaining_stock' ->> 0)::numeric / (p.recalc -> 'remaining_stock' ->> 1)::numeric) <= 2) from pur13 p),
  'TC-PUR-13 (C-116c; owner-approved bound): the remaining-stock part, which takes the rounding leftover, is within 2 pesewas (inclusive)');
select ok((select bool_and(tests.part(p.res, 'remaining_stock') + tests.part(p.res, 'already_sold') + tests.part(p.res, 'stock_losses')
                           + tests.part(p.res, 'own_use') + tests.part(p.res, 'returns_to_supplier') = p.dc
                       and case when p.res -> 'allocation' ->> 'movement_id' is null then tests.part(p.res, 'remaining_stock') = 0
                                else (select m.value = tests.part(p.res, 'remaining_stock') and m.qty_change = 0
                                      from public.stock_movements m where m.id = (p.res -> 'allocation' ->> 'movement_id')::uuid) end)
           from pur13 p),
  'TC-PUR-13 (C-116c, C1): in every random history the integer parts sum exactly to ΔC and the stock-value movement equals the integer R');
select ok((select bool_and((p.res -> 'allocation' ->> 'exact')::boolean) from pur13 p),
  'TC-PUR-13: in-order histories are flagged exact');
select diag(format('TC-PUR-13 measurements: %s histories; movements walked min %s, median %s, max %s; correct_purchase time ms: median %s, max %s (long history of %s movements: %s ms); largest f denominator %s digits; largest share denominator %s digits; max remaining-stock deviation %s pesewa; max consumed-part deviation %s pesewa',
  (select count(*) from pur13),
  (select min((res -> 'allocation' ->> 'movements_walked')::int) from pur13),
  (select percentile_disc(0.5) within group (order by (res -> 'allocation' ->> 'movements_walked')::int) from pur13),
  (select max((res -> 'allocation' ->> 'movements_walked')::int) from pur13),
  (select percentile_disc(0.5) within group (order by ms) from pur13),
  (select max(ms) from pur13),
  (select movements from pur13 where k = 25), (select ms from pur13 where k = 25),
  (select max(length(res -> 'allocation' -> 'remaining_fraction' ->> 'den')) from pur13),
  (select max(length(res -> 'allocation' -> 'shares' -> x.part ->> 'den')) from pur13 cross join (values ('already_sold'), ('stock_losses'), ('own_use'), ('returns_to_supplier')) x(part)),
  (select max(round(abs(tests.part(res, 'remaining_stock') - (recalc -> 'remaining_stock' ->> 0)::numeric / (recalc -> 'remaining_stock' ->> 1)::numeric), 4)) from pur13),
  (select max(round(abs(tests.part(res, x.part) - (recalc -> x.part ->> 0)::numeric / (recalc -> x.part ->> 1)::numeric), 4))
   from pur13 cross join (values ('already_sold'), ('stock_losses'), ('own_use'), ('returns_to_supplier')) x(part))));
select ok(tests.pool_conserved(tests.id('biz_a')), 'TC-PUR-13 / TC-COST-20: conservation still holds after the random histories');

select * from finish();
rollback;
