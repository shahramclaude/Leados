import { NextRequest } from "next/server";
import { getTransparencyReport, requestErasure } from "@/lib/transparency";
import { resolveActor } from "@/lib/requestActor";
import { toErrorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

/** GET — "what LEADOS knows about me, why, and from which events" (self or HR only). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const actor = await resolveActor(req);
    const report = await getTransparencyReport(actor, id);
    return Response.json(report);
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** POST — erasure request, wired to the Part 01 tombstone flow. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const actor = await resolveActor(req);
    const body = await req.json().catch(() => ({}));
    if (body.action !== "erase") {
      return Response.json({ error: "Expected { action: 'erase' }" }, { status: 400 });
    }
    const result = await requestErasure(actor, id);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return toErrorResponse(err);
  }
}
