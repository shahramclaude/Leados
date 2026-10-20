import { z } from "zod";
import { findEventDefinition } from "./eventCatalog";

const schemas: Record<string, z.ZodType> = {
  "system.ping@1": z.object({ message: z.string().min(1) }),
  "onboarding.completed@1": z.object({ orgName: z.string().min(1) }),
  "signal.captured@1": z.object({
    title: z.string().min(1),
    body: z.string().default(""),
    tags: z.array(z.string()).optional(),
  }),
  "finding.created@1": z.object({ findingId: z.number().int().positive(), title: z.string() }),
  "decision.belief_updated@1": z.object({
    decisionId: z.number().int().positive(),
    successes: z.number().int().min(0),
    failures: z.number().int().min(0),
  }),
  "automation.run_completed@1": z.object({
    runId: z.number().int().positive(),
    kind: z.string(),
  }),
  "boardpack.generated@1": z.object({ boardPackId: z.number().int().positive() }),
};

export class UnknownEventTypeError extends Error {
  constructor(type: string, version: number) {
    super(`Unknown event type/version: ${type}@${version}`);
    this.name = "UnknownEventTypeError";
  }
}

export class EventPayloadValidationError extends Error {
  constructor(
    type: string,
    version: number,
    public readonly issues: z.ZodIssue[],
  ) {
    super(`Invalid payload for ${type}@${version}: ${issues.map((i) => i.message).join("; ")}`);
    this.name = "EventPayloadValidationError";
  }
}

/** Validates `payload` against the registered schema for `type`/`version`. Throws on failure. */
export function validateEventPayload(type: string, version: number, payload: unknown): unknown {
  const definition = findEventDefinition(type, version);
  if (!definition) {
    throw new UnknownEventTypeError(type, version);
  }
  const schema = schemas[`${type}@${version}`];
  /* v8 ignore next 3 -- defensive: every EVENT_CATALOG entry has a matching
     schema here, enforced by the "every catalog entry has a resolvable
     definition" test; this guards against the two registries drifting. */
  if (!schema) {
    throw new UnknownEventTypeError(type, version);
  }
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new EventPayloadValidationError(type, version, result.error.issues);
  }
  return result.data;
}
