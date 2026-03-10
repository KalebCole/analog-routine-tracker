import { Request, Response, NextFunction } from 'express';

/**
 * Bearer token authentication middleware.
 * Checks for API_AUTH_TOKEN env var. If not set, auth is disabled (dev mode).
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = process.env.API_AUTH_TOKEN;

  // If no token configured, skip auth (development)
  if (!token) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid Authorization header' });
    return;
  }

  const provided = authHeader.slice(7);
  if (provided !== token) {
    res.status(403).json({ error: 'Forbidden', message: 'Invalid token' });
    return;
  }

  next();
}
