// LEADOS Part 01 — small, shared helpers for the event system: cursor
// pagination encoding and deterministic state hashing (used by the rebuild
// determinism test and by `npx tsx scripts/rebuild.ts`).
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Cursor pagination
// ---------------------------------------------------------------------------
//
// Cursor spec: an opaque base64 string encoding a JSON object
// `{ eventId: string, occurredAt: string }`. Event streams are paginated in
// *valid-time* order: `ORDER BY occurred_at ASC, event_id ASC`. A page is
// fetched with `WHERE (occurred_at, event_id) > (cursor.occurredAt, cursor.eventId)`.
//
// Why valid-time order and not transaction-time (recordedAt/insertion) order:
// event streams are consumed by business-facing UI ("show me what happened,
// in the order it happened") and by projectors that must apply events in the
// order the business believes they occurred. Transaction-time ordering is
// still available (every row keeps `recordedAt`), and `asOf({ transactionAt })`
// filters on it explicitly — see src/lib/platform/eventRepository.ts and
// docs/DATA.md. Mixing the two orderings in one cursor would make pagination
// non-monotonic whenever an import backdates `occurredAt`, which is exactly
// the failure mode we need the two timestamps to prevent.

export type EventCursor = {
  eventId: string;
  occurredAt: string; // ISO-8601
};

export function encodeCursor(cursor: EventCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(raw: string): EventCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid cursor: not valid base64/JSON");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as any).eventId !== "string" ||
    typeof (parsed as any).occurredAt !== "string"
  ) {
    throw new Error("Invalid cursor: missing eventId/occurredAt");
  }
  return parsed as EventCursor;
}

// ---------------------------------------------------------------------------
// Deterministic state hashing (for the rebuild-determinism test and
// export/import round-trip verification).
// ---------------------------------------------------------------------------

/** Stable JSON stringify: object keys sorted recursively so the same
 * logical value always serializes to the same bytes regardless of
 * insertion order (JSONB from Postgres does not guarantee key order). */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Hash a full projection snapshot (array of rows) deterministically,
 * independent of the order the rows were fetched in. */
export function hashProjectionRows(
  rows: Array<{ projectorName: string; entityId: string; state: unknown }>,
): string {
  const normalized = rows
    .map((r) => ({
      projectorName: r.projectorName,
      entityId: r.entityId,
      state: sortDeep(r.state),
    }))
    .sort((a, b) =>
      `${a.projectorName}:${a.entityId}`.localeCompare(`${b.projectorName}:${b.entityId}`),
    );
  return sha256Hex(stableStringify(normalized));
}
