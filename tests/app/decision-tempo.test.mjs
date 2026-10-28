/**
 * tests/app/decision-tempo.test.mjs — Decision Tempo & Timing Terminal suite
 * (Schema v28, RULE-DLY-01..06):
 *
 *   1. Pure economics: preposterior EVSI (Raiffa–Schlaifer), switch probability,
 *      Reinertsen delay profiles, CD3 and the value-at-stake cap.
 *   2. Decision taxonomy: delegated / cross-cutting / big-bet from recorded
 *      evidence, with explicit reasons and per-class guardrails.
 *   3. Value at stake derived from typed links — never invented, currencies
 *      never summed.
 *   4. Timing verdicts: gather-first, decide-now, unpriced, needs-economics.
 *   5. Actions: arm / edit / abandon / delete guards and validation.
 *   6. Post-commit rules: propose, settle, debt-delegation, drift refresh,
 *      class-level DACI decision, pause switch, malformed-record tolerance.
 *   7. Schema: decidedOn stamping, v27 → v28 additive migration, normalisation
 *      repairs, one live timebox per decision, point-in-time rewind, demo parity.
 *   8. CSV scope #28 data minimisation and the DLY-01..06 signals.
 *   9. JSDOM + axe-core across all five tabs, the arm dialog, the nav badge and
 *      the Today card.
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
  DECISION_TYPES,
  DELAY_PROFILES,
  TEMPO_ENGINE_VERSION,
  TEMPO_MIN_SAMPLES,
  ambiguityAt,
  buildTempoReport,
  classifyDecisionType,
  decisionCd3,
  decisionLatencySamples,
  decisionTempoRule,
  decisionTempoSignals,
  decisionValueTerms,
  delayCostAt,
  derivedRatePerWeek,
  evaluateDecisionTiming,
  expectedPositivePart,
  expectedValueOfInformation,
  guardrailDaysFor,
  latencyBand,
  normalCdf,
  posteriorMeanSpread,
  switchProbability,
  tempoBrief,
} from '../../app/core/domain/decisionTempo.js';
import { reconstructStateAt } from '../../app/core/domain/health.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-26T10:00:00.000Z');
const TODAY = '2026-10-26';

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
  const idFactory = (prefix) => `${prefix}-dt-${++seq}`;
  const store = createStore({ storage: kvStorage(), now: () => now, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => now, idFactory }) };
}

/** One person, one money-bearing case linked to a decision, one open decision. */
function seeded(options = {}) {
  const env = harness();
  const priya = env.api.addPerson({ name: 'Priya Natarajan', role: 'Engineering Lead', startDate: '2024-01-15' });
  const caseRes = env.api.addCase({
    title: 'Vendor slippage on the billing migration',
    kind: 'risk',
    ownerId: priya.id,
    financial: {
      currency: options.currency || 'USD',
      optimistic: 20000,
      mostLikely: 60000,
      pessimistic: 120000,
      capacityDaysOptimistic: 2,
      capacityDaysMostLikely: 6,
      capacityDaysPessimistic: 12,
    },
  });
  const decisionId = env.api.addDecision({
    title: options.title || 'Switch the billing vendor',
    date: options.date || '2026-10-01',
    driver: 'Priya Natarajan',
    approver: 'Priya Natarajan',
    options: [{ label: 'Switch vendor' }, { label: 'Stay with the incumbent' }],
  }).id;
  if (options.link !== false) {
    env.store.update((draft) => {
      draft.links.push({
        id: 'lnk-test-1',
        sourceType: 'case',
        sourceId: caseRes.id,
        targetType: 'decision',
        targetId: decisionId,
        relation: 'decides',
        ruleId: 'TEST',
        summary: 'Test link',
        createdOn: TODAY,
        createdAt: NOW.toISOString(),
      });
    }, { type: 'link.created', entity: 'link', entityId: 'lnk-test-1', summary: 'linked for the tempo test' });
  }
  return { ...env, people: { priya: priya.id }, caseId: caseRes.id, decisionId };
}

/* ============================================================ 1. pure maths */

test('normal CDF and the preposterior positive part are well formed', () => {
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-9);
  assert.ok(Math.abs(normalCdf(1.959963985) - 0.975) < 1e-4);
  assert.ok(Math.abs(normalCdf(-1.959963985) - 0.025) < 1e-4);
  // E[max(0, X)] with a big positive mean tends to the mean itself.
  assert.ok(Math.abs(expectedPositivePart(1000, 0.001) - 1000) < 1);
  // With a zero mean it is sigma/sqrt(2π).
  assert.ok(Math.abs(expectedPositivePart(0, 1) - 1 / Math.sqrt(2 * Math.PI)) < 1e-9);
  assert.equal(expectedPositivePart(-5, 0), 0, 'a known-losing option is never worth a negative payoff');
});

test('EVSI is zero at t=0, monotone in time and never exceeds EVPI', () => {
  const advantage = 18000;
  const uncertainty = 44000;
  const halfLifeDays = 6;
  const evpi = expectedPositivePart(advantage, uncertainty) - advantage;
  let previous = -1;
  for (let day = 0; day <= 84; day += 1) {
    const evsi = expectedValueOfInformation({ advantage, uncertainty, halfLifeDays, days: day });
    if (day === 0) assert.equal(evsi, 0, 'no waiting time buys no information');
    assert.ok(evsi >= previous - 1e-9, `EVSI must be non-decreasing, failed at day ${day}`);
    assert.ok(evsi <= evpi + 1e-6, `EVSI must never exceed EVPI, failed at day ${day}`);
    previous = evsi;
  }
  // A faster half-life buys the same information sooner.
  const slow = expectedValueOfInformation({ advantage, uncertainty, halfLifeDays: 60, days: 7 });
  const fast = expectedValueOfInformation({ advantage, uncertainty, halfLifeDays: 3, days: 7 });
  assert.ok(fast > slow);
  // Degenerate inputs are refused, not guessed.
  assert.equal(expectedValueOfInformation({ advantage, uncertainty: 0, halfLifeDays, days: 7 }), 0);
  assert.equal(posteriorMeanSpread({ uncertainty: 0, halfLifeDays, days: 7 }), 0);
  assert.equal(ambiguityAt({ uncertainty: 100, halfLifeDays: 10, days: 10 }), 100 / Math.sqrt(2));
});

test('switch probability rises with uncertainty and falls with the believed edge', () => {
  const base = { uncertainty: 40000, halfLifeDays: 5, days: 10 };
  const weak = switchProbability({ ...base, advantage: 5000 });
  const strong = switchProbability({ ...base, advantage: 30000 });
  assert.ok(weak > strong, 'a smaller believed edge is easier to flip');
  const uncertain = switchProbability({ ...base, advantage: 10000, uncertainty: 80000 });
  assert.ok(uncertain > switchProbability({ ...base, advantage: 10000 }));
  const value = switchProbability({ ...base, advantage: 10000 });
  assert.ok(value >= 0 && value <= 1);
});

test('Reinertsen delay profiles behave as documented and are capped by the value at stake', () => {
  const linear = delayCostAt({ profile: 'linear', ratePerWeek: 1000, days: 28 });
  assert.equal(linear.cost, 4000);
  const fixedEarly = delayCostAt({ profile: 'fixed-date', ratePerWeek: 1000, deadlineDays: 14, days: 14 });
  assert.equal(fixedEarly.cost, 0, 'nothing is lost before the fixed date');
  const fixedLate = delayCostAt({ profile: 'fixed-date', ratePerWeek: 1000, deadlineDays: 14, days: 28 });
  assert.equal(fixedLate.cost, 5000, 'two weeks past the date at 2.5× the linear rate');
  const expedite = delayCostAt({ profile: 'expedite', ratePerWeek: 1000, days: 1 });
  assert.ok(expedite.cost > 2000, 'missing the window costs a step immediately');
  const standard = delayCostAt({ profile: 'standard', ratePerWeek: 1000, days: 28 });
  assert.ok(standard.cost < linear.cost);
  const capped = delayCostAt({ profile: 'linear', ratePerWeek: 10000, valueAtStake: 5000, days: 28 });
  assert.equal(capped.cost, 5000);
  assert.equal(capped.capped, true);
  assert.equal(derivedRatePerWeek(120000, 12), 10000);
});

/* ===================================================== 2. classification */

test('decision taxonomy follows recorded evidence, with reasons', () => {
  const settings = {};
  const none = { byCurrency: [], dominant: null, capacityDays: 0 };
  const delegated = classifyDecisionType(
    { reversibility: 'reversible', driver: 'A', approver: 'B', contributors: '', informed: '' },
    none,
    settings,
  );
  assert.equal(delegated.type, 'delegated');
  assert.ok(delegated.reasons.length >= 1);

  const crossCutting = classifyDecisionType(
    { reversibility: 'reversible', driver: 'A', approver: 'B', contributors: 'C, D, E', informed: '' },
    none,
    settings,
  );
  assert.equal(crossCutting.type, 'cross-cutting');

  const bigBetIrreversible = classifyDecisionType(
    { reversibility: 'irreversible', driver: 'A', approver: 'Board', contributors: '', informed: '' },
    none,
    settings,
  );
  assert.equal(bigBetIrreversible.type, 'big-bet');

  const bigBetMoney = classifyDecisionType(
    { reversibility: 'reversible', driver: 'A', approver: 'B' },
    { ...none, dominant: { currency: 'USD', amount: 90000 } },
    settings,
  );
  assert.equal(bigBetMoney.type, 'big-bet');
  assert.ok(bigBetMoney.reasons.join(' ').includes('at stake'));

  const vetoed = classifyDecisionType(
    { reversibility: 'reversible', driver: 'A', approver: 'B' },
    { ...none, vetoPlayers: 1 },
    settings,
  );
  assert.equal(vetoed.type, 'big-bet');
  assert.equal(guardrailDaysFor('delegated', settings), 7);
  assert.equal(guardrailDaysFor('big-bet', { tempoBigBetMaxDays: 60 }), 60);
  for (const type of DECISION_TYPES) assert.ok(guardrailDaysFor(type, settings) > 0);
});

/* =============================================== 3. value at stake derived */

test('value at stake is derived from linked records and currencies are never summed', () => {
  const env = seeded();
  const decision = env.store.state.decisions.find((d) => d.id === env.decisionId);
  const valuation = decisionValueTerms(env.store.state, decision);
  assert.equal(valuation.priced, true);
  assert.equal(valuation.dominant.currency, 'USD');
  assert.ok(valuation.dominant.amount > 0);
  assert.equal(valuation.terms[0].kind, 'case-exposure');
  assert.ok(valuation.terms.some((t) => t.kind === 'capacity-days' && t.days > 0));
  assert.ok(valuation.linkedRecords >= 1);

  // A second currency is reported separately and never added to the dominant one.
  env.api.addBudget({
    name: 'Vendor budget',
    currency: 'EUR',
    limit: 50000,
    lines: [{ title: 'Vendor prepayment', category: 'software', status: 'committed', committedAmount: 12000 }],
  });
  const budgetId = env.store.state.budgets[0].id;
  env.store.update((draft) => {
    draft.links.push({
      id: 'lnk-eur', sourceType: 'budget', sourceId: budgetId, targetType: 'decision', targetId: env.decisionId,
      relation: 'funds', ruleId: 'TEST', summary: 'EUR budget', createdOn: TODAY, createdAt: NOW.toISOString(),
    });
  }, { type: 'link.created', entity: 'link', entityId: 'lnk-eur', summary: 'eur link' });
  const withEur = decisionValueTerms(env.store.state, decision);
  assert.equal(withEur.byCurrency.length, 2);
  assert.deepEqual(withEur.byCurrency.map((c) => c.currency).sort(), ['EUR', 'USD']);
  assert.equal(withEur.dominant.currency, 'USD', 'dominant is the largest single currency, not a sum');
  assert.equal(withEur.otherCurrencies[0].currency, 'EUR');

  // Nothing linked, no invented money.
  const bare = env.api.addDecision({ title: 'Rename the on-call rota', date: '2026-10-20' });
  const bareValuation = decisionValueTerms(env.store.state, env.store.state.decisions.find((d) => d.id === bare.id));
  assert.equal(bareValuation.priced, false);
  assert.equal(bareValuation.dominant, null);
  assert.equal(bareValuation.terms.length, 0);
});

/* ================================================== 4. timing verdicts */

test('timing verdicts: gather-first, decide-now, unpriced and needs-economics', () => {
  const env = seeded();
  const decision = env.store.state.decisions.find((d) => d.id === env.decisionId);
  const valuation = decisionValueTerms(env.store.state, decision);
  const base = { decision, valuation, now: NOW, settings: env.store.state.settings };

  const unpriced = evaluateDecisionTiming({ ...base, valuation: { ...valuation, dominant: null, priced: false } });
  assert.equal(unpriced.verdict, 'unpriced');

  const needsEconomics = evaluateDecisionTiming({ ...base, schedule: { profile: 'linear' } });
  assert.equal(needsEconomics.verdict, 'needs-economics');

  const gather = evaluateDecisionTiming({
    ...base,
    schedule: {
      profile: 'linear', advantageAmount: 18000, uncertaintyPct: 85, halfLifeDays: 6,
      infoWeeks: 1, infoCostAmount: 900, windowWeeks: 12, decideBy: '2026-10-29', currency: 'USD',
    },
  });
  assert.equal(gather.verdict, 'gather-first');
  assert.ok(gather.bestPlan.day > 0 && gather.bestPlan.day < 30);
  assert.ok(gather.gainFromBestPlan > 0);
  assert.ok(gather.informationHorizonDays > 0);
  assert.equal(gather.curve[0].day, 0);
  assert.equal(gather.scenarios[0].day, 0);
  assert.ok(gather.scenarios.length >= 4);
  assert.equal(gather.debtDays, 0);

  const decideNow = evaluateDecisionTiming({
    ...base,
    schedule: {
      profile: 'expedite', advantageAmount: 400, uncertaintyPct: 10, halfLifeDays: 60,
      infoWeeks: 6, infoCostAmount: 25000, windowWeeks: 4, decideBy: '2026-10-20', currency: 'USD',
    },
  });
  assert.equal(decideNow.verdict, 'decide-now');
  assert.equal(decideNow.bestPlan.day, 0);
  assert.ok(decideNow.debtDays > 0, 'a decide-by date in the past is decision debt');

  const cd3 = decisionCd3({ ratePerWeek: 1000, infoPlanDays: 14, amount: 50000 });
  assert.equal(cd3.durationWeeks, 2);
  assert.equal(cd3.cd3, 500);
  assert.equal(needsEconomics.engineVersion, TEMPO_ENGINE_VERSION);
});

test('report ranks by CD3, measures latency and only bands at n≥5', () => {
  const env = seeded();
  const report = buildTempoReport(env.store.state, { now: NOW, settings: env.store.state.settings });
  // The linked case also auto-creates a response decision (RULE-DEC-01), so the
  // queue holds both; assert on this test's own decision instead of a total.
  const row = report.rows.find((r) => r.decision.id === env.decisionId);
  assert.ok(row);
  assert.ok(row.cd3 >= 0);
  assert.ok(report.totals.openDecisions >= 1);
  assert.ok(report.totals.pricedDecisions >= 1);
  // No settled latency yet: counts only, no fabricated band.
  assert.equal(report.latency.totalMeasured, 0);
  for (const bandRow of report.latency.rows) {
    assert.equal(bandRow.band.sufficient, false);
    assert.equal(bandRow.band.p80Days, null);
  }
  // The report is memoised per (state, day) — same object, no recomputation.
  assert.equal(buildTempoReport(env.store.state, { now: NOW }), report);
  const empty = buildTempoReport(createEmptyState(NOW.toISOString()), { now: NOW });
  assert.equal(empty.rows.length, 0);
  assert.ok(empty.board.text.includes('No decision currently has money linked'));
});

test('latency band is distribution-free, needs five samples and reports its coverage bound', () => {
  const few = latencyBand([3, 4, 5, 6]);
  assert.equal(few.sufficient, false);
  assert.equal(few.p80Days, null);
  assert.ok(few.note.includes('Counts only'));
  const five = latencyBand([3, 5, 6, 9, 12]);
  assert.equal(five.sufficient, true);
  assert.equal(five.p80Days, 12);
  assert.equal(five.medianDays, 6);
  assert.ok(five.coverageBound >= 0.8);
  assert.ok(five.note.includes('exchangeability'));
  const samples = decisionLatencySamples({
    decisions: [
      { id: 'a', chosen: 'x', date: '2026-10-01', decidedOn: '2026-10-09' },
      { id: 'b', chosen: 'y', date: '2026-10-01', decidedOn: null },
      { id: 'c', chosen: '', date: '2026-10-01' },
      { id: 'd', chosen: 'z', date: '2026-10-10', decidedOn: '2026-10-02' },
    ],
  });
  assert.equal(samples.samples.length, 1);
  assert.equal(samples.samples[0].latencyDays, 8);
  assert.equal(samples.unmeasured, 2, 'a legacy decided record and an impossible stamp are both unmeasured');
});

/* ==================================================== 5. action layer */

test('arm, edit, abandon and delete guards on a timebox', () => {
  const env = seeded();
  // A proposal may already exist from the case-driven propagation; arming
  // converts that same record instead of creating a second decide-by date.
  const proposalsBefore = env.store.state.tempoSchedules.filter((s) => s.decisionId === env.decisionId);
  const armed = env.api.armTempoSchedule(env.decisionId, {
    advantageAmount: 12000,
    uncertaintyPct: 55,
    infoWeeks: 1,
    infoCostAmount: 500,
    profile: 'linear',
    decideBy: '2026-11-02',
  });
  assert.equal(armed.ok, true);
  assert.equal(armed.schedule.status, 'armed');
  assert.equal(armed.schedule.decideBy, '2026-11-02');
  assert.ok(armed.schedule.derivedAmount > 0, 'arming keeps the derived value at stake');
  assert.equal(
    env.store.state.tempoSchedules.filter((s) => s.decisionId === env.decisionId).length,
    proposalsBefore.length || 1,
    'arming never adds a second timebox for one decision',
  );
  if (proposalsBefore.length) assert.equal(armed.schedule.id, proposalsBefore[0].id);

  const past = env.api.armTempoSchedule(env.decisionId, { decideBy: '2026-10-01' });
  assert.equal(past.ok, false);
  assert.equal(past.field, 'decideBy');
  const tooUncertain = env.api.armTempoSchedule(env.decisionId, { decideBy: '2026-11-02', uncertaintyPct: 140 });
  assert.equal(tooUncertain.ok, false);
  assert.equal(tooUncertain.field, 'uncertaintyPct');

  const edited = env.api.updateTempoSchedule(armed.id, { advantageAmount: 20000, profile: 'fixed-date' });
  assert.equal(edited.ok, true);
  const saved = env.store.state.tempoSchedules.find((t) => t.id === armed.id);
  assert.equal(saved.advantageAmount, 20000);
  assert.equal(saved.profile, 'fixed-date');
  assert.ok(saved.history.some((h) => h.action === 'rearmed' || h.action === 'edited'));

  const badEdit = env.api.updateTempoSchedule(armed.id, { decideBy: 'nope' });
  assert.equal(badEdit.ok, false);

  // A settled decision can no longer be armed or re-timed.
  env.api.decideDecision(env.decisionId, { chosen: 'Switch vendor' });
  const afterDecision = env.api.armTempoSchedule(env.decisionId, { decideBy: '2026-11-10' });
  assert.equal(afterDecision.ok, false);
  const settledEdit = env.api.updateTempoSchedule(armed.id, { advantageAmount: 1 });
  assert.equal(settledEdit.ok, false);

  // Abandon requires an armed/proposed record and keeps a written reason.
  const second = env.api.addDecision({ title: 'Choose the rota hand-off format', date: '2026-10-05' });
  const armedSecond = env.api.armTempoSchedule(second.id, { decideBy: '2026-11-05' });
  assert.equal(armedSecond.ok, true);
  assert.equal(env.api.abandonTempoSchedule(armedSecond.id, 'Superseded by the incident review').ok, true);
  const abandoned = env.store.state.tempoSchedules.find((t) => t.id === armedSecond.id);
  assert.equal(abandoned.status, 'abandoned');
  assert.equal(abandoned.abandonReason, 'Superseded by the incident review');
  // Only an unarmed proposal may be deleted.
  assert.equal(env.api.deleteTempoSchedule(armedSecond.id).ok, false);
});

test('decidedOn is stamped once and never rewritten', () => {
  const env = harness();
  const withChoice = env.api.addDecision({ title: 'Adopt the new pager', date: '2026-10-01', chosen: 'Adopt' });
  const stamped = env.store.state.decisions.find((d) => d.id === withChoice.id);
  assert.equal(stamped.decidedOn, TODAY, 'a decision logged as made is stamped the day it was recorded');

  const open = env.api.addDecision({ title: 'Pick the review slot', date: '2026-10-02' });
  assert.equal(env.store.state.decisions.find((d) => d.id === open.id).decidedOn, null);
  env.api.decideDecision(open.id, { chosen: 'Tuesday' });
  assert.equal(env.store.state.decisions.find((d) => d.id === open.id).decidedOn, TODAY);
});

/* ============================================ 6. post-commit propagation */

test('RULE-DLY-03 proposes one timebox for a priced decision, idempotently', () => {
  const env = seeded();
  const proposals = env.store.state.tempoSchedules.filter((s) => s.decisionId === env.decisionId);
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].status, 'proposed', 'automation proposes, it never arms');
  assert.ok(proposals[0].derivedAmount > 0);
  assert.ok(proposals[0].decideBy);
  // Links are created into the typed graph.
  const link = env.store.state.links.find((l) => l.targetType === 'tempo' && l.targetId === proposals[0].id);
  assert.ok(link);
  assert.equal(link.relation, 'timeboxes');
  // A second scan does not duplicate the proposal.
  env.api.scanDecisionTempo();
  assert.equal(env.store.state.tempoSchedules.filter((s) => s.decisionId === env.decisionId).length, 1);
});

test('RULE-DLY-01 settles the timebox and measures the latency when the call is made', () => {
  const env = seeded();
  const armed = env.api.armTempoSchedule(env.decisionId, { advantageAmount: 9000, uncertaintyPct: 50, decideBy: '2026-11-02' });
  assert.equal(armed.ok, true);
  env.api.decideDecision(env.decisionId, { chosen: 'Switch vendor' });
  const schedule = env.store.state.tempoSchedules.find((s) => s.id === armed.id);
  assert.equal(schedule.status, 'settled');
  assert.equal(schedule.settledOn, TODAY);
  assert.equal(schedule.realizedLatencyDays, 25, '25 days from the 1 Oct log to the 26 Oct call');
  assert.ok(schedule.history.some((h) => h.action === 'settled'));
  const propagated = env.store.state.events.filter((e) => e.type === 'automation.propagated' && String(e.summary).includes('RULE-DLY-01'));
  assert.ok(propagated.length >= 1);
  // The latency now feeds the empirical ledger.
  const report = buildTempoReport(env.store.state, { now: NOW });
  assert.equal(report.latency.totalMeasured, 1);
});

test('RULE-DLY-02 opens exactly one owned delegation for an overdue call', () => {
  const env = seeded();
  const armed = env.api.armTempoSchedule(env.decisionId, { advantageAmount: 9000, uncertaintyPct: 50, decideBy: '2026-11-02' });
  // Simulate the passage of time by moving the decide-by date into the past.
  env.store.update((draft) => {
    draft.tempoSchedules.find((t) => t.id === armed.id).decideBy = '2026-10-20';
  }, { type: 'tempo.updated', entity: 'tempo', entityId: armed.id, summary: 'expired for the test' });
  const delegations = env.store.state.delegations.filter((d) => String(d.support || '').includes('[RULE-DLY-02:'));
  assert.equal(delegations.length, 1);
  assert.equal(delegations[0].personId, env.people.priya, 'the recorded approver receives it, matched by exact name');
  assert.equal(delegations[0].status, 'active');
  assert.equal(delegations[0].dueOn, '2026-10-29');
  assert.ok(delegations[0].support.includes('Blameless'));
  // Idempotent: scanning again creates nothing.
  env.api.scanDecisionTempo();
  env.api.scanDecisionTempo();
  assert.equal(env.store.state.delegations.filter((d) => String(d.support || '').includes('[RULE-DLY-02:')).length, 1);
  // An unmatchable approver is never replaced with an invented person.
  const env2 = harness();
  env2.api.addPerson({ name: 'Someone Else', role: 'Analyst' });
  const noMatch = env2.api.addDecision({ title: 'Choose a meeting room standard', date: '2026-09-01', approver: 'External Advisor', driver: 'Unknown Person' });
  env2.store.update((draft) => {
    draft.tempoSchedules.push({
      id: 'tempo-nomatch', decisionId: noMatch.id, status: 'armed', profile: 'linear', decideBy: '2026-09-20',
      currency: null, derivedAmount: null, windowWeeks: 12, deadlineDays: 21, halfLifeDays: 14, plannedTempoDays: 21,
      createdOn: '2026-09-01', createdAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T09:00:00.000Z', history: [],
    });
  }, { type: 'tempo.armed', entity: 'tempo', entityId: 'tempo-nomatch', summary: 'no-match arm' });
  assert.equal(env2.store.state.delegations.filter((d) => String(d.support || '').includes('RULE-DLY-02')).length, 0);
});

test('RULE-DLY-04 refreshes derived value on a material change only', () => {
  const env = seeded();
  const armed = env.api.armTempoSchedule(env.decisionId, { advantageAmount: 9000, uncertaintyPct: 50, decideBy: '2026-11-02' });
  const before = env.store.state.tempoSchedules.find((s) => s.id === armed.id).derivedAmount;
  // A >20% change to the linked case exposure must refresh the schedule.
  env.api.updateCase(env.caseId, {
    financial: { currency: 'USD', optimistic: 80000, mostLikely: 200000, pessimistic: 400000 },
  });
  const after = env.store.state.tempoSchedules.find((s) => s.id === armed.id);
  assert.ok(after.derivedAmount > before * 1.2, 'the derived value follows the linked record');
  assert.ok(after.history.some((h) => h.action === 'value-refreshed'));
  assert.equal(after.advantageAmount, 9000, 'human inputs are never overwritten by a refresh');
  const historyLength = after.history.length;
  // A tiny change (well under 20%) does not touch it again.
  env.api.updateCase(env.caseId, {
    financial: { currency: 'USD', optimistic: 80000, mostLikely: 201000, pessimistic: 400000 },
  });
  assert.equal(env.store.state.tempoSchedules.find((s) => s.id === armed.id).history.length, historyLength);
});

test('RULE-DLY-05 opens one DACI tempo decision per breaching class', () => {
  const env = harness();
  env.store.update((draft) => {
    for (let i = 0; i < 5; i += 1) {
      draft.decisions.push({
        id: `dec-breach-${i}`,
        title: `Delegated call ${i}`,
        question: '',
        date: `2026-09-0${i + 1}`,
        reversibility: 'reversible',
        driver: 'A Person',
        approver: 'A Manager',
        contributors: '',
        informed: '',
        options: [],
        chosen: 'Done',
        rationale: '',
        decidedOn: '2026-10-20',
        reviewOn: null,
        reviewedOn: null,
        outcome: 'pending',
        outcomeNotes: '',
        forecastProbability: null,
        createdAt: NOW.toISOString(),
      });
    }
  }, { type: 'decision.created', entity: 'decision', entityId: 'dec-breach-0', summary: 'bulk import for the test' });
  env.api.scanDecisionTempo();
  const tempoDecisions = env.store.state.decisions.filter((d) => String(d.question || '').includes('[RULE-DLY-05:delegated]'));
  assert.equal(tempoDecisions.length, 1);
  assert.equal(tempoDecisions[0].options.length, 4);
  assert.equal(tempoDecisions[0].chosen, '');
  // Idempotent per class.
  env.api.scanDecisionTempo();
  assert.equal(env.store.state.decisions.filter((d) => String(d.question || '').includes('[RULE-DLY-05:delegated]')).length, 1);
});

test('pausing automatic tempo propagation stops linked-event writes but an explicit scan still runs', () => {
  const env = seeded();
  env.api.updateSettings({ tempoAutoPropagate: false });
  const count = env.store.state.tempoSchedules.length;
  env.store.update(() => {}, { type: 'case.updated', entity: 'case', entityId: env.caseId, summary: 'paused test' });
  assert.equal(env.store.state.tempoSchedules.length, count, 'no writes while paused');
  const scan = env.api.scanDecisionTempo();
  assert.equal(scan.ok, true);
  assert.equal(env.store.state.tempoSchedules.length >= count, true);
});

test('the rule never throws into the store when a record is malformed', () => {
  const draft = { ...createEmptyState(NOW.toISOString()), tempoSchedules: [{ id: 'x', decisionId: 'missing', status: 'armed' }] };
  const results = decisionTempoRule(draft, {
    event: { type: 'decision.created' },
    now: NOW,
    idFactory: (p) => `${p}-x`,
    logEvent: () => {},
    warnings: [],
  });
  assert.ok(Array.isArray(results));
});

/* ================================================ 7. schema & lifecycle */

test('schema v27 → v28 is additive and invents no timing evidence', () => {
  assert.equal(SCHEMA_VERSION, 43);
  const old = {
    schemaVersion: 27,
    settings: {},
    decisions: [{ id: 'keep', title: 'Old decision', chosen: 'Something', date: '2026-01-01' }],
    tempoSchedules: [{ id: 'existing', decisionId: 'keep', status: 'armed' }],
  };
  const migrated = migrate(old);
  assert.equal(migrated.raw.schemaVersion, 43);
  assert.deepEqual(migrated.applied.at(-1), '42 → 43');
  assert.equal(migrated.raw.decisions[0].decidedOn, undefined, 'a historical call is not given a made-up moment');
  assert.deepEqual(migrated.raw.tempoSchedules, old.tempoSchedules);
  assert.equal(migrated.raw.settings.tempoDelegatedMaxDays, 7);
  assert.equal(migrated.raw.settings.tempoAutoPropagate, true);

  const state = normalizeState({ schemaVersion: 27 }, { now: NOW }).state;
  assert.deepEqual(state.tempoSchedules, []);
  const legacy = normalizeState({ schemaVersion: 27, decisions: old.decisions }, { now: NOW }).state;
  assert.equal(legacy.decisions[0].decidedOn, null, 'an unmeasured legacy call stays unmeasured');
});

test('normalisation repairs an imported tempo ledger and drops orphans', () => {
  const base = createEmptyState(NOW.toISOString());
  const { state, warnings } = normalizeState({
    ...base,
    decisions: [{ id: 'dec-1', title: 'D', date: '2026-10-01', chosen: '', reviewOn: null }],
    tempoSchedules: [
      { id: 't1', decisionId: 'dec-1', status: 'banana', profile: 'zigzag', derivedAmount: -5, uncertaintyPct: 400, halfLifeDays: 0, decideBy: '2026-13-40', createdOn: '2026-10-01' },
      { id: 't2', decisionId: 'missing-decision', status: 'armed' },
      { id: 't3', decisionId: 'dec-1', status: 'armed', uncertaintyPct: 60, advantageAmount: 500, decidedOn: null, createdAt: '2026-10-02T09:00:00.000Z', updatedAt: '2026-10-02T09:00:00.000Z', history: [{ on: 'nope', action: 'armed' }, { on: '2026-10-02', action: 'edited', note: 'ok' }] },
    ],
  }, { now: NOW });
  assert.equal(state.tempoSchedules.length, 2, 'the orphan is dropped');
  const repaired = state.tempoSchedules.find((t) => t.id === 't1');
  // t3 also belongs to dec-1 and is armed, so t1 is demoted (never deleted) and
  // the decision keeps exactly one live decide-by date.
  assert.equal(repaired.status, 'abandoned');
  assert.ok(repaired.abandonReason.includes('Superseded by the live timebox t3'));
  assert.equal(repaired.profile, 'linear');
  assert.equal(repaired.derivedAmount, null, 'a negative amount is refused, not clamped to zero');
  assert.equal(repaired.uncertaintyPct, 100);
  assert.equal(repaired.halfLifeDays, 1);
  assert.equal(repaired.decideBy, null);
  assert.equal(state.tempoSchedules.filter((t) => ['armed', 'proposed'].includes(t.status)).length, 1);
  const history = state.tempoSchedules.find((t) => t.id === 't3').history;
  assert.equal(history.length, 1);
  assert.ok(warnings.some((w) => w.includes('Tempo timeboxes')));
});

test('normalisation keeps exactly one live timebox per decision', () => {
  const base = createEmptyState(NOW.toISOString());
  const { state, warnings } = normalizeState({
    ...base,
    decisions: [{ id: 'dec-live', title: 'One call, one date', date: '2026-10-01', chosen: '' }],
    tempoSchedules: [
      { id: 'older', decisionId: 'dec-live', status: 'proposed', updatedAt: '2026-10-02T08:00:00.000Z' },
      { id: 'newer', decisionId: 'dec-live', status: 'armed', decideBy: '2026-11-02', updatedAt: '2026-10-05T08:00:00.000Z' },
      { id: 'settled-one', decisionId: 'dec-live', status: 'settled', settledOn: '2026-09-20', updatedAt: '2026-09-20T08:00:00.000Z' },
    ],
  }, { now: NOW });
  assert.equal(state.tempoSchedules.length, 3, 'nothing is deleted');
  const live = state.tempoSchedules.filter((t) => ['armed', 'proposed'].includes(t.status));
  assert.equal(live.length, 1);
  assert.equal(live[0].id, 'newer', 'a commitment outranks a proposal');
  assert.equal(state.tempoSchedules.find((t) => t.id === 'older').status, 'abandoned');
  assert.equal(state.tempoSchedules.find((t) => t.id === 'settled-one').status, 'settled', 'history is never rewritten');
  assert.ok(warnings.some((w) => w.includes('one decide-by date')));
});

test('point-in-time rewind rewinds timeboxes and removes post-cutoff decidedOn stamps', () => {
  const env = seeded();
  const armed = env.api.armTempoSchedule(env.decisionId, { advantageAmount: 9000, uncertaintyPct: 50, decideBy: '2026-11-02' });
  env.api.decideDecision(env.decisionId, { chosen: 'Switch vendor' });
  const asOf = '2026-10-20';
  const { state, fidelity } = reconstructStateAt(env.store.state, asOf);
  // Both the proposal and the armed timebox were created today, so neither
  // existed on 20 October: a record cannot be rewound, only omitted.
  assert.equal(state.tempoSchedules.find((s) => s.id === armed.id), undefined);
  assert.equal(state.decisions.find((d) => d.id === env.decisionId).decidedOn, null);
  assert.equal(state.decisions.find((d) => d.id === env.decisionId).chosen, 'Switch vendor', 'the call itself is preserved');
  assert.equal(fidelity.decisionTempo.level, 'approximate');
  // A timebox that predates the cutoff keeps its settlement until the cutoff passes it.
  const old = reconstructStateAt({
    ...env.store.state,
    tempoSchedules: env.store.state.tempoSchedules.map((s) => ({
      ...s, createdOn: '2026-10-01', createdAt: '2026-10-01T09:00:00.000Z', settledOn: '2026-10-26', status: 'settled', armedOn: '2026-10-02', realizedLatencyDays: 25,
    })),
  }, asOf);
  const rewound = old.state.tempoSchedules.find((s) => s.id === armed.id);
  assert.equal(rewound.status, 'armed', 'a settlement after the cutoff is rewound');
  assert.equal(rewound.realizedLatencyDays, null);
  const earlier = reconstructStateAt(env.store.state, '2026-09-01');
  assert.equal(earlier.state.tempoSchedules.length, 0, 'a timebox created after the cutoff did not exist yet');
});

test('clearDemo removes fabricated timeboxes and keeps real ones', () => {
  const demo = buildDemoState(NOW);
  assert.ok(demo.tempoSchedules.length >= 3);
  const env = harness();
  env.store.seedDemo({ force: true });
  const real = env.api.addDecision({ title: 'A real decision', date: '2026-10-01' });
  env.api.armTempoSchedule(real.id, { decideBy: '2026-11-20' });
  assert.ok(env.store.state.tempoSchedules.some((s) => s.id.includes('-demo-')));
  env.store.clearDemo();
  assert.equal(env.store.state.tempoSchedules.filter((s) => s.id.includes('-demo-')).length, 0);
  assert.ok(env.store.state.tempoSchedules.some((s) => s.id.startsWith('tempo-dt-')), 'real timeboxes survive');
});

/* ==================================================== 8. CSV & signals */

test('CSV scope #28 exports timing economics with no titles or names', () => {
  assert.equal(CSV_EXPORTS.length, 40);
  const descriptor = CSV_EXPORTS.find((s) => s.key === 'decisionTempo');
  assert.ok(descriptor);
  assert.equal(descriptor.sensitive, false);
  const env = seeded();
  env.api.armTempoSchedule(env.decisionId, { advantageAmount: 9000, uncertaintyPct: 55, decideBy: '2026-11-02' });
  const out = exportWorkspaceCsv(env.store.state, 'decisionTempo', { now: NOW });
  assert.equal(out.ok, true);
  assert.ok(out.csv.includes('row_type'));
  assert.ok(out.csv.includes('latency_band'));
  assert.ok(out.csv.includes('open_decision'));
  assert.ok(!out.csv.includes('Switch the billing vendor'), 'no decision titles');
  assert.ok(!out.csv.includes('Priya'), 'no person names');
  assert.ok(!out.csv.includes('Vendor slippage'), 'no case titles');
  const rows = out.csv.trim().split('\n').length;
  assert.ok(rows >= 2);
});

test('DLY signals explain debt, unarmed calls, waiting-pays and measurement gaps', () => {
  // 1. Decision debt: an open, priced call older than its own class guardrail.
  const env = seeded({ date: '2026-06-01' });
  const aged = decisionTempoSignals(env.store.state, NOW);
  const debt = aged.find((s) => s.ruleId === 'DLY-01');
  assert.ok(debt, 'an open call past its guardrail is decision debt');
  assert.equal(debt.severity, 4, 'priced debt is a top-severity signal');
  assert.ok(debt.detail.includes('RULE-DLY-02'));
  assert.ok(aged.every((s) => s.domain === 'Decision tempo' && s.action.route.startsWith('#/tempo')));

  // 2. A priced call with no timebox (propagation off from the start, so
  //    RULE-DLY-03 cannot propose one) is the silent-drift signal.
  const paused = harness();
  paused.api.updateSettings({ tempoAutoPropagate: false });
  const owner = paused.api.addPerson({ name: 'Priya Natarajan', role: 'Engineering Lead' });
  const pausedCase = paused.api.addCase({
    title: 'Vendor slippage on the billing migration',
    kind: 'risk',
    ownerId: owner.id,
    financial: { currency: 'USD', optimistic: 20000, mostLikely: 60000, pessimistic: 120000 },
  });
  const pausedDecision = paused.api.addDecision({ title: 'Switch the billing vendor', date: '2026-10-20', approver: 'Priya Natarajan' });
  paused.store.update((draft) => {
    draft.links.push({ id: 'lnk-paused', sourceType: 'case', sourceId: pausedCase.id, targetType: 'decision', targetId: pausedDecision.id, relation: 'decides', ruleId: 'TEST', summary: 'paused link', createdOn: TODAY, createdAt: NOW.toISOString() });
  }, { type: 'link.created', entity: 'link', entityId: 'lnk-paused', summary: 'paused link' });
  assert.equal(paused.store.state.tempoSchedules.filter((t) => t.decisionId === pausedDecision.id).length, 0);
  const unarmed = decisionTempoSignals(paused.store.state, NOW).find((s) => s.ruleId === 'DLY-02');
  assert.ok(unarmed, 'money at stake with no decide-by date is surfaced');

  // 3. Waiting pays: an evidence plan worth more than deciding today.
  const waited = seeded();
  const armed = waited.api.armTempoSchedule(waited.decisionId, {
    advantageAmount: 18000, uncertaintyPct: 85, halfLifeDays: 6, infoWeeks: 1, infoCostAmount: 900, decideBy: '2026-11-20',
  });
  assert.equal(armed.ok, true);
  const gather = decisionTempoSignals(waited.store.state, NOW).find((s) => s.ruleId === 'DLY-03');
  assert.ok(gather, 'gathering evidence first is surfaced with its value');
  assert.ok(gather.detail.includes('capped by EVPI'));

  // 4. Measurement gap: a decided record with no recorded moment.
  const gap = harness();
  gap.api.addDecision({ title: 'Adopt the pager rota', date: '2026-10-01' });
  gap.store.update((draft) => {
    draft.decisions[0].chosen = 'Adopt';
    draft.decisions[0].decidedOn = null;
  }, { type: 'decision.made', entity: 'decision', entityId: gap.store.state.decisions[0].id, summary: 'legacy record' });
  const measured = decisionTempoSignals(gap.store.state, NOW).find((s) => s.ruleId === 'DLY-06');
  assert.ok(measured, 'an unmeasurable settled decision is named, not guessed');

  // Insights include the tempo domain without duplicating rules.
  const insights = buildInsights(env.store.state, NOW);
  assert.ok(insights.findings.some((f) => f.domain === 'Decision tempo'));
});

test('an empty workspace produces no tempo signals', () => {
  const signals = decisionTempoSignals(createEmptyState(NOW.toISOString()), NOW);
  assert.equal(signals.length, 0);
  const brief = tempoBrief(buildTempoReport(createEmptyState(NOW.toISOString()), { now: NOW }));
  assert.ok(brief.text.includes('Decision tempo brief'));
  assert.ok(brief.sections.length >= 2);
});

/* ============================================================== 9. the UI */

// Await the observable UI state, not a 15/30ms scheduling assumption.
// Fixed sleeps race hashchange/dialog work when the suite shares CPU workers.
async function waitForUI(check, label, timeout = 5000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

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

function click(node) {
  assert.ok(node, 'expected a clickable DOM node');
  node.dispatchEvent(new node.ownerDocument.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
}

async function withApp(fn) {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ storage: env.window.localStorage, now: () => NOW });
  try {
    await fn(app, env);
  } finally {
    app.destroy?.();
    env.dom.window.close();
  }
}

async function axeViolations(env, selector = '#view') {
  if (!env.window.axe) env.window.eval(AXE_SRC);
  const res = await env.window.axe.run(env.document.querySelector(selector), {
    rules: { 'color-contrast': { enabled: false } },
  });
  return Array.from(res.violations).map((v) => `${v.id}: ${v.help}`);
}

test('UI: all five tempo tabs render axe-clean, including the demo workspace', async () => {
  await withApp(async (app, env) => {
    const { document } = env;
    app.ctx.loadDemo();
    assert.ok(app.store.state.tempoSchedules.length >= 3);

    for (const [hash, marker] of [
      ['#/tempo', 'Cost-of-delay queue'],
      ['#/tempo?tab=timing', 'Delay curve'],
      ['#/tempo?tab=ledger', 'Timeboxes'],
      ['#/tempo?tab=calibration', 'Latency band'],
      ['#/tempo?tab=board', 'Board-ready decision tempo brief'],
    ]) {
      window.location.hash = hash;
      await waitForUI(() => document.querySelector('#view')?.textContent.includes(marker), `${marker} on ${hash}`);
      assert.ok(document.body.textContent.includes(marker), `expected ${marker} on ${hash}`);
      assert.deepEqual(await axeViolations(env), [], `${hash} is axe-clean`);
    }
    assert.equal(env.consoleErrors.length, 0, `unexpected console errors: ${env.consoleErrors.join(' | ')}`);
  });
});

test('UI: arming a timebox from the queue writes the position and refreshes the ledger', async () => {
  await withApp(async (app, env) => {
    const { document } = env;
    app.api.addPerson({ name: 'Priya Natarajan', role: 'Engineering Lead' });
    const caseRes = app.api.addCase({
      title: 'Vendor slippage on the billing migration',
      kind: 'risk',
      financial: { currency: 'USD', optimistic: 20000, mostLikely: 60000, pessimistic: 120000 },
    });
    const decision = app.api.addDecision({ title: 'Switch the billing vendor', date: '2026-10-01', approver: 'Priya Natarajan' });
    app.store.update((draft) => {
      draft.links.push({ id: 'lnk-ui', sourceType: 'case', sourceId: caseRes.id, targetType: 'decision', targetId: decision.id, relation: 'decides', ruleId: 'TEST', summary: 'ui', createdOn: TODAY, createdAt: NOW.toISOString() });
    }, { type: 'link.created', entity: 'link', entityId: 'lnk-ui', summary: 'ui link' });

    window.location.hash = '#/tempo';
    await new Promise((r) => setTimeout(r, 30));
    const modelButton = document.querySelector(`[data-testid="tempo-model-${decision.id}"]`);
    assert.ok(modelButton, 'the queue offers a timing model button');
    click(modelButton);
    await new Promise((r) => setTimeout(r, 30));
    const dialog = document.querySelector('.modal[role="dialog"]');
    assert.ok(dialog, 'the timebox dialog opens');
    assert.ok(dialog.textContent.includes('Derived from linked records'));
    assert.ok(dialog.textContent.includes('Believed edge'));
    assert.deepEqual(await axeViolations(env, '.modal[role="dialog"]'), [], 'the dialog is axe-clean');

    const advantage = dialog.querySelector('#tempo-advantage');
    advantage.value = '12000';
    advantage.dispatchEvent(new window.Event('input', { bubbles: true }));
    const uncertainty = dialog.querySelector('#tempo-uncertainty');
    uncertainty.value = '60';
    uncertainty.dispatchEvent(new window.Event('input', { bubbles: true }));
    const preview = dialog.querySelector('.tempo-preview');
    assert.ok(preview.textContent.includes('Carrying cost'));

    const armButton = [...dialog.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Arm timebox');
    click(armButton);
    await new Promise((r) => setTimeout(r, 40));
    const armed = app.store.state.tempoSchedules.filter((s) => s.decisionId === decision.id && s.status === 'armed');
    assert.equal(armed.length, 1);
    assert.equal(armed[0].advantageAmount, 12000);
    assert.equal(armed[0].uncertaintyPct, 60);

    window.location.hash = '#/tempo?tab=ledger';
    await new Promise((r) => setTimeout(r, 30));
    assert.ok(document.body.textContent.includes('Armed'));
    assert.equal(env.consoleErrors.length, 0, `unexpected console errors: ${env.consoleErrors.join(' | ')}`);
  });
});

test('UI: nav badge and Today card surface decision debt', async () => {
  await withApp(async (app, env) => {
    const { document } = env;
    app.api.addPerson({ name: 'Priya Natarajan', role: 'Engineering Lead' });
    // No timebox is armed: the decision is simply older than its own class
    // guardrail, which is what decision debt means.
    app.api.addDecision({ title: 'Choose the warehouse vendor', date: '2026-09-01', approver: 'Priya Natarajan' });
    const report = buildTempoReport(app.store.state, { now: NOW });
    assert.equal(report.totals.decisionDebt, 1);
    window.location.hash = '#/today';
    await new Promise((r) => setTimeout(r, 40));
    assert.ok(document.body.textContent.includes('Decision tempo'));
    const navItem = [...document.querySelectorAll('.nav-item')].find((a) => a.textContent.includes('Decision tempo'));
    assert.ok(navItem);
    assert.ok(navItem.querySelector('.nav-count'), 'the nav shows the debt count');
    assert.deepEqual(await axeViolations(env), []);
  });
});
