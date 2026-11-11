/**
 * Integration: the app's onboarding service against the LOCAL Supabase stack.
 * Simulates crashes/lost replies to prove no duplicate shop or device is created.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSupabaseClient } from '../app/src/lib/supabase';
import { createChunkedSecureStorage } from '../app/src/lib/chunkedSecureStorage';
import { AccountService } from '../app/src/services/account';
import { fakeSecureStore } from '../app/src/testing/fakeSecureStore';
import { testTarget } from './target';

async function signedInOwner() {
  const { apiUrl, anonKey } = testTarget();
  const { store, data } = fakeSecureStore();
  const client = createSupabaseClient({ supabaseUrl: apiUrl, supabaseAnonKey: anonKey }, createChunkedSecureStorage(store));
  const { error } = await client.auth.signUp({ email: `onboard.${randomUUID().slice(0, 8)}@example.test`, password: `Test-${randomUUID()}` });
  if (error) throw error;
  return { client, store, data };
}

describe.skipIf(process.env.SHOPMATE_TEST_TARGET === 'cloud')('Onboarding: shop setup and device registration', () => {
  it('TC-AUTH-14: a new owner has no shop; setup creates exactly one, with reference code and pilot plan', async () => {
    const { client, store } = await signedInOwner();
    const svc = new AccountService(client, store, randomUUID);
    expect(await svc.fetchMyBusiness()).toBeNull();
    const biz = await svc.createMyBusiness({ name: ' Ama Test Provisions ', type: 'provision', town: 'Accra', phone: '024 123 4567' });
    expect(biz.reference_code).toMatch(/^SM-\d{4,}$/);
    expect(await svc.fetchMyBusiness()).toMatchObject({ id: biz.id, name: 'Ama Test Provisions' });
    const { data } = await client.from('businesses').select('phone, town');
    expect(data).toEqual([{ phone: '0241234567', town: 'Accra' }]);
  });

  it('TC-AUTH-15: if the reply to "create shop" is lost, retrying does not create a second shop', async () => {
    const { client, store } = await signedInOwner();
    // First attempt reaches the server, but the app "crashes" before clearing the pending request ID
    const svc = new AccountService(client, store, randomUUID);
    const requestId = randomUUID();
    await store.setItemAsync('shopmate.pending.create_business', requestId);
    await client.rpc('create_business', { p_request_id: requestId, p_name: 'Retry Shop', p_type: 'other' });
    // App restarts and the owner taps "Create shop" again
    await svc.createMyBusiness({ name: 'Retry Shop', type: 'other', town: '', phone: '' });
    const { data } = await client.from('businesses').select('id');
    expect(data).toHaveLength(1);
    expect(await store.getItemAsync('shopmate.pending.create_business')).toBeNull();
  });

  it('TC-AUTH-16: device registration happens once, is remembered, and survives a lost reply', async () => {
    const { client, store } = await signedInOwner();
    const svc = new AccountService(client, store, randomUUID);
    const biz = await svc.createMyBusiness({ name: 'Device Shop', type: 'boutique', town: '', phone: '' });

    // Lost reply: request reached the server, app crashed before saving the device
    const requestId = randomUUID();
    await store.setItemAsync(`shopmate.pending.register_device.${biz.id}`, requestId);
    await client.rpc('register_device', { p_request_id: requestId, p_business_id: biz.id, p_label: 'Phone' });

    const first = await svc.ensureDevice(biz.id, 'Phone');
    const again = await svc.ensureDevice(biz.id, 'Phone');
    expect(first).toEqual(again);
    expect(first.deviceCode).toBe('A');
    const { data } = await client.from('devices').select('id').eq('business_id', biz.id);
    expect(data).toHaveLength(1);
  });
});
