// Alignment graph: objective tree/DAG with typed links, cycle detection,
// orphan detection, cascade-completeness scoring, conflict detection, and the
// "strategy path" query (objective -> initiatives -> teams -> metrics).
//
// All functions here are PURE (no DB access) so they can run against
// in-memory fixtures in tests, including the 100-objective performance test.
import type { ObjectiveLinkType } from "@/db/schema";
import type {
  EvidenceRefInput,
  Finding,
  InitiativeNode,
  KeyResultInput,
  MilestoneNode,
  ObjectiveLinkEdge,
  ObjectiveNode,
  TeamNode,
} from "./strategyModels";

export interface AlignmentGraph {
  objectivesById: Map<string, ObjectiveNode>;
  /** Outgoing edges by linkType, keyed by fromObjectiveId */
  outByType: Map<ObjectiveLinkType, Map<string, ObjectiveLinkEdge[]>>;
  /** Incoming edges by linkType, keyed by toObjectiveId */
  inByType: Map<ObjectiveLinkType, Map<string, ObjectiveLinkEdge[]>>;
}

const LINK_TYPES: ObjectiveLinkType[] = ["contributes_to", "blocks", "duplicates", "conflicts"];

export function buildGraph(objectives: ObjectiveNode[], links: ObjectiveLinkEdge[]): AlignmentGraph {
  const objectivesById = new Map(objectives.map((o) => [o.id, o]));
  const outByType = new Map<ObjectiveLinkType, Map<string, ObjectiveLinkEdge[]>>();
  const inByType = new Map<ObjectiveLinkType, Map<string, ObjectiveLinkEdge[]>>();
  for (const t of LINK_TYPES) {
    outByType.set(t, new Map());
    inByType.set(t, new Map());
  }
  for (const link of links) {
    const outMap = outByType.get(link.linkType)!;
    const inMap = inByType.get(link.linkType)!;
    if (!outMap.has(link.fromObjectiveId)) outMap.set(link.fromObjectiveId, []);
    outMap.get(link.fromObjectiveId)!.push(link);
    if (!inMap.has(link.toObjectiveId)) inMap.set(link.toObjectiveId, []);
    inMap.get(link.toObjectiveId)!.push(link);
  }
  return { objectivesById, outByType, inByType };
}

// ---------------------------------------------------------------------------
// Cycle detection — only "contributes_to" edges are expected to form a DAG
// (an objective contributes upward to a parent/strategic goal). "blocks" is
// a dependency graph that can legitimately have mutual blocking in pathological
// cases but we still surface cycles there as a critical finding since a
// mutual block can never resolve. "duplicates"/"conflicts" are symmetric
// annotations, not hierarchy, so they are excluded from cycle detection.
// ---------------------------------------------------------------------------
export function detectCycles(
  graph: AlignmentGraph,
  linkType: ObjectiveLinkType = "contributes_to",
): string[][] {
  const outMap = graph.outByType.get(linkType) ?? new Map();
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];

  function dfs(nodeId: string) {
    visited.add(nodeId);
    inStack.add(nodeId);
    stack.push(nodeId);

    const edges = outMap.get(nodeId) ?? [];
    for (const edge of edges) {
      const next = edge.toObjectiveId;
      if (!visited.has(next)) {
        dfs(next);
      } else if (inStack.has(next)) {
        const cycleStart = stack.indexOf(next);
        cycles.push([...stack.slice(cycleStart), next]);
      }
    }

    stack.pop();
    inStack.delete(nodeId);
  }

  for (const id of graph.objectivesById.keys()) {
    if (!visited.has(id)) dfs(id);
  }
  return cycles;
}

// ---------------------------------------------------------------------------
// Orphan detection: a non-top-level (not north-star-aligned company
// objective) objective with no outgoing "contributes_to" edge and no
// parentId is disconnected from the strategy — it cannot be traced back to
// any higher-level outcome.
// ---------------------------------------------------------------------------
export function detectOrphanObjectives(graph: AlignmentGraph): ObjectiveNode[] {
  const outMap = graph.outByType.get("contributes_to") ?? new Map();
  const orphans: ObjectiveNode[] = [];
  for (const obj of graph.objectivesById.values()) {
    if (obj.isNorthStarAligned) continue; // top-level anchors are allowed to have no parent
    const hasContributesTo = (outMap.get(obj.id) ?? []).length > 0;
    const hasParent = Boolean(obj.parentId);
    if (!hasContributesTo && !hasParent) {
      orphans.push(obj);
    }
  }
  return orphans;
}

// ---------------------------------------------------------------------------
// Cascade completeness: does this objective have contributing KRs and
// initiatives, i.e. is the cascade from strategy -> measurement -> execution
// actually wired up?
// ---------------------------------------------------------------------------
export interface CascadeCompleteness {
  objectiveId: string;
  keyResultCount: number;
  initiativeCount: number;
  hasEvidence: boolean;
  completenessScore: number; // 0..1, equal weight across the 3 checks
  findings: Finding[];
}

export function cascadeCompletenessFor(
  objective: ObjectiveNode,
  keyResults: KeyResultInput[],
  initiatives: InitiativeNode[],
  evidence: EvidenceRefInput[],
): CascadeCompleteness {
  const krs = keyResults.filter((k) => k.objectiveId === objective.id);
  const inits = initiatives.filter((i) => i.objectiveId === objective.id);
  const krIds = new Set(krs.map((k) => k.id));
  const hasEvidence = evidence.some((e) => krIds.has(e.keyResultId));

  const checks = [krs.length > 0, inits.length > 0, hasEvidence];
  const completenessScore = checks.filter(Boolean).length / checks.length;

  const findings: Finding[] = [];
  if (krs.length === 0) {
    findings.push({
      id: `cascade-no-krs-${objective.id}`,
      kind: "cascade_no_key_results",
      severity: "critical",
      summary: `"${objective.title}" has no key results`,
      detail:
        "This objective has no contributing KRs, so it cannot have derived progress and cannot be scored.",
      relatedObjectiveIds: [objective.id],
      relatedInitiativeIds: [],
      evidenceRefIds: [],
    });
  }
  if (inits.length === 0) {
    findings.push({
      id: `cascade-no-initiatives-${objective.id}`,
      kind: "cascade_no_initiatives",
      severity: "warning",
      summary: `"${objective.title}" has no contributing initiatives`,
      detail: "No execution work is currently linked to this objective.",
      relatedObjectiveIds: [objective.id],
      relatedInitiativeIds: [],
      evidenceRefIds: [],
    });
  }
  if (krs.length > 0 && !hasEvidence) {
    findings.push({
      id: `cascade-no-evidence-${objective.id}`,
      kind: "cascade_no_evidence",
      severity: "warning",
      summary: `"${objective.title}" has key results with no evidence`,
      detail: "All progress on this objective is currently hand-asserted; none is evidence-derived.",
      relatedObjectiveIds: [objective.id],
      relatedInitiativeIds: [],
      evidenceRefIds: [],
    });
  }

  return {
    objectiveId: objective.id,
    keyResultCount: krs.length,
    initiativeCount: inits.length,
    hasEvidence,
    completenessScore,
    findings,
  };
}

// ---------------------------------------------------------------------------
// Link-integrity findings: dangling edges, self-links, "conflicts" edges
// between two still-active objectives.
// ---------------------------------------------------------------------------
export function linkIntegrityFindings(
  objectives: ObjectiveNode[],
  links: ObjectiveLinkEdge[],
): Finding[] {
  const ids = new Set(objectives.map((o) => o.id));
  const byId = new Map(objectives.map((o) => [o.id, o]));
  const findings: Finding[] = [];

  for (const link of links) {
    if (!ids.has(link.fromObjectiveId) || !ids.has(link.toObjectiveId)) {
      findings.push({
        id: `dangling-link-${link.id}`,
        kind: "dangling_link",
        severity: "critical",
        summary: "Alignment link references a missing objective",
        detail: `Link ${link.id} (${link.linkType}) references an objective id that does not exist.`,
        relatedObjectiveIds: [link.fromObjectiveId, link.toObjectiveId].filter((id) => ids.has(id)),
        relatedInitiativeIds: [],
        evidenceRefIds: [],
      });
      continue;
    }
    if (link.fromObjectiveId === link.toObjectiveId) {
      findings.push({
        id: `self-link-${link.id}`,
        kind: "self_link",
        severity: "warning",
        summary: "Objective links to itself",
        detail: `Objective ${link.fromObjectiveId} has a "${link.linkType}" link to itself.`,
        relatedObjectiveIds: [link.fromObjectiveId],
        relatedInitiativeIds: [],
        evidenceRefIds: [],
      });
    }
    if (link.linkType === "conflicts") {
      const a = byId.get(link.fromObjectiveId);
      const b = byId.get(link.toObjectiveId);
      if (a?.status === "active" && b?.status === "active") {
        findings.push({
          id: `conflict-${link.id}`,
          kind: "objective_conflict",
          severity: "critical",
          summary: `"${a.title}" conflicts with "${b.title}"`,
          detail:
            "Both objectives are active and marked as conflicting. This usually means competing priorities across owners that need an explicit executive tie-break.",
          relatedObjectiveIds: [a.id, b.id],
          relatedInitiativeIds: [],
          evidenceRefIds: [],
        });
      }
    }
  }

  const cycles = detectCycles(buildGraph(objectives, links), "contributes_to");
  for (const cycle of cycles) {
    findings.push({
      id: `cycle-${cycle.join("-")}`,
      kind: "contributes_to_cycle",
      severity: "critical",
      summary: "Cycle detected in the contributes_to graph",
      detail: `Objectives form a cycle and can never resolve to a top-level outcome: ${cycle
        .map((id) => byId.get(id)?.title ?? id)
        .join(" -> ")}`,
      relatedObjectiveIds: cycle,
      relatedInitiativeIds: [],
      evidenceRefIds: [],
    });
  }

  const orphans = detectOrphanObjectives(buildGraph(objectives, links));
  for (const orphan of orphans) {
    findings.push({
      id: `orphan-${orphan.id}`,
      kind: "orphan_objective",
      severity: "warning",
      summary: `"${orphan.title}" is not connected to the strategy tree`,
      detail: "This objective has no parent and no contributes_to link to any other objective.",
      relatedObjectiveIds: [orphan.id],
      relatedInitiativeIds: [],
      evidenceRefIds: [],
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Capacity conflict detection (stand-in for Part 06's digital twin): two
// initiatives on the same team requiring the same scarce skill, with
// overlapping date windows, whose combined required hours/week exceed the
// team's declared capacity.
// ---------------------------------------------------------------------------
function rangesOverlap(aStart: string | null, aEnd: string | null, bStart: string | null, bEnd: string | null): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return true; // undated => assume concurrent, conservative
  const as = new Date(aStart).getTime();
  const ae = new Date(aEnd).getTime();
  const bs = new Date(bStart).getTime();
  const be = new Date(bEnd).getTime();
  return as <= be && bs <= ae;
}

export function detectCapacityConflicts(
  initiatives: InitiativeNode[],
  teams: TeamNode[],
): Finding[] {
  const findings: Finding[] = [];
  const teamsById = new Map(teams.map((t) => [t.id, t]));

  const byTeamSkill = new Map<string, InitiativeNode[]>();
  for (const init of initiatives) {
    if (!init.teamId || !init.requiredSkill) continue;
    if (init.status === "done" || init.status === "cancelled") continue;
    const key = `${init.teamId}::${init.requiredSkill}`;
    if (!byTeamSkill.has(key)) byTeamSkill.set(key, []);
    byTeamSkill.get(key)!.push(init);
  }

  for (const [key, group] of byTeamSkill) {
    const [teamId, skill] = key.split("::");
    const team = teamsById.get(teamId);
    if (!team || group.length < 2) continue;

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (!rangesOverlap(a.startDate, a.targetEndDate, b.startDate, b.targetEndDate)) continue;
        const combinedHours = a.requiredHoursPerWeek + b.requiredHoursPerWeek;
        if (combinedHours > team.capacityHoursPerWeek) {
          findings.push({
            id: `capacity-conflict-${a.id}-${b.id}`,
            kind: "capacity_conflict",
            severity: "critical",
            summary: `"${a.title}" and "${b.title}" compete for ${skill} on ${team.name}`,
            detail: `Combined demand of ${combinedHours}h/week exceeds ${team.name}'s capacity of ${team.capacityHoursPerWeek}h/week for overlapping date ranges. Assumption: hour estimates come from requiredHoursPerWeek on each initiative; this is a simplified stand-in for Part 06's digital twin.`,
            relatedObjectiveIds: [],
            relatedInitiativeIds: [a.id, b.id],
            evidenceRefIds: [],
          });
        }
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Strategy path query: objective -> initiatives -> teams -> metrics (KRs +
// their latest evidence).
// ---------------------------------------------------------------------------
export interface StrategyPathInitiative {
  initiative: InitiativeNode;
  team: TeamNode | null;
  milestoneCount: number;
}

export interface StrategyPathResult {
  objective: ObjectiveNode;
  ancestors: ObjectiveNode[]; // via contributes_to, closest first
  keyResults: KeyResultInput[];
  initiatives: StrategyPathInitiative[];
  latestEvidenceByKeyResultId: Record<string, EvidenceRefInput | null>;
}

export function strategyPath(
  objectiveId: string,
  objectives: ObjectiveNode[],
  links: ObjectiveLinkEdge[],
  keyResults: KeyResultInput[],
  initiatives: InitiativeNode[],
  teams: TeamNode[],
  milestones: MilestoneNode[],
  evidence: EvidenceRefInput[],
): StrategyPathResult | null {
  const graph = buildGraph(objectives, links);
  const objective = graph.objectivesById.get(objectiveId);
  if (!objective) return null;

  // Walk contributes_to edges upward (this objective contributes_to X, X
  // contributes_to Y, ...), stopping on cycles.
  const ancestors: ObjectiveNode[] = [];
  const seen = new Set([objectiveId]);
  let cursor = objectiveId;
  const outMap = graph.outByType.get("contributes_to") ?? new Map();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const edges = outMap.get(cursor) ?? [];
    if (edges.length === 0) break;
    const nextId = edges[0].toObjectiveId;
    if (seen.has(nextId)) break;
    const nextObj = graph.objectivesById.get(nextId);
    if (!nextObj) break;
    ancestors.push(nextObj);
    seen.add(nextId);
    cursor = nextId;
  }

  const krs = keyResults.filter((k) => k.objectiveId === objectiveId);
  const inits = initiatives.filter((i) => i.objectiveId === objectiveId);
  const teamsById = new Map(teams.map((t) => [t.id, t]));

  const strategyInits: StrategyPathInitiative[] = inits.map((init) => ({
    initiative: init,
    team: init.teamId ? teamsById.get(init.teamId) ?? null : null,
    milestoneCount: milestones.filter((m) => m.initiativeId === init.id).length,
  }));

  const latestEvidenceByKeyResultId: Record<string, EvidenceRefInput | null> = {};
  for (const kr of krs) {
    const refs = evidence.filter((e) => e.keyResultId === kr.id);
    latestEvidenceByKeyResultId[kr.id] =
      refs.length === 0
        ? null
        : refs.reduce((latest, r) => (new Date(r.observedAt) > new Date(latest.observedAt) ? r : latest));
  }

  return {
    objective,
    ancestors,
    keyResults: krs,
    initiatives: strategyInits,
    latestEvidenceByKeyResultId,
  };
}
