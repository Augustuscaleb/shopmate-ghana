/**
 * Plain-English messages for authentication errors (spec 07, E-02, SEC-03).
 * Login failures never reveal whether an email address has an account.
 */
type ErrorLike = { message?: string; code?: string; status?: number } | null | undefined;

export const MSG = {
  loginFailed: 'Email or password is not correct.',
  network: 'No internet connection. Try again when you\'re connected.',
  tooManyAttempts: 'Too many attempts. Please wait a few minutes and try again.',
  emailNotConfirmed: 'Please confirm your email address first. Check your inbox for our message.',
  generic: 'Something went wrong on our side. Please try again. If it keeps happening, contact support.',
  resetSent: 'If an account exists for that email, we have sent a link to reset the password.',
  weakPassword: 'This password is too weak. Choose a longer or less common password.',
} as const;

export function authErrorMessage(error: ErrorLike, context: 'login' | 'signup' | 'reset' | 'update'): string {
  if (!error) return MSG.generic;
  const text = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  if (text.includes('network') || text.includes('fetch')) return MSG.network;
  if (error.status === 429 || text.includes('rate limit') || text.includes('too many')) return MSG.tooManyAttempts;
  if (text.includes('email_not_confirmed') || text.includes('not confirmed')) return MSG.emailNotConfirmed;
  if (text.includes('weak_password') || text.includes('password should')) return MSG.weakPassword;
  if (context === 'login') return MSG.loginFailed;
  // Don't confirm whether an email is registered (SEC-03)
  if (context === 'signup' && (text.includes('already registered') || text.includes('user_already_exists'))) {
    return 'We couldn\'t create this account. If you already have one, log in or reset your password.';
  }
  return MSG.generic;
}
