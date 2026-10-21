// Section E.3: Ask-LEADOS. conversationIntelligence.ts owns the query
// interface over the org: retrieve -> (deterministic refusal gate) ->
// model answer -> faithfulness gate -> Explain<T>-shaped structured answer.
//
// Refusal is enforced TWICE and the first gate never calls a model at all:
//   1. Deterministic: if retrieval confidence is below
//      REFUSAL_CONFIDENCE_THRESHOLD, we refuse before spending a token.
//   2. Faithfulness: if the model answers but every claim it made fails the
//      faithfulness checker (e.g. it cited evidence that doesn't exist, or
//      it was tricked by a prompt-injection payload into asserting
//      something not actually in the data), we convert the answer to a
//      refusal rather than ship zero-evidence prose.
// This two-gate design is what the refusal test in evals/injection.test.ts
// and evals/refusal.test.ts exercise directly.
import { hybridRetrieve, REFUSAL_CONFIDENCE_THRESHOLD } from "@/lib/retrieval";
import { annotateChunks, buildUntrustedDataBlock } from "@/lib/promptInjectionGuard";
import { runPrompt } from "@/lib/agentCore";
import { askLeadosPrompt } from "@/lib/promptRegistry";
import { checkFaithfulness, type EvidenceIndex } from "@/lib/faithfulness";
import type { Explain } from "@/lib/types/explain";
import type { Actor } from "@/lib/agentCore";

export type AskLeadosAnswer = {
  refused: boolean;
  refusalReason?: string;
  answerSummary: string;
};

export async function askLeados(question: string, actor: Actor = { kind: "user", id: "anonymous" }): Promise<Explain<AskLeadosAnswer> & { degraded: boolean; modelCallId: number | null; flaggedChunks: number }> {
  const retrieval = await hybridRetrieve(question, 12);
  const annotated = annotateChunks(retrieval.chunks);
  const flaggedCount = annotated.filter((c) => c.flagged).length;
  const usable = annotated.filter((c) => !c.flagged);

  if (retrieval.confidence < REFUSAL_CONFIDENCE_THRESHOLD || usable.length === 0) {
    return {
      value: {
        refused: true,
        refusalReason: `I don't have evidence for "${question}" — retrieval confidence (${retrieval.confidence.toFixed(2)}) is below the threshold (${REFUSAL_CONFIDENCE_THRESHOLD}).`,
        answerSummary: "",
      },
      confidence: retrieval.confidence,
      evidenceRefs: [],
      claims: [],
      degraded: false,
      modelCallId: null,
      flaggedChunks: flaggedCount,
    };
  }

  const evidenceIndex: EvidenceIndex = new Map(usable.map((c) => [c.id, { kind: c.kind, text: c.text }]));
  const untrustedDataBlock = buildUntrustedDataBlock(usable);

  const run = await runPrompt(
    askLeadosPrompt,
    {
      question,
      untrustedDataBlock,
      chunkIndex: usable.map((c) => ({ id: c.id, kind: c.kind, text: c.text, timestamp: c.timestamp })),
      retrievalConfidence: retrieval.confidence,
    },
    actor,
  );

  if (run.output.refused) {
    return {
      value: { refused: true, refusalReason: run.output.refusalReason ?? "Insufficient evidence.", answerSummary: "" },
      confidence: retrieval.confidence,
      evidenceRefs: [],
      claims: [],
      degraded: run.degraded,
      modelCallId: run.modelCallId,
      flaggedChunks: flaggedCount,
    };
  }

  const { kept, dropped, faithfulnessRate } = checkFaithfulness(run.output.claims, evidenceIndex);

  if (kept.length === 0) {
    return {
      value: {
        refused: true,
        refusalReason: "I don't have verifiable evidence for that — the model's draft answer did not survive the citation faithfulness check.",
        answerSummary: "",
      },
      confidence: 0,
      evidenceRefs: [],
      claims: [],
      droppedClaims: dropped,
      degraded: run.degraded,
      modelCallId: run.modelCallId,
      flaggedChunks: flaggedCount,
    };
  }

  return {
    value: { refused: false, answerSummary: run.output.answerSummary },
    confidence: Math.min(retrieval.confidence, faithfulnessRate),
    evidenceRefs: kept.flatMap((c) => c.evidenceRefs),
    claims: kept,
    droppedClaims: dropped,
    degraded: run.degraded,
    modelCallId: run.modelCallId,
    flaggedChunks: flaggedCount,
  };
}
