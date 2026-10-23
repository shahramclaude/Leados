// Human-confirmation gate (Phase 4 gate #3): no obligation — and no clause — may become an
// enforceable/active record without an explicit human confirmation. These are pure functions so they
// can be unit tested without a database (tests/obligationGate.test.ts), plus thin DB-aware wrappers
// used by the API routes.

import { db } from "@/db";
import { clauses, obligations } from "@/db/schema";
import { eq } from "drizzle-orm";

export class ConfirmationRequiredError extends Error {
  constructor(entity: string) {
    super(`${entity} cannot be committed: it has not been human-confirmed. Draft semantics forbid this.`);
    this.name = "ConfirmationRequiredError";
  }
}

export interface ConfirmableClause {
  status: "draft" | "confirmed" | "rejected";
  confirmedAt: Date | null;
}

export interface ConfirmableObligation {
  status: "draft" | "confirmed" | "active" | "breached" | "completed";
  confirmedAt: Date | null;
  clause: ConfirmableClause;
}

/** Pure gate check — throws unless the clause has been explicitly confirmed by a human. */
export function assertClauseConfirmed(clause: ConfirmableClause): void {
  if (clause.status !== "confirmed" || !clause.confirmedAt) {
    throw new ConfirmationRequiredError("Clause");
  }
}

/**
 * Pure gate check for committing an obligation (i.e. moving it to 'active' so it appears on the
 * Obligation Board as a live, enforceable item). Requires BOTH the obligation itself and its source
 * clause to be human-confirmed — an obligation drafted from an unconfirmed clause can never be
 * committed, even if someone tries to confirm the obligation record directly.
 */
export function assertObligationCommittable(obligation: ConfirmableObligation): void {
  assertClauseConfirmed(obligation.clause);
  if (obligation.status !== "confirmed" || !obligation.confirmedAt) {
    throw new ConfirmationRequiredError("Obligation");
  }
}

export async function confirmClause(clauseId: number, confirmedBy: string) {
  const [row] = await db
    .update(clauses)
    .set({ status: "confirmed", confirmedBy, confirmedAt: new Date() })
    .where(eq(clauses.id, clauseId))
    .returning();
  return row;
}

export async function rejectClause(clauseId: number, confirmedBy: string) {
  const [row] = await db
    .update(clauses)
    .set({ status: "rejected", confirmedBy, confirmedAt: new Date() })
    .where(eq(clauses.id, clauseId))
    .returning();
  return row;
}

export async function confirmObligation(obligationId: number, confirmedBy: string) {
  const [obligation] = await db.select().from(obligations).where(eq(obligations.id, obligationId));
  if (!obligation) throw new Error("Obligation not found");

  const [clause] = await db.select().from(clauses).where(eq(clauses.id, obligation.clauseId));
  if (!clause) throw new Error("Source clause not found");

  assertClauseConfirmed({
    status: clause.status as ConfirmableClause["status"],
    confirmedAt: clause.confirmedAt,
  });

  const [row] = await db
    .update(obligations)
    .set({ status: "confirmed", confirmedBy, confirmedAt: new Date() })
    .where(eq(obligations.id, obligationId))
    .returning();
  return row;
}

/** Commits a confirmed obligation into the 'active' lifecycle state — the only path onto the live board. */
export async function commitObligation(obligationId: number) {
  const [obligation] = await db.select().from(obligations).where(eq(obligations.id, obligationId));
  if (!obligation) throw new Error("Obligation not found");

  const [clause] = await db.select().from(clauses).where(eq(clauses.id, obligation.clauseId));
  if (!clause) throw new Error("Source clause not found");

  assertObligationCommittable({
    status: obligation.status as ConfirmableObligation["status"],
    confirmedAt: obligation.confirmedAt,
    clause: {
      status: clause.status as ConfirmableClause["status"],
      confirmedAt: clause.confirmedAt,
    },
  });

  const [row] = await db
    .update(obligations)
    .set({ status: "active" })
    .where(eq(obligations.id, obligationId))
    .returning();
  return row;
}
