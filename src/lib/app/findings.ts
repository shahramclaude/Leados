// src/lib/app/findings.ts — use-cases wiring RBAC + the findings repository
// together for the dashboard and its offline write queue.

import { requirePermission } from "@/lib/platform/authz";
import {
  createFinding,
  getFinding,
  listFindings,
  updateFindingStatus,
  type UpdateResult,
} from "@/lib/platform/db/findingsRepository";
import type { Finding } from "@/db/schema";
import type { FindingInput, SessionContext } from "@/lib/domain/types";

export async function listFindingsForSession(session: SessionContext): Promise<Finding[]> {
  requirePermission(session, "findings:view");
  return listFindings(session.orgId);
}

export async function createFindingForSession(
  session: SessionContext,
  input: FindingInput,
): Promise<{ finding: Finding; wasExisting: boolean }> {
  requirePermission(session, "findings:create");
  if (!input.title || input.title.trim().length === 0) {
    throw new Error("Title is required.");
  }
  const severity = Math.min(5, Math.max(1, Math.round(input.severity || 1)));
  return createFinding(session.orgId, {
    title: input.title.trim(),
    domain: input.domain || "general",
    team: input.team || "General",
    severity,
    summary: input.summary || "",
    clientMutationId: input.clientMutationId,
  });
}

export async function resolveFindingForSession(
  session: SessionContext,
  findingId: string,
  expectedUpdatedAt: string,
): Promise<UpdateResult> {
  requirePermission(session, "findings:resolve");
  return updateFindingStatus(session.orgId, findingId, { status: "resolved" }, expectedUpdatedAt);
}

export async function getFindingForSession(
  session: SessionContext,
  findingId: string,
): Promise<Finding | undefined> {
  requirePermission(session, "findings:view");
  return getFinding(session.orgId, findingId);
}
