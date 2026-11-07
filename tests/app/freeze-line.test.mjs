/**
 * ADR-0099, Schema v101 — the Freeze-Line Continuity Audit (`#/freeze-line`).
 *
 * Cross-module and cross-altitude by construction: these tests prove that
 *   - a committed structural design is detected as a freeze line and carriage
 *     is measured on BOTH sides of it (tree restored from frozen
 *     `previousManagers` vs today's roster), with a Wilson-bounded verdict that
 *     is REFUSED below the declared edge floor,
 *   - RULE-FRZ-01/02/03 write through the shared spine: a frozen reading
 *     becomes a graph node with `freezes` / `re-projects` / `rolls-up-to`
 *     edges in the SAME transaction, a degraded line opens exactly one
 *     governed decision per ISO week, and the timing guard catches legacy
 *     snapshots whose suppressed rows still carry a carriage date,
 *   - the federation view, CSV and new frozen snapshots withhold
 *     `lastCarriageOn`/`daysSince` on every suppressed row (the timing
 *     channel the roadmap named as open),
 *   - and no person's name, span id or carriage date reaches the CSV.
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
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { manifestFor } from '../../app/core/domain/disclosureManifests.js';
import { LINK_ENTITY_TYPES, LINK_RELATIONS, resolveLinkedEntity } from '../../app/core/domain/cases.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS, contractFor } from '../../app/core/domain/propagationContracts.js';
import { buildFederationReport, buildFederationSnapshot, federationCsvRows } from '../../app/core/domain/federation.js';
import {
  buildFreezeLineReport,
  buildFreezeReading,
  detectFreezeLines,
  freezeLineCsvRows,
  measureContinuity,
  timingGuardAudit,
} from '../../app/core/domain/freezeLine.js';
import { freezeLineRule } from '../../app/core/domain/freezeLineRules.js';
import { normalizeFreezeReadings, normalizeFreezeMarkers, normalizeFreezeLineSettings } from '../../app/core/domain/freezeLineSchema.js';
import { FREEZE_RULE_IDS } from '../../app/core/domain/freezeLineRegistry.js';
import { renderFreezeLine } from '../../app/views/freezeLine.js';

const NOW = new Date('2026-11-05T12:00:00.000Z');
const NOW_ISO = NOW.toISOString();
const TODAY = '2026-11-05';
const ago = (n) => new Date(NOW.getTime() - n * 86400000).toISOString().slice(0, 10);

/**
 * A five-altitude tree: two managers under a director under a VP.
 * Freeze-line conventions are small so the fixture stays inside the floors.
 */
function tree() {
  const state = createEmptyState(NOW_ISO);
  state.settings = {
    ...state.settings,
    chainLeaderAltitude: 'chief',
    freezeLineWindowDays: 30,
    freezeLineMinEdges: 3,
    freezeLineCellFloor: 2,
    freezeLineDropPct: 15,
    freezeLineAutoPropagate: true,
    federationWindowDays: 30,
    federationMinSpans: 3,
    federationCellFloor: 2,
  };
  for (const key of Object.keys(state.settings)) if (key.endsWith('AutoPropagate') && key !== 'freezeLineAutoPropagate') state.settings[key] = false;
  state.people = [
    { id: 'vp1', name: 'Vera Executive', role: 'VP', level: 'vp', team: 'Ops', status: 'active' },
    { id: 'dir1', name: 'Dana Director', role: 'Director', level: 'director', team: 'Ops', managerId: 'vp1', status: 'active' },
    { id: 'mgr1', name: 'Mira Manager', role: 'Manager', level: 'manager', team: 'Billing', managerId: 'dir1', status: 'active' },
    { id: 'mgr2', name: 'Malik Manager', role: 'Manager', level: 'manager', team: 'Claims', managerId: 'dir1', status: 'active' },
    { id: 'lead1', name: 'Lee Lead', role: 'Lead', level: 'lead', team: 'Billing', managerId: 'mgr1', status: 'active' },
    { id: 'lead2', name: 'Pat Lead', role: 'Lead', level: 'lead', team: 'Claims', managerId: 'mgr2', status: 'active' },
    { id: 'lead3', name: 'Mel Lead', role: 'Lead', level: 'lead', team: 'Claims', managerId: 'mgr2', status: 'active' },
  ];
  return normalizeState(state, { now: NOW }).state;
}

/** A frozen cadence reading is one dated carriage artefact (channel `cadence`). */
function carriage(state, id, ownerId, frozenOn) {
  state.cadenceReadings = Array.isArray(state.cadenceReadings) ? state.cadenceReadings : [];
  state.cadenceReadings.push({
    id, ownerId, frozenOn, engineVersion: 'test',
    forums: [], constraint: null, items: [],
    createdAt: new Date(`${frozenOn}T08:00:00.000Z`).toISOString(),
  });
  return state;
}

function harness(state = tree()) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let current = NOW;
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-frz-${++seq}`;
  const store = createStore({ storage, now: () => current, idFactory });
  store.load();
  const api = createApi(store, { now: () => current, idFactory });
  return { store, api, setNow: (value) => { current = value; } };
}

/** Commit a structural design that moves lead2 from mgr2 to mgr1. */
function commitReorg(api) {
  const add = api.addOrgDesign({ label: 'Claims closer to Billing', purpose: 'Move the claims lead under the billing manager.' });
  assert.equal(add.ok, true, add.error);
  const upd = api.updateOrgDesign(add.id, {
    ownerId: 'dir1',
    moves: [{ personId: 'lead2', toManagerId: 'mgr1' }],
  });
  assert.equal(upd.ok, true, upd.error);
  const commit = api.commitOrgDesign(add.id);
  assert.equal(commit.ok, true, commit.error);
  return add.id;
}

/* ------------------------------------------------------------------ schema */

test('Schema v101 migrates additively: empty ledgers, declared conventions, no inferred freeze line', () => {
  assert.equal(SCHEMA_VERSION, 115);
  const migrated = migrate({ schemaVersion: 100, settings: { leaderName: 'Keep this' } });
  assert.deepEqual(migrated.applied, ['100 → 101', '101 → 102', '102 → 103', '103 → 104', '104 → 105', '105 → 106', '106 → 107', '107 → 108', '108 → 109', '109 → 110', '110 → 111', '111 → 112', '112 → 113', '113 → 114', '114 → 115']);
  assert.deepEqual(migrated.raw.freezeReadings, []);
  assert.deepEqual(migrated.raw.freezeMarkers, []);
  assert.equal(migrated.raw.settings.leaderName, 'Keep this');
  assert.equal(migrated.raw.settings.freezeLineWindowDays, 30);
  assert.equal(migrated.raw.settings.freezeLineAutoPropagate, true);
  const normalized = normalizeState(migrated.raw, { now: NOW });
  assert.deepEqual(normalized.state.freezeReadings, []);
  assert.deepEqual(normalized.state.freezeMarkers, []);
});

test('the freeze-line normalizers are fail-closed: malformed readings and duplicate markers drop with warnings', () => {
  const warnings = [];
  const readings = normalizeFreezeReadings([
    { id: 'ok1', designId: 'd1', kind: 'committed', lineOn: TODAY, frozenOn: TODAY, verdict: 'held',
      windowDays: 30,
      before: { windowStart: ago(30), windowEnd: ago(1), edgesN: 5, connectedN: 4, coveragePct: 80, wilsonLowPct: 40, wilsonHighPct: 95, refused: false, reason: 'before' },
      after: { windowStart: TODAY, windowEnd: TODAY, edgesN: 5, connectedN: 4, coveragePct: 80, wilsonLowPct: 40, wilsonHighPct: 95, refused: false, reason: 'after' },
      cells: [{ altitudeKey: 'manager', cls: 'held', n: 2, suppressed: false }], comparability: { preAssessmentsN: 1, inWindowN: 1, suppressed: false, note: 'x' }, engineVersion: 'test', createdAt: NOW_ISO },
    { id: 'bad1', designId: 'd1', verdict: 'nope' },
    { id: 'ok1' },
  ], warnings, { now: NOW });
  assert.equal(readings.length, 1);
  assert.equal(readings[0].id, 'ok1');
  assert.ok(warnings.length >= 1);
  assert.deepEqual(normalizeFreezeMarkers([{ id: 'm1', kind: 'registered', key: 'k' }, { id: 'm1' }, { nope: true }]), [
    { id: 'm1', kind: 'registered', key: 'k', designId: null, decisionId: null, weekKey: null, recordedOn: null, note: '' },
  ]);
  const conv = normalizeFreezeLineSettings({ freezeLineWindowDays: 99999, freezeLineDropPct: -4, freezeLineAutoPropagate: false });
  assert.equal(conv.freezeLineWindowDays, 365);
  assert.equal(conv.freezeLineDropPct, 5);
  assert.equal(conv.freezeLineAutoPropagate, false);
});

/* ------------------------------------------------------------ freeze lines */

test('a committed structural design is detected as a freeze line; a draft is not', () => {
  const { api, store } = harness();
  const lines0 = detectFreezeLines(store.state, { now: NOW });
  assert.equal(lines0.length, 0);
  const designId = commitReorg(api);
  const lines = detectFreezeLines(store.state, { now: NOW });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].designId, designId);
  assert.equal(lines[0].kind, 'committed');
  assert.equal(lines[0].on, TODAY);
  assert.equal(lines[0].movesN, 1);
  assert.deepEqual(lines[0].movedByAltitude, { frontline: 1 });
});

/* ------------------------------------------------------------- continuity */

test('continuity is measured on both sides of the line; held when the share does not drop', () => {
  const state = tree();
  // Seats exist from manager up, so the declared edges are mgr1→dir1,
  // mgr2→dir1, dir1→vp1 (frontline carriage rolls up to its manager's seat).
  // Before the line: both manager seats carry directly to the director edge.
  // (Frontline readings roll up to the manager seat as a self-edge, which the
  // measurement deliberately does not count — only seat-owned carriage does.)
  carriage(state, 'c1', 'mgr1', ago(10));
  carriage(state, 'c2', 'mgr2', ago(8));
  carriage(state, 'c3', 'dir1', ago(6));
  const { api, store } = harness(state);
  const designId = commitReorg(api); // lead2 moves mgr2 → mgr1 today
  // After the line (window [TODAY, TODAY]): all three seats still carry, so the
  // share holds at 100% → 100% (the mgr2 seat survives via lead3).
  carriage(store.state, 'a1', 'mgr1', TODAY);
  carriage(store.state, 'a2', 'mgr2', TODAY);
  carriage(store.state, 'a3', 'dir1', TODAY);
  const design = store.state.orgDesigns.find((row) => row.id === designId);
  const measurement = measureContinuity(store.state, { now: NOW, settings: store.state.settings, design });
  assert.equal(measurement.before.edgesN, 3);
  assert.equal(measurement.before.connectedN, 3);
  assert.equal(measurement.before.coveragePct, 100);
  assert.equal(measurement.after.edgesN, 3);
  assert.equal(measurement.after.connectedN, 3);
  assert.equal(measurement.verdict, 'held');
  assert.equal(measurement.deltaPctPoints, 0);
  assert.ok(measurement.before.wilsonLowPct !== null && measurement.before.wilsonHighPct !== null);
  const heldCell = measurement.cells.find((cell) => cell.cls === 'held' && !cell.suppressed);
  assert.ok(heldCell && heldCell.n >= 1, 'the held class is published above the cell floor');
});

test('a lost edge across the line produces a degraded verdict when the share drop clears the threshold', () => {
  const state = tree();
  // Before: both manager edges connected (2/3 = 66.7%). After the line: none.
  carriage(state, 'b1', 'mgr1', ago(10));
  carriage(state, 'b2', 'mgr2', ago(9));
  const { api, store } = harness(state);
  const designId = commitReorg(api);
  const design = store.state.orgDesigns.find((row) => row.id === designId);
  const measurement = measureContinuity(store.state, { now: NOW, settings: store.state.settings, design });
  assert.equal(measurement.before.connectedN, 2);
  assert.equal(measurement.before.edgesN, 3);
  assert.equal(measurement.after.edgesN, 3);
  assert.equal(measurement.after.connectedN, 0);
  assert.equal(measurement.verdict, 'degraded');
  assert.ok(measurement.deltaPctPoints <= -15);
  const lostCell = measurement.cells.find((cell) => cell.cls === 'lost' && !cell.suppressed);
  assert.ok(lostCell && lostCell.n >= 1, 'the lost class is published above the cell floor');
});

test('a line with too few edges on a side is REFUSED, never a percentage of two', () => {
  const state = tree();
  state.settings.freezeLineMinEdges = 10; // above the 3 measurable edges
  const { api, store } = harness(state);
  const designId = commitReorg(api);
  const design = store.state.orgDesigns.find((row) => row.id === designId);
  const measurement = measureContinuity(store.state, { now: NOW, settings: store.state.settings, design });
  assert.equal(measurement.verdict, 'refused');
  assert.equal(measurement.before.coveragePct, null);
  assert.equal(measurement.after.coveragePct, null);
});

/* ------------------------------------------------------------------ rules */

test('freezing a reading registers the line: freezes / re-projects / rolls-up-to edges and one degraded-line decision, idempotently', () => {
  const state = tree();
  carriage(state, 'b1', 'mgr1', ago(10));
  carriage(state, 'b2', 'mgr2', ago(9));
  const { api, store } = harness(state);
  const designId = commitReorg(api);
  carriage(store.state, 'a1', 'mgr1', TODAY);

  const frozen = api.freezeLineFreeze({ designId });
  assert.equal(frozen.ok, true, frozen.error);
  assert.equal(frozen.verdict, 'degraded');

  const reading = store.state.freezeReadings.find((row) => row.id === frozen.id);
  assert.ok(reading, 'the reading is stored');
  assert.equal(reading.verdict, 'degraded');

  const links = store.state.links.filter((row) => row && row.sourceId === reading.id);
  assert.ok(links.some((row) => row.relation === 'freezes' && row.targetType === 'orgdesign' && row.targetId === designId),
    'RULE-FRZ-01 wrote a freezes edge to the design');
  const rollups = links.filter((row) => row.relation === 'rolls-up-to');
  assert.ok(rollups.length >= 1, 'RULE-FRZ-01 wrote rolls-up-to edges to leadership ancestors');
  assert.ok(rollups.every((row) => row.targetType === 'person'));

  const decisions = store.state.decisions.filter((row) => row && row.rationale && row.rationale.includes('RULE-FRZ-02'));
  assert.equal(decisions.length, 1, 'exactly one degraded-line decision per ISO week');
  assert.match(decisions[0].question, /freeze line/);

  // Idempotent: a second freeze the same day is refused as existing, a scan opens nothing new.
  const again = api.freezeLineFreeze({ designId });
  assert.equal(again.ok, true);
  assert.equal(again.existing, true);
  const scan = api.freezeLineScan();
  assert.equal(scan.ok, true, scan.error);
  const decisionsAfter = store.state.decisions.filter((row) => row && row.rationale && row.rationale.includes('RULE-FRZ-02'));
  assert.equal(decisionsAfter.length, 1, 'marker-idempotent: the scan opened no second decision');
  const markers = store.state.freezeMarkers.filter((row) => row && row.kind === 'degraded');
  assert.equal(markers.length, 1);

  // The reading is a first-class graph node with a resolver route.
  assert.ok(LINK_ENTITY_TYPES.includes('freezereading'));
  assert.ok(LINK_RELATIONS.includes('freezes') && LINK_RELATIONS.includes('re-projects'));
  const resolved = resolveLinkedEntity(store.state, 'freezereading', reading.id);
  assert.ok(resolved && resolved.route.startsWith('#/freeze-line'), 'the resolver routes the reading to #/freeze-line');
});

test('the rule is registered on the shared spine with an auditable contract', () => {
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(freezeLineRule));
  const contract = contractFor(freezeLineRule);
  assert.ok(contract, 'freezeLineRule has a propagation contract');
  assert.ok(contract.purpose.includes('RULE-FRZ-01') && contract.purpose.includes('RULE-FRZ-03'));
  assert.ok(PROPAGATION_CONTRACTS.some((c) => c.rule === freezeLineRule));
  assert.ok(FREEZE_RULE_IDS.registered === 'RULE-FRZ-01');
  assert.ok(manifestFor('freeze-line'), 'the disclosure catalogue has a freeze-line row');
});

test('paused automation stays silent: freezeLineAutoPropagate=false writes no edges', () => {
  const state = tree();
  state.settings.freezeLineAutoPropagate = false;
  const { api, store } = harness(state);
  const designId = commitReorg(api);
  const frozen = api.freezeLineFreeze({ designId });
  assert.equal(frozen.ok, true, frozen.error);
  const links = store.state.links.filter((row) => row && row.ruleId === FREEZE_RULE_IDS.registered);
  assert.equal(links.length, 0, 'no automatic propagation while paused');
  const scan = api.freezeLineScan();
  assert.equal(scan.ok, true);
  const linksAfter = store.state.links.filter((row) => row && row.ruleId === FREEZE_RULE_IDS.registered);
  assert.ok(linksAfter.length >= 1, 'the explicit scan always runs');
});

/* ----------------------------------------------------------- timing guard */

test('suppressed federation rows never print a carriage date: view, CSV and new frozen snapshots', () => {
  const state = tree();
  // Suppression is a DECLARED-SEAT rule (rank >= 3): declare the director seat.
  state.settings.activeSeatId = 'dir1';
  // One carriage event on the director edge: evidenceN 1 < cell floor 2, so the
  // row is suppressed (with a complementary cell where the table has one).
  carriage(state, 'c1', 'dir1', ago(3));
  const { store } = harness(state);
  const report = buildFederationReport(store.state, { now: NOW, settings: store.state.settings });
  assert.ok(report.ok);
  const suppressed = report.rows.filter((row) => row.suppressed);
  assert.ok(suppressed.length >= 1, 'the fixture produces at least one suppressed row');
  for (const row of suppressed) {
    assert.equal(row.lastCarriageOn, null, 'view row withholds the date on a suppressed row');
    assert.equal(row.daysSince, null);
  }
  const csv = federationCsvRows(report);
  for (const row of csv.filter((r) => r.suppressed === 'yes')) {
    assert.equal(row.last_carriage_on, '', 'CSV exports no carriage date for a suppressed row');
    assert.equal(row.days_since, '');
  }
  assert.ok(report.withheld.some((w) => /Timing channel closed/.test(w.reason)), 'the withholding note names the timing channel');

  // A NEW frozen snapshot blanks the timing on suppressed rows in the store itself.
  const snap = buildFederationSnapshot(store.state, { id: 'fed-1', now: NOW, settings: store.state.settings });
  assert.ok(snap.ok);
  for (const row of snap.assessment.rows.filter((r) => r.suppressed)) {
    assert.equal(row.lastCarriageOn, null, 'stored snapshot carries no date on a suppressed row');
    assert.equal(row.evidenceN, null);
  }
});

test('RULE-FRZ-03 opens one redaction decision for a legacy snapshot whose suppressed row still carries a date', () => {
  const state = tree();
  const { api, store } = harness(state);
  // A legacy (pre-ADR-0099) frozen assessment: suppressed row WITH a date.
  store.update((draft) => {
    draft.federationAssessments = [{
      id: 'legacy-1', scopeSeatId: 'dir1', altitudeKey: 'director', rank: 3,
      frozenOn: ago(2), windowDays: 30, windowStart: ago(32), windowEnd: ago(2),
      engineVersion: 'old', summary: { spansDeclared: 2, withParentN: 2, measuredN: 0, direct: 0, bypass: 0, stale: 0, silent: 2, root: 0, suppressedN: 1, coverage: { refused: false, n: 2, k: 0, pct: 0, lowPct: 0, highPct: 0, minSpans: 3, reason: '' } },
      rows: [{ seatId: 'lead1', parentId: 'mgr1', altitudeKey: 'frontline', rank: 1, state: 'silent', suppressed: true, evidenceN: 1, directN: 0, bypassN: 1, lastCarriageOn: ago(4), daysSince: 4, channels: [] }],
      createdAt: new Date(ago(2) + 'T08:00:00.000Z').toISOString(),
    }];
  }, { type: 'freezeline.scan', entity: 'workspace', entityId: 'all', summary: 'timing guard audit' });
  const guard = timingGuardAudit(store.state);
  assert.equal(guard.suppressedRowsWithDatesN, 1);
  const redaction = store.state.decisions.filter((row) => row && row.rationale && row.rationale.includes('RULE-FRZ-03'));
  assert.equal(redaction.length, 1, 'exactly one redaction decision for the legacy snapshot');
  assert.match(redaction[0].title, /suppressed row/);
  // Idempotent across a second scan.
  api.freezeLineScan();
  const redactionAfter = store.state.decisions.filter((row) => row && row.rationale && row.rationale.includes('RULE-FRZ-03'));
  assert.equal(redactionAfter.length, 1);
});

/* -------------------------------------------------------------- exports */

test('CSV scope #95 is aggregate-only and refusal-honest: no span id, person or carriage date', () => {
  const state = tree();
  carriage(state, 'b1', 'mgr1', ago(10));
  carriage(state, 'b2', 'mgr2', ago(9));
  const { api, store } = harness(state);
  const designId = commitReorg(api);
  carriage(store.state, 'a1', 'mgr1', TODAY);
  assert.equal(api.freezeLineFreeze({ designId }).ok, true);

  const spec = CSV_EXPORTS.find((row) => row.key === 'freeze-line');
  assert.ok(spec, 'CSV scope #95 is registered');
  const res = exportWorkspaceCsv(store.state, 'freeze-line', { now: NOW });
  assert.equal(res.ok, true, res.error);
  assert.ok(res.columnCount > 0 && res.rowCount > 0);
  const text = res.csv || '';
  for (const forbidden of ['lead1', 'lead2', 'mgr1', 'mgr2', 'dir1', 'vp1', 'Lee Lead', 'Pat Lead', ago(4), ago(9)]) {
    assert.ok(!text.includes(forbidden), `CSV must not contain ${forbidden}`);
  }
  assert.ok(text.includes('freeze-line'), 'the line row is present');
  assert.ok(text.includes('degraded'), 'the verdict is exported');

  const report = buildFreezeLineReport(store.state, { now: NOW, settings: store.state.settings });
  const rows = freezeLineCsvRows(report);
  const cellRows = rows.filter((row) => row.row_kind === 'continuity-cell');
  assert.ok(cellRows.every((row) => !row.altitude.includes('lead') && !('seatId' in row)), 'cells carry altitude and class only');
  assert.ok(rows.some((row) => row.row_kind === 'timing-guard'));
});

test('the brief is identity-free and names the verdicts', () => {
  const state = tree();
  const { api, store } = harness(state);
  const designId = commitReorg(api);
  api.freezeLineFreeze({ designId });
  const result = api.freezeLineBriefText();
  assert.equal(result.ok, true);
  for (const forbidden of ['Lee Lead', 'Pat Lead', 'Mira Manager', 'lead1', 'lead2']) {
    assert.ok(!result.text.includes(forbidden), `brief must not contain ${forbidden}`);
  }
  assert.match(result.text, /Freeze-line continuity audit/);
});

/* ------------------------------------------------------------------- view */

test('the view renders axe-clean across all five panels', async () => {
  const state = tree();
  carriage(state, 'b1', 'mgr1', ago(10));
  const { api, store } = harness(state);
  const designId = commitReorg(api);
  api.freezeLineFreeze({ designId });
  for (const panel of ['desk', 'lines', 'continuity', 'comparability', 'timing']) {
    const view = document.getElementById('view');
    view.innerHTML = '';
    const ctx = {
      api,
      state: store.state,
      query: new URLSearchParams(`panel=${panel}`),
      navigate: () => {},
      seatContext: null,
    };
    view.appendChild(renderFreezeLine(ctx));
    const results = await axe.run(view);
    assert.deepEqual(results.violations, [], `panel ${panel} is axe-clean: ${JSON.stringify(results.violations.map((v) => v.id))}`);
  }
});
