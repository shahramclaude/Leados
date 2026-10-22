// Seam 4: global entities flow into consolidation -> board pack.
export type EntityFinancials = {
  name: string;
  region: string;
  currency: string;
  revenue: number;
  costs: number;
  fxRateToUsd: number;
};

export type ConsolidationResult = {
  totalRevenueUsd: number;
  totalCostsUsd: number;
  netUsd: number;
  entityCount: number;
  fxNotes: Array<{ name: string; currency: string; fxRateToUsd: number }>;
};

export function runConsolidation(entityList: EntityFinancials[]): ConsolidationResult {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  let totalRevenueUsd = 0;
  let totalCostsUsd = 0;
  const fxNotes: ConsolidationResult["fxNotes"] = [];

  for (const entity of entityList) {
    totalRevenueUsd += entity.revenue * entity.fxRateToUsd;
    totalCostsUsd += entity.costs * entity.fxRateToUsd;
    fxNotes.push({ name: entity.name, currency: entity.currency, fxRateToUsd: entity.fxRateToUsd });
  }

  return {
    totalRevenueUsd: round2(totalRevenueUsd),
    totalCostsUsd: round2(totalCostsUsd),
    netUsd: round2(totalRevenueUsd - totalCostsUsd),
    entityCount: entityList.length,
    fxNotes,
  };
}

export function buildBoardPackSummary(period: string, result: ConsolidationResult): string {
  const marginPct =
    result.totalRevenueUsd === 0
      ? 0
      : Math.round((result.netUsd / result.totalRevenueUsd) * 10000) / 100;
  const lossWarning =
    result.netUsd < 0
      ? `\n⚠ LOSS THIS PERIOD: net result is negative ($${result.netUsd.toLocaleString("en-US")}). This line is never suppressed or reworded to sound neutral.`
      : "";
  return (
    `Board Pack — ${period}\n` +
    `Consolidated ${result.entityCount} entities across ${new Set(result.fxNotes.map((f) => f.currency)).size} currencies.\n` +
    `Revenue: $${result.totalRevenueUsd.toLocaleString("en-US")} | Costs: $${result.totalCostsUsd.toLocaleString("en-US")} | Net: $${result.netUsd.toLocaleString("en-US")} (${marginPct}% margin).${lossWarning}\n` +
    `Note: FX rates are point-in-time snapshots, not hedged or period-average rates. Intercompany eliminations are NOT applied. Treat net margin as directional, not statutory.`
  );
}
