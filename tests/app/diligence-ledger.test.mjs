/**
 * ADR-0104, Schema v106 — the Diligence Ledger (`#/diligence`).
 *
 * These tests are the acceptance proof, not a smoke test. They establish:
 *   1. v105 → v106 is additive, empty and idempotent — no frontier is invented.
 *   2. The harvest reads FIVE evidence classes owned by OTHER modules from the
 *      NORMALIZED state (the `createdAt` fallback is a real fix found by reading
 *      the record, not the docs), excludes later/same-day facts and copies no
 *      content, titles, people or notes.
 *   3. RULE-DLG-01 writes, in the SAME ATOMIC COMMIT that records a decision,
 *      one `diligence-for` edge, one `deliberates-on` edge per fact across
 *        modules, and one `rolls-up-to` edge per leadership ancestor: a real
 *      frontline decision reaches manager → director → VP with zero re-entry.
 *   4. A consultation is a first-class dated act (used / ruled-out WITH a
 *      reason / deferred), and the coverage and class statistics re-derive.
 *   5. Wilson (1927), Jeffreys Beta(½,½) via the incomplete beta, and Brier
 *      (1950) skill against a strictly-prior base rate are hand-checkable and
 *      refusal-honest; an overconfident forecast prints a NEGATIVE skill.
 *   6. RULE-DLG-02/03/04 open and grade exactly once, marker-idempotently, and
 *      the Hindsight Lock refuses to lock this module's audit output.
 *   7. Scoping, access rights, CSV #100, the manifest and the six panels are
 *      wired — no role leakage, no identifier in an upward brief or export.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="view"></div></body></html>', { url: 'https://leados.test/', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
globalThis.Element = dom.window.Element;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Event = dom.window.Event;
globalThis.localStorage = dom.window.localStorage;

import { createApi } from '../../app/actions.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { MODULE_MANIFESTS } from '../../app/core/domain/disclosureManifests.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS, contractFor } from '../../app/core/domain/propagationContracts.js';
import { API_RIGHTS, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { RECORD_POLICIES } from '../../app/core/domain/seatRegistry.js';
import {
  LINK_ENTITY_TYPES, LINK_ENTITY_COLLECTIONS, LINK_RELATIONS, LINK_RELATION_LABELS,
  SYSTEM_GENERATED_LINK_RELATIONS, resolveLinkedEntity,
} from '../../app/core/domain/cases.js';
import {
  betaIncomplete, brierSkill, buildDiligenceReport, classCells, coverageOf,
  diligenceCsvRows, gradeForecast, jeffreysInterval, knowableFacts, wilsonInterval,
  diligenceBriefText, diligenceAttentionCount,
} from '../../app/core/domain/diligence.js';
import { diligenceRule, diligenceFindingIds } from '../../app/core/domain/diligenceRules.js';
import {
  normalizeDiligenceChecklists, normalizeDiligenceConsults, normalizeDiligenceSettings,
} from '../../app/core/domain/diligenceSchema.js';
import {
  DILIGENCE_EVENTS, DILIGENCE_RULE_IDS, EVIDENCE_CLASS_KEYS,
} from '../../app/core/domain/diligenceRegistry.js';
import { hindsightRule } from '../../app/core/domain/hindsightRules.js';
import { renderDiligence } from '../../app/views/diligence.js';

const NOW = new Date('2026-11-06T12:00:00.000Z');
const NOW_ISO = NOW.toISOString();
const clone = (value) => JSON.parse(JSON.stringify(value));

/** Four real leadership altitudes plus the workspace leader above the VP. */
function tree(overrides = {}) {
  const state = createEmptyState(NOW_ISO);
  state.settings = {
    ...state.settings,
    chainLeaderAltitude: 'exec',
    leaderName: 'Dana Root',
    // Declared, clamped, printed. Tuned low so a small honest fixture can
    // exercise every refusal AND every measurement in the same workspace.
    diligenceKnowableFloor: 4,
    diligenceCoverageFloorPct: 70,
    diligenceClassFloor: 2,
    diligenceDarkCeilingPct: 60,
    diligenceGradeClaimFloor: 2,
    diligenceForecastHorizonDays: 45,
    diligenceReviewDays: 14,
    diligenceStaleDays: 90,
    diligenceAutoPropagate: true,
  };
  // Only the Diligence Ledger propagates automatically in this fixture, so the
  // assertions below cannot pass because some other module wrote a similar link.
  for (const key of Object.keys(state.settings)) {
    if (key.endsWith('AutoPropagate') && key !== 'diligenceAutoPropagate') state.settings[key] = false;
  }
  state.people = [
    { id: 'vp1', name: 'Vera VPSENT', role: 'VP', level: 'vp', team: 'Ops', managerId: null, status: 'active' },
    { id: 'dir1', name: 'Dana DIRSENT', role: 'Director', level: 'director', team: 'Ops', managerId: 'vp1', status: 'active' },
    { id: 'mgr1', name: 'Mira MGRSENT', role: 'Manager', level: 'manager', team: 'Billing', managerId: 'dir1', status: 'active' },
    { id: 'lead1', name: 'Lee LEADSENT', role: 'Shift lead', level: 'lead', team: 'Billing', managerId: 'mgr1', status: 'active' },
    { id: 'peerlead1', name: 'Pia PEERSENT', role: 'Shift lead', level: 'lead', team: 'Dispatch', managerId: 'dir1', status: 'active' },
    // A leadership node is a node WITH DIRECT REPORTS. Without these two
    // operators the frontline leads are ordinary individual contributors and
    // the operating seat correctly refuses to declare them as seats.
    { id: 'ic1', name: 'Ari IC1SENT', role: 'Operator', level: 'ic', team: 'Billing', managerId: 'lead1', status: 'active' },
    { id: 'ic2', name: 'Bo IC2SENT', role: 'Operator', level: 'ic', team: 'Dispatch', managerId: 'peerlead1', status: 'active' },
  ];
  // Facts that existed ON OR BEFORE the decision date (2026-11-01), from five
  // different modules. Each class has two records so a class cell is measurable.
  state.cases = [
    { id: 'case1', title: 'Billing backlog', kind: 'risk', status: 'open', ownerId: 'lead1', openedOn: '2026-10-01', severity: 3, fmea: { severity: 8, probability: 5, detectability: 4 } },
    { id: 'case2', title: 'Intake rework', kind: 'risk', status: 'open', ownerId: 'lead1', openedOn: '2026-10-05', severity: 2 },
  ];
  state.premises = [
    { id: 'prem1', title: 'Demand holds', statement: 'Demand holds', criticality: 'load-bearing', priorPct: 70, watchPct: 55, breachPct: 30, createdAt: '2026-10-02', sourceRefs: [], history: [], observations: [] },
    { id: 'prem2', title: 'Queue is seasonal', statement: 'Queue is seasonal', criticality: 'load-bearing', priorPct: 60, watchPct: 45, breachPct: 25, createdAt: '2026-10-06', sourceRefs: [], history: [], observations: [] },
  ];
  state.delegations = [
    { id: 'del1', title: 'Rewrite the intake form', personId: 'lead1', status: 'active', delegatedOn: '2026-10-03', dueOn: '2026-11-20', authority: 'decide', checkins: [] },
    { id: 'del2', title: 'Audit the queue', personId: 'lead1', status: 'active', delegatedOn: '2026-10-07', dueOn: '2026-11-22', authority: 'recommend', checkins: [] },
  ];
  state.goals = [
    { id: 'goal1', title: 'Cut the queue', ownerId: 'lead1', status: 'active', createdAt: '2026-10-04', dueDate: '2026-12-01', keyResults: [], checkins: [] },
    { id: 'goal2', title: 'Zero rework', ownerId: 'lead1', status: 'active', createdAt: '2026-10-08', dueDate: '2026-12-15', keyResults: [], checkins: [] },
  ];
  state.decisions = [
    { id: 'old1', title: 'Earlier settled call', date: '2026-09-01', outcome: 'good', chosen: 'merge', options: [], rationale: 'The precedent.' },
    { id: 'later1', title: 'A fact that arrived AFTER the call', date: '2026-11-04', outcome: 'bad', chosen: 'split', options: [], rationale: 'Too late to be knowable.' },
  ];
  sPatch(state, overrides.state);
  return normalizeState(state, { now: NOW }).state;
}

function sPatch(state, patch = {}) {
  for (const [key, value] of Object.entries(patch)) state[key] = value;
  return state;
}

/** A real store loaded from storage, exactly as the browser loads it. */
function harness(state) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-dlg-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory });
  return { store, api };
}

/* ------------------------------------------------------------------ schema */

test('Schema v106 migrates additively: empty ledgers, declared conventions, nothing back-filled', () => {
  assert.equal(SCHEMA_VERSION, 116);
  const base = createEmptyState(NOW_ISO);
  const legacy = { ...base, schemaVersion: 105 };
  for (const key of ['diligenceChecklists', 'diligenceConsults', 'diligenceGrades', 'diligenceMarkers']) delete legacy[key];
  legacy.settings = { ...base.settings };
  delete legacy.settings.diligenceKnowableFloor;
  const migrated = migrate(legacy);
  assert.equal(migrated.raw.schemaVersion, 116);
  assert.deepEqual(migrated.raw.diligenceChecklists, []);
  assert.deepEqual(migrated.raw.diligenceConsults, []);
  assert.deepEqual(migrated.raw.diligenceGrades, []);
  assert.deepEqual(migrated.raw.diligenceMarkers, []);
  assert.equal(migrated.raw.settings.diligenceKnowableFloor, 8, 'the declared default, not a fitted value');
  assert.equal(migrated.raw.settings.diligenceGradeClaimFloor, 3);
  assert.ok(migrated.applied.includes('105 → 106')); assert.equal(migrated.applied.at(-1), '114 → 115', '115 → 116');
  assert.deepEqual(migrate(migrated.raw).applied, [], 'idempotent');
  const normalized = normalizeState(migrated.raw, { now: NOW }).state;
  assert.deepEqual(normalized.diligenceChecklists, []);
  assert.ok(!normalized.links.some((link) => link.relation === 'diligence-for'), 'an upgrade invents NO frontier and NO edge');
});

/* --------------------------------------------------------------- wiring */

test('the Diligence Ledger is registered on the shared spine, the manifest, rights, graph and CSV', () => {
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, 90);
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length);
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(diligenceRule));
  const contract = contractFor(diligenceRule);
  assert.ok(contract);
  assert.equal(contract.module, 'diligenceRules.js');
  assert.deepEqual(contract.writes, ['diligenceChecklists', 'diligenceConsults', 'diligenceGrades', 'diligenceMarkers', 'decisions', 'links']);
  assert.equal(contract.scansWorkspace, true);

  const manifest = MODULE_MANIFESTS.diligence;
  assert.ok(manifest);
  assert.deepEqual([...manifest.collections], ['diligenceChecklists', 'diligenceConsults', 'diligenceGrades', 'diligenceMarkers']);
  assert.equal(manifest.adapterScoped, true);
  assert.equal(manifest.detailCeiling, 0, 'raw fact pointers never enter a declared-seat projection');
  for (const key of manifest.collections) assert.ok(RECORD_POLICIES[key], `a policy exists for ${key}`);
  for (const name of ['diligenceConsult', 'diligenceForecast', 'diligenceScan', 'diligenceSetConventions']) {
    assert.ok(API_RIGHTS[name], `an act right exists for ${name}`);
  }
  assert.equal(API_RIGHTS.diligenceSetConventions, 'govern-diligence');
  for (const name of ['diligenceReport', 'diligenceBriefText', 'diligenceCsvRows', 'diligenceSettings']) {
    assert.ok(SAFE_READS.has(name), `${name} is a safe read`);
  }
  for (const type of ['diligencechecklist', 'diligencegrade']) {
    assert.ok(LINK_ENTITY_TYPES.includes(type));
    assert.ok(LINK_ENTITY_COLLECTIONS[type]);
  }
  for (const relation of ['diligence-for', 'deliberates-on', 'tracks-followup', 'grades-diligence']) {
    assert.ok(LINK_RELATIONS.includes(relation));
    assert.ok(SYSTEM_GENERATED_LINK_RELATIONS.includes(relation));
    assert.ok(LINK_RELATION_LABELS[relation]);
  }
  assert.equal(CSV_EXPORTS.length, 104);
  assert.ok(CSV_EXPORTS.some((scope) => scope.key === 'diligence' && /aggregate/i.test(scope.label)));
});

/* ----------------------------------------------------------- normalizers */

test('normalizers are fail-closed: a half-written frontier, a future consult and a reason-less dismissal are dropped', () => {
  const warnings = [];
  const checklists = normalizeDiligenceChecklists([
    { id: 'dlg1', decisionId: 'd1', decisionOn: '2026-11-01', frozenOn: '2026-11-01', facts: [{ sourceType: 'case', sourceId: 'c1', evidenceClass: 'risk', evidencesOn: '2026-10-01', severity: 3 }] },
    { id: 'dlg2', decisionId: 'd2', frozenOn: '2026-11-01', facts: [] }, // no decision date
    { id: 'dlg1', decisionId: 'd3', decisionOn: '2026-11-01', frozenOn: '2026-11-01', facts: [] }, // duplicate id
  ], warnings);
  assert.deepEqual(checklists.map((row) => row.id), ['dlg1']);
  assert.ok(warnings.some((w) => w.includes('duplicate id')));

  const consults = normalizeDiligenceConsults([
    { id: 'k1', checklistId: 'dlg1', sourceType: 'case', sourceId: 'c1', evidenceClass: 'risk', disposition: 'used', consultedOn: '2026-11-02' },
    { id: 'k2', checklistId: 'dlg1', sourceType: 'case', sourceId: 'c2', evidenceClass: 'risk', disposition: 'ruled-out', consultedOn: '2026-11-02', reason: '' },
    { id: 'k3', checklistId: 'dlg1', sourceType: 'goal', sourceId: 'g1', evidenceClass: 'objective', disposition: 'used', consultedOn: '2027-01-01' },
    { id: 'k1', checklistId: 'dlg1', sourceType: 'case', sourceId: 'c1', evidenceClass: 'risk', disposition: 'deferred', consultedOn: '2026-11-03', reason: 'Parked' },
  ], warnings, { now: NOW });
  assert.deepEqual(consults.map((row) => row.id), ['k1'], 'only the one valid, non-duplicate, non-future consultation survives');
  assert.ok(warnings.some((w) => w.includes('ruled-out')));
  assert.ok(warnings.some((w) => w.includes('future')));
});

test('conventions are clamped and printed, never fitted', () => {
  const c = normalizeDiligenceSettings({ diligenceKnowableFloor: 999, diligenceDarkCeilingPct: -40, diligenceGradeClaimFloor: 99 });
  assert.equal(c.diligenceKnowableFloor, 12);
  assert.equal(c.diligenceDarkCeilingPct, 10);
  assert.equal(c.diligenceGradeClaimFloor, 6);
  assert.equal(c.diligenceAutoPropagate, true);
});

/* --------------------------------------------------------- frozen frontier */

test('knowableFacts reads ALL FIVE evidence classes from NORMALIZED state and copies no content', () => {
  const state = tree();
  const decision = { id: 'dec1', date: '2026-11-01' };
  const facts = knowableFacts(state, decision);
  const classes = new Set(facts.map((fact) => fact.evidenceClass));
  assert.deepEqual([...classes].sort(), [...EVIDENCE_CLASS_KEYS].sort(), 'all five classes are harvested');
  assert.equal(facts.length, 9, '2 cases + 2 premises + 2 delegations + 2 goals + 1 strictly-earlier precedent');
  assert.ok(!facts.some((fact) => fact.sourceId === 'later1'), 'a decision dated AFTER the call is not knowable');
  assert.ok(!facts.some((fact) => fact.sourceId === 'dec1'), 'the decision is never a precedent for itself');
  for (const fact of facts) {
    assert.deepEqual(Object.keys(fact).sort(), ['evidenceClass', 'evidencesOn', 'severity', 'sourceId', 'sourceType'].sort());
    assert.ok(fact.evidencesOn <= '2026-11-01');
  }
  const serialised = JSON.stringify(facts);
  for (const token of ['Billing backlog', 'Demand holds', 'Vera', 'PEERSENT', 'The precedent.']) {
    assert.ok(!serialised.includes(token), `no record content leaked into a pointer: ${token}`);
  }
  assert.deepEqual(knowableFacts(state, decision), facts, 'deterministic order');
  assert.deepEqual(knowableFacts(state, { id: 'dec9', date: '2026-09-01' }).map((f) => f.sourceId), [], 'a decision predating every fact freezes an honest empty frontier');
});

/* ------------------------------- THE PROOF: cross-module + cross-altitude */

test('RULE-DLG-01: ONE decision commit freezes a five-module knowable set AND rolls it up three altitudes', () => {
  const state = tree();
  const { store, api } = harness(state);
  assert.equal(store.state.diligenceChecklists.length, 0, 'a fresh workspace has frozen nothing');

  // Declare the frontline seat; this is itself a committed write, but it is NOT
  // a decision, so the ledger stays inert rather than inventing work on an
  // unrelated transaction.
  const seatRes = api.setActiveSeat('lead1');
  assert.equal(seatRes.ok, true, seatRes.error);
  assert.equal(store.state.diligenceChecklists.length, 0, 'a seat change is not a decision commit');
  // The fixture already holds TWO dated decisions. The FIRST decision commit
  // freezes those too — the ledger is a property of the record, not of a visit.
  const preExisting = 0;

  // ONE human action: record a decision. The spine must do everything else in
  // the SAME transaction — there is no second button and no manual re-entry.
  const created = api.addDecision({ title: 'Consolidate the two billing queues', date: '2026-11-01', chosen: 'merge', question: 'Merge or split?' });
  assert.equal(created.ok, true, created.error);
  const decisionId = created.id || store.state.decisions.at(-1).id;
  const decision = store.state.decisions.find((row) => row.id === decisionId);
  assert.equal(decision.title, 'Consolidate the two billing queues');

  assert.equal(store.state.diligenceChecklists.length, preExisting + 3,
    'ONE decision commit freezes its own frontier and back-fills the two dated decisions in the SAME transaction');
  const frontiers = store.state.diligenceChecklists.filter((row) => row.decisionId === decisionId);
  assert.equal(frontiers.length, 1, 'exactly ONE frozen knowable set for that decision');
  const frontier = frontiers[0];
  assert.equal(frontier.decisionOn, '2026-11-01');
  assert.equal(frontier.frozenOn, '2026-11-06');
  assert.equal(frontier.ownerSeatId, 'lead1', 'owned by the frontline span that decided');
  assert.equal(frontier.altitudeKey, 'frontline');
  assert.equal(frontier.facts.length, 9, 'nine dated facts from five other modules');
  assert.equal(new Set(frontier.facts.map((f) => f.evidenceClass)).size, 5);

  // CROSS-MODULE: one diligence-for edge, and one deliberates-on edge per fact.
  const forLinks = store.state.links.filter((link) => link.sourceType === 'diligencechecklist'
    && link.sourceId === frontier.id && link.relation === 'diligence-for');
  assert.equal(forLinks.length, 1);
  assert.equal(forLinks[0].targetId, decisionId);
  assert.equal(forLinks[0].ruleId, DILIGENCE_RULE_IDS.FREEZE);

  const onLinks = store.state.links.filter((link) => link.sourceType === 'diligencechecklist'
    && link.sourceId === frontier.id && link.relation === 'deliberates-on');
  assert.equal(onLinks.length, 9, 'one typed edge per knowable fact');
  const moduleTypes = new Set(onLinks.map((link) => link.targetType));
  assert.deepEqual([...moduleTypes].sort(), ['case', 'decision', 'delegation', 'goal', 'premise'].sort(),
    'the frontier is linked across FIVE modules owned by other code');
  assert.ok(onLinks.every((link) => !/Billing backlog|Demand holds|Dana Root/.test(link.summary)),
    'an edge points to a record; it never copies that record into the graph');

  // CROSS-ALTITUDE: lead1 → mgr1 → dir1 → vp1, with the workspace leader above.
  const up = store.state.links.filter((link) => link.sourceType === 'diligencechecklist'
    && link.sourceId === frontier.id && link.relation === 'rolls-up-to').map((link) => link.targetId).sort();
  assert.deepEqual(up, ['dir1', 'mgr1', 'vp1'], 'ONE rolls-up-to edge per leadership ancestor');
  const allNew = [...forLinks, ...onLinks, ...store.state.links.filter((l) => l.sourceId === frontier.id && l.relation === 'rolls-up-to')];
  assert.ok(allNew.every((link) => link.createdAt === allNew[0].createdAt), 'every edge was written in the SAME atomic commit');

  // The frozen frontier is a navigable, content-free graph node.
  const resolved = resolveLinkedEntity(store.state, 'diligencechecklist', frontier.id);
  assert.ok(resolved);
  assert.match(resolved.route, /^#\/diligence\?panel=frontier&frontier=/);
  assert.ok(!JSON.stringify(resolved).includes('Billing backlog'));
  assert.equal(resolved.raw.factN, 9);

  // The operator's FIRST whole-ledger scan legitimately opens the bounded
  // governed findings a creation commit did not read (there was no settlement
  // yet). Idempotence is proved by the SECOND identical scan: the marker is the
  // guard, not the operator's memory.
  assert.equal(api.diligenceScan().ok, true, 'the first whole-ledger scan converges');
  const before = {
    checklists: store.state.diligenceChecklists.length,
    links: store.state.links.length,
  };
  const scan = api.diligenceScan();
  assert.equal(scan.ok, true, scan.error);
  assert.equal(store.state.diligenceChecklists.length, before.checklists, 'a rescan cannot duplicate a frontier');
  assert.equal(store.state.links.length, before.links, 'a rescan cannot duplicate an edge');
  assert.ok(store.state.diligenceMarkers.some((marker) => marker.kind === 'freeze' && marker.checklistId === frontier.id));
});

test('cross-altitude roll-up is readable ABOVE the span and refused to a PEER span', () => {
  const state = tree();
  const { store, api } = harness(state);
  assert.equal(api.setActiveSeat('lead1').ok, true);
  const decision = { id: 'dec-direct', title: 'Shift-level call', date: '2026-11-01', outcome: 'pending', chosen: '', options: [], rationale: '' };
  // Commit through the real store so the spine runs.
  store.update((draft) => { draft.decisions.push(decision); }, { type: 'decision.created', entity: 'decision', entityId: decision.id, summary: 'Shift-level call' });
  const frontier = store.state.diligenceChecklists.find((row) => row.decisionId === decision.id);
  assert.ok(frontier, 'the decision froze a frontier');

  // A director ABOVE the deciding span sees the frontier in its scoped report.
  const above = clone(store.state);
  above.settings.activeSeatId = 'dir1';
  const upReport = buildDiligenceReport(above, { now: NOW, settings: above.settings });
  assert.ok(upReport.ledger.some((row) => row.id === frontier.id), 'the director roll-up contains the frontline frontier');
  assert.ok(upReport.altitudes.some((row) => row.altitudeKey === 'frontline'), 'the altitude table has a frontline row');

  // A PEER frontline span (same rank, different subtree) must NOT see it.
  const peer = clone(store.state);
  peer.settings.activeSeatId = 'peerlead1';
  const peerReport = buildDiligenceReport(peer, { now: NOW, settings: peer.settings });
  assert.ok(!peerReport.ledger.some((row) => row.id === frontier.id), 'no horizontal role leakage');
  assert.equal(peerReport.summary.checklistsN, 0);
  const brief = diligenceBriefText(upReport).text;
  for (const token of ['Lee LEADSENT', 'Dana DIRSENT', 'Vera VPSENT', frontier.id, decision.id, 'Billing backlog']) {
    assert.ok(!brief.includes(token), `the upward brief is identity-free: ${token}`);
  }
});

/* ------------------------------------------------------------- statistics */

test('Wilson, Jeffreys and Brier are exact, hand-checkable and refusal-honest', () => {
  const w = wilsonInterval(8, 10);
  assert.equal(w.pct, 80);
  assert.ok(w.lo < 0.8 && w.hi > 0.8 && w.lo < w.hi);
  assert.ok(w.lo > 0.4 && w.hi < 1);
  assert.equal(wilsonInterval(0, 0), null);

  // I_x(½,½) = (2/π)·asin(√x) — a closed form to check the incomplete beta.
  assert.ok(Math.abs(betaIncomplete(0.5, 0.5, 0.5) - 0.5) < 1e-9);
  assert.ok(Math.abs(betaIncomplete(0.25, 0.5, 0.5) - (2 / Math.PI) * Math.asin(Math.sqrt(0.25))) < 1e-9);
  assert.equal(betaIncomplete(0, 0.5, 0.5), 0);
  assert.equal(betaIncomplete(1, 0.5, 0.5), 1);

  const never = jeffreysInterval(0, 8);
  const always = jeffreysInterval(8, 0);
  assert.ok(never.hi < 0.4, '0-of-8 honestly prints a wide but low upper bound');
  assert.ok(always.lo > 0.6, '8-of-8 honestly prints a wide but high lower bound');
  assert.ok(never.lo < never.hi && always.lo < always.hi);
  assert.equal(never.a, 0.5);
  assert.equal(never.b, 8.5);

  const confidentAndWrong = brierSkill([{ p: 0.9, y: 0 }, { p: 0.9, y: 0 }, { p: 0.9, y: 0 }]);
  assert.equal(confidentAndWrong.brier, 0.81);
  assert.equal(confidentAndWrong.baseBrier, 0.25);
  assert.ok(confidentAndWrong.skill < 0, 'a NEGATIVE skill is printed, never clamped to zero');
  assert.equal(confidentAndWrong.verdict, 'worse-than-coin');
  assert.equal(brierSkill([{ p: 0.9, y: 1 }]).verdict, 'better-than-coin');
});

test('coverage refusals and class cells are BLANK below their declared floors', () => {
  const conv = normalizeDiligenceSettings({ diligenceKnowableFloor: 4, diligenceClassFloor: 2, diligenceDarkCeilingPct: 60, diligenceGradeClaimFloor: 2 });
  const facts = [
    { sourceType: 'case', sourceId: 'c1', evidenceClass: 'risk', evidencesOn: '2026-10-01', severity: 2 },
    { sourceType: 'case', sourceId: 'c2', evidenceClass: 'risk', evidencesOn: '2026-10-02', severity: 2 },
  ];
  const checklist = { id: 'dlg-x', facts };
  const empty = coverageOf(checklist, [], conv);
  assert.equal(empty.refused, true);
  assert.equal(empty.coveragePct, null);
  assert.match(empty.reason, /declared floor of 4/);

  const six = { id: 'dlg-y', facts: [...facts, ...Array.from({ length: 4 }, (_, i) => ({ sourceType: 'case', sourceId: `c${i + 3}`, evidenceClass: 'risk', evidencesOn: '2026-10-03', severity: 2 }))] };
  const consults = [
    { checklistId: 'dlg-y', sourceType: 'case', sourceId: 'c1', disposition: 'used' },
    { checklistId: 'dlg-y', sourceType: 'case', sourceId: 'c2', disposition: 'ruled-out', reason: 'Not applicable to this call' },
    { checklistId: 'dlg-y', sourceType: 'case', sourceId: 'c3', disposition: 'deferred', reason: 'Parked' },
  ];
  const covered = coverageOf(six, consults, conv);
  assert.equal(covered.refused, false);
  assert.equal(covered.knowableN, 6);
  assert.equal(covered.consultedN, 3);
  assert.equal(covered.coveragePct, 50);
  assert.equal(covered.used, 1);
  assert.equal(covered.ruledOut, 1, 'ruling a fact OUT WITH A REASON counts as diligence');
  assert.equal(covered.deferred, 1);
  assert.equal(covered.unconsultedN, 3);

  const cells = classCells([six], consults, conv);
  const risk = cells.find((cell) => cell.className === 'risk');
  assert.equal(risk.knowableN, 6);
  assert.equal(risk.consultedN, 3);
  assert.equal(risk.dark, false);
  const dark = classCells([six], [], conv).find((cell) => cell.className === 'risk');
  assert.equal(dark.dark, true, '0-of-6 with a 60% ceiling is systematically dark');
  assert.ok(dark.hiPct < 60);
  const refused = classCells([{ id: 'dlg-z', facts: [facts[0]] }], [], conv).find((cell) => cell.className === 'risk');
  assert.equal(refused.refused, true);
  assert.equal(refused.sharePct, null);
  assert.equal(refused.dark, null, 'a refused cell is not a low rate and not a dark verdict');

  // A consultation against a DIFFERENT frontier must not credit this one.
  const foreign = classCells([six], consults.map((c) => ({ ...c, checklistId: 'dlg-OTHER' })), conv).find((cell) => cell.className === 'risk');
  assert.equal(foreign.consultedN, 0, 'class cells are keyed by (frontier, fact), not by fact alone');
});

/* ------------------------------------------------------------- commands */

test('a consultation is a dated first-class act: used, ruled-out with a reason, deferred; duplicates refused', () => {
  const state = tree();
  const { store, api } = harness(state);
  assert.equal(api.setActiveSeat('lead1').ok, true);
  const decision = { id: 'dec-consult', title: 'Consolidate', date: '2026-11-01', outcome: 'pending', chosen: '', options: [], rationale: '' };
  store.update((draft) => { draft.decisions.push(decision); }, { type: 'decision.created', entity: 'decision', entityId: decision.id, summary: 'Consolidate' });
  const frontier = store.state.diligenceChecklists.find((row) => row.decisionId === decision.id);
  assert.ok(frontier);
  const fact = frontier.facts[0];

  assert.equal(api.diligenceConsult({ checklistId: frontier.id, sourceType: fact.sourceType, sourceId: fact.sourceId, disposition: 'ruled-out', reason: '' }).ok, false,
    'a reason-less dismissal is not a judgement');
  const ruled = api.diligenceConsult({ checklistId: frontier.id, sourceType: fact.sourceType, sourceId: fact.sourceId, disposition: 'ruled-out', reason: 'This case concerns a different queue.' });
  assert.equal(ruled.ok, true, ruled.error);
  assert.equal(api.diligenceConsult({ checklistId: frontier.id, sourceType: fact.sourceType, sourceId: fact.sourceId, disposition: 'used' }).ok, false,
    'the same fact cannot be counted twice');
  assert.equal(api.diligenceConsult({ checklistId: frontier.id, sourceType: 'case', sourceId: 'NOT_IN_SET', disposition: 'used' }).ok, false,
    'a fact that was not knowable at decision time cannot be consulted afterwards');

  const second = frontier.facts[1];
  assert.equal(api.diligenceConsult({ checklistId: frontier.id, sourceType: second.sourceType, sourceId: second.sourceId, disposition: 'deferred', reason: 'Parked for next week.' }).ok, true);
  const report = api.diligenceReport();
  const row = report.ledger.find((item) => item.id === frontier.id);
  assert.equal(row.consultedN, 2);
  assert.equal(row.ruledOutN, 1);
  assert.equal(row.deferredN, 1);
  assert.equal(row.unconsultedN, frontier.facts.length - 2);
  assert.ok(store.state.events.some((event) => event.type === DILIGENCE_EVENTS.CONSULTED), 'the append-only action history records the act');
});

test('RULE-DLG-04 grades a PRE-DECLARED process forecast exactly ONCE, out of sample', () => {
  const state = tree();
  const { store, api } = harness(state);
  assert.equal(api.setActiveSeat('lead1').ok, true);
  const decision = { id: 'dec-forecast', title: 'Merge or split', date: '2026-11-01', outcome: 'pending', chosen: 'merge', ownerId: 'lead1', options: [], rationale: '' };
  store.update((draft) => { draft.decisions.push(decision); }, { type: 'decision.created', entity: 'decision', entityId: decision.id, summary: 'Merge or split' });
  const frontier = store.state.diligenceChecklists.find((row) => row.decisionId === decision.id);
  assert.ok(frontier);

  const forecast = api.diligenceForecast({ checklistId: frontier.id, classes: ['risk', 'assumption', 'commitment'], confidencePct: 90 });
  assert.equal(forecast.ok, true, forecast.error);
  assert.equal(api.diligenceForecast({ checklistId: frontier.id, classes: ['risk'], confidencePct: 50 }).ok, false,
    'pre-registration is written once and cannot be edited after the fact');
  assert.equal(store.state.diligenceGrades.length, 0, 'no grade before settlement — that would be hindsight');

  // Consult enough facts, then settle the decision through the real API.
  for (const fact of frontier.facts.slice(0, 4)) {
    api.diligenceConsult({ checklistId: frontier.id, sourceType: fact.sourceType, sourceId: fact.sourceId, disposition: 'used' });
  }
  const reviewed = api.reviewDecision(decision.id, { outcome: 'good', outcomeNotes: 'The queues merged cleanly.' });
  assert.equal(reviewed.ok, true, reviewed.error);
  const graded = store.state.diligenceGrades.filter((grade) => grade.checklistId === frontier.id);
  assert.equal(graded.length, 1, 'the spine graded the forecast on the settlement commit');
  assert.ok(Number.isFinite(graded[0].brier) && Number.isFinite(graded[0].skill));
  assert.equal(graded[0].baseBrier, 0.25, 'strictly-prior maximum-entropy 0.5 base rate');
  const gradeLink = store.state.links.find((link) => link.sourceType === 'diligencegrade' && link.relation === 'grades-diligence' && link.targetId === frontier.id);
  assert.ok(gradeLink, 'the grade is a separate first-class graph node');
  assert.equal(resolveLinkedEntity(store.state, 'diligencegrade', graded[0].id).raw.checklistId, frontier.id);

  // Once only: two more scans never write a second grade.
  api.diligenceScan();
  api.diligenceScan();
  assert.equal(store.state.diligenceGrades.filter((grade) => grade.checklistId === frontier.id).length, 1);
  assert.equal(store.state.diligenceMarkers.filter((marker) => marker.kind === 'grade' && marker.checklistId === frontier.id).length, 1);
  assert.equal(api.diligenceReport().grades.scoredN, 1);
});

test('a forecast declared AFTER settlement is refused: hindsight is never graded as foresight', () => {
  const state = tree();
  const { store, api } = harness(state);
  assert.equal(api.setActiveSeat('lead1').ok, true);
  const decision = { id: 'dec-late', title: 'Settled first', date: '2026-11-01', outcome: 'good', chosen: 'merge', options: [], rationale: '' };
  store.update((draft) => { draft.decisions.push(decision); }, { type: 'decision.created', entity: 'decision', entityId: decision.id, summary: 'Settled first' });
  const frontier = store.state.diligenceChecklists.find((row) => row.decisionId === decision.id);
  assert.equal(frontier.status, 'settled');
  const result = api.diligenceForecast({ checklistId: frontier.id, classes: ['risk'], confidencePct: 80 });
  assert.equal(result.ok, false);
  assert.match(result.error, /memory|hindsight/i);
});

/* ------------------------------------------------------- governed findings */

test('RULE-DLG-02/03 open bounded governed findings, marker-idempotently, and Hindsight excludes them', () => {
  const state = tree();
  const { store, api } = harness(state);
  assert.equal(api.setActiveSeat('lead1').ok, true);
  const decision = { id: 'dec-thin', title: 'Thin call', date: '2026-11-01', outcome: 'bad', chosen: 'split', options: [], rationale: '' };
  // A SETTLEMENT event, not a creation: this is the moment a frozen frontier
  // can legitimately be read for a gap, a dark class or an out-of-sample grade.
  store.update((draft) => { draft.decisions.push(decision); }, { type: 'decision.reviewed', entity: 'decision', entityId: decision.id, summary: 'Thin call reviewed' });
  const frontier = store.state.diligenceChecklists.find((row) => row.decisionId === decision.id);
  assert.ok(frontier);
  const gaps = store.state.decisions.filter((row) => /^Diligence gap:/.test(row.title));
  assert.equal(gaps.length, 1, 'one governed gap decision for a settled frontier below the floor');
  const frontierIds = new Set(store.state.diligenceChecklists.map((row) => row.id));
  assert.ok(store.state.links.some((link) => link.relation === 'tracks-followup' && frontierIds.has(link.targetId)),
    'the gap decision tracks the frozen frontier it was read from');
  const gapMarkers = store.state.diligenceMarkers.filter((marker) => marker.kind === 'gap');
  assert.equal(gapMarkers.length, 1);
  assert.ok(diligenceFindingIds(store.state).has(gaps[0].id));
  const darks = store.state.decisions.filter((row) => /^Dark evidence class:/.test(row.title));
  assert.ok(darks.length >= 1, 'a dark evidence class opened a governed redesign decision');
  assert.ok(darks.length <= EVIDENCE_CLASS_KEYS.length, 'at most one per class');
  assert.ok(diligenceFindingIds(store.state).has(darks[0].id));

  // Behavioural proof, not a source-string check: run the REAL Hindsight Lock
  // on a copy and assert it never locks this module's gap/dark decisions.
  const audit = clone(store.state);
  audit.decisionLocks = [];
  audit.settings = { ...audit.settings, hindsightAutoPropagate: true, hindsightSettledFloor: 2 };
  hindsightRule(audit, {
    event: { type: 'hindsight.scan' }, now: NOW, settings: audit.settings,
    idFactory: (prefix) => `${prefix}-hnd`,
  });
  const lockedIds = new Set((audit.decisionLocks || []).map((lock) => lock.decisionId));
  assert.ok(!lockedIds.has(gaps[0].id), 'the Hindsight Lock refuses to lock a diligence gap finding');
  assert.ok(!lockedIds.has(darks[0].id), 'the Hindsight Lock refuses to lock a diligence dark-class finding');


  // Idempotent: an explicit scan opens NOTHING new. The marker is the guard and
  // it is written in the same transaction as the decision it guards.
  const counts = {
    decisions: store.state.decisions.length,
    markers: store.state.diligenceMarkers.length,
  };
  api.diligenceScan();
  assert.equal(store.state.decisions.length, counts.decisions);
  assert.equal(store.state.diligenceMarkers.length, counts.markers);
  assert.equal(diligenceFindingIds(store.state).size, gapMarkers.length + darks.length);
});

test('the ledger is pausable by convention, but an explicit scan always runs', () => {
  const base = tree();
  base.settings.diligenceAutoPropagate = false;
  const { store, api } = harness(base);
  assert.equal(api.setActiveSeat('lead1').ok, true);
  const decision = { id: 'dec-paused', title: 'Paused', date: '2026-11-01', outcome: 'pending', chosen: '', options: [], rationale: '' };
  store.update((draft) => { draft.decisions.push(decision); }, { type: 'decision.created', entity: 'decision', entityId: decision.id, summary: 'Paused' });
  assert.equal(store.state.diligenceChecklists.length, 0, 'automatic propagation is off');
  const scan = api.diligenceScan();
  assert.equal(scan.ok, true, scan.error);
  assert.equal(store.state.diligenceChecklists.length, 3, 'an explicit scan freezes all three pending frontiers in one bounded pass');
  assert.ok(store.state.diligenceChecklists.some((row) => row.decisionId === 'dec-paused'),
    'the operator asking explicitly always freezes the frontier');
});

/* ------------------------------------------------- rights, scoping, export */

test('conventions are VP+ AND full access; a declared seat is refused on rank or capability', () => {
  const state = tree();
  const { store, api } = harness(state);
  // The undeclared operator view is the only full-access seat, exactly as every
  // other governance convention in this app is gated (ADR-0076).
  const allowed = api.diligenceSetConventions({ diligenceKnowableFloor: 5 });
  assert.equal(allowed.ok, true, allowed.error);
  assert.equal(store.state.settings.diligenceKnowableFloor, 5);
  assert.equal(api.diligenceSetConventions({ diligenceKnowableFloor: 999 }).ok, true);
  assert.equal(store.state.settings.diligenceKnowableFloor, 12, 'clamped at the declared bound');

  assert.equal(api.setActiveSeat('lead1').ok, true);
  const rankRefusal = api.diligenceSetConventions({ diligenceKnowableFloor: 6 });
  assert.equal(rankRefusal.ok, false);
  assert.match(rankRefusal.error, /rank window is 4–5/);

  assert.equal(api.setActiveSeat('vp1').ok, true);
  const capabilityRefusal = api.diligenceSetConventions({ diligenceKnowableFloor: 6 });
  assert.equal(capabilityRefusal.ok, false);
  assert.match(capabilityRefusal.error, /full-access/i);

  // A frontline seat may still RECORD a consultation at its own span.
  assert.equal(api.setActiveSeat('lead1').ok, true);
  const frontier = store.state.diligenceChecklists.find((row) => row.facts && row.facts.length);
  assert.ok(frontier, 'the fixture has a frontier with knowable facts');
  assert.equal(api.diligenceConsult({ checklistId: frontier.id, sourceType: frontier.facts[0].sourceType,
    sourceId: frontier.facts[0].sourceId, disposition: 'used' }).ok, true);
});

test('CSV scope #100 is aggregate-only: BLANK refusals, no ids, no names, no reasons', () => {
  const state = tree();
  const { store, api } = harness(state);
  assert.equal(api.setActiveSeat('lead1').ok, true);
  const decision = { id: 'dec-csv', title: 'A private decision', date: '2026-11-01', outcome: 'pending', chosen: '', options: [], rationale: '' };
  store.update((draft) => { draft.decisions.push(decision); }, { type: 'decision.created', entity: 'decision', entityId: decision.id, summary: 'A private decision' });
  const frontier = store.state.diligenceChecklists.find((row) => row.decisionId === decision.id);
  api.diligenceConsult({ checklistId: frontier.id, sourceType: frontier.facts[0].sourceType, sourceId: frontier.facts[0].sourceId, disposition: 'ruled-out', reason: 'PRIVATE_DECISION_REASON_SENTINEL' });

  const report = api.diligenceReport();
  const rows = diligenceCsvRows(report);
  assert.ok(rows.some((row) => row.row_kind === 'summary'));
  assert.ok(rows.some((row) => row.row_kind === 'class'));
  assert.ok(rows.some((row) => row.row_kind === 'altitude'));
  const text = JSON.stringify(rows);
  for (const token of ['A private decision', 'PRIVATE_DECISION_REASON_SENTINEL', 'Billing backlog', 'LEADSENT', frontier.id, decision.id, frontier.facts[0].sourceId]) {
    assert.ok(!text.includes(token), `the export is identity-free: ${token}`);
  }
  // A refused cell is BLANK, never zero.
  const refusedCells = report.cells.rows.filter((cell) => cell.refused);
  for (const cell of refusedCells) {
    const row = rows.find((r) => r.row_kind === 'class' && r.class_key === cell.className);
    assert.equal(row.coverage_pct, '');
    assert.equal(row.refused, 'yes');
    assert.equal(row.reason_code, 'class_floor');
    assert.notEqual(row.coverage_pct, 0);
  }
  const exported = exportWorkspaceCsv(store.state, 'diligence', { now: NOW });
  assert.equal(exported.ok, true, 'the workspace CSV dispatcher serves scope #100');
  assert.equal(exported.scope, 'diligence');
  assert.ok(exported.rowCount >= 7, 'one summary + five class rows + one altitude row');
  assert.ok(!exported.csv.includes('PRIVATE_DECISION_REASON_SENTINEL'));
  assert.ok(!exported.csv.includes('A private decision'));
  assert.ok(diligenceAttentionCount(store.state, { now: NOW, settings: store.state.settings }) >= 0);
});

/* ------------------------------------------------------------------ view */

test('all six panels render with one h1, real tables and no placeholder copy', () => {
  const state = tree();
  const { api } = harness(state);
  const panels = ['desk', 'frontier', 'cells', 'forecasts', 'findings', 'conventions'];
  for (const panel of panels) {
    const ctx = {
      api,
      query: new URLSearchParams({ panel }),
      navigate: () => {},
      refresh: () => {},
    };
    const view = renderDiligence(ctx);
    assert.ok(view, `${panel} produced a node`);
    const host = document.createElement('div');
    host.appendChild(view);
    assert.equal(host.querySelectorAll('h1').length, 1, `${panel} has exactly one h1`);
    assert.ok(host.textContent.length > 100, `${panel} is not an empty shell`);
    assert.ok(!host.textContent.includes('This screen failed to draw'));
    assert.ok(!host.textContent.includes('undefined%'), `${panel} printed an undefined statistic`);
  }
});
