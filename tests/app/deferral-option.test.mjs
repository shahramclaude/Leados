/**
 * Deferral Option Terminal (Schema v68): the American option to commit, its
 * validity against the Black–Scholes anchor, the refusals that keep it honest,
 * the frozen/graded timing forecast and the same-transaction cross-module
 * cascade. The critical claims defended here:
 *
 *  - the binomial tree is a real implementation, validated against a closed
 *    form, not a shape drawn to look quantitative;
 *  - volatility is derived from the workspace's own settled magnitudes and is
 *    withheld below the floor rather than defaulted;
 *  - the option premium is never added to EVSI or to the Cost of Waiting;
 *  - a frame written after the answer is not a prediction, and a graded frame
 *    cannot be re-graded or deleted.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  SCHEMA_VERSION, MIGRATIONS, createEmptyState, normalizeSettings, normalizeState, migrate,
} from '../../app/core/schema.js';
import { buildDemoState } from '../../app/core/demo.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { buildInsights, DOMAIN_ORDER } from '../../app/core/domain/insights.js';
import { caseCostPairs } from '../../app/core/domain/calibration.js';
import {
  DEFERRAL_RULE_IDS, deferralRule,
} from '../../app/core/domain/deferralOptionRules.js';
import {
  americanCommitOption, blackScholesCall, buildDeferralFrame, buildDeferralRecord,
  commitCostBasis, deferralBrief, deferralCandidates, deferralConventions,
  deferralReport, deferralSignals, deferralAttentionCount, deriveVolatility,
  europeanCallCRR, gradeDeferralRecord, verdictOf,
} from '../../app/core/domain/deferralOption.js';
import { normalizeDeferralFrames, normalizeDeferralMarkers } from '../../app/core/domain/deferralOptionSchema.js';
import {
  LINK_ENTITY_TYPES, LINK_ENTITY_COLLECTIONS, LINK_RELATIONS, SYSTEM_GENERATED_LINK_RELATIONS,
  resolveLinkedEntity,
} from '../../app/core/domain/cases.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { renderDeferralOption } from '../../app/views/deferralOption.js';
import { parseRoute } from '../../app/main.js';

const NOW = new Date('2026-10-31T10:00:00.000Z');
const NOW_ISO = NOW.toISOString();
const ROOT = path.resolve(import.meta.dirname, '../..');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

function decision(id, { title = id, date = '2026-10-01', reviewOn = '2026-11-20', decidedOn = null, reversibility = 'reversible' } = {}) {
  return {
    id, title, date, reviewOn, chosen: decidedOn ? 'Option A' : '', decidedOn,
    driver: 'Rae Mensah', approver: 'Rae Mensah', reversibility,
    options: [{ id: `opt-${id}`, label: 'Option A', pros: 'Upside', cons: 'Cost' }],
    createdAt: `${date}T09:00:00.000Z`,
  };
}

function fixture() {
  const s = createEmptyState(NOW_ISO);
  s.settings.leaderName = 'Rae Mensah';
  s.people = [{ id: 'p-leader', name: 'Rae Mensah', status: 'active', role: 'Manager', startDate: '2024-01-01' }];
  s.decisions = [
    decision('d-open', { title: 'Choose the logistics partner' }),
    decision('d-irrev', { title: 'Commit the vendor platform', reviewOn: '2026-12-30', reversibility: 'irreversible' }),
  ];
  s.budgets = [
    {
      id: 'b1', name: 'Programme envelope', currency: 'USD', ceiling: 900000,
      lines: [
        { id: 'l1', title: 'Vendor commitment', status: 'committed', committedAmount: 250000, actualAmount: 0, sourceType: 'decision', sourceId: 'd-open' },
        { id: 'l2', title: 'Platform commitment', status: 'committed', committedAmount: 120000, actualAmount: 0, sourceType: 'decision', sourceId: 'd-irrev' },
      ],
    },
  ];
  // Six settled deliveries give the volatility estimator a real sample: the
  // ratios are deliberately spread so the robust log-scale MAD is non-zero.
  s.portfolio = [
    [12, 9], [20, 26], [8, 7], [15, 18], [10, 8], [30, 27], [6, 6],
  ].map(([expected, actual], i) => ({
    id: `pf-${i}`,
    title: `Delivered item ${i}`,
    kind: 'initiative',
    status: 'done',
    completedOn: '2026-09-15',
    effortDays: { optimistic: Math.round(expected * 0.6), mostLikely: expected, pessimistic: Math.round(expected * 1.6) },
    actualEffortDays: actual,
    currency: 'USD',
  }));
  return normalizeState(s, { now: NOW }).state;
}

function storage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) || null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
}
function harness(initial = fixture(), now = () => NOW) {
  let seq = 0;
  const mem = storage();
  const store = createStore({ storage: mem, now, idFactory: (p) => `${p}-s-${++seq}` });
  store.load();
  const api = createApi(store, { now, idFactory: (p) => `${p}-a-${++seq}` });
  assert.equal(store.importJSON(JSON.stringify(initial), { now: now() }).ok, true);
  return { store, api, mem };
}

/* ------------------------------------------------------------- migration */

describe('schema v68 and fail-closed persistence', () => {
  test('the 67→68 migration adds an empty frame ledger, never a retrospective forecast', () => {
    assert.equal(SCHEMA_VERSION, 77);
    assert.equal(typeof MIGRATIONS[67], 'function');
    const raw = migrate({ schemaVersion: 67, settings: {}, decisions: [decision('old')] });
    assert.deepEqual(raw.applied, ['67 → 68', '68 → 69', '69 → 70', '70 → 71', '71 → 72', '72 → 73', '73 → 74', '74 → 75', '75 → 76', '76 → 77']);
    assert.equal(raw.raw.schemaVersion, 77);
    assert.deepEqual(raw.raw.deferralFrames, []);
    assert.deepEqual(raw.raw.deferralMarkers, []);
    const state = normalizeState(raw.raw, { now: NOW }).state;
    assert.deepEqual(state.deferralFrames, []);
  });

  test('settings clamp and the pause switch cannot be flipped by a typo', () => {
    const s = normalizeSettings({
      deferralMinObservations: 0, deferralSigmaFloorPct: 999, deferralSteps: 5000,
      deferralDiscountPct: 90, deferralMaxHorizonDays: 1, deferralReviewCap: 500,
      deferralMaterialityPct: 0, deferralAutoPropagate: 'false',
    });
    assert.equal(s.deferralMinObservations, 2);
    assert.equal(s.deferralSigmaFloorPct, 200);
    assert.equal(s.deferralSteps, 400);
    assert.equal(s.deferralDiscountPct, 30);
    assert.equal(s.deferralMaxHorizonDays, 7);
    assert.equal(s.deferralReviewCap, 40);
    assert.equal(s.deferralMaterialityPct, 1);
    assert.equal(s.deferralAutoPropagate, true, 'only a literal false pauses automation');
    assert.equal(normalizeSettings({ deferralAutoPropagate: false }).deferralAutoPropagate, false);
  });

  test('a frame without a stake, currency or volatility is dropped, not repaired to zero', () => {
    const base = {
      id: 'dro-1', decisionId: 'd-open', frozenAt: NOW_ISO, reviewOn: '2026-11-20',
      horizonDays: 20, currency: 'USD', valueNow: 250000, commitCost: 250000,
      carryPerWeek: 100, sigma: 0.3, sigmaSource: 'derived', verdict: 'wait',
      premium: 4200, waitValue: 4200, commitNow: 0, threshold: 251000,
      expectedWaitDays: 5, predictedCommitByDeadlinePct: 40,
    };
    const warnings = [];
    const rows = normalizeDeferralFrames([
      base,
      { ...base, id: 'dro-2', valueNow: 0 },
      { ...base, id: 'dro-3', sigma: 0 },
      { ...base, id: 'dro-4', currency: 'us' },
      { ...base, id: 'dro-5', verdict: 'maybe' },
      { ...base, id: 'dro-1' },
    ], warnings);
    assert.deepEqual(rows.map((r) => r.id), ['dro-1']);
    assert.ok(warnings.length >= 4);
  });

  test('a frame claiming a grade without an outcome returns to frozen', () => {
    const warnings = [];
    const [row] = normalizeDeferralFrames([{
      id: 'dro-9', decisionId: 'd-open', frozenAt: '2026-10-01T09:00:00.000Z',
      reviewOn: '2026-10-20', horizonDays: 19, currency: 'USD', valueNow: 1000,
      commitCost: 1000, carryPerWeek: 10, sigma: 0.2, verdict: 'wait', premium: 10,
      waitValue: 10, commitNow: 0, predictedCommitByDeadlinePct: 40,
      graded: { gradedAt: NOW_ISO },
    }], warnings);
    assert.equal(row.graded, null);
    assert.ok(warnings.some((w) => w.includes('grade')));
    assert.deepEqual(normalizeDeferralMarkers(['a', 'a', '', null, 3, 'b']), ['a', 'b']);
  });
});

/* ------------------------------------------------------ lattice validity */

describe('the binomial tree is validated, not decorative', () => {
  test('CRR reproduces Black–Scholes–Merton and converges as steps grow', () => {
    const bsm = blackScholesCall({ spot: 100, strike: 100, rate: 0.05, sigma: 0.2, years: 1 });
    assert.ok(Math.abs(bsm - 10.4506) < 0.001, `BSM reference ${bsm}`);
    const coarse = europeanCallCRR({ spot: 100, strike: 100, rate: 0.05, sigma: 0.2, years: 1, steps: 100 });
    const fine = europeanCallCRR({ spot: 100, strike: 100, rate: 0.05, sigma: 0.2, years: 1, steps: 400 });
    assert.ok(Math.abs(coarse - bsm) < 0.05);
    assert.ok(Math.abs(fine - bsm) < 0.01, `400-step tree ${fine} vs ${bsm}`);
    assert.ok(Math.abs(fine - bsm) < Math.abs(coarse - bsm), 'error shrinks with steps');
  });

  test('an American call dominates its European twin and never prices below intrinsic', () => {
    const american = americanCommitOption({ valueNow: 100, commitCost: 100, carryPerWeek: 0, sigma: 0.2, horizonDays: 365, steps: 200 });
    const european = europeanCallCRR({ spot: 100, strike: 100, rate: 0, sigma: 0.2, years: 1, steps: 200 });
    assert.ok(american.ok);
    assert.ok(american.waitValue >= european - 1e-6, `${american.waitValue} ≥ ${european}`);
    assert.ok(american.waitValue >= american.commitNow - 1e-9);
  });

  test('a free commitment has no option value: K = 0 commits now', () => {
    const result = americanCommitOption({ valueNow: 1000, commitCost: 0, carryPerWeek: 5, sigma: 0.5, horizonDays: 90, steps: 120 });
    assert.equal(result.ok, true);
    assert.equal(result.immediateExercise, true);
    assert.equal(result.premium, 0);
  });

  test('zero volatility is the deterministic limit, not a broken tree', () => {
    const result = americanCommitOption({ valueNow: 1000, commitCost: 1000, carryPerWeek: 0, sigma: 0, horizonDays: 30, steps: 120 });
    assert.equal(result.ok, true);
    assert.equal(result.deterministic, true);
    assert.equal(result.premium, 0);
    assert.equal(result.immediateExercise, true);
  });

  test('the premium is monotone non-decreasing in volatility and non-increasing in carry', () => {
    const base = { valueNow: 1000, commitCost: 1000, horizonDays: 120, steps: 120 };
    let last = -1;
    for (const sigma of [0.05, 0.15, 0.3, 0.6, 1.0]) {
      const result = americanCommitOption({ ...base, carryPerWeek: 0, sigma });
      assert.ok(result.ok);
      assert.ok(result.premium >= last - 1e-6, `premium ${result.premium} at ${sigma} vs ${last}`);
      last = result.premium;
    }
    let previous = Infinity;
    for (const carry of [0, 50, 200, 800, 3000]) {
      const result = americanCommitOption({ ...base, carryPerWeek: carry, sigma: 0.4 });
      assert.ok(result.ok);
      assert.ok(result.premium <= previous + 1e-6, `premium ${result.premium} at carry ${carry} vs ${previous}`);
      previous = result.premium;
    }
  });

  test('probabilities and expected waiting time stay inside their own bounds', () => {
    const result = americanCommitOption({ valueNow: 50000, commitCost: 48000, carryPerWeek: 120, sigma: 0.45, horizonDays: 60, steps: 160 });
    assert.equal(result.ok, true);
    assert.ok(result.exerciseProbability >= 0 && result.exerciseProbability <= 1);
    assert.ok(result.abandonProbability >= 0 && result.abandonProbability <= 1);
    assert.ok(result.expectedWaitDays >= 0 && result.expectedWaitDays <= 60 + 1e-6);
    assert.ok(result.premium >= 0);
    assert.ok(result.thresholdNow === null || result.thresholdNow >= 48000);
  });

  test('invalid inputs refuse instead of approximating', () => {
    assert.equal(americanCommitOption({ valueNow: 0, sigma: 0.3, horizonDays: 30 }).ok, false);
    assert.equal(americanCommitOption({ valueNow: 100, commitCost: -1, sigma: 0.3, horizonDays: 30 }).ok, false);
    assert.equal(americanCommitOption({ valueNow: 100, sigma: -0.2, horizonDays: 30 }).ok, false);
    assert.equal(americanCommitOption({ valueNow: 100, sigma: 0.2, horizonDays: 0 }).ok, false);
    assert.equal(americanCommitOption({ valueNow: 100, sigma: 0.2, horizonDays: 30, carryPerWeek: -5 }).ok, false);
  });
});

/* ------------------------------------------------------------- volatility */

describe('volatility comes from the leader’s own record or is withheld', () => {
  test('an empty workspace withholds σ rather than defaulting it', () => {
    const empty = normalizeState(createEmptyState(NOW_ISO), { now: NOW }).state;
    const read = deriveVolatility(empty, deferralConventions({}), NOW);
    assert.equal(read.available, false);
    assert.equal(read.sigma, null);
    assert.match(read.reason, /floor|withheld/i);
    assert.deepEqual(deferralCandidates(empty, NOW, {}), [], 'no priced decision means no candidate at all');
    const report = deferralReport(empty, NOW, {});
    assert.equal(report.focused, null);
    assert.equal(report.counts.open, 0);
  });

  test('the demo workspace derives σ from its own delivered-effort ratios', () => {
    const demo = buildDemoState(NOW);
    const read = deriveVolatility(demo, deferralConventions({}), NOW);
    assert.equal(read.available, true);
    assert.ok(read.sigma > 0.05 && read.sigma < 2, `σ ${read.sigma}`);
    assert.ok(read.observations >= 5);
    assert.equal(read.families.length, 2);
    assert.ok(read.families.some((f) => f.available));
  });

  test('a derived σ below the declared floor is withheld, and a declared σ is labelled', () => {
    const demo = buildDemoState(NOW);
    const strict = { deferralSigmaFloorPct: 80 };
    const read = deriveVolatility(demo, deferralConventions(strict), NOW);
    assert.equal(read.available, false);
    assert.equal(read.belowFloor, true);
    const candidate = deferralCandidates(demo, NOW, strict)[0];
    const frame = buildDeferralFrame(demo, candidate, NOW, strict);
    assert.match(frame.refusal, /floor/i);
    const declared = buildDeferralFrame(demo, candidate, NOW, strict, { sigma: 0.6 });
    assert.equal(declared.sigmaSource, 'declared');
    assert.equal(declared.refusal, null);
  });
});

/* ----------------------------------------------------- frames & refusals */

describe('frames price one call and refuse what the record cannot support', () => {
  test('only an open decision with a priced stake is a candidate', () => {
    const state = fixture();
    const candidates = deferralCandidates(state, NOW, {});
    assert.deepEqual(candidates.map((c) => c.id).sort(), ['d-irrev', 'd-open']);
    assert.equal(candidates.find((c) => c.id === 'd-open').valueNow, 250000);
    assert.equal(candidates.find((c) => c.id === 'd-open').carryPerWeek, Math.round((250000 / 12) * 100) / 100);
    const unpriced = createEmptyState(NOW_ISO);
    unpriced.decisions = [decision('d-naked')];
    assert.deepEqual(deferralCandidates(normalizeState(unpriced, { now: NOW }).state, NOW, {}), []);
  });

  test('the commitment-cost convention is printed, and a reversible call has no option value', () => {
    const state = fixture();
    const reversible = deferralCandidates(state, NOW, {}).find((c) => c.id === 'd-open');
    const reversibleBasis = commitCostBasis(reversible);
    assert.equal(reversibleBasis.amount, 0);
    assert.match(reversibleBasis.basis, /reversible/);
    const irreversible = deferralCandidates(state, NOW, {}).find((c) => c.id === 'd-irrev');
    const irreversibleBasis = commitCostBasis(irreversible);
    assert.equal(irreversibleBasis.amount, 120000);
    assert.match(irreversibleBasis.basis, /irreversible/);
    const declared = commitCostBasis(irreversible, 40000);
    assert.equal(declared.amount, 40000);
    assert.match(declared.basis, /declared/);
  });

  test('a reversible call commits now; an at-the-money irreversible call can wait', () => {
    const state = fixture();
    const reversible = buildDeferralFrame(state, deferralCandidates(state, NOW, {}).find((c) => c.id === 'd-open'), NOW, { deferralSteps: 120 });
    assert.equal(reversible.verdict.id, 'commit-now');
    assert.equal(reversible.option.premium, 0);
    const waiting = buildDeferralFrame(state, deferralCandidates(state, NOW, {}).find((c) => c.id === 'd-irrev'), NOW, { deferralSteps: 120 }, { carryPerWeek: 0 });
    assert.equal(waiting.commitCost, 120000);
    assert.equal(waiting.carryPerWeek, 0);
    assert.equal(waiting.verdict.id, 'wait');
    assert.ok(waiting.option.premium > 0);
  });

  test('a premium under the materiality floor reads as indifference, not as advice to postpone', () => {
    const state = fixture();
    const candidate = deferralCandidates(state, NOW, {}).find((c) => c.id === 'd-irrev');
    const frame = buildDeferralFrame(state, candidate, NOW, { deferralMaterialityPct: 25 }, { carryPerWeek: 1 });
    assert.equal(frame.verdict.id, 'indifferent');
    assert.match(frame.verdict.headline, /materiality/i);
  });

  test('the report counts verdicts, keeps refusals visible and never prints an unsupported premium', () => {
    const report = deferralReport(fixture(), NOW, {}, 'd-irrev');
    assert.equal(report.counts.open, 2);
    assert.equal(report.counts.priced + report.counts.withheld, report.counts.open);
    assert.equal(report.focusId, 'd-irrev');
    for (const frame of report.withheld) {
      assert.equal(frame.option, null);
      assert.equal(frame.verdict.id, 'withheld');
      assert.ok(frame.refusal);
    }
    const empty = deferralReport(normalizeState(createEmptyState(NOW_ISO), { now: NOW }).state, NOW, {});
    assert.equal(empty.focused, null);
    assert.match(deferralBrief(empty.focused, NOW), /Unpriced is not free/);
  });

  test('the what-if overrides apply to the focused frame only', () => {
    const state = fixture();
    const base = deferralReport(state, NOW, {}, 'd-irrev');
    const changed = deferralReport(state, NOW, {}, 'd-irrev', { carryPerWeek: 0 });
    const untouched = deferralReport(state, NOW, {}, 'd-open');
    assert.notEqual(changed.focused.option.premium, base.focused.option.premium,
      'declaring the carry changes the focused premium');
    assert.ok(changed.focused.option.premium > base.focused.option.premium);
    assert.equal(untouched.focused.carryPerWeek, base.candidates.find((c) => c.decisionId === 'd-open').carryPerWeek);
  });
});

/* -------------------------------------------------------------- cascade */

describe('freeze, propagate and grade on the shared transactional spine', () => {
  test('a frozen wait frame links the decision, opens one boundary watch and is idempotent', () => {
    const { store, api } = harness();
    const result = api.freezeDeferralFrame('d-irrev', { carryPerWeek: 0 });
    assert.equal(result.ok, true, result.error);
    const frame = store.state.deferralFrames[0];
    assert.equal(frame.decisionId, 'd-irrev');
    assert.equal(frame.verdict, 'wait');
    assert.ok(frame.predictedCommitByDeadlinePct > 0 && frame.predictedCommitByDeadlinePct < 100);
    assert.ok((store.state.links || []).some((l) => l.sourceType === 'optionframe'
      && l.targetType === 'decision' && l.relation === 'defers-decision'));
    const tasks = (store.state.delegations || []).filter((d) => String(d.support || '').includes(DEFERRAL_RULE_IDS.FROZEN));
    assert.equal(tasks.length, 1);
    assert.match(tasks[0].title, /exercise boundary/i);
    const before = (store.state.delegations || []).length;
    deferralRule({ ...store.state }, { event: { type: 'deferral.frozen', entity: 'optionframe', entityId: frame.id }, now: NOW, idFactory: (p) => `${p}-again`, settings: store.state.settings });
    assert.equal((store.state.delegations || []).length, before, 'a second run adds nothing');
  });

  test('a commit-now frame links but does not open a watch task', () => {
    const { store, api } = harness();
    const result = api.freezeDeferralFrame('d-open');
    assert.equal(result.ok, true, result.error);
    assert.equal(store.state.deferralFrames[0].verdict, 'commit-now');
    assert.ok((store.state.links || []).some((l) => l.relation === 'defers-decision'));
    assert.equal((store.state.delegations || []).filter((d) => String(d.support || '').includes(DEFERRAL_RULE_IDS.FROZEN)).length, 0);
  });

  test('the same call cannot be frozen twice in one day, and a withheld frame cannot be frozen at all', () => {
    const { api } = harness();
    assert.equal(api.freezeDeferralFrame('d-irrev', { carryPerWeek: 0 }).ok, true);
    const again = api.freezeDeferralFrame('d-irrev', { carryPerWeek: 0 });
    assert.equal(again.ok, false);
    assert.match(again.error, /already frozen/i);
    const strict = harness(fixture());
    strict.store.state.settings.deferralSigmaFloorPct = 200;
    const refused = strict.api.freezeDeferralFrame('d-open', {});
    assert.equal(refused.ok, false);
    assert.match(refused.error, /floor|withheld/i);
  });

  test('an expired window becomes exactly one governed decision per week, linked to its frames', () => {
    const state = fixture();
    state.deferralFrames = [{
      id: 'dro-old', decisionId: 'd-open', frozenAt: '2026-09-01T09:00:00.000Z',
      reviewOn: '2026-10-20', horizonDays: 49, currency: 'USD', valueNow: 250000,
      commitCost: 250000, carryPerWeek: 100, sigma: 0.3, sigmaSource: 'derived', verdict: 'wait',
      premium: 3000, waitValue: 3000, commitNow: 0, threshold: 251000, expectedWaitDays: 6,
      predictedCommitByDeadlinePct: 40, graded: null,
    }];
    const { store, api } = harness(state);
    const scanned = api.scanDeferralOptions();
    assert.equal(scanned.ok, true);
    const decisions = (store.state.decisions || []).filter((d) => String(d.rationale || '').includes(DEFERRAL_RULE_IDS.SCAN));
    assert.equal(decisions.length, 1);
    assert.match(decisions[0].title, /expired/i);
    assert.ok((store.state.links || []).some((l) => l.sourceType === 'optionframe' && l.targetType === 'decision'
      && l.relation === 'surfaces-impact'));
    const again = api.scanDeferralOptions();
    assert.equal(again.ok, true);
    assert.equal((store.state.decisions || []).filter((d) => String(d.rationale || '').includes(DEFERRAL_RULE_IDS.SCAN)).length, 1);
  });

  test('an explicit scan opens due grading work once', () => {
    const state = fixture();
    state.deferralFrames = [{
      id: 'dro-due', decisionId: 'd-open', frozenAt: '2026-09-01T09:00:00.000Z',
      reviewOn: '2026-10-20', horizonDays: 49, currency: 'USD', valueNow: 250000,
      commitCost: 0, carryPerWeek: 100, sigma: 0.3, sigmaSource: 'derived', verdict: 'commit-now',
      premium: 0, waitValue: 0, commitNow: 250000, threshold: 0, expectedWaitDays: 0,
      predictedCommitByDeadlinePct: 100, graded: null,
    }];
    const { store, api } = harness(state);
    api.scanDeferralOptions();
    const grading = (store.state.delegations || []).filter((d) => String(d.support || '').includes(`${DEFERRAL_RULE_IDS.SCAN}:grade`));
    assert.equal(grading.length, 1);
    api.scanDeferralOptions();
    assert.equal((store.state.delegations || []).filter((d) => String(d.support || '').includes(`${DEFERRAL_RULE_IDS.SCAN}:grade`)).length, 1);
  });

  test('the pause switch stops freeze-driven writes but never stops an explicit scan', () => {
    const state = fixture();
    state.settings.deferralAutoPropagate = false;
    const { store, api } = harness(state);
    const result = api.freezeDeferralFrame('d-irrev', { carryPerWeek: 0 });
    assert.equal(result.ok, true, result.error);
    assert.equal((store.state.delegations || []).filter((d) => String(d.support || '').includes(DEFERRAL_RULE_IDS.FROZEN)).length, 0);
    assert.equal(api.scanDeferralOptions().ok, true);
  });
});

/* --------------------------------------------------------------- grading */

describe('grading is prospective and one-shot', () => {
  const record = (overrides = {}) => ({
    id: 'dro-1', decisionId: 'd-open', frozenAt: '2026-10-01T09:00:00.000Z',
    reviewOn: '2026-10-20', horizonDays: 19, currency: 'USD', valueNow: 250000,
    commitCost: 0, carryPerWeek: 100, sigma: 0.3, sigmaSource: 'derived', verdict: 'wait',
    premium: 10, waitValue: 10, commitNow: 250000, threshold: 0, expectedWaitDays: 1,
    predictedCommitByDeadlinePct: 40, graded: null, ...overrides,
  });

  test('grading refuses before the deadline and after a missing source', () => {
    const state = fixture();
    assert.match(gradeDeferralRecord(record({ reviewOn: '2026-12-01' }), state, NOW).reason, /Wait until/);
    assert.match(gradeDeferralRecord(record({ decisionId: 'gone' }), state, NOW).reason, /missing/);
  });

  test('a chosen option without a dated decision cannot be graded', () => {
    const state = fixture();
    state.decisions = state.decisions.map((d) => (d.id === 'd-open' ? { ...d, chosen: 'Option A', decidedOn: null } : d));
    assert.match(gradeDeferralRecord(record(), state, NOW).reason, /no dated decision/);
  });

  test('the Brier term matches a hand calculation on both outcomes', () => {
    const state = fixture();
    const open = gradeDeferralRecord(record(), state, NOW);
    assert.equal(open.ok, true);
    assert.equal(open.committedByDeadline, false);
    assert.equal(open.brier, 0.16);
    const committed = fixture();
    committed.decisions = committed.decisions.map((d) => (d.id === 'd-open' ? { ...d, chosen: 'Option A', decidedOn: '2026-10-15' } : d));
    const early = gradeDeferralRecord(record(), committed, NOW);
    assert.equal(early.committedByDeadline, true);
    assert.equal(early.brier, 0.36);
  });

  test('the action grades once, then refuses a re-grade and a delete', () => {
    const state = fixture();
    state.deferralFrames = [record()];
    state.decisions = state.decisions.map((d) => (d.id === 'd-open' ? { ...d, chosen: 'Option A', decidedOn: '2026-10-15' } : d));
    const { store, api } = harness(state);
    const graded = api.gradeDeferralFrame('dro-1');
    assert.equal(graded.ok, true, graded.error);
    assert.equal(store.state.deferralFrames[0].graded.brier, 0.36);
    assert.equal(api.gradeDeferralFrame('dro-1').ok, false);
    assert.equal(api.deleteDeferralFrame('dro-1').ok, false);
    assert.match(api.deleteDeferralFrame('dro-1').error, /cannot be deleted/);
  });

  test('a frozen frame and its grade survive a persist/reload cycle', () => {
    const state = fixture();
    state.deferralFrames = [record()];
    state.decisions = state.decisions.map((d) => (d.id === 'd-open' ? { ...d, chosen: 'Option A', decidedOn: '2026-10-15' } : d));
    const { store, api } = harness(state);
    assert.equal(api.gradeDeferralFrame('dro-1').ok, true);
    api.freezeDeferralFrame('d-irrev', { carryPerWeek: 0 });
    const raw = store.exportJSON();
    const reload = createStore({ storage: storage(), now: () => NOW });
    reload.load();
    assert.equal(reload.importJSON(raw, { now: NOW }).ok, true);
    assert.equal(reload.state.deferralFrames.length, 2);
    const graded = reload.state.deferralFrames.find((r) => r.id === 'dro-1');
    assert.equal(graded.graded.brier, 0.36);
    assert.equal(graded.graded.committedByDeadline, true);
  });
});

/* ------------------------------------- links, insights, CSV, routes, view */

describe('the terminal is a first-class citizen of the graph', () => {
  test('typed node, collection and relation are registered', () => {
    assert.ok(LINK_ENTITY_TYPES.includes('optionframe'));
    assert.equal(LINK_ENTITY_COLLECTIONS.optionframe, 'deferralFrames');
    assert.ok(LINK_RELATIONS.includes('defers-decision'));
    assert.ok(!SYSTEM_GENERATED_LINK_RELATIONS.includes('defers-decision'));
    const state = fixture();
    state.deferralFrames = [{
      id: 'dro-x', decisionId: 'd-open', frozenAt: NOW_ISO, reviewOn: '2026-11-20', horizonDays: 20,
      currency: 'USD', valueNow: 1000, commitCost: 0, carryPerWeek: 5, sigma: 0.3,
      sigmaSource: 'derived', verdict: 'commit-now', premium: 0, waitValue: 0, commitNow: 1000,
      threshold: 0, expectedWaitDays: 0, predictedCommitByDeadlinePct: 100, graded: null,
    }];
    const node = resolveLinkedEntity(state, 'optionframe', 'dro-x');
    assert.ok(node);
    assert.match(node.route, /^#\/deferral\?panel=frozen&frame=dro-x$/);
  });

  test('the rule is registered with the engine and with the contract ledger', () => {
    assert.ok(DEFAULT_POST_COMMIT_RULES.includes(deferralRule));
    const contract = PROPAGATION_CONTRACTS.find((c) => c.rule === deferralRule);
    assert.ok(contract);
    assert.equal(contract.module, 'deferralOptionRules.js');
    assert.ok(contract.writes.includes('deferralMarkers'));
    assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length);
  });

  test('signals are bucketed in Insights and never silently dropped', () => {
    assert.ok(DOMAIN_ORDER.includes('Deferral options'));
    const state = fixture();
    state.deferralFrames = [{
      id: 'dro-due2', decisionId: 'd-open', frozenAt: '2026-09-01T09:00:00.000Z',
      reviewOn: '2026-10-01', horizonDays: 30, currency: 'USD', valueNow: 250000,
      commitCost: 250000, carryPerWeek: 100, sigma: 0.3, sigmaSource: 'derived', verdict: 'wait',
      premium: 1000, waitValue: 1000, commitNow: 0, threshold: 251000, expectedWaitDays: 4,
      predictedCommitByDeadlinePct: 40, graded: null,
    }];
    const signals = deferralSignals(state, NOW, {});
    assert.ok(signals.some((s) => s.ruleId === 'DRO-01'));
    assert.ok(signals.some((s) => s.ruleId === 'DRO-02'));
    assert.ok(deferralAttentionCount(state, NOW) >= 2);
    const insights = buildInsights(state, NOW);
    const bucket = insights.byDomain.find((d) => d.domain === 'Deferral options');
    assert.ok(bucket, 'the bucket exists');
    assert.ok(bucket.count >= 1);
    for (const signal of signals) {
      assert.ok(signal.action?.route, 'every signal has a route');
      assert.ok(Array.isArray(signal.evidence) && signal.evidence.length > 0, 'every signal carries evidence');
    }
  });

  test('CSV scope #58 exports aggregates only, blank below five frames', () => {
    const scope = CSV_EXPORTS.find((s) => s.key === 'deferral');
    assert.ok(scope);
    assert.match(scope.description, /NO decision title/);
    const state = fixture();
    state.deferralFrames = [{
      id: 'dro-csv', decisionId: 'd-open', frozenAt: NOW_ISO, reviewOn: '2026-11-20', horizonDays: 20,
      currency: 'USD', valueNow: 250000, commitCost: 250000, carryPerWeek: 100, sigma: 0.3,
      sigmaSource: 'derived', verdict: 'wait', premium: 4000, waitValue: 4000, commitNow: 0,
      threshold: 251000, expectedWaitDays: 5, predictedCommitByDeadlinePct: 40, graded: null,
    }];
    const csv = exportWorkspaceCsv(state, 'deferral', { now: NOW });
    assert.ok(csv.ok, csv.error);
    const { headers, rows } = parseCsv(csv.csv);
    assert.equal(rows.length, 1);
    assert.ok(headers.includes('verdict_code'));
    assert.ok(!csv.csv.includes('Choose the logistics partner'), 'no decision title leaves the workspace');
    assert.ok(!headers.includes('decisionId'));
    assert.equal(rows[0][headers.indexOf('frame_count')], '1');
    assert.equal(rows[0][headers.indexOf('mean_premium')], '', 'a mean over one frame is blank, not zero');
    assert.equal(rows[0][headers.indexOf('mean_brier')], '', 'no graded frames means no mean');
  });

  test('routes, titles and nav reach the terminal', () => {
    assert.equal(parseRoute('#/deferral').route, 'deferral');
    assert.equal(parseRoute('#/real-options').route, 'deferral');
    assert.equal(parseRoute('#/deferral?panel=boundary&decision=d-open').route, 'deferral');
    const html = fs.readFileSync(path.join(ROOT, 'app/main.js'), 'utf8');
    assert.match(html, /route: 'deferral'/);
    assert.match(html, /Deferral Option —/);
  });

  test('every panel renders one h1, real tables and axe-clean markup', async () => {
    const state = fixture();
    const renderDom = (hash) => {
      const dom = new JSDOM('<!doctype html><html lang="en"><body><main id="view"></main><div id="modal-root"></div></body></html>', {
        url: `https://example.test/${hash}`, pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
      });
      const { window } = dom;
      globalThis.window = window; globalThis.document = window.document; globalThis.Node = window.Node;
      globalThis.Element = window.Element; globalThis.HTMLElement = window.HTMLElement;
      globalThis.Event = window.Event; globalThis.MouseEvent = window.MouseEvent;
      const [pathPart, queryPart] = hash.replace(/^#/, '').split('?');
      const ctx = {
        state, now: NOW, query: new URLSearchParams(queryPart || ''), navigate: () => {},
        api: {
          scanDeferralOptions: () => ({ ok: true, changed: false }),
          freezeDeferralFrame: () => ({ ok: true, id: 'dro' }),
          gradeDeferralFrame: () => ({ ok: true, grade: { brier: 0.1, committedByDeadline: true } }),
          deleteDeferralFrame: () => ({ ok: true }),
          deferralRead: (id, overrides) => deferralReport(state, NOW, state.settings, id, overrides),
        },
        route: pathPart,
      };
      window.document.getElementById('view').appendChild(renderDeferralOption(ctx));
      return { dom, ctx };
    };
    for (const panel of ['overview', 'boundary', 'frozen', 'method']) {
      const { dom } = renderDom(`#/deferral?panel=${panel}&decision=d-irrev`);
      const { document } = dom.window;
      assert.equal(document.querySelectorAll('h1').length, 1, panel);
      assert.ok(document.body.textContent.includes('Deferral Option'), panel);
      for (const table of document.querySelectorAll('table')) {
        const headers = table.querySelectorAll('thead th').length;
        assert.ok(table.getAttribute('aria-label'), 'every table announces its purpose');
        for (const row of table.querySelectorAll('tbody tr')) {
          assert.equal(row.querySelectorAll('td').length, headers, panel);
        }
      }
      dom.window.eval(AXE_SRC);
      const result = await dom.window.axe.run(dom.window.document.getElementById('view'), { rules: { 'color-contrast': { enabled: false } } });
      assert.deepEqual(Array.from(result.violations).map((v) => v.id), [], panel);
      dom.window.close();
    }
  });

  test('the empty workspace is an explained dead end, not a blank page', () => {
    const dom = new JSDOM('<!doctype html><html lang="en"><body></body></html>', { url: 'https://example.test/#/deferral' });
    globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.Node = dom.window.Node;
    const empty = normalizeState(createEmptyState(NOW_ISO), { now: NOW }).state;
    const node = renderDeferralOption({
      state: empty, now: NOW, query: new URLSearchParams(''), navigate: () => {},
      api: { deferralRead: () => deferralReport(empty, NOW, {}, null) },
    });
    dom.window.document.body.appendChild(node);
    assert.match(dom.window.document.body.textContent, /No open decision carries a priced stake/);
    assert.ok(dom.window.document.querySelector('a[href="#/decisions"]'));
    dom.window.close();
  });

  test('the board brief is identity-free and prints the refusals it carries', () => {
    const report = deferralReport(fixture(), NOW, {}, 'd-irrev');
    const text = deferralBrief(report.focused, NOW);
    assert.match(text, /DEFERRAL OPTIONS/);
    assert.ok(!text.includes('Rae Mensah'), 'no person name');
    assert.match(text, /not a market price/i);
    assert.match(text, /EVSI/);
    const withheld = buildDeferralFrame(fixture(), deferralCandidates(fixture(), NOW, {})[0], NOW, { deferralSigmaFloorPct: 200 });
    assert.equal(withheld.verdict.id, 'withheld');
    assert.equal(verdictOf(withheld).id, 'withheld');
  });

  test('a frame built from real records round-trips through the frozen record builder', () => {
    const state = fixture();
    const candidate = deferralCandidates(state, NOW, {}).find((c) => c.id === 'd-irrev');
    const frame = buildDeferralFrame(state, candidate, NOW, {}, { carryPerWeek: 0 });
    const built = buildDeferralRecord(frame, NOW, 'dro-round');
    assert.equal(built.ok, true);
    const warnings = [];
    const [stored] = normalizeDeferralFrames([built.record], warnings);
    assert.deepEqual(warnings, []);
    assert.equal(stored.verdict, frame.verdict.id);
    assert.equal(stored.premium, frame.option.premium);
    assert.equal(stored.predictedCommitByDeadlinePct, frame.option.exerciseProbabilityPct);
    const refused = buildDeferralRecord({ refusal: 'no volatility' }, NOW, 'dro-none');
    assert.equal(refused.ok, false);
  });

  test('the demo workspace produces supported frames and a derived volatility', () => {
    const demo = buildDemoState(NOW);
    const report = deferralReport(demo, NOW, demo.settings, null);
    assert.ok(report.counts.open >= 3);
    assert.ok(report.counts.priced >= 1);
    assert.ok(report.focused);
    assert.ok(report.focused.sigma > 0);
    assert.ok(Object.values(DEFERRAL_RULE_IDS).every((id) => /^RULE-DRO-\d\d$/.test(id)));
    assert.ok(deferralConventions(demo.settings).steps >= 20);
  });
});
