// Automation mandate (best-effort in-process fallback).
//
// HONEST LIMITATION: this sandbox/preview process is not guaranteed to be a
// durable always-on worker across deploys/restarts. The jobs below ARE the
// real automation logic (weekly board pack, daily early-warning scan, monthly
// delivery recalibration, decision-retrospective sweep); in a production
// deployment they should be triggered by the platform's cron (or Part 07's
// dedicated scheduler service) calling `POST /api/jobs/run?job=<name>` on the
// documented cadence (see src/lib/scheduler.ts `JOB_CADENCE`). This file wires
// the same jobs to in-process intervals so the behaviour is observable without
// any external cron configured, and logs every run to `job_runs` either way.
import { runJob } from "@/lib/scheduler";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const g = globalThis as typeof globalThis & { __leadosSchedulerStarted?: boolean };
  if (g.__leadosSchedulerStarted) return;
  g.__leadosSchedulerStarted = true;

  const { generateBoardPack } = await import("@/lib/boardPack");
  const { evaluateIndicators } = await import("@/lib/strategicIntelligence");
  const { openDueRetrospectives } = await import("@/lib/decisionEngine");
  const { allProjectStatuses } = await import("@/lib/executionEngine");
  const { backtestProject } = await import("@/lib/delivery");

  const runWeeklyBoardPack = () => runJob("weekly-board-pack", async () => {
    const pack = await generateBoardPack(new Date().toISOString().slice(0, 10));
    return { boardPackId: pack.id, contentHash: pack.contentHash };
  });
  const runDailyScan = () => runJob("daily-early-warning-scan", async () => {
    const evals = await evaluateIndicators();
    return { evaluated: evals.length, breaches: evals.filter((e) => e.status === "breach").length };
  });
  const runMonthlyRecalibration = () => runJob("monthly-delivery-recalibration", async () => {
    const statuses = await allProjectStatuses();
    const results = await Promise.all(statuses.map((s) => backtestProject(s.project.id)));
    return { projectsChecked: results.length };
  });
  const runRetroSweep = () => runJob("decision-retrospective-sweep", async () => {
    const opened = await openDueRetrospectives();
    return { opened };
  });

  // Bootstrap run shortly after startup so the automation is visible immediately,
  // then keep to the documented cadence for the life of this process.
  setTimeout(() => {
    runDailyScan();
    runRetroSweep();
  }, 10_000);

  setInterval(runWeeklyBoardPack, WEEK_MS);
  setInterval(runDailyScan, DAY_MS);
  setInterval(runMonthlyRecalibration, MONTH_MS);
  setInterval(runRetroSweep, DAY_MS);
}
