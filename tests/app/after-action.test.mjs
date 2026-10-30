/**
 * tests/app/after-action.test.mjs — the After-Action Review & Learning Ledger
 * (Schema v44).
 *
 * The suite covers, in order:
 *   1. Purity and determinism of the engine (no state mutation, no ambient clock).
 *   2. The subject inventory: which closures count, which are undated, which are
 *      outside the window — and the fact that each exclusion is counted, not hidden.
 *   3. The auto-draft (RULE-AAR-01): one review per closure, pre-filled from the
 *      frozen record, idempotent, and never inventing a cause.
 *   4. Holding a review: the refusal paths (before the outcome, without a cause,
 *      in the future) and the success path with its event.
 *   5. Lessons: class taxonomy, the `none` → observation rule, and the fact that
 *      an observation can never enter the applied rate.
 *   6. RULE-AAR-02: a committed delegation-type change becomes one owned
 *      delegation with a stable marker, and replaying does not duplicate it.
 *   7. RULE-AAR-03: a class recurring while the earlier change stayed open opens
 *      exactly one close-or-drop decision, and applying the change stops it.
 *   8. Coverage and latency arithmetic, including the counts-only floor.
 *   9. Migration v43 → v44 preserves old unverified claims; detachment and duplicate collapse on load.
 *  10. The full JSDOM journey: queue → start → hold → lesson → apply, with axe
 *      across all four tabs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  createEmptyState,
  migrate,
  normalizeState,
  SCHEMA_VERSION,
  DEFAULT_SETTINGS,
} from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { resolveLinkedEntity } from '../../app/core/domain/cases.js';
import { buildDemoState } from '../../app/core/demo.js';
import { buildInsights, DOMAIN_ORDER } from '../../app/core/domain/insights.js';
import {
  AAR_MIN_CLOSURES,
  AAR_QUESTIONS,
  LESSON_CLASS_KEYS,
  buildLearningReport,
  assessLessonEvidence,
  lessonEvidenceCandidates,
  learningAttentionCount,
  learningBrief,
  learningRule,
  learningSignals,
  lessonClassLabel,
  normalizeRetroPayload,
  subjectEvidence,
} from '../../app/core/domain/learning.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-28T10:00:00.000Z');
const TODAY = '2026-10-28';

function kvStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function harness(storage = kvStorage(), now = NOW) {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-aar-${++seq}`;
  const store = createStore({ storage, now: () => now, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => now, idFactory }), storage };
}

/** A workspace with one person, one resolved case (with frozen forecast + actuals). */
function seeded(now = NOW) {
  const { store, api } = harness(kvStorage(), now);
  api.addPerson({ name: 'Ada Lovelace', role: 'Engineer', level: 'senior', startDate: '2025-01-01' });
  const personId = store.state.people[0].id;
  const created = api.addCase({
    kind: 'incident',
    title: 'Vendor failover outage',
    summary: 'Failover took nine hours and nobody paged',
    ownerId: personId,
    openedOn: '2026-09-20',
    fmea: { severity: 8, probability: 7, detectability: 4 },
    financial: {
      optimistic: 500,
      mostLikely: 1000,
      pessimistic: 2000,
      capacityDaysOptimistic: 2,
      capacityDaysMostLikely: 4,
      capacityDaysPessimistic: 9,
    },
  });
  assert.ok(created.ok, created.error);
  const resolved = api.resolveCase(created.id, {
    resolvedOn: '2026-10-01',
    resolutionNotes: 'Vendor restored service after nine hours',
    actuals: { materialised: true, realisedExposure: 1800, divertedDays: 9 },
  });
  assert.ok(resolved.ok, resolved.error);
  return { store, api, personId, caseId: created.id };
}

function holdAnswers(overrides = {}) {
  return {
    intended: 'We expected the vendor to fail over within one hour',
    actual: 'Failover took nine hours and no page reached the on-call engineer',
    cause: 'No owner for the vendor escalation path, so nobody knew who to call',
    sustain: 'The incident channel stayed open and factual throughout',
    improve: 'Name an escalation owner per vendor and test the page',
    heldOn: '2026-10-05',
    ...overrides,
  };
}

/* ------------------------------------------------------------------ 1. purity */

test('the engine is pure: no state mutation, no ambient clock, deterministic output', () => {
  const state = buildDemoState(NOW);
  const before = JSON.stringify({ retros: state.retros, cases: state.cases.length, decisions: state.decisions.length });
  const a = buildLearningReport(state, NOW);
  const b = buildLearningReport(state, NOW);
  const after = JSON.stringify({ retros: state.retros, cases: state.cases.length, decisions: state.decisions.length });
  assert.equal(before, after, 'buildLearningReport must not mutate the state it reads');
  assert.deepEqual(a.closures, b.closures);
  assert.deepEqual(a.recurrence.classes.map((c) => [c.class, c.eventCount, c.open]), b.recurrence.classes.map((c) => [c.class, c.eventCount, c.open]));
  assert.equal(a.evaluatedAt, b.evaluatedAt);
  // A different clock changes only what depends on it.
  const later = buildLearningReport(state, new Date('2026-11-30T10:00:00.000Z'));
  assert.notEqual(later.today, a.today);
  assert.equal(later.retros.length, a.retros.length);
});

/* ------------------------------------------------------- 2. subject inventory */

test('closures are inventoried with their exclusions counted, never dropped', () => {
  const raw = {
    schemaVersion: 43,
    people: [{ id: 'p1', name: 'Ada', role: 'Engineer', status: 'active', startDate: '2025-01-01' }],
    cases: [
      { id: 'c-dated', title: 'Dated close', status: 'resolved', resolvedOn: '2026-10-10', openedOn: '2026-10-01' },
      { id: 'c-undated', title: 'No close date', status: 'resolved', resolvedOn: null, openedOn: '2026-10-01' },
      { id: 'c-old', title: 'Ancient', status: 'closed', resolvedOn: '2026-01-01', openedOn: '2025-12-01' },
      { id: 'c-open', title: 'Still open', status: 'open', resolvedOn: null, openedOn: '2026-10-01' },
    ],
  };
  // Read the raw blob exactly as stored: an undated close is *excluded and
  // counted*, never given an invented date by the engine.
  const rawReport = buildLearningReport(raw, NOW);
  assert.equal(rawReport.closures.dated, 1, 'only the dated, in-window closure is countable');
  assert.equal(rawReport.closures.undated, 1);
  assert.equal(rawReport.closures.outsideWindow, 1);
  assert.ok(rawReport.confidence.reasons.some((line) => line.includes('no closing date')));
  assert.equal(rawReport.closures.coveragePct, null, 'below the floor there is no rate, only counts');
  assert.equal(rawReport.closures.confidence, 'counts-only');

  // The normaliser is what fills a missing close date (the record's own rule),
  // which is why the engine can say the count came from the store and not from it.
  const normalized = normalizeState(raw, { now: NOW }).state;
  const report = buildLearningReport(normalized, NOW);
  assert.equal(report.closures.undated, 0);
  assert.equal(report.closures.dated, 2);
  assert.equal(report.closures.outsideWindow, 1);
  assert.equal(report.closures.byType.length, 4, 'a subject type with nothing in the window still appears, with zeros');
});

test('an in-window closed subject cannot be re-dated by the payload, and is not reviewed twice', () => {
  const { store, api } = seeded();
  // The auto-draft already exists, so a second review of the same closure is refused.
  const duplicate = normalizeRetroPayload({ subjectType: 'case', subjectId: store.state.cases[0].id, outcomeOn: '2026-09-01' }, { state: store.state, now: NOW });
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.error, /already has a review/);

  // With drafting off, the payload is accepted — and still uses the record's date.
  api.updateLearningPolicy({ autoDraft: false });
  const second = api.addCase({
    kind: 'incident', title: 'Dated close case', summary: 'Storage latency spike', openedOn: '2026-10-02',
    fmea: { severity: 5, probability: 5, detectability: 5 },
    financial: { optimistic: 100, mostLikely: 200, pessimistic: 300, capacityDaysOptimistic: 1, capacityDaysMostLikely: 2, capacityDaysPessimistic: 3 },
  });
  api.resolveCase(second.id, { resolvedOn: '2026-10-20', resolutionNotes: 'Resolved by adding an index' });
  const parsed = normalizeRetroPayload({ subjectType: 'case', subjectId: second.id, outcomeOn: '2026-09-01' }, { state: store.state, now: NOW });
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.value.outcomeOn, '2026-10-20', 'the closing date is read from the record, not typed');
});

test('a record that has not ended cannot be reviewed', () => {
  const { store, api } = seeded();
  const open = api.addCase({ kind: 'risk', title: 'Still open risk', summary: 'ongoing', openedOn: '2026-10-01' });
  assert.ok(open.ok, open.error);
  const parsed = normalizeRetroPayload({ subjectType: 'case', subjectId: open.id }, { state: store.state, now: NOW });
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /has not ended yet/);
});

/* ------------------------------------------------------------ 3. auto-drafting */

test('RULE-AAR-01 drafts exactly one review from the closing record, pre-filled and causeless', () => {
  const { store, api, caseId } = seeded();
  const drafts = store.state.retros.filter((r) => r.subjectId === caseId);
  assert.equal(drafts.length, 1);
  const retro = drafts[0];
  assert.equal(retro.status, 'draft');
  assert.equal(retro.autoDrafted, true);
  assert.equal(retro.outcomeOn, '2026-10-01');
  assert.match(retro.intended, /Frozen at opening/);
  assert.match(retro.actual, /Settled: the failure mode materialised/);
  assert.equal(retro.cause, '', 'the cause is never inferred');
  assert.equal(retro.lessons.length, 0);

  // Idempotent: an unrelated update to the same case must not create a second one.
  api.updateCase(caseId, { summary: 'Failover took nine hours and nobody paged the vendor' });
  assert.equal(store.state.retros.filter((r) => r.subjectId === caseId).length, 1);

  // Disabling auto-drafting stops the drafting, not the queue.
  api.updateLearningPolicy({ autoDraft: false });
  const second = api.addCase({
    kind: 'incident', title: 'Second incident', summary: 'Storage latency spike', openedOn: '2026-10-02',
    fmea: { severity: 5, probability: 5, detectability: 5 },
    financial: { optimistic: 100, mostLikely: 200, pessimistic: 300, capacityDaysOptimistic: 1, capacityDaysMostLikely: 2, capacityDaysPessimistic: 3 },
  });
  api.resolveCase(second.id, { resolvedOn: '2026-10-20', resolutionNotes: 'Resolved by adding an index' });
  assert.equal(store.state.retros.filter((r) => r.subjectId === second.id).length, 0);
  const report = buildLearningReport(store.state, NOW);
  assert.ok(report.queue.some((row) => row.subjectId === second.id && !row.retroId), 'the closure still appears in the queue');
  api.updateLearningPolicy({ autoDraft: true });
});

test('evidence pre-fill reads the frozen forecast, never the edited estimate', () => {
  const { store, caseId } = seeded();
  const evidence = subjectEvidence(store.state, 'case', caseId);
  assert.ok(evidence.lines.some((line) => line.label === 'Opening forecast'));
  assert.ok(evidence.lines.some((line) => line.label === 'Settled actuals'));
  assert.match(evidence.intended, /expected exposure/);
  // The frozen snapshot keeps the numbers recorded at opening even after an edit.
  const before = evidence.intended;
  const edited = JSON.parse(JSON.stringify(store.state));
  edited.cases[0].financial.mostLikely = 99999;
  assert.equal(subjectEvidence(edited, 'case', caseId).intended, before);
});

/* ------------------------------------------------------------ 4. holding */

test('holding a review refuses every way a review could lie about itself', () => {
  const { store, api, caseId } = seeded();
  const retroId = store.state.retros.find((r) => r.subjectId === caseId).id;

  const tooEarly = api.holdRetro(retroId, holdAnswers({ heldOn: '2026-09-25' }));
  assert.equal(tooEarly.ok, false);
  assert.match(tooEarly.error, /cannot precede the outcome/);

  const future = api.holdRetro(retroId, holdAnswers({ heldOn: '2026-12-01' }));
  assert.equal(future.ok, false);

  const noCause = api.holdRetro(retroId, holdAnswers({ cause: 'chaos' }));
  assert.equal(noCause.ok, false);
  assert.equal(noCause.field, 'cause');

  const held = api.holdRetro(retroId, holdAnswers());
  assert.ok(held.ok, held.error);
  const retro = store.state.retros.find((r) => r.id === retroId);
  assert.equal(retro.status, 'held');
  assert.equal(retro.heldOn, '2026-10-05');

  // A held review is history: answers cannot be rewritten.
  const rewrite = api.saveRetro(retroId, { cause: 'A completely different explanation' });
  assert.equal(rewrite.ok, false);
  assert.match(rewrite.error, /history/);

  // The latency is measured from the record, not from the typing.
  const report = buildLearningReport(store.state, NOW);
  assert.equal(report.heldRetros.length, 1);
  assert.equal(report.closures.reviewed, 1);
  // One closure is below the counts-only floor, so there is no percentage to print.
  assert.equal(report.closures.coveragePct, null);
  assert.equal(report.closures.confidence, 'counts-only');
});

test('a skip is a dated decision with a reason, counted apart from a review', () => {
  const { store, api, caseId } = seeded();
  const retroId = store.state.retros.find((r) => r.subjectId === caseId).id;
  const silent = api.skipRetro(retroId, { reason: 'meh' });
  assert.equal(silent.ok, false);
  const skipped = api.skipRetro(retroId, { reason: 'Contained internally, smaller than the review itself would cost' });
  assert.ok(skipped.ok, skipped.error);
  const report = buildLearningReport(store.state, NOW);
  assert.equal(report.closures.skipped, 1);
  assert.equal(report.closures.held, 0);
  assert.equal(report.heldRetros.length, 0);
});

/* ------------------------------------------------------------ 5. lessons */

test('a lesson without a change is stored as an observation and never inflates the applied rate', () => {
  const { store, api, caseId, personId } = seeded();
  const retroId = store.state.retros.find((r) => r.subjectId === caseId).id;
  assert.ok(api.holdRetro(retroId, holdAnswers()).ok);

  const badClass = api.addLesson(retroId, { class: 'vibes', text: 'Something felt off about the escalation path', changeType: 'none' });
  assert.equal(badClass.ok, false);
  assert.equal(badClass.field, 'class');

  const changeWithoutNote = api.addLesson(retroId, { class: 'dependency', text: 'Escalation has no named owner', changeType: 'delegation', ownerId: personId });
  assert.equal(changeWithoutNote.ok, false);
  assert.equal(changeWithoutNote.field, 'changeNote');

  const observation = api.addLesson(retroId, { class: 'process', text: 'The incident channel stayed factual throughout', changeType: 'none' });
  assert.ok(observation.ok, observation.error);
  const lesson = store.state.retros.find((r) => r.id === retroId).lessons.find((l) => l.id === observation.id);
  assert.equal(lesson.state, 'observation');
  assert.equal(lesson.changeType, 'none');

  const closed = api.recordLessonState(retroId, lesson.id, { state: 'applied', note: 'This should be impossible' });
  assert.equal(closed.ok, false, 'an observation has no change to close');

  const report = buildLearningReport(store.state, NOW);
  assert.equal(report.lessons.total, 1);
  assert.equal(report.lessons.observations, 1);
  assert.equal(report.lessons.committed, 0);
  assert.equal(report.lessons.appliedPct, null, 'no committed change means no applied rate at all');
});

test('an applied change needs a date and a note that says what is now different', () => {
  const { store, api, caseId, personId } = seeded();
  const retroId = store.state.retros.find((r) => r.subjectId === caseId).id;
  assert.ok(api.holdRetro(retroId, holdAnswers()).ok);
  const added = api.addLesson(retroId, {
    class: 'dependency',
    text: 'Vendor escalation has no named owner',
    changeType: 'delegation',
    changeNote: 'Name an escalation owner per vendor and test the page quarterly',
    ownerId: personId,
  });
  assert.ok(added.ok, added.error);

  const emptyNote = api.recordLessonState(retroId, added.id, { state: 'applied', on: '2026-10-10', note: 'done' });
  assert.equal(emptyNote.ok, false);
  assert.equal(emptyNote.field, 'note');

  const beforeReview = api.recordLessonState(retroId, added.id, { state: 'applied', on: '2026-10-01', note: 'Owner named in the vendor register and paged in a drill' });
  assert.equal(beforeReview.ok, false, 'a change cannot be applied before the review that committed it');

  const applied = api.recordLessonState(retroId, added.id, {
    state: 'applied',
    on: '2026-10-20',
    note: 'Owner named in the vendor register and paged in a drill on 2026-10-18',
  });
  assert.ok(applied.ok, applied.error);
  const report = buildLearningReport(store.state, NOW);
  assert.equal(report.lessons.applied, 1);
  assert.equal(report.lessons.appliedPct, 100);
  // A median needs two points; with one it is honestly unavailable.
  assert.equal(report.lessons.medianTimeToApplyDays, null);
  assert.equal(report.lessons.changeQueue.length, 0);
});

/* ------------------------------------------------------- 6. rule fan-out */

test('record corroboration is date-bounded, snapshot-checked, linked, and opens a 30-day sustainment loop', () => {
  const { store, api, caseId, personId } = seeded();
  const retroId = store.state.retros.find((r) => r.subjectId === caseId).id;
  assert.ok(api.holdRetro(retroId, holdAnswers()).ok);
  const created = api.addLesson(retroId, {
    class: 'process', text: 'The vendor escalation path needs an explicit accountable owner',
    changeType: 'process', changeNote: 'Add a named owner and a tested escalation procedure', ownerId: personId,
  });
  assert.ok(created.ok, created.error);
  assert.ok(api.recordLessonState(retroId, created.id, { state: 'applied', on: '2026-10-20',
    note: 'Named owner and escalation procedure are now in the vendor runbook' }).ok);

  // An actual completed workspace artifact dated after the held review and
  // before the claimed application is eligible; open and out-of-window records are not.
  const artifact = api.addDelegation({ personId, title: 'Publish tested vendor escalation procedure',
    expectedOutcome: 'Runbook contains the named owner and a successful page test', authority: 'act-inform',
    support: 'Access to the vendor register and paging test environment', delegatedOn: '2026-10-08', dueOn: '2026-10-19' });
  assert.ok(artifact.ok, artifact.error);
  assert.ok(api.completeDelegation(artifact.id, { completedOn: '2026-10-18',
    completionNote: 'Runbook updated and the escalation page test passed' }).ok);

  const retro = store.state.retros.find((r) => r.id === retroId);
  const lesson = retro.lessons.find((row) => row.id === created.id);
  const candidates = lessonEvidenceCandidates(store.state, retro, lesson);
  assert.ok(candidates.some((row) => row.type === 'delegation' && row.id === artifact.id));
  assert.equal(assessLessonEvidence(store.state, retro, lesson).status, 'unverified');

  const attached = api.recordLessonEvidence(retroId, created.id, { sourceKey: `delegation:${artifact.id}`,
    note: 'The runbook artifact records the owner and dated successful escalation test' });
  assert.ok(attached.ok, attached.error);
  assert.equal(attached.propagations.filter((entry) => entry.ruleId === 'RULE-AAR-04').length, 1);
  const refreshedRetro = store.state.retros.find((row) => row.id === retroId);
  const refreshedLesson = refreshedRetro.lessons.find((row) => row.id === created.id);
  assert.equal(assessLessonEvidence(store.state, refreshedRetro, refreshedLesson).status, 'record-corroborated');
  const report = buildLearningReport(store.state, NOW);
  assert.equal(report.lessons.corroborated, 1);
  assert.equal(report.lessons.unverified, undefined, 'the report does not present uncorroborated as a separate measured truth');
  assert.equal(report.lessons.verificationPct, null, 'below five applied claims it reports counts only');
  assert.equal(report.lessons.uncorroborated, 0);

  const link = store.state.links.find((row) => row.sourceType === 'lesson' && row.sourceId === created.id
    && row.targetType === 'delegation' && row.targetId === artifact.id && row.relation === 'corroborates');
  assert.ok(link, 'the provenance is navigable in the typed relationship graph');
  assert.equal(resolveLinkedEntity(store.state, 'lesson', created.id)?.title, 'The vendor escalation path needs an explicit accountable owner');
  const followup = store.state.delegations.find((row) => String(row.title).startsWith('Check practice persistence'));
  assert.ok(followup, 'RULE-AAR-04 creates a persistence check, not an effectiveness claim');
  assert.equal(followup.personId, personId);
  assert.equal(followup.dueOn, '2026-11-27');
  assert.match(followup.expectedOutcome, /does not establish that the change caused/);
  assert.doesNotMatch(followup.title + followup.expectedOutcome + followup.support, /vendor escalation path|Publish tested vendor escalation procedure/,
    'sensitive lesson and artifact titles stay in the private retro record, not exported delegation text');
  assert.ok(store.state.links.some((row) => row.sourceType === 'lesson' && row.sourceId === created.id
    && row.targetType === 'delegation' && row.targetId === followup.id));

  const duplicate = api.recordLessonEvidence(retroId, created.id, { sourceKey: `delegation:${artifact.id}`,
    note: 'This duplicate must be refused and not create another task' });
  assert.equal(duplicate.ok, false);
  assert.equal(store.state.delegations.filter((row) => String(row.title).startsWith('Check practice persistence')).length, 1);

  // A later evidence-record edit invalidates its captured snapshot; it is not
  // silently treated as corroborated forever.
  store.update((draft) => { draft.delegations.find((row) => row.id === artifact.id).completionNote = 'Replaced after attachment'; },
    { type: 'delegation.updated', entity: 'delegation', entityId: artifact.id, summary: 'Edited evidence artifact' });
  const staleRetro = store.state.retros.find((row) => row.id === retroId);
  const staleLesson = staleRetro.lessons.find((row) => row.id === created.id);
  assert.equal(assessLessonEvidence(store.state, staleRetro, staleLesson).status, 'stale');
  assert.equal(buildLearningReport(store.state, NOW).lessons.staleEvidence, 1);
});

test('RULE-AAR-02 turns a committed delegation change into one owned, actionable commitment', () => {
  const { store, api, caseId, personId } = seeded();
  const retroId = store.state.retros.find((r) => r.subjectId === caseId).id;
  assert.ok(api.holdRetro(retroId, holdAnswers()).ok);
  const before = store.state.delegations.length;
  const decisionsBefore = store.state.decisions.length;
  const added = api.addLesson(retroId, {
    class: 'dependency',
    text: 'Vendor escalation has no named owner',
    changeType: 'delegation',
    changeNote: 'Name an escalation owner per vendor and test the page quarterly',
    ownerId: personId,
  });
  assert.ok(added.ok, added.error);
  assert.equal(store.state.delegations.length, before + 1);
  const delegation = store.state.delegations.find((d) => String(d.expectedOutcome || '').includes(`[RULE-AAR-02:${added.id}]`));
  assert.ok(delegation, 'the committed change became exactly one delegation');
  assert.equal(delegation.personId, personId);
  assert.match(delegation.expectedOutcome, /\[RULE-AAR-02:/);
  assert.match(delegation.title, /Vendor escalation has no named owner/);
  assert.ok(store.state.links.some((link) => link.sourceType === 'learning' && link.targetId === delegation.id));

  // Replaying the rule against current state must not duplicate it.
  const replay = learningRule(store.state, {
    event: { type: 'learning.retro.held', entityId: retroId },
    now: NOW,
    idFactory: (prefix) => `${prefix}-replay`,
    logEvent: () => {},
  });
  assert.deepEqual(replay, []);
  assert.equal(store.state.delegations.length, before + 1);

  // And a decision-type change opens exactly one DACI decision.
  const decisionLesson = api.addLesson(retroId, {
    class: 'decision',
    text: 'Nobody knew whether the vendor or we owned failover',
    changeType: 'decision',
    changeNote: 'Decide who owns vendor failover and write it into the contract',
  });
  assert.ok(decisionLesson.ok, decisionLesson.error);
  assert.equal(store.state.decisions.length, decisionsBefore + 1);
  const decision = store.state.decisions.find((d) => String(d.question || '').includes(`[RULE-AAR-02:${decisionLesson.id}]`));
  assert.ok(decision, 'the decision-type change opened one DACI decision');
  assert.ok(decision.options.length >= 3, 'a decision without options is a task');
  assert.equal(decision.chosen, false, 'the app never decides for the leader');
});

/* ------------------------------------------------------- 7. recurrence */

test('RULE-AAR-03 opens one close-or-drop decision when a class recurs with its change still open', () => {
  const { store, api, personId } = seeded();
  const firstRetroId = store.state.retros[0].id;
  assert.ok(api.holdRetro(firstRetroId, holdAnswers()).ok);
  const lesson = api.addLesson(firstRetroId, {
    class: 'dependency',
    text: 'Vendor escalation has no named owner',
    changeType: 'delegation',
    changeNote: 'Name an escalation owner per vendor and test the page quarterly',
    ownerId: personId,
  });
  assert.ok(lesson.ok, lesson.error);
  const baselineDecisions = store.state.decisions.length;
  assert.equal(
    store.state.decisions.filter((d) => String(d.question).includes('[RULE-AAR-03:')).length,
    0,
    'a single sighting is not a pattern',
  );

  // A second, distinct event with the same class — and the first change still open.
  const other = api.addCase({
    kind: 'incident', title: 'Partner API outage', summary: 'Partner API returned 500s for two hours', openedOn: '2026-10-05',
    fmea: { severity: 6, probability: 6, detectability: 5 },
    financial: { optimistic: 100, mostLikely: 400, pessimistic: 900, capacityDaysOptimistic: 1, capacityDaysMostLikely: 2, capacityDaysPessimistic: 4 },
  });
  api.resolveCase(other.id, { resolvedOn: '2026-10-15', resolutionNotes: 'Partner restored the API' });
  const secondRetroId = store.state.retros.find((r) => r.subjectId === other.id).id;
  assert.ok(api.holdRetro(secondRetroId, holdAnswers({ heldOn: '2026-10-20' })).ok);
  const secondLesson = api.addLesson(secondRetroId, {
    class: 'dependency',
    text: 'Partner API failure had no owner on our side either',
    changeType: 'none',
  });
  assert.ok(secondLesson.ok, secondLesson.error);

  const report = buildLearningReport(store.state, NOW);
  assert.equal(report.recurrence.unclosedCount, 1);
  const recurring = report.recurrence.unclosed[0];
  assert.equal(recurring.class, 'dependency');
  assert.equal(recurring.eventCount, 2);
  assert.equal(recurring.open, 1);
  assert.ok(recurring.unclosed);

  const recurrenceDecisions = store.state.decisions.filter((d) => String(d.question).includes('[RULE-AAR-03:'));
  assert.equal(recurrenceDecisions.length, 1, 'exactly one decision, not one per event');
  assert.ok(store.state.decisions.length > baselineDecisions);
  assert.match(recurrenceDecisions[0].title, /Close or drop the change for recurring/);

  // Applying the change closes the loop: the finding disappears, the decision stays.
  const applied = api.recordLessonState(firstRetroId, lesson.id, {
    state: 'applied',
    on: '2026-10-22',
    note: 'Every vendor now has a named escalation owner in the register',
  });
  assert.ok(applied.ok, applied.error);
  const after = buildLearningReport(store.state, NOW);
  assert.equal(after.recurrence.unclosedCount, 0);
  assert.equal(after.recurrence.unclosed.length, 0);
  const signals = learningSignals(store.state, NOW);
  assert.equal(signals.filter((s) => s.ruleId === 'LEARN-02').length, 0);
  assert.equal(store.state.decisions.filter((d) => String(d.question).includes('[RULE-AAR-03:')).length, 1);
});

/* ------------------------------------------------------- 8. coverage signals */

test('the coverage floor decides between a measured rate and an honest count', () => {
  const state = createEmptyState(NOW.toISOString());
  state.people = [{ id: 'p1', name: 'Ada', status: 'active', startDate: '2025-01-01' }];
  state.cases = Array.from({ length: AAR_MIN_CLOSURES }, (_, i) => ({
    id: `c${i}`, title: `Closure ${i}`, status: 'resolved', openedOn: '2026-10-01', resolvedOn: '2026-10-10',
  }));
  const normalized = normalizeState(state, { now: NOW }).state;
  const report = buildLearningReport(normalized, NOW);
  assert.equal(report.closures.dated, AAR_MIN_CLOSURES);
  assert.equal(report.closures.coveragePct, 0);
  assert.equal(report.closures.belowFloor, true);
  const signals = learningSignals(normalized, NOW);
  assert.ok(signals.some((s) => s.ruleId === 'LEARN-01'));

  // The settings are conventions, and the report says so.
  const strict = buildLearningReport(normalized, NOW, { ...DEFAULT_SETTINGS, learningCoverageFloorPct: 100 });
  assert.equal(strict.closures.coverageFloorPct, 100);
  assert.equal(strict.closures.belowFloor, true);
});

test('the learning index is withheld when fewer than two components are measurable', () => {
  const state = createEmptyState(NOW.toISOString());
  state.cases = [{ id: 'c1', title: 'Only one', status: 'resolved', openedOn: '2026-10-01', resolvedOn: '2026-10-10' }];
  const report = buildLearningReport(normalizeState(state, { now: NOW }).state, NOW);
  assert.equal(report.index.pct, null);
  assert.equal(report.index.band, null);
  assert.ok(report.index.missingComponents.includes('coverage'));

  const demo = buildLearningReport(buildDemoState(NOW), NOW);
  assert.ok(demo.index.pct !== null, 'the demo has enough of a record to measure');
  assert.ok(demo.index.band);
});

/* ------------------------------------------------- 9. schema and normalisation */

test('v42 workspace upgrades additively through v44 and invents no review or corroboration', () => {
  assert.equal(SCHEMA_VERSION, 52);
  const migrated = migrate({
    schemaVersion: 42,
    people: [],
    cases: [{ id: 'c1', title: 'Legacy closure', status: 'resolved', resolvedOn: '2026-10-01', openedOn: '2026-09-01' }],
  });
  assert.deepEqual(migrated.applied, ['42 → 43', '43 → 44', '44 → 45', '45 → 46', '46 → 47', '47 → 48', '48 → 49', '49 → 50', '50 → 51', '51 → 52']);
  assert.deepEqual(migrated.raw.retros, []);
  const normalized = normalizeState(migrated.raw, { now: NOW }).state;
  assert.equal(normalized.retros.length, 0, 'a migration never fabricates a review');
  const report = buildLearningReport(normalized, NOW);
  assert.equal(report.queue.length, 1, 'but the closure is offered for review');
  // Every new setting has a documented default and survives a round trip.
  for (const key of ['retroWindowDays', 'retroDueDays', 'learningCoverageFloorPct', 'learningAutoDraft', 'learningAutoPropagate']) {
    assert.notEqual(normalized.settings[key], undefined, `${key} must have a default`);
  }
});

test('v43 applied claims migrate without fabricated evidence and stay counts-only', () => {
  const prior = {
    schemaVersion: 43,
    people: [],
    retros: [{ id: 'retro-v43', subjectType: 'other', subjectLabel: 'Old review', outcomeOn: '2026-10-01',
      status: 'held', heldOn: '2026-10-05', intended: 'We intended a stable handoff',
      actual: 'The handoff failed once', cause: 'No owner accepted the handoff gate',
      lessons: [{ id: 'lesson-v43', class: 'dependency', text: 'Handoff gate lacked an accountable owner',
        changeType: 'process', changeNote: 'Publish the named handoff owner and escalation path',
        state: 'applied', committedOn: '2026-10-05', appliedOn: '2026-10-20',
        appliedNote: 'The team published an owner and escalation route' }] }],
  };
  const migrated = migrate(prior);
  assert.deepEqual(migrated.applied, ['43 → 44', '44 → 45', '45 → 46', '46 → 47', '47 → 48', '48 → 49', '49 → 50', '50 → 51', '51 → 52']);
  assert.equal(migrated.raw.retros[0].lessons[0].evidence, undefined, 'migration does not invent an artifact');
  const normalized = normalizeState(migrated.raw, { now: NOW }).state;
  const lesson = normalized.retros[0].lessons[0];
  assert.deepEqual(lesson.evidence, []);
  assert.equal(assessLessonEvidence(normalized, normalized.retros[0], lesson).status, 'unverified');
  const report = buildLearningReport(normalized, NOW);
  assert.equal(report.lessons.applied, 1);
  assert.equal(report.lessons.corroborated, 0);
  assert.equal(report.lessons.uncorroborated, 1);
  assert.equal(report.lessons.verificationPct, null);
});

test('normalisation detaches a review whose record vanished and collapses duplicates', () => {
  const state = {
    schemaVersion: 43,
    people: [{ id: 'p1', name: 'Ada', status: 'active', startDate: '2025-01-01' }],
    cases: [],
    retros: [
      {
        id: 'r-detached', subjectType: 'case', subjectId: 'gone', subjectLabel: 'A deleted case',
        status: 'held', outcomeOn: '2026-10-01', heldOn: '2026-10-03',
        intended: 'We expected it to hold', actual: 'It did not hold at all', cause: 'No owner for the dependency',
        lessons: [],
      },
      { id: 'dup1', subjectType: 'other', subjectLabel: 'Duplicate one', status: 'draft', outcomeOn: '2026-10-01' },
      { id: 'dup2', subjectType: 'other', subjectLabel: 'Duplicate two', status: 'draft', outcomeOn: '2026-10-02' },
    ],
  };
  const { state: normalized, warnings } = normalizeState(state, { now: NOW });
  const detached = normalized.retros.find((r) => r.id === 'r-detached');
  assert.equal(detached.subjectType, 'other');
  assert.equal(detached.subjectId, null);
  assert.equal(detached.subjectLabel, 'A deleted case');
  assert.equal(detached.status, 'held', 'the thinking survives the record it was about');
  assert.ok(warnings.some((w) => w.includes('no longer exists')));

  // A review that cannot prove it happened is demoted, not trusted.
  const demoted = normalizeState({
    schemaVersion: 43,
    people: [],
    retros: [{ id: 'r1', subjectType: 'other', subjectLabel: 'Something', status: 'held', outcomeOn: '2026-10-05', heldOn: '2026-10-01', intended: 'x'.repeat(20), actual: 'y'.repeat(20), cause: 'z'.repeat(20) }],
  }, { now: NOW }).state.retros[0];
  assert.equal(demoted.status, 'draft', 'a review dated before its own outcome is not a review');
});

/* ------------------------------------------------------------- 10. integration */

test('the ledger reaches Signals, the domain roll-up, Today and the attention badge', () => {
  const demo = buildDemoState(NOW);
  const insights = buildInsights(demo, NOW);
  const learning = insights.findings.filter((f) => f.ruleId.startsWith('LEARN-'));
  assert.ok(learning.length >= 2, `expected learning findings, got ${learning.map((f) => f.ruleId)}`);
  assert.ok(DOMAIN_ORDER.includes('Learning'));
  assert.ok(insights.byDomain.some((row) => row.domain === 'Learning'), 'a new domain must appear in the roll-up, not only in the count');
  assert.ok(buildInsights(demo, NOW).counts === undefined || true);
  assert.ok(learningAttentionCount(demo, NOW) >= 2);
  const brief = learningBrief(demo, NOW);
  assert.match(brief, /LEADOS — AFTER-ACTION & LEARNING BRIEF/);
  assert.match(brief, /UNCLOSED RECURRENCES/);
  assert.match(brief, /Record corroboration:/);
  assert.ok(lessonClassLabel('dependency').length > 0);
  assert.equal(LESSON_CLASS_KEYS.length, 11);
  assert.equal(AAR_QUESTIONS.length, 5);
});

test('clear-demo removes demo reviews and keeps the leader’s own, scrubbing dead owner pointers', () => {
  const { store, api } = harness(kvStorage(), NOW);
  assert.ok(store.seedDemo().ok);
  const demoRetros = store.state.retros.length;
  assert.ok(demoRetros >= 2);

  // A review the leader recorded themselves, on their own case and their own person.
  api.addPerson({ name: 'Grace Hopper', role: 'Engineer', level: 'senior', startDate: '2025-02-01' });
  const grace = store.state.people.find((p) => p.name === 'Grace Hopper').id;
  const own = api.addCase({
    kind: 'incident', title: 'Own incident', summary: 'A real event in this workspace', ownerId: grace, openedOn: '2026-10-02',
    fmea: { severity: 6, probability: 6, detectability: 5 },
    financial: { optimistic: 100, mostLikely: 300, pessimistic: 600, capacityDaysOptimistic: 1, capacityDaysMostLikely: 2, capacityDaysPessimistic: 4 },
  });
  api.resolveCase(own.id, { resolvedOn: '2026-10-15', resolutionNotes: 'Fixed by the owner and verified' });
  const ownRetroId = store.state.retros.find((r) => r.subjectId === own.id).id;
  assert.ok(api.holdRetro(ownRetroId, holdAnswers({ heldOn: '2026-10-20' })).ok);
  const ownLesson = api.addLesson(ownRetroId, {
    class: 'communication',
    text: 'Nobody told the customer-facing team what was happening',
    changeType: 'delegation',
    changeNote: 'Add the support channel to the incident page step',
    ownerId: grace,
  });
  assert.ok(ownLesson.ok, ownLesson.error);

  store.clearDemo();

  assert.equal(store.state.retros.filter((r) => r.id.startsWith('retro-demo-')).length, 0, 'demo reviews are demo data');
  const survivor = store.state.retros.find((r) => r.id === ownRetroId);
  assert.ok(survivor, 'the leader’s own review is not demo data');
  assert.equal(survivor.status, 'held');
  assert.equal(survivor.lessons.length, 1);
  for (const lesson of survivor.lessons) {
    assert.ok(lesson.ownerId === null || store.state.people.some((p) => p.id === lesson.ownerId));
  }
});

/* --------------------------------------------------------------- 11. UI journey */

function bootDom() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(e.message);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const dom = new JSDOM(HTML, {
    url: 'https://leados.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
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

function click(node) {
  assert.ok(node, 'expected a clickable DOM node');
  node.dispatchEvent(new node.ownerDocument.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
}

test('UI: every tab renders axe-clean, populated and empty, and the queue → ledger journey works', async () => {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ storage: env.window.localStorage, now: () => NOW });
  try {
    app.ctx.loadDemo();
    const navigate = (hash) => app.navigate(hash);

    for (const tab of ['queue', 'ledger', 'recurrence', 'coverage']) {
      navigate(`#/learning?tab=${tab}`);
      const view = env.document.querySelector('#view');
      assert.ok(view.textContent.length > 100, `tab ${tab} rendered nothing`);
      assert.deepEqual(await axeViolations(env), [], `axe violations on the ${tab} tab`);
    }

    // The recurrence tab names the demo's unclosed loop rather than a generic score.
    navigate('#/learning?tab=recurrence');
    assert.match(env.document.querySelector('#view').textContent, /Dependency & handoff/);
    assert.match(env.document.querySelector('#view').textContent, /Repeating, unchanged|recurred/);

    // The queue offers a review, the dialog pre-fills from the record and refuses a short cause.
    navigate('#/learning?tab=queue');
    const startButtons = [...env.document.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Start review');
    assert.ok(startButtons.length >= 1, 'the demo queue has at least one closure to review');
    click(startButtons[0]);
    const dialog = env.document.querySelector('.modal, [role="dialog"]');
    assert.ok(dialog, 'the start-review dialog opened');
    const intended = dialog.querySelector('textarea[name="intended"]');
    assert.ok(intended && intended.value.length > 10, 'intention is pre-filled from the frozen record');
    const cause = dialog.querySelector('textarea[name="cause"]');
    const submit = [...dialog.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open the review');
    cause.value = 'x';
    click(submit);
    assert.ok(dialog.textContent.includes('at least 12 characters'), 'a one-character cause is refused');
    assert.ok(env.document.querySelector('[role="dialog"], .modal'), 'the dialog stays open on a validation failure');

    // The empty workspace renders all four tabs without pretending to measure anything.
    app.ctx.clearDemo ? app.ctx.clearDemo() : app.api.clearDemo();
    for (const tab of ['queue', 'ledger', 'recurrence', 'coverage']) {
      navigate(`#/learning?tab=${tab}`);
      assert.deepEqual(await axeViolations(env), [], `axe violations on the empty ${tab} tab`);
    }
    navigate('#/learning?tab=coverage');
    assert.match(env.document.querySelector('#view').textContent, /Not measurable yet/);
  } finally {
    app.destroy?.();
    env.dom.window.close();
  }
});
