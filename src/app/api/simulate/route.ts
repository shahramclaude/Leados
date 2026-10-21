/**
 * /api/simulate — Monte Carlo job control surface.
 *
 * POST   { scenario?, totalPairs? }   -> starts a job, returns { jobId }
 * GET    ?jobId=...                   -> { status, progress, result? }
 * DELETE ?jobId=...                   -> cancels an in-flight job
 *
 * Jobs are tracked in an in-memory registry (module-level Map). This is a
 * single-process demo implementation — sufficient for this build/preview but
 * documented as a known limitation (see model card monte-carlo-core-v1 /
 * Phase 5 self-review): it will not survive a server restart or work across
 * multiple server instances.
 */
import { randomUUID } from "node:crypto";
import { runMonteCarloScenario, explainMcEstimate, McRunResult } from "@/lib/intelligence/montecarlo";
import { McScenarioSpec } from "@/lib/intelligence/workerPool";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Job {
  id: string;
  status: "running" | "done" | "cancelled" | "error";
  progress: { completedPairs: number; totalPairs: number };
  result?: McRunResult;
  error?: string;
  cancelRequested: boolean;
}

const globalForJobs = globalThis as typeof globalThis & { __leadosMcJobs?: Map<string, Job> };
const jobs = globalForJobs.__leadosMcJobs ?? new Map<string, Job>();
globalForJobs.__leadosMcJobs = jobs;

const DEFAULT_SCENARIO: McScenarioSpec = {
  label: "Quarterly project cost risk",
  budget: 500000,
  variables: [
    { id: "engineering", mean: 220000, sd: 35000, weight: 1 },
    { id: "vendor", mean: 150000, sd: 50000, weight: 1 },
    { id: "infra", mean: 90000, sd: 15000, weight: 1 },
    { id: "contingency-draw", mean: 20000, sd: 25000, weight: 1 },
  ],
};

export async function POST(req: Request) {
  let body: { scenario?: McScenarioSpec; totalPairs?: number; seed?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine — use defaults
  }
  const scenario = body.scenario ?? DEFAULT_SCENARIO;
  const totalPairs = Math.min(200000, Math.max(1000, body.totalPairs ?? 20000));
  const seed = body.seed ?? `job-${Date.now()}`;

  const id = randomUUID();
  const job: Job = {
    id,
    status: "running",
    progress: { completedPairs: 0, totalPairs },
    cancelRequested: false,
  };
  jobs.set(id, job);

  runMonteCarloScenario({
    seed,
    scenario,
    totalPairs,
    onProgress: (p) => {
      const current = jobs.get(id);
      if (current) current.progress = p;
    },
    isCancelled: () => jobs.get(id)?.cancelRequested ?? false,
  })
    .then((result) => {
      const current = jobs.get(id);
      if (!current) return;
      current.status = current.cancelRequested ? "cancelled" : "done";
      current.result = result;
    })
    .catch((err) => {
      const current = jobs.get(id);
      if (!current) return;
      current.status = "error";
      current.error = err instanceof Error ? err.message : String(err);
    });

  return Response.json({ jobId: id, scenario, totalPairs });
}

function serializeJob(job: Job) {
  if (!job.result) {
    return {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      error: job.error,
    };
  }
  const { probExceed, expectedOverrun, strategyUsed, cancelled, groundTruth } = job.result;
  return {
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    strategyUsed,
    cancelled,
    groundTruth,
    probExceed: explainMcEstimate(probExceed, {
      method: "Monte Carlo (antithetic + control-variate) estimate of P(TotalCost > Budget).",
      modelCardId: "monte-carlo-core-v1",
      label: "prob-exceed",
      scenarioAssumptions: ["Scenario variables are user-declared Normal distributions, independent of each other."],
    }),
    expectedOverrun: explainMcEstimate(expectedOverrun, {
      method: "Monte Carlo (antithetic + control-variate) estimate of E[max(TotalCost-Budget,0)].",
      modelCardId: "monte-carlo-core-v1",
      label: "expected-overrun",
      scenarioAssumptions: ["Scenario variables are user-declared Normal distributions, independent of each other."],
    }),
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");
  if (!jobId) return Response.json({ error: "jobId query param required" }, { status: 400 });
  const job = jobs.get(jobId);
  if (!job) return Response.json({ error: "job not found" }, { status: 404 });
  return Response.json(serializeJob(job));
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");
  if (!jobId) return Response.json({ error: "jobId query param required" }, { status: 400 });
  const job = jobs.get(jobId);
  if (!job) return Response.json({ error: "job not found" }, { status: 404 });
  job.cancelRequested = true;
  return Response.json({ jobId, cancelRequested: true });
}
