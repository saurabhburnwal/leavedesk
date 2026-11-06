// ------------------------------------------------------------------ dates
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

export function todayIso() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(iso, days) {
  const date = parseIsoDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const daysBetween = (from, to) => Math.round((parseIsoDate(to) - parseIsoDate(from)) / 86400000);

/** Mirrors the server rule: Mon-Fri between the two dates, inclusive. (The server re-checks.) */
export function countWorkingDays(fromIso, toIso) {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (!from || !to || to < from) return 0;
  let count = 0;
  for (const d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

export function formatDate(iso, { weekday = false } = {}) {
  const date = parseIsoDate(iso);
  if (!date) return iso || '';
  return date.toLocaleDateString('en-GB', {
    weekday: weekday ? 'short' : undefined,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatRange(from, to, { short = false } = {}) {
  const fmt = short ? formatShortDate : (d) => formatDate(d, { weekday: true });
  if (from === to) return fmt(from);
  return `${fmt(from)} → ${fmt(to)}`;
}

/** "16 Nov" (adds the year only when it isn't the current year). */
export function formatShortDate(iso) {
  const date = parseIsoDate(iso);
  if (!date) return iso || '';
  const sameYear = date.getUTCFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric', timeZone: 'UTC' });
}

export function formatDateTime(isoInstant) {
  if (!isoInstant) return '';
  return new Date(isoInstant).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function timeAgo(isoInstant) {
  const seconds = Math.round((Date.now() - new Date(isoInstant).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return formatDateTime(isoInstant);
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ------------------------------------------------------------ domain labels
export const STATUS_META = {
  PENDING: { label: 'Pending', tone: 'pending' },
  INFO_REQUESTED: { label: 'Info requested', tone: 'info' },
  APPROVED: { label: 'Approved', tone: 'approved' },
  REJECTED: { label: 'Rejected', tone: 'rejected' },
  CANCELLED: { label: 'Cancelled', tone: 'cancelled' },
};

export const STAGE_LABEL = { MANAGER: 'Manager', HOD: 'HOD' };

export const LEAVE_TYPE_META = {
  CASUAL: { label: 'Casual leave', short: 'Casual' },
  SICK: { label: 'Sick leave', short: 'Sick' },
  EARNED: { label: 'Earned leave', short: 'Earned' },
  UNPAID: { label: 'Unpaid leave', short: 'Unpaid' },
};

export const ROLE_LABEL = { EMPLOYEE: 'Employee', MANAGER: 'Manager', HOD: 'Head of Department' };

export const isApproverRole = (role) => role === 'MANAGER' || role === 'HOD';

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

export function pluralize(n, word, plural = `${word}s`) {
  return `${n} ${n === 1 ? word : plural}`;
}
