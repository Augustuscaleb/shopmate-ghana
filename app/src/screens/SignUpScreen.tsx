import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Button, Field, Notice, Screen } from '../ui/components';
import { checkPassword } from '../auth/passwordPolicy';
import { validateEmail, validateFullName } from '../auth/validation';
import { authErrorMessage } from '../auth/messages';
import { AUTH_CALLBACK_URL } from '../auth/deepLinks';

type Props = { client: SupabaseClient; onNeedsEmailConfirmation: (email: string) => void; onBack: () => void };

/** S-02 Sign up (email + password, SEC-01). A session, if returned, is handled by the auth listener. */
export function SignUpScreen({ client, onNeedsEmailConfirmation, onBack }: Props) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ fullName?: string; email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit() {
    const pw = checkPassword(password, email);
    const next = {
      fullName: validateFullName(fullName),
      email: validateEmail(email),
      password: pw.ok ? undefined : pw.message,
    };
    setErrors(next);
    setFormError(undefined);
    if (next.fullName || next.email || next.password) return;

    setBusy(true);
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() }, emailRedirectTo: AUTH_CALLBACK_URL },
    });
    setBusy(false);
    if (error) return setFormError(authErrorMessage(error, 'signup'));
    if (!data.session) onNeedsEmailConfirmation(email.trim());
  }

  return (
    <Screen title="Create your account" subtitle="You will use this email and password to log in.">
      <Field label="Your name" value={fullName} onChangeText={setFullName} error={errors.fullName} autoComplete="name" textContentType="name" />
      <Field label="Email" value={email} onChangeText={setEmail} error={errors.email} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
      <Field label="Password" value={password} onChangeText={setPassword} error={errors.password} password hint="At least 8 characters. Avoid common passwords." autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" />
      {formError ? <Notice tone="error" text={formError} /> : null}
      <Button label="Create account" onPress={submit} busy={busy} />
      <Button label="Back" kind="link" onPress={onBack} />
    </Screen>
  );
}
