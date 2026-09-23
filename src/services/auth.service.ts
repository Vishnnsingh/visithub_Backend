import { randomUUID } from 'crypto';
import type { CookieOptions, Response } from 'express';
import env from '../config/env';
import logger from '../config/logger';
import {
  ensureSupabaseAuthUser,
  getSupabaseAuthEmailStatus,
  sendSupabaseVerificationEmail,
} from './supabaseAuth';
import {
  addOrganization,
  deleteOrganization,
  findOrganizationById,
  findUserByEmail,
  findUserById,
  listOrganizations,
  listUsers,
  listVisitorsByOrg,
  readStore,
  saveHomeLayout,
  updateOrganization,
  upsertUser,
} from '../data/appStore';
import { getActiveSubscription, isOrgSubscriptionActive, listOrgSubscriptions } from '../data/subscriptionStore';
import {
  clearOrgCustomMonthlyPrice,
  getOrgCustomMonthlyPrice,
  getOrgPlanPricing,
  setOrgCatalogPlanPrice,
  setOrgCustomMonthlyPrice,
  setOrgPlanPricingBundle,
} from '../data/orgCustomPlanSettingsStore';
import { getCustomPlanSettings } from '../data/customPlanSettingsStore';
import { listSubscriptionPlans } from '../data/plansStore';
import { defaultHomeLayout } from './homeElement.service';
import AppError from '../utils/AppError';
import { USER_ROLES } from '../utils/constants';
import { indiaDateTime, now, slugify } from '../utils/helpers';
import { hashPassword, verifyPassword } from '../utils/password';
import { getTokenTtlSeconds, signAuthToken } from '../utils/token';
import type { AuthUser, StoredOrganization, StoredUser } from '../types/auth';
import type { RegisterInput } from './auth.types';
import { normalizeStaffPages } from '../utils/dashboardAccess';

export type { RegisterInput } from './auth.types';

const ORG_ADMIN_COOKIE = 'kf_org_admin_token';
const STAFF_COOKIE = 'kf_staff_token';
const SUPER_COOKIE = 'kf_super_token';
/** @deprecated shared org cookie — still read for migration */
const LEGACY_ORG_COOKIE = 'kf_org_token';
/** @deprecated legacy single cookie — still read for migration */
const LEGACY_COOKIE = 'kf_token';

export function toPublicUser(user: StoredUser | AuthUser): AuthUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    organizationId: user.organizationId,
    staffRoleId: user.staffRoleId ?? null,
    staffCode: user.staffCode ?? null,
    allowedPages:
      user.role === 'staff'
        ? normalizeStaffPages((user as StoredUser).allowedPages, {
            legacyFull: (user as StoredUser).allowedPages === undefined,
          })
        : undefined,
  };
}

export function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    signed: true,
    sameSite: 'lax',
    secure: env.isProd,
    maxAge: getTokenTtlSeconds() * 1000,
    path: '/',
  };
}

function clearLegacySharedCookies(res: Response) {
  res.clearCookie(LEGACY_ORG_COOKIE, { ...cookieOptions(), maxAge: 0 });
  res.clearCookie(LEGACY_COOKIE, { ...cookieOptions(), maxAge: 0 });
}

/** Org admin session — does not clear staff cookie (dual-tab safe) */
export function attachOrgAdminSession(res: Response, user: AuthUser) {
  const token = signAuthToken(user);
  res.cookie(ORG_ADMIN_COOKIE, token, cookieOptions());
  clearLegacySharedCookies(res);
  return token;
}

/** Staff session — does not clear org-admin cookie (dual-tab safe) */
export function attachStaffSession(res: Response, user: AuthUser) {
  const token = signAuthToken(user);
  res.cookie(STAFF_COOKIE, token, cookieOptions());
  clearLegacySharedCookies(res);
  return token;
}

/** Attach the cookie that matches the user's role (admin vs staff stay independent) */
export function attachOrgSession(res: Response, user: AuthUser) {
  if (user.role === USER_ROLES.STAFF) return attachStaffSession(res, user);
  return attachOrgAdminSession(res, user);
}

export function attachSuperSession(res: Response, user: AuthUser) {
  const token = signAuthToken(user);
  res.cookie(SUPER_COOKIE, token, cookieOptions());
  clearLegacySharedCookies(res);
  return token;
}

/** @deprecated use attachOrgSession / attachSuperSession */
export function attachSession(res: Response, user: AuthUser) {
  if (user.role === USER_ROLES.SUPER_ADMIN) return attachSuperSession(res, user);
  return attachOrgSession(res, user);
}

export function clearOrgAdminSession(res: Response) {
  res.clearCookie(ORG_ADMIN_COOKIE, { ...cookieOptions(), maxAge: 0 });
  clearLegacySharedCookies(res);
}

export function clearStaffSession(res: Response) {
  res.clearCookie(STAFF_COOKIE, { ...cookieOptions(), maxAge: 0 });
  clearLegacySharedCookies(res);
}

/** Clear only the matching org role cookie when known; otherwise clear both org slots */
export function clearOrgSession(res: Response, role?: string | null) {
  if (role === USER_ROLES.STAFF) {
    clearStaffSession(res);
    return;
  }
  if (role === USER_ROLES.ORG_ADMIN) {
    clearOrgAdminSession(res);
    return;
  }
  clearOrgAdminSession(res);
  clearStaffSession(res);
}

export function clearSuperSession(res: Response) {
  res.clearCookie(SUPER_COOKIE, { ...cookieOptions(), maxAge: 0 });
  clearLegacySharedCookies(res);
}

/** @deprecated */
export function clearSession(res: Response) {
  clearOrgSession(res);
}

export function readCookieToken(
  req: { signedCookies?: Record<string, unknown>; cookies?: Record<string, unknown> },
  which: 'org_admin' | 'staff' | 'org' | 'super' | 'any' = 'any'
): string | null {
  const pick = (name: string) => {
    const signed = req.signedCookies?.[name];
    if (typeof signed === 'string' && signed) return signed;
    const unsigned = req.cookies?.[name];
    if (typeof unsigned === 'string' && unsigned) return unsigned;
    return null;
  };

  if (which === 'org_admin') {
    return pick(ORG_ADMIN_COOKIE) || pick(LEGACY_ORG_COOKIE) || pick(LEGACY_COOKIE);
  }
  if (which === 'staff') {
    return pick(STAFF_COOKIE) || pick(LEGACY_ORG_COOKIE) || pick(LEGACY_COOKIE);
  }
  if (which === 'org') {
    return (
      pick(ORG_ADMIN_COOKIE) ||
      pick(STAFF_COOKIE) ||
      pick(LEGACY_ORG_COOKIE) ||
      pick(LEGACY_COOKIE)
    );
  }
  if (which === 'super') return pick(SUPER_COOKIE) || pick(LEGACY_COOKIE);
  return (
    pick(ORG_ADMIN_COOKIE) ||
    pick(STAFF_COOKIE) ||
    pick(SUPER_COOKIE) ||
    pick(LEGACY_ORG_COOKIE) ||
    pick(LEGACY_COOKIE)
  );
}

export function seedSuperAdmin(): void {
  const email = env.SUPER_ADMIN_EMAIL;
  const password = env.SUPER_ADMIN_PASSWORD;
  if (!email || !password) {
    logger.warn('Super admin skipped — SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set');
    return;
  }

  const timestamp = now();
  const existing = findUserByEmail(email);
  if (existing) {
    upsertUser({
      ...existing,
      fullName: env.SUPER_ADMIN_NAME || existing.fullName,
      role: 'super_admin',
      isActive: true,
      updatedAt: timestamp,
    });
    logger.info(`Super admin ready (${email})`);
    return;
  }

  upsertUser({
    id: randomUUID(),
    email,
    passwordHash: hashPassword(password),
    fullName: env.SUPER_ADMIN_NAME || 'Super Admin',
    phone: '',
    role: 'super_admin',
    organizationId: null,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    supabaseId: null,
  });
  logger.info(`Super admin ready (${email})`);
}

function assertNotReservedEmail(email: string): void {
  if (email.toLowerCase() === env.SUPER_ADMIN_EMAIL) {
    throw new AppError('This email is reserved for super admin', 409);
  }
}

export async function registerAccount(input: RegisterInput) {
  const email = input.email.toLowerCase();
  assertNotReservedEmail(email);

  if (findUserByEmail(email)) {
    throw new AppError('An account with this email already exists', 409);
  }

  const timestamp = now();
  const userId = randomUUID();
  const organizationId = randomUUID();
  const website = input.organization.website?.trim() || null;
  const addressLine2 = input.organization.addressLine2?.trim() || null;

  const organization: StoredOrganization = {
    id: organizationId,
    name: input.organization.name,
    slug: `${slugify(input.organization.name)}-${Date.now().toString(36)}`,
    businessType: input.organization.businessType,
    contactNumber: input.organization.contactNumber,
    email: input.organization.email.toLowerCase(),
    website,
    addressLine1: input.organization.addressLine1,
    addressLine2,
    city: input.organization.city,
    state: input.organization.state,
    country: input.organization.country || 'India',
    pincode: input.organization.pincode,
    adminUserId: userId,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const user: StoredUser = {
    id: userId,
    email,
    passwordHash: hashPassword(input.password),
    fullName: input.fullName,
    phone: input.mobileNumber,
    role: 'org_admin',
    organizationId,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    supabaseId: null,
  };

  addOrganization(organization);
  upsertUser(user);
  // Mint visitor Home template (Welcome / Visit / Social / Thank you) — editable later in Home Element
  saveHomeLayout(organizationId, defaultHomeLayout(organization.name));

  // Supabase Auth: store email for verification (new accounts must confirm)
  const authId = await ensureSupabaseAuthUser({
    email,
    password: input.password,
    fullName: input.fullName,
    phone: input.mobileNumber,
    role: USER_ROLES.ORG_ADMIN,
    organizationId,
    emailConfirm: false,
  });
  if (authId) {
    upsertUser({ ...user, supabaseId: authId, updatedAt: now() });
    await sendSupabaseVerificationEmail(email, input.password);
  }

  return {
    user: toPublicUser(findUserByEmail(email) || user),
    organization,
    needsEmailConfirmation: Boolean(authId),
  };
}

export async function loginAccount(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  const user = findUserByEmail(normalized);

  if (!user || !user.isActive) {
    throw new AppError('Invalid email or password', 401);
  }

  if (user.role === USER_ROLES.SUPER_ADMIN) {
    throw new AppError('Use Visit Hub staff login for this account', 403);
  }

  const passwordOk = verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    throw new AppError('Invalid email or password', 401);
  }

  const status = await getSupabaseAuthEmailStatus(normalized);
  if (status.exists && !status.confirmed) {
    throw new AppError('Please verify your email before logging in. Check your inbox.', 403);
  }

  // Migrated / older accounts: create Auth user as already verified so login never breaks
  const authId = await ensureSupabaseAuthUser({
    email: normalized,
    password,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    organizationId: user.organizationId,
    emailConfirm: !status.exists,
  });
  if (authId && authId !== user.supabaseId) {
    upsertUser({ ...user, supabaseId: authId, updatedAt: now() });
  }

  const latest = findUserByEmail(normalized) || user;
  const publicUser = toPublicUser(latest);
  const organization =
    latest.role === USER_ROLES.ORG_ADMIN && latest.organizationId
      ? findOrganizationById(latest.organizationId) || null
      : null;

  return {
    user: publicUser,
    organization,
    token: signAuthToken(publicUser),
    hasActivePlan: publicUser.organizationId
      ? isOrgSubscriptionActive(publicUser.organizationId)
      : false,
  };
}

export async function loginSuperAdminAccount(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  const user = findUserByEmail(normalized);

  if (!user || !user.isActive || user.role !== USER_ROLES.SUPER_ADMIN) {
    throw new AppError('Invalid email or password', 401);
  }

  const passwordOk = verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    throw new AppError('Invalid email or password', 401);
  }

  const authId = await ensureSupabaseAuthUser({
    email: normalized,
    password,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    organizationId: null,
    emailConfirm: true,
  });
  if (authId && authId !== user.supabaseId) {
    upsertUser({ ...user, supabaseId: authId, updatedAt: now() });
  }

  const latest = findUserByEmail(normalized) || user;
  const publicUser = toPublicUser(latest);
  return {
    user: publicUser,
    organization: null,
    token: signAuthToken(publicUser),
    hasActivePlan: true,
  };
}

export function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = findUserById(userId);
  if (!user || !user.isActive) {
    throw new AppError('Account not found', 401);
  }
  if (!verifyPassword(currentPassword, user.passwordHash)) {
    throw new AppError('Current password is incorrect', 400);
  }
  if (currentPassword === newPassword) {
    throw new AppError('New password must be different from current password', 400);
  }

  upsertUser({
    ...user,
    passwordHash: hashPassword(newPassword),
    updatedAt: now(),
  });
}

export function getCurrentUser(userId: string) {
  const user = findUserById(userId);
  if (!user || !user.isActive) {
    throw new AppError('Account not found', 401);
  }

  const organization = user.organizationId ? findOrganizationById(user.organizationId) || null : null;
  return {
    user: toPublicUser(user),
    organization,
  };
}

export function listTenants() {
  const users = listUsers();
  const store = readStore();
  return listOrganizations().map((organization) => enrichTenant(organization, users, store));
}

export function getTenantDetail(organizationId: string) {
  const organization = findOrganizationById(organizationId);
  if (!organization) throw new AppError('Organisation not found', 404);
  const users = listUsers();
  const store = readStore();
  const base = enrichTenant(organization, users, store);
  const payments = listOrgSubscriptions(organizationId).map((sub) => ({
    id: sub.id,
    planName: sub.planName,
    months: sub.months,
    priceInr: sub.priceInr,
    status: sub.status,
    paidAt: sub.paidAt,
    startsAt: sub.startsAt,
    endsAt: sub.endsAt,
    invoiceNumber: sub.invoiceNumber,
    paymentMethod: sub.paymentMethod,
  }));
  return { ...base, payments };
}

export function setTenantActive(organizationId: string, isActive: boolean) {
  const organization = findOrganizationById(organizationId);
  if (!organization) throw new AppError('Organisation not found', 404);
  const updated = updateOrganization({
    ...organization,
    isActive,
    updatedAt: now(),
  });
  // Mirror onto org admin + staff accounts
  const stamp = now();
  for (const user of listUsers()) {
    if (user.organizationId === organizationId && user.role !== USER_ROLES.SUPER_ADMIN) {
      upsertUser({ ...user, isActive, updatedAt: stamp });
    }
  }
  return getTenantDetail(updated.id);
}

export function removeTenant(organizationId: string) {
  const organization = findOrganizationById(organizationId);
  if (!organization) throw new AppError('Organisation not found', 404);
  const ok = deleteOrganization(organizationId);
  if (!ok) throw new AppError('Could not delete organisation', 500);
  clearOrgCustomMonthlyPrice(organizationId);
  return { id: organizationId, deleted: true };
}

export function setTenantCustomMonthlyPrice(organizationId: string, monthlyPriceInr: number | null) {
  const organization = findOrganizationById(organizationId);
  if (!organization) throw new AppError('Organisation not found', 404);
  if (monthlyPriceInr !== null) {
    if (!Number.isFinite(monthlyPriceInr) || monthlyPriceInr < 0) {
      throw new AppError('Monthly price is invalid', 400);
    }
  }
  setOrgCustomMonthlyPrice(organizationId, monthlyPriceInr);
  return getTenantDetail(organizationId);
}

export function setTenantCatalogPlanPrice(
  organizationId: string,
  planId: string,
  priceInr: number | null
) {
  const organization = findOrganizationById(organizationId);
  if (!organization) throw new AppError('Organisation not found', 404);
  const plan = listSubscriptionPlans(false).find((p) => p.id === planId);
  if (!plan || plan.months <= 0) throw new AppError('Catalog plan not found', 404);
  if (priceInr !== null) {
    if (!Number.isFinite(priceInr) || priceInr < 0) {
      throw new AppError('Plan price is invalid', 400);
    }
  }
  setOrgCatalogPlanPrice(organizationId, planId, priceInr);
  return getTenantDetail(organizationId);
}

/** Set custom monthly + catalog plan prices for one org in a single save */
export function setTenantPlanPricingBundle(
  organizationId: string,
  input: {
    monthlyPriceInr: number | null;
    planPrices: Record<string, number | null>;
  }
) {
  const organization = findOrganizationById(organizationId);
  if (!organization) throw new AppError('Organisation not found', 404);
  if (input.monthlyPriceInr !== null) {
    if (!Number.isFinite(input.monthlyPriceInr) || input.monthlyPriceInr < 0) {
      throw new AppError('Monthly price is invalid', 400);
    }
  }
  const catalogIds = new Set(
    listSubscriptionPlans(true)
      .filter((p) => p.months > 0)
      .map((p) => p.id)
  );
  for (const [planId, price] of Object.entries(input.planPrices || {})) {
    if (!catalogIds.has(planId)) throw new AppError('Catalog plan not found', 404);
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      throw new AppError('Plan price is invalid', 400);
    }
  }
  setOrgPlanPricingBundle(organizationId, input);
  return getTenantDetail(organizationId);
}

function enrichTenant(
  organization: StoredOrganization,
  users: StoredUser[],
  store: ReturnType<typeof readStore>
) {
  const admin = users.find((item) => item.id === organization.adminUserId);
  const summary = store.staffSummaries[organization.id];
  const visitors = listVisitorsByOrg(organization.id);
  const byDay = new Map<string, number>();
  for (const v of visitors) {
    const d = v.date || indiaDateTime(new Date(v.createdAt)).date;
    byDay.set(d, (byDay.get(d) || 0) + 1);
  }
  const avgVisitorsPerDay = byDay.size ? Math.round((visitors.length / byDay.size) * 10) / 10 : 0;
  const active = getActiveSubscription(organization.id);
  const latest = listOrgSubscriptions(organization.id)[0] || null;
  const plan = active || latest;
  const override = getOrgCustomMonthlyPrice(organization.id);
  const globalMonthly = getCustomPlanSettings().monthlyPriceInr;
  const orgPricing = getOrgPlanPricing(organization.id);
  const catalog = listSubscriptionPlans(true).filter((p) => p.months > 0 && p.priceInr >= 0);
  const catalogPlanPrices = catalog.map((plan) => {
    const orgPrice = orgPricing?.planPrices?.[plan.id];
    return {
      planId: plan.id,
      name: plan.name,
      months: plan.months,
      globalPriceInr: plan.priceInr,
      orgPriceInr: typeof orgPrice === 'number' ? orgPrice : null,
      effectivePriceInr: typeof orgPrice === 'number' ? orgPrice : plan.priceInr,
    };
  });

  return {
    ...organization,
    customMonthlyPriceInr: override,
    effectiveMonthlyPriceInr: override ?? globalMonthly,
    catalogPlanPrices,
    admin: admin
      ? {
          id: admin.id,
          fullName: admin.fullName,
          email: admin.email,
          phone: admin.phone,
          role: admin.role,
        }
      : null,
    subscription: plan
      ? {
          id: plan.id,
          planName: plan.planName,
          months: plan.months,
          priceInr: plan.priceInr,
          status: plan.status,
          paidAt: plan.paidAt,
          startsAt: plan.startsAt,
          endsAt: plan.endsAt,
          invoiceNumber: plan.invoiceNumber,
          isActive: plan.status === 'active' && new Date(plan.endsAt).getTime() > Date.now(),
          msRemaining: Math.max(0, new Date(plan.endsAt).getTime() - Date.now()),
        }
      : null,
    stats: {
      totalRoles: summary?.totalRoles || (store.indexes.roleIdsByOrg[organization.id] || []).length,
      totalStaff: summary?.totalStaff || 0,
      totalActiveStaff: summary?.totalActive || 0,
      totalVisitors: visitors.length,
      avgVisitorsPerDay,
      activeDays: byDay.size,
    },
  };
}
