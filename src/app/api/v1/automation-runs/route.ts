import { and, asc, desc, eq, type SQL } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/db";
import { automationRuns, playbooks } from "@/db/schema";
import { withApi } from "@/lib/api/handler";
import { jsonOk, jsonFromCaught } from "@/lib/api/respond";
import { buildPageMeta, cursorRowCondition, decodeCursor, parseFilters, parseLimit, parseSort } from "@/lib/api/pagination";
import { AutomationRunTriggerSchema } from "@/lib/api/schemas";
import { ApiError } from "@/lib/api/errors";
import { toAutomationRun } from "@/lib/api/serialize";
import { handleIdempotentCreate } from "@/lib/api/writeHelpers";
import { recordAudit } from "@/lib/api/audit";
import { emitEvent } from "@/lib/webhooks/worker";
import { registerBuiltinExtensions } from "@/lib/extensions/builtins";
import { playbookStepTypeRegistry } from "@/lib/extensions/registry";

export const dynamic = "force-dynamic";

const SORT_COLUMN = { createdAt: automationRuns.createdAt } as const;

export const GET = withApi("automation:read", async (req, { correlationId, rl }) => {
  try {
    const sp = new URL(req.url).searchParams;
    const limit = parseLimit(sp.get("limit"));
    const { field, direction } = parseSort(sp.get("sort"), ["createdAt"], "-createdAt");
    const filters = parseFilters(sp, { status: ["eq"] }, ["cursor", "limit", "sort"]);
    const sortColumn = SORT_COLUMN[field as keyof typeof SORT_COLUMN];

    const conditions: SQL[] = [];
    for (const f of filters) if (f.field === "status") conditions.push(eq(automationRuns.status, f.value));
    if (sp.get("cursor")) conditions.push(cursorRowCondition(sortColumn, automationRuns.id, decodeCursor(sp.get("cursor")!), direction));

    const orderFns = direction === "desc" ? [desc(sortColumn), desc(automationRuns.id)] : [asc(sortColumn), asc(automationRuns.id)];
    const rows = await db
      .select()
      .from(automationRuns)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(...orderFns)
      .limit(limit + 1);
    const { items, hasMore, nextCursor } = buildPageMeta(rows, limit, "createdAt");
    return jsonOk({ data: items.map(toAutomationRun), page: { cursor: nextCursor, hasMore, limit } }, correlationId, {}, rl);
  } catch (err) {
    return jsonFromCaught(err, correlationId, rl);
  }
});

export const POST = withApi("automation:write", async (req, { correlationId, key, rl }) => {
  try {
    registerBuiltinExtensions();
    const rawBody = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON");
    });
    const parsed = AutomationRunTriggerSchema.safeParse(rawBody);
    if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Automation run payload failed validation", parsed.error.flatten());

    const result = await handleIdempotentCreate(req, "POST /v1/automation-runs", rawBody, async () => {
      const [playbook] = await db.select().from(playbooks).where(eq(playbooks.id, parsed.data.playbookId)).limit(1);
      if (!playbook) throw new ApiError("VALIDATION_ERROR", `No playbook with id ${parsed.data.playbookId}`);

      const correlation = randomUUID();
      const [run] = await db
        .insert(automationRuns)
        .values({
          playbookId: playbook.id,
          trigger: "api",
          status: "running",
          input: parsed.data.input ?? {},
          correlationId: correlation,
          startedAt: new Date(),
        })
        .returning();

      const logs: string[] = [];
      let status: "succeeded" | "failed" = "succeeded";
      let errorMessage: string | null = null;
      try {
        const steps = (playbook.steps as Array<{ type: string; config?: Record<string, unknown> }>) ?? [];
        for (const step of steps) {
          const stepType = playbookStepTypeRegistry.require(step.type);
          const config = stepType.configSchema.parse(step.config ?? {});
          await stepType.run(
            { runId: run.id, correlationId: correlation, input: (parsed.data.input ?? {}) as Record<string, unknown>, log: (m) => logs.push(m) },
            config,
          );
        }
      } catch (stepErr) {
        status = "failed";
        errorMessage = stepErr instanceof Error ? stepErr.message : "unknown step error";
      }

      const [finished] = await db
        .update(automationRuns)
        .set({ status, output: { logs, error: errorMessage }, finishedAt: new Date(), updatedAt: new Date() })
        .where(eq(automationRuns.id, run.id))
        .returning();

      await recordAudit({ actor: key.id, action: "automation_run.triggered", resource: "automation_run", resourceId: run.id, correlationId });
      await emitEvent("automation.run.completed", { id: finished.id, status: finished.status, playbookId: playbook.id });
      return { status: 201, body: toAutomationRun(finished) };
    });

    return jsonOk(result.body, correlationId, { status: result.status, headers: result.replayed ? { "Idempotency-Replayed": "true" } : {} }, rl);
  } catch (err) {
    return jsonFromCaught(err, correlationId, rl);
  }
});
