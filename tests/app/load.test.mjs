/**
 * tests/app/load.test.mjs — Cognitive Load & Attention Governor
 * (Session 52, Schema v34, RULE-LOAD-01..04).
 *
 *   1. Pure band/index math: thresholds, exact weights, determinism, purity.
 *   2. Monte Carlo: zero/one corners, unmeasured commitments never zero-filled,
 *      per-person seeded streams, nulls when there is nothing to measure.
 *   3. Per-person Little/Kingman queueing: throughput, median cycle, the wait
 *      formula, counts-only/provisional/learned floors and unstable ρ≥1.
 *   4. Atomic cross-module cascade through the real store: one DACI
 *      load-shedding decision + typed links + WIP/size/germane talking points,
 *      idempotency, pause semantics and marker survival through normalization.
 *   5. Policy validation, Schema v34 migration/additive defaults, signals and
 *      Insights merge, CSV scope #34 (opaque codes, no names), brief, demo.
 *   6. JSDOM + axe across all four tabs plus policy/scan interactions.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION, DEFAULT_SETTINGS } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { dayKey, addDays } from '../../app/core/time.js';
import {
  LOAD_BANDS,
  LOAD_BAND_LABELS,
  LOAD_COORDINATION_BUDGET,
  LOAD_MIN_CYCLE_SAMPLES,
  LOAD_MIN_THROUGHPUT_SAMPLES,
  LOAD_RULE_IDS,
  LOAD_RULES,
  LOAD_WEIGHTS,
  bandForIndex,
  buildLoadReport,
  loadAttentionCount,
  loadBrief,
  loadRule,
  loadSignals,
} from '../../app/core/domain/load.js';
import { buildInsights, DOMAIN_ORDER } from '../../app/core/domain/insights.js';
import { AUTOMATION_RULES } from '../../app/core/domain/automation.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const NOW = new Date('2026-10-27T10:00:00.000Z');
const TODAY = '2026-10-27';

/* --------------------------------------------------------------- fixtures */

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
  const idFactory = (prefix) => `${prefix}-ld-${++seq}`;
  const store = createStore({ storage: kvStorage(), now: () => now, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => now, idFactory }) };
}

let itemSeq = 0;
function pf(overrides = {}) {
  itemSeq += 1;
  return {
    id: `pf-l-${itemSeq}`,
    title: `Load item ${itemSeq}`,
    kind: 'project',
    horizon: 'core',
    status: 'open',
    sourceType: 'manual',
    sourceId: null,
    ownerId: null,
    effortDays: { optimistic: 5, mostLikely: 8, pessimistic: 12 },
    value: { optimistic: 0, mostLikely: 0, pessimistic: 0 },
    currency: 'USD',
    decision: 'funded',
    decisionOn: '2026-10-01',
    rationale: '',
    targetOn: null,
    createdOn: '2026-09-15',
    completedOn: null,
    releasedOn: null,
    actualEffortDays: null,
    actualValue: null,
    forecastSnapshot: null,
    createdAt: '2026-09-15T00:00:00.000Z',
    updatedAt: '2026-09-15T00:00:00.000Z',
    ...overrides,
  };
}

function person(id, overrides = {}) {
  return {
    id,
    name: `Person ${id}`,
    role: 'Engineer',
    level: 'ic',
    team: 'Platform',
    managerId: null,
    startDate: '2025-01-01',
    focus: '',
    talkingPoints: [],
    status: 'active',
    createdAt: '2025-01-01T00:00:00.000Z',
    archivedAt: null,
    ...overrides,
  };
}

function stateWith(people, portfolio, settingsPatch = {}, extra = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.people = people;
  state.portfolio = portfolio;
  state.settings = { ...state.settings, ...settingsPatch };
  Object.assign(state, extra);
  return normalizeState(state, NOW).state;
}

const onePerson = () => [person('p1')];

/* ------------------------------------------------- 1. bands and index math */

test('bands: bandForIndex follows the fixed cut-points and the leader threshold', () => {
  assert.equal(bandForIndex(0), LOAD_BANDS.HEADROOM);
  assert.equal(bandForIndex(39), LOAD_BANDS.HEADROOM);
  assert.equal(bandForIndex(40), LOAD_BANDS.MANAGED);
  assert.equal(bandForIndex(64), LOAD_BANDS.MANAGED);
  assert.equal(bandForIndex(65), LOAD_BANDS.ELEVATED);
  assert.equal(bandForIndex(79, 80), LOAD_BANDS.ELEVATED);
  assert.equal(bandForIndex(80, 80), LOAD_BANDS.SATURATED);
  assert.equal(bandForIndex(94, 80), LOAD_BANDS.SATURATED);
  assert.equal(bandForIndex(95, 80), LOAD_BANDS.OVERLOADED);
  // A workspace that lowers its policy threshold saturates earlier.
  assert.equal(bandForIndex(76, 70), LOAD_BANDS.SATURATED);
  assert.equal(bandForIndex(100, 70), LOAD_BANDS.OVERLOADED);
});

test('index: the four component scores blend with the exported weights, nothing hidden', () => {
  assert.equal(LOAD_WEIGHTS.utilization + LOAD_WEIGHTS.wip + LOAD_WEIGHTS.coordination + LOAD_WEIGHTS.commitments, 1);
  const state = stateWith(onePerson(), [pf({ ownerId: 'p1', effortDays: { optimistic: 10, mostLikely: 10, pessimistic: 10 } })]);
  const r = buildLoadReport(state, NOW);
  const p = r.people[0];
  // 10 expected days against 12.8 allocatable (16 available less 20% reserve).
  assert.equal(p.effort.allocatableDays, 12.8);
  assert.equal(p.effort.expectedEffortDays, 10);
  assert.equal(p.scores.utilization, 78);
  assert.equal(p.scores.wip, 25); // one open commitment vs twice the WIP limit
  assert.equal(p.scores.coordination, 0);
  assert.equal(p.scores.commitments, 0);
  const expectedIndex = Math.round(
    LOAD_WEIGHTS.utilization * p.scores.utilization
    + LOAD_WEIGHTS.wip * p.scores.wip
    + LOAD_WEIGHTS.coordination * p.scores.coordination
    + LOAD_WEIGHTS.commitments * p.scores.commitments,
  );
  assert.equal(p.index, expectedIndex);
  assert.equal(p.band, bandForIndex(expectedIndex, r.policy.saturationPct));
});

test('report: deterministic for identical inputs and pure (input state is not mutated)', () => {
  const state = stateWith(onePerson(), [
    pf({ ownerId: 'p1' }),
    pf({ ownerId: 'p1', effortDays: { optimistic: 1, mostLikely: 2, pessimistic: 4 } }),
  ]);
  const snapshot = JSON.stringify(state);
  const a = buildLoadReport(state, NOW);
  const b = buildLoadReport(state, NOW);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(state), snapshot, 'buildLoadReport never writes to its input');
  assert.equal(loadBrief(state, NOW), loadBrief(state, NOW));
});

test('empty workspace: an empty report, zero attention, no crash', () => {
  const state = stateWith([], []);
  const r = buildLoadReport(state, NOW);
  assert.equal(r.empty, true);
  assert.equal(r.people.length, 0);
  assert.equal(loadAttentionCount(state, NOW), 0);
  assert.deepEqual(loadSignals(state, NOW), []);
});

/* ----------------------------------------------------------- 2. Monte Carlo */

test('Monte Carlo: ample supply gives P=0; overcommitment gives P=1; deterministic per person', () => {
  const ample = stateWith(onePerson(), [pf({ ownerId: 'p1', effortDays: { optimistic: 1, mostLikely: 1, pessimistic: 1 } })]);
  const ampleReport = buildLoadReport(ample, NOW).people[0];
  assert.equal(ampleReport.mc.overloadProbability, 0);
  assert.equal(ampleReport.mc.trials, DEFAULT_SETTINGS.simulationTrials);
  assert.equal(ampleReport.mc.flagged, false);

  const huge = stateWith(onePerson(), [pf({ ownerId: 'p1', effortDays: { optimistic: 30, mostLikely: 40, pessimistic: 50 } })]);
  const hugeReport = buildLoadReport(huge, NOW).people[0];
  assert.equal(hugeReport.mc.overloadProbability, 1);
  assert.equal(hugeReport.mc.flagged, true);
  assert.equal(hugeReport.effort.utilization > 1, true);

  // Independent streams: the same triple under a different seed still yields
  // a deterministic corner, and repeat calls agree exactly.
  const reseeded = stateWith(onePerson(), [pf({ ownerId: 'p1', effortDays: { optimistic: 30, mostLikely: 40, pessimistic: 50 } })], { simulationSeed: 987654 });
  assert.equal(buildLoadReport(reseeded, NOW).people[0].mc.overloadProbability, 1);
});

test('Monte Carlo: unmeasured commitments are counted, never sampled as zero', () => {
  const state = stateWith(onePerson(), [
    pf({ ownerId: 'p1', effortDays: { optimistic: 0, mostLikely: 0, pessimistic: 0 } }),
  ]);
  const p = buildLoadReport(state, NOW).people[0];
  assert.equal(p.mc.trials, 0);
  assert.equal(p.mc.overloadProbability, null);
  assert.equal(p.mc.flagged, false);
  assert.equal(p.effort.unquantifiedCount, 1);
  assert.equal(p.effort.expectedEffortDays, 0);
  assert.equal(p.confidence, 'counts-only');
});

/* ------------------------------------------------------------- 3. queueing */

test('queue: per-person throughput, median cycle and the Kingman wait formula', () => {
  const done = [1, 2, 3, 4, 5].map((k) => pf({
    id: `pf-done-${k}`,
    ownerId: 'p1',
    status: 'done',
    decision: 'funded',
    createdOn: '2026-09-01',
    completedOn: '2026-09-11', // 10-day cycle each
    effortDays: { optimistic: 2, mostLikely: 2, pessimistic: 2 },
  }));
  // Two open, modestly sized commitments keep ρ inside the stable region.
  const open = [
    pf({ id: 'pf-open-1', ownerId: 'p1', effortDays: { optimistic: 1, mostLikely: 1, pessimistic: 1 } }),
    pf({ id: 'pf-open-2', ownerId: 'p1', effortDays: { optimistic: 1, mostLikely: 1, pessimistic: 1 } }),
  ];
  const state = stateWith(onePerson(), [...done, ...open]);
  const q = buildLoadReport(state, NOW).people[0].queue;
  assert.equal(q.samples, 5);
  assert.equal(q.confidence, 'high');
  assert.equal(q.throughputPerWeek, 0.63); // round2(5/8)
  assert.equal(q.medianCycleDays, 10);
  assert.equal(q.wip, 2);
  assert.equal(q.littleCycleWeeks, 3.17); // round2(2/0.63)
  assert.ok(q.rho !== null && q.rho < 1 && q.rho > 0);
  assert.equal(q.unstable, false);
  // Kingman (1961), c = 1 house convention: (ρ/(1−ρ))·c·Little cycle.
  assert.equal(q.waitWeeks, Math.round(((q.rho / (1 - q.rho)) * q.littleCycleWeeks) * 100) / 100);
});

test('queue: counts-only below two completions; provisional at 2–4; learned at five', () => {
  const mkDone = (n) => Array.from({ length: n }, (_, k) => pf({
    id: `pf-c-${k}`,
    ownerId: 'p1',
    status: 'done',
    decision: 'funded',
    createdOn: addDays(TODAY, -20),
    completedOn: addDays(TODAY, -10),
    effortDays: { optimistic: 1, mostLikely: 1, pessimistic: 1 },
  }));
  const open = [pf({ id: 'pf-o', ownerId: 'p1', effortDays: { optimistic: 1, mostLikely: 1, pessimistic: 1 } })];
  const zero = buildLoadReport(stateWith(onePerson(), open), NOW).people[0].queue;
  assert.equal(zero.samples, 0);
  assert.equal(zero.confidence, 'counts-only');
  assert.equal(zero.throughputPerWeek, null);
  assert.equal(zero.waitWeeks, null);

  const three = buildLoadReport(stateWith(onePerson(), [...mkDone(3), ...open]), NOW).people[0].queue;
  assert.equal(three.samples, 3);
  assert.equal(three.confidence, 'provisional');
  assert.ok(three.littleCycleWeeks !== null);

  const five = buildLoadReport(stateWith(onePerson(), [...mkDone(LOAD_MIN_THROUGHPUT_SAMPLES), ...open]), NOW).people[0].queue;
  assert.equal(five.confidence, 'high');
  assert.equal(LOAD_MIN_CYCLE_SAMPLES, 2);
});

test('queue: ρ≥1 is reported unstable with no finite wait — a fake number would be a lie', () => {
  const state = stateWith(onePerson(), [
    pf({ id: 'pf-big', ownerId: 'p1', effortDays: { optimistic: 20, mostLikely: 25, pessimistic: 30 } }),
  ]);
  const q = buildLoadReport(state, NOW).people[0].queue;
  assert.equal(q.unstable, true);
  assert.equal(q.waitWeeks, null);
});

/* ------------------------------------------------- 4. propagation (real store) */

test('cascade: saturation opens exactly one DACI load-shedding decision with typed links', () => {
  const { store, api } = harness();
  const leader = api.addPerson({ name: 'Avery Lead', role: 'Lead' });
  assert.equal(leader.ok, true);
  // A low policy threshold makes the band fire deterministically on modest load.
  const policy = api.setLoadPolicy({ saturationPct: 50 });
  assert.equal(policy.ok, true, policy.error);
  for (const k of [1, 2, 3]) {
    const res = api.addPortfolioItem({
      title: `Overload thread ${k}`, kind: 'project', horizon: 'core', ownerId: leader.id,
      effortDays: { optimistic: 6, mostLikely: 8, pessimistic: 12 },
      value: { optimistic: 1000, mostLikely: 2000, pessimistic: 3000 },
      decision: 'funded', createdOn: '2026-10-01',
    });
    assert.equal(res.ok, true, res.error);
  }
  const marker = `[${LOAD_RULE_IDS.SHED}:${leader.id}]`;
  const decisions = store.state.decisions.filter((d) => String(d.question || '').includes(marker));
  assert.equal(decisions.length, 1, 'exactly one load-shedding decision');
  const decision = decisions[0];
  assert.equal(decision.options.length, 4, 'four named load-shedding options');
  assert.ok(decision.question.includes('saturation index'));
  assert.equal(decision.driver, store.state.settings.leaderName || '');
  const links = store.state.links.filter((l) => l.ruleId === LOAD_RULE_IDS.SHED);
  assert.ok(links.length >= 1, 'typed graph links are created in the same transaction');
  assert.ok(links.some((l) => l.sourceType === 'person' && l.targetType === 'decision' && l.relation === 'involves'));
  const events = store.state.events.filter((e) => e.type === 'automation.propagated' && String(e.summary || '').includes(LOAD_RULE_IDS.SHED));
  assert.equal(events.length, 1);
});

test('cascade: RULE-LOAD-02 WIP prompt fires, then self-clears when WIP returns to the limit', () => {
  const state = stateWith(onePerson(), [
    pf({ id: 'pf-w1', ownerId: 'p1' }),
    pf({ id: 'pf-w2', ownerId: 'p1' }),
    pf({ id: 'pf-w3', ownerId: 'p1' }),
  ], { loadSaturationPct: 100 }); // keep LOAD-01 out of this test
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-t-${++seq}`;
  const ctx = { event: { type: 'load.scan' }, now: NOW, idFactory, logEvent() {} };
  loadRule(state, ctx);
  const marker = `[${LOAD_RULE_IDS.WIP}:p1]`;
  let tp = state.people[0].talkingPoints;
  assert.equal(tp.filter((t) => t.includes(marker)).length, 1);
  assert.ok(tp[0].length <= 200, 'the marker must survive the 200-character talking-point normalizer');

  // Idempotent: another scan adds nothing.
  loadRule(state, ctx);
  assert.equal(state.people[0].talkingPoints.filter((t) => t.includes(marker)).length, 1);

  // WIP back inside the convention → the prompt clears itself.
  state.portfolio = state.portfolio.slice(0, 2);
  loadRule(state, ctx);
  assert.equal(state.people[0].talkingPoints.filter((t) => t.includes(marker)).length, 0);
});

test('cascade: RULE-LOAD-03 flags commitment SIZE within the WIP limit, mutually exclusive with 02', () => {
  // One huge thread: WIP 1 (within limit 2) but certain overload.
  const state = stateWith(onePerson(), [
    pf({ id: 'pf-huge', ownerId: 'p1', effortDays: { optimistic: 30, mostLikely: 40, pessimistic: 50 } }),
  ], { loadSaturationPct: 100, loadOverloadProbPct: 80 });
  const idFactory = (prefix) => `${prefix}-sz-${Math.random().toString(36).slice(2, 8)}`;
  loadRule(state, { event: { type: 'load.scan' }, now: NOW, idFactory, logEvent() {} });
  const m03 = `[${LOAD_RULE_IDS.SIZE}:p1]`;
  const m02 = `[${LOAD_RULE_IDS.WIP}:p1]`;
  assert.ok(state.people[0].talkingPoints.some((t) => t.includes(m03)), 'size prompt queued');
  assert.ok(!state.people[0].talkingPoints.some((t) => t.includes(m02)), 'WIP prompt must not double up');

  // Shrinking the commitment below the threshold clears 03.
  state.portfolio[0].effortDays = { optimistic: 1, mostLikely: 1, pessimistic: 1 };
  loadRule(state, { event: { type: 'load.scan' }, now: NOW, idFactory, logEvent() {} });
  assert.ok(!state.people[0].talkingPoints.some((t) => t.includes(m03)), 'self-clearing once resolved');
});

test('cascade: RULE-LOAD-04 protects germane load for a ramping, elevated team member', () => {
  const ramping = person('p1', { name: 'Ramping Robin' });
  const manager = person('p2', { name: 'Manager Mia' });
  // Three reports give coordination weight; three heavy commitments max
  // utilisation and WIP so the ramping person lands in the elevated band.
  ramping.managerId = 'p2';
  const reports = ['p3', 'p4', 'p5'].map((id) => person(id, { managerId: 'p1' }));
  const state = stateWith([ramping, manager, ...reports], [
    pf({ id: 'pf-r1', ownerId: 'p1', effortDays: { optimistic: 20, mostLikely: 25, pessimistic: 30 } }),
    pf({ id: 'pf-r2', ownerId: 'p1', effortDays: { optimistic: 4, mostLikely: 6, pessimistic: 8 } }),
    pf({ id: 'pf-r3', ownerId: 'p1', effortDays: { optimistic: 3, mostLikely: 5, pessimistic: 9 } }),
  ], { loadSaturationPct: 100 }, {
    onboarding: [{
      id: 'onb-1', personId: 'p1', kind: 'role-transition', status: 'active',
      label: 'Promotion to senior', startDate: addDays(TODAY, -20),
      createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
    }],
  });
  const report = buildLoadReport(state, NOW);
  const me = report.people.find((p) => p.personId === 'p1');
  assert.equal(me.germane.ramping, true);
  assert.ok(['elevated', 'saturated', 'overloaded'].includes(me.band), `actually ${me.band} ${me.index}`);
  const idFactory = (prefix) => `${prefix}-g-${Math.random().toString(36).slice(2, 8)}`;
  loadRule(state, { event: { type: 'load.scan' }, now: NOW, idFactory, logEvent() {} });
  const marker = `[${LOAD_RULE_IDS.GERMANE}:p1]`;
  const managerPoints = state.people.find((p) => p.id === 'p2').talkingPoints;
  assert.ok(managerPoints.some((t) => t.includes(marker)), 'the in-roster manager receives the protection prompt');
  assert.ok(!state.people.find((p) => p.id === 'p1').talkingPoints.some((t) => t.includes(marker)), 'not duplicated onto the ramping person');
});

test('cascade: idempotent across repeated scans and safe while paused (explicit scan still runs)', () => {
  const { store, api } = harness();
  const leader = api.addPerson({ name: 'Pause Pat' });
  api.setLoadPolicy({ saturationPct: 50, autoPropagate: false });
  const item = () => api.addPortfolioItem({
    title: 'Paused thread', kind: 'project', horizon: 'core', ownerId: leader.id,
    effortDays: { optimistic: 6, mostLikely: 8, pessimistic: 12 }, decision: 'funded', createdOn: '2026-10-01',
  });
  item(); item(); item();
  const marker = `[${LOAD_RULE_IDS.SHED}:${leader.id}]`;
  assert.equal(store.state.decisions.filter((d) => String(d.question || '').includes(marker)).length, 0,
    'paused automation blocks event-triggered fan-out');
  const scan = api.scanLoad();
  assert.equal(scan.ok, true);
  assert.equal(store.state.decisions.filter((d) => String(d.question || '').includes(marker)).length, 1,
    'an explicit human scan runs even while paused');
  api.scanLoad();
  assert.equal(store.state.decisions.filter((d) => String(d.question || '').includes(marker)).length, 1,
    'repeated scans converge, never duplicate');
});

test('cascade: talking-point markers survive normalizeState (the 200-character boundary)', () => {
  const { store, api } = harness();
  const leader = api.addPerson({ name: 'Normalize Nils' });
  api.setLoadPolicy({ saturationPct: 50 });
  for (const k of [1, 2, 3]) {
    api.addPortfolioItem({
      title: `Boundary thread ${k}`, kind: 'project', horizon: 'core', ownerId: leader.id,
      effortDays: { optimistic: 6, mostLikely: 8, pessimistic: 12 }, decision: 'funded', createdOn: '2026-10-01',
    });
  }
  const before = store.state.people.find((p) => p.id === leader.id).talkingPoints
    .filter((t) => t.includes(LOAD_RULE_IDS.WIP));
  assert.equal(before.length, 1);
  const { state: repaired, warnings } = normalizeState(store.state, NOW);
  assert.deepEqual(warnings, []);
  const after = repaired.people.find((p) => p.id === leader.id).talkingPoints
    .filter((t) => t.includes(LOAD_RULE_IDS.WIP));
  assert.equal(after.length, 1, 'marker preserved through a reload/normalize cycle');
});

/* ------------------------------------------------- 5. policy, schema, signals */

test('policy: validation rejects out-of-range values and clamps through normalizeSettings', () => {
  const { store: policyStore, api } = harness();
  assert.equal(api.setLoadPolicy({ saturationPct: 40 }).ok, false);
  assert.equal(api.setLoadPolicy({ saturationPct: 101 }).ok, false);
  assert.equal(api.setLoadPolicy({ overloadProbPct: 100 }).ok, false);
  assert.equal(api.setLoadPolicy({ windowWeeks: 2 }).ok, false);
  assert.equal(api.setLoadPolicy({}).ok, false, 'empty patch changes nothing');
  const ok = api.setLoadPolicy({ saturationPct: 75, overloadProbPct: 85, windowWeeks: 12, autoPropagate: false });
  assert.equal(ok.ok, true);
  assert.equal(policyStore.state.settings.loadSaturationPct, 75);
  // Out-of-range numerics clamp to the documented boundary; non-numeric junk
  // falls back to the default rather than being silently stored.
  const clamped = normalizeState({ settings: { loadSaturationPct: 999, loadOverloadProbPct: -5, loadThroughputWindowWeeks: 99 } }, NOW).state;
  assert.equal(clamped.settings.loadSaturationPct, 100);
  assert.equal(clamped.settings.loadOverloadProbPct, 50);
  assert.equal(clamped.settings.loadThroughputWindowWeeks, 26);
  const repaired = normalizeState({ settings: { loadSaturationPct: 'junk', loadOverloadProbPct: 'garbage', loadThroughputWindowWeeks: NaN, loadAutoPropagate: false } }, NOW).state;
  assert.equal(repaired.settings.loadSaturationPct, DEFAULT_SETTINGS.loadSaturationPct);
  assert.equal(repaired.settings.loadOverloadProbPct, DEFAULT_SETTINGS.loadOverloadProbPct);
  assert.equal(repaired.settings.loadThroughputWindowWeeks, DEFAULT_SETTINGS.loadThroughputWindowWeeks);
  assert.equal(repaired.settings.loadAutoPropagate, false, 'an explicit pause is never coerced back on');
});

test('schema v34: migration is additive and installs only the four load settings', () => {
  assert.equal(SCHEMA_VERSION, 35);
  const migrated = migrate({ schemaVersion: 33, people: [], settings: { teamName: 'Kept' } });
  assert.equal(migrated.raw.schemaVersion, 35);
  assert.deepEqual(migrated.applied.at(-1), '34 → 35');
  assert.equal(migrated.raw.settings.teamName, 'Kept', 'existing settings are preserved');
  assert.equal(migrated.raw.settings.loadSaturationPct, 80);
  assert.equal(migrated.raw.settings.loadOverloadProbPct, 80);
  assert.equal(migrated.raw.settings.loadThroughputWindowWeeks, 8);
  assert.equal(migrated.raw.settings.loadAutoPropagate, true);
  // No rating or persisted index is invented: still no load collection.
  assert.equal(migrated.raw.cognitiveLoad, undefined);
});

test('signals: LOAD findings merge into Insights under the Load & attention domain', () => {
  const demo = buildDemoState(NOW);
  const signals = loadSignals(demo, NOW);
  assert.ok(signals.some((s) => s.ruleId === 'LOAD-01'));
  assert.ok(signals.every((s) => s.domain === 'Load & attention'));
  assert.ok(DOMAIN_ORDER.includes('Load & attention'));
  const insights = buildInsights(demo, NOW);
  assert.ok(insights.findings.some((f) => f.domain === 'Load & attention'));
  assert.ok(insights.byDomain.some((d) => d.domain === 'Load & attention'));
});

test('catalog: the four rules are registered in the automation catalog and the post-commit spine', () => {
  for (const id of Object.values(LOAD_RULE_IDS)) {
    assert.ok(LOAD_RULES.some((r) => r.id === id), `${id} documented`);
    assert.ok(AUTOMATION_RULES.some((r) => r.id === id), `${id} in the shared catalog`);
  }
  assert.equal(AUTOMATION_RULES.length, 90, '86 + RULE-PREM-01..04');
  assert.ok(DEFAULT_POST_COMMIT_RULES.some((r) => r.name === 'loadRule'));
  // Load runs before decision tempo so its DACI decision is timed in-transaction.
  assert.ok(DEFAULT_POST_COMMIT_RULES.findIndex((r) => r.name === 'loadRule')
    < DEFAULT_POST_COMMIT_RULES.findIndex((r) => r.name === 'decisionTempoRule'));
});

test('CSV scope #34: opaque per-person telemetry with no names, roles or free text', () => {
  assert.equal(CSV_EXPORTS.length, 35);
  const spec = CSV_EXPORTS.find((s) => s.key === 'load');
  assert.ok(spec);
  const demo = buildDemoState(NOW);
  const result = exportWorkspaceCsv(demo, 'load', { now: NOW });
  assert.equal(result.ok, true, result.error);
  assert.ok(!/Natarajan|Chen|Okafor|Nilsson|Alvarez/.test(result.csv), 'no roster names leak');
  const parsed = parseCsv(result.csv);
  assert.equal(parsed.rows.length, demo.people.filter((p) => p.status !== 'archived').length);
  const headers = parsed.headers;
  for (const required of ['person_code', 'band', 'saturation_index', 'overload_probability', 'queue_confidence', 'engine_version']) {
    assert.ok(headers.includes(required), `column ${required}`);
  }
  const codes = parsed.rows.map((r) => r[headers.indexOf('person_code')]);
  assert.deepEqual(codes, [...codes].sort(), 'codes are deterministic by sorted person id');
  assert.ok(codes.every((c) => /^load_person_\d+$/.test(c)));
  // Every row carries the policy and engine version, no blank identifier cells.
  assert.ok(parsed.rows.every((r) => r[headers.indexOf('saturation_threshold_pct')] === String(demo.settings.loadSaturationPct)));
});

test('brief: deterministic board pack naming the bottleneck and the caveats', () => {
  const demo = buildDemoState(NOW);
  const brief = loadBrief(demo, NOW);
  assert.equal(brief, loadBrief(demo, NOW));
  assert.match(brief, /Cognitive Load & Attention Governor brief/);
  assert.match(brief, /System constraint/);
  assert.match(brief, /not a performance rating/);
  assert.match(brief, /counts-only/);
});

test('demo: the engine has already run — one saturated person, one decision, WIP and germane prompts', () => {
  const demo = buildDemoState(NOW);
  const report = buildLoadReport(demo, NOW);
  assert.equal(report.totals.attention, 1);
  assert.equal(report.team.saturatedOrWorse, 1);
  const bottleneck = report.people.find((p) => p.bottleneck);
  assert.ok(bottleneck);
  assert.equal(bottleneck.band, LOAD_BANDS.SATURATED);
  assert.equal(demo.settings.loadSaturationPct, 70, 'demo workspace owns a visible threshold override');
  const decisions = demo.decisions.filter((d) => String(d.question || '').includes(LOAD_RULE_IDS.SHED));
  assert.equal(decisions.length, 1, 'engine-produced, not hand-written');
  assert.ok(demo.links.some((l) => l.ruleId === LOAD_RULE_IDS.SHED));
  assert.ok(demo.people.flatMap((p) => p.talkingPoints).some((t) => t.includes(LOAD_RULE_IDS.WIP)));
  assert.ok(demo.people.flatMap((p) => p.talkingPoints).some((t) => t.includes(LOAD_RULE_IDS.GERMANE)));
  // Band labels are all present in the engine vocabulary.
  assert.ok(Object.values(LOAD_BAND_LABELS).length >= 5);
  assert.equal(LOAD_COORDINATION_BUDGET, 10);
});

/* ----------------------------------------------------------------- 6. DOM */

function bootDom() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(e.message);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const css = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  const styleEl = window.document.createElement('style');
  styleEl.textContent = css;
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

async function axeViolations(env) {
  const axeSrc = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
  if (!env.window.axe) env.window.eval(axeSrc);
  const result = await env.window.axe.run(env.document.querySelector('#view'), { rules: { 'color-contrast': { enabled: false } } });
  return Array.from(result.violations).map((v) => `${v.id}: ${v.help}`);
}

test('UI: every Load Governor tab renders axe-clean on the demo workspace, policy saves and scan runs', async () => {
  const env = bootDom();
  try {
    const { createApp } = await import('../../app/main.js');
    const app = createApp({ storage: env.window.localStorage, now: () => NOW });
    app.ctx.loadDemo();
    for (const route of ['#/load', '#/load?tab=queues', '#/load?tab=coordination', '#/load?tab=policy']) {
      app.ctx.navigate(route);
      const view = env.document.querySelector('#view');
      assert.ok(view.textContent.length > 200, `${route} renders content`);
      assert.ok(!/is not a function|undefined is|NaN/.test(view.textContent), `${route} renders without an error panel`);
      assert.deepEqual(await axeViolations(env), [], `${route} axe-clean`);
    }
    app.ctx.navigate('#/load');
    assert.match(env.document.querySelector('#view').textContent, /Cognitive saturation|System constraint|Saturated/);
    assert.ok(env.document.querySelector('[href="#/load"]'), 'reachable from navigation');

    // Policy tab: change the threshold through the real validated API path.
    app.ctx.navigate('#/load?tab=policy');
    const satInput = env.document.querySelector('input[aria-label="Saturation threshold percent"]');
    assert.ok(satInput);
    satInput.value = '75';
    env.document.querySelector('#view button.btn-primary').click();
    assert.equal(app.store.state.settings.loadSaturationPct, 75);

    // Header scan button runs the idempotent engine without errors.
    app.ctx.navigate('#/load');
    const buttons = [...env.document.querySelectorAll('#view button')];
    const scan = buttons.find((b) => /run load scan/i.test(b.textContent));
    assert.ok(scan);
    scan.click();
    const markerCount = app.store.state.decisions.filter((d) => String(d.question || '').includes(LOAD_RULE_IDS.SHED)).length;
    assert.equal(markerCount, 1, 'scan does not duplicate the demo decision');
    assert.deepEqual(env.consoleErrors, [], 'no console errors');
  } finally {
    env.dom.window.close();
  }
});
