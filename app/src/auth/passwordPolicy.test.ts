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

  it('TC-AUTH-03: rejects repeated characters, the email address, and passwords over 72 bytes', () => {
    expect(checkPassword('aaaaaaaaaa').ok).toBe(false);
    expect(checkPassword('ama.mensah@example.test', 'ama.mensah@example.test').ok).toBe(false);
    expect(checkPassword('ama.mensah', 'ama.mensah@example.test').ok).toBe(false);
    expect(checkPassword('x'.repeat(30) + '₵'.repeat(15)).ok).toBe(false); // 30 + 45 bytes
  });
});
