import path from 'path';
import { loadJsonStore, saveJsonStore } from './jsonPersist';

export type BusinessTypePlanPricing = {
  monthlyPriceInr: number | null;
  planPrices: Record<string, number>;
  updatedAt: string;
};

type StoreFile = {
  byType: Record<string, BusinessTypePlanPricing>;
};

const STORE_PATH = path.join(process.cwd(), 'data', 'business-type-plan-settings.json');

function now() {
  return new Date().toISOString();
}

function empty(): BusinessTypePlanPricing {
  return { monthlyPriceInr: null, planPrices: {}, updatedAt: now() };
}

function isEmpty(entry: BusinessTypePlanPricing) {
  return entry.monthlyPriceInr === null && Object.keys(entry.planPrices).length === 0;
}

function normalize(raw: unknown): BusinessTypePlanPricing {
  if (!raw || typeof raw !== 'object') return empty();
  const o = raw as Record<string, unknown>;
  let monthlyPriceInr: number | null = null;
  if (o.monthlyPriceInr !== undefined && o.monthlyPriceInr !== null && o.monthlyPriceInr !== '') {
    const n = Math.round(Number(o.monthlyPriceInr));
    if (Number.isFinite(n) && n >= 0) monthlyPriceInr = n;
  }
  const planPrices: Record<string, number> = {};
  if (o.planPrices && typeof o.planPrices === 'object') {
    for (const [id, price] of Object.entries(o.planPrices as Record<string, unknown>)) {
      const n = Math.round(Number(price));
      if (id && Number.isFinite(n) && n >= 0) planPrices[id] = n;
    }
  }
  return {
    monthlyPriceInr,
    planPrices,
    updatedAt: String(o.updatedAt || now()),
  };
}

function emptyStore(): StoreFile {
  return { byType: {} };
}

function ensureFile(): StoreFile {
  try {
    const raw = loadJsonStore<StoreFile>(STORE_PATH, emptyStore());
    if (!raw?.byType || typeof raw.byType !== 'object') {
      const initial = emptyStore();
      saveJsonStore(STORE_PATH, initial);
      return initial;
    }
    const byType: Record<string, BusinessTypePlanPricing> = {};
    for (const [key, value] of Object.entries(raw.byType)) {
      byType[key] = normalize(value);
    }
    return { byType };
  } catch {
    const initial = emptyStore();
    saveJsonStore(STORE_PATH, initial);
    return initial;
  }
}

function writeFile(data: StoreFile) {
  saveJsonStore(STORE_PATH, data);
}

export function getBusinessTypePlanPricing(businessType: string): BusinessTypePlanPricing | null {
  if (!businessType) return null;
  const entry = ensureFile().byType[businessType];
  if (!entry || isEmpty(entry)) return null;
  return entry;
}

export function getBusinessTypeMonthlyPrice(businessType: string): number | null {
  return getBusinessTypePlanPricing(businessType)?.monthlyPriceInr ?? null;
}

export function getBusinessTypeCatalogPlanPrice(businessType: string, planId: string): number | null {
  if (!businessType || !planId) return null;
  const price = getBusinessTypePlanPricing(businessType)?.planPrices?.[planId];
  return typeof price === 'number' ? price : null;
}

export function setBusinessTypePlanPricing(
  businessType: string,
  input: {
    monthlyPriceInr: number | null;
    planPrices: Record<string, number | null>;
  }
): BusinessTypePlanPricing | null {
  const key = String(businessType || '').trim();
  if (!key) return null;
  const data = ensureFile();
  const planPrices: Record<string, number> = {};
  for (const [planId, price] of Object.entries(input.planPrices || {})) {
    if (price === null || price === undefined) continue;
    const n = Math.round(Number(price));
    if (planId && Number.isFinite(n) && n >= 0) planPrices[planId] = n;
  }
  const monthly =
    input.monthlyPriceInr === null || input.monthlyPriceInr === undefined
      ? null
      : Math.max(0, Math.round(Number(input.monthlyPriceInr)));
  const next: BusinessTypePlanPricing = {
    monthlyPriceInr: monthly,
    planPrices,
    updatedAt: now(),
  };
  if (isEmpty(next)) {
    delete data.byType[key];
    writeFile(data);
    return null;
  }
  data.byType[key] = next;
  writeFile(data);
  return next;
}

export function clearBusinessTypePlanPricing(businessType: string) {
  const key = String(businessType || '').trim();
  if (!key) return;
  const data = ensureFile();
  if (!(key in data.byType)) return;
  delete data.byType[key];
  writeFile(data);
}

export function renameBusinessTypePlanPricingKey(oldName: string, newName: string) {
  const from = String(oldName || '').trim();
  const to = String(newName || '').trim();
  if (!from || !to || from === to) return;
  const data = ensureFile();
  const entry = data.byType[from];
  if (!entry) return;
  data.byType[to] = { ...entry, updatedAt: now() };
  delete data.byType[from];
  writeFile(data);
}

export function applyBusinessTypePricesToPlans<T extends { id: string; priceInr: number }>(
  plans: T[],
  businessType?: string | null
): T[] {
  if (!businessType) return plans;
  const pricing = getBusinessTypePlanPricing(businessType);
  if (!pricing) return plans;
  return plans.map((plan) => {
    const override = pricing.planPrices[plan.id];
    if (typeof override !== 'number') return plan;
    return { ...plan, priceInr: override };
  });
}
