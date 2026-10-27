/**
 * app/views/today.js — the one screen a leader opens on a Monday morning.
 * It answers: how is the team, what should I do next, and who am I neglecting?
 */

import { h, toast } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, findingCard, barRow, personChip, emptyState } from '../ui/components.js';
import { onboardingCheckinsCard } from '../ui/onboarding-checkins.js';
import { delegationCheckinsCard } from '../ui/delegation-checkins.js';
import { ringGauge, sparkline } from '../ui/charts.js';
import { teamHealth } from '../core/domain/health.js';
import { buildInsights } from '../core/domain/insights.js';
import { dueMeetings, openActions, leaderObligations, ownershipSummary } from '../core/domain/oneonone.js';
import { aggregate, trend } from '../core/domain/pulse.js';
import { dueGrowthReviews, carriedWillActions } from '../core/domain/growth.js';
import { conflictSummary } from '../core/domain/conflicts.js';
import { dueDelegationCheckins } from '../core/domain/delegations.js';
import { reviewsDue, dueDecisionReviews } from '../core/domain/decisions.js';
import { casesRollup } from '../core/domain/cases.js';
import { changesRollup } from '../core/domain/changes.js';
import { negotiationsRollup } from '../core/domain/negotiation.js';
import { budgetsRollup, formatMoney } from '../core/domain/finance.js';
import { stakeholdersRollup } from '../core/domain/stakeholders.js';
import { forecastIntegrityReport } from '../core/domain/forecastIntegrity.js';
import { tempoTodayCard } from './tempo.js';
import { buildResilienceReport } from '../core/domain/resilience.js';
import { pendingIntakeDrafts } from '../core/domain/intake.js';
import { capacitySummary } from '../core/domain/capacity.js';
import { hiringSummary } from '../core/domain/hiring.js';
import { formatDate } from '../core/time.js';
import { openOneOnOneDialog, openPulseDialog, openGrowthReviewDialog, openReviewDialog, openCaseDialog } from '../ui/modals.js';
import { openChangeDialog } from '../ui/change-modals.js';
import { openNegotiationDialog } from '../ui/negotiation-modals.js';

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
  const hasManagerSupport = obligations.some((item) => item.sourceType === 'managerSupport');
  const owners = ownershipSummary(state, { now });
  const actions = openActions(state, { now }).filter((a) => a.overdue).slice(0, 3);
  const delegationFollowup = dueDelegationCheckins(state, now, state.settings);
  const delegationCard = delegationCheckinsCard(ctx, { rows: delegationFollowup, limit: 4 });
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
  const pendingIntake = pendingIntakeDrafts(state, now);
  if (pendingIntake.length) {
    const staleCount = pendingIntake.filter((d) => d.stale).length;
    const stakesCount = pendingIntake.filter((d) => d.analysis?.stakesReviewRequired).length;
    notices.push(banner({
      tone: staleCount || stakesCount ? 'bad' : 'caution',
      title: staleCount
        ? `${staleCount} triaged situation(s) have waited over three days for a routing decision`
        : `${pendingIntake.length} situation note(s) are waiting in intake triage`,
      body: stakesCount
        ? `${stakesCount} carry safety, legal or confidentiality stakes and require your explicit review before routing.`
        : 'The on-device triage engine has prepared confidence-scored case suggestions with full evidence. Confirm, edit or dismiss them so nothing drifts unowned.',
      actions: [h('a', { class: 'btn btn-small btn-primary', href: '#/intake?tab=drafts' }, 'Open intake triage')],
    }));
  }
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
      delegationCard,
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
          ? `${obligations.filter((a) => a.overdue).length} past due. Follow through, or use a real 1:1 to re-date, carry or drop it explicitly.`
          : hasManagerSupport
            ? 'Your manager-owned promises, including follow-ups you explicitly added after a phase check-in.'
            : 'Promises you made in a 1:1. Nobody else is tracking these for you.',
        actions: obligations.some((a) => a.overdue)
          ? [h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => ctx.navigate('#/oneonones') }, 'Open the board')]
          : [],
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
                    action.sourceType === 'managerSupport' ? `manager follow-up · Day ${action.sourceHorizon} check-in` : null,
                    action.due ? (action.overdue ? `due ${formatDate(action.due, { withYear: false })} · ${Math.abs(action.daysUntilDue)}d late` : `due ${formatDate(action.due, { withYear: false })}`) : 'no date',
                    action.carryCount ? `carried ${action.carryCount}×` : null,
                  ].filter(Boolean).join(' · '),
                ),
              ),
              action.sourceType === 'managerSupport'
                ? action.sourceLinkValid
                  ? h('a', { class: 'link tiny', href: `#/onboarding?plan=${encodeURIComponent(action.sourcePlanId || '')}` }, `Open source check-in · ${formatDate(action.sourceHeldOn, { withYear: false })}`)
                  : h('span', { class: 'muted tiny' }, 'Source check-in link unavailable')
                : null,
              h(
                'div',
                { class: 'promise-actions' },
                h('button', {
                  class: 'btn btn-small btn-ghost',
                  type: 'button',
                  onClick: () => {
                    const result = action.sourceType === 'managerSupport'
                      ? ctx.api.toggleManagerSupportCommitment(action.managerSupportId || action.id, { done: true })
                      : ctx.api.toggleMeetingAction(action.meetingId, action.id);
                    toast(result.ok ? 'Marked done — follow through and close the loop' : result.error, result.ok ? 'good' : 'bad');
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


  // Hiring: only when a role is actually open. The queue here is decisions and
  // stalls, not a digest of the hiring page.
  const hiring = (state.requisitions || []).some((r) => ['open', 'offer'].includes(r.status))
    ? hiringSummary(state, { now, settings: state.settings })
    : null;
  const hiringNeedsAttention = Boolean(hiring && (hiring.needsDecision.length || hiring.stalled.length));
  const hiringCard = hiringNeedsAttention
    ? card({
        id: 'hiring',
        title: 'Hiring decisions',
        subtitle: `${hiring.active.length} role(s) open · ${hiring.openCandidates} candidate(s) in process${hiring.vacancyMeasured ? ` · ${hiring.vacancyCurrency} ${hiring.vacancyExposure.toLocaleString('en-US')} recorded vacancy cost` : ''}`,
        actions: [h('a', { class: 'btn btn-small btn-ghost', href: '#/hiring' }, 'Open hiring')],
        body: h(
          'ul',
          { class: 'plain-list' },
          ...hiring.needsDecision.slice(0, 4).map((row) => h(
            'li',
            { class: 'row-between' },
            h('div', null,
              h('a', { class: 'link', href: `#/hiring/${row.requisition.id}?candidate=${row.candidate.id}` },
                `${row.candidate.name}: decide (${row.requisition.title})`),
              h('span', { class: 'muted tiny' }, ` · ${Math.round(row.assessment.audit.posterior * 100)}% evidence estimate · ${row.assessment.audit.band} band`)),
            badge(row.assessment.ready ? 'evidence ready' : 'gaps', row.assessment.ready ? 'good' : 'caution'),
          )),
          ...hiring.stalled.slice(0, 3).map((row) => h(
            'li',
            { class: 'row-between' },
            h('div', null,
              h('a', { class: 'link', href: `#/hiring/${row.requisition.id}` }, `${row.requisition.title}: no movement for ${row.funnel.daysSinceActivity} days`),
              h('span', { class: 'muted tiny' }, row.funnel.vacancy.measured
                ? ` · ${row.funnel.vacancy.days}d empty ≈ ${row.funnel.vacancy.currency} ${row.funnel.vacancy.cost.toLocaleString('en-US')}`
                : ' · vacancy cost unmeasured')),
            badge('stalled', 'bad'),
          )),
        ),
      })
    : null;

  const caseRoll = casesRollup(state, now);
  // Capacity & flow: only when an operating plan exists — an empty plan is not
  // a problem to report on the Monday screen.
  const cap = (state.portfolio || []).length ? capacitySummary(state, now) : null;
  const capNeedsAttention = Boolean(
    cap && cap.model.hasTeam && (
      ['elevated', 'overloaded', 'infeasible'].includes(cap.model.band.id) ||
      cap.forecast.lateTargetCount > 0 ||
      cap.model.demand.wanted.length > 0 ||
      cap.flow.wipBreach
    ),
  );
  const capacityCard = capNeedsAttention
    ? card({
        id: 'capacity-flow',
        title: 'Capacity & flow',
        subtitle: `${Math.round((cap.model.utilisation ?? 0) * 100)}% committed · ${cap.model.slackDays >= 0 ? `${cap.model.slackDays}d spare` : `${Math.abs(cap.model.slackDays)}d deficit`} · queue delay ${cap.flow.delayMultiplier === null ? '—' : `${cap.flow.delayMultiplier}×`}`,
        actions: [
          h('a', { class: 'btn btn-small btn-ghost', href: '#/capacity' }, 'Open plan'),
        ],
        body: h(
          'ul',
          { class: 'plain-list' },
          h('li', { class: 'row-between' },
            h('div', null,
              h('span', null, `${cap.model.band.label}: ${cap.model.demand.committedDays}d committed of ${cap.model.supply.allocatableDays}d`),
              h('span', { class: 'muted tiny' }, ` · ${cap.model.demand.reserveDays}d reserved for incidents`)),
            badge(cap.model.band.label, cap.model.band.tone === 'bad' ? 'bad' : cap.model.band.tone === 'good' ? 'good' : 'caution')),
          cap.model.demand.wanted.length
            ? h('li', null, h('a', { class: 'link', href: '#/capacity' }, `Decide ${cap.model.demand.wanted.length} undecided item(s) worth ${cap.model.demand.wantedDays}d`))
            : null,
          cap.forecast.lateTargetCount
            ? h('li', null, h('a', { class: 'link', href: '#/capacity' }, `${cap.forecast.lateTargetCount} funded commitment(s) cannot meet their target date`))
            : null,
          cap.model.bottleneck && (cap.model.bottleneck.utilisation ?? 0) > 1
            ? h('li', { class: 'row-between' },
                h('span', null, `${cap.model.bottleneck.name} is carrying ${Math.round(cap.model.bottleneck.utilisation * 100)}% of an individual load`),
                badge('bottleneck', 'bad'))
            : null,
        ),
      })
    : null;

  const casesCard = caseRoll.attention.length
    ? card({
        id: 'operational-cases-triage',
        title: 'Operational cases & coalition',
        subtitle: `${caseRoll.highPriority.length} High-priority (FMEA) · ${caseRoll.commsOverdueCount} stakeholder brief(s) overdue.`,
        actions: [
          h('a', { class: 'btn btn-small btn-ghost', href: '#/cases' }, `All ${caseRoll.open.length} open`),
          h('button', { class: 'btn btn-small btn-secondary', type: 'button', onClick: () => openCaseDialog(ctx) }, '+ Case'),
        ],
        body: h(
          'ul',
          { class: 'plain-list' },
          ...caseRoll.attention.slice(0, 4).map((item) =>
            h(
              'li',
              { class: 'row-between' },
              h(
                'div',
                null,
                h(
                  'a',
                  {
                    class: 'link',
                    href: `#/cases/${item.caseRecord.id}`,
                    onClick: (e) => {
                      e.preventDefault();
                      ctx.navigate(`#/cases/${item.caseRecord.id}`);
                    },
                  },
                  item.caseRecord.title,
                ),
                h(
                  'span',
                  { class: 'muted tiny' },
                  ` · RPN ${item.fmea.rpn}${item.coalition.overdueComms.length ? ` · ${item.coalition.overdueComms.length} brief overdue` : ''}`,
                ),
              ),
              badge(item.fmea.actionPriority.toUpperCase(), item.fmea.actionPriority === 'high' ? 'bad' : 'caution'),
            ),
          ),
        ),
      })
    : null;

  const chgRoll = changesRollup(state, now);
  const chgAttention = chgRoll.attention;
  const changesCard = chgAttention.length
    ? card({
        id: 'org-changes-triage',
        title: 'Org design & change execution',
        subtitle: `${chgRoll.open.length} open · ${chgRoll.unmitigatedBlockerCount} severe blocker(s) · ${chgRoll.unalignedVetoCount} veto gap(s).`,
        actions: [
          h('a', { class: 'btn btn-small btn-ghost', href: '#/changes' }, 'Open changes'),
          h('button', { class: 'btn btn-small btn-secondary', type: 'button', onClick: () => openChangeDialog(ctx) }, '+ Change'),
        ],
        body: h(
          'ul',
          { class: 'plain-list' },
          ...chgAttention.slice(0, 4).map((s) =>
            h(
              'li',
              { class: 'row-between' },
              h(
                'div',
                null,
                h(
                  'a',
                  {
                    class: 'link',
                    href: `#/changes/${s.change.id}`,
                    onClick: (e) => {
                      e.preventDefault();
                      ctx.navigate(`#/changes/${s.change.id}`);
                    },
                  },
                  s.change.title,
                ),
                h(
                  'span',
                  { class: 'muted tiny' },
                  ` · Kotter ${s.kotter.completedCount}/8 · Force ${s.forceField.netBalance >= 0 ? '+' : ''}${s.forceField.netBalance}`,
                ),
              ),
              badge(
                s.forceField.equilibrium === 'blocked'
                  ? 'blocked'
                  : s.coalition.unalignedVetoPlayers.length > 0
                    ? 'veto gap'
                    : s.topology.antiPatterns.length > 0
                      ? 'topology risk'
                      : 'attention',
                s.forceField.equilibrium === 'blocked' || s.coalition.unalignedVetoPlayers.length > 0 ? 'bad' : 'caution',
              ),
            ),
          ),
        ),
      })
    : null;


  // Finance: only breaches, watch-zone envelopes and evidenced-actuals gaps
  // reach the Monday screen — a healthy budget is not homework.
  const finRoll = budgetsRollup(state, now);
  const financeCard = finRoll.attention.length
    ? card({
        id: 'finance-triage',
        title: 'Budget & finance',
        subtitle: `${finRoll.breaches.length} forecast breach(es) · ${finRoll.watching.length} in watch zone · ${finRoll.actualsDue.length} actual(s) due.`,
        actions: [
          h('a', { class: 'btn btn-small btn-ghost', href: '#/finance' }, `All ${finRoll.active.length} active`),
        ],
        body: h(
          'ul',
          { class: 'plain-list' },
          ...finRoll.attention.slice(0, 4).map((s) => {
            const ev = s.evaluation;
            const label = ev.breach ? 'breach' : ev.actualsDueLines.length || ev.missingActualLines.length ? 'actuals due' : ev.watch || ev.pipelineBreach ? 'watch' : 'stale';
            return h(
              'li',
              { class: 'row-between' },
              h(
                'div',
                null,
                h(
                  'a',
                  {
                    class: 'link',
                    href: `#/finance/${s.record.id}`,
                    onClick: (e) => {
                      e.preventDefault();
                      ctx.navigate(`#/finance/${s.record.id}`);
                    },
                  },
                  s.record.name,
                ),
                h(
                  'span',
                  { class: 'muted tiny' },
                  ev.hasLimit
                    ? ` · forecast ${formatMoney(s.record.currency, ev.forecastAtCompletion)} of ${formatMoney(s.record.currency, ev.limit)}`
                    : ` · forecast ${formatMoney(s.record.currency, ev.forecastAtCompletion)} (no ceiling)`,
                ),
              ),
              badge(label, ev.breach ? 'bad' : 'caution'),
            );
          }),
        ),
      })
    : null;

  const negRoll = negotiationsRollup(state, now);
  const negotiationsCard = negRoll.attention.length
    ? card({
        id: 'negotiations-triage',
        title: 'Negotiations',
        subtitle: `${negRoll.impasses.length} at impasse · ${negRoll.sessionsOverdue.length} session(s) overdue · ${negRoll.weakPrep.length} under-prepared.`,
        actions: [
          h('a', { class: 'btn btn-small btn-ghost', href: '#/negotiations' }, `All ${negRoll.open.length} open`),
          h('button', { class: 'btn btn-small btn-secondary', type: 'button', onClick: () => openNegotiationDialog(ctx) }, '+ Negotiation'),
        ],
        body: h(
          'ul',
          { class: 'plain-list' },
          ...negRoll.attention.slice(0, 4).map((s) => {
            const label = s.record.status === 'impasse'
              ? 'impasse'
              : s.sessionOverdue
                ? 'session overdue'
                : s.reviewOverdue
                  ? 'review overdue'
                  : s.blockingGaps.some((a) => a.weight >= 4)
                    ? 'no ZOPA'
                    : 'weak prep';
            const tone = s.record.status === 'impasse' || s.sessionOverdue ? 'bad' : 'caution';
            return h(
              'li',
              { class: 'row-between' },
              h(
                'div',
                null,
                h(
                  'a',
                  {
                    class: 'link',
                    href: `#/negotiations/${s.record.id}`,
                    onClick: (e) => {
                      e.preventDefault();
                      ctx.navigate(`#/negotiations/${s.record.id}`);
                    },
                  },
                  s.record.title,
                ),
                h('span', { class: 'muted tiny' }, ` · ${s.record.counterparty || 'counterparty unrecorded'} · prep ${s.prep.completenessPct}%`),
              ),
              badge(label, tone),
            );
          }),
        ),
      })
    : null;

  const stkRoll = stakeholdersRollup(state, now);
  const stakeholdersCard = stkRoll.attention.length
    ? card({
        id: 'stakeholders-triage',
        title: 'Stakeholders',
        subtitle: `${stkRoll.stats.vetoPlayers} veto player(s) · ${stkRoll.stats.definitive} definitive salience · ${stkRoll.reconciliation.unmappedCount} unmapped stub(s).`,
        actions: [
          h('a', { class: 'btn btn-small btn-ghost', href: '#/stakeholders' }, `All ${stkRoll.stats.total} registered`),
        ],
        body: h(
          'ul',
          { class: 'plain-list' },
          ...stkRoll.attention.slice(0, 4).map((item) =>
            h(
              'li',
              { class: 'row-between' },
              h(
                'a',
                {
                  class: 'link',
                  href: `#/stakeholders/${item.record.id}`,
                  onClick: (e) => {
                    e.preventDefault();
                    ctx.navigate(`#/stakeholders/${item.record.id}`);
                  },
                },
                item.record.name,
                h('span', { class: 'muted tiny' }, ` · ${item.title}`),
              ),
              badge(item.severity >= 4 ? 'act now' : 'watch', item.severity >= 4 ? 'bad' : 'caution'),
            )),
        ),
      })
    : null;

  // Decision tempo (Schema v28): the three most expensive open calls, ranked by
  // cost of delay per unit of decision duration, with the verdict the pure
  // engine reached. Renders only when at least one decision is open.
  const tempoCard = tempoTodayCard(ctx);

  const resReport = (state.dependencies || []).length ? buildResilienceReport(state, now) : null;
  const resilienceCard = resReport && resReport.totals.attention > 0
    ? card({
        id: 'resilience-triage',
        title: 'Operational resilience & SPOFs',
        subtitle: [
          resReport.teamBus.measured ? `Portfolio Bus Factor ${resReport.teamBus.portfolioBusFactor}` : null,
          `${resReport.totals.shortfalls} survival shortfall(s)`,
          `${resReport.totals.humanSpofs} Bus-Factor ≤ 1`,
        ].filter(Boolean).join(' · '),
        actions: [h('a', { class: 'btn btn-small btn-ghost', href: '#/resilience' }, 'Open terminal')],
        body: h(
          'ul',
          { class: 'plain-list' },
          ...resReport.attentionRows.slice(0, 4).map((r) =>
            h(
              'li',
              { class: 'row-between' },
              h(
                'a',
                {
                  class: 'link',
                  href: `#/resilience/${r.dependency.id}`,
                  onClick: (e) => {
                    e.preventDefault();
                    ctx.navigate(`#/resilience/${r.dependency.id}`);
                  },
                },
                r.dependency.name,
                h(
                  'span',
                  { class: 'muted tiny' },
                  ` · BF ${r.stewardship.busFactor}${r.metrics.hasAnyShortfall ? ` · +${r.metrics.cascadingShortfallDays}d gap` : ''}`,
                ),
              ),
              badge(
                r.metrics.hasAnyShortfall ? 'TTR > TTS' : r.stewardship.isHumanSpof ? 'SPOF' : 'watch',
                r.metrics.hasAnyShortfall || r.dependency.criticality === 'critical' ? 'bad' : 'warn',
              ),
            ),
          ),
        ),
      })
    : null;

  const fiReport = forecastIntegrityReport(state, now);
  const forecastCard = (fiReport.openChallenges || fiReport.flaggedClasses.length || fiReport.missingActuals.length >= 3)
    ? card({
        id: 'forecast-integrity-triage',
        title: 'Forecast integrity',
        subtitle: `${fiReport.scored.length} scored promise(s) · ${fiReport.flaggedClasses.length} flagged class(es) · ${fiReport.openChallenges} open challenge(s).`,
        actions: [h('a', { class: 'btn btn-small btn-ghost', href: '#/forecasts' }, 'Open terminal')],
        body: h('div', { class: 'stack-sm' },
          h('p', { class: 'small' }, fiReport.verdict.detail),
          fiReport.global.band.sufficient
            ? h('p', { class: 'muted tiny' }, `Pooled ${Math.round(fiReport.global.band.coverageTarget * 100)}% outside-view band: ${fiReport.global.band.lowFactor}×–${fiReport.global.band.highFactor}× recorded (coverage bound ${Math.round(fiReport.global.band.coverageBound * 100)}%, exchangeability assumed).`)
            : h('p', { class: 'muted tiny' }, `Counts only: ${fiReport.global.n}/${fiReport.minSamples} scored ratio outcomes.`),
          h('div', { class: 'row-gap wrap' },
            fiReport.openChallenges ? badge(`${fiReport.openChallenges} challenge(s)`, 'caution') : null,
            fiReport.missingActuals.length ? badge(`${fiReport.missingActuals.length} missing actual(s)`, fiReport.missingActuals.length >= 3 ? 'warn' : 'neutral') : null,
          ),
        ),
      })
    : null;

  return h(
    'div',
    { class: 'page' },
    header,
    ...notices,
    h('div', { class: 'grid grid-today' }, healthCard, nextCard, tempoCard, resilienceCard, oweCard, dueCard, growthReviewsCard, decisionReviewsCard, casesCard, changesCard, negotiationsCard, financeCard, stakeholdersCard, forecastCard, capacityCard, hiringCard, onboardingCheckinsCard(ctx, { limit: 4 }), delegationCard, pulseCard, looseEndsCard, winsCard),
  );
}

function greeting(now) {
  const hour = now.getUTCHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
