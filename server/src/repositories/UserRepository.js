import { nowIso } from '../db/database.js';

const SELECT_USER = `
  SELECT u.id, u.name, u.email, u.password_hash, u.role, u.department_id, u.manager_id, u.email_verified_at,
         d.name AS department_name, m.name AS manager_name, u.created_at,
         (SELECT h.id   FROM users h WHERE h.department_id = u.department_id AND h.role = 'HOD' ORDER BY h.id LIMIT 1) AS hod_id,
         (SELECT h.name FROM users h WHERE h.department_id = u.department_id AND h.role = 'HOD' ORDER BY h.id LIMIT 1) AS hod_name
  FROM users u
  JOIN departments d ON d.id = u.department_id
  LEFT JOIN users m ON m.id = u.manager_id`;

/** Maps a DB row to a domain object. The password hash never leaves this layer unless asked for. */
function toUser(row, { withHash = false } = {}) {
  if (!row) return null;
  const user = {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    departmentId: row.department_id,
    department: row.department_name,
    managerId: row.manager_id,
    managerName: row.manager_name,
    emailVerified: Boolean(row.email_verified_at),
    hodId: row.hod_id,
    hodName: row.hod_name,
    createdAt: row.created_at,
  };
  if (withHash) user.passwordHash = row.password_hash;
  return user;
}

export class UserRepository {
  constructor(db) {
    this.db = db;
  }

  findById(id) {
    return toUser(this.db.prepare(`${SELECT_USER} WHERE u.id = ?`).get(id));
  }

  findByEmailWithHash(email) {
    return toUser(this.db.prepare(`${SELECT_USER} WHERE u.email = ?`).get(email), { withHash: true });
  }

  findHodOfDepartment(departmentId) {
    return toUser(this.db.prepare(`${SELECT_USER} WHERE u.department_id = ? AND u.role = 'HOD' ORDER BY u.id LIMIT 1`).get(departmentId));
  }

  count() {
    return this.db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  }

  createDepartment(name) {
    return Number(this.db.prepare('INSERT INTO departments (name) VALUES (?)').run(name).lastInsertRowid);
  }

  create({ name, email, passwordHash, role, departmentId, managerId = null, emailVerified = true }) {
    const now = nowIso();
    const result = this.db
      .prepare(
        `INSERT INTO users (name, email, password_hash, role, department_id, manager_id, email_verified_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(name, email, passwordHash, role, departmentId, managerId, emailVerified ? now : null, now);
    return Number(result.lastInsertRowid);
  }

  /** Re-registration of a still-unverified account: refresh its details. */
  updateUnverified(id, { name, passwordHash, departmentId, managerId }) {
    this.db
      .prepare('UPDATE users SET name = ?, password_hash = ?, department_id = ?, manager_id = ? WHERE id = ? AND email_verified_at IS NULL')
      .run(name, passwordHash, departmentId, managerId, id);
  }

  markEmailVerified(id) {
    this.db.prepare('UPDATE users SET email_verified_at = ? WHERE id = ?').run(nowIso(), id);
  }

  updateRoleAndManager(id, { role, managerId }) {
    this.db.prepare('UPDATE users SET role = ?, manager_id = ? WHERE id = ?').run(role, managerId, id);
  }

  listDepartments() {
    return this.db.prepare('SELECT id, name FROM departments ORDER BY name').all().map((r) => ({ id: r.id, name: r.name }));
  }

  /** Verified managers/HODs per department: the choices for "reporting manager" at sign-up. */
  listApprovers() {
    return this.db
      .prepare(
        `SELECT id, name, role, department_id FROM users
         WHERE role IN ('MANAGER', 'HOD') AND email_verified_at IS NOT NULL ORDER BY role DESC, name`,
      )
      .all()
      .map((r) => ({ id: r.id, name: r.name, role: r.role, departmentId: r.department_id }));
  }

  listByDepartment(departmentId) {
    return this.db.prepare(`${SELECT_USER} WHERE u.department_id = ? ORDER BY CASE u.role WHEN 'HOD' THEN 0 WHEN 'MANAGER' THEN 1 ELSE 2 END, u.name`).all(departmentId).map((r) => toUser(r));
  }

  countDirectReports(id) {
    return this.db.prepare('SELECT COUNT(*) AS n FROM users WHERE manager_id = ?').get(id).n;
  }

  countPendingApprovals(id) {
    return this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM leave_requests
         WHERE status IN ('PENDING', 'INFO_REQUESTED')
           AND ((current_stage = 'MANAGER' AND manager_approver_id = ?) OR (current_stage = 'HOD' AND hod_approver_id = ?))`,
      )
      .get(id, id).n;
  }

  // ---- email verification codes ----
  saveVerification(userId, { codeHash, expiresAt }) {
    this.db
      .prepare(
        `INSERT INTO email_verifications (user_id, code_hash, expires_at, attempts, last_sent_at) VALUES (?, ?, ?, 0, ?)
         ON CONFLICT(user_id) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, last_sent_at = excluded.last_sent_at`,
      )
      .run(userId, codeHash, expiresAt, nowIso());
  }

  findVerification(userId) {
    const r = this.db.prepare('SELECT * FROM email_verifications WHERE user_id = ?').get(userId);
    return r ? { codeHash: r.code_hash, expiresAt: r.expires_at, attempts: r.attempts, lastSentAt: r.last_sent_at } : null;
  }

  incrementVerificationAttempts(userId) {
    this.db.prepare('UPDATE email_verifications SET attempts = attempts + 1 WHERE user_id = ?').run(userId);
  }

  deleteVerification(userId) {
    this.db.prepare('DELETE FROM email_verifications WHERE user_id = ?').run(userId);
  }
}
