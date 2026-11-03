/**
 * app/core/domain/altitudeRouterRegistry.js — Schema v88 / ADR-0081.
 *
 * "The Altitude Router": a natural-language situation note is classified into
 * modules AND into the correct organizational altitude (Jaques' time-span of
 * discretion), resolved onto a real seat in the reporting tree, and committed
 * in ONE atomic transaction that fans out across modules and up every
 * leadership ancestor with an altitude-appropriate disclosure form.
 *
 * This registry declares every id, event, limit and convention. It adds NO
 * second workflow engine: the case is created through the existing `addCase`
 * adoption seam, cross-module propagation is the existing post-commit spine
 * (ADR-0008), the hierarchy is `person.managerId` → `buildChain` / `buildSeats`
 * (ADR-0075/0076), and vertical roll-up is one more rule on that same spine.
 * Altitude is a dimension of the propagation engine, not a second system.
 */

export const ROUTER_VERSION = 'altitude-router-2026.11-v1';

/** Post-commit rule ids surfaced in the UI, the audit log and the brief. */
export const ROUTER_RULES = Object.freeze({
  ROLLUP: 'RULE-AR-01',   // typed disclosure ladder edges up every ancestor
  FLOOR: 'RULE-AR-02',    // one governed re-routing decision per breaching cell per ISO week
  MATURITY: 'RULE-AR-03', // one advisory audit marker when a cell reaches the evidence floor
});

export const ROUTER_EVENTS = Object.freeze({
  ANALYZED: 'routing.analyzed',
  CONFIRMED: 'routing.confirmed',
  DISMISSED: 'routing.dismissed',
  GRADED: 'routing.graded',
  SCAN: 'routing.scan',
  TRIGGER: 'routing.trigger',
  PROPAGATE: 'routing.propagate',
});

export const ROUTER_LIMITS = Object.freeze({
  plans: 80,            // bounded, capped plan/ledger ledger
  markers: 400,         // bounded, capped idempotency markers
  ladder: 8,            // max leadership ancestors in one roll-up path
  moduleRoutes: 6,      // max module routes per plan
  evidenceSpans: 12,    // max evidence spans stored per altitude inference
  noteChars: 8000,      // max source-note characters
  refusalReasons: 6,
});

export const ROUTER_PANELS = Object.freeze(['plan', 'ladder', 'ledger', 'calibration', 'brief']);

/**
 * Every number is a declared, editable convention — never a measured fact.
 * The two floors mirror the codebase's calibration ledgers (counts refused
 * below n=5) and the ITSM human-in-the-loop confidence gates.
 */
export const ROUTER_CONVENTION_DEFAULTS = Object.freeze({
  routingEvidenceFloor: 2.5,            // min weighted cue evidence before an altitude is offered
  routingReliabilityFloorPct: 70,       // agreement rate below which a cell opens a governed review
  routingCalibrationFloorN: 5,          // graded plans required before a rate is printed
  routingReviewDays: 14,                // review horizon for a governed re-routing decision
  routingAutoPropagate: true,           // pausable; an explicit scan always runs
});

/**
 * Why the disclosure ladder is not "role-based dashboards". At frontline and
 * manager rank the leader reads names and item detail; at director rank the
 * unit is a span (counts and rates, individual detail withheld); at executive
 * and chief rank the roll-up is an aggregate with the composition printed.
 * This is the ADR-0076 RECORD_CLASSES disclosure ladder, applied to ROUTING,
 * not a second copy of it.
 */
export const ROUTER_DISCLOSURE = Object.freeze({
  names: 'Names and item detail — the leader of the week owns the conversation.',
  unit: 'Unit leaders and exact counts — the director asks which span, not which person.',
  aggregate: 'Span aggregates only — the executive/chief asks what the org-level signal is; individual notes never climb.',
  local: 'Local workflow boundary, not authenticated multi-user security. Anyone controlling this browser or a full backup can access the workspace.',
  heuristic: 'Confidence bands are heuristic until at least five graded plans exist in a cell. A probability-like score is not an empirically calibrated probability.',
  simulation: 'A routing plan is a deterministic, fully explained classification. It is not a generative model, not a prediction of outcomes, and not an autonomous decision.',
});

/** FNV-1a 32-bit, rendered as 16 lowercase hex chars. Content addressing, not crypto. */
export function routerFingerprint(text) {
  const input = String(text ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Two independent 32-bit lanes reduce accidental collisions in short notes.
  let g = 0x9e3779b9;
  for (let i = input.length - 1; i >= 0; i -= 1) {
    g ^= input.charCodeAt(i) & 0xff;
    g = Math.imul(g, 0x85ebca6b) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0') + (g >>> 0).toString(16).padStart(8, '0');
}
