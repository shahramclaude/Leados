import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { automationRuns } from "@/db/schema";
import { assertCapability } from "./capability";
import { getExtension, makeContext } from "./extensions/registry";
import { emitEvent } from "./stream";

// ---------------------------------------------------------------------------
// Section D — Part 07's kernel exposed for external orchestration.
//
// One job interface: POST /api/v1/automations/{key}/runs triggers a run
// (idempotency-key aware), GET /api/v1/automations/runs/{id} polls status,
// and the realtime stream (Section D) carries `automation.run.*` events for
// subscribers who want push instead of poll. There is exactly one execution
// path — the HTTP route, the realtime subscriber, and any future internal
// caller all go through `runPlaybook()` below, so audit/capability
// guarantees cannot be bypassed by calling "the other" API.
// ---------------------------------------------------------------------------

export interface PlaybookStepConfig {
  type: string;
  config?: unknown;
}

export interface PlaybookDefinition {
  key: string;
  description: string;
  steps: PlaybookStepConfig[];
  inputSchemaDescription: string;
}

const PLAYBOOKS: Record<string, PlaybookDefinition> = {
  "lead.rescore": {
    key: "lead.rescore",
    description: "Recomputes the score for a single lead.",
    steps: [{ type: "lead.rescore" }],
    inputSchemaDescription: "{ leadId: string }",
  },
  "lead.notify-new": {
    key: "lead.notify-new",
    description: "Sends a new-lead notification through a configured channel.",
    steps: [{ type: "notify" }],
    inputSchemaDescription: "{ channelType: string, channelConfig?: object, message: string }",
  },
};

export function listPlaybooks(): PlaybookDefinition[] {
  return Object.values(PLAYBOOKS);
}

export function getPlaybook(key: string): PlaybookDefinition | undefined {
  return PLAYBOOKS[key];
}

export async function runPlaybook(
  orgId: string,
  key: string,
  input: unknown,
  correlationId: string,
  idempotencyKey?: string | null,
) {
  const playbook = getPlaybook(key);
  if (!playbook) {
    throw new Error(`Unknown playbook "${key}".`);
  }
  assertCapability(orgId, "automation.step.execute");

  const [run] = await db
    .insert(automationRuns)
    .values({
      orgId,
      playbookKey: key,
      status: "running",
      input: (input ?? {}) as object,
      correlationId,
      idempotencyKey: idempotencyKey ?? null,
      startedAt: new Date(),
    })
    .returning();

  await emitEvent(orgId, "automation.run.started", { runId: run.id, playbookKey: key }, correlationId);

  try {
    let stepInput: unknown = input;
    const ctx = makeContext(orgId, correlationId);
    const outputs: unknown[] = [];
    for (const step of playbook.steps) {
      const def = getExtension("step", step.type);
      if (!def || def.kind !== "step") {
        throw new Error(`Unknown step type "${step.type}".`);
      }
      assertCapability(orgId, def.requiredCapability);
      const config = def.configSchema.parse(step.config ?? {});
      const output = await def.run(config, stepInput, ctx);
      outputs.push(output);
      stepInput = output;
    }

    const [finished] = await db
      .update(automationRuns)
      .set({ status: "succeeded", output: outputs as unknown as object, finishedAt: new Date() })
      .where(eq(automationRuns.id, run.id))
      .returning();

    await emitEvent(orgId, "automation.run.succeeded", { runId: run.id, playbookKey: key }, correlationId);
    return finished;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Automation run failed.";
    const [failed] = await db
      .update(automationRuns)
      .set({ status: "failed", error: message, finishedAt: new Date() })
      .where(eq(automationRuns.id, run.id))
      .returning();
    await emitEvent(orgId, "automation.run.failed", { runId: run.id, playbookKey: key, error: message }, correlationId);
    return failed;
  }
}

export async function findRunByIdempotencyKey(orgId: string, playbookKey: string, idempotencyKey: string) {
  const [existing] = await db
    .select()
    .from(automationRuns)
    .where(
      and(
        eq(automationRuns.orgId, orgId),
        eq(automationRuns.playbookKey, playbookKey),
        eq(automationRuns.idempotencyKey, idempotencyKey),
      ),
    )
    .orderBy(desc(automationRuns.createdAt))
    .limit(1);
  return existing ?? null;
}

