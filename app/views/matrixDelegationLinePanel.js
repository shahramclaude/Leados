/** #/matrix?panel=asks — ADR-0178. */
import { h, toast } from '../ui/dom.js';
import { badge, banner, card, emptyState, stat, table } from '../ui/components.js';
import { exportWorkspaceCsv } from '../core/csv.js';
import { downloadText } from '../ui/download.js';
import { DELEGATION_LINE_CLASS_LABELS, DELEGATION_LINE_VERDICT_LABELS, DELEGATION_LINE_RULE_ID } from '../core/domain/delegationLineRegistry.js';
import { delegationLineBriefText } from '../core/domain/delegationLines.js';

const tone = (x) => ['overloaded','unattributed','stale'].includes(x) ? 'bad' : ['share-undeclared','line-over-share','outside-charter','charter-silent'].includes(x) ? 'warn' : 'good';
function refresh(ctx) { if (typeof ctx?.refresh === 'function') ctx.refresh(); else if (typeof ctx?.rerender === 'function') ctx.rerender(); else if (typeof ctx?.render === 'function') ctx.render(); }
function act(ctx, result, ok) { if (!result?.ok) { toast(result?.error || 'The action was refused.', 'bad'); return; } toast(ok, 'good'); refresh(ctx); }
export function renderMatrixDelegationLinePanel(ctx, { now = new Date() } = {}) {
 const result = ctx.api?.delegationLineReport?.(); if (!result?.ok) return card({ title: 'Cross-line asks', body: banner({ tone: 'bad', title: 'Register refused', body: result?.error || 'The reader could not run.' }) });
 const r = result.report, b = r.board; const reconciles = b.classesReconcile && b.verdictsReconcile && b.linesReconcile && b.charterReconcile;
 const actions = h('div', { class: 'row gap' },
  r.actor.canScan ? h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => act(ctx, ctx.api.delegationLineScan(), `Scanned (${DELEGATION_LINE_RULE_ID}).`) }, 'Scan overload') : null,
  h('button', { class: 'btn btn-small', type: 'button', onClick: () => downloadText({ filename: `leados-cross-line-asks-${r.generatedOn}.txt`, text: delegationLineBriefText(r) }) }, 'Download brief'),
  h('button', { class: 'btn btn-small', type: 'button', onClick: () => { const x = exportWorkspaceCsv(ctx.state || {}, 'delegation-lines', { now }); if (!x?.ok) return toast(x?.error || 'Export refused.', 'bad'); downloadText({ filename: x.filename, text: x.csv }); } }, 'Export CSV (#133)'));
 const rows = r.people.flatMap((p) => p.askRows.map((a) => ({ ...a, person: p, lines: p.lines })));
 return h('div', { class: 'stack', 'data-testid': 'delegation-line-panel' },
  card({ title: 'Cross-Line Ask Attribution', subtitle: 'Multi-principal agency + common-pool capacity: every open ask is charged to a recorded line, or explicitly to no line.', actions, body: h('div', { class: 'stack' },
   reconciles ? banner({ tone: b.verdicts.overloaded || b.classes.unattributed || b.classes.stale ? 'warn' : 'good', title: 'All four count identities reconcile', body: h('pre', { class: 'small', 'data-testid': 'dla-brief' }, delegationLineBriefText(r)) }) : banner({ tone: 'bad', title: 'Reconciliation failure — do not rely on these figures', body: 'At least one displayed partition does not sum to its computed population.' }),
   h('div', { class: 'stat-grid' }, stat({ label: 'Open asks read', value: String(b.asksReadN), hint: `${b.asksNotReadN} outside this seat` }), stat({ label: 'Shared people', value: String(b.sharedPeopleReadN) }), stat({ label: 'Over budget', value: String(b.verdicts.overloaded), tone: b.verdicts.overloaded ? 'bad' : 'good' }), stat({ label: 'On no line / stale', value: `${b.classes.unattributed} / ${b.classes.stale}`, tone: b.classes.unattributed + b.classes.stale ? 'bad' : 'good' }), stat({ label: 'Lines over share', value: String(b.lines['over-share']), tone: b.lines['over-share'] ? 'warn' : 'good' }), stat({ label: 'Open reconciliations', value: String(b.openReconciliationAsksN), hint: DELEGATION_LINE_RULE_ID })) ) }),
  r.people.length ? card({ title: 'Shared contributors', body: table({ caption: 'People with open asks and more than one reporting line', columns: [
   { label: 'Person', key: 'personName' }, { label: 'Open asks', key: 'asksN' }, { label: 'Verdict', render: (p) => badge(DELEGATION_LINE_VERDICT_LABELS[p.verdict], tone(p.verdict)) }, { label: 'No readable line', key: 'unreadableN' }, { label: 'Covering seat', render: (p) => p.apexState },
  ], rows: r.people }) }) : emptyState({ title: 'No shared contributor with open work', body: r.inertNote }),
  rows.length ? card({ title: 'Open asks and issuing lines', subtitle: 'Changing a line appends a new act. Nothing is overwritten.', body: table({ caption: 'Ask attribution ledger', columns: [
   { label: 'Person', render: (x) => x.person.personName }, { label: 'Ask', key: 'title' }, { label: 'Attribution', render: (x) => badge(DELEGATION_LINE_CLASS_LABELS[x.classKey], tone(x.classKey)) },
   { label: 'Line', render: (x) => { const select = h('select', { class: 'input', 'aria-label': `Reporting line for ${x.title}` }, h('option', { value: '' }, 'Choose line'), ...x.lines.map((l) => h('option', { value: l.lineId, ...(l.lineId === x.lineId ? { selected: 'selected' } : {}) }, `${l.kind} · ${l.managerId}`))); return h('div', { class: 'row gap' }, select, h('button', { class: 'btn btn-small', type: 'button', disabled: !r.actor.canAttribute, onClick: () => act(ctx, ctx.api.delegationLineAttribute(x.delegationId, select.value), 'Ask attributed to the recorded line.') }, 'Record')); } },
   { label: 'Charter', render: (x) => x.charterState ? badge(x.charterState, tone(x.charterState)) : '—' },
  ], rows }) }) : null,
  card({ title: 'Method and refusal contract', body: h('ol', { class: 'stack small' }, ...r.method.map((m) => h('li', {}, m))) }) );
}
