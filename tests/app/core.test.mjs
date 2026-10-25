import test from 'node:test';
import assert from 'node:assert/strict';

import { addDays, daysBetween, dayKey, humanDays, isOverdue, weekStart, clamp } from '../../app/core/time.js';
import { createEmptyState, normalizeState, SCHEMA_VERSION, migrate } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';

const NOW = new Date('2026-10-24T10:00:00.000Z');

/** A minimal in-memory Storage stand-in with no size limit. */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    keys: () => [...map.keys()],
    dump: () => Object.fromEntries(map),
  };
}

test('time: day arithmetic is UTC-stable across month boundaries', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2026-10-01', '2026-10-24'), 23);
  assert.equal(daysBetween('2026-10-24', '2026-10-01'), -23);
  assert.equal(dayKey(new Date('2026-10-24T23:30:00.000Z')), '2026-10-24');
});

test('time: week starts on Monday', () => {
  assert.equal(weekStart('2026-10-24'), '2026-10-19'); // Saturday → Monday 19th
  assert.equal(weekStart('2026-10-19'), '2026-10-19'); // Monday
  assert.equal(weekStart('2026-10-25'), '2026-10-19'); // Sunday belongs to previous Monday
});

test('time: overdue and human phrasing', () => {
  assert.equal(isOverdue('2026-10-01', NOW), true);
  assert.equal(isOverdue('2026-10-24', NOW), false);
  assert.equal(isOverdue('2026-10-30', NOW), false);
  assert.equal(humanDays(0), 'today');
  assert.equal(humanDays(1), '1 day ago');
  assert.equal(humanDays(-3), 'in 3 days');
  assert.equal(clamp(140), 100);
  assert.equal(clamp(-5), 0);
  assert.equal(clamp(NaN), 0);
});

test('schema: an empty state has every collection and valid settings', () => {
  const state = createEmptyState(NOW.toISOString());
  assert.equal(state.schemaVersion, SCHEMA_VERSION);
  for (const key of ['people', 'oneOnOnes', 'feedback', 'goals', 'delegations', 'growthPlans', 'pulses', 'decisions', 'recognition', 'readiness', 'reviews', 'conflicts', 'events']) {
    assert.ok(Array.isArray(state[key]), `${key} should be an array`);
  }
  assert.equal(state.settings.oneOnOneCadenceDays, 7);
  assert.equal(state.settings.pulseMinResponses, 5, 'published default anonymity floor');
});

test('schema: normalization repairs a partial blob and reports what it changed', () => {
  const { state, warnings } = normalizeState({
    people: [
      { id: 'p1', name: 'Ada', level: 'manager' },
      { id: 'p1', name: 'Duplicate' },
      { role: 'nameless record' },
      { id: 'p3', name: '' },
    ],
    goals: 'not-a-list',
    settings: { oneOnOneCadenceDays: 9999, pulseMinResponses: 0 },
    pulses: [{ id: 'x1', anonymity: 'anonymous', personId: 'p1', scores: { safety: 9, workload: 0 } }],
  });
  assert.equal(state.people.length, 1, 'duplicate, id-less and nameless people are dropped');
  assert.equal(state.people[0].level, 'manager');
  assert.deepEqual(state.goals, []);
  assert.ok(warnings.some((w) => w.includes('goals')));
  assert.ok(warnings.some((w) => w.includes('duplicate')));
  assert.equal(state.settings.oneOnOneCadenceDays, 90, 'cadence is clamped');
  assert.equal(state.settings.pulseMinResponses, 3);
  // An anonymous response can never keep a personId, even if the file has one.
  assert.equal(state.pulses[0].personId, null);
  assert.equal(state.pulses[0].anonymity, 'anonymous');
  assert.equal(state.pulses[0].scores.safety, 5, 'scores are clamped to 1..5');
  assert.equal(state.pulses[0].scores.workload, 1);
});

test('schema: normalization rejects non-objects without throwing', () => {
  const { state, warnings } = normalizeState(null);
  assert.ok(Array.isArray(state.people));
  assert.equal(warnings.length, 1);
  const migrated = migrate({ schemaVersion: 1 });
  assert.deepEqual(migrated.applied, ['1 → 2', '2 → 3', '3 → 4', '4 → 5', '5 → 6', '6 → 7', '7 → 8', '8 → 9', '9 → 10', '10 → 11', '11 → 12', '12 → 13', '13 → 14', '14 → 15', '15 → 16']);
  assert.deepEqual(migrated.raw.reviews, []);
  assert.deepEqual(migrated.raw.onboarding, []);
});

test('store: starts empty, persists an update, and reloads it', () => {
  const storage = fakeStorage();
  const store = createStore({ storage, now: () => NOW });
  store.load();
  assert.equal(store.state.people.length, 0);

  store.update(
    (draft) => {
      draft.people.push({
        id: 'p1', name: 'Ada Lovelace', role: 'Engineer', level: 'senior', team: 'Core',
        managerId: null, startDate: '2026-01-05', focus: '', status: 'active', createdAt: NOW.toISOString(),
      });
    },
    { type: 'person.created', entity: 'person', entityId: 'p1', summary: 'Added Ada Lovelace' },
  );

  assert.equal(store.state.people.length, 1);
  assert.equal(store.state.meta.revision, 1);
  assert.equal(store.state.events.length, 1);
  assert.equal(store.state.events[0].type, 'person.created');

  const reloaded = createStore({ storage, now: () => NOW });
  reloaded.load();
  assert.equal(reloaded.state.people.length, 1);
  assert.equal(reloaded.state.people[0].name, 'Ada Lovelace');
});

test('store: corrupt JSON is quarantined instead of crashing the app', () => {
  const storage = fakeStorage({ 'leados.lifecycle.v1': '{ not json at all' });
  const store = createStore({ storage, now: () => NOW });
  store.load();
  assert.equal(store.state.people.length, 0);
  assert.ok(store.warnings[0].toLowerCase().includes('unreadable'));
  assert.ok(storage.keys().some((k) => k.startsWith('leados.corrupt.')), 'the bad blob is kept for recovery');
});

test('store: export → reset → import restores every record', () => {
  const storage = fakeStorage();
  const store = createStore({ storage, now: () => NOW });
  store.load();
  store.seedDemo();
  const peopleBefore = store.state.people.length;
  const goalsBefore = store.state.goals.length;
  const json = store.exportJSON();

  store.reset();
  assert.equal(store.state.people.length, 0);

  const result = store.importJSON(json);
  assert.equal(result.ok, true);
  assert.equal(store.state.people.length, peopleBefore);
  assert.equal(store.state.goals.length, goalsBefore);
});

test('store: import rejects foreign JSON without touching existing data', () => {
  const storage = fakeStorage();
  const store = createStore({ storage, now: () => NOW });
  store.load();
  store.update((draft) => {
    draft.people.push({
      id: 'keep-me', name: 'Keep', role: '', level: 'ic', team: '', managerId: null,
      startDate: null, focus: '', status: 'active', createdAt: NOW.toISOString(),
    });
  });

  assert.equal(store.importJSON('not json').ok, false);
  assert.equal(store.importJSON('{"hello":"world"}').ok, false);
  assert.equal(store.state.people.length, 1);
  assert.equal(store.state.people[0].id, 'keep-me');
});

test('store: a full storage quota is surfaced, not swallowed', () => {
  const storage = fakeStorage();
  let full = false;
  storage.setItem = (k, v) => {
    if (full) {
      const err = new Error('quota');
      err.name = 'QuotaExceededError';
      throw err;
    }
    fakeStorage.prototype; // no-op
    storage.__map = storage.__map || new Map();
    storage.__map.set(k, v);
  };
  storage.getItem = (k) => (storage.__map && storage.__map.get(k)) || null;

  const store = createStore({ storage, now: () => NOW });
  store.load();
  full = true;
  store.update((draft) => {
    draft.settings.teamName = 'Core';
  });
  assert.ok(store.persistError, 'the failure is reported');
  assert.equal(store.state.settings.teamName, 'Core', 'in-memory state still reflects the change');
});

test('store: the event log is capped so the blob cannot grow without bound', () => {
  const storage = fakeStorage();
  const store = createStore({ storage, now: () => NOW });
  store.load();
  for (let i = 0; i < 650; i += 1) {
    store.update((draft) => {
      draft.settings.teamName = `Team ${i}`;
    }, { type: 'settings.updated', summary: `tick ${i}` });
  }
  assert.equal(store.state.events.length, 600);
  assert.equal(store.state.events.at(-1).summary, 'tick 649');
});

test('store: clearing the demo removes demo records and keeps real ones', () => {
  const storage = fakeStorage();
  const store = createStore({ storage, now: () => NOW });
  store.load();
  store.seedDemo();
  store.update((draft) => {
    draft.people.push({
      id: 'person-real', name: 'Real Person', role: 'Engineer', level: 'ic', team: 'Core',
      managerId: null, startDate: null, focus: '', status: 'active', createdAt: NOW.toISOString(),
    });
    const demoPerson = draft.people.find((person) => person.id.includes('-demo-'));
    draft.reviews.push(
      { id: 'review-real', personId: 'person-real' },
      { id: 'review-on-demo-person', personId: demoPerson.id },
      { id: 'review-demo-fabricated', personId: 'person-real' },
    );
  });
  store.clearDemo();
  assert.deepEqual(store.state.people.map((p) => p.id), ['person-real']);
  assert.deepEqual(store.state.reviews.map((review) => review.id), ['review-real']);
  assert.equal(store.state.meta.isDemo, false);
  assert.equal(store.state.oneOnOnes.length, 0);
});

test('store: the demo cannot silently replace records the user entered', () => {
  const storage = fakeStorage();
  const store = createStore({ storage, now: () => NOW });
  store.load();
  store.update((draft) => {
    draft.people.push({
      id: 'person-real', name: 'Real Person', role: 'Engineer', level: 'ic', team: 'Core',
      managerId: null, startDate: null, focus: '', status: 'active', createdAt: NOW.toISOString(),
    });
  });

  const refused = store.seedDemo();
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'has-real-data');
  assert.deepEqual(store.state.people.map((p) => p.id), ['person-real'], 'real data untouched');

  const forced = store.seedDemo({ force: true });
  assert.equal(forced.ok, true);
  assert.equal(store.state.meta.isDemo, true);
  assert.ok(store.state.people.length > 1);
});

test('store: clearing the demo removes demo records that have no person attached', () => {
  const storage = fakeStorage();
  const store = createStore({ storage, now: () => NOW });
  store.load();
  store.seedDemo();
  const anonymousBefore = store.state.pulses.filter((p) => p.personId === null).length;
  assert.ok(anonymousBefore > 0, 'the demo contains anonymous pulse responses');

  store.clearDemo();
  assert.equal(store.state.pulses.length, 0, 'no fabricated anonymous answers survive');
  assert.equal(store.state.goals.length, 0);
  assert.equal(store.state.decisions.length, 0);
  assert.equal(store.state.people.length, 0);
  assert.equal(store.hasRealData(), false);

  // ...but a real record added alongside the demo does survive.
  store.seedDemo({ force: true });
  store.update((draft) => {
    draft.people.push({
      id: 'person-keep', name: 'Keep Me', role: '', level: 'ic', team: '', managerId: null,
      startDate: null, focus: '', status: 'active', createdAt: NOW.toISOString(),
    });
  });
  store.clearDemo();
  assert.deepEqual(store.state.people.map((p) => p.id), ['person-keep']);
  assert.equal(store.hasRealData(), true);
});
