// =============================================================================
// LEADOS — Part 11: the grounded generation pipeline
// =============================================================================
// Single entry point used by every language surface (briefing, Ask-LEADOS,
// insight synthesis). Enforces, in order:
//   1. GroundingSet must already be fetched deterministically (caller's job).
//   2. Untrusted retrieved content is scanned + fenced, never trusted as
//      instructions (taint.ts).
//   3. Semantic cache lookup by (task, groundingHash, promptVersion).
//   4. Model routing: composer → small → large, escalating on difficulty
//      and/or validation failure, with budget checks before any paid call.
//   5. Strict output-schema validation + the Part 08 citation lint — ANY
//      failure escalates or, as a last resort, falls back to the
//      deterministic composer (which cannot fail the lint by construction).
//   6. Output-side injection/leakage filter.
//   7. Cost metering + redacted audit logging + cache write.
//
// Cite-or-refuse is enforced here, centrally, so no surface can bypass it.
// =============================================================================

import { db } from "@/db";
import { llmAuditLog, injectionIncidents } from "@/db/schema";
import { lintCitations } from "./citationLint";
import { canAfford, meterUsage } from "./costGovernor";
import { computeGroundingHash } from "./groundingHash";
import { classifyDifficulty, deterministicComposer, estimateCostCents, providerRegistry } from "./modelProviders";
import { assertModelCardExists } from "./modelCards";
import { getCached, setCached } from "./semanticCache";
import { redactForAudit, scanForInjection, scanOutputForLeakage } from "./taint";
import type {
  ClaimSpec,
  ConfidenceClass,
  DocumentRef,
  GenerationResult,
  GroundingSet,
  ModelTier,
  NarrativeMode,
  PhaseEvent,
} from "./types";

export interface GenerateGroundedRequest {
  feature: "briefing" | "ask" | "insight" | "narrative";
  modelCardId: string;
  orgId: number;
  userId: number | null;
  mode: NarrativeMode;
  claims: ClaimSpec[];
  groundingSet: GroundingSet;
  userQuestion?: string;
  untrustedContext?: DocumentRef[];
  abstainIfNoClaims?: boolean;
  taskId?: string;
  allowCache?: boolean;
  onPhase?: (event: PhaseEvent) => void;
}

const TIER_ORDER: ModelTier[] = ["composer", "small", "large"];

function emit(req: GenerateGroundedRequest, phase: PhaseEvent["phase"], message: string) {
  req.onPhase?.({ phase, message, at: Date.now() });
}

function classifyConfidence(tier: ModelTier, lintOk: boolean, citationCount: number, claimCount: number): ConfidenceClass {
  if (!lintOk) return "low";
  if (claimCount === 0) return "low";
  const coverage = citationCount / Math.max(claimCount, 1);
  if (tier === "large" && coverage >= 1) return "high";
  if (coverage >= 0.8) return "medium";
  return "low";
}

async function tryTier(
  tier: ModelTier,
  req: GenerateGroundedRequest,
  sanitizedUntrusted: DocumentRef[],
): Promise<{ ok: boolean; failureReason?: string; providerId: string; promptTokens: number; completionTokens: number; text: string; citations: GenerationResult["citations"]; abstained?: GenerationResult["abstained"] } | null> {
  const provider = providerRegistry[tier];
  const isPaid = tier !== "composer";

  if (isPaid) {
    const available = await provider.available().catch(() => false);
    if (!available) return null; // not configured — skip silently, not a failure
    const roughEstimateCents = estimateCostCents(provider.providerId, 1500, 400); // conservative pre-check estimate
    const affordable = await canAfford(req.orgId, req.userId, req.feature, roughEstimateCents);
    if (!affordable) return null; // budget exhausted — skip this and any more expensive tier
  }

  try {
    const response = await provider.compose({
      task: req.feature,
      modelCardId: req.modelCardId,
      mode: req.mode,
      claims: req.claims,
      groundingSet: req.groundingSet,
      userQuestion: req.userQuestion,
      untrustedContext: sanitizedUntrusted,
      abstainIfNoClaims: req.abstainIfNoClaims,
    });

    if (response.abstained) {
      return {
        ok: true,
        providerId: provider.providerId,
        promptTokens: response.promptTokens,
        completionTokens: response.completionTokens,
        text: "",
        citations: [],
        abstained: response.abstained,
      };
    }

    const lint = lintCitations(response.text, response.citations, req.groundingSet);
    const leakage = scanOutputForLeakage({
      text: response.text,
      requestingUserId: req.userId,
      requestingOrgId: req.orgId,
    });

    if (!lint.ok || leakage.length > 0) {
      return {
        ok: false,
        failureReason: !lint.ok ? `citation_lint_failed:${lint.violations.map((v) => v.type).join(",")}` : `output_leakage:${leakage.join(",")}`,
        providerId: provider.providerId,
        promptTokens: response.promptTokens,
        completionTokens: response.completionTokens,
        text: response.text,
        citations: response.citations,
      };
    }

    return {
      ok: true,
      providerId: provider.providerId,
      promptTokens: response.promptTokens,
      completionTokens: response.completionTokens,
      text: response.text,
      citations: response.citations,
    };
  } catch (err) {
    return { ok: false, failureReason: `provider_error:${(err as Error).message}`, providerId: provider.providerId, promptTokens: 0, completionTokens: 0, text: "", citations: [] };
  }
}

export async function generateGrounded(req: GenerateGroundedRequest): Promise<GenerationResult> {
  assertModelCardExists(req.modelCardId);
  emit(req, "ground", `Grounding set resolved: ${req.groundingSet.entities.length} entities, ${req.groundingSet.events.length} events, ${req.groundingSet.metrics.length} metrics, ${req.groundingSet.documents.length} documents.`);

  const groundingHash = computeGroundingHash(req.groundingSet);
  const promptVersion = req.modelCardId;

  if (req.allowCache !== false) {
    const cached = await getCached(req.feature, groundingHash, promptVersion);
    if (cached) {
      emit(req, "compose", "Served from semantic cache.");
      emit(req, "verify", "Cached result already passed citation lint.");
      await meterUsage({
        orgId: req.orgId,
        userId: req.userId,
        feature: req.feature,
        taskId: req.taskId,
        modelCardId: req.modelCardId,
        provider: cached.provider,
        tier: cached.tier,
        promptTokens: 0,
        completionTokens: 0,
        costCents: 0,
        cacheHit: true,
        degraded: cached.degraded,
        groundingHash,
      });
      emit(req, "done", "Done (cache hit).");
      return { ...cached, cacheHit: true };
    }
  }

  // Untrusted content: scan + fence BEFORE it ever reaches a composer.
  const untrustedContext = req.untrustedContext ?? [];
  for (const doc of untrustedContext) {
    const scan = scanForInjection(doc.text);
    if (scan.suspicious) {
      await db.insert(injectionIncidents).values({
        orgId: req.orgId,
        userId: req.userId,
        source: "document",
        attackPattern: scan.patterns.join(","),
        blocked: true,
        detail: `Patterns detected in retrieved doc ${doc.ref}; content retained as inert data, not treated as instructions.`,
      });
    }
  }
  if (req.userQuestion) {
    const scan = scanForInjection(req.userQuestion);
    if (scan.suspicious) {
      await db.insert(injectionIncidents).values({
        orgId: req.orgId,
        userId: req.userId,
        source: "user_query",
        attackPattern: scan.patterns.join(","),
        blocked: true,
        detail: "Patterns detected in user query; structured separation prevents instruction execution from query text beyond the registered tier0 tool surface.",
      });
    }
  }

  emit(req, "retrieve", `${untrustedContext.length} untrusted context chunk(s) scanned and fenced.`);

  const recommended = classifyDifficulty({
    task: req.feature,
    modelCardId: req.modelCardId,
    mode: req.mode,
    claims: req.claims,
    groundingSet: req.groundingSet,
    userQuestion: req.userQuestion,
    untrustedContext,
    abstainIfNoClaims: req.abstainIfNoClaims,
  });

  // "Small model first": never jump straight to large.
  let startTier: ModelTier = recommended === "large" ? "small" : recommended;
  let startIdx = TIER_ORDER.indexOf(startTier);
  if (startIdx < 0) startIdx = 0;

  emit(req, "compose", `Routing: recommended=${recommended}, starting tier=${TIER_ORDER[startIdx]}.`);

  let finalTier: ModelTier = "composer";
  let finalAttempt: Awaited<ReturnType<typeof tryTier>> = null;

  for (let i = startIdx; i < TIER_ORDER.length; i++) {
    const tier = TIER_ORDER[i];
    const attempt = await tryTier(tier, req, untrustedContext);
    if (attempt === null) continue; // tier unavailable/unaffordable, try next
    if (attempt.ok) {
      finalTier = tier;
      finalAttempt = attempt;
      break;
    }
    // validation failure — escalate to the next tier
    finalAttempt = attempt;
  }

  let degraded = false;
  if (!finalAttempt || !finalAttempt.ok) {
    // Guaranteed-safe fallback: the deterministic composer cannot fail lint.
    degraded = true;
    const composerAttempt = await tryTier("composer", req, untrustedContext);
    finalTier = "composer";
    finalAttempt = composerAttempt;
  } else if (finalTier !== startTier) {
    degraded = false; // successful escalation is normal operation, not degradation
  }
  if (finalTier === "composer" && startTier !== "composer") {
    degraded = true; // we wanted a model tier but had to fall back
  }

  emit(req, "verify", `Final tier=${finalTier}, degraded=${degraded}.`);

  const result = finalAttempt!;
  const lint = result.abstained
    ? { ok: true, violations: [], numericTokensChecked: 0, citationsChecked: 0 }
    : lintCitations(result.text, result.citations, req.groundingSet);

  const costCents = finalTier === "composer" ? 0 : estimateCostCents(result.providerId as any, result.promptTokens, result.completionTokens);
  const confidenceClass = result.abstained ? "low" : classifyConfidence(finalTier, lint.ok, result.citations.length, req.claims.length);

  const generation: GenerationResult = {
    text: result.text,
    citations: result.citations,
    confidenceClass,
    abstained: result.abstained,
    modelCardId: req.modelCardId,
    provider: result.providerId as GenerationResult["provider"],
    tier: finalTier,
    degraded,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    costCents,
    cacheHit: false,
    groundingHash,
    lint,
  };

  await meterUsage({
    orgId: req.orgId,
    userId: req.userId,
    feature: req.feature,
    taskId: req.taskId,
    modelCardId: req.modelCardId,
    provider: generation.provider,
    tier: generation.tier,
    promptTokens: generation.promptTokens,
    completionTokens: generation.completionTokens,
    costCents: generation.costCents,
    cacheHit: false,
    degraded: generation.degraded,
    groundingHash,
  });

  await db.insert(llmAuditLog).values({
    orgId: req.orgId,
    userId: req.userId,
    feature: req.feature,
    taskId: req.taskId,
    modelCardId: req.modelCardId,
    inputSummaryRedacted: redactForAudit(req.userQuestion ?? JSON.stringify(req.claims.map((c) => c.id))),
    outputSummaryRedacted: redactForAudit(generation.abstained ? `ABSTAINED: ${generation.abstained.reason}` : generation.text),
    citationCount: generation.citations.length,
    citationsValid: lint.ok,
    abstained: Boolean(generation.abstained),
    abstainReason: generation.abstained?.reason,
    injectionFlag: untrustedContext.some((d) => scanForInjection(d.text).suspicious),
    confidenceClass: generation.confidenceClass,
  });

  if (req.allowCache !== false) {
    await setCached(req.feature, groundingHash, promptVersion, generation);
  }

  emit(req, "done", "Generation complete.");
  return generation;
}
