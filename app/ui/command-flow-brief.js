/** Scoped stakeholder-brief follow-through for a case adopted in Command Flow. */
import { h, openModal, toast } from './dom.js';
import { badge, banner, card } from './components.js';
import { STAKEHOLDER_STANCES } from '../core/domain/cases.js';
import { COMMS_MAX_BODY } from '../core/domain/comms.js';
import { dayKey } from '../core/time.js';

const field = (label, control, hint = '') => h('div', { class: 'field' }, h('label', { for: control.id }, label), control,
  hint ? h('p', { class: 'field-hint' }, hint) : null);
const text = (id, value = '', max = 120) => h('input', { id, type: 'text', value, required: true, maxlength: max });
const choice = (id, items) => h('select', { id, required: true }, h('option', { value: '' }, 'Choose…'),
  ...items.map(([value, label]) => h('option', { value }, label)));
const errorLine = () => h('p', { class: 'form-error', role: 'alert' });
const numberChoices = [1, 2, 3, 4, 5].map((n) => [String(n), String(n)]);

function newBriefDialog(ctx, capture) {
  const name = text('flow-brief-name'); const role = text('flow-brief-role');
  const power = choice('flow-brief-power', numberChoices);
  const interest = choice('flow-brief-interest', numberChoices);
  const stance = choice('flow-brief-stance', STAKEHOLDER_STANCES.map((s) => [s, s]));
  const keyMessage = h('textarea', { id: 'flow-brief-context', rows: 2, maxlength: 600 });
  const previewBox = h('div', { class: 'flow-brief-preview', hidden: true });
  const acknowledge = h('input', { id: 'flow-brief-reviewed', type: 'checkbox', disabled: true });
  const submit = h('button', { class: 'btn btn-primary', type: 'button', disabled: true, onClick: () => {
    if (!shown || !acknowledge.checked) return;
    const result = ctx.api.missionCaptureBriefDraft(capture.id, { ...recipient(), expectedRevision: shown.revision,
      previewFingerprint: shown.fingerprint, reviewed: true });
    if (!result.ok) { error.textContent = result.error; return; }
    dialog.close(); toast(result.warning || 'Unsent brief created from the adopted case. Review its text before approving.', result.warning ? 'bad' : 'good'); ctx.refresh();
  } }, 'Create unsent draft');
  const error = errorLine();
  let shown = null;
  const recipient = () => ({ name: name.value, role: role.value, power: power.value, interest: interest.value,
    stance: stance.value, keyMessage: keyMessage.value });
  const form = h('form', { class: 'stack-sm', onInput: (event) => {
    if (event.target === acknowledge) return;
    shown = null; previewBox.hidden = true; previewBox.replaceChildren(); acknowledge.checked = false;
    acknowledge.disabled = true; submit.disabled = true;
  }, onSubmit: (event) => {
    event.preventDefault();
    const result = ctx.api.missionCaptureBriefPreview(capture.id, recipient());
    if (!result.ok) { shown = null; error.textContent = result.error; return; }
    error.textContent = ''; shown = result;
    previewBox.replaceChildren(
      h('h4', null, `To ${result.recipient.name} · ${result.quadrant}`),
      h('p', { class: 'muted small' }, `${Math.round(result.preview.readiness * 100)}% of required case facts recorded · ${result.preview.missing.length ? `To confirm: ${result.preview.missing.join(', ')}` : 'No required facts missing'}`),
      h('strong', null, result.preview.subject), h('pre', { class: 'flow-brief-body' }, result.preview.body),
      h('p', { class: 'tiny muted' }, 'Preview only. The case and existing automation create this exact draft after you confirm; nothing is sent. Unconfirmed facts remain labelled, not invented.'));
    previewBox.hidden = false; acknowledge.disabled = false; acknowledge.checked = false; submit.disabled = true;
  } },
  h('p', { class: 'muted small' }, 'Name an actual recipient. Assess Mendelow power × interest and current stance; only key players or skeptical/blocking stakeholders qualify. The adopted case supplies the message facts; an exact name match links to the existing stakeholder register without guessing from the private note.'),
  h('div', { class: 'form-grid' }, field('Recipient name', name), field('Recipient role', role),
    field('Power (1–5)', power), field('Interest (1–5)', interest)),
  field('Current stance', stance), field('Previously agreed message (optional)', keyMessage,
    'Only record words already agreed; otherwise leave blank. Never include confidential mediation or health details.'),
  error,
  h('button', { class: 'btn btn-ghost', type: 'submit' }, 'Preview exact recipient & message'),
  previewBox,
  h('label', { class: 'check-row', for: 'flow-brief-reviewed' }, acknowledge,
    h('span', null, 'I confirmed this real recipient, the case facts and every gap. This creates a draft, not a sent message.')),
  submit);
  acknowledge.addEventListener('change', () => { submit.disabled = !shown || !acknowledge.checked; });
  const dialog = openModal({ title: 'Brief a stakeholder on the adopted case', body: form });
}

function messageDialog(ctx, capture, reading, row, action) {
  const error = errorLine();
  let form;
  const onResult = (result, label) => {
    if (!result.ok) { error.textContent = result.error; return; }
    dialog.close(); toast(result.warning || label, result.warning ? 'bad' : 'good'); ctx.refresh();
  };
  if (action === 'edit') {
    const subject = text('flow-brief-subject', row.subject, 160);
    const body = h('textarea', { id: 'flow-brief-body', rows: 10, required: true, maxlength: COMMS_MAX_BODY, value: row.body });
    form = h('form', { class: 'stack-sm', onSubmit: (e) => { e.preventDefault(); onResult(ctx.api.missionCaptureBriefEdit(capture.id, row.id,
      { subject: subject.value, body: body.value, expectedRevision: reading.revision }), 'Message edited. Any earlier approval was withdrawn.'); } },
    field('Subject', subject), field('Message text', body), h('p', { class: 'tiny muted' }, 'Editing an approved message withdraws its approval. The case remains the factual source.'), error,
    h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save reviewed text'));
  } else if (action === 'approve') {
    const gaps = row.missing || [];
    const ack = h('input', { id: 'flow-brief-gaps', type: 'checkbox', required: gaps.length > 0 });
    form = h('form', { class: 'stack-sm', onSubmit: (e) => { e.preventDefault(); onResult(ctx.api.missionCaptureBriefApprove(capture.id, row.id,
      { expectedRevision: reading.revision, acknowledgeGaps: gaps.length > 0 && ack.checked }), 'Brief approved. It has not been sent.'); } },
    h('p', null, `Approve “${row.subject}” for ${row.stakeholderName}? Review the exact text on the case card first.`),
    gaps.length ? h('label', { class: 'check-row', for: 'flow-brief-gaps' }, ack, `I acknowledge unconfirmed case facts: ${gaps.join(', ')}`) : null,
    error, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Approve the reviewed brief'));
  } else if (action === 'sent') {
    const channel = text('flow-brief-channel', '', 80);
    const sentOn = h('input', { id: 'flow-brief-sent-on', type: 'date', value: dayKey(ctx.now), required: true, max: dayKey(ctx.now) });
    const ack = h('input', { id: 'flow-brief-external', type: 'checkbox', required: true });
    form = h('form', { class: 'stack-sm', onSubmit: (e) => { e.preventDefault(); onResult(ctx.api.missionCaptureBriefSent(capture.id, row.id,
      { channel: channel.value, sentOn: sentOn.value, reviewed: ack.checked, expectedRevision: reading.revision }), 'Delivery recorded; case stakeholder cadence advanced.'); } },
    field('How you sent it outside LeadOS', channel), field('Date sent', sentOn),
    h('label', { class: 'check-row', for: 'flow-brief-external' }, ack, 'I already sent this approved message outside LeadOS. This records it; the app does not send.'),
    error, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Record external delivery'));
  } else {
    const reason = h('textarea', { id: 'flow-brief-dismiss-reason', rows: 2, minlength: 3, maxlength: 400, required: true });
    form = h('form', { class: 'stack-sm', onSubmit: (e) => { e.preventDefault(); onResult(ctx.api.missionCaptureBriefDismiss(capture.id, row.id,
      { reason: reason.value, expectedRevision: reading.revision }), 'Draft dismissed with its reason retained.'); } },
    field('Why should this unsent message not go out?', reason), error,
    h('button', { class: 'btn btn-ghost', type: 'submit' }, 'Dismiss unsent draft'));
  }
  const dialog = openModal({ title: `${action === 'sent' ? 'Record delivery' : action === 'approve' ? 'Approve brief' : action === 'edit' ? 'Review the exact words' : 'Dismiss brief'} · ${row.stakeholderName}`, body: form });
}

export function renderCaptureBriefs(ctx, capture) {
  const reading = ctx.api.missionCaptureBriefRead(capture.id);
  if (!reading.ok) return banner({ tone: 'caution', title: 'Stakeholder briefs unavailable', body: reading.error });
  const rows = reading.drafts.slice(0, 30);
  return card({ className: 'flow-briefs', title: 'Stakeholder briefs · adopted case',
    subtitle: `${reading.caseTitle} · case ${reading.caseId} · Mendelow (1981) audience; ITIL 4 closed-loop follow-through`,
    body: h('div', { class: 'stack-sm' },
      h('p', { class: 'muted small' }, 'Add a real recipient with a reviewed salience/stance assessment. The existing case and post-commit rules draft only recorded facts. Review, edit and approve here; record delivery only after sending elsewhere. Case ownership and the typed hierarchy provenance remain unchanged.'),
      reading.canDraft ? h('button', { class: 'btn btn-primary', type: 'button', onClick: () => newBriefDialog(ctx, capture) }, 'Preview & draft for a named recipient')
        : banner({ tone: 'info', title: 'New briefs paused', body: 'The case is closed or automation is paused. Existing message history remains here.' }),
      reading.drafts.length > rows.length ? h('p', { class: 'tiny muted' }, `${reading.drafts.length - rows.length} older messages are not shown in this card. Open the case outbox from the local operator view for full history.`) : null,
      ...(rows.length ? rows.map((row) => h('article', { class: 'flow-brief-message' },
        h('div', { class: 'row-gap wrap' }, h('strong', null, row.stakeholderName), badge(row.purpose === 'closure' ? 'Closure note' : 'Status brief', 'info'), badge(row.status, row.status === 'sent' ? 'good' : row.status === 'draft' ? 'caution' : 'neutral')),
        h('p', { class: 'tiny muted' }, `${Math.round((row.readiness || 0) * 100)}% case facts recorded${row.missing.length ? ` · To confirm: ${row.missing.join(', ')}` : ''}`),
        h('strong', null, row.subject), h('pre', { class: 'flow-brief-body' }, row.body),
        row.sentOn ? h('p', { class: 'tiny muted' }, `Recorded sent ${row.sentOn} · ${row.channel || 'outside LeadOS'}`) : null,
        row.dismissedReason ? h('p', { class: 'tiny muted' }, `Dismissed: ${row.dismissedReason}`) : null,
        ['draft', 'approved'].includes(row.status) ? h('div', { class: 'form-actions' },
          h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => messageDialog(ctx, capture, reading, row, 'edit') }, 'Edit words'),
          row.status === 'draft' ? h('button', { class: 'btn btn-tiny btn-primary', type: 'button', onClick: () => messageDialog(ctx, capture, reading, row, 'approve') }, 'Approve reviewed text') : null,
          row.status === 'approved' ? h('button', { class: 'btn btn-tiny btn-primary', type: 'button', onClick: () => messageDialog(ctx, capture, reading, row, 'sent') }, 'Record external delivery') : null,
          h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => messageDialog(ctx, capture, reading, row, 'dismiss') }, 'Dismiss')) : null))
        : [h('p', { class: 'muted small' }, 'No messages yet. Add a named stakeholder to prepare the first unsent draft.')])) });
}
