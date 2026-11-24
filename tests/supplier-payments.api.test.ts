/**
 * Stage 1C, task T7: Pay supplier and the Unpaid purchases list through the real API path
 * (Auth + PostgREST), as the app will call them, including parallel requests (separate PostgREST
 * connections). LOCAL stack only until the migrations are applied to the cloud project with the
 * owner's approval (D11). Fictitious data only; no service-role key: every fixture goes through the
 * public functions.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anonClient, signedInOwner, testTarget } from './target';

const target = testTarget();
const run = randomUUID().slice(0, 8);
const today = () => new Date().toISOString().slice(0, 10);          // UTC date, as the server uses (P1)
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

let ownerA: SupabaseClient;
let ownerB: SupabaseClient;
let shopA: string;
let shopB: string;
let shopList: string;

type Pay = { amount: number | null; from: string | null; on?: string; note?: string };
const pay = (client: SupabaseClient, shop: string, purchaseId: string, p: Pay, requestId = randomUUID()) =>
  client.rpc('pay_supplier', {
    p_request_id: requestId, p_business_id: shop, p_purchase_id: purchaseId, p_amount: p.amount,
    p_paid_from: p.from, p_paid_on: p.on ?? null, p_note: p.note ?? null,
  });
const list = (client: SupabaseClient, shop: string, limit?: number, offset?: number) =>
  client.rpc('unpaid_purchases', { p_business_id: shop, ...(limit === undefined ? {} : { p_limit: limit }), ...(offset === undefined ? {} : { p_offset: offset }) });

async function product(client: SupabaseClient, shop: string, name: string): Promise<string> {
  const { data, error } = await client.rpc('create_product', { p_request_id: randomUUID(), p_business_id: shop, p_name: name, p_selling_price: 1000 });
  if (error) throw error;
  return data.product_id as string;
}

async function buy(client: SupabaseClient, shop: string, productId: string, cost: number, paid: number, date?: string, supplier?: string): Promise<string> {
  const { data, error } = await client.rpc('restock', {
    p_request_id: randomUUID(), p_business_id: shop, p_product_id: productId, p_qty: 1, p_purchase_cost: cost,
    p_paid_now: paid, p_paid_from: paid > 0 ? 'cash_drawer' : null, p_purchased_on: date ?? null, p_supplier_name: supplier ?? null,
  });
  if (error) throw error;
  return data.purchase_id as string;
}

async function payments(client: SupabaseClient, purchaseId: string) {
  const { data, error } = await client.from('supplier_payments').select('amount, paid_from, paid_on, note').eq('purchase_id', purchaseId).order('created_at');
  if (error) throw error;
  return data!;
}

describe.skipIf(target.mode === 'cloud')('Pay supplier and unpaid purchases through the API (T7)', () => {
  beforeAll(async () => {
    const a = await signedInOwner(target, 'supplier-a', run);
    const b = await signedInOwner(target, 'supplier-b', run);
    ownerA = a.client;
    ownerB = b.client;
    const shops = await Promise.all([
      ownerA.rpc('create_business', { p_request_id: randomUUID(), p_name: 'Supplier Shop A', p_type: 'provision' }),
      ownerB.rpc('create_business', { p_request_id: randomUUID(), p_name: 'Supplier Shop B', p_type: 'minimart' }),
      ownerA.rpc('create_business', { p_request_id: randomUUID(), p_name: 'Supplier List Shop', p_type: 'other' }),
    ]);
    for (const s of shops) if (s.error) throw s.error;
    [shopA, shopB, shopList] = shops.map((s) => s.data.business_id as string);
  });

  it('TC-INV-90a: TC-PUR-03 through the API: partial payments down to 0, then nothing owed; stock untouched', async () => {
    const rice = await product(ownerA, shopA, 'API Rice bag');
    const purchase = await buy(ownerA, shopA, rice, 50000, 30000, undefined, 'Makola');
    const before = await ownerA.from('products').select('stock_qty, stock_value').eq('id', rice).single();

    const second = await pay(ownerA, shopA, purchase, { amount: 10000, from: 'momo', note: ' Second instalment ' });
    expect(second.error).toBeNull();
    expect(second.data).toMatchObject({ purchase_id: purchase, amount: 10000, paid_from: 'momo', paid_on: today(), unpaid_before: 20000, unpaid_after: 10000 });
    const tooMuch = await pay(ownerA, shopA, purchase, { amount: 10001, from: 'cash_drawer' });
    expect(tooMuch.error?.message).toBe('amount_exceeds_unpaid');
    expect(JSON.parse(tooMuch.error!.details!)).toEqual({ unpaid: 10000 });   // for "Only GH₵ 100.00 is owed on this purchase." (07)
    const third = await pay(ownerA, shopA, purchase, { amount: 10000, from: 'cash_drawer' });
    expect(third.data).toMatchObject({ unpaid_before: 10000, unpaid_after: 0 });
    expect((await pay(ownerA, shopA, purchase, { amount: 5000, from: 'cash_drawer' })).error?.message).toBe('nothing_owed');

    expect(await payments(ownerA, purchase)).toEqual([
      { amount: 10000, paid_from: 'momo', paid_on: today(), note: 'Second instalment' },
      { amount: 10000, paid_from: 'cash_drawer', paid_on: today(), note: null },
    ]);
    const after = await ownerA.from('products').select('stock_qty, stock_value').eq('id', rice).single();
    expect(after.data).toEqual(before.data);                                   // C-113: no stock value effect
    const { data: mv } = await ownerA.from('stock_movements').select('type').eq('product_id', rice);
    expect(mv).toEqual([{ type: 'restock' }]);
    const { data: expenses } = await ownerA.from('expenses').select('id').eq('business_id', shopA);
    expect(expenses).toEqual([]);                                              // TC-PUR-10: never an expense
  });

  it('TC-INV-90b: amounts, sources and dates (P1) are validated by the server', async () => {
    const item = await product(ownerA, shopA, 'API Validation item');
    const purchase = await buy(ownerA, shopA, item, 9000, 0);
    const cases: [Pay, string][] = [
      [{ amount: 0, from: 'momo' }, 'invalid_amount'],
      [{ amount: -5, from: 'momo' }, 'invalid_amount'],
      [{ amount: null, from: 'momo' }, 'invalid_amount'],
      [{ amount: 100000001, from: 'momo' }, 'invalid_amount'],
      [{ amount: 100, from: null }, 'invalid_paid_from'],
      [{ amount: 100, from: 'bank' }, 'invalid_paid_from'],
      [{ amount: 100, from: 'momo', note: 'n'.repeat(301) }, 'note_too_long'],
      [{ amount: 100, from: 'momo', on: daysAgo(-1) }, 'invalid_payment_date'],
      [{ amount: 100, from: 'momo', on: daysAgo(1) }, 'invalid_payment_date'],   // before today's purchase
      [{ amount: 9001, from: 'momo' }, 'amount_exceeds_unpaid'],
    ];
    for (const [p, message] of cases) expect((await pay(ownerA, shopA, purchase, p)).error?.message).toBe(message);
    expect(await payments(ownerA, purchase)).toEqual([]);
    expect((await pay(ownerA, shopA, randomUUID(), { amount: 100, from: 'momo' })).error?.message).toBe('purchase_not_found');
  });

  it("TC-INV-90c: another shop's owner, signed-out callers and direct writes are refused; payments are private to the shop", async () => {
    const tin = await product(ownerA, shopA, 'API Tin');
    const purchase = await buy(ownerA, shopA, tin, 4000, 0);
    expect((await pay(ownerB, shopA, purchase, { amount: 100, from: 'momo' })).error?.message).toBe('not_a_member');
    expect((await pay(ownerB, shopB, purchase, { amount: 100, from: 'momo' })).error?.message).toBe('purchase_not_found');
    expect((await pay(anonClient(target), shopA, purchase, { amount: 100, from: 'momo' })).error?.code).toBe('42501');
    expect((await list(ownerB, shopA)).error?.message).toBe('not_a_member');
    expect((await list(anonClient(target), shopA)).error?.code).toBe('42501');
    const direct = await ownerA.from('supplier_payments').insert({ business_id: shopA, purchase_id: purchase, amount: 100, paid_from: 'momo', paid_on: today() });
    expect(direct.error?.code).toBe('42501');
    const edit = await ownerA.from('purchases').update({ paid_now: 4000 }).eq('id', purchase);
    expect(edit.error?.code).toBe('42501');
    expect((await pay(ownerA, shopA, purchase, { amount: 1000, from: 'momo' })).error).toBeNull();
    const { data: bView } = await ownerB.from('supplier_payments').select('id').eq('purchase_id', purchase);
    expect(bView).toEqual([]);                                                 // RLS: owner B cannot see them
  });

  it('TC-PUR-04 / TC-INV-90d: a repeated request is recorded once; another owner cannot replay its request ID', async () => {
    const oil = await product(ownerA, shopA, 'API Oil');
    const purchase = await buy(ownerA, shopA, oil, 3000, 0);
    const requestId = randomUUID();
    const first = await pay(ownerA, shopA, purchase, { amount: 1000, from: 'momo' }, requestId);
    const second = await pay(ownerA, shopA, purchase, { amount: 1000, from: 'momo' }, requestId);
    expect(first.error).toBeNull();
    expect(second.data).toEqual(first.data);
    expect(await payments(ownerA, purchase)).toHaveLength(1);
    const bOil = await product(ownerB, shopB, 'B Oil');
    const bPurchase = await buy(ownerB, shopB, bOil, 3000, 0);
    expect((await pay(ownerB, shopB, bPurchase, { amount: 1000, from: 'momo' }, requestId)).error?.message).toBe('request_id_reused');
  });

  it('TC-PUR-11 / TC-INV-90e: 5 parallel payments of 300 on 1000 owed: exactly 3 succeed, 100 stays owed', async () => {
    const sugar = await product(ownerA, shopA, 'API Parallel sugar');
    const purchase = await buy(ownerA, shopA, sugar, 1000, 0);
    const results = await Promise.all(Array.from({ length: 5 }, () => pay(ownerA, shopA, purchase, { amount: 300, from: 'cash_drawer' })));
    expect(results.filter((r) => r.error === null)).toHaveLength(3);
    expect(results.filter((r) => r.error?.message === 'amount_exceeds_unpaid')).toHaveLength(2);
    const ok = results.filter((r) => r.error === null).map((r) => r.data.unpaid_after as number).sort((x, y) => y - x);
    expect(ok).toEqual([700, 400, 100]);                                       // one at a time, in a single order
    expect((await payments(ownerA, purchase)).reduce((s, p) => s + p.amount, 0)).toBe(900);
  });

  it('TC-INV-90f: 10 parallel payments of 100 on 1000 owed all succeed and pay it off exactly', async () => {
    const soap = await product(ownerA, shopA, 'API Parallel soap');
    const purchase = await buy(ownerA, shopA, soap, 1000, 0);
    const results = await Promise.all(Array.from({ length: 10 }, () => pay(ownerA, shopA, purchase, { amount: 100, from: 'momo' })));
    for (const r of results) expect(r.error).toBeNull();
    expect(results.map((r) => r.data.unpaid_after as number).sort((x, y) => x - y)).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900]);
    expect((await pay(ownerA, shopA, purchase, { amount: 1, from: 'momo' })).error?.message).toBe('nothing_owed');
  });

  it('TC-CONC-05 (pay supplier): 5 simultaneous copies of one request are recorded once, with the same result', async () => {
    const milk = await product(ownerA, shopA, 'API Duplicate milk');
    const purchase = await buy(ownerA, shopA, milk, 2000, 0);
    const requestId = randomUUID();
    const results = await Promise.all(Array.from({ length: 5 }, () => pay(ownerA, shopA, purchase, { amount: 700, from: 'momo' }, requestId)));
    for (const r of results) expect(r.error).toBeNull();
    for (const r of results) expect(r.data).toEqual(results[0].data);
    expect(await payments(ownerA, purchase)).toHaveLength(1);
  });

  it('TC-INV-90g (S-38, C-114): the unpaid list pages on the server with totals across all purchases, in a fixed order', async () => {
    const gari = await product(ownerA, shopList, 'API Gari');
    const empty = await list(ownerA, shopList);
    expect(empty.data).toEqual({ total_owed: 0, purchase_count: 0, limit: 50, offset: 0, purchases: [] });
    const p1 = await buy(ownerA, shopList, gari, 1000, 0, undefined, 'Kejetia');
    const p2 = await buy(ownerA, shopList, gari, 2000, 500);
    const p3 = await buy(ownerA, shopList, gari, 3000, 0);
    await buy(ownerA, shopList, gari, 4000, 4000);                            // fully paid: not listed
    expect((await pay(ownerA, shopList, p2, { amount: 1000, from: 'momo' })).error).toBeNull();

    const all = await list(ownerA, shopList);
    expect(all.error).toBeNull();
    expect(all.data).toMatchObject({ total_owed: 1000 + 500 + 3000, purchase_count: 3 });
    expect(all.data.purchases.map((p: { purchase_id: string }) => p.purchase_id)).toEqual([p1, p2, p3]);   // same day: recording order
    expect(all.data.purchases[1]).toMatchObject({ product_name: 'API Gari', purchase_cost: 2000, paid: 1500, payments: 1, unpaid: 500, supplier_name: null });
    expect(all.data.purchases[0]).toMatchObject({ supplier_name: 'Kejetia', paid: 0, unpaid: 1000, purchased_on: today() });

    const pages = await Promise.all([list(ownerA, shopList, 2, 0), list(ownerA, shopList, 2, 2), list(ownerA, shopList, 2, 4)]);
    for (const pg of pages) expect(pg.data).toMatchObject({ total_owed: 4500, purchase_count: 3 });
    expect(pages.flatMap((pg) => pg.data.purchases)).toEqual(all.data.purchases);
    expect(pages[2].data.purchases).toEqual([]);
    expect((await list(ownerA, shopList, 0, 0)).error?.message).toBe('invalid_limit');
    expect((await list(ownerA, shopList, 201, 0)).error?.message).toBe('invalid_limit');
    expect((await list(ownerA, shopList, 10, -1)).error?.message).toBe('invalid_offset');
    // Each purchase's payment history is read directly (members only)
    expect(await payments(ownerA, p2)).toEqual([{ amount: 1000, paid_from: 'momo', paid_on: today(), note: null }]);
  });
  // T10 (I3, additive): stock integrity of the shops this file used: no discrepancy
  afterAll(async () => {
    for (const [client, shop] of [[ownerA, shopA], [ownerA, shopList], [ownerB, shopB]] as const) {
      const { data, error } = await client.rpc('check_stock_integrity', { p_business_id: shop, p_limit: 1000 });
      expect(error).toBeNull();
      expect(data.discrepancies).toEqual([]);
      expect(data.ok).toBe(true);
    }
  });
});
