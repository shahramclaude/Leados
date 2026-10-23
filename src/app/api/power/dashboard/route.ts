import { db } from "@/db";
import {
  dualControlActions,
  dualControlViolationAttempts,
  conflictDeclarations,
  conflictProximityWarnings,
  conflictRecusals,
} from "@/db/schema";

export const dynamic = "force-dynamic";

// Org-level aggregates ONLY — this endpoint never returns per-person
// breakdowns, which is the explicit anti-profiling guarantee for the Power
// Dashboard described in the brief.
export async function GET() {
  const actions = await db.select().from(dualControlActions);
  const violations = await db.select().from(dualControlViolationAttempts);
  const declarations = await db.select().from(conflictDeclarations);
  const warnings = await db.select().from(conflictProximityWarnings);
  const recusals = await db.select().from(conflictRecusals);

  const executed = actions.filter((a) => a.status === "executed").length;
  const pending = actions.filter((a) => a.status === "pending").length;

  const unresolvedWarnings = warnings.filter((w) => !w.resolved).length;
  const resolvedWarnings = warnings.length - unresolvedWarnings;

  return Response.json({
    dualControl: {
      totalRequested: actions.length,
      executed,
      pending,
      blockedSingleActorAttempts: violations.length,
      coveragePct: actions.length === 0 ? 100 : Math.round((executed / actions.length) * 100),
      note: "Every executed action required 2+ distinct people by construction; single-actor attempts are counted but never succeed.",
    },
    conflictsOfInterest: {
      totalDeclarations: declarations.length,
      recusalsRecorded: recusals.length,
      proximityWarningsRaised: warnings.length,
      proximityWarningsResolved: resolvedWarnings,
      proximityWarningsUnresolved: unresolvedWarnings,
      recusalCompliancePct: warnings.length === 0 ? 100 : Math.round((resolvedWarnings / warnings.length) * 100),
    },
  });
}
