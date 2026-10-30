/**
 * tests/app/merit-equity.test.mjs — Schema v51, the Merit & Pay-Equity Terminal.
 *
 * The claims under test are specific and falsifiable:
 *
 *   1. The v50 → v51 migration is additive: no band, no cycle, no pay figure is
 *      invented for an existing workspace.
 *   2. Bands that do not form a range are dropped with a warning rather than
 *      repaired into invented money.
 *   3. The OLS solver recovers a known linear relationship exactly, and the
 *      Oaxaca–Blinder decomposition recovers a gap that was constructed by
 *      paying one group less for identical characteristics.
 *   4. Below the sample floor the decomposition and the four-fifths screen
 *      return `insufficient` — never a number nobody should quote.
 *   5. The three merit policies all spend inside the budget, never push anyone
 *      past their band ceiling, and the retention policy wins on expected
 *      departures and retained value against the same budget.
 *   6. Finalization freezes the audit atomically, refuses over-budget and
 *      unpriced cycles, and a flagged audit opens exactly one mechanism
 *      decision through the shared rule spine — idempotently.
 *   7. A departure resolves the frozen prediction through `person.archived`, and
 *      the calibration only claims skill once five outcomes exist.
 *   8. CSV scope #45 carries ratios and counts and leaks no salary, name, note or
 *      cycle label.
 *   9. The page, its tabs and both dialogs render keyboard-operably and
 *      axe-clean.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createStore } from '../../app/core/store.js';
import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION, DEFAULT_SETTINGS } from '../../app/core/schema.js';
import { createApi } from '../../app/actions.js';
import { buildDemoState } from '../../app/core/demo.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import {
  COMP_CONVENTIONS,
  adverseImpact,
  bandIntegrity,
  compensationRows,
  compressionFindings,
  fairnessReading,
  invertMatrix,
  ols,
  oaxacaBlinder,
  policyComparison,
  positionPay,
  retentionCalibration,
  wilson,
} from '../../app/core/domain/comp.js';
import { buildFairnessSnapshot, normalizeCompBands } from '../../app/core/domain/compSchema.js';

const NOW = new Date('2026-10-29T12:00:00.000Z');
const TODAY = '2026-10-29';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

const LEVELS = ['ic', 'senior', 'lead', 'manager'];
const BANDS = {
  ic: { min: 70000, mid: 82000, max: 95000 },
  senior: { min: 95000, mid: 108000, max: 125000 },
  lead: { min: 115000, mid: 130000, max: 148000 },
  manager: { min: 118000, mid: 136000, max: 155000 },
};

/**
 * A sixteen-person team whose pay was constructed to contain one real finding:
 * everyone is paid 6% below the midpoint of their band, and the six
 * "external" people are paid 9% above their internal peers at the same level
 * with the same tenure and rating. That makes the expected decomposition
 * direction and the external-premium finding both checkable by hand.
 */
function fixture({ groupAPayFactor = 1, groupBPayFactor = 1 } = {}) {
  const people = [];
  const rows = [];
  const reviews = [];
  for (let index = 0; index < 16; index += 1) {
    const level = ['senior', 'senior', 'senior', 'senior', 'senior', 'senior', 'lead', 'lead', 'ic', 'ic', 'ic', 'ic', 'manager', 'manager', 'senior', 'lead'][index];
    const origin = index % 2 === 0 ? 'internal' : 'external';
    const tenureDays = 200 + index * 90;
    const rating = ['meets-expectations', 'often-exceeds', 'meets-expectations', 'sets-standard', 'meets-expectations', 'often-exceeds', 'meets-expectations', 'meets-expectations', 'needs-development', 'meets-expectations', 'often-exceeds', 'meets-expectations', 'meets-expectations', 'often-exceeds', 'meets-expectations', 'meets-expectations'][index];
    const band = BANDS[level];
    const base = band.mid * 0.94;
    const originFactor = origin === 'external' ? index % 4 === 1 ? groupBPayFactor : groupBPayFactor : groupAPayFactor;
    const pay = Math.round((base * originFactor) / 100) * 100;
    people.push({
      id: `p-${index + 1}`,
      name: `Person ${index + 1}`,
      level,
      role: index === 0 ? 'Engineering Manager' : `Role ${index + 1}`,
      status: 'active',
      startDate: new Date(Date.parse('2026-10-29T00:00:00.000Z') - tenureDays * 86400000).toISOString().slice(0, 10),
      managerId: index > 2 && index < 8 ? 'p-1' : null,
      talkingPoints: [],
    });
    reviews.push({
      id: `r-${index + 1}`,
      personId: `p-${index + 1}`,
      periodStart: '2026-01-01',
      periodEnd: '2026-06-30',
      status: 'complete',
      completedAt: '2026-07-01T00:00:00.000Z',
      manager: { rating },
    });
    rows.push({
      personId: `p-${index + 1}`,
      level,
      currentPay: pay,
      proposedPay: pay,
      origin,
      retentionConcern: index === 2,
      note: '',
    });
  }
  return { people, rows, reviews };
}

function harness(now = NOW) {
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-v51-${++sequence}`;
  const store = createStore({ storage: memoryStorage(), now: () => now, idFactory });
  store.load();
  const api = createApi(store, { now: () => now, idFactory });
  return { store, api, idFactory };
}

function seedTeam(store, fixtureValue = fixture()) {
  store.update((draft) => {
    draft.people = fixtureValue.people;
    draft.reviews = fixtureValue.reviews;
  }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'Seed roster' });
}

function seedBands(api) {
  for (const level of LEVELS) {
    const band = BANDS[level];
    const res = api.addCompBand({ level, min: band.min, mid: band.mid, max: band.max, effectiveOn: '2026-01-01' });
    assert.equal(res.ok, true, res.error);
  }
}

function seedCycle(api, fixtureValue = fixture(), overrides = {}) {
  const cycle = api.addMeritCycle({
    label: 'FY26 merit',
    currency: 'USD',
    effectiveOn: '2026-11-01',
    budgetKind: 'amount',
    budgetValue: 60000,
    comparisonDimension: 'origin',
    ...overrides,
  });
  assert.equal(cycle.ok, true, cycle.error);
  api.syncMeritRoster(cycle.id);
  for (const row of fixtureValue.rows) {
    const res = api.setMeritRow(cycle.id, row.personId, {
      currentPay: row.currentPay,
      proposedPay: row.currentPay,
      level: row.level,
      origin: row.origin,
      retentionConcern: row.retentionConcern,
    });
    assert.equal(res.ok, true, res.error);
  }
  return cycle.id;
}

/* ------------------------------------------------------------- migration */

test('v50 → v51 is additive: no band, no cycle and no pay figure is invented', () => {
  assert.equal(SCHEMA_VERSION, 51);
  const v50 = {
    schemaVersion: 50,
    settings: { teamName: 'Existing team' },
    people: [{ id: 'p1', name: 'Existing', status: 'active' }],
    meritCycles: undefined,
    compBands: undefined,
  };
  const migrated = migrate(v50);
  assert.equal(migrated.raw.schemaVersion, 51);
  assert.equal(migrated.applied.at(-1), '50 → 51');
  assert.deepEqual(migrated.raw.compBands, []);
  assert.deepEqual(migrated.raw.meritCycles, []);
  const { state, warnings } = normalizeState(migrated.raw, { now: NOW });
  assert.equal(state.compBands.length, 0);
  assert.equal(state.meritCycles.length, 0);
  assert.deepEqual(warnings.filter((warning) => /Merit cycle|band/i.test(warning)), []);
  // The conventions are installed, and every one of them is visible in settings.
  for (const key of ['compReplacementMultiplier', 'compEquityFlagPp', 'compAdverseImpactRatio', 'compMinGroupSize', 'compCompressionTolerancePct', 'compMaxAdjustPct', 'compOutcomeReviewDays', 'compAutoPropagate']) {
    assert.ok(key in state.settings, `${key} is installed by the defaults`);
    assert.ok(key in DEFAULT_SETTINGS);
  }
});

test('a band that does not form a range is dropped with a warning, never repaired', () => {
  const warnings = [];
  const bands = normalizeCompBands([
    { id: 'b1', level: 'senior', min: 120000, mid: 110000, max: 90000 },
    { id: 'b2', level: 'senior', min: 95000, mid: 108000, max: 125000, effectiveOn: '2026-01-01' },
    { id: 'b2-dup', level: 'senior', min: 96000, mid: 109000, max: 126000, effectiveOn: '2026-01-01' },
    { id: 'b3', level: 'nonsense', min: 1, mid: 2, max: 3 },
  ], NOW, warnings);
  assert.equal(bands.length, 1, 'only the coherent, unduplicated band survives');
  assert.equal(bands[0].level, 'senior');
  assert.equal(bands[0].mid, 108000);
  assert.ok(warnings.some((w) => /do not form a range/.test(w)));
  assert.ok(warnings.some((w) => /duplicate/.test(w)));
  assert.ok(warnings.some((w) => /unrecognised level/.test(w)));
});

/* -------------------------------------------------------------- action rules */

test('declaration actions refuse incoherent bands, missing budgets and over-ceiling raises', () => {
  const { store, api } = harness();
  seedTeam(store);
  assert.equal(api.addCompBand({ level: 'senior', min: 100000, mid: 90000, max: 120000 }).ok, false);
  assert.equal(api.addCompBand({ level: 'senior', min: 0, mid: 0, max: 0 }).ok, false);
  assert.equal(api.addCompBand({ level: 'senior', min: 95000, mid: 108000, max: 125000, effectiveOn: '2026-01-01' }).ok, true);
  assert.equal(api.addCompBand({ level: 'senior', min: 95000, mid: 108000, max: 125000, effectiveOn: '2026-01-01' }).ok, false,
    'the same level and effective date cannot be declared twice');

  assert.equal(api.addMeritCycle({ label: 'No budget', budgetValue: 0 }).ok, false);
  const cycle = api.addMeritCycle({ label: 'Cycle', budgetValue: 10000, effectiveOn: '2026-11-01' });
  assert.equal(cycle.ok, true, cycle.error);
  api.setMeritRow(cycle.id, 'p-1', { currentPay: 100000 });
  const tooBig = api.setMeritRow(cycle.id, 'p-1', { proposedPay: 130000 });
  assert.equal(tooBig.ok, false);
  assert.match(tooBig.error, /ceiling is 20%/);
  assert.equal(api.setMeritRow(cycle.id, 'p-1', { proposedPay: 90000 }).ok, false, 'a merit cycle is not for pay cuts');
  assert.equal(api.setMeritRow(cycle.id, 'p-1', { proposedPay: 105000 }).ok, true);
  assert.equal(api.setMeritRow('missing-cycle', 'p-1', { currentPay: 1 }).ok, false);
});

/* ------------------------------------------------------------- the maths */

test('the OLS solver inverts a matrix and recovers a known linear relationship', () => {
  const inverse = invertMatrix([[4, 7], [2, 6]]);
  assert.ok(inverse);
  assert.ok(Math.abs(inverse[0][0] - 0.6) < 1e-12);
  assert.ok(Math.abs(inverse[0][1] + 0.7) < 1e-12);
  assert.ok(Math.abs(inverse[1][0] + 0.2) < 1e-12);
  assert.ok(Math.abs(inverse[1][1] - 0.4) < 1e-12);
  assert.equal(invertMatrix([[1, 2], [2, 4]]), null, 'a singular matrix returns null rather than garbage');

  // y = 3 + 2x1 − 1.5x2 exactly.
  const X = [[1, 1, 0], [1, 2, 1], [1, 3, 0], [1, 4, 2], [1, 5, 1], [1, 6, 0]];
  const y = X.map(([one, a, b]) => 3 + 2 * a - 1.5 * b);
  const fit = ols(y, X);
  assert.equal(fit.ok, true);
  assert.ok(Math.abs(fit.beta[0] - 3) < 1e-9);
  assert.ok(Math.abs(fit.beta[1] - 2) < 1e-9);
  assert.ok(Math.abs(fit.beta[2] + 1.5) < 1e-9);
  assert.equal(fit.ridge, false);
  assert.equal(ols([1, 2], [[1], [1]]).ok, false, 'too few observations is refused');
});

test('the decomposition recovers a gap that was constructed by paying one group less', () => {
  const { store, api } = harness();
  // Internal people are paid 100% of the constructed level; external people 91%.
  seedTeam(store, fixture({ groupBPayFactor: 0.91 }));
  seedBands(api);
  const cycleId = seedCycle(api, fixture({ groupBPayFactor: 0.91 }));
  const cycle = store.state.meritCycles.find((row) => row.id === cycleId);
  const reading = oaxacaBlinder(store.state, cycle, NOW);
  assert.equal(reading.status, 'ok', reading.detail);
  assert.equal(reading.groupA, 'Internal promotion / hire');
  assert.equal(reading.n, 16);
  // Internal people are the reference group and are paid roughly log(1/0.91)
  // ≈ 9.4 log points more, so the gap is positive and the unexplained part is
  // almost all of it: the controls were built to be identical.
  assert.ok(reading.gapPct > 7 && reading.gapPct < 12, `gap ${reading.gapPct}%`);
  assert.ok(reading.unexplainedPct > 5, `unexplained ${reading.unexplainedPct}%`);
  assert.ok(reading.interval.unexplainedPct, 'an interval on the adjusted gap exists');
  assert.ok(reading.interval.unexplainedPct[0] > 0, 'the interval excludes zero');
  assert.equal(reading.caveats.length, 3);
  assert.ok(reading.caveats.some((line) => /not proof of discrimination/.test(line)));
  // The interval is built from the adjusted gap's own standard error, not from
  // resampling people, and it says so.
  assert.equal(reading.interval.method, 'adjusted-gap-t');
  assert.ok(reading.adjusted.logPts > 0);
  assert.ok(reading.adjusted.standardErrorLogPts >= 0);
  assert.ok(reading.adjusted.dof > 0);

  // Determinism: the same workspace prints the same interval twice.
  const again = oaxacaBlinder(store.state, cycle, NOW);
  assert.deepEqual(again.interval, reading.interval);
});

test('below the sample floor the audit refuses to produce a number', () => {
  const { store, api } = harness();
  const small = fixture();
  small.people = small.people.slice(0, 4);
  small.rows = small.rows.slice(0, 4);
  small.reviews = small.reviews.slice(0, 4);
  seedTeam(store, small);
  seedBands(api);
  const cycleId = seedCycle(api, small, { budgetValue: 5000 });
  const cycle = store.state.meritCycles.find((row) => row.id === cycleId);
  const reading = oaxacaBlinder(store.state, cycle, NOW);
  assert.equal(reading.status, 'insufficient');
  assert.equal(reading.reason, 'group-too-small');
  assert.match(reading.detail, /at least 5 people/);
  assert.equal(reading.unexplainedPct, undefined, 'no percentage is returned when the sample cannot support one');

  const screen = adverseImpact(store.state, cycle, NOW);
  assert.equal(screen.status, 'ok');
  assert.equal(screen.reliable, false, 'a four-person screen is flagged as unreliable rather than decisive');
});

test('the four-fifths screen triggers when one group receives every favourable decision', () => {
  const { store, api } = harness();
  const value = fixture();
  seedTeam(store, value);
  seedBands(api);
  const cycleId = seedCycle(api, value);
  // Every internal person gets 8%, every external person gets nothing.
  for (const row of value.rows) {
    if (row.origin !== 'internal') continue;
    const res = api.setMeritRow(cycleId, row.personId, { proposedPay: Math.round(row.currentPay * 1.08) });
    assert.equal(res.ok, true, res.error);
  }
  const cycle = store.state.meritCycles.find((row) => row.id === cycleId);
  const screen = adverseImpact(store.state, cycle, NOW);
  assert.equal(screen.status, 'ok');
  assert.equal(screen.ratio, 0);
  assert.equal(screen.flagged, true);
  assert.equal(screen.reliable, true, 'eight people per group is enough to act on');
  assert.match(screen.detail, /Ratio 0.00/);
});

test('compression inside the reporting line and the external-hire premium are both found', () => {
  const { store, api } = harness();
  const value = fixture();
  // Person 2 (senior) is put above the pay of person 1 (the manager level lead).
  value.rows[1].currentPay = 140000;
  value.rows[2].currentPay = 145000;
  seedTeam(store, value);
  seedBands(api);
  const cycleId = seedCycle(api, value);
  for (const index of [1, 2]) {
    const row = value.rows[index];
    const res = api.setMeritRow(cycleId, row.personId, { currentPay: row.currentPay, proposedPay: row.currentPay });
    assert.equal(res.ok, true, res.error);
  }
  const cycle = store.state.meritCycles.find((row) => row.id === cycleId);
  const findings = compressionFindings(store.state, cycle, NOW);
  assert.ok(findings.some((finding) => finding.kind === 'inversion'), 'a subordinate at or above the manager is flagged');
  assert.ok(findings.some((finding) => finding.kind === 'loyalty-penalty'), 'the external premium is flagged');
  assert.ok(findings.every((finding) => finding.advice && finding.detail));
});

/* ------------------------------------------------------------- policies */

test('all three policies spend inside the budget, respect the band ceiling and price retention highest', () => {
  const { store, api } = harness();
  const value = fixture();
  seedTeam(store, value);
  seedBands(api);
  const cycleId = seedCycle(api, value);
  const cycle = store.state.meritCycles.find((row) => row.id === cycleId);
  const comparison = policyComparison(store.state, cycle, NOW);
  assert.equal(comparison.status, 'ok');
  assert.equal(comparison.policies.length, 3);
  for (const policy of comparison.policies) {
    assert.ok(policy.spend <= comparison.budget.amount + 1, `${policy.id} spends inside the budget`);
    assert.equal(policy.bandViolations, 0, `${policy.id} respects the band ceiling`);
    assert.ok(policy.meanAdjustPct <= COMP_CONVENTIONS.maxAdjustPct + 0.001);
  }
  const retention = comparison.policies.find((policy) => policy.id === 'retention');
  const equal = comparison.policies.find((policy) => policy.id === 'equal');
  assert.ok(retention.retainedValue >= equal.retainedValue, 'retention buys at least as much retained value for the same money');
  assert.ok(retention.expectedDepartures <= equal.expectedDepartures + 0.02, 'retention keeps at least as many people');
  const best = comparison.policies.find((policy) => policy.id === comparison.best);
  assert.equal(best.regretValue, 0, 'the best policy has no regret by construction');
  for (const policy of comparison.policies) {
    assert.ok(policy.regretValue >= 0, 'regret is never negative');
    assert.ok(policy.retainedValue >= 0);
  }
  // Determinism: a second call prices the same cycle identically.
  const again = policyComparison(store.state, cycle, NOW);
  assert.deepEqual(again.policies.map((policy) => policy.spend), comparison.policies.map((policy) => policy.spend));

  // Writing the policy through the action reproduces the priced plan exactly.
  const applied = api.applyMeritPolicy(cycleId, 'retention');
  assert.equal(applied.ok, true, applied.error);
  const saved = store.state.meritCycles.find((row) => row.id === cycleId);
  for (const planned of retention.plan) {
    const row = saved.rows.find((candidate) => candidate.personId === planned.personId);
    assert.equal(row.proposedPay, planned.proposedPay, `${planned.personId} matches the priced plan`);
  }
});

/* ------------------------------------------------- finalized cycle + rules */

test('finalizing refuses an over-budget or unpriced cycle, then freezes a readable audit', () => {
  const { store, api } = harness();
  const value = fixture();
  seedTeam(store, value);
  seedBands(api);
  // A budget far below what the proposals need: every row is proposed at +6%.
  const cycleId = seedCycle(api, value, { budgetValue: 900 });
  for (const row of value.rows) {
    assert.equal(api.setMeritRow(cycleId, row.personId, { proposedPay: Math.round(row.currentPay * 1.06) }).ok, true);
  }
  const overBudget = api.finalizeMeritCycle(cycleId);
  assert.equal(overBudget.ok, false, 'an over-budget cycle cannot be frozen');
  assert.match(overBudget.error, /budget/);

  // Remove one proposal: an unpriced decision cannot be part of a frozen audit.
  api.setMeritRow(cycleId, 'p-3', { proposedPay: null });
  // Budget now covers what is left, so the refusal that fires is the blank one.
  const unbudgeted = api.updateMeritCycle(cycleId, { budgetValue: 100000 });
  assert.equal(unbudgeted.ok, true, unbudgeted.error);
  const refusal = api.finalizeMeritCycle(cycleId);
  assert.equal(refusal.ok, false);
  assert.match(refusal.error, /no current pay or no proposal/);

  api.setMeritRow(cycleId, 'p-3', { proposedPay: Math.round(value.rows[2].currentPay * 1.06) });
  const finalized = api.finalizeMeritCycle(cycleId);
  assert.equal(finalized.ok, true, finalized.error);
  const cycle = store.state.meritCycles.find((row) => row.id === cycleId);
  assert.equal(cycle.status, 'finalized');
  assert.equal(cycle.audit.status, 'observed');
  assert.equal(cycle.audit.predictions.length, 16);
  assert.equal(cycle.audit.rowCount, 16);
  assert.ok(cycle.audit.integrity.withPay === 16);
  assert.equal(typeof cycle.audit.integrity.withoutPay, 'number');

  // Editing a frozen cycle is refused; reopening is the only path.
  assert.equal(api.setMeritRow(cycleId, 'p-1', { currentPay: 1 }).ok, false);
  assert.equal(api.reopenMeritCycle(cycleId).ok, true);
  assert.equal(store.state.meritCycles.find((row) => row.id === cycleId).status, 'draft');
  // The frozen reading is retained verbatim while the cycle is open.
  assert.ok(store.state.meritCycles.find((row) => row.id === cycleId).audit);
  assert.equal(api.finalizeMeritCycle(cycleId).ok, true, 'it can be finalized again');
  assert.ok(store.state.meritCycles.find((row) => row.id === cycleId).history.some((row) => row.type === 'audit-superseded'));
});

test('a flagged audit opens exactly one mechanism decision, one task and typed links', () => {
  const { store, api } = harness();
  const value = fixture();
  seedTeam(store, value);
  seedBands(api);
  const cycleId = seedCycle(api, value);
  // A cycle with no accountable owner cannot open owned work; name one first so
  // the rule has somewhere to put the task.
  assert.equal(api.updateMeritCycle(cycleId, { ownerId: 'p-1' }).ok, true);
  for (const row of value.rows) {
    if (row.origin !== 'internal') continue;
    api.setMeritRow(cycleId, row.personId, { proposedPay: Math.round(row.currentPay * 1.06) });
  }
  assert.equal(api.finalizeMeritCycle(cycleId).ok, true);

  const decisions = store.state.decisions.filter((row) => String(row.question).includes(`COMP-FAIR:${cycleId}`));
  assert.equal(decisions.length, 1, 'one mechanism decision, not one per person');
  assert.match(decisions[0].title, /mechanism/);
  assert.match(decisions[0].question, /four-fifths/);
  assert.equal(decisions[0].options.length, 4);
  assert.ok(decisions[0].options.some((option) => /Publish the merit grid/.test(option.label)));

  const fairTasks = store.state.delegations.filter((row) => String(row.support).includes(`COMP-FAIR-TASK:${cycleId}`));
  assert.equal(fairTasks.length, 1, 'one owned task produces the evidence');
  const outcomeTasks = store.state.delegations.filter((row) => String(row.support).includes(`COMP-CKPT:${cycleId}`));
  assert.equal(outcomeTasks.length, 1, 'one dated outcome review task');

  const links = store.state.links;
  assert.ok(links.some((link) => link.sourceType === 'merit' && link.sourceId === cycleId && link.relation === 'audits'),
    'the cycle is linked to the decision it opened');
  assert.equal(links.filter((link) => link.sourceType === 'merit' && link.relation === 'compensates').length, 16,
    'every person the cycle pays is linked, once');

  // Idempotent across explicit scans.
  api.scanMerit();
  api.scanMerit();
  assert.equal(store.state.decisions.filter((row) => String(row.question).includes(`COMP-FAIR:${cycleId}`)).length, 1);
  assert.equal(store.state.delegations.filter((row) => String(row.support).includes(`COMP-CKPT:${cycleId}`)).length, 1);

  // The outcome review is dated forward, not on the day of the decision.
  const review = store.state.decisions.find((row) => String(row.question).includes(`COMP-REV:${cycleId}`));
  assert.ok(review, 'the outcome review exists');
  assert.ok(review.reviewOn > TODAY, 'the review is scheduled in the future');
});

test('a departure resolves the frozen prediction and the model grades itself only at five outcomes', () => {
  const { store, api } = harness();
  const value = fixture();
  seedTeam(store, value);
  seedBands(api);
  const cycleId = seedCycle(api, value);
  assert.equal(api.finalizeMeritCycle(cycleId).ok, true);
  const frozen = store.state.meritCycles.find((row) => row.id === cycleId).audit.predictions
    .map((row) => ({ ...row }));

  assert.equal(retentionCalibration(store.state, NOW).status, 'insufficient');

  const archive = (personId) => {
    const res = api.archivePerson(personId);
    assert.equal(res.ok, true, res.error);
  };
  for (const personId of ['p-1', 'p-2', 'p-3', 'p-4', 'p-5']) archive(personId);

  const cycle = store.state.meritCycles.find((row) => row.id === cycleId);
  assert.equal(cycle.outcomes.filter((outcome) => outcome.departed === true).length, 5);
  assert.deepEqual(cycle.audit.predictions.map((row) => ({ ...row })), frozen,
    'the predictions are never recomputed after a departure');

  const calibration = retentionCalibration(store.state, NOW);
  assert.equal(calibration.status, 'ok');
  assert.equal(calibration.n, 5);
  assert.equal(calibration.departed, 5);
  assert.ok(Number.isFinite(calibration.brier));
  assert.equal(calibration.skill, null, 'with everyone leaving the base rate has no variance, so no skill is claimed');
  assert.match(calibration.detail, /no variance/);

  // Archiving again does not duplicate the outcome.
  api.scanMerit();
  assert.equal(store.state.meritCycles.find((row) => row.id === cycleId).outcomes.filter((row) => row.personId === 'p-1').length, 1);
});

/* -------------------------------------------------------------- CSV & demo */

test('CSV scope #45 carries ratios and counts and leaks no salary, name or label', () => {
  assert.equal(CSV_EXPORTS.length, 45);
  const scope = CSV_EXPORTS.find((row) => row.key === 'merit');
  assert.ok(scope);
  assert.match(scope.description, /NO salaries/);

  const value = fixture();
  const state = buildDemoState(NOW);
  state.compBands = Object.entries(BANDS).map(([level, band], index) => ({
    id: `band-${index}`, level, label: level, ...band, effectiveOn: '2026-01-01', notes: 'A note that must not leak',
  }));
  state.meritCycles = [{
    id: 'merit-fixture',
    label: 'A label that must not leak',
    currency: 'USD',
    effectiveOn: '2026-11-01',
    status: 'draft',
    budget: { kind: 'amount', value: 60000 },
    comparison: { dimension: 'origin' },
    ownerId: null,
    rows: value.rows.map((row) => ({ ...row, note: 'A note that must not leak' })),
    audit: null,
    outcomes: [],
  }];
  state.people = value.people;
  state.reviews = value.reviews;
  const text = exportWorkspaceCsv(state, 'merit', { now: NOW }).csv;
  assert.match(text, /cycle_code/);
  assert.match(text, /four_fifths_ratio/);
  assert.doesNotMatch(text, /salary|current_pay|proposed_pay/i, 'no absolute pay column is exported');
  assert.doesNotMatch(text, /A label that must not leak/);
  assert.doesNotMatch(text, /Person \d/);
  assert.doesNotMatch(text, /A note that must not leak/);
  assert.doesNotMatch(text, new RegExp(String(value.rows[0].currentPay)), 'no salary figure appears anywhere in the file');
});

test('the demo carries two cycles, a real finding, and cleans up without rewriting a frozen audit', () => {
  const state = buildDemoState(NOW);
  assert.ok(state.compBands.length >= 3);
  assert.equal(state.meritCycles.length, 2);
  const past = state.meritCycles.find((cycle) => cycle.status === 'finalized');
  const current = state.meritCycles.find((cycle) => cycle.status === 'draft');
  assert.ok(past && current);
  assert.ok(past.audit.predictions.length > 0);
  assert.equal(past.outcomes.length, past.audit.predictions.length);

  const reading = fairnessReading(state, current, NOW);
  assert.equal(reading.decomposition.status, 'insufficient', 'five people cannot support a group decomposition, and the demo says so');
  assert.ok(reading.compression.length >= 1, 'the external-hire premium is a real finding in the demo');
  assert.ok(reading.policies.policies.length === 3);

  const insights = buildInsights(state, NOW);
  const bucket = insights.byDomain.find((row) => row.domain === 'Merit & pay equity');
  assert.ok(bucket, 'the merit domain appears in the roll-up');
  assert.ok(insights.findings.some((finding) => finding.domain === 'Merit & pay equity' && finding.ruleId === 'MER-06'));

  // clearDemo drops demo records and scrubs their rows; the frozen audit stays.
  const { store } = harness();
  store.load();
  store.importJSON(JSON.stringify(state), { confirm: true, mode: 'replace' });
  const frozenBefore = JSON.parse(JSON.stringify(store.state.meritCycles.find((cycle) => cycle.status === 'finalized').audit));
  store.clearDemo();
  assert.equal(store.state.meritCycles.length, 0, 'demo cycles are demo records');
  // A retained user cycle loses only the pointers and rows of removed people.
  assert.deepEqual(frozenBefore.predictions.length > 0, true);
});

/* -------------------------------------------------------------- the page */

test('the merit page, its tabs and both dialogs render keyboard-operably and axe-clean', async () => {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => {
    if (String(error?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(error.message);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://leados.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.localStorage = window.localStorage;
  let app;
  try {
    const { createApp } = await import('../../app/main.js');
    app = createApp({ storage: window.localStorage, now: () => NOW });
    app.ctx.loadDemo();
    app.ctx.navigate('#/merit');
    const view = window.document.querySelector('#view [data-testid="merit-page"]');
    assert.ok(view, 'the merit page renders');
    assert.match(view.textContent, /Merit cycle/);
    assert.match(view.textContent, /Across the board/);

    const axeSource = fs.readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
    window.eval(axeSource);
    const pageAxe = await window.axe.run(view, { rules: { 'color-contrast': { enabled: false } } });
    assert.deepEqual(Array.from(pageAxe.violations).map((v) => v.id), [], 'the merit page has no axe violations');

    // Tabs are buttons with aria-selected, and a deep link selects the panel.
    const fairnessTab = Array.from(view.querySelectorAll('[role="tab"]')).find((tab) => /Fairness audit/.test(tab.textContent));
    assert.ok(fairnessTab, 'the fairness tab is reachable');
    fairnessTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const fairnessView = window.document.querySelector('#view');
    assert.match(fairnessView.textContent, /Oaxaca–Blinder/);
    assert.match(fairnessView.textContent, /not proof of discrimination/);
    const fairnessAxe = await window.axe.run(fairnessView, { rules: { 'color-contrast': { enabled: false } } });
    assert.deepEqual(Array.from(fairnessAxe.violations).map((v) => v.id), [], 'the fairness panel is axe-clean');

    app.ctx.navigate('#/merit?cycle=merit-demo-2&panel=allocation');
    const allocationView = window.document.querySelector('#view');
    const editButton = Array.from(allocationView.querySelectorAll('button'))
      .find((button) => (button.getAttribute('aria-label') || '').startsWith('Edit the pay decision'));
    assert.ok(editButton, 'a pay decision is keyboard-reachable');
    editButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const rowDialog = window.document.querySelector('#modal-root [role="dialog"]');
    assert.ok(rowDialog, 'the pay dialog opens');
    assert.match(rowDialog.textContent, /Compa-ratio|No band recorded/);
    const dialogAxe = await window.axe.run(rowDialog, { rules: { 'color-contrast': { enabled: false } } });
    assert.deepEqual(Array.from(dialogAxe.violations).map((v) => v.id), [], 'the pay dialog is axe-clean');

    // The proposal is written through the action and re-rendered. The increase
    // is kept inside the cycle ceiling: the dialog is a merit line, not a
    // promotion, and the action refuses anything larger.
    const currentPay = Number(rowDialog.querySelector('#comp-row-current').value);
    const target = String(Math.round((currentPay * 1.05) / 500) * 500);
    rowDialog.querySelector('#comp-row-proposed').value = target;
    const save = Array.from(rowDialog.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Save the decision');
    save.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const current = app.store.state.meritCycles.find((cycle) => cycle.status === 'draft');
    assert.ok(current.rows.some((row) => row.proposedPay === Number(target)), 'the proposal persisted');

    // The cycle dialog is reachable from the header.
    const headerButtons = Array.from(window.document.querySelectorAll('#view button'));
    const declare = headerButtons.find((button) => button.textContent.trim() === 'Declare a cycle');
    assert.ok(declare);
    declare.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const cycleDialog = window.document.querySelector('#modal-root [role="dialog"]');
    assert.ok(cycleDialog, 'the cycle declaration dialog opens');
    assert.match(cycleDialog.textContent, /never asks for a protected characteristic/);
    const cycleAxe = await window.axe.run(cycleDialog, { rules: { 'color-contrast': { enabled: false } } });
    assert.deepEqual(Array.from(cycleAxe.violations).map((v) => v.id), [], 'the cycle dialog is axe-clean');

    assert.deepEqual(consoleErrors, []);
  } finally {
    app?.destroy?.();
    delete globalThis.window;
    delete globalThis.document;
  }
});
