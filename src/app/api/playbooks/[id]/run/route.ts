import { db } from "@/db";
import { playbooks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const playbookId = Number(id);
  if (!Number.isInteger(playbookId)) {
    return Response.json({ error: "Invalid playbook id." }, { status: 400 });
  }

  const [updated] = await db
    .update(playbooks)
    .set({ lastRunAt: new Date(), status: "active" })
    .where(eq(playbooks.id, playbookId))
    .returning();

  if (!updated) {
    return Response.json({ error: "Playbook not found.", errorId: `pb-${playbookId}-404` }, { status: 404 });
  }

  return Response.json({ playbook: updated });
}
