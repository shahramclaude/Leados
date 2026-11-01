import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  SCHEMA_VERSION,
  MIGRATIONS,
  DEFAULT_SETTINGS,
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
import {
  DEFERRAL_PORTFOLIO_RULE_IDS,
  DEFERRAL_PORTFOLIO_EVENTS,
} from '../../app/core/domain/deferralPortfolioRules.js';
import {
  normalizeDeferralPortfolioReadings,
  normalizeCorrelationDeclarations,
  normalizeDeferralPortfolioMarkers,
} from '../../app/core/domain/deferralPortfolioSchema.js';
import { resolveLinkedEntity } from '../../app/core/domain/cases.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { renderDeferralOption } from '../../app/views/deferralOption.js';
import { parseRoute } from '../../app/main.js';
import {
  cholesky,
  standardNormals,
  simulatePortfolio,
  analysePortfolio,
  buildPortfolioReading,
  gradePortfolioReading,
  portfolioDeferralReport,
  portfolioDeferralSignals,
  portfolioDeferralBrief,
  sharedPremisePairs,
  correlationStructure,
  deferralPortfolioConventions,
  DEFERRAL_PORTFOLIO_DEFAULTS,
} from '../../app/core/domain/deferralPortfolio.js';
import { deferralCandidates, buildDeferralFrame } from '../../app/core/domain/deferralOption.js';
import { mulberry32 } from '../../app/core/domain/dynamics.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const NOW_ISO = '2026-10-31T10:00:00.000Z';
const NOW = new Date(NOW_ISO);
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

function decision(id, { reviewOn = '2027-01-29', chosen = '', decidedOn = null } = {}) {
  return {
    id, title: `Commit ${id}`, date: '2026-10-01', reviewOn, chosen, decidedOn,
    driver: 'Rae Mensah', approver: 'Rae Mensah', reversibility: 'irreversible',
    options: [{ id: `opt-${id}`, label: 'Option A', pros: 'Upside', cons: 'Cost' }],
    createdAt: '2026-10-01T09:00:00.000Z',
  };
}

/**
 * The fixture: two irreversible USD commitments (150k, 120k) share one
 * load-bearing premise; seven settled deliveries give the volatility estimator
 * a real sample (σ = 0.9483). With V = K each call is a genuine wait/abandon
 * decision, so the book has real flexibility to correlate.
 */
function fixture({ rho = 0.9, third = false, concentration = null } = {}) {
  const s = createEmptyState(NOW_ISO);
  s.settings.leaderName = 'Rae Mensah';
  s.people = [{ id: 'p-leader', name: 'Rae Mensah', status: 'active', role: 'Manager', startDate: '2024-01-01' }];
  s.decisions = [decision('d-a'), decision('d-b')];
  s.budgets = [{
    id: 'b1', name: 'Programme envelope', currency: 'USD', ceiling: 900000,
    lines: [
      { id: 'l1', title: 'A commitment', status: 'committed', committedAmount: 150000, actualAmount: 0, sourceType: 'decision', sourceId: 'd-a' },
      { id: 'l2', title: 'B commitment', status: 'committed', committedAmount: 120000, actualAmount: 0, sourceType: 'decision', sourceId: 'd-b' },
    ],
  }];
  s.portfolio = [
    [12, 9], [20, 26], [8, 7], [15, 18], [10, 8], [30, 27], [6, 6],
  ].map(([expected, actual], i) => ({
    id: `pf-${i}`, title: `Delivered item ${i}`, kind: 'initiative', status: 'done',
    completedOn: '2026-09-15',
    effortDays: { optimistic: Math.round(expected * 0.6), mostLikely: expected, pessimistic: Math.round(expected * 1.6) },
    actualEffortDays: actual, currency: 'USD',
  }));
  s.premises = [{
    id: 'prem-1', title: 'Platform cost band holds', statement: 'The band holds through Q1',
    decisionId: null, ownerId: 'p-leader', criticality: 'load-bearing', priorPct: 75,
    watchPct: 55, breachPct: 30, halfLifeDays: 90, reviewBy: '2026-11-20',
    humanDisposition: null, sourceRefs: [], observations: [], history: [],
    status: 'unobserved', posteriorPct: 75, logBayesFactor: 0, autoPropagate: true,
    createdAt: NOW_ISO, updatedAt: NOW_ISO,
  }];
  s.links = [
    { id: 'lk1', sourceType: 'decision', sourceId: 'd-a', targetType: 'premise', targetId: 'prem-1', relation: 'rests-on', ruleId: 'test', summary: 'Cost band', createdAt: NOW_ISO, updatedAt: NOW_ISO },
    { id: 'lk2', sourceType: 'decision', sourceId: 'd-b', targetType: 'premise', targetId: 'prem-1', relation: 'rests-on', ruleId: 'test', summary: 'Cost band', createdAt: NOW_ISO, updatedAt: NOW_ISO },
  ];
  if (rho !== null) {
    s.correlationDeclarations = [{ id: 'c1', aId: 'd-a', bId: 'd-b', rho, declaredAt: NOW_ISO }];
  }
  if (third) {
    s.decisions.push(decision('d-c', { reviewOn: '2026-12-30' }));
    s.budgets[0].lines.push({ id: 'l3', title: 'C commitment', status: 'committed', committedAmount: 90000, actualAmount: 0, sourceType: 'decision', sourceId: 'd-c' });
  }
  const state = normalizeState(s, { now: NOW }).state;
  if (concentration !== null) state.settings.deferralPortfolioConcentrationPct = concentration;
  return state;
}

function framesOf(state) {
  return deferralCandidates(state, NOW, state.settings)
    .map((candidate) => buildDeferralFrame(state, candidate, NOW, state.settings))
    .filter((frame) => frame && frame.option && !frame.refusal);
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

describe('schema v69 and fail-closed persistence', () => {
  test('the 68→69 migration adds empty ledgers, never a retrospective forecast', () => {
    assert.equal(SCHEMA_VERSION, 77);
    assert.equal(typeof MIGRATIONS[68], 'function');
    const raw = migrate({ schemaVersion: 68, settings: {}, decisions: [decision('old')] });
    assert.deepEqual(raw.applied, ['68 → 69', '69 → 70', '70 → 71', '71 → 72', '72 → 73', '73 → 74', '74 → 75', '75 → 76', '76 → 77']);
    assert.equal(raw.raw.schemaVersion, 77);
    assert.deepEqual(raw.raw.deferralPortfolioReadings, []);
    assert.deepEqual(raw.raw.correlationDeclarations, []);
    assert.deepEqual(raw.raw.deferralPortfolioMarkers, []);
    const state = normalizeState(raw.raw, { now: NOW }).state;
    assert.deepEqual(state.deferralPortfolioReadings, []);
    assert.deepEqual(state.correlationDeclarations, []);
  });

  test('settings defaults, clamp and the pause switch survive a hostile typo', () => {
    assert.equal(DEFAULT_SETTINGS.deferralPortfolioMaxMembers, 6);
    assert.equal(DEFAULT_SETTINGS.deferralPortfolioPaths, 4000);
    assert.equal(DEFAULT_SETTINGS.deferralPortfolioGridDays, 1);
    assert.equal(DEFAULT_SETTINGS.deferralPortfolioTailPct, 90);
    assert.equal(DEFAULT_SETTINGS.deferralPortfolioConcentrationPct, 60);
    assert.equal(DEFAULT_SETTINGS.deferralPortfolioJointLapsePp, 10);
    assert.equal(DEFAULT_SETTINGS.deferralPortfolioReviewCap, 20);
    assert.equal(DEFAULT_SETTINGS.deferralPortfolioAutoPropagate, true);
    const s = normalizeSettings({
      deferralPortfolioMaxMembers: 99, deferralPortfolioPaths: 10, deferralPortfolioSeed: 0,
      deferralPortfolioGridDays: 30, deferralPortfolioTailPct: 5, deferralPortfolioConcentrationPct: 0,
      deferralPortfolioJointLapsePp: 500, deferralPortfolioReviewCap: 999,
      deferralPortfolioAutoPropagate: 'false',
    });
    assert.equal(s.deferralPortfolioMaxMembers, 8);
    assert.equal(s.deferralPortfolioPaths, 500);
    assert.equal(s.deferralPortfolioSeed, 1);
    assert.equal(s.deferralPortfolioGridDays, 7);
    assert.equal(s.deferralPortfolioTailPct, 50);
    assert.equal(s.deferralPortfolioConcentrationPct, 10);
    assert.equal(s.deferralPortfolioJointLapsePp, 50);
    assert.equal(s.deferralPortfolioReviewCap, 20);
    assert.equal(s.deferralPortfolioAutoPropagate, true, 'the string "false" cannot pause propagation');
  });

  test('readings normalize fail-closed; declarations dedupe by unordered pair, latest wins', () => {
    const readings = normalizeDeferralPortfolioReadings([
      { id: 'r1', frozenAt: NOW_ISO, reviewOn: '2027-01-29', windowDays: 90, currency: 'USD', memberIds: ['d-a', 'd-b'], paths: 4000, steps: 90, seed: 7, sumPremium: 1, sumStake: 2, mcMeanTotal: 'x', cvar: 'y', topContributionShare: 'z', worstJointLapseExcessPp: 'NaN', predictedAnyCommitPct: 55, graded: null, challengeNotes: ['note'] },
    ], { now: NOW });
    assert.equal(readings.length, 1);
    assert.equal(readings[0].mcMeanTotal, null, 'non-finite numbers drop, they are never coerced');
    assert.equal(readings[0].cvar, null);
    assert.equal(readings[0].topContributionShare, null);
    assert.equal(readings[0].worstJointLapseExcessPp, null);
    assert.equal(readings[0].predictedAnyCommitPct, 55);
    assert.deepEqual(readings[0].challengeNotes, ['note']);
    const warnings = [];
    const declarations = normalizeCorrelationDeclarations([
      { id: 'c1', aId: 'd-a', bId: 'd-b', rho: 0.9, declaredAt: '2026-10-01T09:00:00.000Z' },
      { id: 'c2', aId: 'd-b', bId: 'd-a', rho: 0.4, declaredAt: '2026-10-02T09:00:00.000Z' },
      { id: 'c3', aId: 'd-a', bId: 'd-b', rho: 1.4, declaredAt: '2026-10-03T09:00:00.000Z' },
      { id: 'c4', aId: 'd-x', bId: 'd-y', rho: 0.3, declaredAt: '2026-10-04T09:00:00.000Z' },
    ], warnings);
    assert.equal(declarations.length, 2, 'the unordered pair dedupes to its latest declaration; out-of-range ρ drops');
    const pair = declarations.find((d) => (d.aId === 'd-a' && d.bId === 'd-b') || (d.aId === 'd-b' && d.bId === 'd-a'));
    assert.equal(pair.rho, 0.4, 'the later declaration for the same unordered pair wins');
    assert.ok(!declarations.some((d) => d.rho === 1.4), 'ρ outside [−0.99, 0.99] is dropped, not clamped — an invented fact');
    assert.ok(warnings.length >= 1, 'the dropped declaration is logged, not silent');
    const markers = normalizeDeferralPortfolioMarkers([{ id: 'm1', tag: 't1', at: NOW_ISO }, 'junk', { tag: 'no-id' }]);
    assert.equal(markers.length, 1);
  });
});

/* ------------------------------------------------------------ linear algebra */

describe('the correlation machinery is honest about what it can and cannot do', () => {
  test('Cholesky: identity, a known 2×2, and the refusal of an inconsistent matrix', () => {
    const I = cholesky([[1, 0], [0, 1]]);
    assert.deepEqual(I, [[1, 0], [0, 1]]);
    const L = cholesky([[1, 0.45], [0.45, 1]]);
    assert.equal(L[1][0], 0.45);
    assert.ok(Math.abs(L[1][1] - Math.sqrt(1 - 0.45 ** 2)) < 1e-12);
    assert.equal(cholesky([[1, 0.9], [0.9, 1], [1, -0.9]]), null, 'no joint distribution has exactly those pairwise correlations');
    assert.equal(cholesky([[1, 2], [2, 1]]), null);
  });

  test('correlated normals reproduce the declared ρ, and the diagonal starts at one', () => {
    // The regression that cost a morning: a correlation matrix initialised with
    // a ZERO diagonal is never positive semi-definite, and every declared book
    // was refused as inconsistent. The diagonal is one by definition.
    const rho = 0.45;
    const L = cholesky([[1, rho], [rho, 1]]);
    const rand = mulberry32(20261031);
    const n = 20000;
    let sx = 0; let sy = 0; let sxy = 0;
    for (let p = 0; p < n; p += 1) {
      const z = standardNormals(rand, 2);
      const x = L[0][0] * z[0];
      const y = L[1][0] * z[0] + L[1][1] * z[1];
      sx += x; sy += y; sxy += x * y;
    }
    const cov = sxy / n - (sx / n) * (sy / n);
    assert.ok(Math.abs(cov - rho) < 0.02, `sample covariance ${cov.toFixed(4)} should track ρ = ${rho}`);
  });

  test('a single declared pair prices — the matrix is well-formed with two members', () => {
    const state = fixture({ rho: 0.45 });
    const frames = framesOf(state);
    assert.equal(frames.length, 2);
    const analysis = analysePortfolio(frames, { pairs: sharedPremisePairs(state), declarations: state.correlationDeclarations, conventions: deferralPortfolioConventions(state.settings) });
    assert.equal(analysis.ok, true, analysis.refusal);
    assert.equal(analysis.simulation.steps, 90, 'daily grid on a 90-day window');
    assert.ok(Math.abs(analysis.simulation.stepDays - 1) < 0.01);
  });

  test('simulatePortfolio refuses too few members, a wrong-shaped matrix, and a non-PSD one', () => {
    const state = fixture();
    const frames = framesOf(state);
    const one = simulatePortfolio([frames[0]], { rho: [[1]], paths: 100 });
    assert.equal(one.ok, false);
    assert.equal(one.code, 'too-few-members');
    const bad = simulatePortfolio(frames, { rho: [[1]], paths: 100 });
    assert.equal(bad.ok, false);
    assert.equal(bad.code, 'bad-matrix');
    const psd = simulatePortfolio(frames, { rho: [[1, 0.9, 0.9], [0.9, 1, 0.9], [0.9, 0.9, 1], [0, 0, 0, 1]], paths: 100 });
    assert.equal(psd.ok, false);
    assert.equal(psd.code, 'bad-matrix');
    const nonPsd = simulatePortfolio(frames, { rho: [[1, 1.2], [1.2, 1]], paths: 100 });
    assert.equal(nonPsd.ok, false);
    assert.equal(nonPsd.code, 'not-psd');
    assert.match(nonPsd.reason, /not positive semi-definite/);
    assert.match(nonPsd.reason, /not silently project/i);
  });
});

/* -------------------------------------------------- coupling identification */

describe('the graph, not the leader, finds what correlates', () => {
  test('pairs come from premise.decisionId AND from typed links, open decisions only, unordered', () => {
    const state = fixture({ rho: null });
    state.premises.push({
      ...state.premises[0], id: 'prem-2', title: 'Second premise', decisionId: 'd-b',
    });
    state.decisions[0].chosen = 'Option A';
    state.decisions[0].decidedOn = '2026-10-20';
    state.links.push({
      id: 'lk3', sourceType: 'decision', sourceId: 'd-c', targetType: 'premise', targetId: 'prem-2',
      relation: 'tests', ruleId: 'test', summary: 'link coupling', createdAt: NOW_ISO, updatedAt: NOW_ISO,
    });
    state.decisions.push(decision('d-c'));
    const pairs = sharedPremisePairs(state);
    assert.ok(pairs.some((p) => (p.aId === 'd-b' && p.bId === 'd-c') || (p.aId === 'd-c' && p.bId === 'd-b')), 'coupling via a tests link counts');
    assert.ok(!pairs.some((p) => p.aId === 'd-a' || p.bId === 'd-a'), 'a decided call no longer couples anything');
    for (const pair of pairs) {
      assert.ok(pair.aId < pair.bId, 'pairs are canonicalised so (a,b) and (b,a) are one pair');
    }
  });

  test('an undeclared sharing pair refuses the joint tail and names the pair; strangers default to ρ = 0', () => {
    const state = fixture({ rho: null });
    const frames = framesOf(state);
    const analysis = analysePortfolio(frames, { pairs: sharedPremisePairs(state), declarations: [], conventions: deferralPortfolioConventions(state.settings) });
    assert.equal(analysis.ok, true, 'the per-currency book still assembles');
    assert.ok(analysis.refusal, 'but the joint tail is refused');
    assert.match(analysis.refusal, /no declared correlation/);
    assert.equal(analysis.correlation.missing.length, 1);
    assert.equal(analysis.correlation.missing[0].premiseIds[0], 'prem-1');
    assert.match(analysis.correlation.conventions, /ρ = 0 by convention/);

    const state3 = fixture({ rho: null, third: true });
    const frames3 = framesOf(state3);
    const declared = [{ id: 'c1', aId: 'd-a', bId: 'd-b', rho: 0.6, declaredAt: NOW_ISO }];
    const a3 = analysePortfolio(frames3, { pairs: sharedPremisePairs(state3), declarations: declared, conventions: deferralPortfolioConventions(state3.settings) });
    assert.ok(!a3.refusal);
    assert.equal(a3.correlation.matrix[0][2], 0, 'd-c shares no premise: the graph records no coupling, so ρ = 0');
    assert.equal(a3.correlation.matrix[0][1], 0.6);
    assert.equal(a3.correlation.rows.length, 1);
  });

  test('the report prices each currency separately and caps the book at the convention', () => {
    const state = fixture({ third: true });
    const euro = decision('d-eur');
    euro.reviewOn = '2027-02-15';
    state.decisions.push(euro);
    state.budgets.push({
      id: 'b2', name: 'Euro envelope', currency: 'EUR', ceiling: 400000,
      lines: [{ id: 'le1', title: 'Euro commitment', status: 'committed', committedAmount: 100000, actualAmount: 0, sourceType: 'decision', sourceId: 'd-eur' }],
    });
    const report = portfolioDeferralReport(state, NOW, state.settings);
    assert.equal(report.portfolios.length, 2);
    assert.equal(report.portfolios[0].currency, 'USD');
    assert.equal(report.portfolios[1].currency, 'EUR');
    assert.match(report.portfolios[1].refusal || '', /at least 2 priced open calls/, 'a one-call currency is an explained dead end, priced per-call');
    // Cap: force 7 priced calls in one currency.
    for (let i = 0; i < 5; i += 1) {
      const extra = decision(`d-x${i}`);
      state.decisions.push(extra);
      state.budgets[0].lines.push({ id: `lx${i}`, title: `Extra ${i}`, status: 'committed', committedAmount: 40000 + i, actualAmount: 0, sourceType: 'decision', sourceId: `d-x${i}` });
    }
    const capped = portfolioDeferralReport(state, NOW, state.settings);
    const usd = capped.portfolios.find((p) => p.currency === 'USD');
    assert.ok(usd.memberCount <= 8);
    assert.equal(usd.memberCount, 6, 'default max members');
    assert.match(usd.excludedPricedCalls || '', /beyond the 6-member cap/);
  });
});

/* ------------------------------------------------------- the two theorems */

describe('the additivity theorem and the tail that correlation moves', () => {
  test('expected total is additive under any ρ; the joint tail and lapse are not', () => {
    const zero = analysePortfolio(framesOf(fixture({ rho: 0 })), {
      pairs: sharedPremisePairs(fixture({ rho: 0 })), declarations: fixture({ rho: 0 }).correlationDeclarations,
      conventions: deferralPortfolioConventions(fixture({ rho: 0 }).settings),
    });
    const high = analysePortfolio(framesOf(fixture({ rho: 0.9 })), {
      pairs: sharedPremisePairs(fixture({ rho: 0.9 })), declarations: fixture({ rho: 0.9 }).correlationDeclarations,
      conventions: deferralPortfolioConventions(fixture({ rho: 0.9 }).settings),
    });
    assert.equal(zero.ok && high.ok, true);
    assert.equal(zero.sumPremium, 3202.77);
    assert.equal(high.sumPremium, 3202.77, 'the exact sum is the per-call lattices; correlation cannot change it');
    // The MC means agree within their own standard errors: same expectation.
    assert.ok(
      Math.abs(zero.simulation.meanTotal - high.simulation.meanTotal) <= zero.simulation.seTotal + high.simulation.seTotal,
      `means ${zero.simulation.meanTotal} vs ${high.simulation.meanTotal} should agree within ${zero.simulation.seTotal + high.simulation.seTotal}`,
    );
    // But the tail is materially worse and the calls lapse together more often.
    assert.ok(high.simulation.cvar < zero.simulation.cvar, 'a 0.9 correlation deepens the book tail');
    assert.ok(zero.simulation.pAllLapsePct < high.simulation.pAllLapsePct);
    assert.ok(high.simulation.pAllLapsePct - zero.simulation.pAllLapsePct >= 10, 'joint lapse moves by whole percentage points, not decimals');
    // Monotone in ρ for the premise's joint lapse.
    const mid = analysePortfolio(framesOf(fixture({ rho: 0.45 })), {
      pairs: sharedPremisePairs(fixture({ rho: 0.45 })), declarations: fixture({ rho: 0.45 }).correlationDeclarations,
      conventions: deferralPortfolioConventions(fixture({ rho: 0.45 }).settings),
    });
    const lapse = (a) => a.simulation.premises[0].jointLapsePct;
    assert.ok(lapse(zero) < lapse(mid) && lapse(mid) < lapse(high), 'joint lapse is monotone in the declared ρ');
    assert.ok(mid.simulation.premises[0].excessPp >= 5, 'the mid-correlation book already shows a material excess over independence');
    assert.ok(high.simulation.premises[0].excessPp >= 10, 'the high-correlation book shows a double-digit excess over independence');
  });

  test('pinned reference figures for the declared book (deterministic seed)', () => {
    const state = fixture({ rho: 0.9 });
    const report = portfolioDeferralReport(state, NOW, state.settings);
    const sim = report.portfolios[0].simulation;
    assert.equal(report.portfolios[0].memberCount, 2);
    assert.equal(report.portfolios[0].sumStake, 270000);
    assert.equal(sim.paths, 4000);
    assert.equal(sim.steps, 90);
    assert.equal(sim.meanTotal, 10390.2);
    assert.equal(sim.seTotal, 425.78);
    assert.equal(sim.cvar, -32717.4832);
    assert.equal(sim.standaloneCvarSum, -34237.38);
    assert.equal(sim.diversificationCredit, 1519.9, 'subadditivity: pooling softens the tail by a positive credit');
    assert.ok(sim.diversificationCredit >= 0);
    assert.equal(sim.pAllLapsePct, 44.4);
    assert.equal(sim.pAnyCommitPct, 55.6);
    assert.equal(sim.topContributionShare, 0.5762124147938126);
    // Determinism: same state, same seed, same numbers.
    const again = portfolioDeferralReport(fixture({ rho: 0.9 }), NOW, state.settings);
    assert.equal(again.portfolios[0].simulation.cvar, sim.cvar);
    assert.equal(again.portfolios[0].simulation.meanTotal, sim.meanTotal);
  });

  test('component contributions partition the tail exactly, and the MC commit rate matches the lattice', () => {
    const state = fixture({ rho: 0.9 });
    const report = portfolioDeferralReport(state, NOW, state.settings);
    const sim = report.portfolios[0].simulation;
    const sum = sim.members.reduce((acc, row) => acc + row.contribution, 0);
    assert.ok(Math.abs(sum - sim.cvar) < 0.01, 'Tasche contributions partition CVaR');
    assert.ok(Math.abs(sim.members.reduce((acc, row) => acc + row.contributionShare, 0) - 1) < 0.01);
    for (const row of sim.members) {
      assert.ok(Math.abs(row.mcCommitPct - row.latticeCommitPct) <= 1.5, `${row.decisionId}: MC commit ${row.mcCommitPct}% vs lattice ${row.latticeCommitPct}%`);
    }
    const prem = sim.premises[0];
    assert.equal(prem.premiseId, 'prem-1');
    assert.equal(prem.memberCount, 2);
    assert.equal(prem.excessPp, 17.9);
    assert.equal(prem.premiumSharePct, 100, 'both members of the book rest on the one premise');
  });

  test('the grid convention trades speed for policy fidelity, and is clamped to 1–7 days', () => {
    const state = fixture({ rho: 0.9 });
    const frames = framesOf(state);
    const rho = [[1, 0.9], [0.9, 1]];
    const daily = simulatePortfolio(frames, { rho, paths: 2000, seed: 7, windowDays: 90, gridDays: 1 });
    const weekly = simulatePortfolio(frames, { rho, paths: 2000, seed: 7, windowDays: 90, gridDays: 7 });
    assert.equal(daily.steps, 90);
    assert.equal(weekly.steps, 13);
    const meanOf = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    // A finer grid checks the boundary more often, so the simulated commit
    // RATE tracks the lattice policy more closely. (The mean payoff is NOT
    // monotone in grid density: checkpoint overshoot inflates it while missed
    // crossings deflate it — which is exactly why the quoted total is always
    // the exact lattice sum and the MC mean is printed only as its grid error.)
    const rateError = (sim) => sim.members.reduce((acc, frame, i) => acc + Math.abs(meanOf(sim.committed[i]) * 100 - frame.option.commitProbabilityPct), 0);
    assert.ok(rateError(daily) < rateError(weekly),
      `daily commit-rate error ${rateError(daily).toFixed(2)}pp should beat weekly ${rateError(weekly).toFixed(2)}pp`);
    const clamped = simulatePortfolio(frames, { rho, paths: 100, seed: 7, windowDays: 90, gridDays: 30 });
    assert.equal(clamped.steps, Math.ceil(90 / 7), 'a hostile grid setting is clamped to 7 days');
  });
});

/* -------------------------------------------------------- freeze & grade */

describe('freezing, grading and the one-shot forecast discipline', () => {
  test('a frozen reading is bounded, identity-free and carries the worst joint-lapse excess', () => {
    const state = fixture({ rho: 0.9 });
    const analysis = portfolioDeferralReport(state, NOW, state.settings).portfolios[0];
    const built = buildPortfolioReading(analysis, NOW, 'dpo-1');
    assert.equal(built.ok, true);
    const record = built.record;
    assert.equal(record.id, 'dpo-1');
    assert.deepEqual(record.memberIds, ['d-a', 'd-b']);
    assert.equal(record.currency, 'USD');
    assert.equal(record.reviewOn, '2027-01-29');
    assert.equal(record.windowDays, 90);
    assert.equal(record.worstJointLapseExcessPp, 17.9);
    assert.equal(record.stressedPremiseIds[0], 'prem-1');
    assert.equal(record.predictedAnyCommitPct, 55.6);
    assert.equal(record.graded, null);
    assert.deepEqual(record.challengeNotes, []);
    const serialised = JSON.stringify(record);
    for (const secret of ['Commit d-a', 'Commit d-b', 'Rae Mensah', 'Platform cost band']) {
      assert.ok(!serialised.includes(secret), `a frozen reading must not embed workspace identities (${secret})`);
    }
  });

  test('grading is refused before the window, undated choices are ungradable, and the score is one-shot', () => {
    const state = fixture({ rho: 0.9 });
    const analysis = portfolioDeferralReport(state, NOW, state.settings).portfolios[0];
    const record = buildPortfolioReading(analysis, NOW, 'dpo-1').record;
    const early = gradePortfolioReading(record, state, NOW);
    assert.equal(early.ok, false);
    assert.match(early.reason, /Wait until the window closes/);
    const after = new Date('2027-02-01T10:00:00.000Z');
    // Undated choice: ungradable, not guessed.
    const undated = JSON.parse(JSON.stringify(state));
    undated.decisions[0].chosen = 'Option A';
    const undatedGrade = gradePortfolioReading(record, undated, after);
    assert.equal(undatedGrade.ok, false);
    assert.match(undatedGrade.reason, /without dates/);
    // Dated choice inside the window: anyCommitted true, Brier arithmetic exact.
    const dated = JSON.parse(JSON.stringify(state));
    dated.decisions[0].chosen = 'Option A';
    dated.decisions[0].decidedOn = '2027-01-15';
    const graded = gradePortfolioReading(record, dated, after);
    assert.equal(graded.ok, true);
    assert.equal(graded.anyCommitted, true);
    assert.ok(Math.abs(graded.brier - (0.556 - 1) ** 2) < 1e-4, 'Brier is the rounded squared error of the frozen probability');
    const twice = gradePortfolioReading(graded.record || record, dated, after);
    // (the engine stamps graded on the caller's copy through the api; the pure
    // function re-grades identically, the STORE enforces once — see below)
    assert.equal(twice.ok, true, 'the pure function is stateless; the one-shot rule is the store contract');
    // All members gone: ungradable rather than guessed.
    const emptied = JSON.parse(JSON.stringify(state));
    emptied.decisions = [];
    const gone = gradePortfolioReading(record, emptied, after);
    assert.equal(gone.ok, false);
    assert.match(gone.reason, /gone from the workspace/);
  });

  test('the store freezes once per day, caps the ledger and grades exactly once', () => {
    const { store, api } = harness();
    const first = api.freezeDeferralPortfolio('USD');
    assert.equal(first.ok, true, first.error || first.reason);
    const record = store.state.deferralPortfolioReadings[0];
    assert.equal(record.graded, null);
    const sameDay = api.freezeDeferralPortfolio('USD');
    assert.equal(sameDay.ok, false);
    assert.match(sameDay.reason || sameDay.error || '', /already frozen today/);
    // Too few members after one call is decided: the true reason surfaces.
    assert.equal(api.decideDecision('d-a', { chosen: 'Option A' }).ok, true);
    const thin = api.freezeDeferralPortfolio('USD');
    assert.equal(thin.ok, false);
    assert.match(thin.reason || thin.error || '', /at least 2 priced open calls/);
    // Grade through the api: one-shot enforced on the record.
    let clock = NOW;
    const { store: s2, api: a2 } = harness(fixture({ rho: 0.9 }), () => clock);
    const rid = a2.freezeDeferralPortfolio('USD').id;
    clock = new Date('2027-02-01T10:00:00.000Z');
    const g1 = a2.gradeDeferralPortfolioReading(rid);
    assert.equal(g1.ok, true);
    assert.equal(g1.grade.anyCommitted, false);
    assert.equal(g1.grade.brier, 0.3091, 'no commit against a 55.6% forecast');
    const g2 = a2.gradeDeferralPortfolioReading(rid);
    assert.equal(g2.ok, false);
    assert.match(g2.reason || g2.error || '', /scored once/);
    assert.equal(s2.state.deferralPortfolioReadings[0].graded.brier, 0.3091);
  });

  test('calibration is withheld below five graded readings', () => {
    const state = fixture({ rho: 0.9 });
    const report = portfolioDeferralReport(state, NOW, state.settings);
    assert.match(report.calibration.verdict, /skill is refused/i);
    assert.equal(report.calibration.graded, 0);
    assert.equal(report.calibration.skill, null);
  });
});

/* ------------------------------------------------- cross-module propagation */

describe('RULE-DPO-01..04: one freeze propagates across every module', () => {
  test('RULE-DPO-01: a freeze links the reading to every member call and the stressed premise, and warns on concentration', () => {
    const { store, api } = harness(fixture({ rho: 0.9, concentration: 50 }));
    const frozen = api.freezeDeferralPortfolio('USD');
    assert.equal(frozen.ok, true);
    const rid = frozen.id;
    const links = (store.state.links || []).filter((l) => l.sourceType === 'portfolioreading' && l.sourceId === rid);
    assert.equal(links.filter((l) => l.relation === 'aggregates-deferral' && l.targetType === 'decision').length, 2, 'every member call is linked');
    assert.deepEqual(links.filter((l) => l.relation === 'aggregates-deferral').map((l) => l.targetId).sort(), ['d-a', 'd-b']);
    assert.equal(links.filter((l) => l.relation === 'stresses-premise' && l.targetType === 'premise' && l.targetId === 'prem-1').length, 1, 'the shared premise is linked');
    for (const l of links) assert.ok(l.ruleId && l.ruleId.includes('RULE-DPO-01'), 'every edge is attributable to the rule that wrote it');
    const tasks = (store.state.delegations || []).filter((t) => String(t.support || '').includes('RULE-DPO-01'));
    assert.equal(tasks.length, 1, 'concentration above the 50% convention opens exactly one watch task');
    assert.match(tasks[0].title, /concentration/i);
    // The nav-visible record: resolveLinkedEntity resolves the reading.
    const described = resolveLinkedEntity(store.state, 'portfolioreading', rid);
    assert.ok(described && described.title, 'a frozen reading is a first-class navigable entity');
    assert.match(described.route, /#\/deferral\?panel=portfolio/);
  });

  test('the pause switch stops freeze-driven writes but never stops an explicit scan', () => {
    const state = fixture({ rho: 0.9, concentration: 50 });
    state.settings.deferralPortfolioAutoPropagate = false;
    const { store, api } = harness(state);
    assert.equal(api.freezeDeferralPortfolio('USD').ok, true);
    assert.equal((store.state.links || []).filter((l) => l.sourceType === 'portfolioreading').length, 0, 'no automatic edges while paused');
    assert.equal((store.state.delegations || []).filter((t) => String(t.support || '').includes('RULE-DPO-01')).length, 0);
    assert.equal(api.scanDeferralPortfolio().ok, true, 'an explicit scan is always allowed');
  });

  test('RULE-DPO-02: an expired window opens one governed decision per week, linked to the reading, plus due grading work', () => {
    let clock = NOW;
    const { store, api } = harness(fixture({ rho: 0.9 }), () => clock);
    api.freezeDeferralPortfolio('USD');
    clock = new Date('2027-03-01T10:00:00.000Z');
    assert.equal(api.scanDeferralPortfolio().ok, true);
    const decisions = (store.state.decisions || []).filter((d) => String(d.rationale || '').includes(DEFERRAL_PORTFOLIO_RULE_IDS.SCAN));
    assert.equal(decisions.length, 1);
    assert.match(decisions[0].title, /expired/i);
    assert.match(decisions[0].rationale, /Opened by RULE-DPO-02/, 'the audit trail attributes the write to the rule that fired');
    assert.ok((store.state.links || []).some((l) => l.relation === 'surfaces-impact' && String(l.ruleId).includes(DEFERRAL_PORTFOLIO_RULE_IDS.SCAN)), 'the reading is linked to the governing decision');
    const grading = (store.state.delegations || []).filter((t) => String(t.support || '').includes(`${DEFERRAL_PORTFOLIO_RULE_IDS.SCAN}:grade`));
    assert.equal(grading.length, 1, 'one owned task to grade the due reading');
    const again = api.scanDeferralPortfolio();
    assert.equal(again.ok, true);
    assert.equal((store.state.decisions || []).filter((d) => String(d.rationale || '').includes(DEFERRAL_PORTFOLIO_RULE_IDS.SCAN)).length, 1, 'idempotent within the ISO week');
  });

  test('RULE-DPO-02: the scan reconciles stale edges instead of leaving orphans', () => {
    let clock = NOW;
    const { store, api } = harness(fixture({ rho: 0.9 }), () => clock);
    const rid = api.freezeDeferralPortfolio('USD').id;
    const before = (store.state.links || []).filter((l) => l.sourceType === 'portfolioreading').length;
    assert.ok(before >= 3);
    api.deleteDeferralPortfolioReading(rid);
    assert.equal(api.scanDeferralPortfolio().ok, true);
    assert.equal((store.state.links || []).filter((l) => l.sourceType === 'portfolioreading').length, 0, 'edges pointing at a deleted reading are collected');
  });

  test('RULE-DPO-03: a graded surprise opens one blameless process task', () => {
    let clock = NOW;
    const { store, api } = harness(fixture({ rho: 0.9 }), () => clock);
    const rid = api.freezeDeferralPortfolio('USD').id;
    clock = new Date('2027-02-01T10:00:00.000Z');
    const graded = api.gradeDeferralPortfolioReading(rid);
    assert.equal(graded.ok, true);
    assert.ok(graded.grade.brier >= 0.25, 'a 55.6% forecast that misses is a surprise by convention');
    const tasks = (store.state.delegations || []).filter((t) => String(t.support || '').includes(DEFERRAL_PORTFOLIO_RULE_IDS.GRADE));
    assert.equal(tasks.length, 1);
    assert.match(tasks[0].title, /missed deferral-portfolio forecast/i);
    assert.match(tasks[0].description || tasks[0].support || '', /never a rating of a person|not about anyone/i);
  });

  test('RULE-DPO-04: premise movement challenges every reading resting on it — appended, never rewritten', () => {
    const { store, api } = harness(fixture({ rho: 0.9 }));
    const rid = api.freezeDeferralPortfolio('USD').id;
    const frozen = () => store.state.deferralPortfolioReadings.find((r) => r.id === rid);
    const before = { cvar: frozen().cvar, predicted: frozen().predictedAnyCommitPct };
    assert.equal(api.recordPremiseEvidence('prem-1', { title: 'Vendor raised the band', direction: 'against', strength: 'moderate', observedOn: '2026-10-30' }).ok, true);
    const after = frozen();
    assert.equal(after.challengeNotes.length, 1);
    assert.match(after.challengeNotes[0], /Challenged 2026-10-31/);
    assert.equal(after.cvar, before.cvar, 'the frozen figures stand as history');
    assert.equal(after.predictedAnyCommitPct, before.predicted);
    // A second evidence event appends nothing new for the same premise (the
    // note already stands) but the premise keeps its own history.
    api.recordPremiseEvidence('prem-1', { title: 'Second vendor confirms', direction: 'against', strength: 'weak', observedOn: '2026-10-31' });
    assert.equal(frozen().challengeNotes.length, 1, 'one challenge note per reading per premise');
  });

  test('RULE-DPO-04: a breached premise opens exactly one re-price decision per week', () => {
    const { store, api } = harness(fixture({ rho: 0.9 }));
    api.freezeDeferralPortfolio('USD');
    assert.equal(api.recordPremiseEvidence('prem-1', { title: 'Band broken outright', direction: 'against', strength: 'strong', observedOn: '2026-10-30' }).ok, true);
    assert.equal(api.recordPremiseEvidence('prem-1', { title: 'Second vendor confirms', direction: 'against', strength: 'strong', observedOn: '2026-10-31' }).ok, true);
    const premise = store.state.premises[0];
    assert.equal(premise.status, 'breached');
    const reprice = (store.state.decisions || []).filter((d) => String(d.rationale || '').includes(DEFERRAL_PORTFOLIO_RULE_IDS.PREMISE));
    assert.equal(reprice.length, 1);
    assert.match(reprice[0].title, /re-price the book/i);
    assert.match(reprice[0].rationale, /Opened by RULE-DPO-04/);
    assert.equal(api.recordPremiseEvidence('prem-1', { title: 'Third confirmation', direction: 'against', strength: 'moderate', observedOn: '2026-10-31' }).ok, true);
    assert.equal((store.state.decisions || []).filter((d) => String(d.rationale || '').includes(DEFERRAL_PORTFOLIO_RULE_IDS.PREMISE)).length, 1, 'idempotent within the ISO week');
    assert.ok(reprice[0].options.length >= 3, 'the rule frames real options; it never chooses');
  });

  test('the rule is registered in the engine with a contract, before the modules that read its edges', () => {
    const contract = PROPAGATION_CONTRACTS.find((c) => c.rule && c.rule.id === 'deferralPortfolio');
    assert.ok(contract, 'a propagation contract is published');
    assert.equal(contract.module, 'deferralPortfolioRules.js');
    assert.ok(Array.isArray(contract.writes) && contract.writes.length >= 4, 'the contract declares every collection it may write');
    assert.ok(contract.writes.includes('links') && contract.writes.includes('delegations') && contract.writes.includes('decisions'));
    const registered = DEFAULT_POST_COMMIT_RULES.map((r) => r.id || r.name);
    assert.ok(registered.includes('deferralPortfolio'), 'the rule runs on every committed event');
    const index = DEFAULT_POST_COMMIT_RULES.findIndex((r) => r.id === 'deferralPortfolio');
    const tempo = DEFAULT_POST_COMMIT_RULES.findIndex((r) => (r.id || r.name) === 'decisionTempo');
    assert.ok(index >= 0 && (tempo === -1 || index < tempo), 'portfolio edges exist before downstream readers');
  });
});

/* ------------------------------------------------------------ signals */

describe('signals read frozen facts, not live renders', () => {
  test('no readings, no findings — and no simulation on the badge path', () => {
    const state = fixture({ rho: 0.9 });
    const findings = portfolioDeferralSignals(state, NOW, state.settings);
    assert.deepEqual(findings, []);
  });

  test('due grading, concentration, joint lapse and expiry each surface once, citing the reading', () => {
    let clock = NOW;
    const { store, api } = harness(fixture({ rho: 0.9, concentration: 50 }), () => clock);
    api.freezeDeferralPortfolio('USD');
    let findings = portfolioDeferralSignals(store.state, NOW, store.state.settings);
    const ids = findings.map((f) => f.ruleId);
    assert.ok(ids.includes('DPO-02'), 'topContributionShare 0.576 ≥ the 50% convention');
    assert.ok(ids.includes('DPO-03'), 'worstJointLapseExcessPp 17.9 ≥ the 10pp convention');
    for (const f of findings) {
      assert.match(f.evidence[0], /dpo-a-/, 'evidence cites the frozen reading id');
      assert.equal(f.domain, 'Deferral portfolio');
      assert.ok(f.action.route.includes('#/deferral?panel=portfolio'));
      assert.ok(f.severity >= 1 && f.severity <= 5);
    }
    clock = new Date('2027-02-01T10:00:00.000Z');
    findings = portfolioDeferralSignals(store.state, clock, store.state.settings);
    assert.ok(findings.some((f) => f.ruleId === 'DPO-01'), 'the review date arrived: grade it');
    assert.ok(findings.some((f) => f.ruleId === 'DPO-04'), 'the window expired with calls still open');
    const domain = buildInsights(store.state, clock);
    const mine = domain.findings.filter((s) => s.domain === 'Deferral portfolio');
    assert.ok(mine.length >= 2, 'the insights terminal carries the domain');
    assert.ok(DOMAIN_ORDER.includes('Deferral portfolio'));
  });
});

/* -------------------------------------------------------------- brief */

describe('the Save-book brief is deterministic and identity-free', () => {
  test('no names, no titles, stable across calls', () => {
    const state = fixture({ rho: 0.9 });
    const report = portfolioDeferralReport(state, NOW, state.settings);
    const brief = portfolioDeferralBrief(report, NOW);
    const text = typeof brief === 'string' ? brief : brief.text;
    for (const secret of ['Commit d-a', 'Commit d-b', 'Rae Mensah', 'Platform cost band holds']) {
      assert.ok(!text.includes(secret), `the brief must not leak identities (${secret})`);
    }
    assert.match(text, /DEFERRAL PORTFOLIO · 2026-10-31/);
    assert.match(text, /Σ premium USD 3,202.77/);
    assert.match(text, /additive under any correlation/);
    const again = portfolioDeferralBrief(portfolioDeferralReport(fixture({ rho: 0.9 }), NOW, state.settings), NOW);
    const againText = typeof again === 'string' ? again : again.text;
    assert.equal(againText, text, 'same state, same brief');
  });
});

/* ---------------------------------------------------------------- CSV */

describe('CSV scope #59: deferral-portfolio', () => {
  test('the scope is registered after the per-call terminal', () => {
    const scope = CSV_EXPORTS.find((s) => s.key === 'deferral-portfolio');
    assert.ok(scope, 'scope #59 exists');
    assert.equal(CSV_EXPORTS.length, 67);
    const droIndex = CSV_EXPORTS.findIndex((s) => s.key === 'deferral-option');
    assert.ok(CSV_EXPORTS.indexOf(scope) > droIndex);
  });

  test('below five frozen readings the export is blank; at five it prints per-currency aggregates without identities', () => {
    const state = fixture({ rho: 0.9 });
    const empty = exportWorkspaceCsv(state, 'deferral-portfolio', { now: NOW });
    assert.ok(empty.ok, empty.error);
    const emptyParsed = parseCsv(empty.csv);
    assert.equal(emptyParsed.rows.length, 0, 'withheld below the k-anonymity floor');
    let clock = new Date('2026-10-31T10:00:00.000Z');
    let seq = 0;
    const store = createStore({ storage: storage(), now: () => clock, idFactory: (p) => `${p}-csv-${++seq}` });
    store.load();
    const api = createApi(store, { now: () => clock, idFactory: (p) => `${p}-csv-a-${++seq}` });
    assert.equal(store.importJSON(JSON.stringify(state), { now: clock }).ok, true);
    for (let day = 1; day <= 5; day += 1) {
      clock = new Date(`2026-11-${String(day).padStart(2, '0')}T10:00:00.000Z`);
      const frozen = api.freezeDeferralPortfolio('USD');
      assert.equal(frozen.ok, true, `day ${day}: ${frozen.reason || frozen.error || ''}`);
    }
    const exported = exportWorkspaceCsv(store.state, 'deferral-portfolio', { now: clock });
    assert.ok(exported.ok, exported.error);
    const { headers, rows } = parseCsv(exported.csv);
    assert.ok(rows.length >= 1);
    assert.ok(headers.includes('currency_code'));
    assert.ok(headers.includes('reading_count'));
    assert.ok(headers.includes('mean_cvar'));
    const body = JSON.stringify(rows);
    for (const secret of ['d-a', 'd-b', 'Commit', 'Rae']) {
      assert.ok(!body.includes(secret), `the aggregate export must not carry member identities (${secret})`);
    }
  });
});

/* --------------------------------------------------------------- demo */

describe('the demo workspace ships a coupled book, not a blank screen', () => {
  test('two priced calls are coupled to one premise by tests links, with one declared ρ and no pre-frozen reading', () => {
    const state = normalizeState(buildDemoState(NOW), { now: NOW }).state;
    // 12 after Schema v76: the counterfactual terminal's demo record seeds ten
    // assumptions of its own. The deferral seed still adds none of its own.
    const cfpPremises = state.premises.filter((p) => String(p.id).startsWith('cfp-demo-premise-')).length;
    assert.equal(state.premises.length - cfpPremises, 2, 'the deferral demo still gains no premise of its own');
    const dpoLinks = (state.links || []).filter((l) => l.sourceType === 'decision' && l.targetType === 'premise' && String(l.ruleId || '') === 'demo-seed');
    assert.equal(dpoLinks.length, 2);
    assert.ok(dpoLinks.every((l) => l.relation === 'tests'), 'the seed couples through tests, which attention-market does not read as sharing');
    assert.deepEqual([...new Set(dpoLinks.map((l) => l.targetId))], ['premise-demo-prem-1']);
    assert.equal(state.correlationDeclarations.length, 1);
    assert.equal(state.correlationDeclarations[0].rho, 0.45);
    assert.equal(state.deferralPortfolioReadings.length, 0, 'no forecast is pre-frozen: forecasts are earned, not seeded');
    const report = portfolioDeferralReport(state, NOW, state.settings);
    const usd = report.portfolios.find((p) => p.currency === 'USD');
    assert.ok(usd, 'the demo book prices');
    assert.ok(!usd.refusal, `the declared ρ covers the coupled pair (${usd.refusal || ''})`);
    assert.equal(usd.memberCount, 4);
    assert.equal(usd.simulation.premises.length, 1);
    assert.ok(usd.simulation.premises[0].memberCount === 2);
  });
});

/* ----------------------------------------------------------------- UI */

describe('the portfolio panel is a terminal, not a form', () => {
  function renderDom(state, hash) {
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
        scanDeferralPortfolio: () => ({ ok: true, changed: false }),
        freezeDeferralPortfolio: () => ({ ok: true, id: 'dpo-x' }),
        gradeDeferralPortfolioReading: () => ({ ok: true, grade: { brier: 0.2 } }),
        deleteDeferralPortfolioReading: () => ({ ok: true }),
        deferralRead: () => ({}),
        deferralPortfolioRead: () => portfolioDeferralReport(state, NOW, state.settings),
      },
      route: pathPart,
    };
    window.document.getElementById('view').appendChild(renderDeferralOption(ctx));
    return dom;
  }

  test('routes and aliases reach the portfolio tab', () => {
    assert.equal(parseRoute('#/deferral?panel=portfolio').route, 'deferral');
    assert.equal(parseRoute('#/deferral-portfolio').route, 'deferral');
    assert.equal(parseRoute('#/correlation').route, 'deferral');
    assert.equal(parseRoute('#/joint-lapse').route, 'deferral');
    const html = fs.readFileSync(path.join(ROOT, 'app/main.js'), 'utf8');
    assert.match(html, /route: 'deferral'/);
    assert.match(html, /deferral-portfolio/);
  });

  test('the declared book renders one h1, well-formed tables and axe-clean markup', async () => {
    const state = fixture({ rho: 0.9 });
    const dom = renderDom(state, '#/deferral?panel=portfolio');
    const { document } = dom.window;
    assert.equal(document.querySelectorAll('h1').length, 1);
    assert.ok(document.body.textContent.includes('Deferral Option'));
    assert.ok(document.body.textContent.includes('Diversification credit'));
    for (const table of document.querySelectorAll('table')) {
      const headers = table.querySelectorAll('thead th').length;
      assert.ok(table.getAttribute('aria-label'), 'every table announces its purpose');
      for (const row of table.querySelectorAll('tbody tr')) {
        assert.equal(row.querySelectorAll('td').length, headers, 'no ragged rows');
      }
    }
    dom.window.eval(AXE_SRC);
    const result = await dom.window.axe.run(dom.window.document.getElementById('view'), { rules: { 'color-contrast': { enabled: false } } });
    assert.deepEqual(Array.from(result.violations).map((v) => v.id), []);
    dom.window.close();
  });

  test('the undeclared book renders the refusal, not an invented number', () => {
    const state = fixture({ rho: null });
    const dom = renderDom(state, '#/deferral?panel=portfolio');
    const text = dom.window.document.body.textContent;
    assert.match(text, /no declared correlation/);
    assert.match(text, /invented fact/);
    dom.window.close();
  });

  test('a typed link to one reading focuses that record, not the top of the list', () => {
    let clock = NOW;
    const { store, api } = harness(fixture({ rho: 0.9 }), () => clock);
    const frozen = api.freezeDeferralPortfolio('USD');
    assert.equal(frozen.ok, true);
    const rid = frozen.id;
    const state = JSON.parse(JSON.stringify(store.state));
    const dom = renderDom(state, `#/deferral?panel=portfolio&reading=${encodeURIComponent(rid)}`);
    const focused = dom.window.document.getElementById('focused-portfolio-reading');
    assert.ok(focused, 'the focused reading card is addressable');
    assert.match(focused.textContent, /focused/);
    dom.window.close();
  });
});

/* --------------------------------------------------- api surface */

describe('the api surface is wired', () => {
  test('every portfolio action is exported on the api object', () => {
    const { api } = harness();
    for (const name of ['declareCorrelation', 'removeCorrelation', 'scanDeferralPortfolio', 'freezeDeferralPortfolio', 'gradeDeferralPortfolioReading', 'deleteDeferralPortfolioReading', 'deferralPortfolioRead', 'deferralPortfolioBriefText']) {
      assert.equal(typeof api[name], 'function', `${name} must be callable from the UI`);
    }
    assert.equal(api.declareCorrelation('d-a', 'd-b', 0.5).ok, true);
    assert.equal(api.declareCorrelation('d-a', 'd-b', 0.5).ok, true, 're-declaring the same pair is idempotent');
    assert.equal((api.deferralPortfolioRead().portfolios || []).length >= 0, true);
    assert.equal(typeof api.deferralPortfolioBriefText(), 'string');
    assert.equal(api.removeCorrelation('d-a', 'd-b').ok, true);
    assert.equal(api.declareCorrelation('d-a', 'd-b', 7).ok, false, 'ρ outside [−0.99, 0.99] is refused, not clamped');
  });
});
