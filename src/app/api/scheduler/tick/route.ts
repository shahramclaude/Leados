// Unattended automation entry point. Intended to be invoked by an external
// scheduler (platform cron / CI schedule) on a short interval — see
// src/lib/kernel/scheduler.ts for why this process cannot self-schedule in a
// serverless deployment. Optionally protected by SCHEDULER_TOKEN.
import "@/lib/kernel/bootstrap";
import { tick } from "@/lib/kernel/scheduler";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const expected = process.env.SCHEDULER_TOKEN;
  if (expected) {
    const got = req.headers.get("x-scheduler-token");
    if (got !== expected) return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = await tick();
  return Response.json({ results });
}
