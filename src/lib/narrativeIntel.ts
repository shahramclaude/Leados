// src/lib/narrativeIntel.ts
// -----------------------------------------------------------------------
// LEADOS Part 9 — Narrative Intelligence.
//
// Turns the raw knowledge graph into human-readable organizational story:
// a narrative of "what happened", an explanation of "why did this finding
// happen", and a weekly briefing document — all derived from graph data,
// nothing hand-authored.
// -----------------------------------------------------------------------
import type { GraphSubgraph, MemoryNode, RelationType } from "./knowledgeGraph";

export interface TimeRange {
  from: Date;
  to: Date;
}

export interface Chapter {
  theme: string;
  summary: string;
  events: string[];
}

export interface OrgNarrative {
  headline: string;
  chapters: Chapter[];
  keyActors: string[];
  keyDecisions: string[];
  openThreads: string[];
}

export interface FindingExplanation {
  rootCauses: string[];
  contributingFactors: string[];
  timeline: string[];
  relatedPeople: string[];
  relatedDecisions: string[];
}

export interface OrgState {
  openFindingsBySeverity: Record<number, number>;
  recentDecisions: { title: string; domain: string; createdAt: Date }[];
  peopleCount: number;
  metricsTrend: { name: string; direction: "up" | "down" | "flat" }[];
}

export interface WeeklyBriefing {
  date: string;
  executiveSummary: string;
  topPriorities: string[];
  keyRisks: string[];
  decisionsNeeded: string[];
  teamPulse: string;
  forwardLook: string;
}

const KNOWN_DOMAINS = ["People", "Finance", "Product", "Sales", "Operations", "General"];

function inRange(ts: Date | string, range: TimeRange): boolean {
  const t = new Date(ts).getTime();
  return t >= range.from.getTime() && t <= range.to.getTime();
}

function domainOf(n: MemoryNode): string {
  return n.tags.find((t) => KNOWN_DOMAINS.includes(t)) ?? (n.type === "person" ? "People" : "General");
}

// -------------------------------------------------------------------------
// buildOrgNarrative
// -------------------------------------------------------------------------

export function buildOrgNarrative(graph: GraphSubgraph, timeRange: TimeRange): OrgNarrative {
  const nodesInRange = graph.nodes.filter((n) => inRange(n.createdAt, timeRange));
  const edgesInRange = graph.edges.filter((e) => inRange(e.createdAt, timeRange));
  const edgeIdsInRange = new Set(edgesInRange.map((e) => e.id));

  const byDomain = new Map<string, MemoryNode[]>();
  for (const n of nodesInRange) {
    const d = domainOf(n);
    if (!byDomain.has(d)) byDomain.set(d, []);
    byDomain.get(d)!.push(n);
  }

  const chapters: Chapter[] = [...byDomain.entries()]
    .filter(([, nodes]) => nodes.length > 0)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([theme, nodes]) => {
      const decisions = nodes.filter((n) => n.type === "decision");
      const findings = nodes.filter((n) => n.type === "finding");
      const metrics = nodes.filter((n) => n.type === "metric");
      const summaryParts: string[] = [];
      if (decisions.length) summaryParts.push(`${decisions.length} decision(s) were made`);
      if (findings.length) summaryParts.push(`${findings.length} finding(s) surfaced`);
      if (metrics.length) summaryParts.push(`${metrics.length} metric(s) moved`);
      return {
        theme,
        summary: summaryParts.length ? `In ${theme}, ${summaryParts.join(", ")}.` : `${nodes.length} item(s) were logged in ${theme}.`,
        events: nodes
          .slice()
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 8)
          .map((n) => `[${n.type}] ${n.label}`),
      };
    });

  const degreeInRange = new Map<number, number>();
  for (const e of edgesInRange) {
    degreeInRange.set(e.fromNodeId, (degreeInRange.get(e.fromNodeId) ?? 0) + 1);
    degreeInRange.set(e.toNodeId, (degreeInRange.get(e.toNodeId) ?? 0) + 1);
  }
  const keyActors = [...degreeInRange.entries()]
    .map(([id, deg]) => ({ node: graph.nodes.find((n) => n.id === id), deg }))
    .filter((x): x is { node: MemoryNode; deg: number } => x.node?.type === "person")
    .sort((a, b) => b.deg - a.deg)
    .slice(0, 5)
    .map((x) => x.node.label);

  const keyDecisions = nodesInRange
    .filter((n) => n.type === "decision")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6)
    .map((n) => n.label);

  const resolvedTargets = new Set(graph.edges.filter((e) => e.relation === "resolved").map((e) => e.toNodeId));
  const openThreads = nodesInRange
    .filter((n) => (n.type === "finding" || n.type === "insight") && !resolvedTargets.has(n.id))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8)
    .map((n) => `${n.type === "finding" ? "Open finding" : "Open insight"}: ${n.label}`);

  void edgeIdsInRange;
  const totalDecisions = nodesInRange.filter((n) => n.type === "decision").length;
  const totalFindings = nodesInRange.filter((n) => n.type === "finding").length;

  const headline =
    nodesInRange.length === 0
      ? "No significant organizational activity was recorded in this period."
      : `Across ${byDomain.size} domain(s), the org logged ${totalDecisions} decision(s) and ${totalFindings} finding(s)${
          keyActors[0] ? `, led by ${keyActors[0]}` : ""
        }${openThreads.length ? `, leaving ${openThreads.length} thread(s) still open` : ""}.`;

  return { headline, chapters, keyActors, keyDecisions, openThreads };
}

// -------------------------------------------------------------------------
// explainFinding
// -------------------------------------------------------------------------

export function explainFinding(finding: MemoryNode, graph: GraphSubgraph): FindingExplanation {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const rootCauses: string[] = [];
  const contributingFactors: string[] = [];
  const relatedPeople = new Set<string>();
  const relatedDecisions = new Set<string>();
  const timelineEvents: { label: string; ts: Date }[] = [
    { label: `[finding] ${finding.label} logged`, ts: new Date(finding.createdAt) },
  ];

  const visited = new Set<number>([finding.id]);
  let frontier = graph.edges.filter((e) => e.toNodeId === finding.id).map((e) => ({ edge: e, hops: 1 }));

  while (frontier.length) {
    const next: typeof frontier = [];
    for (const { edge, hops } of frontier) {
      const srcNode = nodeMap.get(edge.fromNodeId);
      if (!srcNode || visited.has(srcNode.id)) continue;
      visited.add(srcNode.id);
      timelineEvents.push({ label: `[${srcNode.type}] ${srcNode.label} (${edge.relation})`, ts: new Date(srcNode.createdAt) });
      if (srcNode.type === "person") relatedPeople.add(srcNode.label);
      if (srcNode.type === "decision") relatedDecisions.add(srcNode.label);

      const relation = edge.relation as RelationType;
      if (relation === "caused" || relation === "triggered" || relation === "escalated") {
        rootCauses.push(`${srcNode.label} (${srcNode.type}) — ${edge.evidence || relation}`);
      } else if (relation === "informed" || relation === "modified") {
        contributingFactors.push(`${srcNode.label} (${srcNode.type}) — ${edge.evidence || relation}`);
      }

      if (hops < 2) {
        const further = graph.edges.filter((e2) => e2.toNodeId === srcNode.id);
        for (const e2 of further) next.push({ edge: e2, hops: hops + 1 });
      }
    }
    frontier = next;
  }

  const resolutionEdges = graph.edges.filter(
    (e) => (e.fromNodeId === finding.id || e.toNodeId === finding.id) && e.relation === "resolved",
  );
  for (const e of resolutionEdges) {
    const other = nodeMap.get(e.fromNodeId === finding.id ? e.toNodeId : e.fromNodeId);
    if (other) {
      timelineEvents.push({ label: `[${other.type}] ${other.label} (resolved)`, ts: new Date(other.createdAt) });
      if (other.type === "decision") relatedDecisions.add(other.label);
      if (other.type === "person") relatedPeople.add(other.label);
    }
  }

  timelineEvents.sort((a, b) => a.ts.getTime() - b.ts.getTime());

  return {
    rootCauses: rootCauses.length
      ? [...new Set(rootCauses)]
      : ["No direct cause is recorded in the knowledge graph yet — this finding currently has no incoming causal edges."],
    contributingFactors: [...new Set(contributingFactors)],
    timeline: timelineEvents.map((e) => `${e.ts.toISOString().slice(0, 10)} — ${e.label}`),
    relatedPeople: [...relatedPeople],
    relatedDecisions: [...relatedDecisions],
  };
}

// -------------------------------------------------------------------------
// generateWeeklyBriefing
// -------------------------------------------------------------------------

export function generateWeeklyBriefing(state: OrgState, graph: GraphSubgraph, today: Date): WeeklyBriefing {
  const weekAgo = new Date(today.getTime() - 7 * 24 * 3600 * 1000);
  const narrative = buildOrgNarrative(graph, { from: weekAgo, to: today });

  const totalOpen = Object.values(state.openFindingsBySeverity).reduce((a, b) => a + b, 0);
  const critical = state.openFindingsBySeverity[5] ?? 0;
  const high = state.openFindingsBySeverity[4] ?? 0;

  const executiveSummary = `${narrative.headline} There are currently ${totalOpen} open finding(s) across the org${
    critical || high ? `, including ${critical} critical and ${high} high-severity item(s) requiring attention` : ""
  }.`;

  const resolvedTargets = new Set(graph.edges.filter((e) => e.relation === "resolved").map((e) => e.toNodeId));
  const openCriticalFindings = graph.nodes
    .filter((n) => n.type === "finding" && (n.tags.includes("sev-5") || n.tags.includes("sev-4")) && !resolvedTargets.has(n.id))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const topPriorities = openCriticalFindings.slice(0, 5).map((n) => `Resolve: ${n.label}`);
  if (topPriorities.length === 0) topPriorities.push("No critical/high-severity findings open — maintain current cadence.");

  const keyRisks = openCriticalFindings.slice(0, 5).map((n) => {
    const days = Math.max(0, Math.round((today.getTime() - new Date(n.createdAt).getTime()) / 86400000));
    return `${n.label} — unresolved for ${days} day(s)`;
  });

  const decisionsNeeded = openCriticalFindings
    .filter((n) => !graph.edges.some((e) => e.toNodeId === n.id && e.relation === "created" && e.fromNodeId !== n.id))
    .slice(0, 5)
    .map((n) => `A decision is needed on: ${n.label}`);

  const teamPulse = `${state.peopleCount} active contributor(s) logged activity this period across ${narrative.chapters.length} domain(s). Key actors: ${
    narrative.keyActors.slice(0, 3).join(", ") || "none logged"
  }.`;

  const risingMetrics = state.metricsTrend.filter((m) => m.direction === "up").map((m) => m.name);
  const fallingMetrics = state.metricsTrend.filter((m) => m.direction === "down").map((m) => m.name);
  const forwardLookParts: string[] = [`${narrative.openThreads.length} thread(s) remain open.`];
  if (risingMetrics.length) forwardLookParts.push(`Momentum building in ${risingMetrics.join(", ")}.`);
  if (fallingMetrics.length) forwardLookParts.push(`Watch ${fallingMetrics.join(", ")} — trending down.`);
  if (!risingMetrics.length && !fallingMetrics.length && narrative.openThreads.length === 0) {
    forwardLookParts.push("No major shifts anticipated; steady state.");
  }

  return {
    date: today.toISOString().slice(0, 10),
    executiveSummary,
    topPriorities,
    keyRisks,
    decisionsNeeded: decisionsNeeded.length ? decisionsNeeded : ["No pending decisions blocking critical items."],
    teamPulse,
    forwardLook: forwardLookParts.join(" "),
  };
}
