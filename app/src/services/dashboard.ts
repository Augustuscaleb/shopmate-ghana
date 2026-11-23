import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Read-only figures for the Today dashboard (S-10, F-17).
 *
 * Everything shown comes from the owner's own shop data, read through the existing
 * Row Level Security policies (members can read their business's rows). Nothing is
 * written. Until selling (Stage 1D) and inventory (Stage 1C) are built, these tables
 * are empty, so the dashboard honestly shows zeros and empty states.
 */

export type RecentSale = {
  id: string;
  receiptNo: string;
  totalPesewas: number;
  paymentMethod: 'cash' | 'momo' | 'credit';
  occurredAt: string;
  status: 'recorded' | 'voided';
};

export type DashboardOverview = {
  ownerName: string | null;
  todaySalesCount: number;
  todayRevenuePesewas: number;
  productCount: number;
  lowStockCount: number;
  recentSales: RecentSale[];
};

/** Money is integer pesewas (05 C-01). Anything else is rejected rather than displayed wrongly. */
function assertPesewas(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error('invalid money amount');
  return value;
}

/** "GH₵ 1,240.50"; negatives "−GH₵ 5.00" (05 C-03). Integer arithmetic only, no floating point. */
export function formatCedis(pesewas: number): string {
  const p = assertPesewas(pesewas);
  const abs = Math.abs(p);
  const cedis = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const rest = String(abs % 100).padStart(2, '0');
  return `${p < 0 ? '−' : ''}GH₵ ${cedis}.${rest}`;
}

/** The phone's current day as [start, end). Ghana uses GMT all year, with no daylight saving. */
export function todayRange(now: Date): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { start, end };
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Wed 12 Nov" (08 D-05). */
export function formatDayLabel(date: Date): string {
  return `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** "14:05" — 24-hour time for activity rows. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function greetingFor(date: Date): string {
  const h = date.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** First word of the owner's name, or null if none was given at sign-up. */
export function firstName(fullName: string | null | undefined): string | null {
  const first = (fullName ?? '').trim().split(/\s+/)[0];
  return first ? first : null;
}

/** Up to two initials for the account button, from the owner's name or else the shop name. */
export function initials(...names: (string | null | undefined)[]): string {
  const source = names.find((n) => n && n.trim())?.trim() ?? '';
  const parts = source.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 2);
  return letters.toUpperCase() || 'S';
}

/** Today's recorded sales (voided and cancelled sales do not count). */
export function summariseTodaySales(rows: { total: unknown }[]): { count: number; revenuePesewas: number } {
  let revenue = 0;
  for (const row of rows) revenue += assertPesewas(row.total);
  return { count: rows.length, revenuePesewas: revenue };
}

/** A product is low when stock_qty <= low_stock_level (04 §2.4). Only active products are passed in. */
export function countLowStock(rows: { stock_qty: unknown; low_stock_level: unknown }[]): number {
  return rows.filter((r) => typeof r.stock_qty === 'number' && typeof r.low_stock_level === 'number' && r.stock_qty <= r.low_stock_level).length;
}

const METHODS = ['cash', 'momo', 'credit'] as const;

function toRecentSale(row: Record<string, unknown>): RecentSale | null {
  const method = METHODS.find((m) => m === row.payment_method);
  const status = row.status === 'recorded' || row.status === 'voided' ? row.status : null;
  if (typeof row.id !== 'string' || typeof row.receipt_no !== 'string' || typeof row.occurred_at !== 'string' || !method || !status) return null;
  return { id: row.id, receiptNo: row.receipt_no, totalPesewas: assertPesewas(row.total), paymentMethod: method, occurredAt: row.occurred_at, status };
}

/**
 * KNOWN LIMIT — REQUIREMENT FOR THE SALES (1D) AND INVENTORY (1C) STAGES.
 * The Supabase API returns at most 1,000 rows per request (`max_rows = 1000` in
 * supabase/config.toml). Today's sales and the product list below are fetched as rows and
 * totalled on the phone, so beyond 1,000 sales in a day or 1,000 active products the count,
 * revenue and low-stock figures would silently undercount. This cannot happen yet (both tables
 * are empty until those stages), but before either stage ships these figures must be computed
 * on the server (an exact count / aggregate query or a read-only function), with tests at
 * more than 1,000 rows. Do not raise max_rows as a workaround.
 */
export class DashboardService {
  constructor(private readonly client: SupabaseClient) {}

  async fetchOverview(businessId: string, now: Date = new Date()): Promise<DashboardOverview> {
    const { start, end } = todayRange(now);
    const [profile, today, recent, products] = await Promise.all([
      this.client.from('profiles').select('full_name').limit(1).maybeSingle(),
      this.client
        .from('sales')
        .select('total')
        .eq('business_id', businessId)
        .eq('status', 'recorded')
        .gte('occurred_at', start.toISOString())
        .lt('occurred_at', end.toISOString()),
      this.client
        .from('sales')
        .select('id, receipt_no, total, payment_method, occurred_at, status')
        .eq('business_id', businessId)
        .in('status', ['recorded', 'voided'])
        .order('occurred_at', { ascending: false })
        .limit(5),
      this.client
        .from('products')
        .select('stock_qty, low_stock_level')
        .eq('business_id', businessId)
        .eq('active', true)
        .is('deleted_at', null),
    ]);
    for (const r of [profile, today, recent, products]) if (r.error) throw r.error;

    const sales = summariseTodaySales((today.data ?? []) as { total: unknown }[]);
    const productRows = (products.data ?? []) as { stock_qty: unknown; low_stock_level: unknown }[];
    return {
      ownerName: (profile.data as { full_name?: string | null } | null)?.full_name ?? null,
      todaySalesCount: sales.count,
      todayRevenuePesewas: sales.revenuePesewas,
      productCount: productRows.length,
      lowStockCount: countLowStock(productRows),
      recentSales: ((recent.data ?? []) as Record<string, unknown>[]).map(toRecentSale).filter((s): s is RecentSale => s !== null),
    };
  }
}
