import fs from 'fs';
import path from 'path';

export type LandingThemeMode = 'dark' | 'light';

type LandingThemeFile = {
  theme: LandingThemeMode;
  updatedAt: string;
};

const STORE_PATH = path.join(process.cwd(), 'data', 'landing-theme.json');

function now() {
  return new Date().toISOString();
}

function ensureStore(): LandingThemeFile {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    const initial: LandingThemeFile = { theme: 'dark', updatedAt: now() };
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as LandingThemeFile;
    if (raw.theme === 'dark' || raw.theme === 'light') return raw;
  } catch {
    /* fall through */
  }
  const fallback: LandingThemeFile = { theme: 'dark', updatedAt: now() };
  fs.writeFileSync(STORE_PATH, JSON.stringify(fallback, null, 2), 'utf8');
  return fallback;
}

export function getLandingTheme(): LandingThemeFile {
  return ensureStore();
}

export function setLandingTheme(theme: LandingThemeMode): LandingThemeFile {
  const next: LandingThemeFile = { theme, updatedAt: now() };
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
}
