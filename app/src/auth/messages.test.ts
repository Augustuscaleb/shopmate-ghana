import { describe, expect, it } from 'vitest';
import { MSG, authErrorMessage } from './messages';

describe('Authentication error messages (E-02, SEC-03)', () => {
  it('TC-AUTH-06: login errors never reveal whether the email exists', () => {
    expect(authErrorMessage({ message: 'Invalid login credentials' }, 'login')).toBe(MSG.loginFailed);
    expect(authErrorMessage({ message: 'User not found' }, 'login')).toBe(MSG.loginFailed);
    expect(authErrorMessage({ message: 'User already registered' }, 'signup')).not.toMatch(/already registered/i);
  });

  it('TC-AUTH-07: network and rate-limit errors get specific plain messages', () => {
    expect(authErrorMessage({ message: 'TypeError: Network request failed' }, 'login')).toBe(MSG.network);
    expect(authErrorMessage({ status: 429, message: 'rate limit' }, 'signup')).toBe(MSG.tooManyAttempts);
  });
});
