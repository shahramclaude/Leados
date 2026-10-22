// Part 33 orchestration router (reconstructed minimal surface for Part 42).
//
// Single entry point that fans an intent + resolved scope out to the right
// handler. `act` never reaches a "do it" code path here — it is always
// rewritten into a gated draft by `lib/policy/actionPolicy`.
import { groundAnswer, type GroundedAnswer } from "@/lib/ai/grounding";
import { gateAction, type ActionGateResult } from "@/lib/policy/actionPolicy";
import type { ActiveContext } from "@/lib/conversation/dialogueState";
import type { QuestionIntent } from "@/lib/ontology/questions";

export interface RouteResult {
  answer: GroundedAnswer;
  actionGate: ActionGateResult | null;
}

export async function routeIntent(
  intent: QuestionIntent,
  text: string,
  context: ActiveContext,
): Promise<RouteResult> {
  switch (intent) {
    case "act": {
      const gate = gateAction(text);
      // Even action requests are grounded where possible (e.g. "email the
      // Q3 churn update" should still cite the Q3 churn evidence used to
      // compose the draft message).
      const answer = await groundAnswer(text, context);
      return { answer, actionGate: gate };
    }
    case "query":
    case "compare":
    case "explain":
    case "simulate":
    case "draft":
    default: {
      const answer = await groundAnswer(text, context);
      return { answer, actionGate: null };
    }
  }
}
