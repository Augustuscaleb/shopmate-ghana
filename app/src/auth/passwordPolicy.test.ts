import { describe, expect, it } from 'vitest';
import { checkPassword } from './passwordPolicy';
import { COMMON_PASSWORDS } from './commonPasswords';

describe('Password rules (SEC-01)', () => {
  it('TC-AUTH-01: rejects passwords shorter than 8 characters', () => {
    expect(checkPassword('Ab1!xyz').ok).toBe(false);
    expect(checkPassword('Ghana-shop-2026').ok).toBe(true);
  });

  it('TC-AUTH-02: rejects common passwords, ignoring letter case', () => {
    for (const p of ['password', 'PASSWORD', '12345678', 'iloveyou', 'Qwertyuiop']) {
      expect(checkPassword(p), p).toMatchObject({ ok: false });
    }
    expect(COMMON_PASSWORDS.size).toBeGreaterThan(1000);
    for (const p of COMMON_PASSWORDS) expect(p.length).toBeGreaterThanOrEqual(8);
  });

  it('TC-AUTH-18: rejects a common password followed by numbers or symbols; strong passwords still pass', () => {
    const rejected = [
      'password123', 'Password123', 'PASSWORD1234!', 'football99', 'sunshine2024',
      'password ', // trailing space
      'password１２３', // fullwidth digits
      'password€€', // non-ASCII symbols
      'football⚽', // emoji
      'football\u26BD\uFE0F', // emoji with variation selector (as phones usually send it)
      'password123\u0301', // combining mark on a digit
    ];
    for (const p of rejected) {
      expect(checkPassword(p), p).toEqual({ ok: false, message: 'This password is too common and easy to guess. Choose another one.' });
    }
    // Letters of any alphabet are part of the word, not "symbols"
    const accepted = [
      'Ghana-shop-2026', 'Kumasi#Trader7', 'passwordé', 'princessɛ', 'Akwaaba-Ɛyɛ-Dɛ-2026', 'Crème-Brûlée-88!',
      // Combining marks belong to the letter before them
      'password\u0301', // accent on the last letter
      'princess\u0301', // decomposed form of "princesś"
      'Cre\u0300me-Bru\u0302le\u0301e-88!', // decomposed form of "Crème-Brûlée-88!"
    ];
    for (const p of accepted) {
      expect(checkPassword(p), p).toEqual({ ok: true });
    }
  });

  it('TC-AUTH-03: rejects repeated characters, the email address, and passwords over 72 bytes', () => {
    expect(checkPassword('aaaaaaaaaa').ok).toBe(false);
    expect(checkPassword('ama.mensah@example.test', 'ama.mensah@example.test').ok).toBe(false);
    expect(checkPassword('ama.mensah', 'ama.mensah@example.test').ok).toBe(false);
    expect(checkPassword('x'.repeat(30) + '₵'.repeat(15)).ok).toBe(false); // 30 + 45 bytes
  });
});
