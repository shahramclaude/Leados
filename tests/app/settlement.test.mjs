import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { createEmptyState, migrate, SCHEMA_VERSION } from '../../app/core/schema.js';
import { buildDemoState } from '../../app/core/demo.js';
import { proposeBundle } from '../../app/core/domain/actionBundleRegistry.js';
import { rehearseActionBundle } from '../../app/services/actionBundleRehearsal.js';
import { bundleReport } from '../../app/core/domain/actionBundles.js';
import { rehearseResponse } from '../../app/services/responseRehearsal.js';
import { responseSourceFingerprint } from '../../app/core/domain/response.js';
import { toCaseInput } from '../../app/core/domain/intake.js';
import {
  classifyAttributionRegime,
  classifyFeverZone,
  computeEarnedSchedule,
  computeEconomicVariance,
  rehearseLoopWhatIf,
  settlementReport,
  summarizeSettlementCalibration,
} from '../../app/core/domain/settlement.js';
import { normalizeSettlements } from '../../app/core/domain/settlementSchema.js';
import { exportWorkspaceCsv, CSV_EXPORTS } from '../../app/core/csv.js';
import { linksForEntity, resolveLinkedEntity } from '../../app/core/domain/cases.js';
import { renderSettlement } from '../../app/views/settlement.js';
import { parseRoute, NAV } from '../../app/main.js';

const require = createRequire(import.meta.url);
const AXE_SRC = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-11-01T12:00:00Z');
const clone = (v) => JSON.parse(JSON.stringify(v));

function setup({ state, failWrites = false } = {}) {
  const data = new Map(state ? [[STORAGE_KEY, JSON.stringify(state)]] : []);
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (failWrites) throw new Error('Quota exceeded');
      data.set(k, v);
    },
    removeItem: (k) => data.delete(k),
  };
  let seq = 0;
  const idFactory = (p) => `${p}-stltest-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }), storage, idFactory };
}

function adoptedBundleWorkspace({ bundleReviewOn = null } = {}) {
  const env = setup();
  const leader = env.api.addPerson({ name: 'Jordan Rivera', role: 'Engineering Manager' });
  const delegate = env.api.addPerson({ name: 'Priya Nair', role: 'Staff Engineer' });
  assert.equal(leader.ok && delegate.ok, true);

  const c = env.api.addCase({
    title: 'Checkout latency spike under peak batch',
    ownerId: delegate.id,
    kind: 'incident',
    openedOn: '2026-10-18',
    reviewOn: '2026-10-30',
    financial: { currency: 'USD', mitigationCost: 2000, low: 1400, mode: 2100, high: 2800 },
    stakeholders: [{ name: 'VP Platform', power: 5, interest: 5, stance: 'skeptical', keyMessage: 'Confirm batch isolation SLA.' }],
  });
  assert.equal(c.ok, true, c.error);
  const budget = env.api.addBudget({ name: 'Reliability envelope', currency: 'USD', limit: 25000 });
  assert.equal(budget.ok, true, budget.error);

  const proposal = proposeBundle(env.store.state, c.id, NOW);
  assert.equal(proposal.ok, true, proposal.error);
  if (bundleReviewOn) proposal.reviewOn = bundleReviewOn;
  const created = env.api.createActionBundle(proposal);
  assert.equal(created.ok, true, created.error);
  const preview = rehearseActionBundle(clone(env.store.state), created.id, { now: NOW });
  assert.equal(preview.ok, true, preview.error);
  assert.equal(env.api.saveActionBundlePreview(created.id, preview).ok, true);
  const committed = env.api.commitActionBundle(created.id, {
    expectedRevision: env.store.state.meta.revision,
    reviewed: true,
  });
  assert.equal(committed.ok, true, committed.error);
  return { ...env, leaderId: leader.id, delegateId: delegate.id, caseId: c.id, budgetId: budget.id, bundleId: created.id, bundle: committed.bundle };
}

test('Schema v74 → v75 migration is additive, empty, idempotent, and fail-closed on malformed imports', () => {
  assert.equal(SCHEMA_VERSION, 79);
  const old = createEmptyState();
  old.schemaVersion = 74;
  delete old.settlements;
  const migrated = migrate(old);
  assert.deepEqual(migrated.applied, ['74 → 75', '75 → 76', '76 → 77', '77 → 78', '78 → 79']);
  assert.deepEqual(migrated.raw.settlements, []);
  assert.deepEqual(migrate(migrated.raw).applied, []);

  // Forged retroactive forecast (frozenAt > settledAt) and blame-bearing notes are sanitized.
  const warnings = [];
  const rows = normalizeSettlements([
    {
      id: 'stl-retro', loopKey: 'case:c1', loopKind: 'case-loop', sourceId: 'c1', label: 'Retroactive',
      status: 'settled', openedOn: '2026-10-01', reviewOn: '2026-10-20',
      frozenAt: '2026-10-25T10:00:00.000Z', predictedCleanClosurePct: 80,
      settledAt: '2026-10-20T10:00:00.000Z', settledOn: '2026-10-20',
      verdict: {
        regime: 'validated-win', feverZone: 'green', clearancePct: 100,
        leaderClearancePct: 100, delegateClearancePct: 100, thesisState: 'corroborated',
        cleanClosure: true, brier: 0.04,
      },
    },
    {
      id: 'stl-blame', loopKey: 'case:c2', loopKind: 'case-loop', sourceId: 'c2', label: 'Blame note',
      status: 'frozen', openedOn: '2026-10-01', reviewOn: '2026-11-10',
      frozenAt: '2026-10-02T10:00:00.000Z', predictedCleanClosurePct: 70,
      notes: 'Careless negligence by the operator.',
    },
  ], createEmptyState(), NOW.toISOString(), warnings);
  assert.equal(rows.length, 2);
  // Retroactive Brier grade is stripped so calibration cannot be gamed ex-post
  assert.equal(rows[0].verdict.brier, null);
  // Personal-blame note is scrubbed
  assert.equal(rows[1].notes, '');
  assert.ok(warnings.length >= 2);
});

test('Lipke (2003) Earned Schedule and Goldratt (1997) Fever Zones remain honest past deadline', () => {
  // Planned 10 days (Oct 10 -> Oct 20), evaluated Nov 1 (22 days elapsed), 50% cleared:
  const late = computeEarnedSchedule({
    openedOn: '2026-10-10',
    reviewOn: '2026-10-20',
    asOfDay: '2026-11-01',
    clearancePct: 50,
  });
  assert.equal(late.scheduled, true);
  assert.equal(late.plannedDays, 10);
  assert.equal(late.elapsedDays, 22);
  assert.equal(late.earnedScheduleDays, 5);
  assert.ok(Math.abs(late.spiT - (5 / 22)) < 0.001);
  assert.equal(late.svDays, -17);
  assert.equal(late.ieacDays, 44);

  const feverRed = classifyFeverZone({ windowBurnPct: late.windowBurnPct, clearancePct: 50, scheduled: true, overdue: late.overdue });
  assert.equal(feverRed.zone, 'red');

  const feverGreen = classifyFeverZone({ windowBurnPct: 30, clearancePct: 60, scheduled: true });
  assert.equal(feverGreen.zone, 'green');

  const unscheduled = computeEarnedSchedule({ openedOn: '2026-10-10', reviewOn: null, asOfDay: '2026-11-01', clearancePct: 20 });
  assert.equal(unscheduled.scheduled, false);
  assert.equal(unscheduled.spiT, null);
  assert.equal(classifyFeverZone({ windowBurnPct: null, clearancePct: 20, scheduled: false }).zone, 'unscheduled');
});

test('2x2 Attribution separates team exoneration, leader bottlenecks, Type-III error and confounded refusal', () => {
  // 1. Clean delegate delivery (100%) + breached governing premise -> exonerates team
  const exonerated = classifyAttributionRegime({
    executionClearancePct: 90, leaderClearancePct: 80, delegateClearancePct: 100,
    leaderCount: 2, delegateCount: 2, thesisState: 'falsified', closedOutcome: 'unsuccessful', feverZone: 'watch',
  });
  assert.equal(exonerated.regime, 'thesis-falsified-clean-execution');
  assert.equal(exonerated.cleanDelegateExecution, true);

  // 2. Red-zone loop where delegate is 100% done but leader decision/comms are 0% -> leader bottleneck
  const leaderGated = classifyAttributionRegime({
    executionClearancePct: 40, leaderClearancePct: 0, delegateClearancePct: 100,
    leaderCount: 2, delegateCount: 1, thesisState: 'untested', closedOutcome: null, feverZone: 'red',
  });
  assert.equal(leaderGated.regime, 'execution-stalled-leader-gated');
  assert.equal(leaderGated.primaryBottleneck, 'leader');

  // 3. Stalled execution + open untested thesis -> guards against Type-III premature strategy pivot
  const typeIII = classifyAttributionRegime({
    executionClearancePct: 35, leaderClearancePct: 50, delegateClearancePct: 25,
    leaderCount: 1, delegateCount: 2, thesisState: 'untested', closedOutcome: null, feverZone: 'red',
  });
  assert.equal(typeIII.regime, 'execution-drift-untested-thesis');

  // 4. Unsuccessful outcome + low execution + untested thesis -> refuses causal attribution
  const confounded = classifyAttributionRegime({
    executionClearancePct: 30, leaderClearancePct: 25, delegateClearancePct: 35,
    leaderCount: 1, delegateCount: 1, thesisState: 'untested', closedOutcome: 'unsuccessful', feverZone: 'red',
  });
  assert.equal(confounded.regime, 'confounded-refused');
});

test('Brinson–Fachler 3-way economic variance sums with zero residual and enforces currency & encumbrance walls', () => {
  // Planned: M0 = 1000, T0 = 10d, r0 = 200/d => C0 = 3000
  // Realized: M1 = 1300, T1 = 14d, r1 = 250/d => C1 = 1300 + 3500 = 4800 (Delta C = +1800)
  // Schedule effect: (14 - 10) * 200 = +800
  // Rate/spend effect: 10 * (250 - 200) + (1300 - 1000) = 500 + 300 = +800
  // Interaction effect: (14 - 10) * (250 - 200) = +200
  // Total = 800 + 800 + 200 = +1800, residual = 0!
  const settled = computeEconomicVariance({
    plannedCurrency: 'USD',
    actualCurrency: 'USD',
    plannedMitigation: 1000,
    plannedDailyCarry: 200,
    plannedDays: 10,
    actualMitigation: 1300,
    actualDailyCarry: 250,
    actualDays: 14,
    committedEncumbrance: 1000,
    hasDatedActualSpend: true,
  });
  assert.equal(settled.status, 'settled');
  assert.equal(settled.plannedCost, 3000);
  assert.equal(settled.realizedCost, 4800);
  assert.equal(settled.varianceTotal, 1800);
  assert.equal(settled.scheduleEffect, 800);
  assert.equal(settled.rateEffect, 800);
  assert.equal(settled.interactionEffect, 200);
  assert.equal(settled.residual, 0);

  // Encumbrance without actual spend is NEVER treated as realized spend
  const encumbered = computeEconomicVariance({
    plannedCurrency: 'USD', actualCurrency: 'USD', plannedMitigation: 1000, plannedDailyCarry: 100, plannedDays: 10,
    actualMitigation: null, committedEncumbrance: 1000, hasDatedActualSpend: false,
  });
  assert.equal(encumbered.status, 'encumbrance-only');

  // Mixed currencies are refused rather than converted with invented FX rates
  const mixed = computeEconomicVariance({
    plannedCurrency: 'USD', actualCurrency: 'EUR', plannedMitigation: 1000, actualMitigation: 1000, hasDatedActualSpend: true,
  });
  assert.equal(mixed.status, 'mixed-currency-refused');
});

test('Adopted Action Bundle stays withdrawable until touched, and RULE-STL-02 exonerates clean delivery on a false premise', () => {
  const env = adoptedBundleWorkspace();
  // Bundle adoption MUST leave untouched bundle withdrawable (settlementRule does not mutate on bundle.committed)
  const initialBundle = bundleReport(env.store.state, NOW).bundles.find((b) => b.id === env.bundleId);
  assert.equal(initialBundle.withdrawable, true);

  const loopKey = `bundle:${env.bundleId}`;
  // Freeze forecast before closing
  const frz = env.api.freezeLoopSettlement({ loopKey, predictedCleanClosurePct: 80, reviewOn: '2026-11-05' });
  assert.equal(frz.ok, true, frz.error);

  // Complete the delegated work cleanly, decide the DACI option, and mark the premise failed!
  const delOut = env.bundle.outputs.find((o) => o.kind === 'delegation');
  const decOut = env.bundle.outputs.find((o) => o.kind === 'decision');
  const premOut = env.bundle.outputs.find((o) => o.kind === 'premise');

  assert.equal(env.api.completeDelegation(delOut.id, { completionNote: 'Delivered batch isolation ahead of deadline.' }).ok, true);
  assert.equal(env.api.updateDecision(decOut.id, { options: [{ id: 'opt-iso', label: 'Isolate batch queue', pros: 'Fast', cons: 'Capacity' }] }).ok, true);
  assert.equal(env.api.decideDecision(decOut.id, { chosen: 'Isolate batch queue', rationale: 'Protects p99 checkout.' }).ok, true);
  assert.equal(env.api.recordPremiseOutcome(premOut.id, { verdict: 'failed', settledOn: '2026-11-01', note: 'Downstream payment gateway was the true bottleneck, not batch isolation.' }).ok, true);

  // Notice: recording a `premise.outcome` on a loop with a frozen forecast ALREADY triggered RULE-STL-05 out-of-sample grading!
  const autoSettled = env.store.state.settlements.find((s) => s.id === frz.id);
  assert.equal(autoSettled.status, 'settled');
  assert.equal(autoSettled.verdict.regime, 'thesis-falsified-clean-execution');
  assert.equal(autoSettled.verdict.brier, 0.64); // (0.80 - 0)^2 = 0.64

  // Verify cross-module RULE-STL-01 + RULE-STL-02 effects:
  // 1. Delegate's 1:1 talkingPoints received a blameless clean-delivery credit prompt
  const delegatePerson = env.store.state.people.find((p) => p.id === env.delegateId);
  assert.ok(delegatePerson.talkingPoints.some((tp) => tp.includes(`[STL-02:${frz.id}]`)));
  // 2. Double-loop thesis-pivot DACI decision opened automatically
  assert.ok(env.store.state.decisions.some((d) => /Pivot falsified thesis/i.test(d.title)));
  // 3. Typed graph links ('settles-loop' + 'exonerates-delivery') resolve cleanly
  const stlLinks = linksForEntity(env.store.state, 'settlement', frz.id);
  assert.ok(stlLinks.some((l) => l.relation === 'settles-loop'));
  assert.ok(stlLinks.some((l) => l.relation === 'exonerates-delivery'));
  assert.ok(resolveLinkedEntity(env.store.state, 'settlement', frz.id));

  // Idempotence: scanning again writes zero duplicate 1:1 prompts or pivot decisions
  const tpCountBefore = delegatePerson.talkingPoints.length;
  const decCountBefore = env.store.state.decisions.length;
  const scan = env.api.scanSettlements();
  assert.equal(scan.ok, true);
  assert.equal(env.store.state.people.find((p) => p.id === env.delegateId).talkingPoints.length, tpCountBefore);
  assert.equal(env.store.state.decisions.length, decCountBefore);

  // Brier-graded calibration evidence cannot be archived/deleted
  const arch = env.api.archiveLoopSettlement(frz.id);
  assert.equal(arch.ok, false);
  assert.match(arch.error, /calibration record/i);
});

test('RULE-STL-03 & RULE-STL-04 flag leader bottlenecks and guard untested premises; RULE-STL-05 auto-grades on case.resolved', () => {
  const env = adoptedBundleWorkspace();
  // Create a case-loop whose reviewOn is already overdue (Oct 28 < Nov 1)
  const c1 = env.api.addCase({ title: 'Payment webhook timeout escalation', ownerId: env.delegateId, openedOn: '2026-10-15', reviewOn: '2026-10-28' });
  const dec1 = env.api.addDecision({ title: 'Approve secondary webhook gateway', date: '2026-10-16', reviewOn: '2026-10-28' });
  const del1 = env.api.addDelegation({ personId: env.delegateId, title: 'Benchmark secondary webhook latency', expectedOutcome: 'Latency report', authority: 'recommend', support: 'Staging load cluster + SLA trace access.', delegatedOn: '2026-10-16', dueOn: '2026-10-25' });
  assert.equal(c1.ok && dec1.ok && del1.ok, true);
  env.store.update((draft) => {
    draft.links.push(
      { id: 'lnk-c1-dec1', sourceType: 'case', sourceId: c1.id, targetType: 'decision', targetId: dec1.id, relation: 'decides', ruleId: 'TEST', createdAt: NOW.toISOString() },
      { id: 'lnk-c1-del1', sourceType: 'case', sourceId: c1.id, targetType: 'delegation', targetId: del1.id, relation: 'mitigates', ruleId: 'TEST', createdAt: NOW.toISOString() },
    );
  });

  // Delegate finishes 100%, leader leaves decision unchosen past reviewOn -> Red + Leader-gated!
  assert.equal(env.api.completeDelegation(del1.id, { completionNote: 'Completed secondary webhook benchmark.' }).ok, true);
  const loopKey1 = `case:${c1.id}`;
  const report = settlementReport(env.store.state, NOW, env.store.state.settings, loopKey1);
  assert.equal(report.focused.fever.zone, 'red');
  assert.equal(report.focused.attribution.regime, 'execution-stalled-leader-gated');

  // Reject personal-blame language on settlement notes
  const blameAttempt = env.api.recordLoopSettlement({ loopKey: loopKey1, notes: 'Careless incompetence caused this' });
  assert.equal(blameAttempt.ok, false);
  assert.match(blameAttempt.error, /blameless/i);

  // Settle checkpoint at due review window -> triggers RULE-STL-03 (flags-bottleneck link + decision context escalation)
  const stl = env.api.recordLoopSettlement({ loopKey: loopKey1, notes: 'Leader sign-off lagged behind benchmark completion.' });
  assert.equal(stl.ok, true, stl.error);
  const stlLinks = linksForEntity(env.store.state, 'settlement', stl.id);
  assert.ok(stlLinks.some((l) => l.relation === 'flags-bottleneck'));
  assert.match(env.store.state.decisions.find((d) => d.id === dec1.id).context, /Leader-gated bottleneck flagged/);

  // Now test RULE-STL-05 automatic grading when a case with an open frozen forecast resolves!
  const c2 = env.api.addCase({
    title: 'Automated billing retry tuning',
    ownerId: env.delegateId,
    kind: 'risk',
    openedOn: '2026-10-15',
    reviewOn: '2026-11-05',
  });
  const d2 = env.api.addDecision({ title: 'Approve retry backoff curve', date: '2026-10-16', reviewOn: '2026-11-05' });
  assert.equal(c2.ok && d2.ok, true);
  assert.equal(env.api.updateDecision(d2.id, { options: [{ id: 'opt-exp', label: 'Exponential jitter' }] }).ok, true);
  assert.equal(env.api.decideDecision(d2.id, { chosen: 'opt-exp', rationale: 'Smooths thundering herd.' }).ok, true);
  const prem2 = env.api.addPremise({
    title: 'Jitter smooths retry bursts',
    statement: 'Adding full jitter cuts p99 retry bursts by at least 50%.',
    signpost: 'Retry queue depth exceeds 500 during hourly billing run.',
    ownerId: env.delegateId,
    forecastProbability: 85,
    reviewOn: '2026-11-10',
    sourceRefs: [{ sourceType: 'case', sourceId: c2.id }],
  });
  assert.equal(prem2.ok, true, prem2.error);
  env.store.update((draft) => {
    draft.links.push({ id: 'lnk-c2-d2', sourceType: 'case', sourceId: c2.id, targetType: 'decision', targetId: d2.id, relation: 'decides', ruleId: 'TEST', createdAt: NOW.toISOString() });
  });

  const frz2 = env.api.freezeLoopSettlement({ loopKey: `case:${c2.id}`, predictedCleanClosurePct: 85, reviewOn: '2026-11-05' });
  assert.equal(frz2.ok, true, frz2.error);
  assert.equal(env.api.recordPremiseOutcome(prem2.id, { verdict: 'held', settledOn: '2026-11-01', note: 'Bursts dropped 62%.' }).ok, true);
  // Resolving the case ensures closed/graded state
  assert.equal(env.api.resolveCase(c2.id, { status: 'resolved', resolutionNotes: 'Retries dropped 62% cleanly with guardrail alert.', resolvedOn: '2026-11-01' }).ok, true);
  const autoGraded = env.store.state.settlements.find((s) => s.id === frz2.id);
  assert.equal(autoGraded.status, 'settled');
  assert.equal(autoGraded.verdict.regime, 'validated-win');
  assert.equal(autoGraded.verdict.brier, 0.0225); // (0.85 - 1)^2 = 0.0225

  // Test RULE-STL-04 Type-III guard on an untested premise when execution drifts
  const c3 = env.api.addCase({ title: 'Self-serve onboarding checklist', ownerId: env.delegateId, openedOn: '2026-10-01', reviewOn: '2026-10-20' });
  const del3 = env.api.addDelegation({ personId: env.delegateId, title: 'Instrument step-2 drop-off', expectedOutcome: 'Funnel events live', authority: 'recommend', support: 'Analytics warehouse staging credentials.', delegatedOn: '2026-10-02', dueOn: '2026-10-18' });
  const prem3 = env.api.addPremise({
    title: 'Step-2 copy drives drop-off',
    statement: 'Step-2 legal copy accounts for 40% of trial abandonment.',
    signpost: 'Instrumented step-2 exit rate stays below 15% for two weeks.',
    ownerId: env.delegateId,
    forecastProbability: 65,
    reviewOn: '2026-11-10',
    sourceRefs: [{ sourceType: 'case', sourceId: c3.id }],
  });
  assert.equal(c3.ok && del3.ok && prem3.ok, true);
  env.store.update((draft) => {
    draft.links.push({ id: 'lnk-c3-del3', sourceType: 'case', sourceId: c3.id, targetType: 'delegation', targetId: del3.id, relation: 'mitigates', ruleId: 'TEST', createdAt: NOW.toISOString() });
  });
  const stl3 = env.api.recordLoopSettlement({ loopKey: `case:${c3.id}`, notes: 'Instrumentation slipped behind incident work.' });
  assert.equal(stl3.ok, true, stl3.error);
  assert.equal(stl3.verdict.regime, 'execution-drift-untested-thesis');
  const updatedPrem3 = env.store.state.premises.find((p) => p.id === prem3.id);
  assert.ok(updatedPrem3.history.some((h) => h.type === 'type-iii-guard'));
  assert.ok(env.store.state.delegations.some((d) => /Unblock single-loop delivery/i.test(d.title)));
});

test('Adopted Response Plan computes Savage ex-post policy regret; What-if rehearsal mutates zero live records', () => {
  const env = setup();
  const owner = env.api.addPerson({ name: 'Samira Chen', role: 'Operations Lead' });
  const draft = env.api.saveIntakeDraft('Vendor shipment delayed 9 days; customer SLA penalty exposure rising in USD.');
  assert.equal(owner.ok && draft.ok, true);
  const draftRec = env.store.state.intakeDrafts.find((d) => d.id === draft.id);
  const caseInput = {
    ...toCaseInput(draftRec.analysis),
    title: 'Vendor shipment delay',
    kind: 'risk',
    ownerId: owner.id,
    openedOn: '2026-10-18',
    reviewOn: '2026-10-30',
  };
  const assumptions = {
    currency: 'USD',
    mitigationBudget: 1500,
    weeklyDelayLow: 1400,
    weeklyDelayMode: 2100,
    weeklyDelayHigh: 3500,
    delayDays: 14,
    evidenceDays: 3,
  };
  const reh = rehearseResponse(clone(env.store.state), draft.id, {
    strategy: 'wait',
    caseInput,
    assumptions,
    fieldsConfirmed: true,
    safetyReviewed: true,
    sourceFingerprint: responseSourceFingerprint(draftRec),
  }, { now: NOW });
  assert.equal(reh.ok, true, reh.error);
  const saved = env.api.saveResponsePlan(reh);
  assert.equal(saved.ok, true, saved.error);
  const committed = env.api.commitResponsePlan(saved.id, { expectedRevision: env.store.state.meta.revision });
  assert.equal(committed.ok, true, committed.error);

  // Evaluate 14 days later when the delayed-response window has elapsed
  const LATER = new Date('2026-11-15T12:00:00Z');
  const report = settlementReport(env.store.state, LATER, env.store.state.settings, `response:${saved.id}`);
  assert.ok(report.focused);
  assert.ok(report.focused.policyRegret);
  assert.equal(report.focused.policyRegret.chosenStrategy, 'wait');
  assert.ok(report.focused.policyRegret.realizedRegret > 0);

  // Read-only What-If rehearsal does not mutate state
  const revBefore = env.store.state.meta.revision;
  const sim = rehearseLoopWhatIf(report.focused, { clearLeaderGates: true, clearDelegateGates: true, thesisState: 'corroborated', actualMitigation: 1400 });
  assert.equal(sim.overallClearancePct, 100);
  assert.equal(sim.attribution.regime, 'validated-win');
  assert.equal(env.store.state.meta.revision, revBefore);
});

test('Out-of-sample Brier Skill Score is withheld below 5 graded samples and unlocked at >= 5', () => {
  const mkSettled = (id, pct, clean) => ({
    id, loopKey: `case:${id}`, loopKind: 'case-loop', sourceId: id, status: 'settled',
    predictedCleanClosurePct: pct,
    verdict: {
      regime: clean ? 'validated-win' : 'execution-drift-untested-thesis',
      cleanClosure: clean,
      brier: Number(((pct / 100 - (clean ? 1 : 0)) ** 2).toFixed(4)),
    },
  });
  const four = summarizeSettlementCalibration([
    mkSettled('s1', 80, true), mkSettled('s2', 85, true), mkSettled('s3', 20, false), mkSettled('s4', 75, true),
  ]);
  assert.equal(four.gradedCount, 4);
  assert.equal(four.skillSupported, false);
  assert.equal(four.brierSkill, null);

  const five = summarizeSettlementCalibration([
    mkSettled('s1', 80, true), mkSettled('s2', 85, true), mkSettled('s3', 20, false), mkSettled('s4', 75, true), mkSettled('s5', 15, false),
  ]);
  assert.equal(five.gradedCount, 5);
  assert.equal(five.skillSupported, true);
  assert.ok(five.brierSkill > 0.5);
  assert.ok(five.cleanClosureInterval.hiPct > five.cleanClosureInterval.loPct);
});

test('CSV #65 privacy wall, demo seeding + clearDemo(), and WCAG axe-core accessibility across panels', async () => {
  assert.equal(CSV_EXPORTS.length, 69);
  const scope = CSV_EXPORTS.find((s) => s.key === 'settlement-attribution');
  assert.ok(scope);

  // Demo workspace seeds real loops + settlements and clears cleanly without orphan links
  const demo = buildDemoState(NOW);
  assert.ok(demo.settlements.length >= 1);
  const csv = exportWorkspaceCsv(demo, 'settlement-attribution', { now: NOW }).csv;
  assert.match(csv, /STL-L001/);
  assert.match(csv, /STL-CAL/);
  // Must never leak case titles, person names, or raw settlement IDs
  assert.doesNotMatch(csv, /Priya|Mei|stl-demo-1/);

  const demoEnv = setup({ state: demo });
  demoEnv.store.clearDemo();
  assert.equal(demoEnv.store.state.settlements.length, 0);
  assert.equal(demoEnv.store.state.links.some((l) => l.sourceType === 'settlement' || l.targetType === 'settlement'), false);

  // Route, NAV, and JSDOM + axe-core audit across Cockpit, X-Ray, Variance, What-if, Ledger, and Method panels
  assert.equal(parseRoute('#/attribution').route, 'attribution');
  assert.equal(parseRoute('#/earned-schedule').route, 'attribution');
  assert.ok(NAV.some((g) => g.items.some((i) => i.route === 'attribution')));

  const dom = new JSDOM('<!doctype html><html><body><main id="view"></main><div id="modal-root"></div><div id="toast-root"></div></body></html>', { url: 'https://leados.test/#/attribution' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  dom.window.eval(AXE_SRC);

  const liveEnv = adoptedBundleWorkspace();
  for (const panel of ['cockpit', 'xray', 'variance', 'whatif', 'ledger', 'method']) {
    const view = document.getElementById('view');
    view.replaceChildren();
    const ctx = {
      state: liveEnv.store.state,
      store: liveEnv.store,
      api: liveEnv.api,
      now: NOW,
      query: new URLSearchParams(`panel=${panel}&loop=${encodeURIComponent(`bundle:${liveEnv.bundleId}`)}`),
      navigate() {},
      refresh() {},
    };
    const node = renderSettlement(ctx);
    view.appendChild(node);
    assert.equal(node.querySelectorAll('h1').length, 1);
    const axeRes = await dom.window.axe.run(node, { rules: { 'color-contrast': { enabled: false } } });
    assert.deepEqual(axeRes.violations.map((v) => `${panel}:${v.id}`), []);
  }
  dom.window.close();
});
