import crypto from 'node:crypto';
import { nowIso } from '../db/database.js';

const GENESIS_HASH = '0'.repeat(64);

/** SHA-256 over the previous hash and this row's content, in a fixed field order. */
function hashEntry(prevHash, e) {
  const content = JSON.stringify([e.actorId, e.actorEmail, e.action, e.entityType, e.entityId, e.details, e.ip, e.createdAt]);
  return crypto.createHash('sha256').update(`${prevHash}|${content}`).digest('hex');
}

/**
 * Append-only, tamper-evident audit trail.
 * 1. Triggers in the schema block UPDATE/DELETE.
 * 2. Every row stores a hash of (previous row's hash + its own content), like a blockchain.
 *    Changing or deleting any old row (e.g. by editing the DB file directly) breaks the chain,
 *    and verifyIntegrity() reports the first broken entry.
 */
export class AuditRepository {
  constructor(db) {
    this.db = db;
  }

  log({ actor = null, actorEmail = null, action, entityType = null, entityId = null, details = null, ip = null }) {
    const entry = {
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? actorEmail,
      action,
      entityType,
      entityId,
      details: details ? JSON.stringify(details) : null,
      ip,
      createdAt: nowIso(),
    };
    // SQLite has a single writer and these calls are synchronous, so read-then-insert can't interleave.
    const prevHash = this.db.prepare('SELECT row_hash FROM audit_logs ORDER BY id DESC LIMIT 1').get()?.row_hash ?? GENESIS_HASH;
    const rowHash = hashEntry(prevHash, entry);
    this.db
      .prepare(
        `INSERT INTO audit_logs (actor_id, actor_email, action, entity_type, entity_id, details, ip_address, created_at, prev_hash, row_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(entry.actorId, entry.actorEmail, entry.action, entry.entityType, entry.entityId, entry.details, entry.ip, entry.createdAt, prevHash, rowHash);
  }

  /** Recomputes the whole hash chain. Returns { valid, checked, brokenAtId, reason }. */
  verifyIntegrity() {
    const rows = this.db.prepare('SELECT * FROM audit_logs ORDER BY id').all();
    let expectedPrev = GENESIS_HASH;
    for (const r of rows) {
      const entry = {
        actorId: r.actor_id,
        actorEmail: r.actor_email,
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        details: r.details,
        ip: r.ip_address,
        createdAt: r.created_at,
      };
      if (r.prev_hash !== expectedPrev) {
        return { valid: false, checked: rows.length, brokenAtId: r.id, reason: 'An earlier entry was removed or changed (chain link mismatch).' };
      }
      if (hashEntry(r.prev_hash, entry) !== r.row_hash) {
        return { valid: false, checked: rows.length, brokenAtId: r.id, reason: 'This entry was modified after it was written.' };
      }
      expectedPrev = r.row_hash;
    }
    return { valid: true, checked: rows.length, brokenAtId: null, reason: null };
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
