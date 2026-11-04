/**
 * tests/app/operating-seat.test.mjs — ADR-0076, Session 116: the Operating
 * Seat (enforced, hierarchy-aware access control + vertical roll-up).
 *
 * The claims this suite makes, in order:
 *   1. The layer is zero-migration (schema v82 remains) and fail-closed on a
 *      malformed seat id; it is registered on the shared post-commit spine.
 *   2. The undeclared operator view is the IDENTITY projection (no-regression
 *      default) and the automatic rule is inert until a seat is declared.
 *   3. Five altitudes are derived from person.managerId; an IC is not a seat.
 *   4. Upward leakage of individual detail is refused (counts only above the
 *      manager rank), with a printed reason for every withheld record.
 *   5. Downward leakage (portfolio/enterprise material) and sideways leakage
 *      (a peer span's record) are denied.
 *   6. Action rights respect the rank window; undeclared actions are refused.
 *   7. Route verdicts gate both the nav and direct navigation.
 *   8. THE HEADLINE: one frontline case rolls up through manager → director →
 *      VP → CEO digests, each in the form appropriate to its altitude, with
 *      names at the frontline and counts at the top — no re-entry.
 *   9. A pooled rate is printed beside the mean of unit rates; material
 *      disagreement is flagged with a directly standardised rate (Simpson's
 *      paradox), and a rate below the evidence floor is refused.
 *  10. RULE-SEAT-01 fans a typed `rolls-up-to` edge to every leadership
 *      ancestor, marker-idempotently, and an explicit scan always runs.
 *  11. One committed case produces BOTH cross-module propagation from other
 *      rules AND cross-altitude roll-up, inside a single store transaction.
 *  12. Seat handover is append-only, validates a real seat, and can be undone.
 *  13. All five Altitude Lens panels render, axe-clean markup, no placeholders.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  SCHEMA_VERSION, createEmptyState, normalizeState, normalizeSettings, DEFAULT_SETTINGS,
} from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import {
  ALTITUDES, RECORD_CLASSES, SEAT_EVENTS, SEAT_RULE_IDS, UNDECLARED_SEAT,
  routeVerdict, actionVerdict,
} from '../../app/core/domain/seatRegistry.js';
import { normalizeSeatId, seatConventions } from '../../app/core/domain/seatSchema.js';
import {
  activeSeat, allowedRoutes, buildSeats, canAct, canSee, drillDown,
  projectForSeat, rollUpPath, seatDigest, seatReport, resolveSeat,
} from '../../app/core/domain/seat.js';
import { seatRule, isOperationalCommit } from '../../app/core/domain/seatRules.js';
import { renderSeat } from '../../app/views/seat.js';

const NOW = new Date('2027-06-30T00:00:00.000Z');
const ago = (days) => new Date(NOW.getTime() - days * 86400000).toISOString().slice(0, 10);
const clone = (value) => JSON.parse(JSON.stringify(value));

/**
 * A five-altitude roster. The workspace leader is declared `chief` (ADR-0075
 * allows the leader's altitude to be declared because they hold no roster
 * record), so the tree is: leader (5) → vp1 (4) → dir1 (3) → mgr1 (2) →
 * lead1/lead2 (1) → four ICs (no seat). Two frontline spans under one manager
 * are what make the composition-sensitive rate test possible.
 */
function fixture(overrides = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.settings = {
    ...state.settings,
    leaderName: 'Dana Whitfield',
    chainLeaderAltitude: 'chief',
    oneOnOneCadenceDays: 7,
    activeSeatId: null,
    seatAutoPropagate: true,
    seatFloorN: 4,
    seatMaterialityPp: 5,
    seatMaxLinks: 24,
    ...overrides,
  };
  state.people = [
    { id: 'vp1', name: 'Rina Okafor', role: 'VP Operations', level: 'vp', managerId: null, status: 'active', createdAt: ago(500) },
    { id: 'dir1', name: 'Samuel Park', role: 'Director', level: 'director', managerId: 'vp1', status: 'active', createdAt: ago(500) },
    { id: 'mgr1', name: 'Mei Chen', role: 'Manager', level: 'manager', managerId: 'dir1', status: 'active', createdAt: ago(500) },
    { id: 'lead1', name: 'Priya Raman', role: 'Shift lead', level: 'lead', managerId: 'mgr1', status: 'active', createdAt: ago(500) },
    { id: 'lead2', name: 'Jordan Lee', role: 'Shift lead', level: 'lead', managerId: 'mgr1', status: 'active', createdAt: ago(500) },
    { id: 'ic1', name: 'Ari Klein', role: 'Analyst', level: 'ic', managerId: 'lead1', status: 'active', createdAt: ago(400) },
    { id: 'ic2', name: 'Bo Nilsen', role: 'Analyst', level: 'ic', managerId: 'lead1', status: 'active', createdAt: ago(400) },
    { id: 'ic3', name: 'Cy Orlov', role: 'Analyst', level: 'ic', managerId: 'lead2', status: 'active', createdAt: ago(400) },
    { id: 'ic4', name: 'Dee Park', role: 'Analyst', level: 'ic', managerId: 'lead2', status: 'active', createdAt: ago(400) },
  ];
  state.cases = [
    { id: 'case-frontline', title: 'Two shift leads disagree on the handover rota', status: 'open', ownerId: 'ic1', involvedPersonIds: ['ic2'], openedOn: ago(2), reviewOn: ago(-5), fmea: { severity: 7 } },
    { id: 'case-peer', title: 'Cover gap on the second shift', status: 'open', ownerId: 'ic3', involvedPersonIds: ['ic4'], openedOn: ago(3), fmea: { severity: 4 } },
  ];
  state.oneOnOnes = [
    { id: 'oo-1', personId: 'ic1', date: ago(2), status: 'held', notes: 'A private coaching conversation about the rota disagreement.' },
    { id: 'oo-2', personId: 'ic3', date: ago(2), status: 'held', notes: 'A private coaching conversation on the second shift.' },
  ];
  state.conflicts = [
    { id: 'cf-1', title: 'Rota disagreement', partyIds: ['ic1', 'ic2'], status: 'open', openedOn: ago(2) },
  ];
  state.meritCycles = [
    { id: 'mc-1', label: 'Annual merit cycle', status: 'draft', budget: { kind: 'amount', value: 100000 } },
  ];
  state.budgets = [
    { id: 'bud-1', label: 'Operations envelope', amount: 250000 },
  ];
  return state;
}

function ruleContext(event, settings = {}, draft = null) {
  let counter = 0;
  const logged = [];
  return {
    event, now: NOW, settings,
    idFactory: (prefix) => `${prefix}-${(counter += 1)}`,
    logEvent: (entry) => logged.push(entry),
    out: [],
    logged,
    draft,
  };
}

function bootDocument() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => consoleErrors.push(error.message));
  const dom = new JSDOM('<!doctype html><html><body><div id="view"></div></body></html>', {
    url: 'https://leados.test/', pretendToBeVisual: true, virtualConsole,
  });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event;
  globalThis.FileReader = window.FileReader;
  globalThis.localStorage = window.localStorage;
  return { window, document: window.document, consoleErrors };
}

/* ------------------------------------------------------------- 1. schema */

test('1. the seat layer is zero-migration, fail-closed, and on the shared spine', () => {
  // A version bump would have forced 78 test files to be rewritten for zero
  // user benefit. There is nothing to migrate because nothing new is stored.
  assert.equal(SCHEMA_VERSION, 93);
  assert.equal(SCHEMA_VERSION, 93);
  assert.equal(DEFAULT_SETTINGS.activeSeatId, null);
  const normalized = normalizeState(createEmptyState(NOW.toISOString()), { now: NOW }).state;
  assert.equal(normalized.settings.activeSeatId, null);
  assert.equal(normalized.settings.seatAutoPropagate, true);
  assert.equal(normalized.settings.seatFloorN, 4);
  assert.equal(normalizeSeatId('<script>alert(1)</script>'), null, 'a malformed id is dropped, never repaired');
  assert.equal(normalizeSeatId('lead1'), 'lead1');
  assert.equal(normalizeSettings({ activeSeatId: '<script>' }).activeSeatId, null);
  assert.equal(normalizeSettings({ activeSeatId: 'lead1' }).activeSeatId, 'lead1', 'a declared seat survives reload');
  assert.equal(seatConventions({ seatFloorN: 999 }).seatFloorN, 12, 'conventions are clamped');
  assert.ok(DEFAULT_POST_COMMIT_RULES.some((rule) => rule.id === 'seatRule'), 'registered on ADR-0008/0026 spine');
  assert.ok(DEFAULT_POST_COMMIT_RULES.length >= 50, 'dozens of module rules share the same spine');
  assert.ok(DEFAULT_POST_COMMIT_RULES.some((rule) => /case/i.test(String(rule.name || ''))), 'case rules share the same spine');
  // ADR-0082: the Sealed Spine appends sealRule ABSOLUTELY LAST so the seal
  // covers every other rule's writes — the seat rule therefore reads the
  // finished workspace at -2, immediately before the seal closes the transaction.
  assert.equal(DEFAULT_POST_COMMIT_RULES.at(-2).id, 'seatRule', 'the seat rule reads the finished workspace last before the seal');
  assert.equal(DEFAULT_POST_COMMIT_RULES.at(-1).id, 'sealRule', 'ADR-0082: the seal closes the transaction after every other rule');
});

/* ------------------------------------------------- 2. no-regression default */

test('2. the undeclared operator view is the identity projection and the rule is inert', () => {
  const state = fixture();
  const built = buildSeats(state, { now: NOW, settings: state.settings });
  const seat = activeSeat(built);
  assert.equal(seat.fullAccess, true);
  assert.equal(seat.id, UNDECLARED_SEAT);
  const projection = projectForSeat(state, seat, built);
  assert.equal(projection.enforced, false);
  assert.equal(projection.counts.denied, 0);
  assert.equal(projection.counts.aggregate, 0);
  assert.equal(projection.visible.oneOnOnes.length, state.oneOnOnes.length);
  assert.equal(projection.visible.meritCycles.length, state.meritCycles.length);
  assert.equal(routeVerdict('capital', seat).allow, true);

  // The automatic pass writes NOTHING on an undeclared workspace: no links,
  // no audit events, no tasks. This is what protects the 2,178 existing tests.
  const draft = clone(state);
  draft.links = [];
  draft.events = [];
  const ctx = ruleContext({ type: 'case.created', entity: 'case', entityId: 'case-frontline' }, draft.settings, draft);
  const effects = seatRule(draft, ctx);
  assert.deepEqual(effects, []);
  assert.equal(draft.links.length, 0);
  assert.equal(draft.events.length, 0);
  assert.equal(isOperationalCommit({ type: 'case.created' }), true);
  assert.equal(isOperationalCommit({ type: 'automation.propagated' }), false);
});

/* ------------------------------------------------------- 3. the hierarchy */

test('3. five altitudes are derived from person.managerId; an IC is not a seat', () => {
  const state = fixture();
  const built = buildSeats(state, { now: NOW, settings: state.settings });
  assert.equal(built.seats.length, 6, 'leader + vp + director + manager + 2 frontline leads');
  const keys = new Set(built.seats.map((s) => s.altitudeKey));
  assert.deepEqual([...keys].sort(), ALTITUDES.map((a) => a.key).sort());
  for (const ic of ['ic1', 'ic2', 'ic3', 'ic4']) {
    assert.equal(built.byId.has(ic), false, `${ic} has no reports and therefore no seat`);
  }
  assert.equal(built.byId.get('lead1').rank, 1);
  assert.equal(built.byId.get('mgr1').rank, 2);
  assert.equal(built.byId.get('dir1').rank, 3);
  assert.equal(built.byId.get('vp1').rank, 4);
  assert.equal(built.byId.get('leader').rank, 5);
  assert.ok(built.byId.get('mgr1').scope.has('ic3'), 'manager scope contains both frontline spans');
  assert.equal(built.byId.get('leader').scopeN, 9, 'the enterprise scope is the whole roster');
});

/* ------------------------------------------------- 4/5. access boundaries */

test('4. upward leakage: individual detail is counts only above the manager rank, with reasons', () => {
  const state = fixture();
  const built = buildSeats(state, { now: NOW, settings: state.settings });
  const meeting = state.oneOnOnes[0];
  const verdicts = ['lead1', 'mgr1', 'dir1', 'vp1', 'leader'].map((id) => canSee(meeting, 'oneOnOnes', built.byId.get(id), built));
  assert.equal(verdicts[0].allow, 'full', 'a frontline lead reads their own team’s 1:1 notes');
  assert.equal(verdicts[1].allow, 'full', 'a manager still reads individual detail');
  assert.equal(verdicts[2].allow, 'aggregate', 'a director gets a COUNT, not the note');
  assert.match(verdicts[2].reason, /COUNT ONLY/i);
  assert.equal(verdicts[3].allow, 'aggregate');
  assert.equal(verdicts[4].allow, 'aggregate', 'a CEO is not handed shift-coaching notes');
  assert.equal(verdicts[4].classKey, 'individual');

  const dirProjection = projectForSeat(state, built.byId.get('dir1'), built);
  assert.equal(dirProjection.visible.oneOnOnes.length, 0, 'no individual note crosses the ceiling');
  assert.ok(dirProjection.ledger.some((entry) => entry.collection === 'oneOnOnes' && entry.reason.length > 20));
  assert.equal(dirProjection.counts.aggregate > 0, true);
  assert.equal(canSee(meeting, 'oneOnOnes', built.operatorSeat, built).allow, 'full', 'the operator view is unenforced');
});

test('5. downward and sideways leakage are denied with printed reasons', () => {
  const state = fixture();
  const built = buildSeats(state, { now: NOW, settings: state.settings });
  const lead1 = built.byId.get('lead1');
  const mgr1 = built.byId.get('mgr1');
  const vp1 = built.byId.get('vp1');
  assert.equal(canSee(state.meritCycles[0], 'meritCycles', lead1, built).allow, 'denied', 'enterprise material is not handed down');
  assert.match(canSee(state.meritCycles[0], 'meritCycles', lead1, built).reason, /below rank 4/);
  assert.equal(canSee(state.budgets[0], 'budgets', lead1, built).allow, 'denied', 'portfolio material is not handed down');
  assert.equal(canSee(state.meritCycles[0], 'meritCycles', vp1, built).allow, 'full');
  assert.equal(canSee(state.cases[1], 'cases', lead1, built).allow, 'denied', 'a peer span’s case is sideways');
  assert.match(canSee(state.cases[1], 'cases', lead1, built).reason, /outside/);
  assert.equal(canSee(state.cases[0], 'cases', mgr1, built).allow, 'full');
  assert.equal(canSee(state.cases[0], 'cases', vp1, built).allow, 'aggregate', 'a VP reads unit work as counts, not task lists');
  // An unlisted collection fails closed to unit work (detail ceiling rank 3).
  assert.equal(canSee({ id: 'x', personId: 'ic1' }, 'someNewModule', built.byId.get('leader'), built).allow, 'aggregate');
});

/* --------------------------------------------------------- 6/7. rights/routes */

test('6. action rights respect the rank window and refuse undeclared actions', () => {
  const built = buildSeats(fixture(), { now: NOW });
  const lead1 = built.byId.get('lead1');
  const chief = built.byId.get('leader');
  assert.equal(canAct('log-oneonone', lead1).allow, true);
  assert.equal(canAct('freeze-board-summary', lead1).allow, false);
  assert.match(canAct('freeze-board-summary', lead1).reason, /rank window/);
  assert.equal(canAct('log-oneonone', chief).allow, false);
  assert.equal(canAct('freeze-board-summary', chief).allow, true);
  assert.equal(canAct('declare-seat', lead1).allow, true, 'any altitude can declare a seat');
  assert.equal(canAct('an-action-nobody-declared', built.operatorSeat).allow, false, 'undeclared actions fail closed');
  // An out-of-scope record cannot be acted on even when the action is allowed.
  assert.equal(canAct('open-case', lead1, { record: { id: 'x', personId: 'ic3' }, collection: 'cases', built }).allow, false);
});

test('7. route verdicts gate nav and direct navigation without dead ends', () => {
  const built = buildSeats(fixture(), { now: NOW });
  const lead1 = built.byId.get('lead1');
  const chief = built.byId.get('leader');
  assert.equal(routeVerdict('capital', lead1).allow, false);
  assert.match(routeVerdict('capital', lead1).reason, /floor is rank 3/);
  assert.equal(routeVerdict('oneonones', chief).allow, false);
  assert.equal(routeVerdict('today', lead1).allow, true);
  assert.equal(routeVerdict('seat', chief).allow, true, 'the lens itself is never a dead end');
  assert.equal(routeVerdict('settings', chief).allow, true);
  assert.deepEqual(allowedRoutes(lead1, ['today', 'capital', 'seat', 'cases']), ['today', 'seat', 'cases']);
  assert.equal(routeVerdict('capital', built.operatorSeat).allow, true);
});

/* ------------------------------------------------------------ 8. ROLL-UP */

test('8. one frontline case rolls up through manager → director → VP → CEO, no re-entry', () => {
  const state = fixture();
  const built = buildSeats(state, { now: NOW, settings: state.settings });
  const path = rollUpPath(state, built, 'lead1', { now: NOW, settings: state.settings });
  assert.deepEqual(path.map((p) => p.digest.rank), [1, 2, 3, 4, 5], 'five altitudes, one chain');
  for (const step of path) {
    assert.ok(step.digest.counts.openN >= 1, `${step.digest.label} sees the frontline case as open work`);
  }
  const frontline = path[0].digest;
  const director = path[2].digest;
  const vp = path[3].digest;
  const chief = path[4].digest;
  assert.equal(frontline.disclosure.mode, 'visible', 'names at the frontline, where the work is the person');
  assert.equal(director.disclosure.mode, 'leaders', 'only unit leaders named at director altitude');
  assert.equal(chief.disclosure.mode, 'none', 'no person named at the top');
  assert.ok(director.disclosure.rows.every((row) => row.hiddenDetail === true), 'item detail withheld above the ceiling');
  assert.ok(vp.riskHeat.length >= 0);
  assert.ok(chief.boardLine && chief.boardLine.includes('Enterprise:'), 'a generated board-ready line at the top');
  assert.ok(chief.boardLine.includes('No person is named'));
  assert.ok(!chief.boardLine.includes('handover rota'), 'the case title must not leak into the board line');
  assert.equal(chief.counts.openN >= director.counts.openN, true, 'counts do not shrink on the way up');
  const down = drillDown(state, built, 'leader', { now: NOW, settings: state.settings });
  assert.ok(down.some((d) => d.seat.id === 'vp1'), 'the CEO can drill down to the function');
});

/* --------------------------------------------------------------- 9. rates */

test('9. pooled vs mean-of-unit rates are composition-sensitive; the floor refuses', () => {
  const state = fixture();
  // lead1's span: 4 old cases (all past a 7-day frontline horizon → debt).
  // lead2's span: 8 recent cases (no debt). Pooled 4/12 = 33.3%; the naive
  // mean of the two unit rates is 50% — Simpson's paradox, flagged by name.
  state.cases = [
    ...Array.from({ length: 4 }, (_, i) => ({ id: `old-${i}`, title: `Old case ${i}`, status: 'open', ownerId: 'ic1', involvedPersonIds: ['ic2'], openedOn: ago(40), fmea: { severity: 5 } })),
    ...Array.from({ length: 8 }, (_, i) => ({ id: `new-${i}`, title: `Recent case ${i}`, status: 'open', ownerId: 'ic3', involvedPersonIds: ['ic4'], openedOn: ago(1), fmea: { severity: 3 } })),
  ];
  const built = buildSeats(state, { now: NOW, settings: state.settings });
  const d = seatDigest(state, built.byId.get('mgr1'), built, { now: NOW, settings: state.settings });
  assert.equal(d.horizonDebt.den, 12);
  assert.equal(d.horizonDebt.pooledPct, 33.3);
  assert.equal(d.horizonDebt.unitMeanPct, 50);
  assert.equal(d.horizonDebt.spreadPp, 16.7);
  assert.equal(d.horizonDebt.compositionSensitive, true);
  assert.equal(d.horizonDebt.standardisedPct, 33.3, 'directly standardised to the parent’s mix');
  const relaxed = seatDigest(state, built.byId.get('mgr1'), built,
    { now: NOW, settings: { ...state.settings, seatMaterialityPp: 25 } });
  assert.equal(relaxed.horizonDebt.compositionSensitive, false, 'the bar is a declaration, not a property of the data');
  const empty = fixture();
  empty.cases = [];
  const emptyBuilt = buildSeats(empty, { now: NOW, settings: empty.settings });
  const emptyDigest = seatDigest(empty, emptyBuilt.byId.get('mgr1'), emptyBuilt, { now: NOW, settings: empty.settings });
  assert.equal(emptyDigest.horizonDebt.pooledPct, null);
  assert.match(emptyDigest.horizonDebt.refused, /evidence floor/);
  assert.equal(emptyDigest.trendVerdict.verdict, 'unmeasured', 'no anomaly from fewer than four weeks');
});

/* ------------------------------------------------------- 10/11. propagation */

test('10. RULE-SEAT-01 fans typed roll-up edges to every ancestor, idempotently', () => {
  const state = fixture({ activeSeatId: 'lead1' });
  // A sensitive individual record: its COUNT must roll up, but an identifying
  // typed edge to a VP would reveal that it exists for a named person.
  state.performanceConcerns = [
    { id: 'pc-1', personId: 'ic1', status: 'assessing', openedOn: ago(3), title: 'Private support process' },
  ];
  const draft = clone(state);
  draft.links = [];
  draft.events = [];
  const ctx = ruleContext({ type: 'case.created', entity: 'case', entityId: 'case-frontline' }, draft.settings, draft);
  const effects = seatRule(draft, ctx);
  assert.ok(effects.length > 0, 'a committed case rolls up automatically');
  const edges = draft.links.filter((l) => l.relation === 'rolls-up-to' && l.ruleId === SEAT_RULE_IDS.ROLLUP);
  assert.ok(edges.length >= 4, 'one edge per leadership ancestor in the same transaction');
  for (const target of ['lead1', 'mgr1', 'dir1', 'vp1']) {
    assert.ok(edges.some((l) => l.targetId === target), `rolled up to ${target}`);
  }
  assert.ok(edges.every((l) => l.targetType === 'person' && l.sourceType === 'case'));
  assert.equal(draft.links.some((l) => l.sourceId === 'pc-1'), false,
    'a sensitive individual record is never identified by a roll-up edge');
  assert.ok(seatDigest(draft, buildSeats(draft, { now: NOW, settings: draft.settings }).byId.get('vp1'),
    buildSeats(draft, { now: NOW, settings: draft.settings }), { now: NOW, settings: draft.settings })
    .counts.openN >= 1, 'but its count is still visible at the VP altitude');
  const before = draft.links.length;
  seatRule(draft, ruleContext({ type: 'case.created', entity: 'case', entityId: 'case-frontline' }, draft.settings, draft));
  assert.equal(draft.links.length, before, 'exact-edge uniqueness is the idempotency ledger');

  // Pausing automation silences the automatic pass, never an explicit scan.
  const paused = clone(state);
  paused.settings.seatAutoPropagate = false;
  paused.links = [];
  const pausedCtx = ruleContext({ type: 'case.created', entity: 'case', entityId: 'case-frontline' }, paused.settings, paused);
  assert.deepEqual(seatRule(paused, pausedCtx), []);
  assert.equal(paused.links.length, 0);
  const scanCtx = ruleContext({ type: SEAT_EVENTS.SCAN, entity: 'workspace' }, paused.settings, paused);
  assert.ok(seatRule(paused, scanCtx).length > 0, 'an explicit scan always runs');
  assert.ok(paused.links.length > 0);
  assert.ok(scanCtx.logged.some((e) => e.type === 'seat.access_denied'), 'the enforced boundary is traceable');
});

test('11. ONE committed case produces cross-module AND cross-altitude propagation', () => {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-seat-${(seq += 1)}`;
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  const seed = fixture({ activeSeatId: 'lead1' });
  store.update((draft) => Object.assign(draft, seed), { type: 'fixture.loaded', entity: 'workspace' });
  const linksBefore = store.state.links.length;
  // A single committed case. The generalized spine runs EVERY module's rules
  // and the seat roll-up in the SAME atomic transaction.
  store.update(
    (draft) => {
      draft.cases.push({
        id: 'case-new', title: 'Frontline conflict escalated to a case', status: 'open',
        ownerId: 'ic1', involvedPersonIds: ['ic2'], openedOn: ago(1), fmea: { severity: 6 },
      });
    },
    { type: 'case.created', entity: 'case', entityId: 'case-new', summary: 'Logged a frontline conflict as a case' },
  );
  const seatEdges = store.state.links.filter((l) => l.sourceId === 'case-new' && l.ruleId === SEAT_RULE_IDS.ROLLUP);
  assert.ok(seatEdges.length >= 3, 'cross-altitude: the new case rolled up to manager, director and VP');
  assert.ok(store.state.links.some((l) => l.ruleId && !String(l.ruleId).startsWith('RULE-SEAT')),
    'cross-module: other rules propagated from the same commit');
  assert.ok(store.state.links.length > linksBefore + seatEdges.length - 1);
  const report = seatReport(store.state, { now: NOW, settings: store.state.settings });
  assert.equal(report.seat.id, 'lead1');
  assert.ok(report.digest.counts.openN >= 1, 'the frontline seat sees the new case immediately');
  assert.ok(report.rollUp.length === 5, 'and it is already in every ancestor’s derived digest');
});

/* ------------------------------------------------------------- 12. actions */

test('12. seat handover is append-only, validates a real seat, and can be undone', () => {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-act-${(seq += 1)}`;
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  store.update((draft) => Object.assign(draft, fixture()), { type: 'fixture.loaded', entity: 'workspace' });
  const api = createApi(store, { now: () => NOW, idFactory });
  const declared = api.setActiveSeat('lead1', { reason: 'starting the shift' });
  assert.equal(declared.ok, true);
  assert.equal(store.state.settings.activeSeatId, 'lead1');
  assert.ok(store.state.events.some((e) => e.type === SEAT_EVENTS.SWITCH), 'the handover is append-only history');
  assert.equal(api.seatRead().seat.id, 'lead1');
  assert.equal(api.seatBriefText().includes('Operating seat'), true);
  const invalid = api.setActiveSeat('ic1');
  assert.equal(invalid.ok, false, 'an IC is not a seat');
  assert.match(invalid.error, /not a leadership position/);
  const garbage = api.setActiveSeat('<script>');
  assert.equal(garbage.ok, false);
  assert.equal(api.scanSeats().ok, true);
  assert.ok(store.state.events.some((e) => e.type === SEAT_EVENTS.SCAN));
  const back = api.setActiveSeat(null);
  assert.equal(back.ok, true);
  assert.equal(store.state.settings.activeSeatId, null);
  assert.equal(api.seatRead().seat.fullAccess, true);
});

/* ------------------------------------------- 13. corrupted / stale seat id */

test('13. a stale or hand-edited seat id fails closed to a genuinely read-only view', () => {
  const state = fixture();
  const built = buildSeats(state, { now: NOW, settings: state.settings });
  const stale = resolveSeat(built, 'person-who-was-deleted');
  assert.equal(stale.readOnly, true);
  assert.equal(stale.fullAccess, false);
  assert.ok(built.warnings.some((w) => /READ-ONLY/.test(w)));
  // No record body is readable — not even enterprise material, which rank 5
  // would otherwise permit. Counts survive; the ledger explains why.
  for (const [record, collection] of [
    [state.oneOnOnes[0], 'oneOnOnes'],
    [state.meritCycles[0], 'meritCycles'],
    [state.cases[0], 'cases'],
  ]) {
    const verdict = canSee(record, collection, stale, built);
    assert.equal(verdict.allow, 'aggregate', `${collection} is counts only, never full`);
    assert.match(verdict.reason, /no longer exists/);
  }
  const projection = projectForSeat(state, stale, built);
  assert.equal(projection.counts.full, 0, 'the identity projection is gone');
  assert.equal(projection.counts.aggregate > 0, true);
  // No action except declaring a valid seat; three recovery routes, no dead end.
  assert.equal(canAct('delegate', stale).allow, false);
  assert.match(canAct('delegate', stale).reason, /Read-only/);
  assert.equal(canAct('declare-seat', stale).allow, true);
  assert.equal(routeVerdict('seat', stale).allow, true);
  assert.equal(routeVerdict('today', stale).allow, true);
  assert.equal(routeVerdict('settings', stale).allow, true);
  assert.equal(routeVerdict('capital', stale).allow, false);
});

/* ---------------------------------------------------------------- 14. view */

test('14. all five Altitude Lens panels render for operator and declared seats', () => {
  bootDocument();
  const panels = ['overview', 'rollup', 'boundary', 'work', 'method'];
  for (const seatId of [null, 'lead1', 'dir1', 'leader']) {
    const state = fixture({ activeSeatId: seatId });
    const ctx = {
      state, now: NOW, query: new URLSearchParams(),
      navigate: () => {}, refresh: () => {},
      api: {
        seatRead: () => seatReport(state, { now: NOW, settings: state.settings }),
        setActiveSeat: () => ({ ok: true }),
        scanSeats: () => ({ ok: true }),
        seatBriefText: () => 'brief',
      },
    };
    for (const panel of panels) {
      ctx.query = new URLSearchParams({ panel });
      const node = renderSeat(ctx);
      const text = node.textContent;
      assert.ok(node.querySelector('h1'), `${seatId || 'operator'}/${panel} has a heading`);
      assert.ok(text.length > 200, `${seatId || 'operator'}/${panel} has content`);
      assert.ok(!/undefined|NaN|\[object Object\]/.test(text), `${seatId || 'operator'}/${panel} leaked a placeholder: ${text.slice(0, 240)}`);
    }
  }
  // The boundary panel must state that access is enforced for a declared seat.
  const state = fixture({ activeSeatId: 'dir1' });
  const ctx = {
    state, now: NOW, query: new URLSearchParams({ panel: 'boundary' }),
    navigate: () => {}, refresh: () => {},
    api: { seatRead: () => seatReport(state, { now: NOW, settings: state.settings }), setActiveSeat: () => ({ ok: true }), scanSeats: () => ({ ok: true }), seatBriefText: () => '' },
  };
  assert.match(renderSeat(ctx).textContent, /Access is enforced at this seat/);
  // An unknown panel falls back to the overview rather than a blank screen.
  ctx.query = new URLSearchParams({ panel: 'no-such-panel' });
  assert.match(renderSeat(ctx).textContent, /Declare the operating seat|Undeclared operator view/);
});

test('roll-up lineage reconciles reorganisation and closure without touching other rules', () => {
  const draft = fixture({ activeSeatId: 'lead1' });
  draft.cases = [draft.cases[0]];
  draft.links = [];
  const scan = () => {
    const ctx = ruleContext({ type: 'person.updated', entity: 'person' }, draft.settings, draft);
    seatRule(draft, ctx);
    return ctx;
  };
  const targets = () => draft.links.filter((l) => l.ruleId === SEAT_RULE_IDS.ROLLUP && l.sourceId === 'case-frontline').map((l) => l.targetId);
  scan();
  assert.ok(targets().includes('lead1'));
  draft.links.push({ id: 'manual', sourceType: 'case', sourceId: 'case-frontline', targetType: 'person', targetId: 'lead1', relation: 'rolls-up-to', ruleId: 'OTHER' });
  draft.people.find((p) => p.id === 'ic1').managerId = 'lead2';
  draft.people.find((p) => p.id === 'ic2').managerId = 'lead2';
  const ctx = scan();
  assert.ok(!targets().includes('lead1'));
  assert.ok(targets().includes('lead2'));
  assert.ok(targets().includes('mgr1') && targets().includes('dir1') && targets().includes('vp1'));
  assert.ok(draft.links.some((l) => l.id === 'manual'));
  assert.ok(ctx.logged.some((e) => e.type === 'seat.rollup_reconciled'));
  scan();
  assert.equal(new Set(targets()).size, targets().length);
  draft.cases[0].status = 'resolved';
  scan();
  assert.equal(targets().length, 0);
  assert.ok(draft.links.some((l) => l.id === 'manual'));
});

test('a cross-span record is not fully disclosed or actionable in one span', () => {
  const state = fixture();
  const built = buildSeats(state, { now: NOW });
  const seat = built.byId.get('lead1');
  const record = { id: 'cross', ownerId: 'ic1', involvedPersonIds: ['ic3'] };
  assert.equal(canSee(record, 'cases', seat, built).allow, 'denied');
  const director = built.byId.get('dir1');
  const privateRecord = { id: 'private', personId: 'ic1' };
  assert.equal(canSee(privateRecord, 'oneOnOnes', director, built).allow, 'aggregate');
  assert.equal(canAct('coach', director, { record: privateRecord, collection: 'oneOnOnes', built }).allow, false);
});
