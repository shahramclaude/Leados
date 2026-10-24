/**
 * app/views/people.js — the roster, ordered so neglect is visible first.
 */

import { h } from '../ui/dom.js';
import { pageHeader, card, stat, badge, table, personChip, emptyState, progressBar } from '../ui/components.js';
import { cadence } from '../core/domain/oneonone.js';
import { personFeedbackStats } from '../core/domain/feedback.js';
import { goalsFor, goalHealth } from '../core/domain/goals.js';
import { activePlan } from '../core/domain/growth.js';
import { assess } from '../core/domain/readiness.js';
import { openPersonDialog, openOneOnOneDialog, confirmArchive } from '../ui/modals.js';
import { levelLabel, tenureDays, initials, activePeople } from '../core/domain/people.js';

export function renderPeople(ctx) {
  const { state, now } = ctx;
  const people = activePeople(state);
  const archived = state.people.filter((p) => p.status === 'archived');

  const rows = people
    .map((person) => {
      const cad = cadence(state, person.id, now, state.settings);
      const fb = personFeedbackStats(state, person.id, now, state.settings);
      const goals = goalsFor(state, person.id).filter((g) => g.status === 'active');
      const plan = activePlan(state, person.id);
      const readiness = assess(state, person.id, now, state.settings);
      const risk = (cad.status === 'overdue' || cad.status === 'never' ? 2 : 0) + (fb.isStale ? 1 : 0) + (goals.some((g) => goalHealth(g, now).health !== 'on-track') ? 1 : 0);
      return { person, cad, fb, goals, plan, readiness, risk };
    })
    .sort((a, b) => b.risk - a.risk || a.person.name.localeCompare(b.person.name));

  const attention = rows.filter((r) => r.risk > 0).length;
  const tenure = (person) => {
    const days = tenureDays(person, now);
    if (days === null) return '—';
    if (days < 90) return `${days}d (new)`;
    if (days < 730) return `${Math.round(days / 30)}mo`;
    return `${(days / 365).toFixed(1)}y`;
  };

  const columns = [
    {
      label: 'Person',
      render: (row) =>
        personChip(row.person, {
          sub: `${row.person.role || 'Team member'} · ${levelLabel(row.person.level)}`,
          onClick: () => ctx.navigate(`#/people/${row.person.id}`),
        }),
    },
    { label: 'Tenure', render: (row) => h('span', { class: 'muted' }, tenure(row.person)) },
    {
      label: '1:1',
      render: (row) => {
        const c = row.cad;
        if (c.status === 'never') return badge('never', 'warn');
        if (c.status === 'overdue') return badge(`${c.overdueDays}d late`, 'bad', `Last held ${c.daysSinceHeld} days ago`);
        if (c.status === 'due') return badge('due', 'caution');
        return badge(`in ${c.dueInDays}d`, 'good', `Last held ${c.daysSinceHeld} days ago`);
      },
    },
    {
      label: 'Feedback',
      render: (row) => {
        const fb = row.fb;
        const label = fb.daysSinceGiven === null ? 'never' : `${fb.daysSinceGiven}d ago`;
        return h('span', null, badge(label, fb.isStale ? 'bad' : 'good'), h('span', { class: 'muted tiny' }, ` ${fb.praise}↑ ${fb.constructive}↓`));
      },
    },
    {
      label: 'Goals',
      render: (row) => {
        if (!row.goals.length) return h('span', { class: 'muted' }, 'none');
        const worst = row.goals.map((g) => goalHealth(g, now).health);
        const tone = worst.includes('off-track') ? 'bad' : worst.includes('at-risk') ? 'warn' : 'good';
        return badge(`${row.goals.length} active`, tone);
      },
    },
    {
      label: 'Growth',
      render: (row) => (row.plan ? badge('plan active', 'good') : badge('no plan', 'neutral')),
    },
    {
      label: 'Readiness',
      render: (row) =>
        row.readiness.record
          ? h('span', null, badge(row.readiness.label, row.readiness.supported ? 'neutral' : 'warn', row.readiness.warning || ''))
          : h('span', { class: 'muted' }, '—'),
    },
    {
      label: '',
      render: (row) =>
        h(
          'div',
          { class: 'row-actions' },
          h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => openOneOnOneDialog(ctx, { personId: row.person.id }) }, 'Log 1:1'),
          h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', 'aria-label': `Edit ${row.person.name}`, onClick: () => openPersonDialog(ctx, { person: row.person }) }, 'Edit'),
        ),
    },
  ];

  return h(
    'div',
    { class: 'page' },
    pageHeader({
      title: 'People',
      subtitle: people.length ? `${people.length} on the team · ${attention} with something needing attention` : 'Nobody on the roster yet.',
      actions: [
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openOneOnOneDialog(ctx) }, 'Log a 1:1'),
        h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openPersonDialog(ctx) }, 'Add person'),
      ],
    }),
    people.length
      ? h(
          'div',
          { class: 'stat-row' },
          stat({ label: 'Team size', value: people.length, hint: `${archived.length} archived` }),
          stat({
            label: 'Conversations overdue',
            value: rows.filter((r) => r.cad.status === 'overdue' || r.cad.status === 'never').length,
            hint: `cadence ${state.settings.oneOnOneCadenceDays}d`,
            tone: rows.some((r) => r.cad.status === 'overdue' || r.cad.status === 'never') ? 'warn' : '',
          }),
          stat({
            label: 'Feedback stale',
            value: rows.filter((r) => r.fb.isStale).length,
            hint: `target ${state.settings.feedbackTargetDays}d`,
            tone: rows.some((r) => r.fb.isStale) ? 'warn' : '',
          }),
          stat({ label: 'Without a growth plan', value: rows.filter((r) => !r.plan).length, hint: 'development in motion' }),
        )
      : null,
    people.length ? card({ body: rosterTable(ctx, columns, rows) }) : card({ body: emptyState({ title: 'No one on the roster', body: 'Add the people you lead. A name is enough.', action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openPersonDialog(ctx) }, 'Add person') }) }),
    people.length
      ? card({
          title: 'Coverage at a glance',
          subtitle: 'Who is inside each cadence.',
          body: h(
            'div',
            { class: 'coverage-list' },
            ...rows.map((row) =>
              h(
                'div',
                { class: 'coverage-row' },
                h('span', { class: 'coverage-name' }, row.person.name),
                progressBar(row.cad.adherence === null ? null : Math.round(row.cad.adherence * 100), { label: `1:1 adherence for ${row.person.name}` }),
                h('span', { class: 'muted tiny' }, row.cad.scheduledLast4 ? `${row.cad.heldLast4}/${row.cad.scheduledLast4} recent kept` : 'no meetings'),
              ),
            ),
          ),
        })
      : null,
    archived.length
      ? card({
          title: 'Archived',
          subtitle: 'History is kept; they are excluded from every score.',
          body: h(
            'ul',
            { class: 'plain-list' },
            ...archived.map((person) =>
              h(
                'li',
                null,
                h('strong', null, person.name),
                h('span', { class: 'muted' }, ` · archived ${person.archivedAt ? person.archivedAt.slice(0, 10) : ''}`),
                h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => ctx.api.restorePerson(person.id) }, 'Restore'),
              ),
            ),
          ),
        })
      : null,
  );
}

/**
 * The roster with a client-side filter.
 *
 * Filtering happens in the DOM rather than by re-rendering the route: a
 * re-render on every keystroke would throw away focus and cursor position,
 * which is the difference between a search box people use and one they fight.
 * The URL is kept in sync on change so the filtered view can be bookmarked.
 */
function rosterTable(ctx, columns, rows) {
  const searchId = 'roster-search';
  const status = h('p', { class: 'muted tiny', 'aria-live': 'polite' }, `${rows.length} people`);
  const noMatch = h(
    'p',
    { class: 'empty-inline', hidden: 'hidden' },
    'No one matches that. Clear the box to see the full roster.',
  );

  const withAttrs = rows.map((row) => ({
    ...row,
    attrs: {
      'data-search': `${row.person.name} ${row.person.role || ''} ${row.person.team || ''} ${levelLabel(row.person.level)}`.toLowerCase(),
    },
  }));

  const body = table({ columns, rows: withAttrs });

  const input = h('input', {
    type: 'search',
    id: searchId,
    class: 'input',
    placeholder: 'Search name, role, team or level',
    'aria-label': 'Search the roster',
    autocomplete: 'off',
    onInput: (event) => {
      const term = event.target.value.trim().toLowerCase();
      let shown = 0;
      for (const tr of body.querySelectorAll('tbody tr')) {
        const hit = !term || (tr.getAttribute('data-search') || '').includes(term);
        tr.hidden = !hit;
        if (hit) shown += 1;
      }
      status.textContent = term ? `${shown} of ${rows.length} people match` : `${rows.length} people`;
      noMatch.hidden = !(term && shown === 0);
    },
  });

  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'roster-tools' },
      h('label', { class: 'search-field', for: searchId }, h('span', { class: 'sr-only' }, 'Search the roster'), input),
      status,
    ),
    body,
    noMatch,
  );
}
