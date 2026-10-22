"use server";

import { revalidatePath } from "next/cache";
import { executeExperiment, markHardeningTaskDone, EXPERIMENTS } from "@/lib/resilience";

export async function runExperimentAction(formData: FormData) {
  const key = String(formData.get("key") ?? "");
  const def = EXPERIMENTS.find((e) => e.key === key);
  if (!def) return;

  if (def.key === "exp-clock-skew") {
    // Re-running the clock-skew experiment from the UI always exercises the
    // hardened strategy — the naive/broken strategy is preserved as history,
    // not something an operator can re-trigger from the lab.
    await executeExperiment(def.key, { environment: "test", clockSkewStrategy: "hardened" });
  } else {
    const { run, result } = await executeExperiment(def.key, { environment: "test" });
    if (result.hardeningTask) {
      // A brand new hardening task from the UI stays open for triage — only
      // the historical clock-skew fix is auto-closed by scripts/chaos-run.ts.
      void run;
    }
  }

  revalidatePath("/resilience-lab");
  revalidatePath("/failure-domain-coverage");
  revalidatePath("/degradation-status");
}

export async function markTaskDoneAction(formData: FormData) {
  const chaosRunId = Number(formData.get("chaosRunId"));
  if (!Number.isFinite(chaosRunId)) return;
  await markHardeningTaskDone(chaosRunId);
  revalidatePath("/resilience-lab");
}
