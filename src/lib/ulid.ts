// Thin, documented wrapper around the `ulid` package so the rest of the
// codebase has one import to depend on (and so we can swap the monotonic
// factory strategy in one place later if needed).
//
// Why ULID and not a serial integer or a plain UUIDv4 for eventId:
//  - Monotonic: ulidFactory() guarantees strictly increasing ids even when
//    multiple events are generated within the same millisecond in the same
//    process, which matters because eventId is also used as the default
//    cursor-pagination tiebreaker and as the natural "insertion order" key.
//  - Sortable as a plain string (lexicographic order == chronological order),
//    so `ORDER BY event_id` and `ORDER BY occurred_at, event_id` agree for
//    events generated in-process without backdating.
//  - Collision-safe across processes (80 bits of randomness per millisecond).
//  - Still a single TEXT primary key, so no serial sequence coordination is
//    needed across the eventual multi-tenant / multi-writer setup (Part 13).
import { monotonicFactory } from "ulid";

const monotonicUlid = monotonicFactory();

/** Generate a new monotonic ULID. Safe to call many times per millisecond. */
export function newUlid(): string {
  return monotonicUlid();
}
