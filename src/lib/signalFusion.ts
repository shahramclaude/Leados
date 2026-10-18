// src/lib/signalFusion.ts
//
// Stage 4 of the orchestration pipeline: signal fusion.
//
// Combines Stage 1 (findings), Stage 2 (beliefs) and Stage 3 (causal links)
// into a single per-person fused risk score in [0, 100]. No DB access —
// pure function over the accumulated pipeline context, by design.
import type {
  BayesianUpdateResult,
  CausalChainResult,
  Domain,
  Finding,
  FusedSignal,
  RuleEvaluationResult,
  SignalFusionResult,
} from "@/lib/types";

const FINDING_WEIGHT = 0.4;
const BELIEF_WEIGHT = 0.4;
const CAUSAL_WEIGHT = 0.2;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function fuseSignals(
  ruleEvaluation: RuleEvaluationResult,
  bayesianUpdate: BayesianUpdateResult,
  causal: CausalChainResult,
): SignalFusionResult {
  const findingsByPerson = new Map<number, Finding[]>();
  for (const finding of ruleEvaluation.findings) {
    if (finding.personId === null || !finding.active) continue;
    const list = findingsByPerson.get(finding.personId) ?? [];
    list.push(finding);
    findingsByPerson.set(finding.personId, list);
  }

  const beliefsByPerson = new Map<number, number[]>();
  for (const belief of bayesianUpdate.beliefs) {
    const list = beliefsByPerson.get(belief.personId) ?? [];
    list.push(belief.probability);
    beliefsByPerson.set(belief.personId, list);
  }

  const highConfidenceDomains = new Set<Domain>();
  for (const chain of causal.chains) {
    if (chain.confidence >= 0.5) {
      highConfidenceDomains.add(chain.fromDomain);
      highConfidenceDomains.add(chain.toDomain);
    }
  }

  const personIds = new Set<number>([...findingsByPerson.keys(), ...beliefsByPerson.keys()]);

  const fusedSignals: FusedSignal[] = [];
  for (const personId of personIds) {
    const findings = findingsByPerson.get(personId) ?? [];
    const beliefs = beliefsByPerson.get(personId) ?? [];

    const severitySum = findings.reduce((s, f) => s + f.severity, 0);
    const findingContribution = clamp((severitySum / (findings.length || 1)) * (findings.length > 0 ? 20 : 0), 0, 100);

    const maxBelief = beliefs.length > 0 ? Math.max(...beliefs) : 0;
    const beliefContribution = clamp(maxBelief * 100, 0, 100);

    const domains = new Set(findings.map((f) => f.domain));
    const causalHits = [...domains].filter((d) => highConfidenceDomains.has(d)).length;
    const causalContribution = clamp(causalHits * 15, 0, 100);

    const riskScore = clamp(
      findingContribution * FINDING_WEIGHT + beliefContribution * BELIEF_WEIGHT + causalContribution * CAUSAL_WEIGHT,
      0,
      100,
    );

    fusedSignals.push({
      personId,
      riskScore: Math.round(riskScore * 100) / 100,
      findingContribution: Math.round(findingContribution * 100) / 100,
      beliefContribution: Math.round(beliefContribution * 100) / 100,
      causalContribution: Math.round(causalContribution * 100) / 100,
      contributingDomains: [...domains],
    });
  }

  const orgFusedScore =
    fusedSignals.length > 0
      ? Math.round((fusedSignals.reduce((s, f) => s + f.riskScore, 0) / fusedSignals.length) * 100) / 100
      : 0;

  return {
    computedAt: new Date().toISOString(),
    fusedSignals,
    orgFusedScore,
  };
}
