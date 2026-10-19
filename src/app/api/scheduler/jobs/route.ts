// GET /api/scheduler/jobs — job definitions (DAG, concurrency, cadence) + last run.
import { ensureJobsRegistered } from "@/lib/kernel/jobs";
import { listJobsWithStatus, syncJobDefinitionsToDb } from "@/lib/kernel/scheduler";

export const dynamic = "force-dynamic";

ensureJobsRegistered();

export async function GET() {
  await syncJobDefinitionsToDb();
  const jobs = await listJobsWithStatus();
  return Response.json({ ok: true, jobs });
}
