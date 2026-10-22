// =============================================================================
// LEADOS — Part 11: Daily Briefing
// =============================================================================
// Real deltas only. Every item carries a "why you're seeing this" affordance
// and its own citations, in addition to the overall briefing-level lint.
// =============================================================================

import { fetchDeltaGroundingSet } from "./groundingFetcher";
import { generateGrounded } from "./groundedGeneration";
import type { ClaimSpec, GenerationResult, GroundingSet, NarrativeMode, PhaseEvent } from "./types";

export interface BriefingItem {
  id: string;
  text: string;
  citations: GenerationResult["citations"];
  whyShown: string;
  confidenceClass: GenerationResult["confidenceClass"];
}

export interface BriefingResult {
  generatedAt: string;
  timeframe: { start: string; end: string };
  mode: NarrativeMode;
  items: BriefingItem[];
  fullText: string;
  overall: GenerationResult;
}

function buildClaimsFromGroundingSet(set: GroundingSet): ClaimSpec[] {
  const claims: ClaimSpec[] = [];
  let priority = 0;

  for (const m of set.metrics) {
    if (m.previousValue === null) continue;
    claims.push({
      id: `metric-${m.id}`,
      templateId: "metric_delta",
      refs: [m.ref],
      priority: priority++,
      data: {
        metricName: m.name,
        entityName: m.entityName,
        value: m.value,
        previousValue: m.previousValue,
        unit: m.unit ?? "",
        deltaAbs: m.deltaAbs,
        deltaPct: m.deltaPct,
        periodLabel: new Date(m.periodEnd).toISOString().slice(0, 10),
      },
      whyShown: `${m.entityName ?? "This entity"}'s ${m.name} changed from ${m.previousValue} to ${m.value} within your briefing window (${new Date(m.periodStart).toLocaleDateString()}–${new Date(m.periodEnd).toLocaleDateString()}).`,
    });
  }

  for (const e of set.events) {
    claims.push({
      id: `event-${e.id}`,
      templateId: "event",
      refs: [e.ref],
      priority: priority++,
      data: {
        title: e.title,
        entityName: e.entityName,
        type: e.type,
        occurredAtLabel: new Date(e.occurredAt).toLocaleDateString(),
        description: e.description,
      },
      whyShown: `A new "${e.type}" event was recorded for ${e.entityName ?? "your org"} on ${new Date(e.occurredAt).toLocaleDateString()}, inside your briefing window.`,
    });
  }

  // Sort by importance-ish heuristic: events marked high/critical first, then metrics by |deltaPct|.
  claims.sort((a, b) => {
    const score = (c: ClaimSpec) => {
      if (c.templateId === "event") {
        const imp = String((c.data as any).type ?? "");
        return imp === "critical" ? 3 : imp === "high" ? 2 : 1;
      }
      return Math.abs(Number((c.data as any).deltaPct ?? 0)) / 20;
    };
    return score(b) - score(a);
  });
  claims.forEach((c, i) => (c.priority = i));

  return claims;
}

export async function generateDailyBriefing(params: {
  orgId: number;
  userId: number | null;
  timeframe: { start: Date; end: Date };
  mode?: NarrativeMode;
  taskId?: string;
  onPhase?: (e: PhaseEvent) => void;
}): Promise<BriefingResult> {
  const mode = params.mode ?? "executive";
  const groundingSet = await fetchDeltaGroundingSet(params.orgId, params.timeframe);
  const claims = buildClaimsFromGroundingSet(groundingSet);

  const generation = await generateGrounded({
    feature: "briefing",
    modelCardId: "briefing.v1",
    orgId: params.orgId,
    userId: params.userId,
    mode,
    claims,
    groundingSet,
    abstainIfNoClaims: true,
    taskId: params.taskId,
    onPhase: params.onPhase,
  });

  // Re-derive per-item view by matching each claim's citation span back to its claim id via ref.
  const items: BriefingItem[] = [];
  if (!generation.abstained) {
    for (const claim of claims) {
      const matchingCitations = generation.citations.filter((c) => claim.refs.includes(c.ref));
      if (matchingCitations.length === 0) continue;
      const span = matchingCitations[0].span;
      items.push({
        id: claim.id,
        text: generation.text.slice(span[0], span[1]),
        citations: matchingCitations,
        whyShown: claim.whyShown,
        confidenceClass: generation.confidenceClass,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    timeframe: groundingSet.timeframe,
    mode,
    items,
    fullText: generation.abstained ? "" : generation.text,
    overall: generation,
  };
}
