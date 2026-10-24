/**
 * app/views/settings.js — thresholds, data portability, and the audit trail.
 * A leadership tool holds sensitive notes; the owner must be able to take the
 * data out and see exactly what has been recorded.
 */

import { h, toast, confirmDialog, openModal, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, emptyState, table } from '../ui/components.js';
import { formatDate } from '../core/time.js';
import { openSettingsDialog } from '../ui/modals.js';
import { SCHEMA_VERSION } from '../core/schema.js';

export function renderSettings(ctx) {
  const { state, now } = ctx;
  const s = state.settings;
  const counts = {
    people: state.people.length,
    oneOnOnes: state.oneOnOnes.length,
    feedback: state.feedback.length,
    goals: state.goals.length,
    growthPlans: state.growthPlans.length,
    pulses: state.pulses.length,
    decisions: state.decisions.length,
    recognition: state.recognition.length,
    readiness: state.readiness.length,
  };

  const bytes = ctx.storageSize();
  const events = state.events.slice().reverse().slice(0, 40);

  const thresholdRows = [
    ['1:1 cadence', `${s.oneOnOneCadenceDays} days`],
    ['Feedback target', `${s.feedbackTargetDays} days`],
    ['Goal check-in', `${s.goalCheckinDays} days`],
    ['Recognition target', `${s.recognitionTargetDays} days`],
    ['Decision review default', `${s.decisionReviewDays} days`],
    ['Growth plan review', `${s.growthReviewDays} days`],
    ['Onboarding window', `${s.onboardingDays} days`],
    ['Direct reports before warning', `${s.maxReportsPerManager}`],
    ['Pulse anonymity floor', `${s.pulseMinResponses} responses`],
  ];

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
      footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => toast('Select the text and copy it', 'neutral') }, 'Close')],
      size: 'lg',
    });
  };

  const importAction = () => {
    const input = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', id: 'import-file' });
    const label = h('label', { class: 'btn btn-ghost', for: 'import-file' }, 'Choose a file…');
    const status = h('p', { class: 'muted small', 'aria-live': 'polite' });
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = ctx.importJSON(String(reader.result));
        if (!result.ok) {
          status.textContent = result.error;
          status.className = 'field-error';
          return;
        }
        dialog.close();
        toast(`Imported ${result.imported.people} people and ${result.imported.events} events`, 'good');
        ctx.navigate('#/today');
      };
      reader.onerror = () => {
        status.textContent = 'The file could not be read.';
      };
      reader.readAsText(file);
    });
    const dialog = openModal({
      title: 'Import a LeadOS export',
      description: 'This replaces everything currently stored in this browser. Export first if you are unsure.',
      body: h('div', { class: 'form' }, h('div', { class: 'field' }, label, input, status), h('p', { class: 'muted small' }, 'The file is validated and repaired before it replaces anything. If it is not a LeadOS workspace, nothing changes.')),
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
      subtitle: `Schema v${SCHEMA_VERSION} · stored in this browser only · nothing leaves this device.`,
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
      stat({ label: 'Event log', value: state.events.length, hint: 'append-only, capped at 600' }),
      stat({ label: 'Stored size', value: bytes > 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`, hint: 'browser localStorage' }),
      stat({ label: 'Last saved', value: state.meta.updatedAt.slice(11, 16), hint: `${formatDate(state.meta.updatedAt)} · revision ${state.meta.revision}` }),
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
      title: 'Take your data with you',
      subtitle: 'Plain JSON, readable in any text editor. No account, no server, no lock-in.',
      body: h(
        'div',
        { class: 'data-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onClick: exportAction }, 'Export JSON'),
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
      title: 'Event log',
      subtitle: 'Append-only record of what changed. The most recent 40 entries.',
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
        h('p', null, 'LeadOS is a local-first leadership workspace. It covers the recurring work of managing people: 1:1s, SBI feedback, OKR-style goals, GROW development plans, anonymous pulse, a decision log with DACI roles, recognition, and evidence-gated succession planning. It runs entirely in this browser — there is no server, no account and no telemetry.'),
        h('p', null, 'The scoring is deterministic and explainable: each health dimension names its formula, each signal names its rule and evidence, and no number is displayed that cannot be traced back to a record you entered.'),
        h('p', null, 'Frameworks drawn on: situational leadership and GROW (Whitmore), SBI feedback and the Radical Candor 2×2 (Kim Scott), Tuckman stages, Edmondson’s psychological safety, DACI and Bezos-style one-way/two-way door decisions, OKRs (Doerr), and 9-box succession practice — adapted so that ratings require evidence rather than assertion.'),
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
          const link = h('a', { href: url, download: `leados-backup-${new Date().toISOString().slice(0, 10)}.json` });
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
    growthPlans: 'Growth plans',
    pulses: 'Pulse responses',
    decisions: 'Decisions',
    recognition: 'Recognition',
    readiness: 'Readiness ratings',
  }[key] || key;
}
