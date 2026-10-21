// Renders a run's event-sourced history as a readable transcript — used by
// `GET /api/autonomous/history?format=transcript` and by the integration
// test/script so the verification log can show real, not fabricated, output.
import { listEvents } from "./events";

export async function renderTranscript(runId: string): Promise<string> {
  const events = await listEvents(runId);
  const lines = events.map((e) => {
    const ts = e.createdAt.toISOString();
    const actor = `${e.actorKind}:${e.actorId}`;
    const payload = typeof e.payload === "object" ? JSON.stringify(e.payload) : String(e.payload);
    return `[${ts}] seq=${e.seq} ${e.type} actor=${actor}${e.causationId ? ` step=${e.causationId}` : ""} :: ${payload}`;
  });
  return lines.join("\n");
}
