/**
 * app/core/domain/freezeLineRegistry.js — the Freeze-Line Continuity Audit
 * (ADR-0099, Schema v101).
 *
 * THE QUESTION. Every reading LeadOS takes — federation carriage, cadence,
 * renewals, mandates, allocations — is measured against a REPORTING TREE that
 * was declared at the moment of the reading. The day a structural design is
 * committed, the tree changes and every frozen reading taken before that day
 * becomes incomparable: the same span id now means a different span. Nothing
 * in the category measures that. Visier advertises metrics "consistent as of
 * any date, through every reorg" (vendor claim, not audited); Workday's
 * effective-dated reporting needs pre-planned as-of snapshot dates decided in
 * advance (a known limitation its own docs state); no surveyed people-analytics
 * or leadership product prints a COMPARABILITY verdict across a reorganisation
 * freeze line under small-cell governance.
 *
 * THE MEASUREMENT. A committed (or reverted) structural design is a FREEZE
 * LINE: a dated boundary in the reporting tree. This module measures DATED
 * CARRIAGE across the line — the same artefacts the Programme Federation
 * Reading (ADR-0090) already counts, mapped through the tree as it stood
 * BEFORE the line and the tree as it stands AFTER it — and answers, per line:
 * did the connected share of declared leadership edges HOLD across the
 * reorganisation, with a Wilson (1927) interval, a declared edge floor below
 * which the rate is REFUSED, and small-cell complementary suppression?
 *
 * THE SECOND HALF. A suppressed row must not leak WHEN it was suppressed: an
 * exact `lastCarriageOn` date beside a blanked count is a timing side channel
 * (the SDC literature's temporal differencing). The audit therefore also
 * guards the timing channel: suppressed rows carry no dates, in the live
 * view, in the CSV and in frozen snapshots alike, and RULE-FRZ-03 audits
 * legacy snapshots that still carry one.
 *
 * FRAMEWORKS ENCODED (named, not paraphrased):
 *  - Effective-dated / as-of reporting (Workday HCM model) turned into a
 *    COMPARABILITY AUDIT: not "what did we say then", but "can these two
 *    readings be compared at all, and with what interval".
 *  - Statistical disclosure control: small-cell primary suppression,
 *    COMPLEMENTARY suppression, minimum-aggregate refusal, and temporal
 *    differencing defence (a date is a disclosure of a withheld cell).
 *  - Wilson score interval (1927) on both sides of the line; a verdict is
 *    decided on the intervals, and REFUSED below the declared edge floor.
 *  - Jaques' time span of discretion: the unit is the SPAN and the EDGE, never
 *    a person; a degraded line is a property of the structure, not a rating.
 *  - Beer VSM requisite-variety channel: a reorganisation that severs the
 *    measured channel above a span makes the system non-viable THERE, and the
 *    audit says so with counts, not blame.
 *
 * Purity: this registry is vocabulary only. The read model is pure; the rules
 * write only their own markers, readings, typed edges and governed decisions.
 */

export const FREEZE_ENGINE_VERSION = 'freeze-line-continuity-2026.11-v1';

export const FREEZE_LIMITS = Object.freeze({
  lines: 60,
  readings: 120,
  markers: 800,
  cellsPerReading: 80,
  decisionsPerScan: 30,
  windowDaysMin: 7,
  windowDaysMax: 365,
  minEdgesMin: 2,
  minEdgesCeil: 20,
  cellFloorMin: 2,
  cellFloorMax: 10,
  dropPctMin: 5,
  dropPctMax: 60,
});

export const FREEZE_DEFAULTS = Object.freeze({
  freezeLineWindowDays: 30,
  freezeLineMinEdges: 3,
  freezeLineCellFloor: 3,
  freezeLineDropPct: 15,
  freezeLineAutoPropagate: true,
});

export const FREEZE_RULE_IDS = Object.freeze({
  registered: 'RULE-FRZ-01',
  degraded: 'RULE-FRZ-02',
  timingGuard: 'RULE-FRZ-03',
});

export const FREEZE_EVENTS = Object.freeze({
  FROZEN: 'freezeline.frozen',
  SCAN: 'freezeline.scan',
});

export const FREEZE_TRIGGER_PREFIX = 'freezeline.';

/** The org-design lifecycle events that mark a freeze line. */
export const FREEZE_LINE_EVENTS = Object.freeze(['orgdesign.committed', 'orgdesign.reverted']);

/** Per-edge continuity classes across a freeze line. */
export const CONTINUITY_CLASSES = Object.freeze(['held', 'lost', 'gained', 'still-silent']);

export const CONTINUITY_META = Object.freeze({
  held: Object.freeze({
    label: 'Held',
    tone: 'good',
    meaning: 'This declared edge measurably carried work on BOTH sides of the freeze line.',
  }),
  lost: Object.freeze({
    label: 'Lost',
    tone: 'bad',
    meaning: 'The edge carried work before the line and not after it. A structural change, measured on the edge — not a rating of anyone.',
  }),
  gained: Object.freeze({
    label: 'Gained',
    tone: 'good',
    meaning: 'The edge carried no measured work before the line and does after it.',
  }),
  'still-silent': Object.freeze({
    label: 'Still silent',
    tone: 'warn',
    meaning: 'No measured carriage on either side of the line. The edge was silent before the reorganisation and remains silent; the line is not the cause.',
  }),
});

/** Reading verdicts. `refused` is a first-class outcome, never a number. */
export const FREEZE_VERDICTS = Object.freeze(['held', 'degraded', 'refused']);

export const FREEZE_VERDICT_META = Object.freeze({
  held: Object.freeze({
    label: 'Continuity held',
    tone: 'good',
    meaning: 'The connected share of declared edges did not drop by more than the declared threshold across the freeze line, within the Wilson intervals.',
  }),
  degraded: Object.freeze({
    label: 'Continuity degraded',
    tone: 'bad',
    meaning: 'The connected share dropped beyond the declared threshold across the line. One governed decision is opened per line per ISO week; the engine changes nothing itself.',
  }),
  refused: Object.freeze({
    label: 'Refused',
    tone: 'neutral',
    meaning: 'Too few declared edges on either side of the line to state a rate. The honest output is a refusal, not a percentage of two.',
  }),
});

/**
 * Five altitude-specific decisions. The reading is the same measurement at
 * every altitude; what changes is the horizon and the question the level is
 * competent to answer.
 */
export const FREEZE_PLAYBOOK = Object.freeze({
  frontline: Object.freeze({
    title: 'Did my line survive the reorg?',
    horizon: 'Next 7–30 days',
    question: 'Is the edge from my span to the span above it still carrying dated work after the reporting line moved?',
    see: 'Your own edge’s continuity class across the nearest freeze line — held, lost, gained — never a peer span’s.',
    act: 'If your edge is lost, name the missing carriage in your next 1:1 and agree one dated channel. The engine sends nothing.',
    hand: 'One named gap and a date; never a self-rating, never a claim about anyone’s intent.',
  }),
  manager: Object.freeze({
    title: 'Which of my spans lost their line?',
    horizon: '30–90 days',
    question: 'Which spans under me were connected before the freeze line and are not after it?',
    see: 'Per-child continuity classes inside your own span; sibling detail is withheld.',
    act: 'Open a direct dated channel to each lost edge, or record why the new line needs less traffic.',
    hand: 'The count lost, the count held, and the one edge you can fix inside your horizon.',
  }),
  director: Object.freeze({
    title: 'Did the reorg sever measured channels?',
    horizon: '90–180 days',
    question: 'Across the freeze line in my span, did the connected share of declared edges hold within its Wilson interval?',
    see: 'The before/after coverage with intervals, the per-altitude continuity cells and the comparability statement; peer spans are aggregates only.',
    act: 'Where the verdict is degraded, decide whether the new structure or the missing channel is wrong — and record the decision.',
    hand: 'A bounded before/after figure, the lost-edge count, and the governed decision opened at the altitude that can author the change.',
  }),
  exec: Object.freeze({
    title: 'Is the programme still federated after the reorg?',
    horizon: '180–365 days',
    question: 'Did the connected share of declared edges across the latest freeze line hold, and are pre-freeze readings still comparable?',
    see: 'Aggregate continuity rows with Wilson intervals, refused below the edge floor; complementary suppression on small altitude cells.',
    act: 'Authorise a continuity review of the degraded line, or accept that pre-freeze series are not comparable and restate the baseline.',
    hand: 'A bounded verdict and the explicit comparability statement — what can and cannot be compared across the line.',
  }),
  chief: Object.freeze({
    title: 'Enterprise continuity across freeze lines',
    horizon: '365–730 days',
    question: 'Across every freeze line this workspace has recorded, where did measured carriage measurably break, and was any suppressed row’s timing ever disclosed?',
    see: 'Counts by altitude and continuity class workspace-wide; no span, person, title or carriage date.',
    act: 'Record the enterprise decision on restating baselines after each reorganisation.',
    hand: 'A dated, aggregate-only statement of which series survive a reorg — and a zero count of timing-channel leaks.',
  }),
});

export const FREEZE_DISCLOSURE = Object.freeze({
  local: 'Operating seats are local workflow declarations, not authenticated multi-user security. Continuity is measured inside this workspace ledger only: carriage that happens outside LeadOS reads as silent on both sides of the line, and the screen says so.',
  comparability: 'A freeze line is a dated boundary in the DECLARED reporting tree. Comparability across it is a measurement property of the edges, not a claim that the reorganisation was good or bad, and never a rating of any person.',
  timing: 'A withheld count must not disclose WHEN it was withheld. Suppressed rows carry no carriage dates in the live view, the export or a frozen snapshot; RULE-FRZ-03 audits legacy snapshots and opens redaction work when one survives.',
  refusal: 'Below the declared edge floor a rate is REFUSED, not printed; a suppressed cell is BLANK, never zero; a determined value would be a coordinate and a proof, and this module prints neither.',
  engine: 'The engine registers freeze lines, freezes readings and opens governed decisions. It never changes a reporting line, never sends anything, never closes a human decision and never rates a person.',
});

export const FREEZE_PREMISE =
  'This screen measures whether the declared hierarchy kept its MEASURED information channels across a reorganisation freeze line — and refuses to print a rate, a date or a name that the evidence cannot support.';
