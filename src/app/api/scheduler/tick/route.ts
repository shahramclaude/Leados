// POST /api/scheduler/tick — evaluate all cron/event jobs and run whichever are due.
// Call this on an external cadence (e.g. every minute); it is idempotent per
// minute thanks to each job run's idempotency key.
import { ensureJobsRegistered } from "@/lib/kernel/jobs";
import { tick } from "@/lib/kernel/scheduler";

export const dynamic = "force-dynamic";

ensureJobsRegistered();

export async function POST() {
  const outcomes = await tick();
  return Response.json({ ok: true, outcomes });
}

export async function GET() {
  return POST();
}
