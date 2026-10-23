"use server";

import { revalidatePath } from "next/cache";
import { runSimulation, runRollingBacktest } from "@/lib/worldModel";
import { appendAuditEvent } from "@/lib/auditLog";

export async function runSimulationAction(formData: FormData) {
  const metricId = String(formData.get("metricId"));
  const horizonPeriods = Number(formData.get("horizonPeriods") ?? 6);
  const interventionDelta = Number(formData.get("interventionDelta") ?? 0);
  const n = Number(formData.get("n") ?? 2000);
  const label = String(formData.get("label") ?? "scenario");
  const seed = Math.floor(Math.random() * 1_000_000);

  await runSimulation({
    metricId,
    horizonPeriods,
    n,
    seed,
    interventionDelta,
    interventionFromPeriod: 1,
    label,
    createdBy: "operator",
  });

  await appendAuditEvent({
    actorKind: "user",
    actorId: "operator",
    action: "run-simulation",
    target: metricId,
    payload: { horizonPeriods, interventionDelta, n, label },
  });

  revalidatePath("/simulate");
}

export async function runBacktestAction(formData: FormData) {
  const metricId = String(formData.get("metricId"));
  const result = await runRollingBacktest(metricId);
  await appendAuditEvent({
    actorKind: "system",
    actorId: "backtest-job",
    action: "run-backtest",
    target: metricId,
    payload: result,
  });
  revalidatePath("/simulate");
}
