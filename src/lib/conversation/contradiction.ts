// Contradiction detection: if the agent is about to assert a different
// headline value for the same (metric, timeframe) it already asserted this
// conversation, it must say so explicitly rather than silently overwrite.
import type { ActiveContext } from "./dialogueState";
import { scopeKey } from "./dialogueState";

export interface PriorAssertion {
  turnId: string;
  scopeKey: string;
  claimValue: string;
  claimText: string;
}

const NUMBER_PATTERN = /\$?-?\d[\d,]*(?:\.\d+)?\s?%?[MBK]?/;

export function extractClaimValue(text: string): string | undefined {
  const m = text.match(NUMBER_PATTERN);
  return m ? m[0] : undefined;
}

export interface ContradictionCheckResult {
  contradiction: { priorTurnId: string; priorClaim: string; resolution: string } | null;
}

/**
 * Compare a freshly grounded answer against prior assistant assertions in
 * the same conversation for the same scope. Returns an explicit resolution
 * statement when values disagree — never a silent overwrite.
 */
export function checkContradiction(
  newContext: ActiveContext,
  newAnswerText: string,
  priorAssertions: PriorAssertion[],
): ContradictionCheckResult {
  const key = scopeKey(newContext);
  if (key === "?::?") return { contradiction: null };

  const newValue = extractClaimValue(newAnswerText);
  if (!newValue) return { contradiction: null };

  const priorForScope = priorAssertions.filter((p) => p.scopeKey === key);
  const lastPrior = priorForScope[priorForScope.length - 1];
  if (!lastPrior) return { contradiction: null };

  if (lastPrior.claimValue && lastPrior.claimValue !== newValue) {
    return {
      contradiction: {
        priorTurnId: lastPrior.turnId,
        priorClaim: lastPrior.claimText,
        resolution: `Correction: earlier in this conversation I said "${lastPrior.claimValue}" for this metric/timeframe. The grounded evidence actually supports "${newValue}". Treat the newer, cited figure as correct and discard the earlier one.`,
      },
    };
  }

  return { contradiction: null };
}
