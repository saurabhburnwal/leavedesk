import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { UserRepository } from './repositories/UserRepository.js';
import { LeaveRepository } from './repositories/LeaveRepository.js';
import { HolidayRepository } from './repositories/HolidayRepository.js';
import { ActionRepository } from './repositories/ActionRepository.js';
import { DocumentRepository } from './repositories/DocumentRepository.js';
import { AuditRepository } from './repositories/AuditRepository.js';
import { AuthService } from './services/AuthService.js';
import { LeaveService } from './services/LeaveService.js';
import { HolidayService } from './services/HolidayService.js';
import { authenticate } from './middleware/auth.js';
import { createUploader } from './middleware/upload.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRoutes } from './routes/authRoutes.js';
import { leaveRoutes } from './routes/leaveRoutes.js';
import { auditRoutes } from './routes/auditRoutes.js';
import { notificationRoutes } from './routes/notificationRoutes.js';
import { holidayRoutes } from './routes/holidayRoutes.js';
import { userRoutes } from './routes/userRoutes.js';
import { calendarRoutes } from './routes/calendarRoutes.js';
import crypto from 'node:crypto';
import { NotificationService } from './services/NotificationService.js';
import { NotificationRepository } from './repositories/NotificationRepository.js';
import { EmailService } from './services/emailService.js';
import { TeamService } from './services/TeamService.js';
import { AiService } from './services/AiService.js';
import { aiRoutes } from './routes/aiRoutes.js';
import { AppError } from './utils/errors.js';
import { ALLOWED_UPLOADS, LEAVE_TYPES, POLICY } from './services/policy.js';

/** Wires repositories -> services (dependency injection). Shared by the server, seed script and tests. */
export function createServices(db, config, { clock } = {}) {
  const users = new UserRepository(db);
  const leaves = new LeaveRepository(db);
  const holidays = new HolidayRepository(db);
  const actions = new ActionRepository(db);
  const documents = new DocumentRepository(db);
  const audit = new AuditRepository(db);
  const notificationRepository = new NotificationRepository(db);
  const notifications = new NotificationService({ repository: notificationRepository });

  const services = {
    users,
    leaves,
    holidays,
    actions,
    documents,
    audit,
    notifications,
    notificationRepository,
    authService: new AuthService({
      db,
      users,
      audit,
      email: new EmailService({ apiKey: config.resendApiKey, from: config.emailFrom }),
      jwtSecret: config.jwtSecret,
      sessionHours: config.sessionHours,
    }),
    teamService: new TeamService({ db, users, audit }),
    leaveService: new LeaveService({ db, users, leaves, holidays, actions, documents, audit, notifier: notifications, clock }),
    holidayService: new HolidayService({ db, holidays, audit }),
  };
  services.aiService = new AiService({
    apiKey: config.groqApiKey,
    model: config.groqModel,
    audit,
    leaveService: services.leaveService,
    leaves,
    holidays,
    clock,
  });
  return services;
}

export function createApp({ db, config, services = createServices(db, config) }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  // Request ID: returned in the X-Request-Id header and printed with server errors,
  // so a user's error report can be matched to the log line.
  app.use((req, res, next) => {
    req.id = req.get('x-request-id')?.slice(0, 64) || crypto.randomUUID();
    res.set('X-Request-Id', req.id);
    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Allow plain-HTTP access on a LAN IP during the demo (no forced HTTPS upgrade).
          upgradeInsecureRequests: null,
        },
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
  // Business rules for the UI, so the frontend never hard-codes them.
  app.get('/api/policy', (_req, res) =>
    res.json({ ...POLICY, leaveTypes: LEAVE_TYPES, allowedExtensions: Object.values(ALLOWED_UPLOADS).flat() }),
  );
  app.use('/api/auth', authRoutes({ authService: services.authService, audit: services.audit, config }));

  // Everything below requires a signed-in user.
  const api = express.Router();
  api.use(authenticate(services.authService));
  api.use(leaveRoutes({ leaveService: services.leaveService, upload: createUploader(config.uploadDir), uploadDir: config.uploadDir }));
  api.use(auditRoutes({ audit: services.audit }));
  api.use(notificationRoutes({ db, services })); // Copilot
  api.use(holidayRoutes({ holidayService: services.holidayService })); // Codex
  api.use(userRoutes({ db, services, config })); // Claude
  api.use(calendarRoutes({ services }));
  api.use(aiRoutes({ services, config }));
  app.use('/api', api);

  app.use('/api', (req) => {
    throw AppError.notFound(`No API endpoint matches ${req.method} ${req.originalUrl}.`);
  });

  serveFrontend(app, config.clientDist);
  app.use(errorHandler);
  return app;
}

/** Serves the built React app and falls back to index.html for client-side routes. */
function serveFrontend(app, distDir) {
  const indexFile = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexFile)) {
    app.get('/', (_req, res) =>
      res
        .status(503)
        .type('text')
        .send('The web UI has not been built yet. Run "npm start" (or "npm run build") from the project root.'),
    );
    return;
  }

  app.use(express.static(distDir, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(indexFile);
  });
}
