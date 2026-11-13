/**
 * app/core/domain/interfaceAlignmentSchema.js — fail-closed convention
 * normalizer and deterministic finding-signature / ask-summary helpers for the
 * Product–Organisation Interface Alignment Matrix (ADR-0189, RULE-OIA-01,
 * Schema v149 unchanged).
 *
 * ZERO-SCHEMA-BUMP STORAGE CONTRACT
 * ---------------------------------
 * No derived pair row, channel state or roll-up is ever stored. Rule-issued
 * asks live in `delegations` with typed `issues-obligation` + matrix-DAG
 * `rolls-up-to` provenance in `links`, and identity-free observations live in
 * `matrixMarkers` (`kind: 'interface-alignment'`). Three bounded conventions
 * live in `settings` and survive every reload through `normalizeSettings`.
 */

import {
  INTERFACE_ALIGNMENT_BOUNDS,
  INTERFACE_ALIGNMENT_DEFAULTS,
  INTERFACE_ALIGNMENT_RULE_ID,
  INTERFACE_ALIGNMENT_SETTING_KEYS,
} from './interfaceAlignmentRegistry.js';

const isPlainObject = (v) => Boolean(v && typeof v === 'object' && !Array.isArray(v));

function boundedInt(value, [min, max], fallback) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

/** The declared conventions, resolved from settings. The loader clamps; the setter refuses. */
export function normalizeInterfaceAlignmentSettings(raw = {}) {
  const src = isPlainObject(raw) ? raw : {};
  const K = INTERFACE_ALIGNMENT_SETTING_KEYS;
  return {
    [K.windowDays]: boundedInt(
      src[K.windowDays],
      INTERFACE_ALIGNMENT_BOUNDS.windowDays,
      INTERFACE_ALIGNMENT_DEFAULTS.windowDays,
    ),
    [K.askDueDays]: boundedInt(
      src[K.askDueDays],
      INTERFACE_ALIGNMENT_BOUNDS.askDueDays,
      INTERFACE_ALIGNMENT_DEFAULTS.askDueDays,
    ),
    [K.autoPropagate]: src[K.autoPropagate] !== false,
  };
}

export const INTERFACE_ALIGNMENT_DEFAULTS_RESOLVED = Object.freeze(normalizeInterfaceAlignmentSettings({}));

/**
 * Deterministic, identity-free 64-bit FNV-1a fingerprint over a pair key and a
 * finding kind (`ifa1:<finding>:<16-hex>`). Fixed length so a pair key never
 * appears in a link summary or marker key; the hash is not reversible to the
 * two manager ids it was built from.
 */
export function interfaceAlignmentSignature(pairKey, finding) {
  const key = String(pairKey || '').trim();
  const kind = String(finding || '').trim();
  const joined = `${kind}\n${key}`;
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
  return `ifa1:${kind}:${hex1}${hex2}`;
}

export const INTERFACE_ALIGNMENT_ASK_SUMMARY_PREFIX = 'Interface-alignment finding: ';
export const INTERFACE_ALIGNMENT_CLOSED_PREFIX = `Closed by ${INTERFACE_ALIGNMENT_RULE_ID}:`;

export function interfaceAlignmentAskSummary(signature) {
  return `${INTERFACE_ALIGNMENT_ASK_SUMMARY_PREFIX}${String(signature || '').trim()}`;
}

export function parseInterfaceAlignmentAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const trimmed = summary.trim();
  if (!trimmed.startsWith(INTERFACE_ALIGNMENT_ASK_SUMMARY_PREFIX)) return null;
  const sig = trimmed.slice(INTERFACE_ALIGNMENT_ASK_SUMMARY_PREFIX.length).trim();
  return /^ifa1:[a-z-]+:[0-9a-f]{16}$/.test(sig) ? { signature: sig } : null;
}
