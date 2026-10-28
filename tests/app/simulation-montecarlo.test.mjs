import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hashSeed,
  createSeededRng,
  sampleStandardNormal,
  sampleGamma,
  sampleBeta,
  sampleBetaPert,
  quantileSorted,
  simulatePortfolio,
  simulateChangeJCurve,
  simulateJointWorkspace,
} from '../../app/core/domain/simulation.js';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createEmptyState, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildDemoState } from '../../app/core/demo.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { AUTOMATION_RULES } from '../../app/core/domain/automation.js';

const NOW = new Date('2026-10-25T10:00:00.000Z');
const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const flush = () => new Promise((r) => setTimeout(r, 15));

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

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

test('simulation primitives: Mulberry32 PRNG and Marsaglia–Tsang Beta-PERT are reproducible and match theoretical moments', () => {
  assert.equal(SCHEMA_VERSION, 41);
  const s1 = hashSeed(42);
  const s2 = hashSeed(42);
  const s3 = hashSeed(43);
  assert.equal(s1, s2);
  assert.notEqual(s1, s3);

  const rngA = createSeededRng(42);
  const rngB = createSeededRng(42);
  for (let i = 0; i < 50; i += 1) {
    const a = rngA();
    const b = rngB();
    assert.equal(a, b, 'same seed yields identical stream');
    assert.ok(a >= 0 && a < 1, 'uniform in [0, 1)');
  }

  // Degenerate point-mass PERT (O == M == P) returns exact value without NaN
  const rngDeg = createSeededRng(7);
  assert.equal(sampleBetaPert(rngDeg, { optimistic: 8, mostLikely: 8, pessimistic: 8 }), 8);

  // Right-skewed Beta-PERT(4, 10, 28): theoretical mean = (4 + 40 + 28)/6 = 12.0
  const rng = createSeededRng(20261025);
  const draws = new Float64Array(4000);
  let sum = 0;
  for (let i = 0; i < draws.length; i += 1) {
    const v = sampleBetaPert(rng, { optimistic: 4, mostLikely: 10, pessimistic: 28 });
    assert.ok(v >= 4 && v <= 28, `Beta-PERT draw ${v} stays bounded in [O, P]`);
    draws[i] = v;
    sum += v;
  }
  const empiricalMean = sum / draws.length;
  assert.ok(Math.abs(empiricalMean - 12) < 0.25, `empirical mean ${empiricalMean} close to theoretical 12.0`);

  const sorted = Array.from(draws).sort((a, b) => a - b);
  const p50 = quantileSorted(sorted, 0.5);
  const p90 = quantileSorted(sorted, 0.9);
  assert.ok(p90 > empiricalMean && empiricalMean > p50, 'right-skewed PERT has P90 > mean > median');

  // Sanity check standard normal, gamma (<1 and >1 shape), and beta bounds
  const z = sampleStandardNormal(rng);
  assert.ok(Number.isFinite(z));
  assert.ok(sampleGamma(rng, 0.45) > 0);
  assert.ok(sampleGamma(rng, 3.5) > 0);
  const betaVal = sampleBeta(rng, 2, 5);
  assert.ok(betaVal >= 0 && betaVal <= 1);
});

test('simulatePortfolio: detects Savage Flaw-of-Averages overload trap and Critical-Chain owner bottleneck', () => {
  const base = createEmptyState(NOW.toISOString());
  base.settings.planningHorizonWeeks = 4;
  base.settings.capacityHoursPerWeek = 32; // 16 gross days/person; after 25% reserve => 12 allocatable days/person => 24d total
  base.settings.operationalLoadPct = 25;
  base.settings.simulationSeed = 101;
  base.settings.simulationTrials = 1500;
  base.people = [
    { id: 'p-1', name: 'Ada Lovelace', role: 'Staff Engineer', startDate: '2024-01-10', status: 'active' },
    { id: 'p-2', name: 'Grace Hopper', role: 'Senior Engineer', startDate: '2024-02-10', status: 'active' },
  ];
  // Expected PERT = (6 + 4*8 + 25)/6 = 63/6 = 10.5d each -> 21.0d expected <= 24.0d allocatable (87.5% deterministic!)
  // Wait: because mode=8 is heavily skewed toward pessimistic=25, check tail risk & owner bottleneck when both assigned to Ada!
  // And add a 3rd small skewed item (1 + 4*1.5 + 14)/6 = 3.5d -> total expected = 24.5 or keep expected = 23.5 <= 24.0!
  // Let's set two items with O=7, M=8, P=29 -> expected = (7+32+29)/6 = 11.33d each => 22.67d <= 24.0d (94.4% deterministic),
  // yet right-skewed draws exceed 24.0d in the majority of trials when skewed or with 3 items!
  base.portfolio = [
    {
      id: 'pf-1',
      title: 'Ledger schema migration',
      kind: 'project',
      status: 'open',
      decision: 'funded',
      decisionOn: '2026-10-20',
      rationale: 'Funded Q4 priority',
      ownerId: 'p-1',
      effortDays: { optimistic: 8, mostLikely: 9, pessimistic: 23 }, // expected = 11.17d
      value: { optimistic: 35000, mostLikely: 50000, pessimistic: 65000 },
      targetOn: '2026-11-12',
    },
    {
      id: 'pf-2',
      title: 'Idempotency replay guard',
      kind: 'project',
      status: 'open',
      decision: 'funded',
      decisionOn: '2026-10-20',
      rationale: 'Funded Q4 priority',
      ownerId: 'p-1',
      effortDays: { optimistic: 8, mostLikely: 9, pessimistic: 26 }, // expected = 11.67d -> sum = 22.83d <= 24d!
      value: { optimistic: 25000, mostLikely: 40000, pessimistic: 55000 },
      targetOn: '2026-11-14',
    },
  ];
  const { state } = normalizeState(base, NOW);

  const sim1 = simulatePortfolio(state, { now: NOW, seed: 101, trials: 1500 });
  const sim2 = simulatePortfolio(state, { now: NOW, seed: 101, trials: 1500 });
  assert.deepEqual(sim1, sim2, 'identical seed yields bit-for-bit identical portfolio simulation');

  assert.equal(sim1.available, true);
  assert.ok(sim1.deterministicUtilisation <= 1, `deterministic utilisation ${sim1.deterministicUtilisation} looks feasible (<= 100%)`);
  assert.ok(sim1.overloadProbability > 0.35, `Monte Carlo surfaces hidden tail overload (${sim1.overloadProbability})`);
  assert.ok(sim1.bottleneckCompletion.slipDaysVsTeamP80 >= 7, `Ada owning both items creates Critical-Chain P80 slip (${sim1.bottleneckCompletion.slipDaysVsTeamP80}d)`);
  assert.equal(sim1.bottleneckCompletion.topBottlenecks[0].personId, 'p-1');
  assert.equal(sim1.drivers[0].id, 'pf-2', 'wider-spread item ranks first in Pearson variance sensitivity');
});

test('simulateJointWorkspace: couples portfolio overload into active Change J-curve valley and payback quantiles', () => {
  const demo = buildDemoState(NOW);
  const joint = simulateJointWorkspace(demo, { seed: 42, trials: 1000, now: NOW });
  assert.equal(joint.portfolio.available, true);
  assert.ok(joint.openChangeSimulations.length >= 1);

  const billingChange = demo.changes.find((c) => /Billing/i.test(c.title)) || demo.changes[0];
  const coupled = joint.changesById[billingChange.id];
  assert.equal(coupled.available, true);
  assert.equal(coupled.coupledWithCapacity, true);
  assert.ok(coupled.congestionStretchProbability > 0, 'portfolio congestion stretches active change transition valley in overloaded trials');
  assert.ok(
    coupled.paybackMonths.p80 >= coupled.paybackMonths.deterministic,
    `coupled P80 payback (${coupled.paybackMonths.p80} mo) >= naive deterministic (${coupled.paybackMonths.deterministic} mo)`,
  );
  assert.equal(coupled.months.length, coupled.horizonMonths + 1);
});

test('RULE-CAP-05 & SIM-01/SIM-02: propagates goal tail-risk check-in and Flaw-of-Averages DACI decision idempotently', () => {
  assert.ok(AUTOMATION_RULES.some((r) => r.id === 'RULE-CAP-05'), 'RULE-CAP-05 registered in AUTOMATION_RULES');

  const store = createStore({ storage: memoryStorage(), now: () => NOW });
  store.load();
  const api = createApi(store, { now: () => NOW });

  // Configure 1 person -> 16 gross days -> 25% reserve => 12.0 allocatable person-days
  api.updateSettings({
    planningHorizonWeeks: 4,
    capacityHoursPerWeek: 32,
    operationalLoadPct: 25,
    simulationSeed: 77,
    simulationTrials: 1000,
  });

  const pRes = api.addPerson({ name: 'Linus Torvalds', role: 'Principal Engineer', startDate: '2024-01-15' });
  assert.equal(pRes.ok, true);

  const gRes = api.addGoal({
    title: 'Zero-downtime multi-region failover',
    ownerId: pRes.id,
    horizon: 'Q4 2026',
    dueDate: '2026-11-05',
    authorship: 'joint',
  });
  assert.equal(gRes.ok, true);

  // Funded item with deterministic PERT mean = (9.5 + 4*10 + 22.5)/6 = 72/6 = 12.0d (100% <= 1.0 deterministic fit!)
  // Mode = 10, Pessimistic = 22.5 => heavily right-skewed so >65% of Beta-PERT draws exceed 12.0d!
  // Wait: Beta-PERT(9.5, 10, 22.5) actually has median ~11.6d (<50% > 12.0d)!
  // Let's check skewness: if O=2, M=13.5, P=14 -> left-skewed so median > mean (12.0d)!
  // Let's check: (2 + 4*13.8 + 14.8)/6 = (2 + 55.2 + 14.8)/6 = 72/6 = 12.0d, while mode=13.8 > 12.0d so >75% of Beta-PERT draws exceed 12.0d!!
  const itemRes = api.addPortfolioItem({
    title: 'Cross-region WAL replication cutover',
    kind: 'project',
    decision: 'funded',
    rationale: 'Top Q4 reliability priority',
    ownerId: pRes.id,
    sourceType: 'goal',
    sourceId: gRes.id,
    effortDays: { optimistic: 2, mostLikely: 13.8, pessimistic: 14.8 },
    value: { optimistic: 40000, mostLikely: 60000, pessimistic: 90000 },
    targetOn: '2026-11-02',
  });
  assert.equal(itemRes.ok, true);

  const goalAfter = store.state.goals.find((g) => g.id === gRes.id);
  const ruleCheckins = (goalAfter.checkins || []).filter((c) => c.note?.includes(`[RULE-CAP-05:${itemRes.id}]`));
  assert.equal(ruleCheckins.length, 1, 'RULE-CAP-05 logged schedule tail-risk check-in on linked goal');

  const flawDecisions = store.state.decisions.filter((d) => /Flaw-of-Averages/i.test(d.context || '') || /tail-risk/i.test(d.title || ''));
  assert.equal(flawDecisions.length, 1, 'RULE-CAP-05 opened Flaw-of-Averages DACI trade-off decision when deterministic <= 100% yet MC overload >= 65%');

  // Re-running syncCapacityPlan is strictly idempotent
  const syncAgain = api.syncCapacityPlan();
  assert.equal(syncAgain.ok, true);
  const goalAfterSecond = store.state.goals.find((g) => g.id === gRes.id);
  assert.equal(
    (goalAfterSecond.checkins || []).filter((c) => c.note?.includes(`[RULE-CAP-05:${itemRes.id}]`)).length,
    1,
    'idempotent: no duplicate goal check-in on re-sync',
  );
  assert.equal(
    store.state.decisions.filter((d) => /Flaw-of-Averages/i.test(d.context || '') || /tail-risk/i.test(d.title || '')).length,
    1,
    'idempotent: no duplicate DACI decision on re-sync',
  );

  // Insights surface SIM-01 on this Flaw-of-Averages workspace and SIM-02 on an underwater change
  api.addChange({
    title: 'High-cost premature split',
    kind: 'topology',
    status: 'active',
    summary: 'Premature pod split with heavy transition cost and weak monthly upside.',
    ownerId: pRes.id,
    economics: {
      transitionCost: 95000,
      monthlyBenefit: { optimistic: 1000, mostLikely: 2000, pessimistic: 3500 },
      horizonMonths: 12,
    },
  });

  const insights = buildInsights(store.state, NOW);
  assert.ok(insights.findings.some((f) => f.ruleId === 'SIM-01'), 'SIM-01 surfaces portfolio tail/bottleneck risk');
  assert.ok(insights.findings.some((f) => f.ruleId === 'SIM-02'), 'SIM-02 surfaces underwater J-curve risk');
});

test('UI: #/capacity and #/changes/:id render Monte Carlo charts, update simulation settings, and stay error-free', async () => {
  const env = bootDom();
  try {
    const { createApp } = await import('../../app/main.js');
    const app = createApp({ storage: env.window.localStorage, now: () => NOW });
    app.ctx.loadDemo();
    app.ctx.navigate('#/capacity');
    await flush();

    const mcCard = env.document.querySelector('[data-testid="capacity-montecarlo-card"]');
    assert.ok(mcCard, 'Monte Carlo card rendered on #/capacity');
    assert.ok(mcCard.querySelector('svg[role="img"]'), 'accessible SVG histogram rendered');
    assert.ok(mcCard.querySelector('details table'), 'accessible fallback data table rendered inside details');

    const seedInput = env.document.getElementById('mc-seed-input');
    const trialsSelect = env.document.getElementById('mc-trials-select');
    assert.ok(seedInput && trialsSelect, 'seed & trials controls present');
    seedInput.value = '1337';
    trialsSelect.value = '500';
    mcCard.closest('.card').querySelector('form.mc-controls').dispatchEvent(
      new env.window.Event('submit', { bubbles: true, cancelable: true }),
    );
    await flush();
    assert.equal(app.ctx.state.settings.simulationSeed, 1337);
    assert.equal(app.ctx.state.settings.simulationTrials, 500);

    const changeId = app.ctx.state.changes[0].id;
    app.ctx.navigate(`#/changes/${changeId}`);
    await flush();
    const jCard = env.document.querySelector('[data-testid="change-jcurve-simulation"]');
    assert.ok(jCard, 'Coupled Satir J-curve simulation card rendered on #/changes/:id');
    assert.ok(jCard.querySelector('svg[role="img"]'), 'accessible SVG J-curve fan chart rendered');
    assert.ok(jCard.querySelector('details table'), 'accessible month-by-month J-curve table rendered');
    assert.deepEqual(env.consoleErrors, []);
  } finally {
    env.dom.window.close();
  }
});
