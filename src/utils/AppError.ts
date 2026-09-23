export default class AppError extends Error {
  statusCode: number;
  details: string[] | null;
  isOperational: boolean;

  constructor(message: string, statusCode = 500, details: string[] | null = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}
