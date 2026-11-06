import { Router } from 'express';

/** OWNER: Codex. Mounted under /api (user is already authenticated: req.user). */
export function holidayRoutes(_deps) {
  const router = Router();
  // TODO(Codex): list holidays (everyone), add/delete (HOD only).
  router.get('/holidays', (_req, res) => res.json({ items: [] }));
  return router;
}
