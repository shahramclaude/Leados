import { attemptSuppress } from "@/lib/dissent";
import { actorFromHeaders } from "@/lib/roles";

export const dynamic = "force-dynamic";

// This endpoint exists specifically to be attacked in tests: every call,
// regardless of who calls it or what role they hold, is recorded and
// blocked. There is no request body combination that succeeds.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = actorFromHeaders(req.headers);
  const body = await req.json().catch(() => ({}));
  const attemptedAction = body.attemptedAction === "delete" || body.attemptedAction === "hide" ? body.attemptedAction : "suppress";

  const result = await attemptSuppress({ suggestionId: Number(id), attemptedAction, actor });
  return Response.json(result, { status: 403 });
}
