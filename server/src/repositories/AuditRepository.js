import { nowIso } from '../db/database.js';

/** Append-only audit trail (the schema has triggers that block UPDATE/DELETE). */
export class AuditRepository {
  constructor(db) {
    this.db = db;
  }

  log({ actor = null, actorEmail = null, action, entityType = null, entityId = null, details = null, ip = null }) {
    this.db
      .prepare(
        `INSERT INTO audit_logs (actor_id, actor_email, action, entity_type, entity_id, details, ip_address, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        actor?.id ?? null,
        actor?.email ?? actorEmail,
        action,
        entityType,
        entityId,
        details ? JSON.stringify(details) : null,
        ip,
        nowIso(),
      );
  }

  /**
   * Audit entries for a department: actions by its members, and failed logins
   * against its members' accounts. Newest first, paginated.
   */
  listForDepartment(departmentId, { action, limit = 50, offset = 0 } = {}) {
    const params = [departmentId];
    let where = 'u.department_id = ?';
    if (action) {
      where += ' AND a.action = ?';
      params.push(action);
    }
    const rows = this.db
      .prepare(
        `SELECT a.*, u.name AS actor_name, u.role AS actor_role
         FROM audit_logs a JOIN users u ON u.id = a.actor_id
         WHERE ${where}
         ORDER BY a.id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit + 1, offset);

    const hasMore = rows.length > limit;
    return {
      hasMore,
      items: rows.slice(0, limit).map((r) => ({
        id: r.id,
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        details: r.details ? JSON.parse(r.details) : null,
        ipAddress: r.ip_address,
        createdAt: r.created_at,
        actor: { id: r.actor_id, name: r.actor_name, role: r.actor_role, email: r.actor_email },
      })),
    };
  }

  distinctActions() {
    return this.db.prepare('SELECT DISTINCT action FROM audit_logs ORDER BY action').all().map((r) => r.action);
  }
}
