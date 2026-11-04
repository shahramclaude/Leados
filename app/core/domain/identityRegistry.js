/**
 * app/core/domain/identityRegistry.js — constants for the Attested Commit
 * (Schema v95, ADR-0089, Session 129).
 *
 * The Sealed Spine (ADR-0082) proved the event log has not been altered. It
 * could not say WHO altered it: every seat on the workspace was a declared
 * label, and every recent ADR printed that limit. The Attested Commit binds
 * each transaction to a seat CREDENTIAL: a passphrase-derived HMAC key that
 * exists only in memory while the seat session is unlocked, exactly like the
 * vault's seal key. Each operational commit under an unlocked session appends
 * one `identity.attested` event whose entityId is
 *
 *   MAC = HMAC-SHA256(seatKey, "leados-seat-attest-v1|seat|keyId|rev|digest")
 *
 * over the digest of everything the transaction appended before it — and the
 * seal (running last) covers the attestation itself. The two layers compose:
 * the seal proves the log is intact; the attestation proves which credential
 * wrote each block of it.
 *
 * This is the second rung of an explicit assurance ladder (see ADR-0089):
 *   rung 1  hash chain (ADR-0082)         — detects edits, reorders, deletes;
 *   rung 2  per-seat HMAC attestation     — defeats whole-log re-hash forgery
 *           (this module)                    without the seat passphrase;
 *   rung 3  signed checkpoint export      — detects tail truncation against a
 *                                           document kept OUTSIDE the workspace;
 *   rung 4  asymmetric auditor signature  — REJECTED for now: without a PKI or
 *                                           second party, a local keypair adds
 *                                           ceremony, not proof;
 *   rung 5  external trusted timestamp    — REJECTED for now: requires network,
 *                                           contradicting the local-first rule.
 *
 * Honest scope: a MAC is symmetric. The verifier (stored per seat) cannot
 * compute new MACs without the passphrase, so a workspace editor without the
 * credential cannot forge authorship — but this is tamper-evident authorship,
 * not third-party non-repudiation, and it never leaves this device.
 */

export const IDENTITY_ENGINE_VERSION = 'attested-commit-2026.11-v1';

/** Domain separators. Fixed labels so identity key material can never collide
 * with the vault AES key or the seal key, and MAC inputs can never collide
 * with another protocol's. */
export const IDENTITY_KEY_DOMAIN = 'leados-seat-v1';
export const IDENTITY_VERIFY_DOMAIN = 'leados-seat-verify-v1';
export const IDENTITY_KEYID_DOMAIN = 'leados-seat-keyid-v1';
export const IDENTITY_ATTEST_DOMAIN = 'leados-seat-attest-v1';
export const IDENTITY_CHECKPOINT_DOMAIN = 'leados-checkpoint-v1';

export const IDENTITY_RULE_IDS = Object.freeze({
  ATTEST: 'RULE-IDN-01',
  UNATTRIBUTED: 'RULE-IDN-02',
  VERIFY: 'RULE-IDN-03',
});

export const IDENTITY_EVENTS = Object.freeze({
  ENROLL: 'identity.enroll',
  ROTATE: 'identity.rotate',
  REVOKE: 'identity.revoke',
  UNLOCK: 'identity.unlock',
  UNLOCK_FAILED: 'identity.unlock_failed',
  LOCK: 'identity.lock',
  ATTESTED: 'identity.attested',
  SCAN: 'identity.scan',
  VERIFIED: 'identity.verified',
  CHECKPOINT: 'identity.checkpoint',
  SETTINGS: 'identity.settings',
});

/** Event types that always run the identity pass (scan, session lifecycle). */
export const IDENTITY_TRIGGER_PREFIX = 'identity.';

/** Boundary-maintenance commands are never "unattributed work": they manage
 * the identity layer itself (enroll/unlock/lock/rotate/revoke, settings,
 * verify, checkpoint). RULE-IDN-02 must not flag them. They are still
 * attested whenever a session is active — the first act under a credential is
 * signed by it. */
export const IDENTITY_SESSION_EVENTS = Object.freeze(new Set([
  IDENTITY_EVENTS.ENROLL, IDENTITY_EVENTS.ROTATE, IDENTITY_EVENTS.REVOKE,
  IDENTITY_EVENTS.UNLOCK, IDENTITY_EVENTS.UNLOCK_FAILED, IDENTITY_EVENTS.LOCK,
  IDENTITY_EVENTS.SETTINGS, IDENTITY_EVENTS.SCAN, IDENTITY_EVENTS.CHECKPOINT,
]));

export const IDENTITY_LIMITS = Object.freeze({
  /** Attestation events are exempt from the general event-log cap (like
   * `audit.seal`) but carry their own: authorship anchors are the last thing
   * a full log may evict. */
  attestEventCap: 5000,
  /** Recent attested blocks listed in the ledger panel. */
  blockListCap: 25,
  /** Max events digested in one transaction (sanity bound, mirrors the seal). */
  txEventCap: 512,
  /** Idempotency marker cap. */
  markerCap: 400,
  /** Rows shown in the span posture table. */
  spanRowCap: 40,
  /** Enrollment rows (one per seat; the workspace has few seats by design). */
  enrollmentCap: 40,
  /** Failed unlock attempts per seat per window before the cooldown refusal. */
  unlockAttemptCap: 5,
  unlockWindowMins: 10,
  /** Max characters of checkpoint certificate we will build. */
  checkpointMaxChars: 12000,
});

export const IDENTITY_DEFAULTS = Object.freeze({
  /** Opt-in, exactly like the seal: workspaces that never enable identity see
   * byte-for-byte the same transactions they saw before. */
  identityEnabled: false,
  /** Pausable automation is only the breach work (RULE-IDN-02). The
   * attestation pass itself is NOT pausable — pausing attestation while
   * claiming enforcement would be a lie. */
  identityAutoPropagate: true,
  /** Enforcement: gateway refuses unattested writes under a declared seat and
   * RULE-IDN-02 opens governed work for anything that slips past it. */
  identityEnforced: false,
  /** Idle minutes before an unlocked seat session expires (1–480). */
  identityIdleMins: 30,
});

export const IDENTITY_SIGNAL_IDS = Object.freeze(['IDN-01', 'IDN-02', 'IDN-03']);

export const IDENTITY_PREMISE = 'A seal proves the record was not altered; it cannot say who altered it. The Attested Commit binds every transaction to a passphrase-derived seat credential held only in memory, so authorship is recomputable on demand — and where it is not, the workspace says “unverifiable” instead of “verified”. An access control that cannot explain its own refusal is broken; an audit trail that cannot name its own author is incomplete.';
