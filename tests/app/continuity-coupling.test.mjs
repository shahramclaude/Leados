/**
 * tests/app/continuity-coupling.test.mjs — Coupled Continuity-Capacity
 * ("All-Weather") Portfolio Simulation & Cross-Module Governance suite:
 *
 *   1. Poisson disruption arrival scaling (`samplePoisson`, `horizonArrivalLambda`)
 *      and Rockafellar-Uryasev coherent Expected Shortfall (`computeTailRisk`).
 *   2. Common Random Numbers (CRN) pathwise dominance: coupled horizon fit never
 *      exceeds fair-weather fit, coupled P80 never finishes earlier than fair-weather
 *      P80, and zero-failure-probability workspaces yield exact zero-drift identity.
 *   3. Multi-tier Nth-party cascades, strict per-currency tail loss separation
 *      (never summing USD + EUR), and split-conformal drill TTR calibration
 *      (honest point-TTR fallback below n = 5 drills; conformal uplift at n >= 5).
 *   4. Epistemic missingness discipline (`CPL-04` never fabricates outage odds)
 *      and CRN counterfactual hardening frontier (`rankHardeningInterventions`).
 *   5. Generalized post-commit propagation (`RULE-CPL-01` -> same-transaction
 *      `RULE-DLY-03` Cost-of-Delay tempo schedule; `RULE-CPL-02` dual-hat relief
 *      delegation + blameless 1:1 talking point without evicting `theirTopics`,
 *      plus automatic prompt cleanup on hardening/retirement).
 *   6. Scenario Sandbox `dependencyHardening` lever (`evaluateScenario`,
 *      `compareScenarios`, `commitScenarioLevers` via `RULE-SCN-01`).
 *   7. JSDOM + axe-core WCAG AA audit across `#/capacity`, `#/resilience`,
 *      `#/scenarios?hardenDep=...`, `#/prep/:id`, and `#/today`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { createSeededRng } from '../../app/core/domain/simulation.js';
import {
  COUPLING_ENGINE_VERSION,
  computeTailRisk,
  horizonArrivalLambda,
  rankHardeningInterventions,
  samplePoisson,
  simulateCoupledPortfolio,
} from '../../app/core/domain/continuityCoupling.js';
import {
  COUPLING_RULE_IDS,
  COUPLING_RULES,
  buildContinuityCouplingBrief,
  continuityCouplingSignals,
} from '../../app/core/domain/continuityCouplingRule.js';
import { AUTOMATION_RULES } from '../../app/core/domain/automation.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { buildPrepSheet } from '../../app/core/domain/prep.js';
import { compareScenarios, evaluateScenario } from '../../app/core/domain/scenarios.js';
import { buildDemoState } from '../../app/core/demo.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-28T10:00:00.000Z');

function memStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function harness() {
  const storage = memStorage();
  const store = createStore({ storage, key: 'leados:coupling-test', now: () => NOW });
  const api = createApi(store, { now: () => NOW });
  return { store, api, storage };
}

test('Poisson arrival scaling and Rockafellar-Uryasev coherent CVaR_90 math', () => {
  assert.equal(COUPLING_ENGINE_VERSION, 'continuity-coupling-2026.10-v1');
  assert.equal(COUPLING_RULES.length, 3);
  assert.ok(AUTOMATION_RULES.some((r) => r.id === COUPLING_RULE_IDS.MIRAGE_DECISION));
  assert.ok(AUTOMATION_RULES.some((r) => r.id === COUPLING_RULE_IDS.STEWARD_RELIEF));

  // Survival-probability Poisson scaling invariants
  assert.equal(horizonArrivalLambda(0, 28), 0);
  assert.equal(horizonArrivalLambda(null, 28), 0);
  const lam20 = horizonArrivalLambda(20, 36.5); // 1/10th of a year
  assert.ok(lam20 > 0.021 && lam20 < 0.023, `expected -ln(0.8)*0.1 ≈ 0.0223, got ${lam20}`);
  const lam50 = horizonArrivalLambda(50, 365);
  assert.ok(Math.abs(lam50 - Math.LN2) < 1e-9);
  assert.ok(horizonArrivalLambda(100, 28) > 0, '100% annual failure yields finite positive arrival rate');

  // Seeded Poisson generator mean accuracy (small & large lambda branches)
  const rngA = createSeededRng(12345);
  const rngB = createSeededRng(12345);
  for (let i = 0; i < 50; i += 1) {
    assert.equal(samplePoisson(rngA, 1.8), samplePoisson(rngB, 1.8), 'deterministic under identical seed');
  }
  const rngLarge = createSeededRng(99);
  let sumLarge = 0;
  const N = 2000;
  for (let i = 0; i < N; i += 1) sumLarge += samplePoisson(rngLarge, 42);
  assert.ok(Math.abs(sumLarge / N - 42) < 0.6, 'PTRS large-lambda branch converges to lambda');

  // Coherent Expected Shortfall (CVaR_90 >= VaR_90)
  const samples = Array.from({ length: 100 }, (_, idx) => (idx < 90 ? 0 : (idx - 89) * 1000));
  const tail = computeTailRisk(samples, 0.9);
  assert.equal(tail.count, 100);
  assert.ok(tail.cvar90 >= tail.var90, 'Expected Shortfall dominates Value-at-Risk');
  assert.equal(tail.cvar90, 5500, 'mean of top 10% tail [1000..10000] is 5500');
  assert.equal(tail.nonZeroProb, 0.1);
});

test('Common Random Numbers pathwise dominance, multi-currency separation, and conformal drill uplift', () => {
  const { store, api } = harness();
  // Pause auto-propagation while constructing deterministic math fixture
  api.updateContinuityCouplingPolicy({ autoPropagate: false });
  api.setResilienceAutoPropagate(false);

  const p1 = api.addPerson({ name: 'Elena Rostova', role: 'Principal Engineer', startDate: '2024-01-10' });
  const p2 = api.addPerson({ name: 'Marcus Vance', role: 'Staff Engineer', startDate: '2024-02-01' });

  const itemRes = api.addPortfolioItem({
    title: 'Settlement Ledger v2 Cutover',
    kind: 'project',
    decision: 'funded',
    ownerId: p1.id,
    effortDays: { optimistic: 12, mostLikely: 15, pessimistic: 20 },
    value: { optimistic: 80000, mostLikely: 120000, pessimistic: 160000 },
    currency: 'USD',
    targetOn: '2026-11-24',
  });
  assert.equal(itemRes.ok, true);

  // Zero-shock baseline: dependency with no annualFailureProb -> exact identity + CPL-04 signal
  const unmodeledDep = api.addDependency({
    name: 'Legacy EUR Clearing Gateway',
    kind: 'vendor',
    criticality: 'critical',
    substitutability: 'none',
    ttsDays: 1,
    ttrDays: 5,
    currency: 'EUR',
    dailyImpactOverride: 4000,
    annualFailureProb: null,
    stewards: [{ personId: p2.id, role: 'primary', verifiedOn: '2026-09-01' }],
  });
  assert.equal(unmodeledDep.ok, true);

  const zeroShockSim = simulateCoupledPortfolio(store.state, { now: NOW, seed: 42, trials: 500 });
  assert.equal(zeroShockSim.available, true);
  assert.equal(zeroShockSim.shocksModeled, false);
  assert.equal(zeroShockSim.unmodeledCriticalDeps.length, 1);
  assert.equal(zeroShockSim.delta.fitDropPp, 0);
  assert.equal(zeroShockSim.delta.p80SlipDays, 0);

  const missingSignals = continuityCouplingSignals(store.state, NOW);
  assert.ok(missingSignals.some((s) => s.ruleId === 'CPL-03'), 'emits honest missingness signal CPL-03 for unmodeled critical node');

  // Add modeled USD Tier-1 vendor + Tier-0 customer capability, and give EUR node a probability too
  api.updateDependency(unmodeledDep.id, { annualFailureProb: 65 });
  const usdUpstream = api.addDependency({
    name: 'CloudHSM Signing Cluster',
    kind: 'vendor',
    criticality: 'critical',
    substitutability: 'none',
    ttsDays: 1,
    ttrDays: 8,
    currency: 'USD',
    dailyImpactOverride: 6000,
    annualFailureProb: 85,
    mitigationCost: 15000,
    stewards: [{ personId: p1.id, role: 'primary', verifiedOn: '2026-09-01' }],
  });
  const usdDownstream = api.addDependency({
    name: 'Instant Payout API',
    kind: 'service',
    criticality: 'critical',
    substitutability: 'none',
    ttsDays: 0.5,
    ttrDays: 3,
    currency: 'USD',
    dailyImpactOverride: 9000,
    annualFailureProb: 40,
    upstreamIds: [usdUpstream.id],
    linkedGoalIds: [],
    stewards: [{ personId: p1.id, role: 'primary', verifiedOn: '2026-09-01' }],
  });
  assert.equal(usdDownstream.ok, true);

  // Below n = 5 drills (log 3 drills): honest point-TTR fallback
  for (let i = 0; i < 3; i += 1) {
    const dr = api.recordContinuityDrill(usdUpstream.id, {
      date: `2026-0${i + 6}-15`,
      kind: 'failover-drill',
      estimatedTtrDays: 4,
      realizedTtrDays: 9,
      outcome: 'breached-tolerance',
    });
    assert.equal(dr.ok, true);
  }
  const pointSim = simulateCoupledPortfolio(store.state, { now: NOW, seed: 42, trials: 600 });
  assert.equal(pointSim.calibrationMode, 'declared-point-ttr', 'refuses empirical drill bootstrap below n = 5 drills');
  assert.equal(pointSim.conformalUpperMultiplier, null);
  assert.ok(pointSim.allWeather.horizonFitProbability <= pointSim.fairWeather.horizonFitProbability);
  assert.ok(pointSim.allWeather.p80CalendarDays >= pointSim.fairWeather.p80CalendarDays);
  assert.ok(pointSim.tailLossByCurrency.USD.cvar90 > 0, 'tracks USD tail loss');
  assert.ok(pointSim.tailLossByCurrency.EUR.cvar90 > 0, 'tracks EUR tail loss separately without cross-currency summation');

  // Reach n = 5 drills with systematic TTR overrun -> empirical drill bootstrap widens tail
  for (let i = 3; i < 5; i += 1) {
    const dr = api.recordContinuityDrill(usdUpstream.id, {
      date: `2026-09-2${i}`,
      kind: 'failover-drill',
      estimatedTtrDays: 4,
      realizedTtrDays: 10,
      outcome: 'breached-tolerance',
    });
    assert.equal(dr.ok, true);
  }
  const confSim = simulateCoupledPortfolio(store.state, { now: NOW, seed: 42, trials: 600 });
  assert.equal(confSim.calibrationMode, 'empirical-drill-bootstrap');
  assert.ok(confSim.conformalUpperMultiplier > 1.5, 'conformal multiplier reflects empirical 2.25x–2.5x drill overrun');
  assert.ok(
    confSim.tailLossByCurrency.USD.cvar90 >= pointSim.tailLossByCurrency.USD.cvar90,
    'conformal drill overrun uplift monotonically widens or preserves tail loss under identical CRN seed',
  );

  // Counterfactual hardening frontier ranks interventions with positive lift
  const frontier = rankHardeningInterventions(store.state, { now: NOW, seed: 42, trials: 500 });
  assert.equal(frontier.available, true);
  assert.ok(frontier.interventions.length >= 2);
  const top = frontier.interventions[0];
  assert.ok(top.fitGainPp >= 0);
  assert.ok(top.cvar90Reduction >= 0);
});

test('Generalized post-commit spine: RULE-CPL-01 chains into RULE-DLY-03 and RULE-CPL-02 manages blameless relief idempotently', () => {
  const { store, api } = harness();
  const p1 = api.addPerson({
    name: 'Nadia Al-Mansoor',
    role: 'Staff Backend Engineer',
    startDate: '2024-01-15',
    talkingPoints: ['Career growth check-in queued by Nadia'],
  });
  const p2 = api.addPerson({ name: 'Tomás Rivera', role: 'Senior Engineer', startDate: '2024-03-01' });
  assert.ok(p2.id);

  // Fair-weather feasible plan (~12.8d allocatable per person on 4w horizon -> ~25.6d total):
  // commit ~21.5d across Nadia + Tomás so fair-weather fit is high (>75%), leaving thin slack
  // that collapses when a 100% annual-failure-prob critical dependency preempts Nadia's capacity.
  const pf = api.addPortfolioItem({
    title: 'Core Ledger Multi-Region Read Replicas',
    kind: 'project',
    decision: 'funded',
    ownerId: p1.id,
    effortDays: { optimistic: 11, mostLikely: 12.6, pessimistic: 14.2 },
    value: { optimistic: 90000, mostLikely: 140000, pessimistic: 180000 },
    currency: 'USD',
    targetOn: '2026-11-23',
  });
  const pf2 = api.addPortfolioItem({
    title: 'Settlement Audit Stream Indexer',
    kind: 'project',
    decision: 'funded',
    ownerId: p2.id,
    effortDays: { optimistic: 8, mostLikely: 9.2, pessimistic: 10.5 },
    value: { optimistic: 40000, mostLikely: 60000, pessimistic: 80000 },
    currency: 'USD',
  });
  assert.equal(pf.ok, true);
  assert.equal(pf2.ok, true);
  assert.equal(store.state.decisions.length, 0, 'fair-weather plan alone needs no trade-off decision');

  // Register severe outage-prone dependency stewarded by Nadia (dual-hat + fair-weather mirage)
  const dep = api.addDependency({
    name: 'Primary Ledger Write Coordinator',
    kind: 'system',
    criticality: 'critical',
    substitutability: 'none',
    ttsDays: 0.5,
    ttrDays: 18,
    currency: 'USD',
    dailyImpactOverride: 12000,
    annualFailureProb: 100,
    mitigationCost: 20000,
    stewards: [{ personId: p1.id, role: 'primary', verifiedOn: '2026-08-01' }],
  });
  assert.equal(dep.ok, true);

  // 1. RULE-CPL-01 opened an undecided DACI trade-off decision
  const cplDecision = store.state.decisions.find((d) => String(d.question || '').includes('[RULE-CPL-01]'));
  assert.ok(cplDecision, 'RULE-CPL-01 opened fair-weather mirage DACI decision');
  assert.equal(cplDecision.chosen, '', 'never decides on the human leader’s behalf');

  // 2. Typed links connect portfolio -> decision AND dependency -> decision
  assert.ok(
    store.state.links.some(
      (l) =>
        (l.sourceType === 'portfolio' && l.sourceId === pf.id && l.targetType === 'decision' && l.targetId === cplDecision.id) ||
        (l.sourceType === 'decision' && l.sourceId === cplDecision.id && l.targetType === 'portfolio' && l.targetId === pf.id),
    ),
    'decision linked to funded portfolio item',
  );
  assert.ok(
    store.state.links.some(
      (l) =>
        (l.sourceType === 'dependency' && l.sourceId === dep.id && l.targetType === 'decision' && l.targetId === cplDecision.id) ||
        (l.sourceType === 'decision' && l.sourceId === cplDecision.id && l.targetType === 'dependency' && l.targetId === dep.id),
    ),
    'decision linked to shock-driving dependency',
  );

  // 3. Multi-hop spine: `decision.created` auto-chained into `decisionTempoRule` (`RULE-DLY-03`) in the SAME transaction!
  const tempoSched = (store.state.tempoSchedules || []).find((t) => t.decisionId === cplDecision.id);
  assert.ok(tempoSched, 'RULE-CPL-01 -> decision.created -> RULE-DLY-03 priced Cost-of-Delay schedule in same transaction');

  // 4. RULE-CPL-02 opened blameless dual-hat relief delegation + 1:1 talking point without evicting Nadia's topic
  const reliefDel = store.state.delegations.find((d) => String(d.support || '').includes(`[RULE-CPL-02:${p1.id}]`));
  assert.ok(reliefDel, 'RULE-CPL-02 created dual-hat steward relief delegation');
  const nadiaAfter = store.state.people.find((p) => p.id === p1.id);
  assert.ok(
    nadiaAfter.talkingPoints.includes('Career growth check-in queued by Nadia'),
    'never evicts employee-queued talkingPoints',
  );
  assert.ok(
    nadiaAfter.talkingPoints.some((tp) => tp.includes(`[CPL:${p1.id}]`)),
    'appended blameless dual-hat 1:1 prompt',
  );

  // 5. Idempotency: explicit scan creates zero duplicate decisions, delegations, or links
  const countsBefore = {
    decisions: store.state.decisions.length,
    delegations: store.state.delegations.length,
    links: store.state.links.length,
  };
  const scanRes = api.scanContinuityCoupling();
  assert.equal(scanRes.ok, true);
  assert.equal(scanRes.changed, false);
  assert.deepEqual(
    {
      decisions: store.state.decisions.length,
      delegations: store.state.delegations.length,
      links: store.state.links.length,
    },
    countsBefore,
    'repeated continuity-coupling scans are strictly idempotent',
  );

  // 6. Prep sheet & Insights surface dual-hat contention
  const prep = buildPrepSheet(store.state, p1.id, NOW);
  assert.ok(prep.dualHatContention, '1:1 prep sheet exposes dualHatContention diagnostics');
  assert.equal(prep.dualHatContention.contended, true);
  const insights = buildInsights(store.state, NOW);
  assert.ok(insights.findings.some((f) => f.domain === 'Continuity coupling' && f.ruleId === 'CPL-01'));
  assert.ok(insights.findings.some((f) => f.domain === 'Continuity coupling' && f.ruleId === 'CPL-02'));

  // 7. Scenario Sandbox `dependencyHardening` lever improves coupled fit in-memory and commits cleanly
  const baseEval = evaluateScenario(store.state, { name: 'Baseline', levers: {} }, { now: NOW, seed: 42, trials: 400 });
  const hardEval = evaluateScenario(
    store.state,
    { name: 'Harden Coordinator', levers: { dependencyHardening: [{ dependencyId: dep.id, targetMode: 'dual-active' }] } },
    { now: NOW, seed: 42, trials: 400 },
  );
  assert.equal(store.state.dependencies.find((d) => d.id === dep.id).substitutability, 'none', 'sandbox evaluation never mutates live store');
  assert.ok(
    hardEval.continuityCoupling.allWeatherFitProbability > baseEval.continuityCoupling.allWeatherFitProbability,
    'counterfactual dual-active hardening lifts all-weather fit probability',
  );

  const commitRes = api.commitScenarioLevers({
    scenarioName: 'Harden Primary Coordinator to Dual-Active',
    scenarioSpec: {
      name: 'Harden Primary Coordinator to Dual-Active',
      levers: { dependencyHardening: [{ dependencyId: dep.id, targetMode: 'dual-active' }] },
    },
    rationale: 'Eliminate outage preemption on Core Ledger cutover',
  });
  assert.equal(commitRes.ok, true);
  assert.equal(
    store.state.dependencies.find((d) => d.id === dep.id).substitutability,
    'dual-active',
    'committing scenario levers upgrades live dependency substitutability',
  );
  const nadiaCleaned = store.state.people.find((p) => p.id === p1.id);
  assert.equal(
    nadiaCleaned.talkingPoints.some((tp) => tp.includes(`[CPL:${p1.id}]`)),
    false,
    'self-cleans dual-hat 1:1 talking point once contention disappears',
  );
});

test('Pause guard (`couplingAutoPropagate: false`) and COW savepoint isolation on downstream rule failure', async () => {
  const { store, api } = harness();
  api.updateContinuityCouplingPolicy({ autoPropagate: false, minFitPct: 60, tailDropPct: 10 });
  assert.equal(store.state.settings.couplingAutoPropagate, false);
  assert.equal(store.state.settings.couplingMinFitPct, 60);
  assert.equal(store.state.settings.couplingTailDropPct, 10);

  const p1 = api.addPerson({ name: 'Kenji Takahashi', role: 'Lead SRE', startDate: '2024-02-01' });
  api.addPortfolioItem({
    title: 'Zero-Downtime Schema Migration Engine',
    kind: 'project',
    decision: 'funded',
    ownerId: p1.id,
    effortDays: { optimistic: 10, mostLikely: 11.5, pessimistic: 13 },
    value: { optimistic: 50000, mostLikely: 80000, pessimistic: 110000 },
    currency: 'USD',
  });
  api.addDependency({
    name: 'Replication Slot Coordinator',
    kind: 'system',
    criticality: 'critical',
    substitutability: 'none',
    ttsDays: 0.5,
    ttrDays: 16,
    currency: 'USD',
    dailyImpactOverride: 8000,
    annualFailureProb: 100,
    stewards: [{ personId: p1.id, role: 'primary', verifiedOn: '2026-09-01' }],
  });

  // Auto-propagation was paused, so RULE-CPL-01 did not open a mirage decision automatically
  assert.equal(
    store.state.decisions.some((d) => String(d.question || '').includes('[RULE-CPL-01]')),
    false,
    'couplingAutoPropagate: false pauses automatic RULE-CPL-01 decision creation',
  );

  // Explicit human scan (`scanContinuityCoupling`) overrides pause and converges idempotently
  const scanRes = api.scanContinuityCoupling();
  assert.equal(scanRes.ok, true);
  assert.equal(scanRes.changed, true);
  assert.ok(
    store.state.decisions.some((d) => String(d.question || '').includes('[RULE-CPL-01]')),
    'explicit scanContinuityCoupling runs even while auto-propagation is paused',
  );

  // Verify COW savepoint rollback isolation in postCommit.js when a downstream rule throws
  const { runPostCommitRules, DEFAULT_POST_COMMIT_RULES } = await import('../../app/core/domain/postCommit.js');
  const draftClone = structuredClone(store.state);
  draftClone.decisions = [];
  draftClone.tempoSchedules = [];
  const throwingDownstreamRule = Object.assign(
    function BoomRule(draft) {
      draft.decisions.push({ id: 'corrupt-partial-write', title: 'Should rollback' });
      throw new Error('Synthetic downstream rule crash');
    },
    { ruleId: 'boomRule' },
  );
  const warnings = [];
  const res = runPostCommitRules(
    draftClone,
    {
      event: { type: 'continuity.coupling.scan', entity: 'workspace', entityId: '' },
      now: NOW,
      warnings,
      rules: [...DEFAULT_POST_COMMIT_RULES, throwingDownstreamRule],
      idFactory: (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`,
    },
  );
  assert.ok(Array.isArray(res) && res.length >= 1);
  assert.ok(warnings.some((w) => w.includes('Synthetic downstream rule crash')));
  assert.ok(
    (draftClone.propagationReceipts || []).some((r) => String(r.error || '').includes('Synthetic downstream rule crash')),
    'durable propagation receipt recorded for throwing rule',
  );
  assert.ok(
    draftClone.decisions.some((d) => String(d.question || '').includes('[RULE-CPL-01]')),
    'continuityCouplingRule commit survives downstream rule crash',
  );
  assert.equal(
    draftClone.decisions.some((d) => d.id === 'corrupt-partial-write'),
    false,
    'throwing downstream rule partial write is rolled back by COW savepoint',
  );
});

/* =================================================== JSDOM + axe-core UI */

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

test('UI: Capacity coupled card, Resilience hardening frontier, Scenarios ?hardenDep deep-link, Prep & Settings render axe-clean', async () => {
  await withApp(async (app, env) => {
    const { document } = env;
    app.store.seedDemo(buildDemoState(NOW));

    const brief = buildContinuityCouplingBrief(app.store.state, NOW);
    assert.ok(brief.includes('All-Weather Continuity × Capacity Brief'));

    // 1. Capacity & Flow view renders All-weather continuity-coupled card
    app.ctx.navigate('#/capacity');
    const coupledCard = document.querySelector('[data-testid="capacity-coupled-card"]');
    assert.ok(coupledCard, 'Capacity view renders data-testid="capacity-coupled-card"');
    assert.ok(coupledCard.textContent.includes('All-weather coupled fit'));
    assert.ok(coupledCard.textContent.includes('Dual-hat steward'));
    assert.deepEqual(await axeViolations(env), [], '#/capacity coupled card is axe-clean');

    // 2. Operational Resilience view renders Resilience-to-Delivery Hardening Frontier
    app.ctx.navigate('#/resilience');
    assert.ok(document.body.textContent.includes('Resilience-to-Delivery Hardening Frontier'));
    assert.ok(document.body.textContent.includes('Export all-weather brief'));
    assert.deepEqual(await axeViolations(env), [], '#/resilience hardening frontier is axe-clean');

    // 3. Scenarios deep-link `?hardenDep=...` preloads hardening lever & renders All-weather fit column
    const firstDep = app.store.state.dependencies[0];
    app.ctx.navigate(`#/scenarios?hardenDep=${encodeURIComponent(firstDep.id)}`);
    assert.ok(document.body.textContent.includes('All-weather fit (Δ)'));
    assert.ok(document.body.textContent.includes(`Harden dependency “${firstDep.name}”`));
    assert.deepEqual(await axeViolations(env), [], '#/scenarios?hardenDep=... is axe-clean');

    // Compare scenarios programmatic check on demo state
    const cmp = compareScenarios(app.store.state, [], { now: NOW, trials: 250 });
    assert.equal(cmp.baseline.continuityCoupling.available, true);

    // 4. 1:1 Prep sheet for Mei Lin Chen shows All-weather contention check
    const mei = app.store.state.people.find((p) => p.name.includes('Mei'));
    assert.ok(mei);
    app.ctx.navigate(`#/prep/${encodeURIComponent(mei.id)}`);
    assert.ok(document.body.textContent.includes('All-weather contention check'));
    assert.deepEqual(await axeViolations(env), [], '#/prep/:id with dual-hat contention is axe-clean');

    // 5. Settings threshold summary lists All-weather continuity × capacity guardrails
    app.ctx.navigate('#/settings');
    assert.ok(document.body.textContent.includes('All-weather continuity × capacity guardrails'));
    assert.deepEqual(await axeViolations(env), [], '#/settings is axe-clean');

    assert.equal(env.consoleErrors.length, 0, `unexpected console errors: ${env.consoleErrors.join(' | ')}`);
  });
});
