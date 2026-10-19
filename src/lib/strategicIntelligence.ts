import type {
  ActivatedScenario,
  BoardPack,
  OKRHealth,
  OKRHealthReport,
  OKRKeyResult,
  OKRObjective,
  WargameResult,
} from "@/lib/types";
import type { BrainProjection, GoalState } from "@/lib/eventBrain";
import { METRIC_DEFINITIONS, deviationSigma, monteCarloMetric, DEVIATION_THRESHOLD_SIGMA } from "@/lib/scenarioEngine";
import { runWargame, toCompetitorProfile } from "@/lib/wargameEngine";

// DESIGN PARAMETER: OKR health thresholds — on_track >= 0.7, at_risk in
// [0.4, 0.7), off_track < 0.4 (score = progress / timeElapsed).
export const OKR_ON_TRACK = 0.7;
export const OKR_AT_RISK = 0.4;

export function okrHealthFromScore(score: number): OKRHealth {
  if (score >= OKR_ON_TRACK) return "on_track";
  if (score >= OKR_AT_RISK) return "at_risk";
  return "off_track";
}

function krProgressPct(current: number, target: number): number {
  if (target === 0) return 0;
  return Math.max(0, Math.min(1, current / target));
}

function velocityPerWeek(history: { ts: string; value: number }[], target: number): number {
  if (history.length < 2 || target === 0) return 0;
  const first = history[0];
  const last = history[history.length - 1];
  const days = Math.max(1, (new Date(last.ts).getTime() - new Date(first.ts).getTime()) / 86400000);
  const weeks = days / 7;
  return weeks > 0 ? (last.value - first.value) / target / weeks : 0;
}

export function computeOKRHealth(goals: GoalState[], now: Date): OKRHealthReport {
  const objectives: OKRObjective[] = goals.map((g) => {
    const keyResults: OKRKeyResult[] = g.keyResults.map((kr) => {
      const progressPct = krProgressPct(kr.current, kr.target);
      const quarterStart = new Date(g.quarterStart).getTime();
      const timeElapsed = Math.max(0, Math.min(1, (now.getTime() - quarterStart) / (g.quarterLengthDays * 86400000)));
      const score = timeElapsed > 0 ? progressPct / timeElapsed : progressPct > 0 ? 1 : 0;
      const health = okrHealthFromScore(score);
      const trendVal = kr.history.length >= 2 ? kr.history[kr.history.length - 1].value - kr.history[kr.history.length - 2].value : 0;
      return {
        id: kr.id,
        title: kr.title,
        target: kr.target,
        current: kr.current,
        unit: kr.unit,
        progressPct,
        health,
        trend: trendVal > 0 ? "up" : trendVal < 0 ? "down" : "flat",
      };
    });
    const progress = keyResults.length ? keyResults.reduce((a, k) => a + k.progressPct, 0) / keyResults.length : 0;
    const quarterStart = new Date(g.quarterStart).getTime();
    const timeElapsed = Math.max(0.0001, Math.min(1, (now.getTime() - quarterStart) / (g.quarterLengthDays * 86400000)));
    const score = progress / timeElapsed;
    const health = okrHealthFromScore(score);
    const velocity = g.keyResults.length
      ? g.keyResults.reduce((a, kr) => a + velocityPerWeek(kr.history, kr.target), 0) / g.keyResults.length
      : 0;
    return {
      id: g.id,
      title: g.title,
      owner: g.owner,
      quarterStart: g.quarterStart,
      quarterLength: g.quarterLengthDays,
      progress,
      keyResults,
      health,
      linkedDecisions: g.linkedDecisions,
      velocity,
    };
  });

  const onTrack = objectives.filter((o) => o.health === "on_track").length;
  const atRisk = objectives.filter((o) => o.health === "at_risk").length;
  const offTrack = objectives.filter((o) => o.health === "off_track").length;
  const overallProgress = objectives.length ? objectives.reduce((a, o) => a + o.progress, 0) / objectives.length : 0;
  const teamHealthScore = objectives.length
    ? Math.round((onTrack * 100 + atRisk * 55 + offTrack * 15) / objectives.length)
    : 0;

  return { objectives, overallProgress, onTrack, atRisk, offTrack, teamHealthScore };
}

function severityFromSigma(sigma: number): ActivatedScenario["urgency"] {
  const abs = Math.abs(sigma);
  if (abs >= 4) return "critical";
  if (abs >= 3) return "high";
  if (abs >= DEVIATION_THRESHOLD_SIGMA) return "medium";
  return "low";
}

export function runScenarioSurveillance(projection: BrainProjection, seedBase = 42): ActivatedScenario[] {
  const activated: ActivatedScenario[] = [];
  METRIC_DEFINITIONS.forEach((def, i) => {
    const series = projection.metrics[def.key];
    if (!series || series.length === 0) return;
    const actual = series[series.length - 1].value;
    const sigma = deviationSigma(actual, def);
    if (Math.abs(sigma) < DEVIATION_THRESHOLD_SIGMA) return;
    const mc = monteCarloMetric(actual, def, seedBase + i * 7919);
    activated.push({
      metricKey: def.key,
      metricLabel: def.label,
      actual,
      baseline: def.baseline,
      sigma,
      urgency: severityFromSigma(sigma),
      monteCarlo: mc,
      narrative: `${def.label} is ${Math.abs(sigma).toFixed(1)}σ ${sigma > 0 ? "above" : "below"} baseline (${def.baseline}${def.unit}), actual ${actual.toFixed(2)}${def.unit}. Monte Carlo (n=${mc.n}) projects p50=${mc.p50.toFixed(2)} within band [${mc.p10.toFixed(2)}, ${mc.p90.toFixed(2)}].`,
    });
  });
  return activated.sort((a, b) => Math.abs(b.sigma) - Math.abs(a.sigma));
}

// DESIGN PARAMETER: competitive-signal lookback window = 14 days.
export function runWargameAutoAnalysis(projection: BrainProjection, now: Date): WargameResult | null {
  const WINDOW_MS = 14 * 86400000;
  const recentSignals = projection.competitors.flatMap((c) =>
    c.signals.filter((s) => now.getTime() - new Date(s.ts).getTime() <= WINDOW_MS)
  );
  if (recentSignals.length === 0) return null;
  const profiles = projection.competitors
    .filter((c) => c.signals.some((s) => now.getTime() - new Date(s.ts).getTime() <= WINDOW_MS))
    .map(toCompetitorProfile);
  if (profiles.length === 0) return null;
  return runWargame(profiles);
}

export function generateBoardPack(
  okr: OKRHealthReport,
  scenarios: ActivatedScenario[],
  wargame: WargameResult | null,
  decisionsOpenCount: number,
  boardNotes: { text: string; author: string }[]
): BoardPack {
  const mostCritical = scenarios[0] ?? null;
  const top3Risks = [
    ...scenarios.slice(0, 2).map((s) => `${s.metricLabel} deviating ${s.sigma.toFixed(1)}σ from baseline (${s.urgency}).`),
    ...okr.objectives
      .filter((o) => o.health === "off_track")
      .slice(0, 1)
      .map((o) => `Objective "${o.title}" is off-track at ${(o.progress * 100).toFixed(0)}% progress.`),
  ].slice(0, 3);
  while (top3Risks.length < 3) top3Risks.push("No further material risks detected in current event log.");

  const top3Decisions = [
    ...okr.objectives
      .filter((o) => o.health !== "on_track")
      .slice(0, 2)
      .map((o) => `Decide on resourcing for "${o.title}" (owner: ${o.owner}, health: ${o.health}).`),
    wargame ? `Approve competitive response: ${wargame.ourBestMove.label}.` : `${decisionsOpenCount} decisions currently open — review backlog.`,
  ].slice(0, 3);
  while (top3Decisions.length < 3) top3Decisions.push("No further decisions require board attention this cycle.");

  const rows = okr.objectives
    .map(
      (o) =>
        `<tr><td>${o.title}</td><td>${o.owner}</td><td>${(o.progress * 100).toFixed(0)}%</td><td>${o.health}</td></tr>`
    )
    .join("");
  const okrSnapshotTable = `<table><thead><tr><th>Objective</th><th>Owner</th><th>Progress</th><th>Health</th></tr></thead><tbody>${rows}</tbody></table>`;

  const executiveSummary = `Portfolio of ${okr.objectives.length} objectives is tracking at ${(okr.overallProgress * 100).toFixed(0)}% average progress with a team health score of ${okr.teamHealthScore}/100. ${scenarios.length} scenario(s) are currently activated by statistically significant metric deviations, led by ${mostCritical ? mostCritical.metricLabel : "none"}. ${wargame ? `Competitive signals in the last 14 days warrant a response: ${wargame.ourBestMove.label}.` : "No material competitive signals were detected in the last 14 days."} ${decisionsOpenCount} decision(s) remain open and should be reviewed before the next cycle.`;

  const confidenceStatement = `This pack is generated deterministically from ${okr.objectives.length} objective(s) and ${scenarios.length} activated scenario(s) in the live event log; Monte Carlo bands use n=1000 simulations per activated metric and are not predictions of certainty.`;

  return {
    executiveSummary,
    top3Risks,
    top3Decisions,
    okrSnapshotTable,
    scenariosActive: { count: scenarios.length, mostCritical },
    wargameInsight: wargame,
    confidenceStatement,
    generatedAt: new Date().toISOString(),
  };
}
