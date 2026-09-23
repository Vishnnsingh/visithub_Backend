import Joi from 'joi';

const mobile = Joi.string()
  .trim()
  .pattern(/^[6-9]\d{9}$/)
  .messages({
    'string.pattern.base': 'Enter a valid 10-digit mobile number',
  });

export const createRoleSchema = Joi.object({
  name: Joi.string().trim().min(2).max(40).required().messages({
    'string.min': 'Enter a role name',
  }),
});

export const createStaffSchema = Joi.object({
  fullName: Joi.string().trim().min(2).max(80).required(),
  email: Joi.string().trim().email().lowercase().required(),
  phone: mobile.required(),
  password: Joi.string().min(8).max(72).required(),
  roleId: Joi.string().trim().min(1).required().messages({
    'any.required': 'Select a role',
    'string.min': 'Select a role',
  }),
  allowedPages: Joi.array()
    .items(
      Joi.string().valid(
        '/admin',
        '/dashboard',
        '/plan',
        '/organisation',
        '/qr-codes',
        '/visitor-details',
        '/tickets',
        '/notifications',
        '/home-element',
        '/active-fields'
      )
    )
    .min(1)
    .required()
    .messages({
      'array.min': 'Select at least one dashboard page',
    }),
});

export const updateStaffSchema = Joi.object({
  fullName: Joi.string().trim().min(2).max(80).required(),
  email: Joi.string().trim().email().lowercase().required(),
  phone: mobile.required(),
  roleId: Joi.string().trim().min(1).required(),
  password: Joi.string().min(8).max(72).allow('', null).optional(),
  allowedPages: Joi.array()
    .items(
      Joi.string().valid(
        '/admin',
        '/dashboard',
        '/plan',
        '/organisation',
        '/qr-codes',
        '/visitor-details',
        '/tickets',
        '/notifications',
        '/home-element',
        '/active-fields'
      )
    )
    .min(1)
    .required()
    .messages({
      'array.min': 'Select at least one dashboard page',
    }),
});

export const staffStatusSchema = Joi.object({
  isActive: Joi.boolean().required(),
});

export const staffListQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(10),
  roleId: Joi.string().trim().allow('', null).optional(),
});
