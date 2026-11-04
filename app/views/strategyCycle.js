/** Strategy Renewal Bridge: five altitude-specific ways to close the Hoshin loop. */
import { h, openModal, toast } from '../ui/dom.js';
import { badge, banner, card, emptyState, pageHeader, stat, table } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { serializeCsv } from '../core/csv.js';
import { addDays, dayKey } from '../core/time.js';
import { STRATEGY_CYCLE_DISCLOSURE } from '../core/domain/strategyCycleRegistry.js';

const CSV_COLUMNS = [
  'row_kind', 'altitude', 'rank', 'active_pacts', 'carryover_pacts', 'overdue_pacts',
  'effort_days', 'delivery_reference_pct', 'delivery_interval_low_pct',
  'delivery_interval_high_pct', 'settled_n', 'verdict',
];

function field(label, control, hint = '') {
  return h('label', { class: 'field' }, h('span', null, label), control, hint ? h('small', { class: 'field-hint' }, hint) : null);
}

function number(value, suffix = '') {
  return value === null || value === undefined ? 'Withheld' : `${value}${suffix}`;
}

function safeDate(value) {
  return value || '—';
}

function notify(result, message) {
  if (!result?.ok) {
    toast(result?.error || 'The cycle action was refused.', 'bad');
    return false;
  }
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  return true;
}

function exportCsv(ctx) {
  const result = ctx.api.strategyCycleCsvRows();
  if (!result.ok) return toast(result.error, 'bad');
  const text = serializeCsv(CSV_COLUMNS, result.rows);
  const filename = `leados-strategy-renewal-${dayKey(ctx.now)}.csv`;
  if (!downloadText({ filename, text, mime: 'text/csv' })) {
    openModal({ title: 'Copy strategy renewal CSV', body: h('textarea', {
      rows: 14, readonly: true, value: text, 'aria-label': 'Strategy renewal CSV',
    }) });
  }
}

function exportBrief(ctx) {
  const result = ctx.api.strategyCycleBriefText();
  if (!result.ok) return toast(result.error, 'bad');
  const filename = `leados-strategy-renewal-${dayKey(ctx.now)}.md`;
  if (!downloadText({ filename, text: result.text, mime: 'text/markdown' })) {
    openModal({ title: 'Copy strategy renewal brief', body: h('textarea', {
      rows: 14, readonly: true, value: result.text, 'aria-label': 'Strategy renewal brief',
    }) });
  }
}

function freezePanel(ctx, report) {
  const defaultReview = addDays(dayKey(ctx.now), Math.max(1, Math.min(730, report.seat.horizonDays || 30)));
  const reviewDate = h('input', {
    class: 'input', type: 'date', min: addDays(dayKey(ctx.now), 1),
    max: addDays(dayKey(ctx.now), 730), value: defaultReview, required: true,
    'aria-label': 'Cycle review date',
  });
  return card({
    title: 'Freeze a learning line',
    subtitle: `Dated review for this ${report.seat.label.toLowerCase()} span. The snapshot records only counts, ranges and typed IDs—not titles, notes or person names.`,
    body: h('div', { class: 'strategy-cycle-freeze' },
      field('Review on', reviewDate, 'One freeze per seat per day; later scans grade only outcomes recorded by this date.'),
      h('div', { class: 'form-actions' },
        h('button', {
          type: 'button', class: 'btn btn-primary', disabled: report.seat.readOnly || report.live.overflow,
          onClick: () => {
            const result = ctx.api.strategyCycleFreeze({ reviewOn: reviewDate.value });
            if (notify(result, result.existing ? 'A cycle for this seat is already frozen today.' : 'Cycle frozen; typed cascade and any human review were propagated.')) ctx.refresh();
          },
        }, 'Freeze renewal cycle'),
        h('button', {
          type: 'button', class: 'btn btn-ghost', disabled: report.seat.readOnly,
          onClick: () => {
            const result = ctx.api.strategyCycleScan();
            if (notify(result, 'Review dates and stop-rule carryover scanned.')) ctx.refresh();
          },
        }, 'Scan due reviews'),
        h('a', { class: 'btn btn-ghost', href: '#/seat' }, 'Change altitude'),
      ),
      report.live.overflow ? banner({
        tone: 'bad', title: 'Cycle scope exceeds the bounded cohort',
        body: 'There are more active Catchball commitments in this span than the bounded cycle cohort can freeze. Choose a narrower operating seat; no partial snapshot will be written.',
      }) : null,
    ),
  });
}

function liveSummary(report) {
  const m = report.live.metrics;
  const f = report.live.forecast;
  const withheld = m.suppressed;
  const value = (v, suffix = '') => withheld ? 'Withheld' : number(v, suffix);
  const stats = [];
  if (report.seat.rank === 1) {
    stats.push(
      stat({ label: 'Your active commitments', value: value(m.active), hint: 'Agreed or still in negotiation' }),
      stat({ label: 'Past the promised date', value: value(m.overdue), hint: 'Renegotiate before taking on more' }),
      stat({ label: 'Effort still attached', value: value(m.effortDays, 'd'), hint: 'Recorded person-days; not capacity approval' }),
    );
  } else if (report.seat.rank === 2) {
    stats.push(
      stat({ label: 'Span commitments', value: value(m.active), hint: 'Count across the operating span' }),
      stat({ label: 'Carryover / overdue', value: withheld ? 'Withheld' : `${m.carryover} / ${m.overdue}`, hint: 'Resolve before accepting another cascade' }),
      stat({ label: 'Effort to reconcile', value: value(m.reviewEffortDays, 'd'), hint: 'Existing work; no silent reassignment' }),
    );
  } else if (report.seat.rank === 3) {
    stats.push(
      stat({ label: 'Active bet-linked work', value: value(m.active), hint: 'Catchball commitments in scope' }),
      stat({ label: 'Effort exposed to stop rules', value: value(m.releasedEffortDays, 'd'), hint: 'Counterfactual only; no budget moves' }),
      stat({ label: 'Projected after explicit stop', value: withheld ? 'Withheld' : `${report.live.byBet.reduce((sum, row) => sum + row.projectedEffortDays, 0)}d`, hint: 'Effort-weighted scenario, not a recommendation' }),
    );
  } else if (report.seat.rank === 4) {
    stats.push(
      stat({ label: 'Portfolio commitments', value: value(m.active), hint: 'Small cells and their complements suppressed' }),
      stat({ label: 'Retired-bet exposure', value: value(m.stoppedBet), hint: 'Requires owner-led Catchball reconciliation' }),
      stat({ label: 'Historical delivery reference', value: f.refusal === 'none' ? `${f.deliveryRatePct}%` : 'Withheld', hint: 'Not a forecast or causal estimate' }),
    );
  } else {
    stats.push(
      stat({ label: 'Enterprise commitments', value: value(m.active), hint: 'Portfolio-level count; no item detail' }),
      stat({ label: 'Delivery reference', value: f.refusal === 'none' ? `${f.deliveryRatePct}%` : 'Withheld', hint: f.refusal === 'none' ? `Wilson 95%: ${f.lowerPct}–${f.upperPct}%` : f.refusal }),
      stat({ label: 'Frozen learning lines', value: number(report.live.historyCount), hint: 'Only explicitly dated cycles are history' }),
    );
  }
  return h('div', { class: 'grid-3 strategy-cycle-stats' }, ...stats);
}

function spanPanel(report) {
  if (!report.live.spans.length) return null;
  return card({
    title: report.seat.rank >= 4 ? 'Privacy-safe span roll-up' : 'Direct leadership hand-off',
    subtitle: report.playbook.handoff,
    body: h('div', { class: 'stack-sm' },
      table({
        caption: 'Counts are bounded to the active seat; small cells suppress their complementary rows.',
        rows: report.live.spans,
        columns: [
          { label: 'Receiving span', render: (row) => row.label },
          { label: 'Active pacts', render: (row) => row.suppressed ? badge('Withheld', 'caution') : row.activeN },
          { label: 'Overdue', render: (row) => row.suppressed ? 'Withheld' : row.overdueN },
          { label: 'Effort (days)', render: (row) => row.suppressed ? 'Withheld' : row.effortDays },
          { label: 'Next step', render: () => h('a', { class: 'btn btn-tiny btn-ghost', href: '#/seat' }, 'Choose seat') },
        ],
      }),
      report.seat.rank >= 4 ? h('p', { class: 'tiny muted' }, 'Span names, IDs and local pact rows are intentionally absent. Choose a valid operating seat in the Altitude Lens to inspect its own detail.') : null,
    ),
  });
}

function betPanel(report) {
  if (report.seat.rank !== 3 || !report.live.byBet.length) return null;
  return card({
    title: 'Bet-to-delivery allocation',
    subtitle: 'Compare declared bet weights with Catchball effort. The last column is a transparent counterfactual if exposed work is explicitly stopped and later reallocated by current active weights.',
    body: h('div', { class: 'stack-sm' },
      table({
        caption: 'No budget, owner, pact, or date is changed by this scenario.',
        rows: report.live.byBet,
        columns: [
          { label: 'Strategic bet', render: (row) => row.betTitle },
          { label: 'Active pacts', render: (row) => row.activeN },
          { label: 'Effort now', render: (row) => `${row.effortDays}d` },
          { label: 'Declared weight', render: (row) => row.declaredWeightPct === null ? 'Unmeasured' : `${row.declaredWeightPct}%` },
          { label: 'Observed effort share', render: (row) => row.observedEffortSharePct === null ? 'Unmeasured' : `${row.observedEffortSharePct}%` },
          { label: 'Scenario effort', render: (row) => `${row.projectedEffortDays}d` },
        ],
      }),
      banner({ tone: 'info', title: 'A scenario is not a reallocation', body: STRATEGY_CYCLE_DISCLOSURE.scenario }),
    ),
  });
}

function pactPanel(report) {
  if (report.seat.rank > 2) {
    return card({
      title: 'Local commitment detail withheld',
      body: banner({ tone: 'info', title: 'Aggregate altitude active', body: report.playbook.see }),
    });
  }
  return card({
    title: report.seat.rank === 1 ? 'Your next commitment decisions' : 'Commitments to renegotiate or protect',
    subtitle: report.playbook.decision,
    body: report.live.details.length
      ? table({
        caption: 'Titles are read only from this seat’s scoped Catchball work; no private negotiation notes are copied into a cycle.',
        rows: report.live.details,
        columns: [
          { label: 'Commitment', render: (row) => h('a', { href: `#/catchball?panel=workbench&pact=${encodeURIComponent(row.pactId)}` }, row.title) },
          { label: 'Status', render: (row) => badge(row.status, row.status === 'agreed' ? 'good' : 'neutral') },
          { label: 'Due', render: (row) => safeDate(row.dueOn) },
          { label: 'Effort', render: (row) => `${row.effortDays}d` },
          { label: 'Signal', render: (row) => row.stoppedBet ? badge('Bet retired', 'warn') : row.overdue ? badge('Overdue', 'bad') : row.carryover ? badge('Carryover', 'caution') : 'In window' },
        ],
      })
      : emptyState({ title: 'No active commitments in this span', body: 'A renewal cycle records the present work honestly; it does not invent historical pacts.' }),
  });
}

function historyPanel(report, focusedId) {
  const focused = focusedId ? report.history.find((row) => row.id === focusedId) : null;
  return card({
    title: 'Dated cycle ledger',
    subtitle: 'Frozen readings are immutable; a later scan grades only outcomes inside the review window and only above the evidence floor.',
    body: h('div', { class: 'stack-sm' },
      focused ? banner({ tone: 'info', title: `Linked cycle · ${focused.frozenOn}`, body: `Status: ${focused.status} · scheduled review ${focused.reviewOn}. This cycle is visible only through the current seat’s scoped reporting path.` }) : null,
      report.history.length
        ? table({
          caption: 'A stored cycle contains counts, uncertainty and bounded typed IDs only.',
          rows: report.history.map((row) => ({
            ...row,
            className: row.id === focusedId ? 'lineage-selected' : '',
            attrs: { 'data-strategy-cycle-id': row.id },
          })),
          columns: [
            { label: 'Frozen', render: (row) => row.frozenOn },
            { label: 'Review', render: (row) => row.reviewOn },
            { label: 'Altitude', render: (row) => row.altitudeKey },
            { label: 'Status', render: (row) => badge(row.status, row.status === 'graded' ? 'good' : row.status === 'lapsed' ? 'caution' : 'neutral') },
            { label: 'Active at freeze', render: (row) => row.metrics.suppressed ? 'Withheld' : row.metrics.active },
            { label: 'Carryover', render: (row) => row.metrics.suppressed ? 'Withheld' : row.metrics.carryover },
            { label: 'Delivery reference', render: (row) => row.forecast.refusal === 'none' ? `${row.forecast.deliveryRatePct}% (${row.forecast.lowerPct}–${row.forecast.upperPct})` : badge(row.forecast.refusal, 'neutral') },
            { label: 'Out-of-sample grade', render: (row) => row.grade
              ? `${row.grade.deliveryRatePct}% · n=${row.grade.settledN}`
              : row.status === 'graded' ? badge('Withheld', 'caution') : 'Not graded' },
          ],
        })
        : emptyState({ title: 'No cycle frozen yet', body: 'Freeze an identity-reduced reading to begin a dated, out-of-sample strategy renewal loop.' }),
    ),
  });
}

export function renderStrategyCycle(ctx) {
  const focusedId = ctx.query?.get?.('cycle') || null;
  const report = ctx.api.strategyCycleRead(focusedId);
  if (!report?.ok) {
    return h('div', { class: 'view-stack' }, pageHeader({ title: 'Strategy renewal' }), banner({ tone: 'bad', title: 'The scoped reading could not be built', body: report?.error || 'Refresh the operating seat and try again.' }));
  }
  const forecast = report.live.forecast;
  const reference = forecast.refusal === 'none'
    ? `Historical delivery ${forecast.deliveryRatePct}% · Wilson 95% ${forecast.lowerPct}–${forecast.upperPct}% · n=${forecast.settledN} · ${forecast.basis === 'all-altitudes' ? 'pooled all-altitude reference' : `${report.seat.altitudeKey} reference`}.`
    : forecast.refusal === 'small-cell-suppressed'
      ? 'Historical delivery reference withheld at the configured small-cell boundary.'
      : `No delivery rate shown: ${forecast.refusal} (n=${forecast.settledN}, floor ${report.evidenceFloor}).`;
  const page = h('div', { class: 'view-stack strategy-cycle-view', 'data-altitude': report.seat.altitudeKey },
    pageHeader({
      eyebrow: `LEADOS · STRATEGY RENEWAL / ${report.seat.label.toUpperCase()}`,
      title: report.playbook.title,
      subtitle: `${report.playbook.horizon} · ${report.playbook.focus}`,
      actions: [
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => exportBrief(ctx) }, 'Download brief'),
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => exportCsv(ctx) }, 'Download scoped CSV'),
      ],
    }),
    banner({ tone: 'info', title: `This altitude’s decision: ${report.playbook.decision}`, body: `${report.playbook.action} ${report.playbook.see}` }),
    liveSummary(report),
    card({
      title: 'Out-of-sample learning boundary',
      subtitle: reference,
      body: h('div', { class: 'strategy-cycle-boundary' },
        h('p', null, STRATEGY_CYCLE_DISCLOSURE.forecast),
        h('p', null, STRATEGY_CYCLE_DISCLOSURE.rollup),
        h('p', null, STRATEGY_CYCLE_DISCLOSURE.local),
      ),
    }),
    freezePanel(ctx, report),
    betPanel(report),
    spanPanel(report),
    pactPanel(report),
    historyPanel(report, focusedId),
  );
  return page;
}
