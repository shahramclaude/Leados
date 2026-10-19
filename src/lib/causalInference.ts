import type { CausalLink, Finding } from "./types";
import { clamp } from "./orgPhysics";

// ─────────────────────────────────────────────────────────────
// causalInference.ts — cascade detection across findings.
// A "cascade" is an active finding whose ruleId appears as the
// `toRuleId` of a known causal link, where the upstream finding
// (`fromRuleId`) is also currently active.
// ─────────────────────────────────────────────────────────────

export interface DetectedCascade extends CausalLink {
  active: boolean;
}

export function detectCascades(findings: Finding[], links: CausalLink[]): DetectedCascade[] {
  const activeRuleIds = new Set(findings.map((f) => f.ruleId));
  return links
    .map((link) => ({ ...link, active: activeRuleIds.has(link.fromRuleId) && activeRuleIds.has(link.toRuleId) }))
    .filter((l) => l.active);
}

export function computeCascadeRisk(links: CausalLink[], findings: Finding[]) {
  const cascades = detectCascades(findings, links);
  if (!cascades.length) return { riskPct: 0, topLinks: [] as DetectedCascade[] };
  const riskPct = clamp(
    Math.round(
      cascades.reduce((s, l) => s + l.confidence * (l.amplificationFactor - 1) * 55, 0) / cascades.length +
        cascades.length * 4
    ),
    0,
    100
  );
  const topLinks = [...cascades].sort((a, b) => b.strength - a.strength);
  return { riskPct, topLinks };
}
