/**
 * tests/app/onboarding-matrix.test.mjs — Matrix Onboarding Completeness
 * (Schema v125, ADR-0150, `#/onboarding?panel=matrix`, `RULE-ONB-01`, CSV #112).
 *
 * Organised around what one 30-60-90 plan can be betrayed by:
 *
 *  1. NEVER COUNT A PERSON TWICE. Two concurrent plans for one person are ONE case
 *     with the duplicate named on it, and every total is a count of lines or of
 *     distinct people — never of plan-line pairs.
 *  2. TWO CLAIMS, TWO FIGURES. `crossLineComplete` and the plan's own completion
 *     are printed separately; a plan marked completed is NOT cross-line coverage.
 *  3. NEVER SILENCE AS AGREEMENT. A line that wrote nothing reads `unbriefed` or
 *     `awaiting-brief`; a brief nobody acknowledged reads `briefed`. Neither closes
 *     anything, and a presumption is printed as a presumption.
 *  4. ONE SIDE EACH. Only the manager who holds the line may write it; only the
 *     person may acknowledge it. Both are refused by the live API and by the
 *     normalizer when a file is hand-edited.
 *  5. DISPLAY == STORED. Every figure the report, the panel and the CSV print is
 *     recomputed from the stored blob, before and after a real reload.
 *  6. INERT SINGLE CHAIN. A workspace with one line gains no case, no ask, no edge
 *     and no delegation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { exportWorkspaceCsv, parseCsv, CSV_EXPORTS } from '../../app/core/csv.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import {
  buildOnboardingMatrix,
  buildOnboardingMatrixCase,
  onboardingMatrixAttentionCount,
  onboardingMatrixBriefText,
  onboardingMatrixCsvRows,
  ONBOARDING_MATRIX_CSV_COLUMNS,
} from '../../app/core/domain/onboardingMatrix.js';
import { onboardingMatrixRule } from '../../app/core/domain/onboardingMatrixRules.js';
import { ONBOARDING_MATRIX_RULE_ID } from '../../app/core/domain/onboardingMatrixRegistry.js';

const NOW = new Date('2026-11-09T10:00:00.000Z');
const TODAY = '2026-11-09';
const ISO = NOW.toISOString();
/** A plan that started 20 days ago: the 7-day brief window has already passed. */
const LATE_START = '2026-10-20';
/** A plan that started today: the brief window is still open. */
const FRESH_START = '2026-11-09';

/* --------------------------------------------------------------- fixtures */

/**
 * dana ─┬─ priya ── kim
 *       ├─ sam ──── lee     (sam's home line is dana; she also leads one person,
 *       │                    so the person herself has a real seat in this test)
 *       └── (sam's project line is held by priya, declared separately)
 */
function roster() {
  return [
    { id: 'dana', name: 'Dana Eng', role: 'Director of Engineering', level: 'director', managerId: null, status: 'active', startDate: '2024-01-01', createdAt: ISO },
    { id: 'priya', name: 'Priya PM', role: 'Head of Delivery', level: 'manager', managerId: 'dana', status: 'active', startDate: '2024-01-01', createdAt: ISO },
    { id: 'kim', name: 'Kim Junior', role: 'Engineer', level: 'ic', managerId: 'priya', status: 'active', startDate: '2026-09-01', createdAt: ISO },
    { id: 'sam', name: 'Sam Engineer', role: 'Engineer', level: 'lead', managerId: 'dana', status: 'active', startDate: '2026-09-01', createdAt: ISO },
    { id: 'lee', name: 'Lee Analyst', role: 'Analyst', level: 'ic', managerId: 'sam', status: 'active', startDate: '2026-09-01', createdAt: ISO },
  ];
}

function projectLine(over = {}) {
  return {
    id: 'line-sam-priya',
    personId: 'sam',
    managerId: 'priya',
    kind: 'project',
    shareH: 40,
    rights: [],
    fromISO: '2026-09-01',
    toISO: null,
    declaredAt: '2026-09-01T09:00:00.000Z',
    declaredBySeatId: null,
    note: 'Migration programme delivery.',
    ...over,
  };
}

function plan(over = {}) {
  return {
    id: 'ob-1',
    personId: 'sam',
    kind: 'new-hire',
    label: '',
    startDate: LATE_START,
    buddyId: 'kim',
    buddyName: '',
    roleClarity: 'Owns the billing service.',
    earlyWin: 'Ship the invoice retry fix.',
    stakeholders: [],
    checkpoints: [],
    reviews: {},
    status: 'active',
    completedOn: null,
    createdAt: ISO,
    updatedAt: ISO,
    ...over,
  };
}

function makeState({ people = roster(), lines = [projectLine()], plans = [plan()], briefs = [], settings = {} } = {}) {
  const state = createEmptyState(ISO);
  state.people = people;
  state.reportingLines = lines;
  state.onboarding = plans;
  state.onboardingLineBriefs = briefs;
  state.settings = { ...state.settings, ...settings };
  return normalizeState(state).state;
}

function seed(state) {
  const data = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
  let seq = 0;
  const idFactory = (p) => `${p}-test-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }), data, storage };
}

/** Reload through the real storage contract: the only proof that display == stored. */
function reload(ctx) {
  let seq = 1000;
  const idFactory = (p) => `${p}-reload-${++seq}`;
  const store = createStore({ storage: ctx.storage, now: () => NOW, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }) };
}

const board = (state) => buildOnboardingMatrix(state, { now: NOW, settings: state.settings, limit: 1000 });
const caseFor = (state, personId = 'sam') => board(state).cases.find((c) => c.personId === personId) || null;
const lineOf = (kase, key = 'line-sam-priya') => (kase?.lines || []).find((l) => l.key === key) || null;
const delegations = (store) => (store.state.delegations || []).filter((d) => d && d.status === 'active');

/* ------------------------------------------------------- 1. inert single */

test('a single-chain workspace is inert: no case, no row, no ask, no delegation', () => {
  const state = makeState({ lines: [] });
  const b = board(state);
  assert.equal(b.caseN, 0);
  assert.equal(b.peopleN, 0);
  assert.equal(b.unbriefedLinesN, 0);
  assert.equal(onboardingMatrixAttentionCount(state, { now: NOW, settings: state.settings }), 0);
  // The case itself still builds, and says the honest word rather than a zero.
  const kase = buildOnboardingMatrixCase(state, state.onboarding[0], { now: NOW, settings: state.settings });
  assert.equal(kase.isMatrix, false);
  assert.equal(kase.verdict, 'single-line');
  assert.equal(kase.totals.windowLineN, 1);
  // The rule issues nothing either.
  const out = onboardingMatrixRule(JSON.parse(JSON.stringify(state)), {
    event: { type: 'onboarding.created', entity: 'onboarding', entityId: 'ob-1' },
    now: NOW,
    idFactory: (p) => `${p}-x`,
  });
  assert.deepEqual(out, []);
  assert.match(onboardingMatrixBriefText(state, { now: NOW, settings: state.settings }), /nothing to reconcile/);
});

test('a brief is refused outright in a single-chain workspace, with the reason printed', () => {
  const state = makeState({ lines: [] });
  const ctx = seed(state);
  const refused = ctx.api.onboardingMatrixBriefLine({
    planId: 'ob-1', lineKey: 'home:sam', scope: 'You own the billing service and nothing else.',
  });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /single reporting line/);
  assert.equal((ctx.store.state.onboardingLineBriefs || []).length, 0);
});

/* ------------------------------------------------- 2. never silence */

test('a line that wrote nothing reads unbriefed past the window, with the late days printed', () => {
  const state = makeState();
  const kase = caseFor(state);
  assert.ok(kase, 'the plan covers a person on a second line');
  assert.equal(kase.isMatrix, true);
  const line = lineOf(kase);
  assert.equal(line.state, 'unbriefed');
  assert.equal(line.stateLabel, 'Never briefed');
  assert.equal(line.overdue, true);
  // 7-day window from 2026-10-20 → due 2026-10-27 → 13 whole days late on 11-09.
  assert.equal(line.briefDueOn, '2026-10-27');
  assert.equal(line.overdueDays, 13);
  assert.equal(kase.verdict, 'unbriefed-line');
  assert.equal(kase.crossLineComplete, false);
  // The home line is PRESUMED, printed as a presumption, and never settled.
  const home = lineOf(kase, 'home:sam');
  assert.equal(home.state, 'presumed');
  assert.equal(home.settled, false);
  assert.equal(kase.totals.presumedN, 1);
  assert.ok(kase.refusals.some((r) => r.kind === 'home-line-presumed'));
  // A read mutates nothing.
  assert.equal(JSON.stringify(state), JSON.stringify(makeState()));
});

test('a brief still inside its window reads awaiting-brief, never late and never settled', () => {
  const state = makeState({ plans: [plan({ startDate: FRESH_START })] });
  const line = lineOf(caseFor(state));
  assert.equal(line.state, 'awaiting-brief');
  assert.equal(line.overdue, false);
  assert.equal(line.settled, false);
  assert.equal(caseFor(state).verdict, 'awaiting-brief');
});

/* --------------------------------------------------- 3. one side each */

test('only the manager who holds the line may write it; the home manager is refused', () => {
  const state = makeState();
  state.settings = { ...state.settings, activeSeatId: 'dana' }; // sam's home manager
  const ctx = seed(state);
  const refused = ctx.api.onboardingMatrixBriefLine({
    planId: 'ob-1', lineKey: 'line-sam-priya', scope: 'You own the delivery plan for the migration.',
  });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /Only the manager who holds this line/);
  assert.equal((ctx.store.state.onboardingLineBriefs || []).length, 0, 'a refused brief wrote nothing');
});

test('the line holder’s brief round-trips through the real store, and the person acknowledges it', () => {
  const state = makeState();
  state.settings = { ...state.settings, activeSeatId: 'priya' };
  const ctx = seed(state);
  const written = ctx.api.onboardingMatrixBriefLine({
    planId: 'ob-1',
    lineKey: 'line-sam-priya',
    scope: 'You own the migration cut-over plan; good at day 90 is a rehearsed rollback.',
    firstWork: 'Write the cut-over runbook.',
    stakeholders: ['Yusuf Ops', 'yusuf ops', 'Lena Data'],
  });
  assert.equal(written.ok, true, written.error);
  assert.equal((ctx.store.state.onboardingLineBriefs || []).length, 1);
  const stored = ctx.store.state.onboardingLineBriefs[0];
  // Duplicate names collapse; the words are stored exactly as written.
  assert.deepEqual(stored.stakeholders, ['Yusuf Ops', 'Lena Data']);
  assert.equal(stored.declaredSource, 'manager');
  assert.equal(stored.acknowledgedOn, null);

  let kase = caseFor(ctx.store.state);
  assert.equal(lineOf(kase).state, 'briefed');
  assert.equal(kase.verdict, 'unacknowledged');
  assert.equal(kase.crossLineComplete, false, 'a brief nobody acknowledged is not coverage');

  // The manager cannot acknowledge for the person.
  const wrongSeat = ctx.api.onboardingMatrixAcknowledge({ planId: 'ob-1', lineKey: 'line-sam-priya' });
  assert.equal(wrongSeat.ok, false);
  assert.match(wrongSeat.error, /Only the person themselves/);

  // The person can.
  ctx.store.state.settings.activeSeatId = 'sam';
  const acked = ctx.api.onboardingMatrixAcknowledge({
    planId: 'ob-1', lineKey: 'line-sam-priya', acknowledgement: 'I need two days a week protected for this.',
  });
  assert.equal(acked.ok, true, acked.error);
  const stored2 = ctx.store.state.onboardingLineBriefs[0];
  assert.equal(stored2.acknowledgedOn, TODAY);
  assert.equal(stored2.acknowledgementSource, 'person');
  assert.equal(stored2.scope, stored.scope, 'the acknowledgement never edits the brief’s words');

  kase = caseFor(ctx.store.state);
  assert.equal(lineOf(kase).state, 'acknowledged');
  assert.equal(kase.verdict, 'complete');
  assert.equal(kase.crossLineComplete, true);
  // Two claims, two figures: the plan itself is still active and un-completed.
  assert.equal(kase.planComplete, false);
});

test('a standing brief cannot be silently edited, and a re-brief re-asks the person', () => {
  const state = makeState();
  state.settings = { ...state.settings, activeSeatId: 'priya' };
  const ctx = seed(state);
  ctx.api.onboardingMatrixBriefLine({ planId: 'ob-1', lineKey: 'line-sam-priya', scope: 'You own the cut-over plan.' });

  // While the brief stands unacknowledged, an identical row adds no commitment and
  // would reset the acknowledgement for nothing.
  const duplicate = ctx.api.onboardingMatrixBriefLine({ planId: 'ob-1', lineKey: 'line-sam-priya', scope: 'You own the cut-over plan.' });
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.error, /already says exactly this/);

  ctx.store.state.settings.activeSeatId = 'sam';
  assert.equal(ctx.api.onboardingMatrixAcknowledge({ planId: 'ob-1', lineKey: 'line-sam-priya' }).ok, true);

  ctx.store.state.settings.activeSeatId = 'priya';
  // An acknowledged brief cannot be overwritten in place.
  const overwrite = ctx.api.onboardingMatrixBriefLine({
    planId: 'ob-1', lineKey: 'line-sam-priya', scope: 'You now own both the cut-over and the rollback drill.',
  });
  assert.equal(overwrite.ok, false);
  assert.match(overwrite.error, /acknowledged by the person/);

  // A re-brief is a NEW row after the acknowledgement is what it is; the earlier
  // text stays readable and the person must be asked again.
  let caseBefore = caseFor(ctx.store.state);
  assert.equal(lineOf(caseBefore).state, 'acknowledged');
  ctx.store.state.onboardingLineBriefs[0].acknowledgedOn = null; // person withdrew? no: simulate a correction path
  ctx.store.state.onboardingLineBriefs[0].acknowledgedOn = TODAY;
  // Force the correction through a fresh row by seeding a second brief directly,
  // exactly as a later session's writer would.
  ctx.store.state.onboardingLineBriefs.push({
    ...ctx.store.state.onboardingLineBriefs[0],
    id: 'obf-2',
    declaredOn: TODAY,
    scope: 'You own the rollback drill as well.',
    acknowledgedOn: null,
    acknowledgedBySeatId: null,
    acknowledgement: '',
  });
  caseBefore = caseFor(ctx.store.state);
  const line = lineOf(caseBefore);
  assert.equal(line.state, 'briefed', 'a re-brief is not an acknowledged brief');
  assert.equal(line.supersededBriefN, 1);
  assert.equal(line.brief.scope, 'You own the rollback drill as well.', 'the newest statement is the effective one');
  assert.equal(caseBefore.crossLineComplete, false);
});

/* ------------------------------------------------------ 4. decline is an answer */

test('a decline needs a stated reason, settles the line, and is never counted as coverage', () => {
  const state = makeState();
  state.settings = { ...state.settings, activeSeatId: 'priya' };
  const ctx = seed(state);
  const bare = ctx.api.onboardingMatrixDeclineLine({ planId: 'ob-1', lineKey: 'line-sam-priya', reason: 'no' });
  assert.equal(bare.ok, false);
  assert.match(bare.error, /Say why/);
  const declined = ctx.api.onboardingMatrixDeclineLine({
    planId: 'ob-1', lineKey: 'line-sam-priya', reason: 'The project does not start until Q2, so this line owes her nothing yet.',
  });
  assert.equal(declined.ok, true, declined.error);
  const kase = caseFor(ctx.store.state);
  const line = lineOf(kase);
  assert.equal(line.state, 'declined');
  assert.equal(line.settled, true);
  assert.equal(kase.verdict, 'settled-with-declines');
  assert.equal(kase.crossLineSettled, true);
  assert.equal(kase.crossLineComplete, false, 'a line that declined onboarding is not onboarding coverage');
  assert.equal(kase.totals.declinedN, 1);
  assert.ok(kase.refusals.some((r) => r.kind === 'line-declined-onboarding'));
  assert.match(onboardingMatrixBriefText(ctx.store.state, { now: NOW, settings: ctx.store.state.settings }), /declined with a stated reason/);
});

/* ------------------------------------------------------ 5. one person, once */

test('two concurrent plans for one person are ONE case, and the person is counted once', () => {
  const state = makeState({
    plans: [
      plan({ id: 'ob-1', startDate: LATE_START }),
      plan({ id: 'ob-2', startDate: FRESH_START, label: '' }),
    ],
  });
  const b = board(state);
  assert.equal(b.caseN, 1, 'a person is never two cases');
  assert.equal(b.peopleN, 1);
  assert.equal(b.activePlanN, 2, 'how many plans exist is a different figure');
  const kase = b.cases[0];
  assert.deepEqual(kase.duplicatePlanIds, ['ob-2']);
  assert.equal(kase.verdict, 'duplicate-plans');
  assert.ok(kase.refusals.some((r) => r.kind === 'duplicate-plans'));
  assert.equal(b.duplicateCaseN, 1);

  // The rule issues NO work for an unresolved duplicate: a task addressed to
  // "which of these two plans" could never close.
  const draft = JSON.parse(JSON.stringify(state));
  const out = onboardingMatrixRule(draft, {
    event: { type: 'onboarding.created', entity: 'onboarding', entityId: 'ob-1' },
    now: NOW,
    idFactory: (p) => `${p}-x`,
  });
  assert.equal((draft.delegations || []).length, 0);
  assert.ok(out.some((e) => e.action === 'refused-duplicate-plans'));
});

test('a multi-line person with no plan at all is its own finding, not a zero', () => {
  const state = makeState({ plans: [] });
  const b = board(state);
  assert.equal(b.caseN, 1);
  assert.equal(b.unplannedN, 1);
  const kase = b.cases[0];
  assert.equal(kase.hasPlan, false);
  assert.equal(kase.verdict, 'unplanned-matrix');
  assert.equal(kase.totals.awaitingBriefN, kase.totals.windowLineN, 'no plan means no due date, so nothing is late');
  assert.ok(kase.refusals.some((r) => r.kind === 'no-plan'));
  assert.equal(onboardingMatrixAttentionCount(state, { now: NOW, settings: state.settings }), 1);
  // No brief can be written against an imaginary plan.
  const ctx = seed(state);
  assert.equal(ctx.api.onboardingMatrixBriefLine({ planId: 'nope', lineKey: 'x', scope: 'x' }).ok, false);
});

/* ------------------------------------------------------------ 6. the rule */

test('RULE-ONB-01 issues exactly one owned ask per unbriefed line, idempotently, to the line holder', () => {
  const state = makeState({ plans: [plan({ startDate: FRESH_START })] });
  const draft = JSON.parse(JSON.stringify(state));
  const out = onboardingMatrixRule(draft, {
    event: { type: 'onboarding.created', entity: 'onboarding', entityId: 'ob-1' },
    now: NOW,
    idFactory: (p) => `${p}-rule-${(draft.delegations || []).length}-${draft.onboardingLineBriefMarkers?.length || 0}`,
  });
  const tasks = (draft.delegations || []);
  const briefTasks = tasks.filter((t) => /onboarding brief/.test(t.title));
  assert.equal(briefTasks.length, 1, 'one line, one ask');
  assert.equal(briefTasks[0].personId, 'priya', 'addressed to the manager who holds the line');
  assert.equal(briefTasks[0].dueOn, '2026-11-16', 'the plan’s own brief deadline, while it is still ahead');
  assert.equal(briefTasks[0].status, 'active');
  assert.ok(out.some((e) => e.action === 'issued-obligations'));
  assert.ok((draft.onboardingLineBriefMarkers || []).some((m) => m.key === 'brief|ob-1|line-sam-priya'));

  // A second run against the SAME draft adds nothing: the marker is the guard.
  const before = (draft.delegations || []).length;
  onboardingMatrixRule(draft, {
    event: { type: 'onboarding.matrix.scan', entity: 'workspace', entityId: 'onboarding' },
    now: NOW,
    idFactory: (p) => `${p}-again`,
  });
  assert.equal((draft.delegations || []).length, before, 'a rescan cannot double the work');
});

test('an unacknowledged brief issues ONE dated ask to the PERSON, addressed to them and nobody else', () => {
  const state = makeState({
    plans: [plan({ startDate: FRESH_START })],
    briefs: [{
      id: 'obf-1', planId: 'ob-1', personId: 'sam', lineKey: 'line-sam-priya', lineRole: 'secondary',
      lineKind: 'project', managerId: 'priya', outcome: 'brief', declaredOn: TODAY,
      declaredBySeatId: null, declaredSource: 'manager',
      scope: 'You own the cut-over plan and the rollback drill.', firstWork: '', stakeholders: [],
      reason: '', acknowledgedOn: null, acknowledgedBySeatId: null, acknowledgementSource: 'person', acknowledgement: '',
    }],
  });
  const draft = JSON.parse(JSON.stringify(state));
  onboardingMatrixRule(draft, {
    event: { type: 'onboarding.created', entity: 'onboarding', entityId: 'ob-1' },
    now: NOW,
    idFactory: (p) => `${p}-rule-${(draft.delegations || []).length}`,
  });
  const ackTasks = (draft.delegations || []).filter((t) => /acknowledge/.test(t.title));
  assert.equal(ackTasks.length, 1);
  assert.equal(ackTasks[0].personId, 'sam', 'the acknowledgement is the person’s own act');
  assert.ok((draft.onboardingLineBriefMarkers || []).some((m) => m.key === 'ack|obf-1'));
});

test('the rule is registered 1:1 on the spine and is inert on an unrelated event', () => {
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length, 'every contract has one rule and vice versa');
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(onboardingMatrixRule));
  const contract = PROPAGATION_CONTRACTS.find((c) => c.rule === onboardingMatrixRule);
  assert.ok(contract);
  assert.equal(contract.module, 'onboardingMatrixRules.js');
  assert.ok(contract.writes.includes('onboardingLineBriefMarkers'));
  assert.match(contract.purpose, new RegExp(ONBOARDING_MATRIX_RULE_ID));

  const state = makeState();
  const out = onboardingMatrixRule(JSON.parse(JSON.stringify(state)), {
    event: { type: 'oneonone.logged', entity: 'oneOnOne', entityId: 'x' },
    now: NOW,
    idFactory: (p) => `${p}-x`,
  });
  assert.deepEqual(out, []);
});

/* -------------------------------------------------------- 7. schema + file */

test('schema v125 is additive: a v124 file gains an EMPTY ledger and clamped windows', () => {
  assert.equal(SCHEMA_VERSION, 126);
  const v124 = {
    ...createEmptyState(ISO),
    schemaVersion: 124,
    people: roster(),
    reportingLines: [projectLine()],
    onboarding: [plan()],
  };
  delete v124.onboardingLineBriefs;
  delete v124.onboardingLineBriefMarkers;
  const { raw: migrated } = migrate(JSON.parse(JSON.stringify(v124)));
  assert.equal(migrated.schemaVersion, 126);
  assert.deepEqual(migrated.onboardingLineBriefs, [], 'a brief invented at upgrade time would be words nobody said');
  assert.deepEqual(migrated.onboardingLineBriefMarkers, []);
  assert.equal(migrated.settings.onboardingBriefDays, 7);
  assert.equal(migrated.settings.onboardingAcknowledgeDays, 14);
  // And the upgraded workspace reads the truthful state: nobody has written yet.
  const normalized = normalizeState(migrated).state;
  const kase = caseFor(normalized);
  assert.equal(kase.verdict, 'unbriefed-line');
});

test('a hand-edited file cannot invent a brief, an acknowledgement or a decline reason', () => {
  const state = makeState({
    briefs: [
      // No scope at all: dropped, because a line that said nothing is not a line
      // that agreed to anything.
      { id: 'bad-1', planId: 'ob-1', personId: 'sam', lineKey: 'line-sam-priya', managerId: 'priya', outcome: 'brief', declaredOn: TODAY, scope: '' },
      // A decline with no reason: dropped, because an unexplained refusal is not a
      // record of judgement.
      { id: 'bad-2', planId: 'ob-1', personId: 'sam', lineKey: 'line-sam-priya', managerId: 'priya', outcome: 'declined', declaredOn: TODAY, reason: '' },
      // An acknowledgement on a DECLINE: cleared, because there is nothing to
      // acknowledge.
      { id: 'ok-3', planId: 'ob-1', personId: 'sam', lineKey: 'line-sam-priya', managerId: 'priya', outcome: 'declined', declaredOn: TODAY, reason: 'The project has not started yet.', acknowledgedOn: TODAY },
    ],
  });
  const rows = state.onboardingLineBriefs;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].outcome, 'declined');
  assert.equal(rows[0].acknowledgedOn, null);
});

/* ------------------------------------------------ 8. display == stored */

test('display == stored: every printed figure is recomputed from the blob, before and after a reload', () => {
  const state = makeState();
  state.settings = { ...state.settings, activeSeatId: 'priya' };
  const ctx = seed(state);
  ctx.api.onboardingMatrixBriefLine({ planId: 'ob-1', lineKey: 'line-sam-priya', scope: 'You own the cut-over plan.' });
  ctx.store.state.settings.activeSeatId = 'sam';
  ctx.api.onboardingMatrixAcknowledge({ planId: 'ob-1', lineKey: 'line-sam-priya', acknowledgement: '' });

  const check = (store) => {
    const b = buildOnboardingMatrix(store.state, { now: NOW, settings: store.state.settings, limit: 1000 });
    const kase = b.cases[0];
    // The line count is the count of printed line rows — not a separate number.
    assert.equal(b.lineN, kase.lines.length);
    assert.equal(kase.totals.windowLineN, kase.windowLines.length);
    assert.equal(
      kase.totals.windowLineN,
      kase.totals.acknowledgedN + kase.totals.briefedN + kase.totals.acknowledgementOverdueN
        + kase.totals.declinedN + kase.totals.unbriefedN + kase.totals.awaitingBriefN + kase.totals.presumedN,
      'every line in the window is in exactly one printed state',
    );
    // The board totals are the sum of the case totals, exactly.
    assert.equal(b.acknowledgedLinesN, b.cases.reduce((a, c) => a + c.totals.acknowledgedN, 0));
    assert.equal(b.peopleN, new Set(b.cases.map((c) => c.personId)).size);
    // The stored rows are the ones the read model counted.
    assert.equal(kase.totals.briefRowN, (store.state.onboardingLineBriefs || []).filter((r) => r.personId === 'sam').length);
    return kase;
  };

  const before = check(ctx.store);
  assert.equal(before.verdict, 'complete');
  const snapshot = JSON.stringify(ctx.store.state);
  // Reads mutate nothing.
  buildOnboardingMatrix(ctx.store.state, { now: NOW, settings: ctx.store.state.settings, limit: 1000 });
  onboardingMatrixCsvRows(ctx.store.state, { now: NOW, settings: ctx.store.state.settings });
  assert.equal(JSON.stringify(ctx.store.state), snapshot);

  const fresh = reload(ctx);
  const after = check(fresh.store);
  assert.equal(after.verdict, before.verdict);
  assert.deepEqual(after.totals, before.totals);
  assert.equal(after.lines[1].brief.scope, 'You own the cut-over plan.');
  assert.equal(after.lines[1].brief.acknowledgedOn, TODAY);
});

/* ------------------------------------------------------------- 9. the CSV */

test('CSV #112 is aggregate-only and its counts equal the computed report', () => {
  const state = makeState();
  state.settings = { ...state.settings, activeSeatId: 'priya' };
  const ctx = seed(state);
  ctx.api.onboardingMatrixBriefLine({
    planId: 'ob-1', lineKey: 'line-sam-priya', scope: 'You own the cut-over plan for the migration.',
    firstWork: 'Write the runbook.', stakeholders: ['Yusuf Ops'],
  });
  const rows = onboardingMatrixCsvRows(ctx.store.state, { now: NOW, settings: ctx.store.state.settings });
  const b = board(ctx.store.state);
  assert.equal(rows.length, b.lineN, 'one row per line, and nothing else');
  const unbriefed = rows.filter((r) => r.line_state === 'unbriefed');
  assert.equal(unbriefed.length, b.unbriefedLinesN);
  // No identity, no words: the export carries the FACT of a brief, never its text.
  const flat = JSON.stringify(rows);
  assert.equal(flat.includes('Sam Engineer'), false);
  assert.equal(flat.includes('Priya PM'), false);
  assert.equal(flat.includes('Yusuf Ops'), false);
  assert.equal(flat.includes('cut-over plan for the migration'), false);
  assert.equal(flat.includes('line-sam-priya'), false);
  // A line with no brief exports BLANK dates, never a zero date.
  const pending = rows.find((r) => r.line_state === 'presumed');
  assert.ok(pending, 'the home line has no brief and is printed as the plan’s presumption');
  assert.equal(pending.brief_declared_on, '');
  assert.equal(pending.acknowledged_on, '');

  // And the registered export produces the same rows through the real adapter.
  assert.ok(CSV_EXPORTS.some((e) => e.key === 'onboarding-matrix'));
  const exported = exportWorkspaceCsv(ctx.store.state, 'onboarding-matrix', { now: NOW });
  assert.equal(exported.ok, true, exported.error);
  const parsed = parseCsv(exported.csv);
  assert.equal(parsed.rows.length, rows.length, 'one row per line, and nothing else');
  assert.deepEqual(parsed.headers, [...ONBOARDING_MATRIX_CSV_COLUMNS], 'the exported header is the declared column list');
});

/* ------------------------------------------------------- 10. the panel */

test('the panel prints the stored state, the stored window and the two separate claims', async () => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  const { renderOnboardingMatrixPanel } = await import('../../app/views/onboardingMatrixPanel.js');

  const state = makeState();
  state.settings = { ...state.settings, activeSeatId: 'priya' };
  const ctx = seed(state);
  ctx.api.onboardingMatrixBriefLine({ planId: 'ob-1', lineKey: 'line-sam-priya', scope: 'You own the cut-over plan.' });

  const renderPanel = (panel, extra = '') => {
    const node = renderOnboardingMatrixPanel({
      api: ctx.api,
      query: new URLSearchParams(`panel=${panel}${extra}`),
      refresh: () => {},
      navigate: () => {},
      state: ctx.store.state,
    });
    const host = dom.window.document.getElementById('root');
    host.innerHTML = '';
    host.appendChild(node);
    return host.textContent || '';
  };

  const caseText = renderPanel('case', '&plan=ob-1');
  assert.match(caseText, /Sam Engineer/);
  assert.match(caseText, /Priya PM/);
  assert.match(caseText, /You own the cut-over plan/);
  assert.match(caseText, /Briefed by the line/);
  assert.match(caseText, /Cross-line complete/);
  assert.match(caseText, /The plan itself is completed/);
  assert.match(caseText, /2026-10-20/, 'the stored window start is printed');

  const boardText = renderPanel('board');
  assert.match(boardText, /Lines never briefed|Awaiting the person|Person/);

  const methodText = renderPanel('method');
  assert.match(methodText, /refuses to compute/);

  // An unreadable seat is printed as unreadable, never as an empty workspace.
  const refusedNode = renderOnboardingMatrixPanel({
    api: { onboardingMatrixBoard: () => ({ ok: false, error: 'Outside your seat.' }) },
    query: new URLSearchParams('panel=board'),
    refresh: () => {},
    navigate: () => {},
    state: ctx.store.state,
  });
  const host = dom.window.document.getElementById('root');
  host.innerHTML = '';
  host.appendChild(refusedNode);
  assert.match(host.textContent || '', /Not readable at this seat/);
});

/* ----------------------------------------------- 11. end to end via the API */

test('end to end: plan → obligation → brief → acknowledgement, through the live store and one reload', () => {
  const state = makeState({ plans: [] });
  // Creating a 30-60-90 plan is a rank 1–2 act; the local operator view is the
  // seat that may do it without pretending to be a frontline manager.
  state.settings = { ...state.settings, activeSeatId: null };
  const ctx = seed(state);

  const created = ctx.api.createOnboardingPlan({ personId: 'sam', kind: 'new-hire', startDate: LATE_START });
  assert.equal(created.ok, true, created.error);
  const planId = ctx.store.state.onboarding[0].id;

  // RULE-ONB-01 issued the obligation in the same commit, addressed to Priya.
  const task = delegations(ctx.store).find((d) => /onboarding brief/.test(d.title));
  assert.ok(task, 'the rule put a dated ask in front of the line holder');
  assert.equal(task.personId, 'priya');
  assert.match(task.expectedOutcome, /has recorded, in writing/);

  ctx.store.state.settings.activeSeatId = 'priya';
  const brief = ctx.api.onboardingMatrixBriefLine({ planId, lineKey: 'line-sam-priya', scope: 'You own the cut-over plan.' });
  assert.equal(brief.ok, true, brief.error);
  ctx.store.state.settings.activeSeatId = 'sam';
  const ack = ctx.api.onboardingMatrixAcknowledge({ planId, lineKey: 'line-sam-priya' });
  assert.equal(ack.ok, true, ack.error);

  const fresh = reload(ctx);
  const kase = board(fresh.store.state).cases.find((c) => c.personId === 'sam');
  assert.equal(kase.verdict, 'complete');
  assert.equal(kase.lines.find((l) => l.key === 'line-sam-priya').state, 'acknowledged');
  assert.equal(kase.lines.find((l) => l.key === 'home:sam').state, 'presumed');
  assert.equal(kase.totals.briefRowN, 1);
});
