import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';

/** OWNER: Codex. Mounted under /api (user is already authenticated: req.user). */
export function holidayRoutes({ holidayService }) {
  const router = Router();
  router.get('/holidays', (_req, res) => res.json({ items: holidayService.list() }));
  router.post('/holidays', requireRole('HOD'), (req, res) => {
    const holiday = holidayService.add(req.user, req.body, { ip: req.ip });
    res.status(201).json({ holiday });
  });
  router.delete('/holidays/:id', requireRole('HOD'), (req, res) => {
    res.json({ holiday: holidayService.delete(req.user, req.params.id, { ip: req.ip }) });
  });
  return router;
}
