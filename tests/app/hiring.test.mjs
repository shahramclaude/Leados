/**
 * tests/app/hiring.test.mjs — Selection & hiring (Schema v17).
 *
 * Covers:
 *   1. Evidence statistics — log-odds combination, correlated-evidence
 *      discounting, neutrality at 3/5, banding, the falsification test
 *   2. Competency coverage and the offer convention
 *   3. Process parity (the fairness check that stores no protected attribute)
 *   4. Funnel, cycle-time floor and cost-of-vacancy honesty
 *   5. Schema v16 → v17 migration and normalization repairs
 *   6. Action validation and the audit trail
 *   7. RULE-HIRE-01 requisition → capacity reserve (create / refresh / release /
 *      complete), idempotently
 *   8. RULE-HIRE-02 offer accepted → roster + 30-60-90 plan + typed links +
 *      reserve completion in one transaction
 *   9. RULE-HIRE-03 stalled requisition → exactly one operational case, which
 *      inherits the whole case fan-out
 *  10. Signals, CSV export, and a JSDOM render of `#/hiring`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  DEFAULT_BASE_RATE,
  MIN_EVIDENCE_WEIGHT,
  assessCandidate,
  auditEvidence,
  competencyCoverage,
  flipTest,
  funnelStats,
  hiringSummary,
  isOpenCandidate,
  logistic,
  logit,
  processParity,
  stalledRequisitions,
  suggestedEffortDays,
} from '../../app/core/domain/hiring.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';
import { linksForEntity } from '../../app/core/domain/cases.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-25T10:00:00.000Z');
const TODAY = '2026-10-25';

function kvStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function harness(now = NOW) {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-hire-${++seq}`;
  const store = createStore({ storage: kvStorage(), now: () => now, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => now, idFactory }) };
}

function signal(overrides = {}) {
  return {
    id: overrides.id || `sig-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'structured-interview',
    competencyId: 'cmp-1',
    rating: 4,
    interviewerId: 'person-1',
    date: '2026-10-10',
    note: '',
    ...overrides,
  };
}

function requisition(overrides = {}) {
  return {
    id: 'req-1',
    title: 'Senior platform engineer',
    team: 'Platform',
    level: 'senior',
    reason: 'growth',
    status: 'open',
    openedOn: '2026-10-01',
    targetStartOn: '2026-12-01',
    closedOn: null,
    filledPersonId: null,
    interviewers: [],
    competencies: [
      { id: 'cmp-1', name: 'Designs resilient boundaries', weight: 4, required: true },
      { id: 'cmp-2', name: 'Runs incident response', weight: 3, required: true },
    ],
    effortDays: { optimistic: 2, mostLikely: 4, pessimistic: 7 },
    dailyVacancyCost: null,
    currency: 'USD',
    notes: '',
    autoEscalated: false,
    escalatedCaseId: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function candidate(overrides = {}) {
  return {
    id: 'cand-1',
    reqId: 'req-1',
    name: 'Noor Haddad',
    stage: 'final',
    appliedOn: '2026-10-02',
    lastActivityOn: '2026-10-20',
    source: 'Referral',
    signals: [],
    decision: { outcome: 'pending', decidedOn: null, rationale: '', evidenceGapAcknowledged: false },
    offerOn: null,
    offerAcceptedOn: null,
    hiredOn: null,
    startOn: null,
    personId: null,
    keepInTouch: false,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

/* ------------------------------------------------------- 1. evidence maths */

test('evidence: log-odds combination, neutrality at 3/5, and the band floor', () => {
  assert.ok(Math.abs(logistic(logit(0.4)) - 0.4) < 1e-9);
  assert.ok(Math.abs(logistic(0) - 0.5) < 1e-12);

  const neutral = auditEvidence([signal({ rating: 3 })], { prior: 0.4 });
  assert.ok(Math.abs(neutral.posterior - 0.4) < 1e-9, 'a 3/5 observation is genuinely neutral');
  assert.ok(neutral.totalWeight > 0, 'but it still counts as evidence weight');

  const strong = auditEvidence([signal({ kind: 'structured-interview', rating: 5 })], { prior: 0.4 });
  assert.ok(strong.posterior > 0.5, 'the highest-validity method at 5/5 clears a 40% prior');
  assert.equal(strong.band, 'thin', 'one observation can never be a strong band');

  // A 5/5 work sample (validity .33) is deliberately not enough to cross 50%
  // from a 40% prior: that is the whole point of weighting by method.
  const singleWorkSample = auditEvidence([signal({ kind: 'work-sample', rating: 5 })], { prior: 0.4 });
  assert.ok(singleWorkSample.posterior < 0.5);
  assert.ok(singleWorkSample.posterior > 0.4, 'but it still moves the estimate in the right direction');

  const contrary = auditEvidence([signal({ kind: 'structured-interview', rating: 1 })], { prior: 0.4 });
  assert.ok(contrary.posterior < 0.4);
  const strongContribution = strong.contributions[0].contribution;
  const contraryContribution = contrary.contributions[0].contribution;
  assert.ok(Math.abs(strongContribution + contraryContribution) < 1e-9, 'a 5 and a 1 move the log-odds by equal and opposite amounts');
});

test('evidence: correlated observations are discounted, not counted twice', () => {
  const sameRaterRepeated = auditEvidence([
    signal({ id: 'a', kind: 'unstructured-interview', rating: 5, interviewerId: 'p1' }),
    signal({ id: 'b', kind: 'unstructured-interview', rating: 5, interviewerId: 'p1' }),
  ]);
  const independentRaters = auditEvidence([
    signal({ id: 'a', kind: 'unstructured-interview', rating: 5, interviewerId: 'p1' }),
    signal({ id: 'b', kind: 'unstructured-interview', rating: 5, interviewerId: 'p2' }),
  ]);
  assert.ok(independentRaters.posterior > sameRaterRepeated.posterior, 'a second rater adds more than a repeat by the same person');
  assert.equal(sameRaterRepeated.sameRaterOnly, true);
  assert.equal(independentRaters.sameRaterOnly, false);
  const factors = independentRaters.contributions.map((c) => c.factor).sort();
  assert.deepEqual(factors, [0.5, 1]);
  assert.ok(sameRaterRepeated.contributions.some((c) => c.factor === 0.25 && c.repeatedReason.includes('same interviewer')));
});

test('evidence: a repeated rating of the same competency is worth less than a new competency', () => {
  const newCompetency = auditEvidence([
    signal({ id: 'a', kind: 'work-sample', rating: 5, competencyId: 'cmp-1' }),
    signal({ id: 'b', kind: 'work-sample', rating: 5, competencyId: 'cmp-2' }),
  ]);
  const repeated = auditEvidence([
    signal({ id: 'a', kind: 'work-sample', rating: 5, competencyId: 'cmp-1' }),
    signal({ id: 'b', kind: 'work-sample', rating: 5, competencyId: 'cmp-1' }),
  ]);
  assert.ok(newCompetency.posterior > repeated.posterior);
});

test('evidence: the falsification test states how much contrary evidence would flip the call', () => {
  const audit = auditEvidence([signal({ kind: 'work-sample', rating: 5 })], { prior: 0.45 });
  const flip = flipTest(audit);
  assert.equal(flip.direction, 'against');
  assert.ok(flip.count >= 1);
  // Applying that many contrary observations must actually cross the line.
  const contrary = Array.from({ length: flip.count }, (_, i) => signal({
    id: `c-${i}`,
    kind: flip.kindId,
    rating: 1,
    competencyId: `cmp-${i}`,
    interviewerId: `p-${i}`,
  }));
  const after = auditEvidence([signal({ kind: 'work-sample', rating: 5 })].concat(contrary), { prior: 0.45 });
  assert.ok(after.posterior < 0.5, `expected the estimate to cross below 0.5, got ${after.posterior}`);
});

test('evidence: disagreement between raters is surfaced instead of averaged away', () => {
  const audit = auditEvidence([
    signal({ id: 'a', rating: 5, competencyId: 'cmp-1', interviewerId: 'p1' }),
    signal({ id: 'b', rating: 1, competencyId: 'cmp-1', interviewerId: 'p2' }),
  ]);
  assert.equal(audit.disagreements.length, 1);
  assert.equal(audit.disagreements[0].spread, 4);
  const assessment = assessCandidate(candidate({ signals: [] }), requisition());
  assert.ok(assessment.warnings.some((w) => w.code === 'no-work-sample'));
});

/* ------------------------------------------------- 2. coverage & readiness */

test('coverage: a role with no competencies is unmeasurable, not scored', () => {
  const coverage = competencyCoverage(requisition({ competencies: [] }), []);
  assert.equal(coverage.measured, false);
  assert.equal(coverage.pct, null);
  const assessment = assessCandidate(candidate(), requisition({ competencies: [] }));
  assert.equal(assessment.blockers[0].code, 'no-competencies');
});

test('coverage: thin evidence, one method and uncovered competencies all block an offer', () => {
  const req = requisition();
  const thin = assessCandidate(candidate({ signals: [signal({ rating: 5 })] }), req);
  assert.equal(thin.ready, false);
  const codes = thin.blockers.map((b) => b.code);
  assert.ok(codes.includes('thin-evidence'));
  assert.ok(codes.includes('single-method'));
  assert.ok(codes.includes('required-uncovered'), 'cmp-2 has no evidence');

  const thorough = assessCandidate(candidate({
    signals: [
      signal({ id: 'a', kind: 'work-sample', rating: 5, competencyId: 'cmp-1', interviewerId: 'p1' }),
      signal({ id: 'b', kind: 'structured-interview', rating: 4, competencyId: 'cmp-2', interviewerId: 'p2' }),
    ],
  }), req);
  assert.deepEqual(thorough.blockers, []);
  assert.equal(thorough.ready, true);
  assert.ok(thorough.audit.totalWeight >= MIN_EVIDENCE_WEIGHT);
});

test('parity: the same competencies must be assessed for everyone at the same stage', () => {
  const req = requisition();
  const parity = processParity(req, [
    candidate({ id: 'c1', signals: [signal({ competencyId: 'cmp-1' })] }),
    candidate({ id: 'c2', signals: [signal({ competencyId: 'cmp-1' }), signal({ competencyId: 'cmp-2' })] }),
  ]);
  assert.equal(parity.measured, true);
  assert.equal(parity.candidatesCompared, 2);
  const uneven = parity.uneven.find((row) => row.competencyId === 'cmp-2');
  assert.equal(uneven.covered, 1);
  assert.equal(uneven.total, 2);

  const single = processParity(req, [candidate({ id: 'c1' })]);
  assert.equal(single.measured, false, 'one candidate cannot be compared with anyone');
});

/* --------------------------------------------- 3. funnel and vacancy honesty */

test('funnel: cycle time is withheld until two hires exist, and vacancy cost is never invented', () => {
  const req = requisition({ dailyVacancyCost: 500 });
  const one = funnelStats(req, [
    candidate({ id: 'a', stage: 'hired', appliedOn: '2026-09-01', hiredOn: '2026-09-21' }),
  ], { now: NOW });
  assert.equal(one.cycleMedianDays, null);
  assert.match(one.cycleReason, /two are needed/);
  assert.equal(one.vacancy.measured, true);
  assert.equal(one.vacancy.days, 24);
  assert.equal(one.vacancy.cost, 12_000);

  const two = funnelStats(req, [
    candidate({ id: 'a', stage: 'hired', appliedOn: '2026-09-01', hiredOn: '2026-09-21' }),
    candidate({ id: 'b', stage: 'hired', appliedOn: '2026-09-05', hiredOn: '2026-10-05' }),
  ], { now: NOW });
  assert.equal(two.cycleMedianDays, 25);

  const unpriced = funnelStats(requisition({ id: 'req-2', dailyVacancyCost: null }), [], { now: NOW });
  assert.equal(unpriced.vacancy.measured, false);
  assert.match(unpriced.vacancy.reason, /no exposure is claimed/i);
});

test('suggested effort is a suggestion: no candidates means no estimate', () => {
  const req = requisition();
  assert.equal(suggestedEffortDays(req, [], { settings: {} }).measured, false);
  const withPipeline = suggestedEffortDays(req, [candidate()], { settings: { capacityHoursPerWeek: 40, interviewHoursPerStage: 2 } });
  assert.equal(withPipeline.measured, true);
  assert.equal(withPipeline.hours, 6);
  assert.ok(withPipeline.mostLikely > 0);
});

/* --------------------------------------------------- 4. schema v16 → v17 */

test('schema v16 → v18 adds empty hiring ledgers and conventions without inventing records', () => {
  assert.equal(SCHEMA_VERSION, 56);
  const v16 = {
    schemaVersion: 16,
    settings: { caseReviewDays: 14 },
    people: [{ id: 'p1', name: 'Ada', status: 'active' }],
    goals: [],
  };
  const migrated = migrate(v16);
  assert.deepEqual(migrated.applied, ['16 → 17', '17 → 18', '18 → 19', '19 → 20', '20 → 21', '21 → 22', '22 → 23', '23 → 24', '24 → 25', '25 → 26', '26 → 27', '27 → 28', '28 → 29', '29 → 30', '30 → 31', '31 → 32', '32 → 33', '33 → 34', '34 → 35', '35 → 36', '36 → 37', '37 → 38', '38 → 39', '39 → 40', '40 → 41', '41 → 42', '42 → 43', '43 → 44', '44 → 45', '45 → 46', '46 → 47', '47 → 48', '48 → 49', '49 → 50', '50 → 51', '51 → 52', '52 → 53', '53 → 54', '54 → 55', '55 → 56']);
  assert.equal(migrated.raw.schemaVersion, 56);
  assert.deepEqual(migrated.raw.requisitions, []);
  assert.deepEqual(migrated.raw.candidates, []);
  assert.equal(migrated.raw.settings.hiringBaseRate, 0.45);
  assert.equal(migrated.raw.settings.hiringStallDays, 30);
  assert.equal(migrated.raw.settings.interviewHoursPerStage, 3);
  assert.equal(v16.requisitions, undefined, 'migration must not mutate its input');
});

test('normalization drops unusable hiring records and repairs links honestly', () => {
  const raw = {
    schemaVersion: 17,
    people: [{ id: 'p1', name: 'Ada', status: 'active' }],
    requisitions: [
      { id: 'req-a', title: 'Real role', status: 'nonsense', competencies: [{ name: 'Ships things', weight: 99 }], interviewers: ['p1', 'ghost'], effortDays: { optimistic: 9, mostLikely: 2, pessimistic: 3 } },
      { id: 'req-b', title: '', status: 'open' },
    ],
    candidates: [
      {
        id: 'cand-a', reqId: 'req-a', name: 'Strong candidate', stage: 'interviewing',
        signals: [
          { id: 's1', kind: 'work-sample', rating: 5, competencyId: 'missing', interviewerId: 'ghost', date: '2026-10-10' },
          { id: 's2', kind: 'invented-method', rating: 4 },
          { id: 's3', kind: 'reference', rating: 9 },
        ],
      },
      { id: 'cand-b', reqId: 'req-missing', name: 'Orphan candidate' },
    ],
  };
  const { state, warnings } = normalizeState(raw, { now: NOW });
  assert.equal(state.requisitions.length, 1, 'a requisition without a role title is dropped');
  const req = state.requisitions[0];
  assert.equal(req.status, 'open', 'unknown status repaired to open');
  assert.equal(req.competencies[0].weight, 5, 'competency weight clamped');
  assert.deepEqual(req.interviewers, ['p1'], 'unknown interviewer removed');
  assert.deepEqual(req.effortDays, { optimistic: 2, mostLikely: 3, pessimistic: 9 }, 'PERT triple re-ordered');
  assert.equal(state.candidates.length, 1, 'candidate for a missing requisition is dropped');
  const cand = state.candidates[0];
  assert.equal(cand.signals.length, 1, 'unknown method and out-of-range rating dropped');
  assert.equal(cand.signals[0].competencyId, null);
  assert.equal(cand.signals[0].interviewerId, null);
  assert.ok(warnings.some((w) => w.includes('evidence record')));
  assert.ok(warnings.some((w) => w.includes('requisition')));
});

/* ------------------------------------------------------ 5. action validation */

test('actions: a role needs a title, a competency and ordered effort estimates', () => {
  const { api } = harness();
  assert.equal(api.addRequisition({ title: '' }).ok, false);
  assert.equal(api.addRequisition({ title: 'Role' }).field, 'competencies');
  const unordered = api.addRequisition({
    title: 'Role',
    competencies: 'Ships reliably',
    effortOptimistic: 5,
    effortMostLikely: 2,
  });
  assert.equal(unordered.ok, false);
  assert.equal(unordered.field, 'effortMostLikely');

  const future = api.addRequisition({ title: 'Role', competencies: 'Ships', openedOn: '2027-01-01' });
  assert.equal(future.ok, false);

  const ok = api.addRequisition({
    title: 'Role',
    competencies: 'Ships reliably | 4\nExplains tradeoffs | 2 | optional',
    interviewers: [],
    effortOptimistic: 1,
    effortMostLikely: 3,
    effortPessimistic: 5,
    dailyVacancyCost: 250,
  });
  assert.equal(ok.ok, true);
});

test('actions: evidence must be attributable, in range and not before the application', () => {
  const { store, api } = harness();
  api.addPerson({ name: 'Ada Lovelace', role: 'Staff Engineer', startDate: '2025-01-01' });
  const personId = store.state.people[0].id;
  const req = api.addRequisition({ title: 'Role', competencies: 'Ships reliably', interviewers: [personId] });
  const cand = api.addCandidate({ reqId: req.id, name: 'Sam Rivera', appliedOn: '2026-10-05' });
  assert.equal(cand.ok, true);

  assert.equal(api.recordEvidence(cand.id, { kind: 'invented', rating: 4 }).ok, false);
  assert.equal(api.recordEvidence(cand.id, { kind: 'work-sample', rating: 7 }).ok, false);
  assert.equal(api.recordEvidence(cand.id, { kind: 'work-sample', rating: 4, date: '2026-10-01' }).field, 'date');
  assert.equal(api.recordEvidence(cand.id, { kind: 'work-sample', rating: 4, date: '2027-01-01' }).ok, false);

  const recorded = api.recordEvidence(cand.id, {
    kind: 'work-sample',
    rating: 5,
    date: '2026-10-10',
    interviewerId: personId,
    competencyId: store.state.requisitions[0].competencies[0].id,
    note: 'Built the retry path.',
  });
  assert.equal(recorded.ok, true);
  assert.equal(recorded.assessment.audit.signalCount, 1);
  assert.ok(store.state.events.some((e) => e.type === 'candidate.evidence.recorded'));
});

/* --------------------------------------------------------- 6. RULE-HIRE-01 */

test('RULE-HIRE-01: an open role reserves its recorded interview effort exactly once', () => {
  const { store, api } = harness();
  const res = api.addRequisition({
    title: 'Senior platform engineer',
    competencies: 'Designs resilient boundaries',
    effortOptimistic: 2,
    effortMostLikely: 4,
    effortPessimistic: 7,
    targetStartOn: '2026-12-01',
  });
  assert.equal(res.ok, true);
  assert.equal(res.propagation.ruleId, 'RULE-HIRE-01');
  assert.equal(res.propagation.action, 'created');

  const items = store.state.portfolio.filter((p) => p.sourceType === 'requisition' && p.sourceId === res.id);
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, 'hiring');
  assert.equal(items[0].decision, 'funded', 'committed work, not optional work');
  assert.equal(items[0].value.mostLikely, 0, 'hiring has no invented revenue value');
  assert.deepEqual(items[0].effortDays, { optimistic: 2, mostLikely: 4, pessimistic: 7 });

  const links = linksForEntity(store.state, 'requisition', res.id);
  assert.ok(links.some((l) => l.relation === 'consumes-capacity' && l.peer.type === 'portfolio'));

  // Idempotent: syncing again adds nothing.
  api.syncHiring();
  assert.equal(store.state.portfolio.filter((p) => p.sourceId === res.id).length, 1);

  // A changed estimate refreshes the same item rather than adding a second.
  api.updateRequisition(res.id, { effortOptimistic: 3, effortMostLikely: 6, effortPessimistic: 10 });
  const refreshed = store.state.portfolio.filter((p) => p.sourceId === res.id);
  assert.equal(refreshed.length, 1);
  assert.equal(refreshed[0].effortDays.mostLikely, 6);

  // Cancelling the role releases the capacity.
  api.updateRequisition(res.id, { status: 'cancelled' });
  const released = store.state.portfolio.find((p) => p.sourceId === res.id);
  assert.equal(released.status, 'released');
  assert.equal(released.releasedOn, TODAY);
});

test('RULE-HIRE-01: a role with no estimate reserves nothing, and filling completes the reserve', () => {
  const { store, api } = harness();
  const noEstimate = api.addRequisition({ title: 'Unestimated role', competencies: 'Ships' });
  assert.equal(noEstimate.propagation, null);
  assert.equal(store.state.portfolio.length, 0, 'the plan never invents an estimate');

  const estimated = api.addRequisition({
    title: 'Estimated role',
    competencies: 'Ships',
    effortMostLikely: 5,
    effortOptimistic: 3,
    effortPessimistic: 8,
  });
  api.updateRequisition(estimated.id, { status: 'filled' });
  const item = store.state.portfolio.find((p) => p.sourceId === estimated.id);
  assert.equal(item.status, 'done');
  assert.equal(item.completedOn, TODAY);
  assert.equal(item.releasedOn, null, 'delivered work is completed, not released');
});

/* --------------------------------------------------------- 7. RULE-HIRE-02 */

test('RULE-HIRE-02: accepting an offer creates the roster record, the 30-60-90 plan, the links and frees capacity — once', () => {
  const { store, api } = harness();
  const req = api.addRequisition({
    title: 'Data engineer',
    level: 'senior',
    competencies: 'Models data | 4\nWrites tests | 3',
    effortOptimistic: 2,
    effortMostLikely: 4,
    effortPessimistic: 6,
    targetStartOn: '2026-11-20',
  });
  const requisitionId = req.id;
  const cand = api.addCandidate({ reqId: requisitionId, name: 'Robin Vale', appliedOn: '2026-10-01', stage: 'final' });
  const competencies = store.state.requisitions[0].competencies;

  api.recordEvidence(cand.id, { kind: 'work-sample', rating: 5, competencyId: competencies[0].id, date: '2026-10-10' });
  api.recordEvidence(cand.id, { kind: 'structured-interview', rating: 4, competencyId: competencies[1].id, date: '2026-10-12' });

  const decided = api.decideCandidate(cand.id, { outcome: 'hire', rationale: 'Strong work sample and a clear incident walkthrough.' });
  assert.equal(decided.ok, true);
  assert.equal(decided.stage, 'offer');
  assert.equal(store.state.requisitions[0].status, 'offer');

  const accepted = api.acceptOffer(cand.id, { startOn: '2026-11-20', roleTitle: 'Data engineer', level: 'senior', team: 'Platform' });
  assert.equal(accepted.ok, true);

  const person = store.state.people.find((p) => p.id === accepted.personId);
  assert.ok(person, 'roster record created');
  assert.equal(person.name, 'Robin Vale');
  assert.equal(person.startDate, '2026-11-20');

  const plan = store.state.onboarding.find((p) => p.id === accepted.onboardingId);
  assert.ok(plan, '30-60-90 plan created');
  assert.equal(plan.personId, person.id);
  assert.equal(plan.kind, 'new-hire');
  assert.equal(plan.startDate, '2026-11-20');
  assert.ok(plan.checkpoints.length > 0, 'standard checkpoints are seeded');

  const req2 = store.state.requisitions.find((r) => r.id === requisitionId);
  assert.equal(req2.status, 'filled');
  assert.equal(req2.filledPersonId, person.id);

  const item = store.state.portfolio.find((p) => p.sourceType === 'requisition' && p.sourceId === requisitionId);
  assert.equal(item.status, 'done', 'the interview reserve is delivered, freeing capacity');

  const reqLinks = linksForEntity(store.state, 'requisition', requisitionId);
  assert.ok(reqLinks.some((l) => l.relation === 'hires' && l.peer.type === 'person'));
  const personLinks = linksForEntity(store.state, 'person', person.id);
  assert.ok(personLinks.some((l) => l.relation === 'onboards' && l.peer.type === 'onboarding'));

  assert.ok(store.state.events.some((e) => e.type === 'automation.propagated' && /RULE-HIRE-02/.test(e.summary)));

  // A second acceptance is refused, and the capacity reserve is not double-counted.
  assert.equal(api.acceptOffer(cand.id, { startOn: '2026-11-20' }).ok, false);
  assert.equal(store.state.portfolio.filter((p) => p.sourceId === requisitionId).length, 1);
});

test('accepting an offer for a candidate with no offer decision is refused', () => {
  const { store, api } = harness();
  const req = api.addRequisition({ title: 'Role', competencies: 'Ships' });
  const cand = api.addCandidate({ reqId: req.id, name: 'Sam', appliedOn: '2026-10-01', stage: 'interviewing' });
  const res = api.acceptOffer(cand.id, { startOn: '2026-11-01' });
  assert.equal(res.ok, false);
  assert.equal(store.state.people.length, 0);
});

/* --------------------------------------------------------- 8. RULE-HIRE-03 */

test('RULE-HIRE-03: a stalled role raises exactly one operational case that inherits the whole fan-out', () => {
  const { store, api } = harness();
  api.addPerson({ name: 'Ada Lovelace', role: 'Staff Engineer', startDate: '2025-01-01' });
  const res = api.addRequisition({
    title: 'Stalled role',
    competencies: 'Ships',
    openedOn: '2026-08-01',
    targetStartOn: '2026-09-01',
    effortMostLikely: 3,
    effortOptimistic: 2,
    effortPessimistic: 5,
  });
  assert.equal(res.escalations.length, 1, 'one case raised');
  const { caseId } = res.escalations[0];
  const raised = store.state.cases.find((c) => c.id === caseId);
  assert.ok(raised);
  assert.equal(raised.kind, 'risk');
  assert.match(raised.title, /Stalled hire/);
  assert.ok(raised.fmea.severity >= 1);

  // The case fan-out ran too: the case engine links or creates downstream work.
  const caseLinks = linksForEntity(store.state, 'case', caseId);
  assert.ok(caseLinks.some((l) => l.relation === 'escalates-from'), 'the case is linked back to the requisition');
  assert.ok(store.state.events.some((e) => e.type === 'requisition.escalated'));

  const req = store.state.requisitions[0];
  assert.equal(req.autoEscalated, true);
  assert.equal(req.escalatedCaseId, caseId);

  // Running the sync repeatedly never raises a second case.
  api.syncHiring();
  api.syncHiring();
  assert.equal(store.state.cases.filter((c) => /Stalled hire/.test(c.title)).length, 1);
});

test('stalled detection respects the configured window and ignores closed roles', () => {
  const settings = { hiringStallDays: 30 };
  const state = createEmptyState(NOW.toISOString());
  state.requisitions = [
    requisition({ id: 'r1', openedOn: '2026-10-20', lastActivityOn: '2026-10-20' }),
    requisition({ id: 'r2', openedOn: '2026-08-01', targetStartOn: '2026-09-01' }),
    requisition({ id: 'r3', openedOn: '2026-08-01', status: 'cancelled', closedOn: '2026-09-01' }),
    requisition({ id: 'r4', openedOn: '2026-08-01', autoEscalated: true }),
  ];
  state.settings = { ...state.settings, ...settings };
  state.candidates = [candidate({ id: 'c1', reqId: 'r1', appliedOn: '2026-10-20', lastActivityOn: '2026-10-24' })];
  const stalled = stalledRequisitions(state, { now: NOW, settings: state.settings });
  assert.deepEqual(stalled.map((r) => r.id), ['r2']);
});

/* ---------------------------------------------------- 9. decision gateways */

test('decision gates: an offer needs a final-round assessment and an acknowledged evidence gap', () => {
  const { store, api } = harness();
  const req = api.addRequisition({ title: 'Role', competencies: 'Designs | 4\nExplains | 3' });
  const cand = api.addCandidate({ reqId: req.id, name: 'Alex', appliedOn: '2026-10-01', stage: 'interviewing' });

  const tooEarly = api.decideCandidate(cand.id, { outcome: 'hire', rationale: 'Seems strong to me, honestly.' });
  assert.equal(tooEarly.ok, false, 'cannot make an offer from the interviewing stage');

  api.decideCandidate(cand.id, { outcome: 'advance' });
  assert.equal(store.state.candidates[0].stage, 'final');

  const noRationale = api.decideCandidate(cand.id, { outcome: 'hire', rationale: '' });
  assert.equal(noRationale.field, 'rationale');

  const gated = api.decideCandidate(cand.id, { outcome: 'hire', rationale: 'Impressive conversation, no exercise yet.' });
  assert.equal(gated.ok, false);
  assert.equal(gated.field, 'acknowledgeGaps');

  const acknowledged = api.decideCandidate(cand.id, {
    outcome: 'hire',
    rationale: 'Impressive conversation, no exercise yet.',
    acknowledgeGaps: true,
  });
  assert.equal(acknowledged.ok, true);
  assert.equal(store.state.candidates[0].decision.evidenceGapAcknowledged, true);
  assert.ok(store.state.candidates[0].decision.rationale.length > 10);
});

test('decision gates: a rejection on thinner evidence than the process promised needs acknowledgement', () => {
  const { store, api } = harness();
  const req = api.addRequisition({ title: 'Role', competencies: 'Designs | 4\nExplains | 3' });
  const competencies = store.state.requisitions[0].competencies;
  const strong = api.addCandidate({ reqId: req.id, name: 'Thorough', appliedOn: '2026-10-01', stage: 'final' });
  api.recordEvidence(strong.id, { kind: 'work-sample', rating: 5, competencyId: competencies[0].id, date: '2026-10-05' });
  api.recordEvidence(strong.id, { kind: 'structured-interview', rating: 4, competencyId: competencies[1].id, date: '2026-10-06' });

  const thin = api.addCandidate({ reqId: req.id, name: 'Thin file', appliedOn: '2026-10-01', stage: 'final' });
  const refused = api.decideCandidate(thin.id, { outcome: 'reject', rationale: 'Did not convince the panel in the end.' });
  assert.equal(refused.ok, false);
  assert.equal(refused.field, 'acknowledgeGaps');

  const acknowledged = api.decideCandidate(thin.id, {
    outcome: 'reject',
    rationale: 'Did not convince the panel in the end.',
    acknowledgeGaps: true,
  });
  assert.equal(acknowledged.ok, true);
});

test('a person created from a hire cannot be duplicated by name, and deleting a candidate removes its links', () => {
  const { store, api } = harness();
  api.addPerson({ name: 'Robin Vale', role: 'Engineer', startDate: '2025-01-01' });
  const req = api.addRequisition({ title: 'Role', competencies: 'Ships | 4' });
  const cand = api.addCandidate({ reqId: req.id, name: 'Robin Vale', appliedOn: '2026-10-01', stage: 'final' });
  api.recordEvidence(cand.id, { kind: 'work-sample', rating: 5, competencyId: store.state.requisitions[0].competencies[0].id, date: '2026-10-05' });
  api.decideCandidate(cand.id, { outcome: 'hire', rationale: 'Clear evidence from the work sample.' });
  const dup = api.acceptOffer(cand.id, { startOn: '2026-11-01' });
  assert.equal(dup.ok, false, 'a duplicate roster record is refused');
  assert.equal(store.state.people.length, 1);

  const other = api.addCandidate({ reqId: req.id, name: 'Delete Me', appliedOn: '2026-10-01' });
  assert.equal(api.deleteCandidate(other.id).ok, true);
  assert.equal(store.state.candidates.some((c) => c.name === 'Delete Me'), false);
  assert.equal(api.deleteRequisition(req.id).ok, false, 'a role with candidate history is not silently deleted');
});

/* ----------------------------------------------- 10. signals, CSV and UI */

test('signals: HIRE rules report stalls, missing estimates, gaps and uneven process', () => {
  const { store, api } = harness();
  api.addRequisition({
    title: 'Unestimated role',
    competencies: 'Ships',
    openedOn: '2026-10-01',
  });
  const insights = buildInsights(store.state, NOW);
  const ids = insights.findings.map((f) => f.ruleId);
  assert.ok(ids.includes('HIRE-05'), 'missing interview estimate is reported');

  const { store: store2, api: api2 } = harness();
  api2.addRequisition({
    title: 'Old role',
    competencies: 'Ships',
    openedOn: '2026-08-01',
    targetStartOn: '2026-09-01',
  });
  const insights2 = buildInsights(store2.state, NOW);
  const ids2 = insights2.findings.map((f) => f.ruleId);
  assert.ok(ids2.includes('HIRE-02'), 'stalled role is reported');
  assert.ok(ids2.includes('HIRE-03'), 'target slip is reported');
  assert.ok(insights2.byDomain.some((d) => d.domain === 'Hiring'));
});

test('csv: the hiring scope exports requisitions and candidates with formula safety', () => {
  const { store, api } = harness();
  const req = api.addRequisition({
    title: '=SUM(A1) role',
    competencies: 'Ships | 4',
    effortMostLikely: 3,
    effortOptimistic: 2,
    effortPessimistic: 5,
  });
  api.addCandidate({ reqId: req.id, name: '=HYPERLINK("x")', appliedOn: '2026-10-01' });
  const res = exportWorkspaceCsv(store.state, 'hiring', { now: NOW });
  assert.equal(res.ok, true);
  const parsed = parseCsv(res.csv);
  assert.ok(parsed.headers.includes('evidence_weight'));
  assert.equal(parsed.rows.length >= 2, true, 'one requisition row plus candidate rows');
  for (const row of parsed.rows) {
    for (const cell of row) {
      assert.equal(typeof cell === 'string' && cell.startsWith('='), false, 'no cell may start a spreadsheet formula');
    }
  }
});

test('demo: the workspace shows two live roles, one filled role and a real capacity reserve', () => {
  const state = buildDemoState(NOW);
  const summary = hiringSummary(state, { now: NOW, settings: state.settings });
  assert.equal(summary.summaries.length, 3);
  assert.equal(summary.active.length, 2);
  assert.equal(summary.needsDecision.length, 2, 'Noor and Tomas are at the final stage');
  assert.ok(summary.plannedInterviewDays >= 6, 'the estimated role reserves its effort');
  assert.equal(summary.unmeasuredEffort.length, 1, 'one role deliberately has no estimate');
  assert.ok(summary.vacancyMeasured, 'the role with a recorded daily cost is priced');

  const noor = state.candidates.find((c) => c.name === 'Noor Haddad');
  const noorReq = state.requisitions.find((r) => r.id === noor.reqId);
  const assessment = assessCandidate(noor, noorReq, { prior: state.settings.hiringBaseRate });
  assert.equal(assessment.ready, true, 'Noor has coverage and two methods');
  assert.ok(assessment.coverage.requiredUncovered.length === 0);

  const tomas = state.candidates.find((c) => c.name === 'Tomas Berg');
  const tomasAssessment = assessCandidate(tomas, noorReq, { prior: state.settings.hiringBaseRate });
  assert.equal(tomasAssessment.ready, false, 'Tomas has repeated unstructured evidence only');
  assert.ok(tomasAssessment.blockers.length > 0);
  assert.equal(tomasAssessment.audit.sameRaterOnly, true);

  assert.ok(state.candidates.every((c) => isOpenCandidate(c) || ['rejected', 'withdrawn', 'hired'].includes(c.stage)));
});

/* ------------------------------------------------------------------- UI */

function bootDom() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(e.message);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const dom = new JSDOM(HTML, {
    url: 'https://leados.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  const styleEl = window.document.createElement('style');
  styleEl.textContent = CSS;
  window.document.head.appendChild(styleEl);

  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.KeyboardEvent = window.KeyboardEvent;
  globalThis.FileReader = window.FileReader;
  globalThis.localStorage = window.localStorage;
  return { dom, window, document: window.document, consoleErrors };
}

async function axeViolations(env, selector = '#view') {
  if (!env.window.axe) env.window.eval(AXE_SRC);
  const res = await env.window.axe.run(env.document.querySelector(selector), {
    rules: { 'color-contrast': { enabled: false } },
  });
  return Array.from(res.violations).map((v) => `${v.id}: ${v.help}`);
}

test('ui: #/hiring and the requisition detail render, open dialogs, and pass axe-core', async () => {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ storage: env.window.localStorage, now: () => NOW });
  try {
    app.ctx.loadDemo();
    app.ctx.navigate('#/hiring');
    const view = env.document.querySelector('#view');
    assert.ok(view.textContent.includes('Hiring'));
    assert.ok(view.textContent.includes('Senior platform engineer'));
    assert.ok(view.textContent.includes('Interview effort'));
    assert.ok(view.textContent.includes('RULE-HIRE-01'));
    assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
    assert.deepEqual(await axeViolations(env), []);

    // The detail page shows the candidate table and the evidence maths.
    const req = app.ctx.state.requisitions.find((r) => r.title === 'Senior platform engineer');
    app.ctx.navigate(`#/hiring/${req.id}?candidate=cand-demo-2`);
    assert.ok(env.document.querySelector('#view').textContent.includes('Tomas Berg'));
    assert.ok(env.document.querySelector('#view').textContent.includes('Falsification check'));
    assert.deepEqual(await axeViolations(env), []);

    // Opening the role dialog renders a form and refuses an empty title inline.
    app.ctx.navigate('#/hiring');
    const openButton = [...env.document.querySelectorAll('#view button')].find((b) => b.textContent === 'Open a role');
    assert.ok(openButton, 'the open-a-role action exists');
    openButton.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    const dialog = env.document.querySelector('[role="dialog"]');
    assert.ok(dialog, 'the requisition dialog opened');
    assert.equal((await axeViolations(env, '[role="dialog"]')).length, 0);
    const submit = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Open role');
    submit.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    assert.ok(dialog.textContent.includes('Name the role'), 'blank role is refused inline');
  } finally {
    app.destroy?.();
    env.dom.window.close();
  }
});
