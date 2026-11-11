import { execFileSync } from 'node:child_process';

/**
 * Reads connection details of the LOCAL Supabase stack at test time
 * (`supabase status -o json`). Nothing is stored on disk or committed.
 * Refuses to run against anything that is not localhost, so these tests can
 * never touch a real project or real shop data.
 */
export function localStack(): { apiUrl: string; anonKey: string } {
  const fromEnv = process.env.SUPABASE_TEST_API_URL && process.env.SUPABASE_TEST_ANON_KEY;
  let apiUrl: string;
  let anonKey: string;
  if (fromEnv) {
    apiUrl = process.env.SUPABASE_TEST_API_URL!;
    anonKey = process.env.SUPABASE_TEST_ANON_KEY!;
  } else {
    const raw = execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8' });
    const status = JSON.parse(raw.slice(raw.indexOf('{')));
    apiUrl = status.API_URL;
    anonKey = status.ANON_KEY;
  }
  const host = new URL(apiUrl).hostname;
  if (!['127.0.0.1', 'localhost'].includes(host)) {
    throw new Error(`Refusing to run security tests against non-local Supabase: ${host}`);
  }
  return { apiUrl, anonKey };
}
