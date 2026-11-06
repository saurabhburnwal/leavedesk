import { addDays } from './dates.js';

const TYPE_LABEL = { CASUAL: 'Casual', SICK: 'Sick', EARNED: 'Earned', UNPAID: 'Unpaid' };
const DAY_PART_LABEL = { FIRST_HALF: ' (first half)', SECOND_HALF: ' (second half)' };

/** Escapes text per RFC 5545 (backslash, newline, comma, semicolon). */
const escapeText = (value) =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/[,;]/g, (c) => `\\${c}`);

const compactDate = (iso) => iso.replace(/-/g, '');

/** Builds an iCalendar file with one all-day event for an approved leave request. */
export function buildLeaveIcs(leave, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const summary = `${TYPE_LABEL[leave.leaveType] ?? leave.leaveType} leave${DAY_PART_LABEL[leave.dayPart] ?? ''} – ${leave.employeeName}`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LeaveDesk//Leave Management//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:leave-${leave.id}@leavedesk`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${compactDate(leave.fromDate)}`,
    // All-day events end on the day AFTER the last day (exclusive end).
    `DTEND;VALUE=DATE:${compactDate(addDays(leave.toDate, 1))}`,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(leave.reason)}`,
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.join('\r\n')}\r\n`;
}
