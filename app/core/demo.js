/**
 * app/core/demo.js — an explicitly labelled demo workspace.
 *
 * This is the ONLY place in the application that fabricates records, it is
 * never loaded automatically, it is marked `meta.isDemo = true`, the UI shows a
 * banner while it is active, and `store.clearDemo()` removes every trace of it.
 * All scoring and insight logic runs on it exactly as it would on real data —
 * the numbers are computed, not written by hand.
 *
 * Deterministic for a given `now`, so the demo is reproducible in tests.
 */

import { addDays, dayKey } from './time.js';
import { createEmptyState, normalizeState } from './schema.js';
import { goalProgress } from './domain/goals.js';
import { buildForecastSnapshot } from './domain/calibration.js';

export function buildDemoState(now = new Date()) {
  const today = dayKey(now);
  const at = (daysAgo) => addDays(today, -daysAgo);
  const ts = (daysAgo) => new Date(`${at(daysAgo)}T09:00:00.000Z`).toISOString();
  let seq = 0;
  const id = (prefix) => `${prefix}-demo-${++seq}`;

  const state = createEmptyState(new Date(ts(120)).toISOString());
  state.meta.isDemo = true;

  const people = [
    { name: 'Priya Natarajan', role: 'Engineering Lead', level: 'lead', startDate: at(700), focus: 'Platform reliability while the team doubles.', talkingPoints: ['On-call load is not sustainable', 'Wants a clearer promotion path for senior engineers'] },
    { name: 'Jordan Alvarez', role: 'Product Manager', level: 'senior', startDate: at(420), focus: 'Own the activation metric end to end.', talkingPoints: ['Wants a decision on the activation definition', 'Asking for a larger design budget this quarter'] },
    { name: 'Mei Lin Chen', role: 'Staff Engineer', level: 'senior', startDate: at(260), focus: 'Technical direction for the billing migration.' },
    { name: 'Samuel Okafor', role: 'Support Team Lead', level: 'manager', startDate: at(38), focus: 'Rebuild the escalation process and the on-call rota.' },
    { name: 'Freya Nilsson', role: 'Data Analyst', level: 'ic', startDate: at(150), focus: 'Make the weekly numbers trustworthy again.' },
  ];
  state.people = people.map((p, i) => ({
    id: `person-demo-${i + 1}`,
    name: p.name,
    role: p.role,
    level: p.level,
    team: 'Platform',
    managerId: null,
    startDate: p.startDate,
    focus: p.focus,
    talkingPoints: p.talkingPoints || [],
    status: 'active',
    createdAt: new Date(ts(120 - i)).toISOString(),
    archivedAt: null,
  }));
  const [priya, jordan, mei, samuel, freya] = state.people.map((p) => p.id);

  // 1:1s — weekly rhythm for most, slipping for Priya, brand new for Samuel.
  const oneOnOne = (personId, daysAgo, status, mood, notes, actions = []) => {
    state.oneOnOnes.push({
      id: id('oo'),
      personId,
      date: at(daysAgo),
      status,
      mood,
      agenda: [
        { id: id('ag'), text: 'Wins since last time', done: true, source: 'suggestion' },
        { id: id('ag'), text: 'Blockers and decisions needed', done: true, source: 'suggestion' },
      ],
      notes,
      actions: actions.map((a) => ({ id: id('ac'), text: a.text, due: a.due, done: a.done, personId, owner: a.owner || null })),
      createdAt: new Date(ts(daysAgo)).toISOString(),
    });
  };

  for (const [offset, status, mood] of [[7, 'held', 4], [14, 'held', 4], [21, 'held', 3], [28, 'held', 4], [35, 'held', 3], [42, 'held', 4], [49, 'held', 3]]) {
    oneOnOne(jordan, offset, status, mood, 'Worked through the activation funnel and the two competing bets.');
  }
  for (const [offset, status, mood] of [[6, 'held', 3], [13, 'held', 3], [20, 'held', 4], [27, 'held', 2], [34, 'held', 3], [41, 'held', 4], [48, 'held', 3]]) {
    oneOnOne(mei, offset, status, mood, 'Billing migration scope; Mei wants more decision authority on schema changes.');
  }
  // Priya: skipped twice, then a rushed one — a real cadence problem.
  oneOnOne(priya, 8, 'skipped', null, 'Moved twice for a customer escalation.');
  oneOnOne(priya, 15, 'skipped', null, 'Skipped — incident review ran over.');
  oneOnOne(priya, 29, 'held', 3, 'Short check-in; reliability load is the main topic.');
  oneOnOne(freya, 5, 'held', 4, 'Data trust work; she asked for pairing on the warehouse model.');
  oneOnOne(freya, 12, 'held', 3, 'Reviewed the weekly metrics definition.');
  oneOnOne(freya, 26, 'held', 3, 'First month check-in.');
  oneOnOne(freya, 33, 'held', 4, 'Warehouse model pairing session.');
  oneOnOne(freya, 40, 'held', 3, 'Set the metric ownership map.');
  // Samuel joined recently and has had exactly one 1:1.
  oneOnOne(samuel, 9, 'held', 4, 'Onboarding plan review; escalation process walkthrough.', [
    { text: 'Draft the new escalation rota', due: at(-3), done: false, owner: 'them' },
  ]);

  // Follow-through history: real chains, so the demo shows a promise that was
  // carried once and then closed, one that has already moved once and is still
  // stuck, and a normal completion confirmed face to face.
  const meetingOn = (personId, daysAgo) => state.oneOnOnes.find((m) => m.personId === personId && m.date === at(daysAgo));
  const addAction = (meeting, id, text, due, owner = null) => {
    const action = { id, text, due, done: false, completedOn: null, personId: meeting.personId, owner };
    meeting.actions.push(action);
    return action;
  };

  const jordan21 = meetingOn(jordan, 21);
  const jordan14 = meetingOn(jordan, 14);
  const jordan7 = meetingOn(jordan, 7);
  const jordanFirst = addAction(jordan21, 'ac-demo-jordan-metric', 'Agree who owns the activation metric', at(14), 'shared');
  const jordanCarried = addAction(jordan14, 'ac-demo-jordan-metric-2', 'Agree who owns the activation metric', at(7), 'shared');
  jordanCarried.carriedFrom = { meetingId: jordan21.id, actionId: jordanFirst.id };
  jordanFirst.carriedToMeetingId = jordan14.id;
  jordanFirst.carriedToActionId = jordanCarried.id;
  jordanCarried.done = true;
  jordanCarried.completedOn = at(7);
  jordanCarried.completedInMeetingId = jordan7.id;

  const mei34 = meetingOn(mei, 34);
  const mei27 = meetingOn(mei, 27);
  // The leader promised to chase legal. It is overdue and carried once, which
  // is exactly the debt the "What you owe" card and CONV-07 exist to surface.
  const meiFirst = addAction(mei34, 'ac-demo-mei-legal', 'Get legal sign-off on the billing data-retention clause', at(27), 'leader');
  const meiCarried = addAction(mei27, 'ac-demo-mei-legal-2', 'Get legal sign-off on the billing data-retention clause', at(6), 'leader');
  meiCarried.carriedFrom = { meetingId: mei34.id, actionId: meiFirst.id };
  meiFirst.carriedToMeetingId = mei27.id;
  meiFirst.carriedToActionId = meiCarried.id;

  const freya12 = meetingOn(freya, 12);
  const freya5 = meetingOn(freya, 5);
  const freyaMap = addAction(freya12, 'ac-demo-freya-map', 'Publish the metric ownership map', at(6), 'them');
  freyaMap.done = true;
  freyaMap.completedOn = at(5);
  freyaMap.completedInMeetingId = freya5.id;

  state.feedback = [
    {
      id: id('fb'), personId: jordan, direction: 'given', kind: 'praise',
      situation: 'In Tuesday’s prioritisation review',
      behavior: 'you rewrote the activation proposal the afternoon after the customer call and brought three options instead of one',
      impact: 'the team made the call in twenty minutes instead of deferring it a week',
      tags: ['ownership'], observedOn: at(5), date: at(4), followUpOn: null, followUpDone: false, createdAt: new Date(ts(4)).toISOString(),
    },
    {
      id: id('fb'), personId: mei, direction: 'given', kind: 'constructive',
      situation: 'During the schema review on Thursday',
      behavior: 'the design doc landed two hours before the meeting with no summary at the top',
      impact: 'four people read it cold and we spent half the session re-establishing context',
      tags: ['communication'], observedOn: at(17), date: at(7), followUpOn: at(-7), followUpDone: false, createdAt: new Date(ts(7)).toISOString(),
    },
    {
      id: id('fb'), personId: mei, direction: 'given', kind: 'praise',
      situation: 'At the billing postmortem',
      behavior: 'you named your own contribution to the outage before anyone else spoke',
      impact: 'it set the tone and the review produced three real fixes rather than defensiveness',
      tags: ['candor', 'leadership'], observedOn: at(19), date: at(18), followUpOn: null, followUpDone: false, createdAt: new Date(ts(18)).toISOString(),
    },
    {
      id: id('fb'), personId: freya, direction: 'given', kind: 'praise',
      situation: 'In the metrics working session',
      behavior: 'you wrote down each definition in plain language and got agreement before building anything',
      impact: 'the weekly report stopped being a recurring argument',
      tags: ['rigour'], observedOn: at(11), date: at(11), followUpOn: null, followUpDone: false, createdAt: new Date(ts(11)).toISOString(),
    },
    {
      id: id('fb'), personId: jordan, direction: 'received', kind: 'constructive',
      situation: 'In our last 1:1',
      behavior: 'you committed to deciding on the onboarding bet by Friday and it is now two weeks later',
      impact: 'the team is doing discovery work that may be thrown away',
      tags: ['decision-making'], observedOn: at(15), date: at(14), followUpOn: at(0), followUpDone: false, createdAt: new Date(ts(14)).toISOString(),
    },
  ];

  const goal = (title, ownerId, scope, dueIn, krs, confidence, lastCheckinDaysAgo, note, coAuthored = null) => {
    const keyResults = krs.map(([t, start, target, current, unit]) => ({
      id: id('kr'), title: t, start, target, current, initialCurrent: start, unit,
    }));
    const g = {
      id: id('goal'), title, description: '', ownerId, scope, coAuthored: ownerId ? coAuthored : null, dueDate: at(-Math.abs(dueIn)),
      keyResults,
      confidence, initialConfidence: 'on-track', status: 'active', completedOn: null, krUpdatedOn: null,
      checkins: lastCheckinDaysAgo === null ? [] : [{
        id: id('chk'),
        date: at(lastCheckinDaysAgo),
        note,
        confidence,
        progressPct: goalProgress({ keyResults }),
        keyResults: keyResults.map((kr) => ({ id: kr.id, current: kr.current })),
      }],
      createdAt: new Date(ts(60)).toISOString(),
    };
    state.goals.push(g);
    return g.id;
  };

  goal('Cut activation time to first value below 10 minutes', jordan, 'person', -40, [
    ['Median time to first value', 26, 10, 21, 'min'],
    ['Onboarding completion', 48, 75, 55, '%'],
  ], 'at-risk', 19, 'Progress is real but the funnel drop is upstream of the work in flight.', true);
  goal('Migrate billing to the new ledger without a customer-visible incident', mei, 'person', -75, [
    ['Accounts migrated', 0, 100, 62, '%'],
    ['Reconciliation mismatches', 40, 0, 6, 'count'],
  ], 'on-track', 5, 'On pace; reconciliation is the remaining risk.', true);
  goal('Rebuild escalation so no P1 sits untouched for more than 30 minutes', samuel, 'person', -60, [
    ['P1 first response under 30m', 55, 95, 60, '%'],
  ], 'at-risk', 21, 'Rota drafted, not yet agreed with support.', false);
  goal('Make the weekly numbers trusted by every team', freya, 'person', -30, [
    ['Metric definitions signed off', 0, 100, 80, '%'],
    ['Report disputes per week', 6, 0, 2, 'count'],
  ], 'on-track', 3, 'Definitions landed; two disputes left.', true);
  goal('Ship the reliability programme', priya, 'person', -90, [
    ['Error budget burn', 3.1, 1, 2.2, 'x'],
  ], 'on-track', 24, 'No check-in for three weeks — calendar has been back-to-back.', false);

  state.delegations = [
    {
      id: id('delegation'), personId: mei,
      title: 'Own the billing migration reconciliation review',
      expectedOutcome: 'A weekly reconciliation review with mismatches explained, owners assigned, and a summary the leader can read in five minutes.',
      authority: 'act-inform',
      support: 'Admin access to the reconciliation dashboard; Priya joins the first review; escalate customer-impacting discrepancies immediately.',
      delegatedOn: at(20), dueOn: at(-3), status: 'active',
      checkins: [{ id: id('dchk'), date: at(8), progress: 'on-track', note: 'The review format works. Mei will add mismatch ageing next week.', createdAt: new Date(ts(8)).toISOString() }],
      completedOn: null, completionNote: '', returnedOn: null, returnReason: '',
      createdAt: new Date(ts(20)).toISOString(), updatedAt: new Date(ts(8)).toISOString(),
    },
    {
      id: id('delegation'), personId: samuel,
      title: 'Own the new P1 escalation rota',
      expectedOutcome: 'Every P1 has a named first responder and backup, with all three support pods agreeing to the rota before launch.',
      authority: 'agree',
      support: 'Pod leads have reserved Thursday for agreement; the leader will resolve any unresolved staffing constraint within one working day.',
      delegatedOn: at(25), dueOn: at(2), status: 'active',
      checkins: [{ id: id('dchk'), date: at(10), progress: 'blocked', note: 'Two pods cannot cover the same weekend. Need a staffing decision before the rota can be agreed.', createdAt: new Date(ts(10)).toISOString() }],
      completedOn: null, completionNote: '', returnedOn: null, returnReason: '',
      createdAt: new Date(ts(25)).toISOString(), updatedAt: new Date(ts(10)).toISOString(),
    },
    {
      id: id('delegation'), personId: freya,
      title: 'Publish the trusted metric-definition library',
      expectedOutcome: 'The weekly metrics have one searchable definition, owner and source of truth, and the team stops maintaining competing copies.',
      authority: 'own',
      support: 'Freya controls the documentation space; Jordan supplies product definitions; the leader handles escalated ownership disputes.',
      delegatedOn: at(45), dueOn: at(20), status: 'done',
      checkins: [{ id: id('dchk'), date: at(25), progress: 'on-track', note: 'All definitions drafted; two ownership questions remain.', createdAt: new Date(ts(25)).toISOString() }],
      completedOn: at(18), completionNote: 'Published 24 signed-off definitions and archived the duplicate team sheets. Remaining follow-up: monthly ownership review.', returnedOn: null, returnReason: '',
      createdAt: new Date(ts(45)).toISOString(), updatedAt: new Date(ts(18)).toISOString(),
    },
    {
      id: id('delegation'), personId: priya,
      title: 'Draft the reliability programme budget',
      expectedOutcome: 'A costed reliability proposal with three sequencing options and an explicit recommendation.',
      authority: 'recommend',
      support: 'Finance provided the current run-rate model and a 30-minute review slot.',
      delegatedOn: at(30), dueOn: at(10), status: 'returned',
      checkins: [{ id: id('dchk'), date: at(20), progress: 'on-track', note: 'Initial option costs collected.', createdAt: new Date(ts(20)).toISOString() }],
      completedOn: null, completionNote: '', returnedOn: at(5), returnReason: 'Finance changed the planning window, so the leader took the budget back to re-scope it centrally. Priya retains the technical sequencing input.',
      createdAt: new Date(ts(30)).toISOString(), updatedAt: new Date(ts(5)).toISOString(),
    },
  ];

  // Mei's plan is the whole ledger in one place: a commitment carried twice and
  // still open, one carried once and now late, one closed in a review, one
  // dropped with a reason, and a review date that has been moved twice since it
  // was held. Every one of those states is reachable from the UI.
  const memoOriginal = id('ac');
  const memoCurrent = id('ac');
  const reviewOriginal = id('ac');
  const reviewMoved = id('ac');
  const reviewCurrent = id('ac');
  const templateDone = id('ac');
  const onCallDropped = id('ac');
  const meiReview = id('gr');

  state.growthPlans = [
    {
      id: id('gp'), personId: mei,
      goal: 'Move from staff engineer to principal: own cross-team technical direction, not just the hardest code.',
      reality: 'Strongest debugger on the team and trusted by peers; the gap is written communication and bringing others along. Two recent design docs landed without a summary.',
      options: [
        { id: id('opt'), text: 'Write a one-page decision memo for every significant design choice for a quarter.' },
        { id: id('opt'), text: 'Shadow Priya in the architecture review for two cycles.' },
      ],
      will: [
        {
          id: memoOriginal, text: 'Publish a decision memo format and use it on the billing migration',
          due: at(30), addedOn: at(40), done: false, personId: mei, delegationId: state.delegations[0].id, carriedToId: memoCurrent,
        },
        {
          id: memoCurrent, text: 'Publish a decision memo format and use it on the billing migration',
          due: at(10), addedOn: at(40), done: false, personId: mei, delegationId: state.delegations[0].id, carriedFromId: memoOriginal,
        },
        {
          id: reviewOriginal, text: 'Co-run one architecture review with Priya',
          due: at(16), addedOn: at(40), done: false, personId: mei, carriedToId: reviewMoved,
        },
        {
          id: reviewMoved, text: 'Co-run one architecture review with Priya',
          due: at(6), addedOn: at(40), done: false, personId: mei,
          carriedFromId: reviewOriginal, carriedToId: reviewCurrent,
        },
        {
          id: reviewCurrent, text: 'Co-run one architecture review with Priya',
          due: at(-14), addedOn: at(40), done: false, personId: mei, carriedFromId: reviewMoved,
        },
        {
          id: templateDone, text: 'Send Priya the memo template for review',
          due: at(20), addedOn: at(40), done: true, completedOn: at(18),
          completedInReviewId: meiReview, personId: mei,
        },
        {
          id: onCallDropped, text: 'Shadow Priya through one on-call rotation',
          due: at(18), addedOn: at(40), done: false, dropped: true, droppedOn: at(18),
          droppedInReviewId: meiReview,
          droppedReason: 'The rotation moved to the platform team, so the shadowing would no longer show what it was meant to.',
          personId: mei,
        },
      ],
      competencies: ['Written communication', 'Influence without authority'],
      reviews: [
        {
          id: meiReview,
          date: at(18),
          notes: 'Walked through the memo format — it is in use on two design docs now. Dropped the on-call shadowing because the rotation moved. Next review set for the week after the billing cutover.',
          nextReviewOn: at(12),
          createdAt: new Date(ts(18)).toISOString(),
        },
      ],
      // Agreed 12 days ago, pushed twice without a review being held.
      reviewOn: at(6),
      reviewDeferrals: 2,
      reviewMovedOn: at(4),
      status: 'active',
      createdAt: new Date(ts(40)).toISOString(),
    },
    {
      id: id('gp'), personId: samuel,
      goal: 'Land the first 90 days: own the escalation process and be trusted by the support team.',
      reality: 'Joined six weeks ago. Strong operations background, no context on the product or the people yet.',
      options: [{ id: id('opt'), text: 'Weekly listening sessions with each support pod for the first month.' }],
      will: [{
        id: id('ac'), text: 'Complete a listening session with all three pods',
        due: at(2), addedOn: at(30), done: false, personId: samuel,
      }],
      competencies: ['Team leadership', 'Process design'],
      reviews: [],
      reviewOn: at(9),
      reviewDeferrals: 0,
      reviewMovedOn: null,
      status: 'active',
      createdAt: new Date(ts(35)).toISOString(),
    },
  ];

  // Pulse: five weeks of responses, anonymous, safety trending down as load rises.
  const pulseWeek = (weeksAgo, entries) => {
    entries.forEach(([scores, personId]) => {
      state.pulses.push({
        id: id('pulse'),
        date: at(weeksAgo * 7 + 1),
        personId: personId || null,
        anonymity: personId ? 'named' : 'anonymous',
        scores,
        comment: '',
        createdAt: new Date(ts(weeksAgo * 7 + 1)).toISOString(),
      });
    });
  };
  pulseWeek(7, [[{ safety: 4, clarity: 5, workload: 4, growth: 4 }], [{ safety: 4, clarity: 4, workload: 4, growth: 4 }], [{ safety: 5, clarity: 4, workload: 4, growth: 4 }]]);
  pulseWeek(6, [[{ safety: 5, clarity: 4, workload: 4, growth: 4 }], [{ safety: 4, clarity: 5, workload: 3, growth: 4 }], [{ safety: 4, clarity: 4, workload: 4, growth: 3 }]]);
  pulseWeek(5, [[{ safety: 4, clarity: 4, workload: 4, growth: 4 }], [{ safety: 5, clarity: 4, workload: 3, growth: 4 }], [{ safety: 4, clarity: 4, workload: 4, growth: 3 }]]);
  pulseWeek(4, [[{ safety: 4, clarity: 4, workload: 4, growth: 4 }], [{ safety: 5, clarity: 3, workload: 3, growth: 4 }], [{ safety: 4, clarity: 4, workload: 3, growth: 3 }], [{ safety: 3, clarity: 4, workload: 2, growth: 3 }]]);
  pulseWeek(3, [[{ safety: 4, clarity: 4, workload: 3, growth: 4 }], [{ safety: 4, clarity: 4, workload: 3, growth: 3 }], [{ safety: 4, clarity: 3, workload: 2, growth: 3 }]]);
  pulseWeek(2, [[{ safety: 3, clarity: 3, workload: 2, growth: 3 }], [{ safety: 3, clarity: 4, workload: 2, growth: 3 }], [{ safety: 2, clarity: 3, workload: 2, growth: 2 }], [{ safety: 4, clarity: 4, workload: 3, growth: 4 }]]);
  // Five responses in the most recent week, one short of the team, so the
  // demo shows a *released* aggregate sitting just above the anonymity floor
  // rather than a permanently suppressed one.
  pulseWeek(0, [
    [{ safety: 3, clarity: 3, workload: 2, growth: 3 }],
    [{ safety: 2, clarity: 3, workload: 1, growth: 2 }],
    [{ safety: 3, clarity: 2, workload: 2, growth: 3 }],
    [{ safety: 3, clarity: 3, workload: 2, growth: 2 }],
    [{ safety: 3, clarity: 3, workload: 3, growth: 3 }],
  ]);

  state.decisions = [
    {
      id: id('dec'),
      title: 'Restructure support into pods',
      question: 'Should support move from a single queue to three product-aligned pods this quarter?',
      date: at(19),
      reversibility: 'reversible',
      driver: 'Priya Natarajan',
      approver: 'Head of Platform',
      contributors: 'Samuel Okafor, Jordan Alvarez',
      informed: 'Support team, Sales',
      options: [
        { id: id('dopt'), label: 'Three product pods', pros: 'Clearer ownership, faster escalation', cons: 'Uneven load while volume is spiky' },
        { id: id('dopt'), label: 'Keep one queue, add a triage rota', pros: 'No disruption', cons: 'Root cause ownership stays unclear' },
      ],
      chosen: '',
      rationale: '',
      reviewOn: at(0),
      reviewedOn: null,
      outcome: 'pending',
      outcomeNotes: '',
      createdAt: new Date(ts(19)).toISOString(),
    },
    {
      id: id('dec'),
      title: 'Freeze new hiring for the quarter',
      question: 'Should we pause two open engineering roles to protect runway?',
      date: at(46),
      reversibility: 'irreversible',
      driver: 'Head of Platform',
      approver: 'CFO',
      contributors: 'Priya Natarajan',
      informed: 'All of Platform',
      options: [
        { id: id('dopt'), label: 'Freeze both roles', pros: 'Protects 3 months of runway', cons: 'Reliability work slows' },
        { id: id('dopt'), label: 'Freeze one role', pros: 'Partial protection', cons: 'Delays the migration' },
      ],
      chosen: 'Freeze both roles',
      rationale: 'Runway moved below the board threshold; reliability work can absorb one quarter of reduced capacity.',
      // Forecast recorded when the call was made; the mixed review scores it
      // (Brier contribution 0.04) so the calibration card has one real pair.
      forecastProbability: 70,
      reviewOn: at(16),
      reviewedOn: at(15),
      outcome: 'mixed',
      outcomeNotes: 'Runway recovered, but on-call load rose and two engineers flagged burnout in the pulse.',
      createdAt: new Date(ts(46)).toISOString(),
    },
    {
      id: id('dec'),
      title: 'Standardise weekly metrics on warehouse tables',
      question: 'Should every team report weekly KPIs from governed warehouse tables instead of team spreadsheets?',
      date: at(24),
      reversibility: 'reversible',
      driver: 'Freya Nilsson',
      approver: 'Head of Platform',
      contributors: 'Jordan Alvarez, Mei Lin Chen',
      informed: 'Platform, Product',
      options: [
        { id: id('dopt'), label: 'Single warehouse source of truth', pros: 'Eliminates competing metric definitions', cons: 'Two-week cutover effort' },
        { id: id('dopt'), label: 'Reconcile spreadsheets monthly', pros: 'Zero migration effort', cons: 'Weekly disputes continue' },
      ],
      chosen: 'Single warehouse source of truth',
      rationale: 'Weekly metric disputes were burning leadership meeting time; Freya already drafted 24 definitions.',
      forecastProbability: 80,
      reviewOn: at(4),
      reviewedOn: null,
      outcome: 'pending',
      outcomeNotes: '',
      createdAt: new Date(ts(24)).toISOString(),
    },
  ];

  state.recognition = [
    {
      id: id('rec'), personId: mei,
      what: 'Owned the billing outage call end to end and published the postmortem within 24 hours.',
      values: ['Ownership', 'Candor'], visibility: 'public', date: at(17),
      createdAt: new Date(ts(17)).toISOString(),
    },
    {
      id: id('rec'), personId: freya,
      what: 'Turned the weekly metrics argument into a signed-off definitions doc.',
      values: ['Rigour'], visibility: 'public', date: at(30),
      createdAt: new Date(ts(30)).toISOString(),
    },
  ];

  state.readiness = [
    { id: id('rd'), personId: mei, seat: 'Principal engineer', rating: 'ready-later', updatedAt: new Date(ts(40)).toISOString() },
    { id: id('rd'), personId: priya, seat: 'Director of Engineering', rating: 'not-ready', updatedAt: new Date(ts(40)).toISOString() },
  ];

  state.onboarding = [
    {
      id: id('onb'),
      personId: samuel,
      kind: 'new-hire',
      label: '',
      startDate: at(38),
      buddyId: priya,
      buddyName: '',
      roleClarity: 'Own the support escalation queue, partner with Platform on incident handoffs, and make the weekly rota sustainable.',
      earlyWin: 'Publish a single-page escalation rota and run two shadow handoffs with Platform.',
      stakeholders: [
        { id: id('onbs'), name: 'Priya Natarajan', purpose: 'Platform incident handoffs and rota pairing', met: true, metOn: at(31) },
        { id: id('onbs'), name: 'Jordan Alvarez', purpose: 'Customer impact priorities during activation launch', met: true, metOn: at(25) },
        { id: id('onbs'), name: 'Mei Lin Chen', purpose: 'Billing migration escalation thresholds', met: false, metOn: null },
      ],
      checkpoints: [
        {
          id: id('onbc'),
          horizon: 30,
          category: 'clarity',
          title: 'Walk through role scope, decision boundaries and what good looks like at 90 days',
          due: at(24),
          done: true,
          completedOn: at(26),
          notes: 'Aligned on support-to-platform escalation boundaries.',
        },
        {
          id: id('onbc'),
          horizon: 30,
          category: 'culture',
          title: 'Agree 1:1 rhythm, communication norms and how feedback flows both ways',
          due: at(8),
          done: false,
          completedOn: null,
          notes: '',
        },
        {
          id: id('onbc'),
          horizon: 60,
          category: 'contribution',
          title: 'Ship the new escalation rota and shadow two Platform incident handoffs',
          due: at(-22),
          done: false,
          completedOn: null,
          notes: '',
        },
        {
          id: id('onbc'),
          horizon: 60,
          category: 'clarity',
          title: 'Exchange explicit 60-day calibration feedback (what is working and one adjustment)',
          due: at(-22),
          done: false,
          completedOn: null,
          notes: '',
        },
        {
          id: id('onbc'),
          horizon: 90,
          category: 'ownership',
          title: 'Own end-to-end support escalation operations and weekly incident triage',
          due: at(-52),
          done: false,
          completedOn: null,
          notes: '',
        },
        {
          id: id('onbc'),
          horizon: 90,
          category: 'ownership',
          title: 'Transition from onboarding into a co-authored goal and GROW development plan',
          due: at(-52),
          done: false,
          completedOn: null,
          notes: '',
        },
      ],
      reviews: { 30: null, 60: null, 90: null },
      status: 'active',
      completedOn: null,
      createdAt: new Date(ts(37)).toISOString(),
      updatedAt: new Date(ts(9)).toISOString(),
    },
    // Mei is 260 days into the team and has just stepped up into a tech-lead
    // seat: a role transition, anchored to the day the new role started. Her
    // original startDate (and tenure) are untouched — the plan is day 12 of
    // the new scope, not day 260 of a botched onboarding.
    {
      id: id('onb'),
      personId: mei,
      kind: 'role-transition',
      label: 'Billing platform tech lead',
      startDate: at(12),
      buddyId: null,
      buddyName: 'Daniel Osei (Principal Engineer, Payments)',
      roleClarity: 'Own technical direction for the billing migration; final say on schema changes within the agreed guardrails; represent Platform in the architecture review. Old IC deep-work commitments hand over by day 30.',
      earlyWin: 'Publish the schema-change decision log and retire the two riskiest legacy billing tables.',
      stakeholders: [
        { id: id('onbs'), name: 'Priya Natarajan', purpose: 'Platform reliability guardrails for schema changes', met: true, metOn: at(9) },
        { id: id('onbs'), name: 'Jordan Alvarez', purpose: 'Customer comms for billing changes', met: true, metOn: at(5) },
        { id: id('onbs'), name: 'Finance ops', purpose: 'Revenue-close constraints on migration timing', met: false, metOn: null },
      ],
      checkpoints: [
        {
          id: id('onbc'),
          horizon: 30,
          category: 'clarity',
          title: 'Agree the handover inventory for the old role: what stops, what transfers to whom, and by when',
          due: at(-2),
          done: false,
          completedOn: null,
          notes: '',
        },
        {
          id: id('onbc'),
          horizon: 30,
          category: 'clarity',
          title: 'Write down how the tech-lead scope differs: decision authority, review duties and what good looks like at 90 days',
          due: at(-18),
          done: false,
          completedOn: null,
          notes: '',
        },
        {
          id: id('onbc'),
          horizon: 60,
          category: 'contribution',
          title: 'Deliver or jointly review the first scoped early win in the new role (schema-change decision log)',
          due: at(-48),
          done: false,
          completedOn: null,
          notes: '',
        },
        {
          id: id('onbc'),
          horizon: 60,
          category: 'culture',
          title: 'Exchange 60-day calibration: which IC habits to drop, and what the tech-lead seat expects instead',
          due: at(-48),
          done: false,
          completedOn: null,
          notes: '',
        },
        {
          id: id('onbc'),
          horizon: 90,
          category: 'ownership',
          title: 'Own billing-migration technical direction end to end without falling back on the old IC scope',
          due: at(-78),
          done: false,
          completedOn: null,
          notes: '',
        },
        {
          id: id('onbc'),
          horizon: 90,
          category: 'ownership',
          title: 'Reset steady-state goals and the GROW plan to the expectations of the tech-lead role',
          due: at(-78),
          done: false,
          completedOn: null,
          notes: '',
        },
      ],
      reviews: { 30: null, 60: null, 90: null },
      status: 'active',
      completedOn: null,
      createdAt: new Date(ts(12)).toISOString(),
      updatedAt: new Date(ts(3)).toISOString(),
    },
  ];

  const billingCaseId = id('case');
  const escalationCaseId = id('case');
  const settledCaseId = id('case');

  state.cases = [
    {
      id: billingCaseId,
      kind: 'risk',
      status: 'mitigating',
      title: 'Billing ledger cutover reconciliation drift',
      summary: 'Shadow dual-writes surfaced 6 multi-currency invoice rounding mismatches that would block month-end revenue close if cutover proceeds unguarded.',
      ownerId: mei,
      involvedPersonIds: [priya, jordan],
      linkedGoalId: state.goals[1].id,
      openedOn: at(14),
      reviewOn: at(-5),
      resolvedOn: null,
      resolutionNotes: '',
      fmea: {
        severity: 8,
        probability: 5,
        detectability: 6,
        failureMode: 'Multi-currency tax rounding diverges between legacy and new billing ledgers during cutover',
        effect: 'Delayed month-end revenue close and manual invoice credits for enterprise accounts',
        controls: 'Weekly batch reconciliation script without automated pre-cutover circuit breaker',
        residualSeverity: null,
        residualProbability: null,
        residualDetectability: null,
      },
      financial: {
        currency: 'USD',
        optimistic: 12000,
        mostLikely: 28000,
        pessimistic: 65000,
        mitigationCost: 6500,
        capacityDaysOptimistic: 4,
        capacityDaysMostLikely: 8,
        capacityDaysPessimistic: 14,
        opportunityCost: 'Defer self-serve invoice export polish by one sprint to fund automated ledger invariant checks.',
      },
      rca: {
        problemStatement: '6 of 420 shadow enterprise invoices diverged by $0.01–$0.04 on FX tax rounding.',
        whys: [
          'Legacy ledger rounded line-item tax before FX conversion while the new service converts before rounding.',
          'Contract spec documented USD examples only and omitted multi-currency rounding order.',
          'CI staging suite lacked property-based shadow replay against historical multi-currency invoices.',
        ],
        rootCause: 'No canonical rounding-order contract or automated shadow-replay gate between billing and finance close.',
        systemicBarrier: 'Automated CI invariant gate + pre-cutover reconciliation circuit breaker signed off by Finance Ops.',
        preventiveAction: 'Add deterministic FX rounding contract tests and automated shadow-diff halt threshold before batch 3.',
      },
      stakeholders: [
        {
          id: id('cstk'),
          name: 'Controller (Finance Ops)',
          role: 'Revenue close sign-off',
          power: 5,
          interest: 4,
          stance: 'skeptical',
          commsCadence: 'immediate',
          lastCommsOn: at(9),
          nextCommsOn: at(2),
          keyMessage: 'Share mismatch ageing trend and automated halt threshold before batch 3.',
        },
        {
          id: id('cstk'),
          name: 'Head of Platform',
          role: 'Executive sponsor',
          power: 5,
          interest: 2,
          stance: 'supportive',
          commsCadence: 'milestone',
          lastCommsOn: at(6),
          nextCommsOn: at(-4),
          keyMessage: 'Cutover remains within Q4 window; 8 person-days reallocated from export polish.',
        },
        {
          id: id('cstk'),
          name: 'Enterprise Support Lead',
          role: 'Billing ticket readiness',
          power: 2,
          interest: 4,
          stance: 'supportive',
          commsCadence: 'weekly',
          lastCommsOn: at(5),
          nextCommsOn: at(-2),
          keyMessage: 'Provide customer-facing billing FAQ and zero-impact shadow verification status.',
        },
      ],
      autoPropagate: true,
      forecastSnapshot: {
        frozenOn: at(14),
        currency: 'USD',
        costOptimistic: 12000,
        costMostLikely: 28000,
        costPessimistic: 65000,
        costExpected: 31500,
        costStdDev: 8833.33,
        costP10: 20179.63,
        costP90: 42820.37,
        capacityDaysOptimistic: 4,
        capacityDaysMostLikely: 8,
        capacityDaysPessimistic: 14,
        capacityDaysExpected: 8.33,
        mitigationCost: 6500,
        fmeaProbability: 5,
      },
      actuals: null,
      createdAt: new Date(ts(14)).toISOString(),
      updatedAt: new Date(ts(4)).toISOString(),
    },
    {
      id: escalationCaseId,
      kind: 'escalation',
      status: 'open',
      title: 'Weekend P1 escalation gap across support pods',
      summary: 'Two support pods lack overlapping weekend responder coverage while engineering hiring remains frozen, leaving P1 handoffs vulnerable.',
      ownerId: samuel,
      involvedPersonIds: [priya],
      linkedGoalId: state.goals[2].id,
      openedOn: at(9),
      reviewOn: at(1),
      resolvedOn: null,
      resolutionNotes: '',
      fmea: {
        severity: 9,
        probability: 6,
        detectability: 5,
        failureMode: 'Weekend P1 incident waits >30 minutes without an assigned pod responder',
        effect: 'Enterprise SLA breach and unshielded on-call escalation to core platform engineers',
        controls: 'Best-effort Slack paging without agreed cross-pod weekend rota',
        residualSeverity: null,
        residualProbability: null,
        residualDetectability: null,
      },
      financial: {
        currency: 'USD',
        optimistic: 8000,
        mostLikely: 18000,
        pessimistic: 45000,
        mitigationCost: 4000,
        capacityDaysOptimistic: 3,
        capacityDaysMostLikely: 6,
        capacityDaysPessimistic: 10,
        opportunityCost: 'Fund weekend stipend pool and pause non-urgent support tooling cleanup for two weeks.',
      },
      rca: {
        problemStatement: 'Pod B and Pod C cannot staff simultaneous Saturday/Sunday primary + backup slots under current headcount.',
        whys: [
          'Pod split divided 6 weekend-eligible responders into three 2-person silos.',
          'Pod proposal optimised weekday domain ownership without modelling weekend fault-tolerance.',
          'Hiring freeze removed the planned seventh support engineer assumed in the rota draft.',
        ],
        rootCause: 'Single-pod weekend staffing lacks N+1 redundancy after the Q4 hiring freeze.',
        systemicBarrier: 'Pooled cross-pod weekend primary/secondary rotation with explicit runbook triage.',
        preventiveAction: 'Adopt pooled weekend primary rotation across pods while keeping weekday pod ownership.',
      },
      stakeholders: [
        {
          id: id('cstk'),
          name: 'VP Customer Success',
          role: 'SLA & pod co-sponsor',
          power: 5,
          interest: 5,
          stance: 'blocker',
          commsCadence: 'immediate',
          lastCommsOn: null,
          nextCommsOn: at(1),
          keyMessage: 'Present pooled weekend rota vs full pod delay trade-off and SLA impact.',
        },
        {
          id: id('cstk'),
          name: 'Support Pod Leads',
          role: 'Rota participants',
          power: 3,
          interest: 5,
          stance: 'skeptical',
          commsCadence: 'weekly',
          lastCommsOn: at(7),
          nextCommsOn: at(-1),
          keyMessage: 'Co-design cross-pod runbook handoff so weekend responders are never paged blind.',
        },
      ],
      autoPropagate: true,
      forecastSnapshot: null,
      actuals: null,
      createdAt: new Date(ts(9)).toISOString(),
      updatedAt: new Date(ts(2)).toISOString(),
    },
    {
      // Schema v22: a settled incident whose actuals were recorded at
      // resolution — the case-cost ledger's first (and so far only) scored
      // settlement, so the demo honestly reports "collecting evidence".
      id: settledCaseId,
      kind: 'incident',
      status: 'resolved',
      title: 'Payment webhook retries duplicated enterprise invoices',
      summary: 'Idempotency keys were dropped on webhook retry, so 14 enterprise accounts received duplicate invoices before Finance Ops halted the batch.',
      ownerId: jordan,
      involvedPersonIds: [mei],
      linkedGoalId: state.goals[1].id,
      openedOn: at(75),
      reviewOn: at(68),
      resolvedOn: at(58),
      resolutionNotes: 'Idempotency keys are now persisted with the first delivery attempt and replay-safe; duplicate-invoice monitor alarms Finance Ops before customer send. Verified across two clean billing cycles.',
      fmea: {
        severity: 7,
        probability: 6,
        detectability: 4,
        failureMode: 'Webhook retry after a gateway timeout re-executes invoice creation without the original idempotency key',
        effect: 'Duplicate enterprise invoices, credit-note rework, and month-end close delay',
        controls: 'Manual duplicate spot-check during month-end close',
        residualSeverity: 7,
        residualProbability: 2,
        residualDetectability: 2,
      },
      financial: {
        currency: 'USD',
        optimistic: 8000,
        mostLikely: 15000,
        pessimistic: 30000,
        mitigationCost: 4000,
        capacityDaysOptimistic: 3,
        capacityDaysMostLikely: 6,
        capacityDaysPessimistic: 10,
        opportunityCost: 'Pause self-serve dunning emails for one sprint to harden webhook delivery.',
      },
      forecastSnapshot: {
        frozenOn: at(75),
        currency: 'USD',
        costOptimistic: 8000,
        costMostLikely: 15000,
        costPessimistic: 30000,
        costExpected: 16333.33,
        costStdDev: 3666.67,
        costP10: 11634.31,
        costP90: 21032.36,
        capacityDaysOptimistic: 3,
        capacityDaysMostLikely: 6,
        capacityDaysPessimistic: 10,
        capacityDaysExpected: 6.17,
        mitigationCost: 4000,
        fmeaProbability: 6,
      },
      actuals: {
        materialised: true,
        realisedExposure: 19500,
        mitigationSpend: 4600,
        divertedDays: 8,
        settledOn: at(58),
        note: 'Finance close rollup: 14 credit notes plus expedited support credits; mitigation spend from the idempotency hardening sprint actuals.',
      },
      rca: {
        problemStatement: '14 of 1,180 enterprise invoices were issued twice after gateway timeouts during the April billing run.',
        whys: [
          'The retry worker rebuilt the webhook payload and generated a fresh idempotency key.',
          'The delivery contract treated the key as transport metadata rather than a persisted business invariant.',
          'No automated duplicate-invoice check ran before customer send.',
        ],
        rootCause: 'Idempotency keys were not persisted with the first delivery attempt, so retries were indistinguishable from new invoices.',
        systemicBarrier: 'Persisted idempotency store plus a pre-send duplicate-invoice circuit breaker owned by Finance Ops.',
        preventiveAction: 'Persist idempotency keys at first attempt and block batch send on any duplicate detection.',
      },
      stakeholders: [],
      autoPropagate: true,
      createdAt: new Date(ts(75)).toISOString(),
      updatedAt: new Date(ts(58)).toISOString(),
    },
  ];


  // ---------------------------------------------------------------- portfolio
  // The operating plan. Effort and value are three-point PERT estimates; the
  // capacity model derives utilisation, queue delay and the funding boundary
  // from these records live, so these numbers are inputs, not conclusions.
  const billingGoalId = state.goals[1].id;
  const activationGoalId = state.goals[0].id;
  const metricsGoalId = state.goals[3].id;

  const pf = (overrides) => ({
    id: id('pf'),
    title: '',
    kind: 'project',
    status: 'open',
    sourceType: 'manual',
    sourceId: null,
    ownerId: null,
    effortDays: { optimistic: 0, mostLikely: 0, pessimistic: 0 },
    value: { optimistic: 0, mostLikely: 0, pessimistic: 0 },
    currency: 'USD',
    decision: 'undecided',
    decisionOn: null,
    rationale: '',
    targetOn: null,
    createdOn: at(30),
    completedOn: null,
    releasedOn: null,
    createdAt: new Date(ts(30)).toISOString(),
    updatedAt: new Date(ts(2)).toISOString(),
    ...overrides,
  });

  state.portfolio = [
    pf({
      title: 'Billing reconciliation automation',
      sourceType: 'goal',
      sourceId: billingGoalId,
      ownerId: mei,
      effortDays: { optimistic: 6, mostLikely: 8, pessimistic: 12 },
      value: { optimistic: 30000, mostLikely: 45000, pessimistic: 60000 },
      decision: 'funded',
      decisionOn: at(28),
      rationale: 'Removes the manual reconciliation that blocks month-end close.',
      targetOn: at(-12),
      createdOn: at(30),
      createdAt: new Date(ts(30)).toISOString(),
    }),
    pf({
      title: 'Warehouse metrics migration',
      sourceType: 'goal',
      sourceId: metricsGoalId,
      ownerId: freya,
      effortDays: { optimistic: 7, mostLikely: 9, pessimistic: 14 },
      value: { optimistic: 18000, mostLikely: 30000, pessimistic: 38000 },
      decision: 'funded',
      decisionOn: at(24),
      rationale: 'Two dashboards disagree today; the goal is not measurable until they do not.',
      targetOn: at(-21),
      createdOn: at(26),
      createdAt: new Date(ts(26)).toISOString(),
    }),
    pf({
      title: 'Activation funnel instrumentation',
      sourceType: 'goal',
      sourceId: activationGoalId,
      ownerId: jordan,
      effortDays: { optimistic: 5, mostLikely: 7, pessimistic: 10 },
      value: { optimistic: 24000, mostLikely: 36000, pessimistic: 48000 },
      decision: 'funded',
      decisionOn: at(20),
      rationale: 'The activation goal cannot be trusted without event coverage on the funnel.',
      targetOn: at(-10),
      createdOn: at(22),
      createdAt: new Date(ts(22)).toISOString(),
    }),
    pf({
      title: 'On-call tooling v1 (paging + runbooks)',
      ownerId: priya,
      effortDays: { optimistic: 3, mostLikely: 5, pessimistic: 8 },
      value: { optimistic: 12000, mostLikely: 20000, pessimistic: 26000 },
      decision: 'funded',
      decisionOn: at(16),
      rationale: 'On-call load is the team’s biggest retention risk; this is the cheapest lever.',
      targetOn: at(-14),
      createdOn: at(18),
      createdAt: new Date(ts(18)).toISOString(),
    }),
    pf({
      title: 'Self-serve invoice export v2',
      ownerId: priya,
      effortDays: { optimistic: 5, mostLikely: 8, pessimistic: 12 },
      value: { optimistic: 18000, mostLikely: 26000, pessimistic: 34000 },
      decision: 'undecided',
      rationale: '',
      targetOn: at(-35),
      createdOn: at(12),
      createdAt: new Date(ts(12)).toISOString(),
    }),
    pf({
      title: 'Legacy VAT rule clean-up',
      ownerId: mei,
      effortDays: { optimistic: 3, mostLikely: 5, pessimistic: 8 },
      value: { optimistic: 4000, mostLikely: 8000, pessimistic: 12000 },
      decision: 'undecided',
      rationale: '',
      targetOn: at(-40),
      createdOn: at(9),
      createdAt: new Date(ts(9)).toISOString(),
    }),
    pf({
      title: 'Support tooling clean-up',
      ownerId: samuel,
      effortDays: { optimistic: 4, mostLikely: 6, pessimistic: 9 },
      value: { optimistic: 2000, mostLikely: 4000, pessimistic: 6000 },
      decision: 'deferred',
      decisionOn: at(11),
      rationale: 'No customer-visible impact this quarter; the capacity is better spent on the escalation rota.',
      createdOn: at(15),
      createdAt: new Date(ts(15)).toISOString(),
    }),
    pf({
      title: 'Incident review automation',
      ownerId: priya,
      effortDays: { optimistic: 4, mostLikely: 5, pessimistic: 8 },
      value: { optimistic: 6000, mostLikely: 9000, pessimistic: 12000 },
      decision: 'funded',
      decisionOn: at(70),
      status: 'done',
      completedOn: at(44),
      // Recorded at delivery: 7d actual vs 5.33d frozen expectation (1.31×) —
      // the demo's first planning-fallacy data point.
      actualEffortDays: 7,
      actualValue: 8000,
      createdOn: at(78),
      createdAt: new Date(ts(78)).toISOString(),
      updatedAt: new Date(ts(44)).toISOString(),
    }),
    pf({
      title: 'Query cost guardrails',
      ownerId: freya,
      effortDays: { optimistic: 6, mostLikely: 8, pessimistic: 12 },
      value: { optimistic: 5000, mostLikely: 7000, pessimistic: 9000 },
      decision: 'funded',
      decisionOn: at(60),
      status: 'done',
      completedOn: at(20),
      actualEffortDays: 9,
      actualValue: 6500,
      createdOn: at(66),
      createdAt: new Date(ts(66)).toISOString(),
      updatedAt: new Date(ts(20)).toISOString(),
    }),
    // Capacity reserves that RULE-CAP-01 created from the two open cases. They
    // are stored records (not live inference) so the plan is auditable.
    pf({
      title: 'Capacity reserve: Billing ledger cutover reconciliation drift',
      kind: 'capacity-reserve',
      sourceType: 'case',
      sourceId: billingCaseId,
      ownerId: mei,
      effortDays: { optimistic: 4, mostLikely: 8, pessimistic: 14 },
      value: { optimistic: 0, mostLikely: 0, pessimistic: 0 },
      decision: 'funded',
      decisionOn: at(14),
      rationale: 'Reserved automatically because the operational case diverts team capacity (RULE-CAP-01).',
      targetOn: at(5),
      createdOn: at(14),
      createdAt: new Date(ts(14)).toISOString(),
      updatedAt: new Date(ts(2)).toISOString(),
    }),
    pf({
      title: 'Capacity reserve: Weekend P1 escalation gap across support pods',
      kind: 'capacity-reserve',
      sourceType: 'case',
      sourceId: escalationCaseId,
      ownerId: samuel,
      effortDays: { optimistic: 3, mostLikely: 6, pessimistic: 10 },
      value: { optimistic: 0, mostLikely: 0, pessimistic: 0 },
      decision: 'funded',
      decisionOn: at(9),
      rationale: 'Reserved automatically because the operational case diverts team capacity (RULE-CAP-01).',
      targetOn: at(3),
      createdOn: at(9),
      createdAt: new Date(ts(9)).toISOString(),
      updatedAt: new Date(ts(2)).toISOString(),
    }),
  ];

  // Schema v21: every funded item carries the forecast RULE-FCT-01 froze when
  // it was funded (decisionOn), computed here with the same pure function the
  // rules engine uses — including the two delivered items, whose recorded
  // actuals are scored against these snapshots. Capacity reserves are
  // excluded by buildForecastSnapshot's caller contract, exactly as live.
  for (const item of state.portfolio) {
    if (item.decision === 'funded' && item.kind !== 'capacity-reserve') {
      item.forecastSnapshot = buildForecastSnapshot(item, item.decisionOn || item.createdOn);
    }
  }

  // ---------------------------------------------------------------- hiring
  // Two live roles and one filled role. The first carries a recorded interview
  // effort so the capacity plan can reserve it; the second deliberately has no
  // estimate, which is what HIRE-05 reports — the app never invents one.
  const seniorReqId = id('req');
  const analyticsReqId = id('req');
  const filledReqId = id('req');

  const competency = (cid, name, weight, required = true) => ({ id: cid, name, weight, required });

  state.requisitions = [
    {
      id: seniorReqId,
      title: 'Senior platform engineer',
      team: 'Platform',
      level: 'senior',
      reason: 'growth',
      status: 'open',
      openedOn: at(46),
      targetStartOn: at(-5),
      closedOn: null,
      filledPersonId: null,
      interviewers: [mei, freya],
      competencies: [
        competency('cmp-demo-1', 'Designs resilient service boundaries', 4),
        competency('cmp-demo-2', 'Runs incident response calmly', 3),
        competency('cmp-demo-3', 'Explains tradeoffs to non-engineers', 2, false),
      ],
      effortDays: { optimistic: 4, mostLikely: 6, pessimistic: 9 },
      dailyVacancyCost: 700,
      currency: 'USD',
      notes: 'On-call load is the reason the role exists; the loop must test incident judgement, not trivia.',
      autoEscalated: false,
      escalatedCaseId: null,
      createdAt: new Date(ts(46)).toISOString(),
      updatedAt: new Date(ts(4)).toISOString(),
    },
    {
      id: analyticsReqId,
      title: 'Analytics engineer',
      team: 'Platform',
      level: 'ic',
      reason: 'capability',
      status: 'open',
      openedOn: at(12),
      targetStartOn: at(26),
      closedOn: null,
      filledPersonId: null,
      interviewers: [freya],
      competencies: [
        competency('cmp-demo-4', 'Models event data accurately', 4),
        competency('cmp-demo-5', 'Writes tests for pipelines', 3),
      ],
      effortDays: { optimistic: 0, mostLikely: 0, pessimistic: 0 },
      dailyVacancyCost: null,
      currency: 'USD',
      notes: '',
      autoEscalated: false,
      escalatedCaseId: null,
      createdAt: new Date(ts(12)).toISOString(),
      updatedAt: new Date(ts(5)).toISOString(),
    },
    {
      id: filledReqId,
      title: 'Billing operations analyst',
      team: 'Platform',
      level: 'ic',
      reason: 'backfill',
      status: 'filled',
      openedOn: at(96),
      targetStartOn: at(30),
      closedOn: at(22),
      filledPersonId: null,
      interviewers: [mei],
      competencies: [competency('cmp-demo-6', 'Reconciles ledgers without supervision', 4)],
      effortDays: { optimistic: 2, mostLikely: 3, pessimistic: 5 },
      dailyVacancyCost: null,
      currency: 'USD',
      notes: '',
      autoEscalated: false,
      escalatedCaseId: null,
      createdAt: new Date(ts(96)).toISOString(),
      updatedAt: new Date(ts(22)).toISOString(),
    },
  ];

  const signal = (sid, kind, competencyId, rating, interviewerId, daysAgo, note) => ({
    id: sid,
    kind,
    competencyId,
    rating,
    interviewerId,
    date: at(daysAgo),
    note,
  });

  state.candidates = [
    {
      id: 'cand-demo-1',
      reqId: seniorReqId,
      name: 'Noor Haddad',
      stage: 'final',
      appliedOn: at(24),
      lastActivityOn: at(3),
      source: 'Referral — Priya',
      signals: [
        signal('sig-demo-1', 'work-sample', 'cmp-demo-1', 5, mei, 12, 'Rebuilt the retry path in the exercise and explained the idempotency tradeoff unprompted.'),
        signal('sig-demo-2', 'structured-interview', 'cmp-demo-2', 4, freya, 9, 'Walked through a real outage: owned the comms, escalated before guessing, named what she would change.'),
        signal('sig-demo-3', 'structured-interview', 'cmp-demo-1', 4, freya, 9, 'Explained service-boundary tradeoffs to a product audience without jargon.'),
        signal('sig-demo-4', 'reference', 'cmp-demo-3', 4, mei, 5, 'Former manager confirmed she mentored two juniors through their first on-call rotation.'),
      ],
      decision: { outcome: 'pending', decidedOn: null, rationale: '', evidenceGapAcknowledged: false },
      offerOn: null,
      offerAcceptedOn: null,
      hiredOn: null,
      startOn: null,
      personId: null,
      keepInTouch: false,
      createdAt: new Date(ts(24)).toISOString(),
      updatedAt: new Date(ts(3)).toISOString(),
    },
    {
      id: 'cand-demo-2',
      reqId: seniorReqId,
      name: 'Tomas Berg',
      stage: 'final',
      appliedOn: at(18),
      lastActivityOn: at(6),
      source: 'Outbound — careers page',
      signals: [
        signal('sig-demo-5', 'unstructured-interview', 'cmp-demo-1', 4, mei, 8, 'Strong systems conversation, but no scored exercise — impression only.'),
        signal('sig-demo-6', 'unstructured-interview', 'cmp-demo-1', 3, mei, 8, 'Second chat with the same interviewer: treated as a repeat observation, not new evidence.'),
      ],
      decision: { outcome: 'pending', decidedOn: null, rationale: '', evidenceGapAcknowledged: false },
      offerOn: null,
      offerAcceptedOn: null,
      hiredOn: null,
      startOn: null,
      personId: null,
      keepInTouch: false,
      createdAt: new Date(ts(18)).toISOString(),
      updatedAt: new Date(ts(6)).toISOString(),
    },
    {
      id: 'cand-demo-3',
      reqId: seniorReqId,
      name: 'Elena Rossi',
      stage: 'rejected',
      appliedOn: at(30),
      lastActivityOn: at(16),
      source: 'Agency',
      signals: [
        signal('sig-demo-7', 'job-knowledge', 'cmp-demo-1', 2, freya, 20, 'Technical exercise missed the concurrency requirement; partial credit on the data model.'),
        signal('sig-demo-8', 'structured-interview', 'cmp-demo-2', 2, mei, 18, 'During the incident scenario, escalated late and could not name the rollback trigger.'),
        signal('sig-demo-9', 'structured-interview', 'cmp-demo-3', 3, mei, 18, 'Explanations were clear but stayed at implementation detail.'),
      ],
      decision: {
        outcome: 'reject',
        decidedOn: at(16),
        rationale: 'Below the bar on incident judgement in both the exercise and the structured interview. Told her the specific gap; she asked to be considered for the mid-level opening instead.',
        evidenceGapAcknowledged: false,
      },
      offerOn: null,
      offerAcceptedOn: null,
      hiredOn: null,
      startOn: null,
      personId: null,
      keepInTouch: true,
      createdAt: new Date(ts(30)).toISOString(),
      updatedAt: new Date(ts(16)).toISOString(),
    },
    {
      id: 'cand-demo-4',
      reqId: analyticsReqId,
      name: 'Priya Raman',
      stage: 'interviewing',
      appliedOn: at(9),
      lastActivityOn: at(2),
      source: 'Referral — Freya',
      signals: [
        signal('sig-demo-10', 'work-sample', 'cmp-demo-4', 5, freya, 4, 'Modelled the funnel events from a raw export and caught a duplicate-order bug nobody asked about.'),
      ],
      decision: { outcome: 'pending', decidedOn: null, rationale: '', evidenceGapAcknowledged: false },
      offerOn: null,
      offerAcceptedOn: null,
      hiredOn: null,
      startOn: null,
      personId: null,
      keepInTouch: false,
      createdAt: new Date(ts(9)).toISOString(),
      updatedAt: new Date(ts(2)).toISOString(),
    },
    // A record from the role that was filled two and a half months ago. It is
    // here so the retention review has something true to point at: the demo
    // shows the prompt, the exempt record (Elena, kept in touch on purpose) and
    // the fact that nothing is deleted without a person choosing to.
    {
      id: 'cand-demo-5',
      reqId: filledReqId,
      name: 'Marcus Feld',
      stage: 'rejected',
      appliedOn: at(250),
      lastActivityOn: at(244),
      source: 'Job board',
      signals: [
        signal('sig-demo-13', 'structured-interview', 'cmp-demo-6', 2, mei, 246, 'Reconciliation walkthrough was accurate but slow; could not explain how he would catch a recurring drift.'),
      ],
      decision: {
        outcome: 'reject',
        decidedOn: at(244),
        rationale: 'Strong on routine reconciliation, but the role needed someone who could design the control rather than operate it. Recommended a finance-ops opening instead.',
        evidenceGapAcknowledged: false,
      },
      offerOn: null,
      offerAcceptedOn: null,
      hiredOn: null,
      startOn: null,
      personId: null,
      keepInTouch: false,
      createdAt: new Date(ts(250)).toISOString(),
      updatedAt: new Date(ts(244)).toISOString(),
    },
    // The silver medallist: past the retention window, but kept on purpose
    // because the leader wants to call her first for the next finance-ops seat.
    // She appears in the retention card as an exemption, not as a to-do.
    {
      id: 'cand-demo-6',
      reqId: filledReqId,
      name: 'Aisha Bello',
      stage: 'rejected',
      appliedOn: at(246),
      lastActivityOn: at(210),
      source: 'Internal referral',
      signals: [
        signal('sig-demo-14', 'structured-interview', 'cmp-demo-6', 4, mei, 212, 'Found the control gap in the practice ledger in eleven minutes and wrote the fix-up query unaided.'),
        signal('sig-demo-15', 'work-sample', 'cmp-demo-6', 4, freya, 211, 'Clean reconciliation workbook, defensible assumptions, flagged two things the brief had missed.'),
      ],
      decision: {
        outcome: 'reject',
        decidedOn: at(210),
        rationale: 'Second by a narrow margin; offered the role to someone with deeper ERP migration experience. Asked to be contacted first if another finance-ops seat opens — recorded here so that promise is not lost.',
        evidenceGapAcknowledged: false,
      },
      offerOn: null,
      offerAcceptedOn: null,
      hiredOn: null,
      startOn: null,
      personId: null,
      keepInTouch: true,
      createdAt: new Date(ts(246)).toISOString(),
      updatedAt: new Date(ts(210)).toISOString(),
    },
  ];

  // Mirror what RULE-HIRE-01 creates for the one role with a recorded estimate.
  const hiringPlanItemId = id('pf');
  state.portfolio.push({
    id: hiringPlanItemId,
    title: 'Hiring: Senior platform engineer',
    kind: 'hiring',
    status: 'open',
    sourceType: 'requisition',
    sourceId: seniorReqId,
    ownerId: null,
    effortDays: { optimistic: 4, mostLikely: 6, pessimistic: 9 },
    value: { optimistic: 0, mostLikely: 0, pessimistic: 0 },
    currency: 'USD',
    decision: 'funded',
    decisionOn: at(46),
    rationale: 'Interview effort committed by an open requisition (RULE-HIRE-01). Value is unmeasured: hiring consumes capacity rather than producing measurable revenue.',
    targetOn: at(-5),
    createdOn: at(46),
    completedOn: null,
    releasedOn: null,
    createdAt: new Date(ts(46)).toISOString(),
    updatedAt: new Date(ts(4)).toISOString(),
  });

  // Organizational Design, Team Topologies & Change Execution (Schema v19)
  const billingPodChangeId = 'chg-demo-1';
  const triageHandoffChangeId = 'chg-demo-2';
  state.changes = [
    {
      id: billingPodChangeId,
      title: 'Extract Billing & Ledger into a stream-aligned pod',
      kind: 'topology',
      status: 'active',
      summary: 'Platform currently owns both shared infra and customer billing schema changes, causing blocking cross-team handoffs and on-call context switching.',
      vision: 'A dedicated stream-aligned Billing & Ledger pod owns invoice lifecycle end-to-end while consuming core Platform infra strictly as X-as-a-Service.',
      nonGoals: 'Not rewriting the legacy tax engine this quarter; not merging Support tier-1 queues into Billing.',
      reversibility: 'irreversible',
      ownerId: mei,
      linkedGoalId: state.goals[1].id,
      openedOn: at(24),
      targetOn: at(-21),
      reviewOn: at(-4),
      anchoredOn: null,
      closedReason: '',
      kotterStage: 'obstacles',
      completedSteps: ['urgency', 'coalition', 'vision', 'communicate'],
      shortTermWins: [
        {
          id: id('cwin'),
          text: 'First decoupled ledger migration shipped without shared Platform freeze (cut wait from 4d to 35m)',
          achievedOn: at(7),
          verified: true,
        },
      ],
      topology: {
        teamName: 'Billing & Ledger Pod',
        currentType: 'complicated-subsystem',
        targetType: 'stream-aligned',
        interactionMode: 'x-as-a-service',
        cognitiveLoadBefore: 5,
        cognitiveLoadTarget: 2,
        blockingHandoffsBefore: 5,
        blockingHandoffsTarget: 1,
        collaboratingTeamsCount: 1,
      },
      star: {
        strategy: 'Zero-incident billing ledger cutover with independent weekly release cadence.',
        structure: '4-person stream-aligned pod led technically by Mei Lin Chen.',
        processes: 'Self-serve deploy pipeline + async schema ADR contract; drop shared weekly change-board gate.',
        rewards: 'Pod goals tied to ledger accuracy & deployment lead time rather than shared platform ticket count.',
        people: 'Mei transitions into Billing Pod Technical Lead; Freya pairs on reconciliation telemetry.',
      },
      forces: [
        {
          id: id('chgf'),
          side: 'driving',
          label: 'Eliminate 5-way cross-team deploy queue on billing schema migrations',
          weight: 5,
          category: 'tooling',
          mitigation: '',
          mitigated: false,
        },
        {
          id: id('chgf'),
          side: 'driving',
          label: 'Protect core Platform on-call from domain-specific invoice escalations',
          weight: 4,
          category: 'workload',
          mitigation: '',
          mitigated: false,
        },
        {
          id: id('chgf'),
          side: 'restraining',
          label: 'Finance Ops manual dual sign-off gate on every schema migration',
          weight: 5,
          category: 'governance',
          mitigation: 'Replace manual sign-off with automated reconciliation invariant checks before deploy.',
          mitigated: false,
        },
        {
          id: id('chgf'),
          side: 'restraining',
          label: 'Shared staging database couples Platform and Billing test runs',
          weight: 4,
          category: 'tooling',
          mitigation: 'Ephemeral per-PR ledger test containers provisioned.',
          mitigated: true,
        },
      ],
      coalition: [
        {
          id: id('chgs'),
          personId: mei,
          name: 'Mei Lin Chen',
          role: 'Staff Engineer (Pod Lead)',
          power: 4,
          interest: 5,
          stance: 'champion',
          vetoPlayer: false,
          keyMessage: 'Full schema authority within agreed ledger invariants.',
          lastBriefedOn: at(6),
          nextBriefOn: at(-8),
        },
        {
          id: id('chgs'),
          personId: null,
          name: 'Dana Kowalski',
          role: 'Finance Ops Controller',
          power: 5,
          interest: 5,
          stance: 'skeptical',
          vetoPlayer: true,
          keyMessage: 'Automated ledger reconciliation audit trail replaces manual spreadsheet sign-off.',
          lastBriefedOn: at(16),
          nextBriefOn: at(2),
        },
        {
          id: id('chgs'),
          personId: priya,
          name: 'Priya Natarajan',
          role: 'Engineering Lead',
          power: 5,
          interest: 4,
          stance: 'supportive',
          vetoPlayer: true,
          keyMessage: 'Clean X-as-a-Service boundary reduces Platform interrupt load.',
          lastBriefedOn: at(8),
          nextBriefOn: at(-6),
        },
      ],
      impacts: [
        {
          id: id('chgi'),
          personId: mei,
          impactKind: 'scope-shift',
          newRoleLabel: 'Billing Pod Technical Lead',
          createTransitionPlan: false,
        },
        {
          id: id('chgi'),
          personId: freya,
          impactKind: 'topology-interface',
          newRoleLabel: 'Embedded Billing Analytics Partner',
          createTransitionPlan: false,
        },
      ],
      metrics: [
        {
          id: id('cmet'),
          name: 'Cross-team blocking handoffs per release',
          unit: 'handoffs',
          desirableDirection: 'lower',
          observations: [
            { id: id('cobs'), date: at(42), value: 5, phase: 'baseline', note: 'Pre-split baseline' },
            { id: id('cobs'), date: at(35), value: 6, phase: 'baseline', note: 'Pre-split release' },
            { id: id('cobs'), date: at(28), value: 5, phase: 'baseline', note: 'Pre-split release' },
            { id: id('cobs'), date: at(18), value: 3, phase: 'post', note: 'Containerized ledger tests live' },
            { id: id('cobs'), date: at(7), value: 2, phase: 'post', note: 'First decoupled deploy' },
          ],
        },
      ],
      effortDays: { optimistic: 1, mostLikely: 1.5, pessimistic: 2 },
      economics: {
        currency: 'USD',
        transitionCost: 12000,
        monthlyBenefit: { optimistic: 3500, mostLikely: 5000, pessimistic: 7000 },
        horizonMonths: 12,
      },
      autoCreateDecision: true,
      createdAt: new Date(ts(24)).toISOString(),
      updatedAt: new Date(ts(6)).toISOString(),
    },
    {
      id: triageHandoffChangeId,
      title: 'Async P1 triage & handoff contract across support pods',
      kind: 'process',
      status: 'anchored',
      summary: 'Ad-hoc Slack paging during P1 incidents caused duplicate debugging and unclear incident command between Support and Platform.',
      vision: 'Single written 5-line P1 handoff packet with explicit incident commander transfer in under 15 minutes.',
      nonGoals: 'Not changing customer SLA tiers or replacing the paging vendor.',
      reversibility: 'reversible',
      ownerId: samuel,
      linkedGoalId: state.goals[2].id,
      openedOn: at(52),
      targetOn: at(14),
      reviewOn: at(10),
      anchoredOn: at(11),
      closedReason: 'Anchored in runbooks and onboarding; XmR chart confirmed P1 handoff time shifted from ~47m baseline to ~20m.',
      kotterStage: 'anchor',
      completedSteps: ['urgency', 'coalition', 'vision', 'communicate', 'obstacles', 'short-wins', 'consolidate', 'anchor'],
      shortTermWins: [
        {
          id: id('cwin'),
          text: 'Three consecutive P1 drills handed off cleanly in under 20 minutes (mean dropped from 46.8m to 20.0m)',
          achievedOn: at(22),
          verified: true,
        },
      ],
      topology: {
        teamName: 'Support ↔ Platform Interface',
        currentType: 'enabling',
        targetType: 'stream-aligned',
        interactionMode: 'facilitating',
        cognitiveLoadBefore: 4,
        cognitiveLoadTarget: 2,
        blockingHandoffsBefore: 4,
        blockingHandoffsTarget: 1,
        collaboratingTeamsCount: 1,
      },
      star: {
        strategy: 'Hit <30m P1 response SLA without burning out senior engineers.',
        structure: 'Rotating pod triage lead hands off directly to single Platform duty engineer.',
        processes: '5-line structured incident packet required before paging.',
        rewards: 'Post-incident reviews recognize clean handoff packets, not heroics.',
        people: 'Samuel coached all three support pod leads through live drills.',
      },
      forces: [
        {
          id: id('chgf'),
          side: 'driving',
          label: 'Cut P1 handoff latency below 20 minutes',
          weight: 5,
          category: 'customer',
          mitigation: '',
          mitigated: false,
        },
        {
          id: id('chgf'),
          side: 'restraining',
          label: 'Habit of back-channel DM escalations to Priya',
          weight: 4,
          category: 'coalition',
          mitigation: 'Priya redirects all DMs to the triage packet channel.',
          mitigated: true,
        },
      ],
      coalition: [
        {
          id: id('chgs'),
          personId: samuel,
          name: 'Samuel Okafor',
          role: 'Support Team Lead',
          power: 4,
          interest: 5,
          stance: 'champion',
          vetoPlayer: true,
          keyMessage: 'Support owns crisp reproduction context before escalation.',
          lastBriefedOn: at(12),
          nextBriefOn: null,
        },
      ],
      impacts: [
        {
          id: id('chgi'),
          personId: samuel,
          impactKind: 'topology-interface',
          newRoleLabel: 'Incident Triage Process Owner',
          createTransitionPlan: false,
        },
      ],
      metrics: [
        {
          id: id('cmet'),
          name: 'Mean P1 triage handoff time',
          unit: 'min',
          desirableDirection: 'lower',
          observations: [
            { id: id('cobs'), date: at(80), value: 46, phase: 'baseline', note: 'Pre-change baseline' },
            { id: id('cobs'), date: at(72), value: 49, phase: 'baseline', note: 'Pre-change baseline' },
            { id: id('cobs'), date: at(64), value: 44, phase: 'baseline', note: 'Pre-change baseline' },
            { id: id('cobs'), date: at(56), value: 48, phase: 'baseline', note: 'Pre-change baseline' },
            { id: id('cobs'), date: at(42), value: 22, phase: 'post', note: 'Structured packet launched' },
            { id: id('cobs'), date: at(32), value: 19, phase: 'post', note: 'Week 3 post-launch' },
            { id: id('cobs'), date: at(22), value: 21, phase: 'post', note: 'Week 5 post-launch' },
            { id: id('cobs'), date: at(12), value: 18, phase: 'post', note: 'Anchored check' },
          ],
        },
      ],
      effortDays: { optimistic: 2, mostLikely: 3, pessimistic: 5 },
      economics: {
        currency: 'USD',
        transitionCost: 4000,
        monthlyBenefit: { optimistic: 1500, mostLikely: 2400, pessimistic: 3500 },
        horizonMonths: 12,
      },
      autoCreateDecision: false,
      createdAt: new Date(ts(52)).toISOString(),
      updatedAt: new Date(ts(11)).toISOString(),
    },
  ];

  const changeReserveItemId = id('pf');
  state.portfolio.push({
    id: changeReserveItemId,
    title: 'Change transition: Extract Billing & Ledger into a stream-aligned pod',
    kind: 'capacity-reserve',
    status: 'open',
    sourceType: 'change',
    sourceId: billingPodChangeId,
    ownerId: mei,
    effortDays: { optimistic: 1, mostLikely: 1.5, pessimistic: 2 },
    value: { optimistic: 0, mostLikely: 0, pessimistic: 0 },
    currency: 'USD',
    decision: 'funded',
    decisionOn: at(24),
    rationale: 'Transition capacity reserved for active organizational change (RULE-CHG-01).',
    targetOn: at(-21),
    createdOn: at(24),
    completedOn: null,
    releasedOn: null,
    createdAt: new Date(ts(24)).toISOString(),
    updatedAt: new Date(ts(6)).toISOString(),
  });

  // Negotiation Workbench — healthy baseline: every open negotiation has a
  // BATNA, complete Fisher & Ury prep, future session/review dates and ZOPA on
  // every measured issue, so the demo fires no NEG-* insight rules. One closed
  // agreement shows the term-ownership follow-through state.
  const vendorMandateDecisionId = id('dec');
  state.decisions.push({
    id: vendorMandateDecisionId,
    title: 'Negotiation mandate: Aurora Cloud platform renewal',
    question: 'Pursue a renewed Aurora Cloud contract within the reservation envelope, or execute the BATNA and migrate the reserved workloads to Northstack? Weighted ZOPA coverage is 100% on measured issues; prep completeness 100% (Fisher & Ury/BATNA, Raiffa ZOPA).',
    date: at(18),
    reversibility: 'irreversible',
    driver: 'Priya Natarajan',
    approver: 'Head of Platform',
    contributors: 'Mei Lin Chen, Jordan Alvarez',
    informed: 'Platform team, Finance Ops',
    options: [
      { id: id('dopt'), label: 'Renew within reservation envelope', pros: 'No migration risk, SLA continuity', cons: 'Locks the vendor for another 12–24 months' },
      { id: id('dopt'), label: 'Execute BATNA: partial migration to Northstack', pros: 'Competitive tension, lower unit cost', cons: 'Migration cost and focus during billing work' },
    ],
    chosen: '',
    rationale: '',
    reviewOn: at(-2),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    createdAt: new Date(ts(18)).toISOString(),
  });

  const vendorNegotiationId = id('neg');
  const secondmentNegotiationId = id('neg');
  const scopeNegotiationId = id('neg');
  state.negotiations = [
    {
      id: vendorNegotiationId,
      title: 'Aurora Cloud platform renewal',
      kind: 'vendor-contract',
      status: 'active',
      counterparty: 'Elena Voss',
      counterpartyRole: 'Enterprise Account Director, Aurora Cloud',
      ownerId: priya,
      linkedGoalId: state.goals[1].id,
      sourceType: null,
      sourceId: null,
      openedOn: at(18),
      nextSessionOn: at(-3),
      reviewOn: at(-8),
      closedOn: null,
      strategic: true,
      stakesValue: 96000,
      stakesCurrency: 'USD',
      ourBatnaDescription: 'Migrate the two reserved workloads to Northstack under their quoted 12-month rate; in-house cost of migration is already budgeted.',
      ourBatnaValue: 88000,
      ourBatnaUnit: 'USD',
      theirBatnaEstimate: 'Aurora is behind on quarterly new-logo targets; losing a reference customer likely costs them more than holding list price (medium confidence).',
      ourInterests: [
        'Protect platform reliability runway during the billing migration',
        'Cap annual commitment so headcount plans stay flexible',
      ],
      theirInterests: [
        'Book a multi-year renewal before quarter end',
        'Keep a reference logo in the platform-engineering segment',
      ],
      objectiveCriteria: [
        'Northstack renewal quote at comparable SLA terms',
        'Published regional market rate for reserved compute (benchmark report)',
        'Last contract unit price adjusted by the CPI index clause',
      ],
      options: [
        'Two-year term with a price hold and 15 included support days',
        'One-year term at the target price with an optional second-year renewal window',
      ],
      issues: [
        {
          id: id('niss'), name: 'Annual platform fee', unit: 'USD', direction: 'minimize', weight: 5,
          ourReservation: 100000, ourTarget: 88000, theirReservation: 84000, theirTarget: 95000, estimateConfidence: 'medium',
        },
        {
          id: id('niss'), name: 'Commitment term', unit: 'months', direction: 'minimize', weight: 3,
          ourReservation: 24, ourTarget: 12, theirReservation: 12, theirTarget: 18, estimateConfidence: 'high',
        },
        {
          id: id('niss'), name: 'Implementation support days', unit: 'days', direction: 'maximize', weight: 2,
          ourReservation: 10, ourTarget: 20, estimateConfidence: null,
        },
      ],
      agreedTerms: [],
      outcomeNotes: '',
      notes: 'First session established both sides share an interest in renewing before Aurora’s quarter end; fee issue already overlaps, term is the trade-off variable.',
      escalationCaseId: null,
      autoPropagate: true,
      createdAt: new Date(ts(18)).toISOString(),
      updatedAt: new Date(ts(4)).toISOString(),
    },
    {
      id: secondmentNegotiationId,
      title: 'Freya’s secondment to the metrics rebuild',
      kind: 'internal-resource',
      status: 'preparing',
      counterparty: 'Riley Brooks',
      counterpartyRole: 'Marketing Director',
      ownerId: jordan,
      linkedGoalId: null,
      sourceType: null,
      sourceId: null,
      openedOn: at(7),
      nextSessionOn: null,
      reviewOn: at(-9),
      closedOn: null,
      strategic: false,
      stakesValue: null,
      stakesCurrency: 'USD',
      ourBatnaDescription: 'Re-scope the weekly reporting work to fit Freya’s current allocation; slower but no cross-team dependency.',
      ourBatnaValue: null,
      ourBatnaUnit: '',
      theirBatnaEstimate: 'Marketing can delay its dashboard migration one quarter if Freya stays; they prefer sharing her to losing the rebuild slot.',
      ourInterests: ['Trustworthy weekly numbers before the billing migration cut-over', 'A defined end date so Freya’s growth plan is not parked'],
      theirInterests: ['Keep campaign analytics coverage through the product launch', 'Avoid recruiting a temporary analyst'],
      objectiveCriteria: ['Team capacity model allocatable-day balance', 'Last two internal secondment agreements as precedent'],
      options: ['60% allocation for six weeks with a named review', '50% allocation for eight weeks, handback after launch week'],
      issues: [
        {
          id: id('niss'), name: 'Freya allocation', unit: '% time', direction: 'maximize', weight: 4,
          ourReservation: 60, ourTarget: 80, theirReservation: 80, theirTarget: 100, estimateConfidence: 'medium',
        },
        {
          id: id('niss'), name: 'Handback notice', unit: 'working days', direction: 'minimize', weight: 2,
          ourReservation: 10, ourTarget: 5, theirReservation: 5, theirTarget: 10, estimateConfidence: 'high',
        },
      ],
      agreedTerms: [],
      outcomeNotes: '',
      notes: 'Pre-read shared with Riley; objective is to trade allocation against notice period rather than argue headcount.',
      escalationCaseId: null,
      autoPropagate: true,
      createdAt: new Date(ts(7)).toISOString(),
      updatedAt: new Date(ts(2)).toISOString(),
    },
    {
      id: scopeNegotiationId,
      title: 'Launch-week support scope trade-off',
      kind: 'scope-deadline',
      status: 'agreed',
      counterparty: 'Nadia Haddad',
      counterpartyRole: 'Sales Operations Lead',
      ownerId: samuel,
      linkedGoalId: state.goals[0].id,
      sourceType: null,
      sourceId: null,
      openedOn: at(41),
      nextSessionOn: null,
      reviewOn: null,
      closedOn: at(20),
      strategic: false,
      stakesValue: 12000,
      stakesCurrency: 'USD',
      ourBatnaDescription: 'Hold the original scope and let Sales staff the launch desk from their own rota for the week.',
      ourBatnaValue: 12000,
      ourBatnaUnit: 'USD',
      theirBatnaEstimate: 'Sales could borrow two people from the EMEA pod, but coverage would be thinner outside business hours.',
      ourInterests: ['Protect the escalation rota rebuild from interruption', 'Keep launch promises realistic'],
      theirInterests: ['Weekend launch coverage without overtime escalation', 'One named support contact for the week'],
      objectiveCriteria: ['Incident volume from the previous two launches', 'Overtime cost rate in the support handbook'],
      options: ['Named launch contact plus on-call backup, scope frozen for the week', 'Full rota coverage in exchange for Sales-funded backfill day'],
      issues: [
        {
          id: id('niss'), name: 'Support coverage hours', unit: 'hours', direction: 'minimize', weight: 4,
          ourReservation: 40, ourTarget: 24, theirReservation: 24, theirTarget: 32, estimateConfidence: 'high',
        },
        {
          id: id('niss'), name: 'Backfill days funded by Sales', unit: 'days', direction: 'maximize', weight: 3,
          ourReservation: 1, ourTarget: 3, theirReservation: 3, theirTarget: 2, estimateConfidence: 'medium',
        },
      ],
      agreedTerms: [
        {
          id: id('nterm'), issueId: null, text: 'Samuel’s rota names one launch-week contact and one on-call backup; scope frozen during launch week.',
          ownerId: samuel, dueOn: at(-12), agreedValue: 32, unit: 'hours',
        },
        {
          id: id('nterm'), issueId: null, text: 'Sales funds two backfill days so the rota rebuild stays on schedule.',
          ownerId: freya, dueOn: at(-10), agreedValue: 2, unit: 'days',
        },
      ],
      outcomeNotes: 'Closed on the package option: 32 coverage hours against two funded backfill days. Both terms have owners and follow-up delegations.',
      notes: 'Agreement recorded after two sessions; reservation envelopes overlapped on both issues throughout.',
      escalationCaseId: null,
      autoPropagate: true,
      createdAt: new Date(ts(41)).toISOString(),
      updatedAt: new Date(ts(20)).toISOString(),
    },
  ];


  // Budget & Finance — healthy baseline: forecast well inside the ceiling,
  // evidenced actuals on spent lines, one future encumbrance funding the
  // Aurora negotiation, and nothing actuals-due or overdue, so the demo
  // fires no FIN-* insight rules.
  const demoBudgetId = id('bud');
  state.budgets = [
    {
      id: demoBudgetId,
      name: 'Platform team operating budget',
      currency: 'USD',
      limit: 120000,
      periodLabel: 'Current quarter',
      startsOn: at(60),
      endsOn: at(-30),
      status: 'active',
      ownerId: priya,
      note: 'Approved envelope for platform tooling, training and events. Ceiling, not a target: unspent authority returns at quarter end.',
      lines: [
        {
          id: id('bline'), title: 'Team offsite venue and travel', category: 'travel-events', status: 'spent',
          committedAmount: 8000, actualAmount: 7640, committedOn: at(45), expectedOn: at(22), spentOn: at(20),
          releasedOn: null, releasedReason: '', actualsDueOn: null,
          sourceType: null, sourceId: null, ownerId: jordan,
          note: 'Final venue invoice INV-2214; under the encumbered figure after the catering reduction.',
        },
        {
          id: id('bline'), title: 'Accessibility training cohort (8 seats)', category: 'training-development', status: 'spent',
          committedAmount: 6000, actualAmount: 6000, committedOn: at(30), expectedOn: at(12), spentOn: at(10),
          releasedOn: null, releasedReason: '', actualsDueOn: null,
          sourceType: 'goal', sourceId: state.goals[0].id, ownerId: freya,
          note: 'Provider invoice matched the quote exactly.',
        },
        {
          id: id('bline'), title: 'Aurora Cloud renewal — first-year commitment', category: 'tools-software', status: 'committed',
          committedAmount: 24000, actualAmount: null, committedOn: at(5), expectedOn: at(-14), spentOn: null,
          releasedOn: null, releasedReason: '', actualsDueOn: null,
          sourceType: 'negotiation', sourceId: vendorNegotiationId, ownerId: priya,
          note: 'Encumbered at the target end of the reservation envelope while terms are finalised.',
        },
        {
          id: id('bline'), title: 'Ergonomic equipment refresh', category: 'facilities-equipment', status: 'planned',
          committedAmount: 9000, actualAmount: null, committedOn: null, expectedOn: at(-21), spentOn: null,
          releasedOn: null, releasedReason: '', actualsDueOn: null,
          sourceType: null, sourceId: null, ownerId: samuel,
          note: 'Planned only — not yet an obligation; decide after the renewal lands.',
        },
      ],
      autoPropagate: true,
      createdAt: new Date(ts(58)).toISOString(),
      updatedAt: new Date(ts(5)).toISOString(),
    },
  ];

  state.links = [
    {
      id: id('lnk'),
      sourceType: 'case',
      sourceId: billingCaseId,
      targetType: 'delegation',
      targetId: state.delegations[0].id,
      relation: 'mitigates',
      ruleId: 'RULE-DEL-01',
      summary: 'Mei owns weekly billing reconciliation review',
      createdOn: at(14),
      createdAt: new Date(ts(14)).toISOString(),
    },
    {
      id: id('lnk'),
      sourceType: 'case',
      sourceId: billingCaseId,
      targetType: 'goal',
      targetId: state.goals[1].id,
      relation: 'impacts-goal',
      ruleId: 'RULE-GOAL-01',
      summary: 'Impacts zero-incident billing ledger migration goal',
      createdOn: at(14),
      createdAt: new Date(ts(14)).toISOString(),
    },
    {
      id: id('lnk'),
      sourceType: 'case',
      sourceId: billingCaseId,
      targetType: 'person',
      targetId: mei,
      relation: 'coaches',
      ruleId: 'RULE-COACH-01',
      summary: '1:1 support & Finance Ops air-cover for Mei',
      createdOn: at(14),
      createdAt: new Date(ts(14)).toISOString(),
    },
    {
      id: id('lnk'),
      sourceType: 'case',
      sourceId: escalationCaseId,
      targetType: 'decision',
      targetId: state.decisions[0].id,
      relation: 'decides',
      ruleId: 'RULE-DEC-01',
      summary: 'Pod structure DACI decision governs weekend rota trade-off',
      createdOn: at(9),
      createdAt: new Date(ts(9)).toISOString(),
    },
    {
      id: id('lnk'),
      sourceType: 'case',
      sourceId: escalationCaseId,
      targetType: 'delegation',
      targetId: state.delegations[1].id,
      relation: 'mitigates',
      ruleId: 'RULE-DEL-01',
      summary: 'Samuel owns cross-pod P1 escalation rota agreement',
      createdOn: at(9),
      createdAt: new Date(ts(9)).toISOString(),
    },
    {
      id: id('lnk'),
      sourceType: 'case',
      sourceId: escalationCaseId,
      targetType: 'goal',
      targetId: state.goals[2].id,
      relation: 'impacts-goal',
      ruleId: 'RULE-GOAL-01',
      summary: 'Impacts P1 <30m response goal',
      createdOn: at(9),
      createdAt: new Date(ts(9)).toISOString(),
    },
    {
      id: id('lnk'),
      sourceType: 'case',
      sourceId: escalationCaseId,
      targetType: 'person',
      targetId: samuel,
      relation: 'coaches',
      ruleId: 'RULE-COACH-01',
      summary: '1:1 air-cover & staffing escalation support for Samuel',
      createdOn: at(9),
      createdAt: new Date(ts(9)).toISOString(),
    },
    ...state.portfolio
      .filter((item) => item.sourceType === 'case')
      .map((item) => ({
        id: id('lnk'),
        sourceType: 'case',
        sourceId: item.sourceId,
        targetType: 'portfolio',
        targetId: item.id,
        relation: 'consumes-capacity',
        ruleId: 'RULE-CAP-01',
        summary: `Reserves ${item.effortDays.mostLikely} person-days for this case`,
        createdOn: item.createdOn,
        createdAt: item.createdAt,
      })),
    {
      id: id('lnk'),
      sourceType: 'requisition',
      sourceId: seniorReqId,
      targetType: 'portfolio',
      targetId: hiringPlanItemId,
      relation: 'consumes-capacity',
      ruleId: 'RULE-HIRE-01',
      summary: 'Interview effort for the senior platform engineer role',
      createdOn: at(46),
      createdAt: new Date(ts(46)).toISOString(),
    },
    {
      id: id('lnk'),
      sourceType: 'candidate',
      sourceId: 'cand-demo-1',
      targetType: 'requisition',
      targetId: seniorReqId,
      relation: 'assessed-for',
      ruleId: 'RULE-HIRE-02',
      summary: 'Noor Haddad assessed for Senior platform engineer',
      createdOn: at(24),
      createdAt: new Date(ts(24)).toISOString(),
    },
    {
      id: id('lnk'),
      sourceType: 'case',
      sourceId: billingCaseId,
      targetType: 'change',
      targetId: billingPodChangeId,
      relation: 'drives-change',
      ruleId: 'RULE-CHG-ESC',
      summary: 'Billing migration reconciliation risk drove dedicated Billing Pod split',
      createdOn: at(24),
      createdAt: new Date(ts(24)).toISOString(),
    },
    {
      id: id('lnk'),
      sourceType: 'change',
      sourceId: billingPodChangeId,
      targetType: 'portfolio',
      targetId: changeReserveItemId,
      relation: 'consumes-capacity',
      ruleId: 'RULE-CHG-01',
      summary: '6.3d transition effort reserved for Billing Pod split',
      createdOn: at(24),
      createdAt: new Date(ts(24)).toISOString(),
    },
    {
      id: id('lnk'),
      sourceType: 'change',
      sourceId: billingPodChangeId,
      targetType: 'goal',
      targetId: state.goals[1].id,
      relation: 'impacts-goal',
      ruleId: 'RULE-CHG-05',
      summary: 'Billing Pod split backs zero-incident ledger migration goal',
      createdOn: at(24),
      createdAt: new Date(ts(24)).toISOString(),
    },
    {
      id: id('lnk'),
      sourceType: 'change',
      sourceId: billingPodChangeId,
      targetType: 'person',
      targetId: mei,
      relation: 'coaches',
      ruleId: 'RULE-CHG-03',
      summary: '1:1 transition support for Mei Lin Chen (Billing Pod Lead)',
      createdOn: at(24),
      createdAt: new Date(ts(24)).toISOString(),
    },
    {
      id: id('lnk'),
      sourceType: 'change',
      sourceId: triageHandoffChangeId,
      targetType: 'goal',
      targetId: state.goals[2].id,
      relation: 'impacts-goal',
      ruleId: 'RULE-CHG-05',
      summary: 'Anchored P1 handoff contract backs <30m response goal',
      createdOn: at(52),
      createdAt: new Date(ts(52)).toISOString(),
    },
    ...state.portfolio
      .filter((item) => item.sourceType === 'goal')
      .map((item) => ({
        id: id('lnk'),
        sourceType: 'portfolio',
        sourceId: item.id,
        targetType: 'goal',
        targetId: item.sourceId,
        relation: 'impacts-goal',
        ruleId: 'RULE-CAP-03',
        summary: item.decision === 'funded' ? 'Funds capacity for this goal' : 'Removes capacity from this goal',
        createdOn: item.createdOn,
        createdAt: item.createdAt,
      })),
    // Negotiation Workbench edges (the shapes RULE-NEG-01 / RULE-NEG-02 create
    // at runtime), so the demo graph is connected on first load.
    {
      id: id('lnk'),
      sourceType: 'negotiation',
      sourceId: vendorNegotiationId,
      targetType: 'goal',
      targetId: state.goals[1].id,
      relation: 'impacts-goal',
      ruleId: 'RULE-NEG-01',
      summary: 'Renewal terms affect the zero-incident billing ledger migration goal',
      createdOn: at(18),
      createdAt: new Date(ts(18)).toISOString(),
    },
    {
      id: id('lnk'),
      sourceType: 'negotiation',
      sourceId: vendorNegotiationId,
      targetType: 'decision',
      targetId: vendorMandateDecisionId,
      relation: 'decides',
      ruleId: 'RULE-NEG-01',
      summary: 'Mandate decision: pursue agreement or execute the BATNA',
      createdOn: at(18),
      createdAt: new Date(ts(18)).toISOString(),
    },
    {
      id: id('lnk'),
      sourceType: 'negotiation',
      sourceId: vendorNegotiationId,
      targetType: 'person',
      targetId: priya,
      relation: 'coaches',
      ruleId: 'RULE-NEG-01',
      summary: '1:1 coaching support for the high-stakes vendor negotiation',
      createdOn: at(18),
      createdAt: new Date(ts(18)).toISOString(),
    },
    {
      id: id('lnk'),
      sourceType: 'negotiation',
      sourceId: scopeNegotiationId,
      targetType: 'delegation',
      targetId: state.delegations[2].id,
      relation: 'tracks-followup',
      ruleId: 'RULE-NEG-02',
      summary: 'Delegation tracks the funded backfill-days term of the launch-week agreement',
      createdOn: at(20),
      createdAt: new Date(ts(20)).toISOString(),
    },
  ];


  // Budget funds edges (the shape RULE-FIN-02 creates at runtime).
  state.links.push(
    {
      id: id('lnk'),
      sourceType: 'budget',
      sourceId: demoBudgetId,
      targetType: 'negotiation',
      targetId: vendorNegotiationId,
      relation: 'funds',
      ruleId: 'RULE-FIN-02',
      summary: 'Budget funds negotiation: Aurora Cloud renewal first-year commitment',
      createdOn: at(5),
      createdAt: new Date(ts(5)).toISOString(),
    },
    {
      id: id('lnk'),
      sourceType: 'budget',
      sourceId: demoBudgetId,
      targetType: 'goal',
      targetId: state.goals[0].id,
      relation: 'funds',
      ruleId: 'RULE-FIN-02',
      summary: 'Budget funds goal: accessibility training cohort',
      createdOn: at(30),
      createdAt: new Date(ts(30)).toISOString(),
    },
  );

  // Stakeholder Influence Register (Schema v25). Every embedded case/change
  // stub and negotiation counterparty in this demo has a strict register
  // match, so reconciliation coverage is 100% and STK-02 stays silent. The
  // one deliberately adverse veto player (Dana Kowalski on the pod change)
  // demonstrates the Tsebelis detection path; contact cadences are current
  // and veto evidence is high-confidence, so no other STK signal fires.
  const stkDana = id('stk');
  const stkPriya = id('stk');
  const stkMei = id('stk');
  const stkController = id('stk');
  const stkHop = id('stk');
  const stkEsl = id('stk');
  const stkVpcs = id('stk');
  const stkSpl = id('stk');
  const stkElena = id('stk');
  const stkRiley = id('stk');
  const stkNadia = id('stk');
  const stkSamuel = id('stk');

  const stkBase = {
    status: 'active',
    autoPropagate: true,
    lastContactOn: at(5),
    nextContactOn: at(-7),
    preferredComms: '',
    keyMessage: '',
    influenceNotes: '',
    vetoBasis: '',
    tags: [],
    contactLog: [{ id: id('stkcontact'), on: at(5), note: 'Regular alignment check-in' }],
  };

  state.stakeholders = [
    {
      ...stkBase, id: stkDana, name: 'Dana Kowalski', org: 'Central Operations', role: 'Director of Operations',
      category: 'internal-exec', power: 5, interest: 4, legitimacy: 4, urgency: 3,
      vetoPlayer: true, vetoBasis: 'Holds the operational sign-off gate for platform reorganisation',
      stance: 'skeptical', estimateConfidence: 'high', commsCadence: 'weekly',
      alliances: [{ id: id('stkall'), targetId: stkController, kind: 'alliance', strength: 4 }],
      stanceHistory: [
        { id: id('stkhist'), on: at(30), stance: 'supportive', context: 'Backed the original pod concept', sourceType: null, sourceId: null },
        { id: id('stkhist'), on: at(20), stance: 'skeptical', context: 'Concerned about support coverage during the split', sourceType: 'change', sourceId: billingPodChangeId },
      ],
    },
    {
      ...stkBase, id: stkPriya, name: 'Priya Natarajan', org: 'Platform', role: 'Engineering Lead',
      personId: priya, category: 'internal-report', power: 4, interest: 5, legitimacy: 4, urgency: 4,
      vetoPlayer: true, vetoBasis: 'Architecture approval for service boundaries',
      stance: 'supportive', estimateConfidence: 'high', commsCadence: 'immediate',
      alliances: [{ id: id('stkall'), targetId: stkMei, kind: 'alliance', strength: 5 }],
      stanceHistory: [
        { id: id('stkhist'), on: at(25), stance: 'supportive', context: 'Co-owns the target topology', sourceType: null, sourceId: null },
      ],
    },
    {
      ...stkBase, id: stkMei, name: 'Mei Lin Chen', org: 'Platform', role: 'Staff Engineer',
      personId: mei, category: 'internal-report', power: 3, interest: 5, legitimacy: 4, urgency: 3,
      vetoPlayer: false, stance: 'champion', estimateConfidence: 'high', commsCadence: 'weekly',
      alliances: [],
      stanceHistory: [
        { id: id('stkhist'), on: at(18), stance: 'champion', context: 'Volunteered to lead the billing extraction', sourceType: 'change', sourceId: billingPodChangeId },
      ],
    },
    {
      ...stkBase, id: stkController, name: 'Controller (Finance Ops)', org: 'Finance', role: 'Group Controller',
      category: 'internal-exec', power: 5, interest: 3, legitimacy: 5, urgency: 2,
      vetoPlayer: false, stance: 'skeptical', estimateConfidence: 'high', commsCadence: 'milestone',
      alliances: [], stanceHistory: [],
    },
    {
      ...stkBase, id: stkHop, name: 'Head of Platform', org: 'Platform', role: 'Head of Platform',
      category: 'internal-exec', power: 4, interest: 4, legitimacy: 4, urgency: 2,
      vetoPlayer: false, stance: 'supportive', estimateConfidence: 'high', commsCadence: 'weekly',
      alliances: [{ id: id('stkall'), targetId: stkDana, kind: 'influences', strength: 4 }],
      stanceHistory: [],
    },
    {
      ...stkBase, id: stkEsl, name: 'Enterprise Support Lead', org: 'Customer Support', role: 'Enterprise Support Lead',
      category: 'internal-peer', power: 3, interest: 4, legitimacy: 4, urgency: 3,
      vetoPlayer: false, stance: 'supportive', estimateConfidence: 'medium', commsCadence: 'weekly',
      alliances: [], stanceHistory: [],
    },
    {
      ...stkBase, id: stkVpcs, name: 'VP Customer Success', org: 'Customer Success', role: 'VP Customer Success',
      category: 'internal-exec', power: 5, interest: 4, legitimacy: 4, urgency: 4,
      vetoPlayer: false, stance: 'blocker', estimateConfidence: 'high', commsCadence: 'immediate',
      alliances: [{ id: id('stkall'), targetId: stkSpl, kind: 'alliance', strength: 3 }],
      stanceHistory: [
        { id: id('stkhist'), on: at(12), stance: 'blocker', context: 'Escalation workload feared during handoff changes', sourceType: 'case', sourceId: escalationCaseId },
      ],
    },
    {
      ...stkBase, id: stkSpl, name: 'Support Pod Leads', org: 'Customer Support', role: 'Support pod leadership group',
      category: 'internal-peer', power: 2, interest: 4, legitimacy: 3, urgency: 3,
      vetoPlayer: false, stance: 'skeptical', estimateConfidence: 'medium', commsCadence: 'milestone',
      alliances: [], stanceHistory: [],
    },
    {
      ...stkBase, id: stkElena, name: 'Elena Voss', org: 'Aurora Cloud', role: 'Enterprise Account Director',
      category: 'external-vendor', power: 3, interest: 4, legitimacy: 3, urgency: 2,
      vetoPlayer: false, stance: 'supportive', estimateConfidence: 'medium', commsCadence: 'milestone',
      alliances: [], stanceHistory: [],
    },
    {
      ...stkBase, id: stkRiley, name: 'Riley Brooks', org: 'Growth Marketing', role: 'Marketing Director',
      category: 'external-client', power: 2, interest: 3, legitimacy: 3, urgency: 2,
      vetoPlayer: false, stance: 'neutral', estimateConfidence: 'medium', commsCadence: 'digest',
      alliances: [], stanceHistory: [],
    },
    {
      ...stkBase, id: stkNadia, name: 'Nadia Haddad', org: 'Sales Operations', role: 'Sales Operations Lead',
      category: 'external-client', power: 2, interest: 3, legitimacy: 3, urgency: 2,
      vetoPlayer: false, stance: 'neutral', estimateConfidence: 'medium', commsCadence: 'digest',
      alliances: [], stanceHistory: [],
    },
    {
      ...stkBase, id: stkSamuel, name: 'Samuel Okafor', org: 'Customer Support', role: 'Support Team Lead',
      personId: samuel, category: 'internal-report', power: 3, interest: 4, legitimacy: 4, urgency: 3,
      vetoPlayer: true, vetoBasis: 'Incident-command sign-off for support process changes',
      stance: 'supportive', estimateConfidence: 'high', commsCadence: 'weekly',
      alliances: [], stanceHistory: [],
    },
  ];

  // Involvement edges in exactly the shape RULE-STK-01 writes at runtime.
  const involves = (sourceType, sourceId, stakeholderId, name) => ({
    id: id('lnk'),
    sourceType,
    sourceId,
    targetType: 'stakeholder',
    targetId: stakeholderId,
    relation: 'involves',
    ruleId: 'RULE-STK-01',
    summary: `Stakeholder involvement: ${name}`,
    createdOn: at(10),
    createdAt: new Date(ts(10)).toISOString(),
  });
  state.links.push(
    involves('case', billingCaseId, stkController, 'Controller (Finance Ops)'),
    involves('case', billingCaseId, stkHop, 'Head of Platform'),
    involves('case', billingCaseId, stkEsl, 'Enterprise Support Lead'),
    involves('case', escalationCaseId, stkVpcs, 'VP Customer Success'),
    involves('case', escalationCaseId, stkSpl, 'Support Pod Leads'),
    involves('change', billingPodChangeId, stkMei, 'Mei Lin Chen'),
    involves('change', billingPodChangeId, stkDana, 'Dana Kowalski'),
    involves('change', billingPodChangeId, stkPriya, 'Priya Natarajan'),
    involves('negotiation', vendorNegotiationId, stkElena, 'Elena Voss'),
    involves('negotiation', secondmentNegotiationId, stkRiley, 'Riley Brooks'),
    involves('negotiation', scopeNegotiationId, stkNadia, 'Nadia Haddad'),
    involves('change', triageHandoffChangeId, stkSamuel, 'Samuel Okafor'),
  );

  state.settings.leaderName = 'Alex Rivera';
  state.settings.teamName = 'Platform';
  state.settings.orgName = 'Northwind';

  // Run it through the same normalizer every import uses, so the demo can
  // never produce a state the real app would reject.
  return normalizeState(state, { now }).state;
}
