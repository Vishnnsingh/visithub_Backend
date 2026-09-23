import {
  addBusinessType,
  clearAllBusinessTypes,
  deleteBusinessType,
  listBusinessTypes,
  updateBusinessType,
} from '../data/businessTypesStore';
import AppError from '../utils/AppError';
import { successResponse } from '../utils/apiResponse';
import asyncHandler from '../utils/asyncHandler';

export const getPublicBusinessTypes = asyncHandler(async (_req, res) => {
  return successResponse(res, 'Business types', { types: listBusinessTypes() });
});

export const getAdminBusinessTypes = asyncHandler(async (_req, res) => {
  return successResponse(res, 'Business types', { types: listBusinessTypes() });
});

export const createAdminBusinessType = asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) throw new AppError('Business type name is required', 400);
  try {
    const types = addBusinessType(name);
    return successResponse(res, 'Business type added', { types }, 201);
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : 'Could not add business type', 400);
  }
});

export const updateAdminBusinessType = asyncHandler(async (req, res) => {
  const oldName = String(req.body.oldName || req.params.name || '').trim();
  const newName = String(req.body.name || req.body.newName || '').trim();
  if (!oldName || !newName) throw new AppError('Business type name is required', 400);
  try {
    const types = updateBusinessType(oldName, newName);
    return successResponse(res, 'Business type updated', { types });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not update business type';
    throw new AppError(message, message.includes('not found') ? 404 : 400);
  }
});

export const deleteAdminBusinessType = asyncHandler(async (req, res) => {
  const name = String(req.body.name || req.query.name || '').trim();
  if (!name) throw new AppError('Business type name is required', 400);
  try {
    const types = deleteBusinessType(name);
    return successResponse(res, 'Business type deleted', { types });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not delete business type';
    throw new AppError(message, message.includes('not found') ? 404 : 400);
  }
});

export const clearAdminBusinessTypes = asyncHandler(async (_req, res) => {
  const types = clearAllBusinessTypes();
  return successResponse(res, 'All business types cleared', { types });
});
