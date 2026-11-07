/**
 * app/services/portfolioComparisonRehearsal.js — the two-sided disposable
 * rehearsal behind `#/compare` (ADR-0118).
 *
 * Both reviewed bundles are replayed through the SAME production transaction
 * code (`rehearseActionBundle` → `transactBundle`), from ONE frozen snapshot, at
 * ONE clock. That is the only way two footprints are comparable: two previews
 * saved on different days describe two different workspaces, and this module
 * refuses to place them side by side as if they did not.
 *
 * Never writes to browser storage, never sends a message, never spends money.
 */
import { dayKey } from '../core/time.js';
import { rehearseActionBundle } from './actionBundleRehearsal.js';
import { buildComparisonReceipt, comparisonSide, comparisonReceiptFingerprint } from '../core/domain/portfolioComparison.js';
import { bundleInputFingerprint, bundleSourceFingerprint } from '../core/domain/actionBundles.js';

const OPEN = new Set(['draft', 'rehearsed']);

export function rehearsePortfolioComparison(state, bundleAId, bundleBId, { now = new Date(), seatId = null, rank = null } = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    return { ok: false, error: 'A valid rehearsal clock is required.' };
  }
  if (!bundleAId || !bundleBId) return { ok: false, error: 'Choose two reviewed responses to compare.' };
  if (bundleAId === bundleBId) return { ok: false, error: 'A response cannot be compared with itself. Choose two different reviewed responses.' };
  const bundles = new Map((state.actionBundles || []).map((b) => [b.id, b]));
  for (const [label, id] of [['A', bundleAId], ['B', bundleBId]]) {
    const bundle = bundles.get(id);
    if (!bundle || !Array.isArray(bundle.commands) || !bundle.commands.length) {
      return { ok: false, error: `Response ${label} is not an open reviewed action bundle.` };
    }
    if (!OPEN.has(bundle.status)) return { ok: false, error: `Response ${label} has already been adopted, withdrawn or archived; a comparison is between open responses.` };
  }

  const left = rehearseActionBundle(state, bundleAId, { now });
  if (!left.ok) return { ok: false, error: `Response A could not be rehearsed: ${left.error}` };
  const right = rehearseActionBundle(state, bundleBId, { now });
  if (!right.ok) return { ok: false, error: `Response B could not be rehearsed: ${right.error}` };

  const revision = state.meta?.revision ?? 0;
  if (left.baseRevision !== right.baseRevision || left.baseRevision !== revision) {
    return { ok: false, error: 'The two rehearsals did not run from the same workspace revision, so their footprints are not comparable. Nothing was recorded.' };
  }
  if (left.preview?.failureCount || right.preview?.failureCount) {
    return { ok: false, error: 'At least one response rehearsal reported rule failures. An incomplete footprint cannot be compared; repair the plan and rehearse again.' };
  }

  // Fingerprints are computed from the bundle as it stands NOW, not from a saved
  // preview: a receipt must be bound to the exact transaction it replayed, and a
  // draft bundle has no stored fingerprint to trust.
  const sides = [bundleAId, bundleBId].map((id, index) => {
    const bundle = bundles.get(id);
    const side = comparisonSide(state, bundle, index === 0 ? left.preview : right.preview);
    side.inputFingerprint = bundleInputFingerprint(bundle);
    side.sourceFingerprint = bundleSourceFingerprint(state, bundle);
    return side;
  });
  const receipt = buildComparisonReceipt(state, sides, { now, seatId, rank });
  receipt.fingerprint = comparisonReceiptFingerprint(receipt);
  return {
    ok: true,
    bundleAId,
    bundleBId,
    baseRevision: receipt.baseRevision,
    evaluatedOn: receipt.evaluatedOn ?? dayKey(now),
    evaluatedAt: receipt.evaluatedAt,
    receipt,
    sides: receipt.sides,
    overlap: receipt.overlap,
    dominance: receipt.dominance,
    assumptions: receipt.assumptions,
    scope: receipt.scope,
  };
}
