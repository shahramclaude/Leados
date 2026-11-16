/**
 * app/core/domain/riskConcentrationRegistry.js — closed vocabulary of the
 * shared-dependency concentration reading on the Enterprise Risk Appetite
 * register (ADR-0226, Schema v181 unchanged, `RULE-RCC-01`, CSV scope #169,
 * `#/risk-appetite?view=shared`).
 *
 * Pure leaf: zero imports, so schema, reader, rule, CSV export and view all
 * share one vocabulary without cycle risk.
 *
 * THE DUTY THIS VOCABULARY SERVES. Several declared risks can rely on one
 * dependency, and the register (ADR-0219) compares each retention with its
 * ceiling one risk at a time. It never asks what happens when they realise
 * together. The concentration reader (riskConcentration.js) joins declared
 * retention per shared dependency and compares the sum with the domain and
 * currency ceiling — but a sum that would exceed the ceiling is only a printed
 * verdict unless someone is asked to act on it. RULE-RCC-01 files that ask
 * once, to the seat above every line carrying the exposed risks, and it stays
 * filed until the record changes or a human answers it.
 *
 * No collection, no migration, no stored figure: the rule reads records the
 * workspace already holds and writes only delegations, typed links and
 * identity-free markers.
 */

export const RC_ENGINE_VERSION = 'risk-concentration-2026.11-v1';
export const RC_ADR = 'ADR-0226';
export const RC_RULE_ID = 'RULE-RCC-01';
export const RC_ROUTE = 'risk-appetite';
export const RC_HREF = '#/risk-appetite?view=shared';
export const RC_CSV_SCOPE = 'risk-concentration';
export const RC_MARKER_KIND = 'risk-concentration';

export const RC_EVENTS = Object.freeze({
  SCANNED: 'riskConcentration.scan',
});
export const RC_EVENT_PREFIX = 'riskConcentration.';

/**
 * One settings convention, stored like every other: the pause governs the
 * rule on commits and on explicit scans, and defaults to ON so a switch that
 * hides a would-exceed verdict is never the silent default.
 */
export const RC_SETTING_KEYS = Object.freeze({
  autoPropagate: 'riskConcentrationAutoPropagate',
});

export const RC_DEFAULTS = Object.freeze({
  autoPropagate: true,
});

export const RC_BOUNDS = Object.freeze({
  autoPropagate: 'boolean',
});

export const RC_LIMITS = Object.freeze({
  /** One bounded batch per commit; the remainder is counted and follows later. */
  asksPerCommit: 4,
  markersMax: 400,
  idMax: 96,
  signatureMax: 160,
  reasonMax: 64,
  /** One shared row is two or more live declared risks on one dependency. */
  sharedRowMinRisks: 2,
});

/** One condition kind, kept closed so a condition can never be misread as another. */
export const RCC_CONDITION_KINDS = Object.freeze({
  WOULD_EXCEED: 'concentration-would-exceed',
});

/* ------------------------------------------------------------------ CSV #169 */

/**
 * CSV scope #169 (ADR-0226, Schema v181 unchanged). AGGREGATE AND
 * IDENTITY-FREE BY CONSTRUCTION. One workspace summary row, one coverage-claims
 * row and one row per shared dependency row. A dependency exports under an
 * opaque sequential code — no dependency name, no person, no case id, no basis
 * text and no note crosses this boundary. A figure below the floor of three,
 * or one the reader cannot compute, exports BLANK with its reason, never zero.
 * Currencies are never pooled: each row carries exactly one currency.
 */
export const RC_CSV_COLUMNS = Object.freeze([
  'as_of', 'row_kind', 'key', 'domain', 'currency', 'dependency_code',
  'risks_n', 'domain_population_n', 'retained_together_cents',
  'share_of_domain_bp', 'declared_ceiling_cents', 'verdict', 'blank_reason',
]);

export const RC_CSV_DESCRIPTOR = Object.freeze({
  key: RC_CSV_SCOPE,
  label: 'Shared-dependency risk concentration (aggregate)',
  group: 'governance',
  sensitive: true,
  filenameSlug: 'risk-concentration',
  description: 'One summary row, one coverage-claims row and one row per shared dependency (dependency under an opaque code, domain, currency, number of declared risks relying on it, their combined declared retention, its exact basis-point share of the declared domain total, the declared ceiling and the verdict). No person, case, dependency name or note crosses this boundary; a figure below the floor of three, or one the reader cannot compute, exports BLANK with its reason, never zero.',
});

/** Floor of three for count cells: a count of one or two is suppressed rather than printed. */
export const RC_CSV_FLOOR = 3;

/* ---------------------------------------------------------------- ask text */

export function rcAskSummary(signature) {
  return `${RC_RULE_ID}|${signature}`;
}

export function parseRcAskSummary(summary) {
  if (typeof summary !== 'string' || !summary.startsWith(`${RC_RULE_ID}|`)) return null;
  const signature = summary.slice(RC_RULE_ID.length + 1).trim();
  return signature || null;
}
