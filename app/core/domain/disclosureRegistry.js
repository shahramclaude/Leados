/**
 * app/core/domain/disclosureRegistry.js — the Disclosure Compiler's frozen
 * vocabulary (Schema v90, ADR-0086).
 *
 * ADR-0076 built the Operating Seat and refused 84 of 89 routes under a declared
 * seat, on purpose: "this legacy module has not yet completed its seat-scoped
 * read audit". That refusal was honest, and it was also the single largest
 * product gap in the workspace — a director could declare their seat and then
 * find almost nothing they do for a living on the screen. Sessions 116–123 each
 * listed "reviewed adapters for legacy modules, one module at a time" as the
 * follow-up, and each session ran out of road before the catalogue was covered.
 *
 * This module makes that audit a DECLARATION rather than a hand-written adapter:
 *
 *   MANIFEST  — every module states its collections, its record class, and the
 *               fields an altitude-appropriate aggregate can be computed from.
 *   COMPILER  — one generic walk turns (manifest × seat × grant ledger) into a
 *               POSTURE per route: detail, aggregate, or withheld with a reason.
 *   ORACLE    — `tests/app/disclosure-compiler.test.mjs` navigates every route at
 *               four altitudes and fails if a single out-of-span sentinel string
 *               reaches the DOM. A module is never opened because someone read
 *               it carefully; it is opened because the leak oracle could not
 *               break it.
 *
 * Nothing in this file performs I/O, reads a clock or touches the DOM.
 */

export const DISCLOSURE_ENGINE_VERSION = 'disclosure-compiler-2026.11-v1';

/** Postures a route can hold at a declared seat. */
export const DISCLOSURE_POSTURES = Object.freeze({
  DETAIL: 'detail',
  AGGREGATE: 'aggregate',
  WITHHELD: 'withheld',
});

/** How a manifest is allowed to behave. `aggregate` never renders the legacy
 * view under a seat; `adaptive` does, inside the class's own rank window. */
export const DISCLOSURE_MODES = Object.freeze({
  ADAPTIVE: 'adaptive',
  AGGREGATE: 'aggregate',
});

export const GRANT_STATUSES = Object.freeze(['requested', 'granted', 'refused', 'revoked', 'expired']);

export const DISCLOSURE_EVENTS = Object.freeze({
  REQUESTED: 'disclosure.requested',
  CONSENTED: 'disclosure.consented',
  REFUSED: 'disclosure.refused',
  REVOKED: 'disclosure.revoked',
  SCAN: 'disclosure.scan',
  AUTOPROPAGATE: 'disclosure.autopropagate',
});

export const DISCLOSURE_RULE_IDS = Object.freeze({
  /** One governed decision + one owner-consent task per released request. */
  OPEN: 'RULE-DSC-01',
  /** Expired grants stop authorising reads, and a granted span is re-reviewed. */
  SWEEP: 'RULE-DSC-02',
});

export const DISCLOSURE_LIMITS = Object.freeze({
  grants: 160,
  markers: 400,
  purposeChars: 400,
  history: 40,
  minPurposeChars: 12,
  minDays: 1,
  maxDays: 30,
  maxActivePerGrantee: 6,
  /** A grant lifts ONE record-class ceiling for ONE span. It is not a licence. */
  maxRoutesPerGrant: 1,
  reviewDays: 14,
});

export const DISCLOSURE_CONVENTION_DEFAULTS = Object.freeze({
  disclosureCellFloor: 5,
  disclosureMaxDays: 30,
  disclosureMaxActiveGrants: 6,
  disclosureReviewDays: 14,
  disclosureAutoPropagate: true,
});

/**
 * A grant may lift a ceiling; it may never lift a FLOOR. These classes are
 * structural privacy commitments (pay, parity, workforce transition), and a
 * manager cannot consent on behalf of a workforce to disclose them upward.
 */
export const GRANT_INELIGIBLE_CLASSES = Object.freeze(['enterprise']);

/** The graph relations a disclosed read writes. Declared in cases.js too. */
export const DISCLOSURE_RELATIONS = Object.freeze(['discloses-to', 'consented-by']);
