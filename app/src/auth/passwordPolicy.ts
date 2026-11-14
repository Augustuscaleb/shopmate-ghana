import { COMMON_PASSWORDS } from './commonPasswords';

/**
 * Password rules (spec 07, SEC-01).
 * - At least 8 characters. The server enforces this too (Supabase Auth setting).
 * - Not on the common-password list, and not a listed password followed only by
 *   numbers, symbols or spaces (e.g. "password123"). Checked in the app only: Supabase's free
 *   plan has no server-side common-password check (see IMPLEMENTATION-STATUS, Stage 1B).
 * - At most 72 characters (Supabase Auth's bcrypt limit).
 * - Not the same as the email address or its name part.
 */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72;

export type PasswordCheck = { ok: true } | { ok: false; message: string };

export function checkPassword(password: string, email = ''): PasswordCheck {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_LENGTH) {
    return { ok: false, message: `Use at most ${MAX_PASSWORD_LENGTH} characters.` };
  }
  const lower = password.toLowerCase();
  // Also catch a common password followed by numbers, symbols, spaces or emoji (e.g. "password123",
  // "Football99!"): strip the trailing characters that are not letters and check what is left
  // against the same list. Letters of any alphabet (é, ɛ, ɔ, ж ...) count as part of the word.
  // Combining marks (accents, emoji variation selectors) stay with the character before them:
  // a mark after a letter keeps that letter in the word; a mark after a digit, symbol or emoji
  // is stripped together with it.
  const base = lower.replace(/(?:[^\p{L}\p{M}]\p{M}*)+$/u, '');
  if (COMMON_PASSWORDS.has(lower) || (base !== lower && COMMON_PASSWORDS.has(base))) {
    return { ok: false, message: 'This password is too common and easy to guess. Choose another one.' };
  }
  if (/^(.)\1+$/.test(password)) {
    return { ok: false, message: 'Don\'t use the same character repeated. Choose another password.' };
  }
  const emailLower = email.trim().toLowerCase();
  const namePart = emailLower.split('@')[0] ?? '';
  if (emailLower && (lower === emailLower || (namePart.length >= 4 && lower === namePart))) {
    return { ok: false, message: 'Don\'t use your email address as your password.' };
  }
  return { ok: true };
}
