import { NextRequest } from "next/server";
import { buildSuccessionMatrix } from "@/lib/succession";
import { resolveActor } from "@/lib/requestActor";
import { toErrorResponse } from "@/lib/apiError";
import { db } from "@/db";
import { people } from "@/db/schema";

export const dynamic = "force-dynamic";

/** GET /api/succession/[role] — ready-now/ready-later bench matrix.
 * Candidates default to everyone NOT currently in the role, team-scoped is
 * out of scope for this seam; HR/manager/executive only. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ role: string }> }) {
  try {
    const { role } = await ctx.params;
    const actor = await resolveActor(req);
    const everyone = await db.select({ id: people.id, role: people.role }).from(people);
    const candidates = everyone.filter((p) => p.role !== role).map((p) => p.id);
    const matrix = await buildSuccessionMatrix(actor, decodeURIComponent(role), candidates);
    return Response.json(matrix);
  } catch (err) {
    return toErrorResponse(err);
  }
}

