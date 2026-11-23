/**
 * Idempotency keys through the real API path (Auth + PostgREST): a request ID replayed by the
 * same owner for the same function is answered with the stored result only for the SAME shop.
 * The owner here has two shops. LOCAL stack only until the migrations are applied to the cloud
 * project with the owner's approval (D11). Fictitious data only.
 */
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { signedInOwner, testTarget } from './target';

const target = testTarget();
const run = randomUUID().slice(0, 8);

let owner: SupabaseClient;
let shop1: string;
let shop2: string;
let shop1Request: string;
let shop1Result: unknown;

describe.skipIf(target.mode === 'cloud')('Request IDs are bound to one shop', () => {
  beforeAll(async () => {
    const o = await signedInOwner(target, 'idem', run);
    owner = o.client;
    shop1Request = randomUUID();
    const s1 = await owner.rpc('create_business', { p_request_id: shop1Request, p_name: 'Idempotency Shop One', p_type: 'provision' });
    const s2 = await owner.rpc('create_business', { p_request_id: randomUUID(), p_name: 'Idempotency Shop Two', p_type: 'minimart' });
    if (s1.error) throw s1.error;
    if (s2.error) throw s2.error;
    shop1 = s1.data.business_id;
    shop2 = s2.data.business_id;
    shop1Result = s1.data;
  });

  it('TC-IDEM-40: create_business retried with the same request ID returns the original shop', async () => {
    const again = await owner.rpc('create_business', { p_request_id: shop1Request, p_name: 'Idempotency Shop One', p_type: 'provision' });
    expect(again.error).toBeNull();
    expect(again.data).toEqual(shop1Result);
  });

  it('TC-IDEM-41: create_product retried for the same shop returns the original product', async () => {
    const requestId = randomUUID();
    const args = { p_request_id: requestId, p_business_id: shop1, p_name: 'Idem Milo', p_selling_price: 150 };
    const first = await owner.rpc('create_product', args);
    const second = await owner.rpc('create_product', args);
    expect(first.error).toBeNull();
    expect(second.data).toEqual(first.data);
    const { count } = await owner.from('products').select('id', { count: 'exact', head: true }).eq('business_id', shop1);
    expect(count).toBe(1);
  });

  it("TC-IDEM-42: the same request ID sent for the owner's other shop is refused, and nothing is created there", async () => {
    const requestId = randomUUID();
    const first = await owner.rpc('create_product', { p_request_id: requestId, p_business_id: shop1, p_name: 'Idem Soap', p_selling_price: 500 });
    expect(first.error).toBeNull();
    const replay = await owner.rpc('create_product', { p_request_id: requestId, p_business_id: shop2, p_name: 'Idem Soap', p_selling_price: 500 });
    expect(replay.data).toBeNull();
    expect(replay.error?.code).toBe('22023');
    expect(replay.error?.message).toBe('request_id_reused');
    const { count } = await owner.from('products').select('id', { count: 'exact', head: true }).eq('business_id', shop2);
    expect(count).toBe(0);
  });

  it('TC-IDEM-43: a device request ID cannot be replayed for the other shop either', async () => {
    const requestId = randomUUID();
    const first = await owner.rpc('register_device', { p_request_id: requestId, p_business_id: shop1, p_label: 'Phone' });
    expect(first.error).toBeNull();
    const replay = await owner.rpc('register_device', { p_request_id: requestId, p_business_id: shop2, p_label: 'Phone' });
    expect(replay.error?.message).toBe('request_id_reused');
    const { data } = await owner.from('devices').select('id').eq('business_id', shop2);
    expect(data).toEqual([]);
  });
});
