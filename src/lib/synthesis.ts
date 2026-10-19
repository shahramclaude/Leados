// src/lib/synthesis.ts
// Organizational "moment" synthesis — turns the belief fabric state into a
// single strategic-memo-style paragraph that opens the board pack.
//
// Exported: MOMENT_TEMPLATES (const, line 14), getOrganizationalMoment
//           (function, line 44)

import type { BeliefFabricResult } from './beliefFabric';

export interface MomentContext {
  orgHealthScore: number;
  dominantRiskLabel: string;
  dominantRiskDomain: string;
  cascadeP: number;
}

const MOMENT_TEMPLATES: Array<{ when: (c: MomentContext) => boolean; text: (c: MomentContext) => string }> = [
  {
    when: (c) => c.orgHealthScore >= 78,
    text: (c) =>
      `This is a compounding moment. ${c.dominantRiskLabel} is the only signal worth watching closely, and even that remains well within tolerance — the organization has room to be bold rather than defensive.`,
  },
  {
    when: (c) => c.orgHealthScore >= 55 && c.orgHealthScore < 78,
    text: (c) =>
      `This is a steady-state moment with one emerging edge. ${c.dominantRiskLabel} is beginning to shape the conversation, with roughly a ${Math.round(c.cascadeP * 100)}% chance of spilling into adjacent domains if it isn't addressed this quarter.`,
  },
  {
    when: (c) => c.orgHealthScore >= 35 && c.orgHealthScore < 55,
    text: (c) =>
      `This is an inflection moment. ${c.dominantRiskLabel} has moved from a background signal to the dominant force in the system, and the model now puts a ${Math.round(c.cascadeP * 100)}% chance on it cascading into a second domain within one quarter. Leadership attention should follow the signal, not the calendar.`,
  },
  {
    when: () => true,
    text: (c) =>
      `This is a critical moment. ${c.dominantRiskLabel} is actively degrading the operating plan, with a ${Math.round(c.cascadeP * 100)}% modeled chance of cascading further without intervention. The board should treat the next decision cycle as load-bearing, not routine.`,
  },
];

/**
 * getOrganizationalMoment
 * Selects and renders the matching moment template for the current belief
 * fabric state. Always returns a single dense paragraph suitable for a
 * memo-styled card.
 */
export function getOrganizationalMoment(belief: BeliefFabricResult): string {
  const ctx: MomentContext = {
    orgHealthScore: belief.orgHealthScore,
    dominantRiskLabel: belief.dominantRisk.label,
    dominantRiskDomain: belief.dominantRisk.domain,
    cascadeP: belief.cascadeRisk.p,
  };
  const template = MOMENT_TEMPLATES.find((t) => t.when(ctx)) ?? MOMENT_TEMPLATES[MOMENT_TEMPLATES.length - 1];
  return template.text(ctx);
}

export { MOMENT_TEMPLATES };
