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
import { freezeMeasurementPrediction } from './domain/measurement.js';
import { analyzeIntakeText } from './domain/intake.js';
import { commsRule } from './domain/comms.js';
import { earlyWarningRule, scanWatch } from './domain/earlyWarning.js';
import { allocationRule } from './domain/allocation.js';
import { loadRule } from './domain/load.js';
import { premiseRule } from './domain/premises.js';
import { dynamicsRule, buildDynamicsReport, evaluatePolicy } from './domain/dynamics.js';
import { scoreCheckpoint } from './domain/checkpointScoring.js';
import { fairnessReading } from './domain/comp.js';
import { buildFairnessSnapshot } from './domain/compSchema.js';
import { transitionReading } from './domain/transition.js';
import { buildTransitionSnapshot } from './domain/transitionSchema.js';


/**
 * Deterministic historical records for the demo.
 *
 * A fixed 32-bit LCG, seeded from a constant, keeps the demo byte-identical on
 * every load while still producing the irregular spacing real calendars have.
 * Random-looking history generated from a fixed seed is honest demo data; a
 * random one would make screenshots and tests disagree with each other.
 *
 * The history is generated *around* the three pre-registered studies rather
 * than independently of them, because a demo in which the interventidates
 * happened to coincide with nothing would be a demo of a tool that never finds
 * anything. The two effects written in here are the fictional leader's real
 * ones: feedback volume steps up after the weekly ritual, and feedback latency
 * gets *worse* at the same time, because batching the conversation to Friday
 * means the observation is older by the time it is written down. One hypothesis
 * is supported and one is contradicted by the same intervention — which is
 * precisely the situation a single before/after dashboard cannot represent.
 */
function seedHistoricalRecords(state, now) {
  const today = dayKey(now);
  const at = (daysAgo) => addDays(today, -daysAgo);
  const ritualStarted = at(70);
  const podsRestructured = at(14);
  let sequence = 9000;
  let seed = 20261027;
  const nextId = (prefix) => `${prefix}-demo-h${++sequence}`;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  const people = (state.people || []);
  if (!people.length) return;
  /**
   * Who existed on a given day, and who is deliberately left out.
   *
   * Generating history for someone before their start date would put words in
   * the app's mouth about a person who had not joined yet, so eligibility is
   * checked per record date. Priya is excluded from generated feedback on
   * purpose: the demo's headline conversation finding is that a long-tenured
   * report has never had a single piece of feedback recorded, and seeding a
   * warm history for her would quietly delete the problem the demo exists to
   * show.
   */
  const eligibleOn = (date) => people
    .filter((person) => person.id !== 'person-demo-1')
    .filter((person) => !person.startDate || person.startDate <= date)
    .map((person) => person.id);

  const feedback = [];
  const recognition = [];
  const situations = [
    'In Tuesday’s prioritisation review',
    'During the schema walkthrough on Thursday',
    'In the incident retro on Friday',
    'On the customer call about activation',
    'In the weekly metrics review',
    'While reviewing the migration plan together',
    'After the support handover',
    'In the planning session for next quarter',
  ];
  const praises = [
    'you flagged the reconciliation risk before it became an outage',
    'you rewrote the proposal overnight so the decision could actually be taken',
    'you pushed back on the deadline with evidence instead of quietly absorbing it',
    'you made the handover legible to people outside the team',
    'you cut the scope of the release to protect the migration window',
    'you named the disagreement out loud in the review instead of routing around it',
  ];
  const critiques = [
    'the design doc landed two hours before the meeting with no summary at the top',
    'the escalation ran through three people before anyone owned it',
    'the estimate was given as a single number with no range',
    'the status update described activity rather than what had actually changed',
  ];

  // Twenty-two complete weeks of ordinary work, ending in the week before this one.
  for (let weeksAgo = 22; weeksAgo >= 1; weeksAgo -= 1) {
    const monday = addDays(today, -weeksAgo * 7);
    const afterRitual = addDays(monday, 4) >= ritualStarted;
    // Before the ritual: two or three notes a week. After it: four to six,
    // because the Friday conversation produces several at once.
    const notesThisWeek = afterRitual ? 4 + Math.floor(rnd() * 3) : 2 + Math.floor(rnd() * 2);
    for (let note = 0; note < notesThisWeek; note += 1) {
      const date = addDays(monday, Math.floor(rnd() * 5));
      if (date >= today) continue;
      const constructive = rnd() < 0.28;
      const pool = eligibleOn(date);
      if (!pool.length) continue;
      const personId = pool[Math.floor(rnd() * pool.length)];
      // After the ritual the note is written days after the event, because it
      // waited for the Friday slot. That is the mechanism behind the latency
      // regression, and it is generated rather than asserted.
      const lag = afterRitual ? 3 + Math.floor(rnd() * 4) : 1 + Math.floor(rnd() * 3);
      feedback.push({
        id: nextId('fb'),
        personId,
        direction: 'given',
        kind: constructive ? 'constructive' : 'praise',
        situation: situations[Math.floor(rnd() * situations.length)],
        behavior: constructive
          ? critiques[Math.floor(rnd() * critiques.length)]
          : praises[Math.floor(rnd() * praises.length)],
        impact: constructive
          ? 'It cost the room a day of rework and made the decision harder to take.'
          : 'It shortened the loop and gave the rest of the team something concrete to copy.',
        tags: constructive ? ['clarity'] : ['recognition'],
        date,
        observedOn: addDays(date, -lag),
        followUpOn: null,
        followUpDone: false,
        followUpCompletedOn: null,
        createdAt: new Date(`${date}T17:30:00.000Z`).toISOString(),
      });
    }

    // Recognition roughly every other week, because that is what a real calendar
    // looks like when nobody has been told to fill a quota.
    if (weeksAgo % 2 === 0) {
      const date = addDays(monday, 2 + Math.floor(rnd() * 3));
      const recPool = eligibleOn(date);
      if (date < today && recPool.length) {
        recognition.push({
          id: nextId('rec'),
          personId: recPool[Math.floor(rnd() * recPool.length)],
          what: praises[Math.floor(rnd() * praises.length)].replace(/^you /, 'Owned the moment where they '),
          values: ['Ownership', 'Rigour'],
          visibility: 'public',
          date,
          createdAt: new Date(`${date}T18:00:00.000Z`).toISOString(),
        });
      }
    }
  }

  // The existing demo 1:1 log reaches back eight weeks, which is not enough
  // baseline to evaluate anything. These older, already-held sessions give the
  // cadence and mood vitals a real past without touching the recent records
  // that the Today view and the prep sheet are built around.
  const oneOnOnes = [];
  for (let weeksAgo = 22; weeksAgo >= 9; weeksAgo -= 1) {
    const monday = addDays(today, -weeksAgo * 7);
    const sessions = 1 + Math.floor(rnd() * 2);
    for (let i = 0; i < sessions; i += 1) {
      const date = addDays(monday, Math.floor(rnd() * 5));
      if (date >= addDays(today, -56)) continue;
      // Mood drifts down as the single support queue gets heavier, then lifts a
      // little once the pods are split — the effect the running study is about.
      const base = weeksAgo > 6 ? 3.6 : 3.1;
      const afterSplit = date >= podsRestructured ? 0.35 : 0;
      const mood = Math.max(1, Math.min(5, Math.round(base + afterSplit + (rnd() - 0.5) * 1.1)));
      const ooPool = eligibleOn(date);
      if (!ooPool.length) continue;
      oneOnOnes.push({
        id: nextId('oo'),
        personId: ooPool[Math.floor(rnd() * ooPool.length)],
        date,
        status: 'held',
        mood,
        agenda: [],
        notes: mood >= 4
          ? 'Steady: the work is clear and the blockers were resolvable in the room.'
          : 'Tense: two competing priorities and no owner for the handover.',
        actions: [],
        createdAt: new Date(`${date}T09:00:00.000Z`).toISOString(),
      });
    }
  }

  state.feedback = [...(state.feedback || []), ...feedback];
  state.recognition = [...(state.recognition || []), ...recognition];
  state.oneOnOnes = [...(state.oneOnOnes || []), ...oneOnOnes];
}

/**
 * Three studies in three different states, all of them pre-registered.
 *
 * Two windows have closed and are waiting to be scored — which is the honest
 * default state of any real ledger — and one is still running. Every study is
 * declared before its intervention date, so the demo never shows a
 * retrospective study dressed up as evidence.
 */
/**
 * Schema v32 — demo outbox. Drafts are produced by the real RULE-COMMS-01 path
 * (not hand-written), so the demo can never show a message the engine would not
 * write. Links are produced the same way and merged into the demo graph.
 */
/**
 * Schema v33 — demo Allocation Governor. Runs the real RULE-ALLOC scan over
 * the demo portfolio, so the rebalancing decision and its typed links in the
 * demo are exactly what the engine would produce live (exploratory share of
 * recently funded effort is 0% against a 10% floor, with one candidate
 * queued). No hand-written decision text.
 */
function seedAllocation(state, now) {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-demo-alloc-${++seq}`;
  allocationRule(state, { event: { type: 'allocation.scan', entityId: '' }, now, idFactory });
}

/**
 * Schema v34 — demo Cognitive Load Governor. Runs the real RULE-LOAD scan
 * over the demo roster, so the load-shedding decision, WIP and learning
 * prompts and typed links in the demo are exactly what the engine would
 * produce live. No hand-written decision or talking-point text.
 */
function seedLoad(state, now) {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-demo-load-${++seq}`;
  loadRule(state, { event: { type: 'load.scan', entityId: '' }, now, idFactory });
}


/**
 * Schema v37 — demo Operating System Dynamics Lab.
 *
 * Two real records, not hand-written copy: one adopted experiment (which runs
 * RULE-DYN-03 and therefore produces a real checkpoint delegation carrying the
 * frozen prediction) and one draft experiment. The scan then runs the real
 * structural report over the demo roster, so any decision or talking point that
 * appears in the demo is exactly what the engine would produce live.
 */
function seedDynamics(state, now) {
  const adoptedOn = dayKey(addDays(now, -11));
  state.dynamicsExperiments = [
    {
      id: 'dyn-demo-1',
      name: 'Cap work in progress before hiring',
      hypothesis: 'If intake is throttled to protect the current team, cycle time falls and saturation stops climbing within six weeks — without adding senior load.',
      levers: { hirePerWeek: 0, wipCapPct: 20, scopeCutPct: 0, reworkInvestment: 0, delegationShare: 0, learningShare: 0 },
      horizonWeeks: 26,
      ownerId: state.people[0]?.id || null,
      checkpointOn: dayKey(addDays(now, 14)),
      status: 'adopted',
      adoptedOn,
      predicted: {
        endSaturationPct: 118,
        endWipDays: 62,
        endCapacityPerWeek: 15.1,
        endDependencyPct: 44,
        horizonWeeks: 26,
        frozenAt: new Date(`${adoptedOn}T09:00:00.000Z`).toISOString(),
        engineVersion: 'os-dynamics-2026.10-v1',
      },
      notes: 'Chosen after the June overload: the queue was draining and refilling at the same rate.',
      createdOn: adoptedOn,
      createdAt: new Date(`${adoptedOn}T09:00:00.000Z`).toISOString(),
      updatedAt: new Date(`${adoptedOn}T09:00:00.000Z`).toISOString(),
    },
    {
      id: 'dyn-demo-2',
      name: 'Protect 15% for learning',
      hypothesis: 'If a sixth of capacity is protected for mentoring and design review, the delivery ceiling rises — but not inside a quarter.',
      levers: { hirePerWeek: 0, wipCapPct: 10, scopeCutPct: 0, reworkInvestment: 0.2, delegationShare: 0.3, learningShare: 0.15 },
      horizonWeeks: 40,
      ownerId: state.people[2]?.id || null,
      checkpointOn: null,
      status: 'draft',
      adoptedOn: null,
      predicted: null,
      notes: 'Not adopted: the first pass costs throughput for two quarters before the ceiling moves.',
      createdOn: dayKey(addDays(now, -4)),
      createdAt: new Date(`${dayKey(addDays(now, -4))}T09:00:00.000Z`).toISOString(),
      updatedAt: new Date(`${dayKey(addDays(now, -4))}T09:00:00.000Z`).toISOString(),
    },
  ];
}

/**
 * The scan runs *after* the demo state has been through the real normalizer,
 * because the structural report reads the load governor's bottleneck, which is
 * derived from normalized roster fields. Running it on the raw fixture would
 * quietly produce no talking point and make the demo look less capable than the
 * product is.
 */
function seedDynamicsScan(state, now) {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-demo-dyn-${++seq}`;
  dynamicsRule(state, { event: { type: 'dynamics.scan', entityId: '' }, now, idFactory });
  dynamicsRule(state, { event: { type: 'dynamics.experiment.adopted', entityId: 'dyn-demo-1' }, now, idFactory });
}

/**
 * Schema v38 — demo Structural Capital Allocation.
 *
 * One draft portfolio and one *scored* out-of-sample checkpoint. The checkpoint
 * is generated the same way a live one is: the prediction and the do-nothing
 * baseline are frozen from the derived model, the observed stocks are a dated
 * fixture, and `scoreCheckpoint` computes the skill — nothing is hand-written
 * into the score field. The checkpoint is deliberately a single row, so the
 * pooled-skill suppression (counts only below two) is visible in the demo
 * instead of being glossed over.
 */
function seedCapital(state, now) {
  const today = dayKey(now);
  const report = buildDynamicsReport(state, now);
  const experiment = (state.dynamicsExperiments || []).find((row) => row && row.id === 'dyn-demo-1');
  if (!report.adequate || !experiment) return;
  const evaluation = evaluatePolicy(report.model, experiment.levers, { weeks: experiment.horizonWeeks });
  const frozen = (summary) => ({
    endSaturationPct: summary.endSaturationPct,
    endWipDays: summary.endWipDays,
    endCapacityPerWeek: summary.endCapacityPerWeek,
    endDependencyPct: summary.endDependencyPct,
  });
  experiment.predicted = {
    ...frozen(evaluation.scenario.summary),
    horizonWeeks: evaluation.scenario.horizonWeeks,
    frozenAt: new Date(`${experiment.adoptedOn}T09:00:00.000Z`).toISOString(),
    engineVersion: report.engineVersion,
    baseline: frozen(evaluation.baseline.summary),
  };

  const recordedOn = addDays(today, -3);
  // The fiction: the cap was applied, pressure eased most of the way to the
  // prediction but WIP drained faster than modelled. Recorded as observations,
  // not as a score.
  const observed = {
    saturationPct: Math.round(evaluation.scenario.summary.endSaturationPct + 4),
    wipDays: Math.round(evaluation.scenario.summary.endWipDays * 0.82),
    capacityPerWeek: Math.round(evaluation.scenario.summary.endCapacityPerWeek * 0.97 * 100) / 100,
  };
  state.dynamicsCheckpoints = [{
    id: 'chk-demo-1',
    subjectType: 'experiment',
    subjectId: experiment.id,
    recordedOn,
    observed,
    scoring: scoreCheckpoint(experiment.predicted, observed),
    note: 'Recorded in the weekly review: the intake cap held, two items were closed early, and one person was out for a week.',
    createdOn: recordedOn,
    createdAt: new Date(`${recordedOn}T16:30:00.000Z`).toISOString(),
  }];

  state.capitalPolicies = [{
    id: 'cap-demo-1',
    name: 'Protect flow before adding headcount',
    hypothesis: 'If intake is capped and a fifth of repair capacity moves to prevention, pressure falls below 100% within a quarter without eroding throughput by more than 5%.',
    levers: {
      hirePerWeek: 0, wipCapPct: 15, scopeCutPct: 0, reworkInvestment: 0.2, delegationShare: 0.3, learningShare: 0.1,
    },
    budgetUnits: 8,
    weights: { saturation: 0.35, throughput: 0.25, capacity: 0.2, wip: 0.2 },
    horizonWeeks: 26,
    ownerId: state.people[0]?.id || null,
    checkpointOn: addDays(today, 21),
    status: 'draft',
    adoptedOn: null,
    predicted: null,
    notes: 'Drafted after the June overload. Not adopted yet: the model has not been graded out of sample twice, so the comparison is directional at best.',
    createdOn: addDays(today, -4),
    createdAt: new Date(`${addDays(today, -4)}T11:00:00.000Z`).toISOString(),
    updatedAt: new Date(`${addDays(today, -4)}T11:00:00.000Z`).toISOString(),
  }];
}

/**
 * Schema v35 — demo Assumption Ledger.
 *
 * Two pre-registered premises are attached to real demo dependencies and a
 * real decision. The real RULE-PREM scan produces the typed links, dated
 * evidence and posterior beliefs — no hand-written "demo evidence". One
 * premise lands in the watch band and one stays supported, so the terminal
 * demonstrates both sensing and honest non-alarm without opening a DACI
 * re-decision that would perturb the rest of the demo workspace.
 */
function seedPremises(state, now, { decisionId, ownerA, ownerB, dependencyA, dependencyB }) {
  const today = dayKey(now);
  const createdAt = (daysAgo) => new Date(new Date(`${addDays(today, -daysAgo)}T09:00:00.000Z`).getTime()).toISOString();
  const reviewBy = addDays(today, 21);
  let seq = 0;
  const nextId = (prefix) => `${prefix}-demo-prem-${++seq}`;
  state.premises = [
    {
      id: nextId('premise'),
      title: 'Signing-service recovery fits the survival window',
      statement: 'The KMS signing layer can be restored within the 0.5-day survival window before month-end webhook reconciliation is jeopardised.',
      signpost: 'A recorded continuity dependency with TTR greater than TTS, or a failed regional restore drill, is the first dated warning that this premise has broken.',
      decisionId,
      ownerId: ownerA,
      criticality: 'load-bearing',
      priorPct: 80,
      watchPct: 60,
      breachPct: 30,
      halfLifeDays: 90,
      reviewBy,
      lastReviewedOn: null,
      acknowledgedOn: null,
      acknowledgedAt: null,
      humanDisposition: null,
      sourceRefs: [{ sourceType: 'dependency', sourceId: dependencyA }],
      observations: [],
      history: [{ at: createdAt(10), type: 'registered', summary: 'Pre-registered before the continuity review' }],
      status: 'unobserved',
      reviewCycle: 0,
      posteriorPct: 80,
      logBayesFactor: 0,
      autoPropagate: true,
      createdAt: createdAt(10),
      updatedAt: createdAt(10),
    },
    {
      id: nextId('premise'),
      title: 'Month-end reconciliation stays inside its runbook window',
      statement: 'The documented reconciliation runbook can complete close within two days using a verified backup steward, so the metrics cutover will not stall finance close.',
      signpost: 'A dated TTR that exceeds TTS on the runbook, a failed shadow close, or a reviewed decision outcome of bad would be the first recorded invalidation signal.',
      decisionId,
      ownerId: ownerB,
      criticality: 'major',
      priorPct: 70,
      watchPct: 55,
      breachPct: 30,
      halfLifeDays: 90,
      reviewBy,
      lastReviewedOn: null,
      acknowledgedOn: null,
      acknowledgedAt: null,
      humanDisposition: null,
      sourceRefs: [{ sourceType: 'dependency', sourceId: dependencyB }],
      observations: [],
      history: [{ at: createdAt(8), type: 'registered', summary: 'Pre-registered with an owner and signpost' }],
      status: 'unobserved',
      reviewCycle: 0,
      posteriorPct: 70,
      logBayesFactor: 0,
      autoPropagate: true,
      createdAt: createdAt(8),
      updatedAt: createdAt(8),
    },
  ];
  const idFactory = (prefix) => `${prefix}-demo-prem-${++seq}`;
  premiseRule(state, { event: { type: 'premise.scan', entityId: '' }, now, idFactory });
}

function seedCommsDrafts(state, now) {
  let seq = 0;
  const working = {
    cases: state.cases || [],
    people: state.people || [],
    commsDrafts: [],
    links: Array.isArray(state.links) ? state.links : [],
  };
  const idFactory = (prefix) => `${prefix}-demo-${++seq}`;
  for (const c of working.cases) {
    commsRule(working, { event: { type: 'case.updated', entityId: c.id }, now, idFactory });
  }
  state.links = working.links;
  return working.commsDrafts;
}

function seedImpactStudies(state, now) {
  const today = dayKey(now);
  const at = (daysAgo) => addDays(today, -daysAgo);
  const stampFor = (day, hour = 9) => new Date(`${day}T0${hour}:00:00.000Z`).toISOString();

  const studies = [
    {
      title: 'Weekly feedback ritual',
      hypothesis: 'If I give every report one specific piece of feedback each week, the feedback cadence across the team rises by about a third of a note per person per month.',
      vitalId: 'feedback-cadence',
      interventionType: 'feedback',
      interventionLabel: 'Weekly feedback ritual',
      windowStart: at(70),
      baselineWeeks: 8,
      windowWeeks: 4,
      alpha: 0.1,
      expectedEffect: 0.3,
      expectedConfidence: 70,
      declaredOn: at(75),
      notes: 'Started after the review cycle feedback that nobody could remember what they had been told.',
    },
    {
      title: 'Ritual makes feedback more timely',
      hypothesis: 'Writing the week’s feedback in one Friday pass, rather than in the moment, should shorten the gap between observing something and recording it, because the conversation gets protected time.',
      vitalId: 'feedback-latency',
      interventionType: 'feedback',
      interventionLabel: 'Weekly feedback ritual',
      windowStart: at(70),
      baselineWeeks: 8,
      windowWeeks: 4,
      alpha: 0.1,
      expectedEffect: 1,
      expectedConfidence: 60,
      declaredOn: at(75),
      notes: 'Declared alongside the cadence study, deliberately: the same intervention was expected to help one metric and help another. The second one was wrong, and the record says so.',
    },
    {
      title: 'Support pod restructure',
      hypothesis: 'Moving support from one queue to three product-aligned pods raises the mood scores recorded in 1:1s, because people stop carrying every product’s context at once.',
      vitalId: 'oneoneone-mood',
      interventionType: 'change',
      interventionLabel: 'Support pod restructure',
      windowStart: at(14),
      baselineWeeks: 8,
      windowWeeks: 4,
      alpha: 0.1,
      expectedEffect: 0.25,
      expectedConfidence: 65,
      declaredOn: at(16),
      notes: 'Declared while it was still reversible; if the mood series does not move it will be unwound.',
    },
  ];

  return studies.map((study, index) => ({
    id: `impact-demo-${index + 1}`,
    ...study,
    interventionId: null,
    status: 'running',
    lockedOn: null,
    verdict: null,
    evaluation: null,
    outcomeNotes: '',
    autoPropagate: true,
    replicationOfId: null,
    history: [
      {
        at: stampFor(study.declaredOn),
        type: 'declared',
        summary: `Declared before scoring. Grade: confirmatory.`,
      },
    ],
    createdAt: stampFor(study.declaredOn),
    updatedAt: stampFor(study.declaredOn),
  }));
}

/**
 * Schema v50 — implementation plans over the demo's own records.
 *
 * The first plan is a feedback ritual that the records say was genuinely
 * delivered; it is settled, because a settled example is what makes the frozen
 * reading legible. The second is a 1:1 cadence declared with a dose the calendar
 * could not support, deliberately left active: settling it in the app is the
 * demonstration of the whole cross-module path (repair decision, owned task,
 * blameless question).
 */
function seedFidelityPlans(state, now) {
  const today = dayKey(now);
  const at = (daysAgo) => addDays(today, -daysAgo);
  const stampFor = (day, hour = 9) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00.000Z`).toISOString();
  const people = (state.people || []).filter((p) => p && p.status !== 'archived');
  const attest = (verdict, on, note) => ({ verdict, on, byId: people[0]?.id || null, note, at: stampFor(on) });

  return [
    {
      id: 'fidelity-demo-1',
      title: 'Weekly SBI feedback ritual',
      interventionType: 'feedback',
      interventionId: null,
      interventionLabel: 'Weekly SBI feedback ritual',
      studyId: 'impact-demo-1',
      ownerId: people[1]?.id || null,
      population: people.length || 5,
      plannedUnits: 24,
      windowStart: at(28),
      windowEnd: at(1),
      status: 'settled',
      stages: [
        { key: 'reach', targetOn: at(14), attested: attest('met', at(14), 'Everyone got at least one note in the first fortnight.') },
        { key: 'dose', targetOn: at(1), attested: attest('met', at(1), 'Twenty-three notes against twenty-four planned. Close enough not to argue about.') },
        { key: 'fidelity', targetOn: at(1), attested: attest('partial', at(1), 'Every note has all three SBI parts, but two of them describe an impact I cannot actually evidence.') },
        { key: 'sustain', targetOn: at(1), attested: attest('met', at(1), 'Still writing them in week four, which is the part that usually fails.') },
        { key: 'adaptation', targetOn: at(1), attested: attest('met', at(1), 'Moved the writing pass from Friday to Thursday so it no longer collides with the review cycle.') },
      ],
      settlement: {
        version: 1,
        on: at(1),
        at: stampFor(at(1), 17),
        byId: null,
        gradeId: 'strong',
        indexPct: 92.5,
        coveragePct: 100,
        exposurePct: 88.4,
        unitCount: 23,
        populationCount: people.length || 5,
        plannedUnits: 24,
        instrumented: true,
        stages: [
          { key: 'reach', scorePct: 100, source: 'records', agreement: 'concordant' },
          { key: 'dose', scorePct: 95.8, source: 'records', agreement: 'concordant' },
          { key: 'fidelity', scorePct: 100, source: 'records', agreement: 'lenient' },
          { key: 'sustain', scorePct: 100, source: 'records', agreement: 'concordant' },
          { key: 'adaptation', scorePct: 100, source: 'attestation', agreement: 'unverifiable' },
        ],
      },
      notes: 'Declared on the day the ritual started. The denominator was fixed then, which is the only reason the number means anything now.',
      createdAt: stampFor(at(28)),
      updatedAt: stampFor(at(1), 17),
      history: [
        { at: stampFor(at(28)), type: 'declared', summary: 'Declared before delivery was graded: 24 planned notes across 5 people.' },
        { at: stampFor(at(1), 17), type: 'settled', summary: 'Settled: Delivered as designed — index 92.5%, exposure 88.4%.' },
      ],
    },
    {
      id: 'fidelity-demo-2',
      title: 'Twice-weekly 1:1 cadence through the restructure',
      interventionType: 'oneonone',
      interventionId: null,
      interventionLabel: 'Twice-weekly 1:1 cadence',
      studyId: null,
      ownerId: people[0]?.id || null,
      population: people.length || 5,
      plannedUnits: 10,
      windowStart: at(9),
      windowEnd: today,
      status: 'active',
      stages: [
        { key: 'reach', targetOn: at(4), attested: null },
        { key: 'dose', targetOn: today, attested: attest('met', today, 'Ten conversations happened, even if only a few of them are in here.') },
        { key: 'fidelity', targetOn: today, attested: null },
        { key: 'sustain', targetOn: today, attested: null },
        { key: 'adaptation', targetOn: today, attested: attest('partial', today, 'Dropped the second weekly slot for two of the five people — no record of why beyond “diary pressure”.') },
      ],
      settlement: null,
      notes: 'Declared with a dose the diary could not carry. Left unsettled on purpose: settling it is the demonstration.',
      createdAt: stampFor(at(9)),
      updatedAt: stampFor(today),
      history: [
        { at: stampFor(at(9)), type: 'declared', summary: 'Declared before delivery was graded: 10 planned 1:1s across 5 people.' },
        { at: stampFor(today), type: 'attested', summary: 'Attested dose: Met (records disagree — claims more delivery than the records show)' },
      ],
    },
  ];
}


/**
 * Schema v51 — the merit & pay-equity terminal over the demo's own roster.
 *
 * Two cycles, both real:
 *
 *  - a **past cycle** that took effect a year ago and has been finalized, with
 *    its audit frozen by the same function the finalize action calls and its
 *    departure predictions resolved against the roster. Its calibration card is
 *    the honest small-sample case, not a flattering one.
 *  - a **current cycle** mid-flight: the budget declared, every current salary
 *    recorded, no proposals yet. Applying a policy and finalizing it is the
 *    demonstration.
 *
 * The demo's five-person team is deliberately *too small* for the Oaxaca–Blinder
 * decomposition (two groups, five people) and the page says so. That refusal is
 * the feature: a decomposition on three-versus-two would be a number nobody
 * should quote, and the demo would be teaching the wrong lesson.
 */
function seedMerit(state, now) {
  const today = dayKey(now);
  const stampFor = (day, hour = 9) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00.000Z`).toISOString();
  const people = (state.people || []).filter((person) => person && person.status !== 'archived');
  if (!people.length) return { bands: [], cycles: [] };

  // Bands are declared per level in the roster, dated before either cycle so a
  // band cannot be invented after the fact to fit the decisions.
  const ranges = {
    ic: { label: 'Analyst / IC', min: 65000, mid: 78000, max: 92000 },
    senior: { label: 'Senior IC / PM', min: 92000, mid: 108000, max: 125000 },
    lead: { label: 'Lead', min: 112000, mid: 130000, max: 148000 },
    manager: { label: 'Manager', min: 118000, mid: 136000, max: 155000 },
    director: { label: 'Director', min: 145000, mid: 168000, max: 192000 },
    vp: { label: 'VP', min: 180000, mid: 210000, max: 245000 },
  };
  const levels = [...new Set(people.map((person) => person.level).filter((level) => ranges[level]))];
  const bands = levels.map((level, index) => ({
    id: `band-demo-${index + 1}`,
    level,
    label: ranges[level].label,
    min: ranges[level].min,
    mid: ranges[level].mid,
    max: ranges[level].max,
    effectiveOn: addDays(today, -400),
    notes: 'Declared from the level and scope of the work, not from what the current team happens to be paid.',
    createdAt: stampFor(addDays(today, -400)),
    updatedAt: stampFor(addDays(today, -400)),
  }));

  /**
   * Current pay by person, chosen so the page has something real to find:
   * the lead sits below her band midpoint, and the external hire at senior level
   * is paid above the internal one at the same level (the loyalty penalty).
   */
  const pay = {
    'person-demo-1': { current: 118000, origin: 'internal' }, // Priya, lead
    'person-demo-2': { current: 112000, origin: 'internal' }, // Jordan, senior
    'person-demo-3': { current: 116000, origin: 'external' }, // Mei, senior, joined 260 days ago
    'person-demo-4': { current: 139000, origin: 'external' }, // Samuel, manager, joined 38 days ago
    'person-demo-5': { current: 76000, origin: 'internal' }, // Freya, ic
  };
  const rowsFor = (factor) => people
    .filter((person) => pay[person.id])
    .map((person) => {
      const base = Math.round((pay[person.id].current * factor) / 500) * 500;
      return {
        personId: person.id,
        level: person.level,
        currentPay: base,
        proposedPay: base,
        origin: pay[person.id].origin,
        retentionConcern: person.id === 'person-demo-1',
        note: '',
        updatedAt: stampFor(today),
      };
    });

  // ---- the past cycle: finalized, frozen, with resolved outcomes.
  const pastEffective = addDays(today, -365);
  const pastAsOf = new Date(`${pastEffective}T12:00:00.000Z`);
  const pastCycle = {
    id: 'merit-demo-1',
    label: 'FY25 merit cycle',
    currency: 'USD',
    effectiveOn: pastEffective,
    status: 'draft',
    budget: { kind: 'amount', value: 26000 },
    comparison: { dimension: 'origin' },
    ownerId: people[0]?.id || null,
    rows: rowsFor(0.94),
    audit: null,
    outcomes: [],
    createdAt: stampFor(addDays(pastEffective, -14)),
    updatedAt: stampFor(pastEffective),
    history: [{ at: stampFor(addDays(pastEffective, -14)), type: 'declared', summary: 'Declared with a USD 26,000 budget and a hire-origin comparison.' }],
  };
  const pastState = { ...state, meritCycles: [pastCycle], compBands: bands };
  const pastReading = fairnessReading(pastState, pastCycle, pastAsOf);
  pastCycle.audit = buildFairnessSnapshot(pastReading, { capturedAt: stampFor(pastEffective, 17) });
  pastCycle.status = 'finalized';
  pastCycle.history.push({
    at: stampFor(pastEffective, 17),
    type: 'finalized',
    summary: `Froze the audit: ${Math.round(pastReading.spent)} committed against ${Math.round(pastReading.budget.amount)}, ${pastReading.compression.length} relative-pay finding(s).`,
  });
  // Every prediction's window has closed and everyone is still here, so each
  // resolves as a stay. That is the honest input the calibration card receives —
  // including the case where the base-rate comparator has no variance at all.
  const horizonOn = addDays(pastEffective, 365);
  pastCycle.outcomes = (pastCycle.audit?.predictions || []).map((prediction) => ({
    personId: prediction.personId,
    on: horizonOn,
    departed: false,
    horizonOn,
  }));

  // ---- the current cycle: mid-flight, nothing proposed yet.
  const currentCycle = {
    id: 'merit-demo-2',
    label: 'FY26 merit cycle',
    currency: 'USD',
    effectiveOn: addDays(today, 21),
    status: 'draft',
    budget: { kind: 'amount', value: 26000 },
    comparison: { dimension: 'origin' },
    ownerId: people[0]?.id || null,
    rows: rowsFor(1),
    audit: null,
    outcomes: [],
    createdAt: stampFor(addDays(today, -3)),
    updatedAt: stampFor(today),
    history: [{
      at: stampFor(addDays(today, -3)),
      type: 'declared',
      summary: 'Declared with a USD 26,000 budget (1.7% of payroll) and a hire-origin comparison. Current pay recorded; no proposals yet.',
    }],
  };

  return { bands, cycles: [pastCycle, currentCycle] };
}

/**
 * Schema v39 — run the Early-Warning Watch over the demo's dated records.
 *
 * This is the real rule, not a fixture: it tests every monitored series, applies
 * the same step-up with the same q, records promotions *and* suppressions, and
 * freezes the next-week prediction. If the demo's series show no special cause,
 * the demo shows an empty queue and says so — which is the honest outcome and
 * exactly what the module is supposed to make visible.
 */
function seedWatch(state, now) {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-demo-w${++seq}`;

  // Illustrative pseudo-real-time replay over the *current* demo records.
  // Dated filtering does not restore historical data vintages or rule out
  // revisions/lookahead. These rows are explicitly excluded from real skill.
  for (let back = 3; back >= 1; back -= 1) {
    const asOf = new Date(new Date(`${addDays(dayKey(now), -7 * back)}T23:59:59.000Z`).getTime());
    const replay = scanWatch(state, asOf);
    for (const f of replay.forecasts) {
      state.watchForecasts.push({
        id: idFactory('ewf'),
        seriesId: f.seriesId,
        issuedOn: f.issuedOn,
        issuedAt: asOf.toISOString(),
        dueOn: f.dueOn,
        point: f.point,
        lo: f.lo,
        hi: f.hi,
        baselinePoint: f.baselinePoint,
        sigma: f.sigma,
        method: 'demo-reconstruction',
      });
    }
  }

  // Then the live scan, which is the one that can actually promote an alert.
  earlyWarningRule(state, { event: { type: 'watch.scan' }, now, idFactory });
  return state;
}


/**
 * Schema v42 — demo Strategy Coherence Terminal.
 *
 * Three bets with deliberately different quality, written against the demo
 * workspace's own goals and plan items: one falsifiable and over-funded, one
 * partially falsifiable, and one active bet that is neither funded nor
 * falsifiable. One stop rule is deliberately overdue so the terminal
 * demonstrates a verdict that is due rather than only a tidy dashboard. No
 * record is tagged that the demo's own work does not justify, and the declared
 * shares sum to 100 so the gap is computable rather than decorative.
 */
/**
 * Schema v43 — the After-Action Review & Learning Ledger.
 *
 * The demo carries three reviews, chosen so the terminal can show each of its
 * honesty properties at once rather than a tidy success story:
 *
 *  1. The settled invoice-duplication incident, reviewed five days after it
 *     closed, with two lessons that were genuinely applied — a **closed loop**,
 *     with the note that says what is now different.
 *  2. The anchored P1 handoff change, reviewed four days after it anchored, with
 *     a process change applied.
 *  3. The same lesson class appears in both, and the earlier review's committed
 *     change was never made — the **unclosed recurrence** the terminal exists to
 *     print. Nothing here is fabricated about a person: the lesson names a
 *     dependency nobody owned, not a person who failed.
 *
 * The demo deliberately leaves one completed delegation unreviewed and past the
 * 14-day convention, so the queue is not empty and LEARN-01 has something true
 * to say. No review is back-dated into a held state it could not have had: each
 * `heldOn` is after the outcome it reviews.
 */
/**
 * Schema v47: one committed demo scorecard.
 *
 * It is the support-throughput card the demo's own records already describe — a
 * single support queue, tickets closed, and a quality problem that the volume
 * metric cannot see. The prediction is frozen through the same
 * `freezeMeasurementPrediction` the commit action uses, so the demo shows a
 * genuine out-of-sample record rather than a hand-written score.
 *
 * Deliberately committed WITHOUT an observation: the page then shows the
 * "record what happened" step, which is the point of the ledger. No decision,
 * delegation or review is fabricated here — those are the rule spine's job on a
 * real commit, and inventing them would misrepresent the propagation engine.
 */
function seedMeasurement(state, now) {
  const today = dayKey(now);
  const personId = (match) => (state.people || []).find((p) => p && p.name.includes(match))?.id || null;
  const owner = personId('Priya') || personId('Jordan') || (state.people || [])[0]?.id || null;
  const scorecard = {
    id: 'scorecard-demo-1',
    title: 'Support throughput',
    objective: 'Customers get a resolution that holds, from a queue that stays survivable.',
    ownerId: owner,
    status: 'committed',
    stakesPct: 60,
    professionalismPct: 20,
    riskAversionPct: 40,
    detectionPct: 25,
    effortHoursPerWeek: 32,
    reviewOn: addDays(today, 28),
    tasks: [
      {
        id: 'mtask-demo-1',
        name: 'Tickets closed per week',
        kind: 'measured',
        weightPct: 65,
        trueValue: 30,
        effortCost: 25,
        gamingEase: 70,
        noisePct: 15,
        ratchetPct: 45,
      },
      {
        id: 'mtask-demo-2',
        name: 'Customer-confirmed resolution',
        kind: 'measured',
        weightPct: 35,
        trueValue: 85,
        effortCost: 60,
        gamingEase: 20,
        noisePct: 40,
        ratchetPct: 10,
      },
      {
        id: 'mtask-demo-3',
        name: 'Writing the runbook nobody reads yet',
        kind: 'unmeasured',
        weightPct: 0,
        trueValue: 70,
        effortCost: 45,
        gamingEase: 0,
        noisePct: 10,
        ratchetPct: 0,
      },
    ],
    frozen: null,
    observation: null,
    committedAt: new Date(`${addDays(today, -21)}T16:00:00.000Z`).toISOString(),
    reviewedAt: null,
    createdAt: new Date(`${addDays(today, -24)}T16:00:00.000Z`).toISOString(),
    updatedAt: new Date(`${addDays(today, -21)}T16:00:00.000Z`).toISOString(),
    history: [
      { at: new Date(`${addDays(today, -24)}T16:00:00.000Z`).toISOString(), type: 'created', summary: 'Declared the support scorecard' },
      { at: new Date(`${addDays(today, -21)}T16:00:00.000Z`).toISOString(), type: 'committed', summary: 'Committed after the June overload review' },
    ],
  };
  scorecard.frozen = { at: scorecard.committedAt, prediction: freezeMeasurementPrediction(scorecard) };
  state.scorecards = [scorecard];
}

function seedLearning(state, now) {
  const today = dayKey(now);
  const at = (daysAgo) => addDays(today, -daysAgo);
  const ts = (daysAgo) => new Date(`${at(daysAgo)}T15:00:00.000Z`).toISOString();
  const personId = (match) => (state.people || []).find((p) => p && p.name.includes(match))?.id || null;
  const jordan = personId('Jordan');
  const priya = personId('Priya');
  const samuel = personId('Samuel');
  const mei = personId('Mei');

  const settledCase = (state.cases || []).find((c) => c && c.title.includes('webhook retries duplicated'));
  const anchoredChange = (state.changes || []).find((c) => c && c.status === 'anchored');

  const retros = [];

  if (settledCase) {
    retros.push({
      id: 'retro-demo-1',
      subjectType: 'case',
      subjectId: settledCase.id,
      subjectLabel: settledCase.title,
      outcomeOn: settledCase.resolvedOn || at(58),
      status: 'held',
      autoDrafted: true,
      intended: `Frozen at opening: expected exposure ≈ ${settledCase.forecastSnapshot?.costExpected ?? 16333.33} USD and ${settledCase.forecastSnapshot?.capacityDaysExpected ?? 6.17} diverted day(s). The plan assumed the duplicate check at month-end close was enough.`,
      actual: `14 invoices reached customers before Finance Ops halted the batch; realised exposure ${settledCase.actuals?.realisedExposure ?? 19500} USD and ${settledCase.actuals?.divertedDays ?? 8} diverted day(s) — worse than the most-likely estimate, inside the pessimistic one.`,
      cause: 'Idempotency was treated as transport metadata rather than a persisted business invariant, so a retry was structurally indistinguishable from a new invoice. No pre-send duplicate check existed, which is why detection happened after the customer had the document.',
      sustain: 'The Friday reconciliation review caught the drift within one cycle and Finance Ops stopped the batch without waiting for permission. That escalation instinct is the thing to keep.',
      improve: 'Persist the idempotency key at first attempt and block batch send on any duplicate detection — done and verified across two clean billing cycles.',
      skipReason: '',
      heldOn: at(53),
      participants: [jordan, mei].filter(Boolean),
      lessons: [
        {
          id: 'lesson-demo-1',
          class: 'quality',
          text: 'A correctness invariant that only exists in a retry path needs a test that exercises the retry, not the happy path.',
          changeType: 'delegation',
          changeNote: 'Add a replay test for every webhook handler that creates a financial record, and block merges without it.',
          state: 'applied',
          ownerId: mei,
          committedOn: at(53),
          appliedOn: at(20),
          appliedNote: 'Replay tests exist for all four financial webhook handlers and run in CI; two real double-send defects were caught in staging by them.',
          droppedOn: null,
          droppedReason: '',
          createdAt: ts(53),
        },
        {
          id: 'lesson-demo-2',
          class: 'process',
          text: 'A month-end close checklist is a detection control, not a prevention control, and the review treated it as prevention.',
          changeType: 'process',
          changeNote: 'Pre-send duplicate monitor owned by Finance Ops, alarmed before customer delivery rather than reconciled afterwards.',
          state: 'applied',
          ownerId: jordan,
          committedOn: at(53),
          appliedOn: at(40),
          appliedNote: 'Monitor live since the last close; it has fired twice on staging replays and never in production.',
          droppedOn: null,
          droppedReason: '',
          createdAt: ts(53),
        },
        {
          id: 'lesson-demo-3',
          class: 'dependency',
          text: 'Nobody owned the list of third-party dependencies whose retry semantics we rely on, so nobody could answer what a gateway timeout meant.',
          changeType: 'delegation',
          changeNote: 'Name an owner per external dependency, record its retry semantics, and review the list quarterly.',
          state: 'open',
          ownerId: priya,
          committedOn: at(53),
          appliedOn: null,
          appliedNote: '',
          droppedOn: null,
          droppedReason: '',
          createdAt: ts(53),
        },
      ],
      createdAt: ts(58),
      updatedAt: ts(20),
      history: [
        { at: ts(58), type: 'created', summary: 'Drafted from the closing record (resolution date)' },
        { at: ts(53), type: 'held', summary: 'Review held on ' + at(53) },
        { at: ts(20), type: 'annotated', summary: 'Replay tests verified in CI' },
      ],
    });
  }

  if (anchoredChange) {
    retros.push({
      id: 'retro-demo-2',
      subjectType: 'change',
      subjectId: anchoredChange.id,
      subjectLabel: anchoredChange.title,
      outcomeOn: anchoredChange.anchoredOn || at(11),
      status: 'held',
      autoDrafted: true,
      intended: 'A single written 5-line P1 handoff packet with an explicit incident-commander transfer in under fifteen minutes, measured on the XmR chart.',
      actual: 'Anchored: handoff time shifted from a ~47 minute baseline to ~20 minutes and the packet is in the runbook and onboarding. Ad-hoc paging still happens when the incident starts in a channel nobody is watching.',
      cause: 'The handoff contract fixed the transfer between pods but assumed the incident was already declared. Discovery inside a customer thread has no declared incident yet, so the contract had nothing to attach to.',
      sustain: 'Writing the packet in the incident channel rather than in DMs — that is what made the time measurable at all.',
      improve: 'Extend the contract to cover pre-declaration discovery, or accept the gap knowingly.',
      skipReason: '',
      heldOn: at(7),
      participants: [samuel].filter(Boolean),
      lessons: [
        {
          id: 'lesson-demo-4',
          class: 'dependency',
          text: 'A handoff contract between two teams still leaves the discovery-to-declaration gap inside each team unowned.',
          changeType: 'process',
          changeNote: 'Add a first-responder rule: whoever finds a customer-impacting issue declares the incident, before diagnosing it.',
          state: 'applied',
          ownerId: samuel,
          committedOn: at(7),
          appliedOn: at(2),
          appliedNote: 'Rule is in the support runbook and the triage template; it has been used three times this week.',
          droppedOn: null,
          droppedReason: '',
          createdAt: ts(7),
        },
      ],
      createdAt: ts(11),
      updatedAt: ts(2),
      history: [
        { at: ts(11), type: 'created', summary: 'Drafted from the closing record (anchoring date)' },
        { at: ts(7), type: 'held', summary: 'Review held on ' + at(7) },
      ],
    });
  }

  if (retros.length) state.retros = retros;
}

function seedStrategy(state, now) {
  const today = dayKey(now);
  const at = (daysAgo) => addDays(today, -daysAgo);
  const ts = (daysAgo) => new Date(`${at(daysAgo)}T09:00:00.000Z`).toISOString();
  const goalId = (match) => (state.goals || []).find((g) => g && g.title.includes(match))?.id || null;
  const caseId = (match) => (state.cases || []).find((c) => c && c.title.includes(match))?.id || null;
  const planId = (match) => (state.portfolio || []).find((p) => p && p.title.includes(match))?.id || null;
  const personId = (match) => (state.people || []).find((p) => p && p.name.includes(match))?.id || null;

  const jordan = personId('Jordan');
  const priya = personId('Priya');
  const samuel = personId('Samuel');

  state.strategyBets = [
    {
      id: 'bet-demo-1',
      title: 'Win the mid-market with a faster first value',
      kind: 'where-to-play',
      advantage: 'differentiation',
      diagnosis: 'Onboarding takes fourteen days to first value; mid-market trials churn before they ever see the product do something useful.',
      guidingPolicy: 'Guided onboarding for the 50–200 seat segment, instrumented end to end, until median time to first value is under ten minutes.',
      weightPct: 60,
      horizonWeeks: 26,
      ownerId: jordan,
      notDoing: [
        'No self-serve tier this half — activation is the constraint, not acquisition.',
        'No new enterprise customisations while the funnel is leaking.',
      ],
      killCriterion: {
        metric: 'Median time to first value',
        threshold: 14,
        direction: 'above',
        checkOn: at(6),
        note: 'If we are still above fourteen days at this date, the guided-onboarding mechanism is not working.',
      },
      status: 'active',
      adoptedOn: at(65),
      retiredOn: null,
      retiredReason: '',
      verdict: null,
      notes: 'The one bet the whole operating plan is arranged around.',
      createdOn: at(66),
      createdAt: ts(66),
      updatedAt: ts(65),
      history: [
        { at: ts(66), type: 'created', summary: 'Bet recorded as a draft' },
        { at: ts(65), type: 'adopted', summary: 'Adopted with a declared share of 60% of effort' },
      ],
    },
    {
      id: 'bet-demo-2',
      title: 'Make reliability a precondition rather than a project',
      kind: 'capability',
      advantage: 'focus',
      diagnosis: 'Two weekend P1s went untouched for over an hour because the rota assumed a support pod that no longer exists.',
      guidingPolicy: 'Rebuild escalation and the on-call rota first, then hold the line with a response-time stop rule.',
      weightPct: 25,
      horizonWeeks: 26,
      ownerId: priya,
      notDoing: ['We will not add another on-call rotation without removing one.'],
      killCriterion: {
        metric: 'P1 first response under 30 minutes',
        threshold: 80,
        direction: 'below',
        checkOn: at(-40),
        note: 'Judged at the next quarterly review.',
      },
      status: 'active',
      adoptedOn: at(40),
      retiredOn: null,
      retiredReason: '',
      verdict: null,
      notes: '',
      createdOn: at(41),
      createdAt: ts(41),
      updatedAt: ts(40),
      history: [{ at: ts(40), type: 'adopted', summary: 'Adopted with a declared share of 25% of effort' }],
    },
    {
      id: 'bet-demo-3',
      title: 'Cut cost to serve by a fifth',
      kind: 'how-to-win',
      advantage: 'cost',
      diagnosis: 'Resolving a ticket costs twice the benchmark because the top three classes are handled by hand.',
      guidingPolicy: '',
      weightPct: 15,
      horizonWeeks: 26,
      ownerId: samuel,
      notDoing: [],
      killCriterion: null,
      status: 'active',
      adoptedOn: at(30),
      retiredOn: null,
      retiredReason: '',
      verdict: null,
      notes: 'Adopted before the guiding policy or a stop rule existed — the terminal grades it as unfalsifiable rather than pretending otherwise.',
      createdOn: at(32),
      createdAt: ts(32),
      updatedAt: ts(30),
      history: [{ at: ts(30), type: 'adopted', summary: 'Adopted with a declared share of 15% of effort' }],
    },
  ];

  const tag = (betId, entityType, entityId, effortWeeks, daysAgo) => {
    if (!entityId) return;
    state.strategyTags.push({
      id: `tag-demo-${state.strategyTags.length + 1}`,
      betId,
      entityType,
      entityId,
      effortWeeks,
      note: '',
      createdOn: at(daysAgo),
      createdAt: ts(daysAgo),
    });
  };

  tag('bet-demo-1', 'goal', goalId('Cut activation time'), 4, 60);
  tag('bet-demo-1', 'portfolio', planId('Activation funnel instrumentation'), 3, 28);
  tag('bet-demo-2', 'goal', goalId('Rebuild escalation'), 2, 35);
  tag('bet-demo-2', 'portfolio', planId('On-call tooling v1'), 2, 25);
  tag('bet-demo-2', 'case', caseId('Weekend P1'), 1, 12);
}

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
  // A demo roster with no reporting lines leaves the structural-design terminal
  // unable to say anything at all, and every other screen silently assumes a
  // hierarchy exists. One real line each, under the lead, keeps the demo honest:
  // a four-person span inside the declared band of three to eight, one layer
  // below the lead, and six coordination channels a week priced from the FY25
  // cycle the merit terminal already holds.
  for (const personId of [jordan, mei, samuel, freya]) {
    state.people.find((person) => person.id === personId).managerId = priya;
  }

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
      // Schema v28: the day the call was actually made, so realised latency is
      // measured rather than inferred (46 → 36 days = 10-day latency).
      decidedOn: at(36),
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
      // 15-day realised latency (logged 24 days ago, called 9 days ago).
      decidedOn: at(9),
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
    horizon: null,
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
    // Schema v33 (Allocation Governor): a settled past the arms can learn
    // from, plus one exploratory candidate still waiting for a funding call.
    // Every settled row carries recorded actuals; the dates place the funding
    // decisions inside the 180-day policy window except the exploratory bet,
    // which is exactly the starvation pattern RULE-ALLOC-01 exists to catch.
    pf({
      title: 'Invoice PDF rendering upgrade',
      horizon: 'core',
      ownerId: priya,
      effortDays: { optimistic: 4, mostLikely: 5, pessimistic: 8 },
      value: { optimistic: 15000, mostLikely: 20000, pessimistic: 26000 },
      decision: 'funded',
      decisionOn: at(140),
      status: 'done',
      completedOn: at(120),
      actualEffortDays: 6,
      actualValue: 21000,
      createdOn: at(150),
      createdAt: new Date(ts(150)).toISOString(),
      updatedAt: new Date(ts(120)).toISOString(),
    }),
    pf({
      title: 'Audit-log retention tooling',
      horizon: 'core',
      ownerId: freya,
      effortDays: { optimistic: 3, mostLikely: 4, pessimistic: 6 },
      value: { optimistic: 7000, mostLikely: 9000, pessimistic: 12000 },
      decision: 'funded',
      decisionOn: at(110),
      status: 'done',
      completedOn: at(95),
      actualEffortDays: 4,
      actualValue: 9600,
      createdOn: at(118),
      createdAt: new Date(ts(118)).toISOString(),
      updatedAt: new Date(ts(95)).toISOString(),
    }),
    pf({
      title: 'Customer health-score pilot',
      horizon: 'adjacent',
      ownerId: jordan,
      effortDays: { optimistic: 5, mostLikely: 7, pessimistic: 11 },
      value: { optimistic: 24000, mostLikely: 34000, pessimistic: 46000 },
      decision: 'funded',
      decisionOn: at(100),
      status: 'done',
      completedOn: at(80),
      actualEffortDays: 8,
      actualValue: 38400,
      createdOn: at(108),
      createdAt: new Date(ts(108)).toISOString(),
      updatedAt: new Date(ts(80)).toISOString(),
    }),
    pf({
      title: 'Partner API beta',
      horizon: 'adjacent',
      ownerId: mei,
      effortDays: { optimistic: 6, mostLikely: 9, pessimistic: 14 },
      value: { optimistic: 26000, mostLikely: 38000, pessimistic: 52000 },
      decision: 'funded',
      decisionOn: at(85),
      status: 'done',
      completedOn: at(65),
      actualEffortDays: 10,
      actualValue: 41000,
      createdOn: at(92),
      createdAt: new Date(ts(92)).toISOString(),
      updatedAt: new Date(ts(65)).toISOString(),
    }),
    pf({
      title: 'Usage-based pricing experiment',
      horizon: 'exploratory',
      ownerId: samuel,
      effortDays: { optimistic: 3, mostLikely: 5, pessimistic: 9 },
      value: { optimistic: 10000, mostLikely: 24000, pessimistic: 60000 },
      decision: 'funded',
      decisionOn: at(200),
      status: 'done',
      completedOn: at(185),
      actualEffortDays: 5,
      actualValue: 30000,
      createdOn: at(210),
      createdAt: new Date(ts(210)).toISOString(),
      updatedAt: new Date(ts(185)).toISOString(),
    }),
    pf({
      title: 'AI-assisted support triage prototype',
      horizon: 'exploratory',
      ownerId: priya,
      effortDays: { optimistic: 4, mostLikely: 6, pessimistic: 10 },
      value: { optimistic: 20000, mostLikely: 45000, pessimistic: 90000 },
      decision: 'undecided',
      rationale: '',
      targetOn: at(-30),
      createdOn: at(8),
      createdAt: new Date(ts(8)).toISOString(),
      updatedAt: new Date(ts(2)).toISOString(),
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

  // Schema v33: ambition horizons for the pre-existing demo plan items.
  // Capacity reserves stay unclassified on purpose — they are obligations,
  // and the Governor reports them as unmeasured rather than guessing.
  const DEMO_HORIZONS = {
    'Billing reconciliation automation': 'core',
    'Warehouse metrics migration': 'core',
    'Activation funnel instrumentation': 'adjacent',
    'On-call tooling v1 (paging + runbooks)': 'core',
    'Self-serve invoice export v2': 'adjacent',
    'Legacy VAT rule clean-up': 'core',
    'Support tooling clean-up': 'core',
    'Incident review automation': 'core',
    'Query cost guardrails': 'core',
  };
  for (const item of state.portfolio) {
    if (DEMO_HORIZONS[item.title]) item.horizon = DEMO_HORIZONS[item.title];
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

  // Schema v27 — Intake Terminal drafts, generated by the real on-device
  // engine against the demo roster so every probability and evidence span is
  // computed, not hand-faked. The full analyzed → confirmed → dismissed
  // lifecycle is represented so the calibration ledger has something to show.
  const pendingIntakeText = 'The Aurora Cloud SLA renewal is slipping again — Priya says the vendor delivery is two weeks late and the penalty exposure is around $45,000. Samuel says the support pod is overloaded and burnt out, and we may need to escalate to the VP Customer Success this week.';
  const confirmedIntakeText = 'The billing ledger cutover is threatening the quarterly close: a defect in the reconciliation job caused an outage for two customers and the estimated exposure is about $18,000. Priya Natarajan owns the mitigation and Samuel Okafor needs a blameless support check-in.';
  const dismissedIntakeText = 'Freya Nilsson asked about refreshed laptop hardware ahead of the analytics rollout — a routine procurement request with no delivery risk and no budget breach.';
  const pendingAnalysis = analyzeIntakeText(pendingIntakeText, state, { now });
  const confirmedAnalysis = analyzeIntakeText(confirmedIntakeText, state, { now });
  const dismissedAnalysis = analyzeIntakeText(dismissedIntakeText, state, { now });
  state.intakeDrafts = [
    {
      id: id('intake'),
      createdAt: ts(4),
      updatedAt: ts(4),
      status: 'analyzed',
      sourceText: pendingIntakeText,
      engineVersion: pendingAnalysis.engineVersion,
      analysis: pendingAnalysis,
      confirmedCaseId: null,
      outcomes: null,
      dismissReason: '',
    },
    {
      id: id('intake'),
      createdAt: ts(20),
      updatedAt: ts(18),
      status: 'confirmed',
      sourceText: confirmedIntakeText,
      engineVersion: confirmedAnalysis.engineVersion,
      analysis: confirmedAnalysis,
      confirmedCaseId: billingCaseId,
      outcomes: {
        primaryCategory: confirmedAnalysis.primaryCategoryId,
        primaryAccepted: true,
        confidenceBand: confirmedAnalysis.confidenceBand,
        entityOffered: 4,
        entityAccepted: 3,
        editedFields: ['fmea.severity'],
        rejectedRouteIds: [],
      },
      dismissReason: '',
    },
    {
      id: id('intake'),
      createdAt: ts(12),
      updatedAt: ts(11),
      status: 'dismissed',
      sourceText: dismissedIntakeText,
      engineVersion: dismissedAnalysis.engineVersion,
      analysis: dismissedAnalysis,
      confirmedCaseId: null,
      outcomes: null,
      dismissReason: 'Handled through routine hardware procurement, not an operational case.',
    },
  ];

  // Schema v28 — Decision Tempo & Timing Terminal.
  //
  // Two things are demonstrated here. First, the latency calibration ledger is
  // only honest if the moment of each call was recorded: every settled demo
  // decision carries a `decidedOn` stamp, and five delegated calls with a
  // spread of realised latencies give the empirical band real data to work
  // with. Second, the timebox ledger shows all four lifecycle states — armed,
  // armed-and-overdue (RULE-DLY-02 will open one owned delegation on the next
  // tempo scan), proposed (never auto-armed) and settled.
  const delegatedLatencyDemo = [
    { title: 'Choose the on-call rotation tool', logged: 30, decided: 27, driver: 'Priya Natarajan', approver: 'Head of Platform', chose: 'Keep the current pager, add a rotation calendar' },
    { title: 'Approve the incident Slack channel split', logged: 26, decided: 21, driver: 'Samuel Okafor', approver: 'Head of Platform', chose: 'Split by severity' },
    { title: 'Select the log-retention window', logged: 24, decided: 18, driver: 'Mei Lin Chen', approver: 'Head of Platform', chose: '90 days hot, 12 months cold' },
    { title: 'Pick the weekly metrics review slot', logged: 20, decided: 11, driver: 'Freya Nilsson', approver: 'Head of Platform', chose: 'Tuesday 09:00' },
    { title: 'Choose the support rota hand-off format', logged: 18, decided: 6, driver: 'Samuel Okafor', approver: 'Head of Platform', chose: 'Live hand-off note in the incident channel' },
  ];
  for (const row of delegatedLatencyDemo) {
    state.decisions.push({
      id: id('dec'),
      title: row.title,
      question: `${row.title}? Low-stakes and reversible: decide at the lowest level that has the information.`,
      date: at(row.logged),
      reversibility: 'reversible',
      driver: row.driver,
      approver: row.approver,
      contributors: '',
      informed: '',
      options: [
        { id: id('dopt'), label: row.chose, pros: 'Cheapest option that removes the ambiguity', cons: 'Can be revisited without penalty' },
        { id: id('dopt'), label: 'Keep the current arrangement', pros: 'No change cost', cons: 'The question keeps resurfacing' },
      ],
      chosen: row.chose,
      rationale: 'Reversible operational choice; the cost of deciding was lower than the cost of the discussion.',
      forecastProbability: null,
      decidedOn: at(row.decided),
      reviewOn: at(row.decided - 14) > at(0) ? null : at(row.decided - 14),
      reviewedOn: null,
      outcome: 'pending',
      outcomeNotes: '',
      createdAt: new Date(ts(row.logged)).toISOString(),
    });
  }

  // An overdue timebox: logged 35 days ago, decide-by 9 days ago, still open.
  const vendorDecision = {
    id: id('dec'),
    title: 'Choose the warehouse vendor for the analytics migration',
    question: 'Two vendor proposals are on the table. The commercial terms lock for 30 days and the team is already blocked on the schema decision. Decide now with the evidence available, or run one reference call first?',
    date: at(35),
    reversibility: 'reversible',
    driver: 'Freya Nilsson',
    approver: 'Priya Natarajan',
    contributors: 'Jordan Alvarez',
    informed: 'Platform, Finance',
    options: [
      { id: id('dopt'), label: 'Vendor A — cheaper per terabyte, weaker SLA', pros: '18% lower run rate', cons: 'Two-hour response window misses the nightly load' },
      { id: id('dopt'), label: 'Vendor B — stronger SLA, higher run rate', pros: 'Matches the incident-response commitment', cons: 'Consumes the remaining quarterly headroom' },
    ],
    chosen: '',
    rationale: '',
    forecastProbability: null,
    decidedOn: null,
    reviewOn: null,
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    createdAt: new Date(ts(35)).toISOString(),
  };
  state.decisions.push(vendorDecision);

  const podsDecision = state.decisions.find((d) => d.title === 'Restructure support into pods');
  if (podsDecision) {
    // Link the open restructuring decision to the real billing case so the
    // engine derives its value at stake from a record instead of a guess.
    state.links.push({
      id: id('lnk'),
      sourceType: 'case',
      sourceId: billingCaseId,
      targetType: 'decision',
      targetId: podsDecision.id,
      relation: 'decides',
      ruleId: 'DEMO',
      summary: 'The restructuring call governs how the billing incident is handled',
      createdOn: at(19),
      createdAt: new Date(ts(19)).toISOString(),
    });
  }

  state.tempoSchedules = [
    {
      id: id('tempo'),
      decisionId: podsDecision ? podsDecision.id : state.decisions[0].id,
      status: 'armed',
      profile: 'linear',
      currency: 'USD',
      valueAtStakeOverride: null,
      derivedAmount: 42000,
      derivedAt: at(19),
      derivedTermCount: 1,
      delayCostPerWeek: null,
      windowWeeks: 12,
      deadlineDays: 21,
      advantageAmount: 18000,
      uncertaintyPct: 85,
      halfLifeDays: 6,
      infoWeeks: 1,
      infoCostAmount: 900,
      infoCostNote: 'Two support-agent interviews and one half-day rota simulation',
      decideBy: at(-3),
      plannedTempoDays: 22,
      decisionType: 'cross-cutting',
      notes: 'Pod design is reversible, but the support rota cannot be rebuilt twice in a quarter.',
      createdOn: at(19),
      createdAt: new Date(ts(19)).toISOString(),
      updatedAt: new Date(ts(19)).toISOString(),
      armedOn: at(19),
      settledOn: null,
      abandonedOn: null,
      abandonReason: '',
      realizedLatencyDays: null,
      resolvedChoice: '',
      history: [
        { on: at(19), action: 'armed', note: 'linear profile · decide by ' + at(-3) + ' · edge 18000', plannedWaitDays: 22, realizedLatencyDays: null },
      ],
    },
    {
      id: id('tempo'),
      decisionId: vendorDecision.id,
      status: 'armed',
      profile: 'fixed-date',
      currency: 'USD',
      valueAtStakeOverride: 65000,
      derivedAmount: null,
      derivedAt: at(30),
      derivedTermCount: 0,
      delayCostPerWeek: null,
      windowWeeks: 8,
      // The commercial lock date has already passed: every further week is paid
      // at the fixed-date multiplier, which is why this one reads "decide now".
      deadlineDays: 0,
      advantageAmount: 14000,
      uncertaintyPct: 45,
      halfLifeDays: 7,
      infoWeeks: 1,
      infoCostAmount: 800,
      infoCostNote: 'One reference call with the Vendor B account team',
      decideBy: at(9),
      plannedTempoDays: 26,
      decisionType: 'cross-cutting',
      notes: 'Commercial terms lock at the end of the month; after that the fixed-date profile applies.',
      createdOn: at(35),
      createdAt: new Date(ts(35)).toISOString(),
      updatedAt: new Date(ts(9)).toISOString(),
      armedOn: at(35),
      settledOn: null,
      abandonedOn: null,
      abandonReason: '',
      realizedLatencyDays: null,
      resolvedChoice: '',
      history: [
        { on: at(35), action: 'armed', note: 'fixed-date profile · decide by ' + at(9) + ' · edge 14000', plannedWaitDays: 26, realizedLatencyDays: null },
        { on: at(12), action: 'edited', note: 'windowWeeks, deadlineDays' },
      ],
    },
    {
      id: id('tempo'),
      decisionId: state.decisions.find((d) => d.title === 'Standardise weekly metrics on warehouse tables')?.id || state.decisions[0].id,
      status: 'settled',
      profile: 'linear',
      currency: 'USD',
      valueAtStakeOverride: null,
      derivedAmount: null,
      derivedAt: at(24),
      derivedTermCount: 0,
      delayCostPerWeek: null,
      windowWeeks: 12,
      deadlineDays: 21,
      advantageAmount: 6000,
      uncertaintyPct: 40,
      halfLifeDays: 14,
      infoWeeks: 1,
      infoCostAmount: 0,
      infoCostNote: '',
      decideBy: at(4),
      plannedTempoDays: 20,
      decisionType: 'cross-cutting',
      notes: 'Decided faster than the plan because Freya already had the definitions drafted.',
      createdOn: at(24),
      createdAt: new Date(ts(24)).toISOString(),
      updatedAt: new Date(ts(9)).toISOString(),
      armedOn: at(24),
      settledOn: at(9),
      abandonedOn: null,
      abandonReason: '',
      realizedLatencyDays: 15,
      resolvedChoice: 'Single warehouse source of truth',
      history: [
        { on: at(24), action: 'armed', note: 'linear profile · decide by ' + at(4) + ' · edge 6000', plannedWaitDays: 20, realizedLatencyDays: null },
        { on: at(9), action: 'settled', note: 'Decision made 15 days after it was logged', plannedWaitDays: 20, realizedLatencyDays: 15 },
      ],
    },
  ];

  // A proposal is never armed by automation: RULE-DLY-03 derives the value and
  // the guardrail date, and the leader supplies the believed edge. This one is
  // left unarmed on purpose so the terminal shows the difference.
  const mandateDecision = state.decisions.find((d) => String(d.title || '').startsWith('Negotiation mandate'));
  if (mandateDecision) {
    state.tempoSchedules.push({
      id: id('tempo'),
      decisionId: mandateDecision.id,
      status: 'proposed',
      profile: 'linear',
      currency: 'USD',
      valueAtStakeOverride: null,
      derivedAmount: 96000,
      derivedAt: at(2),
      derivedTermCount: 1,
      delayCostPerWeek: null,
      windowWeeks: 12,
      deadlineDays: 21,
      advantageAmount: null,
      uncertaintyPct: null,
      halfLifeDays: 14,
      infoWeeks: null,
      infoCostAmount: 0,
      infoCostNote: '',
      decideBy: at(-21),
      plannedTempoDays: 28,
      decisionType: 'cross-cutting',
      notes: '',
      createdOn: at(2),
      createdAt: new Date(ts(2)).toISOString(),
      updatedAt: new Date(ts(2)).toISOString(),
      armedOn: null,
      settledOn: null,
      abandonedOn: null,
      abandonReason: '',
      realizedLatencyDays: null,
      resolvedChoice: '',
      history: [
        { on: at(2), action: 'proposed', note: 'Auto-proposed from 1 linked record; USD 96,000 at stake', plannedWaitDays: null, realizedLatencyDays: null },
      ],
    });
  }

  state.settings.leaderName = 'Alex Rivera';
  state.settings.teamName = 'Platform';
  state.settings.orgName = 'Northwind';
  // Schema v34: the demo team is deliberately at the edge of capacity, so the
  // demo workspace sets its own (visible, editable) saturation threshold at
  // 70 instead of the 80 default. The Load Governor then demonstrates the
  // saturated band on the staff engineer's existing recorded load without
  // adding effort that would tip the knife-edge Capacity plan over ρ = 1.
  state.settings.loadSaturationPct = 70;

  // Schema v29 — Operational Resilience, Dependency & Continuity topology:
  // a 3-tier service/vendor/system/process graph showing a hidden sub-tier
  // choke point, a sole-steward critical service (Bus Factor = 1 with an
  // unverified trainee shadow), Williamson vendor hold-up on Aurora Cloud, and
  // 3 recorded drills (intentionally < 5 so conformal bands stay counts-only).
  const depSubTierId = id('dep');
  const depAuroraVendorId = id('dep');
  const depTaxVendorId = id('dep');
  const depBillingSvcId = id('dep');
  const depCloseRunbookId = id('dep');

  state.dependencies = [
    {
      id: depSubTierId,
      name: 'Signing Key Vault & Webhook Auth (KMS)',
      kind: 'system',
      criticality: 'critical',
      status: 'active',
      summary: 'Shared cryptographic key-signing and webhook token verification layer underneath queue workers and settlement jobs.',
      ttsDays: 0.5,
      ttrDays: 3,
      substitutability: 'none',
      warmSwitchDays: null,
      exitPlanSummary: 'Secondary region key replica planned next quarter; manual rotation runbook requires security sign-off.',
      currency: 'USD',
      dailyImpactOverride: 3200,
      derivedDailyImpact: null,
      derivedCurrency: '',
      annualSpend: null,
      annualFailureProb: 10,
      mitigationCost: 9000,
      upstreamIds: [],
      stewards: [
        { personId: priya, role: 'primary', verifiedOn: at(45), notes: 'Authored KMS rotation scripts' },
        { personId: freya, role: 'backup', verifiedOn: at(20), notes: 'Ran independent staging key failover' },
      ],
      linkedGoalIds: [],
      linkedBudgetId: demoBudgetId,
      linkedNegotiationId: null,
      linkedStakeholderId: null,
      linkedPortfolioId: null,
      drills: [
        {
          id: id('drl'),
          date: at(25),
          kind: 'failover-drill',
          scenario: 'Simulated primary KMS signing-key revocation in staging',
          estimatedTtrDays: 2,
          realizedTtrDays: 3,
          outcome: 'breached-tolerance',
          gapNote: 'Downstream webhook workers lacked cached public keys past 12 hours (0.5d TTS).',
          linkedCaseId: null,
          recordedAt: new Date(ts(25)).toISOString(),
        },
      ],
      history: [{ on: at(50), action: 'created', note: 'Mapped shared sub-tier signing infrastructure' }],
      autoPropagate: true,
      createdOn: at(50),
      reviewOn: at(-14),
      retiredOn: null,
      retiredReason: '',
      createdAt: new Date(ts(50)).toISOString(),
      updatedAt: new Date(ts(25)).toISOString(),
    },
    {
      id: depAuroraVendorId,
      name: 'Aurora Cloud Compute & Managed Queue',
      kind: 'vendor',
      criticality: 'critical',
      status: 'active',
      summary: 'Primary cloud runtime and managed event queue hosting billing and analytics pipelines.',
      ttsDays: 2,
      ttrDays: 14,
      substitutability: 'untested-alt',
      warmSwitchDays: null,
      exitPlanSummary: '',
      currency: 'USD',
      dailyImpactOverride: null,
      derivedDailyImpact: 263.01,
      derivedCurrency: 'USD',
      annualSpend: 96000,
      annualFailureProb: 15,
      mitigationCost: 18000,
      upstreamIds: [depSubTierId],
      stewards: [
        { personId: priya, role: 'primary', verifiedOn: at(60), notes: 'Technical vendor owner & escalation lead' },
        { personId: jordan, role: 'backup', verifiedOn: at(30), notes: 'Has production console & support escalation access' },
      ],
      linkedGoalIds: [metricsGoalId],
      linkedBudgetId: demoBudgetId,
      linkedNegotiationId: vendorNegotiationId,
      linkedStakeholderId: state.stakeholders?.[0]?.id || null,
      linkedPortfolioId: null,
      drills: [
        {
          id: id('drl'),
          date: at(40),
          kind: 'tabletop',
          scenario: 'Regional Aurora queue outage & contract non-renewal walkthrough',
          estimatedTtrDays: 10,
          realizedTtrDays: 14,
          outcome: 'breached-tolerance',
          gapNote: 'Terraform modules use proprietary queue semantics; Northstack migration takes ~14 days.',
          linkedCaseId: null,
          recordedAt: new Date(ts(40)).toISOString(),
        },
      ],
      history: [{ on: at(60), action: 'created', note: 'Registered Tier-2 strategic cloud supplier' }],
      autoPropagate: true,
      createdOn: at(60),
      reviewOn: at(-10),
      retiredOn: null,
      retiredReason: '',
      createdAt: new Date(ts(60)).toISOString(),
      updatedAt: new Date(ts(40)).toISOString(),
    },
    {
      id: depTaxVendorId,
      name: 'LedgerTax VAT Rules Engine',
      kind: 'vendor',
      criticality: 'important',
      status: 'active',
      summary: 'External tax-rate lookup API called during invoice generation.',
      ttsDays: 5,
      ttrDays: 3,
      substitutability: 'warm-standby',
      warmSwitchDays: 1,
      exitPlanSummary: 'Cached static VAT schedule covers 5 days offline; warm-standby adapter switches in 1 day.',
      currency: 'USD',
      dailyImpactOverride: null,
      derivedDailyImpact: 49.32,
      derivedCurrency: 'USD',
      annualSpend: 18000,
      annualFailureProb: 8,
      mitigationCost: 2500,
      upstreamIds: [],
      stewards: [
        { personId: mei, role: 'primary', verifiedOn: at(55), notes: 'Maintains tax-rate cache sync' },
        { personId: samuel, role: 'backup', verifiedOn: at(18), notes: 'Verified warm-standby feature flag switchover' },
      ],
      linkedGoalIds: [billingGoalId],
      linkedBudgetId: demoBudgetId,
      linkedNegotiationId: null,
      linkedStakeholderId: null,
      linkedPortfolioId: null,
      drills: [
        {
          id: id('drl'),
          date: at(18),
          kind: 'failover-drill',
          scenario: 'Switched invoice staging to cached VAT table + secondary adapter',
          estimatedTtrDays: 1,
          realizedTtrDays: 0.8,
          outcome: 'within-tolerance',
          gapNote: '',
          linkedCaseId: null,
          recordedAt: new Date(ts(18)).toISOString(),
        },
      ],
      history: [{ on: at(55), action: 'created', note: 'Registered VAT rules vendor with warm-standby cache' }],
      autoPropagate: true,
      createdOn: at(55),
      reviewOn: at(-30),
      retiredOn: null,
      retiredReason: '',
      createdAt: new Date(ts(55)).toISOString(),
      updatedAt: new Date(ts(18)).toISOString(),
    },
    {
      id: depBillingSvcId,
      name: 'Customer Billing & Invoice Settlement',
      kind: 'service',
      criticality: 'critical',
      status: 'active',
      summary: 'Core customer invoicing, ledger settlement and payment-retry pipeline underpinning Q4 billing SLAs.',
      ttsDays: 1,
      ttrDays: 4,
      substitutability: 'none',
      warmSwitchDays: null,
      exitPlanSummary: 'Manual CSV invoice batch holds for 24h (TTS = 1d), after which customer SLA credits trigger.',
      currency: 'USD',
      dailyImpactOverride: 4500,
      derivedDailyImpact: null,
      derivedCurrency: '',
      annualSpend: null,
      annualFailureProb: 18,
      mitigationCost: 12000,
      upstreamIds: [depAuroraVendorId, depTaxVendorId],
      stewards: [
        { personId: mei, role: 'primary', verifiedOn: at(60), notes: 'Sole operator who has run production billing recovery' },
        { personId: jordan, role: 'trainee', verifiedOn: null, notes: 'Shadowing next month-end settlement run' },
      ],
      linkedGoalIds: [billingGoalId],
      linkedBudgetId: null,
      linkedNegotiationId: null,
      linkedStakeholderId: null,
      linkedPortfolioId: state.portfolio[0]?.id || null,
      drills: [],
      history: [{ on: at(45), action: 'created', note: 'Registered Tier-1 billing capability; Mei sole verified steward' }],
      autoPropagate: true,
      createdOn: at(45),
      reviewOn: at(-7),
      retiredOn: null,
      retiredReason: '',
      createdAt: new Date(ts(45)).toISOString(),
      updatedAt: new Date(ts(10)).toISOString(),
    },
    {
      id: depCloseRunbookId,
      name: 'Month-End Webhook Reconciliation Runbook',
      kind: 'process',
      criticality: 'important',
      status: 'active',
      summary: 'Recurring finance-close reconciliation verifying signed webhook ledger events against warehouse totals.',
      ttsDays: 2,
      ttrDays: 2,
      substitutability: 'warm-standby',
      warmSwitchDays: 1,
      exitPlanSummary: 'Documented SQL verification checklist allows manual close within 24 hours.',
      currency: 'USD',
      dailyImpactOverride: 1800,
      derivedDailyImpact: null,
      derivedCurrency: '',
      annualSpend: null,
      annualFailureProb: 10,
      mitigationCost: 3000,
      upstreamIds: [depSubTierId],
      stewards: [
        { personId: mei, role: 'primary', verifiedOn: at(40), notes: 'Runs monthly close reconciliation' },
        { personId: priya, role: 'backup', verifiedOn: at(15), notes: 'Completed independent shadow close last month' },
      ],
      linkedGoalIds: [metricsGoalId],
      linkedBudgetId: null,
      linkedNegotiationId: null,
      linkedStakeholderId: null,
      linkedPortfolioId: null,
      drills: [],
      history: [{ on: at(40), action: 'created', note: 'Registered month-end close process' }],
      autoPropagate: true,
      createdOn: at(40),
      reviewOn: at(-21),
      retiredOn: null,
      retiredReason: '',
      createdAt: new Date(ts(40)).toISOString(),
      updatedAt: new Date(ts(15)).toISOString(),
    },
  ];

  // Schema v30 — Coalition & Incentive War Room. Three situations exercise the
  // full verdict range: a blocked coalition with an opposed veto player, an
  // incentive-misaligned but winnable game, and a settled, stable coordination
  // game. Players are inline, human-editable copies (never auto-overwritten);
  // linked records turn the built-in propagation into a live demo.
  const pwrPerson = state.people[1] ? state.people[1].id : (state.people[0] ? state.people[0].id : null);
  const pwrStakeholders = (state.stakeholders || []).slice(0, 3).map((s) => s.id);
  const pwrCase = (state.cases || [])[0] ? state.cases[0].id : null;
  const pwrDecision = (state.decisions || [])[0] ? state.decisions[0].id : null;
  state.powerGames = [
    {
      id: id('power'),
      title: 'Platform migration sign-off',
      context: 'The cutover needs a go/no-go from a steering group. The Head of Platform controls the release window and currently opposes the timing; the target is a coordinated "propose + support" outcome.',
      status: 'committed',
      players: [
        { id: 'hop', name: 'Head of Platform', weight: 6, stance: 'opposed', stakeholderId: pwrStakeholders[0] || null },
        { id: 'priya', name: 'Priya (Eng Lead)', weight: 3, stance: 'ally', personId: state.people[0] ? state.people[0].id : null },
        { id: 'jordan', name: 'Jordan (PM)', weight: 2, stance: 'ally' },
        { id: 'controller', name: 'Finance Controller', weight: 1, stance: 'neutral' },
      ],
      quotaPct: 50,
      counterpartyId: 'hop',
      strategies: { leader: ['Propose cutover', 'Defer a quarter'], rival: ['Support timing', 'Block timing'] },
      cells: { '00': [8, 4], '01': [-2, 6], '10': [2, 1], '11': [0, 0] },
      targetCell: '00',
      estimateConfidence: 'medium',
      linkedStakeholderIds: pwrStakeholders,
      linkedCaseId: pwrCase,
      linkedDecisionId: pwrDecision,
      linkedNegotiationId: null,
      linkedGoalIds: [],
      ownerId: pwrPerson,
      realizedCell: null,
      notes: 'Opposed veto player controls the release window; a concession of ≈2 utility units makes the target a Nash equilibrium.',
      derived: {
        verdict: 'coalition-blocked', verdictLabel: 'Coalition blocked', confidenceBand: 'medium',
        alignmentCost: 2, robustness: 0.2, coalitionFeasible: false, targetIsNE: false,
        issues: ['coalition-blocked', 'misaligned', 'coordination-risk'],
        engineVersion: 'power-2026.10-v1',
      },
      history: [{ on: at(6), action: 'created', note: 'Modeled the migration steering-group game' }],
      autoPropagate: true,
      createdOn: at(6), createdAt: new Date(ts(6)).toISOString(), updatedAt: new Date(ts(2)).toISOString(),
    },
    {
      id: id('power'),
      title: 'Q4 vendor renegotiation',
      context: 'Renegotiating the Aurora cloud contract. The counterparty would rather we concede on term length; our target (hold firm on price, they concede on notice) is not self-enforcing without a side-payment.',
      status: 'modeling',
      players: [
        { id: 'vpcs', name: 'VP Customer Success', weight: 4, stance: 'ally' },
        { id: 'controller', name: 'Finance Controller', weight: 3, stance: 'neutral', stakeholderId: pwrStakeholders[1] || null },
        { id: 'esl', name: 'Enterprise Support Lead', weight: 3, stance: 'ally' },
      ],
      quotaPct: 50,
      counterpartyId: 'controller',
      strategies: { leader: ['Hold price firm', 'Trade on price'], rival: ['Yield on notice', 'Hold the line'] },
      cells: { '00': [5, 1], '01': [0, 5], '10': [1, 0], '11': [3, 3] },
      targetCell: '00',
      estimateConfidence: 'high',
      linkedStakeholderIds: pwrStakeholders.slice(1, 3),
      linkedCaseId: null,
      linkedDecisionId: null,
      linkedNegotiationId: (state.negotiations || [])[0] ? state.negotiations[0].id : null,
      linkedGoalIds: [],
      ownerId: pwrPerson,
      realizedCell: null,
      notes: 'Unique pure Nash at (Trade, Hold); the ambitious target needs an incentive-compatible concession of ≈4 units.',
      derived: {
        verdict: 'misaligned', verdictLabel: 'Incentives misaligned', confidenceBand: 'medium',
        alignmentCost: 4, robustness: 0.2, coalitionFeasible: true, targetIsNE: false,
        issues: ['misaligned'],
        engineVersion: 'power-2026.10-v1',
      },
      history: [{ on: at(3), action: 'created', note: 'Framed the vendor negotiation as a 2x2 game' }],
      autoPropagate: true,
      createdOn: at(3), createdAt: new Date(ts(3)).toISOString(), updatedAt: new Date(ts(1)).toISOString(),
    },
    {
      id: id('power'),
      title: 'Cross-team on-call rotation',
      context: 'A joint support/platform on-call rota. Both sides prefer to agree on the same operating model; the target (weekly handover, shared runbook) is already a stable equilibrium and has been settled.',
      status: 'settled',
      players: [
        { id: 'spl', name: 'Support Pod Leads', weight: 4, stance: 'ally' },
        { id: 'samuel', name: 'Samuel (Support Lead)', weight: 3, stance: 'ally' },
        { id: 'freya', name: 'Freya (Data)', weight: 3, stance: 'neutral' },
      ],
      quotaPct: 50,
      counterpartyId: 'spl',
      strategies: { leader: ['Weekly handover', 'Ad-hoc paging'], rival: ['Shared runbook', 'Team-local rota'] },
      cells: { '00': [8, 8], '01': [0, 1], '10': [1, 0], '11': [4, 4] },
      targetCell: '00',
      estimateConfidence: 'high',
      linkedStakeholderIds: [],
      linkedCaseId: null,
      linkedDecisionId: null,
      linkedNegotiationId: null,
      linkedGoalIds: [],
      ownerId: pwrPerson,
      realizedCell: '00',
      settledOn: at(4),
      notes: 'Two pure Nash equilibria; the ambitious one is Pareto-superior and was reached via a public commitment.',
      derived: {
        verdict: 'stable', verdictLabel: 'Stable & aligned', confidenceBand: 'high',
        alignmentCost: 0, robustness: 0.5, coalitionFeasible: true, targetIsNE: true,
        issues: [],
        engineVersion: 'power-2026.10-v1',
      },
      history: [
        { on: at(9), action: 'created', note: 'Modeled the rota coordination game' },
        { on: at(4), action: 'settled', note: 'Realised outcome 00 — weekly handover adopted' },
      ],
      autoPropagate: true,
      createdOn: at(9), createdAt: new Date(ts(9)).toISOString(), updatedAt: new Date(ts(4)).toISOString(),
    },
  ];

  // ---- longitudinal history -------------------------------------------------
  //
  // The vitals engine reconstructs every metric from the dates already on the
  // records, which means a demo seeded only with this week's work would show
  // eight empty charts and one honest sentence about not having enough history.
  // So the demo carries a real past: ordinary feedback and recognition spread
  // across twenty-two weeks, written with a fixed seed so every load produces
  // exactly the same history. Nothing here is a fabricated measurement — these
  // are records of things that (in the fiction) happened, dated when they
  // happened, and the engine derives the series from them like any other.
  seedHistoricalRecords(state, now);
  state.impactStudies = seedImpactStudies(state, now);
  // Schema v50: two declared implementation plans over the demo's own dated
  // records. One is deliberately under-delivered so the delivery-repair path can
  // be exercised without inventing a failure, and one carries a contested
  // attestation so the attestation-versus-records comparison has something real
  // to compare. Nothing here fabricates a delivery: the observations are derived
  // from the feedback and 1:1 records seeded above.
  state.fidelityPlans = seedFidelityPlans(state, now);
  // Schema v51: bands and two merit cycles over the demo roster — one finalized
  // a year ago with its predictions resolved, one mid-flight and unallocated.
  const meritSeed = seedMerit(state, now);
  state.compBands = meritSeed.bands;
  state.meritCycles = meritSeed.cycles;
  // Schema v52: one finalized transition programme with a frozen snapshot and a
  // closed horizon, plus one live one-role plan over the same roster.
  state.transitionPrograms = seedTransition(state, now);
  state.commsDrafts = seedCommsDrafts(state, now);
  seedAllocation(state, now);
  seedLoad(state, now);
  seedDynamics(state, now);
  // Schema v35: anchor assumptions to the real metrics decision and two real
  // continuity dependencies, then run the real sensor rule over them.
  const premiseDecision = (state.decisions || []).find((d) => d && d.title === 'Standardise weekly metrics on warehouse tables');
  seedPremises(state, now, {
    decisionId: premiseDecision?.id || (state.decisions || [])[0]?.id || null,
    ownerA: priya,
    ownerB: mei,
    dependencyA: depSubTierId,
    dependencyB: depCloseRunbookId,
  });

  // Run it through the same normalizer every import uses, so the demo can
  // never produce a state the real app would reject.
  const normalized = normalizeState(state, { now }).state;
  seedDynamicsScan(normalized, now);
  // Schema v38: the capital ledger is seeded after the scan so its frozen
  // prediction uses the same derived baseline the real adoption path freezes.
  seedCapital(normalized, now);
  // Schema v39: run the real early-warning scan over the demo's own dated
  // records. Nothing is invented here: the scan reads the same series the app
  // reads, applies the same Benjamini–Hochberg step-up, records whatever it
  // finds (including suppressions) and freezes whatever it predicts.
  seedWatch(normalized, now);
  // Schema v42: declare the demo strategy against the demo's own goals, plan
  // items and cases — three bets of deliberately different quality, so the
  // terminal shows a graded bet, an unfalsifiable one and an overdue stop rule.
  seedStrategy(normalized, now);
  // Schema v43: three reviews over the demo's own settled case, anchored change
  // and completed work — two closed loops and one that was never closed, so the
  // Recurrence tab has a genuine finding rather than a demonstration of nothing.
  seedLearning(normalized, now);
  // Schema v47: declare the demo scorecard and freeze its prediction through the
  // same engine the commit action uses.
  seedMeasurement(normalized, now);
  // Normalize once more so the records the rule just wrote are held to exactly
  // the same contract as any other write.
  return normalizeState(normalized, { now }).state;
}

/**
 * Schema v52 — the workforce transition terminal over the demo's own records.
 *
 * Two programmes, and neither of them is a decoration:
 *
 *  - a **finalized past programme** whose snapshot was frozen by the same
 *    function the finalize action calls, taken from a reading of the demo's own
 *    dependency graph and recorded pay. Its outcome horizon has passed, so the
 *    resolved outcomes are seeded the way the rule would resolve them: the
 *    remaining cohort is still here. The calibration card therefore reports one
 *    resolved prediction and refuses to score anything on it, which is the
 *    honest small-sample case rather than a flattering one.
 *  - a **live draft**: a one-role reduction effective sixty days out, every
 *    salary known, one name marked and locked as kept. Deciding it is the
 *    demonstration — the hand-over obligation, the survivor prompt and the
 *    continuity reading all appear in the same transaction.
 *
 * The demo's five-person roster is deliberately too small for the four-fifths
 * screen: no dimension produces two groups of five, and the page says so instead
 * of printing a ratio computed on one-versus-one. `tests/app/workforce-
 * transition.test.mjs` builds a sixteen-person fixture to prove the screen and
 * the compliance repair, because a demo that lied about its own sample size
 * would be teaching the wrong lesson.
 */
function seedTransition(state, now) {
  const today = dayKey(now);
  const stampFor = (day, hour = 9) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00.000Z`).toISOString();
  const people = (state.people || []).filter((person) => person && person.status !== 'archived');
  if (!people.length) return [];
  const byName = (name) => people.find((person) => person.name === name) || null;
  const priya = byName('Priya Natarajan');
  const jordan = byName('Jordan Alvarez');
  const mei = byName('Mei Lin Chen');
  const samuel = byName('Samuel Okafor');
  const freya = byName('Freya Nilsson');
  const pool = people.map((person) => person.id);
  const row = (personId, extra = {}) => ({
    personId,
    selected: false,
    locked: false,
    group: '',
    mobility: null,
    workloadUnits: null,
    note: '',
    ...extra,
  });
  const weights = { performance: 30, capability: 25, cost: 20, tenure: 10, futureFit: 15 };

  // ---- the past programme: frozen, and its horizon has closed.
  const pastEffective = addDays(today, -400);
  const pastAsOf = new Date(`${pastEffective}T12:00:00.000Z`);
  const pastDraft = {
    id: 'transition-demo-1',
    label: 'FY25 support consolidation',
    currency: 'USD',
    kind: 'reduction',
    status: 'draft',
    declaredOn: addDays(pastEffective, -120),
    effectiveOn: pastEffective,
    dimension: 'level',
    target: { headcount: 1, costCeiling: null },
    weights,
    ownerId: priya ? priya.id : null,
    rows: [
      row(samuel ? samuel.id : pool[0], { selected: true, locked: true, mobility: 55 }),
      ...pool.filter((id) => id !== (samuel ? samuel.id : pool[0])).map((id) => row(id, { locked: true, mobility: 40 })),
    ],
    gates: [
      { key: 'decision', done: true, blocked: false, on: addDays(pastEffective, -120), recordedAt: stampFor(addDays(pastEffective, -120)), note: 'Criteria agreed with the platform lead and HR.' },
      { key: 'consultation', done: true, blocked: false, on: addDays(pastEffective, -90), recordedAt: stampFor(addDays(pastEffective, -88)), note: 'Representatives briefed; no objection recorded.' },
      { key: 'criteria-locked', done: true, blocked: false, on: addDays(pastEffective, -60), recordedAt: stampFor(addDays(pastEffective, -60)), note: 'Scoring grid circulated before any name was proposed.' },
      { key: 'notification', done: true, blocked: false, on: addDays(pastEffective, -30), recordedAt: stampFor(addDays(pastEffective, -30)), note: 'Conversation held in person, support and notice terms confirmed in writing.' },
      { key: 'handover', done: true, blocked: false, on: addDays(pastEffective, -14), recordedAt: stampFor(addDays(pastEffective, -13)), note: 'Escalation rota and vendor contacts confirmed by the successor.' },
      { key: 'last-day', done: true, blocked: false, on: pastEffective, recordedAt: stampFor(pastEffective), note: '' },
      { key: 'survivor-checkin', done: true, blocked: false, on: addDays(pastEffective, 30), recordedAt: stampFor(addDays(pastEffective, 31)), note: 'Two conversations; on-call redesign agreed as a result.' },
      { key: 'outcome-review', done: false, blocked: false, on: addDays(pastEffective, 365), recordedAt: null, note: 'Review decision is on the decisions page; the cost came in under the frozen figure.' },
    ],
    snapshot: null,
    outcomes: [],
    notes: 'One role removed after the support team was consolidated into the platform group. The hand-over was the expensive part, not the severance.',
    createdAt: stampFor(addDays(pastEffective, -120)),
    updatedAt: stampFor(pastEffective),
    history: [
      { at: stampFor(addDays(pastEffective, -120)), type: 'declared', summary: 'Declared a one-role reduction effective four hundred days ago, compared by job level.' },
      { at: stampFor(addDays(pastEffective, -120)), type: 'decided', summary: 'Criteria locked and one name agreed before any individual conversation.' },
      { at: stampFor(pastEffective), type: 'finalized', summary: 'Froze the plan and its prediction before the change.' },
    ],
  };
  const pastState = { ...state, transitionPrograms: [pastDraft] };
  const pastReading = transitionReading(pastState, pastDraft, pastAsOf, { depth: 'full' });
  pastDraft.snapshot = buildTransitionSnapshot(pastReading, {
    capturedAt: stampFor(pastEffective, 8),
    byId: priya ? priya.id : null,
    currency: 'USD',
  });
  pastDraft.status = 'finalized';
  // The horizon has closed and every named person the snapshot froze is still in
  // the roster, so the resolved outcome is a negative. That is the record the
  // rule would have written on its own scan; seeding it keeps the demo readable
  // without running automation against a half-built workspace.
  pastDraft.outcomes = (pastDraft.snapshot.predictions || [])
    .filter((prediction) => Number.isFinite(Number(prediction.departurePct)))
    .map((prediction) => ({
      personId: prediction.personId,
      on: addDays(pastEffective, 365),
      departed: false,
      selected: prediction.selected === true,
      departurePct: prediction.departurePct,
      horizonOn: addDays(pastEffective, 365),
    }));

  // ---- the live programme: one named exit, one locked retention.
  const liveEffective = addDays(today, 60);
  const named = mei ? mei.id : pool[0];
  const draft = {
    id: 'transition-demo-2',
    label: 'FY26 billing scope consolidation',
    currency: 'USD',
    kind: 'reduction',
    status: 'draft',
    declaredOn: addDays(today, -9),
    effectiveOn: liveEffective,
    dimension: 'level',
    target: { headcount: 1, costCeiling: null },
    weights,
    ownerId: priya ? priya.id : null,
    rows: pool.map((personId) => row(personId, {
      selected: personId === named,
      locked: personId === named || personId === (priya ? priya.id : ''),
      mobility: personId === named ? 72 : personId === (jordan ? jordan.id : '') ? 81 : 45,
      note: personId === named
        ? 'The billing migration has an owner on the vendor side; the technical direction is the part that has to move first.'
        : '',
    })),
    gates: [
      { key: 'decision', done: true, blocked: false, on: addDays(today, -9), recordedAt: stampFor(addDays(today, -9)), note: 'Scope agreed with finance; the migration direction is the exposed capability.' },
      { key: 'consultation', done: false, blocked: false, on: addDays(liveEffective, -90), recordedAt: null, note: '' },
      { key: 'criteria-locked', done: false, blocked: false, on: addDays(liveEffective, -60), recordedAt: null, note: '' },
      { key: 'notification', done: false, blocked: false, on: addDays(liveEffective, -30), recordedAt: null, note: '' },
      { key: 'handover', done: false, blocked: false, on: addDays(liveEffective, -14), recordedAt: null, note: '' },
      { key: 'last-day', done: false, blocked: false, on: liveEffective, recordedAt: null, note: '' },
      { key: 'survivor-checkin', done: false, blocked: false, on: addDays(liveEffective, 30), recordedAt: null, note: '' },
      { key: 'outcome-review', done: false, blocked: false, on: addDays(liveEffective, 365), recordedAt: null, note: '' },
    ],
    snapshot: null,
    outcomes: [],
    notes: 'The screen cannot run on five people. The demo says so rather than printing a ratio computed on one group of one.',
    createdAt: stampFor(addDays(today, -9)),
    updatedAt: stampFor(addDays(today, -9)),
    history: [
      { at: stampFor(addDays(today, -9)), type: 'declared', summary: 'Declared one role effective in sixty days, compared by job level, with the printed default weights.' },
      { at: stampFor(addDays(today, -8)), type: 'row', summary: 'Named one exit and locked one retention. The other rows stay open for the optimizer to fill around.' },
    ],
  };

  return [pastDraft, draft];
}
