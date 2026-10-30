/**
 * tests/app/resilience.test.mjs — Operational Resilience, Dependency & Continuity
 * Terminal suite (Schema v29, RES-01..07, RULE-RES-01..06):
 *
 *   1. Simchi-Levi TTS/TTR/REI supply-chain resilience, multi-currency financial
 *      exposure derivation, and 3-tier Nth-party common-mode cascade (EU DORA Art. 29).
 *   2. Avelino minimal hitting-set Bus Factor & the epistemic unverified-backup
 *      firewall (unverified trainees never inflate Bus Factor).
 *   3. Herfindahl-Hirschman Index (HHI), Williamson supplier hold-up risk,
 *      redundancy payback ROI, and split-conformal continuity drill calibration
 *      (refuses empirical quantiles below n = 5 drills).
 *   4. Counterfactual Disruption Stress Lab (`simulateDisruptionScenario`) —
 *      zero-write multi-tier + human unavailability cascade and capacity contention.
 *   5. Post-commit automation (`RULE-RES-01..06`) + atomic same-transaction
 *      cross-module cascade (`RULE-RES-03` -> `RULE-DLY-03`), DAG cycle guard,
 *      and `resilienceAutoPropagate` pause switch.
 *   6. Schema v29 migration, historical `reconstructStateAt` Bus Factor rewind,
 *      CSV scope #29 formula-injection neutralization, and `clearDemo()`.
 *   7. Regression guards for audited Session 45 defects (#1..#9).
 *   8. JSDOM + axe-core accessibility across all 5 `#/resilience` tabs,
 *      `#/resilience/:id`, interactive dialogs, Today, 1:1 Prep, and Person views.
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
  RESILIENCE_ENGINE_VERSION,
  RESILIENCE_MIN_DRILL_SAMPLES,
  RESILIENCE_RULES,
  analyzeDependencyNetwork,
  buildResilienceBrief,
  buildResilienceReport,
  computeConcentrationMetrics,
  computeHhi,
  computeTeamBusFactor,
  dependenciesForPerson,
  deriveDependencyImpact,
  evaluateDrillCalibration,
  evaluateHoldUpRisk,
  evaluateRedundancyEconomics,
  evaluateStewardship,
  resilienceSignals,
  simulateDisruptionScenario,
} from '../../app/core/domain/resilience.js';
import { AUTOMATION_RULES } from '../../app/core/domain/automation.js';
import { analyzeIntakeText } from '../../app/core/domain/intake.js';
import { reconstructStateAt } from '../../app/core/domain/health.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { buildPrepSheet } from '../../app/core/domain/prep.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-27T10:00:00.000Z');

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
  const store = createStore({ storage, key: 'leados:resilience-test', now: () => NOW });
  const api = createApi(store, { now: () => NOW });
  return { store, api, storage };
}

/* ================================= 1. Simchi-Levi TTS/TTR/REI & Nth-Party */

test('Simchi-Levi TTS/TTR/REI, multi-currency non-invention, and 3-tier Nth-party choke points', () => {
  assert.equal(RESILIENCE_ENGINE_VERSION, 'resilience-2026.10-v1');
  assert.equal(RESILIENCE_MIN_DRILL_SAMPLES, 5);
  const { store, api } = harness();
  const stewardA = api.addPerson({ name: 'Elena Rostova', role: 'Staff Engineer', startDate: '2024-03-01' });
  const stewardB = api.addPerson({ name: 'Marcus Vance', role: 'Platform Engineer', startDate: '2024-06-01' });

  const usdBudget = api.addBudget({ name: 'Cloud & Identity Ops', currency: 'USD', limit: 365000 });
  const eurBudget = api.addBudget({ name: 'EU Regulated Clearing', currency: 'EUR', limit: 182500 });
  assert.equal(usdBudget.ok, true);
  assert.equal(eurBudget.ok, true);
  // Encumber real commitments on the envelopes (empty budget envelopes never invent exposure)
  assert.equal(api.addBudgetLine(usdBudget.id, { title: 'US Infra Commitment', status: 'committed', committedAmount: 365000 }).ok, true);
  assert.equal(api.addBudgetLine(eurBudget.id, { title: 'SEPA Gateway Commitment', status: 'committed', committedAmount: 182500 }).ok, true);

  // Tier-2 sub-tier vendor (hidden common-mode choke point)
  const tier2 = api.addDependency({
    name: 'CloudHSM Root PKI Cluster',
    kind: 'vendor',
    criticality: 'critical',
    ttsDays: 1,
    ttrDays: 8,
    substitutability: 'none',
    annualSpend: 48000,
    currency: 'USD',
    stewards: [
      { personId: stewardA.id, role: 'primary', verifiedOn: '2026-09-01' },
      { personId: stewardB.id, role: 'backup', verifiedOn: '2026-09-15' },
    ],
  });
  assert.equal(tier2.ok, true);

  // Tier-1 internal platform depending on Tier-2
  const tier1 = api.addDependency({
    name: 'Token Signing Gateway',
    kind: 'system',
    criticality: 'critical',
    ttsDays: 2,
    ttrDays: 3,
    substitutability: 'none',
    upstreamIds: [tier2.id],
    linkedBudgetId: usdBudget.id,
    stewards: [
      { personId: stewardA.id, role: 'primary', verifiedOn: '2026-09-01' },
      { personId: stewardB.id, role: 'backup', verifiedOn: '2026-09-15' },
    ],
  });
  assert.equal(tier1.ok, true);

  // Two customer-facing services sharing Tier-1 (and transitively Tier-2)
  const svcUsd = api.addDependency({
    name: 'US Checkout & Settlement',
    kind: 'service',
    criticality: 'critical',
    ttsDays: 1,
    ttrDays: 2,
    substitutability: 'none',
    upstreamIds: [tier1.id],
    linkedBudgetId: usdBudget.id,
    stewards: [
      { personId: stewardA.id, role: 'primary', verifiedOn: '2026-09-01' },
      { personId: stewardB.id, role: 'backup', verifiedOn: '2026-09-15' },
    ],
  });
  const svcEur = api.addDependency({
    name: 'SEPA Instant Payouts',
    kind: 'service',
    criticality: 'critical',
    ttsDays: 2,
    ttrDays: 2,
    substitutability: 'warm-standby',
    warmSwitchDays: 4, // caps incoming 8d cascade at 4d -> cascading shortfall = 4 - 2 = 2d
    upstreamIds: [tier1.id],
    linkedBudgetId: eurBudget.id,
    currency: 'EUR',
    stewards: [
      { personId: stewardA.id, role: 'primary', verifiedOn: '2026-09-01' },
      { personId: stewardB.id, role: 'backup', verifiedOn: '2026-09-15' },
    ],
  });
  assert.equal(svcUsd.ok, true);
  assert.equal(svcEur.ok, true);

  // Unpriced process: never invents a synthetic dollar figure
  const unpriced = api.addDependency({
    name: 'Quarterly Access Attestation',
    kind: 'process',
    criticality: 'supporting',
    ttsDays: 5,
    ttrDays: 2,
    substitutability: 'dual-active',
    stewards: [{ personId: stewardA.id, role: 'primary', verifiedOn: '2026-09-01' }],
  });
  assert.equal(unpriced.ok, true);

  const unpricedRec = store.state.dependencies.find((d) => d.id === unpriced.id);
  const unpricedImpact = deriveDependencyImpact(unpricedRec, store.state);
  assert.equal(unpricedImpact.priced, false);
  assert.equal(unpricedImpact.dailyImpact, null, 'unpriced capability never invents synthetic monetary exposure');

  const network = analyzeDependencyNetwork(store.state, NOW);
  const mTier2 = network.nodeMetrics.get(tier2.id);
  const mSvcUsd = network.nodeMetrics.get(svcUsd.id);
  const mSvcEur = network.nodeMetrics.get(svcEur.id);

  // Tier-2 8d outage propagates through Tier-1 (none) to US Checkout (TTS 1d -> 7d cascading shortfall)
  assert.equal(mTier2.directShortfallDays, 7);
  assert.equal(mSvcUsd.worstIncomingOutageDays, 8);
  assert.equal(mSvcUsd.cascadingShortfallDays, 7);

  // Warm-standby on SEPA caps incoming 8d outage at warmSwitchDays = 4d -> shortfall = 4 - 2 = 2d
  assert.equal(mSvcEur.worstIncomingOutageDays, 4);
  assert.equal(mSvcEur.cascadingShortfallDays, 2);

  // Multi-currency discipline: USD and EUR exposures are normalized within their currency cohort
  assert.ok(mSvcUsd.rei !== null && mSvcUsd.rei >= 0 && mSvcUsd.rei <= 1);
  assert.ok(mSvcEur.rei !== null && mSvcEur.rei >= 0 && mSvcEur.rei <= 1);
  assert.equal(mSvcUsd.primaryBlastCurrency, 'USD');
  assert.equal(mSvcEur.primaryBlastCurrency, 'EUR');

  // EU DORA Art. 29 Nth-party visibility: Tier-2 is detected as a sub-tier choke point with 3 transitive dependents
  const choke = network.chokePoints.find((c) => c.id === tier2.id);
  assert.ok(choke, 'sub-tier common-mode choke point is surfaced');
  assert.equal(choke.downstreamCount, 3);
  assert.equal(choke.isSubTierChokePoint, true);
});

/* =================== 2. Avelino Bus Factor & Epistemic Verification Guard */

test('Avelino minimal hitting-set Bus Factor & unverified-backup epistemic firewall', () => {
  const { store, api } = harness();
  const priya = api.addPerson({ name: 'Priya Nair', role: 'Principal SRE', startDate: '2023-05-01' });
  const jonas = api.addPerson({ name: 'Jonas Lindqvist', role: 'Senior Engineer', startDate: '2025-01-10' });
  const mei = api.addPerson({ name: 'Mei Lin', role: 'Backend Engineer', startDate: '2025-04-01' });

  // Critical service with Priya verified, Jonas only a trainee (verifiedOn: null)
  const dep1 = api.addDependency({
    name: 'Ledger Reconciliation Engine',
    kind: 'service',
    criticality: 'critical',
    ttsDays: 3,
    ttrDays: 2,
    stewards: [
      { personId: priya.id, role: 'primary', verifiedOn: '2026-08-01' },
      { personId: jonas.id, role: 'trainee', verifiedOn: null },
    ],
  });
  const dep2 = api.addDependency({
    name: 'Settlement Batch Scheduler',
    kind: 'system',
    criticality: 'critical',
    ttsDays: 4,
    ttrDays: 2,
    stewards: [
      { personId: priya.id, role: 'primary', verifiedOn: '2026-08-01' },
      { personId: mei.id, role: 'backup', verifiedOn: '2026-09-10' },
    ],
  });
  assert.equal(dep1.ok, true);
  assert.equal(dep2.ok, true);

  // Epistemic guard: unverified trainee Jonas does NOT count toward Bus Factor on dep1!
  const rec1 = store.state.dependencies.find((d) => d.id === dep1.id);
  const st1Before = evaluateStewardship(rec1, store.state, NOW);
  assert.equal(st1Before.busFactor, 1, 'unverified trainee must not raise Bus Factor above 1');
  assert.equal(st1Before.inTrainingCount, 1);

  // Team minimal hitting-set Bus Factor = 1 because losing Priya alone stalls dep1 (>=50% of 2 capabilities)!
  const bfBefore = computeTeamBusFactor(store.state, NOW);
  assert.equal(bfBefore.portfolioBusFactor, 1);
  assert.deepEqual(bfBefore.minimalCutSet.map((p) => p.personId), [priya.id]);

  // Explicit verification upgrades Jonas and raises BOTH node Bus Factor and Team Bus Factor to 2
  const verified = api.verifyDependencySteward(dep1.id, jonas.id, {
    verifiedOn: '2026-10-20',
    notes: 'Completed solo failover runbook execution',
  });
  assert.equal(verified.ok, true);

  const rec1After = store.state.dependencies.find((d) => d.id === dep1.id);
  const st1After = evaluateStewardship(rec1After, store.state, NOW);
  assert.equal(st1After.busFactor, 2);
  assert.equal(st1After.inTrainingCount, 0);

  const bfAfter = computeTeamBusFactor(store.state, NOW);
  assert.equal(bfAfter.portfolioBusFactor, 2, 'once every critical node has >=2 distinct verified stewards, minimal cut-set grows to 2');

  // Archiving Jonas immediately drops dep1 Bus Factor back to 1
  api.archivePerson(jonas.id);
  const st1Archived = evaluateStewardship(
    store.state.dependencies.find((d) => d.id === dep1.id),
    store.state,
    NOW,
  );
  assert.equal(st1Archived.busFactor, 1);
  assert.equal(st1Archived.archivedCount, 1);
});

/* ============ 3. HHI, Williamson Hold-Up, Redundancy ROI & Conformal Drills */

test('HHI vendor concentration, Williamson hold-up, redundancy ROI, and split-conformal drill guard', () => {
  // Exact Herfindahl-Hirschman Index: 70% + 20% + 10% -> 4900 + 400 + 100 = 5400
  const hhi = computeHhi([
    { id: 'v1', label: 'Vendor A', weight: 70000 },
    { id: 'v2', label: 'Vendor B', weight: 20000 },
    { id: 'v3', label: 'Vendor C', weight: 10000 },
  ]);
  assert.equal(hhi.hhi, 5400);
  assert.equal(hhi.band, 'high');
  assert.equal(hhi.cr1Pct, 70);

  const { store, api } = harness();
  const owner = api.addPerson({ name: 'Soren Lind', role: 'Ops Lead', startDate: '2024-01-10' });
  const vDom = api.addDependency({
    name: 'Monopoly KYC Provider',
    kind: 'vendor',
    criticality: 'critical',
    ttsDays: 1,
    ttrDays: 12,
    substitutability: 'none',
    annualSpend: 90000,
    annualFailureProb: 25,
    mitigationCost: 15000,
    dailyImpactOverride: 10000,
    currency: 'USD',
    contractRenewalOn: '2026-11-25', // within 60d renewal window
    exitPlanSummary: '',
    stewards: [{ personId: owner.id, role: 'primary', verifiedOn: '2026-06-01' }],
  });
  const vMin = api.addDependency({
    name: 'Secondary SMS Gateway',
    kind: 'vendor',
    criticality: 'supporting',
    ttsDays: 5,
    ttrDays: 1,
    substitutability: 'warm-standby',
    annualSpend: 10000,
    currency: 'USD',
    exitPlanSummary: 'Twilio/MessageBird dual-configured with Terraform toggle.',
    stewards: [{ personId: owner.id, role: 'primary', verifiedOn: '2026-06-01' }],
  });
  assert.equal(vDom.ok, true);
  assert.equal(vMin.ok, true);

  const conc = computeConcentrationMetrics(store.state, NOW);
  const usdCohort = conc.vendorByCurrency.find((c) => c.currency === 'USD');
  assert.ok(usdCohort);
  assert.equal(usdCohort.hhi, 8200); // 90^2 + 10^2 = 8100 + 100 = 8200

  const network = analyzeDependencyNetwork(store.state, NOW);
  const domDep = store.state.dependencies.find((d) => d.id === vDom.id);
  const holdUp = evaluateHoldUpRisk(domDep, network.nodeMetrics.get(vDom.id), store.state);
  assert.equal(holdUp.level, 'high');
  assert.ok(holdUp.score >= 60);

  const econ = evaluateRedundancyEconomics(
    domDep,
    network.nodeMetrics.get(vDom.id),
    network.valuationById.get(vDom.id),
  );
  // 11d shortfall * $10,000/day = $110,000 blast exposure; at p = 25%, expectedAnnualLoss = $27,500 vs $15,000 mitigation -> net +$12,500
  assert.equal(econ.available, true);
  assert.equal(econ.expectedAnnualLoss, 27500);
  assert.equal(econ.netAnnualBenefit, 12500);
  assert.ok(econ.roiMultiple > 0.8);

  // Split-conformal drill TTR calibration refuses quantiles below n = 5 paired drills
  for (const [est, real] of [[2, 3], [2, 4], [3, 5], [1, 2]]) {
    const r = api.recordContinuityDrill(vMin.id, {
      date: '2026-10-15',
      kind: 'failover-drill',
      estimatedTtrDays: est,
      realizedTtrDays: real,
      outcome: 'within-tolerance',
      scenario: 'Simulated regional SMS outage',
    });
    assert.equal(r.ok, true);
  }
  const calBelow = evaluateDrillCalibration(store.state, NOW);
  assert.equal(calBelow.n, 4);
  assert.equal(calBelow.sufficient, false);
  assert.equal(calBelow.band.sufficient, false, 'must never fabricate conformal quantiles below n = 5');
  assert.equal(calBelow.band.highFactor, null, 'must never fabricate conformal quantiles below n = 5');

  // 5th paired drill unlocks distribution-free split-conformal calibration band
  api.recordContinuityDrill(vMin.id, {
    date: '2026-10-20',
    kind: 'failover-drill',
    estimatedTtrDays: 2,
    realizedTtrDays: 6, // 3.0x ratio
    outcome: 'within-tolerance',
    scenario: 'Full DNS + webhook cutover test',
  });
  const calReady = evaluateDrillCalibration(store.state, NOW);
  assert.equal(calReady.n, 5);
  assert.equal(calReady.sufficient, true);
  assert.ok(calReady.band && calReady.band.highFactor >= 2.0);
  assert.equal(calReady.optimisticBias, true);
});

/* ===================== 4. Counterfactual Stress Lab (Zero-Write + Capacity) */

test('simulateDisruptionScenario runs zero-write shocks and catches overloaded surviving backups', () => {
  const { store, api } = harness();
  const primary = api.addPerson({ name: 'Amina Patel', role: 'Lead SRE', startDate: '2023-02-01' });
  const backup = api.addPerson({ name: 'Devon Brooks', role: 'Platform Engineer', startDate: '2024-02-01' });

  // Overload Devon in Capacity (>=90% utilisation)
  const capItem = api.addPortfolioItem({
    title: 'Database Sharding Cutover',
    kind: 'project',
    decision: 'funded',
    ownerId: backup.id,
    effortDays: { optimistic: 45, mostLikely: 55, pessimistic: 70 },
  });
  assert.equal(capItem.ok, true);

  const goal = api.addGoal({ title: 'Maintain 99.95% Payment Availability', ownerId: primary.id, dueDate: '2026-12-31' });
  const dep = api.addDependency({
    name: 'Core Payment Ledger',
    kind: 'service',
    criticality: 'critical',
    ttsDays: 1,
    ttrDays: 5,
    dailyImpactOverride: 12000,
    currency: 'USD',
    linkedGoalIds: [goal.id],
    stewards: [
      { personId: primary.id, role: 'primary', verifiedOn: '2026-08-01' },
      { personId: backup.id, role: 'backup', verifiedOn: '2026-08-15' },
    ],
  });
  assert.equal(dep.ok, true);

  const revBefore = store.state.meta.revision;
  const auditBefore = store.state.events.length;

  // Shock 1: Primary steward unavailable -> backup survives, BUT capacity contention warning fires!
  const simBackup = simulateDisruptionScenario(
    store.state,
    { unavailablePersonIds: [primary.id], disruptedDependencyIds: [] },
    NOW,
  );
  assert.equal(simBackup.overloadedBackupWarnings.length, 1);
  assert.equal(simBackup.overloadedBackupWarnings[0].personId, backup.id);

  // Shock 2: Both stewards unavailable -> capability human-stalled, tolerance breached, goal stalled!
  const simBoth = simulateDisruptionScenario(
    store.state,
    { unavailablePersonIds: [primary.id, backup.id], disruptedDependencyIds: [dep.id], durationDaysOverride: 6 },
    NOW,
  );
  assert.equal(simBoth.breachingCount, 1);
  assert.equal(simBoth.humanStalledCount, 1);
  assert.ok(simBoth.stalledGoals.some((g) => g.id === goal.id));
  assert.equal(simBoth.lossByCurrency[0].amount, 60000); // (6 - 1) * $12,000

  // Zero-write guarantee
  assert.equal(store.state.meta.revision, revBefore);
  assert.equal(store.state.events.length, auditBefore);
});

/* ======= 5. Post-Commit Rules (RULE-RES-01..06) + Multi-Stage Tempo Cascade */

test('RULE-RES-01..06 + atomic same-transaction cascade into Decision Tempo RULE-DLY-03', () => {
  const { store, api } = harness();
  const lead = api.addPerson({ name: 'Nadia Al-Mansoor', role: 'Infra Lead', startDate: '2023-09-01' });
  const shadow = api.addPerson({ name: 'Tomás Herrera', role: 'Backend Engineer', startDate: '2025-03-01' });

  const goal = api.addGoal({ title: 'Zero-Downtime Enterprise SSO', ownerId: lead.id, dueDate: '2026-12-31' });
  const budget = api.addBudget({
    name: 'Identity & Security Envelope',
    currency: 'USD',
    limit: 365000,
  });
  assert.equal(budget.ok, true);
  assert.equal(
    api.addBudgetLine(budget.id, { title: 'Annual IdP & PKI Spend', status: 'committed', committedAmount: 365000 }).ok,
    true,
  );

  const negotiation = api.addNegotiation({
    title: 'AuthGrid Annual Enterprise Renewal',
    counterparty: 'AuthGrid Inc.',
    kind: 'vendor',
    stakesCurrency: 'USD',
    stakesValue: 120000,
    unitLabel: 'USD annual contract',
    direction: 'lower-is-better',
    targetValue: 95000,
    reservationValue: 120000,
    counterpartyAnchor: 145000,
    ourBatna: 'No secondary IdP tested yet',
    ourBatnaValue: 140000,
  });
  assert.equal(negotiation.ok, true);

  // Register a critical sole-source capability with Bus Factor 1 + survival shortfall (TTR 9d > TTS 2d)
  const criticalSvc = api.addDependency({
    name: 'Enterprise SAML Federation Broker',
    kind: 'service',
    criticality: 'critical',
    ttsDays: 2,
    ttrDays: 9,
    substitutability: 'none',
    linkedGoalIds: [goal.id],
    linkedBudgetId: budget.id,
    stewards: [
      { personId: lead.id, role: 'primary', verifiedOn: '2026-09-01' },
      { personId: shadow.id, role: 'trainee', verifiedOn: null },
    ],
  });
  assert.equal(criticalSvc.ok, true);

  // 1. RULE-RES-01 synced derivedDailyImpact from committed budget line ($365,000 / 365d = $1,000/day) and created typed links
  const depRec = store.state.dependencies.find((d) => d.id === criticalSvc.id);
  assert.equal(depRec.derivedDailyImpact, 1000);
  assert.equal(depRec.derivedCurrency, 'USD');
  assert.ok(store.state.links.some((l) => l.ruleId === 'RULE-RES-01' && l.relation === 'stewards'));

  // 2. RULE-RES-02 auto-created a blameless cross-training Delegation AND queued a 1:1 talking point
  const crossTrainDel = store.state.delegations.find((d) => String(d.support || '').includes(`[RULE-RES-02:${criticalSvc.id}]`));
  assert.ok(crossTrainDel, 'RULE-RES-02 created cross-training delegation');
  const leadAfter = store.state.people.find((p) => p.id === lead.id);
  assert.ok(
    (leadAfter.talkingPoints || []).some((line) => String(line || '').includes(`[Resilience SPOF ${criticalSvc.id}]`)),
    'RULE-RES-02 queued blameless SPOF talking point',
  );

  // 3. RULE-RES-03 auto-created a DACI Continuity Trade-off Decision AND RULE-DLY-03
  //    in Session 44's Decision Tempo engine atomically priced & armed a timebox in the SAME write!
  const contDec = store.state.decisions.find((d) => String(d.context || '').includes(`[RULE-RES-03:${criticalSvc.id}]`));
  assert.ok(contDec, 'RULE-RES-03 created DACI continuity decision');
  const autoTempo = store.state.tempoSchedules.find((t) => t.decisionId === contDec.id);
  assert.ok(autoTempo, 'RULE-DLY-03 chained atomically off RULE-RES-03 in the exact same transaction');

  // 4. RULE-RES-04 appends Williamson hold-up leverage trace onto linked Negotiation
  const vendorDep = api.addDependency({
    name: 'AuthGrid Managed IdP',
    kind: 'vendor',
    criticality: 'critical',
    ttsDays: 1,
    ttrDays: 10,
    substitutability: 'none',
    annualSpend: 120000,
    currency: 'USD',
    contractRenewalOn: '2026-11-30',
    linkedNegotiationId: negotiation.id,
    stewards: [{ personId: lead.id, role: 'primary', verifiedOn: '2026-09-01' }],
  });
  assert.equal(vendorDep.ok, true);
  const negAfter = store.state.negotiations.find((n) => n.id === negotiation.id);
  assert.ok(negAfter.notes.includes(`[RULE-RES-04:${vendorDep.id}]`), 'RULE-RES-04 injected hold-up warning into negotiation notes');

  // 5. RULE-RES-05: Recording a breached continuity drill shifts Goal to at-risk AND opens an Operational Case
  const drillRes = api.recordContinuityDrill(criticalSvc.id, {
    date: '2026-10-25',
    kind: 'failover-drill',
    estimatedTtrDays: 4,
    realizedTtrDays: 6, // > TTS (2d)
    outcome: 'breached-tolerance',
    scenario: 'Primary IdP certificate expiry failover drill',
    gapNote: 'Manual metadata reload took 6 days due to hardcoded SP ACS endpoints',
  });
  assert.equal(drillRes.ok, true);
  const goalAfter = store.state.goals.find((g) => g.id === goal.id);
  assert.equal(goalAfter.confidence, 'at-risk', 'RULE-RES-05 shifted underpinned goal to at-risk');
  const breachCase = store.state.cases.find((c) => c.title.includes('Enterprise SAML Federation Broker'));
  assert.ok(breachCase, 'RULE-RES-05 opened linked remediation operational case');

  // 6. RULE-RES-06: Completing the cross-training delegation logs history WITHOUT fabricating verifiedOn
  api.completeDelegation(crossTrainDel.id, { completionNote: 'Shadow runbook completed' });
  const depAfterDel = store.state.dependencies.find((d) => d.id === criticalSvc.id);
  const shadowSteward = depAfterDel.stewards.find((s) => s.personId === shadow.id);
  assert.equal(shadowSteward.verifiedOn, null, 'completing delegation never fabricates human verification');
  assert.ok(depAfterDel.history.some((h) => h.action === 'cross-training-completed'));

  // 7. DAG cycle prevention rejects self-loops and cyclic upstream graphs
  const childDep = api.addDependency({
    name: 'Admin Portal SSO',
    kind: 'service',
    criticality: 'important',
    upstreamIds: [criticalSvc.id],
  });
  assert.equal(childDep.ok, true);
  const cycleAttempt = api.updateDependency(criticalSvc.id, {
    upstreamIds: [childDep.id],
  });
  assert.equal(cycleAttempt.ok, false);
  assert.equal(cycleAttempt.field, 'upstreamIds');

  // 8. Pause switch (`resilienceAutoPropagate: false`) suppresses side-effect creation while keeping signals live
  api.setResilienceAutoPropagate(false);
  const delCountBefore = store.state.delegations.length;
  const pausedDep = api.addDependency({
    name: 'Paused Billing Webhook',
    kind: 'service',
    criticality: 'critical',
    ttsDays: 1,
    ttrDays: 7,
    stewards: [{ personId: lead.id, role: 'primary', verifiedOn: '2026-10-01' }],
  });
  assert.equal(pausedDep.ok, true);
  assert.equal(store.state.delegations.length, delCountBefore, 'paused automation creates no side-effect delegations');
  assert.ok(resilienceSignals(store.state, NOW).some((s) => s.ruleId === 'RES-01' || s.ruleId === 'RES-02'));
});

/* ======== 6. Schema v29, Historical Rewind, CSV #29, Demo & Defect Guards */

test('Schema v29 migration, historical Bus Factor rewind, CSV #29 safety, clearDemo & audited defect regressions', () => {
  // Schema v29 migration
  assert.equal(SCHEMA_VERSION, 54);
  const migrated = migrate({
    schemaVersion: 28,
    settings: { tempoAutoPropagate: false, tempoDelegatedMaxDays: 4 },
  });
  assert.equal(migrated.raw.schemaVersion, 54);
  assert.ok(migrated.applied.includes('28 → 29'));
  assert.deepEqual(migrated.raw.dependencies, []);
  assert.equal(migrated.raw.settings.resilienceDrillDays, 180);
  assert.equal(migrated.raw.settings.resilienceHhiWarn, 2500);
  assert.equal(migrated.raw.settings.resilienceAutoPropagate, true);

  // Defect #9 regression: normalizeState preserves BOTH tempo* and resilience* settings across save/reload
  const normalized = normalizeState({
    ...createEmptyState(NOW.toISOString()),
    settings: {
      tempoAutoPropagate: false,
      tempoDelegatedMaxDays: 4,
      tempoCrossCuttingMaxDays: 10,
      tempoBigBetMaxDays: 25,
      resilienceAutoPropagate: false,
      resilienceDrillDays: 90,
      resilienceHhiWarn: 2000,
    },
  });
  assert.equal(normalized.state.settings.tempoAutoPropagate, false);
  assert.equal(normalized.state.settings.tempoDelegatedMaxDays, 4);
  assert.equal(normalized.state.settings.tempoCrossCuttingMaxDays, 10);
  assert.equal(normalized.state.settings.tempoBigBetMaxDays, 25);
  assert.equal(normalized.state.settings.resilienceAutoPropagate, false);
  assert.equal(normalized.state.settings.resilienceDrillDays, 90);
  assert.equal(normalized.state.settings.resilienceHhiWarn, 2000);

  // Defect #7 regression: unified AUTOMATION_RULES catalog contains both TEMPO_RULES and RESILIENCE_RULES
  assert.equal(AUTOMATION_RULES.length, 135, '+ ORD and VOI rules');
  assert.equal(RESILIENCE_RULES.length, 6);
  assert.ok(AUTOMATION_RULES.some((r) => r.id === 'RULE-DLY-01'));
  assert.ok(AUTOMATION_RULES.some((r) => r.id === 'RULE-RES-01'));

  // Defect #8 regression: intake classifier routes SPOF / failover / TTR notes cleanly
  const classified = analyzeIntakeText(
    'Critical bus factor 1 single point of failure on payment HSM failover runbook with 9d TTR',
    createEmptyState(NOW.toISOString()),
    { now: NOW },
  );
  assert.ok(classified.primaryCategoryId);
  assert.ok(classified.routingPlan.some((r) => r.categoryId === 'resilience'));

  // Point-in-time historical rewind (`reconstructStateAt`) strips post-cutoff drills & verification
  let simClock = new Date('2026-08-01T10:00:00.000Z');
  const rwStore = createStore({ storage: memStorage(), key: 'leados:res-rewind', now: () => simClock });
  const rwApi = createApi(rwStore, { now: () => simClock });
  const p1 = rwApi.addPerson({ name: 'Clara Jensen', role: 'SRE', startDate: '2024-01-01' });
  const p2 = rwApi.addPerson({ name: 'Omar Farooq', role: 'Engineer', startDate: '2024-01-01' });
  const dep = rwApi.addDependency({
    name: 'Wire Transfer Router',
    kind: 'service',
    criticality: 'critical',
    ttsDays: 2,
    ttrDays: 4,
    stewards: [
      { personId: p1.id, role: 'primary', verifiedOn: '2026-08-01' },
      { personId: p2.id, role: 'trainee', verifiedOn: null },
    ],
  });
  simClock = NOW; // Advance clock to 2026-10-27
  rwApi.verifyDependencySteward(dep.id, p2.id, { verifiedOn: '2026-10-20', notes: 'Solo handover verified' });
  rwApi.recordContinuityDrill(dep.id, {
    date: '2026-10-22',
    kind: 'tabletop',
    estimatedTtrDays: 4,
    realizedTtrDays: 3,
    outcome: 'within-tolerance',
  });

  const rewound = reconstructStateAt(rwStore.state, new Date('2026-10-01T12:00:00.000Z'));
  const rewoundDep = rewound.state.dependencies.find((d) => d.id === dep.id);
  assert.ok(rewoundDep, 'dependency created in August exists at Oct 1 historical snapshot');
  assert.equal(rewoundDep.drills.length, 0, 'post-cutoff continuity drills are rewound');
  const rewoundSt = evaluateStewardship(rewoundDep, rewound.state, new Date('2026-10-01T12:00:00.000Z'));
  assert.equal(rewoundSt.busFactor, 1, 'post-cutoff backup verification does not leak backward into historical Bus Factor');

  const { store, api } = harness();

  // CSV scope #29 export & formula-injection protection
  assert.equal(CSV_EXPORTS.length, 48);
  assert.ok(CSV_EXPORTS.some((s) => s.key === 'resilience'));
  api.addDependency({
    name: '=CMD|\' /C calc\'!A0 Malicious Node',
    kind: 'vendor',
    criticality: 'important',
    exitPlanSummary: '+SUM(1,2) formula payload',
  });
  const csv = exportWorkspaceCsv(store.state, 'resilience', { now: NOW });
  assert.ok(csv.csv.includes("'=CMD|"), 'CSV neutralizes leading = formula injection');
  assert.ok(csv.csv.includes("'+SUM(1,2)"), 'CSV neutralizes leading + formula injection');

  // Demo state & clearDemo() regression (Defects #2, #3, #4)
  const demoEnv = harness();
  demoEnv.store.seedDemo(buildDemoState(NOW));
  assert.equal(demoEnv.store.state.dependencies.length, 5);
  const userPerson = demoEnv.api.addPerson({ name: 'Real Team Member', role: 'Lead', startDate: '2025-01-01' });
  const userDep = demoEnv.api.addDependency({
    name: 'User Production Kafka Cluster',
    kind: 'system',
    criticality: 'critical',
    ttsDays: 1,
    ttrDays: 4,
    stewards: [{ personId: userPerson.id, role: 'primary', verifiedOn: '2026-10-10' }],
  });
  assert.equal(userDep.ok, true);

  demoEnv.store.clearDemo();
  assert.equal(demoEnv.store.state.dependencies.length, 1, 'clearDemo strips -demo- dependencies and preserves user dependencies');
  assert.equal(demoEnv.store.state.dependencies[0].id, userDep.id);
  assert.ok(
    demoEnv.store.state.links.some((l) => l.targetType === 'dependency' && l.targetId === userDep.id),
    'clearDemo preserves typed links pointing to user-created dependencies',
  );
  assert.ok(
    demoEnv.store.state.tempoSchedules.every((t) => demoEnv.store.state.decisions.some((d) => d.id === t.decisionId)),
    'clearDemo leaves zero orphaned tempoSchedules',
  );

  // Insights, Prep, Person & Board Brief integration
  const report = buildResilienceReport(demoEnv.store.state, NOW);
  const brief = buildResilienceBrief(report, demoEnv.store.state, NOW);
  assert.ok(brief.includes('OPERATIONAL RESILIENCE & CONTINUITY BRIEF'));
  const personDeps = dependenciesForPerson(demoEnv.store.state, userPerson.id, NOW);
  assert.equal(personDeps.filter((d) => d.isSoleSteward).length, 1);
  const prep = buildPrepSheet(demoEnv.store.state, userPerson.id, NOW);
  assert.equal(prep.stewardedDependencies.filter((d) => d.isSoleSteward).length, 1, '1:1 Prep sheet surfaces sole-steward SPOF load protection');
  const insights = buildInsights(demoEnv.store.state, NOW);
  assert.ok(insights.findings.some((f) => f.domain === 'Operational resilience'));
});

/* =================================================== 7. JSDOM + axe-core UI */

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

test('UI: all five resilience tabs, detail dossier, documentTitle, Today, Prep, Person & Settings render axe-clean', async () => {
  await withApp(async (app, env) => {
    const { document, window } = env;
    app.ctx.loadDemo();
    assert.equal(app.store.state.dependencies.length, 5);

    for (const [hash, marker] of [
      ['#/resilience', 'Active Dependency & Continuity Ledger'],
      ['#/resilience?tab=topology', 'Multi-Tier Cascade Topology'],
      ['#/resilience?tab=stress', 'Counterfactual Disruption & Departure Stress Lab'],
      ['#/resilience?tab=concentration', 'Key-Person Blast Radius'],
      ['#/resilience?tab=drills', 'Recorded Continuity Drills'],
    ]) {
      app.ctx.navigate(hash);
      assert.ok(document.body.textContent.includes(marker), `expected "${marker}" on ${hash}`);
      assert.deepEqual(await axeViolations(env), [], `${hash} is axe-clean`);
    }

    // Defect #1 regression: documentTitle resolves distinct route titles for intake, tempo, resilience & detail
    assert.ok(document.title.toLowerCase().includes('operational resilience'));
    const firstDep = app.store.state.dependencies[0];
    app.ctx.navigate(`#/resilience/${firstDep.id}`);
    assert.ok(document.title.includes(firstDep.name));
    assert.deepEqual(await axeViolations(env), [], 'resilience detail screen is axe-clean');

    app.ctx.navigate('#/intake');
    assert.ok(document.title.includes('Intake'));

    app.ctx.navigate('#/tempo');
    assert.ok(document.title.includes('Decision tempo'));

    // Defect #5 regression: Settings footprint displays Operational dependencies and Decision timeboxes
    app.ctx.navigate('#/settings');
    assert.ok(document.body.textContent.includes('Operational dependencies'));
    assert.ok(document.body.textContent.includes('Decision timeboxes'));

    // Register dependency modal opens axe-clean and persists through the API
    app.ctx.navigate('#/resilience');
    await new Promise((r) => setTimeout(r, 25)); // let hashchange settle first
    const addBtn = Array.from(document.querySelectorAll('#view button')).find((b) =>
      /Register dependency/i.test(b.textContent),
    );
    assert.ok(addBtn, 'Register dependency button is rendered');
    addBtn.click();
    const dialog = document.querySelector('[role="dialog"]');
    assert.ok(dialog, 'Register dependency modal opens');
    assert.deepEqual(await axeViolations(env, '[role="dialog"]'), [], 'Register dependency modal is axe-clean');

    const nameInput = dialog.querySelector('#res-dep-name');
    assert.ok(nameInput);
    nameInput.value = 'Realtime Fraud Scoring API';
    nameInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    const saveBtn = Array.from(dialog.querySelectorAll('button')).find((b) =>
      /Register|Save/i.test(b.textContent),
    );
    assert.ok(saveBtn, 'Register submit button exists');
    saveBtn.click();
    assert.ok(
      app.store.state.dependencies.some((d) => d.name === 'Realtime Fraud Scoring API'),
      'submitting the modal persists the new operational dependency',
    );

    assert.equal(env.consoleErrors.length, 0, `unexpected console errors: ${env.consoleErrors.join(' | ')}`);
  });
});
