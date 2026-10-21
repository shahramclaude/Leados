// Seam: Part 05's causal language rules are applied to Part 08's generated
// text. A correlational finding's proposal must have its causal verbs
// rewritten; an experimental finding's proposal may keep them.
import { describe, expect, it } from "vitest";
import { createFinding } from "@/services/findings";
import { createProposal } from "@/services/llm-proposals";
import { createOrg, createMember } from "../helpers/fixtures";

describe("seam: causal-language rules applied to LLM-generated proposals", () => {
  it("rewrites causal verbs for a correlational finding", async () => {
    const org = await createOrg();
    const analyst = await createMember(org.id, "analyst");
    const session = { userId: analyst.id, orgId: org.id, role: "analyst" as const, userEmail: analyst.email };

    const finding = await createFinding(session, {
      domain: "finance",
      title: "Pricing change",
      summary: "Price change observed alongside a margin shift",
      causalConfidence: "correlational",
      explanation: { headline: "h", reasons: ["r"], evidence: [], confidence: 0.5, detail: {} },
    });

    const proposal = await createProposal(session, {
      findingId: finding.id,
      draftText: "This change causes a margin lift and guarantees future growth.",
    });

    expect(proposal.sanitizedDraft).not.toMatch(/\bcauses\b/i);
    expect(proposal.sanitizedDraft).not.toMatch(/\bguarantees\b/i);
    expect(proposal.causalRewrites).toBeGreaterThan(0);
  });

  it("leaves causal verbs intact for an experimentally-confirmed finding", async () => {
    const org = await createOrg();
    const analyst = await createMember(org.id, "analyst");
    const session = { userId: analyst.id, orgId: org.id, role: "analyst" as const, userEmail: analyst.email };

    const finding = await createFinding(session, {
      domain: "finance",
      title: "A/B tested pricing change",
      summary: "Controlled experiment on pricing",
      causalConfidence: "experimental",
      explanation: { headline: "h", reasons: ["r"], evidence: [], confidence: 0.9, detail: {} },
    });

    const proposal = await createProposal(session, {
      findingId: finding.id,
      draftText: "The randomised trial causes a confirmed margin lift.",
    });

    expect(proposal.sanitizedDraft).toMatch(/\bcauses\b/i);
    expect(proposal.causalRewrites).toBe(0);
  });
});
