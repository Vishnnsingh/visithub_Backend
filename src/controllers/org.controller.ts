import type { Request } from 'express';
import { successResponse } from '../utils/apiResponse';
import asyncHandler from '../utils/asyncHandler';
import AppError from '../utils/AppError';
import {
  clearClosingTime,
  clearLogo,
  clearOpeningTime,
  clearWebsite,
  clearWelcomeImage,
  clearWorkingDays,
  clearGoogleReviewUrl,
  getPresence,
  setClosingTime,
  setGoogleReviewEnabled,
  setGoogleReviewUrl,
  syncGoogleReviewFromWebsite,
  setLogo,
  setOpeningTime,
  setWebsite,
  setWelcomeImage,
  setWorkingDays,
} from '../services/org.service';
import {
  addOrgHomeImages,
  deleteOrgHomeImage,
  getOrgHomeElement,
  setOrgHomeSlotOrder,
  setOrgMeetingBoardEnabled,
  updateOrgHomeElement,
} from '../services/homeElement.service';

function orgId(req: Request): string {
  if (!req.user?.organizationId) throw new AppError('Organisation context is required', 403);
  return req.user.organizationId;
}

export const getOrgPresence = asyncHandler(async (req, res) => {
  return successResponse(res, 'Organisation presence loaded', getPresence(orgId(req)));
});

export const updateWebsite = asyncHandler(async (req, res) => {
  return successResponse(res, 'Website saved', setWebsite(orgId(req), req.body.website));
});

export const deleteWebsite = asyncHandler(async (req, res) => {
  return successResponse(res, 'Website removed', clearWebsite(orgId(req)));
});

export const updateGoogleReview = asyncHandler(async (req, res) => {
  if (req.body?.syncFromWebsite === true) {
    return successResponse(
      res,
      'Google Review linked from organisation website',
      await syncGoogleReviewFromWebsite(orgId(req))
    );
  }
  const hasUrl = Object.prototype.hasOwnProperty.call(req.body, 'url');
  const hasEnabled = Object.prototype.hasOwnProperty.call(req.body, 'enabled');
  if (hasUrl) {
    const raw = String(req.body.url || '').trim();
    if (!raw) {
      return successResponse(res, 'Google Review link removed', clearGoogleReviewUrl(orgId(req)));
    }
    return successResponse(res, 'Google Review link saved', await setGoogleReviewUrl(orgId(req), raw));
  }
  if (hasEnabled) {
    return successResponse(
      res,
      'Google Review updated',
      setGoogleReviewEnabled(orgId(req), Boolean(req.body.enabled))
    );
  }
  throw new AppError('Google Review url or enabled is required', 400);
});

export const updateWorkingDays = asyncHandler(async (req, res) => {
  return successResponse(res, 'Working days saved', setWorkingDays(orgId(req), req.body.days));
});

export const deleteWorkingDays = asyncHandler(async (req, res) => {
  return successResponse(res, 'Working days removed', clearWorkingDays(orgId(req)));
});

export const updateOpeningTime = asyncHandler(async (req, res) => {
  return successResponse(res, 'Opening time saved', setOpeningTime(orgId(req), req.body.time));
});

export const deleteOpeningTime = asyncHandler(async (req, res) => {
  return successResponse(res, 'Opening time removed', clearOpeningTime(orgId(req)));
});

export const updateClosingTime = asyncHandler(async (req, res) => {
  return successResponse(res, 'Closing time saved', setClosingTime(orgId(req), req.body.time));
});

export const deleteClosingTime = asyncHandler(async (req, res) => {
  return successResponse(res, 'Closing time removed', clearClosingTime(orgId(req)));
});

export const updateLogo = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) throw new AppError('Choose a logo image', 400);
  return successResponse(res, 'Logo saved', setLogo(orgId(req), file.filename), 201);
});

export const deleteLogo = asyncHandler(async (req, res) => {
  return successResponse(res, 'Logo removed', clearLogo(orgId(req)));
});

export const updateWelcomeImage = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) throw new AppError('Choose a welcome image', 400);
  return successResponse(res, 'Welcome image saved', setWelcomeImage(orgId(req), file.filename), 201);
});

export const deleteWelcomeImage = asyncHandler(async (req, res) => {
  return successResponse(res, 'Welcome image removed', clearWelcomeImage(orgId(req)));
});

export const getHomeElement = asyncHandler(async (req, res) => {
  return successResponse(res, 'Home element loaded', getOrgHomeElement(orgId(req)));
});

export const updateHomeElement = asyncHandler(async (req, res) => {
  return successResponse(res, 'Home element saved', updateOrgHomeElement(orgId(req), req.body));
});

export const updateMeetingBoard = asyncHandler(async (req, res) => {
  return successResponse(
    res,
    'Meeting board updated',
    setOrgMeetingBoardEnabled(orgId(req), Boolean(req.body.enabled))
  );
});

export const updateHomeSlotOrder = asyncHandler(async (req, res) => {
  return successResponse(res, 'Home order updated', setOrgHomeSlotOrder(orgId(req), req.body.order));
});

export const uploadHomeElementImages = asyncHandler(async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) || [];
  if (!files.length) throw new AppError('Choose an image to upload', 400);
  const cardId = typeof req.body?.cardId === 'string' ? req.body.cardId : null;
  return successResponse(
    res,
    'Images uploaded',
    addOrgHomeImages(
      orgId(req),
      files.map((file) => file.filename),
      cardId
    ),
    201
  );
});

export const removeHomeElementImage = asyncHandler(async (req, res) => {
  return successResponse(res, 'Image removed', deleteOrgHomeImage(orgId(req), String(req.params.id)));
});
