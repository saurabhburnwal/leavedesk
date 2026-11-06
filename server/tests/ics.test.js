import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLeaveIcs } from '../src/utils/ics.js';

test('builds an all-day iCalendar event with an exclusive end date and escaped text', () => {
  const ics = buildLeaveIcs(
    { id: 7, leaveType: 'SICK', fromDate: '2026-11-16', toDate: '2026-11-20', employeeName: 'John Doe', reason: 'Rest, recovery; follow-up' },
    new Date('2026-11-06T10:00:00Z'),
  );
  assert.match(ics, /BEGIN:VEVENT\r\n/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261116\r\n/);
  assert.match(ics, /DTEND;VALUE=DATE:20261121\r\n/);
  assert.match(ics, /SUMMARY:Sick leave – John Doe\r\n/);
  assert.ok(ics.includes('DESCRIPTION:Rest\\, recovery\\; follow-up\r\n'), ics);
  assert.match(ics, /UID:leave-7@leavedesk/);
});
