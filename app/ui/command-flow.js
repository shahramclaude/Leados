/** ADR-0105: one reviewed note → case + coordinated actions + hierarchy receipt. */
import { h, toast, openModal } from './dom.js';
import { badge, banner, card, emptyState, table } from './components.js';
import { downloadText } from './download.js';
import { runMissionCaptureRehearsal } from './response-worker.js';
import { BUNDLE_LABELS } from '../core/domain/actionBundleRegistry.js';
import { CAPTURE_DISCLOSURE, CAPTURE_PLAYBOOK } from '../core/domain/missionRegistry.js';
import { addDays, dayKey } from '../core/time.js';

const ui = { seatId: null, captureId: '', form: null, busy: false, error: '', reviewed: false };
const actionHelp = {
  decision: 'A governed choice. Adoption never chooses an option.',
  delegation: 'An accountable outcome with a dated checkpoint.',
  premise: 'A declared assumption to test, not an invented fact.',
  coaching: 'A support prompt for the next 1:1, never a person score.',
  budget: 'An explicit commitment against an eligible envelope; not actual spend.',
};
const moduleLabels = { cases: 'Operational cases', decisions: 'Decision log', delegations: 'Owned work & checkpoints', premises: 'Assumption ledger', people: 'Coaching prompts', budgets: 'Budget commitments', commsDrafts: 'Stakeholder briefs', links: 'Typed cross-module relationships', propagationLineage: 'Automation lineage', decisionLocks: 'Decision-time information locks', diligenceChecklists: 'Knowable evidence frontiers' };
function values(report, selected) {
  return ui.form || { text: selected?.sourceText || '', title: selected?.title || '', ownerId: selected?.ownerId || '', reviewOn: selected?.reviewOn || addDays(dayKey(new Date(report.generatedAt)), report.profile.reviewDays), severity: selected?.caseInput?.fmea?.severity || 5, kinds: selected?.kinds || report.profile.commands.filter((k) => k !== 'comms' && k !== 'budget'), budgetId: selected?.budgetId || '', amount: selected?.amount ?? '', priorPct: selected?.priorPct ?? 70 };
}
function field(label, control, hint = '') { return h('div', { class: 'field' }, h('label', { for: control.id }, label), control, hint ? h('p', { class: 'field-hint' }, hint) : null); }
function input(name, value, type = 'text', extra = {}) { return h('input', { id: `flow-${name}`, name, type, value: value ?? '', ...extra }); }
function select(name, options, value) { return h('select', { id: `flow-${name}`, name }, ...options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label))); }
function choose(ctx, id) { ui.captureId = id; ui.form = null; ui.error = ''; ui.reviewed = false; ctx.navigate(`#/mission?panel=capture&capture=${encodeURIComponent(id)}`); ctx.refresh(); }
function readForm(form) {
  const data = new FormData(form);
  return { text: String(data.get('text') || ''), title: String(data.get('title') || ''), ownerId: String(data.get('ownerId') || ''), reviewOn: String(data.get('reviewOn') || ''), severity: String(data.get('severity') || ''), kinds: data.getAll('kinds').map(String), budgetId: String(data.get('budgetId') || ''), amount: String(data.get('amount') || ''), priorPct: String(data.get('priorPct') || '70') };
}
async function prepareAndRehearse(ctx, form, existing) {
  if (ui.busy) return;
  const input = readForm(form); ui.form = input; ui.busy = true; ui.error = ''; ui.reviewed = false; ctx.refresh();
  try {
    const prepared = ctx.api.missionCapturePrepare({ ...input, ...(existing ? { captureId: existing.id } : {}) });
    if (!prepared.ok) { ui.error = prepared.error; return; }
    ui.captureId = prepared.id;
    const revision = ctx.store.state.meta.revision;
    const result = await runMissionCaptureRehearsal(JSON.parse(JSON.stringify(ctx.store.state)), prepared.id, ctx.now);
    if (ctx.store.state.meta.revision !== revision) { ui.error = 'The workspace changed during rehearsal. Your proposal is saved; rehearse it again before adoption.'; return; }
    if (!result.ok) { ui.error = result.error; return; }
    const saved = ctx.api.saveMissionCapturePreview(prepared.id, result);
    if (!saved.ok) { ui.error = saved.error; return; }
    toast('Whole response rehearsed. Nothing is live until you approve it.', 'good');
  } catch (error) { ui.error = error?.message || 'The rehearsal failed. No operational record was created.'; }
  finally { ui.busy = false; ctx.refresh(); }
}
function dismiss(ctx, capture) {
  const reason = h('textarea', { id: 'flow-dismiss-reason', name: 'reason', rows: 3, minlength: 5, maxlength: 600, required: true });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const modal = openModal({ title: 'Dismiss this proposal?', body: h('form', { class: 'stack-sm', onSubmit: (e) => { e.preventDefault(); const result = ctx.api.missionCaptureDismiss(capture.id, reason.value); if (!result.ok) { error.textContent = result.error; return; } modal.close(); toast('Proposal dismissed; its reason remains in history.', 'good'); ctx.refresh(); } }, field('Why is this not the right response?', reason), error, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Dismiss with reason')) });
}
function withdraw(ctx, capture) {
  const reason = h('textarea', { id: 'flow-withdraw-reason', name: 'reason', rows: 3, minlength: 10, maxlength: 600, required: true });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const modal = openModal({ title: 'Withdraw only untouched actions', body: h('form', { class: 'stack-sm', onSubmit: (e) => { e.preventDefault(); const result = ctx.api.missionCaptureWithdraw(capture.id, reason.value); if (!result.ok) { error.textContent = result.error; return; } modal.close(); toast('Untouched actions withdrawn. The source case and history remain.', 'good'); ctx.refresh(); } }, h('p', null, 'Later edits, completed work, spend and sent messages are protected. The source case is never erased by this command.'), field('Why withdraw?', reason), error, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Withdraw untouched actions')) });
}
function editor(ctx, report, selected) {
  const v = values(report, selected); const locked = ui.busy || selected?.status === 'adopted' || selected?.status === 'dismissed';
  const text = h('textarea', { id: 'flow-text', name: 'text', rows: 7, minlength: 12, maxlength: 8000, required: true, disabled: locked, placeholder: 'What happened? What is blocked, who is affected, and what needs a decision? Use observable facts, not confidential mediation or health details.' }, v.text);
  const title = input('title', v.title, 'text', { maxlength: 180, placeholder: 'Leave blank to use the classifier’s suggested title', disabled: locked });
  const owner = select('owner', [{ value: '', label: 'Choose an accountable owner' }, ...report.owners.map((p) => ({ value: p.id, label: `${p.name} · ${p.role || 'Leader'}` }))], v.ownerId); owner.required = true; owner.disabled = locked;
  const review = input('review', v.reviewOn, 'date', { required: true, min: dayKey(new Date(report.generatedAt)), max: addDays(dayKey(new Date(report.generatedAt)), 365), disabled: locked });
  const severity = input('severity', v.severity, 'number', { min: 1, max: 10, step: 1, required: true, disabled: locked });
  const prior = input('prior', v.priorPct, 'number', { min: 5, max: 95, step: 1, disabled: locked });
  const budget = select('budget', [{ value: '', label: 'Choose an eligible envelope' }, ...report.budgets.map((b) => ({ value: b.id, label: `${b.label} · ${b.currency}` }))], v.budgetId); budget.disabled = locked;
  const amount = input('amount', v.amount, 'number', { min: 0.01, max: 1e12, step: 0.01, disabled: locked });
  const form = h('form', { class: 'flow-form', onSubmit: (e) => { e.preventDefault(); prepareAndRehearse(ctx, form, selected); }, onInput: () => { if (!ui.busy) ui.form = readForm(form); }, onKeyDown: (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); form.requestSubmit(); } } },
    h('div', { class: 'flow-compose-grid' },
      h('div', { class: 'flow-note' }, field('The situation, in your own words', text, 'Stays on this device. Ctrl/⌘ + Enter prepares and rehearses. Nothing is adopted automatically.'),
        h('div', { class: 'flow-example-row' }, h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', disabled: locked, onClick: () => { text.value = 'The supplier delivery is late again and the team is overloaded. The billing backlog is blocking handoffs. We need an accountable recovery checkpoint this week.'; ui.form = readForm(form); text.focus(); } }, 'Insert a worked example'), h('span', { class: 'tiny muted' }, 'Illustrative text only; never saved until you prepare it.'))),
      h('div', { class: 'flow-fields' }, field('Case title', title), field('Accountable owner', owner), h('div', { class: 'form-grid' }, field('Review by', review), field('Severity · FMEA', severity, 'A triage rating, not a probability.')))),
    h('fieldset', { class: 'flow-action-picker', disabled: locked }, h('legend', null, 'The coordinated response'),
      h('div', { class: 'flow-action-grid' }, ...report.profile.commands.filter((k) => k !== 'comms').map((kind) => h('label', { class: 'flow-action-option', for: `flow-kind-${kind}` }, h('input', { id: `flow-kind-${kind}`, type: 'checkbox', name: 'kinds', value: kind, checked: v.kinds.includes(kind) }), h('span', null, h('strong', null, BUNDLE_LABELS[kind]), h('small', null, actionHelp[kind]))))),
      v.kinds.includes('premise') ? field('Assumption prior (%) — your declaration', prior, 'A starting belief to test; the classifier did not estimate it.') : null,
      v.kinds.includes('budget') ? h('div', { class: 'form-grid' }, field('Budget envelope', budget), field('Explicit commitment amount', amount, 'Required. An extracted loss is never treated as approved spend.')) : null),
    h('p', { class: 'tiny muted' }, 'Stakeholder briefs are available after the case has reviewed stakeholders. Command Flow never invents a recipient or sends a message.'),
    h('div', { class: 'flow-submit-row' }, h('button', { class: 'btn btn-primary', type: 'submit', disabled: locked }, ui.busy ? 'Rehearsing the whole response…' : selected && ['draft', 'rehearsed'].includes(selected.status) ? 'Save changes & rehearse again' : 'Prepare & rehearse response'),
      selected && ['draft', 'rehearsed'].includes(selected.status) ? h('button', { class: 'btn btn-ghost', type: 'button', disabled: ui.busy, onClick: () => dismiss(ctx, selected) }, 'Dismiss proposal') : null,
      !locked ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { ui.captureId = ''; ui.form = { text: '', title: '', ownerId: '', reviewOn: addDays(dayKey(new Date(report.generatedAt)), report.profile.reviewDays), severity: 5, kinds: report.profile.commands.filter((k) => ['decision', 'delegation'].includes(k)), budgetId: '', amount: '', priorPct: 70 }; ui.error = ''; ui.reviewed = false; ctx.refresh(); } }, 'New note') : null));
  return card({ className: 'flow-editor', title: selected ? 'Review the proposed response' : 'What needs leadership attention?', subtitle: CAPTURE_PLAYBOOK[report.seat.rank], body: form });
}
function explanation(selected) {
  if (!selected) return null;
  const c = selected.classification;
  return card({ title: 'Why this route?', subtitle: 'Transparent on-device evidence. No language model or cloud call.', body: h('div', { class: 'stack-sm' },
    h('div', { class: 'row-gap wrap' }, badge(c.primaryLabel, 'info'), badge(`${c.confidenceBand} heuristic confidence · ${c.confidencePct}%`, c.confidenceBand === 'high' ? 'good' : 'caution'), c.ambiguous ? badge('Close readings — verify', 'caution') : null, c.stakesReviewRequired ? badge('Safety / legal stakes — human review', 'bad') : null),
    h('p', { class: 'muted small' }, 'The percentage is a shrunk lexicon score, not a calibrated probability of the classification being correct. Review the title, owner, severity and every action.'),
    c.evidence.length ? h('ul', { class: 'flow-evidence' }, ...c.evidence.map((e) => h('li', null, h('code', null, e.term), badge(`weight ${e.weight}`, 'neutral'), h('span', null, e.sentence)))) : h('p', { class: 'muted small' }, 'No direct term evidence was retained.'),
    h('div', { class: 'flow-rollup', 'aria-label': 'Automatic hierarchy provenance' }, ...selected.rollup.map((step, i) => h('div', { class: 'flow-rollup-step' }, h('span', { class: 'flow-rollup-index', 'aria-hidden': 'true' }, String(i + 1)), h('strong', null, step.label), h('small', null, `${step.altitudeKey || 'enterprise'} · ${step.horizonDays || 'enterprise'} days`)))),
    h('p', { class: 'tiny muted' }, CAPTURE_DISCLOSURE)) });
}
function approval(ctx, report, selected) {
  if (!selected) return null;
  if (selected.status === 'adopted') {
    const bundle = report.bundles.find((b) => b.id === selected.bundleId);
    return card({ title: 'Adopted as one transaction', subtitle: `Case ${selected.caseId} · bundle ${selected.bundleId}`, body: h('div', { class: 'stack-sm' },
      banner({ tone: 'good', title: 'The case, actions and hierarchy provenance share one receipt', body: 'The decision remains unchosen. Work remains open until people deliver it. No message was sent.' }),
      h('div', { class: 'form-actions' }, h('a', { class: 'btn btn-primary', href: `#/cases?case=${encodeURIComponent(selected.caseId)}` }, 'Open the case'), h('a', { class: 'btn btn-ghost', href: `#/bundles?bundle=${encodeURIComponent(selected.bundleId)}` }, 'Open action receipt'), h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { const result = ctx.api.missionCaptureReceipt(selected.id); if (!result.ok) { toast(result.error, 'bad'); return; } if (!downloadText({ filename: `leados-command-flow-${selected.id}.md`, text: result.text, mime: 'text/markdown' })) openModal({ title: 'Copy the receipt', body: h('textarea', { rows: 14, readonly: true, value: result.text, 'aria-label': 'Command Flow receipt' }) }); } }, 'Download receipt'), bundle?.withdrawable ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => withdraw(ctx, selected) }, 'Withdraw untouched actions') : null)) });
  }
  if (selected.status === 'dismissed') return banner({ tone: 'info', title: 'Proposal dismissed', body: selected.dismissReason });
  const p = selected.preview;
  const reviewed = h('input', { id: 'flow-reviewed', type: 'checkbox', checked: ui.reviewed, disabled: ui.busy, onChange: () => { ui.reviewed = reviewed.checked; const adopt = document.getElementById('flow-adopt'); if (adopt) adopt.disabled = !ui.reviewed || ui.busy || selected.status !== 'rehearsed' || selected.stale; } });
  return card({ title: p ? 'The exact software footprint' : 'Ready to rehearse', subtitle: p ? `${p.ruleIds.length} rule contracts exercised · zero live writes so far` : 'Prepare the response to create a disposable rehearsal.', body: h('div', { class: 'stack-sm' },
    selected.stale ? banner({ tone: 'caution', title: 'Rehearsal expired', body: 'The workspace or calendar changed. Save and rehearse again before adoption.' }) : null,
    selected.commands.length ? h('ul', { class: 'flow-command-list' }, ...selected.commands.map((c) => h('li', null, badge(BUNDLE_LABELS[c.kind], 'info'), h('span', null, c.title)))) : null,
    p ? table({ caption: 'Rehearsed operational changes', rows: p.changes, columns: [{ label: 'Module / ledger', render: (r) => moduleLabels[r.collection] || r.collection }, { label: 'Created', render: (r) => String(r.created) }, { label: 'Updated', render: (r) => String(r.updated) }, { label: 'Removed', render: (r) => String(r.removed) }] }) : null,
    p?.relationships.length ? h('div', { class: 'flow-relations' }, ...p.relationships.map((r) => h('span', { class: 'case-link-pill' }, `${r.sourceType} → ${r.relation} → ${r.targetType} · +${r.added}`))) : null,
    h('p', { class: 'tiny muted' }, 'This is a software effect, not a causal prediction of morale, delivery or financial benefit. Existing rules may create additional checkpoints and evidence locks.'),
    h('label', { class: 'check-row', for: 'flow-reviewed' }, reviewed, h('span', null, 'I reviewed the case, every action, the hierarchy effects and any safety/legal stakes. I understand this is not a causal forecast.')),
    h('button', { id: 'flow-adopt', class: 'btn btn-primary', type: 'button', disabled: !ui.reviewed || ui.busy || selected.status !== 'rehearsed' || selected.stale, onClick: () => {
      const result = ctx.api.missionCaptureCommit(selected.id, report.revision, ui.reviewed);
      if (!result.ok) { ui.error = result.error; toast(result.error, 'bad'); ctx.refresh(); return; }
      ui.reviewed = false; ui.form = null; toast(result.saved ? 'Adopted together. The case, actions and hierarchy now share one receipt.' : result.warning, result.saved ? 'good' : 'bad'); ctx.refresh();
    } }, 'Adopt case + reviewed actions together')) });
}
export function renderCommandFlow(ctx, report, { compact = false } = {}) {
  if (ui.seatId !== report.actingSeatId) { Object.assign(ui, { seatId: report.actingSeatId, captureId: '', form: null, busy: false, error: '', reviewed: false }); }
  const queryId = ctx.query?.get('capture');
  const selected = report.captures.find((c) => c.id === (queryId || ui.captureId)) || report.captures.find((c) => ['draft', 'rehearsed'].includes(c.status)) || null;
  if (compact) return h('div', { class: 'stack-sm' }, banner({ tone: 'info', title: 'Describe it once. LeadOS coordinates the response.', body: CAPTURE_PLAYBOOK[report.seat.rank], actions: [h('a', { class: 'btn btn-primary', href: '#/mission?panel=capture' }, 'Open Command Flow')] }), ui.error ? banner({ tone: 'bad', title: 'Rehearsal needs attention', body: ui.error }) : null);
  return h('div', { class: 'stack-sm command-flow' },
    h('div', { class: 'flow-steps', 'aria-label': 'Command Flow stages' }, ...['Describe', 'Review & rehearse', 'Adopt together', 'Follow through'].map((label, i) => h('span', null, h('b', { 'aria-hidden': 'true' }, String(i + 1)), label))),
    ui.error ? banner({ tone: 'bad', title: 'No unreviewed action was applied', body: ui.error }) : null,
    editor(ctx, report, selected), explanation(selected), approval(ctx, report, selected),
    card({ title: 'Your capture history', subtitle: 'Only this preparing seat can read these notes. Adopted work follows the normal disclosure ladder.', body: report.captures.length ? h('div', { class: 'flow-history' }, ...report.captures.slice(0, 20).map((c) => h('button', { type: 'button', class: `flow-history-row${selected?.id === c.id ? ' is-selected' : ''}`, onClick: () => choose(ctx, c.id) }, h('strong', null, c.title), h('span', null, badge(c.stale ? 'Rehearse again' : c.status, c.status === 'adopted' ? 'good' : c.stale ? 'caution' : 'neutral')), h('small', null, `${c.createdAt.slice(0, 10)} · review ${c.reviewOn}`)))) : emptyState({ title: 'No captures yet', body: 'Start with a real situation. A proposal is not an operational record until you adopt it.' }) }));
}
