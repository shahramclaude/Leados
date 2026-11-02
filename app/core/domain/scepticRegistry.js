/**
 * app/core/domain/scepticRegistry.js — leaf vocabulary for the Cross-Examination
 * Terminal (Schema v81, ADR-0074).
 *
 * Zero imports, so `schema.js`, `sceptic.js`, `scepticRules.js`,
 * `propagationContracts.js`, `csv.js`, `insights.js` and `cases.js` share one
 * canonical vocabulary without a circular dependency.
 *
 * THE QUESTION THIS TERMINAL ANSWERS
 * ----------------------------------
 * Every other surface in this workspace reports on the leader's *record*. This
 * one argues against it. Ninety screens compute what the record says; none of
 * them asks the only question an auditor would ask first: **which of the
 * statements on file does the rest of the record contradict, and how often is
 * this thing right when it says so?**
 *
 * A first-time leader's most expensive error is not a wrong decision. It is a
 * claim that was never cross-examined — a goal marked done with no observation
 * behind it, a rating with no evidence entry, a completed case whose mitigations
 * are still open, a probability nobody ever scored, an assumption still
 * load-bearing two months past its own review date. Each of those is a small
 * piece of self-deception, and they compound: they are what the next decision is
 * made on.
 *
 * CROSS-DOMAIN FOUNDATIONS ENCODED HERE
 * -------------------------------------
 *  - **Falsificationism** (Popper 1934, *Logik der Forschung*): a statement that
 *    could not have been refuted by any observation says nothing. Every claim on
 *    this screen therefore carries a *refuter* — the one observation that would
 *    settle it — and a claim whose refuter cannot be written is not audited at
 *    all.
 *  - **Adversarial collaboration / red-teaming** (Kahneman 2003; Klein 2007,
 *    the pre-mortem; Heuer 1999, *Psychology of Intelligence Analysis*): the
 *    argument against a position is made by someone whose job is to make it, not
 *    by the person holding it. Here that someone is the record.
 *  - **Signal detection theory** (Green & Swets 1966): an auditor that only
 *    reports hits is a marketing department. This one publishes its own
 *    hit rate, its false-alarm rate, its dismissal rate and — below the floor —
 *    a refusal instead of a percentage.
 *  - **Discovery sampling / the rule of three** (Hanley & Lippman-Hand 1983,
 *    *JAMA*): a claim population of N with k examined tells you almost nothing,
 *    and the amount it tells you is computable. With zero contradictions among k
 *    examined claims the 95% upper bound on the population rate is 1 − 0.05^(1/k),
 *    which is ≈ 3/k. The terminal prints that number rather than a comfort score.
 *  - **Beta–binomial estimation with a Jeffreys prior** (Jeffreys 1946; Beta(½, ½)):
 *    a family's contradiction rate is estimated from its own scored claims, with
 *    a credible interval, and is refused outright below the declared floor —
 *    because the mean of a two-observation Beta is a rumour with a decimal point.
 *  - **Regression to the mean** (Galton 1886; Kahneman & Tversky 1973): a claim
 *    that a top reading was caused by an intervention is the claim this effect
 *    most often refutes, which is why an unexplained *change* is a defect here.
 *  - **Goodhart's law / Campbell's law** (Goodhart 1975; Campbell 1979): a claim
 *    of improvement on a measure that is also the target is audited as a claim,
 *    not as evidence.
 *  - **Survivorship bias** (Wald 1943): the population on this screen is every
 *    claim the record holds, not the claims that were convenient to examine.
 *    The unexamined remainder is printed with its sampling bound.
 *  - **Value of information** (Raiffa & Schlaifer 1961): a contradiction nobody
 *    can settle is noise. Every flag is therefore priced by what settling it
 *    would be worth against what the claim currently costs.
 *
 * WHAT THIS MODULE MAY NEVER DO
 * -----------------------------
 * It never reads prose for sentiment or intent, never infers what a person
 * meant, never scores, ranks or rates a human being, and never manufactures a
 * claim to have something to audit. It never treats an unexamined claim as
 * sound, never reports a rate below its floor, and never counts a *dismissal* as
 * evidence that a claim was right — a dismissal is a leader's judgement, and the
 * terminal says so on the same line.
 */

export const SCEPTIC_ENGINE_VERSION = 'cross-examination-2026.11-v1';

/* ------------------------------------------------------------------ */
/* 1. Claim families                                                  */
/* ------------------------------------------------------------------ */

/**
 * A family is a *kind of sentence* the workspace asserts about itself. The
 * family is what carries the error rate, because "how often are my completion
 * claims contradicted" is an answerable question and "how often am I wrong" is
 * not.
 *
 *  key        stable id, persisted on rounds and dispositions
 *  label      the family in the leader's language
 *  claim      the sentence a member of this family makes
 *  unit       one member
 *  stakes     declared stakes of this kind of claim being wrong (1–5). A
 *             convention, printed as one; never a measurement.
 *  question   the question the family exists to make answerable
 */
export const CLAIM_FAMILIES = Object.freeze([
  Object.freeze({
    key: 'completion',
    label: '“It is done”',
    claim: 'a work record is finished',
    unit: 'completion claim',
    stakes: 3,
    question: 'when I say something is finished, is it?',
  }),
  Object.freeze({
    key: 'assessment',
    label: '“This is how good it is”',
    claim: 'an assessment of a person’s period or performance stands',
    unit: 'assessment claim',
    stakes: 4,
    question: 'are the judgements I record about people supported by evidence?',
  }),
  Object.freeze({
    key: 'prediction',
    label: '“This will happen”',
    claim: 'a stated future is going to arrive',
    unit: 'prediction claim',
    stakes: 3,
    question: 'do my forecasts get scored, and do my on-track labels survive contact?',
  }),
  Object.freeze({
    key: 'diagnosis',
    label: '“This is why it happened”',
    claim: 'a cause has been identified and dealt with',
    unit: 'diagnosis claim',
    stakes: 4,
    question: 'did I fix the cause, or did I write it down?',
  }),
  Object.freeze({
    key: 'alignment',
    label: '“They are with me”',
    claim: 'someone important is aligned with what I am doing',
    unit: 'alignment claim',
    stakes: 4,
    question: 'is the support I believe I have actually being maintained?',
  }),
  Object.freeze({
    key: 'capacity',
    label: '“We can deliver by then”',
    claim: 'the dates I have given can be met with the capacity on record',
    unit: 'capacity claim',
    stakes: 5,
    question: 'is the week I have promised arithmetically possible?',
  }),
]);

export const CLAIM_FAMILY_KEYS = Object.freeze(CLAIM_FAMILIES.map((f) => f.key));

export function claimFamily(key) {
  return CLAIM_FAMILIES.find((f) => f.key === key) || null;
}

/* ------------------------------------------------------------------ */
/* 2. Detectors — the refutations the record can perform itself        */
/* ------------------------------------------------------------------ */

/**
 * A detector is a *structural* argument: it fires when two records the
 * workspace already holds cannot both be true. No detector reads a sentence for
 * tone, none infers intent, and each carries the one observation that would end
 * the argument — because a detector that cannot be answered is an accusation.
 *
 *  id         stable, printed on every finding, stored on rounds
 *  family     which family's error rate this finding is scored against
 *  label      the contradiction in the leader's language
 *  asks       what the claim asserts
 *  finds      what the record shows instead
 *  refuter    the single observation that settles it
 *  nodeType   the graph type of the record making the claim (no edge is a no-op)
 *  route      where that record lives
 *  stake      declared stakes of this claim being wrong (1–5)
 *  evidence   'record' when the counter-evidence is another record the graph can
 *             reach, 'absence' when the counter-evidence is a hole in this one
 */
export const SCEPTIC_DETECTORS = Object.freeze([
  Object.freeze({
    id: 'SCP-CM-01',
    family: 'completion',
    label: 'Finished with no observation on file',
    asks: 'this goal is done',
    finds: 'no check-in was ever recorded against it',
    refuter: 'one dated observation, from before the completion date, that says how the outcome was measured',
    nodeType: 'goal',
    route: '#/goals',
    stake: 3,
    evidence: 'absence',
  }),
  Object.freeze({
    id: 'SCP-CM-02',
    family: 'completion',
    label: 'Case closed with its mitigation still open',
    asks: 'this case is resolved',
    finds: 'the delegation that was opened to mitigate it is still active',
    refuter: 'the mitigation’s completion record, or a stated reason the case no longer depends on it',
    nodeType: 'case',
    route: '#/cases',
    stake: 4,
    evidence: 'record',
  }),
  Object.freeze({
    id: 'SCP-CM-03',
    family: 'completion',
    label: 'Change closed without a closing reason',
    asks: 'this change is finished',
    finds: 'no closing reason was recorded and no review date was met',
    refuter: 'the written reason it ended, or the review that signed it off',
    nodeType: 'change',
    route: '#/changes',
    stake: 3,
    evidence: 'absence',
  }),
  Object.freeze({
    id: 'SCP-AS-01',
    family: 'assessment',
    label: 'Rating with no evidence entry',
    asks: 'this rating is the fair summary of the period',
    finds: 'the review carries a rating and an empty evidence list',
    refuter: 'one dated evidence entry that supports the band',
    nodeType: 'review',
    route: '#/reviews',
    stake: 4,
    evidence: 'absence',
  }),
  Object.freeze({
    id: 'SCP-AS-02',
    family: 'assessment',
    label: 'Rating recorded before the person’s own account',
    asks: 'the person had their say before the judgement was recorded',
    finds: 'the self-reflection was never captured',
    refuter: 'the reflection’s capture date, or a note saying why it was not sought',
    nodeType: 'review',
    route: '#/reviews',
    stake: 3,
    evidence: 'absence',
  }),
  Object.freeze({
    id: 'SCP-PR-01',
    family: 'prediction',
    label: '“On track” against its own pace line',
    asks: 'this goal is on track for its date',
    finds: 'its key results sit behind the straight-line pace its own start, target and due date imply',
    refuter: 'a re-baselined key result with the date and the reason, or a check-in that explains the gap',
    nodeType: 'goal',
    route: '#/goals',
    stake: 3,
    evidence: 'record',
  }),
  Object.freeze({
    id: 'SCP-PR-02',
    family: 'prediction',
    label: 'A probability nobody scored',
    asks: 'this decision’s stated probability was a real forecast',
    finds: 'its review date has passed with no outcome recorded',
    refuter: 'the outcome as it actually landed, recorded once',
    nodeType: 'decision',
    route: '#/decisions',
    stake: 3,
    evidence: 'absence',
  }),
  Object.freeze({
    id: 'SCP-PR-03',
    family: 'prediction',
    label: 'A load-bearing assumption past its own review date',
    asks: 'this premise still holds',
    finds: 'its review date has passed with no observation and no human disposition',
    refuter: 'one observation dated after the review date, either way',
    nodeType: 'premise',
    route: '#/premises',
    stake: 4,
    evidence: 'absence',
  }),
  Object.freeze({
    id: 'SCP-DG-01',
    family: 'diagnosis',
    label: 'A cause recorded and nothing changed',
    asks: 'the cause of this outcome has been dealt with',
    finds: 'the after-action review names a cause and no lesson carries an applied change',
    refuter: 'one applied change with its date and note',
    nodeType: 'case',
    route: '#/learning',
    stake: 4,
    evidence: 'absence',
  }),
  Object.freeze({
    id: 'SCP-DG-02',
    family: 'diagnosis',
    label: 'Case resolved without a residual risk',
    asks: 'this failure mode is closed',
    finds: 'the FMEA was rated at the start and no residual rating was recorded at the end',
    refuter: 'the residual rating, or a note saying the risk is deliberately carried',
    nodeType: 'case',
    route: '#/cases',
    stake: 4,
    evidence: 'absence',
  }),
  Object.freeze({
    id: 'SCP-AL-01',
    family: 'alignment',
    label: 'Declared support, unmaintained',
    asks: 'this stakeholder is with us',
    finds: 'the record shows no contact at twice the cadence they were promised',
    refuter: 'one dated contact inside the cadence',
    nodeType: 'stakeholder',
    route: '#/stakeholders',
    stake: 4,
    evidence: 'absence',
  }),
  Object.freeze({
    id: 'SCP-CP-01',
    family: 'capacity',
    label: 'More promised next week than you have ever closed',
    asks: 'next week’s dates are achievable',
    finds: 'the promises falling due exceed the workspace’s own measured settlement rate',
    refuter: 'a week where the record settles at that rate, or a renegotiation',
    nodeType: 'delegation',
    route: '#/delegations',
    stake: 5,
    evidence: 'record',
  }),
]);

export const SCEPTIC_DETECTOR_IDS = Object.freeze(SCEPTIC_DETECTORS.map((d) => d.id));

export function scepticDetector(id) {
  return SCEPTIC_DETECTORS.find((d) => d.id === id) || null;
}

export function detectorsForFamily(key) {
  return SCEPTIC_DETECTORS.filter((d) => d.family === key);
}

/* ------------------------------------------------------------------ */
/* 3. Verdicts                                                        */
/* ------------------------------------------------------------------ */

/** A family's measured soundness. */
export const FAMILY_VERDICTS = Object.freeze(['sound', 'watch', 'doubted', 'unmeasured']);

export const FAMILY_VERDICT_LABELS = Object.freeze({
  sound: 'Surviving its record',
  watch: 'Slipping',
  doubted: 'Failing its own record',
  unmeasured: 'No scored claims yet',
});

export const FAMILY_VERDICT_TEXT = Object.freeze({
  sound: 'Few enough of these claims were refuted that the family is inside the tolerance you declared. That is a statement about the claims you scored, not about the ones you did not.',
  watch: 'The contradiction rate is above your tolerance but the interval still reaches into it. More cross-examinations, not more software, is what would settle this.',
  doubted: 'Even the favourable end of the interval is above your tolerance. Claims of this kind are not being made carefully — and the next decision is being made on them.',
  unmeasured: 'Too few claims in this family have been cross-examined to say anything. Nothing here is assumed: the family is counted and left out of the exposure total, and the sampling bound says what the record would need.',
});

/** One claim's state. */
export const CLAIM_STATES = Object.freeze(['open', 'refuted', 'held', 'dismissed', 'lapsed']);

export const CLAIM_STATE_LABELS = Object.freeze({
  open: 'Unexamined',
  refuted: 'Refuted — the claim was wrong',
  held: 'Held — the claim survived',
  dismissed: 'Dismissed — not a real contradiction',
  lapsed: 'Lapsed — the counter-evidence went away',
});

/** Which dispositions are scored as evidence about the claim. */
export const SCORED_DISPOSITIONS = Object.freeze(['refuted', 'held']);

/* ------------------------------------------------------------------ */
/* 4. Ids, events and limits                                          */
/* ------------------------------------------------------------------ */

export const SCEPTIC_RULE_IDS = Object.freeze({
  FROZEN: 'RULE-SCP-01',
  FAMILY: 'RULE-SCP-02',
  RECONCILE: 'RULE-SCP-03',
  GRADE: 'RULE-SCP-04',
  DISMISSAL: 'RULE-SCP-05',
});

export const SCEPTIC_SIGNAL_IDS = Object.freeze({
  UNEXAMINED: 'SCP-01',
  FAMILY: 'SCP-02',
  EXPOSURE: 'SCP-03',
  DISMISSAL: 'SCP-04',
  UNGRADED: 'SCP-05',
  LAPSED: 'SCP-06',
  COVERAGE: 'SCP-07',
});

export const SCEPTIC_EVENTS = Object.freeze({
  FROZEN: 'sceptic.roundFrozen',
  GRADED: 'sceptic.roundGraded',
  DELETED: 'sceptic.roundDeleted',
  DISPOSED: 'sceptic.claimDisposed',
  SCAN: 'sceptic.scan',
  CONVENTIONS: 'sceptic.conventions',
});

/**
 * Every setting is clamped on read into a range that cannot switch its own test
 * off: a tolerance of 100% would make every family sound, a floor of 1 would
 * turn two observations into a rate, and a dismissal cap above 100% would make
 * the dismissal check unfalsifiable.
 */
export const SCEPTIC_LIMITS = Object.freeze({
  windowDays: [28, 730],
  windowDaysDefault: 120,
  tolerancePct: [5, 60],
  tolerancePctDefault: 25,
  minScored: [3, 40],
  minScoredDefault: 4,
  maxTasks: [1, 6],
  maxTasksDefault: 3,
  dismissalCapPct: [10, 80],
  dismissalCapPctDefault: 50,
  reviewHorizonDays: [7, 365],
  reviewHorizonDaysDefault: 45,
  roundCap: [2, 40],
  roundCapDefault: 10,
  maxClaims: 40,
  maxFindings: 60,
  maxPerFamily: 8,
  minPaceGapPct: 5,
  maxPaceGapPct: 60,
});

export const SCEPTIC_CONVENTIONS_NOTE =
  'Every number on this screen is a declared convention, not a measurement: the window the claim population is drawn from, '
  + 'the share of a family’s scored claims that may be refuted before the family counts as failing, the scored claims a family '
  + 'needs before a rate may be quoted at all, how many cross-examinations one frozen round may open, and the dismissal rate '
  + 'above which the auditor itself is put on the record. The contradiction rate is measured from your own dispositions; the '
  + 'sampling bound is arithmetic; nothing else here is estimated.';
