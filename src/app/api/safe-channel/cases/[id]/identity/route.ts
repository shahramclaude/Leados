import { revealIdentity, SafeChannelAccessDenied } from "@/lib/safeChannel/store";
import { actorFromHeaders } from "@/lib/roles";

export const dynamic = "force-dynamic";

// The single most sensitive endpoint in the system. See
// src/lib/safeChannel/store.ts#revealIdentity for the confidentiality
// contract: only SAFE_CHANNEL_IDENTITY_ROLES succeed, every attempt is
// logged, denials are alerted.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = actorFromHeaders(req.headers);
  try {
    const result = await revealIdentity(Number(id), actor);
    return Response.json(result);
  } catch (err) {
    if (err instanceof SafeChannelAccessDenied) {
      return Response.json({ error: err.message }, { status: 403 });
    }
    return Response.json({ error: (err as Error).message }, { status: 404 });
  }
}
