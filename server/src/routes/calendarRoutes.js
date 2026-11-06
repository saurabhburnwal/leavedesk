import { Router } from 'express';
import { AppError } from '../utils/errors.js';
import { buildLeaveIcs } from '../utils/ics.js';

/** "Add to calendar": downloads an approved leave as an .ics file (Google/Outlook/Apple Calendar). */
export function calendarRoutes({ services }) {
  const router = Router();

  router.get('/leaves/:id/calendar.ics', (req, res) => {
    const leave = services.leaveService.getDetail(req.user, req.params.id); // enforces permissions (404)
    if (leave.status !== 'APPROVED') throw AppError.conflict('Only approved leave can be added to a calendar.');
    res.type('text/calendar; charset=utf-8').attachment(`leave-${leave.id}.ics`).send(buildLeaveIcs(leave));
  });

  return router;
}
