import { db } from "@/db";
import { blockers as blockersTable } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const blockerId = Number(id);
    if (!Number.isFinite(blockerId)) {
      return Response.json({ error: "Invalid blocker id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};

    // Default action for this route per spec: resolve the blocker.
    if (body?.resolve !== false) {
      patch.resolvedAt = sql`now()`;
    }
    if ("severity" in (body ?? {})) patch.severity = body.severity;
    if ("assignedTo" in (body ?? {})) patch.assignedTo = body.assignedTo;
    if ("description" in (body ?? {})) patch.description = body.description;

    const [updated] = await db
      .update(blockersTable)
      .set(patch)
      .where(eq(blockersTable.id, blockerId))
      .returning();

    if (!updated) {
      return Response.json({ error: "Blocker not found" }, { status: 404 });
    }

    return Response.json(updated);
  } catch (err) {
    console.error("PATCH /api/execution/blockers/[id] failed", err);
    return Response.json({ error: "Failed to update blocker" }, { status: 500 });
  }
}
