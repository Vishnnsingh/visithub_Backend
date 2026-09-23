import { addContactMessage, listContactMessages } from '../data/contactStore';
import { getContactInfo, setContactInfo } from '../data/contactInfoStore';
import { successResponse } from '../utils/apiResponse';
import asyncHandler from '../utils/asyncHandler';
import AppError from '../utils/AppError';

export const submitContact = asyncHandler(async (req, res) => {
  const { name, email, mobile, message } = req.body as {
    name: string;
    email: string;
    mobile: string;
    message: string;
  };
  if (!name?.trim() || !email?.trim() || !mobile?.trim() || !message?.trim()) {
    throw new AppError('All fields are required', 400);
  }
  const record = addContactMessage({ name, email, mobile, message });
  return successResponse(res, 'Message received. We will get back to you shortly.', record, 201);
});

export const listAdminContacts = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  return successResponse(res, 'Contact messages', listContactMessages(page, limit));
});

export const getPublicContactInfo = asyncHandler(async (_req, res) => {
  return successResponse(res, 'Contact info', getContactInfo());
});

export const updateAdminContactInfo = asyncHandler(async (req, res) => {
  const body = req.body as {
    email: string;
    phone: string;
    address: string;
    mapUrl?: string;
    mapActive: boolean;
  };
  const saved = await setContactInfo(body);
  return successResponse(res, 'Contact info updated', saved);
});
