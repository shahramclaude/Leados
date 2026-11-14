/**
 * Efficiency hardening (ADR-0200):
 *  - a memo never serves a stale value after its build throws;
 *  - storage quota is priced from the exact payload the store already wrote;
 *  - a durable automation gap is distinguishable from a rule failure.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createKeyedMemo, quotaWarningForBytes, quotaWarningFor } from '../../app/core/storeOptimizations.js';
import { createStore } from '../../app/core/store.js';

const NOW = new Date('2026-11-14T10:00:00.000Z');
const memory = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    _values: values,
  };
};

test('a memo whose build throws does not keep a stale result for the failed key', () => {
  let calls = 0;
  let shouldThrow = true;
  const memo = createKeyedMemo((value) => {
    calls += 1;
    if (shouldThrow) throw new Error('build failed');
    return { value };
  });

  assert.throws(() => memo('a'), /build failed/);
  assert.equal(memo.stats().misses, 0, 'a failed build is not a cache miss with a result');
  assert.equal(memo.stats().cached, false);
  shouldThrow = false;
  // The important part: calling the SAME key again retries the build. Before
  // the fix it returned the previous successful result (or null) for a key it
  // had never produced.
  assert.deepEqual(memo('a'), { value: 'a' });
  assert.equal(calls, 2);
  assert.equal(memo.stats().misses, 1);
  assert.deepEqual(memo('a'), { value: 'a' });
  assert.equal(calls, 2, 'the successful result is now cached');
  assert.equal(memo.stats().hits, 1);
});

test('a memo still compares every key part with === and can be cleared', () => {
  let calls = 0;
  const memo = createKeyedMemo((state, day) => {
    calls += 1;
    return `${calls}:${day}`;
  });
  const stateA = { id: 'a' };
  const stateB = { id: 'b' };
  const first = memo(stateA, '2026-11-14');
  assert.equal(memo(stateA, '2026-11-14'), first);
  assert.equal(calls, 1);
  assert.notEqual(memo(stateB, '2026-11-14'), first);
  assert.equal(memo(stateB, '2026-11-15') === first, false);
  memo.clear();
  assert.notEqual(memo(stateB, '2026-11-15'), null);
  assert.equal(memo.stats().cached, true);
});

test('quota guidance is a function of exact bytes, and zero/unknown is silent', () => {
  assert.equal(quotaWarningForBytes(null), null);
  assert.equal(quotaWarningForBytes(0), null);
  assert.equal(quotaWarningForBytes(Number.NaN), null);
  assert.equal(quotaWarningForBytes(1024), null);
  assert.match(quotaWarningForBytes(4 * 1024 * 1024), /Consider archiving/);
  assert.match(quotaWarningForBytes(4.8 * 1024 * 1024), /approaching browser storage limits/);
  // The object-shaped helper stays an estimate and keeps the same thresholds.
  assert.equal(quotaWarningFor({ people: [] }), null);
});

test('the store exposes the exact payload length it wrote, not a re-estimate', () => {
  const storage = memory();
  const store = createStore({ storage, now: () => NOW, idFactory: (prefix) => `${prefix}-bytes` });
  store.load();
  assert.equal(store.lastPersistBytes, 0, 'an empty load is zero characters, not unknown');
  store.update((draft) => {
    draft.people.push({ id: 'p-bytes', name: 'Byte Counter', role: 'Tester', status: 'active' });
  }, { type: 'person.created', entity: 'person', entityId: 'p-bytes', summary: 'byte test' });
  const raw = storage.getItem(store.storageKey);
  assert.ok(raw && raw.length > 100);
  assert.equal(store.lastPersistBytes, raw.length, 'the exact stored payload length is retained');
  assert.equal(store.sizeBytes(), raw.length);
});

test('a loaded payload also reports the exact stored length', () => {
  const storage = memory();
  const store = createStore({ storage, now: () => NOW, idFactory: (prefix) => `${prefix}-bytes` });
  store.load();
  store.update((draft) => { draft.meta.revision += 1; }, { type: 'workspace.touched', entity: 'workspace', entityId: 'w' });
  const raw = storage.getItem(store.storageKey);
  const reloaded = createStore({ storage, now: () => NOW });
  reloaded.load();
  assert.equal(reloaded.lastPersistBytes, raw.length);
});
