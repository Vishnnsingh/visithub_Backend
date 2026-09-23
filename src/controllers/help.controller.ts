import { addHelpMessage, listHelpMessages } from '../data/helpStore';
import { getContactInfo } from '../data/contactInfoStore';
import { successResponse } from '../utils/apiResponse';
import asyncHandler from '../utils/asyncHandler';
import AppError from '../utils/AppError';

export const submitHelp = asyncHandler(async (req, res) => {
  const { name, email, mobile, message } = req.body as {
    name: string;
    email: string;
    mobile: string;
    message: string;
  };
  if (!name?.trim() || !email?.trim() || !mobile?.trim() || !message?.trim()) {
    throw new AppError('All fields are required', 400);
  }
  const record = addHelpMessage({ name, email, mobile, message });
  const info = getContactInfo();
  return successResponse(
    res,
    'We will connect with you soon.',
    {
      ...record,
      supportEmail: info.email,
      supportPhone: info.phone,
    },
    201
  );
});

export const listAdminHelp = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  return successResponse(res, 'Help messages', listHelpMessages(page, limit));
});
