import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leaderStateResearchContributions } from "@/db/schema";
import { AccessDeniedError, contributeResearchMetric, readResearchAggregate } from "@/lib/leaderState/research";
import { K_ANONYMITY_THRESHOLD } from "@/lib/privacy";
import type { ActorContext } from "@/lib/privacy";

const COHORT_KEY = `test-cohort-${randomUUID()}`;
const METRIC_TYPE = "avg-combined-load-score";
const contributorIds: string[] = [];

afterAll(async () => {
  await db.delete(leaderStateResearchContributions).where(eq(leaderStateResearchContributions.cohortKey, COHORT_KEY));
});

function selfActor(userId: string): ActorContext {
  return { userId, role: "member" };
}

describe("opt-in research contribution — self-scope on write", () => {
  it("a non-owner cannot contribute on someone else's behalf", async () => {
    await expect(
      contributeResearchMetric({ userId: "attacker", role: "admin" }, "victim-owner", {
        cohortKey: COHORT_KEY,
        metricType: METRIC_TYPE,
        metricValue: 5,
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });
});

describe("k-anonymity gate on aggregate reads", () => {
  it(`suppresses the aggregate while fewer than k=${K_ANONYMITY_THRESHOLD} people have contributed`, async () => {
    expect(K_ANONYMITY_THRESHOLD).toBeGreaterThan(1);

    for (let i = 0; i < K_ANONYMITY_THRESHOLD - 1; i++) {
      const ownerId = `contributor-${randomUUID()}`;
      contributorIds.push(ownerId);
      await contributeResearchMetric(selfActor(ownerId), ownerId, {
        cohortKey: COHORT_KEY,
        metricType: METRIC_TYPE,
        metricValue: 4 + i,
      });
    }

    const result = await readResearchAggregate(COHORT_KEY, METRIC_TYPE);
    expect(result.suppressed).toBe(true);
    expect(result.average).toBeUndefined();
    expect(result.cohortSize).toBe(K_ANONYMITY_THRESHOLD - 1);
  });

  it(`reveals an aggregate once the k=${K_ANONYMITY_THRESHOLD}th distinct contributor joins`, async () => {
    const ownerId = `contributor-${randomUUID()}`;
    contributorIds.push(ownerId);
    await contributeResearchMetric(selfActor(ownerId), ownerId, {
      cohortKey: COHORT_KEY,
      metricType: METRIC_TYPE,
      metricValue: 10,
    });

    const result = await readResearchAggregate(COHORT_KEY, METRIC_TYPE);
    expect(result.suppressed).toBe(false);
    expect(result.cohortSize).toBe(K_ANONYMITY_THRESHOLD);
    expect(typeof result.average).toBe("number");
  });

  it("never returns individual contribution values, only the aggregate average", async () => {
    const result = await readResearchAggregate(COHORT_KEY, METRIC_TYPE);
    expect(result).not.toHaveProperty("rows");
    expect(result).not.toHaveProperty("contributions");
    expect(result).not.toHaveProperty("ownerUserId");
  });
});
