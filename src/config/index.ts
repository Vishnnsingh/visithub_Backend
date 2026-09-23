import env from './env';
import logger from './logger';
import { initSupabase, getSupabase, getSupabaseAdmin } from './supabase';
import { seedSuperAdmin } from '../services/auth.service';
import { seedDemoOrgSubscription } from '../data/seedDemoSubscription';
import { hydrateJsonStores } from '../data/jsonPersist';

export async function initConfig(): Promise<void> {
  initSupabase();
  await hydrateJsonStores();
  seedSuperAdmin();
  seedDemoOrgSubscription();
  logger.info(`${env.APP_NAME} config loaded (${env.NODE_ENV})`);
}

export { env, logger, getSupabase, getSupabaseAdmin };
