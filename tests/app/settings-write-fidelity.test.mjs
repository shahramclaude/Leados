import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, normalizeSettings } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';

const now = () => new Date('2026-11-12T12:00:00.000Z');
function setup() {
  const values = new Map([[STORAGE_KEY, JSON.stringify(createEmptyState(now().toISOString()))]]);
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  let n = 0;
  const store = createStore({ storage, now, idFactory: p => `${p}-${++n}` });
  store.load();
  return { store, api: createApi(store, { now }), storage, values };
}

test('unknown keys and non-patches refuse atomically, including a mixed valid patch', () => {
  const { store, api, values } = setup();
  for (const patch of [null, [], 'name', 3, new Date(), { leaderName: 'Changed', imaginaryControl: false }, JSON.parse('{"__proto__":false}'), { [Symbol('key')]: true }]) {
    const before = JSON.stringify(store.state);
    const disk = values.get(STORAGE_KEY);
    const result = api.updateSettings(patch);
    assert.equal(result.ok, false);
    assert.equal(result.field, 'patch');
    assert.equal(JSON.stringify(store.state), before);
    assert.equal(values.get(STORAGE_KEY), disk);
  }
});

test('loader-altered values refuse without changing state, storage or event history', () => {
  const { store, api, values } = setup();
  for (const patch of [{ leaderName: 'x'.repeat(121) }, { oneOnOneCadenceDays: 999 }, { matrixAutoPropagate: 'false' }, { teamName: undefined }, { oneOnOneCadenceDays: NaN }]) {
    const before = JSON.stringify(store.state);
    const disk = values.get(STORAGE_KEY);
    const result = api.updateSettings(patch);
    assert.equal(result.ok, false, JSON.stringify(patch));
    assert.match(result.error, /reload/);
    assert.equal(JSON.stringify(store.state), before);
    assert.equal(values.get(STORAGE_KEY), disk);
  }
});

test('accepted settings preserve exact normalized values across actual store reload', () => {
  const { store, api, storage } = setup();
  const patch = { leaderName: 'Ada', oneOnOneCadenceDays: 21, matrixAutoPropagate: false };
  assert.equal(api.updateSettings(patch).ok, true);
  const reboot = createStore({ storage, now });
  reboot.load();
  for (const [key, value] of Object.entries(patch)) {
    assert.equal(store.state.settings[key], value);
    assert.equal(reboot.state.settings[key], value);
  }
  assert.deepEqual(normalizeSettings(store.state.settings), normalizeSettings(reboot.state.settings));
});

test('existing explicit numeric parsing is preserved before the fidelity gate', () => {
  const { api, store } = setup();
  assert.equal(api.updateSettings({ pulseMinResponses: '5', idleLockMinutes: '30' }).ok, true);
  assert.equal(store.state.settings.pulseMinResponses, 5);
  assert.equal(store.state.settings.idleLockMinutes, 30);
});
