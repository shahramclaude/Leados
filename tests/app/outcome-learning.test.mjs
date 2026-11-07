/**
 * ADR-0107 — the Outcome Learning Loop: statistics, storage, spine, cross-module
 * propagation, one-shot grading, cross-altitude roll-up, disclosure and the
 * feedback into decision tempo. All fixtures use an injected clock.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { rehearseMissionCapture } from '../../app/services/missionCaptureRehearsal.js';
import { buildSeats } from '../../app/core/domain/seat.js';
import { buildMission } from '../../app/core/domain/mission.js';
import { buildTempoReport, tempoBrief } from '../../app/core/domain/decisionTempo.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { outcomeRule } from '../../app/core/domain/outcomeRules.js';
import { CSV_EXPORTS, buildScopeTable } from '../../app/core/csv.js';
import { OUTCOME_CSV_COLUMNS } from '../../app/core/domain/outcomeLearning.js';
import { resolveLinkedEntity } from '../../app/core/domain/cases.js';
import { API_RIGHTS, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { ACTION_RIGHTS } from '../../app/core/domain/seatRegistry.js';
import {
  brierPair, conformalUpper, outsideViewFromGrades, outcomeVerdict,
  pooledBrier, wilsonInterval,
} from '../../app/core/domain/outcomePrior.js';
import {
  normalizeOutcomeContracts, normalizeOutcomeGrades, normalizeOutcomeMarkers,
  normalizeOutcomeSettings,
} from '../../app/core/domain/outcomeSchema.js';
import {
  buildOutcomeReport, contractForBundle, gradeForContract, outcomeBriefText,
  outcomeCsvRows, outcomeReceiptText,
} from '../../app/core/domain/outcomeLearning.js';
import { OUTCOME_SCAN_EVENT } from '../../app/core/domain/outcomeRegistry.js';

const NOW = new Date('2026-11-06T12:00:00.000Z');
const NOTE = 'The supplier delivery is late again and the team is overloaded. Ari Klein says the billing backlog is blocking handoffs.';
const clone = (v) => JSON.parse(JSON.stringify(v));

function fixture(seat = 'lead1') {
  const state = createEmptyState(NOW.toISOString());
  state.settings = { ...state.settings, leaderName: 'Dana Root', chainLeaderAltitude: 'chief', activeSeatId: seat, seatEnforce: true, missionCellFloor: 3 };
  state.people = [['vp1', null, 'vp', 'Rina VP'], ['dir1', 'vp1', 'director', 'Sam Director'], ['mgr1', 'dir1', 'manager', 'Mei Manager'], ['lead1', 'mgr1', 'lead', 'Priya Lead'], ['lead2', 'mgr1', 'lead', 'Jordan Lead'], ['ic1', 'lead1', 'ic', 'Ari Klein'], ['ic3', 'lead2', 'ic', 'Cy Orlov']]
    .map(([id, managerId, level, name]) => ({ id, name, role: level, level, managerId, status: 'active' }));
  return normalizeState(state, { now: NOW }).state;
}
function setup({ state = fixture() } = {}) {
  const data = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  let seq = 0; const idFactory = (p) => `${p}-oln-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory }); store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }) };
}
function adopt(env, { kinds = ['decision', 'delegation', 'coaching'], priorPct = 70 } = {}) {
  const p = env.api.missionCapturePrepare({ text: NOTE, title: 'Billing backlog recovery', ownerId: 'lead1', kinds, reviewOn: '2026-11-13', priorPct });
  assert.equal(p.ok, true, p.error);
  const r = rehearseMissionCapture(env.store.state, p.id, { now: NOW }); assert.equal(r.ok, true, r.error);
  assert.equal(env.api.saveMissionCapturePreview(p.id, r).ok, true);
  const c = env.api.missionCaptureCommit(p.id, env.store.state.meta.revision, true); assert.equal(c.ok, true, c.error);
  return env.store.state.actionBundles.at(-1);
}
function settle(env, b, outcome = 'good') {
  const del = b.outputs.find((o) => o.kind === 'delegation');
  assert.equal(env.api.completeDelegation(del.id, { completionNote: 'Delivered the recovery checkpoint.' }).ok, true);
  const dec = b.outputs.find((o) => o.kind === 'decision');
  assert.equal(env.api.decideDecision(dec.id, { chosen: 'Proceed with the reviewed response', rationale: 'Reviewed with the owner.' }).ok, true);
  assert.equal(env.api.reviewDecision(dec.id, { outcome, outcomeNotes: 'Recorded by the accountable leader.' }).ok, true);
  const coach = b.outputs.find((o) => o.kind === 'coaching');
  if (coach) assert.equal(env.api.logOneOnOne({ personId: coach.id, date: '2026-11-06', status: 'held', resolvedTalkingPoints: [coach.prompt] }).ok, true);
  assert.equal(env.api.resolveCase(b.sourceId, { resolutionNotes: 'Recovered and installed a systemic guardrail.', resolvedOn: '2026-11-06' }).ok, true);
}

/* ------------------------------------------------------------- 1. the maths */

test('Wilson, Brier, conformal and quadrants are pure, bounded and refusal-honest', () => {
  const w = wilsonInterval(0.5, 20);
  assert.ok(w.lo > 0.29 && w.lo < 0.31 && w.hi > 0.69 && w.hi < 0.71);
  assert.equal(wilsonInterval(1.4, 10), null);
  assert.deepEqual(brierPair(80, 1), { brier: 0.04, baseBrier: 0.25, skill: 0.84 });
  assert.deepEqual(brierPair(50, 0.5), { brier: 0, baseBrier: 0, skill: null });
  assert.equal(brierPair(null, 1), null);
  assert.equal(conformalUpper([1, 2], { coverage: 0.8, minN: 5 }).status, 'refused');
  const band = conformalUpper([0, 1, 2, 3, 20], { coverage: 0.8, minN: 5 });
  assert.equal(band.status, 'published'); assert.equal(band.k, 5); assert.equal(band.upperDays, 20);
  assert.ok(Math.abs(band.coverage - 5 / 6) < 1e-4);
  assert.equal(conformalUpper([1, 2, 3, 4, 5], { coverage: 0.99, minN: 5 }).status, 'refused', 'an unidentifiable nominal level is refused, not printed');
  assert.equal(outcomeVerdict({ outcomeValue: 1, fidelityPct: 100 }), 'earned');
  assert.equal(outcomeVerdict({ outcomeValue: 1, fidelityPct: 20 }), 'lucky');
  assert.equal(outcomeVerdict({ outcomeValue: 0, fidelityPct: 100 }), 'variance');
  assert.equal(outcomeVerdict({ outcomeValue: 0, fidelityPct: 20 }), 'fixable');
  assert.equal(outcomeVerdict({ outcomeValue: 1, fidelityPct: null }), 'ungradable');
  assert.equal(pooledBrier([], { minGrades: 5 }).status, 'refused');
});

test('outside view refuses a thin record and shrinks a thick one toward 50%', () => {
  const thin = outsideViewFromGrades([{ status: 'graded', outcomeValue: 1, forecastPct: 90 }], { outcomeMinGrades: 5 });
  assert.equal(thin.status, 'refused'); assert.equal(thin.n, 1);
  const grades = Array.from({ length: 10 }, (_, i) => ({ status: 'graded', outcomeValue: i < 2 ? 1 : 0, forecastPct: 90, brier: 0.64, baseBrier: 0.25 }));
  const o = outsideViewFromGrades(grades, { outcomeMinGrades: 5, outcomeShrinkK: 8, outcomeMaterialityPp: 15 });
  assert.equal(o.status, 'published'); assert.equal(o.observedPct, 20);
  assert.ok(o.pct > 20 && o.pct < 50, 'shrinkage pulls the outside view toward the maximum-entropy prior');
  assert.equal(o.direction, 'overconfident'); assert.equal(o.gapPp, 70);
  assert.ok(o.loPct < o.pct && o.pct < o.hiPct);
});

test('conventions clamp, and every normalizer fails closed on a corrupt row', () => {
  assert.equal(SCHEMA_VERSION, 116);
  const c = normalizeOutcomeSettings({ outcomeMinGrades: 999, outcomeConformalCoverage: 5, outcomeAutoLearn: false });
  assert.equal(c.outcomeMinGrades, 25); assert.equal(c.outcomeConformalCoverage, 0.95); assert.equal(c.outcomeAutoLearn, false);
  const warnings = [];
  const good = { id: 'olc-a', bundleId: 'b1', sourceCaseId: 'c1', ownerNodeId: 'lead1', declaredOn: '2026-11-06',
    horizonOn: '2026-11-13', forecastPct: 70, forecastSource: 'decision-command', expectedActions: 3,
    expectedSpend: [], sourcePointers: [], fingerprint: 'abcd1234', version: 'outcome-learning-2026.11-v1',
    status: 'open', createdAt: NOW.toISOString() };
  assert.equal(normalizeOutcomeContracts([good, { ...good, forecastPct: 120 }, { ...good, id: 'olc-a' }], warnings).length, 1);
  assert.ok(warnings.length >= 2);
  // The score is re-derived from the frozen 70% and outcome 1, so a forged
  // 0.04 (which belongs to an 80% claim) is dropped rather than trusted.
  const grade = { id: 'olg-a', contractId: 'olc-a', bundleId: 'b1', ownerNodeId: 'lead1', gradedOn: '2026-11-06',
    closedOn: '2026-11-06', outcome: 'good', outcomeValue: 1, forecastPct: 70, brier: 0.09, baseBrier: 0.25,
    skill: 0.64, cycleDays: 0, horizonDays: 7, delayDays: -7, fidelityPct: 100, verdict: 'earned',
    status: 'graded', reason: 'test', fingerprint: 'abcd1234', version: 'outcome-learning-2026.11-v1' };
  assert.equal(normalizeOutcomeGrades([grade, { ...grade, outcomeValue: 0 }], warnings).length, 1);
  assert.equal(normalizeOutcomeMarkers([{ id: 'm', kind: 'bias', recordedOn: '2026-11-06' }, { id: 'm', kind: 'bias', recordedOn: '2026-11-06' }]).length, 1);
});

test('v109 is additive: three empty ledgers, declared settings, zero back-fill', () => {
  const old = { schemaVersion: 108, settings: { leaderName: 'Keep', executionAutoReconcile: false } };
  const m = migrate(old);
  assert.equal(m.raw.schemaVersion, 116); assert.equal(m.raw.settings.leaderName, 'Keep');
  assert.equal(m.raw.settings.executionAutoReconcile, false);
  assert.deepEqual(m.raw.outcomeContracts, []); assert.deepEqual(m.raw.outcomeGrades, []); assert.deepEqual(m.raw.outcomeMarkers, []);
  assert.equal(m.raw.settings.outcomeMinGrades, 5);
  assert.deepEqual(migrate(m.raw).applied, []);
  const env = setup();
  assert.deepEqual(env.store.state.outcomeContracts, []);
  assert.equal(env.store.state.settings.outcomeAutoLearn, true);
});

/* ----------------------------------------------------------- 2. the wiring */

test('the 87th rule/contract, rights, safe reads, panel and CSV scope are registered', () => {
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(outcomeRule));
  const contract = PROPAGATION_CONTRACTS.find((c) => c.rule === outcomeRule);
  assert.ok(contract && contract.writes.includes('outcomeContracts') && contract.writes.includes('links'));
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length);
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, 90);
  assert.equal(API_RIGHTS.outcomeScan, 'record-outcome-learning');
  assert.equal(API_RIGHTS.outcomeSetConventions, 'govern-outcome-learning');
  for (const name of ['outcomeRead', 'outcomeReceipt', 'outcomeBriefText', 'outcomeCsvRows']) assert.ok(SAFE_READS.has(name), name);
  assert.equal(ACTION_RIGHTS['govern-outcome-learning'].minRank, 4);
  assert.equal(CSV_EXPORTS.length, 104);
  assert.ok(CSV_EXPORTS.some((s) => s.key === 'outcome-learning'));
});

/* --------------------------------------------- 3. cross-module + cross-altitude */

test('one adoption freezes an expectation, links six modules and rolls it up every altitude', () => {
  const env = setup();
  const b = adopt(env);
  const contracts = env.store.state.outcomeContracts;
  assert.equal(contracts.length, 1, 'exactly one frozen expectation per adopted response');
  const c = contracts[0];
  assert.equal(c.bundleId, b.id); assert.equal(c.forecastPct, 70);
  assert.equal(c.forecastSource, 'decision-command', 'the reviewed Command Flow confidence is the pre-registration');
  assert.equal(c.horizonOn, '2026-11-13');
  assert.equal(c.expectedActions, b.outputs.length);
  assert.equal(c.status, 'open');
  const links = env.store.state.links;
  const frozen = links.filter((l) => l.sourceType === 'outcomecontract' && l.sourceId === c.id && l.ruleId === 'RULE-OLN-01');
  const rests = frozen.filter((l) => l.relation === 'rests-on');
  assert.ok(rests.length >= 3, 'case + adopted action records are typed pointer edges');
  assert.ok(rests.some((l) => l.targetType === 'case' && l.targetId === b.sourceId));
  assert.ok(rests.some((l) => l.targetType === 'decision'));
  assert.ok(rests.some((l) => l.targetType === 'delegation'));
  assert.ok(frozen.some((l) => l.relation === 'pre-registers' && l.targetType === 'bundle' && l.targetId === b.id),
    'the expectation is a resolvable graph node that pre-registers its adoption');
  assert.equal(resolveLinkedEntity(env.store.state, 'outcomecontract', c.id)?.route, `#/mission?panel=learning&contract=${c.id}`);
  const rollups = frozen.filter((l) => l.relation === 'rolls-up-to');
  const seats = new Set(rollups.map((l) => l.targetId));
  for (const id of ['lead1', 'mgr1', 'dir1', 'vp1']) assert.ok(seats.has(id), `frontline → ${id} roll-up`);
  assert.ok(rollups.length >= 4, 'one typed edge per leadership ancestor, in the SAME transaction as adoption');
  // Idempotent explicit scan.
  assert.equal(env.api.outcomeScan().ok, true);
  assert.equal(env.store.state.outcomeContracts.length, 1);
  assert.equal(env.store.state.links.filter((l) => l.ruleId === 'RULE-OLN-01').length, frozen.length);
});

test('closing the loop grades exactly once from dated evidence, never from a marker', () => {
  const env = setup();
  const b = adopt(env);
  assert.equal(env.store.state.outcomeGrades.length, 0);
  settle(env, b, 'good');
  const grades = env.store.state.outcomeGrades;
  assert.equal(grades.length, 1);
  const g = grades[0];
  assert.equal(g.status, 'graded'); assert.equal(g.outcome, 'good'); assert.equal(g.outcomeValue, 1);
  assert.equal(g.forecastPct, 70); assert.equal(g.brier, 0.09); assert.equal(g.baseBrier, 0.25);
  assert.equal(g.fidelityPct, 100); assert.equal(g.verdict, 'earned');
  assert.equal(g.delayDays, -7, 'closed on the adoption day, seven days before the declared horizon');
  assert.equal(env.store.state.outcomeContracts[0].status, 'graded');
  assert.ok(env.store.state.links.some((l) => l.relation === 'grades-outcome' && l.ruleId === 'RULE-OLN-02'));
  assert.equal(env.api.outcomeScan().ok, true);
  assert.equal(env.store.state.outcomeGrades.length, 1, 'a rescan cannot re-grade or duplicate a one-shot grade');
  // A forged stored marker cannot change the derived truth.
  const raw = clone(env.store.state); raw.outcomeGrades[0].brier = 0.0001;
  const warnings = []; const normalized = normalizeState(raw, { now: NOW, warnings });
  assert.equal(normalized.state.outcomeGrades.length, 0, 'a tampered grade is dropped, never repaired into a verdict');
});

test('a loop with no frozen probability is REFUSED, and hindsight cannot be declared afterwards', () => {
  const env = setup();
  const b = adopt(env, { kinds: ['decision', 'delegation'] });
  // Simulate an adopted response whose reviewed commands carried no declaration.
  env.store.update((d) => { for (const c of d.actionBundles[0].commands) delete c.priorPct; }, { type: 'test.strip_prior' });
  env.store.update((d) => { d.outcomeContracts = []; }, { type: 'test.clear_contracts' });
  assert.equal(env.api.outcomeScan().ok, true);
  const c = env.store.state.outcomeContracts[0];
  assert.equal(c.forecastPct, null); assert.equal(c.forecastSource, 'none');
  assert.equal(env.api.outcomeDeclarePrior(b.id, 65).ok, true, 'a human may still pre-register BEFORE the outcome');
  assert.equal(env.store.state.outcomeContracts[0].forecastPct, 65);
  assert.equal(env.api.outcomeDeclarePrior(b.id, 40).ok, false, 'one declaration only');
  settle(env, b, 'good');
  assert.equal(env.store.state.outcomeGrades.length, 1);
  assert.equal(env.store.state.outcomeGrades[0].forecastPct, 65);
  assert.equal(env.api.outcomeDeclarePrior(b.id, 99).ok, false, 'no probability may be added after a human outcome review');
});

test('ungradable is a stored refusal, not a silent miss', () => {
  const env = setup();
  const b = adopt(env, { kinds: ['decision', 'delegation'] });
  env.store.update((d) => { for (const c of d.actionBundles[0].commands) delete c.priorPct; }, { type: 'test.strip_prior2' });
  env.store.update((d) => { d.outcomeContracts = []; }, { type: 'test.clear_contracts2' });
  assert.equal(env.api.outcomeScan().ok, true);
  settle(env, b, 'bad');
  const g = env.store.state.outcomeGrades[0];
  assert.equal(g.status, 'ungradable'); assert.equal(g.verdict, 'ungradable');
  assert.equal(g.brier, null); assert.equal(g.outcomeValue, null);
  assert.match(g.reason, /No probability was frozen/);
  assert.equal(env.api.outcomeScan().ok, true);
  assert.equal(env.store.state.outcomeGrades.length, 1);
});

/* ------------------------------------------------------ 4. altitude disclosure */

test('frontline reads its own detail; director/CEO receive identity-free intervals and every refusal', () => {
  const env = setup();
  const b = adopt(env);
  settle(env, b, 'good');
  const lead = buildOutcomeReport(env.store.state, { now: NOW, seatId: 'lead1' });
  assert.equal(lead.ok, true); assert.equal(lead.detail, true);
  assert.equal(lead.rows.length, 1); assert.equal(lead.rows[0].bundleId, b.id);
  assert.equal(lead.outside.status, 'refused', 'one graded loop cannot publish an outside view');
  assert.equal(lead.band.status, 'refused');
  const director = buildOutcomeReport(env.store.state, { now: NOW, seatId: 'dir1' });
  assert.equal(director.ok, true); assert.equal(director.detail, false);
  assert.deepEqual(director.rows, [], 'no individual proof pointer travels above rank 2');
  assert.equal(director.counts.contracts, null, 'even exact counts are withheld above the detail ceiling');
  const vp = buildOutcomeReport(env.store.state, { now: NOW, seatId: 'vp1' });
  assert.equal(vp.ok, true); assert.equal(vp.rank, 4);
  assert.ok(vp.hierarchy.cells.length >= 2);
  const brief = outcomeBriefText(vp);
  assert.ok(brief.includes('Outside view REFUSED'));
  assert.ok(!brief.includes(b.id) && !brief.includes('lead1') && !brief.includes('Ari'), 'the upward brief carries no ids or names');
  assert.match(brief, /Not differential privacy/);
  // Sideways access is refused at the same boundary as Mission Control.
  const sideways = buildOutcomeReport(env.store.state, { now: NOW, seatId: 'lead2' });
  assert.equal(sideways.ok, false);
});

test('the aggregate CSV never exports an id, a suppressed cell or a refused figure as zero', () => {
  const env = setup();
  const b = adopt(env); settle(env, b, 'good');
  const report = buildOutcomeReport(env.store.state, { now: NOW });
  const rows = outcomeCsvRows(report);
  assert.ok(rows.length >= 3);
  const text = JSON.stringify(rows);
  assert.ok(!text.includes(b.id) && !text.includes('lead1') && !text.includes('Billing backlog'));
  assert.ok(rows.some((r) => r.row_kind === 'workspace' && r.refused === 'yes'));
  const table = buildScopeTable(env.store.state, 'outcome-learning', NOW);
  assert.equal(table.columns.length, OUTCOME_CSV_COLUMNS.length);
  assert.ok(table.rows.length >= 3);
});

/* ------------------------------------------- 5. feedback into decision tempo */

test('a published outside view is printed beside a new call, never substituted for its forecast', () => {
  const env = setup();
  const grades = Array.from({ length: 6 }, (_, i) => ({
    id: `olg-${i}`, contractId: `olc-${i}`, bundleId: `b-${i}`, ownerNodeId: 'lead1',
    gradedOn: '2026-11-06', closedOn: '2026-11-06', outcome: i < 2 ? 'good' : 'bad',
    outcomeValue: i < 2 ? 1 : 0, forecastPct: 90, brier: i < 2 ? 0.16 : 0.81,
    baseBrier: 0.25, skill: i < 2 ? 0.36 : -2.24, cycleDays: 7, horizonDays: 7, delayDays: 0,
    fidelityPct: 100, verdict: i < 2 ? 'earned' : 'variance', status: 'graded', reason: 'test',
    fingerprint: 'abcd1234', version: 'outcome-learning-2026.11-v1',
  }));
  env.store.update((d) => { d.outcomeGrades = grades; }, { type: 'test.grades' });
  const report = buildTempoReport(env.store.state, { now: NOW });
  assert.equal(report.outsideView.status, 'published');
  assert.equal(report.outsideView.direction, 'overconfident');
  const brief = tempoBrief(report);
  assert.ok(brief.text.includes('OUTSIDE VIEW FROM OUR OWN SETTLED RESPONSES'));
  assert.ok(brief.text.includes('not a replacement'));
  const timed = report.rows[0]?.timing;
  // No open decision in this fixture carries a forecast, so no per-decision
  // bracket is invented. The engine never reprices from the outside view.
  assert.equal(timed?.amountSource === undefined || timed.outsideView === undefined, true);
  const empty = buildTempoReport(createEmptyState(NOW.toISOString()), { now: NOW });
  assert.equal(empty.outsideView.status, 'refused');
  assert.ok(!tempoBrief(empty).text.includes('OUTSIDE VIEW'), 'a refused reading never enters the board brief');
});

/* --------------------------------------------- 6. read-model and UI surfaces */

test('Mission Control exposes the learning panel at every altitude and the receipt is detail-only', () => {
  const env = setup();
  const b = adopt(env); settle(env, b, 'good');
  const mission = buildMission(env.store.state, { now: NOW });
  assert.equal(mission.ok, true); assert.equal(mission.outcome.ok, true);
  assert.equal(mission.outcome.rows.length, 1);
  const receipt = env.api.outcomeReceipt(b.id);
  assert.equal(receipt.ok, true);
  assert.ok(receipt.text.includes('Brier') && receipt.text.includes('Declared probability: 70%'));
  assert.equal(outcomeReceiptText(null).startsWith('No frozen expectation'), true);
  const director = buildMission(env.store.state, { now: NOW, seatId: 'dir1' });
  assert.equal(director.ok, true); assert.deepEqual(director.outcome.rows, []);
  assert.equal(director.outcome.detail, false);
});

test('paused automation stays paused; an explicit scan always runs', () => {
  const paused = setup();
  assert.equal(paused.api.setOutcomeAutoLearn(false).ok, true);
  const b = adopt(paused);
  assert.equal(paused.store.state.outcomeContracts.length, 0, 'no expectation is frozen while paused');
  assert.equal(paused.api.outcomeScan().ok, true);
  assert.equal(paused.store.state.outcomeContracts.length, 1, 'the explicit scan still freezes it');
  assert.ok(contractForBundle(paused.store.state, b, NOW));
  // A fresh workspace with automation enabled freezes in the SAME transaction
  // as adoption, without any second scan or manual declaration.
  const automatic = setup();
  const second = adopt(automatic, { kinds: ['decision', 'delegation'] });
  assert.equal(automatic.store.state.outcomeContracts.length, 1);
  assert.ok(contractForBundle(automatic.store.state, second, NOW));
});

test('governed conventions need the full-access enterprise root, not a scoped span', () => {
  const env = setup();
  const refusal = env.api.outcomeSetConventions({ outcomeMinGrades: 6 });
  assert.equal(refusal.ok, false);
  const root = setup({ state: fixture(null) });
  const ok = root.api.outcomeSetConventions({ outcomeMinGrades: 6, outcomeMaterialityPp: 900 });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(root.store.state.settings.outcomeMinGrades, 6);
  assert.equal(root.store.state.settings.outcomeMaterialityPp, 50, 'clamped into the declared band');
});

test('the pure grader refuses an open loop and a hindsight review', () => {
  const env = setup();
  const b = adopt(env);
  const contract = env.store.state.outcomeContracts[0];
  assert.equal(gradeForContract(env.store.state, contract, NOW, env.store.state.settings).ok, false);
  assert.match(gradeForContract(env.store.state, contract, NOW, env.store.state.settings).error, /not closed/);
  settle(env, b, 'good');
  const settled = clone(env.store.state);
  settled.decisions.find((d) => d.id === b.outputs.find((o) => o.kind === 'decision').id).reviewedOn = '2026-11-20';
  // An OPEN expectation whose proof postdates its horizon is refused; a grade
  // already issued is independently immutable (checked above as one-shot).
  const openAgain = { ...settled.outcomeContracts[0], status: 'open', gradedOn: null };
  assert.match(gradeForContract(settled, openAgain, NOW, settled.settings).error || '', /postdates|inconsistent/);
  assert.ok(OUTCOME_SCAN_EVENT.startsWith('outcome.'));
  assert.ok(buildSeats(env.store.state, { now: NOW, settings: env.store.state.settings }).byId.has('dir1'));
});
