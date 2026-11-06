import { nowIso } from '../db/database.js';

function toNotification(row) {
  return {
    id: row.id,
    leaveId: row.leave_id,
    type: row.type,
    title: row.title,
    message: row.message,
    isRead: row.is_read === 1,
    createdAt: row.created_at,
  };
}

export class NotificationRepository {
  constructor(db) {
    this.db = db;
  }

  add({ userId, leaveId, type, title, message }) {
    this.db
      .prepare(
        `INSERT INTO notifications (user_id, leave_id, type, title, message, is_read, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
      )
      .run(userId, leaveId ?? null, type, title, message, nowIso());
  }

  listForUser(userId, limit = 20) {
    return this.db
      .prepare(
        `SELECT id, leave_id, type, title, message, is_read, created_at
         FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
      )
      .all(userId, limit)
      .map(toNotification);
  }

  countUnread(userId) {
    return this.db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0').get(userId).count;
  }

  markRead(id, userId) {
    return this.db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, userId).changes === 1;
  }

  markAllRead(userId) {
    this.db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(userId);
  }
}
