import type { RequestHandler } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defense (decision D4): requests that change data must come from an allowed web origin.
 * Browsers always send Origin on such requests, so a missing header is rejected too.
 */
export function originCheck(allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    const origin = req.get('origin');
    if (origin && allowed.has(origin)) {
      next();
      return;
    }
    res.status(403).json({ statusCode: 403, error: 'Forbidden', message: 'Origin not allowed' });
  };
}
