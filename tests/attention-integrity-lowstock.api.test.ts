/**
 * Stage 1C, task T10: acknowledge_attention, check_stock_integrity and low_stock_products through the
 * real API path (Auth + PostgREST), including parallel requests. LOCAL stack only until the
 * migrations are applied to the cloud project with the owner's approval (D11). Fictitious data only;
 * no service-role key.
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

const ack = (client: SupabaseClient, shop: string, itemId: string, requestId = randomUUID()) =>
  client.rpc('acknowledge_attention', { p_request_id: requestId, p_business_id: shop, p_item_id: itemId });
const integrity = (client: SupabaseClient, shop: string, productId?: string) =>
  client.rpc('check_stock_integrity', { p_business_id: shop, ...(productId ? { p_product_id: productId } : {}) });

async function product(client: SupabaseClient, shop: string, name: string, cost: number | null, stock: number, level = 5): Promise<string> {
  const { data, error } = await client.rpc('create_product', {
    p_request_id: randomUUID(), p_business_id: shop, p_name: name, p_selling_price: 1000,
    ...(cost === null ? {} : { p_cost_price: cost }), p_opening_stock: stock, p_low_stock_level: level,
  });
  if (error) throw error;
  return data.product_id as string;
}

async function rpc(client: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(fn, { p_request_id: randomUUID(), ...args });
  if (error) throw error;
  return data;
}

/** A real C-25c item: a return whose credit differs from the value removed by at least GH₵0.10. */
async function c25cItem(client: SupabaseClient, shop: string, name: string): Promise<string> {
  const tin = await product(client, shop, name, 1500, 10);
  const res = await rpc(client, 'return_to_supplier', { p_business_id: shop, p_product_id: tin, p_qty: 3, p_credit_amount: 4200,
    p_credit_type: 'refund_cash', p_reason: 'Dented' });
  return res.attention_item_id as string;
}

async function figures(client: SupabaseClient, shop: string) {
  const [p, m] = await Promise.all([
    client.from('products').select('id, stock_qty, stock_value').eq('business_id', shop).order('id'),
    client.from('stock_movements').select('id, value').eq('business_id', shop).order('id'),
  ]);
  return JSON.stringify([p.data, m.data]);
}

describe.skipIf(target.mode === 'cloud')('Attention, stock integrity and low stock through the API (T10)', () => {
  beforeAll(async () => {
    const a = await signedInOwner(target, 't10-a', run);
    const b = await signedInOwner(target, 't10-b', run);
    ownerA = a.client;
    ownerB = b.client;
    const ca = await ownerA.rpc('create_business', { p_request_id: randomUUID(), p_name: 'T10 Shop A', p_type: 'provision' });
    const cb = await ownerB.rpc('create_business', { p_request_id: randomUUID(), p_name: 'T10 Shop B', p_type: 'minimart' });
    if (ca.error) throw ca.error;
    if (cb.error) throw cb.error;
    shopA = ca.data.business_id;
    shopB = cb.data.business_id;
  });

  it('TC-INV-130a: acknowledging a real C-25c item records who and when, is visible to the app and changes no figures', async () => {
    const item = await c25cItem(ownerA, shopA, 'API Ack tin');
    const before = await figures(ownerA, shopA);
    const res = await ack(ownerA, shopA, item);
    expect(res.error).toBeNull();
    expect(res.data).toMatchObject({ item_id: item, type: 'cost_adjustment', status: 'acknowledged', changed: true });
    const { data: row } = await ownerA.from('attention_items').select('status, acknowledged_by, acknowledged_at, message_data').eq('id', item).single();
    expect(row).toMatchObject({ status: 'acknowledged', acknowledged_by: res.data.acknowledged_by });
    expect(row!.message_data).toMatchObject({ rule: 'C-25c' });
    expect(await figures(ownerA, shopA)).toBe(before);                         // TC-ATTN-05
    const again = await ack(ownerA, shopA, item);
    expect(again.data).toMatchObject({ changed: false, status: 'acknowledged', acknowledged_by: res.data.acknowledged_by, acknowledged_at: res.data.acknowledged_at });
  });

  it('TC-INV-130b: two parallel acknowledgements of one item: one change, one no-change, one audit entry', async () => {
    const item = await c25cItem(ownerA, shopA, 'API Parallel ack tin');
    const results = await Promise.all([ack(ownerA, shopA, item), ack(ownerA, shopA, item)]);
    for (const r of results) expect(r.error).toBeNull();
    expect(results.map((r) => r.data.changed).sort()).toEqual([false, true]);
    expect(results[0].data.acknowledged_at).toBe(results[1].data.acknowledged_at);
    const { data: audit } = await ownerA.from('audit_log').select('id').eq('action', 'acknowledge_attention').eq('entity_id', item);
    expect(audit).toHaveLength(1);
  });

  it('TC-INV-130c: 5 simultaneous copies of one acknowledge request are recorded once, with the same result', async () => {
    const item = await c25cItem(ownerA, shopA, 'API Duplicate ack tin');
    const requestId = randomUUID();
    const results = await Promise.all(Array.from({ length: 5 }, () => ack(ownerA, shopA, item, requestId)));
    for (const r of results) expect(r.error).toBeNull();
    for (const r of results) expect(r.data).toEqual(results[0].data);
    expect(results[0].data.changed).toBe(true);
  });

  it("TC-INV-130d: another shop's owner, signed-out callers and direct updates are refused", async () => {
    const item = await c25cItem(ownerA, shopA, 'API Private ack tin');
    expect((await ack(ownerB, shopA, item)).error?.message).toBe('not_a_member');
    expect((await ack(ownerB, shopB, item)).error?.message).toBe('attention_item_not_found');
    expect((await ack(anonClient(target), shopA, item)).error?.code).toBe('42501');
    const direct = await ownerA.from('attention_items').update({ status: 'acknowledged' }).eq('id', item);
    expect(direct.error?.code).toBe('42501');
    const { data: row } = await ownerA.from('attention_items').select('status').eq('id', item).single();
    expect(row?.status).toBe('open');
    const { data: bView } = await ownerB.from('attention_items').select('id').eq('id', item);
    expect(bView).toEqual([]);
  });

  it('TC-INV-131a: after a mixed sequence through the public functions the shop is consistent; the check is private to the shop', async () => {
    const oil = await product(ownerA, shopA, 'API Integrity oil', 700, 6);
    const purchase = (await rpc(ownerA, 'restock', { p_business_id: shopA, p_product_id: oil, p_qty: 4, p_purchase_cost: 3000, p_paid_now: 0, p_paid_from: null })).purchase_id;
    await rpc(ownerA, 'adjust_stock', { p_business_id: shopA, p_product_id: oil, p_reason: 'damaged', p_qty_change: -1 });
    await rpc(ownerA, 'set_cost', { p_business_id: shopA, p_product_id: oil, p_cost: 750, p_reason: 'Price list' });
    await rpc(ownerA, 'pay_supplier', { p_business_id: shopA, p_purchase_id: purchase, p_amount: 1000, p_paid_from: 'momo' });
    await rpc(ownerA, 'return_to_supplier', { p_business_id: shopA, p_product_id: oil, p_qty: 1, p_credit_amount: 700, p_credit_type: 'reduce_unpaid', p_reason: 'Leak', p_purchase_id: purchase });
    await rpc(ownerA, 'correct_purchase', { p_business_id: shopA, p_purchase_id: purchase, p_type: 'cost', p_reason: 'Invoice', p_cost_change: 400 });
    const all = await integrity(ownerA, shopA);
    expect(all.error).toBeNull();
    expect(all.data).toMatchObject({ ok: true, discrepancy_count: 0, discrepancies: [], truncated: false });
    const one = await integrity(ownerA, shopA, oil);
    expect(one.data).toMatchObject({ ok: true, products_checked: 1, movements_checked: 6 });
    expect((await integrity(ownerB, shopA)).error?.message).toBe('not_a_member');
    expect((await integrity(ownerB, shopB, oil)).error?.message).toBe('product_not_found');
    expect((await integrity(anonClient(target), shopA)).error?.code).toBe('42501');
    const core = await ownerA.schema('private' as never).rpc('stock_integrity', { p_business_id: shopA });
    expect(core.error).not.toBeNull();                                         // the internal core is not exposed
  });

  it('TC-INV-131b: the check runs alongside restocks and adjustments without errors or blocking, and is ok afterwards', async () => {
    const soap = await product(ownerA, shopA, 'API Busy soap', 300, 50);
    const writes = Array.from({ length: 6 }, (_, i) => i % 2 === 0
      ? rpc(ownerA, 'restock', { p_business_id: shopA, p_product_id: soap, p_qty: 2, p_purchase_cost: 600, p_paid_now: 0, p_paid_from: null })
      : rpc(ownerA, 'adjust_stock', { p_business_id: shopA, p_product_id: soap, p_reason: 'damaged', p_qty_change: -1 }));
    const checks = Array.from({ length: 4 }, () => integrity(ownerA, shopA));
    const [w, c] = await Promise.all([Promise.all(writes), Promise.all(checks)]);
    expect(w).toHaveLength(6);
    for (const r of c) {
      expect(r.error).toBeNull();
      expect(r.data.ok).toBe(true);                                            // one snapshot: never a torn result
    }
    expect((await integrity(ownerA, shopA)).data.ok).toBe(true);
  });

  it('TC-INV-132a: the low-stock list pages on the server, ordered by shortfall, and its total equals inventory_summary', async () => {
    const shop = (await rpc(ownerB, 'create_business', { p_name: 'T10 Low Shop', p_type: 'other' })).business_id as string;
    await product(ownerB, shop, 'Below', 100, 2, 5);          // shortfall 3
    await product(ownerB, shop, 'apple', 100, 2, 5);          // shortfall 3, sorts before "Below"
    await product(ownerB, shop, 'Empty', null, 0, 4);         // 4
    await product(ownerB, shop, 'At level', 100, 5, 5);       // 0
    await product(ownerB, shop, 'Plenty', 100, 9, 5);         // not low
    const all = await ownerB.rpc('low_stock_products', { p_business_id: shop, p_limit: 200, p_offset: 0 });
    expect(all.error).toBeNull();
    expect(all.data.products.map((p: { name: string }) => p.name)).toEqual(['Empty', 'apple', 'Below', 'At level']);
    const summary = await ownerB.rpc('inventory_summary', { p_business_id: shop });
    expect(all.data.total_count).toBe(summary.data.low_stock_count);
    const pages = await Promise.all([0, 2, 4].map((o) => ownerB.rpc('low_stock_products', { p_business_id: shop, p_limit: 2, p_offset: o })));
    expect(pages.flatMap((p) => p.data.products)).toEqual(all.data.products);
    for (const p of pages) expect(p.data.total_count).toBe(4);
    expect((await ownerA.rpc('low_stock_products', { p_business_id: shop })).error?.message).toBe('not_a_member');
    expect((await ownerB.rpc('low_stock_products', { p_business_id: shop, p_limit: 201 })).error?.message).toBe('invalid_limit');
  });
});
