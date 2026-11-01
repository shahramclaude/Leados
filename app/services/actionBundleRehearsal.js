/** Disposable production-command rehearsal. Never writes to browser storage. */
import { createStore, STORAGE_KEY } from '../core/store.js';
import { createApi } from '../actions.js';
import { COLLECTIONS } from '../core/schema.js';
import { validateBundleCommands, BUNDLE_LIMITS } from '../core/domain/actionBundleRegistry.js';
import { transactBundle, bundleInputFingerprint, bundleSourceFingerprint } from '../core/domain/actionBundles.js';

export function rehearseActionBundle(state, bundleId, { now = new Date() } = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return { ok: false, error: 'A valid rehearsal clock is required.' };
  const bundle = (state.actionBundles || []).find((b) => b.id === bundleId);
  if (!bundle || !['draft', 'rehearsed'].includes(bundle.status)) return { ok: false, error: 'Choose an open action bundle.' };
  if (JSON.stringify(state).length > BUNDLE_LIMITS.bytes) return { ok: false, error: 'This workspace exceeds the 8 MB rehearsal safety bound. Export a backup and use a smaller operational copy.' };
  const valid = validateBundleCommands(bundle.commands, state, now);
  if (!valid.ok) return valid;
  const data = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  const occupied = new Set(COLLECTIONS.flatMap((k) => (state[k] || []).map((r) => r.id)));
  let seq = 0;
  const idFactory = (prefix) => { let idValue; do { idValue = `${prefix}-bundle-sim-${++seq}`; } while (occupied.has(idValue)); occupied.add(idValue); return idValue; };
  try {
    const store = createStore({ storage, now: () => now, idFactory }); store.load();
    if (store.persistError || store.warnings.length) return { ok: false, error: 'Workspace needs repair or migration review before rehearsal.' };
    const result = transactBundle(store, store.state.actionBundles.find((b) => b.id === bundleId), { now, idFactory, createApi });
    if (!result.ok) return result;
    return { ok: true, bundleId, baseRevision: state.meta.revision, evaluatedAt: now.toISOString(),
      inputFingerprint: bundleInputFingerprint(bundle), sourceFingerprint: bundleSourceFingerprint(state, bundle), preview: result.bundle.actual };
  } catch (error) { return { ok: false, error: error?.message || 'Rehearsal failed. No live records changed.' }; }
}