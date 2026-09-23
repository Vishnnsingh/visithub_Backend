import Joi from 'joi';
import { isKnownBusinessType } from '../data/businessTypesStore';
import { INDIAN_STATES } from '../utils/constants';

const mobile = Joi.string()
  .trim()
  .pattern(/^[6-9]\d{9}$/)
  .messages({
    'string.pattern.base': 'Enter a valid 10-digit mobile number',
  });

export const loginSchema = Joi.object({
  email: Joi.string().trim().email().lowercase().required(),
  password: Joi.string().min(1).max(72).required(),
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().min(1).max(72).required(),
  newPassword: Joi.string().min(8).max(72).required(),
  confirmPassword: Joi.any().valid(Joi.ref('newPassword')).required().messages({
    'any.only': 'Passwords do not match',
  }),
});

export const registerSchema = Joi.object({
  fullName: Joi.string().trim().min(2).max(80).required(),
  mobileNumber: mobile.required(),
  email: Joi.string().trim().email().lowercase().required(),
  password: Joi.string().min(8).max(72).required(),
  confirmPassword: Joi.any().valid(Joi.ref('password')).required().messages({
    'any.only': 'Passwords do not match',
  }),
  organization: Joi.object({
    name: Joi.string().trim().min(2).max(120).required(),
    businessType: Joi.string()
      .trim()
      .min(1)
      .max(80)
      .required()
      .custom((value, helpers) => {
        if (!isKnownBusinessType(value)) {
          return helpers.error('any.invalid');
        }
        return value;
      })
      .messages({
        'any.invalid': 'Select a valid business type',
      }),
    contactNumber: mobile.required(),
    email: Joi.string().trim().email().lowercase().required(),
    website: Joi.string()
      .trim()
      .uri({ scheme: ['http', 'https'] })
      .allow('', null)
      .optional(),
    addressLine1: Joi.string().trim().min(3).max(120).required(),
    addressLine2: Joi.string().trim().max(120).allow('', null).optional(),
    city: Joi.string().trim().min(2).max(80).required(),
    state: Joi.string()
      .valid(...INDIAN_STATES)
      .required(),
    country: Joi.string().trim().min(2).max(80).default('India'),
    pincode: Joi.string()
      .trim()
      .pattern(/^\d{6}$/)
      .required()
      .messages({
        'string.pattern.base': 'Enter a valid 6-digit pincode',
      }),
  }).required(),
});
