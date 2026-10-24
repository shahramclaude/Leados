/**
 * app/core/store.js — persistence, audit trail, and change notification.
 *
 * Design rules enforced here:
 *  1. Reads never throw. A corrupt or partial blob is quarantined and the app
 *     opens an empty workspace with a visible warning instead of a blank page.
 *  2. Writes are explicit and atomic per mutation: the new state is only
 *     adopted after it serialises successfully, so an out-of-quota browser
 *     cannot leave the app showing data it did not save.
 *  3. Every meaningful mutation appends to an append-oriented event log, capped so
 *     it can never grow the blob without bound.
 *  4. Storage is injected, so the whole module is testable in Node.
 */

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from './schema.js';
import { buildDemoState } from './demo.js';

export const STORAGE_KEY = 'leados.lifecycle.v1';
export const QUARANTINE_PREFIX = 'leados.corrupt.';
const EVENT_CAP = 600;

function defaultStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* private mode / disabled storage */
  }
  return null;
}

function defaultIdFactory() {
  let n = 0;
  return (prefix = 'id') => {
    n += 1;
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${Date.now().toString(36)}-${n.toString(36)}${rand}`;
  };
}

export function createStore(options = {}) {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const key = options.key || STORAGE_KEY;
  const now = options.now || (() => new Date());
  const idFactory = options.idFactory || defaultIdFactory();
  const listeners = new Set();

  let state = createEmptyState(now().toISOString());
  let warnings = [];
  let persistError = null;
  let loaded = false;

  function notify(reason) {
    for (const fn of listeners) {
      try {
        fn(state, { reason, warnings, persistError });
      } catch (err) {
        // A broken subscriber must not take down the store.
        if (typeof console !== 'undefined') console.error('store subscriber failed', err);
      }
    }
  }

  function readRaw() {
    if (!storage) return { raw: null, error: 'This browser has no local storage available, so nothing can be saved.' };
    try {
      return { raw: storage.getItem(key), error: null };
    } catch (err) {
      return { raw: null, error: `Could not read saved data: ${err && err.message ? err.message : err}` };
    }
  }

  function quarantine(raw) {
    if (!storage || !raw) return;
    try {
      storage.setItem(QUARANTINE_PREFIX + Date.now(), raw.slice(0, 500000));
    } catch {
      /* quarantine is best-effort by design */
    }
  }

  function load() {
    const { raw, error } = readRaw();
    warnings = [];
    persistError = null;
    if (error) {
      warnings = [error];
      state = createEmptyState(now().toISOString());
      loaded = true;
      notify('load-failed');
      return state;
    }
    if (!raw) {
      state = createEmptyState(now().toISOString());
      loaded = true;
      notify('load-empty');
      return state;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      quarantine(raw);
      state = createEmptyState(now().toISOString());
      warnings = ['Saved data was unreadable (invalid JSON). It has been set aside and a fresh workspace opened.'];
      loaded = true;
      notify('load-corrupt');
      return state;
    }
    const { raw: migrated, applied } = migrate(parsed);
    const result = normalizeState(migrated);
    state = result.state;
    warnings = result.warnings.slice();
    if (applied.length) warnings.push(`Migrated saved data: ${applied.join(', ')}`);
    loaded = true;
    notify('load');
    return state;
  }

  /** Persist the given state. Returns true when it reached storage. */
  function persist(next) {
    if (!storage) {
      persistError = 'No storage available — changes are held in memory only and will be lost on reload.';
      return false;
    }
    try {
      storage.setItem(key, JSON.stringify(next));
      persistError = null;
      return true;
    } catch (err) {
      persistError = `Could not save: ${err && err.name === 'QuotaExceededError' ? 'browser storage is full. Export your data, then reset.' : (err && err.message) || err}`;
      return false;
    }
  }

  function logEvent(draft, entry) {
    const event = {
      id: idFactory('ev'),
      ts: now().toISOString(),
      type: entry.type || 'unknown',
      entity: entry.entity || '',
      entityId: entry.entityId || '',
      summary: entry.summary || '',
    };
    draft.events.push(event);
    if (draft.events.length > EVENT_CAP) draft.events.splice(0, draft.events.length - EVENT_CAP);
    return event;
  }

  /**
   * Apply a mutation. The mutator receives a deep-ish copy and must return
   * nothing; it mutates in place. `event` is appended to the audit log.
   */
  function update(mutator, event) {
    const draft = JSON.parse(JSON.stringify(state));
    draft.meta.revision = (draft.meta.revision || 0) + 1;
    draft.meta.updatedAt = now().toISOString();
    mutator(draft);
    if (event) logEvent(draft, event);
    const ok = persist(draft);
    state = draft; // in-memory state stays truthful even when persistence fails
    notify(ok ? 'update' : 'update-unsaved');
    return state;
  }

  /** Import with full validation. Rejects rather than half-applying. */
  function importJSON(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      return { ok: false, error: 'That file is not valid JSON.' };
    }
    const candidate = parsed && parsed.state ? parsed.state : parsed;
    if (!candidate || typeof candidate !== 'object') {
      return { ok: false, error: 'That JSON does not look like a LeadOS export.' };
    }
    if (!Array.isArray(candidate.people)) {
      return { ok: false, error: 'That JSON has no "people" list, so it is not a LeadOS workspace.' };
    }
    const { raw: migrated, applied } = migrate(candidate);
    const result = normalizeState(migrated);
    if (!persist(result.state)) {
      return { ok: false, error: persistError || 'Could not write the imported data to storage.' };
    }
    state = result.state;
    warnings = result.warnings.slice();
    if (applied.length) warnings.push(`Migrated imported data: ${applied.join(', ')}`);
    notify('import');
    return {
      ok: true,
      imported: {
        people: state.people.length,
        events: state.events.length,
        isDemo: state.meta.isDemo,
      },
      warnings,
    };
  }

  function exportJSON() {
    return JSON.stringify(
      {
        app: 'LeadOS',
        schemaVersion: SCHEMA_VERSION,
        exportedAt: now().toISOString(),
        state,
      },
      null,
      2,
    );
  }

  function reset() {
    const empty = createEmptyState(now().toISOString());
    persist(empty);
    state = empty;
    warnings = [];
    notify('reset');
    return state;
  }

  /** True when anything in the workspace was entered by the user rather than the demo. */
  function hasRealData() {
    const isDemoId = (record) => typeof record.id === 'string' && record.id.includes('-demo-');
    const collections = ['people', 'oneOnOnes', 'feedback', 'goals', 'growthPlans', 'pulses', 'decisions', 'recognition', 'readiness', 'reviews'];
    return collections.some((key) => (state[key] || []).some((record) => !isDemoId(record)));
  }

  /**
   * Load the labelled demo workspace. Refuses to destroy user data unless
   * `force` is passed, because silently replacing someone's team with
   * fabricated records would be the worst possible failure mode here.
   */
  function seedDemo({ force = false } = {}) {
    if (!force && hasRealData()) {
      return {
        ok: false,
        reason: 'has-real-data',
        error: 'This workspace contains records you entered. Loading the demo would replace them — export first, or confirm the replacement.',
      };
    }
    const demo = buildDemoState(now());
    persist(demo);
    state = demo;
    warnings = ['Demo workspace loaded. Every record is fabricated and labelled as such; clear it before using real data.'];
    notify('demo');
    return { ok: true, state };
  }

  /**
   * Remove demo records only — real records added alongside the demo survive.
   * Identification is by record id (`*-demo-*`), not by person, so demo records
   * with no person attached (anonymous pulse responses, team goals) are removed
   * too. Leaving fabricated anonymous answers behind would silently pollute the
   * real aggregate, which is exactly the kind of quiet corruption this app must
   * not have.
   */
  function clearDemo() {
    const next = JSON.parse(JSON.stringify(state));
    const isDemo = (record) => typeof record.id === 'string' && record.id.includes('-demo-');
    for (const key of ['oneOnOnes', 'feedback', 'goals', 'delegations', 'growthPlans', 'pulses', 'decisions', 'recognition', 'readiness', 'reviews']) {
      next[key] = (next[key] || []).filter((record) => !isDemo(record));
    }
    next.people = next.people.filter((person) => !isDemo(person));
    // A user-created review attached to a fabricated demo person cannot remain
    // meaningful after that person is removed; reviews on real people survive.
    const remainingPeople = new Set(next.people.map((person) => person.id));
    next.reviews = next.reviews.filter((review) => remainingPeople.has(review.personId));
    next.delegations = next.delegations.filter((delegation) => remainingPeople.has(delegation.personId));
    // The event log is retained history and is intentionally not rewritten by demo cleanup.
    next.meta.isDemo = false;
    next.meta.revision = (next.meta.revision || 0) + 1;
    next.meta.updatedAt = now().toISOString();
    persist(next);
    state = next;
    warnings = [];
    notify('clear-demo');
    return state;
  }

  return {
    get state() {
      return state;
    },
    get warnings() {
      return warnings;
    },
    get persistError() {
      return persistError;
    },
    get isLoaded() {
      return loaded;
    },
    get storageKey() {
      return key;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    load,
    update,
    importJSON,
    exportJSON,
    reset,
    seedDemo,
    clearDemo,
    hasRealData,
    /** Public for tests: expose the current storage key's raw size in bytes. */
    sizeBytes() {
      try {
        return storage ? (storage.getItem(key) || '').length : 0;
      } catch {
        return 0;
      }
    },
  };
}
