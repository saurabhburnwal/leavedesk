import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { transaction } from '../db/database.js';
import { AppError, parseOrThrow } from '../utils/errors.js';

const emailField = z.string({ error: 'Email is required.' }).trim().toLowerCase().email('Enter a valid email address.');

const loginSchema = z.object({
  email: emailField,
  password: z.string({ error: 'Password is required.' }).min(1, 'Password is required.'),
});

const registerSchema = z.object({
  name: z
    .string({ error: 'Please enter your full name.' })
    .trim()
    .min(2, 'Please enter your full name.')
    .max(80, 'Name can be at most 80 characters.'),
  email: emailField,
  password: z
    .string({ error: 'Please choose a password.' })
    .min(8, 'Password must be at least 8 characters.')
    .max(72, 'Password can be at most 72 characters.')
    .regex(/[A-Za-z]/, 'Password must contain at least one letter.')
    .regex(/\d/, 'Password must contain at least one number.'),
  departmentId: z.coerce.number({ error: 'Please choose your department.' }).int().positive('Please choose your department.'),
  managerId: z.coerce.number({ error: 'Please choose your reporting manager.' }).int().positive('Please choose your reporting manager.'),
});

const verifySchema = z.object({
  email: emailField,
  code: z.string({ error: 'Enter the 6-digit code.' }).trim().regex(/^\d{6}$/, 'Enter the 6-digit code from the email.'),
});

const resendSchema = z.object({ email: emailField });

export const VERIFICATION = Object.freeze({ CODE_TTL_MINUTES: 10, MAX_ATTEMPTS: 5, RESEND_COOLDOWN_SECONDS: 30 });

// Used when the email is unknown so a failed login takes the same time either way
// (prevents discovering which emails exist by measuring response time).
const DUMMY_HASH = bcrypt.hashSync('timing-safe-dummy-password', 10);

const hashCode = (userId, code) => crypto.createHash('sha256').update(`${userId}:${code}`).digest('hex');

export class AuthService {
  constructor({ db, users, audit, email, jwtSecret, sessionHours }) {
    Object.assign(this, { db, users, audit, email, jwtSecret, sessionHours });
  }

  async login(input, ctx = {}) {
    const { email, password } = parseOrThrow(loginSchema, input, 'Please enter your email and password.');
    const record = this.users.findByEmailWithHash(email);
    const passwordOk = await bcrypt.compare(password, record?.passwordHash ?? DUMMY_HASH);

    if (!record || !passwordOk) {
      this.audit.log({
        actor: record ? { id: record.id, email: record.email } : null,
        actorEmail: email,
        action: 'LOGIN_FAILED',
        entityType: 'USER',
        entityId: record?.id ?? null,
        ip: ctx.ip,
      });
      throw AppError.unauthorized('That email and password combination is not correct.');
    }

    if (!record.emailVerified) {
      throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Please verify your email address before signing in. Enter the code we sent you, or request a new one.');
    }

    const { passwordHash, ...user } = record;
    this.audit.log({ actor: user, action: 'LOGIN_SUCCESS', entityType: 'USER', entityId: user.id, ip: ctx.ip });
    return { user, token: this.issueToken(user) };
  }

  /** Data for the sign-up form: departments and the managers/HODs people can report to. */
  registrationOptions() {
    const approvers = this.users.listApprovers();
    return {
      emailDelivery: this.email.enabled ? 'email' : 'demo',
      departments: this.users.listDepartments().map((d) => ({
        ...d,
        managers: approvers.filter((a) => a.departmentId === d.id).map(({ id, name, role }) => ({ id, name, role })),
      })),
    };
  }

  /**
   * Self sign-up. Everyone starts as an EMPLOYEE (an HOD can promote them later on the Team page),
   * and the account can't sign in until the emailed 6-digit code is confirmed.
   */
  async register(input, ctx = {}) {
    const data = parseOrThrow(registerSchema, input);

    const department = this.users.listDepartments().find((d) => d.id === data.departmentId);
    if (!department) throw AppError.validation('Please fix the highlighted fields.', { departmentId: 'Please choose a valid department.' });
    const manager = this.users.findById(data.managerId);
    if (!manager || manager.departmentId !== department.id || !['MANAGER', 'HOD'].includes(manager.role) || !manager.emailVerified) {
      throw AppError.validation('Please fix the highlighted fields.', { managerId: `Choose a manager from the ${department.name} department.` });
    }

    const existing = this.users.findByEmailWithHash(data.email);
    if (existing?.emailVerified) {
      throw AppError.conflict('An account with this email already exists. Please sign in instead.', { email: 'This email is already registered.' });
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const userId = transaction(this.db, () => {
      let id;
      if (existing) {
        // Registered before but never verified: let them start over with fresh details.
        id = existing.id;
        this.users.updateUnverified(id, { name: data.name, passwordHash, departmentId: department.id, managerId: manager.id });
      } else {
        id = this.users.create({
          name: data.name,
          email: data.email,
          passwordHash,
          role: 'EMPLOYEE',
          departmentId: department.id,
          managerId: manager.id,
          emailVerified: false,
        });
      }
      this.audit.log({
        actor: { id, email: data.email },
        action: 'USER_REGISTERED',
        entityType: 'USER',
        entityId: id,
        details: { department: department.name, manager: manager.name },
        ip: ctx.ip,
      });
      return id;
    });

    return this.sendVerificationCode(this.users.findById(userId), ctx);
  }

  async resendCode(input, ctx = {}) {
    const { email } = parseOrThrow(resendSchema, input, 'Enter a valid email address.');
    const user = this.users.findByEmailWithHash(email);
    if (!user) throw AppError.notFound('No sign-up found for this email. Please register first.');
    if (user.emailVerified) throw AppError.conflict('This email is already verified. You can sign in.');

    const pending = this.users.findVerification(user.id);
    if (pending) {
      const waited = (Date.now() - new Date(pending.lastSentAt).getTime()) / 1000;
      if (waited < VERIFICATION.RESEND_COOLDOWN_SECONDS) {
        const wait = Math.ceil(VERIFICATION.RESEND_COOLDOWN_SECONDS - waited);
        throw new AppError(429, 'TOO_SOON', `Please wait ${wait} seconds before requesting another code.`);
      }
    }
    return this.sendVerificationCode(user, ctx);
  }

  /** Confirms the code, activates the account and signs the user in. */
  verifyEmail(input, ctx = {}) {
    const { email, code } = parseOrThrow(verifySchema, input, 'Please enter the 6-digit code.');
    const record = this.users.findByEmailWithHash(email);
    if (!record) throw AppError.notFound('No sign-up found for this email. Please register first.');
    if (record.emailVerified) throw AppError.conflict('This email is already verified. Please sign in.');

    const pending = this.users.findVerification(record.id);
    const invalid = (message) => AppError.validation(message, { code: message });
    if (!pending) throw invalid('No active code. Please request a new one.');
    if (new Date(pending.expiresAt) < new Date()) throw invalid('This code has expired. Please request a new one.');
    if (pending.attempts >= VERIFICATION.MAX_ATTEMPTS) throw invalid('Too many wrong attempts. Please request a new code.');

    const expected = Buffer.from(pending.codeHash, 'hex');
    const actual = Buffer.from(hashCode(record.id, code), 'hex');
    if (!crypto.timingSafeEqual(expected, actual)) {
      this.users.incrementVerificationAttempts(record.id);
      const left = VERIFICATION.MAX_ATTEMPTS - pending.attempts - 1;
      throw invalid(left > 0 ? `That code is not correct. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many wrong attempts. Please request a new code.');
    }

    transaction(this.db, () => {
      this.users.markEmailVerified(record.id);
      this.users.deleteVerification(record.id);
      this.audit.log({ actor: record, action: 'EMAIL_VERIFIED', entityType: 'USER', entityId: record.id, ip: ctx.ip });
      this.audit.log({ actor: record, action: 'LOGIN_SUCCESS', entityType: 'USER', entityId: record.id, ip: ctx.ip });
    });

    const user = this.users.findById(record.id);
    return { user, token: this.issueToken(user) };
  }

  /** Verifies the session token and reloads the user, so role changes and deletions apply immediately. */
  authenticate(token) {
    if (!token) throw AppError.unauthorized();
    let payload;
    try {
      payload = jwt.verify(token, this.jwtSecret);
    } catch {
      throw AppError.unauthorized('Your session has expired. Please sign in again.');
    }
    const user = this.users.findById(Number(payload.sub));
    if (!user || !user.emailVerified) throw AppError.unauthorized('Your account is no longer active. Please sign in again.');
    return user;
  }

  issueToken(user) {
    return jwt.sign({ sub: String(user.id), role: user.role }, this.jwtSecret, { expiresIn: `${this.sessionHours}h` });
  }

  async sendVerificationCode(user, ctx = {}) {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = new Date(Date.now() + VERIFICATION.CODE_TTL_MINUTES * 60_000).toISOString();
    this.users.saveVerification(user.id, { codeHash: hashCode(user.id, code), expiresAt });

    let delivery;
    try {
      delivery = await this.email.send({ to: user.email, ...this.email.verificationEmail(user.name, code) });
    } catch {
      throw new AppError(502, 'EMAIL_FAILED', "We couldn't send the verification email right now. Please try again in a minute.");
    }
    this.audit.log({ actor: user, action: 'VERIFICATION_CODE_SENT', entityType: 'USER', entityId: user.id, details: { delivery }, ip: ctx.ip });

    return {
      email: user.email,
      delivery,
      expiresInMinutes: VERIFICATION.CODE_TTL_MINUTES,
      // Demo mode only (no email provider configured): show the code so the flow can still be tested.
      ...(delivery === 'demo' ? { demoCode: code } : {}),
    };
  }

  static hashPassword(password) {
    return bcrypt.hashSync(password, 10);
  }
}
