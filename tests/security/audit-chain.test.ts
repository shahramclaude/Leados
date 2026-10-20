import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { recordAuditEvent, verifyAuditChain } from "@/lib/audit";
import { resetDb } from "../helpers";

describe("audit log hash chain tamper evidence", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("verifies cleanly for an untampered chain", async () => {
    for (let i = 0; i < 5; i++) {
      await recordAuditEvent({
        correlationId: `corr-${i}`,
        orgId: null,
        actorUserId: null,
        actorEmail: null,
        action: "security.rate_limited",
        resourceType: "test",
        metadata: { i },
      });
    }
    const result = await verifyAuditChain(null);
    expect(result.valid).toBe(true);
    expect(result.checked).toBe(5);
  });

  it("detects tampering with a historical event's content", async () => {
    for (let i = 0; i < 3; i++) {
      await recordAuditEvent({
        correlationId: `corr-${i}`,
        orgId: null,
        actorUserId: null,
        actorEmail: null,
        action: "security.rate_limited",
        resourceType: "test",
        metadata: { i },
      });
    }
    const rows = await db.select().from(auditLog);
    const target = rows[0];
    // Simulate an attacker/rogue-DBA rewriting history after the fact.
    await db.update(auditLog).set({ reason: "tampered" }).where(eq(auditLog.id, target.id));

    const result = await verifyAuditChain(null);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.brokenAtSeq).toBe(target.seq);
    }
  });

  it("detects a deleted/missing event by breaking the prevHash link", async () => {
    for (let i = 0; i < 4; i++) {
      await recordAuditEvent({
        correlationId: `corr-${i}`,
        orgId: null,
        actorUserId: null,
        actorEmail: null,
        action: "security.rate_limited",
        resourceType: "test",
        metadata: { i },
      });
    }
    const rows = await db.select().from(auditLog).orderBy(auditLog.seq);
    const victim = rows[1];
    await db.delete(auditLog).where(eq(auditLog.id, victim.id));

    const result = await verifyAuditChain(null);
    expect(result.valid).toBe(false);
  });

  it("keeps each organization's chain independent", async () => {
    const { createOrgAndAdmin } = await import("@/lib/authService");
    const { org: orgA } = await createOrgAndAdmin("Chain Org A", "chain-a@test.test", "Str0ng!Passw0rd-123");
    const { org: orgB } = await createOrgAndAdmin("Chain Org B", "chain-b@test.test", "Str0ng!Passw0rd-123");

    for (let i = 0; i < 3; i++) {
      await recordAuditEvent({
        correlationId: `a-${i}`,
        orgId: orgA.id,
        actorUserId: null,
        actorEmail: null,
        action: "security.rate_limited",
        resourceType: "test",
      });
    }
    for (let i = 0; i < 2; i++) {
      await recordAuditEvent({
        correlationId: `b-${i}`,
        orgId: orgB.id,
        actorUserId: null,
        actorEmail: null,
        action: "security.rate_limited",
        resourceType: "test",
      });
    }

    const resultA = await verifyAuditChain(orgA.id);
    const resultB = await verifyAuditChain(orgB.id);
    expect(resultA.valid).toBe(true);
    expect(resultA.checked).toBe(3);
    expect(resultB.valid).toBe(true);
    expect(resultB.checked).toBe(2);
  });
});
