/**
 * Operational (conflict-redacted) JSON export tests.
 *
 * The operational copy exists so a leader can move or share records without
 * the confidential conflict material in the file. These tests assert both
 * directions of the guarantee: the file really is conflict-free (records and
 * their event-log traces), and a file that declares omissions cannot
 * silently overwrite conflict records that already live in a browser.
 *
 * Conventions mirror conflicts.test.mjs (harness, jsdom boot) and
 * encryption.test.mjs (injected WebCrypto, lowered KDF iterations).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createEmptyState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { closeAllModals } from '../../app/ui/dom.js';

const NOW = new Date('2026-10-25T10:00:00Z');
const TODAY = '2026-10-25';
const PASS = 'correct horse battery';
const KDF = { crypto: webcrypto, kdfIterations: 1000, minKdfIterations: 10 };
const HTML = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const AXE_SRC = fs.readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

function harness(storage = memoryStorage()) {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-test-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory, ...KDF });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }), storage };
}

function conflictInput(overrides = {}) {
  return {
    title: 'Handoff expectations',
    summary: 'Two colleagues disagree about the review handoff and both lose time.',
    coordinator: 'Manager',
    openedOn: '2026-10-20',
    nextFollowUpOn: TODAY,
    safety: 'ordinary',
    process: 'Hear each person separately, then a voluntary joint conversation with equal airtime.',
    sharing: 'Only the agreed commitments may be shared with the delivery team.',
    participants: [
      { name: 'Avery Lane', perspective: 'Late changes arrive after review.', interest: 'Enough time to check quality.', participation: 'willing' },
      { name: 'Blair Rowe', perspective: 'Requirements change after customer calls.', interest: 'A way to respond without surprising the reviewer.', participation: 'willing' },
    ],
    ...overrides,
  };
}

const isConflictEvent = (event) => event.entity === 'conflict' || String(event.type).startsWith('conflict.');

/** A workspace with one person, one conflict record and its events. */
function seededWorkspace() {
  const h = harness();
  const person = h.api.addPerson({ name: 'Priya Raman', role: 'Staff engineer' });
  assert.equal(person.ok, true, person.error);
  const conflict = h.api.addConflict(conflictInput());
  assert.equal(conflict.ok, true, conflict.error);
  const agreed = h.api.agreeConflict(conflict.id, {
    date: TODAY,
    text: 'Use a change cutoff and discuss urgent exceptions before review.',
    confirmedByAll: true,
    reviewOn: '2026-11-01',
    actions: [{ owner: 'Avery Lane', text: 'Publish the review cutoff and exception route.', dueOn: TODAY }],
  });
  assert.equal(agreed.ok, true, agreed.error);
  return h;
}

function operationalCopy(h) {
  const result = h.store.exportRedactedJSON();
  assert.equal(result.ok, true, result.error);
  return result;
}

test('operational export leaves out exactly the conflict records and their events, and changes nothing', () => {
  const h = seededWorkspace();
  const stateBefore = JSON.stringify(h.store.state);
  const storedBefore = h.storage.getItem(STORAGE_KEY);
  const conflictEvents = h.store.state.events.filter(isConflictEvent);
  const otherEvents = h.store.state.events.length - conflictEvents.length;
  assert.ok(conflictEvents.length >= 2, 'created + agreed events exist');
  assert.ok(otherEvents >= 1, 'person event exists');

  const result = operationalCopy(h);
  const file = JSON.parse(result.json);
  assert.equal(file.app, 'LeadOS');
  assert.equal(file.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(file.redactions, { conflicts: true, conflictRecordsOmitted: 1, conflictEventsOmitted: conflictEvents.length });
  assert.deepEqual(result.omitted, { conflictRecordsOmitted: 1, conflictEventsOmitted: conflictEvents.length });
  assert.deepEqual(file.state.conflicts, []);
  assert.equal(file.state.events.length, otherEvents);
  assert.ok(!file.state.events.some(isConflictEvent), 'no conflict event traces remain');
  assert.equal(file.state.people.length, 1);
  assert.equal(file.state.people[0].name, 'Priya Raman');
  assert.ok(!result.json.includes('Handoff expectations'), 'conflict title is absent');
  assert.ok(!result.json.includes('Avery Lane'), 'participant names are absent');

  // The export is read-only: the live workspace keeps its records and the
  // stored blob is byte-identical.
  assert.equal(JSON.stringify(h.store.state), stateBefore);
  assert.equal(h.storage.getItem(STORAGE_KEY), storedBefore);
  assert.equal(h.store.state.conflicts.length, 1);
});

test('the full export is unchanged: no redactions marker, conflict records and events kept', () => {
  const h = seededWorkspace();
  const file = JSON.parse(h.store.exportJSON());
  assert.equal(file.redactions, undefined);
  assert.equal(file.state.conflicts.length, 1);
  assert.equal(file.state.conflicts[0].title, 'Handoff expectations');
  assert.ok(file.state.events.some(isConflictEvent));
});

test('an operational copy imports cleanly into an empty workspace, with the omission reported', () => {
  const h = seededWorkspace();
  const copy = operationalCopy(h);
  const target = harness();
  const result = target.store.importJSON(copy.json);
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.redacted, { conflictRecordsOmitted: 1, conflictEventsOmitted: 2 });
  assert.ok(result.warnings.some((w) => w.includes('operational copy') && w.includes('have not been imported')));
  assert.equal(target.store.state.people.length, 1);
  assert.equal(target.store.state.people[0].name, 'Priya Raman');
  assert.deepEqual(target.store.state.conflicts, []);
  assert.ok(!target.store.state.events.some(isConflictEvent));
});

test('an operational copy cannot silently replace readable conflict records (importJSON)', () => {
  const source = seededWorkspace();
  const copy = operationalCopy(source);
  const target = harness();
  const own = target.api.addConflict(conflictInput({ title: 'Rota disagreement' }));
  assert.equal(own.ok, true, own.error);
  const before = JSON.stringify(target.store.state);
  const storedBefore = target.storage.getItem(STORAGE_KEY);

  const refused = target.store.importJSON(copy.json);
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'redacted-replacement');
  assert.equal(refused.currentConflicts, 1);
  assert.deepEqual(refused.redacted, { conflictRecordsOmitted: 1, conflictEventsOmitted: 2 });
  assert.ok(refused.error.includes('operational copy'));
  assert.equal(JSON.stringify(target.store.state), before, 'a refusal writes nothing');
  assert.equal(target.storage.getItem(STORAGE_KEY), storedBefore);

  const confirmed = target.store.importJSON(copy.json, { replaceWithRedacted: true });
  assert.equal(confirmed.ok, true, confirmed.error);
  assert.equal(target.store.state.people.length, 1, 'source records arrive');
  assert.deepEqual(target.store.state.conflicts, [], 'the replacement is now explicit and complete');
  assert.ok(confirmed.warnings.some((w) => w.includes('operational copy')));
});

test('the same replacement guard applies through importBackup', async () => {
  const source = seededWorkspace();
  const copy = operationalCopy(source);
  const target = harness();
  assert.equal(target.api.addConflict(conflictInput()).ok, true);
  const before = JSON.stringify(target.store.state);

  const refused = await target.store.importBackup(copy.json);
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'redacted-replacement');
  assert.equal(JSON.stringify(target.store.state), before);

  const confirmed = await target.store.importBackup(copy.json, { replaceWithRedacted: true });
  assert.equal(confirmed.ok, true, confirmed.error);
  assert.deepEqual(target.store.state.conflicts, []);
  assert.deepEqual(confirmed.redacted, { conflictRecordsOmitted: 1, conflictEventsOmitted: 2 });
});

test('an ordinary full backup still replaces without the operational-copy confirmation', () => {
  const source = seededWorkspace();
  const target = harness();
  assert.equal(target.api.addConflict(conflictInput({ title: 'Rota disagreement' })).ok, true);
  const result = target.store.importJSON(source.store.exportJSON());
  assert.equal(result.ok, true, result.error);
  assert.equal(result.redacted, null);
  assert.equal(target.store.state.conflicts.length, 1);
  assert.equal(target.store.state.conflicts[0].title, 'Handoff expectations');
});

test('an operational copy of a conflict-free workspace omits nothing and needs no replacement confirmation', () => {
  const source = harness();
  assert.equal(source.api.addPerson({ name: 'Priya Raman', role: 'Staff engineer' }).ok, true);
  const copy = operationalCopy(source);
  assert.deepEqual(copy.omitted, { conflictRecordsOmitted: 0, conflictEventsOmitted: 0 });
  assert.equal(JSON.parse(copy.json).redactions.conflictRecordsOmitted, 0);

  // Nothing was left out of this file, so it is equivalent to a full backup
  // of that workspace: ordinary replacement semantics, no special guard —
  // but the import still says what kind of file it was.
  const target = harness();
  assert.equal(target.api.addConflict(conflictInput()).ok, true);
  const result = target.store.importJSON(copy.json);
  assert.equal(result.ok, true, result.error);
  assert.ok(result.warnings.some((w) => w.includes('operational copy') && w.includes('so it is complete')));
  assert.equal(target.store.state.people.length, 1);
});

test('a malformed redactions marker is ignored rather than guessed at', () => {
  const source = seededWorkspace();
  for (const marker of [{ conflicts: 'yes' }, { conflicts: true, conflictRecordsOmitted: 'three' }]) {
    const file = JSON.parse(source.store.exportJSON());
    file.redactions = marker;
    const target = harness();
    assert.equal(target.api.addConflict(conflictInput()).ok, true);
    const result = target.store.importJSON(JSON.stringify(file));
    assert.equal(result.ok, true, result.error, 'treated as an ordinary backup, no guard fires');
    if (marker.conflicts === true) {
      assert.deepEqual(result.redacted, { conflictRecordsOmitted: 0, conflictEventsOmitted: 0 }, 'non-integer counts coerce to 0');
    } else {
      assert.equal(result.redacted, null);
    }
  }
});

test('a locked workspace refuses an operational copy; the full export still returns the untouched ciphertext', async () => {
  const h = seededWorkspace();
  const enabled = await h.store.enableEncryption(PASS);
  assert.equal(enabled.ok, true, enabled.error);
  const locked = await h.store.lock();
  assert.equal(locked.ok, true, locked.error);
  assert.equal(h.store.isLocked, true);

  const refused = h.store.exportRedactedJSON();
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'locked');
  const full = h.store.exportJSON();
  assert.ok(full.includes('leados.vault'), 'full export stays the untouched encrypted file, never a fake redaction');
  assert.ok(!full.includes('Handoff expectations'));

  const unlocked = await h.store.unlock(PASS);
  assert.equal(unlocked.ok, true, unlocked.error);
  const copy = operationalCopy(h);
  assert.deepEqual(JSON.parse(copy.json).redactions, { conflicts: true, conflictRecordsOmitted: 1, conflictEventsOmitted: 2 });
});

test('a newer-schema workspace refuses an operational copy and its original stays untouched', () => {
  const future = JSON.stringify({ ...createEmptyState(NOW.toISOString()), schemaVersion: SCHEMA_VERSION + 1 }, null, 2);
  const h = harness(memoryStorage({ [STORAGE_KEY]: future }));
  assert.ok(h.store.writeBlockReason, 'protected newer schema');
  const refused = h.store.exportRedactedJSON();
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'unsupported-schema');
  assert.equal(h.store.exportJSON(), future, 'full export returns the original bytes');
  assert.equal(h.storage.getItem(STORAGE_KEY), future);
});

test('an encrypted operational backup round-trips conflict-free and is guarded on replacement', async () => {
  const source = seededWorkspace();
  const backup = await source.store.exportEncrypted(PASS, { redactConflicts: true });
  assert.equal(backup.ok, true, backup.error);
  assert.deepEqual(backup.omitted, { conflictRecordsOmitted: 1, conflictEventsOmitted: 2 });
  assert.equal(JSON.parse(backup.json).format, 'leados.vault');
  assert.ok(!backup.json.includes('Handoff expectations'), 'no plaintext in the backup file');

  const empty = harness();
  const restored = await empty.store.importBackup(backup.json, { passphrase: PASS });
  assert.equal(restored.ok, true, restored.error);
  assert.deepEqual(restored.redacted, { conflictRecordsOmitted: 1, conflictEventsOmitted: 2 });
  assert.ok(restored.warnings.some((w) => w.includes('operational copy')));
  assert.equal(empty.store.state.people.length, 1);
  assert.deepEqual(empty.store.state.conflicts, []);

  const occupied = harness();
  assert.equal(occupied.api.addConflict(conflictInput()).ok, true);
  const before = JSON.stringify(occupied.store.state);
  const refused = await occupied.store.importBackup(backup.json, { passphrase: PASS });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'redacted-replacement');
  assert.equal(JSON.stringify(occupied.store.state), before);

  const confirmed = await occupied.store.importBackup(backup.json, { passphrase: PASS, replaceWithRedacted: true });
  assert.equal(confirmed.ok, true, confirmed.error);
  assert.deepEqual(occupied.store.state.conflicts, []);
});

/* ------------------------------------------------------------------ jsdom */

function boot(t, storageSeed = null) {
  closeAllModals();
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (error) => errors.push(error.message));
  vc.on('error', (...args) => errors.push(args.join(' ')));
  const dom = new JSDOM(HTML, { url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event', 'FileReader', 'localStorage']) {
    globalThis[key] = key === 'window' ? window : window[key];
  }
  if (storageSeed) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storageSeed));
  t.after(() => { closeAllModals(); dom.window.close(); });
  return { window, document: window.document, errors };
}

async function appFor(env) {
  const { createApp } = await import('../../app/main.js');
  let seq = 0;
  return createApp({ storage: env.window.localStorage, now: () => NOW, idFactory: (p) => `${p}-ui-${++seq}` });
}

function click(node) { assert.ok(node, 'expected an element to click'); node.click(); }
function byText(env, label, root = env.document.getElementById('view')) {
  return [...root.querySelectorAll('button, a')].find((node) => node.textContent.trim() === label);
}
const modal = (env) => env.document.querySelector('[role="dialog"]');

test('Settings offers the operational copy through the real button, the encrypted backup offers the omission, and Settings stays axe-clean', async (t) => {
  const seed = seededWorkspace();
  const rawState = JSON.parse(seed.storage.getItem(STORAGE_KEY));
  const env = boot(t, rawState);
  const app = await appFor(env);
  app.navigate('#/settings');

  // Operational export: jsdom cannot start a download, so the honest
  // fallback shows the file in a dialog — assert on its contents.
  const originalURL = globalThis.URL;
  globalThis.URL = env.window.URL;
  t.after(() => { globalThis.URL = originalURL; });
  click(byText(env, 'Export operational copy (no conflict records)'));
  const dialog = modal(env);
  assert.ok(dialog, 'fallback dialog opens');
  assert.ok(dialog.textContent.includes('1 conflict record and 2 conflict events left out'));
  const file = JSON.parse(dialog.querySelector('textarea').value);
  assert.deepEqual(file.redactions, { conflicts: true, conflictRecordsOmitted: 1, conflictEventsOmitted: 2 });
  assert.deepEqual(file.state.conflicts, []);
  assert.equal(file.state.people.length, 1);
  click(byText(env, 'Close', dialog));
  assert.equal(modal(env), null);

  // The encrypted backup dialog exposes the same omission as an explicit
  // opt-in. Submitting needs WebCrypto; the behaviour itself is covered by
  // the store-level round-trip test above.
  click(byText(env, 'Export encrypted JSON'));
  const backupDialog = modal(env);
  assert.ok(backupDialog, 'encrypted backup dialog opens');
  const checkbox = backupDialog.querySelector('[name="redactConflicts"]');
  assert.ok(checkbox && checkbox.type === 'checkbox', 'omission is an explicit checkbox');
  assert.ok(backupDialog.textContent.includes('Leave out the confidential conflict records (operational copy)'));
  click(byText(env, 'Cancel', backupDialog));
  assert.equal(modal(env), null);

  if (!env.window.axe) env.window.eval(AXE_SRC);
  const axeRes = await env.window.axe.run(env.document, { rules: { 'color-contrast': { enabled: false } } });
  assert.deepEqual(Array.from(axeRes.violations).map((v) => `${v.id}: ${v.help}`), [], 'zero axe-core violations on #/settings');
  assert.deepEqual(env.errors, []);
});
