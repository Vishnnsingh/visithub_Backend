import path from 'path';
import { randomUUID } from 'crypto';
import { loadJsonStore, saveJsonStore } from './jsonPersist';

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  mobile: string;
  message: string;
  createdAt: string;
};

type StoreFile = {
  messages: ContactMessage[];
};

const STORE_PATH = path.join(process.cwd(), 'data', 'contact-messages.json');

function now() {
  return new Date().toISOString();
}

function emptyStore(): StoreFile {
  return { messages: [] };
}

function ensureStore(): StoreFile {
  try {
    const raw = loadJsonStore<StoreFile>(STORE_PATH, emptyStore());
    if (Array.isArray(raw.messages)) return raw;
  } catch {
    /* fall through */
  }
  const fallback = emptyStore();
  saveJsonStore(STORE_PATH, fallback);
  return fallback;
}

function writeStore(store: StoreFile) {
  saveJsonStore(STORE_PATH, store);
}

export function addContactMessage(input: {
  name: string;
  email: string;
  mobile: string;
  message: string;
}): ContactMessage {
  const store = ensureStore();
  const record: ContactMessage = {
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

export function listContactMessages(page = 1, limit = 10) {
  const store = ensureStore();
  const total = store.messages.length;
  const pages = Math.max(1, Math.ceil(total / limit));
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
