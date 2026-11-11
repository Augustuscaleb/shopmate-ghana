import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Button, Field, Notice, Screen } from '../ui/components';
import { checkPassword } from '../auth/passwordPolicy';
import { authErrorMessage } from '../auth/messages';

/** Reached from a password-reset email link (PKCE recovery session). */
export function SetNewPasswordScreen({ client, email, onDone }: { client: SupabaseClient; email: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function save() {
    const pw = checkPassword(password, email);
    if (!pw.ok) return setError(pw.message);
    setError(undefined);
    setBusy(true);
    const { error: updateError } = await client.auth.updateUser({ password });
    setBusy(false);
    if (updateError) return setError(authErrorMessage(updateError, 'update'));
    onDone();
  }

  return (
    <Screen title="Choose a new password">
      <Field label="New password" value={password} onChangeText={setPassword} password error={error} hint="At least 8 characters. Avoid common passwords." autoCapitalize="none" autoComplete="new-password" />
      {error ? null : <Notice text="After saving, you will stay logged in on this phone." />}
      <Button label="Save new password" onPress={save} busy={busy} />
    </Screen>
  );
}
