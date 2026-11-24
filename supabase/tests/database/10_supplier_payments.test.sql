-- Stage 1C, task T7: public.pay_supplier, public.unpaid_purchases and the shared unpaid-balance helper
-- (04 §2.2; 05 C-112 – C-115, §12.1; 03 S-38; 09 §3, §4.2 step 3a).
-- Payments change only the amount owed: no stock movement, value or profit, never an expense.
-- Owner decisions (T7): P1 date defaults to today (UTC), no future dates, none before the purchase
-- date; P2 no closed-day adjustments; P3 no reversal (append-only); P4 one helper with the 09
-- formula (corrections and return credits are fixtures here: T8 and T9 write them later); P5 a
-- server-side paginated list with totals across all qualifying purchases; P6 archived products'
-- purchases can be paid; P7 note only. Fixtures are fictitious and everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(100);

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
-- the shared helper, read as the superuser (it is internal)
create function tests.unpaid(p_biz uuid, p_purchase uuid) returns bigint language sql stable security definer as $$
  select private.purchase_unpaid(p_biz, p_purchase)
$$;
grant execute on function tests.unpaid(uuid, uuid) to authenticated;
create function tests.pool_conserved(p_business uuid) returns boolean language sql stable security definer as $$
  select coalesce(bool_and(
           p.stock_qty = coalesce((select sum(m.qty_change) from public.stock_movements m where m.product_id = p.id), 0)
       and p.stock_value = coalesce((select sum(m.value) from public.stock_movements m where m.product_id = p.id), 0)), true)
  from public.products p where p.business_id = p_business
$$;
grant execute on function tests.pool_conserved(uuid) to authenticated;
-- pay with a fresh request ID
create function tests.pay(p_biz uuid, p_purchase uuid, p_amount bigint, p_from text, p_on date default null, p_note text default null)
returns jsonb language sql as $$
  select public.pay_supplier(gen_random_uuid(), p_biz, p_purchase, p_amount, p_from, p_on, p_note)
$$;
grant execute on function tests.pay(uuid, uuid, bigint, text, date, text) to authenticated;
-- a purchase through T5's restock: product, qty, cost, paid now, paid from, date
create function tests.buy(p_biz uuid, p_product uuid, p_cost bigint, p_paid bigint, p_from text, p_on date default null, p_supplier text default null)
returns uuid language sql as $$
  select (public.restock(gen_random_uuid(), p_biz, p_product, 1, p_cost, p_paid, p_from, p_on, p_supplier) ->> 'purchase_id')::uuid
$$;
grant execute on function tests.buy(uuid, uuid, bigint, bigint, text, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures: owner A with shops A, A2 (list) and A3 (scale), owner B with shop B
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner.a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner.b@example.test');

select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
insert into tests.ids select 'biz_b', (public.create_business(gen_random_uuid(), 'Kofi Test Mart', 'provision', 'Kumasi', null) ->> 'business_id')::uuid;
insert into tests.ids select 'b_prod', (public.create_product(gen_random_uuid(), tests.id('biz_b'), 'B milo', 160, p_cost_price => 120, p_opening_stock => 6) ->> 'product_id')::uuid;
reset role;

select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
insert into tests.ids select 'biz_a',  (public.create_business(gen_random_uuid(), 'Ama Test Provisions', 'provision', 'Accra', null) ->> 'business_id')::uuid;
insert into tests.ids select 'biz_a2', (public.create_business(gen_random_uuid(), 'Ama Second Shop', 'minimart', 'Tema', null) ->> 'business_id')::uuid;
insert into tests.ids select 'biz_a3', (public.create_business(gen_random_uuid(), 'Ama Wholesale', 'other', 'Accra', null) ->> 'business_id')::uuid;
insert into tests.ids select 'rice',  (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Rice bag', 7000, p_cost_price => 5000, p_opening_stock => 2) ->> 'product_id')::uuid;
insert into tests.ids select 'torch', (public.create_product(gen_random_uuid(), tests.id('biz_a'), 'Old torch', 2500, p_cost_price => 50, p_opening_stock => 3) ->> 'product_id')::uuid;
insert into tests.ids select 'oil2',  (public.create_product(gen_random_uuid(), tests.id('biz_a2'), 'Second shop oil', 900, p_cost_price => 700, p_opening_stock => 3) ->> 'product_id')::uuid;
insert into tests.ids select 'gari2', (public.create_product(gen_random_uuid(), tests.id('biz_a2'), 'Gari bag', 900) ->> 'product_id')::uuid;
insert into tests.ids select 'bulk3', (public.create_product(gen_random_uuid(), tests.id('biz_a3'), 'Bulk sugar', 900) ->> 'product_id')::uuid;
reset role;
-- Shops A and A2 were created 30 days ago (so past purchase dates can be recorded)
update public.businesses set created_at = now() - interval '30 days' where id in (tests.id('biz_a'), tests.id('biz_a2'));
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
-- §12.1 worked example: goods GH₵500, GH₵300 paid from the cash drawer, bought 10 days ago
insert into tests.ids select 'p_ex',   tests.buy(tests.id('biz_a'), tests.id('rice'), 50000, 30000, 'cash_drawer', (now() at time zone 'UTC')::date - 10, 'Makola Wholesale');
insert into tests.ids select 'p_full', tests.buy(tests.id('biz_a'), tests.id('rice'), 2000, 0, null);
insert into tests.ids select 'p_paid', tests.buy(tests.id('biz_a'), tests.id('rice'), 3000, 3000, 'momo');
insert into tests.ids select 'p_arch', tests.buy(tests.id('biz_a'), tests.id('torch'), 1000, 0, null);
insert into tests.ids select 'p_free', tests.buy(tests.id('biz_a'), tests.id('rice'), 0, 0, null);
insert into tests.ids select 'p_frm',  tests.buy(tests.id('biz_a'), tests.id('rice'), 10000, 2000, 'cash_drawer');   -- formula fixture
insert into tests.ids select 'p_neg',  tests.buy(tests.id('biz_a'), tests.id('rice'), 4000, 4000, 'cash_drawer');   -- correction below paid
insert into tests.ids select 'p_val',  tests.buy(tests.id('biz_a'), tests.id('rice'), 9000, 0, null);              -- validation
insert into tests.ids select 'p_a2x',  tests.buy(tests.id('biz_a2'), tests.id('oil2'), 800, 0, null);
insert into tests.ids select 'p_iso1', tests.buy(tests.id('biz_a'), tests.id('rice'), 6000, 0, null);              -- isolation
insert into tests.ids select 'p_iso2', tests.buy(tests.id('biz_a'), tests.id('rice'), 7000, 1000, 'momo');         -- isolation
insert into tests.ids select 'p_idem', tests.buy(tests.id('biz_a'), tests.id('rice'), 5000, 0, null);              -- replay while owed
insert into tests.ids select 'p_tz',   tests.buy(tests.id('biz_a'), tests.id('rice'), 5000, 0, null);              -- UTC independence
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select public.set_product_archived(gen_random_uuid(), tests.id('biz_a'), tests.id('torch'), true);
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
create temp table before_all as
  select (select count(*) from public.stock_movements) as mv, (select count(*) from public.product_cost_history) as hist,
         (select count(*) from public.expenses) as expenses,
         (select jsonb_object_agg(id, jsonb_build_array(stock_qty, stock_value)) from public.products) as stock;
grant select on before_all to authenticated;

-- ===========================================================================
-- Definition and privileges
-- ===========================================================================
select ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc
           where oid in ('public.pay_supplier(uuid,uuid,uuid,bigint,text,date,text)'::regprocedure,
                         'public.unpaid_purchases(uuid,integer,integer)'::regprocedure)),
  'TC-INV-81a: pay_supplier and unpaid_purchases exist, SECURITY DEFINER with explicit checks and an empty search_path');
select ok((select provolatile = 's' from pg_proc where oid = 'public.unpaid_purchases(uuid,integer,integer)'::regprocedure),
  'TC-INV-81b: unpaid_purchases is read-only (STABLE)');
select ok(has_function_privilege('authenticated', 'public.pay_supplier(uuid,uuid,uuid,bigint,text,date,text)', 'execute')
          and has_function_privilege('authenticated', 'public.unpaid_purchases(uuid,integer,integer)', 'execute')
          and not has_function_privilege('anon', 'public.pay_supplier(uuid,uuid,uuid,bigint,text,date,text)', 'execute')
          and not has_function_privilege('anon', 'public.unpaid_purchases(uuid,integer,integer)', 'execute')
          and not exists (select 1 from information_schema.routine_privileges
                          where routine_schema = 'public' and routine_name in ('pay_supplier', 'unpaid_purchases') and grantee = 'PUBLIC'),
  'TC-INV-81c: signed-in users can call both; anonymous callers and PUBLIC cannot');
select ok(not has_function_privilege('authenticated', 'private.purchase_unpaid(uuid,uuid)', 'execute')
          and not has_function_privilege('anon', 'private.purchase_unpaid(uuid,uuid)', 'execute'),
  'TC-INV-81d: the shared unpaid helper is internal');
select ok(not has_table_privilege('authenticated', 'public.supplier_payments', 'insert')
          and not has_table_privilege('authenticated', 'public.purchases', 'update')
          and not has_table_privilege('authenticated', 'public.expenses', 'insert'),
  'TC-INV-81e: the app cannot write supplier payments or purchases directly');

-- ===========================================================================
-- Purchase isolation: a payment changes only its own purchase's balance
-- ===========================================================================
set local role authenticated;
insert into tests.results select 'iso', tests.pay(tests.id('biz_a'), tests.id('p_iso1'), 2500, 'cash_drawer');
reset role;
select ok(tests.r('iso') @> '{"unpaid_before":6000,"unpaid_after":3500}'
          and tests.unpaid(tests.id('biz_a'), tests.id('p_iso1')) = 3500
          and tests.unpaid(tests.id('biz_a'), tests.id('p_iso2')) = 6000,
  'TC-INV-81f: paying 2500 on one purchase (6000 -> 3500) leaves another purchase of the same shop unchanged (7000 - 1000 = 6000)');

-- ===========================================================================
-- Partial payments: the §12.1 worked example (TC-PUR-03)
-- ===========================================================================
select is(tests.unpaid(tests.id('biz_a'), tests.id('p_ex')), 20000::bigint, 'TC-PUR-03 step 1: GH₵500 bought, 300 paid now: 200 owed');
set local role authenticated;
insert into tests.results select 's2', public.pay_supplier('66666666-6666-6666-6666-666666666601', tests.id('biz_a'), tests.id('p_ex'),
  10000, 'momo', p_note => '  Second instalment  ');
insert into tests.ids select 'pay_s2', (tests.r('s2') ->> 'payment_id')::uuid;
insert into tests.results select 's3', tests.pay(tests.id('biz_a'), tests.id('p_ex'), 10000, 'cash_drawer');
reset role;
select ok(tests.r('s2') @> jsonb_build_object('purchase_id', tests.id('p_ex'), 'amount', 10000, 'paid_from', 'momo',
                                             'paid_on', (now() at time zone 'UTC')::date, 'unpaid_before', 20000, 'unpaid_after', 10000),
  'TC-PUR-03 step 2: GH₵100 by MoMo leaves 100 owed; the date defaults to today (UTC, P1)');
select ok((select purchase_id = tests.id('p_ex') and amount = 10000 and paid_from = 'momo' and paid_on = (now() at time zone 'UTC')::date
                  and note = 'Second instalment' and user_id = '00000000-0000-0000-0000-0000000000a1' and business_id = tests.id('biz_a')
           from public.supplier_payments where id = tests.id('pay_s2')),
  'TC-INV-82a: the payment row: purchase, amount, source, date, trimmed note and user stored');
select ok(tests.r('s3') @> '{"amount":10000,"paid_from":"cash_drawer","unpaid_before":10000,"unpaid_after":0}'
          and tests.unpaid(tests.id('biz_a'), tests.id('p_ex')) = 0,
  'TC-PUR-03 step 3: GH₵100 cash pays it off: 0 owed');
set local role authenticated;
select throws_ok($q$select tests.pay(tests.id('biz_a'), tests.id('p_ex'), 5000, 'cash_drawer')$q$, '22023', 'nothing_owed',
  'TC-PUR-03 step 4: a further GH₵50 is refused: nothing is owed');
reset role;
select ok((select count(*) = 2 and bool_and(user_id = '00000000-0000-0000-0000-0000000000a1' and entity = 'supplier_payment')
           from public.audit_log where action = 'pay_supplier' and after ->> 'purchase_id' = tests.id('p_ex')::text),
  'TC-INV-82b: one audit entry per payment');
select ok((select before = jsonb_build_object('purchase_id', tests.id('p_ex'), 'unpaid', 20000)
                  and after = jsonb_build_object('purchase_id', tests.id('p_ex'), 'amount', 10000, 'paid_from', 'momo',
                                                 'paid_on', (now() at time zone 'UTC')::date, 'note', 'Second instalment', 'unpaid', 10000)
           from public.audit_log where entity_id = tests.id('pay_s2')),
  'TC-INV-82c: the audit entry records the amount owed before and after');

-- Full payment in one step
set local role authenticated;
insert into tests.results select 'full', tests.pay(tests.id('biz_a'), tests.id('p_full'), 2000, 'other', p_note => 'Paid at the depot');
select throws_ok($q$select tests.pay(tests.id('biz_a'), tests.id('p_paid'), 1, 'cash_drawer')$q$, '22023', 'nothing_owed',
  'TC-INV-82d: a purchase fully paid at purchase time has nothing owed');
select throws_ok($q$select tests.pay(tests.id('biz_a'), tests.id('p_free'), 1, 'cash_drawer')$q$, '22023', 'nothing_owed',
  'TC-INV-82e: a zero-cost purchase has nothing owed');
reset role;
select ok(tests.r('full') @> '{"amount":2000,"paid_from":"other","unpaid_before":2000,"unpaid_after":0}',
  'TC-INV-82f: the whole amount can be paid at once ("other" source)');

-- Payments touch nothing else (C-113, TC-PUR-10)
select ok((select mv = (select count(*) from public.stock_movements) and hist = (select count(*) from public.product_cost_history)
                  and stock = (select jsonb_object_agg(id, jsonb_build_array(stock_qty, stock_value)) from public.products)
           from before_all),
  'TC-PUR-03 (C-113): stock quantities, stock values, movements and history are unchanged by payments');
select ok((select expenses = (select count(*) from public.expenses) from before_all)
          and not exists (select 1 from public.attention_items where business_id = tests.id('biz_a') and entity = 'supplier_payment'),
  'TC-PUR-10: supplier payments never create an expense (or a Needs attention item)');

-- ===========================================================================
-- Amount owed checks and validation
-- ===========================================================================
set local role authenticated;
select throws_ok($q$select tests.pay(tests.id('biz_a'), tests.id('p_val'), 9001, 'cash_drawer')$q$, '22023', 'amount_exceeds_unpaid',
  'TC-INV-83a (07): paying more than is owed is refused');
select throws_ok($q$select tests.pay(tests.id('biz_a'), tests.id('p_val'), 0, 'cash_drawer')$q$, '22023', 'invalid_amount', 'TC-INV-83b: an amount of 0 is refused');
select throws_ok($q$select tests.pay(tests.id('biz_a'), tests.id('p_val'), -1, 'cash_drawer')$q$, '22023', 'invalid_amount', 'TC-INV-83c: a negative amount is refused');
select throws_ok($q$select tests.pay(tests.id('biz_a'), tests.id('p_val'), null, 'cash_drawer')$q$, '22023', 'invalid_amount', 'TC-INV-83d: a missing amount is refused');
select throws_ok($q$select tests.pay(tests.id('biz_a'), tests.id('p_val'), 100000001, 'cash_drawer')$q$, '22023', 'invalid_amount',
  'TC-INV-83e (D6): an amount above GH₵1,000,000 is refused');
select throws_ok($q$select tests.pay(tests.id('biz_a'), tests.id('p_val'), 100, null)$q$, '22023', 'invalid_paid_from', 'TC-INV-83f: "paid from" is required');
select throws_ok($q$select tests.pay(tests.id('biz_a'), tests.id('p_val'), 100, 'bank')$q$, '22023', 'invalid_paid_from', 'TC-INV-83g: an unknown source is refused');
select throws_ok($q$select tests.pay(tests.id('biz_a'), tests.id('p_val'), 100, 'Cash_Drawer')$q$, '22023', 'invalid_paid_from', 'TC-INV-83h: sources are exact codes');
select throws_ok(format('select tests.pay(tests.id(''biz_a''), tests.id(''p_val''), 100, ''momo'', null, %L)', repeat('n', 301)),
  '22023', 'note_too_long', 'TC-INV-83i: a note over 300 characters is refused');
insert into tests.results select 'n300', tests.pay(tests.id('biz_a'), tests.id('p_val'), 100, 'momo', null, '  ' || repeat('n', 300) || '  ');
insert into tests.results select 'nblank', tests.pay(tests.id('biz_a'), tests.id('p_val'), 100, 'momo', null, '   ');
reset role;
select ok((select char_length(note) = 300 from public.supplier_payments where id = (tests.r('n300') ->> 'payment_id')::uuid)
          and (select note is null from public.supplier_payments where id = (tests.r('nblank') ->> 'payment_id')::uuid),
  'TC-INV-83j: a 300-character note (after trimming) is accepted; a blank note is stored empty');

-- Dates (P1): p_ex was bought 10 days ago
set local role authenticated;
select throws_ok($q$select tests.pay(tests.id('biz_a'), tests.id('p_val'), 100, 'momo', (now() at time zone 'UTC')::date + 1)$q$, '22023', 'invalid_payment_date',
  'TC-INV-84a (P1): a payment dated tomorrow is refused');
select throws_ok($q$select tests.pay(tests.id('biz_a'), tests.id('p_val'), 100, 'momo', (now() at time zone 'UTC')::date - 1)$q$, '22023', 'invalid_payment_date',
  'TC-INV-84b (P1): a payment dated before the purchase date (bought today) is refused');
insert into tests.results select 'd_today', tests.pay(tests.id('biz_a'), tests.id('p_val'), 100, 'momo', (now() at time zone 'UTC')::date);
reset role;
select ok(tests.r('d_today') ->> 'paid_on' = ((now() at time zone 'UTC')::date)::text, 'TC-INV-84c (P1): a payment dated today is accepted');
-- Dates on the 10-day-old purchase: a fixture purchase to test the boundaries without paying it off
set local role authenticated;
insert into tests.ids select 'p_old', tests.buy(tests.id('biz_a'), tests.id('rice'), 5000, 0, null, (now() at time zone 'UTC')::date - 10);
select throws_ok($q$select tests.pay(tests.id('biz_a'), tests.id('p_old'), 100, 'momo', (now() at time zone 'UTC')::date - 11)$q$, '22023', 'invalid_payment_date',
  'TC-INV-84d (P1): one day before the purchase date is refused');
insert into tests.results select 'd_first', tests.pay(tests.id('biz_a'), tests.id('p_old'), 100, 'momo', (now() at time zone 'UTC')::date - 10);
insert into tests.results select 'd_mid', tests.pay(tests.id('biz_a'), tests.id('p_old'), 100, 'cash_drawer', (now() at time zone 'UTC')::date - 5);
reset role;
select ok(tests.r('d_first') ->> 'paid_on' = ((now() at time zone 'UTC')::date - 10)::text
          and tests.r('d_mid') ->> 'paid_on' = ((now() at time zone 'UTC')::date - 5)::text,
  'TC-INV-84e (P1): the purchase date itself and a back-dated day after it are accepted, and stored as given');
select is(tests.unpaid(tests.id('biz_a'), tests.id('p_val')), 8700::bigint,
  'TC-INV-84f: refused payments changed nothing: 9000 less the three accepted GH₵1 payments');

-- Archived product (P6)
set local role authenticated;
insert into tests.results select 'arch', tests.pay(tests.id('biz_a'), tests.id('p_arch'), 400, 'cash_drawer');
reset role;
select ok(tests.r('arch') @> '{"unpaid_before":1000,"unpaid_after":600}'
          and (select not active from public.products where id = tests.id('torch')),
  'TC-INV-84g (P6): a purchase of an archived product can be paid; the product stays archived');

-- ===========================================================================
-- Missing purchases and isolation
-- ===========================================================================
set local role authenticated;
select throws_ok($q$select tests.pay(tests.id('biz_a'), gen_random_uuid(), 100, 'momo')$q$, 'P0002', 'purchase_not_found',
  'TC-INV-85a: an unknown purchase is not found');
select throws_ok($q$select tests.pay(tests.id('biz_a'), tests.id('p_a2x'), 100, 'momo')$q$, 'P0002', 'purchase_not_found',
  'TC-INV-85b: a purchase of the owner''s other shop is not found through this shop');
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select throws_ok($q$select tests.pay(tests.id('biz_a'), tests.id('p_val'), 100, 'momo')$q$, '42501', 'not_a_member',
  'TC-INV-85c: owner B cannot pay through shop A');
select throws_ok($q$select tests.pay(tests.id('biz_b'), tests.id('p_val'), 100, 'momo')$q$, 'P0002', 'purchase_not_found',
  'TC-INV-85d: owner B cannot pay shop A''s purchase by passing their own shop');
select throws_ok($q$select public.unpaid_purchases(tests.id('biz_a'))$q$, '42501', 'not_a_member',
  'TC-INV-85e: owner B cannot list shop A''s unpaid purchases');
reset role;
update public.business_members set active = false where business_id = tests.id('biz_b');
select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select throws_ok($q$select public.unpaid_purchases(tests.id('biz_b'))$q$, '42501', 'not_a_member',
  'TC-INV-85f: an inactive membership cannot list unpaid purchases');
select throws_ok($q$select tests.pay(tests.id('biz_b'), gen_random_uuid(), 100, 'momo')$q$, '42501', 'not_a_member',
  'TC-INV-85g: an inactive membership cannot pay');
reset role;
update public.business_members set active = true where business_id = tests.id('biz_b');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_ok($q$select tests.pay(tests.id('biz_a'), tests.id('p_val'), 100, 'momo')$q$, '42501', 'not_authenticated',
  'TC-INV-85h: a payment without a signed-in user is refused');
select throws_ok($q$select public.unpaid_purchases(tests.id('biz_a'))$q$, '42501', 'not_authenticated',
  'TC-INV-85i: the list without a signed-in user is refused');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($q$select public.pay_supplier(gen_random_uuid(), tests.id('biz_a'), tests.id('p_val'), 100, 'momo')$q$, '42501', null,
  'TC-INV-85j: an anonymous caller cannot pay');
select throws_ok($q$select public.unpaid_purchases(tests.id('biz_a'))$q$, '42501', null,
  'TC-INV-85k: an anonymous caller cannot list');
reset role;
select is(tests.unpaid(tests.id('biz_a'), tests.id('p_val')), 8700::bigint, 'TC-INV-85l: the refused attempts changed nothing');
select tests.as_user('00000000-0000-0000-0000-0000000000a1');

-- ===========================================================================
-- Idempotency and atomicity (TC-PUR-04, TC-PUR-11)
-- ===========================================================================
-- Replay while money is still owed: a missing claim would record a second payment here
set local role authenticated;
insert into tests.results select 'idem1', public.pay_supplier('66666666-6666-6666-6666-666666666610', tests.id('biz_a'), tests.id('p_idem'), 1000, 'momo');
insert into tests.results select 'idem2', public.pay_supplier('66666666-6666-6666-6666-666666666610', tests.id('biz_a'), tests.id('p_idem'), 1000, 'momo');
reset role;
select is(tests.r('idem2'), tests.r('idem1'), 'TC-INV-86f (TC-PUR-04): a replay while 4000 is still owed returns the original result');
select ok((select count(*) = 1 from public.supplier_payments where purchase_id = tests.id('p_idem'))
          and (select count(*) = 1 from public.audit_log a join public.supplier_payments s on a.entity_id = s.id
               where a.action = 'pay_supplier' and s.purchase_id = tests.id('p_idem'))
          and (select count(*) = 1 from public.audit_log where action = 'pay_supplier' and after ->> 'purchase_id' = tests.id('p_idem')::text),
  'TC-INV-86g (TC-PUR-04): exactly one supplier payment and one matching audit entry exist after the replay');
select is(tests.unpaid(tests.id('biz_a'), tests.id('p_idem')), 4000::bigint, 'TC-INV-86h: the replay did not reduce the amount owed again');

create temp table before_replay as select (select count(*) from public.supplier_payments) as pays, (select count(*) from public.audit_log) as audit;
grant select on before_replay to authenticated;
set local role authenticated;
insert into tests.results select 's2_again', public.pay_supplier('66666666-6666-6666-6666-666666666601', tests.id('biz_a'), tests.id('p_ex'),
  10000, 'momo', p_note => '  Second instalment  ');
reset role;
select is(tests.r('s2_again'), tests.r('s2'), 'TC-PUR-04: the same Pay supplier request twice returns the original result');
select ok((select pays = (select count(*) from public.supplier_payments) and audit = (select count(*) from public.audit_log) from before_replay),
  'TC-PUR-04: and is recorded once (no second payment or audit entry), although nothing is owed any more');
set local role authenticated;
select throws_ok($q$select public.pay_supplier('66666666-6666-6666-6666-666666666601', tests.id('biz_a2'), tests.id('p_a2x'), 100, 'momo')$q$,
  '22023', 'request_id_reused', 'TC-INV-86a: the same request ID for the owner''s other shop is refused');
select throws_ok($q$select public.adjust_stock('66666666-6666-6666-6666-666666666601', tests.id('biz_a'), tests.id('rice'), 'damaged', null, -1)$q$,
  '22023', 'request_id_reused', 'TC-INV-86b: the same request ID for a different function is refused');
select throws_ok($q$select public.pay_supplier('66666666-6666-6666-6666-666666666602', tests.id('biz_a'), tests.id('p_val'), 999999, 'momo')$q$,
  '22023', 'amount_exceeds_unpaid', 'TC-INV-86c: (setup) a refused payment');
reset role;
select ok((select pays = (select count(*) from public.supplier_payments) and audit = (select count(*) from public.audit_log) from before_replay)
          and not exists (select 1 from public.request_log where request_id = '66666666-6666-6666-6666-666666666602'),
  'TC-INV-86d: a refused payment writes nothing at all (no payment, audit entry or claim)');
set local role authenticated;
insert into tests.results select 'retry', public.pay_supplier('66666666-6666-6666-6666-666666666602', tests.id('biz_a'), tests.id('p_val'), 600, 'momo');
reset role;
select ok(tests.r('retry') @> '{"unpaid_before":8700,"unpaid_after":8100}', 'TC-INV-86e: the same request ID then succeeds');

-- UTC independence (P1): the default date is the UTC calendar date whatever the session time zone.
-- Kiritimati (UTC+14) differs from UTC from 10:00 UTC; Pago Pago (UTC-11) before 11:00 UTC, so at
-- any moment at least one of the two sessions has a different local date than UTC.
create temp table tz_saved as select current_setting('TimeZone') as tz;
create temp table tz_seen (zone text primary key, local_date date, utc_date date);
grant select, insert on tz_seen to authenticated;
set local timezone = 'Pacific/Kiritimati';
set local role authenticated;
select lives_ok($q$insert into tests.results select 'tz_kir', tests.pay(tests.id('biz_a'), tests.id('p_tz'), 100, 'momo')$q$,
  'TC-INV-84g2: a default-dated payment is accepted with the session in Pacific/Kiritimati');
insert into tz_seen values ('Pacific/Kiritimati', current_date, (now() at time zone 'UTC')::date);
reset role;
set local timezone = 'Pacific/Pago_Pago';
set local role authenticated;
select lives_ok($q$insert into tests.results select 'tz_pago', tests.pay(tests.id('biz_a'), tests.id('p_tz'), 100, 'momo')$q$,
  'TC-INV-84g3: a default-dated payment is accepted with the session in Pacific/Pago_Pago');
insert into tz_seen values ('Pacific/Pago_Pago', current_date, (now() at time zone 'UTC')::date);
reset role;
select set_config('TimeZone', (select tz from tz_saved), true);
select ok((select paid_on = (now() at time zone 'UTC')::date from public.supplier_payments where id = (tests.r('tz_kir') ->> 'payment_id')::uuid)
          and tests.r('tz_kir') ->> 'paid_on' = ((now() at time zone 'UTC')::date)::text,
  'TC-INV-84h (P1): with the session in Pacific/Kiritimati (UTC+14), the default payment date is the UTC date');
select ok((select paid_on = (now() at time zone 'UTC')::date from public.supplier_payments where id = (tests.r('tz_pago') ->> 'payment_id')::uuid),
  'TC-INV-84i (P1): with the session in Pacific/Pago_Pago (UTC-11), the default payment date is the UTC date');
select ok(exists (select 1 from tz_seen where local_date <> utc_date),
  'TC-INV-84j: (check of the test itself) at least one of the two sessions had a local date different from UTC, so 84h/84i discriminate');
select is(current_setting('TimeZone'), (select tz from tz_saved), 'TC-INV-84k: the session time zone is restored afterwards');

-- ===========================================================================
-- Append-only payments and audit (P3)
-- ===========================================================================
select throws_ok(format('update public.supplier_payments set amount = 1 where id = %L', tests.id('pay_s2')), 'P0001', null,
  'TC-INV-87a (P3): a recorded payment cannot be changed');
select throws_ok(format('delete from public.supplier_payments where id = %L', tests.id('pay_s2')), 'P0001', null,
  'TC-INV-87b (P3): a recorded payment cannot be deleted');
select throws_ok(format('update public.audit_log set after = ''{}'' where entity_id = %L', tests.id('pay_s2')), 'P0001', null,
  'TC-INV-87c (P3): its audit entry cannot be changed');
select throws_ok(format('update public.purchases set paid_now = purchase_cost where id = %L', tests.id('p_val')), 'P0001', null,
  'TC-INV-87d: the purchase itself is never edited by paying it');
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname ~ '(reverse|undo|void|cancel|delete).*(supplier|payment)'),
  'TC-INV-87e (P3): no payment reversal or correction function exists');

-- ===========================================================================
-- The shared formula (P4): unpaid = cost - paid now - payments + cost corrections - return credits
-- Corrections and return credits are written directly as fixtures (T8 and T9 write them later)
-- ===========================================================================
set local role authenticated;
insert into tests.results select 'f1', tests.pay(tests.id('biz_a'), tests.id('p_frm'), 3000, 'cash_drawer');
reset role;
select is(tests.unpaid(tests.id('biz_a'), tests.id('p_frm')), 5000::bigint, 'TC-INV-88a: 10000 - 2000 paid now - 3000 paid later = 5000');
insert into public.purchase_corrections (business_id, purchase_id, type, cost_change, reason, allocation, allocation_exact)
values (tests.id('biz_a'), tests.id('p_frm'), 'cost', 1500, 'Invoice was higher', '{}', true);
select is(tests.unpaid(tests.id('biz_a'), tests.id('p_frm')), 6500::bigint, 'TC-INV-88b: a +1500 cost correction raises the amount owed to 6500');
insert into public.purchase_corrections (business_id, purchase_id, type, cost_change, reason, allocation, allocation_exact, refund_amount, refund_method)
values (tests.id('biz_a'), tests.id('p_frm'), 'cost', -500, 'Discount agreed', '{}', true, 200, 'cash');
select is(tests.unpaid(tests.id('biz_a'), tests.id('p_frm')), 6200::bigint,
  'TC-INV-88c: a -500 correction lowers it by 500; its 200 refund is added back (T9 C2): 6200');
insert into public.purchase_corrections (business_id, purchase_id, type, qty_change, reason)
values (tests.id('biz_a'), tests.id('p_frm'), 'quantity', -1, 'Short delivery');
select is(tests.unpaid(tests.id('biz_a'), tests.id('p_frm')), 6200::bigint, 'TC-INV-88d: a quantity correction does not change the amount owed (C-116f)');
insert into public.supplier_returns (business_id, product_id, qty, value_removed, credit_amount, credit_type, purchase_id, reason) values
  (tests.id('biz_a'), tests.id('rice'), 1, 5000, 1000, 'reduce_unpaid', tests.id('p_frm'), 'Torn bag'),
  (tests.id('biz_a'), tests.id('rice'), 1, 5000, 700, 'refund_cash', tests.id('p_frm'), 'Torn bag, cash back'),
  (tests.id('biz_a'), tests.id('rice'), 1, 5000, 400, 'refund_momo', null, 'MoMo refund'),
  (tests.id('biz_a'), tests.id('rice'), 1, 5000, 300, 'reduce_unpaid', tests.id('p_val'), 'Credit on another purchase');
select is(tests.unpaid(tests.id('biz_a'), tests.id('p_frm')), 5200::bigint,
  'TC-INV-88e: a 1000 return credit against this purchase lowers it to 5200; refunds and credits on other purchases do not count');
select is(tests.unpaid(tests.id('biz_a'), tests.id('p_val')), 7800::bigint, 'TC-INV-88f: the 300 credit counts on the purchase it names (8100 - 300)');
set local role authenticated;
select throws_ok($q$select tests.pay(tests.id('biz_a'), tests.id('p_frm'), 5201, 'cash_drawer')$q$, '22023', 'amount_exceeds_unpaid',
  'TC-INV-88g: pay_supplier uses the same figure: 5201 is refused');
insert into tests.results select 'f2', tests.pay(tests.id('biz_a'), tests.id('p_frm'), 5200, 'cash_drawer');
reset role;
select ok(tests.r('f2') @> '{"unpaid_before":5200,"unpaid_after":0}', 'TC-INV-88h: and exactly 5200 pays it off');
-- A correction below what was already paid: the exact figure is negative; nothing is owed and it is never listed
insert into public.purchase_corrections (business_id, purchase_id, type, cost_change, reason, allocation, allocation_exact, refund_amount, refund_method)
values (tests.id('biz_a'), tests.id('p_neg'), 'cost', -1500, 'Overcharged', '{}', true, 1500, 'cash');
select is(tests.unpaid(tests.id('biz_a'), tests.id('p_neg')), 0::bigint, 'TC-INV-88i: the helper returns the exact signed figure (0: the 1500 refund is added back, T9 C2)');
set local role authenticated;
select throws_ok($q$select tests.pay(tests.id('biz_a'), tests.id('p_neg'), 1, 'cash_drawer')$q$, '22023', 'nothing_owed',
  'TC-INV-88j: a negative figure means nothing owed');
insert into tests.results select 'list_a', public.unpaid_purchases(tests.id('biz_a'), 200, 0);
reset role;
select ok(not exists (select 1 from jsonb_array_elements(tests.r('list_a') -> 'purchases') e
                      where (e ->> 'unpaid')::bigint <= 0 or e ->> 'purchase_id' in (tests.id('p_neg')::text, tests.id('p_paid')::text)),
  'TC-INV-88k: the list never shows a purchase with nothing or a negative amount owed');
select is(tests.unpaid(tests.id('biz_a'), tests.id('p_a2x')), null::bigint, 'TC-INV-88l: the helper is scoped to the business (another shop''s purchase: null)');

-- ===========================================================================
-- Unpaid purchases list (P5): shop A2, with ties broken deterministically
-- ===========================================================================
set local role authenticated;
insert into tests.ids select 'l_old',  tests.buy(tests.id('biz_a2'), tests.id('gari2'), 1000, 0, null, (now() at time zone 'UTC')::date - 20, 'Kejetia');
insert into tests.ids select 'l_t1',   tests.buy(tests.id('biz_a2'), tests.id('gari2'), 2000, 500, 'momo', (now() at time zone 'UTC')::date - 5);
insert into tests.ids select 'l_t2',   tests.buy(tests.id('biz_a2'), tests.id('gari2'), 3000, 0, null, (now() at time zone 'UTC')::date - 5);
insert into tests.ids select 'l_t3',   tests.buy(tests.id('biz_a2'), tests.id('oil2'), 4000, 0, null, (now() at time zone 'UTC')::date - 5);
insert into tests.ids select 'l_paid', tests.buy(tests.id('biz_a2'), tests.id('gari2'), 5000, 5000, 'cash_drawer', (now() at time zone 'UTC')::date - 3);
insert into tests.ids select 'l_new',  tests.buy(tests.id('biz_a2'), tests.id('gari2'), 600, 0, null);
select tests.pay(tests.id('biz_a2'), tests.id('l_t1'), 700, 'cash_drawer');
select tests.pay(tests.id('biz_a2'), tests.id('l_t1'), 300, 'momo');
insert into tests.results select 'pg0', public.unpaid_purchases(tests.id('biz_a2'), 2, 0);
insert into tests.results select 'pg1', public.unpaid_purchases(tests.id('biz_a2'), 2, 2);
insert into tests.results select 'pg2', public.unpaid_purchases(tests.id('biz_a2'), 2, 4);
insert into tests.results select 'pg3', public.unpaid_purchases(tests.id('biz_a2'), 2, 6);
insert into tests.results select 'pgall', public.unpaid_purchases(tests.id('biz_a2'));
insert into tests.results select 'pgall2', public.unpaid_purchases(tests.id('biz_a2'));
reset role;
-- owed: l_old 1000, l_t1 2000-500-1000 = 500, l_t2 3000, l_t3 4000, l_new 600, p_a2x 800 (6 purchases, 9900)
select ok((select bool_and(r ->> 'total_owed' = '9900' and r ->> 'purchase_count' = '6')
           from tests.results where k in ('pg0','pg1','pg2','pg3','pgall')),
  'TC-INV-89a (C-114): every page reports the total owed (9900) and count (6) across all unpaid purchases, not just its own');
select is((select jsonb_agg(e ->> 'purchase_id' order by n) from tests.results, jsonb_array_elements(r -> 'purchases') with ordinality as x(e, n) where k = 'pgall'),
          (select jsonb_agg(p.id::text order by p.purchased_on, p.created_at, p.id) from public.purchases p
           where p.business_id = tests.id('biz_a2') and p.id <> tests.id('l_paid')),
  'TC-INV-89b: oldest purchase date first, then recording time, then ID (same-day purchases in one transaction tie on time)');
select is((select jsonb_agg(e order by k, n) from tests.results, jsonb_array_elements(r -> 'purchases') with ordinality as x(e, n) where k in ('pg0','pg1','pg2')),
          tests.r('pgall') -> 'purchases',
  'TC-INV-89c: the pages of 2 together are exactly the full list, in order, with nothing repeated or missing');
select ok(jsonb_array_length(tests.r('pg0') -> 'purchases') = 2 and jsonb_array_length(tests.r('pg2') -> 'purchases') = 2
          and tests.r('pg3') -> 'purchases' = '[]'::jsonb and tests.r('pg3') @> '{"limit":2,"offset":6}',
  'TC-INV-89d: a page past the end is empty but still carries the totals');
select is(tests.r('pgall'), tests.r('pgall2'), 'TC-INV-89e: the same request gives the same result (deterministic)');
select ok((select e @> jsonb_build_object('product_id', tests.id('gari2'), 'product_name', 'Gari bag', 'product_active', true,
                                          'purchase_cost', 2000, 'paid', 1500, 'payments', 2, 'unpaid', 500,
                                          'purchased_on', ((now() at time zone 'UTC')::date - 5)::text, 'supplier_name', null)
           from tests.results, jsonb_array_elements(r -> 'purchases') e where k = 'pgall' and e ->> 'purchase_id' = tests.id('l_t1')::text)
          and (select e ->> 'supplier_name' = 'Kejetia' and e ->> 'paid' = '0' and e ->> 'payments' = '0'
               from tests.results, jsonb_array_elements(r -> 'purchases') e where k = 'pgall' and e ->> 'purchase_id' = tests.id('l_old')::text),
  'TC-INV-89f (S-38): each row shows date, product, supplier, purchase cost, paid (now + later), number of payments and unpaid');
select ok((select bool_and(e ->> 'product_active' = 'false') from tests.results, jsonb_array_elements(r -> 'purchases') e
           where k = 'list_a' and e ->> 'purchase_id' = tests.id('p_arch')::text)
          and (select count(*) = 1 from tests.results, jsonb_array_elements(r -> 'purchases') e
               where k = 'list_a' and e ->> 'purchase_id' = tests.id('p_arch')::text),
  'TC-INV-89g (P6): a purchase of an archived product is listed, marked as archived');
set local role authenticated;
select throws_ok($q$select public.unpaid_purchases(tests.id('biz_a2'), 0, 0)$q$, '22023', 'invalid_limit', 'TC-INV-89h: a page size of 0 is refused');
select throws_ok($q$select public.unpaid_purchases(tests.id('biz_a2'), 201, 0)$q$, '22023', 'invalid_limit', 'TC-INV-89i: a page size over 200 is refused');
select throws_ok($q$select public.unpaid_purchases(tests.id('biz_a2'), null, 0)$q$, '22023', 'invalid_limit', 'TC-INV-89j: a missing page size is refused');
select throws_ok($q$select public.unpaid_purchases(tests.id('biz_a2'), 10, -1)$q$, '22023', 'invalid_offset', 'TC-INV-89k: a negative offset is refused');
select throws_ok($q$select public.unpaid_purchases(tests.id('biz_a2'), 10, null)$q$, '22023', 'invalid_offset', 'TC-INV-89l: a missing offset is refused');
insert into tests.results select 'empty', public.unpaid_purchases(tests.id('biz_a3'));
reset role;
select is(tests.r('empty'), '{"total_owed":0,"purchase_count":0,"limit":50,"offset":0,"purchases":[]}'::jsonb,
  'TC-INV-89m: a shop with nothing owed gets zeros and an empty list (defaults: 50 per page from 0)');

-- More than 1,000 unpaid purchases (shop A3): exact totals, and the last page
insert into public.purchases (business_id, product_id, qty, purchase_cost, paid_now, purchased_on)
select tests.id('biz_a3'), tests.id('bulk3'), 1, 100 + g, 0, (now() at time zone 'UTC')::date - (g % 7)
from generate_series(1, 1005) g;
set local role authenticated;
insert into tests.results select 'big0', public.unpaid_purchases(tests.id('biz_a3'), 200, 0);
insert into tests.results select 'bigl', public.unpaid_purchases(tests.id('biz_a3'), 200, 1000);
reset role;
-- Σ (100 + g) for g = 1..1005 = 100500 + 505515 = 606015
select ok(tests.r('big0') @> '{"purchase_count":1005,"total_owed":606015}' and jsonb_array_length(tests.r('big0') -> 'purchases') = 200,
  'TC-INV-89n: with 1,005 unpaid purchases the count and total are exact (606015) and a page holds 200');
select ok(tests.r('bigl') @> '{"purchase_count":1005,"total_owed":606015}' and jsonb_array_length(tests.r('bigl') -> 'purchases') = 5,
  'TC-INV-89o: the last page (from 1,000) holds the remaining 5');

-- ===========================================================================
-- Conservation and history
-- ===========================================================================
select ok(tests.pool_conserved(tests.id('biz_a')) and tests.pool_conserved(tests.id('biz_a2')) and tests.pool_conserved(tests.id('biz_b')),
  'TC-COST-20 (pay supplier): stock pools still equal their movements in every shop');
select is((select count(*)::int from public.audit_log where action = 'pay_supplier' and business_id = tests.id('biz_a')),
          (select count(*)::int from public.supplier_payments where business_id = tests.id('biz_a')),
  'TC-INV-89p: every payment has exactly one audit entry');
select ok((select bool_and(a.entity_id = s.id and (a.after ->> 'amount')::bigint = s.amount)
           from public.supplier_payments s join public.audit_log a on a.action = 'pay_supplier' and a.entity_id = s.id
           where s.business_id = tests.id('biz_a')),
  'TC-INV-89q: each audit entry matches its payment');
select ok(not exists (select 1 from public.purchases p where p.business_id in (tests.id('biz_a'), tests.id('biz_a2'))
                      and (select coalesce(sum(s.amount), 0) from public.supplier_payments s where s.purchase_id = p.id) > p.purchase_cost - p.paid_now
                          + coalesce((select sum(c.cost_change) from public.purchase_corrections c where c.purchase_id = p.id and c.cost_change > 0), 0)),
  'TC-PUR-11: no purchase was ever paid more than it owed');

-- T10 (I3, additive): stock integrity of every shop this file used: no discrepancy
reset role;
select is((select count(*)::int from tests.ids i cross join lateral private.stock_integrity(i.v) s where i.k like 'biz%'), 0,
  'TC-INV-123f (T10 I3): stock integrity: no discrepancy in any shop of this file');

select * from finish();
rollback;
