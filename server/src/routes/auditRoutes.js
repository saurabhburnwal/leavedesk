import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';

export function auditRoutes({ audit }) {
  const router = Router();

  // Recomputes the audit hash chain: proves no entry was edited or deleted.
  router.get('/audit-logs/verify', requireRole('HOD'), (_req, res) => {
    res.json({ ...audit.verifyIntegrity(), verifiedAt: new Date().toISOString() });
  });

  // HODs can review the audit trail of their department.
  router.get('/audit-logs', requireRole('HOD'), (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const action = typeof req.query.action === 'string' && req.query.action ? req.query.action : undefined;
    res.json({
      ...audit.listForDepartment(req.user.departmentId, { action, limit, offset }),
      actions: audit.distinctActions(),
    });
  });

  return router;
}
