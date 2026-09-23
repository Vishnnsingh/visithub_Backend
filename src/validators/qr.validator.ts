import Joi from 'joi';

export const generateQrSchema = Joi.object({
  count: Joi.number().integer().min(1).max(99).required().messages({
    'number.base': 'Enter numbers only',
    'number.min': 'Enter a number from 1 to 99',
    'number.max': 'Enter a number from 1 to 99',
    'any.required': 'Enter how many QR codes to generate',
  }),
});
