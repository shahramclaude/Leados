// seed.ts — synthetic demo roster + event log.
// ORIGINAL to this session, loosely modeled on the *idea* (not the code) of
// wbweve/Leados's own seed.ts, whose existence was confirmed via the
// src/lib directory listing but whose contents were not fetched this
// session (disclosed scope limit — see AI-SESSION-LOG.md §2, V6). That repo
// uses a seeded PRNG for determinism; this one uses Math.random(), a
// disclosed simplification since determinism is not required for a demo
// dataset here.

import { AppState, EventType } from './types';
import { addPerson, appendEvent } from './store';

function daysAgoISO(days: number, jitterHours = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - Math.round(Math.random() * jitterHours));
  return d.toISOString();
}

function withTs(state: AppState, type: EventType, data: Record<string, any>, personId: string | undefined, ts: string): AppState {
  const next = appendEvent(state, type, data, personId);
  const ev = next.events[next.events.length - 1];
  ev.ts = ts;
  return next;
}

export function seedSampleData(state: AppState): AppState {
  let s = state;
  s = addPerson(s, 'Maya Chen', 'Eng Manager', null);
  s = addPerson(s, 'Diego Alvarez', 'Senior Engineer', s.people[s.people.length - 1]?.id || null);
  s = addPerson(s, 'Priya Nair', 'Product Manager', null);
  s = addPerson(s, 'Sam Okafor', 'Designer', null);
  s = addPerson(s, 'Jules Petit', 'Engineer', null);

  const [maya, diego, priya, sam, jules] = s.people;

  // Recent + overdue 1:1s to make R1 interesting
  s = withTs(s, 'oneonone.logged', { note: 'Discussed Q3 roadmap risks', style: 'plan' }, maya.id, daysAgoISO(5));
  s = withTs(s, 'oneonone.logged', { note: 'Career growth check-in', style: 'direct' }, diego.id, daysAgoISO(28));
  s = withTs(s, 'oneonone.logged', { note: 'Onboarding feedback', style: 'plan' }, priya.id, daysAgoISO(9));
  // sam: no 1:1 logged at all (should fire R1 with low confidence)
  s = withTs(s, 'oneonone.logged', { note: 'Design system cadence', style: 'direct' }, jules.id, daysAgoISO(40));

  // Skip-levels
  s = withTs(s, 'skip.logged', { note: 'Skip-level with Diego' }, diego.id, daysAgoISO(70));

  // Decisions: one closed, one stale/open
  s = withTs(s, 'decision.made', { title: 'Adopt new deploy pipeline', severity: 3, style: 'plan' }, maya.id, daysAgoISO(40));
  const decisionId1 = s.events[s.events.length - 1].id;
  s = withTs(
    s,
    'decision.outcome',
    { decisionId: decisionId1, result: 'Shipped, reduced deploy time 30%', lessons: 'Pilot with one team before org-wide rollout next time' },
    maya.id,
    daysAgoISO(25)
  );

  s = withTs(s, 'decision.made', { title: 'Freeze hiring for Q3', severity: 4, style: 'direct' }, maya.id, daysAgoISO(30));
  // no outcome logged -> should fire R3 (stale decision)

  // Crisis with postmortem
  s = withTs(s, 'crisis.logged', { what: 'Production outage, checkout down 40 min' }, maya.id, daysAgoISO(20));
  const crisisId = s.events[s.events.length - 1].id;
  s = withTs(
    s,
    'crisis.postmortem',
    {
      crisisId,
      what_happened: 'Checkout service outage caused by unbounded retry loop',
      what_went_well: ['Fast detection via alerting', 'Clear incident commander rotation'],
      contributing_factors: ['missing rate limit', 'no circuit breaker'],
      action_items: [{ action: 'Add circuit breaker to payment gateway client' }, { action: 'Add retry budget alerting' }],
    },
    maya.id,
    daysAgoISO(18)
  );

  // Second crisis with NO postmortem yet -> should fire R4
  s = withTs(s, 'crisis.logged', { what: 'Data pipeline silently dropped events for 2 days' }, maya.id, daysAgoISO(4));

  // Goals: one with owner, one without
  s = withTs(s, 'goal.set', { title: 'Reduce P1 incident count 50%', owner: diego.id }, diego.id, daysAgoISO(15));
  s = withTs(s, 'goal.set', { title: 'Improve onboarding NPS' }, undefined, daysAgoISO(12)); // no owner -> R5

  // Feedback + reflection, for institutional memory
  s = withTs(s, 'feedback.logged', { note: 'Gave Sam direct feedback on review turnaround' }, sam.id, daysAgoISO(6));
  s = withTs(
    s,
    'reflection.logged',
    { patterns: ['I default to writing the plan myself instead of delegating it', 'I postpone hard conversations by a week on average'] },
    maya.id,
    daysAgoISO(2)
  );

  const audit = [...s.audit, { ts: new Date().toISOString(), action: 'seeded', ref: 'sample-data-v1' }];
  return { ...s, audit };
}
