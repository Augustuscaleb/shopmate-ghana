import { afterEach, describe, expect, it } from 'vitest';
import { stableUuid, testTarget } from './target';

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; });

function cloudEnv(overrides: Record<string, string | undefined>) {
  process.env.SHOPMATE_TEST_TARGET = 'cloud';
  process.env.SUPABASE_TEST_API_URL = 'https://abcdefghijklmnop.supabase.co';
  process.env.SHOPMATE_DEV_PROJECT_REF = 'abcdefghijklmnop';
  process.env.SHOPMATE_CONFIRM_DEV_PROJECT = 'fictitious-data-only';
  process.env.SUPABASE_TEST_ANON_KEY = 'anon-test-value';
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY = 'service-test-value';
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
}

describe('Cloud test-target safeguards', () => {
  it('TC-CLOUD-00a: refuses when the API URL is not the declared development project', () => {
    cloudEnv({ SUPABASE_TEST_API_URL: 'https://someotherproject.supabase.co' });
    expect(() => testTarget()).toThrow(/does not match/);
  });

  it('TC-CLOUD-00b: refuses without the explicit fictitious-data confirmation', () => {
    cloudEnv({ SHOPMATE_CONFIRM_DEV_PROJECT: undefined });
    expect(() => testTarget()).toThrow(/fictitious-data-only/);
  });

  it('TC-CLOUD-00c: local mode refuses a non-local URL', () => {
    delete process.env.SHOPMATE_TEST_TARGET;
    process.env.SUPABASE_TEST_API_URL = 'https://abcdefghijklmnop.supabase.co';
    process.env.SUPABASE_TEST_ANON_KEY = 'x';
    expect(() => testTarget()).toThrow(/non-local/);
  });

  it('TC-CLOUD-00d: accepts a correctly declared dev project; stable request IDs are valid and repeatable', () => {
    cloudEnv({});
    expect(testTarget().mode).toBe('cloud');
    const id = stableUuid('user:create_business');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(stableUuid('user:create_business')).toBe(id);
  });
});
