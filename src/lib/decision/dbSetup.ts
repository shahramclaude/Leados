// =============================================================================
// LEADOS — Part 23 — Decision immutability invariant (DB-level)
// =============================================================================
// Frozen-record semantics are enforced in TWO layers:
//  1. Application layer (decisionEngine.ts) refuses to call UPDATE on frozen
//     fields once committed_at is set.
//  2. Database layer (this file) installs a BEFORE UPDATE trigger on
//     `decisions` that RAISES an exception if any frozen column differs from
//     its committed value — this closes the gap for any code path (including
//     raw SQL) that might bypass the application layer, which is what the
//     Phase 4 "immutability test" (gate 1) exercises.
//
// This is idempotent (CREATE OR REPLACE / DROP+CREATE) and cheap, so we run it
// lazily once per server process via `ensureDecisionInvariants()`, called at
// the top of every decision API route and from the seed/verify scripts. This
// means a freshly bootstrapped sandbox (e.g. after `build_and_start` runs
// `drizzle-kit push`, which does not know about triggers) self-heals the
// invariant on first use without any manual step.
// =============================================================================

import { db } from "@/db";
import { sql } from "drizzle-orm";

let setupPromise: Promise<void> | null = null;

const FROZEN_COLUMNS = [
  "question",
  "decision_type",
  "options_considered",
  "option_evidence",
  "chosen",
  "choice_rationale",
  "dissent_snapshot",
  "expected_outcome",
  "expected_interval",
  "confidence_class",
  "decided_by",
  "decision_rights_snapshot",
  "reversibility_plan",
  "trigger_conditions",
  "impact",
  "raised_by",
  "raised_at",
  "framed_at",
  "evidence_gathered_at",
  "committed_at",
  "org_id",
  "decision_class",
];

async function runSetupSql(): Promise<void> {
  const comparisons = FROZEN_COLUMNS.map(
    (col) => `(OLD."${col}" IS DISTINCT FROM NEW."${col}")`,
  ).join(" OR ");

  await db.execute(sql.raw(`
    CREATE OR REPLACE FUNCTION prevent_frozen_decision_mutation()
    RETURNS trigger AS $$
    BEGIN
      IF OLD.committed_at IS NOT NULL THEN
        IF ${comparisons} THEN
          RAISE EXCEPTION 'invalid: decision record % is frozen post-commit; use a correction event instead', OLD.id;
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `));

  await db.execute(
    sql.raw(`DROP TRIGGER IF EXISTS trg_prevent_frozen_decision_mutation ON decisions;`),
  );

  await db.execute(sql.raw(`
    CREATE TRIGGER trg_prevent_frozen_decision_mutation
    BEFORE UPDATE ON decisions
    FOR EACH ROW
    EXECUTE FUNCTION prevent_frozen_decision_mutation();
  `));
}

/** Idempotent, once-per-process. Call before any decision read/write path. */
export function ensureDecisionInvariants(): Promise<void> {
  if (!setupPromise) {
    setupPromise = runSetupSql().catch((err) => {
      // allow retry on next call if setup itself failed (e.g. DB not ready yet)
      setupPromise = null;
      throw err;
    });
  }
  return setupPromise;
}
