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
const PDF = Buffer.from('%PDF-1.4\n%test\n');
let app;
let db;
let uploadDir;

before(() => {
  uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notification-test-'));
  const config = { jwtSecret: 'notification-test', sessionHours: 1, cookieSecure: false, loginRateLimit: 1000, uploadDir, clientDist: '/nonexistent' };
  db = openDatabase(':memory:');
  const services = createServices(db, config);
  const hash = AuthService.hashPassword(PASSWORD);
  const departmentId = services.users.createDepartment('Engineering');
  const hod = services.users.create({ name: 'Hod', email: 'hod@test.dev', passwordHash: hash, role: 'HOD', departmentId });
  const manager = services.users.create({ name: 'Manager', email: 'manager@test.dev', passwordHash: hash, role: 'MANAGER', departmentId, managerId: hod });
  services.users.create({ name: 'Employee', email: 'employee@test.dev', passwordHash: hash, role: 'EMPLOYEE', departmentId, managerId: manager });
  app = createApp({ db, config, services });
});

after(() => fs.rmSync(uploadDir, { recursive: true, force: true }));

async function login(email) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login').send({ email, password: PASSWORD });
  assert.equal(response.status, 200, response.text);
  return agent;
}

function notifications(agent) {
  return agent.get('/api/notifications').then((response) => {
    assert.equal(response.status, 200, response.text);
    return response.body;
  });
}

describe('in-app notifications', () => {
  test('submitting notifies the current approver but not the actor', async () => {
    const employee = await login('employee@test.dev');
    const manager = await login('manager@test.dev');
    const created = await employee.post('/api/leaves').send({ fromDate: '2026-11-09', toDate: '2026-11-10', reason: 'Family function' });
    assert.equal(created.status, 201, created.text);

    const managerNotifications = await notifications(manager);
    assert.equal(managerNotifications.unread, 1);
    assert.match(managerNotifications.items[0].message, /Employee/);
    assert.equal((await notifications(employee)).unread, 0);
    await manager.post('/api/notifications/read-all');
  });

  test('manager approval of long leave notifies the HOD and employee', async () => {
    const employee = await login('employee@test.dev');
    const manager = await login('manager@test.dev');
    const hod = await login('hod@test.dev');
    const created = await employee
      .post('/api/leaves')
      .field('fromDate', '2026-12-07')
      .field('toDate', '2026-12-11')
      .field('reason', 'Surgery and recovery')
      .attach('documents', PDF, 'proof.pdf');
    assert.equal(created.status, 201, created.text);

    const approved = await manager.post(`/api/leaves/${created.body.leave.id}/approve`).send({});
    assert.equal(approved.status, 200, approved.text);
    assert.equal((await notifications(hod)).unread, 1);
    assert.match((await notifications(employee)).items[0].message, /now with/);
    assert.equal((await notifications(manager)).unread, 1);
    await manager.post('/api/notifications/read-all');
    await employee.post('/api/notifications/read-all');
  });

  test('reject sends the comment and another user cannot read it', async () => {
    const employee = await login('employee@test.dev');
    const manager = await login('manager@test.dev');
    const outsider = await login('hod@test.dev');
    const created = await employee.post('/api/leaves').send({ fromDate: '2027-01-04', toDate: '2027-01-04', reason: 'Personal work' });
    const rejected = await manager.post(`/api/leaves/${created.body.leave.id}/reject`).send({ comment: 'Please reschedule' });
    assert.equal(rejected.status, 200, rejected.text);

    const employeeNotifications = await notifications(employee);
    assert.match(employeeNotifications.items[0].message, /Please reschedule/);
    const notificationId = employeeNotifications.items[0].id;
    assert.equal((await outsider.post(`/api/notifications/${notificationId}/read`)).status, 404);
    assert.equal((await outsider.post('/api/notifications/read-all')).status, 200);
    assert.equal((await notifications(employee)).unread, 1);
  });
});
