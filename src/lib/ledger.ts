import { createHash } from "node:crypto";
import { db } from "@/db";
import { decisions } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

// Append-only, hash-chained evidence ledger. Every decision record's hash is
// a function of the previous record's hash plus this record's canonical
// content, so any retroactive edit or deletion breaks the chain and is
// detectable — a lightweight tamper-evidence mechanism.

export type LedgerEntryInput = {
  tenantId: string;
  subjectType: string;
  subjectId?: string | null;
  title: string;
  rationale: string;
  outcome?: string;
  confidence?: number;
  confidenceLabel?: "measured" | "estimated" | "association" | "effect";
  evidence?: unknown[];
  actor?: string;
};

// PostgreSQL's jsonb type does not preserve the original key order of a
// stored object (it normalizes internally), so hashing must be invariant to
// key order at every nesting level, not just the top level, or a value
// round-tripped through the database will hash differently than it did at
// insert time.
function deepSort(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(deepSort);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort();
    const ordered: Record<string, unknown> = {};
    for (const key of sortedKeys) ordered[key] = deepSort(record[key]);
    return ordered;
  }
  return value;
}

function canonicalize(record: Record<string, unknown>): string {
  return JSON.stringify(deepSort(record));
}

export async function getLatestHash(tenantId: string): Promise<string | null> {
  const [latest] = await db
    .select({ hash: decisions.hash })
    .from(decisions)
    .where(eq(decisions.tenantId, tenantId))
    .orderBy(desc(decisions.createdAt))
    .limit(1);
  return latest?.hash ?? null;
}

export async function appendDecision(input: LedgerEntryInput) {
  const prevHash = await getLatestHash(input.tenantId);
  const createdAt = new Date();

  const content = {
    tenantId: input.tenantId,
    subjectType: input.subjectType,
    subjectId: input.subjectId ?? null,
    title: input.title,
    rationale: input.rationale,
    outcome: input.outcome ?? "pending",
    confidence: input.confidence ?? 50,
    confidenceLabel: input.confidenceLabel ?? "estimated",
    evidence: input.evidence ?? [],
    actor: input.actor ?? "system",
    prevHash,
    timestamp: createdAt.toISOString(),
  };

  const hash = createHash("sha256").update(canonicalize(content)).digest("hex");

  const [row] = await db
    .insert(decisions)
    .values({
      tenantId: input.tenantId,
      subjectType: input.subjectType,
      subjectId: input.subjectId ?? null,
      title: input.title,
      rationale: input.rationale,
      outcome: input.outcome ?? "pending",
      confidence: input.confidence ?? 50,
      confidenceLabel: input.confidenceLabel ?? "estimated",
      evidence: input.evidence ?? [],
      actor: input.actor ?? "system",
      prevHash,
      hash,
      createdAt,
    })
    .returning();

  return row;
}

export type ChainVerification = {
  valid: boolean;
  checkedCount: number;
  brokenAt: string | null;
};

// Recomputes the hash chain from scratch and confirms every stored hash
// matches what the content + previous hash would produce.
export async function verifyChain(tenantId: string): Promise<ChainVerification> {
  const rows = await db
    .select()
    .from(decisions)
    .where(and(eq(decisions.tenantId, tenantId)))
    .orderBy(decisions.createdAt);

  let expectedPrevHash: string | null = null;
  for (const row of rows) {
    const content = {
      tenantId: row.tenantId,
      subjectType: row.subjectType,
      subjectId: row.subjectId ?? null,
      title: row.title,
      rationale: row.rationale,
      outcome: row.outcome,
      confidence: row.confidence,
      confidenceLabel: row.confidenceLabel,
      evidence: row.evidence,
      actor: row.actor,
      prevHash: row.prevHash,
      timestamp: row.createdAt.toISOString(),
    };
    const recomputed = createHash("sha256").update(canonicalize(content)).digest("hex");

    if (row.prevHash !== expectedPrevHash || recomputed !== row.hash) {
      return { valid: false, checkedCount: rows.length, brokenAt: row.id };
    }
    expectedPrevHash = row.hash;
  }

  return { valid: true, checkedCount: rows.length, brokenAt: null };
}
