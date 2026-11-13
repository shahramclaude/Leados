/**
 * ADR-0112 — the Boundary-redraw rehearsal (Schema unchanged, no writes).
 *
 * The Jurisdiction Compiler (ADR-0109) prices the `redraw` route but never
 * moves a reporting line. This suite defends the dry-run that comes first:
 *
 *  1. VALIDATION. Every refusal is printed: unknown person/manager, self,
 *     no-op, descendant cycle, duplicate, too many moves, leader move.
 *  2. DIFFING. A move that merges two spans COLLAPSES the cross-branch
 *     cluster; a move that splits one CREATES one; an LCA/coalition/route
 *     change is reported with both sides of the ledger.
 *  3. ROLL-UP. Persisted `rolls-up-to` finding edges are recomputed on the
 *     hypothetical tree — withdrawn and added audiences are named.
 *  4. GOVERNANCE. An unsettled governed decision whose cluster collapses
 *     ('gap-closed') or whose LCA moves ('lca-moved') is flagged stale; a
 *     SETTLED decision can never go stale.
 *  5. PURITY. The rehearsal writes NOTHING — deep-equal state before/after.
 *  6. ENFORCEMENT. rank 1–2 declared seats see a printed explanation, not a
 *     form; declared rank≥3 seats rehearse inside their own span with
 *     objective pointers replaced by ordinals; the operator view is unenforced.
 *  7. UI. The panel renders and is axe-clean.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import {
  createEmptyState, SCHEMA_VERSION,
} from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { weekKey } from '../../app/core/time.js';
import {
  rehearseBoundaryRedraw, planRedrawMoves, redrawBrief,
} from '../../app/core/domain/redrawRehearsal.js';
import { redactRehearsalReport } from '../../app/views/jurisdiction.js';
import { jurisdictionRule } from '../../app/core/domain/jurisdictionRules.js';
import { JUR_PANELS } from '../../app/core/domain/jurisdictionRegistry.js';
import { renderJurisdiction } from '../../app/views/jurisdiction.js';

const NOW = new Date('2026-11-06T10:00:00.000Z');
const clone = (v) => JSON.parse(JSON.stringify(v));

const p = (id, name, level, managerId) => ({ id, name, level, managerId, role: level, team: 'T', status: 'active' });
const c = (id, ownerId, goalId, createdOn) => ({
  id, kind: 'risk', status: 'open', title: `Work ${id}`, summary: '', ownerId, linkedGoalId: goalId, createdOn,
});

function fixture1(jurSettings = { jurEvidenceFloorN: 2, jurCellFloor: 1, jurMaterialityPct: 1 }) {
  const state = createEmptyState(NOW.toISOString());
  state.settings = { ...state.settings, chainLeaderAltitude: 'chief', ...jurSettings };
  state.people = [
    p('mgrA', 'Manager A', 'manager', null),
    p('mgrB', 'Manager B', 'manager', null),
    p('leadA1', 'Lead A One', 'lead', 'mgrA'),
    p('leadA2', 'Lead A Two', 'lead', 'mgrA'),
    p('leadB1', 'Lead B One', 'lead', 'mgrB'),
  ];
  state.goals = [
    { id: 'goal-shared', title: 'Shared objective', status: 'active' },
    { id: 'goal-local', title: 'Local objective', status: 'active' },
  ];
  state.cases = [
    c('c1', 'leadA1', 'goal-shared', '2026-11-01'),
    c('c2', 'leadB1', 'goal-shared', '2026-11-01'),
    c('c3', 'leadA2', 'goal-shared', '2026-11-02'),
    c('c4', 'leadA1', 'goal-local', '2026-11-02'),
    c('c5', 'leadA2', 'goal-local', '2026-11-03'),
  ];
  return state;
}

function fixture2(jurSettings = { jurEvidenceFloorN: 2, jurCellFloor: 1, jurMaterialityPct: 1 }) {
  const state = createEmptyState(NOW.toISOString());
  state.settings = { ...state.settings, chainLeaderAltitude: 'chief', ...jurSettings };
  state.people = [
    p('vpX', 'VP X', 'vp', null),
    p('mgrD', 'Manager D', 'manager', null),
    p('mgrC', 'Manager C', 'manager', 'vpX'),
    p('leadC1', 'Lead C One', 'lead', 'mgrC'),
    p('leadD1', 'Lead D One', 'lead', 'mgrD'),
  ];
  state.goals = [{ id: 'goal-tri', title: 'Tri objective', status: 'active' }];
  state.cases = [
    c('tc1', 'leadC1', 'goal-tri', '2026-11-01'),
    c('tc2', 'leadD1', 'goal-tri', '2026-11-01'),
    c('tc3', 'leadC1', 'goal-tri', '2026-11-03'),
  ];
  return state;
}

const scanDraft = (state) => {
  const draft = clone(state);
  jurisdictionRule(draft, {
    event: { type: 'jur.scan', entityId: 'all' }, now: NOW, settings: draft.settings,
    idFactory: (prefix) => `${prefix}-test-${Math.random().toString(36).slice(2, 8)}`,
  });
  return draft;
};

/* ---------------------------------------------------- 1. storage sanity */

test('the rehearsal introduces no schema change and no persisted collection', () => {
  assert.equal(SCHEMA_VERSION, 151);
  const state = fixture1();
  assert.deepEqual(state.jurFindings, []);
});

/* ------------------------------------------------------- 2. validation */

test('validation prints every refusal and never guesses', () => {
  const state = fixture1();
  assert.equal(planRedrawMoves(state, []).refusals[0].reasonKey, 'no-moves');
  assert.equal(planRedrawMoves(state, [{ personId: 'nope', newManagerId: 'mgrA' }]).refusals[0].reasonKey, 'unknown-person');
  assert.equal(planRedrawMoves(state, [{ personId: 'leadA1', newManagerId: 'nope' }]).refusals[0].reasonKey, 'unknown-manager');
  assert.equal(planRedrawMoves(state, [{ personId: 'leadA1', newManagerId: 'leadA1' }]).refusals[0].reasonKey, 'self-move');
  assert.equal(planRedrawMoves(state, [{ personId: 'leadA1', newManagerId: 'mgrA' }]).refusals[0].reasonKey, 'noop-move');
  assert.equal(planRedrawMoves(state, [{ personId: 'mgrA', newManagerId: 'leadA1' }]).refusals[0].reasonKey, 'cycle-move');
  assert.equal(planRedrawMoves(state, [{ personId: 'leader', newManagerId: 'mgrA' }]).refusals[0].reasonKey, 'leader-move');
  const dup = planRedrawMoves(state, [{ personId: 'leadA1', newManagerId: 'mgrB' }, { personId: 'leadA1', newManagerId: 'mgrB' }]);
  assert.equal(dup.ok, true);
  assert.equal(dup.applied.length, 1);
  assert.equal(dup.refusals[0].reasonKey, 'duplicate-move');
  const many = planRedrawMoves(state, [
    { personId: 'leadA1', newManagerId: 'mgrB' },
    { personId: 'leadA2', newManagerId: 'mgrB' },
    { personId: 'leadB1', newManagerId: 'mgrA' },
    { personId: 'mgrA', newManagerId: 'mgrB' },
  ]);
  assert.equal(many.ok, false);
  assert.equal(many.refusals[0].reasonKey, 'too-many-moves');
});

test('a refused rehearsal still reports cleanly and applies nothing', () => {
  const state = fixture1();
  const report = rehearseBoundaryRedraw(state, { moves: [{ personId: 'mgrA', newManagerId: 'leadA1' }], now: NOW });
  assert.equal(report.ok, false);
  assert.equal(report.collapseN, undefined); // no partial result leaks
  assert.equal(report.collapsed.length, 0);
  assert.equal(report.moves.length, 0);
  assert.equal(report.reason, 'cycle-move');
});

/* ------------------------------------------------------ 3. cluster diff */

test('a merge move COLLAPSES the cross-branch cluster — nothing else moves', () => {
  const state = fixture1();
  const report = rehearseBoundaryRedraw(state, { moves: [{ personId: 'leadB1', newManagerId: 'mgrA' }], now: NOW });
  assert.equal(report.ok, true);
  assert.equal(report.before.crossBranch, 1);
  assert.equal(report.after.crossBranch, 0);
  assert.equal(report.collapsed.length, 1);
  assert.equal(report.collapsed[0].objectiveKey, 'goal:goal-shared');
  assert.equal(report.created.length, 0);
  assert.equal(report.deltas.crossBranch, -1);
  assert.equal(report.oneOffUnits, 40); // declared jurRedrawUnits × 1 move
  assert.equal(report.perPeriodSaving, 12); // the priced coalition for a 2-branch cluster
  assert.equal(report.breakEvenPeriods, 4);
});

test('a split move CREATES a cross-branch objective and never claims a collapse', () => {
  const state = fixture1();
  const report = rehearseBoundaryRedraw(state, { moves: [{ personId: 'leadA2', newManagerId: 'mgrB' }], now: NOW });
  assert.equal(report.ok, true);
  assert.equal(report.created.length, 1);
  assert.equal(report.created[0].objectiveKey, 'goal:goal-local');
  assert.equal(report.collapsed.length, 0);
  assert.equal(report.deltas.crossBranch, 1);
  assert.equal(report.breakEvenPeriods, null);
  assert.match(report.breakEvenNote, /does not lower modelled coordination load/);
});

test('a parent move that keeps both branches cross-branch reports the geometry change', () => {
  const state = fixture2();
  const report = rehearseBoundaryRedraw(state, { moves: [{ personId: 'vpX', newManagerId: 'mgrD' }], now: NOW });
  assert.equal(report.ok, true);
  assert.equal(report.collapsed.length, 0);
  assert.equal(report.created.length, 0);
  assert.equal(report.changed.length, 1);
  assert.equal(report.changed[0].objectiveKey, 'goal:goal-tri');
  assert.equal(report.changed[0].lcaBeforeId, 'leader');
  assert.equal(report.changed[0].lcaAfterId, 'mgrD');
  assert.equal(report.changed[0].predictedAfter, 'escalate'); // zero rungs to the new ancestor
});

/* ------------------------------------------------- 4. roll-ups and stale */

test('persisted rolls-up-to finding edges are recomputed: withdrawn and added audiences are named', () => {
  const draft = scanDraft(fixture2());
  const finding = draft.jurFindings.find((f) => f.objectiveKey === 'goal:goal-tri');
  assert.ok(finding, 'scan froze the shared objective');
  assert.ok(finding.governedDecisionId, 'a priced finding opened a governed decision');
  const persisted = (draft.links || []).filter((l) => l.relation === 'rolls-up-to' && l.sourceType === 'jurfinding' && l.sourceId === finding.id);
  assert.ok(persisted.length >= 1, 'the finding rolled up to its spans’ ancestors');

  // A merge move collapses the cluster: the whole audience is withdrawn.
  const report = rehearseBoundaryRedraw(draft, { moves: [{ personId: 'leadD1', newManagerId: 'mgrC' }], now: NOW });
  const moved = report.rollups.moved.find((m) => m.objectiveKey === 'goal:goal-tri');
  assert.ok(moved, 'the finding roll-up is reported');
  assert.equal(moved.reason, 'gap-closed');
  assert.ok(moved.withdrawn.length >= 1, `expected an audience withdrawal, got ${JSON.stringify(moved)}`);
  assert.equal(moved.added.length, 0);
  assert.ok(report.rollups.withdrawnEdges >= 1);
});

test('an LCA move is reported edge-by-edge on a surviving cross-branch cluster', () => {
  const draft = scanDraft(fixture2());
  const finding = draft.jurFindings.find((f) => f.objectiveKey === 'goal:goal-tri');
  assert.ok(finding);
  const report = rehearseBoundaryRedraw(draft, { moves: [{ personId: 'vpX', newManagerId: 'mgrD' }], now: NOW });
  const moved = report.rollups.moved.find((m) => m.objectiveKey === 'goal:goal-tri');
  assert.ok(moved, 'the finding roll-up is reported');
  assert.equal(moved.reason, 'gap-moved');
  assert.ok(moved.withdrawn.length + moved.added.length >= 1, 'the audience changes');
});

test('an unsettled governed decision goes stale on a collapsed cluster — and a settled one never does', () => {
  const draft = scanDraft(fixture1());
  const finding = draft.jurFindings.find((f) => f.objectiveKey === 'goal:goal-shared');
  assert.ok(finding?.governedDecisionId);

  const report = rehearseBoundaryRedraw(draft, { moves: [{ personId: 'leadB1', newManagerId: 'mgrA' }], now: NOW });
  const stale = report.decisions.stale.find((d) => d.decisionId === finding.governedDecisionId);
  assert.ok(stale, 'the unsettled decision is flagged');
  assert.equal(stale.reasonKey, 'gap-closed');

  const settled = clone(draft);
  const decision = settled.decisions.find((d) => d.id === finding.governedDecisionId);
  decision.chosen = 'coalition: Minimal covering coalition';
  decision.decidedOn = '2026-11-06';
  const report2 = rehearseBoundaryRedraw(settled, { moves: [{ personId: 'leadB1', newManagerId: 'mgrA' }], now: NOW });
  assert.equal(report2.decisions.settledN, 1);
  assert.equal(report2.decisions.stale.length, 0);
});

test('an unsettled governed decision whose cluster survives but changes ancestor goes stale as lca-moved', () => {
  const draft = scanDraft(fixture2());
  const finding = draft.jurFindings.find((f) => f.objectiveKey === 'goal:goal-tri');
  assert.ok(finding?.governedDecisionId);
  const report = rehearseBoundaryRedraw(draft, { moves: [{ personId: 'vpX', newManagerId: 'mgrD' }], now: NOW });
  const stale = report.decisions.stale.find((d) => d.decisionId === finding.governedDecisionId);
  assert.ok(stale, 'the unsettled decision is flagged');
  assert.equal(stale.reasonKey, 'lca-moved');
  assert.equal(stale.toLcaId, 'mgrD');
});

/* -------------------------------------------------------------- 5. purity */

test('the rehearsal writes nothing — the input state is deep-equal afterwards', () => {
  const draft = scanDraft(fixture1());
  const before = JSON.stringify(draft);
  rehearseBoundaryRedraw(draft, { moves: [{ personId: 'leadB1', newManagerId: 'mgrA' }], now: NOW });
  rehearseBoundaryRedraw(draft, { moves: [{ personId: 'mgrA', newManagerId: 'leadA1' }], now: NOW }); // a refusal path, too
  assert.equal(JSON.stringify(draft), before);
});

test('the rehearsal brief is a printable pre-read that names the caveats', () => {
  const report = rehearseBoundaryRedraw(fixture1(), { moves: [{ personId: 'leadB1', newManagerId: 'mgrA' }], now: NOW });
  const brief = redrawBrief(report);
  assert.match(brief, /DRY RUN/);
  assert.match(brief, /Manager A/);
  assert.match(brief, /Coase|Williamson|Riker|Klein/);
  assert.match(brief, /Objective goal-shared/);
});

/* ------------------------------------------------- 6. enforced seats only */

test('enforced rank≥3 seats rehearse inside their span with ordinals, never objective pointers', () => {
  const state = fixture1();
  const report = rehearseBoundaryRedraw(state, { moves: [{ personId: 'leadB1', newManagerId: 'mgrA' }], now: NOW });
  const scope = new Set(['mgrA', 'leadA1', 'leadA2', 'leadB1']); // the whole workspace minus nothing relevant here
  const redacted = redactRehearsalReport(report, new Set(['mgrA', 'leadA1']));
  assert.ok(redacted.collapsed.every((r) => r.objectiveKey === null && /^Objective \d+$/.test(r.objective)));
  assert.ok(redacted.collapsed.every((r) => r.lcaAfter === 'A span above your boundary' || r.lcaAfter === null));
  // roll-up audiences outside the scope are masked too
  const draft = scanDraft(fixture2());
  const raw = rehearseBoundaryRedraw(draft, { moves: [{ personId: 'vpX', newManagerId: 'mgrD' }], now: NOW });
  const masked = redactRehearsalReport(raw, new Set(['vpX', 'mgrC', 'leadC1', 'leadD1'])); // excludes mgrD
  const gone = masked.rollups.moved.flatMap((m) => [...m.withdrawn, ...m.added]);
  assert.ok(gone.includes('A span above your boundary'), 'out-of-scope audience names are withheld');
  assert.equal(masked.rollups.moved[0].governedDecisionId, null);
  assert.equal(masked.rollups.moved[0].findingId, null);
  assert.ok(scope.size >= 3);
});

/* -------------------------------------------------------------- 7. UI */

test('the Redraw tab is registered and the panel renders + is axe-clean at the operator view', async () => {
  assert.ok(JUR_PANELS.some((pan) => pan.key === 'redraw'), 'redraw panel registered in JUR_PANELS');
  const data = new Map();
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
  const store = createStore({ storage, now: () => NOW, idFactory: (p2) => `${p2}-rd-${Math.random().toString(36).slice(2, 8)}` });
  store.load();
  store.seedDemo();
  const api = createApi(store, { now: () => NOW, idFactory: (p2) => `${p2}-rd-${Math.random().toString(36).slice(2, 8)}` });
  const dom = new JSDOM('<!doctype html><html lang="en"><body><main id="view"></main><div id="modal-root"></div><div id="toast-root"></div></body></html>', { url: 'https://leados.test/#/jurisdiction?panel=redraw' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.Node = dom.window.Node;
  const ctx = {
    state: store.state, store, api, now: NOW, query: new URLSearchParams('panel=redraw'),
    navigate() {}, refresh() {}, render() {},
  };
  const node = renderJurisdiction(ctx);
  assert.equal(node.querySelectorAll('h1').length, 1);
  assert.ok(node.querySelector('[role="tablist"]'));
  assert.ok([...node.querySelectorAll('button')].some((b) => /Rehearse/.test(b.textContent || '')), 'rehearsal action is present');
  assert.ok(node.querySelector('#redraw-person-1'), 'move row 1 present');
  document.getElementById('view').replaceChildren(node);
  const AXE_SRC = fs.readFileSync(path.resolve(import.meta.dirname, '../../node_modules/axe-core/axe.min.js'), 'utf8');
  dom.window.eval(AXE_SRC);
  const results = await dom.window.axe.run(node, { rules: { 'color-contrast': { enabled: false } } });
  assert.deepEqual(results.violations.map((v) => v.id), [], 'redraw panel is axe-clean');
  dom.window.close();
});

test('a declared rank-1 seat sees the explanation, not the form', () => {
  const state = fixture1();
  state.people.push(p('icA1', 'IC A One', 'ic', 'leadA1')); // a span makes leadA1 a genuine frontline seat
  state.settings = { ...state.settings, activeSeatId: 'leadA1' };
  const dom = new JSDOM('<!doctype html><html lang="en"><body><main id="view"></main><div id="modal-root"></div><div id="toast-root"></div></body></html>', { url: 'https://leados.test/#/jurisdiction?panel=redraw' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.Node = dom.window.Node;
  const ctx = {
    state, store: null, api: null, now: NOW, query: new URLSearchParams('panel=redraw'),
    navigate() {}, refresh() {}, render() {},
  };
  const node = renderJurisdiction(ctx);
  assert.match(node.textContent, /director-and-above/);
  assert.equal(node.querySelector('#redraw-person-1'), null, 'the form is not rendered for rank 1');
  dom.window.close();
});

test('clicking Rehearse renders the full report in place — and it is ephemeral', () => {
  const state = fixture1();
  const dom = new JSDOM('<!doctype html><html lang="en"><body><main id="view"></main><div id="modal-root"></div><div id="toast-root"></div></body></html>', { url: 'https://leados.test/#/jurisdiction?panel=redraw' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.Node = dom.window.Node;
  const ctx = {
    state, store: null, api: null, now: NOW, query: new URLSearchParams('panel=redraw'),
    navigate() {}, refresh() {}, render() {},
  };
  const node = renderJurisdiction(ctx);
  document.getElementById('view').replaceChildren(node);
  const person = node.querySelector('#redraw-person-1');
  const manager = node.querySelector('#redraw-manager-1');
  person.value = 'leadB1';
  manager.value = 'mgrA';
  const button = [...node.querySelectorAll('button')].find((b) => /Rehearse/.test(b.textContent || ''));
  button.click();
  const text = node.textContent;
  assert.match(text, /Rehearsal complete — nothing was written/);
  assert.match(text, /COLLAPSES/);
  assert.match(text, /Manager B/);
  assert.match(text, /goal-shared/);
  assert.equal(state.people.find((pp) => pp.id === 'leadB1').managerId, 'mgrB', 'the live roster is untouched');
  dom.window.close();
});
