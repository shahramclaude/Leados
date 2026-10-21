// Section A/B: every model call that feeds the system is recorded as an
// event for auditability and cost forensics — actor.kind="agent" by
// default, prompt name/version, model, tokens, latency, validation result.
import { db } from "@/db";
import { modelCalls } from "@/db/schema";
import { desc, sql } from "drizzle-orm";
import type { TaskType } from "@/lib/providers/types";

export type LogModelCallInput = {
  actorKind?: "agent" | "user" | "system";
  actorId?: string;
  taskType: TaskType;
  promptName: string;
  promptVersion: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  attempt: number;
  validationStatus: "valid" | "repaired" | "failed";
  validationErrors?: string[];
  degraded?: boolean;
  requestHash?: string;
};

export async function logModelCall(input: LogModelCallInput) {
  const [row] = await db
    .insert(modelCalls)
    .values({
      actorKind: input.actorKind ?? "agent",
      actorId: input.actorId ?? "system",
      taskType: input.taskType,
      promptName: input.promptName,
      promptVersion: input.promptVersion,
      provider: input.provider,
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      costUsd: input.costUsd.toFixed(6),
      latencyMs: input.latencyMs,
      attempt: input.attempt,
      validationStatus: input.validationStatus,
      validationErrors: input.validationErrors ?? [],
      degraded: input.degraded ?? false,
      requestHash: input.requestHash,
    })
    .returning({ id: modelCalls.id });
  return row.id;
}

export async function recentModelCalls(limit = 50) {
  return db.select().from(modelCalls).orderBy(desc(modelCalls.createdAt)).limit(limit);
}

export async function costReport() {
  const rows = await db
    .select({
      taskType: modelCalls.taskType,
      promptName: modelCalls.promptName,
      calls: sql<number>`count(*)`,
      totalCostUsd: sql<string>`coalesce(sum(${modelCalls.costUsd}), 0)`,
      avgLatencyMs: sql<number>`coalesce(avg(${modelCalls.latencyMs}), 0)`,
      validCount: sql<number>`count(*) filter (where ${modelCalls.validationStatus} = 'valid')`,
      repairedCount: sql<number>`count(*) filter (where ${modelCalls.validationStatus} = 'repaired')`,
      failedCount: sql<number>`count(*) filter (where ${modelCalls.validationStatus} = 'failed')`,
      degradedCount: sql<number>`count(*) filter (where ${modelCalls.degraded} = true)`,
    })
    .from(modelCalls)
    .groupBy(modelCalls.taskType, modelCalls.promptName);
  return rows;
}
