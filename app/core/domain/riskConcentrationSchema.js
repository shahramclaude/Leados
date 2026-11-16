/**
 * app/core/domain/riskConcentrationSchema.js — the persistence vocabulary for
 * the shared-dependency concentration rule (ADR-0226, Schema v181 unchanged).
 *
 * FAIL-CLOSED BY CONSTRUCTION. One boolean convention, carried in the
 * workspace's settings so `updateSettings` can move it and it survives reload:
 * `riskConcentrationAutoPropagate`. The core `normalizeSettings` in
 * `app/core/schema.js` names the same key, so a switch flipped off is not
 * silently resurrected on the next load, and a switch flipped on is not
 * silently dropped.
 */

import { RC_DEFAULTS, RC_SETTING_KEYS } from './riskConcentrationRegistry.js';

export function normalizeRiskConcentrationSettings(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const autoPropagate = source[RC_SETTING_KEYS.autoPropagate] === undefined
    ? RC_DEFAULTS.autoPropagate
    : Boolean(source[RC_SETTING_KEYS.autoPropagate]);
  return {
    [RC_SETTING_KEYS.autoPropagate]: autoPropagate,
  };
}
