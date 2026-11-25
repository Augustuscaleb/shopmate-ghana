import { formatCedis, formatTime, type DashboardOverview } from '../services/dashboard';
import { updatedLabel } from '../lib/freshness';

/**
 * Load state and display text for the Today dashboard (S-10), kept free of React Native so
 * it can be unit-tested.
 *
 * - `loading`: the first load, or a retry when nothing has been shown yet.
 * - `error`:   no figures could be loaded at all.
 * - `ready`:   figures are shown. `refreshFailed` means a later refresh failed; the last
 *              successfully loaded figures stay on screen with an error notice (they are never
 *              replaced by placeholders, and never presented as current).
 */
export type DashboardLoad =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; data: DashboardOverview; updatedAt: string; refreshFailed: boolean };

export function loadSucceeded(data: DashboardOverview, at: Date = new Date()): DashboardLoad {
  return { kind: 'ready', data, updatedAt: at.toISOString(), refreshFailed: false };
}

/** A failed load keeps figures that were already shown; otherwise there is nothing to show. */
export function loadFailed(previous: DashboardLoad): DashboardLoad {
  return previous.kind === 'ready' ? { ...previous, refreshFailed: true } : { kind: 'error' };
}

/** Screen-reader label for the revenue card, matching what is on screen in every state. */
export function revenueAccessibilityLabel(load: DashboardLoad): string {
  if (load.kind === 'loading') return "Today's revenue: loading";
  if (load.kind === 'error') return "Today's revenue: not available, the figures could not be loaded";
  const { todayRevenuePesewas: revenue, todaySalesCount: count } = load.data;
  const base = `Today's revenue: ${formatCedis(revenue)}, from ${count} recorded ${count === 1 ? 'sale' : 'sales'}`;
  return load.refreshFailed ? `${base}. Last updated at ${formatTime(load.updatedAt)}; the latest update failed` : base;
}

/** The line under the revenue figure. */
export function revenueCaption(load: DashboardLoad): string {
  if (load.kind === 'loading') return 'Loading…';
  if (load.kind === 'error') return 'Not available';
  const count = load.data.todaySalesCount;
  return count === 0 ? 'No sales recorded today yet' : `From ${count} recorded ${count === 1 ? 'sale' : 'sales'}`;
}

/** What the Recent activity card shows. "empty" is only ever used when loading succeeded. */
export type ActivityView = 'loading' | 'error' | 'empty' | 'list';

export function activityView(load: DashboardLoad): ActivityView {
  if (load.kind === 'loading') return 'loading';
  if (load.kind === 'error') return 'error';
  return load.data.recentSales.length > 0 ? 'list' : 'empty';
}

/** The notice shown when a refresh failed but earlier figures are still on screen. */
export function staleNotice(load: DashboardLoad): string | null {
  if (load.kind !== 'ready' || !load.refreshFailed) return null;
  return `We couldn't update the figures. These are from your last update at ${formatTime(load.updatedAt)}. Check your internet connection, then try again.`;
}

/** "Updated 10:42" under the revenue figure (SY-06, increment 2b); null while nothing is shown. */
export function todayUpdatedLabel(load: DashboardLoad, now: Date): string | null {
  if (load.kind !== 'ready') return null;
  return updatedLabel(load.updatedAt, now, load.refreshFailed);
}
