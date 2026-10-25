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
          due: at(30), addedOn: at(40), done: false, personId: mei, carriedToId: memoCurrent,
        },
        {
          id: memoCurrent, text: 'Publish a decision memo format and use it on the billing migration',
          due: at(10), addedOn: at(40), done: false, personId: mei, carriedFromId: memoOriginal,
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
  ];

  state.settings.leaderName = 'Alex Rivera';
  state.settings.teamName = 'Platform';
  state.settings.orgName = 'Northwind';

  // Run it through the same normalizer every import uses, so the demo can
  // never produce a state the real app would reject.
  return normalizeState(state).state;
}
