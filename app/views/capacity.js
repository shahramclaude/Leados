/**
 * app/views/capacity.js — the operating plan: capacity, flow and allocation.
 *
 * One screen that answers the manager's weekly question honestly:
 *   - how much real capacity exists after transition ramps and the operational
 *     reserve (not the headcount fantasy),
 *   - what is committed versus merely wanted,
 *   - what utilisation costs in lead time (Little's Law + Kingman),
 *   - which work to fund next and what to remove first (marginal analysis),
 *   - and what date range the funded scope actually implies (P50/P80/P90).
 *
 * All numbers are derived live from records. The view never invents an
 * estimate; unmeasured work is labelled as such.
 */

import { h, toast, confirmDialog } from '../ui/dom.js';
import { pageHeader, card, stat, badge, kv, emptyState, table } from '../ui/components.js';
import { progressBar, sparkline, monteCarloHistogramChart } from '../ui/charts.js';
import { formatDate, dayKey } from '../core/time.js';
import {
  PORTFOLIO_DECISION_LABELS,
  PORTFOLIO_STATUS_LABELS,
  capacitySummary,
  portfolioSource,
} from '../core/domain/capacity.js';
import { simulatePortfolio } from '../core/domain/simulation.js';
import { AUTOMATION_RULES } from '../core/domain/automation.js';
import {
  openPortfolioItemDialog,
  openPortfolioDecisionDialog,
  openReleasePortfolioItemDialog,
} from '../ui/capacity-modals.js';

const DECISION_TONE = {
  funded: 'good',
  undecided: 'neutral',
  deferred: 'caution',
  cut: 'bad',
};

function pct(value) {
  return value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`;
}

function money(currency, amount) {
  if (amount === null || amount === undefined) return '—';
  return `${currency} ${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/** Stacked bar showing how allocatable capacity is used, and what is left. */
function utilisationBar(model) {
  const allocatable = Math.max(1, model.supply.allocatableDays);
  const segments = [
    { key: 'reserve', label: 'Incidents & reserves', days: model.demand.reserveDays, tone: 'reserve' },
    { key: 'funded', label: 'Funded planned work', days: model.demand.fundedDays, tone: 'funded' },
    {
      key: 'wanted',
      label: 'Undecided demand',
      days: Math.round(Math.max(0, Math.min(model.demand.wantedDays, Math.max(0, allocatable - model.demand.committedDays))) * 100) / 100,
      tone: 'wanted',
    },
  ];
  const used = model.demand.committedDays;
  const slack = Math.round(Math.max(0, model.slackDays) * 100) / 100;
  return h(
    'div',
    { class: 'capacity-bar-block' },
    h(
      'div',
      {
        class: 'capacity-bar',
        role: 'img',
        'aria-label': `Capacity use: ${model.demand.committedDays} committed of ${model.supply.allocatableDays} allocatable person-days (${pct(model.utilisation)}); ${model.demand.reserveDays} reserved for incidents, ${model.demand.fundedDays} funded work, ${slack} unused, ${lossOf(allocatable, used)} over capacity`,
      },
      ...segments
        .filter((s) => s.days > 0)
        .map((s) =>
          h('span', {
            class: `capacity-seg capacity-seg-${s.tone}`,
            style: `width:${Math.min(100, (s.days / allocatable) * 100)}%`,
            title: `${s.label}: ${s.days}d`,
          }),
        ),
      slack > 0 ? h('span', { class: 'capacity-seg capacity-seg-slack', style: `width:${(slack / allocatable) * 100}%`, title: `Unallocated: ${slack}d` }) : null,
      used > allocatable
        ? h('span', { class: 'capacity-seg capacity-seg-over', style: `width:${Math.min(100, ((used - allocatable) / allocatable) * 100)}%`, title: `Over capacity by ${used - allocatable}d` })
        : null,
    ),
    h(
      'ul',
      { class: 'capacity-legend' },
      ...segments.filter((s) => s.days > 0).map((s) =>
        h('li', null, h('span', { class: `legend-dot legend-${s.tone}`, 'aria-hidden': 'true' }), `${s.label}: ${s.days}d`)),
      slack > 0 ? h('li', null, h('span', { class: 'legend-dot legend-slack', 'aria-hidden': 'true' }), `Unallocated: ${slack}d`) : null,
      used > allocatable ? h('li', null, h('span', { class: 'legend-dot legend-over', 'aria-hidden': 'true' }), `Over capacity: ${used - allocatable}d`) : null,
    ),
  );
}

function lossOf(allocatable, used) {
  return used > allocatable ? `${used - allocatable} days over` : 'nothing over capacity';
}

function itemActions(ctx, item) {
  const actions = [];
  if (item.status === 'open' && item.kind !== 'capacity-reserve') {
    actions.push(
      h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => openPortfolioDecisionDialog(ctx, { item }) }, 'Decide'),
    );
  }
  if (item.status === 'open' && item.decision === 'funded' && item.kind !== 'capacity-reserve') {
    actions.push(
      h('button', {
        class: 'btn btn-tiny btn-ghost',
        type: 'button',
        onClick: () => {
          const result = ctx.api.completePortfolioItem(item.id, { completedOn: dayKey(ctx.now) });
          toast(result.ok ? 'Delivered — capacity returned to the plan' : result.error, result.ok ? 'good' : 'bad');
        },
      }, 'Deliver'),
    );
  }
  if (item.status === 'open' && item.kind !== 'capacity-reserve') {
    actions.push(
      h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => openReleasePortfolioItemDialog(ctx, { item }) }, 'Release'),
      h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => openPortfolioItemDialog(ctx, { item }) }, 'Edit'),
      h('button', {
        class: 'btn btn-tiny btn-ghost btn-danger-text',
        type: 'button',
        onClick: async () => {
          const ok = await confirmDialog({
            title: 'Delete this plan item?',
            message: 'This removes the record and its links. Deleting is not the same as deciding not to do the work — release it instead if it was a real decision.',
            confirmLabel: 'Delete',
            danger: true,
          });
          if (!ok) return;
          const result = ctx.api.deletePortfolioItem(item.id);
          toast(result.ok ? 'Plan item deleted' : result.error, result.ok ? 'good' : 'bad');
        },
      }, 'Delete'),
    );
  }
  return actions;
}

function sourceCell(ctx, item) {
  const source = portfolioSource(ctx.state, item);
  if (!source) return h('span', { class: 'muted tiny' }, item.kind === 'capacity-reserve' ? 'auto' : 'manual');
  return h(
    'a',
    {
      class: 'case-link-pill',
      href: source.route,
      onClick: (e) => {
        e.preventDefault();
        ctx.navigate(source.route);
      },
    },
    `${source.type}: ${source.title.slice(0, 40)}`,
  );
}

export function renderCapacity(ctx) {
  const { state, now } = ctx;
  const summary = capacitySummary(state, now);
  const { model, flow, ranking, forecast } = summary;
  const simSeed = Number(state.settings?.simulationSeed) || 42;
  const simTrials = Number(state.settings?.simulationTrials) || 1000;
  const mc = simulatePortfolio(state, {
    now,
    seed: simSeed,
    trials: simTrials,
  });
  const hasPeople = model.hasTeam;
  const hasItems = (state.portfolio || []).length > 0;

  const header = pageHeader({
    eyebrow: 'Operating plan',
    title: 'Capacity & flow',
    subtitle: `${model.horizonWeeks}-week horizon · ${model.supply.activeCount} active ${model.supply.activeCount === 1 ? 'person' : 'people'} · ${model.supply.allocatableDays} allocatable person-days after a ${model.operationalLoadPct}% operational reserve`,
    actions: [
      h('a', { class: 'btn btn-ghost', href: '#/scenarios' }, 'What-if sandbox'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openPortfolioItemDialog(ctx) }, 'Add work'),
      h('button', {
        class: 'btn btn-secondary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.syncCapacityPlan();
          if (!result.ok) return toast(result.error, 'bad');
          const n = (result.propagations || []).length;
          toast(n ? `Plan reconciled — ${n} cross-module update(s)` : 'Plan already in sync', n ? 'good' : 'neutral');
        },
      }, 'Sync rules'),
    ],
  });

  if (!hasPeople) {
    return h(
      'div',
      { class: 'page' },
      header,
      card({
        body: emptyState({
          title: 'Add your team first',
          body: 'Capacity is computed from the people on your roster, their transition ramps, and the work you commit. Without a roster there is nothing to allocate.',
          action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => ctx.navigate('#/people') }, 'Add your team'),
        }),
      }),
    );
  }

  const bandTone = model.band.tone;
  const stats = h(
    'div',
    { class: 'stat-grid' },
    stat({ label: 'Committed', value: `${model.demand.committedDays}d`, hint: `of ${model.supply.allocatableDays}d allocatable`, tone: bandTone === 'bad' ? 'bad' : '' }),
    stat({ label: 'Utilisation', value: pct(model.utilisation), hint: model.band.label, tone: bandTone === 'good' ? 'good' : bandTone === 'bad' ? 'bad' : 'warn' }),
    stat({ label: model.slackDays >= 0 ? 'Unallocated' : 'Deficit', value: `${Math.abs(model.slackDays)}d`, hint: model.slackDays >= 0 ? 'capacity not yet committed' : 'committed work exceeds capacity', tone: model.slackDays >= 0 ? '' : 'bad' }),
    stat({ label: 'Queue delay', value: flow.delayMultiplier === null ? '—' : `${flow.delayMultiplier}×`, hint: 'Kingman approximation at this utilisation', tone: flow.delayMultiplier !== null && flow.delayMultiplier >= 4 ? 'warn' : '' }),
    stat({ label: 'Funded scope P80', value: forecast.available ? formatDate(forecast.p80, { withYear: false }) : '—', hint: forecast.available ? `P50 ${formatDate(forecast.p50, { withYear: false })} · P90 ${formatDate(forecast.p90, { withYear: false })}` : 'needs effort estimates' }),
  );

  const utilisationCard = card({
    title: 'Where the capacity goes',
    subtitle: model.band.guidance,
    actions: [badge(model.band.label, bandTone === 'bad' ? 'bad' : bandTone === 'good' ? 'good' : bandTone === 'warn' ? 'caution' : 'neutral')],
    body: h(
      'div',
      null,
      utilisationBar(model),
      h(
        'div',
        { class: 'kv-row kv-row-wrap' },
        kv('Gross', `${model.supply.grossDays}d`),
        kv('Transition ramp', model.supply.rampedCount ? `−${Math.round((model.supply.grossDays - model.supply.availableDays) * 10) / 10}d (${model.supply.rampedCount} people)` : 'none'),
        kv('Operational reserve', `−${model.supply.operationalReserveDays}d`),
        kv('Allocatable', `${model.supply.allocatableDays}d`),
        kv('Undecided demand', `${model.demand.wantedDays}d`),
        kv('Parked', `${model.demand.parkedDays}d`),
      ),
      model.demand.unestimatedCount
        ? h('p', { class: 'muted small' }, `${model.demand.unestimatedCount} committed item(s) have no effort estimate, so the real commitment is higher than the figure above.`)
        : null,
    ),
  });

  const flowCard = card({
    title: 'Flow arithmetic',
    subtitle: 'Little’s Law (WIP ÷ throughput = cycle time) and Kingman’s queue-delay approximation, computed from the record rather than assumed.',
    body: h(
      'div',
      null,
      h(
        'div',
        { class: 'kv-row kv-row-wrap' },
        kv('Work in progress', `${flow.wip} funded item(s) · limit ${flow.wipLimit}`, flow.wipBreach ? 'warn' : ''),
        kv('Throughput', `${flow.throughputPerWeek}/week`, ''),
        kv('Delivered in window', `${flow.completedInWindow} in ${flow.windowWeeks} weeks`, ''),
        kv('Observed cycle time', flow.observedCycleDays === null ? 'no delivered items yet' : `${flow.observedCycleDays} days (median)`),
        kv('Implied cycle time', flow.littleCycleWeeks === null ? 'not enough completions' : `${flow.littleCycleWeeks} weeks`),
        kv('Delay multiplier', flow.delayMultiplier === null ? 'undefined at ≥100%' : `${flow.delayMultiplier}×`),
      ),
      flow.wipBreach
        ? h('p', { class: 'warn-text small' }, `More work is in flight than the ${flow.wipLimit}-item limit. Starting less work shortens cycle time without adding people.`)
        : h('p', { class: 'muted small' }, `The ${flow.wipLimit}-item limit comes from ${model.wipPerPerson} concurrent funded items per person. It is a planning convention you can change in Settings, not a universal law.`),
      flow.littleCycleNote ? h('p', { class: 'muted tiny' }, flow.littleCycleNote) : null,
      flow.otherOpenCommitments
        ? h('p', { class: 'muted tiny' }, `${flow.otherOpenCommitments} other open commitment(s) (delegations and operational cases) are tracked in their own ledgers and deliberately excluded from this rate.`)
        : null,
    ),
  });

  const peopleCard = card({
    title: 'Per-person load',
    subtitle: 'Unowned work is shared evenly, so the bottleneck cannot be hidden by leaving an owner blank.',
    body: h(
      'div',
      { class: 'stack-sm' },
      ...model.supply.people
        .slice()
        .sort((a, b) => (b.utilisation ?? 0) - (a.utilisation ?? 0))
        .map((p) =>
          h(
            'div',
            { class: 'bar-row' },
            h('div', { class: 'bar-row-head' },
              h('span', { class: 'bar-label' }, `${p.name}${p.rampFactor < 1 ? ` · ${p.rampLabel}` : ''}`),
              h('span', { class: 'bar-value' }, pct(p.utilisation))),
            progressBar(Math.min(100, (p.utilisation ?? 0) * 100), { tone: (p.utilisation ?? 0) > 1 ? 'bad' : (p.utilisation ?? 0) > 0.9 ? 'warn' : null, label: `${p.name} load` }),
            h('p', { class: 'bar-hint' }, `${p.loadDays}d of ${p.allocatable}d allocatable${p.ownDays ? ` · ${p.ownDays}d directly owned` : ''}${p.sharedDays ? ` · ${p.sharedDays}d shared unowned work` : ''}`),
          ),
        ),
    ),
  });

  const rows = (state.portfolio || [])
    .slice()
    .sort((a, b) => {
      const rank = { open: 0, done: 1, released: 2 };
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      const dec = { undecided: 0, funded: 1, deferred: 2, cut: 3 };
      return (dec[a.decision] ?? 9) - (dec[b.decision] ?? 9) || String(a.title).localeCompare(String(b.title));
    })
    .map((item) => {
      const computed = summary.model.demand.items.find((i) => i.id === item.id);
      const effort = computed?.effort || { expected: 0, p90: 0, measured: false };
      const value = computed?.value || { expected: 0, measured: false };
      const density = computed?.valueDensity ?? null;
      return {
        item,
        className: item.status !== 'open' ? 'row-muted' : '',
        cells: {
          title: h('div', null,
            h('strong', null, item.title),
            item.kind === 'capacity-reserve' ? h('div', null, badge('capacity reserve', 'neutral', 'Created from an operational case by RULE-CAP-01')) : null,
            item.rationale ? h('p', { class: 'muted tiny' }, item.rationale) : null),
          decision: h('div', null,
            badge(PORTFOLIO_DECISION_LABELS[item.decision] || item.decision, DECISION_TONE[item.decision] || 'neutral'),
            item.status !== 'open' ? h('div', null, h('span', { class: 'muted tiny' }, PORTFOLIO_STATUS_LABELS[item.status] || item.status)) : null),
          effort: effort.measured ? `${effort.expected}d` : h('span', { class: 'muted' }, 'unestimated'),
          value: value.measured ? money(item.currency, value.expected) : h('span', { class: 'muted' }, '—'),
          density: density === null ? h('span', { class: 'muted' }, '—') : `${item.currency} ${Math.round(density).toLocaleString('en-US')}/d`,
          owner: item.ownerId ? (state.people.find((p) => p.id === item.ownerId)?.name || '—') : h('span', { class: 'muted' }, 'unassigned'),
          target: item.targetOn ? formatDate(item.targetOn, { withYear: false }) : h('span', { class: 'muted' }, '—'),
          source: sourceCell(ctx, item),
          actions: h('div', { class: 'row-actions' }, ...itemActions(ctx, item)),
        },
      };
    });

  const portfolioCard = card({
    title: 'Funding decisions',
    subtitle: 'Value density is expected value ÷ expected person-days. Deferring is a decision; so is deleting — but they are not the same record.',
    actions: [h('button', { class: 'btn btn-small btn-secondary', type: 'button', onClick: () => openPortfolioItemDialog(ctx) }, 'Add work')],
    body: hasItems
      ? table({
          caption: 'Funded and proposed work, with its funding decision, effort estimate, expected value, value density and owner',
          columns: [
            { key: 'title', label: 'Work', render: (r) => r.cells.title },
            { key: 'decision', label: 'Decision', render: (r) => r.cells.decision },
            { key: 'effort', label: 'Effort (PERT)', render: (r) => r.cells.effort },
            { key: 'value', label: 'Value', render: (r) => r.cells.value },
            { key: 'density', label: 'Value density', render: (r) => r.cells.density },
            { key: 'owner', label: 'Owner', render: (r) => r.cells.owner },
            { key: 'target', label: 'Target', render: (r) => r.cells.target },
            { key: 'source', label: 'Source', render: (r) => r.cells.source },
            { key: 'actions', label: 'Actions', render: (r) => r.cells.actions },
          ],
          rows,
        })
      : emptyState({
          title: 'Nothing is in the operating plan yet',
          body: 'Add the work you are actually committing to this horizon. Start with two or three items you can estimate honestly — the plan is only as useful as its worst guess.',
          action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openPortfolioItemDialog(ctx) }, 'Add the first item'),
        }),
  });

  const recommendationRows = [];
  if (ranking.nextInLine) {
    recommendationRows.push(h('li', null,
      h('strong', null, `Next in line: “${ranking.nextInLine.title}”`),
      h('p', { class: 'muted small' }, `Needs ${ranking.nextInLine.effort.expected}d but only ${ranking.daysLeftAfterRecommendations}d of slack remains${ranking.nextInLine.valueDensity !== null ? ` · ${ranking.nextInLine.currency} ${Math.round(ranking.nextInLine.valueDensity)} value per person-day` : ''}.`),
      h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => openPortfolioDecisionDialog(ctx, { item: ranking.nextInLine.item }) }, 'Decide')));
  }
  if (ranking.deficitDays > 0) {
    recommendationRows.push(h('li', null,
      h('strong', null, `Restore feasibility: free ${ranking.deficitDays}d`),
      h('p', { class: 'muted small' },
        ranking.releaseCandidates.length
          ? `Lowest value density first: ${ranking.releaseCandidates.map((i) => `“${i.title}” (${i.effort.expected}d)`).join(', ')} — ${ranking.releaseDays}d total.`
          : 'No funded item carries a value estimate, so the engine cannot rank what to remove. Add values before re-planning blindly.'),
      ranking.unableToFreeEnough ? h('p', { class: 'muted tiny' }, 'Removing every ranked item still would not cover the deficit: the plan needs a later date or more capacity, and that should be written down.') : null));
  }
  if (!recommendationRows.length && ranking.funded.length) {
    recommendationRows.push(h('li', null,
      h('strong', null, `${ranking.funded.length} undecided item(s) fit inside the remaining slack`),
      h('p', { class: 'muted small' }, ranking.funded.map((i) => `“${i.title}” (${i.effort.expected}d)`).join(', '))));
  }

  const recommendationCard = card({
    title: 'Allocation recommendation',
    subtitle: 'A recommendation, not an action: nothing is funded, deferred, or cut until you record the decision.',
    body: recommendationRows.length
      ? h('ul', { class: 'stack-sm recommendation-list' }, ...recommendationRows)
      : h('p', { class: 'muted small' }, 'No undecided work and no deficit: the plan is explicit. Re-check after the next incident.'),
  });

  const forecastCard = card({
    title: 'Delivery forecast',
    subtitle: 'Independent PERT variances are additive, so the portfolio range comes from summed variance rather than a single guess (central limit theorem).',
    body: forecast.available
      ? h(
          'div',
          null,
          h('div', { class: 'kv-row kv-row-wrap' },
            kv('Funded scope', `${forecast.scopeCount} item(s) · ${forecast.expectedDays}d ± ${forecast.stdDev}d`),
            kv('P50', formatDate(forecast.p50)),
            kv('P80', formatDate(forecast.p80)),
            kv('P90', formatDate(forecast.p90)),
            kv('Team rate', `${forecast.dailyCapacity}d/day`)),
          forecast.unestimatedCount
            ? h('p', { class: 'warn-text small' }, `${forecast.unestimatedCount} funded item(s) are excluded from the forecast because they have no estimate. The real date is later.`)
            : null,
          forecast.targetRisks.length
            ? h('div', { class: 'table-wrap' },
                h('table', { class: 'table' },
                  h('caption', { class: 'sr-only' }, 'Committed targets, the work due by each date, the capacity available by then, and the probability of making it'),
                  h('thead', null, h('tr', null,
                    h('th', { scope: 'col' }, 'Commitment'),
                    h('th', { scope: 'col' }, 'Target'),
                    h('th', { scope: 'col' }, 'Work due by then'),
                    h('th', { scope: 'col' }, 'Capacity by then'),
                    h('th', { scope: 'col' }, 'Chance'))),
                  h('tbody', null,
                    ...forecast.targetRisks.map((t) => h('tr', null,
                      h('td', { 'data-label': 'Commitment' }, t.title),
                      h('td', { 'data-label': 'Target' }, formatDate(t.targetOn, { withYear: false })),
                      h('td', { 'data-label': 'Work due by then' }, `${t.cumulativeWorkByTarget}d`),
                      h('td', { 'data-label': 'Capacity by then' }, `${t.capacityByTarget}d`),
                      h('td', { 'data-label': 'Chance' }, t.atRisk ? badge('unachievable', 'bad') : `${Math.round((t.probability ?? 0) * 100)}%`))))))
            : h('p', { class: 'muted small' }, 'No funded work has a target date, so there is nothing to test the forecast against.'),
        )
      : h('p', { class: 'muted small' }, forecast.reason || 'Nothing funded yet.'),
  });

  const seedInput = h('input', {
    id: 'mc-seed-input',
    type: 'number',
    class: 'input-compact',
    min: '1',
    max: '999999999',
    value: String(simSeed),
  });
  const trialsSelect = h(
    'select',
    { id: 'mc-trials-select', class: 'input-compact' },
    ...[250, 500, 1000, 2500, 5000].map((n) =>
      h('option', { value: String(n), selected: n === simTrials ? 'selected' : null }, `${n.toLocaleString('en-US')} trials`),
    ),
  );
  const mcControls = h(
    'form',
    {
      class: 'mc-controls',
      'aria-label': 'Monte Carlo simulation parameters',
      onSubmit: (e) => {
        e.preventDefault();
        const res = ctx.api.updateSettings({
          simulationSeed: Number(seedInput.value),
          simulationTrials: Number(trialsSelect.value),
        });
        toast(res.ok ? 'Simulation parameters updated' : res.error, res.ok ? 'good' : 'bad');
      },
    },
    h('label', { class: 'tiny muted', for: 'mc-seed-input' }, 'Seed'),
    seedInput,
    h('label', { class: 'tiny muted', for: 'mc-trials-select' }, 'Trials'),
    trialsSelect,
    h('button', { type: 'submit', class: 'btn btn-tiny btn-ghost' }, 'Apply'),
  );

  const monteCarloCard = card({
    title: 'Monte Carlo joint completion & Critical-Chain simulation',
    subtitle: 'Seeded Beta-PERT draws with CD3 resource-dispatch priority, unscheduled operational reserve variability, and per-owner concurrency constraints (Savage Flaw of Averages + Goldratt Critical Chain).',
    actions: [mcControls],
    body: mc.available
      ? h(
          'div',
          { class: 'stack-sm', 'data-testid': 'capacity-montecarlo-card' },
          h(
            'div',
            { class: 'kv-row kv-row-wrap' },
            kv(
              'Horizon fit odds',
              pct(mc.horizonFitProbability),
              mc.horizonFitProbability < 0.35 ? 'bad' : mc.horizonFitProbability < 0.65 ? 'warn' : '',
            ),
            kv(
              'Overload odds',
              pct(mc.overloadProbability),
              mc.overloadProbability >= 0.65 ? 'bad' : mc.overloadProbability >= 0.35 ? 'warn' : '',
            ),
            kv(
              'Owner-bottleneck odds',
              pct(mc.ownerBottleneckBreachProbability),
              mc.ownerBottleneckBreachProbability >= 0.5 ? 'warn' : '',
            ),
            kv(
              'Fungible P80 date',
              mc.teamCompletion.available && mc.teamCompletion.p80 ? formatDate(mc.teamCompletion.p80) : '—',
            ),
            kv(
              'Owner-constrained P80',
              mc.bottleneckCompletion.available && mc.bottleneckCompletion.p80
                ? `${formatDate(mc.bottleneckCompletion.p80)}${mc.bottleneckCompletion.slipDaysVsTeamP80 > 0 ? ` (+${mc.bottleneckCompletion.slipDaysVsTeamP80}d)` : ''}`
                : '—',
              mc.bottleneckCompletion.slipDaysVsTeamP80 >= 7 ? 'warn' : '',
            ),
          ),
          (model.utilisation ?? 0) <= 1 && mc.overloadProbability >= 0.35
            ? h(
                'p',
                { class: 'warn-text small' },
                `Flaw of Averages warning: deterministic utilisation looks feasible at ${pct(model.utilisation)}, yet right-skewed PERT effort and operational reserve variability exceed the ${mc.allocatableDays.toFixed(1)}d supply budget in ${pct(mc.overloadProbability)} of simulated runs.`,
              )
            : null,
          mc.bottleneckCompletion.slipDaysVsTeamP80 >= 5 && mc.teamCompletion.p80 && mc.bottleneckCompletion.p80
            ? h(
                'p',
                { class: 'warn-text small' },
                `Critical-Chain owner bottleneck: serialising funded items by assigned owner pushes the P80 portfolio finish date out by +${mc.bottleneckCompletion.slipDaysVsTeamP80} calendar days (${formatDate(mc.teamCompletion.p80)} → ${formatDate(mc.bottleneckCompletion.p80)}). Rebalance ownership or sequence work explicitly.`,
              )
            : null,
          monteCarloHistogramChart(mc),
          mc.targetRisks.length
            ? h(
                'div',
                { class: 'table-wrap' },
                h(
                  'table',
                  { class: 'table' },
                  h(
                    'caption',
                    { class: 'sr-only' },
                    'Simulated completion dates and target-date confidence per funded target commitment',
                  ),
                  h(
                    'thead',
                    null,
                    h(
                      'tr',
                      null,
                      h('th', { scope: 'col' }, 'Commitment'),
                      h('th', { scope: 'col' }, 'Target'),
                      h('th', { scope: 'col' }, 'MC P50 date'),
                      h('th', { scope: 'col' }, 'MC P80 date'),
                      h('th', { scope: 'col' }, 'CLT chance'),
                      h('th', { scope: 'col' }, 'Monte Carlo odds'),
                    ),
                  ),
                  h(
                    'tbody',
                    null,
                    ...mc.targetRisks.map((tr) => {
                      const probPct = Math.round((tr.mcProbability ?? 0) * 100);
                      const tone = probPct < 35 ? 'bad' : probPct < 70 ? 'caution' : 'good';
                      return h(
                        'tr',
                        null,
                        h('td', { 'data-label': 'Commitment' }, h('strong', null, tr.title)),
                        h('td', { 'data-label': 'Target' }, formatDate(tr.targetOn, { withYear: false })),
                        h('td', { 'data-label': 'MC P50 date' }, tr.mcP50Date ? formatDate(tr.mcP50Date, { withYear: false }) : '—'),
                        h('td', { 'data-label': 'MC P80 date' }, tr.mcP80Date ? formatDate(tr.mcP80Date, { withYear: false }) : '—'),
                        h(
                          'td',
                          { 'data-label': 'CLT chance' },
                          tr.cltProbability === null ? '—' : `${Math.round(tr.cltProbability * 100)}%`,
                        ),
                        h('td', { 'data-label': 'Monte Carlo odds' }, badge(`${probPct}%`, tone)),
                      );
                    }),
                  ),
                ),
              )
            : null,
          mc.drivers.length
            ? h(
                'div',
                { class: 'table-wrap' },
                h(
                  'table',
                  { class: 'table' },
                  h(
                    'caption',
                    { class: 'sr-only' },
                    'Schedule variance drivers ranked by Pearson sensitivity index between item effort and total portfolio demand',
                  ),
                  h(
                    'thead',
                    null,
                    h(
                      'tr',
                      null,
                      h('th', { scope: 'col' }, 'Variance driver'),
                      h('th', { scope: 'col' }, 'Owner'),
                      h('th', { scope: 'col' }, 'PERT expected'),
                      h('th', { scope: 'col' }, 'Spread (P−O)'),
                      h('th', { scope: 'col' }, 'Sensitivity r'),
                      h('th', { scope: 'col' }, 'Variance share'),
                    ),
                  ),
                  h(
                    'tbody',
                    null,
                    ...mc.drivers.slice(0, 6).map((drv) => {
                      const ownerName = drv.ownerId
                        ? state.people.find((p) => p.id === drv.ownerId)?.name || '—'
                        : 'Shared pool';
                      return h(
                        'tr',
                        null,
                        h('td', { 'data-label': 'Variance driver' }, h('strong', null, drv.title)),
                        h('td', { 'data-label': 'Owner' }, ownerName),
                        h('td', { 'data-label': 'PERT expected' }, `${drv.expected}d`),
                        h('td', { 'data-label': 'Spread (P−O)' }, `${drv.spread}d`),
                        h('td', { 'data-label': 'Sensitivity r' }, drv.sensitivityIndex.toFixed(2)),
                        h('td', { 'data-label': 'Variance share' }, `${Math.round(drv.varianceShare * 100)}%`),
                      );
                    }),
                  ),
                ),
              )
            : null,
        )
      : h('p', { class: 'muted small' }, mc.reason || 'Fund at least one estimated item to run the Monte Carlo forecast.'),
  });

  const historyValues = summary.history.points.map((p) => (p.utilisation === null ? null : p.utilisation * 100));
  const historyCard = card({
    title: 'Utilisation trend',
    subtitle: summary.history.note,
    body: h('div', { class: 'kv-row kv-row-wrap' },
      kv('8 weeks ago', historyValues.length ? pct((historyValues[0] ?? 0) / 100) : '—'),
      kv('Now', pct(model.utilisation)),
      h('div', null, sparkline(historyValues, { width: 220, height: 40 }))),
  });

  const rulesCard = card({
    title: 'Automation running on this plan',
    subtitle: 'Every rule is deterministic and idempotent: re-running it never duplicates a record.',
    body: h('ul', { class: 'stack-sm' },
      ...AUTOMATION_RULES.filter((r) => r.id.startsWith('RULE-CAP')).map((rule) =>
        h('li', null,
          h('strong', null, `${rule.id} · ${rule.name}`),
          h('p', { class: 'muted tiny' }, `${rule.framework} — ${rule.description} (trigger: ${rule.trigger})`)))),
  });

  return h(
    'div',
    { class: 'page' },
    header,
    stats,
    h('div', { class: 'grid-2' }, utilisationCard, flowCard),
    h('div', { class: 'grid-2' }, recommendationCard, forecastCard),
    monteCarloCard,
    portfolioCard,
    h('div', { class: 'grid-2' }, peopleCard, historyCard),
    rulesCard,
  );
}
