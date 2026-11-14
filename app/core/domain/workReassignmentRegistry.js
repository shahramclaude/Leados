/**
 * app/core/domain/workReassignmentRegistry.js — the closed vocabulary for the
 * Cross-Line Work-Reassignment Consent & Receiving-Capacity Gate
 * (ADR-0196, Schema v156, CSV scope #147, `#/matrix?panel=reassignments`).
 *
 * A `RULE-NPW-01` work-turn ask can identify a concentrated pool, but it cannot
 * make a receiving manager agree to take the next piece of work or prove that
 * the receiving line has room for the declared effort. This register records
 * only the dated human acts needed to make that boundary explicit. It never
 * changes a delegation's owner: accepted effort is a capacity reservation,
 * not an automatic reassignment.
 *
 * Leaf module: schema, reader, actions, CSV and view may all depend on this
 * vocabulary without forming an import cycle.
 */

export const WORK_REASSIGNMENT_ADR = 'ADR-0196';
export const WORK_REASSIGNMENT_ENGINE_VERSION = 'work-reassignment-2026.11-v1';
export const WORK_REASSIGNMENT_ROUTE = 'matrix-reassignments';
export const WORK_REASSIGNMENT_PANEL = 'reassignments';
export const WORK_REASSIGNMENT_CSV_SCOPE = 'work-reassignments';

export const WORK_REASSIGNMENT_EVENTS = Object.freeze({
  PROPOSED: 'work.reassignment.proposed',
  ACCEPTED: 'work.reassignment.accepted',
  DECLINED: 'work.reassignment.declined',
  WITHDRAWN: 'work.reassignment.withdrawn',
});

export const WORK_REASSIGNMENT_RIGHTS = Object.freeze({
  PROPOSE: 'propose-work-reassignment',
  ANSWER: 'answer-work-reassignment',
  WITHDRAW: 'withdraw-work-reassignment',
});

/** Every stored row is one append-only human act. */
export const WORK_REASSIGNMENT_ACT_KINDS = Object.freeze(['propose', 'accept', 'decline', 'withdraw']);
/** `operator` means a scribed statement, never seat authentication. */
export const WORK_REASSIGNMENT_VIAS = Object.freeze(['seat', 'operator']);

/**
 * The record state is compiled from its acts. It is deliberately separate from
 * the current capacity state: a dated acceptance remains a fact after a later
 * line retune makes its capacity claim fail.
 */
export const WORK_REASSIGNMENT_RECORD_STATES = Object.freeze([
  'awaiting-receiving-line',
  'accepted',
  'declined',
  'withdrawn',
]);
export const WORK_REASSIGNMENT_RECORD_STATE_LABELS = Object.freeze({
  'awaiting-receiving-line': 'Awaiting the receiving line',
  accepted: 'Accepted by the receiving line',
  declined: 'Declined by the receiving line',
  withdrawn: 'Withdrawn',
});
export const WORK_REASSIGNMENT_RECORD_STATE_TONES = Object.freeze({
  'awaiting-receiving-line': 'warn',
  accepted: 'good',
  declined: 'neutral',
  withdrawn: 'neutral',
});

/**
 * What the live record can honestly say TODAY. An accepted record can become a
 * capacity refusal after a retune or another admitted intake; the old consent
 * is kept, while completion of the rotation ask is blocked until capacity is
 * again provable.
 */
export const WORK_REASSIGNMENT_OPERATION_STATES = Object.freeze([
  'awaiting-receiving-line',
  'declined',
  'withdrawn',
  'ready',
  'served',
  'rotation-closed',
  'source-stale',
  'receiving-stale',
  'recipient-off-roster',
  'capacity-unprovable',
  'capacity-exceeded',
]);
export const WORK_REASSIGNMENT_OPERATION_LABELS = Object.freeze({
  'awaiting-receiving-line': 'No receiving-line consent',
  declined: 'Receiving line declined',
  withdrawn: 'Transfer withdrawn',
  ready: 'Consent + capacity ready',
  served: 'Rotation ask served',
  'rotation-closed': 'Rotation ask closed without this transfer serving it',
  'source-stale': 'Source line no longer holds',
  'receiving-stale': 'Receiving line no longer holds',
  'recipient-off-roster': 'Receiving person is off roster',
  'capacity-unprovable': 'Receiving capacity cannot be proved',
  'capacity-exceeded': 'Receiving capacity is now exceeded',
});
export const WORK_REASSIGNMENT_OPERATION_TONES = Object.freeze({
  'awaiting-receiving-line': 'warn',
  declined: 'neutral',
  withdrawn: 'neutral',
  ready: 'good',
  served: 'good',
  'rotation-closed': 'warn',
  'source-stale': 'bad',
  'receiving-stale': 'bad',
  'recipient-off-roster': 'bad',
  'capacity-unprovable': 'bad',
  'capacity-exceeded': 'bad',
});
export const WORK_REASSIGNMENT_OPERATION_REASONS = Object.freeze({
  'awaiting-receiving-line': 'Silence is not consent and admits no capacity. The receiving line must answer in its own right.',
  declined: 'The receiving line declined with a written reason. The proposal remains as a dated record and reserves no capacity.',
  withdrawn: 'A source or receiving line withdrew the proposal with a written reason. It reserves no capacity.',
  ready: 'The receiving line accepted, and its declared share-day ceiling still covers recorded intakes plus every accepted transfer reservation in this period.',
  served: 'The linked work-turn ask was completed only after a receiving-line acceptance passed the capacity gate. The delegation itself was not reassigned automatically.',
  'rotation-closed': 'The linked rotation ask is no longer active, but this proposal was not the accepted ready transfer that served it.',
  'source-stale': 'The source person or named source line no longer matches the live matrix. The record is not re-pointed to a new holder.',
  'receiving-stale': 'The receiving line no longer matches the live matrix. The acceptance stays in history but cannot prove a live receiving commitment.',
  'recipient-off-roster': 'The proposed receiving person is no longer active. Nobody is substituted.',
  'capacity-unprovable': 'The receiving line’s declared share-day ceiling cannot be priced from its retained declaration history. Capacity is refused, never guessed.',
  'capacity-exceeded': 'Recorded intakes plus accepted transfer reservations now exceed the receiving line’s declared share-day ceiling. The earlier acceptance remains on the record; it is not treated as a current capacity pass.',
});

/** Bounded data, stated in stored hundredths of a person-day. */
export const WORK_REASSIGNMENT_LIMITS = Object.freeze({
  acts: 2000,
  idMax: 80,
  titleChars: 200,
  noteChars: 500,
  reasonMin: 10,
  reasonChars: 500,
  /** 365.00 person-days: no one proposal can claim more than one person-year. */
  maxEffortShareDaysH: 36500,
  /** Rows rendered on the detailed board; the remainder is counted. */
  rows: 200,
});

/**
 * Aggregate-only CSV. No person, manager, line, transfer id, work title, note,
 * decline/withdraw reason or exact per-transfer capacity figure may cross this
 * boundary.
 */
export const WORK_REASSIGNMENT_CSV_COLUMNS = Object.freeze([
  'row_type',
  'generated_on',
  'period_key',
  'transfers_n',
  'awaiting_n',
  'accepted_n',
  'declined_n',
  'withdrawn_n',
  'ready_n',
  'served_n',
  'rotation_closed_n',
  'source_stale_n',
  'receiving_stale_n',
  'recipient_off_roster_n',
  'capacity_unprovable_n',
  'capacity_exceeded_n',
  'reserved_effort_h',
  'span_rows_released_n',
  'span_rows_suppressed_n',
  'states_reconcile',
  'operations_reconcile',
]);

export const WORK_REASSIGNMENT_CSV_DESCRIPTOR = Object.freeze({
  key: WORK_REASSIGNMENT_CSV_SCOPE,
  label: 'Cross-line work-reassignment gate (aggregate)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'work-reassignments',
  description: 'One identity-free workspace row plus one row per derived operation state: counts of proposed, accepted, declined and withdrawn work-turn transfers; live capacity outcomes; total reserved effort; and disclosure-floor span-release counts. NO person, manager, line, transfer id, work title, note, reason, due date or exact per-transfer capacity figure is exported. A capacity refusal is counted, never exported as zero headroom.',
});

export const WORK_REASSIGNMENT_METHOD = Object.freeze([
  'A proposal is tied to one active RULE-NPW-01 rotation ask, names the person carrying the turn, the source line, one receiving person and one receiving line, a human-written work label, and exact declared effort in hundredths of a person-day. No task title, line or effort is inferred.',
  'Only the manager holding the source line may propose; only the manager holding the receiving line may accept or decline. The operator view may scribe either statement and is labelled operator, never authentication.',
  'Accepting re-prices the receiving line’s declared share-day ceiling for the proposal’s quarter and adds recorded intakes plus accepted transfer reservations. A missing or unprovable ceiling, or an excess, refuses the acceptance whole.',
  'An accepted transfer reserves receiving capacity in this gate and in the Matrix Line Intake Gate. It does not change a delegation owner, create a new delegation, rate a person, or infer the receiving manager’s consent from silence.',
  'A RULE-NPW-01 rotation ask cannot be completed as served until at least one linked transfer is accepted and still reads ready. Returning an ask remains possible and is visibly not a served transfer.',
  'The read model re-checks the live graph, declaration timeline and capacity after every write. A later retune, intake or withdrawal can make an earlier acceptance non-ready; the human act remains history and is never rewritten.',
  'Detailed rows are seat-scoped. Per-receiving-span counts are released only at the active seat’s disclosure floor; the CSV is aggregate-only and never exports identities or work text.',
]);
