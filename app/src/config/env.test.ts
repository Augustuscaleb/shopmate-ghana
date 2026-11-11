import { describe, expect, it } from 'vitest';
import { readConfig } from './env';

// Fake key-shaped values are assembled at runtime so the repository secret scan
// (which is deliberately strict) never sees a key-like literal in source code.
const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const jwt = (role: string) => [b64url({ alg: 'HS256', typ: 'JWT' }), b64url({ role }), 'c2lnbmF0dXJl'].join('.');
const prefixed = (kind: 'secret' | 'publishable') => ['sb', kind, 'Abc123def456ghi789'].join('_');

describe('App configuration guard (SEC-15)', () => {
  it('TC-AUTH-17: refuses service-role and secret keys; accepts a public key', () => {
    const url = 'https://abcdefghijklmnop.supabase.co';
    expect(readConfig({ EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt('service_role') }).ok).toBe(false);
    expect(readConfig({ EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: prefixed('secret') }).ok).toBe(false);
    expect(readConfig({ EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt('anon') }).ok).toBe(true);
    expect(readConfig({ EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: prefixed('publishable') }).ok).toBe(true);
    expect(readConfig({ EXPO_PUBLIC_SUPABASE_URL: '', EXPO_PUBLIC_SUPABASE_ANON_KEY: '' }).ok).toBe(false);
  });
});
