/**
 * ADR-0176 — Cross-Line Selection Corroboration & Co-Hiring Stewardship
 * (Schema v141, RULE-HLC-01, CSV #131, `#/matrix?panel=hiring`).
 *
 * One focused suite: registration, the read model's verdicts and its two
 * reconciliation claims, matrix-specific crediting (represented / ambiguous /
 * realised-vs-drifted), RULE-HLC-01 end to end through the real API, seat
 * scope, and display == stored across a real reload.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { API_RIGHTS, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { ACTION_RIGHTS, RECORD_POLICIES } from '../../app/core/domain/seatRegistry.js';
import { MATRIX_PANELS } from '../../app/core/domain/matrixRegistry.js';
import { hiringLineRule } from '../../app/core/domain/hiringLineRules.js';
import { buildHiringLines, hiringLineBriefText, hiringLineCsvRows, lowerMedian } from '../../app/core/domain/hiringLines.js';
import {
  HIRING_LINE_CSV_COLUMNS, HIRING_LINE_LIMITS, HIRING_LINE_RULE_ID, HIRING_LINE_STATES, HIRING_LINE_VERDICTS,
} from '../../app/core/domain/hiringLineRegistry.js';
import { renderMatrix } from '../../app/views/matrix.js';

const NOW = new Date('2026-11-11T10:00:00.000Z');
const ISO = NOW.toISOString();
const C = '2025-01-01T00:00:00.000Z';

function fakeStorage(seed = null) {
  const map = new Map();
  if (seed) map.set(STORAGE_KEY, JSON.stringify(seed));
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
  };
}

/** VP → director → two managers (functional `home`, project `pm`); `sam` sits under BOTH. */
function baseState({ seatId = null } = {}) {
  const state = createEmptyState(ISO);
  state.settings.activeSeatId = seatId;
  state.people = [
    { id: 'vp', name: 'Vera VP', level: 'vp', managerId: null, status: 'active', createdAt: C },
    { id: 'dir', name: 'Dana Director', level: 'director', managerId: 'vp', status: 'active', createdAt: C },
    { id: 'home', name: 'Fay Functional', level: 'manager', managerId: 'dir', status: 'active', createdAt: C },
    { id: 'pm', name: 'Priya Project', level: 'manager', managerId: 'dir', status: 'active', createdAt: C },
    { id: 'other', name: 'Omar Other', level: 'manager', managerId: 'vp', status: 'active', createdAt: C },
    { id: 'sam', name: 'Sam Shared', level: 'ic', managerId: 'home', status: 'active', createdAt: C },
    { id: 'hal', name: 'Hal Home', level: 'ic', managerId: 'home', status: 'active', createdAt: C },
    { id: 'pat', name: 'Pat Project', level: 'ic', managerId: 'pm', status: 'active', createdAt: C },
    { id: 'oz', name: 'Oz Other', level: 'ic', managerId: 'other', status: 'active', createdAt: C },
  ];
  state.reportingLines = [
    { id: 'ln-sam', personId: 'sam', managerId: 'pm', kind: 'project', shareH: 40, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: C, status: 'active' },
  ];
  return state;
}

function harness(seed) {
  const storage = fakeStorage(seed);
  const store = createStore({ storage, now: () => NOW });
  store.load();
  const api = createApi(store, { now: () => NOW });
  return { store, api, storage };
}

function openReq(api, title, interviewers = []) {
  const req = api.addRequisition({ title, competencies: 'Ships reliably', interviewers, openedOn: '2026-10-01' });
  assert.equal(req.ok, true, req.error);
  return req.id;
}
function addCand(api, reqId, name, stage = 'final') {
  const cand = api.addCandidate({ reqId, name, appliedOn: '2026-10-05', stage });
  assert.equal(cand.ok, true, cand.error);
  return cand.id;
}
function evidence(api, candId, interviewerId, rating) {
  const res = api.recordEvidence(candId, { kind: 'structured-interview', rating, interviewerId, date: '2026-11-01' });
  assert.equal(res.ok, true, res.error);
}
const reportOf = (api) => { const r = api.hiringLineReport(); assert.equal(r.ok, true, r.error); return r.report; };
const hlcTasks = (store) => store.state.delegations.filter((d) => d.support.includes(HIRING_LINE_RULE_ID));

function withDom(fn) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const keys = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event'];
  const prev = new Map(keys.map((k) => [k, globalThis[k]]));
  try {
    for (const k of keys) globalThis[k] = k === 'window' ? dom.window : k === 'document' ? dom.window.document : dom.window[k];
    return fn(dom);
  } finally {
    for (const k of keys) globalThis[k] = prev.get(k);
    dom.window.close();
  }
}

test('ADR-0176 registration: Schema v141, empty migration, spine parity, gateway, seat policy, panel, CSV #131', () => {
  assert.equal(SCHEMA_VERSION, 153);
  const empty = createEmptyState(ISO);
  assert.deepEqual(empty.hiringLinePlans, []);
  assert.deepEqual(empty.hiringLineMarkers, []);
  assert.equal(empty.settings.hiringLineAskDueDays, 5);
  assert.equal(empty.settings.hiringLineAutoPropagate, true);

  const { raw, applied } = migrate({ schemaVersion: 140, appId: 'leados', meta: {}, settings: {}, requisitions: [{ id: 'r1', title: 'Role' }] });
  assert.deepEqual(applied, ['140 → 141', '141 → 142', '142 → 143', '143 → 144', '144 → 145', '145 → 146', '146 → 147', '147 → 148', '148 → 149', '149 → 150', '150 → 151', '151 → 152', '152 → 153']);
  assert.deepEqual(raw.hiringLinePlans, [], 'no line plan is fabricated on upgrade');
  assert.deepEqual(raw.hiringLineMarkers, []);

  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length);
  const idx = DEFAULT_POST_COMMIT_RULES.indexOf(hiringLineRule);
  const seatIdx = DEFAULT_POST_COMMIT_RULES.findIndex((r) => r.name === 'seatRule');
  assert.ok(idx > 0 && idx < seatIdx, 'RULE-HLC-01 runs before the seat roll-up rule');
  const contract = PROPAGATION_CONTRACTS.find((c) => c.rule === hiringLineRule);
  assert.deepEqual(contract.writes, ['delegations', 'links', 'hiringLineMarkers']);

  assert.ok(SAFE_READS.has('hiringLineReport'));
  assert.equal(API_RIGHTS.hiringLineScan, 'govern-hiring-lines');
  assert.equal(API_RIGHTS.hiringLineDeclare, undefined, 'declaring a plan has no seat-scoped adapter');
  assert.equal(ACTION_RIGHTS['govern-hiring-lines'].minRank, 3);
  assert.equal(RECORD_POLICIES.hiringLinePlans.detailCeiling, 0);
  assert.equal(RECORD_POLICIES.hiringLineMarkers.detailCeiling, 0);
  assert.ok(MATRIX_PANELS.some((p) => p.key === 'hiring'));
  assert.equal(CSV_EXPORTS.length, 145);
  assert.equal(CSV_EXPORTS[130].key, 'hiring-lines');
  assert.equal(lowerMedian([5, 1, 4, 2]), 2);
  assert.equal(lowerMedian([]), null);
});

test('fail-closed normalizer: malformed and orphaned acts are dropped and counted, a departed manager id is kept', () => {
  const state = baseState();
  state.requisitions = [{ id: 'r1', title: 'Role', status: 'open', competencies: [{ id: 'c1', name: 'Ships' }] }];
  state.hiringLinePlans = [
    { id: 'a1', reqId: 'r1', kind: 'declared', homeManagerId: 'home', lineManagerIds: ['pm'], note: '', at: ISO },
    { id: 'a2', reqId: 'r1', kind: 'declared', homeManagerId: 'home', lineManagerIds: ['home'], at: ISO }, // home repeated
    { id: 'a3', reqId: 'r1', kind: 'declared', homeManagerId: 'home', lineManagerIds: ['pm', 'pm'], at: ISO }, // duplicate
    { id: 'a4', reqId: 'gone', kind: 'declared', homeManagerId: 'home', lineManagerIds: [], at: ISO }, // orphan
    { id: 'a5', reqId: 'r1', kind: 'guessed', homeManagerId: 'home', lineManagerIds: [], at: ISO },
    { id: 'a6', reqId: 'r1', kind: 'declared', homeManagerId: 'ghost', lineManagerIds: [], note: '', at: '2026-11-11T11:00:00.000Z' },
    'nonsense',
  ];
  const { state: clean, warnings } = normalizeState({ ...state, schemaVersion: SCHEMA_VERSION });
  assert.deepEqual(clean.hiringLinePlans.map((a) => a.id), ['a1', 'a6']);
  assert.equal(clean.hiringLinePlans[1].homeManagerId, 'ghost', 'a departed manager is kept as stored, not rewritten');
  assert.ok(warnings.some((w) => /dropped 4 malformed line-plan act/.test(w)), warnings.join(' | '));
  assert.ok(warnings.some((w) => /dropped 1 line-plan act\(s\) whose requisition no longer exists/.test(w)));
});

test('inert until declared: no plan means every candidate is REFUSED as undeclared, no rate, and the rule issues nothing', () => {
  const { store, api } = harness(baseState());
  const reqId = openReq(api, 'Platform engineer', ['home']);
  const cand = addCand(api, reqId, 'Robin Vale');
  evidence(api, cand, 'home', 4);
  const scan = api.hiringLineScan();
  assert.equal(scan.ok, true);
  assert.deepEqual(scan.effects, []);
  assert.equal(hlcTasks(store).length, 0);
  assert.deepEqual(store.state.hiringLineMarkers, []);

  const report = reportOf(api);
  assert.equal(report.board.undeclaredN, 1);
  assert.equal(report.board.verdicts.undeclared, 1);
  assert.equal(report.board.linePairsN, 0);
  assert.equal(report.board.everyLineHeardPermille, null, 'refused, not zero');
  assert.match(report.board.rateWithheldReason, /below the declared floor of 3/);
  assert.ok(report.inertNote.length > 0);
  assert.equal(report.board.verdictsReconcile, true);
});

test('matrix verdicts: heard / represented / silent / unasked / ambiguous / divergent, and both partitions reconcile', () => {
  const { store, api } = harness(baseState());
  store.update((d) => { d.settings.hiringLineAutoPropagate = false; }, { type: 'settings.updated', entity: 'workspace', entityId: 'w', summary: 'pause' });
  const reqId = openReq(api, 'Platform engineer', ['home', 'pm']);
  assert.equal(api.hiringLineDeclare(reqId, { homeManagerId: 'home', lineManagerIds: ['pm'] }).ok, true);

  const corroborated = addCand(api, reqId, 'A Corroborated'); evidence(api, corroborated, 'home', 4); evidence(api, corroborated, 'pm', 5); evidence(api, corroborated, 'pm', 3);
  const divergent = addCand(api, reqId, 'B Divergent', 'offer'); evidence(api, divergent, 'home', 5); evidence(api, divergent, 'pm', 2);
  const silent = addCand(api, reqId, 'C Silent', 'offer'); evidence(api, silent, 'home', 4);
  const represented = addCand(api, reqId, 'D Represented'); evidence(api, represented, 'home', 4); evidence(api, represented, 'pat', 4);
  // Sam sits under BOTH declared lines: the signal credits neither.
  const ambiguous = addCand(api, reqId, 'E Ambiguous'); evidence(api, ambiguous, 'home', 4); evidence(api, ambiguous, 'sam', 5);
  addCand(api, reqId, 'F Early', 'interviewing'); // not decision stage: not read

  const req2 = openReq(api, 'Analyst', []);
  assert.equal(api.hiringLineDeclare(req2, { homeManagerId: 'home', lineManagerIds: ['pm', 'other'] }).ok, true);
  const unasked = addCand(api, req2, 'G Unasked'); evidence(api, unasked, 'home', 4); evidence(api, unasked, 'pm', 4);

  const report = reportOf(api);
  const b = report.board;
  const verdictOf = (name) => report.rows.flatMap((r) => r.candidates).find((c) => c.candidateLabel === name);
  assert.equal(verdictOf('A Corroborated').verdict, 'corroborated');
  assert.equal(verdictOf('A Corroborated').lines[1].medianRating, 3, 'lower median of [5,3]');
  assert.equal(verdictOf('B Divergent').verdict, 'divergent');
  assert.equal(verdictOf('B Divergent').spread, 3);
  assert.equal(verdictOf('C Silent').verdict, 'line-silent');
  assert.equal(verdictOf('C Silent').homeOnlyLoop, true);
  assert.equal(verdictOf('C Silent').offerExposed, true);
  assert.equal(verdictOf('D Represented').verdict, 'line-represented');
  assert.equal(verdictOf('D Represented').lines[1].state, 'represented');
  assert.equal(verdictOf('E Ambiguous').verdict, 'line-silent', 'a person under both lines represents neither');
  assert.equal(verdictOf('E Ambiguous').ambiguousSignalN, 1);
  assert.equal(verdictOf('G Unasked').verdict, 'line-unasked');
  assert.equal(verdictOf('G Unasked').lines[2].state, 'unasked');
  assert.equal(verdictOf('F Early'), undefined);

  assert.equal(b.candidatesReadN, 6);
  assert.deepEqual(b.verdicts, { undeclared: 0, unreadable: 0, 'line-unasked': 1, 'line-silent': 2, 'line-represented': 1, divergent: 1, corroborated: 1, 'single-line-heard': 0 });
  assert.equal(HIRING_LINE_VERDICTS.reduce((s, k) => s + b.verdicts[k], 0), b.candidatesReadN);
  assert.equal(b.verdictsReconcile, true);
  assert.equal(b.linePairsN, 5 * 2 + 3);
  assert.deepEqual(b.lines, { heard: 9, represented: 1, silent: 2, unasked: 1, unreadable: 0 });
  assert.equal(HIRING_LINE_STATES.reduce((s, k) => s + b.lines[k], 0), b.linePairsN);
  assert.equal(b.linesReconcile, true);
  assert.equal(b.ambiguousSignalN, 1);
  assert.equal(b.homeOnlyLoopN, 2);
  assert.equal(b.offersExposedN, 1);
  assert.equal(b.testedN, 6);
  assert.equal(b.everyLineHeardN, 2);
  assert.equal(b.everyLineHeardPermille, 333, 'truncated 2000/6');
  assert.equal(b.permilleRemainder, true, 'the truncation is flagged');
  assert.equal(hlcTasks(store).length, 0, 'paused automation issued nothing');
});

test('RULE-HLC-01 end to end: asks only the named silent line, rolls up through the matrix DAG, is idempotent, and closes itself', () => {
  const { store, api } = harness(baseState());
  const reqId = openReq(api, 'Platform engineer', ['home']);
  const cand = addCand(api, reqId, 'Robin Vale', 'final');
  evidence(api, cand, 'home', 4);
  assert.equal(hlcTasks(store).length, 0, 'nothing before a plan exists');

  const declared = api.hiringLineDeclare(reqId, { homeManagerId: 'home', lineManagerIds: ['pm'], note: 'Shared with the migration programme' });
  assert.equal(declared.ok, true, declared.error);
  let tasks = hlcTasks(store);
  assert.equal(tasks.length, 1, 'one ask, to the one line that has not spoken');
  assert.equal(tasks[0].personId, 'pm');
  assert.equal(tasks[0].status, 'active');
  assert.equal(tasks[0].dueOn, '2026-11-16');
  const taskId = tasks[0].id;
  const edges = store.state.links.filter((l) => l.ruleId === HIRING_LINE_RULE_ID);
  assert.ok(edges.some((l) => l.sourceType === 'requisition' && l.sourceId === reqId && l.targetId === taskId && l.relation === 'concerns'));
  assert.ok(edges.some((l) => l.sourceType === 'candidate' && l.sourceId === cand && l.targetId === taskId && l.relation === 'issues-obligation'));
  const rollups = edges.filter((l) => l.relation === 'rolls-up-to' && l.sourceId === taskId).map((l) => l.targetId).sort();
  assert.deepEqual(rollups, ['dir', 'vp'], 'rolls up to every roster ancestor of the asked manager');
  assert.equal(reportOf(api).board.openAsksN, 1);
  assert.ok(store.state.events.some((e) => e.type === 'hiring.line.declared'));

  // Idempotent: a rescan and an unrelated candidate commit do not duplicate.
  assert.equal(api.hiringLineScan().ok, true);
  assert.equal(hlcTasks(store).length, 1);
  assert.equal(store.state.hiringLineMarkers.filter((m) => m.kind === 'ask').length, 1);

  // Identical re-declaration is refused; nothing is appended.
  assert.equal(api.hiringLineDeclare(reqId, { homeManagerId: 'home', lineManagerIds: ['pm'] }).ok, false);
  assert.equal(store.state.hiringLinePlans.length, 1);

  // The line speaks: the ask closes itself; no evidence was written by the rule.
  evidence(api, cand, 'pm', 4);
  tasks = hlcTasks(store);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].status, 'done');
  assert.match(tasks[0].completionNote, /RULE-HLC-01/);
  const after = reportOf(api);
  assert.equal(after.board.openAsksN, 0);
  assert.equal(after.board.verdicts.corroborated, 1);
  assert.equal(store.state.candidates.find((c) => c.id === cand).signals.length, 2);
  assert.equal(store.state.candidates.find((c) => c.id === cand).stage, 'final', 'the rule never moved the candidate');

  // Refusals.
  assert.equal(api.hiringLineDeclare('nope', { homeManagerId: 'home' }).ok, false);
  assert.equal(api.hiringLineDeclare(reqId, { homeManagerId: 'leader' }).field, 'homeManagerId');
  assert.equal(api.hiringLineDeclare(reqId, { homeManagerId: 'home', lineManagerIds: ['home'] }).field, 'lineManagerIds');
  assert.equal(api.hiringLineDeclare(reqId, { homeManagerId: 'home', lineManagerIds: ['pm', 'pm'] }).field, 'lineManagerIds');
  assert.equal(api.hiringLineWithdraw(reqId, { reason: 'short' }).field, 'reason');

  // Withdrawal is an appended act and returns the requisition to `undeclared`.
  const cand2 = addCand(api, reqId, 'Second Person', 'final');
  evidence(api, cand2, 'home', 4);
  assert.equal(hlcTasks(store).filter((t) => t.status === 'active').length, 1, 'new silent pair asked');
  assert.equal(api.hiringLineWithdraw(reqId, { reason: 'The role will sit in one line after all.' }).ok, true);
  assert.equal(store.state.hiringLinePlans.length, 2);
  assert.equal(hlcTasks(store).filter((t) => t.status === 'active').length, 0, 'withdrawal closed the open ask');
  assert.equal(reportOf(api).board.undeclaredN, 1);
});

test('bounded per commit, departed manager observed never substituted, realised vs drifted after the hire', () => {
  const seed = baseState();
  const { store, api } = harness(seed);
  const reqId = openReq(api, 'Bulk role', ['home']);
  for (let i = 0; i < HIRING_LINE_LIMITS.asksPerCommit + 2; i += 1) addCand(api, reqId, `Person ${i}`, 'final');
  const res = api.hiringLineDeclare(reqId, { homeManagerId: 'home', lineManagerIds: [] });
  assert.equal(res.ok, true);
  assert.equal(hlcTasks(store).length, HIRING_LINE_LIMITS.asksPerCommit);
  assert.ok(res.propagations.some((p) => p.ruleId === HIRING_LINE_RULE_ID && p.action === 'deferred' && /Deferred 2 /.test(p.summary)));
  assert.equal(api.hiringLineScan().ok, true);
  assert.equal(hlcTasks(store).length, HIRING_LINE_LIMITS.asksPerCommit + 2, 'the scan issues the counted remainder');

  // A declared manager leaves: the line is unreadable, observed, and nobody else is asked.
  const req2 = openReq(api, 'Orphaned line', ['home']);
  const cand = addCand(api, req2, 'Lee Left', 'final');
  evidence(api, cand, 'home', 4);
  assert.equal(api.hiringLineDeclare(req2, { homeManagerId: 'home', lineManagerIds: ['other'] }).ok, true);
  const before = hlcTasks(store).filter((t) => t.personId === 'other' && t.status === 'active').length;
  assert.equal(before, 1);
  store.update((d) => { d.people.find((p) => p.id === 'other').status = 'archived'; }, { type: 'person.archived', entity: 'person', entityId: 'other', summary: 'left' });
  assert.equal(api.hiringLineScan().ok, true);
  const report = reportOf(api);
  const row = report.rows.find((r) => r.reqId === req2);
  assert.equal(row.candidates[0].verdict, 'unreadable');
  assert.equal(hlcTasks(store).filter((t) => t.personId === 'other' && t.status === 'active').length, 0, 'the ask to a departed manager is closed');
  assert.ok(store.state.hiringLineMarkers.some((m) => m.kind === 'observation' && m.state === 'unreadable'));
  assert.equal(report.board.everyLineHeardPermille, null);
  assert.match(report.board.rateWithheldReason, /cannot be read|below the declared floor/);

  // Realised vs drifted: sam holds home + pm in the live graph.
  const s2 = baseState();
  s2.requisitions = [
    { id: 'r-ok', title: 'Filled as declared', status: 'filled', closedOn: '2026-11-01', filledPersonId: 'sam', competencies: [{ id: 'c1', name: 'Ships' }], openedOn: '2026-09-01' },
    { id: 'r-drift', title: 'Filled, line never set up', status: 'filled', closedOn: '2026-11-01', filledPersonId: 'hal', competencies: [{ id: 'c1', name: 'Ships' }], openedOn: '2026-09-01' },
  ];
  s2.hiringLinePlans = [
    { id: 'p1', reqId: 'r-ok', kind: 'declared', homeManagerId: 'home', lineManagerIds: ['pm'], note: '', at: C },
    { id: 'p2', reqId: 'r-drift', kind: 'declared', homeManagerId: 'home', lineManagerIds: ['pm'], note: '', at: C },
  ];
  const r2 = buildHiringLines(normalizeState({ ...s2, schemaVersion: SCHEMA_VERSION }).state, { now: NOW });
  assert.equal(r2.board.hiresReadN, 2);
  assert.equal(r2.board.realisedN, 1);
  assert.equal(r2.board.driftedN, 1);
  assert.equal(r2.rows.find((r) => r.reqId === 'r-ok').realised.state, 'realised');
  const drift = r2.rows.find((r) => r.reqId === 'r-drift').realised;
  assert.equal(drift.state, 'drifted');
  assert.deepEqual(drift.missing, ['Priya Project']);
});

test('seat scope: a line manager sees only plans naming them or their span; a peer outside the plan sees nothing; writes stay with the operator', () => {
  const { store, api } = harness(baseState());
  const reqId = openReq(api, 'Platform engineer', ['home']);
  const cand = addCand(api, reqId, 'Robin Vale', 'final');
  evidence(api, cand, 'home', 4);
  openReq(api, 'Undeclared role', []);
  assert.equal(api.hiringLineDeclare(reqId, { homeManagerId: 'home', lineManagerIds: ['pm'] }).ok, true);
  const operator = reportOf(api);
  assert.equal(operator.board.requisitionsReadN, 2);

  const asSeat = (seatId) => {
    const snapshot = JSON.parse(JSON.stringify(store.state));
    snapshot.settings.activeSeatId = seatId;
    return buildHiringLines(snapshot, { now: NOW });
  };
  const pm = asSeat('pm');
  assert.equal(pm.seat.fullAccess, false);
  assert.equal(pm.board.requisitionsReadN, 1, 'the undeclared requisition names nobody and is not read by a seat');
  assert.equal(pm.rows[0].candidates[0].candidateLabel, 'Robin Vale', 'a manager the plan names sees the candidate');
  assert.equal(pm.rows[0].candidates[0].lines[0].managerName, 'Fay Functional');
  assert.equal(pm.actor.canDeclare, false);
  assert.equal(pm.actor.canScan, false, 'a manager-rank seat cannot scan');

  const dir = asSeat('dir');
  assert.equal(dir.board.requisitionsReadN, 1);
  assert.equal(dir.rows[0].candidates[0].nameWithheld, true, 'a spanning seat the plan does not name sees no candidate name');
  assert.equal(dir.rows[0].candidates[0].candidateLabel, 'Candidate 1');
  assert.equal(dir.rows[0].candidates[0].candidateId, null);
  assert.equal(dir.actor.canScan, true);

  const other = asSeat('other');
  assert.equal(other.board.requisitionsReadN, 0);
  assert.deepEqual(other.rows, []);
  assert.doesNotMatch(JSON.stringify(other), /Robin Vale|Platform engineer/);
});

test('display == stored: panel, brief and CSV print the computed board, reads mutate nothing, and a real reload reproduces it', () => {
  const { store, api, storage } = harness(baseState());
  const reqId = openReq(api, 'Platform engineer', ['home', 'pm']);
  assert.equal(api.hiringLineDeclare(reqId, { homeManagerId: 'home', lineManagerIds: ['pm'] }).ok, true);
  const a = addCand(api, reqId, 'A One'); evidence(api, a, 'home', 4); evidence(api, a, 'pm', 4);
  const b2 = addCand(api, reqId, 'B Two', 'offer'); evidence(api, b2, 'home', 5); evidence(api, b2, 'pm', 2);
  const c = addCand(api, reqId, 'C Three'); evidence(api, c, 'home', 4);

  const revision = store.state.meta?.revision;
  const frozen = JSON.stringify(store.state);
  const report = reportOf(api);
  const csv = exportWorkspaceCsv(store.state, 'hiring-lines', { now: NOW });
  assert.equal(csv.ok, true, csv.error);
  assert.equal(JSON.stringify(store.state), frozen, 'reading and exporting mutate nothing');
  assert.equal(store.state.meta?.revision, revision);

  // CSV cells are exactly the board's figures.
  const [header, line] = csv.csv.trim().split(/\r?\n/);
  assert.deepEqual(header.replace(/^\uFEFF/, '').split(','), [...HIRING_LINE_CSV_COLUMNS]);
  const expected = hiringLineCsvRows(report)[0];
  const cells = line.split(',');
  const at = (key) => cells[HIRING_LINE_CSV_COLUMNS.indexOf(key)];
  for (const key of ['candidates_read', 'verdict_corroborated', 'verdict_divergent', 'verdict_line_silent', 'line_pairs', 'lines_heard', 'lines_silent', 'tested', 'every_line_heard', 'every_line_heard_permille', 'offers_exposed', 'open_asks']) {
    assert.equal(at(key), String(expected[key]), key);
  }
  assert.equal(at('candidates_read'), '3');
  assert.equal(at('every_line_heard_permille'), '666');
  assert.equal(at('permille_remainder_flag'), 'truncated');
  assert.equal(at('verdicts_reconcile'), 'yes');
  assert.equal(at('lines_reconcile'), 'yes');
  assert.doesNotMatch(csv.csv, /A One|B Two|Platform engineer|Fay|Priya/, 'the export is identity-free');

  // The rendered panel prints the same integers.
  withDom(() => {
    const node = renderMatrix({
      state: store.state, api, query: new URLSearchParams('panel=hiring'),
      now: NOW, navigate() {}, refresh() {}, toast() {},
    });
    const root = node.querySelector('[data-testid="matrix-hiring-panel"]');
    assert.ok(root, 'the co-hiring panel rendered inside #/matrix');
    for (const verdict of HIRING_LINE_VERDICTS) {
      assert.equal(root.querySelector(`[data-testid="hlc-verdict-${verdict}"]`).textContent, String(report.board.verdicts[verdict]), verdict);
    }
    assert.equal(root.querySelector('[data-testid="hlc-brief"]').textContent, hiringLineBriefText(report));
    assert.match(root.querySelector('[data-testid="hlc-stats"]').textContent, /666‰/);
    assert.equal(node.querySelectorAll('h1').length <= 1, true);
  });

  // A below-floor rate is a BLANK cell, never a zero.
  const lone = harness(baseState());
  const r1 = openReq(lone.api, 'Solo', ['home']);
  lone.api.hiringLineDeclare(r1, { homeManagerId: 'home', lineManagerIds: ['pm'] });
  addCand(lone.api, r1, 'Only One');
  const loneCsv = exportWorkspaceCsv(lone.store.state, 'hiring-lines', { now: NOW }).csv.trim().split(/\r?\n/)[1].split(',');
  assert.equal(loneCsv[HIRING_LINE_CSV_COLUMNS.indexOf('every_line_heard_permille')], '');
  assert.equal(loneCsv[HIRING_LINE_CSV_COLUMNS.indexOf('tested')], '1');

  // Real reload from what was actually persisted.
  const persisted = JSON.parse(storage.getItem(STORAGE_KEY));
  const again = harness(persisted);
  assert.deepEqual(again.store.state.hiringLinePlans, store.state.hiringLinePlans);
  assert.deepEqual(again.store.state.hiringLineMarkers, store.state.hiringLineMarkers);
  const reloaded = reportOf(again.api);
  assert.deepEqual(reloaded.board, report.board);
  assert.deepEqual(reloaded.rows, report.rows);
  const links = (s) => s.links.filter((l) => l.ruleId === HIRING_LINE_RULE_ID).length;
  assert.equal(links(again.store.state), links(store.state), 'typed provenance survived normalisation');
  assert.ok(links(store.state) > 0);
});
