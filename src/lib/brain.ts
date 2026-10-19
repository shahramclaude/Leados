import type { Domain, Finding, RiskProfile } from "./types";
import { DOMAIN_META } from "./mockData";
import { computeCascadeRisk } from "./causalInference";
import type { CausalLink } from "./types";

// ─────────────────────────────────────────────────────────────
// brain.ts — BrainFindings / BrainProjection
// Synthesizes raw domain + finding data into the headline
// numbers and the one-sentence situational assessment.
// ─────────────────────────────────────────────────────────────

export function computeOrgHealthScore(domains: Domain[]): number {
  if (!domains.length) return 0;
  return Math.round((domains.reduce((s, d) => s + d.score, 0) / domains.length) * 10);
}

export function computeRiskProfile(orgHealthScore: number, cascadeRiskPct: number): RiskProfile {
  if (cascadeRiskPct > 45 || orgHealthScore < 40) return "critical";
  if (cascadeRiskPct > 22 || orgHealthScore < 58) return "red";
  if (cascadeRiskPct > 8 || orgHealthScore < 74) return "amber";
  return "green";
}

export function buildPhysicsSummary(
  domains: Domain[],
  findings: Finding[],
  causalLinks: CausalLink[]
): string {
  const sev5 = findings.filter((f) => f.sev === 5);
  const { riskPct, topLinks } = computeCascadeRisk(causalLinks, findings);
  const worst = [...domains].sort((a, b) => a.score - b.score)[0];
  const best = [...domains].sort((a, b) => b.score - a.score)[0];

  if (sev5.length && topLinks.length) {
    const link = topLinks[0];
    return `${sev5.length} critical finding${sev5.length > 1 ? "s" : ""} active while ${DOMAIN_META[worst.key].name} trends down; ${link.fromRuleLabel} is cascading into ${link.toRuleLabel.toLowerCase()} with ${riskPct}% cascade risk.`;
  }
  if (sev5.length) {
    return `${sev5.length} critical finding${sev5.length > 1 ? "s" : ""} active in ${DOMAIN_META[worst.key].name}, requiring immediate attention before compounding.`;
  }
  if (riskPct > 15) {
    const link = topLinks[0];
    return link
      ? `No critical findings, but ${link.fromRuleLabel} is amplifying downstream risk into ${link.toRuleLabel.toLowerCase()} — cascade risk at ${riskPct}%.`
      : `Cascade risk elevated at ${riskPct}% across coupled domains; monitor closely over the next cycle.`;
  }
  return `Organization is stable overall; ${DOMAIN_META[best.key].name} leading at ${best.score.toFixed(1)}/10 while ${DOMAIN_META[worst.key].name} lags at ${worst.score.toFixed(1)}/10.`;
}
