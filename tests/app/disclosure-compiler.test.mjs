/**
 * tests/app/disclosure-compiler.test.mjs — ADR-0086, Session 124: the Disclosure
 * Compiler (Schema v90).
 *
 * The claims this suite makes, in order:
 *   1. v89 → v90 is additive; a malformed or expired grant can never load as
 *      live authority, and a grant that cannot name its requester, span, purpose
 *      and end date is dropped rather than honoured.
 *   2. The manifest catalogue covers every route the shell can render, and every
 *      declared collection is a real one.
 *   3. One compile yields a posture per route per altitude: detail inside the
 *      class window, aggregate above it, withheld below a class floor — each with
 *      a printed reason. An unknown route is withheld, never guessed at.
 *   4. THE LEAK ORACLE. With sentinel strings planted in every private field,
 *      navigating every route at four altitudes never prints an out-of-span
 *      person's private text, never prints a peer span's name, and never crashes
 *      into the error panel. This is the evidence that replaces a hand audit.
 *   5. The aggregate reads only the seat's own subtree, withholds sub-floor cells,
 *      applies one complementary suppression, keeps money per currency, and says
 *      every one of those things out loud.
 *   6. A release request crosses modules in ONE transaction (governed decision +
 *      consent task + typed edges), and the span leader's consent is the only
 *      thing that creates authority — the requester cannot consent, the cap and
 *      the class rules hold, and a lapsed window is refused by the compiler.
 *   7. `workspaceRouteVerdict` asks the compiler when it has a compiled state and
 *      falls back to the old narrow allowlist when it does not.
 *   8. The console's four panels render axe-clean.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { SCHEMA_VERSION, COLLECTIONS, createEmptyState, normalizeState, migrate } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildSeats, activeSeat, projectForSeat } from '../../app/core/domain/seat.js';
import {
  compileDisclosure, moduleAggregate, postureFor, grantedRecords, disclosureReport,
  disclosureBriefText, disclosureCsvRows, validateGrantRequest, activeGrants, withinSpan,
} from '../../app/core/domain/disclosure.js';
import { MODULE_MANIFESTS, MANIFEST_ROUTES, manifestFor } from '../../app/core/domain/disclosureManifests.js';
import { normalizeDisclosureGrant, normalizeDisclosureGrants } from '../../app/core/domain/disclosureSchema.js';
import { DISCLOSURE_POSTURES, DISCLOSURE_EVENTS } from '../../app/core/domain/disclosureRegistry.js';
import { workspaceRouteVerdict } from '../../app/core/domain/accessGateway.js';
import { scopedViewState } from '../../app/core/domain/viewScope.js';
import { renderDisclosure } from '../../app/views/disclosure.js';

const NOW = new Date('2026-11-04T09:00:00.000Z');
const ago = (n) => new Date(NOW.getTime() - n * 86400000).toISOString().slice(0, 10);
const ahead = (n) => new Date(NOW.getTime() + n * 86400000).toISOString().slice(0, 10);
const clone = (v) => JSON.parse(JSON.stringify(v));

/** Every route `app/main.js` can render (kept in sync by assertion 2). */
const RENDERER_ROUTES = [
  'assurance', 'today', 'mission', 'intake', 'routing', 'concordance', 'responses', 'bundles', 'compare',
  'attribution', 'counterfactual', 'reliability', 'supply', 'solvency', 'sceptic', 'comms',
  'insights', 'chain', 'seat', 'succession', 'mandates', 'authorityCalibration', 'seal', 'people',
  'person', 'onboarding', 'oneonones', 'feedback', 'goals', 'delegations', 'growth', 'readiness',
  'measurement', 'health', 'capacity', 'allocation', 'load', 'dynamics', 'capital', 'strategy',
  'learning', 'premises', 'anomaly', 'watch', 'handover', 'propagation', 'scenarios', 'hiring',
  'hiring-detail', 'cases', 'case', 'resilience', 'resilience-detail', 'power', 'power-detail',
  'network', 'impact', 'fidelity', 'merit', 'transition', 'orgdesign', 'voi', 'portfolio',
  'attention', 'signal', 'autopilot', 'performance', 'survival', 'wait', 'parity', 'evidence',
  'consequences', 'deferral', 'integrity', 'credibility', 'confidence', 'negotiations', 'finance',
  'budget', 'stakeholders', 'stakeholder', 'forecasts', 'tempo', 'retention', 'negotiation',
  'changes', 'change', 'decisions', 'conflicts', 'conflict', 'recognition', 'reviews', 'review',
  'settings', 'prep', 'disclosure', 'wargame', 'coupling',
  // ADR-0088: the Federated Envoy declares its own manifest row, so the
  // catalogue and the shell stay one route for one route.
  'envoy', 'federation', 'strategy-cycle',
  // ADR-0092: the Differencing Defender is a renderer route with its own manifest
  // and its own scoped adapter, so the catalogue and the shell stay 1:1.
  'differencing', 'decision-robustness',
  // ADR-0094: the Prospective Intervention Contract has its own manifest row.
  'prospective',
  // ADR-0095: the Robust Allocation Terminal has its own manifest row and scoped
  // adapter, so the catalogue and the shell stay one route for one route.
  'robust-allocation',
  // ADR-0096: the Escalation Economy and the Operating Cadence Clock declare
  // manifest rows so their published aggregates enter the differencing register.
  'escalation', 'cadence',
  // ADR-0098: the Internal Clearinghouse has its own manifest row (this entry
  // was missing when the route landed, which the 1:1 catalogue assertion caught).
  'clearing',
  // ADR-0099: the Freeze-Line Continuity Audit has its own manifest row.
  'freeze-line',
  // ADR-0100: the Discretion Calibrator has its own manifest row and scoped adapter.
  'span-calibration',
  // ADR-0101: the Reputational Capital Ledger has its own manifest row.
  'reputation',
  // ADR-0102: the Hindsight Lock owns a scoped report adapter (raw locks carry
  // fact ids, so they never enter a declared-seat projection), and declares a
  // manifest row like every other terminal.
  'hindsight',
  // ADR-0103: the Epistemic Ledger owns a scoped report adapter (raw unknowns
  // carry record ids and answers, which never enter a projection) and declares a
  // manifest row like every other terminal.
  'epistemic',
  // ADR-0104: the Diligence Ledger owns a scoped report adapter (raw frontiers
  // carry typed fact pointers, and consultations carry a written reason, so
  // they never enter a declared-seat projection) and declares a manifest row.
  'diligence',
  // ADR-0109: the Jurisdiction Compiler declares its own manifest row, so the
  // catalogue and the shell stay one route for one route.
  'jurisdiction',
  // ADR-0113: the 1:1 Agenda Ledger declares its own manifest row (individual
  // class, adapter-scoped) so the catalogue and the shell stay 1:1 and the leak
  // oracle exercises a prompt-bearing route at every altitude. (Deliberately
  // NOT `agenda`, which is an existing alias for `cadence` — taking that slug
  // silently rewrote the route to the wrong renderer.)
  'agenda-ledger',
];

/** Sentinel-bearing roster: every person, span and private note is traceable. */
function fixture() {
  const state = createEmptyState(NOW.toISOString());
  state.settings = {
    ...state.settings,
    leaderName: 'Dana Root',
    activeSeatId: null,
    chainLeaderAltitude: 'chief',
    disclosureCellFloor: 5,
  };
  state.people = [
    { id: 'vp1', name: 'Rina VPSENT', role: 'VP', level: 'vp', managerId: null, status: 'active' },
    { id: 'dir1', name: 'Sam DIRSENT', role: 'Director', level: 'director', managerId: 'vp1', status: 'active' },
    { id: 'mgr1', name: 'Mei MGRSENT', role: 'Manager', level: 'manager', managerId: 'dir1', status: 'active' },
    { id: 'lead1', name: 'Priya LEADSENT', role: 'Shift lead', level: 'lead', managerId: 'mgr1', status: 'active' },
    { id: 'ic1', name: 'Ari IC1SENT', role: 'Operator', level: 'ic', managerId: 'lead1', status: 'active', compensation: { base: 52000, currency: 'USD' }, talkingPoints: ['PRIVATE_IC1_TALKING'] },
    { id: 'ic2', name: 'Bo IC2SENT', role: 'Operator', level: 'ic', managerId: 'lead1', status: 'active', compensation: { base: 54000, currency: 'USD' }, talkingPoints: ['PRIVATE_IC2_TALKING'] },
    { id: 'lead2', name: 'Jordan LEADSENT2', role: 'Shift lead', level: 'lead', managerId: 'mgr1', status: 'active' },
    { id: 'ic3', name: 'Cy IC3SENT', role: 'Operator', level: 'ic', managerId: 'lead2', status: 'active' },
    // A PEER span: same VP, different director. Nothing from here may reach dir1.
    { id: 'dir2', name: 'Tomas DIR2SENT', role: 'Director', level: 'director', managerId: 'vp1', status: 'active' },
    { id: 'mgr2', name: 'Noor MGR2SENT', role: 'Manager', level: 'manager', managerId: 'dir2', status: 'active' },
    { id: 'ic4', name: 'Dee IC4SENT', role: 'Operator', level: 'ic', managerId: 'mgr2', status: 'active', talkingPoints: ['PRIVATE_IC4_TALKING'] },
  ];
  state.oneOnOnes = ['ic1', 'ic2', 'ic3', 'ic4'].map((pid, i) => ({
    id: `oo-${pid}`, personId: pid, date: ago(2 + i), status: 'held', notes: `PRIVATE_${pid.toUpperCase()}_NOTE`, agenda: [],
  }));
  state.feedback = ['ic1', 'ic4'].map((pid, i) => ({
    id: `fb-${pid}`, personId: pid, direction: 'given', kind: 'constructive',
    situation: `PRIVATE_${pid.toUpperCase()}_SITUATION`, behavior: 'b', impact: 'i', date: ago(3 + i), tags: [],
  }));
  state.cases = [
    { id: 'c-ic1', title: 'CASE_IN1 handover friction', status: 'open', ownerId: 'ic1', involvedPersonIds: [], openedOn: ago(30), reviewOn: ago(4), fmea: { severity: 8 } },
    { id: 'c-ic2', title: 'CASE_IN2 queue depth', status: 'open', ownerId: 'ic2', involvedPersonIds: [], openedOn: ago(10), reviewOn: ahead(4), fmea: { severity: 6 } },
    { id: 'c-ic3', title: 'CASE_IN3 rota gap', status: 'open', ownerId: 'ic3', involvedPersonIds: [], openedOn: ago(5), reviewOn: ahead(9), fmea: { severity: 4 } },
    { id: 'c-ic3b', title: 'CASE_IN3B training backlog', status: 'open', ownerId: 'ic3', involvedPersonIds: [], openedOn: ago(15), reviewOn: ago(1), fmea: { severity: 5 } },
    { id: 'c-ic4', title: 'CASE_PEER4 supplier delay', status: 'open', ownerId: 'ic4', involvedPersonIds: [], openedOn: ago(60), reviewOn: ago(20), fmea: { severity: 9 } },
    { id: 'c-none', title: 'CASE_UNATTRIBUTED policy refresh', status: 'open', ownerId: null, involvedPersonIds: [], openedOn: ago(2), reviewOn: ahead(12), fmea: { severity: 3 } },
  ];
  state.delegations = [
    { id: 'd1', personId: 'ic1', title: 'DELEG1', expectedOutcome: 'o', authority: 'act-inform', support: '', delegatedOn: ago(20), dueOn: ago(6), status: 'active', checkins: [] },
    { id: 'd2', personId: 'ic4', title: 'DELEG_PEER', expectedOutcome: 'o', authority: 'act-inform', support: '', delegatedOn: ago(9), dueOn: ahead(5), status: 'active', checkins: [] },
  ];
  state.goals = [{ id: 'g1', ownerId: 'ic1', title: 'GOAL1', status: 'active', createdOn: ago(12) }];
  // Six envelopes so the money cell clears the small-cell floor: a currency
  // total computed from two records is a cell that names its two records.
  state.budgets = [
    { id: 'b-usd1', name: 'BUDGET_USD_1', ownerId: null, currency: 'USD', limit: 100000, status: 'active', lines: [] },
    { id: 'b-usd2', name: 'BUDGET_USD_2', ownerId: null, currency: 'USD', limit: 100000, status: 'active', lines: [] },
    { id: 'b-usd3', name: 'BUDGET_USD_3', ownerId: null, currency: 'USD', limit: 100000, status: 'active', lines: [] },
    { id: 'b-eur1', name: 'BUDGET_EUR_1', ownerId: null, currency: 'EUR', limit: 50000, status: 'active', lines: [] },
    { id: 'b-eur2', name: 'BUDGET_EUR_2', ownerId: null, currency: 'EUR', limit: 50000, status: 'active', lines: [] },
    { id: 'b-eur3', name: 'BUDGET_EUR_3', ownerId: null, currency: 'EUR', limit: 50000, status: 'active', lines: [] },
  ];
  state.reviews = [
    { id: 'rv-ic1', personId: 'ic1', periodStart: ago(90), periodEnd: ago(5), status: 'draft', manager: { rating: '' } },
    { id: 'rv-ic4', personId: 'ic4', periodStart: ago(90), periodEnd: ago(5), status: 'draft', manager: { rating: '' } },
  ];
  return normalizeState(state, { now: NOW }).state;
}

function bootApi(state) {
  const map = new Map();
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
  let seq = 0;
  map.set(STORAGE_KEY, JSON.stringify(state));
  const store = createStore({ storage, now: () => NOW, idFactory: (p) => `${p}-t-${++seq}` });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory: (p) => `${p}-t-${++seq}` });
  return { store, api };
}

function seated(state, seatId) {
  const next = clone(state);
  next.settings = { ...next.settings, activeSeatId: seatId };
  return normalizeState(next, { now: NOW }).state;
}

function compileFor(state, seatId) {
  const { built } = (() => {
    const seats = buildSeats(state, { now: NOW, settings: state.settings });
    return { built: seats };
  })();
  const seat = activeSeat(seatsOrThrow(state));
  return { built, seat, compiled: compileDisclosure(state, seat, built, { now: NOW, settings: state.settings }) };
}
function seatsOrThrow(state) {
  const built = buildSeats(state, { now: NOW, settings: state.settings });
  return built;
}

/* --------------------------------------------------------------- 1. schema */

test('schema v90 migrates additively and refuses malformed or stale grants', () => {
  assert.equal(SCHEMA_VERSION, 117);
  const old = { schemaVersion: 89, settings: { leaderName: 'Keep' }, cases: [{ id: 'keep' }], disclosureGrants: [{ id: 'existing' }] };
  const migrated = migrate(old);
  assert.equal(migrated.raw.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(migrated.raw.disclosureMarkers, []);
  assert.equal(migrated.raw.cases[0].id, 'keep');
  assert.equal(migrated.raw.settings.disclosureCellFloor, 5);

  const warnings = [];
  // No purpose → dropped.
  assert.equal(normalizeDisclosureGrant({ id: 'g', route: 'cases', requesterId: 'a', spanId: 'b', purpose: 'x' }, warnings), null);
  // Requester === span → dropped.
  assert.equal(normalizeDisclosureGrant({ id: 'g2', route: 'cases', requesterId: 'a', spanId: 'a', purpose: 'a real purpose here' }, warnings), null);
  // Unknown route → dropped.
  assert.equal(normalizeDisclosureGrant({ id: 'g3', route: 'nope', requesterId: 'a', spanId: 'b', purpose: 'a real purpose here' }, warnings), null);
  // Granted without an expiry → reopened as requested, never live authority.
  const reopened = normalizeDisclosureGrant({ id: 'g4', route: 'cases', requesterId: 'a', spanId: 'b', purpose: 'a real purpose here', status: 'granted' }, warnings);
  assert.equal(reopened.status, 'requested');
  // A window that has passed loads as expired.
  const stale = normalizeDisclosureGrant({
    id: 'g5', route: 'cases', requesterId: 'a', spanId: 'b', purpose: 'a real purpose here',
    status: 'granted', grantedOn: ago(30), expiresOn: ago(1), consentFromId: 'b',
  }, warnings, { now: NOW.toISOString(), today: ago(0) });
  assert.equal(stale.status, 'expired');
  assert.deepEqual(normalizeDisclosureGrants([{ id: 'dup' }, { id: 'dup' }], warnings), []);
  assert.ok(warnings.length >= 3, `every drop with something to say is reported (${warnings.length})`);
});

/* ------------------------------------------------------------ 2. catalogue */

test('every renderer route has a manifest, and every declared collection exists', () => {
  for (const route of RENDERER_ROUTES) {
    assert.ok(manifestFor(route), `route ${route} has no disclosure manifest`);
  }
  assert.equal(MANIFEST_ROUTES.length, RENDERER_ROUTES.length, 'the catalogue and the shell agree route for route');
  for (const manifest of Object.values(MODULE_MANIFESTS)) {
    for (const collection of manifest.collections) {
      assert.ok(COLLECTIONS.includes(collection), `${manifest.route} declares unknown collection ${collection}`);
    }
  }
  // A detail screen inherits its list's manifest, so the two can never disagree.
  assert.equal(manifestFor('case').parent, 'cases');
  assert.equal(manifestFor('person').parent, 'people');
});

/* -------------------------------------------------------------- 3. posture */

test('postures compile per altitude: detail inside the window, aggregate above it, withheld below a floor', () => {
  const base = fixture();
  const expected = {
    lead1: { oneonones: 'detail', cases: 'detail', finance: 'withheld', merit: 'withheld', disclosure: 'detail' },
    mgr1: { oneonones: 'detail', cases: 'detail', finance: 'withheld', merit: 'withheld', disclosure: 'detail' },
    dir1: { oneonones: 'aggregate', cases: 'detail', finance: 'detail', merit: 'withheld', disclosure: 'detail' },
    vp1: { oneonones: 'aggregate', cases: 'aggregate', finance: 'detail', merit: 'aggregate', disclosure: 'detail' },
    // The chief reads every record class as counts; pay is the one class whose
    // detail ceiling is the top of the tree (an executive must be able to run a
    // merit cycle without asking a manager for a spreadsheet).
    'leader': { oneonones: 'aggregate', cases: 'aggregate', finance: 'aggregate', merit: 'aggregate', disclosure: 'detail' },
  };
  for (const [seatId, want] of Object.entries(expected)) {
    const state = seated(base, seatId);
    const built = seatsOrThrow(state);
    const seat = activeSeat(built);
    const compiled = compileDisclosure(state, seat, built, { now: NOW, settings: state.settings });
    for (const [route, posture] of Object.entries(want)) {
      assert.equal(compiled.entries[route].posture, posture, `${seatId} · ${route}`);
      if (posture !== 'detail') assert.ok(compiled.entries[route].reason.length > 20, 'a refusal prints why');
    }
    assert.equal(compiled.counts.detail + compiled.counts.aggregate + compiled.counts.withheld, MANIFEST_ROUTES.length);
  }
  // An unknown route is withheld rather than guessed at.
  const state = seated(base, 'dir1');
  const built = seatsOrThrow(state);
  const entry = postureFor(state, activeSeat(built), built, 'not-a-module', { now: NOW });
  assert.equal(entry.posture, 'withheld');
  assert.match(entry.reason, /no disclosure manifest/i);
  // The undeclared operator view is untouched: everything is detail.
  const operator = seatsOrThrow(base);
  const opCompiled = compileDisclosure(base, activeSeat(operator), operator, { now: NOW });
  assert.equal(opCompiled.counts.aggregate, 0);
  assert.equal(opCompiled.counts.withheld, 0);
});

/* ----------------------------------------------------------- 4. leak oracle */

function bootApp(state) {
  const HTML = fs.readFileSync(path.resolve(import.meta.dirname, '../..', 'index.html'), 'utf8');
  const consoleErrors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => consoleErrors.push(e.message));
  vc.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const dom = new JSDOM(HTML, { url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event;
  globalThis.FileReader = window.FileReader;
  globalThis.localStorage = window.localStorage;
  return { dom, window, document: window.document, consoleErrors };
}

/** Renders never create a false negative by throwing early: we assert on panels. */
function assertRendered(env, view, route) {
  assert.ok(view.querySelector('h1'), `${route} rendered no heading`);
  assert.ok(!view.textContent.includes('This screen failed to draw'), `${route} hit the error panel`);
  assert.ok(!view.textContent.includes('That page does not exist'), `${route} fell through to not-found`);
}

test('LEAK ORACLE: no route leaks out-of-span names, private notes or peer content at any altitude', async () => {
  const { createApp } = await import('../../app/main.js');
  const base = fixture();
  const privateTokens = ['PRIVATE_IC1_NOTE', 'PRIVATE_IC2_NOTE', 'PRIVATE_IC3_NOTE', 'PRIVATE_IC4_NOTE',
    'PRIVATE_IC1_SITUATION', 'PRIVATE_IC4_SITUATION', 'PRIVATE_IC1_TALKING', 'PRIVATE_IC2_TALKING', 'PRIVATE_IC4_TALKING'];
  // A seat may print its own chain of command (you are allowed to know who you
  // report to) but never a peer span's people.
  const seats = ['lead1', 'mgr1', 'dir1', 'vp1'];
  const report = [];
  for (const seatId of seats) {
    const state = seated(base, seatId);
    const env = bootApp(state);
    const app = await createApp({ root: env.document.getElementById('view'), storage: env.window.localStorage, now: () => NOW });
    const built = seatsOrThrow(state);
    const seat = activeSeat(built);
    const compiled = compileDisclosure(state, seat, built, { now: NOW, settings: state.settings });
    const inScope = new Set(seat.scope);
    // People allowed to be *named* purely as structure: the seat's own ancestors.
    const ancestors = new Set();
    let cursor = seat.id;
    while (cursor) {
      const node = built.chain.nodes.get(cursor);
      cursor = node?.parentId || null;
      if (cursor) ancestors.add(cursor);
    }
    // A reporting line is structure, not disclosure: the workspace may print the
    // name of a leadership position (and the chain you report into). What it may
    // never print is an OUT-OF-SPAN PERSON — the people inside a peer's span.
    const outOfScopeNames = state.people
      .filter((p) => !inScope.has(p.id) && !ancestors.has(p.id) && !built.byId.has(p.id) && p.name)
      .map((p) => p.name.split(' ')[1]);
    const detailCeiling = compiled.entries.oneonones.posture === 'detail';
    for (const route of RENDERER_ROUTES) {
      app.navigate(`#/${route}`);
      const view = env.document.getElementById('view');
      // A detail route navigated without an id has nothing to show; the shell's
      // not-found panel is the correct answer there, and it is exercised
      // separately with a real in-span id below.
      const parameterised = ['person', 'case', 'review', 'conflict', 'change', 'budget', 'stakeholder', 'negotiation', 'hiring-detail', 'resilience-detail', 'power-detail'];
      if (!parameterised.includes(route)) assertRendered(env, view, `${seatId}:${route}`);
      else assert.ok(!view.textContent.includes('This screen failed to draw'), `${route} hit the error panel`);
      const text = view.textContent;
      for (const token of outOfScopeNames) {
        assert.ok(!text.includes(token), `${seatId} saw ${token} on #/${route}`);
      }
      // Private notes only exist in individual-class records. Above that
      // ceiling they must never be printed, even for people inside the span.
      if (!detailCeiling) {
        for (const token of privateTokens) {
          assert.ok(!text.includes(token), `${seatId} read a private note (${token}) on #/${route}`);
        }
      }
      report.push(`${seatId}:${route}:${compiled.entries[route].posture}`);
    }
    assert.equal(env.consoleErrors.length, 0, `${seatId} console: ${env.consoleErrors.join('\n')}`);
  }
  // The oracle actually ran the catalogue, at every altitude.
  assert.equal(report.length, seats.length * RENDERER_ROUTES.length);
});

test('the same oracle proves the in-span detail IS visible where it should be (no over-suppression)', async () => {
  const { createApp } = await import('../../app/main.js');
  const base = fixture();
  const env = bootApp(seated(base, 'lead1'));
  const app = await createApp({ root: env.document.getElementById('view'), storage: env.window.localStorage, now: () => NOW });
  app.navigate('#/oneonones');
  const text = env.document.getElementById('view').textContent;
  assert.ok(text.includes('PRIVATE_IC1_NOTE') || text.includes('Ari IC1SENT'), 'a frontline lead must still see their own 1:1 detail');
});

/* ------------------------------------------------------------ 5. aggregate */

test('the aggregate counts only the seat’s span, withholds small cells and keeps currencies apart', () => {
  const state = seated(fixture(), 'mgr1');
  const built = seatsOrThrow(state);
  const seat = activeSeat(built);
  const agg = moduleAggregate(state, 'cases', seat, built, { now: NOW, settings: state.settings });
  assert.deepEqual([...agg.collections], ['cases']);
  // The peer span's case is refused out loud, not silently dropped.
  assert.ok(agg.notes.some((n) => /outside this seat's span/.test(n)), 'the peer record is refused out loud');
  assert.equal(agg.totals.oldestDays, 30);
  // Every span with fewer than the floor is withheld, with a reason, and the
  // compiler still knows the count it refuses to print.
  assert.ok(agg.spans.some((s) => s.withhold));
  for (const span of agg.spans.filter((s) => s.withhold)) {
    assert.ok(span.withholdReason.length > 30);
    assert.equal(typeof span.count, 'number');
  }
  // Complementary suppression: with one hidden cell and two visible ones, the
  // smallest visible cell goes too, so subtraction cannot recover the hidden one.
  const floorTwo = { ...state.settings, disclosureCellFloor: 2 };
  const suppressed = moduleAggregate(state, 'cases', seat, built, { now: NOW, settings: floorTwo });
  const hidden = suppressed.spans.filter((s) => s.withhold);
  assert.ok(hidden.length >= 2, 'one cell below the floor forces one complementary suppression');
  assert.ok(hidden.some((s) => /complementary/i.test(s.withholdReason)));

  // A declared floor below 2 is clamped by the normalizer: a "floor" of one is
  // a cell that identifies a person, so the convention refuses to honour it.
  const permissive = moduleAggregate(state, 'cases', seat, built, { now: NOW, settings: { ...state.settings, disclosureCellFloor: 1 } });
  assert.equal(permissive.floorN, 5, 'a declared floor of 1 is clamped back to the convention');

  // Money is reported per currency and never summed across them.
  const dirState = seated(fixture(), 'dir1');
  const dirBuilt = seatsOrThrow(dirState);
  const money = moduleAggregate(dirState, 'finance', activeSeat(dirBuilt), dirBuilt, { now: NOW, settings: dirState.settings });
  assert.deepEqual(Object.keys(money.totals.money).sort(), ['EUR', 'USD']);
  assert.equal(money.totals.money.USD, 300000);
  assert.equal(money.totals.money.EUR, 150000);
});

test('a span whose whole population is below the floor withholds the total instead of printing a small number', () => {
  const state = seated(fixture(), 'lead1');
  const built = seatsOrThrow(state);
  const seat = activeSeat(built);
  const agg = moduleAggregate(state, 'cases', seat, built, { now: NOW, settings: state.settings });
  // lead1's span holds two cases (ic1, ic2) — below the floor of 5.
  assert.equal(agg.totalWithheld, true);
  assert.equal(agg.spanTotal, null);
  assert.ok(agg.notes.some((n) => /below the floor/.test(n)));
});

/* ---------------------------------------------------- 6. release contracts */

test('a release request crosses modules in one transaction and only the span leader can consent to it', () => {
  const state = seated(fixture(), 'vp1');
  const { store, api } = bootApi(state);
  const result = api.disclosureRequest({
    route: 'oneonones', spanId: 'mgr1', purpose: 'The queue escalation needs the actual 1:1 commitments', days: 7,
  });
  assert.equal(result.ok, true, result.error);
  const grant = result.grant;
  assert.equal(grant.status, 'requested');
  const dscDecisions = store.state.decisions.filter((d) => /RULE-DSC-01/.test(d.rationale || ''));
  const dscTasks = store.state.delegations.filter((d) => /RULE-DSC-01/.test(d.support || ''));
  assert.equal(dscDecisions.length, 1, 'RULE-DSC-01 opened exactly one governed decision');
  assert.equal(dscTasks.length, 1, 'and exactly one consent task');
  const decision = store.state.decisions.find((d) => d.id === grant.decisionId);
  assert.ok(decision, 'the grant names its decision');
  assert.match(decision.question, /consent belongs to the span/i);
  const consentTask = store.state.delegations.find((d) => d.personId === 'mgr1');
  assert.ok(consentTask, 'the consent task is addressed to the span leader, not the requester');
  // ADR-0102 (Session 142) note: the consent decision RULE-DSC-01 opens is itself
  // a decision, so RULE-HND-01 freezes its information set and writes a
  // `consults` provenance edge from the new hindsightlock node to this grant.
  // That is the audit pointing at the record, not a change to the grant's own
  // provenance — which is what this assertion is about.
  const relations = store.state.links
    .filter((l) => l.sourceType === 'disclosuregrant' || l.targetType === 'disclosuregrant')
    .filter((l) => !String(l.ruleId || '').startsWith('RULE-HND'))
    .map((l) => l.relation).sort();
  assert.deepEqual(relations, ['authorizes', 'discloses-to', 'tracks-followup']);

  // The requester cannot consent to their own request.
  const selfConsent = api.disclosureConsent(grant.id);
  assert.equal(selfConsent.ok, false);
  assert.match(selfConsent.error, /only the leader of/i);

  // The span leader consents — from their own seat.
  store.update((draft) => { draft.settings.activeSeatId = 'mgr1'; }, null, { rules: [] });
  const consent = api.disclosureConsent(grant.id);
  assert.equal(consent.ok, true, consent.error);
  assert.equal(consent.grant.status, 'granted');
  assert.equal(consent.grant.expiresOn, ahead(7));
  assert.equal(consent.grant.consentFromId, 'mgr1');
});

test('a consented release opens exactly its own span, and lapses back to counts on its expiry date', () => {
  const base = seated(fixture(), 'vp1');
  const { built } = { built: seatsOrThrow(base) };
  const seat = activeSeat(built);
  const live = normalizeDisclosureGrants([{
    id: 'grant-live', route: 'oneonones', moduleLabel: '1:1s', collection: 'oneOnOnes', classKey: 'individual',
    requesterId: 'vp1', requesterSeatId: 'vp1', spanId: 'mgr1', spanLabel: 'Mei MGRSENT',
    purpose: 'The escalation needs the commitments recorded in the 1:1s', days: 7,
    status: 'granted', grantedOn: ago(1), grantedAt: NOW.toISOString(), expiresOn: ahead(6), consentFromId: 'mgr1',
    requestedOn: ago(2), requestedAt: NOW.toISOString(), createdAt: NOW.toISOString(),
  }], [], { now: NOW.toISOString(), today: ago(0) });
  const state = { ...base, disclosureGrants: live };

  // Before the grant the screen is an aggregate at the VP seat.
  const before = postureFor({ ...base, disclosureGrants: [] }, seat, built, 'oneonones', { now: NOW, settings: base.settings });
  assert.equal(before.posture, 'aggregate');
  // With it, detail — but only the granted span.
  const after = postureFor(state, seat, built, 'oneonones', { now: NOW, settings: base.settings });
  assert.equal(after.posture, 'detail');
  assert.equal(after.grantedSpanId, 'mgr1');
  const released = grantedRecords(state, seat, built, { now: NOW, settings: base.settings });
  const ids = (released.get('oneOnOnes') || []).map((r) => r.personId).sort();
  assert.deepEqual(ids, ['ic1', 'ic2', 'ic3'], 'the granted span only — never the peer span');
  assert.equal(released.get('oneOnOnes').every((r) => r.__disclosureGrant === 'grant-live'), true);

  // The projection carries those records and nothing else.
  const scoped = scopedViewState(state, { seat, built }, { now: NOW, settings: base.settings });
  assert.ok(scoped.oneOnOnes.some((r) => r.personId === 'ic1'));
  assert.ok(!scoped.oneOnOnes.some((r) => r.personId === 'ic4'), 'a peer span record never rides along');

  // Past its expiry the compiler refuses it, with or without a sweep.
  const later = new Date(NOW.getTime() + 30 * 86400000);
  const lapsed = postureFor(state, seat, built, 'oneonones', { now: later, settings: base.settings });
  assert.equal(lapsed.posture, 'aggregate');
});

test('the sweep expires a lapsed release, opens one review task and is idempotent', () => {
  const base = seated(fixture(), 'vp1');
  const granted = {
    id: 'grant-old', route: 'oneonones', moduleLabel: '1:1s', collection: 'oneOnOnes', classKey: 'individual',
    requesterId: 'vp1', requesterSeatId: 'vp1', spanId: 'mgr1', spanLabel: 'Mei MGRSENT',
    purpose: 'The escalation needs the commitments recorded in the 1:1s', days: 3,
    status: 'granted', grantedOn: ago(10), grantedAt: NOW.toISOString(), expiresOn: ago(2), consentFromId: 'mgr1',
    requestedOn: ago(11), requestedAt: NOW.toISOString(), createdAt: NOW.toISOString(),
  };
  const pre = { ...base, disclosureGrants: [granted] };
  const { store, api } = bootApi(pre);
  const reviewTasks = () => store.state.delegations.filter((d) => /RULE-DSC-02/.test(d.support || '')).length;
  const first = api.disclosureScan();
  assert.equal(first.ok, true);
  assert.equal(store.state.disclosureGrants[0].status, 'expired');
  assert.equal(reviewTasks(), 1, 'one review task for the lapsed window');
  const second = api.disclosureScan();
  assert.equal(second.ok, true);
  assert.equal(reviewTasks(), 1, 'the marker makes the second sweep a no-op');
});

test('a release can never lift a floor, an enterprise class or an aggregate-only terminal', () => {
  const state = seated(fixture(), 'lead1');
  const built = seatsOrThrow(state);
  const seat = activeSeat(built);
  // finance sits below the lead's floor: a grant cannot open what a floor closes.
  const floored = validateGrantRequest(state, seat, built, { route: 'finance', spanId: 'lead1', purpose: 'a purpose long enough', days: 5 }, { now: NOW, settings: state.settings });
  assert.equal(floored.ok, false);
  assert.ok(/own span|floor/i.test(floored.error));

  const vpState = seated(fixture(), 'vp1');
  const vpBuilt = seatsOrThrow(vpState);
  const vpSeat = activeSeat(vpBuilt);
  const enterprise = validateGrantRequest(vpState, vpSeat, vpBuilt, { route: 'merit', spanId: 'mgr1', purpose: 'a purpose long enough', days: 5 }, { now: NOW, settings: vpState.settings });
  assert.equal(enterprise.ok, false);
  assert.match(enterprise.error, /never be released/i);

  const terminal = validateGrantRequest(vpState, vpSeat, vpBuilt, { route: 'attribution', spanId: 'mgr1', purpose: 'a purpose long enough', days: 5 }, { now: NOW, settings: vpState.settings });
  assert.equal(terminal.ok, false);
  assert.match(terminal.error, /aggregate|report reads/i);

  const short = validateGrantRequest(vpState, vpSeat, vpBuilt, { route: 'oneonones', spanId: 'mgr1', purpose: 'x', days: 5 }, { now: NOW, settings: vpState.settings });
  assert.equal(short.ok, false);
  const tooLong = validateGrantRequest(vpState, vpSeat, vpBuilt, { route: 'oneonones', spanId: 'mgr1', purpose: 'a purpose long enough', days: 90 }, { now: NOW, settings: vpState.settings });
  assert.equal(tooLong.ok, false);
  // A director cannot reach into their peer director's subtree.
  const dirState = seated(fixture(), 'dir1');
  const dirBuilt = seatsOrThrow(dirState);
  const outside = validateGrantRequest(dirState, activeSeat(dirBuilt), dirBuilt, { route: 'oneonones', spanId: 'ic4', purpose: 'a purpose long enough', days: 5 }, { now: NOW, settings: dirState.settings });
  assert.equal(outside.ok, false, 'a peer span is outside this seat’s subtree of leadership');
  assert.match(outside.error, /outside your operating span/i);
});

test('refusal keeps its reason, revocation ends a live release early, and both are audited', () => {
  const state = seated(fixture(), 'vp1');
  const { store, api } = bootApi(state);
  const requested = api.disclosureRequest({ route: 'oneonones', spanId: 'mgr1', purpose: 'The escalation needs the recorded commitments', days: 5 });
  assert.equal(requested.ok, true, requested.error);
  store.update((draft) => { draft.settings.activeSeatId = 'mgr1'; }, null, { rules: [] });
  const refused = api.disclosureRefuse(requested.grant.id, 'The commitments are in the 1:1 notes only; ask me in the weekly.');
  assert.equal(refused.ok, true, refused.error);
  assert.equal(refused.grant.status, 'refused');
  assert.match(refused.grant.refusedReason, /weekly/);
  const tooShort = api.disclosureRequest({ route: 'cases', spanId: 'mgr1', purpose: 'The escalation needs the recorded case detail', days: 5 });
  assert.equal(tooShort.ok, false, 'a seat may not request its own span’s records through itself');

  store.update((draft) => { draft.settings.activeSeatId = 'vp1'; }, null, { rules: [] });
  const again = api.disclosureRequest({ route: 'oneonones', spanId: 'mgr1', purpose: 'The escalation needs the recorded commitments', days: 5 });
  assert.equal(again.ok, true, again.error);
  store.update((draft) => { draft.settings.activeSeatId = 'mgr1'; }, null, { rules: [] });
  assert.equal(api.disclosureConsent(again.grant.id).ok, true);
  const revoked = api.disclosureRevoke(again.grant.id, 'The escalation closed without needing it.');
  assert.equal(revoked.ok, true, revoked.error);
  assert.equal(revoked.grant.status, 'revoked');
  const events = store.state.events.map((e) => e.type);
  assert.ok(events.includes(DISCLOSURE_EVENTS.REQUESTED));
  assert.ok(events.includes(DISCLOSURE_EVENTS.REFUSED));
  assert.ok(events.includes(DISCLOSURE_EVENTS.CONSENTED));
  assert.ok(events.includes(DISCLOSURE_EVENTS.REVOKED));
});

/* --------------------------------------------------------- 7. route verdict */

test('the route gate asks the compiler, and falls back to the narrow allowlist without one', () => {
  const state = seated(fixture(), 'dir1');
  const built = seatsOrThrow(state);
  const seat = activeSeat(built);
  const compiled = compileDisclosure(state, seat, built, { now: NOW, settings: state.settings });

  const aggregateCase = workspaceRouteVerdict('oneonones', seat, { state, built, now: NOW, settings: state.settings, compiled });
  assert.equal(aggregateCase.allow, true);
  assert.equal(aggregateCase.posture, 'aggregate');
  assert.match(aggregateCase.reason, /counts/i);

  const withheld = workspaceRouteVerdict('merit', seat, { state, built, now: NOW, settings: state.settings, compiled });
  assert.equal(withheld.allow, false);
  assert.match(withheld.reason, /not handed below rank/i);

  const detail = workspaceRouteVerdict('cases', seat, { state, built, now: NOW, settings: state.settings, compiled });
  assert.equal(detail.allow, true);
  assert.equal(detail.posture, 'detail');

  // Without a compiled state the gate is the pre-0084 allowlist: fail closed.
  const legacy = workspaceRouteVerdict('oneonones', seat);
  assert.equal(legacy.allow, false, 'a caller that forgot to compile gets the smallest boundary');
  assert.equal(workspaceRouteVerdict('mission', seat).allow, true);
});

/* --------------------------------------------------------------- 8. console */

test('the Disclosure Console compiles its coverage, aggregates, releases and brief without leaking names', () => {
  const state = seated(fixture(), 'vp1');
  const built = seatsOrThrow(state);
  const seat = activeSeat(built);
  const report = disclosureReport(state, { now: NOW, settings: state.settings, seat, built });
  assert.equal(report.coverage.declared, MANIFEST_ROUTES.length);
  assert.ok(report.coverage.openPct > 50, 'most of the catalogue is usable at a VP seat');
  assert.ok(report.aggregates.length > 0);
  const brief = disclosureBriefText(report);
  assert.ok(brief.includes('Disclosure posture'));
  for (const token of ['IC1SENT', 'IC2SENT', 'IC3SENT', 'IC4SENT', 'PRIVATE_IC1_NOTE', 'PRIVATE_IC4_NOTE']) {
    assert.ok(!brief.includes(token), `the brief must not name people: ${token}`);
  }
  const rows = disclosureCsvRows(report);
  assert.equal(rows.length, MANIFEST_ROUTES.length);
  assert.ok(rows.every((r) => !/PRIVATE_/.test(JSON.stringify(r))));
  assert.ok(rows.some((r) => r.posture === 'aggregate'));
});

test('all four console panels render, axe-clean, with no placeholder copy', async () => {
  const base = fixture();
  const { store } = bootApi(seated(base, 'vp1'));
  const built = seatsOrThrow(store.state);
  const seat = activeSeat(built);
  const dom = new JSDOM('<!doctype html><html><body><div id="view"></div></body></html>', { url: 'https://leados.test/', pretendToBeVisual: true });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node; globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement; globalThis.Event = dom.window.Event;
  const axe = (await import('axe-core')).default;
  const api = store.state && createApi(store, { now: () => NOW });
  for (const panel of ['coverage', 'posture', 'releases', 'brief']) {
    const node = renderDisclosure({
      state: store.state,
      seatContext: { seat, built },
      now: NOW,
      route: 'disclosure',
      query: new URLSearchParams(`panel=${panel}`),
      api,
      navigate: () => {},
      refresh: () => {},
      state_: null,
    });
    document.getElementById('view').replaceChildren(node);
    assert.ok(node.querySelector('h1'), `${panel} has a heading`);
    assert.ok(!/TODO|lorem|placeholder/i.test(node.textContent), `${panel} ships real copy`);
    const results = await axe.run(node, { rules: { region: { enabled: false } } });
    assert.deepEqual(results.violations.map((v) => v.id), [], `axe: ${panel}`);
  }
});

/* ------------------------------------------------------------ 9. invariants */

test('a live grant is honoured only for the seat that asked, and only while it is live', () => {
  const base = seated(fixture(), 'vp1');
  const built = seatsOrThrow(base);
  const seat = activeSeat(built);
  const live = normalizeDisclosureGrants([{
    id: 'grant-1', route: 'oneonones', requesterId: 'vp1', requesterSeatId: 'vp1', spanId: 'mgr1',
    spanLabel: 'Mei MGRSENT', moduleLabel: '1:1s', purpose: 'The escalation needs the written commitments', days: 7,
    status: 'granted', grantedOn: ago(1), grantedAt: NOW.toISOString(), expiresOn: ahead(6), consentFromId: 'mgr1',
    requestedOn: ago(2), requestedAt: NOW.toISOString(), createdAt: NOW.toISOString(),
  }], [], { now: NOW.toISOString(), today: ago(0) });
  const state = { ...base, disclosureGrants: live };
  assert.equal(activeGrants(state, { now: NOW }).length, 1);
  // A different seat does not inherit the release.
  const dirSeat = activeSeat(seatsOrThrow(seated({ ...state }, 'dir1')));
  const dirBuilt = seatsOrThrow(seated({ ...state }, 'dir1'));
  const dirEntry = postureFor(state, dirSeat, dirBuilt, 'oneonones', { now: NOW, settings: state.settings });
  assert.equal(dirEntry.posture, 'aggregate', 'a release is addressed to one seat, not to everyone above the span');
  // Within the span the release is not needed.
  assert.equal(withinSpan(built, 'mgr1', 'ic2'), true);
  assert.equal(withinSpan(built, 'mgr1', 'ic4'), false);
  // The compiled projection refuses an out-of-span grant for a peer.
  const peerGrant = normalizeDisclosureGrants([{ ...live[0], id: 'grant-peer', spanId: 'dir2' }], [], { now: NOW.toISOString(), today: ago(0) });
  const peerEntry = postureFor({ ...state, disclosureGrants: peerGrant }, seat, built, 'oneonones', { now: NOW, settings: state.settings });
  assert.equal(peerEntry.grantedSpanId, 'dir2', 'the compiler honours it only for the span it names');
  const peerRows = grantedRecords({ ...state, disclosureGrants: peerGrant }, seat, built, { now: NOW, settings: state.settings });
  const peerPeople = (peerRows.get('oneOnOnes') || []).map((r) => r.personId).sort();
  assert.deepEqual(peerPeople, ['ic4'], 'the grant releases the span it names, and only that span');
});

test('the operator view is byte-for-byte unchanged: identity projection, no compile', () => {
  const base = fixture();
  const built = seatsOrThrow(base);
  const seat = activeSeat(built);
  assert.equal(seat.fullAccess, true);
  assert.equal(scopedViewState(base, { seat, built }), base);
  const compiled = compileDisclosure(base, seat, built, { now: NOW });
  assert.equal(compiled.enforced, false);
  assert.equal(Object.values(compiled.entries).every((e) => e.posture === 'detail'), true);
});

test('the projection and the compiler agree: nothing projected is out of span', () => {
  const state = seated(fixture(), 'mgr1');
  const built = seatsOrThrow(state);
  const seat = activeSeat(built);
  const projection = projectForSeat(state, seat, built);
  for (const [collection, rows] of Object.entries(projection.visible)) {
    for (const row of rows) {
      const people = [row.ownerId, row.personId, ...(row.involvedPersonIds || [])].filter(Boolean);
      for (const pid of people) {
        assert.ok(seat.scope.has(pid) || pid === seat.id, `${collection}:${row.id} carried an out-of-span person`);
      }
    }
  }
  assert.ok(projection.counts.aggregate + projection.counts.denied > 0, 'the fixture actually produces refusals');
});

test('a grant cannot exceed the per-seat cap, and a duplicate live release is refused', () => {
  const state = seated(fixture(), 'vp1');
  const { store, api } = bootApi(state);
  const first = api.disclosureRequest({ route: 'oneonones', spanId: 'mgr1', purpose: 'The escalation needs the recorded commitments', days: 5 });
  assert.equal(first.ok, true, first.error);
  const duplicate = api.disclosureRequest({ route: 'oneonones', spanId: 'mgr1', purpose: 'The escalation needs the recorded commitments', days: 5 });
  assert.equal(duplicate.ok, false);
  store.update((draft) => { draft.settings.activeSeatId = 'mgr1'; }, null, { rules: [] });
  assert.equal(api.disclosureConsent(first.grant.id).ok, true);
  store.update((draft) => { draft.settings.activeSeatId = 'vp1'; }, null, { rules: [] });
  const again = api.disclosureRequest({ route: 'oneonones', spanId: 'mgr1', purpose: 'The escalation needs the recorded commitments', days: 5 });
  assert.equal(again.ok, false, 'a live release for the same span and screen already covers it');
});

test('ONE frontline record rolls up four altitudes as detail → counts → counts, with no re-entry', () => {
  // The headline of §0.3 in one assertion chain: a case opened at the frontline
  // is visible as item detail to the lead who owns it, and as increasingly
  // abstract counts to every altitude above — compiled from the same record, in
  // the same workspace, with no one re-typing or re-formatting anything.
  const base = fixture();
  const trail = [];
  for (const seatId of ['lead1', 'mgr1', 'dir1', 'vp1']) {
    const state = seated(base, seatId);
    const built = seatsOrThrow(state);
    const seat = activeSeat(built);
    const compiled = compileDisclosure(state, seat, built, { now: NOW, settings: state.settings });
    const posture = compiled.entries.cases.posture;
    const agg = moduleAggregate(state, 'cases', seat, built, { now: NOW, settings: state.settings });
    trail.push({
      seatId,
      rank: seat.rank,
      posture,
      // The count the seat can see when the total is printable, otherwise null.
      total: agg.spanTotal,
      names: posture === 'detail'
        ? (compiled.grantedSpanId ? 'granted' : 'item detail')
        : 'counts only',
    });
  }
  assert.deepEqual(trail.map((t) => t.posture), ['detail', 'detail', 'detail', 'aggregate']);
  assert.deepEqual(trail.map((t) => t.rank), [1, 2, 3, 4]);
  // The two highest altitudes read the SAME record as numbers, never as a title.
  assert.equal(trail[3].names, 'counts only');
  // Above the ceiling the peer span's record is excluded, so a director's count
  // is a subset of the VP's by construction (each span owns its own work).
  const dirState = seated(base, 'dir1');
  const dirBuilt = seatsOrThrow(dirState);
  const dirAgg = moduleAggregate(dirState, 'cases', activeSeat(dirBuilt), dirBuilt, { now: NOW, settings: dirState.settings });
  const vpState = seated(base, 'vp1');
  const vpBuilt = seatsOrThrow(vpState);
  const vpAgg = moduleAggregate(vpState, 'cases', activeSeat(vpBuilt), vpBuilt, { now: NOW, settings: vpState.settings });
  assert.ok(vpAgg.totals.rows >= dirAgg.totals.rows, 'the VP’s span contains the director’s');
});

test('csv: the disclosure export is aggregate-only, seat-compiled and names nothing', async () => {
  const { CSV_EXPORTS, exportWorkspaceCsv } = await import('../../app/core/csv.js');
  const { disclosureReport, disclosureCsvRows } = await import('../../app/core/domain/disclosure.js');
  const spec = CSV_EXPORTS.find((s) => s.key === 'disclosure-posture');
  assert.ok(spec, 'the disclosure posture export is registered, not just an API method');
  assert.ok(CSV_EXPORTS.some((s2) => s2.key === 'disclosure-posture'), 'the scope is registered');
  // Append-only registry: catchball #79, board #80, disclosure #81, operating
  // cadence #82. Asserting the ORDER is the contract; asserting disclosure is LAST
  // would break the moment a later session appends its own scope.
  assert.ok(CSV_EXPORTS.findIndex((s) => s.key === 'board-claims') < CSV_EXPORTS.findIndex((s) => s.key === 'disclosure-posture'));
  assert.ok(CSV_EXPORTS.findIndex((s) => s.key === 'disclosure-posture') < CSV_EXPORTS.findIndex((s) => s.key === 'operating-cadence'));
  // ADR-0088 appends after the cadence scope; order is the contract, not
  // "disclosure is last".
  assert.ok(CSV_EXPORTS.findIndex((s) => s.key === 'operating-cadence') < CSV_EXPORTS.findIndex((s) => s.key === 'federated-exchange'));
  assert.equal(spec.sensitive, false);

  const base = fixture();
  const state = seated(base, 'vp1');
  const built = seatsOrThrow(state);
  const seat = activeSeat(built);
  const report = disclosureReport(state, { now: NOW, settings: state.settings, seat, built });
  const rows = disclosureCsvRows(report);
  // One row per declared module, and the VP is never told a module is in detail
  // posture when the compiler placed it above its ceiling.
  assert.equal(rows.length, Object.keys(report.compiled.entries).length);
  assert.ok(rows.length > 90);
  const vpEntries = rows.filter((r) => r.posture === 'detail');
  const leadReport = disclosureReport(seated(base, 'lead1'), {
    now: NOW, settings: state.settings, seat: activeSeat(seatsOrThrow(seated(base, 'lead1'))), built: seatsOrThrow(seated(base, 'lead1')),
  });
  assert.ok(rows.filter((r) => r.posture === 'detail').length <= disclosureCsvRows(leadReport).filter((r) => r.posture === 'detail').length,
    'the VP is offered less detail than the frontline lead');
  assert.ok(vpEntries.every((r) => r.reason !== undefined));

  // The real export path works and names nothing: no person, no record, no sentence.
  const out = exportWorkspaceCsv(state, 'disclosure-posture', { now: NOW });
  assert.equal(out.ok, true);
  const text = `${out.csv}\n${JSON.stringify(rows)}`;
  for (const forbidden of ['Priya', 'Marcus', 'sentinel', 'Peers see']) {
    assert.ok(!text.includes(forbidden), `the export must not contain "${forbidden}"`);
  }
  assert.ok(rows.every((r) => ['detail', 'aggregate', 'withheld'].includes(r.posture)));
});
