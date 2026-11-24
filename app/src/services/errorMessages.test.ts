import { describe, expect, it } from 'vitest';
import { DUPLICATE_NAME_MESSAGE, GENERIC_MESSAGE, MESSAGES, OFFLINE_MESSAGE, isInternalCode, messageFor } from './errorMessages';

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

  it('MSG-04: messages are plain words: no codes, underscores or technical terms', () => {
    for (const [code, message] of Object.entries(MESSAGES)) {
      expect(isInternalCode(code), code).toBe(false);
      expect(message, code).not.toMatch(/_|SQL|error code|exception|null|undefined/i);
      expect(message.length, code).toBeLessThan(200);
      expect(message.trim(), code).toMatch(/[.!]$/);
    }
  });
});
