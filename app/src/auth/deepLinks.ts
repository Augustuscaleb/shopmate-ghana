/**
 * Auth redirects into the app (email confirmation and password reset), using the
 * PKCE flow: the link carries a one-time `code` that the app exchanges for a session.
 */
export const APP_SCHEME = 'shopmate';
export const AUTH_CALLBACK_URL = `${APP_SCHEME}://auth-callback`;
export const RESET_PASSWORD_URL = `${APP_SCHEME}://reset-password`;

export type AuthRedirect =
  | { kind: 'none' }
  | { kind: 'code'; code: string; purpose: 'signup' | 'recovery' }
  | { kind: 'error'; message: string };

export function parseAuthRedirect(url: string | null | undefined): AuthRedirect {
  if (!url || !url.startsWith(`${APP_SCHEME}://`)) return { kind: 'none' };
  const rest = url.slice(`${APP_SCHEME}://`.length);
  const [pathPart, ...queryParts] = rest.split(/[?#]/);
  const params = new URLSearchParams(queryParts.join('&'));
  const path = pathPart.replace(/\/+$/, '');
  if (path !== 'auth-callback' && path !== 'reset-password') return { kind: 'none' };

  const errorDescription = params.get('error_description');
  if (errorDescription) {
    return { kind: 'error', message: 'This link has expired or was already used. Please request a new one.' };
  }
  const code = params.get('code');
  if (!code || !/^[A-Za-z0-9-_.]{8,200}$/.test(code)) return { kind: 'none' };
  return { kind: 'code', code, purpose: path === 'reset-password' ? 'recovery' : 'signup' };
}
