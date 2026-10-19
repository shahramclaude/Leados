// =============================================================================
// Leados — Agent core cycle
// -----------------------------------------------------------------------------
// Not present in this checkout. A minimal cycle runner is added here so Part
// 6's requirement ("Insert a snapshot every agent cycle — agentCore.ts Step
// 9, add this") has a concrete home. Steps 1-8 (belief updates, stakeholder
// scans, etc. from earlier parts) are out of scope for this checkout; Step 9
// — project snapshotting — is implemented fully below.
// =============================================================================

import { db } from "@/db";
import { projectSnapshots as snapshotsTable } from "@/db/schema";
import { loadExecutionDomain } from "./orchestrator";

/**
 * Step 9 — Snapshot every project's confidence/status/blocker/milestone
 * state. Called once per agent cycle so project_snapshots accumulates a
 * time series that executionIntelligence / metricsEngine's
 * detectProjectAnomalies can analyze for structural breaks & trend reversals.
 */
export async function runAgentCycleStep9Snapshot(): Promise<{ inserted: number }> {
  const { projects, milestones, blockers } = await loadExecutionDomain();
  const now = new Date();

  const rows = projects.map((project) => {
    const projectMilestones = milestones.filter((m) => m.projectId === project.id);
    const openBlockers = blockers.filter((b) => b.projectId === project.id && !b.resolvedAt);
    const done = projectMilestones.filter((m) => m.status === "done").length;

    return {
      projectId: project.id,
      snapshotAt: now,
      confidence: project.confidence,
      status: project.status,
      blockerCount: openBlockers.length,
      milestoneDone: done,
      milestoneTotal: projectMilestones.length,
    };
  });

  if (rows.length === 0) return { inserted: 0 };

  await db.insert(snapshotsTable).values(rows);
  return { inserted: rows.length };
}

/**
 * runAgentCycle(): runs the full per-cycle pipeline. Only Step 9 is
 * implemented in this checkout (see header note).
 */
export async function runAgentCycle() {
  const step9 = await runAgentCycleStep9Snapshot();
  return { step9 };
}
