import { describe, expect, it } from 'vitest';
import { parseAuthRedirect } from './deepLinks';

describe('Auth deep links', () => {
  it('TC-AUTH-08: parses confirmation and reset links; ignores unrelated or malformed links', () => {
    expect(parseAuthRedirect('shopmate://auth-callback?code=abc12345-def')).toEqual({ kind: 'code', code: 'abc12345-def', purpose: 'signup' });
    expect(parseAuthRedirect('shopmate://reset-password?code=abc12345-def')).toEqual({ kind: 'code', code: 'abc12345-def', purpose: 'recovery' });
    expect(parseAuthRedirect('shopmate://reset-password#error_description=expired')).toMatchObject({ kind: 'error' });
    expect(parseAuthRedirect('https://evil.example/auth-callback?code=abc12345')).toEqual({ kind: 'none' });
    expect(parseAuthRedirect('shopmate://other?code=abc12345')).toEqual({ kind: 'none' });
    expect(parseAuthRedirect('shopmate://auth-callback?code=<script>')).toEqual({ kind: 'none' });
    expect(parseAuthRedirect(null)).toEqual({ kind: 'none' });
  });
});
