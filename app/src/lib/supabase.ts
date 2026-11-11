import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from '../config/env';
import type { AuthStorage } from './chunkedSecureStorage';

/**
 * Supabase client. Sessions are persisted ONLY through the provided secure
 * storage (SEC-05), never AsyncStorage or plain files. PKCE flow is used for
 * email links (confirmation, password reset).
 */
export function createSupabaseClient(config: AppConfig, storage: AuthStorage): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
}
