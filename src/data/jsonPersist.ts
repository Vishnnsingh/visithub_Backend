import path from 'path';
import { getSupabaseAdmin } from '../config/supabase';
import logger from '../config/logger';

/** In-memory mirror of every store (basename → data). Source of truth at runtime = Supabase. */
const memory = new Map<string, unknown>();

let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const pendingWrites = new Map<string, NodeJS.Timeout>();

function keyFromPath(filePath: string): string {
  return path.basename(filePath);
}

async function upsertRemote(key: string, value: unknown) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from('app_kv').upsert(
    { key, value, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
  if (error) {
    logger.warn(`Supabase app_kv upsert failed (${key}): ${error.message}`);
    return;
  }
  const settingsKeys = new Set([
    'landing-theme.json',
    'contact-info.json',
    'invoice-settings.json',
    'custom-plan-settings.json',
    'org-custom-plan-settings.json',
    'business-type-plan-settings.json',
    'payment-ledger.json',
  ]);
  if (settingsKeys.has(key)) {
    await admin.from('vh_settings').upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
  }
}

function scheduleRemoteWrite(key: string, value: unknown) {
  const existing = pendingWrites.get(key);
  if (existing) clearTimeout(existing);
  pendingWrites.set(
    key,
    setTimeout(() => {
      pendingWrites.delete(key);
      void upsertRemote(key, value);
      if (key === 'app-store.json') {
        void import('./supabaseSync').then((m) => m.syncAppStoreToTables(value)).catch(() => undefined);
      } else if (key === 'org-subscriptions.json') {
        void import('./supabaseSync').then((m) => m.syncSubscriptionsToTables(value)).catch(() => undefined);
      } else if (key === 'subscription-plans.json') {
        void import('./supabaseSync').then((m) => m.syncPlansToTables(value)).catch(() => undefined);
      } else if (key === 'business-types.json') {
        void import('./supabaseSync').then((m) => m.syncBusinessTypesToTables(value)).catch(() => undefined);
      } else if (key === 'contact-messages.json') {
        void import('./supabaseSync').then((m) => m.syncContactMessages(value)).catch(() => undefined);
      } else if (key === 'help-messages.json') {
        void import('./supabaseSync').then((m) => m.syncHelpMessages(value)).catch(() => undefined);
      } else if (key === 'legal-pages.json') {
        void import('./supabaseSync').then((m) => m.syncLegalPages(value)).catch(() => undefined);
      } else if (key === 'payment-ledger.json') {
        void import('./supabaseSync').then((m) => m.syncPayments(value)).catch(() => undefined);
      }
    }, 80)
  );
}

export async function hydrateJsonStores(): Promise<void> {
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const admin = getSupabaseAdmin();
    if (!admin) {
      logger.warn('Store hydrate skipped — Supabase not available (memory only)');
      hydrated = true;
      return;
    }

    try {
      const { data, error } = await admin.from('app_kv').select('key, value');
      if (error) {
        logger.warn(
          `Supabase app_kv read failed: ${error.message}. Run sql/009_app_kv.sql and sql/011_visit_hub_tables.sql`
        );
        hydrated = true;
        return;
      }

      const rows = data || [];
      if (rows.length > 0) {
        for (const row of rows) {
          memory.set(String(row.key), row.value);
        }
        logger.info(`Supabase stores hydrated (${rows.length} rows) — local JSON disabled`);
      } else {
        logger.info('Supabase stores empty — waiting for first writes');
      }
    } catch (err) {
      logger.warn(`Supabase hydrate error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      hydrated = true;
    }
  })();
  return hydratePromise;
}

export function isJsonStoresHydrated() {
  return hydrated;
}

export function loadJsonStore<T>(filePath: string, fallback: T): T {
  const key = keyFromPath(filePath);
  if (memory.has(key)) return memory.get(key) as T;
  memory.set(key, fallback);
  scheduleRemoteWrite(key, fallback);
  return fallback;
}

/** Save to memory + Supabase only — never writes local JSON files. */
export function saveJsonStore(filePath: string, data: unknown): void {
  const key = keyFromPath(filePath);
  memory.set(key, data);
  scheduleRemoteWrite(key, data);
}

export async function flushJsonStores(): Promise<void> {
  const keys = [...pendingWrites.keys()];
  for (const key of keys) {
    const timer = pendingWrites.get(key);
    if (timer) clearTimeout(timer);
    pendingWrites.delete(key);
    const value = memory.get(key);
    if (value !== undefined) await upsertRemote(key, value);
  }
}
