import { listAlerts } from "@/lib/safeChannel/store";
import { actorFromHeaders, SAFE_CHANNEL_IDENTITY_ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";

// Alerts about unauthorized channel access are themselves sensitive — only
// the identity-authorized roles can review them, so a would-be attacker
// cannot use this endpoint to learn whether their own attempt was noticed.
export async function GET(req: Request) {
  const actor = actorFromHeaders(req.headers);
  if (!actor.role || !SAFE_CHANNEL_IDENTITY_ROLES.includes(actor.role)) {
    return Response.json({ error: "Not authorized to view safe-channel alerts." }, { status: 403 });
  }
  const alerts = await listAlerts();
  return Response.json({ alerts });
}
