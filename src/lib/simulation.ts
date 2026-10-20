/**
 * simulation.ts — Part 06 section A: discrete-event organizational model.
 *
 * A day-granularity discrete-event queueing simulation:
 *   backlog -> active -> review -> done
 * with:
 *   - agents: capacity (hours/week), skills, comm edges (metadata only —
 *     used for warm/cold handoff, not message content), tenure-based
 *     onboarding ramp, context-switch penalty from concurrent assignments
 *   - Brooks's-law team coordination overhead on the active stage, cost
 *     proportional to n(n-1)/2 via the SAME fitted coefficient used by
 *     `orgPhysics.ts` (single source of truth: `orgODE.brooksOverhead`)
 *   - WIP limits per stage (pull system)
 *   - handoff latency: a cold handoff (reviewer has no comm edge to the
 *     assignee) costs extra elapsed days before review work can start
 *   - interruption load pulled from the `IAttentionModel` seam (Part 12)
 *
 * SIMPLIFYING ASSUMPTION (documented, not hidden): the backlog is a fixed,
 * closed set of work items per run (no open Poisson arrivals). This is
 * sufficient to study flow, WIP, Brooks's law and ramp effects for a
 * scoped body of work (e.g. a quarter's roadmap) but will understate
 * queueing effects in a never-empty backlog. An open-arrival extension is
 * listed as future work in docs/SIMULATION.md.
 *
 * Determinism: all randomness is drawn from the supplied `Rng` (see
 * prng.ts). Same `Rng` state + same config => bit-identical run.
 */
import { brooksOverhead } from "@/lib/orgODE";
import { DefaultAttentionModel, IAttentionModel, contextSwitchRetention, onboardingRampFactor } from "@/lib/physics";
import type { Rng } from "@/lib/prng";

export interface SimAgent {
  id: string;
  name: string;
  skills: string[];
  weeklyCapacityHours: number;
  /** Metadata-only comm graph edges (agent ids this agent collaborates warmly with). */
  commEdges: string[];
  teamId: string;
  /** Simulated day this agent started; 0 = fully ramped at sim start, >0 = hired mid-run. */
  hireDay: number;
}

export interface SimWorkItem {
  id: string;
  requiredSkill: string;
  estimatedHours: number;
  priority: number;
  dependsOn: string[];
}

export interface ServiceTimeNoise {
  /** Multiplicative lognormal noise sigma applied to the base estimate per stage. */
  active: number;
  review: number;
}

/**
 * Scheduled structural changes applied mid-run at `day`, used by
 * `scenarioEngine.ts` to realize the `hire` / `delay` / `restructure` /
 * `process` interventions without requiring the caller to hand-build a
 * different static SimConfig per day.
 */
export type ScheduledEvent =
  | { day: number; type: "hire"; agent: SimAgent }
  | { day: number; type: "capacityMultiplier"; teamId: string; multiplier: number; durationDays: number }
  | { day: number; type: "wipLimits"; active?: number; review?: number }
  | { day: number; type: "reviewFraction"; value: number }
  | { day: number; type: "reorg"; teamIds: string[]; newTeamId: string };

export interface SimConfig {
  agents: SimAgent[];
  backlog: SimWorkItem[];
  wipLimits: { active: number; review: number };
  brooksCoefficient: number;
  reviewFractionOfEstimate: number; // review effort as a fraction of active estimate
  serviceTimeNoise: ServiceTimeNoise;
  handoffLatencyDaysCold: number;
  attentionModel?: IAttentionModel;
  horizonDays: number;
  scheduledEvents?: ScheduledEvent[];
}

type Stage = "backlog" | "active" | "review" | "done";

interface ItemState {
  item: SimWorkItem;
  stage: Stage;
  assignedAgentId: string | null;
  remainingHours: number;
  delayDaysRemaining: number;
  enteredStageDay: number;
  startedDay: number | null;
  doneDay: number | null;
  priorAssigneeId: string | null;
}

export interface DailySnapshot {
  day: number;
  backlogCount: number;
  activeCount: number;
  reviewCount: number;
  doneCount: number;
  throughputToday: number;
  activeAgentCount: number;
  brooksOverheadFraction: number;
  avgUtilization: number;
}

export interface FinishedItemRecord {
  id: string;
  cycleTimeDays: number;
  coldHandoff: boolean;
}

export interface DiscreteEventResult {
  dailySnapshots: DailySnapshot[];
  finishedItems: FinishedItemRecord[];
  unfinishedCount: number;
  assumptions: {
    closedBacklog: true;
    stageGranularityDays: 1;
    brooksCoefficient: number;
    handoffLatencyDaysCold: number;
  };
}

function pickAgentForSkill(
  agents: SimAgent[],
  skill: string,
  capacityLeft: Map<string, number>,
  busy: Set<string>,
): SimAgent | null {
  let best: SimAgent | null = null;
  let bestCap = -Infinity;
  for (const a of agents) {
    if (busy.has(a.id)) continue;
    if (!a.skills.includes(skill)) continue;
    const cap = capacityLeft.get(a.id) ?? 0;
    if (cap > bestCap) {
      bestCap = cap;
      best = a;
    }
  }
  return best;
}

export function runDiscreteEventSimulation(config: SimConfig, rng: Rng): DiscreteEventResult {
  const attentionModel = config.attentionModel ?? new DefaultAttentionModel();
  // Mutable working copies: scheduled events (hire/restructure/process
  // changes) mutate these during the run without touching the caller's
  // input config, so a single SimConfig + scheduledEvents list can realize
  // every Part 06-D intervention kind.
  const agents: SimAgent[] = config.agents.map((a) => ({ ...a, skills: [...a.skills], commEdges: [...a.commEdges] }));
  const agentById = new Map(agents.map((a) => [a.id, a]));
  let wipLimits = { ...config.wipLimits };
  let reviewFractionOfEstimate = config.reviewFractionOfEstimate;
  const capacityMultipliers = new Map<string, { multiplier: number; untilDay: number }>();
  const events = [...(config.scheduledEvents ?? [])].sort((a, b) => a.day - b.day);

  const items: ItemState[] = config.backlog
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .map((item) => ({
      item,
      stage: "backlog",
      assignedAgentId: null,
      remainingHours: 0,
      delayDaysRemaining: 0,
      enteredStageDay: 0,
      startedDay: null,
      doneDay: null,
      priorAssigneeId: null,
    }));

  const dailySnapshots: DailySnapshot[] = [];
  const finishedItems: FinishedItemRecord[] = [];

  for (let day = 0; day < config.horizonDays; day++) {
    // --- apply scheduled structural events for this day -----------------------
    for (const ev of events) {
      if (ev.day !== day) continue;
      if (ev.type === "hire") {
        const newAgent = { ...ev.agent, hireDay: day };
        agents.push(newAgent);
        agentById.set(newAgent.id, newAgent);
      } else if (ev.type === "capacityMultiplier") {
        capacityMultipliers.set(ev.teamId, { multiplier: ev.multiplier, untilDay: day + ev.durationDays });
      } else if (ev.type === "wipLimits") {
        wipLimits = { active: ev.active ?? wipLimits.active, review: ev.review ?? wipLimits.review };
      } else if (ev.type === "reviewFraction") {
        reviewFractionOfEstimate = ev.value;
      } else if (ev.type === "reorg") {
        const moved = agents.filter((a) => ev.teamIds.includes(a.teamId));
        const movedIds = moved.map((a) => a.id);
        for (const a of moved) {
          a.teamId = ev.newTeamId;
          a.commEdges = Array.from(new Set([...a.commEdges, ...movedIds.filter((id) => id !== a.id)]));
          // Reorg disruption: tenure-based ramp resets to model the
          // documented "team shuffling costs ramp-up time" effect. This is
          // a deliberately conservative (pessimistic) assumption — see
          // docs/SIMULATION.md.
          a.hireDay = day;
        }
      }
    }

    // --- capacity accounting -------------------------------------------------
    const activeAssignmentCount = new Map<string, number>(); // concurrent items per agent today
    for (const it of items) {
      if ((it.stage === "active" || it.stage === "review") && it.assignedAgentId) {
        activeAssignmentCount.set(it.assignedAgentId, (activeAssignmentCount.get(it.assignedAgentId) ?? 0) + 1);
      }
    }

    const activeStageAgentIds = new Set(
      items.filter((it) => it.stage === "active" && it.assignedAgentId).map((it) => it.assignedAgentId as string),
    );
    const overheadFraction = brooksOverhead(Math.max(1, activeStageAgentIds.size), config.brooksCoefficient);

    const capacityLeft = new Map<string, number>();
    let utilizationSum = 0;
    let utilizationCount = 0;
    for (const agent of agents) {
      const multiplierEntry = capacityMultipliers.get(agent.teamId);
      const teamMultiplier = multiplierEntry && day < multiplierEntry.untilDay ? multiplierEntry.multiplier : 1;
      const raw = (agent.weeklyCapacityHours / 5) * teamMultiplier;
      const ramp = onboardingRampFactor(day - agent.hireDay);
      const concurrent = activeAssignmentCount.get(agent.id) ?? 1;
      const ctxRetention = contextSwitchRetention(concurrent);
      const interruption = attentionModel.interruptionLoad(agent.id, day, rng);
      let effective = raw * ramp * ctxRetention * (1 - interruption);
      if (activeStageAgentIds.has(agent.id)) {
        effective *= 1 - overheadFraction;
      }
      capacityLeft.set(agent.id, Math.max(0, effective));
      if (raw > 0) {
        utilizationSum += Math.max(0, effective) / raw;
        utilizationCount += 1;
      }
    }

    // --- process review stage first (frees WIP sooner) -----------------------
    let throughputToday = 0;
    for (const it of items) {
      if (it.stage !== "review") continue;
      if (it.delayDaysRemaining > 0) {
        it.delayDaysRemaining -= 1;
        continue;
      }
      const agentId = it.assignedAgentId;
      if (!agentId) continue;
      const cap = capacityLeft.get(agentId) ?? 0;
      const spend = Math.min(cap, it.remainingHours);
      it.remainingHours -= spend;
      capacityLeft.set(agentId, cap - spend);
      if (it.remainingHours <= 1e-6) {
        it.stage = "done";
        it.doneDay = day;
        throughputToday += 1;
        const cycleTime = it.startedDay !== null ? day - it.startedDay + 1 : 1;
        finishedItems.push({
          id: it.item.id,
          cycleTimeDays: cycleTime,
          coldHandoff: it.priorAssigneeId !== null && agentId !== it.priorAssigneeId
            ? !(agentById.get(it.priorAssigneeId)?.commEdges.includes(agentId) ?? false)
            : false,
        });
      }
    }

    // --- process active stage -------------------------------------------------
    for (const it of items) {
      if (it.stage !== "active") continue;
      const agentId = it.assignedAgentId;
      if (!agentId) continue;
      const cap = capacityLeft.get(agentId) ?? 0;
      const spend = Math.min(cap, it.remainingHours);
      it.remainingHours -= spend;
      capacityLeft.set(agentId, cap - spend);
      if (it.remainingHours <= 1e-6) {
        // Transition to review; pick a reviewer (prefer warm handoff).
        const busyReview = new Set(
          items.filter((x) => x.stage === "review" && x.assignedAgentId).map((x) => x.assignedAgentId as string),
        );
        const assignee = agentById.get(agentId)!;
        const warmCandidate = agents.find(
          (a) => a.id !== agentId && a.skills.includes(it.item.requiredSkill) && assignee.commEdges.includes(a.id) && !busyReview.has(a.id),
        );
        const reviewer =
          warmCandidate ?? pickAgentForSkill(agents, it.item.requiredSkill, capacityLeft, busyReview) ?? assignee;
        const coldHandoff = reviewer.id !== agentId && !assignee.commEdges.includes(reviewer.id);

        it.priorAssigneeId = agentId;
        it.assignedAgentId = reviewer.id;
        it.stage = "review";
        it.enteredStageDay = day + 1;
        it.remainingHours = it.item.estimatedHours * reviewFractionOfEstimate * rng.substream(`review:${it.item.id}`).lognormal(0, config.serviceTimeNoise.review);
        it.delayDaysRemaining = coldHandoff ? config.handoffLatencyDaysCold : 0;
      }
    }

    // --- pull new work into active stage from backlog (WIP-limited) ----------
    const activeCountNow = items.filter((x) => x.stage === "active").length;
    const reviewCountNow = items.filter((x) => x.stage === "review").length;
    let activeSlots = Math.max(0, wipLimits.active - activeCountNow);
    const busyAgents = new Set(
      items
        .filter((x) => (x.stage === "active" || x.stage === "review") && x.assignedAgentId)
        .map((x) => x.assignedAgentId as string),
    );

    if (reviewCountNow <= wipLimits.review) {
      for (const it of items) {
        if (activeSlots <= 0) break;
        if (it.stage !== "backlog") continue;
        const depsReady = it.item.dependsOn.every((depId) => finishedItems.some((f) => f.id === depId));
        if (!depsReady) continue;
        const agent = pickAgentForSkill(agents, it.item.requiredSkill, capacityLeft, busyAgents);
        if (!agent) continue;
        it.stage = "active";
        it.assignedAgentId = agent.id;
        it.enteredStageDay = day;
        it.startedDay = day;
        it.remainingHours = it.item.estimatedHours * rng.substream(`active:${it.item.id}`).lognormal(0, config.serviceTimeNoise.active);
        busyAgents.add(agent.id);
        activeSlots -= 1;
      }
    }

    dailySnapshots.push({
      day,
      backlogCount: items.filter((x) => x.stage === "backlog").length,
      activeCount: items.filter((x) => x.stage === "active").length,
      reviewCount: items.filter((x) => x.stage === "review").length,
      doneCount: items.filter((x) => x.stage === "done").length,
      throughputToday,
      activeAgentCount: activeStageAgentIds.size,
      brooksOverheadFraction: overheadFraction,
      avgUtilization: utilizationCount > 0 ? utilizationSum / utilizationCount : 0,
    });
  }

  return {
    dailySnapshots,
    finishedItems,
    unfinishedCount: items.length - finishedItems.length,
    assumptions: {
      closedBacklog: true,
      stageGranularityDays: 1,
      brooksCoefficient: config.brooksCoefficient,
      handoffLatencyDaysCold: config.handoffLatencyDaysCold,
    },
  };
}
