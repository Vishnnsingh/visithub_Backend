import logger from '../config/logger';
import { findUserByEmail } from './appStore';
import { listSubscriptionPlans } from './plansStore';
import { ensureActivePlanForOrg } from './subscriptionStore';

/** Activate ₹499 / 1-month plan for the DPS test organisation. */
export function seedDemoOrgSubscription() {
  const user = findUserByEmail('vs703252@gmail.com');
  if (!user?.organizationId) {
    logger.warn('Demo org plan skipped — vs703252@gmail.com not found');
    return;
  }
  const plans = listSubscriptionPlans(false);
  const monthPlan =
    plans.find((p) => p.months === 1 && p.priceInr === 499) || plans.find((p) => p.months === 1);
  const record = ensureActivePlanForOrg({
    organizationId: user.organizationId,
    planId: monthPlan?.id || null,
    planName: monthPlan?.name || '1 Month',
    months: 1,
    priceInr: monthPlan?.priceInr ?? 499,
  });
  logger.info(`Demo org plan active for vs703252@gmail.com until ${record.endsAt}`);
}
