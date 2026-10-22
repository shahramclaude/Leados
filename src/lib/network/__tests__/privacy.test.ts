import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { people, personMetricGrants } from "@/db/schema";
import { bandValue, canViewPersonCentrality, maskCentrality } from "../privacy";

describe("pure privacy helpers", () => {
  it("bands numeric centrality into low/medium/high without exposing exact value when denied", () => {
    expect(bandValue(0.05, { low: 0.1, high: 0.4 })).toBe("low");
    expect(bandValue(0.2, { low: 0.1, high: 0.4 })).toBe("medium");
    expect(bandValue(0.9, { low: 0.1, high: 0.4 })).toBe("high");
  });

  it("masks the precise value for unauthorized viewers but keeps the band", () => {
    const denied = maskCentrality(0.42, false);
    expect(denied.value).toBeNull();
    expect(denied.band).toBe("high");

    const allowed = maskCentrality(0.42, true);
    expect(allowed.value).toBe(0.42);
  });
});

describe("canViewPersonCentrality — access matrix against real roster rows", () => {
  const createdIds: string[] = [];

  async function makePerson(name: string, managerId?: string) {
    const [row] = await db
      .insert(people)
      .values({ name, role: "Engineer", team: "Engineering", managerId })
      .returning();
    createdIds.push(row.id);
    return row;
  }

  afterAll(async () => {
    await db.delete(personMetricGrants);
    for (const id of createdIds) {
      await db.delete(people).where(eq(people.id, id));
    }
  });

  it("allows self access", async () => {
    const alice = await makePerson("Privacy Test Alice");
    const decision = await canViewPersonCentrality(alice.id, alice.id);
    expect(decision.allowed).toBe(true);
    expect(decision.scope).toBe("self");
  });

  it("allows a direct manager to view their report's centrality", async () => {
    const manager = await makePerson("Privacy Test Manager");
    const report = await makePerson("Privacy Test Report", manager.id);
    const decision = await canViewPersonCentrality(manager.id, report.id);
    expect(decision.allowed).toBe(true);
    expect(decision.scope).toBe("manager");
  });

  it("denies a peer with no grant and no management relationship", async () => {
    const personA = await makePerson("Privacy Test PersonA");
    const personB = await makePerson("Privacy Test PersonB");
    const decision = await canViewPersonCentrality(personA.id, personB.id);
    expect(decision.allowed).toBe(false);
  });

  it("allows hr_admin / exec only via an explicit grant row, never implicitly", async () => {
    const subject = await makePerson("Privacy Test Subject");
    const hrUser = await makePerson("Privacy Test HR");

    const deniedBefore = await canViewPersonCentrality(hrUser.id, subject.id);
    expect(deniedBefore.allowed).toBe(false);

    await db.insert(personMetricGrants).values({
      personId: subject.id,
      granteeUserId: hrUser.id,
      scope: "hr_admin",
    });

    const allowedAfter = await canViewPersonCentrality(hrUser.id, subject.id);
    expect(allowedAfter.allowed).toBe(true);
    expect(allowedAfter.scope).toBe("hr_admin");
  });

  it("denies a grant scoped below hr_admin/exec from unlocking individual centrality", async () => {
    // Defensive test: even if a grant row exists with an unexpected low scope,
    // only hr_admin/exec scopes should unlock access per the honesty rule.
    const subject = await makePerson("Privacy Test Subject Two");
    const otherUser = await makePerson("Privacy Test Other");
    await db.insert(personMetricGrants).values({
      personId: subject.id,
      granteeUserId: otherUser.id,
      scope: "self", // nonsensical grant, should still not elevate access
    });
    const decision = await canViewPersonCentrality(otherUser.id, subject.id);
    expect(decision.allowed).toBe(false);
  });

  it("rejects requests with no requester identity", async () => {
    const subject = await makePerson("Privacy Test Subject Three");
    const decision = await canViewPersonCentrality("", subject.id);
    expect(decision.allowed).toBe(false);
  });
});
