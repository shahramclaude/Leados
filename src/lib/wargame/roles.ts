export type RoleId = "us" | "competitorA" | "regulator" | "keyCustomer" | "talentMarket";

export interface RoleDefinition {
  id: RoleId;
  label: string;
  objective: string;
  /**
   * The exact set of twin metric keys and macro-assumption ids this role is
   * allowed to see. No role sees the full state — enforced by
   * `getScopedView`/`readScopedField` below, not just by UI convention.
   */
  knowledgeScope: string[];
}

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    id: "us",
    label: "Us (the company)",
    objective: "Grow durable revenue while preserving cash runway and talent capacity.",
    knowledgeScope: ["revenueGrowth", "churnRate", "cashRunwayMonths", "headcount", "marketShare", "talentAvailability", "ma-open-reg", "ma-ff-tech", "ma-pc-comp", "ma-rc-reg", "ma-cs-reg"],
  },
  {
    id: "competitorA",
    label: "Competitor A",
    objective: "Capture market share, ideally by bundling or undercutting on price.",
    knowledgeScope: ["marketShare", "competitorAggression", "revenueGrowth", "ma-pc-comp", "ma-ff-tech"],
  },
  {
    id: "regulator",
    label: "Regulator",
    objective: "Constrain systemic risk from AI-assisted decision systems without blocking all innovation.",
    knowledgeScope: ["regulatoryPressure", "ma-rc-reg", "ma-cs-reg"],
  },
  {
    id: "keyCustomer",
    label: "Key customer",
    objective: "Minimize switching risk and total cost of ownership; reward reliability.",
    knowledgeScope: ["churnRate", "revenueGrowth", "ma-pc-comp"],
  },
  {
    id: "talentMarket",
    label: "Talent market",
    objective: "Allocate scarce specialist talent to the most attractive opportunities.",
    knowledgeScope: ["talentAvailability", "headcount", "ma-ff-tech"],
  },
];

export function getRole(id: RoleId): RoleDefinition {
  const role = ROLE_DEFINITIONS.find((r) => r.id === id);
  if (!role) throw new Error(`Unknown role: ${id}`);
  return role;
}
