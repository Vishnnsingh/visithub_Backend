import Joi from 'joi';

export const createContactSchema = Joi.object({
  name: Joi.string().trim().min(2).max(80).required(),
  email: Joi.string().trim().email().required(),
  mobile: Joi.string()
    .trim()
    .pattern(/^[0-9+\-\s]{8,15}$/)
    .required()
    .messages({
      'string.pattern.base': 'Enter a valid mobile number',
    }),
  message: Joi.string().trim().min(5).max(2000).required(),
});

export const updateContactInfoSchema = Joi.object({
  email: Joi.string().trim().email().required(),
  phone: Joi.string().trim().min(8).max(20).required(),
  address: Joi.string().trim().min(3).max(300).required(),
  mapUrl: Joi.string().trim().allow('').max(2000).optional(),
  mapActive: Joi.boolean().required(),
});
