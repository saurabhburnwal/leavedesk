import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { openDatabase } from '../src/db/database.js';
import { createApp, createServices } from '../src/app.js';
import { AuthService } from '../src/services/AuthService.js';

const clock = () => new Date(2026, 10, 6, 10);
const password = 'Password@123';
let app, db, uploadDir;

before(() => {
  uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leave-policy-'));
  const config = { jwtSecret: 'test-secret', sessionHours: 1, cookieSecure: false, loginRateLimit: 1000, uploadDir, clientDist: '/nonexistent' };
  db = openDatabase(':memory:');
  const services = createServices(db, config, { clock });
  const hash = AuthService.hashPassword(password);
  const department = services.users.createDepartment('Engineering');
  const hodId = services.users.create({ name: 'HOD', email: 'hod@test.dev', passwordHash: hash, role: 'HOD', departmentId: department });
  const managerId = services.users.create({ name: 'Manager', email: 'manager@test.dev', passwordHash: hash, role: 'MANAGER', departmentId: department, managerId: hodId });
  services.users.create({ name: 'Employee', email: 'employee@test.dev', passwordHash: hash, role: 'EMPLOYEE', departmentId: department, managerId });
  app = createApp({ db, config, services });
});

after(() => { db?.close(); fs.rmSync(uploadDir, { recursive: true, force: true }); });

async function login(email = 'employee@test.dev') {
  const agent = request.agent(app);
  const result = await agent.post('/api/auth/login').send({ email, password });
  assert.equal(result.status, 200, result.text);
  return agent;
}

const workdays = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-23', '2026-11-24'];
const leave = (date, extra = {}) => ({ leaveType: 'CASUAL', fromDate: date, toDate: date, reason: 'Personal plans', ...extra });

test('balances reserve pending days, allow replacement edits, and keep approval days in use', async () => {
  const employee = await login();
  const manager = await login('manager@test.dev');
  const ids = [];
  for (const date of workdays) {
    const result = await employee.post('/api/leaves').send(leave(date));
    assert.equal(result.status, 201, result.text);
    ids.push(result.body.leave.id);
  }
  const full = await employee.get('/api/leaves/balances');
  assert.deepEqual(full.body.balances.byType.CASUAL, { allowance: 12, used: 0, pending: 12, available: 0 });
  const denied = await employee.post('/api/leaves').send(leave('2026-11-25'));
  assert.equal(denied.status, 400);
  assert.match(denied.body.error.fields.leaveType, /0 days left this year, 1 requested/);

  const edited = await employee.patch(`/api/leaves/${ids[0]}`).send(leave('2026-11-25'));
  assert.equal(edited.status, 200, edited.text);
  const approved = await manager.post(`/api/leaves/${ids[0]}/approve`).send({});
  assert.equal(approved.status, 200, approved.text);
  const afterApproval = await employee.get('/api/leaves/balances');
  assert.deepEqual(afterApproval.body.balances.byType.CASUAL, { allowance: 12, used: 1, pending: 11, available: 0 });
});

test('holiday list is public to signed-in users and changes are HOD-only and audited', async () => {
  const employee = await login();
  const hod = await login('hod@test.dev');
  assert.equal((await employee.get('/api/holidays')).status, 200);
  const blocked = await employee.post('/api/holidays').send({ date: '2026-11-27', name: 'Local holiday' });
  assert.equal(blocked.status, 403);
  const added = await hod.post('/api/holidays').send({ date: '2026-11-27', name: 'Local holiday' });
  assert.equal(added.status, 201, added.text);
  const duplicate = await hod.post('/api/holidays').send({ date: '2026-11-27', name: 'Another holiday' });
  assert.equal(duplicate.status, 409);
  const leaveOnHoliday = await employee.post('/api/leaves').send(leave('2026-11-27', { leaveType: 'UNPAID' }));
  assert.equal(leaveOnHoliday.status, 400);
  assert.match(leaveOnHoliday.body.error.fields.toDate, /weekends or public holidays/);
  const removed = await hod.delete(`/api/holidays/${added.body.holiday.id}`);
  assert.equal(removed.status, 200);
  const audit = await hod.get('/api/audit-logs?action=HOLIDAY_ADDED');
  assert.ok(audit.body.items.some((row) => row.action === 'HOLIDAY_ADDED'));
});

test('half-day requests are single date only and opposite halves may coexist', async () => {
  const employee = await login();
  const first = await employee.post('/api/leaves').send(leave('2026-12-01', { leaveType: 'UNPAID', dayPart: 'FIRST_HALF' }));
  assert.equal(first.status, 201, first.text);
  assert.equal(first.body.leave.workingDays, 0.5);
  assert.equal(first.body.leave.dayPart, 'FIRST_HALF');
  const second = await employee.post('/api/leaves').send(leave('2026-12-01', { leaveType: 'UNPAID', dayPart: 'SECOND_HALF' }));
  assert.equal(second.status, 201, second.text);
  const full = await employee.post('/api/leaves').send(leave('2026-12-01', { leaveType: 'UNPAID' }));
  assert.equal(full.status, 409);
  const multi = await employee.post('/api/leaves').send({ ...leave('2026-12-02', { leaveType: 'UNPAID' }), toDate: '2026-12-03', dayPart: 'FIRST_HALF' });
  assert.equal(multi.status, 400);
  assert.match(multi.body.error.fields.toDate, /single date/);
});
