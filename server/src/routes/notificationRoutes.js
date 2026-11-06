import { Router } from 'express';

/** OWNER: Copilot. Mounted under /api (user is already authenticated: req.user). */
export function notificationRoutes(_deps) {
  const router = Router();
  // TODO(Copilot): list, unread count, mark read, mark all read.
  router.get('/notifications', (_req, res) => res.json({ items: [], unread: 0 }));
  return router;
}
