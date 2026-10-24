/**
 * app/views/settings.js — thresholds, data portability, and the audit trail.
 * A leadership tool holds sensitive notes; the owner must be able to take the
 * data out and see exactly what has been recorded.
 */

import { h, toast, confirmDialog, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, emptyState, table } from '../ui/components.js';
import { formatDate } from '../core/time.js';
import { openSettingsDialog } from '../ui/modals.js';
import {
  openEnableEncryptionDialog,
  openChangePassphraseDialog,
  openDisableEncryptionDialog,
  openLockWorkspaceDialog,
  openEncryptedBackupDialog,
  openImportPassphraseDialog,
  encryptionSummary,
} from '../ui/vault-dialogs.js';
import { SCHEMA_VERSION } from '../core/schema.js';
import { CSV_EXPORTS } from '../core/csv.js';

export function renderSettings(ctx) {
  const { state, now } = ctx;
  const s = state.settings;
  const counts = {
    people: state.people.length,
    oneOnOnes: state.oneOnOnes.length,
    feedback: state.feedback.length,
    goals: state.goals.length,
    delegations: state.delegations.length,
    conflicts: state.conflicts.length,
    growthPlans: state.growthPlans.length,
    pulses: state.pulses.length,
    decisions: state.decisions.length,
    recognition: state.recognition.length,
    readiness: state.readiness.length,
    reviews: state.reviews.length,
  };

  const bytes = ctx.storageSize();
  const events = state.events.slice().reverse().slice(0, 40);

  const thresholdRows = [
    ['1:1 cadence', `${s.oneOnOneCadenceDays} days`],
    ['Feedback target', `${s.feedbackTargetDays} days`],
    ['Observation → conversation convention', `${s.feedbackLatencyTargetDays} days`],
    ['Goal check-in', `${s.goalCheckinDays} days`],
    ['Delegation check-in convention', `${s.delegationCheckinDays} days`],
    ['Recognition target', `${s.recognitionTargetDays} days`],
    ['Decision review default', `${s.decisionReviewDays} days`],
    ['Growth plan review', `${s.growthReviewDays} days`],
    ['Onboarding window', `${s.onboardingDays} days`],
    ['Direct reports before warning', `${s.maxReportsPerManager}`],
    ['Pulse anonymity floor', `${s.pulseMinResponses} responses`],
  ];

  const openCsvFallbackModal = (result, reasonText) => {
    const form = buildForm([
      {
        name: 'csv',
        label: `${result.label} (${result.filename} · ${result.rowCount} row${result.rowCount === 1 ? '' : 's'})`,
        type: 'textarea',
        rows: 12,
        value: result.csv,
      },
    ]);
    openModal({
      title: `CSV export — ${result.label}`,
      description: reasonText || 'Select all and copy into a .csv file or spreadsheet.',
      body: form.node,
      footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Close')],
      size: 'lg',
    });
  };

  const runCsvExport = (scope, { previewOnly = false } = {}) => {
    const result = ctx.exportCSV(scope);
    if (!result.ok) {
      toast(result.error, 'bad');
      return;
    }
    if (previewOnly) {
      openCsvFallbackModal(result, 'Formula-injection prefixes (=, +, -, @) in text notes are neutralized with a leading apostrophe.');
      return;
    }
    try {
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined') {
        const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = h('a', { href: url, download: result.filename });
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast(`Downloaded ${result.filename} (${result.rowCount} row${result.rowCount === 1 ? '' : 's'})`, 'good');
        return;
      }
    } catch {
      /* fall through to copyable modal */
    }
    openCsvFallbackModal(result, 'This browser could not start a file download. Copy the CSV below.');
  };

  const standardCsvScopes = CSV_EXPORTS.filter((item) => !item.sensitive);
  const sensitiveCsvScope = CSV_EXPORTS.find((item) => item.key === 'conflicts');
  const scopeSelect = h(
    'select',
    { id: 'csv-export-scope', name: 'csvScope' },
    ...standardCsvScopes.map((item) =>
      h('option', { value: item.key }, item.label),
    ),
  );
  const scopeDesc = h('p', { class: 'field-help', id: 'csv-export-desc' }, standardCsvScopes[0].description);
  scopeSelect.setAttribute('aria-describedby', 'csv-export-desc');
  scopeSelect.addEventListener('change', () => {
    const picked = standardCsvScopes.find((item) => item.key === scopeSelect.value);
    scopeDesc.textContent = picked ? picked.description : '';
  });

  const exportConfidentialCsvAction = () => {
    confirmDialog({
      title: 'Export confidential conflict records to CSV?',
      message: 'This spreadsheet contains private interpersonal mediation notes, perspectives, and coaching agreements. Export only when needed and store it in a restricted folder.',
      confirmLabel: 'Export confidential CSV',
      danger: true,
      onConfirm: () => runCsvExport('conflicts'),
    });
  };

  const exportAction = () => {
    const json = ctx.exportJSON();
    try {
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined') {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = h('a', { href: url, download: `leados-export-${now.toISOString().slice(0, 10)}.json` });
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('Export downloaded', 'good');
        return;
      }
    } catch {
      /* fall through to the visible fallback */
    }
    // Never a dead end: if the browser blocks the download, show the JSON.
    const form = buildForm([{ name: 'json', label: 'Your data (select all and copy)', type: 'textarea', rows: 12, value: json }]);
    openModal({
      title: 'Export',
      description: 'This browser could not start a download. Copy the JSON below and keep it somewhere safe.',
      body: form.node,
      footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Close')],
      size: 'lg',
    });
  };

  const importAction = () => {
    const input = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', id: 'import-file' });
    const label = h('label', { class: 'btn btn-ghost', for: 'import-file' }, 'Choose a file…');
    const status = h('p', { class: 'muted small', 'aria-live': 'polite' });

    const finish = (result) => {
      if (!result.ok) {
        status.textContent = result.error;
        status.className = 'field-error';
        return;
      }
      dialog.close();
      const notes = result.warnings && result.warnings.length ? ` ${result.warnings[result.warnings.length - 1]}` : '';
      toast(`Imported ${result.imported.people} people and ${result.imported.events} events.${notes}`, 'good');
      ctx.navigate('#/today');
    };

    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      status.className = 'muted small';
      status.textContent = 'Reading and validating the file…';
      const reader = new FileReader();
      reader.onload = async () => {
        const text = String(reader.result);
        let looksEncrypted = false;
        try {
          const parsed = JSON.parse(text);
          looksEncrypted = Boolean(parsed && parsed.format === 'leados.vault');
        } catch {
          looksEncrypted = false;
        }
        if (looksEncrypted) {
          dialog.close();
          openImportPassphraseDialog({
            title: 'Import an encrypted backup',
            description: 'Enter the passphrase used when this backup was created. Importing replaces what is stored in this browser.',
            onSubmit: (passphrase) => ctx.importBackup(text, { passphrase }),
            onSuccess: (result) => {
              toast(`Imported ${result.imported.people} people and ${result.imported.events} events`, 'good');
              ctx.navigate('#/today');
            },
          });
          return;
        }
        // An encrypted workspace must be written back as ciphertext, so the
        // import has to wait for that write before adopting anything.
        if (ctx.isEncrypted) {
          status.textContent = 'Validating and re-encrypting…';
          finish(await ctx.importBackup(text));
          return;
        }
        finish(ctx.importJSON(text));
      };
      reader.onerror = () => {
        status.textContent = 'The file could not be read.';
      };
      reader.readAsText(file);
    });
    const dialog = openModal({
      title: 'Import a LeadOS export',
      description: 'This replaces everything currently stored in this browser. Export first if you are unsure.',
      body: h(
        'div',
        { class: 'form' },
        h('div', { class: 'field' }, label, input, status),
        h(
          'p',
          { class: 'muted small' },
          ctx.isEncrypted
            ? 'Encrypted and plain-text exports are both accepted. The imported records stay encrypted with your current workspace passphrase.'
            : 'The file is validated and repaired before it replaces anything. If it is not a LeadOS workspace, nothing changes. Plain-text imports stay plain text.',
        ),
      ),
      footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel')],
      size: 'sm',
    });
  };

  const resetAction = () => {
    confirmDialog({
      title: 'Delete everything in this browser?',
      message: `All ${state.people.length} people, ${state.oneOnOnes.length} 1:1s, ${state.feedback.length} feedback notes and ${state.goals.length} goals will be removed from this browser only. Export first — this cannot be undone.`,
      confirmLabel: 'Delete all data',
      danger: true,
      onConfirm: () => {
        const result = ctx.resetStore();
        if (result) {
          toast('Workspace reset', 'good');
          ctx.navigate('#/today');
        }
      },
    });
  };

  return h(
    'div',
    { class: 'page' },
    pageHeader({
      title: 'Settings & data',
      subtitle: `Schema v${SCHEMA_VERSION} · local browser storage · no automatic transmission.`,
      actions: [h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openSettingsDialog(ctx) }, 'Edit cadences')],
    }),
    state.meta.isDemo
      ? card({
          title: 'Demo workspace active',
          subtitle: 'Fabricated records, clearly labelled.',
          body: h('div', { class: 'row-gap' }, h('p', { class: 'muted' }, 'The data here was generated so you can see the app working. Clearing it removes only the demo records — anything you added yourself stays.'), h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => ctx.clearDemo() }, 'Clear demo data')),
        })
      : null,
    h(
      'div',
      { class: 'stat-row' },
      stat({ label: 'Records', value: Object.values(counts).reduce((a, b) => a + b, 0), hint: `${counts.people} people` }),
      stat({ label: 'Event log', value: state.events.length, hint: 'append-oriented, capped at 600' }),
      stat({ label: 'Stored size', value: bytes > 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`, hint: 'browser localStorage' }),
      stat({ label: ctx.persistError ? 'Last change (unsaved)' : 'Last saved', value: state.meta.updatedAt.slice(11, 16), hint: `${formatDate(state.meta.updatedAt)} · revision ${state.meta.revision}` }),
    ),
    ctx.persistError ? card({ title: 'Saving is failing', subtitle: 'Nothing can be saved until this is resolved.', body: h('p', { class: 'text-bad' }, ctx.persistError) }) : null,
    h(
      'div',
      { class: 'grid grid-2' },
      card({
        title: 'Your cadences',
        subtitle: 'Every "due" and "overdue" judgement comes from these numbers.',
        actions: [h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openSettingsDialog(ctx) }, 'Edit')],
        body: h(
          'dl',
          { class: 'settings-list' },
          ...thresholdRows.map(([label, value]) => h('div', null, h('dt', null, label), h('dd', null, value))),
        ),
      }),
      card({
        title: 'Team',
        body: h(
          'dl',
          { class: 'settings-list' },
          h('div', null, h('dt', null, 'Leader'), h('dd', null, s.leaderName || '—')),
          h('div', null, h('dt', null, 'Team'), h('dd', null, s.teamName)),
          h('div', null, h('dt', null, 'Organisation'), h('dd', null, s.orgName || '—')),
          ...Object.entries(counts).map(([key, value]) => h('div', null, h('dt', null, labelFor(key)), h('dd', null, String(value)))),
        ),
      }),
    ),
    card({
      title: 'Protect this browser copy',
      subtitle: ctx.isEncrypted
        ? encryptionSummary(ctx.vaultFacts)
        : 'Optional passphrase encryption for the records stored in this browser.',
      body: h(
        'div',
        { class: 'vault-settings' },
        ctx.cryptoAvailable === false
          ? h('p', { class: 'text-bad small' }, 'Encryption is unavailable on this address: browsers only expose Web Crypto on https:// or http://localhost pages. Records stay in plain text here. Open LeadOS over https and reload to enable it.')
          : null,
        h(
          'p',
          { class: 'small' },
          ctx.isEncrypted
            ? 'This browser copy is encrypted with AES-256-GCM under a key derived from your passphrase. The passphrase itself is never stored. Exports are separate: CSV and plain-text JSON files are always unencrypted unless you create an encrypted backup.'
            : 'Right now every note — including conflict records — is stored in this browser as plain text, readable by anyone who opens your browser profile or copies its storage. Encrypting converts the stored copy into ciphertext that needs your passphrase.',
        ),
        h(
          'div',
          { class: 'data-actions' },
          ctx.isEncrypted
            ? h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openLockWorkspaceDialog(ctx) }, 'Lock now')
            : h('button', { class: 'btn btn-primary', type: 'button', disabled: ctx.cryptoAvailable === false, onClick: () => openEnableEncryptionDialog(ctx) }, 'Encrypt this workspace'),
          ctx.isEncrypted
            ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openChangePassphraseDialog(ctx) }, 'Change passphrase')
            : null,
          h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openEncryptedBackupDialog(ctx) }, ctx.isEncrypted ? 'Create encrypted backup' : 'Create encrypted backup of this workspace'),
          ctx.isEncrypted
            ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openDisableEncryptionDialog(ctx) }, 'Turn off encryption')
            : null,
        ),
        h(
          'p',
          { class: 'muted tiny' },
          'No recovery key, no reset link and no account: if the passphrase is forgotten, the encrypted copy cannot be opened. Encryption protects a copied profile or backup file, not a browser someone else can already use while it is unlocked.',
        ),
      ),
    }),
    card({
      title: 'Take your data with you',
      subtitle: ctx.isEncrypted
        ? 'Export JSON writes a plain-text file including full conflict notes — unencrypted even though this workspace is encrypted. Use Create encrypted backup above for a protected file.'
        : 'Plain JSON, including full conflict notes. Unencrypted and readable in any text editor — store and share backups carefully.',
      body: h(
        'div',
        { class: 'data-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onClick: exportAction }, 'Export JSON'),
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openEncryptedBackupDialog(ctx) }, 'Export encrypted JSON'),
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: importAction }, 'Import JSON'),
        h('button', {
          class: 'btn btn-ghost',
          type: 'button',
          onClick: () => {
            const result = ctx.loadDemo();
            if (result.ok) {
              toast('Demo workspace loaded', 'good');
              return;
            }
            confirmDialog({
              title: 'Replace your records with demo data?',
              message: `${result.error}`,
              confirmLabel: 'Replace with demo',
              danger: true,
              onConfirm: () => {
                checkExportFirst(ctx, () => {
                  ctx.loadDemo({ force: true });
                  toast('Demo workspace loaded', 'good');
                });
              },
            });
          },
        }, state.meta.isDemo ? 'Reload demo data' : 'Load demo data'),
        h('button', { class: 'btn btn-danger', type: 'button', onClick: resetAction }, 'Delete all data'),
      ),
    }),
    card({
      title: 'Spreadsheet exports (CSV)',
      subtitle: 'Scoped, formula-injection-safe tables for spreadsheets, calibration prep, or HR handoff. Use Export JSON above for full lossless backup and restore.',
      body: h(
        'div',
        { class: 'csv-export-stack', 'data-testid': 'csv-exports' },
        h(
          'div',
          { class: 'csv-export-row' },
          h(
            'div',
            { class: 'field csv-scope-field' },
            h('label', { class: 'field-label', for: 'csv-export-scope' }, 'Table to export'),
            scopeSelect,
            scopeDesc,
          ),
          h(
            'div',
            { class: 'data-actions csv-actions' },
            h('button', { class: 'btn btn-primary', type: 'button', onClick: () => runCsvExport(scopeSelect.value) }, 'Download CSV'),
            h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => runCsvExport(scopeSelect.value, { previewOnly: true }) }, 'Preview / copy CSV'),
          ),
        ),
        h(
          'p',
          { class: 'muted tiny' },
          'Safety guarantees: text fields starting with =, +, -, @, or full-width formula symbols are neutralized with a leading apostrophe (OWASP CWE-1236). Pulse CSV exports weekly anonymity-checked summaries only — never individual responses.',
        ),
        sensitiveCsvScope
          ? h(
              'div',
              { class: 'csv-sensitive-box' },
              h(
                'div',
                null,
                h('strong', { class: 'small' }, sensitiveCsvScope.label),
                h('p', { class: 'muted small' }, sensitiveCsvScope.description),
              ),
              h(
                'div',
                { class: 'data-actions' },
                h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => runCsvExport('conflicts', { previewOnly: true }) }, 'Preview confidential CSV'),
                h('button', { class: 'btn btn-danger btn-small', type: 'button', onClick: exportConfidentialCsvAction }, 'Export confidential CSV'),
              ),
            )
          : null,
      ),
    }),
    card({
      title: 'Event log',
      subtitle: 'Append-oriented audit history, retained during demo cleanup. The most recent 40 entries.',
      body: events.length
        ? table({
            columns: [
              { label: 'When', render: (e) => h('span', { class: 'muted' }, `${e.ts.slice(0, 10)} ${e.ts.slice(11, 16)}`) },
              { label: 'Type', render: (e) => badge(e.type, 'neutral') },
              { label: 'What happened', render: (e) => h('span', null, e.summary) },
            ],
            rows: events,
          })
        : emptyState({ title: 'Nothing logged yet', body: 'Every create, edit and review is recorded here.' }),
    }),
    card({
      title: 'What this app is',
      subtitle: 'Scope, honestly stated.',
      body: h(
        'div',
        { class: 'prose small' },
        h('p', null, 'LeadOS is a local-first leadership workspace. It covers the recurring work of managing people: 1:1s, timely SBI feedback, evidence-backed performance reviews, OKR-style goals with explicit co-authorship, outcome delegation with authority and check-ins, GROW development plans, anonymous pulse, a decision log with DACI roles, recognition, evidence-gated succession planning, and conflict working records with voluntary process, agreement commitments and verified follow-up. It runs entirely in this browser — there is no server, no account and no telemetry.'),
        h('p', null, 'The scoring is deterministic and explainable: each health dimension names its formula, each signal names its rule and evidence, and no number is displayed that cannot be traced back to a record you entered.'),
        h('p', null, 'Frameworks used: GROW development, SBI feedback, feedback balance informed by Radical Candor, Edmondson-inspired pulse questions, DACI and reversible decisions, OKR-shaped goals, behavioural evidence for succession, and interest-based conflict practice. These are transparent adaptations, not validated assessments. Tuckman stage inference and nine-box ranking are deliberately not implemented.'),
        h('p', { class: 'muted' }, 'What it deliberately does not do: it does not score people’s personalities, it does not compare employees against each other with a forced ranking, and it does not infer sentiment from messages. Those are the mechanisms most often used to make talent tooling feel objective while making it less fair.'),
      ),
    }),
  );
}

/** Nudge toward an export before a destructive action, then continue. */
function checkExportFirst(ctx, proceed) {
  if (!ctx.state.people.length) {
    proceed();
    return;
  }
  confirmDialog({
    title: 'Export first?',
    message: 'You have records in this browser. Download a copy before replacing them so nothing is lost.',
    confirmLabel: 'Export then continue',
    onConfirm: () => {
      try {
        const json = ctx.exportJSON();
        if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
          const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
          const link = h('a', { href: url, download: `leados-backup-${ctx.now.toISOString().slice(0, 10)}.json` });
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      } catch {
        /* the demo load still proceeds; the warning was explicit */
      }
      proceed();
    },
  });
}

function labelFor(key) {
  return {
    people: 'People',
    oneOnOnes: '1:1s',
    feedback: 'Feedback notes',
    goals: 'Goals',
    delegations: 'Delegations',
    conflicts: 'Conflict working records',
    growthPlans: 'Growth plans',
    pulses: 'Pulse responses',
    decisions: 'Decisions',
    recognition: 'Recognition',
    readiness: 'Readiness ratings',
    reviews: 'Performance reviews',
  }[key] || key;
}
