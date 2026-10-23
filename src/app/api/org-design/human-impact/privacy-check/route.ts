// Demonstrates the self-visibility attempt matrix for a single ledger entry —
// used by the admin privacy self-check panel in the UI, and mirrors the
// logic exercised in scripts/verify.ts gate 3.

import { db } from "@/db";
import { humanImpactEntries, orgPeople } from "@/db/schema";
import { runPrivacyAttemptMatrix, type LedgerEntryRecord } from "@/lib/org-design/privacy";
import type { DisruptionClass, RoleChangeType } from "@/lib/org-design/types";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const entryId = Number(url.searchParams.get("entryId"));
  if (!Number.isFinite(entryId)) {
    return Response.json({ ok: false, error: "entryId query param is required" }, { status: 400 });
  }
  const [row] = await db.select().from(humanImpactEntries).where(eq(humanImpactEntries.id, entryId));
  if (!row) return Response.json({ ok: false, error: "Entry not found" }, { status: 404 });

  const [person] = await db.select().from(orgPeople).where(eq(orgPeople.id, row.personId));
  const otherPerson = await db.select().from(orgPeople).where(eq(orgPeople.unitId, row.unitId));
  const otherPersonId = otherPerson.find((p) => p.id !== row.personId)?.id ?? row.personId + 1;

  const record: LedgerEntryRecord = {
    id: row.id,
    simulationRunId: row.simulationRunId,
    personId: row.personId,
    personName: person?.name ?? `Person #${row.personId}`,
    unitId: row.unitId,
    roleChangeType: row.roleChangeType as RoleChangeType,
    disruptionClass: row.disruptionClass as DisruptionClass,
    supportPlanId: row.supportPlanId,
    supportPlanName: null,
    rationale: row.rationale,
    visibleToSelfAt: row.visibleToSelfAt.toISOString(),
    announcedOrgWideAt: row.announcedOrgWideAt ? row.announcedOrgWideAt.toISOString() : null,
  };

  const matrix = runPrivacyAttemptMatrix(record, otherPersonId);
  return Response.json({ ok: true, entry: record, matrix, allPass: matrix.every((m) => m.pass) });
}
