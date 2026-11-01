/** Response Studio — one guided path from situation note to coordinated action. */
import { h, toast, confirmDialog, openModal } from '../ui/dom.js';
import { pageHeader, card, badge, banner, table, emptyState } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { analyzeIntakeText, toCaseInput } from '../core/domain/intake.js';
import { responseEconomics, responsePlanReport, responseBrief, responseSourceFingerprint, RESPONSE_LABELS, RESPONSE_STRATEGIES } from '../core/domain/response.js';
import { runResponseRehearsal } from '../ui/response-worker.js';

const EXAMPLE = 'Our supplier delivery is delayed by three weeks. The production delay will cost about 40,000 USD, the team is overloaded, and the sponsor wants an escalation this week.';
const workbench = {
  text: '', analysis: null, draftId: null, planId: null, caseInput: null,
  strategy: 'contain', fieldsConfirmed: false, safetyReviewed: false, busy: false,
  assumptions: { currency: 'USD', mitigationBudget: 5000, weeklyDelayLow: 1000, weeklyDelayMode: 2000, weeklyDelayHigh: 4000, delayDays: 14, evidenceDays: 3 },
};
const money = (value, currency) => `${currency} ${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const clone = (value) => JSON.parse(JSON.stringify(value));

function field(label, key, value, { type = 'number', min, max, step = 'any', options = null, wide = false } = {}) {
  const id = `response-${key.replaceAll('.', '-')}`;
  const props = { id, name: key, type, value: value ?? '', min, max, step };
  const input = options
    ? h('select', { id, name: key }, ...options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(value ?? '') }, o.label)))
    : type === 'textarea' ? h('textarea', props, value || '') : h('input', props);
  return h('div', { class: `field${wide ? ' response-field-wide' : ''}` }, h('label', { for: id }, label), input);
}

function hero(ctx) {
  const report = responsePlanReport(ctx.state, ctx.now);
  return h('section', { class: 'response-hero', 'aria-labelledby': 'response-title' },
    h('div', { class: 'response-hero-copy' },
      h('p', { class: 'response-eyebrow' }, 'LEADOS · RESPONSE STUDIO'),
      h('h1', { id: 'response-title' }, 'One situation. A coordinated response.'),
      h('p', null, 'Describe what happened. Review the facts. Rehearse the ripple across your team, decisions, risk and stakeholders—then choose what becomes real.'),
      h('div', { class: 'response-hero-badges' }, badge('On-device', 'good'), badge('Human-approved', 'good'), badge('No messages sent', 'neutral'))),
    h('div', { class: 'response-hero-stats', 'aria-label': 'Response ledger summary' },
      h('div', null, h('strong', null, String(report.open.length)), h('span', null, 'open plans')),
      h('div', null, h('strong', null, String(report.due.length)), h('span', null, 'due reviews')),
      h('div', null, h('strong', null, String(report.committed.length)), h('span', null, 'adopted'))));
}

function evidencePanel(analysis) {
  if (!analysis) return null;
  if (analysis.privacyBlocked || analysis.conflictPrivacyWall) return banner({ tone: 'warn', title: 'Confidential conflict wall',
    body: 'This note stays out of the operational response graph. Open Conflict resolution to create a private record yourself.',
    actions: [h('a', { class: 'btn btn-small btn-ghost', href: '#/conflicts' }, 'Open private workspace')] });
  if (analysis.insufficient) return banner({ tone: 'caution', title: 'Add concrete evidence', body: analysis.insufficientReasons.join(' ') });
  const top = analysis.categories.slice(0, 3);
  return card({ title: 'What the note actually says', subtitle: 'Deterministic local classification—not a language model, diagnosis or probability of the event.', body:
    h('div', { class: 'stack-sm' },
      analysis.stakesReviewRequired ? banner({ tone: 'bad', title: 'Safety / legal review required', body: 'Verify every field. Delayed response is unavailable; follow your organisation’s escalation procedure.' }) : null,
      ...top.map((cat) => h('div', { class: 'response-evidence-row' },
        h('div', null, h('strong', null, cat.label), h('p', { class: 'muted tiny' }, cat.evidence.filter((e) => !e.negated).slice(0, 2).map((e) => `“${e.term}”`).join(' · ') || 'No direct term match')),
        badge(`${Math.round(cat.probability * 100)}% heuristic`, cat.id === analysis.primaryCategoryId ? 'good' : 'neutral'))),
      h('p', { class: 'muted tiny' }, `${analysis.entities.people.length} roster match(es) · ${analysis.entities.money.length} money mention(s). Ambiguous people are never auto-selected.`)) });
}

function reviewForm(ctx) {
  const input = workbench.caseInput;
  if (!input) return null;
  const a = workbench.assumptions;
  const people = ctx.state.people.filter((p) => p.status !== 'archived');
  const stakeholder = input.stakeholders?.[0] || {};
  const form = h('form', { class: 'response-form', onSubmit: (e) => e.preventDefault() },
    h('div', { class: 'response-form-grid' },
      field('Case title', 'title', input.title, { type: 'text', wide: true }),
      field('Accountable owner', 'ownerId', input.ownerId, { options: [{ value: '', label: 'Unassigned — verify before work is delegated' }, ...people.map((p) => ({ value: p.id, label: p.name }))] }),
      field('Review date', 'reviewOn', input.reviewOn, { type: 'date' }),
      field('Severity (1–10)', 'fmea.severity', input.fmea?.severity, { min: 1, max: 10, step: 1 }),
      field('Occurrence (1–10)', 'fmea.probability', input.fmea?.probability, { min: 1, max: 10, step: 1 }),
      field('Detection gap (1–10)', 'fmea.detectability', input.fmea?.detectability, { min: 1, max: 10, step: 1 }),
      field('Likely exposure', 'financial.mostLikely', input.financial?.mostLikely, { min: 0 }),
      field('Pessimistic exposure', 'financial.pessimistic', input.financial?.pessimistic, { min: 0 }),
      field('Currency', 'currency', a.currency, { type: 'text' }),
      field('Mitigation budget', 'mitigationBudget', a.mitigationBudget, { min: 0 }),
      field('Weekly delay cost · low', 'weeklyDelayLow', a.weeklyDelayLow, { min: 0 }),
      field('Weekly delay cost · mode', 'weeklyDelayMode', a.weeklyDelayMode, { min: 0 }),
      field('Weekly delay cost · high', 'weeklyDelayHigh', a.weeklyDelayHigh, { min: 0 }),
      field('Delay to compare (days)', 'delayDays', a.delayDays, { min: 1, max: 90, step: 1 }),
      field('Evidence window (days)', 'evidenceDays', a.evidenceDays, { min: 1, max: 30, step: 1 }),
      field('Key stakeholder (optional)', 'stakeholderName', stakeholder.name, { type: 'text' }),
      field('Stakeholder role', 'stakeholderRole', stakeholder.role, { type: 'text' }),
      field('Stakeholder power (1–5)', 'stakeholderPower', stakeholder.power || 4, { min: 1, max: 5, step: 1 }),
      field('Stakeholder interest (1–5)', 'stakeholderInterest', stakeholder.interest || 4, { min: 1, max: 5, step: 1 })),
    h('p', { class: 'muted tiny' }, 'FMEA ratings are ordinal judgements, not measured probabilities. Money and delay costs are your declarations; blank is never silently treated as zero. A stakeholder brief is drafted, never sent.'));
  return card({ title: '2 · Review the facts and assumptions', subtitle: 'The classifier proposes. You decide. These values drive the real case action and its fan-out.', body: form });
}

function readForm(root) {
  const value = (key) => root.querySelector(`[name="${key}"]`)?.value ?? '';
  const next = clone(workbench.caseInput);
  next.title = value('title'); next.ownerId = value('ownerId') || null; next.reviewOn = value('reviewOn') || null;
  next.fmea = { ...next.fmea, severity: Number(value('fmea.severity')), probability: Number(value('fmea.probability')), detectability: Number(value('fmea.detectability')) };
  const mode = Number(value('financial.mostLikely'));
  const pess = Math.max(mode, Number(value('financial.pessimistic')));
  next.financial = { ...next.financial, currency: value('currency'), optimistic: Math.min(Number(next.financial?.optimistic || 0), mode), mostLikely: mode, pessimistic: pess };
  const name = value('stakeholderName').trim();
  next.stakeholders = name ? [{ id: next.stakeholders?.[0]?.id || '', name, role: value('stakeholderRole'), power: Number(value('stakeholderPower')), interest: Number(value('stakeholderInterest')), stance: 'neutral', keyMessage: 'Verify the current facts, the next checkpoint and the decision owner.' }] : [];
  workbench.caseInput = next;
  workbench.assumptions = { currency: value('currency'), mitigationBudget: value('mitigationBudget'), weeklyDelayLow: value('weeklyDelayLow'), weeklyDelayMode: value('weeklyDelayMode'), weeklyDelayHigh: value('weeklyDelayHigh'), delayDays: value('delayDays'), evidenceDays: value('evidenceDays') };
}

function strategyPicker(analysis) {
  const descriptions = {
    contain: 'Register the case now with the declared mitigation budget. The production rules prepare ownership, decisions, coaching and briefs.',
    verify: 'Register the case now without booking mitigation spend. Revisit after the evidence window; the carrying cost stays visible.',
    wait: 'Keep the response pending until a dated review. A real checkpoint is created, and the declared delay cost is priced.',
  };
  return h('fieldset', { class: 'response-strategies' }, h('legend', null, '3 · Choose the policy to adopt'),
    ...RESPONSE_STRATEGIES.map((id) => {
      const disabled = id === 'wait' && analysis?.stakesReviewRequired;
      return h('label', { class: `response-strategy${workbench.strategy === id ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}` },
        h('input', { type: 'radio', name: 'responseStrategy', value: id, checked: workbench.strategy === id, disabled,
          onChange: () => { workbench.strategy = id; } }),
        h('span', null, h('strong', null, RESPONSE_LABELS[id]), h('small', null, disabled ? 'Unavailable for safety/legal signals.' : descriptions[id])));
    }));
}

function branchFanout(branch) {
  const created = Object.fromEntries(branch.changes.map((c) => [c.collection, c.created]));
  const modules = [['decisions', 'Decisions'], ['delegations', 'Owned work'], ['oneOnOnes', 'Coaching'], ['commsDrafts', 'Brief drafts'], ['goals', 'Goals'], ['links', 'Typed links']];
  return h('div', { class: 'response-fanout' }, ...modules.map(([key, label]) => h('span', { class: created[key] ? 'has-change' : '' }, h('strong', null, String(created[key] || 0)), label)));
}

function resultPanel(ctx, plan, output) {
  const e = responseEconomics(plan.assumptions);
  const selected = plan.preview.branches.find((b) => b.id === plan.strategy);
  const failures = plan.preview.branches.reduce((n, b) => n + b.failureCount, 0);
  const current = ctx.state.responsePlans.find((p) => p.id === plan.id);
  const stale = !current || current.baseRevision !== ctx.state.meta.revision || current.status === 'committed' || current.status === 'archived';
  const exportBtn = h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => {
    const text = responseBrief(current || plan);
    if (!downloadText({ filename: 'leados-response-receipt.txt', text, mime: 'text/plain' })) openModal({ title: 'Copy response receipt', body: h('textarea', { rows: 16, readOnly: true, 'aria-label': 'Response receipt' }, text) });
  } }, 'Export board receipt');
  const commit = h('button', { class: 'btn btn-primary', type: 'button', disabled: stale || failures > 0, onClick: () => {
    confirmDialog({ title: `Adopt “${RESPONSE_LABELS[plan.strategy]}”?`,
      message: 'This creates the reviewed case and its cross-module follow-through in one transaction. Drafts are not sent, and no option is silently chosen for you.',
      confirmLabel: 'Create coordinated response', onConfirm: () => {
        const result = ctx.api.commitResponsePlan(plan.id, { expectedRevision: ctx.state.meta.revision });
        if (!result.ok) { toast(result.error, 'bad'); ctx.refresh(); return; }
        toast('Response adopted. The case and its follow-through are now live.', 'good');
        ctx.navigate(`#/cases/${encodeURIComponent(result.caseId)}`);
      } });
  } }, 'Adopt reviewed response');
  const schedule = plan.strategy === 'wait' ? h('button', { class: 'btn', type: 'button', disabled: stale || failures > 0, onClick: () => {
    const result = ctx.api.scheduleResponsePlan(plan.id);
    if (!result.ok) { toast(result.error, 'bad'); return; }
    workbench.planId = plan.id;
    toast(`Review scheduled for ${result.reviewOn}. Rehearse again before adopting.`, 'good');
    ctx.navigate(`#/responses?plan=${encodeURIComponent(plan.id)}`);
  } }, 'Schedule delayed review') : null;
  const rows = plan.preview.branches.flatMap((branch) => branch.changes.map((c) => ({ policy: RESPONSE_LABELS[branch.id], ...c })));
  output.replaceChildren(
    h('div', { class: 'section-head' }, h('h2', null, 'Rehearsal complete'), h('div', { class: 'page-actions' }, exportBtn, schedule, commit)),
    failures ? banner({ tone: 'bad', title: 'Incomplete fan-out — adoption blocked', body: `${failures} rule failure(s) were isolated in disposable stores. Inspect the propagation ledger and rehearse again.` }) : banner({ tone: 'good', title: 'Production rules completed in all three branches', body: 'Nothing below is live yet. These are actual operational record deltas from disposable workspaces, not predicted human outcomes.' }),
    stale && current?.status !== 'committed' ? banner({ tone: 'caution', title: 'Rehearsal is no longer current', body: 'The workspace changed after this receipt. Run the rehearsal again before adopting.' }) : null,
    h('div', { class: 'response-branch-grid' }, ...plan.preview.branches.map((branch) => h('article', { class: `response-branch${branch.id === plan.strategy ? ' is-selected' : ''}` },
      h('div', { class: 'response-branch-head' }, h('h3', null, RESPONSE_LABELS[branch.id]), badge(branch.id === plan.strategy ? 'selected' : branch.id === 'wait' ? `+${plan.assumptions.delayDays} days` : 'now', branch.id === plan.strategy ? 'good' : 'neutral')),
      h('p', { class: 'muted tiny' }, branch.id === 'wait' ? `Replayed at ${branch.at.slice(0, 10)}` : 'Replayed on the current workspace'),
      branchFanout(branch), h('p', { class: 'tiny muted' }, `${branch.ruleIds.length} rule effect(s) · ${branch.failureCount} failure(s)`)))),
    card({ title: 'What the response creates or updates', subtitle: 'Counts include refreshed records. They are not claims that work was completed or risk was reduced.', body: table({ caption: 'Cross-module operational changes by policy', rows, columns: [
      { label: 'Policy', render: (r) => r.policy }, { label: 'Collection', render: (r) => r.collection },
      { label: 'Created', render: (r) => r.created }, { label: 'Updated', render: (r) => r.updated }, { label: 'Removed', render: (r) => r.removed },
    ] }) }),
    card({ title: 'The price of waiting—only what you declared', subtitle: e.scope, body: h('div', null,
      table({ caption: 'Declared cost scenarios, not confidence intervals', rows: e.rows, columns: [
        { label: 'Policy', render: (r) => r.label }, { label: 'Low', render: (r) => money(r.low, e.currency) },
        { label: 'Mode', render: (r) => money(r.mode, e.currency) }, { label: 'High', render: (r) => money(r.high, e.currency) },
        { label: 'Max regret', render: (r) => money(r.maxRegret, e.currency) },
      ] }),
      h('p', { class: 'small' }, e.verificationBreakEvenPct === null ? 'Evidence-first has no declared mitigation budget, so a spend-avoidance break-even cannot be computed.'
        : `Evidence-first carries ${money(e.verificationCarry, e.currency)} of declared delay cost. It breaks even on avoided mitigation spend only if the chance of avoiding that spend exceeds ${e.verificationBreakEvenPct}%. This is a threshold, not an estimated probability.`),
      h('p', { class: 'muted tiny' }, 'Savage minimax regret is conditional on these cost declarations. Safety, legal duties and unpriced consequences override a financial ranking.')) }),
    h('details', { class: 'card response-method' }, h('summary', null, 'Method, privacy and limits'), h('div', { class: 'card-body' },
      h('p', null, 'OODA supplies the observe–orient–decide–act sequence. Potential-outcomes discipline keeps the alternatives explicit. The replay identifies software effects only: it does not identify a causal effect on morale, attrition or delivery.'),
      h('p', null, 'The worker receives a snapshot of the local workspace, including confidential records already present, but the rehearsal never reads conflict content into its output and writes only to disposable memory. The saved receipt and board export contain counts and assumptions, not intake text or names.'),
      h('p', null, 'A commit is refused if the workspace revision changed, the day changed, the intake note changed, or any branch failed. Adoption writes the case, intake confirmation and response receipt atomically; the existing rule spine does the rest.'))),
  );
  if (selected?.failureCount) commit.disabled = true;
}

function savedPlans(ctx) {
  const report = responsePlanReport(ctx.state, ctx.now);
  if (!report.plans.length) return null;
  return card({ title: 'Response ledger', subtitle: 'Uncommitted plans can be archived. Adopted receipts are immutable history.', body: table({ caption: 'Saved response plans', rows: report.plans, columns: [
    { label: 'Policy', render: (p) => RESPONSE_LABELS[p.strategy] },
    { label: 'Status', render: (p) => badge(p.due ? 'due' : p.status, p.due ? 'bad' : p.status === 'committed' ? 'good' : 'neutral') },
    { label: 'Review', render: (p) => p.reviewOn || '—' },
    { label: 'Next step', render: (p) => h('a', { href: `#/responses?plan=${encodeURIComponent(p.id)}`, class: 'btn btn-small btn-ghost' }, p.status === 'committed' ? 'Open receipt' : 'Review / rehearse') },
  ] }) });
}

export function renderResponses(ctx) {
  const root = h('div', { class: 'view-stack response-view' });
  const queryPlan = ctx.query.get('plan');
  const queryDraft = ctx.query.get('draft');
  if (queryPlan && queryPlan !== workbench.planId) {
    const plan = (ctx.state.responsePlans || []).find((p) => p.id === queryPlan);
    if (plan) {
      workbench.planId = plan.id; workbench.draftId = plan.intakeDraftId; workbench.strategy = plan.strategy;
      workbench.caseInput = clone(plan.caseInput); workbench.assumptions = clone(plan.assumptions);
      const draft = (ctx.state.intakeDrafts || []).find((d) => d.id === plan.intakeDraftId);
      workbench.text = draft?.sourceText || ''; workbench.analysis = draft?.analysis || null;
      workbench.fieldsConfirmed = false;
    }
  } else if (queryDraft && queryDraft !== workbench.draftId) {
    const draft = (ctx.state.intakeDrafts || []).find((d) => d.id === queryDraft);
    if (draft) {
      workbench.draftId = draft.id; workbench.text = draft.sourceText; workbench.analysis = draft.analysis;
      workbench.caseInput = draft.status === 'analyzed' ? toCaseInput(draft.analysis) : null; workbench.planId = null;
    }
  }
  root.appendChild(hero(ctx));
  const output = h('div', { class: 'stack-md', 'aria-live': 'polite', 'data-testid': 'response-output' });
  const plan = (ctx.state.responsePlans || []).find((p) => p.id === workbench.planId);
  if (plan?.status === 'committed') {
    root.appendChild(banner({ tone: 'good', title: 'This response was adopted', body: `Adopted ${plan.committedAt?.slice(0, 10)}. The receipt is immutable; the operational case carries the live follow-through.`,
      actions: [plan.caseId ? h('a', { class: 'btn btn-small btn-primary', href: `#/cases/${encodeURIComponent(plan.caseId)}` }, 'Open operational case') : null,
        plan.caseId ? h('a', { class: 'btn btn-small btn-secondary', href: `#/bundles?case=${encodeURIComponent(plan.caseId)}` }, 'Build action bundle') : null,
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openModal({ title: 'Response receipt', body: h('textarea', { rows: 16, readOnly: true, 'aria-label': 'Response receipt' }, responseBrief(plan)) }) }, 'Read receipt')] }));
    const ledger = savedPlans(ctx);
    if (ledger) root.appendChild(ledger);
    return root;
  }
  const note = h('textarea', { id: 'response-note', rows: 6, maxlength: 8000, placeholder: 'Paste a situation, email or meeting note…' }, workbench.text);
  note.addEventListener('input', () => { workbench.text = note.value; workbench.analysis = null; workbench.draftId = null; workbench.caseInput = null; workbench.planId = null; });
  const analyze = h('button', { class: 'btn btn-primary', type: 'button', onClick: () => {
    workbench.text = note.value;
    const result = ctx.api.analyzeIntake(workbench.text);
    workbench.analysis = result.analysis; workbench.draftId = null; workbench.caseInput = null; workbench.planId = null;
    ctx.refresh();
  } }, 'Analyze on this device');
  const composer = card({ title: '1 · Describe the situation', subtitle: 'No account, model key or network call. Keep confidential interpersonal disputes in the private conflict workspace.', body: h('div', { class: 'stack-sm' },
    h('label', { for: 'response-note', class: 'sr-only' }, 'Situation note'), note,
    h('div', { class: 'page-actions' }, analyze, h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { workbench.text = EXAMPLE; note.value = EXAMPLE; workbench.analysis = null; } }, 'Use a worked example'))) });
  root.appendChild(h('div', { class: 'response-intake-grid' }, composer, evidencePanel(workbench.analysis) || card({ title: 'What happens next', body: h('ol', { class: 'response-steps' },
    h('li', null, h('strong', null, 'Review the evidence'), h('span', null, 'See the exact terms and roster matches behind the suggestion.')),
    h('li', null, h('strong', null, 'Rehearse three policies'), h('span', null, 'Contain now, buy evidence, or delay—with the real rule cascade.')),
    h('li', null, h('strong', null, 'Adopt one coordinated response'), h('span', null, 'A stale or incomplete rehearsal can never become live.'))) })));
  if (workbench.analysis && !workbench.analysis.insufficient && !workbench.analysis.privacyBlocked && !workbench.analysis.conflictPrivacyWall && workbench.analysis.caseSuggestion && !workbench.draftId) {
    root.appendChild(h('div', { class: 'page-actions' }, h('button', { class: 'btn btn-primary', type: 'button', onClick: () => {
      const result = ctx.api.saveIntakeDraft(workbench.text);
      if (!result.ok) { toast(result.error, 'bad'); return; }
      workbench.draftId = result.id; workbench.analysis = result.analysis; workbench.caseInput = toCaseInput(result.analysis);
      workbench.assumptions.currency = workbench.caseInput.financial?.currency || 'USD';
      ctx.refresh();
    } }, 'Save draft and review response')));
  }
  if (workbench.draftId && workbench.caseInput) {
    const formCard = reviewForm(ctx);
    root.appendChild(formCard);
    root.appendChild(strategyPicker(workbench.analysis));
    const confirmed = h('input', { id: 'response-fields-confirmed', type: 'checkbox', checked: workbench.fieldsConfirmed });
    confirmed.addEventListener('change', () => { workbench.fieldsConfirmed = confirmed.checked; });
    const checks = h('div', { class: 'stack-xs' }, h('label', { class: 'check', for: 'response-fields-confirmed' }, confirmed, h('span', null, 'I reviewed the title, owner, ratings, money and delay assumptions. Heuristic defaults are not facts.')));
    let safety = null;
    if (workbench.analysis?.stakesReviewRequired) {
      safety = h('input', { id: 'response-safety-reviewed', type: 'checkbox', checked: workbench.safetyReviewed });
      safety.addEventListener('change', () => { workbench.safetyReviewed = safety.checked; });
      checks.appendChild(h('label', { class: 'check', for: 'response-safety-reviewed' }, safety, h('span', null, 'I completed the required safety/legal review and will follow the applicable escalation procedure.')));
    }
    root.appendChild(checks);
    const run = h('button', { class: 'btn btn-primary response-run', type: 'button', disabled: workbench.busy, onClick: async () => {
      readForm(formCard);
      if (!workbench.fieldsConfirmed) { toast('Confirm the reviewed facts first.', 'bad'); return; }
      if (workbench.analysis?.stakesReviewRequired && !workbench.safetyReviewed) { toast('Complete the safety/legal review first.', 'bad'); return; }
      workbench.busy = true; run.disabled = true; run.textContent = 'Rehearsing three policies…';
      output.replaceChildren(banner({ tone: 'info', title: 'Running production actions in disposable workspaces', body: 'The page stays responsive. No live records are being changed.' }));
      const draft = (ctx.state.intakeDrafts || []).find((d) => d.id === workbench.draftId);
      const result = await runResponseRehearsal(ctx.state, workbench.draftId, {
        strategy: workbench.strategy, caseInput: workbench.caseInput, assumptions: workbench.assumptions,
        fieldsConfirmed: workbench.fieldsConfirmed, safetyReviewed: workbench.safetyReviewed,
        sourceFingerprint: responseSourceFingerprint(draft),
      }, ctx.now);
      workbench.busy = false; run.disabled = false; run.textContent = 'Rehearse the cross-module response';
      if (!result.ok) { output.replaceChildren(banner({ tone: 'bad', title: 'Rehearsal refused', body: result.error })); return; }
      const saved = ctx.api.saveResponsePlan(result);
      if (!saved.ok) { output.replaceChildren(banner({ tone: 'bad', title: 'Receipt not saved', body: saved.error })); return; }
      workbench.planId = saved.id;
      ctx.refresh();
    } }, 'Rehearse the cross-module response');
    root.appendChild(h('div', { class: 'page-actions' }, run));
    if (plan && ['rehearsed', 'scheduled'].includes(plan.status)) resultPanel(ctx, plan, output);
    if (plan?.status === 'scheduled') root.appendChild(banner({ tone: 'info', title: `Delayed review scheduled for ${plan.reviewOn}`, body: 'The follow-up is live. Rehearse current facts again before adopting the response.' }));
    if (plan && ['rehearsed', 'scheduled'].includes(plan.status)) root.appendChild(h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => {
      confirmDialog({ title: 'Archive this uncommitted plan?', message: 'The receipt stays in history. Any review task already created remains visible until a human closes it.', confirmLabel: 'Archive plan', onConfirm: () => {
        const result = ctx.api.archiveResponsePlan(plan.id); if (!result.ok) toast(result.error, 'bad'); else { workbench.planId = null; ctx.refresh(); }
      } });
    } }, 'Archive uncommitted plan'));
  }
  root.appendChild(output);
  const ledger = savedPlans(ctx);
  if (ledger) root.appendChild(ledger);
  return root;
}
