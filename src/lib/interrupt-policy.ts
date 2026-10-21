// Interrupt policy (Part 04 lineage), honored by every agent action executor
// (Part 12 lineage). An agent may never silently take a high-risk action.

export type RiskLevel = "low" | "medium" | "high";

/**
 * Returns true if an agent action of this risk level must stop and wait for
 * a human decision before it executes. Medium risk is allowed to proceed
 * automatically only when the org has not opted into "strict mode" — LEADOS
 * ships with strict mode permanently on for medium+high (see
 * docs/RED-TEAM-2026.md AUT-1 for the one deliberate autonomous exception:
 * low-risk read-only actions).
 */
export function requiresApproval(risk: RiskLevel): boolean {
  return risk === "medium" || risk === "high";
}
