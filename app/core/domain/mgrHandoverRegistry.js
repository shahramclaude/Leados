/**
 * app/core/domain/mgrHandoverRegistry.js — closed vocabulary for the Managerial
 * Portfolio Handover & Successor-Acceptance Register (ADR-0225, Schema v180,
 * `RULE-MHH-01`, CSV #167, `#/manager-handover`).
 *
 * This is a leadership transition record, NOT a reassignment engine. When a
 * manager's role ends — a line exit, a reorganisation, a planned succession —
 * the live portfolio of obligations the manager holds does not expire with
 * them. The register records the declared transition, the outgoing manager's
 * first-person portfolio brief, the successor's own dated acceptance (the
 * second key), the governor's release of the outgoing authority, and any
 * successor dispute escalated to the joint seat above EVERY reporting line of
 * both managers. No stored status completes a handover.
 */

export const MHH_ENGINE_VERSION = 'mgr-handover-2026.11-v1';
export const MHH_ADR = 'ADR-0225';
export const MHH_RULE_ID = 'RULE-MHH-01';
export const MHH_ROUTE = 'mgr-handover';
export const MHH_HREF = '#/manager-handover';
export const MHH_CSV_SCOPE = 'manager-portfolio-handover';
export const MHH_MARKER_KIND = 'mgr-handover';

export const MHH_EVENTS = Object.freeze({
  DECLARED: 'mgrHandover.declared',
  BRIEFED: 'mgrHandover.brief.recorded',
  ACCEPTED: 'mgrHandover.acceptance.recorded',
  RELEASED: 'mgrHandover.release.recorded',
  DISPUTED: 'mgrHandover.dispute.recorded',
  SCANNED: 'mgrHandover.scan',
});
export const MHH_EVENT_PREFIX = 'mgrHandover.';

export const MHH_RIGHTS = Object.freeze({
  READ: 'read-mgr-handover',
  DECLARE: 'declare-mgr-handover',
  BRIEF: 'brief-mgr-handover',
  ACCEPT: 'accept-mgr-handover',
  RELEASE: 'release-mgr-handover',
  DISPUTE: 'dispute-mgr-handover',
});

export const MHH_LIMITS = Object.freeze({
  handovers: 400,
  acts: 2400,
  markers: 400,
  roleRefMin: 3,
  roleRefMax: 120,
  noteMin: 0,
  noteMax: 600,
  textMin: 24,
  textMax: 2000,
  briefMin: 40,
  evidenceMin: 24,
  scopeMin: 1,
  scopeMax: 5,
  handoversShown: 40,
  actsShown: 80,
  asksPerCommit: 4,
  privacyFloor: 3,
  dayMin: '2000-01-01',
  dayMax: '2100-12-31',
  // A successor dispute is escalated to the frozen joint seat above EVERY
  // reporting line of both managers. It stays uncontained — and the rule keeps
  // asking — until a human records a release or a new brief round. The window
  // is a printed convention, never an auto-resolution.
  disputeWindowDays: 7,
});

export const MHH_SETTING_KEYS = Object.freeze({ autoPropagate: 'mgrHandoverAutoPropagate' });
export const MHH_DEFAULTS = Object.freeze({ autoPropagate: true });

/**
 * The declared portfolio scope. Each category is read from the record the
 * workspace already stores; the register never re-enters portfolio contents
 * and never invents an obligation. A category whose source is unreadable is
 * refused with its reason printed, counted, and never rendered as a zero.
 */
export const MHH_PORTFOLIO_CATEGORIES = Object.freeze([
  Object.freeze({ key: 'delegations', label: 'Active delegations held', source: 'delegations', unit: 'item' }),
  Object.freeze({ key: 'goals', label: 'Active goals owned', source: 'goals', unit: 'goal' }),
  Object.freeze({ key: 'cases', label: 'Open cases owned', source: 'cases', unit: 'case' }),
  Object.freeze({ key: 'escalations', label: 'Escalations routed to the manager', source: 'escalations', unit: 'escalation' }),
  Object.freeze({ key: 'forums', label: 'Operating forums chaired', source: 'forums', unit: 'forum' }),
]);
export const MHH_PORTFOLIO_KEYS = Object.freeze(MHH_PORTFOLIO_CATEGORIES.map((row) => row.key));

export const MHH_REASON_KINDS = Object.freeze([
  Object.freeze({ key: 'line-exit', label: 'The manager’s reporting line ended' }),
  Object.freeze({ key: 'reorganisation', label: 'A reorganisation dissolved or moved the role' }),
  Object.freeze({ key: 'planned-succession', label: 'A planned succession of the role' }),
  Object.freeze({ key: 'role-redesign', label: 'The role was redesigned and re-staffed' }),
  Object.freeze({ key: 'other', label: 'Other — describe the transition' }),
]);
export const MHH_REASON_KEYS = Object.freeze(MHH_REASON_KINDS.map((row) => row.key));

export const MHH_ACT_KINDS = Object.freeze(['portfolio-brief', 'acceptance', 'release', 'dispute']);

export const MHH_STATES = Object.freeze([
  Object.freeze({ key: 'declared', label: 'Transition declared — outgoing portfolio brief not yet recorded' }),
  Object.freeze({ key: 'briefed', label: 'Portfolio brief recorded — successor acceptance still owed' }),
  Object.freeze({ key: 'accepted', label: 'Successor accepted — governor release of the outgoing authority still owed' }),
  Object.freeze({ key: 'released', label: 'Governor released the outgoing authority after acceptance' }),
  Object.freeze({ key: 'disputed', label: 'Successor disputed the handover — joint seat above every line of both managers is asked' }),
  Object.freeze({ key: 'lapsed', label: 'Planned effective date passed with no acceptance and no dispute — no automatic transfer' }),
  Object.freeze({ key: 'record-integrity-defect', label: 'Record integrity defect — no new act accepted until the stream is readable' }),
]);
export const MHH_STATE_KEYS = Object.freeze(MHH_STATES.map((row) => row.key));

export const MHH_REFUSALS = Object.freeze({
  notSeated: 'The declared operating seat is unresolved and read-only. Choose a valid seat first.',
  notFound: 'That managerial handover is not on this register. Nothing was saved.',
  released: 'This handover is already closed by the outgoing brief, the successor acceptance and the governor release. History is immutable; declare a new transition if the role changes again.',
  identityAttestation: 'Confirm that you are the selected person and are recording your own act. This local assertion is not authentication.',
  actorNotPerson: 'A first-person act needs an active roster person. The synthetic workspace operator cannot hold a managerial key.',
  actorSeatMismatch: 'A declared leadership seat cannot act as another person. Switch to that person’s valid seat or use the configured identity flow.',
});

export const MHH_METHOD = Object.freeze({
  engine: MHH_ENGINE_VERSION,
  adr: MHH_ADR,
  frameworks: Object.freeze([
    'High-reliability organizing (Weick & Sutcliffe; Patterson et al. 2004): a boundary transfer is an explicit, rehearsed act — the outgoing holder states what they held, and the incoming holder synthesizes it in their own words. Silent assumption of a role is refused.',
    'Two-key control (as in the shift-handover ledger, ADR-0223): the outgoing manager’s first-person portfolio brief AND the successor’s own dated acceptance are both required. Neither the declarer, the governor nor elapsed time completes the handover.',
    'Matrix accountability (ADR-0140/ADR-0141): a dispute is escalated to the lowest joint apex set above EVERY active reporting line of BOTH the outgoing manager and the successor. A diamond tie is a set of duties, not a winner, and the synthetic workspace leader is never an askable seat.',
    'Jaques (1956/1964) and Rummler–Brache (1990): a role is the time-horizon and the output it owns. The portfolio the register reads — delegations, goals, cases, escalations, forums — is the role measured against what the record already knows, not a form re-entered by hand.',
    'Subsidiarity (Jensen & Meckling 1995; Aghion & Tirole 1997): authority is released by the governor only after the successor has accepted the portfolio. Authority is not inherited by date.',
  ]),
  invariants: Object.freeze([
    'A handover record is a declared transition plus an append-only act stream; no stored status completes it. State is derived on every read.',
    'The outgoing portfolio brief is the departing manager’s first-person act, or a manager strictly above them. The successor acceptance is the successor’s own first-person act. The governor release is the declaring authority’s act and requires the acceptance to exist.',
    'A successor dispute routes to every minimal Director+ joint apex above EVERY reporting line of both managers; no single manager is elected the owner of the resolution, and a graph that cannot name such a seat writes an identity-free marker and asks nobody.',
    'Person-bound obligations (delegations held for a named person) are checked against the successor’s live lines: a delegation whose person sits on no line of the successor is counted as cross-line, printed with its reason, and never silently transferred or auto-assigned.',
    'A planned effective date that passes without acceptance and without dispute prints `lapsed`. Lapse is a printed failure state, never an automatic transfer of obligations.',
    '`countsReconcile` proves the printed portfolio is the sum of the category rows; `figuresComplete` separately reports refused categories, integrity defects and unreadable matrix routes.',
    'The register measures a transition, never a person: no handover volume, acceptance rate or performance score for any manager is produced or exported.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No automatic reassignment of delegations, goals, cases, escalations or forums. The successor acceptance is a human key, never inferred from silence, a deadline or a task completion.',
    'No inheritance of authority by date: the governor release requires the two prior keys and is itself a dated human act.',
    'No second hierarchy: the register reads the existing chain and Matrix graph and adds no reporting line of its own.',
    'No person-level transition volume, ranking or performance inference is exposed or exported; aggregate CSV counts are withheld below the declared floor of three, with complementary suppression of the whole numeric release.',
    'No authentication: a local self-attestation that a user is the selected person is not identity. Signed identity, non-repudiation and tenant isolation require a separate authenticated service.',
  ]),
});

export const MHH_CSV_COLUMNS = Object.freeze([
  'as_of', 'row_kind', 'key', 'declared', 'briefed', 'accepted', 'released',
  'disputed', 'lapsed', 'portfolio_items', 'blank_reason',
]);

export const MHH_CSV_DESCRIPTOR = Object.freeze({
  key: MHH_CSV_SCOPE,
  label: 'Managerial portfolio handover (aggregate)',
  group: 'operations',
  sensitive: true,
  filenameSlug: 'manager-portfolio-handover',
  description: 'One summary row, one row per derived handover state and one row per declared portfolio category. Aggregate counts only: no manager, successor, governor, role reference, portfolio item or act text crosses the export boundary. The whole numeric release is blank when any cell is below three or the claim is incomplete, preventing direct small-cell release and subtraction through complementary totals.'
});

export const MHH_SECTION_TITLES = Object.freeze({
  handovers: 'Transitions',
  acts: 'Act history',
  method: 'Method & limits',
});
