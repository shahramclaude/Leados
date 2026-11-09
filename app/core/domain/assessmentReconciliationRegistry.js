/**
 * app/core/domain/assessmentReconciliationRegistry.js — Cross-line assessment
 * substance reconciliation and calibration parity (ADR-0151, Schema v126).
 *
 * THE DUTY, IN THE OPERATOR'S WORDS. A director runs a quarterly calibration
 * with two managers who both had Sam on their team for nine months. Both were
 * asked for input. Both answered. The packet shows the answers side by side.
 * Nothing in the workspace says whether those answers AGREE about what Sam did
 * well, whether one line's input is worryingly thin — a sentence against a
 * paragraph — or whether the comparison the director is about to make is even
 * valid. The director re-reads every answer pair by eye, and a thin \"looks
 * good\" is silently treated as agreement with a detailed assessment. When a
 * review is about the one durable claim this product makes about a person, that
 * silence is how a biased or partial view survives calibration.
 *
 * WHAT THIS MODULE IS. A bounded read model that reconciles the SUBSTANCE of
 * two or more lines' first-person answers for ONE review period. It does not
 * re-ask who was entitled to answer — reviewStewardship already does that — and
 * it does not change a rating. It adds the missing step between \"every line
 * spoke\" and \"the packet is ready to be signed\": did the lines' dated
 * accounts align, and is that alignment trustworthy?
 *
 * WHAT IT REFUSES TO DO (Bulletproof Reliability Mandate)
 * -------------------------------------------------------
 *  - It never INVENTS a judgement about a person. A thin answer is flagged as
 *    THIN (\"this line wrote a sentence while another wrote a paragraph\"), not
 *    as \"this line does not care\".
 *  - It never infers sentiment, tone or meaning from free text. Divergence is
 *    ONLY computed when a line holder declared a coarse, structured signal and
 *    another did — two declared signals on the same scale can be compared with
 *    integer arithmetic; two paragraphs cannot be auto-compared without guessing
 *    what their authors meant, and guessing is what this product refuses to do.
 *  - It never treats silence as agreement. An unasked or overdue line makes the
 *    whole reconciliation INCOMPLETE rather than silently excluded.
 *  - It never counts a person twice. One packet, one reconciliation row, and
 *    every board total is a count of PACKETS or of LINES, never of line-people.
 *  - It is INERT in a single-chain workspace: no second line, no reconciliation.
 */

export const ASSESSMENT_RECONCILIATION_ENGINE_VERSION = 'assessment-reconciliation-2026.11-v1';

/**
 * The coarse signal a line holder MAY declare alongside their free-text answer.
 * This is the ONLY field the reconciliation compares for divergence, because it
 * is a declared human judgement on a shared scale — not a machine reading of
 * prose. A free-text answer with no signal is still a valid answer; it is
 * counted as `unrated` rather than as a zero signal.
 *
 * Scale (4 steps, integer-coded for exact cross-multiplication-free comparison):
 *   0: needs-support   — performance / behaviour in this period needs active support
 *   1: as-expected     — delivered as expected for the period
 *   2: strong          — consistently strong delivery in the period
 *   3: exceptional     — set the standard peers are held to
 */
export const ASSESSMENT_SIGNALS = Object.freeze([
  { key: 'needs-support', label: 'Needs support', rank: 0 },
  { key: 'as-expected', label: 'As expected', rank: 1 },
  { key: 'strong', label: 'Strong', rank: 2 },
  { key: 'exceptional', label: 'Exceptional', rank: 3 },
]);

export const ASSESSMENT_SIGNAL_KEYS = Object.freeze(ASSESSMENT_SIGNALS.map((s) => s.key));
const SIGNAL_RANK = new Map(ASSESSMENT_SIGNALS.map((s) => [s.key, s.rank]));
const SIGNAL_BY_KEY = new Map(ASSESSMENT_SIGNALS.map((s) => [s.key, s]));

export function assessmentSignal(key) {
  return SIGNAL_BY_KEY.get(String(key || '').trim()) || null;
}

export function assessmentSignalRank(key) {
  const rank = SIGNAL_RANK.get(String(key || '').trim());
  return rank !== undefined ? rank : null;
}

/**
 * Verdicts for one packet's reconciliation. Exactly one verdict is selected per
 * packet with the precedence declared HERE so the report, the panel and the CSV
 * cannot disagree about what a word means.
 *
 * Precedence is worst-first: a packet that is both thin AND divergent reads as
 * divergent, because disagreement is harder to resolve than brevity.
 */
export const ASSESSMENT_RECONCILIATION_VERDICTS = Object.freeze([
  {
    key: 'single-chain',
    label: 'Single line — nothing to reconcile',
    severity: 6,
    tone: 'neutral',
    open: false,
    detail: 'The person sat on one reporting line for the whole period. The ordinary single-chain review applies; no cross-line reconciliation is required.',
  },
  {
    key: 'incomplete',
    label: 'Not all lines have spoken',
    severity: 0,
    tone: 'bad',
    open: true,
    detail: 'At least one line in force during the period has not settled — it is unasked, awaiting an answer inside its window, or overdue. A comparison that excludes an open line would read as unanimous while a question is still outstanding.',
  },
  {
    key: 'single-answer',
    label: 'Only one line answered',
    severity: 1,
    tone: 'warn',
    open: true,
    detail: 'Every in-period line is settled, but only one line gave input; the others declined with a stated reason. There is nothing to reconcile — the packet carries one line\'s view beside the others\' explicit \"nothing to add\".',
  },
  {
    key: 'unrated-pair',
    label: 'No declared signal to compare',
    severity: 2,
    tone: 'warn',
    open: true,
    detail: 'Two or more lines answered with free text but none declared a coarse signal on the shared scale. Their accounts are printed side by side; divergence is not computed from prose because guessing what a paragraph meant would be the exact failure this module refuses to commit. Ask each line holder to declare a signal with their next answer.',
  },
  {
    key: 'thin-input',
    label: 'One line wrote far less',
    severity: 3,
    tone: 'warn',
    open: true,
    detail: 'Two or more lines answered and every answered line declared a signal, but one line\'s account is materially thinner than another\'s — a sentence beside a paragraph. Thin is not wrong, but it is a prompt to check whether the short account is actually that thin or merely undocumented.',
  },
  {
    key: 'divergent',
    label: 'Lines see this period differently',
    severity: 4,
    tone: 'bad',
    open: true,
    detail: 'Two or more lines answered and declared signals that differ by two or more steps on the shared scale — for example, one line says \"needs support\" while another says \"strong\". This is not a rating; it is a prompt for the calibration conversation the packet is about to enter.',
  },
  {
    key: 'aligned',
    label: 'Lines are aligned',
    severity: 5,
    tone: 'good',
    open: false,
    detail: 'Every in-period answered line declared a signal and those signals are within one step of each other, with every answered line above the thin threshold. Alignment is not agreement about the person; it is agreement between the lines\' declared accounts in this one period.',
  },
]);

export const ASSESSMENT_RECONCILIATION_VERDICT_KEYS = Object.freeze(
  ASSESSMENT_RECONCILIATION_VERDICTS.map((v) => v.key),
);
const VERDICT_BY_KEY = new Map(ASSESSMENT_RECONCILIATION_VERDICTS.map((v) => [v.key, v]));

export function assessmentReconciliationVerdict(key) {
  return VERDICT_BY_KEY.get(String(key || '').trim()) || null;
}

/** Declared conventions — clamped, printed, never fitted. */
export const ASSESSMENT_RECONCILIATION_BOUNDS = Object.freeze({
  thinChars: Object.freeze([20, 500]),
  thinRatio: Object.freeze([2, 20]),
  divergentSteps: Object.freeze([1, 3]),
});

export const ASSESSMENT_RECONCILIATION_DEFAULTS = Object.freeze({
  thinChars: 120,
  thinRatio: 3,
  divergentSteps: 2,
});

/** Caps and rendering limits. */
export const ASSESSMENT_RECONCILIATION_LIMITS = Object.freeze({
  /** Rows the board renders before the remainder is counted only. */
  board: 40,
  /** Maximum stored signals considered per packet (one per line). */
  signals: 12,
});
