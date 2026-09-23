import fs from 'fs';
import path from 'path';

export type OrgPlanPricing = {
  /** Custom-tab monthly rate (overrides global custom monthly) */
  monthlyPriceInr: number | null;
  /** Catalog planId → org-specific price */
  planPrices: Record<string, number>;
  updatedAt: string;
};

type StoreFile = {
  byOrg: Record<string, OrgPlanPricing>;
};

const STORE_PATH = path.join(process.cwd(), 'data', 'org-custom-plan-settings.json');

function now() {
  return new Date().toISOString();
}

function emptyOrg(): OrgPlanPricing {
  return { monthlyPriceInr: null, planPrices: {}, updatedAt: now() };
}

function normalizeEntry(raw: unknown): OrgPlanPricing {
  if (!raw || typeof raw !== 'object') return emptyOrg();
  const o = raw as Record<string, unknown>;
  // legacy shape: { monthlyPriceInr: number, updatedAt }
  const monthlyRaw = o.monthlyPriceInr;
  let monthlyPriceInr: number | null = null;
  if (monthlyRaw !== undefined && monthlyRaw !== null && monthlyRaw !== '') {
    const n = Math.round(Number(monthlyRaw));
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

function ensureFile(): StoreFile {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    const initial: StoreFile = { byOrg: {} };
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as StoreFile;
    if (!raw || typeof raw !== 'object' || !raw.byOrg || typeof raw.byOrg !== 'object') {
      const initial: StoreFile = { byOrg: {} };
      fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
      return initial;
    }
    const byOrg: Record<string, OrgPlanPricing> = {};
    for (const [orgId, entry] of Object.entries(raw.byOrg)) {
      byOrg[orgId] = normalizeEntry(entry);
    }
    return { byOrg };
  } catch {
    const initial: StoreFile = { byOrg: {} };
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
}

function writeFile(data: StoreFile) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function isEmpty(entry: OrgPlanPricing) {
  return entry.monthlyPriceInr === null && Object.keys(entry.planPrices).length === 0;
}

export function getOrgPlanPricing(organizationId: string): OrgPlanPricing | null {
  if (!organizationId) return null;
  const entry = ensureFile().byOrg[organizationId];
  if (!entry || isEmpty(entry)) return null;
  return entry;
}

export function getOrgCustomMonthlyPrice(organizationId: string): number | null {
  return getOrgPlanPricing(organizationId)?.monthlyPriceInr ?? null;
}

export function getOrgCatalogPlanPrice(organizationId: string, planId: string): number | null {
  if (!organizationId || !planId) return null;
  const price = getOrgPlanPricing(organizationId)?.planPrices?.[planId];
  return typeof price === 'number' ? price : null;
}

/** Set custom monthly override; null clears only the monthly field */
export function setOrgCustomMonthlyPrice(
  organizationId: string,
  monthlyPriceInr: number | null
): OrgPlanPricing | null {
  if (!organizationId) return null;
  const data = ensureFile();
  const current = normalizeEntry(data.byOrg[organizationId] || emptyOrg());
  const next: OrgPlanPricing = {
    ...current,
    monthlyPriceInr:
      monthlyPriceInr === null ? null : Math.max(0, Math.round(monthlyPriceInr)),
    updatedAt: now(),
  };
  if (isEmpty(next)) {
    delete data.byOrg[organizationId];
    writeFile(data);
    return null;
  }
  data.byOrg[organizationId] = next;
  writeFile(data);
  return next;
}

/** Set or clear one catalog plan price for an org (null = use global plan price) */
export function setOrgCatalogPlanPrice(
  organizationId: string,
  planId: string,
  priceInr: number | null
): OrgPlanPricing | null {
  if (!organizationId || !planId) return null;
  const data = ensureFile();
  const current = normalizeEntry(data.byOrg[organizationId] || emptyOrg());
  const planPrices = { ...current.planPrices };
  if (priceInr === null) {
    delete planPrices[planId];
  } else {
    planPrices[planId] = Math.max(0, Math.round(priceInr));
  }
  const next: OrgPlanPricing = {
    ...current,
    planPrices,
    updatedAt: now(),
  };
  if (isEmpty(next)) {
    delete data.byOrg[organizationId];
    writeFile(data);
    return null;
  }
  data.byOrg[organizationId] = next;
  writeFile(data);
  return next;
}

export function setOrgPlanPricingBundle(
  organizationId: string,
  input: {
    monthlyPriceInr: number | null;
    planPrices: Record<string, number | null>;
  }
): OrgPlanPricing | null {
  if (!organizationId) return null;
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
  const next: OrgPlanPricing = {
    monthlyPriceInr: monthly,
    planPrices,
    updatedAt: now(),
  };
  if (isEmpty(next)) {
    delete data.byOrg[organizationId];
    writeFile(data);
    return null;
  }
  data.byOrg[organizationId] = next;
  writeFile(data);
  return next;
}

export function clearOrgCustomMonthlyPrice(organizationId: string) {
  if (!organizationId) return;
  const data = ensureFile();
  delete data.byOrg[organizationId];
  writeFile(data);
}

/** Apply org catalog price overrides onto a plan list */
export function applyOrgPricesToPlans<T extends { id: string; priceInr: number }>(
  plans: T[],
  organizationId?: string | null
): T[] {
  if (!organizationId) return plans;
  const pricing = getOrgPlanPricing(organizationId);
  if (!pricing) return plans;
  return plans.map((plan) => {
    const override = pricing.planPrices[plan.id];
    if (typeof override !== 'number') return plan;
    return { ...plan, priceInr: override };
  });
}
