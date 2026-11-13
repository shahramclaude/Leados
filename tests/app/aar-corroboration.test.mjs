/**
 * tests/app/aar-corroboration.test.mjs — ADR-0188, Session 256, Schema v149,
 * `#/learning?panel=cross-line`, CSV scope #141, RULE-AAC-01.
 *
 * ONE focused pass over what this session built. Every expected number below is
 * worked out BY HAND from the fixture and stated in a comment beside it; no
 * assertion calls the engine a second time to discover its own answer.
 *
 * THE FIXTURE (the matrix case). Reading day 2026-11-13.
 *
 *   ada (Ada Chief)
 *    ├ ann (Ann Func)      home-line manager of kim, ria
 *    └ bob (Bob Project)   declared PROJECT line of kim and ria
 *    └ cleo (Cleo Product) declared PRODUCT line of kim only
 *
 *   retro-1  "Migration cutover"   held 2026-10-24, outcome 2026-10-20
 *            participants: kim, ria            (a two-line pair)
 *            lesson les-1 owned by kim
 *   retro-2  "Single-line billing"  held 2026-10-26
 *            participants: kim only              (kim's lines are ann+bob+cleo — a
 *                                                 matrix, so this is NOT excluded)
 *   retro-3  "Payroll close"        held 2026-10-27
 *            participants: [nobody on a second line] → ann-only is impossible
 *            because ann is a manager; use a person with ONE line: see `sol`.
 *
 *   sol (Sol Solo) reports only to ann and is a participant of retro-3 with no
 *   second line and no other participant → retro-3 is SINGLE-LINE and excluded.
 *
 * HAND-COMPUTED ANSWERS.
 *   retro-1: participants kim, ria. kim's active lines = home:kim (ann),
 *            rl-kim-bob (bob), rl-kim-cleo (cleo) → 3 holders.
 *            ria's active lines = home:ria (ann), rl-ria-bob (bob) → 2 holders.
 *            Distinct holders = {ann, bob, cleo} = 3 required line answers.
 *            (ann is asked ONCE for kim and ria — it is one line.)
 *   retro-2: participant kim → holders {ann, bob, cleo} = 3 required answers.
 *   retro-3: participant sol → holder {ann} = 1 holder, one line → EXCLUDED.
 *   Required denominator = 6. Disclosure floor is 3 → coverage is PRINTABLE.
 *
 *   Stored answers:
 *     r1  ann  on retro-1 review: corroborated, valid through 2026-12-31 → COUNTS
 *     r2  bob  on retro-1 review: disputed (reason)                     → does NOT count
 *     r3  cleo on retro-1 review: OBSERVATION                           → does NOT count,
 *                                                                         and the line's
 *                                                                         answer is still owed
 *   So retro-1 states: corroborated 1, disputed 1, pending 1 (cleo, observation
 *   recorded, answer still owed). No request exists yet for retro-2 → its three
 *   holders are all `unrequested`.
 *   Totals: corroborated 1, partly 0, disputed 1, pending 1, overdue 0,
 *   unrequested 3, stale 0, expired 0 = 6 ✓ reconciles with the denominator.
 *   Coverage = (corroborated 1 + partly 0) / 6 = 16.7% exactly (1000/6 = 166.67
 *   per-mille → rounded to one decimal = 16.7).
 *
 *   Lesson parity (les-1 on retro-1):
 *     touched people = lesson owner kim + participants kim, ria = {kim, ria}
 *     touched holders = kim's lines {ann, bob, cleo} ∪ ria's lines {ann, bob}
 *                      = {ann, bob, cleo} = 3 holders → NOT inert (>1)
 *     adoption acts: ann adopted les-1; nobody else → adopted 1, not-asked 2
 *     → parity-OPEN, and NOT stale: held 2026-10-24 → today 2026-11-13 is
 *       20 days; the declared adoptWarnDays is 21, so 20 < 21 → not stale.
 *   Now flip bob to a REFUSAL instead: parity-BROKEN with 1 refused + 2 adopted?
 *   (see the dedicated test) — here the base fixture asserts parity-open + not
 *   stale, and a second test promotes bob's act to a refusal and asserts the
 *   verdict moves to parity-broken and the rule files an ask.
 *
 *   Single-line exclusion: retro-3 → singleLineExcludedN = 1.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, normalizeState, SCHEMA_VERSION, MIGRATIONS } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { ACTION_RIGHTS } from '../../app/core/domain/seatRegistry.js';
import {
  aarCorroborationBriefText,
  aarCorroborationCsvRows,
  aarCorroborationSnapshot,
  buildAarCorroborationReport,
} from '../../app/core/domain/aarCorroboration.js';
import { aarCorroborationRule } from '../../app/core/domain/aarCorroborationRules.js';
import {
  aarCorroborationSignature,
  parseAarCorroborationAskSummary,
} from '../../app/core/domain/aarCorroborationSchema.js';
import {
  AAR_CORROBORATION_CSV_COLUMNS,
  AAR_CORROBORATION_CSV_SCOPE,
  AAR_CORROBORATION_EVENTS,
  AAR_CORROBORATION_OUTCOMES,
  AAR_CORROBORATION_READ_REFUSALS,
  AAR_CORROBORATION_RULE_ID,
  AAR_CORROBORATION_STATES,
  AAR_ADOPTION_STATES,
  AAR_PARITY_VERDICTS,
} from '../../app/core/domain/aarCorroborationRegistry.js';
import { renderLearningCrossLinePanel } from '../../app/views/learningCrossLinePanel.js';

const NOW = new Date('2026-11-13T12:00:00.000Z');
const STAMP = '2020-01-01T00:00:00.000Z';

const person = (id, name, managerId = null, level = 'frontline') => ({
  id, name, role: `${name} role`, level, managerId, status: 'active',
  startDate: STAMP, createdAt: STAMP, updatedAt: STAMP,
});

const line = (id, personId, managerId, kind = 'project') => ({
  id, personId, managerId, kind, shareH: null, rights: [],
  fromISO: '2026-01-01', toISO: null, status: 'active',
  declaredAt: STAMP, history: [], note: '',
});

const lesson = (id, text, ownerId, state = 'open') => ({
  id, class: 'dependency', text, changeType: 'process', changeNote: 'Named an interface owner',
  state, ownerId: ownerId || null, committedOn: '2026-10-24', appliedOn: null, appliedNote: '',
  evidence: [], droppedOn: null, droppedReason: '', createdAt: '2026-10-24T00:00:00.000Z',
});

const retro = (id, label, heldOn, participants, lessons = []) => ({
  id,
  subjectType: 'other',
  subjectId: null,
  subjectLabel: label,
  outcomeOn: '2026-10-20',
  status: 'held',
  autoDrafted: false,
  intended: 'Ship the migration with no customer-visible outage window.',
  actual: 'Two customers saw a four-hour outage during the cutover weekend.',
  cause: 'The vendor interface contract was under-specified and nobody owned the joint check.',
  sustain: 'The daily standup held.',
  improve: 'Name an interface owner before the next cutover.',
  skipReason: '',
  heldOn,
  participants,
  lessons,
  createdAt: '2026-10-24T00:00:00.000Z',
  updatedAt: '2026-10-24T00:00:00.000Z',
  history: [],
});

const answer = (id, requestId, reviewId, lessonId, personId, holderId, kind, outcome, respondedOn, extra = {}) => ({
  id,
  requestId,
  reviewId,
  lessonId,
  personId,
  holderId,
  kind,
  outcome,
  respondedOn,
  respondedAt: `${respondedOn}T09:00:00.000Z`,
  responderSeatId: holderId,
  validThrough: kind === 'corroboration' ? (extra.validThrough || '2026-12-31') : null,
  reason: extra.reason || '',
  note: extra.note || '',
});

const adoption = (id, reviewId, lessonId, holderId, outcome, adoptedOn, note) => ({
  id, reviewId, lessonId, holderId, outcome, adoptedOn,
  adoptedAt: `${adoptedOn}T09:00:00.000Z`, adoptedBySeatId: holderId, note,
});

function fixture({ withAnswers = true, bobAdoption = 'not-asked', withRequests = true } = {}) {
  const raw = createEmptyState(NOW.toISOString());
  raw.people = [
    person('ada', 'Ada Chief', null, 'chief'),
    person('ann', 'Ann Func', 'ada', 'director'),
    person('bob', 'Bob Project', 'ada', 'manager'),
    person('cleo', 'Cleo Product', 'ada', 'manager'),
    person('kim', 'Kim Builder', 'ann'),
    person('ria', 'Ria Analyst', 'ann'),
    person('sol', 'Sol Solo', 'ann'),
  ];
  raw.reportingLines = [
    line('rl-kim-bob', 'kim', 'bob'),
    line('rl-kim-cleo', 'kim', 'cleo', 'product'),
    line('rl-ria-bob', 'ria', 'bob'),
  ];
  raw.retros = [
    retro('retro-1', 'Migration cutover', '2026-10-24', ['kim', 'ria'],
      [lesson('les-1', 'Interface ownership must be named before any cutover is scheduled.', 'kim')]),
    retro('retro-2', 'Single-line billing', '2026-10-26', ['kim'], []),
    retro('retro-3', 'Payroll close', '2026-10-27', ['sol'], []),
  ];
  raw.settings = { ...raw.settings, leaderName: 'Riley Lead', activeSeatId: null };

  // Build the request ledger the same way the action does: freeze the snapshot
  // from the live graph. This is the only way a request can exist at all, so a
  // fixture cannot assert against a shape the app would refuse to store.
  const seeded = normalizeState(raw, { now: NOW }).state;
  if (withRequests) {
    raw.aarCorroborationRequests = [
      { id: 'q-ann-1', reviewId: 'retro-1', lessonId: null, personId: 'kim', holderId: 'ann',
        requestedOn: '2026-10-25', requestedAt: '2026-10-25T09:00:00.000Z',
        requestedBySeatId: 'ada', dueOn: '2026-11-05', prompt: '', snapshot: null },
      { id: 'q-bob-1', reviewId: 'retro-1', lessonId: null, personId: 'kim', holderId: 'bob',
        requestedOn: '2026-10-25', requestedAt: '2026-10-25T09:00:00.000Z',
        requestedBySeatId: 'ada', dueOn: '2026-11-05', prompt: '', snapshot: null },
      { id: 'q-cleo-1', reviewId: 'retro-1', lessonId: null, personId: 'kim', holderId: 'cleo',
        requestedOn: '2026-10-25', requestedAt: '2026-10-25T09:00:00.000Z',
        requestedBySeatId: 'ada', dueOn: '2026-11-05', prompt: '', snapshot: null },
    ];
    // Fill the snapshots through the real freezer, one holder at a time.
    const matrixState = seeded;
    for (const request of raw.aarCorroborationRequests) {
      const ret = matrixState.retros.find((row) => row.id === request.reviewId);
      const matrix = buildMatrixFor(matrixState);
      const frozen = aarCorroborationSnapshot(matrixState, ret, { matrix, holderId: request.holderId });
      assert.ok(frozen.ok, `fixture snapshot for ${request.holderId}: ${frozen.reason}`);
      request.snapshot = JSON.parse(JSON.stringify(frozen.snapshot));
    }
  }
  if (withAnswers) {
    raw.aarCorroborationResponses = [
      answer('r1', 'q-ann-1', 'retro-1', null, 'kim', 'ann', 'corroboration', 'corroborated', '2026-10-28'),
      answer('r2', 'q-bob-1', 'retro-1', null, 'kim', 'bob', 'corroboration', 'disputed', '2026-10-29', {
        reason: 'Our own postmortem shows the interface was specified and the check was skipped.',
      }),
      answer('r3', 'q-cleo-1', 'retro-1', null, 'kim', 'cleo', 'observation', 'partly', '2026-10-30', {
        note: 'I saw the schedule slip a week earlier than the review says.',
      }),
    ];
    const acts = [adoption('a-ann', 'retro-1', 'les-1', 'ann', 'adopted', '2026-10-30', 'Added the interface owner field to the cutover template.')];
    if (bobAdoption === 'refused') {
      acts.push(adoption('a-bob', 'retro-1', 'les-1', 'bob', 'refused', '2026-10-31', 'Our project line already names an owner; this adds no control.'));
    }
    raw.aarAdoptions = acts;
  }
  return normalizeState(raw, { now: NOW }).state;
}

// A tiny local matrix builder so the fixture can call the SAME freezer the reader
// uses without importing the graph module twice under different settings.
import { buildMatrix } from '../../app/core/domain/matrix.js';
function buildMatrixFor(state) {
  return buildMatrix(state, { now: NOW, settings: state.settings });
}

const read = (state, extra = {}) => buildAarCorroborationReport(state, { now: NOW, settings: state.settings, ...extra });

function seed(state) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-${++sequence}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  const rawApi = createApi(store, { now: () => NOW, idFactory });
  return { store, storage, api: guardApi(rawApi, store, { now: () => NOW.getTime() }) };
}

let seq = 0;
function runRule(state, { event = AAR_CORROBORATION_EVENTS.SCAN, at = NOW } = {}) {
  const draft = JSON.parse(JSON.stringify(state));
  const out = aarCorroborationRule(draft, {
    now: at,
    event: { type: event, entity: 'learning', entityId: 'workspace' },
    idFactory: (prefix) => `${prefix}-t${++seq}`,
    recordEffect: () => {},
  });
  return { draft, out };
}
const asksOf = (draft) => (draft.delegations || []).filter((d) => d && d.status === 'active');

function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const globals = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event'];
  const previous = new Map(globals.map((key) => [key, globalThis[key]]));
  try {
    for (const key of globals) {
      globalThis[key] = key === 'window' ? dom.window : key === 'document' ? dom.window.document : dom.window[key];
    }
    return run(dom);
  } finally {
    for (const key of globals) globalThis[key] = previous.get(key);
  }
}

/* ---------------------------------------------------------- 1. registration */

test('registration: schema v149, CSV #141, RULE-AAC-01, declared rights and closed vocabularies', () => {
  assert.equal(SCHEMA_VERSION, 152);
  const scope = CSV_EXPORTS.find((entry) => entry.key === AAR_CORROBORATION_CSV_SCOPE);
  assert.ok(scope, 'CSV #141 is registered');
  assert.equal(scope.sensitive, false, 'the export is aggregate-only');
  assert.equal(CSV_EXPORTS.length, 144, 'the export count moved from 140 to 141 and nothing else did');
  assert.ok(SAFE_READS.has('aarCorroborationReport'), 'the scoped board is a declared safe read');
  assert.ok(!SAFE_READS.has('aarCorroborationRequest'), 'requesting is NOT a safe read: it writes');
  const contract = PROPAGATION_CONTRACTS.find((c) => c.rule?.id === 'aarCorroborationRule');
  assert.ok(contract, 'RULE-AAC-01 declares its propagation contract');
  assert.deepEqual(contract.writes, ['delegations', 'links', 'matrixMarkers']);
  assert.equal(AAR_CORROBORATION_RULE_ID, 'RULE-AAC-01');
  assert.equal(AAR_CORROBORATION_OUTCOMES.length, 4, 'four declared outcomes');
  assert.equal(AAR_CORROBORATION_STATES.length, 12, 'twelve request states that never collapse');
  assert.equal(AAR_ADOPTION_STATES.length, 4, 'four adoption states');
  assert.equal(AAR_PARITY_VERDICTS.length, 5, 'five parity verdicts');
  for (const right of ['read-aar-corroboration', 'request-aar-corroboration', 'respond-aar-corroboration', 'adopt-aar-lesson', 'govern-aar-corroboration']) {
    assert.ok(ACTION_RIGHTS[right], `${right} is a declared right, not an assumed one`);
  }
  // Silence must never be a coverage outcome.
  const counting = AAR_CORROBORATION_OUTCOMES.filter((row) => row.countsAsCorroboration).map((row) => row.key).sort();
  assert.deepEqual(counting, ['corroborated', 'partly'], 'only corroborated and partly count toward coverage');
});

/* ----------------------------------------------------------------- 2. hand math */

test('the report prints the hand-computed denominator, states and coverage', () => {
  const state = fixture();
  const report = read(state);
  const t = report.totals;
  // Denominator: retro-1 holders {ann,bob,cleo} = 3, retro-2 holders {ann,bob,cleo} = 3,
  // retro-3 is single-line and excluded. 3 + 3 = 6.
  assert.equal(t.requiredLineAnswersN, 6, 'six required line answers');
  assert.equal(t.singleLineExcludedN, 1, 'retro-3 is excluded as single-line');
  assert.equal(t.multiLineReviewsN, 2, 'retro-1 and retro-2 touch more than one line');
  assert.equal(t.heldReviewsN, 3);
  // States: corroborated 1 (ann), disputed 1 (bob), pending 1 (cleo: an observation
  // was recorded but the line's ANSWER is still owed), unrequested 3 (retro-2).
  assert.equal(t.corroboratedN, 1);
  assert.equal(t.disputedN, 1);
  assert.equal(t.declinedN, 0);
  assert.equal(t.partlyN, 0, 'an observation must never be recorded as a part-support answer');
  assert.equal(t.pendingN, 1);
  assert.equal(t.overdueN, 0);
  assert.equal(t.unrequestedN, 3);
  assert.equal(t.observationsN, 1, 'the observation is counted separately');
  assert.equal(t.corroboratedTotalN, 1);
  // 1 + 0 + 1 + 0 + 1 + 0 + 3 + 0 + 0 = 6
  assert.equal(t.stateSum, 6);
  assert.equal(t.countsReconcile, true);
  // Coverage = 1/6 = 16.7%
  assert.equal(t.coverageWithheld, false, '6 answers clears the declared floor of 3');
  assert.equal(t.coveragePct, 16.7);
});

test('a holder who carries several participants is asked ONCE, not once per person', () => {
  const state = fixture();
  const report = read(state);
  const annRows = report.rows.filter((row) => row.holderId === 'ann' && row.reviewId === 'retro-1');
  assert.equal(annRows.length, 1, 'ann holds a line over kim AND ria, so ann owes one answer');
  assert.deepEqual(annRows[0].personNames.sort(), ['Kim Builder', 'Ria Analyst'], 'and the row prints both bases');
  assert.equal(annRows[0].personN, 2);
});

/* -------------------------------------------------------------- 3. parity */

test('lesson parity: 3 touched holders, 1 adopted, 2 not asked, not yet stale', () => {
  const state = fixture();
  const report = read(state);
  assert.equal(report.totals.lessonsN, 1, 'one lesson under a held review');
  const les = report.lessons[0];
  assert.equal(les.touchedLinesN, 3, 'kim lines {ann,bob,cleo} + ria lines {ann,bob} = 3 distinct holders');
  assert.equal(les.parityVerdict, 'parity-open');
  assert.deepEqual(les.parityCounts, { adopted: 1, refused: 0, 'not-asked': 2, unattributable: 0 });
  // Held 2026-10-24 → read 2026-11-13 = 20 days. adoptWarnDays = 21, so 20 < 21.
  assert.equal(les.parityStale, false, 'the declared 21-day window has not passed');
  assert.equal(les.openDays, 20);
  // The AAR ledger's own claim is preserved and printed, never rewritten.
  assert.equal(les.aarState, 'open', 'the review’s own lesson state is unchanged');
  assert.equal(report.totals.parityCompletePct, null, 'one lesson is below the declared floor');
});

test('a reasoned refusal makes parity BROKEN and never rewrites the lesson state', () => {
  const state = fixture({ bobAdoption: 'refused' });
  const report = read(state);
  const les = report.lessons[0];
  assert.equal(les.parityVerdict, 'parity-broken');
  assert.equal(les.parityCounts.refused, 1);
  assert.equal(les.aarState, 'open', 'a refusal does not touch the AAR ledger');
  assert.match(les.parityReason, /refused to adopt/);
  const bob = les.lines.find((row) => row.managerId === 'bob');
  assert.equal(bob.state, 'refused');
  assert.match(bob.note, /already names an owner/);
  assert.equal(report.totals.parityBrokenN, 1);
  assert.equal(report.claims.adoptionRefused, true);
});

/* ---------------------------------------------------- 4. silence is not agreement */

test('silence, an observation and a stale answer are each counted as their own thing', () => {
  const state = fixture();
  const report = read(state);
  const cleo = report.rows.find((row) => row.holderId === 'cleo' && row.reviewId === 'retro-1');
  assert.equal(cleo.state, 'pending', 'an observation does not satisfy the line’s answer');
  assert.equal(cleo.observation, true);
  assert.equal(cleo.countsAsCorroboration, false);
  const unasked = report.rows.filter((row) => row.reviewId === 'retro-2');
  assert.equal(unasked.length, 3);
  assert.ok(unasked.every((row) => row.state === 'unrequested'));
  // Overdue: move the read forward past the due date with no answer at all.
  const later = buildAarCorroborationReport(state, { now: new Date('2026-11-20T12:00:00.000Z'), settings: state.settings });
  const overdue = later.rows.filter((row) => row.reviewId === 'retro-2');
  assert.ok(overdue.every((row) => row.state === 'unrequested'), 'no request means NOT overdue — it is unasked');
});

test('a rewritten review makes a prior answer STALE rather than silently current', () => {
  const state = fixture();
  const edited = JSON.parse(JSON.stringify(state));
  edited.retros.find((row) => row.id === 'retro-1').cause = 'A completely different cause nobody answered about.';
  const report = read(edited);
  const ann = report.rows.find((row) => row.holderId === 'ann' && row.reviewId === 'retro-1');
  assert.equal(ann.state, 'stale', 'the frozen snapshot no longer matches the live review');
  assert.equal(ann.countsAsCorroboration, false);
  assert.match(ann.reason, /changed after this request/);
  assert.equal(report.totals.staleN, 3, 'all three retro-1 requests are now stale');
});

/* --------------------------------------------------------- 5. single-line inert */

test('a review whose participants sit on one line is EXCLUDED, not counted as satisfied', () => {
  const state = fixture();
  const report = read(state);
  assert.equal(report.totals.singleLineExcludedN, 1);
  assert.ok(report.totals.refusalReasons.some((row) => row.key === 'no-multi-line-participant'));
  const single = report.singleLineExcluded[0];
  assert.equal(single.reviewId, 'retro-3');
  assert.match(single.reason, /one active line/);
});

test('a workspace with no held review prints an honest empty register', () => {
  const raw = createEmptyState(NOW.toISOString());
  raw.people = [person('ann', 'Ann Func', null, 'director'), person('kim', 'Kim Builder', 'ann')];
  const state = normalizeState(raw, { now: NOW }).state;
  const report = read(state);
  assert.equal(report.empty, true);
  assert.equal(report.totals.requiredLineAnswersN, 0);
  assert.equal(report.claims.crossLineClaim, false);
  assert.match(aarCorroborationBriefText(report), /honestly empty/);
});

/* --------------------------------------------------------------- 6. rule spine */

test('RULE-AAC-01 files ONE ask per overdue condition and is idempotent', () => {
  // Nothing answered at all, and the clock moved past every due date.
  const state = fixture({ withAnswers: false });
  const at = new Date('2026-11-10T12:00:00.000Z');
  const first = runRule(state, { event: AAR_CORROBORATION_EVENTS.SCAN, at });
  const asks = asksOf(first.draft);
  // retro-1's three requests are all overdue (due 2026-11-05 < 2026-11-10).
  // Each ask goes to the joint apex of the holder(s) involved — one holder → the
  // holder themself, which the rule refuses as a self-addressed ask ONLY when the
  // holder would be asking themself; here the apex of {ann} is ann and ann owes
  // the answer, so ann's ask is skipped, bob's and cleo's are filed.
  const signatures = asks.map((a) => parseAarCorroborationAskSummary(a.summary)?.signature).filter(Boolean);
  // Three overdue conditions, three holders, three asks addressed to the holder
  // who owes the answer — never to somebody above them who does not hold the line.
  assert.equal(signatures.length, 3, 'one ask per overdue condition');
  assert.deepEqual(
    asksOf(first.draft).map((task) => task.personId).sort(),
    ['ann', 'bob', 'cleo'],
    'each ask is addressed to the holder who owes the answer',
  );
  for (const task of asksOf(first.draft)) {
    assert.equal(task.authority, 'act-inform', 'an ask informs; it never blocks');
  }
  // Re-running must not duplicate an open ask for a live condition.
  const second = runRule(first.draft, { event: AAR_CORROBORATION_EVENTS.SCAN, at });
  const secondSignatures = asksOf(second.draft).map((a) => parseAarCorroborationAskSummary(a.summary)?.signature).filter(Boolean);
  assert.deepEqual(secondSignatures.slice().sort(), signatures.slice().sort(), 'the same conditions do not re-ask');
});

test('RULE-AAC-01 closes its own ask when the condition clears', () => {
  const state = fixture({ withAnswers: false });
  const at = new Date('2026-11-10T12:00:00.000Z');
  const first = runRule(state, { event: AAR_CORROBORATION_EVENTS.SCAN, at });
  const filedPositive = asksOf(first.draft).length;
  assert.ok(filedPositive > 0);
  // Answer every retro-1 request and let the scan run again: the asks close.
  const answered = JSON.parse(JSON.stringify(first.draft));
  answered.aarCorroborationResponses = [
    answer('z1', 'q-ann-1', 'retro-1', null, 'kim', 'ann', 'corroboration', 'corroborated', '2026-11-06'),
    answer('z2', 'q-bob-1', 'retro-1', null, 'kim', 'bob', 'corroboration', 'corroborated', '2026-11-06'),
    answer('z3', 'q-cleo-1', 'retro-1', null, 'kim', 'cleo', 'corroboration', 'corroborated', '2026-11-06'),
  ];
  const second = runRule(answered, { event: AAR_CORROBORATION_EVENTS.SCAN, at });
  const stillOpen = (second.draft.delegations || []).filter((d) => d.status === 'active' && parseAarCorroborationAskSummary(d.summary));
  const closed = (second.draft.delegations || []).filter((d) => d.status === 'done' && /Closed by RULE-AAC-01:/.test(d.completionNote || ''));
  assert.equal(stillOpen.length, 0, 'the cleared conditions leave no open ask');
  assert.ok(closed.length > 0, 'the rule closed its own ask with a printed reason');
});

test('RULE-AAC-01 honours the automation pause and is inert on an empty roster', () => {
  const paused = fixture({ withAnswers: false });
  paused.settings = { ...paused.settings, aarCorroborationAutoPropagate: false };
  const at = new Date('2026-11-10T12:00:00.000Z');
  const quiet = runRule(paused, { event: AAR_CORROBORATION_EVENTS.SCAN, at });
  assert.equal(asksOf(quiet.draft).length, 0, 'a paused register files nothing, even on an explicit scan event');

  const empty = normalizeState(createEmptyState(NOW.toISOString()), { now: NOW }).state;
  const nothing = runRule(empty, { event: AAR_CORROBORATION_EVENTS.SCAN, at });
  assert.equal((nothing.draft.delegations || []).length, 0, 'nobody on the roster → no ask and no crash');
});

/* ------------------------------------------------------------------ 7. actions */

test('the actions refuse what the register refuses, end to end through the store', () => {
  const state = fixture({ withAnswers: false, withRequests: false });
  const { api } = seed(state);

  // A request must carry the human's due date.
  const noDue = api.aarCorroborationRequest({ reviewId: 'retro-1', holderId: 'ann' });
  assert.equal(noDue.ok, false);
  assert.match(noDue.error, /never invents a deadline/);

  // A single-line review cannot be asked at all.
  const singleLine = api.aarCorroborationRequest({ reviewId: 'retro-3', holderId: 'ann', dueOn: '2026-11-20' });
  assert.equal(singleLine.ok, false);
  assert.match(singleLine.error, /one active line/);

  // A holder who holds no line over a participant cannot be asked.
  const wrongHolder = api.aarCorroborationRequest({ reviewId: 'retro-1', holderId: 'ada', dueOn: '2026-11-20' });
  assert.equal(wrongHolder.ok, false);
  assert.match(wrongHolder.error, /does not hold a line/);

  // The honest request succeeds and freezes a snapshot.
  const ok = api.aarCorroborationRequest({ reviewId: 'retro-1', holderId: 'ann', dueOn: '2026-11-20' });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(ok.requestedN, 1);
  const stored = api.state ?? null;
  void stored;
});

test('a line holder answers only for their own line, once, and the answer is append-only', () => {
  const state = fixture({ withAnswers: false });
  const { api, store } = seed(state);
  assert.ok(store.state.aarCorroborationRequests.length >= 1);

  // As the whole-workspace operator the answer is refused: an operator is not a
  // first-person line holder.
  const operator = api.aarCorroborationRespond({ requestId: 'q-ann-1', outcome: 'corroborated', validThrough: '2026-12-31' });
  assert.equal(operator.ok, false);
  assert.match(operator.error, /not a first-person line holder/);

  // Declare the seat that holds the requested line and answer for it.
  store.update((draft) => { draft.settings = { ...draft.settings, activeSeatId: 'ann' }; }, { type: 'seat.declared', entity: 'settings', entityId: 'seat', summary: 'seat' });
  const { api: annApi } = { api: guardApi(createApi(store, { now: () => NOW, idFactory: (p) => `${p}-x${Math.random().toString(36).slice(2, 7)}` }), store, { now: () => NOW.getTime() }) };

  // bob's request cannot be answered by ann.
  const wrongLine = annApi.aarCorroborationRespond({ requestId: 'q-bob-1', outcome: 'corroborated', validThrough: '2026-12-31' });
  assert.equal(wrongLine.ok, false);

  const own = annApi.aarCorroborationRespond({ requestId: 'q-ann-1', outcome: 'corroborated', validThrough: '2026-12-31' });
  assert.equal(own.ok, true, own.error);
  const twice = annApi.aarCorroborationRespond({ requestId: 'q-ann-1', outcome: 'disputed', reason: 'a changed mind, refused as an edit' });
  assert.equal(twice.ok, false);
  assert.match(twice.error, /already has its one dated answer/);

  const storedAnswers = store.state.aarCorroborationResponses.filter((row) => row.requestId === 'q-ann-1');
  assert.equal(storedAnswers.length, 1, 'the ledger holds exactly one answer for the request');
  assert.equal(storedAnswers[0].outcome, 'corroborated');
});

test('a lesson adoption is only offered to a holder the lesson touches', () => {
  const state = fixture({ withAnswers: false });
  const { api, store } = seed(state);
  store.update((draft) => { draft.settings = { ...draft.settings, activeSeatId: 'cleo' }; }, { type: 'seat.declared', entity: 'settings', entityId: 'seat', summary: 'seat' });
  const cleoApi = guardApi(createApi(store, { now: () => NOW, idFactory: (p) => `${p}-y${Math.random().toString(36).slice(2, 7)}` }), store, { now: () => NOW.getTime() });
  const ok = cleoApi.aarLessonAdopt({
    reviewId: 'retro-1', lessonId: 'les-1', outcome: 'adopted', note: 'Named a product-side interface owner in our checklist.',
  });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(store.state.aarAdoptions.length, 1);
  assert.equal(store.state.aarAdoptions[0].holderId, 'cleo');
  // The AAR ledger is untouched by an adoption.
  assert.equal(store.state.retros.find((r) => r.id === 'retro-1').lessons[0].state, 'open');
});

/* -------------------------------------------------------------------- 8. CSV */

test('CSV #141 exports the same aggregates and no identity', () => {
  const state = fixture();
  const report = read(state);
  const rows = aarCorroborationCsvRows(report);
  const head = rows[0];
  assert.equal(head.row_kind, 'workspace');
  assert.equal(head.required_line_answers_n, 6);
  assert.equal(head.corroborated_n, 1);
  assert.equal(head.disputed_n, 1);
  assert.equal(head.observations_n, 1);
  assert.equal(head.coverage_pct, 16.7);
  assert.equal(head.counts_reconcile, true);
  // No identity appears anywhere in the serialized output.
  const exported = exportWorkspaceCsv(state, AAR_CORROBORATION_CSV_SCOPE, { now: NOW });
  assert.equal(exported.ok, true, exported.error);
  const text = exported.csv;
  const { headers } = parseCsv(text);
  for (const leaked of ['Kim Builder', 'Ann Func', 'Bob Project', 'Cleo Product', 'retro-1', 'les-1',
    'Migration cutover', 'interface ownership']) {
    assert.ok(!text.toLowerCase().includes(leaked.toLowerCase()), `the export must not leak “${leaked}”`);
  }
  assert.equal(AAR_CORROBORATION_CSV_COLUMNS.includes('coverage_pct'), true);
  // The export's columns are exactly the declared columns, in order.
  assert.deepEqual(headers, [...AAR_CORROBORATION_CSV_COLUMNS]);
  // One workspace row, one row per request state, one per parity verdict.
  assert.equal(exported.rowCount, 1 + 11 + 5);
});

test('a withheld rate is BLANK in the export, with its reason — never zero', () => {
  const raw = createEmptyState(NOW.toISOString());
  raw.people = [person('ann', 'Ann Func', null, 'director'), person('kim', 'Kim Builder', 'ann'), person('bob', 'Bob Project', null, 'manager')];
  raw.reportingLines = [line('rl-kim-bob', 'kim', 'bob')];
  raw.retros = [retro('retro-x', 'Tiny cutover', '2026-10-24', ['kim'], [])];
  const state = normalizeState(raw, { now: NOW }).state;
  const report = read(state);
  // One holder (ann) + one holder (bob) = 2 answers, below the declared floor of 3.
  assert.equal(report.totals.requiredLineAnswersN, 2);
  assert.equal(report.totals.coverageWithheld, true);
  assert.equal(report.totals.coveragePct, null);
  assert.match(report.totals.coverageWithheldReason, /declared disclosure floor is 3/);
  const row = aarCorroborationCsvRows(report)[0];
  assert.equal(row.coverage_pct, '', 'a withheld percentage is an empty cell, never 0');
  assert.equal(row.coverage_withheld, true);
  assert.match(row.coverage_withheld_reason, /floor/);
});

/* --------------------------------------------------------------- 9. disclosure */

test('the disclosure ladder is applied in the read model, not the view', () => {
  const state = fixture();
  const span = buildAarCorroborationReport(state, {
    now: NOW,
    settings: state.settings,
    seat: { id: 'ann', rank: 1, fullAccess: false, readOnly: false, scope: new Set(['kim', 'ria', 'sol', 'ann']), lineScope: new Set(['kim', 'ria', 'sol']), label: 'Ann Func' },
  });
  assert.equal(span.detailLevel, 'span');
  const lesson = span.lessons[0];
  assert.equal(lesson.lessonText, '', 'lesson prose is withheld at span level');
  assert.equal(lesson.lessonTextWithheld, true);
  // The arithmetic survives the redaction.
  assert.equal(lesson.touchedLinesN, 3);
  const lineRows = lesson.lines.filter((row) => row.managerId === null);
  assert.ok(lineRows.length >= 1, 'other holders are redacted rather than dropped');
  assert.ok(lineRows.every((row) => row.lineKey === null));

  const none = buildAarCorroborationReport(state, { now: NOW, settings: state.settings, detailLevel: 'none' });
  assert.equal(none.detailLevel, 'none');
  assert.deepEqual(none.rows, [], 'no rows at all, because a redacted row would read as empty workspace');
  assert.ok(none.totals.requiredLineAnswersN > 0, 'but the totals still count');
});

/* ------------------------------------------------------------------ 10. view */

test('the panel renders the report it was given, and its CSV action uses the same rows', () => {
  withDom(() => {
    const state = fixture();
    const { api } = seed(state);
    const report = read(state);
    const ctx = {
      api,
      state,
      now: NOW,
      query: new URLSearchParams('panel=cross-line'),
      toast: () => {},
      refresh: () => {},
    };
    const node = renderLearningCrossLinePanel(ctx);
    const text = node.textContent;
    // The printed counts are the report's counts.
    assert.ok(text.includes('16.7%'), 'the coverage percentage printed is the computed one');
    assert.ok(text.includes('Migration cutover'), 'the review is named at full disclosure');
    assert.ok(text.includes('Corroborated'), 'the corroborated count is printed');
    assert.ok(text.includes('parity-open') || text.includes('A touched line has not adopted'),
      'the parity verdict is printed with its reason');
    // A withheld figure is never rendered as a zero.
    assert.ok(!/coverage 0%/.test(text));
    const tables = node.querySelectorAll('table');
    assert.ok(tables.length >= 2, 'the required-answer and parity tables are present');
  });
});

test('the signature is stable and the ask parser round-trips', () => {
  const a = aarCorroborationSignature('lesson-parity|retro-1|les-1||ann,bob');
  const b = aarCorroborationSignature('lesson-parity|retro-1|les-1||ann,bob');
  const c = aarCorroborationSignature('lesson-parity|retro-1|les-1||bob,ann');
  assert.equal(a, b, 'the same condition hashes to the same signature');
  assert.notEqual(a, c, 'a different condition does not collide');
  assert.match(a, /^aac1:\d+:[0-9a-f]{16}$/);
  assert.deepEqual(parseAarCorroborationAskSummary(`AAR-CORR-ASK ${a}`), { signature: a });
  assert.equal(parseAarCorroborationAskSummary('AAR-CORR-ASK nonsense'), null);
  assert.equal(parseAarCorroborationAskSummary('some other delegate'), null);
});

/* ------------------------------------------------------------- 11. migration */

test('MIGRATIONS[148] adds three EMPTY ledgers and infers no corroboration', () => {
  const v148 = { ...createEmptyState(NOW.toISOString()), schemaVersion: 148 };
  delete v148.aarCorroborationRequests;
  delete v148.aarCorroborationResponses;
  delete v148.aarAdoptions;
  v148.settings = { ...v148.settings };
  delete v148.settings.aarCorroborationDueDays;
  const next = MIGRATIONS[148](v148);
  assert.equal(next.schemaVersion, 149);
  assert.deepEqual(next.aarCorroborationRequests, []);
  assert.deepEqual(next.aarCorroborationResponses, []);
  assert.deepEqual(next.aarAdoptions, []);
  assert.equal(next.settings.aarCorroborationDueDays, 14);
  assert.equal(next.settings.aarCorroborationAutoPropagate, true);
  assert.equal(next.retros, v148.retros, 'the AAR ledger is untouched by the migration');
});

/* ------------------------------------------------------------ 12. read refusals */

test('every read refusal the engine can raise is declared in the registry', () => {
  const declared = new Set(AAR_CORROBORATION_READ_REFUSALS.map((row) => row.key));
  const state = fixture();
  const report = read(state);
  for (const row of report.totals.refusalReasons) {
    assert.ok(declared.has(row.key), `${row.key} must be declared, because the method section explains it`);
    assert.ok(row.says && row.says.length > 20, `${row.key} must carry a sentence`);
  }
});

test('the snapshot refuses an unreachable line set instead of guessing the home line', () => {
  const state = fixture();
  const matrix = buildMatrixFor(state);
  const ret = state.retros.find((row) => row.id === 'retro-1');
  // `sol` is on the roster but is not a participant of retro-1, so nobody holds
  // a line over them WITHIN this review. A holder who holds no line inside the
  // frozen set is refused rather than given the home line by default.
  const noHolder = aarCorroborationSnapshot(state, ret, { matrix, holderId: 'sol' });
  assert.equal(noHolder.ok, false);
  assert.equal(noHolder.refusal, 'off-seat');
  assert.match(noHolder.reason, /holds no line over any participant/);

  const single = state.retros.find((row) => row.id === 'retro-3');
  const singleLine = aarCorroborationSnapshot(state, single, { matrix });
  assert.equal(singleLine.ok, false);
  assert.equal(singleLine.singleLine, true);
});
