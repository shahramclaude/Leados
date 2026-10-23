// Org-wide employee view: before announcement, only aggregate counts are
// visible (no names, no individual disruption classes). After the simulation
// owner announces, full per-person detail becomes visible to the viewer,
// EXCEPT that the policy still lets the subject see their own row first —
// this endpoint represents "everyone else in the org", not the subject.

import { db } from "@/db";
import { humanImpactEntries, orgPeople } from "@/db/schema";
import { aggregateOnly, canViewEntryDetail, type LedgerEntryRecord } from "@/lib/org-design/privacy";
import type { DisruptionClass, RoleChangeType } from "@/lib/org-design/types";
import { eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const simulationRunId = Number(url.searchParams.get("simulationRunId"));
  const viewerPersonId = url.searchParams.get("viewerPersonId") ? Number(url.searchParams.get("viewerPersonId")) : null;
  if (!Number.isFinite(simulationRunId)) {
    return Response.json({ ok: false, error: "simulationRunId query param is required" }, { status: 400 });
  }

  const rows = await db.select().from(humanImpactEntries).where(eq(humanImpactEntries.simulationRunId, simulationRunId));
  const peopleRows = rows.length ? await db.select().from(orgPeople).where(inArray(orgPeople.id, rows.map((e) => e.personId))) : [];
  const peopleById = new Map(peopleRows.map((p) => [p.id, p]));

  const records: LedgerEntryRecord[] = rows.map((e) => ({
    id: e.id,
    simulationRunId: e.simulationRunId,
    personId: e.personId,
    personName: peopleById.get(e.personId)?.name ?? `Person #${e.personId}`,
    unitId: e.unitId,
    roleChangeType: e.roleChangeType as RoleChangeType,
    disruptionClass: e.disruptionClass as DisruptionClass,
    supportPlanId: e.supportPlanId,
    supportPlanName: null,
    rationale: e.rationale,
    visibleToSelfAt: e.visibleToSelfAt.toISOString(),
    announcedOrgWideAt: e.announcedOrgWideAt ? e.announcedOrgWideAt.toISOString() : null,
  }));

  const anyAnnounced = records.some((e) => e.announcedOrgWideAt != null);
  const viewer = viewerPersonId != null ? ({ role: "employee" as const, personId: viewerPersonId }) : null;

  if (!anyAnnounced && !viewer) {
    return Response.json({
      ok: true,
      announced: false,
      aggregate: aggregateOnly(records),
      note: "Not yet announced org-wide: showing aggregate counts only, per self-first privacy policy.",
    });
  }

  const visibleDetail = records.filter((r) => (viewer ? canViewEntryDetail(r, viewer) : r.announcedOrgWideAt != null));

  return Response.json({
    ok: true,
    announced: anyAnnounced,
    aggregate: aggregateOnly(records),
    entries: visibleDetail,
    note: anyAnnounced
      ? "Announced: full per-person detail is visible."
      : "Not yet announced: only the entries you are authorised to see (your own, if any) are included.",
  });
}
