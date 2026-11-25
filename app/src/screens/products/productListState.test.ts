import { describe, expect, it } from 'vitest';
import type { Product } from '../../services/products';
import {
  MAX_REFRESH_ROWS, canLoadMore, filterLoadFailed, filterLoadStarted, listLoaded, loadMoreFailed, loadMoreStarted,
  loadMoreSucceeded, planRefresh, refreshFailed, refreshSucceeded, spinnerOnDone, spinnerOnPull, spinnerOnSupersede, type ListState,
} from './productListState';

const p = (n: number): Product => ({
  id: `p${n}`, name: `Test Item ${n}`, categoryId: null, unit: null, sellingPrice: 100 + n, stockQty: n, stockValue: 0,
  costKnown: false, lowStockLevel: 5, active: true,
});
const page = (from: number, count: number, total: number) => ({ rows: Array.from({ length: count }, (_, i) => p(from + i)), total });
const T1 = new Date(2026, 10, 25, 10, 0, 0);
const T2 = new Date(2026, 10, 25, 10, 5, 0);
const ready = (rows: number, total: number): ListState => listLoaded(page(1, rows, total), T1);

describe('Product list refresh rules (increment 2b review fixes)', () => {
  it('LIST-01 (finding 2): load-more in progress, then a refresh replaces it and FAILS: no stuck spinner, rows kept', () => {
    let s = ready(30, 35);
    s = loadMoreStarted(s);
    expect(s).toMatchObject({ loadingMore: true });
    expect(canLoadMore(s)).toBe(false);
    // The refresh starts (the load-more answer will be dropped), then fails
    s = refreshFailed(s);
    expect(s).toMatchObject({ kind: 'ready', loadingMore: false, refreshFailed: true, updatedAt: T1.toISOString(), total: 35 });
    expect(s.kind === 'ready' && s.rows.length).toBe(30);
    // More can be loaded again
    expect(canLoadMore(s)).toBe(true);
  });

  it('LIST-02 (finding 2): the same sequence with a refresh that SUCCEEDS also clears loading-more', () => {
    let s = loadMoreStarted(ready(30, 35));
    s = refreshSucceeded(s, page(1, 30, 36), T2);
    expect(s).toMatchObject({ loadingMore: false, refreshFailed: false, total: 36, updatedAt: T2.toISOString() });
    expect(canLoadMore(s)).toBe(true);
  });

  it('LIST-03 (finding 3): no automatic refresh while a new filter is loading; a failed filter load never shows the old rows', () => {
    let s = filterLoadStarted(ready(30, 35));
    expect(s).toMatchObject({ kind: 'ready', reloading: true });
    expect(planRefresh(s, false, 30)).toEqual({ kind: 'skip', why: 'filter_loading' });
    expect(canLoadMore(s)).toBe(false); // no more pages of the OLD list either
    s = filterLoadFailed("We couldn't load your products. Please try again.");
    expect(s).toEqual({ kind: 'error', message: "We couldn't load your products. Please try again." });
    // The new filter's own answer replaces everything
    expect(listLoaded(page(100, 3, 3), T2)).toMatchObject({ kind: 'ready', reloading: false, total: 3, refreshFailed: false });
  });

  it('LIST-04 (finding 5): a second refresh is not started while one is running', () => {
    expect(planRefresh(ready(30, 35), true, 30)).toEqual({ kind: 'skip', why: 'already_refreshing' });
    expect(planRefresh(ready(30, 35), false, 30)).toEqual({ kind: 'refresh', limit: 30 });
  });

  it('LIST-05: a refresh reloads the rows already loaded (at least one page, at most 300); nothing shown means a normal load', () => {
    expect(planRefresh(ready(5, 5), false, 30)).toEqual({ kind: 'refresh', limit: 30 });
    expect(planRefresh(ready(90, 200), false, 30)).toEqual({ kind: 'refresh', limit: 90 });
    expect(planRefresh(ready(400, 1005), false, 30)).toEqual({ kind: 'refresh', limit: MAX_REFRESH_ROWS });
    expect(planRefresh({ kind: 'loading' }, false, 30)).toEqual({ kind: 'load' });
    expect(planRefresh({ kind: 'error', message: 'x' }, false, 30)).toEqual({ kind: 'load' });
  });

  it('LIST-06: a failed refresh never empties a populated list; load-more appends without duplicates', () => {
    const s = refreshFailed(ready(30, 35));
    expect(s.kind === 'ready' && s.rows.map((r) => r.id)).toEqual(Array.from({ length: 30 }, (_, i) => `p${i + 1}`));
    const more = loadMoreSucceeded(loadMoreStarted(ready(30, 35)), page(29, 7, 35)); // overlaps p29, p30
    expect(more.kind === 'ready' && more.rows.length).toBe(35);
    expect(canLoadMore(more)).toBe(false); // all 35 shown
    expect(loadMoreFailed(loadMoreStarted(ready(30, 35)), 'Could not load more.')).toMatchObject({ loadingMore: false, moreError: 'Could not load more.' });
  });
});

describe('Pull-down spinner ownership (review 2, finding 2)', () => {
  /** Replays the screen's spinner steps; `refreshing` is what RefreshControl shows. */
  const refreshing = (owner: number | null) => owner !== null;

  it('SPIN-01 (a + b): pull-to-refresh starts, then a filter change begins and SUCCEEDS: spinner stays until the filter load ends, then goes off', () => {
    let owner: number | null = null;
    owner = spinnerOnPull(1);                 // pull-down starts refresh #1
    owner = spinnerOnSupersede(owner, 2);     // filter change: load #2 replaces it
    expect(refreshing(owner)).toBe(true);
    owner = spinnerOnDone(owner, 1);          // the replaced refresh #1 answers (dropped)
    expect(refreshing(owner)).toBe(true);     // not turned off early
    owner = spinnerOnDone(owner, 2);          // filter load #2 succeeds
    expect(refreshing(owner)).toBe(false);
  });

  it('SPIN-02 (a + c): the same, with the filter load FAILING: spinner goes off', () => {
    let owner: number | null = spinnerOnSupersede(spinnerOnPull(1), 2);
    owner = spinnerOnDone(owner, 2);          // filter load #2 fails (finally runs either way)
    expect(refreshing(owner)).toBe(false);
    owner = spinnerOnDone(owner, 1);          // a late answer from #1 changes nothing
    expect(refreshing(owner)).toBe(false);
  });

  it('SPIN-03: the replaced refresh answering AFTER the filter load still cannot leave the spinner on', () => {
    let owner: number | null = spinnerOnSupersede(spinnerOnPull(1), 2);
    owner = spinnerOnDone(owner, 2);
    owner = spinnerOnDone(owner, 1);
    expect(owner).toBeNull();
  });

  it('SPIN-04: a genuine pull-to-refresh keeps its spinner until it ends; a pull during a running request joins it', () => {
    let owner: number | null = spinnerOnPull(5);
    expect(refreshing(spinnerOnDone(owner, 4))).toBe(true);  // an older request ending doesn't turn it off
    owner = spinnerOnDone(owner, 5);
    expect(owner).toBeNull();
    // A pull while request #7 runs: #7 owns it and turns it off
    expect(spinnerOnDone(spinnerOnPull(7), 7)).toBeNull();
  });

  it('SPIN-05: automatic (silent) requests never turn a spinner on', () => {
    expect(spinnerOnSupersede(null, 9)).toBeNull();
    expect(spinnerOnDone(null, 9)).toBeNull();
  });

  it('SPIN-06: the old rule (clear only if still the latest request) would have left the spinner stuck', () => {
    // Before the fix: the spinner was turned off only by the pull's own request, and only if no
    // newer request had started; the filter load never turned it off.
    let oldRefreshing = true;                        // pull-down, refresh #1
    let latest = 1;
    latest = 2;                                      // filter load #2 starts (did not touch the spinner)
    if (1 === latest) oldRefreshing = false;         // refresh #1 ends: not the latest, so no change
    expect(oldRefreshing).toBe(true);                // stuck: nothing else ever cleared it
    // The new rule clears it
    expect(spinnerOnDone(spinnerOnDone(spinnerOnSupersede(spinnerOnPull(1), 2), 1), 2)).toBeNull();
  });
});
