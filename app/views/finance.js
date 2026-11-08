/**
 * app/views/finance.js — Budget & Financial Commitments (`#/finance` and
 * `#/finance/:id`).
 *
 * Commitment (encumbrance) accounting rendered from the pure engine in
 * core/domain/finance.js: recorded actuals, open encumbrances and planned
 * pipeline are always shown as separate figures, the forecast at completion
 * is compared with the recorded ceiling, and a missing actual is a visible
 * gap — never a zero. All writes go through ctx.api.
 */

import { h, confirmDialog, toast, openModal, closeAllModals } from '../ui/dom.js';
import { pageHeader, card, stat, badge, emptyState, table, progressBar, banner, tabs } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { formatDate } from '../core/time.js';
import {
  BUDGET_CATEGORY_LABELS,
  BUDGET_LINE_STATUS_LABELS,
  BUDGET_SOURCE_LABELS,
  BUDGET_STATUS_LABELS,
  budgetsRollup,
  calibratedForecast,
  commitmentCalibration,
  formatMoney,
  sourceCompletion,
  summarizeBudget,
} from '../core/domain/finance.js';
import {
  BUDGET_EXPOSURE_BANDS,
  BUDGET_EXPOSURE_FLOORS,
  BUDGET_EXPOSURE_METHOD,
  buildBudgetExposure,
  budgetExposureText,
} from '../core/domain/budgetExposure.js';
import { resolveLinkedEntity } from '../core/domain/cases.js';
import {
  openBudgetActualDialog,
  openBudgetDialog,
  openBudgetLineDialog,
} from '../ui/finance-modals.js';

const STATUS_TONE = { active: 'good', closed: 'neutral', archived: 'neutral' };
const LINE_TONE = { planned: 'neutral', committed: 'info', spent: 'good', released: 'neutral' };
const FILTERS = ['active', 'attention', 'closed', 'all'];
const FILTER_LABELS = { active: 'Active', attention: 'Needs attention', closed: 'Closed', all: 'All' };

function button(label, onClick, primary = false) {
  return h('button', { type: 'button', class: `btn btn-small ${primary ? 'btn-primary' : 'btn-ghost'}`, onClick }, label);
}

function pctText(ratio) {
  return ratio === null || ratio === undefined ? '—' : `${Math.round(ratio * 100)}%`;
}

function forecastBadges(ev) {
  if (ev.breach) return badge('Forecast breach', 'bad');
  if (ev.watch) return badge(`Watch zone · ${pctText(ev.forecastUtilisation)}`, 'caution');
  if (ev.pipelineBreach) return badge('Pipeline would breach', 'caution');
  if (ev.hasLimit) return badge(`${pctText(ev.forecastUtilisation)} forecast`, 'good');
  return badge('Tracking only — no ceiling', 'neutral');
}

function forecastBar(budget, ev) {
  if (!ev.hasLimit) return null;
  const pct = Math.min(100, Math.round((ev.forecastUtilisation || 0) * 100));
  return h(
    'div',
    { class: 'stack-xs' },
    progressBar(pct, {
      tone: ev.breach ? 'bad' : ev.watch ? 'warn' : 'good',
      label: `Forecast use of the ${budget.name} envelope`,
    }),
    h(
      'p',
      { class: 'muted tiny' },
      `Spent ${formatMoney(budget.currency, ev.spentKnown)} · committed ${formatMoney(budget.currency, ev.committedOpen)} · planned pipeline ${formatMoney(budget.currency, ev.plannedPipeline)}`
      + (ev.forecastUnderstated ? ' · forecast understated (unpriced lines or missing actuals)' : ''),
    ),
  );
}

function frameworkCard() {
  return card({
    title: 'How budgetary control works here',
    body: h(
      'div',
      { class: 'prose small' },
      h('p', null, h('strong', null, 'Encumbrance accounting: '), 'a commitment reserves budget authority when the obligation is entered into — before any invoice. Planned, committed, spent and released are different states, so the forecast can be acted on while release is still possible.'),
      h('p', null, h('strong', null, 'Forecast at completion: '), 'recorded actuals + open commitments, compared with the ceiling you recorded. Planned pipeline is shown separately and never silently counted as committed.'),
      h('p', { class: 'muted' }, 'An envelope is a ceiling, not a target: returning unspent authority is not scored as failure (Liebman & Mahoney, 2017, on wasteful use-it-or-lose-it surges). One currency per envelope; nothing is converted or inferred.'),
    ),
  });
}

function calibrationCard(ctx) {
  const cal = commitmentCalibration(ctx.state);
  if (!cal.n && !cal.missingItems.length) return null;
  return card({
    title: 'Commitment accuracy (reference class)',
    subtitle: 'Recorded actuals scored against the amount encumbered at commitment time — the fifth calibration ledger.',
    body: cal.sufficient
      ? h('div', { class: 'stack-sm' },
          h('p', { class: 'small' }, `Across ${cal.n} scored commitments, spend lands at a median ${cal.medianRatio}× the committed amount (P80 ${cal.p80Ratio}×).${cal.materialOverrun ? ' That is a systematic overrun pattern: review estimating and contingency before trusting the next envelope at face value (FIN-04).' : ''}`),
          h('p', { class: 'muted tiny' }, 'Ratios are dimensionless and pool across currencies without FX conversion. Detail and CSV: Decisions → forecast calibration.'))
      : h('p', { class: 'small muted' }, `${cal.n} of ${cal.minSamples} scored commitments needed before a median is shown — counts only, so a couple of anecdotes are never dressed up as a statistic.${cal.missingItems.length ? ` ${cal.missingItems.length} spent line(s) cannot be scored yet (missing actual or committed amount).` : ''}`),
  });
}

const FINANCE_PANELS = [
  { key: 'envelopes', label: 'Envelopes' },
  { key: 'span', label: 'Span exposure' },
];

function financePanelTabs(ctx, panel, { envelopes = undefined, queue = undefined } = {}) {
  return tabs({
    ariaLabel: 'Budget & finance views',
    active: panel,
    items: FINANCE_PANELS.map((item) => ({
      key: item.key,
      label: item.label,
      count: item.key === 'envelopes' ? envelopes : queue,
    })),
    onSelect: (key) => ctx.navigate(key === 'envelopes' ? '#/finance' : '#/finance?panel=span'),
  });
}

/** Downloads are allowed to fail in a browser; then the ledger stays copyable. */
function downloadOrCopy({ filename, text, title }) {
  if (downloadText({ filename, text, mime: 'text/plain' })) {
    toast('Span exposure ledger downloaded.', 'good');
    return;
  }
  const copy = h('textarea', { class: 'input', rows: 16, readonly: true }, text);
  openModal({
    title,
    body: h('div', { class: 'stack' }, h('p', null, 'This browser refused the file download. The ledger is below; select and copy it.'), copy),
    footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Close')],
  });
  copy.focus();
  copy.select();
}

export function renderFinance(ctx) {
  const panel = ctx.query?.get?.('panel') === 'span' ? 'span' : 'envelopes';
  const seat = ctx.seatContext?.seat || null;
  const built = ctx.seatContext?.built || null;
  // One evaluator, two readings: the exposure re-evaluates the SAME envelopes
  // through `evaluateBudget` with the SAME watch convention and the same day as
  // the envelope list, so the panel and the roll-up cannot disagree.
  const exposure = buildBudgetExposure(ctx.state, { now: ctx.now, seat, built });
  if (panel === 'span') return renderSpanExposure(ctx, exposure, seat);
  const rollup = budgetsRollup(ctx.state, ctx.now);
  const requested = ctx.query.get('filter');
  const filter = FILTERS.includes(requested) ? requested : 'active';
  const matches = (s) => {
    if (filter === 'all') return true;
    if (filter === 'active') return s.record.status === 'active';
    if (filter === 'attention') return s.evaluation.needsAttention;
    if (filter === 'closed') return s.record.status !== 'active';
    return true;
  };
  const rows = rollup.all.filter(matches).sort((a, b) =>
    Number(b.evaluation.breach) - Number(a.evaluation.breach)
    || Number(b.evaluation.needsAttention) - Number(a.evaluation.needsAttention)
    || b.record.updatedAt.localeCompare(a.record.updatedAt));
  const counts = {
    active: rollup.active.length,
    attention: rollup.attention.length,
    closed: rollup.all.length - rollup.active.length,
    all: rollup.all.length,
  };

  return h(
    'div',
    { class: 'page' },
    pageHeader({
      eyebrow: 'Finance & budgetary control',
      title: 'Budget & finance',
      subtitle: 'One ledger for the money question — what envelope you have, what is already committed against it, what has actually landed, and whether the forecast breaches. Breaches open a DACI trade-off automatically; completed funded work prompts for evidenced actuals.',
      actions: [button('Create budget envelope', () => openBudgetDialog(ctx), true)],
    }),
    financePanelTabs(ctx, panel, { envelopes: rollup.all.length, queue: exposure.queue.length + exposure.queueDeferred }),
    ctx.persistError
      ? card({ body: h('p', { class: 'text-warn small' }, `Changes are not being saved: ${ctx.persistError}`) })
      : null,
    h('div', { class: 'stat-row' },
      stat({ label: 'Active envelopes', value: rollup.active.length, hint: 'single currency each' }),
      stat({ label: 'Forecast breaches', value: rollup.breaches.length, tone: rollup.breaches.length ? 'bad' : '', hint: 'actuals + commitments over ceiling' }),
      stat({ label: 'In watch zone', value: rollup.watching.length, tone: rollup.watching.length ? 'warn' : '', hint: `at or above your ${ctx.state.settings?.budgetWatchPct ?? 80}% convention` }),
      stat({ label: 'Actuals due', value: rollup.actualsDue.length, tone: rollup.actualsDue.length ? 'warn' : '', hint: 'funded work finished — record evidenced spend' }),
    ),
    h('div', { class: 'tabs', role: 'group', 'aria-label': 'Budget filters' },
      ...FILTERS.map((key) => h(
        'button',
        {
          type: 'button',
          class: `tab ${key === filter ? 'is-active' : ''}`,
          'aria-pressed': String(key === filter),
          onClick: () => ctx.navigate(`#/finance?filter=${key}`),
        },
        FILTER_LABELS[key],
        h('span', { class: 'tab-count' }, String(counts[key])),
      )),
    ),
    rows.length
      ? h('div', { class: 'stack-md' }, ...rows.map((summary) => {
          const budget = summary.record;
          const ev = summary.evaluation;
          return card({
            title: budget.name,
            subtitle: `${budget.currency}${budget.periodLabel ? ` · ${budget.periodLabel}` : ''}${budget.endsOn ? ` · ends ${formatDate(budget.endsOn)}` : ''} · ${ev.lineCount} line(s)`,
            actions: [forecastBadges(ev), badge(BUDGET_STATUS_LABELS[budget.status], STATUS_TONE[budget.status])],
            body: h('div', { class: 'stack-sm' },
              forecastBar(budget, ev),
              h('p', { class: 'small' },
                ev.hasLimit
                  ? `Forecast ${formatMoney(budget.currency, ev.forecastAtCompletion)} of ${formatMoney(budget.currency, ev.limit)} ceiling · remaining ${formatMoney(budget.currency, ev.remainingVsLimit)}`
                  : `Forecast ${formatMoney(budget.currency, ev.forecastAtCompletion)} · no ceiling recorded (tracking only)`),
              ev.actualsDueLines.length || ev.missingActualLines.length
                ? h('p', { class: 'text-warn small' }, `${ev.actualsDueLines.length + ev.missingActualLines.length} line(s) need recorded actuals.`)
                : null,
              h('div', { class: 'row-gap' },
                button('Open budget', () => ctx.navigate(`#/finance/${budget.id}`), true),
                button('Add commitment', () => openBudgetLineDialog(ctx, { budget })),
                button('Edit envelope', () => openBudgetDialog(ctx, { budget })),
              ),
            ),
          });
        }))
      : emptyState({
          title: 'No budgets in this view',
          body: 'Create an envelope for the period, record commitments as obligations are entered into, and settle them with evidenced actuals. Nothing is converted, copied or inferred.',
          action: button('Create budget envelope', () => openBudgetDialog(ctx), true),
        }),
    calibrationCard(ctx),
    frameworkCard(),
  );
}

const EXPOSURE_BAND_TONE = {
  [BUDGET_EXPOSURE_BANDS.over]: 'bad',
  [BUDGET_EXPOSURE_BANDS.pipeline]: 'caution',
  [BUDGET_EXPOSURE_BANDS.watch]: 'warn',
  [BUDGET_EXPOSURE_BANDS.within]: 'good',
  [BUDGET_EXPOSURE_BANDS.untracked]: 'neutral',
};

const EXPOSURE_BAND_LABEL = {
  [BUDGET_EXPOSURE_BANDS.over]: 'Over ceiling',
  [BUDGET_EXPOSURE_BANDS.pipeline]: 'Pipeline breach',
  [BUDGET_EXPOSURE_BANDS.watch]: 'Watch zone',
  [BUDGET_EXPOSURE_BANDS.within]: 'Within ceiling',
  [BUDGET_EXPOSURE_BANDS.untracked]: 'Tracking only',
};

function positionCell(row) {
  if (row.headroom === null) {
    return h('span', { class: 'muted small' }, `Blank — ${row.headroomReason || 'no ceiling'}`);
  }
  if (row.headroom < 0) return h('strong', null, `Over by ${formatMoney(row.currency, Math.abs(row.headroom))}`);
  return h('span', null, `Headroom ${formatMoney(row.currency, row.headroom)}`);
}

/**
 * `#/finance?panel=span` — the roll-up. Rendered from `buildBudgetExposure`, so
 * the currency position, the branch attribution and the review queue are one
 * reading of one evaluation, not three screens that can drift apart.
 */
function renderSpanExposure(ctx, exposure, seat) {
  const enforced = Boolean(seat && !seat.fullAccess);
  const canRead = !exposure.refused;
  const ledger = canRead ? budgetExposureText(exposure) : '';
  const header = pageHeader({
    eyebrow: 'Finance & budgetary control',
    title: 'Span budget exposure',
    subtitle: enforced
      ? `${seat.label} (rank ${seat.rank}): the money position of the span you answer for, per currency, attributed to the branch that holds the authority — and the queue of envelopes that need a decision.`
      : 'No operating seat is declared, so this reading covers the WHOLE WORKSPACE, not a span. Declare a seat on the Altitude Lens to read it as a director, VP or chief.',
    actions: [h('button', {
      class: 'btn btn-ghost',
      type: 'button',
      disabled: !canRead,
      onClick: () => downloadOrCopy({ filename: `leados-span-budget-exposure-${exposure.asOf || 'today'}.txt`, text: ledger, title: 'Copy span exposure ledger' }),
    }, 'Download ledger'), h('a', { class: 'btn btn-ghost', href: '#/finance' }, 'Back to envelopes')],
  });

  if (exposure.refused) {
    return h('div', { class: 'page' },
      header,
      financePanelTabs(ctx, 'span', { envelopes: undefined, queue: undefined }),
      banner({ tone: 'bad', title: 'No money reading is available at this seat', body: exposure.refusals.join(' ') }),
      card({
        title: 'Why the blank is the correct answer',
        body: h('div', { class: 'prose small' },
          h('p', null, `Portfolio-level capital is disclosed from rank ${BUDGET_EXPOSURE_FLOORS.portfolioRank} upward. A blank reading is not a zero position: nothing was measured, and printing a zero would be a fake number.`),
          h('p', { class: 'muted' }, 'The Altitude Lens shows what each rung is owed, and the operating seat can be changed there.')),
      }),
    );
  }

  const queueRows = exposure.queue.map((row, index) => ({
    key: row.budgetId,
    index: index + 1,
    branch: row.branchPosition ? `Branch ${row.branchPosition}` : row.branchLabel,
    branchLabel: row.branchLabel,
    envelope: row.name || '—',
    currency: row.currency,
    band: row.band,
    bandLabel: EXPOSURE_BAND_LABEL[row.band] || row.band,
    figure: row.ceiling === null ? '—' : `${formatMoney(row.currency, row.forecast)} of ${formatMoney(row.currency, row.ceiling)}`,
    why: row.reasons.map((r) => r.text).join(' '),
  }));

  const currencyColumns = [
    { key: 'currency', label: 'Currency' },
    { key: 'cover', label: 'Ceilings declared', render: (row) => `${row.ceilingsCovered} of ${row.envelopes} envelope(s)` },
    { key: 'ceiling', label: 'Declared ceilings', render: (row) => formatMoney(row.currency, row.ceiling) },
    { key: 'actuals', label: 'Recorded actuals', render: (row) => formatMoney(row.currency, row.actuals) },
    { key: 'committed', label: 'Open commitments', render: (row) => formatMoney(row.currency, row.committed) },
    { key: 'planned', label: 'Planned pipeline', render: (row) => formatMoney(row.currency, row.planned) },
    { key: 'forecast', label: 'Forecast at completion', render: (row) => formatMoney(row.currency, row.forecast) },
    { key: 'position', label: 'Position', render: positionCell },
    { key: 'flags', label: 'Flags', render: (row) => h('div', { class: 'row-actions' }, row.breaches ? badge(`${row.breaches} breach`, 'bad') : null, row.evidenceDebt ? badge(`${row.evidenceDebt} evidence debt`, 'warn') : null, row.untracked ? badge(`${row.untracked} untracked`, 'neutral') : null) },
  ];

  const branchColumns = [
    { key: 'branch', label: 'Branch', render: (row) => h('div', null, h('strong', null, row.position ? `Branch ${row.position}` : row.label), row.position ? h('span', { class: 'muted small' }, ` · ${row.label}`) : null) },
    { key: 'envelopes', label: 'Envelopes' },
    {
      key: 'position',
      label: 'Position by currency',
      render: (row) => h('div', { class: 'stack-sm' }, ...(row.currencies.length
        ? row.currencies.map((cell) => h('div', { class: 'small' },
          `${cell.currency}: forecast ${formatMoney(cell.currency, cell.forecast)} · `,
          positionCell(cell)))
        : [h('span', { class: 'muted small' }, '—')])),
    },
    { key: 'breaches', label: 'Breaches', render: (row) => (row.breaches ? badge(`${row.breaches}`, 'bad') : h('span', { class: 'muted' }, '0')) },
  ];

  const queueColumns = [
    { key: 'index', label: '#', className: 'mono' },
    { key: 'branch', label: 'Branch' },
    { key: 'envelope', label: exposure.detail === 'aggregate' ? 'Envelope (withheld)' : 'Envelope' },
    { key: 'currency', label: 'Currency' },
    { key: 'band', label: 'Band', render: (row) => badge(row.bandLabel, EXPOSURE_BAND_TONE[row.band] || 'neutral') },
    { key: 'figure', label: exposure.detail === 'aggregate' ? 'Amount (withheld)' : 'Forecast of ceiling' },
    { key: 'why', label: 'Why it is here' },
  ];

  return h('div', { class: 'page' },
    header,
    financePanelTabs(ctx, 'span', { envelopes: undefined, queue: exposure.queue.length + exposure.queueDeferred }),
    ctx.persistError
      ? card({ body: h('p', { class: 'text-warn small' }, `Changes are not being saved: ${ctx.persistError}`) })
      : null,
    exposure.counts.breaches
      ? banner({
        tone: 'warn',
        title: `${exposure.counts.breaches} envelope(s) forecast a breach`,
        body: 'The roll-up does not net them against headroom anywhere else. Offsetting one cost centre with another’s slack is a transfer of authority nobody approved — it is a decision for this seat, not a line the arithmetic may draw.',
      })
      : null,
    !exposure.counts.active
      ? banner({ tone: 'info', title: 'Nothing has been measured in this span', body: 'A blank reading is not a zero position: there is no active envelope to evaluate. Create an envelope, or record commitments against the one the span already has.' })
      : null,
    h('div', { class: 'stat-row' },
      stat({ label: 'Active envelopes', value: exposure.counts.active, hint: `${exposure.counts.measured} with a declared ceiling` }),
      stat({ label: 'Forecast breaches', value: exposure.counts.breaches, tone: exposure.counts.breaches ? 'bad' : '', hint: 'actuals + open commitments over ceiling' }),
      stat({ label: 'Watch zone', value: exposure.counts.watches, tone: exposure.counts.watches ? 'warn' : '', hint: 'at or above the declared watch share' }),
      stat({ label: 'Evidence debt', value: exposure.counts.evidenceDebt, tone: exposure.counts.evidenceDebt ? 'warn' : '', hint: 'spend with no recorded actual' }),
      stat({ label: 'Direct branches', value: exposure.counts.branches, hint: `${exposure.counts.attributed} envelope(s) attributed` }),
    ),
    card({
      title: 'Position by currency',
      subtitle: 'One currency at a time. Nothing is converted, and nothing is pooled across envelopes of different currencies.',
      actions: [badge(`${exposure.detail === 'aggregate' ? 'Counts & bands' : 'Full detail'}`, 'neutral', 'The disclosure level this seat is handed for portfolio material.')],
      body: exposure.currencies.length
        ? table({ columns: currencyColumns, rows: exposure.currencies, caption: 'Span position by currency' })
        : emptyState({ title: 'No attributable currency', body: 'No active envelope in this span has an owner that resolves to a branch or to your own desk. Unowned envelopes are counted below and deliberately excluded from every total.' }),
    }),
    card({
      title: 'By branch — the authority holder',
      subtitle: 'A variance belongs to the cost centre that holds the authority, which is why this is a table of branches and not one grand total.',
      body: exposure.branches.length
        ? table({ columns: branchColumns, rows: exposure.branches, caption: 'Span budget position by branch' })
        : emptyState({ title: 'No branch holds an envelope', body: 'Every attributable envelope belongs to your own desk. Assign an owner in a branch and it appears here.' }),
    }),
    card({
      title: 'Review queue',
      subtitle: `Bounded at ${exposure.limits.queue} rows, worst first: a breach outranks a pipeline breach, which outranks the watch zone, which outranks an unsound ledger.`,
      body: queueRows.length
        ? h('div', { class: 'stack-sm' },
          table({ columns: queueColumns, rows: queueRows, caption: 'Bounded budget review queue' }),
          exposure.queueDeferred ? h('p', { class: 'muted small' }, `${exposure.queueDeferred} further row(s) sit beyond the queue cap; they remain in the envelopes view.`) : null)
        : h('p', { class: 'small muted' }, 'No envelope in this span needs a decision: every readable envelope is inside its ceiling and its ledger is complete.'),
    }),
    exposure.excluded.length
      ? card({
        title: `Counted and excluded (${exposure.excluded.length})`,
        subtitle: 'An excluded envelope is not a zero and not a hidden breach: it is not attributable to this span, and the reason is printed.',
        body: table({
          caption: 'Envelopes counted but excluded from the span totals',
          columns: [
            { key: 'bucket', label: 'Bucket', render: (row) => ({ unowned: 'Enterprise root', 'out-of-span': 'Another span', ambiguous: 'Ambiguous owner' })[row.bucket] || row.bucket },
            { key: 'currency', label: 'Currency' },
            { key: 'ceiling', label: 'Ceiling', render: (row) => (row.hasCeiling ? 'declared' : 'tracking only') },
            { key: 'breach', label: 'Breach', render: (row) => (row.breach ? badge('yes', 'bad') : h('span', { class: 'muted' }, 'no')) },
            { key: 'reason', label: 'Reason' },
          ],
          rows: exposure.excluded,
        }),
      })
      : null,
    card({
      title: 'Refusals and limits',
      subtitle: 'What this reading will not tell you, printed instead of implied.',
      body: h('ul', { class: 'evidence-list small' }, ...exposure.refusals.map((reason) => h('li', null, reason))),
    }),
    card({
      title: 'How this roll-up is computed',
      subtitle: 'Named methods, the same ones the envelopes view uses.',
      body: h('div', { class: 'prose small' }, ...BUDGET_EXPOSURE_METHOD.map((method) => h('p', null, h('strong', null, `${method.name}: `), method.why))),
    }),
  );
}

function lineActions(ctx, budget, line) {
  const actions = [];
  if (line.status === 'committed' || line.status === 'planned') {
    actions.push(button('Record actual', () => openBudgetActualDialog(ctx, { budget, line }), true));
    actions.push(button('Release', () => {
      confirmDialog({
        title: 'Release commitment',
        message: `Release “${line.title}”? Its encumbered amount returns to the envelope. The line stays as history; recorded spend is unaffected.`,
        confirmLabel: 'Release authority',
        onConfirm: () => {
          const res = ctx.api.releaseBudgetLine(budget.id, line.id, {});
          if (!res.ok) toast(res.error, 'bad');
          else { toast('Commitment released — authority returned.', 'good'); ctx.refresh(); }
        },
      });
    }));
  }
  if (line.status === 'spent' && line.actualAmount === null) {
    actions.push(button('Record actual', () => openBudgetActualDialog(ctx, { budget, line }), true));
  }
  actions.push(button('Edit', () => openBudgetLineDialog(ctx, { budget, line })));
  actions.push(button('Delete', () => {
    confirmDialog({
      title: 'Delete budget line',
      message: `Delete “${line.title}”? Use Release instead when an obligation was real but will not be spent — deletion is for mistakes.`,
      danger: true,
      confirmLabel: 'Delete line',
      onConfirm: () => {
        const res = ctx.api.deleteBudgetLine(budget.id, line.id);
        if (!res.ok) toast(res.error, 'bad');
        else { toast('Budget line deleted.', 'neutral'); ctx.refresh(); }
      },
    });
  }));
  return h('div', { class: 'row-gap', role: 'group', 'aria-label': `Actions for ${line.title}` }, ...actions);
}

export function renderBudgetDetail(ctx, budgetId) {
  const budget = (ctx.state.budgets || []).find((b) => b.id === budgetId);
  if (!budget) {
    return h('div', { class: 'page' },
      pageHeader({ title: 'Budget not found', subtitle: 'That envelope does not exist in this workspace.' }),
      emptyState({ title: 'Nothing to open', body: 'It may have been deleted. Your other budgets are unaffected.', action: button('Back to budgets', () => ctx.navigate('#/finance'), true) }));
  }
  const summary = summarizeBudget(budget, ctx.state, ctx.now, { watchPct: ctx.state.settings?.budgetWatchPct });
  const ev = summary.evaluation;
  const calibrated = calibratedForecast(budget, ctx.state, ctx.now);
  const owner = budget.ownerId ? ctx.state.people.find((p) => p.id === budget.ownerId) : null;

  const setStatus = (status, label) => {
    const res = ctx.api.setBudgetStatus(budget.id, status);
    if (!res.ok) toast(res.error, 'bad');
    else { toast(label, 'good'); ctx.refresh(); }
  };

  const lineRows = (budget.lines || []).map((line) => {
    const src = line.sourceType && line.sourceId ? resolveLinkedEntity(ctx.state, line.sourceType, line.sourceId) : null;
    const completion = sourceCompletion(ctx.state, line.sourceType, line.sourceId);
    const ratio = line.status === 'spent' && line.committedAmount > 0 && line.actualAmount !== null
      ? `${Math.round((line.actualAmount / line.committedAmount) * 100) / 100}×`
      : '—';
    return {
      ...line,
      src,
      completion,
      ratio,
      due: Boolean(line.actualsDueOn || (line.status === 'committed' && completion.completed) || (line.status === 'spent' && line.actualAmount === null)),
    };
  });

  return h(
    'div',
    { class: 'page' },
    pageHeader({
      eyebrow: 'Finance & budgetary control',
      title: budget.name,
      subtitle: `${budget.currency} envelope${budget.periodLabel ? ` · ${budget.periodLabel}` : ''}${budget.startsOn || budget.endsOn ? ` · ${budget.startsOn ? formatDate(budget.startsOn) : '…'} → ${budget.endsOn ? formatDate(budget.endsOn) : 'open-ended'}` : ''}${owner ? ` · owner ${owner.name}` : ''}`,
      actions: [
        button('Add commitment', () => openBudgetLineDialog(ctx, { budget }), true),
        button('Edit envelope', () => openBudgetDialog(ctx, { budget })),
        budget.status === 'active'
          ? button('Close envelope', () => setStatus('closed', 'Budget closed. Open lines remain as history.'))
          : button('Reopen envelope', () => setStatus('active', 'Budget reopened.')),
        button('Delete', () => {
          confirmDialog({
            title: 'Delete budget envelope',
            message: `Delete “${budget.name}” and all its lines? Graph links are removed; decisions and goal check-ins created from it remain as standalone history.`,
            danger: true,
            confirmLabel: 'Delete budget',
            onConfirm: () => {
              const res = ctx.api.deleteBudget(budget.id);
              if (!res.ok) toast(res.error, 'bad');
              else { toast('Budget deleted.', 'neutral'); ctx.navigate('#/finance'); }
            },
          });
        }),
      ],
    }),
    h('div', { class: 'row-gap' }, badge(BUDGET_STATUS_LABELS[budget.status], STATUS_TONE[budget.status]), forecastBadges(ev)),
    ev.breach
      ? banner({
          tone: 'bad',
          title: `Forecast breach: ${formatMoney(budget.currency, ev.forecastAtCompletion)} against a ${formatMoney(budget.currency, ev.limit)} ceiling`,
          body: 'RULE-FIN-01 has opened (or kept open) one linked DACI trade-off in Decisions. Release, defer, or request more envelope explicitly.',
          actions: [button('Open decisions', () => ctx.navigate('#/decisions'))],
        })
      : null,
    ev.actualsDueLines.length || ev.missingActualLines.length
      ? banner({
          tone: 'info',
          title: `${ev.actualsDueLines.length + ev.missingActualLines.length} line(s) are waiting for evidenced actuals`,
          body: 'Funded work completed or a line was marked spent. Record what the invoice or finance report says — never the committed figure copied across.',
        })
      : null,
    h('div', { class: 'stat-row' },
      stat({ label: 'Ceiling', value: ev.hasLimit ? formatMoney(budget.currency, ev.limit) : '—', hint: ev.hasLimit ? 'recorded envelope' : 'tracking only' }),
      stat({ label: 'Spent (recorded actuals)', value: formatMoney(budget.currency, ev.spentKnown), hint: ev.missingActualLines.length ? `${ev.missingActualLines.length} spent line(s) missing an actual` : 'evidence-based only' }),
      stat({ label: 'Committed (encumbered)', value: formatMoney(budget.currency, ev.committedOpen), hint: ev.unpricedOpenCount ? `plus ${ev.unpricedOpenCount} unpriced open line(s)` : 'obligations entered into' }),
      stat({
        label: 'Forecast at completion',
        value: formatMoney(budget.currency, ev.forecastAtCompletion),
        tone: ev.breach ? 'bad' : ev.watch ? 'warn' : '',
        hint: ev.hasLimit ? `${pctText(ev.forecastUtilisation)} of ceiling · remaining ${formatMoney(budget.currency, ev.remainingVsLimit)}` : 'actuals + open commitments',
      }),
      stat({ label: 'Planned pipeline', value: formatMoney(budget.currency, ev.plannedPipeline), hint: 'intentions, not yet encumbered' }),
    ),
    card({
      title: 'Envelope forecast',
      body: h('div', { class: 'stack-sm' },
        forecastBar(budget, ev) || h('p', { class: 'muted small' }, 'No ceiling recorded: this envelope tracks commitments and actuals without a breach test. Add a ceiling in Edit envelope to enable forecast control.'),
        ev.periodElapsedPct !== null
          ? h('p', { class: 'muted small' }, `Period ${ev.periodElapsedPct}% elapsed; recorded spend is ${pctText(ev.spentShare)} of the ceiling. Spend is lumpy — pace is a prompt to look, not a grade.`)
          : null,
        calibrated
          ? h('p', { class: 'small' }, `Reference-class view: commitments here have landed at a median ${calibrated.medianRatio}× (n=${calibrated.n}). Applying that to open encumbrances gives a calibrated forecast of ${formatMoney(budget.currency, calibrated.calibratedForecast)} — shown beside the recorded forecast, never instead of it.`)
          : null,
        budget.note ? h('p', { class: 'small' }, budget.note) : null,
      ),
    }),
    card({
      title: 'Commitment lines',
      subtitle: 'Planned → committed (encumbered) → spent (evidenced actual) or released (authority returned).',
      actions: [button('Add commitment', () => openBudgetLineDialog(ctx, { budget }), true)],
      body: table({
        caption: `Budget lines for ${budget.name}`,
        columns: [
          {
            label: 'Commitment',
            render: (r) => h('div', { class: 'stack-xs' },
              h('strong', null, r.title),
              h('span', { class: 'muted tiny' }, BUDGET_CATEGORY_LABELS[r.category] || r.category),
              r.due ? badge('Actual due', 'caution') : null,
              r.note ? h('span', { class: 'muted tiny' }, r.note) : null),
          },
          { label: 'State', render: (r) => badge(BUDGET_LINE_STATUS_LABELS[r.status].split(' (')[0], LINE_TONE[r.status]) },
          { label: `Committed (${budget.currency})`, render: (r) => (r.committedAmount === null ? 'unpriced' : formatMoney(budget.currency, r.committedAmount)) },
          {
            label: `Actual (${budget.currency})`,
            render: (r) => (r.status === 'spent'
              ? (r.actualAmount === null ? h('span', { class: 'text-warn' }, 'missing — record it') : `${formatMoney(budget.currency, r.actualAmount)} (${r.ratio})`)
              : '—'),
          },
          {
            label: 'Funds',
            render: (r) => (r.src
              ? h('a', { class: 'link', href: r.src.route, onClick: (e) => { e.preventDefault(); ctx.navigate(r.src.route); } }, `${BUDGET_SOURCE_LABELS[r.sourceType] || r.sourceType}: ${r.src.title}`)
              : '—'),
          },
          {
            label: 'Key date',
            render: (r) => (r.status === 'spent' && r.spentOn ? `Spent ${formatDate(r.spentOn)}`
              : r.status === 'released' && r.releasedOn ? `Released ${formatDate(r.releasedOn)}`
              : r.expectedOn ? `Expected ${formatDate(r.expectedOn)}`
              : r.committedOn ? `Committed ${formatDate(r.committedOn)}` : '—'),
          },
          { label: 'Actions', render: (r) => lineActions(ctx, budget, r) },
        ],
        rows: lineRows,
        emptyMessage: 'No commitment lines yet. Add the first obligation or planned spend for this envelope.',
      }),
    }),
    ev.byCategory.length
      ? card({
          title: 'Forecast by category',
          body: table({
            caption: 'Forecast at completion by category',
            columns: [
              { label: 'Category', render: (r) => r.label },
              { label: `Forecast (${budget.currency})`, render: (r) => formatMoney(budget.currency, r.amount) },
            ],
            rows: ev.byCategory,
          }),
        })
      : null,
    card({
      title: 'Cross-module links',
      subtitle: 'Typed funds/decides edges created by RULE-FIN-01/02 — the budget is part of the same record graph as cases, goals, decisions and negotiations.',
      body: summary.links.length
        ? h('div', { class: 'case-links-strip' }, ...summary.links.map((item) => h(
            'a',
            {
              class: 'case-link-pill',
              href: item.peer.route,
              onClick: (e) => { e.preventDefault(); ctx.navigate(item.peer.route); },
            },
            h('span', { class: 'case-link-rel' }, item.relationLabel),
            h('strong', null, item.peer.title),
            h('span', { class: 'muted tiny' }, `(${item.peer.status})`),
          )))
        : h('p', { class: 'muted small' }, 'No links yet. Link a line to the case, goal, negotiation or work it funds and the graph edge is created automatically.'),
    }),
    frameworkCard(),
  );
}
