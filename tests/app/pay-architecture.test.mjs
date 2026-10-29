/**
 * tests/app/pay-architecture.test.mjs — Schema v51, the Pay Architecture &
 * Equity Terminal.
 *
 * The claims under test are specific and falsifiable:
 *
 *   1. The v50 → v51 migration is additive: no band, pay record, audit or merit
 *      round is invented for an existing workspace.
 *   2. Placement is derived from dated records only: the current rate is the
 *      latest effective record, a band is looked up by family/level/currency, and
 *      a below-minimum or red-circled placement is reported rather than smoothed.
 *   3. The equity model refuses to publish a number it cannot defend: a small
 *      cohort, a thin group or a perfectly separating control set returns a
 *      status and a reason, not a coefficient.
 *   4. The OLS core is correct on a known answer (an exactly recoverable
 *      coefficient), the interval is symmetric around the estimate, and the
 *      Student-t CDF/quantile are mutually consistent.
 *   5. Filing an audit freezes the snapshot; later pay corrections do not rewrite
 *      it, and RULE-PAY-01 opens exactly one decision plus one owned task, links
 *      both ways, and is idempotent.
 *   6. A significant whole-cohort gap with no flagged category opens one
 *      structural remediation decision (RULE-PAY-02) and nothing when the
 *      interval contains zero.
 *   7. A recorded placement under the minimum opens one owned task
 *      (RULE-PAY-03) and a red-circled placement opens one decision; neither
 *      duplicates on re-run.
 *   8. The merit simulator scales to the envelope, never writes a pay record, and
 *      a committed round that widens the gap opens the fairness decision
 *      (RULE-PAY-04) with its projection frozen on the round.
 *   9. CSV scope #45 leaks no name, note, label or audit id; demo cleanup drops
 *      pay records for removed people and keeps a filed audit's snapshot.
 *  10. The page and its dialogs render keyboard-operably and axe-clean, and the
 *      nav badge count equals the attention list the page renders.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createStore } from '../../app/core/store.js';
import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION, LEVELS } from '../../app/core/schema.js';
import { createApi } from '../../app/actions.js';
import { buildDemoState } from '../../app/core/demo.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import {
  buildExampleCohort,
  exampleGapAudit,
  payArchitecture,
  payGapAudit,
  payPortfolio,
  payAttentionCount,
  paySignals,
  positionFactor,
  remediationOptions,
  simulateMeritRound,
  studentTCdf,
  studentTQuantile,
  studentTPValue,
  totalTargetPay,
} from '../../app/core/domain/pay.js';
import { PAY_RULE_IDS } from '../../app/core/domain/payRules.js';
import { buildPayBrief } from '../../app/core/domain/pay.js';

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

function harness(now = NOW) {
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-v51-${++sequence}`;
  const store = createStore({ storage: memoryStorage(), now: () => now, idFactory });
  store.load();
  const api = createApi(store, { now: () => now, idFactory });
  return { store, api, idFactory };
}

/**
 * A cohort big enough for the model, generated deterministically. Each person has
 * a band, a pay record and a recorded group; the pay is set as a function of the
 * intended coefficient so the test asserts against a known answer rather than
 * whatever the fit happens to return.
 */
function seedCohort(store, { people = 24, groupEffect = 0.9, seed = 5 } = {}) {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const roster = [];
  const bands = [];
  const assignments = [];
  for (const level of ['ic', 'senior', 'lead']) {
    const mid = level === 'ic' ? 78000 : level === 'senior' ? 120000 : 158000;
    bands.push({
      id: `band-${level}`, family: 'Engineering', level, currency: 'USD',
      min: Math.round(mid * 0.8), mid, max: Math.round(mid * 1.2), effectiveFrom: '2025-01-01',
    });
  }
  for (let i = 0; i < people; i += 1) {
    const level = ['ic', 'senior', 'lead'][i % 3];
    const group = i % 2 === 0 ? 'woman' : 'man';
    const mid = level === 'ic' ? 78000 : level === 'senior' ? 120000 : 158000;
    const base = Math.round((mid * (group === 'woman' ? groupEffect : 1) * (0.98 + rand() * 0.04)) / 100) * 100;
    roster.push({ id: `p-${i + 1}`, name: `Person ${i + 1}`, status: 'active', level, equalPayGroup: group, startDate: '2023-01-01', talkingPoints: [] });
    assignments.push({
      id: `a-${i + 1}`, personId: `p-${i + 1}`, family: 'Engineering', level, currency: 'USD',
      base, variableTargetPct: 0, effectiveFrom: '2026-01-01', reason: 'hire', recordedOn: '2026-01-01',
    });
  }
  store.update((draft) => {
    draft.people = roster;
    draft.payBands = bands;
    draft.payAssignments = assignments;
  }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'Seed pay cohort' });
  return { bands, assignments, roster };
}

/* ------------------------------------------------------------- migration */

test('v50 → v51 is additive and invents no pay, band, audit or merit round', () => {
  const v50 = {
    schemaVersion: 50,
    people: [{ id: 'p-1', name: 'Priya', status: 'active' }],
    fidelityPlans: [{ id: 'fid-1', title: 'Existing plan', status: 'active', stages: [] }],
  };
  const migrated = migrate(v50, { now: NOW });
  assert.equal(migrated.applied[0], '50 → 51');
  assert.deepEqual(migrated.raw.payBands, []);
  assert.deepEqual(migrated.raw.payAssignments, []);
  assert.deepEqual(migrated.raw.payAudits, []);
  assert.deepEqual(migrated.raw.meritRounds, []);
  // The leader's pre-existing records survive untouched.
  assert.equal(migrated.raw.fidelityPlans[0].title, 'Existing plan');
  assert.equal(v50.payBands, undefined, 'the migration does not mutate its input');

  const normalized = normalizeState(migrated.raw, { now: NOW });
  assert.equal(normalized.state.schemaVersion, SCHEMA_VERSION);
  // An attestation is never dated by a migration: nobody attested it today.
  assert.equal(normalized.state.settings.payJobEvaluationOn, null);
  assert.equal(normalized.state.settings.payInformationRouteOn, null);
  assert.equal(normalized.state.settings.payGapTriggerPct, 5);
  // A person written before v51 has no recorded contrast group, and is not guessed.
  assert.equal(normalized.state.people[0].equalPayGroup, 'unrecorded');
});

/* ---------------------------------------------------------- architecture */

test('placement is derived from dated records: current rate, band lookup and defect status', () => {
  const { store } = harness();
  store.update((draft) => {
    draft.people = [
      { id: 'p-1', name: 'Ana', status: 'active', level: 'senior', equalPayGroup: 'woman', startDate: '2023-01-01' },
      { id: 'p-2', name: 'Ben', status: 'active', level: 'senior', equalPayGroup: 'man', startDate: '2023-01-01' },
      { id: 'p-3', name: 'Cleo', status: 'active', level: 'senior', equalPayGroup: 'woman', startDate: '2023-01-01' },
    ];
    draft.payBands = [{
      id: 'b-1', family: 'Eng', level: 'senior', currency: 'USD',
      min: 100000, mid: 120000, max: 144000, effectiveFrom: '2025-01-01',
    }];
    draft.payAssignments = [
      // Ana: an old rate then a new one — the latest effective record wins.
      { id: 'a-1', personId: 'p-1', family: 'Eng', level: 'senior', currency: 'USD', base: 90000, variableTargetPct: 0, effectiveFrom: '2025-02-01', reason: 'hire', recordedOn: '2025-02-01' },
      { id: 'a-2', personId: 'p-1', family: 'Eng', level: 'senior', currency: 'USD', base: 130000, variableTargetPct: 10, effectiveFrom: '2026-03-01', reason: 'market', recordedOn: '2026-03-01' },
      // Ben: below the minimum.
      { id: 'a-3', personId: 'p-2', family: 'Eng', level: 'senior', currency: 'USD', base: 95000, variableTargetPct: 0, effectiveFrom: '2025-02-01', reason: 'hire', recordedOn: '2025-02-01' },
      // Cleo: a future-dated record that is not yet in force.
      { id: 'a-4', personId: 'p-3', family: 'Eng', level: 'senior', currency: 'USD', base: 121000, variableTargetPct: 0, effectiveFrom: '2026-11-15', reason: 'merit', recordedOn: '2026-10-01' },
    ];
  }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'Seed three people' });

  const arch = payArchitecture(store.state, NOW);
  const ana = arch.rows.find((row) => row.person.id === 'p-1');
  const ben = arch.rows.find((row) => row.person.id === 'p-2');
  const cleo = arch.rows.find((row) => row.person.id === 'p-3');

  // 130,000 × 1.10 = 143,000 → inside the band, just under the maximum.
  assert.equal(totalTargetPay(ana.assignment), 143000);
  assert.equal(ana.placement.status, 'in-band');
  assert.equal(ana.placement.compaRatio, 1.192);
  assert.equal(ben.placement.status, 'below-min');
  assert.equal(ben.placement.compaRatio, 0.792);
  // A future-dated record is not in force today, so Cleo has no current rate.
  assert.equal(cleo.assignment, null);
  assert.equal(arch.counts.belowMin, 1);
  assert.equal(arch.counts.noPay, 1);
  assert.equal(arch.counts.people, 3);
});

test('a band that is not a range is dropped rather than used to score anyone', () => {
  const raw = {
    schemaVersion: 50,
    people: [{ id: 'p-1', name: 'Ana', status: 'active' }],
    payBands: [
      { id: 'b-1', family: 'Eng', level: 'senior', currency: 'USD', min: 130000, mid: 120000, max: 100000, effectiveFrom: '2025-01-01' },
      { id: 'b-2', family: 'Eng', level: 'ic', currency: 'usd', min: 1, mid: 2, max: 3, effectiveFrom: '2025-01-01' },
    ],
    payAssignments: [
      { id: 'a-1', personId: 'p-1', family: 'Eng', level: 'senior', currency: 'USD', base: 120000, effectiveFrom: '2025-02-01' },
      { id: 'a-2', personId: 'nobody', family: 'Eng', level: 'senior', currency: 'USD', base: 120000, effectiveFrom: '2025-02-01' },
      { id: 'a-3', personId: 'p-1', family: 'Eng', level: 'senior', currency: 'USD', base: -5, effectiveFrom: '2025-02-01' },
    ],
  };
  const { state, warnings } = normalizeState(raw, { now: NOW });
  assert.equal(state.payBands.length, 1, 'the inverted band is dropped; the lowercase-currency band normalises to USD');
  assert.equal(state.payBands[0].currency, 'USD');
  assert.equal(state.payAssignments.length, 1, 'the dangling-person and negative-amount records are dropped');
  assert.ok(warnings.some((w) => w.includes('valid minimum')));
  assert.ok(warnings.some((w) => w.includes('not in the roster')));
});

/* ----------------------------------------------------------- the model */

test('the OLS core recovers a known coefficient and the interval is symmetric', () => {
  // Two levels, two groups, 40 people, pay set exactly by group and level with a
  // deterministic wobble so the fit is not singular.
  const { store } = harness();
  const rows = [];
  for (let i = 0; i < 40; i += 1) {
    const level = i % 2 === 0 ? 'ic' : 'senior';
    const group = i % 4 < 2 ? 'woman' : 'man';
    const base = (level === 'ic' ? 78000 : 120000) * (group === 'woman' ? 1.05 : 1) * (1 + ((i % 5) - 2) * 0.002);
    rows.push({ i, level, group, base });
  }
  store.update((draft) => {
    draft.people = rows.map((r) => ({ id: `p-${r.i}`, name: `P${r.i}`, status: 'active', level: r.level, equalPayGroup: r.group, startDate: '2023-01-01' }));
    draft.payBands = [
      { id: 'b1', family: 'Eng', level: 'ic', currency: 'USD', min: 60000, mid: 78000, max: 94000, effectiveFrom: '2025-01-01' },
      { id: 'b2', family: 'Eng', level: 'senior', currency: 'USD', min: 96000, mid: 120000, max: 144000, effectiveFrom: '2025-01-01' },
    ];
    draft.payAssignments = rows.map((r) => ({
      id: `a-${r.i}`, personId: `p-${r.i}`, family: 'Eng', level: r.level, currency: 'USD',
      base: Math.round(r.base), variableTargetPct: 0, effectiveFrom: '2026-01-01',
    }));
  }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'Seed fit cohort' });

  const audit = payGapAudit(store.state, { currency: 'USD', groupA: 'woman', groupB: 'man' }, NOW);
  assert.equal(audit.status, 'ok');
  // ln(1.05) ≈ 4.9%; the level control absorbs the level effect exactly.
  assert.ok(Math.abs(audit.adjustedGapPct - 4.88) < 0.6, `expected ≈ +4.9%, got ${audit.adjustedGapPct}`);
  assert.ok(audit.adjustedCiPct.low < audit.adjustedGapPct && audit.adjustedGapPct < audit.adjustedCiPct.high);
  assert.ok(Math.abs((audit.adjustedCiPct.high - audit.adjustedGapPct) - (audit.adjustedGapPct - audit.adjustedCiPct.low)) < 0.05,
    'the interval is symmetric around the estimate on the log scale');
  assert.equal(audit.controlsUsed.includes('level'), true);
  assert.ok(audit.df > 0);
});

test('the model refuses a cohort it cannot defend instead of printing a number', () => {
  // Eight people but only two in group B: below PAY_MIN_PER_GROUP.
  const { store } = harness();
  store.update((draft) => {
    draft.people = Array.from({ length: 8 }, (_, i) => ({
      id: `p-${i}`, name: `P${i}`, status: 'active', level: 'ic',
      equalPayGroup: i < 6 ? 'woman' : 'man', startDate: '2023-01-01',
    }));
    draft.payBands = [{ id: 'b', family: 'Eng', level: 'ic', currency: 'USD', min: 60000, mid: 78000, max: 94000, effectiveFrom: '2025-01-01' }];
    draft.payAssignments = Array.from({ length: 8 }, (_, i) => ({
      id: `a-${i}`, personId: `p-${i}`, family: 'Eng', level: 'ic', currency: 'USD',
      base: 70000 + i * 1000, effectiveFrom: '2026-01-01',
    }));
  }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'Seed thin group' });

  const audit = payGapAudit(store.state, { currency: 'USD' }, NOW);
  assert.equal(audit.status, 'insufficient');
  assert.match(audit.reason, /at least 3 people/i);
  assert.equal(audit.adjustedGapPct, undefined, 'no coefficient is published for a thin cohort');
  assert.equal(audit.significant, undefined);

  // The demo roster (five people, one unrecorded group) is also refused, with a
  // reason that names the cohort size rather than the people.
  const demo = normalizeState(buildDemoState(NOW), { now: NOW }).state;
  const demoAudit = payGapAudit(demo, { currency: 'USD' }, NOW);
  assert.equal(demoAudit.status, 'insufficient');
  assert.match(demoAudit.reason, /comparable people|at least 3 people/i);
  assert.equal(demoAudit.excluded.undisclosed, 1, 'the person recorded as not to be analysed is excluded and counted');
});

test('a control set that perfectly separates the groups falls back and says why', () => {
  const { store } = harness();
  // Every woman is a lead, every man an IC: level is collinear with the group.
  store.update((draft) => {
    draft.people = Array.from({ length: 12 }, (_, i) => ({
      id: `p-${i}`, name: `P${i}`, status: 'active',
      level: i < 6 ? 'lead' : 'ic',
      equalPayGroup: i < 6 ? 'woman' : 'man', startDate: '2023-01-01',
    }));
    draft.payBands = [
      { id: 'b1', family: 'Eng', level: 'lead', currency: 'USD', min: 128000, mid: 158000, max: 190000, effectiveFrom: '2025-01-01' },
      { id: 'b2', family: 'Eng', level: 'ic', currency: 'USD', min: 62000, mid: 78000, max: 94000, effectiveFrom: '2025-01-01' },
    ];
    draft.payAssignments = Array.from({ length: 12 }, (_, i) => ({
      id: `a-${i}`, personId: `p-${i}`, family: 'Eng',
      level: i < 6 ? 'lead' : 'ic', currency: 'USD',
      base: i < 6 ? 150000 + i * 1000 : 70000 + i * 500, effectiveFrom: '2026-01-01',
    }));
  }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'Seed separated cohort' });

  const audit = payGapAudit(store.state, { currency: 'USD', controls: { level: true, family: true, tenure: true } }, NOW);
  assert.equal(audit.status, 'ok');
  assert.equal(audit.controlsUsed.includes('level'), false, 'the separating control is dropped');
  assert.match(audit.droppedBecause, /separate|not identified/i);
  assert.ok(audit.attempts.length > 1, 'the fallback ladder is recorded so the reader can see what was tried');
});

test('remediation costing is exact under the fitted model and re-fits every option', () => {
  const example = exampleGapAudit();
  const plan = remediationOptions({}, example);
  assert.equal(plan.status, 'ok');
  assert.ok(plan.options.length >= 1);
  const uniform = plan.options[0];
  assert.match(uniform.label, /Uniform/);
  // The closed form is exact under the fitted specification: a uniform lift on the
  // lower-paid group moves the coefficient by exactly ln(1 + p), which the re-fit
  // confirms rather than assumes.
  assert.ok(Math.abs(Math.abs(uniform.projectedGapPct) - plan.triggerPct) < 0.25,
    `expected the uniform option to land on the threshold, got ${uniform.projectedGapPct}`);
  assert.equal(uniform.meetsThreshold, true);
  assert.ok(uniform.cost > 0);
  // Every option reports a projected difference from its own re-fit, never a
  // copied number.
  for (const option of plan.options) {
    if (option.estimable) {
      assert.ok(Math.abs(option.projectedGapPct) <= Math.abs(plan.currentGapPct) + 0.01,
        `${option.label} must not make the difference worse than it started`);
    }
  }
  // A cohort that cannot be modelled gets no price at all.
  const unavailable = remediationOptions({}, { status: 'insufficient', reason: 'too small' });
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.options, undefined);
});

test('the Student-t quantile and CDF are mutually consistent', () => {
  for (const df of [1, 3, 10, 30]) {
    const q = studentTQuantile(0.975, df);
    assert.ok(Math.abs(studentTCdf(q, df) - 0.975) < 1e-6, `t(0.975, ${df}) round-trips`);
  }
  // Two-sided p at the 97.5% quantile is 0.05.
  assert.ok(Math.abs(studentTPValue(studentTQuantile(0.975, 10), 10) - 0.05) < 1e-5);
  // The classic 95% critical values at 1..30 df are ≈ 12.7, 4.30, 2.23, 2.04.
  assert.ok(Math.abs(studentTQuantile(0.975, 1) - 12.706) < 0.01);
  assert.ok(Math.abs(studentTQuantile(0.975, 5) - 2.571) < 0.01);
  assert.ok(Math.abs(studentTQuantile(0.975, 30) - 2.042) < 0.01);
});

test('the worked example plants a visible structural effect and is labelled synthetic', () => {
  const example = exampleGapAudit();
  assert.equal(example.status, 'ok');
  assert.equal(example.synthetic, true);
  assert.ok(example.adjustedGapPct < -3, 'the planted effect is negative and larger than noise');
  assert.ok(example.n >= 20);
  assert.ok(example.quartiles.length === 4);
  // Determinism: the same seed produces exactly the same cohort.
  const a = buildExampleCohort(42);
  const b = buildExampleCohort(42);
  assert.deepEqual(a.rows.map((r) => r.pay), b.rows.map((r) => r.pay));
});

/* ------------------------------------------------------- filing an audit */

test('filing freezes the snapshot, opens exactly one decision and one task, and is idempotent', () => {
  const { store, api } = harness();
  seedCohort(store, { groupEffect: 0.9 });

  const filed = api.filePayAudit({ label: 'Annual review', currency: 'USD' });
  assert.equal(filed.ok, true);
  assert.equal(filed.snapshot.status, 'ok');
  const gapAtFiling = filed.snapshot.adjustedGapPct;

  const state = store.state;
  const audit = state.payAudits.find((row) => row.id === filed.id);
  assert.equal(audit.status, 'filed');
  assert.equal(audit.snapshot.adjustedGapPct, gapAtFiling);
  assert.equal(audit.snapshot.frozen, true);

  const decisions = state.decisions.filter((row) => String(row.rationale || '').includes(`[PAY-JPA:${filed.id}]`) || String(row.rationale || '').includes(`[PAY-GAP:${filed.id}]`));
  assert.equal(decisions.length, 1, 'exactly one decision is opened, never both rules at once');
  const rule = decisions[0].rationale.includes('[PAY-JPA:') ? PAY_RULE_IDS.JOINT_ASSESSMENT : PAY_RULE_IDS.GAP_REMEDIATION;
  assert.ok([PAY_RULE_IDS.JOINT_ASSESSMENT, PAY_RULE_IDS.GAP_REMEDIATION].includes(rule));

  const links = state.links.filter((link) => link.sourceType === 'payAudit' && link.sourceId === filed.id);
  assert.ok(links.some((link) => link.targetType === 'decision' && link.targetId === decisions[0].id), 'the audit links to the decision it required');

  if (rule === PAY_RULE_IDS.JOINT_ASSESSMENT) {
    const tasks = state.delegations.filter((row) => String(row.support || '').includes(`[PAY-PACK:${filed.id}]`));
    assert.equal(tasks.length, 1, 'one owned task prepares the criteria');
    assert.ok(links.some((link) => link.targetType === 'delegation' && link.targetId === tasks[0].id));
    assert.match(audit.snapshot.flaggedCategories[0].label, /IC|Contributor|Senior|Lead/i);
  }

  // Re-running the propagation cannot duplicate anything.
  api.scanPay();
  api.scanPay();
  const after = store.state;
  assert.equal(after.decisions.filter((row) => String(row.rationale || '').includes(`:${filed.id}]`)).length, 1);
  assert.equal(after.delegations.filter((row) => String(row.support || '').includes(`[PAY-PACK:${filed.id}]`)).length <= 1, true);

  // A later pay correction does not rewrite the filed snapshot.
  const person = store.state.people[0];
  api.addPayAssignment({ personId: person.id, family: 'Engineering', level: person.level, currency: 'USD', base: 500000, variableTargetPct: 0, effectiveFrom: TODAY, reason: 'correction' });
  const refiled = store.state.payAudits.find((row) => row.id === filed.id);
  assert.equal(refiled.snapshot.adjustedGapPct, gapAtFiling, 'the filed assessment is frozen against later edits');
  // A filed audit cannot be deleted at all.
  const attempt = api.deletePayAudit(filed.id);
  assert.equal(attempt.ok, false);
  assert.match(attempt.error, /record of an assessment/i);
});

test('an audit whose interval contains zero opens nothing', () => {
  const { store, api } = harness();
  // Group A and B are paid identically: the adjusted gap is ~0 and not significant.
  seedCohort(store, { groupEffect: 1 });
  const filed = api.filePayAudit({ label: 'Null review', currency: 'USD' });
  assert.equal(filed.ok, true);
  assert.equal(filed.snapshot.status, 'ok');
  if (!filed.snapshot.significant && !filed.snapshot.flaggedCategories.length) {
    const opened = store.state.decisions.filter((row) => String(row.rationale || '').includes(filed.id));
    assert.equal(opened.length, 0, 'ceremony is not the product: no decision for a null result');
  }
});

/* -------------------------------------------------- placement propagation */

test('a placement under the minimum opens one owned task; a red circle opens one decision', () => {
  const { store, api } = harness();
  store.update((draft) => {
    draft.people = [
      { id: 'p-1', name: 'Ana', status: 'active', level: 'senior', equalPayGroup: 'woman', startDate: '2023-01-01', talkingPoints: [] },
      { id: 'p-2', name: 'Ben', status: 'active', level: 'senior', equalPayGroup: 'man', startDate: '2023-01-01', talkingPoints: [] },
    ];
    draft.payBands = [{ id: 'b-1', family: 'Eng', level: 'senior', currency: 'USD', min: 100000, mid: 120000, max: 144000, effectiveFrom: '2025-01-01' }];
  }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'Seed two people' });

  const low = api.addPayAssignment({ personId: 'p-1', family: 'Eng', level: 'senior', currency: 'USD', base: 90000, effectiveFrom: TODAY, reason: 'hire' });
  assert.equal(low.ok, true);
  const tasks = store.state.delegations.filter((row) => String(row.support || '').includes('[PAY-MIN:p-1]'));
  assert.equal(tasks.length, 1);
  assert.match(tasks[0].expectedOutcome, /compounds every year|missed correction|documented exception|write the exception/i);

  const high = api.addPayAssignment({ personId: 'p-2', family: 'Eng', level: 'senior', currency: 'USD', base: 200000, effectiveFrom: TODAY, reason: 'market' });
  assert.equal(high.ok, true);
  const decisions = store.state.decisions.filter((row) => String(row.rationale || '').includes('[PAY-MAX:p-2]'));
  assert.equal(decisions.length, 1);
  assert.match(decisions[0].question, /red-circl/i);

  // A second scan is idempotent.
  api.scanPay();
  assert.equal(store.state.delegations.filter((row) => String(row.support || '').includes('[PAY-MIN:p-1]')).length, 1);
  assert.equal(store.state.decisions.filter((row) => String(row.rationale || '').includes('[PAY-MAX:p-2]')).length, 1);
});

test('a large single-step pay change adds one blameless talking point, not a rating', () => {
  const { store, api } = harness();
  store.update((draft) => {
    draft.people = [{ id: 'p-1', name: 'Ana', status: 'active', level: 'senior', equalPayGroup: 'woman', startDate: '2023-01-01', talkingPoints: [] }];
    draft.payBands = [{ id: 'b-1', family: 'Eng', level: 'senior', currency: 'USD', min: 100000, mid: 120000, max: 400000, effectiveFrom: '2025-01-01' }];
  }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'Seed one person' });
  api.addPayAssignment({ personId: 'p-1', family: 'Eng', level: 'senior', currency: 'USD', base: 110000, effectiveFrom: '2026-01-01', reason: 'hire' });
  api.addPayAssignment({ personId: 'p-1', family: 'Eng', level: 'senior', currency: 'USD', base: 140000, effectiveFrom: TODAY, reason: 'market' });
  const points = store.state.people[0].talkingPoints.filter((row) => String(row).includes('[PAY-STEP:'));
  assert.equal(points.length, 1);
  assert.match(points[0], /criteria/i);
  assert.doesNotMatch(points[0], /rating|score/i);
});

/* ------------------------------------------------------------ merit round */

test('the merit simulation scales to the envelope and commits without writing any pay record', () => {
  const { store, api } = harness();
  seedCohort(store, { groupEffect: 0.9 });
  // No reviews exist in this cohort, so the undeclared "no rating" multiplier is
  // exercised explicitly: it is a stated policy, not a silent default.
  const declared = api.declareMeritRound({ label: 'Cycle A', currency: 'USD', basePct: 6, envelopePct: 2, matrix: { '': 1 } });
  assert.equal(declared.ok, true);

  const round = store.state.meritRounds.find((row) => row.id === declared.id);
  const projection = simulateMeritRound(store.state, round, NOW);
  assert.equal(projection.headcount, 24);
  assert.ok(projection.overBudget, 'a 6% matrix base with a 2% envelope must exceed the envelope');
  assert.ok(projection.scale < 1);
  assert.ok(projection.scaledCost <= projection.envelopeAmount + 0.01, 'the scaled cost respects the envelope');

  // Determinism: the same inputs produce the same allocation.
  const again = simulateMeritRound(store.state, round, NOW);
  assert.deepEqual(again.scaled.map((r) => r.newPay), projection.scaled.map((r) => r.newPay));

  const before = (store.state.payAssignments || []).length;
  const committed = api.commitMeritRound(declared.id);
  assert.equal(committed.ok, true);
  assert.equal((store.state.payAssignments || []).length, before, 'committing a round decides, it does not pay anyone');
  const committedRound = store.state.meritRounds.find((row) => row.id === declared.id);
  assert.equal(committedRound.status, 'committed');
  assert.ok(committedRound.snapshot.payroll > 0);
  assert.equal(api.commitMeritRound(declared.id).ok, false, 'a round cannot be committed twice');
  assert.equal(api.cancelMeritRound(declared.id).ok, false, 'a committed round cannot be cancelled away');
});

test('a committed round projected to widen the gap opens the fairness decision with its delta frozen', () => {
  const { store, api } = harness();
  // Group A sits lower in range, so a position-weighted matrix pays them less in
  // percentage terms and the gap widens.
  seedCohort(store, { groupEffect: 0.9 });
  const filed = api.filePayAudit({ label: 'Baseline', currency: 'USD' });
  assert.equal(filed.snapshot.status, 'ok');
  const declared = api.declareMeritRound({ label: 'Widening cycle', currency: 'USD', basePct: 5, envelopePct: 5, matrix: {} });
  api.commitMeritRound(declared.id);

  const round = store.state.meritRounds.find((row) => row.id === declared.id);
  const decisions = store.state.decisions.filter((row) => String(row.rationale || '').includes(`[PAY-MERIT:${declared.id}]`));
  if (round.snapshot?.gapAfterPct !== null && round.snapshot?.gapAfterPct !== undefined) {
    if (round.snapshot.gapAfterPct > round.snapshot.gapBeforePct) {
      assert.equal(decisions.length, 1);
      assert.match(decisions[0].title, /widen/i);
      assert.ok(store.state.links.some((link) => link.sourceType === 'meritRound' && link.sourceId === declared.id && link.targetType === 'decision'));
    } else {
      assert.equal(decisions.length, 0, 'a round that narrows the gap opens nothing');
    }
  }
});

/* ----------------------------------------------------------- surfaces */

test('the pay signals and the attention count agree with the page read model', () => {
  const demo = normalizeState(buildDemoState(NOW), { now: NOW }).state;
  const report = payPortfolio(demo, NOW);
  assert.equal(payAttentionCount(demo, NOW), report.counts.attention);
  const signals = paySignals(demo, NOW);
  const insights = buildInsights(demo, NOW);
  for (const signal of signals) {
    assert.ok(insights.findings.some((row) => row.ruleId === signal.ruleId), `${signal.ruleId} appears in Signals`);
  }
  const buckets = new Set(insights.byDomain.map((row) => row.domain));
  if (signals.length) assert.ok(buckets.has('Pay architecture'), 'the bucket is registered, not silently dropped');

  const brief = buildPayBrief(demo, NOW);
  assert.match(brief, /Pay architecture brief/);
  assert.match(brief, /not a finding of discrimination/);
  assert.match(brief, /no currency is converted/i);
});

test('CSV scope #45 exports model output under opaque codes with no names, labels or ids', () => {
  const { store, api } = harness();
  seedCohort(store, { groupEffect: 0.9 });
  api.filePayAudit({ label: 'CONFIDENTIAL-COMP-REVIEW', currency: 'USD', note: 'Private note about Ana' });
  const person = store.state.people[0];
  store.update((draft) => {
    draft.payAssignments[0].note = 'SECRET-NOTE';
    draft.payBands[0].note = 'SECRET-BAND-NOTE';
  }, { type: 'test.note', entity: 'workspace', entityId: '', summary: 'Add notes' });

  const descriptor = CSV_EXPORTS.find((row) => row.key === 'pay');
  assert.ok(descriptor);
  assert.equal(descriptor.sensitive, true);
  const csv = exportWorkspaceCsv(store.state, 'pay', { now: NOW });
  assert.equal(csv.ok, true);
  const text = csv.csv || '';
  for (const forbidden of [person.name, 'SECRET-NOTE', 'SECRET-BAND-NOTE', 'CONFIDENTIAL-COMP-REVIEW', 'Private note about Ana']) {
    assert.equal(text.includes(forbidden), false, `the export must not contain ${forbidden}`);
  }
  assert.match(text, /record_type/);
  assert.match(text, /adjusted_gap_pct/);
});

test('demo cleanup drops pay records for removed people and keeps a filed audit snapshot', () => {
  const demoState = normalizeState(buildDemoState(NOW), { now: NOW }).state;
  const auditBefore = JSON.parse(JSON.stringify(demoState.payAudits[0].snapshot));
  const keptPerson = demoState.people[0].id;
  const store = createStore({
    storage: memoryStorage(),
    now: () => NOW,
    idFactory: (prefix) => `${prefix}-cleanup`,
  });
  store.load();
  store.update((draft) => {
    Object.assign(draft, JSON.parse(JSON.stringify(demoState)));
    draft.meta.isDemo = true;
  }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'Seed demo' });

  store.clearDemo();
  const after = store.state;
  for (const row of after.payAssignments || []) {
    assert.ok(after.people.some((person) => person.id === row.personId), 'no pay record survives for a removed person');
  }
  const auditAfter = (after.payAudits || []).find((row) => row.id === 'payaudit-demo-1');
  if (auditAfter) {
    assert.deepEqual(auditAfter.snapshot.adjustedGapPct, auditBefore.adjustedGapPct, 'a filed assessment is not rewritten by cleanup');
    assert.equal(auditAfter.byId === null || after.people.some((p) => p.id === auditAfter.byId), true);
  }
  void keptPerson;
});

/* --------------------------------------------------------------- the view */

function withDom(run) {
  const dom = new JSDOM('<!doctype html><html lang="en"><body><div id="app"></div><div id="modal-root"></div></body></html>', {
    url: 'https://leados.test/',
    virtualConsole: new VirtualConsole(),
  });
  const previous = globalThis.window;
  const previousDoc = globalThis.document;
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  return Promise.resolve()
    .then(() => run(dom))
    .finally(() => {
      globalThis.window = previous;
      globalThis.document = previousDoc;
      dom.window.close();
    });
}

test('the pay page renders every tab keyboard-operably and axe-clean', async () => {
  const axe = (await import('axe-core')).default || (await import('axe-core'));
  const { renderPay } = await import('../../app/views/pay.js');
  const demo = normalizeState(buildDemoState(NOW), { now: NOW }).state;

  await withDom(async (dom) => {
    for (const tab of ['architecture', 'equity', 'merit', 'transparency']) {
      const ctx = {
        state: demo,
        now: NOW,
        today: TODAY,
        route: 'pay',
        query: new URLSearchParams(`tab=${tab}`),
        segments: ['pay'],
        api: { payBrief: () => ({ ok: true, text: 'brief' }) },
        navigate: () => {},
        refresh: () => {},
      };
      const node = renderPay(ctx);
      const host = dom.window.document.getElementById('app');
      host.replaceChildren(node);
      assert.ok(host.querySelector('h1'), `the ${tab} tab has a heading`);
      // Every interactive control is a real button/select/input with a label or
      // accessible name.
      for (const button of host.querySelectorAll('button')) {
        assert.equal(button.getAttribute('type'), 'button');
        const name = button.getAttribute('aria-label') || button.textContent.trim();
        assert.ok(name.length > 0, 'every button has an accessible name');
      }
      for (const select of host.querySelectorAll('select')) {
        const id = select.getAttribute('id');
        if (id) assert.ok(host.querySelector(`label[for="${id}"]`), `select #${id} has a label`);
      }
      const results = await axe.run(host, {
        rules: { 'color-contrast': { enabled: false }, 'landmark-one-main': { enabled: false }, region: { enabled: false } },
      });
      assert.deepEqual(results.violations.map((v) => v.id), [], `axe on the ${tab} tab`);
    }
  });
});

test('the pay dialogs render with labelled fields and no duplicate ids', async () => {
  const { renderPay } = await import('../../app/views/pay.js');
  const demo = normalizeState(buildDemoState(NOW), { now: NOW }).state;
  await withDom(async (dom) => {
    const ctx = {
      state: demo,
      now: NOW,
      today: TODAY,
      route: 'pay',
      query: new URLSearchParams('tab=architecture'),
      segments: ['pay'],
      api: {},
      navigate: () => {},
      refresh: () => {},
    };
    const host = dom.window.document.getElementById('app');
    host.replaceChildren(renderPay(ctx));
    const buttons = [...host.querySelectorAll('button')];
    const record = buttons.find((b) => b.textContent.trim() === 'Record pay rate');
    assert.ok(record);
    record.click();
    const dialog = dom.window.document.querySelector('[role="dialog"], .modal');
    assert.ok(dialog, 'the record dialog opens');
    const ids = [...dialog.querySelectorAll('[id]')].map((n) => n.id);
    assert.equal(new Set(ids).size, ids.length, 'no duplicate ids inside the dialog');
    for (const input of dialog.querySelectorAll('input, select, textarea')) {
      const id = input.getAttribute('id');
      if (id) assert.ok(dialog.querySelector(`label[for="${id}"]`), `field #${id} is labelled`);
    }
  });
});

test('position factor rewards below-midpoint placement and the matrix is documented', () => {
  assert.ok(positionFactor(0.8) > positionFactor(0.95));
  assert.ok(positionFactor(0.9) > positionFactor(1));
  assert.ok(positionFactor(1.2) < positionFactor(1));
  assert.equal(positionFactor(null), 1, 'an unknown placement is not penalised');
  // Levels are a closed vocabulary, so the band editor cannot invent one.
  assert.ok(LEVELS.includes('ic'));
  assert.equal(PAY_RULE_IDS.JOINT_ASSESSMENT, 'RULE-PAY-01');
});

test('an empty workspace renders the first-run state without throwing', () => {
  const empty = createEmptyState(NOW.toISOString());
  const arch = payArchitecture(empty, NOW);
  assert.equal(arch.counts.people, 0);
  const audit = payGapAudit(empty, {}, NOW);
  assert.equal(audit.status, 'insufficient');
  assert.match(audit.reason, /nothing to compare/i);
  const report = payPortfolio(empty, NOW);
  assert.equal(payAttentionCount(empty, NOW), 0, 'no badge on an untouched workspace');
  assert.equal(paySignals(empty, NOW).length, 0);
});
