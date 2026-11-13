/** Session 230 — matrix accountability is not readership of another line's SBI conversation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { safeSeatContext, scopedViewState } from '../../app/core/domain/viewScope.js';

const NOW = new Date('2026-11-10T10:00:00.000Z');
const ISO = NOW.toISOString();
const BODY = 'Project feedback includes confidential delivery context.';

function fixture(withLine = true) {
  const state = createEmptyState(ISO);
  state.schemaVersion = 133;
  state.settings.activeSeatId = 'project';
  state.people = [
    { id: 'director', name: 'Director', level: 'director', managerId: null, status: 'active', createdAt: ISO },
    { id: 'home', name: 'Home Manager', level: 'manager', managerId: 'director', status: 'active', createdAt: ISO },
    { id: 'project', name: 'Project Manager', level: 'manager', managerId: 'director', status: 'active', createdAt: ISO },
    { id: 'sam', name: 'Sam', level: 'ic', managerId: 'home', status: 'active', createdAt: ISO },
  ];
  state.reportingLines = withLine ? [{ id: 'project-line', personId: 'sam', managerId: 'project', kind: 'project', shareH: 40, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: ISO, status: 'active' }] : [];
  state.feedback = [
    { id: 'fb-home', personId: 'sam', direction: 'given', kind: 'constructive', situation: 'Home situation', behavior: 'Home behavior', impact: 'Home impact', tags: ['home'], date: '2026-11-08', observedOn: '2026-11-07', followUpOn: '2026-11-12', followUpDone: false, authoredById: 'home', authoredByBasis: 'seat', authoredAt: ISO, createdAt: ISO },
    { id: 'fb-project', personId: 'sam', direction: 'given', kind: 'praise', situation: 'Project situation', behavior: BODY, impact: 'Project impact', tags: ['project'], date: '2026-11-09', authoredById: 'project', authoredByBasis: 'seat', authoredAt: ISO, createdAt: ISO },
    { id: 'fb-legacy', personId: 'sam', direction: 'received', kind: 'praise', situation: 'Legacy situation', behavior: 'Legacy behavior', impact: 'Legacy impact', tags: [], date: '2026-11-05', createdAt: ISO },
  ];
  return state;
}
function storage(initial) {
  const map = new Map([[STORAGE_KEY, JSON.stringify(initial)]]);
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key) };
}
function harness(withLine = true) {
  const disk = storage(fixture(withLine));
  const store = createStore({ storage: disk, now: () => NOW });
  store.load();
  return { store, disk, api: createApi(store, { now: () => NOW }) };
}
function view(store) {
  const context = safeSeatContext(store.state, NOW);
  assert.equal(context.error, null);
  return scopedViewState(store.state, context, { now: NOW, settings: store.state.settings });
}
function fb(state, id) { return state.feedback.find((item) => item.id === id); }

test('line-only view keeps matrix feedback facts but withholds body without changing storage', () => {
  const { store, disk } = harness();
  const persistedBefore = disk.getItem(STORAGE_KEY);
  const projection = view(store);
  const home = fb(projection, 'fb-home');
  assert.equal(home.bodyWithheld, true);
  assert.equal(home.personId, 'sam');
  assert.equal(home.date, '2026-11-08');
  assert.equal(home.kind, 'constructive');
  assert.equal(home.followUpOn, '2026-11-12');
  assert.equal(home.situation, '');
  assert.equal(home.behavior, '');
  assert.equal(home.impact, '');
  assert.deepEqual(home.tags, []);
  assert.match(home.bodyWithheldReason, /another manager/);
  assert.equal(fb(projection, 'fb-project').behavior, BODY, 'the recorded author reads their own feedback');
  assert.equal(fb(projection, 'fb-legacy').bodyWithheld, true, 'unattributed line-only feedback fails closed');
  assert.equal(disk.getItem(STORAGE_KEY), persistedBefore, 'displaying a stub writes nothing');
  assert.equal(fb(store.state, 'fb-home').behavior, 'Home behavior', 'stored body remains verbatim');
});

test('recorded author can edit and close follow-up; another line cannot mutate the body or dates', () => {
  const { store, api } = harness();
  assert.equal(api.updateFeedback('fb-home', { behavior: 'Changed from another line' }).ok, false);
  assert.equal(api.updateFeedback('fb-home', { date: '2026-11-09' }).ok, false);
  assert.equal(api.completeFollowUp('fb-home', true).ok, false);
  assert.equal(fb(store.state, 'fb-home').behavior, 'Home behavior');
  store.update((draft) => { draft.settings.activeSeatId = 'home'; }, { type: 'test.seat', entity: 'seat', entityId: 'home', summary: 'Operate as home manager' });
  assert.equal(api.updateFeedback('fb-home', { behavior: 'Corrected with home-line context' }).ok, true);
  assert.equal(api.completeFollowUp('fb-home', true).ok, true);
  assert.equal(fb(store.state, 'fb-home').authoredById, 'home', 'caller cannot rewrite recorded authorship');
  assert.equal(fb(store.state, 'fb-home').followUpDone, true);
});

test('line manager logging feedback is attributed to that seat; single-chain legacy view stays unchanged', () => {
  const { store, api } = harness();
  const result = api.addFeedback({ personId: 'sam', behavior: 'A newly recorded observable action.' });
  assert.equal(result.ok, true);
  const created = fb(store.state, result.id);
  assert.equal(created.authoredById, 'project');
  assert.equal(created.authoredByBasis, 'seat');
  assert.equal(created.authoredAt, ISO);
  const noLine = normalizeState(fixture(false), { now: NOW }).state;
  noLine.settings.activeSeatId = 'home';
  const singleLine = scopedViewState(noLine, safeSeatContext(noLine, NOW), { now: NOW, settings: noLine.settings });
  assert.equal(fb(singleLine, 'fb-legacy').behavior, 'Legacy behavior');
});

test('schema v134 migration preserves historical feedback as unattributed', () => {
  const old = fixture();
  old.schemaVersion = 133;
  delete old.feedback[2].authoredById;
  const normalized = normalizeState(old, { now: NOW }).state;
  assert.equal(SCHEMA_VERSION, 155);
  assert.equal(normalized.schemaVersion, 155);
  assert.equal(fb(normalized, 'fb-legacy').authoredById, null);
  assert.equal(fb(normalized, 'fb-legacy').authoredAt, null);
});
