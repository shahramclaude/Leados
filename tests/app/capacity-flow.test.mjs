/**
 * tests/app/capacity-flow.test.mjs — Capacity, Flow & Portfolio Allocation
 * (Schema v16) suite.
 *
 * Covers the cross-domain operating-plan layer:
 *   1. Mathematics — three-point Beta-PERT, normal CDF, utilisation bands
 *   2. Operations research — capacity supply with transition ramp and the
 *      operational reserve; Little's Law (1961) and Kingman (1961) queue delay
 *   3. Economics/finance — value density, funding at the capacity boundary,
 *      marginal release candidates, opportunity cost
 *   4. Statistics — additive PERT variance → P50/P80/P90 and cumulative
 *      target-date risk
 *   5. Schema v16 migration & normalization repairs (no invented estimates)
 *   6. Action validation and audit trail
 *   7. Parallel cross-module propagation: RULE-CAP-01 (case ↔ reserve),
 *      RULE-CAP-02 (infeasible plan → one trade-off decision),
 *      RULE-CAP-03 (funding decision → goal check-in),
 *      RULE-CAP-04 (delegation completion → linked portfolio delivery)
 *   8. Signals, CSV export, and a JSDOM + axe-core render of `#/capacity`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  createEmptyState,
  migrate,
  normalizeState,
  SCHEMA_VERSION,
} from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  capacityHistory,
  capacitySummary,
  buildCapacityModel,
  deliveryForecast,
  flowMetrics,
  normalCdf,
  pertTriple,
  rankPortfolio,
  utilisationBand,
} from '../../app/core/domain/capacity.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { reconstructStateAt } from '../../app/core/domain/health.js';
import { linksForEntity } from '../../app/core/domain/cases.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';

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
  const idFactory = (prefix) => `${prefix}-cap-${++seq}`;
  const store = createStore({ storage: kvStorage(), now: () => now, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => now, idFactory }) };
}

/** Two settled people ⇒ 32 gross person-days, 20% reserve ⇒ 25.6 allocatable. */
function baseState({ people = 2 } = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.people = Array.from({ length: people }, (_, i) => ({
    id: `person-${i + 1}`,
    name: `Person ${i + 1}`,
    role: 'Engineer',
    level: 'senior',
    team: 'Platform',
    managerId: null,
    startDate: '2024-01-01',
    focus: '',
    talkingPoints: [],
    status: 'active',
    createdAt: '2024-01-01T00:00:00.000Z',
    archivedAt: null,
  }));
  return state;
}

function portfolioItem(overrides = {}) {
  return {
    id: 'pf-x',
    title: 'Item',
    kind: 'project',
    status: 'open',
    sourceType: 'manual',
    sourceId: null,
    ownerId: null,
    effortDays: { optimistic: 0, mostLikely: 0, pessimistic: 0 },
    value: { optimistic: 0, mostLikely: 0, pessimistic: 0 },
    currency: 'USD',
    decision: 'undecided',
    decisionOn: null,
    rationale: '',
    targetOn: null,
    createdOn: '2026-10-01',
    completedOn: null,
    releasedOn: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

/* ------------------------------------------------------------------ maths */

test('capacity maths: Beta-PERT mean/variance, normal CDF and utilisation bands are exact', () => {
  const pert = pertTriple({ optimistic: 4, mostLikely: 8, pessimistic: 18 });
  // Mean = (4 + 32 + 18) / 6 = 9 ; sd = (18 - 4) / 6 = 2.3333
  assert.equal(pert.expected, 9);
  assert.equal(pert.stdDev, 2.33);
  assert.equal(pert.measured, true);
  assert.ok(pert.p10 < pert.expected && pert.expected < pert.p90, 'P10 < mean < P90');
  assert.equal(pertTriple({}).measured, false, 'an empty triple is explicitly unmeasured, not zero-value work');

  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-6);
  assert.ok(Math.abs(normalCdf(1.2815515655446004) - 0.9) < 1e-4, 'P90 z-score maps to 0.90');

  assert.equal(utilisationBand(0.4).id, 'slack');
  assert.equal(utilisationBand(0.72).id, 'healthy');
  assert.equal(utilisationBand(0.86).id, 'elevated');
  assert.equal(utilisationBand(0.97).id, 'overloaded');
  assert.equal(utilisationBand(1.3).id, 'infeasible');
  assert.equal(utilisationBand(null).id, 'unmeasured');
});

/* ------------------------------------------------------- supply and demand */

test('capacity supply: transition ramp and the operational reserve reduce real availability', () => {
  const state = baseState({ people: 3 });
  state.onboarding = [
    {
      id: 'onb-1',
      personId: 'person-1',
      kind: 'new-hire',
      label: 'Joining Platform',
      startDate: '2026-10-10', // 15 days ago ⇒ first-30-days ramp
      status: 'active',
      checkpoints: [],
      reviews: { 30: null, 60: null, 90: null },
      stakeholders: [],
      createdAt: '2026-10-10T00:00:00.000Z',
      updatedAt: '2026-10-10T00:00:00.000Z',
    },
    {
      id: 'onb-2',
      personId: 'person-2',
      kind: 'role-transition',
      label: 'Tech lead',
      startDate: '2026-09-20',
      status: 'active',
      checkpoints: [],
      reviews: { 30: null, 60: null, 90: null },
      stakeholders: [],
      createdAt: '2026-09-20T00:00:00.000Z',
      updatedAt: '2026-09-20T00:00:00.000Z',
    },
  ];
  const model = buildCapacityModel(state, { now: NOW });
  // 32 focused hours = 4 person-days/week × 4-week horizon = 16 gross per person.
  assert.equal(model.supply.grossDays, 48);
  // 0.45 new-hire + 0.8 transition + 1.0 settled = 2.25 of 3
  assert.equal(model.supply.availableDays, 36);
  assert.equal(model.supply.operationalReserveDays, 7.2);
  assert.equal(model.supply.allocatableDays, 28.8);
  assert.equal(model.supply.rampedCount, 2);
  const ramped = model.supply.people.find((p) => p.personId === 'person-1');
  assert.equal(ramped.rampLabel, 'New joiner, first 30 days');
  assert.ok(ramped.reasons[0].includes('reduces focused availability'));

  // 30-60-90 scaffolding is demand nobody entered as a portfolio item.
  const scaffold = model.demand.items.filter((i) => i.sourceType === 'onboarding');
  assert.equal(scaffold.length, 2);
  assert.ok(model.demand.reserveDays >= 3, 'scaffolding reserves manager/buddy time');
});

test('capacity demand: committed work, undecided demand, and honest handling of unestimated items', () => {
  const state = baseState({ people: 2 });
  state.portfolio = [
    portfolioItem({ id: 'pf-1', title: 'Funded', decision: 'funded', effortDays: { optimistic: 6, mostLikely: 8, pessimistic: 12 }, value: { optimistic: 10000, mostLikely: 20000, pessimistic: 30000 } }),
    portfolioItem({ id: 'pf-2', title: 'Wanted', decision: 'undecided', effortDays: { optimistic: 2, mostLikely: 4, pessimistic: 8 } }),
    portfolioItem({ id: 'pf-3', title: 'Parked', decision: 'deferred', effortDays: { optimistic: 1, mostLikely: 2, pessimistic: 4 }, rationale: 'Not this quarter' }),
    portfolioItem({ id: 'pf-4', title: 'Unestimated funded', decision: 'funded' }),
  ];
  const model = buildCapacityModel(state, { now: NOW });
  assert.equal(model.supply.allocatableDays, 25.6);
  assert.equal(model.demand.fundedDays, 8.33, 'only funded work is committed');
  assert.equal(model.demand.wantedDays, 4.33);
  assert.equal(model.demand.parkedDays, 2.17);
  assert.equal(model.demand.unestimatedCount, 1, 'an unestimated commitment is counted as a gap, not guessed');
  assert.equal(model.band.id, 'slack');
  assert.equal(model.slackDays, 17.27);
});

test('capacity reserves: an open case with capacity days is committed even before a portfolio entry exists', () => {
  const state = baseState({ people: 2 });
  state.cases = [
    {
      id: 'case-1',
      kind: 'incident',
      status: 'mitigating',
      title: 'Ledger drift',
      ownerId: 'person-1',
      involvedPersonIds: [],
      linkedGoalId: null,
      openedOn: '2026-10-10',
      reviewOn: '2026-11-01',
      resolvedOn: null,
      financial: { currency: 'USD', capacityDaysOptimistic: 4, capacityDaysMostLikely: 8, capacityDaysPessimistic: 14 },
      fmea: { severity: 8, probability: 5, detectability: 6 },
      rca: {},
      stakeholders: [],
      autoPropagate: true,
      createdAt: '2026-10-10T00:00:00.000Z',
      updatedAt: '2026-10-10T00:00:00.000Z',
    },
  ];
  const model = buildCapacityModel(state, { now: NOW });
  const implicit = model.demand.items.find((i) => i.implicit && i.sourceType === 'case');
  assert.ok(implicit, 'the case is counted as an implicit reserve rather than ignored');
  assert.equal(implicit.id, 'implicit-case-case-1');
  assert.equal(model.demand.reserveDays, 8.33);
  assert.equal(model.bottleneck.personId, 'person-1');
  assert.ok(model.bottleneck.utilisation > 0, 'the owner carries the load');
});

/* ------------------------------------------------------------------- flow */

test('flow: Little’s Law and Kingman use delivered evidence and refuse to invent a rate from one completion', () => {
  const state = baseState({ people: 2 });
  state.portfolio = [
    portfolioItem({ id: 'pf-a', title: 'Done A', decision: 'funded', status: 'done', createdOn: '2026-09-01', completedOn: '2026-09-20', effortDays: { optimistic: 3, mostLikely: 5, pessimistic: 8 } }),
    portfolioItem({ id: 'pf-b', title: 'Done B', decision: 'funded', status: 'done', createdOn: '2026-09-10', completedOn: '2026-10-10', effortDays: { optimistic: 2, mostLikely: 3, pessimistic: 5 } }),
    portfolioItem({ id: 'pf-c', title: 'In flight 1', decision: 'funded', effortDays: { optimistic: 4, mostLikely: 6, pessimistic: 9 } }),
    portfolioItem({ id: 'pf-d', title: 'In flight 2', decision: 'funded', effortDays: { optimistic: 4, mostLikely: 6, pessimistic: 9 } }),
  ];
  const model = buildCapacityModel(state, { now: NOW });
  const flow = flowMetrics(state, model, { now: NOW });
  assert.equal(flow.completedInWindow, 2);
  assert.equal(flow.throughputPerWeek, 0.25);
  assert.equal(flow.wip, 2, 'WIP counts plan items only, in the same unit as throughput');
  assert.equal(flow.littleCycleWeeks, 8, 'Little’s Law: 2 items ÷ 0.25 per week = 8 weeks');
  assert.ok(flow.delayMultiplier > 1, 'Kingman inflates lead time above the service time');
  assert.equal(flow.observedCycleDays, 24.5, 'median observed duration of delivered items');

  // One completion is an anecdote: no rate, no cycle time, and the view says so.
  const thin = baseState({ people: 2 });
  thin.portfolio = [portfolioItem({ id: 'pf-e', decision: 'funded', status: 'done', createdOn: '2026-10-01', completedOn: '2026-10-15' })];
  const thinFlow = flowMetrics(thin, buildCapacityModel(thin, { now: NOW }), { now: NOW });
  assert.equal(thinFlow.littleCycleWeeks, null);
  assert.ok(thinFlow.littleCycleNote.includes('Fewer than two plan items'));
});

/* ------------------------------------------------------------- allocation */

test('allocation: value density ranks candidates, funds inside slack, and names the cheapest releases on deficit', () => {
  const state = baseState({ people: 2 }); // 25.6 allocatable
  state.portfolio = [
    portfolioItem({ id: 'pf-1', title: 'Expensive and vague', decision: 'undecided', effortDays: { optimistic: 8, mostLikely: 10, pessimistic: 14 }, value: { optimistic: 5000, mostLikely: 6000, pessimistic: 9000 } }),
    portfolioItem({ id: 'pf-2', title: 'Cheap and valuable', decision: 'undecided', effortDays: { optimistic: 2, mostLikely: 3, pessimistic: 5 }, value: { optimistic: 20000, mostLikely: 24000, pessimistic: 30000 } }),
  ];
  const model = buildCapacityModel(state, { now: NOW });
  const ranking = rankPortfolio(model);
  assert.equal(ranking.candidates[0].title, 'Cheap and valuable', 'highest value per person-day goes first');
  assert.equal(ranking.funded.length, 2, 'both fit inside 25.6 days of slack');
  assert.equal(ranking.deferred.length, 0);
  assert.equal(ranking.deficitDays, 0);

  // Over-capacity plan → cheapest-value work is named as the first release.
  const tight = baseState({ people: 1 }); // 12.8 allocatable
  tight.portfolio = [
    portfolioItem({ id: 'pf-a', title: 'Strategic', decision: 'funded', effortDays: { optimistic: 6, mostLikely: 8, pessimistic: 12 }, value: { optimistic: 40000, mostLikely: 50000, pessimistic: 60000 } }),
    portfolioItem({ id: 'pf-b', title: 'Nice to have', decision: 'funded', effortDays: { optimistic: 6, mostLikely: 8, pessimistic: 12 }, value: { optimistic: 3000, mostLikely: 4000, pessimistic: 5000 } }),
  ];
  const tightModel = buildCapacityModel(tight, { now: NOW });
  assert.equal(tightModel.band.id, 'infeasible');
  const tightRanking = rankPortfolio(tightModel);
  assert.ok(tightRanking.deficitDays > 0);
  assert.equal(tightRanking.releaseCandidates[0].title, 'Nice to have', 'lowest value density is released first');
  assert.equal(tightRanking.unableToFreeEnough, false);
});

/* --------------------------------------------------------------- forecast */

test('forecast: independent PERT variances aggregate into a widening range, and target risk is cumulative not per-item', () => {
  const state = baseState({ people: 1 }); // 12.8 allocatable over the horizon
  state.portfolio = [
    portfolioItem({ id: 'pf-1', title: 'Ship A', decision: 'funded', targetOn: '2026-10-30', effortDays: { optimistic: 8, mostLikely: 10, pessimistic: 12 } }),
    portfolioItem({ id: 'pf-2', title: 'Ship B', decision: 'funded', targetOn: '2026-11-08', effortDays: { optimistic: 4, mostLikely: 6, pessimistic: 10 } }),
  ];
  const model = buildCapacityModel(state, { now: NOW });
  const forecast = deliveryForecast(model, { now: NOW });
  assert.equal(forecast.available, true);
  assert.equal(forecast.expectedDays, 16.33);
  assert.ok(forecast.p50Days < forecast.p80Days && forecast.p80Days < forecast.p90Days, 'the range widens with confidence');
  assert.ok(forecast.p50 < forecast.p80, 'P80 is not earlier than P50');
  assert.equal(forecast.targetRisks.length, 2);
  const first = forecast.targetRisks[0];
  assert.equal(first.title, 'Ship A');
  assert.equal(first.atRisk, true, '10 days of work due in 5 days cannot be met by one person');
  assert.equal(forecast.targetRisks[1].cumulativeWorkByTarget, 16.33, 'later targets are judged against all work due by then');
  assert.equal(forecast.lateTargetCount, 2);

  // History is a reconstruction, and it says so.
  const history = capacityHistory(state, { now: NOW, weeks: 4 });
  assert.equal(history.points.length, 4);
  assert.equal(history.fidelity, 'approximate');
});

/* ------------------------------------------------------- schema & repairs */

test('schema v15 → v16 adds an empty portfolio and planning conventions without inventing estimates', () => {
  assert.equal(SCHEMA_VERSION, 32);
  const v15 = { ...createEmptyState(NOW.toISOString()), schemaVersion: 15 };
  delete v15.portfolio;
  delete v15.settings.capacityHoursPerWeek;
  const migrated = migrate(v15);
  assert.deepEqual(migrated.applied, ['15 → 16', '16 → 17', '17 → 18', '18 → 19', '19 → 20', '20 → 21', '21 → 22', '22 → 23', '23 → 24', '24 → 25', '25 → 26', '26 → 27', '27 → 28', '28 → 29', '29 → 30', '30 → 31', '31 → 32']);
  assert.deepEqual(migrated.raw.portfolio, []);
  assert.equal(migrated.raw.settings.capacityHoursPerWeek, 32);
  assert.equal(migrated.raw.settings.planningHorizonWeeks, 4);
  assert.equal(migrated.raw.settings.operationalLoadPct, 20);
  assert.equal(migrated.raw.settings.wipLimitPerPerson, 2);
  const { state, warnings } = normalizeState(migrated.raw, { now: NOW });
  assert.deepEqual(warnings, []);
  assert.equal(state.portfolio.length, 0);
});

test('portfolio normalization repairs provenance, forces reserves funded, clamps future decisions, and clears dead owners', () => {
  const raw = createEmptyState(NOW.toISOString());
  raw.people = baseState().people.map((p) => ({ ...p, status: 'archived' }));
  raw.cases = [{
    id: 'case-1', kind: 'risk', status: 'open', title: 'Open case', ownerId: null, involvedPersonIds: [],
    linkedGoalId: null, openedOn: '2026-10-01', reviewOn: null, resolvedOn: null, resolutionNotes: '',
    fmea: { severity: 5, probability: 5, detectability: 5 }, financial: {}, rca: {}, stakeholders: [],
    autoPropagate: true, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
  }];
  raw.portfolio = [
    portfolioItem({ id: 'pf-1', title: 'Broken provenance', sourceType: 'goal', sourceId: 'goal-missing' }),
    portfolioItem({ id: 'pf-2', title: 'Reserve marked undecided', kind: 'capacity-reserve', sourceType: 'case', sourceId: 'case-1', decision: 'undecided' }),
    portfolioItem({ id: 'pf-3', title: 'Future decision', decision: 'funded', decisionOn: '2030-01-01', ownerId: 'person-1' }),
    portfolioItem({ id: 'pf-4', title: 'Bad triple', effortDays: { optimistic: 10, mostLikely: 4, pessimistic: 2 } }),
    { id: 'pf-5', title: '' },
  ];
  const { state, warnings } = normalizeState(raw, { now: NOW });
  assert.equal(state.portfolio.length, 4, 'a title-less record is dropped');
  const repaired = state.portfolio.find((p) => p.id === 'pf-1');
  assert.equal(repaired.sourceType, 'manual');
  assert.equal(repaired.sourceId, null);
  assert.equal(state.portfolio.find((p) => p.id === 'pf-2').decision, 'funded', 'a reserve is committed by definition');
  assert.equal(state.portfolio.find((p) => p.id === 'pf-3').decisionOn, TODAY, 'a future decision date is clamped, not trusted');
  assert.equal(state.portfolio.find((p) => p.id === 'pf-3').ownerId, null, 'an archived owner is cleared, not kept');
  assert.deepEqual(state.portfolio.find((p) => p.id === 'pf-4').effortDays, { optimistic: 2, mostLikely: 4, pessimistic: 10 });
  assert.ok(warnings.some((w) => w.includes('reset 1 item(s) with missing or invalid source provenance')));
  assert.ok(warnings.some((w) => w.includes('marked 1 capacity reserve(s) as funded')));
});

/* --------------------------------------------------------------- actions */

test('RULE-CAP-04: completing a linked delegation delivers its portfolio work and releases committed capacity', () => {
  const { store, api } = harness();
  const person = api.addPerson({ name: 'Morgan Lee', role: 'Engineering Lead', startDate: '2024-01-01' });
  const delegation = api.addDelegation({
    personId: person.id,
    title: 'Publish the service runbook',
    expectedOutcome: 'A reviewed and published runbook for the support rotation.',
    authority: 'own',
    support: 'A reviewer and two hours of pairing time.',
    delegatedOn: TODAY,
    dueOn: '2026-10-31',
  });
  assert.equal(delegation.ok, true, delegation.error);
  const plan = api.addPortfolioItem({
    title: 'Service runbook delivery',
    kind: 'project',
    sourceType: 'delegation',
    sourceId: delegation.id,
    ownerId: person.id,
    effortDays: { optimistic: 2, mostLikely: 3, pessimistic: 5 },
    decision: 'funded',
    createdOn: TODAY,
  });
  assert.equal(plan.ok, true, plan.error);
  assert.equal(buildCapacityModel(store.state, { now: NOW }).demand.committed.length, 1);

  const completed = api.completeDelegation(delegation.id, {
    completedOn: TODAY,
    completionNote: 'Runbook reviewed by support and published in the team handbook.',
  });
  assert.equal(completed.ok, true, completed.error);
  assert.ok(completed.propagations.some((entry) => entry.ruleId === 'RULE-CAP-04' && entry.targetId === plan.id));

  const item = store.state.portfolio.find((candidate) => candidate.id === plan.id);
  assert.equal(item.status, 'done');
  assert.equal(item.completedOn, TODAY, 'the plan uses the recorded completion date, not an inferred current date');
  assert.equal(buildCapacityModel(store.state, { now: NOW }).demand.committed.length, 0, 'delivered work no longer consumes committed capacity');
  assert.ok(store.state.links.some((link) =>
    link.sourceType === 'portfolio' && link.sourceId === plan.id &&
    link.targetType === 'delegation' && link.targetId === delegation.id && link.relation === 'funds',
  ), 'the typed source relationship remains in the graph');
  assert.equal(
    store.state.events.filter((event) => event.type === 'automation.propagated' && event.summary.includes('[RULE-CAP-04]')).length,
    1,
    'the automatic cross-module update has one append-only audit event',
  );
  assert.equal(api.completeDelegation(delegation.id, { completedOn: TODAY, completionNote: 'Duplicate attempt.' }).ok, false);
  assert.equal(
    api.addPortfolioItem({
      title: 'Reopen delivered outcome as new work',
      sourceType: 'delegation',
      sourceId: delegation.id,
      effortDays: { mostLikely: 1 },
    }).ok,
    false,
    'a closed delegation cannot be linked as open planned demand',
  );
  assert.equal(store.state.portfolio.find((candidate) => candidate.id === plan.id).status, 'done');

  const laterPlanDelegation = api.addDelegation({
    personId: person.id,
    title: 'Deliver the later-starting dashboard',
    expectedOutcome: 'A reviewed dashboard.',
    authority: 'own',
    support: 'Access to the analytics workspace.',
    delegatedOn: '2026-10-01',
    dueOn: '2026-10-31',
  });
  const laterPlan = api.addPortfolioItem({
    title: 'Dashboard project',
    sourceType: 'delegation',
    sourceId: laterPlanDelegation.id,
    effortDays: { mostLikely: 2 },
    decision: 'funded',
    createdOn: '2026-10-10',
  });
  assert.equal(laterPlan.ok, true, laterPlan.error);
  const impossibleChronology = api.completeDelegation(laterPlanDelegation.id, {
    completedOn: '2026-10-05',
    completionNote: 'This date predates the plan start and must not propagate.',
  });
  assert.equal(impossibleChronology.ok, false);
  assert.equal(impossibleChronology.field, 'completedOn');
  assert.equal(store.state.delegations.find((candidate) => candidate.id === laterPlanDelegation.id).status, 'active');
  assert.equal(store.state.portfolio.find((candidate) => candidate.id === laterPlan.id).status, 'open');

  const legacyDelegation = api.addDelegation({
    personId: person.id,
    title: 'Previously completed linked work',
    expectedOutcome: 'A delivered and documented outcome.',
    authority: 'own',
    support: 'Review time.',
    delegatedOn: TODAY,
    dueOn: '2026-10-31',
  });
  assert.equal(legacyDelegation.ok, true, legacyDelegation.error);
  const legacyPlan = api.addPortfolioItem({
    title: 'Legacy plan item',
    sourceType: 'delegation',
    sourceId: legacyDelegation.id,
    effortDays: { mostLikely: 1 },
    decision: 'funded',
    createdOn: TODAY,
  });
  assert.equal(legacyPlan.ok, true, legacyPlan.error);
  // Simulate an already-completed delegation from before RULE-CAP-04 existed.
  store.update((draft) => {
    const record = draft.delegations.find((candidate) => candidate.id === legacyDelegation.id);
    record.status = 'done';
    record.completedOn = TODAY;
  }, { type: 'legacy.fixture', entity: 'delegation', entityId: legacyDelegation.id, summary: 'Legacy fixture' });
  const repaired = api.syncCapacityPlan();
  assert.ok(repaired.propagations.some((entry) => entry.ruleId === 'RULE-CAP-04' && entry.targetId === legacyPlan.id));
  assert.equal(store.state.portfolio.find((candidate) => candidate.id === legacyPlan.id).status, 'done');
  assert.equal(api.syncCapacityPlan().propagations.some((entry) => entry.ruleId === 'RULE-CAP-04'), false, 'reconciliation is idempotent');
});

test('actions: portfolio validation rejects unestimated, unordered, unexplained, and archived-owner work', () => {
  const { store, api } = harness();
  const owner = api.addPerson({ name: 'Ada Byron', role: 'Staff Engineer', startDate: '2024-01-01' });
  assert.equal(api.addPortfolioItem({ title: '' }).ok, false);
  assert.equal(api.addPortfolioItem({ title: 'No estimate' }).field, 'effortDays');
  assert.equal(
    api.addPortfolioItem({ title: 'Bad order', effortDays: { optimistic: 9, mostLikely: 4, pessimistic: 2 } }).field,
    'effortDays',
  );
  assert.equal(
    api.addPortfolioItem({ title: 'Deferred silently', effortDays: { mostLikely: 3 }, decision: 'deferred' }).field,
    'rationale',
  );
  assert.equal(
    api.addPortfolioItem({ title: 'Bad source', effortDays: { mostLikely: 3 }, sourceType: 'goal', sourceId: 'goal-missing' }).field,
    'sourceId',
  );
  assert.equal(
    api.addPortfolioItem({ title: 'Reserve by hand', effortDays: { mostLikely: 3 }, kind: 'capacity-reserve' }).field,
    'kind',
  );

  const created = api.addPortfolioItem({
    title: 'Warehouse metrics migration',
    ownerId: owner.id,
    effortDays: { optimistic: 4, mostLikely: 6, pessimistic: 10 },
    value: { optimistic: 18000, mostLikely: 24000, pessimistic: 30000 },
    targetOn: '2026-11-20',
  });
  assert.equal(created.ok, true);
  assert.equal(store.state.portfolio.length, 1);
  assert.equal(store.state.portfolio[0].decision, 'undecided', 'a new item is not silently funded');
  assert.ok(store.state.events.some((e) => e.type === 'portfolio.created'));

  api.archivePerson(owner.id);
  assert.equal(
    api.updatePortfolioItem(created.id, { ownerId: owner.id }).field,
    'ownerId',
    'an archived person cannot own new work',
  );
});

test('actions: a funding decision is audited, requires a reason when cutting, and propagates to the linked goal once', () => {
  const { store, api } = harness();
  const person = api.addPerson({ name: 'Ada Byron', role: 'Staff Engineer', startDate: '2024-01-01' });
  const goal = api.addGoal({ title: 'Cut activation time to 10 minutes', ownerId: person.id, coAuthored: true, confidence: 'on-track', dueDate: '2026-12-01' });
  const item = api.addPortfolioItem({
    title: 'Activation instrumentation',
    sourceType: 'goal',
    sourceId: goal.id,
    effortDays: { optimistic: 4, mostLikely: 6, pessimistic: 10 },
    value: { optimistic: 20000, mostLikely: 30000, pessimistic: 40000 },
    decision: 'funded',
  });
  assert.equal(item.ok, true);

  const noReason = api.setPortfolioDecision(item.id, { decision: 'cut', rationale: '' });
  assert.equal(noReason.ok, false);
  assert.equal(noReason.field, 'rationale');

  const cut = api.setPortfolioDecision(item.id, { decision: 'cut', rationale: 'The activation goal was re-scoped out of this quarter.' });
  assert.equal(cut.ok, true);
  assert.ok(cut.propagations.some((p) => p.ruleId === 'RULE-CAP-03'), 'RULE-CAP-03 fires on the linked goal');
  const updatedGoal = store.state.goals.find((g) => g.id === goal.id);
  assert.equal(updatedGoal.confidence, 'at-risk', 'losing funded capacity moves an on-track goal to at-risk');
  assert.equal(updatedGoal.checkins.length, 1, 'funding new work writes no note; the cut does');
  assert.ok(updatedGoal.checkins[0].note.includes('[Portfolio'));
  assert.ok(linksForEntity(store.state, 'portfolio', item.id).some((l) => l.peer.type === 'goal'));
  assert.ok(store.state.events.some((e) => e.type === 'portfolio.decision'));

  // Repeating the same decision writes nothing new.
  const again = api.setPortfolioDecision(item.id, { decision: 'cut', rationale: 'The activation goal was re-scoped out of this quarter.' });
  assert.equal(again.unchanged, true);
  assert.equal(store.state.goals.find((g) => g.id === goal.id).checkins.length, 1);

  // Restoring funding writes the follow-up, without inventing a confidence change.
  api.setPortfolioDecision(item.id, { decision: 'funded', rationale: 'Re-scoped back in after the hiring freeze lifted.' });
  assert.equal(store.state.goals.find((g) => g.id === goal.id).checkins.length, 2);
});

test('actions: deliver, release and delete keep the plan and the audit trail truthful', () => {
  const { store, api } = harness();
  const item = api.addPortfolioItem({
    title: 'On-call tooling',
    effortDays: { optimistic: 3, mostLikely: 5, pessimistic: 8 },
    decision: 'funded',
    createdOn: '2026-10-01',
  });
  assert.equal(api.completePortfolioItem(item.id, { completedOn: '2026-09-01' }).ok, false, 'delivery cannot predate the start');
  assert.equal(api.completePortfolioItem(item.id, { completedOn: TODAY }).ok, true);
  assert.equal(store.state.portfolio[0].status, 'done');
  assert.equal(store.state.portfolio[0].completedOn, TODAY);
  assert.equal(api.completePortfolioItem(item.id, { completedOn: TODAY }).ok, false, 'already closed');

  const second = api.addPortfolioItem({ title: 'Support tooling', effortDays: { mostLikely: 4 } });
  assert.equal(api.releasePortfolioItem(second.id, { reason: '' }).ok, false, 'a silent stop is refused');
  assert.equal(api.releasePortfolioItem(second.id, { reason: 'Dropped after the vendor contract ended.' }).ok, true);
  assert.equal(store.state.portfolio.find((p) => p.id === second.id).status, 'released');
  assert.ok(store.state.portfolio.find((p) => p.id === second.id).rationale.includes('Released'));

  assert.equal(api.deletePortfolioItem(second.id).ok, true);
  assert.equal(store.state.portfolio.length, 1);
  assert.ok(store.state.events.some((e) => e.type === 'portfolio.deleted'));
});

test('rewind: reconstructStateAt hides plan items, decisions and deliveries that had not happened yet', () => {
  const { store } = harness();
  const base = store.state;
  base.portfolio = [
    {
      id: 'p-later', title: 'Q4 hardening', kind: 'project', status: 'done', sourceType: 'manual', sourceId: null,
      ownerId: null, effortDays: { optimistic: 4, mostLikely: 6, pessimistic: 10 },
      value: { optimistic: 2, mostLikely: 3, pessimistic: 5 }, currency: null,
      decision: 'funded', decisionOn: '2026-10-10', rationale: 'Funded after the incident review.',
      targetOn: null, createdOn: '2026-10-05', completedOn: '2026-10-20', releasedOn: null,
      createdAt: '2026-10-05T09:00:00.000Z', updatedAt: '2026-10-20T09:00:00.000Z',
    },
    {
      id: 'p-future', title: 'Next-quarter platform work', kind: 'project', status: 'open', sourceType: 'manual', sourceId: null,
      ownerId: null, effortDays: { optimistic: 5, mostLikely: 8, pessimistic: 13 },
      value: { optimistic: 3, mostLikely: 4, pessimistic: 6 }, currency: null,
      decision: 'undecided', decisionOn: null, rationale: 'Queued for the next planning cycle.',
      targetOn: null, createdOn: '2026-11-02', completedOn: null, releasedOn: null,
      createdAt: '2026-11-02T09:00:00.000Z', updatedAt: '2026-11-02T09:00:00.000Z',
    },
  ];

  const at = reconstructStateAt(base, '2026-10-15', { currentDay: '2026-10-25' }).state;
  assert.equal(at.portfolio.length, 1, 'an item created after the snapshot date does not exist yet');
  const rewound = at.portfolio[0];
  assert.equal(rewound.status, 'open', 'delivery after the snapshot date is undone');
  assert.equal(rewound.completedOn, null);
  assert.equal(rewound.decision, 'funded', 'a decision taken before the snapshot stays visible');
  assert.equal(rewound.decisionOn, '2026-10-10');

  const beforeDecision = reconstructStateAt(base, '2026-10-07', { currentDay: '2026-10-25' }).state;
  assert.equal(beforeDecision.portfolio[0].decision, 'undecided');
  assert.equal(beforeDecision.portfolio[0].decisionOn, null);
  assert.equal(beforeDecision.portfolio[0].rationale, '');

  const today = reconstructStateAt(base, '2026-11-05', { currentDay: '2026-11-05' }).state;
  assert.equal(today.portfolio.length, 2, 'the future item appears once its own start date arrives');
});

/* --------------------------------------------------- cross-module engine */

test('RULE-CAP-01: a case’s diverted capacity becomes a committed reserve, updates in place, and is released on resolution', () => {
  const { store, api } = harness();
  const owner = api.addPerson({ name: 'Mei Lin', role: 'Staff Engineer', startDate: '2024-01-01' });
  const created = api.addCase({
    title: 'Ledger cutover reconciliation drift',
    kind: 'risk',
    openedOn: '2026-10-10',
    ownerId: owner.id,
    financial: { currency: 'USD', capacityDaysOptimistic: 4, capacityDaysMostLikely: 8, capacityDaysPessimistic: 14 },
    autoPropagate: true,
  });
  assert.equal(created.ok, true);
  const reserve = store.state.portfolio.find((p) => p.kind === 'capacity-reserve' && p.sourceId === created.id);
  assert.ok(reserve, 'the reserve exists as a real record, not an inference');
  assert.equal(reserve.decision, 'funded');
  assert.equal(reserve.effortDays.mostLikely, 8);
  assert.equal(reserve.createdOn, '2026-10-10', 'the reserve is dated from the case, so history is truthful');
  assert.ok(linksForEntity(store.state, 'case', created.id).some((l) => l.peer.type === 'portfolio' && l.relation === 'consumes-capacity'));

  // Updating the estimate refreshes the same reserve (no duplicate, no orphan).
  api.updateCase(created.id, { financial: { currency: 'USD', capacityDaysOptimistic: 2, capacityDaysMostLikely: 4, capacityDaysPessimistic: 6 } });
  assert.equal(store.state.portfolio.length, 1);
  assert.equal(store.state.portfolio[0].id, reserve.id);
  assert.equal(store.state.portfolio[0].effortDays.mostLikely, 4);

  api.resolveCase(created.id, { status: 'resolved', resolvedOn: TODAY, resolutionNotes: 'Guardrail verified.' });
  assert.equal(store.state.portfolio[0].status, 'released');
  assert.equal(store.state.portfolio[0].releasedOn, TODAY);
  assert.equal(buildCapacityModel(store.state, { now: NOW }).demand.reserveDays, 0, 'released capacity is available again');

  // Reopening the case reinstates the reserve rather than leaving the plan short.
  api.reopenCase(created.id);
  assert.equal(store.state.portfolio[0].status, 'open');
  assert.ok(buildCapacityModel(store.state, { now: NOW }).demand.reserveDays > 0);
});

test('RULE-CAP-02: an infeasible plan opens exactly one trade-off decision with concrete, ranked options', () => {
  const { store, api } = harness();
  const owner = api.addPerson({ name: 'Ada Byron', role: 'Staff Engineer', startDate: '2024-01-01' });
  // One person ⇒ 12.8 allocatable person-days over the horizon.
  api.addPortfolioItem({
    title: 'Strategic platform bet',
    ownerId: owner.id,
    effortDays: { optimistic: 8, mostLikely: 10, pessimistic: 14 },
    value: { optimistic: 40000, mostLikely: 50000, pessimistic: 60000 },
    decision: 'funded',
  });
  assert.equal(store.state.decisions.length, 0, 'a feasible plan needs no trade-off decision');

  const overload = api.addPortfolioItem({
    title: 'Low value clean-up',
    ownerId: owner.id,
    effortDays: { optimistic: 6, mostLikely: 8, pessimistic: 12 },
    value: { optimistic: 2000, mostLikely: 3000, pessimistic: 4000 },
    decision: 'funded',
  });
  assert.equal(overload.ok, true);
  const capacityDecisions = store.state.decisions.filter((d) => d.title.startsWith('Capacity trade-off'));
  assert.equal(capacityDecisions.length, 1, 'exactly one capacity decision is opened');
  const decision = capacityDecisions[0];
  assert.ok(decision.title.includes('% committed'));
  assert.ok(decision.question.includes('person-days'), 'the numbers are in the record, not implied');
  assert.ok(decision.options.length >= 2);
  assert.ok(decision.options.some((o) => o.label.includes('Low value clean-up')), 'the cheapest release is named as an option');
  assert.ok(decision.options.some((o) => o.label.includes('accept the queue delay')));
  assert.ok(linksForEntity(store.state, 'decision', decision.id).length === 1, 'the decision is linked into the graph');

  // Still infeasible, still unanswered: no second decision, no spam.
  api.addPortfolioItem({
    title: 'Another clean-up',
    effortDays: { optimistic: 2, mostLikely: 3, pessimistic: 5 },
    decision: 'funded',
  });
  assert.equal(store.state.decisions.filter((d) => d.title.startsWith('Capacity trade-off')).length, 1);

  // Reconciliation is idempotent.
  const sync = api.syncCapacityPlan();
  assert.equal(sync.ok, true);
  assert.equal(store.state.decisions.filter((d) => d.title.startsWith('Capacity trade-off')).length, 1);
  assert.ok(sync.utilisation > 1);
});

/* -------------------------------------------------------- signals & export */

test('signals: CAP-01..03 describe the demo plan and stay silent for a workspace with no plan', () => {
  const demo = buildDemoState(NOW);
  const summary = capacitySummary(demo, NOW);
  assert.ok(summary.model.utilisation > 0.8, 'the demo plan is deliberately tight');
  const insights = buildInsights(demo, NOW);
  const capFindings = insights.findings.filter((f) => f.ruleId.startsWith('CAP-'));
  assert.ok(capFindings.some((f) => f.ruleId === 'CAP-01'), 'utilisation is reported');
  assert.ok(capFindings.some((f) => f.ruleId === 'CAP-02'), 'queue delay / WIP is reported');
  assert.ok(capFindings.some((f) => f.ruleId === 'CAP-03'), 'undecided demand is reported');
  assert.ok(insights.byDomain.some((d) => d.domain === 'Capacity & flow'));

  const empty = baseState({ people: 2 });
  const emptyInsights = buildInsights(empty, NOW);
  assert.equal(emptyInsights.findings.filter((f) => f.ruleId.startsWith('CAP-')).length, 0);
});

test('csv: the portfolio scope is formula-injection safe and includes derived value density', () => {
  const demo = buildDemoState(NOW);
  const result = exportWorkspaceCsv(demo, 'portfolio', { now: NOW });
  assert.equal(result.ok, true);
  assert.ok(result.rowCount >= 10);
  const parsed = parseCsv(result.csv);
  const headers = parsed.headers;
  assert.ok(headers.includes('value_density_per_person_day'));
  assert.ok(headers.includes('effort_days_pert_expected'));
  const fundedRow = parsed.rows.find((row) => row[headers.indexOf('title')] === 'Billing reconciliation automation');
  assert.equal(fundedRow[headers.indexOf('decision')], 'Funded');
  assert.equal(Number(fundedRow[headers.indexOf('effort_days_pert_expected')]), 8.33);
  assert.ok(Number(fundedRow[headers.indexOf('value_density_per_person_day')]) > 0);

  const injected = baseState({ people: 1 });
  injected.portfolio = [portfolioItem({ id: 'pf-x', title: '=HYPERLINK("http://evil")', decision: 'funded', effortDays: { mostLikely: 1 } })];
  const { state } = normalizeState(injected, { now: NOW });
  const csv = exportWorkspaceCsv(state, 'portfolio', { now: NOW });
  assert.ok(csv.csv.includes("'=HYPERLINK"), 'a formula-looking title is neutralised');
});

/* -------------------------------------------------------------------- UI */

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

test('ui: #/capacity renders the plan, opens the dialogs, and passes axe-core', async () => {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ storage: env.window.localStorage, now: () => NOW });
  try {
    app.ctx.loadDemo();
    app.ctx.navigate('#/capacity');
    const view = env.document.querySelector('#view');
    assert.ok(view.textContent.includes('Capacity & flow'));
    assert.ok(view.textContent.includes('Where the capacity goes'));
    assert.ok(view.textContent.includes('Flow arithmetic'));
    assert.ok(view.textContent.includes('Little’s Law'));
    assert.ok(view.textContent.includes('Allocation recommendation'));
    assert.ok(view.textContent.includes('Delivery forecast'));
    assert.ok(view.textContent.includes('Billing reconciliation automation'));
    assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
    assert.deepEqual(await axeViolations(env), []);

    // Add-work dialog opens, validates, and writes through the action layer.
    const addButton = [...env.document.querySelectorAll('#view button')].find((b) => b.textContent === 'Add work');
    assert.ok(addButton, 'add work action exists');
    addButton.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    const dialog = env.document.querySelector('[role="dialog"]');
    assert.ok(dialog, 'the portfolio dialog opened');
    assert.equal(await axeViolations(env, '[role="dialog"]').then((v) => v.length), 0);
    const titleInput = dialog.querySelector('input[name="title"]');
    titleInput.value = '';
    const submit = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Add to plan');
    submit.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    assert.ok(dialog.textContent.includes('Name the work'), 'blank title is refused inline');
  } finally {
    app.destroy?.();
    env.dom.window.close();
  }
});
