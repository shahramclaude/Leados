/**
 * app/views/decisions.js — the decision log, DACI roles, and outcome reviews.
 */

import { h } from '../ui/dom.js';
import { pageHeader, card, stat, badge, emptyState, kv, tabs } from '../ui/components.js';
import { decisionsSummary, decisionQuality, openDecisions, reviewsDue, DACI_ROLES, REVERSIBILITY_HELP } from '../core/domain/decisions.js';
import { formatDate } from '../core/time.js';
import { openDecisionDialog, openDecideDialog, openReviewDialog } from '../ui/modals.js';

const OUTCOME_TONE = { good: 'good', mixed: 'caution', bad: 'bad', pending: 'neutral' };

export function renderDecisions(ctx) {
  const { state, now } = ctx;
  const summary = decisionsSummary(state, now);
  const filter = ctx.query.get('filter') || 'all';
  const open = openDecisions(state, now);
  const due = reviewsDue(state, now);

  let rows = state.decisions.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  if (filter === 'open') rows = rows.filter((d) => !d.chosen);
  if (filter === 'review') rows = rows.filter((d) => d.reviewOn && !d.reviewedOn);
  if (filter === 'closed') rows = rows.filter((d) => d.chosen);

  const cardFor = (decision) => {
    const quality = decisionQuality(decision);
    return h(
      'article',
      { class: `decision-card ${decision.reversibility === 'irreversible' ? 'is-irreversible' : ''}` },
      h(
        'header',
        { class: 'decision-head' },
        h('div', null, h('h3', null, decision.title), h('p', { class: 'muted tiny' }, `${formatDate(decision.date)} · ${decision.reversibility === 'irreversible' ? 'irreversible' : 'reversible'}`)),
        h('div', { class: 'row-gap' }, badge(decision.chosen ? 'decided' : 'open', decision.chosen ? 'good' : 'caution'), decision.reviewedOn ? badge(`reviewed · ${decision.outcome}`, OUTCOME_TONE[decision.outcome]) : null),
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
      decision.chosen ? h('div', { class: 'decision-outcome' }, kv('Decided', decision.chosen), decision.rationale ? kv('Why', decision.rationale) : null, decision.reviewedOn ? kv('Outcome', `${decision.outcome}${decision.outcomeNotes ? ` — ${decision.outcomeNotes}` : ''}`) : kv('Review due', decision.reviewOn ? formatDate(decision.reviewOn) : 'no review date')) : null,
      h(
        'footer',
        { class: 'goal-card-foot' },
        h('span', { class: `muted tiny ${quality.score < 60 ? 'text-warn' : ''}` }, `Record quality ${quality.score}/100 · ${quality.verdict}`),
        h(
          'div',
          { class: 'row-gap' },
          !decision.chosen ? h('button', { class: 'btn btn-tiny btn-primary', type: 'button', onClick: () => openDecideDialog(ctx, { decision }) }, 'Decide') : null,
          decision.chosen && !decision.reviewedOn ? h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => openReviewDialog(ctx, { decision }) }, 'Review outcome') : null,
        ),
      ),
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
      stat({ label: 'Reviews due', value: summary.reviewsDue.length, hint: 'look again', tone: summary.reviewsDue.length ? 'warn' : 'good' }),
      stat({ label: 'Judged good', value: summary.hitRate === null ? '—' : `${summary.hitRate}%`, hint: `${summary.reviewed} reviewed` }),
    ),
    h('div', { class: 'filter-bar' }, tabs({
      items: [
        { key: 'all', label: 'All', count: summary.total },
        { key: 'open', label: 'Open', count: summary.open },
        { key: 'review', label: 'Reviews due', count: summary.reviewsDue.length },
        { key: 'closed', label: 'Decided', count: summary.decided },
      ],
      active: filter,
      onSelect: (key) => ctx.navigate(`#/decisions${key === 'all' ? '' : `?filter=${key}`}`),
      ariaLabel: 'Filter decisions',
    })),
    open.length && filter === 'all'
      ? card({
          title: 'Waiting on you',
          subtitle: 'An undecided choice blocks whoever is waiting on it.',
          body: h('ul', { class: 'plain-list' }, ...open.slice(0, 5).map((d) => h('li', null, h('span', null, d.title), h('span', { class: 'muted tiny' }, ` · open ${d.ageDays} days`), h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => openDecideDialog(ctx, { decision: d }) }, 'Decide')))),
        })
      : null,
    due.length && filter !== 'review'
      ? card({
          title: 'Reviews due',
          subtitle: 'Judge the decision with the information available at the time.',
          body: h('ul', { class: 'plain-list' }, ...due.map((d) => h('li', null, h('span', null, d.title), h('span', { class: 'muted tiny' }, ` · review was due ${d.overdueDays}d ago`), h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => openReviewDialog(ctx, { decision: d }) }, 'Review')))),
        })
      : null,
    rows.length
      ? h('div', { class: 'decision-list' }, ...rows.map(cardFor))
      : emptyState({ title: 'No decisions logged', body: 'Start with the one you have been putting off.', action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openDecisionDialog(ctx) }, 'Log a decision') }),
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
