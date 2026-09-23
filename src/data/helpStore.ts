import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export type HelpMessage = {
  id: string;
  name: string;
  email: string;
  mobile: string;
  message: string;
  createdAt: string;
};

type StoreFile = {
  messages: HelpMessage[];
};

const STORE_PATH = path.join(process.cwd(), 'data', 'help-messages.json');

function now() {
  return new Date().toISOString();
}

function ensureStore(): StoreFile {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    const initial: StoreFile = { messages: [] };
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as StoreFile;
    if (Array.isArray(raw.messages)) return raw;
  } catch {
    /* fall through */
  }
  const fallback: StoreFile = { messages: [] };
  fs.writeFileSync(STORE_PATH, JSON.stringify(fallback, null, 2), 'utf8');
  return fallback;
}

function writeStore(store: StoreFile) {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

export function addHelpMessage(input: {
  name: string;
  email: string;
  mobile: string;
  message: string;
}): HelpMessage {
  const store = ensureStore();
  const record: HelpMessage = {
    id: randomUUID(),
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    mobile: input.mobile.trim(),
    message: input.message.trim(),
    createdAt: now(),
  };
  store.messages.unshift(record);
  writeStore(store);
  return record;
}

export function listHelpMessages(page = 1, limit = 10) {
  const store = ensureStore();
  const total = store.messages.length;
  const pages = Math.max(1, Math.ceil(total / limit) || 1);
  const safePage = Math.min(Math.max(1, page), pages);
  const start = (safePage - 1) * limit;
  return {
    items: store.messages.slice(start, start + limit),
    page: safePage,
    pages,
    total,
    limit,
  };
}
