/**
 * app/core/domain/eventArchiveRegistry.js — the bounded event-retention policy
 * and archive artifact contract (ADR-0205).
 *
 * Event archives are explicit encrypted files held outside the workspace. No
 * copy of the event payload is kept in local state, IndexedDB or an unbounded
 * shadow ledger. The live-log cap is deliberately shared with store.js so its
 * operational behavior and the archive warning cannot drift apart.
 */

export const EVENT_ARCHIVE_FORMAT = 'leados.provenance-archive';
export const EVENT_ARCHIVE_VERSION = 1;
export const EVENT_ARCHIVE_EVENT_CAP = 600;

export const EVENT_ARCHIVE_LIMITS = Object.freeze({
  /** Warn while there is still room to preserve a closed period. */
  warnAt: 480,
  /** Hard bounds on work and memory spent validating an external file. */
  maxFileChars: 8_000_000,
  maxBlocks: 5_000,
  maxEvents: 10_000,
  maxWindowDays: 3_650,
  maxRetentionDays: 3_650,
  purposeMin: 10,
  purposeMax: 600,
});

export const EVENT_ARCHIVE_PROOF_DOMAIN = 'leados-provenance-archive-v1';

export const EVENT_ARCHIVE_VERDICTS = Object.freeze([
  'verified',
  'expired',
  'key-required',
  'refused',
]);
