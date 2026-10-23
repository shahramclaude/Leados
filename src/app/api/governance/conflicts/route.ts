import { declareConflict, listConflictsForDirector } from "@/lib/governance/conflicts";
import { resolveActor, unauthorized } from "@/lib/governance/actor";
import { assertAccess } from "@/lib/governance/access";
import { toErrorResponse } from "@/lib/governance/httpErrors";
import { db } from "@/db";
import { conflictsRegister } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await resolveActor(request);
    if (!actor) return unauthorized();
    assertAccess(actor.boardTier, "conflicts_register", "read");
    const { searchParams } = new URL(request.url);
    const directorId = searchParams.get("directorId");
    if (directorId) {
      const rows = await listConflictsForDirector(Number(directorId));
      return Response.json({ ok: true, conflicts: rows });
    }
    const rows = await db.select().from(conflictsRegister);
    return Response.json({ ok: true, conflicts: rows });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await resolveActor(request);
    if (!actor) return unauthorized();
    assertAccess(actor.boardTier, "conflicts_register", "write");
    const body = await request.json();
    const row = await declareConflict({
      directorId: body.directorId ?? actor.id,
      matter: body.matter,
      natureOfInterest: body.natureOfInterest,
      recusalRequired: body.recusalRequired,
    });
    return Response.json({ ok: true, conflict: row });
  } catch (err) {
    return toErrorResponse(err);
  }
}
