/**
 * Stage 1C-3.1 Product Details: the one-row cost-history read (ProductsService.getLastKnownCost)
 * and the four average-cost states it feeds (screens/products/costInfo.ts), against the real local
 * API. Covers: the newest non-null row only; isolation between shops; the stock-zero fallback
 * exactly (a non-null row, then stock adjusted to 0 so the newest row is null: the earlier
 * non-null row is used); a product whose history has only null averages; a failed read.
 * LOCAL stack only (D11); fictitious data; no service-role key.
 */
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { ConnectivityMonitor } from '../app/src/lib/connectivity';
import { PendingRequests } from '../app/src/services/pendingRequests';
import { ProductsService, ReadError } from '../app/src/services/products';
import { costInfo, marginInfo, stockValueAbout, type CostHistoryRead } from '../app/src/screens/products/costInfo';
import { fakeSecureStore } from '../app/src/testing/fakeSecureStore';
import { testTarget } from './target';

const target = testTarget();
const run = randomUUID().slice(0, 8);

async function ownerWithShop(label: string, fetchFn?: typeof fetch) {
  const client: SupabaseClient = createClient(target.apiUrl, target.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }, global: fetchFn ? { fetch: fetchFn } : undefined,
  });
  const email = `owner.${label}.${run}@example.test`;
  const password = `Test-${randomUUID()}`;
  const { error } = await client.auth.signUp({ email, password, options: { data: { full_name: `Test Owner ${label}` } } });
  if (error) throw error;
  const shop = await client.rpc('create_business', { p_request_id: randomUUID(), p_name: `Details Shop ${label}`, p_type: 'provision' });
  if (shop.error) throw shop.error;
  const { store } = fakeSecureStore();
  const svc = new ProductsService(client, new PendingRequests(store, randomUUID), new ConnectivityMonitor());
  return { client, svc, businessId: shop.data.business_id as string };
}

/** A fetch whose reads of the cost history can be made to fail, as when the connection drops. */
function failingHistoryFetch() {
  let fail = false;
  const fetchFn: typeof fetch = async (input, init) => {
    if (fail && String(input).includes('/product_cost_history')) throw new TypeError('fetch failed');
    return fetch(input, init);
  };
  return { fetchFn, setFail: (v: boolean) => { fail = v; } };
}

const fields = (name: string, over: Record<string, unknown> = {}) =>
  ({ name, categoryId: null, unit: 'piece', sellingPrice: 1000, lowStockLevel: 5, costPrice: null, openingStock: 0, ...over });

function ok<T>(r: { ok: true; data: T } | { ok: false }): T {
  if (!r.ok) throw new Error(`expected success, got ${JSON.stringify(r)}`);
  return r.data;
}

async function countTo(client: SupabaseClient, businessId: string, productId: string, count: number) {
  const { error } = await client.rpc('adjust_stock', {
    p_request_id: randomUUID(), p_business_id: businessId, p_product_id: productId, p_reason: 'count_correction',
    p_counted_qty: count, p_qty_change: null, p_note: 'Fictitious test count',
  });
  if (error) throw error;
}

/** What the Details screen does with the read (a failure is kept as such). */
async function historyRead(svc: ProductsService, businessId: string, productId: string): Promise<CostHistoryRead> {
  return svc.getLastKnownCost(businessId, productId).then((row) => ({ kind: 'ok', row }), () => ({ kind: 'failed' }));
}

describe.skipIf(target.mode === 'cloud')('Product Details: cost history read and cost states (Stage 1C-3.1)', () => {
  let A: Awaited<ReturnType<typeof ownerWithShop>>;
  let B: Awaited<ReturnType<typeof ownerWithShop>>;
  let net: ReturnType<typeof failingHistoryFetch>;

  beforeAll(async () => {
    net = failingHistoryFetch();
    A = await ownerWithShop('det-a', net.fetchFn);
    B = await ownerWithShop('det-b');
  });

  it('DETAPI-01: with stock and a cost: state 1 (stock value ÷ stock), margin shown, stock value (about) = recorded value', async () => {
    const { productId } = ok(await A.svc.createProduct(A.businessId, fields('Details current (fictitious)', { costPrice: 800, openingStock: 3 })));
    const p = (await A.svc.getProduct(A.businessId, productId))!;
    const cost = costInfo(p, await historyRead(A.svc, A.businessId, productId));
    expect(cost).toEqual({ state: 'current', average: 800, stockValue: 2400 });
    expect(marginInfo(p.sellingPrice, cost)).toEqual({ shown: true, amount: 200, percent: 20, loss: false });
    expect(stockValueAbout(cost)).toBe(p.stockValue);
  });

  it('DETAPI-02: stock-zero fallback: the newest row is null, so the earlier non-null row is used (state 2, with its date)', async () => {
    const { productId } = ok(await A.svc.createProduct(A.businessId, fields('Details zero (fictitious)', { costPrice: 750, openingStock: 4 })));
    const opening = await A.svc.getLastKnownCost(A.businessId, productId);
    expect(opening).not.toBeNull();
    expect(Number(opening!.avgCost)).toBe(750);

    await countTo(A.client, A.businessId, productId, 0);
    // The newest history row now has no average (stock 0): check that directly
    const rows = await A.client.from('product_cost_history').select('avg_cost, effective_at, created_at')
      .eq('product_id', productId).order('effective_at', { ascending: false }).order('created_at', { ascending: false });
    expect(rows.error).toBeNull();
    expect(rows.data!.length).toBeGreaterThanOrEqual(2);
    expect(rows.data![0].avg_cost).toBeNull();

    const row = await A.svc.getLastKnownCost(A.businessId, productId);
    expect(row).toEqual(opening);
    const p = (await A.svc.getProduct(A.businessId, productId))!;
    expect(p.stockQty).toBe(0);
    expect(p.costKnown).toBe(true);
    const cost = costInfo(p, { kind: 'ok', row });
    expect(cost).toEqual({ state: 'last_known', average: 750, asOf: opening!.effectiveAt });
    // Margin and stock value are not shown in state 2
    expect(marginInfo(p.sellingPrice, cost)).toEqual({ shown: false, reason: 'no_stock' });
    expect(stockValueAbout(cost)).toBeNull();

    // cost_known false gives state 3 even though this non-null row exists. (No server function
    // turns cost_known off for a product that has a cost, so the flag is set here on the copy.)
    expect(costInfo({ ...p, costKnown: false }, { kind: 'ok', row })).toEqual({ state: 'unknown' });
  });

  it('DETAPI-03: the read returns only the newest non-null row (a later cost correction wins over the opening cost)', async () => {
    const { productId } = ok(await A.svc.createProduct(A.businessId, fields('Details newest (fictitious)', { costPrice: 500, openingStock: 2 })));
    ok(await A.svc.setCost(A.businessId, productId, 650, 'Fictitious supplier invoice correction'));
    await countTo(A.client, A.businessId, productId, 0);
    const row = await A.svc.getLastKnownCost(A.businessId, productId);
    expect(Number(row!.avgCost)).toBe(650);
    const p = (await A.svc.getProduct(A.businessId, productId))!;
    expect(costInfo(p, { kind: 'ok', row })).toMatchObject({ state: 'last_known', average: 650 });
  });

  it('DETAPI-04: a product created with no cost has only null averages: state 3 with and without stock', async () => {
    const { productId } = ok(await A.svc.createProduct(A.businessId, fields('Details no cost (fictitious)', { costPrice: null, openingStock: 6 })));
    expect(await A.svc.getLastKnownCost(A.businessId, productId)).toBeNull();
    let p = (await A.svc.getProduct(A.businessId, productId))!;
    expect(costInfo(p, await historyRead(A.svc, A.businessId, productId))).toEqual({ state: 'unknown' });
    await countTo(A.client, A.businessId, productId, 0);
    p = (await A.svc.getProduct(A.businessId, productId))!;
    const cost = costInfo(p, await historyRead(A.svc, A.businessId, productId));
    expect(cost).toEqual({ state: 'unknown' });
    expect(marginInfo(p.sellingPrice, cost)).toEqual({ shown: false, reason: 'unknown' });
  });

  it("DETAPI-05: isolation: another shop's owner reads no cost history of this shop", async () => {
    const { productId } = ok(await A.svc.createProduct(A.businessId, fields('Details private (fictitious)', { costPrice: 900, openingStock: 1 })));
    expect(await A.svc.getLastKnownCost(A.businessId, productId)).not.toBeNull();
    expect(await B.svc.getLastKnownCost(A.businessId, productId)).toBeNull();
    expect(await B.svc.getLastKnownCost(B.businessId, productId)).toBeNull();
    const direct = await B.client.from('product_cost_history').select('id').eq('product_id', productId);
    expect(direct.error).toBeNull();
    expect(direct.data).toEqual([]);
  });

  it('DETAPI-06: a failed read (connection lost) is a ReadError, and gives state 4 with no figure', async () => {
    const { productId } = ok(await A.svc.createProduct(A.businessId, fields('Details offline (fictitious)', { costPrice: 400, openingStock: 2 })));
    await countTo(A.client, A.businessId, productId, 0);
    const p = (await A.svc.getProduct(A.businessId, productId))!;
    net.setFail(true);
    try {
      await expect(A.svc.getLastKnownCost(A.businessId, productId)).rejects.toBeInstanceOf(ReadError);
      const cost = costInfo(p, await historyRead(A.svc, A.businessId, productId));
      expect(cost).toEqual({ state: 'unavailable' });
      expect(marginInfo(p.sellingPrice, cost)).toEqual({ shown: false, reason: 'unavailable' });
      expect(stockValueAbout(cost)).toBeNull();
    } finally {
      net.setFail(false);
    }
    // Once reconnected, the correct state shows
    expect(costInfo(p, await historyRead(A.svc, A.businessId, productId))).toMatchObject({ state: 'last_known', average: 400 });
  });
});
