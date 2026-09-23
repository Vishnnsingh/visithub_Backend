import fs from 'fs';
import path from 'path';

export type ContactInfo = {
  email: string;
  phone: string;
  address: string;
  mapUrl: string;
  mapActive: boolean;
  updatedAt: string;
};

const STORE_PATH = path.join(process.cwd(), 'data', 'contact-info.json');

function now() {
  return new Date().toISOString();
}

function defaults(): ContactInfo {
  return {
    email: 'support@visithub.in',
    phone: '9534470488',
    address: 'Alpha 1, Greater Noida, UP 201310',
    mapUrl: 'https://www.google.com/maps?q=Alpha+1+Greater+Noida+UP+201310&output=embed',
    mapActive: true,
    updatedAt: now(),
  };
}

function ensureStore(): ContactInfo {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    const initial = defaults();
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as Partial<ContactInfo>;
    return {
      email: String(raw.email || defaults().email),
      phone: String(raw.phone || defaults().phone),
      address: String(raw.address || defaults().address),
      mapUrl: String(raw.mapUrl || ''),
      mapActive: Boolean(raw.mapActive),
      updatedAt: String(raw.updatedAt || now()),
    };
  } catch {
    const fallback = defaults();
    fs.writeFileSync(STORE_PATH, JSON.stringify(fallback, null, 2), 'utf8');
    return fallback;
  }
}

export function getContactInfo(): ContactInfo {
  return ensureStore();
}

/** Expand short Google Maps share links so the landing iframe can embed them. */
export async function resolveMapUrl(url: string): Promise<string> {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.includes('/maps/embed') || /[?&]output=embed\b/i.test(trimmed)) return trimmed;
  if (!/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(trimmed)) return trimmed;

  try {
    const res = await fetch(trimmed, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const finalUrl = res.url || trimmed;
    const coordMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (coordMatch) {
      const [, lat, lng] = coordMatch;
      return `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`;
    }
    return finalUrl;
  } catch {
    return trimmed;
  }
}

export async function setContactInfo(input: {
  email: string;
  phone: string;
  address: string;
  mapUrl?: string;
  mapActive?: boolean;
}): Promise<ContactInfo> {
  const rawMap = (input.mapUrl || '').trim();
  const mapUrl = await resolveMapUrl(rawMap);
  const next: ContactInfo = {
    email: input.email.trim(),
    phone: input.phone.trim(),
    address: input.address.trim(),
    mapUrl,
    mapActive: Boolean(input.mapActive),
    updatedAt: now(),
  };
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
}
