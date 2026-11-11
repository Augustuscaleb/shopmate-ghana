import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking } from 'react-native';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { readConfig } from './config/env';
import { createSupabaseClient } from './lib/supabase';
import { createChunkedSecureStorage } from './lib/chunkedSecureStorage';
import { expoSecureStore } from './lib/expoSecureStore';
import { newRequestId } from './lib/requestId';
import { parseAuthRedirect } from './auth/deepLinks';
import { AccountService, type Business, type Device } from './services/account';
import { Loading, Notice, Screen, Button } from './ui/components';
import { ConfigErrorScreen } from './screens/ConfigErrorScreen';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { SignUpScreen } from './screens/SignUpScreen';
import { LogInScreen } from './screens/LogInScreen';
import { CheckEmailScreen } from './screens/CheckEmailScreen';
import { SetNewPasswordScreen } from './screens/SetNewPasswordScreen';
import { ShopSetupScreen } from './screens/ShopSetupScreen';
import { HomeScreen } from './screens/HomeScreen';

type Guest = { name: 'welcome' } | { name: 'signup' } | { name: 'login' } | { name: 'checkEmail'; email: string };

export function AppRoot() {
  const config = useMemo(() => readConfig(), []);
  if (!config.ok) return <ConfigErrorScreen problems={config.problems} />;
  return <ConfiguredApp cfg={config.config} />;
}

function ConfiguredApp({ cfg }: { cfg: { supabaseUrl: string; supabaseAnonKey: string } }) {
  // Sessions persist only through Keystore-backed secure storage (SEC-05).
  const client = useMemo(() => createSupabaseClient(cfg, createChunkedSecureStorage(expoSecureStore)), [cfg]);
  return <SignedApp client={client} />;
}

function SignedApp({ client }: { client: SupabaseClient }) {
  const account = useMemo(() => new AccountService(client, expoSecureStore, newRequestId), [client]);
  const [session, setSession] = useState<Session | null | undefined>(undefined); // undefined = still loading
  const [recovery, setRecovery] = useState(false);
  const [linkError, setLinkError] = useState<string>();
  const [guest, setGuest] = useState<Guest>({ name: 'welcome' });

  // Session: restored from secure storage on start, then kept in sync.
  useEffect(() => {
    client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = client.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [client]);

  // Email links (confirmation and password reset) open the app with a one-time code.
  const handleUrl = useCallback(async (url: string | null | undefined) => {
    const redirect = parseAuthRedirect(url);
    if (redirect.kind === 'error') return setLinkError(redirect.message);
    if (redirect.kind !== 'code') return;
    const { error } = await client.auth.exchangeCodeForSession(redirect.code);
    if (error) return setLinkError('This link has expired or was already used. Please request a new one.');
    if (redirect.purpose === 'recovery') setRecovery(true);
  }, [client]);

  useEffect(() => {
    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, [handleUrl]);

  const signOut = useCallback(async () => {
    // Stage 2 will block logout while unsent sales exist (SY-43).
    await client.auth.signOut({ scope: 'local' });
    setGuest({ name: 'welcome' });
  }, [client]);

  if (session === undefined) return <Loading message="Opening ShopMate…" />;

  if (session && recovery) {
    return <SetNewPasswordScreen client={client} email={session.user.email ?? ''} onDone={() => setRecovery(false)} />;
  }
  if (session) return <OwnerArea account={account} onSignOut={signOut} />;

  return (
    <>
      {linkError ? (
        <Screen title="Link problem">
          <Notice tone="error" text={linkError} />
          <Button label="OK" onPress={() => setLinkError(undefined)} />
        </Screen>
      ) : guest.name === 'signup' ? (
        <SignUpScreen client={client} onNeedsEmailConfirmation={(email) => setGuest({ name: 'checkEmail', email })} onBack={() => setGuest({ name: 'welcome' })} />
      ) : guest.name === 'login' ? (
        <LogInScreen client={client} onBack={() => setGuest({ name: 'welcome' })} />
      ) : guest.name === 'checkEmail' ? (
        <CheckEmailScreen email={guest.email} onDone={() => setGuest({ name: 'login' })} />
      ) : (
        <WelcomeScreen onSignUp={() => setGuest({ name: 'signup' })} onLogIn={() => setGuest({ name: 'login' })} />
      )}
    </>
  );
}

type OwnerState =
  | { name: 'loading' }
  | { name: 'error'; message: string }
  | { name: 'setup' }
  | { name: 'ready'; business: Business; device: Device };

function OwnerArea({ account, onSignOut }: { account: AccountService; onSignOut: () => void }) {
  const [state, setState] = useState<OwnerState>({ name: 'loading' });

  const finish = useCallback(async (business: Business) => {
    const device = await account.ensureDevice(business.id, 'Android phone');
    setState({ name: 'ready', business, device });
  }, [account]);

  const load = useCallback(async () => {
    setState({ name: 'loading' });
    try {
      const business = await account.fetchMyBusiness();
      if (!business) return setState({ name: 'setup' });
      await finish(business);
    } catch {
      setState({ name: 'error', message: 'No internet connection, or the server could not be reached. Your account is safe. Try again when you\'re connected.' });
    }
  }, [account, finish]);

  useEffect(() => { load(); }, [load]);

  switch (state.name) {
    case 'loading':
      return <Loading message="Getting your shop ready…" />;
    case 'error':
      return (
        <Screen title="Can't connect">
          <Notice tone="error" text={state.message} />
          <Button label="Try again" onPress={load} />
          <Button label="Log out" kind="link" onPress={onSignOut} />
        </Screen>
      );
    case 'setup':
      return <ShopSetupScreen account={account} onSignOut={onSignOut} onCreated={(b) => finish(b).catch(load)} />;
    case 'ready':
      return <HomeScreen business={state.business} device={state.device} onSignOut={onSignOut} />;
  }
}
