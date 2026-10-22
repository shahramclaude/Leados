import { getEntity, listRelationsForEntity } from "@/lib/knowledgeGraph";
import { db } from "@/db";
import { evidenceLinks } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const hypothesis = await getEntity(id);
  if (!hypothesis || hypothesis.type !== "hypothesis") {
    return Response.json({ ok: false, error: "Hypothesis not found" }, { status: 404 });
  }
  const [evidence, relations] = await Promise.all([
    db.select().from(evidenceLinks).where(eq(evidenceLinks.entityId, id)),
    listRelationsForEntity(id, { includeProposed: true }),
  ]);
  return Response.json({ ok: true, hypothesis, evidence, relations });
}
