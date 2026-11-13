/**
 * tests/app/bench-evidence.test.mjs — the Cross-Line Bench-Evidence Sufficiency
 * reading (ADR-0168, Schema v135, `#/succession?panel=evidence`, CSV scope #123).
 *
 * Organised around what a bench-evidence join can be betrayed by:
 *
 *  1. THE REVIEW, NOT A NEIGHBOUR. A claim is joined to the review the DECLARED
 *     rule chooses (latest completed review ending on or before the window's last
 *     day), never to a later review, a draft, or a period that had not closed.
 *  2. NEVER ASKED IS THE FINDING, AND SILENCE IS A DIFFERENT FACT. `line-unasked`,
 *     `line-silent`, `line-awaiting` and `home-line-only` are four words that are
 *     never collapsed, and a reasoned decline is not missing evidence.
 *  3. A REFUSED FIGURE IS BLANK. Below the floor, over an unreadable population or
 *     with no cross-line claim, the rate is withheld with its reason — never zero.
 *  4. TWO CLAIMS STAY APART. `reconciles` (the counts add up) and
 *     `figuresComplete` (the population was readable) are separate facts.
 *  5. DISPLAY == STORED. Every printed figure equals the recomputed blob after a
 *     real reload, no read mutates state or bumps a revision, and the JSDOM render
 *     prints the same numbers the blob holds.
 *  6. THE RULE WRITES WORK, NOT CORRECTIONS. An open claim issues exactly one
 *     dated, owned ask to the as-of home-line holder, idempotently; contested and
 *     unowned assessors and unknown home lines issue NOTHING and are counted; no
 *     rating, review or line is edited.
 *  7. NO IDENTITY IN THE EXPORT, and the register has its own scope.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { exportWorkspaceCsv, parseCsv, CSV_EXPORTS } from '../../app/core/csv.js';
import {
  buildBenchEvidenceRead,
  benchEvidenceBriefText,
  benchEvidenceCsvCells,
} from '../../app/core/domain/benchEvidence.js';
import {
  BENCH_EVIDENCE_CSV_COLUMNS,
  BENCH_EVIDENCE_CONVENTIONS,
  BENCH_EVIDENCE_STATES,
  normalizeBenchEvidenceMarkers,
} from '../../app/core/domain/benchEvidenceRegistry.js';
import { BENCH_EVIDENCE_RULE_ID } from '../../app/core/domain/benchEvidenceRules.js';
import { renderBenchEvidenceTab } from '../../app/views/benchEvidencePanel.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';

const NOW = new Date('2026-12-20T10:00:00.000Z');
const ISO = NOW.toISOString();
const WINDOW_END = '2026-12-20';
const PERIOD_START = '2026-01-01';
const PERIOD_END = '2026-09-30';

/* --------------------------------------------------------------- fixtures */

function person(id, name, level, managerId = 'dana', over = {}) {
  return { id, name, role: 'Engineer', level, managerId, status: 'active', startDate: '2023-01-01', createdAt: ISO, ...over };
}

function roster() {
  return [
    person('dana', 'Dana Eng', 'vp', null),
    person('priya', 'Priya PM', 'manager', 'dana'),
    person('sam', 'Sam Engineer', 'manager', 'dana'),
    person('kim', 'Kim Engineer', 'manager', 'dana'),
    person('ana', 'Ana Engineer', 'manager', 'dana'),
    person('zoe', 'Zoe Engineer', 'manager', 'dana'),
    person('mo', 'Mo Engineer', 'manager', 'dana'),
  ];
}

function line(personId, over = {}) {
  return {
    id: `line-${personId}-priya`,
    personId,
    managerId: 'priya',
    kind: 'project',
    shareH: 40,
    rights: [],
    fromISO: '2026-01-01',
    toISO: null,
    declaredAt: '2026-01-01T09:00:00.000Z',
    declaredBySeatId: null,
    note: 'Migration programme delivery.',
    ...over,
  };
}

const projectLines = (ids = ['sam']) => ids.map((id) => line(id));

function readiness(personId, over = {}) {
  return {
    id: `rd-${personId}`,
    personId,
    seat: 'VP Engineering',
    rating: 'ready-now',
    notes: '',
    updatedAt: '2026-12-01T09:00:00.000Z',
    ...over,
  };
}

/**
 * A completed review for `personId`. `stewardship` carries ADR-0147's stored asks
 * and answers — the record the join reads and does not re-derive.
 */
function review(personId, { stewardship = null, over = {} } = {}) {
  return {
    id: `review-${personId}`,
    personId,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    status: 'complete',
    selfReflection: { achievements: '', challenges: '', growth: '', support: '' },
    manager: { achievements: 'Delivered the migration.', development: '', nextSteps: '', rating: 'meets-expectations' },
    evidence: [],
    stewardship,
    instrumentNotes: [],
    createdAt: ISO,
    completedAt: '2026-10-05T09:00:00.000Z',
    updatedAt: '2026-10-05T09:00:00.000Z',
    ...over,
  };
}

const ask = (personId, askedOn, dueOn) => ({
  id: `ask-${personId}-${askedOn}`,
  lineKey: `line-${personId}-priya`,
  lineRole: 'secondary',
  lineKind: 'project',
  managerId: 'priya',
  askedOn,
  dueOn,
  note: 'Please record what the programme observed.',
});

const answer = (personId, outcome, answeredOn, extra = {}) => ({
  id: `ans-${personId}-${outcome}`,
  lineKey: `line-${personId}-priya`,
  lineManagerId: 'priya',
  outcome,
  answeredOn,
  text: outcome === 'input' ? 'Carried the migration cutover through two incidents and led the rollback rehearsals.' : '',
  reason: outcome === 'declined' ? 'The programme had no observation of this person this cycle.' : '',
  ...extra,
});

function makeState({ people = roster(), lines = projectLines(), readinessRows = [], reviews = [] } = {}) {
  const state = createEmptyState(ISO);
  state.people = people;
  state.reportingLines = lines;
  state.structureHistory = [];
  state.readiness = readinessRows;
  state.reviews = reviews;
  return normalizeState(state).state;
}

const readFor = (state, over = {}) => buildBenchEvidenceRead(state, { now: NOW, settings: state.settings, ...over });

function seedStore(state) {
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
  return { store, api: createApi(store, { now: () => NOW, idFactory }), storage };
}

/* -------------------------- 1. the review the declared rule chooses ------- */

test('the claim is joined to the review the declared rule chooses, never to a later one or a draft', () => {
  const eligible = review('sam', {
    stewardship: { requests: [ask('sam', '2026-09-01', '2026-09-10')], answers: [answer('sam', 'input', '2026-09-06')] },
    over: { id: 'review-sam-q3' },
  });
  // Completed AFTER the evidence window closed: not eligible, and must not be read.
  const tooLate = review('sam', {
    stewardship: { requests: [], answers: [] },
    over: {
      id: 'review-sam-q4',
      periodStart: '2026-10-01',
      periodEnd: '2026-12-15',
      completedAt: '2026-12-18T09:00:00.000Z',
      updatedAt: '2026-12-18T09:00:00.000Z',
    },
  });
  // A draft that is otherwise the newest thing on the person.
  const draft = review('sam', { over: { id: 'review-sam-draft', status: 'draft' } });
  const state = makeState({ readinessRows: [readiness('sam')], reviews: [eligible, tooLate, draft] });
  const r = readFor(state);
  const row = r.rows[0];
  assert.equal(row.reviewId, 'review-sam-q3', 'the declared rule chose the eligible review');
  assert.equal(row.reviewRule, BENCH_EVIDENCE_CONVENTIONS.reviewWindow);
  assert.equal(row.evidenceState, 'corroborated');
  // The window is anchored on the reading's own day when that day is in the past:
  // the 90 days before the rating, not the 90 days before today.
  assert.equal(row.windowEnd, '2026-12-01');
  assert.equal(row.windowStart, '2026-09-03');
});

test('a claim with no eligible review reads no-review, withholds the rate and is never assumed complete', () => {
  // The only review closes after the window: the line evidence is UNKNOWN.
  const late = review('sam', {
    over: { periodStart: '2026-10-01', periodEnd: '2026-12-15', completedAt: '2026-12-18T09:00:00.000Z' },
  });
  const state = makeState({ readinessRows: [readiness('sam')], reviews: [late] });
  const r = readFor(state);
  assert.equal(r.rows[0].evidenceState, 'no-review');
  assert.equal(r.rows[0].reviewId, null, 'nothing invented');
  assert.equal(r.totals.unreadableN, 1);
  assert.equal(r.ratePrinted, false, 'a rate over an unreadable claim is refused');
  assert.equal(r.figuresComplete, false);
  assert.equal(r.reconciles, true, 'the counts still add up — a DIFFERENT fact');
  assert.equal(r.verdict, 'incomplete');
  assert.match(r.rateWithheldReason, /no readable review/);
});

/* ---------------- 2. never asked is the finding; silence is its own word -- */

test('a second line in force that was never asked is the printed finding', () => {
  const state = makeState({
    readinessRows: [readiness('sam')],
    reviews: [review('sam', { stewardship: null })],
  });
  const r = readFor(state);
  const row = r.rows[0];
  assert.equal(row.isMatrix, true);
  assert.equal(row.secondaryLineN, 1);
  assert.equal(row.evidenceState, 'line-unasked');
  assert.equal(row.unaskedLinesN, 1);
  assert.equal(r.totals.secondLineGapN, 1);
  assert.ok(r.findings.some((f) => f.kind === 'line-unasked' && f.personId === 'sam'));
  assert.match(benchEvidenceBriefText(state, { now: NOW }), /never asked/);
});

test('asked-and-silent, asked-and-still-open, and never-asked are three different words', () => {
  const silent = readFor(makeState({
    readinessRows: [readiness('sam')],
    // Due long before the window closed, no answer: a dated act of not answering.
    reviews: [review('sam', { stewardship: { requests: [ask('sam', '2026-09-01', '2026-09-10')], answers: [] } })],
  }));
  assert.equal(silent.rows[0].evidenceState, 'line-silent');
  assert.equal(silent.totals.stateCounts['line-awaiting'], 0);

  const awaiting = readFor(makeState({
    readinessRows: [readiness('sam')],
    // Due AFTER the window's last day: the question is open, not unanswered.
    reviews: [review('sam', { stewardship: { requests: [ask('sam', '2026-09-20', '2027-01-15')], answers: [] } })],
  }));
  assert.equal(awaiting.rows[0].evidenceState, 'line-awaiting');
  assert.equal(awaiting.totals.stateCounts['line-silent'], 0, 'an open window is never printed as a silence');

  const unasked = readFor(makeState({
    readinessRows: [readiness('sam')],
    reviews: [review('sam', { stewardship: { requests: [], answers: [] } })],
  }));
  assert.equal(unasked.rows[0].evidenceState, 'line-unasked');
});

test('a reasoned decline counts toward corroboration and is never missing evidence', () => {
  const state = makeState({
    readinessRows: [readiness('sam')],
    reviews: [review('sam', { stewardship: { requests: [ask('sam', '2026-09-01', '2026-09-10')], answers: [answer('sam', 'declined', '2026-09-08')] } })],
  });
  const row = readFor(state).rows[0];
  assert.equal(row.evidenceState, 'corroborated');
  assert.equal(row.declinedLinesN, 1);
  assert.equal(row.evidenceOpen, false);
});

test('a single-line claim reads single-line and makes no cross-line claim', () => {
  const state = makeState({
    readinessRows: [readiness('kim')],
    reviews: [review('kim', { stewardship: null })],
  });
  const r = readFor(state);
  assert.equal(r.rows[0].evidenceState, 'single-line');
  assert.equal(r.rows[0].isMatrix, false);
  assert.equal(r.totals.matrixClaimsN, 0);
  assert.equal(r.verdict, 'single-chain');
  assert.equal(r.ratePrinted, false);
});

/* ---------------------------------------- 3. a refused figure is blank ---- */

test('the cross-line rate prints at exactly the floor and is withheld below it', () => {
  const two = makeState({
    readinessRows: [readiness('sam'), readiness('zoe')],
    lines: projectLines(['sam', 'zoe']),
    reviews: [
      review('sam', { stewardship: { requests: [ask('sam', '2026-09-01', '2026-09-10')], answers: [answer('sam', 'input', '2026-09-05')] } }),
      review('zoe', { stewardship: { requests: [ask('zoe', '2026-09-01', '2026-09-10')], answers: [answer('zoe', 'input', '2026-09-05')] } }),
    ],
  });
  const below = readFor(two);
  assert.equal(below.totals.secondLineN, 2);
  assert.equal(below.ratePrinted, false, 'two claims are an anecdote, not a rate');
  assert.equal(below.rate, null);
  assert.equal(below.totals.secondLineCleanPct, undefined);
  assert.equal(benchEvidenceCsvCells(two, { now: NOW }).evidence_second_line_clean_pct, '');
  assert.equal(benchEvidenceCsvCells(two, { now: NOW }).evidence_second_line_pct_withheld, 'yes');

  const three = makeState({
    readinessRows: [readiness('sam'), readiness('zoe'), readiness('ana')],
    lines: projectLines(['sam', 'zoe', 'ana']),
    reviews: ['sam', 'zoe', 'ana'].map((id) => review(id, {
      stewardship: { requests: [ask(id, '2026-09-01', '2026-09-10')], answers: [answer(id, 'input', '2026-09-05')] },
    })),
  });
  const atFloor = readFor(three);
  assert.equal(atFloor.ratePrinted, true);
  assert.equal(atFloor.rate, 100);
  assert.equal(benchEvidenceCsvCells(three, { now: NOW }).evidence_second_line_clean_pct, '100');
});

/* ------------------------------- 4. two claims kept apart ----------------- */

test('reconciles and figuresComplete are separate facts over the same population', () => {
  const state = makeState({
    readinessRows: [readiness('sam'), readiness('ana'), readiness('zoe')],
    lines: projectLines(['sam', 'ana', 'zoe']),
    reviews: [
      review('sam', { stewardship: { requests: [ask('sam', '2026-09-01', '2026-09-10')], answers: [answer('sam', 'input', '2026-09-05')] } }),
      // ana has NO eligible review: unreadable, and that alone blocks completeness.
      review('ana', { over: { periodEnd: '2026-12-15', completedAt: '2026-12-18T09:00:00.000Z' } }),
      review('zoe', { stewardship: { requests: [ask('zoe', '2026-09-01', '2026-09-10')], answers: [answer('zoe', 'input', '2026-09-05')] } }),
    ],
  });
  const r = readFor(state);
  assert.equal(r.reconciles, true);
  assert.equal(r.figuresComplete, false);
  assert.match(r.figuresCompleteDetail, /incomplete/);
  assert.equal(r.totals.claimsN, 3);
  const sum = Object.values(r.totals.stateCounts).reduce((a, b) => a + b, 0);
  assert.equal(sum, r.rows.length, 'every claim is exactly one state');
});

/* ----------------------- 5. display == stored, across a real reload ------- */

test('every printed figure equals the recomputed blob after a real reload, and no read mutates state', () => {
  const state = makeState({
    readinessRows: [readiness('sam'), readiness('zoe'), readiness('ana'), readiness('kim')],
    lines: projectLines(['sam', 'zoe', 'ana']),
    reviews: [
      review('sam', { stewardship: null }),
      review('zoe', { stewardship: { requests: [ask('zoe', '2026-09-01', '2026-09-10')], answers: [] } }),
      review('ana', { stewardship: { requests: [ask('ana', '2026-09-01', '2026-09-10')], answers: [answer('ana', 'input', '2026-09-04')] } }),
      review('kim', { stewardship: null }),
    ],
  });
  const { store, api } = seedStore(state);
  const revisionsBefore = store.state.meta.revision;
  const bytesBefore = JSON.stringify(store.state);

  const first = api.benchEvidenceRead();
  assert.equal(first.ok, true);
  assert.equal(JSON.stringify(store.state), bytesBefore, 'a read writes nothing');

  // A real reload from the bytes actually on disk.
  const reloaded = createStore({ storage: {
    getItem: (k) => (k === STORAGE_KEY ? JSON.stringify(store.state) : null),
    setItem: () => {}, removeItem: () => {},
  }, now: () => NOW, idFactory: (p) => `${p}-r` });
  reloaded.load();
  const second = buildBenchEvidenceRead(reloaded.state, { now: NOW, settings: reloaded.state.settings });

  assert.deepEqual(second.totals.stateCounts, first.report.totals.stateCounts);
  assert.equal(second.rate, first.report.rate);
  assert.equal(second.verdict, first.report.verdict);
  assert.equal(second.reconciles, first.report.reconciles);
  assert.equal(second.figuresComplete, first.report.figuresComplete);
  // And every row cell the panel prints is the blob's cell, claim for claim.
  const byClaim = new Map(second.rows.map((r) => [r.claimId, r]));
  for (const row of first.report.printedRows) {
    const twin = byClaim.get(row.claimId);
    assert.ok(twin, `claim ${row.claimId} survives the reload`);
    for (const key of ['evidenceState', 'rating', 'reviewId', 'windowStart', 'windowEnd', 'secondaryLineN', 'unaskedLinesN']) {
      assert.deepEqual(twin[key], row[key], `${row.claimId}.${key} matches the stored/recomputed value`);
    }
  }
  assert.equal(store.state.meta.revision, revisionsBefore, 'reading bumps no revision');
});

/* --------------------- 6. the rule writes work, never corrections -------- */

test('an open claim issues exactly one owned, dated ask to the as-of home line, idempotently', () => {
  const state = makeState({
    readinessRows: [readiness('sam')],
    reviews: [review('sam', { stewardship: null })],
  });
  const { store, api } = seedStore(state);
  const delegationsBefore = store.state.delegations.length;

  const scan = api.scanBenchEvidence();
  assert.equal(scan.ok, true);
  const mine = store.state.delegations.filter((d) => d.id && d.title.includes('bench claim'));
  assert.equal(mine.length, 1, 'exactly one ask');
  assert.equal(mine[0].personId, 'dana', 'addressed to the home-line manager (as-of the window), never to a contested set');
  assert.match(mine[0].title, /bench claim/);
  assert.ok(mine[0].dueOn);
  assert.equal(store.state.delegations.length, delegationsBefore + 1);
  assert.ok(store.state.benchEvidenceMarkers.some((m) => m.evidenceState === 'line-unasked'));

  // A second scan must not duplicate it.
  api.scanBenchEvidence();
  assert.equal(store.state.delegations.filter((d) => d.id && d.title.includes('bench claim')).length, 1, 'idempotent');
  // The rating is untouched: the rule issues work, it never edits a claim.
  assert.equal(store.state.readiness[0].rating, 'ready-now');
});

test('contested and unowned assessors issue nothing and are counted', () => {
  // Both Dana's home line and Priya's line declare the `performance` right.
  const contested = makeState({
    readinessRows: [readiness('sam')],
    lines: [line('sam', { rights: ['performance'] })],
    reviews: [review('sam', { stewardship: null })],
  });
  const a = seedStore(contested);
  const before = a.store.state.delegations.length;
  a.api.scanBenchEvidence();
  assert.equal(a.store.state.delegations.length, before, 'an ask addressed to a contested set can never close');
  const report = a.api.benchEvidenceRead().report;
  assert.equal(report.rows[0].evidenceState, 'contested-assessor');
  assert.ok(a.store.lastPropagations.some((p) => String(p.summary || '').includes('contested')));
});

test('the rule is inert on a single-chain workspace and on every other event', () => {
  const state = makeState({
    readinessRows: [readiness('kim')],
    reviews: [review('kim', { stewardship: null })],
  });
  const { store } = seedStore(state);
  const before = store.state.delegations.length;
  store.update(() => {}, {
    type: 'readiness.set', entity: 'readiness', entityId: 'kim',
    summary: 'Readiness set: VP Engineering → ready-now',
  });
  assert.equal(store.state.delegations.length, before, 'a single-line claim owes nobody a second-line ask');
});

/* ------------------------------ 7. the export carries no identity -------- */

test('CSV scope #123 is aggregate-only, reconciles to the panel and names nobody', () => {
  assert.equal(CSV_EXPORTS.length, 139, 'ADR-0169 #124, ADR-0170 #125, ADR-0171 #126, ADR-0172/0173 #127, ADR-0174 #128, ADR-0175 #129, ADR-0164 #130, ADR-0183..0185 #137..139 (139 registered)');
  const state = makeState({
    readinessRows: [readiness('sam'), readiness('zoe'), readiness('ana')],
    lines: projectLines(['sam', 'zoe', 'ana']),
    reviews: [
      review('sam', { stewardship: null }),
      review('zoe', { stewardship: { requests: [ask('zoe', '2026-09-01', '2026-09-10')], answers: [answer('zoe', 'input', '2026-09-05')] } }),
      review('ana', { stewardship: { requests: [ask('ana', '2026-09-01', '2026-09-10')], answers: [answer('ana', 'declined', '2026-09-05')] } }),
    ],
  });
  const res = exportWorkspaceCsv(state, 'succession-bench-evidence', { now: NOW });
  assert.equal(res.ok, true);
  const parsed = parseCsv(res.csv);
  assert.deepEqual(parsed.headers, [...BENCH_EVIDENCE_CSV_COLUMNS]);
  assert.equal(parsed.rows.length, 1);
  const cell = (key) => parsed.rows[0][parsed.headers.indexOf(key)];

  const report = readFor(state);
  assert.equal(cell('evidence_claims_n'), String(report.totals.claimsN));
  assert.equal(cell('evidence_line_unasked_n'), String(report.totals.stateCounts['line-unasked'] || 0));
  assert.equal(cell('evidence_corroborated_n'), String(report.totals.stateCounts['corroborated'] || 0));
  assert.equal(cell('evidence_verdict'), report.verdict);
  assert.equal(cell('evidence_reconciles'), report.reconciles ? 'yes' : 'no');
  assert.equal(cell('evidence_complete'), report.figuresComplete ? 'yes' : 'no');

  const banned = ['sam', 'zoe', 'ana', 'dana', 'priya', 'Sam', 'Dana', 'Priya', 'VP Engineering',
    'ready-now', 'review-sam', 'review-zoe', 'review-ana', 'line-sam', 'Migration programme'];
  for (const token of banned) {
    assert.equal(res.csv.includes(token), false, `the export contains no "${token}"`);
  }
});

/* --------------------------------- 8. schema, rules, registers ----------- */

test('schema v137 adds the regression watch ledgers on top of v136 and changes no record', () => {
  const v134 = { schemaVersion: 134, people: [{ id: 'p', name: 'P' }], readiness: [readiness('sam')] };
  const migrated = migrate(v134).raw;
  assert.equal(SCHEMA_VERSION, 147);
  assert.equal(migrated.schemaVersion, 147);
  assert.deepEqual(migrated.benchEvidenceMarkers, []);
  assert.deepEqual(migrated.lineIntakes, []);
  assert.deepEqual(migrated.benchRegressionReadings, [], 'no window has been frozen in an upgraded workspace');
  assert.deepEqual(migrated.benchRegressionMarkers, []);
  assert.deepEqual(migrated.readiness, v134.readiness, 'no rating is touched');
  assert.deepEqual(migrated.people, v134.people);
  // A malformed marker is dropped, never repaired into a plausible one.
  assert.deepEqual(normalizeBenchEvidenceMarkers([{ key: '' }, { nope: 1 }, null, { key: 'ok', kind: 'obligation' }])
    .map((m) => m.key), ['ok']);
});

test('the rule is registered on the shared spine with its own contract', () => {
  const names = DEFAULT_POST_COMMIT_RULES.map((r) => r.name);
  assert.ok(names.includes('benchEvidenceRule'));
  const contract = PROPAGATION_CONTRACTS.find((c) => c.module === 'benchEvidenceRules.js');
  assert.ok(contract, 'RULE-BNE-01 declares a contract');
  assert.deepEqual(contract.writes, ['delegations', 'links', 'benchEvidenceMarkers']);
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, PROPAGATION_CONTRACTS.length, 'one rule, one contract');
  assert.equal(BENCH_EVIDENCE_STATES.length, 10);
  assert.equal(new Set(BENCH_EVIDENCE_STATES.map((s) => s.rank)).size, BENCH_EVIDENCE_STATES.length, 'ranks are unique');
});

/* ------------------------------- 9. the render prints the blob's numbers */

test('the tab renders the same figures the blob holds, and mutates nothing', async () => {
  let jsdom = null;
  try { jsdom = await import('jsdom'); } catch { jsdom = null; }
  const state = makeState({
    readinessRows: [readiness('sam'), readiness('zoe'), readiness('ana')],
    lines: projectLines(['sam', 'zoe', 'ana']),
    reviews: [
      review('sam', { stewardship: null }),
      review('zoe', { stewardship: { requests: [ask('zoe', '2026-09-01', '2026-09-10')], answers: [answer('zoe', 'input', '2026-09-05')] } }),
      review('ana', { stewardship: { requests: [ask('ana', '2026-09-01', '2026-09-10')], answers: [answer('ana', 'email', '2026-09-05')] } }),
    ],
  });
  const report = readFor(state);
  const bytesBefore = JSON.stringify(state);
  if (!jsdom) {
    // No DOM shim in this environment: the render pass is unverified here and the
    // suite says so rather than asserting on a node it cannot build.
    assert.ok(report.rows.length > 0, 'the blob the render would print is built');
    assert.equal(JSON.stringify(state), bytesBefore, 'building the report mutates nothing');
    test.skip?.();
    return;
  }
  const dom = new jsdom.JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  const node = renderBenchEvidenceTab({ state, now: NOW }, report, true);
  dom.window.document.getElementById('root').appendChild(node);
  const text = dom.window.document.getElementById('root').textContent;
  assert.ok(text.includes(String(report.totals.claimsN)), 'the claim count printed is the blob count');
  assert.ok(text.includes(`${report.totals.matrixClaimsN} cross-line`), 'the cross-line count printed is the blob count');
  if (report.ratePrinted) assert.ok(text.includes(`${report.rate.toFixed(1)}%`));
  else assert.ok(text.includes('WITHHELD'), 'a withheld rate is printed as withheld, never as 0.0%');
  assert.equal(JSON.stringify(state), bytesBefore, 'rendering mutates nothing');
  assert.equal(BENCH_EVIDENCE_RULE_ID, 'RULE-BNE-01');
});
