import { describe, expect, it } from 'vitest';
import { SharedReducedMotion, type MotionSource } from './reducedMotionState';

/** A controllable stand-in for the native setting. */
function fakeSource() {
  let resolveCheck: (v: boolean) => void = () => {};
  let rejectCheck: (e: unknown) => void = () => {};
  const listeners = new Set<(v: boolean) => void>();
  const calls = { check: 0, listen: 0, removed: 0 };
  const source: MotionSource = {
    check: () => { calls.check++; return new Promise<boolean>((res, rej) => { resolveCheck = res; rejectCheck = rej; }); },
    listen: (cb) => { calls.listen++; listeners.add(cb); return () => { calls.removed++; listeners.delete(cb); }; },
  };
  return {
    source, calls,
    answer: async (v: boolean) => { resolveCheck(v); await Promise.resolve(); await Promise.resolve(); },
    fail: async () => { rejectCheck(new Error('no native module')); await Promise.resolve(); await Promise.resolve(); },
    emit: (v: boolean) => { for (const l of [...listeners]) l(v); },
    listenerCount: () => listeners.size,
  };
}

describe('Shared reduce-motion state (owner-approved correction)', () => {
  it('RM-01: motion counts as reduced until the native check answers', async () => {
    const f = fakeSource();
    const s = new SharedReducedMotion(f.source);
    expect(s.current).toBe(true);
    s.subscribe(() => {});
    expect(s.current).toBe(true);
    expect(s.isKnown).toBe(false);
    await f.answer(false);
    expect(s.current).toBe(false);
    expect(s.isKnown).toBe(true);
  });

  it('RM-02: one native check and one native listener, however many consumers', async () => {
    const f = fakeSource();
    const s = new SharedReducedMotion(f.source);
    const offs = [s.subscribe(() => {}), s.subscribe(() => {}), s.subscribe(() => {})];
    expect(f.calls).toEqual({ check: 1, listen: 1, removed: 0 });
    offs.forEach((off) => off());
    expect(f.calls.removed).toBe(1);
    expect(f.listenerCount()).toBe(0);
  });

  it('RM-03: consumers are told when the setting changes, and only then', async () => {
    const f = fakeSource();
    const s = new SharedReducedMotion(f.source);
    let n = 0;
    s.subscribe(() => n++);
    await f.answer(true);   // known for the first time: notify
    f.emit(true);           // no change: no notification
    f.emit(false);          // change: notify
    expect(n).toBe(2);
    expect(s.current).toBe(false);
  });

  it('RM-04: a change event that arrives before the first answer wins', async () => {
    const f = fakeSource();
    const s = new SharedReducedMotion(f.source);
    s.subscribe(() => {});
    f.emit(true);
    await f.answer(false);  // older answer, ignored
    expect(s.current).toBe(true);
  });

  it('RM-05: if the native check fails, motion stays reduced', async () => {
    const f = fakeSource();
    const s = new SharedReducedMotion(f.source);
    s.subscribe(() => {});
    await f.fail();
    expect(s.current).toBe(true);
    expect(s.isKnown).toBe(false);
  });

  it('RM-06: after the last consumer leaves, late answers and events are ignored; the next consumer re-checks', async () => {
    const f = fakeSource();
    const s = new SharedReducedMotion(f.source);
    const off = s.subscribe(() => {});
    off();
    await f.answer(false);  // answer for a finished start: ignored
    expect(s.current).toBe(true);
    s.subscribe(() => {});
    expect(f.calls.check).toBe(2);
    expect(f.calls.listen).toBe(2);
    await f.answer(false);
    expect(s.current).toBe(false);
  });

  it('RM-07: unsubscribing twice is harmless', () => {
    const f = fakeSource();
    const s = new SharedReducedMotion(f.source);
    const off = s.subscribe(() => {});
    off();
    off();
    expect(f.calls.removed).toBe(1);
  });
});
