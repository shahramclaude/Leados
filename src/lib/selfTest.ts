// Original in-browser self-test suite for this delivery's own math (not a
// reproduction of any T_L_*/G_L_* or other externally-named test suite,
// which could not be verified anywhere — see AI-SESSION-LOG.md).

import { computeLifeStage } from "./lifeStage";
import { detectCompoundEffects } from "./compoundIntel";
import { runWargame } from "./wargame";
import { computeOrgDesign, graicunasRelationships } from "./orgDesign";
import { analyzeStakeholders, stakeholderGame } from "./stakeholders";
import { computeRealOptionValue, normCdf } from "./realOptions";
import { computeExecutivePresence } from "./executivePresence";
import { computeInnovationPortfolio } from "./innovationPortfolio";
import { computeChangeManagement } from "./changeManagement";
import { computeCompetitiveIntel } from "./competitiveIntel";
import { buildSeedState } from "./seed";

export interface TestResult {
  id: string;
  pass: boolean;
  detail: string;
}

export function runSelfTests(): TestResult[] {
  const seed = buildSeedState();
  const results: TestResult[] = [];

  const push = (id: string, pass: boolean, detail: string) => results.push({ id, pass, detail });

  // OIP_01 — life stage overall is bounded and matches mean of inputs
  const ls = computeLifeStage(seed.lifeStage);
  const manualMean = Object.values(seed.lifeStage).reduce((a, b) => a + b, 0) / 12;
  push("OIP_01_lifeStage_mean", Math.abs(ls.overall - manualMean) < 0.2, `overall=${ls.overall} manualMean=${manualMean.toFixed(1)}`);

  // OIP_02 — compound effects: identical twin strong signals must be flagged compounding
  const cp = detectCompoundEffects([
    { key: "a", label: "A", value: 90 },
    { key: "b", label: "B", value: 90 },
    { key: "c", label: "C", value: 10 },
  ]);
  const hasCompounding = cp.pairs.some((p) => p.type === "compounding");
  const hasFragility = cp.pairs.some((p) => p.type === "fragility");
  push("OIP_02_compound_detect", hasCompounding && hasFragility, `compounding=${hasCompounding} fragility=${hasFragility}`);

  // OIP_03 — wargame matrix always has 4 postures and a defined recommendation
  const wg = runWargame(seed.wargame.ourPosture, seed.wargame.competitorArchetype, seed.wargame.marketVolatility);
  push("OIP_03_wargame_matrix", wg.matrix.length === 4 && !!wg.recommendedPosture, `postures=${wg.matrix.length}`);

  // OIP_04 — Graicunas relationships grows super-linearly with span
  const g4 = graicunasRelationships(4);
  const g8 = graicunasRelationships(8);
  push("OIP_04_graicunas_growth", g8 > g4 * 2, `g4=${g4} g8=${g8}`);

  const od = computeOrgDesign(seed.orgDesign);
  push("OIP_05_orgdesign_bounds", od.efficiencyScore >= 0 && od.efficiencyScore <= 100, `efficiency=${od.efficiencyScore}`);

  // OIP_06 — stakeholder alignment index within [-100,100] and quadrants valid
  const { analyzed, alignmentIndex } = analyzeStakeholders(seed.stakeholders);
  const validQuadrants = analyzed.every((a) =>
    ["Manage Closely", "Keep Satisfied", "Keep Informed", "Monitor"].includes(a.quadrant)
  );
  push("OIP_06_stakeholder_quadrants", validQuadrants && Math.abs(alignmentIndex) <= 100, `alignment=${alignmentIndex}`);

  // OIP_07 — game theory: fully positive stance should yield mutual cooperation
  const game = stakeholderGame(100);
  push("OIP_07_game_cooperation", game.equilibrium === "mutual cooperation", `equilibrium=${game.equilibrium}`);

  // OIP_08 — normCdf(0) ≈ 0.5, standard normal distribution sanity check
  push("OIP_08_normcdf_sanity", Math.abs(normCdf(0) - 0.5) < 0.001, `normCdf(0)=${normCdf(0).toFixed(4)}`);

  // OIP_09 — Black-Scholes call value is non-negative (no-arbitrage property)
  const ro = computeRealOptionValue(seed.realOptions);
  push("OIP_09_blackscholes_nonneg", ro.callValue >= 0, `callValue=${ro.callValue}`);

  // OIP_10 — executive presence composite respects gravitas-heaviest weighting
  const ep = computeExecutivePresence({ gravitas: 100, communication: 0, appearance: 0 });
  push("OIP_10_execpresence_weighting", ep.composite === 50, `composite=${ep.composite}`);

  // OIP_11 — innovation portfolio horizons sum to total investment
  const ip = computeInnovationPortfolio(seed.initiatives);
  const sumInvestment = ip.horizons.reduce((s, h) => s + h.investment, 0);
  push("OIP_11_portfolio_sum", sumInvestment === ip.totalInvestment, `sum=${sumInvestment} total=${ip.totalInvestment}`);

  // OIP_12 — ADKAR barrier point is always the minimum dimension
  const cm = computeChangeManagement(seed.adkar);
  const manualMin = Math.min(...Object.values(seed.adkar));
  push("OIP_12_adkar_barrier", cm.barrierScore === manualMin, `barrier=${cm.barrierScore} min=${manualMin}`);

  // OIP_13 — competitive intel ranks competitors in descending threat order
  const ci = computeCompetitiveIntel(seed.competitors);
  const sortedCorrectly = ci.ranked.every((c, i) => i === 0 || ci.ranked[i - 1].threatScore >= c.threatScore);
  push("OIP_13_competitive_sort", sortedCorrectly, `top=${ci.topThreat.name}@${ci.topThreat.threatScore}`);

  return results;
}
