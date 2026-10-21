// Manual trigger: enqueue a job immediately (used by runbooks, drills, and
// the Health page's "run now" affordance) or run a full scheduler tick.
import { z } from "zod";
import { enqueue } from "@/lib/ops/workQueue";
import { tickScheduler, runWorkerPass } from "@/lib/ops/scheduler/runner";
import { JOB_HANDLERS } from "@/lib/ops/scheduler/jobs";
import { withApiHandler } from "@/lib/obs/apiHandler";
import { requireAdmin } from "@/lib/ops/adminAuth";
import { AppError } from "@/lib/obs/errors";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ job: z.string().optional(), mode: z.enum(["enqueue", "tick", "worker"]).default("enqueue") });

export const POST = withApiHandler({ routeFamily: "scheduler_run" }, async (req) => {
  requireAdmin(req);
  const body = BodySchema.parse(await req.json().catch(() => ({})));
  if (body.mode === "tick") {
    const result = await tickScheduler();
    return Response.json({ mode: "tick", ...result });
  }
  if (body.mode === "worker") {
    const processed = await runWorkerPass(25);
    return Response.json({ mode: "worker", processed });
  }
  if (!body.job || !(body.job in JOB_HANDLERS)) {
    throw new AppError("unknown_job", `job must be one of: ${Object.keys(JOB_HANDLERS).join(", ")}`, 400);
  }
  const row = await enqueue(body.job, { manual: true });
  const processed = await runWorkerPass(5);
  return Response.json({ mode: "enqueue", job: row, processedAfterEnqueue: processed });
});
