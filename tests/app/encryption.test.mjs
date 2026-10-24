/**
 * Encryption tests — the local workspace blob, its passphrase and its exports.
 *
 * These are security-relevant, so they assert the *negative* properties too:
 * no plaintext in storage, no write while locked, no adoption when a write
 * fails, no quarantine of ciphertext, and no silent fallback to plain text.
 *
 * WebCrypto is injected because jsdom has no `crypto.subtle`. Iteration counts
 * are lowered for speed; the production default lives in `app/core/crypto.js`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createStore, STORAGE_KEY, QUARANTINE_PREFIX, LOCKED_MESSAGE } from '../../app/core/store.js';
import { createEmptyState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createApi } from '../../app/actions.js';
import {
  PASSPHRASE_MIN,
  bytesToBase64,
  describeEnvelope,
  deriveKey,
  isVaultEnvelope,
  newSalt,
  sealText,
  validatePassphrase,
} from '../../app/core/crypto.js';

const NOW = new Date('2026-10-24T10:00:00.000Z');
const P12 = 'correct horse battery';
const P12_B = 'different passphrase 42';
const KDF = { crypto: webcrypto, kdfIterations: 1000, minKdfIterations: 10 };

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    dump: () => new Map(data),
    keys: () => [...data.keys()],
  };
}

function makeStore(storage = memoryStorage()) {
  const store = createStore({ storage, now: () => NOW, ...KDF });
  store.load();
  return { storage, store };
}

function seededPerson(store, api, name = 'Priya Raman') {
  const result = api.addPerson({ name, role: 'Staff engineer' });
  assert.equal(result.ok, true, result.error);
  return result.id;
}

/** Build a stored ciphertext blob directly, for tests that need a locked start. */
async function vaultBlob(state, passphrase = P12, { iterations = 1000, purpose = 'workspace' } = {}) {
  const salt = newSalt(webcrypto);
  const key = await deriveKey({ passphrase, salt, iterations, cryptoRef: webcrypto });
  return JSON.stringify(
    await sealText({
      text: JSON.stringify(state),
      key,
      cryptoRef: webcrypto,
      salt,
      iterations,
      purpose,
      createdAt: NOW.toISOString(),
    }),
  );
}

function demoStateWith(name = 'Rowan Vale') {
  const state = createEmptyState(NOW.toISOString());
  state.people.push({ id: 'p-known', name, role: 'Analyst', level: 'ic', team: 'Data', status: 'active', createdAt: NOW.toISOString() });
  return state;
}

/* ------------------------------------------------------------- passphrase */

test('passphrase policy rejects short, padded and trivial passphrases before any key work', () => {
  assert.equal(validatePassphrase('').ok, false);
  assert.equal(validatePassphrase('short').ok, false);
  assert.match(validatePassphrase('a'.repeat(PASSPHRASE_MIN)).error, /different characters/);
  assert.match(validatePassphrase(' correct horse battery ').error, /leading or trailing space/);
  assert.equal(validatePassphrase(P12).ok, true);
  assert.equal(validatePassphrase('x'.repeat(2000)).ok, false);
});

/* ------------------------------------------------------- enable / unlock */

test('enabling encryption stores ciphertext only, and a reload can unlock the same records', async () => {
  const { storage, store } = makeStore();
  const api = createApi(store, { now: () => NOW });
  seededPerson(store, api, 'Priya Raman');
  api.addFeedback({ personId: store.state.people[0].id, direction: 'given', kind: 'praise', situation: 'Release review', behavior: 'Walked the new hire through the deploy', impact: 'She shipped alone the next day' });

  const enabled = await store.enableEncryption(P12);
  assert.equal(enabled.ok, true, enabled.error);
  assert.equal(store.isEncrypted, true);
  assert.equal(store.isLocked, false);

  const raw = storage.getItem(STORAGE_KEY);
  assert.ok(isVaultEnvelope(JSON.parse(raw)), 'storage should hold a vault envelope');
  assert.equal(raw.includes('Priya'), false, 'no person name may survive in the stored blob');
  assert.equal(raw.includes('Walked the new hire'), false, 'no free-text note may survive in the stored blob');
  assert.equal(raw.includes(P12), false, 'the passphrase must never be stored');

  // A fresh session (same storage, new store) starts locked and refuses writes.
  const reload = makeStore(storage);
  assert.equal(reload.store.isLocked, true);
  assert.equal(reload.store.vaultStatus, 'locked');
  const blocked = createApi(reload.store, { now: () => NOW }).addPerson({ name: 'Should not save' });
  assert.equal(blocked.ok, false);
  assert.equal(storage.getItem(STORAGE_KEY), raw, 'a blocked write must not touch the ciphertext');

  const wrong = await reload.store.unlock('not the passphrase');
  assert.equal(wrong.ok, false);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  assert.equal(reload.store.isLocked, true);

  const opened = await reload.store.unlock(P12);
  assert.equal(opened.ok, true, opened.error);
  assert.equal(reload.store.isLocked, false);
  assert.equal(reload.store.state.people[0].name, 'Priya Raman');
  assert.equal(reload.store.state.feedback.length, 1);

  // Writes after unlock are queued and must land before flush resolves.
  reload.store.update((draft) => draft.settings.teamName = 'Platform', { type: 'settings.updated' });
  await reload.store.flush();
  const afterReload = makeStore(storage);
  const reopened = await afterReload.store.unlock(P12);
  assert.equal(reopened.ok, true, reopened.error);
  assert.equal(afterReload.store.state.settings.teamName, 'Platform');
});

test('a failed storage write leaves a plain-text workspace unencrypted and untouched', async () => {
  const { storage, store } = makeStore();
  const api = createApi(store, { now: () => NOW });
  seededPerson(store, api, 'Mina Sol');
  const before = storage.getItem(STORAGE_KEY);
  const setItem = storage.setItem;
  storage.setItem = () => {
    const err = new Error('quota');
    err.name = 'QuotaExceededError';
    throw err;
  };
  const result = await store.enableEncryption(P12);
  assert.equal(result.ok, false);
  assert.match(result.error, /storage is full/i);
  assert.equal(store.isEncrypted, false);
  assert.equal(storage.getItem(STORAGE_KEY), before, 'the plain-text blob must be exactly as it was');
  storage.setItem = setItem;
  assert.equal(store.state.people[0].name, 'Mina Sol');
});

test('change passphrase re-keys the workspace: the old passphrase stops working', async () => {
  const { storage, store } = makeStore();
  seededPerson(store, createApi(store, { now: () => NOW }), 'Ana Gutierrez');
  assert.equal((await store.enableEncryption(P12)).ok, true);
  const before = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal(describeEnvelope(before).iterations, 1000);

  const changed = await store.changePassphrase(P12_B);
  assert.equal(changed.ok, true, changed.error);
  const after = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.notEqual(after.kdf.salt, before.kdf.salt, 'a new passphrase gets a new salt');
  assert.notEqual(after.iv, before.iv);

  const oldAttempt = makeStore(storage);
  assert.equal((await oldAttempt.store.unlock(P12)).ok, false, 'the previous passphrase must not open the re-keyed blob');
  const okAttempt = makeStore(storage);
  const opened = await okAttempt.store.unlock(P12_B);
  assert.equal(opened.ok, true, opened.error);
  assert.equal(okAttempt.store.state.people[0].name, 'Ana Gutierrez');
});

test('turning encryption off writes plain text again and keeps every record', async () => {
  const { storage, store } = makeStore();
  const api = createApi(store, { now: () => NOW });
  seededPerson(store, api, 'Tobias Lund');
  assert.equal((await store.enableEncryption(P12)).ok, true);
  const disabled = await store.disableEncryption();
  assert.equal(disabled.ok, true, disabled.error);
  assert.equal(store.isEncrypted, false);
  const raw = storage.getItem(STORAGE_KEY);
  assert.equal(isVaultEnvelope(JSON.parse(raw)), false);
  assert.ok(raw.includes('Tobias Lund'));
  const reload = makeStore(storage);
  assert.equal(reload.store.isLocked, false);
  assert.equal(reload.store.state.people[0].name, 'Tobias Lund');
  assert.equal(reload.store.state.events.some((event) => event.type === 'privacy.encryption-enabled'), true, 'the audit log records the change');
  assert.equal(reload.store.state.events.some((event) => event.type === 'privacy.encryption-disabled'), true);
});

/* ------------------------------------------------------------- locking */

test('a locked workspace refuses every write path and never quarantines its ciphertext', async () => {
  const state = demoStateWith();
  const blob = await vaultBlob(state);
  const storage = memoryStorage({ [STORAGE_KEY]: blob });
  const { store } = makeStore(storage);
  assert.equal(store.isLocked, true);
  assert.equal(store.writeBlockReason, LOCKED_MESSAGE);

  const api = createApi(store, { now: () => NOW });
  for (const result of [
    api.addPerson({ name: 'Nope' }),
    api.updateSettings({ teamName: 'Nope' }),
    api.addConflict({}),
  ]) {
    assert.equal(result.ok, false);
    assert.match(result.error, /encrypted and locked/i);
  }
  store.update((draft) => { draft.settings.teamName = 'Direct write'; }, { type: 'unsafe' });
  assert.equal(store.seedDemo({ force: true }).ok, false);
  assert.equal(store.exportCSV('people').ok, false);
  assert.match(store.exportCSV('people').error, /locked/i);
  store.reset();
  assert.equal(storage.getItem(STORAGE_KEY), blob, 'ciphertext must be byte-identical after refusal');
  assert.equal(storage.keys().some((k) => k.startsWith(QUARANTINE_PREFIX)), false, 'ciphertext is not corruption');
  assert.equal(store.exportJSON(), blob, 'export while locked hands back the untouched file, never an empty workspace');
});

test('lock discards the key and clearing needs an explicit erase confirmation', async () => {
  const { storage, store } = makeStore();
  seededPerson(store, createApi(store, { now: () => NOW }), 'Iris Berg');
  assert.equal((await store.enableEncryption(P12)).ok, true);
  const locked = await store.lock();
  assert.equal(locked.ok, true, locked.error);
  assert.equal(store.isLocked, true);
  assert.equal(store.state.people.length, 0, 'plaintext must be cleared from memory on lock');
  const raw = storage.getItem(STORAGE_KEY);

  const erased = store.reset({ eraseEncrypted: true });
  assert.equal(erased.people.length, 0);
  assert.notEqual(storage.getItem(STORAGE_KEY), raw, 'the ciphertext is replaced only by an explicit erase');
  assert.equal(store.isLocked, false);
  assert.equal(isVaultEnvelope(JSON.parse(storage.getItem(STORAGE_KEY))), false);
});

/* -------------------------------------------------------------- exports */

test('an encrypted backup restores into a fresh workspace; a wrong passphrase changes nothing', async () => {
  const { store } = makeStore();
  seededPerson(store, createApi(store, { now: () => NOW }), 'Noor Haddad');
  assert.equal((await store.enableEncryption(P12)).ok, true);
  const backup = await store.exportEncrypted();
  assert.equal(backup.ok, true, backup.error);
  assert.equal(backup.json.includes('Noor'), false, 'the backup file must be ciphertext');
  assert.equal(isVaultEnvelope(JSON.parse(backup.json)), true);
  assert.equal(JSON.parse(backup.json).purpose, 'export');

  const target = makeStore();
  const rejected = await target.store.importBackup(backup.json, { passphrase: P12_B });
  assert.equal(rejected.ok, false);
  assert.equal(target.store.state.people.length, 0);
  assert.equal(target.storage.getItem(STORAGE_KEY), null, 'a rejected import must not write anything');

  const restored = await target.store.importBackup(backup.json, { passphrase: P12 });
  assert.equal(restored.ok, true, restored.error);
  assert.equal(target.store.state.people[0].name, 'Noor Haddad');
  assert.equal(target.store.isEncrypted, false, 'a plain workspace stays plain text');
  assert.match(target.store.warnings.join(' '), /stored unencrypted/i, 'the downgrade is stated, not silent');
});

test('an encrypted backup restores into a locked workspace with the backup’s passphrase', async () => {
  const state = demoStateWith('Hugo Marchetti');
  const blob = await vaultBlob(state, P12);
  const source = makeStore(memoryStorage({ [STORAGE_KEY]: blob }));
  assert.equal(source.store.isLocked, true);
  const backup = await vaultBlob(state, P12_B, { purpose: 'export' });

  const guarded = await source.store.importBackup(backup, { passphrase: P12_B });
  assert.equal(guarded.ok, false);
  assert.equal(guarded.reason, 'locked');

  const refused = await source.store.importBackup(JSON.stringify(state), {});
  assert.equal(refused.reason, 'locked');

  const plainOverLocked = await source.store.importBackup(JSON.stringify(state), { replaceLocked: true });
  assert.equal(plainOverLocked.ok, false);
  assert.equal(plainOverLocked.reason, 'plaintext-over-locked');

  const restored = await source.store.importBackup(backup, { passphrase: P12_B, replaceLocked: true });
  assert.equal(restored.ok, true, restored.error);
  assert.equal(source.store.isLocked, false);
  assert.equal(source.store.isEncrypted, true, 'restoring an encrypted backup keeps the workspace encrypted');
  assert.equal(source.store.state.people[0].name, 'Hugo Marchetti');
  await source.store.flush();

  const reopened = makeStore(source.storage);
  assert.equal(reopened.store.isLocked, true);
  assert.equal((await reopened.store.unlock(P12_B)).ok, true, 'the workspace now uses the backup passphrase');
});

test('a plain-text export can still be restored into an encrypted workspace and comes back encrypted', async () => {
  const source = makeStore();
  source.store.update((draft) => { draft.settings.teamName = 'Plain source'; }, { type: 'settings.updated' });
  const plainExport = source.store.exportJSON();

  const target = makeStore();
  seededPerson(target.store, createApi(target.store, { now: () => NOW }), 'Existing person');
  assert.equal((await target.store.enableEncryption(P12)).ok, true);
  const targetVault = JSON.parse(target.storage.getItem(STORAGE_KEY));

  const imported = await target.store.importBackup(plainExport);
  assert.equal(imported.ok, true, imported.error);
  assert.equal(target.store.state.settings.teamName, 'Plain source');
  assert.equal(target.store.isEncrypted, true, 'the workspace stays encrypted');
  await target.store.flush();
  const stored = JSON.parse(target.storage.getItem(STORAGE_KEY));
  assert.ok(isVaultEnvelope(stored));
  assert.equal(stored.kdf.salt, targetVault.kdf.salt, 'the existing passphrase is kept, not silently replaced');
  assert.equal(JSON.stringify(stored).includes('Plain source'), false);

  // The synchronous plain-text import path must refuse rather than half-apply.
  const syncAttempt = target.store.importJSON(plainExport);
  assert.equal(syncAttempt.ok, false);
  assert.equal(syncAttempt.reason, 'encrypted-active');
});

/* ------------------------------------------------------------- integrity */

test('tampered ciphertext and unsupported envelopes are refused without touching storage', async () => {
  const state = demoStateWith();
  const blob = await vaultBlob(state);
  const envelope = JSON.parse(blob);

  for (const mutate of [
    (env) => { env.ct = bytesToBase64(new Uint8Array(env.ct.length)); },
    (env) => { env.v = SCHEMA_VERSION + 90; },
    (env) => { env.kdf.iterations = 1; },
    (env) => { env.purpose = 'something-else'; },
    (env) => { env.kdf.hash = 'SHA-1'; },
  ]) {
    const tampered = JSON.parse(blob);
    mutate(tampered);
    const raw = JSON.stringify(tampered);
    const { store } = makeStore(memoryStorage({ [STORAGE_KEY]: raw }));
    assert.equal(store.isLocked || store.vaultStatus === 'unsupported', true);
    const opened = await store.unlock(P12);
    assert.equal(opened.ok, false, `must not unlock: ${raw.slice(0, 60)}`);
    assert.equal(store.isLocked, true);
    assert.equal(isVaultEnvelope(envelope), true);
  }

  // A tampered IV/ciphertext is an authentication failure, not a crash.
  const flip = JSON.parse(blob);
  const bytes = Uint8Array.from(atob(flip.ct), (c) => c.charCodeAt(0));
  bytes[0] ^= 0xff;
  flip.ct = btoa(String.fromCharCode(...bytes));
  const raw = JSON.stringify(flip);
  const { store } = makeStore(memoryStorage({ [STORAGE_KEY]: raw }));
  const opened = await store.unlock(P12);
  assert.equal(opened.ok, false);
  assert.match(opened.error, /did not unlock|altered/i);
  assert.equal(store.isLocked, true);
});

test('rapid edits are coalesced and the newest state is what lands on disk', async () => {
  const { storage, store } = makeStore();
  assert.equal((await store.enableEncryption(P12)).ok, true);
  for (let i = 0; i < 6; i += 1) {
    store.update((draft) => { draft.settings.teamName = `Team ${i}`; }, { type: 'settings.updated' });
  }
  await store.flush();
  const reopened = makeStore(storage);
  const result = await reopened.store.unlock(P12);
  assert.equal(result.ok, true, result.error);
  assert.equal(reopened.store.state.settings.teamName, 'Team 5');
});

test('an encrypted write failure is reported instead of pretending the change was saved', async () => {
  const { storage, store } = makeStore();
  assert.equal((await store.enableEncryption(P12)).ok, true);
  const good = storage.getItem(STORAGE_KEY);
  storage.setItem = () => {
    const err = new Error('storage full');
    err.name = 'QuotaExceededError';
    throw err;
  };
  store.update((draft) => { draft.settings.teamName = 'Unsaved'; }, { type: 'settings.updated' });
  await store.flush();
  assert.match(store.persistError, /storage is full/i);
  assert.equal(storage.getItem(STORAGE_KEY), good, 'the previous ciphertext is untouched');
  assert.equal(store.state.settings.teamName, 'Unsaved', 'in-memory state stays truthful about what was edited');
});

test('a browser without Web Crypto reports the limitation and refuses to encrypt', async () => {
  const { store } = makeStore();
  const noCrypto = createStore({ storage: memoryStorage(), now: () => NOW, crypto: null });
  noCrypto.load();
  const result = await noCrypto.enableEncryption(P12);
  assert.equal(result.ok, false);
  assert.match(result.error, /Web Crypto/i);
  assert.equal(noCrypto.isEncrypted, false);
  assert.equal(store.isEncrypted, false);
});

/* ------------------------------------------------------------------- UI */

function bootDom() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => consoleErrors.push(e.message));
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const dom = new JSDOM(HTML, {
    url: 'https://leados.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event;
  globalThis.FileReader = window.FileReader;
  globalThis.localStorage = window.localStorage;
  return { dom, window, document: window.document, consoleErrors };
}

async function waitFor(check, label, timeout = 3000) {
  const started = Date.now();
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function bootApp(storage, options = {}) {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({
    root: env.document.getElementById('view'),
    storage,
    now: () => NOW,
    ...KDF,
    ...options,
  });
  return { ...env, app };
}

function click(window, node) {
  assert.ok(node, 'expected an element to click');
  node.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

test('a locked workspace renders an unlock screen, reports a wrong passphrase and opens on the right one', async () => {
  const state = demoStateWith('Ilse Kovács');
  const blob = await vaultBlob(state);
  const storage = memoryStorage({ [STORAGE_KEY]: blob });
  const env = await bootApp(storage);

  assert.equal(env.document.querySelector('#vault-passphrase') !== null, true);
  assert.equal(env.document.querySelector('.page-title').textContent, 'Unlock your workspace');
  assert.equal(env.document.querySelector('.topbar-actions').hidden, true, 'no navigation actions while locked');
  assert.equal(env.document.querySelectorAll('#sidebar-nav a').length, 0, 'no section links while locked');
  assert.equal(env.document.body.textContent.includes('Ilse'), false, 'a locked screen must not leak records');

  const input = env.document.querySelector('#vault-passphrase');
  input.value = 'wrong passphrase here';
  const form = input.closest('form');
  form.dispatchEvent(new env.window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => env.document.querySelector('#vault-error').textContent.length > 0, 'error message');
  assert.match(env.document.querySelector('#vault-error').textContent, /did not unlock|altered/i);
  assert.match(env.document.querySelector('#vault-attempts').textContent, /1 unsuccessful/);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).format, 'leados.vault', 'still encrypted after a failed attempt');

  input.value = P12;
  form.dispatchEvent(new env.window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => env.document.querySelector('#vault-passphrase') === null, 'lock screen to disappear');
  assert.equal(env.document.querySelector('.topbar-actions').hidden, false);
  assert.ok(env.document.body.textContent.includes('Ilse Kovács'));
});

test('the lock screen is keyboard-usable and passes axe-core', async () => {
  const blob = await vaultBlob(demoStateWith());
  const env = await bootApp(memoryStorage({ [STORAGE_KEY]: blob }));
  const { window } = env;
  if (!window.axe) window.eval(AXE_SRC);
  const results = await window.axe.run(env.document, { rules: { 'color-contrast': { enabled: false } } });
  assert.deepEqual(Array.from(results.violations).map((v) => v.id), []);

  const heading = env.document.querySelector('h1');
  assert.equal(heading.getAttribute('tabindex'), '-1');
  const show = env.document.querySelector('#vault-show');
  click(window, show);
  show.checked = true;
  show.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(env.document.querySelector('#vault-passphrase').type, 'text', 'the show-passphrase toggle works');
  assert.equal(env.document.querySelector('#vault-restore-file') !== null, true, 'a recovery path always exists');
  assert.equal(env.document.querySelector('#vault-erase-confirm') !== null, true);
  const erase = [...env.document.querySelectorAll('button')].find((b) => b.textContent === 'Erase this workspace');
  assert.equal(erase.disabled, true, 'erasing requires typed confirmation');
  const confirmInput = env.document.querySelector('#vault-erase-confirm');
  confirmInput.value = 'DELETE';
  confirmInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(erase.disabled, false);
});

test('Settings can encrypt the workspace through the real dialog and then shows the encrypted state', async () => {
  const storage = memoryStorage();
  const env = await bootApp(storage);
  env.window.location.hash = '#/settings';
  env.app.render();
  const enable = [...env.document.querySelectorAll('button')].find((b) => b.textContent === 'Encrypt this workspace');
  assert.ok(enable, 'the encryption control is reachable from Settings');
  click(env.window, enable);

  const dialog = await waitFor(() => env.document.querySelector('[role="dialog"]'), 'encryption dialog');
  const fields = [...dialog.querySelectorAll('input')];
  const pass = fields.find((f) => f.name === 'passphrase');
  const confirm = fields.find((f) => f.name === 'confirm');
  const ack = dialog.querySelector('input[type="checkbox"]');
  const submit = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Encrypt this workspace');

  pass.value = P12;
  confirm.value = P12;
  click(env.window, submit);
  await waitFor(() => dialog.textContent.includes('Confirm that you understand') || !dialog.isConnected, 'acknowledgement guard');
  assert.equal(isVaultEnvelope(JSON.parse(storage.getItem(STORAGE_KEY) || '{}')), false, 'unacknowledged enable must not write');

  ack.checked = true;
  click(env.window, submit);
  await waitFor(() => isVaultEnvelope(JSON.parse(storage.getItem(STORAGE_KEY) || '{}')), 'encrypted storage');
  await waitFor(() => env.document.body.textContent.includes('Lock now'), 'encrypted settings state');
  assert.equal(env.document.querySelector('[role="dialog"]'), null);
  const raw = storage.getItem(STORAGE_KEY);
  assert.equal(raw.includes(P12), false, 'the passphrase is not written to storage');

  // Lock now returns to the unlock screen without losing the ciphertext.
  click(env.window, [...env.document.querySelectorAll('button')].find((b) => b.textContent === 'Lock now'));
  const lockConfirm = await waitFor(() => env.document.querySelector('[role="dialog"]'), 'lock confirmation');
  click(env.window, [...lockConfirm.querySelectorAll('button')].find((b) => b.textContent === 'Lock now'));
  await waitFor(() => env.document.querySelector('#vault-passphrase') !== null, 'lock screen after locking');
  assert.equal(storage.getItem(STORAGE_KEY), raw, 'locking does not rewrite the ciphertext');
  assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
});

test('without Web Crypto the lock screen explains why before the passphrase is typed, and Settings disables enabling', async () => {
  const blob = await vaultBlob(demoStateWith());
  const locked = await bootApp(memoryStorage({ [STORAGE_KEY]: blob }), { crypto: null });
  assert.equal(locked.document.querySelector('#vault-passphrase'), null, 'no unusable passphrase form is offered');
  assert.match(locked.document.body.textContent, /https:\/\/ or http:\/\/localhost|secure page/i);
  assert.equal(
    [...locked.document.querySelectorAll('button')].some((b) => b.textContent === 'Download the encrypted file'),
    true,
    'the encrypted file can still be saved',
  );

  const plain = await bootApp(memoryStorage(), { crypto: null });
  plain.window.location.hash = '#/settings';
  plain.app.render();
  const enable = [...plain.document.querySelectorAll('button')].find((b) => b.textContent === 'Encrypt this workspace');
  assert.ok(enable);
  assert.equal(enable.disabled, true, 'enabling encryption is disabled where it cannot work');
  assert.match(plain.document.body.textContent, /only expose Web Crypto on https/i);
});

test('a backup envelope stored as the workspace is refused, not normalised into an empty workspace', async () => {
  const state = demoStateWith('Sofia Lind');
  const backupBlob = await vaultBlob(state, P12, { purpose: 'export' });
  const storage = memoryStorage({ [STORAGE_KEY]: backupBlob });
  const { store } = makeStore(storage);

  assert.equal(store.vaultStatus, 'unsupported');
  assert.match(store.warnings.join(' '), /backup, not a workspace/i);
  assert.match(store.writeBlockReason, /backup/i);
  const opened = await store.unlock(P12);
  assert.equal(opened.ok, false);
  assert.match(opened.error, /Restore a backup/i);
  assert.equal(storage.getItem(STORAGE_KEY), backupBlob, 'the file is left untouched');
  assert.equal(store.state.people.length, 0, 'nothing was adopted');

  // The documented recovery path works: import the file explicitly.
  const restored = await store.importBackup(backupBlob, { passphrase: P12, replaceLocked: true });
  assert.equal(restored.ok, true, restored.error);
  assert.equal(store.state.people[0].name, 'Sofia Lind');
  assert.equal(store.isEncrypted, true);

  // A hand-made envelope claiming purpose "workspace" but holding an export wrapper is refused too.
  const salt = newSalt(webcrypto);
  const key = await deriveKey({ passphrase: P12, salt, iterations: 1000, cryptoRef: webcrypto });
  const wrapper = JSON.stringify({ app: 'LeadOS', schemaVersion: SCHEMA_VERSION, exportedAt: NOW.toISOString(), state });
  const disguised = JSON.stringify(await sealText({ text: wrapper, key, cryptoRef: webcrypto, salt, iterations: 1000, purpose: 'workspace' }));
  const second = makeStore(memoryStorage({ [STORAGE_KEY]: disguised }));
  assert.equal(second.store.isLocked, true);
  const refused = await second.store.unlock(P12);
  assert.equal(refused.ok, false);
  assert.match(refused.error, /export, not a workspace/i);
  assert.equal(second.store.state.people.length, 0);
  assert.equal(second.storage.getItem(STORAGE_KEY), disguised);
});

test('the lock screen explains a stored backup instead of asking for a passphrase that cannot help', async () => {
  const backupBlob = await vaultBlob(demoStateWith(), P12, { purpose: 'export' });
  const env = await bootApp(memoryStorage({ [STORAGE_KEY]: backupBlob }));
  assert.equal(env.document.querySelector('#vault-passphrase'), null, 'no unusable unlock form');
  assert.match(env.document.body.textContent, /backup, not a workspace/i);
  assert.ok([...env.document.querySelectorAll('button')].some((b) => b.textContent === 'Download the encrypted file'));
});
