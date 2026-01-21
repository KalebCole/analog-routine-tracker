import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { config } from '../config';

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

// Error handler middleware
export const errorHandler: ErrorRequestHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Log error in development
  if (config.isDevelopment) {
    console.error('Error:', err);
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'Invalid request data',
      details: formatZodError(err),
    });
    return;
  }

  // Handle custom API errors
  if (err instanceof APIError) {
    res.status(err.statusCode).json({
      error: err.name,
      message: err.message,
      ...(err.details && { details: err.details }),
    });
    return;
  }

  // Handle unknown errors
  res.status(500).json({
    error: 'InternalServerError',
    message: config.isDevelopment ? err.message : 'An unexpected error occurred',
  });
};
