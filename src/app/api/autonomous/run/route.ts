// POST /api/autonomous/run — manual trigger for one full kernel cycle.
// Body: { dryRun?: boolean, actor?: string }
import { runCycle } from "@/lib/kernel/orchestrator";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;
    const actor = typeof body?.actor === "string" ? body.actor : "human:manual-trigger";

    const result = await runCycle({ trigger: { type: "manual", source: actor }, dryRun, actor });
    return Response.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
