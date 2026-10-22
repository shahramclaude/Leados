// ---------------------------------------------------------------------------
// src/lib/costModel.ts
//
// Spend-based costing helpers shared between the carbon calculation chain
// and the finance reconciliation identity. Spend-based emissions are
// quantity-in-dollars x an EEIO-style ($/kgCO2e) factor, so the "activity
// quantity" for these records is itself a financial figure. That is exactly
// the surface where carbon accounting and Part 08's finance DAG must agree:
// the dollars used to estimate emissions must reconcile against the
// financial ledger's recorded spend for the same period/category.
// ---------------------------------------------------------------------------
import { Explain, explain, EvidenceClass, Method } from "./evidence";

export interface SpendActivity {
  id: string;
  period: string;
  category: string;
  spendAmountUsd: number;
  financeLedgerRef: string | null;
}

export interface FinanceLedgerEntry {
  id: string;
  period: string;
  category: string;
  amountUsd: number;
}

export interface ReconciliationRow {
  period: string;
  category: string;
  activityTotalUsd: number;
  financeTotalUsd: number;
  deltaUsd: number;
  deltaPct: number;
  tolerancePct: number;
  pass: boolean;
}

/**
 * Reconciliation identity (same discipline as Part 08's financial
 * identities): for every (period, category) the sum of spend-based activity
 * dollars used for carbon estimation must match the finance ledger's
 * recorded spend within a tolerance, since they describe the same
 * transactions viewed from two subsystems.
 */
export function reconcileActivityToFinance(
  activities: SpendActivity[],
  ledger: FinanceLedgerEntry[],
  tolerancePct = 0.01,
): ReconciliationRow[] {
  const key = (period: string, category: string) => `${period}::${category}`;
  const activityTotals = new Map<string, number>();
  for (const a of activities) {
    const k = key(a.period, a.category);
    activityTotals.set(k, (activityTotals.get(k) ?? 0) + a.spendAmountUsd);
  }
  const financeTotals = new Map<string, number>();
  for (const l of ledger) {
    const k = key(l.period, l.category);
    financeTotals.set(k, (financeTotals.get(k) ?? 0) + l.amountUsd);
  }

  const keys = new Set<string>([...activityTotals.keys(), ...financeTotals.keys()]);
  const rows: ReconciliationRow[] = [];
  for (const k of keys) {
    const [period, category] = k.split("::");
    const activityTotalUsd = activityTotals.get(k) ?? 0;
    const financeTotalUsd = financeTotals.get(k) ?? 0;
    const deltaUsd = activityTotalUsd - financeTotalUsd;
    const deltaPct = financeTotalUsd !== 0 ? Math.abs(deltaUsd) / Math.abs(financeTotalUsd) : activityTotalUsd === 0 ? 0 : 1;
    rows.push({
      period,
      category,
      activityTotalUsd,
      financeTotalUsd,
      deltaUsd,
      deltaPct,
      tolerancePct,
      pass: deltaPct <= tolerancePct,
    });
  }
  return rows.sort((a, b) => (a.period + a.category).localeCompare(b.period + b.category));
}

/** Compute a spend-based emission estimate (quantity in USD x $/kgCO2e factor), wrapped in Explain. */
export function computeSpendBasedEmissionKg(
  spendUsd: number,
  factorKgPerUsd: number,
  evidenceClass: EvidenceClass,
  method: Method,
  sources: string[],
  asOf: string,
  uncertaintyPct?: number,
): Explain<number> {
  return explain(spendUsd * factorKgPerUsd, method, evidenceClass, sources, asOf, {
    uncertaintyPct,
    notes:
      "Spend-based estimate: derived from financial transaction value, not physical activity. " +
      "Suitable for materiality screening and trend direction, not for granular reduction tracking.",
  });
}
