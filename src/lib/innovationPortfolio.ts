// innovation_portfolio — three-horizons innovation management.
//
// PROVENANCE: pasted "pt-O" brief names `js/innovation_portfolio.js`. Not
// found in github.com/wbweve/Leados this session. The "Three Horizons"
// framework (H1 core / H2 emerging / H3 transformational) is a real, citable
// McKinsey framework (Baghai, Coley & White, 2000). The target allocation
// band (commonly cited as ~70/20/10) and the imbalance scoring are applied
// here as a standard reference point, not claimed as a universal law.

import type { Initiative } from "./types";
import { round1 } from "./prng";

export interface HorizonSummary {
  horizon: 1 | 2 | 3;
  label: string;
  investment: number;
  expectedReturn: number;
  count: number;
  allocationPct: number;
  targetPct: number;
}

export interface InnovationPortfolioResult {
  horizons: HorizonSummary[];
  totalInvestment: number;
  imbalanceScore: number; // 0-100, 0 = perfectly matches target allocation
  verdict: string;
  blendedRoi: number;
}

const TARGET: Record<1 | 2 | 3, number> = { 1: 70, 2: 20, 3: 10 };
const LABELS: Record<1 | 2 | 3, string> = {
  1: "H1 — Core (defend & extend)",
  2: "H2 — Emerging (build)",
  3: "H3 — Transformational (explore)",
};

export function computeInnovationPortfolio(initiatives: Initiative[]): InnovationPortfolioResult {
  const totalInvestment = initiatives.reduce((s, i) => s + i.investment, 0) || 1;

  const horizons: HorizonSummary[] = ([1, 2, 3] as const).map((h) => {
    const items = initiatives.filter((i) => i.horizon === h);
    const investment = items.reduce((s, i) => s + i.investment, 0);
    const expectedReturn = items.reduce((s, i) => s + i.expectedReturn, 0);
    return {
      horizon: h,
      label: LABELS[h],
      investment,
      expectedReturn,
      count: items.length,
      allocationPct: round1((investment / totalInvestment) * 100),
      targetPct: TARGET[h],
    };
  });

  const imbalanceScore = round1(
    horizons.reduce((s, h) => s + Math.abs(h.allocationPct - h.targetPct), 0) / 2
  );

  const totalReturn = initiatives.reduce((s, i) => s + i.expectedReturn, 0);
  const blendedRoi = round1(((totalReturn - totalInvestment) / totalInvestment) * 100);

  const verdict =
    imbalanceScore < 10
      ? "Portfolio allocation is close to the 70/20/10 reference band — balanced risk profile."
      : horizons[2].allocationPct < TARGET[3] && horizons[0].allocationPct > TARGET[1]
      ? "Over-indexed on H1 — likely under-investing in future growth options."
      : horizons[2].allocationPct > TARGET[3] * 1.5
      ? "Over-indexed on H3 — transformational bets may be crowding out near-term delivery."
      : "Allocation deviates from the reference band; review horizon mix against strategy.";

  return { horizons, totalInvestment, imbalanceScore, verdict, blendedRoi };
}

export function innovationPortfolioSignal(initiatives: Initiative[]): number {
  const { imbalanceScore } = computeInnovationPortfolio(initiatives);
  return Math.max(0, Math.min(100, 100 - imbalanceScore));
}
