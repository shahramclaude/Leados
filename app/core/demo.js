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
      createdAt: new Date(ts(9)).toISOString(),
      updatedAt: new Date(ts(2)).toISOString(),
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
  ];

  state.settings.leaderName = 'Alex Rivera';
  state.settings.teamName = 'Platform';
  state.settings.orgName = 'Northwind';

  // Run it through the same normalizer every import uses, so the demo can
  // never produce a state the real app would reject.
  return normalizeState(state, { now }).state;
}
