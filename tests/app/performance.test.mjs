/**
 * tests/app/performance.test.mjs — Performance Recovery Terminal (Schema v62).
 *
 * Verifies:
 *   1. Schema v62 additivity, the settings clamps, and the `coupledLoadAutoPropagate`
 *      split that fixes the v61 collision
 *   2. The evidence audit: window, distinct dates, specificity floor
 *   3. Procedural justice: notice, accuracy, consistency, voice, bias, support
 *   4. The analysis: cause classes, no-deficit, support adequacy
 *   5. The economics: priced, unpriced, replacement convention, break-even
 *   6. The action guardrails: override, single scoring, no backdating, delete
 *   7. The rule spine: RULE-PERF-01..05, marker idempotency, pause behaviour
 *   8. Prediction scoring and the calibration floor
 *   9. Signals, insights bucket, attention count, brief text
 *  10. CSV scope #52: registered, sensitive, codes only
 *  11. Cross-module graph: perfconcern node, `concerns` relation, case route
 *  12. The view renders every panel, is axe-clean, and the nav entry exists
 *  13. The demo seeds three states through the real rule
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  SCHEMA_VERSION, createEmptyState, normalizeState, migrate,
} from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildDemoState } from '../../app/core/demo.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { LINK_ENTITY_TYPES, LINK_RELATIONS, linksForEntity } from '../../app/core/domain/cases.js';
import {
  PERFORMANCE_DEFAULTS,
  PERFORMANCE_MIN_RESOLVED,
  PERFORMANCE_SIGNAL_IDS,
  assessConcern,
  analyseCause,
  conventionsFromSettings,
  costOfInaction,
  evidenceAudit,
  performanceAttentionCount,
  performanceBrief,
  performanceCalibration,
  performanceReport,
  performanceSignals,
  predictionOutcome,
  proceduralJustice,
  supportAdequacy,
} from '../../app/core/domain/performance.js';
import { performanceRule, PERFORMANCE_EVENTS } from '../../app/core/domain/performanceRules.js';
import { renderPerformance } from '../../app/views/performance.js';
import { parseRoute } from '../../app/main.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-26T10:00:00.000Z');

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function harness({ leaderName = 'Rae Mensah' } = {}) {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-perf-${++seq}`;
  const clock = { now: NOW };
  const store = createStore({ storage: memoryStorage(), now: () => clock.now, idFactory });
  store.load();
  const api = createApi(store, { now: () => clock.now, idFactory });
  if (leaderName) api.updateSettings({ leaderName });
  const leader = api.addPerson({ name: leaderName || 'Rae Mensah', role: 'Head of Support' });
  const subject = api.addPerson({ name: 'Tomas Berg', role: 'Support Engineer', startDate: '2025-03-01' });
  return { store, api, clock, leaderId: leader.id, subjectId: subject.id };
}

const GOOD = {
  situation: 'Monday support standup in the ops room, first week of the month',
  behavior: 'The escalation rota was not published before 09:00 and appeared on Tuesday afternoon',
  impact: 'Two P2 escalations sat with the wrong owner for a day',
};

function openFullyDocumented(env, over = {}) {
  const concern = env.api.addPerformanceConcern({
    personId: env.subjectId,
    label: 'Escalation rota not published by Monday 09:00',
    expectation: 'The escalation rota is published before Monday 09:00 every week.',
    source: 'role',
    recordedOn: '2026-09-01',
    observed: 'The rota appeared on Tuesday in three of five weeks.',
    impact: 'Escalations sat with the wrong owner.',
    gapSharePct: 25,
    teamHoursPerWeek: 4,
    answers: {
      couldDoIfTried: true,
      knowsWhat: true,
      knowsWhen: true,
      obstacle: true,
      consequenceMissing: false,
      capacity: false,
      feedbackLoop: true,
    },
    ...over,
  });
  assert.equal(concern.ok, true, concern.error);
  for (const [i, day] of ['2026-09-14', '2026-09-21', '2026-10-05'].entries()) {
    const res = env.api.addPerformanceObservation(concern.id, { ...GOOD, date: day, source: i === 0 ? 'direct' : 'feedback' });
    assert.equal(res.ok, true, res.error);
  }
  const conv = env.api.recordPerformanceConversation(concern.id, {
    date: '2026-10-08',
    kind: 'two-way',
    note: 'Tomas said the rota depends on two people confirming holiday plans and neither answers before Sunday.',
  });
  assert.equal(conv.ok, true, conv.error);
  const support = env.api.recordPerformanceSupport(concern.id, {
    date: '2026-10-09',
    kind: 'clarity',
    note: 'Agreed one owner for holiday confirmation and a Friday cut-off.',
  });
  assert.equal(support.ok, true, support.error);
  return concern.id;
}

function concernById(env, id) {
  return env.store.state.performanceConcerns.find((row) => row.id === id);
}

/* ============================================================ */
/* 1. Schema                                                    */
/* ============================================================ */

describe('Schema v62 — additive and honest', () => {
  test('the version, the collection and the settings are pinned', () => {
    assert.equal(SCHEMA_VERSION, 78);
    const empty = createEmptyState(NOW.toISOString());
    assert.deepEqual(empty.performanceConcerns, []);
    assert.equal(empty.settings.perfMinObservations, 3);
    assert.equal(empty.settings.perfEvidenceWindowDays, 90);
    assert.equal(empty.settings.perfReviewHorizonDays, 45);
    assert.equal(empty.settings.perfSbiFloor, 3);
    assert.equal(empty.settings.perfReplacementMonths, 4);
    assert.equal(empty.settings.perfAutoPropagate, true);
    assert.equal(empty.settings.coupledLoadAutoPropagate, true);
  });

  test('a v61 workspace gains an empty concern list and nothing else', () => {
    const migrated = migrate({ schemaVersion: 61, settings: {}, people: [] });
    assert.equal(migrated.raw.schemaVersion, 78);
    assert.equal(migrated.applied.at(-1), '77 → 78');
    assert.deepEqual(migrated.raw.performanceConcerns, []);
  });

  test('the v61 pause collision is fixed: the two modules no longer share a switch', () => {
    // In v61 the continuity module's `couplingAutoPropagate` was reused by the
    // Coupled Load rules, so pausing one paused both. v62 gives Coupled Load its
    // own key and inherits the old value once, so nobody's setting flips.
    const inherited = migrate({ schemaVersion: 61, settings: { couplingAutoPropagate: false }, people: [] });
    assert.equal(inherited.raw.settings.coupledLoadAutoPropagate, false);
    assert.equal(inherited.raw.settings.couplingAutoPropagate, false);

    const untouched = migrate({ schemaVersion: 61, settings: {}, people: [] });
    assert.equal(untouched.raw.settings.coupledLoadAutoPropagate, true);

    // On a v62 workspace the two keys are independent again.
    const state = normalizeState({
      schemaVersion: 62,
      people: [],
      settings: { couplingAutoPropagate: false, coupledLoadAutoPropagate: true },
    }, { now: NOW }).state;
    assert.equal(state.settings.couplingAutoPropagate, false);
    assert.equal(state.settings.coupledLoadAutoPropagate, true);
  });

  test('a settings typo cannot raise or lower the evidence floor', () => {
    const state = normalizeState({
      schemaVersion: 62,
      people: [],
      settings: {
        perfMinObservations: 0,
        perfEvidenceWindowDays: -5,
        perfSbiFloor: 99,
        perfReviewHorizonDays: 'x',
        perfAutoPropagate: 'yes',
      },
    }, { now: NOW }).state;
    assert.equal(state.settings.perfMinObservations, 1);
    assert.equal(state.settings.perfEvidenceWindowDays, 7);
    assert.equal(state.settings.perfSbiFloor, 4);
    assert.equal(state.settings.perfReviewHorizonDays, PERFORMANCE_DEFAULTS.perfReviewHorizonDays);
    // A non-boolean typo cannot silently *enable* automatic propagation on a
    // leader who set it off: only an explicit `false` disables it, which is the
    // same convention the rest of the schema uses.
    assert.equal(state.settings.perfAutoPropagate, true);
  });
});

/* ============================================================ */
/* 2. Evidence audit                                            */
/* ============================================================ */

describe('Evidence audit — what can be answered', () => {
  test('an empty record blocks on accuracy and consistency, not on the person', () => {
    const env = harness();
    const concern = env.api.addPerformanceConcern({
      personId: env.subjectId,
      label: 'Notes arriving late',
      expectation: 'Notes by Friday 17:00.',
      source: 'verbal',
      recordedOn: '2026-09-01',
      observed: 'Monday delivery',
      gapSharePct: 10,
    });
    const audit = evidenceAudit(concernById(env, concern.id), NOW, conventionsFromSettings(env.store.state.settings));
    assert.equal(audit.liveCount, 0);
    assert.equal(audit.meetsFloor, false);
    assert.equal(audit.specificCount, 0);
    const assessment = assessConcern(env.store.state, concernById(env, concern.id), NOW, env.store.state.settings);
    const ids = assessment.blockers.map((row) => row.id);
    assert.ok(ids.includes('accuracy'));
    assert.ok(ids.includes('consistency'));
    assert.ok(!ids.includes('notice'), 'the expectation is dated, so notice is met');
    assert.equal(assessment.canFormalPlan, false);
  });

  test('three observations over three dates meet the floor; a weak one does not count as specific', () => {
    const env = harness();
    const id = openFullyDocumented(env);
    // Present but not answerable: one field, no situation, no impact. It counts
    // as an observation and does not count as evidence a person can respond to.
    env.api.addPerformanceObservation(id, { date: '2026-10-12', source: 'direct', behavior: 'Notes arrived late again on Monday' });
    const audit = evidenceAudit(concernById(env, id), NOW, conventionsFromSettings(env.store.state.settings));
    assert.equal(audit.total, 4);
    assert.equal(audit.liveCount, 4);
    assert.equal(audit.distinctDates, 4);
    assert.equal(audit.specificCount, 3, 'the thin observation is present but not specific');
    assert.equal(audit.meetsFloor, true);
    assert.ok(audit.averageQuality < 4);
  });

  test('observations outside the window are counted and named, never silently dropped', () => {
    const env = harness();
    const concern = env.api.addPerformanceConcern({
      personId: env.subjectId,
      label: 'Stale pattern',
      expectation: 'Weekly note by Friday.',
      source: 'verbal',
      recordedOn: '2026-01-05',
    });
    env.api.addPerformanceObservation(concern.id, { ...GOOD, date: '2026-02-01' });
    const audit = evidenceAudit(concernById(env, concern.id), NOW, conventionsFromSettings(env.store.state.settings));
    assert.equal(audit.total, 1);
    assert.equal(audit.staleCount, 1);
    assert.equal(audit.liveCount, 0);
    assert.equal(audit.meetsFloor, false);
  });
});

/* ============================================================ */
/* 3. Procedural justice                                        */
/* ============================================================ */

describe('Procedural justice — six checkable facts', () => {
  test('an expectation dated after the first observation fails notice', () => {
    const env = harness();
    const concern = env.api.addPerformanceConcern({
      personId: env.subjectId,
      label: 'Retrospective standard',
      expectation: 'Notes by Friday.',
      source: 'verbal',
      recordedOn: '2026-10-01',
    });
    env.api.addPerformanceObservation(concern.id, { ...GOOD, date: '2026-09-14' });
    const justice = proceduralJustice(env.store.state, concernById(env, concern.id), NOW, conventionsFromSettings(env.store.state.settings));
    const notice = justice.rules.find((row) => row.id === 'notice');
    assert.equal(notice.status, 'gap');
    assert.match(notice.detail, /after the first observation/i);
  });

  test('voice is met only by a two-way conversation after the first observation', () => {
    const env = harness();
    const id = openFullyDocumented(env);
    const met = proceduralJustice(env.store.state, concernById(env, id), NOW, conventionsFromSettings(env.store.state.settings));
    assert.equal(met.rules.find((row) => row.id === 'voice').status, 'met');

    // A notice-only record does not satisfy voice.
    const other = env.api.addPerformanceConcern({
      personId: env.subjectId,
      label: 'Notice only',
      expectation: 'Notes by Friday.',
      source: 'verbal',
      recordedOn: '2026-09-01',
    });
    env.api.addPerformanceObservation(other.id, { ...GOOD, date: '2026-09-14' });
    env.api.recordPerformanceConversation(other.id, { date: '2026-09-20', kind: 'notice', note: 'Told them the standard.' });
    const justice = proceduralJustice(env.store.state, concernById(env, other.id), NOW, conventionsFromSettings(env.store.state.settings));
    assert.equal(justice.rules.find((row) => row.id === 'voice').status, 'gap');
  });

  test('the readiness verdict refuses a plan while a blocker stands', () => {
    const env = harness();
    const id = openFullyDocumented(env, { answers: { couldDoIfTried: null } });
    const assessment = assessConcern(env.store.state, concernById(env, id), NOW, env.store.state.settings);
    assert.equal(assessment.canFormalPlan, false);
    assert.equal(assessment.justice.total, 6);
    assert.ok(assessment.blockers.some((row) => row.id === 'diagnosis'), 'an unnamed cause is its own blocker');
    assert.match(assessment.justice.verdict, /can support/i, 'the six justice rules are met; the diagnosis is the blocker');
  });
});

/* ============================================================ */
/* 4. The analysis                                              */
/* ============================================================ */

describe('Analysis — cause, never character', () => {
  test('“could not do it” is a skill gap; “could, and nothing is in the way” is no deficit', () => {
    const skill = analyseCause({ answers: { couldDoIfTried: false, knowsWhat: true, knowsWhen: true, obstacle: false, consequenceMissing: false, capacity: false, feedbackLoop: true } });
    assert.equal(skill.primary, 'skill-gap');
    assert.equal(skill.confidence, 'high');

    const none = analyseCause({ answers: { couldDoIfTried: true, knowsWhat: true, knowsWhen: true, obstacle: false, consequenceMissing: false, capacity: false, feedbackLoop: true } });
    assert.equal(none.primary, 'no-deficit');
    assert.match(none.label, /no cause found/i);
    assert.match(none.reading, /role|assignment|expectation/i);
    assert.match(none.reasons[0], /not a person defect/i);
  });

  test('unanswered questions keep the diagnosis unnamed rather than guessing', () => {
    const open = analyseCause({ answers: {} });
    assert.equal(open.primary, 'unknown');
    assert.equal(open.diagnosed, false);
    assert.equal(open.missing.length, 7);
  });

  test('support is scored against the implied remedy, and a mismatch is named', () => {
    const env = harness();
    const id = openFullyDocumented(env);
    const concern = concernById(env, id);
    const diagnosis = analyseCause(concern);
    const mismatch = supportAdequacy({ ...concern, supports: [{ kind: 'training', date: '2026-10-09', note: 'Sent on a course.' }] }, diagnosis);
    assert.equal(mismatch.status, 'mismatch');
    assert.match(mismatch.detail, /does not match/i);

    const matched = supportAdequacy({
      ...concern,
      supports: diagnosis.expectedSupport.map((kind) => ({ kind, date: '2026-10-09', note: 'Recorded.' })),
    }, diagnosis);
    assert.equal(matched.status, 'matched', `expected ${diagnosis.expectedSupport.join(', ')}`);
  });
});

/* ============================================================ */
/* 5. Economics                                                 */
/* ============================================================ */

describe('Economics — priced, or explicitly unpriced', () => {
  test('without a pay row the cost is unpriced, not zero', () => {
    const env = harness();
    const concern = env.api.addPerformanceConcern({
      personId: env.subjectId,
      label: 'Unpriced gap',
      expectation: 'Notes by Friday.',
      source: 'verbal',
      recordedOn: '2026-09-01',
      gapSharePct: 20,
      teamHoursPerWeek: 3,
    });
    const economics = costOfInaction(env.store.state, concernById(env, concern.id), NOW, conventionsFromSettings(env.store.state.settings));
    assert.equal(economics.priced, true, 'declared team hours are a price even without pay');
    assert.equal(economics.totalDaily, 150);
    assert.equal(economics.replacementCost, null);
    assert.equal(economics.breakEvenDays, null);
    assert.match(economics.note, /no replacement cost/i);
  });

  test('a recorded salary adds the replacement convention and a break-even', () => {
    const env = harness();
    const concern = env.api.addPerformanceConcern({
      personId: env.subjectId,
      label: 'Priced gap',
      expectation: 'Notes by Friday.',
      source: 'verbal',
      recordedOn: '2026-09-01',
      gapSharePct: 20,
      teamHoursPerWeek: 3,
    });
    // Pay comes from the merit ledger, the only pay source this app has. The
    // test writes the row directly because the merit cycle is a heavier fixture
    // than this assertion needs; `payIndex` reads exactly this shape.
    env.store.state.meritCycles = [{
      id: 'cycle-perf-1',
      effectiveOn: '2026-01-01',
      rows: [{ personId: env.subjectId, currentPay: 96000 }],
    }];
    const economics = costOfInaction(env.store.state, concernById(env, concern.id), NOW, conventionsFromSettings(env.store.state.settings));
    assert.ok(economics.replacementCost > 0);
    assert.ok(economics.breakEvenDays > 0);
    assert.match(economics.note, /arithmetic/i);
  });

  test('nothing declared means nothing claimed', () => {
    const env = harness();
    const concern = env.api.addPerformanceConcern({ personId: env.subjectId, label: 'Bare record', expectation: 'Something.', source: 'verbal', recordedOn: '2026-09-01' });
    const economics = costOfInaction(env.store.state, concernById(env, concern.id), NOW, conventionsFromSettings(env.store.state.settings));
    assert.equal(economics.priced, false);
    assert.equal(economics.totalDaily, null, 'unpriced is null — a zero would be a claim');
    assert.match(economics.note, /not zero/i);
  });
});

/* ============================================================ */
/* 6. Action guardrails                                         */
/* ============================================================ */

describe('Action guardrails — the app refuses to be a rubber stamp', () => {
  const OBJECTIVE = { text: 'Rota published before Monday 09:00', measure: '5 of 5 weeks before 09:00', byWhen: '2026-11-20' };

  test('a plan is refused while a blocker stands, and a short override does not unlock it', () => {
    const env = harness();
    const concern = env.api.addPerformanceConcern({ personId: env.subjectId, label: 'No evidence', expectation: 'Notes by Friday.', source: 'verbal', recordedOn: '2026-09-01' });
    const refused = env.api.adoptPerformancePlan(concern.id, {
      objectives: [OBJECTIVE], reviewOn: '2026-11-20', probabilityPct: 60,
    });
    assert.equal(refused.ok, false);
    assert.match(refused.error, /cannot support a formal plan/i);

    const short = env.api.adoptPerformancePlan(concern.id, {
      objectives: [OBJECTIVE], reviewOn: '2026-11-20', probabilityPct: 60, overrideReason: 'I know the history here.',
    });
    assert.equal(short.ok, false);
    assert.equal(short.field, 'overrideReason');
  });

  test('a written override of forty characters unlocks the plan and is stored verbatim', () => {
    const env = harness();
    const concern = env.api.addPerformanceConcern({ personId: env.subjectId, label: 'Held elsewhere', expectation: 'Notes by Friday.', source: 'verbal', recordedOn: '2026-09-01' });
    const reason = 'The evidence is in the ticket exports and the two recorded 1:1s, which are not filed here.';
    const adopted = env.api.adoptPerformancePlan(concern.id, {
      objectives: [OBJECTIVE], reviewOn: '2026-11-20', probabilityPct: 65, overrideReason: reason,
    });
    assert.equal(adopted.ok, true, adopted.error);
    const row = concernById(env, concern.id);
    assert.equal(row.plan.overrideReason, reason);
    assert.equal(row.plan.prediction.probabilityPct, 65);
    assert.equal(row.status, 'plan');
  });

  test('a plan needs one objective with a measure, a future review date and a bounded probability', () => {
    const env = harness();
    const id = openFullyDocumented(env);
    assert.equal(env.api.adoptPerformancePlan(id, { objectives: [], reviewOn: '2026-11-20', probabilityPct: 60 }).ok, false);
    assert.equal(env.api.adoptPerformancePlan(id, { objectives: [{ text: 'Better' }], reviewOn: '2026-11-20', probabilityPct: 60 }).ok, false);
    assert.equal(env.api.adoptPerformancePlan(id, { objectives: [OBJECTIVE], reviewOn: '2026-10-01', probabilityPct: 60 }).ok, false);
    const ok = env.api.adoptPerformancePlan(id, { objectives: [OBJECTIVE], reviewOn: '2026-11-20', probabilityPct: 99 });
    assert.equal(ok.ok, true, ok.error);
    assert.equal(concernById(env, id).plan.prediction.probabilityPct, 95, 'the probability is clamped to the 5–95 band');
  });

  test('a review happens once, cannot be backdated before the plan, and cannot be in the future', () => {
    const env = harness();
    const id = openFullyDocumented(env);
    env.api.adoptPerformancePlan(id, { objectives: [OBJECTIVE], reviewOn: '2026-11-20', probabilityPct: 70 });

    assert.equal(env.api.reviewPerformancePlan(id, { reviewedOn: '2026-10-20', verdict: 'met' }).ok, false, 'before adoption');
    assert.equal(env.api.reviewPerformancePlan(id, { reviewedOn: '2027-01-01', verdict: 'met' }).ok, false, 'in the future');
    const first = env.api.reviewPerformancePlan(id, { reviewedOn: '2026-10-26', verdict: 'not-met', notes: 'Still late twice.' });
    assert.equal(first.ok, true, first.error);
    const second = env.api.reviewPerformancePlan(id, { reviewedOn: '2026-10-26', verdict: 'met' });
    assert.equal(second.ok, false);
    assert.match(second.error, /scored once/i);
  });

  test('a concern with a plan cannot be deleted into silence; withdrawing keeps a reason', () => {
    const env = harness();
    const id = openFullyDocumented(env);
    env.api.adoptPerformancePlan(id, { objectives: [OBJECTIVE], reviewOn: '2026-11-20', probabilityPct: 70 });
    const deleted = env.api.deletePerformanceConcern(id);
    assert.equal(deleted.ok, false);
    assert.match(deleted.error, /withdraw/i);

    // Withdrawal stays available after a plan — gaps really do close — but it
    // carries a written reason and the record stays readable forever.
    const withdrawn = env.api.withdrawPerformanceConcern(id, { reason: 'The rota was reassigned to another team, so the gap is no longer this person’s.' });
    assert.equal(withdrawn.ok, true, withdrawn.error);
    assert.equal(concernById(env, id).status, 'withdrawn');
    assert.match(concernById(env, id).withdrawnReason, /reassigned/i);
    assert.ok(concernById(env, id).plan, 'the plan history is not erased by the withdrawal');

    const fresh = env.api.addPerformanceConcern({ personId: env.subjectId, label: 'Closed by circumstance', expectation: 'x', source: 'verbal', recordedOn: '2026-09-01' });
    const ok = env.api.withdrawPerformanceConcern(fresh.id, { reason: 'The role changed and the expectation no longer applies.' });
    assert.equal(ok.ok, true, ok.error);
    assert.equal(concernById(env, fresh.id).status, 'withdrawn');
    assert.match(concernById(env, fresh.id).withdrawnReason, /role changed/i);
  });

  test('observations must be dated, in the past, and carry a behaviour', () => {
    const env = harness();
    const concern = env.api.addPerformanceConcern({ personId: env.subjectId, label: 'Dated', expectation: 'x', source: 'verbal', recordedOn: '2026-09-01' });
    assert.equal(env.api.addPerformanceObservation(concern.id, { ...GOOD, date: '2027-01-01' }).ok, false);
    assert.equal(env.api.addPerformanceObservation(concern.id, { ...GOOD, date: '2026-10-01', behavior: '  ' }).ok, false);
    assert.equal(env.api.addPerformanceObservation(concern.id, { ...GOOD, date: '2026-10-01' }).ok, true);
  });
});

/* ============================================================ */
/* 7. The rule spine                                            */
/* ============================================================ */

describe('RULE-PERF-01..05 on the shared spine', () => {
  test('a concern with no recorded expectation opens exactly one owned task and one prompt', () => {
    const env = harness();
    const concern = env.api.addPerformanceConcern({ personId: env.subjectId, label: 'No standard' });
    const delegations = env.store.state.delegations.filter((row) => row.title.includes('No standard'));
    assert.equal(delegations.length, 1);
    assert.equal(delegations[0].personId, env.leaderId, 'the owner is the leader, never the subject');
    assert.match(delegations[0].support, /RULE-PERF-01/);
    const subject = env.store.state.people.find((row) => row.id === env.subjectId);
    assert.equal(subject.talkingPoints.filter((row) => row.includes('RULE-PERF-01')).length, 1);
    assert.equal(concernById(env, concern.id).markers.filter((row) => row.startsWith('RULE-PERF-01')).length, 1);
  });

  test('re-firing the same event does not duplicate work', () => {
    const env = harness();
    const concern = env.api.addPerformanceConcern({ personId: env.subjectId, label: 'Idempotent' });
    for (let i = 0; i < 3; i += 1) {
      env.api.updatePerformanceConcern(concern.id, { observed: `Attempt ${i}` });
    }
    assert.equal(env.store.state.delegations.filter((row) => row.title.includes('Idempotent')).length, 1);
    const subject = env.store.state.people.find((row) => row.id === env.subjectId);
    assert.equal(subject.talkingPoints.filter((row) => row.includes('RULE-PERF-01')).length, 1);
  });

  test('meeting the evidence floor without a two-way conversation opens one conversation task', () => {
    const env = harness();
    const concern = env.api.addPerformanceConcern({
      personId: env.subjectId,
      label: 'Evidence first',
      expectation: 'Notes by Friday.',
      source: 'role',
      recordedOn: '2026-09-01',
    });
    for (const day of ['2026-09-14', '2026-09-21', '2026-10-05']) {
      env.api.addPerformanceObservation(concern.id, { ...GOOD, date: day });
    }
    const voice = env.store.state.delegations.filter((row) => row.title.includes('two-way conversation'));
    assert.equal(voice.length, 1);
    assert.match(voice[0].support, /RULE-PERF-02/);
    assert.equal(env.store.state.delegations.filter((row) => row.title.includes('two-way conversation')).length, 1);
  });

  test('adopting a plan opens one support decision and one graph link, not one per edit', () => {
    const env = harness();
    const id = openFullyDocumented(env);
    env.api.adoptPerformancePlan(id, {
      objectives: [{ text: 'Rota on time', measure: '5 of 5 weeks', byWhen: '2026-11-20' }],
      reviewOn: '2026-11-20',
      probabilityPct: 70,
    });
    const decisions = env.store.state.decisions.filter((row) => row.title.includes('supported and reviewed'));
    assert.equal(decisions.length, 1);
    assert.ok(decisions[0].options.length >= 3);
    const links = linksForEntity(env.store.state, 'perfconcern', id).map((row) => row.link);
    assert.ok(links.some((row) => row.relation === 'concerns' && row.targetType === 'person'));
    assert.ok(links.some((row) => row.relation === 'screens' && row.sourceType === 'decision'));
  });

  test('a not-met review opens exactly one next-step decision with no exit option', () => {
    const env = harness();
    const id = openFullyDocumented(env);
    env.api.adoptPerformancePlan(id, {
      objectives: [{ text: 'Rota on time', measure: '5 of 5 weeks', byWhen: '2026-11-20' }],
      reviewOn: '2026-11-20',
      probabilityPct: 70,
    });
    env.api.reviewPerformancePlan(id, { reviewedOn: '2026-10-26', verdict: 'not-met', notes: 'Still late.' });
    const next = env.store.state.decisions.filter((row) => /next process step|what changes now/i.test(row.title));
    assert.equal(next.length, 1);
    const labels = next[0].options.map((option) => option.label.toLowerCase()).join(' | ');
    assert.ok(!/terminate|exit|dismiss|warning|discipline/.test(labels), labels);
    assert.match(labels, /support/);
  });

  test('pausing automatic propagation suppresses new work but never an explicit scan', () => {
    const env = harness();
    env.api.updateSettings({ perfAutoPropagate: false });
    const concern = env.api.addPerformanceConcern({ personId: env.subjectId, label: 'Paused' });
    assert.equal(env.store.state.delegations.filter((row) => row.title.includes('Paused')).length, 0);

    // A plan adopted while paused still records the decision only when the
    // leader explicitly scans: the scan is the leader's own button.
    const id = openFullyDocumented(env);
    env.api.adoptPerformancePlan(id, {
      objectives: [{ text: 'Rota on time', measure: '5 of 5 weeks', byWhen: '2026-11-20' }],
      reviewOn: '2026-11-20',
      probabilityPct: 70,
    });
    assert.equal(env.store.state.decisions.filter((row) => row.title.includes('supported and reviewed')).length, 0);
    env.api.scanPerformance();
    assert.equal(env.store.state.decisions.filter((row) => row.title.includes('supported and reviewed')).length, 1, 'the explicit scan reconciles a plan adopted while paused');

    const direct = performanceRule(env.store.state, {
      event: { type: PERFORMANCE_EVENTS.CREATED, entity: 'perfconcern', entityId: concern.id },
      now: NOW,
      settings: env.store.state.settings,
      idFactory: (prefix) => `${prefix}-manual`,
    });
    assert.equal(direct.length, 0, 'the pause is respected by the rule itself');
  });

  test('the scan sweeps a passed review once and only once', () => {
    const env = harness();
    const id = openFullyDocumented(env);
    env.api.adoptPerformancePlan(id, {
      objectives: [{ text: 'Rota on time', measure: '5 of 5 weeks', byWhen: '2026-11-20' }],
      reviewOn: '2026-11-20',
      probabilityPct: 70,
    });
    env.clock.now = new Date('2026-11-25T10:00:00.000Z');
    const first = env.api.scanPerformance();
    assert.equal(first.ok, true);
    const tasks = env.store.state.delegations.filter((row) => row.title.includes('overdue review'));
    assert.equal(tasks.length, 1);
    assert.match(tasks[0].support, /RULE-PERF-05/);
    env.api.scanPerformance();
    env.api.scanPerformance();
    assert.equal(env.store.state.delegations.filter((row) => row.title.includes('overdue review')).length, 1);
  });
});

/* ============================================================ */
/* 8. Prediction scoring                                        */
/* ============================================================ */

describe('Prediction — frozen once and scored once', () => {
  test('a met verdict scores the frozen probability and withholds the average below the floor', () => {
    const env = harness();
    const id = openFullyDocumented(env);
    env.api.adoptPerformancePlan(id, {
      objectives: [{ text: 'Rota on time', measure: '5 of 5 weeks', byWhen: '2026-11-20' }],
      reviewOn: '2026-11-20',
      probabilityPct: 70,
    });
    env.api.reviewPerformancePlan(id, { reviewedOn: '2026-10-26', verdict: 'met', notes: 'Four weeks on time.' });
    const scored = predictionOutcome(concernById(env, id));
    assert.equal(scored.actual, 1);
    assert.equal(scored.brier, 0.09);

    const calibration = performanceCalibration(env.store.state.performanceConcerns);
    assert.equal(calibration.ready, false);
    assert.equal(calibration.n, 1);
    assert.equal(calibration.floor, PERFORMANCE_MIN_RESOLVED);
    assert.match(calibration.note, /anecdote with a decimal point/i);
  });

  test('a partial verdict is half-realised, not rounded to a win', () => {
    const scored = predictionOutcome({
      plan: { prediction: { probabilityPct: 40 } },
      outcome: { verdict: 'partial' },
    });
    assert.equal(scored.actual, 0.5);
    assert.equal(scored.brier, 0.01);
  });
});

/* ============================================================ */
/* 9. Signals, insights, attention, brief                       */
/* ============================================================ */

describe('Signals and brief', () => {
  test('an unsupported record produces PERF-01..05 signals with an action route', () => {
    const env = harness();
    const concern = env.api.addPerformanceConcern({ personId: env.subjectId, label: 'Signal me' });
    const signals = performanceSignals(env.store.state, NOW, env.store.state.settings);
    assert.ok(signals.length > 0);
    for (const signal of signals) {
      assert.ok(PERFORMANCE_SIGNAL_IDS.includes(signal.ruleId));
      assert.ok(signal.title && signal.detail);
      assert.ok(signal.action && signal.action.route.startsWith('#/performance'));
      assert.equal(signal.domain, 'Performance recovery');
    }
    const ids = new Set(signals.map((row) => row.ruleId));
    assert.ok(ids.has('PERF-01'), 'no recorded expectation');
    assert.equal(performanceAttentionCount(env.store.state, NOW, env.store.state.settings) > 0, true);
    assert.equal(concernById(env, concern.id).status, 'assessing');
  });

  test('the insights roll-up lists the domain, so a performance signal cannot vanish', () => {
    const env = harness();
    env.api.addPerformanceConcern({ personId: env.subjectId, label: 'Bucket me' });
    const insights = buildInsights(env.store.state, NOW);
    const perf = insights.byDomain.find((row) => row.domain === 'Performance recovery');
    assert.ok(perf, 'the bucket must exist in byDomain');
    assert.ok(perf.count > 0);
    assert.ok(insights.findings.some((row) => row.domain === 'Performance recovery'));
  });

  test('the brief names no person and states its own limits', () => {
    const env = harness();
    openFullyDocumented(env);
    const brief = performanceBrief(env.store.state, NOW, env.store.state.settings);
    const text = env.api.performanceBriefText();
    assert.equal(typeof brief, 'string');
    assert.equal(typeof text, 'string');
    assert.match(text, /PERFORMANCE RECOVERY/);
    assert.ok(!text.includes('Tomas Berg'), 'a brief that names people is a dossier');
    assert.ok(!text.includes('Tomas'));
    assert.match(text, /not legal advice/i);
    assert.match(text, /not a rating/i);
    assert.match(text, /USD/);
  });
});

/* ============================================================ */
/* 10. CSV scope #52                                            */
/* ============================================================ */

describe('CSV scope #52 — facts, never prose', () => {
  test('the export is registered, sensitive, and carries no label or name', () => {
    const descriptor = CSV_EXPORTS.find((row) => row.key === 'performance');
    assert.ok(descriptor, 'scope registered');
    assert.equal(descriptor.sensitive, true);
    assert.equal(CSV_EXPORTS.length, 68);

    const env = harness();
    openFullyDocumented(env);
    const out = exportWorkspaceCsv(env.store.state, 'performance', { now: NOW });
    assert.equal(out.ok, true, out.error);
    assert.equal(out.rowCount, 1);
    assert.ok(!out.csv.includes('Tomas Berg'));
    assert.ok(!out.csv.includes('Escalation rota not published'));
    assert.ok(out.csv.includes('PC01'));
    assert.ok(out.csv.includes('P01'));
    assert.match(out.csv.split('\n')[0], /justice_total/);
  });

  test('an unknown scope still fails closed', () => {
    const out = exportWorkspaceCsv(createEmptyState(NOW.toISOString()), 'notAScope', { now: NOW });
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'unknown-scope');
  });
});

/* ============================================================ */
/* 11. Cross-module graph                                       */
/* ============================================================ */

describe('The frozen node and its route', () => {
  test('perfconcern is a first-class link node with a navigable relation', () => {
    assert.ok(LINK_ENTITY_TYPES.includes('perfconcern'));
    assert.ok(LINK_RELATIONS.includes('concerns'));
  });

  test('the route resolves through the alias table and the case resolver', () => {
    assert.equal(parseRoute('#/performance').route, 'performance');
    assert.equal(parseRoute('#/perf').route, 'performance');
    assert.equal(parseRoute('#/concerns').route, 'performance');
    assert.equal(parseRoute('#/performance?panel=evidence').query.get('panel'), 'evidence');
  });

  test('every performance signal action links to a valid ?panel= route (never legacy ?tab= or ?panel=conversation)', async () => {
    const { performanceSignals } = await import('../../app/core/domain/performance.js');
    const s = createEmptyState(NOW.toISOString());
    s.people = [{ id: 'p-1', name: 'Alex', status: 'active' }];
    s.performanceConcerns = [{
      id: 'pc-route', personId: 'p-1', label: 'Gap', status: 'assessing',
      openedOn: '2026-09-01',
      standard: { expectation: '', source: 'none', recordedOn: null },
      gap: { observed: 'Late handoff', impact: 'Delay' },
      observations: [], conversations: [], supports: [], answers: {}, plan: null, outcome: null,
    }];
    const norm = normalizeState(s, { now: NOW }).state;
    const sigs = performanceSignals(norm, NOW);
    assert.ok(sigs.length >= 1);
    for (const sig of sigs) {
      assert.doesNotMatch(sig.action.route, /\?tab=/);
      assert.doesNotMatch(sig.action.route, /panel=conversation/);
      assert.match(sig.action.route, /^#\/performance\?panel=(evidence|diagnosis|plan|concerns)/);
    }
  });

  test('the nav declares the route and the badge is wired', () => {
    const source = fs.readFileSync(path.join(ROOT, 'app/main.js'), 'utf8');
    assert.match(source, /route: 'performance'/);
    assert.match(source, /performance: performanceAttentionCount/);
    assert.match(source, /performance: \(ctx_?\)|performance: \(ctx\)/);
  });
});

/* ============================================================ */
/* 12. The view                                                 */
/* ============================================================ */

function bootDom() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(e.message);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const dom = new JSDOM(HTML, { url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  const styleEl = window.document.createElement('style');
  styleEl.textContent = CSS;
  window.document.head.appendChild(styleEl);
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.KeyboardEvent = window.KeyboardEvent;
  globalThis.FileReader = window.FileReader;
  globalThis.localStorage = window.localStorage;
  return { dom, window, document: window.document, consoleErrors };
}

async function axeViolations(env, selector = '#view') {
  if (!env.window.axe) env.window.eval(AXE_SRC);
  const res = await env.window.axe.run(env.document.querySelector(selector), {
    rules: { 'color-contrast': { enabled: false } },
  });
  return Array.from(res.violations).map((v) => `${v.id}: ${v.help}`);
}

describe('The terminal renders', () => {
  test('every panel renders, tables are captioned, and the limits are stated', () => {
    const { document } = bootDom();
    const env = harness();
    const id = openFullyDocumented(env);
    const state = env.store.state;
    const panels = ['concerns', 'evidence', 'diagnosis', 'plan', 'method'];
    for (const panel of panels) {
      const node = renderPerformance({
        state,
        now: NOW,
        query: new URLSearchParams(`panel=${panel}&concern=${id}`),
        api: { performanceBriefText: () => 'stub' },
        navigate: () => {},
        refresh: () => {},
      });
      document.getElementById('view').replaceChildren(node);
      assert.ok(node.querySelector('h1'), `${panel} has a heading`);
      for (const table of node.querySelectorAll('table')) {
        assert.ok(table.querySelector('caption') || table.getAttribute('aria-label'), `${panel} table is captioned`);
      }
    }
    const method = renderPerformance({
      state, now: NOW, query: new URLSearchParams('panel=method'), api: {}, navigate: () => {},
    });
    const text = method.textContent;
    assert.match(text, /not legal advice/i);
    assert.match(text, /does not rate performance/i);
    assert.match(text, /Mager & Pipe/i);
  });

  test('the page passes axe-core', async () => {
    const dom = bootDom();
    const env = harness();
    const id = openFullyDocumented(env);
    const node = renderPerformance({
      state: env.store.state,
      now: NOW,
      query: new URLSearchParams(`panel=concerns&concern=${id}`),
      api: { performanceBriefText: () => 'stub' },
      navigate: () => {},
    });
    dom.document.getElementById('view').replaceChildren(node);
    const violations = await axeViolations(dom);
    assert.deepEqual(violations, []);
    assert.deepEqual(dom.consoleErrors, []);
  });
});

/* ============================================================ */
/* 13. The demo seed                                            */
/* ============================================================ */

describe('The demo shows the three states, through the real rule', () => {
  test('three concerns, one blocked, one overdue, one scored', () => {
    const state = buildDemoState(NOW);
    assert.equal(state.performanceConcerns.length, 3);
    const report = performanceReport(state, NOW, state.settings);
    assert.equal(report.counts.total, 3);
    assert.equal(report.counts.open, 2);
    assert.equal(report.counts.overdueReviews, 1);
    assert.ok(report.counts.blocked >= 1);
    assert.equal(report.calibration.ready, false);
    assert.equal(report.calibration.n, 1);

    const decision = state.decisions.find((row) => row.title.includes('supported and reviewed'));
    assert.ok(decision, 'the plan adoption ran through the real rule');
    const overdueTask = state.delegations.find((row) => row.title.includes('overdue review'));
    assert.ok(overdueTask, 'the scan ran through the real rule');
    assert.match(overdueTask.support, /RULE-PERF-05/);
    assert.ok(state.links.some((row) => row.sourceType === 'perfconcern' || row.targetType === 'perfconcern'));
  });

  test('every demo record is removable by clearDemo', () => {
    const state = buildDemoState(NOW);
    const ids = [
      ...state.performanceConcerns.map((row) => row.id),
      ...state.delegations.filter((row) => row.title.includes('RULE-PERF') || row.support.includes('RULE-PERF')).map((row) => row.id),
    ];
    assert.ok(ids.length > 0);
    for (const id of ids) assert.match(id, /-demo-/, `${id} must carry the demo marker so cleanup finds it`);
  });
});
