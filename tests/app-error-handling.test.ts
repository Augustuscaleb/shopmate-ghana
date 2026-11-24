/**
 * Stage 1C-2 increment 1: the app's error handling against the real server.
 * - Every error code the migrations can raise has a plain-language message or is deliberately
 *   internal (owner decision: the message table is reviewed and used by the app).
 * - The classifier sees real supabase-js error shapes: a refusal from the local API is "definite"
 *   with its code; an unreachable server is "no response" and looks like a network failure.
 * LOCAL stack only; fictitious data; no service-role key.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MESSAGES, isInternalCode, messageFor } from '../app/src/services/errorMessages';
import { classifyRpcError, looksLikeNetworkFailure } from '../app/src/services/rpcErrors';
import { signedInOwner, testTarget } from './target';

const target = testTarget();
const run = randomUUID().slice(0, 8);

function raisedCodes(): string[] {
  const dir = join(__dirname, '..', 'supabase', 'migrations');
  const codes = new Set<string>();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql'))) {
    for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/raise exception '([a-z_]+)'/g)) codes.add(m[1]);
  }
  return [...codes].sort();
}

describe('Error message table coverage (07 E-02)', () => {
  it('APPERR-01: every code raised by the migrations has a message or is deliberately internal', () => {
    const codes = raisedCodes();
    expect(codes.length).toBeGreaterThan(60);
    const missing = codes.filter((c) => !(c in MESSAGES) && !isInternalCode(c));
    expect(missing).toEqual([]);
  });

  it('APPERR-02: the table has no stale entries for codes the server no longer raises', () => {
    const codes = new Set(raisedCodes());
    expect(Object.keys(MESSAGES).filter((c) => !codes.has(c))).toEqual([]);
  });
});

describe.skipIf(target.mode === 'cloud')('Error shapes from the real API (local stack)', () => {
  let owner: SupabaseClient;
  let shop: string;

  beforeAll(async () => {
    owner = (await signedInOwner(target, 'apperr', run)).client;
    const { data, error } = await owner.rpc('create_business', { p_request_id: randomUUID(), p_name: 'Error Shop', p_type: 'other' });
    if (error) throw error;
    shop = data.business_id;
  });

  it('APPERR-03: a refusal is "definite" with its code, and gets its plain message', async () => {
    const { error } = await owner.rpc('create_product', { p_request_id: randomUUID(), p_business_id: shop, p_name: 'Bad price', p_selling_price: 0 });
    const f = classifyRpcError(error);
    expect(f).toMatchObject({ kind: 'definite', code: 'invalid_selling_price', sqlState: '22023' });
    expect(messageFor(f)).toBe(MESSAGES.invalid_selling_price);
    expect(looksLikeNetworkFailure(error)).toBe(false);
  });

  it('APPERR-04: another shop is "definite" not_a_member (42501)', async () => {
    const { error } = await owner.rpc('inventory_summary', { p_business_id: randomUUID() });
    expect(classifyRpcError(error)).toMatchObject({ kind: 'definite', code: 'not_a_member', sqlState: '42501' });
  });

  it('APPERR-05: refund_required keeps its details (the exact refund the screen must ask for)', async () => {
    const p = await owner.rpc('create_product', { p_request_id: randomUUID(), p_business_id: shop, p_name: 'Refund tin', p_selling_price: 1000 });
    const r = await owner.rpc('restock', { p_request_id: randomUUID(), p_business_id: shop, p_product_id: p.data.product_id, p_qty: 10,
      p_purchase_cost: 1000, p_paid_now: 1000, p_paid_from: 'cash_drawer' });
    const { error } = await owner.rpc('correct_purchase', { p_request_id: randomUUID(), p_business_id: shop, p_purchase_id: r.data.purchase_id,
      p_type: 'cost', p_reason: 'Invoice', p_cost_change: -300 });
    const f = classifyRpcError(error);
    expect(f).toMatchObject({ kind: 'definite', code: 'refund_required' });
    expect(f.kind === 'definite' && JSON.parse(f.details!)).toEqual({ refund_amount: 300 });
  });

  it('APPERR-06: an unreachable server is "no response" and looks like a network failure', async () => {
    const dead = createClient('http://127.0.0.1:9', 'test-anon-key', { auth: { persistSession: false } });
    const { error } = await dead.rpc('inventory_summary', { p_business_id: randomUUID() });
    expect(error).not.toBeNull();
    expect(classifyRpcError(error).kind).toBe('no_response');
    expect(looksLikeNetworkFailure(error)).toBe(true);
  });
});
