/**
 * ADR-0161 — Matrix Span Fragmentation & Counterpart-Dyad Coordination Ledger
 * (Schema v130 unchanged, RULE-MCO-01, `#/matrix?panel=coordination`, CSV #121).
 *
 * Focused contract: a tree span with four reports sharing one project counterpart
 * is not equivalent to four reports scattered over four counterparts. The reader
 * must derive exact topology from the live matrix, refuse incomplete allocation
 * spans instead of printing a partial total, remain seat-scoped and identity-safe
 * in exports, and trace a scan through the shared post-commit spine.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import {
  buildMatrixCoordination,
  matrixCoordinationBriefText,
  matrixCoordinationCsvRows,
} from '../../app/core/domain/matrixCoordination.js';
import { matrixCoordinationRule } from '../../app/core/domain/matrixCoordinationRules.js';
import {
  MATRIX_COORDINATION_CSV_COLUMNS,
  MATRIX_COORDINATION_RULE_ID,
} from '../../app/core/domain/matrixCoordinationRegistry.js';
import { MATRIX_PANELS } from '../../app/core/domain/matrixRegistry.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { renderMatrixCoordinationPanel } from '../../app/views/matrixCoordinationPanel.js';

const NOW = new Date('2026-11-10T12:00:00.000Z');
const ISO = NOW.toISOString();

function person(id, name, level, managerId = null) {
  return { id, name, level, managerId, status: 'active', createdAt: ISO };
}

function line(id, personId, managerId, kind, shareH, extra = {}) {
  return {
    id,
    personId,
    managerId,
    kind,
    shareH,
    rights: [],
    fromISO: '2026-01-01',
    toISO: null,
    declaredAt: ISO,
    declaredBySeatId: null,
    history: [],
    status: 'active',
    ...extra,
  };
}

function fixture({ settings = {}, incomplete = false, malformed = false } = {}) {
  const state = createEmptyState(ISO);
  state.people = [
    // The roster’s highest declared leadership title is VP. `ceo` is not a
    // schema level, so use the real executive rung rather than relying on
    // normalisation to quietly turn this seat into a frontline lead.
    person('ceo', 'Ada Chief', 'vp'),
    person('one', 'Nora Functional', 'director', 'ceo'),
    person('many', 'Milo Functional', 'director', 'ceo'),
    person('alpha', 'Aria Product', 'director', 'ceo'),
    person('beta', 'Bea Project', 'director', 'ceo'),
    person('gamma', 'Gus Project', 'director', 'ceo'),
    person('delta', 'Dee Project', 'director', 'ceo'),
    ...['one1', 'one2', 'one3', 'one4'].map((id) => person(id, `One ${id.slice(-1)}`, 'ic', 'one')),
    ...['many1', 'many2', 'many3', 'many4'].map((id) => person(id, `Many ${id.slice(-1)}`, 'ic', 'many')),
  ];
  state.reportingLines = [];
  for (const id of ['one1', 'one2', 'one3', 'one4']) {
    state.reportingLines.push(line(`home-${id}`, id, 'one', 'functional', 60));
    state.reportingLines.push(line(`project-${id}`, id, 'alpha', 'project', 40));
  }
  for (const [index, counterpart] of ['alpha', 'beta', 'gamma', 'delta'].entries()) {
    const id = `many${index + 1}`;
    state.reportingLines.push(line(`home-${id}`, id, 'many', 'functional', 60));
    state.reportingLines.push(line(`project-${id}`, id, counterpart, 'project', incomplete && id === 'many4' ? null : 40));
  }
  if (malformed) {
    // This row survives normalization as an explicit bad-share defect, then the
    // matrix reader must refuse it rather than quietly losing it.
    state.reportingLines.push(line('broken-many', 'many1', 'beta', 'cross-functional', 999));
  }
  state.settings = { ...state.settings, ...settings };
  return normalizeState(state, { now: NOW }).state;
}

function row(report, managerId) {
  const found = report.allRows.find((candidate) => candidate.managerId === managerId);
  assert.ok(found, `missing coordination row for ${managerId}`);
  return found;
}

function seed(rawState) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(rawState)]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let sequence = 0;
  const store = createStore({
    storage,
    now: () => NOW,
    idFactory: (prefix) => `${prefix}-${++sequence}`,
  });
  store.load();
  const rawApi = createApi(store, { now: () => NOW, idFactory: (prefix) => `${prefix}-${++sequence}` });
  return { store, api: guardApi(rawApi, store, { now: () => NOW.getTime() }) };
}

test('the new panel and automation contract are registered without a schema move', () => {
  assert.equal(SCHEMA_VERSION, 152);
  assert.ok(MATRIX_PANELS.some((panel) => panel.key === 'coordination'));
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(matrixCoordinationRule));
  assert.ok(PROPAGATION_CONTRACTS.some((contract) => contract.rule === matrixCoordinationRule));
});

test('one stable counterpart and four scattered counterparts are different exact topologies', () => {
  const report = buildMatrixCoordination(fixture(), { now: NOW });
  const stable = row(report, 'one');
  const scattered = row(report, 'many');

  assert.equal(stable.peopleN, 4);
  assert.equal(stable.counterpartManagerN, 1);
  assert.equal(stable.directedPersonInterfaceN, 4);
  assert.equal(stable.state, 'concentrated');
  assert.deepEqual(stable.dispersion, { numerator: 16, denominator: 16, display: '1' });

  assert.equal(scattered.peopleN, 4);
  assert.equal(scattered.counterpartManagerN, 4);
  assert.equal(scattered.directedPersonInterfaceN, 4);
  assert.equal(scattered.state, 'fragmented');
  assert.deepEqual(scattered.dispersion, { numerator: 16, denominator: 4, display: '16 / 4' });

  assert.equal(report.board.topologyComplete, true);
  assert.equal(report.board.directedPersonInterfaceN, 16, 'two directed manager interfaces per complete two-line person');
  assert.equal(report.board.uniqueManagerPairN, 5, 'shared alpha relationship is deduplicated across the four people');
  assert.equal(report.board.statesReconcile, true);
  assert.equal(report.board.directedReconcile, true, 'printed directed count equals the exact edge set');
  assert.match(matrixCoordinationBriefText(report), /16 directed person-interface exposure/);
});

test('one incomplete line refuses every affected manager span and withholds workspace totals', () => {
  const report = buildMatrixCoordination(fixture({ incomplete: true }), { now: NOW });
  const home = row(report, 'many');
  const counterpart = row(report, 'delta');

  assert.equal(home.state, 'refused');
  assert.equal(home.counterpartManagerN, null);
  assert.equal(home.directedPersonInterfaceN, null);
  assert.match(home.reason, /REFUSED/);
  assert.equal(counterpart.state, 'refused', 'the other side of the same undeclared interface is not allowed to claim a partial total');
  assert.equal(report.board.topologyComplete, false);
  assert.equal(report.board.directedPersonInterfaceN, null);
  assert.equal(report.board.uniqueManagerPairN, null);
  assert.equal(report.board.refusedSpansN >= 2, true);
  assert.match(report.board.topologyWithheldReason, /withheld rather than calculated over the remainder/);
});

test('an invalid active line is counted and refuses every holder of that person rather than disappearing', () => {
  const report = buildMatrixCoordination(fixture({ malformed: true }), { now: NOW });
  assert.equal(report.board.invalidLineN, 1);
  assert.equal(report.board.topologyComplete, false);
  assert.equal(row(report, 'many').state, 'refused', 'the home holder cannot keep a partial topology');
  assert.equal(row(report, 'alpha').state, 'refused', 'a valid counterpart holder cannot keep a partial topology either');
  assert.equal(row(report, 'beta').state, 'refused', 'the rejected line holder is explicitly represented');
  assert.match(matrixCoordinationBriefText(report), /Workspace topology is REFUSED/);
});

test('an invalid declaration outside its active window is not a current topology refusal', () => {
  const state = fixture();
  state.reportingLines.push(line('old-broken', 'many1', 'beta', 'cross-functional', 999, {
    fromISO: '2025-01-01',
    toISO: '2025-12-31',
  }));
  const report = buildMatrixCoordination(normalizeState(state, { now: NOW }).state, { now: NOW });
  assert.equal(report.board.invalidLineN, 0);
  assert.equal(report.board.topologyComplete, true);
  assert.notEqual(row(report, 'many').state, 'refused');
});

test('an active declaration naming no roster person withholds the aggregate without inventing a phantom span', () => {
  const state = fixture();
  const baseline = buildMatrixCoordination(state, { now: NOW });
  state.reportingLines.push(line('ghost-person', 'nobody', 'alpha', 'project', 40));
  const report = buildMatrixCoordination(normalizeState(state, { now: NOW }).state, { now: NOW });
  assert.equal(report.board.invalidLineN, 1);
  assert.equal(report.board.unresolvedLineDefectN, 1);
  assert.equal(report.board.topologyComplete, false);
  assert.equal(report.board.managerSpansN, baseline.board.managerSpansN, 'a missing person cannot become a manager span');
  assert.equal(report.board.matrixPeopleN, baseline.board.matrixPeopleN, 'a missing person cannot become matrix headcount');
  assert.match(report.board.topologyWithheldReason, /cannot be joined to an active roster person/);
});

test('single-chain input is inert and carries a printed reason instead of a zero topology', () => {
  const state = createEmptyState(ISO);
  state.people = [person('ceo', 'Ada Chief', 'ceo'), person('sam', 'Sam Engineer', 'ic', 'ceo')];
  const report = buildMatrixCoordination(normalizeState(state, { now: NOW }).state, { now: NOW });
  assert.equal(report.isMatrix, false);
  assert.equal(report.rows.length, 0);
  assert.equal(report.board.managerSpansN, 0);
  assert.match(report.singleChainNote, /single-chain workspace gains no row/);
  assert.match(matrixCoordinationBriefText(report), /No person in this seat/);
});

test('a high-altitude scoped seat keeps structural counts but withholds manager and counterpart names', () => {
  const state = fixture({ settings: { activeSeatId: 'ceo' } });
  const report = buildMatrixCoordination(state, { now: NOW, settings: state.settings });
  const manager = row(report, 'many');
  assert.equal(manager.managerWithheld, true);
  assert.equal(manager.managerName, null);
  assert.ok(manager.counterparts.every((counterpart) => counterpart.withheld));
  assert.equal(manager.counterpartManagerN, 4, 'the count survives the identity wall');
});

test('the CSV is aggregate-only and identical to the computed report across a real reload', () => {
  const state = fixture();
  const before = JSON.stringify(state);
  const first = buildMatrixCoordination(state, { now: NOW, settings: state.settings });
  const rows = matrixCoordinationCsvRows(first);
  assert.equal(JSON.stringify(state), before, 'a pure read cannot mutate the stored state');
  assert.equal(Object.keys(rows[0]).sort().join(','), [...MATRIX_COORDINATION_CSV_COLUMNS].sort().join(','));
  const flat = JSON.stringify(rows);
  for (const forbidden of ['Ada Chief', 'Nora Functional', 'Milo Functional', 'Aria Product', 'one1', 'many4', 'project-many4']) {
    assert.equal(flat.includes(forbidden), false, `aggregate export leaks ${forbidden}`);
  }
  assert.ok(CSV_EXPORTS.some((entry) => entry.key === 'matrix-coordination'));
  const exported = exportWorkspaceCsv(state, 'matrix-coordination', { now: NOW });
  assert.equal(exported.ok, true);
  const parsed = parseCsv(exported.csv);
  assert.deepEqual(parsed.headers, [...MATRIX_COORDINATION_CSV_COLUMNS]);
  // parseCsv deliberately returns RFC 4180 cell arrays, not header-keyed
  // objects. Map the serialized row through the returned header sequence so
  // this assertion verifies the real CSV bytes rather than an invented shape.
  const workspaceCsv = Object.fromEntries(parsed.headers.map((header, index) => [header, parsed.rows[0][index]]));
  assert.equal(workspaceCsv.directed_person_interface_n, String(first.board.directedPersonInterfaceN));

  const reloaded = normalizeState(JSON.parse(before), { now: NOW }).state;
  const second = buildMatrixCoordination(reloaded, { now: NOW, settings: reloaded.settings });
  assert.deepEqual(matrixCoordinationCsvRows(second), rows, 'displayed/exported facts reproduce from persisted bytes');
});

test('the explicit scan travels the shared post-commit spine once and is marker-idempotent', () => {
  const { store, api } = seed(fixture());
  const first = api.matrixCoordinationScan();
  assert.equal(first.ok, true);
  const markers = store.state.matrixMarkers.filter((marker) => marker.ruleId === MATRIX_COORDINATION_RULE_ID);
  assert.equal(markers.length, 1);
  assert.match(markers[0].detail, /fragmented/);
  assert.ok(store.lastPropagations.some((effect) => effect.ruleId === MATRIX_COORDINATION_RULE_ID));

  const second = api.matrixCoordinationScan();
  assert.equal(second.ok, true);
  assert.equal(store.state.matrixMarkers.filter((marker) => marker.ruleId === MATRIX_COORDINATION_RULE_ID).length, 1, 'same topology/day is not re-emitted');
});

test('the panel renders the exact computed values and cannot mutate state', () => {
  const state = fixture();
  const before = JSON.stringify(state);
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const globals = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event'];
  const previous = new Map(globals.map((key) => [key, globalThis[key]]));
  try {
    for (const key of globals) globalThis[key] = key === 'window' ? dom.window : key === 'document' ? dom.window.document : dom.window[key];
    const node = renderMatrixCoordinationPanel({ state, refresh() {}, api: { matrixCoordinationScan: () => ({ ok: true }) } }, { now: NOW });
    assert.equal(JSON.stringify(state), before, 'rendering is read-only');
    assert.match(node.textContent, /Directed interfaces/);
    assert.match(node.textContent, /16/);
    assert.match(node.textContent, /Manager spans and their counterpart topology/);
    assert.match(node.textContent, /State counts reconcile: verified/);
    const grid = [...node.querySelectorAll('table')]
      .find((table) => table.querySelector('caption')?.textContent === 'Matrix coordination topology by manager span');
    assert.ok(grid, 'the manager-span table is rendered');
  } finally {
    for (const key of globals) globalThis[key] = previous.get(key);
  }
});
