import { describe, expect, it } from 'vitest';
import { ResultError, asObject, bool, isoDate, pesewas, text, uuid, wholeNumber } from './parse';

describe('Strict server-result readers (05 C-01)', () => {
  it('PARSE-01: money must be an integer number of pesewas', () => {
    expect(pesewas({ v: 12345 }, 'v')).toBe(12345);
    expect(pesewas({ v: -300 }, 'v')).toBe(-300);
    for (const bad of [12.5, '100', null, undefined, Number.MAX_SAFE_INTEGER + 2, NaN]) {
      expect(() => pesewas({ v: bad }, 'v')).toThrow(ResultError);
    }
  });

  it('PARSE-02: whole numbers, with an optional minimum (stock may be negative)', () => {
    expect(wholeNumber({ v: -2 }, 'v')).toBe(-2);
    expect(() => wholeNumber({ v: -1 }, 'v', { min: 0 })).toThrow(ResultError);
    expect(() => wholeNumber({ v: 1.5 }, 'v')).toThrow(ResultError);
  });

  it('PARSE-03: IDs, text, dates, booleans and objects are checked', () => {
    expect(uuid({ v: 'e2a1c3d4-1111-4222-8333-944455556666' }, 'v')).toMatch(/^e2a1/);
    expect(() => uuid({ v: 'x' }, 'v')).toThrow(ResultError);
    expect(text({ v: null }, 'v', { nullable: true })).toBeNull();
    expect(() => text({ v: null }, 'v')).toThrow(ResultError);
    expect(isoDate({ v: '2026-11-24' }, 'v')).toBe('2026-11-24');
    expect(() => isoDate({ v: '24/11/2026' }, 'v')).toThrow(ResultError);
    expect(bool({ v: false }, 'v')).toBe(false);
    expect(() => asObject([])).toThrow(ResultError);
    expect(() => asObject(null)).toThrow(ResultError);
  });
});
