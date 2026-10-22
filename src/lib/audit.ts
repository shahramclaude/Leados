// src/lib/audit.ts
//
// Append-only, hash-chained audit log.
//
// HONESTY / PROVENANCE NOTE: the standing order for this part asks us to read
// "Part 19's chain" before writing. This sandbox was bootstrapped from a bare
// Next.js + Postgres starter template — none of Parts 01-28's source files
// are present on disk (verified: `src/lib/` was empty before this part ran).
// Rather than silently inventing behaviour and claiming it is "Part 19's"
// code, we implement a self-contained, conventional SHA-256 hash chain here
// that satisfies the same contract Part 19 is specified to provide
// (immutable, chained, independently verifiable event log used as the
// evidence backbone for control tests, attestations, and breach escalation).
// If/when Part 19's actual module is reinstated in the repo, this file's
// `appendAuditEvent` / `verifyAuditChain` signatures are designed to be a
// drop-in swap.

import { createHash } from "crypto";
import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import { asc, desc, eq } from "drizzle-orm";

export const GENESIS_HASH = "0".repeat(64);

export interface AuditEventInput {
  category:
    | "control_test"
    | "policy_lifecycle"
    | "attestation"
    | "obligation"
    | "appetite_breach"
    | "finding"
    | "risk_register";
  entityType: string;
  entityId: string;
  action: string;
  payload: Record<string, unknown>;
  actor: string;
}

function canonicalize(value: unknown): string {
  // Deterministic JSON stringify (sorted keys) so hashing is stable.
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

function hashEvent(prevHash: string, event: Omit<AuditEventInput, never> & { occurredAt: string }): string {
  const body = canonicalize({
    prevHash,
    category: event.category,
    entityType: event.entityType,
    entityId: event.entityId,
    action: event.action,
    payload: event.payload,
    actor: event.actor,
    occurredAt: event.occurredAt,
  });
  return createHash("sha256").update(body).digest("hex");
}

/** Append a new evidence event onto the hash chain. Returns the stored row. */
export async function appendAuditEvent(input: AuditEventInput) {
  const [last] = await db
    .select()
    .from(auditEvents)
    .orderBy(desc(auditEvents.sequence))
    .limit(1);

  const prevHash = last?.hash ?? GENESIS_HASH;
  const occurredAt = new Date().toISOString();
  const hash = hashEvent(prevHash, { ...input, occurredAt });

  const [row] = await db
    .insert(auditEvents)
    .values({
      sequence: (last?.sequence ?? 0) + 1,
      prevHash,
      hash,
      category: input.category,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      payload: input.payload,
      actor: input.actor,
      occurredAt,
    })
    .returning();

  return row;
}

export interface ChainVerificationResult {
  ok: boolean;
  checkedEvents: number;
  brokenAtSequence: number | null;
  detail: string;
}

/** Recompute every hash in the chain and confirm linkage + integrity. */
export async function verifyAuditChain(): Promise<ChainVerificationResult> {
  const rows = await db.select().from(auditEvents).orderBy(asc(auditEvents.sequence));
  let prevHash = GENESIS_HASH;
  for (const row of rows) {
    if (row.prevHash !== prevHash) {
      return {
        ok: false,
        checkedEvents: rows.length,
        brokenAtSequence: row.sequence,
        detail: `prevHash mismatch at sequence ${row.sequence}: expected ${prevHash}, stored ${row.prevHash}`,
      };
    }
    const recomputed = hashEvent(prevHash, {
      category: row.category as AuditEventInput["category"],
      entityType: row.entityType,
      entityId: row.entityId,
      action: row.action,
      payload: row.payload as Record<string, unknown>,
      actor: row.actor,
      occurredAt: row.occurredAt,
    });
    if (recomputed !== row.hash) {
      return {
        ok: false,
        checkedEvents: rows.length,
        brokenAtSequence: row.sequence,
        detail: `hash mismatch at sequence ${row.sequence}: recomputed ${recomputed}, stored ${row.hash}`,
      };
    }
    prevHash = row.hash;
  }
  return { ok: true, checkedEvents: rows.length, brokenAtSequence: null, detail: "chain intact" };
}

/** Fetch the audit trail for one entity (used as "evidence ref" everywhere). */
export async function getEntityEvidence(entityType: string, entityId: string) {
  return db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.entityType, entityType))
    .orderBy(asc(auditEvents.sequence))
    .then((rows) => rows.filter((r) => r.entityId === entityId));
}
