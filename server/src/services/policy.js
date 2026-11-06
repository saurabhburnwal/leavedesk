/**
 * Business rules in one place, so they are easy to find, explain and change.
 */
export const POLICY = Object.freeze({
  /** More than this many working days = "long leave": documents + Manager AND HOD approval. */
  LONG_LEAVE_THRESHOLD_DAYS: 3,
  /** A single request may span at most this many calendar days. */
  MAX_SPAN_CALENDAR_DAYS: 60,
  /** Leave can be applied retroactively (e.g. sick leave) up to this many days back. */
  MAX_BACKDATE_DAYS: 30,
  /** Leave can be planned up to this many days ahead. */
  MAX_ADVANCE_DAYS: 365,
  REASON_MIN: 5,
  REASON_MAX: 500,
  COMMENT_MIN: 3,
  COMMENT_MAX: 1000,
  MAX_FILES_PER_UPLOAD: 5,
  MAX_FILE_SIZE_MB: 5,
});

export const LEAVE_TYPES = Object.freeze(['CASUAL', 'SICK', 'EARNED', 'UNPAID']);

export const STATUS = Object.freeze({
  PENDING: 'PENDING',
  INFO_REQUESTED: 'INFO_REQUESTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
});

export const STAGE = Object.freeze({ MANAGER: 'MANAGER', HOD: 'HOD' });

export const OPEN_STATUSES = Object.freeze([STATUS.PENDING, STATUS.INFO_REQUESTED]);

/** Statuses that "occupy" dates; a new request may not overlap these. */
export const ACTIVE_STATUSES = Object.freeze([STATUS.PENDING, STATUS.INFO_REQUESTED, STATUS.APPROVED]);

export const ALLOWED_UPLOADS = Object.freeze({
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
});

export const isLongLeave = (workingDays) => workingDays > POLICY.LONG_LEAVE_THRESHOLD_DAYS;
