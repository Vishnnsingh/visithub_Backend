import type { Request } from 'express';
import { successResponse } from '../utils/apiResponse';
import asyncHandler from '../utils/asyncHandler';
import AppError from '../utils/AppError';
import {
  attachOrgSession,
  attachSuperSession,
  changePassword,
  clearOrgSession,
  clearSuperSession,
  getCurrentUser,
  getTenantDetail,
  listTenants,
  loginAccount,
  loginSuperAdminAccount,
  readCookieToken,
  registerAccount,
  removeTenant,
  setTenantActive,
  setTenantCatalogPlanPrice,
  setTenantCustomMonthlyPrice,
  setTenantPlanPricingBundle,
  toPublicUser,
} from '../services/auth.service';
import { verifyAuthToken } from '../utils/token';
import { findUserById } from '../data/appStore';
import { USER_ROLES } from '../utils/constants';

export const register = asyncHandler(async (req, res) => {
  const data = await registerAccount(req.body);
  const token = attachOrgSession(res, data.user);
  return successResponse(res, 'Account created successfully', { ...data, token }, 201);
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  const data = await loginAccount(email, password);
  const token = attachOrgSession(res, data.user);
  return successResponse(res, 'Logged in successfully', { ...data, token });
});

export const superLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  const data = await loginSuperAdminAccount(email, password);
  const token = attachSuperSession(res, data.user);
  return successResponse(res, 'Logged in successfully', { ...data, token });
});

export const me = asyncHandler(async (req, res) => {
  if (!req.user) throw new AppError('Authentication required', 401);
  const data = getCurrentUser(req.user.id);
  return successResponse(res, 'Session loaded', data);
});

export const logout = asyncHandler(async (req, res) => {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearer || readCookieToken(req, 'org');
  let role: string | null = null;
  if (token) {
    const payload = verifyAuthToken(token);
    if (payload?.id) {
      const stored = findUserById(payload.id);
      if (stored) role = toPublicUser(stored).role;
    }
  }
  // Only clear the matching role cookie so the other tab's session survives
  clearOrgSession(res, role);
  return successResponse(res, 'Logged out successfully');
});

export const superLogout = asyncHandler(async (_req, res) => {
  clearSuperSession(res);
  return successResponse(res, 'Logged out successfully');
});

export const tenants = asyncHandler(async (req: Request, res) => {
  if (req.user?.role !== USER_ROLES.SUPER_ADMIN) {
    throw new AppError('Forbidden', 403);
  }
  return successResponse(res, 'Tenants loaded', listTenants());
});

export const tenantDetail = asyncHandler(async (req: Request, res) => {
  if (req.user?.role !== USER_ROLES.SUPER_ADMIN) {
    throw new AppError('Forbidden', 403);
  }
  const id = String(req.params.id || '');
  return successResponse(res, 'Tenant detail', getTenantDetail(id));
});

export const deactivateTenant = asyncHandler(async (req: Request, res) => {
  if (req.user?.role !== USER_ROLES.SUPER_ADMIN) {
    throw new AppError('Forbidden', 403);
  }
  const id = String(req.params.id || '');
  const body = req.body as { isActive?: boolean };
  const isActive = body.isActive === true;
  return successResponse(
    res,
    isActive ? 'Organisation activated' : 'Organisation deactivated',
    setTenantActive(id, isActive)
  );
});

export const deleteTenant = asyncHandler(async (req: Request, res) => {
  if (req.user?.role !== USER_ROLES.SUPER_ADMIN) {
    throw new AppError('Forbidden', 403);
  }
  const id = String(req.params.id || '');
  return successResponse(res, 'Organisation deleted', removeTenant(id));
});

export const updateTenantCustomMonthlyPrice = asyncHandler(async (req: Request, res) => {
  if (req.user?.role !== USER_ROLES.SUPER_ADMIN) {
    throw new AppError('Forbidden', 403);
  }
  const id = String(req.params.id || '');
  const body = req.body as { monthlyPriceInr?: number | null; useGlobal?: boolean };
  const useGlobal = body.useGlobal === true || body.monthlyPriceInr === null;
  const price = useGlobal ? null : Number(body.monthlyPriceInr);
  if (!useGlobal && (!Number.isFinite(price) || (price as number) < 0)) {
    throw new AppError('Monthly price is invalid', 400);
  }
  const detail = setTenantCustomMonthlyPrice(id, useGlobal ? null : (price as number));
  return successResponse(res, 'Organisation custom monthly price saved', detail);
});

export const updateTenantCatalogPlanPrice = asyncHandler(async (req: Request, res) => {
  if (req.user?.role !== USER_ROLES.SUPER_ADMIN) {
    throw new AppError('Forbidden', 403);
  }
  const id = String(req.params.id || '');
  const body = req.body as {
    planId?: string;
    priceInr?: number | null;
    useGlobal?: boolean;
  };
  const planId = String(body.planId || '').trim();
  if (!planId) throw new AppError('Plan is required', 400);
  const useGlobal = body.useGlobal === true || body.priceInr === null;
  const price = useGlobal ? null : Number(body.priceInr);
  if (!useGlobal && (!Number.isFinite(price) || (price as number) < 0)) {
    throw new AppError('Plan price is invalid', 400);
  }
  const detail = setTenantCatalogPlanPrice(id, planId, useGlobal ? null : (price as number));
  return successResponse(res, 'Organisation plan price saved', detail);
});

export const updateTenantPlanPricingBundle = asyncHandler(async (req: Request, res) => {
  if (req.user?.role !== USER_ROLES.SUPER_ADMIN) {
    throw new AppError('Forbidden', 403);
  }
  const id = String(req.params.id || '');
  const body = req.body as {
    monthlyPriceInr?: number | null;
    useGlobalMonthly?: boolean;
    planPrices?: Record<string, number | null>;
  };
  const useGlobalMonthly = body.useGlobalMonthly === true || body.monthlyPriceInr === null;
  const monthly = useGlobalMonthly ? null : Number(body.monthlyPriceInr);
  if (!useGlobalMonthly && (!Number.isFinite(monthly) || (monthly as number) < 0)) {
    throw new AppError('Monthly price is invalid', 400);
  }
  const planPrices: Record<string, number | null> = {};
  if (body.planPrices && typeof body.planPrices === 'object') {
    for (const [planId, value] of Object.entries(body.planPrices)) {
      if (value === null || value === undefined || value === ('' as unknown)) {
        planPrices[planId] = null;
      } else {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) throw new AppError('Plan price is invalid', 400);
        planPrices[planId] = n;
      }
    }
  }
  const detail = setTenantPlanPricingBundle(id, {
    monthlyPriceInr: useGlobalMonthly ? null : (monthly as number),
    planPrices,
  });
  return successResponse(res, 'Organisation plan pricing saved', detail);
});

export const dashboard = asyncHandler(async (req: Request, res) => {
  if (!req.user) throw new AppError('Authentication required', 401);
  const data = getCurrentUser(req.user.id);
  return successResponse(res, 'Dashboard loaded', data);
});

export const updatePassword = asyncHandler(async (req: Request, res) => {
  if (!req.user) throw new AppError('Authentication required', 401);
  const { currentPassword, newPassword } = req.body as {
    currentPassword: string;
    newPassword: string;
  };
  changePassword(req.user.id, currentPassword, newPassword);
  return successResponse(res, 'Password updated successfully');
});
