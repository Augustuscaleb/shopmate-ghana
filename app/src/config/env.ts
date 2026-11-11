/**
 * Public runtime configuration, read from EXPO_PUBLIC_* variables at build time.
 * Only public values belong here (URL + anon/publishable key). Secrets must never
 * be bundled into the app (spec 07, SEC-15).
 */
export type AppConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

export type ConfigResult =
  | { ok: true; config: AppConfig }
  | { ok: false; problems: string[] };

const SERVICE_ROLE_HINTS = ['service_role', 'sb_secret_'];

export function readConfig(env: Record<string, string | undefined> = process.env): ConfigResult {
  const problems: string[] = [];
  const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const supabaseAnonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

  if (!/^https?:\/\/.+/.test(supabaseUrl)) {
    problems.push('EXPO_PUBLIC_SUPABASE_URL is missing or not a URL.');
  }
  if (!supabaseAnonKey || supabaseAnonKey.startsWith('replace-with')) {
    problems.push('EXPO_PUBLIC_SUPABASE_ANON_KEY is missing.');
  }
  if (SERVICE_ROLE_HINTS.some((hint) => supabaseAnonKey.includes(hint) || decodeJwtRole(supabaseAnonKey) === hint)) {
    problems.push('The configured key looks like a service-role/secret key. Use the public anon key only.');
  }

  return problems.length > 0 ? { ok: false, problems } : { ok: true, config: { supabaseUrl, supabaseAnonKey } };
}

function decodeJwtRole(token: string): string | undefined {
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  try {
    const json = JSON.parse(globalThis.atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.role === 'string' ? json.role : undefined;
  } catch {
    return undefined;
  }
}
