import { successResponse } from '../utils/apiResponse';
import asyncHandler from '../utils/asyncHandler';
import AppError from '../utils/AppError';
import { getLandingTheme, setLandingTheme, type LandingThemeMode } from '../data/landingThemeStore';

export const getPublicLandingTheme = asyncHandler(async (_req, res) => {
  return successResponse(res, 'Landing theme', getLandingTheme());
});

export const updateAdminLandingTheme = asyncHandler(async (req, res) => {
  const theme = String(req.body.theme || '').trim() as LandingThemeMode;
  if (theme !== 'dark' && theme !== 'light') {
    throw new AppError('Theme must be dark or light', 400);
  }
  return successResponse(res, 'Landing theme updated', setLandingTheme(theme));
});
