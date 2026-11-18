import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';
import { logger } from './logger';

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient;

  const url = env.SUPABASE_URL || 'https://fhbfysakcowgjtcvhlwj.supabase.co';
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    logger.debug('Supabase client not initialized: SUPABASE_URL or key not provided');
    return null;
  }

  try {
    supabaseClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    logger.info({ url }, 'Supabase client initialized successfully');
    return supabaseClient;
  } catch (err) {
    logger.warn({ err }, 'Failed to initialize Supabase client');
    return null;
  }
}

export const isSupabaseConfigured = () => !!(env.SUPABASE_URL && (env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY));
