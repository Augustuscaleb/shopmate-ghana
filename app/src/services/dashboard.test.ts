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
  summariseTodaySales,
  todayRange,
} from './dashboard';

/** A stand-in for the Supabase query builder: records each call and resolves to the given rows. */
function fakeClient(tables: Record<string, { data?: unknown; error?: unknown }>, calls: string[] = []) {
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
  return { from: builder } as unknown as SupabaseClient;
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
    for (const table of ['sales', 'products']) {
      expect(calls.some((c) => c.startsWith(`${table}.eq(["business_id","biz-1"])`))).toBe(true);
    }
    expect(calls.every((c) => !/^\w+\.(insert|update|delete|upsert|rpc)\(/.test(c))).toBe(true);
    // Only recorded sales count towards today's figures
    expect(calls).toContain('sales.eq(["status","recorded"])');
  });

  it('TC-DASH-06: real rows are summarised, malformed activity rows are dropped, and errors are raised', async () => {
    const rows = [
      { id: 's1', receipt_no: 'A-000001', total: 1250, payment_method: 'momo', occurred_at: '2026-11-23T09:00:00Z', status: 'recorded' },
      { id: 's2', receipt_no: 'A-000002', total: 800, payment_method: 'cash', occurred_at: '2026-11-23T10:00:00Z', status: 'voided' },
      { id: 's3', receipt_no: 'A-000003', total: 100, payment_method: 'bitcoin', occurred_at: '2026-11-23T11:00:00Z', status: 'recorded' },
    ];
    const overview = await new DashboardService(fakeClient({
      sales: { data: rows },
      products: { data: [{ stock_qty: 1, low_stock_level: 5 }, { stock_qty: 9, low_stock_level: 5 }] },
    })).fetchOverview('biz-1');
    expect(overview.productCount).toBe(2);
    expect(overview.lowStockCount).toBe(1);
    expect(overview.recentSales.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(overview.ownerName).toBeNull();

    await expect(new DashboardService(fakeClient({ products: { error: new Error('network') } })).fetchOverview('biz-1')).rejects.toThrow('network');
  });
});
