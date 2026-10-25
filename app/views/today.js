/**
 * app/views/today.js — the one screen a leader opens on a Monday morning.
 * It answers: how is the team, what should I do next, and who am I neglecting?
 */

import { h, toast } from '../ui/dom.js';
import { pageHeader, card, stat, banner, findingCard, barRow, personChip, emptyState } from '../ui/components.js';
import { onboardingCheckinsCard } from '../ui/onboarding-checkins.js';
import { ringGauge, sparkline } from '../ui/charts.js';
import { teamHealth } from '../core/domain/health.js';
import { buildInsights } from '../core/domain/insights.js';
import { dueMeetings, openActions, leaderObligations, ownershipSummary } from '../core/domain/oneonone.js';
import { aggregate, trend } from '../core/domain/pulse.js';
import { dueGrowthReviews, carriedWillActions } from '../core/domain/growth.js';
import { conflictSummary } from '../core/domain/conflicts.js';
import { reviewsDue, dueDecisionReviews } from '../core/domain/decisions.js';
import { formatDate } from '../core/time.js';
import { openOneOnOneDialog, openPulseDialog, openGrowthReviewDialog, openReviewDialog } from '../ui/modals.js';

export function renderToday(ctx) {
  const { state, now } = ctx;
  const health = teamHealth(state, now);
  const insights = buildInsights(state, now);
  const pulse = aggregate(state, now);
  const series = trend(state, now, { weeks: 8 });
  const due = dueMeetings(state, now, state.settings).slice(0, 4);
  const growthDue = dueGrowthReviews(state, now);
  const decisionDue = dueDecisionReviews(state, now);
  const obligations = leaderObligations(state, { now });
  const owners = ownershipSummary(state, { now });
  const actions = openActions(state, { now }).filter((a) => a.overdue).slice(0, 3);
  const hasPeople = state.people.some((p) => p.status !== 'archived');
  const nextUp = insights.urgent.slice(0, 4);
  const go = (finding) => ctx.navigate(finding.action.route);

  const header = pageHeader({
    title: state.settings.leaderName ? `${greeting(now)}, ${state.settings.leaderName.split(' ')[0]}` : greeting(now),
    subtitle: `${state.settings.teamName}${state.settings.orgName ? ` · ${state.settings.orgName}` : ''} · ${formatDate(now)}`,
    actions: hasPeople
      ? [
          h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openPulseDialog(ctx) }, 'Record pulse'),
          h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openOneOnOneDialog(ctx) }, 'Log a 1:1'),
        ]
      : [h('button', { class: 'btn btn-primary', type: 'button', onClick: () => ctx.navigate('#/people') }, 'Add your team')],
  });

  const notices = [];
  const conflicts = conflictSummary(state, now);
  if (conflicts.attention.length) notices.push(banner({
    tone: 'caution', title: `${conflicts.attention.length} conflict record(s) need a private next step`,
    body: 'Check support, due follow-ups or agreement commitments. Names and case content stay in the conflict workspace, not this overview.',
    actions: [h('a', { class: 'btn btn-small btn-ghost', href: '#/conflicts?filter=attention' }, 'Open conflict workspace')],
  }));
  if (state.meta.isDemo) {
    notices.push(
      banner({
        tone: 'caution',
        title: 'You are looking at a demo workspace',
        body: 'Every person, meeting and number here is fabricated so you can see the app working. Nothing is real until you add your own team.',
        actions: [
          h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => ctx.clearDemo() }, 'Clear demo data'),
          h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => ctx.navigate('#/settings') }, 'Data & export'),
        ],
      }),
    );
  }
  if (ctx.persistError) notices.push(banner({ tone: 'bad', title: 'Changes are not being saved', body: ctx.persistError, actions: [h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => ctx.navigate('#/settings') }, 'Export now')] }));
  if (ctx.warnings?.length && !state.meta.isDemo) {
    notices.push(banner({ tone: 'caution', title: 'Saved data needed repair', body: ctx.warnings.join(' ') }));
  }

  if (!hasPeople) {
    return h(
      'div',
      { class: 'page' },
      header,
      ...notices,
      card({
        body: emptyState({
          title: 'Start with the people you lead',
          body: 'Add your team — names are enough to begin. Everything this app measures (conversation rhythm, feedback, goals, growth, safety) is computed from what you record here.',
          action: h(
            'div',
            { class: 'row-gap' },
            h('button', { class: 'btn btn-primary', type: 'button', onClick: () => ctx.navigate('#/people') }, 'Add your first person'),
            h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => ctx.loadDemo() }, 'Or explore with demo data'),
          ),
          icon: '◈',
        }),
      }),
    );
  }

  const healthCard = card({
    title: 'Team health',
    subtitle: health.label,
    className: 'card-health',
    body: h(
      'div',
      { class: 'health-layout' },
      h(
        'div',
        { class: 'health-ring' },
        ringGauge({ value: health.overall, grade: health.grade, caption: 'out of 100' }),
        health.trend.available
          ? h(
              'p',
              { class: `trend ${health.trend.delta > 0 ? 'trend-up' : health.trend.delta < 0 ? 'trend-down' : ''}` },
              `${health.trend.delta > 0 ? '▲' : health.trend.delta < 0 ? '▼' : '■'} ${Math.abs(health.trend.delta)} pts vs 30 days ago${health.trend.coverageChanged ? ' (matched)' : ''}`,
            )
          : h('p', { class: 'trend muted' }, health.trend.reason || 'Trend not available yet'),
      ),
      h(
        'div',
        { class: 'health-dims' },
        ...health.dimensions.map((dim) =>
          barRow({
            label: dim.label,
            value: dim.score,
            hint: dim.drivers?.length ? dim.drivers.map((d) => `${d.label}: ${d.value}`).join(' · ') : dim.detail,
            onClick: () => ctx.navigate(`#/health?dim=${dim.key}`),
          }),
        ),
      ),
    ),
  });

  /**
   * What the leader owes. This is a deliberately uncomfortable list: the
   * promises a team remembers longest are the ones the manager made and then
   * quietly dropped (RESEARCH §21). It is not a score, and it is not shared
   * with anyone — it is the other half of the ledger the report's promises are
   * tracked in.
   */
  const oweCard = obligations.length
    ? card({
        title: 'What you owe',
        subtitle: obligations.some((a) => a.overdue)
          ? `${obligations.filter((a) => a.overdue).length} past due. A broken promise costs more trust than a promise never made — re-date it, do it, or say you are not going to.`
          : 'Promises you made in a 1:1. Nobody else is tracking these for you.',
        actions: obligations.some((a) => a.overdue)
          ? [h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => ctx.navigate('#/oneonones') }, 'Open the board')]
          : null,
        body: h(
          'ul',
          { class: 'attention-list' },
          ...obligations.slice(0, 5).map((action) => {
            const person = state.people.find((p) => p.id === action.personId);
            return h(
              'li',
              null,
              h(
                'div',
                { class: 'commitment-line' },
                h('span', { class: 'commitment-text' }, action.text),
                h(
                  'span',
                  { class: 'muted tiny' },
                  [
                    person ? person.name : 'Unknown person',
                    action.owner === 'shared' ? 'shared with them' : 'you',
                    action.due ? (action.overdue ? `due ${formatDate(action.due, { withYear: false })} · ${Math.abs(action.daysUntilDue)}d late` : `due ${formatDate(action.due, { withYear: false })}`) : 'no date',
                    action.carryCount ? `carried ${action.carryCount}×` : null,
                  ].filter(Boolean).join(' · '),
                ),
              ),
              h(
                'div',
                { class: 'promise-actions' },
                h('button', {
                  class: 'btn btn-small btn-ghost',
                  type: 'button',
                  onClick: () => {
                    const result = ctx.api.toggleMeetingAction(action.meetingId, action.id);
                    toast(result.ok ? 'Marked done — tell them, do not let them find out' : result.error, result.ok ? 'good' : 'bad');
                  },
                }, 'Done'),
                person
                  ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openOneOnOneDialog(ctx, { personId: person.id }) }, '1:1')
                  : null,
              ),
            );
          }),
        ),
      })
    : owners.unknown
      ? card({
          title: 'What you owe',
          subtitle: 'No promise on record is yours — because none of them names an owner yet.',
          body: h(
            'div',
            { class: 'stack' },
            h(
              'p',
              { class: 'muted small' },
              `${owners.unknown} open promise${owners.unknown === 1 ? '' : 's'} ha${owners.unknown === 1 ? 's' : 've'} no owner. Name one on the 1:1 board: an unowned promise is the one that quietly disappears.`,
            ),
            h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => ctx.navigate('#/oneonones') }, 'Name the owners'),
          ),
        })
      : null;

  const nextCard = card({
    title: 'What to do next',
    subtitle: nextUp.length ? `${insights.urgent.length} item${insights.urgent.length === 1 ? '' : 's'} rated high or urgent. Each one explains why it appeared.` : 'Nothing urgent. That is a result, not a default.',
    actions: [h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => ctx.navigate('#/insights') }, `All ${insights.findings.length} signals`)],
    body: nextUp.length
      ? h('div', { class: 'finding-stack' }, ...nextUp.map((f) => findingCard(f, { onAction: go, compact: true })))
      : emptyState({
          title: 'No high-severity signals',
          body: insights.findings.length ? 'Lower-priority items are still listed on the Signals page.' : 'Log a 1:1 or a pulse response and the checks start running.',
          icon: '✓',
        }),
  });

  const dueCard = card({
    title: '1:1s needing attention',
    subtitle: `Cadence: every ${state.settings.oneOnOneCadenceDays} days.`,
    body: due.length
      ? h(
          'ul',
          { class: 'attention-list' },
          ...due.map(({ person, cadence }) =>
            h(
              'li',
              null,
              personChip(person, {
                onClick: () => ctx.navigate(`#/people/${person.id}`),
                sub: person.role || 'Team member',
                right: h(
                  'span',
                  { class: `badge ${cadence.status === 'overdue' ? 'badge-bad' : cadence.status === 'never' ? 'badge-warn' : 'badge-neutral'}` },
                  cadence.status === 'never' ? 'never met' : cadence.status === 'overdue' ? `${cadence.overdueDays}d overdue` : 'due now',
                ),
              }),
            ),
          ),
        )
      : emptyState({ title: 'Everyone is inside cadence', icon: '✓' }),
  });

  const growthOverdueCount = growthDue.filter((r) => r.review.state === 'overdue').length;
  const growthSoonCount = growthDue.filter((r) => r.review.state === 'soon').length;
  const growthReviewsCard = growthDue.length
    ? card({
        title: 'Development reviews',
        subtitle: growthOverdueCount
          ? `${growthOverdueCount} overdue${growthSoonCount ? ` · ${growthSoonCount} due within 7d` : ''}. Hold the conversation and settle commitments — moving the date is not a review.`
          : growthSoonCount
            ? `${growthSoonCount} due within 7 days. Settle live commitments before the date passes.`
            : 'Active GROW plans with no review date scheduled yet.',
        actions: [
          h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => ctx.navigate('#/growth') }, 'Open growth'),
        ],
        body: h(
          'ul',
          { class: 'attention-list' },
          ...growthDue.slice(0, 4).map(({ plan, person, review, openActions: planOpen, carriedActions }) => {
            const goalLine = plan.goal
              ? (plan.goal.length > 60 ? `${plan.goal.slice(0, 57).trimEnd()}…` : plan.goal)
              : (person.role || 'Team member');
            const subBits = [
              goalLine,
              `${planOpen.length} open`,
              carriedActions.length ? `${carriedActions.length} carried` : null,
              review.deferrals ? `deferred ${review.deferrals}×` : null,
            ].filter(Boolean);
            const badgeText =
              review.state === 'overdue'
                ? `${Math.abs(review.daysUntil)}d overdue`
                : review.state === 'soon'
                  ? review.daysUntil === 0
                    ? 'due today'
                    : `in ${review.daysUntil}d`
                  : 'no date';
            const badgeClass =
              review.state === 'overdue'
                ? 'badge-bad'
                : review.state === 'soon'
                  ? 'badge-caution'
                  : 'badge-warn';
            return h(
              'li',
              null,
              personChip(person, {
                onClick: () => ctx.navigate(`#/people/${person.id}`),
                sub: subBits.join(' · '),
                right: h('span', { class: `badge ${badgeClass}` }, badgeText),
              }),
              h(
                'button',
                {
                  class: `btn btn-small ${review.state === 'overdue' ? 'btn-primary' : 'btn-ghost'}`,
                  type: 'button',
                  onClick: () => openGrowthReviewDialog(ctx, { plan }),
                },
                'Hold review',
              ),
            );
          }),
        ),
      })
    : null;

  const decisionOverdueCount = decisionDue.filter((r) => r.review.state === 'overdue').length;
  const decisionSoonCount = decisionDue.filter((r) => r.review.state === 'soon').length;
  const decisionReviewsCard = decisionDue.length
    ? card({
        title: 'Decision reviews',
        subtitle: decisionOverdueCount
          ? `${decisionOverdueCount} overdue${decisionSoonCount ? ` · ${decisionSoonCount} due within 7d` : ''}. Revisit the call with what was known at the time.`
          : `${decisionSoonCount} due within 7 days. Judge the decision process, not luck alone.`,
        actions: [
          h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => ctx.navigate('#/decisions?filter=review') }, 'Open decisions'),
        ],
        body: h(
          'ul',
          { class: 'attention-list' },
          ...decisionDue.slice(0, 4).map(({ decision, review }) => {
            const subBits = [
              `Chose: ${decision.chosen.length > 48 ? `${decision.chosen.slice(0, 45).trimEnd()}…` : decision.chosen}`,
              decision.approver ? `Approver: ${decision.approver}` : 'No approver named',
              decision.reversibility === 'irreversible' ? 'irreversible' : null,
            ].filter(Boolean);
            const badgeText =
              review.state === 'overdue'
                ? `${review.overdueDays}d overdue`
                : review.daysUntil === 0
                  ? 'due today'
                  : `in ${review.daysUntil}d`;
            const badgeClass = review.state === 'overdue' ? 'badge-bad' : 'badge-caution';
            return h(
              'li',
              null,
              h(
                'div',
                { class: 'commitment-line' },
                h(
                  'button',
                  {
                    class: 'link-btn commitment-text',
                    type: 'button',
                    onClick: () => ctx.navigate(`#/decisions?decision=${encodeURIComponent(decision.id)}`),
                  },
                  decision.title,
                ),
                h('span', { class: 'muted tiny' }, subBits.join(' · ')),
              ),
              h(
                'div',
                { class: 'promise-actions' },
                h('span', { class: `badge ${badgeClass}` }, badgeText),
                h(
                  'button',
                  {
                    class: `btn btn-small ${review.state === 'overdue' ? 'btn-primary' : 'btn-ghost'}`,
                    type: 'button',
                    onClick: () => openReviewDialog(ctx, { decision }),
                  },
                  'Review outcome',
                ),
              ),
            );
          }),
        ),
      })
    : null;

  const pulseCard = card({
    title: 'Safety & load',
    subtitle: `Anonymous pulse · last ${pulse.windowDays} days`,
    actions: [h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => ctx.navigate('#/health') }, 'Open')],
    body: h(
      'div',
      { class: 'pulse-summary' },
      pulse.blocked
        ? h(
            'div',
            null,
            h('p', { class: 'muted' }, pulse.n === 0
              ? 'No responses yet this fortnight.'
              : pulse.blockedReason === 'unanimous'
                ? `${pulse.n} responses with an identical answer slice — this window is hidden to avoid revealing individual answers.`
                : `${pulse.usableResponses} complete response(s) so far — ${pulse.minRequired} are needed before any aggregate is shown. The floor reduces exposure; it does not guarantee anonymity.`),
            h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => openPulseDialog(ctx) }, 'Record a response'),
          )
        : h(
            'div',
            { class: 'pulse-numbers' },
            stat({ label: 'Overall', value: `${pulse.overall}/5`, hint: `${pulse.n} responses` }),
            stat({ label: 'Safety', value: `${pulse.dimensions.safety.avg}/5`, hint: pulse.dimensions.safety.avg < 3 ? 'below the line' : 'healthy', tone: pulse.dimensions.safety.avg < 3 ? 'bad' : '' }),
            stat({ label: 'Load', value: `${pulse.dimensions.workload.avg}/5`, hint: pulse.dimensions.workload.avg < 3 ? 'overloaded' : 'sustainable', tone: pulse.dimensions.workload.avg < 3 ? 'warn' : '' }),
            sparkline(series.map((s) => s.overall), { width: 110, height: 34 }),
          ),
    ),
  });

  const looseEnds = [];
  for (const row of due) {
    if (row.cadence.status === 'never') {
      looseEnds.push({ text: `You have never logged a 1:1 with ${row.person.name}`, action: () => openOneOnOneDialog(ctx, { personId: row.person.id }) });
    }
  }
  for (const action of actions) {
    looseEnds.push({ text: `Overdue action: “${action.text}”`, action: () => ctx.navigate(`#/people/${action.personId}`) });
  }
  const decisionReviews = reviewsDue(state, now);
  if (decisionReviews.length) {
    looseEnds.push({ text: `${decisionReviews.length} decision review${decisionReviews.length === 1 ? '' : 's'} due`, action: () => ctx.navigate('#/decisions?filter=review') });
  }
  const staleWill = state.growthPlans
    .filter((p) => p.status === 'active')
    .flatMap((plan) => carriedWillActions(plan, now).filter((action) => action.carryCount >= 2));
  if (staleWill.length) {
    looseEnds.push({
      text: `${staleWill.length} development commitment${staleWill.length === 1 ? ' has' : 's have'} been carried forward twice or more`,
      action: () => ctx.navigate('#/growth'),
    });
  }

  const looseEndsCard = looseEnds.length
    ? card({
        title: 'Loose ends',
        subtitle: 'Small things that are already late.',
        body: h(
          'ul',
          { class: 'plain-list' },
          ...looseEnds.slice(0, 5).map((item) =>
            h('li', null, h('button', { class: 'link-btn', type: 'button', onClick: item.action }, item.text)),
          ),
        ),
      })
    : null;

  const winsCard = insights.wins.length
    ? card({
        title: 'What is working',
        subtitle: 'Evidence, not encouragement.',
        body: h(
          'ul',
          { class: 'win-list' },
          ...insights.wins.map((w) => h('li', null, h('strong', null, w.title), h('span', { class: 'muted' }, w.detail))),
        ),
      })
    : null;

  return h(
    'div',
    { class: 'page' },
    header,
    ...notices,
    h('div', { class: 'grid grid-today' }, healthCard, nextCard, oweCard, dueCard, growthReviewsCard, decisionReviewsCard, onboardingCheckinsCard(ctx, { limit: 4 }), pulseCard, looseEndsCard, winsCard),
  );
}

function greeting(now) {
  const hour = now.getUTCHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
