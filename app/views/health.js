/**
 * app/views/health.js — the pulse: aggregate, trend, and the privacy rules
 * that make the data trustworthy.
 */

import { h } from '../ui/dom.js';
import { pageHeader, card, stat, banner } from '../ui/components.js';
import { pulseChart } from '../ui/charts.js';
import { aggregate, trend, participation, comments, delta } from '../core/domain/pulse.js';
import { teamHealth } from '../core/domain/health.js';
import { PULSE_DIMENSIONS, PULSE_LABELS, PULSE_PROMPTS } from '../core/schema.js';
import { formatDate } from '../core/time.js';
import { openPulseDialog, openSettingsDialog } from '../ui/modals.js';

export function renderHealth(ctx) {
  const { state, now } = ctx;
  const pulse = aggregate(state, now);
  const series = trend(state, now, { weeks: 8 });
  const part = participation(state, now);
  const change = delta(state, now);
  const notes = comments(state, now);
  const health = teamHealth(state, now, { withTrend: false });

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
      body: `Below ${state.settings.pulseMinResponses} responses nothing is reported — not even an average. With two answers, each person can subtract their own and infer the other. Anonymous responses are stored with no person field at all, so identity cannot be recovered later.`,
    }),
    h(
      'div',
      { class: 'stat-row' },
      stat({ label: 'Responses', value: pulse.n, hint: `in the last ${pulse.windowDays} days`, tone: pulse.blocked ? 'warn' : '' }),
      stat({ label: 'Overall', value: pulse.blocked ? 'hidden' : `${pulse.overall}/5`, hint: pulse.blocked ? `needs ${pulse.minRequired - pulse.n} more` : 'mean of all dimensions' }),
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
        subtitle: pulse.blocked ? (pulse.blockedReason === 'unanimous' ? 'Suppressed — identical answers' : 'Suppressed — too few responses') : `${pulse.n} responses`,
        body: pulse.blocked
          ? h(
              'div',
              null,
              h('p', { class: 'muted' }, pulse.n === 0
              ? 'No responses yet.'
              : pulse.blockedReason === 'unanimous'
                ? `${pulse.n} responses, all identical. An identical aggregate reveals every individual answer, so it is not shown — talk to the team instead.`
                : `${pulse.n} response(s) recorded, below the anonymity floor of ${pulse.minRequired}.`),
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
