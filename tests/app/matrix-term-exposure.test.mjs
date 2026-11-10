import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createEmptyState, normalizeState } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildMatrixReport } from '../../app/core/domain/matrix.js';
import { MATRIX_LIMITS } from '../../app/core/domain/matrixRegistry.js';
import { renderMatrix } from '../../app/views/matrix.js';

const NOW = new Date('2026-11-10T12:00:00Z');
function fixture() {
  const state = createEmptyState(NOW.toISOString());
  state.people = [
    { id: 'home', name: 'Home Manager', level: 'director', managerId: null, status: 'active' },
    { id: 'project', name: 'Project Manager', level: 'manager', managerId: null, status: 'active' },
    { id: 'product', name: 'Product Manager', level: 'manager', managerId: null, status: 'active' },
    { id: 'sam', name: 'Sam', level: 'ic', managerId: 'home', status: 'active' },
    { id: 'peer', name: 'Peer', level: 'ic', managerId: 'product', status: 'active' },
  ];
  state.reportingLines = [
    line('open', 'sam', 'project', null),
    line('today', 'sam', 'product', '2026-11-10'),
    line('boundary', 'peer', 'project', '2026-11-24'),
  ];
  return normalizeState(state).state;
}
function line(id, personId, managerId, toISO, extra = {}) {
  return { id, personId, managerId, kind: 'project', shareH: 20, rights: [],
    fromISO: '2026-10-01', toISO, status: 'active', declaredAt: '2026-10-01T00:00:00Z', ...extra };
}
const read = (state, settings = state.settings) => buildMatrixReport(state, { now: NOW, settings });

test('term states use stored dates, inclusive horizon, and distinct people under multiple lines', () => {
  const state = fixture();
  state.reportingLines.push(line('long', 'peer', 'home', '2026-11-25'));
  state.reportingLines.push(line('ended', 'sam', 'home', '2026-11-09'));
  state.reportingLines.push(line('future', 'peer', 'product', null, { fromISO: '2026-12-01' }));
  const before = JSON.stringify(state);
  const terms = read(state).termExposure;
  assert.equal(terms.totalN, 4);
  assert.equal(terms.peopleN, 2);
  assert.deepEqual(terms.counts, { 'no-term-declared': 1, 'ending-soon': 2, 'dated-term': 1 });
  assert.deepEqual(terms.rows.map(r => [r.declarationId, r.daysRemaining]), [
    ['boundary', 14], ['long', 15], ['open', null], ['today', 0],
  ]);
  assert.equal(terms.reconciles, true);
  assert.equal(JSON.stringify(state), before, 'read has no writes or implicit renewal');
});

test('term exposure respects seat scope and counts refused declarations separately', () => {
  const state = fixture();
  state.reportingLines.push(line('bad', 'sam', 'missing', null));
  const report = read(state, { ...state.settings, activeSeatId: 'home' });
  assert.equal(report.seat.id, 'home');
  assert.equal(report.termExposure.totalN, 2);
  assert.deepEqual(new Set(report.termExposure.rows.map(r => r.personId)), new Set(['sam']));
  assert.equal(report.termExposure.refusedLineN, 1);
});

test('counts include rows beyond the register cap; single-chain workspaces have no exposure', () => {
  const state = fixture();
  state.reportingLines = [];
  assert.equal(read(state).termExposure.totalN, 0);
  for (let i = 0; i < MATRIX_LIMITS.people + 2; i++) {
    const id = `person-${i}`;
    state.people.push({ id, name: id, level: 'ic', managerId: 'home', status: 'active' });
    state.reportingLines.push(line(`line-${i}`, id, 'project', null));
  }
  const terms = read(state).termExposure;
  assert.equal(terms.totalN, MATRIX_LIMITS.people + 2);
  assert.equal(terms.counts['no-term-declared'], terms.totalN);
  assert.equal(terms.rows.length, MATRIX_LIMITS.people);
  assert.equal(terms.remainderN, 2);
});

test('real API, persisted reload and rendered term cells exactly match the stored declarations', () => {
  const data = new Map([[STORAGE_KEY, JSON.stringify(fixture())]]);
  const storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
  const open = () => {
    const store = createStore({ storage, now: () => NOW });
    store.load();
    return { store, api: createApi(store, { now: () => NOW }) };
  };
  const first = open();
  const storedBefore = data.get(STORAGE_KEY);
  const report = first.api.matrixReport();
  assert.equal(report.ok, true);
  const second = open();
  assert.deepEqual(second.api.matrixReport().report.termExposure, report.report.termExposure);
  const persisted = JSON.parse(data.get(STORAGE_KEY));
  assert.deepEqual(report.report.termExposure, read(persisted).termExposure);

  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const globals = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event'];
  const previous = new Map(globals.map(k => [k, globalThis[k]]));
  try {
    for (const k of globals) globalThis[k] = k === 'document' ? dom.window.document : k === 'window' ? dom.window : dom.window[k];
    const node = renderMatrix({ api: second.api, state: second.store.state,
      query: new URLSearchParams('panel=lines'), navigate() {}, refresh() {} });
    const table = [...node.querySelectorAll('table')].find(t => t.querySelector('caption')?.textContent === 'Active additional reporting-line terms');
    assert.ok(table);
    const rows = [...table.querySelectorAll('tbody tr')];
    assert.equal(rows.length, report.report.termExposure.totalN);
    for (const [i, row] of rows.entries()) {
      const model = report.report.termExposure.rows[i];
      const saved = persisted.reportingLines.find(l => l.id === model.declarationId);
      const cells = [...row.querySelectorAll('td')].map(c => c.textContent);
      assert.deepEqual(cells.slice(0, 6), [model.personName, model.managerName, saved.fromISO,
        saved.toISO || 'not declared', model.state,
        model.daysRemaining === null ? 'withheld — no end date' : String(model.daysRemaining)]);
    }
    assert.match(node.textContent, /No term declared: 1; ending soon: 2; dated term: 0/);
    assert.match(node.textContent, /Category counts reconcile: yes/);
    assert.match(node.textContent, /Two-sided re-affirmation is not yet supported/);
    assert.equal(data.get(STORAGE_KEY), storedBefore, 'render and reload do not mutate persistence');
  } finally {
    for (const [k, v] of previous) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; }
    dom.window.close();
  }
});
