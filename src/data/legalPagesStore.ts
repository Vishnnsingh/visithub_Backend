import fs from 'fs';
import path from 'path';

export const LEGAL_SLUGS = ['terms', 'privacy'] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

export type LegalPage = {
  slug: LegalSlug;
  title: string;
  body: string;
  updatedAt: string;
};

type StoreFile = {
  pages: Record<LegalSlug, LegalPage>;
};

const STORE_PATH = path.join(process.cwd(), 'data', 'legal-pages.json');

function now() {
  return new Date().toISOString();
}

function defaults(): StoreFile {
  return {
    pages: {
      terms: {
        slug: 'terms',
        title: 'Terms and conditions',
        body: 'These Terms and Conditions govern your use of Visit Hub. By creating an account or using the service, you agree to these terms.\n\nPlease replace this text with your organisation’s official terms.',
        updatedAt: now(),
      },
      privacy: {
        slug: 'privacy',
        title: 'Privacy policy',
        body: 'This Privacy Policy explains how Visit Hub collects, uses, and protects your information.\n\nPlease replace this text with your organisation’s official privacy policy.',
        updatedAt: now(),
      },
    },
  };
}

function ensureStore(): StoreFile {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    const initial = defaults();
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as StoreFile;
    const base = defaults();
    for (const slug of LEGAL_SLUGS) {
      const page = raw?.pages?.[slug];
      if (page && typeof page === 'object') {
        base.pages[slug] = {
          slug,
          title: String(page.title || base.pages[slug].title).trim().slice(0, 120) || base.pages[slug].title,
          body: String(page.body || '').slice(0, 50000),
          updatedAt: String(page.updatedAt || now()),
        };
      }
    }
    return base;
  } catch {
    const fallback = defaults();
    fs.writeFileSync(STORE_PATH, JSON.stringify(fallback, null, 2), 'utf8');
    return fallback;
  }
}

function writeStore(store: StoreFile) {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

export function isLegalSlug(value: string): value is LegalSlug {
  return (LEGAL_SLUGS as readonly string[]).includes(value);
}

export function listLegalPages(): LegalPage[] {
  const store = ensureStore();
  return LEGAL_SLUGS.map((slug) => store.pages[slug]);
}

export function getLegalPage(slug: string): LegalPage | null {
  if (!isLegalSlug(slug)) return null;
  return ensureStore().pages[slug];
}

export function updateLegalPage(
  slug: string,
  input: { title: string; body: string }
): LegalPage | null {
  if (!isLegalSlug(slug)) return null;
  const store = ensureStore();
  const title = String(input.title || '').trim().slice(0, 120);
  const body = String(input.body || '').slice(0, 50000);
  if (!title) throw new Error('Title is required');
  store.pages[slug] = {
    slug,
    title,
    body,
    updatedAt: now(),
  };
  writeStore(store);
  return store.pages[slug];
}

export function clearLegalPage(slug: string): LegalPage | null {
  if (!isLegalSlug(slug)) return null;
  const store = ensureStore();
  const current = store.pages[slug];
  store.pages[slug] = {
    ...current,
    body: '',
    updatedAt: now(),
  };
  writeStore(store);
  return store.pages[slug];
}
