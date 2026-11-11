/**
 * Integration: the app's real Supabase client factory + chunked secure storage,
 * signing in against the LOCAL Supabase stack. Proves the session is persisted
 * only through the secure-storage adapter and survives an app restart.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSupabaseClient } from '../app/src/lib/supabase';
import { createChunkedSecureStorage } from '../app/src/lib/chunkedSecureStorage';
import { fakeSecureStore } from '../app/src/testing/fakeSecureStore';
import { testTarget } from './target';

describe.skipIf(process.env.SHOPMATE_TEST_TARGET === 'cloud')('Session persistence through secure storage (SEC-05)', () => {
  it('TC-AUTH-13: login session is stored only in secure storage and restored after restart', async () => {
    const { apiUrl, anonKey } = testTarget();
    const { store, data } = fakeSecureStore();
    const config = { supabaseUrl: apiUrl, supabaseAnonKey: anonKey };

    const email = `session.${randomUUID().slice(0, 8)}@example.test`;
    const password = `Test-${randomUUID()}`;
    const first = createSupabaseClient(config, createChunkedSecureStorage(store));
    const signUp = await first.auth.signUp({ email, password });
    expect(signUp.error).toBeNull();
    expect(signUp.data.session).not.toBeNull();

    // Persisted in (fake) secure storage, in chunks within the size limit, and never containing the password
    expect(data.size).toBeGreaterThan(0);
    for (const [key, value] of data) {
      expect(key).toMatch(/^shopmate\./);
      expect(value.length).toBeLessThanOrEqual(2048);
      expect(value).not.toContain(password);
    }

    // "Restart the app": a new client with the same secure store restores the session
    const second = createSupabaseClient(config, createChunkedSecureStorage(store));
    const restored = await second.auth.getSession();
    expect(restored.data.session?.user.email).toBe(email);

    // Sign out clears secure storage
    await second.auth.signOut({ scope: 'local' });
    expect(data.size).toBe(0);
  });
});
