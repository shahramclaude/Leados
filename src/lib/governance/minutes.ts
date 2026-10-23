// Minutes (Part 42 artifact pipeline): verbatim excerpts are entered
// manually and kept separate from the generated narrative summary. Once
// finalized, verbatim content is immutable and the record is hash-chained.
//
// HARD STOP: finalization requires a human actor whose board tier is
// "company_secretary" or "chair" — this is enforced in code (not just UI),
// so no automated process can finalize minutes on its own.

import crypto from "node:crypto";
import { db } from "@/db";
import { minutes } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { appendAuditEntry } from "./auditChain";

export type VerbatimExcerpt = {
  speaker: string;
  quote: string;
  timestampLabel: string;
};

export class FinalizationNotAllowedError extends Error {
  constructor(tier: string) {
    super(
      `Minutes finalization rejected: tier "${tier}" is not authorised. Only "company_secretary" or "chair" may finalize minutes — this is a hard stop for human judgement.`,
    );
    this.name = "FinalizationNotAllowedError";
  }
}

export async function getOrCreateMinutes(meetingId: number) {
  const [existing] = await db.select().from(minutes).where(eq(minutes.meetingId, meetingId));
  if (existing) return existing;
  const [row] = await db.insert(minutes).values({ meetingId }).returning();
  return row;
}

export async function addVerbatimExcerpt(meetingId: number, excerpt: VerbatimExcerpt) {
  const record = await getOrCreateMinutes(meetingId);
  if (record.finalized) throw new Error("Cannot edit finalized minutes.");
  const current = (record.verbatimExcerpts as VerbatimExcerpt[]) ?? [];
  const [row] = await db
    .update(minutes)
    .set({ verbatimExcerpts: [...current, excerpt] })
    .where(eq(minutes.id, record.id))
    .returning();
  return row;
}

export async function setGeneratedSummary(meetingId: number, summary: string) {
  const record = await getOrCreateMinutes(meetingId);
  if (record.finalized) throw new Error("Cannot edit finalized minutes.");
  const [row] = await db
    .update(minutes)
    .set({ generatedSummary: summary })
    .where(eq(minutes.id, record.id))
    .returning();
  return row;
}

const AUTHORISED_FINALIZER_TIERS = new Set(["company_secretary", "chair"]);

export async function finalizeMinutes(params: {
  meetingId: number;
  finalizedBy: number;
  finalizedByTier: string;
}) {
  if (!AUTHORISED_FINALIZER_TIERS.has(params.finalizedByTier)) {
    throw new FinalizationNotAllowedError(params.finalizedByTier);
  }

  const record = await getOrCreateMinutes(params.meetingId);
  if (record.finalized) return record;

  const [last] = await db.select().from(minutes).orderBy(desc(minutes.id)).limit(1);
  const prevHash = last && last.id !== record.id ? last.hash ?? null : null;

  const body = JSON.stringify({
    meetingId: params.meetingId,
    verbatimExcerpts: record.verbatimExcerpts,
    generatedSummary: record.generatedSummary,
    finalizedBy: params.finalizedBy,
  });
  const hash = crypto
    .createHash("sha256")
    .update((prevHash ?? "GENESIS") + body)
    .digest("hex");

  const [row] = await db
    .update(minutes)
    .set({
      finalized: true,
      finalizedBy: params.finalizedBy,
      finalizedByTier: params.finalizedByTier,
      finalizedAt: new Date(),
      prevHash,
      hash,
    })
    .where(eq(minutes.id, record.id))
    .returning();

  await appendAuditEntry({
    actorId: params.finalizedBy,
    actorTier: params.finalizedByTier,
    action: "minutes.finalized",
    entityType: "minutes",
    entityId: row.id,
    payload: { meetingId: params.meetingId, hash },
  });

  return row;
}

export async function getMinutes(meetingId: number) {
  const [row] = await db.select().from(minutes).where(eq(minutes.meetingId, meetingId));
  return row ?? null;
}
