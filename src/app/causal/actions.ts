"use server";

import { revalidatePath } from "next/cache";
import { discoverCausalGraph, runDetectionSweep } from "@/lib/causal";
import { db } from "@/db";
import { incidents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { appendAuditEvent } from "@/lib/auditLog";

export async function runDiscoveryAction() {
  const edges = await discoverCausalGraph(3);
  await appendAuditEvent({
    actorKind: "system",
    actorId: "causal-discovery-job",
    action: "discover-causal-graph",
    target: "all-metrics",
    payload: { edgesFound: edges.length },
  });
  revalidatePath("/causal");
}

export async function runDetectionAction() {
  const created = await runDetectionSweep();
  await appendAuditEvent({
    actorKind: "system",
    actorId: "detection-sweep-job",
    action: "detect-change-points",
    target: "all-metrics",
    payload: { incidentsCreated: created },
  });
  revalidatePath("/causal");
}

export async function closeIncidentAction(formData: FormData) {
  const id = String(formData.get("id"));
  const [incident] = await db.select().from(incidents).where(eq(incidents.id, id));
  const causes = (incident?.causes as { testableHypothesis: string }[]) ?? [];
  if (!incident?.testedHypothesis && causes.length > 0) {
    throw new Error("CANNOT_CLOSE: top cause has not been marked as tested. Mark hypothesis tested first (hard block).");
  }
  await db
    .update(incidents)
    .set({ status: "closed", postmortem: { closedBy: "operator", closedAt: new Date().toISOString() } })
    .where(eq(incidents.id, id));
  revalidatePath("/causal");
}

export async function markHypothesisTestedAction(formData: FormData) {
  const id = String(formData.get("id"));
  await db.update(incidents).set({ testedHypothesis: true, status: "explained" }).where(eq(incidents.id, id));
  revalidatePath("/causal");
}
