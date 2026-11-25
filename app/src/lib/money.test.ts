import { describe, expect, it } from 'vitest';
import { MAX_ENTERED_PESEWAS, MAX_QTY, parseCedis, parseWholeNumber, pesewasToInput } from './money';

describe('Typed amounts → integer pesewas (05 C-01)', () => {
  it('MONEY-01: whole cedis, one or two decimals, commas and a currency sign', () => {
    expect(parseCedis('12')).toEqual({ ok: true, value: 1200 });
    expect(parseCedis('12.5')).toEqual({ ok: true, value: 1250 });
    expect(parseCedis('12.50')).toEqual({ ok: true, value: 1250 });
    expect(parseCedis('12.')).toEqual({ ok: true, value: 1200 });
    expect(parseCedis(' GH₵ 1,250.05 ')).toEqual({ ok: true, value: 125005 });
    expect(parseCedis('0.01')).toEqual({ ok: true, value: 1 });
    expect(parseCedis('0')).toEqual({ ok: true, value: 0 });
    expect(parseCedis('007.10')).toEqual({ ok: true, value: 710 });
  });

  it('MONEY-02: exact for values that floating point gets wrong', () => {
    expect(parseCedis('0.29')).toEqual({ ok: true, value: 29 });
    expect(parseCedis('1.15')).toEqual({ ok: true, value: 115 });
    expect(parseCedis('999999.99')).toEqual({ ok: true, value: 99_999_999 });
  });

  it('MONEY-03: refuses empty text, three decimals, negatives, letters and amounts over GH₵ 1,000,000', () => {
    for (const bad of ['', '  ', '1.234', '-5', 'abc', '1e3', '1.2.3', '.5']) expect(parseCedis(bad).ok).toBe(false);
    expect(parseCedis('1000000')).toEqual({ ok: true, value: MAX_ENTERED_PESEWAS });
    expect(parseCedis('1000000.01').ok).toBe(false);
    expect(parseCedis('99999999999').ok).toBe(false);
  });

  it('MONEY-04: whole numbers within limits', () => {
    expect(parseWholeNumber('0')).toEqual({ ok: true, value: 0 });
    expect(parseWholeNumber('1,000')).toEqual({ ok: true, value: 1000 });
    expect(parseWholeNumber(String(MAX_QTY))).toEqual({ ok: true, value: 100_000 });
    expect(parseWholeNumber('100001').ok).toBe(false);
    expect(parseWholeNumber('0', { min: 1 }).ok).toBe(false);
    for (const bad of ['', '1.5', '-1', 'ten', '99999999999']) expect(parseWholeNumber(bad).ok).toBe(false);
  });

  it('MONEY-05: pesewas back to editable text, round-tripping exactly', () => {
    expect(pesewasToInput(0)).toBe('0.00');
    expect(pesewasToInput(5)).toBe('0.05');
    expect(pesewasToInput(125005)).toBe('1250.05');
    for (const p of [1, 29, 115, 99_999_999, MAX_ENTERED_PESEWAS]) expect(parseCedis(pesewasToInput(p))).toEqual({ ok: true, value: p });
    expect(() => pesewasToInput(-1)).toThrow();
    expect(() => pesewasToInput(1.5)).toThrow();
  });
});
