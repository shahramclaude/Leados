import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { skillRepository } from "@/lib/platform/repositories";
import { SYSTEM_ACTOR, type OrgContext } from "@/lib/platform/orgContext";
import { loadEntityEvents } from "@/lib/platform/events/eventStore";
import { fold } from "@/lib/projections/entityProjection";

let orgId: string;
let ctx: OrgContext;

beforeAll(async () => {
  const slug = `test-org-${randomUUID()}`;
  const [row] = await db.insert(schema.orgs).values({ id: randomUUID(), name: "Test Org", slug }).returning();
  orgId = row.id;
  ctx = { orgId, actor: SYSTEM_ACTOR };
});

afterAll(async () => {
  // Leave data in place for forensic inspection via the admin UI; tests use
  // unique orgs so there is no cross-test interference. We only close the
  // pool implicitly when the process exits.
});

describe("idempotency: unique (orgId, idempotencyKey) never re-executes", () => {
  it("replays the original result on a repeated idempotencyKey instead of creating a duplicate event", async () => {
    const id = randomUUID();
    const idempotencyKey = `test:create:${id}`;
    const entity = { id, orgId, version: 0, validFrom: new Date().toISOString(), validTo: null, deletedAt: null, name: "Idempotent Skill", category: "technical" };

    const first = await skillRepository.create(ctx, { entity, idempotencyKey });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.replayed ?? false).toBe(false);

    const second = await skillRepository.create(ctx, { entity, idempotencyKey });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.replayed).toBe(true);
    expect(second.value.id).toBe(first.value.id);
    expect(second.value.version).toBe(first.value.version);

    const events = await loadEntityEvents(db, orgId, "skill", id, 0);
    expect(events.length).toBe(1); // never re-executed
  });
});

describe("optimistic concurrency: stale expectedVersion is rejected", () => {
  it("returns a conflict DomainError when expectedVersion does not match current version", async () => {
    const id = randomUUID();
    const created = await skillRepository.create(ctx, {
      entity: { id, orgId, version: 0, validFrom: new Date().toISOString(), validTo: null, deletedAt: null, name: "Concurrency Skill", category: "technical" },
      idempotencyKey: `test:create:${id}`,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.version).toBe(1);

    const staleUpdate = await skillRepository.update(ctx, {
      id,
      patch: { name: "Renamed once" },
      expectedVersion: 0, // stale — current is 1
      idempotencyKey: `test:update-stale:${id}`,
    });
    expect(staleUpdate.ok).toBe(false);
    if (staleUpdate.ok) return;
    expect(staleUpdate.error.code).toBe("conflict");

    const correctUpdate = await skillRepository.update(ctx, {
      id,
      patch: { name: "Renamed correctly" },
      expectedVersion: 1,
      idempotencyKey: `test:update-ok:${id}`,
    });
    expect(correctUpdate.ok).toBe(true);
    if (!correctUpdate.ok) return;
    expect(correctUpdate.value.version).toBe(2);
    expect((correctUpdate.value.data as { name: string }).name).toBe("Renamed correctly");
  });
});

describe("validation: invalid entities are rejected before any event is written", () => {
  it("rejects a skill missing a required field", async () => {
    const id = randomUUID();
    const result = await skillRepository.create(ctx, {
      // @ts-expect-error intentionally missing `category` to exercise validation
      entity: { id, orgId, version: 0, validFrom: new Date().toISOString(), validTo: null, deletedAt: null, name: "Bad Skill" },
      idempotencyKey: `test:create-invalid:${id}`,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid");

    const events = await loadEntityEvents(db, orgId, "skill", id, 0);
    expect(events.length).toBe(0);
  });
});

describe("tenancy: queries never cross orgs", () => {
  it("a second org cannot see the first org's entities", async () => {
    const [otherOrg] = await db.insert(schema.orgs).values({ id: randomUUID(), name: "Other Org", slug: `other-${randomUUID()}` }).returning();
    const otherCtx: OrgContext = { orgId: otherOrg.id, actor: SYSTEM_ACTOR };

    const id = randomUUID();
    await skillRepository.create(ctx, {
      entity: { id, orgId, version: 0, validFrom: new Date().toISOString(), validTo: null, deletedAt: null, name: "Org-scoped skill", category: "technical" },
      idempotencyKey: `test:create-scoped:${id}`,
    });

    const loadFromOtherOrg = await skillRepository.load(otherCtx, id);
    expect(loadFromOtherOrg.ok).toBe(false);
    if (loadFromOtherOrg.ok) return;
    expect(loadFromOtherOrg.error.code).toBe("not_found");
  });
});

describe("replay-equivalence: the maintained projection matches a from-scratch fold of the raw event log", () => {
  it("folding the entity's raw events produces the same data the repository projection shows", async () => {
    const id = randomUUID();
    await skillRepository.create(ctx, {
      entity: { id, orgId, version: 0, validFrom: new Date().toISOString(), validTo: null, deletedAt: null, name: "Replay Skill", category: "technical" },
      idempotencyKey: `test:replay-create:${id}`,
    });
    await skillRepository.update(ctx, { id, patch: { name: "Replay Skill v2" }, expectedVersion: 1, idempotencyKey: `test:replay-update:${id}` });
    await skillRepository.update(ctx, { id, patch: { category: "leadership" }, expectedVersion: 2, idempotencyKey: `test:replay-update-2:${id}` });

    const loaded = await skillRepository.load(ctx, id);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const rawEvents = await loadEntityEvents(db, orgId, "skill", id, 0);
    const folded = fold(rawEvents);

    expect(folded?.data).toEqual(loaded.value.data);
    expect(folded?.version).toBe(loaded.value.version);
  });
});

void and;
void eq;
