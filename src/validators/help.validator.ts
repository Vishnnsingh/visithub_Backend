import Joi from 'joi';

export const createHelpSchema = Joi.object({
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
