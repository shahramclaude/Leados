/**
 * tests/app/calibrated-allocation.test.mjs — ADR-0097, Schema v99.
 *
 * The Calibrated Allocator, proven end to end:
 *
 *  1. CERTIFIED SCALE. The certified branch-and-bound proves the IDENTICAL
 *     printed values the enumerator proves (Wald maximin, Savage minimax
 *     regret, per-scenario oracles, price of fairness, stress switches, regret
 *     release) on a seeded fixture sweep; a plan past the enumeration bound is
 *     adopted through the real API with its certificate frozen; an exhausted
 *     node budget and an out-of-regime instance are REFUSED, never approximated.
 *  2. CLOSED-LOOP EVIDENCE. Settled prospective grades (records the ADR-0094
 *     module owns) are read back by altitude × instrument cell with the Wilson
 *     interval, the cell floor, complementary suppression and the director-rank
 *     gate; a cell more falsified than reached is flagged TENSION; plans whose
 *     actions declare that instrument show the graded reading beside their
 *     declared range. The engine NEVER moves a declared range — a revision is
 *     a new frozen plan (supersedesId) declared by a human.
 *  3. RULE-RAL-05 on the SHARED spine: one governed premise–evidence tension
 *     decision per cell per ISO week, marker-idempotent, with one rolls-up-to
 *     edge per leadership ancestor of the anchoring plan's span — counts and
 *     intervals only, never a cohort id, contract id, plan title or person.
 *  4. Schema v99 (additive 98 → 99), fail-closed normalizers for the new
 *     evidence fields and the provenance certificate, and the leak oracle on
 *     the new Calibration panel and the register-mounted Certificate panel.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import axe from 'axe-core';

import { createApi } from '../../app/actions.js';
import { CSV_EXPORTS } from '../../app/core/csv.js';
import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import {
  buildCalibrationCells, buildRobustAllocationReport, robustAllocationBriefText, solveRobustPlan,
} from '../../app/core/domain/robustAllocation.js';
import { ROBUST_ALLOCATION_MARKER_KINDS } from '../../app/core/domain/robustAllocationRegistry.js';
import {
  normalizeRobustAllocationSettings, normalizeRobustPlan, validateRobustAllocationDeclaration,
} from '../../app/core/domain/robustAllocationSchema.js';
import { renderRobustAllocation } from '../../app/views/robustAllocation.js';

const dom = new JSDOM('<!doctype html><html><body><div id="view"></div></body></html>', { url: 'https://leados.test/', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
globalThis.Element = dom.window.Element;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Event = dom.window.Event;

const NOW = new Date('2026-11-04T12:00:00.000Z');
const clone = (value) => JSON.parse(JSON.stringify(value));
const NAMES = ['Vera Executive', 'Dana Director', 'Mira Manager', 'Malik Manager', 'Lee Lead', 'Pat Lead'];
const CONTRACT_SENTINEL = 'pc-SENTINEL-NEVER-EXPORTS';

function tree({ activeSeatId = null, settings = {} } = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.settings = { ...state.settings, chainLeaderAltitude: 'chief', activeSeatId, ...settings };
  for (const key of Object.keys(state.settings)) if (key.endsWith('AutoPropagate')) state.settings[key] = false;
  state.settings.robustAllocationAutoPropagate = true;
  state.people = [
    { id: 'vp1', name: 'Vera Executive', role: 'VP', level: 'vp', team: 'Ops', status: 'active' },
    { id: 'dir1', name: 'Dana Director', role: 'Director', level: 'director', team: 'Ops', managerId: 'vp1', status: 'active' },
    { id: 'mgr1', name: 'Mira Manager', role: 'Manager', level: 'manager', team: 'Billing', managerId: 'dir1', status: 'active' },
    { id: 'mgr2', name: 'Malik Manager', role: 'Manager', level: 'manager', team: 'Claims', managerId: 'dir1', status: 'active' },
    { id: 'lead1', name: 'Lee Lead', role: 'Lead', level: 'lead', team: 'Billing', managerId: 'mgr1', status: 'active' },
    { id: 'lead2', name: 'Pat Lead', role: 'Lead', level: 'lead', team: 'Claims', managerId: 'mgr2', status: 'active' },
    { id: 'ic1', name: 'Ira Analyst', role: 'Analyst', level: 'ic', team: 'Billing', managerId: 'lead1', status: 'active' },
    { id: 'ic2', name: 'Ida Analyst', role: 'Analyst', level: 'ic', team: 'Claims', managerId: 'lead2', status: 'active' },
  ];
  return state;
}

function normalize(state) {
  return normalizeState(state, { now: NOW }).state;
}

function harness(state = tree({ activeSeatId: 'lead1' })) {
  const seeded = normalize(state);
  seeded.settings.activeSeatId = state.settings.activeSeatId;
  const values = new Map([[STORAGE_KEY, JSON.stringify(seeded)]]);
  const storage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let current = NOW;
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-cal-${++seq}`;
  const store = createStore({ storage, now: () => current, idFactory });
  store.load();
  const api = createApi(store, { now: () => current, idFactory });
  return { store, api, setNow: (value) => { current = value; } };
}

/** Graded prospective evidence, written as rows the ADR-0094 module owns. */
function seedEvidence(state) {
  const mk = (n, [reached, falsified], instrumentKey, scopeSeatId, altitudeKey) => {
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const id = `${CONTRACT_SENTINEL}-${altitudeKey}-${instrumentKey}-${i}`;
      state.prospectiveContracts.push({
        id, title: 'sentinel', declaredOn: '2026-09-01', horizonOn: '2026-10-01',
        scopeSeatId, altitudeKey, rank: 1, instrumentKey,
        probabilityPct: 60, thresholdPct: 80, cohortN: 6, cohortIds: ['c1', 'c2'],
        cohortFingerprint: 'fp', engineVersion: 'prospective-ledger-v1', createdAt: '2026-09-01T00:00:00.000Z',
      });
      state.prospectiveGrades.push({
        id: `g-${id}`, contractId: id, gradedOn: '2026-10-02', declaredOn: '2026-09-01', horizonOn: '2026-10-01',
        scopeSeatId, altitudeKey, rank: 1, instrumentKey,
        probabilityPct: 60, thresholdPct: 80, cohortN: 6, observedN: 6,
        reachedN: i < reached ? 6 : 0, observedPct: i < reached ? 100 : 10,
        outcome: i < reached ? 1 : 0, brier: 0.5, baseRatePct: 50, referenceBrier: 0.5, late: false,
        engineVersion: 'prospective-ledger-v1', createdAt: '2026-10-02T00:00:00.000Z',
      });
    }
    return out;
  };
  // 6 graded at frontline × delegation-closure: 1 reached, 5 falsified → tension
  mk(6, [1, 5], 'delegation-closure', 'lead1', 'frontline');
  // 5 graded at director × oneonone-cadence: 4 reached → supported
  mk(5, [4, 1], 'oneonone-cadence', 'dir1', 'director');
  // 3 graded at manager × case-resolution → below the floor of 4
  mk(3, [2, 1], 'case-resolution', 'mgr1', 'manager');
}

function declaration(overrides = {}) {
  return {
    title: 'SENTINEL-PLAN',
    outcomeLabel: 'on-time completions',
    currency: 'EUR',
    budgetCap: 100,
    hoursCap: 40,
    horizonDays: 14,
    gamma: 1,
    segments: [{ key: 'seg-a', label: 'Billing', size: 10, floorCoverage: 1 }],
    actions: [
      { key: 'x', label: 'Coaching block', segmentKey: 'seg-a', unitCost: 10, unitHours: 5, unitCoverage: 1, effectLo: 2, effectHi: 6, maxUnits: 4, evidenceInstrumentKey: 'delegation-closure' },
      { key: 'y', label: 'Process fix', segmentKey: 'seg-a', unitCost: 10, unitHours: 5, unitCoverage: 1, effectLo: 1, effectHi: 8, maxUnits: 4 },
    ],
    ...overrides,
  };
}

/* ------------------------------------------------------------- schema v99 */

test('schema v99: additive 98 → 99, node-budget default, fail-closed evidence and certificate fields', () => {
  assert.equal(SCHEMA_VERSION, 113);
  const v98 = normalize(tree());
  v98.schemaVersion = 98;
  delete v98.settings.robustAllocationNodeBudget;
  const migrated = migrate(clone(v98));
  assert.deepEqual(migrated.applied, ['98 → 99', '99 → 100', '100 → 101', '101 → 102', '102 → 103', '103 → 104', '104 → 105', '105 → 106', '106 → 107', '107 → 108', '108 → 109', '109 → 110', '110 → 111', '111 → 112', '112 → 113']);
  assert.equal(migrated.raw.settings.robustAllocationNodeBudget, 250000);
  // Evidence instrument: unknown keys fail closed to null; known keys persist.
  const plan = normalizeRobustPlan({
    ...declaration(), id: 'p1', declaredOn: '2026-11-04', horizonOn: '2026-11-18',
    supersedesId: 'p0',
    actions: [
      { ...declaration().actions[0], evidenceInstrumentKey: 'delegation-closure' },
      { ...declaration().actions[1], evidenceInstrumentKey: 'keystrokes' },
    ],
  });
  assert.ok(plan);
  assert.equal(plan.actions[0].evidenceInstrumentKey, 'delegation-closure');
  assert.equal(plan.actions[1].evidenceInstrumentKey, null, 'an invented instrument is dropped, never guessed');
  assert.equal(plan.supersedesId, 'p0');
  // A v98-era frozen solution carries an honest legacy provenance certificate.
  const adopted = normalizeRobustPlan({
    ...declaration(), id: 'p2', declaredOn: '2026-11-04', horizonOn: '2026-11-18', status: 'adopted',
    frozen: {
      robustUnits: [1, 1], robustWorstCase: 3, robustOptimistic: 14, robustMaxRegret: 5,
      minimaxUnits: [1, 2], minimaxMaxRegret: 4, optimisticUnits: [2, 2], optimisticWorstCase: 1,
      priceOfFairness: 2, committedHours: 10, committedBudget: 20,
      stressSwitches: [], topExposureAction: 'x', regretRelease: 0,
    },
  });
  assert.ok(adopted);
  assert.equal(adopted.frozen.certificate.engine, 'enumeration');
  assert.equal(adopted.frozen.certificate.certified, true);
  assert.equal(adopted.frozen.certificate.nodes, null, 'pre-certificate era is stated, not back-filled');
  const settings = normalizeRobustAllocationSettings({ robustAllocationNodeBudget: 5 });
  assert.equal(settings.robustAllocationNodeBudget, 25000, 'clamped to the declared floor');
  // A declaration naming a non-instrument is refused loudly at validation.
  const refused = validateRobustAllocationDeclaration(declaration({
    actions: [{ ...declaration().actions[0], evidenceInstrumentKey: 'vibes' }],
  }));
  assert.equal(refused.ok, false);
  assert.equal(refused.field, 'actions');
});

/* ----------------------------------------- certified scale: bnb ≡ enum */

test('the certified branch-and-bound prints the IDENTICAL values the enumerator prints (seeded sweep)', () => {
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  let compared = 0;
  for (let t = 0; t < 24; t += 1) {
    const segN = pick(1, 3);
    const actN = pick(2, 5);
    const segments = Array.from({ length: segN }, (_, i) => ({ key: `s${i}`, label: `S${i}`, size: pick(4, 12), floorCoverage: rand() < 0.5 ? 0 : pick(1, 3) }));
    const actions = Array.from({ length: actN }, (_, i) => {
      const lo = pick(0, 8);
      return {
        key: `a${i}`, label: `A${i}`, segmentKey: `s${pick(0, segN - 1)}`,
        unitCost: pick(1, 8), unitHours: pick(1, 5), unitCoverage: pick(1, 3),
        effectLo: lo, effectHi: lo + pick(0, 12), maxUnits: pick(1, 8),
      };
    });
    const plan = { segments, actions, gamma: pick(0, actN), budgetCap: pick(10, 40), hoursCap: pick(6, 30) };
    const en = solveRobustPlan(plan, { maxCombinations: 500000 });
    const bn = solveRobustPlan(plan, { maxCombinations: 1, nodeBudget: 500000 });
    assert.equal(bn.ok, en.ok, `fixture ${t} refusal parity (${en.reason || bn.reason})`);
    if (!en.ok) continue;
    compared += 1;
    assert.equal(bn.certificate.engine, 'branch-and-bound');
    assert.equal(en.certificate.engine, 'enumeration');
    for (const key of ['robustUnits', 'robustWorstCase', 'robustOptimistic', 'robustMaxRegret', 'minimaxUnits', 'minimaxMaxRegret', 'optimisticUnits', 'optimisticWorstCase', 'priceOfFairness', 'stressSwitches', 'topExposureAction', 'regretRelease', 'committedHours', 'committedBudget']) {
      assert.deepEqual(bn[key], en[key], `fixture ${t}: ${key} identical`);
    }
  }
  assert.ok(compared >= 12, `the sweep compared ${compared} feasible fixtures`);
});

test('an over-enumeration-bound plan is ADOPTED through the real API with a frozen certificate and full spine fan-out', () => {
  const { store, api } = harness(tree({ activeSeatId: 'lead1' }));
  const overCap = declaration({
    gamma: 2,
    budgetCap: 100000,
    hoursCap: 10000,
    segments: [{ key: 'seg-a', label: 'Billing', size: 1000, floorCoverage: 2 }],
    actions: Array.from({ length: 5 }, (_, i) => ({
      key: `a${i}`, label: `Line ${i}`, segmentKey: 'seg-a',
      unitCost: 2 + i, unitHours: 3, unitCoverage: 2, effectLo: 2 + i, effectHi: 7 + i, maxUnits: 8,
    })),
  }); // 9^5 = 59,049 combinations — above the 50,000 enumeration bound
  const declared = api.robustAllocationDeclare(overCap);
  assert.equal(declared.ok, true, declared.error);
  const adopted = api.robustAllocationAdopt(declared.id);
  assert.equal(adopted.ok, true, adopted.error);
  const row = store.state.robustPlans.find((p) => p.id === declared.id);
  assert.equal(row.frozen.certificate.engine, 'branch-and-bound');
  assert.equal(row.frozen.certificate.certified, true);
  assert.ok(row.frozen.certificate.nodes > 0);
  assert.ok(row.frozen.certificate.nodes <= row.frozen.certificate.budget);
  // The SAME spine fan-out as any adoption: governed decision + tasks + roll-up.
  const decision = store.state.decisions.find((d) => /Adopt the robust allocation/.test(d.title));
  assert.ok(decision, 'RULE-RAL-01 opened the governed adoption decision');
  const funded = row.frozen.robustUnits.filter((u) => u > 0).length;
  const tasks = store.state.delegations.filter((d) => /Deliver .* unit/.test(d.title));
  assert.equal(tasks.length, funded, 'one owned delivery task per funded line');
  const rollups = store.state.links.filter((l) => l.sourceType === 'robustplan' && l.relation === 'rolls-up-to');
  const targets = new Set(rollups.map((l) => l.targetId));
  for (const ancestor of ['mgr1', 'dir1', 'vp1']) assert.ok(targets.has(ancestor), `rolls up to ${ancestor}`);
});

test('an exhausted node budget and an out-of-regime instance are REFUSED, never approximated', () => {
  const big = {
    segments: [{ key: 'a', label: 'A', size: 1000, floorCoverage: 0 }],
    actions: Array.from({ length: 5 }, (_, i) => ({ key: `a${i}`, label: `A${i}`, segmentKey: 'a', unitCost: 1, unitHours: 1, unitCoverage: 1, effectLo: 1, effectHi: 6 + (i % 2), maxUnits: 8 })),
    gamma: 2, budgetCap: 1000, hoursCap: 1000,
  };
  const starved = solveRobustPlan(big, { maxCombinations: 100, nodeBudget: 30 });
  assert.equal(starved.ok, false);
  assert.match(starved.reason, /node budget/i);
  const huge = { ...big, actions: [...big.actions, { key: 'a5', label: 'Z', segmentKey: 'a', unitCost: 1, unitHours: 1, unitCoverage: 1, effectLo: 1, effectHi: 2, maxUnits: 8 }] };
  const structural = solveRobustPlan(huge, { maxCombinations: 100, nodeBudget: 2000000 });
  assert.equal(structural.ok, false);
  assert.match(structural.reason, /unit sum/i);
});

/* ------------------------------------------- closed-loop evidence cells */

test('calibration cells: Wilson, floor refusal, complementary suppression, rank gate, tension flag', () => {
  const state = normalize(tree({ activeSeatId: 'dir1' }));
  seedEvidence(state);
  const seatRank3 = { id: 'dir1', fullAccess: false, rank: 3, scope: new Set(['lead1', 'mgr1', 'mgr2', 'lead2']) };
  const conventions = normalizeRobustAllocationSettings({});
  const cells = buildCalibrationCells(state, { seat: seatRank3, conventions, plans: [] });
  assert.equal(cells.length, 3);
  const tension = cells.find((c) => c.instrumentKey === 'delegation-closure');
  assert.equal(tension.gradedN, 6);
  assert.equal(tension.tension, true, 'more falsified than reached at floor → TENSION');
  assert.ok(tension.reachedPct !== null);
  const thin = cells.find((c) => c.instrumentKey === 'case-resolution');
  assert.equal(thin.refused, true);
  assert.match(thin.reason, /floor/);
  const suppressed = cells.find((c) => c.instrumentKey === 'oneonone-cadence');
  assert.equal(suppressed.suppressed, true, 'the smallest surviving sibling cell is blanked beside the sub-floor cell');
  assert.equal(suppressed.reachedPct, null);
  // Below director rank every pooled rate is withheld with a printed reason.
  const seatRank1 = { id: 'lead1', fullAccess: false, rank: 1, scope: new Set() };
  const cellsLow = buildCalibrationCells(state, { seat: seatRank1, conventions, plans: [] });
  assert.ok(cellsLow.every((c) => c.refused && /below director rank/i.test(c.reason)));
  assert.ok(cellsLow.every((c) => c.tension === false));
});

test('a plan resting on a tensioned instrument shows the graded reading; a revision is a new frozen plan', () => {
  const state = tree({ activeSeatId: 'dir1' });
  seedEvidence(state);
  const { store, api } = harness(state);
  const declared = api.robustAllocationDeclare(declaration());
  assert.equal(declared.ok, true, declared.error);
  const report = buildRobustAllocationReport(store.state, { now: NOW, planId: declared.id });
  assert.equal(report.calibration.gradedN, 14);
  assert.equal(report.calibration.tensionN, 1);
  const line = report.selectedDetail.actions.find((a) => a.key === 'x');
  assert.ok(line.evidence, 'the declared instrument is annotated with its graded reading');
  assert.equal(line.evidence.refused, false);
  assert.equal(line.evidence.tension, true);
  assert.equal(Math.round(line.evidence.reachedPct), 17, '1 of 6 graded contracts reached the threshold');
  const bare = report.selectedDetail.actions.find((a) => a.key === 'y');
  assert.equal(bare.evidence, undefined, 'no declared instrument → no reading');
  // The engine never moves a range: the human declares a revision that
  // SUPERSEDES the first plan and freezes separately.
  const revision = api.robustAllocationDeclare(declaration({ title: 'SENTINEL-PLAN v2', supersedesId: declared.id }));
  assert.equal(revision.ok, true, revision.error);
  const rows = store.state.robustPlans;
  assert.equal(rows.length, 2);
  const child = rows.find((r) => r.id === revision.id);
  assert.equal(child.supersedesId, declared.id);
  assert.equal(child.status, 'draft');
  assert.equal(rows.find((r) => r.id === declared.id).status, 'draft', 'the earlier plan is never edited');
  // A revision naming a peer or unknown plan is refused.
  const peer = api.robustAllocationDeclare(declaration({ title: 'x', supersedesId: 'ral-no-such-plan' }));
  assert.equal(peer.ok, false);
});

/* --------------------------------------------------------------- RULE-RAL-05 */

test('RULE-RAL-05: one governed tension decision per cell per ISO week, rolled up the chain, identity-free', () => {
  const state = tree({ activeSeatId: 'lead1' });
  seedEvidence(state);
  const { store, api, setNow } = harness(state);
  const declared = api.robustAllocationDeclare(declaration());
  assert.equal(declared.ok, true);
  const before = store.state.decisions.length;
  const scan = api.robustAllocationScan();
  assert.equal(scan.ok, true);
  const fresh = store.state.decisions.slice(before);
  const tension = fresh.filter((d) => /RULE-RAL-05/.test(d.rationale || ''));
  assert.equal(tension.length, 1, 'exactly one tension decision for the tensioned cell in scope');
  const decision = tension[0];
  assert.match(decision.question, /Wilson 95%/);
  assert.match(decision.question, /1 reached the frozen threshold and 5 missed it/);
  assert.ok(!decision.question.includes(CONTRACT_SENTINEL), 'no contract id in the governed text');
  assert.ok(!decision.question.includes('SENTINEL-PLAN'), 'no plan title in the governed text');
  assert.ok(!NAMES.some((n) => decision.question.includes(n)), 'no person named');
  // One rolls-up-to edge per leadership ancestor of the anchoring span (lead1).
  const rollups = (store.state.links || []).filter((l) => l.ruleId === 'RULE-RAL-05' && l.relation === 'rolls-up-to');
  const targets = new Set(rollups.map((l) => l.targetId));
  for (const ancestor of ['mgr1', 'dir1', 'vp1']) assert.ok(targets.has(ancestor), `tension rolls up to ${ancestor}`);
  assert.ok((store.state.robustMarkers || []).some((m) => m.kind === 'premise-tension' && m.decisionId === decision.id));
  // Marker-idempotent: a same-week scan opens nothing new.
  const again = store.state.decisions.length;
  api.robustAllocationScan();
  assert.equal(store.state.decisions.length, again, 'no duplicate tension decision in the same ISO week');
  // The governed finding surfaces on the module's open-findings read.
  const report = buildRobustAllocationReport(store.state, { now: NOW });
  assert.ok(report.openDecisions.some((d) => d.ruleId === 'RULE-RAL-05'));
  // Next ISO week: the finding cadence is weekly, so a new one MAY open.
  setNow(new Date('2026-11-16T12:00:00.000Z'));
  api.robustAllocationScan();
  const weekly = store.state.decisions.filter((d) => /RULE-RAL-05/.test(d.rationale || ''));
  assert.equal(weekly.length, 2, 'exactly one per ISO week');
});

/* -------------------------------------------------- brief, register, axe */

test('the brief carries the calibration section with no ids, and the CSV surface is unchanged', () => {
  const state = tree({ activeSeatId: 'vp1' });
  seedEvidence(state);
  const { api } = harness(state);
  api.robustAllocationDeclare(declaration());
  const brief = robustAllocationBriefText(api.robustAllocationRead());
  assert.ok(brief.includes('Evidence calibration'), 'the brief has the calibration block');
  assert.ok(!brief.includes(CONTRACT_SENTINEL), 'no contract id');
  assert.ok(!brief.includes('ral-'), 'no ledger id');
  assert.ok(!NAMES.some((n) => brief.includes(n)), 'no person named');
  assert.equal(CSV_EXPORTS.length, 102, 'ADR-0102 added scope #98; the register still governs releases');
  assert.ok(ROBUST_ALLOCATION_MARKER_KINDS.includes('premise-tension'), 'the tension marker kind is declared');
});

test('the Calibration panel and the register-mounted Certificate panel render axe-clean at four altitudes', async () => {
  const state0 = tree();
  seedEvidence(state0);
  const state = normalize(state0);
  state.settings.activeSeatId = 'dir1';
  for (const seatId of ['lead1', 'mgr1', 'dir1', 'vp1']) {
    const copy = clone(state);
    copy.settings.activeSeatId = seatId;
    const report = buildRobustAllocationReport(copy, { now: NOW });
    for (const panel of ['calibration', 'certificate']) {
      const node = renderRobustAllocation({
        state: copy,
        now: NOW,
        query: new URLSearchParams(`panel=${panel}`),
        navigate: () => {},
        refresh: () => {},
        api: {
          robustAllocationRead: () => report,
          robustAllocationDeclare: () => ({ ok: true }),
          robustAllocationAdopt: () => ({ ok: true }),
          robustAllocationScan: () => ({ ok: true }),
          robustAllocationSetConventions: () => ({ ok: true }),
          robustAllocationBriefText: () => ({ ok: true, text: '' }),
          robustAllocationCsvRows: () => ({ ok: true, rows: [] }),
          prospectiveRead: () => ({ rows: [] }),
          differencesRead: () => ({ ok: true, routes: [] }),
          differencesPlan: () => ({ ok: false, error: 'not in this test' }),
          differencesPublish: () => ({ ok: false, error: 'not in this test' }),
        },
      });
      const root = dom.window.document.createElement('div');
      root.appendChild(node);
      dom.window.document.getElementById('view').replaceChildren(root);
      const results = await axe.run(root);
      const violations = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
      assert.deepEqual(violations.map((v) => v.id), [], `${panel} at ${seatId} has no critical/serious axe violations`);
    }
  }
});
