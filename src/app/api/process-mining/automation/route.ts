// GET /api/process-mining/automation?processName=... — ranked automation
// opportunity scores with Explain<T> payloads, plus any proposals already
// drafted for this process.
import { getEventsForProcess, listAutomationProposals } from "@/lib/processMining/repo";
import { runProcessMiningPipeline } from "@/lib/processMining/pipeline";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const processName = searchParams.get("processName");
  if (!processName) {
    return Response.json({ ok: false, error: "processName query param is required" }, { status: 400 });
  }

  try {
    const events = await getEventsForProcess(processName);
    if (events.length === 0) {
      return Response.json({ ok: false, error: "no events for process" }, { status: 404 });
    }
    const result = runProcessMiningPipeline(events);
    const proposals = await listAutomationProposals(processName);

    return Response.json({
      ok: true,
      processName,
      automation: result.automation,
      proposals,
    });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
