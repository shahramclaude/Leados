// Shared types for the Org Design Lab / Deal Room (Part 54).
//
// Explain<T> — Part 08's model: every estimate carries a value, an interval,
// a confidence, the assumptions it rests on, and the method used to produce
// it. Nothing here is allowed to collapse into a bare number.

export type Explain<T> = {
  value: T;
  low: T;
  high: T;
  confidence: number; // 0..1, honestly stated — never inflated
  assumptions: string[];
  rationale: string;
  method: string;
};

export function explainNumber(args: {
  value: number;
  low: number;
  high: number;
  confidence: number;
  assumptions: string[];
  rationale: string;
  method: string;
}): Explain<number> {
  return { ...args };
}

export type DisruptionClass = "none" | "low" | "moderate" | "high" | "severe";

export type RoleChangeType =
  | "none"
  | "title_change"
  | "manager_change"
  | "relocation"
  | "redundancy_risk"
  | "promotion"
  | "lateral_move";

export type StructuralMoveType =
  | "merge"
  | "split"
  | "reporting_line_change"
  | "centralize"
  | "decentralize";

export type DeliveryImpact = {
  capacityChangePct: Explain<number>;
  cycleTimeChangeDays: Explain<number>;
};

export type NetworkImpact = {
  cohesion: Explain<number>; // -1..1 change in cohesion index
  chokePoints: { unitId: number; unitName: string; reason: string }[];
  busFactor: Explain<number>; // number of people whose departure would fragment critical knowledge
};

export type HumanImpactLedgerEntry = {
  personId: number;
  personName: string;
  unitId: number;
  roleChangeType: RoleChangeType;
  disruptionClass: DisruptionClass;
  supportPlanId: number | null;
  supportPlanName: string | null;
  rationale: string;
};

export type HumanImpactSummary = {
  totalAffected: number;
  byDisruptionClass: Record<DisruptionClass, number>;
  byRoleChangeType: Record<RoleChangeType, number>;
  unsupportedSevereOrHigh: number; // must be 0 for a valid simulation
};

export type ModelCard = {
  twinName: string;
  version: number;
  lineage: string[];
  whatItModels: string[];
  knownLimits: string[];
  declaredErrorMargins: Record<string, string>;
  lastCalibratedAt: string;
  validationStatus: "unvalidated" | "calibrated" | "stale";
};
