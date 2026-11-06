import { nowIso } from '../db/database.js';

const SELECT_LEAVE = `
  SELECT lr.*,
         e.name  AS employee_name,
         e.email AS employee_email,
         e.department_id,
         e.manager_id AS employee_manager_id,
         d.name  AS department_name,
         m.name  AS manager_approver_name,
         h.name  AS hod_approver_name,
         (SELECT COUNT(*) FROM documents doc WHERE doc.leave_id = lr.id) AS document_count
  FROM leave_requests lr
  JOIN users e       ON e.id = lr.employee_id
  JOIN departments d ON d.id = e.department_id
  LEFT JOIN users m  ON m.id = lr.manager_approver_id
  LEFT JOIN users h  ON h.id = lr.hod_approver_id`;

function toLeave(row) {
  if (!row) return null;
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    employeeEmail: row.employee_email,
    departmentId: row.department_id,
    employeeManagerId: row.employee_manager_id,
    department: row.department_name,
    leaveType: row.leave_type,
    fromDate: row.from_date,
    toDate: row.to_date,
    workingDays: row.working_days,
    dayPart: row.day_part ?? 'FULL',
    reason: row.reason,
    status: row.status,
    currentStage: row.current_stage,
    requiresDocuments: row.requires_documents === 1,
    managerApprover: row.manager_approver_id ? { id: row.manager_approver_id, name: row.manager_approver_name } : null,
    hodApprover: row.hod_approver_id ? { id: row.hod_approver_id, name: row.hod_approver_name } : null,
    documentCount: row.document_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Builds an optional "AND lr.status = ?" filter. */
function statusFilter(status, params) {
  if (!status) return '';
  params.push(status);
  return ' AND lr.status = ?';
}

export class LeaveRepository {
  constructor(db) {
    this.db = db;
  }

  findById(id) {
    return toLeave(this.db.prepare(`${SELECT_LEAVE} WHERE lr.id = ?`).get(id));
  }

  /** A user's own requests (leave history). */
  listByEmployee(employeeId, { status } = {}) {
    const params = [employeeId];
    const sql = `${SELECT_LEAVE} WHERE lr.employee_id = ?${statusFilter(status, params)} ORDER BY lr.from_date DESC, lr.id DESC`;
    return this.db.prepare(sql).all(...params).map(toLeave);
  }

  /** Requests waiting for this approver's decision right now (soonest leave first). */
  listPendingForApprover(approverId) {
    const sql = `${SELECT_LEAVE}
      WHERE lr.status = 'PENDING'
        AND ((lr.current_stage = 'MANAGER' AND lr.manager_approver_id = ?)
          OR (lr.current_stage = 'HOD'     AND lr.hod_approver_id     = ?))
      ORDER BY lr.from_date ASC, lr.id ASC`;
    return this.db.prepare(sql).all(approverId, approverId).map(toLeave);
  }

  /**
   * Everything an approver may see: their direct reports, anything they are in the
   * approval chain for and, for an HOD, the whole department.
   */
  listVisibleToApprover(user, { status } = {}) {
    const params = [user.id, user.id, user.id, user.id, user.role, user.departmentId];
    const sql = `${SELECT_LEAVE}
      WHERE lr.employee_id <> ?
        AND (lr.manager_approver_id = ? OR lr.hod_approver_id = ? OR e.manager_id = ?
             OR (? = 'HOD' AND e.department_id = ?))
        ${statusFilter(status, params)}
      ORDER BY lr.created_at DESC, lr.id DESC`;
    return this.db.prepare(sql).all(...params).map(toLeave);
  }

  /** Active requests of the employee whose date range intersects [fromDate, toDate]. */
  findOverlapping(employeeId, fromDate, toDate, excludeId = null, dayPart = 'FULL') {
    const sql = `${SELECT_LEAVE}
      WHERE lr.employee_id = ?
        AND lr.status IN ('PENDING', 'INFO_REQUESTED', 'APPROVED')
        AND lr.from_date <= ? AND lr.to_date >= ?
        AND lr.id <> ?
        AND NOT (lr.from_date = ? AND lr.to_date = ? AND ? <> 'FULL'
                 AND lr.day_part IN ('FIRST_HALF', 'SECOND_HALF') AND lr.day_part <> ?)
      ORDER BY lr.from_date LIMIT 1`;
    return toLeave(this.db.prepare(sql).get(employeeId, toDate, fromDate, excludeId ?? -1, fromDate, toDate, dayPart, dayPart));
  }

  create(leave) {
    const now = nowIso();
    const result = this.db
      .prepare(
        `INSERT INTO leave_requests
           (employee_id, leave_type, from_date, to_date, working_days, day_part, reason, status, current_stage,
            requires_documents, manager_approver_id, hod_approver_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        leave.employeeId,
        leave.leaveType,
        leave.fromDate,
        leave.toDate,
        leave.workingDays,
        leave.dayPart ?? 'FULL',
        leave.reason,
        leave.status,
        leave.currentStage,
        leave.requiresDocuments ? 1 : 0,
        leave.managerApproverId,
        leave.hodApproverId,
        now,
        now,
      );
    return Number(result.lastInsertRowid);
  }

  /** Employee edits: new dates/details and a restarted approval chain. Guarded like `transition`. */
  updateDetails(id, expectedStatus, leave) {
    const result = this.db
      .prepare(
        `UPDATE leave_requests
           SET leave_type = ?, from_date = ?, to_date = ?, working_days = ?, day_part = ?, reason = ?, status = ?,
               current_stage = ?, requires_documents = ?, manager_approver_id = ?, hod_approver_id = ?, updated_at = ?
         WHERE id = ? AND status = ?`,
      )
      .run(
        leave.leaveType,
        leave.fromDate,
        leave.toDate,
        leave.workingDays,
        leave.dayPart ?? 'FULL',
        leave.reason,
        leave.status,
        leave.currentStage,
        leave.requiresDocuments ? 1 : 0,
        leave.managerApproverId,
        leave.hodApproverId,
        nowIso(),
        id,
        expectedStatus,
      );
    return result.changes === 1;
  }

  /**
   * Compare-and-set state transition (optimistic concurrency): only succeeds if the
   * request is still in the state the caller saw. Returns false if someone else
   * changed it first, e.g. two approvers clicking at the same time.
   */
  transition(id, from, to) {
    const result = this.db
      .prepare(
        `UPDATE leave_requests SET status = ?, current_stage = ?, updated_at = ?
         WHERE id = ? AND status = ? AND current_stage IS ?`,
      )
      .run(to.status, to.stage ?? null, nowIso(), id, from.status, from.stage ?? null);
    return result.changes === 1;
  }

  touch(id) {
    this.db.prepare('UPDATE leave_requests SET updated_at = ? WHERE id = ?').run(nowIso(), id);
  }

  countByStatusForEmployee(employeeId) {
    const rows = this.db
      .prepare('SELECT status, COUNT(*) AS n FROM leave_requests WHERE employee_id = ? GROUP BY status')
      .all(employeeId);
    return Object.fromEntries(rows.map((r) => [r.status, r.n]));
  }

  approvedDaysInYear(employeeId, year) {
    return this.db
      .prepare(
        `SELECT COALESCE(SUM(working_days), 0) AS n FROM leave_requests
         WHERE employee_id = ? AND status = 'APPROVED' AND substr(from_date, 1, 4) = ?`,
      )
      .get(employeeId, String(year)).n;
  }

  leaveDaysForBalance(employeeId, year) {
    return this.db.prepare(`SELECT leave_type, from_date, to_date, working_days, day_part, status
      FROM leave_requests WHERE employee_id = ? AND status IN ('APPROVED', 'PENDING', 'INFO_REQUESTED')
        AND substr(from_date, 1, 4) <= ? AND substr(to_date, 1, 4) >= ?`)
      .all(employeeId, String(year), String(year));
  }

  /** Approved leave of people this approver can see, overlapping [fromDate, toDate]. */
  approvedTeamLeaveBetween(user, fromDate, toDate) {
    const sql = `${SELECT_LEAVE}
      WHERE lr.status = 'APPROVED' AND lr.employee_id <> ?
        AND lr.from_date <= ? AND lr.to_date >= ?
        AND (e.manager_id = ? OR lr.manager_approver_id = ? OR lr.hod_approver_id = ?
             OR (? = 'HOD' AND e.department_id = ?))
      ORDER BY lr.from_date`;
    return this.db
      .prepare(sql)
      .all(user.id, toDate, fromDate, user.id, user.id, user.id, user.role, user.departmentId)
      .map(toLeave);
  }
}
