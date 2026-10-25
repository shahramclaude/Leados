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
      actions: [h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openDecisionDialog(ctx) }, 'Log a decision')],
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
