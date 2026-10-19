// causalInference.ts
//
// NOTE: recreated for this sandbox — see the comment at the top of
// src/db/schema.ts.
//
// detectAll(P, findings) -> CausalCascade[]
//
// We model cross-domain causality with a small, static directed graph of
// plausible organisational cause/effect edges (DESIGN PARAMETER — these
// weights encode domain expertise, not a learned model). A cascade is
// considered "active" when the upstream ("from") domain is unhealthy and the
// downstream ("to") domain is not improving fast enough to offset it.

import type {
  BrainFindings,
  CausalCascade,
  Domain,
  Finding,
  Projection,
} from "./types";

interface CascadeEdge {
  from: Domain;
  to: Domain;
  amplificationFactor: number; // DESIGN PARAMETER
  baseConfidence: number; // DESIGN PARAMETER
  lagDays: { min: number; max: number };
  description: string;
}

const CASCADE_GRAPH: CascadeEdge[] = [
  {
    from: "financial",
    to: "morale",
    amplificationFactor: 1.3,
    baseConfidence: 0.55,
    lagDays: { min: 7, max: 21 },
    description: "Financial stress tends to erode morale within weeks.",
  },
  {
    from: "morale",
    to: "attrition",
    amplificationFactor: 1.4,
    baseConfidence: 0.6,
    lagDays: { min: 14, max: 45 },
    description: "Sustained low morale increases flight risk.",
  },
  {
    from: "attrition",
    to: "execution",
    amplificationFactor: 1.25,
    baseConfidence: 0.5,
    lagDays: { min: 7, max: 30 },
    description: "Regretted attrition slows delivery execution.",
  },
  {
    from: "execution",
    to: "growth",
    amplificationFactor: 1.2,
    baseConfidence: 0.5,
    lagDays: { min: 14, max: 60 },
    description: "Execution slippage stalls downstream growth metrics.",
  },
  {
    from: "culture",
    to: "morale",
    amplificationFactor: 1.15,
    baseConfidence: 0.45,
    lagDays: { min: 7, max: 30 },
    description: "Culture erosion depresses team morale.",
  },
];

function topFindingForDomain(findings: Finding[], domain: Domain): Finding | null {
  const matches = findings.filter((f) => f.domain === domain);
  return matches.length ? matches[0] : null;
}

export function detectAll(
  P: Projection,
  findings: BrainFindings | Finding[],
): CausalCascade[] {
  const allFindings = Array.isArray(findings) ? findings : findings.findings;
  const cascades: CausalCascade[] = [];

  for (const edge of CASCADE_GRAPH) {
    const fromDomain = P.domains[edge.from];
    const toDomain = P.domains[edge.to];
    if (!fromDomain || !toDomain) continue;

    const fromRisk = 10 - fromDomain.score; // 0..10, higher = worse
    const fromUnhealthy = fromRisk >= 4; // DESIGN PARAMETER threshold
    const toNotImproving = toDomain.velocity >= -0.02; // DESIGN PARAMETER threshold

    if (!fromUnhealthy || !toNotImproving) continue;

    const confidence = Math.max(
      0,
      Math.min(1, edge.baseConfidence * (fromRisk / 10) * (1 + Math.max(0, toDomain.velocity))),
    );

    const fromFinding = topFindingForDomain(allFindings, edge.from);
    const toFinding = topFindingForDomain(allFindings, edge.to);

    cascades.push({
      from: edge.from,
      to: edge.to,
      fromRuleId: fromFinding?.ruleId ?? null,
      toRuleId: toFinding?.ruleId ?? null,
      amplificationFactor: edge.amplificationFactor,
      confidence,
      lagDays: edge.lagDays,
      description: edge.description,
    });
  }

  return cascades.sort((a, b) => b.confidence - a.confidence);
}

const causalInference = { detectAll };
export default causalInference;
