/**
 * app/core/domain/domainSenseRules.js — `RULE-DSN-01`, reader-only (ADR-0228,
 * Schema v186). The shared post-commit spine is pinned and is NOT extended by
 * this register; every write re-proves its right inside the action, and the
 * reader (`buildDomainSense`) refuses anything it cannot verify.
 *
 * RULE-DSN-01 — Decision-Domain Sensing Register.
 *
 *   1. A decision is DECLARED once: its title, owner, panel (each member on a
 *      declared line) and sensing window are human declarations. Nothing is
 *      inferred from a case, a strategy cycle, a risk statement or the
 *      reporting graph.
 *   2. A reading counts only from a declared panel member, once, on the line
 *      declared for that member, and never from the owner. A reading whose
 *      evidence basis does not support its stated domain is refused and
 *      printed, never counted.
 *   3. A domain is stated only when quorum is met (two readings from two
 *      distinct lines) AND every counted reading names the same domain. A
 *      split is printed as contested; majority is never used.
 *   4. One mode commitment per decision, by the owner only; a second is
 *      refused and the first stands.
 *   5. Fit is judged only against an agreed domain, comparing the committed
 *      mode with the one mode that fits it. Reported, never enforced.
 *
 * This module registers NO post-commit spine rule. The spine length is
 * unchanged by this register. The rule is enforced in the reader and in
 * every seat-checked write action instead.
 */

export const DSN_RULE_ID = 'RULE-DSN-01';

export const DSN_RULE = {
  id: DSN_RULE_ID,
  adr: 'ADR-0228',
  schemaVersion: 186,
  title: 'Decision-Domain Sensing Register (Cynefin)',
  registration: 'reader-only',
  spineRegistered: false,
  enforcedBy: ['buildDomainSense', 'domainDeclare', 'domainAssess', 'domainCommit'],
  invariants: [
    'A domain is stated only when quorum is met and every counted reading names the same domain.',
    'A reading counts only from a declared panel member, once, on the declared line, never from the owner.',
    'A reading whose evidence basis does not support its domain is refused and printed, never counted.',
    'One mode commitment per decision, by the owner only; a second is refused and the first stands.',
    'Fit is read against the agreed domain and reported; it never blocks or changes a decision.',
  ],
};

export default DSN_RULE;
