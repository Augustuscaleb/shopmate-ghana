/**
 * Request IDs for internet-only writes (09 §4.3; SEC-24), saved before each call so that a retry
 * after a lost reply can never record the same change twice (the pattern of account.ts).
 *
 * Rules:
 * - The same change (same operation, same inputs) reuses its saved request ID until the server
 *   gives a definite answer.
 * - A definite answer (success or a refusal) releases the ID; the next attempt gets a new one.
 * - If an earlier attempt's outcome is unknown (no response) and the owner now submits DIFFERENT
 *   inputs for the same operation, the call is held back with `unconfirmed_previous`: the earlier
 *   change may already be saved, so the screen asks the owner to check first instead of sending
 *   a second change.
 */
export type KeyValueStore = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

type Saved = { id: string; fingerprint: string };

export type Reservation =
  | { kind: 'ready'; requestId: string; reused: boolean }
  | { kind: 'unconfirmed_previous' };

/** Stable text for a set of inputs: keys sorted at every level; undefined dropped. */
export function fingerprint(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v as object).sort()
        .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
        .map((k) => [k, norm((v as Record<string, unknown>)[k])]));
    }
    return v;
  };
  return JSON.stringify(norm(value));
}

export class PendingRequests {
  constructor(private store: KeyValueStore, private newId: () => string, private prefix = 'shopmate.pending.') {}

  /** Gets the request ID to send for `operation` with these inputs (see the rules above). */
  async reserve(operation: string, inputs: unknown): Promise<Reservation> {
    const key = this.key(operation);
    const print = fingerprint(inputs);
    const raw = await this.store.getItemAsync(key);
    if (raw) {
      const saved = this.parse(raw);
      if (saved && saved.fingerprint === print) return { kind: 'ready', requestId: saved.id, reused: true };
      if (saved) return { kind: 'unconfirmed_previous' };
    }
    const id = this.newId();
    await this.store.setItemAsync(key, JSON.stringify({ id, fingerprint: print } satisfies Saved));
    return { kind: 'ready', requestId: id, reused: false };
  }

  /** True while an earlier attempt of `operation` has no definite answer (increment 2). */
  async has(operation: string): Promise<boolean> {
    const raw = await this.store.getItemAsync(this.key(operation));
    return raw !== null && this.parse(raw) !== null;
  }

  /** The server answered (success or refusal): nothing is pending any more. */
  async settle(operation: string): Promise<void> {
    await this.store.deleteItemAsync(this.key(operation));
  }

  /** The owner has checked and confirms the earlier change should be forgotten. */
  async discard(operation: string): Promise<void> {
    await this.store.deleteItemAsync(this.key(operation));
  }

  private key(operation: string): string {
    if (!/^[a-z_]+(\.[0-9a-zA-Z_-]+)*$/.test(operation)) throw new Error(`invalid operation key ${operation}`);
    return `${this.prefix}${operation}`;
  }

  private parse(raw: string): Saved | null {
    try {
      const v = JSON.parse(raw) as Partial<Saved>;
      return typeof v.id === 'string' && typeof v.fingerprint === 'string' ? { id: v.id, fingerprint: v.fingerprint } : null;
    } catch {
      return null;
    }
  }
}
