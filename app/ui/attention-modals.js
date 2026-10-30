/**
 * app/ui/attention-modals.js — the dialogs of the Attention Market (Schema v57).
 *
 * Three dialogs, each changing exactly one kind of thing:
 *
 *   - `openAttentionHoursDialog` answers the only question the workspace cannot
 *     answer for itself: how many of YOUR hours an obligation takes. Everything
 *     else in the module is derived from records; this is the one input that has
 *     to come from the person whose week it is. It shows the derived hour and
 *     its basis beside every row so an override is an informed disagreement.
 *   - `openAttentionCommitDialog` previews the solved plan BEFORE it is frozen,
 *     item by item, with the forgone set and its price already computed. It
 *     refuses to commit an empty plan, because "do nothing this week" deserves a
 *     decision record rather than an empty optimisation.
 *   - `openAttentionReviewDialog` shows the frozen prediction next to what the
 *     records now say, and lets the leader add a written note before the review
 *     is stored. It never edits the prediction.
 *
 * All three are keyboard-operable and every control has a bound label.
 */

import { h, toast, openModal } from './dom.js';
import {
  ATT_SOURCE_BY_ID,
  buildAttentionMarket,
  conventionsFromSettings,
} from '../core/domain/attentionMarket.js';

function money(value, currency) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const code = String(currency || '').trim().toUpperCase();
  return `${code ? `${code} ` : ''}${Math.round(Number(value)).toLocaleString('en-US')}`;
}

function hoursLabel(value) {
  if (value === null || value === undefined) return '—';
  return `${Number(value).toFixed(Number(value) % 1 === 0 ? 0 : 2)} h`;
}

function activePeople(ctx) {
  return (ctx.state.people || []).filter((person) => person && person.status !== 'archived');
}

/* ------------------------------------------------------------ hour dialog */

/**
 * Declare hours. The form is pre-filled from the record's own estimate where one
 * exists and from the leader's declared history where it does not; anything left
 * blank stays unpriced and is listed at the bottom, because an unset field is a
 * real state and defaulting it to a number would hide the decision.
 */
export function openAttentionHoursDialog(ctx) {
  const conventions = conventionsFromSettings(ctx.state.settings);
  const report = buildAttentionMarket(ctx.state, ctx.now, { budgetHours: conventions.budgetHours });
  const draft = {};
  for (const row of report.candidates) draft[row.id] = row.hours === null ? '' : String(row.hours);
  let activeCurrency = report.markets[0]?.currency || null;
  const status = h('p', { class: 'muted small', 'aria-live': 'polite' });

  const rows = report.candidates.map((row) => {
    const inputId = `att-hours-${row.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    return h('tr', null,
      h('td', null,
        h('label', { for: inputId, class: 'stack-xs' },
          h('strong', null, row.title),
          h('span', { class: 'muted small' }, ATT_SOURCE_BY_ID[row.sourceType]?.label || row.sourceType))),
      h('td', { className: 'num' }, row.exposure === null ? h('span', { class: 'muted' }, 'unpriced') : money(row.exposure, row.currency)),
      h('td', { className: 'num' },
        h('input', {
          id: inputId,
          class: 'input input-small',
          type: 'number',
          min: '0',
          max: '400',
          step: '0.25',
          value: draft[row.id],
          'aria-describedby': `${inputId}-basis`,
          onInput: (event) => { draft[row.id] = event.target.value; refresh(); },
        })),
      h('td', null, h('span', { id: `${inputId}-basis`, class: 'muted small' }, row.hoursBasis)));
  });

  function recompute() {
    return buildAttentionMarket(ctx.state, ctx.now, { declarations: draft, budgetHours: conventions.budgetHours });
  }

  function refresh() {
    const next = recompute();
    activeCurrency = next.markets[0]?.currency || null;
    const market = next.markets[0];
    status.textContent = market
      ? `${next.totals.priced} of ${next.totals.candidates} obligations are priceable · ${hoursLabel(next.totals.priceableHours)} priced · ${hoursLabel(next.totals.unpricedHours)} still unpriced · the plan buys ${money(market.value, market.currency)}`
      : `${next.totals.unpriced} obligation(s) still unpriced — enter hours on at least one priced row to build a market`;
  }

  const body = h('div', { class: 'stack' },
    h('p', null, 'Every number in this panel is derived from a record except this one. A case carries capacity-days and a funded item carries effort-days, but neither says how much of YOUR week the obligation costs — so the module applies a declared share and shows you the result. Override any row and the plan uses your number instead.'),
    h('div', { class: 'table-wrap' },
      h('table', { class: 'table', 'aria-label': 'Declare the leader hours each open obligation will take' },
        h('caption', { class: 'sr-only' }, 'Declare the leader hours each open obligation will take'),
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, 'Obligation'),
          h('th', { scope: 'col' }, 'Exposure'),
          h('th', { scope: 'col' }, 'Your hours'),
          h('th', { scope: 'col' }, 'Where the number came from'))),
        h('tbody', null, ...rows))),
    status,
    h('p', { class: 'muted small' }, `A row with no hours cannot enter the optimisation, however valuable it is. The share applied to a record's own effort estimate is ${conventions.leaderSharePct}% of ${conventions.hoursPerEffortDay} h per effort-day, both changeable in Settings.`));

  refresh();

  openModal({
    title: 'Hour estimates',
    description: 'How much of your own week each open obligation would take',
    size: 'lg',
    body,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => ctx.refresh() }, 'Close'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const next = recompute();
          if (!next.markets.length) {
            toast('Nothing is priceable yet — enter hours on a row that also carries a money value.', 'bad');
            return;
          }
          ctx.refresh();
          toast(`Hours applied to this session. Commit a plan to freeze them: ${money(next.markets[0].value, next.markets[0].currency)} is reachable.`, 'good');
        },
      }, 'Use these hours'),
    ],
  });
}

/* ----------------------------------------------------------- commit dialog */

export function openAttentionCommitDialog(ctx) {
  const conventions = conventionsFromSettings(ctx.state.settings);
  const budget = String(conventions.budgetHours);
  const label = h('input', { id: 'att-plan-label', class: 'input', type: 'text', maxlength: '200', value: '', placeholder: 'Week 45 — quarter close' });
  const budgetInput = h('input', {
    id: 'att-plan-budget',
    class: 'input',
    type: 'number',
    min: '0',
    max: '200',
    step: '0.5',
    value: budget,
  });
  const delegateChoices = {};
  const preview = h('div', { class: 'stack' });

  function recompute() {
    return buildAttentionMarket(ctx.state, ctx.now, {
      budgetHours: budgetInput.value === '' ? conventions.budgetHours : Number(budgetInput.value),
      delegates: delegateChoices,
    });
  }

  function refresh() {
    preview.textContent = '';
    const report = recompute();
    if (!report.markets.length) {
      preview.append(h('p', { class: 'muted' }, 'Nothing in the workspace can be priced. A plan over an empty market would be a forecast of nothing, so this dialog will not commit one.'));
      return;
    }
    for (const market of report.markets) {
      preview.append(h('div', { class: 'section-head' },
        h('h3', null, `${market.currency} plan`),
        h('span', { class: 'muted small' },
          `${hoursLabel(market.usedHours)} of ${hoursLabel(market.budgetHours)} allocated · expected protected ${money(market.value, market.currency)}`
          + (market.saturated ? ` · the next hour is worth ${money(market.shadowPrice, market.currency)}` : ' · the budget is not binding'))));
      const buyRows = market.chosen.map((row) => h('tr', null,
        h('td', null, row.candidate.title),
        h('td', null, row.mode === 'delegate' ? `Hand to ${row.delegateName}` : 'Do it yourself'),
        h('td', { className: 'num' }, hoursLabel(row.hours)),
        h('td', { className: 'num' }, `${Math.round(row.probability * 100)}%`),
        h('td', { className: 'num' }, money(row.value, market.currency))));
      preview.append(h('div', { class: 'table-wrap' },
        h('table', { class: 'table', 'aria-label': `${market.currency} plan preview` },
          h('caption', { class: 'sr-only' }, `${market.currency} plan preview`),
          h('thead', null, h('tr', null,
            h('th', { scope: 'col' }, 'Bought'),
            h('th', { scope: 'col' }, 'Mode'),
            h('th', { scope: 'col' }, 'Hours'),
            h('th', { scope: 'col' }, 'Success'),
            h('th', { scope: 'col' }, 'Expected value'))),
          h('tbody', null, ...(buyRows.length ? buyRows : [h('tr', null, h('td', { colspan: '5' }, 'Nothing fits inside this budget.'))])))));
      if (market.dropped.length) {
        const forgoneTotal = market.dropped.reduce((acc, row) => acc + (row.forgone || 0), 0);
        preview.append(h('p', { class: 'muted small' },
          `Knowingly left to carry: ${market.dropped.length} item(s), ${money(forgoneTotal, market.currency)} of expected value forgone. Committing writes that list into the decision register with its price — the cost of doing nothing becomes a record with a date, not a feeling.`));
      }
      if (report.markets.length > 1) {
        preview.append(h('p', { class: 'muted small' },
          `This plan commits the ${market.currency} market. The other currencies are separate markets and are listed here because they are not being optimised in this commit.`));
        break;
      }
    }
    if (report.unpriced.length) {
      preview.append(h('p', { class: 'muted small' },
        `${report.unpriced.length} obligation(s), ${hoursLabel(report.totals.unpricedHours)}, could not be priced and are excluded. They cannot lose a contest they never entered — but they will also never win one.`));
    }
  }

  budgetInput.addEventListener('input', refresh);

  const body = h('div', { class: 'stack' },
    h('div', { class: 'field-grid' },
      h('div', { class: 'field' }, h('label', { for: 'att-plan-label' }, 'Plan name'), label),
      h('div', { class: 'field' }, h('label', { for: 'att-plan-budget' }, 'Leader hours for this horizon'), budgetInput)),
    h('p', { class: 'muted small' }, 'Committing freezes the budget, the bought set and the forgone set with its price. The workspace then holds this plan to its own number on the review date, and RULE-ATT-01–03 attach typed edges, the owned hand-offs and the decision that records what you are choosing not to do.'),
    preview);

  refresh();

  openModal({
    title: 'Commit an attention plan',
    description: 'Freeze what this week buys, and what it knowingly does not',
    size: 'lg',
    body,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => ctx.refresh() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.commitAttentionPlan({
            label: label.value,
            budgetHours: budgetInput.value === '' ? undefined : Number(budgetInput.value),
            delegates: delegateChoices,
          });
          if (!result.ok) { toast(result.error, 'bad'); return; }
          const plan = result.result;
          toast(`Plan committed: ${plan.items.length} bought, ${plan.forgone.length} forgone, ${money(plan.value, plan.currency)} expected protected.`, 'good');
          ctx.navigate(`#/attention?panel=plan&plan=${encodeURIComponent(result.id)}`);
        },
      }, 'Commit and freeze'),
    ],
  });
}

/* ----------------------------------------------------------- review dialog */

export function openAttentionReviewDialog(ctx, plan) {
  if (!plan) { toast('That plan no longer exists.', 'bad'); return; }
  const note = h('textarea', {
    id: 'att-review-note',
    class: 'input',
    rows: '3',
    maxlength: '1200',
    placeholder: 'What happened that the records cannot show?',
  });
  const body = h('div', { class: 'stack' },
    h('p', null, `This plan predicted ${money(plan.result.value, plan.currency)} of expected protected value for ${hoursLabel(plan.result.usedHours)} of a ${hoursLabel(plan.result.budgetHours)} budget. The review reads what each bought record says now and measures the drop in its own declared exposure.`),
    h('p', { class: 'muted small' }, 'A realised drop is not proof that the work caused it. The review says so, and it excludes items that have not moved yet rather than scoring them as misses — a plan is not wrong merely because it is young.'),
    h('div', { class: 'field' }, h('label', { for: 'att-review-note' }, 'Leader note (optional)'), note));

  openModal({
    title: `Review “${plan.label}”`,
    description: 'Hold the plan to the number it wrote down',
    size: 'md',
    body,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => ctx.refresh() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.reviewAttentionPlan(plan.id, { note: note.value });
          if (!result.ok) { toast(result.error, 'bad'); return; }
          const review = result.review;
          toast(`Reviewed: ${money(review.measuredAvoided, review.currency)} measured against ${money(review.predictedValue, review.currency)} predicted.`, 'good');
          ctx.navigate(`#/attention?panel=plan&plan=${encodeURIComponent(plan.id)}`);
        },
      }, 'Store the review'),
    ],
  });
}
