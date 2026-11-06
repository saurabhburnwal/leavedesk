/**
 * OWNER: Copilot (in-app notifications). Placeholder wired in by Claude.
 *
 * LeaveService calls `notify(event, payload)` INSIDE its DB transaction after every workflow change:
 *   event   : 'SUBMITTED' | 'UPDATED' | 'APPROVED' | 'REJECTED' | 'INFO_REQUESTED' | 'INFO_PROVIDED' | 'CANCELLED' | 'DOCUMENTS_ADDED'
 *   payload : { leave, previous, actor, comment }
 *     leave    - the request AFTER the change (status, currentStage, employeeId, managerApprover, hodApprover, ...)
 *     previous - the request BEFORE the change (null for SUBMITTED)
 *     actor    - the user who did it
 * Must be synchronous and must not throw for normal cases (it runs inside the transaction).
 */
export class NotificationService {
  constructor({ db } = {}) {
    this.db = db;
  }

  notify(_event, _payload) {
    // TODO(Copilot): decide recipients and insert notification rows.
  }
}
