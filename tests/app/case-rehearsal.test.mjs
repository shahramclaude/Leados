import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildDemoState } from '../../app/core/demo.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { mitigationPatch, mitigationSensitivity, rehearseCaseMitigation, rehearsalBrief } from '../../app/services/caseRehearsal.js';
import { caseRehearsalPanel } from '../../app/views/caseRehearsal.js';
const now = new Date('2026-10-28T12:00:00Z');
const input = { residualSeverity: 5, residualProbability: 2, residualDetectability: 3, mitigationCost: 100 };

test('numeric assumptions are complete, finite, integral ratings and bounded costs', () => {
  assert.equal(mitigationPatch(input).ok, true);
  for (const patch of [{ residualSeverity: '' }, { residualProbability: 2.1 }, { residualDetectability: 11 }, { mitigationCost: -1 }, { mitigationCost: Infinity }, { mitigationCost: '' }]) {
    assert.equal(mitigationPatch({ ...input, ...patch }).ok, false);
  }
});

test('actual source action and production cascade run deterministically without live mutation or free-text leaks', () => {
  const s = buildDemoState(now); const c = s.cases[0];
  c.title = 'SECRET CASE'; s.conflicts.forEach((row) => { row.title = 'SECRET CONFLICT'; });
  const before = JSON.stringify(s);
  const a = rehearseCaseMitigation(s, c.id, input, { now });
  assert.equal(a.ok, true, a.error);
  assert.equal(a.proposed.failureCount, 0);
  for (const collection of ['people', 'delegations', 'decisions', 'links']) {
    assert.ok(a.proposed.changes.some((r) => r.collection === collection));
  }
  assert.ok(a.proposed.graphDelta.relationships.some((r) => r.relation === 'coaches'));
  assert.equal(a.proposed.residualRpn, 30);
  assert.equal(a.patch.financial.mitigationCost, (c.financial.mitigationCost || 0) + 100);
  assert.equal(a.incrementalCost, 100);
  assert.deepEqual(a, rehearseCaseMitigation(s, c.id, input, { now }));
  assert.equal(JSON.stringify(s), before);
  assert.doesNotMatch(JSON.stringify(a), /SECRET/);
  assert.doesNotMatch(rehearsalBrief(a), /SECRET/);
});

test('numeric risk economics uses explicit residual baseline and Savage regret, not default mitigation benefit', () => {
  const c = { fmea: { severity: 8, probability: 8, detectability: 6 }, financial: { optimistic: 100, mostLikely: 200, pessimistic: 1000, currency: 'DKK' } };
  const patch = mitigationPatch({ ...input, mitigationCost: 100 }).patch;
  const r = mitigationSensitivity(c, patch);
  assert.equal(r.rows[0].hold, 80); assert.equal(r.rows[0].proposed, 120);
  assert.equal(r.rows[0].proposedRegret, 40);
  assert.equal(r.holdRegret, 500); assert.equal(r.proposedRegret, 40);
  assert.equal(r.preference, 'Proposed mitigation'); assert.equal(r.breakEvenLoss, 166.67);
  c.fmea = { ...c.fmea, residualSeverity: 5, residualProbability: 2, residualDetectability: 3 };
  const same = mitigationSensitivity(c, patch);
  assert.equal(same.baselineSource, 'recorded residual');
  assert.equal(same.preference, 'Hold current plan'); assert.equal(same.breakEvenLoss, null);
  assert.equal(mitigationSensitivity({ ...c, financial: {} }, patch).available, false);
});

test('live update path matches rehearsal collection effects on a fresh real case', () => {
  const data = new Map(); let seq = 0;
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  const store = createStore({ storage, now: () => now, idFactory: (p) => `${p}-test-${++seq}` }); store.load();
  const api = createApi(store, { now: () => now, idFactory: (p) => `${p}-test-${++seq}` });
  const added = api.addCase({ title: 'Supplier outage', kind: 'incident', openedOn: '2026-10-28', fmea: { severity: 9, probability: 8, detectability: 7 }, financial: { optimistic: 1000, mostLikely: 3000, pessimistic: 9000 }, stakeholders: [{ name: 'Sponsor', power: 5, interest: 5, stance: 'skeptical' }] });
  assert.equal(added.ok, true, added.error);
  const r = rehearseCaseMitigation(store.state, added.id, input, { now }); assert.equal(r.ok, true, r.error);
  const before = JSON.parse(JSON.stringify(store.state));
  assert.equal(api.updateCase(added.id, r.patch).ok, true);
  for (const row of r.proposed.changes) {
    assert.equal(store.state[row.collection].length - before[row.collection].length, row.created - row.removed, row.collection);
  }
  assert.equal(store.state.cases[0].fmea.residualProbability, 2);
  assert.ok(store.state.links.some((l) => l.relation === 'communicates'));
});

test('missing, closed, invalid and unsupported workspaces fail without mutation; paused automation stays paused', () => {
  const s = buildDemoState(now); const c = s.cases[0];
  assert.equal(rehearseCaseMitigation(s, 'missing', input, { now }).ok, false);
  c.status = 'closed'; assert.equal(rehearseCaseMitigation(s, c.id, input, { now }).ok, false);
  c.status = 'open'; c.autoPropagate = false;
  assert.equal(rehearseCaseMitigation(s, c.id, input, { now }).proposed.automationEnabled, false);
  s.schemaVersion = 999;
  assert.equal(rehearseCaseMitigation(s, c.id, input, { now }).ok, false);
});

test('keyboard-labelled lab renders, compares asynchronously and invalidates changed assumptions', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const oldDocument = globalThis.document; const oldNode = globalThis.Node;
  globalThis.document = dom.window.document; globalThis.Node = dom.window.Node;
  try {
    const s = buildDemoState(now); const before = JSON.stringify(s);
    const view = caseRehearsalPanel({ state: s, now }); document.body.append(view);
    view.querySelector('select').value = s.cases[0].id;
    for (const [key, value] of Object.entries(input)) view.querySelector(`#rehearsal-${key}`).value = value;
    const run = [...view.querySelectorAll('button')].find((b) => b.textContent === 'Compare actual action paths');
    run.click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.match(view.textContent, /Savage minimax-regret/);
    assert.equal(JSON.stringify(s), before);
    const exportButton = [...view.querySelectorAll('button')].find((b) => b.textContent === 'Export comparison');
    assert.equal(exportButton.disabled, false);
    view.querySelector('input').dispatchEvent(new dom.window.Event('input'));
    assert.equal(exportButton.disabled, true);
    assert.doesNotMatch(view.textContent, /Conditional preference/);
  } finally { globalThis.document = oldDocument; globalThis.Node = oldNode; dom.window.close(); }
});

test('module worker entry executes serialized production rehearsal off-thread', async () => {
  const { Worker } = await import('node:worker_threads');
  const url = new URL('../../app/services/caseRehearsal.worker.js', import.meta.url).href;
  const bridge = `import { parentPort } from 'node:worker_threads';
    globalThis.self = { postMessage: (result) => parentPort.postMessage(result) };
    await import(${JSON.stringify(url)});
    parentPort.on('message', (data) => self.onmessage({ data }));`;
  const worker = new Worker(new URL('data:text/javascript,' + encodeURIComponent(bridge)), { type: 'module' });
  try {
    const s = buildDemoState(now);
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('worker timed out')), 15000);
      worker.once('message', (value) => { clearTimeout(timeout); resolve(value); });
      worker.once('error', (error) => { clearTimeout(timeout); reject(error); });
      worker.postMessage({ state: s, caseId: s.cases[0].id, input, now: now.toISOString() });
    });
    assert.equal(result.ok, true, result.error);
    assert.equal(result.proposed.residualRpn, 30);
    assert.equal(result.proposed.failureCount, 0);
  } finally { await worker.terminate(); }
});
