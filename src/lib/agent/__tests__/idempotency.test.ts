import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { claimIdempotencyKey } from "../idempotency";

describe("idempotency key claims", () => {
  it("allows exactly one claimant per (runId, nodeId), backed by a Postgres unique constraint", async () => {
    const runId = randomUUID();
    const nodeId = "n1";
    const first = await claimIdempotencyKey(runId, nodeId);
    const second = await claimIdempotencyKey(runId, nodeId);
    expect(first.claimed).toBe(true);
    expect(second.claimed).toBe(false);
    expect(first.key).toBe(second.key);
  });

  it("treats concurrent claims for the same key as a race with exactly one winner", async () => {
    const runId = randomUUID();
    const nodeId = "n-concurrent";
    const results = await Promise.all(Array.from({ length: 10 }, () => claimIdempotencyKey(runId, nodeId)));
    const winners = results.filter((r) => r.claimed);
    expect(winners).toHaveLength(1);
  });
});
