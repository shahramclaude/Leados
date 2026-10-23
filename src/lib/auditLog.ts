import { createHash } from "node:crypto";
import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import { desc } from "drizzle-orm";
import { newId } from "@/lib/id";

/* ============================================================================
 * PART 73 (light) — Tamper-evident, hash-chained audit log.
 *
 * Every event commits to the previous event's hash:
 *   hash = sha256(seq || prevHash || canonicalJSON(event))
 * A verifier walks the chain and recomputes every hash; any edited row breaks
 * the chain from that point forward, which is exactly the detection property
 * we test for (PHASE 5 seeded-tamper attack).
 * ========================================================================== */

export const GENESIS_HASH = "0".repeat(64);

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

function computeHash(seq: number, prevHash: string, body: Record<string, unknown>): string {
  return createHash("sha256").update(`${seq}|${prevHash}|${canonicalize(body)}`).digest("hex");
}

export interface AppendAuditInput {
  actorKind: "user" | "agent" | "system";
  actorId: string;
  action: string;
  target: string;
  payload?: Record<string, unknown>;
}

export async function appendAuditEvent(input: AppendAuditInput): Promise<string> {
  const [last] = await db.select().from(auditEvents).orderBy(desc(auditEvents.seq)).limit(1);
  const seq = (last?.seq ?? 0) + 1;
  const prevHash = last?.hash ?? GENESIS_HASH;
  const body = {
    actorKind: input.actorKind,
    actorId: input.actorId,
    action: input.action,
    target: input.target,
    payload: input.payload ?? {},
  };
  const hash = computeHash(seq, prevHash, body);
  const id = newId("audit");
  await db.insert(auditEvents).values({ id, seq, prevHash, hash, ...body });
  return id;
}

export interface VerifyResult {
  valid: boolean;
  totalEvents: number;
  brokenAtSeq: number | null;
}

export async function verifyAuditChain(): Promise<VerifyResult> {
  const rows = await db.select().from(auditEvents).orderBy(auditEvents.seq);
  let prevHash = GENESIS_HASH;
  for (const row of rows) {
    const recomputed = computeHash(row.seq, prevHash, {
      actorKind: row.actorKind,
      actorId: row.actorId,
      action: row.action,
      target: row.target,
      payload: row.payload as Record<string, unknown>,
    });
    if (recomputed !== row.hash || row.prevHash !== prevHash) {
      return { valid: false, totalEvents: rows.length, brokenAtSeq: row.seq };
    }
    prevHash = row.hash;
  }
  return { valid: true, totalEvents: rows.length, brokenAtSeq: null };
}
