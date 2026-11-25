/**
 * Stage 1C-2 increment 2: the app's ProductsService (the code the Products screens call) against
 * the real local API. Covers the list (server pagination past max_rows, search, category filter,
 * sort, archived), product writes through the approved server functions with request IDs
 * (including a lost reply and the "unconfirmed" hold), cost correction, category management,
 * plain-language errors and isolation between shops.
 * LOCAL stack only (D11); fictitious data; no service-role key.
 */
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { ConnectivityMonitor } from '../app/src/lib/connectivity';
import { DUPLICATE_NAME_MESSAGE, GENERIC_MESSAGE, MESSAGES, OFFLINE_MESSAGE, UNCONFIRMED_MESSAGE, UNKNOWN_OUTCOME_MESSAGE, messageFor } from '../app/src/services/errorMessages';
import { PendingRequests } from '../app/src/services/pendingRequests';
import { classifyRpcError } from '../app/src/services/rpcErrors';
import { PAGE_SIZE, ProductsService, expectedValues, type ProductQuery } from '../app/src/services/products';
import { fakeSecureStore } from '../app/src/testing/fakeSecureStore';
import { signedInOwner, testTarget } from './target';

const target = testTarget();
const run = randomUUID().slice(0, 8);

/**
 * A fetch that can be told to let the next matching write REACH the server (and commit) but lose
 * its reply, as when the connection drops after sending.
 */
function droppableFetch() {
  let dropPath: string | null = null;
  let before: { path: string; run: () => Promise<void> } | null = null;
  const fetchFn: typeof fetch = async (input, init) => {
    // Lets a test make another change at the exact moment between the app's read and its write
    if (before && String(input).includes(before.path)) {
      const b = before;
      before = null;
      await b.run();
    }
    const res = await fetch(input, init);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (dropPath && method !== 'GET' && method !== 'HEAD' && String(input).includes(dropPath)) {
      dropPath = null;
      await res.text();
      throw new TypeError('fetch failed');
    }
    return res;
  };
  return {
    fetchFn,
    dropNextReply: (path = '/rpc/') => { dropPath = path; },
    beforeNext: (path: string, run: () => Promise<void>) => { before = { path, run }; },
  };
}

async function ownerWithShop(label: string, fetchFn?: typeof fetch) {
  const client: SupabaseClient = createClient(target.apiUrl, target.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }, global: fetchFn ? { fetch: fetchFn } : undefined,
  });
  const { error } = await client.auth.signUp({ email: `owner.${label}.${run}@example.test`, password: `Test-${randomUUID()}`, options: { data: { full_name: `Test Owner ${label}` } } });
  if (error) throw error;
  const shop = await client.rpc('create_business', { p_request_id: randomUUID(), p_name: `Service Shop ${label}`, p_type: 'provision' });
  if (shop.error) throw shop.error;
  const { store, data } = fakeSecureStore();
  const connectivity = new ConnectivityMonitor();
  const svc = new ProductsService(client, new PendingRequests(store, randomUUID), connectivity);
  return { client, svc, businessId: shop.data.business_id as string, pendingData: data, connectivity };
}

const q = (over: Partial<ProductQuery> = {}): ProductQuery =>
  ({ search: '', category: { kind: 'all' }, archived: false, sort: 'name', offset: 0, limit: PAGE_SIZE, ...over });

const fields = (name: string, over: Record<string, unknown> = {}) =>
  ({ name, categoryId: null, unit: null, sellingPrice: 150, lowStockLevel: 5, costPrice: null, openingStock: 0, ...over });

function ok<T>(r: { ok: true; data: T } | { ok: false }): T {
  if (!r.ok) throw new Error(`expected success, got ${JSON.stringify(r)}`);
  return r.data;
}

describe.skipIf(target.mode === 'cloud')('ProductsService against the local API (increment 2)', () => {
  let A: Awaited<ReturnType<typeof ownerWithShop>>;
  let B: Awaited<ReturnType<typeof ownerWithShop>>;
  let drop: ReturnType<typeof droppableFetch>;

  beforeAll(async () => {
    drop = droppableFetch();
    A = await ownerWithShop('svc-a', drop.fetchFn);
    B = await ownerWithShop('svc-b');
  });

  it('PS-01: add a product with cost and opening stock; it is listed and read back exactly', async () => {
    const created = ok(await A.svc.createProduct(A.businessId, fields('Milo sachet', { unit: 'sachet', costPrice: 110, openingStock: 10, lowStockLevel: 3 })));
    const p = await A.svc.getProduct(A.businessId, created.productId);
    expect(p).toEqual({ id: created.productId, name: 'Milo sachet', categoryId: null, unit: 'sachet', sellingPrice: 150, stockQty: 10, stockValue: 1100, costKnown: true, lowStockLevel: 3, active: true });
    const page = await A.svc.listProducts(A.businessId, q());
    expect(page.total).toBe(1);
    expect(page.rows[0].id).toBe(created.productId);
    expect(A.pendingData.size).toBe(0); // the request ID was released after the definite answer
  });

  it('PS-02: refusals come back in plain words; typed values are the caller\'s to keep', async () => {
    const dup = await A.svc.createProduct(A.businessId, fields('milo SACHET'));
    expect(dup).toMatchObject({ ok: false, kind: 'refused', message: MESSAGES.duplicate_product_name });
    const noStock = await A.svc.createProduct(A.businessId, fields('Peak milk', { costPrice: 500 }));
    expect(noStock).toMatchObject({ ok: false, kind: 'refused', message: MESSAGES.cost_price_needs_opening_stock });
    expect(A.pendingData.size).toBe(0);
  });

  it('PS-03: categories: add, duplicate refused, rename, archive refused while in use, archive and restore', async () => {
    const drinks = ok(await A.svc.createCategory(A.businessId, 'Drinks'));
    expect(drinks).toMatchObject({ name: 'Drinks', archived: false });
    expect(await A.svc.createCategory(A.businessId, 'Drinks')).toMatchObject({ ok: false, kind: 'refused', message: DUPLICATE_NAME_MESSAGE });
    const soap = ok(await A.svc.createCategory(A.businessId, 'Soap'));
    expect(ok(await A.svc.renameCategory(A.businessId, soap.id, 'Toiletries')).name).toBe('Toiletries');
    expect(await A.svc.renameCategory(A.businessId, soap.id, 'Drinks')).toMatchObject({ ok: false, message: DUPLICATE_NAME_MESSAGE });

    ok(await A.svc.createProduct(A.businessId, fields('Coke 50cl', { categoryId: drinks.id })));
    expect(await A.svc.setCategoryArchived(A.businessId, drinks.id, true)).toMatchObject({ ok: false, kind: 'refused', message: MESSAGES.category_in_use });

    expect(ok(await A.svc.setCategoryArchived(A.businessId, soap.id, true)).archived).toBe(true);
    expect((await A.svc.listCategories(A.businessId)).map((c) => c.name)).toEqual(['Drinks']);
    expect((await A.svc.listCategories(A.businessId, { includeArchived: true })).map((c) => [c.name, c.archived])).toEqual([['Drinks', false], ['Toiletries', true]]);
    // An archived category can't be chosen for a product
    expect(await A.svc.createProduct(A.businessId, fields('Key soap', { categoryId: soap.id }))).toMatchObject({ ok: false, message: MESSAGES.category_archived });
    expect(ok(await A.svc.setCategoryArchived(A.businessId, soap.id, false)).archived).toBe(false);
  });

  it('PS-04: search (case-insensitive, wildcards literal), category filter, "No category", lowest-stock sort', async () => {
    const cats = await A.svc.listCategories(A.businessId);
    const drinks = cats.find((c) => c.name === 'Drinks')!;
    ok(await A.svc.createProduct(A.businessId, fields('Fanta 100% orange', { categoryId: drinks.id, openingStock: 40 })));
    ok(await A.svc.createProduct(A.businessId, fields('Sugar 1kg', { openingStock: 2 })));

    const names = async (over: Partial<ProductQuery>) => (await A.svc.listProducts(A.businessId, q(over))).rows.map((p) => p.name);
    expect(await names({ search: 'MILO' })).toEqual(['Milo sachet']);
    expect(await names({ search: '100%' })).toEqual(['Fanta 100% orange']);
    expect(await names({ search: '%' })).toEqual(['Fanta 100% orange']);
    expect(await names({ search: '_' })).toEqual([]);
    expect(await names({ category: { kind: 'category', id: drinks.id } })).toEqual(['Coke 50cl', 'Fanta 100% orange']);
    expect(await names({ category: { kind: 'none' } })).toEqual(['Milo sachet', 'Sugar 1kg']);
    expect(await names({ sort: 'lowest_stock' })).toEqual(['Coke 50cl', 'Sugar 1kg', 'Milo sachet', 'Fanta 100% orange']);
    expect(await names({})).toEqual(['Coke 50cl', 'Fanta 100% orange', 'Milo sachet', 'Sugar 1kg']);
  });

  it('PS-05: edit and quick price change; an unchanged save reports "no changes"', async () => {
    const sugar = (await A.svc.listProducts(A.businessId, q({ search: 'Sugar' }))).rows[0];
    const edit = { name: 'Sugar 1kg bag', categoryId: null, unit: 'bag', sellingPrice: 1800, lowStockLevel: 4 };
    expect(ok(await A.svc.saveEdit(A.businessId, sugar, edit))).toEqual({ changed: true });
    const saved = (await A.svc.getProduct(A.businessId, sugar.id))!;
    expect(ok(await A.svc.saveEdit(A.businessId, saved, edit))).toEqual({ changed: false });
    const loaded = (await A.svc.getProduct(A.businessId, sugar.id))!;
    expect(ok(await A.svc.changeSellingPrice(A.businessId, loaded, 1950))).toEqual({ changed: true });
    expect(await A.svc.getProduct(A.businessId, sugar.id)).toMatchObject({ name: 'Sugar 1kg bag', unit: 'bag', sellingPrice: 1950, lowStockLevel: 4, stockQty: 2 });
    const now = (await A.svc.getProduct(A.businessId, sugar.id))!;
    expect(await A.svc.saveEdit(A.businessId, now, { name: 'Milo sachet', categoryId: null, unit: null, sellingPrice: 100, lowStockLevel: 1 }))
      .toMatchObject({ ok: false, message: MESSAGES.duplicate_product_name });
  });

  it('PS-06: archive hides a product from the list; restore brings it back', async () => {
    const milo = (await A.svc.listProducts(A.businessId, q({ search: 'Milo' }))).rows[0];
    expect(ok(await A.svc.setArchived(A.businessId, milo.id, true))).toEqual({ active: false, changed: true });
    expect((await A.svc.listProducts(A.businessId, q())).rows.map((p) => p.name)).not.toContain('Milo sachet');
    expect((await A.svc.listProducts(A.businessId, q({ archived: true }))).rows.map((p) => p.name)).toEqual(['Milo sachet']);
    expect(ok(await A.svc.setArchived(A.businessId, milo.id, false))).toEqual({ active: true, changed: true });
    expect((await A.svc.listProducts(A.businessId, q({ archived: true }))).total).toBe(0);
  });

  it('PS-07: correct cost price: refused with no stock; with stock the server values it and reports the change', async () => {
    const coke = (await A.svc.listProducts(A.businessId, q({ search: 'Coke' }))).rows[0];
    expect(await A.svc.setCost(A.businessId, coke.id, 300, 'typo')).toMatchObject({ ok: false, kind: 'refused', message: MESSAGES.zero_stock });
    const milo = (await A.svc.listProducts(A.businessId, q({ search: 'Milo' }))).rows[0];
    expect(await A.svc.setCost(A.businessId, milo.id, 120, '  ')).toMatchObject({ ok: false, message: MESSAGES.reason_required });
    expect(ok(await A.svc.setCost(A.businessId, milo.id, 120, 'Typed the wrong cost'))).toEqual({ changed: true, valueChange: 100, stockValue: 1200 });
    expect(ok(await A.svc.setCost(A.businessId, milo.id, 120, 'Again'))).toEqual({ changed: false, valueChange: 0, stockValue: 1200 });
    expect(await A.svc.getProduct(A.businessId, milo.id)).toMatchObject({ stockQty: 10, stockValue: 1200, costKnown: true });
    const history = await A.client.from('stock_movements').select('type, note').eq('product_id', milo.id).eq('type', 'value_correction');
    expect(history.data).toEqual([{ type: 'value_correction', note: 'Typed the wrong cost' }]);
  });

  it('PS-08: a lost reply keeps the request ID: the retry is recognised and nothing is recorded twice', async () => {
    drop.dropNextReply();
    const lost = await A.svc.createProduct(A.businessId, fields('Omo 500g', { openingStock: 6, costPrice: 900 }));
    expect(lost).toEqual({ ok: false, kind: 'no_response', message: UNKNOWN_OUTCOME_MESSAGE });
    expect(A.connectivity.state).toBe('offline');
    expect(A.pendingData.size).toBe(1);
    // While offline, writes aren't sent at all: "not sent" (definitely not saved), a different message
    expect(await A.svc.createProduct(A.businessId, fields('Omo 500g', { openingStock: 6, costPrice: 900 }))).toEqual({ ok: false, kind: 'not_sent', message: OFFLINE_MESSAGE });
    expect(await A.svc.createCategory(A.businessId, 'Offline cat')).toEqual({ ok: false, kind: 'not_sent', message: OFFLINE_MESSAGE });
    // Back online (a read succeeds): the same change is retried with the same request ID
    expect(await A.svc.checkConnection(A.businessId)).toBe(true);
    const retried = ok(await A.svc.createProduct(A.businessId, fields('Omo 500g', { openingStock: 6, costPrice: 900 })));
    const omo = await A.client.from('products').select('id, stock_qty, stock_value').eq('business_id', A.businessId).ilike('name', 'omo 500g');
    expect(omo.data).toEqual([{ id: retried.productId, stock_qty: 6, stock_value: 5400 }]);
    const moves = await A.client.from('stock_movements').select('id').eq('product_id', retried.productId);
    expect(moves.data).toHaveLength(1);
    expect(A.pendingData.size).toBe(0);
  });

  it('PS-09: after a lost reply, a DIFFERENT change is held back as "unconfirmed" until the owner has checked', async () => {
    const omo = (await A.svc.listProducts(A.businessId, q({ search: 'Omo' }))).rows[0];
    drop.dropNextReply();
    expect(await A.svc.changeSellingPrice(A.businessId, omo, 1300)).toEqual({ ok: false, kind: 'no_response', message: UNKNOWN_OUTCOME_MESSAGE });
    await A.svc.checkConnection(A.businessId);
    // The newer price on the server is this phone's own lost change: "may already have been saved",
    // never "someone else changed it"; the current copy comes back so the screen can show it
    const held = await A.svc.changeSellingPrice(A.businessId, omo, 1400);
    expect(held).toMatchObject({ ok: false, kind: 'unconfirmed', message: UNCONFIRMED_MESSAGE, current: { sellingPrice: 1300 } });
    if (held.ok || held.kind !== 'unconfirmed') throw new Error('expected unconfirmed');
    // The first change did reach the server
    expect((await A.svc.getProduct(A.businessId, omo.id))!.sellingPrice).toBe(1300);
    await A.svc.discardUnconfirmed('update_product', omo.id);
    expect(ok(await A.svc.changeSellingPrice(A.businessId, held.current!, 1400))).toEqual({ changed: true });
    expect((await A.svc.getProduct(A.businessId, omo.id))!.sellingPrice).toBe(1400);
  });

  it('PS-09b: a lost reply on an edit, then the SAME edit again: the request ID is reused, one change is recorded', async () => {
    const coke = (await A.svc.listProducts(A.businessId, q({ search: 'Coke' }))).rows[0];
    drop.dropNextReply();
    expect(await A.svc.changeSellingPrice(A.businessId, coke, 260)).toMatchObject({ kind: 'no_response' });
    await A.svc.checkConnection(A.businessId);
    // The retry reads the product again (now 260): the merged inputs are identical, so the saved ID is reused
    expect(ok(await A.svc.changeSellingPrice(A.businessId, coke, 260))).toEqual({ changed: true });
    const audit = await A.client.from('audit_log').select('after').eq('action', 'update_product').eq('entity_id', coke.id);
    expect(audit.data).toEqual([{ after: { selling_price: 260 } }]);
    expect(A.pendingData.size).toBe(0);
  });

  it('PS-12: category add whose reply is lost: the retry is reported as saved (read back), not "already used"; one category', async () => {
    drop.dropNextReply('/rest/v1/categories');
    expect(await A.svc.createCategory(A.businessId, 'Provisions')).toEqual({ ok: false, kind: 'no_response', message: UNKNOWN_OUTCOME_MESSAGE });
    await A.svc.checkConnection(A.businessId);
    const retried = await A.svc.createCategory(A.businessId, ' provisions ');
    expect(retried).toMatchObject({ ok: true, reconciled: true, data: { name: 'Provisions', archived: false } });
    const rows = await A.client.from('categories').select('id').eq('business_id', A.businessId).ilike('name', 'provisions');
    expect(rows.data).toHaveLength(1);
    // Without a lost attempt, a duplicate is still refused as a duplicate (definitely not saved)
    expect(await A.svc.createCategory(A.businessId, 'Provisions')).toMatchObject({ ok: false, kind: 'refused', message: DUPLICATE_NAME_MESSAGE });
  });

  it('PS-13: category rename, archive and restore whose replies are lost: the retry confirms the state; archive time is kept', async () => {
    const prov = (await A.svc.listCategories(A.businessId)).find((c) => c.name === 'Provisions')!;
    drop.dropNextReply('/rest/v1/categories');
    expect(await A.svc.renameCategory(A.businessId, prov.id, 'Provisions & Grains')).toMatchObject({ kind: 'no_response' });
    await A.svc.checkConnection(A.businessId);
    expect(ok(await A.svc.renameCategory(A.businessId, prov.id, 'Provisions & Grains')).name).toBe('Provisions & Grains');

    drop.dropNextReply('/rest/v1/categories');
    expect(await A.svc.setCategoryArchived(A.businessId, prov.id, true)).toMatchObject({ kind: 'no_response' });
    await A.svc.checkConnection(A.businessId);
    const first = await A.client.from('categories').select('deleted_at').eq('id', prov.id).single();
    expect(first.data!.deleted_at).not.toBeNull();
    expect(await A.svc.setCategoryArchived(A.businessId, prov.id, true)).toMatchObject({ ok: true, reconciled: true, data: { archived: true } });
    const again = await A.client.from('categories').select('deleted_at').eq('id', prov.id).single();
    expect(again.data!.deleted_at).toBe(first.data!.deleted_at);

    drop.dropNextReply('/rest/v1/categories');
    expect(await A.svc.setCategoryArchived(A.businessId, prov.id, false)).toMatchObject({ kind: 'no_response' });
    await A.svc.checkConnection(A.businessId);
    expect(await A.svc.setCategoryArchived(A.businessId, prov.id, false)).toMatchObject({ ok: true, reconciled: true, data: { archived: false } });
    // A category that doesn't exist (or belongs to another shop) is a definite refusal
    expect(await A.svc.setCategoryArchived(A.businessId, randomUUID(), true)).toMatchObject({ ok: false, kind: 'refused', message: MESSAGES.category_not_found });
  });

  it('PS-14: quick price change from a stale copy keeps another user\'s newer name, unit, category and level', async () => {
    const stale = (await A.svc.listProducts(A.businessId, q({ search: 'Fanta' }))).rows[0];
    // Someone else (another phone of the shop) edits other fields after the list was loaded
    const other = await A.client.rpc('update_product', {
      p_request_id: randomUUID(), p_business_id: A.businessId, p_product_id: stale.id, p_name: 'Fanta orange 50cl',
      p_selling_price: stale.sellingPrice, p_category_id: null, p_unit: 'bottle', p_low_stock_level: 12, p_expected: expectedValues(stale),
    });
    expect(other.error).toBeNull();
    expect(ok(await A.svc.changeSellingPrice(A.businessId, stale, 275))).toEqual({ changed: true });
    expect(await A.svc.getProduct(A.businessId, stale.id)).toMatchObject({ name: 'Fanta orange 50cl', unit: 'bottle', categoryId: null, lowStockLevel: 12, sellingPrice: 275 });
  });

  it('PS-15: both changed the price: conflict, nothing saved, the current copy is returned; saving again from it works', async () => {
    const stale = (await A.svc.getProduct(A.businessId, (await A.svc.listProducts(A.businessId, q({ search: 'Fanta' }))).rows[0].id))!;
    await A.client.rpc('update_product', {
      p_request_id: randomUUID(), p_business_id: A.businessId, p_product_id: stale.id, p_name: stale.name,
      p_selling_price: 300, p_category_id: stale.categoryId, p_unit: stale.unit, p_low_stock_level: stale.lowStockLevel, p_expected: expectedValues(stale),
    });
    const res = await A.svc.changeSellingPrice(A.businessId, stale, 290);
    expect(res).toMatchObject({ ok: false, kind: 'conflict', current: { sellingPrice: 300 } });
    if (res.ok || res.kind !== 'conflict') throw new Error('expected conflict');
    expect(res.message).toBe('Someone else changed the price to GH₵ 3.00 while you were editing. Nothing was saved. Check it, then save again to use your price.');
    expect((await A.svc.getProduct(A.businessId, stale.id))!.sellingPrice).toBe(300);
    expect(ok(await A.svc.changeSellingPrice(A.businessId, res.current, 290))).toEqual({ changed: true });
    expect((await A.svc.getProduct(A.businessId, stale.id))!.sellingPrice).toBe(290);
    expect(A.pendingData.size).toBe(0);
  });

  it('PS-16: full edit: untouched fields keep newer values; a clash on an edited field is a conflict that names it', async () => {
    const stale = (await A.svc.getProduct(A.businessId, (await A.svc.listProducts(A.businessId, q({ search: 'Fanta' }))).rows[0].id))!;
    await A.client.rpc('update_product', {
      p_request_id: randomUUID(), p_business_id: A.businessId, p_product_id: stale.id, p_name: 'Fanta orange 50cl PET',
      p_selling_price: stale.sellingPrice, p_category_id: stale.categoryId, p_unit: stale.unit, p_low_stock_level: stale.lowStockLevel, p_expected: expectedValues(stale),
    });
    // Only the low-stock level edited: the other user's new name survives
    expect(ok(await A.svc.saveEdit(A.businessId, stale, { name: stale.name, categoryId: stale.categoryId, unit: stale.unit, sellingPrice: stale.sellingPrice, lowStockLevel: 20 }))).toEqual({ changed: true });
    expect(await A.svc.getProduct(A.businessId, stale.id)).toMatchObject({ name: 'Fanta orange 50cl PET', lowStockLevel: 20 });
    // The name edited too, from the stale copy: conflict, nothing saved
    const res = await A.svc.saveEdit(A.businessId, stale, { name: 'Fanta 50cl', categoryId: stale.categoryId, unit: stale.unit, sellingPrice: stale.sellingPrice, lowStockLevel: 25 });
    expect(res).toMatchObject({ ok: false, kind: 'conflict', message: "Someone else changed this product's name, low-stock level while you were editing. Nothing was saved. The latest values are shown; check them, then save again." });
    expect(await A.svc.getProduct(A.businessId, stale.id)).toMatchObject({ name: 'Fanta orange 50cl PET', lowStockLevel: 20 });
    // A product deleted meanwhile, or another shop's: definite refusal
    expect(await B.svc.saveEdit(B.businessId, stale, { ...stale, sellingPrice: 1 })).toMatchObject({ ok: false, kind: 'refused', message: MESSAGES.product_not_found });
  });

  it('PS-17: correct cost price when the stock changed after the screen loaded: nothing sent; then it works from the new figures', async () => {
    const seen = (await A.svc.getProduct(A.businessId, (await A.svc.listProducts(A.businessId, q({ search: 'Milo' }))).rows[0].id))!;
    const restock = await A.client.rpc('restock', {
      p_request_id: randomUUID(), p_business_id: A.businessId, p_product_id: seen.id, p_qty: 5, p_purchase_cost: 600, p_paid_now: 600, p_paid_from: 'cash_drawer',
    });
    expect(restock.error).toBeNull();
    const res = await A.svc.setCost(A.businessId, seen.id, 130, 'Supplier invoice', seen);
    expect(res).toMatchObject({ ok: false, kind: 'conflict', current: { stockQty: 15 } });
    if (res.ok || res.kind !== 'conflict') throw new Error('expected conflict');
    expect(res.message).toMatch(/stock changed while you were on this screen \(now 15\)\. Nothing was saved/);
    expect(ok(await A.svc.setCost(A.businessId, seen.id, 130, 'Supplier invoice', res.current))).toMatchObject({ changed: true, stockValue: 1950 });
  });

  it('PS-18: another change landing between the app\'s re-read and its save is refused by the server, not overwritten', async () => {
    const loaded = (await A.svc.getProduct(A.businessId, (await A.svc.listProducts(A.businessId, q({ search: 'Sugar' }))).rows[0].id))!;
    const auditsBefore = (await A.client.from('audit_log').select('id').eq('action', 'update_product').eq('entity_id', loaded.id)).data!.length;
    // Just before the app's update_product request leaves, another phone of the shop renames the product
    drop.beforeNext('/rpc/update_product', async () => {
      const latest = (await A.client.from('products').select('name, selling_price, category_id, unit, low_stock_level').eq('id', loaded.id).single()).data!;
      const r = await A.client.rpc('update_product', {
        p_request_id: randomUUID(), p_business_id: A.businessId, p_product_id: loaded.id, p_name: 'Sugar 1kg (brown)',
        p_selling_price: latest.selling_price, p_category_id: latest.category_id, p_unit: latest.unit, p_low_stock_level: latest.low_stock_level, p_expected: latest,
      });
      if (r.error) throw r.error;
    });
    const res = await A.svc.changeSellingPrice(A.businessId, loaded, 2100);
    expect(res).toMatchObject({ ok: false, kind: 'conflict', message: MESSAGES.product_changed, current: { name: 'Sugar 1kg (brown)', sellingPrice: loaded.sellingPrice } });
    // The other phone's rename survives; the price was not written; only the rename was audited
    expect(await A.svc.getProduct(A.businessId, loaded.id)).toMatchObject({ name: 'Sugar 1kg (brown)', sellingPrice: loaded.sellingPrice });
    expect((await A.client.from('audit_log').select('id').eq('action', 'update_product').eq('entity_id', loaded.id)).data).toHaveLength(auditsBefore + 1);
    expect(A.pendingData.size).toBe(0);
    // From the latest copy, the same price change now goes through and keeps the new name
    if (res.ok || res.kind !== 'conflict') throw new Error('expected conflict');
    expect(ok(await A.svc.changeSellingPrice(A.businessId, res.current, 2100))).toEqual({ changed: true });
    expect(await A.svc.getProduct(A.businessId, loaded.id)).toMatchObject({ name: 'Sugar 1kg (brown)', sellingPrice: 2100 });
  });

  it('PS-19: two phones save different prices from the same copy at the same moment: exactly one wins, the other is told', async () => {
    const product = (await A.svc.listProducts(A.businessId, q({ search: 'Coke' }))).rows[0];
    for (let round = 0; round < 5; round++) {
      const start = (await A.svc.getProduct(A.businessId, product.id))!;
      const phone1 = new ProductsService(A.client, new PendingRequests(fakeSecureStore().store, randomUUID), new ConnectivityMonitor());
      const phone2 = new ProductsService(A.client, new PendingRequests(fakeSecureStore().store, randomUUID), new ConnectivityMonitor());
      const p1 = start.sellingPrice + 10;
      const p2 = start.sellingPrice + 20;
      const [r1, r2] = await Promise.all([phone1.changeSellingPrice(A.businessId, start, p1), phone2.changeSellingPrice(A.businessId, start, p2)]);
      const winners = [r1, r2].filter((r) => r.ok);
      const losers = [r1, r2].filter((r) => !r.ok);
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);
      expect(losers[0]).toMatchObject({ ok: false, kind: 'conflict' });
      const final = (await A.svc.getProduct(A.businessId, product.id))!.sellingPrice;
      expect(final).toBe(r1.ok ? p1 : p2);
    }
  });

  it('PS-20: a direct call without expected values is refused (no unconditional overwrite), shown as the generic message', async () => {
    const coke = (await A.svc.listProducts(A.businessId, q({ search: 'Coke' }))).rows[0];
    const r = await A.client.rpc('update_product', {
      p_request_id: randomUUID(), p_business_id: A.businessId, p_product_id: coke.id, p_name: 'Coke', p_selling_price: 1,
      p_category_id: null, p_unit: null, p_low_stock_level: 0,
    });
    expect(r.error?.message).toBe('expected_values_required');
    expect(classifyRpcError(r.error as never)).toMatchObject({ kind: 'definite', code: 'expected_values_required' });
    expect(messageFor(classifyRpcError(r.error as never))).toBe(GENERIC_MESSAGE);
    expect((await A.svc.getProduct(A.businessId, coke.id))!.name).toBe('Coke 50cl');
  });

  it('PS-10: another owner can\'t see or change this shop\'s products or categories', async () => {
    const page = await B.svc.listProducts(A.businessId, q());
    expect(page).toEqual({ rows: [], total: 0 });
    const aProduct = (await A.svc.listProducts(A.businessId, q())).rows[0];
    expect(await B.svc.getProduct(A.businessId, aProduct.id)).toBeNull();
    expect(await B.svc.listCategories(A.businessId)).toEqual([]);
    expect(await B.svc.setArchived(A.businessId, aProduct.id, true)).toMatchObject({ ok: false, kind: 'refused', message: MESSAGES.not_a_member });
    expect(await B.svc.updateProduct(A.businessId, aProduct.id, { name: 'Hacked', categoryId: null, unit: null, sellingPrice: 1, lowStockLevel: 0 }, aProduct))
      .toMatchObject({ ok: false, message: MESSAGES.not_a_member });
    expect(await B.svc.createCategory(A.businessId, 'Intruder')).toMatchObject({ ok: false, kind: 'refused' });
    const aCat = (await A.svc.listCategories(A.businessId))[0];
    expect((await B.svc.renameCategory(A.businessId, aCat.id, 'Intruder')).ok).toBe(false);
    expect((await A.svc.listCategories(A.businessId))[0].name).toBe(aCat.name);
    // B's own product with the same name as one of A's is fine (names are per shop)
    ok(await B.svc.createProduct(B.businessId, fields('Milo sachet')));
  });

  it('PS-11: server pagination past the 1,000-row limit: every product is reachable, none twice', async () => {
    const C = await ownerWithShop('svc-c');
    const total = 1005;
    for (let i = 0; i < total; i += 25) {
      const batch = Array.from({ length: Math.min(25, total - i) }, (_, k) => i + k);
      const results = await Promise.all(batch.map((n) => C.client.rpc('create_product', {
        p_request_id: randomUUID(), p_business_id: C.businessId, p_name: `Item ${String(n).padStart(4, '0')}`, p_selling_price: 100 + n,
        p_category_id: null, p_unit: null, p_cost_price: null, p_opening_stock: n % 7, p_low_stock_level: 5,
      })));
      for (const r of results) if (r.error) throw r.error;
    }
    const first = await C.svc.listProducts(C.businessId, q());
    expect(first.total).toBe(total);
    expect(first.rows).toHaveLength(PAGE_SIZE);
    const seen = new Set<string>();
    for (let offset = 0; offset < total; offset += PAGE_SIZE) {
      const page = await C.svc.listProducts(C.businessId, q({ offset }));
      for (const r of page.rows) seen.add(r.id);
    }
    expect(seen.size).toBe(total);
    const last = await C.svc.listProducts(C.businessId, q({ offset: 990 }));
    expect(last.rows.map((r) => r.name)).toEqual(Array.from({ length: 15 }, (_, k) => `Item ${String(990 + k).padStart(4, '0')}`));
    const searched = await C.svc.listProducts(C.businessId, q({ search: 'Item 10', sort: 'lowest_stock' }));
    // Only "Item 1000" – "Item 1004" contain "Item 10"; lowest stock first
    expect(searched.total).toBe(5);
    const stocks = searched.rows.map((r) => r.stockQty);
    expect(stocks).toEqual([...stocks].sort((a, b) => a - b));
  }, 180_000);
});
