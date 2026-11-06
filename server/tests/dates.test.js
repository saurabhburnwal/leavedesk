import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countWorkingDays, parseIsoDate } from '../src/utils/dates.js';
import { assessDates } from '../src/services/LeaveService.js';

test('countWorkingDays skips weekends and is inclusive', () => {
  assert.equal(countWorkingDays('2026-11-02', '2026-11-06'), 5); // Mon-Fri
  assert.equal(countWorkingDays('2026-11-06', '2026-11-09'), 2); // Fri-Mon
  assert.equal(countWorkingDays('2026-11-07', '2026-11-08'), 0); // Sat-Sun
  assert.equal(countWorkingDays('2026-11-01', '2026-11-05'), 4); // sample payload: Sun-Thu
  assert.equal(countWorkingDays('2026-11-04', '2026-11-04'), 1);
});

test('countWorkingDays skips public holidays too', () => {
  assert.equal(countWorkingDays('2026-11-02', '2026-11-06', ['2026-11-04']), 4);
  assert.equal(countWorkingDays('2026-11-04', '2026-11-04', ['2026-11-04']), 0);
});

test('parseIsoDate rejects impossible dates', () => {
  assert.equal(parseIsoDate('2026-02-30'), null);
  assert.equal(parseIsoDate('2026-13-01'), null);
  assert.equal(parseIsoDate('06-11-2026'), null);
  assert.ok(parseIsoDate('2028-02-29'));
});

test('assessDates enforces the business rules', () => {
  const today = '2026-11-06';
  assert.match(assessDates('2026-11-10', '2026-11-09', today).fields.toDate, /before the start date/);
  assert.match(assessDates('2026-09-01', '2026-09-02', today).fields.fromDate, /backdated/);
  assert.match(assessDates('2027-12-01', '2027-12-02', today).fields.toDate, /one year/);
  assert.match(assessDates('2026-11-09', '2027-01-30', today).fields.toDate, /at most 60 days/);
  assert.match(assessDates('2026-11-07', '2026-11-08', today).fields.toDate, /weekend/);
  assert.deepEqual(assessDates('2026-11-09', '2026-11-13', today), { fields: {}, workingDays: 5 });
  assert.equal(assessDates('2026-11-09', '2026-11-13', today, ['2026-11-11']).workingDays, 4);
  assert.equal(assessDates('2026-11-09', '2026-11-09', today, [], 'FIRST_HALF').workingDays, 0.5);
  assert.match(assessDates('2026-11-09', '2026-11-10', today, [], 'FIRST_HALF').fields.toDate, /single date/);
});
