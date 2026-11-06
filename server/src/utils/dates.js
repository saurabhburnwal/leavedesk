/**
 * Date helpers. Leave dates are calendar dates ("YYYY-MM-DD"), not instants,
 * so all arithmetic is done in UTC to avoid timezone / DST off-by-one bugs.
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Returns a UTC Date for a valid ISO date string, otherwise null (rejects 2026-02-30). */
export function parseIsoDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const valid = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  return valid ? date : null;
}

export const toIsoDate = (date) => date.toISOString().slice(0, 10);

/** Today's date in the server's local timezone, as YYYY-MM-DD. */
export function todayIso(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(iso, days) {
  const date = parseIsoDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

/** Whole days between two ISO dates (to - from). */
export function daysBetween(fromIso, toIso) {
  return Math.round((parseIsoDate(toIso) - parseIsoDate(fromIso)) / DAY_MS);
}

export const isWeekend = (date) => date.getUTCDay() === 0 || date.getUTCDay() === 6;

/**
 * Counts working days (Mon-Fri) between two ISO dates, inclusive.
 * O(n) over the span; the span is capped by policy (60 days) so this is cheap.
 */
export function countWorkingDays(fromIso, toIso) {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (!from || !to || to < from) return 0;

  let count = 0;
  for (const day = new Date(from); day <= to; day.setUTCDate(day.getUTCDate() + 1)) {
    if (!isWeekend(day)) count += 1;
  }
  return count;
}

/** Human-friendly date for messages, e.g. "2 Nov 2026". */
export function formatHumanDate(iso) {
  const date = parseIsoDate(iso);
  if (!date) return iso;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
