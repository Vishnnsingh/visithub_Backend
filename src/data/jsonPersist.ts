import fs from 'fs';
import path from 'path';
import { getSupabaseAdmin } from '../config/supabase';
import logger from '../config/logger';

const DATA_DIR = path.join(process.cwd(), 'data');

/** In-memory mirror of every JSON store (basename → data) */
const memory = new Map<string, unknown>();

let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const pendingWrites = new Map<string, NodeJS.Timeout>();

function keyFromPath(filePath: string): string {
  return path.basename(filePath);
}

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeLocal(filePath: string, data: unknown) {
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
    }, 50)
  );
}

/**
 * Load all rows from Supabase into memory + local files.
 * If Supabase is empty and local files exist, upload local → Supabase (one-time bootstrap).
 */
export async function hydrateJsonStores(): Promise<void> {
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const admin = getSupabaseAdmin();
    if (!admin) {
      logger.warn('JSON hydrate skipped — Supabase admin client not available');
      hydrated = true;
      return;
    }

    try {
      const { data, error } = await admin.from('app_kv').select('key, value');
      if (error) {
        logger.warn(
          `Supabase app_kv read failed: ${error.message}. Run sql/009_app_kv.sql in Supabase SQL Editor.`
        );
        hydrated = true;
        return;
      }

      const rows = data || [];
      if (rows.length > 0) {
        for (const row of rows) {
          const key = String(row.key);
          memory.set(key, row.value);
          writeLocal(path.join(DATA_DIR, key), row.value);
        }
        logger.info(`Supabase app_kv hydrated (${rows.length} stores)`);
      } else {
        // Bootstrap: push existing local JSON files up to Supabase
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
        let uploaded = 0;
        for (const file of files) {
          const full = path.join(DATA_DIR, file);
          const parsed = readLocal<unknown>(full);
          if (parsed == null) continue;
          memory.set(file, parsed);
          await upsertRemote(file, parsed);
          uploaded += 1;
        }
        if (uploaded > 0) {
          logger.info(`Supabase app_kv bootstrapped from local files (${uploaded} stores)`);
        } else {
          logger.info('Supabase app_kv empty — waiting for first writes');
        }
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

/**
 * Sync read — uses memory after hydrate, else local file, else fallback.
 */
export function loadJsonStore<T>(filePath: string, fallback: T): T {
  const key = keyFromPath(filePath);
  if (memory.has(key)) {
    return memory.get(key) as T;
  }
  const local = readLocal<T>(filePath);
  if (local != null) {
    memory.set(key, local);
    return local;
  }
  memory.set(key, fallback);
  writeLocal(filePath, fallback);
  scheduleRemoteWrite(key, fallback);
  return fallback;
}

/**
 * Sync write — memory + local file + Supabase upsert.
 */
export function saveJsonStore(filePath: string, data: unknown): void {
  const key = keyFromPath(filePath);
  memory.set(key, data);
  writeLocal(filePath, data);
  scheduleRemoteWrite(key, data);
}

/** Flush pending remote writes (call before shutdown if needed). */
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
