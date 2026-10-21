// G. Strategic early-warning system: indicator library with thresholds,
// trend-break detection, and the weekly "state of the business" synthesis.
// Every claim in the synthesis links back to an indicator, assumption, or event.
import { db } from "@/db";
import { indicators, indicatorReadings } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { num, round2 } from "@/lib/format";
import { explain, type Explain } from "@/lib/explain";
import { runwayDistribution, runwayTornado } from "@/lib/financialOS";
import { getCascade } from "@/lib/okr";
import { allProjectStatuses } from "@/lib/executionEngine";
import { listDecisions, expectedValueDistribution, getDecisionDetail } from "@/lib/decisionEngine";
import { polishSummary, type NarrativeFact } from "@/lib/narrative";

export type IndicatorEvaluation = {
  id: number;
  name: string;
  domain: string;
  metric: string;
  currentValue: number;
  threshold: number;
  direction: string;
  status: "ok" | "watch" | "breach";
  trendBreak: boolean;
  trendNote: string;
};

/**
 * Part 04 stand-in "drift" detection: compares the mean of the most recent
 * window of readings to the prior window. A shift bigger than 1.5x the prior
 * window's spread (std dev) is flagged as a trend break — simple, auditable,
 * not a black box.
 */
function detectTrendBreak(values: number[], windowSize = 4): { broke: boolean; note: string } {
  if (values.length < windowSize * 2) return { broke: false, note: "insufficient history for trend-break detection" };
  const recent = values.slice(-windowSize);
  const prior = values.slice(-windowSize * 2, -windowSize);
  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const std = (arr: number[]) => {
    const m = mean(arr);
    return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length) || 0.0001;
  };
  const priorMean = mean(prior);
  const priorStd = std(prior);
  const recentMean = mean(recent);
  const shift = Math.abs(recentMean - priorMean) / priorStd;
  return {
    broke: shift > 1.5,
    note: `recent ${windowSize}-period mean ${round2(recentMean)} vs prior ${round2(priorMean)} (${round2(shift)}σ shift)`,
  };
}

export async function evaluateIndicators(): Promise<IndicatorEvaluation[]> {
  const rows = await db.select().from(indicators);
  const out: IndicatorEvaluation[] = [];
  for (const ind of rows) {
    const readings = await db.select().from(indicatorReadings).where(eq(indicatorReadings.indicatorId, ind.id)).orderBy(desc(indicatorReadings.date));
    const chronological = [...readings].reverse().map((r) => num(r.value));
    const latest = chronological.at(-1) ?? num(ind.currentValue);
    const threshold = num(ind.threshold);
    const breach = ind.direction === "above_is_bad" ? latest >= threshold : latest <= threshold;
    const watchBand = ind.direction === "above_is_bad" ? latest >= threshold * 0.85 : latest <= threshold * 1.15;
    const status: IndicatorEvaluation["status"] = breach ? "breach" : watchBand ? "watch" : "ok";
    const trend = detectTrendBreak(chronological);

    await db.update(indicators).set({ currentValue: String(latest), status, lastEvaluatedAt: new Date() }).where(eq(indicators.id, ind.id));

    out.push({
      id: ind.id,
      name: ind.name,
      domain: ind.domain,
      metric: ind.metric,
      currentValue: latest,
      threshold,
      direction: ind.direction,
      status,
      trendBreak: trend.broke,
      trendNote: trend.note,
    });
  }
  return out;
}

/** F/D: decisions a leader actually needs to act on this week, with EV summaries. */
export async function decisionsNeededThisWeek() {
  const all = await listDecisions();
  const open = all.filter((d) => d.status === "open" || d.status === "retrospective_due");
  const withEv = await Promise.all(
    open.map(async (d) => {
      const detail = await getDecisionDetail(d.id);
      const options = detail?.options ?? [];
      const evByOption = options.map((o) => {
        const outcomes = detail!.outcomesByOption.get(o.id) ?? [];
        const ev = outcomes.length
          ? expectedValueDistribution(outcomes.map((x) => ({ scenarioLabel: x.scenarioLabel, probability: num(x.probability), payoffLow: num(x.payoffLow), payoffBase: num(x.payoffBase), payoffHigh: num(x.payoffHigh) })))
          : null;
        return { optionId: o.id, label: o.label, ev };
      });
      return { decision: d, evByOption };
    }),
  );
  return withEv;
}

/** The weekly synthesis: what changed, what it means, what to do — each claim evidence-linked. */
export async function stateOfTheBusiness(): Promise<Explain<{ narrative: string; facts: NarrativeFact[]; actions: string[] }>> {
  const [runway, tornado, cascade, projectStatuses, decisionsNeeded, indicatorEvals] = await Promise.all([
    runwayDistribution(800, 36, 23),
    runwayTornado(),
    getCascade(),
    allProjectStatuses(),
    decisionsNeededThisWeek(),
    evaluateIndicators(),
  ]);

  const facts: NarrativeFact[] = [];
  facts.push({
    label: "Cash runway (p50)",
    value: `${round2(runway.value.p50)} months (p10 ${round2(runway.value.p10)} / p90 ${round2(runway.value.p90)})`,
    tone: runway.value.p50 >= 12 ? "good" : runway.value.p50 >= 6 ? "neutral" : "bad",
  });
  const dominant = tornado.value[0];
  if (dominant) {
    facts.push({ label: "Runway's dominant assumption", value: `${dominant.label} (owner: ${dominant.owner}, swing ${dominant.swingMonths}mo)`, tone: "neutral" });
  }
  facts.push({ label: "OKR cascade health score", value: `${cascade.value.healthScore}/100`, tone: cascade.value.healthScore >= 70 ? "good" : cascade.value.healthScore >= 40 ? "neutral" : "bad" });
  if (cascade.value.statusDisagreements.length > 0) {
    facts.push({ label: "Self-reported vs derived OKR status disagreements", value: `${cascade.value.statusDisagreements.length} key result(s)`, tone: "bad" });
  }
  const atRisk = projectStatuses.filter((p) => p.derivedStatus === "at_risk" || p.derivedStatus === "blocked");
  if (atRisk.length > 0) {
    facts.push({ label: "Projects at risk or blocked", value: atRisk.map((p) => p.project.title).join(", "), tone: "bad" });
  }
  const breaches = indicatorEvals.filter((i) => i.status === "breach");
  if (breaches.length > 0) {
    facts.push({ label: "Early-warning indicators in breach", value: breaches.map((b) => b.name).join(", "), tone: "bad" });
  }
  const trendBreaks = indicatorEvals.filter((i) => i.trendBreak);
  if (trendBreaks.length > 0) {
    facts.push({ label: "Indicators showing a statistical trend break", value: trendBreaks.map((b) => `${b.name} (${b.trendNote})`).join("; "), tone: "neutral" });
  }
  if (decisionsNeeded.length > 0) {
    facts.push({ label: "Decisions awaiting action", value: `${decisionsNeeded.length} open decision(s)`, tone: "neutral" });
  }

  const actions: string[] = [];
  if (runway.value.p50 < 12) actions.push(`Runway p50 is ${round2(runway.value.p50)} months — initiate fundraising planning now; dominant lever is ${dominant?.label ?? "n/a"} (owner: ${dominant?.owner ?? "n/a"}).`);
  for (const d of cascade.value.statusDisagreements) actions.push(`Reconcile KR "${d.title}": self-reported ${d.selfReported} vs. execution-derived ${d.derived}.`);
  for (const p of atRisk) actions.push(`Unblock project "${p.project.title}" (${p.openBlockerCount} open blocker(s), schedule gap ${round2(p.scheduleGapDays)}d).`);
  for (const b of breaches) actions.push(`Investigate indicator breach: ${b.name} = ${b.currentValue}${b.direction === "above_is_bad" ? " ≥ " : " ≤ "}${b.threshold}.`);
  for (const d of decisionsNeeded) actions.push(`Decide: "${d.decision.title}" (review date ${d.decision.reviewDate ?? "unset"}).`);

  const narrative = polishSummary(facts);

  return explain(
    { narrative, facts, actions },
    {
      confidence: 0.8,
      method: "deterministic synthesis over runway MC, OKR cascade, execution status, indicator evaluation, and open decisions — templated narrative (no generative step) to keep it reproducible",
      assumptionsUsed: runway.assumptionsUsed,
      evidence: [
        { table: "okr_key_results", id: "cascade" },
        { table: "exec_projects", id: "all" },
        { table: "indicators", id: "all" },
        { table: "decisions", id: "open" },
      ],
      caveats: [],
    },
  );
}

/** Misalignment / cascade health feed for the cockpit widget. */
export async function cockpitFeed() {
  const [cascade, runway, indicatorEvals] = await Promise.all([getCascade(), runwayDistribution(500, 36, 29), evaluateIndicators()]);
  return { cascadeHealth: cascade.value.healthScore, runwayP50: round2(runway.value.p50), indicatorBreaches: indicatorEvals.filter((i) => i.status === "breach").length };
}
