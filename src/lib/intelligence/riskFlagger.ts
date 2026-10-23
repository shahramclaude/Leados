// LEADOS intelligence engine — fraud/anomaly flagger with automated payout hold.
export const SYSTEM_ID = "fraud-anomaly-flagger-v1";

export interface PayoutRiskInput {
  payoutVelocityScore: number; // 0..1
  deviceFingerprintChanged: boolean;
  geoVelocityFlag: boolean;
  priorDisputeCount: number;
}

export interface PayoutRiskOutput {
  riskScore: number; // 0..100
  holdAction: "none" | "temporary_hold";
  reasonCodes: string[];
  factors: Array<{ factor: string; weight: number; direction: "increases" | "decreases" }>;
}

/** Flags and automatically holds a payout pending human review.
 * decisionRole: automate, actionTier: T4 — mandatory human review required
 * before a hold exceeds 24h (enforced in src/lib/accountability/rights.ts). */
export function flagPayoutRisk(input: PayoutRiskInput): PayoutRiskOutput {
  const velocityComponent = input.payoutVelocityScore * 40;
  const deviceComponent = input.deviceFingerprintChanged ? 20 : 0;
  const geoComponent = input.geoVelocityFlag ? 20 : 0;
  const disputeComponent = Math.min(input.priorDisputeCount * 10, 20);

  const riskScore = Math.max(
    0,
    Math.min(100, Math.round(velocityComponent + deviceComponent + geoComponent + disputeComponent)),
  );

  const reasonCodes: string[] = [];
  if (input.payoutVelocityScore > 0.6) reasonCodes.push("HIGH_PAYOUT_VELOCITY");
  if (input.deviceFingerprintChanged) reasonCodes.push("DEVICE_CHANGE");
  if (input.geoVelocityFlag) reasonCodes.push("IMPOSSIBLE_TRAVEL");
  if (input.priorDisputeCount > 0) reasonCodes.push("PRIOR_DISPUTES");

  return {
    riskScore,
    holdAction: riskScore >= 60 ? "temporary_hold" : "none",
    reasonCodes,
    factors: [
      { factor: "Payout velocity", weight: Math.round(velocityComponent), direction: "increases" },
      { factor: "Device fingerprint change", weight: deviceComponent, direction: "increases" },
      { factor: "Geo-velocity anomaly", weight: geoComponent, direction: "increases" },
      { factor: "Prior disputes", weight: disputeComponent, direction: "increases" },
    ],
  };
}
