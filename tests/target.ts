import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Where the API tests run.
 *
 * - local (default): the local Supabase stack in Docker. Each run uses fresh, unique test users.
 * - cloud: the DEVELOPMENT cloud project, for the required cloud verification (TC-CLOUD).
 *   Strict guards:
 *     SHOPMATE_TEST_TARGET=cloud
 *     SUPABASE_TEST_API_URL must be https://<SHOPMATE_DEV_PROJECT_REF>.supabase.co
 *     SHOPMATE_CONFIRM_DEV_PROJECT=fictitious-data-only
 *   Keys come only from environment variables (GitHub Actions secrets), never files.
 *   Cloud runs reuse two fixed fictitious owners and fixed request IDs, so repeated
 *   runs don't keep adding businesses to the project.
 */
export type Target = {
  mode: 'local' | 'cloud';
  apiUrl: string;
  anonKey: string;
  serviceRoleKey?: string;
};

export function testTarget(): Target {
  if (process.env.SHOPMATE_TEST_TARGET === 'cloud') {
    const apiUrl = required('SUPABASE_TEST_API_URL');
    const ref = required('SHOPMATE_DEV_PROJECT_REF');
    if (new URL(apiUrl).hostname !== `${ref}.supabase.co`) {
      throw new Error('Refusing cloud tests: API URL does not match the declared development project ref.');
    }
    if (process.env.SHOPMATE_CONFIRM_DEV_PROJECT !== 'fictitious-data-only') {
      throw new Error('Refusing cloud tests: set SHOPMATE_CONFIRM_DEV_PROJECT=fictitious-data-only to confirm this is the development project.');
    }
    return { mode: 'cloud', apiUrl, anonKey: required('SUPABASE_TEST_ANON_KEY'), serviceRoleKey: required('SUPABASE_TEST_SERVICE_ROLE_KEY') };
  }

  let apiUrl = process.env.SUPABASE_TEST_API_URL;
  let anonKey = process.env.SUPABASE_TEST_ANON_KEY;
  if (!apiUrl || !anonKey) {
    const raw = execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8' });
    const status = JSON.parse(raw.slice(raw.indexOf('{')));
    apiUrl = status.API_URL as string;
    anonKey = status.ANON_KEY as string;
  }
  if (!['127.0.0.1', 'localhost'].includes(new URL(apiUrl).hostname)) {
    throw new Error('Refusing local-mode tests against a non-local Supabase. Use SHOPMATE_TEST_TARGET=cloud for the dev project.');
  }
  return { mode: 'local', apiUrl, anonKey };
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export function anonClient(t: Target): SupabaseClient {
  return createClient(t.apiUrl, t.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Stable UUID derived from text, so cloud runs repeat the same idempotent requests. */
export function stableUuid(text: string): string {
  const h = createHash('sha256').update(text).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * A signed-in fictitious owner.
 * local: signs up a brand-new user.
 * cloud: reuses a fixed test user (created confirmed via the admin API if missing),
 *        gives it a fresh random password for this run, then signs in normally.
 */
export async function signedInOwner(t: Target, label: string, runId: string): Promise<{ client: SupabaseClient; userId: string; requestId: (purpose: string) => string }> {
  const client = anonClient(t);
  const password = `Test-${randomUUID()}`;
  const fullName = `Test Owner ${label}`;

  if (t.mode === 'local') {
    const { data, error } = await client.auth.signUp({
      email: `owner.${label}.${runId}@example.test`, password, options: { data: { full_name: fullName } },
    });
    if (error || !data.user) throw error ?? new Error('sign-up failed');
    return { client, userId: data.user.id, requestId: () => randomUUID() };
  }

  const admin = createClient(t.apiUrl, t.serviceRoleKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `shopmate.cloudtest.${label}@example.test`;
  let userId: string | undefined;
  for (let page = 1; !userId && page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    userId = data.users.find((u) => u.email === email)?.id;
    if (data.users.length < 100) break;
  }
  if (userId) {
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) throw error;
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
    if (error || !data.user) throw error ?? new Error('createUser failed');
    userId = data.user.id;
  }
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const uid = userId;
  return { client, userId: uid, requestId: (purpose: string) => stableUuid(`${uid}:${purpose}`) };
}
