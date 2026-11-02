/**
 * tests/app/evidence-supply.test.mjs — Schema v79, ADR-0071.
 *
 * The claims this suite makes, in order:
 *  1. The migration is additive and invents nothing.
 *  2. The predictive is the negative binomial it claims to be: S(0) = 1, exact
 *     closed-form agreement for n = 0, monotone in t, ordered quantiles, and an
 *     expected wait that does not exist below one observed unit.
 *  3. Every line's units are real dated records, and the shortfall is measured
 *     against the declared floor — never against an assumed one.
 *  4. The five verdicts fire on the states they name and stay silent otherwise.
 *  5. The constraint is chosen by pressure, and only called binding above the
 *     leader's declared share.
 *  6. The schedule respects the hour budget, prints a genuine upper bound, and
 *     refuses to buy evidence no open record is waiting for.
 *  7. A frozen plan carries exactly one probability, the assumption-free bound
 *     is never above the independence value, and a plan with no members refuses
 *     to freeze.
 *  8. A plan grades once, only after its window, and a closed window that
 *     cleared nothing is graded rather than excused.
 *  9. RULE-SUP-01 opens capped capture tasks and writes real edges to the open
 *     records the plan would unblock.
 * 10. RULE-SUP-02 opens one capacity decision per ISO week.
 * 11. RULE-SUP-03 opens retirement tasks; RULE-SUP-04 announces a floor reached
 *     once per line, ever; RULE-SUP-05 queues grading work.
 * 12. Automatic propagation is pausable; an explicit scan always runs.
 * 13. Signals fire for the states they name.
 * 14. The entity type, relations and the post-commit registration exist.
 * 15. CSV scope #69 exports aggregates only — no id, no title, no person.
 * 16. The demo seeds one plan and grades it out of sample.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MIGRATIONS,
  SCHEMA_VERSION,
  createEmptyState,
  migrate,
  normalizeState,
} from '../../app/core/schema.js';
import {
  buildLine,
  buildSupplyPlan,
  expectedWeeksToFill,
  gradeSupplyPlan,
  harvestLine,
  planPreview,
  supplyAttentionCount,
  supplyBrief,
  supplyConventions,
  supplyReport,
  supplySignals,
  timeToFillQuantile,
  timeToFillSurvival,
} from '../../app/core/domain/supply.js';
import { supplyRule, SUPPLY_EVENTS, SUPPLY_RULE_IDS } from '../../app/core/domain/supplyRules.js';
import {
  SUPPLY_LIMITS,
  SUPPLY_LINES,
  SUPPLY_VERDICTS,
} from '../../app/core/domain/supplyRegistry.js';
import { normalizeSupplyPlans, normalizeSupplySettings } from '../../app/core/domain/supplySchema.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { LINK_ENTITY_TYPES, LINK_RELATIONS, LINK_RELATION_LABELS, resolveLinkedEntity } from '../../app/core/domain/cases.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { buildDemoState } from '../../app/core/demo.js';

const NOW = new Date('2027-06-30T00:00:00.000Z');
const TODAY = '2027-06-30';
const day = (offset) => new Date(Date.UTC(2026, 0, 1) + offset * 86400000).toISOString().slice(0, 10);
const ago = (days) => new Date(NOW.getTime() - days * 86400000).toISOString().slice(0, 10);
const clone = (v) => JSON.parse(JSON.stringify(v));

/* ------------------------------------------------------------------ */
/* 1. Schema                                                          */
/* ------------------------------------------------------------------ */

test('schema v79 is additive and invents no plan, task or grade', () => {
  assert.equal(SCHEMA_VERSION, 79);
  const v78 = { ...createEmptyState(NOW.toISOString()), schemaVersion: 78 };
  delete v78.supplyPlans;
  delete v78.supplyMarkers;
  const migrated = migrate(v78);
  assert.equal(migrated.applied.at(-1), '78 → 79');
  assert.deepEqual(migrated.raw.supplyPlans, []);
  assert.deepEqual(migrated.raw.supplyMarkers, []);
  const normalized = normalizeState(migrated.raw, { now: NOW });
  assert.equal(normalized.state.schemaVersion, 79);
  assert.deepEqual(normalized.state.supplyPlans, []);
});

test('a frozen plan with no probability is dropped rather than back-filled', () => {
  const warnings = [];
  const plans = normalizeSupplyPlans([
    { id: 'sp1', frozenAt: NOW.toISOString(), reviewOn: '2027-08-01', members: [] },
    {
      id: 'sp2',
      frozenAt: NOW.toISOString(),
      reviewOn: '2027-08-01',
      predictedAnyClearPct: 40,
      members: [{ line: 'premise-outcome', verdict: 'starved', required: 8, observedN: 3 }],
    },
  ], warnings);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].id, 'sp2');
  assert.match(warnings.join(' '), /probability-free/);
});

test('supply conventions are clamped inside printed ranges and never disable a line', () => {
  const settings = normalizeSupplySettings({
    supplyWindowDays: 0,
    supplyHorizonDays: -5,
    supplyStarvePct: 0,
    supplyWeeklyHours: -3,
    supplyMinutesPerUnit: { 'premise-outcome': 0, unknown: 10 },
  });
  assert.ok(settings.supplyWindowDays >= SUPPLY_LIMITS.windowDays[0]);
  assert.ok(settings.supplyHorizonDays >= SUPPLY_LIMITS.horizonDays[0]);
  assert.ok(settings.supplyStarvePct >= SUPPLY_LIMITS.starvePct[0]);
  assert.ok(settings.supplyWeeklyHours >= SUPPLY_LIMITS.weeklyHours[0]);
  assert.equal(settings.supplyMinutesPerUnit['premise-outcome'], SUPPLY_LIMITS.minutesMin);
  assert.equal('unknown' in settings.supplyMinutesPerUnit, false);
  for (const line of SUPPLY_LINES) {
    assert.ok(Number.isFinite(settings.supplyRequired[line.key]), 'every line gets a floor');
  }
});

/* ------------------------------------------------------------------ */
/* 2. The predictive                                                  */
/* ------------------------------------------------------------------ */

test('the predictive is a negative binomial with the anchors it claims', () => {
  const base = { windowWeeks: 26, k: 3 };
  assert.equal(timeToFillSurvival({ ...base, n: 4, tWeeks: 0 }), 1, 'no time, no arrivals');
  // With no unit ever observed, r = 1/2 and the k = 1 survival is exactly sqrt(p).
  const p = 26 / (26 + 10);
  assert.ok(Math.abs(timeToFillSurvival({ n: 0, windowWeeks: 26, k: 1, tWeeks: 10 }) - Math.sqrt(p)) < 1e-12);
  // Monotone decreasing in t.
  let previous = 1.0000001;
  for (let t = 0; t <= 120; t += 1) {
    const s = timeToFillSurvival({ ...base, n: 6, tWeeks: t });
    assert.ok(s <= previous + 1e-12, `survival must not rise at t=${t}`);
    previous = s;
  }
  // More time never reduces the chance of filling, and more history never hurts.
  assert.ok(timeToFillSurvival({ ...base, n: 6, tWeeks: 4 }) > timeToFillSurvival({ ...base, n: 6, tWeeks: 40 }));
  assert.ok(timeToFillSurvival({ ...base, n: 12, tWeeks: 8 }) < timeToFillSurvival({ ...base, n: 2, tWeeks: 8 }));
});

test('quantiles are ordered and the expected wait is refused when it does not exist', () => {
  const args = { windowWeeks: 26, k: 4 };
  const q10 = timeToFillQuantile({ ...args, n: 5, q: 0.1 });
  const q50 = timeToFillQuantile({ ...args, n: 5, q: 0.5 });
  const q90 = timeToFillQuantile({ ...args, n: 5, q: 0.9 });
  assert.ok(q10 <= q50 && q50 <= q90, `${q10} <= ${q50} <= ${q90}`);
  assert.equal(expectedWeeksToFill({ n: 0, windowWeeks: 26, k: 4 }), null,
    'E[T] does not exist below one observed unit');
  // r = n + 1/2, so E[T_k] = W·k/(r − 1) exactly.
  assert.equal(expectedWeeksToFill({ n: 2, windowWeeks: 26, k: 4 }), Math.round((26 * 4 / 1.5) * 100) / 100);
});

/* ------------------------------------------------------------------ */
/* 3. Harvest and verdicts                                             */
/* ------------------------------------------------------------------ */

function fixture(overrides = {}) {
  const state = {
    ...createEmptyState(NOW.toISOString()),
    people: [
      { id: 'lead', name: 'Lead', status: 'active', managerId: null },
      { id: 'a', name: 'A', status: 'active', managerId: 'lead' },
      { id: 'b', name: 'B', status: 'active', managerId: 'lead' },
    ],
    delegations: [],
    decisions: [],
    cases: [],
    premises: [],
    premiseOutcomes: [],
    reviews: [],
    ...overrides,
  };
  return state;
}

test('every unit is a real dated record and the shortfall is measured against the declared floor', () => {
  const state = fixture({
    premiseOutcomes: [
      { id: 'po1', premiseId: 'p1', verdict: 'held', settledOn: ago(30) },
      { id: 'po2', premiseId: 'p2', verdict: 'failed', settledOn: ago(60) },
      { id: 'po3', premiseId: 'p3', verdict: 'inconclusive', settledOn: ago(40) },
    ],
    premises: [
      { id: 'p1', title: 'P1', createdAt: `${ago(100)}T00:00:00.000Z` },
      { id: 'p2', title: 'P2', createdAt: `${ago(120)}T00:00:00.000Z` },
      { id: 'p3', title: 'P3', createdAt: `${ago(140)}T00:00:00.000Z` },
      { id: 'p4', title: 'P4', createdAt: `${ago(160)}T00:00:00.000Z` },
    ],
  });
  const conventions = supplyConventions({});
  const harvest = harvestLine('premise-outcome', state, TODAY, conventions);
  assert.equal(harvest.n, 2, 'inconclusive settlements are not concluded units');
  const line = buildLine('premise-outcome', state, TODAY, conventions);
  assert.equal(line.required, conventions.supplyRequired['premise-outcome']);
  assert.equal(line.shortfall, Math.max(0, line.required - 2));
  // An inconclusive settlement leaves its premise unsettled, so BOTH p3 and p4
  // are still open demand — a frozen-on-`inconclusive` premise is not settled.
  assert.equal(line.demandCount, 2);
  assert.deepEqual(line.demandItems.map((item) => item.id).sort(), ['p3', 'p4']);
  assert.ok(line.demandItems.every((item) => item.type === 'premise'));
});

test('the verdicts fire on the states they name', () => {
  const conventions = supplyConventions({});
  const settledEnough = fixture({
    premiseOutcomes: Array.from({ length: 12 }, (_, i) => ({
      id: `po${i}`, premiseId: `p${i}`, verdict: 'held', settledOn: ago(10 + i * 5),
    })),
    premises: Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, title: `P${i}`, createdAt: `${ago(200)}T00:00:00.000Z` })),
  });
  const met = buildLine('premise-outcome', settledEnough, TODAY, conventions);
  assert.equal(met.verdict, 'met');
  assert.equal(met.pClearBeforeHorizonPct, 100);

  const unobserved = buildLine('premise-outcome', fixture(), TODAY, conventions);
  assert.equal(unobserved.verdict, 'unobserved');
  assert.equal(unobserved.arrivalPerWeek, 0);
  assert.equal(unobserved.medianEtaWeeks, null, 'a line that never produced has no median wait to quote as fact');
  assert.equal(unobserved.etaLoWeeks, null);
  assert.equal(unobserved.etaHiWeeks, null);
  assert.equal(unobserved.expectedWeeks, null);

  const filling = buildLine('premise-outcome', fixture({
    premiseOutcomes: Array.from({ length: 7 }, (_, i) => ({
      id: `po${i}`, premiseId: `p${i}`, verdict: 'held', settledOn: ago(5 + i * 10),
    })),
    premises: Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, title: `P${i}`, createdAt: `${ago(250)}T00:00:00.000Z` })),
  }), TODAY, conventions);
  assert.equal(filling.verdict, 'filling');
  assert.ok(filling.pClearBeforeHorizonPct >= conventions.supplyStarvePct);

  // Starved: four units in six months, an old open premise, short of the floor.
  const starved = buildLine('premise-outcome', fixture({
    premiseOutcomes: Array.from({ length: 2 }, (_, i) => ({
      id: `po${i}`, premiseId: `p${i}`, verdict: 'held', settledOn: ago(100 + i * 10),
    })),
    premises: [
      { id: 'p0', title: 'P0', createdAt: `${ago(200)}T00:00:00.000Z` },
      { id: 'p1', title: 'P1', createdAt: `${ago(200)}T00:00:00.000Z` },
      { id: 'p2', title: 'P2', createdAt: `${ago(30)}T00:00:00.000Z` },
    ],
  }), TODAY, conventions);
  assert.equal(starved.verdict, 'starved');
  assert.ok(starved.pClearBeforeHorizonPct < conventions.supplyStarvePct);

  // Retire: starved AND the demand it feeds is older than the retirement bar.
  const retired = buildLine('premise-outcome', fixture({
    premiseOutcomes: [{ id: 'po0', premiseId: 'p0', verdict: 'held', settledOn: ago(160) }],
    premises: [
      { id: 'p0', title: 'P0', createdAt: `${ago(300)}T00:00:00.000Z` },
      { id: 'p1', title: 'P1', createdAt: `${ago(conventions.supplyAbandonDays + 30)}T00:00:00.000Z` },
    ],
  }), TODAY, conventions);
  assert.equal(retired.verdict, 'retire');
  assert.ok(retired.oldestDemandDays >= conventions.supplyAbandonDays);
  for (const verdict of SUPPLY_VERDICTS) {
    assert.ok(verdict);
  }
});

/* ------------------------------------------------------------------ */
/* 4. Constraint and plan                                             */
/* ------------------------------------------------------------------ */

function linesFor(report) {
  return report.lines;
}

test('the constraint is chosen by pressure and named binding only above the declared share', () => {
  const state = fixture({
    decisions: [
      ...Array.from({ length: 3 }, (_, i) => ({ id: `d${i}`, title: `D${i}`, date: ago(120), outcome: 'pending' })),
    ],
    premises: Array.from({ length: 6 }, (_, i) => ({
      id: `p${i}`, title: `P${i}`, createdAt: `${ago(200)}T00:00:00.000Z`,
    })),
  });
  const report = supplyReport(state, NOW, {});
  assert.ok(report.bottleneck, 'a starved line with demand must produce a constraint');
  const top = report.bottleneck.ranked[0];
  assert.equal(report.bottleneck.key, top.key);
  assert.ok(report.bottleneck.ranked.every((row, i, all) => i === 0 || all[i - 1].pressure >= row.pressure));
  // A permissive bar makes it binding. A bar of 100% is only cleared when EVERY
  // open item in the workspace sits on a starved line — so a workspace with a
  // full line carrying some demand can never be binding.
  const mixed = {
    ...state,
    decisions: [
      ...state.decisions,
      ...Array.from({ length: 12 }, (_, i) => ({ id: `decided${i}`, title: `Done ${i}`, date: ago(150), decidedOn: ago(120), outcome: 'good' })),
    ],
  };
  const relaxed = supplyReport(mixed, NOW, { supplyBottleneckPct: 10 });
  assert.equal(relaxed.bottleneck.isBinding, true, 'a permissive bar is cleared by a starved share');
  const strict = supplyReport(mixed, NOW, { supplyBottleneckPct: 100 });
  assert.equal(strict.bottleneck.isBinding, false, 'a 100% bar cannot be cleared while any full line carries demand');
  const empty = supplyReport(createEmptyState(NOW.toISOString()), NOW, {});
  assert.equal(empty.bottleneck, null, 'no demand means no constraint');
  assert.equal(empty.totalDemand, 0);
});

test('the schedule respects the budget, prints a bound and buys only evidence somebody is waiting for', () => {
  const state = fixture({
    decisions: [
      ...Array.from({ length: 10 }, (_, i) => ({ id: `d${i}`, title: `D${i}`, date: ago(60), outcome: 'pending' })),
    ],
    delegations: [
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `g${i}`, title: `G${i}`, status: 'active', delegatedOn: ago(90), dueOn: ago(20), personId: 'a',
      })),
    ],
    cases: [
      ...Array.from({ length: 3 }, (_, i) => ({ id: `c${i}`, title: `C${i}`, status: 'open', openedOn: ago(120) })),
    ],
  });
  const report = supplyReport(state, NOW, { supplyWeeklyHours: 2 });
  const preview = report.preview;
  assert.ok(preview.hoursUsed <= preview.budgetHours + 1e-9);
  assert.ok(preview.fractionalBound >= preview.integerPressure - 1e-9, 'the LP relaxation must bound the integer schedule');
  assert.ok(preview.gap >= 0);
  for (const row of preview.chosen) {
    assert.ok(row.demandCount > 0, 'nothing without demand may be scheduled');
  }
  // The exclusions name a reason for every line that was not scheduled.
  const excludedKeys = new Set(preview.exclusions.map((row) => row.key));
  const scheduled = new Set(preview.chosen.map((row) => row.key));
  for (const line of report.lines) {
    if (scheduled.has(line.key)) continue;
    assert.ok(excludedKeys.has(line.key) || preview.leftOut.some((row) => row.key === line.key),
      `${line.key} must be scheduled, left out, or excluded with a reason`);
  }
});

test('planPreview is a pure function of the lines it is given', () => {
  const conventions = supplyConventions({ supplyWeeklyHours: 0.6 });
  const lines = [
    { key: 'a', label: 'A', verdict: 'starved', captureHours: 0.5, demandCount: 4, pClearBeforeHorizonPct: 10, shortfall: 3 },
    { key: 'b', label: 'B', verdict: 'starved', captureHours: 0.5, demandCount: 2, pClearBeforeHorizonPct: 10, shortfall: 3 },
    { key: 'c', label: 'C', verdict: 'met', captureHours: 0, demandCount: 9, pClearBeforeHorizonPct: 100, shortfall: 0 },
  ];
  const preview = planPreview(lines, conventions);
  assert.deepEqual(preview.chosen.map((row) => row.key), ['a']);
  assert.ok(preview.leftOut.some((row) => row.key === 'b'));
  // The LP relaxation can take part of b, so it strictly bounds the integer fill.
  assert.ok(preview.fractionalBound > preview.integerPressure);
  assert.ok(preview.gap > 0);
  assert.ok(preview.exclusions.some((row) => row.key === 'c' && /already at its floor/.test(row.reason)));
});

/* ------------------------------------------------------------------ */
/* 5. Freeze and grade                                                */
/* ------------------------------------------------------------------ */

function plannableState() {
  return fixture({
    decisions: Array.from({ length: 10 }, (_, i) => ({ id: `d${i}`, title: `D${i}`, date: ago(50), outcome: 'pending' })),
    delegations: Array.from({ length: 3 }, (_, i) => ({
      id: `g${i}`, title: `G${i}`, status: 'active', delegatedOn: ago(80), dueOn: ago(10), personId: 'a',
    })),
  });
}

test('a frozen plan carries one probability, an assumption-free bound and real demand ids', () => {
  const state = plannableState();
  const report = supplyReport(state, NOW, {});
  const built = buildSupplyPlan(report, state, NOW, 'sp1', { lines: 'all', reviewDays: 60 });
  assert.equal(built.ok, true);
  const plan = built.record;
  assert.equal(plan.reviewOn, '2027-08-29');
  assert.ok(plan.members.length > 0);
  assert.ok(plan.members.every((member) => member.shortfall > 0));
  assert.ok(plan.members.some((member) => member.demandIds.length > 0), 'a plan must point at the work it unblocks');
  assert.ok(plan.predictedAnyClearPct <= plan.predictedAnyClearIndependencePct,
    'the Fréchet lower bound can never exceed the independence value');
  assert.ok(plan.reservePct >= 0);
  // A plan with nothing to plan refuses rather than quoting an empty claim.
  const empty = buildSupplyPlan(supplyReport(fixture(), NOW, {}), fixture(), NOW, 'sp2', {});
  assert.equal(empty.ok, false);
  assert.match(empty.reason, /Nothing to plan/);
});

test('a plan grades once, only after its window, and an empty window is graded not excused', () => {
  const state = plannableState();
  const report = supplyReport(state, NOW, {});
  const { record } = buildSupplyPlan(report, state, NOW, 'sp1', { lines: 'all', reviewDays: 30 });
  const early = gradeSupplyPlan(record, state, NOW);
  assert.equal(early.ok, false);
  assert.match(early.reason, /has not arrived/);
  const lateNow = new Date('2027-11-30T00:00:00.000Z');
  const graded = gradeSupplyPlan(record, state, lateNow);
  assert.equal(graded.ok, true);
  assert.equal(graded.result.anyClear, false, 'nothing changed in the record, so nothing cleared');
  const expected = ((record.predictedAnyClearPct / 100) - 0) ** 2;
  assert.ok(Math.abs(graded.result.brier - expected) < 5e-5);
  const again = gradeSupplyPlan({ ...record, graded: graded.grade }, state, lateNow);
  assert.equal(again.ok, false);
  assert.match(again.reason, /once/);
});

/* ------------------------------------------------------------------ */
/* 6. Rules                                                           */
/* ------------------------------------------------------------------ */

function ruleContext(event, settings = {}, now = NOW) {
  let counter = 0;
  return {
    event,
    now,
    settings,
    idFactory: (prefix) => `${prefix}-${(counter += 1)}`,
    logEvent: () => {},
    out: [],
  };
}

function ruleDraft(extra = {}) {
  return {
    people: [{ id: 'lead', name: 'Lead', status: 'active', managerId: null }],
    settings: {},
    decisions: [],
    delegations: [],
    cases: [],
    premises: [],
    premiseOutcomes: [],
    reviews: [],
    links: [],
    supplyPlans: [],
    supplyMarkers: [],
    ...extra,
  };
}

function planRecord(extra = {}) {
  return {
    id: 'sp-r1',
    frozenAt: NOW.toISOString(),
    reviewOn: '2027-08-29',
    windowDays: 180,
    horizonDays: 56,
    budgetHours: 3,
    hoursCommitted: 1.5,
    bottleneckLine: 'premise-outcome',
    members: [
      {
        line: 'premise-outcome',
        label: 'Assumption settlements',
        verdict: 'starved',
        required: 8,
        observedN: 2,
        shortfall: 6,
        captureHours: 2,
        medianEtaWeeks: 40,
        pClearBeforeHorizonPct: 12,
        demandCount: 2,
        demandIds: [{ type: 'premise', id: 'p1' }],
      },
      {
        line: 'case-resolution',
        label: 'Resolved operational cases',
        verdict: 'starved',
        required: 6,
        observedN: 1,
        shortfall: 5,
        captureHours: 1.25,
        medianEtaWeeks: 30,
        pClearBeforeHorizonPct: 20,
        demandCount: 1,
        demandIds: [{ type: 'case', id: 'c1' }],
      },
    ],
    predictedAnyClearPct: 20,
    predictedAnyClearIndependencePct: 29.6,
    reservePct: 9.6,
    graded: null,
    challengeNotes: [],
    ...extra,
  };
}

test('RULE-SUP-01 opens capped capture tasks and real edges, and manufactures nothing', () => {
  const draft = ruleDraft({
    supplyPlans: [planRecord()],
    premises: [{ id: 'p1', title: 'P1', createdAt: `${ago(200)}T00:00:00.000Z` }],
    cases: [{ id: 'c1', title: 'C1', status: 'open', openedOn: ago(30) }],
  });
  const before = clone(draft);
  const effects = supplyRule(draft, ruleContext({ type: SUPPLY_EVENTS.FROZEN, entityId: 'sp-r1' }));
  const tasks = draft.delegations.filter((row) => row.personId === 'lead');
  assert.equal(tasks.length, 2, 'one capture task per planned line');
  assert.ok(tasks.every((task) => /Manufacture evidence/.test(task.title)));
  assert.ok(effects.some((e) => e.action === 'linked' && e.targetType === 'premise'));
  assert.ok(effects.some((e) => e.action === 'linked' && e.targetType === 'case'));
  const edges = draft.links.filter((link) => link.sourceType === 'supplyplan');
  assert.ok(edges.some((link) => link.relation === 'supplies-evidence'));
  assert.ok(edges.some((link) => link.relation === 'unblocks-judgement'));
  // Nothing the rule wrote invents a unit: the record is untouched.
  assert.deepEqual(draft.premiseOutcomes, before.premiseOutcomes);
  assert.deepEqual(draft.cases, before.cases);
  assert.deepEqual(draft.premises, before.premises);
});

test('RULE-SUP-01 respects the task cap', () => {
  const many = planRecord({
    members: Array.from({ length: 6 }, (_, i) => ({
      line: SUPPLY_LINES[i % SUPPLY_LINES.length].key,
      label: SUPPLY_LINES[i % SUPPLY_LINES.length].label,
      verdict: 'starved',
      required: 8,
      observedN: 1,
      shortfall: 7,
      captureHours: 1,
      medianEtaWeeks: 20,
      pClearBeforeHorizonPct: 10,
      demandCount: 1,
      demandIds: [],
    })),
  });
  const draft = ruleDraft({ supplyPlans: [many] });
  supplyRule(draft, ruleContext({ type: SUPPLY_EVENTS.FROZEN, entityId: 'sp-r1' }, { supplyMaxTasks: 2 }));
  assert.equal(draft.delegations.length, 2);
});

test('RULE-SUP-02 opens exactly one capacity decision per ISO week', () => {
  const draft = ruleDraft({
    premises: Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, title: `P${i}`, createdAt: `${ago(200)}T00:00:00.000Z` })),
    decisions: [{ id: 'd1', title: 'D1', date: ago(40), outcome: 'pending' }],
  });
  const ctx = ruleContext({ type: SUPPLY_EVENTS.SCAN });
  const first = supplyRule(draft, ctx);
  const decisions = draft.decisions.filter((row) => row.title === 'Which evidence line does this workspace feed first?');
  assert.equal(decisions.length, 1);
  assert.ok(first.some((e) => e.targetType === 'decision'));
  // A second scan in the same ISO week is a no-op for the decision.
  supplyRule(draft, ruleContext({ type: SUPPLY_EVENTS.SCAN }));
  assert.equal(draft.decisions.filter((row) => row.title === 'Which evidence line does this workspace feed first?').length, 1);
});

test('RULE-SUP-03 retires starved questions; RULE-SUP-04 announces a floor once, ever', () => {
  const starved = ruleDraft({
    premiseOutcomes: [{ id: 'po0', premiseId: 'p0', verdict: 'held', settledOn: ago(170) }],
    premises: [
      { id: 'p0', title: 'P0', createdAt: `${ago(400)}T00:00:00.000Z` },
      { id: 'p1', title: 'P1', createdAt: `${ago(300)}T00:00:00.000Z` },
    ],
  });
  supplyRule(starved, ruleContext({ type: SUPPLY_EVENTS.SCAN }));
  const retireTask = starved.delegations.find((task) => /Close or re-scope/.test(task.title));
  assert.ok(retireTask, 'a question the record cannot pay for must be offered for retirement');
  assert.ok(starved.links.some((link) => link.relation === 'retires-question'));

  const met = ruleDraft({
    premiseOutcomes: Array.from({ length: 12 }, (_, i) => ({
      id: `po${i}`, premiseId: `p${i}`, verdict: 'held', settledOn: ago(10 + i * 5),
    })),
    premises: [
      ...Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, title: `P${i}`, createdAt: `${ago(260)}T00:00:00.000Z` })),
      { id: 'popen', title: 'Open', createdAt: `${ago(40)}T00:00:00.000Z` },
    ],
  });
  supplyRule(met, ruleContext({ type: SUPPLY_EVENTS.SCAN }));
  const unlock = met.delegations.filter((task) => /Read the answer/.test(task.title));
  assert.equal(unlock.length, 1);
  supplyRule(met, ruleContext({ type: SUPPLY_EVENTS.SCAN }));
  assert.equal(met.delegations.filter((task) => /Read the answer/.test(task.title)).length, 1,
    'the unlock task is opened once per line, ever');
});

test('RULE-SUP-05 queues grading for a closed window and reconciles stale plan edges', () => {
  const draft = ruleDraft({
    supplyPlans: [planRecord({ reviewOn: '2027-06-01' })],
    links: [
      { id: 'l1', sourceType: 'supplyplan', sourceId: 'gone', targetType: 'decision', targetId: 'd1', relation: 'supplies-evidence' },
    ],
  });
  supplyRule(draft, ruleContext({ type: SUPPLY_EVENTS.SCAN }));
  assert.ok(draft.delegations.some((task) => /Grade the frozen evidence plan/.test(task.title)));
  assert.equal(draft.links.filter((link) => link.sourceId === 'gone').length, 0, 'stale plan edges are dropped');
});

test('automatic propagation is pausable and an explicit scan always runs', () => {
  const paused = ruleDraft({ supplyPlans: [planRecord()] });
  const effects = supplyRule(paused, ruleContext(
    { type: SUPPLY_EVENTS.FROZEN, entityId: 'sp-r1' },
    { supplyAutoPropagate: false },
  ));
  assert.deepEqual(effects, []);
  assert.equal(paused.delegations.length, 0);
  const scanned = ruleDraft({ supplyPlans: [planRecord({ reviewOn: '2027-06-01' })] });
  const scanEffects = supplyRule(scanned, ruleContext(
    { type: SUPPLY_EVENTS.SCAN },
    { supplyAutoPropagate: false },
  ));
  assert.ok(scanEffects.length > 0, 'a scan is the leader asking, so it is never paused');
});

/* ------------------------------------------------------------------ */
/* 7. Signals, wiring and export                                      */
/* ------------------------------------------------------------------ */

test('signals fire for the states they name and the badge counts only decision-shaped ones', () => {
  const state = fixture({
    decisions: Array.from({ length: 4 }, (_, i) => ({ id: `d${i}`, title: `D${i}`, date: ago(40), outcome: 'pending' })),
    premises: [
      { id: 'p0', title: 'P0', createdAt: `${ago(400)}T00:00:00.000Z` },
      { id: 'p1', title: 'P1', createdAt: `${ago(30)}T00:00:00.000Z` },
    ],
    premiseOutcomes: [{ id: 'po0', premiseId: 'p0', verdict: 'held', settledOn: ago(160) }],
  });
  const signals = supplySignals(state, NOW, {});
  assert.ok(signals.length > 0);
  assert.ok(signals.every((signal) => signal.domain === 'Evidence supply'));
  assert.ok(signals.every((signal) => signal.ruleId && signal.action && signal.action.route));
  assert.ok(signals.some((signal) => signal.ruleId === 'SUP-01' || signal.ruleId === 'SUP-02'));
  const count = supplyAttentionCount(state, NOW, {});
  assert.ok(count >= 1);
  // The bucket is registered, or the signals are silently dropped from the roll-up.
  const insights = buildInsights(state, NOW);
  const bucket = insights.byDomain.find((row) => row.domain === 'Evidence supply');
  assert.ok(bucket, 'an unlisted domain is silently dropped from the roll-up');
  assert.ok(bucket.count >= 1);
  // A brief never names a person.
  const brief = supplyBrief(supplyReport(state, NOW, {}), NOW);
  assert.ok(!/Lead\b/.test(brief) && !/\bA\b/.test(brief));
  assert.match(brief, /no person is named/);
});

test('the entity type, relations and the post-commit registration exist', () => {
  assert.ok(LINK_ENTITY_TYPES.includes('supplyplan'));
  for (const relation of ['supplies-evidence', 'unblocks-judgement', 'retires-question']) {
    assert.ok(LINK_RELATIONS.includes(relation), `${relation} must be an allowed relation`);
    assert.ok(LINK_RELATION_LABELS[relation], `${relation} must have a printable label`);
  }
  assert.ok(DEFAULT_POST_COMMIT_RULES.some((rule) => rule.id === 'supplyRule'));
  const state = { ...createEmptyState(NOW.toISOString()) };
  state.supplyPlans = [planRecord({ graded: { gradedAt: NOW.toISOString(), anyClear: false, clearedLines: [], brier: 0.04 } })];
  const resolved = resolveLinkedEntity(state, 'supplyplan', 'sp-r1');
  assert.ok(resolved);
  assert.match(resolved.route, /^#\/supply\?panel=plans/);
});

test('CSV scope #69 exports aggregates only', () => {
  const descriptor = CSV_EXPORTS.find((row) => row.key === 'evidence-supply');
  assert.ok(descriptor, 'the scope must be registered');
  const state = fixture({
    decisions: Array.from({ length: 5 }, (_, i) => ({ id: `d${i}`, title: `Secret call ${i}`, date: ago(40), outcome: 'pending' })),
    premises: Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, title: `Secret assumption ${i}`, createdAt: `${ago(200)}T00:00:00.000Z` })),
  });
  state.supplyPlans = [planRecord()];
  const result = exportWorkspaceCsv(state, 'evidence-supply', { now: NOW });
  assert.equal(result.ok, true);
  const csv = result.csv;
  assert.match(csv, /^row_kind,line,verdict/);
  assert.ok(!/Secret call/.test(csv), 'no decision title may be exported');
  assert.ok(!/Secret assumption/.test(csv), 'no premise title may be exported');
  assert.ok(!/\bd0\b/.test(csv), 'no record id may be exported');
  const rows = csv.trim().split('\n');
  assert.equal(rows.length, 1 + SUPPLY_LINES.length + 1, 'one header, one row per line, one plan row');
});

/* ------------------------------------------------------------------ */
/* 8. Demo                                                            */
/* ------------------------------------------------------------------ */

test('the demo seeds one plan and grades it out of sample', () => {
  const state = buildDemoState(new Date('2027-06-30T09:00:00.000Z'));
  const report = supplyReport(state, new Date('2027-06-30T09:00:00.000Z'), state.settings || {});
  assert.ok(report.plans.length === 1, 'the demo ships exactly one frozen plan');
  const plan = report.plans[0];
  assert.ok(plan.graded, 'the demo plan must be graded, not hand-written');
  assert.ok(Number.isFinite(plan.graded.brier));
  assert.ok(plan.reviewOn <= report.today);
  assert.ok(report.lines.length === SUPPLY_LINES.length);
  assert.ok(report.lines.every((line) => Number.isFinite(line.n)));
});
