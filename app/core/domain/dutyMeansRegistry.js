/**
 * app/core/domain/dutyMeansRegistry.js — closed vocabularies, limits, rights,
 * verdicts and named frameworks of the Duty-Without-Means Register
 * (Accountability–Means Parity & Simons' Entrepreneurial Gap Ledger,
 * ADR-0221, Schema v175, CSV #163, `#/means`).
 *
 * Pure leaf: zero imports, so schema, reader, actions, post-commit rule, CSV
 * export and view all share one vocabulary without cycle risk.
 *
 * THE DEFECT THIS REGISTER PREVENTS
 * ---------------------------------
 * A frontline supervisor or mid-manager is held accountable for an outcome
 * whose required decision authority, funding envelope, or protected capacity
 * share sits with another manager — either higher up the same chain or across
 * a competing matrix line. Without a dated parity ledger:
 *   - accountability outruns control in silence ("responsibility without
 *     authority/budget/time");
 *   - Line A demands delivery from a shared contributor while Line B withholds
 *     the hours or budget, and the carrier takes the blame for an inter-line
 *     deadlock they lack authority to break;
 *   - a demanding manager "promises" another line's people or budget without
 *     that controlling line's consent;
 *   - an executive informal nod ("make it work across teams") is confused with
 *     actual resourcing rather than recorded explicitly as a bounded Simons
 *     entrepreneurial gap signed above both lines.
 */

export const DWM_ENGINE_VERSION = 'duty-without-means-2026.11-v1';
export const DWM_RULE_ID = 'RULE-DWM-01';
export const DWM_ROUTE = '#/means';
export const DWM_CSV_SCOPE = 'duty-without-means';

export const DWM_RIGHTS = Object.freeze({
  READ: 'read-duty-means',
  DECLARE: 'declare-duty-means',
  SUPPLY: 'supply-duty-means',
  GOVERN: 'govern-duty-means',
});

export const DWM_SETTING_KEYS = Object.freeze({
  responseDays: 'dutyMeansResponseDays',
  autoPropagate: 'dutyMeansAutoPropagate',
});

export const DWM_DEFAULTS = Object.freeze({
  responseDays: 7,
  autoPropagate: true,
});

export const DWM_BOUNDS = Object.freeze({
  responseDays: Object.freeze({ min: 1, max: 60 }),
});

export const DWM_LIMITS = Object.freeze({
  dutiesMax: 1500,
  requirementsMax: 6000,
  actsMax: 12000,
  markersMax: 2000,
  idMax: 96,
  personIdMax: 96,
  sourceIdMax: 120,
  evidenceIdMax: 120,
  labelMin: 3,
  labelMax: 120,
  basisMin: 24,
  basisMax: 600,
  rationaleMin: 24,
  rationaleMax: 600,
  reasonMin: 24,
  reasonMax: 600,
  centsMax: 9_000_000_000_000_000,
  hoursMin: 1,
  hoursMax: 10_000,
  windowDaysMax: 731,
  windowFutureDaysMax: 400,
  dayMin: '1970-01-01',
  dayMax: '2200-12-31',
  asksPerCommit: 4,
  askDueUnscopedDays: 5,
  askDueUnansweredDays: 3,
  askDueEscalationDays: 5,
});

export const DWM_SOURCE_KINDS = Object.freeze([
  Object.freeze({ key: 'goal', label: 'Goal or OKR', needsId: true }),
  Object.freeze({ key: 'case', label: 'Operational case', needsId: true }),
  Object.freeze({ key: 'delegation', label: 'Delegated commitment', needsId: true }),
  Object.freeze({ key: 'change', label: 'Organisational change', needsId: true }),
  Object.freeze({ key: 'mandate', label: 'Standing mandate', needsId: true }),
  Object.freeze({ key: 'written', label: 'Written charter / instruction (cited in basis)', needsId: false }),
]);
export const DWM_SOURCE_KIND_KEYS = Object.freeze(DWM_SOURCE_KINDS.map((row) => row.key));
const SOURCE_BY_KEY = new Map(DWM_SOURCE_KINDS.map((row) => [row.key, row]));
export const dwmSourceByKey = (key) => SOURCE_BY_KEY.get(key) || null;

export const DWM_PILLARS = Object.freeze([
  Object.freeze({
    key: 'authority',
    label: 'Decision authority',
    unitLabel: 'authority right',
    says: 'A specific right to commit spend, trade off scope, assign work, halt a faulty process, or direct a vendor.',
  }),
  Object.freeze({
    key: 'budget',
    label: 'Budget / funding envelope',
    unitLabel: 'exact currency cents',
    says: 'Committed money in one declared currency; never converted across currencies or netted against over-funded items.',
  }),
  Object.freeze({
    key: 'time',
    label: 'Protected time / capacity',
    unitLabel: 'whole hours',
    says: 'Protected hours over the duty window; never converted into money and never inferred from an unconfirmed share.',
  }),
]);
export const DWM_PILLAR_KEYS = Object.freeze(DWM_PILLARS.map((row) => row.key));
const PILLAR_BY_KEY = new Map(DWM_PILLARS.map((row) => [row.key, row]));
export const dwmPillarByKey = (key) => PILLAR_BY_KEY.get(key) || null;

export const DWM_AUTHORITY_SCOPES = Object.freeze([
  Object.freeze({
    key: 'spend-commit',
    label: 'Commit external or internal spend up to limit',
    needsMoney: true,
  }),
  Object.freeze({
    key: 'scope-tradeoff',
    label: 'Trade off scope or sequence within the window',
    needsMoney: false,
  }),
  Object.freeze({
    key: 'task-assign',
    label: 'Direct task priority across named contributors',
    needsMoney: false,
  }),
  Object.freeze({
    key: 'process-halt',
    label: 'Stop or hold release / station on defect (andon right)',
    needsMoney: false,
  }),
  Object.freeze({
    key: 'vendor-direct',
    label: 'Instruct supplier or counterparty under contract',
    needsMoney: false,
  }),
]);
export const DWM_AUTHORITY_SCOPE_KEYS = Object.freeze(DWM_AUTHORITY_SCOPES.map((row) => row.key));
const AUTH_SCOPE_BY_KEY = new Map(DWM_AUTHORITY_SCOPES.map((row) => [row.key, row]));
export const dwmAuthorityScopeByKey = (key) => AUTH_SCOPE_BY_KEY.get(key) || null;

export const DWM_EVIDENCE_KINDS = Object.freeze([
  Object.freeze({ key: 'doa', label: 'Delegation of Authority entry' }),
  Object.freeze({ key: 'mandate', label: 'Charter or standing mandate' }),
  Object.freeze({ key: 'budget', label: 'Approved budget envelope' }),
  Object.freeze({ key: 'reporting-line', label: 'Declared reporting-line capacity agreement' }),
  Object.freeze({ key: 'decision', label: 'Logged leadership decision' }),
  Object.freeze({ key: 'document', label: 'Written instrument or roster schedule' }),
]);
export const DWM_EVIDENCE_KIND_KEYS = Object.freeze(DWM_EVIDENCE_KINDS.map((row) => row.key));
const EVIDENCE_BY_KEY = new Map(DWM_EVIDENCE_KINDS.map((row) => [row.key, row]));
export const dwmEvidenceByKey = (key) => EVIDENCE_BY_KEY.get(key) || null;

export const DWM_ACT_STATES = Object.freeze([
  Object.freeze({
    key: 'supplied',
    label: 'Means supplied',
    says: 'The controlling holder (or a seat strictly above them) commits the means with a cited instrument.',
  }),
  Object.freeze({
    key: 'declined',
    label: 'Means declined',
    says: 'The controlling holder explicitly declines to supply the means; the refusal is legitimate, leaving the duty unadjusted is not.',
  }),
  Object.freeze({
    key: 'revoked',
    label: 'Previously supplied means withdrawn',
    says: 'Means earlier committed are pulled back mid-window; prior promise remains in the append-only trail.',
  }),
  Object.freeze({
    key: 'accepted-gap',
    label: 'Entrepreneurial gap accepted at joint apex',
    says: 'A seat strictly above BOTH the demanding line and the controlling line signs off a bounded Simons entrepreneurial gap in writing.',
  }),
]);
export const DWM_ACT_STATE_KEYS = Object.freeze(DWM_ACT_STATES.map((row) => row.key));

export const DWM_STRUCTURE_KINDS = Object.freeze({
  SAME_LINE: 'same-line',
  VERTICAL: 'vertical-escalation',
  CROSS_LINE: 'cross-line',
});

/**
 * Nine mutually exclusive, exhaustive states for a requirement, evaluated in
 * fixed precedence on read and never stored on the row.
 */
export const DWM_REQUIREMENT_STATES = Object.freeze([
  Object.freeze({
    key: 'unreadable',
    rank: 1,
    tone: 'bad',
    label: 'Unreadable graph or duty',
    says: 'The reporting graph or parent duty could not be resolved; parity is refused rather than guessed.',
  }),
  Object.freeze({
    key: 'withdrawn',
    rank: 2,
    tone: 'bad',
    label: 'Means withdrawn',
    says: 'Means were previously supplied and later revoked while the duty remains live.',
  }),
  Object.freeze({
    key: 'declined',
    rank: 3,
    tone: 'bad',
    label: 'Means declined',
    says: 'The controlling line explicitly refused to supply this means while accountability for the duty still stands.',
  }),
  Object.freeze({
    key: 'drifted',
    rank: 4,
    tone: 'bad',
    label: 'Supplier or governor drifted',
    says: 'The seat that supplied the means or signed the entrepreneurial gap no longer holds requisite authority on the live graph.',
  }),
  Object.freeze({
    key: 'accepted-gap',
    rank: 5,
    tone: 'warn',
    label: 'Accepted entrepreneurial gap',
    says: 'A seat strictly above both the demanding and controlling lines accepted this shortfall in writing; kept separate from backed means.',
  }),
  Object.freeze({
    key: 'partial',
    rank: 6,
    tone: 'bad',
    label: 'Partially supplied (shortfall open)',
    says: 'The controlling line supplied part of the required budget or hours; the exact shortfall remains unbacked.',
  }),
  Object.freeze({
    key: 'backed',
    rank: 7,
    tone: 'good',
    label: 'Backed in full',
    says: 'The controlling line (or a seat above it) supplied the full required means with standing on the live graph.',
  }),
  Object.freeze({
    key: 'overdue-unanswered',
    rank: 8,
    tone: 'bad',
    label: 'Overdue — unanswered',
    says: 'Past the response window (or the duty window has opened) with no answer from the controlling line.',
  }),
  Object.freeze({
    key: 'awaiting-means',
    rank: 9,
    tone: 'warn',
    label: 'Awaiting controlling-line response',
    says: 'Declared within the response window and awaiting supply or refusal from the controlling line.',
  }),
]);
const REQ_STATE_BY_KEY = new Map(DWM_REQUIREMENT_STATES.map((row) => [row.key, row]));
export const dwmReqStateByKey = (key) => REQ_STATE_BY_KEY.get(key) || null;

/**
 * Eight mutually exclusive, exhaustive verdicts for a live duty, evaluated in
 * fixed precedence so live duty counts always sum to `dutiesLiveInScopeN`.
 */
export const DWM_DUTY_VERDICTS = Object.freeze([
  Object.freeze({
    key: 'unmeasurable',
    rank: 1,
    tone: 'bad',
    label: 'Unmeasurable — graph error',
    says: 'The live matrix graph could not resolve the carrier or demanding line; parity is refused.',
  }),
  Object.freeze({
    key: 'unscoped-means',
    rank: 2,
    tone: 'warn',
    label: 'Means not yet declared',
    says: 'An outcome duty is on the record with zero declared authority, budget, or time requirements; never called backed.',
  }),
  Object.freeze({
    key: 'means-declined',
    rank: 3,
    tone: 'bad',
    label: 'Duty held despite declined / withdrawn means',
    says: 'At least one required means was explicitly declined or withdrawn while the carrier remains accountable for the outcome.',
  }),
  Object.freeze({
    key: 'cross-line-locked',
    rank: 4,
    tone: 'bad',
    label: 'Cross-line means lock',
    says: 'One line demands the outcome while another matrix line controls required means that are overdue, partial, or drifted.',
  }),
  Object.freeze({
    key: 'means-shortfall',
    rank: 5,
    tone: 'bad',
    label: 'Single-line / vertical means shortfall',
    says: 'Same-line or vertical required means are overdue, partial, or drifted on the live reporting chain.',
  }),
  Object.freeze({
    key: 'pending-means',
    rank: 6,
    tone: 'warn',
    label: 'Pending controlling-line answer',
    says: 'All declared requirements are either backed or still inside the response window awaiting answer.',
  }),
  Object.freeze({
    key: 'entrepreneurial-gap',
    rank: 7,
    tone: 'warn',
    label: 'Bounded entrepreneurial gap (joint-apex signed)',
    says: 'Every unbacked means has a valid written acceptance from a seat strictly above both lines; shortfall stays visible.',
  }),
  Object.freeze({
    key: 'means-backed',
    rank: 8,
    tone: 'good',
    label: 'Accountability–means parity verified',
    says: 'Every declared authority, budget, and time requirement is backed in full on the live reporting graph.',
  }),
]);
const VERDICT_BY_KEY = new Map(DWM_DUTY_VERDICTS.map((row) => [row.key, row]));
export const dwmVerdictByKey = (key) => VERDICT_BY_KEY.get(key) || null;

export const DWM_CONDITION_KINDS = Object.freeze({
  DUTY_UNSCOPED: 'duty-unscoped',
  MEANS_UNANSWERED: 'means-unanswered',
  MEANS_GAP_ESCALATION: 'means-gap-escalation',
});

export const DWM_MARKER_REASONS = Object.freeze({
  NO_JOINT_APEX: 'no-joint-apex',
  HOLDER_OFF_ROSTER: 'holder-off-roster',
  DEMANDING_OFF_ROSTER: 'demanding-line-off-roster',
});

export const DWM_FRAMEWORKS = Object.freeze([
  Object.freeze({
    id: 'simons-2005',
    citation: 'Simons, R. (1995, Levers of Control; 2005, "Designing High-Performance Jobs", Harvard Business Review)',
    principle: 'Span of Accountability vs Span of Control (the Entrepreneurial Gap): when accountability outruns control without committed support or explicit joint-apex risk retention, stretch turns into structural impossibility.',
  }),
  Object.freeze({
    id: 'fayol-1916',
    citation: 'Fayol, H. (1916, Administration Industrielle et Générale — Principle #2: Authority and Responsibility)',
    principle: 'Parity of authority and responsibility: demanding an outcome obligates commensurate decision authority over the means required to deliver it.',
  }),
  Object.freeze({
    id: 'jaques-1989',
    citation: 'Jaques, E. (1989, Requisite Organization)',
    principle: 'Requisite authority: task-horizon accountability requires matching resource-access, veto, and escalation rights; otherwise the unresolved trade-off belongs at the stratum above.',
  }),
  Object.freeze({
    id: 'holmstrom-milgrom-1991',
    citation: 'Holmström, B. & Milgrom, P. (1991, Journal of Law, Economics, & Organization)',
    principle: 'Multi-principal agency: when Principal A demands an outcome whose effort or budget Principal B controls, holding the agent liable without inter-principal contracting manufactures distortion.',
  }),
  Object.freeze({
    id: 'kahn-1964',
    citation: 'Kahn, R. L., Wolfe, D. M., Quinn, R. P., Snoek, J. D. & Rosenthal, R. A. (1964, Organizational Stress)',
    principle: 'Resource-inadequacy and inter-sender role conflict in multi-line organisations must be surfaced as structural boundary locks, never attributed to carrier performance.',
  }),
]);

export const DWM_CSV_COLUMNS = Object.freeze([
  'as_of',
  'engine_version',
  'row_kind',
  'currency',
  'duties_live_total',
  'duties_retired_total',
  'duties_backed',
  'duties_entrepreneurial_gap',
  'duties_pending_means',
  'duties_means_shortfall',
  'duties_cross_line_locked',
  'duties_means_declined',
  'duties_unscoped_means',
  'duties_unmeasurable',
  'requirements_total',
  'requirements_cross_line',
  'requirements_backed',
  'requirements_partial',
  'requirements_accepted_gap',
  'requirements_declined',
  'requirements_withdrawn',
  'requirements_drifted',
  'requirements_overdue_unanswered',
  'requirements_awaiting_means',
  'money_required_cents',
  'money_covered_cents',
  'money_accepted_gap_cents',
  'money_unbacked_shortfall_cents',
  'hours_required_total',
  'hours_covered_total',
  'hours_accepted_gap_total',
  'hours_unbacked_shortfall_total',
  'authority_required_total',
  'authority_covered_total',
  'authority_accepted_gap_total',
  'authority_unbacked_total',
  'counts_reconcile',
  'figures_complete',
  'incomplete_reasons',
]);

export const DWM_CSV_DESCRIPTOR = Object.freeze({
  key: DWM_CSV_SCOPE,
  label: 'Duty-without-means parity summary (aggregate)',
  group: 'governance',
  sensitive: true,
  filenameSlug: 'duty-without-means',
  description: 'One workspace control row (hours, authority rights, duty verdicts, and requirement states) plus one currency row per declared currency (exact integer cents for required, covered, accepted-gap, and unbacked shortfall) and the register’s two separate claims. No person, duty label, line holder, rationale, or evidence reference crosses this boundary.',
});
