/**
 * Stage 1C, task T5: restock through the real API path (Auth + PostgREST), as the app will call
 * it, including parallel requests (separate PostgREST connections). LOCAL stack only until the
 * migrations are applied to the cloud project with the owner's approval (D11). Fictitious data only.
 *
 * The negative-stock fixture uses the local stack's service-role key (read from `supabase status`,
 * never used outside this file), because adjust_stock only arrives in T6.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { anonClient, signedInOwner, testTarget } from './target';

const target = testTarget();
const run = randomUUID().slice(0, 8);

let ownerA: SupabaseClient;
let ownerB: SupabaseClient;
let shopA: string;
let shopB: string;

type Restock = { qty: number; cost: number; paid: number; from?: string | null; date?: string; supplier?: string; note?: string };
const restock = (client: SupabaseClient, shop: string, productId: string, r: Restock, requestId = randomUUID()) =>
  client.rpc('restock', {
    p_request_id: requestId, p_business_id: shop, p_product_id: productId, p_qty: r.qty, p_purchase_cost: r.cost,
    p_paid_now: r.paid, p_paid_from: r.from ?? null, p_purchased_on: r.date ?? null,
    p_supplier_name: r.supplier ?? null, p_note: r.note ?? null,
  });

async function product(client: SupabaseClient, shop: string, fields: Record<string, unknown>): Promise<string> {
  const { data, error } = await client.rpc('create_product', { p_request_id: randomUUID(), p_business_id: shop, ...fields });
  if (error) throw error;
  return data.product_id as string;
}

async function stock(client: SupabaseClient, productId: string) {
  const { data, error } = await client.from('products').select('stock_qty, stock_value').eq('id', productId).single();
  if (error) throw error;
  return data;
}

function localServiceRoleKey(): string {
  const raw = execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8' });
  const key = JSON.parse(raw.slice(raw.indexOf('{'))).SERVICE_ROLE_KEY as string | undefined;
  if (!key) throw new Error('local service-role key not available');
  return key;
}

describe.skipIf(target.mode === 'cloud')('Restock through the API (T5)', () => {
  beforeAll(async () => {
    const a = await signedInOwner(target, 'restock-a', run);
    const b = await signedInOwner(target, 'restock-b', run);
    ownerA = a.client;
    ownerB = b.client;
    const ca = await ownerA.rpc('create_business', { p_request_id: randomUUID(), p_name: 'Restock Shop A', p_type: 'provision' });
    const cb = await ownerB.rpc('create_business', { p_request_id: randomUUID(), p_name: 'Restock Shop B', p_type: 'minimart' });
    if (ca.error) throw ca.error;
    if (cb.error) throw cb.error;
    shopA = ca.data.business_id;
    shopB = cb.data.business_id;
  });

  it('TC-INV-68a: TC-PUR-01 through the API: full cost enters stock value, the unpaid amount is owed', async () => {
    const item = await product(ownerA, shopA, { p_name: 'API Rice bag', p_selling_price: 7000 });
    const res = await restock(ownerA, shopA, item, { qty: 10, cost: 50000, paid: 30000, from: 'cash_drawer', supplier: ' Makola ', note: 'First delivery' });
    expect(res.error).toBeNull();
    expect(res.data).toMatchObject({ unpaid: 20000, stock_qty: 10, stock_value: 50000, revaluation: null });
    expect(await stock(ownerA, item)).toEqual({ stock_qty: 10, stock_value: 50000 });
    const { data: pur } = await ownerA.from('purchases').select('qty, purchase_cost, paid_now, paid_now_from, supplier_name, note, movement_id').eq('id', res.data.purchase_id).single();
    expect(pur).toEqual({ qty: 10, purchase_cost: 50000, paid_now: 30000, paid_now_from: 'cash_drawer', supplier_name: 'Makola', note: 'First delivery', movement_id: null });
    const { data: mv } = await ownerA.from('stock_movements').select('type, qty_change, value, purchase_id').eq('id', res.data.movement_id).single();
    expect(mv).toEqual({ type: 'restock', qty_change: 10, value: 50000, purchase_id: res.data.purchase_id });
    const { data: hist } = await ownerA.from('product_cost_history').select('cause, avg_cost').eq('movement_id', res.data.movement_id);
    expect(hist).toEqual([{ cause: 'restock', avg_cost: 5000 }]);
  });

  it('TC-INV-68b: TC-COST-01 weighted average through the API', async () => {
    const milo = await product(ownerA, shopA, { p_name: 'API Milo', p_selling_price: 150, p_cost_price: 1100, p_opening_stock: 10 });
    const res = await restock(ownerA, shopA, milo, { qty: 12, cost: 13920, paid: 13920, from: 'momo' });
    expect(res.data).toMatchObject({ stock_qty: 22, stock_value: 24920 });
    const { data: hist } = await ownerA.from('product_cost_history').select('avg_cost').eq('movement_id', res.data.movement_id).single();
    expect(hist?.avg_cost).toBe(1132.7273);
  });

  it('TC-INV-68c: validation and the owner decisions are enforced by the server', async () => {
    const item = await product(ownerA, shopA, { p_name: 'API Checks', p_selling_price: 500, p_cost_price: 300, p_opening_stock: 2 });
    const cases: [Restock, string][] = [
      [{ qty: 0, cost: 100, paid: 0 }, 'invalid_qty'],
      [{ qty: 100001, cost: 100, paid: 0 }, 'invalid_qty'],
      [{ qty: 1, cost: 100000001, paid: 0 }, 'invalid_purchase_cost'],
      [{ qty: 1, cost: 500, paid: 501, from: 'cash_drawer' }, 'invalid_paid_now'],
      [{ qty: 1, cost: 500, paid: 100 }, 'paid_from_required'],
      [{ qty: 1, cost: 500, paid: 100, from: 'bank' }, 'invalid_paid_from'],
      [{ qty: 1, cost: 500, paid: 0, date: '2999-01-01' }, 'invalid_purchase_date'],
      [{ qty: 1, cost: 500, paid: 0, date: '2000-01-01' }, 'invalid_purchase_date'],
    ];
    for (const [r, message] of cases) {
      expect((await restock(ownerA, shopA, item, r)).error?.message).toBe(message);
    }
    const unknown = await product(ownerA, shopA, { p_name: 'API Unknown cost', p_selling_price: 500, p_opening_stock: 3 });
    expect((await restock(ownerA, shopA, unknown, { qty: 1, cost: 500, paid: 0 })).error?.message).toBe('set_cost_first');
    const old = await product(ownerA, shopA, { p_name: 'API Archived', p_selling_price: 500 });
    await ownerA.rpc('set_product_archived', { p_request_id: randomUUID(), p_business_id: shopA, p_product_id: old, p_archived: true });
    expect((await restock(ownerA, shopA, old, { qty: 1, cost: 500, paid: 0 })).error?.message).toBe('product_archived');
    expect(await stock(ownerA, item)).toEqual({ stock_qty: 2, stock_value: 600 });
  });

  it("TC-INV-68d: another shop's owner, signed-out callers and direct writes are refused", async () => {
    const tin = await product(ownerA, shopA, { p_name: 'API Tin', p_selling_price: 400, p_cost_price: 200, p_opening_stock: 5 });
    expect((await restock(ownerB, shopA, tin, { qty: 1, cost: 100, paid: 0 })).error?.message).toBe('not_a_member');
    expect((await restock(ownerB, shopB, tin, { qty: 1, cost: 100, paid: 0 })).error?.message).toBe('product_not_found');
    expect((await restock(anonClient(target), shopA, tin, { qty: 1, cost: 100, paid: 0 })).error?.code).toBe('42501');
    const directPurchase = await ownerA.from('purchases').insert({ business_id: shopA, product_id: tin, qty: 1, purchase_cost: 1, purchased_on: '2026-11-24' });
    expect(directPurchase.error?.code).toBe('42501');
    const directMovement = await ownerA.from('stock_movements').insert({ business_id: shopA, product_id: tin, type: 'opening', qty_change: 1, value: 1 });
    expect(directMovement.error?.code).toBe('42501');
    expect(await stock(ownerA, tin)).toEqual({ stock_qty: 5, stock_value: 1000 });
  });

  it('TC-INV-68e: a repeated request is applied once; another owner cannot replay its request ID (different-user replay refused)', async () => {
    const oil = await product(ownerA, shopA, { p_name: 'API Oil', p_selling_price: 900, p_cost_price: 700, p_opening_stock: 3 });
    const requestId = randomUUID();
    const first = await restock(ownerA, shopA, oil, { qty: 4, cost: 2800, paid: 2800, from: 'cash_drawer' }, requestId);
    const second = await restock(ownerA, shopA, oil, { qty: 4, cost: 2800, paid: 2800, from: 'cash_drawer' }, requestId);
    expect(first.error).toBeNull();
    expect(second.data).toEqual(first.data);
    expect(await stock(ownerA, oil)).toEqual({ stock_qty: 7, stock_value: 4900 });
    const { data: purchases } = await ownerA.from('purchases').select('id').eq('product_id', oil);
    expect(purchases).toHaveLength(1);
    const bOil = await product(ownerB, shopB, { p_name: 'B Oil', p_selling_price: 900, p_cost_price: 700, p_opening_stock: 3 });
    expect((await restock(ownerB, shopB, bOil, { qty: 4, cost: 2800, paid: 0 }, requestId)).error?.message).toBe('request_id_reused');
  });

  it('TC-COST-09: 10 parallel restocks of one product give the sequential result', async () => {
    const soap = await product(ownerA, shopA, { p_name: 'API Parallel soap', p_selling_price: 500, p_cost_price: 300, p_opening_stock: 5 });
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) =>
      restock(ownerA, shopA, soap, { qty: i + 1, cost: (i + 1) * 310, paid: 0 })));
    for (const r of results) expect(r.error).toBeNull();
    // 5 + (1 + 2 + … + 10) = 60 units; 1500 + 310 × 55 = 18550
    expect(await stock(ownerA, soap)).toEqual({ stock_qty: 60, stock_value: 18550 });
    const { data: mv } = await ownerA.from('stock_movements').select('qty_change, value').eq('product_id', soap);
    expect(mv).toHaveLength(11);
    expect(mv!.reduce((s, m) => s + m.qty_change, 0)).toBe(60);
    expect(mv!.reduce((s, m) => s + m.value, 0)).toBe(18550);
    const { data: hist } = await ownerA.from('product_cost_history').select('effective_at, stock_qty_after, stock_value_after').eq('product_id', soap).order('effective_at');
    expect(hist).toHaveLength(11);
    expect(hist!.at(-1)).toMatchObject({ stock_qty_after: 60, stock_value_after: 18550 });
    expect(new Set(hist!.map((h) => h.effective_at)).size).toBe(11);
    const qtys = hist!.map((h) => h.stock_qty_after);
    for (let i = 1; i < qtys.length; i++) expect(qtys[i]).toBeGreaterThan(qtys[i - 1]);   // a single sequential order
  });

  it('TC-INV-68f (C-25 under concurrency): parallel restocks of a negative-stock product revalue the negative units only once', async () => {
    const pen = await product(ownerA, shopA, { p_name: 'API Parallel pen', p_selling_price: 400, p_cost_price: 1000, p_opening_stock: 2 });
    // Fixture: take the stock to -10 / -10000, as late sales would (adjust_stock arrives in T6)
    const admin = createClient(target.apiUrl, localServiceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } });
    const fx = await admin.from('stock_movements').insert({ business_id: shopA, product_id: pen, type: 'adjustment', reason: 'other', qty_change: -12, value: -12000 });
    expect(fx.error).toBeNull();
    const fh = await admin.from('product_cost_history').insert({ business_id: shopA, product_id: pen, stock_qty_after: -10, stock_value_after: -10000, cause: 'adjustment' });
    expect(fh.error).toBeNull();
    const fp = await admin.from('products').update({ stock_qty: -10, stock_value: -10000 }).eq('id', pen);
    expect(fp.error).toBeNull();

    const results = await Promise.all([1, 2].map(() => restock(ownerA, shopA, pen, { qty: 10, cost: 15000, paid: 0 })));
    for (const r of results) expect(r.error).toBeNull();
    // Sequential: the first revalues -10 to -15000 (change -5000) then reaches 0 / 0; the second
    // finds 0 / 0, needs no revaluation, and ends at 10 / 15000. Exactly one revaluation.
    expect(await stock(ownerA, pen)).toEqual({ stock_qty: 10, stock_value: 15000 });
    expect(results.filter((r) => r.data.revaluation !== null)).toHaveLength(1);
    const { data: adj } = await ownerA.from('stock_movements').select('value').eq('product_id', pen).eq('reason', 'negative_stock_revaluation');
    expect(adj).toEqual([{ value: -5000 }]);

    // Exactly two purchases, each with exactly one restock movement linked to it
    const { data: purchases } = await ownerA.from('purchases').select('id, qty, purchase_cost').eq('product_id', pen);
    expect(purchases).toHaveLength(2);
    for (const p of purchases!) expect(p).toMatchObject({ qty: 10, purchase_cost: 15000 });
    const { data: restocks } = await ownerA.from('stock_movements').select('purchase_id, qty_change, value').eq('product_id', pen).eq('type', 'restock');
    expect(restocks).toHaveLength(2);
    expect(new Set(restocks!.map((m) => m.purchase_id))).toEqual(new Set(purchases!.map((p) => p.id)));
    for (const m of restocks!) expect(m).toMatchObject({ qty_change: 10, value: 15000 });

    // Exactly one C-25 Needs attention item, pointing at the single revaluation movement
    const { data: revaluation } = await ownerA.from('stock_movements').select('id').eq('product_id', pen).eq('reason', 'negative_stock_revaluation').single();
    const { data: items } = await ownerA.from('attention_items').select('type, entity, entity_id, status, message_data')
      .eq('type', 'cost_adjustment').eq('message_data->>rule', 'C-25').eq('message_data->>product_id', pen);
    expect(items).toHaveLength(1);
    expect(items![0]).toMatchObject({ entity: 'stock_movement', entity_id: revaluation!.id, status: 'open' });
    expect(items![0].message_data).toMatchObject({ units_revalued: 10, value_change: -5000 });

    // Conservation: the product's stock equals the sum of all its movements, with one history row each
    const { data: all } = await ownerA.from('stock_movements').select('qty_change, value').eq('product_id', pen);
    expect(all!.reduce((s, m) => s + m.qty_change, 0)).toBe(10);
    expect(all!.reduce((s, m) => s + m.value, 0)).toBe(15000);
    const { count: historyRows } = await ownerA.from('product_cost_history').select('id', { count: 'exact', head: true }).eq('product_id', pen);
    expect(historyRows).toBe(all!.length);
  });

  it('TC-CONC-05 (restock): 5 simultaneous copies of one request are recorded once, with the same result', async () => {
    const rice = await product(ownerA, shopA, { p_name: 'API Duplicate rice', p_selling_price: 1500, p_cost_price: 1000, p_opening_stock: 1 });
    const requestId = randomUUID();
    const results = await Promise.all(Array.from({ length: 5 }, () =>
      restock(ownerA, shopA, rice, { qty: 3, cost: 3300, paid: 3300, from: 'momo' }, requestId)));
    for (const r of results) expect(r.error).toBeNull();
    for (const r of results) expect(r.data).toEqual(results[0].data);
    expect(await stock(ownerA, rice)).toEqual({ stock_qty: 4, stock_value: 4300 });
    const { data: purchases } = await ownerA.from('purchases').select('id').eq('product_id', rice);
    expect(purchases).toHaveLength(1);
  });
});
