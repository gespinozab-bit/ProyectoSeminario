import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

import { logger } from '../lib/logger.js';

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = 'REQUEST_ERROR',
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, `Route ${req.method} ${req.originalUrl} not found`));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  void _next;
  const isValidationError = error instanceof ZodError;
  const statusCode = isValidationError ? 400 : error instanceof HttpError ? error.statusCode : 500;
  const message = isValidationError
    ? 'Invalid request data'
    : error instanceof Error
      ? error.message
      : 'Unexpected error';
  const code = isValidationError
    ? 'VALIDATION_ERROR'
    : error instanceof HttpError
      ? error.code
      : 'INTERNAL_ERROR';

  logger.error({ err: error, method: req.method, path: req.originalUrl }, message);
  res.status(statusCode).json({
    error: statusCode === 500 ? 'Internal server error' : message,
    code,
    ...(isValidationError
      ? {
          issues: error.issues.map(({ path, message: issue }) => ({ path: path.join('.'), issue })),
        }
      : {}),
  });
};
