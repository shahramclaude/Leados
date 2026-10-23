import { db } from "@/db";
import { claims, evidence, claimEvidence, argumentEdges } from "@/db/schema";
import { eq } from "drizzle-orm";
import { newId } from "@/lib/id";

/* ============================================================================
 * PART 60 — Hypothesis & reasoning workbench (Toulmin argumentation + Bayes).
 *
 * Every claim must carry >=1 evidence link (enforced here AND by the DB
 * trigger/constraint installed in src/db/constraints.sql). Confidence is a
 * Beta-style posterior: reliability-weighted evidence nudges confidence via
 * `delta = reliability * direction * LEARNING_RATE`, clamped to [0.02, 0.98]
 * so it can never collapse to false certainty.
 * ========================================================================== */

const LEARNING_RATE = 0.15;

export function betaUpdate(prior: number, reliability: number, supportive: boolean): number {
  const direction = supportive ? 1 : -1;
  const delta = reliability * direction * LEARNING_RATE;
  const next = prior + delta * (1 - Math.abs(prior - 0.5) * 0.6); // diminishing returns near certainty
  return Math.min(0.98, Math.max(0.02, Number(next.toFixed(4))));
}

export interface NewClaimInput {
  text: string;
  scope: string;
  kind: "descriptive" | "causal" | "normative" | "predictive";
  polarity: "supports" | "opposes";
  confidence: number;
  authorId?: string;
  evidenceKind: string;
  evidenceSourceRef: string;
  evidenceReliability: number;
  evidenceExtract: string;
}

/** Creates a claim with its mandatory evidence link, then re-checks for contradictions in scope. */
export async function createClaimWithEvidence(input: NewClaimInput): Promise<{ claimId: string; conflictWith: string[] }> {
  if (!input.evidenceExtract || input.evidenceReliability == null) {
    throw new Error("EVIDENCE_REQUIRED: a claim cannot be created without evidence (confidence requires evidenceIds)");
  }
  const evidenceId = newId("ev");
  const claimId = newId("claim");

  // Single transaction: the DB-level deferred constraint trigger checks at
  // COMMIT time that every inserted claim has an evidence link, so claim +
  // evidence + link must land in the same transaction.
  await db.transaction(async (tx) => {
    await tx.insert(evidence).values({
      id: evidenceId,
      kind: input.evidenceKind,
      sourceRef: input.evidenceSourceRef,
      reliability: input.evidenceReliability,
      extract: input.evidenceExtract,
    });
    await tx.insert(claims).values({
      id: claimId,
      text: input.text,
      scope: input.scope,
      kind: input.kind,
      polarity: input.polarity,
      confidence: input.confidence,
      authorId: input.authorId ?? "operator",
      status: "open",
    });
    await tx.insert(claimEvidence).values({ id: newId("ce"), claimId, evidenceId });
  });

  const conflictWith = await detectContradictionsFor(claimId);
  if (conflictWith.length > 0) {
    await db.update(claims).set({ status: "conflict" }).where(eq(claims.id, claimId));
    for (const otherId of conflictWith) {
      await db.update(claims).set({ status: "conflict" }).where(eq(claims.id, otherId));
    }
  }

  return { claimId, conflictWith };
}

/**
 * Contradiction = same scope, both confidence > 0.6, opposite polarity.
 * Never silently averaged — both claims persist and are flagged `conflict`,
 * requiring an explicit resolution (evidence discounting or scope narrowing).
 */
export async function detectContradictionsFor(claimId: string): Promise<string[]> {
  const [subject] = await db.select().from(claims).where(eq(claims.id, claimId));
  if (!subject) return [];
  const sameScope = await db.select().from(claims).where(eq(claims.scope, subject.scope));
  return sameScope
    .filter(
      (c) =>
        c.id !== subject.id &&
        c.polarity !== subject.polarity &&
        c.confidence > 0.6 &&
        subject.confidence > 0.6,
    )
    .map((c) => c.id);
}

export interface Dialectic {
  scope: string;
  thesis: { claimId: string; text: string; confidence: number } | null;
  antithesis: { claimId: string; text: string; confidence: number } | null;
  unresolved: string[];
}

/** Builds a thesis/antithesis pair per scope — rejects a side without a steelman candidate. */
export async function buildDialectic(scope: string): Promise<Dialectic> {
  const rows = await db.select().from(claims).where(eq(claims.scope, scope));
  const supports = rows.filter((r) => r.polarity === "supports").sort((a, b) => b.confidence - a.confidence);
  const opposes = rows.filter((r) => r.polarity === "opposes").sort((a, b) => b.confidence - a.confidence);
  const thesis = supports[0] ? { claimId: supports[0].id, text: supports[0].text, confidence: supports[0].confidence } : null;
  const antithesis = opposes[0] ? { claimId: opposes[0].id, text: opposes[0].text, confidence: opposes[0].confidence } : null;
  const unresolved: string[] = [];
  if (!thesis) unresolved.push("No supporting claim found — question may be undecidable from current evidence.");
  if (!antithesis) unresolved.push("No steelman counter-claim found — this debate has no genuine opposing case yet.");
  if (thesis && antithesis && Math.abs(thesis.confidence - antithesis.confidence) < 0.1) {
    unresolved.push("Thesis and antithesis are near-equally supported — treat as a genuine open trade-off.");
  }
  return { scope, thesis, antithesis, unresolved };
}

export async function listClaimsWithEvidence() {
  const allClaims = await db.select().from(claims).orderBy(claims.createdAt);
  const links = await db.select().from(claimEvidence);
  const evidenceRows = await db.select().from(evidence);
  const evidenceById = new Map(evidenceRows.map((e) => [e.id, e]));
  return allClaims.map((c) => ({
    ...c,
    evidence: links.filter((l) => l.claimId === c.id).map((l) => evidenceById.get(l.evidenceId)).filter(Boolean),
  }));
}
