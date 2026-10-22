// src/lib/adaptation/presentationAdapter.ts
//
// Presentation adapter layer — sits between domain data (seedFacts.ts, or in
// production the real domain modules) and the UI components. This is the
// ONLY place adaptation is allowed to change what the user sees, and it is
// restricted to density/layout/order. The fact set itself is always returned
// unmodified and in full (content parity — see tests/presentationAdapter.contentParity.test.ts).

import type { Domain, ExpertiseLevel, ExpertiseScore } from "@/lib/familiarity";
import type { CognitiveStyleProfile } from "@/lib/humanNeeds";
import { DENSITY_TOKENS, type DensityMode } from "@/lib/design/tokens";
import { defaultOrderFor, type DomainFact } from "@/lib/adaptation/seedFacts";
import {
  runGuard,
  type AdaptationAction,
  type GuardContext,
  type GuardVerdict,
} from "@/lib/adaptation/manipulationGuard";

export type Layout = "narrative" | "hybrid" | "table";

export interface AdaptationProfileInput {
  domain: Domain;
  expertise: ExpertiseScore;
  style: CognitiveStyleProfile;
  /** Explicit user override of density; null = adaptive auto mode. */
  densityModeOverride: DensityMode | null;
  /** Freezes all adaptation at the neutral default (but keeps learning running in the background). */
  adaptationPaused: boolean;
  /** Request-scoped "always available" comparison toggle — never persisted as a profile change. */
  standardViewForced: boolean;
  /** Usage-weighted candidate order for this domain's facts, if any (sequence-class input). */
  usageWeightedOrder?: string[];
}

export interface AppliedAction extends AdaptationAction {
  verdict: GuardVerdict;
}

export interface PresentationResult {
  domain: Domain;
  densityMode: DensityMode;
  layout: Layout;
  /** Fact ids in the order the UI should render them. */
  order: string[];
  /** The complete, unmodified fact set — identical across every adaptation state. */
  facts: DomainFact[];
  /** Every adaptation decision applied (or attempted and blocked), for the transparency panel. */
  actions: AppliedAction[];
}

function densityFromExpertise(level: ExpertiseLevel): DensityMode {
  if (level === "novice") return "guided";
  if (level === "intermediate") return "standard";
  return "dense";
}

function layoutFromStyle(visualVsTabular: { value: number }): Layout {
  if (visualVsTabular.value >= 0.25) return "narrative";
  if (visualVsTabular.value <= -0.25) return "table";
  return "hybrid";
}

/**
 * Core adaptation entry point. `facts` is passed straight through to the
 * output unchanged — only `order`, `densityMode`, and `layout` are derived
 * from the profile, and every emphasis/sequence decision is routed through
 * the manipulation guard before being applied.
 */
export function adaptPresentation(facts: DomainFact[], profile: AdaptationProfileInput): PresentationResult {
  const neutralOrder = defaultOrderFor(facts);
  const severityById = Object.fromEntries(facts.map((f) => [f.id, f.severity]));
  const actions: AppliedAction[] = [];

  // Standard view (always-available comparison toggle) or paused adaptation:
  // render the pure neutral default and stop. This path has no emphasis or
  // sequence actions at all — it IS the counterfactual.
  if (profile.standardViewForced || profile.adaptationPaused) {
    const baselineAction: AdaptationAction = {
      id: `${profile.domain}-baseline`,
      surface: `dashboard.${profile.domain}`,
      class: "presentation",
      description: profile.standardViewForced
        ? "Standard view is forced on — showing the non-adaptive default."
        : "Adaptation is paused — showing the non-adaptive default until resumed.",
    };
    const verdict = runGuard(baselineAction, {});
    actions.push({ ...baselineAction, verdict });
    return {
      domain: profile.domain,
      densityMode: "standard",
      layout: "hybrid",
      order: neutralOrder,
      facts,
      actions,
    };
  }

  // 1) Density (presentation-class): derived from expertise unless explicitly overridden.
  const derivedDensity = densityFromExpertise(profile.expertise.level);
  const densityMode = profile.densityModeOverride ?? derivedDensity;
  const densityAction: AdaptationAction = {
    id: `${profile.domain}-density`,
    surface: `dashboard.${profile.domain}`,
    class: "presentation",
    description: profile.densityModeOverride
      ? `Density manually set to "${DENSITY_TOKENS[densityMode].label}".`
      : `Density set to "${DENSITY_TOKENS[densityMode].label}" because your ${profile.domain} expertise is "${profile.expertise.level}" (score ${profile.expertise.score.toFixed(2)}, confidence ${profile.expertise.confidence.toFixed(2)}).`,
    rationale: profile.densityModeOverride
      ? undefined
      : `Expertise score ${profile.expertise.score.toFixed(2)} maps to the "${profile.expertise.level}" tier.`,
    counterfactual: `Default density without adaptation is "Standard".`,
  };
  const densityVerdict = runGuard(densityAction, {});
  actions.push({ ...densityAction, verdict: densityVerdict });

  // 2) Layout (presentation-class): derived from cognitive style.
  const layout = layoutFromStyle(profile.style.visualVsTabular);
  const layoutAction: AdaptationAction = {
    id: `${profile.domain}-layout`,
    surface: `dashboard.${profile.domain}`,
    class: "presentation",
    description: `Layout set to "${layout}" based on your visual-vs-tabular preference (${profile.style.visualVsTabular.value.toFixed(2)}, confidence ${profile.style.visualVsTabular.confidence.toFixed(2)}).`,
    rationale: `Visual-vs-tabular preference value ${profile.style.visualVsTabular.value.toFixed(2)}.`,
    counterfactual: `Default layout without adaptation is "hybrid".`,
  };
  const layoutVerdict = runGuard(layoutAction, {});
  actions.push({ ...layoutAction, verdict: layoutVerdict });

  // 3) Order (sequence-class): usage-weighted, but guarded so critical/high
  // facts can never be demoted below the neutral default rank.
  let order = neutralOrder;
  if (profile.usageWeightedOrder && profile.usageWeightedOrder.length === facts.length) {
    const guardContext: GuardContext = {
      defaultOrder: neutralOrder,
      proposedOrder: profile.usageWeightedOrder,
      severityById: severityById as GuardContext["severityById"],
    };
    const sequenceAction: AdaptationAction = {
      id: `${profile.domain}-sequence`,
      surface: `dashboard.${profile.domain}`,
      class: "sequence",
      description: `Facts reordered based on what you've viewed most in ${profile.domain} recently.`,
      rationale: `Usage-weighted order derived from your recent interaction history in this domain.`,
      counterfactual: `Default order (by severity, most severe first) is: ${neutralOrder.join(", ")}.`,
    };
    const sequenceVerdict = runGuard(sequenceAction, guardContext);
    actions.push({ ...sequenceAction, verdict: sequenceVerdict });
    order = sequenceVerdict.blocked ? neutralOrder : profile.usageWeightedOrder;
  }

  return {
    domain: profile.domain,
    densityMode: densityVerdict.blocked ? "standard" : densityMode,
    layout: layoutVerdict.blocked ? "hybrid" : layout,
    order,
    facts,
    actions,
  };
}
