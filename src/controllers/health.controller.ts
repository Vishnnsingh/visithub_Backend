import env from '../config/env';
import { successResponse } from '../utils/apiResponse';
import asyncHandler from '../utils/asyncHandler';

export const hello = asyncHandler(async (_req, res) => {
  return successResponse(res, 'Hello from Restrorent API', {
    app: env.APP_NAME,
    env: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});
