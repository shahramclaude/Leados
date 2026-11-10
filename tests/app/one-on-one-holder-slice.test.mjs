import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { matrixRule } from '../../app/core/domain/matrixRules.js';
import { buildOneOnOneLines } from '../../app/core/domain/oneOnOneLines.js';
import { renderOneOnOnes } from '../../app/views/oneonones.js';

const NOW = new Date('2026-11-10T10:00:00.000Z');
const ISO = NOW.toISOString();
function storage() {
  const map = new Map();
  return {
    fail: false,
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { if (this.fail) throw new Error('storage unavailable'); map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
  };
}
function fixture() {
  const state = createEmptyState(ISO);
  state.schemaVersion = 131;
  state.settings.activeSeatId = 'home';
  state.people = [
    { id: 'director', name: 'Director', level: 'director', managerId: null, status: 'active', createdAt: ISO },
    { id: 'home', name: 'Home Manager', level: 'manager', managerId: 'director', status: 'active', createdAt: ISO },
    { id: 'project', name: 'Project Manager', level: 'manager', managerId: 'director', status: 'active', createdAt: ISO },
    { id: 'sam', name: 'Sam', level: 'ic', managerId: 'home', status: 'active', createdAt: ISO },
  ];
  state.reportingLines = [{ id: 'project-line', personId: 'sam', managerId: 'project', kind: 'project', shareH: 40, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: ISO, status: 'active' }];
  state.oneOnOnes = [{ id: 'legacy', personId: 'sam', date: '2026-11-08', status: 'held', mood: null, notes: 'Earlier record', actions: [], agenda: [], createdAt: ISO }];
  return state;
}
function harness() {
  const disk = storage();
  disk.setItem(STORAGE_KEY, JSON.stringify(fixture()));
  const store = createStore({ storage: disk, now: () => NOW, postCommitRules: [matrixRule] });
  store.load();
  const api = createApi(store, { now: () => NOW });
  return { store, api, disk };
}

test('matrix managers log their own holder, preserve it on disk, and the history displays the stored holder', () => {
  const { store, api, disk } = harness();
  assert.equal(SCHEMA_VERSION, 135);
  assert.deepEqual(migrate({ schemaVersion: 131, oneOnOnes: [{ personId: 'sam' }], settings: {} }).applied, ['131 → 132', '132 → 133', '133 → 134', '134 → 135']);
  assert.equal(store.state.oneOnOnes[0].heldById, null, 'migration does not invent historical holders');
  const home = api.logOneOnOne({ personId: 'sam', date: '2026-11-09', status: 'held', actions: [{ text: 'Home-only commitment', owner: 'leader' }] });
  assert.equal(home.ok, true);
  assert.equal(home.saved, true);
  assert.equal(store.state.oneOnOnes.find((m) => m.id === home.id).heldById, 'home');
  const sourceAction = store.state.oneOnOnes.find((m) => m.id === home.id).actions[0];
  store.update((draft) => { draft.settings.activeSeatId = 'project'; }, { type: 'test.seat', entity: 'workspace', entityId: 'seat', summary: 'switch' });
  const forged = api.logOneOnOne({ personId: 'sam', heldById: 'home', date: '2026-11-10' });
  assert.equal(forged.ok, false);
  const crossLine = api.logOneOnOne({ personId: 'sam', date: '2026-11-10', reconciliations: [{ meetingId: home.id, actionId: sourceAction.id, outcome: 'done' }] });
  assert.equal(crossLine.ok, false, 'a project 1:1 cannot close a home manager’s promise');
  const project = api.logOneOnOne({ personId: 'sam', date: '2026-11-10', status: 'held', notes: 'Project conversation' });
  assert.equal(project.ok, true, project.error);
  assert.equal(project.heldById, 'project');
  assert.equal(store.lastPropagationMetrics.rootEvent, 'oneonone.logged');
  assert.ok(store.lastPropagationMetrics.pairs.some((pair) => pair.rule === 'matrixRule' && pair.event === 'oneonone.logged'), 'the existing matrix rule received the event on the shared spine');

  const bytes = disk.getItem(STORAGE_KEY);
  const persisted = JSON.parse(bytes);
  assert.equal(persisted.oneOnOnes.find((m) => m.id === home.id).heldById, 'home');
  assert.equal(persisted.oneOnOnes.find((m) => m.id === project.id).heldById, 'project');
  const reloaded = normalizeState(persisted, { now: NOW }).state;
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const keys = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event'];
  const old = new Map(keys.map((key) => [key, globalThis[key]]));
  try {
    for (const key of keys) globalThis[key] = key === 'window' ? dom.window : key === 'document' ? dom.window.document : dom.window[key];
    const page = renderOneOnOnes({ state: reloaded, now: NOW, query: new URLSearchParams(), api, navigate() {} });
    const rows = [...page.querySelectorAll('.meeting-item')];
    const projectRow = rows.find((row) => row.textContent.includes('Project conversation'));
    const homeRow = rows.find((row) => row.textContent.includes('Home-only commitment') || row.textContent.includes('Held by: Home Manager'));
    assert.ok(projectRow);
    assert.match(projectRow.textContent, /Held by: Project Manager/);
    assert.ok(homeRow);
    assert.match(homeRow.textContent, /Held by: Home Manager/);
    assert.match(page.textContent, /Holder not recorded/);
  } finally {
    for (const key of keys) globalThis[key] = old.get(key);
    dom.window.close();
  }
  assert.equal(disk.getItem(STORAGE_KEY), bytes, 'rendering does not change stored bytes');
});

test('claims and releases are first-person, persisted and visible to the shared automation spine', () => {
  const { store, api, disk } = harness();
  store.update((draft) => { draft.settings.activeSeatId = 'project'; }, { type: 'test.seat', entity: 'workspace', entityId: 'seat', summary: 'switch' });
  assert.equal(api.oneOnOneLineClaim('legacy', { heldById: 'home' }).ok, false);
  const claimed = api.oneOnOneLineClaim('legacy');
  assert.equal(claimed.ok, true, claimed.error);
  assert.equal(JSON.parse(disk.getItem(STORAGE_KEY)).oneOnOnes[0].heldById, 'project');
  assert.equal(store.lastPropagationMetrics.rootEvent, 'oneonone.line.claimed');
  assert.ok(store.lastPropagationMetrics.pairs.some((pair) => pair.rule === 'matrixRule' && pair.event === 'oneonone.line.claimed'));
  store.update((draft) => { draft.settings.activeSeatId = 'home'; }, { type: 'test.seat', entity: 'workspace', entityId: 'seat', summary: 'switch' });
  assert.equal(api.oneOnOneLineRelease('legacy', { reason: 'Not mine' }).ok, false, 'another manager cannot withdraw the holder’s attribution');
  store.update((draft) => { draft.settings.activeSeatId = 'project'; }, { type: 'test.seat', entity: 'workspace', entityId: 'seat', summary: 'switch' });
  assert.equal(api.oneOnOneLineRelease('legacy', { reason: 'Recorded in error' }).ok, true);
  assert.equal(JSON.parse(disk.getItem(STORAGE_KEY)).oneOnOnes[0].heldById, null);
  assert.ok(store.state.events.some((event) => event.type === 'oneonone.line.released' && event.summary.includes('Recorded in error')));
  store.update((draft) => { draft.settings.activeSeatId = 'director'; }, { type: 'test.seat', entity: 'workspace', entityId: 'seat', summary: 'switch' });
  const report = api.oneOnOneLineReport();
  assert.equal(report.ok, true, report.error);
  assert.equal(report.report.actor.canScan, false, 'the unimplemented scan is not advertised as available');
  assert.equal(report.report.aggregateWithheld, true);
  assert.equal(report.report.board, null, 'a higher-altitude seat cannot recover unprotected aggregate cells');
  assert.deepEqual(report.report.persons, []);
});

test('unknown dates, structural defects and failed persistence never become a reassuring line reading', () => {
  const raw = fixture();
  raw.settings.activeSeatId = null;
  raw.oneOnOnes[0].date = 'not-a-date';
  const { state, warnings } = normalizeState(raw, { now: NOW });
  assert.ok(warnings.some((warning) => warning.includes('date(s) were missing or invalid')));
  const report = buildOneOnOneLines(state, { now: NOW });
  assert.equal(report.board.uncertainDateN, 1);
  assert.equal(report.board.unprovenN, 2);
  state.reportingLines.push({ ...state.reportingLines[0], id: 'duplicate-line', kind: 'product' });
  const refused = buildOneOnOneLines(state, { now: NOW });
  assert.equal(refused.board.structuralRefusedN, 1);
  assert.equal(refused.board.pairsN, 0);
  assert.match(refused.refusedPersons[0].reason, /same manager/);

  const { api, disk } = harness();
  const bytes = disk.getItem(STORAGE_KEY);
  disk.fail = true;
  const result = api.logOneOnOne({ personId: 'sam', date: '2026-11-10' });
  assert.equal(result.ok, true, 'the in-memory mutation happened and must not be mistaken for a safe retry');
  assert.equal(result.saved, false);
  assert.match(result.warning, /Could not save/);
  assert.equal(disk.getItem(STORAGE_KEY), bytes, 'the warning corresponds to unchanged stored bytes');
});

test('matrix coverage panel displays the scoped report cell-for-cell without changing stored meeting data', () => {
  const { store, api, disk } = harness();
  const bytes = disk.getItem(STORAGE_KEY);
  const result = api.oneOnOneLineReport();
  assert.equal(result.ok, true, result.error);
  const report = result.report;
  assert.ok(report.board.statesReconcile);
  assert.ok(report.board.meetingsReconcile);
  const expected = report.persons.flatMap((person) => person.lines.map((line) => ({ person, line })));

  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const keys = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event'];
  const old = new Map(keys.map((key) => [key, globalThis[key]]));
  let highBytes;
  try {
    for (const key of keys) globalThis[key] = key === 'window' ? dom.window : key === 'document' ? dom.window.document : dom.window[key];
    const page = renderOneOnOnes({ state: store.state, now: NOW, query: new URLSearchParams(), api, navigate() {} });
    const coverageTable = [...page.querySelectorAll('table')].find((table) => [...table.querySelectorAll('th')].some((th) => th.textContent === 'Accountable line'));
    assert.ok(coverageTable, 'the matrix line table is rendered');
    const actual = [...coverageTable.querySelectorAll('tbody tr')].map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent));
    assert.equal(actual.length, expected.length);
    for (const [index, { person, line }] of expected.entries()) {
      assert.deepEqual(actual[index], [
        person.personName,
        `${line.managerName} · ${line.role === 'home' ? 'home' : line.kind || 'additional'}`,
        line.role === 'home' ? 'Home line' : line.shareDeclared ? `${line.sharePct}%` : 'Undeclared — no exemption assumed',
        line.stateLabel,
        line.lastHeldOn || 'No attributed held 1:1',
        line.reason,
      ]);
    }
    assert.ok(page.textContent.includes(`${report.board.okN} on cadence`));
    assert.ok(page.textContent.includes(`${report.board.pairsN} person–line pairs`));
    assert.equal(disk.getItem(STORAGE_KEY), bytes, 'reading and rendering the manager panel mutate no stored meeting bytes');

    store.update((draft) => { draft.settings.activeSeatId = 'director'; }, { type: 'test.seat', entity: 'workspace', entityId: 'seat', summary: 'switch to aggregate-only altitude' });
    highBytes = disk.getItem(STORAGE_KEY);
    const high = api.oneOnOneLineReport();
    assert.equal(high.ok, true, high.error);
    assert.equal(high.report.aggregateWithheld, true);
    const highPage = renderOneOnOnes({ state: store.state, now: NOW, query: new URLSearchParams(), api, navigate() {} });
    const highPanel = [...highPage.querySelectorAll('section.card')].find((section) => section.querySelector('h2')?.textContent === 'Matrix 1:1 line coverage');
    assert.ok(highPanel);
    assert.match(highPanel.textContent, new RegExp(high.report.aggregateWithheldReason.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal([...highPanel.querySelectorAll('table')].some((table) => [...table.querySelectorAll('th')].some((th) => th.textContent === 'Accountable line')), false, 'higher-altitude withheld cells never render as rows');
    assert.equal(highPanel.textContent.includes('Sam'), false);
  } finally {
    for (const key of keys) globalThis[key] = old.get(key);
    dom.window.close();
  }
  assert.equal(disk.getItem(STORAGE_KEY), highBytes, 'reading and rendering the higher-altitude panel mutate no stored meeting bytes');
});
