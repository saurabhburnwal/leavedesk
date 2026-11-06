import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { SESSION_COOKIE } from '../middleware/auth.js';

export function authRoutes({ authService, audit, config }) {
  const router = Router();

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.loginRateLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many sign-in attempts. Please wait a few minutes and try again.' },
      }),
  });

  const cookieOptions = {
    httpOnly: true, // not readable by JavaScript -> protects the token from XSS
    sameSite: 'lax', // not sent on cross-site POSTs -> CSRF protection
    secure: config.cookieSecure,
    path: '/',
  };

  const setSession = (res, token) => res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: config.sessionHours * 60 * 60 * 1000 });

  router.post('/login', loginLimiter, async (req, res) => {
    const { user, token } = await authService.login(req.body, { ip: req.ip });
    setSession(res, token);
    res.json({ user });
  });

  // ---- Self sign-up with email verification ----
  router.get('/register-options', (_req, res) => {
    res.json(authService.registrationOptions());
  });

  router.post('/register', loginLimiter, async (req, res) => {
    res.status(201).json(await authService.register(req.body, { ip: req.ip }));
  });

  router.post('/resend-code', loginLimiter, async (req, res) => {
    res.json(await authService.resendCode(req.body, { ip: req.ip }));
  });

  router.post('/verify', loginLimiter, (req, res) => {
    const { user, token } = authService.verifyEmail(req.body, { ip: req.ip });
    setSession(res, token);
    res.json({ user });
  });

  router.post('/logout', (req, res) => {
    try {
      const user = authService.authenticate(req.cookies?.[SESSION_COOKIE]);
      audit.log({ actor: user, action: 'LOGOUT', entityType: 'USER', entityId: user.id, ip: req.ip });
    } catch {
      // already signed out / expired: nothing to audit
    }
    res.clearCookie(SESSION_COOKIE, cookieOptions);
    res.json({ ok: true });
  });

  // "Who am I?" Returns { user: null } when signed out (not an error: the UI uses it on startup).
  router.get('/me', (req, res) => {
    let user = null;
    try {
      user = authService.authenticate(req.cookies?.[SESSION_COOKIE]);
    } catch {
      if (req.cookies?.[SESSION_COOKIE]) res.clearCookie(SESSION_COOKIE, cookieOptions);
    }
    res.json({ user });
  });

  return router;
}
