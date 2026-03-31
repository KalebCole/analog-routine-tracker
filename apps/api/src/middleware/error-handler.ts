import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';

// Custom error class for API errors
export class APIError extends Error {
  public statusCode: number;
  public details?: Record<string, string[]>;

  constructor(message: string, statusCode: number = 500, details?: Record<string, string[]>) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

// Common error factory functions
export const NotFoundError = (resource: string) =>
  new APIError(`${resource} not found`, 404);

export const BadRequestError = (message: string, details?: Record<string, string[]>) =>
  new APIError(message, 400, details);

export const ConflictError = (message: string) =>
  new APIError(message, 409);

// Format Zod errors into a more readable structure
function formatZodError(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'root';
    if (!details[path]) {
      details[path] = [];
    }
    details[path].push(issue.message);
  }

  return details;
}

// Error handler middleware — ALWAYS logs, regardless of NODE_ENV
export const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Handle Zod validation errors
  if (err instanceof ZodError) {
    logger.warn({ err, url: req.url, method: req.method }, 'Validation error');
    res.status(400).json({
      error: 'ValidationError',
      message: 'Invalid request data',
      details: formatZodError(err),
    });
    return;
  }

  // Handle custom API errors
  if (err instanceof APIError) {
    const level = err.statusCode >= 500 ? 'error' : 'warn';
    logger[level](
      { err, statusCode: err.statusCode, url: req.url, method: req.method },
      err.message
    );
    res.status(err.statusCode).json({
      error: err.name,
      message: err.message,
      ...(err.details && { details: err.details }),
    });
    return;
  }

  // Unknown errors — always log at error level
  logger.error({ err, url: req.url, method: req.method }, 'Unhandled error');
  res.status(500).json({
    error: 'InternalServerError',
    message: 'An unexpected error occurred',
  });
};
