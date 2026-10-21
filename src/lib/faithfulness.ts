// Section C/D: citation faithfulness checker.
//
// Every generated claim must carry evidenceRefs. This module is the
// enforcement point: it drops any claim that (a) cites no evidence, (b)
// cites evidence ids that don't exist in what was actually retrieved, or
// (c) is not lexically/numerically supported by the cited evidence text.
// Dropped claims are returned (never silently discarded) so callers can log
// them — surfaced in Explain<T>.droppedClaims.
//
// We use a strict deterministic template/overlap check rather than calling
// another model for entailment: it is free, has zero latency, is fully
// reproducible for the eval golden set, and — critically — cannot itself be
// fooled by a prompt-injection payload the way an LLM-as-judge call could.
// Trade-off: it under-counts paraphrase as "supported" when wording differs
// heavily from the source (see adversarial self-review §1 in the delivery
// notes) — acceptable because LEADOS prompts are instructed to quote/closely
// paraphrase source facts, and prompts that don't are flagged by low recall
// in eval:llm's faithfulness score, which is a regression gate.
import type { Claim, EvidenceRef } from "@/lib/types/explain";

export type EvidenceIndexEntry = { text: string; kind: EvidenceRef["kind"] };
export type EvidenceIndex = Map<string, EvidenceIndexEntry>;

export type FaithfulnessOutcome = {
  kept: Claim[];
  dropped: { claim: string; reason: string }[];
  faithfulnessRate: number; // kept / (kept+dropped), 1 when there were no claims
};

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "is", "are", "was",
  "were", "be", "been", "with", "as", "by", "at", "this", "that", "it", "its", "has", "have",
  "had", "from", "which", "will", "would", "than", "then", "we", "our", "their", "they",
]);

function significantTokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9.%$-]*/g) ?? []).filter(
    (t) => t.length >= 4 && !STOPWORDS.has(t),
  );
}

function numericTokens(text: string): string[] {
  return text.match(/-?\d+(\.\d+)?%?/g) ?? [];
}

const SUPPORT_THRESHOLD = 0.55;

export function checkFaithfulness(claims: Claim[], evidenceIndex: EvidenceIndex): FaithfulnessOutcome {
  const kept: Claim[] = [];
  const dropped: { claim: string; reason: string }[] = [];

  for (const claim of claims) {
    if (!claim.evidenceRefs || claim.evidenceRefs.length === 0) {
      dropped.push({ claim: claim.claim, reason: "no_evidence_cited" });
      continue;
    }

    const validRefs = claim.evidenceRefs.filter((r) => evidenceIndex.has(r.id));
    if (validRefs.length === 0) {
      dropped.push({ claim: claim.claim, reason: "cited_evidence_not_in_retrieval_set" });
      continue;
    }

    const combinedEvidenceText = validRefs
      .map((r) => evidenceIndex.get(r.id)!.text)
      .join("\n")
      .toLowerCase();

    const claimTokens = significantTokens(claim.claim);
    const overlap = claimTokens.filter((t) => combinedEvidenceText.includes(t));
    const lexicalScore = claimTokens.length === 0 ? 1 : overlap.length / claimTokens.length;

    const claimNumbers = numericTokens(claim.claim);
    const missingNumbers = claimNumbers.filter((n) => !combinedEvidenceText.includes(n.toLowerCase()));

    if (missingNumbers.length > 0) {
      dropped.push({
        claim: claim.claim,
        reason: `numeric_value_not_in_evidence: ${missingNumbers.join(", ")}`,
      });
      continue;
    }

    if (lexicalScore < SUPPORT_THRESHOLD) {
      dropped.push({
        claim: claim.claim,
        reason: `insufficient_lexical_support (${lexicalScore.toFixed(2)} < ${SUPPORT_THRESHOLD})`,
      });
      continue;
    }

    kept.push({ claim: claim.claim, evidenceRefs: validRefs });
  }

  const total = kept.length + dropped.length;
  return { kept, dropped, faithfulnessRate: total === 0 ? 1 : kept.length / total };
}
