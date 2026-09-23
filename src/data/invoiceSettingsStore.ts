import fs from 'fs';
import path from 'path';

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
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    const initial = defaults();
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as Partial<InvoiceSupportSettings>;
    return {
      supportEmail: String(raw.supportEmail || defaults().supportEmail).trim(),
      supportWebsite: String(raw.supportWebsite || defaults().supportWebsite).trim(),
      updatedAt: String(raw.updatedAt || now()),
    };
  } catch {
    const fallback = defaults();
    fs.writeFileSync(STORE_PATH, JSON.stringify(fallback, null, 2), 'utf8');
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
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
}
