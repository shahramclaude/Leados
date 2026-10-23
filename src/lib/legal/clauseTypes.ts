// Shared clause-type vocabulary for the contract intelligence pipeline (Part 53).
// Kept separate from src/db/schema.ts so UI and scripts can import without pulling in drizzle-pg types.

export const CLAUSE_TYPES = [
  "term",
  "renewal",
  "termination",
  "sla",
  "indemnity",
  "liability_cap",
  "change_of_control",
  "data_protection",
] as const;

export type ClauseType = (typeof CLAUSE_TYPES)[number];

export const CLAUSE_TYPE_LABELS: Record<ClauseType, string> = {
  term: "Term",
  renewal: "Renewal",
  termination: "Termination",
  sla: "Service Level (SLA)",
  indemnity: "Indemnity",
  liability_cap: "Liability Cap",
  change_of_control: "Change of Control",
  data_protection: "Data Protection",
};

export function isClauseType(value: string): value is ClauseType {
  return (CLAUSE_TYPES as readonly string[]).includes(value);
}

// Product-wide legal-advice disclaimer copy (consistent with Part 02's disclaimer component pattern).
export const LEGAL_DISCLAIMER_TEXT =
  "LEADOS Legal Intelligence is decision support, not legal advice. Extracted clauses and generated " +
  "obligations are machine-drafted suggestions that remain unconfirmed and non-binding until a qualified " +
  "human reviewer confirms them. Always consult qualified counsel before acting on contractual obligations.";
