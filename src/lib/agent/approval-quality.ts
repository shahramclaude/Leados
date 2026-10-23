// LEADOS Agent Kernel — approval-reason quality scoring.
//
// PHASE 5 mitigation for "approval fatigue" (reviewers rubber-stamping T3/T4
// actions without reading them). A reason is scored 0..5; submissions below
// MIN_REASON_QUALITY are rejected back to the reviewer with an explanation
// instead of being recorded as a real decision, and the low score itself is
// stored for audit (so a reviewer who repeatedly rubber-stamps is visible in
// the /ops/agent approvals ledger).
const BOILERPLATE = /^(ok|okay|lgtm|approved|fine|yes|sure|go ahead|sounds good)\.?$/i;

export const MIN_REASON_QUALITY = 3;

export function scoreReasonQuality(reason: string, goal: string): number {
  const trimmed = reason.trim();
  if (trimmed.length === 0) return 0;
  if (BOILERPLATE.test(trimmed)) return 1;
  let score = 0;
  if (trimmed.length >= 20) score += 2;
  if (trimmed.length >= 60) score += 1;
  const goalWords = goal
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const reasonLower = trimmed.toLowerCase();
  if (goalWords.some((w) => reasonLower.includes(w))) score += 2;
  return Math.max(0, Math.min(5, score));
}

export function attentionCheckPassed(reason: string, nonce: string | null): boolean {
  if (!nonce) return true;
  return reason.includes(nonce);
}
