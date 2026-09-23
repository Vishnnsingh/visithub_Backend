import env from './env';
import logger from './logger';
import { initSupabase, getSupabase, getSupabaseAdmin } from './supabase';
import { seedSuperAdmin } from '../services/auth.service';
import { seedDemoOrgSubscription } from '../data/seedDemoSubscription';

export async function initConfig(): Promise<void> {
  initSupabase();
  seedSuperAdmin();
  seedDemoOrgSubscription();
  logger.info(`${env.APP_NAME} config loaded (${env.NODE_ENV})`);
}

export { env, logger, getSupabase, getSupabaseAdmin };
