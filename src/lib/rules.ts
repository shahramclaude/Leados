import type { RuleDef } from "./types";

// Synthetic 8-rule catalog, original to this delivery.
// Rule IDs (R1, R6, R7, R10, R14, R73, R104, R157) are reused verbatim from the
// task's pasted "pt-S" brief so its own named evidence-mapping logic
// (_extractEvidenceSignals) is directly explorable here — the same convention
// the real repo's prior session used for its own reused IDs (R1, R4, R7, R17,
// R73, R88), per github.com/wbweve/Leados/blob/main/README.md (fetched this
// session). Titles/descriptions/categories are invented for this delivery;
// no rule catalog with these exact titles was found in the real repo.
export const RULES: RuleDef[] = [
  {
    id: "R1",
    title: "1:1 Cadence Missed",
    description: "A direct report's scheduled 1:1 was skipped or cancelled twice in a row.",
    category: "People",
  },
  {
    id: "R6",
    title: "Recent Interpersonal Conflict",
    description: "A conflict or friction event was logged for this person in the last 14 days.",
    category: "People",
  },
  {
    id: "R7",
    title: "Burnout Signal Detected",
    description: "Workload + declining mood pattern crosses the burnout heuristic threshold.",
    category: "People",
  },
  {
    id: "R10",
    title: "No Active Growth Plan",
    description: "No documented development/growth plan on file for this person.",
    category: "People",
  },
  {
    id: "R14",
    title: "OKR Silent > 30 Days",
    description: "An active OKR has had no check-in or update logged in over 30 days.",
    category: "Execution",
  },
  {
    id: "R73",
    title: "Delivery Velocity Declining",
    description: "Rolling team velocity has dropped for 3+ consecutive cycles.",
    category: "Execution",
  },
  {
    id: "R104",
    title: "LTV:CAC Below Threshold",
    description: "Lifetime value to customer acquisition cost ratio has fallen under 3x.",
    category: "Finance",
  },
  {
    id: "R157",
    title: "Win Rate Declining",
    description: "Sales win rate has dropped across the last two measured periods.",
    category: "Revenue",
  },
];
