import { db } from "@/db";
import { blockers as blockersTable } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      projectId,
      title,
      description,
      severity,
      reportedBy,
      assignedTo,
      domain,
    } = body ?? {};

    if (!projectId || !title) {
      return Response.json(
        { error: "`projectId` and `title` are required" },
        { status: 400 },
      );
    }

    const [created] = await db
      .insert(blockersTable)
      .values({
        projectId,
        title,
        description: description ?? "",
        severity: severity ?? 2,
        reportedBy: reportedBy ?? null,
        assignedTo: assignedTo ?? null,
        domain: domain ?? null,
      })
      .returning();

    return Response.json(created, { status: 201 });
  } catch (err) {
    console.error("POST /api/execution/blockers failed", err);
    return Response.json({ error: "Failed to create blocker" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const rows = await db.select().from(blockersTable);
    return Response.json(rows);
  } catch (err) {
    console.error("GET /api/execution/blockers failed", err);
    return Response.json({ error: "Failed to load blockers" }, { status: 500 });
  }
}
