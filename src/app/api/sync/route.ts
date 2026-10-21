import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listPermissionOverrides, recordAuditEvent } from "@/db/repositories/orgs";
import { hasPermission, canActOnSubjectTeam } from "@/lib/permissions";
import { getSubjectInOrg, updateSubjectInOrg } from "@/db/repositories/subjects";
import { getBriefingInOrg, updateBriefingInOrg } from "@/db/repositories/engineContent";

/**
 * Offline write queue flush endpoint (Section D). This is the server half
 * of the conflict-resolution contract documented in
 * `src/lib/offlineQueue.ts`. Semantics, precisely:
 *
 *  - Every mutable row carries an integer `version`. A queued write submits
 *    the `baseVersion` it was edited against.
 *  - If `baseVersion === currentVersion`, the write applies and the version
 *    increments. Result: `applied`.
 *  - If they differ, someone else wrote the row first. We do **not**
 *    silently overwrite (no last-writer-wins). Result: `conflict`, and the
 *    server's current row is returned so the client can show a diff.
 *  - The client re-submits the same mutation with an explicit
 *    `resolution: "keepMine" | "keepTheirs"`:
 *      - `keepTheirs` discards the local change (`discarded`).
 *      - `keepMine` re-applies the local patch on top of the *current*
 *        server version (a fresh `baseVersion`), which is allowed because a
 *        human explicitly confirmed it after seeing the conflict — this is
 *        "confirmed-writer-wins", not silent last-writer-wins.
 */
type SyncMutation = {
  clientId: string;
  entityType: "subject" | "briefing";
  entityId: string;
  patch: Record<string, unknown>;
  baseVersion: number;
  resolution?: "keepMine" | "keepTheirs";
};

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated", messageKey: "errors.unauthenticated" }, { status: 401 });
  }
  const overrides = await listPermissionOverrides(user.orgId);
  const body = await request.json().catch(() => ({}));
  const mutations = (body.mutations ?? []) as SyncMutation[];

  const results = [];

  for (const mutation of mutations) {
    const requiredPermission = mutation.entityType === "subject" ? "subjects.write" : "briefings.write";
    if (!hasPermission(user.role, requiredPermission, overrides)) {
      results.push({ clientId: mutation.clientId, status: "forbidden" });
      continue;
    }

    if (mutation.entityType === "subject") {
      const existing = await getSubjectInOrg(user.orgId, mutation.entityId);
      if (!existing) {
        results.push({ clientId: mutation.clientId, status: "not_found" });
        continue;
      }
      if (!canActOnSubjectTeam(user.role, { managerOfTeamId: user.managerOfTeamId }, existing.teamId)) {
        results.push({ clientId: mutation.clientId, status: "forbidden" });
        continue;
      }
      if (mutation.resolution === "keepTheirs") {
        results.push({ clientId: mutation.clientId, status: "discarded", server: existing });
        continue;
      }
      const baseVersion = mutation.resolution === "keepMine" ? existing.version : mutation.baseVersion;
      const outcome = await updateSubjectInOrg(user.orgId, mutation.entityId, mutation.patch, baseVersion);
      if (outcome.conflict) {
        results.push({ clientId: mutation.clientId, status: "conflict", server: outcome.server });
        continue;
      }
      await recordAuditEvent({
        orgId: user.orgId,
        actorId: user.id,
        action: "subject.sync-update",
        entityType: "subject",
        entityId: mutation.entityId,
        before: existing,
        after: outcome.server,
      });
      results.push({ clientId: mutation.clientId, status: "applied", server: outcome.server });
    } else {
      const existing = await getBriefingInOrg(user.orgId, mutation.entityId);
      if (!existing) {
        results.push({ clientId: mutation.clientId, status: "not_found" });
        continue;
      }
      if (mutation.resolution === "keepTheirs") {
        results.push({ clientId: mutation.clientId, status: "discarded", server: existing });
        continue;
      }
      const baseVersion = mutation.resolution === "keepMine" ? existing.version : mutation.baseVersion;
      const outcome = await updateBriefingInOrg(
        user.orgId,
        mutation.entityId,
        { params: mutation.patch as Record<string, unknown> },
        baseVersion,
      );
      if (outcome.conflict) {
        results.push({ clientId: mutation.clientId, status: "conflict", server: outcome.server });
        continue;
      }
      results.push({ clientId: mutation.clientId, status: "applied", server: outcome.server });
    }
  }

  return NextResponse.json({ results });
}
