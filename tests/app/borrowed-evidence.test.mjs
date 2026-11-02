/**
 * tests/app/borrowed-evidence.test.mjs — Schema v71, ADR-0062, RULE-CRE-01..03.
 *
 * What this suite proves, in order:
 *   1. the special functions are exact to the digits the screen prints;
 *   2. the hierarchy behaves as a hierarchy: homogeneous units are pooled,
 *      heterogeneous ones keep their own numbers, every estimate sits between
 *      its own record and the pool, and the approximations are pinned;
 *   3. thin, degenerate and refused groups are refused, not estimated;
 *   4. the three adapters read the ledgers exactly as documented, including
 *      censoring for delegations not yet due;
 *   5. Schema v71 is additive and every collection is fail-closed;
 *   6. the three rules fire through the real store, inside the transaction,
 *      marker-idempotent, never on a refused group and never scoring a person;
 *   7. the read model, signals, insights bucket and CSV scope are wired;
 *   8. the terminal renders seven axe-clean panels and the demo freezes before
 *      it grades.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  SCHEMA_VERSION,
  MIGRATIONS,
  createEmptyState,
  normalizeState,
  normalizeSettings,
  migrate,
} from '../../app/core/schema.js';
import { buildDemoState } from '../../app/core/demo.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { buildInsights, DOMAIN_ORDER } from '../../app/core/domain/insights.js';
import { SIGNAL_FAMILIES } from '../../app/core/domain/integrityRegistry.js';
import { signalInstanceKey } from '../../app/core/domain/integrity.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { LINK_ENTITY_TYPES, LINK_RELATIONS, resolveLinkedEntity } from '../../app/core/domain/cases.js';
import {
  CREDIBILITY_GROUPS,
  CREDIBILITY_RULE_IDS,
} from '../../app/core/domain/credibilityRegistry.js';
import {
  normalizeCredibilityDeclarations,
  normalizeCredibilityFrames,
  normalizeCredibilityMarkers,
} from '../../app/core/domain/credibilitySchema.js';
import {
  BETA_EDGEWORTH_SWITCH,
  betaCdf,
  betaCdfExact,
  betaQuantile,
  breakEven,
  chiSquareSurvival,
  credibilityBrief,
  credibilityReport,
  credibilitySignals,
  credibilityCovariatePreview,
  evidenceUnits,
  exactUnitQuantile,
  fitHierarchy,
  fitCovariateHierarchy,
  gammaQ,
  gradeCredibilityFrame,
  heterogeneity,
  hyperSummary,
  lnBeta,
  lnGamma,
  unitPosterior,
  whatIf,
} from '../../app/core/domain/credibility.js';
import { parseRoute } from '../../app/main.js';
import { renderCredibility } from '../../app/views/credibility.js';
import { renderIntegrity } from '../../app/views/integrity.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const NOW_ISO = '2026-10-31T10:00:00.000Z';
const NOW = new Date(NOW_ISO);
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

function storage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    keys: () => [...map.keys()],
  };
}

function harness(initial, now = () => NOW) {
  let seq = 0;
  const store = createStore({ storage: storage(), now, idFactory: (p) => `${p}-s-${++seq}` });
  store.load();
  const api = createApi(store, { now, idFactory: (p) => `${p}-a-${++seq}` });
  if (initial) assert.equal(store.importJSON(JSON.stringify(initial), { now: now() }).ok, true);
  return { store, api };
}

const day = (offset) => new Date(NOW.getTime() + offset * 86400000).toISOString().slice(0, 10);

/** Decisive verdicts for one family, one per day going back from `start` days ago. */
function verdicts(domain, confirmed, falseAlarms, start = 60) {
  const rows = [];
  let k = 0;
  const push = (verdict) => {
    const d = day(-(start - k * 2));
    rows.push({
      id: `sv-${domain}-${k}`,
      instanceKey: signalInstanceKey({ ruleId: `${domain}-R`, day: d, title: `${domain} ${k}`, personId: 'x' }),
      domain, ruleId: `${domain}-R`, verdict, day: d, recordedAt: `${d}T09:00:00.000Z`,
      severityAtVerdict: 3, note: '', source: 'board',
    });
    k += 1;
  };
  for (let i = 0; i < confirmed; i += 1) push('confirmed');
  for (let i = 0; i < falseAlarms; i += 1) push('false-alarm');
  return rows;
}

function baseState() {
  const s = createEmptyState(NOW_ISO);
  s.meta.isDemo = false;
  s.settings = { ...s.settings, leaderName: 'Rae Mensah' };
  s.people = [
    { id: 'p-leader', name: 'Rae Mensah', role: 'EM', status: 'active', startDate: '2024-01-01', managerId: null, talkingPoints: [] },
    { id: 'p-2', name: 'Ola Berg', role: 'Engineer', status: 'active', startDate: '2024-01-01', managerId: 'p-leader', talkingPoints: [] },
  ];
  return s;
}

function premiseFixture(s) {
  const premise = (id, criticality) => ({
    id, title: `Premise ${id}`, statement: 'A falsifiable statement here', signpost: 'A dated record that would warn',
    criticality, priorPct: 70, watchPct: 50, breachPct: 30, halfLifeDays: 90, reviewBy: '2026-12-01',
    createdAt: '2026-06-01T09:00:00.000Z', observations: [], history: [], sourceRefs: [],
  });
  s.premises = [];
  s.premiseOutcomes = [];
  const add = (criticality, held, failed) => {
    for (let i = 0; i < held + failed; i += 1) {
      const id = `prem-${criticality}-${i}`;
      s.premises.push(premise(id, criticality));
      s.premiseOutcomes.push({ id: `out-${id}`, premiseId: id, verdict: i < held ? 'held' : 'failed', settledOn: day(-(80 - i * 3)), note: '', createdAt: NOW_ISO });
    }
  };
  add('load-bearing', 2, 6);
  add('major', 5, 3);
  add('monitor', 6, 1);
  s.decisions = [{
    id: 'dec-vendor', title: 'Choose the integration vendor', question: 'Which vendor?', date: day(-11), reversibility: 'reversible',
    driver: 'Rae Mensah', approver: 'Rae Mensah', contributors: '', informed: '', options: [], chosen: '', rationale: '',
    reviewOn: day(20), reviewedOn: null, outcome: 'pending', outcomeNotes: '', forecastProbability: null, decidedOn: null,
    createdAt: `${day(-11)}T09:00:00.000Z`,
  }];
  return s;
}

function delegationFixture(s) {
  const del = (id, authority, status, delegatedOn, dueOn, completedOn = null, returnedOn = null) => ({
    id, personId: 'p-2', title: `Delegation ${id}`, expectedOutcome: 'Outcome text', authority, support: '',
    delegatedOn, dueOn, status, checkins: [], completedOn, completionNote: '', returnedOn,
    returnReason: returnedOn ? 'scope' : '', createdAt: `${delegatedOn}T09:00:00.000Z`, updatedAt: NOW_ISO,
  });
  s.delegations = [
    del('d1', 'act-inform', 'done', day(-90), day(-76), day(-71)),
    del('d2', 'act-inform', 'done', day(-88), day(-74), day(-66)),
    del('d3', 'act-inform', 'done', day(-81), day(-67), day(-58)),
    del('d4', 'act-inform', 'done', day(-60), day(-47), day(-41)),
    del('d5', 'act-inform', 'done', day(-56), day(-42), day(-43)),
    del('d5b', 'act-inform', 'done', day(-53), day(-39), day(-31)),
    del('d6', 'own', 'done', day(-90), day(-61), day(-63)),
    del('d7', 'own', 'done', day(-60), day(-31), day(-36)),
    del('d8', 'own', 'done', day(-51), day(-21), day(-22)),
    del('d9', 'recommend', 'done', day(-90), day(-71), day(-72)),
    del('d10', 'recommend', 'returned', day(-60), day(-41), null, day(-43)),
    del('d11', 'agree', 'done', day(-60), day(-46), day(-47)),
    del('d12', 'act-inform', 'active', day(-6), day(6)),
    del('d13', 'act-inform', 'active', day(-5), day(12)),
  ];
  return s;
}

const credibilityEffects = (result) => (result.propagations || []).filter((p) => String(p.ruleId).startsWith('RULE-CRE'));

/* ---------------------------------------------------------------- numerics */

describe('the special functions are exact to the printed digits', () => {
  test('ln Γ, the incomplete beta and its quantile', () => {
    assert.ok(Math.abs(lnGamma(5) - Math.log(24)) < 1e-12);
    assert.ok(Math.abs(lnGamma(0.5) - Math.log(Math.sqrt(Math.PI))) < 1e-12);
    assert.ok(Math.abs(lnGamma(171) - 706.5730622457874) < 1e-7, 'ln Γ(171) = ln 170!');
    assert.ok(Math.abs(lnBeta(2, 3) - Math.log(1 / 12)) < 1e-12);
    assert.ok(Math.abs(betaCdf(0.5, 2, 2) - 0.5) < 1e-12);
    // I_0.3(2,5) has the closed form 1 − Σ_{j<2} C(6,j) 0.3^j 0.7^(6−j).
    const closed = 1 - (0.7 ** 6 + 6 * 0.3 * 0.7 ** 5);
    assert.ok(Math.abs(betaCdf(0.3, 2, 5) - closed) < 1e-12);
    assert.ok(Math.abs(betaCdf(0.02, 0.4, 0.7) - (1 - betaCdf(0.98, 0.7, 0.4))) < 1e-12, 'reflection symmetry');
    assert.ok(Math.abs(betaQuantile(betaCdf(0.37, 4.2, 7.9), 4.2, 7.9) - 0.37) < 1e-9, 'the quantile inverts the CDF');
  });

  test('χ² survival and the upper incomplete gamma', () => {
    assert.ok(Math.abs(chiSquareSurvival(3.841459, 1) - 0.05) < 1e-6);
    assert.ok(Math.abs(chiSquareSurvival(7.814728, 3) - 0.05) < 1e-6);
    assert.ok(Math.abs(chiSquareSurvival(30.143527, 19) - 0.05) < 1e-6);
    assert.ok(Math.abs(gammaQ(1, 2.5) - Math.exp(-2.5)) < 1e-12, 'Q(1, x) = e^−x');
    assert.equal(chiSquareSurvival(0, 3), 1);
  });

  test('the Edgeworth branch for concentrated Betas agrees with the continued fraction', () => {
    let worst = 0;
    for (const S of [BETA_EDGEWORTH_SWITCH + 1, 20000, 1e6]) {
      for (const mu of [0.05, 0.3, 0.5, 0.9]) {
        const a = mu * S;
        const b = (1 - mu) * S;
        const sd = Math.sqrt((a * b) / (S * S * (S + 1)));
        for (const k of [-2.5, -1, 0, 1, 2.5]) {
          worst = Math.max(worst, Math.abs(betaCdf(mu + k * sd, a, b) - betaCdfExact(mu + k * sd, a, b)));
        }
      }
    }
    assert.ok(worst < 1e-3, `worst error ${worst}`);
  });
});

/* -------------------------------------------------------------- the model */

describe('the hierarchy behaves as a hierarchy', () => {
  const balanced = [{ x: 3, n: 5 }, { x: 2, n: 9 }, { x: 6, n: 6 }, { x: 1, n: 2 }];

  test('the declared authority covariate yields a deterministic, uncertainty-bearing regression preview', () => {
    const units = [
      { id: 'recommend', x: 3, n: 12, covariate: -1 },
      { id: 'agree', x: 5, n: 12, covariate: -1 / 3 },
      { id: 'act-inform', x: 8, n: 12, covariate: 1 / 3 },
      { id: 'own', x: 10, n: 12, covariate: 1 },
    ];
    const fit = fitCovariateHierarchy(units);
    const again = fitCovariateHierarchy(units);
    assert.equal(fit.model, 'beta-binomial-logit-v1');
    assert.deepEqual(fit.units.map((u) => u.mean), again.units.map((u) => u.mean));
    assert.ok(fit.slopeLo < fit.slopeHi);
    assert.ok(fit.probabilityPositive > 0.5, `P(positive slope) ${fit.probabilityPositive}`);
    assert.ok(fit.units[0].mean < fit.units.at(-1).mean, 'posterior prediction follows authority evidence');
    assert.ok(fit.units.every((u) => u.lo < u.mean && u.mean < u.hi));
    assert.equal(fitCovariateHierarchy(units.slice(0, 2)), null, 'refuses fewer than three units');
    assert.equal(fitCovariateHierarchy(units.map((u) => ({ ...u, covariate: 0 }))), null, 'refuses no covariate variation');
  });

  test('homogeneous units are pooled and heterogeneous ones keep their own numbers', () => {
    const hom = fitHierarchy([{ x: 6, n: 10 }, { x: 7, n: 10 }, { x: 5, n: 10 }, { x: 6, n: 10 }, { x: 7, n: 12 }]);
    const homZ = hom.units.map((_, i) => unitPosterior(hom, i).z);
    assert.ok(homZ.every((z) => z < 0.4), `homogeneous Z ${homZ}`);
    const het = fitHierarchy([{ x: 1, n: 20 }, { x: 19, n: 20 }, { x: 10, n: 20 }, { x: 3, n: 20 }]);
    het.units.forEach((u, i) => {
      const post = unitPosterior(het, i);
      assert.ok(post.z > 0.85, 'heterogeneous units keep most of their own number');
      assert.ok(Math.abs(post.mean - (u.x + 0.5) / (u.n + 1)) < 0.04);
    });
    assert.ok(hyperSummary(het).strengthMedian < hyperSummary(hom).strengthMedian);
  });

  test('every borrowed estimate lies between its own record and the pooled rate, in order', () => {
    const fit = fitHierarchy(balanced);
    const pooled = fit.meanMu;
    fit.units.forEach((u, i) => {
      // The hierarchy shrinks the RAW rate x/n toward the pool.
      const own = u.x / u.n;
      const { mean } = unitPosterior(fit, i);
      assert.ok(mean >= Math.min(own, pooled) - 1e-9 && mean <= Math.max(own, pooled) + 1e-9, `unit ${i}`);
    });
    const ordered = fitHierarchy([{ x: 1, n: 6 }, { x: 3, n: 6 }, { x: 5, n: 6 }]);
    const means = ordered.units.map((_, i) => unitPosterior(ordered, i).mean);
    assert.ok(means[0] < means[1] && means[1] < means[2], 'shrinkage never reorders equal-sized units');
  });

  test('the moment-matched interval stays within 1.5 points of the exact mixture quantiles', () => {
    const fit = fitHierarchy(balanced);
    fit.units.forEach((_, i) => {
      const post = unitPosterior(fit, i);
      assert.ok(Math.abs(post.lo - exactUnitQuantile(fit, i, 0.05)) < 0.015, `lo ${i}`);
      assert.ok(Math.abs(post.hi - exactUnitQuantile(fit, i, 0.95)) < 0.015, `hi ${i}`);
    });
  });

  test('fits are deterministic and memoised; a null what-if reproduces the posterior', () => {
    const a = fitHierarchy(balanced);
    const b = fitHierarchy(balanced.map((u) => ({ ...u })));
    assert.equal(a, b, 'the same counts return the memoised fit');
    const post = unitPosterior(a, 1, 0.6);
    const same = whatIf(a, 1, 0, 0, 0.6);
    assert.ok(Math.abs(post.mean - same.mean) < 1e-9);
    assert.ok(Math.abs(post.pBelow - same.pBelow) < 1e-9);
  });

  test('break-even counts are exact: the verdict flips at the count and not before', () => {
    const fit = fitHierarchy(balanced);
    const result = breakEven(fit, 0, 0.6, 0.95);
    assert.ok(Number.isInteger(result.failuresToBelow) && result.failuresToBelow > 0);
    assert.ok(whatIf(fit, 0, 0, result.failuresToBelow, 0.6).pBelow >= 0.95);
    assert.ok(whatIf(fit, 0, 0, result.failuresToBelow - 1, 0.6).pBelow < 0.95);
  });

  test('heterogeneity: χ², I² and the sparse-cell flag', () => {
    const het = heterogeneity([{ x: 3, n: 5 }, { x: 2, n: 9 }, { x: 6, n: 6 }, { x: 1, n: 2 }]);
    assert.equal(het.df, 3);
    assert.ok(Math.abs(het.x2 - 8.869) < 0.01);
    assert.ok(het.pValue > 0.02 && het.pValue < 0.04);
    assert.ok(Math.abs(het.i2Pct - 66.2) < 0.2);
    assert.equal(het.approximate, true, 'expected counts under five are flagged');
    assert.equal(heterogeneity([{ x: 0, n: 3 }, { x: 0, n: 4 }]).x2, null, 'no test when the pooled rate is 0');
  });
});

/* -------------------------------------------------------------- refusals */

describe('thin, degenerate and refused groups are refused, not estimated', () => {
  test('too few units, too few outcomes and the all-or-nothing pattern', () => {
    const s = baseState();
    s.signalVerdicts = [...verdicts('Goals', 2, 2), ...verdicts('Feedback', 3, 0)];
    let report = credibilityReport(normalizeState(s, { now: NOW }).state, NOW);
    let g = report.groups.find((row) => row.id === 'detectors');
    assert.equal(g.regime, 'no-units');
    assert.equal(g.borrowing, false);
    assert.match(g.missing, /1 more family/);
    assert.ok(g.units.every((u) => u.borrowedPct === null));

    s.signalVerdicts = [...verdicts('Goals', 1, 1), ...verdicts('Feedback', 2, 0), ...verdicts('Conversations', 1, 1)];
    g = credibilityReport(normalizeState(s, { now: NOW }).state, NOW).groups.find((row) => row.id === 'detectors');
    assert.equal(g.regime, 'too-thin');
    assert.match(g.missing, /2 more decisive outcome/);

    s.signalVerdicts = [...verdicts('Goals', 0, 4), ...verdicts('Feedback', 3, 0), ...verdicts('Conversations', 0, 3)];
    g = credibilityReport(normalizeState(s, { now: NOW }).state, NOW).groups.find((row) => row.id === 'detectors');
    assert.equal(g.regime, 'degenerate');
    assert.equal(g.borrowing, false);
  });

  test('a refused group is fitted for the regime but prints and acts on nothing borrowed', () => {
    const s = premiseFixture(baseState());
    s.credibilityDeclarations = [{ id: 'cd-1', groupId: 'premises', allowed: false, reason: 'Classes are not alike here', declaredAt: NOW_ISO }];
    const report = credibilityReport(normalizeState(s, { now: NOW }).state, NOW);
    const g = report.groups.find((row) => row.id === 'premises');
    assert.equal(g.refused, true);
    assert.equal(g.borrowing, false);
    assert.ok(['pool-led', 'balanced', 'own-led'].includes(g.regime));
    assert.ok(g.units.every((u) => u.borrowedPct === null && u.borrowedVerdict === null));
    assert.equal(g.pooled, null);
    assert.ok(g.outsideView.every((row) => row.flagged === false && row.pBelowPriorPct === null));
  });
});

/* -------------------------------------------------------------- adapters */

describe('the adapters read the ledgers exactly as documented', () => {
  test('signal families count only the two decisive verdicts, alerts included', () => {
    const s = baseState();
    s.signalVerdicts = [
      ...verdicts('Goals', 2, 1),
      { ...verdicts('Goals', 1, 0, 20)[0], id: 'sv-exp', instanceKey: 'k-exp', verdict: 'explained' },
      { ...verdicts('Goals', 1, 0, 18)[0], id: 'sv-dis', instanceKey: 'k-dis', verdict: 'dismissed' },
    ];
    s.watchAlerts = [
      { id: 'al-1', seriesId: 'open-cases', detectedOn: day(-9), detectedAt: `${day(-9)}T09:00:00.000Z`, status: 'confirmed', rule: 'beyond-limit', polarity: 'adverse', severity: 3, pValue: 0.01, bhRank: 1, bhThreshold: 0.05, m: 12, q: 0.1, latestValue: 5, mean: 3, unpl: 6, lnpl: 0, sigma: 1, summary: 'moved', frozen: null, triagedOn: day(-8), verdictNote: '', linkedCaseId: null, linkedDecisionId: null, suppressedReason: null },
    ];
    const state = normalizeState(s, { now: NOW }).state;
    const units = evidenceUnits('detectors', state, day(0));
    const goals = units.find((u) => u.id === 'Goals');
    assert.equal(goals.obs.length, 3, 'explained and dismissed are excluded from the denominator');
    assert.equal(goals.obs.filter((o) => o.success).length, 2);
    const ew = units.find((u) => u.id === 'Early warning');
    assert.equal(ew.obs.length, 1);
    assert.deepEqual(ew.refs, [{ type: 'alert', id: 'al-1' }]);
  });

  test('assumption classes exclude inconclusive outcomes', () => {
    const s = premiseFixture(baseState());
    s.premiseOutcomes.push({ id: 'out-inc', premiseId: 'prem-major-0', verdict: 'inconclusive', settledOn: day(-5), note: '', createdAt: NOW_ISO });
    const units = evidenceUnits('premises', normalizeState(s, { now: NOW }).state, day(0));
    assert.deepEqual(units.map((u) => [u.id, u.obs.length, u.obs.filter((o) => o.success).length]),
      [['load-bearing', 8, 2], ['major', 8, 5], ['monitor', 7, 6]]);
  });

  test('delegations: late, returned and overdue count against; not yet due is censored', () => {
    const s = delegationFixture(baseState());
    s.delegations.push({ ...s.delegations[0], id: 'd-over', status: 'active', dueOn: day(-3), completedOn: null, authority: 'agree' });
    s.delegations.push({ ...s.delegations[0], id: 'd-noauth', authority: 'nonsense', dueOn: day(-70), completedOn: day(-72) });
    const units = evidenceUnits('delegation', normalizeState(s, { now: NOW }).state, day(0));
    const by = Object.fromEntries(units.map((u) => [u.id, [u.obs.length, u.obs.filter((o) => o.success).length]]));
    assert.deepEqual(by['act-inform'], [6, 1], 'two active act-inform delegations not yet due are censored');
    assert.deepEqual(by.recommend, [2, 1], 'returned work counts as not delivered');
    assert.deepEqual(by.agree, [2, 1], 'an overdue open delegation is already late');
    assert.ok(by.unspecified[0] >= 1, 'an unknown authority is filed as unspecified, not dropped');
  });
});

/* -------------------------------------------------------------- schema */

describe('Schema v71 is additive and fail-closed', () => {
  test('the 70 → 72 chain adds three empty ledgers and invents nothing', () => {
    assert.equal(SCHEMA_VERSION, 79);
    assert.equal(typeof MIGRATIONS[70], 'function');
    assert.equal(typeof MIGRATIONS[71], 'function');
    const raw = migrate({ schemaVersion: 70, settings: {}, people: [] });
    assert.deepEqual(raw.applied, ['70 → 71', '71 → 72', '72 → 73', '73 → 74', '74 → 75', '75 → 76', '76 → 77', '77 → 78', '78 → 79']);
    assert.deepEqual(raw.raw.confidenceCertificates, [], 'v72 invents no certificate on upgrade');
    assert.deepEqual(raw.raw.confidenceMarkers, []);
    assert.deepEqual(raw.raw.credibilityFrames, []);
    assert.deepEqual(raw.raw.credibilityDeclarations, []);
    assert.deepEqual(raw.raw.credibilityMarkers, []);
    const state = normalizeState({ schemaVersion: 70 }, { now: NOW }).state;
    assert.equal(state.schemaVersion, 79);
    assert.equal(state.settings.credibilityDecisivePct, 95);
  });

  test('frames: unreadable records are dropped, a grade without an outcome returns to frozen', () => {
    const warnings = [];
    const good = { id: 'f1', groupId: 'detectors', unitId: 'Goals', frozenAt: NOW_ISO, reviewOn: day(28), borrowedPct: 31, rawPct: 25, horizonN: 8 };
    const rows = normalizeCredibilityFrames([
      good,
      { ...good, id: 'f2', groupId: 'people' },
      { ...good, id: 'f3', borrowedPct: 140 },
      { ...good, id: 'f4', reviewOn: day(-3) },
      { ...good, id: 'f5', graded: { gradedAt: `${day(30)}T00:00:00.000Z`, observed: 3, successes: 1, brierBorrowed: 0.2 } },
      { ...good, id: 'f6', lapsedOn: day(40) },
      { ...good, id: 'f7', lapsedOn: day(10) },
      { ...good, id: 'f1' },
    ], warnings);
    assert.deepEqual(rows.map((r) => r.id).sort(), ['f1', 'f5', 'f6', 'f7']);
    assert.equal(rows.find((r) => r.id === 'f5').graded, null);
    assert.ok(warnings.some((w) => /returned to frozen/.test(w)));
    assert.equal(rows.find((r) => r.id === 'f6').lapsedOn, day(40));
    assert.equal(rows.find((r) => r.id === 'f7').lapsedOn, null, 'a lapse cannot predate the review day');
  });

  test('declarations keep one ruling per group, latest wins; markers dedupe', () => {
    const rows = normalizeCredibilityDeclarations([
      { groupId: 'premises', allowed: true, reason: 'first', declaredAt: '2026-10-01T00:00:00.000Z' },
      { groupId: 'premises', allowed: false, reason: 'second', declaredAt: '2026-10-20T00:00:00.000Z' },
      { groupId: 'nonsense', allowed: true, declaredAt: NOW_ISO },
      { groupId: 'delegation', allowed: 'yes', declaredAt: NOW_ISO },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].allowed, false);
    assert.deepEqual(normalizeCredibilityMarkers(['a', 'a', '', 7, 'b']), ['a', 'b']);
  });

  test('settings are clamped into their declared bands', () => {
    const s = normalizeSettings({ credibilityDecisivePct: 30, credibilityMinUnits: 99, credibilitySurpriseBrier: 'x', credibilityAutoPropagate: false });
    assert.equal(s.credibilityDecisivePct, 80);
    assert.equal(s.credibilityMinUnits, 12);
    assert.equal(s.credibilitySurpriseBrier, 0.25);
    assert.equal(s.credibilityAutoPropagate, false);
  });
});

/* ----------------------------------------------------------------- rules */

describe('RULE-CRE-01..03 on the shared post-commit spine', () => {
  test('registration: after the integrity rule, before Decision Tempo, with a published contract', () => {
    const names = DEFAULT_POST_COMMIT_RULES.map((r) => r.name);
    const at = names.indexOf('credibilityRule');
    assert.ok(at > names.indexOf('integrityRule'));
    assert.ok(at < names.indexOf('decisionTempoRule'));
    const contract = PROPAGATION_CONTRACTS.find((c) => c.module === 'credibilityRules.js');
    assert.ok(contract);
    assert.deepEqual(contract.writes.slice().sort(), ['credibilityFrames', 'credibilityMarkers', 'decisions', 'delegations', 'links']);
    assert.ok(LINK_ENTITY_TYPES.includes('credibilityframe'));
    for (const rel of ['borrows-evidence', 'outside-view', 'governs-pooling']) assert.ok(LINK_RELATIONS.includes(rel));
  });

  test('registering an over-confident premise opens ONE outside-view decision, linked and frozen', () => {
    const { store, api } = harness(normalizeState(premiseFixture(baseState()), { now: NOW }).state);
    const before = store.state.decisions.length;
    const first = api.addPremise({
      title: 'Vendor ships on time', statement: 'The vendor will ship the integration by the date',
      signpost: 'A missed vendor milestone dated in the tracker', criticality: 'load-bearing', priorPct: 90, decisionId: 'dec-vendor',
    });
    assert.equal(first.ok, true);
    const effects = credibilityEffects(first);
    assert.ok(effects.some((e) => e.ruleId === CREDIBILITY_RULE_IDS.GRADUATE && e.action === 'created' && e.targetType === 'decision'));
    assert.equal(store.state.decisions.length, before + 1);
    const decision = store.state.decisions.find((d) => String(d.rationale).startsWith('Opened by RULE-CRE-01'));
    assert.match(decision.title, /Re-price 1 open load-bearing/);
    assert.equal(decision.options.length, 4);
    const outside = store.state.links.filter((l) => l.relation === 'outside-view');
    assert.deepEqual(outside.map((l) => [l.sourceId, l.targetId]), [[decision.id, first.id]]);
    const frame = store.state.credibilityFrames.find((f) => f.groupId === 'premises' && f.unitId === 'load-bearing');
    assert.ok(frame, 'the class rate the decision rests on is frozen');
    assert.ok(store.state.links.some((l) => l.sourceType === 'credibilityframe' && l.sourceId === frame.id && l.relation === 'borrows-evidence'));
    assert.ok(store.state.links.some((l) => l.sourceId === frame.id && l.targetId === decision.id && l.relation === 'governs-pooling'));
    assert.ok(resolveLinkedEntity(store.state, 'credibilityframe', frame.id).route.includes(`frame=${frame.id}`));

    const second = api.addPremise({
      title: 'Budget approved', statement: 'Finance approves the budget this quarter',
      signpost: 'A dated finance rejection email', criticality: 'load-bearing', priorPct: 92, decisionId: 'dec-vendor',
    });
    assert.equal(store.state.decisions.length, before + 1, 'one decision per class per week');
    assert.ok(store.state.links.some((l) => l.relation === 'outside-view' && l.sourceId === decision.id && l.targetId === second.id),
      'a premise flagged later in the week is attached to the open decision');
    const modest = api.addPremise({
      title: 'Monitor holds', statement: 'The monitor premise holds as usual',
      signpost: 'A dated record that would show it', criticality: 'monitor', priorPct: 60, decisionId: 'dec-vendor',
    });
    assert.equal(credibilityEffects(modest).filter((e) => e.action === 'created').length, 0, 'a prior inside its class opens nothing');
  });

  test('a late-running authority class opens ONE checkpoint task linked to the work falling due', () => {
    const { store, api } = harness(normalizeState(delegationFixture(baseState()), { now: NOW }).state);
    const scan = api.scanCredibility();
    assert.equal(scan.ok, true);
    const task = store.state.delegations.find((d) => String(d.support).includes('[RULE-CRE-01:delegation:act-inform'));
    assert.ok(task, 'checkpoint task opened');
    assert.equal(task.personId, 'p-leader', 'the task is the leader’s, not the delegate’s');
    assert.match(task.title, /checkpoint on 2/);
    const covered = store.state.links.filter((l) => l.sourceId === task.id && l.relation === 'tracks-followup').map((l) => l.targetId).sort();
    assert.deepEqual(covered, ['d12', 'd13']);
    assert.ok(store.state.credibilityFrames.some((f) => f.groupId === 'delegation' && f.unitId === 'act-inform'));
    const again = api.scanCredibility();
    assert.equal(again.changed, false, 'marker-idempotent within the ISO week');
  });

  test('a thin signal family below the floor on borrowed evidence alone opens one re-tune task', () => {
    const s = baseState();
    s.signalVerdicts = [
      ...verdicts('Goals', 2, 8, 80), ...verdicts('Conversations', 3, 7, 79), ...verdicts('Feedback', 4, 6, 78),
      ...verdicts('Delegation', 2, 6, 77), ...verdicts('Hiring', 0, 2, 20),
      ...verdicts('Signal integrity', 0, 3, 19),
    ];
    const { store, api } = harness(normalizeState(s, { now: NOW }).state);
    const g = api.credibilityRead().groups.find((row) => row.id === 'detectors');
    const hiring = g.units.find((u) => u.id === 'Hiring');
    assert.equal(hiring.ownVerdict, 'insufficient');
    assert.equal(hiring.borrowedVerdict, 'below');
    assert.equal(hiring.rescued, true);
    const result = api.recordSignalVerdict({ domain: 'Hiring', ruleId: 'HIR-01', title: 'Requisition aged', verdict: 'false-alarm' });
    assert.equal(result.ok, true);
    // Every family whose own record cannot decide but whose borrowed verdict
    // is decisively below gets one task — except the auditors' own families.
    const after = api.credibilityRead().groups.find((row) => row.id === 'detectors');
    const expected = after.units.filter((u) => u.rescued && u.borrowedVerdict === 'below'
      && u.id !== 'Signal integrity' && u.id !== 'Credibility').map((u) => u.id).sort();
    const tasks = store.state.delegations.filter((d) => String(d.support).includes('[RULE-CRE-01:detectors:'));
    const families = tasks.map((t) => t.title.match(/“(.+)”/)[1]).sort();
    assert.deepEqual(families, expected);
    assert.ok(families.includes('Hiring'));
    assert.equal(families.includes('Signal integrity'), false, 'the auditor’s own family is never re-tuned by its own rule');
    assert.ok(after.units.find((u) => u.id === 'Signal integrity').rescued, 'it is still pooled and still rescued — just not acted on');
    for (const family of families) assert.ok(store.state.credibilityFrames.some((f) => f.unitId === family), `${family} is frozen`);
    const again = api.recordSignalVerdict({ domain: 'Hiring', ruleId: 'HIR-02', title: 'Another', verdict: 'false-alarm' });
    assert.equal(credibilityEffects(again).filter((e) => e.action === 'created').length, 0, 'one task per family per week');
  });

  test('a heterogeneous pool opens one exchangeability decision, and a ruling silences it', () => {
    const s = baseState();
    s.signalVerdicts = [...verdicts('Feedback', 12, 0, 80), ...verdicts('Goals', 1, 11, 79), ...verdicts('Conversations', 6, 6, 78)];
    const { store, api } = harness(normalizeState(s, { now: NOW }).state);
    const report = api.credibilityRead();
    assert.equal(report.groups.find((g) => g.id === 'detectors').heterogeneity.flagged, true);
    api.scanCredibility();
    const governed = store.state.decisions.filter((d) => String(d.rationale).startsWith('Opened by RULE-CRE-02'));
    assert.equal(governed.length, 1);
    assert.equal(governed[0].options.length, 3);
    api.scanCredibility();
    assert.equal(store.state.decisions.filter((d) => String(d.rationale).startsWith('Opened by RULE-CRE-02')).length, 1);
    const refused = api.declareCredibility({ groupId: 'detectors', allowed: true, reason: 'short' });
    assert.equal(refused.ok, false, 'a ruling needs a written reason');
    assert.equal(api.declareCredibility({ groupId: 'detectors', allowed: true, reason: 'These families share one triage process' }).ok, true);
    assert.equal(credibilitySignals(store.state, NOW).some((sig) => sig.ruleId === 'CRE-03'), false, 'the ruling silences the signal');
  });

  test('automatic propagation off: evidence events do nothing, an explicit scan still acts', () => {
    const s = premiseFixture(baseState());
    s.settings.credibilityAutoPropagate = false;
    const { store, api } = harness(normalizeState(s, { now: NOW }).state);
    const result = api.addPremise({
      title: 'Vendor ships on time', statement: 'The vendor will ship the integration by the date',
      signpost: 'A missed vendor milestone dated in the tracker', criticality: 'load-bearing', priorPct: 90, decisionId: 'dec-vendor',
    });
    assert.equal(credibilityEffects(result).length, 0);
    api.scanCredibility();
    assert.ok(store.state.links.some((l) => l.relation === 'outside-view'));
  });

  test('grading: both forecasters scored, empty windows lapse, losses open governed work, dead edges go', () => {
    const s = baseState();
    s.signalVerdicts = [...verdicts('Goals', 0, 6, 40), ...verdicts('Feedback', 6, 0, 39), ...verdicts('Conversations', 3, 3, 38)];
    const frame = (id, unitId, borrowedPct, rawPct, frozenAgo, reviewAgo) => ({
      id, groupId: 'detectors', unitId, label: `Frame ${id}`, frozenAt: `${day(-frozenAgo)}T08:00:00.000Z`, reviewOn: day(-reviewAgo),
      borrowedPct, rawPct, nAtFreeze: 3, zAtFreeze: 50, credibleLoPct: 10, credibleHiPct: 90, horizonN: 8, regime: 'balanced',
      pooledMeanPct: 50, priorStrength: 3, evidenceRefs: [], graded: null, lapsedOn: null, notes: [],
    });
    // Six frames on Goals (all false alarms followed) where borrowing said ~60% and own data ~10%.
    s.credibilityFrames = [
      ...[0, 1, 2, 3, 4, 5].map((k) => frame(`fg-${k}`, 'Goals', 60, 10, 45 + k, 1)),
      frame('f-empty', 'Hiring', 50, 40, 90, 40),
      frame('f-wait', 'Hiring', 50, 40, 20, 3),
    ];
    s.links = [{ id: 'lnk-dead', sourceType: 'credibilityframe', sourceId: 'gone', targetType: 'decision', targetId: 'x', relation: 'governs-pooling', ruleId: 'X', createdAt: NOW_ISO }];
    const { store, api } = harness(normalizeState(s, { now: NOW }).state);
    const grade = gradeCredibilityFrame(store.state.credibilityFrames.find((f) => f.id === 'fg-0'), store.state, NOW);
    assert.equal(grade.observed, 6);
    assert.equal(grade.successes, 0);
    assert.ok(Math.abs(grade.brierBorrowed - 0.36) < 1e-9 && Math.abs(grade.brierRaw - 0.01) < 1e-9);
    api.scanCredibility();
    const frames = Object.fromEntries(store.state.credibilityFrames.map((f) => [f.id, f]));
    assert.ok([0, 1, 2, 3, 4, 5].every((k) => frames[`fg-${k}`].graded));
    assert.equal(frames['f-empty'].lapsedOn, day(0), 'an empty window older than a review period lapses');
    assert.equal(frames['f-wait'].graded, null);
    assert.equal(frames['f-wait'].lapsedOn, null, 'a recent empty window is withheld, not lapsed');
    assert.ok(store.state.delegations.some((d) => String(d.support).includes('[RULE-CRE-03:task:fg-0]')), 'a borrowed miss own data avoided opens process work');
    assert.ok(store.state.decisions.some((d) => /Borrowing has lost to own data/.test(d.title)), 'six losing frames open the skill decision');
    assert.equal(store.state.links.some((l) => l.id === 'lnk-dead'), false, 'edges to deleted frames are reconciled');
    const ledger = api.credibilityRead().ledger.byGroup.find((row) => row.groupId === 'detectors');
    assert.equal(ledger.graded, 6);
    assert.ok(ledger.skill < 0);
  });
});

/* ------------------------------------------------- read model and exports */

describe('read model, signals, insights and the CSV scope', () => {
  test('the Credibility bucket is in the roll-up and the Board’s family table', () => {
    assert.ok(DOMAIN_ORDER.includes('Credibility'));
    assert.ok(SIGNAL_FAMILIES.some((f) => f.domain === 'Credibility'));
    const state = buildDemoState(NOW);
    const insights = buildInsights(state, NOW);
    assert.ok(insights.byDomain.some((d) => d.domain === 'Credibility'));
    assert.ok(credibilitySignals(state, NOW).every((s) => s.domain === 'Credibility' && s.evidence.length && s.action.route.startsWith('#/credibility')));
  });

  test('CSV scope #61 exports classes and numbers, never ids, titles or names', () => {
    assert.ok(CSV_EXPORTS.some((e) => e.key === 'borrowed-evidence'));
    const s = premiseFixture(delegationFixture(baseState()));
    const state = normalizeState(s, { now: NOW }).state;
    const exported = exportWorkspaceCsv(state, 'borrowed-evidence', NOW);
    assert.equal(exported.ok, true);
    const parsed = parseCsv(exported.csv);
    assert.ok(parsed.headers.includes('own_weight_pct') && parsed.headers.includes('brier_own'));
    assert.equal(/prem-|dec-vendor|Delegation d|Rae|Ola|Premise prem/.test(exported.csv), false);
    const cell = (row, key) => (Array.isArray(row) ? row[parsed.headers.indexOf(key)] : row[key]);
    const detectorsRow = parsed.rows.find((r) => cell(r, 'row_kind') === 'group' && cell(r, 'group') === 'detectors');
    assert.equal(cell(detectorsRow, 'borrowed_pct'), '', 'a group that does not borrow exports a blank, never a zero');
    const premisesRow = parsed.rows.find((r) => cell(r, 'row_kind') === 'group' && cell(r, 'group') === 'premises');
    assert.notEqual(cell(premisesRow, 'borrowed_pct'), '', 'a borrowing group exports its pooled estimate');
  });

  test('the brief names no person', () => {
    const state = buildDemoState(NOW);
    const text = credibilityBrief(state, NOW);
    assert.match(text, /Borrowed evidence brief/);
    for (const person of state.people) assert.equal(text.includes(person.name), false, person.name);
  });

  test('every registered group appears in the report with its floor', () => {
    const report = credibilityReport(buildDemoState(NOW), NOW);
    assert.deepEqual(report.groups.map((g) => g.id), CREDIBILITY_GROUPS.map((g) => g.id));
    assert.deepEqual(report.groups.map((g) => g.floorPct), [60, 70, 70]);
  });
});

/* ------------------------------------------------------------- the terminal */

describe('the terminal renders seven panels, accessibly', () => {
  function renderDom(state, hash, renderer = renderCredibility) {
    const dom = new JSDOM('<!doctype html><html lang="en"><body><main id="view"></main><div id="modal-root"></div></body></html>', {
      url: `https://example.test/${hash}`, pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
    });
    const { window } = dom;
    Object.assign(globalThis, {
      window, document: window.document, Node: window.Node, Element: window.Element,
      HTMLElement: window.HTMLElement, Event: window.Event, MouseEvent: window.MouseEvent,
    });
    const { store, api } = harness(state);
    const [, queryPart] = hash.replace(/^#/, '').split('?');
    const ctx = { state: store.state, now: NOW, query: new URLSearchParams(queryPart || ''), navigate: () => {}, api };
    window.document.getElementById('view').appendChild(renderer(ctx));
    return dom;
  }

  test('routes, aliases and the nav entry reach the terminal', () => {
    for (const hash of ['#/credibility', '#/credibility?panel=ledger', '#/shrinkage', '#/outside-view', '#/borrowed-evidence', '#/partial-pooling']) {
      assert.equal(parseRoute(hash).route, 'credibility', hash);
    }
    const source = fs.readFileSync(path.join(ROOT, 'app/main.js'), 'utf8');
    assert.match(source, /route: 'credibility'/);
    assert.match(source, /credibilityAttentionCount/);
  });

  test('every panel: one h1, named tables, a labelled chart where one is drawn, axe-clean', async () => {
    const state = buildDemoState(NOW);
    for (const panel of ['overview', 'shrinkage', 'graduation', 'outside', 'covariate', 'ledger', 'method']) {
      const pageState = panel === 'covariate' ? delegationFixture(baseState()) : state;
      const dom = renderDom(pageState, `#/credibility?panel=${panel}${panel === 'covariate' ? '&group=delegation' : ''}`);
      const { document } = dom.window;
      assert.equal(document.querySelectorAll('h1').length, 1, panel);
      assert.ok(document.body.textContent.length > 900, `${panel} renders real content`);
      for (const tableNode of document.querySelectorAll('table')) assert.ok(tableNode.getAttribute('aria-label'), `${panel} table is named`);
      for (const svg of document.querySelectorAll('svg')) {
        assert.equal(svg.getAttribute('role'), 'img');
        assert.ok(svg.getAttribute('aria-label').length > 40);
      }
      if (panel === 'shrinkage') assert.ok(document.querySelector('svg'), 'the shrinkage plot is drawn');
      if (panel === 'graduation') assert.match(document.body.textContent, /Flips the verdict/);
      if (panel === 'method') assert.match(document.body.textContent, /BDA3/);
      dom.window.eval(AXE_SRC);
      const result = await dom.window.axe.run(document.getElementById('view'), { rules: { 'color-contrast': { enabled: false } } });
      assert.deepEqual(Array.from(result.violations).map((v) => v.id), [], `${panel} is axe-clean`);
      dom.window.close();
    }
  });

  test('authority covariate preview is visible, explicitly non-causal and never drives rules', () => {
    const state = baseState();
    delegationFixture(state);
    // Ensure non-degenerate samples at three authority levels; dates are mature.
    for (const [authority, successes, failures] of [
      ['recommend', 3, 3], ['agree', 4, 2], ['act-inform', 5, 2], ['own', 6, 1],
    ]) {
      for (let i = 0; i < successes + failures; i += 1) {
        const dueOn = day(-50 + i);
        const completedOn = day(-50 + i + (i < successes ? 0 : 3));
        state.delegations.push({
          id: `cov-${authority}-${i}`, personId: 'p-2', title: 'Test delegation', expectedOutcome: 'Done', authority,
          support: '', delegatedOn: day(-60 + i), dueOn, status: 'done', checkins: [], completedOn,
          completionNote: '', returnedOn: null, returnReason: '', createdAt: `${day(-60 + i)}T09:00:00.000Z`, updatedAt: NOW_ISO,
        });
      }
    }
    const report = credibilityReport(state, NOW, state.settings);
    const group = report.groups.find((g) => g.id === 'delegation');
    assert.equal(Object.hasOwn(group, 'covariateModel'), false, 'ordinary report reads do not fit the research model');
    assert.ok(credibilityCovariatePreview(state, report), 'fixture has evidence at at least three ordered authority levels');
    const dom = renderDom(state, '#/credibility?panel=covariate&group=delegation');
    const text = dom.window.document.body.textContent;
    assert.match(text, /Does the authority boundary predict on-time delivery/);
    assert.match(text, /not used for decisions or automation/);
    assert.match(text, /not a causal effect/);
    dom.window.close();
  });

  test('an empty workspace gets an honest dead end', () => {
    const blank = normalizeState(createEmptyState(NOW_ISO), { now: NOW }).state;
    const dom = renderDom(blank, '#/credibility');
    assert.match(dom.window.document.body.textContent, /nothing is borrowed, and nothing is invented/);
    dom.window.close();
  });

  test('the Signal Integrity Board shows what a thin family borrows', () => {
    const dom = renderDom(buildDemoState(NOW), '#/integrity?panel=inventory', renderIntegrity);
    const text = dom.window.document.body.textContent;
    assert.match(text, /Borrowed \(90%\)/);
    assert.match(text, /inherits \d+(\.\d)?%/);
    dom.window.close();
  });
});

/* --------------------------------------------------------------- the demo */

describe('the demo freezes before it grades', () => {
  test('graded frames predate their outcomes; one live frame; no ruling seeded', () => {
    const state = buildDemoState(NOW);
    const frames = state.credibilityFrames;
    assert.ok(frames.length >= 3);
    const graded = frames.filter((f) => f.graded);
    assert.ok(graded.length >= 2);
    for (const f of graded) {
      assert.ok(f.frozenAt.slice(0, 10) < f.reviewOn);
      assert.ok(f.graded.gradedAt.slice(0, 10) >= f.reviewOn);
      assert.ok(Number.isFinite(f.graded.brierBorrowed) && Number.isFinite(f.graded.brierRaw));
    }
    assert.ok(frames.some((f) => !f.graded && !f.lapsedOn && f.reviewOn > NOW_ISO.slice(0, 10)));
    assert.deepEqual(state.credibilityDeclarations, []);
  });
});
