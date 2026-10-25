/**
 * app/views/health.js — the pulse: aggregate, trend, and the privacy rules
 * that make the data trustworthy.
 */

import { h } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner } from '../ui/components.js';
import { pulseChart, trendChart, latencyChart } from '../ui/charts.js';
import { aggregate, trend, participation, comments, delta } from '../core/domain/pulse.js';
import { DIMENSIONS, teamHealth } from '../core/domain/health.js';
import { TREND_HORIZONS, buildTeamTrends } from '../core/domain/trends.js';
import { PULSE_DIMENSIONS, PULSE_LABELS, PULSE_PROMPTS } from '../core/schema.js';
import { formatDate } from '../core/time.js';
import { openPulseDialog, openSettingsDialog } from '../ui/modals.js';

function formatSignedDelta(value, unit = ' pts', invertTone = false) {
  if (typeof value !== 'number') return '—';
  if (value === 0) return `0${unit}`;
  const sign = value > 0 ? '+' : '';
  const text = `${sign}${value}${unit}`;
  const good = invertTone ? value < 0 : value > 0;
  return h('span', { class: good ? 'text-good' : 'text-warn' }, text);
}

export function renderHealth(ctx) {
  const { state, now, query } = ctx;
  const requestedHorizon = query?.get('horizon') || '12w';
  const horizonKey = TREND_HORIZONS[requestedHorizon] ? requestedHorizon : '12w';
  const validDims = new Set(['all', 'overall', ...DIMENSIONS.map((d) => d.key)]);
  const requestedDim = query?.get('dim') || 'all';
  const activeDim = validDims.has(requestedDim) ? requestedDim : 'all';

  const pulse = aggregate(state, now);
  const series = trend(state, now, { weeks: 8 });
  const part = participation(state, now);
  const change = delta(state, now);
  const notes = comments(state, now);
  const health = teamHealth(state, now, { withTrend: false });
  const trends = buildTeamTrends(state, now, { horizon: horizonKey });

  const routeFor = (nextHorizon, nextDim) => {
    const params = new URLSearchParams();
    if (nextHorizon && nextHorizon !== '12w') params.set('horizon', nextHorizon);
    if (nextDim && nextDim !== 'all') params.set('dim', nextDim);
    const qs = params.toString();
    return qs ? `#/health?${qs}` : '#/health';
  };

  const allChartSeries = [
    {
      key: 'overall',
      label: 'Composite health',
      values: trends.points.map((p) => ({
        value: p.overall,
        status: p.status,
        fidelity: p.fidelity,
      })),
    },
    ...trends.dimensions.map((dim) => ({
      key: dim.key,
      label: dim.label,
      values: dim.series.map((pt) => ({
        value: pt.score,
        status: pt.status,
        fidelity: pt.fidelity,
      })),
    })),
  ];

  const visibleChartSeries = activeDim === 'all'
    ? allChartSeries
    : allChartSeries.filter((s) => s.key === activeDim);

  const delegationSeries = [
    {
      key: 'delegation',
      label: 'On-track or completed (%)',
      values: trends.delegations.points.map((pt) => ({
        value: pt.followThroughPct,
        status: pt.status,
        fidelity: pt.fidelity,
      })),
    },
  ];

  const prevDelta = trends.overall.vsPrevious;
  const compositeDeltaText = prevDelta.available
    ? `${prevDelta.delta > 0 ? '+' : ''}${prevDelta.delta} pts vs prior checkpoint${prevDelta.coverageChanged ? ' (matched dimensions)' : ''}`
    : 'needs 2 measured checkpoints';

  const fidelityValue = trends.overall.fidelity === 'approximate'
    ? 'Approximate'
    : trends.overall.fidelity === 'exact'
      ? 'Exact'
      : '—';
  const fidelityHint = trends.overall.fidelity === 'approximate'
    ? 'some past points use undated current fields'
    : trends.overall.fidelity === 'exact'
      ? 'all checkpoints backed by dated snapshots'
      : 'log records to begin tracking';

  const fortnightSubtitle = pulse.blocked
    ? (pulse.blockedReason === 'unanimous' ? 'Suppressed — identical answer slice' : 'Suppressed — too few responses')
    : pulse.incompleteResponses
      ? `${pulse.usableResponses} complete responses (${pulse.n} total)`
      : `${pulse.n} responses`;

  const dimensionRows = PULSE_DIMENSIONS.map((dim) => {
    const value = pulse.dimensions[dim].avg;
    return h(
      'div',
      { class: 'pulse-dim' },
      h('div', { class: 'pulse-dim-head' }, h('span', { class: 'pulse-dim-label' }, PULSE_LABELS[dim]), h('span', { class: `pulse-dim-value ${value !== null && value < 3 ? 'text-bad' : ''}` }, value === null ? 'hidden' : `${value}/5`)),
      h('p', { class: 'muted small' }, PULSE_PROMPTS[dim]),
      value === null ? null : h('div', { class: 'pulse-dim-bar' }, h('span', { style: { width: `${((value - 1) / 4) * 100}%` } })),
    );
  });

  return h(
    'div',
    { class: 'page' },
    pageHeader({
      title: 'Team health & pulse',
      subtitle: `Anonymous by default. Aggregates need ${state.settings.pulseMinResponses} responses before anything is shown.`,
      actions: [
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openSettingsDialog(ctx) }, 'Thresholds'),
        h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openPulseDialog(ctx) }, 'Record a response'),
      ],
    }),
    banner({
      tone: 'info',
      title: 'How the privacy floor works',
      body: `Below ${state.settings.pulseMinResponses} complete responses nothing is reported — not even an average. Identical slices are also suppressed; comments need their own minimum of nonempty responses. With two answers, each person can subtract their own and infer the other. Anonymous responses store no identity value (personId is null), ${ctx.isEncrypted ? 'and this browser copy is encrypted at rest, though plain-text JSON exports remain unencrypted' : 'but local notes and plain-text JSON exports are unencrypted unless passphrase encryption is enabled in Settings'}. This floor cannot guarantee anonymity or independent respondents.`,
    }),
    h(
      'div',
      { class: 'stat-row' },
      stat({ label: 'Responses', value: pulse.n, hint: `in the last ${pulse.windowDays} days`, tone: pulse.blocked ? 'warn' : '' }),
      stat({ label: 'Overall', value: pulse.blocked ? 'hidden' : `${pulse.overall}/5`, hint: pulse.blocked ? pulse.blockedReason === 'unanimous' ? 'identical slice — hidden' : `needs ${Math.max(0, pulse.minRequired - pulse.usableResponses)} more complete replies` : 'mean of all dimensions' }),
      stat({ label: 'Safety', value: pulse.blocked ? 'hidden' : `${pulse.dimensions.safety.avg}/5`, hint: 'raise problems without penalty', tone: !pulse.blocked && pulse.dimensions.safety.avg < 3 ? 'bad' : '' }),
      stat({ label: 'Change', value: change.available ? `${change.overall > 0 ? '+' : ''}${change.overall}` : '—', hint: change.available ? 'vs previous fortnight' : 'needs two readable windows', tone: change.available && change.overall < 0 ? 'warn' : '' }),
    ),
    card({
      title: 'Pulse trend',
      subtitle: 'Weekly means on a 1–5 scale. Gaps mean the week was suppressed, not that nothing changed.',
      body: pulseChart(series, {}),
    }),
    h(
      'div',
      { class: 'grid grid-2' },
      card({
        title: 'This fortnight',
        subtitle: fortnightSubtitle,
        body: pulse.blocked
          ? h(
              'div',
              null,
              h('p', { class: 'muted' }, pulse.n === 0
              ? 'No responses yet.'
              : pulse.blockedReason === 'unanimous'
                ? `${pulse.n} responses contain an identical dimension or overall answer. Releasing the other numbers could reveal that hidden slice, so this window stays hidden.`
                : `${pulse.n} response(s), ${pulse.usableResponses} complete. At least ${pulse.minRequired} complete responses are required; partial imported answers do not count toward the floor.`),
              h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => openPulseDialog(ctx) }, 'Record a response'),
            )
          : h('div', { class: 'pulse-dims' }, ...dimensionRows),
      }),
      card({
        title: 'Participation',
        subtitle: 'A floor, not a headcount.',
        body: h(
          'div',
          null,
          stat({ label: 'Team size', value: part.activePeople }),
          stat({ label: 'Responses', value: part.responses, hint: `${part.anonymousResponses} anonymous · ${part.knownResponders} named` }),
          stat({ label: 'Coverage (floor)', value: `${part.coverageFloorPct}%`, hint: 'anonymous responses cannot be attributed to a person' }),
          h('p', { class: 'muted tiny' }, 'Named responses are shown as named because the responder chose that. Nothing is inferred from an anonymous submission.'),
        ),
      }),
    ),
    card({
      title: 'Longitudinal health & habit trends',
      subtitle: `${trends.horizon.label} (${trends.horizon.description}). Unmeasured periods stay blank rather than zero; composite deltas compare matched dimensions so new data never looks like a fake drop.`,
      body: h(
        'div',
        { class: 'trend-section', 'data-testid': 'health-trends' },
        h(
          'div',
          { class: 'filter-bar trend-controls' },
          h(
            'div',
            { class: 'tabs', role: 'group', 'aria-label': 'Trend horizon' },
            ...Object.values(TREND_HORIZONS).map((item) =>
              h(
                'button',
                {
                  class: `tab ${item.key === horizonKey ? 'is-active' : ''}`,
                  type: 'button',
                  'aria-pressed': item.key === horizonKey ? 'true' : 'false',
                  onClick: () => ctx.navigate(routeFor(item.key, activeDim)),
                },
                item.label,
              ),
            ),
          ),
          h(
            'div',
            { class: 'tabs', role: 'group', 'aria-label': 'Dimension focus' },
            ...[
              { key: 'all', label: 'All series' },
              { key: 'overall', label: 'Composite' },
              ...DIMENSIONS.map((d) => ({ key: d.key, label: d.label })),
            ].map((opt) =>
              h(
                'button',
                {
                  class: `tab ${opt.key === activeDim ? 'is-active' : ''}`,
                  type: 'button',
                  'aria-pressed': opt.key === activeDim ? 'true' : 'false',
                  onClick: () => ctx.navigate(routeFor(horizonKey, opt.key)),
                },
                opt.label,
              ),
            ),
          ),
        ),
        h(
          'div',
          { class: 'stat-row' },
          stat({
            label: 'Composite trend',
            value: prevDelta.available ? `${prevDelta.delta > 0 ? '+' : ''}${prevDelta.delta} pts` : '—',
            hint: compositeDeltaText,
            tone: prevDelta.available && prevDelta.delta < 0 ? 'warn' : '',
          }),
          stat({
            label: 'History fidelity',
            value: fidelityValue,
            hint: fidelityHint,
            tone: trends.overall.fidelity === 'approximate' ? 'warn' : '',
          }),
          stat({
            label: 'Feedback latency',
            value: trends.latency.latestAverageDays !== null ? `${trends.latency.latestAverageDays}d` : '—',
            hint: trends.latency.available
              ? `${trends.latency.deltaDays > 0 ? '+' : ''}${trends.latency.deltaDays}d vs prior (${trends.latency.targetDays}d convention)`
              : `convention ≤ ${trends.latency.targetDays}d · needs 2 windows`,
            tone: trends.latency.latestAverageDays !== null && trends.latency.latestAverageDays > trends.latency.targetDays ? 'warn' : '',
          }),
          stat({
            label: 'Delegation follow-through',
            value: trends.delegations.latestPct !== null ? `${trends.delegations.latestPct}%` : '—',
            hint: trends.delegations.available
              ? `${trends.delegations.deltaPct > 0 ? '+' : ''}${trends.delegations.deltaPct}% vs prior checkpoint`
              : 'active on-track + completed',
            tone: trends.delegations.latestPct !== null && trends.delegations.latestPct < 60 ? 'warn' : '',
          }),
          stat({
            label: 'Shewhart XmR control',
            value: trends.overall.spc?.available
              ? trends.overall.spc.regime === 'common-cause'
                ? 'In control'
                : `${trends.overall.spc.signals.length} signal`
              : 'Building',
            hint: trends.overall.spc?.available
              ? `X̄ ${trends.overall.spc.mean} · Limits [${trends.overall.spc.lnpl}, ${trends.overall.spc.unpl}]`
              : 'Needs ≥4 measured windows',
            tone: trends.overall.spc?.available && trends.overall.spc.regime === 'special-cause-adverse' ? 'warn' : '',
          }),
        ),
        trendChart(trends.points, visibleChartSeries, {
          title: activeDim === 'all'
            ? `Team health dimensions (${trends.horizon.label})`
            : `${visibleChartSeries[0]?.label || 'Health'} (${trends.horizon.label})`,
          unit: '/100',
        }),
        trends.overall.fidelityReasons.length
          ? h(
              'p',
              { class: 'muted small trend-fidelity-note' },
              `Approximate history note: ${trends.overall.fidelityReasons.join(' ')}`,
            )
          : null,
        h(
          'div',
          { class: 'table-wrap' },
          h(
            'table',
            { class: 'table' },
            h(
              'thead',
              null,
              h(
                'tr',
                null,
                h('th', { scope: 'col' }, 'Dimension'),
                h('th', { scope: 'col' }, 'Current'),
                h('th', { scope: 'col' }, 'vs prior'),
                h('th', { scope: 'col' }, `Across ${trends.horizon.label}`),
                h('th', { scope: 'col' }, 'Coverage'),
                h('th', { scope: 'col' }, 'Fidelity'),
              ),
            ),
            h(
              'tbody',
              null,
              ...trends.dimensions.map((dim) =>
                h(
                  'tr',
                  null,
                  h(
                    'th',
                    { scope: 'row' },
                    h(
                      'button',
                      {
                        class: 'link-btn',
                        type: 'button',
                        onClick: () => ctx.navigate(routeFor(horizonKey, activeDim === dim.key ? 'all' : dim.key)),
                      },
                      dim.label,
                    ),
                  ),
                  h(
                    'td',
                    null,
                    typeof dim.latestScore === 'number'
                      ? `${dim.latestScore}/100`
                      : dim.latestStatus === 'suppressed'
                        ? 'Hidden (privacy)'
                        : '—',
                  ),
                  h('td', null, formatSignedDelta(dim.deltaVsPrevious)),
                  h('td', null, formatSignedDelta(dim.deltaOverHorizon)),
                  h(
                    'td',
                    { class: 'muted small' },
                    dim.suppressedCount > 0
                      ? `${dim.measuredPeriods}/${dim.totalPeriods} measured (${dim.suppressedCount} hidden)`
                      : `${dim.measuredPeriods}/${dim.totalPeriods} measured`,
                  ),
                  h(
                    'td',
                    null,
                    dim.fidelity
                      ? badge(dim.fidelity, dim.fidelity === 'exact' ? 'good' : 'warn')
                      : h('span', { class: 'muted' }, '—'),
                  ),
                ),
              ),
            ),
          ),
        ),
        h(
          'div',
          { class: 'grid grid-2 trend-habits-grid' },
          h(
            'div',
            { class: 'habit-panel' },
            h('h3', { class: 'habit-title' }, 'Feedback observation → conversation latency'),
            h(
              'p',
              { class: 'muted small' },
              trends.latency.unmeasuredConversations > 0
                ? `Lower is faster (convention ≤ ${trends.latency.targetDays}d). ${trends.latency.unmeasuredConversations} given note(s) had no observed date and stay excluded rather than counted as 0 days.`
                : `Lower is faster (convention ≤ ${trends.latency.targetDays}d).`,
            ),
            latencyChart(trends.latency.points, { targetDays: trends.latency.targetDays }),
          ),
          h(
            'div',
            { class: 'habit-panel' },
            h('h3', { class: 'habit-title' }, 'Delegation follow-through'),
            h(
              'p',
              { class: 'muted small' },
              `Share of active or newly completed delegations that are inside their due date, unblocked, and checked in within ${trends.delegations.checkinTargetDays} days.`,
            ),
            trendChart(trends.delegations.points, delegationSeries, {
              height: 188,
              title: 'Delegation follow-through',
              unit: '%',
            }),
          ),
        ),
      ),
    }),
    card({
      title: 'Team health detail',
      subtitle: health.label,
      body: h(
        'div',
        { class: 'health-dims' },
        ...health.dimensions.map((dim) =>
          h(
            'div',
            { class: 'dim-detail' },
            h('div', { class: 'dim-detail-head' }, h('strong', null, dim.label), h('span', { class: dim.score === null ? 'muted' : '' }, dim.score === null ? 'not measurable' : `${dim.score}/100`)),
            h('p', { class: 'muted small' }, dim.detail),
            dim.drivers?.length ? h('ul', { class: 'plain-list' }, ...dim.drivers.map((d) => h('li', null, h('span', { class: d.negative ? 'text-warn' : '' }, `${d.label}: ${d.value}`)))) : null,
          ),
        ),
      ),
    }),
    notes.length
      ? card({
          title: 'Comments',
          subtitle: 'Unattributed. Quotes are stored exactly as written.',
          body: h('ul', { class: 'comment-list' }, ...notes.map((c) => h('li', null, h('blockquote', null, c.comment), h('span', { class: 'muted tiny' }, formatDate(c.date))))),
        })
      : null,
  );
}
