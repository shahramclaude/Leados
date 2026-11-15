/**
 * app/core/domain/eventArchiveActions.js — operator and verifier doors for
 * ADR-0205's external event-retention capsule. Creation is a governed write
 * (full-access operator view only); verification is an aggregate-only read and
 * never imports rows into live workspace state.
 */

import { cryptoAvailable } from '../crypto.js';
import { activeSealKey } from './sealCrypto.js';
import { verifySealChain } from './sealChain.js';
import { SEAL_EVENTS, SEAL_LIMITS } from './sealRegistry.js';
import {
  createEventArchive,
  eventArchiveStatus,
  encryptEventArchive,
  openAndVerifyEventArchive,
} from './eventArchive.js';
import { EVENT_ARCHIVE_LIMITS } from './eventArchiveRegistry.js';

const fail = (error, reason = 'refused') => ({ ok: false, reason, error });

function createRefusal(store, cryptoRef) {
  if (store.isLocked) return 'Unlock the workspace before creating an archive.';
  if (store.writeBlockReason) return store.writeBlockReason;
  if (store.persistError) return `The workspace has an unresolved save error: ${store.persistError}`;
  if (store.state.settings?.activeSeatId) return 'A workspace-wide event archive can be created only from the full-access operator view. A declared seat is not sufficient authority.';
  if (!cryptoAvailable(cryptoRef)) return 'This browser has no secure Web Crypto context; an event archive cannot be encrypted here.';
  return null;
}

export function createEventArchiveActions(store, { now = () => new Date(), cryptoRef = undefined } = {}) {
  const clock = () => {
    const value = now();
    return value instanceof Date ? value : new Date(value);
  };

  return {
    /** Aggregate only: no event content, names, ids or summaries. */
    sealArchiveStatus() {
      const reason = createRefusal(store, cryptoRef);
      return {
        ok: true,
        report: eventArchiveStatus(store.state, {
          now: clock(),
          canCreate: !reason,
          reason,
        }),
      };
    },

    /**
     * Export one explicit, encrypted, closed-period capsule. The archive audit
     * event itself is appended and sealed only AFTER the capsule snapshot; it
     * names the capsule hash and declared dates, never the free-text purpose.
     */
    async sealArchiveCreate(input = {}) {
      const reason = createRefusal(store, cryptoRef);
      if (reason) return fail(reason, 'operator-only-or-unavailable');
      if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('Provide the archive request as an object.', 'bad-request');
      if (typeof input.passphrase !== 'string' || input.passphrase !== input.confirmPassphrase) {
        return fail('The archive passphrases do not match.', 'passphrase-mismatch');
      }
      const beforeRevision = Number(store.state.meta?.revision || 0);
      const currentSealCount = store.state.events.filter((event) => event?.type === SEAL_EVENTS.SEAL).length;
      if (!Number.isSafeInteger(beforeRevision) || beforeRevision >= Number.MAX_SAFE_INTEGER
          || currentSealCount >= SEAL_LIMITS.sealEventCap) {
        return fail('The local seal log cannot advance and verify the archive audit transaction; no change was made.', 'audit-seal-cap');
      }
      const at = clock();
      const key = activeSealKey();
      const built = createEventArchive(store.state, input, { now: at, key });
      if (!built.ok) return built;
      const archiveId = built.summary.archiveId;
      if (store.state.events.some((event) => event?.type === SEAL_EVENTS.ARCHIVE_CREATED && event.entityId === archiveId)) {
        return fail('This exact archive commitment is already on the workspace record. No duplicate file was issued.', 'already-recorded');
      }
      const encrypted = await encryptEventArchive(built.archive, {
        passphrase: input.passphrase,
        confirmPassphrase: input.confirmPassphrase,
        cryptoRef,
      });
      if (!encrypted.ok) return encrypted;
      if (encrypted.json.length > EVENT_ARCHIVE_LIMITS.maxFileChars) {
        return fail('The encrypted archive exceeds the declared file-size limit. Narrow the window; nothing was recorded.', 'archive-too-large');
      }

      store.update(() => {}, {
        type: SEAL_EVENTS.ARCHIVE_CREATED,
        entity: 'eventarchive',
        entityId: archiveId,
        summary: `Encrypted provenance archive ${archiveId} created for ${built.summary.fromDay} through ${built.summary.throughDay}; retain until ${built.summary.retainUntil.slice(0, 10)}. Local operator view; human identity is not authenticated.`,
      });
      try { await store.flush(); } catch (error) {
        return fail(`The archive audit write did not finish: ${error?.message || error}. No file was delivered.`, 'audit-save-failed');
      }
      if (store.persistError) return fail(`The archive audit record could not be saved: ${store.persistError}. No file was delivered.`, 'audit-save-failed');
      const afterRevision = Number(store.state.meta?.revision || 0);
      const archiveEvent = store.state.events.find((event) => event?.type === SEAL_EVENTS.ARCHIVE_CREATED && event.entityId === archiveId);
      const verification = verifySealChain(store.state, { key });
      const currentSeal = verification.blockList.find((block) => block.rev === afterRevision);
      if (!archiveEvent || afterRevision !== beforeRevision + 1 || !verification.chainValid || !currentSeal
          || !currentSeal.chainOk || !currentSeal.contentComplete || !currentSeal.contentOk) {
        return fail('The archive export was not sealed as a complete, durable audit transaction. The encrypted file was withheld.', 'audit-seal-failed');
      }

      return {
        ok: true,
        json: encrypted.json,
        bytes: encrypted.bytes,
        archiveId,
        summary: built.summary,
        audit: {
          eventId: archiveEvent.id,
          revision: afterRevision,
          sealed: true,
          saved: true,
          actor: 'local operator view; human identity is not authenticated',
        },
      };
    },

    /** Decrypt and verify a selected file; never adopts its event rows. */
    async sealArchiveVerify(input = {}) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('Provide the selected archive and passphrase as an object.', 'bad-request');
      const verified = await openAndVerifyEventArchive(input.text, {
        passphrase: input.passphrase,
        cryptoRef,
        now: clock(),
        key: activeSealKey(),
        coverageFromDay: input.coverageFromDay || null,
        coverageThroughDay: input.coverageThroughDay || null,
      });
      if (!verified.ok) return verified;
      return {
        ok: true,
        report: verified.report,
        readOnly: true,
        restored: false,
      };
    },
  };
}
