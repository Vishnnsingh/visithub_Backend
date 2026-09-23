import path from 'path';
import { loadJsonStore, saveJsonStore } from './jsonPersist';

export type LandingThemeMode = 'dark' | 'light';

type LandingThemeFile = {
  theme: LandingThemeMode;
  updatedAt: string;
};

const STORE_PATH = path.join(process.cwd(), 'data', 'landing-theme.json');

function now() {
  return new Date().toISOString();
}

function emptyStore(): LandingThemeFile {
  return { theme: 'dark', updatedAt: now() };
}

function ensureStore(): LandingThemeFile {
  try {
    const raw = loadJsonStore<LandingThemeFile>(STORE_PATH, emptyStore());
    if (raw.theme === 'dark' || raw.theme === 'light') return raw;
  } catch {
    /* fall through */
  }
  const fallback = emptyStore();
  saveJsonStore(STORE_PATH, fallback);
  return fallback;
}

export function getLandingTheme(): LandingThemeFile {
  return ensureStore();
}

export function setLandingTheme(theme: LandingThemeMode): LandingThemeFile {
  const next: LandingThemeFile = { theme, updatedAt: now() };
  saveJsonStore(STORE_PATH, next);
  return next;
}
