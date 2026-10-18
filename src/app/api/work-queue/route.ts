import { NextRequest, NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { leados_people, leados_work_queue } from "@/db/schema";
import { publishStreamEvent } from "@/lib/eventBus";

export const dynamic = "force-dynamic";

/** GET /api/work-queue?status=&priority=&domain= — list work items with filters. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const domain = searchParams.get("domain");

  const [items, people] = await Promise.all([
    db.select().from(leados_work_queue).orderBy(desc(leados_work_queue.priority), desc(leados_work_queue.createdAt)),
    db.select().from(leados_people),
  ]);

  const peopleMap = new Map(people.map((p) => [p.id, p.name]));
  const titleMap = new Map(items.map((i) => [i.id, i.title]));

  let filtered = items;
  if (status && status !== "all") filtered = filtered.filter((i) => i.status === status);
  if (priority && priority !== "all") filtered = filtered.filter((i) => String(i.priority) === priority);
  if (domain && domain !== "all") filtered = filtered.filter((i) => i.domain === domain);

  const enriched = filtered.map((i) => ({
    ...i,
    assignedToName: i.assignedTo ? peopleMap.get(i.assignedTo) ?? null : null,
    blockedByTitles: (i.blockedBy ?? []).map((id) => ({ id, title: titleMap.get(id) ?? `#${id}` })),
    blocking: items
      .filter((other) => (other.blockedBy ?? []).includes(i.id))
      .map((other) => ({ id: other.id, title: other.title })),
  }));

  return NextResponse.json({ items: enriched, people });
}

/**
 * PATCH /api/work-queue — bulk update.
 * body: { ids: number[], action: "dismiss" | "resolve" | "assign" | "reopen", assignedTo?: number, outcomeNotes?: string }
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const ids: number[] = Array.isArray(body?.ids) ? body.ids.map(Number).filter(Number.isFinite) : [];
  const action: string = body?.action;

  if (!ids.length) {
    return NextResponse.json({ error: "ids[] is required" }, { status: 400 });
  }

  let updateValues: Partial<typeof leados_work_queue.$inferInsert> = {};
  switch (action) {
    case "dismiss":
      updateValues = { status: "dismissed", resolvedAt: new Date(), outcomeNotes: body?.outcomeNotes ?? null };
      break;
    case "resolve":
      updateValues = { status: "resolved", resolvedAt: new Date(), outcomeNotes: body?.outcomeNotes ?? null };
      break;
    case "reopen":
      updateValues = { status: "pending", resolvedAt: null };
      break;
    case "assign":
      updateValues = { assignedTo: Number.isFinite(Number(body?.assignedTo)) ? Number(body.assignedTo) : null };
      break;
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const rows = await db
    .update(leados_work_queue)
    .set(updateValues)
    .where(inArray(leados_work_queue.id, ids))
    .returning();

  for (const row of rows) {
    publishStreamEvent({ type: "work_item", action: "updated", payload: row });
  }

  return NextResponse.json({ updated: rows.length, items: rows });
}
