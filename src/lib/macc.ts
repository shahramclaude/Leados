// ---------------------------------------------------------------------------
// src/lib/macc.ts
//
// Marginal Abatement Cost Curve math for the Reduction Portfolio surface.
// Initiatives are ranked by cost-per-tonne ascending; cheapest (and
// cost-negative / "win-win") abatement is implemented first, matching
// standard MACC conventions. Linked conceptually to a Part 07-style
// portfolio via `portfolioRef`.
// ---------------------------------------------------------------------------

export interface AbatementInitiativeInput {
  id: string;
  name: string;
  scope: string;
  category: string;
  annualAbatementTco2e: number;
  annualNetCostUsd: number; // negative = net savings
  implementationStatus: string;
  portfolioRef: string | null;
  evidenceClass: string;
}

export interface MaccBar extends AbatementInitiativeInput {
  costPerTonneUsd: number;
  cumulativeAbatementTco2e: number;
  cumulativeStartTco2e: number;
}

export interface MaccCurve {
  bars: MaccBar[];
  totalAbatementTco2e: number;
  totalNetCostUsd: number;
  /** Abatement available at net-negative cost (cost savings), a common MACC headline figure. */
  netNegativeAbatementTco2e: number;
}

export function buildMacc(initiatives: AbatementInitiativeInput[]): MaccCurve {
  const withCostPerTonne = initiatives.map((i) => ({
    ...i,
    costPerTonneUsd: i.annualAbatementTco2e !== 0 ? i.annualNetCostUsd / i.annualAbatementTco2e : Infinity,
  }));
  const sorted = [...withCostPerTonne].sort((a, b) => a.costPerTonneUsd - b.costPerTonneUsd);

  let cumulative = 0;
  const bars: MaccBar[] = sorted.map((i) => {
    const cumulativeStartTco2e = cumulative;
    cumulative += i.annualAbatementTco2e;
    return { ...i, cumulativeStartTco2e, cumulativeAbatementTco2e: cumulative };
  });

  const totalAbatementTco2e = bars.reduce((s, b) => s + b.annualAbatementTco2e, 0);
  const totalNetCostUsd = bars.reduce((s, b) => s + b.annualNetCostUsd, 0);
  const netNegativeAbatementTco2e = bars.filter((b) => b.costPerTonneUsd < 0).reduce((s, b) => s + b.annualAbatementTco2e, 0);

  return { bars, totalAbatementTco2e, totalNetCostUsd, netNegativeAbatementTco2e };
}
