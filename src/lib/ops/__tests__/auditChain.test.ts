import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { appendAudit, verifyChain } from "@/lib/ops/auditChain";
import { runWithContext } from "@/lib/obs/context";

const ctx = { correlationId: "test-corr", traceId: "test-trace", spanId: "test-span", route: "test" };

describe("hash-chained audit log", () => {
  beforeAll(async () => {
    await db.execute(sql`truncate table audit_log restart identity`);
  });
  afterAll(async () => {
    await pool.end();
  });

  it("verifies a clean, untampered chain", async () => {
    await runWithContext(ctx, async () => {
      await appendAudit("tester", "test.action.one", "resource:1", { n: 1 });
      await appendAudit("tester", "test.action.two", "resource:2", { n: 2 });
      await appendAudit("tester", "test.action.three", "resource:3", { n: 3 });
    });
    const result = await verifyChain();
    expect(result.ok).toBe(true);
    expect(result.rowsChecked).toBe(3);
  });

  it("detects a tampered row (payload mutated after the fact)", async () => {
    await db.execute(sql`update audit_log set payload = '{"n": 999}'::jsonb where seq = (select min(seq) from audit_log)`);
    const result = await verifyChain();
    expect(result.ok).toBe(false);
    expect(result.firstBrokenSeq).not.toBeNull();
  });
});
