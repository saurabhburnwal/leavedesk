import path from 'node:path';
import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';

/**
 * REST API for leave requests. Routes stay thin: they translate HTTP to service
 * calls; all rules live in LeaveService.
 */
export function leaveRoutes({ leaveService, upload, uploadDir }) {
  const router = Router();
  const ctx = (req) => ({ ip: req.ip });
  const files = (req) => req.files ?? [];

  router.get('/dashboard', (req, res) => {
    res.json(leaveService.dashboard(req.user));
  });

  // ---- Employee: own requests -------------------------------------------
  router.get('/leaves', (req, res) => {
    res.json({ items: leaveService.listMine(req.user, { status: req.query.status }) });
  });

  router.post('/leaves', upload, (req, res) => {
    const leave = leaveService.create(req.user, req.body, files(req), ctx(req));
    res.status(201).location(`/api/leaves/${leave.id}`).json({ leave });
  });

  router.get('/leaves/:id', (req, res) => {
    res.json({ leave: leaveService.getDetail(req.user, req.params.id) });
  });

  router.patch('/leaves/:id', upload, (req, res) => {
    res.json({ leave: leaveService.update(req.user, req.params.id, req.body, files(req), ctx(req)) });
  });

  router.post('/leaves/:id/cancel', (req, res) => {
    res.json({ leave: leaveService.cancel(req.user, req.params.id, req.body, ctx(req)) });
  });

  router.post('/leaves/:id/respond', upload, (req, res) => {
    res.json({ leave: leaveService.respondToInfoRequest(req.user, req.params.id, req.body, files(req), ctx(req)) });
  });

  router.post('/leaves/:id/documents', upload, (req, res) => {
    res.status(201).json({ leave: leaveService.addDocuments(req.user, req.params.id, files(req), ctx(req)) });
  });

  // ---- Approver actions (Manager / HOD) ----------------------------------
  const approverOnly = requireRole('MANAGER', 'HOD');

  router.get('/approvals/pending', approverOnly, (req, res) => {
    res.json({ items: leaveService.listPendingApprovals(req.user) });
  });

  router.get('/approvals/team', approverOnly, (req, res) => {
    res.json({ items: leaveService.listTeam(req.user, { status: req.query.status }) });
  });

  router.post('/leaves/:id/approve', approverOnly, (req, res) => {
    res.json({ leave: leaveService.approve(req.user, req.params.id, req.body, ctx(req)) });
  });

  router.post('/leaves/:id/reject', approverOnly, (req, res) => {
    res.json({ leave: leaveService.reject(req.user, req.params.id, req.body, ctx(req)) });
  });

  router.post('/leaves/:id/request-info', approverOnly, (req, res) => {
    res.json({ leave: leaveService.requestInfo(req.user, req.params.id, req.body, ctx(req)) });
  });

  // ---- Documents ---------------------------------------------------------
  router.get('/documents/:id', (req, res) => {
    const doc = leaveService.getDocumentForUser(req.user, req.params.id, ctx(req));
    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    const asciiName = doc.originalName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
    res.sendFile(path.join(uploadDir, doc.storedName), {
      headers: {
        'Content-Type': doc.mimeType,
        'Content-Disposition': `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  });

  return router;
}
