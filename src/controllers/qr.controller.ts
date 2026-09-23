import type { Request } from 'express';
import { successResponse } from '../utils/apiResponse';
import asyncHandler from '../utils/asyncHandler';
import AppError from '../utils/AppError';
import { deleteQrCode, generateQrCodes, getQrCode, listQrCodes } from '../services/qr.service';

function orgId(req: Request): string {
  if (!req.user?.organizationId) throw new AppError('Organisation context is required', 403);
  return req.user.organizationId;
}

export const listOrgQrCodes = asyncHandler(async (req, res) => {
  return successResponse(res, 'QR codes loaded', listQrCodes(orgId(req)));
});

export const generateOrgQrCodes = asyncHandler(async (req, res) => {
  return successResponse(res, 'QR codes generated', generateQrCodes(orgId(req), Number(req.body.count)), 201);
});

export const getOrgQrCode = asyncHandler(async (req, res) => {
  return successResponse(res, 'QR code loaded', getQrCode(orgId(req), String(req.params.id)));
});

export const removeOrgQrCode = asyncHandler(async (req, res) => {
  return successResponse(res, 'QR code deleted', deleteQrCode(orgId(req), String(req.params.id)));
});
