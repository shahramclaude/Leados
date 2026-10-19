// Versioned registry of every event type LEADOS accepts. Nothing gets
// written to the `events` table unless its (type, version) pair is listed
// here and its payload passes the matching zod schema in eventSchema.ts.
//
// Part 5 adds the people-domain event types. They are intentionally
// metadata-only where they touch collaboration: `collaboration.*` events
// never carry message bodies, subject lines, or attachments — see the
// schema comments below and docs/PRIVACY.md.

export interface EventCatalogEntry {
  type: string;
  version: number;
  description: string;
  owner: "people" | "platform";
}

export const EVENT_CATALOG: EventCatalogEntry[] = [
  { type: "system.ping", version: 1, description: "Liveness probe event.", owner: "platform" },
  {
    type: "system.annotation",
    version: 1,
    description: "Free-text operator annotation.",
    owner: "platform",
  },

  // --- People lifecycle -----------------------------------------------
  {
    type: "person.hired",
    version: 1,
    description: "A person joined the org.",
    owner: "people",
  },
  {
    type: "person.role_changed",
    version: 1,
    description: "Title/role change for a person.",
    owner: "people",
  },
  {
    type: "person.manager_changed",
    version: 1,
    description: "Reporting line change.",
    owner: "people",
  },
  {
    type: "person.compensation_reviewed",
    version: 1,
    description: "Compa-ratio recorded at a compensation review. No raw salary figures leave this event; compa-ratio is a band-relative number used only by the flight-risk engine.",
    owner: "people",
  },
  {
    type: "person.skill_evidenced",
    version: 1,
    description: "Evidence added for a skill (project, review, certification).",
    owner: "people",
  },
  {
    type: "person.growth_conversation_held",
    version: 1,
    description: "A growth/career conversation happened (distinct from a routine 1:1).",
    owner: "people",
  },

  // --- 1:1s & growth -----------------------------------------------
  { type: "oneonone.scheduled", version: 1, description: "A 1:1 was scheduled.", owner: "people" },
  { type: "oneonone.completed", version: 1, description: "A 1:1 was completed.", owner: "people" },
  {
    type: "oneonone.commitment_resolved",
    version: 1,
    description: "A commitment from a 1:1 was marked done or missed.",
    owner: "people",
  },
  {
    type: "growth.milestone_completed",
    version: 1,
    description: "A growth-plan milestone was completed with evidence.",
    owner: "people",
  },

  // --- Consent / privacy -----------------------------------------------
  {
    type: "consent.recorded",
    version: 1,
    description: "A person granted/withdrew consent for a people-analytics processing scope.",
    owner: "people",
  },

  // --- Org network (metadata only, never content) -----------------------
  {
    type: "collaboration.meeting_logged",
    version: 1,
    description: "Calendar metadata only: participant ids, duration, recurrence. No agenda/notes text.",
    owner: "people",
  },
  {
    type: "collaboration.message_logged",
    version: 1,
    description: "Messaging metadata only: sender/recipient ids, channel, timestamp. Body/subject is never captured — enforced by schema (no `content`/`body`/`subject` field exists).",
    owner: "people",
  },
];

export function findCatalogEntry(type: string, version: number): EventCatalogEntry | undefined {
  return EVENT_CATALOG.find((entry) => entry.type === type && entry.version === version);
}
