import { describe, expect, it } from 'vitest';
import type { DashboardOverview } from '../services/dashboard';
import {
  activityView,
  loadFailed,
  loadSucceeded,
  revenueAccessibilityLabel,
  revenueCaption,
  staleNotice,
  type DashboardLoad,
} from './dashboardState';

const overview = (over: Partial<DashboardOverview> = {}): DashboardOverview => ({
  ownerName: 'Ama Mensah', todaySalesCount: 0, todayRevenuePesewas: 0, productCount: 0, lowStockCount: 0, recentSales: [], ...over,
});
const sale = { id: 's1', receiptNo: 'A-000001', totalPesewas: 1250, paymentMethod: 'cash' as const, occurredAt: '2026-11-23T09:00:00Z', status: 'recorded' as const };
const loading: DashboardLoad = { kind: 'loading' };
const error: DashboardLoad = { kind: 'error' };
const at = new Date(2026, 10, 23, 14, 5);

describe('Dashboard load states (S-10)', () => {
  it('TC-DASH-07: Recent activity never claims "no sales" unless loading actually succeeded', () => {
    expect(activityView(loading)).toBe('loading');
    expect(activityView(error)).toBe('error');
    expect(activityView(loadSucceeded(overview(), at))).toBe('empty');
    expect(activityView(loadSucceeded(overview({ recentSales: [sale] }), at))).toBe('list');
    // After a failed refresh, the activity that was loaded stays (it is not turned into "empty" or "error")
    expect(activityView(loadFailed(loadSucceeded(overview({ recentSales: [sale] }), at)))).toBe('list');
  });

  it('TC-DASH-08: the revenue card screen-reader label matches loading, success and error', () => {
    expect(revenueAccessibilityLabel(loading)).toBe("Today's revenue: loading");
    expect(revenueAccessibilityLabel(error)).toBe("Today's revenue: not available, the figures could not be loaded");
    expect(revenueAccessibilityLabel(loadSucceeded(overview(), at))).toBe("Today's revenue: GH₵ 0.00, from 0 recorded sales");
    expect(revenueAccessibilityLabel(loadSucceeded(overview({ todaySalesCount: 1, todayRevenuePesewas: 1250 }), at))).toBe("Today's revenue: GH₵ 12.50, from 1 recorded sale");
    const stale = loadFailed(loadSucceeded(overview({ todaySalesCount: 2, todayRevenuePesewas: 2050 }), at));
    expect(revenueAccessibilityLabel(stale)).toBe("Today's revenue: GH₵ 20.50, from 2 recorded sales. Last updated at 14:05; the latest update failed");
    // No state is ever described as "loading" unless it is loading
    for (const s of [error, loadSucceeded(overview(), at), stale]) expect(revenueAccessibilityLabel(s)).not.toMatch(/loading/i);
    expect(revenueCaption(loading)).toBe('Loading…');
    expect(revenueCaption(error)).toBe('Not available');
    expect(revenueCaption(loadSucceeded(overview(), at))).toBe('No sales recorded today yet');
    expect(revenueCaption(stale)).toBe('From 2 recorded sales');
  });

  it('TC-DASH-09: a failed refresh keeps the last figures and adds an error notice; a failed first load shows the error', () => {
    const ready = loadSucceeded(overview({ todaySalesCount: 2, todayRevenuePesewas: 2050, productCount: 4 }), at);
    expect(staleNotice(ready)).toBeNull();
    const stale = loadFailed(ready);
    expect(stale).toEqual({ ...ready, refreshFailed: true });
    expect(stale.kind === 'ready' && stale.data).toEqual(ready.kind === 'ready' && ready.data);
    expect(staleNotice(stale)).toBe("We couldn't update the figures. These are from your last update at 14:05. Check your internet connection, then try again.");
    // Repeated failures keep the original figures and the original update time
    expect(loadFailed(stale)).toEqual(stale);
    // A later success clears the notice
    const fresh = loadSucceeded(overview({ todaySalesCount: 3 }), new Date(2026, 10, 23, 15, 0));
    expect(staleNotice(fresh)).toBeNull();
    // With nothing loaded yet, a failure is a plain error state with no figures
    expect(loadFailed(loading)).toEqual({ kind: 'error' });
    expect(loadFailed(error)).toEqual({ kind: 'error' });
    expect(staleNotice(error)).toBeNull();
  });
});
