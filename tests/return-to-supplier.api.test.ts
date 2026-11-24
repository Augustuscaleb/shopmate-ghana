/**
 * Stage 1C, task T8: Return to supplier through the real API path (Auth + PostgREST), as the app will
 * call it, including parallel requests (separate PostgREST connections). LOCAL stack only until the
 * migrations are applied to the cloud project with the owner's approval (D11). Fictitious data only;
 * no service-role key: every fixture goes through the public functions. (The C-25b zero-value case,
 * which needs a fixture late sale, is covered by the database tests.)
 */
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anonClient, signedInOwner, testTarget } from './target';

const target = testTarget();
const run = randomUUID().slice(0, 8);

let ownerA: SupabaseClient;
let ownerB: SupabaseClient;
let shopA: string;
let shopB: string;

type Ret = { qty: number | null; credit: number | null; type: string | null; reason?: string | null; purchase?: string };
const ret = (client: SupabaseClient, shop: string, productId: string, r: Ret, requestId = randomUUID()) =>
  client.rpc('return_to_supplier', {
    p_request_id: requestId, p_business_id: shop, p_product_id: productId, p_qty: r.qty, p_credit_amount: r.credit,
    p_credit_type: r.type, p_reason: r.reason === undefined ? 'Damaged on delivery' : r.reason, p_purchase_id: r.purchase ?? null,
  });

async function product(client: SupabaseClient, shop: string, name: string, cost: number | null, stock: number): Promise<string> {
  const { data, error } = await client.rpc('create_product', {
    p_request_id: randomUUID(), p_business_id: shop, p_name: name, p_selling_price: 1000,
    ...(cost === null ? {} : { p_cost_price: cost }), p_opening_stock: stock,
  });
  if (error) throw error;
  return data.product_id as string;
}

async function buy(client: SupabaseClient, shop: string, productId: string, qty: number, cost: number, paid: number): Promise<string> {
  const { data, error } = await client.rpc('restock', {
    p_request_id: randomUUID(), p_business_id: shop, p_product_id: productId, p_qty: qty, p_purchase_cost: cost,
    p_paid_now: paid, p_paid_from: paid > 0 ? 'cash_drawer' : null,
  });
  if (error) throw error;
  return data.purchase_id as string;
}

async function stock(client: SupabaseClient, productId: string) {
  const { data, error } = await client.from('products').select('stock_qty, stock_value').eq('id', productId).single();
  if (error) throw error;
  return data;
}

async function owed(client: SupabaseClient, shop: string, purchaseId: string): Promise<number> {
  const { data, error } = await client.rpc('unpaid_purchases', { p_business_id: shop, p_limit: 200, p_offset: 0 });
  if (error) throw error;
  const row = (data.purchases as { purchase_id: string; unpaid: number }[]).find((p) => p.purchase_id === purchaseId);
  return row ? row.unpaid : 0;
}

describe.skipIf(target.mode === 'cloud')('Return to supplier through the API (T8)', () => {
  beforeAll(async () => {
    const a = await signedInOwner(target, 'return-a', run);
    const b = await signedInOwner(target, 'return-b', run);
    ownerA = a.client;
    ownerB = b.client;
    const ca = await ownerA.rpc('create_business', { p_request_id: randomUUID(), p_name: 'Return Shop A', p_type: 'provision' });
    const cb = await ownerB.rpc('create_business', { p_request_id: randomUUID(), p_name: 'Return Shop B', p_type: 'minimart' });
    if (ca.error) throw ca.error;
    if (cb.error) throw cb.error;
    shopA = ca.data.business_id;
    shopB = cb.data.business_id;
  });

  it('TC-INV-100a: TC-PUR-07 through the API: one movement at the average; D recorded once, with its attention item', async () => {
    const sardine = await product(ownerA, shopA, 'API Sardine', 1500, 10);
    const res = await ret(ownerA, shopA, sardine, { qty: 3, credit: 4200, type: 'refund_cash', reason: ' Dented tins ' });
    expect(res.error).toBeNull();
    expect(res.data).toMatchObject({ qty: 3, value_removed: 4500, credit_amount: 4200, difference: -300, cost_impact: 300, stock_qty: 7, stock_value: 10500 });
    expect(await stock(ownerA, sardine)).toEqual({ stock_qty: 7, stock_value: 10500 });
    const { data: mv } = await ownerA.from('stock_movements').select('type, qty_change, value, reason, note').eq('product_id', sardine).order('created_at');
    expect(mv).toEqual([
      { type: 'opening', qty_change: 10, value: 15000, reason: null, note: null },
      { type: 'supplier_return', qty_change: -3, value: -4500, reason: null, note: 'Dented tins' },
    ]);                                                                         // no movement for D
    const { data: rows } = await ownerA.from('supplier_returns').select('qty, value_removed, credit_amount, credit_type, reason').eq('product_id', sardine);
    expect(rows).toEqual([{ qty: 3, value_removed: 4500, credit_amount: 4200, credit_type: 'refund_cash', reason: 'Dented tins' }]);
    const { data: items } = await ownerA.from('attention_items').select('type, entity, entity_id, status, message_data').eq('entity_id', res.data.return_id);
    expect(items).toHaveLength(1);
    expect(items![0]).toMatchObject({ type: 'cost_adjustment', entity: 'supplier_return', status: 'open' });
    expect(items![0].message_data).toMatchObject({ rule: 'C-25c', difference: -300, cost_impact: 300 });
  });

  it('TC-INV-100b: TC-PUR-08 through the API: a credit lowers what the purchase owes (seen by the unpaid list and Pay supplier)', async () => {
    const milo = await product(ownerA, shopA, 'API Milo', 1500, 2);
    const purchase = await buy(ownerA, shopA, milo, 10, 15000, 0);              // 12 / 18000, owes 15000
    const res = await ret(ownerA, shopA, milo, { qty: 2, credit: 3200, type: 'reduce_unpaid', purchase });
    expect(res.data).toMatchObject({ value_removed: 3000, difference: 200, cost_impact: -200, unpaid_after: 11800, stock_qty: 10, stock_value: 15000 });
    expect(await owed(ownerA, shopA, purchase)).toBe(11800);
    const tooMuch = await ret(ownerA, shopA, milo, { qty: 1, credit: 11801, type: 'reduce_unpaid', purchase });
    expect(tooMuch.error?.message).toBe('credit_exceeds_unpaid');
    expect(JSON.parse(tooMuch.error!.details!)).toEqual({ unpaid: 11800 });
    const over = await ownerA.rpc('pay_supplier', { p_request_id: randomUUID(), p_business_id: shopA, p_purchase_id: purchase, p_amount: 11801, p_paid_from: 'momo' });
    expect(over.error?.message).toBe('amount_exceeds_unpaid');                  // T7 sees the same balance
    const refund = await ret(ownerA, shopA, milo, { qty: 1, credit: 1500, type: 'refund_momo', purchase });
    expect(refund.data).toMatchObject({ unpaid_after: 11800 });                 // refunds never reduce it
    expect(await owed(ownerA, shopA, purchase)).toBe(11800);
  });

  it('TC-INV-100c: validation and the owner decisions (R2, R4, R6, R7, Q1, O1) are enforced by the server', async () => {
    const item = await product(ownerA, shopA, 'API Return checks', 500, 3);
    const other = await product(ownerA, shopA, 'API Other product', 500, 3);
    const otherPurchase = await buy(ownerA, shopA, other, 1, 500, 0);
    const cases: [Ret, string][] = [
      [{ qty: 0, credit: 100, type: 'refund_cash' }, 'invalid_qty'],
      [{ qty: 100001, credit: 100, type: 'refund_cash' }, 'invalid_qty'],
      [{ qty: 1, credit: -1, type: 'refund_cash' }, 'invalid_credit_amount'],
      [{ qty: 1, credit: 100000001, type: 'refund_cash' }, 'invalid_credit_amount'],
      [{ qty: 1, credit: 100, type: 'bank' }, 'invalid_credit_type'],
      [{ qty: 1, credit: 100, type: 'refund_cash', reason: '  ' }, 'reason_required'],
      [{ qty: 1, credit: 100, type: 'refund_cash', reason: 'r'.repeat(301) }, 'reason_too_long'],
      [{ qty: 1, credit: 100, type: 'reduce_unpaid' }, 'purchase_required'],
      [{ qty: 1, credit: 100, type: 'refund_cash', purchase: otherPurchase }, 'purchase_product_mismatch'],
      [{ qty: 1, credit: 100, type: 'reduce_unpaid', purchase: randomUUID() }, 'purchase_not_found'],
      [{ qty: 4, credit: 100, type: 'refund_cash' }, 'insufficient_stock'],
    ];
    for (const [r, message] of cases) expect((await ret(ownerA, shopA, item, r)).error?.message).toBe(message);
    expect(await stock(ownerA, item)).toEqual({ stock_qty: 3, stock_value: 1500 });

    const unknown = await product(ownerA, shopA, 'API Unknown cost', null, 4);
    expect((await ret(ownerA, shopA, unknown, { qty: 1, credit: 100, type: 'refund_cash' })).error?.message).toBe('set_cost_first');
    const free = await product(ownerA, shopA, 'API Free pens', 0, 5);         // known cost 0 (O1)
    expect((await ret(ownerA, shopA, free, { qty: 2, credit: 2000, type: 'refund_cash' })).data)
      .toMatchObject({ value_removed: 0, difference: 2000, cost_impact: -2000, stock_qty: 3, stock_value: 0 });
    const old = await product(ownerA, shopA, 'API Old torch', 50, 3);
    await ownerA.rpc('set_product_archived', { p_request_id: randomUUID(), p_business_id: shopA, p_product_id: old, p_archived: true });
    const archived = await ret(ownerA, shopA, old, { qty: 3, credit: 0, type: 'refund_cash' });   // R6 + R7, whole stock
    expect(archived.data).toMatchObject({ value_removed: 150, credit_amount: 0, difference: -150, stock_qty: 0, stock_value: 0 });
  });

  it("TC-INV-100d: another shop's owner, signed-out callers and direct writes are refused; returns are private to the shop", async () => {
    const tin = await product(ownerA, shopA, 'API Tin', 200, 5);
    expect((await ret(ownerB, shopA, tin, { qty: 1, credit: 100, type: 'refund_cash' })).error?.message).toBe('not_a_member');
    expect((await ret(ownerB, shopB, tin, { qty: 1, credit: 100, type: 'refund_cash' })).error?.message).toBe('product_not_found');
    expect((await ret(anonClient(target), shopA, tin, { qty: 1, credit: 100, type: 'refund_cash' })).error?.code).toBe('42501');
    const direct = await ownerA.from('supplier_returns').insert({ business_id: shopA, product_id: tin, qty: 1, value_removed: 0, credit_amount: 0, credit_type: 'refund_cash', reason: 'x' });
    expect(direct.error?.code).toBe('42501');
    expect(await stock(ownerA, tin)).toEqual({ stock_qty: 5, stock_value: 1000 });
    expect((await ret(ownerA, shopA, tin, { qty: 1, credit: 200, type: 'refund_cash' })).error).toBeNull();
    const { data: bView } = await ownerB.from('supplier_returns').select('id').eq('product_id', tin);
    expect(bView).toEqual([]);
  });

  it('TC-INV-100e: a repeated request is applied once; another owner cannot replay its request ID', async () => {
    const oil = await product(ownerA, shopA, 'API Oil', 700, 6);
    const requestId = randomUUID();
    const first = await ret(ownerA, shopA, oil, { qty: 2, credit: 1400, type: 'refund_momo' }, requestId);
    const second = await ret(ownerA, shopA, oil, { qty: 2, credit: 1400, type: 'refund_momo' }, requestId);
    expect(first.error).toBeNull();
    expect(second.data).toEqual(first.data);
    expect(await stock(ownerA, oil)).toEqual({ stock_qty: 4, stock_value: 2800 });
    const { data: rows } = await ownerA.from('supplier_returns').select('id').eq('product_id', oil);
    expect(rows).toHaveLength(1);
    const bOil = await product(ownerB, shopB, 'B Oil', 700, 3);
    expect((await ret(ownerB, shopB, bOil, { qty: 1, credit: 700, type: 'refund_cash' }, requestId)).error?.message).toBe('request_id_reused');
  });

  it('TC-INV-100f (R2 under concurrency): 5 parallel returns of 3 with 10 in stock: exactly 3 succeed, 1 unit left', async () => {
    const soap = await product(ownerA, shopA, 'API Parallel soap', 300, 10);
    const results = await Promise.all(Array.from({ length: 5 }, () => ret(ownerA, shopA, soap, { qty: 3, credit: 900, type: 'refund_cash' })));
    expect(results.filter((r) => r.error === null)).toHaveLength(3);
    expect(results.filter((r) => r.error?.message === 'insufficient_stock')).toHaveLength(2);
    expect(results.filter((r) => r.error === null).map((r) => r.data.stock_qty as number).sort((x, y) => y - x)).toEqual([7, 4, 1]);
    expect(await stock(ownerA, soap)).toEqual({ stock_qty: 1, stock_value: 300 });
    const { data: mv } = await ownerA.from('stock_movements').select('type').eq('product_id', soap).eq('type', 'supplier_return');
    expect(mv).toHaveLength(3);
  });

  it('TC-INV-100g (lock order): return credits and supplier payments racing on one purchase never take it below 0', async () => {
    const sugar = await product(ownerA, shopA, 'API Racing sugar', 100, 20);
    const purchase = await buy(ownerA, shopA, sugar, 10, 1000, 0);             // owes 1000
    const pay = () => ownerA.rpc('pay_supplier', { p_request_id: randomUUID(), p_business_id: shopA, p_purchase_id: purchase, p_amount: 400, p_paid_from: 'momo' });
    const credit = () => ret(ownerA, shopA, sugar, { qty: 1, credit: 400, type: 'reduce_unpaid', purchase });
    const results = await Promise.all([pay(), credit(), pay(), credit(), pay(), credit()]);
    const ok = results.filter((r) => r.error === null);
    expect(ok).toHaveLength(2);                                                 // 1000 -> 600 -> 200, then nothing fits
    for (const r of results.filter((x) => x.error !== null)) expect(['amount_exceeds_unpaid', 'credit_exceeds_unpaid']).toContain(r.error!.message);
    expect(await owed(ownerA, shopA, purchase)).toBe(200);
    const { data: payments } = await ownerA.from('supplier_payments').select('amount').eq('purchase_id', purchase);
    const { data: credits } = await ownerA.from('supplier_returns').select('credit_amount').eq('purchase_id', purchase);
    expect(payments!.length + credits!.length).toBe(2);
  });

  it('TC-CONC-05 (return): 5 simultaneous copies of one request are recorded once, with the same result', async () => {
    const rice = await product(ownerA, shopA, 'API Duplicate rice', 1000, 8);
    const requestId = randomUUID();
    const results = await Promise.all(Array.from({ length: 5 }, () => ret(ownerA, shopA, rice, { qty: 2, credit: 1900, type: 'refund_cash' }, requestId)));
    for (const r of results) expect(r.error).toBeNull();
    for (const r of results) expect(r.data).toEqual(results[0].data);
    expect(await stock(ownerA, rice)).toEqual({ stock_qty: 6, stock_value: 6000 });
    const { data: rows } = await ownerA.from('supplier_returns').select('id').eq('product_id', rice);
    expect(rows).toHaveLength(1);
  });
});
