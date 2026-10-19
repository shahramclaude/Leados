import { db } from "@/db";
import { blockers } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(blockers);
  return Response.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (
    !body ||
    typeof body.projectId !== "number" ||
    typeof body.title !== "string" ||
    typeof body.severity !== "number"
  ) {
    return Response.json({ error: "projectId, title and severity are required" }, { status: 400 });
  }

  const [created] = await db
    .insert(blockers)
    .values({
      projectId: body.projectId,
      title: body.title,
      severity: Math.max(1, Math.min(5, Math.round(body.severity))),
      reportedBy: typeof body.reportedBy === "number" ? body.reportedBy : null,
      assignedTo: typeof body.assignedTo === "number" ? body.assignedTo : null,
      domain: typeof body.domain === "string" ? body.domain : null,
    })
    .returning();

  return Response.json(created, { status: 201 });
}
