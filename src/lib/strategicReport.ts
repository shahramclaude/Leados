// strategicReport — the board pack generator. Deterministic: the same
// inputs always produce the exact same markdown (no hidden randomness, no
// implicit `new Date()` — every time-sensitive value is passed in), which is
// what makes the output testable and reproducible for the board.
import type { ObjectiveHealth, CascadeMisalignment } from "@/lib/okr";
import type { RunwayMonteCarloResult, FundraisingReadiness, CovenantStatus } from "@/lib/financialOS";
import type { BurnTrend } from "@/lib/financialOS";
import type { ScenarioComparisonRow } from "@/lib/scenarioEngine";
import type { ProjectExecutionReport } from "@/lib/executionEngine";
import type { StateOfBusinessSynthesis } from "@/lib/indicators";
import type { Decision } from "@/lib/decisionTypes";

export interface BoardPackInput {
  periodLabel: string;
  generatedAt: Date;
  objectiveHealths: ObjectiveHealth[];
  misalignments: CascadeMisalignment[];
  financial: {
    currentCash: number;
    runway: RunwayMonteCarloResult;
    fundraising: FundraisingReadiness;
    covenant: CovenantStatus;
    burnTrend: BurnTrend;
  };
  scenarios: ScenarioComparisonRow[];
  executionReports: ProjectExecutionReport[];
  decisions: Decision[];
  stateOfBusiness: StateOfBusinessSynthesis;
  evidenceLinks: { label: string; href: string }[];
}

export interface BoardPack {
  markdown: string;
  topRisks: string[];
  decisionsNeededThisWeek: Decision[];
}

function fmtMoney(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function decisionIsUrgent(d: Decision, now: Date): boolean {
  if (d.status !== "proposed" && d.status !== "deferred") return false;
  if (!d.deadline) return false;
  const daysOut = (new Date(d.deadline).getTime() - now.getTime()) / 86400000;
  return daysOut <= 14;
}

/** Builds the full, publication-quality board pack as structured markdown. */
export function generateBoardPack(input: BoardPackInput): BoardPack {
  const { periodLabel, generatedAt, objectiveHealths, misalignments, financial, scenarios, executionReports, decisions, stateOfBusiness, evidenceLinks } = input;

  const onTrackCount = objectiveHealths.filter((o) => o.status === "on_track" || o.status === "done").length;
  const atRiskCount = objectiveHealths.filter((o) => o.status === "at_risk").length;
  const offTrackCount = objectiveHealths.filter((o) => o.status === "off_track").length;

  const topRisks: string[] = [];
  if (financial.covenant.status !== "healthy") {
    topRisks.push(
      `Cash covenant is ${financial.covenant.status === "breach_risk" ? "in breach" : "at watch level"}: ${fmtMoney(financial.covenant.headroom)} headroom above the ${fmtMoney(financial.covenant.minCashBalance)} minimum.`,
    );
  }
  if (financial.runway.bankruptcyRiskWithin12Months > 0.1) {
    topRisks.push(`Simulation shows a ${fmtPct(financial.runway.bankruptcyRiskWithin12Months)} chance of running out of cash within 12 months under current assumptions.`);
  }
  if (financial.burnTrend.trend === "accelerating") {
    topRisks.push(`Burn is accelerating (+${fmtPct(financial.burnTrend.trendPct)} vs. the prior period).`);
  }
  for (const m of misalignments.filter((x) => x.severity === "high")) topRisks.push(m.message);
  for (const r of executionReports.filter((r) => r.deliveryConfidence.score < 0.45)) {
    topRisks.push(`"${r.project.name}" has low delivery confidence (${fmtPct(r.deliveryConfidence.score)}) — ${r.onTimeProbability < 0.5 ? "on-time delivery is more likely to miss than hit." : "open blockers and schedule pressure are compounding."}`);
  }
  if (stateOfBusiness.headline.includes("critical")) topRisks.push(stateOfBusiness.headline);

  const decisionsNeededThisWeek = decisions.filter((d) => decisionIsUrgent(d, generatedAt));

  const lines: string[] = [];
  lines.push(`# Board Pack — ${periodLabel}`);
  lines.push("");
  lines.push(`*Generated ${generatedAt.toISOString()}. All financial and delivery figures in this pack are simulation-based decision support with explicit assumptions — not guarantees of future results.*`);
  lines.push("");

  lines.push("## 1. Narrative Summary");
  lines.push("");
  lines.push(
    `Of ${objectiveHealths.length} tracked objectives, ${onTrackCount} are on track, ${atRiskCount} are at risk, and ${offTrackCount} are off track. ` +
      `Median simulated runway is ${financial.runway.monthsToBankruptcy.p50} months (p10 ${financial.runway.monthsToBankruptcy.p10} / p90 ${financial.runway.monthsToBankruptcy.p90}), ` +
      `with fundraising readiness scored ${financial.fundraising.score}/100 ("${financial.fundraising.raiseNowOrWait.replace("_", " ")}"). ` +
      `${stateOfBusiness.headline}`,
  );
  lines.push("");

  lines.push("## 2. OKR Status");
  lines.push("");
  lines.push("| Objective | Level | Status | Progress | Confidence |");
  lines.push("|---|---|---|---|---|");
  for (const h of objectiveHealths) {
    lines.push(`| ${h.objective.title} | ${h.objective.level} | ${h.status} | ${fmtPct(h.weightedProgress)} | ${fmtPct(h.weightedConfidence)} |`);
  }
  if (misalignments.length) {
    lines.push("");
    lines.push("**Cascade misalignments detected:**");
    for (const m of misalignments) lines.push(`- (${m.severity}) ${m.message}`);
  }
  lines.push("");

  lines.push("## 3. Financial Position");
  lines.push("");
  lines.push(`- Current cash: ${fmtMoney(financial.currentCash)}`);
  lines.push(`- Runway (Monte Carlo, seed ${financial.runway.assumptions.seed}, n=${financial.runway.assumptions.n}): p10 ${financial.runway.monthsToBankruptcy.p10}mo / p50 ${financial.runway.monthsToBankruptcy.p50}mo / p90 ${financial.runway.monthsToBankruptcy.p90}mo`);
  lines.push(`- Burn trend: ${financial.burnTrend.trend} (${fmtPct(financial.burnTrend.trendPct)} vs. prior period)`);
  lines.push(`- Covenant headroom: ${fmtMoney(financial.covenant.headroom)} (${financial.covenant.status})`);
  lines.push(`- Fundraising readiness: ${financial.fundraising.score}/100 — ${financial.fundraising.raiseNowOrWait.replace("_", " ")}`);
  if (scenarios.length) {
    lines.push("");
    lines.push("**Scenario comparison:**");
    lines.push("| Scenario | p10 | p50 | p90 | 12mo bankruptcy risk |");
    lines.push("|---|---|---|---|---|");
    for (const s of scenarios) lines.push(`| ${s.name} | ${s.p10RunwayMonths}mo | ${s.p50RunwayMonths}mo | ${s.p90RunwayMonths}mo | ${fmtPct(s.bankruptcyRiskWithin12Months)} |`);
  }
  lines.push("");

  lines.push("## 4. Execution Confidence");
  lines.push("");
  lines.push("| Project | Delivery Confidence | On-Time Probability | Open Blockers |");
  lines.push("|---|---|---|---|");
  for (const r of executionReports) {
    lines.push(`| ${r.project.name} | ${fmtPct(r.deliveryConfidence.score)} | ${fmtPct(r.onTimeProbability)} | ${r.openBlockers.length} |`);
  }
  lines.push("");

  lines.push("## 5. Top Risks");
  lines.push("");
  if (topRisks.length === 0) lines.push("No elevated risks detected this period.");
  for (const r of topRisks) lines.push(`- ${r}`);
  lines.push("");

  lines.push("## 6. Decisions Needed This Week");
  lines.push("");
  if (decisionsNeededThisWeek.length === 0) {
    lines.push("No decisions with a deadline inside the next 14 days.");
  } else {
    for (const d of decisionsNeededThisWeek) {
      lines.push(`- **${d.title}** (${d.domain}, impact ${d.impact}/5, ${d.doorType.replace("_", "-")} door) — due ${d.deadline}.`);
    }
  }
  lines.push("");

  lines.push("## 7. What Changed Since Last Week");
  lines.push("");
  if (stateOfBusiness.changedSinceLastWeek.length === 0) {
    lines.push("No material indicator movement since the last reading window.");
  } else {
    stateOfBusiness.changedSinceLastWeek.forEach((c, i) => {
      lines.push(`- ${c} ${stateOfBusiness.implications[i] ?? ""}`);
    });
  }
  lines.push("");

  lines.push("## Appendix: Evidence Links");
  lines.push("");
  if (evidenceLinks.length === 0) {
    lines.push("No evidence links attached.");
  } else {
    for (const link of evidenceLinks) lines.push(`- [${link.label}](${link.href})`);
  }
  lines.push("");

  return { markdown: lines.join("\n"), topRisks, decisionsNeededThisWeek };
}
