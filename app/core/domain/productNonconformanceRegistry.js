/**
 * app/core/domain/productNonconformanceRegistry.js — the closed vocabulary for
 * product nonconformance containment and disposition (ADR-0253, Schema v206,
 * `#/nonconformance`, CSV #192).
 *
 * A lot or serial identifier, requirement, observed failure and source reference
 * are declared by a person. A complete containment is a recorded attestation
 * against a written hold reference; it is NOT an ERP/MES lock and cannot physically
 * prevent picking, shipment or use. Disposition is a separate decision. If more
 * than one minimal common matrix apex exists, every apex must sign the same
 * disposition in the same round. Rework is not releasable until a different,
 * strictly senior matrix seat records a passing re-verification. A failed
 * re-verification is kept and leaves the output held.
 *
 * This is not a CAPA/root-cause system, supplier portal, customer-notification
 * workflow or recall/field-action trace. It handles one internally identified
 * manufactured product lot/serial at a time. No quantities, risk classes, urgency
 * dates, disposition defaults or product status are inferred.
 */

export const QNC_ENGINE_VERSION = 'product-nonconformance-2026.11-v1';
export const QNC_ADR = 'ADR-0253';
export const QNC_RULE_ID = 'RULE-QNC-01';
export const QNC_ROUTE = 'nonconformance';
export const QNC_HREF = '#/nonconformance';
export const QNC_CSV_SCOPE = 'product-nonconformance';
export const QNC_EVENT_PREFIX = 'product-nonconformance.';
export const QNC_MARKER_KIND = 'product-nonconformance';

export const QNC_EVENTS = Object.freeze({
  OPENED: 'product-nonconformance.case.opened',
  CONTAINMENT_RECORDED: 'product-nonconformance.containment.recorded',
  DISPOSITION_SIGNED: 'product-nonconformance.disposition.signed',
  DISPOSITION_ACT_RECORDED: 'product-nonconformance.disposition.act-recorded',
  REVERIFICATION_RECORDED: 'product-nonconformance.reverification.recorded',
  CONVENTIONS_SET: 'product-nonconformance.conventions-set',
  SCANNED: 'product-nonconformance.scan',
});

export const QNC_RIGHTS = Object.freeze({
  READ: 'read-product-nonconformance',
  OPEN: 'open-product-nonconformance',
  CONTAIN: 'contain-product-output',
  DECIDE: 'decide-product-disposition',
  ACT: 'perform-product-disposition',
  VERIFY: 'verify-product-rework',
  GOVERN: 'govern-product-nonconformance',
});

/**
 * WHAT THE CASE IDENTIFIES. One case names ONE kind of identifier and its value:
 * a manufacturing lot, or an individual serial number. The kind is a declared
 * field rather than two optional fields, because a record that carried both would
 * leave the reader guessing which one the evidence describes — and a record that
 * carried neither would be a case about "some output".
 */
export const QNC_IDENTIFIER_KINDS = Object.freeze([
  Object.freeze({ key: 'lot', label: 'Manufacturing lot', says: 'The finding applies to one identified production lot.' }),
  Object.freeze({ key: 'serial', label: 'Serial number / individual unit', says: 'The finding applies to one identified serialised unit.' }),
]);
export const QNC_IDENTIFIER_KIND_KEYS = Object.freeze(QNC_IDENTIFIER_KINDS.map((row) => row.key));
export const QNC_IDENTIFIER_KIND_BY_KEY = Object.freeze(Object.fromEntries(QNC_IDENTIFIER_KINDS.map((row) => [row.key, row])));

export const QNC_SETTING_KEYS = Object.freeze({ autoPropagate: 'qncAutoPropagate' });
export const QNC_BOUNDS = Object.freeze({});

/** Refusals printed at the door. Each names the control it is enforcing. */
export const QNC_REFUSALS = Object.freeze({
  notSeated: 'The operating seat is unresolved, so no product case may be opened, contained, decided or released. Declare a valid seat first.',
  noReach: 'This seat does not hold that person on an active reporting line or declared matrix line, so it cannot put that hand on a product case.',
  notFound: 'That product case is not on the record. Nothing was saved.',
  unreadable: 'The row could not be read back by this register’s own loader, so nothing was saved.',
  ledgerFull: 'The ledger is at its declared limit. Export or archive the workspace before adding another row.',
  noHold: 'No containment act attests that the whole identified output is under control, so no disposition may be decided. Record the containment first.',
  noAuthority: 'The live matrix does not resolve every accountable hand to a joint decision seat, so no disposition may be decided and nobody is substituted.',
  notApex: 'This seat is not one of the current joint decision seats for this case. The disposition is signed by the matrix apex above the accountable lines, never by whoever asks first.',
  notYourCase: 'This seat neither declared this case nor holds one of its accountable hands, so it cannot record an act against it.',
  actNotAllowed: 'The current derived state does not allow that act. The register prints which act it is waiting for; nothing was saved.',
  concessionMissing: 'A use-as-is disposition needs the written concession reference it rests on. Without one there is no concession, only an informal decision.',
  verifierNotSenior: 'Re-verification must be recorded by a DIFFERENT hand that is strictly senior to the person who completed the rework on the live reporting graph. A peer, a subordinate, the person themselves or a seat outside the graph cannot release this output, and nothing was saved.',
  alreadySigned: 'This seat has already signed this decision round. A second signature from the same hand cannot complete a joint decision.',
  roundClosed: 'That decision round is closed. The register opened the next round; sign the disposition in the round it prints.',
  outcomeInvalid: 'Record whether the re-worked output passed or failed re-verification. The register never infers a verdict from the presence of evidence.',
});

export const QNC_LIMITS = Object.freeze({
  cases: 1000,
  containments: 5000,
  decisions: 8000,
  dispositionActs: 8000,
  verifications: 8000,
  markers: 1000,
  ownersMax: 4,
  approversMax: 12,
  decisionRoundsMax: 100,
  textMin: 24,
  textMax: 600,
  refMin: 12,
  refMax: 120,
  shortMin: 3,
  shortMax: 120,
});

export const QNC_SOURCES = Object.freeze([
  Object.freeze({ key: 'incoming-inspection', label: 'Incoming inspection' }),
  Object.freeze({ key: 'in-process-inspection', label: 'In-process inspection' }),
  Object.freeze({ key: 'final-inspection', label: 'Final inspection' }),
  Object.freeze({ key: 'supplier-notice', label: 'Supplier notice' }),
  Object.freeze({ key: 'customer-notice', label: 'Customer notice' }),
  Object.freeze({ key: 'other', label: 'Other declared source' }),
]);
export const QNC_SOURCE_KEYS = Object.freeze(QNC_SOURCES.map((row) => row.key));
export const QNC_SOURCE_BY_KEY = Object.freeze(Object.fromEntries(QNC_SOURCES.map((row) => [row.key, row])));

export const QNC_CONTAINMENT_METHODS = Object.freeze([
  Object.freeze({ key: 'segregated', label: 'Physically segregated and identified' }),
  Object.freeze({ key: 'system-blocked', label: 'System hold recorded' }),
  Object.freeze({ key: 'shipment-stopped', label: 'Shipment or issue stopped' }),
  Object.freeze({ key: 'other', label: 'Other declared control' }),
]);
export const QNC_CONTAINMENT_METHOD_KEYS = Object.freeze(QNC_CONTAINMENT_METHODS.map((row) => row.key));
export const QNC_CONTAINMENT_METHOD_BY_KEY = Object.freeze(Object.fromEntries(QNC_CONTAINMENT_METHODS.map((row) => [row.key, row])));

export const QNC_DISPOSITIONS = Object.freeze([
  Object.freeze({ key: 'rework', label: 'Correct / rework', terminal: false,
    says: 'Record the work, then independently re-verify conformity before any release.' }),
  Object.freeze({ key: 'return', label: 'Return to supplier', terminal: true,
    says: 'Record the return evidence. The case closes as returned, never as released for use.' }),
  Object.freeze({ key: 'scrap', label: 'Scrap / destroy', terminal: true,
    says: 'Record the disposal evidence. The case closes as scrapped, never as released for use.' }),
  Object.freeze({ key: 'use-as-is', label: 'Accept under concession', terminal: false,
    says: 'A written concession reference is mandatory; record the release separately.' }),
]);
export const QNC_DISPOSITION_KEYS = Object.freeze(QNC_DISPOSITIONS.map((row) => row.key));
export const QNC_DISPOSITION_BY_KEY = Object.freeze(Object.fromEntries(QNC_DISPOSITIONS.map((row) => [row.key, row])));

export const QNC_ACT_KINDS = Object.freeze([
  Object.freeze({ key: 'rework-completed', label: 'Rework completed' }),
  Object.freeze({ key: 'returned', label: 'Returned to supplier' }),
  Object.freeze({ key: 'scrapped', label: 'Scrapped / destroyed' }),
  Object.freeze({ key: 'released-after-rework', label: 'Released after re-verification' }),
  Object.freeze({ key: 'released-under-concession', label: 'Released under written concession' }),
]);
export const QNC_ACT_KIND_KEYS = Object.freeze(QNC_ACT_KINDS.map((row) => row.key));
export const QNC_ACT_KIND_BY_KEY = Object.freeze(Object.fromEntries(QNC_ACT_KINDS.map((row) => [row.key, row])));

/** Each state is a record fact; none is persisted. */
export const QNC_STATES = Object.freeze([
  Object.freeze({ key: 'containment-missing', label: 'Containment not recorded', tone: 'bad', says: 'A product case is on the record, but no containment act is recorded. The register has not placed a physical or system hold.' }),
  Object.freeze({ key: 'containment-partial', label: 'Containment partial', tone: 'bad', says: 'Some containment evidence is recorded, but no act attests that the whole identified lot or serial is under control.' }),
  Object.freeze({ key: 'authority-unresolved', label: 'Disposition authority unresolved', tone: 'bad', says: 'The live matrix cannot resolve every accountable owner to a joint decision seat. Nobody is substituted.' }),
  Object.freeze({ key: 'decision-pending', label: 'Disposition decision owed', tone: 'warn', says: 'The identified output is contained, but the current joint matrix apex has not recorded a disposition.' }),
  Object.freeze({ key: 'awaiting-joint-approval', label: 'Joint decision incomplete', tone: 'warn', says: 'Not every required matrix apex has signed the same disposition in this round. No disposition may be carried out.' }),
  Object.freeze({ key: 'decision-disagreement', label: 'Disposition disagreement', tone: 'bad', says: 'Required matrix apexes have recorded different dispositions. Nothing is selected by majority or first-write-wins.' }),
  Object.freeze({ key: 'authority-changed', label: 'Matrix authority changed', tone: 'bad', says: 'Earlier signatures were made under a different matrix route. The current joint apex must decide; old signatures remain in history.' }),
  Object.freeze({ key: 'rework-pending', label: 'Rework action owed', tone: 'warn', says: 'The current joint disposition is rework, but no completion evidence is recorded.' }),
  Object.freeze({ key: 'reverification-pending', label: 'Re-verification owed', tone: 'bad', says: 'Rework is recorded, but no independent passing re-verification is recorded. The output remains held.' }),
  Object.freeze({ key: 'reverification-failed', label: 'Re-verification failed', tone: 'bad', says: 'The output failed re-verification. The failure is retained and the lot stays held; a new rework cycle or disposition is required.' }),
  Object.freeze({ key: 'release-pending', label: 'Release act owed', tone: 'warn', says: 'A passing re-verification or accepted concession is on the record, but release evidence is not.' }),
  Object.freeze({ key: 'return-pending', label: 'Return action owed', tone: 'warn', says: 'Return was authorized, but evidence that the lot was returned is not recorded.' }),
  Object.freeze({ key: 'scrap-pending', label: 'Scrap action owed', tone: 'warn', says: 'Scrap was authorized, but evidence that the lot was destroyed or scrapped is not recorded.' }),
  Object.freeze({ key: 'record-conflict', label: 'Disposition record conflict', tone: 'bad', says: 'The append-only acts conflict or do not follow an approved disposition. No release is recognized; preserve the hold and resolve the source record.' }),
  Object.freeze({ key: 'closed-rework', label: 'Released after rework', tone: 'good', says: 'The authorized rework was independently re-verified as passing and a separate release act is recorded.' }),
  Object.freeze({ key: 'closed-returned', label: 'Returned', tone: 'neutral', says: 'The authorized return is recorded. This output was not released for use.' }),
  Object.freeze({ key: 'closed-scrapped', label: 'Scrapped', tone: 'neutral', says: 'The authorized scrap is recorded. This output was not released for use.' }),
  Object.freeze({ key: 'closed-concession', label: 'Released under concession', tone: 'warn', says: 'A written concession was recorded by the joint authority and a separate release act is on the record.' }),
]);
export const QNC_STATE_KEYS = Object.freeze(QNC_STATES.map((row) => row.key));
export const QNC_STATE_BY_KEY = Object.freeze(Object.fromEntries(QNC_STATES.map((row) => [row.key, row])));
export const QNC_TERMINAL_STATE_KEYS = Object.freeze(['closed-rework', 'closed-returned', 'closed-scrapped', 'closed-concession']);

export const QNC_SECTION_TITLES = Object.freeze({
  cases: 'Output cases',
  worklist: 'My matrix duties',
  method: 'Method & limits',
});

export const QNC_CSV_COLUMNS = Object.freeze([
  'as_of', 'row_kind', 'state', 'cases_n', 'open_cases_n', 'full_containment_n',
  'containment_unproven_n', 'authority_unresolved_n', 'decision_owed_n',
  'verification_owed_n', 'release_owed_n', 'closed_n', 'privacy_floor', 'complete', 'blank_reason',
]);

/** CSV #192: identity-free counts only. No case, site, product, lot, person or evidence reference crosses this boundary. */
export const QNC_CSV_DESCRIPTOR = Object.freeze({
  key: QNC_CSV_SCOPE,
  label: 'Product nonconformance (aggregate)',
  group: 'operations',
  sensitive: true,
  filenameSlug: 'product-nonconformance',
  description: 'One summary row and one row per derived case state. Identity-free counts only: no case reference, site, product, lot, requirement, finding, person, manager, concession, evidence reference or act date is exported. Non-zero state counts below the fixed privacy floor of three are blank with a reason, never a small number. A total below the floor is also blank.',
});

/**
 * Method basis and limitations. This operational ledger is not a conformity
 * certificate, controlled procedure, or a statement of compliance with a
 * particular edition of ISO 9001.
 */
export const QNC_METHOD = Object.freeze({
  engine: QNC_ENGINE_VERSION,
  adr: QNC_ADR,
  frameworks: Object.freeze([
    'The workflow records identification, control, authorized disposition and verification as separate dated human acts. ISO 9001:2015 is withdrawn; the 2026 edition is current. This implementation has not been assessed against the 2026 text and makes no ISO conformity claim.',
    'MasterControl and Octave Reliance publicly describe configurable nonconformance intake, investigation, disposition and workflow routing. These are vendor-published category descriptions, not independent product trials; parity is [BENCHMARK-UNVERIFIED].',
    'Matrix Leadership (ADR-0140/0141): active reporting lines of every named accountable owner are resolved through the shared matrix engine. Every minimal joint apex must sign the same disposition; a matrix tie is never collapsed to one line.',
    'Bulletproof record integrity: no status, release, concession, containment or verification is inferred from a note. Each is a separate dated act; unsupported totals and below-floor export cells are withheld rather than shown as zero.',
  ]),
  printed: Object.freeze([
    'The declared product, site, lot/serial, requirement, finding, source evidence and accountable hands.',
    'The latest containment attestation and its external hold reference; partial containment never becomes full by addition or by elapsed time.',
    'The current matrix route, every required apex signature, any disagreement, and the distinct evidence for the selected disposition.',
    'Rework completion, an independent re-verification result, and a separate release; a failed re-verification remains visible and held.',
    'Return and scrap as terminal non-release outcomes; a use-as-is concession needs its written concession reference and a separate release act.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No ERP, MES, WMS, shipping or production-line connection: a recorded hold is not an enforced physical or electronic block.',
    'No automatic release, no default disposition, no invented product quantity, risk score or urgency window.',
    'No customer or regulator notification, delivered-lot trace, field correction, recall or return-material-authorisation workflow.',
    'No CAPA/root-cause analysis, supplier portal, document store, image evidence or certificate of conformity.',
    'No service-output cases, multi-lot campaign, split-lot quantity reconciliation or product genealogy graph.',
    'No person, site, product or line score; the register describes a case, never a person’s performance.',
  ]),
});