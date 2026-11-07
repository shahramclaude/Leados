/**
 * app/core/domain/jurisdictionDriftRegistry.js — zero-import vocabulary for
 * ADR-0115, the Cross-week Jurisdiction Drift reader (`#/jurisdiction?panel=drift`).
 *
 * The Jurisdiction Compiler already freezes ONE identity-free span reading per
 * (span, ISO week) on the shared post-commit spine (RULE-JUR-04). What no
 * altitude could do was compare those weeks. A VP forecasting quarterly
 * coordination risk and a chief reviewing enterprise exposure were handed a
 * snapshot and asked to decide whether the shape of the organisation was
 * changing. This module declares the vocabulary for that comparison:
 *
 *   - a distribution-free split-conformal band on week-over-week changes
 *     (Vovk et al. 2005; Angelopoulos & Bates 2021), with the achieved
 *     finite-sample coverage printed beside the nominal one;
 *   - the POOLED cross-branch share beside the MEAN OF UNIT RATES, so Yule's
 *     (1903) / Simpson's aggregation bias is visible rather than hidden in a
 *     single averaged percentage;
 *   - a refusal for every gap: a missing week is never a zero.
 *
 * Named frameworks are implemented in `jurisdictionDrift.js`, not name-dropped.
 * Pure data and pure functions: no imports, no clock, no DOM, no storage.
 */

export const JUR_DRIFT_ENGINE_VERSION = 'jurisdiction-drift-2026.11-v1';

/** Bounded writes. A cap is a refusal to grow without bound, not a silent drop. */
export const JUR_DRIFT_LIMITS = Object.freeze({
  governedPerScan: 1,
  rollUpEdges: 16,
  weeksCap: 52,
  reasonChars: 360,
  labelChars: 120,
});

/**
 * Three human decisions a drift verdict may open. It NEVER redraws a boundary,
 * never accepts itself and never changes a reading. Silence is not consent.
 */
export const JUR_DRIFT_OPTIONS = Object.freeze([
  Object.freeze({
    key: 'investigate',
    label: 'Investigate the change',
    question: 'Which objective or reporting line changed enough to move the cross-branch share out of its band?',
    note: 'Names a bounded inquiry, not a person. The engine has no causal claim: exchangeability is declared, not proven.',
  }),
  Object.freeze({
    key: 'accept-variance',
    label: 'Accept as ordinary variation',
    question: 'Is this a normal week for this function, given the printed calibration changes?',
    note: 'A recorded judgement, not a dismissal. The band stays published and next week is graded against it.',
  }),
  Object.freeze({
    key: 'rehearse-redraw',
    label: 'Rehearse a boundary redraw',
    question: 'Would moving a reporting line remove more cross-branch handoffs than it creates?',
    note: 'Opens the dry run at `#/jurisdiction?panel=redraw`. The rehearsal writes nothing; an actual redraw stays a separate governed decision.',
  }),
]);

/** The question each altitude actually asks of a multi-week series. */
export const JUR_DRIFT_ALTITUDE_QUESTIONS = Object.freeze({
  frontline: 'Is my own span steadily accumulating objectives that another team also holds, or is this week just busy?',
  manager: 'Are my teams’ cross-branch handoffs becoming the normal way we work, and is the coalition getting bigger?',
  director: 'Is the share of my unit’s objectives that cross a branch drifting outside its own history, and which child span moves it?',
  exec: 'Is this function’s coordination load structurally rising across the quarter, and is the pooled rate hiding a composition change?',
  chief: 'Is the enterprise running on more cross-branch work no single seat can resolve, and is a boundary redraw earned?',
});

/** Aggregate-only CSV. No span id, person, objective key, title or note. */
export const JUR_DRIFT_CSV_COLUMNS = Object.freeze([
  'row_kind', 'week', 'scope_rank', 'spans', 'suppressed_spans', 'objectives',
  'cross_branch', 'pooled_pct', 'mean_unit_pct', 'composition_gap_pct',
  'median_coalition', 'share_delta', 'share_bound', 'coalition_delta',
  'coalition_bound', 'coverage_bound', 'verdict', 'reason_code',
]);
