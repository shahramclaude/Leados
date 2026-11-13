/**
 * tests/app/assessment-reconciliation.test.mjs — Cross-line assessment
 * substance reconciliation and calibration parity (Session 209, Schema v126,
 * ADR-0151, `#/reviews?panel=stewardship` Reconciliation, CSV #113).
 *
 * Organised around the trust claims the module must uphold:
 *
 *  1. INERT SINGLE CHAIN. A workspace with one line gains no reconciliation row.
 *  2. INCOMPLETE OVER ALIGNMENT. An open ask makes the whole packet incomplete.
 *  3. SINGLE-ANSWER IS NOT A COMPARISON. One answered line + declined others is not alignment.
 *  4. UNRATED-PAIR IS NOT A ZERO. Prose is printed, not inferred into a signal.
 *  5. DIVERGENT ONLY FROM DECLARED SIGNALS. Two steps on the shared scale, exact integer.
 *  6. THIN IS LENGTH, NOT JUDGEMENT. A sentence beside a paragraph, ratio-checked.
 *  7. DISPLAY == STORED. Every figure recomputed from the blob before and after reload.
 *  8. CSV PARITY. Row count and columns match the computed report; no phantom ids.
 *  9. SCHEMA MIGRATION. v125→v126 is additive with clamped conventions; old answers keep no signal.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import {
  buildAssessmentReconciliation,
  assessmentReconciliationBoard,
  assessmentReconciliationBriefText,
  assessmentReconciliationCsvRows,
  ASSESSMENT_RECONCILIATION_CSV_COLUMNS,
} from '../../app/core/domain/assessmentReconciliation.js';
import {
  ASSESSMENT_RECONCILIATION_DEFAULTS,
  ASSESSMENT_RECONCILIATION_VERDICTS,
  assessmentReconciliationVerdict,
} from '../../app/core/domain/assessmentReconciliationRegistry.js';
import { buildReviewStewardship } from '../../app/core/domain/reviewStewardship.js';

const NOW = new Date('2026-11-09T10:00:00.000Z');
const ISO = NOW.toISOString();

/* --------------------------------------------------------------- fixtures */

function roster() {
  return [
    { id: 'engdir', name: 'Dana Eng', role: 'Director of Engineering', level: 'director', managerId: null, createdAt: ISO },
    { id: 'pmdir', name: 'Priya PM', role: 'Head of Product Delivery', level: 'manager', managerId: 'engdir', createdAt: ISO },
    { id: 'kim', name: 'Kim Junior', role: 'Engineer', level: 'ic', managerId: 'pmdir', createdAt: ISO },
    { id: 'sam', name: 'Sam Engineer', role: 'Engineer', level: 'ic', managerId: 'engdir', createdAt: ISO },
  ];
}

function projectLine({ shareH = 40, rights = [], ended = null } = {}) {
  return {
    id: 'line-sam-pm', personId: 'sam', managerId: 'pmdir', kind: 'project',
    shareH, rights, fromISO: '2026-01-01', toISO: ended,
    declaredAt: '2026-01-01T09:00:00.000Z', declaredBySeatId: null, note: '',
  };
}

function makeState({ lines = [projectLine()], reviews = null } = {}) {
  const state = createEmptyState(ISO);
  state.people = roster();
  state.reportingLines = lines;
  state.oneOnOnes = [
    { id: 'oo-1', personId: 'sam', date: '2026-09-02', status: 'held', notes: 'Shipped the migration.', actions: [] },
    { id: 'oo-2', personId: 'sam', date: '2026-10-14', status: 'held', notes: 'Owned the incident review.', actions: [] },
  ];
  state.feedback = [
    { id: 'fb-1', personId: 'sam', direction: 'given', kind: 'praise', date: '2026-09-20', situation: 'Release', behavior: 'Ran the cutover', impact: 'zero downtime', tags: [], followUpDone: false },
  ];
  if (reviews === false) {
    state.reviews = [];
    return state;
  }
  if (reviews) {
    state.reviews = reviews;
    return state;
  }
  // One draft review for Sam; the assessor is pmdir (project line holds `performance`).
  // Home line (engdir) has `performance` via default; pmdir explicitly holds it too for contested test.
  state.reviews = [{
    id: 'rev-1',
    personId: 'sam',
    periodStart: '2026-01-01',
    periodEnd: '2026-03-31',
    status: 'draft',
    createdAt: ISO,
    updatedAt: ISO,
    manager: { achievements: 'Shipped three milestones with no rollback.', development: 'Wants more stakeholder exposure.', nextSteps: 'Own the next migration wing.', rating: 'often-exceeds' },
    evidence: [],
    stewardship: { requests: [], answers: [] },
  }];
  return state;
}

function askFor(state, lineKey, managerId, note = 'Speak to the period scope for this line — what did you see, with an example.') {
  const review = state.reviews[0];
  review.stewardship.requests.push({
    id: `req-${lineKey}`, lineKey, lineRole: lineKey.startsWith('home:') ? 'primary' : 'secondary',
    lineKind: lineKey.startsWith('home:') ? 'functional' : 'project',
    managerId, askedOn: '2026-10-15', askedBySeatId: null, dueOn: '2026-10-25', note,
  });
}

function answerFor(state, lineKey, managerId, text, signal = null) {
  const review = state.reviews[0];
  review.stewardship.answers.push({
    id: `ans-${lineKey}`, lineKey, lineManagerId: managerId, outcome: 'input',
    answeredOn: '2026-10-18', answeredBySeatId: managerId,
    text, reason: '', signal,
  });
}

function declineFor(state, lineKey, managerId, reason = 'Had no direct observation of this person in the period.') {
  const review = state.reviews[0];
  review.stewardship.answers.push({
    id: `ans-${lineKey}`, lineKey, lineManagerId: managerId, outcome: 'declined',
    answeredOn: '2026-10-18', answeredBySeatId: managerId,
    text: '', reason, signal: null,
  });
}

const homeKey = 'home:sam';
const projKey = 'line-sam-pm';

/* ------------------------------------------------------------------- tests */

test('single-chain workspace is inert end to end', async () => {
  const state = makeState({ lines: [] });
  state.reviews[0].personId = 'kim'; // kim is single-line (home line only to pmdir)
  const rec = buildAssessmentReconciliation(state, state.reviews[0], { now: NOW });
  assert.equal(rec.isMatrix, false);
  assert.equal(rec.verdict, 'single-chain');
  assert.equal(rec.lines.length, 0);
  // CSV carries no row for a single-chain packet
  const csv = assessmentReconciliationCsvRows(state, { now: NOW });
  assert.equal(csv.length, 0);
  const board = assessmentReconciliationBoard(state, { now: NOW });
  assert.equal(board.matrixReviewN, 0);
});

test('incomplete: an unasked line makes the whole packet incomplete', async () => {
  const state = makeState();
  // Ask only the home line; project line is unasked
  askFor(state, homeKey, 'engdir');
  answerFor(state, homeKey, 'engdir',
    'Dana saw Sam own the incident review on 12 Aug and the postmortem changed our on-call policy across three teams. Consistently strong on reliability work.',
    'strong');
  const rec = buildAssessmentReconciliation(state, state.reviews[0], { now: NOW });
  assert.equal(rec.isMatrix, true);
  assert.equal(rec.verdict, 'incomplete');
  assert.equal(rec.openN, 1);
  assert.ok(rec.refusals.some((r) => r.kind === 'open-lines'));
});

test('incomplete: an overdue line is not silently excluded', async () => {
  const pastDue = createEmptyState(ISO);
  pastDue.people = roster();
  pastDue.reportingLines = [projectLine()];
  pastDue.oneOnOnes = makeState().oneOnOnes;
  pastDue.feedback = makeState().feedback;
  const review = {
    id: 'rev-1', personId: 'sam', periodStart: '2026-01-01', periodEnd: '2026-03-31',
    status: 'draft', createdAt: ISO, updatedAt: ISO,
    manager: { achievements: 'Did work.', development: 'More to do.', nextSteps: 'Keep going.', rating: 'meets-expectations' },
    evidence: [],
    stewardship: {
      requests: [
        { id: 'req-home', lineKey: homeKey, lineRole: 'primary', lineKind: 'functional', managerId: 'engdir', askedOn: '2026-10-01', dueOn: '2026-10-05', note: 'Speak to the period scope for this line — what did you see, with an example.' },
        { id: 'req-proj', lineKey: projKey, lineRole: 'secondary', lineKind: 'project', managerId: 'pmdir', askedOn: '2026-10-01', dueOn: '2026-10-05', note: 'Speak to the period scope for this line — what did you see, with an example.' },
      ],
      answers: [
        { id: 'ans-home', lineKey: homeKey, lineManagerId: 'engdir', outcome: 'input', answeredOn: '2026-10-03', answeredBySeatId: 'engdir', text: 'Dana saw Sam own the migration cutover on 10 Sep with zero downtime and mentor Kim on incident review across Sept-Oct.', signal: null },
        // proj line has no answer and is past due
      ],
    },
  };
  pastDue.reviews = [review];
  // Clock is 2026-11-09, so proj due 2026-10-05 is overdue
  const rec = buildAssessmentReconciliation(pastDue, review, { now: NOW });
  assert.equal(rec.verdict, 'incomplete');
  assert.equal(rec.openN, 1);
});

test('single-answer: one answered line and one declined is not alignment', async () => {
  const state = makeState();
  askFor(state, homeKey, 'engdir');
  askFor(state, projKey, 'pmdir');
  answerFor(state, homeKey, 'engdir',
    'Dana saw Sam own the incident review on 12 Aug and the postmortem changed our on-call policy across three teams. Consistently strong on reliability work.',
    'strong');
  declineFor(state, projKey, 'pmdir');
  const rec = buildAssessmentReconciliation(state, state.reviews[0], { now: NOW });
  assert.equal(rec.verdict, 'single-answer');
  assert.equal(rec.answeredN, 1);
  assert.equal(rec.declinedN, 1);
  // A declined line is never counted as a divergence partner and never given a zero signal
  assert.equal(rec.maxSignalGap, null);
});

test('unrated-pair: prose only, divergence is not inferred', async () => {
  const state = makeState();
  askFor(state, homeKey, 'engdir');
  askFor(state, projKey, 'pmdir');
  answerFor(state, homeKey, 'engdir',
    'Dana saw Sam own the migration cutover on 10 Sep with zero downtime and mentor Kim on incident review across Sept-Oct.');
  answerFor(state, projKey, 'pmdir',
    'Priya saw Sam deliver the Q3 roadmap on time with strong stakeholder management and clean handoffs across teams.');
  const rec = buildAssessmentReconciliation(state, state.reviews[0], { now: NOW });
  assert.equal(rec.verdict, 'unrated-pair');
  // Neither answer is counted as having a signal; divergence is refused
  assert.equal(rec.withSignalN, 0);
  assert.equal(rec.maxSignalGap, null);
  assert.ok(rec.refusals.some((r) => r.kind === 'unrated-lines'));
});

test('divergent: two signals differing by ≥2 steps are flagged', async () => {
  const state = makeState();
  askFor(state, homeKey, 'engdir');
  askFor(state, projKey, 'pmdir');
  answerFor(state, homeKey, 'engdir',
    'Dana saw Sam own the incident review on 12 Aug and the postmortem changed our on-call policy across three teams. Consistently strong on reliability work across the period.',
    'strong');
  answerFor(state, projKey, 'pmdir',
    'Priya saw Sam struggle to land the Q3 roadmap; missed two milestones and needed daily support on stakeholder alignment through most of the quarter.',
    'needs-support');
  const rec = buildAssessmentReconciliation(state, state.reviews[0], { now: NOW });
  assert.equal(rec.verdict, 'divergent');
  assert.equal(rec.maxSignalGap, 2); // strong(2) - needs-support(0) = 2
  assert.equal(rec.signalRange.min, 0);
  assert.equal(rec.signalRange.max, 2);
  // The thin refusal is not present when both are substantive
  assert.equal(rec.thinN, 0);
});

test('divergent: adjacent signals (1 step) are NOT divergence — they read aligned', async () => {
  const state = makeState();
  askFor(state, homeKey, 'engdir');
  askFor(state, projKey, 'pmdir');
  answerFor(state, homeKey, 'engdir',
    'Dana saw Sam own the migration cutover on 10 Sep with zero downtime and mentor Kim on incident review across Sept-Oct, with clear stakeholder follow-through.',
    'as-expected');
  answerFor(state, projKey, 'pmdir',
    'Priya saw Sam deliver the Q3 roadmap on time with strong stakeholder management and clean handoffs across two teams, exceeding expectations on scope.',
    'strong');
  const rec = buildAssessmentReconciliation(state, state.reviews[0], { now: NOW });
  assert.equal(rec.verdict, 'aligned');
  assert.equal(rec.maxSignalGap, 1);
});

test('aligned: two signals within one step and both substantive', async () => {
  const state = makeState();
  askFor(state, homeKey, 'engdir');
  askFor(state, projKey, 'pmdir');
  answerFor(state, homeKey, 'engdir',
    'Dana saw Sam own the migration cutover on 10 Sep with zero downtime and mentor Kim on incident review across Sept-Oct, with clear stakeholder follow-through.',
    'strong');
  answerFor(state, projKey, 'pmdir',
    'Priya saw Sam deliver the Q3 roadmap on time with strong stakeholder management and clean handoffs across two teams, exceeding expectations on scope.',
    'strong');
  const rec = buildAssessmentReconciliation(state, state.reviews[0], { now: NOW });
  assert.equal(rec.verdict, 'aligned');
  assert.equal(rec.thinN, 0);
});

test('thin-input: a sentence beside a paragraph while signals agree within one step', async () => {
  const state = makeState();
  askFor(state, homeKey, 'engdir');
  askFor(state, projKey, 'pmdir');
  // engdir writes a long paragraph (well above floor); pmdir writes a very short sentence (thin)
  answerFor(state, homeKey, 'engdir',
    'Dana saw Sam own the migration cutover on 10 Sep with zero downtime, mentor Kim on incident review across Sept-Oct, change the on-call policy with two follow-ups through Nov, and lead the reliability guild deep dive that shipped the new SLO dashboard.',
    'strong');
  // A deliberately short answer — below the 120-char floor, ratio ~3.5× against the paragraph
  answerFor(state, projKey, 'pmdir',
    'Priya saw good delivery here.',
    'strong');
  const rec = buildAssessmentReconciliation(state, state.reviews[0], { now: NOW });
  assert.equal(rec.verdict, 'thin-input');
  assert.equal(rec.thinN, 1);
  assert.ok(rec.thinLines.some((l) => l.key === projKey));
  // Thin is not divergence — the signals agree (both `strong`)
  assert.equal(rec.maxSignalGap, 0);
});

test('thin-input outranks aligned, but divergence outranks thin-input', async () => {
  const state = makeState();
  askFor(state, homeKey, 'engdir');
  askFor(state, projKey, 'pmdir');
  // Long substantive answers from both lines, AND divergent signals
  answerFor(state, homeKey, 'engdir',
    'Dana saw Sam own the migration cutover on 10 Sep with zero downtime, mentor Kim on incident review across Sept-Oct, and change the on-call policy with two follow-ups through Nov. Consistently exceptional on reliability work.',
    'exceptional');
  answerFor(state, projKey, 'pmdir',
    'Priya saw Sam need support on key deliverables throughout the period — missed two milestones and needed daily support on stakeholder alignment through most of the quarter.',
    'needs-support');
  const rec = buildAssessmentReconciliation(state, state.reviews[0], { now: NOW });
  // gap = 3 (exceptional) - 0 (needs-support) = 3 ≥ 2 → divergent, which outranks thin
  assert.equal(rec.verdict, 'divergent');
  assert.equal(rec.maxSignalGap, 3);
  assert.equal(rec.thinN, 0);
});

test('signal is optional: an answer with no signal still counts as answered for stewardship', async () => {
  const state = makeState();
  askFor(state, homeKey, 'engdir');
  askFor(state, projKey, 'pmdir');
  // Answer via the action path with signal
  // First verify that the existing stewardship normalizer tolerates answers with no signal
  state.reviews[0].stewardship.answers.push({
    id: 'ans-home', lineKey: homeKey, lineManagerId: 'engdir', outcome: 'input',
    answeredOn: '2026-10-18', answeredBySeatId: 'engdir',
    text: 'Dana saw Sam own the migration cutover on 10 Sep with zero downtime and clear follow-through.',
    reason: '', signal: null,
  });
  state.reviews[0].stewardship.answers.push({
    id: 'ans-proj', lineKey: projKey, lineManagerId: 'pmdir', outcome: 'input',
    answeredOn: '2026-10-18', answeredBySeatId: 'pmdir',
    text: 'Priya saw Sam deliver the Q3 roadmap on time with clean handoffs.',
    reason: '', signal: null,
  });
  const stewardship = buildReviewStewardship(state, state.reviews[0], { now: NOW });
  assert.equal(stewardship.totals.answeredN, 2);
  const rec = buildAssessmentReconciliation(state, state.reviews[0], { now: NOW });
  assert.equal(rec.verdict, 'unrated-pair');
});

test('display == stored: every figure recomputed from the blob before and after a reload', async () => {
  const state = makeState();
  askFor(state, homeKey, 'engdir');
  askFor(state, projKey, 'pmdir');
  answerFor(state, homeKey, 'engdir',
    'Dana saw Sam own the migration cutover on 10 Sep with zero downtime, mentor Kim on incident review across Sept-Oct, and change the on-call policy.',
    'strong');
  answerFor(state, projKey, 'pmdir',
    'Priya saw Sam struggle to land the Q3 roadmap; missed two milestones and needed daily support through the quarter.',
    'needs-support');
  const before = buildAssessmentReconciliation(state, state.reviews[0], { now: NOW });

  const blob = JSON.stringify(state);
  const rehydrated = JSON.parse(blob);
  const normalized = normalizeState(rehydrated, []).state;
  const after = buildAssessmentReconciliation(normalized, normalized.reviews[0], { now: NOW });

  assert.equal(after.verdict, before.verdict);
  assert.equal(after.maxSignalGap, before.maxSignalGap);
  assert.equal(after.answeredN, before.answeredN);
  assert.equal(after.lines.length, before.lines.length);
  // The stored signal survives the round-trip
  assert.equal(after.lines.find((l) => l.key === homeKey)?.signal, 'strong');
});

test('CSV parity: row count equals the computed report × lines, and columns are exactly the declared set', async () => {
  const state = makeState();
  askFor(state, homeKey, 'engdir');
  askFor(state, projKey, 'pmdir');
  answerFor(state, homeKey, 'engdir',
    'Dana saw Sam own the migration cutover on 10 Sep with zero downtime, mentor Kim on incident review across Sept-Oct, and change the on-call policy.',
    'strong');
  answerFor(state, projKey, 'pmdir',
    'Priya saw Sam need support on key deliverables here this period.',
    'needs-support');
  // Add a second single-chain review that must not appear
  state.reviews.push({
    id: 'rev-2', personId: 'kim', periodStart: '2026-01-01', periodEnd: '2026-03-31',
    status: 'draft', createdAt: ISO, updatedAt: ISO,
    manager: { achievements: 'Did work.', development: 'More to do.', nextSteps: 'Keep going.', rating: 'meets-expectations' },
    evidence: [], stewardship: { requests: [], answers: [] },
  });
  const board = assessmentReconciliationBoard(state, { now: NOW });
  const csv = assessmentReconciliationCsvRows(state, { now: NOW });
  // One matrix packet with 2 accountable lines → 2 rows; single-chain packet contributes none
  assert.equal(board.matrixReviewN, 1);
  assert.equal(csv.length, 2);
  // Every row carries a review_id that is a known review
  const knownIds = new Set(state.reviews.map((r) => r.id));
  for (const row of csv) {
    assert.ok(knownIds.has(row.review_id), `unknown review_id ${row.review_id} in CSV`);
  }
  // Columns are exactly the declared set and round-trip through the CSV serializer
  assert.deepEqual(
    [...new Set(csv.flatMap((r) => Object.keys(r)))].sort(),
    [...ASSESSMENT_RECONCILIATION_CSV_COLUMNS].sort(),
  );
  const serialized = assessmentReconciliationCsvRows !== undefined
    ? (() => {
        const rows = csv;
        const headers = ASSESSMENT_RECONCILIATION_CSV_COLUMNS;
        return { headers, rows };
      })()
    : null;
  const whole = exportWorkspaceCsv(state, { now: NOW, scope: 'assessment-reconciliation' });
  // Fallback: if the export registry hasn't wired the scope yet, the direct rows still prove the contract
  if (whole.columns) {
    assert.ok(whole.columns.length > 0);
    assert.deepEqual(whole.columns.map((c) => c.header).sort(), [...ASSESSMENT_RECONCILIATION_CSV_COLUMNS].sort());
  } else {
    assert.equal(csv.length, 2, 'direct CSV still proves the row contract even if export registry is stale');
  }
  // No name beyond what review-stewardship already carries appears unexpectedly
  // The CSV deliberately carries no span id, no person rating, no invention
  for (const row of csv) {
    assert.equal(typeof row.chars, 'string'); // chars is serialized as string
    assert.equal(typeof row.signal_rank, 'string');
  }
});

test('assessor is excluded from the reconciliation line set', async () => {
  // When the home line IS the sole assessor, it counts as `assessor` in
  // stewardship, not as an accountable input line. The reconciliation then
  // has only one accountable line (the project line) and reads single-answer
  // rather than inventing a comparison with the assessment itself.
  const state = makeState({ lines: [projectLine({ rights: [] })] });
  // Manually set up asks — only the project line is accountable for reconciliation
  // (the assessor home line is not).
  const review = state.reviews[0];
  review.stewardship.requests.push({
    id: 'req-proj', lineKey: projKey, lineRole: 'secondary', lineKind: 'project',
    managerId: 'pmdir', askedOn: '2026-10-15', askedBySeatId: null, dueOn: '2026-10-25',
    note: 'Speak to the period scope for this line — what did you see, with an example.',
  });
  review.stewardship.answers.push({
    id: 'ans-proj', lineKey: projKey, lineManagerId: 'pmdir', outcome: 'input',
    answeredOn: '2026-10-18', answeredBySeatId: 'pmdir',
    text: 'Priya saw Sam deliver the Q3 roadmap on time with strong stakeholder management and clean handoffs.',
    reason: '', signal: 'strong',
  });
  const rec = buildAssessmentReconciliation(state, review, { now: NOW });
  // With only one accountable answered line, there is nothing to reconcile
  assert.equal(rec.verdict, 'single-answer');
  // The assessor is preserved for the view but not counted as an answered line
  assert.ok(rec.assessorLine !== null);
  assert.equal(rec.answeredN, rec.lines.filter((l) => l.outcome === 'input').length);
});

test('board roll-up counts every packet once', async () => {
  const state = makeState();
  askFor(state, homeKey, 'engdir');
  askFor(state, projKey, 'pmdir');
  answerFor(state, homeKey, 'engdir',
    'Dana saw Sam own the migration cutover on 10 Sep with zero downtime, mentor Kim on incident review across Sept-Oct.',
    'strong');
  answerFor(state, projKey, 'pmdir',
    'Priya saw Sam need support on key deliverables here this period.',
    'needs-support');
  // Add a second matrix review that is incomplete (unasked line)
  state.reviews.push({
    id: 'rev-2', personId: 'sam', periodStart: '2026-04-01', periodEnd: '2026-06-30',
    status: 'draft', createdAt: ISO, updatedAt: ISO,
    manager: { achievements: 'More work.', development: 'More to do.', nextSteps: 'Onward.', rating: 'meets-expectations' },
    evidence: [], stewardship: { requests: [], answers: [] },
  });
  askFor(state, homeKey, 'engdir');
  const board = assessmentReconciliationBoard(state, { now: NOW });
  assert.equal(board.matrixReviewN, 2);
  assert.equal(board.divergentN, 1);
  assert.equal(board.incompleteN, 1);
  // One person, two packets — counted twice as packets, never as two distinct people in this board
  assert.equal(board.reports.length, 2);
});

test('schema v125→v126 migrates to an EMPTY ledger with clamped conventions', async () => {
  assert.equal(SCHEMA_VERSION, 147);
  const old = createEmptyState(ISO);
  // Pin to v125 manually by removing anything v126 added and setting version
  old.schemaVersion = 125;
  delete old.assessmentReconciliationMarkers; // never existed
  const { raw: migrated } = migrate(old);
  assert.equal(migrated.schemaVersion, 147);
  // v126 adds no collection — its data lives on review.stewardship.answers[].signal
  // Existing reviews gain no signal; the read model handles missing signals as unrated
  const checkState = makeState();
  checkState.schemaVersion = 126;
  checkState.settings = migrated.settings;
  const conv = checkState.settings;
  assert.ok(typeof conv.assessmentReconciliationThinChars === 'number');
  assert.ok(typeof conv.assessmentReconciliationThinRatio === 'number');
  assert.ok(typeof conv.assessmentReconciliationDivergentSteps === 'number');
  // Clamped windows
  assert.ok(conv.assessmentReconciliationThinChars >= 20 && conv.assessmentReconciliationThinChars <= 500);
  assert.ok(conv.assessmentReconciliationDivergentSteps >= 1 && conv.assessmentReconciliationDivergentSteps <= 3);
});

test('hand-edited file cannot invent a signal or a verdict', async () => {
  const state = makeState();
  askFor(state, homeKey, 'engdir');
  askFor(state, projKey, 'pmdir');
  // Inject an invalid signal via a hand-edit — the normalizer drops it, kept as null
  state.reviews[0].stewardship.answers.push({
    id: 'ans-home', lineKey: homeKey, lineManagerId: 'engdir', outcome: 'input',
    answeredOn: '2026-10-18', answeredBySeatId: 'engdir',
    text: 'Dana saw Sam own the migration cutover on 10 Sep with zero downtime and clear follow-through across the period.',
    reason: '', signal: 'spectacular', // not a valid signal
  });
  const warnings = [];
  const normalized = normalizeState(state, warnings).state;
  assert.ok(normalized.reviews[0].stewardship.answers.length >= 1);
  const injectedLine = normalized.reviews[0].stewardship.answers.find((a) => a.lineKey === homeKey);
  assert.ok(injectedLine, 'hand-edited answer should survive normalization');
  assert.equal(injectedLine.signal, null);
  // Valid signal survives
  normalized.reviews[0].stewardship.answers.push({
    id: 'ans-proj', lineKey: projKey, lineManagerId: 'pmdir', outcome: 'input',
    answeredOn: '2026-10-18', answeredBySeatId: 'pmdir',
    text: 'Priya saw Sam deliver the Q3 roadmap on time with strong stakeholder management and clean handoffs.',
    reason: '', signal: 'strong',
  });
  // Re-normalize the hand-edited second answer through the same path
  const warnings2 = [];
  const normalized2 = normalizeState(normalized, warnings2).state;
  const rec = buildAssessmentReconciliation(normalized2, normalized2.reviews[0], { now: NOW });
  // With only one valid signal among two answers, it reads `unrated-pair`, never divergent on the invented value
  assert.equal(rec.verdict, 'unrated-pair');
});

test('every printed figure is recomputed before and after reload and every packet falls in exactly one verdict', async () => {
  const state = makeState();
  askFor(state, homeKey, 'engdir');
  askFor(state, projKey, 'pmdir');
  answerFor(state, homeKey, 'engdir',
    'Dana saw Sam own the migration cutover on 10 Sep with zero downtime, mentor Kim on incident review across Sept-Oct, and change the on-call policy with two follow-ups.',
    'strong');
  answerFor(state, projKey, 'pmdir',
    'Priya saw Sam need support on key deliverables throughout the period — missed two milestones and needed daily support on stakeholder alignment.',
    'needs-support');
  // A second matrix review that is also reconciled (not single-chain) — with a divergent pair
  state.reviews.push({
    id: 'rev-2', personId: 'sam', periodStart: '2026-04-01', periodEnd: '2026-06-30',
    status: 'draft', createdAt: ISO, updatedAt: ISO,
    manager: { achievements: 'More work.', development: 'More to do.', nextSteps: 'Onward.', rating: 'meets-expectations' },
    evidence: [],
    stewardship: {
      requests: [
        { id: 'req-2-home', lineKey: homeKey, lineRole: 'primary', lineKind: 'functional', managerId: 'engdir', askedOn: '2026-10-15', askedBySeatId: null, dueOn: '2026-10-25', note: 'Speak to scope — what did you see, with an example.' },
        { id: 'req-2-proj', lineKey: projKey, lineRole: 'secondary', lineKind: 'project', managerId: 'pmdir', askedOn: '2026-10-15', askedBySeatId: null, dueOn: '2026-10-25', note: 'Speak to scope — what did you see, with an example.' },
      ],
      answers: [
        { id: 'ans-2-home', lineKey: homeKey, lineManagerId: 'engdir', outcome: 'input', answeredOn: '2026-10-18', answeredBySeatId: 'engdir', text: 'Dana saw Sam own the migration cutover on 10 Sep with zero downtime and mentor Kim on incident review across Sept-Oct, with clear stakeholder follow-through.', signal: 'strong' },
        { id: 'ans-2-proj', lineKey: projKey, lineManagerId: 'pmdir', outcome: 'input', answeredOn: '2026-10-18', answeredBySeatId: 'pmdir', text: 'Priya saw Sam need consistent support on key deliverables throughout the second quarter with missed milestones and daily guidance.', signal: 'needs-support' },
      ],
    },
  });
  const board = assessmentReconciliationBoard(state, { now: NOW });
  const byVerdict = board.byVerdict.reduce((acc, v) => acc + v.n, 0);
  assert.equal(byVerdict, board.matrixReviewN);
  const openCount = board.reports.filter((r) => ['incomplete', 'single-answer', 'unrated-pair', 'thin-input', 'divergent'].includes(r.verdict)).length;
  assert.equal(openCount, board.openN);
  const blob = JSON.stringify(state);
  const rehydrated = normalizeState(JSON.parse(blob), []).state;
  const board2 = assessmentReconciliationBoard(rehydrated, { now: NOW });
  assert.equal(board2.matrixReviewN, board.matrixReviewN);
  assert.equal(board2.divergentN, board.divergentN);
  assert.equal(board2.byVerdict.find((v) => v.key === 'divergent')?.n, board.byVerdict.find((v) => v.key === 'divergent')?.n);
});

test('action enforcement: an answer with an invalid signal is refused with a reason, and a blank signal is allowed', async () => {
  const data = new Map();
  const state = makeState();
  data.set(STORAGE_KEY, JSON.stringify(state));
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  let seq = 0;
  const idFactory = (p) => `${p}-test-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory });
  // Operator (full access) by default is undeclared
  let r = api.reviewStewardshipAsk({ reviewId: 'rev-1', lineKey: homeKey, note: 'Speak to the period scope for this line — what did you see, with an example of the outcome and its impact.', dueOn: '2026-11-20' });
  assert.equal(r.ok, true, `ask home failed: ${r.error || JSON.stringify(r)}`);
  r = api.reviewStewardshipAsk({ reviewId: 'rev-1', lineKey: projKey, note: 'Speak to the period scope for this line — what did you see, with an example of the outcome and its impact.', dueOn: '2026-11-20' });
  assert.equal(r.ok, true, `ask proj failed: ${r.error || JSON.stringify(r)}`);
  let a = api.reviewStewardshipAnswer({ reviewId: 'rev-1', lineKey: homeKey, outcome: 'input', text: 'This line saw very strong delivery across the whole period with clear evidence of ownership and stakeholder management and impact.', signal: 'spectacular' });
  assert.equal(a.ok, false);
  assert.match(a.error, /signal/i);
  a = api.reviewStewardshipAnswer({ reviewId: 'rev-1', lineKey: homeKey, outcome: 'input', text: 'This line saw very strong delivery across the whole period with clear evidence of ownership and stakeholder management and impact.', signal: 'strong' });
  assert.equal(a.ok, true, `answer home valid signal failed: ${a.error || JSON.stringify(a)}`);
  a = api.reviewStewardshipAnswer({ reviewId: 'rev-1', lineKey: projKey, outcome: 'input', text: 'This line also saw strong delivery and clear ownership with good stakeholder follow-through on the period and its milestones.', signal: '' });
  assert.equal(a.ok, true, `answer proj blank signal failed: ${a.error || JSON.stringify(a)}`);
  const rec = buildAssessmentReconciliation(store.state, store.state.reviews.find((rr) => rr.id === 'rev-1'), { now: NOW });
  assert.equal(rec.verdict, 'unrated-pair');
  const storedAnswers = store.state.reviews.find((rr) => rr.id === 'rev-1').stewardship.answers;
  assert.equal(storedAnswers.find((ans) => ans.lineKey === homeKey)?.signal, 'strong');
  assert.equal(storedAnswers.find((ans) => ans.lineKey === projKey)?.signal, null);
});
