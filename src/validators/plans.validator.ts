import Joi from 'joi';

export const createPlanSchema = Joi.object({
  name: Joi.string().trim().min(1).max(80).required(),
  months: Joi.number().integer().min(0).max(120).required(),
  priceInr: Joi.number().integer().min(0).max(10_000_000).required(),
  description: Joi.string().trim().allow('').max(500).optional(),
  features: Joi.array().items(Joi.string().trim().max(120)).max(20).optional(),
  highlighted: Joi.boolean().optional(),
  active: Joi.boolean().optional(),
});

export const updatePlanSchema = Joi.object({
  name: Joi.string().trim().min(1).max(80).optional(),
  months: Joi.number().integer().min(0).max(120).optional(),
  priceInr: Joi.number().integer().min(0).max(10_000_000).optional(),
  description: Joi.string().trim().allow('').max(500).optional(),
  features: Joi.array().items(Joi.string().trim().max(120)).max(20).optional(),
  highlighted: Joi.boolean().optional(),
  active: Joi.boolean().optional(),
  sortOrder: Joi.number().integer().min(0).max(1000).optional(),
}).min(1);

export const invoiceSettingsSchema = Joi.object({
  supportEmail: Joi.string().trim().email().required(),
  supportWebsite: Joi.string().trim().min(3).max(200).required(),
});

export const customPlanSettingsSchema = Joi.object({
  monthlyPriceInr: Joi.number().integer().min(0).max(10_000_000).required(),
  minMonths: Joi.number().integer().min(1).max(120).required(),
  maxMonths: Joi.number().integer().min(1).max(120).required(),
  defaultMonths: Joi.number().integer().min(1).max(120).required(),
});
