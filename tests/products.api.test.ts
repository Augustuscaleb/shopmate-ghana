/**
 * Stage 1C, task T3: product and category management through the real API path
 * (Auth + PostgREST), as the app will call it. LOCAL stack only until the migration is applied
 * to the cloud project with the owner's approval (D11). Fictitious data only.
 */
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anonClient, signedInOwner, testTarget } from './target';

const target = testTarget();
const run = randomUUID().slice(0, 8);

let ownerA: SupabaseClient;
let ownerB: SupabaseClient;
let businessA: string;
let businessB: string;

const create = (client: SupabaseClient, business: string, fields: Record<string, unknown>, requestId: string = randomUUID()) =>
  client.rpc('create_product', { p_request_id: requestId, p_business_id: business, ...fields });

const update = (client: SupabaseClient, business: string, productId: string, fields: Record<string, unknown>) =>
  client.rpc('update_product', {
    p_request_id: randomUUID(), p_business_id: business, p_product_id: productId,
    p_category_id: null, p_unit: null, p_low_stock_level: 5, ...fields,
  });

const archive = (client: SupabaseClient, business: string, productId: string, archived: boolean) =>
  client.rpc('set_product_archived', { p_request_id: randomUUID(), p_business_id: business, p_product_id: productId, p_archived: archived });

async function createOk(client: SupabaseClient, business: string, fields: Record<string, unknown>): Promise<string> {
  const { data, error } = await create(client, business, fields);
  if (error) throw error;
  return data.product_id as string;
}

describe.skipIf(target.mode === 'cloud')('Products and categories through the API (T3)', () => {
  beforeAll(async () => {
    const a = await signedInOwner(target, 'prod-a', run);
    const b = await signedInOwner(target, 'prod-b', run);
    ownerA = a.client;
    ownerB = b.client;
    const ca = await ownerA.rpc('create_business', { p_request_id: a.requestId('create_business'), p_name: 'Products Shop A', p_type: 'provision' });
    const cb = await ownerB.rpc('create_business', { p_request_id: b.requestId('create_business'), p_name: 'Products Shop B', p_type: 'minimart' });
    if (ca.error) throw ca.error;
    if (cb.error) throw cb.error;
    businessA = ca.data.business_id;
    businessB = cb.data.business_id;
  });

  it('TC-INV-40a: an owner creates a product with opening stock and cost; it is stored and valued exactly', async () => {
    const id = await createOk(ownerA, businessA, {
      p_name: ' Milo sachet ', p_selling_price: 150, p_unit: 'sachet', p_cost_price: 110, p_opening_stock: 10, p_low_stock_level: 3,
    });
    const { data, error } = await ownerA.from('products').select('name, selling_price, unit, stock_qty, stock_value, cost_known, low_stock_level, active').eq('id', id).single();
    expect(error).toBeNull();
    expect(data).toEqual({ name: 'Milo sachet', selling_price: 150, unit: 'sachet', stock_qty: 10, stock_value: 1100, cost_known: true, low_stock_level: 3, active: true });
    const summary = await ownerA.rpc('inventory_summary', { p_business_id: businessA });
    expect(summary.data).toEqual({ product_count: 1, low_stock_count: 0 });
  });

  it('TC-INV-40b: selling price boundaries are enforced by the server', async () => {
    for (const price of [0, -5, 100000001]) {
      const { data, error } = await create(ownerA, businessA, { p_name: `Bad price ${price}`, p_selling_price: price });
      expect(data).toBeNull();
      expect(error?.message).toBe('invalid_selling_price');
    }
    expect(await createOk(ownerA, businessA, { p_name: 'One pesewa', p_selling_price: 1 })).toBeTruthy();
    expect(await createOk(ownerA, businessA, { p_name: 'One million cedis', p_selling_price: 100000000 })).toBeTruthy();
  });

  it('TC-INV-40c: quantity, cost and field limits are enforced by the server', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ p_opening_stock: 100001 }, 'invalid_opening_stock'],
      [{ p_opening_stock: 1, p_cost_price: 100000001 }, 'invalid_cost_price'],
      [{ p_cost_price: 50 }, 'cost_price_needs_opening_stock'],
      [{ p_low_stock_level: 100001 }, 'invalid_low_stock_level'],
      [{ p_unit: 'u'.repeat(31) }, 'unit_too_long'],
    ];
    for (const [fields, message] of cases) {
      const { error } = await create(ownerA, businessA, { p_name: `Limit ${message}`, p_selling_price: 100, ...fields });
      expect(error?.message).toBe(message);
    }
    const blank = await create(ownerA, businessA, { p_name: '   ', p_selling_price: 100 });
    expect(blank.error?.message).toBe('name_required');
  });

  it('TC-INV-40d: names are unique per shop ignoring case and spaces; the same name is allowed in another shop', async () => {
    const dup = await create(ownerA, businessA, { p_name: 'MILO SACHET', p_selling_price: 100 });
    expect(dup.error?.code).toBe('23505');
    expect(dup.error?.message).toBe('duplicate_product_name');
    const spaced = await create(ownerA, businessA, { p_name: '  milo sachet  ', p_selling_price: 100 });
    expect(spaced.error?.message).toBe('duplicate_product_name');
    expect(await createOk(ownerB, businessB, { p_name: 'Milo sachet', p_selling_price: 160 })).toBeTruthy();
  });

  it('TC-INV-40e: a repeated request (double tap or retry) creates only one product', async () => {
    const requestId = randomUUID();
    const first = await create(ownerA, businessA, { p_name: 'Retry soap', p_selling_price: 500, p_opening_stock: 2 }, requestId);
    const second = await create(ownerA, businessA, { p_name: 'Retry soap', p_selling_price: 500, p_opening_stock: 2 }, requestId);
    expect(first.error).toBeNull();
    expect(second.data).toEqual(first.data);
    const { count } = await ownerA.from('products').select('id', { count: 'exact', head: true }).eq('business_id', businessA).ilike('name', 'retry soap');
    expect(count).toBe(1);
    const movements = await ownerA.from('stock_movements').select('id').eq('product_id', first.data.product_id);
    expect(movements.data).toHaveLength(1);
  });

  it('TC-INV-41a: the app cannot write, change or delete products directly', async () => {
    const ins = await ownerA.from('products').insert({ business_id: businessA, name: 'Direct', selling_price: 100 });
    expect(ins.error?.code).toBe('42501');
    const { data: milo } = await ownerA.from('products').select('id').eq('business_id', businessA).eq('name', 'Milo sachet').single();
    const upd = await ownerA.from('products').update({ selling_price: 1, stock_qty: 999 }).eq('id', milo!.id);
    expect(upd.error?.code).toBe('42501');
    const del = await ownerA.from('products').delete().eq('id', milo!.id);
    expect(del.error?.code).toBe('42501');
    const { data } = await ownerA.from('products').select('selling_price, stock_qty').eq('id', milo!.id).single();
    expect(data).toEqual({ selling_price: 150, stock_qty: 10 });
  });

  it("TC-INV-41b: another shop's owner cannot read, create, update or archive shop A's products", async () => {
    const { data: milo } = await ownerA.from('products').select('id').eq('business_id', businessA).eq('name', 'Milo sachet').single();
    const seen = await ownerB.from('products').select('id').eq('business_id', businessA);
    expect(seen.data).toEqual([]);
    expect((await create(ownerB, businessA, { p_name: 'Intruder', p_selling_price: 100 })).error?.message).toBe('not_a_member');
    expect((await update(ownerB, businessA, milo!.id, { p_name: 'Hacked', p_selling_price: 1 })).error?.message).toBe('not_a_member');
    expect((await update(ownerB, businessB, milo!.id, { p_name: 'Hacked', p_selling_price: 1 })).error?.message).toBe('product_not_found');
    expect((await archive(ownerB, businessB, milo!.id, true)).error?.message).toBe('product_not_found');
    const { data } = await ownerA.from('products').select('name, selling_price, active').eq('id', milo!.id).single();
    expect(data).toEqual({ name: 'Milo sachet', selling_price: 150, active: true });
  });

  it('TC-INV-41c: signed-out callers cannot use the product functions', async () => {
    const anon = anonClient(target);
    const c = await create(anon, businessA, { p_name: 'Anon', p_selling_price: 100 });
    expect(c.error?.code).toBe('42501');
    const u = await update(anon, businessA, randomUUID(), { p_name: 'Anon', p_selling_price: 100 });
    expect(u.error?.code).toBe('42501');
  });

  it('TC-INV-42a: an update changes the editable fields and records the price change; stock is untouched', async () => {
    const { data: milo } = await ownerA.from('products').select('id').eq('business_id', businessA).eq('name', 'Milo sachet').single();
    const res = await update(ownerA, businessA, milo!.id, { p_name: 'Milo sachet 20g', p_selling_price: 175, p_unit: 'pack', p_low_stock_level: 4 });
    expect(res.error).toBeNull();
    expect(res.data).toEqual({ product_id: milo!.id, changed: true });
    const { data } = await ownerA.from('products').select('name, selling_price, unit, low_stock_level, stock_qty, stock_value').eq('id', milo!.id).single();
    expect(data).toEqual({ name: 'Milo sachet 20g', selling_price: 175, unit: 'pack', low_stock_level: 4, stock_qty: 10, stock_value: 1100 });
    const audit = await ownerA.from('audit_log').select('before, after').eq('action', 'update_product').eq('entity_id', milo!.id).single();
    expect(audit.data?.before).toMatchObject({ selling_price: 150, name: 'Milo sachet' });
    expect(audit.data?.after).toMatchObject({ selling_price: 175, name: 'Milo sachet 20g' });
  });

  it('TC-INV-42b: archiving keeps the product, its history and its name; restoring brings it back', async () => {
    const { data: milo } = await ownerA.from('products').select('id').eq('business_id', businessA).eq('name', 'Milo sachet 20g').single();
    const before = await ownerA.rpc('inventory_summary', { p_business_id: businessA });
    expect((await archive(ownerA, businessA, milo!.id, true)).data).toMatchObject({ active: false, changed: true });
    const { data } = await ownerA.from('products').select('active, deleted_at, stock_qty').eq('id', milo!.id).single();
    expect(data).toEqual({ active: false, deleted_at: null, stock_qty: 10 });
    const after = await ownerA.rpc('inventory_summary', { p_business_id: businessA });
    expect(after.data.product_count).toBe(before.data.product_count - 1);
    const history = await ownerA.from('stock_movements').select('id').eq('product_id', milo!.id);
    expect(history.data).toHaveLength(1);
    expect((await create(ownerA, businessA, { p_name: 'MILO SACHET 20G', p_selling_price: 100 })).error?.message).toBe('duplicate_product_name');
    expect((await archive(ownerA, businessA, milo!.id, false)).data).toMatchObject({ active: true, changed: true });
  });

  it('TC-INV-43: categories: created directly under RLS; archive refused while an active product uses them', async () => {
    const cat = await ownerA.from('categories').insert({ business_id: businessA, name: 'Beverages' }).select('id').single();
    expect(cat.error).toBeNull();
    const dupCat = await ownerA.from('categories').insert({ business_id: businessA, name: 'beverages' });
    expect(dupCat.error?.code).toBe('23505');
    const foreign = await ownerB.from('categories').insert({ business_id: businessA, name: 'Intruder' });
    expect(foreign.error?.code).toBe('42501');

    const juice = await createOk(ownerA, businessA, { p_name: 'Orange juice', p_selling_price: 800, p_category_id: cat.data!.id });
    const refused = await ownerA.from('categories').update({ deleted_at: new Date().toISOString() }).eq('id', cat.data!.id);
    expect(refused.error?.message).toBe('category_in_use');

    // A shop cannot put its product in another shop's category
    const otherCat = await ownerB.from('categories').insert({ business_id: businessB, name: 'B snacks' }).select('id').single();
    expect((await update(ownerA, businessA, juice, { p_name: 'Orange juice', p_selling_price: 800, p_category_id: otherCat.data!.id })).error?.message)
      .toBe('category_not_found');

    // Moving the product out lets the category be archived; it can then not be used
    expect((await update(ownerA, businessA, juice, { p_name: 'Orange juice', p_selling_price: 800 })).error).toBeNull();
    const archived = await ownerA.from('categories').update({ deleted_at: new Date().toISOString() }).eq('id', cat.data!.id).select('deleted_at').single();
    expect(archived.error).toBeNull();
    expect(archived.data?.deleted_at).not.toBeNull();
    expect((await create(ownerA, businessA, { p_name: 'Apple juice', p_selling_price: 800, p_category_id: cat.data!.id })).error?.message)
      .toBe('category_archived');
  });
});
