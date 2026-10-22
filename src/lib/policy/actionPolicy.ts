// Part 10 policy gate (reconstructed minimal surface for Part 42).
//
// Every action-shaped request is tiered. T1 actions are draft-only and carry
// no external side effects by themselves (e.g. "draft a task"). T2+ actions
// have real-world or interpersonal effect (sending a message, approving
// spend, assigning someone else's time) and are ALWAYS gated behind explicit
// human confirmation — the agent is never permitted to execute them
// autonomously, regardless of how confident the grounding is.
export type PolicyTier = "T1" | "T2" | "T3";

const T3_VERBS = /\b(approve|authorize|spend|pay|terminate|delete account)\b/i;
const T2_VERBS = /\b(send|email|schedule|book|assign|notify|message)\b/i;

export function classifyActionTier(text: string): PolicyTier {
  if (T3_VERBS.test(text)) return "T3";
  if (T2_VERBS.test(text)) return "T2";
  return "T1";
}

export function isGated(tier: PolicyTier): boolean {
  return tier === "T2" || tier === "T3";
}

export interface ActionGateResult {
  tier: PolicyTier;
  status: "drafted" | "blocked_needs_confirmation";
  note: string;
}

/**
 * Given an `act`-intent utterance, never execute — always return a drafted
 * proposal. T2/T3 proposals are explicitly marked as requiring a human to
 * confirm before anything commits; T1 proposals are still draft-only, they
 * just don't require the same explicit two-step confirmation banner.
 */
export function gateAction(text: string): ActionGateResult {
  const tier = classifyActionTier(text);
  if (isGated(tier)) {
    return {
      tier,
      status: "blocked_needs_confirmation",
      note: `This ${tier} action has real-world effect and will not run until a human explicitly confirms it.`,
    };
  }
  return {
    tier,
    status: "drafted",
    note: "Drafted. Review before it is treated as final.",
  };
}
