/** app/views/matrixDemandVariancePanel.js — `#/matrix?panel=demand-variance`, the Matrix Demand-Variance Early Warning (ADR-0173, Schema v137 unchanged).

The accountability ledger can see a line's declared share; the decision log can
see the calls still open. Nothing compared the age-weighted demand piling up on
each declared line against what that line declared it could carry — so a
cross-line overload was visible nowhere, and a single-line backlog looked like
ordinary queueing. This panel is the comparison, with every refusal printed.
 */

import { h, toast } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { badge, banner, card, emptyState, stat, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import {
  buildMatrixDemandVariance,
  matrixDemandVarianceBriefText,
  matrixDemandVarianceCsvRows,
} from '../core/domain/matrixDemandVariance.js';
import {
  DEMAND_VARIANCE_CSV_COLUMNS,
  DEMAND_VARIANCE_CONVENTIONS,
  DEMAND_VARIANCE_FRAMEWORKS,
  DEMAND_VARIANCE_VERDICTS,
} from '../core/domain/matrixDemandVarianceRegistry.js';

const num = (value) => (value === null || value === undefined || value === '' ? '—' : String(value));
const pd = (hundredths) => (hundredths === null || hundredths === undefined ? '—' : (hundredths / 100).toFixed(2));
const toneFor = (verdict) => {
  const v = DEMAND_VARIANCE_VERDICTS.find((x) => x.key === verdict);
  return v ? v.tone : 'neutral';
};

/** Serialize the same aggregate rows the panel displays, using the canonical RFC 4180 column-first contract. */
export function matrixDemandVarianceCsvText(report) {
  const columns = DEMAND_VARIANCE_CSV_COLUMNS.map((key) => ({ key, header: key }));
  return serializeCsv(columns, matrixDemandVarianceCsvRows(report));
}

function downloadDemandVarianceCsv(report) {
  const csv = matrixDemandVarianceCsvText(report);
  downloadText({
    filename: `matrix-demand-variance-${report.board.periodKey || 'unreadable'}.csv`,
    text: csv,
    mime: 'text/csv',
  });
}

function boardPanel(report) {
  const b = report.board;
  if (!b.periodKey) {
    return banner({ tone: 'bad', title: 'The period is unreadable', body: 'No demand can be priced for an unreadable period.' });
  }
  const stats = [
    stat({ label: 'Open decisions in window', value: num(b.decisionsN), hint: `of ${b.windowDays} day(s)` }),
    stat({ label: 'Attributed to a line', value: num(b.attributedN), hint: 'counted once, never split' }),
    stat({ label: 'Unassigned', value: num(b.unassignedN), tone: b.unassignedN ? 'bad' : '' }),
    stat({ label: 'Ambiguous line', value: num(b.ambiguousN), tone: b.ambiguousN ? 'warn' : '' }),
    stat({ label: 'Unresolvable', value: num(b.unresolvableN), tone: b.unresolvableN ? 'bad' : '' }),
    stat({ label: 'Outside this seat', value: num(b.outsideSeatN), hint: 'counted, not shown' }),
  ];
  const totals = b.figuresComplete
    ? h('p', { class: 'muted small' }, `Age-weighted demand totals ${pd(b.demandH)} person-days against declared ceilings of ${pd(b.ceilingH)} — variance ${pd(b.varianceH)}. Counts ${b.countsReconcile ? 'reconcile' : 'do NOT reconcile — the discrepancy is printed, not smoothed'}.`)
    : h('p', { class: 'muted small' }, `Age-weighted demand totals ${pd(b.demandH)} person-days, but at least one ceiling could not be priced, so no workspace ceiling or variance is printed — a total over the priced lines would understate the claim. Counts ${b.countsReconcile ? 'reconcile' : 'do NOT reconcile'}.`);
  return h('div', { class: 'stack' },
    h('div', { class: 'grid grid-3' }, stats),
    totals,
    b.overCeilingN
      ? banner({ tone: 'bad', title: `${b.overCeilingN} line(s) are over their declared share-days ceiling`, body: 'Age-weighted open demand exceeds what the line declared it can carry for the window. A capacity-and-queue signal about the structure, never a person rating.' })
      : null,
    b.ceilingUnprovableN
      ? banner({ tone: 'warn', title: `${b.ceilingUnprovableN} line(s) have no provable ceiling`, body: 'The comparison is refused on those lines. A ceiling projected from today\u2019s share would be a guessed number, and guesses are not printed here.' })
      : null,
    b.figuresComplete === false && !b.ceilingUnprovableN ? null : null,
  );
}

function linesPanel(report) {
  const rows = report.lines.map((l) => {
    const d = l.decisions[0] || {};
    return {
      person: l.personName,
      line: l.managerName,
      kind: l.kind || 'home',
      demandDays: l.demandDays,
      demandPersonDays: pd(l.demandH),
      ceiling: l.ceilingH === null ? '—' : pd(l.ceilingH),
      variance: l.varianceH === null ? '—' : pd(l.varianceH),
      verdict: h('span', {}, badge(l.verdictLabel, toneFor(l.verdict))),
      decision: d.title ? `${d.title} (${d.ageDays}d open)` : '—',
      reason: l.ceilingH === null ? (l.ceiling.reason || '') : '',
    };
  });
  return card({
    title: `Lines in scope — ${report.board.periodKey || 'unreadable period'}`,
    subtitle: 'One row per line with open demand: age-weighted demand-days, the declared share-day ceiling, the variance, and the verdict. A refused ceiling prints its reason, never a zero.',
    body: table({
      columns: [
        { key: 'person', label: 'Person' },
        { key: 'line', label: 'Funding line' },
        { key: 'kind', label: 'Line kind' },
        { key: 'demandDays', label: 'Demand (days open)' },
        { key: 'demandPersonDays', label: 'Demand (person-days)' },
        { key: 'ceiling', label: 'Ceiling (person-days)' },
        { key: 'variance', label: 'Variance (person-days)' },
        { key: 'verdict', label: 'Verdict' },
        { key: 'decision', label: 'Queued decision' },
        { key: 'reason', label: 'Refusal reason' },
      ],
      rows,
      caption: 'Per-line demand-variance readings for the window',
      emptyMessage: 'No line carries attributable open demand in this window. Every open decision is either attributed above or refused below.',
    }),
  });
}

function refusalsPanel(report) {
  const rows = report.refusals.map((r) => ({
    class: r.class,
    title: r.title,
    date: r.date,
    ageDays: r.ageDays,
    reason: r.reason,
  }));
  if (!rows.length) return null;
  return card({
    title: `Demand refused attribution — ${rows.length} decision(s)`,
    subtitle: 'These decisions are counted in the board totals but assigned to no line: no manager is silently picked as owner, and no line absorbs them.',
    body: table({
      columns: [
        { key: 'class', label: 'Refusal' },
        { key: 'title', label: 'Decision' },
        { key: 'date', label: 'Opened' },
        { key: 'ageDays', label: 'Days open' },
        { key: 'reason', label: 'Reason' },
      ],
      rows,
      caption: 'Every refusal carries its reason; refused demand is never smoothed into a line total.',
    }),
  });
}

function bottlenecksPanel(report) {
  const rows = report.bottlenecks.map((b) => ({
    decision: b.decisionTitle,
    decisionAge: b.decisionAgeDays,
    dependsOn: b.dependsOnTitle,
    dependsAge: b.dependsOnAgeDays === null ? '—' : `${b.dependsOnAgeDays}d`,
    relation: b.relation,
  }));
  if (!rows.length) return null;
  return card({
    title: 'Dated dependencies the queue is waiting on',
    subtitle: 'Each open decision\u2019s dated dependencies, named but not assigned an owner. A decision blocked on another line\u2019s decision is a cross-line bottleneck, not a single manager\u2019s delay.',
    body: table({
      columns: [
        { key: 'decision', label: 'Decision waiting' },
        { key: 'decisionAge', label: 'Days open' },
        { key: 'dependsOn', label: 'Waiting on' },
        { key: 'dependsAge', label: 'Dependency age' },
        { key: 'relation', label: 'Link' },
      ],
      rows,
      caption: 'Bottlenecks are identified by dated dependency, never by selecting one manager as owner.',
    }),
  });
}

function flowPanel(report) {
  const f = report.board.flow;
  if (!f) return null;
  return card({
    title: 'Flow observation (Little’s Law)',
    subtitle: 'L = λ × W over the window: an observation about the queue, not a forecast of the future.',
    body: h('div', { class: 'stack-sm' },
      f.withheld
        ? banner({ tone: 'neutral', title: 'Flow figure withheld', body: f.reason })
        : h('p', { class: 'muted small' }, `Arrivals ≈ ${(f.lambdaPerDay * 1000).toFixed(0)} per thousand window-days; mean age ≈ ${f.meanAgeDays} day(s); implied average work in progress L = λ × W ≈ ${f.impliedWip} decision(s).`),
      h('p', { class: 'muted small' }, "Kingman's approximation is refused: the workspace records no service-time distribution for decisions, so a Wq estimate would be invented. It is run only where arrival and service variation are evidenced."),
    ),
  });
}

function briefPanel(report) {
  const brief = matrixDemandVarianceBriefText(report);
  const downloadCsv = () => downloadDemandVarianceCsv(report);
  return card({
    title: 'The brief (identity-free)',
    subtitle: 'The paragraph that goes upward. It names no person, no line and no decision.',
    actions: [h('button', { class: 'btn btn-small', type: 'button', onclick: downloadCsv }, 'Download CSV (aggregate-only)')],
    body: h('div', { class: 'stack-sm' },
      h('p', {}, brief),
      h('p', { class: 'muted small' }, 'The export carries counts only — no person, no line, no decision title, no date, no free text. A refused figure is BLANK with its flag set, never a zero.'),
    ),
  });
}

function conventionsPanel() {
  return card({
    title: 'What the reading assumes (printed, not hidden)',
    subtitle: 'Conventions and frameworks. A convention is a declaration, not a measurement.',
    body: h('div', { class: 'stack-sm' },
      h('h4', {}, 'Conventions'),
      DEMAND_VARIANCE_CONVENTIONS.map((c) => h('div', { class: 'stack-sm' },
        h('strong', {}, c.label),
        h('p', { class: 'muted small' }, c.detail))),
      h('h4', {}, 'Frameworks'),
      DEMAND_VARIANCE_FRAMEWORKS.map((f) => h('div', { class: 'stack-sm' },
        h('strong', {}, f.label),
        h('p', { class: 'muted small' }, f.detail))),
    ),
  });
}

export function renderMatrixDemandVariancePanel(ctx, opts = {}) {
  const state = ctx?.state || {};
  const now = opts.now || new Date();
  const report = buildMatrixDemandVariance(state, { now, settings: state.settings || null });

  return h('div', { class: 'stack' },
    h('p', { class: 'lede' }, 'The accountability ledger can see a line’s declared share; the decision log can see the calls still open. Nothing compared the age-weighted demand piling up on each declared line against what that line declared it could carry — so a cross-line overload was visible nowhere, and a single-line backlog looked like ordinary queueing. This panel is the comparison, with every refusal printed.'),
    boardPanel(report),
    linesPanel(report),
    refusalsPanel(report),
    bottlenecksPanel(report),
    flowPanel(report),
    briefPanel(report),
    conventionsPanel(),
  );
}
