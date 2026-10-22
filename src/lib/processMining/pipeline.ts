// Part 28 — pipeline orchestrator: wires reconstruction -> discovery ->
// conformance -> bottlenecks -> queueing -> bus-factor -> automation scoring
// -> operational metrics into one bundle for the API/UI layer.
import type {
  AutomationScore,
  BottleneckEntry,
  BusFactorEntry,
  CaseInstance,
  ConformanceReport,
  ControlChart,
  DiscoveredModel,
  OperationalMetrics,
  ProcessDefinition,
  QueueingStats,
  RawEvent,
  ReconstructionReport,
} from "./types";
import { reconstructCases } from "./caseReconstruction";
import { discoverProcessModel } from "./discovery";
import { checkConformanceAgainstDeclared, checkConformanceAgainstMined } from "./conformance";
import { analyzeBottlenecks } from "./bottleneck";
import { computeQueueingStats } from "./queueing";
import { computeBusFactor } from "./busFactor";
import { scoreAutomationOpportunity, type ActivityAutomationInput, type AutomationCostModel } from "./automationScoring";
import { computeOperationalMetrics, cycleTimeControlChart } from "./metrics";

export interface PipelineResult {
  processName: string;
  generatedAt: Date;
  reconstructionReport: ReconstructionReport;
  cases: CaseInstance[];
  model: DiscoveredModel;
  conformanceMined: ConformanceReport;
  conformanceDeclared: ConformanceReport | null;
  bottlenecks: BottleneckEntry[];
  queueing: QueueingStats[];
  busFactor: BusFactorEntry[];
  automation: AutomationScore[];
  metrics: OperationalMetrics;
  cycleTimeControlChart: ControlChart;
}

export interface PipelineOptions {
  startActivities?: Set<string>;
  endActivities?: Set<string>;
  declaredDefinition?: ProcessDefinition;
  automationCostModel?: AutomationCostModel;
}

export function runProcessMiningPipeline(events: RawEvent[], options: PipelineOptions = {}): PipelineResult {
  const processName = events[0]?.processName ?? "unknown";
  const { cases, report } = reconstructCases(events, {
    startActivities: options.startActivities,
    endActivities: options.endActivities,
  });

  const model = discoverProcessModel(cases);
  const conformanceMined = checkConformanceAgainstMined(cases, model);
  const conformanceDeclared = options.declaredDefinition
    ? checkConformanceAgainstDeclared(cases, options.declaredDefinition)
    : null;

  const bottlenecks = analyzeBottlenecks(cases);
  const queueing = computeQueueingStats(cases);
  const busFactor = computeBusFactor(cases);
  const automation = buildAutomationScores(processName, cases, options.automationCostModel);
  const metrics = computeOperationalMetrics(cases, conformanceDeclared ?? conformanceMined);
  const chart = cycleTimeControlChart(cases);

  return {
    processName,
    generatedAt: new Date(),
    reconstructionReport: report,
    cases,
    model,
    conformanceMined,
    conformanceDeclared,
    bottlenecks,
    queueing,
    busFactor,
    automation,
    metrics,
    cycleTimeControlChart: chart,
  };
}

function buildAutomationScores(
  processName: string,
  cases: CaseInstance[],
  costModel?: AutomationCostModel,
): AutomationScore[] {
  const byActivity = new Map<
    string,
    { occurrences: number; totalDurationMs: number; errorFlags: number[]; ruleBased: number[]; eventIds: string[] }
  >();

  let windowStart = Infinity;
  let windowEnd = -Infinity;

  for (const c of cases) {
    windowStart = Math.min(windowStart, c.startedAt.getTime());
    windowEnd = Math.max(windowEnd, c.endedAt.getTime());
    for (const event of c.events) {
      const acc = byActivity.get(event.activity) ?? {
        occurrences: 0,
        totalDurationMs: 0,
        errorFlags: [] as number[],
        ruleBased: [] as number[],
        eventIds: [] as string[],
      };
      acc.occurrences += 1;
      acc.totalDurationMs += event.durationMs;
      if (typeof event.attributes.errorFlag === "boolean") acc.errorFlags.push(event.attributes.errorFlag ? 1 : 0);
      if (typeof event.attributes.ruleBased === "boolean") acc.ruleBased.push(event.attributes.ruleBased ? 1 : 0);
      acc.eventIds.push(event.eventId);
      byActivity.set(event.activity, acc);
    }
  }

  const periodMs = Number.isFinite(windowStart) && windowEnd > windowStart ? windowEnd - windowStart : 1;

  const scores: AutomationScore[] = [];
  for (const [activity, acc] of byActivity) {
    const input: ActivityAutomationInput = {
      processName,
      activity,
      occurrences: acc.occurrences,
      periodMs,
      avgHandlingTimeMs: acc.totalDurationMs / acc.occurrences,
      observedErrorRate: acc.errorFlags.length ? average(acc.errorFlags) : null,
      observedRuleBasedFraction: acc.ruleBased.length ? average(acc.ruleBased) : null,
      sampleEventIds: acc.eventIds,
    };
    scores.push(scoreAutomationOpportunity(input, costModel));
  }

  return scores.sort((a, b) => b.score.value - a.score.value);
}

function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}
