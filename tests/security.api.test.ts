/**
 * Stage 1 end-to-end security tests through the real Supabase API path the
 * app will use (Auth + PostgREST), against the LOCAL stack only.
 * Test IDs: docs/product-specification/10-test-plan.md §0a.
 */
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { localStack } from './localStack';

const { apiUrl, anonKey } = localStack();
const newClient = () =>
  createClient(apiUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

// Fictitious owners, unique per run
const run = randomUUID().slice(0, 8);
const password = `Test-${randomUUID()}`;

async function signUpOwner(label: string): Promise<SupabaseClient> {
  const client = newClient();
  const { error } = await client.auth.signUp({
    email: `owner.${label}.${run}@example.test`,
    password,
    options: { data: { full_name: `Test Owner ${label}` } },
  });
  if (error) throw error;
  return client;
}

let ownerA: SupabaseClient;
let ownerB: SupabaseClient;
let businessA: string;
let businessB: string;

beforeAll(async () => {
  ownerA = await signUpOwner('a');
  ownerB = await signUpOwner('b');

  const a = await ownerA.rpc('create_business', {
    p_request_id: randomUUID(), p_name: 'API Test Shop A', p_type: 'provision', p_town: 'Kumasi',
  });
  const b = await ownerB.rpc('create_business', {
    p_request_id: randomUUID(), p_name: 'API Test Shop B', p_type: 'minimart',
  });
  if (a.error) throw a.error;
  if (b.error) throw b.error;
  businessA = a.data.business_id;
  businessB = b.data.business_id;

  // B creates a customer and a category through the API
  const c = await ownerB.from('customers').insert({ business_id: businessB, name: 'B customer' });
  const k = await ownerB.from('categories').insert({ business_id: businessB, name: 'B category' });
  if (c.error) throw c.error;
  if (k.error) throw k.error;
});

describe('Authentication (SEC-01)', () => {
  it('TC-API-01: rejects passwords shorter than 8 characters', async () => {
    const { error } = await newClient().auth.signUp({ email: `short.${run}@example.test`, password: 'Ab1234' });
    expect(error).not.toBeNull();
  });

  it('TC-API-02: creates a profile for each new owner', async () => {
    const { data, error } = await ownerA.from('profiles').select('full_name');
    expect(error).toBeNull();
    expect(data).toEqual([{ full_name: 'Test Owner a' }]);
  });
});

describe('Business-data isolation through the API (TC-SEC-01)', () => {
  const businessTables = [
    'business_members', 'devices', 'device_anchors', 'device_time_events', 'categories', 'products',
    'product_cost_history', 'stock_movements', 'stock_discrepancies', 'purchases', 'supplier_payments',
    'purchase_corrections', 'supplier_returns', 'attention_items', 'sales', 'sale_items', 'customers',
    'customer_ledger', 'debt_recoveries', 'expense_categories', 'expenses', 'cash_counts', 'day_closings',
    'day_adjustments', 'subscriptions', 'subscription_payments', 'audit_log',
  ];

  it('TC-API-03: owner A reads zero rows of business B in every business table', async () => {
    const leaks: string[] = [];
    for (const table of businessTables) {
      const { data, error } = await ownerA.from(table).select('business_id').eq('business_id', businessB);
      if (error) throw new Error(`${table}: ${error.message}`);
      if (data.length > 0) leaks.push(table);
    }
    const { data: biz } = await ownerA.from('businesses').select('id').eq('id', businessB);
    if (biz && biz.length > 0) leaks.push('businesses');
    expect(leaks).toEqual([]);
  });

  it('TC-API-04: owner A sees their own business, expense categories and pilot subscription', async () => {
    const biz = await ownerA.from('businesses').select('id, reference_code');
    const cats = await ownerA.from('expense_categories').select('id');
    const sub = await ownerA.from('subscriptions').select('plan');
    expect(biz.data).toHaveLength(1);
    expect(biz.data![0].reference_code).toMatch(/^SM-\d{4,}$/);
    expect(cats.data).toHaveLength(10);
    expect(sub.data).toEqual([{ plan: 'pilot' }]);
  });

  it('TC-API-05: owner A cannot add a customer to business B', async () => {
    const { error } = await ownerA.from('customers').insert({ business_id: businessB, name: 'Intruder' });
    expect(error?.code).toBe('42501');
  });

  it('TC-API-06: owner A cannot change business B customers', async () => {
    const { data, error } = await ownerA
      .from('customers').update({ name: 'Changed by A' }).eq('business_id', businessB).select();
    expect(error).toBeNull();
    expect(data).toEqual([]);
    const check = await ownerB.from('customers').select('name');
    expect(check.data).toEqual([{ name: 'B customer' }]);
  });

  it('TC-API-07: owner A cannot register a device on business B', async () => {
    const { error } = await ownerA.rpc('register_device', { p_request_id: randomUUID(), p_business_id: businessB });
    expect(error?.code).toBe('42501');
  });
});

describe('Server-function-only writes (TC-SEC-03)', () => {
  it('TC-API-08: sales cannot be inserted directly, even into your own business', async () => {
    const { error } = await ownerA.from('sales').insert({
      id: randomUUID(), business_id: businessA, receipt_no: 'A-000001', subtotal: 100, total: 100,
    });
    expect(error?.code).toBe('42501');
  });

  it('TC-API-09: subscriptions cannot be changed by the owner', async () => {
    const { error } = await ownerA.from('subscriptions').update({ plan: 'plus' }).eq('business_id', businessA);
    expect(error?.code).toBe('42501');
  });

  it('TC-API-10: customers cannot be deleted (archive only)', async () => {
    const { error } = await ownerA.from('customers').delete().eq('business_id', businessA);
    expect(error?.code).toBe('42501');
  });
});

describe('Idempotency (SEC-24)', () => {
  it('TC-API-11: the same create_business request twice returns the same business', async () => {
    const requestId = randomUUID();
    const first = await ownerA.rpc('create_business', { p_request_id: requestId, p_name: 'Second shop', p_type: 'other' });
    const second = await ownerA.rpc('create_business', { p_request_id: requestId, p_name: 'Second shop', p_type: 'other' });
    expect(first.error).toBeNull();
    expect(second.data).toEqual(first.data);
  });

  it('TC-API-12: concurrent duplicate register_device requests create one device', async () => {
    const requestId = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        ownerA.rpc('register_device', { p_request_id: requestId, p_business_id: businessA, p_label: 'Race' })),
    );
    for (const r of results) expect(r.error).toBeNull();
    const ids = new Set(results.map((r) => r.data.device_id));
    expect(ids.size).toBe(1);
    const { data } = await ownerA.from('devices').select('id').eq('business_id', businessA).eq('label', 'Race');
    expect(data).toHaveLength(1);
  });
});

describe('Anonymous access (not signed in)', () => {
  it('TC-API-13: anonymous users cannot read business data', async () => {
    const anon = newClient();
    const { error } = await anon.from('businesses').select('id');
    expect(error?.code).toBe('42501');
  });

  it('TC-API-14: anonymous users cannot call create_business', async () => {
    const anon = newClient();
    const { error } = await anon.rpc('create_business', { p_request_id: randomUUID(), p_name: 'X', p_type: 'other' });
    expect(error).not.toBeNull();
  });
});
