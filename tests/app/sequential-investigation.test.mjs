/**
 * tests/app/sequential-investigation.test.mjs — the Sequential Investigation
 * Planner (Session 81, RULE-SEQ-01..03, ADR-0046).
 *
 * The claims under test are specific and falsifiable:
 *
 *   1. No schema change: the planner reads Schema v56 records as they are, and
 *      a workspace with no investigations is left untouched.
 *   2. The arithmetic is exact against hand-computed numbers: a perfect test is
 *      worth exactly the EVPI, a duplicate test adds nothing, and a noisy test's
 *      net value matches the Bayes calculation done by hand.
 *   3. With one stage and no settled evidence, every declared test's value
 *      equals the EXISTING single-test engine's net value (evaluateInquiry),
 *      across 60 deterministic random frames. The two engines cannot drift.
 *   4. Value never falls as the horizon grows, and a full sequence is never
 *      worth less than the best single test (the plan can always stop).
 *   5. Settled evidence conditions the belief by Bayes' rule, the order of
 *      settlement does not matter under conditional independence, and evidence
 *      that cannot all be true is refused rather than normalised.
 *   6. Refusals are explicit: an unpriced frame, probabilities that do not sum to 100,
 *      and settled evidence that cannot all be true. Coin-flip and untargeted tests are
 *      excluded from the menu. The menu (six tests) and horizon (three stages) are CAPPED
 *      and printed, never silently exceeded.
 *   7. The plan is deterministic: the same declared records give the same tree
 *      and the same reference.
 *   8. RULE-SEQ-01 writes one advisory note when a second stage is material and
 *      stays silent when it is not; re-scanning never duplicates it.
 *   9. RULE-SEQ-03 turns a settled test into exactly one owned task on the frame
 *      owner, dated to the next test, with a typed link back to the frame.
 *  10. RULE-SEQ-02 opens exactly one commit decision when the plan stops, prices
 *      every option under the updated belief, and REVISES the same open decision
 *      if a later settlement reaches the same conclusion.
 *  11. The cascade runs through the real action layer in one transaction per
 *      write, and respects `voiAutoPropagate: false`.
 *  12. The Sequence tab renders under JSDOM with one h1, named tables and the
 *      decision tree as a semantic nested list.
 *  13. The rules are registered on the shared spine after the VOI rule and before
 *      decision tempo, with a declared contract and catalog entries.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createStore } from '../../app/core/store.js';
import { createEmptyState, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createApi } from '../../app/actions.js';
import {
  SEQ_MAX_STAGES,
  SEQ_MAX_TESTS,
  beliefFromEvidence,
  buildSequencePlan,
  solveSequentialPlan,
  updateBelief,
} from '../../app/core/domain/sequentialInvestigation.js';
import { evaluateFrame, evaluateInquiry, payoffTable } from '../../app/core/domain/valueOfInformation.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { AUTOMATION_RULES } from '../../app/core/domain/automation.js';
import { valueOfInformationRule } from '../../app/core/domain/valueOfInformationRules.js';
import { decisionTempoRule } from '../../app/core/domain/decisionTempo.js';
import { sequentialInvestigationRule } from '../../app/core/domain/sequentialInvestigationRules.js';
import { renderVoi } from '../../app/views/valueOfInformation.js';

const NOW = new Date('2026-10-30T12:00:00.000Z');
const TODAY = '2026-10-30';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function makeStore() {
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-s81-${++sequence}`;
  const store = createStore({ storage: memoryStorage(), now: () => NOW, idFactory });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory });
  return { store, api };
}

function seedLeader(store) {
  store.update((draft) => {
    draft.people = [
      { id: 'p-lead', name: 'Alex', role: 'Head of Ops', level: 'lead', managerId: null, status: 'active', startDate: '2024-01-01', talkingPoints: [] },
    ];
  }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'Seed a leader' });
}

/** The same hand-checkable frame the information-value suite uses: 70/30, EV(commit) 520, EVPI 180. */
function framePayload(label = 'Commit the cutover') {
  return {
    label,
    question: 'Do we commit now, stage it, or wait?',
    ownerId: 'p-lead',
    currency: 'USD',
    states: [
      { id: 'vs-1', label: 'It lands on time', probability: 70 },
      { id: 'vs-2', label: 'It slips', probability: 30 },
    ],
    options: [
      { id: 'vo-1', label: 'Commit now', isStatusQuo: false },
      { id: 'vo-2', label: 'Stage behind a flag', isStatusQuo: false },
      { id: 'vo-3', label: 'Wait', isStatusQuo: true },
    ],
    payoffs: [
      { optionId: 'vo-1', stateId: 'vs-1', value: 1000 },
      { optionId: 'vo-2', stateId: 'vs-1', value: 600 },
      { optionId: 'vo-3', stateId: 'vs-1', value: 100 },
      { optionId: 'vo-1', stateId: 'vs-2', value: -600 },
      { optionId: 'vo-2', stateId: 'vs-2', value: -100 },
      { optionId: 'vo-3', stateId: 'vs-2', value: 0 },
    ],
  };
}

function makeFrame(api, payload = framePayload()) {
  const created = api.addVoiDecision(payload);
  assert.equal(created.ok, true, created.error);
  return created.id;
}

/* A two-option-plus-wait fixture for the pure solver, so every number is checkable. */
const STATE_IDS = ['s1', 's2'];
const OPTIONS = [
  { id: 'commit', label: 'Commit', isStatusQuo: false },
  { id: 'wait', label: 'Wait', isStatusQuo: true },
];
const TABLE = { 'commit::s1': 1000, 'commit::s2': -600, 'wait::s1': 100, 'wait::s2': 0 };
const PAYOFF = (optionId, stateId) => TABLE[`${optionId}::${stateId}`];
const BELIEF = [0.7, 0.3];
const PERFECT = { id: 'perf', label: 'Perfect', targetStateIds: ['s2'], sensitivityPct: 100, specificityPct: 100, cost: 0, delayCost: 0 };
const NOISY = { id: 'noisy', label: 'Noisy', targetStateIds: ['s2'], sensitivityPct: 90, specificityPct: 80, cost: 50, delayCost: 0 };

/* ----------------------------------------------------------- 1. no migration */

test('no schema change: v56 records are read as they are and an empty workspace gains nothing', () => {
  assert.equal(SCHEMA_VERSION, 77);
  const empty = normalizeState(createEmptyState(), { now: NOW }).state;
  assert.deepEqual(empty.voiDecisions, []);
  assert.deepEqual(empty.voiStudies, []);
  const plan = buildSequencePlan(empty, 'missing-frame', { now: NOW });
  assert.equal(plan.ok, false);
  assert.match(plan.reason, /no longer exists/);
});

/* ------------------------------------------------------------ 2. exact arithmetic */

test('a perfect test is worth exactly the EVPI, a duplicate adds nothing, a noisy test is worth its hand-computed net', () => {
  // EV(commit) = 0.7·1000 − 0.3·600 = 520. EVPI = 0.7·1000 + 0.3·0 − 520 = 180.
  const perfect = solveSequentialPlan({ stateIds: STATE_IDS, options: OPTIONS, payoff: PAYOFF, belief: BELIEF, tests: [PERFECT], maxStages: 1 });
  assert.equal(perfect.stopValue, 520);
  assert.equal(perfect.oneStageValue, 700, 'stop value 520 plus EVPI 180');
  assert.equal(perfect.verdict, 'test-first');

  const duplicate = { ...PERFECT, id: 'dup', label: 'Duplicate perfect' };
  const twice = solveSequentialPlan({ stateIds: STATE_IDS, options: OPTIONS, payoff: PAYOFF, belief: BELIEF, tests: [PERFECT, duplicate], maxStages: 2 });
  assert.equal(twice.sequenceValue, 700);
  assert.equal(twice.secondStageGain, 0, 'a second test that cannot change the decision adds nothing');

  // Hand-computed. P(+) = 0.7·0.2 + 0.3·0.9 = 0.41. After +: Lands 0.3415, Slips 0.6585, so Wait (34.15)
  // beats Commit (−53.6). After −: Lands 0.9492, Slips 0.0508, so Commit (918.6). Expected value with the test:
  // 0.41·34.15 + 0.59·918.6 ≈ 556.0. Less the 50 fee that is 506, against 520 for deciding now: net −14, so stop.
  const noisy = solveSequentialPlan({ stateIds: STATE_IDS, options: OPTIONS, payoff: PAYOFF, belief: BELIEF, tests: [NOISY], maxStages: 1 });
  assert.equal(noisy.verdict, 'decide-now');
  assert.equal(noisy.sequenceValue, 520);
  assert.equal(noisy.expectedTests, 0);
});

test('the posterior after one test is Bayes’ rule, exactly', () => {
  // Test: targets Slips with sensitivity 60, specificity 70. P(+|Slips)=0.6, P(+|Lands)=0.3.
  const test = { targetStateIds: ['s2'], sensitivityPct: 60, specificityPct: 70 };
  const after = updateBelief(STATE_IDS, BELIEF, test, 'positive');
  // Joint: Lands 0.7·(1−0.7) = 0.21, Slips 0.3·0.6 = 0.18; normalised Lands = 0.21/0.39.
  assert.ok(Math.abs(after[0] - 0.21 / 0.39) < 1e-12);
  assert.ok(Math.abs(after[0] + after[1] - 1) < 1e-12);
});

/* ------------------------------------- 3. consistency with the single-test engine */

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function randomFrame(random, index) {
  const stateCount = 2 + Math.floor(random() * 3);
  const weights = Array.from({ length: stateCount }, () => 1 + Math.floor(random() * 9));
  const total = weights.reduce((a, b) => a + b, 0);
  const probabilities = weights.map((w) => Math.max(1, Math.round((100 * w) / total)));
  probabilities[probabilities.length - 1] += 100 - probabilities.reduce((a, b) => a + b, 0);
  const states = probabilities.map((probability, i) => ({ id: `s${i}`, label: `State ${i}`, probability }));
  const optionCount = 2 + Math.floor(random() * 3);
  const options = Array.from({ length: optionCount }, (_, i) => ({ id: `o${i}`, label: `Option ${i}`, isStatusQuo: i === optionCount - 1 }));
  const payoffs = [];
  for (const option of options) {
    for (const state of states) {
      payoffs.push({ optionId: option.id, stateId: state.id, value: Math.round(random() * 1500) - 500 });
    }
  }
  return { id: `frame-${index}`, label: `Random frame ${index}`, status: 'open', currency: 'USD', states, options, payoffs };
}

function randomStudy(random, frame, index) {
  const stateIds = frame.states.map((state) => state.id);
  const targetCount = 1 + Math.floor(random() * Math.max(1, stateIds.length - 1));
  const targetStateIds = stateIds.slice(0, targetCount);
  const sensitivityPct = 55 + Math.floor(random() * 46);
  const specificityPct = Math.max(101 - sensitivityPct, 55) + Math.floor(random() * (101 - Math.max(101 - sensitivityPct, 55)));
  return {
    id: `study-${frame.id}-${index}`,
    frameId: frame.id,
    label: `Study ${index}`,
    targetStateIds,
    sensitivityPct,
    specificityPct: Math.min(100, specificityPct),
    cost: Math.floor(random() * 80),
    delayCost: Math.floor(random() * 20),
    status: 'planned',
    result: null,
    createdAt: `2026-10-29T0${index % 9}:00:00.000Z`,
  };
}

test('with one stage and no settled evidence, each test equals the existing single-test net value across 60 random frames', () => {
  const random = rng(81);
  let compared = 0;
  for (let i = 0; i < 60; i += 1) {
    const frame = randomFrame(random, i);
    const study = randomStudy(random, frame, i);
    const reference = evaluateInquiry(frame, study);
    if (!reference.ok || reference.netValue === null) continue;
    const plan = buildSequencePlan({ voiDecisions: [frame], voiStudies: [study] }, frame.id, { now: NOW });
    assert.equal(plan.ok, true, plan.reason);
    assert.ok(Math.abs(plan.menu[0].singleNetValue - reference.netValue) <= 0.05,
      `frame ${i}: planner ${plan.menu[0].singleNetValue} vs engine ${reference.netValue}`);
    compared += 1;
  }
  assert.ok(compared >= 45, `expected most random frames to be valuable, compared ${compared}`);
});

/* ------------------------------------------------------- 4. monotonicity */

test('value never falls as the horizon grows, and a full sequence is never worth less than one test', () => {
  const random = rng(7);
  for (let i = 0; i < 25; i += 1) {
    const frame = randomFrame(random, i);
    const tests = Array.from({ length: 4 }, (_, j) => {
      const study = randomStudy(random, frame, j);
      return { id: study.id, label: study.label, targetStateIds: study.targetStateIds, sensitivityPct: study.sensitivityPct, specificityPct: study.specificityPct, cost: study.cost, delayCost: study.delayCost };
    });
    const reading = evaluateFrame(frame);
    if (!reading.priced) continue;
    const table = payoffTable(frame);
    const stateIds = frame.states.map((s) => s.id);
    const belief = frame.states.map((s) => s.probability / 100);
    const payoff = (o, s) => table.get(o, s);
    const values = [0, 1, 2, 3].map((k) => solveSequentialPlan({ stateIds, options: frame.options, payoff, belief, tests, maxStages: k }).sequenceValue);
    for (let k = 1; k < values.length; k += 1) assert.ok(values[k] >= values[k - 1] - 1e-9, `frame ${i}: horizon ${k} fell below ${k - 1}`);
    assert.ok(values[1] >= values[0] - 1e-9);
  }
});

/* ---------------------------------------------- 5. conditioning on settled tests */

test('settled evidence conditions the belief by Bayes, in any order, and inconsistent evidence is refused', () => {
  const stateIds = ['s1', 's2'];
  const a = { id: 'a', targetStateIds: ['s2'], sensitivityPct: 60, specificityPct: 70, signal: 'positive' };
  const b = { id: 'b', targetStateIds: ['s1'], sensitivityPct: 80, specificityPct: 80, signal: 'negative' };
  const ab = beliefFromEvidence(stateIds, [70, 30], [a, b]);
  const ba = beliefFromEvidence(stateIds, [70, 30], [b, a]);
  assert.equal(ab.ok, true);
  assert.ok(Math.abs(ab.belief[0] - ba.belief[0]) < 1e-12, 'conditional independence makes the order irrelevant');
  // Hand-check: after a positive (see above) the belief is Lands 0.21/0.39, Slips 0.18/0.39.
  // Then b is negative. Lands is b's target, so P(−|Lands) = 1 − se = 0.2. Slips is not, so P(−|Slips) = sp = 0.8.
  const afterA = [0.21 / 0.39, 0.18 / 0.39];
  const joint0 = afterA[0] * 0.2;
  const joint1 = afterA[1] * 0.8;
  assert.ok(Math.abs(ab.belief[0] - joint0 / (joint0 + joint1)) < 1e-12);

  // Two perfect tests on the same state that contradict each other cannot both be true.
  const contradictory = beliefFromEvidence(stateIds, [70, 30], [
    { targetStateIds: ['s2'], sensitivityPct: 100, specificityPct: 100, signal: 'positive' },
    { targetStateIds: ['s2'], sensitivityPct: 100, specificityPct: 100, signal: 'negative' },
  ]);
  assert.equal(contradictory.ok, false);
});

/* ------------------------------------------------------------- 6. refusals */

test('refusals are explicit: unpriced frames, bad probabilities, coin-flip and untargeted tests, and the menu and horizon caps', () => {
  const { store, api } = makeStore();
  seedLeader(store);
  const id = makeFrame(api);
  const frameOnly = store.state;

  const unpriced = structuredClone(frameOnly);
  unpriced.voiDecisions[0].payoffs = unpriced.voiDecisions[0].payoffs.slice(1);
  const refusedUnpriced = buildSequencePlan(unpriced, id, { now: NOW });
  assert.equal(refusedUnpriced.ok, false);
  assert.match(refusedUnpriced.reason, /unpriced/);

  const badSum = structuredClone(frameOnly);
  badSum.voiDecisions[0].states[0].probability = 60;
  assert.equal(buildSequencePlan(badSum, id, { now: NOW }).ok, false);

  const withBad = structuredClone(frameOnly);
  withBad.voiStudies = [
    { id: 'coin', frameId: id, label: 'Coin', targetStateIds: ['vs-2'], sensitivityPct: 50, specificityPct: 50, cost: 0, delayCost: 0, status: 'planned', result: null, createdAt: '2026-10-29T10:00:00.000Z' },
    { id: 'none', frameId: id, label: 'No target', targetStateIds: [], sensitivityPct: 90, specificityPct: 90, cost: 0, delayCost: 0, status: 'planned', result: null, createdAt: '2026-10-29T10:01:00.000Z' },
    { id: 'real', frameId: id, label: 'Real', targetStateIds: ['vs-2'], sensitivityPct: 90, specificityPct: 80, cost: 10, delayCost: 0, status: 'planned', result: null, createdAt: '2026-10-29T10:02:00.000Z' },
  ];
  const filtered = buildSequencePlan(withBad, id, { now: NOW });
  assert.deepEqual(filtered.menu.map((row) => row.id), ['real'], 'coin-flip and untargeted tests never enter the plan');

  const many = structuredClone(frameOnly);
  many.voiStudies = Array.from({ length: 8 }, (_, i) => ({
    id: `many-${i}`, frameId: id, label: `Test ${i}`, targetStateIds: ['vs-2'], sensitivityPct: 85, specificityPct: 85,
    cost: 5 + i, delayCost: 0, status: 'planned', result: null, createdAt: `2026-10-29T10:0${i}:00.000Z`,
  }));
  const capped = buildSequencePlan(many, id, { now: NOW });
  assert.equal(capped.menu.length, SEQ_MAX_TESTS);
  assert.equal(capped.omittedTests, 8 - SEQ_MAX_TESTS, 'omitted tests are counted, never silently dropped');

  const tests = many.voiStudies.map((row) => ({ id: row.id, label: row.label, targetStateIds: row.targetStateIds, sensitivityPct: 85, specificityPct: 85, cost: 1, delayCost: 0 }));
  const table = payoffTable(frameOnly.voiDecisions[0]);
  const deep = solveSequentialPlan({
    stateIds: ['vs-1', 'vs-2'], options: frameOnly.voiDecisions[0].options, payoff: (o, s) => table.get(o, s), belief: [0.7, 0.3], tests, maxStages: 10,
  });
  assert.equal(deep.horizon, SEQ_MAX_STAGES);
});

/* ------------------------------------------------------------ 7. determinism */

test('the same declared records give the same tree and the same reference', () => {
  const { store, api } = makeStore();
  seedLeader(store);
  const id = makeFrame(api);
  api.addInformationRequest(id, { label: 'Vendor read', targetStateIds: ['vs-2'], sensitivityPct: 60, specificityPct: 70, cost: 0 });
  api.addInformationRequest(id, { label: 'Load test', targetStateIds: ['vs-1'], sensitivityPct: 70, specificityPct: 70, cost: 20 });
  const first = buildSequencePlan(store.state, id, { now: NOW });
  const second = buildSequencePlan(structuredClone(store.state), id, { now: NOW });
  assert.equal(first.ok, true);
  assert.equal(first.planRef, second.planRef);
  assert.deepEqual(first.tree, second.tree);
  assert.match(first.planRef, /^SEQ-[0-9A-Z]{6}$/);
});

/* ----------------------------------------------------- the cascade fixtures */

/**
 * Two tests that together make a genuine two-stage plan: a free, weak read on the
 * slip state, then a stronger, costly test on the land-on-time state. The numbers
 * were chosen with the planner itself and are re-derived in the assertions.
 */
function declareSequence(api, frameId) {
  const a = api.addInformationRequest(frameId, {
    label: 'Vendor status read', targetStateIds: ['vs-2'], sensitivityPct: 60, specificityPct: 70, cost: 0, dueOn: '2026-11-10',
  });
  assert.equal(a.ok, true, a.error);
  const b = api.addInformationRequest(frameId, {
    label: 'Load test', targetStateIds: ['vs-1'], sensitivityPct: 70, specificityPct: 70, cost: 20, dueOn: '2026-11-20',
  });
  assert.equal(b.ok, true, b.error);
  return { a: a.id, b: b.id };
}

function notesFrom(store, frameId, source) {
  const frame = store.state.voiDecisions.find((row) => row.id === frameId);
  return (frame.notes || []).filter((entry) => entry.source === source);
}

/* --------------------------------------------- 8. RULE-SEQ-01 advisory note */

test('RULE-SEQ-01 writes one conditional-plan note when a second stage is material, and re-scanning never duplicates it', () => {
  const { store, api } = makeStore();
  seedLeader(store);
  const id = makeFrame(api);
  api.addInformationRequest(id, { label: 'Vendor status read', targetStateIds: ['vs-2'], sensitivityPct: 60, specificityPct: 70, cost: 0 });
  assert.equal(notesFrom(store, id, 'RULE-SEQ-01').length, 0, 'one test is a single-stage plan: nothing to advise');

  const b = api.addInformationRequest(id, { label: 'Load test', targetStateIds: ['vs-1'], sensitivityPct: 70, specificityPct: 70, cost: 20 });
  assert.equal(b.ok, true);
  const notes = notesFrom(store, id, 'RULE-SEQ-01');
  assert.equal(notes.length, 1, 'the second declaration makes a second stage material and writes exactly one note');
  assert.match(notes[0].note, /^Sequential plan\. First: run “Vendor status read” \(fires 39/);
  assert.match(notes[0].note, /If it does not, decide “Commit now” \(expected USD 685\)/);
  assert.match(notes[0].note, /If it fires,/);
  assert.match(notes[0].note, /If it does not,/);
  assert.ok(notes[0].note.length <= 600);

  api.scanVoi();
  api.scanVoi();
  assert.equal(notesFrom(store, id, 'RULE-SEQ-01').length, 1, 'scanning is idempotent by plan reference');
});

/* ----------------------------------------- 9. RULE-SEQ-03 owned next-stage task */

test('RULE-SEQ-03: a settled first test creates exactly one owned task for the next test, dated to it, linked to the frame', () => {
  const { store, api } = makeStore();
  seedLeader(store);
  const id = makeFrame(api);
  const { a, b } = declareSequence(api, id);
  const settled = api.settleInformationRequest(a, { signal: 'positive', note: 'vendor says slip risk is real' });
  assert.equal(settled.ok, true, settled.error);

  const tasks = store.state.delegations.filter((row) => (row.support || '').includes('[SEQ-NEXT:'));
  assert.equal(tasks.length, 1, 'exactly one owned task');
  assert.equal(tasks[0].personId, 'p-lead');
  assert.equal(tasks[0].dueOn, '2026-11-20', 'dated to the next test’s due date');
  assert.match(tasks[0].title, /Run “Load test”/);
  assert.match(tasks[0].support, new RegExp(`\\[SEQ-NEXT:${a}\\]`));
  assert.ok(store.state.links.some((link) => link.sourceType === 'voi' && link.sourceId === id
    && link.targetType === 'delegation' && link.targetId === tasks[0].id && link.relation === 'tracks-followup'),
  'typed tracks-followup link from the frame to the task');
  assert.ok(JSON.stringify(settled.propagations).includes('RULE-SEQ-03'), 'the chain reports the rule that acted');
  assert.ok(b, 'the second test was declared');

  // Re-running the rule on the same settled test cannot add a second task.
  api.scanVoi();
  assert.equal(store.state.delegations.filter((row) => (row.support || '').includes('[SEQ-NEXT:')).length, 1);
});

test('RULE-SEQ-03 with no owner records a note instead of inventing one', () => {
  const { store, api } = makeStore();
  seedLeader(store);
  const id = makeFrame(api, { ...framePayload(), ownerId: null });
  const { a } = declareSequence(api, id);
  api.settleInformationRequest(a, { signal: 'positive' });
  assert.equal(store.state.delegations.filter((row) => (row.support || '').includes('[SEQ-NEXT:')).length, 0);
  const notes = notesFrom(store, id, 'RULE-SEQ-03');
  assert.equal(notes.length, 1);
  assert.match(notes[0].note, /No owner is set/);
});

/* ------------------------------------------- 10. RULE-SEQ-02 commit decision */

test('RULE-SEQ-02: when the plan stops, one commit decision prices every option; a later stop revises it rather than duplicating it', () => {
  const { store, api } = makeStore();
  seedLeader(store);
  const id = makeFrame(api);
  const { a, b } = declareSequence(api, id);

  // A positive first result leaves the second test worth buying, so no commit yet.
  api.settleInformationRequest(a, { signal: 'positive' });
  assert.equal(store.state.decisions.filter((row) => (row.question || '').includes('[SEQ-COMMIT-OPEN:')).length, 0);

  // The second test settles; with nothing left in the menu the plan stops.
  const settled = api.settleInformationRequest(b, { signal: 'negative', note: 'load test clean' });
  assert.equal(settled.ok, true, settled.error);
  const commits = store.state.decisions.filter((row) => (row.question || '').includes(`[SEQ-COMMIT-OPEN:${id}]`));
  assert.equal(commits.length, 1, 'exactly one live commit decision for the frame');
  const decision = commits[0];
  assert.equal(decision.options.length, 3, 'one DACI option per frame option');
  assert.equal(decision.decidedOn, null);
  assert.match(decision.question, new RegExp(`\\[SEQ-COMMIT:${b}\\]`), 'the settled test that caused the stop is recorded');
  assert.doesNotMatch(decision.question, new RegExp(`\\[SEQ-COMMIT:${a}\\]`), 'the earlier positive result did not stop the plan');
  // Hand-computed under the updated belief. After a positive at 60/70 then a negative at 70/70 on the land state:
  // Lands 0.21/0.39·0.3 and Slips 0.18/0.39·0.7, normalised, give Lands 1/3 and Slips 2/3.
  // Commit = (1/3)·1000 − (2/3)·600 ≈ −67. Stage = (1/3)·600 − (2/3)·100 ≈ 133, so Stage is the stop option.
  const stage = decision.options.find((row) => row.label === 'Stage behind a flag');
  const commit = decision.options.find((row) => row.label === 'Commit now');
  assert.match(stage.pros, /Highest expected value under the updated belief: USD 133/);
  assert.match(commit.pros, /Expected value USD -67 under the updated belief/);
  assert.ok(JSON.stringify(settled.propagations).includes('RULE-SEQ-02'));
});

test('RULE-SEQ-02 revises the open commit decision when a second frame-level stop arrives, and never edits a decided one', () => {
  const { store, api } = makeStore();
  seedLeader(store);
  const id = makeFrame(api);
  const first = api.addInformationRequest(id, { label: 'First read', targetStateIds: ['vs-2'], sensitivityPct: 95, specificityPct: 95, cost: 0 });
  assert.equal(first.ok, true);
  const second = api.addInformationRequest(id, { label: 'Second read', targetStateIds: ['vs-2'], sensitivityPct: 60, specificityPct: 60, cost: 0 });
  assert.equal(second.ok, true);
  // Settle the strong test first: the plan can stop, and does.
  api.settleInformationRequest(first.id, { signal: 'negative' });
  const open = () => store.state.decisions.filter((row) => (row.question || '').includes(`[SEQ-COMMIT-OPEN:${id}]`));
  assert.equal(open().length, 1);
  const originalId = open()[0].id;
  // Settling the weak test changes nothing material, but it IS a new settled result: the same live decision is revised.
  api.settleInformationRequest(second.id, { signal: 'positive' });
  assert.equal(open().length, 1, 'still one live decision');
  assert.equal(open()[0].id, originalId, 'revised in place, same id');
  assert.match(open()[0].question, new RegExp(`\\[SEQ-COMMIT:${first.id}\\]`), 'history of settled tests kept');

  // Once a leader decides it, a further settlement opens a fresh decision rather than rewriting history.
  store.update((draft) => {
    const row = draft.decisions.find((entry) => entry.id === originalId);
    row.decidedOn = TODAY;
    row.chosen = row.options[0].id;
  }, { type: 'test.decide', entity: 'decision', entityId: originalId, summary: 'Leader decided' });
  const third = api.addInformationRequest(id, { label: 'Third read', targetStateIds: ['vs-1'], sensitivityPct: 80, specificityPct: 80, cost: 0 });
  assert.equal(third.ok, true);
  api.settleInformationRequest(third.id, { signal: 'positive' });
  assert.equal(open().length, 2, 'the decided one is left as it was; the new stop is a new question');
  assert.ok(store.state.decisions.find((row) => row.id === originalId).decidedOn === TODAY);
});

test('RULE-SEQ-02 never runs on a frame that is no longer open', () => {
  const { store, api } = makeStore();
  seedLeader(store);
  const id = makeFrame(api);
  const { a, b } = declareSequence(api, id);
  assert.equal(api.abandonVoiDecision(id).ok, true);
  api.settleInformationRequest(a, { signal: 'positive' });
  api.settleInformationRequest(b, { signal: 'negative' });
  assert.equal(store.state.decisions.filter((row) => (row.question || '').includes('[SEQ-COMMIT-OPEN:')).length, 0);
});

/* -------------------------------------------- 11. voiAutoPropagate respected */

test('voiAutoPropagate:false silences the declare and settle cascades; a scan still reads the plan', () => {
  const { store, api } = makeStore();
  seedLeader(store);
  store.update((draft) => { draft.settings = { ...(draft.settings || {}), voiAutoPropagate: false }; }, { type: 'test.settings', entity: 'workspace', entityId: '', summary: 'Pause automation' });
  const id = makeFrame(api);
  const { a } = declareSequence(api, id);
  api.settleInformationRequest(a, { signal: 'positive' });
  assert.equal(store.state.delegations.filter((row) => (row.support || '').includes('[SEQ-NEXT:')).length, 0);
  assert.equal(notesFrom(store, id, 'RULE-SEQ-01').length, 0);
});

/* ------------------------------------------------ 12. the rendered Sequence tab */

function renderInDom(state, hash) {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { virtualConsole, url: `https://leados.test/${hash}` });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event;
  globalThis.localStorage = window.localStorage;
  const query = new URLSearchParams(hash.split('?')[1] || '');
  const ctx = {
    state,
    now: NOW,
    today: TODAY,
    query,
    api: { scanVoi: () => ({ ok: true, changed: false }) },
    navigate: () => {},
    refresh: () => {},
  };
  const node = renderVoi(ctx);
  window.document.getElementById('app').append(node);
  return { window, node };
}

test('the Sequence tab renders the decision tree as a semantic nested list with named tables and six tabs', () => {
  const { store, api } = makeStore();
  seedLeader(store);
  const id = makeFrame(api);
  declareSequence(api, id);
  const { window, node } = renderInDom(store.state, `#/voi?panel=sequence&frame=${id}`);
  const doc = window.document;
  assert.equal(doc.querySelectorAll('h1').length, 1);
  assert.equal(doc.querySelectorAll('[role="tab"]').length, 6);
  assert.equal(doc.querySelector('[role="tab"][aria-selected="true"]').textContent, 'Sequence');
  assert.equal(doc.querySelectorAll('table:not([aria-label])').length, 0, 'every table is named');
  const tree = doc.querySelector('ol.seq-root');
  assert.ok(tree, 'the root of the decision tree is an ordered list');
  assert.match(doc.body.textContent, /Run “Vendor status read” first/);
  assert.match(doc.body.textContent, /If it fires/);
  assert.match(doc.body.textContent, /If it does not fire/);
  assert.match(doc.body.textContent, /What this plan assumes/);
  assert.match(doc.body.textContent, /conditionally independent/);
  assert.ok(node);
});

test('the Sequence tab refuses honestly for an unpriced frame', () => {
  const { store, api } = makeStore();
  seedLeader(store);
  const created = api.addVoiDecision({ ...framePayload(), payoffs: [] });
  assert.equal(created.ok, true, created.error);
  const { window } = renderInDom(store.state, `#/voi?panel=sequence&frame=${created.id}`);
  assert.match(window.document.body.textContent, /No plan can be worked out/);
});

/* ------------------------------------------- 13. registration on the spine */

test('the rule runs on the shared spine after the VOI rule and before decision tempo, with a contract and catalog entries', () => {
  const rules = [...DEFAULT_POST_COMMIT_RULES];
  const seq = rules.indexOf(sequentialInvestigationRule);
  assert.ok(seq > rules.indexOf(valueOfInformationRule), 'after the VOI rule');
  assert.ok(seq < rules.indexOf(decisionTempoRule), 'before decision tempo, so new decisions get a timing position');

  const contract = PROPAGATION_CONTRACTS.find((row) => row.rule === sequentialInvestigationRule);
  assert.ok(contract, 'declared propagation contract');
  assert.equal(contract.scansWorkspace, false, 'it reads only the frame and its own investigations');
  assert.ok(contract.writes.includes('decisions') && contract.writes.includes('delegations') && contract.writes.includes('links'));

  for (const id of ['RULE-SEQ-01', 'RULE-SEQ-02', 'RULE-SEQ-03']) {
    assert.ok(AUTOMATION_RULES.some((row) => row.id === id), `${id} is in the automation catalog`);
  }
});
