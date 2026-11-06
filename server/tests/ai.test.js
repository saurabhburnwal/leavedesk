import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AiService, loadPolicySections, retrieveSections } from '../src/services/AiService.js';

const user = { id: 1, name: 'Emp', role: 'EMPLOYEE' };
const audit = { entries: [], log(e) { this.entries.push(e); } };
const leaveService = { getBalances: () => ({ year: 2026, byType: { SICK: { allowance: 10, used: 4, pending: 0, available: 6 } } }) };
const clock = () => new Date(2026, 10, 6, 10); // Friday 6 Nov 2026

/** Fake Groq: returns the given object as the model's JSON answer. */
const fakeFetch = (content) => async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }) });
const service = (content, apiKey = 'test-key') =>
  new AiService({ apiKey, model: 'test-model', audit, leaveService, leaves: {}, clock, fetchImpl: fakeFetch(content) });

test('retrieval finds the relevant policy sections (RAG)', () => {
  const sections = loadPolicySections();
  const hits = retrieveSections('Do I need a document for 4 days of leave?', sections);
  assert.equal(hits[0].title, 'Long leave, supporting documents and two-level approval');
  assert.equal(retrieveSections('half day afternoon', sections)[0].title, 'Half-day leave');
});

test('AI features are disabled without an API key', async () => {
  await assert.rejects(service({}, null).suggestLeave(user, { text: 'tomorrow off' }), (e) => e.status === 503);
});

test('valid suggestions are returned and audited', async () => {
  const s = service({ leaveType: 'CASUAL', fromDate: '2026-11-09', toDate: '2026-11-11', dayPart: 'FULL', reason: 'Sister wedding' });
  const { suggestion } = await s.suggestLeave(user, { text: 'next Mon to Wed for my sister wedding' });
  assert.deepEqual([suggestion.leaveType, suggestion.fromDate, suggestion.toDate], ['CASUAL', '2026-11-09', '2026-11-11']);
  assert.equal(audit.entries.at(-1).action, 'AI_LEAVE_SUGGESTION');
});

test('model output is validated like user input (bad JSON is rejected, not trusted)', async () => {
  const bad = service({ leaveType: 'VACATION', fromDate: '2026-11-11', toDate: '2026-11-09', reason: 'x' });
  await assert.rejects(bad.suggestLeave(user, { text: 'some leave please' }), (e) => e.status === 400);
});

test('policy answers only cite real policy sections', async () => {
  const s = service({ answer: 'You have 6 sick days left.', sources: ['Leave types and yearly allowance', 'Made-up section'] });
  const result = await s.askPolicy(user, { text: 'How many sick days do I have left?' });
  assert.deepEqual(result.sources, ['Leave types and yearly allowance']);
});
