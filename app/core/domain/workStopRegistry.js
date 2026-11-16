/**
 * app/core/domain/workStopRegistry.js — closed vocabulary for the Stop-Work
 * Authority & Safe Restart Ledger (ADR-0224, Schema v179, `RULE-SWP-01`,
 * CSV #166, `#/work-stop`).
 *
 * This is a leadership accountability record, NOT a permit-to-work system,
 * energy-isolation/lockout device, emergency service, or physical interlock.
 * The ledger records a human-declared hold, the control declared by the work
 * lead, independent clearance by every joint apex, and an affected operator's
 * own restart/continue-hold decision. No stored status can restart work.
 */

export const SWP_ENGINE_VERSION = 'work-stop-2026.11-v1';
export const SWP_ADR = 'ADR-0224';
export const SWP_RULE_ID = 'RULE-SWP-01';
export const SWP_ROUTE = 'work-stop';
export const SWP_HREF = '#/work-stop';
export const SWP_CSV_SCOPE = 'work-stop-safe-restart';
export const SWP_MARKER_KIND = 'work-stop';

export const SWP_EVENTS = Object.freeze({
  DECLARED: 'workStop.stop.declared',
  MITIGATED: 'workStop.mitigation.recorded',
  ASSESSED: 'workStop.independent-assessment.recorded',
  OPERATOR_DECISION: 'workStop.operator-decision.recorded',
  SCANNED: 'workStop.scan',
});
export const SWP_EVENT_PREFIX = 'workStop.';

export const SWP_RIGHTS = Object.freeze({
  READ: 'read-work-stop',
  DECLARE: 'declare-work-stop',
  MITIGATE: 'mitigate-work-stop',
  ASSESS: 'assess-work-stop',
  OPERATOR: 'decide-work-restart',
});

export const SWP_LIMITS = Object.freeze({
  stops: 400,
  acts: 2400,
  markers: 400,
  participantsMin: 1,
  participantsMax: 12,
  areaMin: 3,
  areaMax: 120,
  textMin: 24,
  textMax: 600,
  evidenceMin: 24,
  reviewMaxHours: 72,
  stopsShown: 40,
  actsShown: 80,
  asksPerCommit: 4,
  privacyFloor: 3,
  dayMin: '2000-01-01',
  dayMax: '2100-12-31',
});

export const SWP_SETTING_KEYS = Object.freeze({ autoPropagate: 'workStopAutoPropagate' });
export const SWP_DEFAULTS = Object.freeze({ autoPropagate: true });

export const SWP_HAZARDS = Object.freeze([
  Object.freeze({ key: 'imminent-danger', label: 'Imminent danger — an immediate threat to people or the environment' }),
  Object.freeze({ key: 'energy-isolation', label: 'Hazardous energy / isolation / lockout boundary' }),
  Object.freeze({ key: 'machine-guarding', label: 'Machine guarding or interlock' }),
  Object.freeze({ key: 'confined-space', label: 'Confined space / atmosphere' }),
  Object.freeze({ key: 'work-at-height', label: 'Work at height / dropped-object exposure' }),
  Object.freeze({ key: 'hot-work', label: 'Hot work / fire / ignition source' }),
  Object.freeze({ key: 'chemical-biological', label: 'Chemical or biological exposure' }),
  Object.freeze({ key: 'vehicle-mobile-plant', label: 'Vehicle / mobile plant / traffic interface' }),
  Object.freeze({ key: 'fatigue-or-work-rest', label: 'Fatigue / work-rest control' }),
  Object.freeze({ key: 'environmental', label: 'Environmental release / containment' }),
  Object.freeze({ key: 'other', label: 'Other — describe the specific condition' }),
]);
export const SWP_HAZARD_KEYS = Object.freeze(SWP_HAZARDS.map((row) => row.key));

export const SWP_ACT_KINDS = Object.freeze(['mitigation', 'assessment', 'operator-decision']);
export const SWP_AUTHORITY_REASONS = Object.freeze([
  'resolved',
  'matrix-unreadable',
  'no-active-reporting-lines',
  'no-common-joint-apex',
  'no-right-capable-apex',
  'unaskable-joint-apex',
]);
export const SWP_STATES = Object.freeze([
  Object.freeze({ key: 'awaiting-mitigation', label: 'Hold declared — work-lead control not yet recorded' }),
  Object.freeze({ key: 'awaiting-independent-clearance', label: 'Control recorded — independent clearance still owed' }),
  Object.freeze({ key: 'clearance-refused', label: 'Independent reviewer kept the hold in force' }),
  Object.freeze({ key: 'awaiting-operator-check', label: 'Independent clearance recorded — affected operator confirmation still owed' }),
  Object.freeze({ key: 'restart-contested', label: 'Affected operator declined restart — hold remains' }),
  Object.freeze({ key: 'no-independent-authority', label: 'No askable joint authority — hold remains; nobody substituted' }),
  Object.freeze({ key: 'record-integrity-defect', label: 'Record integrity defect — hold remains; no new key accepted' }),
  Object.freeze({ key: 'restarted', label: 'Restart confirmed by an affected operator after independent clearance' }),
]);
export const SWP_STATE_KEYS = Object.freeze(SWP_STATES.map((row) => row.key));

export const SWP_REFUSALS = Object.freeze({
  notSeated: 'The declared operating seat is unresolved and read-only. Choose a valid seat first.',
  notFound: 'That stop-work record is not on this ledger. Nothing was saved.',
  restarted: 'This stop-work record is already closed by the required independent and operator keys. History is immutable; declare a new stop if the hazard returns.',
  noAuthority: 'No askable joint authority sits above every affected reporting line. The hold stays in force and nobody is substituted.',
});

export const SWP_METHOD = Object.freeze({
  engine: SWP_ENGINE_VERSION,
  adr: SWP_ADR,
  frameworks: Object.freeze([
    'High-reliability organizing (Weick & Sutcliffe): preoccupation with failure and deference to the people closest to the work; a stop is surfaced, not averaged away.',
    'Permit-to-work / management-of-change practice: named hazard, temporary control, independent review and a dated restart gate. This ledger does not replace a legal permit or physical isolation.',
    'Matrix accountability (ADR-0140/ADR-0141): the lowest joint apex set above every active line of the reporter, work lead and affected operators; every tied apex must decide.',
    'Two-key control: independent clearance AND one affected operator’s first-person check are both required. Neither substitutes for a physical site inspection.',
    'Just Culture (ADR-0218 posture): counts describe stop-work conditions, never people; no per-person ranking, rate or performance score is produced.',
  ]),
  invariants: Object.freeze([
    'A declared stop is a hold, not a suggestion; neither elapsed time nor an acknowledgement releases it.',
    'The work lead may record containment but cannot clear their own work. Every askable joint apex must record `safe` on the same latest mitigation round.',
    'Only an affected operator who is separate from the named work lead and every reviewer may record the second key after personally checking the work area; a `continue-hold` decision keeps the stop open.',
    'A diamond tie is not broken: all minimal joint apexes must clear. A disconnected or synthetic-leader-only route records an identity-free marker and asks nobody.',
    'A hold is counted once, not once per employee, manager or reporting line. Matrix shares are never used to invent a work allocation.',
    '`countsReconcile` proves the printed partitions add to the ledger; `figuresComplete` separately reports malformed evidence, unreadable scope and unresolved authority.',
    'This local-first ledger is not an authenticated identity system, permit-to-work, lockout/tagout, emergency response channel, physical interlock or legal safety certification.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No hazard probability, severity score, risk score, or "safe" conclusion is inferred from category or prose.',
    'No stored status, manager acknowledgement, elapsed time, or automation rule can restart work.',
    'No work allocation or affected line is inferred from reporting shares, titles, cases or shift schedules.',
    'No person-level stop-work volume, ranking, or performance inference is exposed or exported; aggregate CSV counts are withheld below the declared floor of three, and complementary suppression withholds the whole numeric release when any small cell or incomplete claim exists.',
    'No permit, isolation, badge, sensor, training certificate or physical site state is imported or fabricated.',
  ]),
});

export const SWP_CSV_COLUMNS = Object.freeze([
  'as_of', 'row_kind', 'key', 'declared', 'active_holds', 'restarted',
  'overdue_reviews', 'unroutable_holds', 'mitigations', 'independent_assessments',
  'operator_decisions', 'blank_reason',
]);

export const SWP_CSV_DESCRIPTOR = Object.freeze({
  key: SWP_CSV_SCOPE,
  label: 'Stop-work authority & safe restart (aggregate)',
  group: 'operations',
  sensitive: true,
  filenameSlug: 'work-stop-safe-restart',
  description: 'One summary row, one row per derived hold state and one row per hazard category. Aggregate counts only: no worker, work area, hazard narrative, control or evidence text crosses the export boundary. The whole numeric release is blank when any cell is below three or the claim is incomplete, preventing direct small-cell release and subtraction through complementary totals.'
});

export const SWP_SECTION_TITLES = Object.freeze({
  stops: 'Holds',
  reviews: 'Independent review & operator decisions',
  method: 'Method & limits',
});
