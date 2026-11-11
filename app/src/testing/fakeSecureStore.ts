import type { SecureKeyValueStore } from '../lib/chunkedSecureStorage';

/** In-memory stand-in for expo-secure-store that enforces its documented rules. */
export function fakeSecureStore() {
  const data = new Map<string, string>();
  const store: SecureKeyValueStore = {
    async getItemAsync(k) { check(k); return data.get(k) ?? null; },
    async setItemAsync(k, v) { check(k); if (v.length > 2048) throw new Error('value over 2048'); data.set(k, v); },
    async deleteItemAsync(k) { check(k); data.delete(k); },
  };
  function check(k: string) { if (!/^[\w.-]+$/.test(k)) throw new Error(`invalid key ${k}`); }
  return { store, data };
}
