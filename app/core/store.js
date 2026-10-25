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

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION, COLLECTIONS } from './schema.js';
import { buildDemoState } from './demo.js';
import { exportWorkspaceCsv } from './csv.js';
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

export const STORAGE_KEY = 'leados.lifecycle.v1';
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

/** Deep-copy a state with the conflict collection and its log traces removed. */
function redactStateForExport(source) {
  const copy = JSON.parse(JSON.stringify(source));
  const conflictRecordsOmitted = Array.isArray(copy.conflicts) ? copy.conflicts.length : 0;
  const events = Array.isArray(copy.events) ? copy.events : [];
  const keptEvents = events.filter((event) => !isConflictEvent(event));
  copy.conflicts = [];
  copy.events = keptEvents;
  return {
    state: copy,
    omitted: { conflictRecordsOmitted, conflictEventsOmitted: events.length - keptEvents.length },
  };
}

/**
 * The one export envelope every JSON backup shares. Only the operational
 * variant carries a `redactions` marker, and that marker is the file's own
 * declaration that it is knowingly incomplete — the import path reads it to
 * warn (and, where the cost is real, to refuse) rather than guess.
 */
function buildExportWrapper(source, { exportedAt, redactConflicts = false } = {}) {
  const wrapper = { app: 'LeadOS', schemaVersion: SCHEMA_VERSION, exportedAt, state: source };
  if (!redactConflicts) return { wrapper, omitted: null };
  const { state: redacted, omitted } = redactStateForExport(source);
  wrapper.state = redacted;
  wrapper.redactions = { conflicts: true, ...omitted };
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
  if (!marker || typeof marker !== 'object' || marker.conflicts !== true) return null;
  const count = (value) => (Number.isInteger(value) && value >= 0 ? value : 0);
  return {
    conflictRecordsOmitted: count(marker.conflictRecordsOmitted),
    conflictEventsOmitted: count(marker.conflictEventsOmitted),
  };
}

function redactionWarning(redacted) {
  const records = redacted.conflictRecordsOmitted;
  const events = redacted.conflictEventsOmitted;
  if (records === 0 && events === 0) {
    return 'That file was exported as an operational copy, but the workspace it came from had no conflict records or conflict events to leave out, so it is complete.';
  }
  return `That file was exported as an operational copy without its confidential conflict records: ${records} conflict record${records === 1 ? '' : 's'} and ${events} conflict event${events === 1 ? '' : 's'} were left out of the file and have not been imported. A full backup is needed to restore them.`;
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
  const listeners = new Set();

  let state = createEmptyState(now().toISOString());
  let warnings = [];
  let persistError = null;
  let loaded = false;
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
  function update(mutator, event) {
    if (writeBlockReason) { persistError = writeBlockReason; notify('update-blocked'); return state; }
    const draft = JSON.parse(JSON.stringify(state));
    draft.meta.revision = (draft.meta.revision || 0) + 1;
    draft.meta.updatedAt = now().toISOString();
    mutator(draft, { logEvent: (entry) => logEvent(draft, entry) });
    if (event) logEvent(draft, event);
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
    if (replaceWithRedacted || !result.redacted || result.redacted.conflictRecordsOmitted === 0) return null;
    const here = (state.conflicts || []).length;
    if (here === 0) return null;
    const omitted = result.redacted.conflictRecordsOmitted;
    return {
      ok: false,
      reason: 'redacted-replacement',
      redacted: result.redacted,
      currentConflicts: here,
      error: `That file is an operational copy: it was exported without its ${omitted} confidential conflict record${omitted === 1 ? '' : 's'}. Importing it here would delete the ${here} conflict record${here === 1 ? '' : 's'} stored in this browser. Import a full backup instead, or confirm that you meant to replace them.`,
    };
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
  function exportCSV(scope) {
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
    return exportWorkspaceCsv(state, scope, { now: now() });
  }

  /**
   * Operational JSON copy for moving records between devices or sharing them
   * upwards: everything a full backup has, except the confidential conflict
   * records and their event-log traces, whose omission is declared (counts
   * only) inside the file. Refuses wherever the workspace cannot be read —
   * handing back ciphertext or an untouched original labelled "redacted"
   * would destroy the very guarantee the copy exists to make.
   */
  function exportRedactedJSON() {
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
    const { wrapper, omitted } = buildExportWrapper(state, {
      exportedAt: now().toISOString(),
      redactConflicts: true,
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
    const remainingByType = {
      case: new Set((next.cases || []).map((r) => r.id)),
      decision: new Set((next.decisions || []).map((r) => r.id)),
      delegation: new Set((next.delegations || []).map((r) => r.id)),
      goal: remainingGoals,
      growth: new Set((next.growthPlans || []).map((r) => r.id)),
      person: remainingPeople,
      oneonone: new Set((next.oneOnOnes || []).map((r) => r.id)),
      feedback: new Set((next.feedback || []).map((r) => r.id)),
      onboarding: new Set((next.onboarding || []).map((r) => r.id)),
      review: new Set((next.reviews || []).map((r) => r.id)),
      readiness: new Set((next.readiness || []).map((r) => r.id)),
      recognition: new Set((next.recognition || []).map((r) => r.id)),
      portfolio: new Set((next.portfolio || []).map((r) => r.id)),
    };
    next.links = (next.links || []).filter(
      (lnk) => remainingByType[lnk.sourceType]?.has(lnk.sourceId) && remainingByType[lnk.targetType]?.has(lnk.targetId),
    );
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
  async function exportEncrypted(passphrase, { redactConflicts = false } = {}) {
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
    const { wrapper, omitted } = buildExportWrapper(state, {
      exportedAt: now().toISOString(),
      redactConflicts,
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
        createdAt: useVault.createdAt || now().toISOString(),
      });
      return { ok: true, json: JSON.stringify(envelope, null, 2), ...(redactConflicts ? { omitted } : {}) };
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
