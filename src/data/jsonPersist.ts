import fs from 'fs';
import path from 'path';
import { getSupabaseAdmin } from '../config/supabase';
import logger from '../config/logger';
import env from '../config/env';

const DATA_DIR = path.join(process.cwd(), 'data');

/** In-memory mirror of every store (basename → data). Source of truth at runtime. */
const memory = new Map<string, unknown>();

let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const pendingWrites = new Map<string, NodeJS.Timeout>();

/** Local JSON files only as one-time migrate source — never write in normal operation. */
function allowLocalJsonFiles() {
  return process.env.PERSIST_JSON_FILES === 'true' || !env.SUPABASE_URL;
}

function keyFromPath(filePath: string): string {
  return path.basename(filePath);
}

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeLocal(filePath: string, data: unknown) {
  if (!allowLocalJsonFiles()) return;
  ensureDir(filePath);
  const temp = `${filePath}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(temp, filePath);
}

function readLocal<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
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
  // Also mirror small settings / specialty stores into vh_settings when applicable
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
      logger.warn('Store hydrate skipped — Supabase not available (will use memory only)');
      hydrated = true;
      return;
    }

    try {
      const { data, error } = await admin.from('app_kv').select('key, value');
      if (error) {
        logger.warn(
          `Supabase app_kv read failed: ${error.message}. Run sql/009_app_kv.sql and sql/011_visit_hub_tables.sql`
        );
        // One-time: seed memory from local JSON if present (migrate source), do not keep writing files
        if (fs.existsSync(DATA_DIR)) {
          for (const file of fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'))) {
            const parsed = readLocal<unknown>(path.join(DATA_DIR, file));
            if (parsed != null) memory.set(file, parsed);
          }
        }
        hydrated = true;
        return;
      }

      const rows = data || [];
      if (rows.length > 0) {
        for (const row of rows) {
          memory.set(String(row.key), row.value);
        }
        logger.info(`Supabase stores hydrated (${rows.length} rows) — no local JSON writes`);
      } else if (fs.existsSync(DATA_DIR)) {
        const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
        let uploaded = 0;
        for (const file of files) {
          const parsed = readLocal<unknown>(path.join(DATA_DIR, file));
          if (parsed == null) continue;
          memory.set(file, parsed);
          await upsertRemote(file, parsed);
          uploaded += 1;
        }
        logger.info(`Bootstrapped ${uploaded} stores from local migrate source → Supabase`);
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
  // Read-only fallback from old local file (migrate), never required going forward
  const local = readLocal<T>(filePath);
  if (local != null) {
    memory.set(key, local);
    scheduleRemoteWrite(key, local);
    return local;
  }
  memory.set(key, fallback);
  scheduleRemoteWrite(key, fallback);
  return fallback;
}

export function saveJsonStore(filePath: string, data: unknown): void {
  const key = keyFromPath(filePath);
  memory.set(key, data);
  // Do not write JSON files when Supabase is configured
  writeLocal(filePath, data);
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
