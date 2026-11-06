import { nowIso } from '../db/database.js';

const SELECT_USER = `
  SELECT u.id, u.name, u.email, u.password_hash, u.role, u.department_id, u.manager_id,
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

  create({ name, email, passwordHash, role, departmentId, managerId = null }) {
    const result = this.db
      .prepare(
        `INSERT INTO users (name, email, password_hash, role, department_id, manager_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(name, email, passwordHash, role, departmentId, managerId, nowIso());
    return Number(result.lastInsertRowid);
  }
}
