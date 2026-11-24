import { describe, expect, it } from 'vitest';
import { PendingRequests, fingerprint } from './pendingRequests';
import { fakeSecureStore } from '../testing/fakeSecureStore';

function setup() {
  let n = 0;
  const { store } = fakeSecureStore();
  const pending = new PendingRequests(store, () => `id-${++n}`);
  return { store, pending };
}

describe('Request IDs for internet-only writes (SEC-24, 09 §4.3)', () => {
  it('REQ-01: the ID is saved before the call, and a retry of the same change reuses it', async () => {
    const { store, pending } = setup();
    const first = await pending.reserve('restock.p1', { qty: 4, cost: 3000 });
    expect(first).toEqual({ kind: 'ready', requestId: 'id-1', reused: false });
    expect(await store.getItemAsync('shopmate.pending.restock.p1')).toContain('id-1');
    expect(await pending.reserve('restock.p1', { cost: 3000, qty: 4 })).toEqual({ kind: 'ready', requestId: 'id-1', reused: true });
  });

  it('REQ-02: a definite answer releases the ID; the next change gets a new one', async () => {
    const { pending } = setup();
    await pending.reserve('restock.p1', { qty: 4 });
    await pending.settle('restock.p1');
    expect(await pending.reserve('restock.p1', { qty: 5 })).toEqual({ kind: 'ready', requestId: 'id-2', reused: false });
  });

  it('REQ-03: different inputs while an earlier outcome is unknown are held back, never sent as a second change', async () => {
    const { pending } = setup();
    await pending.reserve('restock.p1', { qty: 4 });
    expect(await pending.reserve('restock.p1', { qty: 5 })).toEqual({ kind: 'unconfirmed_previous' });
    await pending.discard('restock.p1');
    expect((await pending.reserve('restock.p1', { qty: 5 })).kind).toBe('ready');
  });

  it('REQ-04: operations are independent', async () => {
    const { pending } = setup();
    await pending.reserve('restock.p1', { qty: 4 });
    expect(await pending.reserve('restock.p2', { qty: 9 })).toEqual({ kind: 'ready', requestId: 'id-2', reused: false });
  });

  it('REQ-05: fingerprints ignore key order and undefined values, but not values', () => {
    expect(fingerprint({ a: 1, b: { d: 2, c: 3 } })).toBe(fingerprint({ b: { c: 3, d: 2 }, a: 1, z: undefined }));
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
  });

  it('REQ-06: unsafe operation keys are refused (secure-store key rules)', async () => {
    const { pending } = setup();
    await expect(pending.reserve('Restock/../x', {})).rejects.toThrow('invalid operation key');
  });

  it('REQ-07: an unreadable saved entry is replaced, not trusted', async () => {
    const { store, pending } = setup();
    await store.setItemAsync('shopmate.pending.restock.p1', 'not json');
    expect(await pending.reserve('restock.p1', { qty: 1 })).toEqual({ kind: 'ready', requestId: 'id-1', reused: false });
  });
});
