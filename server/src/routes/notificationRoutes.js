import { Router } from 'express';
import { AppError } from '../utils/errors.js';

/** OWNER: Copilot. Mounted under /api (user is already authenticated: req.user). */
export function notificationRoutes({ services }) {
  const router = Router();
  const repository = services.notificationRepository;

  router.get('/notifications', (req, res) => {
    const parsed = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 50) : 20;
    res.json({ items: repository.listForUser(req.user.id, limit), unread: repository.countUnread(req.user.id) });
  });

  router.post('/notifications/:id/read', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || !repository.markRead(id, req.user.id)) {
      throw AppError.notFound("That notification doesn't exist.");
    }
    res.json({ ok: true });
  });

  router.post('/notifications/read-all', (req, res) => {
    repository.markAllRead(req.user.id);
    res.json({ ok: true });
  });

  return router;
}
