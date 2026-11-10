import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, normalizeState } from '../../app/core/schema.js';
import { buildGoalCarriageReport } from '../../app/core/domain/goalCarriage.js';
import { MATRIX_PANELS } from '../../app/core/domain/matrixRegistry.js';
import { renderGoalCarriagePanel } from '../../app/views/matrixGoalCarriagePanel.js';

const NOW = new Date('2026-11-10T12:00:00.000Z');
const ISO = NOW.toISOString();

function person(id, name, level, managerId = null) {
  return { id, name, level, managerId, status: 'active', createdAt: ISO };
}
function line(id, personId, managerId, shareH) {
  return { id, personId, managerId, kind: 'project', shareH, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: ISO, declaredBySeatId: null, history: [], status: 'active' };
}
function goal(id, ownerId) {
  return { id, title: `Objective ${id}`, description: '', ownerId, scope: ownerId ? 'person' : 'team', coAuthored: null, dueDate: '2026-12-31', keyResults: [], confidence: 'on-track', status: 'active', createdAt: ISO, checkins: [] };
}
function fixture() {
  const state = createEmptyState(ISO);
  state.people = [
    person('chief', 'Chief', 'vp'),
    person('functional', 'Functional manager', 'director', 'chief'),
    person('project', 'Project manager', 'director', 'chief'),
    person('worker', 'Matrix employee', 'ic', 'functional'),
  ];
  state.reportingLines = [line('worker-project', 'worker', 'project', 40)];
  state.goals = [goal('g-matrix', 'worker'), goal('g-functional', 'functional'), goal('g-leader', null), goal('g-unplaced', 'departed')];
  return normalizeState(state, { now: NOW }).state;
}

test('matrix goal carriage deduplicates within spans, exposes branch overlap, and the panel matches persisted computation', () => {
  const state = fixture();
  const before = JSON.stringify(state);
  const report = buildGoalCarriageReport(state, { now: NOW });
  const chief = report.rows.find((row) => row.spanId === 'chief');
  assert.ok(chief);
  assert.equal(report.totals.activeGoalN, 4);
  assert.equal(report.totals.multiLineGoalN, 1);
  assert.equal(report.totals.unplacedGoalN, 1);
  assert.equal(report.totals.stateReconciles, true);
  assert.equal(chief.goalN, 2, 'two active, roster-placed goals sit in the chief manager span');
  assert.equal(chief.branchAppearanceN, 3, 'the matrix-owned goal appears under both manager branches');
  assert.equal(chief.duplicateAppearanceN, 1, 'one repeated branch appearance is shown, not silently added');
  assert.equal(chief.multiLineGoalN, 1, 'the multi-manager goal remains explicitly unattributed');
  assert.equal(chief.reconciles, true);
  assert.equal(JSON.stringify(state), before, 'the reader does not mutate persisted workspace state');

  const reloaded = normalizeState(JSON.parse(before), { now: NOW }).state;
  const reloadedReport = buildGoalCarriageReport(reloaded, { now: NOW });
  assert.deepEqual(reloadedReport.totals, report.totals);
  assert.deepEqual(reloadedReport.rows, report.rows, 'computed values reproduce from the persisted bytes');

  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const names = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event'];
  const previous = new Map(names.map((key) => [key, globalThis[key]]));
  try {
    for (const key of names) globalThis[key] = key === 'window' ? dom.window : key === 'document' ? dom.window.document : dom.window[key];
    const panel = renderGoalCarriagePanel({ state: reloaded }, { now: NOW });
    const text = panel.textContent;
    assert.match(text, /Active goals4/);
    assert.match(text, /Multi-line owners1/);
    assert.match(text, /State rows sum to 4; active goals in scope: 4\. Reconciles: yes/);
    assert.match(text, /Chief2\s*3\s*1\s*1\s*reconciled/);
    assert.match(text, /Every printed span reconciles to its printed goal count: yes/);
    const redacted = renderGoalCarriagePanel({ state: reloaded }, {
      now: NOW,
      seat: { id: 'chief', rank: 4, fullAccess: false, scope: ['chief', 'functional', 'project', 'worker'], lineScope: [] },
    });
    assert.match(redacted.textContent, /Manager span \(name withheld\)/);
    assert.equal(redacted.textContent.includes('Chief'), false, 'rank four keeps the existing manager-name detail ceiling');
  } finally {
    for (const key of names) globalThis[key] = previous.get(key);
  }
  assert.ok(MATRIX_PANELS.some((panel) => panel.key === 'goal-carriage'), 'the panel is reachable from the matrix navigation');
});

test('active malformed line evidence refuses affected manager-span totals', () => {
  const state = fixture();
  state.reportingLines.push(line('bad-worker-line', 'worker', 'departed-manager', 3000));
  const report = buildGoalCarriageReport(state, { now: NOW });
  const chief = report.rows.find((row) => row.spanId === 'chief');
  assert.equal(chief.refused, true);
  assert.equal(chief.goalN, null);
  assert.equal(chief.branchAppearanceN, null);
  assert.match(chief.refusalReason, /line defect/);

  state.reportingLines.at(-1).toISO = '2026-01-02';
  const afterExpiry = buildGoalCarriageReport(state, { now: NOW });
  assert.equal(afterExpiry.rows.find((row) => row.spanId === 'chief').refused, false, 'a malformed declaration proven expired cannot poison today’s graph');
});
