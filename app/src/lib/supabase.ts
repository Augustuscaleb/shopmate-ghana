import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from '../config/env';

/**
 * Supabase client factory.
 *
 * Stage 1: sessions are kept in memory only (persistSession: false).
 * Stage 2 (login screens) will add an Android Keystore-backed storage adapter
 * (expo-secure-store) as required by SEC-05, before any real login is used.
 */
export function createSupabaseClient(config: AppConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}
