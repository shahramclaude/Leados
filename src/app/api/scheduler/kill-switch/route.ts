import "@/lib/kernel/bootstrap";
import { disengageKillSwitch, engageKillSwitch, getKillSwitchStatus } from "@/lib/kernel/killSwitch";
import type { Actor } from "@/lib/kernel/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getKillSwitchStatus());
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: "engage" | "disengage"; reason?: string; actorId?: string };
  const actor: Actor = { kind: "human", id: body.actorId ?? "unknown-operator" };
  if (body.action === "engage") {
    await engageKillSwitch(body.reason ?? "manual kill switch activation", actor);
  } else if (body.action === "disengage") {
    await disengageKillSwitch(actor);
  } else {
    return Response.json({ error: 'action must be "engage" or "disengage"' }, { status: 400 });
  }
  return Response.json(await getKillSwitchStatus());
}
