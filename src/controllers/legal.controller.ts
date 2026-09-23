import {
  clearLegalPage,
  getLegalPage,
  listLegalPages,
  updateLegalPage,
} from '../data/legalPagesStore';
import AppError from '../utils/AppError';
import { successResponse } from '../utils/apiResponse';
import asyncHandler from '../utils/asyncHandler';

export const getPublicLegalPage = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const page = getLegalPage(slug);
  if (!page) throw new AppError('Page not found', 404);
  return successResponse(res, 'Legal page', page);
});

export const listAdminLegalPages = asyncHandler(async (_req, res) => {
  return successResponse(res, 'Legal pages', { pages: listLegalPages() });
});

export const updateAdminLegalPage = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || req.body.slug || '').trim();
  const title = String(req.body.title || '').trim();
  const body = String(req.body.body ?? '');
  try {
    const page = updateLegalPage(slug, { title, body });
    if (!page) throw new AppError('Page not found', 404);
    return successResponse(res, 'Legal page saved', page);
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : 'Could not save', 400);
  }
});

export const deleteAdminLegalPage = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const page = clearLegalPage(slug);
  if (!page) throw new AppError('Page not found', 404);
  return successResponse(res, 'Legal page content cleared', page);
});
