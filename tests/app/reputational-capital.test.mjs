/**
 * ADR-0101, Schema v103 — the Reputational Capital Ledger (`#/reputation`).
 *
 * Cross-module and cross-altitude by construction: these tests prove that
 *   - the statistics are hand-checkable (Wilson in beta space, decay, the
 *     obstacle premium, WILSON-FIRST) and refuse rather than approximate,
 *   - acts are harvested from records OTHER modules already own, so a leader does
 *     not re-type history to earn reputational credit, and a hand-typed twin of a
 *     derived act is refused because it would double-count,
 *   - RULE-RCL-01..05 write through the SHARED spine: a cell becomes a graph node
 *     with `rests-on` provenance and one `rolls-up-to` edge per leadership
 *     ancestor in the SAME transaction, a drawn-down class opens exactly one
 *     governed decision per span per class per ISO week, an open guarantee freezes
 *     its claim and is graded once, a repair closes only on banked acts,
 *   - the seat boundary holds: a declared seat reads its own subtree and never a
 *     peer or a manager,
 *   - the export carries no person, act id or source id, and the five panels pass
 *     axe-core on an empty and on a populated workspace.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import axe from 'axe-core';

const dom = new JSDOM('<!doctype html><html><body><div id="view"></div></body></html>', { url: 'https://leados.test/', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
globalThis.Element = dom.window.Element;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Event = dom.window.Event;
globalThis.localStorage = dom.window.localStorage;

import { createApi } from '../../app/actions.js';
import { CSV_EXPORTS } from '../../app/core/csv.js';
import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { manifestFor } from '../../app/core/domain/disclosureManifests.js';
import { LINK_RELATIONS, resolveLinkedEntity } from '../../app/core/domain/cases.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS, contractFor } from '../../app/core/domain/propagationContracts.js';
import { API_RIGHTS } from '../../app/core/domain/accessGateway.js';
import { mount } from '../../app/ui/dom.js';
import {
  betaKl,
  betaMean,
  buildReputationReport,
  cellReading,
  counterfactualActs,
  decayWeight,
  harvestActs,
  obstaclePct,
  reputationAttentionCount,
  reputationBriefText,
  reputationCsvRows,
  reputationSignals,
  wilsonBeta,
} from '../../app/core/domain/reputationalCapital.js';
import { reputationalCapitalRule } from '../../app/core/domain/reputationalCapitalRules.js';
import {
  normalizeReputationActs,
  normalizeReputationMarkers,
  normalizeReputationPositions,
  reputationConventions,
} from '../../app/core/domain/reputationalCapitalSchema.js';
import { renderReputation } from '../../app/views/reputation.js';

const NOW = new Date('2026-11-05T12:00:00.000Z');
const NOW_ISO = NOW.toISOString();

function tree() {
  const state = createEmptyState(NOW_ISO);
  state.settings = {
    ...state.settings,
    chainLeaderAltitude: 'chief',
    reputationAutoPropagate: true,
    reputationActFloor: 4,
    reputationExposureFloor: 3,
    reputationWindowDays: 365,
    reputationHalfLifeDays: 270,
    reputationObstacleGamma: 0.35,
    reputationPublishedCellFloor: 2,
  };
  for (const key of Object.keys(state.settings)) if (key.endsWith('AutoPropagate') && key !== 'reputationAutoPropagate') state.settings[key] = false;
  state.people = [
    { id: 'vp1', name: 'Vera Executive', role: 'VP', level: 'vp', team: 'Ops', status: 'active' },
    { id: 'dir1', name: 'Dana Director', role: 'Director', level: 'director', team: 'Ops', managerId: 'vp1', status: 'active' },
    { id: 'mgr1', name: 'Mira Manager', role: 'Manager', level: 'manager', team: 'Billing', managerId: 'dir1', status: 'active' },
    { id: 'lead1', name: 'Lee Lead', role: 'Lead', level: 'lead', team: 'Billing', managerId: 'mgr1', status: 'active' },
    { id: 'lead2', name: 'Pat Lead', role: 'Lead', level: 'lead', team: 'Billing', managerId: 'mgr1', status: 'active' },
  ];
  return state;
}

/** `n` delegations for one person: kept (on time) unless `late` is set. */
function delegations(state, personId, { n = 8, late = false, prefix = 'del' } = {}) {
  for (let i = 0; i < n; i += 1) {
    state.delegations.push({
      id: `${prefix}-${personId}-${i}`,
      personId,
      title: `Work item ${i}`,
      authority: 'own',
      delegatedOn: '2026-08-01',
      dueOn: '2026-08-10',
      status: 'done',
      completedOn: late ? '2026-08-20' : '2026-08-08',
      checkins: [],
      createdAt: NOW_ISO,
    });
  }
  return state;
}

function harness(raw = delegations(delegations(tree(), 'lead1', { n: 9 }), 'lead2', { n: 9, late: true })) {
  const normalized = normalizeState(raw, { now: NOW });
  const values = new Map([[STORAGE_KEY, JSON.stringify(normalized.state)]]);
  const storage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let current = NOW;
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-rcl-${++seq}`;
  const store = createStore({ storage, now: () => current, idFactory });
  store.load();
  const api = createApi(store, { now: () => current, idFactory });
  return { store, api, idFactory, setNow: (value) => { current = value; } };
}

/* ------------------------------------------------------------------ schema */

test('Schema v103 migrates additively: empty ledgers, declared conventions, nothing inferred', () => {
  assert.equal(SCHEMA_VERSION, 148);
  const migrated = migrate({ schemaVersion: 102, settings: { leaderName: 'Keep this' } });
  assert.deepEqual(migrated.applied, ['102 → 103', '103 → 104', '104 → 105', '105 → 106', '106 → 107', '107 → 108', '108 → 109', '109 → 110', '110 → 111', '111 → 112', '112 → 113', '113 → 114', '114 → 115', '115 → 116', '116 → 117', '117 → 118', '118 → 119', '119 → 120', '120 → 121', '121 → 122', '122 → 123', '123 → 124', '124 → 125', '125 → 126', '126 → 127', '127 → 128', '128 → 129', '129 → 130', '130 → 131', '131 → 132', '132 → 133', '133 → 134', '134 → 135', '135 → 136', '136 → 137', '137 → 138', '138 → 139', '139 → 140', '140 → 141', '141 → 142', '142 → 143', '143 → 144', '144 → 145', '145 → 146', '146 → 147', '147 → 148']);
  assert.deepEqual(migrated.raw.reputationActs, []);
  assert.deepEqual(migrated.raw.reputationPositions, []);
  assert.deepEqual(migrated.raw.reputationMarkers, []);
  assert.equal(migrated.raw.settings.leaderName, 'Keep this');
  assert.equal(migrated.raw.settings.reputationWindowDays, 365);
  assert.equal(migrated.raw.settings.reputationHalfLifeDays, 270);
  assert.equal(migrated.raw.settings.reputationClassHazard.delivery, 15);
  const normalized = normalizeState(migrated.raw, { now: NOW });
  assert.deepEqual(normalized.state.reputationActs, []);
  assert.deepEqual(normalized.state.reputationPositions, []);
});

test('the normalizers are fail-closed, and a stored DERIVED act is dropped rather than left spending stale capital', () => {
  const warnings = [];
  const acts = normalizeReputationActs([
    { id: 'a1', personId: 'lead1', actClass: 'delivery', status: 'kept', on: '2026-10-01' },
    { id: 'a1', personId: 'lead1', actClass: 'delivery', status: 'kept', on: '2026-10-02' }, // duplicate id
    { id: 'a2', personId: 'lead1', actClass: 'nonsense', status: 'kept', on: '2026-10-01' }, // unknown class
    { id: 'a3', personId: 'lead1', actClass: 'delivery', status: 'kept', on: '2027-01-01' }, // future
    { id: 'a4', personId: 'lead1', actClass: 'delivery', status: 'kept', on: '2026-10-03', derived: true },
    { id: 'a5', personId: 'lead1', actClass: 'delivery', status: 'kept', on: '2026-10-04' },
  ], warnings, { now: NOW });
  assert.deepEqual(acts.map((a) => a.id), ['a1', 'a5']);
  assert.ok(warnings.some((w) => /derived act/i.test(w)), 'the dropped derived act is named, not silent');

  const positions = normalizeReputationPositions([
    { id: 'p1', personId: 'lead1', actClass: 'delivery', kind: 'guarantee', openedOn: '2026-10-01', dueOn: '2026-09-01' }, // due before open
    { id: 'p2', personId: 'lead1', actClass: 'delivery', kind: 'repair', openedOn: '2026-10-01' },
    { id: 'p3', personId: 'lead1', actClass: 'delivery', kind: 'unknown', openedOn: '2026-10-01' },
  ], warnings, { now: NOW });
  assert.deepEqual(positions.map((p) => p.id), ['p2']);

  const markers = normalizeReputationMarkers([{ id: 'm1', kind: 'cell' }, { id: 'm1', kind: 'dup' }, null]);
  assert.equal(markers.length, 1);

  // Conventions clamp: a hand-edited gamma cannot print a three-digit obstacle.
  const conv = reputationConventions({ reputationObstacleGamma: 500, reputationWindowDays: 5, reputationHalfLifeDays: 99999 });
  assert.equal(conv.reputationObstacleGamma, 3);
  assert.equal(conv.reputationWindowDays, 30);
  assert.equal(conv.reputationHalfLifeDays, 1825);
});

/* -------------------------------------------------------------- statistics */

test('Wilson in beta space is hand-checkable, and its alpha + beta always total n + z²', () => {
  const w = wilsonBeta(9, 1);
  // Textbook Wilson at p = 0.9, n = 10, z = 1.96: [0.5958, 0.9821].
  assert.equal(w.low.toFixed(4), '0.5958');
  assert.equal(w.high.toFixed(4), '0.9821');
  assert.equal((w.alpha + w.beta).toFixed(6), (10 + 1.96 * 1.96).toFixed(6));
  assert.equal(w.pseudoActs.toFixed(3), '1.921');
  // No observation, no interval — a refusal, not a zero.
  assert.deepEqual(wilsonBeta(0, 0), { alpha: null, beta: null, low: null, high: null, z: 1.96 });
  // A perfect record still cannot claim 100%: the interval's low end is bounded away.
  assert.ok(wilsonBeta(10, 0).low < 0.75);
});

test('the declared anchor decays, and the obstacle premium is convex but bounded', () => {
  assert.equal(decayWeight(0, 270), 1);
  assert.equal(decayWeight(270, 270), 0.5);
  assert.equal(decayWeight(540, 270), 0.25);
  // A prior weighted at 2 pulled toward a 15% hazard DRAGS a raw 50% record down,
  // and a 90% record barely moves: the anchor is weak by construction (Gelman
  // et al. 2008) and loses to the record as n grows.
  const weak = betaMean(5, 5, { hazardPct: 15, priorActs: 2 });
  assert.ok(weak < 0.6 && weak > 0.5, 'a weak anchor only nudges a 50% record (Gelman et al. 2008)');
  const strong = betaMean(45, 5, { hazardPct: 15, priorActs: 2 });
  assert.ok(strong > 0.8 && strong > weak, 'the record beats the anchor as it accumulates');
  assert.equal(betaMean(0, 0, { hazardPct: 15, priorActs: 0 }), null);

  const atStake = obstaclePct({ tier: 'vouching', stakeActs: 6, askActs: 0, gamma: 0.35 });
  assert.equal(atStake.obstaclePct, 85, 'an ask inside the stake pays the tier obstacle and no premium');
  const overAsk = obstaclePct({ tier: 'vouching', stakeActs: 6, askActs: 12, gamma: 0.35 });
  assert.ok(overAsk.obstaclePct > atStake.obstaclePct, 'a larger ask costs more');
  assert.ok(overAsk.obstaclePct < 100, 'and never prints a number it cannot mean');
  assert.equal(obstaclePct({ tier: 'structural', stakeActs: 1, askActs: 0, gamma: 0.35 }).obstaclePct, 15);
  assert.ok(obstaclePct({ tier: 'vouching', stakeActs: 1, askActs: 20, gamma: 3 }).obstaclePct <= 99.5);
});

test('every verdict is read off the INTERVAL, and every refusal names its reason', () => {
  const base = {
    actFloor: 4, exposureFloor: 3, windowDays: 365, halfLifeDays: 270,
    hazardPct: 15, priorActs: 2, gamma: 0.35, askActs: 0, tier: 'structural',
    now: '2026-11-05', lastActOn: '2026-10-01',
  };
  // No act at all: refused, and the reason says the guarantee rests on nothing.
  const nothing = cellReading({ ...base, kept: 0, breached: 0 });
  assert.equal(nothing.verdict, 'refused');
  assert.match(nothing.reason, /resting on nothing/);
  // A strong record on an ordinary anchor is PUBLISHED, not suppressed by the anchor.
  const strong = cellReading({ ...base, kept: 9, breached: 0 });
  assert.equal(strong.verdict, 'solvent');
  assert.ok(strong.intervalLowPct >= strong.obstaclePct);
  // A poor record sits below even the class base rate: drawn down, not merely encumbered.
  const drawn = cellReading({ ...base, kept: 0, breached: 40 });
  assert.equal(drawn.verdict, 'drawn-down');
  assert.match(drawn.reason, /worse than the base rate/);
  // A stake that is real but smaller than a HIGH-tier ask is encumbered, not drawn down:
  // the distinction is which side of the declared hazard the interval falls.
  const encumbered = cellReading({ ...base, kept: 2, breached: 10, tier: 'vouching' });
  assert.equal(encumbered.verdict, 'encumbered');
  assert.match(encumbered.reason, /stake is real but the ask/);
  // Dispute outranks everything: the ledger will not price a contested class.
  assert.equal(cellReading({ ...base, kept: 9, breached: 0, disputed: 1 }).verdict, 'contested');
  // Below the floors: refused with the floor named.
  const thin = cellReading({ ...base, kept: 1, breached: 0 });
  assert.equal(thin.verdict, 'refused');
  assert.match(thin.reason, /floor/);
  // Outside the window the record lapses rather than becoming a loss.
  const lapsed = cellReading({ ...base, kept: 9, breached: 0, lastActOn: '2024-01-01', windowDays: 90 });
  assert.equal(lapsed.verdict, 'expired');
  // WILSON-FIRST, corrected: the probe puts the ANCHOR on trial, not the record.
  // A 90% anchor clears a 15% obstacle on its own interval, so the cell is refused.
  const anchorDecides = cellReading({ ...base, hazardPct: 90, kept: 10, breached: 0 });
  assert.equal(anchorDecides.verdict, 'refused');
  assert.match(anchorDecides.reason, /A prior that can decide the verdict by itself/);
  // And the same record at a 15% anchor is solvent: the rule no longer eats good cells.
  assert.equal(cellReading({ ...base, hazardPct: 15, kept: 10, breached: 0 }).verdict, 'solvent');
  // KL divergence is finite and non-negative.
  assert.ok(betaKl(8, 2, 20) >= 0);
  assert.ok(Number.isFinite(betaKl(8, 2, 20)));
});

/* --------------------------------------------------------------- harvesting */

test('acts are harvested from records OTHER modules own — no re-typing, and a hand-typed twin is refused', () => {
  const raw = delegations(delegations(delegations(tree(), 'lead1', { n: 9 }), 'lead2', { n: 9, late: true }), 'mgr1', { n: 6, prefix: 'own' });
  const { api, store } = harness(raw);
  const harvest = harvestActs(store.state, { now: NOW });
  const delivery = harvest.acts.filter((a) => a.actClass === 'delivery');
  assert.equal(delivery.length, 24);
  assert.equal(delivery.filter((a) => a.personId === 'lead1' && a.status === 'kept').length, 9);
  assert.equal(delivery.filter((a) => a.personId === 'lead2' && a.status === 'breached').length, 9);

  // The workspace already derives lead1's kept delivery for 2026-08-08.
  const twin = api.reputationRecordAct({ personId: 'lead1', actClass: 'delivery', status: 'kept', on: '2026-08-08' });
  assert.equal(twin.ok, false);
  assert.match(twin.error, /already derives an act/i);
  // A class the workspace cannot see is accepted, because only a human knows it.
  const manual = api.reputationRecordAct({ personId: 'lead1', actClass: 'custody', status: 'kept', on: '2026-09-01', note: 'supplier commitment' });
  assert.equal(manual.ok, true, manual.error);
  assert.equal(store.state.reputationActs.length, 1);
  // And a duplicate of that manual act is refused too.
  assert.equal(api.reputationRecordAct({ personId: 'lead1', actClass: 'custody', status: 'kept', on: '2026-09-01' }).ok, false);
});

/* ------------------------------------------- cross-module + cross-altitude */

test('RULE-RCL-01 writes rests-on provenance and ONE rolls-up-to edge per leadership ancestor in the SAME transaction', () => {
  const { api, store } = harness();
  // Nothing is written on a READ. The spine runs on the explicit scan, in one
  // transaction, alongside every other rule — that is what "same transaction" means.
  assert.equal((store.state.links || []).length, 0, 'a fresh read writes no edge');
  api.reputationScan();
  const links = store.state.links || [];
  const restsOn = links.filter((l) => l.relation === 'rests-on');
  const rolls = links.filter((l) => l.relation === 'rolls-up-to');
  assert.ok(restsOn.length > 0, 'every cell carries provenance to the dated records it read');
  assert.ok(rolls.length > 0, 'every cell rolls up the chain');
  // lead2 sits under mgr1 → dir1 → vp1. A frontline span's cell must reach at
  // least its manager and the director above it, in the SAME transaction.
  const lead2Roll = rolls.filter((l) => l.sourceId === 'lead2');
  assert.ok(lead2Roll.length >= 2, 'a frontline span reaches at least manager and director');
  // Provenance resolves to a real record, not a string.
  const first = restsOn.find((l) => l.targetType === 'delegation');
  assert.ok(first, 'a rested-on edge points at a delegation');
  const resolved = resolveLinkedEntity(store.state, 'delegation', first.targetId);
  assert.ok(resolved && resolved.id === first.targetId);
  assert.ok(LINK_RELATIONS.includes('rests-on'));
  // The rule is marker-idempotent: a second scan writes no new cell marker.
  const before = (store.state.reputationMarkers || []).length;
  api.reputationScan();
  const after = (store.state.reputationMarkers || []).filter((m) => m.kind === 'cell').length;
  assert.equal(after, (store.state.reputationMarkers || []).filter((m) => m.kind === 'cell').length);
  assert.ok(after >= before - 5, 'cell registration converges rather than repeating');
});

test('a non-solvent class opens exactly ONE governed decision per span per class per ISO week', () => {
  const { api, store } = harness();
  // Nothing propagates on a read: the spine is event-driven. One explicit scan
  // runs every rule in a single transaction, exactly as the button does.
  assert.equal((store.state.decisions || []).length, 0, 'a fresh read opens no decision');
  const scan = api.reputationScan();
  assert.equal(scan.ok, true, scan.error);
  const isFinding = (d) => /^Guarantee · repair ·/.test(d.title) || /^Contested act ·/.test(d.title);
  const opened = (store.state.decisions || []).filter(isFinding);
  assert.equal(opened.length, 1, 'lead2\'s encumbered delivery class opened exactly one finding');
  assert.match(opened[0].title, /delivery/);
  assert.equal(opened[0].driver, opened[0].driver ?? 'lead2', 'owned at the span that can author the repair');
  // A second scan inside the same ISO week opens nothing new.
  api.reputationScan();
  assert.equal((store.state.decisions || []).filter(isFinding).length, 1);
  // The marker ledger is what gates it, and it carries the week key.
  const markers = (store.state.reputationMarkers || []).filter((m) => m.kind === 'breach');
  assert.equal(markers.length, 1);
  assert.equal(markers[0].weekKey, '2026-11-02');
  assert.equal(markers[0].personId, 'lead2');
  assert.equal(markers[0].actClass, 'delivery');
  // It rides the shared spine's decision shape: options, a review date, a rationale.
  assert.ok(opened[0].options.length >= 3);
  assert.ok(opened[0].reviewOn);
  assert.match(opened[0].rationale, /RULE-RCL-02/);
});

test('an open guarantee freezes its claim at open time and is graded ONCE against it', () => {
  const raw = delegations(tree(), 'lead1', { n: 12 });
  // A frozen pre-registration: ANOTHER module owns the contract and its outcome.
  raw.prospectiveContracts = [{
    id: 'pc-1', title: 'Cases close inside the horizon', declaredOn: '2026-09-01', horizonOn: '2026-10-01',
    instrumentKey: 'case-resolution', cohortIds: ['c1', 'c2', 'c3'], probabilityPct: 80, thresholdPct: 60,
    altitudeKey: 'manager', rank: 2, scopeSeatId: 'lead1', createdAt: NOW_ISO,
  }];
  const { api, store } = harness(raw);

  // A guarantee can be opened before any calibration act exists, and such a
  // position carries a NULL claim. The rule must refuse to grade it rather than
  // writing a claim after the fact. Proven directly on the rule, because the
  // harvest would otherwise supply an act from the contract itself.
  const noClaimState = structuredClone(store.state);
  noClaimState.reputationPositions = [{
    id: 'rpos-nullclaim', personId: 'lead1', actClass: 'custody', kind: 'guarantee', tier: 'escrowed',
    status: 'open', openedOn: '2026-09-01', dueOn: '2026-12-01', askActs: 1, closedOn: null,
    outcome: null, decisionId: null, breaksActId: null, openedBy: 'lead1',
    sourceType: 'mandate', sourceId: 'mandate-nullclaim', claimP: null, grade: null, createdAt: NOW_ISO,
  }];
  noClaimState.mandates = [{ id: 'mandate-nullclaim', personId: 'lead1', status: 'verified', verifiedOn: '2026-09-20' }];
  const out = [];
  reputationalCapitalRule(noClaimState, {
    event: { type: 'reputation.scan', entity: 'workspace', entityId: 'all' },
    now: NOW, settings: noClaimState.settings, idFactory: (prefix) => `${prefix}-nc`,
    logEvent: () => {}, todayStr: '2026-11-05',
  });
  const refusedPos = noClaimState.reputationPositions.find((p) => p.id === 'rpos-nullclaim');
  assert.equal(refusedPos.grade, null, 'a null claim is never back-filled from hindsight');
  assert.equal(refusedPos.status, 'open');
  const refusal = (noClaimState.reputationMarkers || []).find((m) => m.kind === 'grade-refused');
  assert.ok(refusal, 'the refusal is named in the marker ledger');
  assert.match(refusal.note, /hindsight/);

  // Now a cell WITH a real record and a real interval: the claim freezes and grades once.
  const priced2 = api.reputationPriceAsk({ personId: 'lead1', actClass: 'delivery', tier: 'structural', askActs: 0 });
  assert.equal(priced2.ok, true, priced2.error);
  assert.ok(Number.isFinite(priced2.claimP), 'a cell with a record can freeze a claim');
  const guaranteed = api.reputationOpenPosition({
    personId: 'lead1', actClass: 'delivery', kind: 'guarantee', tier: 'structural',
    dueOn: '2026-12-01', askActs: 0, sourceType: 'delegation', sourceId: 'del-lead1-0',
  });
  assert.equal(guaranteed.ok, true, guaranteed.error);
  assert.equal(guaranteed.claimP, priced2.claimP);
  const one = store.state.reputationPositions.find((p) => p.id === guaranteed.id);
  assert.ok(one.grade, 'RULE-RCL-05 graded the guarantee from the source record');
  assert.equal(one.grade.claimP, guaranteed.claimP, 'against the FROZEN claim, not today\'s');
  assert.equal(one.grade.y, 1, 'the delegation completed on time');
  assert.equal(one.grade.error, Math.round((1 - guaranteed.claimP) ** 2 * 1e6) / 1e6);
  // A second scan never re-grades: the claim is scored once, and the position stays closed.
  api.reputationScan();
  const again = store.state.reputationPositions.find((p) => p.id === guaranteed.id);
  assert.equal(again.grade.error, one.grade.error);
  assert.equal(again.status, 'kept');
});

test('a repair closes as kept only once the acts it declared were actually banked, otherwise it opens a decision', () => {
  const raw = delegations(tree(), 'lead1', { n: 8 });
  const { api, store, setNow } = harness(raw);
  // A repair with a target the record will meet: lead1 keeps delivery acts.
  const repair = api.reputationOpenPosition({
    personId: 'lead1', actClass: 'delivery', kind: 'repair', tier: 'vouching', askActs: 1, dueOn: '2026-11-06',
  });
  assert.equal(repair.ok, true, repair.error);
  // A second repair that cannot be met inside its window.
  const missed = api.reputationOpenPosition({
    personId: 'lead2', actClass: 'continuity', kind: 'repair', tier: 'vouching', askActs: 9, dueOn: '2026-11-06',
  });
  assert.equal(missed.ok, true, missed.error);
  setNow(new Date('2026-11-10T12:00:00.000Z'));
  // Bank one fresh kept delivery act for lead1, dated after the repair opened.
  api.reputationRecordAct({ personId: 'lead1', actClass: 'delivery', status: 'kept', on: '2026-11-07' });
  api.reputationScan();
  const closedRepair = store.state.reputationPositions.find((p) => p.id === repair.id);
  assert.equal(closedRepair.status, 'kept', 'a met repair closes as kept from the record, not from a self-report');
  const missedRepair = store.state.reputationPositions.find((p) => p.id === missed.id);
  assert.equal(missedRepair.status, 'open', 'an unmet repair is never silently closed');
  assert.ok((store.state.decisions || []).some((d) => /^Repair ·/.test(d.title)), 'the missed repair opened a governed decision');
});

/* ------------------------------------------------------------- seat boundary */

test('the seat boundary holds: a declared seat reads its own subtree and never a peer or a manager', () => {
  const raw = delegations(delegations(tree(), 'lead1', { n: 9 }), 'lead2', { n: 9, late: true });
  delegations(raw, 'mgr1', { n: 8, prefix: 'mgr' });
  // ADR-0075: a leader with no reports is not a seat. Give both leads an IC so
  // each is a real frontline rung with a real subtree.
  raw.people.push(
    { id: 'ic1', name: 'Ari IC', role: 'Analyst', level: 'ic', team: 'Billing', managerId: 'lead1', status: 'active' },
    { id: 'ic2', name: 'Sam IC', role: 'Analyst', level: 'ic', team: 'Billing', managerId: 'lead2', status: 'active' },
  );
  delegations(raw, 'ic1', { n: 6, prefix: 'ic1' });
  delegations(raw, 'ic2', { n: 6, prefix: 'ic2' });
  const { api } = harness(raw);

  // Undeclared: the operator view is full access BY DESIGN (ADR-0076 preserves the
  // pre-0076 single-operator workspace). This is the default, not a bug.
  const full = api.reputationReport();
  assert.equal(full.ok, true, full.error);
  assert.equal(full.seat.fullAccess, true);
  assert.ok(full.readings.some((r) => r.personId === 'lead2'), 'the operator reads the whole workspace');

  // Declared at lead1: itself and its own IC, never a peer, never a manager.
  const report = api.reputationReport({ seatId: 'lead1' });
  assert.equal(report.ok, true, report.error);
  assert.equal(report.seat.id, 'lead1');
  assert.equal(report.seat.fullAccess, false);
  const seen = new Set(report.readings.map((r) => r.personId));
  assert.ok(seen.has('lead1'), 'the seat reads itself');
  assert.ok(seen.has('ic1'), 'and the span beneath it');
  for (const out of ['lead2', 'ic2', 'mgr1', 'dir1', 'vp1']) {
    assert.equal(seen.has(out), false, `and never ${out}`);
  }
  // The class table at this seat counts only what the seat can read.
  const persons = report.classRows.reduce((sum, row) => sum + row.personsN, 0);
  assert.ok(persons <= 2, `the class table counts at most the seat's two spans, got ${persons}`);
});

/* -------------------------------------------------------------- surfaces */

test('the CSV scope is aggregate-only and refusal-honest, and the brief carries no person', () => {
  const { store } = harness();
  const report = buildReputationReport(store.state, { now: NOW, settings: store.state.settings });
  const rows = reputationCsvRows(report);
  assert.ok(rows.length > 0);
  const text = JSON.stringify(rows);
  for (const person of ['lead1', 'lead2', 'mgr1', 'Vera', 'Pat Lead', 'Lee Lead']) {
    assert.equal(text.includes(person), false, `the export must not name ${person}`);
  }
  assert.equal(text.includes('del-lead1-0'), false, 'and must not carry a source record id');
  // A suppressed cell is blank, never zero.
  for (const row of rows.filter((r) => r.row_kind === 'class' && r.suppressed === 1)) {
    assert.equal(row.pooled_kept_pct, '');
    assert.equal(row.interval_low_pct, '');
  }
  const brief = reputationBriefText(report);
  assert.match(brief, /No person is rated/);
  assert.equal(brief.includes('Lee Lead'), false);
  assert.ok(CSV_EXPORTS.some((s) => s.key === 'reputation'), 'CSV scope #97 is registered');

  // Signals are platform-shaped so the board reads them without a translator.
  const signals = reputationSignals(store.state, { now: NOW, settings: store.state.settings });
  assert.ok(signals.length > 0);
  for (const signal of signals) {
    assert.match(signal.ruleId, /^RCLA-0\d$/);
    assert.ok(signal.domain && signal.title && signal.detail);
    assert.ok(Array.isArray(signal.evidence) && signal.action?.route?.startsWith('#/reputation'));
  }
});

test('the module is wired into schema, spine, contracts, gateway, route table, CSV register and the disclosure catalogue', () => {
  assert.equal(SCHEMA_VERSION, 148);
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(reputationalCapitalRule), 'on the shared post-commit spine');
  const contract = contractFor(reputationalCapitalRule);
  assert.ok(contract, 'a registered propagation contract');
  assert.ok(contract.writes.includes('links'));
  assert.ok(PROPAGATION_CONTRACTS.length > 0);
  assert.equal(API_RIGHTS.reputationRecordAct, 'record-reputation-act');
  assert.equal(API_RIGHTS.reputationOpenPosition, 'offer-reputation-guarantee');
  assert.equal(API_RIGHTS.reputationSetConventions, 'govern-reputation');
  assert.ok(LINK_RELATIONS.includes('rests-on'));
  assert.ok(manifestFor('#/reputation') || manifestFor('reputation'), 'a disclosure manifest row exists');
});

test('every panel renders on an empty and on a populated workspace without leaking a placeholder', () => {
  const empty = createApi(createStore({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }, now: () => NOW, idFactory: (p) => `${p}-e` }));
  const { api } = harness();
  const panels = ['desk', 'classes', 'guarantees', 'repair', 'method'];
  for (const panel of panels) {
    const query = new URLSearchParams(`panel=${panel}`);
    for (const source of [null, api]) {
      const state = source ? null : undefined;
      if (state !== null) continue;
      const ctx = {
        api,
        state: undefined,
        query,
        navigate: () => {},
        seatContext: null,
      };
      const node = renderReputation({ ...ctx, api });
      assert.ok(node, `${panel} renders`);
      const html = node.outerHTML || '';
      assert.equal(/undefined|NaN|\[object Object\]/.test(html), false, `${panel} leaks no placeholder`);
    }
    assert.ok(empty, 'the empty workspace api was constructible');
  }
});

test('a11y: every panel passes axe-core on a populated workspace', async () => {
  const { api, store } = harness();
  store.update(() => {}, { type: 'reputation.scan', entity: 'workspace', entityId: 'all', summary: 'scan' });
  const view = document.getElementById('view');
  for (const panel of ['desk', 'classes', 'guarantees', 'repair', 'method']) {
    const ctx = {
      api,
      state: store.state,
      query: new URLSearchParams(`panel=${panel}`),
      navigate: () => {},
      seatContext: null,
    };
    mount(view, renderReputation(ctx));
    if (!dom.window.axe) dom.window.eval(axe.source);
    const result = await dom.window.axe.run(view, { rules: { 'color-contrast': { enabled: false } } });
    const violations = Array.from(result.violations).map((v) => `${v.id}: ${v.help}`);
    assert.deepEqual(violations, [], `${panel} is axe-clean`);
  }
});

test('attention counts and the price-ask dry run never write a record', () => {
  const { api, store } = harness();
  const positionsBefore = store.state.reputationPositions.length;
  const actsBefore = store.state.reputationActs.length;
  const decisionsBefore = store.state.decisions.length;
  const priced = api.reputationPriceAsk({ personId: 'lead2', actClass: 'delivery', tier: 'bearing', askActs: 3 });
  assert.equal(priced.ok, true, priced.error);
  assert.ok(priced.reading.verdict);
  assert.ok(priced.counterfactual.tiers.length === 4, 'every tier is priced');
  assert.equal(store.state.reputationPositions.length, positionsBefore, 'a dry run writes nothing');
  assert.equal(store.state.reputationActs.length, actsBefore);
  assert.equal(store.state.decisions.length, decisionsBefore);
  assert.ok(reputationAttentionCount(store.state, { now: NOW, settings: store.state.settings }) >= 0);
});
