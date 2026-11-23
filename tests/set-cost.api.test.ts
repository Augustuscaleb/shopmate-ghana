/**
 * Stage 1C, task T4: set_cost ("Correct cost price") through the real API path (Auth + PostgREST),
 * as the app will call it. LOCAL stack only until the migrations are applied to the cloud project
 * with the owner's approval (D11). Fictitious data only.
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

const setCost = (client: SupabaseClient, shop: string, productId: string, cost: number | null, reason: string | null, requestId = randomUUID()) =>
  client.rpc('set_cost', { p_request_id: requestId, p_business_id: shop, p_product_id: productId, p_cost: cost, p_reason: reason });

async function product(client: SupabaseClient, shop: string, fields: Record<string, unknown>): Promise<string> {
  const { data, error } = await client.rpc('create_product', { p_request_id: randomUUID(), p_business_id: shop, ...fields });
  if (error) throw error;
  return data.product_id as string;
}

describe.skipIf(target.mode === 'cloud')('Correct cost price through the API (T4)', () => {
  beforeAll(async () => {
    const a = await signedInOwner(target, 'cost-a', run);
    const b = await signedInOwner(target, 'cost-b', run);
    ownerA = a.client;
    ownerB = b.client;
    const ca = await ownerA.rpc('create_business', { p_request_id: randomUUID(), p_name: 'Cost Shop A', p_type: 'provision' });
    const cb = await ownerB.rpc('create_business', { p_request_id: randomUUID(), p_name: 'Cost Shop B', p_type: 'minimart' });
    if (ca.error) throw ca.error;
    if (cb.error) throw cb.error;
    shopA = ca.data.business_id;
    shopB = cb.data.business_id;
  });

  it('TC-INV-57a: a correction revalues the stock exactly and is recorded once, with its reason', async () => {
    const milo = await product(ownerA, shopA, { p_name: 'API Milo', p_selling_price: 150, p_cost_price: 110, p_opening_stock: 10 });
    const res = await setCost(ownerA, shopA, milo, 125, '  Invoice checked  ');
    expect(res.error).toBeNull();
    expect(res.data).toMatchObject({ product_id: milo, changed: true, value_change: 150, stock_value: 1250 });

    const { data: p } = await ownerA.from('products').select('stock_qty, stock_value, cost_known').eq('id', milo).single();
    expect(p).toEqual({ stock_qty: 10, stock_value: 1250, cost_known: true });
    const { data: mv } = await ownerA.from('stock_movements').select('type, qty_change, value, unit_cost, note').eq('product_id', milo).eq('type', 'value_correction');
    expect(mv).toEqual([{ type: 'value_correction', qty_change: 0, value: 150, unit_cost: 125, note: 'Invoice checked' }]);
    const { data: hist } = await ownerA.from('product_cost_history').select('cause, avg_cost').eq('movement_id', res.data.movement_id);
    expect(hist).toEqual([{ cause: 'set_cost', avg_cost: 125 }]);
    const { data: audit } = await ownerA.from('audit_log').select('reason, before, after').eq('action', 'set_cost').eq('entity_id', milo);
    expect(audit).toHaveLength(1);
    expect(audit![0].reason).toBe('Invoice checked');
    expect(audit![0].before).toMatchObject({ stock_value: 1100, average_cost: 110 });
    expect(audit![0].after).toMatchObject({ stock_value: 1250, unit_cost: 125 });
  });

  it('TC-INV-57b: the first cost of an unknown-cost product is set (C-27a)', async () => {
    const rice = await product(ownerA, shopA, { p_name: 'API Rice', p_selling_price: 1500, p_opening_stock: 4 });
    const res = await setCost(ownerA, shopA, rice, 300, 'First cost from receipt');
    expect(res.error).toBeNull();
    expect(res.data).toMatchObject({ changed: true, value_change: 1200, stock_value: 1200 });
    const { data } = await ownerA.from('products').select('cost_known').eq('id', rice).single();
    expect(data?.cost_known).toBe(true);
  });

  it('TC-INV-57c: the same cost changes nothing; zero and negative stock and bad input are refused', async () => {
    const soap = await product(ownerA, shopA, { p_name: 'API Soap', p_selling_price: 500, p_cost_price: 300, p_opening_stock: 2 });
    const same = await setCost(ownerA, shopA, soap, 300, 'Check');
    expect(same.data).toEqual({ product_id: soap, changed: false, value_change: 0, stock_value: 600 });
    const { data: mv } = await ownerA.from('stock_movements').select('id').eq('product_id', soap);
    expect(mv).toHaveLength(1);   // only the opening stock

    const empty = await product(ownerA, shopA, { p_name: 'API Empty', p_selling_price: 500 });
    expect((await setCost(ownerA, shopA, empty, 300, 'Check')).error?.message).toBe('zero_stock');
    expect((await setCost(ownerA, shopA, soap, 300, '   ')).error?.message).toBe('reason_required');
    expect((await setCost(ownerA, shopA, soap, 301, 'r'.repeat(301))).error?.message).toBe('reason_too_long');
    expect((await setCost(ownerA, shopA, soap, -1, 'Check')).error?.message).toBe('invalid_cost_price');
    expect((await setCost(ownerA, shopA, soap, 100000001, 'Check')).error?.message).toBe('invalid_cost_price');
  });

  it('TC-INV-57d: an archived product with stock can be corrected', async () => {
    const torch = await product(ownerA, shopA, { p_name: 'API Torch', p_selling_price: 2500, p_cost_price: 50, p_opening_stock: 3 });
    const arch = await ownerA.rpc('set_product_archived', { p_request_id: randomUUID(), p_business_id: shopA, p_product_id: torch, p_archived: true });
    expect(arch.error).toBeNull();
    const res = await setCost(ownerA, shopA, torch, 60, 'Stock count valuation');
    expect(res.data).toMatchObject({ changed: true, stock_value: 180 });
    const { data } = await ownerA.from('products').select('active, stock_value').eq('id', torch).single();
    expect(data).toEqual({ active: false, stock_value: 180 });
  });

  it('TC-INV-57e: a repeated request is applied once; another owner cannot replay its request ID (different-user replay refused)', async () => {
    const oil = await product(ownerA, shopA, { p_name: 'API Oil', p_selling_price: 900, p_cost_price: 700, p_opening_stock: 3 });
    const requestId = randomUUID();
    const first = await setCost(ownerA, shopA, oil, 650, 'Market price', requestId);
    const second = await setCost(ownerA, shopA, oil, 650, 'Market price', requestId);
    expect(first.error).toBeNull();
    expect(second.data).toEqual(first.data);
    const { data: mv } = await ownerA.from('stock_movements').select('id').eq('product_id', oil).eq('type', 'value_correction');
    expect(mv).toHaveLength(1);
    const bOil = await product(ownerB, shopB, { p_name: 'B Oil', p_selling_price: 900, p_cost_price: 700, p_opening_stock: 3 });
    // A different user reusing the request ID (for their own shop) is refused. Same-owner reuse for
    // another shop is covered by TC-INV-55d (database) and tests/idempotency.api.test.ts.
    const reuse = await setCost(ownerB, shopB, bOil, 650, 'Market price', requestId);
    expect(reuse.error?.message).toBe('request_id_reused');
  });

  it("TC-INV-57f: another shop's owner and signed-out callers cannot correct costs", async () => {
    const tin = await product(ownerA, shopA, { p_name: 'API Tin', p_selling_price: 400, p_cost_price: 200, p_opening_stock: 5 });
    expect((await setCost(ownerB, shopA, tin, 1, 'Hack')).error?.message).toBe('not_a_member');
    expect((await setCost(ownerB, shopB, tin, 1, 'Hack')).error?.message).toBe('product_not_found');
    const anon = await setCost(anonClient(target), shopA, tin, 1, 'Hack');
    expect(anon.error?.code).toBe('42501');
    const { data } = await ownerA.from('products').select('stock_value').eq('id', tin).single();
    expect(data?.stock_value).toBe(1000);
    const direct = await ownerA.from('stock_movements').insert({ business_id: shopA, product_id: tin, type: 'value_correction', qty_change: 0, value: 999 });
    expect(direct.error?.code).toBe('42501');
  });
});
