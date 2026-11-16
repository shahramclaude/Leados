// ADR-0206 — Goal Attainment Period Close & Restatement Register.
//
// The register's whole claim is that a reported figure is a FACT that can be
// compared with the record later, not a screen that silently recomputes. These
// tests are hand-computed against that claim: the frozen figures, the exact
// cause of every movement, the two claims kept apart (the buckets add up / the
// printed figures are the frozen ones), and the refusals — a period whose
// structure was never recorded, a period that has not ended, a second close over
// the same days, and an acknowledgement of a restatement nobody can see.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import {
  COLLECTIONS,
  createEmptyState,
  migrate,
  normalizeState,
  SCHEMA_VERSION,
} from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { ACTION_RIGHTS } from '../../app/core/domain/seatRegistry.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import {
  PAUSE_PERMIT_MATRIX_REACH_SWITCHES,
  PAUSE_PERMIT_REACH_RULES,
} from '../../app/core/domain/pausePermitRegistry.js';
import { MATRIX_PANELS } from '../../app/core/domain/matrixRegistry.js';
import {
  buildGoalAttainment,
  deriveGoalAttainmentPeriod,
  goalAttainmentBriefText,
  goalAttainmentBucketAt,
  goalAttainmentCsvRows,
  readGoalAttainmentClosure,
} from '../../app/core/domain/goalAttainment.js';
import {
  goalAttainmentConditions,
  goalAttainmentRule,
  indexGoalAttainmentAsks,
} from '../../app/core/domain/goalAttainmentRules.js';
import {
  GOAL_ATTAINMENT_CSV_COLUMNS,
  GOAL_ATTAINMENT_CSV_SCOPE,
  GOAL_ATTAINMENT_CLOSED_PREFIX,
  GOAL_ATTAINMENT_LIMITS,
  GOAL_ATTAINMENT_MARKER_KIND,
  GOAL_ATTAINMENT_RIGHTS,
  GOAL_ATTAINMENT_RULE_ID,
  GOAL_ATTAINMENT_SETTING_KEYS,
} from '../../app/core/domain/goalAttainmentRegistry.js';
import {
  normalizeGoalAttainmentClosures,
  normalizeGoalAttainmentNotes,
  normalizeGoalAttainmentSettings,
} from '../../app/core/domain/goalAttainmentSchema.js';
import { renderMatrixGoalAttainmentPanel } from '../../app/views/matrixGoalAttainmentPanel.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const NOW = new Date('2026-11-13T12:00:00.000Z');
const AT = '2026-01-01T09:00:00.000Z';
const PERIOD = { from: '2026-07-01', to: '2026-09-30' };

const person = (id, managerId) => ({ id, name: `${id[0].toUpperCase()}${id.slice(1)} Name`, managerId, level: 'ic', role: 'Operations', status: 'active', startDate: AT, createdAt: AT, updatedAt: AT });
const structure = (personId, managerId) => ({ id: `sh-${personId}`, personId, managerId, fromISO: '2026-01-01', toISO: null, recordedOn: '2026-01-01', source: 'seed', reason: '', at: AT });
const chk = (id, date, confidence) => ({ id, date, note: '', confidence, progressPct: 50, keyResults: [] });
const goal = (id, ownerId, dueDate, extra = {}) => ({
  id, title: `Objective ${id}`, description: '', ownerId, scope: ownerId ? 'person' : 'team', coAuthored: null, dueDate,
  keyResults: [{ id: `kr-${id}`, title: 'Key result', start: 0, target: 100, current: 50, initialCurrent: 50, unit: '' }],
  confidence: 'on-track', initialConfidence: 'on-track', status: 'active', completedOn: null, krUpdatedOn: null,
  checkins: [], createdAt: '2026-06-01T09:00:00.000Z', updatedAt: '2026-06-01T09:00:00.000Z', ...extra,
});

function rawFixture(patch = {}) {
  const raw = createEmptyState(NOW.toISOString());
  raw.people = [
    person('ada', null), person('ann', 'ada'), person('bob', 'ada'),
    person('kim', 'ann'), person('ria', 'ann'), person('sam', 'bob'),
  ];
  raw.reportingLines = [];
  raw.structureHistory = [
    structure('ann', 'ada'), structure('bob', 'ada'), structure('kim', 'ann'),
    structure('ria', 'ann'), structure('sam', 'bob'),
  ];
  raw.goals = [
    goal('g1', 'kim', '2026-09-20', { checkins: [chk('c1', '2026-09-10', 'on-track')] }),
    goal('g2', 'ria', '2026-09-25', { checkins: [chk('c2', '2026-09-15', 'at-risk')] }),
    goal('g3', 'sam', '2026-08-30', { status: 'done', completedOn: '2026-09-01' }),
    goal('g4', null, '2026-09-30'),
    goal('g5', 'kim', '2026-10-15'),
    goal('g6', 'kim', null),
  ];
  return { ...raw, ...patch };
}
const fixture = (patch = {}) => normalizeState(rawFixture(patch), { now: NOW }).state;
const read = (state, extra = {}) => buildGoalAttainment(state, { now: NOW, ...extra });

function seed(state, { postCommitRules } = {}) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-${++sequence}`;
  const store = createStore({ storage, now: () => NOW, idFactory, ...(postCommitRules ? { postCommitRules } : {}) });
  store.load();
  const api = guardApi(createApi(store, { now: () => NOW, idFactory }), store, { now: () => NOW.getTime() });
  const sit = (id) => store.update((draft) => { draft.settings = { ...draft.settings, activeSeatId: id }; },
    { type: 'seat.declared', entity: 'settings', entityId: 'seat', summary: 'seat' });
  return { store, api, sit };
}

const closeFixture = () => {
  const state = fixture();
  const { store, api } = seed(state);
  const closed = api.matrixGoalAttainmentClose({ label: 'Q3 FY26 close', periodFrom: PERIOD.from, periodTo: PERIOD.to });
  assert.equal(closed.ok, true, closed.error);
  return { store, api };
};

function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div><div id="modal-root"></div><div id="toast-root"></div></body></html>', { url: 'https://example.test/' });
  const keys = ['window', 'document', 'HTMLElement', 'Node', 'Event', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const previous = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) {
    const value = key.includes('AnimationFrame') && dom.window[key] ? dom.window[key].bind(dom.window) : (typeof dom.window[key] === 'function' ? dom.window[key].bind(dom.window) : dom.window[key]);
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  try {
    return run(dom);
  } finally {
    for (const key of keys) {
      const descriptor = previous.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

function csvObjects(text) {
  const parsed = parseCsv(text);
  // parseCsv returns the data rows only, keyed by index against `headers`.
  return parsed.rows.map((cells) => Object.fromEntries(parsed.headers.map((header, index) => [header, cells[index] ?? ''])));
}

/* ---------------------------------------------------------- 1. registration */

test('the engine registers its rights, its pause, its export and its place on the spine', () => {
  for (const key of Object.values(GOAL_ATTAINMENT_RIGHTS)) {
    assert.ok(ACTION_RIGHTS[key], `${key} is a declared right`);
  }
  assert.equal(ACTION_RIGHTS[GOAL_ATTAINMENT_RIGHTS.READ].minRank, 1, 'every altitude may read a closed period');
  assert.equal(ACTION_RIGHTS[GOAL_ATTAINMENT_RIGHTS.CLOSE].minRank, 4, 'closing a period is a director/VIP act');
  // The read sits in SAFE_READS; the closing act does NOT.
  assert.ok(SAFE_READS.has('matrixGoalAttainmentReport'));
  assert.ok(SAFE_READS.has('matrixGoalAttainmentCsvRows'));
  assert.equal(SAFE_READS.has('matrixGoalAttainmentClose'), false, 'closing a period needs the declared right');
  // One rule, in the closing block before seatRule and sealRule, with a matching
  // contract. Pinned as an order rather than "third from last": ADR-0208's rule
  // registered between it and them, and the next one will too.
  const ids = DEFAULT_POST_COMMIT_RULES.map((rule) => rule.id);
  assert.ok(ids.indexOf('goalAttainmentRule') >= 0 && ids.indexOf('goalAttainmentRule') < ids.indexOf('seatRule'));
  assert.equal(ids.at(-2), 'seatRule');
  assert.equal(ids.at(-1), 'sealRule');
  const contract = PROPAGATION_CONTRACTS.find((row) => row.rule?.id === 'goalAttainmentRule');
  assert.ok(contract, 'RULE-GAR-01 has a propagation contract');
  assert.deepEqual(contract.writes, ['delegations', 'links', 'goalAttainmentMarkers']);
  assert.equal(contract.scansWorkspace, true);
  assert.ok(PAUSE_PERMIT_MATRIX_REACH_SWITCHES.includes(GOAL_ATTAINMENT_SETTING_KEYS.autoPropagate));
  assert.equal(PAUSE_PERMIT_REACH_RULES.goalAttainmentAutoPropagate, 'goalAttainmentRules.js');
  // CSV scope #149 and the panel are registered.
  const descriptor = CSV_EXPORTS.find((row) => row.key === GOAL_ATTAINMENT_CSV_SCOPE);
  assert.ok(descriptor, 'the aggregate export scope exists');
  assert.equal(descriptor.sensitive, false);
  assert.ok(MATRIX_PANELS.some((panel) => panel.key === 'attainment'));
  assert.equal(GOAL_ATTAINMENT_RULE_ID, 'RULE-GAR-01');
});

/* --------------------------------------------------------------- 2. schema */

test('v160 is additive, starts empty and invents no closed period', () => {
  const old = { ...createEmptyState(AT), schemaVersion: 159 };
  delete old.goalAttainmentClosures; delete old.goalAttainmentNotes; delete old.goalAttainmentMarkers;
  old.people = [person('kim', null)];
  old.goals = [goal('g1', 'kim', '2026-09-20', { checkins: [chk('c1', '2026-09-10', 'on-track')] })];
  const next = migrate(old);
  assert.equal(SCHEMA_VERSION, 179);
  assert.deepEqual(next.applied.at(-1), '178 → 179');
  assert.deepEqual(next.raw.goalAttainmentClosures, []);
  assert.deepEqual(next.raw.goalAttainmentNotes, []);
  assert.deepEqual(next.raw.goalAttainmentMarkers, []);
  for (const key of ['goalAttainmentClosures', 'goalAttainmentNotes', 'goalAttainmentMarkers']) {
    assert.ok(COLLECTIONS.includes(key), `${key} is a real collection`);
  }
  // The conventions arrive as declared defaults, not as an inferred pause.
  assert.equal(next.raw.settings.goalAttainmentAskDueDays, 7);
  assert.equal(next.raw.settings.goalAttainmentAutoPropagate, true);
  // A period that a human never closed is NOT reconstructed from the goals the
  // workspace already holds.
  assert.equal(normalizeState(next.raw, { now: NOW }).state.goalAttainmentClosures.length, 0);
});

test('a stored closure whose reported counts do not match its own entries is dropped, never re-totalled', () => {
  const warnings = [];
  const state = fixture();
  const derived = deriveGoalAttainmentPeriod(state, PERIOD);
  const forged = {
    id: 'gac-1', label: 'Q3 FY26 close', periodFrom: PERIOD.from, periodTo: PERIOD.to,
    closedOn: '2026-10-02', closedAt: '2026-10-02T00:00:00.000Z', closedById: 'ada', note: '',
    entries: derived.entries,
    // Every goal was 'achieved' as far as this row claims: 4, not 1.
    buckets: { achieved: 4, 'on-track': 0, 'at-risk': 0, 'off-track': 0, 'no-checkin': 0, 'unknown-confidence': 0, dropped: 0 },
    goalsN: derived.goalsN, spansN: derived.spansN, ownerlessN: derived.ownerlessN, multiLineN: 0,
  };
  const kept = normalizeGoalAttainmentClosures([forged, { ...forged, id: 'gac-2' }], warnings);
  assert.equal(kept.length, 0, 'a report nobody could have made prints nothing');
  assert.equal(warnings.length, 1);
  // Two closed periods over the same days: the later one is dropped, never merged.
  const honest = { ...forged, buckets: derived.buckets, id: 'gac-3' };
  const overlapping = { ...honest, id: 'gac-4', label: 'Q3 again' };
  const overlapping2 = normalizeGoalAttainmentClosures([honest, overlapping], []);
  assert.equal(overlapping2.length, 1);
  assert.equal(overlapping2[0].id, 'gac-3');
  // A note naming a closure that is not on the record, or duplicating one decision, is dropped.
  const notes = normalizeGoalAttainmentNotes([
    { id: 'n1', closureId: 'gac-3', signature: 'gar1:0123456789abcdef', reason: 'Accepted: the late check-in is the period fact.', actedOn: '2026-10-05' },
    { id: 'n2', closureId: 'gac-3', signature: 'gar1:0123456789abcdef', reason: 'A second signature on the same restatement.', actedOn: '2026-10-06' },
    { id: 'n3', closureId: 'nope', signature: 'gar1:0123456789abcdef', reason: 'Names a period nobody closed.', actedOn: '2026-10-06' },
  ], overlapping2, []);
  assert.deepEqual(notes.map((note) => note.id), ['n1']);
});

/* -------------------------------------------------------- 3. bucket derivation */

test('the attainment bucket is dated, exact and never inferred from prose', () => {
  const base = { id: 'g', status: 'active', completedOn: null, checkins: [] };
  assert.equal(goalAttainmentBucketAt(base, '2026-09-30'), 'no-checkin');
  assert.equal(goalAttainmentBucketAt({ ...base, checkins: [chk('a', '2026-09-10', 'on-track')] }, '2026-09-30'), 'on-track');
  // A check-in dated AFTER the period end is not evidence about the period.
  assert.equal(goalAttainmentBucketAt({ ...base, checkins: [chk('a', '2026-10-02', 'off-track')] }, '2026-09-30'), 'no-checkin');
  // The LAST check-in on or before the instant decides.
  assert.equal(goalAttainmentBucketAt({ ...base, checkins: [chk('a', '2026-09-10', 'on-track'), chk('b', '2026-09-29', 'off-track')] }, '2026-09-30'), 'off-track');
  assert.equal(goalAttainmentBucketAt({ ...base, checkins: [chk('a', '2026-09-10', 'on-track'), chk('b', '2026-09-29', 'blocked-ish')] }, '2026-09-30'), 'unknown-confidence');
  // Completion is a DATED fact, so a completion after the period is not one.
  assert.equal(goalAttainmentBucketAt({ ...base, status: 'done', completedOn: '2026-09-01', checkins: [chk('a', '2026-08-01', 'at-risk')] }, '2026-09-30'), 'achieved');
  assert.equal(goalAttainmentBucketAt({ ...base, status: 'done', completedOn: '2026-10-04', checkins: [chk('a', '2026-09-01', 'at-risk')] }, '2026-09-30'), 'at-risk');
  assert.equal(goalAttainmentBucketAt({ ...base, status: 'dropped', checkins: [chk('a', '2026-09-01', 'on-track')] }, '2026-09-30'), 'dropped');
});

/* ------------------------------------------------------------- 4. the close */

test('a closing act freezes the exact buckets and spans, and the period reproduces immediately after', () => {
  const { store, api } = closeFixture();
  const result = api.matrixGoalAttainmentReport();
  const report = result.report;
  assert.equal(report.totals.closuresN, 1);
  const closure = report.closures[0];
  assert.equal(closure.verdict, 'faithful');
  // Hand-computed: g1 on-track (ann), g2 at-risk (ann), g3 achieved (bob), g4 ownerless.
  assert.equal(closure.frozen.goalsN, 4);
  assert.deepEqual(closure.frozen.buckets, { achieved: 1, 'on-track': 1, 'at-risk': 1, 'off-track': 0, 'no-checkin': 1, 'unknown-confidence': 0, dropped: 0 });
  assert.equal(closure.frozen.spansN, 2);
  assert.equal(closure.frozen.ownerlessN, 1);
  assert.equal(closure.countsReconcile, true);
  assert.equal(closure.signature, null, 'a faithful period has no restatement to fingerprint');
  const ann = closure.spans.find((span) => span.name === 'Ann Name');
  assert.equal(ann.frozenN, 2);
  // The close changed nothing about the goals it reported.
  assert.equal(store.state.goals.length, 6);
  assert.equal(store.state.goals.find((row) => row.id === 'g1').dueDate, '2026-09-20');
  // Display == stored, through a real reload of the same bytes.
  const revision = store.state.meta.revision;
  const reloaded = seed(JSON.parse(JSON.stringify(store.state)));
  const after = reloaded.api.matrixGoalAttainmentReport().report.closures[0];
  assert.deepEqual(after.frozen.buckets, closure.frozen.buckets);
  assert.equal(after.verdict, 'faithful');
  assert.equal(reloaded.store.state.meta.revision, revision, 'reading mutates nothing');
  assert.equal(reloaded.api.matrixGoalAttainmentReport().report.closures[0].verdict, 'faithful');
});

/* -------------------------------------------------------- 5. restatements */

test('every way a reported figure can move is attributed, counted and fingerprinted', () => {
  const { store } = closeFixture();
  const before = read(store.state).closures[0];
  assert.equal(before.verdict, 'faithful');
  // (1) a late check-in filed with a date INSIDE the period moves an attainment bucket;
  // (2) a due date edited INTO the period adds a goal;
  // (3) a due date edited OUT of the period removes one;
  // (4) a goal re-owned after the close moves span;
  // (5) one goal re-owned AND re-bucketed is its own cause.
  store.update((draft) => {
    draft.goals.find((row) => row.id === 'g1').checkins.push(chk('late', '2026-09-28', 'off-track'));
    draft.goals.find((row) => row.id === 'g5').dueDate = '2026-09-29';
    draft.goals.find((row) => row.id === 'g4').dueDate = '2026-11-20';
    draft.goals.find((row) => row.id === 'g3').ownerId = 'kim';
    draft.goals.find((row) => row.id === 'g2').ownerId = 'sam';
    draft.goals.find((row) => row.id === 'g2').checkins.push(chk('late2', '2026-09-26', 'off-track'));
  }, { type: 'goal.updated', entity: 'goal', entityId: 'g1', summary: 'record edited after the close' });

  const after = read(store.state).closures[0];
  assert.equal(after.verdict, 'restated');
  assert.deepEqual(after.causes, { added: 1, removed: 1, 'bucket-changed': 1, 'span-moved': 1, 'bucket-and-span-changed': 1 });
  assert.equal(after.causedGoalsN, 5);
  assert.match(after.signature, /^gar1:[0-9a-f]{16}$/);
  assert.equal(after.spans.filter((span) => span.changed).length >= 2, true);
  // The original figures are still printed, untouched.
  assert.equal(after.frozen.goalsN, 4);
  assert.equal(after.live.goalsN, 4);
  // The fingerprint is deterministic across reads and never carries an identity.
  assert.equal(read(store.state).closures[0].signature, after.signature);
  assert.equal(after.signature.includes('g1'), false);
  // The CSV prints the same counts, and no goal id, person, title or label.
  const csv = goalAttainmentCsvRows(read(store.state));
  const closureRow = csv.find((row) => row.row_type === 'closure');
  assert.equal(Number(closureRow.added_n), 1);
  assert.equal(Number(closureRow.removed_n), 1);
  assert.equal(Number(closureRow.bucket_and_span_changed_n), 1);
  const text = JSON.stringify(csv);
  for (const secret of ['Objective', 'Ann Name', 'Kim Name', 'Q3 FY26 close', 'g1', 'g2', 'kim', 'ann']) {
    assert.equal(text.includes(secret), false, `${secret} must not reach the aggregate export`);
  }
  // The brief states the verdict and the causes without naming anybody.
  const brief = goalAttainmentBriefText(read(store.state));
  assert.match(brief, /restated/);
  assert.match(brief, /added 1/);
  assert.equal(/Ann Name|Kim Name|Objective/.test(brief), false);
});

/* ------------------------------------------- 6. as-of structure, not today's */

test('a reorganisation AFTER the close does not restate it; editing the goal’s owner does', () => {
  const { store } = closeFixture();
  // sam now reports to ann instead of bob, recorded from 2026-11-01 (after the close).
  store.update((draft) => {
    draft.structureHistory.push({ id: 'sh-sam-2', personId: 'sam', managerId: 'ann', fromISO: '2026-11-01', toISO: null, recordedOn: '2026-11-01', source: 'moved', reason: 'Reorg after the quarter closed.', at: '2026-11-01T09:00:00.000Z' });
    draft.people.find((p) => p.id === 'sam').managerId = 'ann';
  }, { type: 'structure.moved', entity: 'person', entityId: 'sam', summary: 'post-close reorganisation' });
  const afterReorg = read(store.state).closures[0];
  assert.equal(afterReorg.verdict, 'faithful', 'the September report was true of September’s structure');
  assert.equal(afterReorg.spans.find((span) => span.name === 'Bob Name').frozenN, 1);
  // Editing the goal's OWN owner field changes who the record says owned it.
  store.update((draft) => { draft.goals.find((row) => row.id === 'g3').ownerId = 'kim'; },
    { type: 'goal.updated', entity: 'goal', entityId: 'g3', summary: 're-owned' });
  const afterEdit = read(store.state).closures[0];
  assert.equal(afterEdit.verdict, 'restated');
  assert.equal(afterEdit.causes['span-moved'], 1);
});

/* ------------------------------------------------------------- 7. refusals */

test('the door refuses a period it cannot report honestly', () => {
  const state = fixture();
  // A goal owned by somebody whose home line was never recorded for the period end.
  state.people.push(person('tom', 'ann'));
  state.goals.push(goal('g7', 'tom', '2026-09-18'));
  const { api, store } = seed(state);
  const refused = api.matrixGoalAttainmentClose({ label: 'Q3 FY26 close', periodFrom: PERIOD.from, periodTo: PERIOD.to });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /home line on 2026-09-30 is not on the recorded structure/);
  assert.equal(store.state.goalAttainmentClosures.length, 0, 'nothing was saved');

  const clean = seed(fixture());
  // A period that has not ended cannot be closed.
  const open = clean.api.matrixGoalAttainmentClose({ label: 'Q4 in progress', periodFrom: '2026-10-01', periodTo: '2026-12-31' });
  assert.equal(open.ok, false);
  assert.match(open.error, /closed after it has ended/);
  // A period with nothing due inside it reports nothing.
  const empty = clean.api.matrixGoalAttainmentClose({ label: 'Quiet month', periodFrom: '2026-02-01', periodTo: '2026-02-28' });
  assert.equal(empty.ok, false);
  assert.match(empty.error, /nothing to close/);
  // A real close, then a second close over any shared day is refused.
  const first = clean.api.matrixGoalAttainmentClose({ label: 'Q3 FY26 close', periodFrom: PERIOD.from, periodTo: PERIOD.to });
  assert.equal(first.ok, true, first.error);
  const overlap = clean.api.matrixGoalAttainmentClose({ label: 'September only', periodFrom: '2026-09-01', periodTo: '2026-09-30' });
  assert.equal(overlap.ok, false);
  assert.match(overlap.error, /overlap a period already closed/);
  // Acknowledging a period that still reproduces is refused: there is nothing to accept.
  const nothing = clean.api.matrixGoalAttainmentAcknowledge({ closureId: first.closureId, reason: 'Accepting a restatement that does not exist.' });
  assert.equal(nothing.ok, false);
  assert.match(nothing.error, /reproduces its reported figures exactly/);
});

test('a period whose structure record is missing reads unprovable rather than over the part it can place', () => {
  const { store } = closeFixture();
  // The late check-in moves g1; then the structure record for ann is removed.
  store.update((draft) => {
    draft.goals.find((row) => row.id === 'g1').checkins.push(chk('late', '2026-09-28', 'off-track'));
    // The two people who own goals due in the period lose their recorded line.
    draft.structureHistory = draft.structureHistory.filter((row) => !['kim', 'ria'].includes(row.personId));
    draft.people.find((p) => p.id === 'kim').managerId = 'ada';
    draft.people.find((p) => p.id === 'ria').managerId = 'ada';
  }, { type: 'structure.moved', entity: 'person', entityId: 'kim', summary: 'structure record lost' });
  const report = read(store.state);
  const closure = report.closures[0];
  assert.equal(closure.verdict, 'unprovable');
  assert.equal(closure.live, null, 'no restated figure is claimed');
  assert.match(closure.reasons.join(' '), /home line on 2026-09-30 is not recorded/);
  assert.equal(report.totals.unprovableN, 1);
  assert.equal(report.totals.restatedN, 0, 'unprovable is never counted as a restatement');
  // The rule does not ask anybody about an unprovable period.
  const draft = JSON.parse(JSON.stringify(store.state));
  const matrixJobs = goalAttainmentRule(draft, { now: NOW, event: { type: 'goal.checkin' } });
  assert.deepEqual(matrixJobs, []);
});

/* --------------------------------------------------------------- 8. the rule */

test('the rule asks the joint apex of the spans that moved, once, and closes itself', () => {
  const { store, api } = closeFixture();
  store.update((draft) => {
    draft.goals.find((row) => row.id === 'g1').checkins.push(chk('late', '2026-09-28', 'off-track'));
    draft.goals.find((row) => row.id === 'g3').ownerId = 'kim';
  }, { type: 'goal.checkin', entity: 'goal', entityId: 'g1', summary: 'late check-in and a re-owned goal' });

  const state = store.state;
  const report = read(state);
  const closure = report.closures[0];
  assert.equal(closure.verdict, 'restated');
  const asks = (state.delegations || []).filter((task) => String(task.support || '').includes(GOAL_ATTAINMENT_RULE_ID));
  assert.equal(asks.length, 1, 'one restatement files exactly one ask');
  // The spans that moved are ann and bob, whose lowest joint apex is ada.
  assert.equal(asks[0].personId, 'ada');
  assert.match(asks[0].expectedOutcome, /no longer reproduce|Re-derived from the record today/);
  assert.equal(asks[0].expectedOutcome.includes('Ann Name'), false, 'the ask states counts, never span names');
  const links = state.links.filter((link) => link.ruleId === GOAL_ATTAINMENT_RULE_ID && link.relation === 'issues-obligation');
  assert.equal(links.length, 1);
  // Idempotent: a second scan of the same restatement files nothing new.
  const draft = JSON.parse(JSON.stringify(state));
  assert.deepEqual(goalAttainmentRule(draft, { now: NOW, event: { type: 'goal.checkin' } }), []);
  // Acknowledging the restatement closes the ask.
  const ack = api.matrixGoalAttainmentAcknowledge({ closureId: closure.closureId, reason: 'Accepted: the late September check-in is the period fact.' });
  assert.equal(ack.ok, true, ack.error);
  assert.equal(api.matrixGoalAttainmentReport().report.closures[0].verdict, 'acknowledged');
  const askNow = store.state.delegations.find((task) => String(task.support || '').includes(GOAL_ATTAINMENT_RULE_ID));
  assert.equal(askNow.status, 'done');
  assert.match(askNow.completionNote, new RegExp(GOAL_ATTAINMENT_CLOSED_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  // A stale signature is refused at the door, because a signature on a figure
  // nobody has seen is worse than none.
  store.update((draft2) => { draft2.goals.find((row) => row.id === 'g2').ownerId = 'sam'; },
    { type: 'goal.updated', entity: 'goal', entityId: 'g2', summary: 'moved again' });
  const moved = read(store.state).closures[0];
  assert.equal(moved.verdict, 'restated');
  assert.notEqual(moved.signature, closure.signature, 'a different restatement is a different fingerprint');
  const stale = api.matrixGoalAttainmentAcknowledge({ closureId: moved.closureId, signature: closure.signature, reason: 'A signature for the previous restatement shape.' });
  assert.equal(stale.ok, false);
  assert.match(stale.error, /live fingerprint is now/);
});

test('a paused rule writes nothing, and an apex nobody holds records an observation instead of an ask', () => {
  const { store } = closeFixture();
  store.update((draft) => { draft.goals.find((row) => row.id === 'g1').checkins.push(chk('late', '2026-09-28', 'off-track')); },
    { type: 'goal.checkin', entity: 'goal', entityId: 'g1', summary: 'late' });
  const paused = JSON.parse(JSON.stringify(store.state));
  paused.settings = { ...paused.settings, goalAttainmentAutoPropagate: false };
  const before = (paused.delegations || []).length;
  assert.deepEqual(goalAttainmentRule(paused, { now: NOW, event: { type: 'goal.checkin' } }), []);
  assert.equal((paused.delegations || []).length, before);

  // The only movement is an ownerless team objective: nobody can be asked.
  const state = fixture();
  const single = seed(state);
  const closed = single.api.matrixGoalAttainmentClose({ label: 'Q3 FY26 close', periodFrom: PERIOD.from, periodTo: PERIOD.to });
  assert.equal(closed.ok, true, closed.error);
  single.store.update((draft) => { draft.goals.find((row) => row.id === 'g4').checkins.push(chk('team', '2026-09-29', 'at-risk')); },
    { type: 'goal.checkin', entity: 'goal', entityId: 'g4', summary: 'team objective checked in late' });
  const reading = read(single.store.state).closures[0];
  assert.equal(reading.verdict, 'restated');
  const draft = JSON.parse(JSON.stringify(single.store.state));
  // The spine already observed this condition at the write; clear the marker so
  // the direct run proves the observation path rather than the ledger.
  draft.goalAttainmentMarkers = [];
  const effects = goalAttainmentRule(draft, { now: NOW, event: { type: 'goal.checkin' } });
  assert.equal((draft.delegations || []).filter((task) => String(task.support || '').includes(GOAL_ATTAINMENT_RULE_ID)).length, 0);
  assert.equal((draft.goalAttainmentMarkers || []).length, 1);
  assert.equal(draft.goalAttainmentMarkers[0].kind, GOAL_ATTAINMENT_MARKER_KIND);
  assert.equal(/Ann Name|Bob Name|Objective/.test(draft.goalAttainmentMarkers[0].detail), false);
  assert.ok(effects.some((effect) => effect.action === 'observed'));
  assert.equal(indexGoalAttainmentAsks(draft).length, 0);
});

/* -------------------------------------------------------------- 9. the panel */

test('the panel prints the reader’s own figures and offers no control that edits a close', () => {
  const { store, api } = closeFixture();
  store.update((draft) => { draft.goals.find((row) => row.id === 'g1').checkins.push(chk('late', '2026-09-28', 'off-track')); },
    { type: 'goal.checkin', entity: 'goal', entityId: 'g1', summary: 'late' });
  withDom(() => {
    const ctx = { api, query: new URLSearchParams('panel=board'), navigate() {}, refresh() {} };
    document.getElementById('root').append(renderMatrixGoalAttainmentPanel(ctx));
    const report = api.matrixGoalAttainmentReport().report;
    const text = document.getElementById('root').textContent;
    assert.match(text, /What was reported, and whether it still holds/);
    assert.ok(text.includes(`${report.totals.restatedN} closed period(s) no longer reproduce`) || report.totals.restatedN === 0);
    assert.ok(text.includes('Restated, unacknowledged'));
    // The figure on screen is the figure the reader computed.
    const closure = report.closures[0];
    assert.ok(text.includes(`${closure.frozen.goalsN} goal(s) over ${closure.frozen.spansN} span slice(s)`));
    assert.ok(text.includes(closure.signature), 'the restatement fingerprint is printed');
    assert.ok(text.includes('Attainment moved: 1'), 'the cause is printed with its exact count');
    // No control edits a goal, a closed figure or a period.
    const labels = [...document.querySelectorAll('button')].map((button) => button.textContent.toLowerCase()).join(' | ');
    assert.equal(/edit|delete|re-close|overwrite|reopen/.test(labels), false);
    assert.ok(labels.includes('acknowledge restatement'));
    // The method tab prints the refusals rather than hiding them.
    document.getElementById('root').innerHTML = '';
    const method = renderMatrixGoalAttainmentPanel({ ...ctx, query: new URLSearchParams('panel=method') });
    document.getElementById('root').append(method);
    const methodText = document.getElementById('root').textContent;
    assert.match(methodText, /What a closing act freezes/);
    assert.match(methodText, /ownerless/);
    assert.match(methodText, /Refusals this register can print/);
    assert.match(methodText, /cannot be re-derived/);
    assert.match(methodText, /IAS 8/);
  });
});

/* ---------------------------------------------------------------- 10. CSV */

test('CSV scope #149 exports the printed counts, blanks a withheld figure and carries no identity', () => {
  const { store } = closeFixture();
  store.update((draft) => { draft.goals.find((row) => row.id === 'g1').checkins.push(chk('late', '2026-09-28', 'off-track')); },
    { type: 'goal.checkin', entity: 'goal', entityId: 'g1', summary: 'late' });
  const exported = exportWorkspaceCsv(store.state, GOAL_ATTAINMENT_CSV_SCOPE, { now: NOW });
  assert.equal(exported.ok, true, exported.reason);
  const text = String(exported.text || exported.csv || '');
  const records = csvObjects(text);
  assert.ok(records.length >= 3, 'workspace row, closure row and span rows');
  assert.deepEqual(Object.keys(records[0]), GOAL_ATTAINMENT_CSV_COLUMNS);
  assert.equal(records[0].row_type, 'workspace');
  assert.equal(records[0].restated_n, '1');
  assert.equal(records[0].figures_complete, 'yes');
  const closureRow = records.find((row) => row.row_type === 'closure');
  assert.equal(closureRow.bucket_changed_n, '1');
  assert.equal(closureRow.counts_reconcile, 'yes');
  assert.equal(closureRow.ask_due_days, '7');
  for (const secret of ['Ann Name', 'Kim Name', 'Bob Name', 'Objective', 'Q3 FY26 close', 'g1', 'gac']) {
    assert.equal(text.includes(secret), false, `${secret} must not reach the aggregate export`);
  }
  // A seat below the disclosure floor exports BLANK with its reason, never a zero.
  const seatState = fixture();
  seatState.goalAttainmentClosures = [{
    id: 'gac-9', label: 'Q3 FY26 close', periodFrom: PERIOD.from, periodTo: PERIOD.to, closedOn: '2026-10-02',
    closedAt: '2026-10-02T00:00:00.000Z', closedById: 'ada', note: '',
    entries: [{ goalId: 'g1', bucket: 'on-track', span: 'ann' }],
    buckets: { achieved: 0, 'on-track': 1, 'at-risk': 0, 'off-track': 0, 'no-checkin': 0, 'unknown-confidence': 0, dropped: 0 },
    goalsN: 1, spansN: 1, ownerlessN: 0, multiLineN: 0,
  }];
  const seated = read(seatState, { seat: { id: 'sam', nodeId: 'sam', scope: new Set(['sam']), lineScope: new Set(['sam']), detailLevel: 'span', disclosure: { floorN: 3 } } });
  const spanRow = goalAttainmentCsvRows(seated).find((row) => row.row_type === 'span');
  assert.equal(spanRow.frozen_n, '', 'a sub-floor span exports BLANK');
  assert.ok(String(spanRow.claim_reason).length > 10, 'the blank carries its reason');
  assert.equal(governsSettings(), true);
});

function governsSettings() {
  const next = normalizeGoalAttainmentSettings({ goalAttainmentAskDueDays: 99, goalAttainmentAutoPropagate: 'off' });
  return next.goalAttainmentAskDueDays === 30 && next.goalAttainmentAutoPropagate === true;
}

/* ------------------------------------------------------- 11. the convention door */

test('the conventions refuse an out-of-bounds value instead of clamping it, and the close is capped', () => {
  const { api } = closeFixture();
  const refused = api.matrixGoalAttainmentSetConventions({ [GOAL_ATTAINMENT_SETTING_KEYS.askDueDays]: 400 });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /whole number from 1 to 30/);
  const ok = api.matrixGoalAttainmentSetConventions({ [GOAL_ATTAINMENT_SETTING_KEYS.askDueDays]: 10 });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(api.matrixGoalAttainmentReport().report.conventions.goalAttainmentAskDueDays, 10);
  assert.equal(GOAL_ATTAINMENT_LIMITS.asksPerCommit, 4);
  // The ADR the register cites actually exists.
  assert.ok(fs.existsSync(path.join(REPO, 'docs/adr/0206-goal-attainment-period-close.md')));
  // The reader's conditions are derived from the ONE report, never re-computed.
  const report = buildGoalAttainment(fixture(), { now: NOW });
  assert.deepEqual(goalAttainmentConditions(report, null), []);
});
