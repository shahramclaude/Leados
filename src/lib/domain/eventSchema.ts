/**
 * src/lib/domain/eventSchema.ts
 *
 * Runtime validation for every event payload that crosses the API
 * boundary, keyed by `type:version` against `eventCatalog.ts`. This is the
 * "versioned schema registry" required by Part 0, item 4.
 *
 * Validation approach: zod. Chosen because it is already idiomatic in the
 * Next.js App Router ecosystem, gives us static type inference for free
 * (`z.infer`), and composes cleanly with a registry keyed by string ->
 * schema without any code generation step.
 */
import { z } from "zod";
import { EVENT_CATALOG, findCatalogEntry, registryKey, type EventType } from "./eventCatalog";

type ZodIssue = z.ZodError["issues"][number];

const systemPingPayloadV1 = z.object({
  message: z.string().min(1).max(2000),
});

const systemAnnotationPayloadV1 = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
});

/**
 * Registry of payload schemas keyed by `${type}:${version}`. Every entry in
 * `EVENT_CATALOG` must have a matching schema here — enforced below.
 */
const EVENT_PAYLOAD_SCHEMAS = {
  [registryKey("system.ping", 1)]: systemPingPayloadV1,
  [registryKey("system.annotation", 1)]: systemAnnotationPayloadV1,
} as const;

// Fail fast (at module load, not at request time) if the catalog and the
// schema registry ever drift apart.
for (const entry of EVENT_CATALOG) {
  if (!(registryKey(entry.type, entry.version) in EVENT_PAYLOAD_SCHEMAS)) {
    throw new Error(
      `Event catalog entry "${entry.type}:${entry.version}" has no matching schema in eventSchema.ts`,
    );
  }
}

export class UnknownEventTypeError extends Error {
  constructor(type: string, version: number) {
    super(`Unknown event type/version combination: "${type}:${version}". See eventCatalog.ts.`);
    this.name = "UnknownEventTypeError";
  }
}

export class EventPayloadValidationError extends Error {
  issues: ZodIssue[];

  constructor(type: string, version: number, issues: ZodIssue[]) {
    super(
      `Event payload for "${type}:${version}" failed validation: ${issues
        .map((issue) => `${issue.path.join(".") || "(root)"} - ${issue.message}`)
        .join("; ")}`,
    );
    this.name = "EventPayloadValidationError";
    this.issues = issues;
  }
}

/**
 * Validate an arbitrary payload against the registered schema for
 * `type`/`version`. Throws `UnknownEventTypeError` if the catalog has no
 * such entry, or `EventPayloadValidationError` if the payload does not
 * match the schema. Returns the parsed (and therefore typed) payload.
 */
export function validateEventPayload(type: string, version: number, payload: unknown): unknown {
  const catalogEntry = findCatalogEntry(type, version);
  if (!catalogEntry) {
    throw new UnknownEventTypeError(type, version);
  }

  const schema = EVENT_PAYLOAD_SCHEMAS[registryKey(type, version) as keyof typeof EVENT_PAYLOAD_SCHEMAS];
  const result = schema.safeParse(payload);

  if (!result.success) {
    throw new EventPayloadValidationError(type, version, result.error.issues);
  }

  return result.data;
}

export type { EventType };
export type SystemPingPayloadV1 = z.infer<typeof systemPingPayloadV1>;
export type SystemAnnotationPayloadV1 = z.infer<typeof systemAnnotationPayloadV1>;
