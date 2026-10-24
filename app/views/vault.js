/**
 * app/views/vault.js — the screen shown when this browser holds an encrypted
 * workspace that this session has not opened.
 *
 * It is deliberately the only thing rendered: no sidebar links, no half-loaded
 * records, and no path where a stray action could overwrite the ciphertext.
 *
 * Three honest exits, in order of safety:
 *  1. Unlock with the passphrase.
 *  2. Restore a backup (encrypted backup keeps the workspace encrypted; a
 *     plain-text file is a destructive replacement and says so).
 *  3. Erase the unreadable workspace, which requires typing DELETE.
 */

import { h, toast, confirmDialog } from '../ui/dom.js';
import { pageHeader, card } from '../ui/components.js';
import { openImportPassphraseDialog, saveOrFallback } from '../ui/vault-dialogs.js';

const ERASE_CONFIRMATION = 'DELETE';

/** Older browsers expose FileReader but not Blob.text(). */
function readFileWithReader(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsText(file);
  });
}

/**
 * @param {object} ctx app context
 * @returns {Node}
 */
export function renderVault(ctx) {
  const facts = ctx.vaultFacts || {};
  const unsupported = ctx.vaultStatus === 'unsupported';
  const warnings = ctx.warnings || [];

  const passInput = h('input', {
    id: 'vault-passphrase',
    name: 'passphrase',
    type: 'password',
    required: true,
    autocomplete: 'current-password',
    'aria-describedby': 'vault-passphrase-help',
    class: 'input',
  });
  const showToggle = h('input', { type: 'checkbox', id: 'vault-show' });
  const error = h('p', { class: 'field-error', id: 'vault-error', role: 'alert' });
  const attemptNote = h('p', { class: 'field-help', id: 'vault-attempts', 'aria-live': 'polite' });
  let attempts = 0;

  showToggle.addEventListener('change', () => {
    passInput.type = showToggle.checked ? 'text' : 'password';
  });

  // Web Crypto needs a secure context. Opened over plain http on a LAN address,
  // the browser hides crypto.subtle and this screen would otherwise fail only
  // after the person typed their passphrase.
  const noCrypto = ctx.cryptoAvailable === false;
  const unlockButton = h('button', { class: 'btn btn-primary', type: 'submit', disabled: noCrypto }, 'Unlock workspace');

  const downloadButton = h(
    'button',
    {
      class: 'btn btn-ghost',
      type: 'button',
      onClick: () => {
        const json = ctx.exportJSON();
        const saved = saveOrFallback({
          filename: 'leados-encrypted-workspace.json',
          text: json,
          title: 'Save the encrypted workspace file',
          description: 'This is the untouched ciphertext exactly as stored. Keep it somewhere safe — it is the only copy if anything goes wrong.',
        });
        if (saved) toast('Encrypted workspace file downloaded', 'good');
      },
    },
    'Download the encrypted file',
  );

  const unlockForm = h(
    'form',
    {
      class: 'form',
      novalidate: true,
      onSubmit: async (event) => {
        event.preventDefault();
        const passphrase = passInput.value;
        if (!passphrase) {
          error.textContent = 'Enter your passphrase.';
          passInput.setAttribute('aria-invalid', 'true');
          passInput.focus();
          return;
        }
        error.textContent = '';
        passInput.removeAttribute('aria-invalid');
        unlockButton.disabled = true;
        unlockButton.setAttribute('aria-busy', 'true');
        unlockButton.textContent = 'Deriving key…';
        const result = await ctx.unlock(passphrase);
        unlockButton.disabled = false;
        unlockButton.removeAttribute('aria-busy');
        unlockButton.textContent = 'Unlock workspace';
        if (result.ok) {
          passInput.value = '';
          toast('Workspace unlocked', 'good');
          ctx.refresh();
          return;
        }
        attempts += 1;
        error.textContent = result.error;
        attemptNote.textContent = `${attempts} unsuccessful ${attempts === 1 ? 'attempt' : 'attempts'} in this tab. There is no lockout — correctness of the passphrase is the only gate — and no recovery service.`;
        passInput.setAttribute('aria-invalid', 'true');
        passInput.focus();
        passInput.select();
      },
    },
    h(
      'div',
      { class: 'field' },
      h('label', { class: 'field-label', for: 'vault-passphrase' }, 'Workspace passphrase'),
      passInput,
      h('p', { class: 'field-help', id: 'vault-passphrase-help' }, 'The same passphrase you chose when you turned encryption on. Nothing is sent anywhere to check it: the key is derived here.'),
    ),
    h('label', { class: 'check', for: 'vault-show' }, showToggle, h('span', null, 'Show passphrase')),
    h('div', { class: 'row-gap' }, unlockButton, downloadButton),
    error,
    attemptNote,
  );

  /* ---------------------------------------------------------- recovery --- */

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', id: 'vault-restore-file' });
  const restoreStatus = h('p', { class: 'muted small', 'aria-live': 'polite' });
  const restoreLabel = h('label', { class: 'btn btn-ghost', for: 'vault-restore-file' }, 'Choose a backup file…');

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    restoreStatus.className = 'muted small';
    restoreStatus.textContent = 'Reading the file…';
    let text;
    try {
      text = typeof file.text === 'function' ? await file.text() : await readFileWithReader(file);
    } catch {
      restoreStatus.className = 'field-error';
      restoreStatus.textContent = 'The file could not be read.';
      return;
    }
    let encrypted = false;
    try {
      encrypted = Boolean(JSON.parse(text) && JSON.parse(text).format === 'leados.vault');
    } catch {
      restoreStatus.className = 'field-error';
      restoreStatus.textContent = 'That file is not valid JSON.';
      return;
    }
    restoreStatus.textContent = '';
    if (encrypted) {
      openImportPassphraseDialog({
        title: 'Restore an encrypted backup',
        description: 'Enter the passphrase this backup was created with. If it differs from the current workspace passphrase, the workspace will use the backup’s passphrase afterwards.',
        onSubmit: (passphrase) => ctx.importBackup(text, { passphrase, replaceLocked: true }),
        onSuccess: (result) => {
          toast(`Restored ${result.imported.people} people`, 'good');
          ctx.refresh();
        },
      });
      return;
    }
    // Plain text over unreadable ciphertext: the encrypted records are about to
    // be destroyed. Say exactly that before doing it.
    confirmDialog({
      title: 'Replace the encrypted workspace with this plain-text file?',
      message:
        'That backup is not encrypted. Importing it will overwrite the encrypted records in this browser, and they are already unreadable here, so they will be gone for good. Download the encrypted file first if there is any chance you will find the passphrase.',
      confirmLabel: 'Replace the encrypted records',
      danger: true,
      onConfirm: async () => {
        const result = await ctx.importBackup(text, { replaceLocked: true, replacePlaintext: true });
        if (!result.ok) {
          restoreStatus.className = 'field-error';
          restoreStatus.textContent = result.error;
          return;
        }
        toast(`Restored ${result.imported.people} people`, 'good');
        ctx.refresh();
      },
    });
  });

  const eraseInput = h('input', { id: 'vault-erase-confirm', name: 'erase', type: 'text', autocomplete: 'off', class: 'input' });
  const eraseButton = h('button', { class: 'btn btn-danger', type: 'button', disabled: true }, 'Erase this workspace');
  eraseInput.addEventListener('input', () => {
    const matches = eraseInput.value.trim() === ERASE_CONFIRMATION;
    eraseButton.disabled = !matches;
    eraseInput.setAttribute('aria-invalid', matches ? 'false' : 'true');
  });
  eraseButton.addEventListener('click', () => {
    if (eraseInput.value.trim() !== ERASE_CONFIRMATION) return;
    confirmDialog({
      title: 'Erase the unreadable workspace?',
      message: 'The encrypted records in this browser will be deleted and an empty workspace created. This cannot be undone, and no copy is kept. Download the encrypted file first if you have not.',
      confirmLabel: 'Erase permanently',
      danger: true,
      onConfirm: async () => {
        const result = await ctx.eraseLockedWorkspace();
        if (!result.ok) {
          toast(result.error, 'bad');
          return;
        }
        toast('Workspace erased. Starting empty.', 'caution');
        ctx.refresh();
      },
    });
  });

  return h(
    'div',
    { class: 'page vault-page' },
    pageHeader({
      eyebrow: 'Encrypted workspace',
      title: unsupported ? 'This saved encrypted file cannot be opened as a workspace' : 'Unlock your workspace',
      subtitle: unsupported
        ? 'The saved data has not been changed and nothing will be written over it. The reason is listed below.'
        : 'Your records in this browser are sealed with a key derived from your passphrase.',
    }),
    warnings.length
      ? card({
          title: 'What the app can tell you',
          body: h('ul', { class: 'vault-list' }, ...warnings.map((warning) => h('li', null, warning))),
        })
      : null,
    unsupported
      ? card({
          title: 'Keep a copy of this file',
          subtitle: 'Nothing here will write over it, but it is the only copy in this browser.',
          body: h(
            'div',
            { class: 'vault-settings' },
            h(
              'p',
              { class: 'small' },
              'Download the untouched encrypted file first. Then restore a backup you can open, or erase this workspace and start again.',
            ),
            h('div', { class: 'row-gap' }, downloadButton),
          ),
        })
      : noCrypto
        ? card({
            title: 'This address cannot decrypt anything',
            subtitle: 'Your encrypted records have not been changed.',
            body: h(
              'div',
              { class: 'vault-settings' },
              h(
                'p',
                { class: 'small' },
                'Browsers only expose encryption (Web Crypto) on a secure page: https:// or http://localhost. This page was opened over an insecure address, so the passphrase cannot be used here and the unlock form is deliberately not shown.',
              ),
              h('p', { class: 'muted tiny' }, 'Open LeadOS over https, or from localhost, and try again. Meanwhile you can save the encrypted file, which is the same ciphertext this browser holds.'),
              h('div', { class: 'row-gap' }, downloadButton),
            ),
          })
        : card({
            title: 'Enter your passphrase',
            subtitle: 'Needed once per browser session. Locking closes it again.',
            body: unlockForm,
          }),
    card({
      title: 'What this protection does and does not do',
      body: h(
        'ul',
        { class: 'vault-list' },
        h('li', null, 'It protects a copied browser profile or a stolen backup file: without the passphrase the records are unreadable.'),
        h('li', null, 'It does not protect anything while the workspace is unlocked in an open tab, and it cannot hide content from a browser extension or a compromised device.'),
        h('li', null, 'There is no recovery key and no account to reset. If the passphrase is lost, the data in this browser cannot be recovered — keep an encrypted backup if you can still unlock, and consider a plain-text backup if losing access is the bigger risk.'),
        h('li', null, 'CSV exports and plain-text JSON exports are always unencrypted files. Only this browser’s stored copy and encrypted backups are protected.'),
      ),
    }),
    card({
      title: 'Can’t unlock this workspace?',
      subtitle: 'Two exits, both final. Try the passphrase first.',
      body: h(
        'div',
        { class: 'vault-recovery' },
        h(
          'div',
          { class: 'vault-recovery-block' },
          h('h3', { class: 'vault-subhead' }, 'Restore a backup'),
          h('p', { class: 'muted small' }, 'An encrypted backup restores the records and keeps them encrypted. A plain-text backup replaces the encrypted records, which cannot be read here anyway.'),
          restoreLabel,
          fileInput,
          restoreStatus,
        ),
        h(
          'div',
          { class: 'vault-recovery-block' },
          h('h3', { class: 'vault-subhead' }, 'Erase this workspace'),
          h('p', { class: 'muted small' }, `Type ${ERASE_CONFIRMATION} to confirm. This deletes the encrypted records in this browser and starts an empty workspace.`),
          h(
            'div',
            { class: 'field' },
            h('label', { class: 'field-label', for: 'vault-erase-confirm' }, `Type ${ERASE_CONFIRMATION} to confirm`),
            eraseInput,
          ),
          eraseButton,
        ),
      ),
    }),
  );
}
