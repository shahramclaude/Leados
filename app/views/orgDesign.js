/**
 * app/views/orgDesign.js — the Structural Design Terminal (`#/orgdesign`,
 * Schema v53).
 *
 * Every other screen optimises work inside the structure. This one is allowed to
 * change the structure, which is the most consequential and least instrumented
 * decision a manager makes. The page is arranged as an argument rather than a
 * dashboard:
 *
 *   1. **Structure** — who reports to whom, how wide each unit is, and where the
 *      declared band is breached. The tree is rendered as a flat, indented,
 *      screen-reader-ordered list rather than an SVG: a hierarchy *is* an
 *      ordered list, and pretending otherwise costs keyboard users the screen.
 *   2. **Coordination** — channels, hours and money, priced from recorded pay
 *      and explicitly absent where no pay exists.
 *   3. **Decision queue** — each manager's own measured arrivals, service time
 *      and utilisation, and Kingman's wait derived from them.
 *   4. **Designs** — declared alternatives, their measured and modelled deltas,
 *      the Pareto frontier, and the commit/revert/settle gates.
 *   5. **Authority** — where approvals and open commitments actually sit.
 *   6. **Method** — the conventions, the floor on every statistic, and what the
 *      module refuses to claim.
 *
 * Every card is assembled from named locals rather than deep inline nesting, so
 * the structure of the page is readable in the source and a missing closer is a
 * syntax error rather than a subtly wrong tree.
 */

import { h, toast } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, table, emptyState, kv } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { formatDate } from '../core/time.js';
import {
  ORG_DESIGN_STATUS_LABELS,
  buildStructure,
  conventionsFromSettings,
  designPortfolio,
  orgDesignBrief,
  scoreDesignPrediction,
  structureReading,
} from '../core/domain/orgDesign.js';
import { openOrgDesignDialog, openMovesDialog, openConventionDialog } from '../ui/orgdesign-modals.js';

function money(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `USD ${Math.round(Number(value)).toLocaleString('en-US')}`;
}

function pct(value, dp = 0) {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value) * 10 ** dp) / 10 ** dp}%` : '—';
}

function weeks(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${Math.round(Number(value) * 10) / 10} wk`;
}

function signed(value, dp = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const rounded = Math.round(Number(value) * 10 ** dp) / 10 ** dp;
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}

const TONE_BY_VERDICT = {
  'within-band': 'good',
  'over-band': 'warn',
  concentrated: 'warn',
  undesigned: 'neutral',
};

/* --------------------------------------------------------------- structure */

function structureTree(reading) {
  const structure = reading.structure;
  if (!structure.units.length) return emptyState({ title: 'No reporting lines recorded' });
  const rows = [];
  const walk = (id, depth) => {
    const node = structure.nodeById.get(id);
    if (!node) return;
    const overBy = node.directReports - reading.conventions.spanMax;
    const head = h('div', { class: 'row-between' },
      h('span', null,
        h('strong', null, node.name),
        node.role ? h('span', { class: 'muted' }, ` ${node.role}`) : null),
      h('span', { class: 'cluster-xs' },
        badge(`${node.directReports} direct`, overBy > 0 ? 'warn' : node.directReports ? 'neutral' : 'good'),
        depth === 0 ? badge('Top of the tree', 'neutral') : null));
    rows.push(h('li', {
      class: 'stack-xs',
      style: `padding-left:${Math.min(depth, 6) * 1.25}rem`,
      'data-testid': `org-node-${id}`,
    }, head));
    for (const child of node.reports) walk(child, depth + 1);
  };
  const roots = structure.roots.length ? structure.roots : structure.nodes.slice(0, 1).map((node) => node.id);
  for (const rootId of roots.slice(0, 12)) walk(rootId, 0);
  return h('ul', { class: 'list-plain stack-xs', 'aria-label': 'Reporting structure' }, ...rows);
}

/* ------------------------------------------------------------ coordination */

function coordinationCard(reading) {
  const stats = h('div', { class: 'stat-grid' },
    stat({ label: 'Coordination channels', value: String(reading.coordination.channels), hint: 'unordered pairs inside each unit, manager included' }),
    stat({ label: 'Hours per week', value: String(reading.coordination.hoursPerWeek), hint: `${reading.conventions.coordinationHoursPerWeek} h per channel` }),
    stat({
      label: 'Annual cost',
      value: money(reading.coordination.annualCost),
      hint: reading.coordination.pricedUnits
        ? `${pct(reading.coordination.pricedShare * 100)} of channels priced`
        : 'no manager has recorded pay',
      tone: reading.coordination.annualCost === null ? 'warn' : '',
    }));

  const unitTable = table({
    caption: 'Coordination cost per unit',
    columns: [
      { label: 'Manager', render: (row) => row.managerName },
      { label: 'Span', render: (row) => String(row.span) },
      { label: 'Channels', render: (row) => String(row.channels) },
      { label: 'Hours / week', render: (row) => String(row.hoursPerWeek) },
      { label: 'Loaded rate', render: (row) => (row.hourlyRate === null ? '—' : `${money(row.hourlyRate)}/h`) },
      { label: 'Cost / year', render: (row) => (row.annualCost === null ? badge('unpriced', 'warn') : money(row.annualCost)) },
    ],
    rows: reading.units,
    emptyMessage: 'No units to price',
  });

  const trade = banner({
    tone: 'info',
    title: 'The marginal cost of one more report',
    body: 'Each unit’s channel count is exact — Brooks’s n(n−1)/2 with the manager included. The hours are your declared convention, and the money is derived from recorded pay. A wider unit is not automatically wrong; this prices the trade.',
  });

  const body = h('div', { class: 'stack-sm' }, stats, h('p', { class: 'muted' }, reading.coordination.note), unitTable, trade);
  return card({ title: 'Coordination load', subtitle: 'Channels are counted; hours and money are declared conventions', body });
}

/* -------------------------------------------------------------------- queue */

function queueCard(reading) {
  const rows = reading.queue.rows.map((row) => ({
    managerName: row.managerName,
    span: row.span,
    open: row.queue.open,
    sample: row.queue.sample,
    serviceDays: row.queue.serviceDaysMedian,
    utilisation: row.queue.utilisation,
    p80: row.queue.percentiles.p80,
    basis: row.queue.basis,
  }));

  const stats = h('div', { class: 'stat-grid' },
    stat({
      label: 'Managers measurable',
      value: `${reading.queue.measuredCount} / ${rows.length}`,
      hint: `${reading.conventions.minQueueSample} completed commitments required`,
    }),
    stat({
      label: 'Median service time',
      value: reading.queue.medianServiceDays === null ? '—' : `${reading.queue.medianServiceDays} d`,
      hint: 'median across measured managers',
    }),
    stat({
      label: 'Median P80 wait',
      value: reading.queue.medianP80Weeks === null ? '—' : weeks(reading.queue.medianP80Weeks),
      hint: reading.queue.unstableCount ? `${reading.queue.unstableCount} unstable queue(s)` : 'no unstable queue',
      tone: reading.queue.unstableCount ? 'bad' : '',
    }));

  const tableEl = table({
    caption: 'Measured decision queue per manager',
    columns: [
      { label: 'Manager', render: (row) => row.managerName },
      { label: 'Span', render: (row) => String(row.span) },
      { label: 'Open', render: (row) => String(row.open) },
      { label: 'Sample', render: (row) => String(row.sample) },
      { label: 'Service time', render: (row) => (row.serviceDays === null ? '—' : `${row.serviceDays} d`) },
      {
        label: 'Utilisation',
        render: (row) => (row.utilisation === null
          ? badge('not measured', 'neutral')
          : badge(String(row.utilisation), row.utilisation >= 1 ? 'bad' : row.utilisation >= 0.85 ? 'warn' : 'good')),
      },
      { label: 'P80 wait', render: (row) => (row.p80 === null ? '—' : weeks(row.p80)) },
      { label: 'Basis', render: (row) => h('span', { class: 'muted' }, row.basis) },
    ],
    rows,
    emptyMessage: 'No manager carries completions yet',
  });

  const body = h('div', { class: 'stack-sm' }, stats, h('p', { class: 'muted' }, reading.queue.note), tableEl);
  return card({ title: 'The decision queue, measured per manager', subtitle: 'Kingman (1961) from each manager’s own completed commitments', body });
}

/* ------------------------------------------------------------------ designs */

function designComparisonCard(portfolio) {
  if (!portfolio.simulations.length) {
    return emptyState({
      title: 'No structural design declared',
      body: 'Declare the reporting changes you are considering. The module applies them to today’s roster in memory, measures the consequence, and changes nothing until you commit.',
    });
  }
  const tableEl = table({
    caption: 'Declared structural designs',
    columns: [
      {
        label: 'Design',
        render: (row) => h('span', null,
          h('strong', null, row.label),
          row.design.status === 'draft' ? null : h('span', null, ' ', badge(ORG_DESIGN_STATUS_LABELS[row.design.status] || row.design.status, row.design.status === 'committed' ? 'good' : 'neutral'))),
      },
      { label: 'Moves', render: (row) => String(row.delta.moved) },
      { label: 'Δ hours / week', render: (row) => signed(row.delta.coordinationHoursPerWeek) },
      { label: 'Δ over band', render: (row) => signed(row.delta.overBandCount, 0) },
      { label: 'Δ max span', render: (row) => signed(row.delta.maxSpan, 0) },
      { label: 'Modelled P80', render: (row) => (row.delta.modelledWaitP80Weeks === null ? '—' : weeks(row.delta.modelledWaitP80Weeks)) },
      {
        label: 'Frontier',
        render: (row) => {
          const entry = portfolio.frontier.rows.find((item) => item.designId === row.designId);
          if (!entry) return badge('—', 'neutral');
          return entry.frontier ? badge('on the frontier', 'good') : badge(`dominated by ${entry.dominatedBy.length}`, 'warn');
        },
      },
    ],
    rows: portfolio.simulations,
    emptyMessage: 'No designs',
  });
  const body = h('div', { class: 'stack-sm' }, tableEl, h('p', { class: 'muted' }, portfolio.frontier.note));
  return card({ title: 'Declared designs', subtitle: 'Measured against today’s structure; nothing has moved yet', body });
}

function consequenceTable(sim) {
  return table({
    caption: 'Consequences of the proposed structure',
    columns: [
      { label: 'Reading', render: (row) => row.label },
      { label: 'Today', render: (row) => row.before },
      { label: 'Proposed', render: (row) => row.after },
      { label: 'Change', render: (row) => row.delta },
    ],
    rows: [
      { label: 'Max span', before: String(sim.baseline.span.max ?? '—'), after: String(sim.proposed.span.max ?? '—'), delta: signed(sim.delta.maxSpan, 0) },
      { label: 'Units over band', before: String(sim.baseline.span.overBandCount), after: String(sim.proposed.span.overBandCount), delta: signed(sim.delta.overBandCount, 0) },
      { label: 'Coordination hours / week', before: String(sim.baseline.coordination.hoursPerWeek), after: String(sim.proposed.coordination.hoursPerWeek), delta: signed(sim.delta.coordinationHoursPerWeek) },
      { label: 'Annual coordination cost', before: money(sim.baseline.coordination.annualCost), after: money(sim.proposed.coordination.annualCost), delta: sim.delta.annualCost === null ? '—' : money(sim.delta.annualCost) },
      { label: 'Layers', before: String(sim.baseline.layers), after: String(sim.proposed.layers), delta: signed(sim.delta.layers, 0) },
      { label: 'Measured median P80 wait', before: weeks(sim.baseline.queue.medianP80Weeks), after: weeks(sim.proposed.queue.medianP80Weeks), delta: signed(sim.delta.medianWaitP80Weeks, 1) },
      { label: 'Modelled median P80 wait', before: '—', after: weeks(sim.delta.modelledWaitP80Weeks), delta: 'model, not measurement' },
    ],
    emptyMessage: 'Nothing to compare',
  });
}

function queueModelTable(sim) {
  if (!sim.queueModel.length) return null;
  return table({
    caption: 'Modelled queue per manager after the design',
    columns: [
      { label: 'Manager', render: (row) => row.managerName },
      { label: 'Span before → after', render: (row) => `${row.spanBefore === null ? '—' : row.spanBefore} → ${row.spanAfter}` },
      {
        label: 'Utilisation after',
        render: (row) => (row.utilisation === null
          ? badge('not measured', 'neutral')
          : badge(String(row.utilisation), row.utilisation >= 1 ? 'bad' : row.utilisation >= 0.85 ? 'warn' : 'good')),
      },
      { label: 'Modelled P80', render: (row) => (row.waitP80Weeks === null ? '—' : weeks(row.waitP80Weeks)) },
      { label: 'Basis', render: (row) => h('span', { class: 'muted' }, row.note) },
    ],
    rows: sim.queueModel,
    emptyMessage: 'No managers to model',
  });
}

function scoreCard(score) {
  if (!score || score.status === 'not-frozen') return null;
  const body = score.status === 'scored'
    ? h('div', { class: 'stat-grid' },
      stat({ label: 'Median absolute error', value: pct(score.medianApePct, 1), hint: `${score.scoredCount} manager(s) scored` }),
      stat({ label: 'Scored managers', value: String(score.scoredCount), hint: `floor ${score.minScored}` }))
    : h('p', { class: 'muted' }, score.detail);
  return card({ title: 'Prediction versus the record', subtitle: score.detail, body });
}

function designDetailCard(sim, ctx, now) {
  if (!sim) return null;
  const design = sim.design;
  const isDraft = design.status === 'draft';
  const isCommitted = design.status === 'committed';

  const commitButton = isDraft
    ? h('button', {
      class: 'btn btn-primary btn-sm',
      type: 'button',
      onClick: () => {
        const result = ctx.api.commitOrgDesign(design.id);
        if (!result.ok) { toast(result.error, 'bad'); return; }
        toast('Committed — reporting lines changed and the prediction is frozen', 'good');
        ctx.refresh();
      },
    }, 'Commit reporting lines')
    : null;

  const editButton = isDraft
    ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openMovesDialog(ctx, design) }, 'Edit moves')
    : null;

  const revertButton = isCommitted
    ? h('button', {
      class: 'btn btn-ghost btn-sm',
      type: 'button',
      onClick: () => {
        const result = ctx.api.revertOrgDesign(design.id);
        if (!result.ok) { toast(result.error, 'bad'); return; }
        toast(`Reverted ${result.restored} reporting line(s)${result.skipped ? `; ${result.skipped} had changed again` : ''}`, result.skipped ? 'neutral' : 'good');
        ctx.refresh();
      },
    }, 'Revert to the recorded lines')
    : null;

  const settleButton = isCommitted && design.snapshot
    ? h('button', {
      class: 'btn btn-ghost btn-sm',
      type: 'button',
      onClick: () => {
        const overdue = !design.reviewOn || design.reviewOn <= (ctx.today || '');
        const result = ctx.api.settleOrgDesign(design.id, { force: !overdue });
        if (!result.ok) { toast(result.error, 'bad'); return; }
        toast('Settled — the frozen prediction was compared to the record', 'good');
        ctx.refresh();
      },
    }, 'Score the prediction')
    : null;

  const abandonButton = isDraft
    ? h('button', {
      class: 'btn btn-ghost btn-sm',
      type: 'button',
      onClick: () => {
        const result = ctx.api.abandonOrgDesign(design.id);
        if (!result.ok) { toast(result.error, 'bad'); return; }
        toast('Design abandoned and kept in the record', 'neutral');
        ctx.refresh();
      },
    }, 'Abandon')
    : null;

  const ownerName = design.ownerId
    ? (ctx.state.people.find((person) => person.id === design.ownerId)?.name || 'Removed person')
    : 'Unset';

  const facts = h('div', { class: 'kv-grid' },
    kv('Status', ORG_DESIGN_STATUS_LABELS[design.status] || design.status),
    kv('Owner', ownerName),
    kv('Declared', design.declaredOn ? formatDate(design.declaredOn) : '—'),
    kv('Committed', design.committedOn ? formatDate(design.committedOn) : '—'),
    kv('Review due', design.reviewOn ? formatDate(design.reviewOn) : '—'),
    kv('People whose line moves', String(sim.delta.moved)));

  const snapshotBanner = design.snapshot
    ? banner({
      tone: 'info',
      title: 'Frozen at commit',
      body: `Max span ${design.snapshot.after?.maxSpan ?? '—'}, ${design.snapshot.after?.overBandCount ?? '—'} unit(s) over band, ${design.snapshot.after?.coordinationHoursPerWeek ?? '—'} coordination hours per week, modelled median P80 wait ${design.snapshot.predicted?.modelledWaitP80Weeks === null || design.snapshot.predicted?.modelledWaitP80Weeks === undefined ? 'not modelled' : weeks(design.snapshot.predicted.modelledWaitP80Weeks)}. Kept verbatim: the score compares the design to this, never to a number recomputed later.`,
    })
    : null;

  const historyList = h('ul', { class: 'list-plain stack-xs' },
    ...(design.history || []).slice(-6).map((entry) => h('li', { class: 'muted' },
      `${formatDate(entry.at)} · ${entry.summary}`)));

  const body = h('div', { class: 'stack-sm' },
    facts,
    consequenceTable(sim),
    queueModelTable(sim),
    scoreCard(design.status === 'settled' ? scoreDesignPrediction(ctx.state, design, { now }) : null),
    snapshotBanner,
    historyList);

  return card({
    title: design.label,
    subtitle: design.purpose || 'No stated purpose',
    actions: [commitButton, editButton, revertButton, settleButton, abandonButton].filter(Boolean),
    body,
  });
}

/* ------------------------------------------------------------------- rights */

function rightsCard(reading) {
  const topStats = h('div', { class: 'stat-grid' },
    stat({ label: 'Decisions with a named approver', value: String(reading.rights.total), hint: `${reading.rights.decidedCount} decided` }),
    stat({ label: 'Distinct approvers', value: String(reading.rights.distinctApprovers), hint: 'recorded names, not verified people' }),
    stat({
      label: 'Concentration (HHI)',
      value: reading.rights.hhi === null ? '—' : String(reading.rights.hhi),
      hint: reading.rights.topSharePct === null ? 'no decisions' : `top approver ${reading.rights.topSharePct}%`,
      tone: reading.rights.hhi !== null && reading.rights.hhi >= 6000 ? 'warn' : '',
    }));

  const loadStats = h('div', { class: 'stat-grid' },
    stat({ label: 'Gini', value: reading.load.gini === null ? '—' : String(reading.load.gini), hint: '0 equal · 1 one person holds everything' }),
    stat({ label: 'HHI', value: reading.load.hhi === null ? '—' : String(reading.load.hhi), hint: 'share concentration' }),
    stat({ label: 'Largest share', value: reading.load.topSharePct === null ? '—' : pct(reading.load.topSharePct, 1), hint: `median ${reading.load.median ?? '—'} open` }));

  const loadTable = table({
    caption: 'Open commitments per person',
    columns: [
      { label: 'Person', render: (row) => row.name },
      { label: 'Direct reports', render: (row) => String(row.span) },
      { label: 'Open commitments', render: (row) => String(row.open) },
    ],
    rows: reading.load.rows.slice(0, 12),
    emptyMessage: 'No open commitments recorded',
  });

  const loadCard = card({
    title: 'Responsibility concentration',
    subtitle: 'Open commitments per person, across the whole tree',
    body: h('div', { class: 'stack-sm' }, loadStats, loadTable),
  });

  const body = h('div', { class: 'stack-sm' }, topStats, h('p', { class: 'muted' }, reading.rights.note), loadCard);
  return card({ title: 'Where approval authority sits', subtitle: 'Concentration is a governance property, never a judgement about a person', body });
}

/* ------------------------------------------------------------------- method */

function methodCard(reading, conventions) {
  const items = [
    h('li', null, h('strong', null, `Span band ${conventions.spanMin}–${conventions.spanMax} `), 'is a declared supervisory convention (Graicunas 1933; Urwick 1956), configurable per workspace. A breach is a prompt to look, not a verdict.'),
    h('li', null, h('strong', null, 'Coordination channels '), 'are exact: n(n−1)/2 unordered pairs inside each unit with the manager included (Brooks 1975). Hours and money are declared conventions layered on that count.'),
    h('li', null, h('strong', null, 'The decision queue '), `is Kingman’s (1961) diffusion approximation, Wq = ρ/(1−ρ)·(Ca²+Cs²)/2·Ts. Ts and λ are measured from each manager’s own completed commitments over ${reading.conventions.queueWindowWeeks} weeks; Ca is assumed ${reading.conventions.assumedCa} when the sample cannot estimate it. Below ${reading.conventions.minQueueSample} completions a queue is reported as not measured — never as zero.`),
    h('li', null, h('strong', null, 'The counterfactual '), 'scales measured arrivals by the ratio of coordination channels before and after the design. That scaling is a convention, not an estimate, and it is printed beside every number it produced.'),
    h('li', null, h('strong', null, 'Pay '), 'comes from the latest merit cycle whose effective date has passed. A manager with no recorded pay is unpriced and excluded from the money — never priced at zero or at a median.'),
    h('li', null, h('strong', null, 'The frontier '), 'is a Pareto set over four minimised objectives. No composite score is computed, because a weighted index would decide the trade-off the leader has to decide.'),
    h('li', null, h('strong', null, 'What this refuses '), 'to do: choose which person should report to which person; score a person; infer a reorg from the current manager column; grade a prediction below the outcome floor.'),
  ];
  const body = h('div', { class: 'stack-sm' },
    h('ul', { class: 'list-plain stack-xs' }, ...items),
    banner({
      tone: 'info',
      title: 'Not claimed',
      body: 'A committed design is a change in reporting lines, not proof that the team got better. The score grades the queue model the design relied on. Real-browser and assistive-technology behaviour of this page remains a manual review responsibility.',
    }));
  return card({ title: 'Method and limits', subtitle: 'Every number on this page, and what produced it', body });
}

/* --------------------------------------------------------------- the page */

export function renderOrgDesign(ctx) {
  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now);
  const conventions = conventionsFromSettings(ctx.state);
  const reading = structureReading(ctx.state, buildStructure(ctx.state), { now, conventions });
  const portfolio = designPortfolio(ctx.state, now);
  const requested = ctx.query?.get?.('design') || '';
  const requestedPanel = ctx.query?.get?.('panel') || 'structure';
  const tabs = ['structure', 'coordination', 'queue', 'designs', 'rights', 'method'];
  const panel = tabs.includes(requestedPanel) ? requestedPanel : 'structure';
  const selected = portfolio.simulations.find((sim) => sim.design.id === requested) || portfolio.live;
  const design = selected ? selected.design : null;

  const designs = ctx.state.orgDesigns || [];
  const picker = designs.length > 1
    ? h('div', { class: 'stack-xs' },
      h('label', { for: 'orgdesign-select' }, 'Design'),
      h('select', {
        id: 'orgdesign-select',
        onChange: (event) => ctx.navigate(`#/orgdesign?design=${encodeURIComponent(event.target.value)}&panel=${panel}`),
      },
      ...designs.map((row) => h('option', { value: row.id, ...(design && row.id === design.id ? { selected: 'selected' } : {}) },
        `${row.label} · ${ORG_DESIGN_STATUS_LABELS[row.status] || row.status}`))))
    : null;

  const header = pageHeader({
    eyebrow: 'People · Schema v53',
    title: 'Structural design',
    subtitle: 'Is the shape of this team the reason everything is slow — and what happens if you change it? Span, coordination and the decision queue, measured from this workspace’s own records.',
    actions: [
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openOrgDesignDialog(ctx) }, 'Declare a design'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openConventionDialog(ctx, conventions) }, 'Conventions'),
      design
        ? h('button', {
          class: 'btn btn-ghost',
          type: 'button',
          onClick: () => {
            const result = ctx.api.scanOrgDesign(design.id);
            if (!result.ok) { toast(result.error, 'bad'); return; }
            toast(result.changed ? 'Scan complete — provenance and obligations reconciled' : 'Scan complete: nothing needed opening', result.changed ? 'good' : 'neutral');
            ctx.refresh();
          },
        }, 'Scan')
        : null,
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => downloadText('leados-structural-design.txt', orgDesignBrief(ctx.state, now)),
      }, 'Download brief'),
    ].filter(Boolean),
    meta: badge(reading.verdict.label, TONE_BY_VERDICT[reading.verdict.id] || 'neutral'),
  });

  const stats = h('div', { class: 'stat-grid' },
    stat({ label: 'People', value: String(reading.headcount), hint: `${reading.units.length} manager(s), ${reading.layers} layer(s)` }),
    stat({ label: 'Median span', value: String(reading.span.median ?? '—'), hint: `band ${conventions.spanMin}–${conventions.spanMax}`, tone: reading.span.overBandCount ? 'warn' : '' }),
    stat({
      label: 'Over band',
      value: String(reading.span.overBandCount),
      hint: reading.span.overBand.length
        ? reading.span.overBand.slice(0, 2).map((row) => `${row.managerName} (${row.span})`).join(', ')
        : 'none',
      tone: reading.span.overBandCount ? 'warn' : 'good',
    }),
    stat({ label: 'Coordination', value: `${reading.coordination.hoursPerWeek} h/wk`, hint: reading.coordination.annualCost === null ? 'not priced' : money(reading.coordination.annualCost) }));

  const tabsRow = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Structural design sections' },
    ...[
      { key: 'structure', label: 'Structure' },
      { key: 'coordination', label: 'Coordination' },
      { key: 'queue', label: 'Decision queue' },
      { key: 'designs', label: 'Designs' },
      { key: 'rights', label: 'Authority' },
      { key: 'method', label: 'Method' },
    ].map((item) => h('button', {
      class: `tab ${panel === item.key ? 'is-active' : ''}`,
      type: 'button',
      role: 'tab',
      'aria-selected': panel === item.key ? 'true' : 'false',
      onClick: () => ctx.navigate(`#/orgdesign?panel=${item.key}${design ? `&design=${encodeURIComponent(design.id)}` : ''}`),
    }, item.label)));

  const structurePanel = () => {
    const overBanner = reading.span.overBand.length
      ? banner({
        tone: 'warn',
        title: `${reading.span.overBand.length} unit(s) above the declared maximum of ${conventions.spanMax}`,
        body: reading.span.overBand.slice(0, 3).map((row) => `${row.managerName}: ${row.span} direct reports, ${row.channels} channels, ${row.over} over`).join(' · '),
      })
      : null;
    const treeCard = card({
      title: 'Reporting structure',
      subtitle: reading.verdict.detail,
      body: h('div', { class: 'stack-sm' }, structureTree(reading), overBanner),
    });
    const unitTable = table({
      caption: 'Span and coordination by unit',
      columns: [
        { label: 'Manager', render: (row) => row.managerName },
        { label: 'Direct reports', render: (row) => String(row.span) },
        { label: 'Channels', render: (row) => String(row.channels) },
        { label: 'Hours / week', render: (row) => String(row.hoursPerWeek) },
        {
          label: 'Band',
          render: (row) => (row.span > conventions.spanMax
            ? badge(`${row.span - conventions.spanMax} over`, 'warn')
            : row.span < conventions.spanMin
              ? badge('narrow', 'neutral')
              : badge('inside', 'good')),
        },
      ],
      rows: reading.units,
      emptyMessage: 'No managers with direct reports',
    });
    const unitsCard = card({
      title: 'Span and coordination by unit',
      subtitle: 'The same arithmetic the Coordination tab prices, against the tree',
      body: unitTable,
    });
    return h('div', { class: 'stack-md' }, treeCard, unitsCard, selected ? designDetailCard(selected, ctx, now) : null);
  };

  const panelBody = (() => {
    if (panel === 'coordination') return coordinationCard(reading);
    if (panel === 'queue') return queueCard(reading);
    if (panel === 'rights') return rightsCard(reading);
    if (panel === 'method') return methodCard(reading, conventions);
    if (panel === 'designs') return h('div', { class: 'stack-md' }, designComparisonCard(portfolio), designDetailCard(selected, ctx, now));
    return structurePanel();
  })();

  return h('div', { class: 'page', 'data-testid': 'orgdesign-page' },
    header,
    picker,
    stats,
    banner({
      tone: reading.verdict.id === 'over-band' ? 'warn' : 'info',
      title: reading.verdict.label,
      body: reading.verdict.detail,
    }),
    tabsRow,
    panelBody);
}
