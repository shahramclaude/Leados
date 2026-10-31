/**
 * tests/app/information-value.test.mjs — Schema v54, the Information Value
 * Terminal.
 *
 * The claims under test are specific and falsifiable:
 *
 *   1. The v53 → v54 migration is additive: no frame, state, probability or
 *      payoff is invented for an existing workspace.
 *   2. Normalization refuses to rescale probabilities, drops a payoff cell whose
 *      option or state no longer exists rather than writing a zero, keeps a
 *      state whose premise pointer died and clears only the pointer, drops an
 *      investigation whose frame is gone, and preserves a frozen snapshot.
 *   3. The frame arithmetic is exact: expected value per option, EVPI against a
 *      hand-computed number, a refused table when a cell is missing or the
 *      probabilities do not sum to 100, minimax regret, and the near-tie flag.
 *   4. EVSI obeys its own invariants: a perfect test captures exactly the EVPI,
 *      a useless test is worth nothing, more accuracy is never worth less
 *      (Blackwell), and the break-even accuracy brackets the declared cost.
 *   5. The premise flip is a swap of exactly two declared probabilities and
 *      reports whether the preferred option changes; a premise with any other
 *      number of states is not flipped rather than guessed.
 *   6. The actions refuse what the module refuses: a nameless frame, a
 *      probability set that does not sum to 100, a decision from an unpriced
 *      frame, a decision against the arithmetic with no reason, a coin-flip
 *      test, a test with no target state, and a second settle.
 *   7. One declaration produces typed provenance, exactly one buy-information
 *      decision, one owned scoping task and a dated outcome review on decide —
 *      idempotently.
 *   8. A settled test writes ONE dated observation into the premise ledger with
 *      the diagnostic likelihood ratio LR+ = se/(1−sp) or LR− = (1−se)/sp, and
 *      re-running cannot duplicate it.
 *   9. One premise anchoring several open frames opens exactly ONE de-risking
 *      decision, not one per frame.
 *  10. Settling a decided frame records the realised regret and scores the
 *      declared distribution; it never rewrites the frozen prediction.
 *  11. CSV scope #48 carries opaque codes and ratios only — no label, no
 *      amount, no premise title — and the Insights bucket exists.
 *  12. The page renders every tab under JSDOM with one h1, labelled tables and
 *      a stated set of limits.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createStore } from '../../app/core/store.js';
import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createApi } from '../../app/actions.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { AUTOMATION_RULES } from '../../app/core/domain/automation.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { LINK_ENTITY_TYPES, LINK_RELATIONS, resolveLinkedEntity } from '../../app/core/domain/cases.js';
import {
  VOI_CONVENTIONS,
  buildVoiPortfolio,
  conventionsFromSettings,
  evaluateFrame,
  evaluateInquiry,
  flipPremise,
  likelihoodRatioFor,
  posteriorAfterSignal,
  scoreFrame,
  voiAttentionCount,
  voiBrief,
  voiSignals,
} from '../../app/core/domain/valueOfInformation.js';
import {
  normalizeVoiDecisions,
  normalizeVoiStudies,
} from '../../app/core/domain/valueOfInformationSchema.js';
import {
  VOI_RULE_IDS,
  INQUIRY_SETTLED_EVENT,
  valueOfInformationRule,
} from '../../app/core/domain/valueOfInformationRules.js';
import { evaluatePremiseCore } from '../../app/core/domain/premises.js';
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
  const idFactory = (prefix) => `${prefix}-v54-${++sequence}`;
  const store = createStore({ storage: memoryStorage(), now: () => NOW, idFactory });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory });
  return { store, api };
}

/**
 * A roixture with one load-bearing premise, one leader and one decision record.
 *
 * The numbers are chosen so every expected value in the assertions can be
 * computed by hand: 70/30 over two states, three plainly ordered options.
 */
function seed(store) {
  store.update((draft) => {
    draft.people = [
      { id: 'p-lead', name: 'Alex', role: 'Head of Ops', level: 'lead', managerId: null, status: 'active', startDate: '2024-01-01', talkingPoints: [] },
      { id: 'p-ic', name: 'Sam', role: 'Engineer', level: 'ic', managerId: 'p-lead', status: 'active', startDate: '2025-01-01', talkingPoints: [] },
    ];
    draft.decisions = [
      {
        id: 'dec-existing',
        title: 'Standardise on the warehouse',
        question: 'Which store do we standardise on?',
        date: '2026-09-01',
        approver: 'Alex',
        driver: 'Alex',
        decidedOn: '2026-09-02',
        reversibility: 'reversible',
        options: [],
        contributors: '',
        informed: '',
        chosen: '',
        rationale: '',
        reviewOn: null,
        reviewedOn: null,
        outcome: 'pending',
        outcomeNotes: '',
        forecastProbability: null,
        createdAt: '2026-09-01T09:00:00.000Z',
      },
    ];
    draft.premises = [{
      id: 'prem-1',
      title: 'The freeze date holds',
      statement: 'The platform team will hold the November freeze date for the warehouse cutover.',
      signpost: 'A written date change from the platform lead is the first dated warning that this premise has broken.',
      decisionId: 'dec-existing',
      ownerId: 'p-lead',
      criticality: 'load-bearing',
      priorPct: 70,
      watchPct: 55,
      breachPct: 30,
      halfLifeDays: 90,
      reviewBy: '2026-11-20',
      lastReviewedOn: null,
      acknowledgedOn: null,
      acknowledgedAt: null,
      humanDisposition: null,
      sourceRefs: [],
      observations: [],
      history: [],
      status: 'unobserved',
      reviewCycle: 0,
      posteriorPct: 70,
      logBayesFactor: 0,
      autoPropagate: true,
      createdAt: '2026-10-01T09:00:00.000Z',
      updatedAt: '2026-10-01T09:00:00.000Z',
    }];
  }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'Seed a premise and a decision' });
}

/** A frame whose arithmetic is hand-checkable: EV 520 / 180 EVPI at 70/30. */
function framePayload({ premiseId = null, label = 'Commit the cutover', thresholdStates = null } = {}) {
  const states = thresholdStates || [
    { id: 'vs-1', label: 'It lands on time', probability: 70, premiseId },
    { id: 'vs-2', label: 'It slips', probability: 30, premiseId },
  ];
  return {
    label,
    question: 'Do we commit now, stage it, or wait?',
    ownerId: 'p-lead',
    currency: 'USD',
    states,
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

function makeFrame(api, options = {}) {
  const created = api.addVoiDecision(framePayload(options));
  assert.equal(created.ok, true, created.error);
  return created.id;
}

/* --------------------------------------------------------------- migration */

test('v53 → v54 is additive: no frame, state or payoff is invented', () => {
  assert.equal(SCHEMA_VERSION, 64);
  const applied = migrate({ schemaVersion: 53, people: [{ id: 'p1', name: 'Someone' }] });
  assert.equal(applied.raw.schemaVersion, 64);
  assert.deepEqual(applied.applied, ['53 → 54', '54 → 55', '55 → 56', '56 → 57', '57 → 58', '58 → 59', '59 → 60', '60 → 61', '61 → 62', '62 → 63', '63 → 64']);
  assert.deepEqual(applied.raw.voiDecisions, []);
  assert.deepEqual(applied.raw.voiStudies, []);
  const normalized = normalizeState(applied.raw, { now: NOW });
  assert.deepEqual(normalized.state.voiDecisions, []);
  assert.deepEqual(normalized.state.voiStudies, []);
});

/* ----------------------------------------------------------- normalization */

test('normalization refuses to rescale, drops dangling cells and keeps history', () => {
  const state = {
    people: [{ id: 'p1', name: 'A', status: 'active' }],
    premises: [{ id: 'prem-keep' }],
    decisions: [{ id: 'dec-keep' }],
  };
  const warnings = [];
  const [frame] = normalizeVoiDecisions([{
    id: 'voi-x',
    label: '  A   frame ',
    ownerId: 'gone',
    decisionId: 'gone-too',
    currency: 'xyz',
    status: 'nonsense',
    states: [
      { id: 's1', label: 'One', probability: 60, premiseId: 'prem-keep' },
      { id: 's2', label: 'Two', probability: 60, premiseId: 'prem-gone' },
      { id: 's1', label: 'dup', probability: 10 },
    ],
    options: [
      { id: 'o1', label: 'A' },
      { id: 'o2', label: 'B' },
      { id: 'o2', label: 'dup' },
    ],
    payoffs: [
      { optionId: 'o1', stateId: 's1', value: 10 },
      { optionId: 'o1', stateId: 's1', value: 99 },
      { optionId: 'o9', stateId: 's1', value: 5 },
      { optionId: 'o1', stateId: 's9', value: 5 },
      { optionId: 'o2', stateId: 's2', value: null },
    ],
    snapshot: { evpi: 12, capturedAt: '2026-10-01T00:00:00.000Z', probabilities: [{ stateId: 's1', pct: 60 }] },
  }], state, NOW, warnings);

  assert.equal(frame.label, 'A frame');
  assert.equal(frame.currency, 'USD');
  assert.equal(frame.status, 'open');
  assert.equal(frame.ownerId, null, 'a departed owner is unset');
  assert.equal(frame.decisionId, null, 'a dead decision pointer is cleared');
  assert.equal(frame.states.length, 2, 'the duplicate state is dropped');
  assert.equal(frame.states[1].premiseId, null, 'the state survives and only its premise pointer is cleared');
  assert.equal(frame.options.length, 2);
  assert.equal(frame.payoffs.length, 1, 'only the cell that exists on both ends survives, once');
  assert.equal(frame.payoffs[0].value, 10);
  assert.equal(frame.snapshot.evpi, 12, 'a frozen snapshot is preserved');
  assert.ok(warnings.some((w) => w.includes('100%')), 'the refused probability sum is reported');
  assert.ok(warnings.some((w) => w.includes('no longer exists')));

  const studies = normalizeVoiStudies([
    { id: 'i1', frameId: 'voi-x', status: 'settled', targetStateIds: ['s1', 's9'], sensitivityPct: 80, specificityPct: 90, cost: 500, delayCost: 250 },
    { id: 'i2', frameId: 'does-not-exist', label: 'orphan' },
    { id: 'i3', frameId: 'voi-x', label: 'negative wait', cost: 100, delayCost: -900 },
  ], { voiDecisions: [frame] }, NOW, warnings);
  assert.equal(studies.length, 2, 'an investigation whose frame is gone is dropped with it');
  assert.deepEqual(studies[0].targetStateIds, ['s1'], 'targets are resolved against the surviving states');
  assert.equal(studies[0].delayCost, 250, 'a declared cost of waiting survives normalization');
  assert.equal(studies[1].delayCost, 0, 'a negative cost of waiting is zero, never a subsidy for waiting');
});

/* ------------------------------------------------------------- arithmetic */

test('expected value, EVPI and minimax regret are exact and refuse gaps', () => {
  const payload = framePayload();
  const reading = evaluateFrame(payload);
  assert.equal(reading.priced, true);
  const ev = Object.fromEntries(reading.options.map((row) => [row.optionId, row.ev]));
  assert.equal(ev['vo-1'], 520); // 0.7*1000 + 0.3*(-600)
  assert.equal(ev['vo-2'], 390); // 0.7*600  + 0.3*(-100)
  assert.equal(ev['vo-3'], 70); // 0.7*100  + 0.3*0
  assert.equal(reading.best.optionId, 'vo-1');
  // EVPI = 0.7*1000 + 0.3*0 − 520
  assert.equal(reading.evpi, 180);
  assert.equal(reading.evpiShareOfStakePct, 18); // 180 / 1000
  // Worst regret: A 600, B 400, C 900 → the robust choice is B, not A.
  assert.equal(reading.minimaxRegret.optionId, 'vo-2');
  assert.equal(reading.minimaxRegret.maxRegret, 400);
  assert.equal(reading.robustChoiceDiffersFromExpected, true);
  assert.equal(reading.nearTie, false);
  assert.equal(reading.perState.find((row) => row.stateId === 'vs-2').regretOfPick, 600);

  // A missing cell refuses the arithmetic rather than filling a zero.
  const gap = { ...payload, payoffs: payload.payoffs.filter((cell) => !(cell.optionId === 'vo-2' && cell.stateId === 'vs-2')) };
  const gapReading = evaluateFrame(gap);
  assert.equal(gapReading.priced, false);
  assert.equal(gapReading.missingCells, 1);
  assert.equal(gapReading.evpi, null);
  assert.equal(gapReading.options.find((row) => row.optionId === 'vo-2').ev, null);
  assert.ok(gapReading.reasons.some((r) => r.includes('payoff cell')));

  // A probability set that is not 100 is refused, not rescaled.
  const badSum = { ...payload, states: [{ id: 'vs-1', label: 'a', probability: 60 }, { id: 'vs-2', label: 'b', probability: 30 }] };
  const sumReading = evaluateFrame(badSum);
  assert.equal(sumReading.probabilitiesOk, false);
  assert.equal(sumReading.evpi, null);
  assert.ok(sumReading.reasons.some((r) => r.includes('90%')));
});

/* -------------------------------------------------------------------- EVSI */

test('EVSI captures the whole EVPI with a perfect test and nothing with a coin flip', () => {
  const payload = framePayload();
  const perfect = evaluateInquiry(payload, {
    targetStateIds: ['vs-1'], sensitivityPct: 100, specificityPct: 100, cost: 0,
  });
  assert.equal(perfect.ok, true);
  assert.equal(perfect.evsi, 180, 'a perfect test is worth exactly the EVPI');
  assert.equal(perfect.efficiencyPct, 100);
  assert.equal(perfect.netValue, 180);

  const useless = evaluateInquiry(payload, {
    targetStateIds: ['vs-1'], sensitivityPct: 50, specificityPct: 50, cost: 0,
  });
  assert.equal(useless.ok, true);
  assert.equal(useless.evsi, 0, 'a test that is a coin flip is worth nothing');
  assert.equal(useless.verdict, 'not-worth-it', 'worth nothing and costing anything at all is a bad buy');

  const costly = evaluateInquiry(payload, {
    targetStateIds: ['vs-1'], sensitivityPct: 80, specificityPct: 90, cost: 150,
  });
  assert.equal(costly.ok, true);
  assert.ok(costly.evsi > 0 && costly.evsi < 180, 'a real test sits between nothing and perfect');
  assert.equal(costly.netValue, Math.round((costly.evsi - 150) * 100) / 100);
  assert.equal(costly.verdict, 'not-worth-it');
  assert.ok(costly.reason.includes('negative'));

  // Blackwell monotonicity: more sensitivity at the same specificity is never worth less.
  const weaker = evaluateInquiry(payload, { targetStateIds: ['vs-1'], sensitivityPct: 70, specificityPct: 90, cost: 0 });
  const stronger = evaluateInquiry(payload, { targetStateIds: ['vs-1'], sensitivityPct: 95, specificityPct: 90, cost: 0 });
  assert.ok(stronger.evsi >= weaker.evsi, 'EVSI is monotone in sensitivity');

  // Break-even: a cheap test pays at lower accuracy than an expensive one, and a
  // test that can never pay reports null rather than a made-up number.
  const cheap = evaluateInquiry(payload, { targetStateIds: ['vs-1'], sensitivityPct: 80, specificityPct: 90, cost: 10 });
  const dear = evaluateInquiry(payload, { targetStateIds: ['vs-1'], sensitivityPct: 80, specificityPct: 90, cost: 160 });
  assert.ok(cheap.breakEvenSensitivityPct !== null);
  assert.ok(dear.breakEvenSensitivityPct === null || dear.breakEvenSensitivityPct > cheap.breakEvenSensitivityPct);

  // Posterior moves the right way.
  const posterior = posteriorAfterSignal(payload, { targetStateIds: ['vs-1'], sensitivityPct: 80, specificityPct: 90 }, 'positive');
  assert.ok(posterior.posteriors.find((row) => row.stateId === 'vs-1').posteriorPct > 70);

  // The diagnostic likelihood ratio, in its standard form.
  assert.equal(likelihoodRatioFor({ signal: 'positive', sensitivityPct: 80, specificityPct: 90 }).lr, 8);
  assert.equal(likelihoodRatioFor({ signal: 'negative', sensitivityPct: 80, specificityPct: 90 }).lr, 0.222);
  // A perfect test would claim infinite certainty; the ledger refuses that.
  assert.equal(likelihoodRatioFor({ signal: 'positive', sensitivityPct: 100, specificityPct: 100 }).lr, 20);
});

test('the fee is not the whole cost of learning: the wait is priced too', () => {
  const payload = framePayload();
  const base = evaluateInquiry(payload, { targetStateIds: ['vs-1'], sensitivityPct: 90, specificityPct: 95, cost: 0 });
  assert.equal(base.ok, true);
  assert.ok(base.evsi > 0);
  assert.equal(base.delayCost, 0, 'no wait declared is no wait charged');
  assert.equal(base.totalCost, 0);
  assert.equal(base.netValue, base.evsi);

  const delayed = evaluateInquiry(payload, { targetStateIds: ['vs-1'], sensitivityPct: 90, specificityPct: 95, cost: 40, delayCost: 60 });
  assert.equal(delayed.evsi, base.evsi, 'the signal and the decision it changes are identical');
  assert.equal(delayed.totalCost, 100, 'the two costs add, they do not compete');
  assert.equal(delayed.netValue, Math.round((base.evsi - 100) * 100) / 100);
  assert.equal(delayed.netValue, base.netValue - 100, 'the same test, the same answer, a hundred less valuable');

  // A wait long enough to swallow the whole value is a verdict, not a rounding artefact.
  const swallowed = evaluateInquiry(payload, {
    targetStateIds: ['vs-1'], sensitivityPct: 90, specificityPct: 95, cost: 0, delayCost: base.evsi + 1,
  });
  assert.equal(swallowed.verdict, 'not-worth-it');
  assert.match(swallowed.reason, /waiting/, 'the refusal names the wait, not just the invoice');

  // Break-even accuracy is solved against the total, so a cheap fee with a long
  // wait cannot quietly buy accuracy it could never pay for.
  const feeOnly = evaluateInquiry(payload, { targetStateIds: ['vs-1'], sensitivityPct: 80, specificityPct: 90, cost: 20 });
  const feeAndWait = evaluateInquiry(payload, { targetStateIds: ['vs-1'], sensitivityPct: 80, specificityPct: 90, cost: 20, delayCost: 90 });
  assert.ok(feeOnly.breakEvenSensitivityPct !== null);
  assert.ok(feeAndWait.breakEvenSensitivityPct === null
    || feeAndWait.breakEvenSensitivityPct > feeOnly.breakEvenSensitivityPct,
  'a test that also costs time needs more accuracy to pay for itself');
});

/* ------------------------------------------------------------------ stress */

test('a premise flip swaps exactly two states and reports the swing', () => {
  const payload = framePayload({ premiseId: 'prem-1' });
  const flipped = flipPremise(payload, 'prem-1');
  assert.ok(flipped);
  // Flipped 30/70: EV(commit) = 0.3*1000 + 0.7*(-600) = -120; EV(stage) = 0.3*600 + 0.7*(-100) = 110.
  assert.equal(flipped.after.best.optionId, 'vo-2');
  assert.equal(flipped.flips, true);
  // Sticking with "commit" costs 110 − (−120) = 230 relative to switching.
  assert.equal(flipped.swing, 230);

  // A state set that does not pair the premise is not flipped.
  const three = {
    ...payload,
    states: [
      { id: 'vs-1', label: 'a', probability: 40, premiseId: 'prem-1' },
      { id: 'vs-2', label: 'b', probability: 30, premiseId: 'prem-1' },
      { id: 'vs-3', label: 'c', probability: 30, premiseId: 'prem-1' },
    ],
  };
  assert.equal(flipPremise(three, 'prem-1'), null);
});

/* ----------------------------------------------------------------- actions */

test('the actions refuse what the module refuses', () => {
  const { store, api } = makeStore();
  seed(store);

  assert.equal(api.addVoiDecision({ label: 'ab' }).ok, false);
  const badSum = api.addVoiDecision({
    ...framePayload(),
    states: [{ id: 'vs-1', label: 'Lands', probability: 60 }, { id: 'vs-2', label: 'Slips', probability: 30 }],
  });
  assert.equal(badSum.ok, false);
  assert.match(badSum.error, /sum to 90%|exactly 100%/);

  const oneOption = api.addVoiDecision({ ...framePayload(), options: [{ id: 'vo-1', label: 'Only' }] });
  assert.equal(oneOption.ok, false);

  const id = makeFrame(api, { premiseId: 'prem-1' });

  // Deciding an unpriced frame is refused.
  api.updateVoiDecision(id, { payoffs: framePayload().payoffs.filter((cell) => !(cell.optionId === 'vo-1' && cell.stateId === 'vs-2')) });
  const unpriced = api.decideVoiDecision(id, { chosenOptionId: 'vo-1' });
  assert.equal(unpriced.ok, false);
  assert.match(unpriced.error, /cannot be valued yet/);

  // Choosing against the arithmetic needs a written reason.
  api.updateVoiDecision(id, { payoffs: framePayload().payoffs });
  const against = api.decideVoiDecision(id, { chosenOptionId: 'vo-3', note: '' });
  assert.equal(against.ok, false);
  assert.match(against.error, /choosing against the expected-value option/);

  // A coin-flip test is refused at entry.
  const coinFlip = api.addInformationRequest(id, {
    label: 'Ask someone', targetStateIds: ['vs-1'], sensitivityPct: 60, specificityPct: 40, cost: 100,
  });
  assert.equal(coinFlip.ok, false);
  assert.match(coinFlip.error, /coin flip|50 to 100/);

  // A test with no target cannot be valued.
  const noTarget = api.addInformationRequest(id, {
    label: 'Ask someone', targetStateIds: [], sensitivityPct: 80, specificityPct: 90, cost: 100,
  });
  assert.equal(noTarget.ok, false);

  // A due date in the past is refused.
  const pastDue = api.addInformationRequest(id, {
    label: 'Ask someone', targetStateIds: ['vs-1'], sensitivityPct: 80, specificityPct: 90, cost: 100, dueOn: '2020-01-01',
  });
  assert.equal(pastDue.ok, false);

  // A settled decision cannot be edited or re-decided.
  api.decideVoiDecision(id, { chosenOptionId: 'vo-1' });
  assert.equal(api.updateVoiDecision(id, { label: 'Renamed' }).ok, false);
  assert.equal(api.decideVoiDecision(id, { chosenOptionId: 'vo-2' }).ok, false);
});

/* ---------------------------------------------------------- the cross-module */

test('one declaration opens exactly one buy decision, one task and typed provenance', () => {
  const { store, api } = makeStore();
  seed(store);
  api.updateSettings({ voiBuyInfoThreshold: 100, voiBuyInfoSharePct: 0, voiConcentrationThreshold: 3 });
  const id = makeFrame(api, { premiseId: 'prem-1' });

  const buyDecisions = store.state.decisions.filter((row) => (row.question || '').includes('[VOI-BUY:'));
  assert.equal(buyDecisions.length, 1, 'exactly one buy-information decision');
  assert.match(buyDecisions[0].rationale, /EVPI/);
  assert.match(buyDecisions[0].question, /hedge/i);

  const scopeTasks = store.state.delegations.filter((row) => (row.support || '').includes('[VOI-SCOPE:'));
  assert.equal(scopeTasks.length, 1, 'one owned task to scope the cheapest informative test');
  assert.equal(scopeTasks[0].personId, 'p-lead');

  const links = store.state.links || [];
  assert.ok(links.some((link) => link.sourceType === 'voi' && link.targetType === 'premise'
    && link.relation === 'rests-on' && link.targetId === 'prem-1'));
  assert.ok(links.some((link) => link.sourceType === 'voi' && link.targetType === 'decision'
    && link.relation === 'informs' && link.targetId === buyDecisions[0].id));

  // Re-running the scan cannot duplicate any of it.
  const before = {
    decisions: store.state.decisions.length,
    delegations: store.state.delegations.length,
    links: (store.state.links || []).length,
  };
  const scanned = api.scanVoi();
  assert.equal(scanned.changed, false);
  assert.equal(store.state.decisions.length, before.decisions);
  assert.equal(store.state.delegations.length, before.delegations);
  assert.equal((store.state.links || []).length, before.links);
});

test('a settled test writes one dated likelihood ratio into the premise ledger', () => {
  const { store, api } = makeStore();
  seed(store);
  api.updateSettings({ voiBuyInfoThreshold: 100, voiBuyInfoSharePct: 0 });
  const id = makeFrame(api, { premiseId: 'prem-1' });

  const study = api.addInformationRequest(id, {
    label: 'Load test the staging warehouse',
    premiseEquivalent: true,
    targetStateIds: ['vs-1'],
    sensitivityPct: 80,
    specificityPct: 90,
    cost: 50,
    dueOn: '2026-11-14',
  });
  assert.equal(study.ok, true, study.error);
  assert.ok(study.reading.evsi > 0);

  const settled = api.settleInformationRequest(study.id, { signal: 'positive', note: 'Date confirmed in writing.' });
  assert.equal(settled.ok, true, settled.error);
  assert.equal(settled.lr, 8, 'LR+ = se / (1 − sp) = 0.8 / 0.1');

  const premise = store.state.premises.find((row) => row.id === 'prem-1');
  const written = premise.observations.filter((row) => String(row.key || '').startsWith('inquiry:'));
  assert.equal(written.length, 1, 'exactly one observation, keyed to the investigation');
  assert.equal(written[0].direction, 'for');
  assert.equal(written[0].likelihoodRatio, 8);
  assert.equal(written[0].sourceType, 'voistudy');
  assert.equal(written[0].sourceId, study.id);

  assert.ok((store.state.links || []).some((link) => link.sourceType === 'voistudy'
    && link.targetType === 'premise' && link.relation === 'tests'));
  assert.ok((store.state.links || []).some((link) => link.sourceType === 'voistudy'
    && link.targetType === 'voi' && link.relation === 'buys-information'));

  // A second settle is refused, and a scan cannot duplicate the observation.
  assert.equal(api.settleInformationRequest(study.id, { signal: 'negative' }).ok, false);
  api.scanVoi();
  const after = store.state.premises.find((row) => row.id === 'prem-1');
  assert.equal(after.observations.filter((row) => String(row.key || '').startsWith('inquiry:')).length, 1);

  // The posterior moved: the evidence is the ledger's, not this module's. The
  // stored `posteriorPct` is the premise ledger's cache, so the assertion reads
  // the derived belief the way every premise screen does.
  const belief = evaluatePremiseCore(after, { now: NOW, settings: store.state.settings });
  assert.ok(belief.posteriorPct > 70, 'a positive signal raises the belief it addresses');
  assert.equal(belief.supportCount, 1);
});

test('one premise anchoring several frames opens exactly one de-risking decision', () => {
  const { store, api } = makeStore();
  seed(store);
  api.updateSettings({ voiBuyInfoThreshold: 1_000_000, voiBuyInfoSharePct: 100, voiConcentrationThreshold: 2 });
  makeFrame(api, { premiseId: 'prem-1', label: 'Commit the cutover' });
  assert.equal(store.state.decisions.filter((row) => (row.question || '').includes('[VOI-CONCENTRATION:')).length, 0);

  makeFrame(api, { premiseId: 'prem-1', label: 'Extend the vendor contract' });
  const concentration = store.state.decisions.filter((row) => (row.question || '').includes('[VOI-CONCENTRATION:'));
  assert.equal(concentration.length, 1, 'one decision about the shared assumption, not one per frame');
  assert.match(concentration[0].question, /one bet/);
  const derisk = store.state.delegations.filter((row) => (row.support || '').includes('[VOI-DERISK:'));
  assert.equal(derisk.length, 1, 'one owned task on the premise owner');
  assert.equal(derisk[0].personId, 'p-lead');

  // The portfolio reading agrees.
  const portfolio = buildVoiPortfolio(store.state, NOW);
  assert.equal(portfolio.anchors.length, 1);
  assert.equal(portfolio.anchors[0].frames.length, 2);
  assert.equal(portfolio.anchors[0].flips, 2);
  assert.equal(portfolio.concentrationBreach, true);
});

test('deciding freezes the number and settling records the regret actually incurred', () => {
  const { store, api } = makeStore();
  seed(store);
  api.updateSettings({ voiBuyInfoThreshold: 1_000_000, voiBuyInfoSharePct: 100 });
  const id = makeFrame(api, { premiseId: 'prem-1' });

  const decided = api.decideVoiDecision(id, { chosenOptionId: 'vo-1' });
  assert.equal(decided.ok, true, decided.error);
  assert.equal(decided.snapshot.evpi, 180);
  assert.equal(decided.snapshot.chosenOptionId, 'vo-1');
  assert.equal(decided.snapshot.bestOptionId, 'vo-1');
  assert.equal(decided.snapshot.probabilities.length, 2);

  const review = store.state.decisions.filter((row) => (row.question || '').includes('[VOI-REVIEW:'));
  assert.equal(review.length, 1, 'one dated outcome review restating the frozen number');
  assert.match(review[0].question, /180/);

  // Settling against a state where the choice was worse records the regret.
  const settled = api.settleVoiDecision(id, { realizedStateId: 'vs-2', note: 'It slipped.' });
  assert.equal(settled.ok, true, settled.error);
  assert.equal(settled.regret, 600, 'commit paid −600 where waiting paid 0');

  const frame = store.state.voiDecisions.find((row) => row.id === id);
  const score = scoreFrame(frame);
  assert.equal(score.count, 1);
  // Brier for a 70/30 forecast with the 30% state observed.
  assert.equal(score.rows[0].brier, Math.round(((0.7 - 0) ** 2 + (0.3 - 1) ** 2) * 10000) / 10000);
  assert.equal(score.realizedRegret, 600);
  assert.equal(api.settleVoiDecision(id, { realizedStateId: 'vs-1' }).ok, false, 'a frame settles once');
});

/* --------------------------------------------------------- export & signals */

test('CSV scope #48 carries opaque codes and ratios, never a label or an amount', () => {
  const { store, api } = makeStore();
  seed(store);
  makeFrame(api, { premiseId: 'prem-1', label: 'SECRET MERGER FRAME' });
  const study = api.addInformationRequest(store.state.voiDecisions[0].id, {
    label: 'SECRET STUDY', targetStateIds: ['vs-1'], sensitivityPct: 80, specificityPct: 90, cost: 12345,
  });
  assert.equal(study.ok, true, study.error);

  const scope = CSV_EXPORTS.find((row) => row.key === 'voi');
  assert.ok(scope, 'scope #48 is registered');
  const csv = exportWorkspaceCsv(store.state, 'voi', { now: NOW });
  const text = typeof csv === 'string' ? csv : (csv.content || csv.csv || '');
  assert.ok(text.length > 0);
  assert.equal(text.includes('SECRET'), false, 'no label leaves through this scope');
  assert.equal(text.includes('12345'), false, 'no absolute amount leaves through this scope');
  assert.match(text, /D01/);
  assert.equal(CSV_EXPORTS.length, 54);
});

test('signals, the attention count, the brief and the Insights bucket', () => {
  const { store, api } = makeStore();
  seed(store);
  api.updateSettings({ voiBuyInfoThreshold: 100, voiBuyInfoSharePct: 0, voiConcentrationThreshold: 2 });
  makeFrame(api, { premiseId: 'prem-1', label: 'Commit the cutover' });
  makeFrame(api, { premiseId: 'prem-1', label: 'Extend the vendor contract' });

  const signals = voiSignals(store.state, NOW);
  assert.ok(signals.length > 0);
  assert.ok(signals.every((signal) => signal.domain === 'Information value'));
  assert.ok(signals.some((signal) => signal.ruleId === 'VOI-04'), 'the concentration finding is raised');
  assert.ok(voiAttentionCount(store.state, NOW) >= 1);

  const insights = buildInsights(store.state, NOW);
  assert.ok(insights.byDomain.some((row) => row.domain === 'Information value'), 'the bucket is in DOMAIN_ORDER');

  const brief = voiBrief(store.state, NOW);
  assert.match(brief, /INFORMATION VALUE BRIEF/);
  assert.match(brief, /EVPI/);
  assert.match(brief, /does not claim|not a forecast|bound/);
  assert.match(brief, /HHI/);
});

test('the typed registry resolves a frame and an investigation to real routes', () => {
  const { store, api } = makeStore();
  seed(store);
  const id = makeFrame(api, { premiseId: 'prem-1' });
  const study = api.addInformationRequest(id, {
    label: 'Load test', targetStateIds: ['vs-1'], sensitivityPct: 80, specificityPct: 90, cost: 0,
  });
  assert.ok(LINK_ENTITY_TYPES.includes('voi'));
  assert.ok(LINK_ENTITY_TYPES.includes('voistudy'));
  assert.ok(LINK_RELATIONS.includes('rests-on'));
  assert.ok(LINK_RELATIONS.includes('buys-information'));

  const frame = resolveLinkedEntity(store.state, 'voi', id);
  assert.equal(frame.type, 'voi');
  assert.match(frame.route, /#\/voi\?frame=/);
  const resolvedStudy = resolveLinkedEntity(store.state, 'voistudy', study.id);
  assert.equal(resolvedStudy.type, 'voistudy');
  assert.match(resolvedStudy.route, new RegExp(`frame=${encodeURIComponent(id)}`));
});

test('the rule is registered on the shared spine with a declared contract', () => {
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(valueOfInformationRule));
  assert.ok(PROPAGATION_CONTRACTS.some((contract) => contract.rule === valueOfInformationRule));
  for (const id of Object.values(VOI_RULE_IDS)) {
    assert.ok(AUTOMATION_RULES.some((rule) => rule.id === id), `${id} is documented in the control room`);
  }
  assert.equal(AUTOMATION_RULES.length, 144, '+ ATT-05');
});

test('conventionsFromSettings clamps a typo instead of switching a measurement off', () => {
  const conventions = conventionsFromSettings({
    settings: { voiBuyInfoThreshold: -50, voiBuyInfoSharePct: 400, voiConcentrationThreshold: 0, voiNearTiePct: 900, voiReviewHorizonDays: 2 },
  });
  assert.equal(conventions.buyInfoThreshold, 0);
  assert.equal(conventions.buyInfoSharePct, 100);
  assert.equal(conventions.concentrationThreshold, 2);
  assert.equal(conventions.nearTiePct, 50);
  assert.equal(conventions.reviewHorizonDays, 30);
  assert.equal(conventionsFromSettings({}).buyInfoThreshold, VOI_CONVENTIONS.buyInfoThreshold);
});

/* ---------------------------------------------------------------------- DOM */

function renderInDom(state, hash = '#/voi') {
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

test('every tab renders with one h1, labelled tables and a stated set of limits', () => {
  const { store, api } = makeStore();
  seed(store);
  const id = makeFrame(api, { premiseId: 'prem-1' });
  api.addInformationRequest(id, { label: 'Load test', targetStateIds: ['vs-1'], sensitivityPct: 80, specificityPct: 90, cost: 50 });

  for (const panel of ['frames', 'inquiries', 'portfolio', 'calibration', 'method']) {
    const { window, node } = renderInDom(store.state, `#/voi?panel=${panel}&frame=${id}`);
    const doc = window.document;
    assert.equal(node.querySelectorAll('h1').length, 1, `${panel}: exactly one h1`);
    assert.equal(doc.querySelectorAll('table:not([aria-label])').length, 0, `${panel}: every table is named`);
    assert.equal(doc.querySelectorAll('th:empty').length, 0, `${panel}: no empty header cell`);
    if (panel === 'calibration') assert.match(doc.body.textContent, /Calibration stress on open decisions/);
    const tabs = doc.querySelectorAll('[role="tab"]');
    assert.equal(tabs.length, 6, `${panel}: six tabs (frames, inquiries, sequence, portfolio, calibration, method)`);
    assert.equal([...tabs].filter((tab) => tab.getAttribute('aria-selected') === 'true').length, 1);
    window.close();
  }

  const { window } = renderInDom(store.state, '#/voi?panel=method');
  const text = window.document.body.textContent;
  assert.match(text, /EVPI/);
  assert.match(text, /Blackwell/);
  assert.match(text, /Not claimed/);
  assert.match(text, /never rescale|does not|will not/);
  window.close();
});

test('an empty workspace renders a real dead end with a way forward', () => {
  const state = createEmptyState(NOW.toISOString());
  const { window, node } = renderInDom(state, '#/voi');
  assert.ok(node);
  assert.match(window.document.body.textContent, /Nothing is priced yet/);
  window.close();
});

/* --------------------------------------------------------------- demo state */

test('the demo carries priced frames, a live investigation and a settled one', async () => {
  const { buildDemoState } = await import('../../app/core/demo.js');
  const state = buildDemoState(NOW);
  assert.ok((state.voiDecisions || []).length >= 2, 'two frames, not a dead end');
  const portfolio = buildVoiPortfolio(state, NOW);
  assert.ok(portfolio.counts.priced >= 1, 'at least one frame can be valued');
  assert.ok(portfolio.counts.studies >= 2);
  const settled = (state.voiStudies || []).find((study) => study.status === 'settled');
  assert.ok(settled, 'one investigation has reported');
  const premise = (state.premises || []).find((row) => (row.observations || []).some((o) => String(o.key || '').startsWith('inquiry:')));
  assert.ok(premise, 'the demo shows the vertical join: a settled test in the belief ledger');
  // The demo never contains a state the app could not produce.
  assert.ok(portfolio.anchors.length >= 1, 'a shared premise is visible on the portfolio tab');
});

test('negative evidence, explicit equivalence and provenance survive normalization', () => {
  const { store, api } = makeStore(); seed(store);
  api.updateSettings({ voiBuyInfoThreshold: 1000000, voiBuyInfoSharePct: 100, voiConcentrationThreshold: 2 });
  const frame = makeFrame(api, { premiseId: 'prem-1' });
  makeFrame(api, { premiseId: 'prem-1', label: 'Second decision' });
  const generated = store.state.links.filter((link) => link.ruleId === VOI_RULE_IDS.CONCENTRATION);
  assert.equal(generated.length, 2);
  assert.ok(generated.every((link) => link.sourceType === 'premise' && resolveLinkedEntity(store.state, link.sourceType, link.sourceId)));
  store.state.links = store.state.links.filter((link) => link.ruleId !== VOI_RULE_IDS.CONCENTRATION);
  api.scanVoi();
  assert.equal(store.state.links.filter((link) => link.ruleId === VOI_RULE_IDS.CONCENTRATION).length, 2, 'scan repairs old missing links');
  api.scanVoi();
  assert.equal(store.state.links.filter((link) => link.ruleId === VOI_RULE_IDS.CONCENTRATION).length, 2, 'repair is idempotent');
  const before = normalizeState(store.state, NOW).state || normalizeState(store.state, NOW);
  assert.equal(before.links.filter((link) => link.ruleId === VOI_RULE_IDS.CONCENTRATION).length, 2);
  const study = api.addInformationRequest(frame, { label: 'A negative test', targetStateIds: ['vs-1'], premiseEquivalent: true, sensitivityPct: 80, specificityPct: 90, cost: 0 });
  assert.equal(study.ok, true, study.error);
  assert.equal(api.settleInformationRequest(study.id, { signal: 'negative' }).ok, true);
  const premise = store.state.premises.find((row) => row.id === 'prem-1');
  const obs = premise.observations.find((row) => row.sourceId === study.id);
  assert.ok(obs.likelihoodRatio > 4.4 && obs.likelihoodRatio < 4.6);
  const belief = evaluatePremiseCore(premise, { now: NOW, settings: store.state.settings });
  assert.ok(belief.posteriorPct > 33 && belief.posteriorPct < 35, `expected ~34%, got ${belief.posteriorPct}`);
  const restored = normalizeState(store.state, NOW).state || normalizeState(store.state, NOW);
  assert.equal(restored.voiStudies.find((row) => row.id === study.id).equivalentPremiseId, 'prem-1');
  assert.equal(restored.premises[0].observations.find((row) => row.sourceId === study.id).likelihoodRatio > 4.4, true);
});

test('unconfirmed and composite tests do not silently update assumptions', () => {
  const { store, api } = makeStore(); seed(store);
  const frame = makeFrame(api, { premiseId: 'prem-1' });
  const data = { label: 'Unconfirmed test', targetStateIds: ['vs-1'], sensitivityPct: 80, specificityPct: 90, cost: 0 };
  const study = api.addInformationRequest(frame, data);
  assert.equal(api.settleInformationRequest(study.id, { signal: 'positive' }).ok, true);
  api.scanVoi();
  assert.equal(store.state.premises[0].observations.length, 0);
  const rejected = api.addInformationRequest(frame, { ...data, targetStateIds: ['vs-1', 'vs-2'], premiseEquivalent: true });
  assert.equal(rejected.ok, false);
});

test('portfolio stress keeps currencies separate across signals, governance and brief', () => {
  const { store, api } = makeStore(); seed(store);
  api.updateSettings({ voiBuyInfoThreshold: 1000000, voiBuyInfoSharePct: 100, voiConcentrationThreshold: 2 });
  makeFrame(api, { premiseId: 'prem-1' });
  const payload = framePayload({ premiseId: 'prem-1', label: 'European decision' }); payload.currency = 'EUR';
  assert.equal(api.addVoiDecision(payload).ok, true);
  const anchor = buildVoiPortfolio(store.state, NOW).anchors[0];
  assert.deepEqual(Object.keys(anchor.swings).sort(), ['EUR', 'USD']);
  const question = store.state.decisions.find((row) => (row.question || '').includes('[VOI-CONCENTRATION:')).question;
  assert.match(question, /EUR/); assert.match(question, /USD/);
  assert.match(voiBrief(store.state, NOW), /EUR/);
});
