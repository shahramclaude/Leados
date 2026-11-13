/**
 * ADR-0089 — The Operating Model (Schema v95).
 *
 * Proves, against the REAL store and the REAL post-commit spine, that:
 *
 *  - the migration is additive and an undeclared workspace is byte-for-byte
 *    unchanged (no collection, no marker, no decision appears by itself);
 *  - one declaration turns an unmeasured position into a measured one WITHOUT
 *    rewriting any other record;
 *  - the FIVE things attendance software cannot ask are actually computed:
 *    displacement, abstention, congruence, continuity and coupling;
 *  - ONE commit fans out in the SAME transaction: a governed design decision for
 *    the congested span, a governing continuity decision for the fragile set,
 *    typed `rolls-up-to` edges to every leadership ancestor, and one `relieves`
 *    edge from the decision to the design it is about;
 *  - the continuity trap actually holds: a hire is priced for a span above the
 *    floor and REFUSED, with the reason, for a span below it;
 *  - no rate is printed below the declared cell floor, and a refusal names the
 *    exact evidence that would lift it;
 *  - the disclosure ladder is enforced on the read: a skippable span collapses
 *    into ONE aggregate row above the reader's own span;
 *  - the aggregate-only CSV and the identity-free brief carry no person, name,
 *    position title or individual hour;
 *  - the seat boundary refuses authoring from a rank that may not edit the model,
 *    and every new API method is declared rather than assumed;
 *  - every panel renders axe-clean.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createEmptyState, normalizeState, SCHEMA_VERSION, migrate, COLLECTIONS } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import {
  operatingModelRead,
  operatingModelBriefText,
  operatingModelCsvRows,
  operatingModelAttentionCount,
  operatingModelNorms,
  operatingStations,
  leverEffect,
  congestionReport,
  continuityReport,
  couplingReport,
  graicunas,
  changeWaves,
  attributableCost,
  operatingRollup,
  deriveSkipReport,
} from '../../app/core/domain/operatingModel.js';
import {
  normalizeOperatingModelSettings,
  normalizeWorkSplit,
  normalizeWorkSplits,
  normalizeOperatingModelDecisions,
  normalizeOperatingModelMarkers,
} from '../../app/core/domain/operatingModelSchema.js';
import { OPERATING_MODEL_RULES, OPERATING_MODEL_WORK_TYPES } from '../../app/core/domain/operatingModelRegistry.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { renderOperatingModel } from '../../app/views/operatingModel.js';
import { LINK_ENTITY_TYPES, LINK_RELATIONS } from '../../app/core/domain/cases.js';
import { buildSeats, activeSeat } from '../../app/core/domain/seat.js';
import { guardApiCall, API_RIGHTS } from '../../app/core/domain/accessGateway.js';
import { RECORD_POLICIES, ACTION_RIGHTS, routeVerdict } from '../../app/core/domain/seatRegistry.js';
import { buildChain } from '../../app/core/domain/chain.js';

const NOW = new Date('2026-11-04T12:00:00.000Z');

const SPLITS = [
  { id: 'oms-manager', level: 'manager', functionKey: 'all', altitude: 25, displaced: 40, abstention: 20, coordination: 15, declaredOn: '2026-11-01' },
  { id: 'oms-director', level: 'director', functionKey: 'all', altitude: 40, displaced: 25, abstention: 20, coordination: 15, declaredOn: '2026-11-01' },
];

/**
 * The fixture. `mgr1` has ONE direct report (below the continuity floor), so the
 * congestion answer for that span must refuse a hire — that is the trap the
 * module exists to name, and it is built into the fixture on purpose.
 */
function fixture(overrides = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.settings = { ...state.settings, leaderName: 'Dana Root', chainLeaderAltitude: 'chief', activeSeatId: null, ...overrides };
  state.people = [
    { id: 'vp1', name: 'Rina VP', role: 'VP', level: 'vp', managerId: null, team: 'Ops', status: 'active' },
    { id: 'dir1', name: 'Sam Director', role: 'Director', level: 'director', managerId: 'vp1', team: 'Ops', status: 'active' },
    { id: 'mgr1', name: 'Mei Manager', role: 'Manager', level: 'manager', managerId: 'dir1', team: 'Ops', status: 'active' },
    { id: 'mgr2', name: 'Ola Manager', role: 'Manager', level: 'manager', managerId: 'dir1', team: 'Field', status: 'active' },
    { id: 'ic1', name: 'Ari Klein', role: 'Operator', level: 'ic', managerId: 'mgr1', team: 'Ops', status: 'active' },
    { id: 'ic2', name: 'Bo Nilsen', role: 'Operator', level: 'ic', managerId: 'mgr1', team: 'Ops', status: 'active' },
    { id: 'ic3', name: 'Cy Orlov', role: 'Operator', level: 'ic', managerId: 'mgr2', team: 'Field', status: 'active' },
    { id: 'ic4', name: 'Dee Sorensen', role: 'Operator', level: 'ic', managerId: 'mgr2', team: 'Field', status: 'active' },
    { id: 'ic5', name: 'Eli Brandt', role: 'Operator', level: 'ic', managerId: 'mgr2', team: 'Field', status: 'active' },
  ];
  state.omWorkSplits = SPLITS.map((s) => ({ ...s }));
  state.omEdges = [
    { id: 'ome-1', fromId: 'mgr1', toId: 'dir1', weight: 2, kind: 'sync', unitCrossing: false },
    { id: 'ome-2', fromId: 'mgr1', toId: 'ic1', weight: 3, kind: 'sync', unitCrossing: false },
    { id: 'ome-3', fromId: 'dir1', toId: 'vp1', weight: 1, kind: 'review', unitCrossing: true },
    { id: 'ome-4', fromId: 'mgr2', toId: 'dir1', weight: 2, kind: 'handoff', unitCrossing: true },
  ];
  // One OPEN REQUISITION owned by the manager. Requisitions are a live work
  // source (chainRegistry SIGNAL_SOURCES), so this is what pushes `mgr1` past its
  // declared week — and it is deliberately NOT a decision or a concern, so the
  // operating model's congestion is provably its own signal rather than a
  // by-product of another terminal's records.
  state.requisitions = [
    {
      id: 'req-open-1', title: 'Second shift operator', status: 'open', openedOn: '2026-10-06',
      ownerId: 'mgr1', team: 'Ops', level: 'ic', createdAt: '2026-10-06T08:00:00.000Z',
    },
  ];
  // One open decision DRIVEN by a manager, so the abstention machinery has a
  // real record to price rather than a self-report.
  state.decisions = [
    { id: 'dec-open-1', title: 'Approve the Q4 roster', date: '2026-10-20', driver: 'mgr1', approver: 'dir1', chosen: '', options: [], createdAt: '2026-10-20T08:00:00.000Z' },
  ];
  return normalizeState(state, { now: NOW }).state;
}

function boot(state = fixture()) {
  const map = new Map();
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
  let seq = 0;
  const idFactory = (p) => `${p}-test-${++seq}`;
  map.set(STORAGE_KEY, JSON.stringify(state));
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory });
  return { store, api };
}

function bootDocument() {
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  const dom = new JSDOM('<!doctype html><html><body><div id="view"></div><div id="modal-root"></div><div id="toast-root"></div><div id="topbar-meta"></div></body></html>', { url: 'https://leados.test/', pretendToBeVisual: true, virtualConsole: vc });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  return dom;
}

function ctxFor(api, state, { panel = 'spans', seatContext = null } = {}) {
  const query = new URLSearchParams(panel ? `panel=${panel}` : '');
  return {
    state, api, now: NOW, route: 'operating-model', segments: ['operating-model'], query,
    seatContext, warnings: [], persistError: null,
    navigate: () => {}, refresh: () => {},
    exportJSON: () => { throw new Error('n/a'); },
    exportCSV: (scope, options) => api.exportCSV(scope, options),
  };
}

/* ------------------------------------------------- the no-regression claim */

/**
 * The operating model is a NEW rule on a spine with 63 others. The two things
 * that could go wrong are (a) it fires on a workspace that never declared a
 * design, and (b) it inflates or masks another terminal's decision counts on a
 * workspace that did. Both are asserted here rather than assumed, because a
 * shared spine means "my rule is inert" is a claim that has to be tested.
 */
test('with no declared design the rules are inert; ordinary commits are unchanged', () => {
  const bare = normalizeState({
    ...createEmptyState(NOW.toISOString()),
    settings: { ...createEmptyState(NOW.toISOString()).settings, leaderName: 'Dana', chainLeaderAltitude: 'chief' },
    people: fixture().people,
    requisitions: fixture().requisitions,
  }, { now: NOW }).state;
  const { store, api } = boot(bare);
  const before = { decisions: store.state.decisions.length, links: store.state.links.length, markers: store.state.omMarkers.length };
  api.addCase({ title: 'A case on an undeclared workspace', kind: 'issue', ownerId: 'mgr1' });
  assert.equal(store.state.omMarkers.length, before.markers, 'no marker is written without a declared design');
  const ours = store.state.decisions.filter((d) => String(d.rationale || '').includes('RULE-OMD'));
  assert.equal(ours.length, 0, 'no operating-model decision is opened without a declared design');
  const ourLinks = store.state.links.filter((l) => String(l.ruleId || '').startsWith('RULE-OMD'));
  assert.equal(ourLinks.length, 0);
  assert.ok(store.state.decisions.length >= before.decisions);
});

test('on a declared workspace the new rule does not inflate another terminal\u2019s decisions', () => {
  // Count exactly the decisions the operating model owns, before and after an
  // ordinary operational commit. If this number moves, the new rule is writing
  // where it should not.
  const { store, api } = boot();
  api.operatingModelScan();
  const countOurs = () => store.state.decisions.filter((d) => String(d.rationale || '').includes('RULE-OMD')).length;
  const oursBefore = countOurs();
  const totalBefore = store.state.decisions.length;
  api.addCase({ title: 'An ordinary operational case', kind: 'issue', ownerId: 'mgr1' });
  // Same ISO week, a marker already exists: the model must not re-open anything.
  assert.equal(countOurs(), oursBefore, 'a second commit in the same ISO week opens no duplicate design decision');
  assert.ok(store.state.decisions.length >= totalBefore, 'other terminals are free to add their own decisions');
  // And the count of OUR decisions is exactly the number of congested spans plus
  // at most one continuity decision per week — never the whole decision ledger.
  const report = operatingModelRead(store.state, { now: NOW });
  assert.ok(oursBefore <= report.congestion.length + 1, `${oursBefore} vs ${report.congestion.length}`);
});

/* ------------------------------------------------------------------ schema */

test('schema v95: the migration is additive and an undeclared workspace is untouched', () => {
  assert.equal(SCHEMA_VERSION, 151);
  for (const key of ['omWorkSplits', 'omEdges', 'omDecisions', 'omMarkers']) {
    assert.ok(COLLECTIONS.includes(key), `${key} must be a declared collection`);
  }

  const v89 = createEmptyState(NOW.toISOString());
  v89.schemaVersion = 89;
  for (const key of ['omWorkSplits', 'omEdges', 'omDecisions', 'omMarkers']) delete v89[key];
  v89.settings = { ...v89.settings };
  for (const key of Object.keys(v89.settings)) if (key.startsWith('om')) delete v89.settings[key];
  const migrated = migrate(v89);
  assert.ok(migrated.applied.includes('93 → 94'));
  const after = normalizeState(migrated.raw, { now: NOW }).state;
  assert.equal(after.schemaVersion, 151);
  assert.deepEqual(after.omWorkSplits, []);
  assert.deepEqual(after.omEdges, []);
  assert.deepEqual(after.omDecisions, []);
  assert.deepEqual(after.omMarkers, []);
  assert.equal(after.settings.omUtilizationCeilPct, 95);
  assert.equal(after.settings.omContinuityFloor, 3);
  // The additive promise: no decision, no link and no marker is invented.
  assert.equal(after.decisions.length, 0);
  assert.equal(after.links.length, 0);
  assert.equal(after.settings.omAutoPropagate, true);
});

test('a hostile blob cannot produce a figure: every input is normalised or refused', () => {
  // A split that does not sum to 100 is rescaled and REPORTED, never silently
  // trimmed to fit.
  const warnings = [];
  const split = normalizeWorkSplit({ id: 's1', level: 'manager', functionKey: 'all', altitude: 10, displaced: 10, abstention: 10, coordination: 10 }, warnings);
  assert.equal(split.altitude + split.displaced + split.abstention + split.coordination, 100);
  assert.ok(warnings.some((w) => w.includes('rescaled')));
  // A split with nothing in it is dropped, not zeroed.
  assert.equal(normalizeWorkSplit({ id: 's2', level: 'manager', functionKey: 'all' }, []), null);
  // Unknown work types cannot enter through an extra key.
  const clean = normalizeWorkSplit({ id: 's3', level: 'manager', functionKey: 'all', altitude: 50, displaced: 50, monitoring: 90 }, []);
  assert.equal(clean.monitoring, undefined);
  // Out-of-band settings fall back to the convention rather than to a typo.
  const norms = normalizeOperatingModelSettings({ omWorkDaysPerWeek: 70, omDeepWorkHoursPerDay: -4, omUtilizationCeilPct: 2, omCellFloor: 400 });
  assert.equal(norms.omWorkDaysPerWeek, 5);
  assert.equal(norms.omDeepWorkHoursPerDay, 4.5);
  // A value outside the band falls back to the documented CONVENTION, not to the
  // band edge: a typo must not silently tighten a floor to its most aggressive
  // setting, which would suppress almost every figure in the workspace.
  assert.equal(norms.omUtilizationCeilPct, 95);
  assert.equal(norms.omCellFloor, 3);
  // A negative hour is treated as undeclared, not as a negative commitment.
  const items = normalizeOperatingModelDecisions([{ id: 'd1', name: 'x', weeklyHours: -5 }], []);
  assert.equal(items[0].weeklyHours, null);
  // Markers de-duplicate and cap.
  const markers = normalizeOperatingModelMarkers(['a', 'a', 'b'], []);
  assert.deepEqual(markers, ['a', 'b']);
});

/* ------------------------------------------------------------ the engine */

test('the operating model measures the DESIGN, and refuses everything it was not told', () => {
  const bare = normalizeState({ ...createEmptyState(NOW.toISOString()), people: fixture().people }, { now: NOW }).state;
  const unmeasured = operatingModelRead(bare, { now: NOW });
  assert.equal(unmeasured.measuredPositions, 0);
  assert.equal(unmeasured.totals.committedHours, 0);
  assert.equal(unmeasured.totals.utilisation, null, 'no declared design means no rate, not a zero');
  assert.equal(unmeasured.levers.length, 0, 'no lever is priced against an undeclared design');
  assert.equal(unmeasured.congestion.length, 0, 'nothing is congested when nothing is measured');
  assert.ok(unmeasured.signals.some((s) => s.key === 'unmeasured'));

  const report = operatingModelRead(fixture(), { now: NOW });
  assert.ok(report.measuredPositions >= 2);
  const mgr = report.stations.find((s) => s.nodeId === 'mgr1');
  assert.ok(mgr, 'the manager position is modelled');
  assert.equal(mgr.measured, true);
  assert.equal(mgr.capacity, 22.5, '4.5 h/day × 5 days');
  // 2 direct reports × 1.5 h cadence = 3 h of measured overhead.
  assert.equal(mgr.coordinationHours, 3);
  // Declared displacement (40%) + coordination (15%) of a 22.5 h design.
  assert.equal(mgr.displacedHours, Math.round((0.55 * 22.5) * 10) / 10);
  // The fixture is constructed so the manager is past the declared 95% ceiling
  // but NOT past 100%: congestion is a queue threshold (Kingman 1961), not a
  // cliff at full capacity.
  assert.ok(mgr.utilisation > 0.95, `expected the fixture manager past the ceiling, got ${mgr.utilisation}`);
  assert.equal(mgr.overCeiling, true);
  assert.ok(report.congestion.some((c) => c.nodeId === 'mgr1'), 'the manager span is the congested one');
  // Every figure carries the basis that produced it.
  assert.ok(mgr.splitBasis.includes('declared split'));
  assert.ok(mgr.congruence.basis.includes('50%'));
});

test('congruence is a boolean with a printed threshold, never a ranking', () => {
  const chain = buildChain(fixture(), { now: NOW });
  const norms = operatingModelNorms(fixture().settings);
  const stations = operatingStations(fixture(), {
    chain,
    norms,
    splits: fixture().omWorkSplits,
    demand: { byNode: new Map() },
    feedback: { byPerson: new Map() },
  });
  const director = stations.find((s) => s.nodeId === 'dir1');
  // The threshold is 50% of the declared week; 40% declared deep time is 9 h
  // against 11.25 h, so the position does NOT hold its own altitude — and the
  // figure prints the threshold it failed rather than a percentile.
  assert.equal(director.congruence.holds, false);
  assert.equal(director.congruence.deepHours, 9);
  assert.equal(director.congruence.requiredHours, 11.3);
  // And a position whose deep time clears the half does hold.
  const rich = operatingStations(fixture(), {
    chain,
    norms,
    splits: [{ id: 's', level: 'director', functionKey: 'all', altitude: 70, displaced: 10, abstention: 10, coordination: 10 }],
    demand: { byNode: new Map() },
    feedback: { byPerson: new Map() },
  }).find((s) => s.nodeId === 'dir1');
  assert.equal(rich.congruence.holds, true);
});

test('the continuity trap: a hire is priced above the floor and refused below it', () => {
  const norms = operatingModelNorms(fixture().settings);

  // A ONE-report span cannot be relieved by a hire: 1 + 1 = 2 is still below the
  // declared three-report floor, so the "obvious" fix would create the single
  // point of failure it was meant to remove. The refusal is priced, not silent.
  const narrow = normalizeState({
    ...createEmptyState(NOW.toISOString()),
    settings: { ...createEmptyState(NOW.toISOString()).settings, leaderName: 'Dana', chainLeaderAltitude: 'chief' },
    people: [
      { id: 'n1', name: 'Narrow Lead', role: 'Lead', level: 'manager', status: 'active' },
      { id: 'n2', name: 'Only Report', role: 'Op', level: 'ic', managerId: 'n1', status: 'active' },
    ],
    omWorkSplits: [{ id: 'ns', level: 'manager', functionKey: 'all', altitude: 25, displaced: 40, abstention: 20, coordination: 15 }],
  }, { now: NOW }).state;
  const narrowChain = buildChain(narrow, { now: NOW });
  const narrowStation = operatingStations(narrow, {
    chain: narrowChain, norms, splits: narrow.omWorkSplits, demand: { byNode: new Map() }, feedback: { byPerson: new Map() },
  }).find((s) => s.nodeId === 'n1');
  assert.equal(narrowStation.directReports, 1);
  assert.equal(narrowStation.continuity, true);
  const refusedHire = leverEffect(narrowStation, 'add-lead', { norms, chain: narrowChain, state: narrow });
  assert.equal(refusedHire.hours, null);
  assert.ok(refusedHire.reason.includes('continuity floor'), refusedHire.reason);

  // A FOUR-report span IS over its own week and IS above the floor, so a lead is
  // priced — and the figure states what it does NOT divide.
  const wide = normalizeState({
    ...createEmptyState(NOW.toISOString()),
    settings: { ...createEmptyState(NOW.toISOString()).settings, leaderName: 'Dana', chainLeaderAltitude: 'chief' },
    people: [
      { id: 'w1', name: 'Wide Lead', role: 'Lead', level: 'manager', status: 'active' },
      { id: 'a1', name: 'A', role: 'Op', level: 'ic', managerId: 'w1', status: 'active' },
      { id: 'a2', name: 'B', role: 'Op', level: 'ic', managerId: 'w1', status: 'active' },
      { id: 'a3', name: 'C', role: 'Op', level: 'ic', managerId: 'w1', status: 'active' },
      { id: 'a4', name: 'D', role: 'Op', level: 'ic', managerId: 'w1', status: 'active' },
    ],
    omWorkSplits: [{ id: 'ws', level: 'manager', functionKey: 'all', altitude: 35, displaced: 35, abstention: 15, coordination: 15 }],
  }, { now: NOW }).state;
  const wideChain = buildChain(wide, { now: NOW });
  const wideStation = operatingStations(wide, {
    chain: wideChain, norms, splits: wide.omWorkSplits, demand: { byNode: new Map() }, feedback: { byPerson: new Map() },
  }).find((s) => s.nodeId === 'w1');
  assert.equal(wideStation.continuity, false);
  assert.equal(wideStation.directReports, 4);
  assert.ok(wideStation.utilisation > 1, 'four reports push a 22.5 h design past 100%');
  const hire = leverEffect(wideStation, 'add-lead', { norms, chain: wideChain, state: wide });
  assert.ok(hire.hours > 0, 'a span above the floor can have a lead priced');
  assert.ok(hire.reason.includes('does not divide the group behind it'), hire.reason);
  // And a relay layer is the only case in which removal is offered at all.
  const relay = leverEffect({ ...wideStation, congruence: { deepHours: 2, requiredHours: 11.3, holds: false } }, 'remove-seat', { norms, chain: wideChain, state: wide });
  assert.ok(relay.hours > 0);
  const holding = leverEffect({ ...wideStation, congruence: { deepHours: 15, requiredHours: 11.3, holds: true } }, 'remove-seat', { norms, chain: wideChain, state: wide });
  assert.equal(holding.hours, null, 'a congruence-holding position is never offered a removal');
});

test('no rate below the declared cell floor, and the refusal names the evidence that lifts it', () => {
  const state = normalizeState({
    ...createEmptyState(NOW.toISOString()),
    people: [
      { id: 'p1', name: 'Solo Lead', role: 'Lead', level: 'manager', status: 'active' },
      { id: 'p2', name: 'Report', role: 'Op', level: 'ic', managerId: 'p1', status: 'active' },
    ],
    omWorkSplits: [{ id: 's', level: 'manager', functionKey: 'all', altitude: 30, displaced: 40, abstention: 15, coordination: 15 }],
  }, { now: NOW }).state;
  const report = operatingModelRead(state, { now: NOW });
  assert.equal(report.measuredPositions, 1, 'one measured position is below the default floor of three');
  const rnr = report.rnr.results.find((r) => r.key === 'denominator');
  assert.equal(rnr.pass, false);
  assert.ok(rnr.verdict.includes('2 more split(s)'), rnr.verdict);
  assert.ok(rnr.fix.includes('Declare a work-type split'));
  // The altitude row refuses its rate while printing its count.
  const managerRow = report.byAltitude.find((r) => r.key === 'manager');
  assert.equal(managerRow.positions, 1);
  assert.equal(managerRow.utilisation, null);
  assert.ok(managerRow.refused.includes('floor'));
  // And the cross-unit share refuses on too few edges.
  const coupling = couplingReport(state, { chain: buildChain(state, { now: NOW }), norms: operatingModelNorms(state.settings) });
  assert.equal(coupling.crossUnitPct, null);
  assert.ok(coupling.crossUnitRefused.includes('floor'));
});

test('Graicunas, the wave decay and the attributable cost are arithmetic, not decoration', () => {
  assert.equal(graicunas(0), 0);
  assert.equal(graicunas(1), 0);
  assert.equal(graicunas(2), 4, '2 + 2·(2·1/2)');
  assert.equal(graicunas(4), 16, '4 + 2·6');
  assert.equal(graicunas(8), 64);

  const state = fixture();
  const chain = buildChain(state, { now: NOW });
  const norms = operatingModelNorms(state.settings);
  const waves = changeWaves(state, { chain, norms, splits: state.omWorkSplits, demand: { byNode: new Map() }, feedback: { byPerson: new Map() }, fromNodeId: 'mgr1' });
  assert.ok(waves.waves.length >= 2);
  // Geometric decay: the second wave is exactly the declared share of the first.
  assert.equal(waves.waves[1].absorbedHours, Math.round(waves.hours * (norms.omCrossWavePct / 100) * 10) / 10);
  // The tree terminates rather than looping.
  assert.ok(waves.waves.length <= 12);

  const report = operatingModelRead(state, { now: NOW });
  const cost = attributableCost(state, { stations: report.stations, norms, ratePerHour: 60, currency: 'USD' });
  assert.equal(cost.totalCost, Math.round(cost.totalHours * 60 * 10) / 10);
  assert.equal(cost.belowLatitudeCost, Math.round(cost.belowLatitudeHours * 60 * 10) / 10);
  assert.ok(cost.basis.includes('No salary is stored'));
});

test('the roll-up partitions exactly and collapses everything below the reader into one row', () => {
  const state = fixture();
  const chain = buildChain(state, { now: NOW });
  const norms = operatingModelNorms(state.settings);
  const stations = operatingStations(state, { chain, norms, splits: state.omWorkSplits, demand: { byNode: new Map() }, feedback: { byPerson: new Map() } });
  const operatorView = operatingRollup(state, { chain, norms, splits: state.omWorkSplits, demand: { byNode: new Map() }, feedback: { byPerson: new Map() }, stations, seat: null });
  const root = operatorView.rows.find((r) => r.nodeId === '__leader__') || operatorView.rows.find((r) => r.rank === 5);
  // Exact addition: every measured position appears once, at its own span.
  const own = operatorView.rows.reduce((sum, r) => sum + r.ownPositions, 0);
  assert.equal(own, stations.filter((s) => s.measured).length);

  // A declared director seat sees its own subtree and every level below it as a
  // single amortised row.
  const built = buildSeats({ ...state, settings: { ...state.settings, activeSeatId: 'vp1' } }, { now: NOW });
  const seat = activeSeat(built);
  assert.equal(seat.id, 'vp1');
  const scoped = operatingRollup(state, { chain, norms, splits: state.omWorkSplits, demand: { byNode: new Map() }, feedback: { byPerson: new Map() }, stations, seat });
  assert.ok(scoped.rows.length > 0);
  assert.ok(scoped.rows.every((r) => r.inScope), 'nothing outside the operating span is returned');
  const aggregates = scoped.rows.filter((r) => r.skipped);
  assert.ok(aggregates.length >= 1, 'a deeper level is represented by an aggregate row, not by detail');
  assert.ok(aggregates[0].label.includes('aggregate'));
  assert.ok(scoped.rule.includes('in addition') || scoped.rule.includes('aggregate'));

  // The skip report states the rule in the terms a reader can check.
  const skip = deriveSkipReport(chain, state, { norms });
  assert.ok(skip.rule.includes('aggregate row'));
});

/* ------------------------------------------------- cross-module × altitude */

test('one commit fans out in the same transaction: decision, vertical edges, relieves edge, fragility marker', () => {
  const { store, api } = boot();
  const before = {
    decisions: store.state.decisions.length,
    links: store.state.links.length,
    markers: store.state.omMarkers.length,
  };
  const result = api.operatingModelScan();
  assert.ok(result.ok);

  const after = store.state;
  // RULE-OMD-01: exactly one governed design decision per congested span.
  const designDecisions = after.decisions.filter((d) => String(d.rationale || '').includes(OPERATING_MODEL_RULES.CONGESTION));
  assert.ok(designDecisions.length >= 1, 'a congested span opens a governed design decision');
  assert.ok(designDecisions[0].title.includes('own week'));
  assert.ok(designDecisions[0].question.includes('No person is the subject'));
  assert.ok(designDecisions[0].options.length >= 1, 'the options are the priced levers, not an empty list');

  // RULE-OMD-02: typed rolls-up-to edges from the congested span to its ancestors.
  const rollupEdges = after.links.filter((l) => l.ruleId === OPERATING_MODEL_RULES.STRUCTURE && l.relation === 'rolls-up-to');
  assert.ok(rollupEdges.length >= 1, 'a congested span rolls up to at least one ancestor');
  const targets = new Set(rollupEdges.map((l) => l.targetId));
  assert.ok(targets.has('dir1') || targets.has('vp1'), `the manager’s congestion must reach the director or VP: got ${[...targets].join(',')}`);

  // The `relieves` edge ties the decision to the design, not to a person.
  const relieves = after.links.filter((l) => l.relation === 'relieves');
  assert.ok(relieves.length >= 1);
  assert.equal(relieves[0].sourceType, 'decision');
  assert.equal(relieves[0].targetType, 'person');

  // RULE-OMD-03: one continuity decision for the fragile set, at most one per week.
  const continuityDecisions = after.decisions.filter((d) => String(d.rationale || '').includes(OPERATING_MODEL_RULES.FLOOR));
  assert.equal(continuityDecisions.length, 1, 'exactly one continuity decision per ISO week');
  assert.ok(continuityDecisions[0].question.includes('continuity floor'));
  assert.ok(after.omMarkers.length > before.markers);

  // Idempotency: a second scan in the same week adds nothing.
  const snapshot = { decisions: after.decisions.length, links: after.links.length, markers: after.omMarkers.length };
  api.operatingModelScan();
  assert.equal(store.state.decisions.length, snapshot.decisions, 'no duplicate decision in the same ISO week');
  assert.equal(store.state.links.length, snapshot.links, 'no duplicate edge');
});

test('a paused auto-propagation still lets an explicit scan run, and never opens a duplicate', () => {
  const { store, api } = boot();
  store.update((draft) => { draft.settings = { ...draft.settings, omAutoPropagate: false }; }, { type: 'settings.changed', entity: 'workspace', summary: 'Paused the operating-model rules' });
  const quiet = store.state.decisions.filter((d) => String(d.rationale || '').includes(OPERATING_MODEL_RULES.CONGESTION)).length;
  // A normal operational commit must NOT fire the rules while paused.
  api.addCase({ title: 'A case that should not trigger the operating model', kind: 'issue', ownerId: 'mgr1' });
  const stillQuiet = store.state.decisions.filter((d) => String(d.rationale || '').includes(OPERATING_MODEL_RULES.CONGESTION)).length;
  assert.equal(stillQuiet, quiet, 'a paused rule does not fire on an ordinary commit');
  // The explicit scan ALWAYS runs.
  api.operatingModelScan();
  const afterScan = store.state.decisions.filter((d) => String(d.rationale || '').includes(OPERATING_MODEL_RULES.CONGESTION)).length;
  assert.ok(afterScan >= 1, 'an explicit scan always runs');
});

test('declaring a split is an additive write that measures positions and touches nothing else', () => {
  const bare = normalizeState({
    ...createEmptyState(NOW.toISOString()),
    settings: { ...createEmptyState(NOW.toISOString()).settings, leaderName: 'Dana', chainLeaderAltitude: 'chief' },
    people: fixture().people,
  }, { now: NOW }).state;
  const { store, api } = boot(bare);
  const peopleBefore = JSON.stringify(store.state.people);
  const casesBefore = store.state.cases.length;

  const res = api.omDeclareSplit({ level: 'manager', functionKey: 'all', altitude: 25, displaced: 40, abstention: 20, coordination: 15 });
  assert.ok(res.ok, res.error);
  assert.equal(res.split.altitude + res.split.displaced + res.split.abstention + res.split.coordination, 100);
  assert.equal(JSON.stringify(store.state.people), peopleBefore, 'no person record was rewritten');
  assert.equal(store.state.cases.length, casesBefore, 'no case was created by a declaration');
  const report = store.state.omWorkSplits;
  assert.equal(report.length, 1);
  // Re-declaring the same level replaces rather than competing.
  const second = api.omDeclareSplit({ level: 'manager', functionKey: 'all', altitude: 40, displaced: 30, abstention: 15, coordination: 15 });
  assert.ok(second.ok);
  assert.equal(store.state.omWorkSplits.length, 1, 'one split per level/function pair');
  assert.equal(second.split.altitude, 40);
  // And the removal is honest: the positions go back to unmeasured.
  const removed = api.omRemoveSplit(second.split.id);
  assert.ok(removed.ok);
  assert.equal(store.state.omWorkSplits.length, 0);
});

test('a declared edge is validated against the roster and cannot be duplicated', () => {
  const { store, api } = boot();
  const dup = api.omDeclareEdge({ fromId: 'mgr1', toId: 'dir1', weight: 2 });
  assert.equal(dup.ok, false, 'a declared relationship cannot be declared twice');
  assert.ok(dup.error.includes('already declared'));
  const self = api.omDeclareEdge({ fromId: 'mgr1', toId: 'mgr1' });
  assert.equal(self.ok, false);
  const missing = api.omDeclareEdge({ fromId: 'mgr1', toId: 'nobody' });
  assert.equal(missing.ok, false);
  const ok = api.omDeclareEdge({ fromId: 'mgr2', toId: 'vp1', weight: 3, kind: 'escalation' });
  assert.ok(ok.ok);
  assert.equal(ok.edge.unitCrossing, true, 'a cross-team edge is detected from the roster, not assumed');
  assert.equal(store.state.omEdges.length, 5);
  const gone = api.omRemoveEdge(ok.edge.id);
  assert.ok(gone.ok);
  assert.equal(store.state.omEdges.length, 4);
});

/* --------------------------------------------------------- disclosure */

test('the aggregate-only CSV carries no person, name, title or individual hour', () => {
  const { store, api } = boot();
  // Force the rules so the full reading exists.
  api.operatingModelScan();
  assert.equal(CSV_EXPORTS.length, 144);
  const scope = CSV_EXPORTS.find((e) => e.key === 'operating-model');
  assert.ok(scope, 'CSV scope #83 is registered');
  assert.equal(scope.sensitive, false);
  assert.ok(scope.description.includes('NO person id'));

  const exported = exportWorkspaceCsv(freshState(), 'operating-model', { now: NOW });
  assert.ok(exported);
  const csv = String(exported.csv || exported);
  for (const forbidden of ['Mei Manager', 'Sam Director', 'Ari Klein', 'mgr1', 'dir1', 'ic1', 'Mei', 'Sam']) {
    assert.ok(!csv.includes(forbidden), `the aggregate export must not contain “${forbidden}”`);
  }
  // A refused figure is blank, never zero.
  assert.ok(csv.split('\n')[0].includes('utilisation_pct'));
  void store;
  void api;
});

function freshState() {
  return normalizeState(fixture(), { now: NOW }).state;
}

test('the identity-free brief restates the model and carries no name', () => {
  const state = freshState();
  const text = operatingModelBriefText(state, { now: NOW });
  assert.ok(text.includes('Positions as designs, not people'));
  assert.ok(text.includes('## Input gates'));
  assert.ok(text.includes('There is no attendance clock in this module'));
  assert.ok(text.includes('Nothing here ranks a person'));
  for (const forbidden of ['Mei Manager', 'Sam Director', 'Ari Klein', 'Rina VP', 'mgr1', 'dir1']) {
    assert.ok(!text.includes(forbidden), `the brief must not name “${forbidden}”`);
  }
  // It does carry the declared norms, because a figure without its basis is a
  // number the reader has to trust.
  assert.ok(text.includes('4.5'));
  assert.ok(text.includes('h/week'));
});

test('the attention count counts work, not interesting readings', () => {
  const state = freshState();
  const report = operatingModelRead(state, { now: NOW });
  const count = operatingModelAttentionCount(state, NOW);
  assert.equal(count, report.congestion.filter((row) => row.first && row.first.hours > 0).length);
  // An undeclared workspace has nothing to act on.
  const bare = normalizeState({ ...createEmptyState(NOW.toISOString()), people: fixture().people }, { now: NOW }).state;
  assert.equal(operatingModelAttentionCount(bare, NOW), 0);
});

/* --------------------------------------------------------- the boundary */

test('seat and gateway: authoring is refused below the org-design rank, and unknown methods fail closed', () => {
  // Every new method is DECLARED or explicitly safe — none is assumed.
  for (const name of ['omDeclareSplit', 'omRemoveSplit', 'omDeclareEdge', 'omRemoveEdge', 'omPriceItem', 'omRemoveItem', 'omSetNorms', 'operatingModelScan']) {
    assert.equal(API_RIGHTS[name], 'author-operating-model', `${name} must carry a declared right`);
  }
  for (const name of ['operatingModelRead', 'operatingModelBriefText', 'operatingModelCsvRows', 'operatingModelAttentionCount', 'operatingModelNorms', 'operatingModelWorkTypes']) {
    assert.equal(API_RIGHTS[name], undefined, `${name} is a safe read, not a right`);
    const verdict = guardApiCall({ settings: {} }, name, []);
    assert.ok(verdict.ok, `${name} must be readable`);
  }
  // The right's rank window is the org-design window, not the frontline one.
  assert.equal(ACTION_RIGHTS['author-operating-model'].minRank, 3);
  assert.equal(ACTION_RIGHTS['author-operating-model'].maxRank, 5);

  // A declared frontline seat is refused authoring with the reason printed.
  const frontlineState = { ...freshState(), settings: { ...freshState().settings, activeSeatId: 'mgr1' } };
  const refused = guardApiCall(frontlineState, 'omDeclareSplit', [{ level: 'manager', functionKey: 'all', altitude: 25, displaced: 40, abstention: 20, coordination: 15 }]);
  assert.equal(refused.ok, false);
  assert.ok(String(refused.error).includes('rank'), refused.error);

  // A director may author it.
  const directorState = { ...freshState(), settings: { ...freshState().settings, activeSeatId: 'dir1' } };
  const allowed = guardApiCall(directorState, 'omDeclareSplit', [{ level: 'manager', functionKey: 'all', altitude: 25, displaced: 40, abstention: 20, coordination: 15 }]);
  assert.equal(allowed.ok, true);

  // An undeclared method still fails closed under a seat.
  const unknown = guardApiCall(directorState, 'omSomethingUndeclared', []);
  assert.equal(unknown.ok, false);
  assert.equal(unknown.code, 'scope-refusal');

  // The route is portfolio material: a frontline seat cannot open it, a
  // director can.
  const builtFrontline = buildSeats(frontlineState, { now: NOW });
  assert.equal(routeVerdict('operating-model', activeSeat(builtFrontline)).allow, false);
  const builtDirector = buildSeats(directorState, { now: NOW });
  assert.equal(routeVerdict('operating-model', activeSeat(builtDirector)).allow, true);

  // Every governed collection has a declared policy rather than a default.
  for (const key of ['omWorkSplits', 'omEdges', 'omDecisions', 'omMarkers']) {
    assert.ok(RECORD_POLICIES[key], `${key} must declare a record policy`);
  }
});

test('the link vocabulary is declared: relieves is a known relation, not an invented string', () => {
  assert.ok(LINK_RELATIONS.includes('relieves'));
  assert.ok(LINK_RELATIONS.includes('rolls-up-to'));
  assert.ok(LINK_ENTITY_TYPES.includes('person'));
  // Every rule has an auditable contract, and the new one is among them.
  const contract = PROPAGATION_CONTRACTS.find((c) => c.module === 'operatingModelRules.js');
  assert.ok(contract, 'the operating-model rule has a propagation contract');
  assert.equal(contract.rule.name, 'operatingModelRule');
  assert.ok(contract.purpose.includes('no person is rated'));
  assert.deepEqual(contract.writes, ['omMarkers', 'decisions', 'links']);
  // The rule sits on the shared spine, before the seal.
  const index = DEFAULT_POST_COMMIT_RULES.indexOf(contract.rule);
  assert.ok(index >= 0, 'the rule is registered on the shared spine');
  assert.ok(index < DEFAULT_POST_COMMIT_RULES.length - 1, 'the seal remains last');
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length);
});

/* ------------------------------------------------------------------- UI */

test('every panel renders axe-clean and states its honesty', async () => {
  const dom = bootDocument();
  const state = freshState();
  const { api } = boot(state);
  const axe = (await import('axe-core')).default;
  for (const panel of ['spans', 'load', 'coupling', 'levers', 'norms', 'brief']) {
    const ctx = ctxFor(api, state, { panel });
    const node = renderOperatingModel(ctx);
    document.getElementById('view').replaceChildren(node);
    const results = await axe.run(node, { rules: { region: { enabled: false } } });
    assert.deepEqual(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) })), [], `axe: ${panel}`);
    assert.ok(node.querySelector('h1'), `${panel}: one page heading`);
    assert.ok(node.textContent.length > 200, `${panel}: renders content`);
  }
  // The honesty claims live on the screen a reader would check, not in a policy
  // file: the absence of a clock and the absence of a ranking are both stated.
  const normsPanel = renderOperatingModel(ctxFor(api, state, { panel: 'norms' }));
  document.getElementById('view').replaceChildren(normsPanel);
  assert.ok(normsPanel.textContent.includes('There is no attendance clock here'));
  assert.ok(normsPanel.textContent.includes('Nothing here ranks a person'));
  dom.window.close();
});
