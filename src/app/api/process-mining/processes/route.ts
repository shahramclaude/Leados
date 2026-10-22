// GET /api/process-mining/processes — list distinct process names available
// in the event store (for the UI's process selector).
import { listDistinctProcessNames } from "@/lib/processMining/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const processes = await listDistinctProcessNames();
    return Response.json({ ok: true, processes });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
