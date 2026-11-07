/** ADR-0105 / ADR-0114 / ADR-0116: one reviewed note or cross-span LCA merge → case + coordinated actions + hierarchy receipt. */
import { h, toast, openModal } from './dom.js';
import { badge, banner, card, emptyState, table } from './components.js';
import { downloadText } from './download.js';
import { runMissionCaptureRehearsal } from './response-worker.js';
import { renderCaptureBriefBulk, renderCaptureBriefs } from './command-flow-brief.js';
import { BUNDLE_LABELS } from '../core/domain/actionBundleRegistry.js';
import { CAPTURE_DISCLOSURE, CAPTURE_PLAYBOOK, MERGE_DISCLOSURE } from '../core/domain/missionRegistry.js';
import { addDays, dayKey } from '../core/time.js';

const ui = { seatId: null, captureId: '', form: null, busy: false, error: '', reviewed: false, edits: null, editsFor: null, mergeCandidate: null };
const DEFAULT_DECISION_OPTIONS = [
  { label: 'Proceed with the reviewed response', pros: 'Coordinated action', cons: 'Uses resources' },
  { label: 'Gather evidence first', pros: 'Reduces uncertainty', cons: 'Waiting has a cost' },
];
const EDIT_MAX = { title: 180, question: 1000, outcome: 1000, statement: 1000, signpost: 400, prompt: 180 };
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
function editInput(name, value, onInput, extra = {}) { return h('input', { id: `flow-edit-${name}`, name: `flow-edit-${name}`, type: 'text', value: value ?? '', onInput, ...extra }); }
function editArea(name, value, onInput, extra = {}) { return h('textarea', { id: `flow-edit-${name}`, name: `flow-edit-${name}`, rows: 2, value: value ?? '', onInput, ...extra }); }
function input(name, value, type = 'text', extra = {}) { return h('input', { id: `flow-${name}`, name, type, value: value ?? '', ...extra }); }
function select(name, options, value) { return h('select', { id: `flow-${name}`, name }, ...options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label))); }
function choose(ctx, id) { ui.captureId = id; ui.mergeCandidate = null; ui.form = null; ui.error = ''; ui.reviewed = false; ctx.navigate(`#/mission?panel=capture&capture=${encodeURIComponent(id)}`); ctx.refresh(); }
const cloneEdits = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? JSON.parse(JSON.stringify(v)) : null;
const editOf = (kind) => ui.edits?.[kind] || {};
function writeEdit(kind, patch) {
  const edits = { ...(ui.edits || {}) };
  const cur = { ...(edits[kind] || {}), ...patch };
  for (const key of Object.keys(cur)) if (cur[key] === '' || cur[key] == null) delete cur[key];
  if (Object.keys(cur).length) edits[kind] = cur; else delete edits[kind];
  ui.edits = Object.keys(edits).length ? edits : null;
}
function setEdit(kind, key, value) { writeEdit(kind, { [key]: String(value ?? '').slice(0, EDIT_MAX[key] || 1000).trim() }); }
function optionValues() { const o = ui.edits?.decision?.options; return o ? o.map((x) => ({ ...x })) : DEFAULT_DECISION_OPTIONS.map((x) => ({ ...x })); }
function setOption(index, key, value) {
  const opts = optionValues();
  if (!opts[index]) return;
  opts[index] = { ...opts[index], [key]: String(value ?? '').slice(0, key === 'label' ? 120 : 300) };
  writeEdit('decision', { options: opts });
}
function addOption(ctx) { const opts = optionValues(); if (opts.length >= 5 || !ctx) return; opts.push({ label: '', pros: '', cons: '' }); writeEdit('decision', { options: opts }); ctx.refresh(); }
function removeOption(ctx, index) { const opts = optionValues(); if (opts.length <= 2 || !ctx) return; opts.splice(index, 1); writeEdit('decision', { options: opts }); ctx.refresh(); }
function readForm(form) {
  const data = new FormData(form);
  return { text: String(data.get('text') || ''), title: String(data.get('title') || ''), ownerId: String(data.get('ownerId') || ''), reviewOn: String(data.get('reviewOn') || ''), severity: String(data.get('severity') || ''), kinds: data.getAll('kinds').map(String), budgetId: String(data.get('budgetId') || ''), amount: String(data.get('amount') || ''), priorPct: String(data.get('priorPct') || '70') };
}
function stageMergeCandidate(ctx, report, cand) {
  ui.captureId = '';
  ui.mergeCandidate = cand;
  ui.edits = null;
  ui.editsFor = `merge:${cand.dedupeFingerprint}`;
  ui.form = {
    text: '',
    title: cand.suggestedTitle,
    ownerId: cand.defaultOwnerId,
    reviewOn: cand.suggestedReviewOn,
    severity: cand.maxSeverity,
    kinds: report.profile.commands.filter((k) => k !== 'comms' && k !== 'budget'),
    budgetId: '',
    amount: '',
    priorPct: 70,
  };
  ui.error = '';
  ui.reviewed = false;
  ctx.refresh();
}
async function prepareAndRehearse(ctx, form, existing, mergeSpec = null) {
  if (ui.busy) return;
  const input = readForm(form); ui.form = input; ui.busy = true; ui.error = ''; ui.reviewed = false;
  // ADR-0114: the sent edits are the COMPLETE set for the actions kept this
  // round — an emptied field clears its edit instead of resurrecting the old one.
  const commandEdits = Object.fromEntries(Object.entries(ui.edits || {}).filter(([kind]) => input.kinds.includes(kind)));
  ctx.refresh();
  try {
    const payload = { ...input, commandEdits: Object.keys(commandEdits).length ? commandEdits : null, ...(existing ? { captureId: existing.id } : {}) };
    const prepared = mergeSpec
      ? ctx.api.missionCapturePrepareMerge({ ...payload, memberCaptureIds: mergeSpec.memberCaptureIds, dedupeFingerprint: mergeSpec.dedupeFingerprint })
      : ctx.api.missionCapturePrepare(payload);
    if (!prepared.ok) { ui.error = prepared.error; return; }
    ui.captureId = prepared.id;
    ui.mergeCandidate = null;
    const revision = ctx.store.state.meta.revision;
    const result = await runMissionCaptureRehearsal(JSON.parse(JSON.stringify(ctx.store.state)), prepared.id, ctx.now);
    if (ctx.store.state.meta.revision !== revision) { ui.error = 'The workspace changed during rehearsal. Your proposal is saved; rehearse it again before adoption.'; return; }
    if (!result.ok) { ui.error = result.error; return; }
    const saved = ctx.api.saveMissionCapturePreview(prepared.id, result);
    if (!saved.ok) { ui.error = saved.error; return; }
    toast(mergeSpec ? 'Consolidated LCA response rehearsed. Nothing is live until you approve it.' : 'Whole response rehearsed. Nothing is live until you approve it.', 'good');
  } catch (error) { ui.error = error?.message || 'The rehearsal failed. No operational record was created.'; }
  finally { ui.busy = false; ctx.refresh(); }
}
function dismiss(ctx, capture) {
  const reason = h('textarea', { id: 'flow-dismiss-reason', name: 'reason', rows: 3, minlength: 5, maxlength: 600, required: true });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const modal = openModal({ title: 'Dismiss this proposal?', body: h('form', { class: 'stack-sm', onSubmit: (e) => { e.preventDefault(); const result = ctx.api.missionCaptureDismiss(capture.id, reason.value); if (!result.ok) { error.textContent = result.error; return; } modal.close(); toast('Proposal dismissed; its reason remains in history.', 'good'); ctx.refresh(); } }, field('Why is this not the right response?', reason), error, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Dismiss with reason')) });
}
function dismissMerge(ctx, cand) {
  const reason = h('textarea', { id: 'flow-dismiss-merge-reason', name: 'reason', rows: 3, minlength: 5, maxlength: 600, required: true });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const modal = openModal({ title: 'Decline cross-span consolidation?', body: h('form', { class: 'stack-sm', onSubmit: (e) => {
    e.preventDefault();
    const result = ctx.api.missionCaptureDismissMerge({ memberCaptureIds: cand.memberCaptureIds, dedupeFingerprint: cand.dedupeFingerprint, reason: reason.value });
    if (!result.ok) { error.textContent = result.error; return; }
    if (ui.mergeCandidate?.dedupeFingerprint === cand.dedupeFingerprint) { ui.mergeCandidate = null; ui.form = null; }
    modal.close();
    toast('Merge proposal declined; subordinate captures remain open in their own spans.', 'good');
    ctx.refresh();
  } }, h('p', { class: 'small muted' }, 'Declining keeps each subordinate span’s capture open for local handling. Record why these constraints are distinct.'), field('Why are these constraints distinct?', reason), error, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Decline consolidation with reason')) });
}
function withdraw(ctx, capture) {
  const reason = h('textarea', { id: 'flow-withdraw-reason', name: 'reason', rows: 3, minlength: 10, maxlength: 600, required: true });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const modal = openModal({ title: 'Withdraw only untouched actions', body: h('form', { class: 'stack-sm', onSubmit: (e) => { e.preventDefault(); const result = ctx.api.missionCaptureWithdraw(capture.id, reason.value); if (!result.ok) { error.textContent = result.error; return; } modal.close(); toast('Untouched actions withdrawn. The source case and history remain.', 'good'); ctx.refresh(); } }, h('p', null, 'Later edits, completed work, spend and sent messages are protected. The source case is never erased by this command.'), field('Why withdraw?', reason), error, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Withdraw untouched actions')) });
}
function commandDetail(c) {
  if (!c) return '';
  if (c.kind === 'decision') {
    const opts = Array.isArray(c.options) && c.options.length ? c.options : DEFAULT_DECISION_OPTIONS;
    return `${c.question ? `${c.question} · ` : ''}${opts.length} options: ${opts.map((o) => o.label).join(' / ')}`.slice(0, 240);
  }
  if (c.kind === 'delegation') return (c.outcome || '').slice(0, 240);
  if (c.kind === 'premise') return [c.statement || '', c.signpost ? `Signpost: ${c.signpost}` : ''].filter(Boolean).join(' · ').slice(0, 240);
  if (c.kind === 'coaching') return (c.prompt || '').slice(0, 240);
  return '';
}
function commandEditsSection(ctx, v, locked) {
  const kinds = ['decision', 'delegation', 'premise', 'coaching'].filter((k) => v.kinds.includes(k));
  if (!kinds.length) return null;
  const t = v.title || 'the case title';
  const e = (kind) => editOf(kind);
  const onI = (kind, key) => (ev) => setEdit(kind, key, ev.target.value);
  const editField = (kind, key, label, placeholder, { area = false, max = 1000, hint = '' } = {}) => {
    const control = area
      ? editArea(`${kind}-${key}`, e(kind)[key] || '', onI(kind, key), { maxlength: max, placeholder, disabled: locked })
      : editInput(`${kind}-${key}`, e(kind)[key] || '', onI(kind, key), { maxlength: max, placeholder, disabled: locked });
    return field(label, control, hint);
  };
  const sections = kinds.map((kind) => {
    const head = h('p', { class: 'flow-command-edit-kind' }, h('strong', null, BUNDLE_LABELS[kind]), h('small', { class: 'muted' }, ' · your words, kept verbatim'));
    if (kind === 'decision') {
      const opts = optionValues();
      return h('div', { class: 'flow-command-edit', dataset: { kind } }, head,
        editField('decision', 'title', 'Action name', `Choose the recovery path: ${t}`, { max: EDIT_MAX.title }),
        editField('decision', 'question', 'The decision to make', `What should we do about ${t}?`, { max: EDIT_MAX.question }),
        h('div', { class: 'flow-options', role: 'group', 'aria-label': 'Decision options' },
          h('div', { class: 'flow-option-head', 'aria-hidden': 'true' }, h('span', null, 'Option'), h('span', null, 'Pros'), h('span', null, 'Cons'), h('span', null, '')),
          ...opts.map((o, i) => h('div', { class: 'flow-option-row' },
            editInput(`decision-option-${i}-label`, o.label, (ev) => setOption(i, 'label', ev.target.value), { maxlength: 120, placeholder: `Option ${i + 1} name`, 'aria-label': `Option ${i + 1} name`, disabled: locked }),
            editInput(`decision-option-${i}-pros`, o.pros, (ev) => setOption(i, 'pros', ev.target.value), { maxlength: 300, placeholder: 'Pros', 'aria-label': `Option ${i + 1} pros`, disabled: locked }),
            editInput(`decision-option-${i}-cons`, o.cons, (ev) => setOption(i, 'cons', ev.target.value), { maxlength: 300, placeholder: 'Cons', 'aria-label': `Option ${i + 1} cons`, disabled: locked }),
            h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', disabled: locked || opts.length <= 2, 'aria-label': `Remove option ${i + 1}`, onClick: () => removeOption(ctx, i) }, 'Remove'))),
          h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', disabled: locked || opts.length >= 5, onClick: () => addOption(ctx) }, 'Add another option'),
          h('p', { class: 'tiny muted' }, 'Two to five named options. Adoption records the question and options you approve; it never chooses one.')));
    }
    if (kind === 'delegation') {
      return h('div', { class: 'flow-command-edit', dataset: { kind } }, head,
        editField('delegation', 'title', 'Action name', `Verify the recovery checkpoint: ${t}`, { max: EDIT_MAX.title }),
        editField('delegation', 'outcome', 'What “done” looks like', 'Record the result, remaining blockers and the next checkpoint.', { area: true, max: EDIT_MAX.outcome, hint: 'Owned by the person chosen above; the receipt tracks delivery, not effort.' }));
    }
    if (kind === 'premise') {
      return h('div', { class: 'flow-command-edit', dataset: { kind } }, head,
        editField('premise', 'title', 'Assumption name', `Recovery holds: ${t}`, { max: EDIT_MAX.title }),
        editField('premise', 'statement', 'The assumption to test', `${t} will hold through the next review. This is a declaration, not evidence.`, { area: true, max: EDIT_MAX.statement }),
        editField('premise', 'signpost', 'How you will know it broke', 'Compare the promised recovery checkpoint with dated delivery evidence; record what would disprove this assumption.', { max: EDIT_MAX.signpost, hint: 'A falsifiable observation with a date — RAND assumption-based planning.' }));
    }
    return h('div', { class: 'flow-command-edit', dataset: { kind } }, head,
      editField('coaching', 'title', 'Prompt subject', t, { max: EDIT_MAX.title }),
      editField('coaching', 'prompt', 'The prompt for the 1:1', `What support would help with ${t}? Discuss the system, not blame.`, { max: EDIT_MAX.prompt, hint: 'A support prompt, never a person score.' }));
  });
  return h('fieldset', { class: 'flow-command-edits', disabled: locked },
    h('legend', null, 'Read the response, word by word'),
    h('p', { class: 'tiny muted' }, 'Every action below is proposed words, not policy. Change anything before rehearsing — the rehearsal prints exactly what you approve, and adoption freezes it.'),
    ...sections);
}
function mergeCandidatesCard(ctx, report) {
  const list = report.mergeCandidates || [];
  if (!list.length) return null;
  return card({
    className: 'flow-merge-candidates',
    title: 'Cross-span constraint merges awaiting confirmation',
    subtitle: 'Two or more subordinate spans described a matching constraint. Confirm whether they share one root bottleneck before rehearsing one LCA-owned case — raw notes stay with the preparing seats.',
    body: h('div', { class: 'stack-sm' },
      ...list.map((cand) => h('div', { class: 'flow-merge-candidate', dataset: { dedupe: cand.dedupeFingerprint } },
        h('div', { class: 'row-gap wrap' },
          badge(cand.primaryLabel, 'info'),
          badge(`${cand.members.length} spans · LCA ${cand.lcaLabel}`, 'caution'),
          badge(`resemblance ${cand.resemblancePct}% · dedupe ${cand.dedupeFingerprint.slice(0, 8)}`, 'neutral'),
          cand.sharedLineageCount ? badge(`${cand.sharedLineageCount} shared lineage edge${cand.sharedLineageCount === 1 ? '' : 's'}`, 'good') : null,
          cand.stakesReviewRequired ? badge('Safety / legal stakes — human review', 'bad') : null),
        table({
          caption: `Subordinate span proposals · dedupe ${cand.dedupeFingerprint.slice(0, 8)}`,
          rows: cand.members,
          columns: [
            { label: 'Subordinate span', render: (m) => m.spanLabel },
            { label: 'Disclosed proposal', render: (m) => m.disclosedTitle },
            { label: 'FMEA severity', render: (m) => String(m.severity) },
            { label: 'Review by', render: (m) => m.reviewOn },
          ],
        }),
        h('p', { class: 'tiny muted' }, cand.disclosure),
        h('div', { class: 'form-actions' },
          cand.openMergeCaptureId
            ? h('button', { class: 'btn btn-primary', type: 'button', onClick: () => choose(ctx, cand.openMergeCaptureId) }, 'Open prepared consolidation')
            : h('button', { class: 'btn btn-primary', type: 'button', disabled: ui.busy, onClick: () => stageMergeCandidate(ctx, report, cand) }, 'Stage consolidated LCA response'),
          h('button', { class: 'btn btn-ghost', type: 'button', disabled: ui.busy, onClick: () => dismissMerge(ctx, cand) }, 'Not the same constraint'))))),
  });
}
function editor(ctx, report, selected) {
  const mergeSpec = ui.mergeCandidate || (selected?.mergeFromIds?.length ? {
    dedupeFingerprint: selected.dedupeFingerprint,
    memberCaptureIds: selected.mergeFromIds,
    primaryLabel: selected.classification?.primaryLabel || 'Operational constraint',
  } : null);
  const v = values(report, selected);
  const locked = ui.busy || ['adopted', 'merged', 'dismissed'].includes(selected?.status);
  const text = h('textarea', { id: 'flow-text', name: 'text', rows: 7, minlength: 12, maxlength: 8000, required: !mergeSpec, disabled: locked, placeholder: 'What happened? What is blocked, who is affected, and what needs a decision? Use observable facts, not confidential mediation or health details.' }, v.text);
  const title = input('title', v.title, 'text', { maxlength: 180, placeholder: 'Leave blank to use the classifier’s suggested title', disabled: locked });
  const owner = select('owner', [{ value: '', label: 'Choose an accountable owner' }, ...report.owners.map((p) => ({ value: p.id, label: `${p.name} · ${p.role || 'Leader'}` }))], v.ownerId); owner.required = true; owner.disabled = locked;
  const review = input('review', v.reviewOn, 'date', { required: true, min: dayKey(new Date(report.generatedAt)), max: addDays(dayKey(new Date(report.generatedAt)), 365), disabled: locked });
  const severity = input('severity', v.severity, 'number', { min: 1, max: 10, step: 1, required: true, disabled: locked });
  const prior = input('prior', v.priorPct, 'number', { min: 5, max: 95, step: 1, disabled: locked });
  const budget = select('budget', [{ value: '', label: 'Choose an eligible envelope' }, ...report.budgets.map((b) => ({ value: b.id, label: `${b.label} · ${b.currency}` }))], v.budgetId); budget.disabled = locked;
  const amount = input('amount', v.amount, 'number', { min: 0.01, max: 1e12, step: 0.01, disabled: locked });
  const leftColumn = mergeSpec
    ? h('div', { class: 'flow-note flow-merge-brief' },
      h('div', { class: 'row-gap wrap' },
        badge(`LCA consolidation · ${mergeSpec.memberCaptureIds.length} spans`, 'caution'),
        badge(`Dedupe ${mergeSpec.dedupeFingerprint}`, 'neutral'),
        badge(mergeSpec.primaryLabel, 'info')),
      h('p', { class: 'small' }, 'Confirming this consolidation creates ONE LCA-owned operational case and ONE coordinated response across the participating subordinate branches, and marks each constituent capture as merged in the same atomic transaction.'),
      h('p', { class: 'tiny muted' }, MERGE_DISCLOSURE),
      !locked ? h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => { ui.mergeCandidate = null; ui.captureId = ''; ui.form = null; ui.error = ''; ctx.refresh(); } }, 'Switch to single-span note') : null)
    : h('div', { class: 'flow-note' }, field('The situation, in your own words', text, 'Stays on this device. Ctrl/⌘ + Enter prepares and rehearses. Nothing is adopted automatically.'),
      h('div', { class: 'flow-example-row' }, h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', disabled: locked, onClick: () => { text.value = 'The supplier delivery is late again and the team is overloaded. The billing backlog is blocking handoffs. We need an accountable recovery checkpoint this week.'; ui.form = readForm(form); text.focus(); } }, 'Insert a worked example'), h('span', { class: 'tiny muted' }, 'Illustrative text only; never saved until you prepare it.')));
  const form = h('form', { class: 'flow-form', onSubmit: (e) => { e.preventDefault(); prepareAndRehearse(ctx, form, selected, mergeSpec); }, onInput: () => { if (!ui.busy) ui.form = readForm(form); }, onKeyDown: (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); form.requestSubmit(); } } },
    h('div', { class: 'flow-compose-grid' },
      leftColumn,
      h('div', { class: 'flow-fields' }, field('Case title', title), field('Accountable owner', owner), h('div', { class: 'form-grid' }, field('Review by', review), field('Severity · FMEA', severity, 'A triage rating, not a probability.')))),
    h('fieldset', { class: 'flow-action-picker', disabled: locked }, h('legend', null, 'The coordinated response'),
      h('div', { class: 'flow-action-grid' }, ...report.profile.commands.filter((k) => k !== 'comms').map((kind) => h('label', { class: 'flow-action-option', for: `flow-kind-${kind}` }, h('input', { id: `flow-kind-${kind}`, type: 'checkbox', name: 'kinds', value: kind, checked: v.kinds.includes(kind), onChange: () => { ui.form = readForm(form); ctx.refresh(); } }), h('span', null, h('strong', null, BUNDLE_LABELS[kind]), h('small', null, actionHelp[kind]))))),
      (v.kinds.includes('premise') || v.kinds.includes('decision'))
        ? field('Response confidence (%) — frozen at adoption', prior,
          'Your own 5–95% declaration. LeadOS freezes it when the response is adopted and grades it once from dated evidence (ADR-0107). It is not a classifier estimate and never becomes a person score.')
        : null,
      v.kinds.includes('budget') ? h('div', { class: 'form-grid' }, field('Budget envelope', budget), field('Explicit commitment amount', amount, 'Required. An extracted loss is never treated as approved spend.')) : null),
    commandEditsSection(ctx, v, locked),
    h('p', { class: 'tiny muted' }, 'Stakeholder briefs are available after the case has reviewed stakeholders. Command Flow never invents a recipient or sends a message.'),
    h('div', { class: 'flow-submit-row' }, h('button', { class: 'btn btn-primary', type: 'submit', disabled: locked }, ui.busy ? 'Rehearsing the whole response…' : selected && ['draft', 'rehearsed'].includes(selected.status) ? 'Save changes & rehearse again' : mergeSpec ? 'Prepare & rehearse consolidated LCA response' : 'Prepare & rehearse response'),
      selected && ['draft', 'rehearsed'].includes(selected.status) ? h('button', { class: 'btn btn-ghost', type: 'button', disabled: ui.busy, onClick: () => dismiss(ctx, selected) }, 'Dismiss proposal') : null,
      !locked ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { ui.captureId = ''; ui.mergeCandidate = null; ui.form = { text: '', title: '', ownerId: '', reviewOn: addDays(dayKey(new Date(report.generatedAt)), report.profile.reviewDays), severity: 5, kinds: report.profile.commands.filter((k) => ['decision', 'delegation'].includes(k)), budgetId: '', amount: '', priorPct: 70 }; ui.error = ''; ui.reviewed = false; ctx.refresh(); } }, 'New note') : null));
  return card({ className: 'flow-editor', title: mergeSpec ? 'Consolidate cross-span constraint at LCA' : selected ? 'Review the proposed response' : 'What needs leadership attention?', subtitle: CAPTURE_PLAYBOOK[report.seat.rank], body: form });
}
function explanation(selected) {
  if (!selected) return null;
  const c = selected.classification;
  const adv = selected.mergeAdvisory;
  const isMerge = Boolean(selected.mergeFromIds?.length);
  return card({ title: 'Why this route?', subtitle: 'Transparent on-device evidence. No language model or cloud call.', body: h('div', { class: 'stack-sm' },
    adv ? banner({
      tone: 'info',
      title: `Cross-span overlap detected · dedupe ${adv.dedupeFingerprint.slice(0, 8)}`,
      body: `${adv.peerSpanCount} sibling span(s) under ${adv.lcaLabel} (${adv.lcaAltitudeKey}) prepared an open capture matching this ${adv.primaryLabel.toLowerCase()} constraint${adv.sharedLineageCount ? ` (${adv.sharedLineageCount} shared lineage edge${adv.sharedLineageCount === 1 ? '' : 's'})` : ''}. Your raw note was not shared; ${adv.lcaLabel} can confirm one consolidated LCA-owned case.`,
    }) : null,
    h('div', { class: 'row-gap wrap' },
      badge(c.primaryLabel, 'info'),
      badge(isMerge ? `Broder resemblance · ${c.confidencePct}%` : `${c.confidenceBand} heuristic confidence · ${c.confidencePct}%`, c.confidenceBand === 'high' ? 'good' : 'caution'),
      isMerge ? badge(`${selected.mergeFromIds.length} spans · dedupe ${selected.dedupeFingerprint.slice(0, 8)}`, 'neutral') : null,
      c.ambiguous ? badge('Close readings — verify', 'caution') : null,
      c.stakesReviewRequired ? badge('Safety / legal stakes — human review', 'bad') : null),
    h('p', { class: 'muted small' }, isMerge
      ? 'Resemblance is a weighted Jaccard overlap over keyed one-way constraint shingles and graph lineage anchors, not a causal proof that both spans face the identical root cause. Confirm before adopting.'
      : 'The percentage is a shrunk lexicon score, not a calibrated probability of the classification being correct. Review the title, owner, severity and every action.'),
    c.evidence.length ? h('ul', { class: 'flow-evidence' }, ...c.evidence.map((e) => h('li', null, h('code', null, e.term), badge(`weight ${e.weight}`, 'neutral'), h('span', null, e.sentence)))) : h('p', { class: 'muted small' }, isMerge ? 'Constituent raw notes and sentences remain at the preparing seats.' : 'No direct term evidence was retained.'),
    h('div', { class: 'flow-rollup', 'aria-label': 'Automatic hierarchy provenance' }, ...selected.rollup.map((step, i) => h('div', { class: 'flow-rollup-step' }, h('span', { class: 'flow-rollup-index', 'aria-hidden': 'true' }, String(i + 1)), h('strong', null, step.label), h('small', null, `${step.altitudeKey || 'enterprise'} · ${step.horizonDays || 'enterprise'} days`)))),
    h('p', { class: 'tiny muted' }, isMerge ? MERGE_DISCLOSURE : CAPTURE_DISCLOSURE)) });
}
function receiptDownloadButton(ctx, selected) {
  return h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => {
    const result = ctx.api.missionCaptureReceipt(selected.id);
    if (!result.ok) { toast(result.error, 'bad'); return; }
    if (!downloadText({ filename: `leados-command-flow-${selected.id}.md`, text: result.text, mime: 'text/markdown' })) {
      openModal({ title: 'Copy the receipt', body: h('textarea', { rows: 14, readonly: true, value: result.text, 'aria-label': 'Command Flow receipt' }) });
    }
  } }, 'Download receipt');
}
function approval(ctx, report, selected) {
  if (!selected) return null;
  if (selected.status === 'merged') {
    return card({ title: 'Consolidated at lowest common ancestor', subtitle: `LCA case ${selected.caseId} · bundle ${selected.bundleId}`, body: h('div', { class: 'stack-sm' },
      banner({ tone: 'good', title: 'Absorbed into one LCA-owned case and coordinated response', body: 'Your raw note stayed on this seat and was never copied upward. Ancestors coordinate through the shared case and receipt.' }),
      h('div', { class: 'form-actions' },
        h('a', { class: 'btn btn-primary', href: `#/cases?case=${encodeURIComponent(selected.caseId)}` }, 'Open the consolidated case'),
        h('a', { class: 'btn btn-ghost', href: `#/bundles?bundle=${encodeURIComponent(selected.bundleId)}` }, 'Open action receipt'),
        receiptDownloadButton(ctx, selected))) });
  }
  if (selected.status === 'adopted') {
    const bundle = report.bundles.find((b) => b.id === selected.bundleId);
    const isMerge = Boolean(selected.mergeFromIds?.length);
    return h('div', { class: 'stack-sm' }, card({ title: isMerge ? `Adopted consolidated LCA case (${selected.mergeFromIds.length} spans)` : 'Adopted as one transaction', subtitle: `Case ${selected.caseId} · bundle ${selected.bundleId}${isMerge ? ` · dedupe ${selected.dedupeFingerprint.slice(0, 8)}` : ''}`, body: h('div', { class: 'stack-sm' },
      banner({ tone: 'good', title: 'The case, actions and hierarchy provenance share one receipt', body: isMerge ? 'All constituent captures were settled to merged in the same atomic write. The decision remains unchosen; no message was sent.' : 'The decision remains unchosen. Work remains open until people deliver it. No message was sent.' }),
      h('div', { class: 'form-actions' }, h('a', { class: 'btn btn-primary', href: `#/cases?case=${encodeURIComponent(selected.caseId)}` }, 'Open the case'), h('a', { class: 'btn btn-ghost', href: `#/bundles?bundle=${encodeURIComponent(selected.bundleId)}` }, 'Open action receipt'), receiptDownloadButton(ctx, selected), bundle?.withdrawable ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => withdraw(ctx, selected) }, 'Withdraw untouched actions') : null)) }),
    report.seat.rank >= 3 ? h('div', { class: 'stack-sm' }, renderCaptureBriefBulk(ctx, selected), renderCaptureBriefs(ctx, selected)) : null);
  }
  if (selected.status === 'dismissed') return banner({ tone: 'info', title: 'Proposal dismissed', body: selected.dismissReason });
  const p = selected.preview;
  const isMerge = Boolean(selected.mergeFromIds?.length);
  const reviewed = h('input', { id: 'flow-reviewed', type: 'checkbox', checked: ui.reviewed, disabled: ui.busy, onChange: () => { ui.reviewed = reviewed.checked; const adopt = document.getElementById('flow-adopt'); if (adopt) adopt.disabled = !ui.reviewed || ui.busy || selected.status !== 'rehearsed' || selected.stale; } });
  return card({ title: p ? 'The exact software footprint' : 'Ready to rehearse', subtitle: p ? `${p.ruleIds.length} rule contracts exercised · zero live writes so far` : 'Prepare the response to create a disposable rehearsal.', body: h('div', { class: 'stack-sm' },
    selected.stale ? banner({ tone: 'caution', title: 'Rehearsal expired', body: 'The workspace or calendar changed. Save and rehearse again before adoption.' }) : null,
    selected.commands.length ? h('ul', { class: 'flow-command-list' }, ...selected.commands.map((c) => h('li', null, badge(BUNDLE_LABELS[c.kind], 'info'), h('span', null, c.title, commandDetail(c) ? h('small', { class: 'flow-command-detail' }, commandDetail(c)) : null)))) : null,
    p ? table({ caption: 'Rehearsed operational changes', rows: p.changes, columns: [{ label: 'Module / ledger', render: (r) => moduleLabels[r.collection] || r.collection }, { label: 'Created', render: (r) => String(r.created) }, { label: 'Updated', render: (r) => String(r.updated) }, { label: 'Removed', render: (r) => String(r.removed) }] }) : null,
    p?.relationships.length ? h('div', { class: 'flow-relations' }, ...p.relationships.map((r) => h('span', { class: 'case-link-pill' }, `${r.sourceType} → ${r.relation} → ${r.targetType} · +${r.added}`))) : null,
    h('p', { class: 'tiny muted' }, 'This is a software effect, not a causal prediction of morale, delivery or financial benefit. Existing rules may create additional checkpoints and evidence locks.'),
    h('label', { class: 'check-row', for: 'flow-reviewed' }, reviewed, h('span', null, isMerge
      ? `I confirmed these ${selected.mergeFromIds.length} subordinate captures share one root constraint (dedupe ${selected.dedupeFingerprint.slice(0, 8)}), and reviewed the LCA case, every action and hierarchy effects.`
      : 'I reviewed the case, every action, the hierarchy effects and any safety/legal stakes. I understand this is not a causal forecast.')),
    h('button', { id: 'flow-adopt', class: 'btn btn-primary', type: 'button', disabled: !ui.reviewed || ui.busy || selected.status !== 'rehearsed' || selected.stale, onClick: () => {
      const result = ctx.api.missionCaptureCommit(selected.id, report.revision, ui.reviewed);
      if (!result.ok) { ui.error = result.error; toast(result.error, 'bad'); ctx.refresh(); return; }
      ui.reviewed = false; ui.form = null; ui.mergeCandidate = null; toast(result.saved ? 'Adopted together. The case, actions and hierarchy now share one receipt.' : result.warning, result.saved ? 'good' : 'bad'); ctx.refresh();
    } }, isMerge ? 'Adopt consolidated LCA case + reviewed actions together' : 'Adopt case + reviewed actions together')) });
}
export function renderCommandFlow(ctx, report, { compact = false } = {}) {
  if (ui.seatId !== report.actingSeatId) { Object.assign(ui, { seatId: report.actingSeatId, captureId: '', form: null, busy: false, error: '', reviewed: false, mergeCandidate: null }); }
  const queryId = ctx.query?.get('capture');
  const selected = ui.mergeCandidate ? null : (report.captures.find((c) => c.id === (queryId || ui.captureId)) || report.captures.find((c) => ['draft', 'rehearsed'].includes(c.status)) || null);
  // ADR-0114: the editable words belong to ONE capture. Switching captures (or
  // starting a new note / staging a merge) re-seeds the editors cleanly.
  const editsFor = ui.mergeCandidate ? `merge:${ui.mergeCandidate.dedupeFingerprint}` : (selected?.id || 'new');
  if (ui.editsFor !== editsFor) { ui.edits = cloneEdits(selected?.commandEdits); ui.editsFor = editsFor; }
  const mergeN = (report.mergeCandidates || []).length;
  if (compact) return h('div', { class: 'stack-sm' }, banner({ tone: mergeN ? 'caution' : 'info', title: mergeN ? `${mergeN} cross-span constraint merge${mergeN === 1 ? '' : 's'} awaiting confirmation` : 'Describe it once. LeadOS coordinates the response.', body: mergeN ? `${CAPTURE_PLAYBOOK[report.seat.rank]} Confirm whether matching subordinate captures share one LCA-owned case.` : CAPTURE_PLAYBOOK[report.seat.rank], actions: [h('a', { class: 'btn btn-primary', href: '#/mission?panel=capture' }, mergeN ? 'Review cross-span merges' : 'Open Command Flow')] }), ui.error ? banner({ tone: 'bad', title: 'Rehearsal needs attention', body: ui.error }) : null);
  return h('div', { class: 'stack-sm command-flow' },
    h('div', { class: 'flow-steps', 'aria-label': 'Command Flow stages' }, ...['Describe', 'Review & rehearse', 'Adopt together', 'Follow through'].map((label, i) => h('span', null, h('b', { 'aria-hidden': 'true' }, String(i + 1)), label))),
    ui.error ? banner({ tone: 'bad', title: 'No unreviewed action was applied', body: ui.error }) : null,
    mergeCandidatesCard(ctx, report),
    editor(ctx, report, selected), explanation(selected), approval(ctx, report, selected),
    card({ title: 'Your capture history', subtitle: 'Only this preparing seat can read these notes. Adopted work follows the normal disclosure ladder.', body: report.captures.length ? h('div', { class: 'flow-history' }, ...report.captures.slice(0, 20).map((c) => h('button', { type: 'button', class: `flow-history-row${selected?.id === c.id ? ' is-selected' : ''}`, onClick: () => choose(ctx, c.id) }, h('strong', null, c.title), h('span', null, badge(c.stale ? 'Rehearse again' : c.status, ['adopted', 'merged'].includes(c.status) ? 'good' : c.stale ? 'caution' : 'neutral')), h('small', null, `${c.createdAt.slice(0, 10)} · review ${c.reviewOn}${c.mergeFromIds?.length ? ` · ${c.mergeFromIds.length} spans` : ''}`)))) : emptyState({ title: 'No captures yet', body: 'Start with a real situation. A proposal is not an operational record until you adopt it.' }) }));
}
