import path from 'path';
import { loadJsonStore, saveJsonStore } from './jsonPersist';

export type InvoiceSupportSettings = {
  supportEmail: string;
  supportWebsite: string;
  updatedAt: string;
};

const STORE_PATH = path.join(process.cwd(), 'data', 'invoice-settings.json');

function now() {
  return new Date().toISOString();
}

function defaults(): InvoiceSupportSettings {
  return {
    supportEmail: 'support@visithub.in',
    supportWebsite: 'www.visithub.in',
    updatedAt: now(),
  };
}

function ensureStore(): InvoiceSupportSettings {
  try {
    const raw = loadJsonStore<Partial<InvoiceSupportSettings>>(STORE_PATH, defaults());
    return {
      supportEmail: String(raw.supportEmail || defaults().supportEmail).trim(),
      supportWebsite: String(raw.supportWebsite || defaults().supportWebsite).trim(),
      updatedAt: String(raw.updatedAt || now()),
    };
  } catch {
    const fallback = defaults();
    saveJsonStore(STORE_PATH, fallback);
    return fallback;
  }
}

export function getInvoiceSettings(): InvoiceSupportSettings {
  return ensureStore();
}

export function setInvoiceSettings(input: {
  supportEmail: string;
  supportWebsite: string;
}): InvoiceSupportSettings {
  const next: InvoiceSupportSettings = {
    supportEmail: input.supportEmail.trim(),
    supportWebsite: input.supportWebsite.trim().replace(/^https?:\/\//i, ''),
    updatedAt: now(),
  };
  saveJsonStore(STORE_PATH, next);
  return next;
}
