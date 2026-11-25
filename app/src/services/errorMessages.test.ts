import { describe, expect, it } from 'vitest';
import { DUPLICATE_NAME_MESSAGE, GENERIC_MESSAGE, MESSAGES, OFFLINE_MESSAGE, UNCONFIRMED_MESSAGE, UNKNOWN_OUTCOME_MESSAGE, isInternalCode, messageFor } from './errorMessages';

describe('Plain-language error messages (07 E-02, E-04)', () => {
  it('MSG-01: no response shows the E-04 offline message', () => {
    expect(messageFor({ kind: 'no_response' })).toBe(OFFLINE_MESSAGE);
    expect(OFFLINE_MESSAGE).toBe("This needs internet. Your data is safe — try again when you're connected.");
  });

  it('MSG-02: known codes show their message; internal and unknown codes show the generic one', () => {
    expect(messageFor({ kind: 'definite', code: 'insufficient_stock', sqlState: '22023', details: null })).toBe(MESSAGES.insufficient_stock);
    expect(messageFor({ kind: 'definite', code: 'request_id_reused', sqlState: '22023', details: null })).toBe(GENERIC_MESSAGE);
    expect(messageFor({ kind: 'definite', code: 'something_new', sqlState: 'P0001', details: null })).toBe(GENERIC_MESSAGE);
  });

  it('MSG-03: a duplicate name from a direct write (unique violation) is explained', () => {
    expect(messageFor({ kind: 'definite', code: 'duplicate key value violates unique constraint', sqlState: '23505', details: null })).toBe(DUPLICATE_NAME_MESSAGE);
  });

  it('MSG-03b: a known code raised with SQLSTATE 23505 keeps its own message (increment 2 fix)', () => {
    expect(messageFor({ kind: 'definite', code: 'duplicate_product_name', sqlState: '23505', details: null })).toBe(MESSAGES.duplicate_product_name);
    expect(MESSAGES.duplicate_product_name).not.toBe(DUPLICATE_NAME_MESSAGE);
  });

  it('MSG-03c: "not sent", "may have been saved" and "held back" are three different messages', () => {
    expect(new Set([OFFLINE_MESSAGE, UNKNOWN_OUTCOME_MESSAGE, UNCONFIRMED_MESSAGE]).size).toBe(3);
    expect(UNKNOWN_OUTCOME_MESSAGE).toMatch(/can't tell yet whether this was saved/);
    expect(UNKNOWN_OUTCOME_MESSAGE).toMatch(/won't be saved twice/);
  });

  it('MSG-03d: the held-back message (owner wording, 25 Nov 2026) and the product_changed refusal', () => {
    expect(UNCONFIRMED_MESSAGE).toBe('Your last change may already have been saved. Refresh the product and check its current details before trying again.');
    expect(UNKNOWN_OUTCOME_MESSAGE).toBe("The connection dropped before we got an answer, so we can't tell yet whether this was saved. Try again when you're connected — it won't be saved twice.");
    expect(messageFor({ kind: 'definite', code: 'product_changed', sqlState: 'P0001', details: null })).toBe(MESSAGES.product_changed);
    expect(MESSAGES.product_changed).toMatch(/Nothing was saved/);
    // The app always sends expected values, so these can only come from a programming mistake
    expect(isInternalCode('expected_values_required')).toBe(true);
    expect(isInternalCode('invalid_expected_values')).toBe(true);
  });

  it('MSG-04: messages are plain words: no codes, underscores or technical terms', () => {
    for (const [code, message] of Object.entries(MESSAGES)) {
      expect(isInternalCode(code), code).toBe(false);
      expect(message, code).not.toMatch(/_|SQL|error code|exception|null|undefined/i);
      expect(message.length, code).toBeLessThan(200);
      expect(message.trim(), code).toMatch(/[.!]$/);
    }
  });
});
