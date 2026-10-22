import { NextResponse } from "next/server";
import { db } from "@/db";
import { agendaItems, cadenceOverrides, ritualOccurrences, rituals } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { resolveOrgId } from "@/lib/cadence/resolveOrg";

export const dynamic = "force-dynamic";

export interface OccurrenceHealth {
  id: string;
  ritualId: string;
  ritualName: string;
  ritualKind: string;
  occurrenceKey: string;
  scheduledFor: string;
  status: string;
  cadenceMode: string;
  cadenceReason: string | null;
  quorumRequired: number;
  quorumMet: boolean | null;
  attendeeCount: number | null;
  agendaItemCount: number;
  health: "on_track" | "skipped" | "degraded" | "awaiting_capture" | "scheduled";
  hasOverride: boolean;
}

function deriveHealth(status: string, cadenceMode: string, quorumMet: boolean | null): OccurrenceHealth["health"] {
  if (status === "skipped" || status === "missed") return "skipped";
  if (cadenceMode === "async_checklist") return "degraded";
  if (status === "held" && quorumMet === false) return "degraded";
  if (status === "held" || status === "degraded_async") return "on_track";
  if (status === "agenda_generated") return "awaiting_capture";
  return "scheduled";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orgId = await resolveOrgId(url.searchParams);

  const rows = await db
    .select({ occurrence: ritualOccurrences, ritual: rituals })
    .from(ritualOccurrences)
    .innerJoin(rituals, eq(ritualOccurrences.ritualId, rituals.id))
    .where(eq(ritualOccurrences.orgId, orgId))
    .orderBy(desc(ritualOccurrences.scheduledFor));

  const overrideRows = await db.select().from(cadenceOverrides).where(eq(cadenceOverrides.orgId, orgId));
  const ritualsWithOverride = new Set(overrideRows.map((o) => o.ritualId));

  const items: OccurrenceHealth[] = [];
  for (const row of rows) {
    const agendaRows = await db.select().from(agendaItems).where(eq(agendaItems.occurrenceId, row.occurrence.id));
    items.push({
      id: row.occurrence.id,
      ritualId: row.ritual.id,
      ritualName: row.ritual.name,
      ritualKind: row.ritual.kind,
      occurrenceKey: row.occurrence.occurrenceKey,
      scheduledFor: row.occurrence.scheduledFor.toISOString(),
      status: row.occurrence.status,
      cadenceMode: row.occurrence.cadenceMode,
      cadenceReason: row.occurrence.cadenceReason,
      quorumRequired: row.ritual.quorum,
      quorumMet: row.occurrence.quorumMet,
      attendeeCount: row.occurrence.attendeeCount,
      agendaItemCount: agendaRows.length,
      health: deriveHealth(row.occurrence.status, row.occurrence.cadenceMode, row.occurrence.quorumMet),
      hasOverride: ritualsWithOverride.has(row.ritual.id),
    });
  }

  return NextResponse.json({ orgId, occurrences: items });
}
