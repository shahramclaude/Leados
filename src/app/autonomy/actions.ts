"use server";

import { revalidatePath } from "next/cache";
import { remeasureAllGates, runDailyPulse } from "@/lib/autonomy";
import { appendAuditEvent } from "@/lib/auditLog";

export async function remeasureGatesAction() {
  const results = await remeasureAllGates();
  await appendAuditEvent({
    actorKind: "system",
    actorId: "grand-gate-runner",
    action: "remeasure-grand-gates",
    target: "program",
    payload: { pass: results.filter((r) => r.status === "pass").length, total: results.length },
  });
  revalidatePath("/autonomy");
}

export async function runDailyPulseAction() {
  const result = await runDailyPulse();
  await appendAuditEvent({
    actorKind: "system",
    actorId: "autonomy-runner",
    action: "run-daily-pulse",
    target: "cadence",
    payload: { ...result },
  });
  revalidatePath("/autonomy");
}
