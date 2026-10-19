import { db } from "@/db";
import { milestones as milestonesTable } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const milestoneId = Number(id);
    if (!Number.isFinite(milestoneId)) {
      return Response.json({ error: "Invalid milestone id" }, { status: 400 });
    }

    const body = await req.json();
    const patch: Record<string, unknown> = {};
    if ("title" in (body ?? {})) patch.title = body.title;
    if ("dueDate" in (body ?? {})) {
      patch.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    }
    if ("status" in (body ?? {})) {
      patch.status = body.status;
      if (body.status === "done") patch.completedAt = sql`now()`;
    }

    const [updated] = await db
      .update(milestonesTable)
      .set(patch)
      .where(eq(milestonesTable.id, milestoneId))
      .returning();

    if (!updated) {
      return Response.json({ error: "Milestone not found" }, { status: 404 });
    }

    return Response.json(updated);
  } catch (err) {
    console.error("PATCH /api/execution/milestones/[id] failed", err);
    return Response.json({ error: "Failed to update milestone" }, { status: 500 });
  }
}
