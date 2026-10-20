import { db } from "@/db";
import { decisions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const body = await request.json();
    const [row] = await db
      .update(decisions)
      .set({ status: body.status })
      .where(eq(decisions.id, id))
      .returning();
    if (!row) return Response.json({ error: "Not found", errorId: randomUUID() }, { status: 404 });
    return Response.json({ decision: row });
  } catch {
    return Response.json({ error: "Failed to update decision", errorId: randomUUID() }, { status: 500 });
  }
}
