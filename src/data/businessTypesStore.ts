import path from 'path';
import {
  clearBusinessTypePlanPricing,
  renameBusinessTypePlanPricingKey,
} from './businessTypePlanSettingsStore';
import { loadJsonStore, saveJsonStore } from './jsonPersist';

/** Seed list used when the store file is first created */
export const DEFAULT_BUSINESS_TYPES = [
  'School',
  'College',
  'Company/Office',
  'PG',
  'Hostel',
  'Apartment/Society',
  'Showroom',
  'Factory',
  'Hospital',
  'Hotel',
  'Other',
] as const;

type StoreFile = {
  types: string[];
  updatedAt: string;
};

const STORE_PATH = path.join(process.cwd(), 'data', 'business-types.json');

function now() {
  return new Date().toISOString();
}

function normalizeName(raw: string) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

function isOtherType(name: string) {
  return normalizeName(name).toLowerCase() === 'other';
}

/** Keep "Other" always at the bottom of the list */
function withOtherLast(types: string[]): string[] {
  const rest: string[] = [];
  const others: string[] = [];
  for (const type of types) {
    if (isOtherType(type)) others.push(type);
    else rest.push(type);
  }
  return [...rest, ...others];
}

function writeFile(data: StoreFile) {
  const payload: StoreFile = {
    types: withOtherLast(data.types),
    updatedAt: data.updatedAt,
  };
  saveJsonStore(STORE_PATH, payload);
}

function emptyStore(): StoreFile {
  return {
    types: [...DEFAULT_BUSINESS_TYPES],
    updatedAt: now(),
  };
}

function ensureFile(): StoreFile {
  try {
    const raw = loadJsonStore<StoreFile>(STORE_PATH, emptyStore());
    const types = Array.isArray(raw?.types)
      ? raw.types
          .map((t) => normalizeName(String(t)))
          .filter(Boolean)
          .filter((t, i, arr) => arr.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i)
      : [...DEFAULT_BUSINESS_TYPES];
    return { types, updatedAt: String(raw?.updatedAt || now()) };
  } catch {
    const fallback = emptyStore();
    writeFile(fallback);
    return fallback;
  }
}

export function listBusinessTypes(): string[] {
  return withOtherLast(ensureFile().types);
}

export function isKnownBusinessType(type: string): boolean {
  const name = normalizeName(type);
  if (!name) return false;
  return listBusinessTypes().some((t) => t.toLowerCase() === name.toLowerCase());
}

export function addBusinessType(nameInput: string): string[] {
  const name = normalizeName(nameInput);
  if (!name) throw new Error('Business type name is required');
  const data = ensureFile();
  if (data.types.some((t) => t.toLowerCase() === name.toLowerCase())) {
    throw new Error('Business type already exists');
  }
  if (isOtherType(name)) {
    data.types.push(name);
  } else {
    const otherIndex = data.types.findIndex((t) => isOtherType(t));
    if (otherIndex >= 0) data.types.splice(otherIndex, 0, name);
    else data.types.push(name);
  }
  data.updatedAt = now();
  writeFile(data);
  return listBusinessTypes();
}

export function updateBusinessType(oldNameInput: string, newNameInput: string): string[] {
  const oldName = normalizeName(oldNameInput);
  const newName = normalizeName(newNameInput);
  if (!oldName || !newName) throw new Error('Business type name is required');
  const data = ensureFile();
  const index = data.types.findIndex((t) => t.toLowerCase() === oldName.toLowerCase());
  if (index < 0) throw new Error('Business type not found');
  const current = data.types[index];
  if (newName.toLowerCase() !== current.toLowerCase()) {
    if (data.types.some((t, i) => i !== index && t.toLowerCase() === newName.toLowerCase())) {
      throw new Error('Business type already exists');
    }
  }
  data.types[index] = newName;
  data.updatedAt = now();
  writeFile(data);
  if (current !== newName) {
    renameBusinessTypePlanPricingKey(current, newName);
  }
  return listBusinessTypes();
}

export function deleteBusinessType(nameInput: string): string[] {
  const name = normalizeName(nameInput);
  if (!name) throw new Error('Business type name is required');
  const data = ensureFile();
  const index = data.types.findIndex((t) => t.toLowerCase() === name.toLowerCase());
  if (index < 0) throw new Error('Business type not found');
  const removed = data.types[index];
  data.types.splice(index, 1);
  data.updatedAt = now();
  writeFile(data);
  clearBusinessTypePlanPricing(removed);
  return listBusinessTypes();
}

export function clearAllBusinessTypes(): string[] {
  const data = ensureFile();
  for (const type of data.types) {
    clearBusinessTypePlanPricing(type);
  }
  data.types = [];
  data.updatedAt = now();
  writeFile(data);
  return [];
}
