import { NextRequest } from "next/server";
import { listOneOnOnesForEmployee, createOneOnOne, suggestTalkingPoints } from "@/lib/oneOnOne";
import { resolveActor } from "@/lib/requestActor";
import { toErrorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

/** GET — list 1:1s for this employee (scoped: manager/employee/HR only, per 1:1). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const actor = await resolveActor(req);
    const includeSuggestions = req.nextUrl.searchParams.get("suggest") === "1";
    const oneOnOnes = await listOneOnOnesForEmployee(actor, id);
    const suggestions = includeSuggestions ? await suggestTalkingPoints(id) : undefined;
    return Response.json({ personId: id, oneOnOnes, suggestedTalkingPoints: suggestions });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** POST — schedule a new 1:1 (manager of this employee, or HR). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const actor = await resolveActor(req);
    const body = await req.json();
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : new Date();
    const managerId = body.managerId ?? actor.id;
    const oneOnOneId = await createOneOnOne(actor, managerId, id, scheduledAt);
    return Response.json({ id: oneOnOneId }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
