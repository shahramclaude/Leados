import { addSection } from "@/lib/governance/packAssembly";
import { resolveActor, unauthorized } from "@/lib/governance/actor";
import { assertAccess } from "@/lib/governance/access";
import { toErrorResponse } from "@/lib/governance/httpErrors";
import { db } from "@/db";
import { packSections } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const rows = await db
    .select()
    .from(packSections)
    .where(eq(packSections.packId, Number(id)));
  return Response.json({ ok: true, sections: rows });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(request);
    if (!actor) return unauthorized();
    assertAccess(actor.boardTier, "board_pack_full", "write");
    const { id } = await params;
    const body = await request.json();
    const section = await addSection(Number(id), body);
    return Response.json({ ok: true, section });
  } catch (err) {
    return toErrorResponse(err);
  }
}
