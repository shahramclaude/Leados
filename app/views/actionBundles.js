/** Action bundles: the human-approved transaction boundary across leadership modules. */
import { h, toast, openModal } from '../ui/dom.js';
import { pageHeader, card, badge, banner, table, emptyState, stat } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { proposeBundle, BUNDLE_ADAPTERS, BUNDLE_LABELS } from '../core/domain/actionBundleRegistry.js';
import { bundleReport } from '../core/domain/actionBundles.js';
import { resolveLinkedEntity } from '../core/domain/cases.js';
import { runActionBundleRehearsal } from '../ui/response-worker.js';
import { dayKey } from '../core/time.js';

const ui = { sourceId: '', bundleId: '', proposal: null, busy: false, error: '', queryKey: null };
const clone = (v) => JSON.parse(JSON.stringify(v));
function field(label, name, value, opts = {}) {
  const id = `bundle-${name}`;
  const control = opts.options ? h('select', { id, name }, ...opts.options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label)))
    : h('input', { id, name, type: opts.type || 'text', value: value ?? '', min: opts.min, max: opts.max, step: opts.step || 'any', maxlength: 180 });
  return h('div', { class: 'field' }, h('label', { for: id }, label), control);
}
function start(ctx, sourceId) {
  const proposal = proposeBundle(ctx.state, sourceId, ctx.now);
  if (!proposal.ok) { toast(proposal.error, 'bad'); return; }
  ui.sourceId = sourceId; ui.bundleId = ''; ui.proposal = proposal; ui.error = ''; ctx.refresh();
}
function saveDraft(ctx, root) {
  const p = clone(ui.proposal);
  p.name = root.querySelector('[name="bundle-name"]').value;
  p.reviewOn = root.querySelector('[name="bundle-review"]').value;
  const owner = root.querySelector('[name="bundle-owner"]').value;
  p.commands = p.commands.filter((a) => root.querySelector(`[name="include-${a.kind}"]`)?.checked).map((a) => {
    const next = { ...a, dueOn: p.reviewOn };
    if (['delegation', 'premise', 'coaching'].includes(a.kind)) next.ownerId = owner;
    if (a.kind === 'budget') next.amount = root.querySelector('[name="bundle-amount"]').value;
    if (a.kind === 'premise') next.priorPct = root.querySelector('[name="bundle-prior"]').value;
    next.title = root.querySelector(`[name="title-${a.kind}"]`)?.value || a.title;
    return next;
  });
  const result = ui.bundleId ? ctx.api.updateActionBundle(ui.bundleId, p) : ctx.api.createActionBundle(p);
  if (!result.ok) { ui.error = result.error; toast(result.error, 'bad'); ctx.refresh(); return null; }
  ui.bundleId = result.id; ui.proposal = p; ui.error = ''; return result.id;
}
async function rehearse(ctx, root) {
  if (ui.busy) return;
  const id = saveDraft(ctx, root); if (!id) return;
  ui.busy = true; ctx.refresh();
  const revision = ctx.store.state.meta.revision;
  const result = await runActionBundleRehearsal(clone(ctx.store.state), id, ctx.now);
  if (ctx.store.state.meta.revision !== revision) { ui.busy = false; ui.error = 'The workspace changed during rehearsal. Run it again.'; ctx.refresh(); return; }
  if (result.ok) {
    const saved = ctx.api.saveActionBundlePreview(id, result);
    if (!saved.ok) ui.error = saved.error;
    else { ui.error = ''; toast('Rehearsal complete. Nothing is live until you adopt.', 'good'); }
  } else ui.error = result.error;
  ui.busy = false; ctx.refresh();
}
function previewCard(ctx, b, current) {
  if (!b?.preview) return null;
  const p = b.preview;
  const stale = b.baseRevision !== ctx.store.state.meta.revision || b.evaluatedAt?.slice(0, 10) !== dayKey(ctx.now);
  const adopt = h('button', { class: 'btn btn-primary', type: 'button', disabled: stale || ui.busy || b.status !== 'rehearsed', onClick: () => {
    const modal = openModal({ title: 'Adopt this reviewed bundle?', body: h('div', { class: 'stack-sm' },
      h('p', null, `${b.commands.length} action types will write together. Existing rules may create additional work and links. No decision is chosen and no message is sent.`),
      h('p', { class: 'muted small' }, 'If any command or rule fails, the whole bundle rolls back. Withdrawal is allowed only while every target remains untouched.')),
      footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => modal.close() }, 'Cancel'), h('button', { class: 'btn btn-primary', type: 'button', onClick: () => {
        const result = ctx.api.commitActionBundle(b.id, { expectedRevision: ctx.store.state.meta.revision, reviewed: true });
        if (!result.ok) { toast(result.error, 'bad'); return; }
        modal.close(); ui.proposal = null; toast(result.saved ? 'Bundle adopted across the workspace.' : 'Applied in memory only — export a backup now.', result.saved ? 'good' : 'bad'); ctx.refresh();
      } }, 'Adopt atomically')] });
  } }, 'Review & adopt bundle');
  return card({ title: 'The exact operational footprint', subtitle: p.scope, actions: [adopt], body: h('div', { class: 'stack-sm' },
    stale ? banner({ tone: 'caution', title: 'Rehearsal expired', body: 'The workspace or day changed. Save and rehearse again before adoption.' }) : banner({ tone: 'good', title: 'Ready for human approval', body: 'Every production command and rule completed in the disposable workspace.' }),
    table({ caption: 'Bundle operational changes', rows: p.changes, columns: [
      { label: 'Module ledger', render: (r) => r.collection }, { label: 'Created', render: (r) => r.created }, { label: 'Updated', render: (r) => r.updated }, { label: 'Removed', render: (r) => r.removed },
    ] }),
    h('h3', { class: 'small-heading' }, 'Typed relationships'),
    h('div', { class: 'bundle-relations' }, ...p.relationships.map((r) => h('span', { class: 'case-link-pill' }, `${r.sourceType} → ${r.relation} → ${r.targetType} · ${r.added}`))),
    h('p', { class: 'muted tiny' }, `${p.ruleIds.length} rule IDs produced effects. A software diff is not a prediction of morale, delivery or financial benefit.`)) });
}
function editor(ctx) {
  const p = ui.proposal; if (!p) return null;
  const people = ctx.state.people.filter((r) => r.status !== 'archived');
  const owner = p.commands.find((a) => a.ownerId)?.ownerId || '';
  const budget = p.commands.find((a) => a.kind === 'budget');
  const premise = p.commands.find((a) => a.kind === 'premise');
  const root = h('div', { class: 'stack-md', 'data-testid': 'bundle-editor' });
  const form = h('form', { onSubmit: (e) => e.preventDefault() },
    h('div', { class: 'bundle-form-grid' }, field('Plan name', 'bundle-name', p.name), field('Shared review / due date', 'bundle-review', p.reviewOn, { type: 'date' }),
      field('Accountable owner', 'bundle-owner', owner, { options: [{ value: '', label: 'Choose an active owner' }, ...people.map((r) => ({ value: r.id, label: r.name }))] }),
      budget ? field(`Commitment (${ctx.state.budgets.find((b) => b.id === budget.budgetId)?.currency || ''})`, 'bundle-amount', budget.amount, { type: 'number', min: 0.01 }) : null,
      premise ? field('Assumption prior (%) — your declaration', 'bundle-prior', premise.priorPct, { type: 'number', min: 5, max: 95, step: 1 }) : null),
    h('fieldset', { class: 'bundle-action-picker' }, h('legend', null, 'Choose the actions in this transaction'),
      ...p.commands.map((a) => h('div', { class: 'bundle-action-option' },
        h('input', { type: 'checkbox', name: `include-${a.kind}`, 'aria-label': `Include ${BUNDLE_LABELS[a.kind]}`, checked: true }),
        h('span', { class: 'bundle-action-fields' }, h('strong', null, BUNDLE_LABELS[a.kind]), h('label', { class: 'sr-only', for: `bundle-title-${a.kind}` }, `${BUNDLE_LABELS[a.kind]} title`), h('input', { id: `bundle-title-${a.kind}`, name: `title-${a.kind}`, value: a.title, maxlength: 180 }), h('small', { class: 'muted' }, BUNDLE_ADAPTERS[a.kind].reversible))))),
    ui.error ? banner({ tone: 'bad', title: 'Bundle not applied', body: ui.error }) : null,
    h('div', { class: 'page-actions bundle-run-row' }, h('button', { class: 'btn btn-primary', type: 'submit', disabled: ui.busy }, ui.busy ? 'Rehearsing in background…' : 'Save & rehearse current facts'),
      h('span', { class: 'muted small', role: 'status' }, 'No operational writes during rehearsal.')));
  form.addEventListener('submit', (event) => { event.preventDefault(); rehearse(ctx, root); });
  root.appendChild(card({ title: 'Review the coordinated plan', subtitle: proposalScope(ctx, p), body: form }));
  const b = ctx.store.state.actionBundles.find((r) => r.id === ui.bundleId);
  const preview = previewCard(ctx, b); if (preview) root.appendChild(preview);
  return root;
}
function proposalScope(ctx, p) {
  const source = ctx.state.cases.find((c) => c.id === p.sourceId);
  return `Source: ${source?.title || 'case'}. PDCA closes the delivery loop; assumption-based planning makes the recovery belief falsifiable. Every declaration is editable in its destination after adoption.`;
}
function receipt(ctx, b) {
  const targets = b.outputs.map((o) => ({ ...o, node: resolveLinkedEntity(ctx.state, o.type, o.id) })).filter((o) => o.node);
  return card({ title: b.name, subtitle: `Adopted ${b.committedAt?.slice(0, 10) || '—'} · review ${b.reviewOn}`, actions: [
    badge(b.status, b.status === 'committed' ? 'good' : 'neutral'),
    h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => { const text = ctx.api.actionBundleBrief(b.id); if (!downloadText({ filename: `leados-bundle-${b.id}.txt`, text, mime: 'text/plain' })) openModal({ title: 'Copy bundle receipt', body: h('textarea', { rows: 16, readOnly: true, 'aria-label': 'Bundle receipt' }, text) }); } }, 'Export receipt'),
    b.withdrawable ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => {
      const reason = h('textarea', { id: 'withdraw-reason', rows: 3, maxlength: 600 });
      const modal = openModal({ title: 'Withdraw untouched actions?', body: h('div', null, h('p', null, 'Work is returned, unspent money released, unsent drafts dismissed and untouched records removed. History remains. Any later edit protects the entire bundle.'), h('label', { for: 'withdraw-reason' }, 'Reason'), reason), footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => modal.close() }, 'Cancel'), h('button', { class: 'btn btn-danger', type: 'button', onClick: () => {
        const result = ctx.api.withdrawActionBundle(b.id, { reason: reason.value });
        if (!result.ok) { toast(result.error, 'bad'); return; }
        modal.close(); toast(result.saved ? 'Untouched actions withdrawn; history retained.' : 'Withdrawn in memory only. Export a backup now.', result.saved ? 'good' : 'bad'); ctx.refresh();
      } }, 'Withdraw atomically')] });
    } }, 'Withdraw untouched bundle') : null,
  ].filter(Boolean), body: h('div', { class: 'stack-sm' },
    b.status === 'committed' && !b.withdrawable ? banner({ tone: 'info', title: 'Later work is protected', body: 'At least one target has changed or been used. Review the individual records; compensation will not overwrite them.' }) : null,
    targets.length ? h('div', { class: 'bundle-targets' }, ...targets.map((o) => h('a', { class: 'bundle-target', href: o.node.route }, h('span', null, BUNDLE_LABELS[o.kind]), h('strong', null, o.node.title), h('span', { class: 'muted tiny' }, 'Open live record →')))) : h('p', { class: 'muted' }, 'Compensated or deleted targets are retained in the audit receipt, not recreated as live work.'),
    h('h3', { class: 'small-heading' }, 'Append-only bundle history'),
    h('ol', { class: 'timeline' }, ...b.history.map((e) => h('li', { class: 'timeline-item' }, h('span', { class: 'timeline-date' }, e.at.slice(0, 10)), h('div', { class: 'timeline-body' }, h('strong', null, e.type), h('p', null, e.summary)))))) });
}
export function renderActionBundles(ctx) {
  const report = bundleReport(ctx.state, ctx.now);
  const queryId = ctx.query.get('bundle'); const querySource = ctx.query.get('case');
  const queryKey = ctx.query.toString();
  if (queryKey !== ui.queryKey) { ui.queryKey = queryKey; ui.bundleId = ''; ui.proposal = null; ui.error = ''; }
  if (queryId && queryId !== ui.bundleId) { const b = report.bundles.find((r) => r.id === queryId); if (b) { ui.bundleId = b.id; ui.sourceId = b.sourceId; ui.proposal = ['draft', 'rehearsed'].includes(b.status) ? clone(b) : null; ui.error = ''; } }
  if (querySource && querySource !== ui.sourceId && !queryId) { const proposal = proposeBundle(ctx.state, querySource, ctx.now); if (proposal.ok) { ui.sourceId = querySource; ui.bundleId = ''; ui.proposal = proposal; ui.error = ''; } }
  const cases = ctx.state.cases.filter((c) => ['open', 'mitigating', 'monitoring'].includes(c.status));
  const selected = report.bundles.find((b) => b.id === ui.bundleId);
  if (selected && ui.proposal && ui.proposal.sourceId === selected.sourceId && !['draft', 'rehearsed'].includes(selected.status)) { ui.proposal = null; ui.bundleId = selected.id; }
  if (selected && ['draft', 'rehearsed'].includes(selected.status) && !ui.proposal) { ui.proposal = clone(selected); ui.sourceId = selected.sourceId; }
  const root = h('div', { class: 'view-stack bundle-view' },
    pageHeader({ eyebrow: 'LEADOS · COORDINATED EXECUTION', title: 'One review. Many modules. One transaction.', subtitle: 'Turn an operational case into a reviewed execution bundle. See the exact ripple, adopt it together, and reverse only untouched work.', actions: [h('a', { class: 'btn btn-ghost', href: '#/responses' }, 'Start from a situation note')] }),
    h('div', { class: 'stat-row' }, stat({ label: 'Awaiting review', value: report.open.length }), stat({ label: 'Adopted', value: report.committed.length }), stat({ label: 'Reviews due', value: report.due.length }), stat({ label: 'Safely withdrawn', value: report.withdrawn.length })),
    card({ title: 'Choose the source case', subtitle: 'The case stays the single source of truth. Its owner, stakeholders, mitigation estimate and budget supply the proposal—never a guessed fact.', body: cases.length ? h('div', { class: 'bundle-source-list' }, ...cases.slice(0, 24).map((c) => h('button', { class: `bundle-source${ui.sourceId === c.id ? ' is-selected' : ''}`, type: 'button', onClick: () => start(ctx, c.id) }, h('strong', null, c.title), h('span', null, `${c.status} · ${c.ownerId ? ctx.state.people.find((p) => p.id === c.ownerId)?.name || 'Owner unavailable' : 'No owner'}`), badge('Build bundle', 'neutral')))) : emptyState({ title: 'Start with one real situation', body: 'Register a case or adopt a response first. The bundle builder will connect its operational, financial and people implications.', action: h('a', { class: 'btn btn-primary', href: '#/cases' }, 'Open operational cases') }) }),
    editor(ctx) || (selected && ['committed', 'withdrawn'].includes(selected.status) ? receipt(ctx, selected) : null),
    report.bundles.length ? card({ title: 'Bundle ledger', subtitle: 'Proposals, immutable adoption receipts and guarded compensation. Open a plan to inspect its current state.', body: table({ caption: 'Action bundles', rows: report.bundles, columns: [
      { label: 'Plan', render: (b) => h('a', { href: `#/bundles?bundle=${encodeURIComponent(b.id)}` }, b.name) },
      { label: 'Status', render: (b) => badge(b.due ? 'review due' : b.status, b.due ? 'caution' : b.status === 'committed' ? 'good' : 'neutral') },
      { label: 'Actions', render: (b) => b.commands.length }, { label: 'Review', render: (b) => b.reviewOn },
      { label: 'Next step', render: (b) => h('a', { class: 'btn btn-tiny btn-ghost', href: `#/bundles?bundle=${encodeURIComponent(b.id)}` }, ['draft', 'rehearsed'].includes(b.status) ? 'Review / rehearse' : 'Open receipt') },
    ] }) }) : null,
    h('details', { class: 'card response-method' }, h('summary', null, 'Why this is safe—and what it does not claim'), h('div', { class: 'card-body' },
      h('p', null, 'A closed command registry calls the same validated production APIs as ordinary screens. The source events visit the full rule engine in one store transaction. A failed command or rule rolls back the bundle.'),
      h('p', null, 'Compensation is not time travel: returned work, released commitments and dismissed drafts remain history. Derived evidence already present at adoption may be removed with an untouched assumption; later human review or settled outcomes protect it. Downstream records created by compensation remain auditable.'),
      h('p', null, 'This is transactional software integrity, not causal effectiveness. Financial commitments are not actual spend. Coaching is a prompt, not a person score. Stakeholder messages remain drafts.'))));
  return root;
}