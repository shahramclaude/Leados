// src/lib/events/eventCatalog.ts
//
// The versioned schema registry for every event type LEADOS can append.
// This is the single place that defines:
//   - which domain an event belongs to (drives projector dispatch)
//   - the zod payload schema for its current `schemaVersion`
//   - which payload fields are personally identifying (drives the GDPR
//     erasure/anonymization flow, docs/DATA.md §7)
//   - the default retention policy seeded into `retention_policies`
//
// Adding a new event TYPE: add an entry here with schemaVersion 1.
// Changing the SHAPE of an existing event type: bump schemaVersion, add a
// new zod schema keyed by the new version, and keep the old one so
// historical events already on the log keep validating against the schema
// they were written with (events are immutable — the registry must be
// able to validate every version that ever shipped).

import { z } from "zod";

export const DOMAINS = ["people", "execution", "strategy", "finance", "system"] as const;
export type Domain = (typeof DOMAINS)[number];

const personAddedV1 = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  role: z.string().min(1).max(120),
  team: z.string().min(1).max(120),
});

const personUpdatedV1 = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  role: z.string().min(1).max(120).optional(),
  team: z.string().min(1).max(120).optional(),
});

const personCheckinV1 = z.object({
  sentiment: z.number().min(0).max(1),
  engagement: z.number().min(0).max(1),
  flightRisk: z.number().min(0).max(1),
});

const personExitSignalV1 = z.object({
  note: z.string().min(1).max(2000),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
});

const projectCreatedV1 = z.object({
  title: z.string().min(1).max(200),
  owner: z.string().min(1).max(120),
  domain: z.string().min(1).max(60).default("execution"),
  confidence: z.number().min(0).max(1).default(0.5),
  durationDays: z.number().int().min(0).default(30),
});

const projectUpdatedV1 = z.object({
  status: z.enum(["backlog", "in_progress", "blocked", "done"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const projectCompletedV1 = z.object({});

const milestoneCreatedV1 = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1).max(200),
  dueDate: z.string().datetime(),
});

const milestoneCompletedV1 = z.object({});
const milestoneOverdueV1 = z.object({});

const blockerRaisedV1 = z.object({
  projectId: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  description: z.string().min(1).max(2000),
});

const blockerResolvedV1 = z.object({});

const decisionLoggedV1 = z.object({
  title: z.string().min(1).max(200),
  owner: z.string().min(1).max(120),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  dueDate: z.string().datetime().optional(),
  description: z.string().max(4000).default(""),
});

const decisionOutcomeV1 = z.object({
  status: z.enum(["open", "decided", "abandoned"]),
  outcome: z.string().max(4000).optional(),
});

const okrSetV1 = z.object({
  title: z.string().min(1).max(200),
  owner: z.string().min(1).max(120),
  quarterStart: z.string().datetime(),
});

const okrProgressV1 = z.object({
  progress: z.number().min(0).max(1),
  health: z.enum(["on_track", "at_risk", "off_track"]).default("on_track"),
});

const financeSnapshotV1 = z.object({
  cash: z.number(),
  mrr: z.number(),
  burn: z.number(),
  runwayMonths: z.number(),
});

const metricRecordedV1 = z.object({
  metricKey: z.string().min(1).max(120),
  value: z.number(),
});

const orgFactRecordedV1 = z.object({
  subjectType: z.enum(["person", "project", "org"]),
  subjectId: z.string().min(1),
  attribute: z.string().min(1).max(120),
  value: z.record(z.string(), z.unknown()),
  validFrom: z.string().datetime(),
  validTo: z.string().datetime().optional(),
});

export interface EventCatalogEntry<T extends z.ZodTypeAny = z.ZodTypeAny> {
  type: string;
  domain: Domain;
  schemaVersion: number;
  schema: T;
  piiFields: string[];
  description: string;
  /** null retentionDays = retained indefinitely (e.g. decisions, finance). */
  retentionDays: number | null;
  purgeable: boolean;
  retentionRationale: string;
}

function entry<T extends z.ZodTypeAny>(e: EventCatalogEntry<T>): EventCatalogEntry<T> {
  return e;
}

export const EVENT_CATALOG = {
  "person.added": entry({
    type: "person.added",
    domain: "people",
    schemaVersion: 1,
    schema: personAddedV1,
    piiFields: ["name", "email"],
    description: "A person was added to the roster.",
    retentionDays: null,
    purgeable: false,
    retentionRationale: "Employment record; retained for the lifetime of the org relationship.",
  }),
  "person.updated": entry({
    type: "person.updated",
    domain: "people",
    schemaVersion: 1,
    schema: personUpdatedV1,
    piiFields: ["name", "email"],
    description: "A person's role/team/contact info changed.",
    retentionDays: null,
    purgeable: false,
    retentionRationale: "Employment record; retained for the lifetime of the org relationship.",
  }),
  "person.checkin": entry({
    type: "person.checkin",
    domain: "people",
    schemaVersion: 1,
    schema: personCheckinV1,
    piiFields: [],
    description: "Sentiment/engagement/flight-risk pulse for a person.",
    retentionDays: 730,
    purgeable: true,
    retentionRationale: "High-frequency sentiment telemetry; purged after 2 years, aggregates survive in projections.",
  }),
  "person.exit_signal": entry({
    type: "person.exit_signal",
    domain: "people",
    schemaVersion: 1,
    schema: personExitSignalV1,
    piiFields: ["note"],
    description: "A signal suggesting flight risk for a person.",
    retentionDays: 730,
    purgeable: true,
    retentionRationale: "Sensitive free-text note; purged after 2 years.",
  }),
  "project.created": entry({
    type: "project.created",
    domain: "execution",
    schemaVersion: 1,
    schema: projectCreatedV1,
    piiFields: [],
    description: "A new project/initiative was created.",
    retentionDays: null,
    purgeable: false,
    retentionRationale: "Execution history; retained indefinitely for retrospectives.",
  }),
  "project.updated": entry({
    type: "project.updated",
    domain: "execution",
    schemaVersion: 1,
    schema: projectUpdatedV1,
    piiFields: [],
    description: "Project status or confidence changed.",
    retentionDays: null,
    purgeable: false,
    retentionRationale: "Execution history; retained indefinitely for retrospectives.",
  }),
  "project.completed": entry({
    type: "project.completed",
    domain: "execution",
    schemaVersion: 1,
    schema: projectCompletedV1,
    piiFields: [],
    description: "A project was marked complete.",
    retentionDays: null,
    purgeable: false,
    retentionRationale: "Execution history; retained indefinitely for retrospectives.",
  }),
  "milestone.created": entry({
    type: "milestone.created",
    domain: "execution",
    schemaVersion: 1,
    schema: milestoneCreatedV1,
    piiFields: [],
    description: "A milestone was added to a project.",
    retentionDays: null,
    purgeable: false,
    retentionRationale: "Execution history; retained indefinitely for retrospectives.",
  }),
  "milestone.completed": entry({
    type: "milestone.completed",
    domain: "execution",
    schemaVersion: 1,
    schema: milestoneCompletedV1,
    piiFields: [],
    description: "A milestone was completed.",
    retentionDays: null,
    purgeable: false,
    retentionRationale: "Execution history; retained indefinitely for retrospectives.",
  }),
  "milestone.overdue": entry({
    type: "milestone.overdue",
    domain: "execution",
    schemaVersion: 1,
    schema: milestoneOverdueV1,
    piiFields: [],
    description: "A milestone passed its due date incomplete.",
    retentionDays: null,
    purgeable: false,
    retentionRationale: "Execution history; retained indefinitely for retrospectives.",
  }),
  "blocker.raised": entry({
    type: "blocker.raised",
    domain: "execution",
    schemaVersion: 1,
    schema: blockerRaisedV1,
    piiFields: [],
    description: "A blocker was raised against a project.",
    retentionDays: null,
    purgeable: false,
    retentionRationale: "Execution history; retained indefinitely for retrospectives.",
  }),
  "blocker.resolved": entry({
    type: "blocker.resolved",
    domain: "execution",
    schemaVersion: 1,
    schema: blockerResolvedV1,
    piiFields: [],
    description: "A blocker was resolved.",
    retentionDays: null,
    purgeable: false,
    retentionRationale: "Execution history; retained indefinitely for retrospectives.",
  }),
  "decision.logged": entry({
    type: "decision.logged",
    domain: "strategy",
    schemaVersion: 1,
    schema: decisionLoggedV1,
    piiFields: [],
    description: "A decision was logged on the decision ledger.",
    retentionDays: null,
    purgeable: false,
    retentionRationale: "Governance record; retained indefinitely.",
  }),
  "decision.outcome": entry({
    type: "decision.outcome",
    domain: "strategy",
    schemaVersion: 1,
    schema: decisionOutcomeV1,
    piiFields: [],
    description: "A decision's outcome was recorded.",
    retentionDays: null,
    purgeable: false,
    retentionRationale: "Governance record; retained indefinitely.",
  }),
  "okr.set": entry({
    type: "okr.set",
    domain: "strategy",
    schemaVersion: 1,
    schema: okrSetV1,
    piiFields: [],
    description: "An objective was set for a quarter.",
    retentionDays: null,
    purgeable: false,
    retentionRationale: "Strategic record; retained indefinitely.",
  }),
  "okr.progress": entry({
    type: "okr.progress",
    domain: "strategy",
    schemaVersion: 1,
    schema: okrProgressV1,
    piiFields: [],
    description: "Progress was recorded against an objective.",
    retentionDays: null,
    purgeable: false,
    retentionRationale: "Strategic record; retained indefinitely.",
  }),
  "finance.snapshot": entry({
    type: "finance.snapshot",
    domain: "finance",
    schemaVersion: 1,
    schema: financeSnapshotV1,
    piiFields: [],
    description: "A point-in-time financial snapshot (cash/MRR/burn/runway).",
    retentionDays: null,
    purgeable: false,
    retentionRationale: "Financial record; retained indefinitely for audit/compliance.",
  }),
  "metric.recorded": entry({
    type: "metric.recorded",
    domain: "system",
    schemaVersion: 1,
    schema: metricRecordedV1,
    piiFields: [],
    description: "A generic named metric value was recorded.",
    retentionDays: 400,
    purgeable: true,
    retentionRationale: "High-volume operational telemetry; purged after ~13 months, rollups survive in metric_values.",
  }),
  "org.fact.recorded": entry({
    type: "org.fact.recorded",
    domain: "system",
    schemaVersion: 1,
    schema: orgFactRecordedV1,
    piiFields: [],
    description: "A bitemporal fact about a person/project/org (e.g. manager, team) was recorded.",
    retentionDays: null,
    purgeable: false,
    retentionRationale: "Org structure history; retained indefinitely to support asOf() retrospectives.",
  }),
} as const;

export type EventType = keyof typeof EVENT_CATALOG;

export function isKnownEventType(type: string): type is EventType {
  return Object.prototype.hasOwnProperty.call(EVENT_CATALOG, type);
}

export function getCatalogEntry(type: string): EventCatalogEntry {
  if (!isKnownEventType(type)) {
    throw new UnknownEventTypeError(type);
  }
  return EVENT_CATALOG[type];
}

export class UnknownEventTypeError extends Error {
  constructor(type: string) {
    super(`Unknown event type "${type}". Register it in src/lib/events/eventCatalog.ts first.`);
    this.name = "UnknownEventTypeError";
  }
}

export class EventPayloadValidationError extends Error {
  issues: string[];
  constructor(type: string, issues: string[]) {
    super(`Event payload for "${type}" failed validation:\n` + issues.map((i) => `  - ${i}`).join("\n"));
    this.name = "EventPayloadValidationError";
    this.issues = issues;
  }
}

/** Validate (and coerce defaults into) a payload for a given event type. */
export function validateEventPayload(type: string, payload: unknown): Record<string, unknown> {
  const catalogEntry = getCatalogEntry(type);
  const result = catalogEntry.schema.safeParse(payload);
  if (!result.success) {
    const issues = result.error.issues.map((i: z.ZodIssue) => `${i.path.join(".") || "(root)"} - ${i.message}`);
    throw new EventPayloadValidationError(type, issues);
  }
  return result.data as Record<string, unknown>;
}

export const ALL_EVENT_TYPES = Object.keys(EVENT_CATALOG) as EventType[];
