/**
 * src/lib/causalInference.ts — cross-domain causal cascade detection.
 *
 * Detects when a rule firing in one domain is statistically "upstream"
 * of a rule firing in another domain, based on 12 hand-authored causal
 * links. Every `strength` value below is a DESIGN PARAMETER: not
 * calibrated from data. Adjust based on observed outcomes.
 */

import type { BrainProjection, CausalCascade, CausalLinkDef, RuleState } from "./types";

function daysBetween(fromIso: string | Date, toIso: string | Date): number {
  const a = fromIso instanceof Date ? fromIso.getTime() : Date.parse(fromIso);
  const b = toIso instanceof Date ? toIso.getTime() : Date.parse(toIso);
  return (b - a) / 86400000;
}

export const CAUSAL_LINKS: CausalLinkDef[] = [
  {
    id: "CL01",
    fromRule: "F01",
    toRule: "P02",
    lagMinDays: 14,
    lagMaxDays: 30,
    mechanism: "Financial stress creates flight risk",
    strength: 0.65, // DESIGN PARAMETER: not calibrated from data. Adjust based on observed outcomes.
  },
  {
    id: "CL02",
    fromRule: "P03",
    toRule: "R02",
    lagMinDays: 7,
    lagMaxDays: 21,
    mechanism: "Morale problems slow engineering output",
    strength: 0.45, // DESIGN PARAMETER: not calibrated from data. Adjust based on observed outcomes.
  },
  {
    id: "CL03",
    fromRule: "O06",
    toRule: "S01",
    lagMinDays: 0,
    lagMaxDays: 7,
    mechanism: "Operational escalations congest strategic decisions",
    strength: 0.55, // DESIGN PARAMETER: not calibrated from data. Adjust based on observed outcomes.
  },
  {
    id: "CL04",
    fromRule: "S03",
    toRule: "O01",
    lagMinDays: 7,
    lagMaxDays: 14,
    mechanism: "Unresolved decisions block operational pipelines",
    strength: 0.5, // DESIGN PARAMETER: not calibrated from data. Adjust based on observed outcomes.
  },
  {
    id: "CL05",
    fromRule: "R01",
    toRule: "O02",
    lagMinDays: 14,
    lagMaxDays: 60,
    mechanism: "Tech debt accumulation precedes incidents",
    strength: 0.6, // DESIGN PARAMETER: not calibrated from data. Adjust based on observed outcomes.
  },
  {
    id: "CL06",
    fromRule: "CS02",
    toRule: "F02",
    lagMinDays: 30,
    lagMaxDays: 90,
    mechanism: "Churn degrades revenue metrics",
    strength: 0.7, // DESIGN PARAMETER: not calibrated from data. Adjust based on observed outcomes.
  },
  {
    id: "CL07",
    fromRule: "M02",
    toRule: "CS04",
    lagMinDays: 0,
    lagMaxDays: 14,
    mechanism: "Production issues immediately harm customer health",
    strength: 0.75, // DESIGN PARAMETER: not calibrated from data. Adjust based on observed outcomes.
  },
  {
    id: "CL08",
    fromRule: "P01",
    toRule: "P05",
    lagMinDays: 14,
    lagMaxDays: 30,
    mechanism: "1:1 gaps lead to missed commitments",
    strength: 0.4, // DESIGN PARAMETER: not calibrated from data. Adjust based on observed outcomes.
  },
  {
    id: "CL09",
    fromRule: "C01",
    toRule: "F04",
    lagMinDays: 30,
    lagMaxDays: 90,
    mechanism: "Compliance failures lead to remediation costs",
    strength: 0.35, // DESIGN PARAMETER: not calibrated from data. Adjust based on observed outcomes.
  },
  {
    id: "CL10",
    fromRule: "S06",
    toRule: "M05",
    lagMinDays: 14,
    lagMaxDays: 30,
    mechanism: "Strategic delays produce capacity mismatches",
    strength: 0.4, // DESIGN PARAMETER: not calibrated from data. Adjust based on observed outcomes.
  },
  {
    id: "CL11",
    fromRule: "P06",
    toRule: "R04",
    lagMinDays: 30,
    lagMaxDays: 90,
    mechanism: "Management overload creates knowledge silos",
    strength: 0.45, // DESIGN PARAMETER: not calibrated from data. Adjust based on observed outcomes.
  },
  {
    id: "CL12",
    fromRule: "CS01",
    toRule: "F06",
    lagMinDays: 60,
    lagMaxDays: 90,
    mechanism: "NPS decline concentrates revenue at strongest accounts",
    strength: 0.35, // DESIGN PARAMETER: not calibrated from data. Adjust based on observed outcomes.
  },
];

function playbookHint(link: CausalLinkDef): string {
  return `Address "${link.fromRule}" first — ${link.mechanism.toLowerCase()}, typically surfacing in "${link.toRule}" within ${link.lagMinDays}-${link.lagMaxDays} days.`;
}

/**
 * detectCascades — for each causal link, checks whether the "from" rule
 * fired within the link's lag window and the "to" rule is currently
 * active. If both hold, reports a CausalCascade with an amplification
 * factor applied to the "to" finding's effective severity.
 */
export function detectCascades(ruleStates: Record<string, RuleState>, now: Date): CausalCascade[] {
  const cascades: CausalCascade[] = [];

  for (const link of CAUSAL_LINKS) {
    const fromFiring = ruleStates[link.fromRule];
    const toFiring = ruleStates[link.toRule];
    if (!fromFiring || !toFiring) continue;
    if (!fromFiring.active || !toFiring.active) continue;
    if (!fromFiring.lastFiredAt) continue;

    const lag = daysBetween(fromFiring.lastFiredAt, now);
    if (lag < 0 || lag > link.lagMaxDays) continue;
    // lagMinDays is advisory (earliest expected effect) — we still report
    // cascades observed earlier than expected, but note it in confidence.
    const withinExpectedWindow = lag >= link.lagMinDays;

    const confidence = Math.max(0.05, Math.min(1, link.strength * fromFiring.confidence * (withinExpectedWindow ? 1 : 0.7)));
    const amplificationFactor = 1 + link.strength * fromFiring.confidence;

    cascades.push({
      link: link.id,
      fromFiring,
      toFiring,
      confidence: Math.round(confidence * 100) / 100,
      amplificationFactor: Math.round(amplificationFactor * 100) / 100,
      intervention: playbookHint(link),
    });
  }

  return cascades;
}

/** Convenience: run detectCascades directly off a BrainProjection. */
export function detectCascadesFromProjection(P: BrainProjection, now: Date): CausalCascade[] {
  return detectCascades(P.ruleStates, now);
}

export function linkById(id: string): CausalLinkDef | undefined {
  return CAUSAL_LINKS.find((l) => l.id === id);
}
