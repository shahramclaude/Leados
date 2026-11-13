import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { addDays } from '../../app/core/time.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { API_RIGHTS, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { ACTION_RIGHTS, RECORD_POLICIES } from '../../app/core/domain/seatRegistry.js';
import { MATRIX_PANELS } from '../../app/core/domain/matrixRegistry.js';
import { oneOnOneLineRule } from '../../app/core/domain/oneOnOneLineRules.js';
import { ONE_ON_ONE_LINE_CSV_COLUMNS, ONE_ON_ONE_LINE_LIMITS } from '../../app/core/domain/oneOnOneLineRegistry.js';
import { buildProtectedOneOnOneLines } from '../../app/core/domain/oneOnOneLines.js';
import { renderMatrix } from '../../app/views/matrix.js';
import { renderOneOnOnes } from '../../app/views/oneonones.js';
import { renderSettings } from '../../app/views/settings.js';

const NOW = new Date('2026-11-11T10:00:00.000Z');
const TODAY = '2026-11-11';
const ISO = NOW.toISOString();
const ago = (days) => addDays(TODAY, -days);

function fakeStorage(seed = null) {
  const map = new Map();
  if (seed) map.set(STORAGE_KEY, JSON.stringify(seed));
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
  };
}

function matrixState({ lines = null, meetings = [], seatId = null, extraPeople = [] } = {}) {
  const state = createEmptyState(ISO);
  state.settings.activeSeatId = seatId;
  state.people = [
    { id: 'vp', name: 'Vera VP', level: 'vp', managerId: null, status: 'active', createdAt: '2025-01-01T00:00:00.000Z' },
    { id: 'dir', name: 'Dana Director', level: 'director', managerId: 'vp', status: 'active', createdAt: '2025-01-01T00:00:00.000Z' },
    { id: 'home', name: 'Fay Functional', level: 'manager', managerId: 'dir', status: 'active', createdAt: '2025-01-01T00:00:00.000Z' },
    { id: 'pm', name: 'Priya Project', level: 'manager', managerId: 'dir', status: 'active', createdAt: '2025-01-01T00:00:00.000Z' },
    { id: 'sam', name: 'Sam Shared', level: 'ic', managerId: 'home', status: 'active', createdAt: '2025-01-01T00:00:00.000Z' },
    { id: 'lee', name: 'Lee Shared', level: 'ic', managerId: 'home', status: 'active', createdAt: '2025-01-01T00:00:00.000Z' },
    { id: 'mo', name: 'Mo Shared', level: 'ic', managerId: 'home', status: 'active', createdAt: '2025-01-01T00:00:00.000Z' },
    ...extraPeople,
  ];
  state.reportingLines = lines ?? [
    { id: 'ln-sam', personId: 'sam', managerId: 'pm', kind: 'project', shareH: 40, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T00:00:00.000Z', status: 'active' },
    { id: 'ln-lee', personId: 'lee', managerId: 'pm', kind: 'project', shareH: 40, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T00:00:00.000Z', status: 'active' },
    { id: 'ln-mo', personId: 'mo', managerId: 'pm', kind: 'project', shareH: 40, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T00:00:00.000Z', status: 'active' },
  ];
  state.oneOnOnes = meetings;
  return state;
}

function harness(seed) {
  const storage = fakeStorage(seed);
  const store = createStore({ storage, now: () => NOW });
  store.load();
  const api = createApi(store, { now: () => NOW });
  return { store, api, storage };
}

function withDom(fn) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const keys = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event'];
  const prev = new Map(keys.map((k) => [k, globalThis[k]]));
  try {
    for (const k of keys) globalThis[k] = k === 'window' ? dom.window : k === 'document' ? dom.window.document : dom.window[k];
    return fn(dom);
  } finally {
    for (const k of keys) globalThis[k] = prev.get(k);
    dom.window.close();
  }
}

test('ADR-0164 registration: Schema v140, spine 1:1 parity, gateway, seat policy, panel and CSV #130', () => {
  assert.equal(SCHEMA_VERSION, 152);
  const empty = createEmptyState(ISO);
  assert.deepEqual(empty.oneOnOneLineMarkers, []);
  assert.equal(empty.settings.oneOnOneLineCadenceDays, 28);
  assert.equal(empty.settings.oneOnOneLineMinSharePct, 20);
  assert.equal(empty.settings.oneOnOneLineAskDueDays, 7);
  assert.equal(empty.settings.oneOnOneLineAutoPropagate, true);

  const { raw, applied } = migrate({ schemaVersion: 139, appId: 'leados', meta: {}, settings: {} });
  assert.deepEqual(applied, ['139 → 140', '140 → 141', '141 → 142', '142 → 143', '143 → 144', '144 → 145', '145 → 146', '146 → 147', '147 → 148', '148 → 149', '149 → 150', '150 → 151', '151 → 152']);
  assert.equal(raw.schemaVersion, 152);
  assert.deepEqual(raw.oneOnOneLineMarkers, []);

  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length);
  const ruleIdx = DEFAULT_POST_COMMIT_RULES.indexOf(oneOnOneLineRule);
  const seatIdx = DEFAULT_POST_COMMIT_RULES.findIndex((r) => r.name === 'seatRule');
  const sealIdx = DEFAULT_POST_COMMIT_RULES.findIndex((r) => r.name === 'sealRule');
  assert.ok(ruleIdx > 0 && ruleIdx < seatIdx && seatIdx < sealIdx, 'RULE-OOL-01 runs before seatRule and sealRule');
  assert.ok(PROPAGATION_CONTRACTS.some((c) => c.rule === oneOnOneLineRule && c.module === 'oneOnOneLineRules.js'));

  assert.equal(RECORD_POLICIES.oneOnOneLineMarkers.detailCeiling, 0);
  assert.equal(API_RIGHTS.oneOnOneLineScan, 'govern-oneonone-lines');
  assert.equal(API_RIGHTS.oneOnOneLineSetConventions, 'govern-oneonone-lines');
  assert.equal(ACTION_RIGHTS['govern-oneonone-lines'].minRank, 3);
  assert.ok(SAFE_READS.has('oneOnOneLineReport'));
  assert.ok(MATRIX_PANELS.some((p) => p.key === 'one-on-ones'));
  assert.equal(CSV_EXPORTS.length, 144);
  assert.ok(CSV_EXPORTS.some((c) => c.key === 'one-on-one-lines' && c.sensitive === false));
});

test('RULE-OOL-01 issues bounded dated asks with typed DAG provenance, closes resolved asks, and respects autoPropagate', () => {
  const { store, api } = harness(matrixState({
    meetings: [
      { id: 'oo-home-sam', personId: 'sam', date: ago(2), status: 'held', heldById: 'home', heldByBasis: 'seat', heldByAt: ISO, actions: [], agenda: [], createdAt: ISO },
      { id: 'oo-unattr-lee', personId: 'lee', date: ago(3), status: 'held', heldById: null, heldByBasis: null, heldByAt: null, actions: [], agenda: [], createdAt: ISO },
    ],
  }));

  // Director can run Scan; manager cannot.
  store.update((draft) => { draft.settings.activeSeatId = 'home'; }, { type: 'test.seat', entity: 'workspace', entityId: 'seat', summary: 'switch home' });
  assert.equal(api.oneOnOneLineScan().ok, false, 'rank 2 manager cannot govern/scan');

  store.update((draft) => { draft.settings.activeSeatId = 'dir'; }, { type: 'test.seat', entity: 'workspace', entityId: 'seat', summary: 'switch director' });
  const scan1 = api.oneOnOneLineScan();
  assert.equal(scan1.ok, true, scan1.error);

  // Open asks from RULE-OOL-01 should exist for Sam's silent project line and Mo's two silent lines (3 total),
  // and NOT for Lee's unproven lines (observation marker only).
  const baseline = buildProtectedOneOnOneLines({ ...store.state, settings: { ...store.state.settings, activeSeatId: null } }, { now: NOW });
  const expectedSilent = baseline.persons.flatMap((p) => p.lines).filter((l) => l.silent && l.managerOnRoster).length;
  assert.equal(expectedSilent, 3);
  const askMarkers = store.state.oneOnOneLineMarkers.filter((m) => m.kind === 'ask');
  const openAsks = store.state.delegations.filter((d) => d.status === 'active' && d.title.startsWith('Hold attributed 1:1'));
  const obsMarkers = store.state.oneOnOneLineMarkers.filter((m) => m.kind === 'observation');
  assert.equal(askMarkers.length, expectedSilent);
  assert.equal(openAsks.length, expectedSilent);
  assert.ok(obsMarkers.some((m) => m.state === 'unproven'), 'unproven unattributed line records observation, never a blame task');

  // Provenance links: concerns, issues-obligation, and rolls-up-to edges all reload cleanly without warnings.
  const firstTask = openAsks[0];
  assert.ok(store.state.links.some((l) => l.relation === 'concerns' && l.targetId === firstTask.id && l.ruleId === 'RULE-OOL-01'));
  assert.ok(store.state.links.some((l) => l.relation === 'issues-obligation' && l.targetId === firstTask.id && l.ruleId === 'RULE-OOL-01'));
  assert.ok(store.state.links.some((l) => l.relation === 'rolls-up-to' && l.sourceId === firstTask.id && l.targetId === 'vp'));

  // Re-scanning is strictly idempotent.
  const scan2 = api.oneOnOneLineScan();
  assert.equal(scan2.ok, true);
  assert.equal(store.state.delegations.filter((d) => d.status === 'active' && d.title.startsWith('Hold attributed 1:1')).length, expectedSilent, 'rescan creates zero duplicates');

  // Claiming/logging Sam's project 1:1 closes her project ask automatically.
  store.update((draft) => { draft.settings.activeSeatId = 'pm'; }, { type: 'test.seat', entity: 'workspace', entityId: 'seat', summary: 'switch pm' });
  const logged = api.logOneOnOne({ personId: 'sam', date: TODAY, status: 'held' });
  assert.equal(logged.ok, true, logged.error);
  const samProjAsk = store.state.oneOnOneLineMarkers.find((m) => m.kind === 'ask' && m.lineKey === 'line|ln-sam');
  const closedTask = store.state.delegations.find((d) => d.id === samProjAsk.taskId);
  assert.equal(closedTask.status, 'done', 'logging an attributed 1:1 on the silent line automatically closes its ask');

  // Operator unlocks all 4 convention fields and autoPropagate pause suppresses non-scan commits while Scan still runs.
  store.update((draft) => { draft.settings.activeSeatId = null; }, { type: 'test.seat', entity: 'workspace', entityId: 'seat', summary: 'switch operator' });
  const convRes = api.oneOnOneLineSetConventions({
    oneOnOneLineCadenceDays: 14,
    oneOnOneLineMinSharePct: 10,
    oneOnOneLineAskDueDays: 5,
    oneOnOneLineAutoPropagate: false,
  });
  assert.equal(convRes.ok, true, convRes.error);
  assert.equal(store.state.settings.oneOnOneLineAutoPropagate, false);
  assert.equal(store.state.settings.oneOnOneLineAskDueDays, 5);

  const beforeDecl = store.state.delegations.filter((d) => d.title.startsWith('Hold attributed 1:1')).length;
  const claimedLee = api.oneOnOneLineClaim('oo-unattr-lee', { heldById: 'home' });
  assert.equal(claimedLee.ok, true, claimedLee.error);
  assert.equal(store.state.delegations.filter((d) => d.title.startsWith('Hold attributed 1:1')).length, beforeDecl, 'with autoPropagate paused, claiming/transitioning lee|pm from unproven to silent writes no new ask automatically');

  const scanAfterPause = api.oneOnOneLineScan();
  assert.equal(scanAfterPause.ok, true);
  assert.equal(store.state.delegations.filter((d) => d.title.startsWith('Hold attributed 1:1')).length, beforeDecl + 1, 'explicit scan still issues the lee|pm ask when autoPropagate is paused');

  const { warnings } = normalizeState(store.state, { now: NOW });
  assert.equal(warnings.some((w) => w.includes('Cross-module links')), false, 'every RULE-OOL-01 link validates cleanly on reload');
});

test('RULE-OOL-01 is inert in single-chain workspaces and respects asksPerCommit bound', () => {
  const single = harness(matrixState({ lines: [] }));
  assert.equal(single.api.oneOnOneLineScan().ok, true);
  assert.equal(single.store.state.delegations.length, 0);
  assert.equal(single.store.state.oneOnOneLineMarkers.length, 0);

  // 6 multi-line people => 12 silent pairs > asksPerCommit (8) => bounded to 8 in first scan, 4 more in second scan.
  const extraPeople = [1, 2, 3].map((n) => ({ id: `x${n}`, name: `Extra ${n}`, level: 'ic', managerId: 'home', status: 'active', createdAt: '2025-01-01T00:00:00.000Z' }));
  const extraLines = [1, 2, 3].map((n) => ({ id: `ln-x${n}`, personId: `x${n}`, managerId: 'pm', kind: 'project', shareH: 40, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T00:00:00.000Z', status: 'active' }));
  const bounded = harness(matrixState({
    extraPeople,
    lines: [
      { id: 'ln-sam', personId: 'sam', managerId: 'pm', kind: 'project', shareH: 40, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T00:00:00.000Z', status: 'active' },
      { id: 'ln-lee', personId: 'lee', managerId: 'pm', kind: 'project', shareH: 40, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T00:00:00.000Z', status: 'active' },
      { id: 'ln-mo', personId: 'mo', managerId: 'pm', kind: 'project', shareH: 40, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T00:00:00.000Z', status: 'active' },
      ...extraLines,
    ],
  }));
  const r1 = bounded.api.oneOnOneLineScan();
  assert.equal(r1.ok, true);
  assert.equal(bounded.store.state.delegations.filter((d) => d.title.startsWith('Hold attributed 1:1')).length, ONE_ON_ONE_LINE_LIMITS.asksPerCommit);
  const r2 = bounded.api.oneOnOneLineScan();
  assert.equal(r2.ok, true);
  assert.equal(bounded.store.state.delegations.filter((d) => d.title.startsWith('Hold attributed 1:1')).length, 12);
});

test('small-cell, complementary kind suppression, mixed-detail subtraction, and repeated-release differencing protect report & CSV #130', () => {
  // 1. Sub-floor (< 3 multi-line people) at director rank withholds board & blanks CSV #130 summary.
  const subFloor = matrixState({
    seatId: 'dir',
    lines: [
      { id: 'ln-sam', personId: 'sam', managerId: 'pm', kind: 'project', shareH: 40, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T00:00:00.000Z', status: 'active' },
      { id: 'ln-lee', personId: 'lee', managerId: 'pm', kind: 'project', shareH: 40, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T00:00:00.000Z', status: 'active' },
    ],
  });
  const subRep = buildProtectedOneOnOneLines(subFloor, { now: NOW });
  assert.equal(subRep.aggregateWithheld, true);
  assert.equal(subRep.board, null);
  const subCsv = exportWorkspaceCsv(subFloor, 'one-on-one-lines', { now: NOW });
  assert.equal(subCsv.ok, true);
  assert.match(subCsv.csv, /withheld/);

  // 2. Director with 3 people: 3 functional, 2 project (< floor 3), 1 product (< floor 3) -> project+product suppressed cleanly; CSV blanks suppressed rows.
  const compState = matrixState({
    seatId: 'dir',
    lines: [
      { id: 'ln-sam', personId: 'sam', managerId: 'pm', kind: 'project', shareH: 40, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T00:00:00.000Z', status: 'active' },
      { id: 'ln-lee', personId: 'lee', managerId: 'pm', kind: 'project', shareH: 40, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T00:00:00.000Z', status: 'active' },
      { id: 'ln-mo', personId: 'mo', managerId: 'pm', kind: 'product', shareH: 40, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T00:00:00.000Z', status: 'active' },
    ],
  });
  const compRep = buildProtectedOneOnOneLines(compState, { now: NOW });
  assert.equal(compRep.aggregateWithheld, false);
  assert.equal(compRep.board.peopleN, 3);
  const projKind = compRep.kinds.find((k) => k.kind === 'project');
  const prodKind = compRep.kinds.find((k) => k.kind === 'product');
  assert.equal(projKind.suppressed, true);
  assert.equal(prodKind.suppressed, true);
  assert.equal(projKind.pairsN, null, 'suppressed kind blanks counts rather than printing sub-floor figures');
  const compCsv = exportWorkspaceCsv(compState, 'one-on-one-lines', { now: NOW });
  assert.equal(compCsv.ok, true);
  assert.match(compCsv.csv, /suppressed-floor/);

  // 3. Mixed-detail manager altitude (rank 2) where 1 aggregate-only descendant sits under pm via a subordinate's additional line:
  // withholds aggregate board so subtracting visible lines cannot expose that 1 aggregate-only descendant.
  const mixedState = matrixState({
    seatId: 'pm',
    extraPeople: [
      { id: 'submgr', name: 'Sub Lead', level: 'manager', managerId: 'pm', status: 'active', createdAt: '2025-01-01T00:00:00.000Z' },
      { id: 'hidden', name: 'Hidden IC', level: 'ic', managerId: 'home', status: 'active', createdAt: '2025-01-01T00:00:00.000Z' },
    ],
    lines: [
      { id: 'ln-sam', personId: 'sam', managerId: 'pm', kind: 'project', shareH: 40, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T00:00:00.000Z', status: 'active' },
      { id: 'ln-hid', personId: 'hidden', managerId: 'submgr', kind: 'project', shareH: 40, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T00:00:00.000Z', status: 'active' },
    ],
  });
  const mixedRep = buildProtectedOneOnOneLines(mixedState, { now: NOW });
  assert.equal(mixedRep.persons.some((p) => p.personId === 'sam'), true, 'direct report remains visible');
  assert.equal(mixedRep.persons.some((p) => p.personId === 'hidden'), false, 'subordinate additional-line descendant detail stays hidden');
  assert.equal(mixedRep.aggregateWithheld, true, 'board withheld when hidden aggregate descendants < floor');
  assert.equal(mixedRep.board, null);

  // 4. Repeated-release differencing block when publication register carries a conflicting release on `oneonones`.
  const diffState = matrixState({
    seatId: 'dir',
    meetings: [
      { id: 'm1', personId: 'sam', date: ago(1), status: 'held', heldById: 'home', heldByBasis: 'seat', heldByAt: ISO, actions: [], agenda: [], createdAt: ISO },
      { id: 'm2', personId: 'lee', date: ago(1), status: 'held', heldById: 'home', heldByBasis: 'seat', heldByAt: ISO, actions: [], agenda: [], createdAt: ISO },
      { id: 'm3', personId: 'mo', date: ago(1), status: 'held', heldById: 'home', heldByBasis: 'seat', heldByAt: ISO, actions: [], agenda: [], createdAt: ISO },
    ],
  });
  diffState.differenceReleases = [
    {
      id: 'rel-1',
      route: 'oneonones',
      releasedOn: ago(2),
      attempt: 1,
      scopeSeatId: 'dir',
      cells: [
        { cellKey: 'home', state: 'withheld', count: null, open: null, overdue: null },
        { cellKey: 'pm', state: 'printed', count: 5, open: 2, overdue: 1 },
      ],
      totals: [
        { measure: 'count', value: 10, printed: true },
        { measure: 'open', value: 4, printed: true },
        { measure: 'overdue', value: 2, printed: true },
      ],
      withheldCells: 1,
      createdAt: ago(2),
    },
  ];
  const diffRep = buildProtectedOneOnOneLines(diffState, { now: NOW });
  assert.equal(diffRep.aggregateWithheld, true, 'repeated release against existing register withholds aggregate board');
  assert.match(diffRep.aggregateWithheldReason, /Publication register/);
});

test('matrix panel (#/matrix?panel=one-on-ones), #/oneonones controls, and #/settings render without mutating disk bytes', () => {
  const { store, api, storage } = harness(matrixState({
    meetings: [
      { id: 'm1', personId: 'sam', date: ago(1), status: 'held', heldById: 'home', heldByBasis: 'seat', heldByAt: ISO, actions: [], agenda: [], createdAt: ISO },
      { id: 'm2', personId: 'lee', date: ago(2), status: 'held', heldById: null, heldByBasis: null, heldByAt: null, actions: [], agenda: [], createdAt: ISO },
    ],
  }));
  const bytesBefore = storage.getItem(STORAGE_KEY);
  const report = api.oneOnOneLineReport().report;

  withDom(() => {
    const matrixDom = renderMatrix({
      state: store.state,
      now: NOW,
      query: new URLSearchParams('panel=one-on-ones'),
      api,
      navigate() {},
      refresh() {},
    });
    assert.ok(matrixDom.querySelector('[data-testid="matrix-one-on-ones-panel"]'));
    assert.ok(matrixDom.querySelector('[data-testid="ool-scan-btn"]'));
    assert.ok(matrixDom.querySelector('[data-testid="ool-conventions-btn"]'));
    assert.ok(matrixDom.querySelector('[data-testid="ool-csv-btn"]'));
    assert.ok(matrixDom.textContent.includes(`Pair states reconcile (${report.board.pairsN})`));
    assert.ok(matrixDom.querySelector(`[data-testid="publication-plan-oneonones"]`) || matrixDom.textContent.includes('Publication'));

    const oneDom = renderOneOnOnes({
      state: store.state,
      now: NOW,
      query: new URLSearchParams(),
      api,
      navigate() {},
      refresh() {},
    });
    assert.ok(oneDom.textContent.includes('Matrix 1:1 panel'));
    assert.ok(oneDom.textContent.includes('Scan silent lines'));

    const setDom = renderSettings({
      state: store.state,
      now: NOW,
      api,
      storageSize: () => 1024,
    });
    assert.ok(setDom.textContent.includes('Matrix 1:1 additional-line governance'));
  });

  assert.equal(storage.getItem(STORAGE_KEY), bytesBefore, 'reading and rendering mutate zero stored bytes');
  assert.deepEqual(Object.keys(exportWorkspaceCsv(store.state, 'one-on-one-lines', { now: NOW })), ['ok', 'scope', 'label', 'sensitive', 'filename', 'rowCount', 'columnCount', 'csv']);
});

test('JSDOM #/matrix?panel=one-on-ones and #/oneonones pass axe-core with zero violations', async () => {
  const { store, api } = harness(matrixState({
    meetings: [
      { id: 'm1', personId: 'sam', date: ago(1), status: 'held', heldById: 'home', heldByBasis: 'seat', heldByAt: ISO, actions: [], agenda: [], createdAt: ISO },
      { id: 'm2', personId: 'lee', date: ago(2), status: 'held', heldById: null, heldByBasis: null, heldByAt: null, actions: [], agenda: [], createdAt: ISO },
    ],
  }));
  const AXE_SRC = fs.readFileSync(path.resolve(import.meta.dirname, '../../node_modules/axe-core/axe.min.js'), 'utf8');
  const dom = new JSDOM('<!doctype html><html lang="en"><body><main id="root"></main></body></html>', {
    runScripts: 'outside-only',
  });
  const keys = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'Event'];
  const prev = new Map(keys.map((k) => [k, globalThis[k]]));
  try {
    for (const k of keys) globalThis[k] = k === 'window' ? dom.window : k === 'document' ? dom.window.document : dom.window[k];
    dom.window.eval(AXE_SRC);
    const root = dom.window.document.getElementById('root');

    const matrixView = renderMatrix({
      state: store.state,
      now: NOW,
      query: new URLSearchParams('panel=one-on-ones'),
      api,
      navigate() {},
      refresh() {},
    });
    root.appendChild(matrixView);
    const matrixAxe = await dom.window.axe.run(root, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    assert.deepEqual(Array.from(matrixAxe.violations, (v) => `${v.id}: ${v.help}`), [], 'matrix one-on-ones panel has zero axe violations');

    root.replaceChildren();
    const oneView = renderOneOnOnes({
      state: store.state,
      now: NOW,
      query: new URLSearchParams(),
      api,
      navigate() {},
      refresh() {},
    });
    root.appendChild(oneView);
    const oneAxe = await dom.window.axe.run(root, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    assert.deepEqual(Array.from(oneAxe.violations, (v) => `${v.id}: ${v.help}`), [], 'oneonones view has zero axe violations');
  } finally {
    for (const k of keys) globalThis[k] = prev.get(k);
    dom.window.close();
  }
});
