import { NextRequest } from "next/server";
import { db } from "@/db";
import { objectives } from "@/db/schema";
import { DEFAULT_ORG_ID } from "@/lib/org";
import { appendAuditEvent } from "@/lib/audit";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(objectives).where(eq(objectives.orgId, DEFAULT_ORG_ID));
  return Response.json({ items: rows });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.title || typeof body.title !== "string") {
    return Response.json({ code: "validation_error", detail: "title is required" }, { status: 400 });
  }
  const [row] = await db
    .insert(objectives)
    .values({
      orgId: DEFAULT_ORG_ID,
      title: body.title,
      description: body.description ?? null,
      status: body.status ?? "on_track",
      targetDate: body.targetDate ? new Date(body.targetDate) : null,
    })
    .returning();
  await appendAuditEvent({
    orgId: DEFAULT_ORG_ID,
    action: "objective.created",
    entityType: "objective",
    entityId: row.id,
    metadata: { title: row.title },
  });
  return Response.json({ item: row }, { status: 201 });
}
