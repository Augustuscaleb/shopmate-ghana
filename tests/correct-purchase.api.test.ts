/**
 * Stage 1C, task T9: Correct purchase through the real API path (Auth + PostgREST), as the app will
 * call it, including parallel requests (separate PostgREST connections). LOCAL stack only until the
 * migrations are applied to the cloud project with the owner's approval (D11). Fictitious data only;
 * no service-role key: every fixture goes through the public functions (sales and voids are covered
 * by the database tests with fixtures).
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

type Corr = { type: string | null; cost?: number | null; qty?: number | null; refund?: number | null; method?: string | null; reason?: string };
const correct = (client: SupabaseClient, shop: string, purchaseId: string, c: Corr, requestId = randomUUID()) =>
  client.rpc('correct_purchase', {
    p_request_id: requestId, p_business_id: shop, p_purchase_id: purchaseId, p_type: c.type,
    p_reason: c.reason ?? 'Invoice corrected', p_cost_change: c.cost ?? null, p_qty_change: c.qty ?? null,
    p_refund_amount: c.refund ?? null, p_refund_method: c.method ?? null,
  });

async function product(client: SupabaseClient, shop: string, name: string): Promise<string> {
  const { data, error } = await client.rpc('create_product', { p_request_id: randomUUID(), p_business_id: shop, p_name: name, p_selling_price: 1000 });
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

async function adjust(client: SupabaseClient, shop: string, productId: string, reason: string, change: number) {
  const { error } = await client.rpc('adjust_stock', { p_request_id: randomUUID(), p_business_id: shop, p_product_id: productId, p_reason: reason, p_qty_change: change });
  if (error) throw error;
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

const pay = (client: SupabaseClient, shop: string, purchaseId: string, amount: number) =>
  client.rpc('pay_supplier', { p_request_id: randomUUID(), p_business_id: shop, p_purchase_id: purchaseId, p_amount: amount, p_paid_from: 'momo' });

describe.skipIf(target.mode === 'cloud')('Correct purchase through the API (T9)', () => {
  beforeAll(async () => {
    const a = await signedInOwner(target, 'correct-a', run);
    const b = await signedInOwner(target, 'correct-b', run);
    ownerA = a.client;
    ownerB = b.client;
    const ca = await ownerA.rpc('create_business', { p_request_id: randomUUID(), p_name: 'Correction Shop A', p_type: 'provision' });
    const cb = await ownerB.rpc('create_business', { p_request_id: randomUUID(), p_name: 'Correction Shop B', p_type: 'minimart' });
    if (ca.error) throw ca.error;
    if (cb.error) throw cb.error;
    shopA = ca.data.business_id;
    shopB = cb.data.business_id;
  });

  it('TC-INV-110a: a cost correction splits ΔC by the history (Model A): only R moves stock value; one item; the amount owed + ΔC', async () => {
    const tin = await product(ownerA, shopA, 'API Tomato tin');
    const purchase = await buy(ownerA, shopA, tin, 10, 1000, 0);             // 10 / 1000
    await adjust(ownerA, shopA, tin, 'damaged', -1);                           // L 1/10, f 9/10
    await adjust(ownerA, shopA, tin, 'own_use', -1);                           // U 1/10, f 8/10
    const ret = await ownerA.rpc('return_to_supplier', { p_request_id: randomUUID(), p_business_id: shopA, p_product_id: tin, p_qty: 2,
      p_credit_amount: 200, p_credit_type: 'refund_cash', p_reason: 'Dented', p_purchase_id: purchase });   // T 2/10, f 6/10
    expect(ret.error).toBeNull();
    const before = await stock(ownerA, tin);                                   // 6 / 600
    const res = await correct(ownerA, shopA, purchase, { type: 'cost', cost: 1000 });
    expect(res.error).toBeNull();
    expect(res.data.allocation.parts).toEqual({ remaining_stock: 600, already_sold: 0, stock_losses: 100, own_use: 100, returns_to_supplier: 200 });
    expect(res.data.allocation.remaining_fraction).toEqual({ num: '3', den: '5' });
    expect(res.data.allocation.exact).toBe(true);
    expect(await stock(ownerA, tin)).toEqual({ stock_qty: before.stock_qty, stock_value: before.stock_value + 600 });
    const { data: mv } = await ownerA.from('stock_movements').select('id, qty_change, value').eq('product_id', tin).eq('type', 'purchase_correction');
    expect(mv).toEqual([{ id: res.data.movement_id, qty_change: 0, value: 600 }]);
    expect(await owed(ownerA, shopA, purchase)).toBe(2000);                    // the T8 cash refund is not counted
    const { data: items } = await ownerA.from('attention_items').select('type, entity').eq('entity_id', res.data.correction_id);
    expect(items).toEqual([{ type: 'purchase_correction', entity: 'purchase_correction' }]);
  });

  it('TC-INV-110b: quantity corrections: no value change; stock may reach exactly 0, never below; at least 1 received', async () => {
    const rice = await product(ownerA, shopA, 'API Rice');
    const purchase = await buy(ownerA, shopA, rice, 5, 1000, 0);
    const up = await correct(ownerA, shopA, purchase, { type: 'quantity', qty: 1 });
    expect(up.data).toMatchObject({ corrected_qty: 6, stock_qty: 6, stock_value: 1000 });
    expect((await correct(ownerA, shopA, purchase, { type: 'quantity', qty: -7 })).error?.message).toBe('invalid_corrected_qty');
    await adjust(ownerA, shopA, rice, 'damaged', -3);                          // 3 left
    expect((await correct(ownerA, shopA, purchase, { type: 'quantity', qty: -4 })).error?.message).toBe('insufficient_stock');
    const toZero = await correct(ownerA, shopA, purchase, { type: 'quantity', qty: -3 });
    expect(toZero.error).toBeNull();
    expect(toZero.data).toMatchObject({ corrected_qty: 3, stock_qty: 0, stock_value: 0 });
    expect(toZero.data.allocation.pool_adjustment).toMatchObject({ reason: 'zero_stock_residue' });
    expect(await owed(ownerA, shopA, purchase)).toBe(1000);                    // unchanged
    expect((await correct(ownerA, shopA, purchase, { type: 'quantity', qty: 1, refund: 10, method: 'cash' })).error?.message).toBe('refund_not_needed');
  });

  it('TC-INV-110c (C2, Q6): the refund example: -300 needs exactly 300 back; a later +200 leaves 200 owed, seen by Pay supplier', async () => {
    const oil = await product(ownerA, shopA, 'API Oil');
    const purchase = await buy(ownerA, shopA, oil, 10, 1000, 1000);
    const needed = await correct(ownerA, shopA, purchase, { type: 'cost', cost: -300 });
    expect(needed.error?.message).toBe('refund_required');
    expect(JSON.parse(needed.error!.details!)).toEqual({ refund_amount: 300 });
    expect((await correct(ownerA, shopA, purchase, { type: 'cost', cost: -300, refund: 299, method: 'cash' })).error?.message).toBe('refund_required');
    expect((await correct(ownerA, shopA, purchase, { type: 'cost', cost: -300, refund: 300, method: 'bank' })).error?.message).toBe('invalid_refund_method');
    const step2 = await correct(ownerA, shopA, purchase, { type: 'cost', cost: -300, refund: 300, method: 'cash' });
    expect(step2.data).toMatchObject({ refund_amount: 300, unpaid_before: 0, unpaid_after: 0 });
    expect((await correct(ownerA, shopA, purchase, { type: 'cost', cost: 200, refund: 1, method: 'cash' })).error?.message).toBe('refund_not_needed');
    const step3 = await correct(ownerA, shopA, purchase, { type: 'cost', cost: 200 });
    expect(step3.data).toMatchObject({ unpaid_after: 200, corrected_cost: 900 });
    expect(await owed(ownerA, shopA, purchase)).toBe(200);
    expect((await pay(ownerA, shopA, purchase, 201)).error?.message).toBe('amount_exceeds_unpaid');
    expect((await pay(ownerA, shopA, purchase, 200)).data).toMatchObject({ unpaid_after: 0 });
    const { data: rows } = await ownerA.from('purchase_corrections').select('cost_change, refund_amount, refund_method').eq('purchase_id', purchase).order('created_at');
    expect(rows).toEqual([{ cost_change: -300, refund_amount: 300, refund_method: 'cash' }, { cost_change: 200, refund_amount: 0, refund_method: null }]);
  });

  it('TC-INV-110d (T7, T8): payments, return credits, return refunds and corrections combine in one balance', async () => {
    const sugar = await product(ownerA, shopA, 'API Sugar');
    const purchase = await buy(ownerA, shopA, sugar, 10, 5000, 0);
    await pay(ownerA, shopA, purchase, 1000);
    const credit = await ownerA.rpc('return_to_supplier', { p_request_id: randomUUID(), p_business_id: shopA, p_product_id: sugar, p_qty: 1,
      p_credit_amount: 500, p_credit_type: 'reduce_unpaid', p_reason: 'Torn', p_purchase_id: purchase });
    const refund = await ownerA.rpc('return_to_supplier', { p_request_id: randomUUID(), p_business_id: shopA, p_product_id: sugar, p_qty: 1,
      p_credit_amount: 500, p_credit_type: 'refund_momo', p_reason: 'Torn', p_purchase_id: purchase });
    expect(credit.error).toBeNull();
    expect(refund.error).toBeNull();
    expect(await owed(ownerA, shopA, purchase)).toBe(3500);                    // 5000 - 1000 - 500 credit; the MoMo refund is excluded
    const down = await correct(ownerA, shopA, purchase, { type: 'cost', cost: -3600, refund: 100, method: 'momo' });
    expect(down.data).toMatchObject({ unpaid_before: 3500, unpaid_after: 0, refund_amount: 100 });
    const back = await ownerA.rpc('return_to_supplier', { p_request_id: randomUUID(), p_business_id: shopA, p_product_id: sugar, p_qty: 1,
      p_credit_amount: 1, p_credit_type: 'reduce_unpaid', p_reason: 'More', p_purchase_id: purchase });
    expect(back.error?.message).toBe('credit_exceeds_unpaid');                 // T8 sees the revised (zero) balance
  });

  it('TC-INV-110e (U4): GH₵1,000,000 limits on ΔC and the corrected cost, in pesewas', async () => {
    const gold = await product(ownerA, shopA, 'API Gold');
    const free = await buy(ownerA, shopA, gold, 1, 0, 0);
    const max = await buy(ownerA, shopA, gold, 1, 100000000, 0);
    expect((await correct(ownerA, shopA, free, { type: 'cost', cost: 100000001 })).error?.message).toBe('invalid_cost_change');
    expect((await correct(ownerA, shopA, free, { type: 'cost', cost: 100000000 })).data).toMatchObject({ corrected_cost: 100000000 });
    expect((await correct(ownerA, shopA, max, { type: 'cost', cost: 1 })).error?.message).toBe('invalid_corrected_cost');
    expect((await correct(ownerA, shopA, max, { type: 'cost', cost: -100000001 })).error?.message).toBe('invalid_cost_change');
    expect((await correct(ownerA, shopA, max, { type: 'cost', cost: -100000000 })).data).toMatchObject({ corrected_cost: 0, unpaid_after: 0 });
    expect((await correct(ownerA, shopA, max, { type: 'cost', cost: -1 })).error?.message).toBe('invalid_corrected_cost');
  });

  it("TC-INV-110f: validation, another shop's owner, signed-out callers and direct writes are refused; corrections are private", async () => {
    const tin = await product(ownerA, shopA, 'API Isolation tin');
    const purchase = await buy(ownerA, shopA, tin, 4, 400, 0);
    const cases: [Corr, string][] = [
      [{ type: 'price', cost: 1 }, 'invalid_correction_type'],
      [{ type: 'cost', cost: 1, qty: 1 }, 'change_mismatch'],
      [{ type: 'cost', cost: 0 }, 'invalid_cost_change'],
      [{ type: 'quantity', qty: 0 }, 'invalid_qty_change'],
      [{ type: 'cost', cost: 1, reason: '  ' }, 'reason_required'],
    ];
    for (const [c, message] of cases) expect((await correct(ownerA, shopA, purchase, c)).error?.message).toBe(message);
    expect((await correct(ownerB, shopA, purchase, { type: 'cost', cost: 1 })).error?.message).toBe('not_a_member');
    expect((await correct(ownerB, shopB, purchase, { type: 'cost', cost: 1 })).error?.message).toBe('purchase_not_found');
    expect((await correct(anonClient(target), shopA, purchase, { type: 'cost', cost: 1 })).error?.code).toBe('42501');
    const direct = await ownerA.from('purchase_corrections').insert({ business_id: shopA, purchase_id: purchase, type: 'cost', cost_change: 1, reason: 'x', allocation: {}, allocation_exact: true });
    expect(direct.error?.code).toBe('42501');
    expect(await owed(ownerA, shopA, purchase)).toBe(400);
    expect((await correct(ownerA, shopA, purchase, { type: 'cost', cost: 100 })).error).toBeNull();
    const { data: bView } = await ownerB.from('purchase_corrections').select('id').eq('purchase_id', purchase);
    expect(bView).toEqual([]);
  });

  it('TC-INV-110g: a repeated request is applied once; another owner cannot replay its request ID', async () => {
    const milk = await product(ownerA, shopA, 'API Milk');
    const purchase = await buy(ownerA, shopA, milk, 4, 400, 0);
    const requestId = randomUUID();
    const first = await correct(ownerA, shopA, purchase, { type: 'cost', cost: 100 }, requestId);
    const second = await correct(ownerA, shopA, purchase, { type: 'cost', cost: 100 }, requestId);
    expect(first.error).toBeNull();
    expect(second.data).toEqual(first.data);
    expect(await stock(ownerA, milk)).toEqual({ stock_qty: 4, stock_value: 500 });
    expect(await owed(ownerA, shopA, purchase)).toBe(500);
    const bMilk = await product(ownerB, shopB, 'B Milk');
    const bPurchase = await buy(ownerB, shopB, bMilk, 1, 100, 0);
    expect((await correct(ownerB, shopB, bPurchase, { type: 'cost', cost: 1 }, requestId)).error?.message).toBe('request_id_reused');
  });

  it('TC-INV-110h (lock order): a correction racing a payment on one purchase never leaves an unrecorded overpayment', async () => {
    for (let round = 0; round < 3; round++) {
      const salt = await product(ownerA, shopA, `API Racing salt ${round}`);
      const purchase = await buy(ownerA, shopA, salt, 10, 1000, 0);          // owes 1000
      const [p, c] = await Promise.all([pay(ownerA, shopA, purchase, 1000), correct(ownerA, shopA, purchase, { type: 'cost', cost: -600 })]);
      // Either the payment came first (then -600 needs a 600 refund and is refused), or the correction did (then 1000 > 400 is refused)
      expect([p.error === null, c.error === null].filter(Boolean)).toHaveLength(1);
      if (p.error === null) {
        expect(c.error?.message).toBe('refund_required');
        expect(await owed(ownerA, shopA, purchase)).toBe(0);
      } else {
        expect(p.error?.message).toBe('amount_exceeds_unpaid');
        expect(await owed(ownerA, shopA, purchase)).toBe(400);
      }
    }
  });

  it('TC-INV-110i (lock order): an adjustment arriving while a correction runs never makes the split disagree with the stock', async () => {
    for (let round = 0; round < 3; round++) {
      const soap = await product(ownerA, shopA, `API Racing soap ${round}`);
      const purchase = await buy(ownerA, shopA, soap, 10, 1000, 0);          // 10 / 1000
      const correction = correct(ownerA, shopA, purchase, { type: 'cost', cost: 1000 });
      await new Promise((resolve) => setTimeout(resolve, 30 * round));      // the adjustment lands during the correction
      const adjustment = ownerA.rpc('adjust_stock', { p_request_id: randomUUID(), p_business_id: shopA, p_product_id: soap, p_reason: 'damaged', p_qty_change: -5 });
      const [c, a] = await Promise.all([correction, adjustment]);
      expect(c.error).toBeNull();
      expect(a.error).toBeNull();
      const parts = c.data.allocation.parts;
      if (parts.stock_losses === 500) {
        // the adjustment came first: 5 lost at 100, then R = 500 into the 5 left
        expect(parts.remaining_stock).toBe(500);
      } else {
        // the correction came first: all 1000 to stock (10 / 2000), then 5 lost at 200
        expect(parts).toMatchObject({ remaining_stock: 1000, stock_losses: 0 });
      }
      expect(await stock(ownerA, soap)).toEqual({ stock_qty: 5, stock_value: 1000 });   // either order: 5 / 1000
      const { data: all } = await ownerA.from('stock_movements').select('value').eq('product_id', soap);
      expect(all!.reduce((s, m) => s + m.value, 0)).toBe(1000);
    }
  });

  it('TC-CONC-05 (correct purchase): 5 simultaneous copies of one request are recorded once, with the same result', async () => {
    const tea = await product(ownerA, shopA, 'API Duplicate tea');
    const purchase = await buy(ownerA, shopA, tea, 4, 400, 0);
    const requestId = randomUUID();
    const results = await Promise.all(Array.from({ length: 5 }, () => correct(ownerA, shopA, purchase, { type: 'cost', cost: 200 }, requestId)));
    for (const r of results) expect(r.error).toBeNull();
    for (const r of results) expect(r.data).toEqual(results[0].data);
    const { data: rows } = await ownerA.from('purchase_corrections').select('id').eq('purchase_id', purchase);
    expect(rows).toHaveLength(1);
    expect(await stock(ownerA, tea)).toEqual({ stock_qty: 4, stock_value: 600 });
  });
});
