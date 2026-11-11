import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Button, Field, Notice, Screen } from '../ui/components';
import { validateEmail } from '../auth/validation';
import { authErrorMessage, MSG } from '../auth/messages';
import { RESET_PASSWORD_URL } from '../auth/deepLinks';

type Props = { client: SupabaseClient; onBack: () => void };

/** S-03 Log in and Forgot password. Errors never reveal whether an email has an account (SEC-03). */
export function LogInScreen({ client, onBack }: Props) {
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string>();
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string }>();
  const [busy, setBusy] = useState(false);

  async function logIn() {
    const e = validateEmail(email);
    setEmailError(e);
    setMessage(undefined);
    if (e) return;
    if (!password) return setMessage({ tone: 'error', text: 'Enter your password.' });
    setBusy(true);
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setMessage({ tone: 'error', text: authErrorMessage(error, 'login') });
    // On success the auth listener in AppRoot moves to the next screen.
  }

  async function sendReset() {
    const e = validateEmail(email);
    setEmailError(e);
    setMessage(undefined);
    if (e) return;
    setBusy(true);
    const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: RESET_PASSWORD_URL });
    setBusy(false);
    // Same message whether or not the email has an account (SEC-03); only real failures differ.
    const text = error && /network|fetch|rate|429/i.test(`${error.message} ${error.status ?? ''}`) ? authErrorMessage(error, 'reset') : MSG.resetSent;
    setMessage({ tone: text === MSG.resetSent ? 'success' : 'error', text });
  }

  if (mode === 'forgot') {
    return (
      <Screen title="Reset your password" subtitle="We will email you a link to choose a new password.">
        <Field label="Email" value={email} onChangeText={setEmail} error={emailError} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
        {message ? <Notice tone={message.tone} text={message.text} /> : null}
        <Button label="Send reset link" onPress={sendReset} busy={busy} />
        <Button label="Back to log in" kind="link" onPress={() => { setMode('login'); setMessage(undefined); }} />
      </Screen>
    );
  }

  return (
    <Screen title="Log in">
      <Field label="Email" value={email} onChangeText={setEmail} error={emailError} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
      <Field label="Password" value={password} onChangeText={setPassword} password autoCapitalize="none" autoComplete="current-password" textContentType="password" />
      {message ? <Notice tone={message.tone} text={message.text} /> : null}
      <Button label="Log in" onPress={logIn} busy={busy} />
      <Button label="Forgot password?" kind="link" onPress={() => { setMode('forgot'); setMessage(undefined); }} />
      <Button label="Back" kind="link" onPress={onBack} />
    </Screen>
  );
}
