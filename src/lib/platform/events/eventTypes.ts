// Generic CRUD-over-events taxonomy. All 14 domain entities share these four
// event types; entity-specific meaning lives in the zod schema validated at
// write time (see src/lib/domain/*), not in the event type string. This is a
// REVERSIBLE decision — entity-specific event types (e.g.
// `objective.recommitted`) can be introduced later as additive schema
// versions without breaking the fold, because `apply()` ignores unknown
// event types by default (see src/lib/projections/entityProjection.ts).

export const CURRENT_SCHEMA_VERSION = 1;

export const ENTITY_EVENT_TYPES = {
  created: "entity.created",
  updated: "entity.updated",
  deleted: "entity.deleted",
  restored: "entity.restored",
} as const;

export type EntityEventType = (typeof ENTITY_EVENT_TYPES)[keyof typeof ENTITY_EVENT_TYPES];

export type EntityCreatedPayload = { entity: Record<string, unknown> };
export type EntityUpdatedPayload = { patch: Record<string, unknown> };
export type EntityDeletedPayload = { reason?: string };
export type EntityRestoredPayload = Record<string, never>;
