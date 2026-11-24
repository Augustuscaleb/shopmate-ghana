/**
 * Stock colour states (owner decision D-6, 24 Nov 2026). Always shown with a word, never colour
 * alone (08 §3). "Low" uses the same rule as the server's low-stock list and count
 * (stock_qty <= low_stock_level), so screens and the dashboard agree.
 */
import { colours } from './theme';

export type StockState = 'ok' | 'low' | 'out' | 'negative';

export function stockState(stockQty: number, lowStockLevel: number): StockState {
  if (!Number.isSafeInteger(stockQty) || !Number.isSafeInteger(lowStockLevel) || lowStockLevel < 0) {
    throw new Error('invalid stock figures');
  }
  if (stockQty < 0) return 'negative';
  if (stockQty === 0) return 'out';
  if (stockQty <= lowStockLevel) return 'low';
  return 'ok';
}

export const STOCK_STATE_STYLE: Readonly<Record<StockState, { label: string; text: string; background: string }>> = {
  ok: { label: 'In stock', text: colours.ok, background: colours.tint },
  low: { label: 'Low', text: colours.warnText, background: colours.warnBg },
  out: { label: 'Out of stock', text: colours.danger, background: colours.dangerBg },
  negative: { label: 'Negative', text: colours.danger, background: colours.dangerBg },
};
