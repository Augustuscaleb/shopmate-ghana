/**
 * Session storage for Supabase Auth backed by the phone's secure storage
 * (spec 07, SEC-05). On Android, expo-secure-store encrypts values with a key
 * held in the Android Keystore.
 *
 * Expo documents a ~2 KB size limit per stored value, and a Supabase session can
 * be larger, so values are split into chunks. If any chunk is missing or the
 * stored data is inconsistent, the item is treated as absent (the owner simply
 * logs in again). Nothing is ever written to plain, unencrypted storage.
 */
export interface SecureKeyValueStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface AuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const CHUNK_SIZE = 1800; // characters; safely below the documented limit
const MAX_CHUNKS = 64;

/** expo-secure-store only accepts keys made of letters, digits, ".", "-" and "_". */
export function safeKey(key: string): string {
  return key.replace(/[^\w.-]/g, '_');
}

export function createChunkedSecureStorage(store: SecureKeyValueStore, prefix = 'shopmate'): AuthStorage {
  const base = (key: string) => `${prefix}.${safeKey(key)}`;
  const countKey = (key: string) => `${base(key)}.n`;
  const chunkKey = (key: string, i: number) => `${base(key)}.${i}`;

  async function readCount(key: string): Promise<number> {
    const raw = await store.getItemAsync(countKey(key));
    const n = raw === null ? 0 : Number(raw);
    return Number.isInteger(n) && n > 0 && n <= MAX_CHUNKS ? n : 0;
  }

  async function removeItem(key: string): Promise<void> {
    const n = await readCount(key);
    await store.deleteItemAsync(countKey(key));
    for (let i = 0; i < Math.max(n, 1); i++) await store.deleteItemAsync(chunkKey(key, i));
  }

  return {
    async getItem(key) {
      const n = await readCount(key);
      if (n === 0) return null;
      const parts: string[] = [];
      for (let i = 0; i < n; i++) {
        const part = await store.getItemAsync(chunkKey(key, i));
        if (part === null) {
          await removeItem(key); // inconsistent: fail safe
          return null;
        }
        parts.push(part);
      }
      return parts.join('');
    },

    async setItem(key, value) {
      const chunks: string[] = [];
      for (let i = 0; i < value.length; i += CHUNK_SIZE) chunks.push(value.slice(i, i + CHUNK_SIZE));
      if (chunks.length === 0) chunks.push('');
      if (chunks.length > MAX_CHUNKS) throw new Error('Value too large for secure storage');
      const previous = await readCount(key);
      // Invalidate first, so a crash part-way through leaves "absent", never a mix of old and new.
      await store.deleteItemAsync(countKey(key));
      for (let i = 0; i < chunks.length; i++) await store.setItemAsync(chunkKey(key, i), chunks[i]);
      for (let i = chunks.length; i < previous; i++) await store.deleteItemAsync(chunkKey(key, i));
      await store.setItemAsync(countKey(key), String(chunks.length));
    },

    removeItem,
  };
}
