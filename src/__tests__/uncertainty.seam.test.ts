// Seam: Part 04's uncertainty must be visible on Part 07/08 surfaces (here:
// the internal leads list and the public leads API, the two read surfaces
// that show a score to a human).
import { describe, expect, it } from "vitest";
import { confidenceBand } from "@/lib/uncertainty";
import { createTestLead, createTestOrg, internalRequest, createTestApiKey, publicRequest } from "./helpers";
import { GET as listLeadsInternal } from "@/app/api/leads/route";
import { GET as listLeadsPublic } from "@/app/api/public/v1/leads/route";

describe("uncertainty surfacing seam", () => {
  it("bands map confidence into low/medium/high consistently", () => {
    expect(confidenceBand(0.1)).toBe("low");
    expect(confidenceBand(0.5)).toBe("medium");
    expect(confidenceBand(0.9)).toBe("high");
  });

  it("a lead with no signals surfaces confidence 0 on the internal leads list", async () => {
    const org = await createTestOrg();
    await createTestLead(org.id);
    const res = await listLeadsInternal(internalRequest("http://test/api/leads", org.id));
    const body = await res.json();
    expect(body.leads[0].scoreExplain.confidence).toBe(0);
    expect(confidenceBand(body.leads[0].scoreExplain.confidence)).toBe("low");
  });

  it("the public API surfaces the same Explain<T> confidence shape as the internal list", async () => {
    const org = await createTestOrg();
    await createTestLead(org.id);
    const apiKey = await createTestApiKey(org.id);
    const res = await listLeadsPublic(publicRequest("http://test/api/public/v1/leads", apiKey));
    const body = await res.json();
    expect(body.leads[0].score).toHaveProperty("confidence");
    expect(body.leads[0].score).toHaveProperty("uncertainty");
    expect(body.leads[0].score).toHaveProperty("basis");
  });
});
