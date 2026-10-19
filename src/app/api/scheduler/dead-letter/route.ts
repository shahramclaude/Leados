// GET  /api/scheduler/dead-letter — unreviewed dead-lettered job runs.
// POST /api/scheduler/dead-letter — { id, resolution: "requeued"|"dismissed", reviewedBy }
import { listDeadLetters, resolveDeadLetter } from "@/lib/kernel/scheduler";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await listDeadLetters(true);
  return Response.json({ ok: true, items });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, resolution, reviewedBy } = body ?? {};
    if (!id || !resolution || !reviewedBy) {
      return Response.json({ ok: false, error: "id, resolution, reviewedBy are required" }, { status: 400 });
    }
    await resolveDeadLetter(Number(id), resolution, reviewedBy);
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
