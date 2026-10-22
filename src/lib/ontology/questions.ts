// Part 32 question ontology (reconstructed minimal surface for Part 42).
//
// LEADOS's conversational agent classifies every incoming turn into one of
// six intents. `act` is always gated by Part 10 policy — the router never
// executes it directly, it only ever produces a drafted, human-confirmable
// proposal (T1-draft semantics, per the Part 42 standing order).
export type QuestionIntent =
  | "query"
  | "compare"
  | "explain"
  | "simulate"
  | "draft"
  | "act";

export const QUESTION_INTENTS: QuestionIntent[] = [
  "query",
  "compare",
  "explain",
  "simulate",
  "draft",
  "act",
];

interface IntentPattern {
  intent: QuestionIntent;
  patterns: RegExp[];
}

// Ordered: first match wins. More specific intents (act, compare, simulate,
// explain, draft) are tested before falling back to the general `query`.
const INTENT_PATTERNS: IntentPattern[] = [
  {
    intent: "act",
    patterns: [
      /\b(send|email|schedule|book|approve|assign|notify|create (a )?task|add (a )?task|message)\b/i,
    ],
  },
  {
    intent: "compare",
    patterns: [/\b(vs\.?|versus|compare|compared to|difference between)\b/i],
  },
  {
    intent: "simulate",
    patterns: [/\b(what if|simulate|projection|forecast|scenario|would happen)\b/i],
  },
  {
    intent: "explain",
    patterns: [/\b(why|explain|root cause|reason for|what caused)\b/i],
  },
  {
    intent: "draft",
    patterns: [/\b(draft|write|compose|prepare a (memo|email|summary))\b/i],
  },
];

export function classifyIntent(text: string): QuestionIntent {
  for (const { intent, patterns } of INTENT_PATTERNS) {
    if (patterns.some((p) => p.test(text))) return intent;
  }
  return "query";
}

// Follow-up detector: short utterances / explicit continuation markers that
// should inherit scope from the previous turn rather than being treated as a
// fresh, context-free question.
const FOLLOWUP_MARKERS = [
  /^and\b/i,
  /^what about\b/i,
  /^and for\b/i,
  /^how about\b/i,
  /^same (for|with)\b/i,
  /^that one\b/i,
  /^it\b/i,
  /^(it'?s|its) /i,
];

export function looksLikeFollowUp(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.split(/\s+/).length <= 4) return true;
  return FOLLOWUP_MARKERS.some((p) => p.test(trimmed));
}
