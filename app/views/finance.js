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

import { h, confirmDialog, toast } from '../ui/dom.js';
import { pageHeader, card, stat, badge, emptyState, table, progressBar, banner } from '../ui/components.js';
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

export function renderFinance(ctx) {
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
