// orgPhysics — lightweight "change physics" model used to flavor execution
// and momentum narratives. Treats organizational inertia analogously to
// Newtonian mass: larger, older, more blocked orgs resist change more.
// DESIGN PARAMETER: inertia = headcount_weight(0.4) + tenure_weight(0.3) +
// blocker_weight(0.3), each normalized 0-1.

export interface ChangePhysicsResult {
  inertia: number; // 0-1, higher = harder to change direction
  momentumCarry: number; // 0-1, how much current trajectory will persist
  label: "agile" | "steady" | "resistant" | "ossified";
}

export function computeChangePhysics(headcount: number, avgTenureMonths: number, openBlockers: number): ChangePhysicsResult {
  const headcountNorm = Math.min(1, headcount / 500);
  const tenureNorm = Math.min(1, avgTenureMonths / 60);
  const blockerNorm = Math.min(1, openBlockers / 20);
  const inertia = headcountNorm * 0.4 + tenureNorm * 0.3 + blockerNorm * 0.3;
  const momentumCarry = 1 - inertia * 0.5;
  const label: ChangePhysicsResult["label"] =
    inertia < 0.25 ? "agile" : inertia < 0.5 ? "steady" : inertia < 0.75 ? "resistant" : "ossified";
  return { inertia, momentumCarry, label };
}
