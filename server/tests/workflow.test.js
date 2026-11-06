import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { openDatabase } from '../src/db/database.js';
import { createApp, createServices } from '../src/app.js';
import { AuthService } from '../src/services/AuthService.js';

// Fixed "today" (Friday 6 Nov 2026) so date rules are deterministic.
const clock = () => new Date(2026, 10, 6, 10, 0, 0);
const PASSWORD = 'Password@123';
const PDF = Buffer.from('%PDF-1.4\n%test\n');

let app, db, uploadDir;

before(() => {
  uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-test-'));
  const config = { jwtSecret: 'test-secret', sessionHours: 1, cookieSecure: false, loginRateLimit: 1000, uploadDir, clientDist: '/nonexistent' };
  db = openDatabase(':memory:');
  const services = createServices(db, config, { clock });
  const hash = AuthService.hashPassword(PASSWORD);
  const { users } = services;

  const eng = users.createDepartment('Engineering');
  const ops = users.createDepartment('Operations');
  const hod = users.create({ name: 'Hod', email: 'hod@test.dev', passwordHash: hash, role: 'HOD', departmentId: eng });
  const mgr = users.create({ name: 'Manager', email: 'mgr@test.dev', passwordHash: hash, role: 'MANAGER', departmentId: eng, managerId: hod });
  users.create({ name: 'Emp', email: 'emp@test.dev', passwordHash: hash, role: 'EMPLOYEE', departmentId: eng, managerId: mgr });
  const opsHod = users.create({ name: 'Ops Hod', email: 'opshod@test.dev', passwordHash: hash, role: 'HOD', departmentId: ops });
  users.create({ name: 'Ops Mgr', email: 'opsmgr@test.dev', passwordHash: hash, role: 'MANAGER', departmentId: ops, managerId: opsHod });

  app = createApp({ db, config, services });
});

after(() => fs.rmSync(uploadDir, { recursive: true, force: true }));

async function login(email) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: PASSWORD });
  assert.equal(res.status, 200, res.text);
  return agent;
}

function submitWithDocument(agent, fields, fileName = 'certificate.pdf', content = PDF) {
  const req = agent.post('/api/leaves');
  for (const [k, v] of Object.entries(fields)) req.field(k, v);
  return req.attach('documents', content, fileName);
}

describe('authentication', () => {
  test('rejects wrong password with a friendly message', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'emp@test.dev', password: 'wrong' });
    assert.equal(res.status, 401);
    assert.match(res.body.error.message, /not correct/);
  });

  test('protects API routes', async () => {
    const res = await request(app).get('/api/leaves');
    assert.equal(res.status, 401);
  });
});

describe('short leave (<= 3 working days): manager approval only', () => {
  test('employee submits, manager approves -> APPROVED', async () => {
    const emp = await login('emp@test.dev');
    const mgr = await login('mgr@test.dev');

    const created = await emp.post('/api/leaves').send({ employeeName: 'Emp', fromDate: '2026-11-09', toDate: '2026-11-10', reason: 'Family function' });
    assert.equal(created.status, 201, created.text);
    const leave = created.body.leave;
    assert.equal(leave.status, 'PENDING');
    assert.equal(leave.currentStage, 'MANAGER');
    assert.equal(leave.workingDays, 2);
    assert.equal(leave.hodApprover, null);

    const pending = await mgr.get('/api/approvals/pending');
    assert.ok(pending.body.items.some((l) => l.id === leave.id));

    const approved = await mgr.post(`/api/leaves/${leave.id}/approve`).send({ comment: 'Enjoy' });
    assert.equal(approved.status, 200, approved.text);
    assert.equal(approved.body.leave.status, 'APPROVED');
    assert.deepEqual(approved.body.leave.timeline.map((a) => a.action), ['SUBMITTED', 'APPROVED']);

    const again = await mgr.post(`/api/leaves/${leave.id}/approve`).send({});
    assert.equal(again.status, 409);
  });

  test('rejects overlapping requests', async () => {
    const emp = await login('emp@test.dev');
    const res = await emp.post('/api/leaves').send({ fromDate: '2026-11-10', toDate: '2026-11-10', reason: 'Overlap check' });
    assert.equal(res.status, 409);
    assert.match(res.body.error.message, /overlap/);
  });
});

describe('long leave (> 3 working days): documents + Manager then HOD', () => {
  test('requires a supporting document', async () => {
    const emp = await login('emp@test.dev');
    const res = await emp.post('/api/leaves').send({ fromDate: '2026-11-16', toDate: '2026-11-20', reason: 'Surgery and recovery' });
    assert.equal(res.status, 400);
    assert.match(res.body.error.fields.documents, /supporting document/);
  });

  test('goes through both approval levels', async () => {
    const emp = await login('emp@test.dev');
    const mgr = await login('mgr@test.dev');
    const hod = await login('hod@test.dev');
    const outsider = await login('opsmgr@test.dev');

    const created = await submitWithDocument(emp, { leaveType: 'SICK', fromDate: '2026-11-16', toDate: '2026-11-20', reason: 'Surgery and recovery' });
    assert.equal(created.status, 201, created.text);
    const leave = created.body.leave;
    assert.equal(leave.requiresDocuments, true);
    assert.equal(leave.workingDays, 5);
    assert.equal(leave.documents.length, 1);
    assert.equal(leave.documents[0].storedName, undefined, 'on-disk name must not leak');

    // HOD cannot skip the manager.
    const early = await hod.post(`/api/leaves/${leave.id}/approve`).send({});
    assert.equal(early.status, 403);

    // Manager can view the document; a manager from another department cannot even see it exists.
    const docId = leave.documents[0].id;
    const view = await mgr.get(`/api/documents/${docId}`);
    assert.equal(view.status, 200);
    assert.equal(view.headers['content-type'], 'application/pdf');
    assert.equal((await outsider.get(`/api/documents/${docId}`)).status, 404);
    assert.equal((await outsider.get(`/api/leaves/${leave.id}`)).status, 404);

    const step1 = await mgr.post(`/api/leaves/${leave.id}/approve`).send({ comment: 'OK from my side' });
    assert.equal(step1.body.leave.status, 'PENDING');
    assert.equal(step1.body.leave.currentStage, 'HOD');

    const step2 = await hod.post(`/api/leaves/${leave.id}/approve`).send({ comment: 'Approved' });
    assert.equal(step2.body.leave.status, 'APPROVED');
    assert.deepEqual(step2.body.leave.timeline.map((a) => `${a.action}:${a.stage ?? ''}`), ['SUBMITTED:', 'APPROVED:MANAGER', 'APPROVED:HOD']);
  });

  test("a manager's long leave needs only the HOD (no duplicate approval)", async () => {
    const mgr = await login('mgr@test.dev');
    const res = await submitWithDocument(mgr, { fromDate: '2026-12-07', toDate: '2026-12-11', reason: 'Annual vacation' });
    assert.equal(res.status, 201, res.text);
    assert.equal(res.body.leave.currentStage, 'HOD');
    assert.equal(res.body.leave.managerApprover, null);
  });

  test('rejects unsupported file types', async () => {
    const emp = await login('emp@test.dev');
    const res = await submitWithDocument(emp, { fromDate: '2026-12-14', toDate: '2026-12-18', reason: 'Vacation trip' }, 'virus.exe', Buffer.from('MZ'));
    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /not a supported file/);
  });
});

describe('reject / request info / respond / edit / cancel', () => {
  test('reject needs a comment', async () => {
    const emp = await login('emp@test.dev');
    const mgr = await login('mgr@test.dev');
    const { body } = await emp.post('/api/leaves').send({ fromDate: '2026-11-23', toDate: '2026-11-23', reason: 'Personal work' });

    const noComment = await mgr.post(`/api/leaves/${body.leave.id}/reject`).send({});
    assert.equal(noComment.status, 400);
    assert.ok(noComment.body.error.fields.comment);

    const rejected = await mgr.post(`/api/leaves/${body.leave.id}/reject`).send({ comment: 'Release week' });
    assert.equal(rejected.body.leave.status, 'REJECTED');
  });

  test('request info -> employee responds -> back to same approver', async () => {
    const emp = await login('emp@test.dev');
    const mgr = await login('mgr@test.dev');
    const { body } = await emp.post('/api/leaves').send({ fromDate: '2026-11-24', toDate: '2026-11-25', reason: 'Friend wedding' });
    const id = body.leave.id;

    const asked = await mgr.post(`/api/leaves/${id}/request-info`).send({ comment: 'Who covers on-call?' });
    assert.equal(asked.body.leave.status, 'INFO_REQUESTED');

    const blocked = await mgr.post(`/api/leaves/${id}/approve`).send({});
    assert.equal(blocked.status, 409);

    const employeeView = await emp.get(`/api/leaves/${id}`);
    assert.equal(employeeView.body.leave.infoRequest.comment, 'Who covers on-call?');
    assert.equal(employeeView.body.leave.permissions.canRespond, true);

    const replied = await emp.post(`/api/leaves/${id}/respond`).send({ comment: 'Ananya will cover.' });
    assert.equal(replied.body.leave.status, 'PENDING');
    assert.equal(replied.body.leave.currentStage, 'MANAGER');
  });

  test('editing restarts the approval chain', async () => {
    const emp = await login('emp@test.dev');
    const mgr = await login('mgr@test.dev');
    const created = await submitWithDocument(emp, { fromDate: '2026-12-21', toDate: '2026-12-25', reason: 'Year end holiday' });
    const id = created.body.leave.id;
    await mgr.post(`/api/leaves/${id}/approve`).send({});

    const edited = await emp.patch(`/api/leaves/${id}`).send({ leaveType: 'EARNED', fromDate: '2026-12-21', toDate: '2026-12-22', reason: 'Year end holiday' });
    assert.equal(edited.status, 200, edited.text);
    assert.equal(edited.body.leave.currentStage, 'MANAGER');
    assert.equal(edited.body.leave.hodApprover, null, 'now a short leave');
    assert.equal(edited.body.leave.timeline.at(-1).action, 'UPDATED');
  });

  test('employee can cancel; nobody else can', async () => {
    const emp = await login('emp@test.dev');
    const mgr = await login('mgr@test.dev');
    const { body } = await emp.post('/api/leaves').send({ fromDate: '2026-12-28', toDate: '2026-12-28', reason: 'Personal errand' });

    assert.equal((await mgr.post(`/api/leaves/${body.leave.id}/cancel`).send({})).status, 403);
    const cancelled = await emp.post(`/api/leaves/${body.leave.id}/cancel`).send({});
    assert.equal(cancelled.body.leave.status, 'CANCELLED');
  });

  test('employees cannot use approver endpoints', async () => {
    const emp = await login('emp@test.dev');
    assert.equal((await emp.get('/api/approvals/pending')).status, 403);
    assert.equal((await emp.post('/api/leaves/1/approve').send({})).status, 403);
  });
});

describe('audit log', () => {
  test('HOD can read the department audit trail; employees cannot', async () => {
    const hod = await login('hod@test.dev');
    const emp = await login('emp@test.dev');
    const res = await hod.get('/api/audit-logs');
    assert.equal(res.status, 200);
    const actions = new Set(res.body.items.map((i) => i.action));
    for (const a of ['LOGIN_SUCCESS', 'LEAVE_SUBMITTED', 'LEAVE_APPROVED', 'DOCUMENT_VIEWED']) assert.ok(actions.has(a), a);
    assert.equal((await emp.get('/api/audit-logs')).status, 403);
  });

  test('audit rows are append-only at the database level', () => {
    assert.throws(() => db.prepare('DELETE FROM audit_logs').run(), /append-only/);
    assert.throws(() => db.prepare("UPDATE audit_logs SET action = 'X'").run(), /append-only/);
  });
});
