/**
 * app/core/domain/envoyRegistry.js — canonical vocabulary for the Federated
 * Envoy (`#/envoy`, ADR-0088).
 *
 * THE PROBLEM THIS NAMES
 * ----------------------
 * LeadOS is local-first: one operator, one browser, one encrypted blob. Every
 * recent decision record says the same honest thing in its limits section —
 * "the seat is a declaration, not authentication", because a hierarchy that
 * lives in one localStorage key cannot have two real workspaces in it. The
 * product's actual shape (five altitudes, one chain of command) therefore has
 * no way to be *actually* distributed the way a real company is: a span runs
 * its own record, and the altitude above it needs a governed summary.
 *
 * The Envoy is the smallest honest answer that does not require a server:
 * a **sealed packet** — a disclosure-scoped, hash-committed, optionally
 * key-signed bundle of the artefacts one span owes the altitude above it —
 * which another LeadOS workspace can verify and ingest without trusting the
 * sender, without a shared database, and without re-typing anything.
 *
 * WHAT IS DELIBERATELY NOT IN THIS FILE
 * -------------------------------------
 * No payload shapes (they live with the field whitelist in `envoy.js`), no
 * normalizers (they live in `envoySchema.js`), and no imports from modules that
 * import this one. This file is a leaf so `schema.js`, `envoy.js`,
 * `envoyRules.js`, `propagationContracts.js`, `csv.js` and the view can all
 * share one vocabulary without a cycle.
 */

import { ALTITUDES, altitudeByKey, altitudeRank } from './chainRegistry.js';

export const ENVOY_ENGINE_VERSION = 'federated-envoy-2026.11-v1';

export const ENVOY_FORMAT = 'leados.envoy.packet';
export const ENVOY_VERSION = 1;

/* ------------------------------------------------------------------- kinds */

/**
 * The artefact kinds a packet may carry. Each is a record the sending
 * workspace already holds, projected through a field whitelist — never a new
 * record type, and never raw user text beyond the declared field lengths.
 */
export const ENVOY_KINDS = Object.freeze(['case', 'decision', 'mandate', 'pact']);

export const ENVOY_KIND_LABELS = Object.freeze({
  case: 'Operational case',
  decision: 'Decision',
  mandate: 'Authority contract',
  pact: 'Strategy pact',
});

/* --------------------------------------------------------------- disclosure */

/**
 * The disclosure ladder, ascending in detail. A packet is *built for* a
 * receiving altitude: the higher the receiver sits, the less detail travels.
 * This is the same direction the rest of the workspace uses (`names` at ranks
 * 1–2, `unit` at rank 3, `aggregate` above), expressed as an explicit class so
 * an item can be measured against it instead of guessed.
 */
export const ENVOY_CLASSES = Object.freeze(['aggregate', 'unit', 'names', 'detail']);

export const ENVOY_CLASS_RANK = Object.freeze({ aggregate: 0, unit: 1, names: 2, detail: 3 });

export const ENVOY_CLASS_LABELS = Object.freeze({
  aggregate: 'Aggregate only (counts; no titles, dates or ids of other workspaces)',
  unit: 'Unit level (kind, status, dates, severity — no titles)',
  names: 'Named (titles and outcomes travel)',
  detail: 'Detail (every declared field in the payload)',
});

/** The most detail a receiving altitude may hold. Rank 1 sees most, rank 5 least. */
export function classForReceivingRank(rank) {
  const n = Number.isFinite(Number(rank)) ? Math.round(Number(rank)) : 5;
  if (n <= 1) return 'detail';
  if (n === 2) return 'names';
  if (n === 3) return 'unit';
  return 'aggregate';
}

/** The most detail a record's own span may publish outward at its altitude. */
export function classForSendingRank(rank) {
  return classForReceivingRank(rank);
}

export function classRank(cls) {
  const n = ENVOY_CLASS_RANK[cls];
  return Number.isFinite(n) ? n : -1;
}

/* ------------------------------------------------------------------ payloads */

/**
 * The field whitelist, per kind. Each field declares the disclosure class at
 * which it may travel and the only type it may take. A payload is built by
 * projecting a real record through this table at the receiving class — nothing
 * outside it can enter a packet, and no field can arrive with an undeclared
 * type. `aggregate` fields are numbers and enum words that identify nobody.
 *
 * DELIBERATELY STABLE. No field here is recomputed from "now" (an age in days,
 * a countdown, a rolling rate). A packet is a statement about a record, and a
 * statement that changes every midnight would make the *same* record arrive
 * looking divergent on every re-send — which is the one thing a divergence
 * detector must never do. Ages and countdowns live in the packet's aggregate
 * attestation (which is expected to move) and in the local reading, not in an
 * item's content hash.
 */
export const ENVOY_FIELDS = Object.freeze({
  case: Object.freeze([
    Object.freeze({ key: 'kind', cls: 'aggregate', type: 'text', max: 40 }),
    Object.freeze({ key: 'status', cls: 'aggregate', type: 'text', max: 20 }),
    Object.freeze({ key: 'severity', cls: 'unit', type: 'int', min: 1, max: 10 }),
    Object.freeze({ key: 'openedOn', cls: 'unit', type: 'day' }),
    Object.freeze({ key: 'valueCurrency', cls: 'unit', type: 'text', max: 3 }),
    Object.freeze({ key: 'valueAmount', cls: 'unit', type: 'int', min: 0, max: 1_000_000_000 }),
    Object.freeze({ key: 'title', cls: 'names', type: 'text', max: 160 }),
  ]),
  decision: Object.freeze([
    Object.freeze({ key: 'status', cls: 'aggregate', type: 'text', max: 20 }),
    Object.freeze({ key: 'reversibility', cls: 'unit', type: 'text', max: 20 }),
    Object.freeze({ key: 'date', cls: 'unit', type: 'day' }),
    Object.freeze({ key: 'decidedOn', cls: 'unit', type: 'day' }),
    Object.freeze({ key: 'title', cls: 'names', type: 'text', max: 160 }),
  ]),
  mandate: Object.freeze([
    Object.freeze({ key: 'status', cls: 'aggregate', type: 'text', max: 20 }),
    Object.freeze({ key: 'actionClass', cls: 'unit', type: 'text', max: 60 }),
    Object.freeze({ key: 'expiresOn', cls: 'unit', type: 'day' }),
    Object.freeze({ key: 'outcome', cls: 'names', type: 'text', max: 160 }),
  ]),
  pact: Object.freeze([
    Object.freeze({ key: 'status', cls: 'aggregate', type: 'text', max: 20 }),
    Object.freeze({ key: 'horizonDays', cls: 'aggregate', type: 'int', min: 1, max: 365 }),
    Object.freeze({ key: 'rounds', cls: 'aggregate', type: 'int', min: 0, max: 99 }),
    Object.freeze({ key: 'leadingTargetPct', cls: 'unit', type: 'int', min: 0, max: 100 }),
    Object.freeze({ key: 'laggingTargetPct', cls: 'unit', type: 'int', min: 0, max: 100 }),
    Object.freeze({ key: 'title', cls: 'names', type: 'text', max: 160 }),
  ]),
});

export function fieldsForKind(kind) {
  return ENVOY_FIELDS[kind] || null;
}

/* -------------------------------------------------------------- packet state */

export const ENVOY_DIRECTIONS = Object.freeze(['outbound', 'inbound']);

export const ENVOY_STATUSES = Object.freeze(['built', 'verified', 'ingested', 'refused']);

export const ENVOY_STATUS_LABELS = Object.freeze({
  built: 'Built — not yet verified by a receiver',
  verified: 'Verified — integrity checked, not ingested',
  ingested: 'Ingested — artefacts recorded in this workspace',
  refused: 'Refused — nothing was written',
});

export const ENVOY_ARTEFACT_STATUSES = Object.freeze(['imported', 'duplicate', 'diverged', 'withheld']);

export const ENVOY_ARTEFACT_STATUS_LABELS = Object.freeze({
  imported: 'Imported (attested copy)',
  duplicate: 'Already held — identical content',
  diverged: 'Divergent — the two workspaces disagree about this record',
  withheld: 'Withheld — above this altitude’s disclosure class',
});

/* ---------------------------------------------------------------- failures */

/**
 * Typed verification failures. Each one names exactly what was recomputed, so
 * a refusal is auditable rather than a shrug. Order is the order verification
 * checks them in — the first failure is the one printed as the reason.
 */
export const ENVOY_FAILURES = Object.freeze([
  'format',
  'version',
  'schema-ahead',
  'shape',
  'size',
  'item-hash',
  'duplicate-item',
  'merkle-root',
  'packet-id',
  'signature',
  'signature-required',
  'altitude-mismatch',
]);

export const ENVOY_FAILURE_LABELS = Object.freeze({
  format: 'The envelope is not a LeadOS Envoy packet',
  version: 'The packet format version is not one this build can read',
  'schema-ahead': 'The packet was written by a newer workspace schema than this one',
  shape: 'A required packet field is missing or malformed',
  size: 'The packet exceeds this workspace’s declared item or payload bound',
  'item-hash': 'An item’s content does not match the hash the packet carries for it',
  'duplicate-item': 'The same origin record appears twice with different content',
  'merkle-root': 'The recomputed Merkle root does not match the packet’s root',
  'packet-id': 'The recomputed packet identity does not match the packet’s own identity',
  signature: 'The signature does not verify against the packet’s root',
  'signature-required': 'This workspace requires a key-signed packet and this one is unkeyed',
  'altitude-mismatch': 'The packet was built for a different receiving altitude than this seat',
});

/* ------------------------------------------------------------------ settings */

export const ENVOY_DEFAULTS = Object.freeze({
  envoyMaxItems: 60,
  envoyRequireKeyedSignature: true,
  envoyDivergenceReviewDays: 14,
  envoyAttestationRiskFloorPct: 25,
  envoyAutoPropagate: true,
});

export const ENVOY_BOUNDS = Object.freeze({
  envoyMaxItems: Object.freeze([1, 200]),
  envoyDivergenceReviewDays: Object.freeze([3, 60]),
  envoyAttestationRiskFloorPct: Object.freeze([0, 100]),
});

/* -------------------------------------------------------------------- limits */

export const ENVOY_LIMITS = Object.freeze({
  /** Packet ledger rows kept in the workspace. */
  packets: 400,
  /** Attested artefact rows kept. */
  artefacts: 6000,
  /** Idempotency/audit markers kept. */
  markers: 1500,
  /** Items per packet (hard bound, independent of the setting). */
  items: 200,
  /** Characters of free text per declared field. */
  textChars: 200,
  /** Purpose line on a packet. */
  purposeChars: 240,
  /** Workspace label characters. */
  labelChars: 80,
  /** Merkle leaves digested per packet (sanity bound). */
  merkleLeaves: 200,
  /** A packet larger than this many JSON characters is refused unread. */
  packetChars: 2_000_000,
});

/* ------------------------------------------------------------------- events */

export const ENVOY_EVENTS = Object.freeze({
  COMPOSED: 'envoy.composed',
  VERIFIED: 'envoy.verified',
  INGESTED: 'envoy.ingested',
  REFUSED: 'envoy.refused',
  SCAN: 'envoy.scan',
  CONVENTIONS: 'envoy.conventions',
  TRIGGER: 'envoy.trigger',
});

/** Events whose prefix marks this module's own operational work. */
export const ENVOY_TRIGGER_PREFIX = 'envoy.';

/* -------------------------------------------------------------------- rules */

export const ENVOY_RULES = Object.freeze({
  ROLLUP: 'RULE-ENV-01',
  DIVERGENCE: 'RULE-ENV-02',
  ATTESTATION: 'RULE-ENV-03',
});

export const ENVOY_RULE_LABELS = Object.freeze({
  'RULE-ENV-01': 'Cross-altitude carriage — an ingested packet rolls up every leadership ancestor of the receiving span in the same transaction',
  'RULE-ENV-02': 'Divergence reconciliation — one governed decision per disagreed record per ISO week, and no silent overwrite',
  'RULE-ENV-03': 'Attested exposure — one governed review when a verified packet’s open-critical share clears the declared floor',
});

/* --------------------------------------------------------------- conventions */

/** How long a span’s last verified inbound packet stays “current”. */
export const ENVOY_COVERAGE_WINDOW_DAYS = 30;

/** Small-cell floor for any rate this module publishes. */
export const ENVOY_CELL_FLOOR = 3;

/** Free-text purposes cannot smuggle a person-level verdict. */
export const ENVOY_BLAME_TERMS = Object.freeze([
  'underperform',
  'incompetent',
  'lazy',
  'poor performer',
  'not good enough',
  'low performer',
  'dead weight',
]);

export const ENVOY_PREMISE =
  'A hierarchy that lives in one browser is a diagram of a hierarchy. The Envoy makes the chain of command actual across installations: each span publishes a sealed, disclosure-scoped packet of what the altitude above it is owed, the receiving workspace recomputes every hash before it reads a single field, and a disagreement between the two records becomes a governed decision instead of a silent overwrite. No server, no shared database, no re-typing — and no claim that this is authentication.';

/** The altitude list, in ascending rank, for the compose/recipient controls. */
export function envoyAltitudes() {
  return ALTITUDES.map((a) => ({ key: a.key, rank: a.rank, label: a.label, horizonDays: a.horizonDays }));
}

export function altitudeLabelForKey(key) {
  return altitudeByKey(key)?.label || 'Unresolved altitude';
}

export function rankForKey(key) {
  return altitudeRank(key);
}
