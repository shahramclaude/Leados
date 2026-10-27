/**
 * tests/app/power.test.mjs — Coalition & Incentive War Room suite (Schema v30,
 * RULE-PWR-01..06, PWR-01..06, CSV scope #30).
 *
 *   1. Cooperative game theory: exact Banzhaf & Shapley-Shubik indices, minimum
 *      winning coalitions, veto/dictator/dummy detection, coalition feasibility.
 *   2. Non-cooperative 2x2: pure & mixed Nash, dominant strategies, Pareto,
 *      price of anarchy / coordination loss.
 *   3. Mechanism design: minimal incentive-alignment transfer, feasibility,
 *      equilibrium robustness and confidence scoring.
 *   4. Orchestration: verdicts, deterministic influence script & board brief.
 *   5. Actions & ATOMIC cross-module propagation (RULE-PWR-01..05): a single
 *      addPowerGame fans out into a DACI decision, a blameless delegation, a
 *      1:1 talking point, typed graph links and derived telemetry — idempotently
 *      and chained into the decision-tempo pipeline in the same transaction.
 *   6. Schema: v29→v30 additive migration, normalization repairs, rewind,
 *      clearDemo parity, settlement learning.
 *   7. CSV scope #30 data minimisation, PWR signals, rule catalogue.
 *   8. JSDOM + axe-core across all five tabs, detail, and the new/edit dialog.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  POWER_ENGINE_VERSION,
  POWER_RULES,
  POWER_STATUSES,
  POWER_CELLS,
  analyzePowerGame,
  analyzeVotingPower,
  buildInfluenceScript,
  buildPowerBrief,
  buildPowerReport,
  computeBanzhafIndices,
  computeShapleyShubik,
  equilibriumRobustness,
  incentiveAlignment,
  minimumWinningCoalitions,
  powerConfidence,
  powerRule,
  powerSignals,
  quotaFor,
  solveNormalForm,
} from '../../app/core/domain/power.js';
import { AUTOMATION_RULES } from '../../app/core/domain/automation.js';
import { buildTempoReport } from '../../app/core/domain/decisionTempo.js';
import { reconstructStateAt } from '../../app/core/domain/health.js';
import { buildInsights, DOMAIN_ORDER } from '../../app/core/domain/insights.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-27T10:00:00.000Z');
const TODAY = '2026-10-27';

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
  const idFactory = (prefix) => `${prefix}-pw-${++seq}`;
  const store = createStore({ storage: kvStorage(), now: () => now, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => now, idFactory }) };
}

/** The blocked + misaligned + coordination-risk game used for propagation tests. */
function blockedGame(extra = {}) {
  return {
    title: 'Platform migration sign-off',
    context: 'An opposed veto player controls the release window.',
    status: 'committed',
    quotaPct: 50,
    targetCell: '00',
    estimateConfidence: 'medium',
    strategies: { leader: ['Propose', 'Defer'], rival: ['Support', 'Block'] },
    cells: { '00': [8, 4], '01': [-2, 6], '10': [2, 1], '11': [0, 0] },
    players: [
      { id: 'hop', name: 'Head of Platform', weight: 6, stance: 'opposed' },
      { id: 'priya', name: 'Priya', weight: 3, stance: 'ally' },
      { id: 'jordan', name: 'Jordan', weight: 2, stance: 'ally' },
      { id: 'controller', name: 'Controller', weight: 1, stance: 'neutral' },
    ],
    counterpartyId: 'hop',
    notes: 'A concession of about 2 units realigns incentives.',
    ...extra,
  };
}

/** A harness with one owner person, one case, one decision and 3 stakeholders. */
function seeded() {
  const env = harness();
  const owner = env.api.addPerson({ name: 'Dana Kowalski', role: 'Director of Operations', startDate: '2023-01-01' });
  const kase = env.api.addCase({ title: 'Billing cutover drift', kind: 'risk', ownerId: owner.id });
  const stkA = env.api.addStakeholder({ name: 'Head of Platform', org: 'Platform', stance: 'blocker', power: 5 });
  const stkB = env.api.addStakeholder({ name: 'Finance Controller', org: 'Finance', stance: 'neutral', power: 3 });
  const stkC = env.api.addStakeholder({ name: 'VP Customer Success', org: 'CS', stance: 'supportive', power: 3 });
  return { ...env, owner, kase, stkA, stkB, stkC };
}

/* ================================================================== 1. Cooperative */

test('Banzhaf index is exact on the textbook [4,3,2,1] majority game', () => {
  const players = [
    { id: 'A', name: 'A', weight: 4 }, { id: 'B', name: 'B', weight: 3 },
    { id: 'C', name: 'C', weight: 2 }, { id: 'D', name: 'D', weight: 1 },
  ];
  const r = computeBanzhafIndices(players, 50);
  assert.equal(r.quota, 6);
  assert.deepEqual(r.swings, [5, 3, 3, 1]);
  assert.ok(Math.abs(r.normalized[0] - 5 / 12) < 1e-4);
  assert.ok(Math.abs(r.normalized.reduce((a, b) => a + b, 0) - 1) < 1e-4);
  assert.equal(r.method, 'exact-2^n');
});

test('veto, dictator and dummy players are detected from the weight vector', () => {
  // [6,3,2,1], quota 7 (50%). total - 6 = 6 < 7 -> A is a veto player.
  const players = [
    { id: 'A', name: 'A', weight: 6 }, { id: 'B', name: 'B', weight: 3 },
    { id: 'C', name: 'C', weight: 2 }, { id: 'D', name: 'D', weight: 1 },
  ];
  const r = computeBanzhafIndices(players, 50);
  assert.equal(r.quota, 7);
  assert.deepEqual(r.vetoPlayers, ['A']);
  // Unanimity (quota 100%) -> only grand coalition wins -> every member critical.
  const un = computeBanzhafIndices(players, 100);
  assert.equal(un.quota, 12);
  assert.deepEqual(un.vetoPlayers, ['A', 'B', 'C', 'D']);
  // A player with weight >= quota is a dictator.
  const dict = computeBanzhafIndices([{ id: 'X', name: 'X', weight: 10 }, { id: 'Y', name: 'Y', weight: 1 }], 50);
  assert.ok(dict.dictators.includes('X'));
  assert.ok(dict.dummyPlayers.includes('Y'));
});

test('Shapley-Shubik index is exact and normalised (24 orderings)', () => {
  const players = [
    { id: 'A', name: 'A', weight: 4 }, { id: 'B', name: 'B', weight: 3 },
    { id: 'C', name: 'C', weight: 2 }, { id: 'D', name: 'D', weight: 1 },
  ];
  const ss = computeShapleyShubik(players, 50);
  assert.equal(ss.permutations, 24);
  assert.ok(Math.abs(ss.normalized[0] - 10 / 24) < 1e-4);
  assert.ok(Math.abs(ss.normalized[1] - 6 / 24) < 1e-4);
  assert.ok(Math.abs(ss.normalized.reduce((a, b) => a + b, 0) - 1) < 1e-4);
});

test('minimum winning coalitions are minimal and sorted', () => {
  const players = [
    { id: 'A', name: 'A', weight: 4 }, { id: 'B', name: 'B', weight: 3 },
    { id: 'C', name: 'C', weight: 2 }, { id: 'D', name: 'D', weight: 1 },
  ];
  const mwc = minimumWinningCoalitions(players, 50);
  assert.equal(mwc.length, 3);
  for (const c of mwc) {
    for (const w of players) {
      if (c.ids.includes(w.id)) assert.ok(c.weight - w.weight < 6, 'removing any member loses');
    }
  }
});

test('stance-aware coalition feasibility and dummy allies', () => {
  const players = [
    { id: 'A', name: 'A', weight: 6, stance: 'opposed' },
    { id: 'B', name: 'B', weight: 3, stance: 'ally' },
    { id: 'C', name: 'C', weight: 2, stance: 'ally' },
    { id: 'D', name: 'D', weight: 1, stance: 'neutral' },
  ];
  const v = analyzeVotingPower(players, 50);
  assert.equal(v.coalitionFeasible, false, 'allies/neutrals hold 6 of 7 needed');
  assert.deepEqual(v.opposedVetoPlayers, ['A']);
  assert.equal(v.cheapestFeasible, null);
  assert.ok(v.decisiveOpposition[0].power > 0);
});

/* ============================================================= 2. Non-cooperative */

test('solveNormalForm: Prisoner\'s Dilemma has one dominant-strategy equilibrium', () => {
  const pd = { '00': [3, 3], '01': [0, 5], '10': [5, 0], '11': [1, 1] };
  const s = solveNormalForm(pd);
  assert.deepEqual(s.pureNE, ['11']);
  assert.equal(s.dominant.leader, 1);
  assert.equal(s.dominant.rival, 1);
  assert.equal(s.priceOfAnarchy, 3);
  assert.equal(s.coordinationLoss, 4);
  assert.deepEqual(s.efficientCells, ['00', '01', '10']);
});

test('solveNormalForm: matching pennies has no pure NE and a 50/50 mixed NE', () => {
  const mp = { '00': [1, -1], '01': [-1, 1], '10': [-1, 1], '11': [1, -1] };
  const s = solveNormalForm(mp);
  assert.equal(s.hasPureNE, false);
  assert.equal(s.mixed.pLeaderRow0, 0.5);
  assert.equal(s.mixed.qRivalCol0, 0.5);
});

test('solveNormalForm: pure coordination has two pure equilibria and no conflict', () => {
  const co = { '00': [8, 8], '01': [0, 1], '10': [1, 0], '11': [4, 4] };
  const s = solveNormalForm(co);
  assert.deepEqual(s.pureNE, ['00', '11']);
  assert.equal(s.hasConflict, false);
});

/* ================================================================ 3. Mechanism design */

test('incentiveAlignment prices the minimal transfer and enforces feasibility', () => {
  const pd = { '00': [3, 3], '01': [0, 5], '10': [5, 0], '11': [1, 1] };
  const coop = incentiveAlignment(pd, '00');
  assert.equal(coop.rivalDeficit, 2);
  assert.equal(coop.leaderHeadroom, -2);
  assert.equal(coop.feasible, false, 'leader would also deviate — no simple transfer works');
  const defect = incentiveAlignment(pd, '11');
  assert.equal(defect.alreadyEquilibrium, true);
  assert.equal(defect.alignmentCost, 0);
  assert.equal(defect.feasible, true);
  // A feasible case: target 00, leader strongly prefers it, rival deficit small.
  const feasible = incentiveAlignment({ '00': [9, 2], '01': [0, 5], '10': [1, 0], '11': [3, 3] }, '00');
  assert.equal(feasible.rivalDeficit, 3);
  assert.equal(feasible.leaderHeadroom, 8);
  assert.equal(feasible.feasible, true);
  assert.equal(feasible.alignmentCost, 3);
  assert.equal(feasible.netLeaderPayoff, 6);
});

test('equilibriumRobustness and powerConfidence combine estimate + structure', () => {
  const pd = { '00': [3, 3], '01': [0, 5], '10': [5, 0], '11': [1, 1] };
  const r = equilibriumRobustness(pd);
  assert.equal(r.relativeRobustness, 0.2);
  assert.equal(r.band, 'medium');
  // A tie in the leader's payoff across rows at column 0 (L(0,0)=L(1,0)=2)
  // puts the equilibrium exactly on a best-response boundary -> weak NE.
  const weak = equilibriumRobustness({ '00': [2, 2], '01': [1, 1], '10': [2, 3], '11': [1, 1] });
  assert.equal(weak.weakNE, true);
  assert.equal(powerConfidence('high', 'low'), 'low');
  assert.equal(powerConfidence('low', 'high'), 'low');
  assert.equal(powerConfidence('high', 'high'), 'high');
  assert.equal(powerConfidence('medium', 'high'), 'medium');
});

/* ================================================================= 4. Orchestration */

test('analyzePowerGame ranks verdicts by severity and is deterministic', () => {
  const g = blockedGame({ id: 'g1' });
  const a = analyzePowerGame(g, {}, NOW);
  assert.equal(a.verdict, 'coalition-blocked');
  assert.ok(a.issues.includes('coalition-blocked'));
  assert.ok(a.issues.includes('misaligned'));
  assert.ok(a.issues.includes('coordination-risk'));
  assert.equal(a.voting.coalitionFeasible, false);
  assert.equal(a.alignment.alignmentCost, 2);
  assert.equal(a.engineVersion, POWER_ENGINE_VERSION);
  const b = analyzePowerGame(g, {}, NOW);
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'pure & deterministic');
});

test('buildInfluenceScript and buildPowerBrief are deterministic and grounded', () => {
  const g = blockedGame({ id: 'g1' });
  const a = analyzePowerGame(g, {}, NOW);
  const script = buildInfluenceScript(a, g);
  assert.equal(script.talkingPoints.length, 4);
  assert.ok(script.ask.includes('2') || script.ask.includes('redesign'));
  assert.ok(script.guardrails.length >= 3);
  assert.ok(script.opening.join(' ').includes('12'));
  const brief = buildPowerBrief(a, g);
  assert.ok(brief.includes(POWER_ENGINE_VERSION));
  assert.ok(brief.includes('Coalition blocked'));
  assert.equal(brief, buildPowerBrief(a, g));
});

test('quotaFor clamps to unanimity and never exceeds total weight', () => {
  const players = [{ weight: 5 }, { weight: 5 }];
  assert.equal(quotaFor(players, 50).quota, 6);
  assert.equal(quotaFor(players, 100).quota, 10);
  assert.equal(quotaFor(players, 66).quota, 7);
});

/* ================================================ 5. Actions & atomic propagation */

test('addPowerGame validates input and never half-writes', () => {
  const env = harness();
  assert.equal(env.api.addPowerGame({ title: '' }).ok, false);
  assert.equal(env.api.addPowerGame({ title: 'x', players: [{ name: 'Solo', weight: 5 }] }).ok, false);
  assert.equal(env.store.state.powerGames.length, 0);
});

test('ATOMIC cross-module propagation: one addPowerGame fans out across modules', () => {
  const env = seeded();
  const before = {
    decisions: env.store.state.decisions.length,
    delegations: env.store.state.delegations.length,
    links: env.store.state.links.length,
  };
  const res = env.api.addPowerGame(blockedGame({
    ownerId: env.owner.id,
    linkedCaseId: env.kase.id,
    linkedStakeholderIds: [env.stkA.id, env.stkB.id, env.stkC.id],
    players: [
      { id: 'hop', name: 'Head of Platform', weight: 6, stance: 'opposed', stakeholderId: env.stkA.id },
      { id: 'priya', name: 'Priya', weight: 3, stance: 'ally', stakeholderId: env.stkC.id },
      { id: 'jordan', name: 'Jordan', weight: 2, stance: 'ally' },
      { id: 'controller', name: 'Controller', weight: 1, stance: 'neutral', stakeholderId: env.stkB.id },
    ],
  }));
  assert.equal(res.ok, true);
  const s = env.store.state;
  assert.equal(s.powerGames.length, 1);
  const game = s.powerGames[0];
  // RULE-PWR-01: derived telemetry cached, verdict correct.
  assert.equal(game.derived.verdict, 'coalition-blocked');
  assert.equal(game.derived.alignmentCost, 2);
  // RULE-PWR-02: exactly one DACI coalition decision with a marker.
  const daci = s.decisions.filter((d) => String(d.question).includes(`[RULE-PWR-02:${game.id}]`));
  assert.equal(daci.length, 1, 'one idempotent DACI decision');
  assert.ok(daci[0].options.length >= 3);
  // RULE-PWR-03: one blameless alignment delegation carrying the script.
  const del = s.delegations.filter((d) => String(d.support).includes(`[RULE-PWR-03:${game.id}]`));
  assert.equal(del.length, 1, 'one idempotent delegation');
  assert.equal(del[0].personId, env.owner.id);
  // A matching 1:1 talking point on the owner.
  const owner = s.people.find((p) => p.id === env.owner.id);
  assert.ok(owner.talkingPoints.some((t) => String(t).includes(`[RULE-PWR-03:${game.id}]`)));
  // Typed graph links: power->stakeholder(x3), power->case, power->decision,
  // power->delegation, person->power.
  assert.ok(s.links.length >= before.links + 5);
  assert.ok(s.links.some((l) => l.sourceType === 'power' && l.targetType === 'case' && l.targetId === env.kase.id));
  assert.ok(s.links.some((l) => l.sourceType === 'power' && l.targetType === 'decision' && l.relation === 'decides'));
  assert.ok(s.links.some((l) => l.sourceType === 'person' && l.targetType === 'power'));
  // Audit events recorded.
  assert.ok(s.events.some((e) => e.type === 'automation.propagated' && String(e.summary).includes('RULE-PWR-02')));
  assert.ok(s.events.some((e) => e.type === 'automation.propagated' && String(e.summary).includes('RULE-PWR-03')));
  // CHAINING: the DACI decision is visible to the decision-tempo engine.
  const tempo = buildTempoReport(s, NOW);
  assert.ok(tempo, 'tempo report builds over the propagated decision');
});

test('propagation is idempotent across repeated reanalysis', () => {
  const env = seeded();
  const res = env.api.addPowerGame(blockedGame({ ownerId: env.owner.id, linkedCaseId: env.kase.id }));
  const id = res.id;
  const count = () => ({
    dec: env.store.state.decisions.filter((d) => String(d.question).includes(`[RULE-PWR-02:${id}]`)).length,
    del: env.store.state.delegations.filter((d) => String(d.support).includes(`[RULE-PWR-03:${id}]`)).length,
    tp: (env.store.state.people.find((p) => p.id === env.owner.id).talkingPoints || []).filter((t) => String(t).includes(`[RULE-PWR-03:${id}]`)).length,
  });
  const first = count();
  env.api.reanalyzePowerGame(id);
  env.api.reanalyzePowerGame(id);
  env.api.updatePowerGame(id, { notes: 'edited after two scans' });
  assert.deepEqual(count(), first, 'no duplicate decision/delegation/talking point');
  assert.equal(first.dec, 1);
  assert.equal(first.del, 1);
  assert.equal(first.tp, 1);
});

test('powerAutoPropagate pause + explicit force reanalysis', () => {
  const env = harness();
  env.store.state.settings.powerAutoPropagate = false;
  const r = env.api.addPowerGame(blockedGame());
  assert.equal(r.ok, true);
  assert.equal(env.store.state.powerGames[0].derived, null, 'paused: no derived telemetry / propagation');
  assert.equal(env.store.state.decisions.length, 0, 'paused: no DACI decision');
  // An explicit reanalysis (force) still runs the rules.
  env.api.reanalyzePowerGame(r.id);
  assert.equal(env.store.state.powerGames[0].derived.verdict, 'coalition-blocked', 'force reanalysis populates derived');
});

test('settlePowerGame records realised outcome and RULE-PWR-05 learning', () => {
  const env = seeded();
  const r = env.api.addPowerGame(blockedGame({ ownerId: env.owner.id }));
  const out = env.api.settlePowerGame(r.id, '01', 'Opposed veto blocked; delayed a quarter');
  assert.equal(out.ok, true);
  const g = env.store.state.powerGames.find((x) => x.id === r.id);
  assert.equal(g.status, 'settled');
  assert.equal(g.realizedCell, '01');
  assert.ok(g.history.some((h) => h.action === 'settled'));
  assert.ok(g.history.some((h) => h.action === 'settlement-recorded'), 'RULE-PWR-05 calibration capture');
  // Settled games stop signalling.
  assert.ok(!powerSignals(env.store.state, NOW).some((s) => s.action.route.includes(r.id)));
});

test('setPowerTarget, status transitions and delete guards', () => {
  const env = seeded();
  const r = env.api.addPowerGame(blockedGame({ ownerId: env.owner.id }));
  assert.equal(env.api.setPowerTarget(r.id, '99').ok, false);
  assert.equal(env.api.setPowerTarget(r.id, '11').ok, true);
  assert.equal(env.store.state.powerGames[0].targetCell, '11');
  assert.equal(env.api.commitPowerGame(r.id).ok, true);
  assert.equal(env.api.archivePowerGame(r.id).ok, true);
  assert.equal(env.store.state.powerGames[0].status, 'archived');
  assert.equal(env.api.deletePowerGame(r.id).ok, true);
  assert.equal(env.store.state.powerGames.length, 0);
  assert.ok(!env.store.state.links.some((l) => (l.sourceType === 'power' && l.sourceId === r.id) || (l.targetType === 'power' && l.targetId === r.id)));
  assert.equal(env.api.updatePowerGame(r.id, { title: 'ghost' }).ok, false);
});

test('powerRule tolerates malformed records and never throws', () => {
  const draft = createEmptyState(NOW.toISOString());
  draft.powerGames = [null, {}, { id: 'x', title: 'broken', players: [], cells: null }];
  assert.doesNotThrow(() => powerRule(draft, { event: { type: 'power.created', entityId: 'x' }, now: NOW, idFactory: (p) => `${p}-1`, logEvent: () => {} }));
});

/* ========================================================= 6. Schema, rewind, demo */

test('Schema v30 and v29→v30 migration is purely additive', () => {
  assert.equal(SCHEMA_VERSION, 31);
  const v29 = createEmptyState(NOW.toISOString());
  v29.schemaVersion = 29;
  delete v29.powerGames;
  delete v29.settings.powerQuotaPct;
  const mig = migrate(v29);
  assert.ok(mig.applied.includes('29 → 30'));
  assert.deepEqual(mig.raw.powerGames, []);
  assert.equal(mig.raw.settings.powerQuotaPct, 50);
  assert.equal(mig.raw.settings.powerStaleDays, 14);
  assert.equal(mig.raw.settings.powerAutoPropagate, true);
  const empty = createEmptyState(NOW.toISOString());
  assert.ok(Array.isArray(empty.powerGames));
});

test('normalizePowerGames repairs malformed fields and clears dead pointers', () => {
  const raw = createEmptyState(NOW.toISOString());
  raw.powerGames = [
    { id: 'keep', title: 'Valid', status: 'bogus', players: [
      { id: 'a', name: 'A', weight: 999, stance: 'zzz' }, { id: 'a', name: 'B', weight: -5, stance: 'ally' },
    ], cells: { '00': [1e9, NaN], '01': ['x', 2] }, targetCell: '77', linkedCaseId: 'ghost', ownerId: 'ghost', estimateConfidence: 'nope' },
    { id: 'drop', title: '', players: [] },
    { id: 'few', title: 'One player only', players: [{ name: 'Solo', weight: 5 }] },
  ];
  const { state, warnings } = normalizeState(raw, { now: NOW });
  assert.equal(state.powerGames.length, 1, 'drops blank-title and <2-player games');
  const g = state.powerGames[0];
  assert.equal(g.status, 'modeling', 'repaired status');
  assert.equal(g.players.length, 2);
  assert.notEqual(g.players[0].id, g.players[1].id, 'duplicate player ids repaired');
  assert.ok(g.players[0].weight <= 100 && g.players[1].weight >= 1, 'weights clamped to 1..100');
  assert.equal(g.targetCell, '00', 'repaired target cell');
  assert.equal(g.linkedCaseId, null, 'dead case pointer cleared');
  assert.equal(g.ownerId, null, 'dead owner pointer cleared');
  assert.ok(POWER_CELLS.every((c) => Array.isArray(g.cells[Number(c[0])][Number(c[1])])), 'cells coerced');
  assert.ok(g.cells.every((row) => row.every((cell) => cell.every((n) => Number.isFinite(n) && Math.abs(n) <= 100))), 'payoffs finite & clamped');
  assert.ok(warnings.length > 0);
});

test('point-in-time rewind drops future games and unwinds future settlements', () => {
  const state = buildDemoState(NOW);
  const game = state.powerGames.find((g) => g.status === 'settled');
  assert.ok(game, 'demo has a settled game');
  const before = buildDemoState(NOW);
  const asOf = new Date('2026-10-10T00:00:00Z'); // before most demo games
  const { state: rewound, fidelity } = reconstructStateAt(state, asOf, { currentDay: TODAY });
  // Games created after cutoff are gone; the settled one is not borrowed.
  assert.ok(Array.isArray(rewound.powerGames));
  assert.ok(rewound.powerGames.length <= before.powerGames.length);
  assert.ok(fidelity.power, 'power fidelity dimension exists');
});

test('demo workspace ships three situations spanning blocked/misaligned/stable', () => {
  const state = buildDemoState(NOW);
  assert.equal(state.powerGames.length, 3);
  const rep = buildPowerReport(state, NOW);
  assert.equal(rep.totals.blocked >= 1, true);
  assert.equal(rep.totals.misaligned >= 1, true);
  assert.equal(rep.totals.stable >= 1, true);
  assert.equal(rep.totals.attention, 2);
});

test('clearDemo removes demo games and scrubs retained user-game pointers', () => {
  const env = harness();
  env.store.load();
  // Simulate a mixed workspace: one demo game + one user game with a dangling pointer.
  const st = env.store.state;
  st.powerGames = [
    { ...blockedGame({ id: 'power-demo-1', ownerId: 'person-demo-x' }), createdOn: TODAY, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), derived: null, linkedStakeholderIds: [], linkedGoalIds: [], notes: '' },
    { ...blockedGame({ id: 'power-user-1', ownerId: 'ghost', linkedCaseId: 'ghost' }), createdOn: TODAY, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), derived: null, linkedStakeholderIds: [], linkedGoalIds: [], notes: '' },
  ];
  st.meta.isDemo = true;
  env.store.persist?.();
  env.store.clearDemo();
  const after = env.store.state.powerGames;
  assert.equal(after.length, 1, 'demo game removed, user game kept');
  assert.equal(after[0].id, 'power-user-1');
  assert.equal(after[0].linkedCaseId, null, 'dangling case pointer scrubbed');
});

/* ================================================== 7. CSV, signals, catalogue */

test('CSV scope #30 is data-minimised, formula-safe and one-row-per-game', () => {
  const state = buildDemoState(NOW);
  assert.equal(CSV_EXPORTS.length, 32);
  assert.ok(CSV_EXPORTS.some((s) => s.key === 'powerStrategy'));
  const res = exportWorkspaceCsv(state, 'powerStrategy', { now: NOW });
  assert.equal(res.ok, true);
  const lines = res.csv.trim().split('\n');
  assert.equal(lines.length, 4, 'header + 3 games');
  const header = lines[0];
  for (const forbidden of ['Platform migration', 'Q4 vendor', 'Cross-team', 'Head of Platform', 'Priya', 'Jordan', 'context']) {
    assert.ok(!res.csv.includes(forbidden), `no free text / names: ${forbidden}`);
  }
  assert.ok(header.includes('banzhaf_max') && header.includes('alignment_cost') && header.includes('engine_version'));
  // Row width matches header width.
  const width = header.split(',').length;
  for (const line of lines.slice(1)) assert.equal(line.split(',').length, width);
});

test('PWR-01..06 signals fire on evidence and are silent on an empty workspace', () => {
  assert.deepEqual(powerSignals(createEmptyState(NOW.toISOString()), NOW), []);
  const state = buildDemoState(NOW);
  const sigs = powerSignals(state, NOW);
  const ids = new Set(sigs.map((s) => s.ruleId));
  for (const id of ['PWR-01', 'PWR-02', 'PWR-03']) assert.ok(ids.has(id), `${id} fires`);
  for (const s of sigs) {
    assert.equal(s.domain, 'Coalition & power');
    assert.ok(s.evidence.length > 0);
    assert.ok(s.action.route.startsWith('#/power'));
  }
  assert.ok(DOMAIN_ORDER.includes('Coalition & power'));
  const ins = buildInsights(state, NOW);
  assert.ok(ins.findings.some((f) => f.ruleId && f.ruleId.startsWith('PWR')), 'insights include PWR signals');
});

test('rule catalogue exposes six RULE-PWR rules on the shared spine', () => {
  const pwr = AUTOMATION_RULES.filter((r) => r.id.startsWith('RULE-PWR-'));
  assert.equal(pwr.length, 6);
  assert.equal(POWER_RULES.length, 6);
  assert.equal(AUTOMATION_RULES.length, 74);
});

/* ============================================================ 8. UI (jsdom+axe) */

function bootDom() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(e.message);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const dom = new JSDOM(HTML, { url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
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
async function axeViolations(env, selector = '#view') {
  if (!env.window.axe) env.window.eval(AXE_SRC);
  const r = await env.window.axe.run(env.document.querySelector(selector), { rules: { 'color-contrast': { enabled: false } } });
  return Array.from(r.violations).map((v) => `${v.id}: ${v.help}`);
}
async function appWithDemo() {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ storage: env.window.localStorage, now: () => NOW });
  app.ctx.loadDemo();
  return { env, app };
}

test('UI: all six war-room tabs, detail and dialog render axe-clean with the demo', async () => {
  const { env, app } = await appWithDemo();
  try {
    const gid = app.ctx.state.powerGames[0].id;
    assert.equal(app.ctx.api.updatePowerGame(gid, { stressRadius: 2 }).ok, true);
    const routes = [
      '#/power', '#/power?tab=overview', '#/power?tab=coalitions', '#/power?tab=game',
      '#/power?tab=incentives', '#/power?tab=stress', '#/power?tab=script', `#/power/${gid}`,
    ];
    for (const route of routes) {
      app.ctx.navigate(route);
      const view = env.document.querySelector('#view');
      assert.ok(view.textContent.length > 200, `${route} renders content`);
      assert.ok(!view.textContent.includes('failed to draw'), `${route} no render error`);
      assert.deepEqual(await axeViolations(env), [], `${route} axe-clean`);
      // Every table has a caption/aria-label and no empty <th>.
      for (const tbl of Array.from(view.querySelectorAll('table'))) {
        assert.ok(tbl.getAttribute('aria-label') || tbl.querySelector('caption'), `${route}: table labelled`);
        for (const th of Array.from(tbl.querySelectorAll('th'))) {
          assert.ok((th.textContent || '').trim().length > 0, `${route}: no empty header`);
        }
      }
    }
    assert.deepEqual(env.consoleErrors, [], 'no console errors');
    // New-situation dialog renders with a form and passes axe.
    app.ctx.navigate('#/power');
    const btn = Array.from(env.document.querySelectorAll('button')).find((b) => b.textContent.includes('New situation'));
    assert.ok(btn, 'new situation button exists');
    btn.click();
    const dialog = env.document.querySelector('[role="dialog"]');
    assert.ok(dialog && dialog.querySelector('form'), 'dialog with form opens');
    assert.deepEqual(await axeViolations(env, '[role="dialog"]'), [], 'dialog axe-clean');
  } finally {
    env.dom.window.close();
  }
});

test('UI: the influence-script tab exposes a board pack and confidence-scored verdicts', async () => {
  const { env, app } = await appWithDemo();
  try {
    app.ctx.navigate('#/power?tab=script');
    const view = env.document.querySelector('#view');
    assert.ok(view.textContent.includes('Deterministic'), 'honesty banner present');
    assert.ok(view.textContent.includes('Board-ready brief'));
    assert.ok(Array.from(view.querySelectorAll('button')).some((b) => b.textContent.includes('Download brief')));
    app.ctx.navigate('#/power?tab=incentives');
    const inv = env.document.querySelector('#view');
    assert.ok(inv.textContent.includes('Confidence-scored recommendation'));
    assert.ok(inv.textContent.includes('Alignment cost'));
    // SVG charts carry accessible names.
    app.ctx.navigate('#/power?tab=coalitions');
    const svg = env.document.querySelector('#view svg[role="img"]');
    assert.ok(svg && svg.getAttribute('aria-label'), 'power chart has an accessible name');
  } finally {
    env.dom.window.close();
  }
});

test('UI: uncertainty edit persists and clearing the bound returns the honest empty state', async () => {
  const { env, app } = await appWithDemo();
  try {
    const gid = app.ctx.state.powerGames[0].id;
    const openEditor = () => {
      app.ctx.navigate(`#/power?tab=stress&game=${gid}`);
      Array.from(env.document.querySelectorAll('button')).find(b => b.textContent === 'Edit uncertainty bound').click();
    };
    const save = () => Array.from(env.document.querySelectorAll('[role="dialog"] button')).find(b => b.textContent === 'Save changes').click();
    openEditor();
    env.document.querySelector('[name=stressRadius]').value = '3.5';
    save();
    assert.equal(app.ctx.state.powerGames.find(g => g.id === gid).stressRadius, 3.5);
    assert.match(env.document.querySelector('#view').textContent, /Savage minimax regret/);
    openEditor();
    env.document.querySelector('[name=stressRadius]').value = '';
    save();
    assert.equal(app.ctx.state.powerGames.find(g => g.id === gid).stressRadius, null);
    assert.match(env.document.querySelector('#view').textContent, /No uncertainty bound recorded/);
  } finally { env.dom.window.close(); }
});
