import { describe, expect, it } from 'vitest';
import { LatestRequest } from './latestRequest';

/** A promise the test resolves or rejects by hand, so answers can arrive in any order. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('Latest request wins (Stage 1C-3.1, Review-2 findings 1 and 3)', () => {
  it('LRQ-01: an older answer that arrives last never replaces the newer one', async () => {
    const guard = new LatestRequest();
    const shown: string[] = [];
    const older = deferred<string>();
    const newer = deferred<string>();
    const a = guard.run(() => older.promise, (v) => { shown.push(v); });
    const b = guard.run(() => newer.promise, (v) => { shown.push(v); });
    newer.resolve('new');
    older.resolve('old');
    expect(await b).toBe(true);
    expect(await a).toBe(false);
    expect(shown).toEqual(['new']);
  });

  it('LRQ-02: an older failure that arrives last never reports an error over the newer answer', async () => {
    const guard = new LatestRequest();
    const errors: unknown[] = [];
    const older = deferred<string>();
    const a = guard.run(() => older.promise, () => {}, (e) => errors.push(e));
    const b = guard.run(() => Promise.resolve('new'), () => {}, (e) => errors.push(e));
    await b;
    older.reject(new Error('offline'));
    expect(await a).toBe(false);
    expect(errors).toEqual([]);
  });

  it('LRQ-03: the latest failure is reported', async () => {
    const guard = new LatestRequest();
    const errors: unknown[] = [];
    expect(await guard.run(() => Promise.reject(new Error('x')), () => {}, (e) => errors.push(e))).toBe(true);
    expect(errors).toHaveLength(1);
  });

  it('LRQ-04: "running" shows a read in flight, so an automatic refresh can skip a duplicate load', async () => {
    const guard = new LatestRequest();
    expect(guard.running).toBe(false);
    const first = deferred<number>();
    let loads = 0;
    const refresh = () => { if (guard.running) return null; loads += 1; return guard.run(() => first.promise, () => {}); };
    const p = refresh();
    // The app returns to the foreground while the first load is still running: skipped
    expect(refresh()).toBeNull();
    expect(loads).toBe(1);
    first.resolve(1);
    await p;
    expect(guard.running).toBe(false);
    // Once it has answered, a later refresh runs
    expect(refresh()).not.toBeNull();
    expect(loads).toBe(2);
  });

  it('LRQ-05: a superseded read still running does not count as running', async () => {
    const guard = new LatestRequest();
    const older = deferred<number>();
    const a = guard.run(() => older.promise, () => {});
    await guard.run(() => Promise.resolve(2), () => {});
    expect(guard.running).toBe(false);
    older.resolve(1);
    await a;
  });

  it('LRQ-06: without a failure handler, the latest error is passed on', async () => {
    const guard = new LatestRequest();
    await expect(guard.run(() => Promise.reject(new Error('boom')), () => {})).rejects.toThrow('boom');
    expect(guard.running).toBe(false);
  });
});
