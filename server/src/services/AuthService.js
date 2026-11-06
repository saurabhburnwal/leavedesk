import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { AppError, parseOrThrow } from '../utils/errors.js';

const loginSchema = z.object({
  email: z.string({ error: 'Email is required.' }).trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string({ error: 'Password is required.' }).min(1, 'Password is required.'),
});

// Used when the email is unknown so a failed login takes the same time either way
// (prevents discovering which emails exist by measuring response time).
const DUMMY_HASH = bcrypt.hashSync('timing-safe-dummy-password', 10);

export class AuthService {
  constructor({ users, audit, jwtSecret, sessionHours }) {
    Object.assign(this, { users, audit, jwtSecret, sessionHours });
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

    const { passwordHash, ...user } = record;
    this.audit.log({ actor: user, action: 'LOGIN_SUCCESS', entityType: 'USER', entityId: user.id, ip: ctx.ip });
    const token = jwt.sign({ sub: String(user.id), role: user.role }, this.jwtSecret, { expiresIn: `${this.sessionHours}h` });
    return { user, token };
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
    if (!user) throw AppError.unauthorized('Your account is no longer active. Please sign in again.');
    return user;
  }

  static hashPassword(password) {
    return bcrypt.hashSync(password, 10);
  }
}
