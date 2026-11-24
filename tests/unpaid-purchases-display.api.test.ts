/**
 * Owner decision M2, Option B: the display fields of unpaid_purchases through the real API path
 * (Auth + PostgREST). LOCAL stack only until the migrations are applied to the cloud project with
 * the owner's approval (D11). Fictitious data only; no service-role key.
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

type Row = {
  purchase_id: string; purchase_cost: number; paid: number; payments: number; unpaid: number;
  corrected_cost: number; cost_corrections: number; refunds_received: number; return_credits: number;
};

async function rpc(client: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(fn, { p_request_id: randomUUID(), ...args });
  if (error) throw error;
  return data;
}
const list = (client: SupabaseClient, shop: string, limit?: number, offset?: number) =>
  client.rpc('unpaid_purchases', { p_business_id: shop, ...(limit === undefined ? {} : { p_limit: limit }), ...(offset === undefined ? {} : { p_offset: offset }) });

async function product(client: SupabaseClient, shop: string, name: string): Promise<string> {
  return (await rpc(client, 'create_product', { p_business_id: shop, p_name: name, p_selling_price: 1000 })).product_id as string;
}
async function buy(client: SupabaseClient, shop: string, productId: string, cost: number, paidNow: number): Promise<string> {
  return (await rpc(client, 'restock', { p_business_id: shop, p_product_id: productId, p_qty: 10, p_purchase_cost: cost,
    p_paid_now: paidNow, p_paid_from: paidNow > 0 ? 'cash_drawer' : null })).purchase_id as string;
}
const m2 = (r: Row) => ({ corrected_cost: r.corrected_cost, cost_corrections: r.cost_corrections,
  refunds_received: r.refunds_received, return_credits: r.return_credits });

describe.skipIf(target.mode === 'cloud')('Unpaid purchases display fields through the API (M2)', () => {
  beforeAll(async () => {
    const a = await signedInOwner(target, 'm2-a', run);
    const b = await signedInOwner(target, 'm2-b', run);
    ownerA = a.client;
    ownerB = b.client;
    shopA = (await rpc(ownerA, 'create_business', { p_name: 'M2 Shop A', p_type: 'provision' })).business_id as string;
    shopB = (await rpc(ownerB, 'create_business', { p_name: 'M2 Shop B', p_type: 'minimart' })).business_id as string;
  });

  it('M2-API-1: every row adds up (unpaid = corrected_cost - paid + refunds_received - return_credits); existing fields keep their meaning', async () => {
    const rice = await product(ownerA, shopA, 'API M2 rice');
    const soap = await product(ownerA, shopA, 'API M2 soap');
    const plain = await buy(ownerA, shopA, rice, 1000, 200);
    const combo = await buy(ownerA, shopA, soap, 1000, 1000);
    await rpc(ownerA, 'correct_purchase', { p_business_id: shopA, p_purchase_id: combo, p_type: 'cost', p_reason: 'Invoice',
      p_cost_change: -300, p_refund_amount: 300, p_refund_method: 'momo' });
    await rpc(ownerA, 'correct_purchase', { p_business_id: shopA, p_purchase_id: combo, p_type: 'cost', p_reason: 'Invoice again', p_cost_change: 500 });
    await rpc(ownerA, 'return_to_supplier', { p_business_id: shopA, p_product_id: soap, p_qty: 1, p_credit_amount: 100,
      p_credit_type: 'reduce_unpaid', p_reason: 'Dented', p_purchase_id: combo });
    await rpc(ownerA, 'return_to_supplier', { p_business_id: shopA, p_product_id: soap, p_qty: 1, p_credit_amount: 90,
      p_credit_type: 'refund_cash', p_reason: 'Dented', p_purchase_id: combo });
    await rpc(ownerA, 'pay_supplier', { p_business_id: shopA, p_purchase_id: combo, p_amount: 50, p_paid_from: 'momo' });

    const res = await list(ownerA, shopA, 200, 0);
    expect(res.error).toBeNull();
    expect(Object.keys(res.data).sort()).toEqual(['limit', 'offset', 'purchase_count', 'purchases', 'total_owed']);
    const rows = res.data.purchases as Row[];
    const byId = Object.fromEntries(rows.map((r) => [r.purchase_id, r]));
    expect(m2(byId[plain])).toEqual({ corrected_cost: 1000, cost_corrections: 0, refunds_received: 0, return_credits: 0 });
    expect(byId[plain]).toMatchObject({ purchase_cost: 1000, paid: 200, payments: 0, unpaid: 800 });
    // the cash refund (90) is excluded from return_credits and from the amount owed
    expect(m2(byId[combo])).toEqual({ corrected_cost: 1200, cost_corrections: 200, refunds_received: 300, return_credits: 100 });
    expect(byId[combo]).toMatchObject({ purchase_cost: 1000, paid: 1050, payments: 1, unpaid: 350 });
    for (const r of rows) {
      expect(r.unpaid).toBe(r.corrected_cost - r.paid + r.refunds_received - r.return_credits);
      expect(r.corrected_cost).toBe(r.purchase_cost + r.cost_corrections);
      for (const v of Object.values(m2(r))) expect(Number.isInteger(v)).toBe(true);
    }
    expect(res.data).toMatchObject({ total_owed: 1150, purchase_count: 2 });
  });

  it('M2-API-2: pagination keeps the order, totals and new fields; empty, error and isolation behaviour unchanged', async () => {
    const oil = await product(ownerB, shopB, 'API M2 oil');
    const ids = [];
    for (const cost of [1000, 2000, 3000]) ids.push(await buy(ownerB, shopB, oil, cost, 0));
    await rpc(ownerB, 'correct_purchase', { p_business_id: shopB, p_purchase_id: ids[1], p_type: 'cost', p_reason: 'Invoice', p_cost_change: -400 });
    const all = await list(ownerB, shopB, 200, 0);
    expect(all.data).toMatchObject({ total_owed: 5600, purchase_count: 3 });
    expect((all.data.purchases as Row[]).map((r) => r.purchase_id)).toEqual(ids);          // same day: recording order
    const pages = await Promise.all([0, 2].map((o) => list(ownerB, shopB, 2, o)));
    expect(pages.flatMap((p) => p.data.purchases)).toEqual(all.data.purchases);
    for (const p of pages) expect(p.data).toMatchObject({ total_owed: 5600, purchase_count: 3 });
    expect(m2((all.data.purchases as Row[])[1])).toEqual({ corrected_cost: 1600, cost_corrections: -400, refunds_received: 0, return_credits: 0 });

    const empty = (await rpc(ownerB, 'create_business', { p_name: 'M2 Empty', p_type: 'other' })).business_id as string;
    expect((await list(ownerB, empty)).data).toEqual({ total_owed: 0, purchase_count: 0, limit: 50, offset: 0, purchases: [] });
    expect((await list(ownerB, shopB, 201, 0)).error?.message).toBe('invalid_limit');
    expect((await list(ownerB, shopB, 10, -1)).error?.message).toBe('invalid_offset');
    expect((await list(ownerA, shopB)).error?.message).toBe('not_a_member');
    expect((await list(ownerB, shopA)).error?.message).toBe('not_a_member');
    expect((await list(anonClient(target), shopB)).error?.code).toBe('42501');
  });
});
