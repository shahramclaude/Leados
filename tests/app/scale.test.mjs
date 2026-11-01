/**
 * tests/app/scale.test.mjs — large-workspace validation.
 *
 * This suite exists because three modules (cases, capacity, hiring) now read
 * each other's records through the same graph, and every one of them is
 * recomputed on render. A workspace that is comfortable in the demo can still
 * be unusable after two years of a real job, and the failure mode is not an
 * exception — it is a screen that takes four seconds to draw or a `#/today`
 * queue that quietly truncates.
 *
 * What is asserted here is *correctness at size* (nothing dropped, nothing
 * duplicated, every edge resolvable, every route renders) plus a generous
 * wall-clock ceiling that would only be crossed by an accidental quadratic
 * pass, not by ordinary machine variance. The measured timings are printed so
 * a regression shows up as a number moving, not just a boolean flipping.
 *
 * Honest limit: this is JSDOM in a container, not a browser. Layout, paint and
 * real DOM cost are not measured, so these numbers say nothing about visual
 * jank on a phone. That remains [UNVERIFIED].
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createEmptyState, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { buildCapacityModel } from '../../app/core/domain/capacity.js';
import { hiringSummary } from '../../app/core/domain/hiring.js';
import { casesRollup } from '../../app/core/domain/cases.js';
import { changesRollup } from '../../app/core/domain/changes.js';
import { negotiationsRollup } from '../../app/core/domain/negotiation.js';
import { delegationSummary } from '../../app/core/domain/delegations.js';
import { exportWorkspaceCsv, CSV_EXPORTS } from '../../app/core/csv.js';
import { dayKey, addDays } from '../../app/core/time.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const NOW = new Date('2026-10-25T10:00:00.000Z');
const TODAY = dayKey(NOW);

const SIZES = {
  people: 120,
  goals: 240,
  cases: 300,
  portfolio: 180,
  requisitions: 40,
  candidates: 320,
  delegations: 160,
  negotiations: 80,
  changes: 60,
  links: 900,
};

function iso(daysAgo, hour = 9) {
  return new Date(`${addDays(TODAY, -daysAgo)}T${String(hour).padStart(2, '0')}:00:00.000Z`).toISOString();
}

/**
 * A workspace deliberately larger than a realistic two-year single-leader
 * workspace: 120 people, 240 goals, 300 cases, 180 funded items, 40 roles and
 * 320 candidates with 4 pieces of evidence each (1,280 observations).
 */
function buildLargeWorkspace() {
  const state = createEmptyState(NOW.toISOString());

  for (let i = 0; i < SIZES.people; i += 1) {
    state.people.push({
      id: `person-scale-${i}`,
      name: `Person ${String(i).padStart(3, '0')}`,
      role: i % 3 === 0 ? 'Engineer' : i % 3 === 1 ? 'Designer' : 'Analyst',
      level: ['ic', 'senior', 'lead'][i % 3],
      startDate: addDays(TODAY, -(200 + (i % 700))),
      managerId: null,
      active: true,
      focus: 'Scale fixture',
      talkingPoints: [],
    });
  }

  for (let i = 0; i < SIZES.goals; i += 1) {
    state.goals.push({
      id: `goal-scale-${i}`,
      personId: `person-scale-${i % SIZES.people}`,
      title: `Goal ${i}`,
      status: i % 9 === 0 ? 'done' : 'active',
      dueOn: addDays(TODAY, (i % 90) - 30),
      createdOn: addDays(TODAY, -(60 + (i % 200))),
      keyResults: [{ id: `kr-${i}-1`, text: 'Move the number', progress: (i * 7) % 100 }],
    });
  }

  for (let i = 0; i < SIZES.cases; i += 1) {
    const closed = i % 4 === 0;
    state.cases.push({
      id: `case-scale-${i}`,
      title: `Operational case ${i}`,
      kind: ['incident', 'risk', 'initiative', 'escalation'][i % 4],
      status: closed ? 'closed' : ['open', 'mitigating', 'monitoring'][i % 3],
      ownerId: `person-scale-${i % SIZES.people}`,
      openedOn: addDays(TODAY, -(i % 120)),
      resolvedOn: closed ? addDays(TODAY, -(i % 60)) : null,
      severity: 1 + (i % 5),
      probability: 1 + ((i * 3) % 5),
      detectability: 1 + ((i * 5) % 5),
      financial: { optimistic: 1000 + i, mostLikely: 5000 + i * 10, pessimistic: 20000 + i * 100 },
      involvedPersonIds: [`person-scale-${i % SIZES.people}`, `person-scale-${(i + 1) % SIZES.people}`],
      rootCauses: [],
      actions: [],
      createdAt: iso(i % 120),
      updatedAt: iso(i % 30),
    });
  }

  for (let i = 0; i < SIZES.portfolio; i += 1) {
    state.portfolio.push({
      id: `pf-scale-${i}`,
      title: `Funded work ${i}`,
      kind: ['project', 'compliance', 'maintenance'][i % 3],
      status: i % 5 === 0 ? 'done' : 'open',
      ownerId: `person-scale-${i % SIZES.people}`,
      sourceType: 'manual',
      effortDays: { optimistic: 2, mostLikely: 4 + (i % 5), pessimistic: 12 },
      value: { optimistic: 1000, mostLikely: 4000 + i, pessimistic: 9000 },
      currency: 'USD',
      decision: 'funded',
      decisionOn: addDays(TODAY, -(i % 60)),
      targetOn: addDays(TODAY, (i % 40) - 10),
      createdOn: addDays(TODAY, -(i % 90)),
      completedOn: i % 5 === 0 ? addDays(TODAY, -(i % 20)) : null,
      createdAt: iso(i % 90),
      updatedAt: iso(i % 20),
    });
  }

  for (let i = 0; i < SIZES.requisitions; i += 1) {
    const filled = i % 8 === 0;
    state.requisitions.push({
      id: `req-scale-${i}`,
      title: `Role ${i}`,
      team: 'Scale',
      level: 'senior',
      reason: 'growth',
      status: filled ? 'filled' : 'open',
      openedOn: addDays(TODAY, -(50 + (i % 100))),
      targetStartOn: addDays(TODAY, (i % 40) - 15),
      closedOn: filled ? addDays(TODAY, -(i % 20)) : null,
      competencies: [
        { id: `cmp-${i}-a`, name: 'Judgement under ambiguity', weight: 4, required: true },
        { id: `cmp-${i}-b`, name: 'Delivery through others', weight: 3, required: true },
      ],
      interviewers: [],
      effortDays: { optimistic: 2, mostLikely: 5, pessimistic: 9 },
      dailyVacancyCost: i % 3 === 0 ? 400 : null,
      currency: 'USD',
      autoEscalated: false,
      createdAt: iso(100),
      updatedAt: iso(10),
    });
  }

  const kinds = ['structured-interview', 'job-knowledge', 'work-sample', 'unstructured-interview'];
  for (let i = 0; i < SIZES.candidates; i += 1) {
    const reqIdx = i % SIZES.requisitions;
    const signals = [];
    for (let s = 0; s < 4; s += 1) {
      signals.push({
        id: `sig-scale-${i}-${s}`,
        kind: kinds[(i + s) % kinds.length],
        competencyId: `cmp-${reqIdx}-${s % 2 === 0 ? 'a' : 'b'}`,
        rating: 1 + ((i + s) % 5),
        interviewerId: `person-scale-${(i + s) % SIZES.people}`,
        date: addDays(TODAY, -(5 + s * 3)),
        note: 'Scale fixture observation.',
      });
    }
    const settled = i % 3 === 0;
    state.candidates.push({
      id: `cand-scale-${i}`,
      reqId: `req-scale-${reqIdx}`,
      name: `Candidate ${String(i).padStart(3, '0')}`,
      stage: settled ? 'rejected' : ['sourced', 'screening', 'interviewing', 'final', 'offer'][i % 5],
      appliedOn: addDays(TODAY, -(30 + (i % 200))),
      lastActivityOn: addDays(TODAY, settled ? -(20 + (i % 400)) : -(i % 10)),
      source: 'Scale fixture',
      signals,
      decision: settled
        ? { outcome: 'reject', decidedOn: addDays(TODAY, -(20 + (i % 400))), rationale: 'Below the bar on judgement.', evidenceGapAcknowledged: false }
        : { outcome: 'pending', decidedOn: null, rationale: '', evidenceGapAcknowledged: false },
      offerOn: null,
      offerAcceptedOn: null,
      hiredOn: null,
      startOn: null,
      personId: null,
      keepInTouch: i % 37 === 0,
      createdAt: iso(30),
      updatedAt: iso(5),
    });
  }

  // Delegations (including returned → recovered chains)
  for (let i = 0; i < SIZES.delegations; i += 1) {
    const isReturnedFirst = i % 4 === 0 && i + 1 < SIZES.delegations;
    const isRecoveredSecond = i % 4 === 1;
    const isDone = !isReturnedFirst && !isRecoveredSecond && i % 5 === 0;
    state.delegations.push({
      id: `del-scale-${i}`,
      personId: `person-scale-${i % SIZES.people}`,
      title: `Delegation ${String(i).padStart(3, '0')}`,
      expectedOutcome: `Measurable outcome ${i}.`,
      authority: ['act-inform', 'recommend', 'agree', 'own'][i % 4],
      support: 'Scale fixture support context.',
      delegatedOn: addDays(TODAY, -(20 + (i % 30))),
      dueOn: addDays(TODAY, (i % 25) - 5),
      status: isReturnedFirst ? 'returned' : isDone ? 'done' : 'active',
      checkins: [
        { id: `chk-scale-${i}`, date: addDays(TODAY, -10), progress: 'on-track', note: 'Checkpoint.' },
      ],
      completedOn: isDone ? addDays(TODAY, -2) : null,
      completionNote: isDone ? 'Delivered.' : '',
      returnedOn: isReturnedFirst ? addDays(TODAY, -8) : null,
      returnReason: isReturnedFirst ? 'Scope dependency shifted during execution.' : '',
      priorDelegationId: isRecoveredSecond ? `del-scale-${i - 1}` : null,
      supersededByDelegationId: isReturnedFirst ? `del-scale-${i + 1}` : null,
      recoveredOn: isReturnedFirst ? addDays(TODAY, -7) : null,
      recoveryNote: isRecoveredSecond ? 'Re-scoped with air-cover and dedicated bandwidth.' : '',
      sourceNegotiationId: i < SIZES.negotiations ? `neg-scale-${i}` : null,
      sourceTermId: i < SIZES.negotiations ? `term-scale-${i}` : null,
      createdAt: iso(25),
      updatedAt: iso(3),
    });
  }

  // Negotiations (spanning preparing, active, agreed, settled, and impasse)
  const negStatuses = ['preparing', 'scheduled', 'active', 'agreed', 'impasse'];
  const negKinds = ['vendor-contract', 'salary-offer', 'internal-resource', 'scope-deadline', 'partnership', 'other'];
  for (let i = 0; i < SIZES.negotiations; i += 1) {
    const status = negStatuses[i % negStatuses.length];
    const isAgreed = status === 'agreed';
    state.negotiations.push({
      id: `neg-scale-${i}`,
      kind: negKinds[i % negKinds.length],
      status,
      title: `Negotiation ${String(i).padStart(3, '0')}`,
      counterparty: `Counterparty ${i}`,
      counterpartyRole: 'VP Platform',
      ownerId: `person-scale-${i % SIZES.people}`,
      linkedGoalId: `goal-scale-${i % SIZES.goals}`,
      sourceType: 'case',
      sourceId: `case-scale-${i % SIZES.cases}`,
      openedOn: addDays(TODAY, -(25 + (i % 20))),
      nextSessionOn: isAgreed ? null : addDays(TODAY, (i % 14) - 3),
      reviewOn: isAgreed ? addDays(TODAY, 30) : null,
      closedOn: isAgreed || status === 'impasse' ? addDays(TODAY, -4) : null,
      strategic: i % 3 === 0,
      stakesCurrency: 'USD',
      stakesValue: 20_000 + (i * 1_500),
      ourBatnaDescription: 'Fallback internal runbook.',
      ourBatnaValue: 18_000 + (i * 1_000),
      ourBatnaUnit: 'USD',
      theirBatnaEstimate: 'Status quo renewal.',
      theirBatnaConfidence: 'medium',
      ourInterests: ['Predictable SLA', 'Unit cost discipline'],
      theirInterests: ['Multi-quarter commitment'],
      objectiveCriteria: ['Published market benchmark'],
      issues: [
        {
          id: `iss-scale-${i}`,
          name: 'Annual fee',
          unit: 'USD',
          direction: 'minimize',
          weight: 3,
          ourTarget: 20_000,
          ourReservation: 26_000,
          theirReservation: 22_000,
          theirTarget: 25_000,
          theirConfidence: 'medium',
        },
      ],
      options: ['Phased commitment'],
      agreedTerms: isAgreed
        ? [
            {
              id: `term-scale-${i}`,
              text: `Deliver milestone ${i}`,
              issueId: `iss-scale-${i}`,
              agreedValue: 21_500,
              settledValue: i % 2 === 0 ? 21_500 : null,
              unit: 'USD',
              ownerId: `person-scale-${i % SIZES.people}`,
              dueOn: addDays(TODAY, 14),
              priorOwners: [],
            },
          ]
        : [],
      settlement: isAgreed && i % 2 === 0
        ? {
            settledOn: addDays(TODAY, -1),
            realisedValue: 20_000 + (i * 1_450),
            counterpartyDelivered: true,
            note: 'Verified against invoice and SLA report.',
          }
        : null,
      outcomeSummary: isAgreed ? 'Signed within ZOPA.' : '',
      impasseReason: status === 'impasse' ? 'Reservation bands did not overlap.' : '',
      escalationCaseId: status === 'impasse' ? `case-scale-${i % SIZES.cases}` : null,
      notes: 'Scale fixture negotiation.',
      createdAt: iso(25),
      updatedAt: iso(2),
    });
  }

  // Organizational changes (Kotter / Lewin / ADKAR / Beckhard-Harris)
  const changeStatuses = ['proposed', 'active', 'stabilising', 'anchored', 'paused'];
  const changeKinds = ['topology', 'process', 'charter', 'reporting-line', 'operating-model'];
  for (let i = 0; i < SIZES.changes; i += 1) {
    const status = changeStatuses[i % changeStatuses.length];
    state.changes.push({
      id: `chg-scale-${i}`,
      title: `Change Initiative ${String(i).padStart(3, '0')}`,
      kind: changeKinds[i % changeKinds.length],
      status,
      ownerId: `person-scale-${i % SIZES.people}`,
      linkedGoalId: `goal-scale-${i % SIZES.goals}`,
      vision: `Establish measurable capability ${i}.`,
      summary: 'Scale fixture change.',
      openedOn: addDays(TODAY, -30),
      targetOn: addDays(TODAY, 30),
      anchoredOn: status === 'anchored' ? addDays(TODAY, -2) : null,
      createdAt: iso(30),
      updatedAt: iso(3),
    });
  }

  // Edges that must all resolve: case → goal, case → person (coaching), and
  // candidate → requisition. A broken id here is exactly what a large
  // workspace accumulates and what normalization has to survive.
  const relations = [
    { sourceType: 'case', targetType: 'goal', relation: 'impacts-goal', pick: (i) => [`case-scale-${i % SIZES.cases}`, `goal-scale-${i % SIZES.goals}`] },
    { sourceType: 'case', targetType: 'person', relation: 'coaches', pick: (i) => [`case-scale-${i % SIZES.cases}`, `person-scale-${i % SIZES.people}`] },
    { sourceType: 'candidate', targetType: 'requisition', relation: 'assessed-for', pick: (i) => [`cand-scale-${i % SIZES.candidates}`, `req-scale-${i % SIZES.requisitions}`] },
  ];
  for (let i = 0; i < SIZES.links; i += 1) {
    const spec = relations[i % relations.length];
    const [sourceId, targetId] = spec.pick(i);
    state.links.push({
      id: `lnk-scale-${i}`,
      sourceType: spec.sourceType,
      sourceId,
      targetType: spec.targetType,
      targetId,
      relation: spec.relation,
      createdAt: iso(i % 60),
    });
  }

  return state;
}

/** The edge keys the fixture actually contains, so the assertion is about preservation, not arithmetic. */
function uniqueEdgeKeys(state) {
  return new Set((state.links || []).map((l) => `${l.sourceType}:${l.sourceId}|${l.relation}|${l.targetType}:${l.targetId}`));
}

function timeIt(label, fn) {
  const t0 = performance.now();
  const value = fn();
  const ms = performance.now() - t0;
  // Printed so a regression is visible as a number, not just a red test.
  console.log(`  [scale] ${label}: ${ms.toFixed(0)}ms`);
  return { value, ms };
}

let cached;
function largeWorkspace() {
  if (!cached) {
    const raw = buildLargeWorkspace();
    cached = normalizeState(raw, { now: NOW });
    cached.expectedEdges = uniqueEdgeKeys(raw).size;
  }
  return cached;
}

/* ------------------------------------------------------------- integrity */

test('scale: normalization keeps every record and every resolvable edge, and repairs rather than rejects', () => {
  const { value: normalization, ms } = timeIt('normalizeState (large workspace)', () => largeWorkspace());
  const { state, warnings } = normalization;

  assert.equal(state.people.length, SIZES.people);
  assert.equal(state.goals.length, SIZES.goals);
  assert.equal(state.cases.length, SIZES.cases);
  assert.equal(state.portfolio.length, SIZES.portfolio);
  assert.equal(state.requisitions.length, SIZES.requisitions);
  assert.equal(state.candidates.length, SIZES.candidates);
  assert.equal(state.delegations.length, SIZES.delegations);
  assert.equal(state.negotiations.length, SIZES.negotiations);
  assert.equal(state.changes.length, SIZES.changes);
  assert.equal(state.schemaVersion, SCHEMA_VERSION);

  const expectedEdges = largeWorkspace().expectedEdges;
  assert.equal(
    state.links.length,
    expectedEdges,
    `expected ${expectedEdges} distinct edges to survive normalization, got ${state.links.length}`,
  );
  const unrelatedWarnings = warnings.filter((w) => !/Portfolio/.test(w));
  assert.deepEqual(unrelatedWarnings, [], 'normalization repaired nothing outside the fixture\'s own vocabulary mistakes');

  // Referential integrity: an edge that points at nothing is a dangling promise
  // in the UI ("Linked case: —"), so normalization must have removed none and
  // invented none.
  const idSets = {
    person: new Set(state.people.map((p) => p.id)),
    goal: new Set(state.goals.map((g) => g.id)),
    case: new Set(state.cases.map((c) => c.id)),
    requisition: new Set(state.requisitions.map((r) => r.id)),
    candidate: new Set(state.candidates.map((c) => c.id)),
    portfolio: new Set(state.portfolio.map((p) => p.id)),
  };
  const dangling = state.links.filter((l) => !idSets[l.sourceType]?.has(l.sourceId) || !idSets[l.targetType]?.has(l.targetId));
  assert.deepEqual(dangling, [], 'every edge resolves at both ends');

  const edgeKeys = state.links.map((l) => `${l.sourceType}:${l.sourceId}|${l.relation}|${l.targetType}:${l.targetId}`);
  assert.equal(new Set(edgeKeys).size, edgeKeys.length, 'no duplicate edges were created by normalization');

  assert.ok(ms < 15_000, `normalization took ${ms.toFixed(0)}ms; that is slow enough to suggest an accidental quadratic pass`);
});

test('scale: a second normalization is a no-op, so reloading a large workspace cannot drift', () => {
  const once = largeWorkspace().state;
  const twice = normalizeState(JSON.parse(JSON.stringify(once)), { now: NOW }).state;
  assert.equal(JSON.stringify(twice.cases), JSON.stringify(once.cases));
  assert.equal(JSON.stringify(twice.candidates), JSON.stringify(once.candidates));
  assert.equal(twice.links.length, once.links.length);
});

/* ------------------------------------------------------- derived analysis */

test('scale: cases, capacity, hiring and insights all build at size, with arithmetic that still adds up', () => {
  const state = largeWorkspace().state;

  const { value: rollup } = timeIt('casesRollup', () => casesRollup(state, { now: NOW }));
  assert.equal(rollup.all.length, SIZES.cases);
  assert.equal(rollup.open.length + rollup.resolved.length, SIZES.cases, 'every case is either open or resolved');
  assert.ok(rollup.expectedExposure > 0, 'open cases carry financial exposure');

  const { value: capacity } = timeIt('buildCapacityModel', () => buildCapacityModel(state, { now: NOW }));
  assert.ok(capacity, 'capacity model returns a summary');
  assert.equal(capacity.supply.activeCount, SIZES.people, 'every active person is counted as supply');
  assert.ok(capacity.supply.availableDays > 0);
  assert.equal(capacity.demand.items.length, SIZES.portfolio, 'every funded item is demand');

  const { value: hiring } = timeIt('hiringSummary', () => hiringSummary(state, { now: NOW }));
  assert.equal(hiring.summaries.length, SIZES.requisitions);
  const candidatesSeen = hiring.summaries.reduce((sum, row) => sum + row.candidates.length, 0);
  assert.equal(candidatesSeen, SIZES.candidates, 'every candidate belongs to exactly one role');
  assert.ok(hiring.retention.enabled);
  assert.ok(hiring.retention.count > 0, 'the scale fixture contains records past the retention window');
  for (const row of hiring.summaries) {
    for (const { assessment } of row.assessments) {
      assert.ok(assessment.audit.posterior >= 0 && assessment.audit.posterior <= 1, 'every posterior is a probability');
      assert.ok(Number.isFinite(assessment.audit.totalWeight));
    }
  }

  const { value: delSummary } = timeIt('delegationSummary', () => delegationSummary(state, NOW));
  assert.equal(delSummary.active + delSummary.done + delSummary.returned, SIZES.delegations);
  assert.ok(delSummary.recoveredReturned > 0, 'scale fixture exercises returned → recovered delegation chains');

  const { value: negRollup } = timeIt('negotiationsRollup', () => negotiationsRollup(state, NOW));
  assert.equal(negRollup.all.length, SIZES.negotiations);
  assert.ok(negRollup.open.length > 0);
  assert.ok(negRollup.impasses.length > 0);

  const { value: chgRollup } = timeIt('changesRollup', () => changesRollup(state, { now: NOW }));
  assert.equal(chgRollup.all.length, SIZES.changes);

  const { value: insights } = timeIt('buildInsights', () => buildInsights(state, NOW));
  assert.ok(insights.findings.length > 0);
  assert.equal(
    insights.byDomain.reduce((sum, row) => sum + row.count, 0),
    insights.findings.length,
    'the domain roll-up agrees with the finding list',
  );
  // A stale-item pile-up must not become an unreadable wall: duplicates are
  // still grouped by domain, which is what the Today queue relies on.
  // 25 after Schema v60 ('War games') + Schema v65 ('Leadership parity').
  // 26 after Schema v71 ('Credibility'): the large workspace's delegation
  // authority classes genuinely diverge (0/40 vs 7/15 on time, I² ≈ 88%), so
  // the exchangeability screen raises one real severity-2 finding there.
  // The bound is the guard (a pile-up must stay grouped, not become a wall of
  // domains), not an exact count, so it moves with each new bucket rather than
  // being pinned.
  assert.ok(insights.byDomain.length <= 26);
});

test('scale: every CSV scope exports and parses back at size, including the hiring scope', () => {
  const state = largeWorkspace().state;
  assert.equal(CSV_EXPORTS.length, 64);
  for (const scope of CSV_EXPORTS) {
    const { value: result } = timeIt(`csv:${scope.key}`, () => exportWorkspaceCsv(state, scope.key, { now: NOW }));
    assert.equal(result.ok, true, `${scope.key} failed: ${result.error || ''}`);
    assert.ok(typeof result.csv === 'string' && result.csv.length > 0);
    assert.ok(result.csv.split('\n')[0].length > 0, `${scope.key} has a header row`);
    assert.ok(result.columnCount >= 2, `${scope.key} has at least two columns`);
  }
  const hiring = exportWorkspaceCsv(state, 'hiring', { now: NOW });
  // The hiring scope is one row per role plus one row per candidate, separated
  // by `record_type`, so the export stays useful for both questions.
  assert.equal(hiring.rowCount, SIZES.requisitions + SIZES.candidates);
  assert.equal(hiring.csv.split('\n').filter((line) => line.startsWith('requisition,')).length, SIZES.requisitions);
  assert.equal(hiring.csv.split('\n').filter((line) => line.startsWith('candidate,')).length, SIZES.candidates);
  assert.equal(hiring.sensitive, true);
});

test('scale: the hiring summaries stay linear when roles and candidates both grow (no O(roles × candidates) pass)', () => {
  // 300 roles × 5,000 candidates is beyond any single leader's workspace on
  // purpose: it is the shape that exposes a full candidate scan inside the
  // per-role loop. The cost of that pattern grows as the product of two lists
  // that both get bigger every year.
  const now = NOW;
  const state = createEmptyState(now.toISOString());
  for (let i = 0; i < 30; i += 1) {
    state.people.push({ id: `person-x-${i}`, name: `Interviewer ${i}`, role: 'Engineer', level: 'senior', startDate: '2024-01-01', active: true });
  }
  const ROLES = 300;
  const CANDS = 5000;
  for (let r = 0; r < ROLES; r += 1) {
    state.requisitions.push({
      id: `req-x-${r}`,
      title: `Role ${r}`,
      status: 'open',
      openedOn: '2026-06-01',
      targetStartOn: '2026-12-01',
      competencies: [{ id: `cmp-x-${r}`, name: 'Judgement', weight: 3, required: true }],
      interviewers: [],
      effortDays: { optimistic: 1, mostLikely: 3, pessimistic: 5 },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }
  for (let c = 0; c < CANDS; c += 1) {
    const roleIdx = c % ROLES;
    state.candidates.push({
      id: `cand-x-${c}`,
      reqId: `req-x-${roleIdx}`,
      name: `Candidate ${c}`,
      stage: 'interviewing',
      appliedOn: '2026-09-01',
      lastActivityOn: '2026-10-20',
      signals: [0, 1, 2, 3].map((s) => ({
        id: `sig-x-${c}-${s}`,
        kind: 'structured-interview',
        competencyId: `cmp-x-${roleIdx}`,
        rating: 1 + ((c + s) % 5),
        interviewerId: `person-x-${(c + s) % 30}`,
        date: '2026-10-01',
        note: '',
      })),
      decision: { outcome: 'pending', decidedOn: null, rationale: '', evidenceGapAcknowledged: false },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }

  const { value: summary, ms } = timeIt('hiringSummary (300 roles × 5,000 candidates)', () => hiringSummary(state, { now }));
  assert.equal(summary.summaries.length, ROLES);
  assert.equal(summary.summaries.reduce((n, row) => n + row.candidates.length, 0), CANDS);
  assert.equal(summary.openCandidates, CANDS);
  assert.ok(ms < 4000, `hiringSummary took ${ms.toFixed(0)}ms at the stress ratio; that is the quadratic pass coming back`);
});
