import { createPack } from "@/lib/governance/packAssembly";
import { resolveActor, unauthorized } from "@/lib/governance/actor";
import { assertAccess } from "@/lib/governance/access";
import { toErrorResponse } from "@/lib/governance/httpErrors";
import { db } from "@/db";
import { boardPacks } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(boardPacks);
  return Response.json({ ok: true, packs: rows });
}

export async function POST(request: Request) {
  try {
    const actor = await resolveActor(request);
    if (!actor) return unauthorized();
    assertAccess(actor.boardTier, "board_pack_full", "write");
    const body = await request.json();
    const pack = await createPack(body.meetingId);
    return Response.json({ ok: true, pack });
  } catch (err) {
    return toErrorResponse(err);
  }
}
