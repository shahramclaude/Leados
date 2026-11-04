/**
 * app/core/domain/identityActions.js — API mixin for the Attested Commit
 * (Schema v93, ADR-0087). Mounted via `Object.assign(api, ...)` exactly like
 * `createConcordanceActions`; no second command bus.
 *
 * The write path is deliberately small: enroll (or rotate) a seat credential,
 * unlock and lock the session, scan, checkpoint, compare a checkpoint, and
 * set the four conventions. Nothing here rates a person or touches anyone's
 * records — it manages the authorship boundary those records are written
 * under, and the post-commit rules do the cross-module work.
 *
 * Security posture, honestly:
 *   - The passphrase is used exactly twice: to derive the key (PBKDF2 via the
 *     vault's WebCrypto seam) and then it is dropped. The derived key lives in
 *     `identitySession.js` memory only and is cleared at every lock site.
 *   - Wrong passphrase: one `identity.unlock_failed` audit event, and unlock
 *     attempts are rate-limited per seat (5 per 10 minutes) so a curious
 *     colleague cannot grind guesses through the UI.
 *   - Under a declared seat you may only enroll/unlock YOUR OWN seat unless
 *     you are the undeclared operator (the workspace owner's view).
 */

import { KDF_ITERATIONS, newSalt, validatePassphrase } from '../crypto.js';
import { activeSeat, buildSeats } from './seat.js';
import { UNDECLARED_SEAT } from './seatRegistry.js';
import {
  IDENTITY_DEFAULTS, IDENTITY_EVENTS, IDENTITY_LIMITS,
} from './identityRegistry.js';
import {
  activeIdentitySession, clearIdentitySession, deriveSeatKeyBytes,
  registerIdentitySession, seatKeyId, seatKeyVerifier, timingSafeEqual,
  touchIdentitySession,
} from './identitySession.js';
import { normalizeIdentitySettings, normalizeSeatIdentities } from './identitySchema.js';
import {
  buildIdentityCheckpoint, identityAttentionCount, identityBriefText,
  identityCsvRows, identityReport, verifyAttestations, verifyIdentityCheckpoint,
} from './identity.js';

export function createIdentityActions(store, { now, cryptoRef = null } = {}) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date());
  const saved = (extra = {}) => ({
    ok: true,
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
  });
  const settings = () => store.state.settings || {};
  const enrollments = () => normalizeSeatIdentities(store.state.seatIdentities);
  const activeKeys = () => {
    const session = activeIdentitySession(clock().getTime());
    const keys = new Map();
    if (session) keys.set(session.seatId, session.key);
    return keys;
  };

  /** Gate: under a declared seat, only your own seat (operator = workspace owner). */
  function seatGate(seatId) {
    const built = buildSeats(store.state, { now: clock(), settings: settings() });
    const seat = activeSeat(built);
    if (seat.fullAccess) return null;
    if (!seatId || (seatId !== seat.id && !(seat.scope && seat.scope.has(seatId)))) {
      return fail('You may only manage the credential of your own operating seat. The workspace owner (operator view) may manage any seat.', 'seatId');
    }
    return null;
  }

  /** Unlock attempts: 5 per seat per 10 minutes, counted from the audit log. */
  function unlockThrottled(seatId) {
    const windowMs = IDENTITY_LIMITS.unlockWindowMins * 60 * 1000;
    const cutoff = clock().getTime() - windowMs;
    const failures = (Array.isArray(store.state.events) ? store.state.events : [])
      .filter((e) => e && e.type === IDENTITY_EVENTS.UNLOCK_FAILED
        && String(e.summary || '').includes(`seat=${seatId}`)
        && Date.parse(e.ts || '') >= cutoff);
    return failures.length >= IDENTITY_LIMITS.unlockAttemptCap;
  }

  async function deriveFor(row, passphrase) {
    return deriveSeatKeyBytes({
      passphrase,
      salt: row.salt,
      iterations: row.iterations,
      cryptoRef: cryptoRef || (typeof globalThis !== 'undefined' ? globalThis.crypto : null),
    });
  }

  /** Shared enroll/rotate implementation (rotate = enroll with a new
   * passphrase: new salt, new verifier, new fingerprint, same seat). */
  async function enrollOrRotate(input = {}) {
    const seatId = String(input.seatId || '');
    const gate = seatGate(seatId); if (gate) return gate;
    const check = validatePassphrase(input.passphrase);
    if (!check.ok) return fail(check.error, 'passphrase');
    const built = buildSeats(store.state, { now: clock(), settings: settings() });
    if (seatId !== UNDECLARED_SEAT && !built.byId.has(seatId)) return fail('Choose a seat that exists in this workspace.', 'seatId');
    const ref = cryptoRef || (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
    let salt;
    try {
      salt = newSalt(ref);
    } catch {
      return fail('This browser has no WebCrypto random source, so a credential cannot be created here. Attestation is unavailable rather than downgraded.');
    }
    const key = await deriveFor({ salt, iterations: KDF_ITERATIONS }, input.passphrase);
    if (!key) return fail('This browser has no WebCrypto key derivation, so attestation is unavailable here rather than silently downgraded.');
    const keyId = seatKeyId(key);
    const verifier = seatKeyVerifier(key, seatId);
    registerIdentitySession({
      seatId,
      keyBytes: key,
      keyId,
      expiresAt: clock().getTime() + (settings().identityIdleMins || IDENTITY_DEFAULTS.identityIdleMins) * 60 * 1000,
    });
    store.update((draft) => {
      const rows = Array.isArray(draft.seatIdentities) ? draft.seatIdentities : [];
      const existing = rows.findIndex((r) => r && r.seatId === seatId);
      const row = {
        seatId,
        keyId,
        salt,
        iterations: KDF_ITERATIONS,
        verifier,
        createdAt: clock().toISOString(),
        rotatedAt: existing >= 0 ? clock().toISOString() : null,
        revokedAt: null,
      };
      if (existing >= 0) rows[existing] = row;
      else rows.push(row);
      draft.seatIdentities = rows.slice(0, IDENTITY_LIMITS.enrollmentCap);
      draft.settings.identityEnabled = true;
    }, {
      type: IDENTITY_EVENTS.ENROLL,
      entity: 'seat',
      entityId: seatId,
      summary: `Seat credential enrolled for ${seatId} (key ${keyId}, PBKDF2 ${KDF_ITERATIONS} iterations); identity enabled and the session unlocked.`.slice(0, 300),
    });
    return saved({ seatId, keyId, enrolled: true, unlocked: true });
  }

  return {
    /** Pure aggregate read; never persists. */
    identityRead() {
      return { ok: true, report: identityReport(store.state, { now: clock(), settings: settings() }) };
    },

    /** Pure verification read; never persists (the scan writes; this reads). */
    identityVerify() {
      return { ok: true, verification: verifyAttestations(store.state, { keys: activeKeys(), now: clock() }) };
    },

    identityBriefText() {
      return { ok: true, text: identityBriefText(identityReport(store.state, { now: clock(), settings: settings() })) };
    },

    identityCsvRows() {
      return { ok: true, rows: identityCsvRows(store.state, { now: clock(), settings: settings() }) };
    },

    identityAttentionCount() {
      return identityAttentionCount(store.state, { now: clock(), settings: settings() });
    },

    /**
     * Enroll a seat credential and unlock it in the same breath (explicit
     * consent = setting the passphrase). The enrollment transaction is the
     * first attested commit of the new credential, and identity switches on
     * visibly in settings.
     */
    async identityEnroll(input = {}) {
      return enrollOrRotate(input);
    },

    /** Unlock an enrolled seat credential. Wrong passphrase fails closed. */
    async identityUnlock(input = {}) {
      const seatId = String(input.seatId || '');
      const gate = seatGate(seatId); if (gate) return gate;
      if (unlockThrottled(seatId)) {
        return fail(`Too many failed unlock attempts for this seat. Wait ${IDENTITY_LIMITS.unlockWindowMins} minutes and try again — the workspace will not grind guesses.`);
      }
      const row = enrollments().find((r) => r.seatId === seatId && !r.revokedAt);
      if (!row) return fail('No credential is enrolled for this seat yet. Enroll one first — the passphrase cannot be recovered, only replaced.', 'seatId');
      const key = await deriveFor(row, input.passphrase);
      if (!key) return fail('This browser has no WebCrypto key derivation, so attestation is unavailable here rather than silently downgraded.');
      const expected = seatKeyVerifier(key, seatId);
      if (!timingSafeEqual(expected, row.verifier)) {
        store.update(() => {}, {
          type: IDENTITY_EVENTS.UNLOCK_FAILED,
          entity: 'seat',
          entityId: seatId,
          summary: `seat=${seatId} — failed unlock attempt recorded (wrong passphrase).`.slice(0, 300),
        });
        return fail('That passphrase does not match this seat credential. Nothing was unlocked or changed.', 'passphrase');
      }
      const keyId = seatKeyId(key);
      registerIdentitySession({
        seatId,
        keyBytes: key,
        keyId,
        expiresAt: clock().getTime() + (settings().identityIdleMins || IDENTITY_DEFAULTS.identityIdleMins) * 60 * 1000,
      });
      store.update(() => {}, {
        type: IDENTITY_EVENTS.UNLOCK,
        entity: 'seat',
        entityId: seatId,
        summary: `seat=${seatId} key=${keyId} — seat credential session unlocked; commits are now attested until lock or idle expiry.`.slice(0, 300),
      });
      return saved({ seatId, keyId, unlocked: true });
    },

    /** Lock the session. Writes become unattested again — visibly. */
    identityLock() {
      const session = activeIdentitySession(clock().getTime());
      clearIdentitySession();
      store.update(() => {}, {
        type: IDENTITY_EVENTS.LOCK,
        entity: 'seat',
        entityId: session?.seatId || '',
        summary: session
          ? `seat=${session.seatId} — seat credential session locked; subsequent writes are unattested until unlock.`
          : 'No seat credential session was active.',
      });
      return saved({ locked: true });
    },

    /** Rotate a credential (new passphrase, new salt, new key fingerprint). */
    async identityRotate(input = {}) {
      return enrollOrRotate(input);
    },

    /** Revoke a credential. Operator, or the seat's own holder. */
    identityRevoke(input = {}) {
      const seatId = String(input.seatId || '');
      const gate = seatGate(seatId); if (gate) return gate;
      const row = enrollments().find((r) => r.seatId === seatId);
      if (!row) return fail('No credential is enrolled for this seat.', 'seatId');
      store.update((draft) => {
        draft.seatIdentities = (Array.isArray(draft.seatIdentities) ? draft.seatIdentities : [])
          .filter((r) => r && r.seatId !== seatId);
      }, {
        type: IDENTITY_EVENTS.REVOKE,
        entity: 'seat',
        entityId: seatId,
        summary: `Seat credential for ${seatId} revoked (key ${row.keyId}). Past attestations remain on record and verify as “key unavailable” from now on.`.slice(0, 300),
      });
      const session = activeIdentitySession(clock().getTime());
      if (session && session.seatId === seatId) clearIdentitySession();
      return saved({ seatId, revoked: true });
    },

    /** Explicit verification scan: recomputes verdicts and records them. */
    identityScan() {
      store.update(() => {}, {
        type: IDENTITY_EVENTS.SCAN,
        entity: 'workspace',
        entityId: '',
        summary: 'Explicit attestation verification requested from the Identity Ledger',
      });
      return saved({ verification: verifyAttestations(store.state, { keys: activeKeys(), now: clock() }) });
    },

    /** Build (and sign, when a session is active) a checkpoint certificate. */
    identityCheckpoint() {
      const session = activeIdentitySession(clock().getTime());
      const result = buildIdentityCheckpoint(store.state, { now: clock(), settings: settings(), session });
      store.update(() => {}, {
        type: IDENTITY_EVENTS.CHECKPOINT,
        entity: 'workspace',
        entityId: '',
        summary: `Checkpoint exported at revision ${result.revision} (${result.eventCount} events, ${result.signed ? `signed by ${result.keyId}` : 'UNSIGNED'}).`.slice(0, 300),
      });
      return saved({
        text: result.text, signed: result.signed, revision: result.revision,
        eventCount: result.eventCount, chainHead: result.chainHead,
      });
    },

    /** Pure: compare a checkpoint document against the current workspace. */
    identityCompareCheckpoint(certText) {
      return verifyIdentityCheckpoint(store.state, certText, { now: clock() });
    },

    /** Set the four conventions. Fail-closed clamps; only identity keys. */
    identitySetSettings(patch = {}) {
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        return fail('Settings updates must be a declared patch object.', 'settings');
      }
      const keys = Object.keys(patch);
      const allowed = new Set(['identityEnabled', 'identityAutoPropagate', 'identityEnforced', 'identityIdleMins']);
      if (!keys.length || keys.some((k) => !allowed.has(k))) {
        return fail('Only attestation conventions may be set here (enabled, enforced, automation pause, idle minutes).', 'settings');
      }
      const merged = normalizeIdentitySettings({ ...settings(), ...patch });
      store.update((draft) => {
        draft.settings.identityEnabled = merged.identityEnabled;
        draft.settings.identityAutoPropagate = merged.identityAutoPropagate;
        draft.settings.identityEnforced = merged.identityEnforced;
        draft.settings.identityIdleMins = merged.identityIdleMins;
      }, {
        type: IDENTITY_EVENTS.SETTINGS,
        entity: 'workspace',
        entityId: '',
        summary: `Attestation settings updated: enabled=${merged.identityEnabled} enforced=${merged.identityEnforced} auto=${merged.identityAutoPropagate} idle=${merged.identityIdleMins}m`.slice(0, 300),
      });
      return saved({ settings: merged });
    },

    /** Keep the session alive while the operator works. */
    identityTouch() {
      const ok = touchIdentitySession(clock().getTime(), settings().identityIdleMins);
      return { ok, session: activeIdentitySession(clock().getTime()) };
    },
  };
}
