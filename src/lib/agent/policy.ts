// LEADOS Agent Kernel — PolicyGate.
//
// Every tool call in this system passes through `evaluate()` before
// `invokeTool()` will run it (tools.ts refuses to execute without an
// allowing decision). `evaluate` is a pure function of (node, input,
// context) — no network calls, no LLM — so policy decisions are
// deterministic and unit-testable.
import type { PlanNode, PolicyDecision, Role, ToolId } from "./types";

export interface PolicyContext {
  approvedApprovalId: number | null; // resolved approval for this node, if any
}

const APPROVAL_ROLES_BY_TOOL: Partial<Record<ToolId, Role[]>> = {
  "budget.reallocate": ["finance-lead"],
  "email.send": ["executive-sponsor", "compliance-officer"],
  "data.export": ["compliance-officer"],
  "migration.run": ["compliance-officer", "executive-sponsor"],
  "policy.draft": ["compliance-officer"],
};

function isCrossTenantExport(toolId: ToolId, input: Record<string, unknown>): boolean {
  if (toolId !== "data.export") return false;
  const owner = input.ownerTenantId;
  const target = input.targetTenantId;
  return typeof owner === "string" && typeof target === "string" && owner !== target;
}

function isMassEmail(toolId: ToolId, input: Record<string, unknown>): boolean {
  if (toolId !== "email.send") return false;
  const count = typeof input.recipientCount === "number" ? input.recipientCount : 0;
  return count > 50;
}

function isDestructiveMigrationWithoutWindow(toolId: ToolId, input: Record<string, unknown>): boolean {
  if (toolId !== "migration.run") return false;
  return input.destructive === true && input.maintenanceWindow !== true;
}

function isExternalSendBypassingApproval(toolId: ToolId, input: Record<string, unknown>): boolean {
  if (toolId !== "email.send" && toolId !== "data.export") return false;
  return input.skipApproval === true;
}

export function evaluate(
  node: Pick<PlanNode, "tool" | "riskTier">,
  input: Record<string, unknown>,
  ctx: PolicyContext
): PolicyDecision {
  const reasons: string[] = [];

  // --- Hard-deny rules (cannot be overridden by any approval). ---
  if (isCrossTenantExport(node.tool, input)) {
    return {
      allow: false,
      reasons: ["PROHIBITED: cross-tenant data export is never permitted, regardless of approval"],
    };
  }
  if (isMassEmail(node.tool, input)) {
    return {
      allow: false,
      reasons: [
        "PROHIBITED: mass email exceeding 50 recipients must go through the compliance campaign workflow, not agent approval",
      ],
    };
  }
  if (isDestructiveMigrationWithoutWindow(node.tool, input)) {
    return {
      allow: false,
      reasons: ["PROHIBITED: destructive migrations may only run inside an approved maintenance window"],
    };
  }
  if (isExternalSendBypassingApproval(node.tool, input)) {
    return {
      allow: false,
      reasons: ["PROHIBITED: external actions cannot set skipApproval=true to bypass human review"],
    };
  }

  // --- Risk-tier gating. ---
  if (node.riskTier <= 1) {
    reasons.push(`risk tier ${node.riskTier} permits autonomous execution (read-only or idempotent write)`);
    return { allow: true, reasons };
  }
  if (node.riskTier === 2) {
    reasons.push("risk tier 2 permits autonomous execution; logged for audit, reversible by compensation");
    return { allow: true, reasons };
  }

  // riskTier 3 or 4 require a resolved, approved approval ticket.
  const requiredRoles = APPROVAL_ROLES_BY_TOOL[node.tool] ?? (["executive-sponsor"] as Role[]);
  if (ctx.approvedApprovalId != null) {
    reasons.push(`risk tier ${node.riskTier} executed under approval #${ctx.approvedApprovalId}`);
    return { allow: true, reasons };
  }
  reasons.push(
    `PENDING_APPROVAL: risk tier ${node.riskTier} requires human approval from ${requiredRoles.join(", ")} before execution`
  );
  return { allow: false, reasons, requiresApprovalFrom: requiredRoles };
}
