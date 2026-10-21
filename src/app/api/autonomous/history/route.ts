// GET /api/autonomous/history?runId=...            -> raw event list (JSON)
// GET /api/autonomous/history?runId=...&format=transcript -> human-readable transcript
// GET /api/autonomous/history (no runId)            -> last 200 events across all runs
import "@/lib/kernel/bootstrap";
import { listAllEvents, listEvents } from "@/lib/kernel/events";
import { renderTranscript } from "@/lib/kernel/transcript";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get("runId");
  const format = searchParams.get("format");

  if (!runId) {
    const events = await listAllEvents(200);
    return Response.json({ events });
  }

  if (format === "transcript") {
    const transcript = await renderTranscript(runId);
    return new Response(transcript, { headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  const events = await listEvents(runId);
  return Response.json({ runId, events, replayable: true });
}
