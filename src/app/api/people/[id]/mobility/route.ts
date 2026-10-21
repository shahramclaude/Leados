import { NextRequest } from "next/server";
import { internalMobilitySuggestions } from "@/lib/skillsGraph";
import { resolveActor } from "@/lib/requestActor";
import { toErrorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const actor = await resolveActor(req);
    const suggestions = await internalMobilitySuggestions(actor, id);
    return Response.json({ personId: id, suggestions });
  } catch (err) {
    return toErrorResponse(err);
  }
}
