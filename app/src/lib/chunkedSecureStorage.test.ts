import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, createChunkedSecureStorage, safeKey } from './chunkedSecureStorage';
import { fakeSecureStore } from '../testing/fakeSecureStore';

describe('Chunked secure session storage (SEC-05)', () => {
  it('TC-AUTH-09: stores and restores values larger than the 2 KB secure-store limit', async () => {
    const { store, data } = fakeSecureStore();
    const s = createChunkedSecureStorage(store);
    const big = 'x'.repeat(CHUNK_SIZE * 3 + 17);
    await s.setItem('sb-abc-auth-token', big);
    expect(await s.getItem('sb-abc-auth-token')).toBe(big);
    for (const v of data.values()) expect(v.length).toBeLessThanOrEqual(2048);
  });

  it('TC-AUTH-10: shrinking a value removes old chunks; removeItem deletes everything', async () => {
    const { store, data } = fakeSecureStore();
    const s = createChunkedSecureStorage(store);
    await s.setItem('k', 'y'.repeat(CHUNK_SIZE * 4));
    await s.setItem('k', 'short');
    expect(await s.getItem('k')).toBe('short');
    expect([...data.keys()].sort()).toEqual(['shopmate.k.0', 'shopmate.k.n']);
    await s.removeItem('k');
    expect(data.size).toBe(0);
  });

  it('TC-AUTH-11: a missing chunk is treated as logged out, never as a corrupted session', async () => {
    const { store, data } = fakeSecureStore();
    const s = createChunkedSecureStorage(store);
    await s.setItem('k', 'z'.repeat(CHUNK_SIZE * 2 + 1));
    data.delete('shopmate.k.1');
    expect(await s.getItem('k')).toBeNull();
    expect(data.size).toBe(0);
  });

  it('TC-AUTH-12: unsafe characters in keys are made safe for secure storage', () => {
    expect(safeKey('sb-127.0.0.1:54321-auth-token')).toMatch(/^[\w.-]+$/);
  });
});
