import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import env from './env';
import logger from './logger';

let supabase: SupabaseClient | null = null;
let supabaseAdmin: SupabaseClient | null = null;

export function initSupabase(): SupabaseClient | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    logger.warn('Supabase skipped — SUPABASE_URL / SUPABASE_ANON_KEY not set');
    return null;
  }

  supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  logger.info('Supabase client initialized');
  return supabase;
}

export function getSupabase(): SupabaseClient | null {
  return supabase;
}

export function getSupabaseAdmin(): SupabaseClient | null {
  return supabaseAdmin || supabase;
}
