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
import { formatHumanDate } from '../utils/dates.js';

const EVENT_TYPES = new Set([
  'SUBMITTED',
  'UPDATED',
  'APPROVED',
  'REJECTED',
  'INFO_REQUESTED',
  'INFO_PROVIDED',
  'CANCELLED',
  'DOCUMENTS_ADDED',
]);

export class NotificationService {
  constructor({ repository } = {}) {
    this.repository = repository;
  }

  notify(event, { leave, previous, actor, comment } = {}) {
    if (!this.repository || !leave || !actor || !EVENT_TYPES.has(event)) return;

    const recipients = this.recipients(event, leave, previous);
    for (const recipient of recipients) {
      if (!recipient || recipient.id === actor.id) continue;
      const copy = this.copy(event, leave, previous, recipient, comment);
      this.repository.add({ userId: recipient.id, leaveId: leave.id, type: event, ...copy });
    }
  }

  recipients(event, leave, previous) {
    const employee = { id: leave.employeeId, name: leave.employeeName };
    const currentApprover = leave.currentStage === 'HOD' ? leave.hodApprover : leave.managerApprover;
    const previousApprover = previous?.currentStage === 'HOD' ? previous.hodApprover : previous?.managerApprover;

    if (event === 'SUBMITTED' || event === 'INFO_PROVIDED' || event === 'UPDATED' || event === 'DOCUMENTS_ADDED') {
      return [currentApprover];
    }
    if (event === 'CANCELLED') return [previousApprover];
    if (event === 'INFO_REQUESTED' || event === 'REJECTED') return [employee];
    if (event === 'APPROVED') {
      return leave.status === 'PENDING' ? [employee, currentApprover] : [employee];
    }
    return [];
  }

  copy(event, leave, previous, recipient, comment) {
    const dates = `${formatHumanDate(leave.fromDate)}–${formatHumanDate(leave.toDate)} · ${leave.workingDays} ${leave.workingDays === 1 ? 'day' : 'days'}`;
    if (event === 'SUBMITTED') {
      return { title: 'New leave request', message: `New leave request from ${leave.employeeName} · ${dates}` };
    }
    if (event === 'APPROVED' && leave.status === 'PENDING') {
      if (recipient.id === leave.employeeId) {
        return {
          title: 'Leave approved by manager',
          message: `Approved by ${previous?.managerApprover?.name || 'your manager'}, now with ${leave.hodApprover?.name || 'the HOD'} (HOD)`,
        };
      }
      return { title: 'Leave request needs your approval', message: `${leave.employeeName}'s leave request needs your approval` };
    }
    if (event === 'APPROVED') return { title: 'Leave approved', message: `Your leave request for ${dates} was approved` };
    if (event === 'REJECTED') return { title: 'Leave request rejected', message: `Your leave request was rejected${comment ? `: ${comment}` : ''}` };
    if (event === 'INFO_REQUESTED') return { title: 'More information requested', message: comment || 'Your approver requested more information.' };
    if (event === 'INFO_PROVIDED') return { title: 'Leave information provided', message: `${leave.employeeName} provided more information for this request` };
    if (event === 'UPDATED') return { title: 'Leave request edited', message: 'A leave request was edited and approval restarted' };
    if (event === 'CANCELLED') return { title: 'Leave request cancelled', message: `${leave.employeeName}'s leave request was cancelled` };
    return { title: 'Documents added', message: `${leave.employeeName} added documents to a leave request` };
  }
}
