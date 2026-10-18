// Financial Intelligence OS — original TypeScript implementing the *functional
// ideas* described in the task's pasted "Part 5" brief (unit economics, capital
// allocation heuristic, scenario-weighted projection). That brief is treated as
// an unverified external specification — no matching module was found anywhere
// in github.com/wbweve/Leados (see AI-SESSION-LOG.md) — so nothing here is a
// port of real repo code. All formulas are labeled with their source.
import type { AppState } from "./types";
import { daysBetween } from "./store";

function metric(P: AppState, name: string): number | null {
  const rows = P.events.filter((e) => e.type === "fin.metric" && e.data.metric === name);
  if (!rows.length) return null;
  return rows[rows.length - 1].data.value as number;
}

export type ScenarioAxis = "BASE" | "ADVERSE" | "FAVORABLE";
export type Scenario = { name: string; probability: number; axes: Record<string, ScenarioAxis> };

// A deliberately small, local stand-in for the pasted brief's `LEADOS.scenarios`
// module (Part 1–3 content, not included in this session's pasted text — so it
// is not reimplemented in full here; this is a disclosed simplification).
export function buildMinimalScenarioSet(): { scenarios: Scenario[] } {
  return {
    scenarios: [
      { name: "WORST_CASE", probability: 20, axes: { "attrition.next60d": "ADVERSE", "revenue.miss.next_quarter": "ADVERSE" } },
      { name: "BASE_CASE", probability: 55, axes: { "attrition.next60d": "BASE", "revenue.miss.next_quarter": "BASE" } },
      { name: "BEST_CASE", probability: 25, axes: { "attrition.next60d": "FAVORABLE", "revenue.miss.next_quarter": "FAVORABLE" } },
    ],
  };
}

export const financialOS = {
  runwayStatus(P: AppState) {
    const cash = metric(P, "cash");
    const burn = metric(P, "monthly_burn");
    if (cash == null || burn == null || burn <= 0) return null;
    const runway_months = Math.round((cash / burn) * 10) / 10;
    return { cash, burn, runway_months };
  },

  computeCompleteUnitEconomics(P: AppState, today: Date) {
    const arr = metric(P, "arr") ?? ((metric(P, "mrr") ?? 0) * 12 || null);
    const mrr = metric(P, "mrr");
    const customers = metric(P, "customer_count");
    const cac = metric(P, "cac");
    const ltv = metric(P, "ltv");
    const grossMargin = metric(P, "gross_margin_pct");
    const growthRate = metric(P, "revenue_growth_pct");
    const ebitdaMargin = metric(P, "ebitda_margin_pct");

    const newCustomers30d = P.events.filter(
      (e) => e.type === "sales.deal.closed" && e.data.result === "won" && daysBetween(e.ts, today) <= 30
    ).length;

    const arpu = customers && mrr ? mrr / customers : null;
    const ltvCac = ltv && cac ? ltv / cac : null;
    const paybackPeriodMonths = arpu && cac && grossMargin ? cac / (arpu * (grossMargin / 100)) : null;
    const ruleOf40 = growthRate != null && ebitdaMargin != null ? growthRate + ebitdaMargin : null;

    const newMRR30d = P.events
      .filter((e) => e.type === "sales.deal.closed" && e.data.result === "won" && daysBetween(e.ts, today) <= 30)
      .reduce((a, e) => a + (e.data.value || 0) / 12, 0);
    const churnedMRR30d = P.events
      .filter((e) => e.type === "cs.churn.logged" && daysBetween(e.ts, today) <= 30)
      .reduce((a, e) => a + (e.data.mrr_lost || 0), 0);
    const quickRatio = churnedMRR30d > 0 ? Math.round((newMRR30d / churnedMRR30d) * 10) / 10 : null;
    const churnRate = mrr ? churnedMRR30d / mrr : 0.02;

    return {
      arr, mrr, customers, arpu, cac, ltv, ltvCac, paybackPeriodMonths, ruleOf40,
      churnRate, grossMargin, quickRatio, newCustomers30d,
      benchmarks: {
        ltvCac: ltvCac != null ? {
          value: Math.round(ltvCac * 10) / 10,
          benchmark: "> 3.0 (Bessemer Venture Partners, 2023)",
          status: ltvCac >= 3 ? "PASSING" : ltvCac >= 2 ? "WATCH" : "CRITICAL",
        } : null,
        paybackMonths: paybackPeriodMonths != null ? {
          value: Math.round(paybackPeriodMonths),
          benchmark: "< 18 months (SaaS Capital, 2023)",
          status: paybackPeriodMonths <= 18 ? "PASSING" : "CRITICAL",
        } : null,
        ruleOf40: ruleOf40 != null ? {
          value: Math.round(ruleOf40),
          benchmark: "≥ 40 (McKinsey, 2022)",
          status: ruleOf40 >= 40 ? "PASSING" : ruleOf40 >= 20 ? "WATCH" : "CRITICAL",
        } : null,
        quickRatio: quickRatio != null ? {
          value: quickRatio,
          benchmark: "> 4.0 (Mamoon Hamid / Scale Venture Partners)",
          status: quickRatio >= 4 ? "PASSING" : quickRatio >= 2 ? "WATCH" : "CRITICAL",
        } : null,
      },
      label:
        "Unit economics from fin.metric + sales.deal.closed + cs.churn.logged events. " +
        "Formulas: LTV:CAC=LTV/CAC, Payback=CAC/(ARPU×GM%), Rule of 40=Growth%+EBITDA margin%, " +
        "Quick Ratio=new MRR/churned MRR (trailing 30d). Benchmarks: Bessemer (2023), SaaS Capital (2023), " +
        "McKinsey (2022) — vary by stage/sector. Labeled, not validated against this (synthetic) company.",
    };
  },

  optimizeCapitalAllocation(P: AppState, today: Date) {
    const unitEcon = this.computeCompleteUnitEconomics(P, today);
    const runway = this.runwayStatus(P);
    const ltvCacVal = unitEcon.ltvCac ?? 0;

    const categories = [
      { name: "PEOPLE", allocMin: 0.4, allocMax: 0.7, expectedROI: ltvCacVal >= 3 ? 2.5 : 1.5 },
      { name: "PRODUCT", allocMin: 0.15, allocMax: 0.35, expectedROI: 2.0 },
      { name: "GTM", allocMin: 0.1, allocMax: 0.3, expectedROI: ltvCacVal >= 3 ? 3.0 : 0.8 },
      { name: "OPERATIONS", allocMin: 0.05, allocMax: 0.15, expectedROI: 1.2 },
      {
        name: "RESERVE",
        allocMin: (runway?.runway_months ?? 24) < 12 ? 0.15 : 0.05,
        allocMax: (runway?.runway_months ?? 24) < 6 ? 0.3 : 0.1,
        expectedROI: 0.5,
      },
    ];
    const totalEV = categories.reduce((a, c) => a + c.expectedROI, 0);
    const raw = categories.map((c) => {
      const evWeight = c.expectedROI / totalEV;
      const allocation = Math.min(c.allocMax, Math.max(c.allocMin, evWeight));
      return { ...c, allocation };
    });
    const sumRaw = raw.reduce((a, c) => a + c.allocation, 0);
    let allocations = raw.map((c) => ({ ...c, allocation: Math.round((c.allocation / sumRaw) * 100) }));
    // Round-off repair: push any rounding remainder onto the largest bucket so the
    // total is exactly 100 (self-tested — see selfTest.ts).
    const diff = 100 - allocations.reduce((a, c) => a + c.allocation, 0);
    if (diff !== 0) {
      const idx = allocations.reduce((best, c, i) => (c.allocation > allocations[best].allocation ? i : best), 0);
      allocations[idx] = { ...allocations[idx], allocation: allocations[idx].allocation + diff };
    }

    return {
      allocations,
      scenarioAdjustment:
        ltvCacVal < 2
          ? "LTV:CAC below 2.0 — GTM allocation capped at lower band; see R211."
          : null,
      label:
        "Capital allocation from a simplified Markowitz-style mean-variance heuristic " +
        "(Markowitz, 1952). Labeled: this is a heuristic illustration, not a financial plan. " +
        "Consult a CFO/financial advisor for real allocation decisions.",
    };
  },

  buildScenarioProjection(P: AppState, today: Date, horizonMonths = 12) {
    const unitEcon = this.computeCompleteUnitEconomics(P, today);
    const { scenarios } = buildMinimalScenarioSet();
    const mrr = unitEcon.mrr || 0;
    const churnRate = unitEcon.churnRate || 0.02;
    const newMRR30d = P.events
      .filter((e) => e.type === "sales.deal.closed" && e.data.result === "won" && daysBetween(e.ts, today) <= 30)
      .reduce((a, e) => a + (e.data.value || 0) / 12, 0);

    const projections = scenarios.map((scenario) => {
      const probability = scenario.probability / 100;
      const churnAdj = scenario.axes["attrition.next60d"] === "ADVERSE" ? churnRate * 1.3 : churnRate;
      const newMRRadj = scenario.axes["revenue.miss.next_quarter"] === "ADVERSE" ? newMRR30d * 0.7 : newMRR30d;

      let projectedMRR = mrr;
      const trajectory: { month: number; mrr: number }[] = [];
      for (let m = 1; m <= horizonMonths; m++) {
        projectedMRR = projectedMRR * (1 - churnAdj) + newMRRadj;
        trajectory.push({ month: m, mrr: Math.round(projectedMRR) });
      }
      return { scenario: scenario.name, probability, finalMRR: Math.round(projectedMRR), trajectory, impliedARR: Math.round(projectedMRR * 12) };
    });

    const evMRR = projections.reduce((a, p) => a + p.finalMRR * p.probability, 0);
    return {
      projections,
      expectedValue: { mrr: Math.round(evMRR), arr: Math.round(evMRR * 12) },
      horizonMonths,
      label:
        `Scenario-weighted ${horizonMonths}-month MRR projection. Starting MRR €${mrr.toLocaleString()}. ` +
        `Expected value MRR €${Math.round(evMRR).toLocaleString()}. Labeled: constant-churn compounding model — ` +
        `no seasonality, no expansion MRR, no market dynamics.`,
    };
  },
};
