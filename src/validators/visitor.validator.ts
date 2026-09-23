import Joi from 'joi';

export const meetingStatusSchema = Joi.object({
  name: Joi.string().trim().min(1).max(80).required(),
  status: Joi.string().valid('yes', 'no', 'soon').required(),
  date: Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const meetingPersonSchema = Joi.object({
  name: Joi.string().trim().min(1).max(80).required(),
});

export const visitorRatingSchema = Joi.object({
  rating: Joi.number().integer().min(1).max(5).required(),
});

export const googleSignInSchema = Joi.object({
  credential: Joi.string().trim().min(20).required(),
});

export const googleResumeSchema = Joi.object({
  email: Joi.string().trim().email().lowercase().required(),
  googleToken: Joi.string().trim().min(20).required(),
});

export const googleReturningSchema = Joi.object({
  email: Joi.string().trim().email().lowercase().required(),
});

export const phoneStartSchema = Joi.object({
  mobileNumber: Joi.string().trim().allow('').optional(),
});

export const visitorPushSchema = Joi.object({
  endpoint: Joi.string().uri().required(),
  keys: Joi.object({
    p256dh: Joi.string().trim().min(10).required(),
    auth: Joi.string().trim().min(8).required(),
  }).required(),
});

export const ticketActionSchema = Joi.object({
  action: Joi.string().valid('wait', 'yes', 'no', 'close').required(),
  minutes: Joi.number().integer().min(1).max(180).when('action', {
    is: 'wait',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
});

export const ticketSettingsSchema = Joi.object({
  defaultWaitMinutes: Joi.number().integer().min(1).max(180).allow(null).required(),
});

export const ticketWaitAllSchema = Joi.object({
  waitMinutes: Joi.number().integer().min(1).max(180).allow(null).required(),
});

export const visitorFieldsSchema = Joi.object({
  fields: Joi.array()
    .items(
      Joi.object({
        key: Joi.string().trim().min(1).max(40).required(),
        label: Joi.string().trim().min(1).max(80).required(),
        showOnWebApp: Joi.boolean().required(),
        type: Joi.string().trim().valid('text', 'tel', 'textarea', 'number', 'alpha', 'mix', 'upload', 'photo', 'date', 'time', 'signature').optional(),
        custom: Joi.boolean().optional(),
        stage: Joi.string().valid('checkin', 'checkout').optional(),
        required: Joi.boolean().optional(),
      })
    )
    .min(1)
    .max(40)
    .required(),
  continueWith: Joi.object({
    google: Joi.boolean().required(),
    number: Joi.boolean().required(),
  }).optional(),
});
