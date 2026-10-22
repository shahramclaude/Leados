// LEADOS — Part 39: the evolution engine's stage machine.
//
//   fitness trend -> drift detection (Part 38 stand-in) -> experiment proposal
//   (Part 30 stand-in) -> twin pre-test (Part 06 stand-in) -> DECISION
//   (Part 23 stand-in, human, T3-gated) -> execution (Part 10 stand-in) ->
//   measured outcome -> belief update (counterfactual-adjusted, Part 05
//   stand-in).
//
// HONESTY / SAFETY RULE: every arrow in this loop is a human-approved
// decision. The engine NEVER auto-executes. The state machine below makes it
// structurally impossible to reach "executing" without approvedBy/approvedAt
// set on a T3-tier decision.

export type EvolutionStage =
  | "hypothesis"
  | "twin_predicted"
  | "decision_pending"
  | "decision_approved"
  | "decision_rejected"
  | "executing"
  | "measured"
  | "belief_updated";

export interface EvolutionLoopState {
  stage: EvolutionStage;
  decisionTier: "T1" | "T2" | "T3";
  approvedBy: string | null;
  approvedAt: string | null;
}

const ALLOWED_TRANSITIONS: Record<EvolutionStage, EvolutionStage[]> = {
  hypothesis: ["twin_predicted"],
  twin_predicted: ["decision_pending"],
  decision_pending: ["decision_approved", "decision_rejected"],
  decision_approved: ["executing"],
  decision_rejected: [],
  executing: ["measured"],
  measured: ["belief_updated"],
  belief_updated: [],
};

export class EvolutionLoopTransitionError extends Error {}

/**
 * Validate (but do not mutate) a proposed stage transition. Throws a
 * descriptive error if the transition is not legal, including the mandatory
 * human-approval + T3-tier gate before execution.
 */
export function validateTransition(
  current: EvolutionLoopState,
  next: EvolutionStage,
  context: { approvedBy?: string | null } = {},
): void {
  const allowed = ALLOWED_TRANSITIONS[current.stage] ?? [];
  if (!allowed.includes(next)) {
    throw new EvolutionLoopTransitionError(
      `Illegal evolution-loop transition: ${current.stage} -> ${next}. Allowed: [${allowed.join(", ") || "none (terminal stage)"}].`,
    );
  }

  if (next === "decision_approved") {
    const approver = context.approvedBy ?? current.approvedBy;
    if (!approver) {
      throw new EvolutionLoopTransitionError(
        "Cannot move to decision_approved without a named human approver (approvedBy).",
      );
    }
    if (current.decisionTier !== "T3") {
      throw new EvolutionLoopTransitionError(
        `Evolution-loop interventions are T3-gated only. Found decisionTier=${current.decisionTier}.`,
      );
    }
  }

  if (next === "executing") {
    if (current.stage !== "decision_approved") {
      throw new EvolutionLoopTransitionError(
        "Cannot execute an evolution loop that has not passed decision_approved with a named human approver.",
      );
    }
    if (!current.approvedBy || !current.approvedAt) {
      throw new EvolutionLoopTransitionError(
        "Cannot execute: missing approvedBy/approvedAt. No auto-execution is permitted for organizational interventions.",
      );
    }
  }
}

export const STAGE_ORDER: EvolutionStage[] = [
  "hypothesis",
  "twin_predicted",
  "decision_pending",
  "decision_approved",
  "executing",
  "measured",
  "belief_updated",
];

export function stageLabel(stage: EvolutionStage): string {
  const labels: Record<EvolutionStage, string> = {
    hypothesis: "Hypothesis (from fitness trend + drift signal)",
    twin_predicted: "Twin-predicted fitness delta (Part 06 stand-in)",
    decision_pending: "Awaiting human T3 decision (Part 23 stand-in)",
    decision_approved: "Decision approved by human",
    decision_rejected: "Decision rejected by human",
    executing: "Executing intervention (Part 10 stand-in)",
    measured: "Outcome measured",
    belief_updated: "Belief updated (counterfactual-adjusted)",
  };
  return labels[stage];
}
