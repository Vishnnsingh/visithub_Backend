import type { RequestHandler } from 'express';
import AppError from '../utils/AppError';
import { isOrgSubscriptionActive } from '../data/subscriptionStore';
import { USER_ROLES } from '../utils/constants';

/**
 * Blocks org_admin / staff workspace access when the organisation plan is expired.
 * Super admin is never blocked. Call after authenticate.
 */
export const requireActiveSubscription: RequestHandler = (req, _res, next) => {
  const user = req.user;
  if (!user) return next(new AppError('Authentication required', 401));
  if (user.role === USER_ROLES.SUPER_ADMIN) return next();

  const orgId = user.organizationId;
  if (!orgId) {
    return next(
      new AppError('No organisation linked to this account. Purchase a plan to activate access.', 402)
    );
  }

  if (!isOrgSubscriptionActive(orgId)) {
    return next(
      new AppError(
        'Your organisation plan has expired. Please purchase a plan to reactivate dashboard access.',
        402
      )
    );
  }

  return next();
};

export default requireActiveSubscription;
