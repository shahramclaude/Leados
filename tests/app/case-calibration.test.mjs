/**
 * tests/app/case-calibration.test.mjs — Case-Cost Calibration Ledger
 * (Schema v22, Session 32).
 *
 * Covers: FAIR frequency × magnitude scoring maths on known settlements
 * (occurrence Brier, exposure/spend/diverted-days ratios, actuarial loss
 * development); RULE-FCT-03 opening-forecast freeze (first quantification
 * only, immune to later estimate edits and to resolution-time hindsight);
 * snapshot-vs-resolution-estimate scoring sources; settled-actuals capture
 * in resolveCase and backfill via recordCaseActuals with validation;
 * RULE-FCT-04 one-shot under-reserving governance decision linked to the
 * worst settlement; FCT-05..07 signals (silent on the demo baseline);
 * verdict sample floors; the `cases` + `calibration` CSV extensions with
 * CWE-1236 safety; v21→v22 additive migration with repair of dirty
 * actuals/snapshots; the demo baseline (one scored settlement, honestly
 * "collecting evidence"); two pre-existing defect regressions (updateCase
 * closed-status reserve leak; reopenCase stale resolution notes); and the
 * #/cases calibration card + settled-actuals dialog flow in JSDOM with axe.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildDemoState } from '../../app/core/demo.js';
import { migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import {
  buildCaseForecastSnapshot,
  calibrationSummary,
  caseCostCalibration,
  caseCostPairs,
  caseCapacityReferenceClassAdjustment,
  caseReferenceClassAdjustment,
  missingCaseActuals,
} from '../../app/core/domain/calibration.js';
import { AUTOMATION_RULES, previewCasePropagations } from '../../app/core/domain/automation.js';
import { reconstructStateAt } from '../../app/core/domain/health.js';

const require = createRequire(import.meta.url);
const AXE_SRC = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const NOW = new Date('2026-10-26T10:00:00.000Z');
const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const flush = () => new Promise((r) => setTimeout(r, 15));

// PERT fixture used across the suite: o 8000 / m 15000 / p 30000 →
// expected 16333.33, P10 11634.31, P90 21032.36; capacity 3/6/10 → 6.17d.
const FIN = {
  currency: 'USD',
  optimistic: 8000,
  mostLikely: 15000,
  pessimistic: 30000,
  mitigationCost: 4000,
  capacityDaysOptimistic: 3,
  capacityDaysMostLikely: 6,
  capacityDaysPessimistic: 10,
};

function memStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

function harness() {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-${++seq}`;
  const store = createStore({ storage: memStorage(), now: () => NOW, idFactory });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory });
  return { store, api };
}

/** Open one quantified case through the API; returns the case id. */
function openCase(api, { title, probability = 6, openedOn = '2026-09-01', financial = FIN } = {}) {
  const res = api.addCase({
    title,
    kind: 'risk',
    openedOn,
    fmea: { severity: 7, probability, detectability: 4 },
    financial,
  });
  assert.equal(res.ok, true, `open ${title}: ${res.error || ''}`);
  return res.id;
}

/** Resolve a case with settled actuals through the API. */
function settleCase(api, caseId, actuals, resolvedOn = '2026-10-20') {
  const res = api.resolveCase(caseId, {
    resolvedOn,
    resolutionNotes: 'Guardrail verified across two clean cycles.',
    ...actuals,
  });
  assert.equal(res.ok, true, `settle ${caseId}: ${res.error || ''}`);
  return res;
}

test('Case-cost maths on known settlements: FAIR legs, discipline legs, actuarial aggregate, missing list', () => {
  const mk = (id, probability, actuals, extra = {}) => ({
    id,
    title: `Case ${id}`,
    kind: 'risk',
    status: 'resolved',
    openedOn: '2026-08-01',
    resolvedOn: '2026-09-15',
    fmea: { severity: 7, probability, detectability: 4 },
    financial: FIN,
    actuals,
    ...extra,
  });
  const state = {
    cases: [
      mk('c1', 6, { materialised: true, realisedExposure: 19500, mitigationSpend: 4600, divertedDays: 8, settledOn: '2026-09-15', note: '' }),
      mk('c2', 4, { materialised: false, realisedExposure: null, mitigationSpend: 3900, divertedDays: 5, settledOn: '2026-09-16', note: '' }),
      mk('c3', 5, null),
      // Open case with stale-looking actuals is never scored (schema voids
      // them, and the ledger requires a closed status regardless).
      { ...mk('c4', 9, { materialised: true, realisedExposure: 99999, settledOn: '2026-09-15' }), status: 'open' },
    ],
  };

  const pairs = caseCostPairs(state);
  assert.equal(pairs.length, 2, 'only resolved cases with recorded actuals are scored');
  const [p1, p2] = pairs;
  assert.equal(p1.costExpected, 16333.33);
  assert.equal(p1.exposureRatio, 1.1939, '19500 ÷ 16333.33');
  assert.equal(p1.spendRatio, 1.15, '4600 ÷ 4000 planned');
  assert.equal(p1.daysRatio, 1.2966, '8 ÷ 6.17 expected diverted days');
  assert.equal(p1.withinRange, true);
  assert.equal(p1.withinP10P90, true);
  assert.equal(p1.occurrenceBrier, 0.16, '(0.6 − 1)²');
  assert.equal(p1.source, 'resolution-estimate', 'no snapshot → weaker source, labelled');
  assert.equal(p2.exposureRatio, null, 'a contained risk has no magnitude score — only frequency and spend');
  assert.equal(p2.occurrenceBrier, 0.16, '(0.4 − 0)²');
  assert.equal(p2.totalRealised, null, 'incomplete settlement never treats unrecorded exposure as zero');

  const cal = caseCostCalibration(state);
  assert.deepEqual(
    {
      n: cal.occurrence.n,
      materialised: cal.occurrence.materialisedCount,
      assessed: cal.occurrence.meanAssessedProbability,
      observed: cal.occurrence.observedRate,
      gap: cal.occurrence.gapPp,
      brier: cal.occurrence.brier,
    },
    { n: 2, materialised: 1, assessed: 0.5, observed: 0.5, gap: 0, brier: 0.16 },
  );
  assert.equal(cal.exposure.n, 1);
  assert.equal(cal.exposure.verdict.id, 'collecting', 'verdicts refuse below n=5');
  assert.equal(cal.aggregate.n, 1, 'only the complete settlement enters the actuarial sums');
  assert.equal(cal.aggregate.totalRealised, 24100);
  assert.equal(cal.aggregate.totalExpectedUnmitigated, 9800, '16333.33 × 0.6');
  assert.equal(cal.aggregate.developmentFactor, 2.4592);
  assert.equal(cal.missingActuals, 1);
  assert.equal(missingCaseActuals(state)[0].caseId, 'c3');

  // Snapshot-first scoring: the frozen opening belief wins over live edits.
  const snapState = {
    cases: [{
      ...mk('s1', 6, { materialised: true, realisedExposure: 16333.33, settledOn: '2026-09-15' }),
      financial: { ...FIN, optimistic: 100, mostLikely: 200, pessimistic: 300 }, // edited down later
      forecastSnapshot: buildCaseForecastSnapshot({ fmea: { severity: 7, probability: 6, detectability: 4 }, financial: FIN }, '2026-08-01'),
    }],
  };
  const [sp] = caseCostPairs(snapState);
  assert.equal(sp.source, 'opening-forecast');
  assert.equal(sp.costExpected, 16333.33, 'scored against the frozen belief, not the edited estimate');
  assert.equal(sp.exposureRatio, 1);

  // Reference-class floors: nothing from one settlement.
  assert.equal(caseReferenceClassAdjustment(10000, cal), null, 'hint floor n=3 refuses an anecdote uplift');
  assert.equal(caseCapacityReferenceClassAdjustment({ optimistic: 3, mostLikely: 6, pessimistic: 10 }, cal), null, 'capacity reserve correction waits for five settled examples');
  assert.equal(buildCaseForecastSnapshot({ fmea: {}, financial: {} }, '2026-08-01'), null, 'unquantified case has nothing to freeze');
});

test('RULE-FCT-03 freezes the opening case forecast at first quantification and never refreezes', () => {
  const { store, api } = harness();

  const id1 = openCase(api, { title: 'Quantified at open' });
  const rec1 = store.state.cases.find((c) => c.id === id1);
  assert.ok(rec1.forecastSnapshot, 'snapshot frozen at creation');
  assert.equal(rec1.forecastSnapshot.costExpected, 16333.33);
  assert.equal(rec1.forecastSnapshot.fmeaProbability, 6);
  assert.equal(rec1.forecastSnapshot.frozenOn, '2026-10-26');

  // Later estimate edits are legitimate case work — the frozen belief holds.
  const upd = api.updateCase(id1, { financial: { optimistic: 2000, mostLikely: 3000, pessimistic: 4000 } });
  assert.equal(upd.ok, true, upd.error || '');
  assert.equal(store.state.cases.find((c) => c.id === id1).forecastSnapshot.costExpected, 16333.33);

  // Unquantified first, quantified by a later edit → freezes at that edit.
  const bare = api.addCase({ title: 'Unquantified at open', kind: 'risk', openedOn: '2026-09-01', fmea: { probability: 5 } });
  assert.equal(bare.ok, true, bare.error || '');
  assert.equal(store.state.cases.find((c) => c.id === bare.id).forecastSnapshot, null);
  const quant = api.updateCase(bare.id, { financial: { optimistic: 1000, mostLikely: 2000, pessimistic: 9000 } });
  assert.equal(quant.ok, true, quant.error || '');
  const snap = store.state.cases.find((c) => c.id === bare.id).forecastSnapshot;
  assert.ok(snap, 'first quantification via edit freezes the opening forecast');
  assert.equal(snap.costExpected, 3000, '(1000 + 4×2000 + 9000) ÷ 6');
  assert.ok(quant.propagations.some((p) => p.ruleId === 'RULE-FCT-03'), 'freeze reported as a propagation');
});

test('Settled actuals: resolve-time capture, backfill, validation, reopen voiding', () => {
  const { store, api } = harness();
  const id1 = openCase(api, { title: 'Settles at resolution' });

  const bad = api.resolveCase(id1, {
    resolvedOn: '2026-10-20',
    resolutionNotes: 'Verified guardrail in place.',
    realisedExposure: -50,
  });
  assert.equal(bad.ok, false, 'negative actuals are rejected');
  assert.equal(bad.field, 'realisedExposure');

  const res = settleCase(api, id1, {
    actualsMaterialised: 'yes',
    realisedExposure: 21000,
    mitigationSpend: 4300,
    divertedDays: 7,
    actualsNote: 'Finance close rollup',
  });
  assert.equal(res.ok, true);
  const rec = store.state.cases.find((c) => c.id === id1);
  assert.deepEqual(rec.actuals, {
    materialised: true,
    realisedExposure: 21000,
    mitigationSpend: 4300,
    divertedDays: 7,
    settledOn: '2026-10-20',
    note: 'Finance close rollup',
  });

  // Resolve without actuals → unscored, then backfill.
  const id2 = openCase(api, { title: 'Settles later' });
  const bare = api.resolveCase(id2, { resolvedOn: '2026-10-21', resolutionNotes: 'Guardrail verified.' });
  assert.equal(bare.ok, true, bare.error || '');
  assert.equal(store.state.cases.find((c) => c.id === id2).actuals, null);
  assert.deepEqual(missingCaseActuals(store.state).map((m) => m.caseId), [id2]);

  const empty = api.recordCaseActuals(id2, {});
  assert.equal(empty.ok, false, 'a backfill recording nothing is refused');
  const back = api.recordCaseActuals(id2, { actualsMaterialised: 'no', mitigationSpend: 3100, divertedDays: 4 });
  assert.equal(back.ok, true, back.error || '');
  assert.equal(store.state.cases.find((c) => c.id === id2).actuals.materialised, false);
  assert.equal(missingCaseActuals(store.state).length, 0);

  // Open cases cannot receive actuals.
  const id3 = openCase(api, { title: 'Still open' });
  const refused = api.recordCaseActuals(id3, { realisedExposure: 100 });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /Resolve the case/);

  // Reopening voids the settlement and the resolution note (defect fix),
  // keeps the frozen opening forecast.
  const reopened = api.reopenCase(id1);
  assert.equal(reopened.ok, true, reopened.error || '');
  const reopenedRec = store.state.cases.find((c) => c.id === id1);
  assert.equal(reopenedRec.actuals, null, 'settlement leaves the ledger on reopen');
  assert.equal(reopenedRec.resolutionNotes, '', 'live state matches schema reload (pre-v22 defect)');
  assert.ok(reopenedRec.forecastSnapshot, 'the opening belief survives a reopen');
  assert.equal(caseCostPairs(store.state).some((p) => p.caseId === id1), false);
});

test('RULE-CAP-06: five settled diverted-days calibrate open case reserves and downstream portfolio risk', () => {
  const { store, api } = harness();
  // Four observations are intentionally insufficient for an automatic reserve
  // change. Each settled case reports twice the opening PERT diverted-days.
  for (let i = 0; i < 4; i += 1) {
    const id = openCase(api, { title: `Capacity calibration ${i + 1}` });
    settleCase(api, id, { actualsMaterialised: 'no', divertedDays: 12.34 }, `2026-10-${String(10 + i).padStart(2, '0')}`);
  }

  const activeId = openCase(api, { title: 'Still consuming capacity' });
  const activeCase = store.state.cases.find((c) => c.id === activeId);
  const reserve = store.state.portfolio.find((p) => p.kind === 'capacity-reserve' && p.sourceId === activeId);
  assert.ok(reserve);
  assert.equal(reserve.effortDays.mostLikely, 6, 'n=4 keeps the recorded reserve unadjusted');
  assert.equal(activeCase.forecastSnapshot.capacityDaysMostLikely, 6, 'forecast ledger stays tied to manager-entered estimate');

  const fifthId = openCase(api, { title: 'Fifth capacity settlement' });
  const settlement = settleCase(api, fifthId, { actualsMaterialised: 'no', divertedDays: 12.34 }, '2026-10-20');
  assert.equal(settlement.ok, true);

  const refreshed = store.state.portfolio.find((p) => p.id === reserve.id);
  assert.equal(refreshed.effortDays.optimistic, 6, 'settlement reference class scales the reserve triple by the median 2×');
  assert.equal(refreshed.effortDays.mostLikely, 12);
  assert.equal(refreshed.effortDays.pessimistic, 20);
  assert.match(refreshed.rationale, /RULE-CAP-06/);
  assert.ok(settlement.propagations.some((p) => p.ruleId === 'RULE-CAP-06'), 'settlement reports the automatic cross-module rule');
  assert.equal(store.state.cases.find((c) => c.id === activeId).forecastSnapshot.capacityDaysMostLikely, 6, 'calibration never rewrites the immutable forecast');
  const preview = previewCasePropagations({
    title: 'Preview adjusted reserve',
    status: 'open',
    fmea: { severity: 7, probability: 6, detectability: 4 },
    financial: FIN,
  }, store.state, { now: NOW });
  const capacityPreview = preview.find((item) => item.ruleId === 'RULE-CAP-01');
  assert.match(capacityPreview.detail, /RULE-CAP-06/);
  assert.match(capacityPreview.detail, /12\.33d/);

  const highPriority = caseCapacityReferenceClassAdjustment(
    { optimistic: 3, mostLikely: 6, pessimistic: 10 },
    { days: { sufficient: true, n: 5, medianRatio: 1.5, ratioP80: 2 } },
    { highPriority: true },
  );
  assert.equal(highPriority.factor, 2, 'high-priority case uses historical P80 reserve multiplier');
  assert.equal(highPriority.adjustedTriple.mostLikely, 12);
});

test('Defect fix: closing a case via updateCase runs resolution propagation (reserve release + goal check-in)', () => {
  const { store, api } = harness();
  const owner = api.addPerson({ name: 'Ada Lovelace', role: 'Staff Engineer', startDate: '2025-01-10' });
  assert.equal(owner.ok, true, owner.error || '');
  const goal = api.addGoal({ title: 'Keep month-end close reliable', ownerId: owner.id, confidence: 'on-track' });
  assert.equal(goal.ok, true, goal.error || '');

  const res = api.addCase({
    title: 'Reserve leak regression',
    kind: 'risk',
    openedOn: '2026-09-01',
    ownerId: owner.id,
    linkedGoalId: goal.id,
    fmea: { severity: 6, probability: 5, detectability: 5 },
    financial: FIN,
  });
  assert.equal(res.ok, true, res.error || '');
  const reserve = store.state.portfolio.find((p) => p.kind === 'capacity-reserve' && p.sourceId === res.id);
  assert.ok(reserve && reserve.status === 'open', 'RULE-CAP-01 reserve registered at open');

  const closed = api.updateCase(res.id, { status: 'resolved' });
  assert.equal(closed.ok, true, closed.error || '');
  const after = store.state.portfolio.find((p) => p.id === reserve.id);
  assert.equal(after.status, 'released', 'Edit-dialog close releases the reserve like resolveCase does');
  assert.ok(closed.propagations.some((p) => p.ruleId === 'RULE-CAP-01'));
  const updatedGoal = store.state.goals.find((g) => g.id === goal.id);
  assert.ok(
    (updatedGoal.checkins || []).some((chk) => String(chk.note || '').includes(`[Case ${res.id} resolved]`)),
    'RULE-GOAL-01 resolution check-in logged via the edit path too',
  );
});

test('RULE-FCT-04 opens exactly one under-reserving governance decision, linked to the worst settlement', () => {
  const { store, api } = harness();
  // Five materialised settlements at ratios 1.3/1.4/1.5/1.6/2.0 → median 1.5.
  const realisedByRatio = [21233.33, 22866.66, 24500, 26133.33, 32666.66];
  const ids = realisedByRatio.map((_, i) => openCase(api, { title: `Under-reserved ${i + 1}` }));

  let last = null;
  ids.forEach((caseId, i) => {
    const decisionsBefore = store.state.decisions.length;
    last = settleCase(api, caseId, {
      actualsMaterialised: 'yes',
      realisedExposure: realisedByRatio[i],
      mitigationSpend: 4000,
      divertedDays: 6,
    });
    if (i < 4) {
      assert.equal(store.state.decisions.length, decisionsBefore, 'no governance below n=5 scored settlements');
    }
  });

  const cal = caseCostCalibration(store.state);
  assert.equal(cal.exposure.n, 5);
  assert.equal(cal.exposure.medianRatio, 1.5);
  assert.equal(cal.exposure.verdict.id, 'under-reserved');
  assert.ok(last.propagations.some((p) => p.ruleId === 'RULE-FCT-04'), 'governance fired inside the settling write');

  const govLinks = store.state.links.filter((l) => l.ruleId === 'RULE-FCT-04');
  assert.equal(govLinks.length, 1);
  const link = govLinks[0];
  const decision = store.state.decisions.find((d) => d.id === (link.sourceType === 'decision' ? link.sourceId : link.targetId));
  assert.ok(decision, 'DACI decision created');
  assert.match(decision.title, /1\.5×/);
  assert.equal(link.targetId, ids[4], 'linked to the worst under-assessment (2.0×)');
  assert.ok(decision.options.some((o) => /P80/.test(o.label)), 'offers the P80 reserving option');
  assert.equal(decision.forecastProbability, null, 'the governance decision itself states no forecast');

  // Idempotent while unreviewed: a sixth settlement opens nothing new.
  const sixth = openCase(api, { title: 'Under-reserved 6' });
  const decisionsBefore = store.state.decisions.length;
  settleCase(api, sixth, { actualsMaterialised: 'yes', realisedExposure: 30000, mitigationSpend: 4000, divertedDays: 6 });
  assert.equal(store.state.decisions.length, decisionsBefore, 'no duplicate governance while the first awaits review');
});

test('FCT-05/06/07 fire on sufficient evidence and stay silent on the demo baseline', () => {
  const { store, api } = harness();
  // Six settlements: all materialise against 30% assessed probability
  // (FMEA 3/10) and settle heavy → FCT-05 + FCT-06. Three more resolved
  // without actuals → FCT-07.
  for (let i = 0; i < 6; i += 1) {
    const cid = openCase(api, { title: `Blind spot ${i + 1}`, probability: 3 });
    settleCase(api, cid, { actualsMaterialised: 'yes', realisedExposure: 26000, mitigationSpend: 4000, divertedDays: 9 });
  }
  for (let i = 0; i < 3; i += 1) {
    const cid = openCase(api, { title: `Unscored ${i + 1}`, probability: 5 });
    const r = api.resolveCase(cid, { resolvedOn: '2026-10-21', resolutionNotes: 'Guardrail verified.' });
    assert.equal(r.ok, true, r.error || '');
  }
  const fired = new Set(buildInsights(store.state, NOW).findings.map((f) => f.ruleId));
  assert.ok(fired.has('FCT-05'), 'under-reserving signal');
  assert.ok(fired.has('FCT-06'), 'occurrence blind-spot signal (100% observed vs 30% assessed)');
  assert.ok(fired.has('FCT-07'), 'missing-actuals prompt');

  const demo = buildDemoState(NOW);
  const demoFired = new Set(buildInsights(demo, NOW).findings.map((f) => f.ruleId));
  for (const ruleId of ['FCT-05', 'FCT-06', 'FCT-07']) {
    assert.ok(!demoFired.has(ruleId), `${ruleId} silent on the demo baseline`);
  }
  const demoCal = caseCostCalibration(demo);
  assert.equal(demoCal.settledCount, 1, 'the demo carries exactly one scored settlement');
  assert.equal(demoCal.exposure.verdict.id, 'collecting');
  assert.equal(demoCal.exposure.medianRatio, 1.1939, '19500 ÷ 16333.33 from the frozen opening snapshot');
  assert.equal(demoCal.pairs[0].source, 'opening-forecast');
  assert.equal(calibrationSummary(demo).cases.settledCount, 1, 'summary exposes the third ledger');

  // Point-in-time rewind between open and settlement: the case is open
  // again and its future settlement does not leak into the historical read.
  const rewound = reconstructStateAt(demo, new Date('2026-08-20T10:00:00.000Z')).state;
  const rewoundCase = rewound.cases.find((c) => c.id === demoCal.pairs[0].caseId);
  assert.ok(rewoundCase, 'case opened 2026-08-12 exists on the 2026-08-20 snapshot');
  assert.equal(rewoundCase.status, 'open');
  assert.equal(rewoundCase.actuals, null, 'settled actuals rewind with the resolution');
  assert.ok(rewoundCase.forecastSnapshot, 'the opening freeze (2026-08-12) predates the cutoff and survives');
});

test('Schema v23: v21 → v23 migration path is additive; dirty actuals and snapshots are repaired, never invented', () => {
  assert.equal(SCHEMA_VERSION, 32);
  const v21 = {
    schemaVersion: 21,
    cases: [{
      id: 'legacy',
      title: 'Legacy resolved case',
      status: 'resolved',
      openedOn: '2026-08-01',
      resolvedOn: '2026-09-01',
      financial: FIN,
    }],
  };
  const migrated = migrate(v21);
  assert.deepEqual(migrated.applied, ['21 → 22', '22 → 23', '23 → 24', '24 → 25', '25 → 26', '26 → 27', '27 → 28', '28 → 29', '29 → 30', '30 → 31', '31 → 32']);
  const { state } = normalizeState(migrated.raw, { now: NOW });
  const legacy = state.cases.find((c) => c.id === 'legacy');
  assert.equal(legacy.actuals, null, 'no settled actual is invented for pre-v22 history');
  assert.equal(legacy.forecastSnapshot, null, 'no opening snapshot is fabricated');
  assert.equal(missingCaseActuals(state)[0].source, 'resolution-estimate', 'legacy backfill scores against the labelled weaker source');

  const dirty = normalizeState({
    schemaVersion: 22,
    cases: [
      {
        id: 'dirty',
        title: 'Dirty settlement',
        status: 'resolved',
        openedOn: '2026-08-01',
        resolvedOn: '2026-09-01',
        actuals: { materialised: 'perhaps', realisedExposure: -10, mitigationSpend: 'lots', divertedDays: 3, settledOn: '2027-01-01', note: 'x' },
        forecastSnapshot: { costExpected: 0, capacityDaysExpected: 0, mitigationCost: 0 },
      },
      {
        id: 'open-with-actuals',
        title: 'Open case claiming a settlement',
        status: 'open',
        openedOn: '2026-08-01',
        actuals: { materialised: true, realisedExposure: 5000 },
      },
    ],
  }, { now: NOW }).state;
  const repaired = dirty.cases.find((c) => c.id === 'dirty');
  assert.equal(repaired.actuals.materialised, null, 'non-boolean materialisation is unknown, not guessed');
  assert.equal(repaired.actuals.realisedExposure, null, 'negative exposure repaired to null');
  assert.equal(repaired.actuals.mitigationSpend, null);
  assert.equal(repaired.actuals.divertedDays, 3, 'valid legs survive repair');
  assert.equal(repaired.actuals.settledOn, '2026-09-01', 'future settlement date falls back to resolvedOn');
  assert.equal(repaired.forecastSnapshot, null, 'a snapshot with no measurable leg is dropped whole');
  assert.equal(dirty.cases.find((c) => c.id === 'open-with-actuals').actuals, null, 'open cases carry no settlement');
});

test('CSV: cases scope gains settlement columns; calibration scope gains case rows; CWE-1236 safe', () => {
  const { store, api } = harness();
  const scored = openCase(api, { title: '=HYPERLINK(evil) settled case' });
  settleCase(api, scored, {
    actualsMaterialised: 'yes',
    realisedExposure: 19500,
    mitigationSpend: 4600,
    divertedDays: 8,
  });
  const unscored = openCase(api, { title: 'Unscored resolved case' });
  const r = api.resolveCase(unscored, { resolvedOn: '2026-10-21', resolutionNotes: 'Guardrail verified.' });
  assert.equal(r.ok, true, r.error || '');

  const casesOut = exportWorkspaceCsv(store.state, 'cases', { now: NOW });
  assert.equal(casesOut.ok, true);
  assert.ok(!casesOut.csv.includes('"=HYPERLINK'), 'formula payload never starts a cell unescaped');
  const { headers, rows } = parseCsv(casesOut.csv);
  const col = (n) => headers.indexOf(n);
  for (const name of ['actuals_materialised', 'actual_realised_exposure', 'exposure_ratio', 'occurrence_brier', 'forecast_source', 'settled_on']) {
    assert.ok(col(name) >= 0, `cases CSV carries ${name}`);
  }
  const scoredRow = rows.find((row) => row[col('case_id')] === scored);
  assert.equal(scoredRow[col('actuals_materialised')], 'yes');
  assert.equal(scoredRow[col('exposure_ratio')], '1.1939');
  assert.equal(scoredRow[col('occurrence_brier')], '0.16');
  assert.equal(scoredRow[col('forecast_source')], 'opening-forecast');
  const unscoredRow = rows.find((row) => row[col('case_id')] === unscored);
  assert.equal(unscoredRow[col('exposure_ratio')], '', 'unscored stays blank, never zero');

  const calOut = exportWorkspaceCsv(store.state, 'calibration', { now: NOW });
  assert.equal(calOut.ok, true);
  const parsed = parseCsv(calOut.csv);
  const ccol = (n) => parsed.headers.indexOf(n);
  const types = parsed.rows.map((row) => row[ccol('record_type')]).filter(Boolean).sort();
  assert.deepEqual(types, ['case-exposure', 'case-missing-actuals', 'case-occurrence']);
  const occRow = parsed.rows.find((row) => row[ccol('record_type')] === 'case-occurrence');
  assert.equal(occRow[ccol('forecast')], '60%');
  assert.equal(occRow[ccol('score')], '0.16');
});

test('AUTOMATION_RULES catalogues RULE-FCT-03 and RULE-FCT-04 with named frameworks', () => {
  const byId = new Map(AUTOMATION_RULES.map((r) => [r.id, r]));
  assert.match(byId.get('RULE-FCT-03').framework, /FAIR/);
  assert.equal(byId.get('RULE-FCT-03').targetModule, 'cases');
  assert.match(byId.get('RULE-FCT-03').trigger, /case\.created/);
  assert.match(byId.get('RULE-FCT-04').framework, /Actuarial/);
  assert.equal(byId.get('RULE-FCT-04').targetModule, 'decisions');
  assert.match(byId.get('RULE-FCT-04').trigger, /case\.resolved/);
  assert.match(byId.get('RULE-CAP-06').framework, /Reference-Class/);
  assert.equal(byId.get('RULE-CAP-06').targetModule, 'portfolio / capacity / decisions / goals');
  assert.match(byId.get('RULE-CAP-06').trigger, /case\.actuals/);
});

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

test('UI: #/cases calibration card + detail settlement panel render; record-actuals dialog writes through; axe-clean', async () => {
  const env = bootDom();
  let app = null;
  try {
    const { createApp } = await import('../../app/main.js');
    app = createApp({ storage: env.window.localStorage, now: () => NOW });
    app.ctx.loadDemo();

    app.navigate('#/cases');
    await flush();
    const view = env.document.querySelector('#view');
    const text = view.textContent;
    assert.ok(text.includes('Case-Cost Calibration'), 'ledger card present on #/cases');
    assert.ok(text.includes('Collecting evidence'), 'small-sample honesty on the demo');
    assert.ok(text.includes('1.1939'), 'median development from the one demo settlement');
    assert.ok(view.querySelector('svg[aria-label*="Settled vs assessed"]'), 'ratio chart with text summary');
    assert.ok(text.includes('Case settlement data table'), 'chart carries its data-table alternative');

    env.window.eval(AXE_SRC);
    const axeRes = await env.window.axe.run(view, { rules: { 'color-contrast': { enabled: false } } });
    assert.deepEqual(Array.from(axeRes.violations).map((v) => v.id), [], 'zero axe violations on #/cases with calibration card');

    // Detail view of the settled demo case: settlement panel with scores.
    const demo = app.ctx.state;
    const settled = demo.cases.find((c) => c.actuals);
    assert.ok(settled, 'demo carries a settled case');
    app.navigate(`#/cases/${settled.id}`);
    await flush();
    const detailText = env.document.querySelector('#view').textContent;
    assert.ok(detailText.includes('Settled Actuals vs Opening Forecast'));
    assert.ok(detailText.includes('Scored vs frozen opening forecast'));
    assert.ok(detailText.includes('1.1939× forecast'));

    // Record-actuals dialog opens, and its fields never pre-fill estimates
    // into a fresh settlement (this case edits its recorded values only).
    const editBtn = Array.from(env.document.querySelectorAll('#view button'))
      .find((b) => b.textContent.trim() === 'Edit settled actuals');
    assert.ok(editBtn, 'edit-actuals action on the settled case');
    editBtn.click();
    await flush();
    const dialog = env.document.querySelector('[role="dialog"]');
    assert.ok(dialog, 'settled-actuals dialog opens');
    assert.ok(dialog.textContent.includes('score the opening forecast'));
    const exposureField = dialog.querySelector('[name="realisedExposure"]');
    assert.ok(exposureField);
    assert.equal(exposureField.value, '19500', 'editing shows the recorded actual, not the 16333.33 estimate');
    exposureField.value = '20000';
    exposureField.dispatchEvent(new env.window.Event('input', { bubbles: true }));
    const submit = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Record actuals');
    submit.click();
    await flush();
    const updated = app.ctx.state.cases.find((c) => c.id === settled.id);
    assert.equal(updated.actuals.realisedExposure, 20000, 'dialog writes through the real action');

    // Resolve dialog carries the optional settled-actuals section, blank.
    const open = app.ctx.state.cases.find((c) => c.status === 'open' || c.status === 'mitigating');
    app.navigate(`#/cases/${open.id}`);
    await flush();
    const resolveBtn = Array.from(env.document.querySelectorAll('#view button'))
      .find((b) => b.textContent.trim() === 'Resolve case');
    assert.ok(resolveBtn);
    resolveBtn.click();
    await flush();
    const resolveDialog = env.document.querySelector('[role="dialog"]');
    assert.ok(resolveDialog.textContent.includes('Settled actuals'), 'resolve flow captures actuals at the moment of settlement');
    assert.equal(resolveDialog.querySelector('[name="realisedExposure"]').value, '', 'fresh actuals start blank — never pre-filled from estimates');

    assert.deepEqual(env.consoleErrors, [], 'no console errors during the UI flows');
  } finally {
    app?.destroy?.();
    env.window.close();
  }
});
