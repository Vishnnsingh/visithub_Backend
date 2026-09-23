import fs from 'fs';
import path from 'path';

import { getOrgCustomMonthlyPrice } from './orgCustomPlanSettingsStore';
import { getBusinessTypeMonthlyPrice } from './businessTypePlanSettingsStore';
import { findOrganizationById } from './appStore';

export type CustomPlanSettings = {
  /** Price charged per month for custom duration purchases */
  monthlyPriceInr: number;
  minMonths: number;
  maxMonths: number;
  defaultMonths: number;
  updatedAt: string;
  /** True when monthlyPriceInr comes from business-type or org override */
  orgOverride?: boolean;
  organizationId?: string | null;
  businessType?: string | null;
};

const STORE_PATH = path.join(process.cwd(), 'data', 'custom-plan-settings.json');

function now() {
  return new Date().toISOString();
}

function defaults(): CustomPlanSettings {
  return {
    monthlyPriceInr: 499,
    minMonths: 1,
    maxMonths: 60,
    defaultMonths: 1,
    updatedAt: now(),
  };
}

function clampSettings(raw: Partial<CustomPlanSettings>): CustomPlanSettings {
  const monthlyPriceInr = Math.max(0, Math.round(Number(raw.monthlyPriceInr) || defaults().monthlyPriceInr));
  let minMonths = Math.max(1, Math.round(Number(raw.minMonths) || defaults().minMonths));
  let maxMonths = Math.max(minMonths, Math.round(Number(raw.maxMonths) || defaults().maxMonths));
  maxMonths = Math.min(120, maxMonths);
  let defaultMonths = Math.round(Number(raw.defaultMonths) || defaults().defaultMonths);
  defaultMonths = Math.min(maxMonths, Math.max(minMonths, defaultMonths));
  return {
    monthlyPriceInr,
    minMonths,
    maxMonths,
    defaultMonths,
    updatedAt: String(raw.updatedAt || now()),
  };
}

function ensureStore(): CustomPlanSettings {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    const initial = defaults();
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as Partial<CustomPlanSettings>;
    return clampSettings(raw);
  } catch {
    const fallback = defaults();
    fs.writeFileSync(STORE_PATH, JSON.stringify(fallback, null, 2), 'utf8');
    return fallback;
  }
}

export function getCustomPlanSettings(): CustomPlanSettings {
  return ensureStore();
}

/** Global defaults + business-type (preferred) or legacy org monthly override */
export function resolveCustomPlanSettings(organizationId?: string | null): CustomPlanSettings {
  const global = ensureStore();
  if (!organizationId) {
    return { ...global, orgOverride: false, organizationId: null, businessType: null };
  }
  const org = findOrganizationById(organizationId);
  const businessType = org?.businessType || null;
  const typeMonthly = businessType ? getBusinessTypeMonthlyPrice(businessType) : null;
  if (typeMonthly !== null) {
    return {
      ...global,
      monthlyPriceInr: typeMonthly,
      orgOverride: true,
      organizationId,
      businessType,
    };
  }
  const override = getOrgCustomMonthlyPrice(organizationId);
  if (override === null) {
    return { ...global, orgOverride: false, organizationId, businessType };
  }
  return {
    ...global,
    monthlyPriceInr: override,
    orgOverride: true,
    organizationId,
    businessType,
  };
}

export function setCustomPlanSettings(input: {
  monthlyPriceInr: number;
  minMonths: number;
  maxMonths: number;
  defaultMonths: number;
}): CustomPlanSettings {
  const next = clampSettings({ ...input, updatedAt: now() });
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

/** Server-side custom price from resolved monthly rate (org override or global) */
export function customPlanPriceForMonths(months: number, organizationId?: string | null): number {
  const settings = resolveCustomPlanSettings(organizationId);
  const m = Math.min(settings.maxMonths, Math.max(settings.minMonths, Math.round(months)));
  return Math.round(settings.monthlyPriceInr * m);
}
