// =============================================================================
// LEADOS — Part 11: Insight Synthesis
// =============================================================================
// Pattern detection across findings is 100% deterministic/rule-based and runs
// BEFORE any model call. The model (or composer) only narrates patterns that
// were already found, each with every contributing evidence ref attached.
// =============================================================================

import { fetchFullGroundingSet } from "./groundingFetcher";
import { generateGrounded } from "./groundedGeneration";
import type { ClaimSpec, EventRef, GenerationResult, GroundingSet, MetricRef, NarrativeMode, PhaseEvent } from "./types";

const DECLINE_THRESHOLD_PCT = -5;

export function detectPatterns(set: GroundingSet): ClaimSpec[] {
  const claims: ClaimSpec[] = [];
  let priority = 0;

  const metricGroups = new Map<string, MetricRef[]>();
  for (const m of set.metrics) {
    if (m.deltaPct === null || m.deltaPct > DECLINE_THRESHOLD_PCT) continue;
    const arr = metricGroups.get(m.name) ?? [];
    arr.push(m);
    metricGroups.set(m.name, arr);
  }
  for (const [name, group] of metricGroups) {
    if (group.length < 2) continue;
    const parts = group.map((m) => `${m.entityName ?? "an entity"} (${m.deltaPct}%)`);
    const summary = `${group.length} entities show a decline in ${name.replace(/_/g, " ")} this period: ${parts.join(", ")}.`;
    claims.push({
      id: `pattern-decline-${name}`,
      templateId: "pattern_correlation",
      refs: group.map((m) => m.ref),
      priority: priority++,
      data: { summary },
      whyShown: `Detected because ${group.length} entities independently show a ${name.replace(/_/g, " ")} decline of ${Math.abs(DECLINE_THRESHOLD_PCT)}% or more in the same window.`,
    });
  }

  const eventGroups = new Map<string, EventRef[]>();
  for (const e of set.events) {
    const arr = eventGroups.get(e.type) ?? [];
    arr.push(e);
    eventGroups.set(e.type, arr);
  }
  for (const [type, group] of eventGroups) {
    if (group.length < 2) continue;
    const names = group.map((e) => e.entityName ?? "an entity").join(", ");
    const summary = `${group.length} ${type.replace(/_/g, " ")} events occurred in this window across: ${names}.`;
    claims.push({
      id: `pattern-event-${type}`,
      templateId: "pattern_correlation",
      refs: group.map((e) => e.ref),
      priority: priority++,
      data: { summary },
      whyShown: `Detected because ${group.length} ${type.replace(/_/g, " ")} events co-occurred in the same window.`,
    });
  }

  claims.forEach((c, i) => (c.priority = i));
  return claims;
}

export interface InsightItem {
  id: string;
  text: string;
  citations: GenerationResult["citations"];
  evidenceRefs: string[];
  whyShown: string;
  confidenceClass: GenerationResult["confidenceClass"];
}

export interface InsightSynthesisResult {
  generatedAt: string;
  timeframe: { start: string; end: string };
  mode: NarrativeMode;
  insights: InsightItem[];
  overall: GenerationResult;
}

export async function generateInsightSynthesis(params: {
  orgId: number;
  userId: number | null;
  timeframe: { start: Date; end: Date };
  mode?: NarrativeMode;
  taskId?: string;
  onPhase?: (e: PhaseEvent) => void;
}): Promise<InsightSynthesisResult> {
  const mode = params.mode ?? "analyst";
  const groundingSet = await fetchFullGroundingSet(params.orgId, params.timeframe);
  const claims = detectPatterns(groundingSet);

  const generation = await generateGrounded({
    feature: "insight",
    modelCardId: "insight-synthesis.v1",
    orgId: params.orgId,
    userId: params.userId,
    mode,
    claims,
    groundingSet,
    abstainIfNoClaims: true,
    taskId: params.taskId,
    onPhase: params.onPhase,
  });

  const insights: InsightItem[] = [];
  if (!generation.abstained) {
    for (const claim of claims) {
      const matchingCitations = generation.citations.filter((c) => claim.refs.includes(c.ref));
      if (matchingCitations.length === 0) continue;
      const span = matchingCitations[0].span;
      insights.push({
        id: claim.id,
        text: generation.text.slice(span[0], span[1]),
        citations: matchingCitations,
        evidenceRefs: claim.refs,
        whyShown: claim.whyShown,
        confidenceClass: generation.confidenceClass,
      });
    }
  }

  return { generatedAt: new Date().toISOString(), timeframe: groundingSet.timeframe, mode, insights, overall: generation };
}
