/**
 * tests/app/secondment.test.mjs — the Secondment / Assignment Return &
 * Handover Register (ADR-0262, Schema v214, `#/secondment`, `RULE-ASG-01`,
 * CSV scope #198).
 *
 * THE QUESTION THIS SUITE ANSWERS: does the register tell the truth about a
 * person who moved across lines — the named cover per duty, the return decision
 * before the declared day, both lines' handback — while doing none of the six
 * forbidden moves (no auto-end/extend/convert, no inferred coverage, no roster
 * edit, no score, no re-dated decision, no one-sided handback)?
 *
 * Displayed == stored/computed everywhere: the reader, the screen cells, the
 * CSV rows and the rule conditions all read the ONE derivation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION, COLLECTIONS } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { PAUSE_PERMIT_SWITCH_RULES, PAUSE_PERMIT_MATRIX_REACH_SWITCHES } from '../../app/core/domain/pausePermitRegistry.js';
import {
  asgAttentionCount,
  buildAssignmentReport,
  deriveAssignment,
} from '../../app/core/domain/asg.js';
import {
  normalizeAsgActs,
  normalizeAsgAssignments,
  normalizeAsgCovers,
  normalizeAsgSettings,
} from '../../app/core/domain/asgSchema.js';
import { returnDayLedger, daysBetweenDays } from '../../app/core/domain/asgMath.js';
import { asgConditions, asgRule, indexAsgAsks } from '../../app/core/domain/asgRules.js';
import { asgCsvRows } from '../../app/core/domain/asgReport.js';
import {
  ASG_CONDITION_KEYS,
  ASG_CSV_SCOPE,
  ASG_PAUSE_SWITCH,
  ASG_RULE_ID,
  ASG_SETTING_KEYS,
  ASG_STATE_KEYS,
  ASG_STATE_BY_KEY,
} from '../../app/core/domain/asgRegistry.js';
import { renderSecondment } from '../../app/views/secondment.js';

const NOW = new Date('2026-11-18T09:00:00.000Z');
const T0 = NOW.toISOString();
const iso = (value) => new Date(value).toISOString();
const day = (offset) => new Date(NOW.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
const at = (offset) => new Date(NOW.getTime() + offset * 86_400_000).toISOString();

/* ---------------------------------------------------------------- fixtures */

function person(id, name, level, managerId) {
  return { id, name, role: level, level, managerId, status: 'active', startDate: '2024-01-01T00:00:00.000Z', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' };
}

function line(id, personId, managerId, kind = 'functional') {
  return { id, personId, managerId, kind, shareH: null, rights: [], fromISO: '2024-01-01T00:00:00.000Z', toISO: null, declaredAt: '2024-01-01T00:00:00.000Z', note: '', status: 'active', history: [] };
}

/**
 * `samuel` is held by BOTH `mei` (home line) and `priya` (declared secondary
 * line) — the matrix case. An assignment of samuel's with sides mei and priya
 * must resolve one joint apex above both (ceo) and count samuel once.
 */
function fixture(overrides = {}) {
  const raw = createEmptyState(T0);
  raw.settings.chainLeaderAltitude = 'chief';
  raw.people = [
    person('ceo', 'Cleo Executive', 'vp', null),
    person('dana', 'Dana Function', 'director', 'ceo'),
    person('omar', 'Omar Project', 'director', 'ceo'),
    person('mei', 'Mei Manager', 'manager', 'dana'),
    person('priya', 'Priya Manager', 'manager', 'omar'),
    person('samuel', 'Samuel Holder', 'ic', 'mei'),
    person('frieda', 'Frieda Holder', 'ic', 'priya'),
  ];
  raw.reportingLines = [
    line('rl-mei-dana', 'mei', 'dana'),
    line('rl-priya-omar', 'priya', 'omar'),
    line('rl-samuel-mei', 'samuel', 'mei'),
    line('rl-samuel-priya', 'samuel', 'priya', 'cross-functional'),
    line('rl-frieda-priya', 'frieda', 'priya'),
  ];
  Object.assign(raw, overrides);
  return raw;
}

const assignment = (overrides = {}) => ({
  assignmentId: 'asg-a-one',
  personId: 'samuel',
  homeManagerId: 'mei',
  hostManagerId: 'priya',
  startDay: day(-60),
  declaredReturnDay: day(-5),
  termsRef: 'SEC-2026-14 secondment agreement',
  note: '',
  recordedById: 'mei',
  recordedDay: day(-62),
  recordedAt: at(-62),
  ...overrides,
});

const cover = (overrides = {}) => ({
  coverId: 'asg-c-one',
  assignmentId: 'asg-a-one',
  dutyLabel: 'On-call rota ownership',
  coverKind: 'retained-by-home',
  coverHandId: null,
  declaredById: 'mei',
  declaredDay: day(-58),
  declaredAt: at(-58),
  note: '',
  ...overrides,
});

const decisionAct = (overrides = {}) => ({
  actId: 'asg-act-dec',
  assignmentId: 'asg-a-one',
  kind: 'return-decision',
  decisionKind: 'return',
  rationale: 'The programme milestone closed and both lines asked for the return.',
  newDeclaredReturnDay: null,
  recordedById: 'mei',
  day: day(-20),
  at: at(-20),
  note: '',
  ...overrides,
});

const consentAct = (overrides = {}) => ({
  actId: 'asg-act-consent',
  assignmentId: 'asg-a-one',
  kind: 'home-consent',
  basis: 'Home-line consent to permanent transfer, minuted in the leadership review.',
  consentById: 'mei',
  recordedById: 'mei',
  day: day(-18),
  at: at(-18),
  note: '',
  ...overrides,
});

const handbackAct = (overrides = {}) => ({
  actId: 'asg-act-hb-home',
  assignmentId: 'asg-a-one',
  kind: 'handback',
  side: 'home',
  receivedById: 'mei',
  evidenceRef: 'Handback note SEC-2026-14-H1',
  recordedById: 'mei',
  day: day(-16),
  at: at(-16),
  note: '',
  ...overrides,
});

const load = (raw) => normalizeState(raw, { now: NOW }).state;
const read = (raw, opts = {}) => buildAssignmentReport(load(raw), { now: NOW, ...opts });

function harness(raw) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(load(raw))]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-t-${++sequence}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  const api = guardApi(createApi(store, { now: () => NOW, idFactory }), store, { now: () => NOW.getTime() });
  return { store, api };
}

function asSeat(api, store, seatId) {
  store.update((draft) => { draft.settings.activeSeatId = seatId; }, { type: 'test.seat', entity: 'workspace', entityId: seatId, summary: 'test seat' });
  return api;
}

/* --------------------------------------------------------------- 1. schema */

test('schema v214 is additive: four empty ledgers, four conventions, nothing inferred', () => {
  assert.equal(SCHEMA_VERSION, 214, 'ADR-0262 (secondment & assignment return) is the current head');
  const state = load(fixture());
  for (const collection of ['asgAssignments', 'asgCovers', 'asgActs', 'asgMarkers']) {
    assert.ok(COLLECTIONS.includes(collection), `${collection} must be a governed collection`);
    assert.deepEqual(state[collection], [], `${collection} starts empty`);
  }
  const conv = normalizeAsgSettings(state.settings);
  assert.equal(conv[ASG_SETTING_KEYS.autoPropagate], true, 'assignment propagation defaults ON');
  assert.equal(conv[ASG_SETTING_KEYS.privacyFloor], 3, 'privacy floor defaults to 3');
  assert.equal(conv[ASG_SETTING_KEYS.warnHorizonDays], 14, 'warn horizon defaults to 14 days');
  assert.equal(conv[ASG_SETTING_KEYS.handbackHorizonDays], 14, 'handback horizon defaults to 14 days');
  // Nothing inferred from a person, a reporting line or a goal.
  assert.deepEqual(state.asgAssignments, []);
  assert.deepEqual(state.asgActs, []);
});

test('migration 213 → 214 is additive and carries the empty ledgers forward', () => {
  const before = migrate({ schemaVersion: 213, settings: {} });
  assert.equal(before.raw.schemaVersion, 214);
  assert.deepEqual(before.raw.asgAssignments, []);
  assert.deepEqual(before.raw.asgCovers, []);
  assert.deepEqual(before.raw.asgActs, []);
  assert.deepEqual(before.raw.asgMarkers, []);
});

/* -------------------------------------------------------------- 2. loaders */

test('the loaders are fail-closed: a bad assignment or act is dropped with its reason, never repaired', () => {
  const warnings = [];
  const good = assignment();
  const dropped = normalizeAsgAssignments([
    good,
    assignment({ assignmentId: 'asg-no-terms', termsRef: '' }),
    assignment({ assignmentId: 'asg-self-side', personId: 'mei' }), // person is a side
    assignment({ assignmentId: 'asg-same-sides', hostManagerId: 'mei' }), // sides one hand
    assignment({ assignmentId: 'asg-backwards', declaredReturnDay: day(-70) }), // return not after start
  ], warnings);
  assert.deepEqual(dropped.map((a) => a.assignmentId), ['asg-a-one'], 'only the well-formed assignment loads');
  assert.equal(warnings.length, 4, 'four drops, four printed reasons');
  assert.ok(warnings.some((w) => /terms instrument/.test(w)), 'the missing terms instrument is named');

  const actWarnings = [];
  const acts = normalizeAsgActs([
    decisionAct(),
    decisionAct({ actId: 'asg-act-second', day: day(-10), at: at(-10) }), // question already answered
    decisionAct({ actId: 'asg-act-badmove', decisionKind: 'extend', newDeclaredReturnDay: day(-30) }), // extend backwards after answered
    consentAct({ actId: 'asg-act-early-consent', day: day(-40), at: at(-40), consentById: 'mei', recordedById: 'mei' }), // before any convert on chain
    handbackAct({ actId: 'asg-act-noev', evidenceRef: '' }), // no evidence reference
  ], [good], actWarnings);
  assert.deepEqual(acts.map((a) => a.actId), ['asg-act-dec'], 'only the first, chain-valid decision loads');
  assert.equal(actWarnings.length, 4, 'four act drops, four printed reasons');
  assert.ok(actWarnings.some((w) => /after the question was answered/.test(w)), 'the second answer is refused by name');
});

test('the loader keeps an off-roster cover hand as an orphan, never drops the duty', () => {
  const raw = fixture({ asgAssignments: [assignment()], asgCovers: [cover({ coverKind: 'named-cover', coverHandId: 'ghost-hand' })] });
  const report = read(raw);
  assert.equal(report.rows.length, 1, 'the assignment is kept');
  assert.equal(report.rows[0].coverageRows.length, 1, 'the duty is kept');
  assert.equal(report.rows[0].coverageRows[0].coverHandOrphan, true, 'the named hand prints as off graph');
  assert.deepEqual(report.rows[0].orphans.map((o) => o.role), ['cover-hand'], 'the orphan is named by role');
});

/* --------------------------------------------------------------- 3. states */

test('the nine states are derived, not stored — one different fact each', () => {
  const cases = [
    ['planned', { startDay: day(5), declaredReturnDay: day(60) }, []],
    ['active', { startDay: day(-60), declaredReturnDay: day(30) }, []],
    ['decision-due', { startDay: day(-60), declaredReturnDay: day(6) }, []],
    ['return-decision-overdue', { startDay: day(-60), declaredReturnDay: day(-5) }, []],
    ['handback-open', { startDay: day(-60), declaredReturnDay: day(-5) }, [decisionAct()]],
    ['returned', { startDay: day(-60), declaredReturnDay: day(-5) }, [decisionAct(), handbackAct(), handbackAct({ actId: 'asg-act-hb-host', side: 'host', receivedById: 'priya', recordedById: 'priya', evidenceRef: 'Handback note SEC-2026-14-H2' })]],
    ['transfer-consent-owed', { startDay: day(-60), declaredReturnDay: day(-5) }, [decisionAct({ decisionKind: 'convert' })]],
    ['transfer-handback-open', { startDay: day(-60), declaredReturnDay: day(-5) }, [decisionAct({ decisionKind: 'convert' }), consentAct(), handbackAct()]],
    ['transferred', { startDay: day(-60), declaredReturnDay: day(-5) }, [decisionAct({ decisionKind: 'convert' }), consentAct(), handbackAct(), handbackAct({ actId: 'asg-act-hb-host', side: 'host', receivedById: 'priya', recordedById: 'priya', evidenceRef: 'Handback note SEC-2026-14-H2' })]],
  ];
  for (const [expected, window, acts] of cases) {
    const raw = fixture({
      asgAssignments: [assignment(window)],
      asgCovers: [cover()],
      asgActs: acts.map((a, i) => ({ ...a, actId: `${a.actId}-${i}` })),
    });
    const report = read(raw);
    assert.equal(report.rows.length, 1, `${expected}: one row`);
    assert.equal(report.rows[0].state, expected, `${expected} derives from the declared facts`);
    assert.equal(ASG_STATE_BY_KEY[expected].key, expected, 'the printed vocabulary carries the state');
    // NOTHING derived is stored: the raw rows carry no state, no verdict, no day count.
    const stored = JSON.stringify(load(raw).asgAssignments) + JSON.stringify(load(raw).asgActs);
    assert.equal(/"state"|"overdueDays"|"decidedLate"|"handbackComplete"/.test(stored), false, `${expected}: nothing derived is stored`);
  }
  assert.equal(ASG_STATE_KEYS.length, 9, 'nine different facts, never one reassuring word');
});

/* ------------------------------------------------------------- 4. the clock */

test('an overdue return day prints the exact days and NEVER converts, extends or ends anything', () => {
  const raw = fixture({ asgAssignments: [assignment()], asgCovers: [cover()] });
  const before = JSON.stringify(load(raw).asgAssignments);
  const early = buildAssignmentReport(load(raw), { now: new Date('2026-11-14T09:00:00.000Z') });
  assert.equal(early.rows[0].state, 'return-decision-overdue');
  assert.equal(early.rows[0].overdueDays, 1, 'days are whole and exact: 2026-11-13 to 2026-11-14');
  const late = buildAssignmentReport(load(raw), { now: new Date('2026-12-24T09:00:00.000Z') });
  assert.equal(late.rows[0].state, 'return-decision-overdue', 'silence keeps the state; it never becomes returned or transferred');
  assert.equal(late.rows[0].overdueDays, 41, 'the exact days grow (2026-11-13 to 2026-12-24); nothing is absorbed');
  // Displayed == stored: re-reading changed no record.
  assert.equal(JSON.stringify(load(raw).asgAssignments), before, 'the declaration is read, never rewritten');
  assert.equal(late.rows[0].returnDayInForce, day(-5), 'the declared day is never moved to make silence timely');
});

test('a late decision keeps its own day and prints decided-late; the day is never re-dated', () => {
  const raw = fixture({
    asgAssignments: [assignment()],
    asgCovers: [cover()],
    asgActs: [decisionAct({ day: day(-2), at: at(-2) }), handbackAct({ day: day(-1), at: at(-1) }), handbackAct({ actId: 'asg-act-hb-host', side: 'host', receivedById: 'priya', recordedById: 'priya', evidenceRef: 'H2', day: day(0), at: at(0) })],
  });
  const report = read(raw);
  const row = report.rows[0];
  assert.equal(row.state, 'returned');
  assert.equal(row.decidedLate, true, 'the decision is late against the day it answered');
  assert.equal(row.lateDays, 3, 'three whole days late against the return day in force');
  assert.equal(row.returnDayInForce, day(-5), 'the declared day stands; the decision keeps its own day');
  assert.equal(row.decisions[0].day, day(-2), 'displayed == stored: the recorded day is what prints');
});

test('an extend moves the day FORWARD only, keeps the original visible, and re-arms the ladder', () => {
  const raw = fixture({
    asgAssignments: [assignment()],
    asgCovers: [cover()],
    asgActs: [decisionAct({ decisionKind: 'extend', newDeclaredReturnDay: day(6) })],
  });
  const report = read(raw);
  const row = report.rows[0];
  assert.equal(row.state, 'decision-due', 'the new day is inside the warn horizon — the question re-opened');
  assert.equal(row.returnDayInForce, day(6), 'the day in force moved forward');
  assert.equal(row.originalReturnDay, day(-5), 'the original day is kept and printed beside it');
  assert.equal(row.extends, 1, 'one accepted extend');

  // The loader refuses an extend that does not move the day forward.
  const warnings = [];
  const acts = normalizeAsgActs([
    decisionAct({ actId: 'a1', decisionKind: 'extend', newDeclaredReturnDay: day(-5) }),
    decisionAct({ actId: 'a2', decisionKind: 'extend', newDeclaredReturnDay: day(2), day: day(-10), at: at(-10) }),
  ], [assignment()], warnings);
  assert.deepEqual(acts.map((a) => a.actId), ['a2'], 'a standstill extend is dropped by name');
  assert.ok(warnings.some((w) => /does not move the declared return day forward/.test(w)));

  // The ledger judges each decision against the day in force at its own day.
  const ledger = returnDayLedger(assignment(), [{ actId: 'x', decisionKind: 'extend', newDeclaredReturnDay: day(3), day: day(-30), at: at(-30) }]);
  assert.equal(ledger.returnDayInForce, day(3));
  assert.equal(ledger.timed[0].answeredDay, day(-5), 'the extend answered the original day');
});

/* --------------------------------------------------------- 5. matrix truth */

test('the matrix counts the person once, resolves the joint apex, and prints orphans rather than dropping them', () => {
  const raw = fixture({
    asgAssignments: [assignment(), assignment({ assignmentId: 'asg-a-two', personId: 'frieda', homeManagerId: 'priya', hostManagerId: 'dana' })],
    asgCovers: [cover()],
  });
  const report = read(raw);
  assert.equal(report.totals.persons, 2, 'each person counts ONCE however many lines hold them');
  assert.equal(report.totals.total, 2, 'no assignment dropped, none duplicated');
  const samuel = report.rows.find((r) => r.personId === 'samuel');
  assert.deepEqual(samuel.managerIds.sort(), ['mei', 'priya'], 'the two named sides and every active line join the apex set');
  assert.equal(samuel.jointApex.apexId, 'ceo', 'the lowest joint apex above BOTH lines answers, never one manager for the other');
  // A named side whose line is not on the live graph prints the disagreement.
  const frank = report.rows.find((r) => r.personId === 'frieda');
  assert.deepEqual(frank.sideLineMismatch.sort(), ['host'], 'host side dana holds no line for frieda — printed, never repointed');
});

/* ---------------------------------------------------------- 6. RULE-ASG-01 */

function commitSpy() {
  const filed = [];
  const commit = (payload) => { filed.push(payload); };
  return { filed, commit };
}

test('RULE-ASG-01 files capped, opaque asks to the joint apex, and counts the deferred', () => {
  // Six conditions: overdue + uncovered duty on two assignments.
  const raw = fixture({
    asgAssignments: [
      assignment({ assignmentId: 'asg-a-one' }),
      assignment({ assignmentId: 'asg-a-two', personId: 'frieda', homeManagerId: 'priya', hostManagerId: 'dana', declaredReturnDay: day(-4) }),
    ],
    asgCovers: [
      cover({ assignmentId: 'asg-a-one', coverKind: 'uncovered' }),
      cover({ assignmentId: 'asg-a-two', coverKind: 'uncovered', coverId: 'asg-c-two' }),
    ],
    asgActs: [],
  });
  const state = load(raw);
  const report = buildAssignmentReport(state, { now: NOW });
  const conditions = asgConditions(report, { now: NOW });
  assert.equal(conditions.length, 4, 'overdue ×2 + uncovered duty ×2');
  assert.deepEqual([...new Set(conditions.map((c) => c.kind))].sort(), ['duty-cover-uncovered', 'return-decision-overdue']);

  const { filed, commit } = commitSpy();
  const result = asgRule(state, { now: NOW, commit, scan: true });
  assert.equal(result.filed, 4);
  assert.equal(result.deferred, 0);
  for (const ask of filed) {
    assert.equal(ask.kind, 'issues-obligation');
    assert.equal(ask.ruleId, ASG_RULE_ID);
    assert.equal(ask.status, 'open');
    assert.ok(ask.to && ask.to.apexId, 'every ask routes to a resolved joint apex');
    assert.equal(ask.to.apexId, 'ceo');
    // Opacity: a delegation is readable above the addressee, so no title
    // carries an assignment reference, a person, a manager or a duty label.
    assert.equal(/asg-a|Samuel|Frieda|Mei|Priya|Dana|rota|On-call/i.test(ask.title), false, `opaque title: ${ask.title}`);
    assert.ok(String(ask.meta.signature || ask.signature || '').startsWith('asg1:'), 'the opaque signature lives on the link');
  }

  // Cap: six conditions, four filed, two deferred and counted.
  const big = fixture({
    asgAssignments: ['a', 'b', 'c'].map((x, i) => assignment({ assignmentId: `asg-a-${x}`, personId: i === 1 ? 'frieda' : 'samuel', homeManagerId: i === 1 ? 'priya' : 'mei', hostManagerId: i === 1 ? 'dana' : 'priya', declaredReturnDay: day(-5 - i) })),
    asgCovers: [
      cover({ coverId: 'c1', assignmentId: 'asg-a-a', coverKind: 'uncovered' }),
      cover({ coverId: 'c2', assignmentId: 'asg-a-a', coverKind: 'uncovered', dutyLabel: 'Second duty' }),
      cover({ coverId: 'c3', assignmentId: 'asg-a-b', coverKind: 'uncovered' }),
      cover({ coverId: 'c4', assignmentId: 'asg-a-c', coverKind: 'uncovered' }),
    ],
  });
  const bigState = load(big);
  const bigResult = asgRule(bigState, { now: NOW, commit: () => {}, scan: true });
  assert.equal(bigResult.filed, 4, 'the ask cap is 4 per commit');
  assert.equal(bigResult.deferred, 3, 'the remainder (7 conditions − 4 filed) is counted, never dropped');
});

test('RULE-ASG-01 is pause-governed on every path and self-closes: closed or open asks are never re-filed', () => {
  const raw = fixture({ asgAssignments: [assignment()], asgCovers: [cover()] });
  const state = load(raw);
  // Paused: nothing filed on the ordinary path.
  const paused = asgRule(state, { now: NOW, settings: { ...state.settings, [ASG_PAUSE_SWITCH]: false }, commit: () => {} });
  assert.equal(paused.paused, true);
  assert.equal(paused.filed, 0, 'silenced is paused-and-printed, never silent');
  // The explicit scan still files under the pause — the permit governs
  // propagation, not a human asking for the truth.
  const scanned = asgRule(state, { now: NOW, settings: { ...state.settings, [ASG_PAUSE_SWITCH]: false }, commit: () => {}, scan: true });
  assert.equal(scanned.filed, 1);

  // An OPEN ask for the same signature is never duplicated.
  const withOpen = load(raw);
  withOpen.links = [{
    id: 'lnk-open', kind: 'issues-obligation', signature: `asg1:return-decision-overdue:asg-a-one`,
    from: 'secondment', to: { nodeId: 'ceo', apexId: 'ceo' }, status: 'open', ruleId: ASG_RULE_ID,
    title: 'x', createdAt: T0,
  }];
  const deduped = asgRule(withOpen, { now: NOW, commit: () => {}, scan: true });
  assert.equal(deduped.filed, 0, 'one ask per signature; the open ask stands');

  // A CLOSED ask is never re-filed — a human answer is final for this condition.
  const withClosed = load(raw);
  withClosed.links = [{
    id: 'lnk-closed', kind: 'issues-obligation', signature: `asg1:return-decision-overdue:asg-a-one`,
    from: 'secondment', to: { nodeId: 'ceo', apexId: 'ceo' }, status: 'closed', ruleId: ASG_RULE_ID,
    title: 'x', createdAt: T0,
  }];
  const notRefiled = asgRule(withClosed, { now: NOW, commit: () => {}, scan: true });
  assert.equal(notRefiled.filed, 0, 'a closed ask is answered; it is never re-opened by the clock');
});

test('RULE-ASG-01 observes identity-free where nobody can be asked, and substitutes nobody', () => {
  const raw = fixture({
    asgAssignments: [assignment({ personId: 'ghost-person', homeManagerId: 'ghost-home', hostManagerId: 'ghost-host' })],
    asgCovers: [cover()],
  });
  const state = load(raw);
  const { filed, commit } = commitSpy();
  const result = asgRule(state, { now: NOW, commit, scan: true });
  assert.equal(result.filed, 0, 'nobody to ask substitutes nobody');
  assert.equal(result.markers, 1, 'ONE identity-free observation');
  const marker = state.asgMarkers[0];
  assert.equal(marker.condition, 'return-decision-overdue');
  assert.equal(/samuel|mei|priya|Samuel/i.test(JSON.stringify(marker)), false, 'the marker names no person');
});

test('the rule spine is registered in post-commit, the contracts and the pause census', () => {
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(asgRule), 'RULE-ASG-01 is on the spine');
  const contract = PROPAGATION_CONTRACTS.find((c) => c.rule === asgRule);
  assert.ok(contract, 'the contract is declared');
  assert.equal(contract.module, 'asgRules.js');
  assert.ok(contract.purpose.includes('RULE-ASG-01'), 'the contract names the rule');
  assert.equal(PAUSE_PERMIT_SWITCH_RULES[ASG_PAUSE_SWITCH], 'asgRules.js', 'the pause census can see the switch');
  assert.ok(PAUSE_PERMIT_MATRIX_REACH_SWITCHES.includes(ASG_PAUSE_SWITCH), 'the rule reaches across lines and carries a permit');
});

/* --------------------------------------------------------------- 7. doors */

test('the door refuses a nonsense window, a person as their own side and one hand as both sides', () => {
  const { api, store } = harness(fixture());
  const bad = api.asgDeclareAssignment(assignment({ declaredReturnDay: day(-70) }));
  assert.equal(bad.ok, false, 'a return day before the start day is refused');
  assert.equal(bad.refusal, 'secondment:bad-window');
  const selfSide = api.asgDeclareAssignment(assignment({ assignmentId: 'a2', personId: 'mei' }));
  assert.equal(selfSide.ok, false, 'a person cannot be their own side');
  assert.equal(selfSide.refusal, 'secondment:person-is-side');
  const same = api.asgDeclareAssignment(assignment({ assignmentId: 'a3', hostManagerId: 'mei' }));
  assert.equal(same.ok, false, 'both sides cannot be one hand');
  assert.equal(same.refusal, 'secondment:sides-identical');
  assert.equal(store.state.asgAssignments.length, 0, 'displayed == stored: three refusals, nothing written');
});

test('the door refuses an unreasoned decision, a second answer, a standstill extend and a pre-start decision', () => {
  const { api } = harness(fixture({ asgAssignments: [assignment()], asgCovers: [cover()] }));
  const noRationale = api.asgRecordReturnDecision({ assignmentId: 'asg-a-one', decisionKind: 'return', rationale: '', recordedById: 'mei', day: day(-2), at: at(-2) });
  assert.equal(noRationale.ok, false);
  assert.equal(noRationale.refusal, 'secondment:missing-rationale');

  const good = api.asgRecordReturnDecision({ assignmentId: 'asg-a-one', decisionKind: 'return', rationale: 'Both lines asked for the return.', recordedById: 'mei', day: day(-2), at: at(-2) });
  assert.equal(good.ok, true, 'the decision is recorded');

  const second = api.asgRecordReturnDecision({ assignmentId: 'asg-a-one', decisionKind: 'convert', rationale: 'Changed my mind.', recordedById: 'mei', day: day(-1), at: at(-1) });
  assert.equal(second.ok, false, 'the question is answered; a second answer is refused');
  assert.equal(second.refusal, 'secondment:question-answered');

  const { api: fresh } = harness(fixture({ asgAssignments: [assignment({ startDay: day(-10), declaredReturnDay: day(20) })], asgCovers: [cover()] }));
  const standstill = fresh.asgRecordReturnDecision({ assignmentId: 'asg-a-one', decisionKind: 'extend', newDeclaredReturnDay: day(20), rationale: 'Standing still.', recordedById: 'mei', day: day(-2), at: at(-2) });
  assert.equal(standstill.ok, false, 'an extend must move the day forward');
  assert.equal(standstill.refusal, 'secondment:no-forward-motion');

  const preStart = fresh.asgRecordReturnDecision({ assignmentId: 'asg-a-one', decisionKind: 'return', rationale: 'Cancelled before it began.', recordedById: 'mei', day: day(-11), at: at(-11) });
  assert.equal(preStart.ok, false, 'a pre-start cancellation is not a return decision');
  assert.equal(preStart.refusal, 'secondment:assignment-not-started');
});

test('the door refuses a consent without a convert, a handback without a decision, and evidence without a reference', () => {
  const { api } = harness(fixture({ asgAssignments: [assignment()], asgCovers: [cover()] }));
  const early = api.asgRecordHomeConsent({ assignmentId: 'asg-a-one', basis: 'Agreed in the review.', consentById: 'mei', recordedById: 'mei', day: day(-2), at: at(-2) });
  assert.equal(early.ok, false, 'consent answers a conversion question that is not on the chain');
  assert.equal(early.refusal, 'secondment:consent-without-convert');

  const hb = api.asgRecordHandback({ assignmentId: 'asg-a-one', side: 'home', receivedById: 'mei', evidenceRef: 'H1', recordedById: 'mei', day: day(-2), at: at(-2) });
  assert.equal(hb.ok, false, 'nothing has been decided to hand back');
  assert.equal(hb.refusal, 'secondment:handback-without-decision');

  const { api: withConvert } = harness(fixture({
    asgAssignments: [assignment()],
    asgCovers: [cover()],
    asgActs: [decisionAct({ decisionKind: 'convert' })],
  }));
  const noEvidence = withConvert.asgRecordHandback({ assignmentId: 'asg-a-one', side: 'home', receivedById: 'mei', evidenceRef: '', recordedById: 'mei', day: day(-1), at: at(-1) });
  assert.equal(noEvidence.ok, false, 'a handback without its evidence reference is refused');
  assert.equal(noEvidence.refusal, 'secondment:missing-evidence');
});

test('a write is narrowed to a seat that holds a named side, and the stored row is the loader row', () => {
  const { api, store } = harness(fixture());
  // `mei` holds samuel (span) but neither side manager omar/dana as a side.
  const seated = asSeat(api, store, 'mei');
  const refused = seated.asgDeclareAssignment(assignment({ assignmentId: 'asg-x', personId: 'samuel', homeManagerId: 'omar', hostManagerId: 'dana' }));
  assert.equal(refused.ok, false, 'a seat that holds no named side refuses');
  assert.equal(refused.refusal, 'secondment:side-not-held');

  // The same seat declaring her own side's assignment stores the loader row.
  const ok = seated.asgDeclareAssignment(assignment());
  assert.equal(ok.ok, true, 'the side holder declares');
  const stored = store.state.asgAssignments[0];
  const loaderRow = normalizeAsgAssignments([assignment()])[0];
  assert.equal(stored.assignmentId, loaderRow.assignmentId);
  assert.equal(stored.declaredReturnDay, loaderRow.declaredReturnDay, 'displayed == stored: the stored row is the loader row');
  assert.equal(stored.termsRef, loaderRow.termsRef);
});

/* ----------------------------------------------------------- 8. screen & CSV */

test('the panel prints the reader figures cell by cell on the demo — displayed == computed', () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="modal-root"></div></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  try {
    const state = load(buildDemoState(NOW));
    const report = buildAssignmentReport(state, { now: NOW });
    const view = renderSecondment({ api: { getState: () => state }, query: new URLSearchParams(''), state, secondmentReport: report, refresh: () => {} });
    const html = view.outerHTML || String(view);
    assert.ok(html.includes('data-testid="secondment-page"'), 'the page renders');
    // Every derived state label the reader holds prints on the screen.
    for (const row of report.rows) {
      assert.ok(html.includes(ASG_STATE_BY_KEY[row.state].label), `state ${row.state} prints its published label`);
    }
    // Stats equal the reader's totals.
    assert.ok(html.includes(String(report.totals.total)), 'the assignments stat equals the reader');
    assert.ok(html.includes(String(report.totals.uncovered)), 'the uncovered-duties stat equals the reader');
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.Node;
    delete globalThis.Element;
  }
});

test('the panel renders every tab on an empty workspace without throwing', () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="modal-root"></div></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  try {
    const state = load(fixture());
    const report = buildAssignmentReport(state, { now: NOW });
    for (const viewKey of ['assignments', 'coverage', 'decisions', 'method']) {
      const view = renderSecondment({
        api: { getState: () => state },
        query: new URLSearchParams(`view=${viewKey}`),
        state,
        secondmentReport: report,
        refresh: () => {},
      });
      const html = view.outerHTML || String(view);
      assert.ok(html.includes('data-testid="secondment-page"'), `the ${viewKey} view renders`);
    }
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.Node;
    delete globalThis.Element;
  }
});

test('the CSV boundary is aggregate, identity-free and floored, and equals the reader', () => {
  // Three returned assignments (at the floor, so the count prints) and one
  // planned (below the floor, so it withholds BLANK with its reason).
  const returnedActs = (id, dayOff) => [
    decisionAct({ actId: `dec-${id}`, assignmentId: `asg-a-${id}`, day: day(dayOff), at: at(dayOff) }),
    handbackAct({ actId: `hb1-${id}`, assignmentId: `asg-a-${id}`, day: day(dayOff + 1), at: at(dayOff + 1) }),
    handbackAct({ actId: `hb2-${id}`, assignmentId: `asg-a-${id}`, side: 'host', receivedById: 'priya', recordedById: 'priya', evidenceRef: 'H2', day: day(dayOff + 2), at: at(dayOff + 2) }),
  ];
  const raw = fixture({
    asgAssignments: [
      assignment({ assignmentId: 'asg-a-x1' }),
      assignment({ assignmentId: 'asg-a-x2', personId: 'frieda', homeManagerId: 'priya', hostManagerId: 'dana' }),
      assignment({ assignmentId: 'asg-a-x3', personId: 'samuel', homeManagerId: 'mei', hostManagerId: 'priya', startDay: day(-90), declaredReturnDay: day(-8) }),
      assignment({ assignmentId: 'asg-a-x4', personId: 'frieda', homeManagerId: 'priya', hostManagerId: 'dana', startDay: day(5), declaredReturnDay: day(60) }),
    ],
    asgCovers: [],
    asgActs: [...returnedActs('x1', -12), ...returnedActs('x2', -14), ...returnedActs('x3', -16)],
  });
  const state = load(raw);
  const report = buildAssignmentReport(state, { now: NOW });
  assert.equal(report.totals.total, 4);
  assert.equal(report.totals.returned, 3);
  assert.equal(report.totals.planned, 1);

  const exported = exportWorkspaceCsv(state, ASG_CSV_SCOPE, { now: NOW });
  assert.equal(exported.ok, true, 'the scope is registered');
  const csv = exported.csv;
  const { headers, rows } = parseCsv(csv);
  assert.ok(rows.length > 1, 'the export carries rows');

  // Identity-free: no person, no assignment reference, no duty label crosses.
  assert.equal(/Samuel|Mei|Priya|Dana|Frieda|samuel|mei|priya|dana|frieda|asg-a-|asg-c-|rota|On-call|SEC-2026|H2/.test(csv), false, 'the aggregate carries no identity');

  const kindIdx = headers.indexOf('row_kind');
  const keyIdx = headers.indexOf('key');
  const stateRows = rows.filter((r) => r[kindIdx] === 'state');
  assert.equal(stateRows.length, ASG_STATE_KEYS.length, 'one row per printed state');
  const summary = rows.find((r) => r[kindIdx] === 'summary');
  assert.equal(Number(summary[headers.indexOf('assignments_n')]), report.totals.total, 'the summary row equals the reader');

  // Displayed == computed per state: a printed count is exactly the reader's
  // count; a withheld one is BLANK with its reason because it is below the
  // declared privacy floor — never a small number.
  const floor = report.conventions[ASG_SETTING_KEYS.privacyFloor];
  const countByState = {
    planned: report.totals.planned, active: report.totals.active,
    'decision-due': report.totals.decisionDue, 'return-decision-overdue': report.totals.returnDecisionOverdue,
    'handback-open': report.totals.handbackOpen, returned: report.totals.returned,
    'transfer-consent-owed': report.totals.transferConsentOwed, 'transfer-handback-open': report.totals.transferHandbackOpen,
    transferred: report.totals.transferred,
  };
  for (const r of stateRows) {
    const cell = r[headers.indexOf('assignments_n')];
    const expected = countByState[r[keyIdx]];
    if (expected === 0) {
      // A zero is a fact about absence, never a small count to hide.
      assert.equal(Number(cell), 0, `state ${r[keyIdx]} prints its zero`);
    } else if (expected >= floor) {
      assert.equal(Number(cell), expected, `state ${r[keyIdx]} prints exactly the reader's count`);
    } else {
      assert.equal(cell, '', `state ${r[keyIdx]} is below the floor and withholds BLANK`);
      assert.ok(r[headers.indexOf('blank_reason')].length > 0, 'the withholding carries its reason');
    }
  }

  // The rows asgCsvRows prints are exactly the rows the export prints (module == boundary).
  const moduleRows = asgCsvRows(report);
  assert.equal(moduleRows.length, rows.length, 'displayed == stored: module rows equal exported rows');
});

/* --------------------------------------------------------------- 9. demo */

test('the demo proves the whole lifecycle: nine assignments, one per derived state, nothing stored', () => {
  const state = load(buildDemoState(NOW));
  const report = buildAssignmentReport(state, { now: NOW });
  assert.equal(report.rows.length, 9, 'nine assignments');
  const seen = new Set(report.rows.map((r) => r.state));
  assert.equal(seen.size, 9, 'all nine derived states are on screen in the demo');
  assert.equal(report.counts.total, 9, 'no assignment dropped or duplicated');
  const attention = asgAttentionCount(state, { now: NOW });
  assert.equal(typeof attention, 'number');
  assert.ok(attention > 0, 'the demo opens with real attention owed');
  for (const row of report.rows) {
    assert.equal('state' in row.assignment, false, 'the stored declaration carries no state');
    assert.ok(row.personName, 'every row resolves a person name');
    assert.ok(row.homeManagerName && row.hostManagerName, 'every row names both sides');
  }
});

test('the attention count is derived from the reader: one count per owed thing', () => {
  const raw = fixture({
    asgAssignments: [assignment()],
    asgCovers: [cover({ coverKind: 'uncovered' })],
    asgActs: [],
  });
  const state = load(raw);
  // One overdue assignment with one uncovered duty = 2.
  assert.equal(asgAttentionCount(state, { now: NOW }), 2, 'overdue decision + uncovered duty');
});
