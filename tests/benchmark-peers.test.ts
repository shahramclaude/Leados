import { describe, expect, it } from "vitest";
import { constructPeerGroup, computePercentile, MIN_SAMPLE_FOR_PERCENTILE, type OrgFeatureVector } from "@/lib/benchmark/peers";

const orgs: OrgFeatureVector[] = [
  { orgId: 1, name: "Target", isSelf: true, features: { x: 10 } },
  { orgId: 2, name: "Closest", isSelf: false, features: { x: 11 } },
  { orgId: 3, name: "SecondClosest", isSelf: false, features: { x: 13 } },
  { orgId: 4, name: "Far", isSelf: false, features: { x: 50 } },
  { orgId: 5, name: "Farther", isSelf: false, features: { x: 90 } },
];

describe("constructPeerGroup: honesty properties", () => {
  it("never includes the target org itself", () => {
    const result = constructPeerGroup(orgs, 1, { k: 3 });
    expect(result.peerOrgIds).not.toContain(1);
  });

  it("is deterministic across repeated calls", () => {
    const r1 = constructPeerGroup(orgs, 1, { k: 3 });
    const r2 = constructPeerGroup(orgs, 1, { k: 3 });
    expect(r1.peerOrgIds).toEqual(r2.peerOrgIds);
  });

  it("is invariant to the input ordering of candidate orgs (not manually curated)", () => {
    const shuffled = [orgs[4], orgs[1], orgs[0], orgs[3], orgs[2]];
    const r1 = constructPeerGroup(orgs, 1, { k: 2 });
    const r2 = constructPeerGroup(shuffled, 1, { k: 2 });
    expect(new Set(r1.peerOrgIds)).toEqual(new Set(r2.peerOrgIds));
  });

  it("selects the k nearest by declared feature distance, verifiable by hand", () => {
    // Target x=10. Distances: Closest(11)=1, SecondClosest(13)=3, Far(50)=40, Farther(90)=80.
    const result = constructPeerGroup(orgs, 1, { k: 2 });
    expect(result.peerOrgIds).toEqual([2, 3]);
  });

  it("exposes the exact method, weights, and rationale (peer definition is never hidden)", () => {
    const result = constructPeerGroup(orgs, 1, { k: 2 });
    expect(result.method).toBe("k_nearest_zscore");
    expect(result.featureWeights).toEqual({ x: 1 });
    expect(result.rationale).toContain("k-nearest-neighbor");
  });

  it("changing feature weights changes (and visibly documents) the peer definition", () => {
    const multiFeatureOrgs: OrgFeatureVector[] = [
      { orgId: 1, name: "Target", isSelf: true, features: { x: 10, y: 0 } },
      { orgId: 2, name: "A", isSelf: false, features: { x: 11, y: 100 } },
      { orgId: 3, name: "B", isSelf: false, features: { x: 40, y: 1 } },
    ];
    const weightOnX = constructPeerGroup(multiFeatureOrgs, 1, { k: 1, featureWeights: { x: 10, y: 0.01 } });
    const weightOnY = constructPeerGroup(multiFeatureOrgs, 1, { k: 1, featureWeights: { x: 0.01, y: 10 } });
    expect(weightOnX.peerOrgIds).toEqual([2]); // closer on x
    expect(weightOnY.peerOrgIds).toEqual([3]); // closer on y once y dominates
  });
});

describe("computePercentile: sample-size honesty", () => {
  it("matches hand-computed percentile for a known distribution", () => {
    const distribution = [10, 20, 30, 40, 50, 60];
    // value 35 falls strictly between 30 and 40 => 3 below out of 6 => 50th percentile
    const result = computePercentile(35, distribution);
    expect(result.percentile).toBe(50);
    expect(result.lowSample).toBe(false);
  });

  it("withholds percentile below the minimum sample size (never fabricates a number)", () => {
    const distribution = [10, 20, 30];
    expect(distribution.length).toBeLessThan(MIN_SAMPLE_FOR_PERCENTILE);
    const result = computePercentile(25, distribution);
    expect(result.percentile).toBeNull();
    expect(result.lowSample).toBe(true);
    expect(result.methodBadge).toMatch(/Insufficient sample/);
  });

  it("reports sample size alongside the percentile for every call", () => {
    const distribution = [1, 2, 3, 4, 5, 6, 7, 8];
    const result = computePercentile(4, distribution);
    expect(result.sampleSize).toBe(8);
  });
});
