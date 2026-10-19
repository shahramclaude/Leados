// src/lib/narrativeIntel.ts
//
// BOOTSTRAP NOTE: no prior narrativeIntel.ts existed in the repository.
// Template-based narrative generation: turns belief-fabric + causal-chain
// output into plain-English findings. Original derivation; no external NLG
// library, just string templates gated on thresholds (DESIGN PARAMETERS).

import type { BeliefFabricResult, CausalEdge, LatentNodeId } from "./types";

const SEVERITY_LABEL = (p: number): string => {
  if (p >= 0.7) return "critical";
  if (p >= 0.5) return "elevated";
  if (p >= 0.3) return "watch";
  return "nominal";
};

const RISK_LABELS: Record<LatentNodeId, string> = {
  flightRisk: "key-person flight risk",
  burnoutRisk: "team burnout risk",
  strategyRisk: "strategic drift risk",
  executionRisk: "execution/delivery risk",
  cultureRisk: "culture & psychological-safety risk",
  financialRisk: "financial/runway risk",
  innovationStall: "innovation stall risk",
  decisionParalysis: "decision paralysis risk",
  cascadeRisk: "cross-domain cascade risk",
  leadershipEnergyDepletion: "leadership energy depletion",
};

export function generateNarrative(
  beliefs: BeliefFabricResult,
  causalEdges: CausalEdge[],
): string[] {
  const lines: string[] = [];

  lines.push(
    `Dominant risk: ${RISK_LABELS[beliefs.dominantRisk]} is ${SEVERITY_LABEL(
      beliefs.posteriors[beliefs.dominantRisk].p,
    )} (p=${(beliefs.posteriors[beliefs.dominantRisk].p * 100).toFixed(0)}%).`,
  );

  if (beliefs.cascadeRisk.p >= 0.5) {
    lines.push(
      `Cascade alert: multiple latent risks are compounding — cascade risk is ${SEVERITY_LABEL(
        beliefs.cascadeRisk.p,
      )} at p=${(beliefs.cascadeRisk.p * 100).toFixed(0)}%.`,
    );
  }

  for (const nodeId of Object.keys(beliefs.posteriors) as LatentNodeId[]) {
    if (nodeId === beliefs.dominantRisk || nodeId === "cascadeRisk") continue;
    const marginal = beliefs.posteriors[nodeId];
    if (marginal.p >= 0.6) {
      lines.push(
        `Secondary signal: ${RISK_LABELS[nodeId]} is also ${SEVERITY_LABEL(marginal.p)} (p=${(
          marginal.p * 100
        ).toFixed(0)}%).`,
      );
    }
  }

  for (const edge of causalEdges.slice(0, 5)) {
    lines.push(
      `Pattern: "${edge.from}" is empirically followed by "${edge.to}" ${(edge.probability * 100).toFixed(
        0,
      )}% of the time (n=${edge.support}).`,
    );
  }

  if (lines.length === 1) {
    lines.push("No elevated secondary risks or recurring causal patterns detected in this window.");
  }

  return lines;
}
