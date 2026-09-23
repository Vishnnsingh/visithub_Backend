import Joi from 'joi';
import { WEEK_DAYS } from '../services/org.service';

const time = Joi.string()
  .pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
  .messages({ 'string.pattern.base': 'Enter a valid time' });

export const websiteSchema = Joi.object({
  website: Joi.string().trim().uri({ scheme: ['http', 'https'] }).required(),
});

export const googleReviewSchema = Joi.object({
  enabled: Joi.boolean().optional(),
  syncFromWebsite: Joi.boolean().optional(),
  url: Joi.string().trim().uri({ scheme: ['http', 'https'] }).optional().allow('', null),
}).or('enabled', 'url', 'syncFromWebsite');

export const workingDaysSchema = Joi.object({
  days: Joi.array()
    .items(Joi.string().valid(...WEEK_DAYS))
    .min(1)
    .required(),
});

export const openingTimeSchema = Joi.object({
  time: time.required(),
});

export const closingTimeSchema = Joi.object({
  time: time.required(),
});

const textStyleSchema = Joi.object({
  fontSize: Joi.number().integer().min(10).max(40).required(),
  fontWeight: Joi.string().valid('normal', 'semibold', 'bold').required(),
  fontStyle: Joi.string().valid('normal', 'italic').required(),
  fontFamily: Joi.string()
    .valid(
      'Plus Jakarta Sans',
      'Inter',
      'Roboto',
      'Open Sans',
      'Lato',
      'Montserrat',
      'Poppins',
      'Nunito',
      'Raleway',
      'Ubuntu',
      'Source Sans 3',
      'Work Sans',
      'DM Sans',
      'Manrope',
      'Outfit',
      'Rubik',
      'Mulish',
      'Josefin Sans',
      'Playfair Display',
      'Merriweather',
      'Lora',
      'Libre Baskerville',
      'Cormorant Garamond',
      'Bebas Neue',
      'Oswald',
      'Space Grotesk',
      'Pacifico',
      'Dancing Script'
    )
    .required(),
  color: Joi.string()
    .pattern(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    .required(),
  align: Joi.string().valid('left', 'center', 'right').required(),
  rotate: Joi.number().integer().min(-45).max(45).required(),
  curve: Joi.string().valid('none', 'up', 'down').required(),
  decoration: Joi.string().valid('none', 'underline', 'line-through').required(),
  letterSpacing: Joi.number().integer().min(0).max(16).required(),
  textTransform: Joi.string().valid('none', 'uppercase', 'lowercase', 'capitalize').required(),
});

export const homeElementSchema = Joi.object({
  bgTheme: Joi.string().valid('default', 'mint', 'blossom', 'lavender', 'peach', 'sky', 'citrus').required(),
  meetingBoardEnabled: Joi.boolean().optional(),
  homeSlotOrder: Joi.array()
    .items(Joi.string().valid('meetingBoard', 'googleReview', 'cards'))
    .min(1)
    .max(3)
    .optional(),
  cards: Joi.array()
    .items(
      Joi.object({
        id: Joi.string().trim().required(),
        enabled: Joi.boolean().required(),
        frame: Joi.string().valid('card', 'round', 'circle', 'plain').required(),
        blocks: Joi.array()
          .items(
            Joi.alternatives().try(
              Joi.object({
                id: Joi.string().trim().required(),
                kind: Joi.string().valid('heading', 'subtitle', 'paragraph').required(),
                enabled: Joi.boolean().required(),
                text: Joi.string().trim().allow('').max(500).required(),
                style: textStyleSchema.required(),
                spaceTop: Joi.number().integer().min(0).max(48).required(),
                spaceBottom: Joi.number().integer().min(0).max(48).required(),
                maxWords: Joi.number().integer().min(1).max(100).required(),
              }),
              Joi.object({
                id: Joi.string().trim().required(),
                kind: Joi.string().valid('image').required(),
                enabled: Joi.boolean().required(),
                source: Joi.string().valid('upload', 'url').optional(),
                file: Joi.string().trim().optional().allow('', null),
                url: Joi.string().trim().max(500).optional().allow('', null),
                spaceTop: Joi.number().integer().min(0).max(48).required(),
                spaceBottom: Joi.number().integer().min(0).max(48).required(),
              }),
              Joi.object({
                id: Joi.string().trim().required(),
                kind: Joi.string().valid('links').required(),
                enabled: Joi.boolean().required(),
                iconStyle: Joi.string().valid('filled', 'outline', 'soft', 'minimal').required(),
                spaceTop: Joi.number().integer().min(0).max(48).required(),
                spaceBottom: Joi.number().integer().min(0).max(48).required(),
                items: Joi.array()
                  .items(
                    Joi.object({
                      id: Joi.string().trim().required(),
                      platform: Joi.string()
                        .valid(
                          'instagram',
                          'facebook',
                          'whatsapp',
                          'youtube',
                          'linkedin',
                          'twitter',
                          'x',
                          'custom'
                        )
                        .required(),
                      url: Joi.string().trim().allow('').max(500).required(),
                      label: Joi.string().trim().allow('').max(40).required(),
                      enabled: Joi.boolean().required(),
                    })
                  )
                  .max(5)
                  .required(),
              })
            )
          )
          .required(),
      })
    )
    .min(1)
    .required(),
});

export const meetingBoardSchema = Joi.object({
  enabled: Joi.boolean().required(),
});

export const homeSlotOrderSchema = Joi.object({
  order: Joi.array()
    .items(Joi.string().valid('meetingBoard', 'googleReview', 'cards'))
    .min(1)
    .max(3)
    .required(),
});
