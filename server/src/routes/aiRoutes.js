import { Router } from 'express';
import rateLimit from 'express-rate-limit';

/** Optional AI assistance. All features are suggestions; people make every decision. */
export function aiRoutes({ services }) {
  const router = Router();
  const ai = services.aiService;

  // Per-user limit so nobody can burn the shared free API quota.
  const aiLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 30,
    keyGenerator: (req) => `user-${req.user.id}`,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({ error: { code: 'AI_RATE_LIMIT', message: "You've used the AI assistant a lot in the last few minutes. Please wait a bit." } }),
  });

  router.get('/ai/status', (_req, res) => res.json(ai.status()));

  router.post('/ai/leave-suggestion', aiLimiter, async (req, res) => {
    res.json(await ai.suggestLeave(req.user, req.body, { ip: req.ip }));
  });

  router.post('/ai/ask', aiLimiter, async (req, res) => {
    res.json(await ai.askPolicy(req.user, req.body, { ip: req.ip }));
  });

  router.get('/leaves/:id/ai-insight', aiLimiter, async (req, res) => {
    res.json(await ai.approverInsight(req.user, req.params.id, { ip: req.ip }));
  });

  return router;
}
