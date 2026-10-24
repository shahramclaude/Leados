import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createEmptyState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createApi } from '../../app/actions.js';

const NOW = new Date('2026-10-24T10:00:00Z');
function storageWith(raw = null) {
  const data = new Map(raw === null ? [] : [[STORAGE_KEY, raw]]);
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
}
function futureState() {
  return { ...createEmptyState(NOW.toISOString()), schemaVersion: SCHEMA_VERSION + 1,
    futurePrivateCollection: [{ id: 'future-record', note: 'Must survive this older application unchanged.' }] };
}

test('future schema imports reject both wrapper and nested versions without changing current records or storage', () => {
  const storage = storageWith(); const store = createStore({ storage, now: () => NOW }); store.load();
  const api = createApi(store, { now: () => NOW }); api.addPerson({ name: 'Keep this person' });
  const before = store.exportJSON(); const saved = storage.getItem(STORAGE_KEY);
  for (const raw of [futureState(), { schemaVersion: SCHEMA_VERSION + 1, state: createEmptyState() },
    { schemaVersion: SCHEMA_VERSION, state: futureState() }]) {
    const result = store.importJSON(JSON.stringify(raw));
    assert.equal(result.ok, false); assert.match(result.error, /newer than supported/);
    assert.equal(store.exportJSON(), before); assert.equal(storage.getItem(STORAGE_KEY), saved);
  }
});

test('newer saved schema is protected from API, direct, demo and cleanup writes; export preserves the exact original', () => {
  const original = JSON.stringify(futureState(), null, 2); const storage = storageWith(original);
  const store = createStore({ storage, now: () => NOW }); store.load(); const before = JSON.stringify(store.state);
  assert.match(store.writeBlockReason, /newer than supported/); assert.match(store.persistError, /not been changed/);
  const api = createApi(store, { now: () => NOW });
  for (const result of [api.addPerson({ name: 'Do not pretend to save me' }), api.updateSettings({ teamName: 'Do not save' }), api.addConflict({})]) {
    assert.equal(result.ok, false); assert.match(result.error, /newer than supported/);
  }
  store.update((draft) => { draft.settings.teamName = 'Direct write'; }, { type: 'unsafe' });
  assert.equal(store.seedDemo({ force: true }).ok, false); store.clearDemo();
  assert.equal(JSON.stringify(store.state), before); assert.equal(storage.getItem(STORAGE_KEY), original);
  assert.equal(store.exportJSON(), original, 'not an empty/downcast export that loses unknown collections');
});

test('an explicit compatible import releases future-schema protection only after the replacement saves', () => {
  const original = JSON.stringify(futureState()); const storage = storageWith(original);
  const save = storage.setItem; let full = true;
  storage.setItem = (key, value) => { if (full) { const err = new Error('quota'); err.name = 'QuotaExceededError'; throw err; } save(key, value); };
  const store = createStore({ storage, now: () => NOW }); store.load();
  const compatible = createEmptyState(NOW.toISOString()); compatible.settings.teamName = 'Restored backup';
  assert.equal(store.importJSON(JSON.stringify(compatible)).ok, false); assert.ok(store.writeBlockReason);
  assert.equal(store.exportJSON(), original); assert.equal(storage.getItem(STORAGE_KEY), original);
  full = false; assert.equal(store.importJSON(JSON.stringify(compatible)).ok, true);
  assert.equal(store.writeBlockReason, null); assert.equal(store.state.settings.teamName, 'Restored backup');
  assert.equal(createApi(store).addPerson({ name: 'Can save again' }).ok, true);
});

test('explicit reset can replace unsupported storage but a failed reset cannot destroy its original export', () => {
  const original = JSON.stringify(futureState()); const storage = storageWith(original); const save = storage.setItem;
  const store = createStore({ storage, now: () => NOW }); store.load();
  storage.setItem = () => { throw new Error('Storage denied'); };
  store.reset(); assert.ok(store.writeBlockReason); assert.equal(store.exportJSON(), original);
  storage.setItem = save; store.reset();
  assert.equal(store.writeBlockReason, null); assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).schemaVersion, SCHEMA_VERSION);
  assert.equal(store.state.people.length, 0);
});

test('invalid declared schema versions cannot be silently downcast during import or saved-data loading', () => {
  for (const version of [0, -1, 3.5, 'not-a-version', null, true, [1], {}]) {
    const raw = { ...createEmptyState(), schemaVersion: version }; const original = JSON.stringify(raw);
    const store = createStore({ storage: storageWith(original), now: () => NOW }); store.load();
    assert.ok(store.writeBlockReason); assert.equal(store.exportJSON(), original);
    assert.equal(store.importJSON(original).ok, false);
  }
});
