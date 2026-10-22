// POST /api/process-mining/automation/propose
// Body: { processName: string, activity: string }
// Recomputes the automation score for that activity and writes a draft row
// to automation_proposals — the local stand-in for "push into Part 10's
// capability registry". Part 10 is not present in this repo snapshot, so
// this draft is the hand-off artifact a human (or a future Part 10 importer)
// would pick up.
import { getEventsForProcess, saveAutomationProposal } from "@/lib/processMining/repo";
import { runProcessMiningPipeline } from "@/lib/processMining/pipeline";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const processName = typeof body?.processName === "string" ? body.processName : null;
    const activity = typeof body?.activity === "string" ? body.activity : null;
    if (!processName || !activity) {
      return Response.json({ ok: false, error: "processName and activity are required" }, { status: 400 });
    }

    const events = await getEventsForProcess(processName);
    if (events.length === 0) {
      return Response.json({ ok: false, error: "no events for process" }, { status: 404 });
    }
    const result = runProcessMiningPipeline(events);
    const score = result.automation.find((a) => a.activity === activity);
    if (!score) {
      return Response.json({ ok: false, error: `no automation score computed for activity "${activity}"` }, { status: 404 });
    }

    const id = await saveAutomationProposal(score);
    return Response.json({
      ok: true,
      proposalId: id,
      status: "draft",
      note: "Draft created in automation_proposals — this is a proposal for review, not an executed automation. Confidence and estimate-vs-measured flags are preserved from the score's Explain<T> payload.",
      score,
    });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
