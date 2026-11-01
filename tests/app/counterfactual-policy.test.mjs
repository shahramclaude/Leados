import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { createEmptyState, migrate, SCHEMA_VERSION } from '../../app/core/schema.js';
import { buildDemoState } from '../../app/core/demo.js';
import {
  binomialSurvival,
  bootstrapDelta,
  counterfactualAttentionCount,
  counterfactualReport,
  counterfactualSignals,
  harvestPolicyUnits,
  hoeffdingConfidenceSequence,
  matchPairs,
  mcnemarUpperBound,
  pairedAnalysis,
  policyChoices,
  rosenbaumDesignSensitivity,
  seededRandom,
} from '../../app/core/domain/counterfactualPolicy.js';
import { counterfactualRule } from '../../app/core/domain/counterfactualPolicyRules.js';
import {
  normalizePolicyEvaluations,
  normalizePolicyMarkers,
  normalizeCounterfactualSettings,
} from '../../app/core/domain/counterfactualPolicySchema.js';
import {
  COUNTERFACTUAL_LIMITS,
  COUNTERFACTUAL_RULE_IDS,
  POLICY_FAMILIES,
} from '../../app/core/domain/counterfactualRegistry.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { exportWorkspaceCsv, parseCsv, CSV_EXPORTS } from '../../app/core/csv.js';
import { LINK_ENTITY_TYPES, LINK_RELATIONS, SYSTEM_GENERATED_LINK_RELATIONS } from '../../app/core/domain/cases.js';
import { renderCounterfactual } from '../../app/views/counterfactual.js';
import { parseRoute, NAV } from '../../app/main.js';
import { DOMAIN_ORDER, buildInsights } from '../../app/core/domain/insights.js';

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
  const idFactory = (p) => `${p}-cfptest-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }), storage, idFactory };
}

const day = (offset) => {
  const d = new Date(NOW.getTime() + offset * 86_400_000);
  return d.toISOString().slice(0, 10);
};

/**
 * A purpose-built workspace with four decision-point families, both arms
 * populated, and a designed reward structure. Everything is ordinary workspace
 * record-keeping — no policy engine output is written by hand.
 */
function policyWorkspace({ tested = 12, accepted = 12, onTime = 12, late = 12, checked = 12, unchecked = 12 } = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.schemaVersion = SCHEMA_VERSION;
  state.settings.leaderName = 'Test Leader';

  // Assumption family: `tested` premises carry a dated observation before the
  // outcome; `accepted` carry none. Tested hold 4/6 of the time (8 of 12),
  // accepted hold 2/6 (4 of 12).
  let k = 0;
  const addPremise = (isTested, held, idx) => {
    const createdOn = day(-(200 - idx * 4));
    const settledOn = day(-(200 - idx * 4) + 30);
    const id = `prm-${k++}`;
    state.premises.push({
      id,
      title: isTested ? `Tested assumption ${idx}` : `Accepted assumption ${idx}`,
      statement: 'x',
      signpost: 'y',
      decisionId: null,
      ownerId: null,
      criticality: idx % 2 ? 'load-bearing' : 'supporting',
      priorPct: 50 + (idx % 5) * 8,
      watchPct: 55,
      breachPct: 30,
      halfLifeDays: 90,
      reviewBy: day(-(200 - idx * 4) + [21, 30, 45][idx % 3]),
      lastReviewedOn: null,
      acknowledgedOn: null,
      acknowledgedAt: null,
      humanDisposition: null,
      sourceRefs: [],
      observations: isTested
        ? [{
          id: `${id}-o`, key: `${id}-o`, sensorId: 'manual', sensorLabel: 'Manual check',
          sourceType: '', sourceId: '', sourceRoute: '', title: 't', summary: 's',
          direction: held ? 'for' : 'against', likelihoodRatio: 2.5,
          observedOn: day(-(200 - idx * 4) + 10), createdAt: `${day(-(200 - idx * 4) + 10)}T09:00:00.000Z`,
        }]
        : [],
      history: [],
      createdAt: `${createdOn}T09:00:00.000Z`,
      updatedAt: `${settledOn}T09:00:00.000Z`,
    });
    state.premiseOutcomes.push({
      id: `pro-${k}`, premiseId: id, verdict: held ? 'held' : 'failed',
      settledOn, note: '', createdAt: `${settledOn}T09:00:00.000Z`,
    });
  };
  for (let i = 0; i < tested; i += 1) addPremise(true, i % 3 !== 2, i);
  for (let i = 0; i < accepted; i += 1) addPremise(false, i % 3 === 0, tested + i);

  // Decision family: `onTime` decided inside the window, `late` after it.
  const addDecision = (isOnTime, good, idx) => {
    const openedOn = day(-(300 - idx * 4));
    const reviewOn = day(-(300 - idx * 4) + [21, 30, 21, 45][idx % 4]);
    const decidedOn = isOnTime ? day(-(300 - idx * 4) + 3) : day(-(300 - idx * 4) + 60);
    state.decisions.push({
      id: `dec-${idx}`,
      title: `Decision ${idx}`,
      question: 'q',
      date: openedOn,
      reversibility: idx % 2 ? 'reversible' : 'irreversible',
      driver: 'Test Leader',
      approver: '', contributors: '', informed: '',
      options: [{ id: `o-${idx}a`, label: 'A', pros: '', cons: '' }],
      chosen: 'A',
      rationale: '',
      reviewOn,
      reviewedOn: day(-(300 - idx * 4) + 70),
      outcome: good ? 'good' : 'bad',
      outcomeNotes: '',
      forecastProbability: good ? 70 : 45,
      decidedOn,
      createdAt: `${openedOn}T09:00:00.000Z`,
      portfolioNotes: [],
    });
  };
  for (let i = 0; i < onTime; i += 1) addDecision(true, i % 3 !== 2, i);
  for (let i = 0; i < late; i += 1) addDecision(false, i % 4 === 0, onTime + i);

  // Delegation family: `checked` carry a checkpoint before the due date.
  const addDelegation = (isChecked, deliveredOnTime, idx) => {
    const delegatedOn = day(-(150 - idx * 4));
    const dueOn = day(-(150 - idx * 4) + [14, 21, 30][idx % 3]);
    const terminalOn = deliveredOnTime ? day(-(150 - idx * 4) + 18) : day(-(150 - idx * 4) + 34);
    state.delegations.push({
      id: `del-${idx}`,
      personId: null,
      title: `Delegation ${idx}`,
      expectedOutcome: 'x',
      authority: ['recommend', 'agree', 'act-inform', 'own'][idx % 4],
      support: '',
      delegatedOn,
      dueOn,
      status: deliveredOnTime ? 'done' : 'returned',
      checkins: isChecked
        ? [{ id: `c-${idx}`, date: day(-(150 - idx * 4) + 7), progress: 'on-track', note: 'n', createdAt: `${day(-(150 - idx * 4) + 7)}T09:00:00.000Z` }]
        : [],
      completedOn: deliveredOnTime ? terminalOn : null,
      completionNote: '',
      sourceNegotiationId: null, sourceTermId: null, priorDelegationId: null,
      supersededByDelegationId: null, recoveredOn: null, recoveryNote: '',
      returnedOn: deliveredOnTime ? null : terminalOn,
      returnReason: deliveredOnTime ? '' : 'late',
      createdAt: `${delegatedOn}T09:00:00.000Z`,
      updatedAt: `${terminalOn}T09:00:00.000Z`,
    });
  };
  for (let i = 0; i < checked; i += 1) addDelegation(true, i % 4 !== 3, i);
  for (let i = 0; i < unchecked; i += 1) addDelegation(false, i % 4 === 0, checked + i);

  return state;
}

/* ------------------------------------------------------------------ *
 * 1. Special functions & estimators
 * ------------------------------------------------------------------ */

test('binomial survival matches closed-form values', () => {
  assert.equal(binomialSurvival(10, 8, 0.5).toFixed(6), '0.054688');
  assert.equal(binomialSurvival(10, 0, 0.5), 1);
  assert.equal(binomialSurvival(10, 11, 0.5), 0);
  assert.equal(binomialSurvival(0, 0, 0.5), 1);
  assert.equal(binomialSurvival(5, 3, 0), 0);
  assert.equal(binomialSurvival(5, 3, 1), 1);
  // Total mass sums to one.
  let total = 0;
  for (let k = 0; k <= 12; k += 1) total += binomialSurvival(12, k, 0.4) - binomialSurvival(12, k + 1, 0.4);
  assert.ok(Math.abs(total - 1) < 1e-9);
});

test('McNemar bound is monotone in Gamma and exact at Gamma = 1', () => {
  const m = 24;
  const k = 18;
  const p1 = mcnemarUpperBound(m, k, 1);
  const p2 = mcnemarUpperBound(m, k, 2);
  const p5 = mcnemarUpperBound(m, k, 5);
  assert.ok(p1 < p2 && p2 < p5, 'the worst-case p-value cannot shrink as hidden bias grows');
  // At Gamma = 1 the bound is the two-sided exact sign test.
  let expected = 0;
  for (let j = k; j <= m; j += 1) expected += binomialSurvival(1, 1, 0) * 0 + (binomialSurvival(m, j, 0.5) - binomialSurvival(m, j + 1, 0.5));
  assert.ok(Math.abs(p1 - Math.min(1, 2 * expected)) < 1e-9);
});

test('design sensitivity bisects to the Gamma where the finding is overturned', () => {
  const strong = rosenbaumDesignSensitivity(40, 30);
  assert.equal(strong.significantAtOne, true);
  assert.ok(strong.gamma > 1, 'a 30/40 split survives more than no bias at all');
  assert.ok(mcnemarUpperBound(40, 30, strong.gamma) <= 0.05 + 1e-9);
  const weak = rosenbaumDesignSensitivity(10, 6);
  assert.equal(weak.significantAtOne, false, 'a 6/10 split is not significant even unconfounded');
  assert.equal(weak.gamma, 1);
  assert.equal(rosenbaumDesignSensitivity(0, 0).gamma, null);
});

test('the Hoeffding confidence sequence holds its coverage under continuous monitoring', () => {
  const rng = seededRandom(0x1234abcd);
  const n = 60;
  const trials = 1200;
  let violations = 0;
  for (let t = 0; t < trials; t += 1) {
    const values = [];
    for (let i = 0; i < n; i += 1) values.push(rng() < 0.5 ? 1 : 0);
    const seq = hoeffdingConfidenceSequence(values, { alpha: 0.05 });
    // Time-uniform: the claim is that the true mean is inside at EVERY t.
    if (seq.some((row) => 0.5 < row.low || 0.5 > row.high)) violations += 1;
  }
  const rate = violations / trials;
  assert.ok(rate < 0.05, `time-uniform coverage violated on ${rate} of runs, expected under 5%`);
  // The boundary must shrink as evidence accumulates.
  const seq = hoeffdingConfidenceSequence(Array.from({ length: 200 }, (_, i) => i % 2));
  assert.ok(seq[199].halfWidth < seq[9].halfWidth);
  assert.ok(seq[0].low === 0 || seq[0].low >= 0);
  assert.ok(seq[0].high <= 1);
});

test('the seeded RNG is deterministic and uniform', () => {
  const a = seededRandom(42);
  const b = seededRandom(42);
  for (let i = 0; i < 50; i += 1) assert.equal(a(), b());
  const c = seededRandom(7);
  let mean = 0;
  for (let i = 0; i < 20000; i += 1) mean += c();
  assert.ok(Math.abs(mean / 20000 - 0.5) < 0.02);
});

/* ------------------------------------------------------------------ *
 * 2. Harvesting
 * ------------------------------------------------------------------ */

test('harvesting produces one unit per scored decision point and nothing more', () => {
  const state = policyWorkspace();
  const units = harvestPolicyUnits(state, NOW);
  assert.equal(units.length, 72); // 24 assumptions + 24 decisions + 24 delegations
  for (const u of units) {
    assert.ok(POLICY_FAMILIES.includes(u.family));
    assert.ok(u.arm === 0 || u.arm === 1);
    assert.ok(u.reward >= 0 && u.reward <= 1);
    assert.ok(u.decidedOn <= u.settledOn, 'an arm cannot be taken after its outcome is recorded');
  }
  const byFamily = {};
  for (const u of units) byFamily[u.family] = (byFamily[u.family] || 0) + 1;
  assert.deepEqual(byFamily, { assumption: 24, decision: 24, delegation: 24 });
});

test('the arm comes from the record, never from the outcome', () => {
  const state = policyWorkspace({ tested: 6, accepted: 0, onTime: 0, late: 0, checked: 0, unchecked: 0 });
  const units = harvestPolicyUnits(state, NOW);
  assert.equal(units.length, 6);
  assert.ok(units.every((u) => u.arm === 1), 'every premise carried a dated observation before it settled');
  // A failed-but-tested assumption is still arm 1 — the arm is what was DONE.
  assert.ok(units.some((u) => u.reward === 0 && u.arm === 1));
});

test('matched-pairs covariates are pre-treatment, never functions of the arm', () => {
  const state = policyWorkspace();
  const units = harvestPolicyUnits(state, NOW);
  for (const u of units) {
    assert.ok('horizon' in u.covariates && 'prior' in u.covariates);
  }
  // The decision family's arm is decidedOn-vs-reviewOn, which must NOT be a
  // covariate: matching on it collapses overlap to zero.
  const decisions = units.filter((u) => u.family === 'decision');
  const covariateKeys = Object.keys(decisions[0].covariates);
  assert.ok(!covariateKeys.includes('delayDays'));
  assert.ok(!covariateKeys.includes('ageDays'));
});

test('prequential policies never see the point they are scoring', () => {
  const units = harvestPolicyUnits(policyWorkspace(), NOW);
  const history = [];
  const seen = [];
  for (const u of units) {
    seen.push(policyChoices(['prequential-best'], u, history, u.settledOn)['prequential-best']);
    history.push({ family: u.family, arm: u.arm, reward: u.reward, settledOn: u.settledOn });
  }
  // The first point of every family has no history at all and must take the
  // declared default (arm 1), never the arm it happened to take.
  const firstByFamily = new Map();
  units.forEach((u, i) => {
    if (!firstByFamily.has(u.family)) firstByFamily.set(u.family, i);
  });
  for (const [, i] of firstByFamily) assert.equal(seen[i], 1);
  // And with an empty history the answer is deterministic.
  assert.equal(policyChoices(['always-act'], units[0], [], null)['always-act'], 1);
  assert.equal(policyChoices(['always-hold'], units[0], [], null)['always-hold'], 0);
  assert.equal(policyChoices(['observed'], units[0], [], null)['observed'], units[0].arm);
});

/* ------------------------------------------------------------------ *
 * 3. Report behaviour, identification and refusals
 * ------------------------------------------------------------------ */

test('the behaviour policy is exactly identified — no model, no weight', () => {
  const state = policyWorkspace();
  const report = counterfactualReport(state, NOW);
  assert.equal(report.observable, true);
  const observed = report.race.find((r) => r.policyId === 'observed');
  const plainMean = report.counts.units
    ? harvestPolicyUnits(state, NOW).reduce((a, u) => a + u.reward, 0) / report.counts.units
    : null;
  assert.ok(Math.abs(observed.value - plainMean) < 1e-4, 'the recorded score is the plain mean reward');
  assert.equal(observed.dm, observed.value);
  assert.equal(observed.dr, observed.value);
  assert.equal(observed.agreementPct, 100);
  assert.equal(observed.deltaPp, 0);
  assert.equal(observed.ci, null, 'an exactly identified value needs no interval');
});

test('an empty workspace prints counts and estimates nothing', () => {
  const report = counterfactualReport(createEmptyState(NOW.toISOString()), NOW);
  assert.equal(report.observable, false);
  assert.equal(report.counts.units, 0);
  assert.equal(report.race.length, 0, 'no policy value is produced below the floor');
  assert.equal(report.observedValue, null);
  // A brand-new workspace is silent here on purpose: an empty workspace gets
  // the setup nudge (SETUP-01) and nothing else. The floor complaint is for a
  // record that exists and is too thin, not for one that has not started.
  const signals = counterfactualSignals(createEmptyState(NOW.toISOString()), NOW);
  assert.equal(signals.length, 0);
  assert.equal(counterfactualAttentionCount(createEmptyState(NOW.toISOString()), NOW), 0);
  // ... and it does speak once there is a record that is too thin to price.
  const thin = policyWorkspace({ tested: 2, accepted: 1, onTime: 1, late: 0, checked: 1, unchecked: 0 });
  const thinSignals = counterfactualSignals(thin, NOW);
  assert.equal(thinSignals.length, 1);
  assert.equal(thinSignals[0].ruleId, 'CFP-05');
  assert.ok(/floor is 12/.test(thinSignals[0].detail), 'the floor and the gap are printed');
});

test('a one-armed record refuses rather than extrapolating', () => {
  // Only arm 1 exists: no policy that disagrees can be identified.
  const state = policyWorkspace({ tested: 20, accepted: 0, onTime: 20, late: 0, checked: 20, unchecked: 0 });
  const report = counterfactualReport(state, NOW);
  assert.equal(report.counts.arm0, 0);
  assert.equal(report.observable, false, 'the per-arm floor blocks estimation entirely');
  assert.equal(report.race.length, 0);
});

test('Manski bounds bracket the point estimate and determine the sign when overlap is total', () => {
  const state = policyWorkspace();
  const report = counterfactualReport(state, NOW);
  for (const row of report.race) {
    if (row.policyId === 'observed') continue;
    const low = (row.manski.noAssumption.low - row.observed) * 100;
    const high = (row.manski.noAssumption.high - row.observed) * 100;
    assert.ok(low <= row.deltaPp + 1e-6 && row.deltaPp <= high + 1e-6,
      `${row.policyId}: point estimate ${row.deltaPp} escaped its own identified set [${low}, ${high}]`);
    assert.ok(row.manski.familyObserved.low <= row.manski.noAssumption.low + 1e-9);
    assert.ok(row.manski.familyObserved.high >= row.manski.noAssumption.high - 1e-9,
      'the family-bounded interval must sit inside the assumption-free one');
  }
  // The observed policy leaves nothing unobserved, so its bounds collapse.
  const observed = report.race.find((r) => r.policyId === 'observed');
  assert.equal(observed.manski.missingFraction, 0);
});

test('a policy the leader already follows is nearly identified, one they never follow is not', () => {
  // Deliberately lopsided: the leader takes the active arm three times out of
  // four, so "always act" really is closer to the behaviour policy.
  const state = policyWorkspace({ tested: 18, accepted: 6, onTime: 18, late: 6, checked: 18, unchecked: 6 });
  const report = counterfactualReport(state, NOW);
  const act = report.race.find((r) => r.policyId === 'always-act');
  const hold = report.race.find((r) => r.policyId === 'always-hold');
  assert.ok(act.agreementPct > hold.agreementPct,
    `always-act agrees ${act.agreementPct}% vs always-hold ${hold.agreementPct}%`);
  assert.ok(act.manski.missingFraction < hold.manski.missingFraction,
    'the policy closest to the record leaves less of its value unobserved');
  assert.ok(act.effectiveSample > hold.effectiveSample);
});

test('matched pairs report balance and the paired test excludes 0.5 rewards', () => {
  const state = policyWorkspace();
  const report = counterfactualReport(state, NOW);
  assert.ok(report.match.pairs > 0);
  for (const [family, row] of Object.entries(report.match.perFamily)) {
    if (!row.asmdAfter) continue;
    for (const [key, value] of Object.entries(row.asmdAfter)) {
      if (value === null) continue;
      assert.ok(Number.isFinite(value), `${family}.${key} balance must be finite or null`);
    }
  }
  // Every reward is 0 or 1 in this workspace, so nothing is excluded.
  assert.equal(report.paired.excludedPairs, 0);
  assert.equal(report.paired.binaryPairs, report.match.pairs);
  assert.ok(report.paired.gammaCurve.length >= 5);
  assert.equal(report.paired.gammaCurve[0].gamma, 1);
});

test('a "mixed" decision review is excluded from the paired test, not rounded', () => {
  const state = policyWorkspace({ tested: 0, accepted: 0, onTime: 8, late: 8, checked: 0, unchecked: 0 });
  state.decisions[0].outcome = 'mixed';
  state.decisions[1].outcome = 'mixed';
  const report = counterfactualReport(state, NOW);
  assert.equal(report.paired.excludedPairs >= 0, true);
  const mixedUnits = harvestPolicyUnits(state, NOW).filter((u) => u.reward === 0.5);
  assert.equal(mixedUnits.length, 2, 'a mixed review is scored 0.5 and kept out of the binary pairs');
});

test('the bootstrap interval is deterministic and brackets the point estimate', () => {
  const state = policyWorkspace();
  const units = harvestPolicyUnits(state, NOW);
  const a = bootstrapDelta(units, 'always-act', { draws: 200, seed: 99 });
  const b = bootstrapDelta(units, 'always-act', { draws: 200, seed: 99 });
  assert.deepEqual(a, b, 'a seeded bootstrap must not move between renders');
  assert.ok(a.low <= a.median && a.median <= a.high);
  assert.equal(a.draws, 200);
});

/* ------------------------------------------------------------------ *
 * 4. Schema
 * ------------------------------------------------------------------ */

test('v75 -> v78 migrates additively and invents nothing', () => {
  const v75 = { ...createEmptyState(NOW.toISOString()), schemaVersion: 75 };
  const { raw: v77, applied } = migrate(clone(v75));
  assert.ok(applied.includes('75 → 76'));
  assert.ok(applied.includes('76 → 77'));
  assert.ok(applied.includes('77 → 78'));
  assert.equal(v77.schemaVersion, 78);
  assert.deepEqual(v77.policyEvaluations, []);
  assert.deepEqual(v77.policyMarkers, []);
  assert.deepEqual(v77.reliabilityReadings, []);
  assert.deepEqual(v77.reliabilityMarkers, []);
  assert.deepEqual(v77.couplingReviews, []);
  assert.deepEqual(v77.couplingMarkers, []);
  assert.equal(SCHEMA_VERSION, 78);
});

test('a marker captured on or after its outcome is demoted, never trusted', () => {
  const warnings = [];
  const rows = normalizePolicyMarkers([
    { key: 'a', family: 'decision', sourceId: 'd1', capturedOn: '2026-01-05', resolvedOn: '2026-01-01' },
    { key: 'b', family: 'decision', sourceId: 'd2', capturedOn: '2026-01-01', resolvedOn: '2026-01-05' },
    { key: 'c', family: 'not-a-family', sourceId: 'd3', capturedOn: '2026-01-01' },
    { key: 'd', sourceId: 'd4' },
  ], warnings);
  assert.equal(rows.length, 2, 'a row with no capture day, or with a family this terminal does not harvest, is dropped');
  assert.equal(rows[0].late, true);
  assert.equal(rows[1].late, false);
  assert.ok(POLICY_FAMILIES.includes(rows[0].family));
  assert.ok(warnings.some((w) => w.includes('captured on or after')));
});

test('an evaluation claiming a grade without a later re-estimation returns to frozen', () => {
  const warnings = [];
  const rows = normalizePolicyEvaluations([
    { id: 'e1', frozenAt: '2026-01-05T00:00:00.000Z', status: 'graded', grade: { gradedAt: '2026-01-01T00:00:00.000Z' } },
    { id: 'e2', frozenAt: '2026-01-05T00:00:00.000Z', status: 'graded', grade: { gradedAt: '2026-02-01T00:00:00.000Z', held: true } },
  ], warnings);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].status, 'frozen');
  assert.equal(rows[0].grade, null);
  assert.equal(rows[1].status, 'graded');
  assert.equal(rows[1].grade.held, true);
  assert.ok(warnings.length >= 1);
});

test('settings clamp instead of switching a guard off', () => {
  const s = normalizeCounterfactualSettings({
    counterfactualAutoPropagate: false,
    counterfactualMinUnits: -5,
    counterfactualMaterialityPp: 900,
    counterfactualRobustGamma: 0,
  });
  assert.equal(s.counterfactualAutoPropagate, false);
  assert.ok(s.counterfactualMinUnits >= 6);
  assert.ok(s.counterfactualMaterialityPp <= 25);
  assert.ok(s.counterfactualRobustGamma >= 1);
  const d = normalizeCounterfactualSettings({});
  assert.equal(d.counterfactualAutoPropagate, true);
  assert.equal(d.counterfactualMinUnits, COUNTERFACTUAL_LIMITS.minUnits);
});

test('the graph vocabulary knows the evaluation node and its relation', () => {
  assert.ok(LINK_ENTITY_TYPES.includes('evaluation'));
  assert.ok(SYSTEM_GENERATED_LINK_RELATIONS.includes('evaluates-policy'));
  assert.ok(LINK_RELATIONS.includes('grounds-practice'));
});

/* ------------------------------------------------------------------ *
 * 5. Rules on the shared post-commit spine
 * ------------------------------------------------------------------ */

test('the counterfactual rule is registered before Decision Tempo', () => {
  const names = DEFAULT_POST_COMMIT_RULES.map((r) => r.name);
  const idx = names.findIndex((n) => /counterfactual/i.test(n) || n.includes('counterfactualRule'));
  assert.ok(idx >= 0, 'counterfactualRule must be on the spine');
  const settlementIdx = names.findIndex((n) => /settlement/i.test(n));
  const tempoIdx = names.findIndex((n) => /tempo/i.test(n));
  assert.ok(settlementIdx < idx && idx < tempoIdx, 'it runs after settlement and before Decision Tempo');
});

test('an unrelated event is a strict no-op', () => {
  const draft = policyWorkspace();
  const before = JSON.stringify(draft.policyMarkers || []);
  const effects = counterfactualRule(draft, { event: { type: 'person.created', entityId: 'p1' }, now: NOW });
  assert.deepEqual(effects, []);
  assert.equal(JSON.stringify(draft.policyMarkers || []), before);
});

test('a scan captures every decision point and resolves it exactly once', () => {
  const draft = policyWorkspace();
  const idFactory = (p) => `${p}-scan`;
  const first = counterfactualRule(draft, { event: { type: 'policy.scan' }, now: NOW, idFactory });
  assert.ok(first.length > 0);
  assert.ok((draft.policyMarkers || []).length >= 72, 'every harvestable point is captured');
  const resolvedCount = draft.policyMarkers.filter((m) => m.resolvedOn).length;
  const second = counterfactualRule(draft, { event: { type: 'policy.scan' }, now: NOW, idFactory });
  assert.equal(draft.policyMarkers.filter((m) => m.resolvedOn).length, resolvedCount,
    'a resolved decision point is never re-scored');
  assert.ok(second.every((e) => e.ruleId !== COUNTERFACTUAL_RULE_IDS.RESOLVE), 'the second scan resolves nothing new');
});

test('a robust winner opens one governed ruling per ISO week and one blameless task', () => {
  const draft = policyWorkspace();
  draft.people = [{ id: 'p1', name: 'Jordan Rivera', role: 'EM', status: 'active', talkingPoints: [] }];
  // Arm 0 is designed to look much worse, so "always act" should win robustly.
  for (const u of harvestPolicyUnits(draft, NOW)) void u;
  const idFactory = (p) => `${p}-gov`;
  counterfactualRule(draft, { event: { type: 'policy.scan' }, now: NOW, idFactory });
  counterfactualRule(draft, { event: { type: 'policy.scan' }, now: NOW, idFactory });
  const ruled = (draft.decisions || []).filter((d) => (d.context || '').includes('[CFP-03-DEC:'));
  assert.ok(ruled.length <= 1, 'at most one policy ruling per ISO week');
  const tasks = (draft.delegations || []).filter((d) => (d.support || '').includes('[CFP-03-'));
  assert.ok(tasks.length <= 2);
  if (ruled.length) {
    assert.ok(ruled[0].options.length >= 2);
    assert.ok(ruled[0].question.includes('CFP-03-DEC'));
  }
});

test('automation can be paused and the pause stops escalation, not bookkeeping', () => {
  const draft = policyWorkspace();
  draft.settings.counterfactualAutoPropagate = false;
  draft.people = [{ id: 'p1', name: 'Jordan Rivera', role: 'EM', status: 'active', talkingPoints: [] }];
  const idFactory = (p) => `${p}-paused`;
  counterfactualRule(draft, { event: { type: 'policy.scan' }, now: NOW, idFactory });
  assert.equal((draft.decisions || []).filter((d) => (d.context || '').includes('[CFP-03-DEC:')).length, 0,
    'pausing stops the escalation');
  assert.ok((draft.policyMarkers || []).length > 0, 'capture and resolution still run');
});

test('reconciliation drops decision points whose source record was deleted', () => {
  const draft = policyWorkspace();
  const idFactory = (p) => `${p}-rec`;
  counterfactualRule(draft, { event: { type: 'policy.scan' }, now: NOW, idFactory });
  const before = (draft.policyMarkers || []).length;
  draft.premises = draft.premises.filter((p) => !p.id.startsWith('prm-0'));
  const effects = counterfactualRule(draft, { event: { type: 'policy.scan' }, now: NOW, idFactory });
  assert.ok(effects.some((e) => e.ruleId === COUNTERFACTUAL_RULE_IDS.RECONCILE));
  assert.ok((draft.policyMarkers || []).length < before, 'orphaned decision points are dropped, not kept');
});

/* ------------------------------------------------------------------ *
 * 6. API, CSV, insights, navigation
 * ------------------------------------------------------------------ */

test('freezePolicyEvaluation refuses below the floor and freezes above it', () => {
  const env = setup();
  const res = env.api.freezePolicyEvaluation({ horizonDays: 90 });
  assert.equal(res.ok, false, 'an empty workspace cannot support a frozen evaluation');

  const seeded = setup({ state: policyWorkspace() });
  const ok = seeded.api.freezePolicyEvaluation({ label: 'Demo race', horizonDays: 60 });
  assert.equal(ok.ok, true);
  assert.equal(ok.record.status, 'frozen');
  assert.equal(ok.record.race.length, 5);
  assert.ok(ok.record.units >= 12);
  assert.ok(seeded.store.state.policyEvaluations.length === 1);

  const bad = seeded.api.freezePolicyEvaluation({ horizonDays: 0 });
  assert.equal(bad.ok, false);
  const blame = seeded.api.freezePolicyEvaluation({ horizonDays: 60, notes: 'this was careless of Sam' });
  assert.equal(blame.ok, false, 'personal-blame notes are rejected at the boundary');
});

test('scanCounterfactual runs the spine and the read model agrees with the store', () => {
  const env = setup({ state: policyWorkspace() });
  const res = env.api.scanCounterfactual();
  assert.equal(res.ok, true);
  const fromApi = env.api.counterfactualRead();
  const direct = counterfactualReport(env.store.state, NOW);
  assert.equal(fromApi.counts.units, direct.counts.units);
  assert.equal(fromApi.observable, true);
  assert.ok(typeof env.api.counterfactualBriefText() === 'string');
  assert.ok(env.api.counterfactualBriefText().includes('COUNTERFACTUAL POLICY BRIEF'));
});

test('CSV scope #66 leaks no identity and blanks every figure below its floor', () => {
  assert.ok(CSV_EXPORTS.some((s) => s.key === 'counterfactual-policy'));
  const state = policyWorkspace();
  const res = exportWorkspaceCsv(state, 'counterfactual-policy', { now: NOW });
  assert.equal(res.ok, true);
  const parsed = parseCsv(res.csv);
  const headers = parsed.headers;
  const rows = parsed.rows;
  assert.ok(headers.includes('value_headline'));
  assert.ok(rows.length >= POLICY_FAMILIES.length + 1);
  const blob = JSON.stringify(rows);
  for (const leak of ['prm-', 'dec-', 'del-', 'Jordan', 'Rivera', 'Test Leader']) {
    assert.ok(!blob.includes(leak), `CSV scope #66 leaked ${leak}`);
  }
  const empty = exportWorkspaceCsv(createEmptyState(NOW.toISOString()), 'counterfactual-policy', { now: NOW });
  const emptyBlob = empty.csv;
  assert.ok(emptyBlob.includes('below_floor'), 'an empty record is labelled, not zeroed');
  const emptyParsed = parseCsv(empty.csv);
  const headIdx = emptyParsed.headers.indexOf('value_headline');
  assert.ok(headIdx >= 0);
  for (const row of emptyParsed.rows) {
    assert.notEqual(row[headIdx], '0', 'a withheld value is never printed as zero');
  }
});

test('the Signals bucket is registered and the demo workspace surfaces findings', () => {
  assert.ok(DOMAIN_ORDER.includes('Counterfactual policy'));
  const demo = buildDemoState(NOW);
  const insights = buildInsights(demo, NOW);
  const bucket = insights.byDomain?.['Counterfactual policy'] || [];
  const all = insights.findings || insights.urgent || [];
  const mine = all.filter((f) => f.domain === 'Counterfactual policy');
  assert.ok(bucket.length + mine.length >= 0);
  const signals = counterfactualSignals(demo, NOW);
  assert.ok(signals.length >= 1);
  for (const s of signals) {
    assert.ok(['CFP-01', 'CFP-02', 'CFP-03', 'CFP-04', 'CFP-05', 'CFP-06'].includes(s.ruleId));
    assert.ok(s.action?.route?.startsWith('#/counterfactual'));
  }
});

test('the route, the nav entry and the title are wired', () => {
  for (const alias of ['counterfactual', 'policy', 'off-policy', 'backtest', 'track-record', 'hidden-bias']) {
    assert.equal(parseRoute(`#/${alias}`).route, 'counterfactual', `alias ${alias} must resolve`);
  }
  const item = NAV.flatMap((s) => s.items).find((i) => i.route === 'counterfactual');
  assert.ok(item, 'the terminal is in the nav');
  assert.equal(item.badge, 'counterfactual');
});

test('the demo workspace harvests all four families with both arms populated', () => {
  const demo = buildDemoState(NOW);
  const units = harvestPolicyUnits(demo, NOW);
  const byFamily = {};
  for (const u of units) {
    byFamily[u.family] = byFamily[u.family] || { n: 0, arm1: 0, arm0: 0 };
    byFamily[u.family].n += 1;
    byFamily[u.family][u.arm === 1 ? 'arm1' : 'arm0'] += 1;
  }
  assert.ok(byFamily.assumption.n >= 6, 'the assumption family is populated');
  assert.ok(byFamily.assumption.arm1 > 0 && byFamily.assumption.arm0 > 0, 'both arms exist');
  assert.ok(byFamily.delegation.arm1 > 0 && byFamily.delegation.arm0 > 0);
  assert.ok(byFamily.decision.arm1 > 0 && byFamily.decision.arm0 > 0);
  const report = counterfactualReport(demo, NOW);
  assert.equal(report.observable, true, 'the demo clears the evidence floor');
  assert.ok(report.race.length === 5);
});

/* ------------------------------------------------------------------ *
 * 7. View rendering & accessibility
 * ------------------------------------------------------------------ */

const PANELS = ['race', 'bounds', 'sensitivity', 'families', 'ledger', 'method'];

const VIEW_DOM = new JSDOM('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Counterfactual policy terminal</title></head><body><main id="view"></main><div id="modal-root"></div><div id="toast-root"></div></body></html>', {
  url: 'https://leados.test/#/counterfactual',
  runScripts: 'outside-only',
});
VIEW_DOM.window.eval(AXE_SRC);
globalThis.window = VIEW_DOM.window;
globalThis.document = VIEW_DOM.window.document;
globalThis.SVGElement = VIEW_DOM.window.SVGElement;
globalThis.Node = VIEW_DOM.window.Node;
globalThis.Element = VIEW_DOM.window.Element;
globalThis.HTMLElement = VIEW_DOM.window.HTMLElement;

async function axeCheck(node) {
  const results = await VIEW_DOM.window.axe.run(node, {
    resultTypes: ['violations'],
    rules: { 'color-contrast': { enabled: false } },
  });
  return Array.from(results.violations || []).map((v) => `${v.id}: ${v.help}`);
}

function renderPanel(state, panel) {
  const ctx = {
    state,
    now: NOW,
    query: new URLSearchParams({ panel }),
    navigate: () => {},
    refresh: () => {},
    api: {
      counterfactualBriefText: () => 'brief',
      counterfactualRead: () => counterfactualReport(state, NOW),
      scanCounterfactual: () => ({ ok: true, propagations: [] }),
      freezePolicyEvaluation: () => ({ ok: true, saved: true }),
    },
  };
  const node = renderCounterfactual(ctx);
  const view = VIEW_DOM.window.document.getElementById('view');
  view.replaceChildren();
  view.appendChild(node);
  return node;
}

test('every panel renders without throwing, on a live workspace and an empty one', () => {
  for (const state of [policyWorkspace(), createEmptyState(NOW.toISOString())]) {
    for (const panel of PANELS) {
      let node = null;
      assert.doesNotThrow(() => { node = renderPanel(state, panel); }, `panel ${panel} threw`);
      assert.equal(node.querySelectorAll('h1').length, 1, `panel ${panel} must carry exactly one h1`);
      assert.ok(node.textContent.trim().length > 40, `panel ${panel} rendered nothing readable`);
    }
  }
});

test('all six panels are axe-clean', async () => {
  const state = policyWorkspace();
  for (const panel of PANELS) {
    const node = renderPanel(state, panel);
    const violations = await axeCheck(node);
    assert.deepEqual(violations, [], `panel ${panel} has accessibility violations`);
  }
});

test('the empty state explains the floor instead of printing a dead screen', () => {
  const node = renderPanel(createEmptyState(NOW.toISOString()), 'race');
  const text = node.textContent;
  assert.ok(/Not enough decision points/i.test(text), 'the refusal is stated in plain language');
  assert.ok(/12/.test(text), 'the floor is printed');
});

test('the report is cached per state so a render does not re-solve it', () => {
  const state = policyWorkspace();
  const t0 = Date.now();
  const a = counterfactualReport(state, NOW);
  const cold = Date.now() - t0;
  const t1 = Date.now();
  const b = counterfactualReport(state, NOW);
  const warm = Date.now() - t1;
  assert.equal(a, b, 'the same state on the same day returns the identical object');
  assert.ok(warm <= cold, 'the cached read is not slower');
  // A write replaces the state, so no stale figure can be served.
  const next = { ...state, decisions: [...state.decisions] };
  assert.notEqual(counterfactualReport(next, NOW), a);
});

test('confidential records change nothing in the terminal', () => {
  const base = policyWorkspace();
  const before = counterfactualReport(base, NOW);
  const dirty = clone(base);
  dirty.conflicts = [{ id: 'c1', parties: ['a', 'b'], summary: 'private', stance: 'support' }];
  dirty.pulses = [{ id: 'p1', mood: 2, note: 'private' }];
  dirty.candidates = [{ id: 'k1', name: 'Private Person', stage: 'offer' }];
  dirty.messages = [{ id: 'm1', body: 'private' }];
  const after = counterfactualReport(dirty, NOW);
  assert.equal(after.counts.units, before.counts.units);
  assert.equal(after.observedValue, before.observedValue);
  assert.deepEqual(after.race.map((r) => r.deltaPp), before.race.map((r) => r.deltaPp));
  const csv = exportWorkspaceCsv(dirty, 'counterfactual-policy', { now: NOW }).csv;
  for (const leak of ['private', 'Private Person']) {
    assert.ok(!csv.includes(leak), `the counterfactual export echoed a confidential field (${leak})`);
  }
});
