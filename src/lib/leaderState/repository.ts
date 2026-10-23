// src/lib/leaderState/repository.ts
//
// THE single access point for the `leader_state` Postgres schema (see
// src/db/schema.ts for the storage-level isolation design and its honesty
// caveat about RLS + superuser in this sandbox).
//
// RULE: every exported function that touches raw leader-state rows (decisions,
// recovery signals, grants) takes an `ActorContext` and calls `assertSelf`
// first. There is NO role, including "admin" or "system", that bypasses this
// check — the only thing that ever matches is `actor.userId === ownerUserId`.
//
// The two `internal*` functions at the bottom are NOT actor-gated by design:
// they back the grant-gated *derived signal* flows (capacity signal export
// to the Part 45 optimizer; opt-in research aggregation). They must never be
// imported outside this `leaderState` folder, must never return raw rows to
// their callers' callers, and are themselves gated by an explicit,
// non-expired, owner-issued grant checked via `hasActiveGrant`.

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  leaderStateDecisions,
  leaderStateGrants,
  leaderStateRecoverySignals,
} from "@/db/schema";
import type { ActorContext, GrantScope } from "@/lib/privacy";
import type {
  DecisionRecord,
  GrantEntity,
  NewDecisionInput,
  RecoverySignalInput,
  RecoverySignalRecord,
} from "@/lib/leaderState/types";
import type { DQScale, ReversibilityClass } from "@/lib/cognitiveLoad";

export class AccessDeniedError extends Error {
  constructor(actor: ActorContext, ownerUserId: string, action: string) {
    super(
      `Access denied: role="${actor.role}" actor="${actor.userId}" attempted "${action}" on ` +
        `leader-state data owned by "${ownerUserId}". Leader-state data is readable and writable ` +
        `only by its owner — no role bypasses this.`,
    );
    this.name = "AccessDeniedError";
  }
}

function assertSelf(actor: ActorContext, ownerUserId: string, action: string): void {
  if (actor.userId !== ownerUserId) {
    throw new AccessDeniedError(actor, ownerUserId, action);
  }
}

const VALID_SCALE: ReadonlySet<number> = new Set([1, 2, 3, 4, 5]);
function assertScale(value: number, field: string): asserts value is DQScale {
  if (!VALID_SCALE.has(value)) {
    throw new RangeError(`${field} must be an integer 1..5, got ${value}`);
  }
}
const VALID_REVERSIBILITY: ReadonlySet<string> = new Set(["reversible", "costly-to-reverse", "irreversible"]);
function assertReversibility(value: string): asserts value is ReversibilityClass {
  if (!VALID_REVERSIBILITY.has(value)) {
    throw new RangeError(`reversibility must be one of reversible|costly-to-reverse|irreversible, got "${value}"`);
  }
}

function mapDecisionRow(row: typeof leaderStateDecisions.$inferSelect): DecisionRecord {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    decidedAt: row.decidedAt,
    category: row.category,
    stakes: row.stakes as DQScale,
    timePressure: row.timePressure as DQScale,
    informationCompleteness: row.informationCompleteness as DQScale,
    clarity: row.clarity as DQScale,
    reversibility: row.reversibility as ReversibilityClass,
    selfRatedQuality: (row.selfRatedQuality as DQScale | null) ?? null,
    notes: row.notes,
    createdAt: row.createdAt,
  };
}

function mapGrantRow(row: typeof leaderStateGrants.$inferSelect): GrantEntity {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    scope: row.scope as GrantScope,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
  };
}

function mapRecoveryRow(row: typeof leaderStateRecoverySignals.$inferSelect): RecoverySignalRecord {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    date: row.date,
    deepWorkBlocksPlanned: row.deepWorkBlocksPlanned,
    deepWorkBlocksHonored: row.deepWorkBlocksHonored,
    quietHoursKept: row.quietHoursKept,
    meetingMinutes: row.meetingMinutes,
    createdAt: row.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export async function createDecision(
  actor: ActorContext,
  ownerUserId: string,
  input: NewDecisionInput,
): Promise<DecisionRecord> {
  assertSelf(actor, ownerUserId, "createDecision");
  assertScale(input.stakes, "stakes");
  assertScale(input.timePressure, "timePressure");
  assertScale(input.informationCompleteness, "informationCompleteness");
  assertScale(input.clarity, "clarity");
  assertReversibility(input.reversibility);
  if (input.selfRatedQuality != null) assertScale(input.selfRatedQuality, "selfRatedQuality");

  const [row] = await db
    .insert(leaderStateDecisions)
    .values({
      id: randomUUID(),
      ownerUserId,
      decidedAt: input.decidedAt ?? new Date(),
      category: input.category ?? "uncategorized",
      stakes: input.stakes,
      timePressure: input.timePressure,
      informationCompleteness: input.informationCompleteness,
      clarity: input.clarity,
      reversibility: input.reversibility,
      selfRatedQuality: input.selfRatedQuality ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  return mapDecisionRow(row);
}

export async function listDecisions(
  actor: ActorContext,
  ownerUserId: string,
  opts: { limit?: number } = {},
): Promise<DecisionRecord[]> {
  assertSelf(actor, ownerUserId, "listDecisions");
  const rows = await db
    .select()
    .from(leaderStateDecisions)
    .where(eq(leaderStateDecisions.ownerUserId, ownerUserId))
    .orderBy(desc(leaderStateDecisions.decidedAt))
    .limit(opts.limit ?? 500);
  return rows.map(mapDecisionRow);
}

// ---------------------------------------------------------------------------
// Recovery signals
// ---------------------------------------------------------------------------

export async function upsertRecoverySignal(
  actor: ActorContext,
  ownerUserId: string,
  input: RecoverySignalInput,
): Promise<RecoverySignalRecord> {
  assertSelf(actor, ownerUserId, "upsertRecoverySignal");

  const existing = await db
    .select()
    .from(leaderStateRecoverySignals)
    .where(and(eq(leaderStateRecoverySignals.ownerUserId, ownerUserId), eq(leaderStateRecoverySignals.date, input.date)))
    .limit(1);

  if (existing.length > 0) {
    const [row] = await db
      .update(leaderStateRecoverySignals)
      .set({
        deepWorkBlocksPlanned: input.deepWorkBlocksPlanned,
        deepWorkBlocksHonored: input.deepWorkBlocksHonored,
        quietHoursKept: input.quietHoursKept,
        meetingMinutes: input.meetingMinutes,
      })
      .where(eq(leaderStateRecoverySignals.id, existing[0].id))
      .returning();
    return mapRecoveryRow(row);
  }

  const [row] = await db
    .insert(leaderStateRecoverySignals)
    .values({ id: randomUUID(), ownerUserId, ...input })
    .returning();
  return mapRecoveryRow(row);
}

export async function listRecoverySignals(
  actor: ActorContext,
  ownerUserId: string,
  opts: { limit?: number } = {},
): Promise<RecoverySignalRecord[]> {
  assertSelf(actor, ownerUserId, "listRecoverySignals");
  const rows = await db
    .select()
    .from(leaderStateRecoverySignals)
    .where(eq(leaderStateRecoverySignals.ownerUserId, ownerUserId))
    .orderBy(asc(leaderStateRecoverySignals.date))
    .limit(opts.limit ?? 365);
  return rows.map(mapRecoveryRow);
}

// ---------------------------------------------------------------------------
// Grants (owner-issued, scoped, expiring consent)
// ---------------------------------------------------------------------------

const MAX_GRANT_TTL_MS = 1000 * 60 * 60 * 24 * 90; // 90 days

export async function createGrant(
  actor: ActorContext,
  ownerUserId: string,
  scope: GrantScope,
  ttlMs: number,
): Promise<GrantEntity> {
  assertSelf(actor, ownerUserId, "createGrant");
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new RangeError("ttlMs must be a positive number");
  }
  const clampedTtl = Math.min(ttlMs, MAX_GRANT_TTL_MS);
  const now = new Date();
  const [row] = await db
    .insert(leaderStateGrants)
    .values({
      id: randomUUID(),
      ownerUserId,
      scope,
      createdAt: now,
      expiresAt: new Date(now.getTime() + clampedTtl),
      revokedAt: null,
    })
    .returning();
  return mapGrantRow(row);
}

export async function revokeGrant(actor: ActorContext, ownerUserId: string, grantId: string): Promise<void> {
  assertSelf(actor, ownerUserId, "revokeGrant");
  await db
    .update(leaderStateGrants)
    .set({ revokedAt: new Date() })
    .where(and(eq(leaderStateGrants.id, grantId), eq(leaderStateGrants.ownerUserId, ownerUserId)));
}

export async function listGrants(actor: ActorContext, ownerUserId: string): Promise<GrantEntity[]> {
  assertSelf(actor, ownerUserId, "listGrants");
  const rows = await db
    .select()
    .from(leaderStateGrants)
    .where(eq(leaderStateGrants.ownerUserId, ownerUserId))
    .orderBy(desc(leaderStateGrants.createdAt));
  return rows.map(mapGrantRow);
}

// ---------------------------------------------------------------------------
// INTERNAL — derived-signal flows only. Do not import outside src/lib/leaderState.
// ---------------------------------------------------------------------------

export type InternalCallerToken = "scheduler-optimizer-service" | "research-aggregate-service";

const CALLER_TOKEN_SCOPE: Record<InternalCallerToken, GrantScope> = {
  "scheduler-optimizer-service": "scheduler-optimizer",
  "research-aggregate-service": "research-aggregate",
};

/**
 * Checks whether `ownerUserId` currently has a non-revoked, non-expired
 * grant for the scope implied by `callerToken`. This is the ONLY check that
 * gates the internal derived-signal readers below — it does not accept an
 * arbitrary actor/scope pair, only the fixed caller-token -> scope mapping,
 * so a typo elsewhere in the codebase cannot silently widen access.
 */
export async function hasActiveGrant(callerToken: InternalCallerToken, ownerUserId: string): Promise<boolean> {
  const scope = CALLER_TOKEN_SCOPE[callerToken];
  const now = new Date();
  const rows = await db
    .select({ id: leaderStateGrants.id })
    .from(leaderStateGrants)
    .where(
      and(
        eq(leaderStateGrants.ownerUserId, ownerUserId),
        eq(leaderStateGrants.scope, scope),
        isNull(leaderStateGrants.revokedAt),
        gt(leaderStateGrants.expiresAt, now),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * INTERNAL raw-row reader used ONLY by leaderState/capacitySignals.ts, and
 * ONLY after `hasActiveGrant("scheduler-optimizer-service", ownerUserId)`
 * has returned true. Never export this, never call it from an API route,
 * never return its output to a caller outside this folder.
 */
export async function internalFetchForDerivation(ownerUserId: string): Promise<{
  decisions: DecisionRecord[];
  recoverySignals: RecoverySignalRecord[];
}> {
  const [decisionRows, recoveryRows] = await Promise.all([
    db
      .select()
      .from(leaderStateDecisions)
      .where(eq(leaderStateDecisions.ownerUserId, ownerUserId))
      .orderBy(desc(leaderStateDecisions.decidedAt))
      .limit(500),
    db
      .select()
      .from(leaderStateRecoverySignals)
      .where(eq(leaderStateRecoverySignals.ownerUserId, ownerUserId))
      .orderBy(asc(leaderStateRecoverySignals.date))
      .limit(365),
  ]);
  return {
    decisions: decisionRows.map(mapDecisionRow),
    recoverySignals: recoveryRows.map(mapRecoveryRow),
  };
}
