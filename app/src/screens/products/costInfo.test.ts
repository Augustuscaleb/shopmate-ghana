import { describe, expect, it } from 'vitest';
import {
  asOfLabel, categoryLabel, costInfo, costText, marginInfo, marginText, roundDecimalPesewas, shownCost, stockValueAbout,
  COST_UNAVAILABLE, type CostHistoryRead, type CostInfo,
} from './costInfo';

const NONE: CostHistoryRead = { kind: 'ok', row: null };
const FAILED: CostHistoryRead = { kind: 'failed' };
const row = (avgCost: string, effectiveAt = '2026-11-12T10:00:00Z'): CostHistoryRead => ({ kind: 'ok', row: { avgCost, effectiveAt } });
const NOW = new Date('2026-11-25T12:00:00Z');
const p = (stockQty: number, stockValue: number, costKnown = true) => ({ stockQty, stockValue, costKnown });

describe('Average cost: four states (Stage 1C-3.1, P-3)', () => {
  it('COST-01 state 1: stock value ÷ stock, rounded half-up to the pesewa', () => {
    expect(costInfo(p(10, 1000), NONE)).toEqual({ state: 'current', average: 100, stockValue: 1000 });
    // 1000 ÷ 3 = 333.33… → 333; 1001 ÷ 2 = 500.5 → 501 (half-up); 999 ÷ 2 = 499.5 → 500
    expect(costInfo(p(3, 1000), NONE)).toMatchObject({ average: 333 });
    expect(costInfo(p(2, 1001), NONE)).toMatchObject({ average: 501 });
    expect(costInfo(p(2, 999), NONE)).toMatchObject({ average: 500 });
    expect(costInfo(p(3, 2), NONE)).toMatchObject({ average: 1 }); // 0.67 → 1
    expect(costInfo(p(4, 2), NONE)).toMatchObject({ average: 1 }); // 0.5 → 1
    expect(costInfo(p(5, 2), NONE)).toMatchObject({ average: 0 }); // 0.4 → 0
    // A zero stock value with stock is a real (free) cost, not unknown
    expect(costInfo(p(5, 0), NONE)).toMatchObject({ state: 'current', average: 0 });
    // Large amounts stay exact
    expect(costInfo(p(3, 9_000_000_000_001), NONE)).toMatchObject({ average: 3_000_000_000_000 });
    // The history is not used, and its failure doesn't matter, while there is stock
    expect(costInfo(p(10, 1000), FAILED)).toMatchObject({ state: 'current', average: 100 });
    expect(costInfo(p(10, 1000), row('5'))).toMatchObject({ state: 'current', average: 100 });
  });

  it('COST-02 state 2: no stock, cost known: the newest non-null history average, with its date', () => {
    expect(costInfo(p(0, 0), row('112.5000'))).toEqual({ state: 'last_known', average: 113, asOf: '2026-11-12T10:00:00Z' });
    expect(costInfo(p(0, 0), row('112.4999'))).toMatchObject({ average: 112 });
    expect(costInfo(p(-3, 0), row('250'))).toMatchObject({ state: 'last_known', average: 250 });
    expect(costInfo(p(0, 0), row('0'))).toMatchObject({ state: 'last_known', average: 0 });
  });

  it('COST-03 state 3: cost not known, even with an older non-null history row', () => {
    expect(costInfo(p(0, 0, false), row('112.5'))).toEqual({ state: 'unknown' });
    expect(costInfo(p(10, 0, false), NONE)).toEqual({ state: 'unknown' });
    expect(costInfo(p(0, 0, false), FAILED)).toEqual({ state: 'unknown' });
  });

  it('COST-04 state 3: no stock and no history row with an average', () => {
    expect(costInfo(p(0, 0), NONE)).toEqual({ state: 'unknown' });
    expect(costInfo(p(-2, 0), NONE)).toEqual({ state: 'unknown' });
  });

  it('COST-05 state 3: stock above 0 with a negative stock value', () => {
    expect(costInfo(p(5, -1), NONE)).toEqual({ state: 'unknown' });
  });

  it('COST-06 state 3: a negative or malformed history average is never shown', () => {
    expect(costInfo(p(0, 0), row('-5'))).toEqual({ state: 'unknown' });
    expect(costInfo(p(0, 0), row('abc'))).toEqual({ state: 'unknown' });
    expect(costInfo(p(0, 0), row('12', 'not a date'))).toEqual({ state: 'unknown' });
  });

  it('COST-07 state 4: a failed read, never a figure', () => {
    expect(costInfo(p(0, 0), FAILED)).toEqual({ state: 'unavailable' });
    expect(COST_UNAVAILABLE).toEqual({ state: 'unavailable' });
    const t = costText({ state: 'unavailable' }, NOW);
    expect(t).toMatchObject({ label: 'Average cost', value: 'Not available right now', figure: false });
    expect(t.value).not.toMatch(/GH₵|\d/);
  });

  it('COST-08 the four states read differently on screen, with the approved wording', () => {
    const current = costText({ state: 'current', average: 110, stockValue: 1100 }, NOW);
    expect(current).toEqual({ label: 'Average cost (about)', value: 'GH₵ 1.10', detail: 'per unit', note: null, figure: true });
    const last = costText({ state: 'last_known', average: 110, asOf: '2026-11-12T10:00:00Z' }, NOW);
    expect(last).toEqual({
      label: 'Last known average cost (about)', value: 'GH₵ 1.10', detail: 'as of Thu 12 Nov',
      note: 'No stock now, so this is the cost when stock was last recorded', figure: true,
    });
    const unknown = costText({ state: 'unknown' }, NOW);
    expect(unknown).toEqual({ label: 'Average cost', value: 'Not known', detail: null, note: 'Record a restock with its cost to set it', figure: false });
    const unavailable = costText({ state: 'unavailable' }, NOW);
    expect(unavailable.note).toBe("Couldn't refresh");
    const values = [current, last, unknown, unavailable].map((t) => `${t.label}|${t.value}|${t.detail}`);
    expect(new Set(values).size).toBe(4);
  });

  it('COST-09 the "as of" date shows the year only when it is not this year', () => {
    expect(asOfLabel('2026-11-12T10:00:00Z', NOW)).toBe('Thu 12 Nov');
    expect(asOfLabel('2025-11-12T10:00:00Z', NOW)).toBe('Wed 12 Nov 2025');
  });

  it('COST-10 numeric(18,4) history averages round half-up to the pesewa', () => {
    expect(roundDecimalPesewas('112')).toBe(112);
    expect(roundDecimalPesewas('112.5')).toBe(113);
    expect(roundDecimalPesewas('112.4999')).toBe(112);
    expect(roundDecimalPesewas('0.5000')).toBe(1);
    expect(roundDecimalPesewas('-1')).toBeNull();
    expect(roundDecimalPesewas('1e5')).toBeNull();
    expect(roundDecimalPesewas('')).toBeNull();
  });
});

describe('Margin: profit margin, only with the current cost (M-1)', () => {
  const current = (average: number): CostInfo => ({ state: 'current', average, stockValue: average * 10 });

  it('MARG-01 GH₵ 10.00 price and GH₵ 8.00 cost: GH₵ 2.00 and 20 % (not the 25 % markup)', () => {
    expect(marginInfo(1000, current(800))).toEqual({ shown: true, amount: 200, percent: 20, loss: false });
    expect(marginText(marginInfo(1000, current(800)))).toEqual({ label: 'Margin (about)', value: 'GH₵ 2.00', detail: '20 %', loss: false, figure: true });
  });

  it('MARG-02 the percentage rounds half-up to a whole number', () => {
    expect(marginInfo(300, current(200))).toMatchObject({ percent: 33 }); // 33.3
    expect(marginInfo(300, current(100))).toMatchObject({ percent: 67 }); // 66.7
    expect(marginInfo(800, current(700))).toMatchObject({ percent: 13 }); // 12.5 → 13
    expect(marginInfo(1000, current(1000))).toMatchObject({ amount: 0, percent: 0, loss: false });
  });

  it('MARG-03 a cost above the price is a loss: minus sign and the word "Loss"', () => {
    const m = marginInfo(1000, current(1250));
    expect(m).toEqual({ shown: true, amount: -250, percent: -25, loss: true });
    expect(marginText(m)).toEqual({ label: 'Margin (about)', value: '−GH₵ 2.50', detail: '−25 % · Loss', loss: true, figure: true });
    expect(marginInfo(800, current(900))).toMatchObject({ percent: -13 }); // −12.5 → −13
  });

  it('MARG-04 hidden for states 2, 3 and 4, each with its own wording', () => {
    expect(marginText(marginInfo(1000, { state: 'last_known', average: 800, asOf: '2026-11-12T10:00:00Z' })))
      .toMatchObject({ label: 'Margin', value: 'Not shown while there is no stock', figure: false });
    expect(marginText(marginInfo(1000, { state: 'unknown' }))).toMatchObject({ label: 'Margin', value: 'Not known', figure: false });
    expect(marginText(marginInfo(1000, { state: 'unavailable' }))).toMatchObject({ label: 'Margin', value: 'Not available right now', figure: false });
  });

  it('MARG-05 a zero selling price cannot divide by zero (the server requires at least GH₵ 0.01)', () => {
    expect(marginInfo(0, current(100))).toEqual({ shown: true, amount: -100, percent: null, loss: true });
    expect(marginText(marginInfo(0, current(100))).detail).toBe('Loss');
  });
});

describe('Stock value (about) and category (V-1, spec 08 §9.2)', () => {
  it('STV-01 shown only in state 1, equal to the recorded stock value (stock × unrounded average)', () => {
    const c = costInfo(p(3, 1000), NONE);
    expect(stockValueAbout(c)).toBe(1000); // not 3 × 333 = 999
    expect(stockValueAbout(costInfo(p(0, 0), row('100')))).toBeNull();
    expect(stockValueAbout(costInfo(p(5, 0, false), NONE))).toBeNull();
    expect(stockValueAbout(costInfo(p(0, 0), FAILED))).toBeNull();
  });

  it('CAT-01 category: name, "(archived)", "No category", and "—" when not found', () => {
    const cats = [{ id: 'a', name: 'Drinks', archived: false }, { id: 'b', name: 'Old', archived: true }];
    expect(categoryLabel('a', cats)).toBe('Drinks');
    expect(categoryLabel('b', cats)).toBe('Old (archived)');
    expect(categoryLabel(null, cats)).toBe('No category');
    expect(categoryLabel('zzz', cats)).toBe('—');
  });
});

describe('Failed refresh: no cost figure, not even an old one (spec 08 rev 2 §9.3, governing)', () => {
  it('FAIL-01: after a failed refresh every state becomes state 4, and margin and stock value are hidden', () => {
    const cases: [ReturnType<typeof p>, CostHistoryRead][] = [
      [p(10, 1000), NONE],          // was state 1 (current)
      [p(0, 0), row('112.5')],      // was state 2 (last known)
      [p(0, 0, false), NONE],       // was state 3 (unknown)
      [p(0, 0), FAILED],            // was already state 4
    ];
    for (const [product, history] of cases) {
      const cost = shownCost(product, history, true);
      expect(cost).toEqual({ state: 'unavailable' });
      expect(marginInfo(1000, cost)).toEqual({ shown: false, reason: 'unavailable' });
      expect(stockValueAbout(cost)).toBeNull();
      expect(costText(cost, NOW).figure).toBe(false);
    }
  });

  it('FAIL-02: when the latest read succeeded, the normal four states apply', () => {
    expect(shownCost(p(10, 1000), NONE, false)).toMatchObject({ state: 'current', average: 100 });
    expect(shownCost(p(0, 0), row('112.5'), false)).toMatchObject({ state: 'last_known', average: 113 });
    expect(shownCost(p(0, 0, false), NONE, false)).toEqual({ state: 'unknown' });
    expect(shownCost(p(0, 0), FAILED, false)).toEqual({ state: 'unavailable' });
  });

  it('FAIL-03: a last-known cost is never labelled as the current one, and never gives a margin', () => {
    const last = shownCost(p(0, 0), row('800'), false);
    expect(costText(last, NOW).label).toBe('Last known average cost (about)');
    expect(costText(last, NOW).label).not.toBe('Average cost (about)');
    expect(marginInfo(1000, last).shown).toBe(false);
    expect(stockValueAbout(last)).toBeNull();
  });
});
