import { db } from "@/db";
import { milestones as milestonesTable } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { projectId, title, dueDate, status } = body ?? {};

    if (!projectId || !title) {
      return Response.json(
        { error: "`projectId` and `title` are required" },
        { status: 400 },
      );
    }

    const [created] = await db
      .insert(milestonesTable)
      .values({
        projectId,
        title,
        dueDate: dueDate ? new Date(dueDate) : null,
        status: status ?? "pending",
      })
      .returning();

    return Response.json(created, { status: 201 });
  } catch (err) {
    console.error("POST /api/execution/milestones failed", err);
    return Response.json({ error: "Failed to create milestone" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const rows = await db.select().from(milestonesTable);
    return Response.json(rows);
  } catch (err) {
    console.error("GET /api/execution/milestones failed", err);
    return Response.json({ error: "Failed to load milestones" }, { status: 500 });
  }
}
