/** Whole-flow rehearsal using the exact live transaction in disposable storage. */
import { createApi } from '../actions.js';
import { COLLECTIONS } from '../core/schema.js';
import { createStore, STORAGE_KEY } from '../core/store.js';
import { prepareCapturePlan, transactMissionCapture } from '../core/domain/missionCapture.js';

export function rehearseMissionCapture(state, captureId, { now = new Date() } = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return { ok: false, error: 'A valid rehearsal clock is required.' };
  const capture = (state.missionCaptures || []).find((c) => c.id === captureId);
  if (!capture || !['draft', 'rehearsed'].includes(capture.status)) return { ok: false, error: 'Choose an open capture.' };
  if (JSON.stringify(state).length > 8_000_000) return { ok: false, error: 'This workspace exceeds the 8 MB rehearsal safety bound.' };
  const plan = prepareCapturePlan(state, capture, now);
  if (!plan.ok) return plan;
  const data = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  const occupied = new Set(COLLECTIONS.flatMap((key) => (state[key] || []).map((r) => r.id)));
  let seq = 0;
  const idFactory = (prefix) => { let value; do { value = `${prefix}-capture-sim-${++seq}`; } while (occupied.has(value)); occupied.add(value); return value; };
  try {
    const store = createStore({ storage, now: () => now, idFactory }); store.load();
    if (store.persistError || store.warnings.length) return { ok: false, error: 'The workspace needs migration or repair review before rehearsal.' };
    const result = transactMissionCapture(store, captureId, { expectedRevision: state.meta.revision, reviewed: true, simulation: true }, { now, idFactory, createApi });
    if (!result.ok) return result;
    return { ok: true, captureId, baseRevision: state.meta.revision, evaluatedAt: now.toISOString(),
      inputFingerprint: plan.inputFingerprint, sourceFingerprint: plan.sourceFingerprint, planFingerprint: plan.fingerprint,
      commands: plan.commands, preview: result.preview };
  } catch (error) { return { ok: false, error: error?.message || 'Rehearsal failed. No live record changed.' }; }
}
