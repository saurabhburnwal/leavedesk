import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT_DIR = path.resolve(import.meta.dirname, '..', '..');

/**
 * Central configuration. Everything can be overridden with environment
 * variables so the same build runs locally, in Docker, or in the cloud.
 */
export function loadConfig(overrides = {}) {
  // Optional .env file in the project root (e.g. RESEND_API_KEY). Real env vars win.
  const envFile = path.join(ROOT_DIR, '.env');
  if (fs.existsSync(envFile)) {
    for (const [key, value] of Object.entries(parseEnv(fs.readFileSync(envFile, 'utf8')))) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
  const dataDir = path.resolve(process.env.DATA_DIR || path.join(ROOT_DIR, 'data'));

  const config = {
    port: Number(process.env.PORT) || 3000,
    host: process.env.HOST || '0.0.0.0',
    dataDir,
    dbFile: process.env.DB_FILE || path.join(dataDir, 'leave-tracker.db'),
    uploadDir: process.env.UPLOAD_DIR || path.join(dataDir, 'uploads'),
    clientDist: path.join(ROOT_DIR, 'client', 'dist'),
    jwtSecret: process.env.JWT_SECRET || null,
    sessionHours: Number(process.env.SESSION_HOURS) || 8,
    // Set COOKIE_SECURE=true when the app is served over HTTPS.
    cookieSecure: process.env.COOKIE_SECURE === 'true',
    loginRateLimit: Number(process.env.LOGIN_RATE_LIMIT) || 20,
    seedDemoData: process.env.SEED_DEMO_DATA !== 'false',
    resendApiKey: process.env.RESEND_API_KEY || null,
    emailFrom: process.env.EMAIL_FROM || 'LeaveDesk <onboarding@resend.dev>',
    ...overrides,
  };

  if (!config.jwtSecret) config.jwtSecret = loadOrCreateSecret(config.dataDir);
  return config;
}

/** Minimal KEY=VALUE parser for .env files (comments and quotes supported). */
function parseEnv(content) {
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

/**
 * When no JWT_SECRET is provided we generate a strong random one and persist it
 * in the data directory so sessions survive restarts. Never hard-code secrets.
 */
function loadOrCreateSecret(dataDir) {
  const file = path.join(dataDir, '.jwt-secret');
  fs.mkdirSync(dataDir, { recursive: true });
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}
