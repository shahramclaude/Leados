import { z } from "zod";
import { findCatalogEntry } from "./eventCatalog";

// Each schema below is the single source of truth for what a payload may
// contain. Note what is deliberately absent: no `collaboration.*` schema has
// a text field for message/meeting content, and no people-domain schema
// accepts any of PROTECTED_ATTRIBUTES (see src/lib/domain/types.ts).

const schemas: Record<string, z.ZodTypeAny> = {
  "system.ping:1": z.object({ message: z.string() }),
  "system.annotation:1": z.object({
    title: z.string(),
    body: z.string(),
    tags: z.array(z.string()).optional(),
  }),

  "person.hired:1": z.object({
    personId: z.number(),
    title: z.string(),
    teamId: z.number().nullable(),
    managerId: z.number().nullable(),
    hireDate: z.string(),
  }),
  "person.role_changed:1": z.object({
    personId: z.number(),
    fromTitle: z.string(),
    toTitle: z.string(),
  }),
  "person.manager_changed:1": z.object({
    personId: z.number(),
    fromManagerId: z.number().nullable(),
    toManagerId: z.number().nullable(),
  }),
  "person.compensation_reviewed:1": z.object({
    personId: z.number(),
    compaRatio: z.number().min(0).max(3),
    bandMidpointDeltaPct: z.number().optional(),
  }),
  "person.skill_evidenced:1": z.object({
    personId: z.number(),
    skill: z.string(),
    level: z.number().min(1).max(5),
    evidence: z.string(),
  }),
  "person.growth_conversation_held:1": z.object({
    personId: z.number(),
    managerId: z.number(),
    topics: z.array(z.string()),
  }),

  "oneonone.scheduled:1": z.object({
    oneOnOneId: z.number(),
    personId: z.number(),
    managerId: z.number(),
    scheduledAt: z.string(),
  }),
  "oneonone.completed:1": z.object({
    oneOnOneId: z.number(),
    personId: z.number(),
    managerId: z.number(),
    commitmentCount: z.number(),
  }),
  "oneonone.commitment_resolved:1": z.object({
    oneOnOneId: z.number(),
    commitmentId: z.string(),
    status: z.enum(["done", "missed"]),
  }),
  "growth.milestone_completed:1": z.object({
    personId: z.number(),
    planId: z.number(),
    milestoneId: z.number(),
    skill: z.string(),
    evidence: z.string(),
  }),

  "consent.recorded:1": z.object({
    personId: z.number(),
    scope: z.string(),
    noticeVersion: z.string(),
    granted: z.boolean(),
  }),

  "collaboration.meeting_logged:1": z.object({
    meetingId: z.string(),
    participantIds: z.array(z.number()).min(1),
    organizerId: z.number(),
    durationMinutes: z.number().positive(),
    recurring: z.boolean(),
    occurredAt: z.string(),
  }),
  "collaboration.message_logged:1": z.object({
    fromId: z.number(),
    toId: z.number(),
    channel: z.enum(["chat", "email", "comment"]),
    occurredAt: z.string(),
  }),
};

export function schemaFor(type: string, version: number): z.ZodTypeAny | undefined {
  if (!findCatalogEntry(type, version)) return undefined;
  return schemas[`${type}:${version}`];
}

export function validatePayload(type: string, version: number, payload: unknown) {
  const schema = schemaFor(type, version);
  if (!schema) {
    return { ok: false as const, error: `Unknown event type/version: ${type} v${version}` };
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.message };
  }
  return { ok: true as const, data: parsed.data };
}
