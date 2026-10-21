import { runJob, recentJobRuns, JOB_CADENCE, type JobName } from "@/lib/scheduler";
import { generateBoardPack } from "@/lib/boardPack";
import { evaluateIndicators } from "@/lib/strategicIntelligence";
import { openDueRetrospectives } from "@/lib/decisionEngine";
import { allProjectStatuses } from "@/lib/executionEngine";
import { backtestProject } from "@/lib/delivery";

export const dynamic = "force-dynamic";

const JOBS: Record<JobName, () => Promise<unknown>> = {
  "weekly-board-pack": async () => {
    const pack = await generateBoardPack(new Date().toISOString().slice(0, 10));
    return { boardPackId: pack.id, contentHash: pack.contentHash };
  },
  "daily-early-warning-scan": async () => {
    const evals = await evaluateIndicators();
    return { evaluated: evals.length, breaches: evals.filter((e) => e.status === "breach").length };
  },
  "monthly-delivery-recalibration": async () => {
    const statuses = await allProjectStatuses();
    const results = await Promise.all(statuses.map((s) => backtestProject(s.project.id)));
    return { projectsChecked: results.length, results };
  },
  "decision-retrospective-sweep": async () => {
    const opened = await openDueRetrospectives();
    return { opened };
  },
};

export async function GET() {
  const runs = await recentJobRuns(30);
  return Response.json({ cadence: JOB_CADENCE, recentRuns: runs });
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const job = searchParams.get("job") as JobName | null;
  if (!job || !JOBS[job]) {
    return Response.json({ error: `job must be one of: ${Object.keys(JOBS).join(", ")}` }, { status: 400 });
  }
  const result = await runJob(job, JOBS[job]);
  return Response.json(result);
}
