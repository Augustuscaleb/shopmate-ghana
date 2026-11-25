/**
 * State changes of the product list (S-30), kept free of React Native so the refresh rules can be
 * unit-tested (increment 2b; regression fixes from the 2b review).
 *
 * - A silent refresh reloads the rows already loaded, in place (up to MAX_REFRESH_ROWS).
 * - A refresh that fails keeps every row, and also clears "loading more": a load-more answer that
 *   the refresh replaced is never delivered, so its spinner must not stay on (review finding 2).
 * - No automatic refresh while a new search, filter or sort is loading: the new list is on its
 *   way, and a failed refresh must never leave the OLD filter's rows under the NEW filter
 *   (finding 3).
 * - No second refresh while one is already running (finding 5).
 * - No second first load: while the first load (or a "Try again" load) is still running, a
 *   refresh (the app returning, the screen shown again) waits for it instead of starting the
 *   same load again (Stage 1C-3.1, Review-2 finding 3).
 */
import type { Page, Product } from '../../services/products';

export type ListState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; rows: Product[]; total: number; loadingMore: boolean; moreError: string | null;
      /** A new search, filter or sort is loading; the rows shown belong to the previous one. */
      reloading: boolean;
      /** Last successful load of these rows, and whether a later refresh failed (rows kept). */
      updatedAt: string; refreshFailed: boolean };

export const MAX_REFRESH_ROWS = 300;

/** The first page of a new list (a search, filter or sort, or the first load). */
export function listLoaded(page: Page<Product>, at: Date): ListState {
  return { kind: 'ready', rows: page.rows, total: page.total, loadingMore: false, moreError: null, reloading: false, updatedAt: at.toISOString(), refreshFailed: false };
}

/** A new search, filter or sort starts: rows stay visible (marked reloading) until it answers. */
export function filterLoadStarted(s: ListState): ListState {
  return s.kind === 'ready' ? { ...s, reloading: true } : { kind: 'loading' };
}

export function filterLoadFailed(message: string): ListState {
  return { kind: 'error', message };
}

/** What a refresh request should do now. */
export type RefreshPlan =
  | { kind: 'load' }                 // nothing usable on screen: do a normal first load
  | { kind: 'skip'; why: 'filter_loading' | 'already_refreshing' | 'first_loading' }
  | { kind: 'refresh'; limit: number };

/** `loadInFlight`: the latest request is a first-page load that hasn't answered yet. */
export function planRefresh(s: ListState, refreshInFlight: boolean, pageSize: number, loadInFlight = false): RefreshPlan {
  if (s.kind !== 'ready') return loadInFlight ? { kind: 'skip', why: 'first_loading' } : { kind: 'load' };
  if (s.reloading) return { kind: 'skip', why: 'filter_loading' };
  if (refreshInFlight) return { kind: 'skip', why: 'already_refreshing' };
  return { kind: 'refresh', limit: Math.min(Math.max(s.rows.length, pageSize), MAX_REFRESH_ROWS) };
}

export function refreshSucceeded(s: ListState, page: Page<Product>, at: Date): ListState {
  return s.kind === 'ready'
    ? { ...s, rows: page.rows, total: page.total, loadingMore: false, moreError: null, reloading: false, updatedAt: at.toISOString(), refreshFailed: false }
    : s;
}

/** Rows are kept; "couldn't refresh" is shown; a replaced load-more is not left spinning. */
export function refreshFailed(s: ListState): ListState {
  return s.kind === 'ready' ? { ...s, loadingMore: false, refreshFailed: true } : s;
}

export function loadMoreStarted(s: ListState): ListState {
  return s.kind === 'ready' ? { ...s, loadingMore: true, moreError: null } : s;
}

export function loadMoreSucceeded(s: ListState, page: Page<Product>): ListState {
  return s.kind === 'ready'
    ? { ...s, rows: [...s.rows, ...page.rows.filter((r) => !s.rows.some((x) => x.id === r.id))], total: page.total, loadingMore: false }
    : s;
}

export function loadMoreFailed(s: ListState, message: string): ListState {
  return s.kind === 'ready' ? { ...s, loadingMore: false, moreError: message } : s;
}

/** Whether another page can be requested now. */
export function canLoadMore(s: ListState): boolean {
  return s.kind === 'ready' && !s.loadingMore && !s.reloading && s.rows.length < s.total;
}

/**
 * The pull-down spinner (review 2, finding 2). It belongs to ONE request, identified by its
 * request token, and only that request's completion (success or failure) turns it off:
 * - a pull-down starts a refresh (or joins the refresh already running): that request owns it;
 * - a new search, filter or sort that replaces the owning request takes the spinner over, so
 *   it stays on until fresh data (or an error) arrives, and never stays on after that;
 * - an answer from a replaced request can't turn it off early.
 * null: no spinner.
 */
export type SpinnerOwner = number | null;

/** A pull-down: the given request (new or already running) owns the spinner. */
export function spinnerOnPull(requestToken: number): SpinnerOwner {
  return requestToken;
}

/** A newer request replaces the current one: it takes the spinner over, if one is showing. */
export function spinnerOnSupersede(owner: SpinnerOwner, newToken: number): SpinnerOwner {
  return owner === null ? null : newToken;
}

/** A request finished (success or failure): the spinner goes off only if it owned it. */
export function spinnerOnDone(owner: SpinnerOwner, finishedToken: number): SpinnerOwner {
  return owner === finishedToken ? null : owner;
}
