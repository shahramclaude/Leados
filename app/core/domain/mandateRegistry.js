/**
 * Decision Rights Exchange — shared vocabulary (ADR-0078).
 * A mandate is a bounded transfer of decision rights, not an approval checkbox.
 * Principal–agent theory (Jensen & Meckling 1976): make the authority, evidence
 * and return path explicit. This is a local workflow contract, NOT authentication.
 */
export const MANDATE_ENGINE_VERSION = 'decision-rights-2026.11-v1';
export const MANDATE_STATUSES = Object.freeze(['proposed', 'active', 'delivered', 'completed', 'returned', 'expired', 'revoked']);
export const MANDATE_OPEN_STATUSES = Object.freeze(['proposed', 'active', 'delivered']);
export const MANDATE_ACTIONS = Object.freeze({
  replan: 'Change sequence or priority within the existing outcome',
  spend: 'Commit expenditure only within the stated currency and ceiling',
  commit: 'Make a dated commitment within the stated outcome',
  reassign: 'Assign work inside the receiving span',
});
export const MANDATE_EVENTS = Object.freeze({
  PROPOSE: 'mandate.proposed', ACCEPT: 'mandate.accepted', DELIVER: 'mandate.delivered', COMPLETE: 'mandate.completed', REWORK: 'mandate.rework',
  RETURN: 'mandate.returned', REVOKE: 'mandate.revoked', EXPIRE: 'mandate.expired', SCAN: 'mandate.scanned',
});
export const MANDATE_RULE_IDS = Object.freeze({
  CONNECT: 'RULE-MND-01', RECONCILE: 'RULE-MND-02', RECOVER: 'RULE-MND-03',
});
export const MANDATE_LIMITS = Object.freeze({ maxRecords: 500, maxText: 2000, maxEvidence: 20, maxTransitions: 200 });
export const MANDATE_PREMISE = 'A handoff is a contract, not a forwarded message. It names the source, the receiving span, the authority granted, the capacity evidence, the expiry and the return path. Acceptance is explicit; silence is never consent. This trusted local workspace records declarations, not authenticated identities.';
export const ALTITUDE_QUESTIONS = Object.freeze({
  frontline: 'What can this shift decide without asking, and what must come back today?',
  manager: 'Which cross-team tradeoff needs a bounded owner rather than another meeting?',
  director: 'Which authority should move down a level, and where does cross-functional risk need to move up?',
  exec: 'Which portfolio commitments have an accountable owner, an explicit limit and a return trigger?',
  chief: 'Where is decision authority accumulating, expiring or returning without a recovered owner?',
});
export function mandateLabel(status) {
  return ({ proposed: 'Awaiting acceptance', active: 'Authority active', delivered: 'Evidence awaiting verification', completed: 'Outcome verified', returned: 'Returned', expired: 'Expired · recovery owed', revoked: 'Revoked' })[status] || 'Unknown';
}
