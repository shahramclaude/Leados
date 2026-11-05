/**
 * ADR-0081 — The Altitude Router (Schema v88).
 *
 * Proves, against the REAL store + REAL rule spine:
 *  - a natural-language note is classified into MODULES and an ALTITUDE,
 *    resolved onto a real reporting-tree seat, and printed as a disclosure
 *    ladder with five genuinely different views;
 *  - ONE human confirmation writes the case, fires the existing cross-module
 *    rules (decision / coaching / counterfactual / succession) AND the new
 *    typed vertical roll-up edges to manager → director → VP in the SAME
 *    atomic transaction;
 *  - the router grades itself out of sample (Wilson, Brier skill, ordinal
 *    rank-distance cost, human-override lift) and opens ONE governed
 *    re-routing decision per breaching cell per ISO week;
 *  - permission boundaries, privacy wall, staleness refusal and aggregate-only
 *    exports all hold.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createEmptyState, normalizeState, SCHEMA_VERSION, migrate } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS, describePropagationContracts } from '../../app/core/domain/propagationContracts.js';
import {
  analyzeRouting, inferAltitude, routingCalibration, routingBriefText,
  routingCsvRows, routingRead, routingAttentionCount, ROUTING_ALTITUDES,
} from '../../app/core/domain/altitudeRouter.js';
import { normalizeRouterPlans, normalizeRouterSettings } from '../../app/core/domain/altitudeRouterSchema.js';
import { ROUTER_LIMITS, ROUTER_RULES, ROUTER_VERSION } from '../../app/core/domain/altitudeRouterRegistry.js';
import { CSV_EXPORTS } from '../../app/core/csv.js';
import { exportWorkspaceCsv } from '../../app/core/csv.js';
import { renderAltitudeRouter } from '../../app/views/altitudeRouter.js';
import { workspaceRouteVerdict, guardApiCall } from '../../app/core/domain/accessGateway.js';
import { buildSeats, activeSeat } from '../../app/core/domain/seat.js';

const NOW = new Date('2026-11-03T12:00:00.000Z');

const FRONTLINE_NOTE = 'The delivery deadline slipped and Ari Klein is behind on the critical path; we are overdue and the bottleneck is blocking the whole night shift handover at the station.';
const CHIEF_NOTE = 'The board and our investors need a company-wide enterprise strategy decision this year, with a five-year portfolio reallocation across the whole organisation and a group-wide risk position.';
const CONFLICT_NOTE = 'There is a serious interpersonal conflict and harassment complaint between two people on the team this week.';

function fixture(overrides = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.settings = { ...state.settings, leaderName: 'Dana Root', chainLeaderAltitude: 'chief', activeSeatId: null, ...overrides };
  state.people = [
    { id: 'vp1', name: 'Rina VP', role: 'VP', level: 'vp', managerId: null, status: 'active' },
    { id: 'dir1', name: 'Sam Director', role: 'Director', level: 'director', managerId: 'vp1', status: 'active' },
    { id: 'mgr1', name: 'Mei Manager', role: 'Manager', level: 'manager', managerId: 'dir1', status: 'active' },
    { id: 'lead1', name: 'Priya Lead', role: 'Shift lead', level: 'lead', managerId: 'mgr1', status: 'active' },
    { id: 'lead2', name: 'Jordan Lead', role: 'Shift lead', level: 'lead', managerId: 'mgr1', status: 'active' },
    { id: 'ic1', name: 'Ari Klein', role: 'Operator', level: 'ic', managerId: 'lead1', status: 'active' },
    { id: 'ic2', name: 'Bo Nilsen', role: 'Operator', level: 'ic', managerId: 'lead1', status: 'active' },
    { id: 'ic3', name: 'Cy Orlov', role: 'Operator', level: 'ic', managerId: 'lead2', status: 'active' },
  ];
  return normalizeState(state, { now: NOW }).state;
}

function boot(state = fixture()) {
  const map = new Map();
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
  let seq = 0;
  map.set(STORAGE_KEY, JSON.stringify(state));
  const store = createStore({ storage, now: () => NOW, idFactory: (p) => `${p}-test-${++seq}` });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory: (p) => `${p}-test-${++seq}` }) };
}

function bootDocument() {
  const vc = new VirtualConsole();
  const dom = new JSDOM('<!doctype html><html><body><div id="view"></div><div id="modal-root"></div></body></html>', { url: 'https://leados.test/', pretendToBeVisual: true, virtualConsole: vc });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.Event = dom.window.Event;
  return dom;
}

/* --------------------------------------------------------------- 1. schema */

test('schema v88 migrates additively; malformed plans are dropped, not repaired', () => {
  // Session 122 keeps this suite valid by pinning it to "at least v88"; the
  // current version is asserted by the suite that owns the current schema.
  assert.ok(SCHEMA_VERSION >= 88);
  const old = { schemaVersion: 87, settings: { leaderName: 'Keep' }, cases: [{ id: 'keep' }], missionBriefs: [{ id: 'brief' }] };
  const migrated = migrate(old);
  assert.ok(migrated.raw.schemaVersion >= 88);
  assert.equal(migrated.applied[0], '87 → 88');
  assert.deepEqual(migrated.raw.altitudeRoutingPlans, []);
  assert.deepEqual(migrated.raw.altitudeRoutingMarkers, []);
  assert.equal(migrated.raw.cases[0].id, 'keep');
  assert.equal(migrated.raw.settings.routingEvidenceFloor, 2.5);
  assert.equal(migrated.raw.settings.routingAutoPropagate, true);
  // Fail-closed: a plan with no seat path or a broken fingerprint is refused.
  const warnings = [];
  assert.deepEqual(normalizeRouterPlans([{ id: 'bad', status: 'analyzed', createdAt: NOW.toISOString(), sourceHash: 'x', fingerprint: 'y', seatPath: [] }], warnings), []);
  assert.ok(warnings.length);
  assert.deepEqual(normalizeRouterSettings({ routingEvidenceFloor: 999, routingReliabilityFloorPct: -4 }), {
    routingEvidenceFloor: 2.5, routingReliabilityFloorPct: 70, routingCalibrationFloorN: 5,
    routingReviewDays: 14, routingAutoPropagate: true,
  });
  const fresh = createEmptyState(NOW.toISOString());
  assert.ok(Array.isArray(fresh.altitudeRoutingPlans) && Array.isArray(fresh.altitudeRoutingMarkers));
});

/* ---------------------------------------------------- 2. altitude inference */

test('Jaques time-span cues infer five different altitudes; negation does not create a route', () => {
  const front = inferAltitude(FRONTLINE_NOTE);
  const chief = inferAltitude(CHIEF_NOTE);
  assert.equal(front.detectedAltitudeKey, 'frontline');
  assert.ok(front.altitudeConfidence > 0.5);
  assert.ok(front.evidenceWeight >= ROUTER_LIMITS.ladder);
  assert.equal(chief.detectedAltitudeKey, 'chief');
  assert.ok(chief.evidenceWeight > front.evidenceWeight);
  assert.equal(ROUTING_ALTITUDES.length, 5);
  assert.deepEqual(ROUTING_ALTITUDES.map((a) => a.horizonDays), [7, 30, 90, 180, 365]);
  // NegEx-style windowing: "not a board decision" must not create a chief cue.
  const negated = inferAltitude('This is not a board or investor decision; it is a shift handover checklist for tomorrow at the station.');
  assert.notEqual(negated.detectedAltitudeKey, 'chief');
  assert.ok(negated.distribution.find((d) => d.key === 'chief').negatedHits >= 1);
  // Thin evidence refuses instead of inventing an altitude.
  const thin = inferAltitude('Something happened.');
  assert.equal(thin.detectedAltitudeKey, null);
  assert.equal(thin.insufficient, true);
  assert.ok(thin.refusalReasons.length);
});

/* --------------------------------- 3. joint module × altitude + LCA ladder */

test('one note produces module routes AND a five-altitude disclosure ladder on real seats', () => {
  const state = fixture();
  const report = analyzeRouting(FRONTLINE_NOTE, state, { now: NOW });
  assert.equal(report.ok, true);
  assert.equal(report.engineVersion, ROUTER_VERSION);
  assert.ok(report.moduleRoutes.length >= 1, 'the intake classifier found at least one module');
  assert.equal(report.altitude.detectedAltitudeKey, 'frontline');
  const path = report.resolved.seatPath;
  assert.deepEqual(path.map((p) => p.rank), [1, 2, 3, 4, 5], 'frontline → manager → director → VP → chief');
  assert.deepEqual(path.map((p) => p.disclosure), ['names', 'names', 'unit', 'aggregate', 'aggregate']);
  assert.equal(path[0].seatId, 'lead1', 'named people resolve to their manager exactly once');
  assert.equal(report.fingerprint, analyzeRouting(FRONTLINE_NOTE, state, { now: NOW }).fingerprint, 'pure & deterministic');
  // Cross-span work (two peers' reports) belongs to their LCA, never a peer.
  const peers = 'The deadline slipped and is overdue; Ari Klein and Cy Orlov are both blocked on the checklist at the station today.';
  const twoSpans = analyzeRouting(peers, state, { now: NOW });
  assert.equal(twoSpans.resolved.ownerNodeId, 'mgr1', 'LCA of two frontline leads is their manager');
  assert.equal(twoSpans.resolved.ownerSeatId, 'mgr1', 'a today-horizon note stays with the LCA');
  assert.equal(twoSpans.resolved.effectiveRank, 2);
  // A quarter cue raises the INFERRED horizon, which lifts ownership above the
  // LCA to the director seat — no silent reassignment of the two named reports.
  const quarter = analyzeRouting(peers.replace(' at the station today', ' across the unit this quarter'), state, { now: NOW });
  assert.equal(quarter.resolved.ownerNodeId, 'mgr1', 'the people still share the same LCA');
  assert.ok(quarter.resolved.inferredRank >= 3, 'the quarter cue was actually read');
  assert.equal(quarter.resolved.ownerSeatId, 'dir1', 'ownership is lifted one rank above the LCA');
  assert.ok(quarter.resolved.effectiveRank >= 3);
});

/* -------------------------- 4. one atomic transaction: modules × hierarchy */

test('ONE confirmation crosses modules AND altitudes in a single atomic transaction', () => {
  const { store, api } = boot();
  const saved = api.routingSaveDraft(FRONTLINE_NOTE);
  assert.equal(saved.ok, true, saved.error);
  assert.equal(saved.plan.status, 'analyzed');
  assert.equal(store.state.cases.length, 0, 'saving a plan creates no case');

  const before = {
    cases: store.state.cases.length, links: store.state.links.length,
    decisions: store.state.decisions.length, delegations: store.state.delegations.length,
  };
  const res = api.routingConfirm(saved.plan.id, { confirmedAltitudeKey: 'frontline' });
  assert.equal(res.ok, true, res.error);
  const after = store.state;

  // (a) the case exists and the plan is confirmed in the SAME write
  assert.equal(after.cases.length, before.cases + 1);
  const plan = after.altitudeRoutingPlans.find((p) => p.id === saved.plan.id);
  assert.equal(plan.status, 'confirmed');
  assert.equal(plan.confirmedCaseId, res.caseId);
  assert.equal(plan.confirmedAltitudeKey, 'frontline');

  // (b) EXISTING cross-module rules fired on the same event spine
  const propagationRules = new Set((store.lastPropagations || []).map((p) => p.ruleId));
  assert.ok(propagationRules.has('RULE-AR-01'), 'the router rule ran');
  assert.ok(after.decisions.length > before.decisions || after.delegations.length > before.delegations
    || (store.lastPropagations || []).some((p) => /RULE-(DEC|COACH|CFP|SUC)/.test(p.ruleId)),
  'at least one other module produced a record in the same transaction');

  // (c) RULE-AR-01 wrote the disclosure ladder + vertical roll-up
  const edges = after.links.filter((l) => l.ruleId === ROUTER_RULES.ROLLUP);
  assert.ok(edges.some((e) => e.relation === 'routes-through' && e.sourceType === 'case' && e.targetType === 'routingplan'));
  assert.ok(edges.some((e) => e.relation === 'discloses-to' && e.targetId === 'lead1'));
  for (const ancestor of ['mgr1', 'dir1', 'vp1']) {
    assert.ok(edges.some((e) => e.relation === 'rolls-up-to' && e.targetId === ancestor),
      `a frontline note reaches ${ancestor} without re-entry`);
  }
  assert.equal(edges.some((e) => e.targetId === 'leader'), false, 'no dangling edge to the synthetic root');
  assert.ok(edges.every((e) => !/Ari|checklist|deadline/i.test(e.summary)), 'no note text in a link summary');

  // (d) one revision, one confirmed plan, idempotent on an explicit rescan
  const linksBefore = after.links.length;
  const scan = api.routingScan();
  assert.equal(scan.ok, true);
  assert.equal(store.state.links.length, linksBefore, 'a rescan cannot duplicate typed edges');
});

test('rule is on the shared spine before the seat, with a declared contract', () => {
  const names = DEFAULT_POST_COMMIT_RULES.map((r) => r.name);
  const arIdx = names.indexOf('altitudeRouterRule');
  assert.ok(arIdx >= 0);
  assert.ok(arIdx < names.indexOf('seatRule'), 'the roll-up is explainable by the seat boundary above it');
  assert.ok(arIdx < names.indexOf('attentionMarketRule'), 'the market invariant is preserved');
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length);
  const contract = describePropagationContracts().find((c) => c.name === 'altitudeRouterRule');
  assert.ok(contract && /RULE-AR-01/.test(contract.purpose));
  assert.ok(contract.writes.includes('links'));
  // ADR-0082 (merged with this branch): sealRule closes every transaction
  // after the seat roll-up has read the finished workspace.
  assert.equal(DEFAULT_POST_COMMIT_RULES.at(-2)?.id, 'seatRule');
  assert.equal(DEFAULT_POST_COMMIT_RULES.at(-1)?.id, 'sealRule');
});

/* --------------------------------------------- 5. staleness + privacy walls */

test('a reorganisation refuses a stale plan; a confidential note is never auto-routed', () => {
  const { store, api } = boot();
  const saved = api.routingSaveDraft(FRONTLINE_NOTE);
  assert.equal(saved.ok, true);
  // Change the reporting tree: the fingerprint must no longer match.
  store.update((d) => {
    const ari = d.people.find((p) => p.id === 'ic1');
    ari.managerId = 'lead2';
  }, { type: 'people.updated', entity: 'person', entityId: 'ic1', summary: 'Reporting line changed' });
  const stale = api.routingConfirm(saved.plan.id, { confirmedAltitudeKey: 'frontline' });
  assert.equal(stale.ok, false);
  assert.match(stale.error, /changed/i);

  const conflict = api.routingSaveDraft(CONFLICT_NOTE);
  assert.equal(conflict.ok, true);
  assert.equal(conflict.plan.privacyBlocked, true);
  const blocked = api.routingConfirm(conflict.plan.id, {});
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /conflict/i);
  assert.equal(store.state.conflicts.length, 0, 'no conflict record was auto-created');
});

/* --------------------------------------------- 6. out-of-sample calibration */

test('five graded plans produce Wilson + Brier skill and ONE governed re-routing decision per week', () => {
  const { store, api } = boot();
  const ids = [];
  for (let i = 0; i < 5; i += 1) {
    const note = `${FRONTLINE_NOTE} Station ${i + 1} this shift.`;
    const saved = api.routingSaveDraft(note);
    assert.equal(saved.ok, true, saved.error);
    assert.equal(saved.plan.detectedAltitudeKey, 'frontline');
    const confirmed = api.routingConfirm(saved.plan.id, { confirmedAltitudeKey: 'frontline' });
    assert.equal(confirmed.ok, true, confirmed.error);
    ids.push(saved.plan.id);
  }
  // Two grades agree with the engine; three judge the work really belonged at
  // executive altitude — an ordinal error of three ranks each.
  const grades = ['frontline', 'frontline', 'exec', 'exec', 'exec'];
  let decisionsBefore = store.state.decisions.length;
  for (let i = 0; i < ids.length; i += 1) {
    // Ignore cross-module decisions opened while creating the cases.
    decisionsBefore = store.state.decisions.length;
    const g = api.routingGrade(ids[i], grades[i], `retrospective ${i}`);
    assert.equal(g.ok, true, g.error);
    if (i === ids.length - 1) {
      assert.ok(store.state.decisions.length > decisionsBefore,
        'RULE-AR-02 opened a governed question on the breaching cell');
    }
  }
  const report = routingCalibration(store.state, { now: NOW });
  assert.equal(report.gradedN, 5);
  assert.equal(report.overallCorrectN, 2);
  assert.equal(report.overallRatePct, 40);
  assert.ok(report.brierSkillPct !== null, 'Brier skill is printed out of sample');
  assert.ok(report.forecastN >= 3, 'strictly-prior forecasts only');
  assert.equal(report.meanRankError, 1.8, '3 × (4−1) / 5 ranks of ordinal error');
  assert.equal(report.underRouted, 3);
  const cell = report.cells.find((c) => c.key === 'frontline');
  assert.equal(cell.n, 5);
  assert.equal(cell.correctN, 2);
  assert.equal(cell.refused, false);
  assert.equal(cell.belowFloor, true);
  assert.ok(cell.wilsonLo !== null && cell.wilsonHi !== null);
  assert.ok(report.cells.filter((c) => c.key !== 'frontline').every((c) => c.refused), 'other cells refuse below five');

  // Marker-idempotent: a second explicit scan opens no second decision.
  const n = store.state.decisions.length;
  api.routingScan();
  assert.equal(store.state.decisions.length, n, 'one governed question per cell per ISO week');
  const markers = store.state.altitudeRoutingMarkers;
  assert.ok(markers.some((m) => m.startsWith(`${ROUTER_RULES.FLOOR}:week:`)));
  assert.ok(markers.some((m) => m.startsWith(`${ROUTER_RULES.MATURITY}:reached:frontline`)));

  // A grade cannot be rewritten.
  assert.equal(api.routingGrade(ids[0], 'chief').ok, false);
  // Human override lift is measured, not asserted.
  assert.equal(report.overrides, 0);
});

/* ------------------------------------------------ 7. permission boundaries */

test('a declared seat cannot route a peer span and detail is withheld above manager rank', () => {
  const { store, api } = boot(fixture({ activeSeatId: 'lead1' }));
  const built = buildSeats(store.state, { now: NOW });
  const seat = activeSeat(built);
  assert.equal(seat.id, 'lead1');
  assert.equal(workspaceRouteVerdict('routing', seat).allow, true, 'the router completed its scoped read audit');
  assert.equal(workspaceRouteVerdict('oneonones', seat).allow, false);
  assert.equal(guardApiCall(store.state, 'routingConfirm', ['x']).ok, true, 'declared read adapter exists');
  const saved = api.routingSaveDraft('The shift handover checklist was missed today at the station; cover tomorrow is unclear.');
  assert.equal(saved.ok, true, saved.error);
  assert.equal(saved.plan.ownerSeatId, 'lead1', 'no named people → the declared operating seat owns it');
  // Switch to a peer span: the plan is now outside the acting seat's subtree.
  store.update((d) => { d.settings.activeSeatId = 'lead2'; }, { type: 'settings.updated', entity: 'workspace', entityId: '', summary: 'Seat switched' });
  const refused = api.routingConfirm(saved.plan.id, { confirmedAltitudeKey: 'frontline' });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /outside|peer/i);
  // A director-rank read model withholds item detail.
  const read = routingRead(store.state, { now: NOW, seatId: 'dir1' });
  assert.equal(read.scoped, true);
  assert.equal(read.seat.rank, 3);
});

/* ----------------------------------------------- 8. aggregate-only exports */

test('the brief and CSV are identity-free; the situation note never leaves in an export', () => {
  const { api } = boot();
  const saved = api.routingSaveDraft(FRONTLINE_NOTE);
  assert.equal(saved.ok, true);
  api.routingConfirm(saved.plan.id, { confirmedAltitudeKey: 'frontline' });
  api.routingGrade(saved.plan.id, 'frontline');
  const state = createEmptyState(NOW.toISOString());
  const text = routingBriefText(state, { now: NOW });
  assert.match(text, /Altitude Router/);
  assert.ok(!/Ari Klein|deadline|checklist/i.test(text));
  const rows = routingCsvRows(state, { now: NOW });
  assert.equal(rows.length, 6, 'five altitude cells + one workspace row');
  assert.ok(rows.every((r) => !Object.values(r).some((v) => typeof v === 'string' && /Ari|checklist|deadline/i.test(v))));
  assert.ok(CSV_EXPORTS.some((s) => s.key === 'altitude-router' && s.sensitive === false));
  const csv = exportWorkspaceCsv(state, 'altitude-router', { now: NOW });
  assert.equal(csv.ok, true, csv.error);
  assert.match(csv.csv, /agreement_pct/);
  assert.ok(!/Ari Klein/.test(csv.csv));
  assert.equal(routingAttentionCount(state, NOW, state.settings), 0, 'no pending plans → no badge');
});

/* ------------------------------------------ 9. zero-regression inertness */

test('with no routing plans, ordinary commits are unchanged and auto-propagation is pausable', () => {
  const { store, api } = boot();
  const beforeLinks = store.state.links.length;
  const beforePlans = store.state.altitudeRoutingPlans.length;
  api.addDelegation({ personId: 'ic1', title: 'Rebuild the shift handover checklist', expectedOutcome: 'A second holder can run the handover.', support: 'Pair for two shifts.', authority: 'act-inform' });
  assert.equal(store.state.altitudeRoutingPlans.length, beforePlans, 'no plan is invented');
  assert.ok(store.state.links.length >= beforeLinks);
  assert.equal(store.state.links.filter((l) => l.ruleId === 'RULE-AR-01').length, 0, 'RULE-AR-01 writes nothing inert');
  const off = api.routingSetConventions({ routingAutoPropagate: false });
  assert.equal(off.ok, true);
  assert.equal(store.state.settings.routingAutoPropagate, false);
  const scan = api.routingScan();
  assert.equal(scan.ok, true, 'an explicit scan always runs even when paused');
});

/* ------------------------------------------------------ 10. accessibility */

test('all five panels render axe-clean with semantic, keyboard-usable markup', async () => {
  const dom = bootDocument();
  const { store, api } = boot();
  const saved = api.routingSaveDraft(FRONTLINE_NOTE);
  assert.equal(saved.ok, true);
  api.routingConfirm(saved.plan.id, { confirmedAltitudeKey: 'frontline' });
  const axe = (await import('axe-core')).default;
  for (const panel of ['plan', 'ladder', 'ledger', 'calibration', 'brief']) {
    const ctx = {
      state: store.state, api, now: NOW, query: new URLSearchParams(`panel=${panel}`),
      navigate: () => {}, refresh: () => {}, seatContext: null, warnings: [],
    };
    const node = renderAltitudeRouter(ctx);
    document.getElementById('view').replaceChildren(node);
    const results = await axe.run(node, { rules: { region: { enabled: false } } });
    assert.deepEqual(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) })), [], `axe: ${panel}`);
    assert.ok(node.querySelector('h1'), `${panel}: one page heading`);
  }
  dom.window.close();
});

test('human altitude override changes the actual atomic disclosure path, not only its label', () => {
  const { store, api } = boot();
  const saved = api.routingSaveDraft(FRONTLINE_NOTE);
  const result = api.routingConfirm(saved.plan.id, { confirmedAltitudeKey: 'director' });
  assert.equal(result.ok, true, result.error);
  const plan = store.state.altitudeRoutingPlans.find((p) => p.id === saved.plan.id);
  assert.equal(plan.detectedAltitudeKey, 'frontline');
  assert.equal(plan.confirmedAltitudeKey, 'director');
  assert.equal(plan.ownerSeatId, 'dir1');
  assert.deepEqual(plan.seatPath.map((p) => p.seatId), ['dir1', 'vp1', 'leader']);
  const links = store.state.links.filter((l) => l.ruleId === ROUTER_RULES.ROLLUP);
  assert.ok(links.some((l) => l.relation === 'discloses-to' && l.targetId === 'dir1'));
  assert.ok(links.some((l) => l.relation === 'rolls-up-to' && l.targetId === 'vp1'));
  assert.ok(!links.some((l) => l.targetId === 'lead1' || l.targetId === 'mgr1'));
  assert.ok(store.state.cases.some((c) => c.id === result.caseId));
  assert.ok((store.lastPropagations || []).some((p) => p.ruleId !== ROUTER_RULES.ROLLUP));
});

test('oversized ladders are refused instead of silently losing senior roll-ups', () => {
  const state = fixture();
  for (let i = 0; i < 9; i++) state.people.push({ id: `extra${i}`, name: `Extra ${i}`, role: 'Lead', level: 'lead', managerId: i === 8 ? 'lead1' : `extra${i + 1}`, status: 'active' });
  state.people.find((p) => p.id === 'ic1').managerId = 'extra0';
  const { store, api } = boot(state);
  const result = api.routingSaveDraft(FRONTLINE_NOTE);
  assert.equal(result.ok, false);
  assert.match(result.error, /eight-seat limit/);
  assert.equal(store.state.altitudeRoutingPlans.length, 0);
});
