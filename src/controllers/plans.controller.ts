import { successResponse } from '../utils/apiResponse';
import asyncHandler from '../utils/asyncHandler';
import AppError from '../utils/AppError';
import {
  createSubscriptionPlan,
  deleteSubscriptionPlan,
  listSubscriptionPlans,
  updateSubscriptionPlan,
} from '../data/plansStore';
import { getInvoiceSettings, setInvoiceSettings } from '../data/invoiceSettingsStore';
import {
  getCustomPlanSettings,
  resolveCustomPlanSettings,
  setCustomPlanSettings,
} from '../data/customPlanSettingsStore';
import {
  applyBusinessTypePricesToPlans,
  getBusinessTypePlanPricing,
  setBusinessTypePlanPricing,
} from '../data/businessTypePlanSettingsStore';
import { isKnownBusinessType } from '../data/businessTypesStore';
import { applyOrgPricesToPlans } from '../data/orgCustomPlanSettingsStore';
import { verifyAuthToken } from '../utils/token';
import { findOrganizationById, findUserById } from '../data/appStore';
import { readCookieToken } from '../services/auth.service';
import { USER_ROLES } from '../utils/constants';
import type { Request } from 'express';

function orgContextFromRequest(req: Request): { organizationId: string | null; businessType: string | null } {
  try {
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
    const token = bearer || readCookieToken(req, 'org');
    if (!token) return { organizationId: null, businessType: null };
    const payload = verifyAuthToken(token);
    if (!payload?.id) return { organizationId: null, businessType: null };
    const user = findUserById(payload.id);
    if (
      !user?.isActive ||
      !user.organizationId ||
      (user.role !== USER_ROLES.ORG_ADMIN && user.role !== USER_ROLES.STAFF)
    ) {
      return { organizationId: null, businessType: null };
    }
    const org = findOrganizationById(user.organizationId);
    return {
      organizationId: user.organizationId,
      businessType: org?.businessType || null,
    };
  } catch {
    return { organizationId: null, businessType: null };
  }
}

export const listPublicPlans = asyncHandler(async (req, res) => {
  const plans = listSubscriptionPlans(true);
  const { organizationId, businessType } = orgContextFromRequest(req);
  // Business-type prices win; legacy per-org overrides only fill gaps
  let priced = applyOrgPricesToPlans(plans, organizationId);
  priced = applyBusinessTypePricesToPlans(priced, businessType);
  return successResponse(res, 'Subscription plans', priced);
});

export const listAdminPlans = asyncHandler(async (_req, res) => {
  return successResponse(res, 'Subscription plans', listSubscriptionPlans(false));
});

export const createAdminPlan = asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const months = Number(req.body.months);
  const priceInr = Number(req.body.priceInr);
  if (!name) throw new AppError('Plan name is required', 400);
  if (!Number.isFinite(months) || months < 0) throw new AppError('Months is invalid', 400);
  if (!Number.isFinite(priceInr) || priceInr < 0) throw new AppError('Price is invalid', 400);
  const plan = createSubscriptionPlan({
    name,
    months,
    priceInr,
    description: String(req.body.description || ''),
    features: Array.isArray(req.body.features) ? req.body.features.map(String) : [],
    highlighted: Boolean(req.body.highlighted),
    active: req.body.active !== false,
  });
  return successResponse(res, 'Plan created', plan, 201);
});

export const updateAdminPlan = asyncHandler(async (req, res) => {
  const plan = updateSubscriptionPlan(String(req.params.id), {
    name: req.body.name !== undefined ? String(req.body.name) : undefined,
    months: req.body.months !== undefined ? Number(req.body.months) : undefined,
    priceInr: req.body.priceInr !== undefined ? Number(req.body.priceInr) : undefined,
    description: req.body.description !== undefined ? String(req.body.description) : undefined,
    features: Array.isArray(req.body.features) ? req.body.features.map(String) : undefined,
    highlighted: req.body.highlighted !== undefined ? Boolean(req.body.highlighted) : undefined,
    active: req.body.active !== undefined ? Boolean(req.body.active) : undefined,
    sortOrder: req.body.sortOrder !== undefined ? Number(req.body.sortOrder) : undefined,
  });
  if (!plan) throw new AppError('Plan not found', 404);
  return successResponse(res, 'Plan updated', plan);
});

export const removeAdminPlan = asyncHandler(async (req, res) => {
  const ok = deleteSubscriptionPlan(String(req.params.id));
  if (!ok) throw new AppError('Plan not found', 404);
  return successResponse(res, 'Plan deleted', { id: req.params.id });
});

export const getAdminInvoiceSettings = asyncHandler(async (_req, res) => {
  return successResponse(res, 'Invoice settings', getInvoiceSettings());
});

export const updateAdminInvoiceSettings = asyncHandler(async (req, res) => {
  const supportEmail = String(req.body.supportEmail || '').trim();
  const supportWebsite = String(req.body.supportWebsite || '').trim();
  if (!supportEmail) throw new AppError('Support email is required', 400);
  if (!supportWebsite) throw new AppError('Support website is required', 400);
  const saved = setInvoiceSettings({ supportEmail, supportWebsite });
  return successResponse(res, 'Invoice settings saved', saved);
});

export const getPublicCustomPlanSettings = asyncHandler(async (req, res) => {
  const { organizationId } = orgContextFromRequest(req);
  return successResponse(res, 'Custom plan settings', resolveCustomPlanSettings(organizationId));
});

export const getAdminCustomPlanSettings = asyncHandler(async (_req, res) => {
  return successResponse(res, 'Custom plan settings', getCustomPlanSettings());
});

export const updateAdminCustomPlanSettings = asyncHandler(async (req, res) => {
  const monthlyPriceInr = Number(req.body.monthlyPriceInr);
  const minMonths = Number(req.body.minMonths);
  const maxMonths = Number(req.body.maxMonths);
  const defaultMonths = Number(req.body.defaultMonths);
  if (!Number.isFinite(monthlyPriceInr) || monthlyPriceInr < 0) {
    throw new AppError('Monthly price is invalid', 400);
  }
  if (!Number.isFinite(minMonths) || minMonths < 1) {
    throw new AppError('Minimum months is invalid', 400);
  }
  if (!Number.isFinite(maxMonths) || maxMonths < minMonths) {
    throw new AppError('Maximum months must be ≥ minimum months', 400);
  }
  if (!Number.isFinite(defaultMonths)) {
    throw new AppError('Default months is invalid', 400);
  }
  const saved = setCustomPlanSettings({
    monthlyPriceInr,
    minMonths,
    maxMonths,
    defaultMonths,
  });
  return successResponse(res, 'Custom plan settings saved', saved);
});

export const getAdminBusinessTypePricing = asyncHandler(async (req, res) => {
  const businessType = String(req.query.businessType || '').trim();
  if (!businessType || !isKnownBusinessType(businessType)) {
    throw new AppError('Valid business type is required', 400);
  }
  return successResponse(res, 'Business type plan pricing', buildBusinessTypePricingView(businessType));
});

export const updateAdminBusinessTypePricing = asyncHandler(async (req, res) => {
  const businessType = String(req.body.businessType || '').trim();
  if (!businessType || !isKnownBusinessType(businessType)) {
    throw new AppError('Valid business type is required', 400);
  }
  const useGlobalMonthly = req.body.useGlobalMonthly === true || req.body.monthlyPriceInr === null;
  const monthly = useGlobalMonthly ? null : Number(req.body.monthlyPriceInr);
  if (!useGlobalMonthly && (!Number.isFinite(monthly) || (monthly as number) < 0)) {
    throw new AppError('Monthly price is invalid', 400);
  }
  const planPrices: Record<string, number | null> = {};
  if (req.body.planPrices && typeof req.body.planPrices === 'object') {
    const catalogIds = new Set(
      listSubscriptionPlans(true)
        .filter((p) => p.months > 0)
        .map((p) => p.id)
    );
    for (const [planId, value] of Object.entries(req.body.planPrices as Record<string, unknown>)) {
      if (!catalogIds.has(planId)) throw new AppError('Catalog plan not found', 404);
      if (value === null || value === undefined) {
        planPrices[planId] = null;
      } else {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) throw new AppError('Plan price is invalid', 400);
        planPrices[planId] = n;
      }
    }
  }
  setBusinessTypePlanPricing(businessType, {
    monthlyPriceInr: useGlobalMonthly ? null : (monthly as number),
    planPrices,
  });
  return successResponse(
    res,
    'Business type plan pricing saved',
    buildBusinessTypePricingView(businessType)
  );
});

function buildBusinessTypePricingView(businessType: string) {
  const global = getCustomPlanSettings();
  const plans = listSubscriptionPlans(true).filter((p) => p.months > 0);
  const stored = getBusinessTypePlanPricing(businessType);
  return {
    businessType,
    monthlyPriceInr: stored?.monthlyPriceInr ?? null,
    effectiveMonthlyPriceInr: stored?.monthlyPriceInr ?? global.monthlyPriceInr,
    globalMonthlyPriceInr: global.monthlyPriceInr,
    catalogPlanPrices: plans.map((plan) => {
      const typePrice = stored?.planPrices?.[plan.id];
      return {
        planId: plan.id,
        name: plan.name,
        months: plan.months,
        globalPriceInr: plan.priceInr,
        typePriceInr: typeof typePrice === 'number' ? typePrice : null,
        effectivePriceInr: typeof typePrice === 'number' ? typePrice : plan.priceInr,
      };
    }),
  };
}