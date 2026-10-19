// GET  /api/autonomy/settings — current pause state.
// POST /api/autonomy/settings — { action: "pause"|"resume", reason?, actor? }
import { getAutonomySettings, pauseAutonomy, resumeAutonomy } from "@/lib/kernel/killSwitch";
import { recordAudit } from "@/lib/kernel/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getAutonomySettings();
  return Response.json({ ok: true, settings });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  const actor = typeof body?.actor === "string" ? body.actor : "human:unknown";

  if (action === "pause") {
    const settings = await pauseAutonomy(body?.reason ?? "Manually paused");
    await recordAudit({
      actor,
      action: "autonomy.paused",
      subjectType: "autonomy_settings",
      subjectId: "1",
      reason: body?.reason ?? "Manually paused",
      riskClass: "high",
    });
    return Response.json({ ok: true, settings });
  }

  if (action === "resume") {
    const settings = await resumeAutonomy();
    await recordAudit({
      actor,
      action: "autonomy.resumed",
      subjectType: "autonomy_settings",
      subjectId: "1",
      reason: body?.reason ?? "Manually resumed",
      riskClass: "high",
    });
    return Response.json({ ok: true, settings });
  }

  return Response.json({ ok: false, error: "action must be 'pause' or 'resume'" }, { status: 400 });
}
