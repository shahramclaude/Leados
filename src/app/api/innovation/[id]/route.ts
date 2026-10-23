import { NextRequest } from "next/server";
import { ideas } from "@/db/schema";
import { updateRow, badRequest, notFound, ok } from "@/lib/leados/crud";
import { db } from "@/db";
import { eq } from "drizzle-orm";

// Stage-gate actions: 'kill' (engine or human may kill), 'unkill' (human only,
// rationale required — "the engine kills, a human un-kills with a recorded
// rationale, never the reverse").
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!id) return badRequest("invalid id");
  const body = await req.json();

  const [existing] = await db.select().from(ideas).where(eq(ideas.id, id));
  if (!existing) return notFound("idea not found");

  if (body.action === "kill") {
    const row = await updateRow(ideas, ideas.id, id, { stage: "killed", killRationale: body.rationale || "auto-kill: pre-committed criteria breached" });
    return ok(row);
  }
  if (body.action === "unkill") {
    if (!body.rationale || String(body.rationale).trim().length === 0) {
      return badRequest("Un-kill requires a recorded rationale.");
    }
    const row = await updateRow(ideas, ideas.id, id, { stage: "discover", killRationale: `UN-KILLED: ${body.rationale}` });
    return ok(row);
  }
  if (body.stage) {
    const hasKillCriteria = Boolean(existing.killMetric && existing.killThreshold && existing.killByDate);
    if (body.stage === "build" && !hasKillCriteria) {
      return badRequest("Cannot promote to 'build' without pre-committed kill criteria.");
    }
    const row = await updateRow(ideas, ideas.id, id, { stage: body.stage });
    return ok(row);
  }
  return badRequest("No recognized action or stage provided");
}
