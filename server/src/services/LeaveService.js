import { z } from 'zod';
import { transaction } from '../db/database.js';
import { AppError, parseOrThrow, zodIssuesToFields } from '../utils/errors.js';
import { addDays, countWorkingDays, daysBetween, formatHumanDate, parseIsoDate, todayIso } from '../utils/dates.js';
import { LEAVE_TYPES, OPEN_STATUSES, POLICY, STAGE, STATUS, isLongLeave } from './policy.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NO_OP_NOTIFIER = { notify() {} };

const STATUS_LABEL = {
  PENDING: 'pending',
  INFO_REQUESTED: 'awaiting more information',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
};

// ---------------------------------------------------------------------------
// Input schemas (shape validation). Business-rule validation is done below.
// ---------------------------------------------------------------------------

const dateField = (label) =>
  z.string({ error: `${label} is required.` }).trim().regex(DATE_RE, `Pick a valid ${label.toLowerCase()}.`);

const leaveInputSchema = z.object({
  leaveType: z.enum(LEAVE_TYPES, { error: 'Please choose a leave type.' }).default('CASUAL'),
  dayPart: z.enum(['FULL', 'FIRST_HALF', 'SECOND_HALF']).default('FULL'),
  fromDate: dateField('Start date'),
  toDate: dateField('End date'),
  reason: z
    .string({ error: 'Please tell us the reason for your leave.' })
    .trim()
    .min(POLICY.REASON_MIN, `Reason should be at least ${POLICY.REASON_MIN} characters.`)
    .max(POLICY.REASON_MAX, `Reason can be at most ${POLICY.REASON_MAX} characters.`),
  // `employeeName` from the sample payload is accepted but ignored: the employee
  // is always the signed-in user, so nobody can file leave on someone else's behalf.
});

const optionalCommentSchema = z.object({
  comment: z
    .string()
    .trim()
    .max(POLICY.COMMENT_MAX, `Comment can be at most ${POLICY.COMMENT_MAX} characters.`)
    .optional()
    .default(''),
});

const requiredCommentSchema = (message) =>
  z.object({
    comment: z
      .string({ error: message })
      .trim()
      .min(POLICY.COMMENT_MIN, message)
      .max(POLICY.COMMENT_MAX, `Comment can be at most ${POLICY.COMMENT_MAX} characters.`),
  });

const REJECT_SCHEMA = requiredCommentSchema('Please add a comment explaining why the request is rejected.');
const INFO_REQUEST_SCHEMA = requiredCommentSchema('Please describe what information you need from the employee.');
const RESPOND_SCHEMA = requiredCommentSchema('Please add a reply for your approver.');

/**
 * The leave workflow (state machine):
 *
 *   PENDING@MANAGER --approve--> APPROVED                 (<= 3 working days)
 *   PENDING@MANAGER --approve--> PENDING@HOD --approve--> APPROVED   (> 3 working days)
 *   PENDING@any     --reject---> REJECTED
 *   PENDING@any     --request info--> INFO_REQUESTED --employee responds--> PENDING@same stage
 *   PENDING / INFO_REQUESTED (or APPROVED but not yet started) --employee cancels--> CANCELLED
 *   Employee edits while open -> details updated, approval restarts from level 1.
 */
export class LeaveService {
  constructor({ db, users, leaves, holidays, actions, documents, audit, notifier = NO_OP_NOTIFIER, clock = () => new Date() }) {
    Object.assign(this, { db, users, leaves, holidays, actions, documents, audit, notifier, clock });
  }

  today() {
    return todayIso(this.clock());
  }

  // ------------------------------------------------------------------ reads

  listMine(user, { status } = {}) {
    return this.leaves.listByEmployee(user.id, { status: normalizeStatus(status) });
  }

  listPendingApprovals(user) {
    this.assertApproverRole(user);
    return this.leaves.listPendingForApprover(user.id);
  }

  listTeam(user, { status } = {}) {
    this.assertApproverRole(user);
    return this.leaves.listVisibleToApprover(user, { status: normalizeStatus(status) });
  }

  getDetail(user, leaveId) {
    const leave = this.getVisibleLeave(user, leaveId);
    return {
      ...leave,
      documents: this.documents.listForLeave(leave.id).map(toPublicDocument),
      timeline: this.actions.listForLeave(leave.id),
      employeeBalances: this.getBalances(leave.employeeId),
      infoRequest: leave.status === STATUS.INFO_REQUESTED ? this.actions.latestInfoRequest(leave.id) : null,
      permissions: this.permissionsFor(leave, user),
    };
  }

  dashboard(user) {
    const today = this.today();
    const mine = this.leaves.listByEmployee(user.id);
    const counts = { PENDING: 0, INFO_REQUESTED: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0, ...this.leaves.countByStatusForEmployee(user.id) };

    const result = {
      canApply: user.role !== 'HOD',
      mine: {
        counts,
        approvedDaysThisYear: this.leaves.approvedDaysInYear(user.id, today.slice(0, 4)),
        balances: this.getBalances(user.id),
        upcoming: mine.filter((l) => l.status === STATUS.APPROVED && l.toDate >= today).sort(byFromDateAsc).slice(0, 3),
        recent: [...mine].sort((a, b) => b.id - a.id).slice(0, 5),
      },
      approver: null,
      team: user.role === 'EMPLOYEE'
        ? this.leaves.approvedTeamLeaveForEmployee(user.id, user.managerId, today, addDays(today, 30))
        : [],
    };

    if (isApprover(user)) {
      const pending = this.leaves.listPendingForApprover(user.id);
      const team = this.leaves.listVisibleToApprover(user);
      result.approver = {
        pendingCount: pending.length,
        pendingLongLeaveCount: pending.filter((l) => l.requiresDocuments).length,
        awaitingEmployeeCount: team.filter((l) => l.status === STATUS.INFO_REQUESTED).length,
        pendingPreview: pending.slice(0, 5),
        onLeaveToday: this.leaves.approvedTeamLeaveBetween(user, today, today),
        upcomingTeamLeave: this.leaves
          .approvedTeamLeaveBetween(user, today, addDays(today, 14))
          .filter((l) => l.fromDate > today),
      };
    }
    return result;
  }

  // ----------------------------------------------------------------- writes

  create(user, input, files = [], ctx = {}) {
    if (user.role === 'HOD') {
      throw AppError.forbidden('HOD leave is approved outside this portal because no higher approver is configured.');
    }
    const { value, workingDays, fields } = this.validateLeaveInput(input);
    const longLeave = isLongLeave(workingDays);
    if (longLeave && files.length === 0 && !fields.fromDate && !fields.toDate) {
      fields.documents = documentsRequiredMessage(workingDays);
    }
    throwIfFieldErrors(fields);

    this.assertBalance(user.id, value.leaveType, value.fromDate, workingDays);
    this.assertNoOverlap(user.id, value.fromDate, value.toDate, null, value.dayPart);
    const chain = this.resolveApprovers(user, longLeave);

    const leaveId = transaction(this.db, () => {
      const id = this.leaves.create({
        employeeId: user.id,
        ...value,
        workingDays,
        status: STATUS.PENDING,
        currentStage: chain.firstStage,
        requiresDocuments: longLeave,
        managerApproverId: chain.managerApproverId,
        hodApproverId: chain.hodApproverId,
      });
      this.saveDocuments(id, user, files);
      this.actions.add({ leaveId: id, actorId: user.id, action: 'SUBMITTED', comment: null });
      this.audit.log({
        actor: user,
        action: 'LEAVE_SUBMITTED',
        entityType: 'LEAVE',
        entityId: id,
        details: { ...value, workingDays, longLeave, documents: files.length, firstStage: chain.firstStage },
        ip: ctx.ip,
      });
      this.notifier.notify('SUBMITTED', { leave: this.leaves.findById(id), previous: null, actor: user, comment: null });
      return id;
    });

    return this.getDetail(user, leaveId);
  }

  update(user, leaveId, input, files = [], ctx = {}) {
    const leave = this.getVisibleLeave(user, leaveId);
    this.assertOwner(leave, user, 'edit');
    if (!OPEN_STATUSES.includes(leave.status)) {
      throw AppError.conflict(`Only pending requests can be edited. This request is already ${STATUS_LABEL[leave.status]}.`);
    }

    const { value, workingDays, fields } = this.validateLeaveInput(input);
    const longLeave = isLongLeave(workingDays);
    const totalDocuments = leave.documentCount + files.length;
    if (longLeave && totalDocuments === 0 && !fields.fromDate && !fields.toDate) {
      fields.documents = documentsRequiredMessage(workingDays);
    }
    throwIfFieldErrors(fields);

    const changes = describeChanges(leave, value);
    if (changes.length === 0 && files.length === 0) {
      throw AppError.validation('Nothing to save: you have not changed anything.');
    }

    this.assertBalance(user.id, value.leaveType, value.fromDate, workingDays, leave.id);
    this.assertNoOverlap(user.id, value.fromDate, value.toDate, leave.id, value.dayPart);
    const chain = this.resolveApprovers(user, longLeave);

    transaction(this.db, () => {
      const ok = this.leaves.updateDetails(leave.id, leave.status, {
        ...value,
        workingDays,
        status: STATUS.PENDING,
        currentStage: chain.firstStage,
        requiresDocuments: longLeave,
        managerApproverId: chain.managerApproverId,
        hodApproverId: chain.hodApproverId,
      });
      if (!ok) throw staleConflict();
      this.saveDocuments(leave.id, user, files);
      const summary = [...changes, files.length ? `${files.length} document(s) added` : null].filter(Boolean).join('; ');
      this.actions.add({
        leaveId: leave.id,
        actorId: user.id,
        action: 'UPDATED',
        comment: `${summary}. Approval restarted from level 1.`,
      });
      this.audit.log({
        actor: user,
        action: 'LEAVE_UPDATED',
        entityType: 'LEAVE',
        entityId: leave.id,
        details: {
          before: pick(leave, ['leaveType', 'dayPart', 'fromDate', 'toDate', 'reason', 'status', 'currentStage']),
          after: { ...value, workingDays, status: STATUS.PENDING, currentStage: chain.firstStage },
          documentsAdded: files.length,
        },
        ip: ctx.ip,
      });
      this.notifier.notify('UPDATED', { leave: this.leaves.findById(leave.id), previous: leave, actor: user, comment: null });
    });

    return this.getDetail(user, leave.id);
  }

  approve(user, leaveId, input, ctx = {}) {
    const { comment } = parseOrThrow(optionalCommentSchema, input);
    const leave = this.getVisibleLeave(user, leaveId);
    this.assertCurrentApprover(leave, user);

    const forwardToHod = leave.currentStage === STAGE.MANAGER && leave.hodApprover !== null;
    const to = forwardToHod ? { status: STATUS.PENDING, stage: STAGE.HOD } : { status: STATUS.APPROVED, stage: null };

    this.applyTransition(leave, to, {
      actor: user,
      action: 'APPROVED',
      auditAction: 'LEAVE_APPROVED',
      comment,
      details: { outcome: forwardToHod ? 'FORWARDED_TO_HOD' : 'FINAL_APPROVAL' },
      ctx,
    });
    return this.getDetail(user, leave.id);
  }

  reject(user, leaveId, input, ctx = {}) {
    const { comment } = parseOrThrow(REJECT_SCHEMA, input, 'A comment is required to reject a request.');
    const leave = this.getVisibleLeave(user, leaveId);
    this.assertCurrentApprover(leave, user);

    this.applyTransition(leave, { status: STATUS.REJECTED, stage: null }, {
      actor: user,
      action: 'REJECTED',
      auditAction: 'LEAVE_REJECTED',
      comment,
      ctx,
    });
    return this.getDetail(user, leave.id);
  }

  requestInfo(user, leaveId, input, ctx = {}) {
    const { comment } = parseOrThrow(INFO_REQUEST_SCHEMA, input, 'Tell the employee what information you need.');
    const leave = this.getVisibleLeave(user, leaveId);
    this.assertCurrentApprover(leave, user);

    // Stage is kept, so the request returns to the same approver once answered.
    this.applyTransition(leave, { status: STATUS.INFO_REQUESTED, stage: leave.currentStage }, {
      actor: user,
      action: 'INFO_REQUESTED',
      auditAction: 'LEAVE_INFO_REQUESTED',
      comment,
      ctx,
    });
    return this.getDetail(user, leave.id);
  }

  respondToInfoRequest(user, leaveId, input, files = [], ctx = {}) {
    const { comment } = parseOrThrow(RESPOND_SCHEMA, input, 'Please add a reply for your approver.');
    const leave = this.getVisibleLeave(user, leaveId);
    this.assertOwner(leave, user, 'respond to');
    if (leave.status !== STATUS.INFO_REQUESTED) {
      throw AppError.conflict('No information has been requested on this leave request.');
    }

    this.applyTransition(leave, { status: STATUS.PENDING, stage: leave.currentStage }, {
      actor: user,
      action: 'INFO_PROVIDED',
      auditAction: 'LEAVE_INFO_PROVIDED',
      comment,
      details: { documentsAdded: files.length },
      ctx,
      extra: () => {
        if (files.length) {
          this.saveDocuments(leave.id, user, files);
          this.actions.add({ leaveId: leave.id, actorId: user.id, action: 'DOCUMENTS_ADDED', comment: fileNames(files) });
        }
      },
    });
    return this.getDetail(user, leave.id);
  }

  cancel(user, leaveId, input, ctx = {}) {
    const { comment } = parseOrThrow(optionalCommentSchema, input);
    const leave = this.getVisibleLeave(user, leaveId);
    this.assertOwner(leave, user, 'cancel');

    const upcomingApproved = leave.status === STATUS.APPROVED && leave.fromDate > this.today();
    if (!OPEN_STATUSES.includes(leave.status) && !upcomingApproved) {
      const why =
        leave.status === STATUS.APPROVED
          ? 'Approved leave can only be cancelled before it starts.'
          : `This request is already ${STATUS_LABEL[leave.status]}.`;
      throw AppError.conflict(why);
    }

    this.applyTransition(leave, { status: STATUS.CANCELLED, stage: null }, {
      actor: user,
      action: 'CANCELLED',
      auditAction: 'LEAVE_CANCELLED',
      comment,
      ctx,
    });
    return this.getDetail(user, leave.id);
  }

  addDocuments(user, leaveId, files = [], ctx = {}) {
    const leave = this.getVisibleLeave(user, leaveId);
    this.assertOwner(leave, user, 'add documents to');
    if (!OPEN_STATUSES.includes(leave.status)) {
      throw AppError.conflict(`Documents can only be added while the request is pending. It is ${STATUS_LABEL[leave.status]}.`);
    }
    if (files.length === 0) {
      throw AppError.validation('Please choose at least one file to upload.', { documents: 'Please choose at least one file.' });
    }

    transaction(this.db, () => {
      this.saveDocuments(leave.id, user, files);
      this.leaves.touch(leave.id);
      this.actions.add({ leaveId: leave.id, actorId: user.id, action: 'DOCUMENTS_ADDED', comment: fileNames(files) });
      this.audit.log({
        actor: user,
        action: 'DOCUMENTS_UPLOADED',
        entityType: 'LEAVE',
        entityId: leave.id,
        details: { files: files.map((f) => ({ name: f.originalname, size: f.size, type: f.mimetype })) },
        ip: ctx.ip,
      });
      this.notifier.notify('DOCUMENTS_ADDED', { leave: this.leaves.findById(leave.id), previous: leave, actor: user, comment: fileNames(files) });
    });
    return this.getDetail(user, leave.id);
  }

  /** Returns document metadata after checking the user may view the parent request. */
  getDocumentForUser(user, documentId, ctx = {}) {
    const document = this.documents.findById(documentId);
    if (!document) throw AppError.notFound("That document doesn't exist or you don't have access to it.");
    this.getVisibleLeave(user, document.leaveId); // throws 404 when not allowed
    this.audit.log({
      actor: user,
      action: 'DOCUMENT_VIEWED',
      entityType: 'DOCUMENT',
      entityId: document.id,
      details: { leaveId: document.leaveId, name: document.originalName },
      ip: ctx.ip,
    });
    return document;
  }

  // -------------------------------------------------------------- internals

  /** Shape validation (zod) + business rules on dates. Collects every field error at once. */
  validateLeaveInput(input = {}) {
    const parsed = leaveInputSchema.safeParse(input ?? {});
    const fields = parsed.success ? {} : zodIssuesToFields(parsed.error.issues);
    let workingDays = 0;
    const fromDate = String(input?.fromDate ?? '').trim();
    const toDate = String(input?.toDate ?? '').trim();
    if (!fields.fromDate && !parseIsoDate(fromDate)) fields.fromDate = 'Start date is not a valid calendar date.';
    if (!fields.toDate && !parseIsoDate(toDate)) fields.toDate = 'End date is not a valid calendar date.';

    if (!fields.fromDate && !fields.toDate) {
      const value = parsed.success ? parsed.data : {};
      const assessment = assessDates(fromDate, toDate, this.today(), this.holidays?.dates() ?? [], value.dayPart ?? 'FULL');
      Object.assign(fields, assessment.fields);
      workingDays = assessment.workingDays;
    }
    return { value: parsed.success ? parsed.data : null, workingDays, fields };
  }

  /**
   * Level 1 = reporting manager. Level 2 = department HOD (long leave only).
   * If the reporting manager *is* the HOD (e.g. a manager applying), one HOD
   * approval covers both levels instead of asking the same person twice.
   */
  resolveApprovers(user, longLeave) {
    if (!user.managerId) {
      throw AppError.validation("You don't have a reporting manager assigned yet, so this request can't be routed. Please contact HR.");
    }
    let managerApproverId = user.managerId;
    let hodApproverId = null;

    if (longLeave) {
      const hod = this.users.findHodOfDepartment(user.departmentId);
      if (!hod) throw AppError.validation('No HOD is configured for your department, so long leave cannot be routed. Please contact HR.');
      hodApproverId = hod.id;
      if (hodApproverId === managerApproverId) managerApproverId = null;
    }
    return { managerApproverId, hodApproverId, firstStage: managerApproverId ? STAGE.MANAGER : STAGE.HOD };
  }

  assertNoOverlap(employeeId, fromDate, toDate, excludeId = null, dayPart = 'FULL') {
    const clash = this.leaves.findOverlapping(employeeId, fromDate, toDate, excludeId, dayPart);
    if (clash) {
      throw AppError.conflict(
        `These dates overlap your ${STATUS_LABEL[clash.status]} leave from ${formatHumanDate(clash.fromDate)} to ${formatHumanDate(clash.toDate)} (request #${clash.id}).`,
        { fromDate: 'Overlaps an existing leave request.', toDate: 'Overlaps an existing leave request.' },
      );
    }
  }

  getBalances(employeeId, year = this.today().slice(0, 4)) {
    const holidays = new Set(this.holidays?.dates() ?? []);
    const rows = this.leaves.leaveDaysForBalance(employeeId, year);
    const balances = {};
    for (const type of LEAVE_TYPES) {
      const allowance = POLICY.YEARLY_ALLOWANCES[type];
      let used = 0;
      let pending = 0;
      for (const row of rows) {
        if (row.leave_type !== type) continue;
        const amount = daysInYear(row, Number(year), holidays);
        if (row.status === STATUS.APPROVED) used += amount;
        else pending += amount;
      }
      balances[type] = { allowance, used, pending, available: allowance === null ? null : Math.max(0, allowance - used - pending) };
    }
    return { year: Number(year), byType: balances };
  }

  assertBalance(employeeId, leaveType, fromDate, requested, excludeId = null) {
    const allowance = POLICY.YEARLY_ALLOWANCES[leaveType];
    if (allowance === null) return;
    const year = Number(fromDate.slice(0, 4));
    const balances = this.getBalances(employeeId, String(year));
    let pending = balances.byType[leaveType].pending;
    // Editing releases the existing request's reservation before checking the new one.
    if (excludeId !== null) {
      const current = this.leaves.findById(excludeId);
      if (current?.leaveType === leaveType && current.status !== STATUS.APPROVED && current.fromDate.slice(0, 4) === String(year)) {
        pending = Math.max(0, pending - current.workingDays);
      }
    }
    const available = Math.max(0, allowance - balances.byType[leaveType].used - pending);
    if (requested > available) {
      const label = leaveType.toLowerCase();
      throw AppError.validation('Please choose a leave type with enough days available.', {
        leaveType: `Not enough ${label} leave: ${available} days left this year, ${requested} requested. Choose fewer days or Unpaid leave.`,
      });
    }
  }

  /** Loads a request, returning 404 (not 403) when the user may not see it, so ids can't be probed. */
  getVisibleLeave(user, leaveId) {
    const id = Number(leaveId);
    const leave = Number.isInteger(id) && id > 0 ? this.leaves.findById(id) : null;
    if (!leave || !canView(user, leave)) {
      throw AppError.notFound(`Leave request #${leaveId} doesn't exist or you don't have access to it.`);
    }
    return leave;
  }

  assertOwner(leave, user, verb) {
    if (leave.employeeId !== user.id) throw AppError.forbidden(`Only ${leave.employeeName} can ${verb} this request.`);
  }

  assertApproverRole(user) {
    if (!isApprover(user)) throw AppError.forbidden('Only managers and HODs can view approvals.');
  }

  assertCurrentApprover(leave, user) {
    if (leave.employeeId === user.id) throw AppError.forbidden("You can't approve or reject your own leave request.");
    if (leave.status === STATUS.INFO_REQUESTED) {
      throw AppError.conflict('This request is waiting for the employee to provide more information. You can act once they reply.');
    }
    if (leave.status !== STATUS.PENDING) {
      throw AppError.conflict(`This request is already ${STATUS_LABEL[leave.status]} and can't be changed.`);
    }
    if (currentApproverId(leave) !== user.id) {
      const who = leave.currentStage === STAGE.HOD ? `HOD approval (${leave.hodApprover.name})` : `manager approval (${leave.managerApprover.name})`;
      throw AppError.forbidden(`This request is waiting for ${who}. Only the current approver can act on it.`);
    }
  }

  /** Compare-and-set status change + timeline entry + audit log, all in one transaction. */
  applyTransition(leave, to, { actor, action, auditAction, comment, details = {}, ctx = {}, extra }) {
    transaction(this.db, () => {
      const from = { status: leave.status, stage: leave.currentStage };
      if (!this.leaves.transition(leave.id, from, to)) throw staleConflict();
      this.actions.add({ leaveId: leave.id, actorId: actor.id, action, stage: leave.currentStage, comment });
      extra?.();
      this.audit.log({
        actor,
        action: auditAction,
        entityType: 'LEAVE',
        entityId: leave.id,
        details: { from: from.status, to: to.status, stage: leave.currentStage, nextStage: to.stage, comment: comment || undefined, ...details },
        ip: ctx.ip,
      });
      // In-app notifications (same transaction, so they only exist if the change committed).
      this.notifier.notify(action, { leave: this.leaves.findById(leave.id), previous: leave, actor, comment });
    });
  }

  saveDocuments(leaveId, user, files) {
    for (const file of files) {
      this.documents.add({
        leaveId,
        uploadedBy: user.id,
        originalName: file.originalname,
        storedName: file.filename,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      });
    }
  }

  permissionsFor(leave, user) {
    const isOwner = leave.employeeId === user.id;
    const isCurrentApprover = !isOwner && leave.status === STATUS.PENDING && currentApproverId(leave) === user.id;
    const open = OPEN_STATUSES.includes(leave.status);
    const upcomingApproved = leave.status === STATUS.APPROVED && leave.fromDate > this.today();
    return {
      canApprove: isCurrentApprover,
      canReject: isCurrentApprover,
      canRequestInfo: isCurrentApprover,
      canRespond: isOwner && leave.status === STATUS.INFO_REQUESTED,
      canEdit: isOwner && open,
      canCancel: isOwner && (open || upcomingApproved),
      canAddDocuments: isOwner && open,
    };
  }
}

// ---------------------------------------------------------------------------
// Pure helpers (easy to unit test)
// ---------------------------------------------------------------------------

export function assessDates(fromDate, toDate, today, holidays = [], dayPart = 'FULL') {
  const fields = {};
  const from = parseIsoDate(fromDate);
  const to = parseIsoDate(toDate);
  if (!from) fields.fromDate = 'Start date is not a valid calendar date.';
  if (!to) fields.toDate = 'End date is not a valid calendar date.';
  if (!from || !to) return { fields, workingDays: 0 };

  if (to < from) {
    fields.toDate = "End date can't be before the start date.";
    return { fields, workingDays: 0 };
  }
  if (daysBetween(today, fromDate) < -POLICY.MAX_BACKDATE_DAYS) {
    fields.fromDate = `Leave can be backdated by at most ${POLICY.MAX_BACKDATE_DAYS} days.`;
  }
  if (daysBetween(today, toDate) > POLICY.MAX_ADVANCE_DAYS) {
    fields.toDate = 'You can plan leave up to one year in advance.';
  } else if (daysBetween(fromDate, toDate) + 1 > POLICY.MAX_SPAN_CALENDAR_DAYS) {
    fields.toDate = `A single request can cover at most ${POLICY.MAX_SPAN_CALENDAR_DAYS} days. Please split longer absences into separate requests.`;
  }

  if (dayPart !== 'FULL' && fromDate !== toDate) {
    fields.toDate = 'Half-day leave can only be requested for a single date.';
  }
  const fullWorkingDays = countWorkingDays(fromDate, toDate, holidays);
  const workingDays = dayPart === 'FULL' ? fullWorkingDays : fullWorkingDays > 0 ? 0.5 : 0;
  if (workingDays === 0 && !fields.toDate) {
    fields.toDate = 'These dates fall entirely on weekends or public holidays, so no leave is needed.';
  }
  return { fields, workingDays };
}

function daysInYear(row, year, holidays) {
  if (row.day_part && row.day_part !== 'FULL') return row.from_date.slice(0, 4) === String(year) ? 0.5 : 0;
  const from = `${year}-01-01` > row.from_date ? `${year}-01-01` : row.from_date;
  const to = `${year}-12-31` < row.to_date ? `${year}-12-31` : row.to_date;
  if (from === row.from_date && to === row.to_date) return row.working_days;
  return countWorkingDays(from, to, holidays);
}

export function canView(user, leave) {
  return (
    leave.employeeId === user.id ||
    leave.employeeManagerId === user.id ||
    leave.managerApprover?.id === user.id ||
    leave.hodApprover?.id === user.id ||
    (user.role === 'HOD' && leave.departmentId === user.departmentId)
  );
}

export function currentApproverId(leave) {
  if (leave.currentStage === STAGE.MANAGER) return leave.managerApprover?.id ?? null;
  if (leave.currentStage === STAGE.HOD) return leave.hodApprover?.id ?? null;
  return null;
}

const isApprover = (user) => user.role === 'MANAGER' || user.role === 'HOD';

function normalizeStatus(status) {
  if (!status) return undefined;
  const upper = String(status).toUpperCase();
  if (!Object.values(STATUS).includes(upper)) {
    throw AppError.validation(`Unknown status filter "${status}". Use one of: ${Object.values(STATUS).join(', ')}.`);
  }
  return upper;
}

function documentsRequiredMessage(workingDays) {
  return `This leave is ${workingDays} working days. Leave of more than ${POLICY.LONG_LEAVE_THRESHOLD_DAYS} working days needs a supporting document (for example a medical certificate or travel booking).`;
}

function throwIfFieldErrors(fields) {
  if (Object.keys(fields).length) throw AppError.validation('Please fix the highlighted fields.', fields);
}

const staleConflict = () => AppError.conflict('This request was just updated by someone else. Please refresh to see its latest status.');

function describeChanges(before, after) {
  const changes = [];
  if (before.leaveType !== after.leaveType) changes.push(`Type ${before.leaveType} -> ${after.leaveType}`);
  if ((before.dayPart ?? 'FULL') !== after.dayPart) changes.push(`Day part ${(before.dayPart ?? 'FULL')} -> ${after.dayPart}`);
  if (before.fromDate !== after.fromDate || before.toDate !== after.toDate) {
    changes.push(
      `Dates ${formatHumanDate(before.fromDate)} - ${formatHumanDate(before.toDate)} -> ${formatHumanDate(after.fromDate)} - ${formatHumanDate(after.toDate)}`,
    );
  }
  if (before.reason !== after.reason) changes.push('Reason updated');
  return changes;
}

const fileNames = (files) => files.map((f) => f.originalname).join(', ');
const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));
const byFromDateAsc = (a, b) => a.fromDate.localeCompare(b.fromDate);

function toPublicDocument(doc) {
  const { storedName, ...rest } = doc; // never expose the on-disk name
  return rest;
}
