import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leaderStateDecisions, leaderStateGrants, leaderStateRecoverySignals } from "@/db/schema";
import {
  AccessDeniedError,
  createDecision,
  createGrant,
  hasActiveGrant,
  listDecisions,
  listGrants,
  listRecoverySignals,
  revokeGrant,
  upsertRecoverySignal,
} from "@/lib/leaderState/repository";
import type { ActorContext, ActorRole } from "@/lib/privacy";
import { getCapacitySignalForScheduler } from "@/lib/leaderState/capacitySignals";

// A unique owner per test run so this suite is independently re-runnable
// without clashing with leftover data from previous runs or the UI demo user.
const OWNER_ID = `test-owner-${randomUUID()}`;
const OTHER_OWNER_ID = `test-other-owner-${randomUUID()}`;

const NON_OWNER_ROLES: ActorRole[] = ["admin", "manager", "system"];

function actorAs(userId: string, role: ActorRole): ActorContext {
  return { userId, role };
}

beforeAll(async () => {
  // Seed one decision, one recovery signal, for the owner.
  await createDecision({ userId: OWNER_ID, role: "member" }, OWNER_ID, {
    stakes: 4,
    timePressure: 3,
    informationCompleteness: 3,
    clarity: 4,
    reversibility: "costly-to-reverse",
    selfRatedQuality: 4,
  });
  await upsertRecoverySignal({ userId: OWNER_ID, role: "member" }, OWNER_ID, {
    date: "2026-01-05",
    deepWorkBlocksPlanned: 2,
    deepWorkBlocksHonored: 1,
    quietHoursKept: true,
    meetingMinutes: 120,
  });
});

afterAll(async () => {
  await db.delete(leaderStateDecisions).where(eq(leaderStateDecisions.ownerUserId, OWNER_ID));
  await db.delete(leaderStateRecoverySignals).where(eq(leaderStateRecoverySignals.ownerUserId, OWNER_ID));
  await db.delete(leaderStateGrants).where(eq(leaderStateGrants.ownerUserId, OWNER_ID));
  await db.delete(leaderStateDecisions).where(eq(leaderStateDecisions.ownerUserId, OTHER_OWNER_ID));
  await db.delete(leaderStateGrants).where(eq(leaderStateGrants.ownerUserId, OTHER_OWNER_ID));
});

describe("self-scope attempt matrix — 100% denial bar for non-owners", () => {
  it("owner (role=member) CAN read their own decisions", async () => {
    const rows = await listDecisions(actorAs(OWNER_ID, "member"), OWNER_ID);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("owner acting under an elevated role header for THEIR OWN id is still allowed (role is irrelevant, identity is what matters)", async () => {
    const rows = await listDecisions(actorAs(OWNER_ID, "admin"), OWNER_ID);
    expect(rows.length).toBeGreaterThan(0);
  });

  for (const role of NON_OWNER_ROLES) {
    it(`listDecisions: role="${role}" with a different userId is DENIED`, async () => {
      await expect(listDecisions(actorAs(`attacker-${role}`, role), OWNER_ID)).rejects.toBeInstanceOf(
        AccessDeniedError,
      );
    });

    it(`listRecoverySignals: role="${role}" with a different userId is DENIED`, async () => {
      await expect(listRecoverySignals(actorAs(`attacker-${role}`, role), OWNER_ID)).rejects.toBeInstanceOf(
        AccessDeniedError,
      );
    });

    it(`listGrants: role="${role}" with a different userId is DENIED`, async () => {
      await expect(listGrants(actorAs(`attacker-${role}`, role), OWNER_ID)).rejects.toBeInstanceOf(
        AccessDeniedError,
      );
    });

    it(`createDecision: role="${role}" with a different userId cannot WRITE into another owner's log`, async () => {
      await expect(
        createDecision(actorAs(`attacker-${role}`, role), OWNER_ID, {
          stakes: 5,
          timePressure: 5,
          informationCompleteness: 1,
          clarity: 1,
          reversibility: "irreversible",
        }),
      ).rejects.toBeInstanceOf(AccessDeniedError);
    });

    it(`upsertRecoverySignal: role="${role}" with a different userId cannot WRITE another owner's recovery data`, async () => {
      await expect(
        upsertRecoverySignal(actorAs(`attacker-${role}`, role), OWNER_ID, {
          date: "2026-01-06",
          deepWorkBlocksPlanned: 0,
          deepWorkBlocksHonored: 0,
          quietHoursKept: false,
          meetingMinutes: 480,
        }),
      ).rejects.toBeInstanceOf(AccessDeniedError);
    });

    it(`createGrant: role="${role}" cannot issue a grant on another owner's behalf`, async () => {
      await expect(
        createGrant(actorAs(`attacker-${role}`, role), OWNER_ID, "scheduler-optimizer", 60_000),
      ).rejects.toBeInstanceOf(AccessDeniedError);
    });

    it(`revokeGrant: role="${role}" cannot revoke another owner's grant`, async () => {
      await expect(
        revokeGrant(actorAs(`attacker-${role}`, role), OWNER_ID, "nonexistent-grant-id"),
      ).rejects.toBeInstanceOf(AccessDeniedError);
    });
  }

  it("a would-be attacker cannot read OTHER_OWNER_ID's data by any role either (cross-owner isolation holds both directions)", async () => {
    await createDecision(actorAs(OTHER_OWNER_ID, "member"), OTHER_OWNER_ID, {
      stakes: 2,
      timePressure: 2,
      informationCompleteness: 4,
      clarity: 4,
      reversibility: "reversible",
    });
    for (const role of NON_OWNER_ROLES) {
      await expect(listDecisions(actorAs(OWNER_ID, role), OTHER_OWNER_ID)).rejects.toBeInstanceOf(
        AccessDeniedError,
      );
    }
  });
});

describe("grant issuance and expiry — derived signal flow only", () => {
  it("with no grant, the scheduler receives nothing (granted=false, signal=null)", async () => {
    const result = await getCapacitySignalForScheduler(OWNER_ID);
    expect(result.granted).toBe(false);
    expect(result.signal).toBeNull();
  });

  it("after an active grant, the scheduler receives a derived signal, never raw rows", async () => {
    const grant = await createGrant(actorAs(OWNER_ID, "member"), OWNER_ID, "scheduler-optimizer", 60_000);
    expect(grant.ownerUserId).toBe(OWNER_ID);

    const active = await hasActiveGrant("scheduler-optimizer-service", OWNER_ID);
    expect(active).toBe(true);

    const result = await getCapacitySignalForScheduler(OWNER_ID);
    expect(result.granted).toBe(true);
    expect(result.signal).not.toBeNull();
    expect(result.signal).not.toHaveProperty("decisions");
    expect(result.signal).not.toHaveProperty("notes");
    expect(typeof result.signal!.capacityScore).toBe("number");

    await revokeGrant(actorAs(OWNER_ID, "member"), OWNER_ID, grant.id);
  });

  it("a revoked grant immediately stops the data flow", async () => {
    const grant = await createGrant(actorAs(OWNER_ID, "member"), OWNER_ID, "scheduler-optimizer", 60_000);
    await revokeGrant(actorAs(OWNER_ID, "member"), OWNER_ID, grant.id);

    const active = await hasActiveGrant("scheduler-optimizer-service", OWNER_ID);
    expect(active).toBe(false);

    const result = await getCapacitySignalForScheduler(OWNER_ID);
    expect(result.granted).toBe(false);
    expect(result.signal).toBeNull();
  });

  it("an expired grant stops the data flow even though it was never revoked", async () => {
    // Directly insert an already-expired grant row to simulate time passing,
    // rather than waiting in real time.
    const id = randomUUID();
    const now = new Date();
    await db.insert(leaderStateGrants).values({
      id,
      ownerUserId: OWNER_ID,
      scope: "scheduler-optimizer",
      createdAt: new Date(now.getTime() - 2000),
      expiresAt: new Date(now.getTime() - 1000), // already expired
      revokedAt: null,
    });

    const active = await hasActiveGrant("scheduler-optimizer-service", OWNER_ID);
    expect(active).toBe(false);

    const result = await getCapacitySignalForScheduler(OWNER_ID);
    expect(result.granted).toBe(false);
    expect(result.signal).toBeNull();
  });

  it("createGrant clamps an absurd ttl to the 90-day maximum instead of issuing an unbounded grant", async () => {
    const tenYearsMs = 1000 * 60 * 60 * 24 * 365 * 10;
    const grant = await createGrant(actorAs(OWNER_ID, "member"), OWNER_ID, "scheduler-optimizer", tenYearsMs);
    const ttl = grant.expiresAt.getTime() - grant.createdAt.getTime();
    expect(ttl).toBeLessThanOrEqual(1000 * 60 * 60 * 24 * 90);
    await revokeGrant(actorAs(OWNER_ID, "member"), OWNER_ID, grant.id);
  });
});
