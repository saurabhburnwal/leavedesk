import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { openDatabase } from '../src/db/database.js';
import { createApp, createServices } from '../src/app.js';
import { AuthService } from '../src/services/AuthService.js';

const PASSWORD = 'Password@123';
let app, uploadDir, ids;

before(() => {
  uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-auth-'));
  // No resendApiKey -> demo mode: the API returns the code instead of emailing it.
  const config = { jwtSecret: 'test-secret', sessionHours: 1, cookieSecure: false, loginRateLimit: 1000, uploadDir, clientDist: '/nonexistent' };
  const db = openDatabase(':memory:');
  const services = createServices(db, config);
  const hash = AuthService.hashPassword(PASSWORD);
  const { users } = services;
  const eng = users.createDepartment('Engineering');
  const ops = users.createDepartment('Operations');
  const hod = users.create({ name: 'Hod', email: 'hod@test.dev', passwordHash: hash, role: 'HOD', departmentId: eng });
  const mgr = users.create({ name: 'Manager', email: 'mgr@test.dev', passwordHash: hash, role: 'MANAGER', departmentId: eng, managerId: hod });
  const emp = users.create({ name: 'Emp', email: 'emp@test.dev', passwordHash: hash, role: 'EMPLOYEE', departmentId: eng, managerId: mgr });
  const opsHod = users.create({ name: 'Ops Hod', email: 'opshod@test.dev', passwordHash: hash, role: 'HOD', departmentId: ops });
  ids = { eng, ops, hod, mgr, emp, opsHod };
  app = createApp({ db, config, services });
});

after(() => fs.rmSync(uploadDir, { recursive: true, force: true }));

async function login(email, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password });
  assert.equal(res.status, 200, res.text);
  return agent;
}

describe('sign-up with email verification', () => {
  test('register -> cannot sign in yet -> wrong code -> right code signs in', async () => {
    const options = await request(app).get('/api/auth/register-options');
    assert.equal(options.body.emailDelivery, 'demo');
    assert.ok(options.body.departments.find((d) => d.id === ids.eng).managers.some((m) => m.id === ids.mgr));

    const reg = await request(app)
      .post('/api/auth/register')
      .send({ name: 'New Person', email: 'New.Person@Test.dev', password: 'secret123', departmentId: ids.eng, managerId: ids.mgr });
    assert.equal(reg.status, 201, reg.text);
    assert.equal(reg.body.email, 'new.person@test.dev');
    assert.match(reg.body.demoCode, /^\d{6}$/);

    const early = await request(app).post('/api/auth/login').send({ email: 'new.person@test.dev', password: 'secret123' });
    assert.equal(early.status, 403);
    assert.equal(early.body.error.code, 'EMAIL_NOT_VERIFIED');

    const wrongCode = reg.body.demoCode === '000000' ? '111111' : '000000';
    const wrong = await request(app).post('/api/auth/verify').send({ email: 'new.person@test.dev', code: wrongCode });
    assert.equal(wrong.status, 400);
    assert.match(wrong.body.error.fields.code, /4 attempts left/);

    const agent = request.agent(app);
    const ok = await agent.post('/api/auth/verify').send({ email: 'new.person@test.dev', code: reg.body.demoCode });
    assert.equal(ok.status, 200, ok.text);
    assert.equal(ok.body.user.role, 'EMPLOYEE');
    assert.equal((await agent.get('/api/leaves')).status, 200, 'signed in after verification');
  });

  test('rejects weak passwords, managers from other departments and existing emails', async () => {
    const weak = await request(app).post('/api/auth/register').send({ name: 'A B', email: 'a@test.dev', password: 'short', departmentId: ids.eng, managerId: ids.mgr });
    assert.equal(weak.status, 400);
    assert.ok(weak.body.error.fields.password);

    const wrongDept = await request(app)
      .post('/api/auth/register')
      .send({ name: 'A B', email: 'b@test.dev', password: 'secret123', departmentId: ids.ops, managerId: ids.mgr });
    assert.equal(wrongDept.status, 400);
    assert.ok(wrongDept.body.error.fields.managerId);

    const dup = await request(app)
      .post('/api/auth/register')
      .send({ name: 'A B', email: 'emp@test.dev', password: 'secret123', departmentId: ids.eng, managerId: ids.mgr });
    assert.equal(dup.status, 409);
  });

  test('resend is rate limited by a cooldown', async () => {
    await request(app).post('/api/auth/register').send({ name: 'C D', email: 'c@test.dev', password: 'secret123', departmentId: ids.eng, managerId: ids.mgr });
    const resend = await request(app).post('/api/auth/resend-code').send({ email: 'c@test.dev' });
    assert.equal(resend.status, 429);
    assert.match(resend.body.error.message, /wait/);
  });
});

describe('team management (HOD)', () => {
  test('HOD promotes an employee to manager; employees cannot', async () => {
    const hod = await login('hod@test.dev');
    const emp = await login('emp@test.dev');
    assert.equal((await emp.get('/api/users/team')).status, 403);

    const team = await hod.get('/api/users/team');
    assert.equal(team.status, 200);
    assert.ok(team.body.members.some((m) => m.id === ids.emp));

    const promoted = await hod.patch(`/api/users/${ids.emp}`).send({ role: 'MANAGER', managerId: ids.hod });
    assert.equal(promoted.status, 200, promoted.text);
    assert.equal(promoted.body.members.find((m) => m.id === ids.emp).role, 'MANAGER');
  });

  test('cannot demote a manager who still has direct reports', async () => {
    const hod = await login('hod@test.dev');
    const res = await hod.patch(`/api/users/${ids.mgr}`).send({ role: 'EMPLOYEE', managerId: ids.hod });
    assert.equal(res.status, 409);
    assert.match(res.body.error.message, /direct report/);
  });

  test("an HOD cannot manage another department's people", async () => {
    const opsHod = await login('opshod@test.dev');
    const res = await opsHod.patch(`/api/users/${ids.mgr}`).send({ role: 'MANAGER', managerId: ids.opsHod });
    assert.equal(res.status, 404);
  });
});
