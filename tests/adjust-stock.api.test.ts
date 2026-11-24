/**
 * Stage 1C, task T6: adjust_stock through the real API path (Auth + PostgREST), as the app will
 * call it, including parallel requests (separate PostgREST connections). LOCAL stack only until
 * the migrations are applied to the cloud project with the owner's approval (D11). Fictitious data
 * only. No service-role key is used: every fixture goes through the public functions.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anonClient, signedInOwner, testTarget } from './target';

const target = testTarget();
const run = randomUUID().slice(0, 8);

let ownerA: SupabaseClient;
let ownerB: SupabaseClient;
let shopA: string;
let shopB: string;

type Adjust = { reason: string | null; count?: number; change?: number; note?: string };
const adjust = (client: SupabaseClient, shop: string, productId: string, a: Adjust, requestId = randomUUID()) =>
  client.rpc('adjust_stock', {
    p_request_id: requestId, p_business_id: shop, p_product_id: productId, p_reason: a.reason,
    p_counted_qty: a.count ?? null, p_qty_change: a.change ?? null, p_note: a.note ?? null,
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

async function movements(client: SupabaseClient, productId: string) {
  const { data, error } = await client.from('stock_movements').select('id, type, qty_change, value, reason').eq('product_id', productId);
  if (error) throw error;
  return data!;
}

describe.skipIf(target.mode === 'cloud')('Adjust stock through the API (T6)', () => {
  beforeAll(async () => {
    const a = await signedInOwner(target, 'adjust-a', run);
    const b = await signedInOwner(target, 'adjust-b', run);
    ownerA = a.client;
    ownerB = b.client;
    const ca = await ownerA.rpc('create_business', { p_request_id: randomUUID(), p_name: 'Adjust Shop A', p_type: 'provision' });
    const cb = await ownerB.rpc('create_business', { p_request_id: randomUUID(), p_name: 'Adjust Shop B', p_type: 'minimart' });
    if (ca.error) throw ca.error;
    if (cb.error) throw cb.error;
    shopA = ca.data.business_id;
    shopB = cb.data.business_id;
  });

  it('TC-INV-80a: losses, own use and stock found at the average through the API (TC-LOSS-01, TC-LOSS-02, TC-PUR-09)', async () => {
    const paste = await product(ownerA, shopA, { p_name: 'API Tomato paste', p_selling_price: 500, p_cost_price: 400, p_opening_stock: 20 });
    const damaged = await adjust(ownerA, shopA, paste, { reason: 'damaged', change: -2 });
    expect(damaged.error).toBeNull();
    expect(damaged.data).toMatchObject({ outcome: 'adjusted', kind: 'stock_loss', qty_change: -2, value_change: -800, stock_qty: 18, stock_value: 7200 });
    const own = await adjust(ownerA, shopA, paste, { reason: 'own_use', change: -3, note: ' Family dinner ' });
    expect(own.data).toMatchObject({ kind: 'own_use', value_change: -1200, stock_qty: 15, stock_value: 6000 });
    const counted = await adjust(ownerA, shopA, paste, { reason: 'count_correction', count: 17 });
    expect(counted.data).toMatchObject({ kind: 'stock_found', qty_change: 2, value_change: 800, stock_qty: 17, stock_value: 6800 });
    expect(await stock(ownerA, paste)).toEqual({ stock_qty: 17, stock_value: 6800 });   // average still 400

    const { data: mv } = await ownerA.from('stock_movements').select('type, qty_change, value, reason, unit_cost, note').eq('id', own.data.movement_id).single();
    expect(mv).toEqual({ type: 'adjustment', qty_change: -3, value: -1200, reason: 'own_use', unit_cost: 400, note: 'Family dinner' });
    const { data: hist } = await ownerA.from('product_cost_history').select('cause, stock_qty_after, stock_value_after, avg_cost').eq('movement_id', counted.data.movement_id);
    expect(hist).toEqual([{ cause: 'adjustment', stock_qty_after: 17, stock_value_after: 6800, avg_cost: 400 }]);
  });

  it('TC-INV-80b: validation, direction and available-stock rules (Q1, S3) are enforced by the server', async () => {
    const item = await product(ownerA, shopA, { p_name: 'API Adjust checks', p_selling_price: 500, p_cost_price: 300, p_opening_stock: 3 });
    const cases: [Adjust, string][] = [
      [{ reason: null, count: 1 }, 'reason_required'],
      [{ reason: 'theft', count: 1 }, 'invalid_reason'],
      [{ reason: 'damaged' }, 'count_or_change_required'],
      [{ reason: 'damaged', count: 1, change: -1 }, 'count_or_change_required'],
      [{ reason: 'count_correction', count: -1 }, 'invalid_count'],
      [{ reason: 'damaged', change: 0 }, 'invalid_qty'],
      [{ reason: 'other', change: 100001, note: 'Too many' }, 'invalid_qty'],
      [{ reason: 'other', change: -1 }, 'note_required'],
      [{ reason: 'other', change: -1, note: '   ' }, 'note_required'],
      [{ reason: 'damaged', change: -1, note: 'n'.repeat(301) }, 'note_too_long'],
      [{ reason: 'damaged', change: -4 }, 'insufficient_stock'],
      [{ reason: 'own_use', change: -4 }, 'insufficient_stock'],
      [{ reason: 'count_correction', change: -4 }, 'count_below_zero'],
      [{ reason: 'expired', change: 1 }, 'reason_requires_decrease'],
      [{ reason: 'missing', count: 5 }, 'reason_requires_decrease'],
    ];
    for (const [a, message] of cases) {
      expect((await adjust(ownerA, shopA, item, a)).error?.message).toBe(message);
    }
    expect(await stock(ownerA, item)).toEqual({ stock_qty: 3, stock_value: 900 });
    expect(await movements(ownerA, item)).toHaveLength(1);   // the opening stock only
  });

  it('TC-INV-80c: S1 last known average from 0, S2 archived allowed, S4 no_change writes nothing and is stable on retry', async () => {
    const soap = await product(ownerA, shopA, { p_name: 'API Soap bar', p_selling_price: 800, p_cost_price: 500, p_opening_stock: 2 });
    expect((await adjust(ownerA, shopA, soap, { reason: 'count_correction', count: 0 })).data).toMatchObject({ stock_qty: 0, stock_value: 0 });
    const found = await adjust(ownerA, shopA, soap, { reason: 'count_correction', count: 4 });
    expect(found.data).toMatchObject({ kind: 'stock_found', qty_change: 4, value_change: 2000, stock_qty: 4, stock_value: 2000 });

    const requestId = randomUUID();
    const same = await adjust(ownerA, shopA, soap, { reason: 'count_correction', count: 4 }, requestId);
    expect(same.error).toBeNull();
    expect(same.data).toEqual({ product_id: soap, outcome: 'no_change', changed: false, qty_change: 0, value_change: 0, stock_qty: 4, stock_value: 2000 });
    expect(await movements(ownerA, soap)).toHaveLength(3);
    expect((await adjust(ownerA, shopA, soap, { reason: 'damaged', change: -1 })).error).toBeNull();
    const retry = await adjust(ownerA, shopA, soap, { reason: 'count_correction', count: 4 }, requestId);
    expect(retry.data).toEqual(same.data);                    // the stored outcome, not a new count
    expect(await stock(ownerA, soap)).toEqual({ stock_qty: 3, stock_value: 1500 });

    const torch = await product(ownerA, shopA, { p_name: 'API Old torch', p_selling_price: 2500, p_cost_price: 50, p_opening_stock: 3 });
    await ownerA.rpc('set_product_archived', { p_request_id: randomUUID(), p_business_id: shopA, p_product_id: torch, p_archived: true });
    expect((await adjust(ownerA, shopA, torch, { reason: 'damaged', change: -1 })).data).toMatchObject({ stock_qty: 2, stock_value: 100 });

    const unknown = await product(ownerA, shopA, { p_name: 'API Unknown cost', p_selling_price: 500 });
    expect((await adjust(ownerA, shopA, unknown, { reason: 'count_correction', count: 5 })).data).toMatchObject({ value_change: 0, stock_qty: 5, stock_value: 0 });
    const { data: p } = await ownerA.from('products').select('cost_known').eq('id', unknown).single();
    expect(p?.cost_known).toBe(false);
  });

  it("TC-INV-80d: another shop's owner, signed-out callers and direct writes are refused", async () => {
    const tin = await product(ownerA, shopA, { p_name: 'API Tin', p_selling_price: 400, p_cost_price: 200, p_opening_stock: 5 });
    expect((await adjust(ownerB, shopA, tin, { reason: 'damaged', change: -1 })).error?.message).toBe('not_a_member');
    expect((await adjust(ownerB, shopB, tin, { reason: 'damaged', change: -1 })).error?.message).toBe('product_not_found');
    expect((await adjust(anonClient(target), shopA, tin, { reason: 'damaged', change: -1 })).error?.code).toBe('42501');
    const directMovement = await ownerA.from('stock_movements').insert({ business_id: shopA, product_id: tin, type: 'adjustment', reason: 'damaged', qty_change: -1, value: -200 });
    expect(directMovement.error?.code).toBe('42501');
    const directProduct = await ownerA.from('products').update({ stock_qty: 1 }).eq('id', tin);
    expect(directProduct.error?.code).toBe('42501');
    const directDiscrepancy = await ownerA.from('stock_discrepancies').update({ status: 'resolved' }).eq('product_id', tin).select();
    expect(directDiscrepancy.error?.code).toBe('42501');
    expect(await stock(ownerA, tin)).toEqual({ stock_qty: 5, stock_value: 1000 });
    const { data: bView } = await ownerB.from('stock_movements').select('id').eq('product_id', tin);
    expect(bView).toEqual([]);                                // RLS: owner B cannot even see them
  });

  it('TC-INV-80e: a repeated request is applied once; another owner cannot replay its request ID', async () => {
    const oil = await product(ownerA, shopA, { p_name: 'API Oil', p_selling_price: 900, p_cost_price: 700, p_opening_stock: 6 });
    const requestId = randomUUID();
    const first = await adjust(ownerA, shopA, oil, { reason: 'count_correction', count: 4 }, requestId);
    const second = await adjust(ownerA, shopA, oil, { reason: 'count_correction', count: 4 }, requestId);
    expect(first.error).toBeNull();
    expect(second.data).toEqual(first.data);
    expect(await stock(ownerA, oil)).toEqual({ stock_qty: 4, stock_value: 2800 });
    expect((await movements(ownerA, oil)).filter((m) => m.type === 'adjustment')).toHaveLength(1);
    const bOil = await product(ownerB, shopB, { p_name: 'B Oil', p_selling_price: 900, p_cost_price: 700, p_opening_stock: 3 });
    expect((await adjust(ownerB, shopB, bOil, { reason: 'damaged', change: -1 }, requestId)).error?.message).toBe('request_id_reused');
  });

  it('TC-INV-80f (Q1 under concurrency): 12 parallel losses of 1 unit with 10 in stock: exactly 10 succeed, stock ends at 0 / 0', async () => {
    const eggs = await product(ownerA, shopA, { p_name: 'API Parallel eggs', p_selling_price: 200, p_cost_price: 133, p_opening_stock: 10 });
    const results = await Promise.all(Array.from({ length: 12 }, () => adjust(ownerA, shopA, eggs, { reason: 'damaged', change: -1 })));
    expect(results.filter((r) => r.error === null)).toHaveLength(10);
    expect(results.filter((r) => r.error?.message === 'insufficient_stock')).toHaveLength(2);
    expect(await stock(ownerA, eggs)).toEqual({ stock_qty: 0, stock_value: 0 });
    const mv = await movements(ownerA, eggs);
    expect(mv.filter((m) => m.type === 'adjustment')).toHaveLength(10);
    expect(mv.filter((m) => m.type === 'cost_adjustment')).toHaveLength(0);   // each loss at the exact average: no residue
    expect(mv.reduce((s, m) => s + m.value, 0)).toBe(0);
    const stockAfter = results.filter((r) => r.error === null).map((r) => r.data.stock_qty as number).sort((x, y) => y - x);
    expect(stockAfter).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);                // a single sequential order
  });

  it('TC-INV-80g (counts under concurrency): parallel counts are each applied to the stock locked at that moment', async () => {
    const sugar = await product(ownerA, shopA, { p_name: 'API Parallel sugar', p_selling_price: 300, p_cost_price: 250, p_opening_stock: 10 });
    const counts = [3, 7, 12, 5, 9];
    const results = await Promise.all(counts.map((c) => adjust(ownerA, shopA, sugar, { reason: 'count_correction', count: c })));
    for (const r of results) expect(r.error).toBeNull();
    results.forEach((r, i) => expect(r.data.stock_qty).toBe(counts[i]));       // each count is the absolute result
    const { data: hist } = await ownerA.from('product_cost_history').select('stock_qty_after, stock_value_after, effective_at, movement_id')
      .eq('product_id', sugar).order('effective_at');
    const final = hist!.at(-1)!;
    expect(await stock(ownerA, sugar)).toEqual({ stock_qty: final.stock_qty_after, stock_value: final.stock_value_after });
    expect(final.stock_value_after).toBe(final.stock_qty_after * 250);         // average unchanged at 250
    // The recorded changes chain exactly: each change = its count - the stock before it
    const mv = await movements(ownerA, sugar);
    const byId = new Map(mv.map((m) => [m.id, m]));
    let before = 0;
    for (const h of hist!) {
      expect(h.stock_qty_after - before).toBe(byId.get(h.movement_id)!.qty_change);
      before = h.stock_qty_after;
    }
    expect(mv.reduce((s, m) => s + m.qty_change, 0)).toBe(final.stock_qty_after);
  });

  it('TC-CONC-05 (adjust): 5 simultaneous copies of one request are recorded once, with the same result', async () => {
    const rice = await product(ownerA, shopA, { p_name: 'API Duplicate rice', p_selling_price: 1500, p_cost_price: 1000, p_opening_stock: 8 });
    const requestId = randomUUID();
    const results = await Promise.all(Array.from({ length: 5 }, () => adjust(ownerA, shopA, rice, { reason: 'missing', change: -2 }, requestId)));
    for (const r of results) expect(r.error).toBeNull();
    for (const r of results) expect(r.data).toEqual(results[0].data);
    expect(await stock(ownerA, rice)).toEqual({ stock_qty: 6, stock_value: 6000 });
    expect((await movements(ownerA, rice)).filter((m) => m.type === 'adjustment')).toHaveLength(1);
  });
  // T10 (I3, additive): stock integrity of the shops this file used: no discrepancy
  afterAll(async () => {
    for (const [client, shop] of [[ownerA, shopA], [ownerB, shopB]] as const) {
      const { data, error } = await client.rpc('check_stock_integrity', { p_business_id: shop, p_limit: 1000 });
      expect(error).toBeNull();
      expect(data.discrepancies).toEqual([]);
      expect(data.ok).toBe(true);
    }
  });
});
