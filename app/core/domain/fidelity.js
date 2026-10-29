/**
 * app/core/domain/fidelity.js — the Implementation Fidelity Ledger (Schema v50).
 *
 * Most leadership tooling measures *intent* (did you set the goal, open the
 * case, run the review) and then jumps straight to *outcome* (did the metric
 * move). The step in between — was the thing actually delivered, to whom, at
 * what dose, and did it keep happening? — is where most change dies. The
 * implementation-science literature calls this implementation fidelity, and it
 * is measured with named instruments rather than adjectives:
 *
 *  - RE-AIM (Glasgow, Vogt & Boles, 1999): Reach, Effectiveness, Adoption,
 *    Implementation, Maintenance. LeadOS reads only the four dimensions a local
 *    workspace can observe — reach, dose/implementation, fidelity and
 *    maintenance — and never claims adoption at a setting level it cannot see.
 *  - Carroll et al. (2007) implementation-fidelity dimensions: adherence, dose,
 *    quality of delivery, participant responsiveness, programme differentiation
 *    — plus *adaptation*, which the RE-AIM systematic reviews find is reported
 *    by only ~14% of studies. Adaptation is therefore a first-class, scored
 *    artefact here instead of a footnote.
 *  - Bloom (1984) / Imbens–Angrist LATE: when delivery is partial, the
 *    intention-to-treat effect is diluted by roughly the compliance rate, so
 *    the per-complier effect ≈ ITT / compliance. The same identity inflates the
 *    minimum detectable effect by 1/compliance. LeadOS reports the adjusted
 *    number *next to* the unadjusted one, with the assumptions named, because
 *    the adjustment is only as good as those assumptions.
 *
 * The core idea this module implements, and which this repository has not had
 * before, is *two independent readings of the same stage*:
 *
 *   1. OBSERVED — derived deterministically from dated typed records the leader
 *      already logged (1:1s, feedback, delegations, goals). No writes, no
 *      inference from free text, no scoring of any person.
 *   2. ATTESTED — a dated human judgement, with a mandatory reason whenever it
 *      disagrees with the observation.
 *
 * The disagreement between them is the product. It is the difference between
 * "we ran the programme" and "the records show we ran it", and across plans it
 * becomes a leader-level calibration statistic (overclaim rate with a Wilson
 * interval) rather than an argument.
 *
 * Nothing in this module rates a person, predicts attrition or asserts that an
 * intervention worked. It measures delivery. Delivery is not effectiveness, and
 * a rule trace is not delivery.
 */

import { addDays, dayKey, daysBetween, mean } from '../time.js';

/* ------------------------------------------------------------------ stages */

/**
 * The five scored stages. `observed` stages have a record instrument;
 * `attested` stages exist only as a dated human judgement, and saying so is
 * more honest than inventing a proxy for them.
 */
export const FIDELITY_STAGES = Object.freeze([
  {
    key: 'reach',
    label: 'Reach',
    short: 'who received it',
    question: 'How many of the intended people received at least one unit?',
    framework: 'RE-AIM — Reach (individual level)',
    weight: 0.25,
    observed: true,
    denominator: 'planned population (or the active roster when none was declared)',
    gaming: 'A small population makes reach easy to hit; the denominator is recorded at declaration, not after the fact.',
  },
  {
    key: 'dose',
    label: 'Dose delivered',
    short: 'how much landed',
    question: 'How many units were actually delivered against the planned number?',
    framework: 'RE-AIM — Implementation; Carroll — dose delivered',
    weight: 0.3,
    observed: true,
    denominator: 'units planned at declaration',
    gaming: 'Splitting one conversation into three logged units raises the ratio; the unit definition is the one you declared.',
  },
  {
    key: 'fidelity',
    label: 'Delivery quality',
    short: 'delivered as designed',
    question: 'Of the units delivered, how many met the standard recorded in the plan?',
    framework: 'Carroll — adherence & quality of delivery',
    weight: 0.25,
    observed: true,
    denominator: 'units delivered in the window',
    gaming: 'The standard (for example a complete Situation–Behaviour–Impact note) is structural, not a self-rating.',
  },
  {
    key: 'sustain',
    label: 'Maintenance',
    short: 'still happening at the end',
    question: 'Was the behaviour still occurring in the final fortnight of the window?',
    framework: 'RE-AIM — Maintenance',
    weight: 0.1,
    observed: true,
    denominator: 'people reached',
    gaming: 'One heroic final week cannot substitute for a sustained cadence, because the window is fixed at declaration.',
  },
  {
    key: 'adaptation',
    label: 'Adaptation',
    short: 'what you changed, and why',
    question: 'Did you record what was changed from the original design, and why?',
    framework: 'Carroll — adaptation; the least-reported RE-AIM element',
    weight: 0.1,
    observed: false,
    denominator: 'one dated human record',
    gaming: 'Documenting an adaptation is not a claim that it was better. It is a claim that the next leader can learn from it.',
  },
]);

export const FIDELITY_STAGE_KEYS = Object.freeze(FIDELITY_STAGES.map((s) => s.key));
export const FIDELITY_STAGE_BY_KEY = Object.freeze(Object.fromEntries(FIDELITY_STAGES.map((s) => [s.key, s])));

/** Attestation verdicts. Deliberately coarse: three labels, not seven. */
export const FIDELITY_VERDICTS = Object.freeze(['met', 'partial', 'not-met']);
export const FIDELITY_VERDICT_LABELS = Object.freeze({
  met: 'Met',
  partial: 'Partly met',
  'not-met': 'Not met',
});
/** Score assigned to a human verdict when no record instrument exists. */
export const FIDELITY_VERDICT_SCORE = Object.freeze({ met: 1, partial: 0.5, 'not-met': 0 });

export const FIDELITY_STATUSES = Object.freeze(['active', 'settled', 'abandoned']);
export const FIDELITY_STATUS_LABELS = Object.freeze({
  active: 'Active',
  settled: 'Settled',
  abandoned: 'Abandoned',
});

/**
 * Derived grades. `insufficient` is not a low score — it is a refusal to grade
 * a plan whose evidence covers less than the declared share of the model, which
 * is exactly the reporting gap the RE-AIM reviews keep finding.
 */
export const FIDELITY_GRADES = Object.freeze({
  strong: { id: 'strong', label: 'Delivered as designed', tone: 'good' },
  adequate: { id: 'adequate', label: 'Delivered with gaps', tone: 'neutral' },
  thin: { id: 'thin', label: 'Thin delivery', tone: 'warn' },
  weak: { id: 'weak', label: 'Largely undelivered', tone: 'warn' },
  insufficient: { id: 'insufficient', label: 'Not enough evidence to grade', tone: 'warn' },
});

/** A plan needs this share of the model's weight on record before it is graded. */
export const FIDELITY_MIN_COVERAGE = 0.6;
/** Below this exposure the intervention was materially under-delivered. */
export const FIDELITY_UNDEREXPOSED = 0.6;
/** Observed ratio at or above this counts as "clearly met" for agreement. */
export const FIDELITY_MET_FLOOR = 0.8;
/** Observed ratio at or below this counts as "clearly not met". */
export const FIDELITY_NOT_MET_CEILING = 0.5;
/** Overclaim/underclaim statistics are withheld below this many verdicts. */
export const FIDELITY_CALIBRATION_MIN = 3;
/** Sustained activity is read over the final fortnight of the window. */
export const FIDELITY_SUSTAIN_DAYS = 14;

/* -------------------------------------------------------------- instruments */

const ACTIVE_PERSON = (p) => p && p.status !== 'archived';

function activePeople(state) {
  return (state?.people || []).filter(ACTIVE_PERSON);
}

function inWindow(day, start, end) {
  return typeof day === 'string' && day.length === 10 && day >= start && day <= end;
}

function sbiComplete(record) {
  return Boolean(
    String(record?.situation || '').trim()
    && String(record?.behavior || '').trim()
    && String(record?.impact || '').trim(),
  );
}

function hasAnyCheckin(record) {
  return Array.isArray(record?.checkins) && record.checkins.length > 0;
}

function keyResultMoved(record) {
  return (record?.keyResults || []).some((kr) => {
    if (!kr) return false;
    const start = Number(kr.start);
    const current = Number(kr.current);
    return Number.isFinite(start) && Number.isFinite(current) && start !== current;
  });
}

/**
 * The record instruments. Each one answers the same three questions from one
 * typed collection: which dated units were delivered, who received one, and
 * whether the unit met a structural standard.
 *
 * A type without an instrument is not a gap to be papered over: the plan still
 * works, its observed stages read as "no record instrument" and the leader
 * attests them directly. That distinction is shown in the UI rather than
 * silently substituted with a plausible-looking number.
 */
export const FIDELITY_INSTRUMENTS = Object.freeze({
  oneonone: {
    label: '1:1 conversations',
    unit: 'held 1:1',
    standard: 'the 1:1 carries written notes',
    source: 'collection',
    collect(state, plan) {
      return (state?.oneOnOnes || [])
        .filter((row) => row && row.status !== 'scheduled' && inWindow(row.date, plan.windowStart, plan.windowEnd))
        .map((row) => ({
          id: row.id,
          on: row.date,
          personId: row.personId || null,
          meetsStandard: Boolean(String(row.notes || '').trim()),
        }));
    },
  },
  feedback: {
    label: 'Feedback records',
    unit: 'feedback note given',
    standard: 'the note is a complete Situation–Behaviour–Impact (SBI) record',
    source: 'collection',
    collect(state, plan) {
      return (state?.feedback || [])
        .filter((row) => row && row.direction !== 'received' && inWindow(row.date, plan.windowStart, plan.windowEnd))
        .map((row) => ({
          id: row.id,
          on: row.date,
          personId: row.personId || null,
          meetsStandard: sbiComplete(row),
        }));
    },
  },
  delegation: {
    label: 'Delegations',
    unit: 'delegation with a check-in',
    standard: 'the delegation carries at least one dated check-in',
    source: 'collection',
    collect(state, plan) {
      return (state?.delegations || [])
        .filter((row) => row && inWindow(row.delegatedOn, plan.windowStart, plan.windowEnd))
        .map((row) => ({
          id: row.id,
          on: row.delegatedOn,
          personId: row.personId || null,
          meetsStandard: hasAnyCheckin(row) || Boolean(row.completedOn),
        }));
    },
  },
  goal: {
    label: 'Goals',
    unit: 'goal moved',
    standard: 'at least one key result has moved off its starting value',
    source: 'collection',
    collect(state, plan) {
      return (state?.goals || [])
        .filter((row) => row && inWindow(dayKey(row.createdAt) || row.createdAt, plan.windowStart, plan.windowEnd))
        .map((row) => ({
          id: row.id,
          on: dayKey(row.createdAt) || row.createdAt,
          personId: row.ownerId || null,
          meetsStandard: keyResultMoved(row),
        }));
    },
  },
});

/** Resolve the instrument for an intervention type, or `null` honestly. */
export function fidelityInstrumentFor(interventionType) {
  return FIDELITY_INSTRUMENTS[interventionType] || null;
}

/** Human description of what this intervention type can be measured from. */
export function instrumentDescription(interventionType) {
  const instrument = fidelityInstrumentFor(interventionType);
  if (!instrument) return null;
  return {
    label: instrument.label,
    unit: instrument.unit,
    standard: instrument.standard,
  };
}

/* ------------------------------------------------------------- plan helpers */

export function planPopulation(state, plan) {
  const declared = Number(plan?.population);
  if (Number.isFinite(declared) && declared > 0) {
    return { value: Math.round(declared), source: 'declared' };
  }
  const roster = activePeople(state).length;
  return { value: roster, source: roster > 0 ? 'roster' : 'none' };
}

export function planPlannedUnits(plan) {
  const declared = Number(plan?.plannedUnits);
  return Number.isFinite(declared) && declared > 0 ? Math.round(declared) : null;
}

/**
 * The default number of units a plan of this type should plan for: one per
 * person per week of the window is the *cadence* convention, and a leader who
 * wants a different dose declares it. This is a starting value in a form, never
 * a fact recorded behind their back.
 */
export function suggestedPlannedUnits(population, windowStart, windowEnd) {
  const days = Math.max(1, daysBetween(windowStart, windowEnd) ?? 1);
  const weeks = Math.max(1, Math.round(days / 7));
  const people = Math.max(1, Number(population) || 1);
  return Math.min(5000, Math.max(1, people * weeks));
}

/** Default dated targets for the five stages across a declared window. */
export function defaultStageTargets(windowStart, windowEnd) {
  const start = dayKey(windowStart);
  const end = dayKey(windowEnd);
  if (!start || !end) return [];
  const span = Math.max(0, daysBetween(start, end) ?? 0);
  const at = (fraction) => addDays(start, Math.round(span * fraction));
  return [
    { key: 'reach', targetOn: at(0.5) },
    { key: 'dose', targetOn: end },
    { key: 'fidelity', targetOn: end },
    { key: 'sustain', targetOn: end },
    { key: 'adaptation', targetOn: end },
  ];
}

/* -------------------------------------------------------------- observation */

function ratio(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return Math.max(0, Math.min(1, numerator / denominator));
}

function pct(value) {
  return value === null || value === undefined ? null : Math.round(value * 1000) / 10;
}

/**
 * Derive every observed stage for one plan from the workspace. Pure: it reads,
 * it never writes, and it is the same function the rule, the view, the CSV
 * export and the settlement freeze all call, so no two surfaces can disagree.
 */
export function observeFidelity(plan, state = {}, now = new Date()) {
  const instrument = fidelityInstrumentFor(plan?.interventionType);
  const population = planPopulation(state, plan);
  const plannedUnits = planPlannedUnits(plan);
  const start = plan?.windowStart;
  const end = plan?.windowEnd;
  const today = dayKey(now) || end;

  const units = instrument ? instrument.collect(state, plan) : [];
  const reachedIds = new Set(units.map((u) => u.personId).filter((id) => typeof id === 'string' && id));
  const sustainStart = end ? addDays(end, -(FIDELITY_SUSTAIN_DAYS - 1)) : null;
  const sustainedIds = new Set(
    units
      .filter((u) => sustainStart && u.on >= sustainStart && u.on <= end)
      .map((u) => u.personId)
      .filter((id) => typeof id === 'string' && id),
  );
  const unitsMeetingStandard = units.filter((u) => u.meetsStandard).length;

  const observedByKey = {
    reach: instrument && population.value > 0
      ? {
        numerator: reachedIds.size,
        denominator: population.value,
        unit: 'people',
        detail: `${reachedIds.size} of ${population.value} intended people received at least one ${instrument.unit}`,
      }
      : null,
    dose: instrument && plannedUnits
      ? {
        numerator: units.length,
        denominator: plannedUnits,
        unit: instrument.unit,
        detail: `${units.length} of ${plannedUnits} planned ${instrument.unit}${units.length === 1 ? '' : 's'} logged by ${today}`,
      }
      : null,
    fidelity: instrument && units.length
      ? {
        numerator: unitsMeetingStandard,
        denominator: units.length,
        unit: 'units',
        detail: `${unitsMeetingStandard} of ${units.length} delivered units met the declared standard (${instrument.standard})`,
      }
      : null,
    sustain: instrument && reachedIds.size
      ? {
        numerator: sustainedIds.size,
        denominator: reachedIds.size,
        unit: 'people',
        detail: `${sustainedIds.size} of ${reachedIds.size} reached people had activity in the final ${FIDELITY_SUSTAIN_DAYS} days`,
      }
      : null,
    adaptation: null,
  };

  const stageRows = FIDELITY_STAGES.map((stage) => {
    const observedRaw = observedByKey[stage.key];
    const observedRatio = observedRaw ? ratio(observedRaw.numerator, observedRaw.denominator) : null;
    const attested = plan?.stages?.find((row) => row && row.key === stage.key)?.attested || null;
    const attestedScore = attested && FIDELITY_VERDICTS.includes(attested.verdict)
      ? FIDELITY_VERDICT_SCORE[attested.verdict]
      : null;
    let score = null;
    let source = 'none';
    if (observedRatio !== null) {
      score = observedRatio;
      source = 'records';
    } else if (stage.key === 'adaptation' && attestedScore !== null) {
      score = attestedScore;
      source = 'attestation';
    } else if (attestedScore !== null) {
      // No instrument for this type: the human reading is the only reading, and
      // it is labelled as such rather than passed off as observation.
      score = attestedScore;
      source = 'attestation';
    }
    return {
      key: stage.key,
      label: stage.label,
      weight: stage.weight,
      observed: observedRatio !== null
        ? {
          pct: pct(observedRatio),
          numerator: observedRaw.numerator,
          denominator: observedRaw.denominator,
          unit: observedRaw.unit,
          detail: observedRaw.detail,
        }
        : null,
      attested: attested && FIDELITY_VERDICTS.includes(attested.verdict)
        ? {
          verdict: attested.verdict,
          label: FIDELITY_VERDICT_LABELS[attested.verdict],
          on: attested.on || null,
          note: attested.note || '',
          byId: attested.byId || null,
        }
        : null,
      score,
      source,
      agreement: observedRatio !== null && attestedScore !== null
        ? stageAgreement(observedRatio, attested.verdict)
        : 'unverifiable',
    };
  });

  const evidenced = stageRows.filter((row) => row.score !== null);
  const evidencedWeight = evidenced.reduce((acc, row) => acc + row.weight, 0);
  const totalWeight = FIDELITY_STAGES.reduce((acc, stage) => acc + stage.weight, 0);
  const coverage = totalWeight > 0 ? Math.round((evidencedWeight / totalWeight) * 1000) / 1000 : 0;
  const index = evidencedWeight > 0
    ? Math.round((evidenced.reduce((acc, row) => acc + row.weight * row.score, 0) / evidencedWeight) * 1000) / 1000
    : null;

  const component = (key) => (stageRows.find((row) => row.key === key)?.score ?? null);
  const reachRatio = component('reach');
  const doseRatio = component('dose');
  const fidelityRatio = component('fidelity');
  // Dose received = who it reached × how much of the planned dose × how much of
  // that was delivered as designed. This is the compliance term in Bloom's
  // identity, and it is deliberately multiplicative: 50% reach and 50% fidelity
  // is a quarter of the intended exposure, not a half.
  const exposure = reachRatio !== null && doseRatio !== null && fidelityRatio !== null
    ? Math.round(reachRatio * doseRatio * fidelityRatio * 1000) / 1000
    : null;

  return {
    planId: plan?.id || null,
    interventionType: plan?.interventionType || 'other',
    instrument: instrument
      ? { id: plan.interventionType, ...instrumentDescription(plan.interventionType) }
      : null,
    instrumentMissingReason: instrument
      ? null
      : 'No dated record instrument exists for this intervention type, so every stage is human-attested. Nothing is inferred from titles or free text.',
    population,
    plannedUnits,
    window: { start, end, today, days: start && end ? Math.max(0, daysBetween(start, end) ?? 0) : null },
    unitCount: units.length,
    reachedCount: reachedIds.size,
    stages: stageRows,
    coverage,
    index,
    grade: fidelityGrade(index, coverage, exposure),
    exposure,
    exposurePct: pct(exposure),
    components: {
      reachPct: pct(reachRatio),
      dosePct: pct(doseRatio),
      fidelityPct: pct(fidelityRatio),
      sustainPct: pct(component('sustain')),
    },
    underExposed: exposure !== null ? exposure < FIDELITY_UNDEREXPOSED : null,
    disagreements: stageRows.filter((row) => row.agreement === 'optimistic' || row.agreement === 'conservative'),
    weakestStage: worstStage(stageRows),
    settled: Boolean(plan?.settlement),
    settlement: plan?.settlement || null,
  };
}

function worstStage(stageRows) {
  const scored = stageRows.filter((row) => row.score !== null);
  if (!scored.length) return null;
  return [...scored].sort((a, b) => (a.score - b.score) || (b.weight - a.weight))[0];
}

export function fidelityGrade(index, coverage, exposure = null) {
  if (index === null || coverage === null || coverage < FIDELITY_MIN_COVERAGE) return FIDELITY_GRADES.insufficient;
  // A plan cannot be graded "delivered as designed" while the multiplied
  // exposure says three quarters of the intended dose never landed. The index
  // averages stages; exposure compounds them, and the lower of the two wins.
  const capped = exposure !== null && exposure < FIDELITY_UNDEREXPOSED;
  if (index >= 0.75) return capped ? FIDELITY_GRADES.adequate : FIDELITY_GRADES.strong;
  if (index >= 0.55) return capped && exposure < 0.35 ? FIDELITY_GRADES.thin : FIDELITY_GRADES.adequate;
  if (index >= 0.35) return FIDELITY_GRADES.thin;
  return FIDELITY_GRADES.weak;
}

/**
 * Compare a human verdict against the record reading.
 *
 * 'optimistic' means the person reported more delivery than their own records
 * show. It is not an accusation: a 1:1 that really happened but was never
 * logged produces exactly this pattern, and that is a useful thing to discover.
 * The UI says so in those words.
 */
export function stageAgreement(observedRatio, verdict) {
  if (observedRatio === null || !FIDELITY_VERDICTS.includes(verdict)) return 'unverifiable';
  if (verdict === 'met') {
    if (observedRatio >= FIDELITY_MET_FLOOR) return 'concordant';
    if (observedRatio <= FIDELITY_NOT_MET_CEILING) return 'optimistic';
    return 'lenient';
  }
  if (verdict === 'not-met') {
    if (observedRatio <= FIDELITY_NOT_MET_CEILING) return 'concordant';
    if (observedRatio >= FIDELITY_MET_FLOOR) return 'conservative';
    return 'strict';
  }
  return observedRatio >= FIDELITY_NOT_MET_CEILING && observedRatio <= FIDELITY_MET_FLOOR
    ? 'concordant'
    : 'mismatched';
}

export const AGREEMENT_LABELS = Object.freeze({
  concordant: 'Agrees with the records',
  optimistic: 'Claims more delivery than the records show',
  conservative: 'Claims less delivery than the records show',
  lenient: 'Somewhat more generous than the records',
  strict: 'Somewhat stricter than the records',
  mismatched: 'Does not line up with the records',
  unverifiable: 'No record instrument — human reading only',
});

/* ------------------------------------------------- implementation statistics */

/** Wilson score interval at 95% — stable at small n, unlike the normal approximation. */
export function wilsonInterval(successes, n, z = 1.959964) {
  if (!Number.isFinite(n) || n <= 0) return null;
  const p = Math.max(0, Math.min(1, successes / n));
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return {
    pct: Math.round(p * 1000) / 10,
    lowPct: Math.round(Math.max(0, centre - half) * 1000) / 10,
    highPct: Math.round(Math.min(1, centre + half) * 1000) / 10,
  };
}

/**
 * Bloom/LATE adjustment, reported as a pair of numbers and never as a verdict.
 *
 * The identity per-complier effect ≈ ITT / compliance holds under one-sided
 * non-compliance with an exclusion restriction and monotonicity. A leader who
 * logs their own delivery violates neither automatically, but they are not
 * randomised, so the adjusted figure is an *order-of-magnitude correction for
 * dilution*, not a causal estimate. The UI must say that, and the numbers are
 * withheld below a compliance floor rather than exploding toward infinity.
 */
export function implementationEffect(reading, evaluation) {
  const compliance = reading?.exposure ?? null;
  // An evaluation that could not fit a counterfactual has no point estimate.
  // Carrying its placeholder zero forward would let the interface print "0.00
  // effect, diluted to 0.00" about a window that was never measured, which is
  // the exact fabrication this module exists to refuse.
  const measured = evaluation?.ok !== false;
  const itt = measured && Number.isFinite(Number(evaluation?.estimate)) ? Number(evaluation.estimate) : null;
  const mde = measured && Number.isFinite(Number(evaluation?.its?.mde)) ? Number(evaluation.its.mde) : null;
  if (compliance === null || compliance <= 0) {
    return {
      available: false,
      reason: 'The plan has no complete reach × dose × quality reading, so the intention-to-treat effect cannot be adjusted for dilution.',
      compliancePct: null,
      itt,
      perComplier: null,
      mde,
      perComplierMde: null,
      dilutionFactor: null,
      underExposed: null,
    };
  }
  const floor = 0.1;
  if (compliance < floor) {
    return {
      available: false,
      reason: `Measured exposure is ${pct(compliance)}%. Below ${Math.round(floor * 100)}% the Bloom adjustment is numerically meaningless — it would divide by almost nothing. The honest reading is that the intervention was barely delivered.`,
      compliancePct: pct(compliance),
      itt,
      perComplier: null,
      mde,
      perComplierMde: null,
      dilutionFactor: null,
      underExposed: true,
    };
  }
  const dilutionFactor = Math.round((1 / compliance) * 100) / 100;
  return {
    available: true,
    reason: null,
    compliancePct: pct(compliance),
    itt,
    perComplier: itt === null ? null : Math.round((itt / compliance) * 10000) / 10000,
    mde,
    perComplierMde: mde === null ? null : Math.round((mde / compliance) * 10000) / 10000,
    dilutionFactor,
    underExposed: compliance < FIDELITY_UNDEREXPOSED,
    assumptions: [
      'One-sided non-compliance: nobody outside the plan received the intervention.',
      'Exclusion restriction: delivery affects the outcome only through the intervention itself.',
      'Monotonicity: nobody would have been delivered to *because* they were not in the plan.',
      'The delivery reading is self-recorded, so this corrects for dilution — it does not remove confounding.',
    ],
  };
}

/* ------------------------------------------------------------- attestation bias */

/**
 * Leader-level calibration: when you say a stage was met, how often do your own
 * records agree? Withheld below FIDELITY_CALIBRATION_MIN verdicts, because a
 * two-observation rate is a story, not a measurement.
 */
export function attestationBias(readings) {
  let overclaims = 0;
  let underclaims = 0;
  let concordant = 0;
  let graded = 0;
  let lenient = 0;
  let strict = 0;
  for (const reading of readings || []) {
    for (const stage of reading?.stages || []) {
      if (stage.agreement === 'unverifiable') continue;
      graded += 1;
      if (stage.agreement === 'optimistic') overclaims += 1;
      else if (stage.agreement === 'conservative') underclaims += 1;
      else if (stage.agreement === 'concordant') concordant += 1;
      else if (stage.agreement === 'lenient') lenient += 1;
      else if (stage.agreement === 'strict') strict += 1;
    }
  }
  const measurable = graded >= FIDELITY_CALIBRATION_MIN;
  return {
    graded,
    overclaims,
    underclaims,
    concordant,
    lenient,
    strict,
    measurable,
    minSamples: FIDELITY_CALIBRATION_MIN,
    concordancePct: graded ? Math.round((concordant / graded) * 1000) / 10 : null,
    overclaim: graded ? wilsonInterval(overclaims, graded) : null,
    underclaim: graded ? wilsonInterval(underclaims, graded) : null,
    note: measurable
      ? 'Over- and under-claiming are counted on record-verifiable stage verdicts only. A high over-claim rate is most often an unlogged-behaviour problem, not a dishonesty problem.'
      : `Attestation calibration needs at least ${FIDELITY_CALIBRATION_MIN} record-verifiable verdicts. Fewer than that is an anecdote.`,
  };
}

/* --------------------------------------------------------------- portfolio */

/**
 * The full read model: every plan, its derived reading, and the portfolio-level
 * statistics. Plans are ordered by what needs attention first — overdue stage,
 * disagreement, then low index — because a ledger sorted by creation date is a
 * filing cabinet, not a control surface.
 */
export function fidelityPortfolio(state = {}, now = new Date()) {
  const plans = (state.fidelityPlans || []).filter((plan) => plan && typeof plan === 'object');
  const today = dayKey(now);
  const rows = plans.map((plan) => {
    const reading = observeFidelity(plan, state, now);
    const overdue = (plan.stages || []).filter((stage) => {
      if (!stage || !stage.targetOn || stage.attested) return false;
      if (plan.status !== 'active') return false;
      return stage.targetOn < today;
    });
    const study = plan.studyId
      ? (state.impactStudies || []).find((row) => row && row.id === plan.studyId) || null
      : null;
    return {
      plan,
      reading,
      study,
      overdueStages: overdue,
      attention: (overdue.length ? 2 : 0)
        + (reading.disagreements.length ? 1 : 0)
        + (reading.underExposed ? 1 : 0),
    };
  }).sort((a, b) => (b.attention - a.attention) || String(a.plan.title).localeCompare(String(b.plan.title)));

  const active = rows.filter((row) => row.plan.status === 'active');
  const settled = rows.filter((row) => row.plan.status === 'settled');
  const bias = attestationBias(rows.filter((row) => row.plan.status !== 'abandoned').map((row) => row.reading));

  // A portfolio index is only meaningful if it is weighted the same way the
  // per-plan index is: by evidenced weight, not by plan count.
  const gradeable = rows.filter((row) => row.reading.index !== null
    && row.plan.status !== 'abandoned'
    && row.reading.coverage >= FIDELITY_MIN_COVERAGE);
  const portfolioIndex = gradeable.length
    ? Math.round((gradeable.reduce((acc, row) => acc + row.reading.index, 0) / gradeable.length) * 1000) / 1000
    : null;

  const stageMeans = FIDELITY_STAGES.map((stage) => {
    const values = rows
      .filter((row) => row.plan.status !== 'abandoned')
      .map((row) => row.reading.stages.find((s) => s.key === stage.key)?.score)
      .filter((v) => typeof v === 'number');
    return {
      key: stage.key,
      label: stage.label,
      n: values.length,
      mean: values.length ? Math.round(mean(values) * 1000) / 1000 : null,
      meanPct: values.length ? pct(mean(values)) : null,
    };
  }).filter((row) => row.n > 0);
  const weakest = [...stageMeans].sort((a, b) => a.mean - b.mean)[0] || null;

  return {
    generatedFor: today,
    rows,
    counts: {
      total: rows.length,
      active: active.length,
      settled: settled.length,
      abandoned: rows.length - active.length - settled.length,
      overdue: rows.filter((row) => row.overdueStages.length).length,
      disagreeing: rows.filter((row) => row.reading.disagreements.length).length,
      underExposed: rows.filter((row) => row.reading.underExposed).length,
      gradeable: gradeable.length,
    },
    portfolioIndex,
    portfolioIndexPct: pct(portfolioIndex),
    portfolioGrade: fidelityGrade(portfolioIndex, gradeable.length ? 1 : 0),
    stageMeans,
    weakestStage: weakest,
    bias,
    instrumentsAvailable: Object.keys(FIDELITY_INSTRUMENTS),
    instrumentedTypes: Object.keys(FIDELITY_INSTRUMENTS).length,
    notes: [
      'Every observed stage is derived from dated typed records the leader already keeps. Nothing is read from free text, and no person is scored.',
      'Delivery is not effectiveness. A plan can score 100% and the intervention still fail, and the Impact Ledger is where that is decided.',
    ],
  };
}

/* ---------------------------------------------------------------- signals */

/**
 * FID-01..05 on the shared insight surface. Severity encodes consequence, not
 * enthusiasm: an ungraded plan is a 2, a materially under-delivered programme
 * that a leader believes landed is a 4.
 */
export function fidelitySignals(state = {}, now = new Date()) {
  const report = fidelityPortfolio(state, now);
  const signals = [];

  for (const row of report.rows.filter((r) => r.plan.status === 'active').slice(0, 3)) {
    const reading = row.reading;
    if (reading.grade.id === 'insufficient' && reading.instrument) {
      signals.push({
        ruleId: 'FID-01',
        domain: 'Implementation fidelity',
        title: `“${row.plan.title}” cannot be graded yet`,
        detail: `Only ${Math.round(reading.coverage * 100)}% of the fidelity model has evidence, and the floor is ${Math.round(FIDELITY_MIN_COVERAGE * 100)}%. Usually this means a planned denominator was left blank or nothing has been delivered in the window yet. Either way the ledger will not print a score it cannot defend.`,
        severity: 2,
        confidence: 'high',
        evidence: [
          reading.instrumentMissingReason || `Observed from ${reading.instrument.unit} records`,
          `${reading.unitCount} unit(s) in the window · ${reading.population.value} intended people (${reading.population.source})`,
        ],
        action: { label: 'Open the plan', route: `#/fidelity?plan=${encodeURIComponent(row.plan.id)}` },
      });
    }
  }

  for (const row of report.rows.filter((r) => r.plan.status === 'active' && r.overdueStages.length).slice(0, 3)) {
    signals.push({
      ruleId: 'FID-02',
      domain: 'Implementation fidelity',
      title: `${row.overdueStages.length} fidelity checkpoint${row.overdueStages.length === 1 ? '' : 's'} passed without a reading on “${row.plan.title}”`,
      detail: `The ${row.overdueStages.map((s) => FIDELITY_STAGE_BY_KEY[s.key]?.label.toLowerCase() || s.key).join(', ')} checkpoint${row.overdueStages.length === 1 ? '' : 's'} came due and nobody attested. An unattested checkpoint is not a failure — it is a missing reading, and missing readings are how a programme quietly stops existing.`,
      severity: 3,
      confidence: 'high',
      evidence: row.overdueStages.slice(0, 3).map((s) => `${FIDELITY_STAGE_BY_KEY[s.key]?.label || s.key}: due ${s.targetOn}`),
      action: { label: 'Attest the checkpoint', route: `#/fidelity?plan=${encodeURIComponent(row.plan.id)}` },
    });
  }

  for (const row of report.rows.filter((r) => r.reading.disagreements.length).slice(0, 3)) {
    const worst = row.reading.disagreements[0];
    signals.push({
      ruleId: 'FID-03',
      domain: 'Implementation fidelity',
      title: `Your account of “${row.plan.title}” differs from the records on ${FIDELITY_STAGE_BY_KEY[worst.key]?.label.toLowerCase()}`,
      detail: `${AGREEMENT_LABELS[worst.agreement] || 'The two readings differ'}: you attested “${worst.attested?.label}” while the records show ${worst.observed?.pct}% (${worst.observed?.detail}). The most common cause is real work that was never logged, which is itself worth fixing before the next review.`,
      severity: 3,
      confidence: 'high',
      evidence: [
        worst.observed?.detail || '',
        worst.attested?.note ? `Your note: ${worst.attested.note.slice(0, 160)}` : 'No note was recorded with the attestation.',
      ].filter(Boolean),
      action: { label: 'Review the disagreement', route: `#/fidelity?plan=${encodeURIComponent(row.plan.id)}` },
    });
  }

  const under = report.rows.filter((r) => r.reading.underExposed && r.plan.status !== 'abandoned');
  if (under.length) {
    const worst = [...under].sort((a, b) => (a.reading.exposure ?? 1) - (b.reading.exposure ?? 1))[0];
    signals.push({
      ruleId: 'FID-04',
      domain: 'Implementation fidelity',
      title: `${under.length} programme${under.length === 1 ? '' : 's'} where what landed was materially less than what was planned`,
      detail: `Lowest: “${worst.plan.title}” at ${worst.reading.exposurePct}% measured exposure (reach ${worst.reading.components.reachPct ?? '—'}% × dose ${worst.reading.components.dosePct ?? '—'}% × quality ${worst.reading.components.fidelityPct ?? '—'}%). Before reading any outcome on this programme, read this: an under-delivered intervention that shows no effect has not failed. It has not been tested.`,
      severity: 4,
      confidence: 'high',
      evidence: [
        `Exposure ${worst.reading.exposurePct}% against the ${Math.round(FIDELITY_UNDEREXPOSED * 100)}% floor`,
        `Weakest stage: ${worst.reading.weakestStage?.label || '—'}`,
      ],
      action: { label: 'Open the fidelity ledger', route: '#/fidelity' },
    });
  }

  if (report.bias.measurable && report.bias.overclaim && report.bias.overclaim.pct >= 25) {
    signals.push({
      ruleId: 'FID-05',
      domain: 'Implementation fidelity',
      title: `Your attested delivery runs ahead of your records ${report.bias.overclaim.pct}% of the time`,
      detail: `Across ${report.bias.graded} record-verifiable stage verdicts, ${report.bias.overclaims} claimed more delivery than the records support (95% interval ${report.bias.overclaim.lowPct}–${report.bias.overclaim.highPct}%). This is a calibration finding about a habit, not a character judgement — and the cheapest fix is usually logging the work you already do.`,
      severity: 3,
      confidence: 'medium',
      evidence: [
        `Over-claim ${report.bias.overclaim.pct}% · under-claim ${report.bias.underclaim?.pct ?? 0}%`,
        `Concordant with records: ${report.bias.concordancePct}% of ${report.bias.graded}`,
      ],
      action: { label: 'See the calibration', route: '#/fidelity?tab=calibration' },
    });
  }

  return signals;
}

/* ------------------------------------------------------------------- brief */

/**
 * A deterministic, citable summary. Same records in, same lines out — no
 * generation, no adjectives that could not be checked.
 */
export function buildFidelityBrief(state = {}, now = new Date()) {
  const report = fidelityPortfolio(state, now);
  const lines = [];
  const add = (line) => lines.push(line);
  add(`IMPLEMENTATION FIDELITY — ${report.generatedFor}`);
  add(`Plans on record: ${report.counts.total} (${report.counts.active} active, ${report.counts.settled} settled). Gradeable: ${report.counts.gradeable}.`);
  add(`Portfolio fidelity index: ${report.portfolioIndexPct === null ? 'not gradeable — insufficient evidence' : `${report.portfolioIndexPct}%`}.`);
  if (report.weakestStage) {
    add(`Weakest stage across the portfolio: ${report.weakestStage.label} at ${report.weakestStage.meanPct}% (n=${report.weakestStage.n}).`);
  }
  add(`Overdue checkpoints: ${report.counts.overdue} plan(s). Attested-versus-recorded disagreements: ${report.counts.disagreeing} plan(s).`);
  add(`Materially under-delivered: ${report.counts.underExposed} plan(s), against a ${Math.round(FIDELITY_UNDEREXPOSED * 100)}% exposure floor.`);
  if (report.bias.measurable) {
    add(`Attestation calibration: ${report.bias.concordancePct}% of ${report.bias.graded} record-verifiable verdicts agree; over-claim ${report.bias.overclaim.pct}% (95% CI ${report.bias.overclaim.lowPct}–${report.bias.overclaim.highPct}%).`);
  } else {
    add(`Attestation calibration: withheld — ${report.bias.graded} of ${FIDELITY_CALIBRATION_MIN} required record-verifiable verdicts.`);
  }
  add('');
  add('This measures delivery, not effectiveness. No claim is made that a delivered intervention worked; that question belongs to the Impact Ledger, and a rule trace is never counted as delivery.');
  return lines.join('\n');
}

/* ------------------------------------------------------------------- guards */

/**
 * A stage is "overdue" when its declared checkpoint passed and no human has
 * attested. Time alone never settles a plan: the clock can create a reminder,
 * it cannot create a reading.
 */
export function overdueStages(plan, now = new Date()) {
  const today = dayKey(now);
  if (!plan || plan.status !== 'active') return [];
  return (plan.stages || []).filter((stage) => stage
    && stage.targetOn
    && !stage.attested
    && stage.targetOn < today);
}

/** The stage a leader should fix first, without inventing a priority score. */
export function remediationStage(reading) {
  if (!reading) return null;
  const scored = reading.stages.filter((row) => row.score !== null && row.key !== 'adaptation');
  if (!scored.length) {
    return reading.stages.find((row) => row.key === 'adaptation' && !row.attested)
      || FIDELITY_STAGES.find((stage) => stage.key === 'adaptation');
  }
  const worst = [...scored].sort((a, b) => (a.score - b.score) || (b.weight - a.weight))[0];
  return FIDELITY_STAGE_BY_KEY[worst.key] || null;
}
