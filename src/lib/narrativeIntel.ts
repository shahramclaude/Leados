// src/lib/narrativeIntel.ts
//
// Text-generation helpers used by synthesis.ts. Kept deterministic
// (template-based, no external LLM calls) so the orchestrator pipeline
// stays fast (<10s budget) and reproducible without adding npm dependencies
// or outbound network calls.
import type { BurnoutRiskResult, Domain, FlightRiskResult, NarrativeItem, OrgNetworkReport, Severity } from "@/lib/types";

function severityFromScore(score: number): Severity {
  if (score >= 80) return 5;
  if (score >= 60) return 4;
  if (score >= 40) return 3;
  if (score >= 20) return 2;
  return 1;
}

export function narrateTopFlightRisks(flightRisk: FlightRiskResult, limit = 3): NarrativeItem[] {
  const sorted = [...flightRisk.scores].sort((a, b) => b.score - a.score).slice(0, limit);
  return sorted
    .filter((s) => s.score >= 40)
    .map((s) => ({
      id: `narrative:flight_risk:${s.personId}`,
      title: `Elevated flight risk (person #${s.personId})`,
      summary: `Person #${s.personId} shows a ${s.band} flight-risk score of ${s.score}/100. ${
        s.drivers.length > 0 ? `Primary drivers: ${s.drivers.join("; ")}.` : "No single dominant driver identified."
      }`,
      domain: "risk" as Domain,
      severity: severityFromScore(s.score),
      relatedPersonIds: [s.personId],
    }));
}

export function narrateTopBurnout(burnout: BurnoutRiskResult, limit = 3): NarrativeItem[] {
  const sorted = [...burnout.scores].sort((a, b) => b.score - a.score).slice(0, limit);
  return sorted
    .filter((s) => s.score >= 40)
    .map((s) => ({
      id: `narrative:burnout:${s.personId}`,
      title: `Burnout signal building (person #${s.personId})`,
      summary: `Person #${s.personId} shows a ${s.band} burnout score of ${s.score}/100. ${
        s.drivers.length > 0 ? `Primary drivers: ${s.drivers.join("; ")}.` : "No single dominant driver identified."
      }`,
      domain: "workload" as Domain,
      severity: severityFromScore(s.score),
      relatedPersonIds: [s.personId],
    }));
}

export function narrateNetwork(network: OrgNetworkReport): NarrativeItem[] {
  if (network.edges.length === 0) return [];
  const causalEdges = network.edges.filter((e) => e.kind === "causal").sort((a, b) => b.weight - a.weight);
  if (causalEdges.length === 0) return [];
  const top = causalEdges[0];
  return [
    {
      id: "narrative:network:top-causal-edge",
      title: `Strongest cross-domain pattern: ${top.source} -> ${top.target}`,
      summary: `The knowledge graph's strongest causal edge connects "${top.source.replace("domain:", "")}" to "${top.target.replace(
        "domain:",
        "",
      )}" with weight ${Math.round(top.weight)}. Network density is ${network.density}, across ${network.nodes.length} nodes and ${
        network.edges.length
      } edges.`,
      domain: "org",
      severity: top.weight >= 70 ? 4 : 3,
      relatedPersonIds: [],
    },
  ];
}
