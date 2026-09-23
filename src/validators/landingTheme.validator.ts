import Joi from 'joi';

export const updateLandingThemeSchema = Joi.object({
  theme: Joi.string().valid('dark', 'light').required(),
});
