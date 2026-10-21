import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { randomUUID } from "node:crypto";
import { fold, foldByEntity, sortEvents } from "@/lib/projections/entityProjection";
import type { EventEnvelope } from "@/lib/platform/events/envelope";
import { ENTITY_EVENT_TYPES, CURRENT_SCHEMA_VERSION } from "@/lib/platform/events/eventTypes";

const ORG_ID = randomUUID();

function shuffleDeterministically<T>(items: T[], seed: number): T[] {
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function makeEvent(overrides: Partial<EventEnvelope> & { seq: number }): EventEnvelope {
  return {
    eventId: randomUUID(),
    eventType: ENTITY_EVENT_TYPES.updated,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    orgId: ORG_ID,
    entityType: "skill",
    entityId: randomUUID(),
    actor: { kind: "system", id: "test", displayName: "test" },
    occurredAt: new Date(2024, 0, 1, 0, 0, overrides.seq).toISOString(),
    recordedAt: new Date(2024, 0, 1, 0, 0, overrides.seq).toISOString(),
    correlationId: randomUUID(),
    causationId: null,
    idempotencyKey: randomUUID(),
    payload: { patch: {} },
    prevHash: null,
    hash: "test-hash",
    ...overrides,
  };
}

describe("fold: determinism and totality", () => {
  it("is a pure function: same input (even out of order) always produces the same output", () => {
    fc.assert(
      fc.property(
        // `occurredAtSlot` may collide across events (same business time is
        // legal); `seq` must NOT collide — in production it is a DB
        // bigserial and is always globally unique. We model that by
        // assigning seq from the array index at construction time, which is
        // the one thing a permutation of the ALREADY-BUILT event objects
        // must never change.
        fc.array(fc.record({ occurredAtSlot: fc.integer({ min: 0, max: 20 }), amount: fc.integer({ min: -100, max: 100 }) }), { minLength: 1, maxLength: 30 }),
        (ops) => {
          const entityId = randomUUID();
          let seqCounter = 0;
          const created = makeEvent({
            seq: seqCounter++,
            eventType: ENTITY_EVENT_TYPES.created,
            entityId,
            occurredAt: new Date(2024, 0, 1, 0, 0, 0).toISOString(),
            recordedAt: new Date(2024, 0, 1, 0, 0, 0).toISOString(),
            payload: { entity: { id: entityId, total: 0 } },
          });
          const updates = ops.map((op) =>
            makeEvent({
              seq: seqCounter++,
              entityId,
              occurredAt: new Date(2024, 0, 1, 0, 0, op.occurredAtSlot).toISOString(),
              recordedAt: new Date(2024, 0, 1, 0, 0, op.occurredAtSlot).toISOString(),
              payload: { patch: { lastDelta: op.amount } },
            }),
          );
          const events = [created, ...updates];

          // Permuting the ARRAY ORDER of already-built events (each still
          // carrying its own fixed, unique seq) must not change the result,
          // because fold() always re-sorts by (occurredAt, recordedAt, seq)
          // first. This is the actual "fold is order-stable" claim.
          const result1 = fold(events);
          const result2 = fold(events.slice().reverse());
          const result3 = fold(shuffleDeterministically(events, 12345));

          expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
          expect(JSON.stringify(result1)).toBe(JSON.stringify(result3));
        },
      ),
    );
  });

  it("is total: unknown/future event types are ignored rather than throwing", () => {
    const entityId = randomUUID();
    const created = makeEvent({ seq: 0, eventType: ENTITY_EVENT_TYPES.created, entityId, payload: { entity: { id: entityId, name: "a" } } });
    const future = makeEvent({ seq: 1, eventType: "entity.renamed_in_a_future_schema_version", entityId, payload: { anything: true } });
    expect(() => fold([created, future])).not.toThrow();
    const state = fold([created, future]);
    expect(state?.data).toEqual({ id: entityId, name: "a" });
  });

  it("sortEvents orders by occurredAt, then recordedAt, then seq — stable for ties", () => {
    const e1 = makeEvent({ seq: 5, occurredAt: "2024-01-01T00:00:00.000Z", recordedAt: "2024-01-01T00:00:01.000Z" });
    const e2 = makeEvent({ seq: 2, occurredAt: "2024-01-01T00:00:00.000Z", recordedAt: "2024-01-01T00:00:00.000Z" });
    const sorted = sortEvents([e1, e2]);
    expect(sorted[0].seq).toBe(2);
    expect(sorted[1].seq).toBe(5);
  });
});

describe("fold: order-stability under permutation of independent events", () => {
  it("permuting events across DIFFERENT entities does not change any entity's final state", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 6 }), fc.integer({ min: 1, max: 20 }), (entityCount, updatesPerEntity) => {
        const entityIds = Array.from({ length: entityCount }, () => randomUUID());
        const events: EventEnvelope[] = [];
        let seq = 0;
        for (const id of entityIds) {
          events.push(makeEvent({ seq: seq++, eventType: ENTITY_EVENT_TYPES.created, entityId: id, payload: { entity: { id, counter: 0 } } }));
          for (let i = 0; i < updatesPerEntity; i++) {
            events.push(makeEvent({ seq: seq++, entityId: id, payload: { patch: { counter: i + 1 } } }));
          }
        }

        const baseline = foldByEntity(events);

        // Permute the whole event array (shuffles across entities too) —
        // per-entity relative order is NOT guaranteed by a naive shuffle, so
        // instead we interleave differently while preserving each entity's
        // internal order, which is the actual "independent events" claim.
        const perEntityStreams = entityIds.map((id) => events.filter((e) => e.entityId === id));
        const interleaved: EventEnvelope[] = [];
        const cursors = perEntityStreams.map(() => 0);
        let remaining = perEntityStreams.reduce((a, s) => a + s.length, 0);
        let roundRobin = 0;
        while (remaining > 0) {
          const streamIdx = roundRobin % perEntityStreams.length;
          const stream = perEntityStreams[streamIdx];
          if (cursors[streamIdx] < stream.length) {
            interleaved.push(stream[cursors[streamIdx]]);
            cursors[streamIdx]++;
            remaining--;
          }
          roundRobin++;
        }

        const permuted = foldByEntity(interleaved);

        for (const id of entityIds) {
          const key = `${ORG_ID}::skill::${id}`;
          expect(JSON.stringify(permuted.get(key))).toBe(JSON.stringify(baseline.get(key)));
        }
      }),
    );
  });
});
