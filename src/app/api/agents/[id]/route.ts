import { db } from "@/db";
import { agents, agentRuns } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agentId = Number(id);
  if (!Number.isFinite(agentId)) return Response.json({ error: "invalid id" }, { status: 400 });

  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
  if (!agent) return Response.json({ error: "not found" }, { status: 404 });

  const runs = await db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.agentId, agentId))
    .orderBy(desc(agentRuns.startedAt));

  return Response.json({ agent, runs });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agentId = Number(id);
  if (!Number.isFinite(agentId)) return Response.json({ error: "invalid id" }, { status: 400 });

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  for (const key of ["name", "kernelType", "description", "status", "autonomyLevel"] as const) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  const [updated] = await db.update(agents).set(updates).where(eq(agents.id, agentId)).returning();
  if (!updated) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agentId = Number(id);
  if (!Number.isFinite(agentId)) return Response.json({ error: "invalid id" }, { status: 400 });
  await db.delete(agents).where(eq(agents.id, agentId));
  return Response.json({ ok: true });
}
