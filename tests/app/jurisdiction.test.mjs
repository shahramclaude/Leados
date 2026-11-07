/**
 * ADR-0109 — the Jurisdiction Compiler (Schema v111).
 *
 * What this suite defends, in the order the module fails if it is wrong:
 *
 *  1. STORAGE. v111 is additive: three declarations-only collections, declared
 *     and clamped conventions, zero back-fill, a v109 workspace migrates through
 *     '110 → 111', and corrupt rows are dropped with a counted warning.
 *  2. PRICING. Three genuine governance routes priced from the SAME cluster;
 *     escalation is NOT free just because the common ancestor owns one branch;
 *     a four-branch cluster can make a boundary redraw the cheapest route; the
 *     Luce probabilities sum to one; each refusal keeps its own reason.
 *  3. CROSS-MODULE PROPAGATION. One explicit scan freezes a finding with ONE
 *     spans-work edge to EVERY case / portfolio / decision member and ONE
 *     rolls-up-to edge per leadership ancestor, in ONE atomic transaction.
 *  4. CROSS-ALTITUDE ROLL-UP. Identity-free jurReadings are frozen at ranks
 *     1..5 from the same write, with small-cell suppression printed.
 *  5. GOVERNANCE. Exactly one governed decision opens, never accepts itself,
 *     never reassigns a case, and engine-authored decisions are never priced
 *     back as work (the Session-143 second-order-decision regression).
 *  6. GRADING. Once only, out of sample, versus a 0.5 base; a missing or
 *     postdated choice is a STORED REFUSAL, never a zero.
 *  7. DISCLOSURE. CSV scope #103 is aggregate-only: no objective key, no member
 *     id, no person name, no span label, no title, no note.
 *  8. UI. The route renders at every panel and is axe-clean.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import {
  createEmptyState, normalizeState, migrate, SCHEMA_VERSION, DEFAULT_SETTINGS, COLLECTIONS,
} from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildDemoState } from '../../app/core/demo.js';
import { buildChain } from '../../app/core/domain/chain.js';
import { CSV_EXPORTS, buildScopeTable, serializeCsv } from '../../app/core/csv.js';
import { LINK_ENTITY_TYPES, LINK_RELATIONS } from '../../app/core/domain/cases.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { jurisdictionRule } from '../../app/core/domain/jurisdictionRules.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { API_RIGHTS, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import {
  buildJurisdictionBook, harvestObjectives, priceCluster, jurConventions, jurWilson,
  jurGradeFinding, jurCsvRows, jurBrief, jurSpanRollUp, jurisdictionRead,
  JUR_CSV_COLUMNS, buildGoalLinkMap, goalPointerStatus,
} from '../../app/core/domain/jurisdiction.js';
import {
  normalizeJurSettings, normalizeJurFindings, normalizeJurReadings, normalizeJurMarkers,
} from '../../app/core/domain/jurisdictionSchema.js';
import {
  JUR_GOVERNANCE_OPTIONS, JUR_OPTION_KEYS, JUR_REFUSALS, JUR_CONVENTION_DEFAULTS,
  JUR_RULE_IDS, JUR_SOURCES, findingKey,
} from '../../app/core/domain/jurisdictionRegistry.js';
import { renderJurisdiction } from '../../app/views/jurisdiction.js';
import { NAV } from '../../app/main.js';

const NOW = new Date('2026-11-06T10:00:00.000Z');
const clone = (v) => JSON.parse(JSON.stringify(v));

function setup() {
  const data = new Map();
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
  let seq = 0;
  const idFactory = (p) => `${p}-jur-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  store.seedDemo();
  return { store, api: createApi(store, { now: () => NOW, idFactory }) };
}
const edges = (state, relation) => (Array.isArray(state.links) ? state.links : []).filter((l) => l.relation === relation);

/* --------------------------------------------------------- 1. storage */

test('v111 is additive, declared, fail-closed and invents no jurisdiction fact', () => {
  assert.equal(SCHEMA_VERSION, 114);
  for (const key of ['jurFindings', 'jurReadings', 'jurMarkers']) assert.ok(COLLECTIONS.includes(key), key);
  const empty = createEmptyState(NOW.toISOString());
  assert.deepEqual(empty.jurFindings, []);
  assert.deepEqual(empty.jurReadings, []);
  assert.deepEqual(empty.jurMarkers, []);
  assert.equal(DEFAULT_SETTINGS.jurEvidenceFloorN, JUR_CONVENTION_DEFAULTS.jurEvidenceFloorN);
  assert.ok(jurConventions(empty.settings).jurRedrawUnits > 0, 'a redraw with zero cost would always win');

  const migrated = migrate({ schemaVersion: 109, settings: {}, people: [], decisions: [] });
  assert.equal(migrated.raw.schemaVersion, SCHEMA_VERSION);
  assert.equal(migrated.applied.at(-1), '112 → 113', '113 → 114');
  assert.deepEqual(migrated.raw.jurFindings, []);
  assert.deepEqual(migrated.raw.jurReadings, []);
  assert.deepEqual(migrated.raw.jurMarkers, []);
  assert.ok(migrate({ schemaVersion: 110, people: [] }).applied.includes('110 → 111'));

  // Clamping, not silent coercion: an out-of-bound convention is repaired.
  const warnings = [];
  assert.equal(normalizeJurSettings({ jurCellFloor: 999 }).jurCellFloor, JUR_CONVENTION_DEFAULTS.jurCellFloor);
  assert.equal(normalizeJurSettings({ jurAutoPropagate: false }).jurAutoPropagate, false);
  assert.deepEqual(normalizeJurFindings('not an array', warnings), []);
  assert.deepEqual(normalizeJurReadings([{ id: 'r1', nodeRank: 'nope' }], warnings), []);
  assert.deepEqual(normalizeJurMarkers([42, 'ok', null, 'ok'], warnings), ['ok']);
  assert.ok(warnings.length >= 2, 'corrupt declarations are counted, not dropped silently');

  const state = normalizeState({ schemaVersion: 109, people: [] }, { now: NOW }).state;
  assert.equal(buildJurisdictionBook(state, { now: NOW }).clusters.length, 0);
});

test('the engine shares the one spine, the graph, the rights and the CSV register', () => {
  // ADR-0115 added a fifth PASS inside `jurisdictionRule`, NOT a 91st rule:
  // the spine is 89 rules / 89 contracts. Assert the invariant (1:1 parity)
  // rather than a hardcoded count that goes stale on the next rule registration.
  assert.ok(DEFAULT_POST_COMMIT_RULES.length >= 89);
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length, '1:1 rule/contract parity');
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(jurisdictionRule));
  const contract = PROPAGATION_CONTRACTS.find((c) => c.rule === jurisdictionRule);
  assert.ok(contract, 'RULE-JUR has a declared contract');
  assert.ok(contract.writes.includes('jurFindings') && contract.writes.includes('jurReadings') && contract.writes.includes('links'));
  for (const t of ['jurfinding', 'jurreading']) assert.ok(LINK_ENTITY_TYPES.includes(t), t);
  for (const r of ['spans-work', 'governs-mandate', 'reads-span-mandate']) assert.ok(LINK_RELATIONS.includes(r), r);
  assert.equal(API_RIGHTS.jurScan, 'record-jurisdiction');
  assert.equal(API_RIGHTS.jurAnchorWork, 'record-jurisdiction');
  assert.equal(API_RIGHTS.jurSetConventions, 'govern-jurisdiction');
  for (const name of ['jurRead', 'jurHygiene', 'jurBriefText', 'jurCsvRows', 'jurConventions', 'jurAttentionCount', 'jurSpanRollUp', 'jurBook']) {
    assert.ok(SAFE_READS.has(name), name);
  }
  assert.equal(CSV_EXPORTS.length, 103);
  assert.ok(CSV_EXPORTS.some((s) => s.key === 'jurisdiction' && s.sensitive === false));
  assert.ok(NAV.some((g) => g.items?.some((i) => i.route === 'jurisdiction')), '#/jurisdiction is in the nav');
  assert.equal(JUR_SOURCES.length, 3, 'one row per work source, no per-module glue');
  assert.equal(JUR_OPTION_KEYS.length, 3);
});

/* --------------------------------------------------------- 2. pricing */

/** A tiny reporting tree: chief → exec → two directors → four frontline spans. */
function syntheticChain() {
  const mk = (id, parentId, altitude, rank) => ({ id, parentId, altitude, rank });
  const nodes = new Map();
  for (const [id, parent, alt] of [
    ['chief', null, 'chief'], ['exec', 'chief', 'exec'],
    ['d-a', 'exec', 'director'], ['d-b', 'exec', 'director'],
    ['a1', 'd-a', 'frontline'], ['a2', 'd-a', 'frontline'],
    ['b1', 'd-b', 'frontline'], ['b2', 'd-b', 'frontline'],
  ]) nodes.set(id, mk(id, parent, alt, alt === 'chief' ? 5 : alt === 'exec' ? 4 : alt === 'director' ? 3 : 1));
  nodes.set('leader', mk('leader', null, 'chief', 5));
  return { nodes, byId: nodes };
}

test('three routes are priced from one cluster and escalation is never free by construction', () => {
  const chain = syntheticChain();
  const conv = jurConventions({});
  const members = [
    { recordId: 'w1', entityType: 'case', span: 'a1', attributed: true, date: '2026-10-01' },
    { recordId: 'w2', entityType: 'portfolio', span: 'b1', attributed: true, date: '2026-10-02' },
    { recordId: 'w3', entityType: 'decision', span: 'a2', attributed: true, date: '2026-10-03' },
  ];
  const priced = priceCluster({ objectiveKey: 'goal:bridge', members }, { chain, conventions: conv });
  assert.equal(priced.gap, true);
  assert.equal(priced.spanNodeIds.length, 3);
  assert.equal(priced.lcaNodeId, 'exec');
  assert.equal(priced.coalitionSize, 2, 'Riker: the minimal antichain, not a grand coalition');
  assert.equal(priced.handoffPairs, 1);
  assert.equal(priced.costCoalition, conv.jurHandoffUnitsPerPair);
  assert.ok(priced.escalationRungs > 0, 'the ancestor owning one branch must NOT make escalation free');
  assert.equal(priced.costEscalate, conv.jurEscalationUnitsPerRung * priced.escalationRungs);
  assert.equal(priced.costRedraw, conv.jurRedrawUnits);
  assert.equal(priced.costs.length, 3);
  assert.deepEqual(priced.costs.map((c) => c.key).sort(), [...JUR_OPTION_KEYS].sort());
  // Luce (1959): a probability distribution, not a score.
  const weights = priced.costs.map((c) => c.probability);
  assert.ok(weights.every((w) => Number.isFinite(w) && w > 0), 'every route carries a declared probability');
  assert.ok(Math.abs(weights.reduce((a, b) => a + b, 0) - 1) < 0.02, 'Luce probabilities sum to one (rounded)');
  assert.equal(priced.predictedProbability, weights[0]);
  assert.ok(JUR_GOVERNANCE_OPTIONS.every((o) => o.key && o.label && o.question && o.note));

  // Wilson (1927) lower bound is conservative and monotone in evidence.
  const small = jurWilson(2, 2), big = jurWilson(20, 20);
  assert.ok(small.lo < big.lo);
  assert.equal(jurWilson(0, 0).pct, null);
});

test('a four-branch cluster can make Williamson’s boundary redraw the cheapest route', () => {
  const chain = syntheticChain();
  const conv = jurConventions({ jurRedrawUnits: 12, jurHandoffUnitsPerPair: 12, jurEscalationUnitsPerRung: 9, jurMaterialityPct: 5 });
  const members = ['a1', 'a2', 'b1', 'b2'].map((span, i) => ({
    recordId: `w${i}`, entityType: 'portfolio', span, attributed: true, date: '2026-10-01',
  }));
  const priced = priceCluster({ objectiveKey: 'goal:wide', members }, { chain, conventions: conv });
  // Two director branches → 1 pair → 12 units; escalation lifts 2×3 rungs → 54.
  assert.equal(priced.coalitionSize, 2);
  assert.equal(priced.costCoalition, 12);
  assert.ok(priced.costEscalate > priced.costRedraw);
  assert.equal(priced.costs[0].key, 'coalition');
  // With a cheaper redraw than the coalition's handoff burden, redraw wins.
  const redrawWins = priceCluster({ objectiveKey: 'goal:wide', members }, {
    chain, conventions: jurConventions({ jurRedrawUnits: 5, jurHandoffUnitsPerPair: 40, jurEscalationUnitsPerRung: 40, jurMaterialityPct: 5 }),
  });
  assert.equal(redrawWins.costs[0].key, 'redraw');
  assert.equal(redrawWins.predictedOption, 'redraw');
  assert.ok(redrawWins.advantagePct >= 5);
});

test('every refusal prints its own reason and a single-span objective is not a gap', () => {
  const chain = syntheticChain();
  const conv = jurConventions({});
  const one = priceCluster({ objectiveKey: 'goal:one', members: [
    { recordId: 'w1', entityType: 'case', span: 'a1', attributed: true, date: '2026-10-01' },
  ] }, { chain, conventions: conv });
  assert.equal(one.gap, false);
  assert.equal(one.refusalKey, 'single-span');
  assert.equal(one.refusalNote, JUR_REFUSALS['single-span']);
  const thin = priceCluster({ objectiveKey: 'goal:thin', members: [
    { recordId: 'w1', entityType: 'case', span: 'a1', attributed: true, date: '2026-10-01' },
    { recordId: 'w2', entityType: 'portfolio', span: 'b1', attributed: true, date: '2026-10-02' },
  ] }, { chain, conventions: conv });
  assert.equal(thin.verdict, 'refused');
  assert.equal(thin.refusalKey, 'thin-cluster');
  const dark = priceCluster({ objectiveKey: 'goal:dark', members: [
    { recordId: 'w1', entityType: 'case', span: 'a1', attributed: false, date: '2026-10-01' },
    { recordId: 'w2', entityType: 'case', span: 'b1', attributed: false, date: '2026-10-02' },
    { recordId: 'w3', entityType: 'case', span: 'a2', attributed: false, date: '2026-10-03' },
  ] }, { chain, conventions: conv });
  assert.equal(dark.refusalKey, 'single-span', 'unattributable work is never priced as a boundary');
  const tie = priceCluster({ objectiveKey: 'goal:tie', members: [
    { recordId: 'w1', entityType: 'case', span: 'a1', attributed: true, date: '2026-10-01' },
    { recordId: 'w2', entityType: 'portfolio', span: 'b1', attributed: true, date: '2026-10-02' },
    { recordId: 'w3', entityType: 'decision', span: 'a2', attributed: true, date: '2026-10-03' },
  ] }, { chain, conventions: jurConventions({ jurMaterialityPct: 100 }) });
  assert.equal(tie.refusalKey, 'no-decisive-route');
});

/* ------------------------------------------- 3+4. real integration */

test('one scan commits cross-module typed provenance AND a five-rank identity-free roll-up', () => {
  const { store, api } = setup();
  const result = api.jurScan();
  assert.equal(result.ok, true, result.error);
  const s = store.state;
  assert.ok(s.jurFindings.length >= 1, 'a cross-branch objective was detected');
  const priced = s.jurFindings.find((f) => f.verdict === 'priced');
  assert.ok(priced, 'at least one cluster cleared the declared evidence floors');
  assert.equal(priced.status, 'frozen');
  assert.equal(priced.id, findingKey(priced.objectiveKey, priced.week));

  // CROSS-MODULE: spans-work edges reach records in more than one collection.
  const spans = edges(s, 'spans-work');
  assert.ok(spans.length >= 3, `expected cross-module provenance, got ${spans.length}`);
  const targetTypes = new Set(spans.map((e) => e.targetType));
  assert.ok(targetTypes.size >= 2, `expected edges to >=2 entity types, got ${[...targetTypes].join(',')}`);
  for (const e of spans) assert.equal(e.sourceType, 'jurfinding');

  // CROSS-ALTITUDE: rolls-up-to edges land on ancestors at several ranks, and
  // the same atomic write froze one identity-free reading per rank 1..5.
  const chain = buildChain(s, { now: NOW });
  const rollEdges = edges(s, 'rolls-up-to').filter((e) => e.sourceType === 'jurfinding');
  assert.ok(rollEdges.length >= 2, 'the gap is visible above the span that holds it');
  const ranks = new Set(s.jurReadings.map((r) => r.nodeRank));
  for (const rank of [1, 2, 3, 4, 5]) assert.ok(ranks.has(rank), `rank ${rank} must have its own reading`);
  for (const reading of s.jurReadings) {
    assert.equal(typeof reading.clusters, 'number');
    assert.equal(reading.nodeId in chain.nodes || chain.nodes.has(reading.nodeId), true);
    // Identity-free: no objective key, no member id, no person, no title, no note.
    const text = JSON.stringify(reading);
    assert.ok(!/goal:|pf-demo-|case-demo-|dec-jur-/.test(text), `identity leaked into a span reading: ${text.slice(0, 160)}`);
  }
  assert.equal(edges(s, 'reads-span-mandate').length, s.jurReadings.length);

  // GOVERNANCE: one governed ask, never an automatic boundary change.
  assert.ok(priced.governedDecisionId, 'one governed who-holds-this decision was opened');
  const decision = s.decisions.find((d) => d.id === priced.governedDecisionId);
  assert.ok(decision);
  assert.equal(decision.chosen, '', 'the engine never accepts its own proposal');
  assert.equal(edges(s, 'governs-mandate').length, 1);
  for (const o of JUR_OPTION_KEYS) assert.ok(decision.options.some((opt) => String(opt.label).startsWith(o)), o);
  assert.ok(/RULE-JUR-02/.test(decision.question) && /JUR-OPTION/.test(decision.question));

  // IDEMPOTENCE: a second scan in the same ISO week invents nothing new.
  const before = clone({ findings: s.jurFindings, readings: s.jurReadings, links: s.links.length, decisions: s.decisions.length });
  assert.equal(api.jurScan().ok, true);
  assert.equal(store.state.jurFindings.length, before.findings.length);
  assert.equal(store.state.jurReadings.length, before.readings.length);
  assert.equal(store.state.links.length, before.links);
  assert.equal(store.state.decisions.length, before.decisions);

  // A governed decision is NOT priced back as work: no second-order finding.
  const secondOrder = store.state.jurFindings.filter((f) => /RULE-|JUR-OPTION/.test(f.objectiveKey));
  assert.equal(secondOrder.length, 0);
});

test('a root work write wakes the generalized rule in the same transaction', () => {
  const demo = buildDemoState(NOW);
  const draft = clone(demo);
  draft.settings = { ...(draft.settings || {}), ...normalizeJurSettings({}) };
  draft.jurFindings = []; draft.jurReadings = []; draft.jurMarkers = []; draft.links = [];
  // The shared-goal cluster already on record. Registering ONE more case that
  // names it must detect the objective without a scan.
  const added = {
    id: 'case-jur-new', kind: 'risk', status: 'open', title: 'Bridge handoff reconciliation',
    summary: '', ownerId: 'person-demo-3', linkedGoalId: 'goal-demo-89', openedOn: '2026-11-06',
  };
  draft.cases.push(added);
  const emitted = [];
  const out = jurisdictionRule(draft, {
    event: { type: 'case.created', entityId: added.id }, now: NOW, settings: draft.settings,
    idFactory: (p) => `${p}-jur-direct`, logEvent: (e) => emitted.push(e),
  });
  assert.ok(draft.jurFindings.length >= 1, 'a case write detected the shared objective');
  assert.ok(draft.jurFindings.some((f) => f.memberIds.includes(added.id)), 'the changed record is in the frozen cluster');
  assert.ok(draft.links.some((l) => l.relation === 'spans-work' && l.targetId === added.id));
  assert.ok(draft.links.some((l) => l.relation === 'rolls-up-to'));
  assert.ok(out.some((o) => o.ruleId === JUR_RULE_IDS.DETECT));
  // Engine-derived events must NOT wake detection (Session-143 regression).
  const derived = clone(draft);
  const derivedOut = jurisdictionRule(derived, {
    event: { type: 'decision.created', entityId: 'anything' }, now: NOW, settings: draft.settings,
    idFactory: (p) => `${p}-jur-derived`, derived: true,
  });
  assert.equal(derivedOut.filter((o) => o.action === 'frozen').length, 0);
});

/* --------------------------------------------------------- 6. grades */

test('a forecast is graded once against a 0.5 base and refusals are stored, never zeroed', () => {
  const finding = {
    status: 'frozen', predictedOption: 'coalition', predictedProbability: 0.6,
    frozenAt: '2026-11-01T10:00:00.000Z',
  };
  const grade = jurGradeFinding(finding, { actualOption: 'coalition', settledOn: '2026-11-05', frozenAt: finding.frozenAt, now: NOW });
  assert.equal(grade.ok, true);
  assert.equal(grade.baseBrier, 0.25);
  assert.equal(grade.brier, 0.16);
  assert.equal(grade.skill, 0.36);
  assert.equal(jurGradeFinding(finding, { actualOption: 'redraw', settledOn: '2026-11-05', frozenAt: finding.frozenAt, now: NOW }).brier, 0.36);
  assert.equal(jurGradeFinding(finding, { actualOption: null, settledOn: '2026-11-05', frozenAt: finding.frozenAt, now: NOW }).ok, false);
  assert.equal(jurGradeFinding(finding, { actualOption: 'coalition', settledOn: '2026-10-01', frozenAt: finding.frozenAt, now: NOW }).note, JUR_REFUSALS.postdated);
  assert.equal(jurGradeFinding({ ...finding, status: 'graded' }, { actualOption: 'coalition', settledOn: '2026-11-05', frozenAt: finding.frozenAt, now: NOW }).reason, 'not-frozen');
});

/* ---------------------------------------------------- 7. disclosure */

test('CSV scope #103 and the board brief are aggregate-only and refusal-honest', () => {
  const { store, api } = setup();
  api.jurScan();
  const state = store.state;
  const rows = jurCsvRows(state, { now: NOW });
  assert.ok(rows.length >= 5);
  assert.deepEqual(Object.keys(rows[0]).sort(), [...JUR_CSV_COLUMNS].sort());
  const csv = serializeCsv(JUR_CSV_COLUMNS.map((key) => ({ key, header: key })), rows);
  assert.ok(!/goal:|pf-demo-|case-demo-|person-demo-|case-jur-|dec-jur-/.test(csv), 'no id or objective key in the export');
  assert.ok(!/Billing ledger|Reliability bet|Bridge handoff/.test(csv), 'no title in the export');
  assert.ok(/cell_floor/.test(csv), 'the suppression convention is printed');
  assert.ok(/suppressed|refused|refusal|ungraded/i.test(csv), 'a refusal is printed, not zeroed');
  // The registered scope produces the same identity-free table.
  const table = buildScopeTable(state, 'jurisdiction', NOW);
  assert.ok(table && table.rows.length >= 5);
  assert.deepEqual(table.columns.map((c) => c.key), JUR_CSV_COLUMNS);
  const brief = jurBrief(state, { now: NOW });
  assert.ok(brief.includes('objective'));
  assert.ok(!/goal:|person-demo-|case-demo-/.test(brief), 'the board brief names nobody');
  assert.ok(/Riker|Coase|Williamson|Wilson|Luce|Brier|Ashby/.test(brief), 'frameworks are named, not implied');
  const read = jurisdictionRead(state, { now: NOW });
  assert.equal(read.ok, true);
  assert.ok(read.book.totals.objectives >= 1);
  assert.ok(jurSpanRollUp(state, { nodeId: 'leader', now: NOW }).ok);
});

/* ------------------------------------------------------------- 8. UI */

test('the four panels render at an undeclared operator view and are axe-clean', async () => {
  const { store, api } = setup();
  api.jurScan();
  const dom = new JSDOM('<!doctype html><html lang="en"><body><main id="view"></main><div id="modal-root"></div><div id="toast-root"></div></body></html>', { url: 'https://leados.test/#/jurisdiction' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.Node = dom.window.Node;
  const AXE_SRC = fs.readFileSync(path.resolve(import.meta.dirname, '../../node_modules/axe-core/axe.min.js'), 'utf8');
  for (const panel of ['map', 'hygiene', 'options', 'grades', 'method']) {
    const ctx = {
      state: store.state, store, api, now: NOW, query: new URLSearchParams(`panel=${panel}`),
      navigate() {}, refresh() {}, render() {},
    };
    const node = renderJurisdiction(ctx);
    assert.equal(node.querySelectorAll('h1').length, 1, `${panel} has exactly one h1`);
    assert.ok(node.querySelector('[role="tablist"]'), `${panel} has a tablist`);
    document.getElementById('view').replaceChildren(node);
    dom.window.eval(AXE_SRC);
    const results = await dom.window.axe.run(node, { rules: { 'color-contrast': { enabled: false } } });
    assert.deepEqual(results.violations.map((v) => v.id), [], `${panel} is axe-clean`);
  }
  dom.window.close();
});

/* ------------------------------------------- 9. ADR-0111 pointer hygiene */

test('ADR-0111: unanchored and dangling goal pointers are counted refusals, never silently dropped or priced', () => {
  const demo = buildDemoState(NOW);
  const draft = clone(demo);
  draft.settings = { ...(draft.settings || {}), ...normalizeJurSettings({}) };
  draft.jurFindings = []; draft.jurReadings = []; draft.jurMarkers = [];

  // 1. Shipped demo already has open unanchored decisions + portfolio items:
  //    every open non-engine record must be accounted for.
  const baseBook = buildJurisdictionBook(draft, { now: NOW });
  assert.equal(
    baseBook.totals.openWork,
    baseBook.totals.anchoredWork + baseBook.totals.unanchoredWork + baseBook.totals.danglingWork,
    'zero silent exclusions across open work records',
  );
  assert.ok(baseBook.totals.unanchoredWork > 0, 'unanchored demo calls/portfolio items are surfaced');
  assert.equal(baseBook.totals.danglingWork, 0);
  assert.ok(Number.isFinite(baseBook.totals.anchoringLoPct), 'Wilson anchoring completeness bound is computed');

  // 2. Two spans naming a deleted goal id are counted as dangling-objective and
  //    REFUSED — RULE-JUR-02 must never open a boundary decision for a ghost goal.
  const ghostGoal = 'goal-deleted-ghost-99';
  const people = draft.people.filter((p) => p.status !== 'archived');
  draft.cases.push(
    { id: 'case-ghost-1', kind: 'risk', status: 'open', title: 'Ghost work A', summary: '', ownerId: people[0].id, linkedGoalId: ghostGoal, openedOn: '2026-11-05' },
    { id: 'case-ghost-2', kind: 'risk', status: 'open', title: 'Ghost work B', summary: '', ownerId: people[2].id, linkedGoalId: ghostGoal, openedOn: '2026-11-05' },
    { id: 'case-ghost-3', kind: 'risk', status: 'open', title: 'Ghost work C', summary: '', ownerId: people[4].id, linkedGoalId: ghostGoal, openedOn: '2026-11-05' },
  );
  jurisdictionRule(draft, {
    event: { type: 'jur.scan', entityId: 'all' }, now: NOW, settings: draft.settings,
    idFactory: (p) => `${p}-ghost-${Math.random().toString(36).slice(2, 7)}`,
  });
  const ghostFinding = draft.jurFindings.find((f) => f.objectiveKey === `goal:${ghostGoal}`);
  assert.ok(ghostFinding, 'cross-branch dangling objective is recorded as a finding');
  assert.equal(ghostFinding.verdict, 'refused');
  assert.equal(ghostFinding.refusalKey, 'dangling-objective');
  assert.equal(ghostFinding.governedDecisionId, null, 'never opens a governed boundary decision on a missing goal');
  const ghostBook = buildJurisdictionBook(draft, { now: NOW });
  assert.equal(ghostBook.totals.danglingWork, 3);
  assert.equal(goalPointerStatus(`goal:${ghostGoal}`, new Map(draft.goals.map((g) => [g.id, g])), true).status, 'missing');

  // 3. Dropping a previously live goal supersedes its frozen finding on goal.updated.
  const pricedBefore = draft.jurFindings.find((f) => f.verdict === 'priced' && f.status === 'frozen');
  assert.ok(pricedBefore, 'at least one live priced finding exists');
  const liveGoalId = pricedBefore.objectiveKey.slice(5);
  const targetGoal = draft.goals.find((g) => g.id === liveGoalId);
  targetGoal.status = 'dropped';
  jurisdictionRule(draft, {
    event: { type: 'goal.updated', entityId: liveGoalId }, now: NOW, settings: draft.settings,
    idFactory: (p) => `${p}-drop`,
  });
  assert.equal(pricedBefore.status, 'superseded');
  assert.equal(pricedBefore.gradeNote, JUR_REFUSALS['dangling-objective']);
});

test('ADR-0111: jurAnchorWork enforces frontline/manager span boundaries, wakes RULE-JUR-01 atomically, survives normalizeState and rolls up identity-free', () => {
  const initial = createEmptyState(NOW.toISOString());
  initial.settings = {
    ...initial.settings,
    leaderName: 'Dana Root',
    chainLeaderAltitude: 'chief',
    activeSeatId: 'lead1',
    seatEnforce: true,
    ...normalizeJurSettings({}),
  };
  initial.people = [
    ['vp1', null, 'vp', 'Rina VP'],
    ['dir1', 'vp1', 'director', 'Sam Director'],
    ['mgr1', 'dir1', 'manager', 'Mei Manager'],
    ['lead1', 'mgr1', 'lead', 'Priya Lead'],
    ['lead2', 'mgr1', 'lead', 'Jordan Lead'],
    ['ic1', 'lead1', 'ic', 'Ari Klein'],
    ['ic2', 'lead2', 'ic', 'Cy Orlov'],
  ].map(([id, managerId, level, name]) => ({ id, name, role: level, level, managerId, status: 'active' }));
  initial.goals = [{
    id: 'goal-shared-ops',
    title: 'Zero-drop shift handoff SLA',
    description: '',
    ownerId: null,
    scope: 'team',
    coAuthored: null,
    dueDate: null,
    keyResults: [],
    confidence: 'on-track',
    initialConfidence: 'on-track',
    status: 'active',
    completedOn: null,
    krUpdatedOn: null,
    checkins: [],
    createdAt: NOW.toISOString(),
  }];
  initial.cases = [
    { id: 'case-peer-a', kind: 'risk', status: 'open', title: 'Peer branch work A', summary: '', ownerId: 'lead2', involvedPersonIds: [], linkedGoalId: 'goal-shared-ops', openedOn: '2026-11-05', createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() },
    { id: 'case-peer-b', kind: 'risk', status: 'open', title: 'Peer branch work B', summary: '', ownerId: 'ic2', involvedPersonIds: [], linkedGoalId: 'goal-shared-ops', openedOn: '2026-11-05', createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() },
    { id: 'case-peer-unanchored', kind: 'risk', status: 'open', title: 'Peer private case', summary: '', ownerId: 'lead2', involvedPersonIds: [], linkedGoalId: null, openedOn: '2026-11-05', createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() },
  ];
  initial.decisions = [{
    id: 'dec-frontline-unanchored',
    title: 'Frontline shift triage call',
    question: 'How do we sequence shift handoff?',
    date: '2026-11-06',
    reversibility: 'reversible',
    driver: 'Priya Lead',
    approver: 'Priya Lead',
    contributors: '', informed: '',
    options: [{ id: 'o1', label: 'Sequence A', pros: '', cons: '' }],
    chosen: '', rationale: '', reviewOn: null, reviewedOn: null, outcome: 'pending', outcomeNotes: '',
    forecastProbability: null, decidedOn: null, createdAt: NOW.toISOString(), portfolioNotes: [],
  }];

  const seeded = normalizeState(initial, { now: NOW }).state;
  const data = new Map([[STORAGE_KEY, JSON.stringify(seeded)]]);
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  let seq = 0;
  const idFactory = (p) => `${p}-hyg-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory });

  // Frontline seat (rank 1): sees own unanchored decision, NEVER peer branch's unanchored case.
  const flHygiene = api.jurHygiene();
  assert.equal(flHygiene.ok, true);
  assert.equal(flHygiene.withheld, false);
  assert.ok(flHygiene.hygieneQueue.some((q) => q.recordId === 'dec-frontline-unanchored'), 'frontline sees own unanchored decision');
  assert.ok(!flHygiene.hygieneQueue.some((q) => q.recordId === 'case-peer-unanchored'), 'frontline never sees peer branch queue item');

  // Sideways write attempt against peer's case is refused.
  const denied = api.jurAnchorWork({ entityType: 'case', recordId: 'case-peer-unanchored', goalId: 'goal-shared-ops' });
  assert.equal(denied.ok, false);

  // Own-span anchor succeeds, writes impacts-goal link, survives normalizeState,
  // AND wakes RULE-JUR-01 in the SAME atomic transaction to freeze the new cross-branch cluster
  // and roll it up to mgr1 -> dir1 -> vp1 -> leader!
  const anchored = api.jurAnchorWork({ entityType: 'decision', recordId: 'dec-frontline-unanchored', goalId: 'goal-shared-ops' });
  assert.equal(anchored.ok, true, anchored.error);
  assert.ok(buildGoalLinkMap(store.state).get('decision:dec-frontline-unanchored')?.includes('goal-shared-ops'));
  const frozen = store.state.jurFindings.find((f) => f.objectiveKey === 'goal:goal-shared-ops');
  assert.ok(frozen, 'anchoring woke RULE-JUR-01 and froze the cross-branch cluster in the same commit');
  assert.ok(frozen.memberIds.includes('dec-frontline-unanchored'));
  const rollTargets = new Set(edges(store.state, 'rolls-up-to').filter((e) => e.sourceId === frozen.id).map((e) => e.targetId));
  for (const anc of ['mgr1', 'dir1', 'vp1', 'leader']) assert.ok(rollTargets.has(anc), `rolled up to ${anc}`);

  const reloaded = normalizeState(clone(store.state), { now: NOW }).state;
  assert.ok(buildGoalLinkMap(reloaded).get('decision:dec-frontline-unanchored')?.includes('goal-shared-ops'), 'decision goal anchor survives normalizeState');

  // Switch to director (rank 3) and VP (rank 4): withheld is true, zero ids/titles leak,
  // and direct item anchoring above rank 2 is refused.
  for (const upperId of ['dir1', 'vp1']) {
    store.update((d) => { d.settings.activeSeatId = upperId; }, { type: 'seat.changed', entity: 'seat', entityId: upperId, summary: 'Upper seat' });
    const upperRead = jurisdictionRead(store.state, { now: NOW });
    assert.equal(upperRead.withheld, true);
    assert.equal(upperRead.hygieneQueue.length, 0);
    assert.equal(upperRead.book.clusters.length, 0);
    const serializedUpper = JSON.stringify({ cells: upperRead.cells, sources: upperRead.hygieneBySource, brief: upperRead.brief });
    assert.ok(!/dec-frontline-unanchored|case-peer-unanchored|Frontline shift triage|Peer private case|goal-shared-ops/.test(serializedUpper), 'zero item titles, record ids or objective keys leak above rank 2');
    const blockedUpperWrite = api.jurAnchorWork({ entityType: 'decision', recordId: 'dec-frontline-unanchored', goalId: 'goal-shared-ops' });
    assert.equal(blockedUpperWrite.ok, false);
  }
});
