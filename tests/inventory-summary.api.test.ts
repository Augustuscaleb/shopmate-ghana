/**
 * Stage 1C, task T2: inventory_summary and the dashboard service through the real API path
 * (Auth + PostgREST), where the 1,000-row limit (max_rows = 1000) applies. LOCAL stack only.
 *
 * Fixture products are inserted with the local stack's service-role key, because the app cannot
 * write products and create_product only arrives in T3. The key is read from `supabase status`
 * of the local stack and is never used outside this file. Fictitious data only.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DashboardService, countLowStock } from '../app/src/services/dashboard';
import { anonClient, signedInOwner, testTarget } from './target';

const target = testTarget();
const run = randomUUID().slice(0, 8);

const SCALE_ACTIVE = 1500;   // more than 1,000
const SCALE_LOW = 1001;      // more than 1,000
const SCALE_ARCHIVED = 200;  // must not be counted
const SCALE_DELETED = 50;    // must not be counted

let ownerA: SupabaseClient;
let ownerB: SupabaseClient;
let businessA: string;
let businessB: string;
let admin: SupabaseClient;

function localServiceRoleKey(): string {
  const raw = execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8' });
  const key = JSON.parse(raw.slice(raw.indexOf('{'))).SERVICE_ROLE_KEY as string | undefined;
  if (!key) throw new Error('local service-role key not available');
  return key;
}

// Every row sets every field: in a bulk insert PostgREST gives keys missing from a row NULL,
// not the column default.
async function insertProducts(rows: Record<string, unknown>[]) {
  const full = rows.map((r) => ({ active: true, deleted_at: null, ...r }));
  const { error } = await admin.from('products').insert(full);
  if (error) throw error;
}

describe.skipIf(target.mode === 'cloud')('Inventory summary through the API (D7)', () => {
  beforeAll(async () => {
    admin = createClient(target.apiUrl, localServiceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } });
    const a = await signedInOwner(target, 'inv-a', run);
    const b = await signedInOwner(target, 'inv-b', run);
    ownerA = a.client;
    ownerB = b.client;
    const ca = await ownerA.rpc('create_business', { p_request_id: a.requestId('create_business'), p_name: 'Inventory Scale Shop', p_type: 'minimart' });
    const cb = await ownerB.rpc('create_business', { p_request_id: b.requestId('create_business'), p_name: 'Inventory Other Shop', p_type: 'provision' });
    if (ca.error) throw ca.error;
    if (cb.error) throw cb.error;
    businessA = ca.data.business_id;
    businessB = cb.data.business_id;
  });

  it('TC-INV-15a: an empty inventory gives exactly zero products and zero low stock', async () => {
    const { data, error } = await ownerA.rpc('inventory_summary', { p_business_id: businessA });
    expect(error).toBeNull();
    expect(data).toEqual({ product_count: 0, low_stock_count: 0 });
  });

  it(`TC-INV-15b (scale): ${SCALE_ACTIVE} active products and ${SCALE_LOW} low-stock products are counted exactly, beyond the 1,000-row API limit`, async () => {
    const rows: Record<string, unknown>[] = Array.from({ length: SCALE_ACTIVE }, (_, i) => ({
      business_id: businessA, name: `Scale product ${i + 1}`, selling_price: 100, low_stock_level: 5,
      stock_qty: i < SCALE_LOW ? (i % 7) - 1 : 10 + (i % 7),        // low: -1..5 (some exactly at the level); not low: >= 10
    }));
    rows.push(...Array.from({ length: SCALE_ARCHIVED }, (_, i) => ({
      business_id: businessA, name: `Archived product ${i + 1}`, selling_price: 100, low_stock_level: 5, stock_qty: 0, active: false,
    })));
    rows.push(...Array.from({ length: SCALE_DELETED }, (_, i) => ({
      business_id: businessA, name: `Deleted product ${i + 1}`, selling_price: 100, low_stock_level: 5, stock_qty: 0,
      deleted_at: new Date().toISOString(),
    })));
    await insertProducts(rows);

    const { data, error } = await ownerA.rpc('inventory_summary', { p_business_id: businessA });
    expect(error).toBeNull();
    expect(data).toEqual({ product_count: SCALE_ACTIVE, low_stock_count: SCALE_LOW });
  });

  it('TC-INV-15c (negative control): fetching the same products as rows is capped at 1,000, which is why the counts are computed in the database', async () => {
    const { data, error } = await ownerA.from('products').select('id').eq('business_id', businessA).eq('active', true).is('deleted_at', null);
    expect(error).toBeNull();
    expect(data!.length).toBe(1000);      // the API cap: phone-side counting would report 1,000, not 1,500
    const { count, error: countError } = await ownerA.from('products').select('id', { count: 'exact', head: true }).eq('business_id', businessA);
    expect(countError).toBeNull();
    expect(count).toBe(SCALE_ACTIVE + SCALE_ARCHIVED + SCALE_DELETED);   // all rows really exist
  });

  it('TC-INV-15d: the dashboard service shows the exact counts (1,500 / 1,001) with sales figures unchanged', async () => {
    const overview = await new DashboardService(ownerA).fetchOverview(businessA);
    expect(overview.productCount).toBe(SCALE_ACTIVE);
    expect(overview.lowStockCount).toBe(SCALE_LOW);
    expect(overview.todaySalesCount).toBe(0);
    expect(overview.todayRevenuePesewas).toBe(0);
    expect(overview.recentSales).toEqual([]);
  });

  it('TC-INV-15e: the server applies the same low-stock rule as the app reference definition, including boundaries', async () => {
    const cases = [
      { name: 'Boundary equal', stock_qty: 5, low_stock_level: 5 },
      { name: 'Boundary above', stock_qty: 6, low_stock_level: 5 },
      { name: 'Zero at zero', stock_qty: 0, low_stock_level: 0 },
      { name: 'One at zero', stock_qty: 1, low_stock_level: 0 },
      { name: 'Negative', stock_qty: -3, low_stock_level: 2 },
    ];
    await insertProducts(cases.map((c) => ({ ...c, business_id: businessB, selling_price: 200 })));
    const { data, error } = await ownerB.rpc('inventory_summary', { p_business_id: businessB });
    expect(error).toBeNull();
    expect(data).toEqual({ product_count: cases.length, low_stock_count: countLowStock(cases) });
    expect(countLowStock(cases)).toBe(3);
  });

  it("TC-INV-15f: an owner cannot get another business's counts (refused, not zeros)", async () => {
    const { data, error } = await ownerB.rpc('inventory_summary', { p_business_id: businessA });
    expect(data).toBeNull();
    expect(error?.code).toBe('42501');
    expect(error?.message).toBe('not_a_member');
    const unknown = await ownerB.rpc('inventory_summary', { p_business_id: randomUUID() });
    expect(unknown.error?.message).toBe('not_a_member');
  });

  it('TC-INV-15g: a signed-out caller cannot call the function', async () => {
    const { data, error } = await anonClient(target).rpc('inventory_summary', { p_business_id: businessA });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
  });

  it('TC-INV-15h: the dashboard service surfaces a refusal as an error instead of showing figures', async () => {
    await expect(new DashboardService(ownerB).fetchOverview(businessA)).rejects.toMatchObject({ message: 'not_a_member' });
  });
});
