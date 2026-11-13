/**
 * app/core/domain/dependencyCycleSchema.js — fail-closed convention normalizer
 * and deterministic cycle-signature / ask-summary helpers for the Cross-Boundary
 * Dependency Feedback-Cycle Register & Escalation Rule (ADR-0183 / ADR-0187,
 * Schema v148 unchanged).
 *
 * ZERO-SCHEMA-BUMP STORAGE CONTRACT
 * ---------------------------------
 * Like ADR-0179 (`lineHorizonRules.js`), no derived partition, tear candidate or
 * block roll-up is ever stored. Rule-issued asks live in `delegations` with
 * typed `issues-obligation` + matrix-DAG `rolls-up-to` provenance in `links`,
 * and identity-free observations live in `matrixMarkers` (`kind: 'dependency-cycle'`).
 * Two bounded conventions live in `settings` and survive every reload through
 * `normalizeSettings`.
 */

import {
  DEPENDENCY_CYCLE_BOUNDS,
  DEPENDENCY_CYCLE_DEFAULTS,
  DEPENDENCY_CYCLE_RULE_ID,
  DEPENDENCY_CYCLE_SETTING_KEYS,
} from './dependencyCycleRegistry.js';

const isPlainObject = (v) => Boolean(v && typeof v === 'object' && !Array.isArray(v));

function boundedInt(value, [min, max], fallback) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

/** The declared conventions, resolved from settings. The loader clamps; the setter refuses. */
export function normalizeDependencyCycleSettings(raw = {}) {
  const src = isPlainObject(raw) ? raw : {};
  const K = DEPENDENCY_CYCLE_SETTING_KEYS;
  return {
    [K.askDueDays]: boundedInt(
      src[K.askDueDays],
      DEPENDENCY_CYCLE_BOUNDS.askDueDays,
      DEPENDENCY_CYCLE_DEFAULTS.askDueDays,
    ),
    [K.autoPropagate]: src[K.autoPropagate] !== false,
  };
}

export const DEPENDENCY_CYCLE_DEFAULTS_RESOLVED = Object.freeze(normalizeDependencyCycleSettings({}));

/**
 * Deterministic, identity-free 64-bit FNV-1a fingerprint over sorted member
 * keys (`cyc1:<size>:<16-hex>`). Fixed length so a 500-node cycle never
 * truncates in a link summary or marker key, and zero record ids or person
 * names appear in the signature itself.
 */
export function dependencyCycleSignature(memberKeys) {
  const list = Array.isArray(memberKeys)
    ? [...memberKeys].map((k) => String(k || '').trim()).filter(Boolean).sort()
    : [];
  const joined = list.join('\n');
  let h1 = 0x811c9dc5;
  let h2 = 0x050c5d1f;
  for (let i = 0; i < joined.length; i += 1) {
    const code = joined.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= (code ^ (i & 0xff));
    h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `cyc1:${list.length}:${hex1}${hex2}`;
}

export const DEPENDENCY_CYCLE_ASK_SUMMARY_PREFIX = 'Coupled dependency cycle ask: ';
export const DEPENDENCY_CYCLE_CLOSED_PREFIX = `Closed by ${DEPENDENCY_CYCLE_RULE_ID}:`;

export function dependencyCycleAskSummary(signature) {
  return `${DEPENDENCY_CYCLE_ASK_SUMMARY_PREFIX}${String(signature || '').trim()}`;
}

export function parseDependencyCycleAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const trimmed = summary.trim();
  if (!trimmed.startsWith(DEPENDENCY_CYCLE_ASK_SUMMARY_PREFIX)) return null;
  const sig = trimmed.slice(DEPENDENCY_CYCLE_ASK_SUMMARY_PREFIX.length).trim();
  return /^cyc1:\d+:[0-9a-f]{16}$/.test(sig) ? { signature: sig } : null;
}
