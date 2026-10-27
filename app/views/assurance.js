import { h, toast, openModal, confirmDialog } from '../ui/dom.js';
import { pageHeader, card, stat, table, banner, badge } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { buildAssuranceReport, evidenceTrails, previewCaseAutomation, assuranceBrief } from '../core/domain/assurance.js';

export function renderAssurance(ctx) {
  const report = buildAssuranceReport(ctx.state);
  const trailPanel = h('div', { 'aria-live': 'polite' });
  const previewPanel = h('div', { 'aria-live': 'polite' });
  const showTrails = (key) => {
    const rows = evidenceTrails(report, key);
    trailPanel.replaceChildren(table({ caption: 'Shortest evidence trails', rows, columns: [
      { label: 'Related record', render: (r) => h('a', { href: r.node.route }, r.node.title || r.node.type) },
      { label: 'Module', render: (r) => r.node.type },
      { label: 'Hops', render: (r) => r.distance },
      { label: 'Evidence trail', render: (r) => r.path.map((p) => `${p.reverse ? '←' : '→'} ${p.edge.relation} [${p.edge.ruleId}]`).join(' / ') },
    ], emptyMessage: 'Choose a linked record to trace its relationships.' }));
  };
  const nodeSelect = h('select', { id: 'assurance-record', onChange: (e) => showTrails(e.target.value) },
    h('option', { value: '' }, 'Choose a linked record…'),
    ...[...report.nodes.values()].sort((a, b) => String(a.title).localeCompare(String(b.title)))
      .map((n) => h('option', { value: n.key }, `${n.type} · ${n.title || n.id}`)));
  const cases = ctx.state.cases || [];
  const caseSelect = h('select', { id: 'assurance-case' }, h('option', { value: '' }, 'Choose an operational case…'),
    ...cases.map((c) => h('option', { value: c.id }, c.title)));
  let previewedId = null;
  const refresh = h('button', { class: 'btn', type: 'button', disabled: true, onClick: () => {
    if (!previewedId || previewedId !== caseSelect.value) return;
    const selectedId = previewedId;
    confirmDialog({ title: 'Refresh case automation?',
      message: 'Recompute from current facts? This may create decisions, coaching prompts or unsent communication drafts. Nothing is sent.',
      confirmLabel: 'Refresh automation', onConfirm: () => {
        const result = ctx.api.refreshCaseAutomation(selectedId);
        toast(result.ok ? 'Refresh committed. Check diagnostics and the outbox; nothing was sent.' : result.error, result.ok ? 'good' : 'bad');
      },
    });
  } }, 'Refresh current case');
  caseSelect.addEventListener('change', () => { previewedId = null; refresh.disabled = true; previewPanel.replaceChildren(); });
  const preview = h('button', { class: 'btn btn-primary', type: 'button', onClick: () => {
    if (!caseSelect.value) { toast('Choose a case first.', 'bad'); return; }
    const result = previewCaseAutomation(ctx.state, caseSelect.value, { now: ctx.now });
    if (!result.ok) { toast(result.error, 'bad'); return; }
    previewedId = caseSelect.value; refresh.disabled = false;
    previewPanel.replaceChildren(
      h('p', { class: 'small muted' }, `${result.events.length} automation audit events · ${result.warnings.length} warnings. Preview wrote nothing. Counts include all changed rows, not only new records.`),
      table({ caption: 'Sandbox replay changes', rows: result.changes, columns: [
        { label: 'Collection', render: (r) => r.collection },
        { label: 'Created', render: (r) => r.created },
        { label: 'Updated', render: (r) => r.updated },
        { label: 'Removed', render: (r) => r.removed },
      ], emptyMessage: 'No record changes: rules converged or the case has automation disabled.' }),
      table({ caption: 'Per-rule savepoint trace', rows: result.trace, columns: [
        { label: 'Rule', render: (r) => r.rule },
        { label: 'Savepoint', render: (r) => badge(r.status, r.status === 'rolled-back' ? 'warn' : 'neutral') },
        { label: 'Changed collections', render: (r) => r.collections.join(', ') || 'No changes' },
        { label: 'Reported effects', render: (r) => r.effects },
      ] }),
      result.warnings.length ? h('p', { role: 'alert' }, 'One or more rules failed in preview. Their writes were rolled back. A refresh may fail again; inspect source data before proceeding.') : null,
    );
  } }, 'Preview in sandbox');
  return h('div', { class: 'view assurance-view' },
    pageHeader({ eyebrow: 'OBSERVE → REHEARSE → VERIFY', title: 'Automation control room',
      subtitle: 'See the evidence behind cross-module follow-through. Rehearse a case event without changing a single record.',
      actions: [h('button', { class: 'btn', type: 'button', onClick: () => {
        const text = assuranceBrief(report);
        if (!downloadText({ filename: 'leados-automation-assurance.txt', text, mime: 'text/plain' })) {
          openModal({ title: 'Copy assurance brief', body: h('textarea', { readOnly: true, rows: 16, 'aria-label': 'Assurance brief' }, text) });
        }
      } }, 'Export assurance brief')] }),
    h('div', { class: 'stat-grid' },
      stat({ label: 'Linked records', value: report.nodes.size, hint: 'Only valid operational endpoints' }),
      stat({ label: 'Cross-module reach', value: report.modules, hint: `${report.edges.length} distinct relationships` }),
      stat({ label: 'Link diagnostics', value: report.findings.length, tone: report.findings.length ? 'warn' : '' }),
      stat({ label: 'Retained failure events', value: report.failures.length, hint: 'Historical, not an unresolved incident count' })),
    banner({ tone: 'info', title: 'Evidence is not causality', body: 'A coaching, funding or decision link does not mean failure spreads along it. Trails traverse both directions and show reverse arrows explicitly. Confidential conflicts and anonymous pulses never enter this explorer. Unlinked records are outside this view.' }),
    card({ title: 'Trace the follow-through', subtitle: 'Breadth-first search finds a shortest evidence trail to each reachable record. Each hop names its relationship and originating rule.',
      body: h('div', null, h('label', { for: 'assurance-record' }, 'Starting record'), nodeSelect, trailPanel) }),
    card({ title: 'Rehearse a case event', subtitle: 'Runs the production post-commit registry on a disposable copy, using current facts and clock. This is not a replay of historical state or action-level case-opening rules. Refresh recomputes from live state; it never applies the preview snapshot.',
      body: h('div', null, h('label', { for: 'assurance-case' }, 'Operational case'), caseSelect,
        h('div', { class: 'page-actions' }, preview, refresh), previewPanel) }),
    card({ title: 'Relationship provenance', body: table({ rows: report.provenance, caption: 'Rules contributing graph relationships', columns: [
      { label: 'Origin', render: (r) => badge(r.ruleId) }, { label: 'Distinct relationships', render: (r) => r.count },
    ], emptyMessage: 'No linked operational records yet. Register a case through Intake or Operational cases.' }) }),
    card({ title: 'Graph integrity diagnostics', subtitle: 'Diagnostics do not delete or rewrite evidence. Review source records before any repair.', body: table({ rows: report.findings, caption: 'Operational link diagnostics', columns: [
      { label: 'Finding', render: (r) => badge(r.kind, 'warn') },
      { label: 'Link reference', render: (r) => r.linkId || 'Unspecified' },
      { label: 'Action', render: (r) => r.detail },
    ], emptyMessage: 'No invalid operational relationships detected in the inspected graph.' }) }),
    card({ title: 'Savepoint contract', body: h('p', null, 'Each post-commit rule runs in isolation. On success, its records and audit events become available to the next rule. On exception, its changes and success events are discarded, a failure is logged, and the next rule continues from the last successful state. Source-action automation and external side effects are not covered. No rule sends network messages.') }),
  );
}
