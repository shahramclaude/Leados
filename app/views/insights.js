/**
 * app/views/insights.js — every signal, grouped by what it demands of you.
 *
 * Three rules shape this screen:
 *  - Nothing is hidden behind a count: the filter chips always total the list.
 *  - Repetition is collapsed (see rollUpFindings), so a rule that fires for
 *    forty people is one line naming forty people, not forty lines.
 *  - Findings are banded by urgency, not alphabetically, because a list sorted
 *    by anything other than "what happens if I ignore this" is decoration.
 */

import { h } from '../ui/dom.js';
import { pageHeader, findingCard, emptyState, banner } from '../ui/components.js';
import { buildInsights, rollUpFindings, DOMAIN_ORDER } from '../core/domain/insights.js';

const BANDS = [
  { id: 'today', label: 'Act today', hint: 'Someone is being let down right now.', test: (f) => f.severity >= 5 },
  { id: 'week', label: 'This week', hint: 'Real, but not yet a fire.', test: (f) => f.severity === 4 },
  { id: 'watch', label: 'Worth a look', hint: 'Drift that becomes a problem quietly.', test: (f) => f.severity <= 3 },
];

const PER_BAND = 8;

export function renderInsights(ctx) {
  const { state, now } = ctx;
  const insights = buildInsights(state, now);
  const all = rollUpFindings(insights.findings, { threshold: 3 });

  const domain = ctx.query.get('domain') || 'all';
  const sev = ctx.query.get('sev') || 'all';
  const expanded = ctx.query.get('all') === '1';

  const filtered = all.filter((f) => {
    if (domain !== 'all' && f.domain !== domain) return false;
    if (sev === 'urgent' && f.severity < 4) return false;
    if (sev === 'medium' && f.severity !== 3) return false;
    if (sev === 'low' && f.severity > 2) return false;
    return true;
  });

  const setQuery = (key, value) => {
    const params = new URLSearchParams(ctx.query);
    if (!value || value === 'all') params.delete(key);
    else params.set(key, value);
    params.delete('all');
    const qs = params.toString();
    ctx.navigate(`#/insights${qs ? `?${qs}` : ''}`);
  };

  const domains = [
    { key: 'all', label: 'All', count: all.length },
    ...DOMAIN_ORDER.filter((d) => insights.counts[d]).map((d) => ({ key: d, label: d, count: insights.counts[d] })),
  ];

  const rollupCount = all.filter((f) => f.rolledUp).length;
  const sections = BANDS.map((band) => ({ band, items: filtered.filter(band.test) })).filter((s) => s.items.length);

  return h(
    'div',
    { class: 'page' },
    pageHeader({
      eyebrow: 'Signals',
      title: 'What needs you',
      subtitle: `${filtered.length} finding${filtered.length === 1 ? '' : 's'} from the records you have entered. Each carries its rule, its evidence, and one next action.`,
      actions: [
        h('a', { class: 'btn btn-ghost', href: '#/health' }, 'Team health'),
        h('a', { class: 'btn btn-ghost', href: '#/today' }, 'Today'),
      ],
    }),

    !state.people.length && !(state.conflicts || []).length
      ? banner({
          tone: 'info',
          title: 'Nothing to analyse until there are people',
          body: 'Add your team and the app starts scoring cadence, feedback, goals, growth and wellbeing against real records.',
          actions: [h('a', { class: 'btn btn-primary btn-small', href: '#/people' }, 'Add people')],
        })
      : null,

    rollupCount
      ? h(
          'p',
          { class: 'muted tiny rollup-note' },
          `${rollupCount} rule${rollupCount === 1 ? '' : 's'} repeated across more than three people and ${rollupCount === 1 ? 'is' : 'are'} shown as a single line. The names are always listed.`,
        )
      : null,

    h(
      'div',
      { class: 'filter-bar' },
      h(
        'div',
        { class: 'tabs', role: 'tablist', 'aria-label': 'Filter signals by domain' },
        ...domains.map((d) =>
          h(
            'button',
            {
              class: `tab ${domain === d.key ? 'is-active' : ''}`,
              type: 'button',
              role: 'tab',
              'aria-selected': domain === d.key ? 'true' : 'false',
              onClick: () => setQuery('domain', d.key),
            },
            d.label,
            h('span', { class: 'tab-count' }, String(d.count)),
          ),
        ),
      ),
      h(
        'label',
        { class: 'select-inline' },
        h('span', { class: 'field-label' }, 'Severity'),
        h(
          'select',
          { onChange: (e) => setQuery('sev', e.target.value), value: sev, 'aria-label': 'Filter by severity' },
          ...[
            { value: 'all', label: 'All severities' },
            { value: 'urgent', label: 'High and urgent (4–5)' },
            { value: 'medium', label: 'Medium (3)' },
            { value: 'low', label: 'Low (1–2)' },
          ].map((o) => h('option', { value: o.value, selected: sev === o.value ? 'selected' : null }, o.label)),
        ),
      ),
    ),

    sections.length
      ? h(
          'div',
          { class: 'band-stack' },
          ...sections.map(({ band, items }) => {
            const shown = expanded ? items : items.slice(0, PER_BAND);
            const hidden = items.length - shown.length;
            return h(
              'section',
              { class: 'band', 'aria-labelledby': `band-${band.id}` },
              h(
                'div',
                { class: 'band-head' },
                h('h2', { class: 'band-title', id: `band-${band.id}` }, band.label, h('span', { class: 'band-count' }, String(items.length))),
                h('p', { class: 'band-hint' }, band.hint),
              ),
              h('div', { class: 'finding-stack' }, ...shown.map((f) => findingCard(f, { onAction: (finding) => ctx.navigate(finding.action.route) }))),
              hidden > 0
                ? h(
                    'button',
                    {
                      class: 'btn btn-ghost btn-block',
                      type: 'button',
                      onClick: () => {
                        const params = new URLSearchParams(ctx.query);
                        params.set('all', '1');
                        ctx.navigate(`#/insights?${params.toString()}`);
                      },
                    },
                    `Show ${hidden} more in this group`,
                  )
                : null,
            );
          }),
        )
      : emptyState({
          title: filtered.length ? 'Nothing in these bands' : 'No signals',
          body: filtered.length
            ? 'Every remaining finding sits below the severity you selected.'
            : state.people.length
              ? 'Every check is satisfied by the records you have. That is a real result, not an empty page — keep logging and this will stay honest.'
              : 'Add your team, log a 1:1, and the checks will start producing findings.',
          action: h('a', { class: 'btn btn-ghost', href: '#/today' }, 'Back to Today'),
          icon: '✓',
        }),
  );
}
