/**
 * app/core/store.js — persistence, audit trail, and change notification.
 *
 * Design rules enforced here:
 *  1. Reads never throw. A corrupt or partial blob is quarantined and the app
 *     opens an empty workspace with a visible warning instead of a blank page.
 *  2. Each storage write replaces one JSON blob atomically. Failed writes stay
 *     in memory with persistError; imports adopt nothing unless saved. Newer
 *     schema data is protected from all implicit writes and exported unchanged.
 *  3. Every meaningful mutation appends to an append-oriented event log, capped so
 *     it can never grow the blob without bound.
 *  4. Storage is injected, so the whole module is testable in Node.
 */

import {
  createEmptyState,
  migrate,
  normalizeState,
  SCHEMA_VERSION,
  COLLECTIONS,
  LINK_ENTITY_COLLECTIONS,
  LINK_ENTITY_TYPES,
} from './schema.js';
import { buildDemoState } from './demo.js';
import { exportWorkspaceCsv } from './csv.js';
import { retentionReview } from './domain/hiring.js';
import { omitPropagationLineageReferences, scrubPropagationLineageReferences } from './domain/automationLineage.js';
import { EW_SERIES_BY_ID } from './domain/watchRegistry.js';
import { isCandidateAuditEvent } from './domain/export-governance.js';
import { runPostCommitRules } from './domain/postCommit.js';
import {
  KDF_ITERATIONS,
  MIN_KDF_ITERATIONS,
  PURPOSE_EXPORT,
  PURPOSE_WORKSPACE,
  checkEnvelope,
  cryptoAvailable,
  describeEnvelope,
  deriveKey,
  isVaultEnvelope,
  newSalt,
  openEnvelope,
  sealText,
  validatePassphrase,
  verifyEnvelope,
} from './crypto.js';

/**
 * A standalone single-file build sets a distinct key before the bundle runs.
 * This keeps a copied `file://` workspace separate from the HTTP-served
 * workspace in the same browser, rather than silently sharing or overwriting
 * records across two different origins. Regular builds keep the historic key.
 */
const configuredStorageKey = typeof window !== 'undefined'
  && typeof window.__LEADOS_STORAGE_KEY__ === 'string'
  && /^[a-zA-Z0-9._-]{1,80}$/.test(window.__LEADOS_STORAGE_KEY__)
  ? window.__LEADOS_STORAGE_KEY__
  : null;
export const STORAGE_KEY = configuredStorageKey || 'leados.lifecycle.v1';
export const QUARANTINE_PREFIX = 'leados.corrupt.';
/**
 * While a workspace is encrypted and locked, nothing is written. Without this
 * guard an ordinary API call would replace the only copy of the ciphertext with
 * an empty plaintext workspace — silent, total data loss.
 */
export const LOCKED_MESSAGE =
  'This workspace is encrypted and locked. Unlock it with your passphrase before anything can be written. Its saved ciphertext has not been changed.';
export const NO_CRYPTO_MESSAGE =
  'This browser does not provide Web Crypto, so an encrypted workspace cannot be opened here. Try a current Chrome, Firefox, Edge or Safari.';
const EVENT_CAP = 600;

function schemaProblem(data) {
  if (!data || typeof data !== 'object' || data.schemaVersion === undefined) return null;
  const version = Number(data.schemaVersion);
  if (!['number', 'string'].includes(typeof data.schemaVersion) || !Number.isInteger(version) || version < 1) return 'This workspace declares an unsupported schema version. Its saved data has not been changed.';
  return version > SCHEMA_VERSION
    ? `This workspace uses schema v${version}, newer than supported v${SCHEMA_VERSION}. Its saved data has not been changed. Export the original and use a compatible LeadOS version, or explicitly import a compatible backup/reset.`
    : null;
}

/**
 * Conflict records are the one collection an operational (redacted) export
 * leaves behind. Their event-log entries carry no content by design, but they
 * still reveal that a case exists and when it was touched — mediation practice
 * treats even that as confidential (see RESEARCH.md §24) — so the operational
 * copy omits them too and reports counts only.
 */
function isConflictEvent(event) {
  if (!event || typeof event !== 'object') return false;
  return event.entity === 'conflict' || (typeof event.type === 'string' && event.type.startsWith('conflict.'));
}

/**
 * Deep-copy a state with requested operational redactions applied:
 *  - `redactConflicts`: removes confidential conflict records and conflict events
 *  - `pruneOverdueCandidates`: removes candidate records past `candidateRetentionDays` (HIRE-08),
 *    their graph links, and their event-log traces
 *  - `redactStakeholderStances`: scrubs non-neutral stances, veto-player flags, and private
 *    stakeholder briefing notes across Operational Cases, Organizational Changes and the
 *    Schema v25 Stakeholder Influence Register (including stance-history contexts)
 */
function redactStateForExport(
  source,
  {
    redactConflicts = false,
    pruneOverdueCandidates = false,
    redactStakeholderStances = false,
    nowDate = new Date(),
  } = {},
) {
  const copy = JSON.parse(JSON.stringify(source));
  const omitted = {};
  const marker = {};

  if (redactConflicts) {
    const conflictRecordsOmitted = Array.isArray(copy.conflicts) ? copy.conflicts.length : 0;
    const events = Array.isArray(copy.events) ? copy.events : [];
    const keptEvents = events.filter((event) => !isConflictEvent(event));
    copy.conflicts = [];
    copy.events = keptEvents;
    copy.propagationLineage = omitPropagationLineageReferences(copy.propagationLineage, (type) =>
      type === 'conflict' || type === 'pulse');
    omitted.conflictRecordsOmitted = conflictRecordsOmitted;
    omitted.conflictEventsOmitted = events.length - keptEvents.length;
    marker.conflicts = true;
    marker.conflictRecordsOmitted = omitted.conflictRecordsOmitted;
    marker.conflictEventsOmitted = omitted.conflictEventsOmitted;
  }

  if (pruneOverdueCandidates) {
    const review = retentionReview(copy, { now: nowDate, settings: copy.settings || {} });
    const dueIds = new Set(review.due.map((row) => row.candidate.id));
    const beforeCandidates = Array.isArray(copy.candidates) ? copy.candidates.length : 0;
    copy.candidates = Array.isArray(copy.candidates)
      ? copy.candidates.filter((c) => !dueIds.has(c.id))
      : [];
    const overdueCandidatesOmitted = beforeCandidates - copy.candidates.length;
    if (dueIds.size > 0 && Array.isArray(copy.links)) {
      copy.links = copy.links.filter(
        (lnk) =>
          lnk &&
          !(lnk.sourceType === 'candidate' && dueIds.has(lnk.sourceId)) &&
          !(lnk.targetType === 'candidate' && dueIds.has(lnk.targetId)),
      );
    }
    const events = Array.isArray(copy.events) ? copy.events : [];
    const keptEvents = dueIds.size > 0
      ? events.filter((ev) => !isCandidateAuditEvent(ev, dueIds))
      : events;
    copy.events = keptEvents;
    const lineageBefore = Array.isArray(copy.propagationLineage) ? copy.propagationLineage.length : 0;
    copy.propagationLineage = omitPropagationLineageReferences(copy.propagationLineage, (type, id) =>
      type === 'candidate' && dueIds.has(id));
    omitted.overdueCandidatesOmitted = overdueCandidatesOmitted;
    omitted.candidateEventsOmitted = events.length - keptEvents.length;
    omitted.candidateLineageTransactionsOmitted = lineageBefore - copy.propagationLineage.length;
    marker.overdueCandidates = true;
    marker.overdueCandidatesOmitted = overdueCandidatesOmitted;
    marker.candidateEventsOmitted = omitted.candidateEventsOmitted;
    marker.candidateLineageTransactionsOmitted = omitted.candidateLineageTransactionsOmitted;
  }

  if (redactStakeholderStances) {
    let scrubbed = 0;
    if (Array.isArray(copy.cases)) {
      for (const c of copy.cases) {
        if (!c || !Array.isArray(c.stakeholders)) continue;
        for (const s of c.stakeholders) {
          if (!s) continue;
          const hadSensitive =
            (s.stance && s.stance !== 'neutral') ||
            Boolean(String(s.keyMessage || s.notes || '').trim());
          if (hadSensitive) scrubbed += 1;
          s.stance = 'neutral';
          s.keyMessage = '';
          if ('notes' in s) s.notes = '';
        }
      }
    }
    if (Array.isArray(copy.changes)) {
      for (const chg of copy.changes) {
        if (!chg || !Array.isArray(chg.coalition)) continue;
        for (const m of chg.coalition) {
          if (!m) continue;
          const hadSensitive = (m.stance && m.stance !== 'neutral') || Boolean(m.vetoPlayer) || Boolean(String(m.keyMessage || '').trim());
          if (hadSensitive) scrubbed += 1;
          m.stance = 'neutral';
          m.vetoPlayer = false;
          m.keyMessage = '';
        }
      }
    }
    // Schema v25: the first-class influence register carries the same
    // contextual-integrity protection as the embedded stubs.
    if (Array.isArray(copy.stakeholders)) {
      for (const s of copy.stakeholders) {
        if (!s) continue;
        const hadSensitive = (s.stance && s.stance !== 'neutral') ||
          s.vetoPlayer === true ||
          Boolean(String(s.keyMessage || s.influenceNotes || s.vetoBasis || '').trim()) ||
          (Array.isArray(s.stanceHistory) && s.stanceHistory.some((e) => e && (e.stance !== 'neutral' || String(e.context || '').trim())));
        if (hadSensitive) scrubbed += 1;
        s.stance = 'neutral';
        s.vetoPlayer = false;
        s.keyMessage = '';
        s.influenceNotes = '';
        s.vetoBasis = '';
        s.stanceHistory = (Array.isArray(s.stanceHistory) ? s.stanceHistory : []).map((e) =>
          e ? { ...e, stance: 'neutral', context: '' } : e,
        );
      }
    }
    omitted.stakeholderRecordsScrubbed = scrubbed;
    marker.stakeholderStances = true;
    marker.stakeholderRecordsScrubbed = scrubbed;
  }

  return { state: copy, omitted, marker };
}

/**
 * The one export envelope every JSON backup shares. Only redacted operational
 * variants carry a `redactions` marker, and that marker is the file's own
 * declaration that it is knowingly incomplete — the import path reads it to
 * warn (and, where the cost is real, to refuse) rather than guess.
 */
function buildExportWrapper(
  source,
  {
    exportedAt,
    redactConflicts = false,
    pruneOverdueCandidates = false,
    redactStakeholderStances = false,
    nowDate = new Date(),
  } = {},
) {
  const wrapper = { app: 'LeadOS', schemaVersion: SCHEMA_VERSION, exportedAt, state: source };
  if (!redactConflicts && !pruneOverdueCandidates && !redactStakeholderStances) {
    return { wrapper, omitted: null };
  }
  const { state: redacted, omitted, marker } = redactStateForExport(source, {
    redactConflicts,
    pruneOverdueCandidates,
    redactStakeholderStances,
    nowDate,
  });
  wrapper.state = redacted;
  wrapper.redactions = marker;
  return { wrapper, omitted };
}

/**
 * Read the count-only redaction marker from an export wrapper, if present.
 * Anything malformed is treated as "no marker": a hand-edited file then
 * behaves like a full backup, which is the safer reading of unknown
 * provenance than inventing omissions the file never declared.
 */
function redactionOf(parsed) {
  const marker = parsed && typeof parsed === 'object' ? parsed.redactions : null;
  if (!marker || typeof marker !== 'object') return null;
  const hasAny =
    marker.conflicts === true ||
    marker.overdueCandidates === true ||
    marker.stakeholderStances === true;
  if (!hasAny) return null;
  const count = (value) => (Number.isInteger(value) && value >= 0 ? value : 0);
  const out = {
    conflictRecordsOmitted: count(marker.conflictRecordsOmitted),
    conflictEventsOmitted: count(marker.conflictEventsOmitted),
  };
  if (marker.overdueCandidates === true) {
    out.overdueCandidates = true;
    out.overdueCandidatesOmitted = count(marker.overdueCandidatesOmitted);
    out.candidateEventsOmitted = count(marker.candidateEventsOmitted);
    out.candidateLineageTransactionsOmitted = count(marker.candidateLineageTransactionsOmitted);
  }
  if (marker.stakeholderStances === true) {
    out.stakeholderStances = true;
    out.stakeholderRecordsScrubbed = count(marker.stakeholderRecordsScrubbed);
  }
  return out;
}

function redactionWarning(redacted) {
  const records = redacted.conflictRecordsOmitted || 0;
  const events = redacted.conflictEventsOmitted || 0;
  const candOmitted = redacted.overdueCandidatesOmitted || 0;
  const candidateLineageOmitted = redacted.candidateLineageTransactionsOmitted || 0;
  const stakeScrubbed = redacted.stakeholderRecordsScrubbed || 0;
  const parts = [];
  if (records > 0 || events > 0) {
    parts.push(`${records} conflict record${records === 1 ? '' : 's'} and ${events} conflict event${events === 1 ? '' : 's'} were left out`);
  }
  if (candOmitted > 0) {
    parts.push(`${candOmitted} overdue candidate record${candOmitted === 1 ? '' : 's'} (HIRE-08) were omitted`);
  }
  if (candidateLineageOmitted > 0) {
    parts.push(`${candidateLineageOmitted} candidate-linked automation transaction${candidateLineageOmitted === 1 ? '' : 's'} were omitted`);
  }
  if (stakeScrubbed > 0) {
    parts.push(`${stakeScrubbed} stakeholder stance/veto assessment${stakeScrubbed === 1 ? '' : 's'} were scrubbed to neutral`);
  }
  if (parts.length === 0) {
    return 'That file was exported as an operational copy, but the workspace it came from had no conflict records or conflict events to leave out, so it is complete.';
  }
  if (candOmitted === 0 && candidateLineageOmitted === 0 && stakeScrubbed === 0) {
    return `That file was exported as an operational copy without its confidential conflict records: ${records} conflict record${records === 1 ? '' : 's'} and ${events} conflict event${events === 1 ? '' : 's'} were left out of the file and have not been imported. A full backup is needed to restore them.`;
  }
  return `That file was exported as a privacy-minimised operational copy (${parts.join('; ')}). A full backup is needed if you meant to restore those omitted details.`;
}

function defaultStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* private mode / disabled storage */
  }
  return null;
}

function defaultIdFactory() {
  let n = 0;
  return (prefix = 'id') => {
    n += 1;
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${Date.now().toString(36)}-${n.toString(36)}${rand}`;
  };
}

export function createStore(options = {}) {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const key = options.key || STORAGE_KEY;
  const now = options.now || (() => new Date());
  const idFactory = options.idFactory || defaultIdFactory();
  const cryptoRef = options.crypto === undefined ? undefined : options.crypto;
  const kdfIterations = Number.isInteger(options.kdfIterations) && options.kdfIterations > 0
    ? options.kdfIterations
    : KDF_ITERATIONS;
  const minKdfIterations = Number.isInteger(options.minKdfIterations) && options.minKdfIterations > 0
    ? options.minKdfIterations
    : MIN_KDF_ITERATIONS;
  // ADR-0008: optional injection for tests/future rule sets. The default is
  // the generalized forecast-integrity rule; pass [] to disable all rules.
  const postCommitRules = options.postCommitRules;
  // ADR-0026 test seam, same status as `postCommitRules`: select the rule
  // savepoint strategy for every write in this store. Nothing in the app sets
  // it; the equivalence suite uses it to run an identical workflow through the
  // pre-ADR-0026 eager copy and compare the resulting workspaces.
  const savepointStrategy = options.savepointStrategy === 'clone' ? 'clone' : null;
  const listeners = new Set();

  let state = createEmptyState(now().toISOString());
  let warnings = [];
  let persistError = null;
  let loaded = false;
  // The propagation entries produced by the post-commit rules for the most
  // recent committed mutation (ADR-0008). Actions surface these so a leader
  // can see what one entry caused across modules instead of discovering it
  // later. Before Session 51 this was read by actions but never assigned, so
  // every result silently reported "nothing propagated".
  let lastPropagations = [];
  /**
   * ADR-0026: the measured outcome of the most recent rule chain, owned by the
   * engine and surfaced verbatim. This is instrumentation, not state: it is
   * never persisted and never exported, because it describes one write on this
   * device rather than anything about the workspace. It is what lets the
   * Propagation Ledger show a leader where their write time actually went
   * instead of asserting that automation is "fast".
   */
  let lastPropagationMetrics = null;
  let protectedRaw = null;
  let writeBlockReason = null;
  /** Non-secret envelope metadata, kept while locked so the UI can explain itself. */
  let vaultHeader = null;
  /** Derived AES key. Never persisted, never exported, dropped on lock. */
  let vaultKey = null;
  /** True when storage holds ciphertext this session has not opened. */
  let locked = false;
  /** True when the ciphertext cannot be opened by this version at all. */
  let vaultUnsupported = false;
  /** Exact ciphertext read from storage while locked, so export cannot invent an empty workspace. */
  let lockedRaw = null;
  let saveChain = Promise.resolve();
  let saveSeq = 0;

  function notify(reason) {
    for (const fn of listeners) {
      try {
        fn(state, { reason, warnings, persistError });
      } catch (err) {
        // A broken subscriber must not take down the store.
        if (typeof console !== 'undefined') console.error('store subscriber failed', err);
      }
    }
  }

  function readRaw() {
    if (!storage) return { raw: null, error: 'This browser has no local storage available, so nothing can be saved.' };
    try {
      return { raw: storage.getItem(key), error: null };
    } catch (err) {
      return { raw: null, error: `Could not read saved data: ${err && err.message ? err.message : err}` };
    }
  }

  function quarantine(raw) {
    if (!storage || !raw) return;
    try {
      storage.setItem(QUARANTINE_PREFIX + Date.now(), raw.slice(0, 500000));
    } catch {
      /* quarantine is best-effort by design */
    }
  }

  function load() {
    const { raw, error } = readRaw();
    warnings = [];
    persistError = null;
    protectedRaw = null;
    writeBlockReason = null;
    locked = false;
    vaultUnsupported = false;
    if (error) {
      warnings = [error];
      state = createEmptyState(now().toISOString());
      loaded = true;
      notify('load-failed');
      return state;
    }
    if (!raw) {
      state = createEmptyState(now().toISOString());
      loaded = true;
      notify('load-empty');
      return state;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      quarantine(raw);
      state = createEmptyState(now().toISOString());
      warnings = ['Saved data was unreadable (invalid JSON). It has been set aside and a fresh workspace opened.'];
      loaded = true;
      notify('load-corrupt');
      return state;
    }
    // An encrypted workspace is valid JSON that this session cannot read yet.
    // It must never be quarantined as "corrupt": the ciphertext is the only copy.
    if (isVaultEnvelope(parsed)) {
      const structural = checkEnvelope(parsed, { minIterations: minKdfIterations });
      vaultHeader = describeEnvelope(parsed);
      vaultKey = null;
      locked = true;
      lockedRaw = raw;
      state = createEmptyState(now().toISOString());
      loaded = true;
      if (!structural.ok) {
        // Keep the bytes, refuse to touch them, and say exactly why.
        vaultUnsupported = true;
        warnings = [structural.error];
        writeBlockReason = `${structural.error} Nothing will be written over it.`;
        persistError = writeBlockReason;
        notify('load-encrypted-unsupported');
        return state;
      }
      if (parsed.purpose !== PURPOSE_WORKSPACE) {
        // A backup file dropped into storage is not a workspace. Opening it as
        // one would normalize the export wrapper into an empty state and then
        // overwrite the ciphertext on the next edit.
        vaultUnsupported = true;
        warnings = [
          'This browser holds an encrypted LeadOS backup, not a workspace. Nothing will be written over it. Restore it with a backup file below, or erase it.',
        ];
        writeBlockReason = warnings[0];
        persistError = writeBlockReason;
        notify('load-encrypted-backup');
        return state;
      }
      warnings = [];
      persistError = null;
      writeBlockReason = LOCKED_MESSAGE;
      notify('locked');
      return state;
    }
    vaultHeader = null;
    vaultKey = null;
    locked = false;
    lockedRaw = null;
    const unsupported = schemaProblem(parsed);
    if (unsupported) {
      protectedRaw = raw;
      writeBlockReason = unsupported;
      persistError = unsupported;
      warnings = [unsupported];
      state = createEmptyState(now().toISOString());
      loaded = true;
      notify('load-unsupported');
      return state;
    }
    const { raw: migrated, applied } = migrate(parsed);
    const result = normalizeState(migrated, { now: now() });
    state = result.state;
    warnings = result.warnings.slice();
    if (applied.length) warnings.push(`Migrated saved data: ${applied.join(', ')}`);
    loaded = true;
    notify('load');
    return state;
  }

  function saveErrorMessage(err) {
    if (err && err.name === 'QuotaExceededError') {
      return 'Could not save: browser storage is full. Export your data, then reset.';
    }
    return `Could not save: ${(err && err.message) || err}`;
  }

  /**
   * Persist the given state. Returns true when it reached storage. When the
   * workspace is encrypted the write is queued (WebCrypto is asynchronous), so
   * `true` means "adopted and queued"; a later 'persisted' or 'update-unsaved'
   * notification reports the real outcome. `flush()` awaits that queue.
   */
  function persist(next, { replaceProtected = false } = {}) {
    if (writeBlockReason && !replaceProtected) { persistError = writeBlockReason; return false; }
    if (!storage) {
      persistError = 'No storage available — changes are held in memory only and will be lost on reload.';
      return false;
    }
    if (vaultKey && vaultHeader) {
      queueSave(next);
      return true;
    }
    try {
      storage.setItem(key, JSON.stringify(next));
      protectedRaw = null;
      writeBlockReason = null;
      persistError = null;
      return true;
    } catch (err) {
      persistError = saveErrorMessage(err);
      return false;
    }
  }

  /**
   * Encrypted writes are serialised and coalesced: rapid edits encrypt only the
   * newest state, and two concurrent encryptions can never land out of order.
   */
  function queueSave(next) {
    saveSeq += 1;
    const seq = saveSeq;
    const keyAtCall = vaultKey;
    const headerAtCall = vaultHeader;
    saveChain = saveChain
      .then(async () => {
        if (seq !== saveSeq) return; // a newer state superseded this one
        try {
          const envelope = await sealText({
            text: JSON.stringify(next),
            key: keyAtCall,
            cryptoRef,
            salt: headerAtCall.salt,
            iterations: headerAtCall.iterations,
            purpose: PURPOSE_WORKSPACE,
            createdAt: headerAtCall.createdAt || now().toISOString(),
          });
          storage.setItem(key, JSON.stringify(envelope));
          persistError = null;
          notify('persisted');
        } catch (err) {
          persistError = saveErrorMessage(err);
          notify('update-unsaved');
        }
      })
      .catch(() => {
        /* the chain itself must stay usable after an unexpected rejection */
      });
    return saveChain;
  }

  /**
   * Build the exact string that belongs in storage for `next`.
   * `useVault` is an explicit `{key, salt, iterations, createdAt}` or null, so a
   * mode change (enabling/disabling encryption, importing an encrypted backup)
   * can be written first and committed to memory only after it succeeds.
   */
  async function encodePayload(next, useVault) {
    const text = JSON.stringify(next);
    if (!useVault) return text;
    const envelope = await sealText({
      text,
      key: useVault.key,
      cryptoRef,
      salt: useVault.salt,
      iterations: useVault.iterations,
      purpose: PURPOSE_WORKSPACE,
      createdAt: useVault.createdAt || now().toISOString(),
    });
    return JSON.stringify(envelope);
  }

  /** The vault currently open in memory, in the shape encodePayload expects. */
  function activeVault() {
    return vaultKey && vaultHeader
      ? { key: vaultKey, salt: vaultHeader.salt, iterations: vaultHeader.iterations, createdAt: vaultHeader.createdAt }
      : null;
  }

  /**
   * Await-able write used wherever adopting state depends on the write actually
   * succeeding (imports, enabling encryption). Never leaves the app claiming a
   * save that did not happen.
   */
  async function persistAwaited(next, { replaceProtected = false, vault = undefined } = {}) {
    if (writeBlockReason && !replaceProtected) { persistError = writeBlockReason; return false; }
    if (!storage) {
      persistError = 'No storage available — changes are held in memory only and will be lost on reload.';
      return false;
    }
    await saveChain;
    let payload;
    try {
      payload = await encodePayload(next, vault === undefined ? activeVault() : vault);
    } catch (err) {
      persistError = saveErrorMessage(err);
      return false;
    }
    try {
      storage.setItem(key, payload);
      protectedRaw = null;
      writeBlockReason = null;
      persistError = null;
      return true;
    } catch (err) {
      persistError = saveErrorMessage(err);
      return false;
    }
  }

  /** Resolve once every queued encrypted write has finished (success or not). */
  function flush() {
    return saveChain;
  }

  function logEvent(draft, entry) {
    const event = {
      id: idFactory('ev'),
      ts: now().toISOString(),
      type: entry.type || 'unknown',
      entity: entry.entity || '',
      entityId: entry.entityId || '',
      summary: entry.summary || '',
    };
    draft.events.push(event);
    if (draft.events.length > EVENT_CAP) draft.events.splice(0, draft.events.length - EVENT_CAP);
    return event;
  }

  /**
   * Apply a mutation. The mutator receives a deep-ish copy and must return
   * nothing; it mutates in place. `event` is appended to the audit log.
   */
  /**
   * @param {Function} mutator Mutates the draft in place.
   * @param {object} [event] Audit entry appended after the mutation.
   * @param {object} [options] ADR-0026 retry seam.
   *   `rules` restricts the post-commit chain to a specific list (used to
   *   re-run one failed rule without replaying automation that already
   *   succeeded). `suppressReceipt` stops a retry from filing a second receipt
   *   for a failure already recorded on the original one. `afterRules` receives
   *   the draft and the engine's measurements after the chain runs and before
   *   persistence, so a caller can record the outcome in the same transaction.
   *   `ruleEvent` is the event the post-commit chain sees, when it must differ
   *   from the audit entry — a retry replays the original failed event while
   *   recording `propagation.retried` in the log.
   *   `savepoint` selects the rule savepoint strategy (`'cow'` default, or
   *   `'clone'` for the pre-ADR-0026 eager copy). Test seam only.
   *   All of these default to the ordinary behaviour.
   */
  function update(mutator, event, options = {}) {
    if (writeBlockReason) { persistError = writeBlockReason; lastPropagations = []; lastPropagationMetrics = null; notify('update-blocked'); return state; }
    const draft = JSON.parse(JSON.stringify(state));
    draft.meta.revision = (draft.meta.revision || 0) + 1;
    draft.meta.updatedAt = now().toISOString();
    mutator(draft, { logEvent: (entry) => logEvent(draft, entry) });
    if (event) logEvent(draft, event);
    // ADR-0008: pure event-driven rules run inside the same transaction, after
    // the source mutation and its audit entry, before the state is persisted.
    const metrics = {};
    lastPropagations = runPostCommitRules(draft, {
      event: options.ruleEvent || event || null,
      previousState: state,
      now: now(),
      idFactory,
      logEvent: (entry) => logEvent(draft, entry),
      warnings,
      metrics,
      suppressReceipt: options.suppressReceipt === true,
      ...(options.savepoint || savepointStrategy ? { savepoint: options.savepoint || savepointStrategy } : {}),
      ...(options.declineMemo === false ? { declineMemo: false } : {}),
      ...(postCommitRules === undefined ? {} : { rules: postCommitRules }),
      ...(Array.isArray(options.rules) ? { rules: options.rules } : {}),
    });
    lastPropagationMetrics = {
      ...metrics,
      at: now().toISOString(),
      rootEvent: event ? event.type : null,
      revision: draft.meta.revision,
    };
    if (typeof options.afterRules === 'function') options.afterRules(draft, lastPropagationMetrics);
    const ok = persist(draft);
    state = draft; // in-memory state stays truthful even when persistence fails
    notify(ok ? 'update' : 'update-unsaved');
    return state;
  }

  /**
   * Import with full validation. Rejects rather than half-applying.
   * `replaceWithRedacted` is required before an operational copy may replace
   * conflict records stored here (see `redactionReplacementBlock`).
   */
  function importJSON(text, { replaceWithRedacted = false } = {}) {
    if (locked || (vaultHeader && !vaultKey)) {
      return {
        ok: false,
        reason: 'locked',
        error: 'This workspace is encrypted and locked. Unlock it first, or use "Can\'t unlock?" on the lock screen.',
      };
    }
    if (vaultKey) {
      return {
        ok: false,
        reason: 'encrypted-active',
        error:
          'This workspace is encrypted, so a replacement has to be written as ciphertext. Use Import a backup in Settings, which waits for that write before replacing anything.',
      };
    }
    if (isVaultEnvelope(parseJSONSafe(text))) {
      return {
        ok: false,
        reason: 'encrypted',
        error: 'This is an encrypted LeadOS backup. Use Import a backup in Settings so you can enter its passphrase.',
      };
    }
    const result = parseImport(text);
    if (!result.ok) return result;
    const block = redactionReplacementBlock(result, replaceWithRedacted);
    if (block) return block;
    if (!persist(result.state, { replaceProtected: true })) {
      return { ok: false, error: persistError || 'Could not write the imported data to storage.' };
    }
    return adopt(result);
  }

  function parseJSONSafe(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  /** Validate + normalise an export file without touching storage. */
  function parseImport(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      return { ok: false, error: 'That file is not valid JSON.' };
    }
    const candidate = parsed && parsed.state ? parsed.state : parsed;
    const unsupported = schemaProblem(parsed) || schemaProblem(candidate);
    if (unsupported) return { ok: false, error: unsupported };
    if (!candidate || typeof candidate !== 'object') {
      return { ok: false, error: 'That JSON does not look like a LeadOS export.' };
    }
    if (!Array.isArray(candidate.people)) {
      return { ok: false, error: 'That JSON has no "people" list, so it is not a LeadOS workspace.' };
    }
    const { raw: migrated, applied } = migrate(candidate);
    const result = normalizeState(migrated, { now: now() });
    return {
      ok: true,
      state: result.state,
      warnings: result.warnings.slice(),
      applied,
      redacted: redactionOf(parsed),
    };
  }

  function adopt(result) {
    state = result.state;
    warnings = result.warnings.slice();
    if (result.applied && result.applied.length) warnings.push(`Migrated imported data: ${result.applied.join(', ')}`);
    if (result.redacted) warnings.push(redactionWarning(result.redacted));
    lockedRaw = null;
    notify('import');
    return {
      ok: true,
      imported: {
        people: state.people.length,
        events: state.events.length,
        isDemo: state.meta.isDemo,
      },
      warnings,
      redacted: result.redacted || null,
    };
  }

  /**
   * Refuse to let a knowingly incomplete operational copy silently overwrite
   * conflict records that are readable here. When the current copy cannot be
   * read (locked ciphertext or a protected newer schema), `state` here is the
   * empty fallback, so nothing blocks — the explicit replaceLocked /
   * replacePlaintext confirmations already cover total replacement there, and
   * the redaction is still reported as a warning on success.
   */
  function redactionReplacementBlock(result, replaceWithRedacted) {
    if (replaceWithRedacted || !result.redacted) return null;
    const omittedConflicts = result.redacted.conflictRecordsOmitted || 0;
    const hereConflicts = (state.conflicts || []).length;
    if (omittedConflicts > 0 && hereConflicts > 0) {
      return {
        ok: false,
        reason: 'redacted-replacement',
        redacted: result.redacted,
        currentConflicts: hereConflicts,
        error: `That file is an operational copy: it was exported without its ${omittedConflicts} confidential conflict record${omittedConflicts === 1 ? '' : 's'}. Importing it here would delete the ${hereConflicts} conflict record${hereConflicts === 1 ? '' : 's'} stored in this browser. Import a full backup instead, or confirm that you meant to replace them.`,
      };
    }
    const omittedCandidates = result.redacted.overdueCandidatesOmitted || 0;
    const hereCandidates = (state.candidates || []).length;
    if (omittedCandidates > 0 && hereCandidates > (result.state.candidates || []).length) {
      return {
        ok: false,
        reason: 'redacted-replacement',
        redacted: result.redacted,
        currentConflicts: hereConflicts,
        currentCandidates: hereCandidates,
        error: `That file was exported with ${omittedCandidates} overdue candidate record${omittedCandidates === 1 ? '' : 's'} (HIRE-08) omitted. Importing it here would overwrite the ${hereCandidates} candidate record${hereCandidates === 1 ? '' : 's'} stored in this browser. Import a full backup instead, or confirm that you meant to replace them.`,
      };
    }
    return null;
  }

  function exportJSON() {
    // Locked: hand back the untouched ciphertext rather than a freshly built
    // (and therefore empty) workspace that would look like real data loss.
    if (locked && lockedRaw !== null) return lockedRaw;
    if (protectedRaw !== null) return protectedRaw;
    const { wrapper } = buildExportWrapper(state, { exportedAt: now().toISOString() });
    return JSON.stringify(wrapper, null, 2);
  }

  /**
   * Read-only scoped CSV export. Refuses when storage contains a newer,
   * unparsed schema blob so the user is never handed an empty CSV for data
   * still safely held in `protectedRaw`.
   */
  function exportCSV(scope, options = {}) {
    if (locked) {
      return {
        ok: false,
        reason: 'locked',
        error: 'This workspace is encrypted and locked, so there is nothing readable to export. Unlock it first.',
      };
    }
    if (vaultHeader && !vaultKey) {
      return {
        ok: false,
        reason: 'locked',
        error: 'This workspace could not be opened, so there is nothing readable to export. Export JSON gives you the untouched encrypted file.',
      };
    }
    if (writeBlockReason) {
      return {
        ok: false,
        reason: 'unsupported-schema',
        error: `${writeBlockReason} Use Export JSON to download the untouched original file.`,
      };
    }
    return exportWorkspaceCsv(state, scope, { ...options, now: now() });
  }

  /**
   * Operational JSON copy for moving records between devices or sharing them
   * upwards: everything a full backup has, except the confidential conflict
   * records and their event-log traces (plus optional overdue-candidate or
   * stakeholder-stance redactions), whose omission is declared (counts only)
   * inside the file. Refuses wherever the workspace cannot be read — handing
   * back ciphertext or an untouched original labelled "redacted" would destroy
   * the very guarantee the copy exists to make.
   */
  function exportRedactedJSON({
    redactConflicts = true,
    pruneOverdueCandidates = false,
    redactStakeholderStances = false,
  } = {}) {
    if (locked) {
      return {
        ok: false,
        reason: 'locked',
        error: 'This workspace is encrypted and locked, so there is nothing readable to make an operational copy from. Unlock it first. (Export JSON gives you the untouched encrypted file.)',
      };
    }
    if (vaultHeader && !vaultKey) {
      return {
        ok: false,
        reason: 'locked',
        error: 'This workspace could not be opened, so there is nothing readable to make an operational copy from. Export JSON gives you the untouched encrypted file.',
      };
    }
    if (writeBlockReason) {
      return {
        ok: false,
        reason: 'unsupported-schema',
        error: `${writeBlockReason} Use Export JSON to download the untouched original file.`,
      };
    }
    const nowAt = now();
    const { wrapper, omitted } = buildExportWrapper(state, {
      exportedAt: nowAt.toISOString(),
      redactConflicts: Boolean(redactConflicts),
      pruneOverdueCandidates: Boolean(pruneOverdueCandidates),
      redactStakeholderStances: Boolean(redactStakeholderStances),
      nowDate: nowAt,
    });
    return { ok: true, json: JSON.stringify(wrapper, null, 2), omitted };
  }

  /**
   * Start an empty workspace. A locked encrypted workspace refuses unless the
   * caller explicitly confirmed that the unreadable ciphertext (the only copy of
   * that data) may be destroyed.
   */
  function reset({ eraseEncrypted = false } = {}) {
    if (locked && !eraseEncrypted) {
      persistError = LOCKED_MESSAGE;
      notify('reset-blocked');
      return state;
    }
    if (locked && eraseEncrypted) {
      vaultHeader = null;
      vaultKey = null;
      locked = false;
      lockedRaw = null;
      writeBlockReason = null;
      persistError = null;
    }
    const empty = createEmptyState(now().toISOString());
    if (!persist(empty, { replaceProtected: true }) && writeBlockReason) { notify('reset-blocked'); return state; }
    state = empty;
    warnings = [];
    notify('reset');
    return state;
  }

  /** True when anything in the workspace was entered by the user rather than the demo. */
  function hasRealData() {
    const isDemoId = (record) => typeof record.id === 'string' && record.id.includes('-demo-');
    const collections = COLLECTIONS.filter((name) => name !== 'events');
    return collections.some((key) => (state[key] || []).some((record) => !isDemoId(record)));
  }

  /**
   * Load the labelled demo workspace. Refuses to destroy user data unless
   * `force` is passed, because silently replacing someone's team with
   * fabricated records would be the worst possible failure mode here.
   */
  function seedDemo({ force = false } = {}) {
    if (locked || (vaultHeader && !vaultKey)) {
      return { ok: false, reason: 'locked', error: 'This workspace is encrypted and locked. Unlock it before loading demo data.' };
    }
    if (writeBlockReason) return { ok: false, reason: 'unsupported-schema', error: writeBlockReason };
    if (!force && hasRealData()) {
      return {
        ok: false,
        reason: 'has-real-data',
        error: 'This workspace contains records you entered. Loading the demo would replace them — export first, or confirm the replacement.',
      };
    }
    const demo = buildDemoState(now());
    persist(demo);
    state = demo;
    warnings = ['Demo workspace loaded. Every record is fabricated and labelled as such; clear it before using real data.'];
    notify('demo');
    return { ok: true, state };
  }

  /**
   * Remove demo records only — real records added alongside the demo survive.
   * Identification is by record id (`*-demo-*`), not by person, so demo records
   * with no person attached (anonymous pulse responses, team goals) are removed
   * too. Leaving fabricated anonymous answers behind would silently pollute the
   * real aggregate, which is exactly the kind of quiet corruption this app must
   * not have.
   */
  function clearDemo() {
    if (locked || (vaultHeader && !vaultKey)) {
      persistError = LOCKED_MESSAGE;
      notify('update-blocked');
      return state;
    }
    if (writeBlockReason) { persistError = writeBlockReason; notify('update-blocked'); return state; }
    const next = JSON.parse(JSON.stringify(state));
    const isDemo = (record) => typeof record.id === 'string' && record.id.includes('-demo-');
    for (const key of COLLECTIONS.filter((name) => !['people', 'events'].includes(name))) {
      next[key] = (next[key] || []).filter((record) => !isDemo(record));
    }
    next.people = next.people.filter((person) => !isDemo(person));
    // A user-created review attached to a fabricated demo person cannot remain
    // meaningful after that person is removed; reviews on real people survive.
    const remainingPeople = new Set(next.people.map((person) => person.id));
    next.reviews = next.reviews.filter((review) => remainingPeople.has(review.personId));
    next.delegations = next.delegations.filter((delegation) => remainingPeople.has(delegation.personId));
    next.onboarding = (next.onboarding || [])
      .filter((plan) => remainingPeople.has(plan.personId))
      .map((plan) => (plan.buddyId && !remainingPeople.has(plan.buddyId) ? { ...plan, buddyId: null } : plan));
    const remainingGoals = new Set((next.goals || []).map((goal) => goal.id));
    next.cases = (next.cases || []).map((c) => ({
      ...c,
      ownerId: c.ownerId && remainingPeople.has(c.ownerId) ? c.ownerId : null,
      involvedPersonIds: (c.involvedPersonIds || []).filter((pid) => remainingPeople.has(pid)),
      linkedGoalId: c.linkedGoalId && remainingGoals.has(c.linkedGoalId) ? c.linkedGoalId : null,
    }));
    next.changes = (next.changes || []).map((chg) => ({
      ...chg,
      ownerId: chg.ownerId && remainingPeople.has(chg.ownerId) ? chg.ownerId : null,
      linkedGoalId: chg.linkedGoalId && remainingGoals.has(chg.linkedGoalId) ? chg.linkedGoalId : null,
      impacts: Array.isArray(chg.impacts)
        ? chg.impacts.filter((imp) => imp && remainingPeople.has(imp.personId))
        : [],
      coalition: Array.isArray(chg.coalition)
        ? chg.coalition.map((m) => (m && m.personId && !remainingPeople.has(m.personId) ? { ...m, personId: null } : m))
        : [],
    }));
    const remainingCases = new Set((next.cases || []).map((r) => r.id));
    const remainingDelegations = new Set((next.delegations || []).map((r) => r.id));
    const remainingDecisions = new Set((next.decisions || []).map((r) => r.id));
    const remainingPremises = new Set((next.premises || []).map((r) => r.id));
    // Schema v36: outcomes are append-only but cannot outlive their premise.
    // Clearing a demo premise therefore clears its derived calibration sample.
    next.premiseOutcomes = (next.premiseOutcomes || []).filter((outcome) => remainingPremises.has(outcome.premiseId));
    const remainingBudgets = new Set((next.budgets || []).map((r) => r.id));
    const remainingPortfolio = new Set((next.portfolio || []).map((r) => r.id));
    // Schema v28: a user timebox attached to a removed demo decision cannot
    // remain valid; drop orphan timeboxes before graph-edge cleanup.
    next.tempoSchedules = (next.tempoSchedules || []).filter(
      (sched) => sched && remainingDecisions.has(sched.decisionId),
    );
    // Schema v27: scrub stale confirmedCaseId pointers on retained intake drafts.
    next.intakeDrafts = (next.intakeDrafts || []).map((draft) => ({
      ...draft,
      confirmedCaseId: draft.confirmedCaseId && remainingCases.has(draft.confirmedCaseId) ? draft.confirmedCaseId : null,
    }));
    next.negotiations = (next.negotiations || []).map((neg) => ({
      ...neg,
      ownerId: neg.ownerId && remainingPeople.has(neg.ownerId) ? neg.ownerId : null,
      linkedGoalId: neg.linkedGoalId && remainingGoals.has(neg.linkedGoalId) ? neg.linkedGoalId : null,
      escalationCaseId: neg.escalationCaseId && remainingCases.has(neg.escalationCaseId) ? neg.escalationCaseId : null,
      agreedTerms: Array.isArray(neg.agreedTerms)
        ? neg.agreedTerms.map((t) => ({
            ...t,
            ownerId: t.ownerId && remainingPeople.has(t.ownerId) ? t.ownerId : null,
            priorOwners: Array.isArray(t.priorOwners)
              ? t.priorOwners.filter(
                  (po) => po && (!po.ownerId || remainingPeople.has(po.ownerId)) && (!po.delegationId || remainingDelegations.has(po.delegationId)),
                )
              : [],
          }))
        : [],
    }));
    const remainingNegotiations = new Set((next.negotiations || []).map((r) => r.id));
    const remainingStakeholders = new Set((next.stakeholders || []).map((r) => r.id));
    // Schema v29: retained user dependencies keep their continuity tolerances
    // and drills; scrub only pointers to removed demo people/records.
    const remainingDependencies = new Set((next.dependencies || []).map((r) => r.id));
    next.dependencies = (next.dependencies || []).map((dep) => ({
      ...dep,
      upstreamIds: (dep.upstreamIds || []).filter((uid) => uid !== dep.id && remainingDependencies.has(uid)),
      stewards: (dep.stewards || []).filter((st) => st && remainingPeople.has(st.personId)),
      linkedGoalIds: (dep.linkedGoalIds || []).filter((gid) => remainingGoals.has(gid)),
      linkedBudgetId: dep.linkedBudgetId && remainingBudgets.has(dep.linkedBudgetId) ? dep.linkedBudgetId : null,
      linkedNegotiationId: dep.linkedNegotiationId && remainingNegotiations.has(dep.linkedNegotiationId) ? dep.linkedNegotiationId : null,
      linkedStakeholderId: dep.linkedStakeholderId && remainingStakeholders.has(dep.linkedStakeholderId) ? dep.linkedStakeholderId : null,
      linkedPortfolioId: dep.linkedPortfolioId && remainingPortfolio.has(dep.linkedPortfolioId) ? dep.linkedPortfolioId : null,
      drills: Array.isArray(dep.drills)
        ? dep.drills.map((dr) => ({
            ...dr,
            linkedCaseId: dr.linkedCaseId && remainingCases.has(dr.linkedCaseId) ? dr.linkedCaseId : null,
          }))
        : [],
    }));
    // Schema v38: retained capital portfolios keep their levers, budget and frozen
    // prediction; only pointers to removed demo people/records are scrubbed. A
    // checkpoint whose subject vanished is derived evidence about nothing, so it
    // goes — and the dynamic experiments themselves must stay addressable, or a
    // retained dynamics link is silently dropped by the graph filter below.
    const remainingCapital = new Set((next.capitalPolicies || []).map((r) => r.id));
    const remainingExperiments = new Set((next.dynamicsExperiments || []).map((r) => r.id));
    next.capitalPolicies = (next.capitalPolicies || []).map((policy) => ({
      ...policy,
      ownerId: policy.ownerId && remainingPeople.has(policy.ownerId) ? policy.ownerId : null,
    }));
    next.dynamicsCheckpoints = (next.dynamicsCheckpoints || []).filter((checkpoint) => checkpoint
      && (checkpoint.subjectType === 'policy'
        ? remainingCapital.has(checkpoint.subjectId)
        : remainingExperiments.has(checkpoint.subjectId)));
    // Schema v42: a retained bet keeps its declared content and stop rule; only
    // dead owner pointers are scrubbed. Tags are pruned below, once every
    // remaining collection is known, because a tag is an assertion about two
    // records at once and cannot survive either one disappearing.
    next.strategyBets = (next.strategyBets || []).map((bet) => ({
      ...bet,
      ownerId: bet.ownerId && remainingPeople.has(bet.ownerId) ? bet.ownerId : null,
    }));
    // Build cleanup's typed-ID view from the same registry as normalization.
    // This keeps static series and nested lesson references alive while real
    // records survive demo removal, and covers new entity types by construction.
    const remainingByType = {};
    for (const entityType of LINK_ENTITY_TYPES) {
      if (entityType === 'lesson') {
        remainingByType.lesson = new Set((next.retros || []).flatMap((retro) =>
          (Array.isArray(retro?.lessons) ? retro.lessons : []).map((lesson) => lesson?.id))
          .filter((id) => typeof id === 'string' && id));
      } else if (entityType === 'series') {
        remainingByType.series = new Set(EW_SERIES_BY_ID.keys());
      } else {
        const collection = LINK_ENTITY_COLLECTIONS[entityType];
        remainingByType[entityType] = new Set((collection && Array.isArray(next[collection]) ? next[collection] : [])
          .map((record) => record?.id)
          .filter((id) => typeof id === 'string' && id));
      }
    }
    remainingByType.case = remainingCases;
    remainingByType.decision = remainingDecisions;
    remainingByType.delegation = remainingDelegations;
    remainingByType.goal = remainingGoals;
    remainingByType.person = remainingPeople;
    remainingByType.negotiation = remainingNegotiations;
    remainingByType.budget = remainingBudgets;
    remainingByType.stakeholder = remainingStakeholders;
    remainingByType.dependency = remainingDependencies;
    remainingByType.capital = remainingCapital;
    remainingByType.dynamics = remainingExperiments;
    next.scorecards = (next.scorecards || []).map((scorecard) => ({
      ...scorecard,
      ownerId: scorecard.ownerId && remainingPeople.has(scorecard.ownerId) ? scorecard.ownerId : null,
    }));
    next.watchAlerts = (next.watchAlerts || []).map((alert) => ({
      ...alert,
      linkedCaseId: alert.linkedCaseId && remainingCases.has(alert.linkedCaseId) ? alert.linkedCaseId : null,
      linkedDecisionId: alert.linkedDecisionId && remainingDecisions.has(alert.linkedDecisionId) ? alert.linkedDecisionId : null,
    }));
    // Schema v26: a challenge whose source estimate was demo-only is derived
    // evidence about a record that no longer exists; remove it rather than
    // leaving a phantom graph node behind.
    next.forecastChallenges = (next.forecastChallenges || []).filter(
      (challenge) => remainingByType[challenge.sourceType]?.has(challenge.sourceId),
    );
    remainingByType.forecast = new Set((next.forecastChallenges || []).map((r) => r.id));
    // Schema v35: a retained leader-created premise keeps its append-only
    // evidence, but a pointer to a removed demo decision or evidence source is
    // scrubbed rather than left as a phantom graph edge.
    next.premises = (next.premises || []).map((premise) => ({
      ...premise,
      decisionId: premise.decisionId && remainingDecisions.has(premise.decisionId) ? premise.decisionId : null,
      ownerId: premise.ownerId && remainingPeople.has(premise.ownerId) ? premise.ownerId : null,
      sourceRefs: (premise.sourceRefs || []).filter((ref) => ref
        && remainingByType[ref.sourceType]?.has(ref.sourceId)),
    }));
    next.negotiations = (next.negotiations || []).map((neg) =>
      (neg.sourceType && neg.sourceId && !remainingByType[neg.sourceType]?.has(neg.sourceId)
        ? { ...neg, sourceType: null, sourceId: null }
        : neg),
    );
    // A retained user budget keeps its amounts when demo records vanish; only
    // dead owner/source pointers are cleared, mirroring negotiations above.
    next.budgets = (next.budgets || []).map((bud) => ({
      ...bud,
      ownerId: bud.ownerId && remainingPeople.has(bud.ownerId) ? bud.ownerId : null,
      lines: Array.isArray(bud.lines)
        ? bud.lines.map((line) => ({
            ...line,
            ownerId: line.ownerId && remainingPeople.has(line.ownerId) ? line.ownerId : null,
            ...(line.sourceType && line.sourceId && !remainingByType[line.sourceType]?.has(line.sourceId)
              ? { sourceType: null, sourceId: null }
              : {}),
          }))
        : [],
    }));
    // Retained register records keep their assessments; only dead roster and
    // alliance pointers are scrubbed when demo people/records are removed.
    next.stakeholders = (next.stakeholders || []).map((stk) => ({
      ...stk,
      personId: stk.personId && remainingPeople.has(stk.personId) ? stk.personId : null,
      alliances: (stk.alliances || []).filter((edge) => edge && remainingStakeholders.has(edge.targetId)),
    }));
    // Schema v30: retained user war-room games keep their players, payoffs,
    // estimates and derived verdicts; scrub only pointers to removed demo
    // records so no dangling case/decision/stakeholder reference survives.
    next.powerGames = (next.powerGames || []).map((g) => ({
      ...g,
      players: (g.players || []).map((pl) => ({
        ...pl,
        personId: pl.personId && remainingPeople.has(pl.personId) ? pl.personId : null,
        stakeholderId: pl.stakeholderId && remainingStakeholders.has(pl.stakeholderId) ? pl.stakeholderId : null,
      })),
      ownerId: g.ownerId && remainingPeople.has(g.ownerId) ? g.ownerId : null,
      linkedCaseId: g.linkedCaseId && remainingCases.has(g.linkedCaseId) ? g.linkedCaseId : null,
      linkedDecisionId: g.linkedDecisionId && remainingDecisions.has(g.linkedDecisionId) ? g.linkedDecisionId : null,
      linkedNegotiationId: g.linkedNegotiationId && remainingNegotiations.has(g.linkedNegotiationId) ? g.linkedNegotiationId : null,
      linkedStakeholderIds: (g.linkedStakeholderIds || []).filter((sid) => remainingStakeholders.has(sid)),
      linkedGoalIds: (g.linkedGoalIds || []).filter((gid) => remainingGoals.has(gid)),
    }));
    next.strategyTags = (next.strategyTags || []).filter((tag) => tag
      && remainingByType.strategy.has(tag.betId)
      && remainingByType[tag.entityType]?.has(tag.entityId));
    // Schema v43: a retained review keeps its own answers and its lessons' state
    // — that thinking is still evidence about this team — but an owner pointer
    // to a removed person is scrubbed and a detached review stays detached. A
    // review is never deleted merely because the demo record it cites has
    // disappeared: that would delete the leader's own conclusion.
    next.retros = (next.retros || []).map((retro) => ({
      ...retro,
      participants: (retro.participants || []).filter((pid) => remainingPeople.has(pid)),
      lessons: (retro.lessons || []).map((lesson) => ({
        ...lesson,
        ownerId: lesson.ownerId && remainingPeople.has(lesson.ownerId) ? lesson.ownerId : null,
      })),
    }));
    next.links = (next.links || []).filter(
      (lnk) => remainingByType[lnk.sourceType]?.has(lnk.sourceId) && remainingByType[lnk.targetType]?.has(lnk.targetId),
    );
    // Keep successful trace history, but redact the typed pointers to demo rows
    // that this operation just removed. This avoids stale links without erasing
    // the fact that a rule ran or the changes it made in real modules.
    next.propagationLineage = scrubPropagationLineageReferences(next.propagationLineage, (type, id) => {
      if (typeof id !== 'string') return false;
      if (remainingByType[type]) return !remainingByType[type].has(id);
      return id.includes('-demo-');
    });
    // A portfolio item that pointed at a fabricated demo case/goal must not keep
    // claiming provenance it can no longer prove; it becomes manual work.
    next.portfolio = (next.portfolio || []).map((item) =>
      (item.sourceType !== 'manual' && item.sourceId && !remainingByType[item.sourceType]?.has(item.sourceId)
        ? { ...item, sourceType: 'manual', sourceId: null }
        : item),
    );
    // The event log is retained history and is intentionally not rewritten by demo cleanup.
    next.meta.isDemo = false;
    next.meta.revision = (next.meta.revision || 0) + 1;
    next.meta.updatedAt = now().toISOString();
    persist(next);
    state = next;
    warnings = [];
    notify('clear-demo');
    return state;
  }

  /* ----------------------------------------------------------------- vault */
  /*  Encryption is opt-in. Everything above behaves exactly as before when it
   *  is off: same synchronous writes, same messages, same tests.             */

  function isVaultProblem() {
    return Boolean(locked || (vaultHeader && !vaultKey));
  }

  /** Non-secret facts for the UI. Never exposes the salt, key or plaintext. */
  function vaultFacts() {
    if (!vaultHeader) return null;
    return {
      iterations: vaultHeader.iterations,
      createdAt: vaultHeader.createdAt,
      unlocked: Boolean(vaultKey),
      locked: Boolean(locked),
    };
  }

  /**
   * Open an encrypted workspace with its passphrase. On any failure the stored
   * ciphertext is left byte-for-byte untouched and the session stays locked.
   */
  async function unlock(passphrase) {
    if (!vaultHeader) return { ok: false, error: 'This workspace is not encrypted, so there is nothing to unlock.' };
    if (vaultKey) return { ok: true, alreadyUnlocked: true };
    if (!cryptoAvailable(cryptoRef)) return { ok: false, reason: 'no-crypto', error: NO_CRYPTO_MESSAGE };
    const { raw, error } = readRaw();
    if (error) return { ok: false, error };
    if (!raw) return { ok: false, error: 'The saved workspace has disappeared from this browser. Import a backup to restore it.' };
    let envelope;
    try {
      envelope = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'The saved workspace is not readable JSON, so it cannot be decrypted. Export it and keep the file before doing anything else.' };
    }
    if (!isVaultEnvelope(envelope)) {
      return {
        ok: false,
        error: 'The saved workspace is no longer an encrypted file — another tab or program may have replaced it. Reload the page before continuing.',
      };
    }
    if (envelope.purpose !== PURPOSE_WORKSPACE) {
      return {
        ok: false,
        reason: 'not-a-workspace',
        error: 'This is an encrypted backup, not a workspace. Open it with Restore a backup below so its records are imported properly.',
      };
    }
    const opened = await openEnvelope({ envelope, passphrase, cryptoRef, minIterations: minKdfIterations });
    if (!opened.ok) return { ok: false, reason: opened.reason, error: opened.error };
    let parsed;
    try {
      parsed = JSON.parse(opened.text);
    } catch {
      return { ok: false, error: 'The passphrase worked, but the decrypted contents are not valid JSON. Nothing was changed.' };
    }
    if (parsed && typeof parsed === 'object' && parsed.app === 'LeadOS' && parsed.state) {
      return {
        ok: false,
        reason: 'not-a-workspace',
        error: 'That file is a LeadOS export, not a workspace. Restore it with Restore a backup below so its records are imported properly.',
      };
    }
    const unsupported = schemaProblem(parsed);
    if (unsupported) return { ok: false, reason: 'unsupported-schema', error: unsupported };
    const { raw: migrated, applied } = migrate(parsed);
    const result = normalizeState(migrated, { now: now() });
    vaultKey = opened.key;
    vaultHeader = { salt: opened.kdf.salt, iterations: opened.kdf.iterations, createdAt: opened.createdAt };
    locked = false;
    lockedRaw = null;
    writeBlockReason = null;
    persistError = null;
    state = result.state;
    warnings = result.warnings.slice();
    if (applied.length) warnings.push(`Migrated saved data: ${applied.join(', ')}`);
    notify('unlocked');
    return { ok: true, warnings };
  }

  /**
   * Drop the derived key and the plaintext state from this session.
   * Any queued save is completed first, so locking cannot lose an edit.
   */
  async function lock() {
    if (!vaultKey) return { ok: false, error: 'This workspace is not encrypted, so there is nothing to lock.' };
    await saveChain;
    const { raw, error } = readRaw();
    if (error) return { ok: false, error };
    let envelope = null;
    try {
      envelope = raw ? JSON.parse(raw) : null;
    } catch {
      envelope = null;
    }
    if (!isVaultEnvelope(envelope)) {
      return { ok: false, error: 'The workspace could not be verified as encrypted on disk, so it was left unlocked rather than hiding data that is not protected.' };
    }
    vaultHeader = describeEnvelope(envelope);
    vaultKey = null;
    locked = true;
    lockedRaw = raw;
    writeBlockReason = LOCKED_MESSAGE;
    persistError = null;
    state = createEmptyState(now().toISOString());
    warnings = [];
    notify('locked');
    return { ok: true };
  }

  /**
   * Turn on encryption. The order matters: derive, encrypt, decrypt-verify, then
   * overwrite. A failure at any step leaves the plaintext workspace untouched
   * and encryption off.
   */
  async function enableEncryption(passphrase) {
    const policy = validatePassphrase(passphrase);
    if (!policy.ok) return { ok: false, field: 'passphrase', error: policy.error };
    if (!cryptoAvailable(cryptoRef)) return { ok: false, error: NO_CRYPTO_MESSAGE };
    if (vaultHeader) return { ok: false, error: 'This workspace is already encrypted.' };
    if (writeBlockReason) return { ok: false, error: writeBlockReason };
    if (!storage) return { ok: false, error: 'No storage is available, so encryption could not be enabled safely.' };
    await saveChain;
    const next = JSON.parse(JSON.stringify(state));
    next.meta.revision = (next.meta.revision || 0) + 1;
    next.meta.updatedAt = now().toISOString();
    logEvent(next, {
      type: 'privacy.encryption-enabled',
      entity: 'workspace',
      summary: 'Workspace storage encrypted with a passphrase',
    });
    const salt = newSalt(cryptoRef);
    let derived;
    try {
      derived = await deriveKey({ passphrase, salt, iterations: kdfIterations, cryptoRef });
    } catch (err) {
      return { ok: false, error: `Could not derive an encryption key: ${(err && err.message) || err}` };
    }
    let envelope;
    try {
      envelope = await sealText({
        text: JSON.stringify(next),
        key: derived,
        cryptoRef,
        salt,
        iterations: kdfIterations,
        purpose: PURPOSE_WORKSPACE,
        createdAt: now().toISOString(),
      });
      const verified = await verifyEnvelope({ envelope, key: derived, cryptoRef, expectedText: JSON.stringify(next) });
      if (!verified.ok) return { ok: false, error: verified.error };
      storage.setItem(key, JSON.stringify(envelope));
    } catch (err) {
      return { ok: false, error: saveErrorMessage(err) };
    }
    vaultKey = derived;
    vaultHeader = { salt, iterations: kdfIterations, createdAt: envelope.createdAt };
    locked = false;
    lockedRaw = null;
    writeBlockReason = null;
    persistError = null;
    state = next;
    warnings = [];
    notify('encryption-enabled');
    return { ok: true };
  }

  /**
   * Replace the passphrase. Requires the workspace to be open (you must already
   * have proven you can decrypt it). New salt, new key, verified before writing.
   */
  async function changePassphrase(passphrase) {
    const policy = validatePassphrase(passphrase);
    if (!policy.ok) return { ok: false, field: 'passphrase', error: policy.error };
    if (!vaultKey || !vaultHeader) return { ok: false, error: 'Unlock the workspace before changing its passphrase.' };
    if (!cryptoAvailable(cryptoRef)) return { ok: false, error: NO_CRYPTO_MESSAGE };
    await saveChain;
    const next = JSON.parse(JSON.stringify(state));
    next.meta.revision = (next.meta.revision || 0) + 1;
    next.meta.updatedAt = now().toISOString();
    logEvent(next, {
      type: 'privacy.passphrase-changed',
      entity: 'workspace',
      summary: 'Workspace passphrase changed; the previous passphrase no longer decrypts this browser copy',
    });
    const salt = newSalt(cryptoRef);
    let derived;
    try {
      derived = await deriveKey({ passphrase, salt, iterations: kdfIterations, cryptoRef });
    } catch (err) {
      return { ok: false, error: `Could not derive an encryption key: ${(err && err.message) || err}` };
    }
    let envelope;
    try {
      envelope = await sealText({
        text: JSON.stringify(next),
        key: derived,
        cryptoRef,
        salt,
        iterations: kdfIterations,
        purpose: PURPOSE_WORKSPACE,
        createdAt: now().toISOString(),
      });
      const verified = await verifyEnvelope({ envelope, key: derived, cryptoRef, expectedText: JSON.stringify(next) });
      if (!verified.ok) return { ok: false, error: verified.error };
      storage.setItem(key, JSON.stringify(envelope));
    } catch (err) {
      return { ok: false, error: saveErrorMessage(err) };
    }
    vaultKey = derived;
    vaultHeader = { salt, iterations: kdfIterations, createdAt: envelope.createdAt };
    state = next;
    persistError = null;
    warnings = [];
    notify('passphrase-changed');
    return { ok: true };
  }

  /** Write the workspace back as plain text and stop encrypting future writes. */
  async function disableEncryption() {
    if (!vaultKey || !vaultHeader) return { ok: false, error: 'Unlock the workspace before turning its encryption off.' };
    await saveChain;
    const next = JSON.parse(JSON.stringify(state));
    next.meta.revision = (next.meta.revision || 0) + 1;
    next.meta.updatedAt = now().toISOString();
    logEvent(next, {
      type: 'privacy.encryption-disabled',
      entity: 'workspace',
      summary: 'Workspace encryption turned off; this browser now stores it as plain text',
    });
    const saved = await persistAwaited(next, { replaceProtected: true, vault: null });
    if (!saved) return { ok: false, error: persistError || 'Could not write the plain-text workspace to storage.' };
    vaultKey = null;
    vaultHeader = null;
    locked = false;
    lockedRaw = null;
    state = next;
    warnings = [];
    notify('encryption-disabled');
    return { ok: true };
  }

  /**
   * A passphrase-protected backup file.
   * While the workspace is encrypted this needs no passphrase: the backup is
   * sealed with the key already derived from the workspace passphrase, so the
   * same passphrase opens it later. With `redactConflicts` the sealed copy is
   * an operational copy — the redaction happens before sealing, so the omitted
   * records are absent from the ciphertext too, not merely hidden.
   */
  async function exportEncrypted(
    passphrase,
    {
      redactConflicts = false,
      pruneOverdueCandidates = false,
      redactStakeholderStances = false,
    } = {},
  ) {
    if (isVaultProblem()) {
      return { ok: false, error: 'This workspace is locked. Export JSON gives you the untouched encrypted file; unlock first to make a new encrypted backup.' };
    }
    let useVault = activeVault();
    if (!useVault) {
      if (!passphrase) return { ok: false, reason: 'passphrase-required', error: 'Choose a passphrase for this encrypted backup.' };
      const policy = validatePassphrase(passphrase);
      if (!policy.ok) return { ok: false, field: 'passphrase', error: policy.error };
      if (!cryptoAvailable(cryptoRef)) return { ok: false, error: NO_CRYPTO_MESSAGE };
      const salt = newSalt(cryptoRef);
      try {
        useVault = {
          key: await deriveKey({ passphrase, salt, iterations: kdfIterations, cryptoRef }),
          salt,
          iterations: kdfIterations,
          createdAt: now().toISOString(),
        };
      } catch (err) {
        return { ok: false, error: `Could not derive an encryption key: ${(err && err.message) || err}` };
      }
    }
    const nowAt = now();
    const anyRedaction = Boolean(redactConflicts || pruneOverdueCandidates || redactStakeholderStances);
    const { wrapper, omitted } = buildExportWrapper(state, {
      exportedAt: nowAt.toISOString(),
      redactConflicts: Boolean(redactConflicts),
      pruneOverdueCandidates: Boolean(pruneOverdueCandidates),
      redactStakeholderStances: Boolean(redactStakeholderStances),
      nowDate: nowAt,
    });
    const wrapperText = JSON.stringify(wrapper);
    try {
      const envelope = await sealText({
        text: wrapperText,
        key: useVault.key,
        cryptoRef,
        salt: useVault.salt,
        iterations: useVault.iterations,
        purpose: PURPOSE_EXPORT,
        createdAt: useVault.createdAt || nowAt.toISOString(),
      });
      return { ok: true, json: JSON.stringify(envelope, null, 2), ...(anyRedaction ? { omitted } : {}) };
    } catch (err) {
      return { ok: false, error: `Could not encrypt this backup: ${(err && err.message) || err}` };
    }
  }

  /**
   * Import either a plain-text or an encrypted backup, waiting for the write to
   * land before adopting anything. Mode changes are committed only on success.
   *
   * Options:
   *  - passphrase: required when the file is encrypted
   *  - replaceLocked: required to import at all while this workspace is locked
   *  - replacePlaintext: required to overwrite an unreadable encrypted workspace
   *    with a plain-text file (that destroys the only copy of the ciphertext)
   *  - replaceWithRedacted: required before an operational copy may replace
   *    conflict records stored here (see `redactionReplacementBlock`)
   */
  async function importBackup(text, options = {}) {
    const { passphrase = null, replaceLocked = false, replacePlaintext = false, replaceWithRedacted = false } = options;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: 'That file is not valid JSON.' };
    }
    if (isVaultProblem() && !replaceLocked) {
      return {
        ok: false,
        reason: 'locked',
        error: 'This workspace is encrypted and locked. Confirm replacing it before importing over the encrypted data.',
      };
    }
    let candidateText = text;
    let importedVault = null;
    if (isVaultEnvelope(parsed)) {
      if (!passphrase) {
        return { ok: false, reason: 'passphrase-required', error: 'This is an encrypted backup. Enter its passphrase to import it.' };
      }
      const opened = await openEnvelope({ envelope: parsed, passphrase, cryptoRef, minIterations: minKdfIterations });
      if (!opened.ok) return { ok: false, reason: opened.reason, error: opened.error };
      candidateText = opened.text;
      importedVault = {
        key: opened.key,
        salt: opened.kdf.salt,
        iterations: opened.kdf.iterations,
        createdAt: opened.createdAt,
      };
    }
    const result = parseImport(candidateText);
    if (!result.ok) return result;
    const block = redactionReplacementBlock(result, replaceWithRedacted);
    if (block) return block;

    const currentVault = activeVault();
    let targetVault = currentVault;
    let modeNote = null;
    if (!currentVault) {
      if (importedVault && !isVaultProblem()) {
        targetVault = null;
        modeNote = 'That backup was encrypted, but this workspace is not, so the imported records are now stored unencrypted in this browser.';
      } else if (importedVault) {
        targetVault = importedVault;
      } else if (isVaultProblem() && !replacePlaintext) {
        return {
          ok: false,
          reason: 'plaintext-over-locked',
          error: 'This workspace is encrypted and locked, and that backup is not encrypted. Importing it would delete the encrypted records. Confirm the replacement first.',
        };
      } else if (isVaultProblem()) {
        targetVault = null;
        modeNote = 'The encrypted workspace was replaced by a plain-text backup, so it is now stored unencrypted in this browser.';
      }
    }

    const saved = await persistAwaited(result.state, { replaceProtected: true, vault: targetVault });
    if (!saved) return { ok: false, error: persistError || 'Could not write the imported data to storage.' };

    vaultKey = targetVault ? targetVault.key : null;
    vaultHeader = targetVault
      ? { salt: targetVault.salt, iterations: targetVault.iterations, createdAt: targetVault.createdAt }
      : null;
    locked = false;
    lockedRaw = null;
    writeBlockReason = null;
    persistError = null;
    state = result.state;
    warnings = result.warnings.slice();
    if (result.applied && result.applied.length) warnings.push(`Migrated imported data: ${result.applied.join(', ')}`);
    if (modeNote) warnings.push(modeNote);
    if (result.redacted) warnings.push(redactionWarning(result.redacted));
    notify('import');
    return {
      ok: true,
      imported: {
        people: state.people.length,
        events: state.events.length,
        isDemo: state.meta.isDemo,
      },
      warnings,
      redacted: result.redacted || null,
    };
  }

  return {
    get state() {
      return state;
    },
    get warnings() {
      return warnings;
    },
    get persistError() {
      return persistError;
    },
    /** Propagations from the post-commit rules of the most recent update. */
    get lastPropagations() {
      return lastPropagations;
    },
    /** ADR-0026: measured cost/outcome of the last rule chain. Not persisted. */
    get lastPropagationMetrics() {
      return lastPropagationMetrics;
    },
    /** Test seam: replay a stale metrics snapshot without a real write. */
    set lastPropagationMetrics(value) {
      lastPropagationMetrics = value;
    },
    get writeBlockReason() {
      return writeBlockReason;
    },
    get isLoaded() {
      return loaded;
    },
    /** True when storage holds ciphertext this session has not opened. */
    get isLocked() {
      return Boolean(locked);
    },
    /** True when this workspace is (or should be) stored encrypted. */
    get isEncrypted() {
      return Boolean(vaultHeader);
    },
    /** Non-secret encryption facts for the UI, or null when not encrypted. */
    get vaultFacts() {
      return vaultFacts();
    },
    /** False in a non-secure context (plain http) or a browser without Web Crypto. */
    get cryptoAvailable() {
      return cryptoAvailable(cryptoRef);
    },
    /** 'plain' | 'locked' | 'unsupported' — drives the lock screen's options. */
    get vaultStatus() {
      if (!vaultHeader) return 'plain';
      return vaultUnsupported ? 'unsupported' : 'locked';
    },
    get storageKey() {
      return key;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    load,
    update,
    importJSON,
    exportJSON,
    exportRedactedJSON,
    exportCSV,
    reset,
    seedDemo,
    clearDemo,
    hasRealData,
    flush,
    unlock,
    lock,
    enableEncryption,
    changePassphrase,
    disableEncryption,
    exportEncrypted,
    importBackup,
    /** Public for tests: expose the current storage key's raw size in bytes. */
    sizeBytes() {
      try {
        return storage ? (storage.getItem(key) || '').length : 0;
      } catch {
        return 0;
      }
    },
  };
}
