/**
 * Average cost, margin and stock value on Product Details (Stage 1C-3.1; plan §5.1, owner decisions
 * P-3, M-1 and V-1; spec 08 rev 2 §9.2 – §9.4). Pure functions with no React Native code, so every
 * rule is unit-tested. Money is integer pesewas; no floating point is used for any amount.
 *
 * The average cost has exactly four states, always shown differently:
 * 1. current     — cost known, stock > 0, stock value ≥ 0: stock value ÷ stock, half-up to the pesewa;
 * 2. last_known  — stock ≤ 0, cost still known, and the newest history row with an average exists;
 * 3. unknown     — cost not known (whatever the history says); or stock ≤ 0 with no such row;
 *                  or stock > 0 with a negative stock value;
 * 4. unavailable — the figures couldn't be read (offline, timeout or a server error): on the
 *                  first load when the history read fails, and after ANY failed refresh
 *                  (shownCost). No figure, never a guess or an older figure.
 */
import { formatCedis, formatDayLabel } from '../../services/dashboard';
import type { LastKnownCostRow, Product } from '../../services/products';

/** The one-row history read: its answer (null: no row with an average exists), or a failure. */
export type CostHistoryRead = { kind: 'ok'; row: LastKnownCostRow | null } | { kind: 'failed' };

export type CostInfo =
  | { state: 'current'; average: number; stockValue: number }
  | { state: 'last_known'; average: number; asOf: string }
  | { state: 'unknown' }
  | { state: 'unavailable' };

/** State 4, for when the product itself couldn't be read. */
export const COST_UNAVAILABLE: CostInfo = { state: 'unavailable' };

/** a ÷ b rounded half-up, for whole numbers a ≥ 0 and b > 0, using exact integer steps only. */
function divideHalfUp(a: number, b: number): number {
  let q = Math.floor(a / b);
  let r = a - q * b;
  // Very large amounts: correct the quotient if the division was off by one
  if (r < 0) { q -= 1; r += b; } else if (r >= b) { q += 1; r -= b; }
  return r * 2 >= b ? q + 1 : q;
}

/**
 * A numeric(18,4) amount of pesewas ("112.5", "112.5000", "0") rounded half-up to a whole pesewa.
 * null for anything that isn't a plain non-negative decimal (a negative average can't be stored,
 * since a table check enforces avg_cost >= 0, but it is guarded against all the same).
 */
export function roundDecimalPesewas(value: string): number | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!m) return null;
  const whole = Number(m[1]) + ((m[2] ?? '0').charAt(0) >= '5' ? 1 : 0);
  return Number.isSafeInteger(whole) ? whole : null;
}

/** The average cost state of a product (rules above). */
export function costInfo(p: Pick<Product, 'stockQty' | 'stockValue' | 'costKnown'>, history: CostHistoryRead): CostInfo {
  if (!p.costKnown) return { state: 'unknown' };
  if (p.stockQty > 0) {
    if (p.stockValue < 0) return { state: 'unknown' };
    return { state: 'current', average: divideHalfUp(p.stockValue, p.stockQty), stockValue: p.stockValue };
  }
  // No stock now: the cost when stock was last recorded, from the history
  if (history.kind === 'failed') return { state: 'unavailable' };
  if (!history.row) return { state: 'unknown' };
  const average = roundDecimalPesewas(history.row.avgCost);
  if (average === null || Number.isNaN(new Date(history.row.effectiveAt).getTime())) return { state: 'unknown' };
  return { state: 'last_known', average, asOf: history.row.effectiveAt };
}

/**
 * The cost Product Details shows (spec 08 rev 2 §9.3, governing). If the latest read of the
 * figures failed (a failed refresh: offline, timeout or a server error), the cost is state 4 —
 * "no figure, not even an old one" — even though the figures read earlier are still on screen as
 * stale confirmed values ("Last updated hh:mm · couldn't refresh", §10). Margin and Stock value
 * (about) follow the cost, so they are hidden too.
 */
export function shownCost(p: Pick<Product, 'stockQty' | 'stockValue' | 'costKnown'>, history: CostHistoryRead, latestReadFailed: boolean): CostInfo {
  return latestReadFailed ? COST_UNAVAILABLE : costInfo(p, history);
}

export type MarginInfo =
  | { shown: true; amount: number; percent: number | null; loss: boolean }
  | { shown: false; reason: 'no_stock' | 'unknown' | 'unavailable' };

/** (price − cost) × 100 ÷ price, rounded half away from zero to a whole number (profit margin). */
function marginPercent(price: number, amount: number): number | null {
  if (price <= 0) return null; // the server requires at least GH₵ 0.01; guarded anyway
  const n = Math.abs(amount) * 100;
  const rounded = divideHalfUp(n, price);
  return amount < 0 ? -rounded : rounded;
}

/**
 * Margin (M-1): profit margin, never markup. Shown only with the current average cost (state 1);
 * hidden in states 2, 3 and 4, each with its own wording. Uses the average cost as shown (rounded
 * to the pesewa), so the amount on screen is exactly price − the cost on screen.
 */
export function marginInfo(sellingPrice: number, cost: CostInfo): MarginInfo {
  switch (cost.state) {
    case 'current': {
      const amount = sellingPrice - cost.average;
      return { shown: true, amount, percent: marginPercent(sellingPrice, amount), loss: amount < 0 };
    }
    case 'last_known': return { shown: false, reason: 'no_stock' };
    case 'unknown': return { shown: false, reason: 'unknown' };
    case 'unavailable': return { shown: false, reason: 'unavailable' };
  }
}

/** "Wed 12 Nov", with the year when it isn't this year ("Wed 12 Nov 2025"). */
export function asOfLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  const day = formatDayLabel(d);
  return d.getFullYear() === now.getFullYear() ? day : `${day} ${d.getFullYear()}`;
}

/** What the "Average cost" figure shows, word for word (spec 08 rev 2 §9.3). */
export type CostText = { label: string; value: string; detail: string | null; note: string | null; figure: boolean };

export function costText(cost: CostInfo, now: Date): CostText {
  switch (cost.state) {
    case 'current':
      return { label: 'Average cost (about)', value: formatCedis(cost.average), detail: 'per unit', note: null, figure: true };
    case 'last_known':
      return {
        label: 'Last known average cost (about)', value: formatCedis(cost.average), detail: `as of ${asOfLabel(cost.asOf, now)}`,
        note: 'No stock now, so this is the cost when stock was last recorded', figure: true,
      };
    case 'unknown':
      return { label: 'Average cost', value: 'Not known', detail: null, note: 'Record a restock with its cost to set it', figure: false };
    case 'unavailable':
      return { label: 'Average cost', value: 'Not available right now', detail: null, note: "Couldn't refresh", figure: false };
  }
}

/** What the "Margin" figure shows, word for word (spec 08 rev 2 §9.4). */
export type MarginText = { label: string; value: string; detail: string | null; loss: boolean; figure: boolean };

export function marginText(m: MarginInfo): MarginText {
  if (m.shown) {
    const percent = m.percent === null ? null : `${m.percent < 0 ? '−' : ''}${Math.abs(m.percent)} %`;
    return {
      label: 'Margin (about)',
      value: formatCedis(m.amount),
      detail: [percent, m.loss ? 'Loss' : null].filter(Boolean).join(' · ') || null,
      loss: m.loss,
      figure: true,
    };
  }
  switch (m.reason) {
    case 'no_stock': return { label: 'Margin', value: 'Not shown while there is no stock', detail: null, loss: false, figure: false };
    case 'unknown': return { label: 'Margin', value: 'Not known', detail: null, loss: false, figure: false };
    case 'unavailable': return { label: 'Margin', value: 'Not available right now', detail: null, loss: false, figure: false };
  }
}

/** "Stock value (about)" (V-1): only in state 1, where it equals the recorded stock value. */
export function stockValueAbout(cost: CostInfo): number | null {
  return cost.state === 'current' ? cost.stockValue : null;
}

/** "{name}", "{name} (archived)", "No category" or "—" (category not found). */
export function categoryLabel(categoryId: string | null, categories: readonly { id: string; name: string; archived: boolean }[] | null): string {
  if (categoryId === null) return 'No category';
  const c = categories?.find((x) => x.id === categoryId);
  if (!c) return '—';
  return c.archived ? `${c.name} (archived)` : c.name;
}
