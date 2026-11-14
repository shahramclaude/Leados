/**
 * app/core/storeOptimizations.js — store write coalescing & memoization helpers.
 *
 * Two efficiency wins for the persistence layer:
 *
 *  1. Write coalescing: rapid successive store updates (e.g. a user bulk-editing
 *     5 people) currently JSON.stringify the entire workspace 5 times and hit
 *     localStorage 5 times synchronously. Coalescing batches them into one
 *     persist within a microtask, preserving atomicity (all 5 mutations are
 *     visible) while cutting I/O by N×.
 *
 *  2. Memoized derived reads: the disclosure compiler and insights builders
 *     re-derive on every render even when the underlying state slice is
 *     unchanged. These helpers memoize by revision + dayKey.
 *
 * Both are opt-in via the store; existing code paths are untouched.
 */

import { dayKey } from './time.js';

/**
 * Create a coalescing wrapper around a persist function.
 *
 * Usage:
 *   const coalesced = createCoalescedPersist((state) => persist(state));
 *   coalesced.schedule(nextState); // may batch
 *   coalesced.flush(); // force immediate write
 */
export function createCoalescedPersist(persistFn, { delayMs = 0 } = {}) {
  let pending = null;
  let timer = null;
  let flushCallbacks = [];

  function doFlush() {
    if (pending === null) return false;
    const state = pending;
    pending = null;
    if (timer) { clearTimeout(timer); timer = null; }
    const ok = persistFn(state);
    const cbs = flushCallbacks;
    flushCallbacks = [];
    for (const cb of cbs) try { cb(ok); } catch {}
    return ok;
  }

  return {
    schedule(state) {
      pending = state;
      if (delayMs === 0) {
        // Microtask coalescing: multiple schedules within one tick → one flush.
        if (!timer) {
          timer = true; // sentinel for "microtask scheduled"
          queueMicrotask(() => {
            timer = null;
            doFlush();
          });
        }
        return true;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(doFlush, delayMs);
      return true;
    },
    flush() {
      return doFlush();
    },
    get pending() { return pending; },
    cancel() {
      pending = null;
      if (timer && timer !== true) clearTimeout(timer);
      timer = null;
      flushCallbacks = [];
    },
    onFlush(cb) { flushCallbacks.push(cb); },
  };
}

/**
 * Generic revision-aware memoizer for any pure derived read.
 *
 * The cache key is (state.meta.revision, dayKey(now)). A new revision or a
 * new calendar day invalidates; otherwise the previous result is returned
 * by reference (safe because callers treat it as read-only).
 */
export function createRevisionMemo(build) {
  if (typeof build !== 'function') throw new TypeError('build function required');
  let lastRevision = null;
  let lastDay = null;
  let lastResult = null;

  function get(state, now = new Date()) {
    const rev = state?.meta?.revision ?? null;
    const day = dayKey(now);
    if (rev === lastRevision && day === lastDay && lastResult !== null) {
      return lastResult;
    }
    lastRevision = rev;
    lastDay = day;
    lastResult = build(state, now);
    return lastResult;
  }

  get.clear = () => { lastRevision = null; lastDay = null; lastResult = null; };
  get.stats = () => ({ cached: lastResult !== null, revision: lastRevision, day: lastDay });
  return get;
}

/**
 * Shallow dirty check for collections: returns true when any collection
 * reference changed (which the store guarantees on mutation). This lets
 * derived readers skip deep comparison.
 */
export function isStateDirty(prev, next) {
  if (prev === next) return false;
  if (!prev || !next) return true;
  if (prev.meta?.revision !== next.meta?.revision) return true;
  return false;
}

/**
 * Estimate serialized size without actually serializing.
 * Useful for deciding whether to warn about quota.
 */
export function estimateStateSize(state) {
  // Heuristic: sum of JSON lengths of top-level collections, sampled.
  let size = 0;
  for (const key of Object.keys(state)) {
    const val = state[key];
    if (Array.isArray(val)) {
      // Sample first 3 items to estimate per-item cost, then extrapolate.
      if (val.length === 0) continue;
      const sample = val.slice(0, 3);
      let sampleSize = 0;
      for (const item of sample) {
        try { sampleSize += JSON.stringify(item).length; } catch { sampleSize += 500; }
      }
      const avg = sampleSize / sample.length;
      size += avg * val.length + 100; // + overhead for array wrapper
    } else if (val && typeof val === 'object') {
      try { size += JSON.stringify(val).length; } catch { size += 1000; }
    }
  }
  return Math.round(size);
}

/**
 * Storage quota guard: checks whether persisting would likely exceed
 * localStorage quota (typically 5-10 MB). Returns a warning string or null.
 */
export function quotaWarningFor(state, quotaBytes = 5 * 1024 * 1024) {
  const est = estimateStateSize(state);
  if (est > quotaBytes * 0.9) return `Workspace is ${Math.round(est / 1024)} KB — approaching browser storage limits. Export a backup.`;
  if (est > quotaBytes * 0.75) return `Workspace is ${Math.round(est / 1024)} KB. Consider archiving old records.`;
  return null;
}
