import { describe, expect, it } from 'vitest';
import { MIN_AUTO_REFRESH_AGE_MS, PERIODIC_REFRESH_MS, msUntilPeriodicRefresh, onHidden, onSaveEnded, onTrigger, shouldRefresh, updatedLabel } from './freshness';

const T = Date.UTC(2026, 10, 25, 10, 0, 0);

describe('When to reload data another device may have changed (increment 2b)', () => {
  it('FRESH-01: thresholds are 30 seconds for automatic triggers and 15 minutes for the periodic one', () => {
    expect(MIN_AUTO_REFRESH_AGE_MS).toBe(30_000);
    expect(PERIODIC_REFRESH_MS).toBe(900_000);
  });

  it('FRESH-02: manual reloads (pull-to-refresh, Try again, own save) are never throttled', () => {
    expect(shouldRefresh('manual', T, T)).toBe(true);
    expect(shouldRefresh('manual', T, T + 1)).toBe(true);
  });

  it('FRESH-03: returning to the app or the screen reloads only data older than 30 seconds', () => {
    for (const trigger of ['foreground', 'became_visible'] as const) {
      expect(shouldRefresh(trigger, T, T + 29_999), trigger).toBe(false);
      expect(shouldRefresh(trigger, T, T + 30_000), trigger).toBe(true);
      expect(shouldRefresh(trigger, T, T + 31_000), trigger).toBe(true);
    }
  });

  it('FRESH-04: the periodic reload is due after 15 minutes, not before', () => {
    expect(shouldRefresh('periodic', T, T + 14 * 60_000 + 59_000)).toBe(false);
    expect(shouldRefresh('periodic', T, T + 15 * 60_000)).toBe(true);
    expect(msUntilPeriodicRefresh(T, T)).toBe(900_000);
    expect(msUntilPeriodicRefresh(T, T + 600_000)).toBe(300_000);
    expect(msUntilPeriodicRefresh(T, T + 2 * 900_000)).toBe(0);
  });

  it('FRESH-05: never loaded, or a clock that moved backwards, means reload now', () => {
    for (const trigger of ['foreground', 'became_visible', 'periodic'] as const) {
      expect(shouldRefresh(trigger, null, T), trigger).toBe(true);
      expect(shouldRefresh(trigger, T, T - 5_000), trigger).toBe(true);
    }
    expect(msUntilPeriodicRefresh(null, T)).toBe(0);
    expect(msUntilPeriodicRefresh(T, T - 5_000)).toBe(0);
  });
});

describe('"Updated …" indicator (SY-06)', () => {
  const now = new Date(2026, 10, 25, 10, 42, 30);
  const iso = (d: Date) => d.toISOString();

  it('FRESH-10: just now, earlier today, yesterday and an older day', () => {
    expect(updatedLabel(iso(new Date(2026, 10, 25, 10, 42, 0)), now, false)).toBe('Updated just now');
    expect(updatedLabel(iso(new Date(2026, 10, 25, 9, 5, 0)), now, false)).toBe('Updated 09:05');
    expect(updatedLabel(iso(new Date(2026, 10, 24, 18, 5, 0)), now, false)).toBe('Updated yesterday 18:05');
    expect(updatedLabel(iso(new Date(2026, 10, 20, 8, 0, 0)), now, false)).toBe('Updated 20 Nov 08:00');
  });

  it('FRESH-11: a failed refresh shows the last SUCCESSFUL time and "couldn\'t refresh"', () => {
    expect(updatedLabel(iso(new Date(2026, 10, 25, 10, 42, 0)), now, true)).toBe("Last updated 10:42 · couldn't refresh");
    expect(updatedLabel(iso(new Date(2026, 10, 24, 18, 5, 0)), now, true)).toBe("Last updated yesterday 18:05 · couldn't refresh");
  });

  it('FRESH-12: nothing loaded yet, or an unreadable time', () => {
    expect(updatedLabel(null, now, false)).toBeNull();
    expect(updatedLabel(null, now, true)).toBe("Couldn't refresh");
    expect(updatedLabel('not a time', now, false)).toBeNull();
  });

  it('FRESH-13: a load time slightly in the future (clock skew) is not shown as "just now" but as its time', () => {
    expect(updatedLabel(iso(new Date(2026, 10, 25, 10, 50, 0)), now, false)).toBe('Updated 10:50');
  });
});

describe('Refreshes postponed during a save (review finding 6)', () => {
  it('FRESH-20: due while saving is postponed; after the save it runs once if the screen is visible', () => {
    let out = onTrigger('foreground', true, true, null);
    expect(out).toEqual({ run: null, postponed: 'foreground' });
    out = onSaveEnded(out.postponed, true, true);
    expect(out).toEqual({ run: 'foreground', postponed: null });
    // A later save has nothing left to run
    expect(onSaveEnded(out.postponed, true, true)).toEqual({ run: null, postponed: null });
  });

  it('FRESH-21: a save that ends while the screen is hidden or the app is in the background drops it', () => {
    expect(onSaveEnded('periodic', false, true)).toEqual({ run: null, postponed: null });
    expect(onSaveEnded('periodic', true, false)).toEqual({ run: null, postponed: null });
  });

  it('FRESH-22: hiding the screen clears a postponed refresh, so it never runs after a later save', () => {
    let postponed = onTrigger('periodic', true, true, null).postponed;
    expect(postponed).toBe('periodic');
    postponed = onHidden();
    expect(onSaveEnded(postponed, true, true)).toEqual({ run: null, postponed: null });
  });

  it('FRESH-23: a refresh that runs supersedes a postponed one; a trigger that is not due changes nothing', () => {
    expect(onTrigger('became_visible', true, false, 'periodic')).toEqual({ run: 'became_visible', postponed: null });
    expect(onTrigger('foreground', false, false, 'periodic')).toEqual({ run: null, postponed: 'periodic' });
  });
});
