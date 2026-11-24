import { describe, expect, it } from 'vitest';
import { STOCK_STATE_STYLE, stockState } from './stockStatus';
import { colours } from './theme';

describe('Stock colour states (D-6)', () => {
  it('STOCK-01: green OK above the low-stock level; amber Low at or below it; red Out at 0; red Negative below 0', () => {
    expect(stockState(10, 5)).toBe('ok');
    expect(stockState(5, 5)).toBe('low');
    expect(stockState(1, 5)).toBe('low');
    expect(stockState(0, 5)).toBe('out');
    expect(stockState(-2, 5)).toBe('negative');
  });

  it('STOCK-02: with a low-stock level of 0, any positive stock is OK (matches stock_qty <= low_stock_level)', () => {
    expect(stockState(1, 0)).toBe('ok');
    expect(stockState(0, 0)).toBe('out');
  });

  it('STOCK-03: every state has a word and the approved colours (never colour alone)', () => {
    expect(STOCK_STATE_STYLE.ok).toMatchObject({ label: 'In stock', text: colours.ok });
    expect(STOCK_STATE_STYLE.low).toMatchObject({ label: 'Low', text: colours.warnText });
    expect(STOCK_STATE_STYLE.out).toMatchObject({ label: 'Out of stock', text: colours.danger });
    expect(STOCK_STATE_STYLE.negative).toMatchObject({ label: 'Negative', text: colours.danger });
  });

  it('STOCK-04: invalid figures are refused', () => {
    expect(() => stockState(1.5, 5)).toThrow();
    expect(() => stockState(1, -1)).toThrow();
  });
});
