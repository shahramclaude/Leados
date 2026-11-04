/**
 * app/core/domain/sealRegistry.js — constants for the Sealed Spine
 * (ADR-0082, Session 122).
 *
 * The Sealed Spine turns the existing append-only event log into a
 * hash-chained, tamper-evident audit trail. One `audit.seal` event is appended
 * per sealed transaction; each seal commits to (previous seal, digest of the
 * events appended in that transaction, revision). Verification replays the
 * chain from genesis and reports the first break, distinguishing a CONTENT
 * tamper (a sealed block's events no longer match its recorded digest) from a
 * CHAIN break (a seal does not follow from its predecessor). In HMAC mode
 * (vault unlocked) the chain cannot be forged without the passphrase-derived
 * key; in plain-hash mode it is tamper-evident against corruption and honest
 * mistakes only — the app says which mode it is in, everywhere.
 */

export const SEAL_ENGINE_VERSION = 'seal-2026.11-v1';

export const SEAL_RULE_IDS = Object.freeze({
  SEAL: 'RULE-SEAL-01',
  VERIFY: 'RULE-SEAL-02',
});

export const SEAL_EVENTS = Object.freeze({
  SEAL: 'audit.seal',
  VERIFIED: 'seal.verified',
  ENABLED: 'seal.enabled',
  DISABLED: 'seal.disabled',
  SCAN: 'seal.scan',
});

/** Event types that always trigger a seal, even when automatic sealing is off. */
export const SEAL_TRIGGER_PREFIX = 'seal.';

/** Genesis value of the chain: 64 zero hex chars. */
export const SEAL_GENESIS = '0'.repeat(64);

export const SEAL_MODES = Object.freeze(['auto', 'hash']);

export const SEAL_LIMITS = Object.freeze({
  /** Seal events are exempt from the event-log cap but carry their own. */
  sealEventCap: 5000,
  /** Rows shown in the span attestation table. */
  spanRowCap: 40,
  /** Recent blocks listed in the chain panel. */
  blockListCap: 25,
  /** Max events digested in one transaction (sanity bound). */
  txEventCap: 512,
});

export const SEAL_DEFAULTS = Object.freeze({
  sealEnabled: false,
  sealAutoPropagate: true,
  sealMode: 'auto',
});

export const SEAL_PREMISE = 'A log you cannot verify is a log you have to trust. The Sealed Spine makes the append-only event log recomputable from genesis on demand, seals every transaction across every module in the same atomic write, and rolls the attestations up the chain of command in the form each altitude is allowed to see — and it prints, in every surface, whether the chain is keyed (HMAC, forgery-proof while locked) or plain (integrity against corruption only).';
