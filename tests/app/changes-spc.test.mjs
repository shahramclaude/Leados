/**
 * tests/app/changes-spc.test.mjs — Organizational Design, Team Topologies,
 * Change Execution & Shewhart XmR Statistical Process Control (Schema v19).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  SCHEMA_VERSION,
  createEmptyState,
  migrate,
  normalizeState,
} from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildDemoState } from '../../app/core/demo.js';
import { exportWorkspaceCsv, parseCsv, CSV_EXPORTS } from '../../app/core/csv.js';
import { computeXmR, compareBaselineShift } from '../../app/core/domain/spc.js';
import {
  evaluateKotterProgression,
  evaluateForceField,
  evaluateTopologyAndLoad,
  evaluateStarAlignment,
  evaluateGuidingCoalition,
  evaluateChangeEconomics,
  changesRollup,
} from '../../app/core/domain/changes.js';
import { previewCasePropagations, previewHiringPropagations } from '../../app/core/domain/automation.js';
import { reconstructStateAt } from '../../app/core/domain/health.js';
import { buildTeamTrends } from '../../app/core/domain/trends.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { buildReviewEvidence } from '../../app/core/domain/reviews.js';
import { suggestAgenda } from '../../app/core/domain/oneonone.js';
import { buildPrepSheet } from '../../app/core/domain/prep.js';

const NOW = new Date('2026-10-25T10:00:00.000Z');
const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');

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
  const idFactory = (prefix) => `${prefix}-s28-${++seq}`;
  const store = createStore({ storage: kvStorage(), now: () => now, idFactory });
  store.load();
  const api = createApi(store, { now: () => now, idFactory });
  return { store, api };
}

/* ------------------------------------------------ 1. Shewhart/Wheeler XmR */

test('SPC: computeXmR calculates exact Wheeler XmR limits, respects physical bounds, and enforces sample floor', () => {
  // Insufficient points (< 4) -> available: false, never invents limits
  const tooFew = computeXmR([
    { date: '2026-10-01', value: 10 },
    { date: '2026-10-08', value: 12 },
    { date: '2026-10-15', value: 11 },
  ]);
  assert.equal(tooFew.available, false);
  assert.equal(tooFew.measuredCount, 3);

  // Known series: [10, 12, 11, 13, 10, 12]
  // Mean X̄ = 68 / 6 = 11.33
  // Moving ranges mR = [2, 1, 2, 3, 2], mR̄ = 10 / 5 = 2.0
  // UNPL = 11.3333 + 2.66 * 2 = 16.65, LNPL = 11.3333 - 2.66 * 2 = 6.01, URL = 3.27 * 2 = 6.54
  const stable = computeXmR(
    [
      { date: '2026-09-01', value: 10 },
      { date: '2026-09-08', value: 12 },
      { date: '2026-09-15', value: 11 },
      { date: '2026-09-22', value: 13 },
      { date: '2026-09-29', value: 10 },
      { date: '2026-10-06', value: 12 },
    ],
    { desirableDirection: 'lower', minBound: 0 },
  );
  assert.equal(stable.available, true);
  assert.equal(stable.mean, 11.33);
  assert.equal(stable.avgMovingRange, 2);
  assert.equal(stable.unpl, 16.65);
  assert.equal(stable.lnpl, 6.01);
  assert.equal(stable.url, 6.53);
  assert.equal(stable.regime, 'common-cause');
  assert.equal(stable.signals.length, 0);

  // Clamping: lower natural limit clamps at minBound = 0 when raw LNPL < 0
  const clamped = computeXmR(
    [
      { date: '2026-09-01', value: 1 },
      { date: '2026-09-08', value: 4 },
      { date: '2026-09-15', value: 1 },
      { date: '2026-09-22', value: 4 },
    ],
    { minBound: 0, maxBound: 10 },
  );
  assert.equal(clamped.available, true);
  assert.equal(clamped.lnpl, 0);
  assert.ok(clamped.rawLnpl < 0);
  assert.equal(clamped.unpl, 10);
});

test('SPC: missing windows break moving ranges without interpolation, and Rules 1–4 classify polarity accurately', () => {
  // Null gap breaks adjacency: 4 measured points separated by nulls -> only 2 adjacent ranges -> unavailable
  const gapped = computeXmR([
    { date: '2026-09-01', value: 50 },
    { date: '2026-09-08', value: 52 },
    { date: '2026-09-15', value: null },
    { date: '2026-09-22', value: 51 },
    { date: '2026-09-29', value: null },
    { date: '2026-10-06', value: 53 },
  ]);
  assert.equal(gapped.available, false);
  assert.equal(gapped.gapCount, 2);
  assert.equal(gapped.adjacentRangeCount, 1);

  // Rule 1 + Rule 2 outlier spike on a higher-is-better health series -> adverse special cause when dropping sharply
  const dropSeries = computeXmR(
    [
      { date: '2026-08-01', value: 82 },
      { date: '2026-08-08', value: 84 },
      { date: '2026-08-15', value: 83 },
      { date: '2026-08-22', value: 85 },
      { date: '2026-08-29', value: 82 },
      { date: '2026-09-05', value: 84 },
      { date: '2026-09-12', value: 45 },
    ],
    { desirableDirection: 'higher', minBound: 0, maxBound: 100 },
  );
  assert.equal(dropSeries.available, true);
  assert.equal(dropSeries.regime, 'special-cause-adverse');
  assert.ok(dropSeries.signals.some((s) => s.ruleCode === 'WE-1' && s.polarity === 'adverse'));
  assert.ok(dropSeries.signals.some((s) => s.ruleCode === 'WE-2'));

  // Rule 3: 8 consecutive points below overall mean on a lower-is-better latency metric -> favorable sustained shift
  const shiftSeries = computeXmR(
    [
      { date: '2026-07-01', value: 50 },
      { date: '2026-07-08', value: 52 },
      { date: '2026-07-15', value: 48 },
      { date: '2026-07-22', value: 51 },
      { date: '2026-07-29', value: 49 },
      { date: '2026-08-05', value: 20 },
      { date: '2026-08-12', value: 21 },
      { date: '2026-08-19', value: 19 },
      { date: '2026-08-26', value: 20 },
      { date: '2026-09-02', value: 22 },
      { date: '2026-09-09', value: 19 },
      { date: '2026-09-16', value: 20 },
      { date: '2026-09-23', value: 18 },
    ],
    { desirableDirection: 'lower', minBound: 0 },
  );
  assert.ok(shiftSeries.signals.some((s) => s.ruleCode === 'WE-3' && s.polarity === 'favorable'));

  // compareBaselineShift distinguishes real baseline->post shift from routine common-cause noise
  const verified = compareBaselineShift(
    [
      { date: '2026-08-01', value: 46, phase: 'baseline' },
      { date: '2026-08-08', value: 49, phase: 'baseline' },
      { date: '2026-08-15', value: 44, phase: 'baseline' },
      { date: '2026-08-22', value: 48, phase: 'baseline' },
      { date: '2026-09-05', value: 20, phase: 'post' },
      { date: '2026-09-12', value: 19, phase: 'post' },
    ],
    { desirableDirection: 'lower', unit: 'min' },
  );
  assert.equal(verified.statisticallyVerified, true);
  assert.equal(verified.verdict, 'verified-shift');
  assert.equal(verified.improved, true);

  const noise = compareBaselineShift(
    [
      { date: '2026-08-01', value: 46, phase: 'baseline' },
      { date: '2026-08-08', value: 50, phase: 'baseline' },
      { date: '2026-08-15', value: 44, phase: 'baseline' },
      { date: '2026-08-22', value: 48, phase: 'baseline' },
      { date: '2026-09-05', value: 46, phase: 'post' },
      { date: '2026-09-12', value: 45, phase: 'post' },
    ],
    { desirableDirection: 'lower', unit: 'min' },
  );
  assert.equal(noise.statisticallyVerified, false);
  assert.equal(noise.verdict, 'within-noise');
});

/* ---------------------------- 2. Org Design, Topologies & Change Domain */

test('Domain: Kotter skips, Lewin Force-Field equilibrium, Team Topologies load, Galbraith Star & Veto coalition', () => {
  const draftChange = {
    id: 'chg-1',
    title: 'Split Billing Pod',
    kind: 'topology',
    status: 'active',
    vision: 'Independent weekly billing releases',
    kotterStage: 'short-wins',
    completedSteps: ['urgency'], // Skipped coalition, vision, communicate, obstacles!
    shortTermWins: [],
    topology: {
      teamName: 'Billing Pod',
      currentType: 'complicated-subsystem',
      targetType: 'stream-aligned',
      interactionMode: 'collaboration',
      collaboratingTeamsCount: 4,
      cognitiveLoadBefore: 5,
      cognitiveLoadTarget: 4,
      blockingHandoffsBefore: 3,
      blockingHandoffsTarget: 5,
    },
    star: {
      strategy: 'Decouple billing cadence',
      structure: 'Dedicated 4-engineer pod',
      processes: 'Self-serve schema contract',
      rewards: '', // Deliberate Holmström-Milgrom mismatch!
      people: 'Mei leads pod',
    },
    forces: [
      { id: 'f1', side: 'driving', label: 'Faster deploys', weight: 5, category: 'tooling', mitigated: false },
      { id: 'f2', side: 'driving', label: 'Clearer on-call', weight: 4, category: 'workload', mitigated: false },
      { id: 'f3', side: 'restraining', label: 'Manual controller sign-off', weight: 5, category: 'governance', mitigated: false },
      { id: 'f4', side: 'restraining', label: 'Shared staging DB', weight: 5, category: 'tooling', mitigated: false },
    ],
    coalition: [
      { id: 's1', name: 'Controller', power: 5, interest: 5, stance: 'blocker', vetoPlayer: true, nextBriefOn: '2026-10-10' },
      { id: 's2', name: 'Platform Lead', power: 5, interest: 4, stance: 'supportive', vetoPlayer: true, nextBriefOn: '2026-11-01' },
    ],
    effortDays: { optimistic: 3, mostLikely: 6, pessimistic: 9 },
    economics: {
      currency: 'USD',
      transitionCost: 12000,
      monthlyBenefit: { optimistic: 3000, mostLikely: 4000, pessimistic: 5000 },
      horizonMonths: 12,
    },
  };

  const kotter = evaluateKotterProgression(draftChange);
  assert.equal(kotter.hasSkippedFoundations, true);
  assert.ok(kotter.skippedSteps.length >= 3);

  const ff = evaluateForceField(draftChange);
  assert.equal(ff.drivingSum, 9);
  assert.equal(ff.effectiveRestrainingSum, 10);
  assert.equal(ff.highTensionStalemate, true);
  assert.equal(ff.equilibrium, 'high-tension-stalemate');

  // Purely blocked equilibrium when driving is weak (+4 vs -10)
  const ffBlocked = evaluateForceField({
    ...draftChange,
    forces: draftChange.forces.filter((f) => f.id !== 'f1'),
  });
  assert.equal(ffBlocked.equilibrium, 'blocked');

  // Mitigating f4 halves its effective weight from 5 -> 2.5 (+9 vs -7.5), moving to fragile-forward while f3 remains severe
  const ffFragile = evaluateForceField({
    ...draftChange,
    forces: draftChange.forces.map((f) => (f.id === 'f4' ? { ...f, mitigated: true } : f)),
  });
  assert.equal(ffFragile.effectiveRestrainingSum, 7.5);
  assert.equal(ffFragile.equilibrium, 'fragile-forward');

  // Mitigating both severe blockers (f3 & f4 -> -5.0 total) achieves clean 'favorable' equilibrium
  const ffFavorable = evaluateForceField({
    ...draftChange,
    forces: draftChange.forces.map((f) => (f.side === 'restraining' ? { ...f, mitigated: true } : f)),
  });
  assert.equal(ffFavorable.effectiveRestrainingSum, 5);
  assert.equal(ffFavorable.equilibrium, 'favorable');

  const topo = evaluateTopologyAndLoad(draftChange);
  // N = 5 total teams (this team + 4 collaborating) -> 5*4/2 = 10 bilateral channels
  assert.equal(topo.coordinationChannels, 10);
  assert.equal(topo.antiPatterns.length, 3);
  assert.ok(topo.antiPatterns.some((a) => a.id === 'TT-HIGH-TARGET-LOAD'));
  assert.ok(topo.antiPatterns.some((a) => a.id === 'TT-HANDOFF-INCREASE'));

  const star = evaluateStarAlignment(draftChange);
  assert.equal(star.alignedCount, 4);
  assert.ok(star.incentiveMismatchWarning.includes('Rewards'));

  const coal = evaluateGuidingCoalition(draftChange, NOW);
  assert.equal(coal.vetoPlayers.length, 2);
  assert.equal(coal.unalignedVetoPlayers.length, 1);
  assert.equal(coal.overdueBriefs.length, 1);

  const econ = evaluateChangeEconomics(draftChange, { forceField: ff, star, coalition: coal });
  assert.equal(econ.effort.expected, 6);
  assert.equal(econ.expectedPaybackMonths, 3);
  assert.equal(econ.netBenefit, 36000);
  assert.ok(econ.riskAdjustedNetBenefit < econ.netBenefit, 'blocked force-field and veto opposition discount feasibility');
});

/* ---------------- 3. Parallel + Vertical Cross-Module Event Propagation */

test('Automation: Active change executes RULE-CHG-01..05 in parallel AND cascades vertically into RULE-CAP-02 when capacity overflows', () => {
  const { store, api } = harness();

  // Tight team: 1 active engineer -> limited 4-week allocatable supply
  const p1 = api.addPerson({ name: 'Mei Lin Chen', role: 'Staff Engineer', startDate: '2025-01-10' });
  const g1 = api.addGoal({
    title: 'Zero-incident billing cutover',
    scope: 'team',
    confidence: 'on-track',
    keyResults: [{ label: 'Cutover incidents', baseline: 2, current: 0, target: 0, unit: 'incidents' }],
  });

  // Create one Active structural change with PERT effort, veto blocker, and opted-in 30-60-90 role transition
  const created = api.addChange({
    title: 'Extract Billing Pod with dedicated API contract',
    kind: 'topology',
    status: 'active',
    reversibility: 'irreversible',
    ownerId: p1.id,
    linkedGoalId: g1.id,
    vision: 'Independent weekly deploys without shared freeze.',
    nonGoals: 'Not changing pricing tiers.',
    effortDays: { optimistic: 14, mostLikely: 18, pessimistic: 24 }, // ~18.33 person-days > 1-person 4w supply!
    forces: [
      { side: 'driving', label: 'Independent deploy pipeline', weight: 4, category: 'tooling' },
      { side: 'restraining', label: 'Manual dual sign-off', weight: 5, category: 'governance', mitigated: false },
    ],
    coalition: [
      { name: 'Finance Controller', role: 'Gatekeeper', power: 5, interest: 5, stance: 'blocker', vetoPlayer: true },
    ],
    impacts: [
      { personId: p1.id, impactKind: 'scope-shift', newRoleLabel: 'Billing Pod Lead', createTransitionPlan: true },
    ],
    autoCreateDecision: true,
  });

  assert.equal(created.ok, true);
  const st = store.state;
  const chg = st.changes.find((c) => c.id === created.id);
  assert.ok(chg);

  // RULE-CHG-01: Capacity reserve created in portfolio with sourceType === 'change'
  const reserve = st.portfolio.find((p) => p.sourceType === 'change' && p.sourceId === chg.id);
  assert.ok(reserve, 'RULE-CHG-01 reserved transition effort in portfolio');
  assert.equal(reserve.decision, 'funded');

  // RULE-CHG-02: Linked DACI charter decision created
  const charterDec = st.decisions.find((d) => d.title.includes('Extract Billing Pod'));
  assert.ok(charterDec, 'RULE-CHG-02 created DACI charter decision');

  // RULE-CHG-03: 1:1 talking point queued AND 30-60-90 role-transition plan started!
  const mei = st.people.find((p) => p.id === p1.id);
  assert.ok(mei.talkingPoints.some((tp) => tp.includes('Extract Billing Pod')), 'RULE-CHG-03 queued 1:1 talking point');
  const transitionPlan = st.onboarding.find((o) => o.personId === p1.id && o.kind === 'role-transition');
  assert.ok(transitionPlan, 'RULE-CHG-03 started Watkins 30-60-90 role-transition plan');

  // RULE-CHG-04: Veto player automatically given a nextBriefOn date
  assert.ok(chg.coalition[0].nextBriefOn, 'RULE-CHG-04 scheduled veto player briefing');

  // RULE-CHG-05: Linked goal shifted from on-track -> at-risk because veto player & force-field block change
  const goalAfter = st.goals.find((g) => g.id === g1.id);
  assert.equal(goalAfter.confidence, 'at-risk', 'RULE-CHG-05 shifted dependent goal to at-risk');
  assert.ok(goalAfter.checkins.some((c) => c.note.includes('RULE-CHG-05')));

  // Vertical Cascade (RULE-CAP-02): Combined reserve + 30-60-90 transition ramp pushed utilisation > 100%,
  // opening a Capacity trade-off decision in the SAME atomic transaction!
  const capTradeoff = st.decisions.find((d) => d.title.startsWith('Capacity trade-off'));
  assert.ok(capTradeoff, 'Vertical cascade RULE-CAP-02 opened Capacity trade-off decision');

  // Idempotency: calling syncChanges produces zero duplicates
  const syncRes = api.syncChanges();
  assert.equal(syncRes.ok, true);
  assert.equal(syncRes.propagations.length, 0);
  assert.equal(store.state.portfolio.filter((p) => p.sourceType === 'change' && p.sourceId === chg.id).length, 1);
  assert.equal(store.state.onboarding.filter((o) => o.personId === p1.id && o.kind === 'role-transition').length, 1);

  // Person 1:1 agenda & printable prep surface the organizational change impact cleanly
  const agenda = suggestAgenda(store.state, p1.id, NOW, store.state.settings);
  assert.ok(agenda.some((item) => item.source === 'change'));
  const prep = buildPrepSheet(store.state, p1.id, NOW, store.state.settings);
  assert.equal(prep.openChanges.length, 1);

  // Bidirectional Case <-> Change escalation + circular duplicate guard
  const blockerForce = store.state.changes[0].forces.find((f) => f.side === 'restraining');
  const escalated = api.escalateForceToCase(chg.id, blockerForce.id);
  assert.equal(escalated.ok, true);
  assert.ok(store.state.cases.some((c) => c.id === escalated.id));

  // Circular guard: promoting a case that is already linked to an open change refuses duplication
  const circularAttempt = api.promoteCaseToChange(escalated.id);
  assert.equal(circularAttempt.ok, false);
  assert.equal(circularAttempt.existingChangeId, chg.id);

  // Promoting a standalone systemic case creates a linked organizational change cleanly
  const standaloneCase = api.addCase({
    kind: 'incident',
    status: 'open',
    title: 'Recurring schema lock contention across pods',
    rca: { systemicBarrier: 'Shared migration lock across 3 pods' },
  });
  assert.equal(standaloneCase.ok, true);
  const promoted = api.promoteCaseToChange(standaloneCase.id);
  assert.equal(promoted.ok, true);
  assert.equal(store.state.changes.length, 2);

  // Anchoring marks capacity reserve done and logs anchoring verification on the linked OKR
  const anchored = api.setChangeStatus(chg.id, {
    status: 'anchored',
    anchoredOn: '2026-10-25',
    closedReason: 'XmR chart verified deploy wait dropped from 4d to 35m.',
  });
  assert.equal(anchored.ok, true);
  const reserveAfter = store.state.portfolio.find((p) => p.sourceType === 'change' && p.sourceId === chg.id);
  assert.equal(reserveAfter.status, 'done');
  assert.ok(store.state.goals.find((g) => g.id === g1.id).checkins.some((c) => c.note.includes('anchored')));
});

/* ---------------- 4. Regression Coverage for All 5 Audited Defects */

test('Audit regressions: normalizePortfolio preserves requisition/change sourceTypes, previewHiringPropagations respects { now }, and reconstructStateAt rewinds all collections', () => {
  // Defect #1: normalizePortfolio must NOT wipe sourceType 'requisition' or 'change' to 'manual'!
  const raw = createEmptyState(NOW.toISOString());
  raw.requisitions = [{ id: 'req-1', title: 'Staff SRE', status: 'open', openedOn: '2026-10-01' }];
  raw.changes = [{ id: 'chg-1', title: 'Pod split', status: 'active', openedOn: '2026-10-01' }];
  raw.portfolio = [
    { id: 'pf-req', title: 'Hiring: Staff SRE', kind: 'hiring', sourceType: 'requisition', sourceId: 'req-1', decision: 'funded', createdOn: '2026-10-01' },
    { id: 'pf-chg', title: 'Change reserve', kind: 'capacity-reserve', sourceType: 'change', sourceId: 'chg-1', decision: 'funded', createdOn: '2026-10-01' },
  ];
  const { state } = normalizeState(raw, { now: NOW });
  assert.equal(state.portfolio.find((p) => p.id === 'pf-req').sourceType, 'requisition');
  assert.equal(state.portfolio.find((p) => p.id === 'pf-req').sourceId, 'req-1');
  assert.equal(state.portfolio.find((p) => p.id === 'pf-chg').sourceType, 'change');
  assert.equal(state.portfolio.find((p) => p.id === 'pf-chg').sourceId, 'chg-1');

  // Defect #2: previewCasePropagations passes { now } to buildCapacityModel deterministically, and previewHiringPropagations previews reserve
  const casePreview = previewCasePropagations(
    {
      title: 'Major outage',
      status: 'open',
      financial: { capacityDaysOptimistic: 2, capacityDaysMostLikely: 4, capacityDaysPessimistic: 6 },
    },
    state,
    { now: NOW },
  );
  assert.ok(casePreview.some((p) => p.ruleId === 'RULE-CAP-01'));
  const hirePreview = previewHiringPropagations(
    { title: 'Backend Engineer', status: 'open', effortDays: { optimistic: 2, mostLikely: 4, pessimistic: 6 } },
    state,
  );
  assert.ok(hirePreview.some((msg) => msg.includes('Reserve 4 person-day(s)')));

  // Defect #3: reconstructStateAt filters requisitions, candidates, portfolio, and changes by historical date
  const demo = buildDemoState(NOW);
  const farPast = new Date('2026-01-01T00:00:00.000Z');
  const rewound = reconstructStateAt(demo, farPast).state;
  assert.equal(rewound.changes.length, 0);
  assert.equal(rewound.requisitions.length, 0);
  assert.equal(rewound.candidates.length, 0);
  assert.equal(rewound.portfolio.length, 0);
});

/* -------- 5. Privacy Wall, Schema v18 → v19, Signals, CSV & UI Flow */

test('Privacy & Schema v19: organizational changes never enter performance ratings, v18 migrates cleanly, and CSV neutralizes formulas', () => {
  assert.equal(SCHEMA_VERSION, 39);

  // Schema v18 -> v19 migration never mutates input or fabricates changes
  const v18 = { ...createEmptyState(NOW.toISOString()), schemaVersion: 18 };
  delete v18.changes;
  delete v18.settings.changeReviewDays;
  const snap = JSON.stringify(v18);
  const migrated = migrate(v18);
  assert.equal(JSON.stringify(v18), snap);
  assert.deepEqual(migrated.applied, ['18 → 19', '19 → 20', '20 → 21', '21 → 22', '22 → 23', '23 → 24', '24 → 25', '25 → 26', '26 → 27', '27 → 28', '28 → 29', '29 → 30', '30 → 31', '31 → 32', '32 → 33', '33 → 34', '34 → 35', '35 → 36', '36 → 37', '37 → 38', '38 → 39']);
  assert.deepEqual(migrated.raw.changes, []);
  assert.equal(migrated.raw.settings.changeReviewDays, 21);

  // Demo state produces CHG insights, Team Health XmR stats, and strictly isolates performance evidence
  const demo = buildDemoState(NOW);
  const roll = changesRollup(demo, NOW);
  assert.equal(roll.total, 2);
  assert.equal(roll.open.length, 1);
  assert.equal(roll.anchored.length, 1);

  const trends = buildTeamTrends(demo, { weeks: 12, now: NOW });
  assert.ok(trends.overall.spc, 'Team trends attach Shewhart XmR analysis');

  const insights = buildInsights(demo, NOW);
  assert.ok(insights.findings.some((f) => f.ruleId.startsWith('CHG-')), 'Change execution rules surface findings on demo state');

  // Privacy invariant: performance review evidence for Mei Lin Chen NEVER includes organizational changes, conflicts, or anonymous pulses
  const mei = demo.people.find((p) => p.name === 'Mei Lin Chen');
  const evidence = buildReviewEvidence(demo, mei.id, '2026-01-01', '2026-12-31');
  assert.equal(evidence.some((e) => e.type === 'change' || e.type === 'conflict' || e.type === 'pulse'), false);

  // CSV export & formula injection protection
  assert.ok(CSV_EXPORTS.some((s) => s.key === 'changes'));
  const injected = createEmptyState(NOW.toISOString());
  injected.changes = [
    {
      id: 'chg-csv',
      title: '=CMD|\' /C calc\'!A0',
      kind: 'topology',
      status: 'active',
      openedOn: '2026-10-01',
    },
  ];
  const normInj = normalizeState(injected, { now: NOW }).state;
  const csvRes = exportWorkspaceCsv(normInj, 'changes', { now: NOW });
  assert.equal(csvRes.ok, true);
  assert.ok(csvRes.csv.includes("'=CMD"), 'formula-shaped title is neutralized');
  const parsed = parseCsv(csvRes.csv);
  assert.equal(parsed.rows.length, 1);
});

test('UI end-to-end: #/changes and #/changes/:id render XmR SVG charts, toggle Kotter steps, and record observations cleanly', async () => {
  const virtualConsole = new VirtualConsole();
  const errors = [];
  virtualConsole.on('error', (...args) => errors.push(args.join(' ')));
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

  try {
    const { createApp } = await import('../../app/main.js');
    const app = createApp({ storage: window.localStorage, now: () => NOW });
    app.ctx.loadDemo();

    app.ctx.navigate('#/changes');
    const listText = window.document.querySelector('#view').textContent;
    assert.ok(listText.includes('Org design, topologies & change'));
    assert.ok(listText.includes('Extract Billing & Ledger into a stream-aligned pod'));

    // Navigate to active demo change detail and verify XmR SVG chart renders
    const openChg = app.ctx.state.changes.find((c) => c.status === 'active');
    app.ctx.navigate(`#/changes/${openChg.id}`);
    const detailView = window.document.querySelector('#view');
    assert.ok(detailView.querySelector('svg.chart-svg'), 'Shewhart XmR SVG chart rendered on change detail');

    // Toggle Kotter step 5 ("5. Remove obstacles") directly from the UI button
    const stepBtn = Array.from(detailView.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Complete 5. Remove obstacles'),
    );
    assert.ok(stepBtn, 'Kotter step completion button exists');
    stepBtn.click();
    const updatedChg = app.ctx.state.changes.find((c) => c.id === openChg.id);
    assert.ok(updatedChg.completedSteps.includes('obstacles'));

    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});
