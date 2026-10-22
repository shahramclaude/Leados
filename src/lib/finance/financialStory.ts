// Part 08 — template-based board-pack narrative generator with the
// number-citation contract: every sentence carries `refs: number[]`
// resolved against a FactLedger built fresh during generation. The board
// pack (and its ledger) are persisted together so `npm run
// finance:citation-check` can re-validate a stored pack without needing to
// recompute the model. This also gates Part 11's planned LLM narration:
// any future LLM-authored sentence must be run through `checkCitations`
// before being shown.

import { EvaluatedModel } from "./dag";
import { FactLedger, Sentence, formatFactValue } from "./citations";
import { kpiSnapshotAt } from "./kpis";
import { unitEconomicsAt } from "./unitEconomics";
import { varianceAtMonth } from "./financeEngine";
import type { ForecastBandsResult } from "./financeEngine";
import { rankInitiatives } from "./capitalAllocation";
import { CONFIDENCE_LABEL } from "./types";

function fmt(value: number, unit?: string): string {
  return formatFactValue(value, unit);
}

function s(text: string, refs: number[], section: string): Sentence {
  return { text, refs, section };
}

export interface BoardPackSection {
  title: string;
  sentences: Sentence[];
}

export interface BoardPack {
  month: string;
  version: number;
  generatedAt: string;
  modelHash: string;
  sections: BoardPackSection[];
  facts: ReturnType<FactLedger["toJSON"]>;
}

export function allSentences(pack: BoardPack): Sentence[] {
  return pack.sections.flatMap((sec) => sec.sentences);
}

export function generateBoardPack(
  model: EvaluatedModel,
  i: number,
  version: number,
  forecast?: ForecastBandsResult,
): BoardPack {
  const ledger = new FactLedger();
  const sections: BoardPackSection[] = [];
  const month = model.months[i];

  // --- Results vs Plan ---------------------------------------------------
  const variance = varianceAtMonth(model, i);
  const revenueNode = model.nodes["totalRevenue"];
  const revenueActual = revenueNode.values[i];
  const revenueConf = revenueNode.confidence[i];
  const revActualRef = ledger.cite("Total revenue (actual)", revenueActual, { unit: "usd", month, confidence: revenueConf });
  const revPlanRef = ledger.cite("Total revenue (plan)", variance.revenue.planRevenue, { unit: "usd", month, confidence: "evidence" });
  const deltaRef = ledger.cite("Revenue variance (actual - plan)", variance.revenue.total, { unit: "usd", month, confidence: revenueConf });
  const priceRef = ledger.cite("Price effect", variance.revenue.priceEffect, { unit: "usd", month, confidence: revenueConf });
  const volumeRef = ledger.cite("Volume effect", variance.revenue.volumeEffect, { unit: "usd", month, confidence: revenueConf });
  const mixRef = ledger.cite("Mix effect", variance.revenue.mixEffect, { unit: "usd", month, confidence: revenueConf });

  const resultsSentences: Sentence[] = [];
  resultsSentences.push(
    s(
      `${month} revenue closed at ${fmt(revenueActual, "usd")}, versus a plan of ${fmt(variance.revenue.planRevenue, "usd")}.`,
      [revActualRef, revPlanRef],
      "Results vs Plan",
    ),
  );
  resultsSentences.push(
    s(
      `That is a variance of ${fmt(variance.revenue.total, "usd")}, decomposed into a price effect of ${fmt(variance.revenue.priceEffect, "usd")}, a volume effect of ${fmt(variance.revenue.volumeEffect, "usd")}, and a mix effect of ${fmt(variance.revenue.mixEffect, "usd")}.`,
      [deltaRef, priceRef, volumeRef, mixRef],
      "Results vs Plan",
    ),
  );
  if (variance.revenue.flaggedUnexplained) {
    const residualRef = ledger.cite("Revenue unexplained residual", variance.revenue.residual, { unit: "usd", month, confidence: "evidence" });
    resultsSentences.push(
      s(
        `${fmt(variance.revenue.residual, "usd")} of this variance is unexplained by price, volume, or mix and exceeds the 20% materiality threshold — it is flagged for follow-up rather than rounded into another line.`,
        [residualRef],
        "Results vs Plan",
      ),
    );
  }

  for (const opex of variance.opexByCategory) {
    if (Math.abs(opex.total) < 500) continue;
    const totalRef = ledger.cite(`${opex.name} variance`, opex.total, { unit: "usd", month, confidence: "evidence" });
    const hcRef = ledger.cite(`${opex.name} headcount effect`, opex.headcountEffect, { unit: "usd", month, confidence: "evidence" });
    const rateRef = ledger.cite(`${opex.name} rate effect`, opex.rateEffect, { unit: "usd", month, confidence: "evidence" });
    let text = `${opex.name} came in ${fmt(opex.total, "usd")} vs plan, split into a headcount effect of ${fmt(opex.headcountEffect, "usd")} and a rate effect of ${fmt(opex.rateEffect, "usd")}.`;
    const refs = [totalRef, hcRef, rateRef];
    if (opex.flaggedUnexplained) {
      const resRef = ledger.cite(`${opex.name} unexplained residual`, opex.residual, { unit: "usd", month, confidence: "evidence" });
      text += ` ${fmt(opex.residual, "usd")} of that is unexplained and flagged for follow-up.`;
      refs.push(resRef);
    }
    resultsSentences.push(s(text, refs, "Results vs Plan"));
  }
  sections.push({ title: "Results vs Plan", sentences: resultsSentences });

  // --- Profitability & Unit Economics ------------------------------------
  const kpi = kpiSnapshotAt(model, ledger, i);
  const ue = unitEconomicsAt(model, ledger, i);
  const profSentences = [
    s(
      `Gross margin was ${fmt(kpi.grossMargin.value, "pct")} and EBITDA margin was ${fmt(kpi.ebitdaMargin.value, "pct")}.`,
      [...kpi.grossMargin.refs, ...kpi.ebitdaMargin.refs],
      "Profitability & Unit Economics",
    ),
    s(
      `ARR stands at ${fmt(kpi.arr.value, "usd")}, with net new ARR of ${fmt(kpi.netNewArr.value, "usd")} this month.`,
      [...kpi.arr.refs, ...kpi.netNewArr.refs],
      "Profitability & Unit Economics",
    ),
    s(
      `LTV:CAC is ${fmt(ue.ltvCacRatio.value, "ratio")} and CAC payback is ${fmt(ue.paybackMonths.value, "months")}.`,
      [...ue.ltvCacRatio.refs, ...ue.paybackMonths.refs],
      "Profitability & Unit Economics",
    ),
    s(`The SaaS Magic Number is ${fmt(ue.magicNumber.value, "ratio")}.`, [...ue.magicNumber.refs], "Profitability & Unit Economics"),
    s(
      `DuPont ROE (trailing twelve months) is ${fmt(kpi.roeTtm.value, "pct")}, built from net margin ${fmt(kpi.netMarginTtm.value, "pct")} x asset turnover ${fmt(kpi.assetTurnoverTtm.value, "ratio")} x leverage ${fmt(kpi.leverageRatio.value, "ratio")}.`,
      [...kpi.roeTtm.refs, ...kpi.netMarginTtm.refs, ...kpi.assetTurnoverTtm.refs, ...kpi.leverageRatio.refs],
      "Profitability & Unit Economics",
    ),
  ];
  sections.push({ title: "Profitability & Unit Economics", sentences: profSentences });

  // --- Cash & Runway -------------------------------------------------------
  const cashNode = model.nodes["cashBalance"];
  const cashVal = cashNode.values[i];
  const cashRef = ledger.cite("Cash balance", cashVal, { unit: "usd", month, confidence: cashNode.confidence[i] });
  const cashSentences = [
    s(
      `Cash on hand ended ${month} at ${fmt(cashVal, "usd")}, implying ${fmt(kpi.runwayMonths.value, "months")} of runway at the current smoothed burn rate.`,
      [cashRef, ...kpi.runwayMonths.refs],
      "Cash & Runway",
    ),
    s(`Capital efficiency (burn multiple) was ${fmt(kpi.burnMultiple.value, "ratio")}.`, [...kpi.burnMultiple.refs], "Cash & Runway"),
  ];
  const financingNode = model.nodes["financingEvents"];
  if (financingNode.confidence[i] === "asserted" && financingNode.values[i] !== 0) {
    const financeRef = ledger.cite("Assumed financing event", financingNode.values[i], { unit: "usd", month, confidence: "asserted" });
    cashSentences.push(
      s(
        `${month}'s cash position assumes an ASSERTED financing event of ${fmt(financingNode.values[i], "usd")} that has not yet closed — treat downstream cash and runway figures for this month as provisional until a term sheet is signed.`,
        [financeRef],
        "Cash & Runway",
      ),
    );
  }
  sections.push({ title: "Cash & Runway", sentences: cashSentences });

  // --- Forecast (Monte Carlo bands) ---------------------------------------
  if (forecast && forecast.months.length > 0) {
    const forecastSentences: Sentence[] = [];
    const nextMonth = forecast.months[0];
    const cashBand = forecast.bands["cashBalance"]?.[0];
    if (cashBand) {
      const p10Ref = ledger.cite(`Cash P10 (${nextMonth})`, cashBand.p10, { unit: "usd", month: nextMonth, confidence: "forecast" });
      const p50Ref = ledger.cite(`Cash P50 (${nextMonth})`, cashBand.p50, { unit: "usd", month: nextMonth, confidence: "forecast" });
      const p90Ref = ledger.cite(`Cash P90 (${nextMonth})`, cashBand.p90, { unit: "usd", month: nextMonth, confidence: "forecast" });
      forecastSentences.push(
        s(
          `For ${nextMonth}, the rolling Monte Carlo forecast projects cash between ${fmt(cashBand.p10, "usd")} (P10) and ${fmt(cashBand.p90, "usd")} (P90), with a median of ${fmt(cashBand.p50, "usd")}.`,
          [p10Ref, p50Ref, p90Ref],
          "Forecast",
        ),
      );
    }
    const revBand = forecast.bands["totalRevenue"]?.[0];
    if (revBand) {
      const p10Ref = ledger.cite(`Revenue P10 (${nextMonth})`, revBand.p10, { unit: "usd", month: nextMonth, confidence: "forecast" });
      const p90Ref = ledger.cite(`Revenue P90 (${nextMonth})`, revBand.p90, { unit: "usd", month: nextMonth, confidence: "forecast" });
      forecastSentences.push(
        s(
          `Revenue for ${nextMonth} is forecast between ${fmt(revBand.p10, "usd")} and ${fmt(revBand.p90, "usd")} (80% interval).`,
          [p10Ref, p90Ref],
          "Forecast",
        ),
      );
    }
    if (forecastSentences.length > 0) sections.push({ title: "Forecast", sentences: forecastSentences });
  }

  // --- Top Risks & Opportunities ------------------------------------------
  const ranked = rankInitiatives();
  const topRisk = ranked.find((r) => r.evidenceQuality === "asserted") ?? ranked[0];
  const npvRef = ledger.cite(`${topRisk.label} projected NPV`, topRisk.npv, { unit: "usd", confidence: topRisk.evidenceQuality });
  const riskSentences = [
    s(
      `The highest-leverage lever under consideration is "${topRisk.label}" with a projected NPV of ${fmt(topRisk.npv, "usd")}, but its benefit estimate is ${CONFIDENCE_LABEL[topRisk.evidenceQuality].toLowerCase()} — treat it as directional, not committed, until evidence replaces the assumption.`,
      [npvRef],
      "Top Risks & Opportunities",
    ),
  ];
  sections.push({ title: "Top Risks & Opportunities", sentences: riskSentences });

  return {
    month,
    version,
    generatedAt: new Date().toISOString(),
    modelHash: model.hash,
    sections,
    facts: ledger.toJSON(),
  };
}
