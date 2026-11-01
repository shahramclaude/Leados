/**
 * Consequence Lab: a real two-hop operational graph, conditional KM area,
 * prospective grading and a same-transaction decision/task/link cascade.
 * Tests defend the critical distinction: an association is never a cause and
 * an endpoint probability is a LOWER bound on priced outstanding time.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { SCHEMA_VERSION, MIGRATIONS, createEmptyState, normalizeSettings, normalizeState, migrate } from '../../app/core/schema.js';
import { buildDemoState } from '../../app/core/demo.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildInsights, DOMAIN_ORDER } from '../../app/core/domain/insights.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { kaplanMeier } from '../../app/core/domain/survival.js';
import { decisionValueTerms, decisionTempoRule } from '../../app/core/domain/decisionTempo.js';
import { decisionBlastRadius, integrateConditionalSurvival, consequenceForDecision,
  consequenceReport, buildConsequenceReading, gradeConsequenceReading,
  consequenceCalibration, consequenceBrief, consequenceSignals, consequenceAttentionCount } from '../../app/core/domain/consequence.js';
import { consequenceRule, CONSEQUENCE_RULE_IDS, CONSEQUENCE_EVENTS } from '../../app/core/domain/consequenceRules.js';
import { normalizeConsequenceReadings, normalizeConsequenceMarkers } from '../../app/core/domain/consequenceSchema.js';
import { LINK_ENTITY_TYPES, LINK_ENTITY_COLLECTIONS, LINK_RELATIONS, SYSTEM_GENERATED_LINK_RELATIONS,
  resolveLinkedEntity, linksForEntity } from '../../app/core/domain/cases.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { renderConsequences } from '../../app/views/consequences.js';
import { renderDecisions } from '../../app/views/decisions.js';
import { parseRoute } from '../../app/main.js';

const NOW = new Date('2026-10-31T10:00:00.000Z');
const NOW_ISO = NOW.toISOString();
const ROOT = path.resolve(import.meta.dirname, '../..');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

function decision(id, { title = id, date = '2026-10-31', decidedOn = null } = {}) {
  return { id, title, date, chosen: decidedOn ? 'Option A' : '', decidedOn,
    driver: 'Rae Mensah', approver: 'Rae Mensah', reversibility: 'reversible',
    options: [{ id: `opt-${id}`, label: 'Option A', pros: 'Known upside', cons: 'Known cost' }],
    createdAt: `${date}T09:00:00.000Z` };
}
function edge(fromType, from, toType, to, relation, n = 1) {
  return { id: `l-${n}-${from}-${to}`, sourceType: fromType, sourceId: from,
    targetType: toType, targetId: to, relation, ruleId: 'TEST', summary: '', createdOn: '2026-10-30', createdAt: NOW_ISO };
}
function fixture() {
  const s = createEmptyState(NOW_ISO);
  s.settings.leaderName = 'Rae Mensah';
  s.people = [
    { id: 'p-leader', name: 'Rae Mensah', status: 'active', role: 'Manager', startDate: '2024-01-01' },
    { id: 'p-report', name: 'Never copy me to the frozen ledger', status: 'active', role: 'Engineer', managerId: 'p-leader', startDate: '2024-01-01' },
  ];
  s.decisions = [
    decision('d-root', { title: 'Recovery pathway: choose supplier' }),
    decision('d-coupled', { title: 'Release timing: agree a path' }),
    decision('d7a', { date: '2026-09-01', decidedOn: '2026-09-08' }),
    decision('d7b', { date: '2026-09-02', decidedOn: '2026-09-09' }),
    decision('d14', { date: '2026-09-01', decidedOn: '2026-09-15' }),
    decision('d21', { date: '2026-09-01', decidedOn: '2026-09-22' }),
    decision('d28', { date: '2026-09-01', decidedOn: '2026-09-29' }),
  ];
  s.cases = [{ id: 'case-1', title: 'Shipment delay', kind: 'risk', status: 'open', openedOn: '2026-10-21', ownerId: 'p-leader' }];
  s.budgets = [{ id: 'budget-1', name: 'Delivery envelope', currency: 'USD', ceiling: 200000,
    lines: [{ id: 'line-1', title: 'Vendor programme', status: 'committed', committedAmount: 120000, actualAmount: 0,
      sourceType: 'decision', sourceId: 'd-root' }] }];
  s.premises = [{ id: 'premise-1', title: 'Supplier can catch up', statement: 'A dated hypothesis',
    decisionId: 'd-root', ownerId: 'p-leader', priorPct: 50, watchPct: 40, breachPct: 25, createdAt: '2026-10-01T10:00:00.000Z',
    observations: [{ id: 'obs-1', key: 'obs-1', direction: 'against', likelihoodRatio: 20,
      observedOn: '2026-10-30', createdAt: '2026-10-30T10:00:00.000Z' }] }];
  s.dependencies = [{ id: 'dep-1', name: 'Packing line', kind: 'process', status: 'active', criticality: 'critical',
    ttsDays: 2, ttrDays: 6 }];
  s.waitPrices = [{ id: 'price-1', classKey: 'case', weeklyAmount: 200, currency: 'EUR',
    declaredOn: '2026-10-30', createdAt: NOW_ISO }];
  s.links = [
    edge('decision', 'd-root', 'budget', 'budget-1', 'funds', 1),
    edge('decision', 'd-root', 'case', 'case-1', 'decides', 2),
    edge('case', 'case-1', 'decision', 'd-coupled', 'decides', 3),
    edge('decision', 'd-root', 'premise', 'premise-1', 'depends-on', 4),
    edge('decision', 'd-root', 'dependency', 'dep-1', 'depends-on', 5),
    edge('decision', 'd-root', 'person', 'p-report', 'involves', 6),
    edge('person', 'p-report', 'decision', 'd-coupled', 'involves', 7),
  ];
  const result = normalizeState(s, { now: NOW });
  return result.state;
}
function storage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) || null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
}
function harness(initial = fixture(), now = () => NOW) {
  let seq = 0;
  const mem = storage();
  const store = createStore({ storage: mem, now, idFactory: (p) => `${p}-s-${++seq}` });
  store.load();
  const api = createApi(store, { now, idFactory: (p) => `${p}-a-${++seq}` });
  assert.equal(store.importJSON(JSON.stringify(initial), { now: now() }).ok, true);
  return { store, api, mem };
}

/* ------------------------------------------------------------- migration */

describe('schema v67 and fail-closed persistence', () => {
  test('the 66→67 migration adds empty ledgers, never a retrospective forecast', () => {
    assert.equal(SCHEMA_VERSION, 78);
    assert.equal(typeof MIGRATIONS[66], 'function');
    const raw = migrate({ schemaVersion: 66, settings: {}, decisions: [decision('old')] });
    assert.deepEqual(raw.applied, ['66 → 67', '67 → 68', '68 → 69', '69 → 70', '70 → 71', '71 → 72', '72 → 73', '73 → 74', '74 → 75', '75 → 76', '76 → 77', '77 → 78']);
    assert.equal(raw.raw.schemaVersion, 78);
    assert.deepEqual(raw.raw.consequenceReadings, []);
    assert.deepEqual(raw.raw.consequenceMarkers, []);
    const state = normalizeState(raw.raw, { now: NOW }).state;
    assert.deepEqual(state.consequenceReadings, []);
    assert.deepEqual(state.consequenceMarkers, []);
  });
  test('settings clamp and the pause switch cannot be flipped by a typo', () => {
    const s = normalizeSettings({ consequenceTriageWeekly: -10, consequenceMinExits: 0,
      consequenceMaxLinks: 999, consequenceReviewCap: 999, consequenceAutoPropagate: 'false' });
    assert.equal(s.consequenceTriageWeekly, 0);
    assert.equal(s.consequenceMinExits, 2);
    assert.equal(s.consequenceMaxLinks, 24);
    assert.equal(s.consequenceReviewCap, 60);
    assert.equal(s.consequenceAutoPropagate, true);
    assert.equal(normalizeSettings({ consequenceAutoPropagate: false }).consequenceAutoPropagate, false);
  });
  test('a bad price is cleared instead of becoming zero; a bad forecast is dropped', () => {
    const valid = buildConsequenceReading(consequenceForDecision(fixture(), 'd-root', NOW, fixture().settings), 2, NOW, 'reading-ok');
    assert.ok(valid);
    const warnings = [];
    const [fixed] = normalizeConsequenceReadings([
      { ...valid, price: { weeklyAmount: -1, currency: 'USD' } },
      { ...valid, id: 'invalid', predictedStillOpenPct: '0' },
    ], NOW_ISO, warnings);
    assert.equal(fixed.price, null);
    assert.equal(fixed.expectedCost, null);
    assert.equal(fixed.fullWaitCeiling, null);
    assert.equal(warnings.length, 2);
    assert.equal(normalizeConsequenceReadings([{ ...valid, reviewOn: '2026-02-31' }], NOW_ISO).length, 0);
  });
  test('a fabricated grade without a dated outcome is cleared; graded items cannot be deleted by normalisation', () => {
    const s = fixture();
    const reading = buildConsequenceReading(consequenceForDecision(s, 'd-root', NOW, s.settings), 2, NOW, 'reading-ok');
    const w = [];
    const [r] = normalizeConsequenceReadings([{ ...reading, graded: { gradedAt: NOW_ISO, brier: 0 } }], NOW_ISO, w);
    assert.equal(r.graded, null);
    assert.ok(w.some((v) => v.includes('grade')));
    const markers = normalizeConsequenceMarkers(['a', 'a', '', null, 3, 'b']);
    assert.deepEqual(markers, ['a', 'b']);
  });
});

/* ------------------------------------------ exact arithmetic & refusals */

describe('conditional survival area: endpoint is a lower bound, not expected cost', () => {
  const curve = kaplanMeier([
    { elapsedDays: 7, exitType: 'completed' }, { elapsedDays: 7, exitType: 'completed' },
    { elapsedDays: 14, exitType: 'completed' }, { elapsedDays: 14, exitType: 'abandoned' },
    ...Array.from({ length: 4 }, () => ({ elapsedDays: 21, exitType: null })),
  ]);
  test('hand-computed KM: n=8, S(7)=0.75, S(14)=0.5, area=1.75 weeks, lower=1 week', () => {
    const r = integrateConditionalSurvival(curve, 0, 14, 4, 3);
    assert.equal(r.available, true);
    assert.equal(curve.survivalAt(7), 0.75);
    assert.equal(curve.survivalAt(14), 0.5);
    assert.equal(r.probabilityPct, 50);
    assert.equal(r.expectedWeeks, 1.75);
    assert.equal(r.endpointLowerWeeks, 1);
    assert.equal(r.fullWeeks, 2);
    assert.equal(r.boundHolds, true);
    assert.equal(Math.round(100 * r.expectedWeeksRaw), 175);
    assert.equal(Math.round(100 * r.endpointLowerWeeksRaw), 100);
  });
  test('conditional area at age 7: P(+7 days)=2/3; expect one full week if no exit before day14', () => {
    const r = integrateConditionalSurvival(curve, 7, 7, 4, 3);
    assert.equal(r.available, true);
    assert.ok(Math.abs(r.probability - 2 / 3) < 1e-3);
    assert.equal(r.expectedWeeks, 1);
  });
  test('zero exits, thin at-risk set, no start, and horizon beyond support each refuse', () => {
    assert.match(integrateConditionalSurvival(kaplanMeier([{ elapsedDays: 30, exitType: null }]), 0, 7).reason, /exit/);
    assert.match(integrateConditionalSurvival(curve, 20, 7, 5, 3).reason, /at risk/);
    assert.match(integrateConditionalSurvival(curve, null, 7, 4, 3).reason, /dated start/);
    assert.equal(integrateConditionalSurvival(curve, 0, 28, 4, 3).beyondEvidence, true);
    assert.equal(integrateConditionalSurvival(curve, 0, 14, 4, 10).available, false);
  });
  test('every available horizon obeys endpoint≤expected≤full for the real demo curve', () => {
    const s = buildDemoState(NOW);
    const report = consequenceReport(s, NOW, s.settings, 'dec-demo-alloc-1');
    const scenarios = report.focused.horizons;
    assert.ok(scenarios.some((c) => c.area.available));
    for (const c of scenarios.filter((x) => x.area.available)) {
      assert.ok(c.area.boundHolds);
      assert.ok(c.area.endpointLowerWeeks <= c.area.expectedWeeks);
      assert.ok(c.area.expectedWeeks <= c.weeks);
      assert.ok(c.expectedCost >= c.endpointLowerCost && c.expectedCost <= c.fullWaitCeiling);
    }
  });
});

/* ----------------------------------------------------------- graph */

describe('bounded typed ripple map and honest money', () => {
  test('follows exact two-hop operational edges; excludes people, conflicts and systemic-only links', () => {
    const s = fixture();
    const g = decisionBlastRadius(s, 'd-root');
    assert.ok(g.direct.some((n) => n.type === 'case' && n.id === 'case-1'));
    assert.ok(g.direct.some((n) => n.type === 'budget' && n.id === 'budget-1'));
    assert.ok(g.secondOrder.some((n) => n.type === 'decision' && n.id === 'd-coupled'));
    assert.equal(g.nodes.some((n) => n.type === 'person'), false);
    assert.equal(g.nodes.some((n) => n.type === 'conflict' || n.type === 'pulse'), false);
    assert.ok(g.bridges.some((b) => b.type === 'case' && b.secondOrder >= 1));
    assert.equal(g.secondOrder.find((n) => n.id === 'd-coupled').path.length, 2);
    assert.deepEqual(decisionBlastRadius(s, 'd-root').nodes.map((n) => n.id), g.nodes.map((n) => n.id), 'deterministic traversal');
  });
  test('unknown endpoints are counted and excluded; graph cap is labelled incomplete', () => {
    const s = fixture();
    s.links.push(edge('case', 'case-1', 'dependency', 'missing', 'depends-on', 99));
    assert.equal(decisionBlastRadius(s, 'd-root').invalidEdges, 1);
    for (let i = 0; i < 80; i++) {
      s.cases.push({ id: `burst-${i}`, title: `Case ${i}`, status: 'open' });
      s.links.push(edge('decision', 'd-root', 'case', `burst-${i}`, 'decides', i + 100));
    }
    const g = decisionBlastRadius(s, 'd-root');
    assert.equal(g.truncated, true);
    assert.ok(g.nodes.length <= 64);
    assert.equal(decisionBlastRadius(s, 'not-here').nodes.length, 0);
  });
  test('a missing TTS is NOT silently zero: no invented continuity shortfall', () => {
    const s = fixture();
    s.dependencies[0].ttsDays = null;
    const f = consequenceForDecision(s, 'd-root', NOW, s.settings);
    assert.equal(f.footprint.dependencies[0].tts, null);
    assert.equal(f.footprint.shortfalls.length, 0);
  });
  test('root price is derived once; other currency remains a separate conditional ceiling', () => {
    const s = fixture();
    const f = consequenceForDecision(s, 'd-root', NOW, s.settings);
    assert.equal(f.row.price.weeklyAmount, 10000);
    assert.equal(f.row.price.currency, 'USD');
    assert.equal(f.footprint.fragile.length, 1);
    assert.equal(f.footprint.coupled.length, 1);
    assert.equal(f.footprint.shortfalls.length, 1);
    assert.equal(f.selected.related.buckets.find((b) => b.currency === 'EUR').fullWaitCeiling, 400);
    assert.ok(f.selected.expectedCost <= f.selected.fullWaitCeiling);
    const value = decisionValueTerms(s, s.decisions.find((d) => d.id === 'd-root'));
    assert.equal(value.dominant.amount, 120000);
  });
  test('unpriced is null, not zero; no reading can be frozen after the answer', () => {
    const s = fixture();
    s.budgets = [];
    s.links = s.links.filter((l) => l.targetType !== 'budget');
    const f = consequenceForDecision(s, 'd-root', NOW, s.settings);
    assert.equal(f.row.price.priced, false);
    assert.equal(f.selected.expectedCost, null);
    assert.equal(f.selected.fullWaitCeiling, null);
    assert.ok(f.selected.area.available, 'survival evidence is independent from money');
    assert.equal(consequenceForDecision(s, 'd7a', NOW, s.settings), null);
    assert.equal(consequenceBrief(f, NOW).includes('Never copy me'), false);
    assert.equal(consequenceBrief(f, NOW).includes('Recovery pathway'), false);
  });
});

/* -------------------------------------- freeze → grade & rule spine */

describe('prospective record and same-transaction cross-module propagation', () => {
  test('the rule is contracted and ordered before Decision Tempo', () => {
    assert.ok(DEFAULT_POST_COMMIT_RULES.includes(consequenceRule));
    const contract = PROPAGATION_CONTRACTS.find((c) => c.rule === consequenceRule);
    assert.ok(contract?.writes.includes('delegations'));
    assert.ok(contract?.writes.includes('decisions'));
    assert.ok(contract?.writes.includes('links'));
    assert.ok(DEFAULT_POST_COMMIT_RULES.indexOf(consequenceRule) < DEFAULT_POST_COMMIT_RULES.indexOf(decisionTempoRule));
    assert.ok(Object.values(CONSEQUENCE_RULE_IDS).every((id) => /^RULE-CSQ-0[1-5]$/.test(id)));
    assert.ok(Object.values(CONSEQUENCE_EVENTS).every((id) => id.startsWith('consequence.')));
  });
  test('one freeze fans out to a typed source and neighbours, one premise task and one DACI coordination decision', () => {
    const { store, api } = harness();
    const before = { decisions: store.state.decisions.length, delegations: store.state.delegations.length, links: store.state.links.length };
    const result = api.freezeConsequenceReading('d-root', 2);
    assert.equal(result.ok, true, result.error);
    assert.equal(store.state.consequenceReadings.length, 1);
    const reading = store.state.consequenceReadings[0];
    assert.equal(reading.predictedStillOpenPct, result.reading.predictedStillOpenPct);
    assert.equal(reading.price.currency, 'USD');
    assert.equal(reading.expectedCost, result.reading.expectedCost);
    assert.equal(reading.graphSnapshot.fragilePremises, 1);
    assert.equal(store.state.decisions.filter((d) => d.rationale?.includes(CONSEQUENCE_RULE_IDS.COORDINATE)).length, 1,
      'exactly one coordination call was created; other rules may open their own decisions in the same event cascade');
    assert.ok(store.state.decisions.length >= before.decisions + 1);
    assert.ok(store.state.delegations.length >= before.delegations + 1, 'at least one leader-owned verification task');
    assert.equal(store.state.delegations.filter((d) => d.support.includes(CONSEQUENCE_RULE_IDS.VERIFY)).length, 1);
    assert.equal(store.state.delegations.find((d) => d.support.includes(CONSEQUENCE_RULE_IDS.VERIFY)).personId, 'p-leader');
    const edges = store.state.links.filter((l) => l.sourceType === 'consequence' && l.sourceId === reading.id);
    assert.ok(edges.length >= 5, `expected source/neighbor/task/decision edges, got ${edges.length}`);
    assert.ok(edges.some((l) => l.relation === 'maps-consequence' && l.targetId === 'd-root'));
    assert.ok(edges.some((l) => l.relation === 'surfaces-impact' && l.targetId === 'case-1'));
    assert.ok(edges.some((l) => l.relation === 'tracks-followup' && l.targetType === 'delegation'));
    assert.ok(store.state.links.length > before.links);
    assert.ok(result.propagations.some((p) => p.ruleId === CONSEQUENCE_RULE_IDS.COORDINATE));
    assert.ok(result.propagations.some((p) => p.ruleId === CONSEQUENCE_RULE_IDS.VERIFY));
    assert.ok(store.state.events.some((ev) => ev.type === CONSEQUENCE_EVENTS.FROZEN));
    const resolved = resolveLinkedEntity(store.state, 'consequence', reading.id);
    assert.equal(resolved.route, `#/consequences?panel=readings&reading=${reading.id}`);
    assert.ok(linksForEntity(store.state, 'decision', 'd-root').some((entry) => entry.peer.type === 'consequence'));
    assert.equal(api.freezeConsequenceReading('d-root', 2).ok, false, 're-freezing the same day/horizon is not a second independent prediction');
    assert.equal(api.scanConsequences().changed, false, 'a second scan without due work writes nothing');
  });
  test('explicit freeze works even with auto rules paused; graded miss waits for the next scan', () => {
    const state = fixture();
    state.settings.consequenceAutoPropagate = false;
    const { store, api } = harness(state);
    const r = api.freezeConsequenceReading('d-root', 1);
    assert.equal(r.ok, true);
    assert.ok((store.state.links || []).some((e) => e.sourceType === 'consequence'), 'explicit freeze still maps');
    const after = store.state.delegations.length;
    assert.equal(api.scanConsequences().ok, true);
    assert.equal(store.state.delegations.length, after);
  });
  test('a failed browser write is surfaced instead of saying the frozen reading was saved', () => {
    const { store, api, mem } = harness();
    mem.setItem = () => { throw new Error('Storage quota reached'); };
    const result = api.freezeConsequenceReading('d-root', 2);
    assert.equal(result.ok, true, 'in-memory state remains available for export');
    assert.equal(result.saved, false);
    assert.match(result.warning, /quota|could not|save|storage/i);
    assert.ok(store.persistError);
    assert.equal(store.state.consequenceReadings.length, 1);
  });
  test('refuses invalid horizons, thin evidence and an already-decided source', () => {
    const { api, store } = harness();
    assert.equal(api.freezeConsequenceReading('d-root', 0).ok, false);
    assert.equal(api.freezeConsequenceReading('d-root', 3).ok, false);
    assert.equal(api.freezeConsequenceReading('d7a', 1).ok, false);
    store.state.settings.consequenceMinExits = 20;
    assert.equal(api.freezeConsequenceReading('d-root', 2).ok, false);
    assert.equal(store.state.consequenceReadings.length, 0);
  });
  test('a frozen prediction refuses grading before review, missing source/date and double grade', () => {
    const s = fixture();
    const f = consequenceForDecision(s, 'd-root', NOW, s.settings);
    const reading = buildConsequenceReading(f, 2, NOW, 'read-1');
    assert.equal(gradeConsequenceReading(reading, s, NOW).ok, false);
    assert.equal(gradeConsequenceReading(reading, { ...s, decisions: [] }, new Date('2026-11-15')).ok, false);
    const invalid = { ...s, decisions: s.decisions.map((d) => d.id === 'd-root' ? { ...d, chosen: 'Yes', decidedOn: null } : d) };
    assert.match(gradeConsequenceReading(reading, invalid, new Date('2026-11-15')).reason, /no dated/);
    const still = gradeConsequenceReading(reading, s, new Date('2026-11-15'));
    assert.equal(still.ok, true);
    assert.equal(still.stillOpen, true);
    assert.ok(still.brier > 0);
    assert.equal(gradeConsequenceReading({ ...reading, graded: still }, s, new Date('2026-11-16')).ok, false);
  });
  test('deciding by the review date grades observed=0; grade freezes and cannot be deleted', () => {
    const { store, api } = harness();
    const frozen = api.freezeConsequenceReading('d-root', 2);
    assert.ok(frozen.ok);
    const reading = store.state.consequenceReadings[0];
    const laterDate = new Date('2026-11-15T10:00:00Z');
    const decided = { ...store.state,
      decisions: store.state.decisions.map((d) => d.id === 'd-root' ? { ...d, chosen: 'Option A', decidedOn: '2026-11-05' } : d) };
    const score = gradeConsequenceReading(reading, decided, laterDate);
    assert.equal(score.ok, true);
    assert.equal(score.stillOpen, false);
    assert.equal(score.brier, Number(((reading.predictedStillOpenPct / 100) ** 2).toFixed(4)));
    assert.equal(api.deleteConsequenceReading(reading.id).ok, true, 'ungraded reading can be deleted with links');
    assert.equal(store.state.links.some((l) => l.sourceType === 'consequence' && l.sourceId === reading.id), false);
    assert.equal(store.state.consequenceReadings.length, 0);
  });
  test('real action → timed decision → one grade → persisted reload, with no hindsight rewrite', () => {
    let current = NOW;
    const { store, api, mem } = harness(fixture(), () => current);
    const frozen = api.freezeConsequenceReading('d-root', 2);
    assert.ok(frozen.ok);
    assert.equal(api.gradeConsequenceReading(frozen.id).ok, false, 'the review cannot be graded immediately');
    current = new Date('2026-11-05T10:00:00Z');
    const settled = api.decideDecision('d-root', { chosen: 'Option A', rationale: 'Team agreed on a path.' });
    assert.equal(settled.ok, true);
    assert.equal(store.state.decisions.find((d) => d.id === 'd-root').decidedOn, '2026-11-05');
    current = new Date('2026-11-15T10:00:00Z');
    const score = api.gradeConsequenceReading(frozen.id);
    assert.equal(score.ok, true, score.error);
    assert.equal(score.grade.stillOpen, false);
    assert.equal(score.grade.brier, Number(((frozen.reading.predictedStillOpenPct / 100) ** 2).toFixed(4)));
    assert.equal(api.gradeConsequenceReading(frozen.id).ok, false, 'cannot re-grade an outcome');
    assert.equal(api.deleteConsequenceReading(frozen.id).ok, false, 'cannot delete a graded forecast');
    const reloaded = createStore({ storage: mem, now: () => current });
    reloaded.load();
    assert.equal(reloaded.state.consequenceReadings[0].graded.brier, score.grade.brier);
    assert.ok(linksForEntity(reloaded.state, 'consequence', frozen.id).length >= 1);
    assert.ok(reloaded.state.events.some((e) => e.type === CONSEQUENCE_EVENTS.GRADED));
  });
  test('a due scan opens one grading task and signals; a graded surprise opens one learning task', () => {
    const s = fixture();
    const f = consequenceForDecision(s, 'd-root', NOW, s.settings);
    const r = buildConsequenceReading(f, 1, NOW, 'due-1');
    r.reviewOn = '2026-10-30'; // emulate a reading frozen before now
    r.frozenAt = '2026-10-23T10:00:00Z';
    r.predictedStillOpenPct = 10;
    s.consequenceReadings = [r];
    let seq = 0;
    const ctx = { event: { type: CONSEQUENCE_EVENTS.SCAN, entityId: '' }, now: NOW,
      idFactory: (p) => `${p}-rule-${++seq}`, logEvent: () => {} };
    const effects = consequenceRule(s, ctx);
    assert.ok(effects.some((e) => e.ruleId === CONSEQUENCE_RULE_IDS.GRADE));
    assert.equal(consequenceRule(s, ctx).length, 0, 'marker-idempotent scan');
    assert.ok(consequenceSignals(s, NOW).some((x) => x.ruleId === 'CSQ-01'));
    assert.ok(consequenceAttentionCount(s, NOW) >= 1);
    assert.ok(DOMAIN_ORDER.includes('Decision consequences'));
    assert.ok(buildInsights(s, NOW).byDomain.some((x) => x.domain === 'Decision consequences'));
    r.graded = gradeConsequenceReading(r, s, NOW);
    assert.ok(r.graded.brier > 0.49);
    ctx.event = { type: CONSEQUENCE_EVENTS.GRADED, entityId: r.id };
    assert.ok(consequenceRule(s, ctx).some((e) => e.ruleId === CONSEQUENCE_RULE_IDS.LEARN));
    assert.equal(consequenceRule(s, ctx).length, 0);
    assert.equal(s.delegations.filter((d) => d.support.includes(CONSEQUENCE_RULE_IDS.LEARN)).length, 1);
  });
  test('clearDemo drops ungraded demo forecasts and retains graded history without contaminating calibration', () => {
    const demo = buildDemoState(NOW);
    const { store, api } = harness(demo);
    const reading = api.freezeConsequenceReading('dec-demo-alloc-1', 2);
    assert.ok(reading.ok);
    const copy = { ...reading.reading, id: 'graded-history-copy',
      graded: { gradedAt: '2026-11-15T10:00:00Z', stillOpen: false, brier: 0.16, decisionDate: '2026-11-08' } };
    store.update((draft) => { draft.consequenceReadings.push(copy); },
      { type: 'test.added', entity: 'workspace', entityId: '', summary: 'fixture' });
    store.clearDemo();
    assert.equal(store.state.consequenceReadings.some((r) => r.id === reading.id), false, 'ungraded orphan is removed');
    assert.equal(store.state.consequenceReadings.some((r) => r.id === copy.id), true, 'graded result remains an immutable audit record');
    assert.equal(consequenceCalibration(store.state).n, 0, 'demo outcome cannot improve or worsen real calibration');
    assert.equal(store.state.links.some((l) => l.sourceId === reading.id || l.sourceId === copy.id), false);
    assert.ok(consequenceSignals(store.state, NOW).some((sig) => sig.ruleId === 'CSQ-04'));
  });
  test('the calibration comparison is withheld below 5, scored above it; no scored person', () => {
    const s = fixture();
    const base = buildConsequenceReading(consequenceForDecision(s, 'd-root', NOW, s.settings), 1, NOW, 'base');
    s.consequenceReadings = [0, 1, 2, 3].map((i) => ({ ...base, id: `read-${i}`, graded: { brier: 0.16, stillOpen: i % 2 === 0 } }));
    assert.equal(consequenceCalibration(s).available, false);
    s.consequenceReadings.push({ ...base, id: 'read-4', graded: { brier: 0.16, stillOpen: true } });
    const cal = consequenceCalibration(s);
    assert.equal(cal.n, 5);
    assert.equal(cal.available, true);
    assert.ok(Number.isFinite(cal.skill));
    assert.ok(consequenceSignals(s, NOW).every((sig) => !sig.evidence.join(' ').includes('Never copy me')));
  });
});

/* ------------------------------------------------------- navigation / UI */

describe('five-panel terminal, inclusive routes and working controls', () => {
  function renderDom(state, hash = '#/consequences') {
    const dom = new JSDOM('<!doctype html><html lang="en"><body><main id="view"></main><div id="modal-root"></div></body></html>', {
      url: `https://example.test/${hash}`, pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
    });
    const { window } = dom;
    globalThis.window = window; globalThis.document = window.document; globalThis.Node = window.Node;
    globalThis.Element = window.Element; globalThis.HTMLElement = window.HTMLElement;
    globalThis.Event = window.Event; globalThis.MouseEvent = window.MouseEvent;
    const ctx = { state, now: NOW, query: new URLSearchParams(hash.split('?')[1] || ''),
      navigate: () => {}, api: { scanConsequences: () => ({ ok: true, changed: false }),
        freezeConsequenceReading: () => ({ ok: true, id: 'r' }),
        gradeConsequenceReading: () => ({ ok: true, grade: { brier: 0.1, stillOpen: true } }),
        deleteConsequenceReading: () => ({ ok: true }) } };
    window.document.getElementById('view').appendChild(renderConsequences(ctx));
    return { dom, ctx };
  }
  test('every panel has exactly one h1 and all data tables have matching headers', () => {
    const s = fixture();
    for (const panel of ['overview', 'map', 'delay', 'readings', 'method']) {
      const { dom } = renderDom(s, `#/consequences?panel=${panel}&decision=d-root`);
      const { document } = dom.window;
      assert.equal(document.querySelectorAll('h1').length, 1, panel);
      assert.ok(document.body.textContent.includes('Consequence Lab'), panel);
      for (const tbl of document.querySelectorAll('table')) {
        const headers = tbl.querySelectorAll('thead th').length;
        assert.ok(tbl.getAttribute('aria-label'), 'every table announces its purpose');
        for (const row of tbl.querySelectorAll('tbody tr')) assert.equal(row.querySelectorAll('td').length, headers, panel);
      }
      dom.window.close();
    }
  });
  test('empty workspace is an explained route; aliases and decision card lead to it', () => {
    const { dom } = renderDom(createEmptyState(NOW_ISO));
    assert.match(dom.window.document.body.textContent, /No open decision/);
    assert.equal(parseRoute('#/consequence').route, 'consequences');
    assert.equal(parseRoute('#/ripple-map?panel=map').route, 'consequences');
    dom.window.close();
    const s = fixture();
    const view = renderDom(s, '#/consequences?panel=delay&decision=d-root');
    assert.equal(view.dom.window.document.querySelectorAll('button[aria-label^="Freeze"]').length, 3);
    view.dom.window.close();
    // Direct cards have a first-class entry point, not merely a sidebar item.
    const d = new JSDOM('<!doctype html><html lang="en"><body></body></html>', { url: 'https://example.test/' });
    globalThis.window = d.window; globalThis.document = d.window.document; globalThis.Node = d.window.Node;
    const node = renderDecisions({ state: s, now: NOW, query: new URLSearchParams('decision=d-root'), navigate: () => {}, api: {} });
    d.window.document.body.appendChild(node);
    assert.ok(d.window.document.querySelector('a[href*="consequences?panel=overview"]'));
    d.window.close();
  });
  test('overview, map, delay, readings and method pass axe-core (color contrast requires real browser)', async () => {
    const s = fixture();
    for (const panel of ['overview', 'map', 'delay', 'readings', 'method']) {
      const { dom } = renderDom(s, `#/consequences?panel=${panel}&decision=d-root`);
      dom.window.eval(AXE_SRC);
      const result = await dom.window.axe.run(dom.window.document.getElementById('view'), { rules: { 'color-contrast': { enabled: false } } });
      assert.deepEqual(Array.from(result.violations).map((v) => v.id), [], panel);
      dom.window.close();
    }
  });
  test('focus reading deep link resolves to exact typed node without writing it', () => {
    assert.ok(LINK_ENTITY_TYPES.includes('consequence'));
    assert.equal(LINK_ENTITY_COLLECTIONS.consequence, 'consequenceReadings');
    assert.ok(LINK_RELATIONS.includes('maps-consequence'));
    assert.ok(SYSTEM_GENERATED_LINK_RELATIONS.includes('surfaces-impact'));
    const s = fixture();
    s.consequenceReadings = [buildConsequenceReading(consequenceForDecision(s, 'd-root', NOW, s.settings), 2, NOW, 'reading-1')];
    assert.equal(resolveLinkedEntity(s, 'consequence', 'reading-1').route, '#/consequences?panel=readings&reading=reading-1');
    assert.equal(parseRoute('#/consequences?panel=readings&reading=reading-1').route, 'consequences');
  });
});

/* ------------------------------------------------------ purpose-limited export */

describe('CSV scope #57: aggregate-only, floors and no identifiers', () => {
  test('one reading exports counts, but no individual forecast, money, title, name, or IDs', () => {
    assert.equal(CSV_EXPORTS.length, 68);
    assert.ok(CSV_EXPORTS.some((e) => e.key === 'consequences' && e.filenameSlug === 'decision-consequences'));
    const s = fixture();
    s.consequenceReadings = [buildConsequenceReading(consequenceForDecision(s, 'd-root', NOW, s.settings), 2, NOW, 'private-reading-id')];
    const result = exportWorkspaceCsv(s, 'consequences', { now: NOW });
    assert.equal(result.ok, true);
    assert.equal(result.rowCount, 1);
    for (const secret of ['Recovery pathway', 'Never copy me', 'd-root', 'private-reading-id', 'premise-1',
      String(s.consequenceReadings[0].expectedCost), String(s.consequenceReadings[0].predictedStillOpenPct)]) {
      assert.equal(result.csv.includes(secret), false, `the CSV leaked ${secret}`);
    }
    const parsed = parseCsv(result.csv);
    assert.equal(parsed.rows.length, 1);
    const head = parsed.headers;
    const row = parsed.rows[0];
    assert.equal(row[head.indexOf('frozen_count')], '1');
    assert.equal(row[head.indexOf('mean_still_open_pct')], '');
    assert.equal(row[head.indexOf('total_expected_cost')], '');
    assert.equal(row[head.indexOf('mean_brier')], '');
  });
  test('five readings in one currency reveal only group aggregates; currencies are never combined', () => {
    const s = fixture();
    const base = buildConsequenceReading(consequenceForDecision(s, 'd-root', NOW, s.settings), 2, NOW, 'base');
    s.consequenceReadings = Array.from({ length: 5 }, (_, i) => ({
      ...base, id: `private-${i}`, predictedStillOpenPct: 40,
      graded: { gradedAt: '2026-11-20T10:00:00Z', brier: 0.16, stillOpen: false, decisionDate: '2026-11-08' },
    }));
    s.consequenceReadings.push({ ...base, id: 'unpriced-private', price: null, expectedCost: null, fullWaitCeiling: null });
    const result = exportWorkspaceCsv(s, 'consequences', { now: NOW });
    assert.equal(result.rowCount, 2);
    const { headers, rows } = parseCsv(result.csv);
    const usd = rows.find((r) => r[headers.indexOf('currency_code')] === 'USD');
    const unknown = rows.find((r) => r[headers.indexOf('currency_code')] === 'UNPRICED');
    assert.equal(usd[headers.indexOf('frozen_count')], '5');
    assert.equal(usd[headers.indexOf('mean_still_open_pct')], '40');
    assert.equal(usd[headers.indexOf('mean_brier')], '0.16');
    assert.ok(Number(usd[headers.indexOf('total_expected_cost')]) > 0);
    assert.equal(unknown[headers.indexOf('mean_still_open_pct')], '');
    assert.equal(unknown[headers.indexOf('total_expected_cost')], '');
    // A hand-imported reading without a forecast is not a 0% prediction;
    // the fifth row cannot unlock an average of four real forecasts.
    s.consequenceReadings[0].predictedStillOpenPct = null;
    const withheld = parseCsv(exportWorkspaceCsv(s, 'consequences', { now: NOW }).csv);
    const usdAfter = withheld.rows.find((r) => r[withheld.headers.indexOf('currency_code')] === 'USD');
    assert.equal(usdAfter[withheld.headers.indexOf('mean_still_open_pct')], '');
  });
});
