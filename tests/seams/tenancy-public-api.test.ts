// Seam: Part 13's tenancy is enforced in Part 14's public API. An API key
// scoped to org A must never be able to read org B's findings, and the org
// is resolved only from the key — never from a client-supplied parameter.
import { describe, expect, it } from "vitest";
import { createFinding } from "@/services/findings";
import { listPublicFindings } from "@/services/public-findings";
import { resolveApiKeyContext } from "@/lib/tenancy";
import { createOrg, createMember, createApiKey } from "../helpers/fixtures";

describe("seam: tenancy enforced in the public API", () => {
  it("an org's API key only ever sees that org's findings", async () => {
    const orgA = await createOrg();
    const orgB = await createOrg();
    const analystA = await createMember(orgA.id, "analyst");
    const analystB = await createMember(orgB.id, "analyst");

    await createFinding(
      { userId: analystA.id, orgId: orgA.id, role: "analyst", userEmail: analystA.email },
      {
        domain: "intelligence",
        title: "Org A secret finding",
        summary: "Should never leak to org B",
        causalConfidence: "correlational",
        explanation: { headline: "h", reasons: [], evidence: [], confidence: 0.3, detail: {} },
      },
    );
    await createFinding(
      { userId: analystB.id, orgId: orgB.id, role: "analyst", userEmail: analystB.email },
      {
        domain: "intelligence",
        title: "Org B finding",
        summary: "Belongs to org B only",
        causalConfidence: "correlational",
        explanation: { headline: "h", reasons: [], evidence: [], confidence: 0.3, detail: {} },
      },
    );

    const rawKeyA = await createApiKey(orgA.id, ["finding:read"]);
    const ctxA = await resolveApiKeyContext(`Bearer ${rawKeyA}`);
    expect(ctxA.orgId).toBe(orgA.id);

    const resultsForA = await listPublicFindings(ctxA);
    expect(resultsForA.some((f) => f.title === "Org A secret finding")).toBe(true);
    expect(resultsForA.some((f) => f.title === "Org B finding")).toBe(false);
  });

  it("rejects an invalid or revoked bearer token", async () => {
    await expect(resolveApiKeyContext("Bearer not-a-real-key")).rejects.toThrow();
    await expect(resolveApiKeyContext(null)).rejects.toThrow();
  });
});
