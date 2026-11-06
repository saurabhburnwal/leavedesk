import { nowIso } from '../db/database.js';

/** Timeline of workflow steps for each leave request. */
export class ActionRepository {
  constructor(db) {
    this.db = db;
  }

  add({ leaveId, actorId, action, stage = null, comment = null }) {
    this.db
      .prepare('INSERT INTO leave_actions (leave_id, actor_id, action, stage, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(leaveId, actorId, action, stage, comment || null, nowIso());
  }

  listForLeave(leaveId) {
    return this.db
      .prepare(
        `SELECT a.id, a.action, a.stage, a.comment, a.created_at, u.id AS actor_id, u.name AS actor_name, u.role AS actor_role
         FROM leave_actions a JOIN users u ON u.id = a.actor_id
         WHERE a.leave_id = ? ORDER BY a.id`,
      )
      .all(leaveId)
      .map((r) => ({
        id: r.id,
        action: r.action,
        stage: r.stage,
        comment: r.comment,
        createdAt: r.created_at,
        actor: { id: r.actor_id, name: r.actor_name, role: r.actor_role },
      }));
  }

  /** The most recent "more information requested" note, shown prominently to the employee. */
  latestInfoRequest(leaveId) {
    const row = this.db
      .prepare(
        `SELECT a.comment, a.created_at, a.stage, u.name AS actor_name FROM leave_actions a JOIN users u ON u.id = a.actor_id
         WHERE a.leave_id = ? AND a.action = 'INFO_REQUESTED' ORDER BY a.id DESC LIMIT 1`,
      )
      .get(leaveId);
    return row ? { comment: row.comment, createdAt: row.created_at, stage: row.stage, actorName: row.actor_name } : null;
  }

  hasApprovals(leaveId) {
    return !!this.db.prepare(`SELECT 1 FROM leave_actions WHERE leave_id = ? AND action = 'APPROVED' LIMIT 1`).get(leaveId);
  }
}
