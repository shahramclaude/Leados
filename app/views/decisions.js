/**
 * app/views/decisions.js — the decision log, DACI roles, and outcome reviews.
 */

import { h } from '../ui/dom.js';
import { pageHeader, card, stat, badge, emptyState, kv, tabs } from '../ui/components.js';
import {
  decisionsSummary,
  decisionQuality,
  decisionReviewState,
  openDecisions,
  DACI_ROLES,
  REVERSIBILITY_HELP,
} from '../core/domain/decisions.js';
import { formatDate } from '../core/time.js';
import { linksForEntity, isCaseOpen } from '../core/domain/cases.js';
import { buildCaseFromUpstreamEntity } from '../core/domain/automation.js';
import { CALIBRATION_MIN_SAMPLES, OUTCOME_VALUES, calibrationSummary } from '../core/domain/calibration.js';
import { calibrationChart } from '../ui/charts.js';
import { openRecordActualsDialog } from '../ui/capacity-modals.js';
import { openDecisionDialog, openDecideDialog, openReviewDialog, openCaseDialog } from '../ui/modals.js';

const OUTCOME_TONE = { good: 'good', mixed: 'caution', bad: 'bad', pending: 'neutral' };
const FILTERS = ['all', 'open', 'review', 'closed'];

export function renderDecisions(ctx) {
  const { state, now } = ctx;
  const summary = decisionsSummary(state, now);
  const focusId = ctx.query.get('decision');
  const rawFilter = ctx.query.get('filter') || 'all';
  const filter = FILTERS.includes(rawFilter) ? rawFilter : 'all';
  const open = openDecisions(state, now);
  const dueQueue = summary.dueQueue;
  const dueIds = new Set(dueQueue.map((entry) => entry.decision.id));

  let rows = state.decisions.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  if (focusId) {
    rows = rows.filter((d) => d.id === focusId);
  } else {
    if (filter === 'open') rows = rows.filter((d) => !d.chosen);
    if (filter === 'review') rows = rows.filter((d) => dueIds.has(d.id));
    if (filter === 'closed') rows = rows.filter((d) => Boolean(d.chosen));
  }

  const cardFor = (decision) => {
    const quality = decisionQuality(decision);
    const rev = decisionReviewState(decision, now);
    const caseLinks = linksForEntity(state, 'decision', decision.id).filter((l) => l.peer.type === 'case');
    const hasOpenCase = caseLinks.some((l) => isCaseOpen(l.peer.raw));
    const revLine = rev.state === 'overdue'
      ? `${formatDate(decision.reviewOn)} · ${rev.overdueDays}d overdue`
      : rev.state === 'soon'
        ? `${formatDate(decision.reviewOn)} · ${rev.daysUntil === 0 ? 'due today' : `in ${rev.daysUntil}d`}`
        : decision.reviewOn
          ? formatDate(decision.reviewOn)
          : 'no review date';

    return h(
      'article',
      {
        class: `decision-card ${decision.reversibility === 'irreversible' ? 'is-irreversible' : ''} ${focusId === decision.id ? 'is-focused' : ''}`,
      },
      h(
        'header',
        { class: 'decision-head' },
        h('div', null, h('h3', null, decision.title), h('p', { class: 'muted tiny' }, `${formatDate(decision.date)} · ${decision.reversibility === 'irreversible' ? 'irreversible' : 'reversible'}`)),
        h(
          'div',
          { class: 'row-gap' },
          badge(decision.chosen ? 'decided' : 'open', decision.chosen ? 'good' : 'caution'),
          decision.reviewedOn
            ? badge(`reviewed · ${decision.outcome}`, OUTCOME_TONE[decision.outcome])
            : rev.state === 'overdue'
              ? badge(`${rev.overdueDays}d overdue`, 'bad')
              : rev.state === 'soon'
                ? badge(rev.daysUntil === 0 ? 'review today' : `review in ${rev.daysUntil}d`, 'caution')
                : null,
        ),
      ),
      decision.question ? h('p', { class: 'decision-question' }, decision.question) : null,
      h(
        'dl',
        { class: 'daci' },
        ...DACI_ROLES.map((role) =>
          h('div', { class: 'daci-row' }, h('dt', null, role.label), h('dd', { class: decision[role.key] || (role.key === 'informed' ? '' : null) ? '' : 'muted' }, decision[role.key] || '—')),
        ),
      ),
      decision.options.length
        ? h('ul', { class: 'option-list' }, ...decision.options.map((o) => h('li', { class: o.label === decision.chosen ? 'is-chosen' : '' }, h('strong', null, o.label), o.pros ? h('span', { class: 'muted tiny' }, ` + ${o.pros}`) : null, o.cons ? h('span', { class: 'muted tiny' }, ` − ${o.cons}`) : null)))
        : h('p', { class: 'note note-warn' }, 'No options recorded. A single option is a decision someone else already made.'),
      decision.chosen
        ? h(
            'div',
            { class: 'decision-outcome' },
            kv('Decided', decision.chosen),
            decision.rationale ? kv('Why', decision.rationale) : null,
            decision.forecastProbability !== null && decision.forecastProbability !== undefined
              ? kv(
                  'Forecast',
                  decision.reviewedOn && OUTCOME_VALUES[decision.outcome] !== undefined
                    ? `${decision.forecastProbability}% at decision time · Brier ${(((decision.forecastProbability / 100) - OUTCOME_VALUES[decision.outcome]) ** 2).toFixed(2)} (0 is perfect)`
                    : `${decision.forecastProbability}% at decision time · scored at the outcome review`,
                )
              : null,
            decision.reviewedOn
              ? kv('Outcome', `${decision.outcome} (${formatDate(decision.reviewedOn)})${decision.outcomeNotes ? ` — ${decision.outcomeNotes}` : ''}`)
              : kv('Review due', revLine),
          )
        : null,
      h(
        'footer',
        { class: 'goal-card-foot' },
        h('span', { class: `muted tiny ${quality.score < 60 ? 'text-warn' : ''}` }, `Record quality ${quality.score}/100 · ${quality.verdict}`),
        h(
          'div',
          { class: 'row-gap' },
          !decision.chosen ? h('button', { class: 'btn btn-tiny btn-primary', type: 'button', onClick: () => openDecideDialog(ctx, { decision }) }, 'Decide') : null,
          decision.chosen && !decision.reviewedOn
            ? h(
                'button',
                {
                  class: `btn btn-tiny ${rev.state === 'overdue' || rev.state === 'soon' ? 'btn-primary' : 'btn-ghost'}`,
                  type: 'button',
                  onClick: () => openReviewDialog(ctx, { decision }),
                },
                'Review outcome',
              )
            : null,
          h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => openDecisionDialog(ctx, { decision }) }, 'Edit'),
          !hasOpenCase
            ? h(
                'button',
                {
                  class: 'btn btn-tiny btn-ghost',
                  type: 'button',
                  onClick: () => {
                    const built = buildCaseFromUpstreamEntity(state, { sourceType: 'decision', sourceId: decision.id, now });
                    if (built.ok) {
                      openCaseDialog(ctx, {
                        prefill: { ...built.payload, _upstreamLink: { sourceType: 'decision', sourceId: decision.id } },
                        onSaved: (res) => res?.id && ctx.navigate(`#/cases/${res.id}`),
                      });
                    }
                  },
                },
                'Escalate to case',
              )
            : null,
        ),
      ),
      caseLinks.length
        ? h(
            'p',
            { class: 'tiny muted' },
            'Linked operational case: ',
            ...caseLinks.map((l, idx) =>
              h(
                'span',
                null,
                idx > 0 ? ' · ' : '',
                h('a', { class: 'link', href: l.peer.route }, `${l.peer.title} (${l.peer.status}) →`),
              ),
            ),
          )
        : null,
      h(
        'details',
        { class: 'quality-details' },
        h('summary', null, 'What makes this record complete?'),
        h('ul', { class: 'plain-list' }, ...quality.checks.map((c) => h('li', null, h('span', { class: c.met ? 'text-good' : 'text-warn' }, c.met ? '✓ ' : '✗ '), h('strong', null, c.label), h('span', { class: 'muted' }, ` — ${c.why}`)))),
      ),
    );
  };

  return h(
    'div',
    { class: 'page' },
    pageHeader({
      title: 'Decisions',
      subtitle: 'Who decided, what was considered, and when to look again.',
      actions: [
        h('a', { class: 'btn btn-ghost', href: '#/scenarios' }, 'What-if sandbox'),
        h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openDecisionDialog(ctx) }, 'Log a decision'),
      ],
    }),
    h(
      'div',
      { class: 'stat-row' },
      stat({ label: 'Logged', value: summary.total, hint: `${summary.irreversible} irreversible` }),
      stat({ label: 'Still open', value: summary.open, hint: 'no decision recorded', tone: summary.open ? 'warn' : 'good' }),
      stat({
        label: 'Reviews due',
        value: dueQueue.length,
        hint: summary.reviewsDue.length ? `${summary.reviewsDue.length} overdue` : dueQueue.length ? 'due within 7d' : 'look again',
        tone: summary.reviewsDue.length ? 'bad' : dueQueue.length ? 'warn' : 'good',
      }),
      stat({ label: 'Judged good', value: summary.hitRate === null ? '—' : `${summary.hitRate}%`, hint: `${summary.reviewed} reviewed` }),
    ),
    h('div', { class: 'filter-bar' }, tabs({
      items: [
        { key: 'all', label: 'All', count: summary.total },
        { key: 'open', label: 'Open', count: summary.open },
        { key: 'review', label: 'Reviews due', count: dueQueue.length },
        { key: 'closed', label: 'Decided', count: summary.decided },
      ],
      active: focusId ? 'all' : filter,
      onSelect: (key) => ctx.navigate(`#/decisions${key === 'all' ? '' : `?filter=${key}`}`),
      ariaLabel: 'Filter decisions',
    })),
    focusId
      ? h(
          'p',
          { class: 'filter-note' },
          `${rows.length} matching decision${rows.length === 1 ? '' : 's'}. `,
          h('a', { href: '#/decisions' }, 'Clear filters'),
        )
      : null,
    !focusId && open.length && filter === 'all'
      ? card({
          title: 'Waiting on you',
          subtitle: 'An undecided choice blocks whoever is waiting on it.',
          body: h('ul', { class: 'plain-list' }, ...open.slice(0, 5).map((d) => h('li', null, h('span', null, d.title), h('span', { class: 'muted tiny' }, ` · open ${d.ageDays} days`), h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => openDecideDialog(ctx, { decision: d }) }, 'Decide')))),
        })
      : null,
    !focusId && dueQueue.length && filter !== 'review'
      ? card({
          title: 'Reviews due',
          subtitle: 'Judge the decision with the information available at the time.',
          body: h(
            'ul',
            { class: 'plain-list' },
            ...dueQueue.map(({ decision: d, review: r }) =>
              h(
                'li',
                null,
                h('span', null, d.title),
                h(
                  'span',
                  { class: 'muted tiny' },
                  r.state === 'overdue'
                    ? ` · review was due ${r.overdueDays}d ago`
                    : r.daysUntil === 0
                      ? ' · review due today'
                      : ` · review due in ${r.daysUntil}d`,
                ),
                h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => openReviewDialog(ctx, { decision: d }) }, 'Review'),
              ),
            ),
          ),
        })
      : null,
    rows.length
      ? h('div', { class: 'decision-list' }, ...rows.map(cardFor))
      : emptyState({
          title: state.decisions.length ? 'Nothing in this view' : 'No decisions logged',
          body: state.decisions.length
            ? 'Choose another tab or clear the filters to inspect all logged decisions.'
            : 'Start with the one you have been putting off.',
          action: focusId || filter !== 'all'
            ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => ctx.navigate('#/decisions') }, 'Show all decisions')
            : h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openDecisionDialog(ctx) }, 'Log a decision'),
        }),
    calibrationCard(ctx),
    card({
      title: 'How the roles work',
      subtitle: 'DACI, in one line each.',
      body: h('dl', { class: 'daci-help' }, ...DACI_ROLES.map((role) => h('div', null, h('dt', null, role.label), h('dd', null, role.help)))),
    }),
    card({
      title: 'Reversibility',
      subtitle: 'The single most useful question before deciding.',
      body: h('dl', { class: 'daci-help' }, ...Object.entries(REVERSIBILITY_HELP).map(([key, help]) => h('div', null, h('dt', null, key === 'reversible' ? 'Reversible' : 'Irreversible'), h('dd', null, help)))),
    }),
  );
}

/**
 * Forecast calibration — the learning loop over the record's own predictions.
 *
 * Five evidence bases, scored with named methods (calibration.js): decision
 * probabilities via Brier (1950) + Murphy (1973), delivery estimates vs their
 * funding-time freeze, FAIR case costs, direction/currency-segmented
 * agreement settlements, and budget commitment accuracy. The card disappears when there is nothing to say; its
 * empirical cohort verdicts remain withheld below n=5.
 */
function negotiationCalibrationReadout(ctx, calibration) {
  if (!calibration.settledCount) return null;
  const openRecord = (negotiationId) => {
    const href = `#/negotiations/${encodeURIComponent(negotiationId)}`;
    return h('a', {
      class: 'link',
      href,
      onClick: (event) => {
        event.preventDefault();
        ctx.navigate(href);
      },
    }, 'Open source agreement');
  };

  return h(
    'div',
    { class: 'stack-sm' },
    h('h3', null, 'Agreement settlement reference class'),
    h(
      'p',
      { class: 'muted small' },
      `${calibration.scoredCount} comparable deal-value settlement(s) across ${calibration.cohorts.length} currency/direction cohort(s). ${calibration.missingActuals ? `${calibration.missingActuals} other settled record(s) lack a comparable positive signed value and explicit realised value. ` : ''}Signed-versus-realised values are manager-entered evidence, not independently audited savings.`,
    ),
    calibration.cohorts.length
      ? h(
          'div',
          { class: 'table-wrap' },
          h(
            'table',
            { class: 'table', 'aria-label': 'Negotiation settlement reference classes by currency and direction' },
            h('caption', { class: 'sr-only' }, 'Settlement reference classes are separated by currency and whether the negotiated issue minimises cost or maximises value'),
            h('thead', null, h('tr', null,
              h('th', { scope: 'col' }, 'Comparable cohort'),
              h('th', { scope: 'col' }, 'Scored n'),
              h('th', { scope: 'col' }, 'Median directional variance'),
              h('th', { scope: 'col' }, 'P80 shortfall'),
              h('th', { scope: 'col' }, 'Delivery evidence'),
              h('th', { scope: 'col' }, 'Source'))),
            h('tbody', null, ...calibration.cohorts.map((cohort) => {
              const worst = cohort.sufficient
                ? cohort.pairs.slice().sort((a, b) => b.shortfallPct - a.shortfallPct)[0]
                : null;
              return h('tr', null,
                h('th', { scope: 'row' }, `${cohort.currency} · ${cohort.direction === 'minimize' ? 'minimise cost' : 'maximise value'}`),
                h('td', null, String(cohort.n)),
                h('td', null, cohort.sufficient
                  ? `${cohort.medianFavorableVariancePct > 0 ? '+' : ''}${cohort.medianFavorableVariancePct}%`
                  : `Counts only (requires n≥${CALIBRATION_MIN_SAMPLES})`),
                h('td', null, cohort.sufficient ? `${cohort.p80ShortfallPct}%` : 'Withheld'),
                h('td', null, cohort.deliveryRate === null
                  ? 'Withheld (fewer than five known outcomes)'
                  : `${Math.round(cohort.deliveryRate * 100)}% (${cohort.deliveryKnownCount} known)`),
                h('td', null, worst ? openRecord(worst.negotiationId) : '—'),
              );
            })),
          ),
        )
      : null,
    calibration.missingItems.length
      ? h(
          'div',
          null,
          h('h3', null, 'Settlements needing comparable actuals'),
          h('p', { class: 'muted small' }, 'These agreements stay outside the scored cohorts until both a positive signed deal value and an explicit realised value are recorded.'),
          h('ul', { class: 'plain-list' }, ...calibration.missingItems.slice(0, 8).map((item) => h(
            'li',
            null,
            h('span', null, item.title),
            h('span', { class: 'muted tiny' }, ` · ${item.reason}`),
            openRecord(item.negotiationId),
          ))),
          calibration.missingItems.length > 8
            ? h('p', { class: 'muted tiny' }, `Showing 8 of ${calibration.missingItems.length} follow-up records.`)
            : null,
        )
      : null,
    calibration.anyMaterialShortfall
      ? h('p', { class: 'note note-warn small' }, 'NEG-09 flags a material median shortfall for review. Investigate baseline comparability, scope, usage and delivery before attributing cause; the system does not change future assumptions.')
      : null,
    h('p', { class: 'muted tiny' }, 'Flyvbjerg (2006) outside-view pattern: cohorts never pool currencies or mix cost-minimising with value-maximising issues. Below n=5, only counts are shown; n=5 and the 20% review trigger are product guardrails, not statistical guarantees.'),
  );
}


function commitmentCalibrationReadout(ctx, calibration) {
  if (!calibration || (!calibration.n && !calibration.missingItems.length)) return null;
  const openBudget = (budgetId) => {
    const href = `#/finance/${encodeURIComponent(budgetId)}`;
    return h('a', {
      class: 'link',
      href,
      onClick: (event) => {
        event.preventDefault();
        ctx.navigate(href);
      },
    }, 'Open budget');
  };
  return h(
    'div',
    { class: 'stack-sm' },
    h('h3', null, 'Budget commitment accuracy'),
    calibration.sufficient
      ? h(
          'p',
          { class: 'muted small' },
          `${calibration.n} scored commitment(s): recorded spend lands at a median ${calibration.medianRatio}x the encumbered amount (P80 ${calibration.p80Ratio}x).${calibration.materialOverrun ? ' FIN-04 flags this systematic overrun for review of estimating practice — an aggregate pattern, never a person score.' : ''}`,
        )
      : h(
          'p',
          { class: 'muted small' },
          `${calibration.n} of ${calibration.minSamples} scored commitments — counts only until the reference class is large enough to quote a median honestly.`,
        ),
    calibration.missingItems.length
      ? h(
          'div',
          null,
          h('h3', null, 'Commitments needing comparable actuals'),
          h('ul', { class: 'plain-list' }, ...calibration.missingItems.slice(0, 8).map((item) => h(
            'li',
            null,
            h('span', null, `${item.budgetName}: ${item.title}`),
            h('span', { class: 'muted tiny' }, ` · ${item.reason}`),
            openBudget(item.budgetId),
          ))),
        )
      : null,
    h('p', { class: 'muted tiny' }, 'Ratios are dimensionless, so they pool across currencies without FX conversion; amounts never do. Recorded committed figures are never rewritten — the reference class informs the next envelope, it does not restate the last one.'),
  );
}

function calibrationCard(ctx) {
  const { state } = ctx;
  const cal = calibrationSummary(state);
  const dec = cal.decisions;
  const est = cal.estimates;
  const caseCal = cal.cases;
  const negotiationCal = cal.negotiations;
  const commitmentCal = cal.commitments;
  const hasAnything = cal.anyEvidence || est.missingActuals > 0 || caseCal.missingActuals > 0 || dec.reviewedTotal > 0 || negotiationCal.settledCount > 0;
  if (!hasAnything) return null;

  const worstMisses = est.pairs
    .slice()
    .sort((a, b) => Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1))
    .slice(0, 8);

  return card({
    title: 'Forecast calibration',
    subtitle: 'Whether this record’s predictions deserve trust — scored against outcomes, not impressions.',
    body: h(
      'div',
      null,
      h(
        'div',
        { class: 'stat-row' },
        stat({
          label: 'Brier score',
          value: dec.brier === null ? '—' : `${dec.brier}`,
          hint: dec.n ? `${dec.n} scored forecast(s) · 0 is perfect` : 'no scored forecasts yet',
          tone: dec.brier !== null && dec.brier > 0.25 ? 'bad' : dec.brier !== null && dec.brier > 0.15 ? 'warn' : 'good',
        }),
        stat({
          label: 'Forecast bias',
          value: dec.biasPp === null ? '—' : `${dec.biasPp > 0 ? '+' : ''}${dec.biasPp}pp`,
          hint: dec.n ? `said ${Math.round((dec.meanForecast ?? 0) * 100)}%, outcomes ran ${Math.round((dec.observedRate ?? 0) * 100)}%` : 'awaiting scored reviews',
        }),
        stat({
          label: 'Estimate ratio',
          value: est.medianRatio === null ? '—' : `${est.medianRatio}×`,
          hint: est.n ? `median actual ÷ forecast (n=${est.n})` : 'no delivered actuals yet',
          tone: est.medianRatio !== null && est.medianRatio >= 1.25 ? 'warn' : 'good',
        }),
        stat({
          label: 'Range honesty',
          value: est.withinRangeRate === null ? '—' : `${Math.round(est.withinRangeRate * 100)}%`,
          hint: 'actuals inside optimistic–pessimistic',
          tone: est.withinRangeRate !== null && est.withinRangeRate < 0.6 ? 'warn' : 'good',
        }),
      ),
      h('h3', null, 'Decision forecasts ', h('span', { class: 'muted tiny' }, `— ${dec.verdict.label}`)),
      h('p', { class: 'small' }, dec.verdict.detail),
      dec.pendingForecasts
        ? h('p', { class: 'muted small' }, `${dec.pendingForecasts} forecast(s) are recorded and awaiting their outcome reviews — each review you complete sharpens this curve.`)
        : null,
      dec.n ? calibrationChart(dec) : null,
      dec.sufficient && dec.murphy.reliability !== null
        ? h(
            'p',
            { class: 'muted small' },
            `Murphy (1973) decomposition: reliability ${dec.murphy.reliability} (calibration error — lower is better) · resolution ${dec.murphy.resolution} (discrimination — higher is better) · uncertainty ${dec.murphy.uncertainty} (base-rate variance no forecaster controls)${dec.brierBand ? ` · ${dec.brierBand.label}` : ''}.`,
          )
        : null,
      h('h3', null, 'Effort estimates ', h('span', { class: 'muted tiny' }, `— ${est.verdict.label}`)),
      h('p', { class: 'small' }, est.verdict.detail),
      est.intervalVerdict ? h('p', { class: 'small' }, h('strong', null, `${est.intervalVerdict.label}. `), est.intervalVerdict.detail) : null,
      est.schedule.n
        ? h('p', { class: 'muted small' }, `Schedule adherence: ${Math.round((est.schedule.onTimeRate ?? 0) * 100)}% of ${est.schedule.n} targeted item(s) landed on or before target (median slip ${est.schedule.medianSlipDays}d).`)
        : null,
      worstMisses.length
        ? h(
            'div',
            { class: 'table-wrap' },
            h(
              'table',
              { class: 'table', 'aria-label': 'Largest forecast misses on delivered work' },
              h('caption', { class: 'sr-only' }, 'Delivered work ranked by how far its actual effort landed from the forecast frozen when it was funded'),
              h('thead', null, h('tr', null,
                h('th', { scope: 'col' }, 'Delivered work'),
                h('th', { scope: 'col' }, 'Forecast'),
                h('th', { scope: 'col' }, 'Actual'),
                h('th', { scope: 'col' }, 'Ratio'),
                h('th', { scope: 'col' }, 'Scored against'))),
              h('tbody', null,
                ...worstMisses.map((p) =>
                  h('tr', null,
                    h('td', { 'data-label': 'Delivered work' }, p.title),
                    h('td', { 'data-label': 'Forecast' }, `${p.expected}d`),
                    h('td', { 'data-label': 'Actual' }, `${p.actual}d`),
                    h('td', { 'data-label': 'Ratio' }, `${p.ratio}×`),
                    h('td', { 'data-label': 'Scored against' }, p.source === 'snapshot' ? 'funding-time snapshot' : 'current estimate (pre-v21)')),
                )),
            ),
          )
        : null,
      est.missingItems.length
        ? h(
            'div',
            null,
            h('h3', null, 'Delivered without actuals'),
            h('p', { class: 'muted small' }, 'These items closed before their actual effort was recorded, so their forecasts cannot be scored. Reconstruct from the record where you can — every scored item sharpens the reference class.'),
            h(
              'ul',
              { class: 'plain-list' },
              ...est.missingItems.slice(0, 6).map((m) => {
                const item = (state.portfolio || []).find((p) => p.id === m.itemId);
                return h(
                  'li',
                  null,
                  h('span', null, m.title),
                  h('span', { class: 'muted tiny' }, ` · forecast ${m.expected}d${m.completedOn ? ` · delivered ${formatDate(m.completedOn)}` : ''}`),
                  item
                    ? h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => openRecordActualsDialog(ctx, { item }) }, 'Record actuals')
                    : null,
                );
              }),
            ),
          )
        : null,
      h('h3', null, 'Case costs ', h('span', { class: 'muted tiny' }, `— ${caseCal.exposure.verdict.label}`)),
      h('p', { class: 'small' }, caseCal.exposure.verdict.detail),
      caseCal.settledCount || caseCal.missingActuals
        ? h(
            'p',
            { class: 'muted small' },
            `${caseCal.settledCount} settled case(s) scored against their opening forecasts${caseCal.exposure.medianRatio !== null ? ` · median exposure development ${caseCal.exposure.medianRatio}×` : ''}${caseCal.occurrence.n ? ` · occurrence ${Math.round(caseCal.occurrence.observedRate * 100)}% vs ${Math.round(caseCal.occurrence.meanAssessedProbability * 100)}% assessed` : ''}${caseCal.missingActuals ? ` · ${caseCal.missingActuals} resolved case(s) still unscored` : ''}. Full ledger on `,
            h(
              'a',
              {
                href: '#/cases',
                onClick: (e) => {
                  e.preventDefault();
                  ctx.navigate('#/cases');
                },
              },
              'Operational cases',
            ),
            '.',
          )
        : null,
      negotiationCalibrationReadout(ctx, negotiationCal),
      commitmentCalibrationReadout(ctx, commitmentCal),
      h(
        'p',
        { class: 'muted tiny' },
        'Methods: Brier (1950) scoring with Murphy (1973) decomposition and reliability quintiles (Tetlock & Gardner, 2015); effort ratios scored against the forecast frozen at funding time (RULE-FCT-01) with Flyvbjerg (2006) reference-class uplifts; case costs scored as FAIR (Freund & Jones, 2015) frequency × magnitude legs against the opening forecast frozen by RULE-FCT-03; agreement settlement variance is segmented by currency and direction (RULE-NEG-07); budget commitments are scored as recorded-actual ÷ encumbered ratios (RULE-FIN-03). Small-sample cohorts show counts only; thresholds are operational guardrails, not inferential guarantees.',
      ),
    ),
  });
}
