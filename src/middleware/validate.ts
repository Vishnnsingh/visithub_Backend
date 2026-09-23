import type { ObjectSchema } from 'joi';
import type { RequestHandler } from 'express';
import AppError from '../utils/AppError';

type RequestProperty = 'body' | 'query' | 'params';

const validate =
  (schema: ObjectSchema, property: RequestProperty = 'body'): RequestHandler =>
  (req, _res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((item) => item.message);
      return next(new AppError('Validation failed', 400, details));
    }

    req[property] = value;
    return next();
  };

export default validate;
