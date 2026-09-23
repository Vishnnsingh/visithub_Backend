import type { Request } from 'express';
import { successResponse } from '../utils/apiResponse';
import asyncHandler from '../utils/asyncHandler';
import AppError from '../utils/AppError';
import {
  createStaffAccount,
  createStaffRole,
  deleteStaffAccount,
  deleteStaffRole,
  listStaffPage,
  setStaffActive,
  updateStaffAccount,
} from '../services/staff.service';

function orgId(req: Request): string {
  if (!req.user?.organizationId) {
    throw new AppError('Organisation context is required', 403);
  }
  return req.user.organizationId;
}

export const listStaff = asyncHandler(async (req, res) => {
  const query = req.query as { page?: number; limit?: number; roleId?: string };
  const data = listStaffPage(orgId(req), Number(query.page || 1), Number(query.limit || 10), query.roleId || '');
  return successResponse(res, 'Staff loaded', data);
});

export const createRole = asyncHandler(async (req, res) => {
  const data = createStaffRole(orgId(req), req.body);
  return successResponse(res, 'Role created', data, 201);
});

export const removeRole = asyncHandler(async (req, res) => {
  deleteStaffRole(orgId(req), req.params.id);
  return successResponse(res, 'Role deleted');
});

export const createStaff = asyncHandler(async (req, res) => {
  const data = createStaffAccount(orgId(req), req.body);
  return successResponse(res, 'Staff account created', data, 201);
});

export const updateStaff = asyncHandler(async (req, res) => {
  const body = req.body as {
    fullName: string;
    email: string;
    phone: string;
    roleId: string;
    allowedPages: string[];
    password?: string;
  };
  const data = updateStaffAccount(orgId(req), req.params.id, {
    ...body,
    password: body.password || undefined,
  });
  return successResponse(res, 'Staff account updated', data);
});

export const updateStaffStatus = asyncHandler(async (req, res) => {
  const data = setStaffActive(orgId(req), req.params.id, Boolean(req.body.isActive));
  return successResponse(res, data.isActive ? 'Staff activated' : 'Staff deactivated', data);
});

export const removeStaff = asyncHandler(async (req, res) => {
  deleteStaffAccount(orgId(req), req.params.id);
  return successResponse(res, 'Staff account deleted');
});
