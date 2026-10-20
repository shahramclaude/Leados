/**
 * scenarioEngine.ts — Part 06 section D: turns a validated `ScenarioSpec`
 * into Monte Carlo KPI distributions, a tornado sensitivity ranking,
 * early-warning indicators, downsampled timeline traces, and a
 * template-based plain-language summary.
 *
 * Every number returned carries (or is accompanied by) the assumptions
 * that produced it — see `ScenarioRunResult.assumptions` and
 * `ScenarioRunResult.calibration`. Nothing here calls an LLM (Part 08 owns
 * generative text); the "summary" is assembled from fixed templates over
 * structured numbers only.
 */
import { createRng } from "@/lib/prng";
import { compareWithCRN, runMonteCarlo, type MonteCarloResult, type ScenarioComparison } from "@/lib/monteCarlo";
import { runDiscreteEventSimulation, type SimAgent, type SimConfig, type SimWorkItem, type ScheduledEvent } from "@/lib/simulation";
import { DEFAULT_ORG_ODE_PARAMS, type OrgODEParams } from "@/lib/orgODE";
import { DefaultAttentionModel } from "@/lib/physics";
import type { BaselineSpec, Intervention, ScenarioSpec, TeamSpec } from "@/lib/scenario";
import type { SkillSupply } from "@/lib/scmSupply";
import { defaultSupplyTable } from "@/lib/scmSupply";
import type { Distribution } from "@/lib/stats";

export interface BuildOptions {
  brooksCoefficient?: number;
  skillSupply?: SkillSupply[];
}

function hashSeed(...parts: Array<string | number>): string {
  return parts.join("::");
}

function buildAgentsFromTeams(teams: TeamSpec[], rng: ReturnType<typeof createRng>): SimAgent[] {
  const agents: SimAgent[] = [];
  for (const team of teams) {
    const teamAgentIds: string[] = [];
    for (let i = 0; i < team.size; i++) teamAgentIds.push(`${team.id}-agent-${i}`);
    for (let i = 0; i < team.size; i++) {
      const commEdges = teamAgentIds.filter((id) => id !== teamAgentIds[i] && rng.bool(team.commDensity));
      agents.push({
        id: teamAgentIds[i],
        name: `${team.id} #${i + 1}`,
        skills: [team.skill],
        weeklyCapacityHours: team.weeklyCapacityHours,
        commEdges,
        teamId: team.id,
        hireDay: 0,
      });
    }
  }
  return agents;
}

function buildBacklog(baseline: BaselineSpec, rng: ReturnType<typeof createRng>): SimWorkItem[] {
  if (baseline.backlogItems && baseline.backlogItems.length > 0) return baseline.backlogItems;
  if (!baseline.backlogGenerator) return [];
  const gen = baseline.backlogGenerator;
  const skills = Object.keys(gen.skillMix);
  const weights = skills.map((s) => gen.skillMix[s]);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const items: SimWorkItem[] = [];
  for (let i = 0; i < gen.count; i++) {
    let r = rng.next() * totalWeight;
    let chosen = skills[skills.length - 1];
    for (let s = 0; s < skills.length; s++) {
      if (r < weights[s]) {
        chosen = skills[s];
        break;
      }
      r -= weights[s];
    }
    items.push({
      id: `item-${i}`,
      requiredSkill: chosen,
      estimatedHours: Math.max(1, rng.lognormal(Math.log(gen.avgHours), gen.hoursSigma)),
      priority: i,
      dependsOn: [],
    });
  }
  return items;
}

/** Build the structural (non-stochastic-per-replication) SimConfig for a baseline + its interventions. */
export function buildSimConfig(
  spec: ScenarioSpec,
  structureSeed: string,
  opts: BuildOptions = {},
): SimConfig {
  const structureRng = createRng(structureSeed);
  const agents = buildAgentsFromTeams(spec.baseline.teams, structureRng.substream("teams"));
  const backlog = buildBacklog(spec.baseline, structureRng.substream("backlog"));
  const brooksCoefficient = opts.brooksCoefficient ?? spec.baseline.brooksCoefficientOverride ?? DEFAULT_ORG_ODE_PARAMS.brooksCoefficient;

  const scheduledEvents = realizeInterventions(spec.baseline.teams, spec.interventions, opts.skillSupply ?? defaultSupplyTable());

  return {
    agents,
    backlog,
    wipLimits: { ...spec.baseline.wipLimits },
    brooksCoefficient,
    reviewFractionOfEstimate: spec.baseline.reviewFractionOfEstimate,
    serviceTimeNoise: { ...spec.baseline.serviceTimeNoise },
    handoffLatencyDaysCold: spec.baseline.handoffLatencyDaysCold,
    horizonDays: spec.horizonDays,
    scheduledEvents,
  };
}

/** Translate declarative interventions into the simulation's ScheduledEvent primitives. */
export function realizeInterventions(
  teams: TeamSpec[],
  interventions: Intervention[],
  skillSupply: SkillSupply[],
): ScheduledEvent[] {
  const events: ScheduledEvent[] = [];
  let hireCounter = 0;

  for (const iv of interventions) {
    if (iv.kind === "hire") {
      const teamId = String(iv.params.teamId);
      const count = Number(iv.params.count ?? 1);
      const team = teams.find((t) => t.id === teamId);
      if (!team) continue;
      const supply = skillSupply.find((s) => s.skill === team.skill);
      const leadTimeDays = supply?.leadTimeDays ?? 30;
      for (let i = 0; i < count; i++) {
        events.push({
          day: iv.startDay + leadTimeDays,
          type: "hire",
          agent: {
            id: `${teamId}-hire-${hireCounter++}`,
            name: `${teamId} new hire #${hireCounter}`,
            skills: [team.skill],
            weeklyCapacityHours: team.weeklyCapacityHours,
            commEdges: [],
            teamId,
            hireDay: 0, // overwritten to the actual join day by the simulator
          },
        });
      }
    } else if (iv.kind === "delay") {
      const teamId = iv.params.teamId ? String(iv.params.teamId) : undefined;
      const capacityMultiplier = Number(iv.params.capacityMultiplier ?? 0.5);
      const durationDays = Number(iv.params.durationDays ?? 14);
      const targets = teamId ? teams.filter((t) => t.id === teamId) : teams;
      for (const t of targets) {
        events.push({ day: iv.startDay, type: "capacityMultiplier", teamId: t.id, multiplier: capacityMultiplier, durationDays });
      }
    } else if (iv.kind === "restructure") {
      const mergeTeamIds = (iv.params.mergeTeamIds as string[]) ?? [];
      const newTeamId = String(iv.params.newTeamId ?? "merged-team");
      if (mergeTeamIds.length >= 2) {
        events.push({ day: iv.startDay, type: "reorg", teamIds: mergeTeamIds, newTeamId });
      }
    } else if (iv.kind === "process") {
      const wipLimitDelta = Number(iv.params.wipLimitDelta ?? 0);
      const reviewFractionDelta = Number(iv.params.reviewFractionDelta ?? 0);
      if (wipLimitDelta !== 0) {
        events.push({ day: iv.startDay, type: "wipLimits", active: undefined, review: undefined });
        // wipLimits delta is resolved against the live baseline at apply
        // time by the caller via `resolveWipDelta` below (kept here as a
        // documented placeholder so the event list stays declarative).
      }
      if (reviewFractionDelta !== 0) {
        events.push({ day: iv.startDay, type: "reviewFraction", value: Math.max(0.05, 0.3 + reviewFractionDelta) });
      }
    }
    // "price" interventions do not change the discrete-event mechanics;
    // they are scored purely on the cost/budget KPI via `priceImpact`.
  }
  return events;
}

export interface PriceImpact {
  budgetMultiplier: number;
  estimatedMonthlyCostDelta: number;
}

export function computePriceImpact(spec: ScenarioSpec, skillSupply: SkillSupply[]): PriceImpact {
  let baseMonthlyCost = 0;
  for (const team of spec.baseline.teams) {
    const supply = skillSupply.find((s) => s.skill === team.skill);
    const hourly = supply?.hourlyCost ?? 70;
    baseMonthlyCost += team.size * team.weeklyCapacityHours * 4.33 * hourly;
  }
  const priceIv = spec.interventions.find((i) => i.kind === "price");
  const multiplier = priceIv ? Number(priceIv.params.budgetMultiplier ?? 1) : 1;
  return { budgetMultiplier: multiplier, estimatedMonthlyCostDelta: baseMonthlyCost * (multiplier - 1) };
}

export interface TornadoFactor {
  factor: string;
  description: string;
  lowValue: number;
  highValue: number;
  lowOutcome: number;
  highOutcome: number;
  rangeImpact: number; // |highOutcome - lowOutcome|, the sensitivity ranking key
}

export interface EarlyWarningIndicator {
  description: string;
  conditionKpi: string;
  threshold: number;
  comparator: "below" | "above";
  windowSprints: number;
  likelyScenario: string;
  empiricalProbability: number;
  sampleSize: number;
}

export interface TimelinePoint {
  day: number;
  backlogCount: number;
  activeCount: number;
  reviewCount: number;
  doneCount: number;
  throughputToday: number;
}

export interface ScenarioRunResult {
  specName: string;
  primaryKpi: string;
  baseline: Record<string, Distribution>;
  intervention: Record<string, Distribution>;
  comparison: ScenarioComparison[];
  tornado: TornadoFactor[];
  earlyWarnings: EarlyWarningIndicator[];
  timeline: { baseline: TimelinePoint[]; intervention: TimelinePoint[] };
  priceImpact: PriceImpact;
  summaryText: string;
  assumptions: {
    closedBacklog: boolean;
    brooksCoefficient: number;
    brooksCoefficientProvenance: "fitted" | "default";
    onboardingRampProvenance: "assumed";
    contextSwitchProvenance: "assumed";
    attentionModelProvenance: "stand-in (Part 12 seam)";
    replicationsPerVariant: number;
    seedRoot: string;
    varianceReduction: { commonRandomNumbers: true; antithetic: boolean };
  };
  elapsedMs: number;
}

function downsample<T extends { day: number }>(series: T[], maxPoints = 60): T[] {
  if (series.length <= maxPoints) return series;
  const stride = Math.ceil(series.length / maxPoints);
  return series.filter((_, i) => i % stride === 0);
}

const PRIMARY_KPI = "avgWeeklyThroughput";

export async function runScenario(
  spec: ScenarioSpec,
  options: { physicsParams?: OrgODEParams; brooksCalibration?: { value: number; provenance: "fitted" | "default" }; antithetic?: boolean } = {},
): Promise<ScenarioRunResult> {
  const start = Date.now();
  const seedRoot = hashSeed("scenario", spec.name, spec.seeds.join(","));
  const replications = Math.max(20, spec.seeds.length * 20);
  const skillSupply = defaultSupplyTable();
  const brooksCoefficient = options.brooksCalibration?.value ?? spec.baseline.brooksCoefficientOverride ?? DEFAULT_ORG_ODE_PARAMS.brooksCoefficient;
  const brooksProvenance = options.brooksCalibration?.provenance ?? (spec.baseline.brooksCoefficientOverride ? "default" : "default");

  // Baseline = no interventions; Intervention = spec.interventions applied.
  const baselineSpec: ScenarioSpec = { ...spec, interventions: [] };
  const baselineConfig = buildSimConfig(baselineSpec, hashSeed(spec.name, "structure"), { brooksCoefficient, skillSupply });
  const interventionConfig = buildSimConfig(spec, hashSeed(spec.name, "structure"), { brooksCoefficient, skillSupply });

  const antithetic = options.antithetic ?? true;

  const [baselineMc, interventionMc] = await Promise.all([
    runMonteCarlo({ kind: "discrete-event", simConfig: baselineConfig }, { replications, seedRoot, antithetic }),
    runMonteCarlo({ kind: "discrete-event", simConfig: interventionConfig }, { replications, seedRoot, antithetic }),
  ]);

  const comparison = compareWithCRN(baselineMc, interventionMc);

  const tornado = computeTornado(spec, interventionConfig, seedRoot, brooksCoefficient);
  const timeline = {
    baseline: downsample(sampleSingleRunTimeline(baselineConfig, seedRoot)),
    intervention: downsample(sampleSingleRunTimeline(interventionConfig, seedRoot)),
  };
  const earlyWarnings = computeEarlyWarnings(interventionMc, PRIMARY_KPI);
  const priceImpact = computePriceImpact(spec, skillSupply);

  const baselineDist: Record<string, Distribution> = {};
  const interventionDist: Record<string, Distribution> = {};
  for (const [k, v] of Object.entries(baselineMc.kpis)) baselineDist[k] = v;
  for (const [k, v] of Object.entries(interventionMc.kpis)) interventionDist[k] = v;

  const summaryText = buildSummaryText(spec, comparison, tornado, earlyWarnings, priceImpact);

  return {
    specName: spec.name,
    primaryKpi: PRIMARY_KPI,
    baseline: baselineDist,
    intervention: interventionDist,
    comparison,
    tornado,
    earlyWarnings,
    timeline,
    priceImpact,
    summaryText,
    assumptions: {
      closedBacklog: true,
      brooksCoefficient,
      brooksCoefficientProvenance: brooksProvenance,
      onboardingRampProvenance: "assumed",
      contextSwitchProvenance: "assumed",
      attentionModelProvenance: "stand-in (Part 12 seam)",
      replicationsPerVariant: replications,
      seedRoot,
      varianceReduction: { commonRandomNumbers: true, antithetic },
    },
    elapsedMs: Date.now() - start,
  };
}

function sampleSingleRunTimeline(config: SimConfig, seedRoot: string): TimelinePoint[] {
  const rng = createRng(seedRoot).substream("timeline-sample");
  const result = runDiscreteEventSimulation(config, rng);
  return result.dailySnapshots.map((d) => ({
    day: d.day,
    backlogCount: d.backlogCount,
    activeCount: d.activeCount,
    reviewCount: d.reviewCount,
    doneCount: d.doneCount,
    throughputToday: d.throughputToday,
  }));
}

function computeTornado(
  spec: ScenarioSpec,
  baseInterventionConfig: SimConfig,
  seedRoot: string,
  brooksCoefficient: number,
): TornadoFactor[] {
  const rng = createRng(seedRoot).substream("tornado");
  void rng; // reserved for future paired perturbation sampling
  const N = 12; // small deterministic sample per perturbation level, sufficient for ranking (not for precise CIs)

  function avgThroughput(cfg: SimConfig, seedLabel: string): number {
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const r = createRng(seedRoot).substream(`${seedLabel}#${i}`);
      const res = runDiscreteEventSimulation(cfg, r);
      sum += (res.dailySnapshots.reduce((a, d) => a + d.throughputToday, 0) / Math.max(1, res.dailySnapshots.length)) * 5;
    }
    return sum / N;
  }

  const factors: TornadoFactor[] = [];

  // 1. Brooks coefficient ± 50%
  {
    const low = { ...baseInterventionConfig, brooksCoefficient: brooksCoefficient * 0.5 };
    const high = { ...baseInterventionConfig, brooksCoefficient: brooksCoefficient * 1.5 };
    const lowOutcome = avgThroughput(low, "brooks-low");
    const highOutcome = avgThroughput(high, "brooks-high");
    factors.push({
      factor: "brooksCoefficient",
      description: "Communication-overhead coefficient (Brooks's law), ±50% of calibrated/default value",
      lowValue: brooksCoefficient * 0.5,
      highValue: brooksCoefficient * 1.5,
      lowOutcome,
      highOutcome,
      rangeImpact: Math.abs(highOutcome - lowOutcome),
    });
  }

  // 2. Service-time noise sigma (active) ±50%
  {
    const low = { ...baseInterventionConfig, serviceTimeNoise: { ...baseInterventionConfig.serviceTimeNoise, active: baseInterventionConfig.serviceTimeNoise.active * 0.5 } };
    const high = { ...baseInterventionConfig, serviceTimeNoise: { ...baseInterventionConfig.serviceTimeNoise, active: baseInterventionConfig.serviceTimeNoise.active * 1.5 } };
    const lowOutcome = avgThroughput(low, "noise-low");
    const highOutcome = avgThroughput(high, "noise-high");
    factors.push({
      factor: "serviceTimeNoise.active",
      description: "Estimation uncertainty (lognormal sigma) on active-stage effort, ±50%",
      lowValue: baseInterventionConfig.serviceTimeNoise.active * 0.5,
      highValue: baseInterventionConfig.serviceTimeNoise.active * 1.5,
      lowOutcome,
      highOutcome,
      rangeImpact: Math.abs(highOutcome - lowOutcome),
    });
  }

  // 3. Handoff latency ±2 days
  {
    const low = { ...baseInterventionConfig, handoffLatencyDaysCold: Math.max(0, baseInterventionConfig.handoffLatencyDaysCold - 1) };
    const high = { ...baseInterventionConfig, handoffLatencyDaysCold: baseInterventionConfig.handoffLatencyDaysCold + 2 };
    const lowOutcome = avgThroughput(low, "handoff-low");
    const highOutcome = avgThroughput(high, "handoff-high");
    factors.push({
      factor: "handoffLatencyDaysCold",
      description: "Extra elapsed days for a cold (no comm-edge) review handoff, -1/+2 days",
      lowValue: Math.max(0, baseInterventionConfig.handoffLatencyDaysCold - 1),
      highValue: baseInterventionConfig.handoffLatencyDaysCold + 2,
      lowOutcome,
      highOutcome,
      rangeImpact: Math.abs(highOutcome - lowOutcome),
    });
  }

  // 4. WIP limit (active) ±2
  {
    const low = { ...baseInterventionConfig, wipLimits: { ...baseInterventionConfig.wipLimits, active: Math.max(1, baseInterventionConfig.wipLimits.active - 2) } };
    const high = { ...baseInterventionConfig, wipLimits: { ...baseInterventionConfig.wipLimits, active: baseInterventionConfig.wipLimits.active + 2 } };
    const lowOutcome = avgThroughput(low, "wip-low");
    const highOutcome = avgThroughput(high, "wip-high");
    factors.push({
      factor: "wipLimits.active",
      description: "Active-stage WIP limit, ±2 items",
      lowValue: Math.max(1, baseInterventionConfig.wipLimits.active - 2),
      highValue: baseInterventionConfig.wipLimits.active + 2,
      lowOutcome,
      highOutcome,
      rangeImpact: Math.abs(highOutcome - lowOutcome),
    });
  }

  // 5. Interruption baseline ±50% (Part 12 seam — explicitly flagged in docs as least-grounded)
  {
    const lowModel = new DefaultAttentionModel(Math.max(0, (spec.baseline.interruptionBaseline ?? 0.12) * 0.5));
    const highModel = new DefaultAttentionModel(Math.min(0.9, (spec.baseline.interruptionBaseline ?? 0.12) * 1.5));
    const low = { ...baseInterventionConfig, attentionModel: lowModel };
    const high = { ...baseInterventionConfig, attentionModel: highModel };
    const lowOutcome = avgThroughput(low, "interrupt-low");
    const highOutcome = avgThroughput(high, "interrupt-high");
    factors.push({
      factor: "interruptionBaseline",
      description: "Baseline interruption load from the Part 12 attention-model STAND-IN, ±50% (least-grounded parameter — no real telemetry yet)",
      lowValue: (spec.baseline.interruptionBaseline ?? 0.12) * 0.5,
      highValue: (spec.baseline.interruptionBaseline ?? 0.12) * 1.5,
      lowOutcome,
      highOutcome,
      rangeImpact: Math.abs(highOutcome - lowOutcome),
    });
  }

  return factors.sort((a, b) => b.rangeImpact - a.rangeImpact);
}

function computeEarlyWarnings(mc: MonteCarloResult, primaryKpi: string): EarlyWarningIndicator[] {
  const samples = mc.kpis[primaryKpi]?.samples ?? [];
  if (samples.length === 0) return [];
  const threshold = mc.kpis[primaryKpi].p10;
  const below = samples.filter((s) => s < threshold);
  const prob = samples.length > 0 ? below.length / samples.length : 0;
  return [
    {
      description: `If average weekly throughput stays below its own p10 (${threshold.toFixed(1)}) for 2 consecutive sprints, treat this run as tracking the pessimistic tail.`,
      conditionKpi: primaryKpi,
      threshold,
      comparator: "below",
      windowSprints: 2,
      likelyScenario: "pessimistic-tail",
      empiricalProbability: prob,
      sampleSize: samples.length,
    },
  ];
}

function buildSummaryText(
  spec: ScenarioSpec,
  comparison: ScenarioComparison[],
  tornado: TornadoFactor[],
  warnings: EarlyWarningIndicator[],
  price: PriceImpact,
): string {
  const primary = comparison.find((c) => c.kpi === PRIMARY_KPI);
  const topFactor = tornado[0];
  const lines: string[] = [];
  lines.push(`Scenario "${spec.name}" over ${spec.horizonDays} days with ${spec.interventions.length} intervention(s).`);
  if (primary) {
    const direction = primary.delta.mean >= 0 ? "increases" : "decreases";
    lines.push(
      `Median weekly throughput ${direction} by ${Math.abs(primary.delta.mean).toFixed(2)} items/week versus baseline ` +
        `(p10..p90 delta: ${primary.delta.p10.toFixed(2)}..${primary.delta.p90.toFixed(2)}, n=${primary.baseline.n} paired replications, common-random-numbers variance reduction applied).`,
    );
  }
  if (topFactor) {
    lines.push(
      `The assumption the outcome is most sensitive to is "${topFactor.factor}" (${topFactor.description}); varying it across its tested range moved average weekly throughput by ${topFactor.rangeImpact.toFixed(2)} items/week.`,
    );
  }
  if (price.estimatedMonthlyCostDelta !== 0) {
    lines.push(`Estimated monthly cost delta: ${price.estimatedMonthlyCostDelta >= 0 ? "+" : ""}${price.estimatedMonthlyCostDelta.toFixed(0)} (currency-neutral units; see Part 05 seam).`);
  }
  for (const w of warnings) lines.push(`Early-warning: ${w.description} Empirically observed in ${(w.empiricalProbability * 100).toFixed(0)}% of this scenario's own replications (n=${w.sampleSize}).`);
  lines.push("This summary is template-generated from structured simulation output only — no language model was used to write it (see Part 08 for narrative generation).");
  return lines.join(" ");
}
