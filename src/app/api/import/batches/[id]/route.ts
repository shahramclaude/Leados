import { db } from "@/db";
import { importBatches } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, id));
  if (!batch) return Response.json({ error: "Batch not found." }, { status: 404 });
  return Response.json({ batch });
}
