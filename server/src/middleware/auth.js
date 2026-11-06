import { AppError } from '../utils/errors.js';

export const SESSION_COOKIE = 'lt_session';

/** Reads the httpOnly session cookie and attaches the signed-in user to `req.user`. */
export function authenticate(authService) {
  return (req, _res, next) => {
    req.user = authService.authenticate(req.cookies?.[SESSION_COOKIE]);
    next();
  };
}

/** Role-based access control guard, e.g. `requireRole('MANAGER', 'HOD')`. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!roles.includes(req.user?.role)) {
      throw AppError.forbidden(`This page is only available to: ${roles.map((r) => r.toLowerCase()).join(', ')}.`);
    }
    next();
  };
}
