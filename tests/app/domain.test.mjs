import test from 'node:test';
import assert from 'node:assert/strict';

import { validateSBI, personFeedbackStats, followUpsDue } from '../../app/core/domain/feedback.js';
import { keyResultProgress, goalProgress, goalPace, goalHealth, goalsSummary } from '../../app/core/domain/goals.js';
import { cadence, suggestAgenda, gradeMeeting, openActions } from '../../app/core/domain/oneonone.js';
import { aggregate, trend, participation, comments } from '../../app/core/domain/pulse.js';
import { teamHealth, dimensions } from '../../app/core/domain/health.js';
import { assess, evidenceFor, successionGaps } from '../../app/core/domain/readiness.js';
import { buildInsights, priorityOf, rollUpFindings } from '../../app/core/domain/insights.js';
import { openDecisions, reviewsDue, decisionQuality } from '../../app/core/domain/decisions.js';
import { createEmptyState, DEFAULT_SETTINGS } from '../../app/core/schema.js';
import { buildDemoState } from '../../app/core/demo.js';

const NOW = new Date('2026-10-24T10:00:00.000Z');
const iso = NOW.toISOString();
const settings = { ...DEFAULT_SETTINGS };

function person(id, name, extra = {}) {
  return {
    id, name, role: 'Engineer', level: 'ic', team: 'Core', managerId: null,
    startDate: '2025-01-01', focus: '', status: 'active', createdAt: '2025-01-01T09:00:00.000Z', archivedAt: null,
    ...extra,
  };
}

function stateWith(overrides = {}) {
  const state = createEmptyState(iso);
  state.people = overrides.people || [];
  for (const key of ['oneOnOnes', 'feedback', 'goals', 'growthPlans', 'pulses', 'decisions', 'recognition', 'readiness']) {
    if (overrides[key]) state[key] = overrides[key];
  }
  if (overrides.settings) state.settings = { ...state.settings, ...overrides.settings };
  return state;
}

/* ------------------------------------------------------------------ SBI */

test('SBI: a complete, specific note scores highest', () => {
  const result = validateSBI({
    situation: 'In the Thursday architecture review, when the schema change came up',
    behavior: 'you brought a one-page comparison of both migration approaches',
    impact: 'the decision took ten minutes instead of being pushed to another meeting',
  });
  assert.equal(result.complete, true);
  assert.equal(result.quality, 4);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.tips, []);
});

test('SBI: missing fields are reported and quality drops', () => {
  const result = validateSBI({ situation: 'Standup on Monday', behavior: '', impact: '' });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ['behavior', 'impact']);
  assert.equal(result.quality, 1);
});

test('SBI: vague language produces coaching, not a block', () => {
  const result = validateSBI({
    situation: 'During the release retro on Friday afternoon',
    behavior: 'you always show a bad attitude about the deployment process',
    impact: 'the team stopped raising deployment concerns',
  });
  assert.equal(result.complete, true, 'the note can still be saved');
  assert.ok(result.tips.some((t) => t.includes('always/never')));
  assert.ok(result.tips.some((t) => t.toLowerCase().includes('judgement')));
  assert.ok(result.quality <= 3);
});

test('SBI: empty input never throws', () => {
  const result = validateSBI({});
  assert.equal(result.quality, 0);
  assert.equal(result.complete, false);
});

test('feedback balance: praise-only is flagged, mixed is balanced', () => {
  const base = stateWith({
    people: [person('p1', 'Ada')],
    feedback: [
      { id: 'f1', personId: 'p1', direction: 'given', kind: 'praise', date: '2026-10-20' },
      { id: 'f2', personId: 'p1', direction: 'given', kind: 'praise', date: '2026-10-18' },
      { id: 'f3', personId: 'p1', direction: 'given', kind: 'praise', date: '2026-10-16' },
    ],
  });
  const stats = personFeedbackStats(base, 'p1', NOW, settings);
  assert.equal(stats.balance, 'praise-only');
  assert.equal(stats.praiseRatio, 1);
  assert.equal(stats.isStale, false);

  base.feedback.push({ id: 'f4', personId: 'p1', direction: 'given', kind: 'constructive', date: '2026-10-22' });
  assert.equal(personFeedbackStats(base, 'p1', NOW, settings).balance, 'balanced');
});

test('feedback: stale detection respects the configured target', () => {
  const state = stateWith({
    people: [person('p1', 'Ada')],
    feedback: [{ id: 'f1', personId: 'p1', direction: 'given', kind: 'praise', date: '2026-09-01' }],
  });
  assert.equal(personFeedbackStats(state, 'p1', NOW, settings).isStale, true);
  assert.equal(personFeedbackStats(state, 'p1', NOW, { ...settings, feedbackTargetDays: 365 }).isStale, false);
});

/* ----------------------------------------------------------------- goals */

test('goals: key result progress works for rising and falling targets', () => {
  assert.equal(keyResultProgress({ start: 0, target: 100, current: 50 }), 0.5);
  assert.equal(keyResultProgress({ start: 24, target: 10, current: 17 }), 0.5, 'lower-is-better targets');
  assert.equal(keyResultProgress({ start: 0, target: 100, current: 140 }), 1, 'clamped above target');
  assert.equal(keyResultProgress({ start: 0, target: 100, current: -20 }), 0, 'clamped below start');
  assert.equal(keyResultProgress({ start: 5, target: 5, current: 5 }), 1);
  assert.equal(keyResultProgress({ start: 5, target: 5, current: 4 }), 0);
});

test('goals: progress is derived from key results, never guessed', () => {
  assert.equal(goalProgress({ keyResults: [] }), null, 'no KRs means unknown, not zero');
  assert.equal(
    goalProgress({
      keyResults: [
        { start: 0, target: 100, current: 100 },
        { start: 0, target: 100, current: 0 },
      ],
    }),
    50,
  );
});

test('goals: pace detects behind, on-track, ahead and overdue', () => {
  const base = { createdAt: '2026-08-25T00:00:00.000Z', dueDate: '2026-11-23', status: 'active' };
  const kr = (current) => [{ id: 'k', title: 'x', start: 0, target: 100, current }];
  const behind = goalPace({ ...base, keyResults: kr(20) }, NOW);
  assert.equal(behind.status, 'behind');
  assert.ok(behind.gap < -15);

  const onTrack = goalPace({ ...base, keyResults: kr(60) }, NOW);
  assert.equal(onTrack.status, 'on-track');

  const ahead = goalPace({ ...base, keyResults: kr(95) }, NOW);
  assert.equal(ahead.status, 'ahead');

  const overdue = goalPace({ ...base, dueDate: '2026-10-01', keyResults: kr(80) }, NOW);
  assert.equal(overdue.status, 'overdue');
  assert.ok(overdue.daysLeft < 0);

  const noKr = goalPace({ ...base, keyResults: [] }, NOW);
  assert.equal(noKr.status, 'no-kr');
  assert.equal(noKr.progressPct, null);
});

test('goals: health surfaces a mismatch between stated confidence and computed pace', () => {
  const goal = {
    status: 'active',
    confidence: 'on-track',
    createdAt: '2026-08-25T00:00:00.000Z',
    dueDate: '2026-11-23',
    keyResults: [{ id: 'k', title: 'x', start: 0, target: 100, current: 5 }],
  };
  const health = goalHealth(goal, NOW);
  assert.equal(health.stated, 'on-track');
  assert.equal(health.computed, 'at-risk');
  assert.equal(health.health, 'at-risk', 'the worst of the two wins');
  assert.equal(health.mismatch, true);
});

test('goals: a completed goal reports done regardless of dates', () => {
  const pace = goalPace({ status: 'done', dueDate: '2020-01-01', keyResults: [] }, NOW);
  assert.equal(pace.status, 'done');
  assert.equal(pace.progressPct, 100);
});

/* -------------------------------------------------------------- cadence */

test('cadence: never / due / overdue are distinguished', () => {
  const s = stateWith({ people: [person('p1', 'Ada')], settings: { oneOnOneCadenceDays: 7 } });
  assert.equal(cadence(s, 'p1', NOW, s.settings).status, 'never');

  s.oneOnOnes = [{ id: 'm1', personId: 'p1', date: '2026-10-20', status: 'held', actions: [] }];
  const soon = cadence(s, 'p1', NOW, s.settings);
  assert.equal(soon.status, 'ok', 'four days after a weekly 1:1 is still fine');
  assert.equal(soon.daysSinceHeld, 4);
  assert.equal(soon.dueInDays, 3);

  s.oneOnOnes = [{ id: 'm1b', personId: 'p1', date: '2026-10-16', status: 'held', actions: [] }];
  const due = cadence(s, 'p1', NOW, s.settings);
  assert.equal(due.status, 'due', 'eight days after a weekly 1:1 is due');
  assert.equal(due.dueInDays, -1);

  s.oneOnOnes = [{ id: 'm2', personId: 'p1', date: '2026-10-01', status: 'held', actions: [] }];
  const late = cadence(s, 'p1', NOW, s.settings);
  assert.equal(late.status, 'overdue');
  assert.equal(late.overdueDays, 16);
});

test('cadence: reschedules count against adherence and build a streak', () => {
  const s = stateWith({
    people: [person('p1', 'Ada')],
    oneOnOnes: [
      { id: 'm1', personId: 'p1', date: '2026-10-23', status: 'skipped', actions: [] },
      { id: 'm2', personId: 'p1', date: '2026-10-16', status: 'moved', actions: [] },
      { id: 'm3', personId: 'p1', date: '2026-10-09', status: 'held', actions: [] },
    ],
  });
  const c = cadence(s, 'p1', NOW, s.settings);
  assert.equal(c.skippedStreak, 2);
  assert.equal(c.heldLast4, 1);
  assert.equal(c.scheduledLast4, 3);
  assert.equal(c.adherence, 1 / 3);
});

test('agenda: suggestions carry a reason, are deduped, and are capped', () => {
  const s = stateWith({
    people: [person('p1', 'Ada')],
    oneOnOnes: [
      { id: 'm1', personId: 'p1', date: '2026-10-23', status: 'skipped', actions: [] },
      { id: 'm2', personId: 'p1', date: '2026-10-16', status: 'moved', actions: [{ id: 'a1', text: 'Send the doc', due: '2026-10-20', done: false }] },
    ],
    goals: [{ id: 'g1', ownerId: 'p1', title: 'Ship X', status: 'active', confidence: 'at-risk', keyResults: [], checkins: [], createdAt: '2026-09-01T00:00:00.000Z', dueDate: '2026-12-01' }],
  });
  const suggestions = suggestAgenda(s, 'p1', NOW, s.settings);
  assert.ok(suggestions.length >= 4 && suggestions.length <= 8);
  for (const suggestion of suggestions) {
    assert.ok(suggestion.reason && suggestion.reason.length > 10, 'every suggestion explains itself');
    assert.ok(suggestion.source);
  }
  const texts = suggestions.map((x) => x.text.toLowerCase());
  assert.equal(new Set(texts).size, texts.length, 'no duplicates');
  assert.ok(suggestions.some((x) => x.source === 'cadence'));
  assert.ok(suggestions.some((x) => x.source === 'action'), 'overdue action items appear');
  assert.ok(suggestions.some((x) => x.source === 'goal'), 'at-risk goals appear');
});

test('agenda: a healthy person still gets an agenda (no dead end)', () => {
  const s = stateWith({ people: [person('p1', 'Ada')] });
  const suggestions = suggestAgenda(s, 'p1', NOW, s.settings);
  assert.ok(suggestions.length >= 2);
  assert.ok(suggestions.every((x) => x.text.length > 0));
});

test('meeting grading rewards notes, actions and mood', () => {
  const good = gradeMeeting({
    notes: 'Talked through the delivery risk and agreed to drop the second bet.',
    actions: [{ id: 'a1', text: 'Email the customer', due: '2026-10-30' }],
    mood: 4,
    agenda: [{ id: 'g', text: 'Wins', done: true }],
  });
  const bad = gradeMeeting({ notes: '', actions: [], mood: null, agenda: [] });
  assert.equal(good.score, 100);
  assert.equal(bad.score, 25);
  assert.ok(bad.notes.length >= 1);
});

test('open actions sort overdue first', () => {
  const s = stateWith({
    people: [person('p1', 'Ada')],
    oneOnOnes: [{
      id: 'm1', personId: 'p1', date: '2026-10-01', status: 'held',
      actions: [
        { id: 'a1', text: 'Later thing', due: '2026-12-01', done: false },
        { id: 'a2', text: 'Overdue thing', due: '2026-10-10', done: false },
        { id: 'a3', text: 'Done thing', due: '2026-10-11', done: true },
      ],
    }],
  });
  const actions = openActions(s, { now: NOW });
  assert.equal(actions.length, 2);
  assert.equal(actions[0].text, 'Overdue thing');
  assert.equal(actions[0].overdue, true);
});

/* ---------------------------------------------------------------- pulse */

test('pulse: aggregates are suppressed below the anonymity floor', () => {
  const s = stateWith({
    people: [person('p1', 'A'), person('p2', 'B')],
    pulses: [
      { id: 'x1', date: '2026-10-20', anonymity: 'anonymous', scores: { safety: 2, clarity: 2, workload: 2, growth: 2 } },
      { id: 'x2', date: '2026-10-21', anonymity: 'anonymous', scores: { safety: 2, clarity: 2, workload: 2, growth: 2 } },
    ],
  });
  const blocked = aggregate(s, NOW);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.blockedReason, 'threshold');
  assert.equal(blocked.n, 2);
  assert.equal(blocked.overall, null, 'no number is returned when it could identify someone');
  assert.equal(blocked.dimensions.safety.avg, null);

  // Five responses is the published default floor (Culture Amp, 15Five).
  s.pulses.push({ id: 'x3', date: '2026-10-22', anonymity: 'anonymous', scores: { safety: 5, clarity: 4, workload: 3, growth: 4 } });
  s.pulses.push({ id: 'x4', date: '2026-10-22', anonymity: 'anonymous', scores: { safety: 4, clarity: 4, workload: 3, growth: 4 } });
  assert.equal(aggregate(s, NOW).blocked, true, 'four responses is still below the floor');

  s.pulses.push({ id: 'x5', date: '2026-10-23', anonymity: 'anonymous', scores: { safety: 3, clarity: 4, workload: 2, growth: 4 } });
  const open = aggregate(s, NOW);
  assert.equal(open.blocked, false);
  assert.equal(open.n, 5);
  assert.equal(open.dimensions.safety.avg, 3.2);
  assert.equal(open.lowest.key, 'workload', 'workload (2.4/5) is the weakest dimension here');
});

test('pulse: identical answers stay hidden even when the group is large enough', () => {
  const pulses = Array.from({ length: 6 }, (_, i) => ({
    id: `u${i}`, date: '2026-10-22', anonymity: 'anonymous',
    scores: { safety: 2, clarity: 2, workload: 2, growth: 2 },
  }));
  const s = stateWith({ people: [person('p1', 'A')], pulses });
  const result = aggregate(s, NOW);
  assert.equal(result.blocked, true, 'an average of identical answers is each individual answer');
  assert.equal(result.blockedReason, 'unanimous');
  assert.equal(result.overall, null);
});

test('pulse: comments are subject to the same floor as scores', () => {
  const s = stateWith({
    people: [person('p1', 'A')],
    pulses: [
      { id: 'c1', date: '2026-10-22', anonymity: 'anonymous', scores: { safety: 3 }, comment: 'I am drowning in on-call.' },
      { id: 'c2', date: '2026-10-22', anonymity: 'anonymous', scores: { safety: 3 }, comment: '' },
    ],
  });
  assert.deepEqual(comments(s, NOW), [], 'a lone comment in a small team is attributable');
  for (let i = 0; i < 3; i += 1) {
    s.pulses.push({ id: `c${i + 3}`, date: '2026-10-22', anonymity: 'anonymous', scores: { safety: 3 }, comment: 'Fine.' });
  }
  const released = comments(s, NOW);
  assert.equal(released.length, 4);
  assert.ok(released.every((c) => !('personId' in c)), 'comments never carry an identity');
});

test('pulse: trend is weekly and marks suppressed weeks as null', () => {
  const s = stateWith({
    people: [person('p1', 'A')],
    pulses: [
      { id: 'x1', date: '2026-10-21', anonymity: 'anonymous', scores: { safety: 4 } },
      { id: 'x2', date: '2026-10-20', anonymity: 'anonymous', scores: { safety: 4 } },
      { id: 'x3', date: '2026-10-19', anonymity: 'anonymous', scores: { safety: 4 } },
      { id: 'x4', date: '2026-10-14', anonymity: 'anonymous', scores: { safety: 2 } },
    ],
    settings: { pulseMinResponses: 3 },
  });
  const series = trend(s, NOW, { weeks: 3 });
  assert.equal(series.length, 3);
  assert.equal(series.at(-1).n, 3);
  assert.equal(series.at(-1).overall, 4);
  assert.equal(series.at(-2).blocked, true);
  assert.equal(series.at(-2).overall, null);
});

test('pulse: participation never claims to know who answered anonymously', () => {
  const s = stateWith({
    people: [person('p1', 'A'), person('p2', 'B')],
    pulses: [
      { id: 'x1', date: '2026-10-20', anonymity: 'anonymous', scores: { safety: 4 } },
      { id: 'x2', date: '2026-10-21', anonymity: 'named', personId: 'p1', scores: { safety: 4 } },
    ],
  });
  const p = participation(s, NOW);
  assert.equal(p.responses, 2);
  assert.equal(p.knownResponders, 1, 'only the named response is attributable');
  assert.equal(p.anonymousResponses, 1);
});

/* --------------------------------------------------------------- health */

test('health: an empty workspace returns no score rather than zero', () => {
  const health = teamHealth(createEmptyState(iso), NOW);
  assert.equal(health.overall, null);
  assert.equal(health.grade, '—');
  assert.ok(health.label.includes('No scored dimensions'));
});

test('health: a new joiner does not drag cadence to zero', () => {
  const s = stateWith({
    people: [person('new', 'Newbie', { startDate: '2026-10-23', createdAt: '2026-10-23T09:00:00.000Z' })],
    oneOnOnes: [],
  });
  const cadenceDim = dimensions(s, NOW).find((d) => d.key === 'cadence');
  assert.equal(cadenceDim.score, null, 'unmeasurable, not failing');
});

test('health: demo workspace scores every dimension and stays in range', () => {
  const demo = buildDemoState(NOW);
  const health = teamHealth(demo, NOW);
  assert.ok(health.overall > 0 && health.overall < 100);
  assert.equal(health.dimensions.length, 5);
  for (const dim of health.dimensions) {
    if (dim.score !== null) {
      assert.ok(dim.score >= 0 && dim.score <= 100, `${dim.key} in range`);
    }
  }
  assert.ok(health.coverage > 0.99, 'all five dimensions are measurable in the demo');
});

test('health: the trend refuses to invent history', () => {
  const s = stateWith({
    people: [person('p1', 'Ada')],
    oneOnOnes: [{ id: 'm1', personId: 'p1', date: '2026-10-23', status: 'held', actions: [] }],
    feedback: [{ id: 'f1', personId: 'p1', direction: 'given', kind: 'praise', date: '2026-10-22' }],
  });
  const health = teamHealth(s, NOW);
  assert.equal(health.trend.available, false);
  assert.ok(health.trend.reason.includes('Not enough history'));
});

/* ------------------------------------------------------------ readiness */

test('readiness: "ready now" without evidence is refused', () => {
  const s = stateWith({
    people: [person('p1', 'Ada')],
    readiness: [{ id: 'r1', personId: 'p1', seat: 'Staff engineer', rating: 'ready-now', updatedAt: '2026-09-01T00:00:00.000Z' }],
  });
  const result = assess(s, 'p1', NOW, s.settings);
  assert.equal(result.rating, 'ready-now');
  assert.equal(result.supported, false);
  assert.ok(result.warning.includes('evidence'));
});

test('readiness: evidence accumulates from real activity and then supports the rating', () => {
  const s = stateWith({
    people: [person('p1', 'Ada')],
    oneOnOnes: [
      { id: 'm1', personId: 'p1', date: '2026-10-01', status: 'held', actions: [] },
      { id: 'm2', personId: 'p1', date: '2026-10-15', status: 'held', actions: [] },
    ],
    feedback: [{ id: 'f1', personId: 'p1', direction: 'given', kind: 'constructive', date: '2026-10-05' }],
    goals: [{ id: 'g1', ownerId: 'p1', title: 'Lead the migration', status: 'active', keyResults: [{ id: 'k', title: 'x', start: 0, target: 10, current: 5 }], createdAt: '2026-09-01T00:00:00.000Z', dueDate: '2026-12-01', confidence: 'on-track', checkins: [] }],
    recognition: [{ id: 'rc1', personId: 'p1', what: 'Ran the incident well', date: '2026-10-10' }],
    growthPlans: [{ id: 'gp1', personId: 'p1', goal: 'Grow into staff engineer with cross-team scope', reality: 'Strong delivery, thin influence', options: [{ id: 'o1', text: 'A' }, { id: 'o2', text: 'B' }], will: [{ id: 'w1', text: 'Write a memo', due: '2026-10-20', done: true }], status: 'active', createdAt: '2026-09-01T00:00:00.000Z' }],
    readiness: [{ id: 'r1', personId: 'p1', seat: 'Staff engineer', rating: 'ready-now', updatedAt: '2026-10-01T00:00:00.000Z' }],
  });
  const evidence = evidenceFor(s, 'p1', NOW, s.settings);
  assert.equal(evidence.metCount, 5);
  assert.equal(evidence.strengthProven, true);
  assert.equal(assess(s, 'p1', NOW, s.settings).supported, true);
});

test('readiness: a seat with no ready-now successor is a gap', () => {
  const s = stateWith({
    people: [person('p1', 'Ada'), person('p2', 'Bo')],
    readiness: [
      { id: 'r1', personId: 'p1', seat: 'Director', rating: 'ready-later', updatedAt: '2026-10-01T00:00:00.000Z' },
    ],
  });
  const gaps = successionGaps(s, NOW, s.settings);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].gap, true);
  assert.equal(gaps[0].future.length, 1);
});

/* -------------------------------------------------------------- insights */

test('insights: an empty workspace gets a setup nudge, not fake problems', () => {
  const { findings } = buildInsights(createEmptyState(iso), NOW);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, 'SETUP-01');
  assert.equal(findings[0].severity, 1);
});

test('insights: every finding is complete, ordered and actionable', () => {
  const demo = buildDemoState(NOW);
  const { findings, byDomain, urgent, wins } = buildInsights(demo, NOW);
  assert.ok(findings.length > 10);

  for (const f of findings) {
    assert.ok(f.ruleId, 'has a rule id');
    assert.ok(f.domain, 'has a domain');
    assert.ok(f.title.length > 10, 'has a readable title');
    assert.ok(f.detail.length > 20, 'explains itself');
    assert.ok(Array.isArray(f.evidence) && f.evidence.length > 0, `${f.ruleId} carries evidence`);
    assert.ok(f.severity >= 1 && f.severity <= 5, 'severity in range');
    assert.ok(['low', 'medium', 'high'].includes(f.confidence));
    assert.ok(f.action && f.action.route.startsWith('#/'), 'action navigates somewhere real');
    assert.equal(f.priority, priorityOf(f));
  }

  for (let i = 1; i < findings.length; i += 1) {
    assert.ok(findings[i - 1].priority >= findings[i].priority, 'sorted by priority');
  }
  assert.ok(urgent.every((f) => f.severity >= 4));
  assert.equal(byDomain.reduce((sum, d) => sum + d.count, 0), findings.length);
  assert.ok(wins.length > 0, 'the app also reports what is working');
});

test('insights: the demo surfaces the problems it was built to contain', () => {
  const demo = buildDemoState(NOW);
  const { findings } = buildInsights(demo, NOW);
  const rules = new Set(findings.map((f) => f.ruleId));
  for (const expected of ['CONV-02', 'CONV-04', 'FB-01', 'GOAL-01', 'GROW-03', 'PULSE-03', 'PULSE-04', 'DEC-01', 'SUCC-01', 'ONB-01']) {
    assert.ok(rules.has(expected), `expected ${expected} in ${[...rules].join(',')}`);
  }
  const priya = findings.find((f) => f.ruleId === 'CONV-02');
  assert.equal(priya.severity, 5);
  assert.ok(priya.evidence.some((e) => e.includes('Cadence')));
});

test('insights: deterministic for the same input', () => {
  const demo = buildDemoState(NOW);
  const a = buildInsights(demo, NOW).findings.map((f) => f.ruleId + f.title);
  const b = buildInsights(demo, NOW).findings.map((f) => f.ruleId + f.title);
  assert.deepEqual(a, b);
});

test('insights: unknown settings cannot break scoring', () => {
  const demo = buildDemoState(NOW);
  demo.settings = { ...demo.settings, oneOnOneCadenceDays: 1, feedbackTargetDays: 1, pulseMinResponses: 50 };
  const { findings } = buildInsights(demo, NOW);
  assert.ok(findings.length > 0);
  assert.ok(findings.every((f) => Number.isFinite(f.severity)));
});

/* ------------------------------------------------------------- decisions */

test('decisions: open and review-due queues are separated', () => {
  const s = stateWith({
    people: [person('p1', 'Ada')],
    decisions: [
      { id: 'd1', title: 'Open one', date: '2026-10-01', chosen: '', reviewOn: '2026-12-01', outcome: 'pending' },
      { id: 'd2', title: 'Reviewed one', date: '2026-09-01', chosen: 'A', reviewOn: '2026-10-01', reviewedOn: '2026-10-02', outcome: 'good' },
      { id: 'd3', title: 'Review overdue', date: '2026-09-10', chosen: 'B', reviewOn: '2026-10-10', reviewedOn: null, outcome: 'pending' },
    ],
  });
  assert.deepEqual(openDecisions(s, NOW).map((d) => d.id), ['d1']);
  assert.deepEqual(reviewsDue(s, NOW).map((d) => d.id), ['d3']);
});

test('decisions: quality scoring names what is missing', () => {
  const thin = decisionQuality({ title: 'Do the thing', options: [], rationale: '', reversibility: 'reversible' });
  const solid = decisionQuality({
    title: 'Do the thing',
    options: [{ label: 'A' }, { label: 'B' }],
    rationale: 'Because the second option protects runway while the first doubles the risk exposure.',
    reviewOn: '2026-12-01',
    reversibility: 'irreversible',
    approver: 'CFO',
  });
  assert.ok(thin.score < solid.score);
  assert.equal(solid.score, 100);
  assert.ok(thin.checks.some((c) => !c.met && c.why.length > 20));
});

/* --------------------------------------------------------------- summary */

test('goals summary counts health buckets consistently', () => {
  const demo = buildDemoState(NOW);
  const summary = goalsSummary(demo, NOW, demo.settings);
  assert.equal(summary.onTrack + summary.atRisk + summary.offTrack, summary.active);
  assert.equal(summary.rows.length, summary.active);
});

test('following up: due follow-ups respect dates', () => {
  const s = stateWith({
    people: [person('p1', 'Ada')],
    feedback: [
      { id: 'f1', personId: 'p1', direction: 'given', kind: 'constructive', date: '2026-10-01', followUpOn: '2026-10-15', followUpDone: false },
      { id: 'f2', personId: 'p1', direction: 'given', kind: 'constructive', date: '2026-10-01', followUpOn: '2026-10-30', followUpDone: false },
      { id: 'f3', personId: 'p1', direction: 'given', kind: 'constructive', date: '2026-10-01', followUpOn: '2026-10-15', followUpDone: true },
    ],
  });
  const due = followUpsDue(s, NOW);
  assert.deepEqual(due.map((f) => f.id), ['f1']);
  assert.equal(due[0].overdueDays, 9);
});

/* -------------------------------------------------------------- roll-ups */

test('insights: repeated per-person signals collapse into one finding that keeps the names', () => {
  const finding = (name, severity = 3) => ({
    id: `f-${name}`, ruleId: 'FB-01', domain: 'Feedback', title: `${name}: no feedback has ever been recorded`,
    detail: 'detail', severity, confidence: 'high', personId: `id-${name}`, personName: name,
    evidence: ['0 feedback items'], action: { label: 'Write it down', route: `#/people/id-${name}` },
  });
  const findings = [
    finding('Ana'), finding('Bo', 4), finding('Cy'), finding('Di'), finding('Ed'),
    { id: 'team', ruleId: 'TEAM-01', domain: 'Team', title: 'Team-wide thing', detail: 'd', severity: 2, confidence: 'high', personId: null, personName: null, evidence: [], action: { label: 'Look', route: '#/health' } },
  ];

  const rolled = rollUpFindings(findings, { threshold: 3 });
  assert.equal(rolled.length, 2, 'five people become one line, the team finding stays');
  const group = rolled.find((f) => f.rolledUp);
  assert.equal(group.count, 5);
  assert.equal(group.personId, null);
  assert.ok(group.people.includes('Ana') && group.people.includes('Ed'));
  assert.equal(group.severity, 4, 'the worst severity survives the collapse');
  assert.ok(group.evidence[0].includes('5 people affected'));
  assert.ok(group.title.startsWith('5 people'));
  assert.equal(group.action.route, '#/people', 'the action points at the group, not one person');

  const small = rollUpFindings(findings.slice(0, 3), { threshold: 3 });
  assert.equal(small.filter((f) => f.rolledUp).length, 0, 'three or fewer people stay individual');
});
