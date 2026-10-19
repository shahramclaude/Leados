// Innovation portfolio scoring across horizons (core / adjacent /
// transformational), inspired by the classic "three horizons of growth"
// framework. Produces a risk-adjusted return and a balance score so the
// portfolio view can flag when bets are too concentrated in one horizon.

import type { InnovationPortfolioItem } from "./types";
import { toNumber } from "./types";

export interface PortfolioItemScore {
  id: string;
  name: string;
  horizon: InnovationPortfolioItem["horizon"];
  investment: number;
  expectedReturn: number;
  riskScore: number;
  riskAdjustedReturn: number;
}

export interface PortfolioSummary {
  items: PortfolioItemScore[];
  totalInvestment: number;
  horizonMix: Record<string, number>; // fraction of investment per horizon
  balanceScore: number; // 0-1, 1 = perfectly balanced across horizons (70/20/10 target)
}

const TARGET_MIX: Record<string, number> = {
  core: 0.7,
  adjacent: 0.2,
  transformational: 0.1,
};

export function scorePortfolio(items: InnovationPortfolioItem[]): PortfolioSummary {
  const scored: PortfolioItemScore[] = items.map((item) => {
    const investment = toNumber(item.investment, 0);
    const expectedReturn = toNumber(item.expectedReturn, 0);
    const riskScore = toNumber(item.riskScore, 0.5);
    const riskAdjustedReturn = investment > 0 ? (expectedReturn * (1 - riskScore)) / investment : 0;
    return {
      id: item.id,
      name: item.name,
      horizon: item.horizon,
      investment,
      expectedReturn,
      riskScore,
      riskAdjustedReturn,
    };
  });

  const totalInvestment = scored.reduce((sum, i) => sum + i.investment, 0);
  const horizonMix: Record<string, number> = { core: 0, adjacent: 0, transformational: 0 };
  for (const item of scored) {
    horizonMix[item.horizon] = (horizonMix[item.horizon] ?? 0) + item.investment;
  }
  for (const key of Object.keys(horizonMix)) {
    horizonMix[key] = totalInvestment > 0 ? horizonMix[key] / totalInvestment : 0;
  }

  const deviation = Object.keys(TARGET_MIX).reduce((sum, key) => {
    return sum + Math.abs((horizonMix[key] ?? 0) - TARGET_MIX[key]);
  }, 0);
  const balanceScore = Math.max(0, 1 - deviation / 2);

  return { items: scored, totalInvestment, horizonMix, balanceScore };
}
