/**
 * app/views/readiness.js — succession: who could step into which seat, and
 * whether the evidence supports the claim.
 */

import { h } from '../ui/dom.js';
import { pageHeader, card, stat, badge, personChip, emptyState } from '../ui/components.js';
import { successionGaps, suggestedSeats, EVIDENCE_DEFINITIONS, transitionHandoff } from '../core/domain/readiness.js';
import { KIND_LABELS } from '../core/domain/onboarding.js';
import { formatDate } from '../core/time.js';
import { openReadinessDialog, openOnboardingPlanDialog } from '../ui/modals.js';

export function renderReadiness(ctx) {
  const { state, now } = ctx;
  const seats = successionGaps(state, now, state.settings);
  const suggestions = suggestedSeats(state);
  const trackedSeats = new Set(state.readiness.map((r) => r.seat));
  const untracked = suggestions.filter((s) => !trackedSeats.has(s.seat));

  const covered = seats.filter((s) => !s.gap).length;

  return h(
    'div',
    { class: 'page' },
    pageHeader({
      title: 'Succession & readiness',
      subtitle: 'A rating is a claim. The evidence beside it is what makes the claim safe to rely on.',
      actions: [h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openReadinessDialog(ctx) }, 'Assess someone')],
    }),
    h(
      'div',
      { class: 'stat-row' },
      stat({ label: 'Seats tracked', value: seats.length, hint: `${covered} with a ready successor`, tone: seats.length && covered < seats.length ? 'warn' : '' }),
      stat({ label: 'Gaps', value: seats.filter((s) => s.gap).length, hint: 'no proven back-up', tone: seats.some((s) => s.gap) ? 'bad' : 'good' }),
      stat({ label: 'Unsupported claims', value: seats.reduce((sum, s) => sum + s.unsupported.length, 0), hint: 'rating exceeds evidence', tone: seats.some((s) => s.unsupported.length) ? 'warn' : 'good' }),
      stat({ label: 'Untracked leadership seats', value: untracked.length, hint: 'from role levels', tone: untracked.length ? 'warn' : '' }),
    ),
    seats.length
      ? h(
          'div',
          { class: 'seat-list' },
          ...seats.map((seat) =>
            h(
              'section',
              { class: `seat-card ${seat.gap ? 'is-gap' : 'is-covered'}` },
              h(
                'header',
                { class: 'seat-head' },
                h('div', null, h('h2', null, seat.seat), h('p', { class: 'muted tiny' }, seat.gap ? 'No proven successor' : `${seat.readyNow.length} ready now · ${seat.future.length} in 1–2 years`)),
                h('div', { class: 'row-gap' }, badge(seat.gap ? 'GAP' : 'COVERED', seat.gap ? 'bad' : 'good'), h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => openReadinessDialog(ctx, { seat: seat.seat }) }, 'Add candidate')),
              ),
              h(
                'ul',
                { class: 'candidate-list' },
                ...seat.candidates.map(({ record, person, assessment }) => {
                  const handoff = transitionHandoff(state, record.personId, seat.seat, now, state.settings);
                  return h(
                    'li',
                    { class: 'candidate' },
                    person ? personChip(person, { sub: person.role, onClick: () => ctx.navigate(`#/people/${person.id}`) }) : h('span', null, 'Unknown person'),
                    h(
                      'div',
                      { class: 'candidate-body' },
                      h(
                        'div',
                        { class: 'row-gap' },
                        badge(assessment.label, record.rating === 'ready-now' ? (assessment.supported ? 'good' : 'warn') : record.rating === 'ready-later' ? 'caution' : 'neutral'),
                        handoff.activePlan
                          ? badge(
                              handoff.matchingSeatTransition
                                ? 'In transition (30-60-90)'
                                : `Active ${(KIND_LABELS[handoff.activePlanKind] || '30-60-90').toLowerCase()} plan`,
                              handoff.matchingSeatTransition ? 'good' : 'neutral',
                            )
                          : null,
                        h('span', { class: 'muted tiny' }, `updated ${formatDate(record.updatedAt)}`),
                        handoff.activePlan && person
                          ? h(
                              'a',
                              {
                                class: 'btn btn-tiny btn-ghost',
                                href: `#/onboarding?person=${encodeURIComponent(person.id)}`,
                              },
                              'Open 30-60-90 plan',
                            )
                          : handoff.canStartTransition
                            ? h(
                                'button',
                                {
                                  class: 'btn btn-tiny btn-primary',
                                  type: 'button',
                                  onClick: () => openOnboardingPlanDialog(ctx, handoff.prefill),
                                },
                                'Start transition',
                              )
                            : null,
                        person
                          ? h(
                              'button',
                              {
                                class: 'btn btn-tiny btn-ghost',
                                type: 'button',
                                onClick: () => openReadinessDialog(ctx, { personId: person.id, seat: seat.seat }),
                              },
                              'Edit rating',
                            )
                          : null,
                      ),
                      assessment.warning ? h('p', { class: 'note note-warn' }, assessment.warning) : null,
                      record.notes ? h('p', { class: 'muted small' }, record.notes) : null,
                      h(
                        'ul',
                        { class: 'evidence-checks compact' },
                        ...assessment.evidence.items.map((item) =>
                          h('li', { class: item.met ? 'is-met' : '' }, h('span', { class: 'check-mark', 'aria-hidden': 'true' }, item.met ? '✓' : '·'), h('span', null, item.label, h('span', { class: 'muted tiny' }, ` — ${item.note}`))),
                        ),
                      ),
                    ),
                  );
                }),
              ),
            ),
          ),
        )
      : emptyState({
          title: 'No seats tracked yet',
          body: 'Name the seats that would hurt if they emptied tomorrow, then assess who could step in — with evidence.',
          action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openReadinessDialog(ctx) }, 'Assess someone'),
        }),
    untracked.length
      ? card({
          title: 'Suggested seats',
          subtitle: 'Derived from role levels in your roster.',
          body: h('ul', { class: 'plain-list' }, ...untracked.map((s) => h('li', null, h('span', null, `${s.seat} — ${s.person.name}`), h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => openReadinessDialog(ctx, { personId: s.person.id, seat: s.seat }) }, 'Assess')))),
        })
      : null,
    card({
      title: 'What counts as evidence',
      subtitle: 'All of it comes from records you already keep elsewhere in the app — nothing is inferred from a vibe.',
      body: h('ul', { class: 'plain-list' }, ...EVIDENCE_DEFINITIONS.map((e) => h('li', null, h('strong', null, e.label), h('span', { class: 'muted' }, ` — ${e.detail}`)))),
    }),
  );
}
