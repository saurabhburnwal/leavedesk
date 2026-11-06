import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db/database.js';
import { AuditRepository } from '../src/repositories/AuditRepository.js';

test('audit log hash chain detects edits and deletions', () => {
  const db = openDatabase(':memory:');
  const audit = new AuditRepository(db);
  for (let i = 1; i <= 5; i++) audit.log({ actorEmail: `user${i}@test.dev`, action: 'LOGIN_SUCCESS', details: { n: i } });

  assert.deepEqual(audit.verifyIntegrity(), { valid: true, checked: 5, brokenAtId: null, reason: null });

  // Simulate someone bypassing the app: drop the protective trigger and edit a row directly.
  db.exec('DROP TRIGGER trg_audit_no_update');
  db.prepare(`UPDATE audit_logs SET details = '{"n":99}' WHERE id = 3`).run();
  const tampered = audit.verifyIntegrity();
  assert.equal(tampered.valid, false);
  assert.equal(tampered.brokenAtId, 3);
  assert.match(tampered.reason, /modified/);
});

test('deleting an entry breaks the chain at the next row', () => {
  const db = openDatabase(':memory:');
  const audit = new AuditRepository(db);
  for (let i = 1; i <= 4; i++) audit.log({ action: 'LEAVE_SUBMITTED', entityType: 'LEAVE', entityId: i });

  db.exec('DROP TRIGGER trg_audit_no_delete');
  db.prepare('DELETE FROM audit_logs WHERE id = 2').run();
  const result = audit.verifyIntegrity();
  assert.equal(result.valid, false);
  assert.equal(result.brokenAtId, 3);
  assert.match(result.reason, /removed or changed/);
});
