import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DashboardService,
  countLowStock,
  firstName,
  formatCedis,
  formatDayLabel,
  formatTime,
  greetingFor,
  initials,
  parseInventorySummary,
  summariseTodaySales,
  todayRange,
} from './dashboard';
import { loadFailed, loadSucceeded, revenueCaption, type DashboardLoad } from '../screens/dashboardState';

type Result = { data?: unknown; error?: unknown };
const EMPTY_SUMMARY = { product_count: 0, low_stock_count: 0 };

/**
 * A stand-in for the Supabase client: records each call and resolves to the given rows.
 * RPC results are given by function name; inventory_summary defaults to an empty shop.
 */
function fakeClient(tables: Record<string, Result>, calls: string[] = [], rpcs: Record<string, Result> = {}) {
  const builder = (table: string) => {
    const result = { data: tables[table]?.data ?? [], error: tables[table]?.error ?? null };
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gte', 'lt', 'in', 'is', 'order', 'limit']) {
      chain[m] = (...args: unknown[]) => { calls.push(`${table}.${m}(${JSON.stringify(args)})`); return chain; };
    }
    chain.maybeSingle = () => Promise.resolve({ data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data, error: result.error });
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
    return chain;
  };
  const rpc = (fn: string, args: unknown) => {
    calls.push(`rpc(${JSON.stringify([fn, args])})`);
    const r = rpcs[fn] ?? (fn === 'inventory_summary' ? { data: EMPTY_SUMMARY } : { error: new Error(`unexpected rpc ${fn}`) });
    return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
  };
  return { from: builder, rpc } as unknown as SupabaseClient;
}

describe('Dashboard figures (S-10)', () => {
  it('TC-DASH-01: formats integer pesewas as GH₵ without floating point', () => {
    expect(formatCedis(0)).toBe('GH₵ 0.00');
    expect(formatCedis(5)).toBe('GH₵ 0.05');
    expect(formatCedis(124050)).toBe('GH₵ 1,240.50');
    expect(formatCedis(100000000)).toBe('GH₵ 1,000,000.00');
    expect(formatCedis(-500)).toBe('−GH₵ 5.00');
    expect(() => formatCedis(12.5)).toThrow();
    expect(() => formatCedis(Number.NaN)).toThrow();
  });

  it('TC-DASH-02: today is the phone day, and labels follow the style guide', () => {
    const now = new Date(2026, 10, 23, 14, 5);
    const { start, end } = todayRange(now);
    expect(start).toEqual(new Date(2026, 10, 23));
    expect(end).toEqual(new Date(2026, 10, 24));
    expect(formatDayLabel(now)).toBe('Mon 23 Nov');
    expect(formatTime(new Date(2026, 10, 23, 9, 7).toISOString())).toBe('09:07');
    expect(formatTime('not a date')).toBe('');
    expect(greetingFor(new Date(2026, 0, 1, 8))).toBe('Good morning');
    expect(greetingFor(new Date(2026, 0, 1, 13))).toBe('Good afternoon');
    expect(greetingFor(new Date(2026, 0, 1, 19))).toBe('Good evening');
  });

  it('TC-DASH-03: names and initials never invent a person', () => {
    expect(firstName('Ama Mensah')).toBe('Ama');
    expect(firstName('  ')).toBeNull();
    expect(firstName(null)).toBeNull();
    expect(initials('Ama Mensah', 'Test Shop')).toBe('AM');
    expect(initials(null, 'Topboy')).toBe('TO');
    expect(initials(null, '')).toBe('S');
  });

  it('TC-DASH-04: summaries count only real rows, reject bad money, and use the low-stock rule', () => {
    expect(summariseTodaySales([])).toEqual({ count: 0, revenuePesewas: 0 });
    expect(summariseTodaySales([{ total: 1500 }, { total: 250 }])).toEqual({ count: 2, revenuePesewas: 1750 });
    expect(() => summariseTodaySales([{ total: '1500' }])).toThrow();
    // stock_qty <= low_stock_level is low (04 §2.4), including negative stock
    expect(countLowStock([
      { stock_qty: 5, low_stock_level: 5 },
      { stock_qty: 6, low_stock_level: 5 },
      { stock_qty: -2, low_stock_level: 5 },
      { stock_qty: 0, low_stock_level: 0 },
    ])).toBe(3);
  });

  it('TC-DASH-05: an empty shop gives zeros and no invented activity, using read-only, business-scoped queries', async () => {
    const calls: string[] = [];
    const overview = await new DashboardService(fakeClient({ profiles: { data: [{ full_name: 'Ama Mensah' }] } }, calls))
      .fetchOverview('biz-1', new Date(2026, 10, 23, 10));
    expect(overview).toEqual({ ownerName: 'Ama Mensah', todaySalesCount: 0, todayRevenuePesewas: 0, productCount: 0, lowStockCount: 0, recentSales: [] });
    // Every shop table query is limited to this business; only reads are issued
    expect(calls.some((c) => c.startsWith('sales.eq(["business_id","biz-1"])'))).toBe(true);
    expect(calls.every((c) => !/^\w+\.(insert|update|delete|upsert|rpc)\(/.test(c))).toBe(true);
    // The only RPC is the read-only inventory_summary for this business (D7), called exactly once,
    // and product rows are never fetched to the phone
    expect(calls.filter((c) => c.startsWith('rpc('))).toEqual(['rpc(["inventory_summary",{"p_business_id":"biz-1"}])']);
    expect(calls.some((c) => c.startsWith('products.'))).toBe(false);
    // Only recorded sales count towards today's figures
    expect(calls).toContain('sales.eq(["status","recorded"])');
  });

  it('TC-DASH-06: real rows are summarised, malformed activity rows are dropped, and errors are raised', async () => {
    const rows = [
      { id: 's1', receipt_no: 'A-000001', total: 1250, payment_method: 'momo', occurred_at: '2026-11-23T09:00:00Z', status: 'recorded' },
      { id: 's2', receipt_no: 'A-000002', total: 800, payment_method: 'cash', occurred_at: '2026-11-23T10:00:00Z', status: 'voided' },
      { id: 's3', receipt_no: 'A-000003', total: 100, payment_method: 'bitcoin', occurred_at: '2026-11-23T11:00:00Z', status: 'recorded' },
    ];
    const overview = await new DashboardService(fakeClient(
      { sales: { data: rows } }, [], { inventory_summary: { data: { product_count: 2, low_stock_count: 1 } } },
    )).fetchOverview('biz-1');
    expect(overview.productCount).toBe(2);
    expect(overview.lowStockCount).toBe(1);
    expect(overview.recentSales.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(overview.ownerName).toBeNull();

    await expect(new DashboardService(fakeClient({}, [], { inventory_summary: { error: new Error('network') } })).fetchOverview('biz-1')).rejects.toThrow('network');
    await expect(new DashboardService(fakeClient({ sales: { error: new Error('sales down') } })).fetchOverview('biz-1')).rejects.toThrow('sales down');
  });

  it('TC-DASH-10: inventory counts come from the server summary, exactly, and malformed summaries are rejected', async () => {
    // Counts beyond the API's 1,000-row limit pass through unchanged
    const big = await new DashboardService(fakeClient({}, [], { inventory_summary: { data: { product_count: 1500, low_stock_count: 1001 } } }))
      .fetchOverview('biz-1');
    expect([big.productCount, big.lowStockCount]).toEqual([1500, 1001]);
    // Sales figures are unaffected by the summary (D12)
    expect([big.todaySalesCount, big.todayRevenuePesewas]).toEqual([0, 0]);

    expect(parseInventorySummary({ product_count: 0, low_stock_count: 0 })).toEqual({ productCount: 0, lowStockCount: 0 });
    expect(parseInventorySummary({ product_count: 7, low_stock_count: 7 })).toEqual({ productCount: 7, lowStockCount: 7 });
    for (const bad of [
      null, undefined, 'x', [], {}, { product_count: 3 }, { low_stock_count: 1 },
      { product_count: -1, low_stock_count: 0 }, { product_count: 2.5, low_stock_count: 0 },
      { product_count: '3', low_stock_count: 1 }, { product_count: 3, low_stock_count: 4 },
      { product_count: Number.MAX_SAFE_INTEGER + 1, low_stock_count: 0 },
    ]) {
      expect(() => parseInventorySummary(bad)).toThrow('invalid inventory summary');
    }
    // A malformed summary fails the whole load (shown as an error), never wrong figures
    await expect(new DashboardService(fakeClient({}, [], { inventory_summary: { data: { product_count: 1, low_stock_count: 2 } } }))
      .fetchOverview('biz-1')).rejects.toThrow('invalid inventory summary');
  });

  it('TC-DASH-11: a failed summary on first load is an error; on refresh the last figures stay with a notice', async () => {
    const at = new Date(2026, 10, 23, 14, 5);
    let load = { kind: 'loading' } as DashboardLoad;   // reassigned in callbacks below
    const failing = new DashboardService(fakeClient({}, [], { inventory_summary: { error: new Error('offline') } }));
    await failing.fetchOverview('biz-1').then((d) => { load = loadSucceeded(d, at); }, () => { load = loadFailed(load); });
    expect(load).toEqual({ kind: 'error' });
    expect(revenueCaption(load)).toBe('Not available');

    const working = new DashboardService(fakeClient({}, [], { inventory_summary: { data: { product_count: 1500, low_stock_count: 1001 } } }));
    await working.fetchOverview('biz-1').then((d) => { load = loadSucceeded(d, at); }, () => { load = loadFailed(load); });
    expect(load.kind === 'ready' && [load.data.productCount, load.data.lowStockCount]).toEqual([1500, 1001]);

    await failing.fetchOverview('biz-1').then((d) => { load = loadSucceeded(d, at); }, () => { load = loadFailed(load); });
    expect(load.kind === 'ready' && load.refreshFailed).toBe(true);
    expect(load.kind === 'ready' && [load.data.productCount, load.data.lowStockCount]).toEqual([1500, 1001]);
  });
});
