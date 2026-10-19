import { db } from "@/db";
import { projects as projectsTable } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const projectId = Number(id);
    if (!Number.isFinite(projectId)) {
      return Response.json({ error: "Invalid project id" }, { status: 400 });
    }

    const body = await req.json();
    const patch: Record<string, unknown> = {};

    for (const key of [
      "name",
      "domain",
      "ownerId",
      "status",
      "scopeStatement",
      "confidence",
      "impact",
    ] as const) {
      if (key in (body ?? {})) patch[key] = body[key];
    }
    if ("startDate" in (body ?? {})) {
      patch.startDate = body.startDate ? new Date(body.startDate) : null;
    }
    if ("targetDate" in (body ?? {})) {
      patch.targetDate = body.targetDate ? new Date(body.targetDate) : null;
    }
    patch.updatedAt = sql`now()`;

    const [updated] = await db
      .update(projectsTable)
      .set(patch)
      .where(eq(projectsTable.id, projectId))
      .returning();

    if (!updated) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    return Response.json(updated);
  } catch (err) {
    console.error("PATCH /api/execution/projects/[id] failed", err);
    return Response.json({ error: "Failed to update project" }, { status: 500 });
  }
}
