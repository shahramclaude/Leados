// Strategy brief generator: weekly, real-deltas-only. Diffs the current
// portfolio snapshot against the previous stored snapshot and reports only
// what actually changed: new blockers, PERT date shifts > 3 days, WSJF rank
// changes, and drift findings. Narrative rendering goes through
// `renderBriefNarrative`, a minimal stand-in for Part 11's language layer
// (not present in this sandbox's repository — see AI-SESSION-LOG.md), and is
// checked with the Part 08 citation-lint stand-in before being returned.
import { computeCriticalPath, deliveryDateDistribution } from "./portfolioMath";
import { rankInitiatives } from "./initiativesEngine";
import { findDrift } from "./driftRadar";
import { extractNumberTokens, lintCitations, type Citation, type CitationLintResult } from "./citationLint";
import type {
  EvidenceRefInput,
  Finding,
  InitiativeNode,
  KeyResultInput,
  MilestoneNode,
  ObjectiveLinkEdge,
  ObjectiveNode,
} from "./strategyModels";

export interface SnapshotInitiative {
  id: string;
  title: string;
  status: InitiativeNode["status"];
  wsjf: number;
  rank: number; // 1-based, 1 = highest priority
  p50Date: string | null;
}

export interface StrategySnapshot {
  generatedAt: string;
  initiatives: SnapshotInitiative[];
  driftFindingIds: string[];
}

export function buildSnapshot(
  initiatives: InitiativeNode[],
  milestones: MilestoneNode[],
  objectives: ObjectiveNode[],
  keyResults: KeyResultInput[],
  evidence: EvidenceRefInput[],
  defaultStartDate: string,
): StrategySnapshot {
  const ranked = rankInitiatives(initiatives);
  const snapshotInitiatives: SnapshotInitiative[] = ranked.map((r, idx) => {
    const path = computeCriticalPath(r.initiative.id, milestones);
    const dist =
      path.path.length > 0
        ? deliveryDateDistribution(r.initiative.startDate ?? defaultStartDate, path.totalTe, path.totalVariance)
        : null;
    return {
      id: r.initiative.id,
      title: r.initiative.title,
      status: r.initiative.status,
      wsjf: r.wsjf,
      rank: idx + 1,
      p50Date: dist?.p50 ?? null,
    };
  });

  const drift = findDrift(objectives, keyResults, evidence);

  return {
    generatedAt: new Date().toISOString(),
    initiatives: snapshotInitiatives,
    driftFindingIds: drift.map((f) => f.id),
  };
}

export interface BriefDelta {
  newBlockers: { initiativeId: string; title: string }[];
  pertShifts: { initiativeId: string; title: string; beforeP50: string; afterP50: string; deltaDays: number }[];
  wsjfRankChanges: { initiativeId: string; title: string; beforeRank: number; afterRank: number; wsjf: number }[];
  newDriftFindingIds: string[];
}

const PERT_SHIFT_THRESHOLD_DAYS = 3;

export function diffSnapshots(prev: StrategySnapshot | null, curr: StrategySnapshot): BriefDelta {
  if (!prev) {
    return { newBlockers: [], pertShifts: [], wsjfRankChanges: [], newDriftFindingIds: curr.driftFindingIds };
  }

  const prevById = new Map(prev.initiatives.map((i) => [i.id, i]));
  const newBlockers: BriefDelta["newBlockers"] = [];
  const pertShifts: BriefDelta["pertShifts"] = [];
  const wsjfRankChanges: BriefDelta["wsjfRankChanges"] = [];

  for (const curInit of curr.initiatives) {
    const prevInit = prevById.get(curInit.id);
    if (!prevInit) continue;

    if (curInit.status === "blocked" && prevInit.status !== "blocked") {
      newBlockers.push({ initiativeId: curInit.id, title: curInit.title });
    }

    if (prevInit.p50Date && curInit.p50Date) {
      const deltaDays =
        (new Date(curInit.p50Date).getTime() - new Date(prevInit.p50Date).getTime()) / (1000 * 60 * 60 * 24);
      if (Math.abs(deltaDays) > PERT_SHIFT_THRESHOLD_DAYS) {
        pertShifts.push({
          initiativeId: curInit.id,
          title: curInit.title,
          beforeP50: prevInit.p50Date,
          afterP50: curInit.p50Date,
          deltaDays: Math.round(deltaDays * 10) / 10,
        });
      }
    }

    if (prevInit.rank !== curInit.rank) {
      wsjfRankChanges.push({
        initiativeId: curInit.id,
        title: curInit.title,
        beforeRank: prevInit.rank,
        afterRank: curInit.rank,
        wsjf: Math.round(curInit.wsjf * 100) / 100,
      });
    }
  }

  const prevDriftIds = new Set(prev.driftFindingIds);
  const newDriftFindingIds = curr.driftFindingIds.filter((id) => !prevDriftIds.has(id));

  return { newBlockers, pertShifts, wsjfRankChanges, newDriftFindingIds };
}

/**
 * Minimal template-based narrative renderer. STAND-IN for Part 11's language
 * layer (not present in this sandbox): a real implementation would vary
 * phrasing, tone, and length; this one is deliberately mechanical so every
 * number it prints has a 1:1 citation, which is all Phase 4 Gate 4 requires.
 */
export function renderBriefNarrative(
  delta: BriefDelta,
  driftFindings: Finding[],
  periodStart: string,
  periodEnd: string,
): { text: string; citations: Citation[] } {
  const lines: string[] = [];
  const citations: Citation[] = [];

  lines.push(`Strategy brief: ${periodStart.slice(0, 10)} to ${periodEnd.slice(0, 10)}.`);

  if (delta.newBlockers.length === 0 && delta.pertShifts.length === 0 && delta.wsjfRankChanges.length === 0 && driftFindings.length === 0) {
    citations.push({
      id: "policy-pert-threshold",
      label: "PERT shift materiality threshold (policy constant)",
      sourceType: "metric",
      sourceId: "policy",
      value: PERT_SHIFT_THRESHOLD_DAYS,
    });
    lines.push(
      `No material changes this period: no new blockers, no PERT date shifts over ${PERT_SHIFT_THRESHOLD_DAYS} days, no WSJF rank changes, and no new drift findings.`,
    );
    return { text: lines.join("\n"), citations };
  }

  if (delta.newBlockers.length > 0) {
    citations.push({
      id: "count-blockers",
      label: "Count of new blockers this period",
      sourceType: "initiative",
      sourceId: "aggregate",
      value: delta.newBlockers.length,
    });
    lines.push(`New blockers (${delta.newBlockers.length}):`);
    for (const b of delta.newBlockers) {
      lines.push(`- "${b.title}" is now blocked.`);
      citations.push({ id: `blocker-${b.initiativeId}`, label: `${b.title} blocked status`, sourceType: "initiative", sourceId: b.initiativeId, value: 1 });
    }
  }

  if (delta.pertShifts.length > 0) {
    citations.push({
      id: "policy-pert-threshold",
      label: "PERT shift materiality threshold (policy constant)",
      sourceType: "metric",
      sourceId: "policy",
      value: PERT_SHIFT_THRESHOLD_DAYS,
    });
    citations.push({
      id: "count-pert-shifts",
      label: "Count of PERT date shifts this period",
      sourceType: "milestone",
      sourceId: "aggregate",
      value: delta.pertShifts.length,
    });
    lines.push(`Delivery date shifts over ${PERT_SHIFT_THRESHOLD_DAYS} days (${delta.pertShifts.length}):`);
    for (const s of delta.pertShifts) {
      const direction = s.deltaDays > 0 ? "slipped" : "pulled in";
      lines.push(
        `- "${s.title}" P50 delivery ${direction} by ${Math.abs(s.deltaDays)} days (from ${s.beforeP50.slice(0, 10)} to ${s.afterP50.slice(0, 10)}).`,
      );
      citations.push({
        id: `pert-shift-${s.initiativeId}`,
        label: `${s.title} PERT P50 shift`,
        sourceType: "milestone",
        sourceId: s.initiativeId,
        value: Math.abs(s.deltaDays),
      });
    }
  }

  if (delta.wsjfRankChanges.length > 0) {
    citations.push({
      id: "count-wsjf-changes",
      label: "Count of WSJF rank changes this period",
      sourceType: "wsjf_rank",
      sourceId: "aggregate",
      value: delta.wsjfRankChanges.length,
    });
    lines.push(`WSJF rank changes (${delta.wsjfRankChanges.length}):`);
    for (const r of delta.wsjfRankChanges) {
      lines.push(`- "${r.title}" moved from rank ${r.beforeRank} to rank ${r.afterRank} (WSJF ${r.wsjf}).`);
      citations.push({ id: `rank-before-${r.initiativeId}`, label: `${r.title} previous rank`, sourceType: "wsjf_rank", sourceId: r.initiativeId, value: r.beforeRank });
      citations.push({ id: `rank-after-${r.initiativeId}`, label: `${r.title} new rank`, sourceType: "wsjf_rank", sourceId: r.initiativeId, value: r.afterRank });
      citations.push({ id: `wsjf-${r.initiativeId}`, label: `${r.title} current WSJF`, sourceType: "wsjf_rank", sourceId: r.initiativeId, value: r.wsjf });
    }
  }

  if (driftFindings.length > 0) {
    citations.push({
      id: "count-drift-findings",
      label: "Count of new drift findings this period",
      sourceType: "finding",
      sourceId: "aggregate",
      value: driftFindings.length,
    });
    lines.push(`New drift findings (${driftFindings.length}):`);
    for (const f of driftFindings) {
      lines.push(`- ${f.summary}`);
      citations.push({ id: `finding-${f.id}`, label: f.summary, sourceType: "finding", sourceId: f.id, value: 1 });
      // The finding itself is the citable source for any number embedded in
      // its own summary text (e.g. "...disagrees with evidence by 23 pts").
      // This keeps the citation lint honest without requiring every Finding
      // producer to pre-declare which numbers it will ever print.
      for (const n of extractNumberTokens(f.summary)) {
        citations.push({ id: `finding-${f.id}-num-${n}`, label: `${f.summary} (embedded figure)`, sourceType: "finding", sourceId: f.id, value: n });
      }
    }
  }

  lines.push(
    "All figures above are recommendations/observations derived from current data; they are not guarantees of future delivery dates or outcomes.",
  );

  return { text: lines.join("\n"), citations };
}

export interface WeeklyBriefResult {
  periodStart: string;
  periodEnd: string;
  snapshot: StrategySnapshot;
  delta: BriefDelta;
  narrativeText: string;
  citations: Citation[];
  lint: CitationLintResult;
}

export function generateWeeklyBrief(params: {
  prevSnapshot: StrategySnapshot | null;
  initiatives: InitiativeNode[];
  milestones: MilestoneNode[];
  objectives: ObjectiveNode[];
  keyResults: KeyResultInput[];
  evidence: EvidenceRefInput[];
  links: ObjectiveLinkEdge[];
  periodStart: string;
  periodEnd: string;
  defaultStartDate: string;
}): WeeklyBriefResult {
  const snapshot = buildSnapshot(
    params.initiatives,
    params.milestones,
    params.objectives,
    params.keyResults,
    params.evidence,
    params.defaultStartDate,
  );
  const delta = diffSnapshots(params.prevSnapshot, snapshot);

  const allDrift = findDrift(params.objectives, params.keyResults, params.evidence);
  const newDriftFindings = allDrift.filter((f) => delta.newDriftFindingIds.includes(f.id));

  const { text, citations } = renderBriefNarrative(delta, newDriftFindings, params.periodStart, params.periodEnd);
  const lint = lintCitations(text, citations);

  return {
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    snapshot,
    delta,
    narrativeText: text,
    citations,
    lint,
  };
}
