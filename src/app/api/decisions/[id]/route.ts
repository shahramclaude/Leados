import { db } from "@/db";
import { decisions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cachedJson, jsonError, isRecord } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  const decisionId = Number(id);
  if (!Number.isInteger(decisionId)) return jsonError("invalid decision id");

  const body: unknown = await request.json();
  if (!isRecord(body)) return jsonError("invalid body");

  const patch: Partial<typeof decisions.$inferInsert> = {};
  if (typeof body.status === "string") {
    patch.status = body.status;
    if (body.status === "decided") patch.decidedAt = new Date();
  }
  if (typeof body.confidence === "number") patch.confidence = body.confidence;
  if (typeof body.outcomeSuccess === "boolean") patch.outcomeSuccess = body.outcomeSuccess;
  if (typeof body.deadline === "string") patch.deadline = new Date(body.deadline);
  if (typeof body.title === "string") patch.title = body.title;
  if (typeof body.description === "string") patch.description = body.description;

  const [updated] = await db.update(decisions).set(patch).where(eq(decisions.id, decisionId)).returning();
  if (!updated) return jsonError("decision not found", 404);
  return cachedJson(updated);
}
