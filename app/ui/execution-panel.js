/** ADR-0106: shared execution-evidence surface for Mission Control and Bundles. */
import { h, toast, openModal } from './dom.js';
import { card, badge, banner, table, emptyState, stat, kv } from './components.js';
import { downloadText } from './download.js';
import { displayBound } from '../core/domain/mission.js';

const STATE_LABEL = { waiting: 'Waiting for evidence', moving: 'Moving', blocked: 'Blocked / missing proof', ready: 'Ready to resolve case', closed: 'Closed on evidence', reopened: 'Reopened after closure' };
const STATE_TONE = { waiting: 'neutral', moving: 'info', blocked: 'bad', ready: 'caution', closed: 'good', reopened: 'warn' };
export const executionBadge = (state) => badge(STATE_LABEL[state] || state, STATE_TONE[state] || 'neutral');

function receipt(ctx, id) {
  const result = ctx.api.missionExecutionReceipt(id);
  if (!result.ok) { toast(result.error, 'bad'); return; }
  if (!downloadText({ filename: `leados-execution-${id}.md`, text: result.text, mime: 'text/markdown' })) {
    openModal({ title: 'Copy execution receipt', body: h('textarea', { rows: 16, readOnly: true, 'aria-label': 'Execution receipt' }, result.text) });
  }
}

/** Detail rows for one adopted bundle (Bundles screen). */
export function renderBundleExecution(ctx, bundle) {
  const result = ctx.api.missionExecutionReceipt(bundle.id);
  if (!result.ok) return banner({ tone: 'info', title: 'Execution receipt withheld', body: result.error });
  const e = result.execution;
  return card({ title: 'Execution evidence', subtitle: 'PDCA closure is derived from dated records, not a manually ticked box.', actions: [executionBadge(e.state), h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => receipt(ctx, bundle.id) }, 'Export receipt')], body: h('div', { class: 'stack-sm' },
    h('div', { class: 'stat-row' }, stat({ label: 'Fulfilled', value: e.counts.fulfilled }), stat({ label: 'Explicitly stopped', value: e.counts.stopped }), stat({ label: 'Pending', value: e.counts.pending }), stat({ label: 'Blocked / missing', value: e.counts.blocked + e.counts.missing, tone: e.counts.blocked + e.counts.missing ? 'bad' : '' })),
    kv('Source case', `${e.caseTitle} · ${e.caseState}`), kv('Closed on', e.closedOn || 'Not closed'),
    table({ caption: 'Terminal evidence by action', rows: e.outputs, columns: [
      { label: 'Action', render: (o) => o.label }, { label: 'State', render: (o) => badge(o.state, o.state === 'fulfilled' ? 'good' : o.state === 'stopped' ? 'neutral' : o.state === 'pending' ? 'info' : 'bad') },
      { label: 'Evidence', render: (o) => o.evidence ? h('span', null, h('code', null, `${o.evidence.type}/${o.evidence.id}`), o.evidence.on ? h('span', { class: 'muted tiny' }, ` · ${o.evidence.on}`) : null) : h('span', { class: 'muted' }, 'No proof') },
      { label: 'Why', render: (o) => o.reason }, { label: 'Next', render: (o) => h('a', { class: 'btn btn-tiny btn-ghost', href: o.route }, 'Open record →') },
    ] }),
    e.nextAction ? banner({ tone: 'info', title: `Next: ${e.nextAction.label}`, body: e.nextAction.reason, actions: [h('a', { class: 'btn btn-small btn-primary', href: e.nextAction.route }, 'Go to record')] }) : banner({ tone: 'good', title: 'Loop closed from evidence', body: 'The engine-authored review checkpoint was reconciled. Human work records and the case resolution remain the source of truth.' }),
    h('p', { class: 'tiny muted' }, 'Cancellation, deletion and missing proof are never counted as delivery. This is software reconciliation, not a causal business forecast.')) });
}

/** Mission Control panel: role-tiered, with upward roll-up and drill-down. */
export function renderExecutionPanel(ctx, r) {
  const e = r.execution;
  const auto = ctx.store.state.settings.executionAutoReconcile !== false;
  const totals = e.hierarchy.totals;
  return h('div', { class: 'stack-sm execution-panel' },
    banner({ tone: 'info', title: 'The loop closes itself when the evidence agrees', body: 'Every adopted response is reconciled on the shared event spine. A decision needs a reviewed outcome, work needs a delivery note, an assumption needs a human verdict, spend needs an actual, a brief needs a recorded send, and coaching needs a held 1:1 covering the exact prompt. Then the human-resolved source case closes the checkpoint.' }),
    h('div', { class: 'stat-row' }, e.detail ? [stat({ label: 'Open loops', value: e.summary.open }), stat({ label: 'Closed on evidence', value: e.summary.closed, tone: 'good' }), stat({ label: 'Fulfilled actions', value: e.summary.fulfilled }), stat({ label: 'Stopped, not delivered', value: e.summary.stopped })]
      : [stat({ label: 'Open loops in span', value: displayBound(totals.open), hint: 'Suppression-safe interval' }), stat({ label: 'Past review date', value: displayBound(totals.overdue) }), stat({ label: 'Individual detail', value: 'Withheld', hint: 'This altitude reads counts, not proof pointers' })]),
    h('div', { class: 'form-actions' }, h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { const result = ctx.api.executionScan(); if (!result.ok) toast(result.error, 'bad'); else { toast('Execution evidence reconciled.', 'good'); ctx.refresh(); } } }, 'Reconcile now'),
      h('label', { class: 'check-row' }, h('input', { type: 'checkbox', checked: auto, onChange: (ev) => { const result = ctx.api.setExecutionAutoPropagate(ev.target.checked); if (!result.ok) toast(result.error, 'bad'); else ctx.refresh(); } }), h('span', null, 'Automatic reconciliation')),
      h('a', { class: 'btn btn-ghost', href: '#/mission?panel=hierarchy' }, 'Work roll-up →')),
    e.detail ? card({ title: 'Execution loops in this span', subtitle: 'One row per adopted response. The next action is the first missing proof, not a guess.', body: e.loops.length ? table({ caption: 'Execution loops', rows: e.loops, columns: [
      { label: 'Loop', render: (l) => h('a', { href: `#/bundles?bundle=${encodeURIComponent(l.id)}` }, l.name) },
      { label: 'State', render: (l) => executionBadge(l.state) },
      { label: 'Evidence', render: (l) => `${l.settled}/${l.total} terminal` },
      { label: 'Next', render: (l) => l.nextAction ? h('a', { class: 'text-link', href: l.nextAction.route }, l.nextAction.label) : h('span', { class: 'muted' }, `Closed ${l.closedOn || ''}`) },
      { label: 'Receipt', render: (l) => h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => receipt(ctx, l.id) }, 'Export') },
    ] }) : emptyState({ title: 'No adopted responses yet', body: 'Describe a situation in Command Flow, rehearse it, and adopt the reviewed response. Its execution loop will appear here automatically.', action: h('a', { class: 'btn btn-primary', href: '#/mission?panel=capture' }, 'Open Command Flow') }) }) : null,
    card({ title: 'Vertical execution roll-up', subtitle: e.hierarchy.method, body: table({ caption: 'Open execution loops by child span', rows: e.hierarchy.cells, columns: [
      { label: 'Span', render: (c) => h('div', null, h('strong', null, c.label), c.suppressed ? h('p', { class: 'tiny muted' }, c.reason) : null) },
      { label: 'Open loops', render: (c) => displayBound(c.open) }, { label: 'Past review', render: (c) => displayBound(c.overdue) },
      { label: 'Drill', render: (c) => c.seatId ? h('a', { class: 'btn btn-tiny btn-ghost', href: `#/mission?panel=execution&span=${encodeURIComponent(c.seatId)}` }, 'Open span →') : h('span', { class: 'muted' }, 'This altitude') },
    ] }) }),
    h('p', { class: 'tiny muted' }, 'Local workflow boundary, not authenticated multi-user security. Small-cell intervals are not differential privacy. The engine never chooses, spends, sends or rates a person.'));
}
