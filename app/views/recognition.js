/**
 * app/views/recognition.js — the recognition ledger.
 *
 * Recognition is treated as data, not decoration: it is counted per person,
 * checked for drought, and shown next to the behaviour it rewards so the
 * leader can see whether praise is specific or merely frequent.
 */

import { h } from '../ui/dom.js';
import { pageHeader, card, stat, badge, emptyState, personChip } from '../ui/components.js';
import { openRecognitionDialog } from '../ui/modals.js';
import { formatDate, daysBetween } from '../core/time.js';

export function renderRecognition(ctx) {
  const { state, now } = ctx;
  const people = state.people.filter((p) => p.status !== 'archived');
  const items = state.recognition.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const last30 = items.filter((r) => Math.abs(daysBetween(r.date, now)) <= 30);
  const covered = new Set(last30.map((r) => r.personId));

  const byPerson = people
    .map((person) => {
      const mine = items.filter((r) => r.personId === person.id);
      const latest = mine[0] || null;
      return {
        person,
        count: mine.length,
        recent: mine.filter((r) => Math.abs(daysBetween(r.date, now)) <= 30).length,
        daysSince: latest ? Math.abs(daysBetween(latest.date, now)) : null,
      };
    })
    .sort((a, b) => b.recent - a.recent || b.count - a.count);

  return h(
    'div',
    { class: 'page' },
    pageHeader({
      eyebrow: 'Recognition',
      title: 'What you have noticed out loud',
      subtitle: 'Specific, timely recognition of a named behaviour. Praise without detail is noise; this ledger exists to make yours specific.',
      actions: [
        h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openRecognitionDialog(ctx) }, 'Recognise someone'),
      ],
    }),

    h(
      'div',
      { class: 'stat-row' },
      stat({ label: 'Logged', value: items.length, hint: 'all time' }),
      stat({ label: 'Last 30 days', value: last30.length, hint: 'recent moments', tone: last30.length === 0 ? 'warn' : 'good' }),
      stat({
        label: 'People covered',
        value: `${covered.size}/${people.length}`,
        hint: 'received any in 30 days',
        tone: people.length && covered.size < people.length ? 'warn' : '',
      }),
    ),

    h(
      'div',
      { class: 'grid grid-2' },
      card({
        title: 'The ledger',
        subtitle: items.length ? `${items.length} moment${items.length === 1 ? '' : 's'} recorded` : null,
        body: items.length
          ? h(
              'ul',
              { class: 'feed' },
              ...items.slice(0, 40).map((item) =>
                h(
                  'li',
                  { class: 'feed-item' },
                  h(
                    'div',
                    { class: 'feed-head' },
                    personChip(state.people.find((p) => p.id === item.personId), { small: true }),
                    h('span', { class: 'muted tiny' }, formatDate(item.date)),
                    item.public ? badge('shared', 'good') : badge('private', 'neutral'),
                  ),
                  h('p', { class: 'feed-what' }, item.what),
                  item.values?.length
                    ? h('div', { class: 'tag-row' }, ...item.values.map((v) => h('span', { class: 'tag' }, v)))
                    : null,
                ),
              ),
            )
          : emptyState({
              title: 'Nothing recorded yet',
              body: 'Recognition you keep to yourself does not reach anyone. Log the next thing you notice — one sentence about what they did, not how great they are.',
              action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openRecognitionDialog(ctx) }, 'Recognise someone'),
            }),
      }),
      card({
        title: 'Who is being noticed',
        subtitle: 'A drought is easier to see as a row than as a feeling.',
        body: people.length
          ? h(
              'ul',
              { class: 'list' },
              ...byPerson.map((row) =>
                h(
                  'li',
                  { class: 'list-row' },
                  h('span', { class: 'list-main' }, personChip(row.person, { small: true, link: true })),
                  h(
                    'span',
                    { class: 'list-meta' },
                    row.daysSince === null
                      ? badge('never recognised', 'warn')
                      : badge(row.daysSince <= 30 ? `${row.daysSince}d ago` : `${row.daysSince}d — stale`, row.daysSince <= 30 ? 'good' : 'warn'),
                  ),
                ),
              ),
            )
          : emptyState({ title: 'No people yet', body: 'Add your team first — recognition is always about a named person.' }),
      }),
    ),
  );
}
