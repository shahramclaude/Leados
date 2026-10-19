// =============================================================================
// LEADOS kernel — built-in capabilities
// =============================================================================
// Every capability the kernel can ever invoke is registered here, at module
// load time, via registerCapability(). Nothing else can run (registry.ts is
// default-deny). Each capability must support dry-run simulation and declare
// an explicit risk class + default enforcement mode + undo strategy.

import { db } from "@/db";
import { findings, notifications, rules, workItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { registerCapability } from "./registry";
import type { Capability, CapabilityContext, PredictedDiff } from "./types";

// -----------------------------------------------------------------------------
// 1. findings.create_work_item — low risk, auto. Turns an open finding into a
//    proposed task on the work queue. Fully reversible (delete the row).
// -----------------------------------------------------------------------------

interface CreateWorkItemParams {
  findingId: number;
  title: string;
  description: string;
  domain: string;
  riskClass?: "low" | "medium" | "high";
  slaHours?: number;
}

const createWorkItemCapability: Capability<CreateWorkItemParams> = {
  key: "findings.create_work_item",
  description: "Propose a work-queue task from an open finding.",
  domain: "work_queue",
  riskClass: "low",
  defaultMode: "auto",
  permissionScope: "work_queue:write",
  dryRunSupported: true,
  estimateCost: () => 1,
  simulate: async (params): Promise<PredictedDiff> => ({
    summary: `Would create work item "${params.title}" in domain ${params.domain} for finding #${params.findingId}.`,
    changes: [{ entity: "work_items", field: "new_row", before: null, after: { title: params.title, domain: params.domain } }],
  }),
  execute: async (params, ctx) => {
    const slaDueAt = params.slaHours ? new Date(Date.now() + params.slaHours * 3600_000) : null;
    const [row] = await db
      .insert(workItems)
      .values({
        title: params.title,
        description: params.description,
        domain: params.domain,
        proposedBy: "agent:kernel",
        status: "proposed",
        riskClass: params.riskClass ?? "low",
        slaDueAt,
        evidence: { findingId: params.findingId },
      })
      .returning();
    return {
      summary: `Created work item #${row.id}: ${row.title}`,
      data: { workItemId: row.id },
      undoHandle: `work_item:${row.id}`,
    };
  },
  undo: async (undoHandle) => {
    const id = Number(undoHandle.split(":")[1]);
    if (!Number.isFinite(id)) return;
    await db.update(workItems).set({ status: "reverted", updatedAt: new Date() }).where(eq(workItems.id, id));
  },
};

// -----------------------------------------------------------------------------
// 2. notifications.notify — low risk, auto. Pure, reversible (mark read).
// -----------------------------------------------------------------------------

interface NotifyParams {
  title: string;
  body: string;
  severity?: "info" | "warn" | "critical";
  linkedWorkItemId?: number;
}

const notifyCapability: Capability<NotifyParams> = {
  key: "notifications.notify",
  description: "Send an in-app notification.",
  domain: "notifications",
  riskClass: "low",
  defaultMode: "auto",
  permissionScope: "notifications:write",
  dryRunSupported: true,
  estimateCost: () => 1,
  simulate: async (params): Promise<PredictedDiff> => ({
    summary: `Would notify: "${params.title}".`,
    changes: [{ entity: "notifications", field: "new_row", before: null, after: { title: params.title } }],
  }),
  execute: async (params) => {
    const [row] = await db
      .insert(notifications)
      .values({
        type: "agent",
        title: params.title,
        body: params.body,
        severity: params.severity ?? "info",
        linkedWorkItemId: params.linkedWorkItemId ?? undefined,
      })
      .returning();
    return { summary: `Notification #${row.id} sent.`, data: { notificationId: row.id }, undoHandle: `notification:${row.id}` };
  },
  undo: async (undoHandle) => {
    const id = Number(undoHandle.split(":")[1]);
    if (!Number.isFinite(id)) return;
    await db.update(notifications).set({ read: true }).where(eq(notifications.id, id));
  },
};

// -----------------------------------------------------------------------------
// 3. playbook.trigger_escalation — medium risk, ask-once. Represents acting
//    on a "real system" stand-in (escalating a work item into running state,
//    i.e. actually kicking off remediation). Requires human approval.
// -----------------------------------------------------------------------------

interface EscalateParams {
  workItemId: number;
  assignee: string;
}

const triggerEscalationCapability: Capability<EscalateParams> = {
  key: "playbook.trigger_escalation",
  description: "Escalate a work item to 'running' and assign an owner (acts on the outside world).",
  domain: "work_queue",
  riskClass: "medium",
  defaultMode: "ask-once",
  permissionScope: "work_queue:escalate",
  dryRunSupported: true,
  estimateCost: () => 3,
  simulate: async (params): Promise<PredictedDiff> => ({
    summary: `Would escalate work item #${params.workItemId} to 'running', assigned to ${params.assignee}.`,
    changes: [{ entity: "work_items", field: "status", before: "approved", after: "running" }],
  }),
  execute: async (params) => {
    const before = await db.select().from(workItems).where(eq(workItems.id, params.workItemId)).limit(1);
    const prevStatus = before[0]?.status ?? "proposed";
    await db
      .update(workItems)
      .set({ status: "running", assignee: params.assignee, updatedAt: new Date() })
      .where(eq(workItems.id, params.workItemId));
    return {
      summary: `Work item #${params.workItemId} escalated to running, assigned to ${params.assignee}.`,
      data: { workItemId: params.workItemId },
      undoHandle: `work_item_status:${params.workItemId}:${prevStatus}`,
    };
  },
  undo: async (undoHandle) => {
    const [, idStr, prevStatus] = undoHandle.split(":");
    const id = Number(idStr);
    if (!Number.isFinite(id)) return;
    await db.update(workItems).set({ status: prevStatus, updatedAt: new Date() }).where(eq(workItems.id, id));
  },
};

// -----------------------------------------------------------------------------
// 4. findings.auto_resolve — high risk, manual only. The kernel will NEVER
//    execute this directly (manual mode); it can only ever be proposed. This
//    exists specifically to prove the "manual" enforcement tier is real.
// -----------------------------------------------------------------------------

interface AutoResolveParams {
  findingId: number;
}

const autoResolveCapability: Capability<AutoResolveParams> = {
  key: "findings.auto_resolve",
  description: "Mark a finding resolved without human review. HIGH RISK — manual tier only.",
  domain: "findings",
  riskClass: "high",
  defaultMode: "manual",
  permissionScope: "findings:write",
  dryRunSupported: true,
  estimateCost: () => 5,
  simulate: async (params): Promise<PredictedDiff> => ({
    summary: `Would resolve finding #${params.findingId} without human review.`,
    changes: [{ entity: "findings", field: "status", before: "open", after: "resolved" }],
  }),
  execute: async (params) => {
    await db.update(findings).set({ status: "resolved", resolvedAt: new Date() }).where(eq(findings.id, params.findingId));
    return { summary: `Finding #${params.findingId} resolved.`, undoHandle: `finding:${params.findingId}` };
  },
  undo: async (undoHandle) => {
    const id = Number(undoHandle.split(":")[1]);
    if (!Number.isFinite(id)) return;
    await db.update(findings).set({ status: "open", resolvedAt: null }).where(eq(findings.id, id));
  },
};

// -----------------------------------------------------------------------------
// 5. rules.adjust_weight — medium risk, ask-once. Backs the self-improvement
//    loop's *merge* step (never silent — see selfImprove.ts, which always
//    requires an approved proposal before calling this).
// -----------------------------------------------------------------------------

interface AdjustWeightParams {
  ruleId: number;
  newWeight: number;
}

const adjustWeightCapability: Capability<AdjustWeightParams> = {
  key: "rules.adjust_weight",
  description: "Change a rule's calibration weight (production rule change).",
  domain: "rules",
  riskClass: "medium",
  defaultMode: "ask-once",
  permissionScope: "rules:write",
  dryRunSupported: true,
  estimateCost: () => 2,
  simulate: async (params, ctx: CapabilityContext): Promise<PredictedDiff> => {
    const rows = await db.select().from(rules).where(eq(rules.id, params.ruleId)).limit(1);
    const before = rows[0]?.weight ?? null;
    return {
      summary: `Would change rule #${params.ruleId} weight ${before} -> ${params.newWeight}.`,
      changes: [{ entity: "rules", field: "weight", before, after: params.newWeight }],
    };
  },
  execute: async (params) => {
    const rows = await db.select().from(rules).where(eq(rules.id, params.ruleId)).limit(1);
    const before = rows[0]?.weight ?? 1;
    await db.update(rules).set({ weight: params.newWeight, updatedAt: new Date() }).where(eq(rules.id, params.ruleId));
    return {
      summary: `Rule #${params.ruleId} weight set to ${params.newWeight}.`,
      undoHandle: `rule_weight:${params.ruleId}:${before}`,
    };
  },
  undo: async (undoHandle) => {
    const [, idStr, beforeStr] = undoHandle.split(":");
    const id = Number(idStr);
    const before = Number(beforeStr);
    if (!Number.isFinite(id) || !Number.isFinite(before)) return;
    await db.update(rules).set({ weight: before, updatedAt: new Date() }).where(eq(rules.id, id));
  },
};

let registered = false;

/** Idempotent — safe to call from multiple route handlers / tests. */
export function ensureBuiltinCapabilitiesRegistered(): void {
  if (registered) return;
  registerCapability(createWorkItemCapability);
  registerCapability(notifyCapability);
  registerCapability(triggerEscalationCapability);
  registerCapability(autoResolveCapability);
  registerCapability(adjustWeightCapability);
  registered = true;
}
