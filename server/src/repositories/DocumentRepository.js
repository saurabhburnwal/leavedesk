import { nowIso } from '../db/database.js';

function toDocument(row) {
  if (!row) return null;
  return {
    id: row.id,
    leaveId: row.leave_id,
    originalName: row.original_name,
    storedName: row.stored_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedBy: { id: row.uploaded_by, name: row.uploader_name },
    createdAt: row.created_at,
  };
}

const SELECT_DOCUMENT = `
  SELECT d.*, u.name AS uploader_name FROM documents d JOIN users u ON u.id = d.uploaded_by`;

export class DocumentRepository {
  constructor(db) {
    this.db = db;
  }

  add({ leaveId, uploadedBy, originalName, storedName, mimeType, sizeBytes }) {
    const result = this.db
      .prepare(
        `INSERT INTO documents (leave_id, uploaded_by, original_name, stored_name, mime_type, size_bytes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(leaveId, uploadedBy, originalName, storedName, mimeType, sizeBytes, nowIso());
    return Number(result.lastInsertRowid);
  }

  findById(id) {
    return toDocument(this.db.prepare(`${SELECT_DOCUMENT} WHERE d.id = ?`).get(id));
  }

  listForLeave(leaveId) {
    return this.db.prepare(`${SELECT_DOCUMENT} WHERE d.leave_id = ? ORDER BY d.id`).all(leaveId).map(toDocument);
  }

  countForLeave(leaveId) {
    return this.db.prepare('SELECT COUNT(*) AS n FROM documents WHERE leave_id = ?').get(leaveId).n;
  }
}
