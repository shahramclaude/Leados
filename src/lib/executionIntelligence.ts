// =============================================================================
// Leados — Execution Intelligence (Part 6)
// -----------------------------------------------------------------------------
// Pure computation module. No DB access, no I/O. Everything needed is passed
// in via ExecutionIntelligenceInput; the API route / orchestrator is
// responsible for loading rows and calling physics.ts / beliefFabric.ts.
//
// physics.ts exports used here (quoted exactly as authored in this checkout
// — see src/lib/physics.ts):
//   export function measureOrgEntropy(
//     events: LeadosEvent[],
//     people: PersonRecord[],
//   ): number
//   export function computeLeadershipEnergyBudget(
//     events: LeadosEvent[],
//     people: PersonRecord[],
//   ): number
//
// These are NOT reimplemented here. ExecutionIntelligenceInput.orgEntropy and
// .energyBudget are expected to already be the return values of those two
// functions (computed by the orchestrator against the live event log). If a
// caller (e.g. simulation.ts running a what-if scenario) wants to perturb
// entropy/energy directly without regenerating a synthetic event log, it may
// still do so — see the fallback below, which re-derives them from
// events/people only when the precomputed scalar is not supplied.
// =============================================================================

import { measureOrgEntropy, computeLeadershipEnergyBudget } from "./physics";
import type {
  Blocker,
  BlockerHeatmapCell,
  CriticalPathResult,
  CrossDependency,
  Domain,
  ExecutionIntelligenceReport,
  LeadosEvent,
  Milestone,
  OrgPhysicsState,
  PersonRecord,
  Project,
  ProjectDeliveryModel,
  ProjectSnapshot,
  RiskFactor,
} from "./types";
import { DOMAINS } from "./types";

export interface ExecutionIntelligenceInput {
  projects: Project[];
  milestones: Milestone[];
  blockers: Blocker[];
  crossDeps: CrossDependency[];
  people: PersonRecord[];
  events: LeadosEvent[];
  // NOTE: the Part 6 spec's ExecutionIntelligenceInput omits project
  // snapshots, but the STALE SIGNAL FACTOR ("no project_snapshot in last 7
  // days") requires them. Added here as a required field; this is the one
  // deviation from the literal interface in the spec, necessary for the
  // spec's own scoring rule to be computable.
  snapshots: ProjectSnapshot[];
  orgEntropy: number; // measureOrgEntropy(events, people) — see header
  energyBudget: number; // computeLeadershipEnergyBudget(events, people)
  executionRiskPosterior: number; // from beliefFabric
  now: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x));
}

function daysBetween(a: Date, b: Date) {
  return (b.getTime() - a.getTime()) / DAY_MS;
}

function rangesOverlap(
  aStart: Date | null,
  aEnd: Date | null,
  bStart: Date | null,
  bEnd: Date | null,
): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart.getTime() <= bEnd.getTime() && bStart.getTime() <= aEnd.getTime();
}

// -----------------------------------------------------------------------------
// A. Delivery confidence model
// -----------------------------------------------------------------------------

interface PreliminaryResult {
  project: Project;
  confidence: number;
  riskFactors: RiskFactor[];
}

function computePreliminaryConfidence(
  project: Project,
  milestones: Milestone[],
  blockers: Blocker[],
  people: PersonRecord[],
  events: LeadosEvent[],
  snapshots: ProjectSnapshot[],
  orgEntropy: number,
  energyBudget: number,
  executionRiskPosterior: number,
  now: Date,
): PreliminaryResult {
  let score = 100;
  const riskFactors: RiskFactor[] = [];

  const apply = (label: string, impact: number, category: RiskFactor["category"]) => {
    score += impact;
    riskFactors.push({ label, impact, category });
  };

  const projectMilestones = milestones.filter((m) => m.projectId === project.id);
  const openBlockers = blockers.filter(
    (b) => b.projectId === project.id && !b.resolvedAt,
  );

  // --- MILESTONE FACTORS ---
  if (projectMilestones.length === 0) {
    apply("No milestones defined (planning gap)", -10, "milestone");
  } else {
    const done = projectMilestones.filter((m) => m.status === "done").length;
    const progress = done / projectMilestones.length;

    if (project.startDate && project.targetDate) {
      const total = daysBetween(project.startDate, project.targetDate);
      const elapsed = daysBetween(project.startDate, now);
      const timeElapsedFrac = total > 0 ? clamp(elapsed / total, 0, 2) : 0;
      if (progress < timeElapsedFrac - 0.15) {
        apply(
          `Behind schedule: ${Math.round(progress * 100)}% milestones done vs ${Math.round(timeElapsedFrac * 100)}% time elapsed`,
          -20,
          "milestone",
        );
      }
    }

    const overdue = projectMilestones.filter((m) => m.status === "overdue").length;
    if (overdue > 0) {
      const impact = -Math.min(36, overdue * 12);
      apply(`${overdue} overdue milestone(s)`, impact, "milestone");
    }
  }

  // --- BLOCKER FACTORS ---
  const highSevCount = openBlockers.filter((b) => b.severity >= 4).length;
  if (highSevCount > 0) {
    apply(`${highSevCount} severity 4-5 blocker(s)`, -Math.min(44, highSevCount * 22), "blocker");
  }
  const midSevCount = openBlockers.filter((b) => b.severity >= 2 && b.severity <= 3).length;
  if (midSevCount > 0) {
    apply(`${midSevCount} severity 2-3 blocker(s)`, -Math.min(20, midSevCount * 10), "blocker");
  }
  const unassigned = openBlockers.filter((b) => !b.assignedTo).length;
  if (unassigned > 0) {
    apply(`${unassigned} blocker(s) with no owner assigned`, -5 * unassigned, "blocker");
  }

  // --- PEOPLE FACTORS ---
  const owner = project.ownerId ? people.find((p) => p.id === project.ownerId) : undefined;
  if (!project.ownerId) {
    apply("No project owner assigned", -20, "people");
  } else if (owner) {
    if (owner.flightRisk > 0.5) {
      apply(`Owner ${owner.name} has elevated flight risk (key person risk)`, -15, "people");
    }
    if (owner.burnoutRisk > 0.6) {
      apply(`Owner ${owner.name} is showing burnout risk`, -10, "people");
    }
  }

  // --- PHYSICS FACTORS ---
  if (orgEntropy > 0.7) {
    apply("Org entropy is high — chaotic org is unpredictable", -10, "physics");
  }
  if (energyBudget < 0.3) {
    apply("Leadership energy budget depleted", -8, "physics");
  }
  if (executionRiskPosterior > 0.5) {
    apply("Belief network posterior flags elevated execution risk", -10, "physics");
  }

  // --- STALE SIGNAL FACTOR ---
  const projectEvents = events.filter((e) => e.projectId === project.id);
  const lastEvent = projectEvents.reduce<Date | null>((latest, e) => {
    if (!latest || e.createdAt.getTime() > latest.getTime()) return e.createdAt;
    return latest;
  }, null);
  if (!lastEvent || daysBetween(lastEvent, now) > 14) {
    apply("No project activity/event in over 14 days", -12, "signal");
  }
  const projectSnapshots = snapshots.filter((s) => s.projectId === project.id);
  const lastSnapshot = projectSnapshots.reduce<Date | null>((latest, s) => {
    if (!latest || s.snapshotAt.getTime() > latest.getTime()) return s.snapshotAt;
    return latest;
  }, null);
  if (!lastSnapshot || daysBetween(lastSnapshot, now) > 7) {
    apply("No confidence snapshot recorded in the last 7 days", -5, "signal");
  }

  return { project, confidence: clamp(score, 0, 100), riskFactors };
}

function physicsAnnotation(orgEntropy: number, energyBudget: number): string {
  const highEntropy = orgEntropy > 0.6;
  const lowEnergy = energyBudget < 0.4;

  if (highEntropy && lowEnergy) {
    return "Operating in turbulence with depleted reserves — this project is high risk.";
  }
  if (highEntropy && !lowEnergy) {
    return "Turbulent environment but leadership has reserves to absorb shocks.";
  }
  if (!highEntropy && lowEnergy) {
    return "Structured environment but capacity is the constraint — protect this team from additional work.";
  }
  return "Ideal conditions for execution.";
}

function buildDeliveryConfidence(input: ExecutionIntelligenceInput): ProjectDeliveryModel[] {
  const {
    projects,
    milestones,
    blockers,
    crossDeps,
    people,
    events,
    snapshots,
    orgEntropy,
    energyBudget,
    executionRiskPosterior,
    now,
  } = input;

  // Pass 1: preliminary confidence, independent of cross-project dependencies.
  const prelim = new Map<number, PreliminaryResult>();
  for (const project of projects) {
    prelim.set(
      project.id,
      computePreliminaryConfidence(
        project,
        milestones,
        blockers,
        people,
        events,
        snapshots,
        orgEntropy,
        energyBudget,
        executionRiskPosterior,
        now,
      ),
    );
  }

  // Pass 2: apply dependency factors, referencing pass-1 preliminary scores
  // of upstream projects (avoids order-dependent / circular computation).
  const results: ProjectDeliveryModel[] = [];

  for (const project of projects) {
    const base = prelim.get(project.id)!;
    let score = base.confidence;
    const riskFactors: RiskFactor[] = [...base.riskFactors];
    const apply = (label: string, impact: number, category: RiskFactor["category"]) => {
      score += impact;
      riskFactors.push({ label, impact, category });
    };

    // Upstream = projects that must complete before this one (type='blocks',
    // edge direction fromProject -> toProject, so fromProject is upstream of
    // this project when this project is the toProject).
    const upstreamDeps = crossDeps.filter(
      (d) => d.toProject === project.id && d.type === "blocks",
    );
    for (const dep of upstreamDeps) {
      const upstream = prelim.get(dep.fromProject);
      if (!upstream) continue;
      if (upstream.project.status === "blocked") {
        apply(`Upstream dependency "${upstream.project.name}" is blocked`, -18, "dependency");
      }
      if (upstream.confidence < 50) {
        apply(
          `Upstream dependency "${upstream.project.name}" has low confidence (${Math.round(upstream.confidence)}%)`,
          -8,
          "dependency",
        );
      }
    }

    // shares_resource conflict: same resource person (shared owner), overlapping dates.
    const sharedDeps = crossDeps.filter(
      (d) =>
        d.type === "shares_resource" &&
        (d.fromProject === project.id || d.toProject === project.id),
    );
    for (const dep of sharedDeps) {
      const otherId = dep.fromProject === project.id ? dep.toProject : dep.fromProject;
      const other = prelim.get(otherId);
      if (!other) continue;
      const sameOwner = project.ownerId && project.ownerId === other.project.ownerId;
      const overlap = rangesOverlap(
        project.startDate,
        project.targetDate,
        other.project.startDate,
        other.project.targetDate,
      );
      if (sameOwner && overlap) {
        apply(
          `Shared resource conflict with "${other.project.name}" over overlapping dates`,
          -12,
          "dependency",
        );
      }
    }

    const computedConfidence = clamp(score, 0, 100);
    const confidenceDelta = computedConfidence - project.confidence;

    // DESIGN PARAMETER: sigmoid steepness (0.08) and midpoint (50) are a
    // design choice to map a 0-100 confidence score onto a probability
    // curve, NOT a calibrated statistical model fit to historical outcomes.
    const completionProbability = sigmoid(0.08 * (computedConfidence - 50));

    // DESIGN PARAMETER: 0.8 days of slip per confidence point below 50 is a
    // design choice, not derived from historical slippage data.
    const lateByDays = computedConfidence < 50 ? (50 - computedConfidence) * 0.8 : null;
    const expectedCompletionDate = project.targetDate
      ? new Date(project.targetDate.getTime() + (lateByDays ?? 0) * DAY_MS)
      : null;

    results.push({
      projectId: project.id,
      name: project.name,
      status: project.status,
      targetDate: project.targetDate,
      baseConfidence: project.confidence,
      computedConfidence,
      confidenceDelta,
      completionProbability,
      expectedCompletionDate,
      lateByDays,
      riskFactors,
      physicsAnnotation: physicsAnnotation(orgEntropy, energyBudget),
    });
  }

  return results;
}

// -----------------------------------------------------------------------------
// B. Critical path — Kahn's algorithm
// -----------------------------------------------------------------------------
//
// Kahn's algorithm (Kahn, 1962). Time complexity O(V+E).
// If |sorted| < |V|, the remaining nodes form one or more cycles.
//
// Pseudocode:
//   build adjacency[u] = list of v for each edge u -> v
//   inDegree[v] += 1 for each edge u -> v
//   queue = [n for n in nodes if inDegree[n] == 0]
//   sorted = []
//   while queue not empty:
//     u = queue.pop_front()
//     sorted.append(u)
//     for v in adjacency[u]:
//       inDegree[v] -= 1
//       if inDegree[v] == 0:
//         queue.push_back(v)
//   if len(sorted) < len(nodes):
//     remaining = nodes - sorted   // these nodes participate in >=1 cycle
//     cycles = DFS_find_cycles(remaining, adjacency restricted to remaining)
// -----------------------------------------------------------------------------

function kahnTopSort(
  nodes: number[],
  edges: Array<[number, number]>,
): { sorted: number[]; adjacency: Map<number, number[]> } {
  const adjacency = new Map<number, number[]>();
  const inDegree = new Map<number, number>();
  for (const n of nodes) {
    adjacency.set(n, []);
    inDegree.set(n, 0);
  }
  for (const [u, v] of edges) {
    if (!adjacency.has(u) || !adjacency.has(v)) continue;
    adjacency.get(u)!.push(v);
    inDegree.set(v, (inDegree.get(v) ?? 0) + 1);
  }

  const queue: number[] = nodes.filter((n) => (inDegree.get(n) ?? 0) === 0);
  const sorted: number[] = [];

  while (queue.length > 0) {
    const u = queue.shift()!;
    sorted.push(u);
    for (const v of adjacency.get(u) ?? []) {
      inDegree.set(v, (inDegree.get(v) ?? 0) - 1);
      if (inDegree.get(v) === 0) queue.push(v);
    }
  }

  return { sorted, adjacency };
}

// DFS on the subgraph induced by nodes left out of the topological order to
// extract the cycle(s) they participate in.
function findCyclesInRemainder(
  remaining: number[],
  adjacency: Map<number, number[]>,
): number[][] {
  const remainingSet = new Set(remaining);
  const visited = new Set<number>();
  const cycles: number[][] = [];

  function dfs(start: number) {
    const pathIndex = new Map<number, number>();
    const path: number[] = [];

    function visit(node: number) {
      if (pathIndex.has(node)) {
        const idx = pathIndex.get(node)!;
        cycles.push(path.slice(idx).concat(node));
        return;
      }
      if (visited.has(node)) return;
      visited.add(node);
      pathIndex.set(node, path.length);
      path.push(node);
      for (const next of adjacency.get(node) ?? []) {
        if (!remainingSet.has(next)) continue;
        visit(next);
      }
      path.pop();
      pathIndex.delete(node);
    }

    visit(start);
  }

  for (const n of remaining) {
    if (!visited.has(n)) dfs(n);
  }

  return cycles;
}

function longestPath(sorted: number[], adjacency: Map<number, number[]>): number[] {
  // Longest path in a DAG via DP over the Kahn topological order.
  const dist = new Map<number, number>();
  const next = new Map<number, number | null>();
  for (const n of sorted) {
    dist.set(n, 1);
    next.set(n, null);
  }
  // process in reverse topological order so dist[u] depends on already-computed dist[v]
  for (let i = sorted.length - 1; i >= 0; i--) {
    const u = sorted[i];
    for (const v of adjacency.get(u) ?? []) {
      if (!dist.has(v)) continue;
      const candidate = 1 + (dist.get(v) ?? 1);
      if (candidate > (dist.get(u) ?? 1)) {
        dist.set(u, candidate);
        next.set(u, v);
      }
    }
  }

  let bestStart: number | null = null;
  let bestLen = 0;
  for (const n of sorted) {
    if ((dist.get(n) ?? 0) > bestLen) {
      bestLen = dist.get(n) ?? 0;
      bestStart = n;
    }
  }

  const chain: number[] = [];
  let cursor = bestStart;
  while (cursor !== null && cursor !== undefined) {
    chain.push(cursor);
    cursor = next.get(cursor) ?? null;
  }
  return chain;
}

function buildCriticalPath(
  projects: Project[],
  crossDeps: CrossDependency[],
  confidenceById: Map<number, number>,
): CriticalPathResult {
  const nodes = projects.map((p) => p.id);
  const edges: Array<[number, number]> = crossDeps
    .filter((d) => d.type === "blocks")
    .map((d) => [d.fromProject, d.toProject]);

  const { sorted, adjacency } = kahnTopSort(nodes, edges);

  let cyclesDetected: number[][] = [];
  if (sorted.length < nodes.length) {
    const remaining = nodes.filter((n) => !sorted.includes(n));
    cyclesDetected = findCyclesInRemainder(remaining, adjacency);
  }

  const chain = longestPath(sorted, adjacency);

  let bottleneckProject: number | null = null;
  let bottleneckReason = "No critical chain of dependencies detected.";
  if (chain.length > 0) {
    let lowest = Infinity;
    for (const id of chain) {
      const conf = confidenceById.get(id) ?? 100;
      if (conf < lowest) {
        lowest = conf;
        bottleneckProject = id;
      }
    }
    const bottleneckName = projects.find((p) => p.id === bottleneckProject)?.name ?? "unknown";
    bottleneckReason = `"${bottleneckName}" has the lowest confidence (${Math.round(lowest)}%) on the critical chain — a delay here cascades to every downstream dependency.`;
  }

  return {
    chain,
    chainLength: chain.length,
    cyclesDetected,
    bottleneckProject,
    bottleneckReason,
  };
}

// -----------------------------------------------------------------------------
// Blocker heatmap — 8 domains x 5 severities
// -----------------------------------------------------------------------------

function buildBlockerHeatmap(blockers: Blocker[]): BlockerHeatmapCell[][] {
  const open = blockers.filter((b) => !b.resolvedAt);
  const grid: BlockerHeatmapCell[][] = DOMAINS.map((domain) =>
    [1, 2, 3, 4, 5].map((severity) => ({
      domain,
      severity,
      count: 0,
      blockerIds: [] as number[],
    })),
  );

  for (const b of open) {
    const domain = (b.domain ?? "operations") as Domain;
    const rowIdx = DOMAINS.indexOf(domain);
    const row = rowIdx >= 0 ? grid[rowIdx] : grid[DOMAINS.length - 1];
    const cell = row[clamp(b.severity, 1, 5) - 1];
    cell.count += 1;
    cell.blockerIds.push(b.id);
  }

  return grid;
}

// -----------------------------------------------------------------------------
// Org physics state (inertia, momentum, friction derived here; entropy &
// energyBudget pass through from physics.ts per the header note)
// -----------------------------------------------------------------------------

function buildPhysicsState(input: ExecutionIntelligenceInput): OrgPhysicsState {
  const { projects, blockers, people, crossDeps, milestones, now } = input;

  const entropy = input.orgEntropy ?? measureOrgEntropy(input.events, people);
  const energyBudget =
    input.energyBudget ?? computeLeadershipEnergyBudget(input.events, people);

  const activeBlockers = blockers.filter((b) => !b.resolvedAt).length;
  const inertia = people.length > 0 ? clamp(activeBlockers / people.length, 0, 1) : 0;

  const fourteenDaysAgo = new Date(now.getTime() - 14 * DAY_MS);
  const completedLast14d = milestones.filter(
    (m) => m.status === "done" && m.completedAt && m.completedAt.getTime() >= fourteenDaysAgo.getTime(),
  ).length;
  const pending = milestones.filter((m) => m.status === "pending" || m.status === "overdue").length;
  const momentum = pending > 0 ? clamp(completedLast14d / pending, 0, 1) : completedLast14d > 0 ? 1 : 0;

  const shareDeps = crossDeps.filter((d) => d.type === "shares_resource");
  let conflicts = 0;
  for (const dep of shareDeps) {
    const from = projects.find((p) => p.id === dep.fromProject);
    const to = projects.find((p) => p.id === dep.toProject);
    if (!from || !to) continue;
    const sharedPersonId = from.ownerId && from.ownerId === to.ownerId ? from.ownerId : null;
    if (!sharedPersonId) continue;
    const person = people.find((p) => p.id === sharedPersonId);
    if (person && (person.flightRisk > 0.4 || person.burnoutRisk > 0.4)) {
      conflicts += 1;
    }
  }
  const frictionIndex = projects.length > 0 ? clamp(conflicts / projects.length, 0, 1) : 0;

  return { entropy, energyBudget, inertia, momentum, frictionIndex };
}

function buildVelocityTrend(
  milestones: Milestone[],
  now: Date,
): "accelerating" | "stable" | "decelerating" {
  const window = 14 * DAY_MS;
  const recentStart = new Date(now.getTime() - window);
  const priorStart = new Date(now.getTime() - 2 * window);

  const recentDone = milestones.filter(
    (m) => m.status === "done" && m.completedAt && m.completedAt >= recentStart && m.completedAt <= now,
  ).length;
  const priorDone = milestones.filter(
    (m) =>
      m.status === "done" &&
      m.completedAt &&
      m.completedAt >= priorStart &&
      m.completedAt < recentStart,
  ).length;

  if (priorDone === 0 && recentDone === 0) return "stable";
  if (priorDone === 0) return "accelerating";

  const change = (recentDone - priorDone) / priorDone;
  if (change > 0.1) return "accelerating";
  if (change < -0.1) return "decelerating";
  return "stable";
}

// -----------------------------------------------------------------------------
// Entry point
// -----------------------------------------------------------------------------

export function buildExecutionIntelligenceReport(
  input: ExecutionIntelligenceInput,
): ExecutionIntelligenceReport {
  const deliveryConfidence = buildDeliveryConfidence(input);
  const confidenceById = new Map(deliveryConfidence.map((d) => [d.projectId, d.computedConfidence]));

  const criticalPath = buildCriticalPath(input.projects, input.crossDeps, confidenceById);
  const blockerHeatmap = buildBlockerHeatmap(input.blockers);
  const physicsState = buildPhysicsState(input);
  const velocityTrend = buildVelocityTrend(input.milestones, input.now);

  // momentumIndex (0-100): weighted composite of org momentum, tempered by
  // entropy (chaos erodes perceived momentum) and boosted by remaining
  // leadership energy. DESIGN PARAMETER weights (0.6 / 0.25 / 0.15).
  const momentumIndex = clamp(
    Math.round(
      100 *
        (0.6 * physicsState.momentum +
          0.25 * (1 - physicsState.entropy) +
          0.15 * physicsState.energyBudget),
    ),
    0,
    100,
  );

  const activeProjects = deliveryConfidence.filter((d) => d.status !== "complete");
  const avgConfidence =
    activeProjects.length > 0
      ? activeProjects.reduce((s, d) => s + d.computedConfidence, 0) / activeProjects.length
      : 100;

  // executionHealthScore (0-100): weighted composite. DESIGN PARAMETER.
  const executionHealthScore = clamp(
    Math.round(
      0.4 * avgConfidence +
        0.2 * momentumIndex +
        0.15 * (100 * (1 - physicsState.entropy)) +
        0.15 * (100 * physicsState.energyBudget) +
        0.1 * (100 * (1 - input.executionRiskPosterior)),
    ),
    0,
    100,
  );

  const atRiskProjects = deliveryConfidence
    .filter((d) => d.computedConfidence < 50)
    .sort((a, b) => a.computedConfidence - b.computedConfidence);

  return {
    executionHealthScore,
    deliveryConfidence,
    criticalPath,
    blockerHeatmap,
    momentumIndex,
    velocityTrend,
    physicsState,
    atRiskProjects,
    generatedAt: input.now.toISOString(),
  };
}
