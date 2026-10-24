/**
 * app/ui/vault-dialogs.js — the dialogs behind encryption.
 *
 * Rules these dialogs follow:
 *  - Nothing is claimed until the asynchronous work actually succeeded. The
 *    button says what it is doing, stays disabled while it does it, and only
 *    closes the dialog on success.
 *  - A failure is shown in the dialog, not in a toast that disappears, and the
 *    typed passphrase is kept so a typo does not force a retype.
 *  - Every dialog states the recovery limitation in the place the decision is
 *    made, not only in documentation.
 */

import { h, openModal, closeAllModals, buildForm, toast, confirmDialog } from './dom.js';
import { downloadText } from './download.js';
import { PASSPHRASE_MIN } from '../core/crypto.js';
import { formatDate } from '../core/time.js';

const PASS_HELP = `At least ${PASSPHRASE_MIN} characters, with no leading or trailing spaces. There is no recovery service and no reset link — if this passphrase is forgotten, the records it protects cannot be opened.`;

function passphraseFields({ confirm = false, label = 'Passphrase' } = {}) {
  return [
    { name: 'passphrase', label, type: 'password', required: true, help: PASS_HELP, autocomplete: 'new-password' },
    ...(confirm
      ? [{ name: 'confirm', label: 'Repeat the passphrase', type: 'password', required: true, help: 'Typed twice so a slip cannot lock the workspace.' }]
      : []),
  ];
}

/**
 * Wire a button to an async action with a visible busy state and no double-run.
 * `action` returns `{ok:true}` on success (the action closes the dialog itself)
 * or `{ok:false, error, field}`.
 */
function guardedAction(button, idleLabel, busyLabel, action) {
  let running = false;
  button.addEventListener('click', async () => {
    if (running) return;
    running = true;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = busyLabel;
    let result;
    try {
      result = await action();
    } catch (error) {
      result = { ok: false, error: `Something went wrong: ${(error && error.message) || error}` };
    }
    if (result && result.ok) return;
    running = false;
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.textContent = idleLabel;
  });
  return button;
}

function errorRegion() {
  return h('p', { class: 'field-error', role: 'alert' });
}

function setError(node, message) {
  node.textContent = message || '';
}

/** Offer the text in a copyable textarea when a download cannot start. */
export function openCopyFallback({ title, description, text, filename }) {
  const form = buildForm([{ name: 'payload', label: filename || 'Contents', type: 'textarea', rows: 12, value: text }]);
  openModal({
    title,
    description: description || 'This browser could not start a download. Copy the text below and save it yourself.',
    body: form.node,
    footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Close')],
    size: 'lg',
  });
}

/** Save text, falling back to a copyable dialog. Returns true when downloaded. */
export function saveOrFallback(options) {
  if (downloadText(options)) return true;
  openCopyFallback(options);
  return false;
}

export function openEnableEncryptionDialog(ctx) {
  const form = buildForm([
    ...passphraseFields({ confirm: true, label: 'Workspace passphrase' }),
    {
      name: 'ack',
      label: 'Confirmation',
      type: 'checkbox',
      checkboxLabel: 'I understand that a forgotten passphrase cannot be recovered by me, by this app, or by anyone else.',
      value: false,
    },
  ]);
  const error = errorRegion();
  const primary = h('button', { class: 'btn btn-primary', type: 'button' }, 'Encrypt this workspace');
  const dialog = openModal({
    title: 'Encrypt this workspace',
    description:
      'Records will be sealed in this browser with AES-256-GCM using a key derived from your passphrase (PBKDF2-SHA-256). Nothing is sent anywhere, and the passphrase is never stored.',
    body: h(
      'div',
      { class: 'form' },
      form.node,
      h(
        'p',
        { class: 'field-help' },
        'This protects a copied browser profile or a stolen backup file. It does not protect against someone using this browser while the workspace is unlocked, and it does not hide anything from an extension you have installed.',
      ),
      error,
    ),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      primary,
    ],
    size: 'md',
  });

  guardedAction(primary, 'Encrypt this workspace', 'Encrypting…', async () => {
    setError(error, '');
    const values = form.getValues();
    if (values.passphrase !== values.confirm) {
      form.setFieldError('confirm', 'The two passphrases are different.');
      return { ok: false };
    }
    if (!values.ack) {
      setError(error, 'Confirm that you understand a forgotten passphrase means the records cannot be recovered.');
      return { ok: false };
    }
    const result = await ctx.enableEncryption(values.passphrase);
    if (!result.ok) {
      if (result.field) form.setFieldError(result.field, result.error);
      else setError(error, result.error);
      return result;
    }
    dialog.close();
    toast('Workspace encrypted. Keep the passphrase somewhere safe.', 'good');
    ctx.refresh();
    return result;
  });
  return dialog;
}

export function openChangePassphraseDialog(ctx) {
  const form = buildForm(passphraseFields({ confirm: true, label: 'New workspace passphrase' }));
  const error = errorRegion();
  const primary = h('button', { class: 'btn btn-primary', type: 'button' }, 'Change passphrase');
  const dialog = openModal({
    title: 'Change the workspace passphrase',
    description: 'The new passphrase is used from now on. The previous passphrase stops working for this browser copy immediately; older encrypted backups keep the passphrase they were made with.',
    body: h('div', { class: 'form' }, form.node, error),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      primary,
    ],
  });

  guardedAction(primary, 'Change passphrase', 'Re-encrypting…', async () => {
    setError(error, '');
    const values = form.getValues();
    if (values.passphrase !== values.confirm) {
      form.setFieldError('confirm', 'The two passphrases are different.');
      return { ok: false };
    }
    const result = await ctx.changePassphrase(values.passphrase);
    if (!result.ok) {
      if (result.field) form.setFieldError(result.field, result.error);
      else setError(error, result.error);
      return result;
    }
    dialog.close();
    toast('Passphrase changed', 'good');
    ctx.refresh();
    return result;
  });
  return dialog;
}

export function openDisableEncryptionDialog(ctx) {
  return confirmDialog({
    title: 'Stop encrypting this workspace?',
    message:
      'The records will be written back to this browser as plain text, where anyone with access to this profile — or any tool that reads it — can read them. Encrypted backups you already saved are not affected.',
    confirmLabel: 'Turn off encryption',
    danger: true,
    onConfirm: async () => {
      const result = await ctx.disableEncryption();
      if (!result.ok) {
        toast(result.error, 'bad');
        return;
      }
      toast('Encryption turned off. Records are now stored as plain text.', 'caution');
      ctx.refresh();
    },
  });
}

export function openLockWorkspaceDialog(ctx) {
  return confirmDialog({
    title: 'Lock the workspace now?',
    message:
      'The key is discarded from this tab and the records are cleared from the screen. You will need the passphrase to open them again. Any unsaved edit is written first.',
    confirmLabel: 'Lock now',
    onConfirm: async () => {
      const result = await ctx.lockWorkspace();
      if (!result.ok) {
        toast(result.error, 'bad');
        return;
      }
      ctx.refresh();
    },
  });
}

/**
 * Create a passphrase-protected backup. When the workspace is already
 * encrypted no passphrase prompt is needed: the existing key seals the file, so
 * the same passphrase opens it later.
 */
export function openEncryptedBackupDialog(ctx) {
  const alreadyEncrypted = ctx.isEncrypted;
  const form = alreadyEncrypted ? null : buildForm(passphraseFields({ confirm: true, label: 'Passphrase for this backup' }));
  const error = errorRegion();
  const primary = h('button', { class: 'btn btn-primary', type: 'button' }, 'Create encrypted backup');
  const dialog = openModal({
    title: 'Encrypted backup',
    description: alreadyEncrypted
      ? 'The backup is sealed with the passphrase that protects this workspace. Keep that passphrase: without it the backup cannot be restored.'
      : 'This workspace is not encrypted, but the backup file can be. Choose a passphrase for the file — you will need it to restore.',
    body: h(
      'div',
      { class: 'form' },
      form ? form.node : h('p', { class: 'modal-text' }, 'A fresh random IV is used for this file, so it does not weaken the workspace copy.'),
      error,
    ),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      primary,
    ],
  });

  guardedAction(primary, 'Create encrypted backup', 'Encrypting…', async () => {
    setError(error, '');
    let passphrase = null;
    if (form) {
      const values = form.getValues();
      if (values.passphrase !== values.confirm) {
        form.setFieldError('confirm', 'The two passphrases are different.');
        return { ok: false };
      }
      passphrase = values.passphrase;
    }
    const result = await ctx.exportEncryptedJSON(passphrase);
    if (!result.ok) {
      if (result.field && form) form.setFieldError(result.field, result.error);
      else setError(error, result.error);
      return result;
    }
    dialog.close();
    const filename = `leados-encrypted-${ctx.now.toISOString().slice(0, 10)}.json`;
    const saved = saveOrFallback({
      filename,
      text: result.json,
      mime: 'application/json',
      title: 'Encrypted backup',
      description: 'This browser could not start a download. Copy the encrypted JSON and save it as a .json file. It is useless without its passphrase.',
    });
    if (saved) toast('Encrypted backup downloaded', 'good');
    return result;
  });
  return dialog;
}

/**
 * Ask for the passphrase of an encrypted backup and hand it to `onSubmit`.
 * Used both from Settings and from the lock screen's recovery path, so the
 * "wrong passphrase" and "altered file" messages are identical everywhere.
 */
export function openImportPassphraseDialog({ title = 'Open encrypted backup', description, onSubmit, onSuccess }) {
  const form = buildForm(passphraseFields({ label: 'Passphrase for this backup' }));
  const error = errorRegion();
  const primary = h('button', { class: 'btn btn-primary', type: 'button' }, 'Decrypt and import');
  const dialog = openModal({
    title,
    description: description || 'Enter the passphrase that was used when this backup was created.',
    body: h('div', { class: 'form' }, form.node, error),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      primary,
    ],
  });
  guardedAction(primary, 'Decrypt and import', 'Decrypting…', async () => {
    setError(error, '');
    const { passphrase } = form.getValues();
    if (!passphrase) {
      form.setFieldError('passphrase', 'Enter the passphrase for this backup.');
      return { ok: false };
    }
    const result = await onSubmit(passphrase);
    if (!result.ok) {
      if (result.field) form.setFieldError(result.field, result.error);
      else setError(error, result.error);
      return result;
    }
    dialog.close();
    if (onSuccess) onSuccess(result);
    return result;
  });
  return dialog;
}

/** A dated, honest one-line summary of the workspace's encryption state. */
export function encryptionSummary(facts) {
  if (!facts) return 'Not encrypted — records are stored in this browser as plain text.';
  const since = facts.createdAt ? ` since ${formatDate(facts.createdAt)}` : '';
  return `Encrypted${since} · PBKDF2-SHA-256 (${Number(facts.iterations).toLocaleString()} rounds) + AES-256-GCM`;
}
