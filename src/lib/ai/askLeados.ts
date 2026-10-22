// =============================================================================
// LEADOS — Part 11: Ask-LEADOS
// =============================================================================
// Query -> grounded answer with inline citation chips, or an explicit
// abstention naming what evidence would be needed. Retrieval happens BEFORE
// any model call; the model (or deterministic composer) only narrates what
// retrieval+grounding already found.
// =============================================================================

import { fetchFullGroundingSet, narrowGroundingSet } from "./groundingFetcher";
import { retrieveRelevantChunks } from "./ragRetrieval";
import { generateGrounded } from "./groundedGeneration";
import type { ClaimSpec, GenerationResult, GroundingSet, NarrativeMode, PhaseEvent } from "./types";

const STOPWORDS = new Set(["the", "a", "an", "is", "are", "was", "were", "what", "which", "who", "how", "did", "does", "do", "of", "in", "on", "for", "to", "and", "or", "this", "that", "has", "have", "had", "with", "by", "at", "as"]);

// Questions using these words are treated as deliberately broad ("what's new
// overall") even when they name no specific entity — they legitimately scope
// to the full org grounding set rather than triggering abstention.
const BROAD_RECAP_KEYWORDS = new Set(["recent", "recently", "changes", "changed", "summary", "overview", "update", "updates", "happened", "happening", "status", "briefing", "everything", "org", "company", "portfolio"]);

function extractKeywords(question: string): string[] {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function isBroadRecapQuestion(keywords: string[]): boolean {
  return keywords.some((k) => BROAD_RECAP_KEYWORDS.has(k));
}

function buildClaimsFromNarrowedSet(set: GroundingSet): ClaimSpec[] {
  const claims: ClaimSpec[] = [];
  let priority = 0;
  for (const m of set.metrics) {
    if (m.previousValue !== null) {
      claims.push({
        id: `metric-delta-${m.id}`,
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
        whyShown: `Matched your question to the ${m.name} metric for ${m.entityName ?? "this entity"}.`,
      });
    } else {
      claims.push({
        id: `metric-level-${m.id}`,
        templateId: "metric_level",
        refs: [m.ref],
        priority: priority++,
        data: { metricName: m.name, entityName: m.entityName, value: m.value, unit: m.unit ?? "" },
        whyShown: `Matched your question to the ${m.name} metric for ${m.entityName ?? "this entity"}.`,
      });
    }
  }
  for (const e of set.events) {
    claims.push({
      id: `event-${e.id}`,
      templateId: "event",
      refs: [e.ref],
      priority: priority++,
      data: { title: e.title, entityName: e.entityName, type: e.type, occurredAtLabel: new Date(e.occurredAt).toLocaleDateString(), description: e.description },
      whyShown: `Matched your question to a ${e.type} event for ${e.entityName ?? "this entity"}.`,
    });
  }
  for (const d of set.documents) {
    claims.push({
      id: `doc-${d.ref}`,
      templateId: "doc_quote",
      refs: [d.ref],
      priority: priority++,
      data: { title: d.title, snippet: d.text.slice(0, 280) },
      whyShown: `This note/document (source: ${d.sourceType}) was retrieved as the closest textual match to your question.`,
    });
  }
  return claims;
}

export interface AskResult {
  question: string;
  mode: NarrativeMode;
  generation: GenerationResult;
  costBadge?: { tier: string; provider: string; costCents: number; cacheHit: boolean };
}

export async function askLeados(params: {
  orgId: number;
  userId: number | null;
  question: string;
  timeframe: { start: Date; end: Date };
  mode?: NarrativeMode;
  taskId?: string;
  onPhase?: (e: PhaseEvent) => void;
  devCostBadge?: boolean;
}): Promise<AskResult> {
  const mode = params.mode ?? "executive";
  params.onPhase?.({ phase: "retrieve", message: "Resolving entities/events/metrics for this question.", at: Date.now() });

  const fullSet = await fetchFullGroundingSet(params.orgId, params.timeframe, params.question);
  const keywords = extractKeywords(params.question);
  const keywordNarrowed = narrowGroundingSet(fullSet, keywords);
  const hasSpecificMatch = keywordNarrowed.entities.length > 0 || keywordNarrowed.events.length > 0 || keywordNarrowed.metrics.length > 0;
  const broadRecap = isBroadRecapQuestion(keywords);

  // Graph-expansion signal for retrieval uses only the keyword-matched
  // (pre-fallback) entities, so an unrelated question doesn't spuriously
  // "boost" every document that happens to mention a known company name.
  const retrievedDocs = await retrieveRelevantChunks(params.orgId, params.question, keywordNarrowed);

  let narrowed: GroundingSet;
  if (hasSpecificMatch) {
    narrowed = { ...keywordNarrowed, documents: retrievedDocs };
  } else if (broadRecap) {
    // Generic recap question ("what changed recently?") — legitimately scope
    // to the full org grounding set rather than abstaining.
    narrowed = { ...fullSet, documents: retrievedDocs };
  } else if (retrievedDocs.length > 0) {
    // No structured match, but retrieval found something lexically/graph
    // relevant — scope to that evidence only (still cite-or-refuse safe).
    narrowed = { ...keywordNarrowed, documents: retrievedDocs };
  } else {
    // No entity/metric/event match, not a broad recap, and retrieval found
    // nothing relevant: there is genuinely no evidence for this question.
    // Abstain rather than dumping the full org's data as a non-answer.
    narrowed = { ...keywordNarrowed, entities: [], events: [], metrics: [], documents: [] };
  }

  const claims = buildClaimsFromNarrowedSet(narrowed);

  const generation = await generateGrounded({
    feature: "ask",
    modelCardId: "ask-leados.v1",
    orgId: params.orgId,
    userId: params.userId,
    mode,
    claims,
    groundingSet: narrowed,
    userQuestion: params.question,
    untrustedContext: retrievedDocs,
    abstainIfNoClaims: true,
    taskId: params.taskId,
    onPhase: params.onPhase,
  });

  const result: AskResult = { question: params.question, mode, generation };
  if (params.devCostBadge) {
    result.costBadge = { tier: generation.tier, provider: generation.provider, costCents: generation.costCents, cacheHit: generation.cacheHit };
  }
  return result;
}
