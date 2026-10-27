/**
 * app/views/comms.js — Stakeholder Comms Outbox (`#/comms`).
 *
 * The outbox is where the drafts that RULE-COMMS-01..04 generate wait for a
 * human. The app never sends anything: "send" here means the leader sent it
 * elsewhere and is recording that fact. Every action goes through the
 * validated `ctx.api` mutations, so this file holds no business rules.
 *
 * Tabs keep the work in the order a leader does it:
 *   Approve  → drafts written from case facts, awaiting a decision
 *   Ready    → approved text that has not gone out yet
 *   Sent     → the record of what was actually communicated
 *   History  → superseded and dismissed drafts, kept with their reasons
 */

import { h, toast, openModal, confirmDialog } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, emptyState, tabs } from '../ui/components.js';
import { progressBar } from '../ui/charts.js';
import { formatDate, dayKey } from '../core/time.js';
import {
  COMMS_MAX_BODY,
  COMMS_PURPOSE_LABELS,
  COMMS_STALE_APPROVAL_DAYS,
  COMMS_STATUS_LABELS,
  commsSignals,
} from '../core/domain/comms.js';

const TABS = [
  { key: 'approve', label: 'Approve' },
  { key: 'ready', label: 'Ready to send' },
  { key: 'sent', label: 'Sent' },
  { key: 'history', label: 'History' },
];
const TAB_KEYS = new Set(TABS.map((t) => t.key));

const BADGE_TONE = {
  draft: 'warn',
  approved: 'info',
  sent: 'good',
  superseded: 'neutral',
  dismissed: 'neutral',
};

function purposeLabel(row) {
  return COMMS_PURPOSE_LABELS[row.purpose] || row.purpose;
}

function bucketFor(drafts, tab) {
  if (tab === 'approve') return drafts.filter((d) => d.status === 'draft');
  if (tab === 'ready') return drafts.filter((d) => d.status === 'approved');
  if (tab === 'sent') return drafts.filter((d) => d.status === 'sent');
  return drafts.filter((d) => d.status === 'superseded' || d.status === 'dismissed');
}

/* ------------------------------------------------------------- dialogs */

function openMarkSentDialog(ctx, row) {
  const channelInput = h('input', {
    class: 'intake-composer',
    type: 'text',
    value: 'Email',
    maxLength: 80,
    'aria-label': 'How it was sent',
    style: 'min-height:0;height:auto;',
  });
  const dateInput = h('input', {
    class: 'intake-composer',
    type: 'date',
    value: dayKey(ctx.now),
    max: dayKey(ctx.now),
    'aria-label': 'Date sent',
    style: 'min-height:0;height:auto;',
  });
  const dialog = openModal({
    title: `Record that ${row.stakeholderName} was sent this`,
    description: 'LeadOS does not send messages. Record how and when you sent it so the stakeholder schedule and the closure rule stay accurate.',
    body: h('div', { class: 'view-stack' },
      h('label', { class: 'tiny muted' }, 'Date sent', dateInput),
      h('label', { class: 'tiny muted' }, 'Channel (email, chat, meeting, …)', channelInput)),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const res = ctx.api.markCommsDraftSent(row.id, { channel: channelInput.value, sentOn: dateInput.value });
          dialog.close();
          if (res.ok) { toast('Recorded as sent', 'good'); ctx.refresh(); } else toast(res.error, 'bad');
        },
      }, 'Record as sent'),
    ],
    size: 'sm',
  });
}

function openDismissDialog(ctx, row) {
  const reasonInput = h('textarea', {
    class: 'intake-composer',
    rows: 3,
    maxLength: 400,
    placeholder: 'Why should this message not go out? (required, kept in the record)',
    'aria-label': 'Dismiss reason',
  });
  const dialog = openModal({
    title: 'Dismiss this message?',
    description: 'It stays in History with your reason. Nothing else is changed.',
    body: reasonInput,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const res = ctx.api.dismissCommsDraft(row.id, { reason: reasonInput.value });
          dialog.close();
          if (res.ok) { toast('Message dismissed', 'neutral'); ctx.refresh(); } else toast(res.error, 'bad');
        },
      }, 'Dismiss message'),
    ],
    size: 'sm',
  });
}

function approve(ctx, row) {
  const proceed = (acknowledgeGaps) => {
    const res = ctx.api.approveCommsDraft(row.id, { acknowledgeGaps });
    if (res.ok) { toast(`Approved for ${row.stakeholderName}. Record it as sent once it goes out.`, 'good'); ctx.refresh(); }
    else toast(res.error, 'bad');
  };
  if (!row.missing.length) { proceed(false); return; }
  confirmDialog({
    title: 'Approve with facts still to confirm?',
    message: `These facts are not recorded on the case: ${row.missing.join(', ')}. The message states each one as “to confirm”. Record them on the case to remove the gap, or approve and accept the gap explicitly.`,
    confirmLabel: 'Approve with acknowledged gaps',
    onConfirm: () => proceed(true),
  });
}

/* ------------------------------------------------------------- cards */

function draftCard(ctx, row, caseTitle) {
  const isOpen = row.status === 'draft' || row.status === 'approved';
  const subjectInput = h('input', {
    class: 'intake-composer',
    type: 'text',
    value: row.subject,
    maxLength: 160,
    disabled: !isOpen,
    'aria-label': `Subject for ${row.stakeholderName}`,
    style: 'min-height:0;height:auto;',
  });
  const bodyInput = h('textarea', {
    class: 'intake-composer',
    rows: Math.min(14, Math.max(5, row.body.split('\n').length + 1)),
    maxLength: COMMS_MAX_BODY,
    disabled: !isOpen,
    'aria-label': `Message body for ${row.stakeholderName}`,
  }, row.body);

  const actions = [];
  if (isOpen) {
    actions.push(h('button', {
      class: 'btn',
      type: 'button',
      onClick: () => {
        const res = ctx.api.editCommsDraft(row.id, { subject: subjectInput.value, body: bodyInput.value });
        if (res.ok) {
          toast(row.status === 'approved' ? 'Saved. The approval was withdrawn because the text changed.' : 'Saved', row.status === 'approved' ? 'warn' : 'good');
          ctx.refresh();
        } else toast(res.error, 'bad');
      },
    }, 'Save edits'));
    actions.push(h('button', {
      class: 'btn',
      type: 'button',
      onClick: async () => {
        const text = `${subjectInput.value}\n\n${bodyInput.value}`;
        try {
          await navigator.clipboard.writeText(text);
          toast('Message copied to the clipboard', 'good');
        } catch {
          toast('Copy failed. Select the text and copy it manually.', 'bad');
        }
      },
    }, 'Copy message'));
  }
  if (row.status === 'draft') {
    actions.push(h('button', { class: 'btn btn-primary', type: 'button', onClick: () => approve(ctx, row) }, 'Approve'));
  }
  if (row.status === 'approved' || row.status === 'draft') {
    actions.push(h('button', { class: 'btn', type: 'button', onClick: () => openMarkSentDialog(ctx, row) }, 'Record as sent'));
    actions.push(h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openDismissDialog(ctx, row) }, 'Dismiss'));
  }

  const approvedAge = row.status === 'approved' && row.approvedOn
    ? Math.round((Date.parse(`${dayKey(ctx.now)}T00:00:00Z`) - Date.parse(`${row.approvedOn}T00:00:00Z`)) / 86400000)
    : 0;

  const gapList = row.missing.length
    ? h('p', { class: 'tiny', role: 'note' },
      h('strong', null, 'Still to confirm on the case: '),
      row.missing.join(', '))
    : h('p', { class: 'tiny muted' }, 'Every required fact is recorded on the case.');

  const footerMeta = [];
  footerMeta.push(`Written ${formatDate(row.createdOn)}`);
  if (row.approvedOn) footerMeta.push(`approved ${formatDate(row.approvedOn)}`);
  if (row.sentOn) footerMeta.push(`sent ${formatDate(row.sentOn)} via ${row.channel || 'outside LeadOS'}`);
  if (row.supersededReason) footerMeta.push(`superseded: ${row.supersededReason}`);
  if (row.dismissedReason) footerMeta.push(`dismissed: ${row.dismissedReason}`);
  if (row.edited && isOpen) footerMeta.push('edited by you');

  return h('article', { class: `comms-card comms-${row.status}`, 'aria-label': `${purposeLabel(row)} for ${row.stakeholderName}` },
    h('header', { class: 'comms-card-head' },
      h('div', null,
        h('div', { class: 'row-actions' },
          badge(purposeLabel(row), row.purpose === 'closure' ? 'info' : 'neutral'),
          badge(COMMS_STATUS_LABELS[row.status] || row.status, BADGE_TONE[row.status] || 'neutral')),
        h('h3', { class: 'comms-card-title' }, row.stakeholderName),
        h('p', { class: 'tiny muted' },
          'Case: ',
          h('a', { href: `#/cases/${row.caseId}` }, caseTitle || 'Operational case'))),
      isOpen && row.purpose === 'brief'
        ? h('div', { class: 'comms-readiness', style: 'min-width:160px;' },
          progressBar(Math.round(row.readiness * 100), { label: 'Facts recorded' }))
        : null),
    row.status === 'approved' && approvedAge >= COMMS_STALE_APPROVAL_DAYS
      ? banner({ tone: 'warn', title: 'Approved but not yet sent', body: `Approved ${approvedAge} days ago. Send it or dismiss it, so the outbox does not go quietly stale.` })
      : null,
    isOpen && row.purpose === 'brief' ? gapList : null,
    h('label', { class: 'tiny muted' }, 'Subject', subjectInput),
    h('label', { class: 'tiny muted' }, 'Message', bodyInput),
    actions.length ? h('div', { class: 'row-actions' }, ...actions) : null,
    h('footer', { class: 'tiny muted comms-card-foot' }, footerMeta.join(' · ')));
}

/* ------------------------------------------------------------- view */

export function renderComms(ctx) {
  const tab = TAB_KEYS.has(ctx.query.get('tab')) ? ctx.query.get('tab') : 'approve';
  const drafts = (ctx.state.commsDrafts || []).slice();
  const caseTitle = new Map((ctx.state.cases || []).map((c) => [c.id, c.title]));
  const signals = commsSignals(ctx.state, ctx.now);

  const awaiting = drafts.filter((d) => d.status === 'draft');
  const closureOwed = awaiting.filter((d) => d.purpose === 'closure').length;
  const approved = drafts.filter((d) => d.status === 'approved');
  const sent = drafts.filter((d) => d.status === 'sent');

  const rows = bucketFor(drafts, tab).slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const tabBody = rows.length
    ? h('div', { class: 'comms-list', role: 'list' }, ...rows.map((row) => h('div', { role: 'listitem' }, draftCard(ctx, row, caseTitle.get(row.caseId)))))
    : emptyState({
      icon: '✉',
      title: tab === 'approve'
        ? 'Nothing waiting for approval'
        : tab === 'ready'
          ? 'Nothing approved and unsent'
          : tab === 'sent' ? 'No messages recorded as sent yet' : 'No superseded or dismissed messages',
      body: tab === 'approve'
        ? 'Drafts appear here when you register or update a case with key or opposing stakeholders. A case with no such stakeholders produces none.'
        : 'Drafts move through this outbox as you approve, send and record them.',
    });

  const signalCards = signals.map((s) => banner({
    tone: s.severity >= 3 ? 'warn' : 'info',
    title: s.title,
    body: s.detail,
    actions: s.action ? [h('a', { class: 'btn btn-ghost', href: s.action.route }, s.action.label)] : [],
  }));

  return h('div', { class: 'view-stack' },
    pageHeader({
      eyebrow: 'Stakeholder comms outbox',
      title: 'Drafted from facts, sent by you',
      subtitle: 'Every case you register already knows who needs to hear about it. This outbox writes those messages from what is recorded on the case, shows what is still missing, and waits for your approval. Nothing leaves the app.',
    }),
    h('div', { class: 'stat-grid' },
      stat({ label: 'Awaiting approval', value: awaiting.length, hint: closureOwed ? `${closureOwed} closure note(s) owed` : 'Drafted from case facts', tone: awaiting.length ? 'warn' : '' }),
      stat({ label: 'Approved, not sent', value: approved.length, hint: 'Send, then record it', tone: approved.length ? 'info' : '' }),
      stat({ label: 'Recorded as sent', value: sent.length, hint: 'Your communication record' })),
    signalCards.length ? h('div', { class: 'view-stack' }, ...signalCards) : null,
    tabs({
      items: TABS.map((t) => ({ key: t.key, label: t.label, count: bucketFor(drafts, t.key).length || undefined })),
      active: tab,
      onSelect: (key) => ctx.navigate(`#/comms?tab=${key}`),
      ariaLabel: 'Comms outbox sections',
    }),
    card({
      title: TABS.find((t) => t.key === tab)?.label || 'Outbox',
      subtitle: tab === 'approve'
        ? 'Review, edit and approve. Changing a case fact supersedes the draft and says why.'
        : tab === 'history'
          ? 'Superseded drafts keep the reason they were replaced. Nothing here is deleted.'
          : null,
      body: tabBody,
    }));
}
