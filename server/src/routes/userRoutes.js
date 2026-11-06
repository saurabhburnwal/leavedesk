import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';

/** OWNER: Claude. Team management: the HOD promotes employees and changes reporting managers. */
export function userRoutes({ services }) {
  const router = Router();
  const hodOnly = requireRole('HOD');

  router.get('/users/team', hodOnly, (req, res) => {
    res.json(services.teamService.list(req.user));
  });

  router.patch('/users/:id', hodOnly, (req, res) => {
    res.json(services.teamService.update(req.user, req.params.id, req.body, { ip: req.ip }));
  });

  return router;
}
