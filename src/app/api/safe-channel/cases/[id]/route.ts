import { getCaseForRole, SafeChannelAccessDenied } from "@/lib/safeChannel/store";
import { actorFromHeaders } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = actorFromHeaders(req.headers);
  try {
    const result = await getCaseForRole(Number(id), actor);
    return Response.json({ case: result });
  } catch (err) {
    if (err instanceof SafeChannelAccessDenied) {
      return Response.json({ error: err.message }, { status: 403 });
    }
    return Response.json({ error: (err as Error).message }, { status: 404 });
  }
}
