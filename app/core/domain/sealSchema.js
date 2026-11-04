/**
 * app/core/domain/sealSchema.js — settings normalization for the Sealed Spine
 * (ADR-0081). Backward compatible by construction: every key defaults when
 * absent, so no schema-version bump and no migration are needed — exactly
 * like the Operating Seat's declaration settings (ADR-0076, schema v82).
 */

import { SEAL_DEFAULTS, SEAL_MODES } from './sealRegistry.js';

/**
 * Normalize the seal settings block. Returns only seal keys; schema.js spreads
 * this into normalizeSettings like every other module's settings normalizer.
 */
export function normalizeSealSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    sealEnabled: s.sealEnabled === true,
    sealAutoPropagate: s.sealAutoPropagate !== false,
    sealMode: SEAL_MODES.includes(s.sealMode) ? s.sealMode : SEAL_DEFAULTS.sealMode,
  };
}
