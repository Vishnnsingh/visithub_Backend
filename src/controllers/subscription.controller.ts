import type { Request, Response } from 'express';
import { listSubscriptionPlans } from '../data/plansStore';
import {
  getOrgCoverage,
  getSubscriptionById,
  listOrgSubscriptions,
  purchaseSubscription,
  type OrgSubscription,
} from '../data/subscriptionStore';
import { findOrganizationById, findUserById } from '../data/appStore';
import { getInvoiceSettings } from '../data/invoiceSettingsStore';
import {
  customPlanPriceForMonths,
  getCustomPlanSettings,
} from '../data/customPlanSettingsStore';
import { getOrgCatalogPlanPrice } from '../data/orgCustomPlanSettingsStore';
import { getBusinessTypeCatalogPlanPrice } from '../data/businessTypePlanSettingsStore';
import { successResponse } from '../utils/apiResponse';
import asyncHandler from '../utils/asyncHandler';
import AppError from '../utils/AppError';
import { USER_ROLES } from '../utils/constants';
import { streamVisitHubInvoicePdf } from '../utils/invoicePdf';

function resolveOrgId(req: Request): string {
  const user = req.user;
  if (!user) throw new AppError('Authentication required', 401);
  if (user.role === USER_ROLES.SUPER_ADMIN) {
    throw new AppError('Organisation subscription is only for organisation accounts', 403);
  }
  if (!user.organizationId) {
    throw new AppError('No organisation linked to this account', 400);
  }
  return user.organizationId;
}

function serialize(sub: OrgSubscription, coverageEndsAt?: string | null) {
  const endIso = coverageEndsAt || sub.endsAt;
  const msLeft = Math.max(0, new Date(endIso).getTime() - Date.now());
  return {
    ...sub,
    isActive: sub.status === 'active',
    msRemaining: msLeft,
    daysRemaining: Math.ceil(msLeft / (1000 * 60 * 60 * 24)),
  };
}

export const getSubscriptionStatus = asyncHandler(async (req, res) => {
  const orgId = resolveOrgId(req);
  const coverage = getOrgCoverage(orgId);
  const history = listOrgSubscriptions(orgId).map((row) =>
    serialize(row, row.status === 'active' ? coverage.coverageEndsAt : row.endsAt)
  );
  const active = coverage.latest
    ? {
        ...serialize(coverage.latest, coverage.coverageEndsAt),
        endsAt: coverage.coverageEndsAt || coverage.latest.endsAt,
        months: coverage.totalMonths,
      }
    : null;

  return successResponse(res, 'Subscription status', {
    active,
    hasActivePlan: Boolean(coverage.latest),
    activePlanCount: coverage.activePlanCount,
    totalMonths: coverage.totalMonths,
    coverageEndsAt: coverage.coverageEndsAt,
    coverageStartsAt: coverage.coverageStartsAt,
    activePlans: coverage.activePlans.map((row) => serialize(row, coverage.coverageEndsAt)),
    history,
  });
});

export const listSubscriptionHistory = asyncHandler(async (req, res) => {
  const orgId = resolveOrgId(req);
  const coverage = getOrgCoverage(orgId);
  return successResponse(
    res,
    'Billing history',
    listOrgSubscriptions(orgId).map((row) =>
      serialize(row, row.status === 'active' ? coverage.coverageEndsAt : row.endsAt)
    )
  );
});

export const purchaseOrgSubscription = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) throw new AppError('Authentication required', 401);
  if (user.role !== USER_ROLES.ORG_ADMIN) {
    throw new AppError('Only the organisation admin can purchase a plan', 403);
  }
  const orgId = resolveOrgId(req);

  const body = req.body as {
    planId?: string | null;
    months: number;
    planName?: string;
    priceInr?: number;
  };

  const monthsRaw = Math.max(1, Math.floor(Number(body.months) || 0));
  const plans = listSubscriptionPlans(true);
  const catalogPlan = body.planId ? plans.find((p) => p.id === body.planId) : null;

  let planName: string;
  let priceInr: number;
  let planId: string | null;
  let months = monthsRaw;

  if (catalogPlan) {
    const org = findOrganizationById(orgId);
    const typePrice = org?.businessType
      ? getBusinessTypeCatalogPlanPrice(org.businessType, catalogPlan.id)
      : null;
    const orgPrice = getOrgCatalogPlanPrice(orgId, catalogPlan.id);
    const effectivePrice = typePrice ?? orgPrice ?? catalogPlan.priceInr;
    const unit = effectivePrice / Math.max(1, catalogPlan.months);
    planId = catalogPlan.id;
    planName =
      months === catalogPlan.months
        ? catalogPlan.name
        : `Custom (${months} month${months === 1 ? '' : 's'})`;
    priceInr = months === catalogPlan.months ? effectivePrice : Math.round(unit * months);
  } else {
    const customSettings = getCustomPlanSettings();
    if (months < customSettings.minMonths || months > customSettings.maxMonths) {
      throw new AppError(
        `Custom plan months must be between ${customSettings.minMonths} and ${customSettings.maxMonths}`,
        400
      );
    }
    months = Math.min(customSettings.maxMonths, Math.max(customSettings.minMonths, months));
    planId = null;
    planName = body.planName?.trim() || `Custom (${months} month${months === 1 ? '' : 's'})`;
    // Always use resolved monthly rate (org override or global)
    priceInr = customPlanPriceForMonths(months, orgId);
  }

  const record = purchaseSubscription({
    organizationId: orgId,
    planId,
    planName,
    months,
    priceInr,
  });

  return successResponse(res, 'Payment successful. Plan activated.', serialize(record), 201);
});

export const downloadInvoice = asyncHandler(async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  const id = String(req.params.id || '');
  const sub = getSubscriptionById(id);
  if (!sub || sub.organizationId !== orgId) {
    throw new AppError('Invoice not found', 404);
  }

  const org = findOrganizationById(orgId);
  const admin = org?.adminUserId ? findUserById(org.adminUserId) : null;
  const settings = getInvoiceSettings();

  streamVisitHubInvoicePdf(res, {
    sub,
    org,
    admin,
    supportEmail: settings.supportEmail,
    supportWebsite: settings.supportWebsite,
  });
});
