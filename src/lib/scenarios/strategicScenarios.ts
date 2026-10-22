import { explain } from "../core/explain";
import { seedFromString } from "../core/rng";
import { buildScenario } from "./simulationScenario";
import type { MacroAssumption, Scenario, StressShock } from "./types";

/**
 * Scenario space definition.
 *
 * Two framing tools are combined, per the brief:
 *  1. A 2x2 axis quadrant (regulatory intensity × competitive structure) for
 *     named-world orientation.
 *  2. A third axis (technology commoditization) handled via morphological
 *     analysis: of the 2×2×2 = 8 cross-combinations, 3 are pruned for low
 *     cross-consistency and 5 are carried into the ensemble.
 */
export const SCENARIO_AXES = [
  {
    id: "axis-regulation",
    name: "Regulatory Intensity",
    lowLabel: "Light-touch",
    highLabel: "Strict audit regime",
    description: "How aggressively regulators constrain AI-assisted decision systems.",
  },
  {
    id: "axis-competition",
    name: "Competitive Structure",
    lowLabel: "Fragmented",
    highLabel: "Consolidated / bundled",
    description: "Whether the market stays many-player and open, or a few bundlers capture distribution.",
  },
  {
    id: "axis-technology",
    name: "Technology Commoditization",
    lowLabel: "Proprietary moat holds",
    highLabel: "Commoditized",
    description: "Whether model quality remains a differentiator or becomes table-stakes.",
  },
] as const;

/** Combinations considered and why 3 of 8 were pruned — this record itself is part of the audit trail. */
export const MORPHOLOGICAL_PRUNING_LOG: Array<{ combination: string; kept: boolean; reason: string }> = [
  { combination: "strict × fragmented × proprietary-moat", kept: false, reason: "Low cross-consistency: compliance cost of a strict regime tends to consolidate fragmented markets within 2-3 years, not preserve fragmentation." },
  { combination: "strict × fragmented × commoditized", kept: false, reason: "Low cross-consistency: same consolidation pressure argument, compounded by commoditization squeezing small players faster." },
  { combination: "light × consolidated × commoditized", kept: false, reason: "Folded into 'Platform Capture' as a minor variant rather than tracked separately — kept the ensemble to 5 scenarios for tractable wind-tunnel runtime." },
  { combination: "light × fragmented × proprietary-moat", kept: true, reason: "Self-consistent baseline: no forcing pressure in either direction." },
  { combination: "light × fragmented × commoditized", kept: true, reason: "Self-consistent: open regulatory field but margin pressure from commoditized tech." },
  { combination: "light × consolidated × proprietary-moat", kept: true, reason: "Self-consistent: distribution bundlers win without needing commoditization to do it." },
  { combination: "strict × consolidated × proprietary-moat", kept: true, reason: "Self-consistent: compliance cost is the consolidation mechanism." },
  { combination: "strict × consolidated × commoditized", kept: true, reason: "Self-consistent and most severe combination: compliance cost AND commoditized tech both push toward consolidation." },
];

const BASE_PARAMETERS = {
  revenueGrowth: 0.18,
  churnRate: 0.08,
  cashRunwayMonths: 18,
  headcount: 42,
  marketShare: 0.06,
  regulatoryPressure: 0.2,
  talentAvailability: 0.6,
  competitorAggression: 0.3,
};

function macro(
  id: string,
  dimension: MacroAssumption["dimension"],
  text: string,
  confidence: MacroAssumption["assumption"]["confidence"],
  parameterDeltas: Record<string, number>,
  sourceRefs: string[] = []
): MacroAssumption {
  return {
    id,
    dimension,
    assumption: explain(text, "Authored macro assumption feeding the scenario's twin configuration.", confidence, "scenario-studio", sourceRefs, "2026-03-05T09:00:00.000Z"),
    parameterDeltas,
  };
}

function shock(id: string, label: string, description: string, appliesAtTick: number, parameterDeltas: Record<string, number>): StressShock {
  return { id, label, description, appliesAtTick, parameterDeltas };
}

export const SEED_SCENARIOS: Scenario[] = [
  buildScenario({
    id: "scn-open-frontier",
    name: "Open Frontier",
    narrative: "Regulation stays light-touch, the market remains fragmented, and proprietary model/workflow quality continues to matter. Closest to today's conditions extrapolated forward.",
    narrativeConfidence: "moderate",
    authoredBy: "scenario-studio-seed",
    quadrant: { axisXId: "axis-regulation", axisXSide: "low", axisYId: "axis-competition", axisYSide: "low" },
    baseParameters: BASE_PARAMETERS,
    macroAssumptions: [
      macro("ma-open-reg", "regulation", "No binding AI-audit statute passes in core markets within 18 months.", "moderate", { regulatoryPressure: -0.03 }, ["sig-regulatory-ai-audit"]),
      macro("ma-open-comp", "competition", "No dominant bundler emerges; mid-market stays contestable.", "moderate", { competitorAggression: 0.02 }, ["sig-competitor-bundling"]),
    ],
    shocks: [shock("shk-open-demand", "Demand uptick", "A general uptick in enterprise foresight-tooling demand.", 3, { revenueGrowth: 0.02 })],
    planningWeight: 0.22,
    seed: seedFromString("scn-open-frontier"),
    authoredAt: "2026-03-05T09:05:00.000Z",
  }),
  buildScenario({
    id: "scn-fragmented-frontier",
    name: "Fragmented Frontier",
    narrative: "Regulation stays light and the market stays fragmented, but model/workflow quality commoditizes — advantage shifts to data, distribution, and integration depth.",
    narrativeConfidence: "moderate",
    authoredBy: "scenario-studio-seed",
    quadrant: { axisXId: "axis-regulation", axisXSide: "low", axisYId: "axis-competition", axisYSide: "low" },
    baseParameters: BASE_PARAMETERS,
    macroAssumptions: [
      macro("ma-ff-tech", "technology", "Open-weight models close the quality gap enough that model choice stops being a selling point.", "moderate", { competitorAggression: 0.06, revenueGrowth: -0.015 }, ["sig-open-model-commoditization"]),
      macro("ma-ff-talent", "talent", "Decision-science specialist talent stays scarce, raising delivery cost.", "high", { talentAvailability: -0.1 }, ["sig-talent-tightening"]),
    ],
    shocks: [shock("shk-ff-price-war", "Price compression", "Commoditization triggers a round of price compression across the category.", 4, { revenueGrowth: -0.04, competitorAggression: 0.08 })],
    planningWeight: 0.22,
    seed: seedFromString("scn-fragmented-frontier"),
    authoredAt: "2026-03-05T09:06:00.000Z",
  }),
  buildScenario({
    id: "scn-platform-capture",
    name: "Platform Capture",
    narrative: "Regulation stays light, but a large incumbent bundles foresight tooling into its existing suite for free, capturing distribution before pure-plays can respond.",
    narrativeConfidence: "moderate",
    authoredBy: "scenario-studio-seed",
    quadrant: { axisXId: "axis-regulation", axisXSide: "low", axisYId: "axis-competition", axisYSide: "high" },
    baseParameters: BASE_PARAMETERS,
    macroAssumptions: [
      macro("ma-pc-comp", "competition", "A bundler reaches general availability with a free-tier scenario-planning feature.", "moderate", { competitorAggression: 0.12, marketShare: -0.01 }, ["sig-competitor-bundling"]),
    ],
    shocks: [shock("shk-pc-ga", "Bundler GA launch", "The bundled competitor feature reaches general availability.", 2, { competitorAggression: 0.1, revenueGrowth: -0.03 })],
    planningWeight: 0.2,
    seed: seedFromString("scn-platform-capture"),
    authoredAt: "2026-03-05T09:07:00.000Z",
  }),
  buildScenario({
    id: "scn-regulatory-clampdown",
    name: "Regulatory Clampdown",
    narrative: "A strict third-party AI-audit regime passes, raising compliance cost enough that the market consolidates around vendors who can absorb it.",
    narrativeConfidence: "low",
    authoredBy: "scenario-studio-seed",
    quadrant: { axisXId: "axis-regulation", axisXSide: "high", axisYId: "axis-competition", axisYSide: "high" },
    baseParameters: BASE_PARAMETERS,
    macroAssumptions: [
      macro("ma-rc-reg", "regulation", "A binding third-party AI-audit statute passes with an 18-month effective date.", "low", { regulatoryPressure: 0.3, cashRunwayMonths: -2 }, ["sig-regulatory-ai-audit", "hyp-12-003"]),
      macro("ma-rc-comp", "competition", "Smaller vendors unable to absorb audit cost exit or get acquired, consolidating the field.", "low", { competitorAggression: -0.05, marketShare: 0.015 }),
    ],
    shocks: [shock("shk-rc-statute", "Statute takes effect", "The AI-audit statute becomes binding; compliance spend spikes.", 5, { regulatoryPressure: 0.2, cashRunwayMonths: -3, revenueGrowth: -0.02 })],
    planningWeight: 0.18,
    seed: seedFromString("scn-regulatory-clampdown"),
    authoredAt: "2026-03-05T09:08:00.000Z",
  }),
  buildScenario({
    id: "scn-commoditized-scramble",
    name: "Commoditized Scramble",
    narrative: "The most severe combination: strict regulation AND commoditized technology both push toward consolidation, while compliance cost and price compression hit simultaneously.",
    narrativeConfidence: "speculative",
    authoredBy: "scenario-studio-seed",
    quadrant: { axisXId: "axis-regulation", axisXSide: "high", axisYId: "axis-competition", axisYSide: "high" },
    baseParameters: BASE_PARAMETERS,
    macroAssumptions: [
      macro("ma-cs-reg", "regulation", "Strict audit regime passes alongside technology commoditization.", "speculative", { regulatoryPressure: 0.28, cashRunwayMonths: -2 }, ["sig-regulatory-ai-audit"]),
      macro("ma-cs-tech", "technology", "Open-weight models commoditize model quality during the same window.", "speculative", { competitorAggression: 0.1, revenueGrowth: -0.02 }, ["sig-open-model-commoditization"]),
    ],
    shocks: [
      shock("shk-cs-statute", "Statute + price war compound", "Compliance cost and price compression hit in the same quarter.", 4, { regulatoryPressure: 0.22, revenueGrowth: -0.06, cashRunwayMonths: -3 }),
    ],
    planningWeight: 0.18,
    seed: seedFromString("scn-commoditized-scramble"),
    authoredAt: "2026-03-05T09:09:00.000Z",
  }),
];
