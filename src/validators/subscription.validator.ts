import Joi from 'joi';

export const purchaseSubscriptionSchema = Joi.object({
  planId: Joi.string().trim().allow(null, '').optional(),
  months: Joi.number().integer().min(1).max(60).required(),
  planName: Joi.string().trim().min(1).max(80).optional(),
  priceInr: Joi.number().min(0).max(10_000_000).optional(),
});
