// Part 07 seam: capability registry.
//
// Not present in the repo snapshot handed to this part — defined fresh here,
// in the shape Part 07 is specified to own ("writes go through Part 07's
// capability registry with validation"). No model output may write to the
// database directly. Every write a model-derived action wants to make must
// be declared as a typed capability with a zod input schema; invocation is
// validated, policy-gated (auto-approved only below a confidence/blast-radius
// threshold declared per capability), and recorded in
// `capability_invocations` for audit — approved or not.

import { z } from "zod";
import { db } from "@/db";
import { capabilityInvocations, entities, events } from "@/db/schema";
import { eq } from "drizzle-orm";

export type Actor = { kind: "agent" | "user" | "system"; id: string };

export type CapabilityResult<T> =
  | { status: "executed"; invocationId: string; result: T }
  | { status: "pending_approval"; invocationId: string }
  | { status: "rejected"; invocationId: string; reason: string }
  | { status: "invalid"; errors: string[] };

type CapabilityDef<Input> = {
  name: string;
  description: string;
  inputSchema: z.ZodType<Input>;
  /** Blast radius gate: when true, invocation executes immediately. */
  autoApprove: (input: Input) => boolean;
  handler: (input: Input) => Promise<unknown>;
};

const registry = new Map<string, CapabilityDef<unknown>>();

export function defineCapability<Input>(def: CapabilityDef<Input>) {
  registry.set(def.name, def as CapabilityDef<unknown>);
  return def;
}

export function listCapabilities() {
  return Array.from(registry.values()).map((c) => ({
    name: c.name,
    description: c.description,
  }));
}

export async function invokeCapability<Input>(
  capability: string,
  rawInput: Input,
  actor: Actor,
): Promise<CapabilityResult<unknown>> {
  const def = registry.get(capability);
  if (!def) {
    return { status: "invalid", errors: [`Unknown capability: ${capability}`] };
  }

  const parsed = def.inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    await db.insert(capabilityInvocations).values({
      capability,
      actorKind: actor.kind,
      actorId: actor.id,
      params: asJsonb(rawInput),
      validationStatus: "invalid",
      validationErrors: errors,
      requiresApproval: true,
      approved: false,
      status: "failed",
      resultSummary: "Rejected at validation.",
    });
    return { status: "invalid", errors };
  }

  const autoApprove = actor.kind === "agent" ? def.autoApprove(parsed.data) : true;

  const [row] = await db
    .insert(capabilityInvocations)
    .values({
      capability,
      actorKind: actor.kind,
      actorId: actor.id,
      params: asJsonb(parsed.data),
      validationStatus: "valid",
      validationErrors: [],
      requiresApproval: !autoApprove,
      approved: autoApprove,
      status: autoApprove ? "pending" : "pending",
    })
    .returning({ id: capabilityInvocations.id });

  if (!autoApprove) {
    return { status: "pending_approval", invocationId: row.id };
  }

  try {
    const result = await def.handler(parsed.data);
    await db
      .update(capabilityInvocations)
      .set({ status: "executed", resultSummary: "Executed automatically (policy gate passed)." })
      .where(eq(capabilityInvocations.id, row.id));
    return { status: "executed", invocationId: row.id, result };
  } catch (err) {
    await db
      .update(capabilityInvocations)
      .set({ status: "failed", resultSummary: String(err) })
      .where(eq(capabilityInvocations.id, row.id));
    throw err;
  }
}

/** Approve a previously pending invocation (human-in-the-loop). */
export async function approveCapabilityInvocation(invocationId: string, approvedBy: string) {
  const [row] = await db
    .select()
    .from(capabilityInvocations)
    .where(eq(capabilityInvocations.id, invocationId))
    .limit(1);
  if (!row) throw new Error("Invocation not found");
  if (row.status !== "pending") throw new Error(`Invocation already ${row.status}`);

  const def = registry.get(row.capability);
  if (!def) throw new Error(`Unknown capability: ${row.capability}`);

  const parsed = def.inputSchema.safeParse(row.params);
  if (!parsed.success) throw new Error("Stored params no longer valid");

  try {
    const result = await def.handler(parsed.data);
    await db
      .update(capabilityInvocations)
      .set({ status: "executed", approved: true, approvedBy, resultSummary: "Executed after human approval." })
      .where(eq(capabilityInvocations.id, invocationId));
    return result;
  } catch (err) {
    await db
      .update(capabilityInvocations)
      .set({ status: "failed", approved: true, approvedBy, resultSummary: String(err) })
      .where(eq(capabilityInvocations.id, invocationId));
    throw err;
  }
}

export async function rejectCapabilityInvocation(invocationId: string, by: string, reason: string) {
  await db
    .update(capabilityInvocations)
    .set({ status: "rejected", approvedBy: by, resultSummary: reason })
    .where(eq(capabilityInvocations.id, invocationId));
}

function asJsonb(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value ?? {}));
}

// ---------------------------------------------------------------------------
// Concrete capabilities used by this part.
// ---------------------------------------------------------------------------

export const CreateEventInput = z.object({
  entityId: z.string().uuid().optional(),
  entityName: z.string().min(1).optional(),
  entityType: z.string().min(1).optional(),
  type: z.string().min(1),
  summary: z.string().min(1).max(2000),
  payload: z.record(z.string(), z.unknown()).default({}),
  source: z.enum(["manual", "capture", "integration"]).default("capture"),
  occurredAt: z.string().datetime().optional(),
});
export type CreateEventInputT = z.infer<typeof CreateEventInput>;

defineCapability<CreateEventInputT>({
  name: "events.create",
  description: "Create a structured event, optionally creating its entity if missing.",
  inputSchema: CreateEventInput,
  // Capture-derived events never auto-execute for an agent actor — they
  // always land as pending_approval so a human reviews the CaptureModal
  // proposal before anything is written (section E.4 requirement).
  autoApprove: () => false,
  handler: async (input) => {
    let entityId = input.entityId;
    if (!entityId && input.entityName) {
      const [existing] = await db
        .select()
        .from(entities)
        .where(eq(entities.name, input.entityName))
        .limit(1);
      if (existing) {
        entityId = existing.id;
      } else {
        const [created] = await db
          .insert(entities)
          .values({ type: input.entityType ?? "unknown", name: input.entityName })
          .returning({ id: entities.id });
        entityId = created.id;
      }
    }
    const [row] = await db
      .insert(events)
      .values({
        entityId: entityId ?? null,
        type: input.type,
        summary: input.summary,
        payload: input.payload,
        source: input.source,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
      })
      .returning();
    return row;
  },
});
