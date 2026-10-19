// POST /api/scheduler/run — manually run a specific job by key.
// Body: { jobKey: string, actor?: string }
import { ensureJobsRegistered } from "@/lib/kernel/jobs";
import { runJob } from "@/lib/kernel/scheduler";

export const dynamic = "force-dynamic";

ensureJobsRegistered();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { jobKey, actor } = body ?? {};
    if (!jobKey) return Response.json({ ok: false, error: "jobKey is required" }, { status: 400 });
    const outcome = await runJob(jobKey, { type: "manual", actor: actor ?? "human:unknown" });
    return Response.json({ ok: true, outcome });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
