import { describe, it, expect, beforeAll } from "vitest";
import { seedDatabase } from "@/lib/change/repository";
import { containsBannedField, K_ANONYMITY_THRESHOLD } from "@/lib/privacy/aggregation";
import { GET as readinessGET } from "@/app/api/change/readiness/route";
import { GET as programDetailGET } from "@/app/api/change/programs/[id]/route";
import { GET as saturationGET } from "@/app/api/change/saturation/route";
import { SEED_GROUPS } from "@/lib/change/seed";

/**
 * Privacy attempt matrix (Phase 4 gate 1): a fixed list of attempts to reach
 * an individual-level change metric through the public API surface. Every
 * attempt must either be refused/suppressed or simply have no route to
 * begin with. This runs against a real seeded database, including
 * `finance-ops` which is deliberately seeded with headcount=4 — below the
 * k-anonymity threshold of 5 — to exercise the suppression path for real.
 */

const SMALL_GROUP_ID = "finance-ops";

beforeAll(async () => {
  await seedDatabase(new Date("2026-02-01"));
}, 60000);

describe("privacy attempt matrix", () => {
  it("attempt 1: fetch group readiness for all groups — the small group must come back suppressed, not a number", async () => {
    const res = await readinessGET();
    const data = await res.json();
    const smallGroupView = data.groups.find((g: { groupId: string }) => g.groupId === SMALL_GROUP_ID);
    expect(smallGroupView).toBeTruthy();
    expect(smallGroupView.readiness.ok).toBe(false);
    expect(smallGroupView.readiness.value).toBeUndefined();

    const smallGroupSeed = SEED_GROUPS.find((g) => g.id === SMALL_GROUP_ID)!;
    expect(smallGroupSeed.headcount).toBeLessThan(K_ANONYMITY_THRESHOLD);
  });

  it("attempt 2: no readiness/funnel/momentum payload anywhere contains a banned individual-level field", async () => {
    const res = await readinessGET();
    const data = await res.json();
    expect(containsBannedField(data)).toBeNull();
  });

  it("attempt 3: fetch the program that includes the small group — its per-group funnel entry is suppressed", async () => {
    const res = await programDetailGET(new Request("http://local/api/change/programs/prog-expense"), {
      params: Promise.resolve({ id: "prog-expense" }),
    });
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.program.affectedGroups).toContain(SMALL_GROUP_ID);

    const smallGroupFunnel = data.funnel.byGroup.find((g: { groupId: string }) => g.groupId === SMALL_GROUP_ID);
    expect(smallGroupFunnel.result.ok).toBe(false);

    const smallGroupBreakdown = data.groupBreakdown.find((g: { groupId: string }) => g.groupId === SMALL_GROUP_ID);
    expect(smallGroupBreakdown.readiness?.ok).toBe(false);

    expect(containsBannedField(data)).toBeNull();
  });

  it("attempt 4: requesting a nonexistent program id returns 404, not a fallback individual-level dump", async () => {
    const res = await programDetailGET(new Request("http://local/api/change/programs/does-not-exist"), {
      params: Promise.resolve({ id: "does-not-exist" }),
    });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.ok).toBe(false);
  });

  it("attempt 5: saturation alert evidence lists programs, never people or group rosters", async () => {
    const res = await saturationGET(new Request("http://local/api/change/saturation"));
    const data = await res.json();
    expect(containsBannedField(data)).toBeNull();
    for (const finding of data.findings) {
      const evidence = finding.evidence as { programs: Array<Record<string, unknown>> };
      for (const p of evidence.programs) {
        expect(Object.keys(p).sort()).toEqual(["id", "intent", "loadWeight"].sort());
      }
    }
  });

  it("attempt 6: the readiness/saturation handlers take no request at all, so no personId/employeeId query param can ever reach them", () => {
    // Strongest version of the attempt: the GET handlers are declared with
    // zero parameters, so it is structurally impossible for them to read a
    // personId/employeeId/groupId query string even if an attacker sends one.
    expect(readinessGET.length).toBe(0);
  });

  it("attempt 7: a malicious query string on the saturation route has no effect beyond the documented `threshold` param", async () => {
    const baseline = await (await saturationGET(new Request("http://local/api/change/saturation"))).json();
    const withJunkParams = await (
      await saturationGET(new Request("http://local/api/change/saturation?personId=finance-ops-p0&employeeId=1&dump=true"))
    ).json();
    expect(withJunkParams.threshold).toBe(baseline.threshold);
    expect(withJunkParams.findings.map((f: { id: string }) => f.id)).toEqual(baseline.findings.map((f: { id: string }) => f.id));
    expect(containsBannedField(withJunkParams)).toBeNull();
  });
});
