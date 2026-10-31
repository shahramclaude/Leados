/**
 * tests/app/coupling.test.mjs — Coupled Load Terminal (Schema v61) suite.
 *
 * Verifies:
 *   1. Schema v61 additivity and normalization
 *   2. The read model: coupling graph, shared bottlenecks, priced delay,
 *      hand-off paths and clusters
 *   3. Findings / brief / attention count
 *   4. Rules: RULE-COUP-01 (shared-approver edges), RULE-COUP-02 (approval
 *      mechanism), RULE-COUP-03 (hand-off shortening), RULE-COUP-04
 *      (re-sequencing)
 *   5. Marker idempotency
 *   6. Cross-module propagation through the real post-commit spine
 *   7. The typed `shares-approver` edge is navigable
 *   8. The view renders in JSDOM and passes axe-core
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  SCHEMA_VERSION, DEFAULT_SETTINGS, createEmptyState, normalizeState,
} from '../../app/core/schema.js';
import {
  buildCouplingGraph, buildCouplingReport, couplingSignals, couplingBrief,
  couplingAttentionCount, COUPLING_EDGE_LABELS, COUPLING_DEFAULTS,
} from '../../app/core/domain/coupling.js';
import { couplingRule } from '../../app/core/domain/couplingRules.js';
import {
  LINK_RELATIONS, LINK_ENTITY_TYPES, linksForEntity,
} from '../../app/core/domain/cases.js';
import { buildDemoState } from '../../app/core/demo.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-25T10:00:00.000Z');

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function harness() {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-cpl-${++seq}`;
  const store = createStore({ storage: memoryStorage(), now: () => NOW, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }) };
}

function bootDom() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(e.message);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const dom = new JSDOM(HTML, {
    url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole,
  });
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
  const res = await env.window.axe.run(env.document.querySelector(selector), {
    rules: { 'color-contrast': { enabled: false } },
  });
  return Array.from(res.violations).map((v) => `${v.id}: ${v.help}`);
}

/* ============================================================ */
/* 1. Schema v61 additivity                                     */
/* ============================================================ */

describe('Schema v61 — coupling additivity', () => {
  it('current schema version is 61', () => {
    assert.equal(SCHEMA_VERSION, 67);
  });

  it('creates empty state with couplingMarkers and the coupling settings', () => {
    const state = createEmptyState();
    assert.deepEqual(state.couplingMarkers, []);
    assert.equal(DEFAULT_SETTINGS.couplingWindowDays, 30);
    assert.equal(DEFAULT_SETTINGS.couplingServiceDays, 3);
    assert.equal(DEFAULT_SETTINGS.couplingBottleneckActors, 3);
    assert.equal(DEFAULT_SETTINGS.couplingBottleneckDecisions, 6);
    assert.equal(DEFAULT_SETTINGS.couplingHandoffMaxChain, 3);
    assert.equal(DEFAULT_SETTINGS.couplingDelayThresholdDays, 10);
    assert.equal(DEFAULT_SETTINGS.couplingMultiplierThreshold, 3);
    assert.equal(DEFAULT_SETTINGS.couplingMinObligations, 2);
    assert.equal(DEFAULT_SETTINGS.couplingAutoPropagate, true);
  });

  it('normalizes a corrupt couplingMarkers array fail-closed', () => {
    const { state, warnings } = normalizeState({ couplingMarkers: [42, '', 'ok', 'x'.repeat(300)] }, NOW);
    assert.deepEqual(state.couplingMarkers, ['ok', 'x'.repeat(200)]);
    assert.equal(warnings.length, 0);
  });

  it('clamps out-of-range coupling settings', () => {
    const { state } = normalizeState({
      settings: {
        couplingWindowDays: -5,
        couplingServiceDays: 999,
        couplingBottleneckActors: 0,
        couplingDelayThresholdDays: -3,
        couplingMultiplierThreshold: 0,
        couplingHandoffMaxChain: 0,
        couplingMinObligations: -1,
      },
    }, NOW);
    assert.equal(state.settings.couplingWindowDays, 1);
    assert.equal(state.settings.couplingServiceDays, 90);
    assert.equal(state.settings.couplingBottleneckActors, 1);
    assert.equal(state.settings.couplingDelayThresholdDays, 0);
    assert.equal(state.settings.couplingMultiplierThreshold, 1);
    assert.equal(state.settings.couplingHandoffMaxChain, 1);
    assert.equal(state.settings.couplingMinObligations, 0);
  });
});

/* ============================================================ */
/* 2. The read model                                            */
/* ============================================================ */

describe('Coupled Load — read model', () => {
  const state = buildDemoState(NOW);
  const report = buildCouplingReport(state, NOW, {});

  it('builds the coupling graph from roster + named actors', () => {
    const graph = buildCouplingGraph(state, NOW, {});
    assert.ok(graph.actors.length >= 5, 'at least the roster actors');
    assert.ok(graph.byKey instanceof Map);
  });

  it('names the demo shared approval bottleneck', () => {
    const bottleneck = report.bottlenecks.find((b) => b.kind === 'approver' && b.actor === 'Head of Platform');
    assert.ok(bottleneck, 'Head of Platform is a shared approver bottleneck');
    assert.ok(bottleneck.actorsServed >= 3, 'serves at least three distinct drivers');
    assert.ok(Array.isArray(bottleneck.actors) && bottleneck.actors.length === bottleneck.actorsServed);
  });

  it('prices the shared-approver delay with Kingman', () => {
    const delay = report.delay.find((d) => d.approver === 'Head of Platform');
    assert.ok(delay, 'Head of Platform delay is priced');
    assert.equal(delay.streams, 4);
    assert.ok(delay.rhoTotal > 0 && delay.rhoTotal < 1, 'utilisation is in (0,1) for the demo');
    assert.ok(delay.waitSharedDays > 0, 'shared wait is positive');
    assert.ok(delay.perStream.length === 4, 'one row per driver stream');
    for (const s of delay.perStream) {
      assert.ok(s.delayDays >= 0, 'delay is non-negative');
      assert.ok(s.multiplier >= 1, 'multiplier is at least 1');
    }
  });

  it('finds hand-off paths and the long ones', () => {
    assert.ok(report.handoffs.paths.length > 0, 'at least one measured hand-off path');
    assert.ok(Array.isArray(report.handoffs.longPaths));
    for (const p of report.handoffs.paths) {
      assert.equal(p.actors.length, p.edges + 1, 'a path of n hops has n+1 actors');
    }
  });

  it('reports clusters, edges and actor count', () => {
    assert.ok(report.actorCount >= 5);
    assert.ok(report.obligationCount >= report.actorCount);
    assert.ok(report.clusterCount >= 1);
    assert.equal(report.engine, 'coupling-2026.10-v1');
    assert.ok(report.byKey instanceof Map, 'the report exposes the actor index');
  });
});

/* ============================================================ */
/* 3. Findings / brief / attention                              */
/* ============================================================ */

describe('Coupled Load — findings and brief', () => {
  const state = buildDemoState(NOW);
  const signals = couplingSignals(state, NOW, {});

  it('emits findings in the shared shape', () => {
    assert.ok(signals.length > 0, 'the demo coupling produces at least one finding');
    for (const s of signals) {
      assert.equal(s.domain, 'Coupled load');
      assert.ok(Number.isInteger(s.severity) && s.severity >= 2 && s.severity <= 5);
      assert.ok(s.ruleId.startsWith('COUP-'));
      assert.ok(s.title && s.detail);
      assert.ok(Array.isArray(s.evidence));
      assert.ok(s.action && s.action.route.startsWith('#/coupling'));
    }
  });

  it('brief summarises the coupled load', () => {
    const brief = couplingBrief(state, NOW, {});
    assert.ok(brief.actorCount >= 5);
    assert.ok(brief.summary.length > 0);
    assert.ok(Number.isFinite(brief.maxMultiplier));
  });

  it('attention count counts decision-shaped findings only', () => {
    const count = couplingAttentionCount(state, NOW, {});
    const expected = couplingSignals(state, NOW, {}).filter((s) => s.severity >= 3).length;
    assert.equal(count, expected);
    assert.ok(count > 0);
  });
});

/* ============================================================ */
/* 4 + 5. Rules and idempotency                                  */
/* ============================================================ */

describe('RULE-COUP — propagation', () => {
  function ruleState() {
    const draft = structuredClone(buildDemoState(NOW));
    return draft;
  }

  it('RULE-COUP-01 writes a typed shares-approver edge between two decisions that share an approver', () => {
    const draft = ruleState();
    // Fire decision.created for a real demo decision whose approver is shared.
    const target = draft.decisions.find((d) => d.approver === 'Head of Platform');
    assert.ok(target, 'the demo has a decision approved by Head of Platform');
    const before = draft.links.length;
    const out = [];
    couplingRule(draft, {
      event: { type: 'decision.created', entityId: target.id },
      now: NOW, out, logEvent: () => {},
    });
    const newLinks = draft.links.slice(before);
    assert.ok(newLinks.length > 0, 'a coupling edge was written');
    assert.ok(newLinks.some((l) => l.relation === 'shares-approver'), 'at least one shares-approver edge');
  });

  it('RULE-COUP-02 opens one DACI decision on the approval mechanism bottleneck', () => {
    const draft = ruleState();
    const before = draft.decisions.length;
    couplingRule(draft, { event: { type: 'coupling.scan' }, now: NOW, out: [], logEvent: () => {} });
    const fresh = draft.decisions.slice(before);
    const mech = fresh.find((d) => d.approver === '' && /approves decisions|approval mechanism/i.test(d.title));
    assert.ok(mech, 'a decision about the approval mechanism was opened');
    assert.ok(mech.options.length >= 2, 'it offers at least two options');
    assert.ok(mech.rationale.includes('Head of Platform'), 'the rationale names the bottleneck');
  });

  it('RULE-COUP-03 opens an owned delegation or a DACI decision for a long hand-off chain', () => {
    const draft = ruleState();
    const beforeD = draft.decisions.length;
    const beforeDel = draft.delegations.length;
    couplingRule(draft, { event: { type: 'coupling.scan' }, now: NOW, out: [], logEvent: () => {} });
    const newDel = draft.delegations.slice(beforeDel);
    const newDec = draft.decisions.slice(beforeD);
    const chain = newDel.find((d) => d.title && d.title.includes('hand-off chain'))
      || newDec.find((d) => d.title && d.title.includes('hand-off chain'));
    assert.ok(chain, 'a hand-off shortening delegation or decision was opened');
    if (newDel.length) {
      assert.ok(['own', 'agree', 'recommend', 'act-inform'].includes(newDel[0].authority), 'authority is a valid enum');
      assert.ok(newDel[0].personId, 'the delegation has an owner');
    }
  });

  it('RULE-COUP-04 opens the priced re-sequence decision when only the delay reading clears', () => {
    const draft = ruleState();
    // Switch the structural bottleneck reading off so the priced-delay reading
    // is the only one that can fire — and it must fire exactly once.
    const before = draft.decisions.length;
    const settings = { couplingDelayThresholdDays: 0.5, couplingBottleneckActors: 99 };
    couplingRule(draft, { event: { type: 'coupling.scan' }, now: NOW, out: [], logEvent: () => {}, settings });
    const reseq = draft.decisions.slice(before).filter((d) => /Re-sequence how/i.test(d.title));
    assert.equal(reseq.length, 1, 'one re-sequence decision was opened once the threshold was lowered');
    assert.ok(reseq[0].rationale.includes('Head of Platform'));
    // A second sweep cannot open a second reading of the same approver.
    couplingRule(draft, { event: { type: 'coupling.scan' }, now: NOW, out: [], logEvent: () => {}, settings });
    assert.equal(draft.decisions.filter((d) => /Re-sequence how/i.test(d.title)).length, 1);
  });

  it('is marker-idempotent: a second run on the same draft writes nothing new', () => {
    const draft = ruleState();
    const out1 = [];
    couplingRule(draft, { event: { type: 'coupling.scan' }, now: NOW, out: out1, logEvent: () => {} });
    const linksAfter1 = draft.links.length;
    const decisionsAfter1 = draft.decisions.length;
    const delegationsAfter1 = draft.delegations.length;
    const markersAfter1 = draft.couplingMarkers.length;
    const out2 = [];
    couplingRule(draft, { event: { type: 'coupling.scan' }, now: NOW, out: out2, logEvent: () => {} });
    assert.equal(draft.links.length, linksAfter1, 'no new links');
    assert.equal(draft.decisions.length, decisionsAfter1, 'no new decisions');
    assert.equal(draft.delegations.length, delegationsAfter1, 'no new delegations');
    assert.equal(draft.couplingMarkers.length, markersAfter1, 'no new markers');
    assert.equal(out2.length, 0, 'no new effects');
  });

  it('a record event only reasons about that record\'s own actors', () => {
    const draft = ruleState();
    // A decision whose driver AND approver are untouched by any bottleneck.
    draft.decisions.push({
      id: 'dec-unrelated', title: 'Renew the design tool licence', question: '', date: '2026-10-25',
      reversibility: 'reversible', driver: 'Unrelated Driver', approver: 'Legal Counsel',
      contributors: '', informed: '', options: [], chosen: '', rationale: '',
      reviewOn: null, reviewedOn: null, outcome: 'pending', outcomeNotes: '',
      forecastProbability: null, decidedOn: null, createdAt: NOW.toISOString(),
    });
    const before = draft.decisions.length;
    couplingRule(draft, {
      event: { type: 'decision.created', entityId: 'dec-unrelated' },
      now: NOW, out: [], logEvent: () => {},
      settings: { couplingDelayThresholdDays: 0.5, couplingBottleneckActors: 3 },
    });
    assert.equal(draft.decisions.length, before, 'an unrelated record event opens nothing about someone else\'s bottleneck');
  });

  it('a full scan opens one decision per approver, never two readings of the same one', () => {
    const draft = ruleState();
    const before = draft.decisions.length;
    couplingRule(draft, { event: { type: 'coupling.scan' }, now: NOW, out: [], logEvent: () => {} });
    const fresh = draft.decisions.slice(before);
    const forApprover = fresh.filter((d) => /(approves decisions|Re-sequence how)/i.test(d.title) && d.rationale.includes('Head of Platform'));
    assert.equal(forApprover.length, 1, 'structural bottleneck and priced delay share one decision');
  });

  it('does not fire on unrelated events', () => {
    const draft = ruleState();
    const out = [];
    couplingRule(draft, { event: { type: 'case.created', entityId: 'c1' }, now: NOW, out, logEvent: () => {} });
    assert.equal(out.length, 0);
  });

  it('exposes an effect adapter callable directly', () => {
    const draft = ruleState();
    const out = [];
    const result = couplingRule.effect(draft, { type: 'coupling.scan' }, { now: NOW, out, logEvent: () => {} });
    assert.ok(result && result.fired === true);
  });
});

/* ============================================================ */
/* 6. Cross-module propagation through the real spine           */
/* ============================================================ */

describe('Coupled Load — cross-module spine propagation', () => {
  it('adding a decision that shares an approver writes a navigable shares-approver edge', () => {
    const { store, api } = harness();
    // Two decisions sharing one approver, created through the action API so
    // the real post-commit spine runs every rule.
    const a = api.addDecision({ title: 'Decision A', date: '2026-10-20', driver: 'Priya Natarajan', approver: 'Head of Platform' });
    assert.ok(a.ok, 'decision A created');
    const b = api.addDecision({ title: 'Decision B', date: '2026-10-21', driver: 'Samuel Okafor', approver: 'Head of Platform' });
    assert.ok(b.ok, 'decision B created');

    const links = linksForEntity(store.state, 'decision', b.id);
    const coupling = links.filter((l) => l.relation === 'shares-approver');
    assert.ok(coupling.length >= 1, 'a shares-approver edge links back to decision A');
    assert.ok(coupling.some((l) => l.link.sourceId === a.id || l.link.targetId === a.id), 'the edge points at decision A');
  });

  it('does not duplicate edges when the same decision is re-saved', () => {
    const { store, api } = harness();
    const a = api.addDecision({ title: 'Decision A', date: '2026-10-20', driver: 'Priya Natarajan', approver: 'Head of Platform' });
    const b = api.addDecision({ title: 'Decision B', date: '2026-10-21', driver: 'Samuel Okafor', approver: 'Head of Platform' });
    const count1 = linksForEntity(store.state, 'decision', b.id).filter((l) => l.relation === 'shares-approver').length;
    api.updateDecision(b.id, { title: 'Decision B (edited)' });
    const count2 = linksForEntity(store.state, 'decision', b.id).filter((l) => l.relation === 'shares-approver').length;
    assert.equal(count2, count1, 're-saving did not add duplicate edges');
  });

  it('a shared approval bottleneck opens one mechanism decision through the spine', () => {
    const { store, api } = harness();
    const drivers = ['Priya Natarajan', 'Samuel Okafor', 'Mei Lin Chen'];
    for (let i = 0; i < 3; i += 1) {
      api.addDecision({ title: `Bulk decision ${i}`, date: '2026-10-20', driver: drivers[i], approver: 'Head of Platform' });
    }
    const mechanism = store.state.decisions.filter((d) => d.approver === '' && d.title.includes('approves decisions'));
    assert.equal(mechanism.length, 1, 'exactly one approval-mechanism decision');
  });
});

/* ============================================================ */
/* 7. Typed edge vocabulary                                      */
/* ============================================================ */

describe('Coupled Load — typed edge vocabulary', () => {
  it('registers shares-approver as a valid relation between decisions', () => {
    assert.ok(LINK_RELATIONS.includes('shares-approver'));
    assert.ok(LINK_ENTITY_TYPES.includes('decision'));
    assert.equal(COUPLING_EDGE_LABELS['shares-approver'], 'shares an approver');
  });
});

/* ============================================================ */
/* 8. The view renders and passes axe-core                       */
/* ============================================================ */

describe('Coupled Load — view', () => {
  it('renders in JSDOM with the demo and passes axe-core', async () => {
    const env = bootDom();
    const { createApp } = await import('../../app/main.js');
    const app = createApp({ storage: env.window.localStorage, now: () => NOW });
    app.ctx.loadDemo();
    const routes = ['#/coupling', '#/coupling?tab=bottlenecks', '#/coupling?tab=delay', '#/coupling?tab=handoffs', '#/coupling?tab=method'];
    try {
      for (const route of routes) {
        app.ctx.navigate(route);
        assert.ok(env.document.querySelector('#view').textContent.length > 0, `${route} rendered`);
        assert.deepEqual(await axeViolations(env), [], `${route} has no axe violations`);
        assert.deepEqual(env.consoleErrors, [], `${route} logged no console errors`);
      }
    } finally {
      env.dom.window.close();
    }
  });

  it('the nav registers a Coupled Load entry', async () => {
    const env = bootDom();
    const { createApp } = await import('../../app/main.js');
    const app = createApp({ storage: env.window.localStorage, now: () => NOW });
    app.ctx.loadDemo();
    app.ctx.navigate('#/coupling');
    const navText = env.document.querySelector('nav, [class*="nav"]')?.textContent || '';
    assert.ok(/Coupled Load/i.test(navText), 'nav labels the Coupled Load terminal');
    env.dom.window.close();
  });
});
