import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

type ValidationTarget = 'body' | 'params' | 'query';

interface ValidateOptions {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

/**
 * Middleware factory that validates request body, params, and/or query against Zod schemas.
 * Validated and transformed data is attached back to the request object.
 */
export function validate(schemas: ValidateOptions) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const errors: { target: ValidationTarget; error: ZodError }[] = [];

    // Validate body
    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        errors.push({ target: 'body', error: result.error });
      } else {
        req.body = result.data;
      }
    }

    // Validate params
    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        errors.push({ target: 'params', error: result.error });
      } else {
        req.params = result.data;
      }
    }

    // Validate query
    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        errors.push({ target: 'query', error: result.error });
      } else {
        req.query = result.data;
      }
    }

    // If any validation errors, combine them into a single ZodError
    if (errors.length > 0) {
      const combinedIssues = errors.flatMap(({ target, error }) =>
        error.issues.map((issue) => ({
          ...issue,
          path: [target, ...issue.path],
        }))
      );

      next(new ZodError(combinedIssues));
      return;
    }

    next();
  };
}
