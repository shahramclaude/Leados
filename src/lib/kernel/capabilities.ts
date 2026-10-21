// Built-in capability definitions. These are the only actuation surfaces the
// kernel can reach — every one of them is dry-runnable and most are
// compensable. Registration happens once via `ensureBuiltinCapabilitiesRegistered`.
import { db } from "@/db";
import { kernelFindings, kernelMetricReadings, kernelWorkItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { registerCapability } from "./registry";
import type { Capability, CapabilityContext, PredictedDiff } from "./types";

// --- metrics.read (read-only) ----------------------------------------------
interface MetricsReadInput {
  metricKey: string;
}
const metricsRead: Capability<MetricsReadInput, { metricKey: string; readings: number }> = {
  name: "metrics.read",
  riskClass: "read",
  requiredScope: "metrics:read",
  costEstimate: () => 0,
  dryRun: async (input) => ({
    summary: `Would read recent readings for ${input.metricKey}. No state changes (read-only).`,
    changes: [],
  }),
  execute: async (input) => {
    const rows = await db
      .select()
      .from(kernelMetricReadings)
      .where(eq(kernelMetricReadings.metricKey, input.metricKey));
    return { metricKey: input.metricKey, readings: rows.length };
  },
};

// --- briefing.generate (low risk, write a work item summarizing state) -----
interface BriefingInput {
  title: string;
  domain: string;
}
const briefingGenerate: Capability<BriefingInput, { workItemId: string }> = {
  name: "briefing.generate",
  riskClass: "low",
  requiredScope: "briefing:write",
  costEstimate: () => 1,
  dryRun: async (input) => ({
    summary: `Would create 1 work item "${input.title}" (kind=briefing) in domain ${input.domain}.`,
    changes: [{ entity: "kernel_work_items", field: "new_row", from: null, to: input.title }],
  }),
  execute: async (input, ctx) => {
    // Idempotency: the id is derived from the step id, not randomized, so a
    // crash-and-resume re-invocation of this exact step is a safe no-op.
    const id = `wi_${ctx.stepId}`;
    await db
      .insert(kernelWorkItems)
      .values({ id, title: input.title, kind: "briefing", status: "done", assigneeKind: "agent", assigneeId: ctx.actor.id, runId: ctx.runId, stepId: ctx.stepId })
      .onConflictDoNothing({ target: kernelWorkItems.id });
    return { workItemId: id };
  },
};

// --- finding.acknowledge (medium risk, compensable) -------------------------
interface FindingAckInput {
  findingId: string;
}
const findingAcknowledge: Capability<FindingAckInput, { previousStatus: string }> = {
  name: "finding.acknowledge",
  riskClass: "medium",
  requiredScope: "findings:write",
  costEstimate: () => 1,
  dryRun: async (input): Promise<PredictedDiff> => {
    const [row] = await db.select().from(kernelFindings).where(eq(kernelFindings.id, input.findingId)).limit(1);
    return {
      summary: `Would set finding ${input.findingId} status to "acknowledged" (currently "${row?.status ?? "unknown"}").`,
      changes: [{ entity: `kernel_findings:${input.findingId}`, field: "status", from: row?.status ?? null, to: "acknowledged" }],
    };
  },
  execute: async (input) => {
    const [row] = await db.select().from(kernelFindings).where(eq(kernelFindings.id, input.findingId)).limit(1);
    const previousStatus = row?.status ?? "open";
    await db
      .update(kernelFindings)
      .set({ status: "acknowledged", updatedAt: new Date() })
      .where(eq(kernelFindings.id, input.findingId));
    return { previousStatus };
  },
  compensate: async (input, output) => {
    await db
      .update(kernelFindings)
      .set({ status: output.previousStatus, updatedAt: new Date() })
      .where(eq(kernelFindings.id, input.findingId));
  },
};

// --- workitem.escalate (medium risk, compensable) ---------------------------
interface WorkItemEscalateInput {
  workItemId: string;
}
const workItemEscalate: Capability<WorkItemEscalateInput, { previousEscalated: boolean }> = {
  name: "workitem.escalate",
  riskClass: "medium",
  requiredScope: "workqueue:write",
  costEstimate: () => 1,
  dryRun: async (input) => ({
    summary: `Would mark work item ${input.workItemId} escalated=true.`,
    changes: [{ entity: `kernel_work_items:${input.workItemId}`, field: "escalated", from: false, to: true }],
  }),
  execute: async (input) => {
    const [row] = await db.select().from(kernelWorkItems).where(eq(kernelWorkItems.id, input.workItemId)).limit(1);
    const previousEscalated = Boolean(row?.escalated);
    await db
      .update(kernelWorkItems)
      .set({ escalated: true, updatedAt: new Date() })
      .where(eq(kernelWorkItems.id, input.workItemId));
    return { previousEscalated };
  },
  compensate: async (input, output) => {
    await db
      .update(kernelWorkItems)
      .set({ escalated: output.previousEscalated, updatedAt: new Date() })
      .where(eq(kernelWorkItems.id, input.workItemId));
  },
};

// --- demo.verifiable.write (used by tests + the integration transcript) ----
// A deliberately simple capability whose "verify" step can be made to fail
// on command (`input.forceVerifyFailure`), so the end-to-end test can inject
// a realistic failure and assert that compensation actually runs.
interface DemoWriteInput {
  workItemTitle: string;
  domain: string;
  forceVerifyFailure?: boolean;
}
const demoVerifiableWrite: Capability<DemoWriteInput, { workItemId: string }> = {
  name: "demo.verifiable.write",
  riskClass: "medium",
  requiredScope: "demo:write",
  costEstimate: () => 1,
  dryRun: async (input) => ({
    summary: `Would create 1 work item "${input.workItemTitle}" in domain ${input.domain}.`,
    changes: [{ entity: "kernel_work_items", field: "new_row", from: null, to: input.workItemTitle }],
  }),
  execute: async (input, ctx) => {
    // Idempotency: id derives from stepId (stable across resumes), and the
    // insert is a no-op on conflict — this is what makes crash-resume safe
    // to re-invoke execute() for an in-flight step without duplicating the
    // side effect. See src/lib/kernel/__tests__/crashResume.test.ts.
    const id = `wi_${ctx.stepId}`;
    await db
      .insert(kernelWorkItems)
      .values({ id, title: input.workItemTitle, kind: "demo", status: "done", assigneeKind: "agent", assigneeId: ctx.actor.id, runId: ctx.runId, stepId: ctx.stepId })
      .onConflictDoNothing({ target: kernelWorkItems.id });
    return { workItemId: id };
  },
  verify: async (input) => {
    // Deliberately-injectable failure: models a verify step that catches a
    // real-world postcondition violation (e.g. the write didn't stick, or a
    // downstream check failed) rather than always trusting execute().
    return !input.forceVerifyFailure;
  },
  compensate: async (_input, output) => {
    await db.delete(kernelWorkItems).where(eq(kernelWorkItems.id, output.workItemId));
  },
};

// --- domain.pause / domain.resume (high risk) -------------------------------
interface DomainPauseInput {
  domain: string;
  reason: string;
}
const domainPause: Capability<DomainPauseInput, { wasPaused: boolean }> = {
  name: "domain.pause",
  riskClass: "high",
  requiredScope: "domain:admin",
  costEstimate: () => 1,
  dryRun: async (input) => ({
    summary: `Would pause domain "${input.domain}". All further actuating steps in that domain would be denied until resumed.`,
    changes: [{ entity: `domain:${input.domain}`, field: "paused", from: false, to: true }],
  }),
  execute: async (input, ctx) => {
    const { pauseDomain, isDomainPaused } = await import("./severity");
    const wasPaused = await isDomainPaused(input.domain);
    await pauseDomain(input.domain, input.reason, ctx.actor);
    return { wasPaused };
  },
  compensate: async (input, output, ctx) => {
    if (!output.wasPaused) {
      const { resumeDomain } = await import("./severity");
      await resumeDomain(input.domain, ctx.actor);
    }
  },
};

export function ensureBuiltinCapabilitiesRegistered(): void {
  registerCapability(metricsRead);
  registerCapability(briefingGenerate);
  registerCapability(findingAcknowledge);
  registerCapability(workItemEscalate);
  registerCapability(demoVerifiableWrite);
  registerCapability(domainPause);
}

export type { CapabilityContext };
