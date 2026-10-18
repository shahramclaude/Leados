import { db } from "@/db";
import { leados_playbooks } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }

  const body = await req.json();

  const [existing] = await db.select().from(leados_playbooks).where(eq(leados_playbooks.id, id));
  if (!existing) {
    return Response.json({ error: "playbook not found" }, { status: 404 });
  }

  const updates: Partial<typeof leados_playbooks.$inferInsert> = {};

  if (typeof body.stepIndex === "number") {
    const completed = new Set(existing.completedSteps ?? []);
    completed.add(body.stepIndex);
    const completedSteps = Array.from(completed).sort((a, b) => a - b);
    updates.completedSteps = completedSteps;
    if (completedSteps.length >= (existing.steps?.length ?? 0) && (existing.steps?.length ?? 0) > 0) {
      updates.status = "completed";
      updates.completedAt = new Date();
    }
  }

  if (typeof body.status === "string") {
    updates.status = body.status;
    if (body.status === "completed" || body.status === "skipped") {
      updates.completedAt = new Date();
    }
  }

  if (typeof body.notes === "string") {
    updates.notes = body.notes;
  }

  const [row] = await db.update(leados_playbooks).set(updates).where(eq(leados_playbooks.id, id)).returning();
  return Response.json(row);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  const [row] = await db.select().from(leados_playbooks).where(eq(leados_playbooks.id, id));
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(row);
}
