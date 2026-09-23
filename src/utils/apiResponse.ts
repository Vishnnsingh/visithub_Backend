import type { Response } from 'express';

interface SuccessPayload<T> {
  success: true;
  message: string;
  data?: T;
}

interface ErrorPayload {
  success: false;
  message: string;
  details?: unknown;
}

export const successResponse = <T>(
  res: Response,
  message: string,
  data: T | null = null,
  statusCode = 200
): Response => {
  const payload: SuccessPayload<T> = { success: true, message };
  if (data !== null) payload.data = data;
  return res.status(statusCode).json(payload);
};

export const errorResponse = (
  res: Response,
  message: string,
  statusCode = 500,
  details: unknown = null
): Response => {
  const payload: ErrorPayload = { success: false, message };
  if (details) payload.details = details;
  return res.status(statusCode).json(payload);
};
