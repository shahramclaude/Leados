/**
 * app/views/attentionMarket.js — the Attention Market terminal (Session 82).
 *
 * The screen is organised around one number no other tool produces: what the
 * NEXT hour of the leader's week is worth. Everything else on the page exists to
 * let a sceptical reader check that number rather than trust it.
 *
 *   Plan        the solved set, the forgone set with its price, and the frozen
 *               prediction each committed plan is later held to
 *   Market      every priced obligation with its exposure basis, its success
 *               probability and its measured basis, and the mode the solver chose
 *   Unpriced    what could not enter the optimisation, and why — the items that
 *               lose to priced work every week for arithmetic reasons only
 *   Frontier    the same market re-solved at 50–150% of the budget, so the leader
 *               can see the shape of the trade rather than a single point
 *   Method      the algorithm, the conventions and the exact limits
 */

import { h, toast } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, emptyState, table, tabs, barRow } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { formatDate } from '../core/time.js';
import {
  buildAttentionMarket,
  attentionBrief,
  ATT_MODE_LABELS,
  ATT_SOURCE_BY_ID,
} from '../core/domain/attentionMarket.js';
import { openAttentionCommitDialog, openAttentionReviewDialog, openAttentionHoursDialog } from '../ui/attention-modals.js';

function money(value, currency) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const code = String(currency || '').trim().toUpperCase();
  return `${code ? `${code} ` : ''}${Math.round(Number(value)).toLocaleString('en-US')}`;
}

function pct(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${Math.round(Number(value) * 100)}%`;
}

function hours(value) {
  if (value === null || value === undefined) return '—';
  return `${Number(value).toFixed(Number(value) % 1 === 0 ? 0 : 2).replace(/0$/, '').replace(/\.$/, '')} h`;
}

/** Route a source record back to its own screen from the market table. */
function sourceLink(row) {
  const meta = ATT_SOURCE_BY_ID[row.sourceType];
  if (!row.route) return h('span', null, meta?.label || row.sourceType);
  return h('a', { class: 'link-button', href: row.route }, meta?.label || row.sourceType);
}

export function renderAttentionMarket(ctx) {
  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now);
  const requestedPanel = ctx.query?.get?.('panel') || ctx.query?.get?.('tab') || 'plan';
  const panels = ['plan', 'market', 'unpriced', 'frontier', 'method'];
  const panel = panels.includes(requestedPanel) ? requestedPanel : 'plan';
  const plans = Array.isArray(ctx.state.attentionPlans) ? ctx.state.attentionPlans : [];
  const selectedPlanId = ctx.query?.get?.('plan') || '';
  const selectedPlan = plans.find((row) => row.id === selectedPlanId) || plans[0] || null;
  // The Frontier tab is the only consumer of the sensitivity ladder, so it is
  // the only path that pays for it.
  const preview = buildAttentionMarket(ctx.state, now, { sensitivity: panel === 'frontier' });
  const primary = preview.markets[0] || null;

  const header = pageHeader({
    eyebrow: 'Decisions · Schema v57',
    title: 'Attention market',
    subtitle: 'Your week is a budget, not a list. This solves it: every obligation the workspace can price, one hour ceiling, and a plan that says what to buy, what to hand off and what to knowingly let carry — with the price of the next hour printed on it.',
    actions: [
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openAttentionCommitDialog(ctx) }, 'Commit a plan'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openAttentionHoursDialog(ctx) }, 'Hour estimates'),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => downloadText('leados-attention-market.txt', attentionBrief(ctx.state, now)),
      }, 'Download brief'),
    ],
    meta: primary
      ? badge(`${primary.chosen.length} bought · ${primary.dropped.length} forgone`, primary.dropped.length ? 'warn' : 'neutral')
      : badge('nothing priceable yet', 'neutral'),
  });

  const stats = h('div', { class: 'stat-grid' },
    stat({
      label: 'Price of your next hour',
      value: primary && primary.saturated ? money(primary.shadowPrice, primary.currency) : '0',
      hint: primary
        ? primary.saturated
          ? (primary.optimal ? 'measured: the same market re-solved with one more hour' : primary.priceBasis)
          : 'the budget is not binding — more hours would buy nothing'
        : 'no market yet',
      tone: primary && primary.saturated ? 'warn' : '',
    }),
    stat({
      label: 'Expected protected value',
      value: primary ? money(primary.value, primary.currency) : '—',
      hint: primary
        ? (primary.optimal ? 'optimal for this market' : `${primary.gapPct}% from the LP bound — a stated distance, not a claim of optimality`)
        : 'record a priced obligation to build a market',
    }),
    stat({
      label: 'Budget',
      value: primary ? `${hours(primary.usedHours)} / ${hours(primary.budgetHours)}` : `${hours(preview.conventions.budgetHours)}`,
      hint: primary ? `${hours(primary.leftHours)} unspent` : 'the leader-attention ceiling',
    }),
    stat({
      label: 'Priceable share of the queue',
      value: preview.totals.coveragePct === null ? '—' : `${preview.totals.coveragePct}%`,
      hint: `${preview.totals.priced} priced · ${preview.totals.unpriced} unpriced (${hours(preview.totals.unpricedHours)})`,
      tone: preview.totals.unpriced > 0 ? 'warn' : '',
    }));

  const tabsRow = tabs({
    items: [
      { key: 'plan', label: 'Plan' },
      { key: 'market', label: 'Market', count: preview.totals.priced },
      { key: 'unpriced', label: 'Unpriced', count: preview.totals.unpriced },
      { key: 'frontier', label: 'Frontier' },
      { key: 'method', label: 'Method' },
    ],
    active: panel,
    onSelect: (key) => ctx.navigate(`#/attention?panel=${key}${selectedPlan ? `&plan=${encodeURIComponent(selectedPlan.id)}` : ''}`),
    ariaLabel: 'Attention market sections',
  });

  let body;
  if (panel === 'market') body = renderMarketPanel(preview, ctx);
  else if (panel === 'unpriced') body = renderUnpricedPanel(preview, ctx);
  else if (panel === 'frontier') body = renderFrontierPanel(preview, ctx);
  else if (panel === 'method') body = renderMethodPanel(preview);
  else body = renderPlanPanel(preview, selectedPlan, plans, ctx, now);

  return h('div', { class: 'page' }, header, null, stats, tabsRow, body);
}

/* ------------------------------------------------------------- plan panel */

function renderPlanPanel(preview, selectedPlan, plans, ctx, now) {
  const nodes = [];
  if (preview.notes.length) {
    for (const note of preview.notes) {
      nodes.push(banner({ tone: note.tone, title: note.title, body: note.body }));
    }
  }
  if (!preview.markets.length) {
    nodes.push(emptyState({
      title: 'No obligation in the workspace carries a price yet',
      body: 'The market is built from records that already contain money: an open case with a three-point cost estimate, funded work with effort and value, an active negotiation above its BATNA, a critical dependency with a measured daily impact, an overspent budget, or a priced decision frame. The module does not invent a value to fill the screen.',
      icon: '◮',
    }));
    return h('div', { class: 'stack' }, ...nodes);
  }

  for (const market of preview.markets) {
    nodes.push(h('div', { class: 'section-head' },
      h('h2', null, `${market.currency} market`),
      h('span', { class: 'muted' },
        `${market.groupCount} priced obligation(s) · ${hours(market.budgetHours)} budget · ${hours(market.usedHours)} allocated`)));

    const chosen = market.chosen.length
      ? table({
        caption: `Obligations the ${market.currency} plan buys, with the mode, hours, probability and expected protected value`,
        columns: [
          { label: 'Obligation', render: (row) => h('div', { class: 'stack-xs' }, h('strong', null, row.candidate.title), h('span', { class: 'muted' }, sourceLink(row.candidate))) },
          { label: 'Mode', render: (row) => badge(ATT_MODE_LABELS[row.mode], row.mode === 'delegate' ? 'good' : 'neutral', row.delegateName || '') },
          { label: 'Hours', className: 'num', render: (row) => hours(row.hours) },
          { label: 'Success', className: 'num', render: (row) => `${pct(row.probability)}${row.candidate.successMeasured ? '' : ' (prior)'}` },
          { label: 'Expected protected', className: 'num', render: (row) => money(row.value, market.currency) },
          { label: 'Per hour', className: 'num', render: (row) => money(row.ratio, market.currency) },
        ],
        rows: market.chosen,
      })
      : emptyState({ title: 'The solver bought nothing', body: 'Every priced obligation is larger than the budget. Raise the budget, or declare smaller hours on the items you can actually finish.', icon: '∅' });

    nodes.push(card({
      title: 'Buy',
      subtitle: `${market.chosen.length} obligation(s) · ${money(market.value, market.currency)} of expected protected value for ${hours(market.usedHours)}`,
      body: chosen,
    }));

    const forgone = market.dropped.length
      ? table({
        caption: `Obligations the ${market.currency} plan knowingly leaves carrying, with the expected value forgone`,
        columns: [
          { label: 'Not funded', render: (row) => h('div', { class: 'stack-xs' }, h('strong', null, row.candidate.title), h('span', { class: 'muted' }, row.reason)) },
          { label: 'Would take', className: 'num', render: (row) => hours(row.candidate.hours) },
          { label: 'Value forgone', className: 'num', render: (row) => money(row.forgone, market.currency) },
          { label: 'Per hour', className: 'num', render: (row) => money(row.forgonePerHour, market.currency) },
        ],
        rows: market.dropped,
      })
      : emptyState({ title: 'Nothing is being forgone', body: 'Every priced obligation fits inside the budget. That is unusual, and it usually means the queue is under-recorded rather than that the week is light.', icon: '✓' });

    nodes.push(card({
      title: 'Knowingly let carry',
      subtitle: market.dropped.length
        ? `${market.dropped.length} obligation(s) · ${money(market.dropped.reduce((acc, row) => acc + (row.forgone || 0), 0), market.currency)} of expected value consciously left unprotected`
        : 'nothing is excluded by the budget',
      body: forgone,
    }));

    if (market.delegateLoad.length) {
      nodes.push(card({
        title: 'Where the hand-offs land',
        subtitle: `Delegate pool ${hours(market.delegateCapacity)} · ${hours(market.delegateHoursUsed)} used${market.delegateBinding ? ` · one more delegate hour is worth ${money(market.delegatePrice, market.currency)}` : ''}`,
        body: h('div', { class: 'stack-xs' },
          ...market.delegateLoad.map((row) => barRow({
            label: row.name,
            value: row.effortHours,
            hint: `${row.items} item(s) · ${hours(row.effortHours)} of work · ${hours(row.handoffHours)} of your supervision`,
            tone: market.delegateCapacity > 0 && row.effortHours > market.delegateCapacity ? 'bad' : null,
          }))),
      }));
    }
  }

  /* ----- committed plans and their frozen predictions ----- */
  nodes.push(h('div', { class: 'section-head' },
    h('h2', null, 'Committed plans'),
    h('span', { class: 'muted' }, plans.length ? `${plans.length} on record` : 'none yet')));

  if (!plans.length) {
    nodes.push(emptyState({
      title: 'No plan has been committed',
      body: 'The market above is a live read and moves every time a record changes. Committing freezes the prediction — the budget, the bought set and the forgone set with its price — so that next week the question is not “how did it go?” but “did the number I wrote down happen?”.',
      icon: '◎',
    }));
    return h('div', { class: 'stack' }, ...nodes);
  }

  const rows = plans.slice(0, 20).map((plan) => ({
    plan,
    status: plan.status === 'reviewed' ? 'Reviewed' : plan.status === 'abandoned' ? 'Abandoned' : 'Awaiting review',
    attainment: plan.review?.attainmentPct ?? null,
  }));

  nodes.push(table({
    caption: 'Committed attention plans, with the frozen prediction and the measured result where one exists',
    columns: [
      {
        label: 'Plan',
        render: (row) => h('div', { class: 'stack-xs' },
          h('strong', null, row.plan.label),
          h('span', { class: 'muted' },
            `${row.plan.provenance?.kind === 'demo' ? 'demo plan · ' : ''}committed ${formatDate(row.plan.committedOn)} · review ${formatDate(row.plan.result.reviewOn)}`)),
      },
      { label: 'Status', render: (row) => badge(row.status, row.plan.status === 'reviewed' ? 'good' : row.plan.status === 'abandoned' ? 'neutral' : 'caution') },
      { label: 'Budget', className: 'num', render: (row) => `${hours(row.plan.result.usedHours)} / ${hours(row.plan.result.budgetHours)}` },
      { label: 'Predicted', className: 'num', render: (row) => money(row.plan.result.value, row.plan.currency) },
      { label: 'Measured', className: 'num', render: (row) => (row.plan.review ? money(row.plan.review.measuredAvoided, row.plan.currency) : '—') },
      { label: 'Attainment', className: 'num', render: (row) => (row.attainment === null ? '—' : `${row.attainment}%`) },
      {
        label: '',
        render: (row) => h('div', { class: 'row-actions' },
          h('button', {
            class: 'btn btn-small btn-ghost',
            type: 'button',
            onClick: () => ctx.navigate(`#/attention?panel=plan&plan=${encodeURIComponent(row.plan.id)}`),
          }, 'Open'),
          row.plan.status === 'committed'
            ? h('button', {
              class: 'btn btn-small btn-primary',
              type: 'button',
              onClick: () => openAttentionReviewDialog(ctx, row.plan),
            }, 'Review')
            : null),
      },
    ],
    rows,
  }));

  if (selectedPlan) {
    const body = h('div', { class: 'stack' });
    body.append(h('div', { class: 'kv-grid' },
      h('div', null, h('span', { class: 'muted' }, 'Committed'), h('div', null, formatDate(selectedPlan.committedOn))),
      h('div', null, h('span', { class: 'muted' }, 'Currency'), h('div', null, selectedPlan.currency || '—')),
      h('div', null, h('span', { class: 'muted' }, 'Budget'), h('div', null, hours(selectedPlan.result.budgetHours))),
      h('div', null, h('span', { class: 'muted' }, 'Expected protected'), h('div', null, money(selectedPlan.result.value, selectedPlan.currency))),
      h('div', null, h('span', { class: 'muted' }, 'Price of the next hour'), h('div', null, money(selectedPlan.result.shadowPrice, selectedPlan.currency))),
      h('div', null, h('span', { class: 'muted' }, 'Distance to bound'), h('div', null, `${selectedPlan.result.gapPct}%`))));
    body.append(table({
      caption: 'The frozen prediction of the selected plan, item by item',
      columns: [
        { label: 'Bought', render: (row) => row.title },
        { label: 'Mode', render: (row) => ATT_MODE_LABELS[row.mode] || row.mode },
        { label: 'Hours', className: 'num', render: (row) => hours(row.hours) },
        { label: 'Predicted success', className: 'num', render: (row) => pct(row.probability) },
        { label: 'Expected value', className: 'num', render: (row) => money(row.value, selectedPlan.currency) },
        { label: 'Measured', className: 'num', render: (row) => {
          const reading = selectedPlan.review?.readings?.find((entry) => entry.id === row.id);
          return reading ? `${money(reading.avoided, selectedPlan.currency)} · ${reading.verdict}` : '—';
        } },
      ],
      rows: selectedPlan.result.items,
    }));
    if (selectedPlan.notes.length) {
      body.append(h('ul', { class: 'evidence-list' }, ...selectedPlan.notes.slice(-8).map((note) => h('li', null, `${note.source ? `${note.source}: ` : ''}${note.text}`))));
    }
    if (selectedPlan.review) {
      body.append(banner({
        tone: selectedPlan.review.attainmentPct !== null && selectedPlan.review.attainmentPct >= 80 ? 'good' : 'caution',
        title: `Reviewed ${formatDate(selectedPlan.review.reviewedOn)} — ${selectedPlan.review.attainmentPct === null ? 'no measurable attainment' : `${selectedPlan.review.attainmentPct}% of the frozen prediction`}`,
        body: `${selectedPlan.review.counts.realised} realised, ${selectedPlan.review.counts.contradicted} contradicted, ${selectedPlan.review.counts.open} still open, ${selectedPlan.review.counts.unmeasured} unmeasurable. ${selectedPlan.review.brier === null ? '' : `Brier score over ${selectedPlan.review.brierN} settled item(s): ${selectedPlan.review.brier}. `}${selectedPlan.review.notes.join(' ')}`,
      }));
    }
    nodes.push(card({ title: selectedPlan.label, subtitle: 'The frozen prediction and what the records did with it', body }));
  }

  return h('div', { class: 'stack' }, ...nodes);
}

/* ----------------------------------------------------------- market panel */

function renderMarketPanel(preview, ctx) {
  if (!preview.candidates.length) {
    return emptyState({ title: 'Nothing to price', body: 'Record an open case with a three-point cost estimate, funded work with an effort and a value, or an active negotiation above its BATNA, and it appears here automatically.', icon: '◮' });
  }
  const rows = [...preview.candidates].sort((a, b) => {
    const av = a.exposure ?? -1;
    const bv = b.exposure ?? -1;
    return bv - av;
  });
  const grouped = new Map();
  for (const row of rows) {
    const key = row.currency || 'unpriced';
    const list = grouped.get(key) || [];
    list.push(row);
    grouped.set(key, list);
  }
  const nodes = [];
  for (const [currency, list] of grouped) {
    nodes.push(card({
      title: `${currency} obligations`,
      subtitle: `${list.length} record(s) · ${list.filter((row) => row.exposure !== null && row.hours !== null).length} fully priceable`,
      body: table({
        caption: `Every priced and unpriced obligation in ${currency}, with where each number came from`,
        columns: [
          { label: 'Obligation', render: (row) => h('div', { class: 'stack-xs' }, h('strong', null, row.title), h('span', { class: 'muted' }, sourceLink(row))) },
          {
            label: 'Exposure',
            className: 'num',
            render: (row) => h('div', { class: 'stack-xs' },
              h('span', null, row.exposure === null ? 'unpriced' : money(row.exposure, row.currency)),
              h('span', { class: 'muted small' }, row.exposureBasis)),
          },
          {
            label: 'Your hours',
            className: 'num',
            render: (row) => h('div', { class: 'stack-xs' },
              h('span', null, row.hours === null ? 'unpriced' : hours(row.hours)),
              h('span', { class: 'muted small' }, row.hoursBasis)),
          },
          {
            label: 'Success',
            className: 'num',
            render: (row) => h('div', { class: 'stack-xs' },
              h('span', null, pct(row.successProbability)),
              h('span', { class: 'muted small' }, row.successBasis)),
          },
          {
            label: 'Expected per hour',
            className: 'num',
            render: (row) => (row.exposure === null || row.hours === null || !row.hours
              ? '—'
              : money((row.exposure * row.successProbability) / row.hours, row.currency)),
          },
        ],
        rows: list,
      }),
    }));
  }
  if (preview.shadowed.length) {
    nodes.push(card({
      title: 'Shadowed records',
      subtitle: 'A second record protecting the same exposed value through a typed link; counting it twice would double-count the exposure',
      body: table({
        caption: 'Records collapsed onto a higher-exposure record by a typed link',
        columns: [
          { label: 'Record', render: (row) => row.title },
          { label: 'Collapsed onto', render: (row) => row.shadowedByTitle },
          { label: 'Exposure', className: 'num', render: (row) => money(row.exposure, row.currency) },
        ],
        rows: preview.shadowed,
      }),
    }));
  }
  return h('div', { class: 'stack' }, ...nodes);
}

/* --------------------------------------------------------- unpriced panel */

function renderUnpricedPanel(preview) {
  const nodes = [];
  nodes.push(banner({
    tone: preview.unpriced.length ? 'caution' : 'good',
    title: preview.unpriced.length
      ? `${preview.unpriced.length} open obligation(s) cannot enter the optimisation`
      : 'Every open obligation carries a price',
    body: preview.unpriced.length
      ? `${hours(preview.totals.unpricedHours)} of your recorded queue has no money value, no hour estimate, or both. The solver is not judging those items — it has no number to rank them by. In any prioritisation that uses value per hour, unpriced work loses to priced work every single week. That is arithmetic, not opinion, and it is the most common way a competent manager's important-but-unquantified work quietly disappears.`
      : 'Nothing in the queue is excluded for want of a number. That is the state the module is trying to get you to.',
  }));
  if (!preview.unpriced.length) return h('div', { class: 'stack' }, ...nodes);
  nodes.push(table({
    caption: 'Obligations excluded from the optimisation, and the missing field that excluded each one',
    columns: [
      { label: 'Obligation', render: (row) => h('div', { class: 'stack-xs' }, h('strong', null, row.title), h('span', { class: 'muted' }, sourceLink(row))) },
      { label: 'Exposure', className: 'num', render: (row) => (row.exposure === null ? 'missing' : money(row.exposure, row.currency)) },
      { label: 'Hours', className: 'num', render: (row) => (row.hours === null ? 'missing' : hours(row.hours)) },
      { label: 'Why it cannot compete', render: (row) => h('span', { class: 'muted small' }, `${row.exposureBasis} ${row.hoursBasis}`) },
    ],
    rows: preview.unpriced,
  }));
  return h('div', { class: 'stack' }, ...nodes);
}

/* --------------------------------------------------------- frontier panel */

function renderFrontierPanel(preview, ctx) {
  if (!preview.markets.length) {
    return emptyState({ title: 'No market to stress', body: 'The frontier re-solves the same market at half, three-quarters, full, one-and-a-quarter and one-and-a-half times the budget. It needs at least one priced obligation.', icon: '◧' });
  }
  const nodes = [];
  nodes.push(banner({
    tone: 'info',
    title: 'What the shape of this curve tells you',
    body: 'A steep rise means the week is badly under-funded and the next hour is expensive. A flat tail means additional time buys almost nothing — the constraint has moved from your calendar to the supply of worthwhile work, or to the delegate pool. Neither reading is available from a sorted to-do list.',
  }));
  for (const market of preview.markets) {
    const points = preview.sensitivity
      .map((row) => ({ factor: row.factor, point: row.markets.find((entry) => entry.currency === market.currency) }))
      .filter((row) => row.point);
    if (!points.length) continue;
    const base = points.find((row) => row.factor === 1)?.point.value || 0;
    nodes.push(card({
      title: `${market.currency} — value against budget`,
      subtitle: 'The same obligations, the same probabilities, only the hour ceiling moves',
      body: table({
        caption: `Expected protected value in ${market.currency} at five budget levels`,
        columns: [
          { label: 'Budget', className: 'num', render: (row) => `${hours(row.point.budgetHours)} (${Math.round(row.factor * 100)}%)` },
          { label: 'Expected protected', className: 'num', render: (row) => money(row.point.value, market.currency) },
          { label: 'Change against your budget', className: 'num', render: (row) => `${row.point.value - base >= 0 ? '+' : ''}${money(row.point.value - base, market.currency)}` },
          { label: 'Allocated', className: 'num', render: (row) => hours(row.point.usedHours) },
          { label: 'Items bought', className: 'num', render: (row) => String(row.point.selectedIds.length) },
        ],
        rows: points,
      }),
    }));
  }
  return h('div', { class: 'stack' }, ...nodes);
}

/* ----------------------------------------------------------- method panel */

function renderMethodPanel(preview) {
  const c = preview.conventions;
  const problem = h('div', { class: 'prose' },
    h('p', null, 'Every other screen in this workspace answers a question about one record. None of them answers the question a leader actually opens on Monday: given a fixed number of hours, which of the forty queued obligations is the best week I can buy, and what does the next hour cost me?'),
    h('p', null, 'That is a constrained selection problem, not a ranking. Doing an obligation and handing it off are two different modes of the same item, with different hours and different success probabilities, so each item is a group of mutually exclusive alternatives — a multiple-choice knapsack — and the budget is a single ceiling in hours.'),
    h('p', null, 'Handing work off also consumes somebody else\'s week, so the market has a second ceiling: a delegate pool. Two constraints make the problem genuinely hard, which is why the plan prints how close it is to a bound rather than claiming to be best.'));

  const algorithm = h('div', { class: 'prose' },
    h('p', null, 'Each obligation becomes a group of up to three alternatives: do it yourself (its full hours, your measured success rate), hand it off (the declared share of those hours, the named person\'s measured on-time rate, and their own working hours against the delegate pool), or let it carry (zero hours, zero value). Within a group, any option that adds hours without adding value is dominated and removed, and the remaining options are pruned to the upper convex hull — the same prune that makes the linear relaxation solvable by a greedy ratio argument.'),
    h('p', null, 'Where the market is small enough, the plan is found by depth-first branch and bound over the pruned hulls with two prunes (a remaining-value ceiling and constraint feasibility), inside a hard node budget. When the whole tree closes the screen says the plan is optimal, and the printed gap is exactly zero.'),
    h('p', null, 'Where it does not close, the linear relaxation is solved by Dyer\'s incremental-ratio algorithm, the plan is built over both constraints and improved by local search, and the gap between the achievable plan and the bound is printed. That bound is a Lagrangian dual on the delegate constraint, minimised by golden-section search — a real upper bound, not an estimate.'),
    h('p', null, 'The price of the next hour is a finite difference: the same market re-solved with one more hour, and the change in the optimal value. On a knapsack the value function is a step function, so a derivative would be meaningless and the difference is exact. When an extra hour buys nothing, the price is zero — which is an answer, not a failure.'));

  const sources = table({
    caption: 'Data sources and conventions used by the attention market',
    columns: [
      { label: 'Quantity', render: (row) => row.name },
      { label: 'Source', render: (row) => row.basis },
    ],
    rows: [
      { name: 'Exposure — case', basis: 'PERT expected value of the case\'s own three-point cost estimate (optimistic / most likely / pessimistic). No estimate means unpriced.' },
      { name: 'Exposure — funded work', basis: 'PERT expected value of the item\'s own three-point value estimate.' },
      { name: 'Exposure — negotiation', basis: 'Stakes less your own recorded BATNA. At or below BATNA there is no surplus to protect and the item is unpriced.' },
      { name: 'Exposure — dependency', basis: 'Measured daily impact of an outage x time to recover, from the record.' },
      { name: 'Exposure — budget', basis: 'Committed spend above the ceiling. Nothing above the ceiling means no exposure.' },
      { name: 'Exposure — decision frame', basis: 'The largest absolute payoff in the frame\'s own declared table.' },
      { name: 'Your hours', basis: `Derived from the record's own capacity-days or effort-days x ${c.hoursPerEffortDay} h/day x ${c.leaderSharePct}% declared leader share; otherwise declared by you on the plan; otherwise the median you declared before for that kind of item; otherwise unpriced.` },
      { name: 'Success probability', basis: `Empirical-Bayes share of closed records that met their own due date, shrunk toward the class mean by one pseudo-observation. Below ${c.minSamples} closed records the plan uses a 50% prior and says so on every row.` },
      { name: 'Hand-off cost', basis: `${c.handoffSharePct}% of the item's hours — briefing, checking and repairing always remain yours.` },
      { name: 'Delegate pool', basis: `${c.delegateHours} h of delegated working time in the horizon; a second ceiling, not a suggestion.` },
      { name: 'Budget', basis: `${c.budgetHours} h of leader attention per horizon, from settings or set on the plan.` },
      { name: 'Review date', basis: `${c.horizonDays} days after commitment.` },
    ],
  });

  const limits = h('div', { class: 'prose' },
    h('p', null, 'No correlation between obligations. Two cases caused by one root cause are two exposures here unless a typed link says they are the same record — which is the only overlap the workspace can prove.'),
    h('p', null, 'No scheduling. A plan is a set, not a week; when things happen is the Decision Portfolio\'s problem.'),
    h('p', null, 'No cross-currency arithmetic. Each currency is its own market with its own budget and its own price, because exchanging them would need a rate nobody recorded.'),
    h('p', null, 'No learning curve and no diminishing returns inside a mode. The plan says an obligation costs what its record says it costs.'),
    h('p', null, 'No credit for finishing early. The review measures the drop in each record\'s own exposure, and it says plainly that a drop is not proof the work caused it.'),
    h('p', null, 'No claim that the hours are right. The hours are the one input that comes from you, and every derived row prints the share and the day-length it used so the guess is auditable.'));

  const readings = h('div', { class: 'prose' },
    h('p', null, 'Dyer (1984) and Zemel (1984) for the linear-time solution of the multiple-choice knapsack relaxation, which is what makes an exact-enough answer affordable inside a browser frame.'),
    h('p', null, 'Fisher (1981) on Lagrangian relaxation for integer programming — the source of the two-constraint dual this module minimises by golden-section search.'),
    h('p', null, 'Hubbard\'s measurement inversion, restated as arithmetic: the obligation nobody priced is the obligation that always loses, and the leader never sees the decision being made.'));

  return h('div', { class: 'stack' },
    card({ title: 'The problem this solves', body: problem }),
    card({ title: 'The algorithm, exactly', body: algorithm }),
    card({ title: 'Where each number comes from', body: sources }),
    card({ title: 'What this deliberately does not do', body: limits }),
    card({ title: 'Readings that shaped this', body: readings }));
}
