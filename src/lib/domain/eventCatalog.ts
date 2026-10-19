/**
 * src/lib/domain/eventCatalog.ts
 *
 * The versioned registry of every event type LEADOS is allowed to persist
 * to the `events` table. This is the canonical location referenced by
 * ARCHITECTURE.md and FEATURES.md.
 *
 * Adding a new event type or bumping a version is a deliberate,
 * reviewable act: add an entry here, add a matching zod schema in
 * `eventSchema.ts`, and nothing else in the codebase has to change to
 * start accepting it — `recordEvent()` (src/lib/app/events/recordEvent.ts)
 * validates against this registry automatically.
 *
 * Only two generic, infrastructure-level event types exist today because
 * this is Part 0 (ground-truth/consolidation): no leadership-intelligence
 * engines (Signal Board, Thermodynamics, CAS, Risk Register, etc.) have
 * been built yet. See FEATURES.md and README.md "Roadmap".
 */
export interface EventCatalogEntry {
  /** Dot-namespaced event type, e.g. "system.ping". */
  type: string;
  /** Monotonically increasing per-type schema version, starting at 1. */
  version: number;
  /** Human-readable description of what this event represents. */
  description: string;
}

export const EVENT_CATALOG = [
  {
    type: "system.ping",
    version: 1,
    description: "Lightweight connectivity/smoke-test event with an operator-supplied message.",
  },
  {
    type: "system.annotation",
    version: 1,
    description: "A free-form operator note, optionally tagged, recorded against the audit trail.",
  },
] as const satisfies readonly EventCatalogEntry[];

export type EventCatalogEntryLiteral = (typeof EVENT_CATALOG)[number];
export type EventType = EventCatalogEntryLiteral["type"];

export function findCatalogEntry(type: string, version: number): EventCatalogEntry | undefined {
  return EVENT_CATALOG.find((entry) => entry.type === type && entry.version === version);
}

export function registryKey(type: string, version: number): string {
  return `${type}:${version}`;
}
