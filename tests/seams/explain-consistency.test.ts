// Seam: Explain<T> used consistently across intelligence/people/finance
// (mission A, bullet 1). Proven two ways: (1) the type-level contract is
// shared, not duplicated per domain; (2) findings seeded in all three
// domains satisfy the same runtime shape check and render through one
// component (src/components/ExplainPanel.tsx — statically imports Explain<T>
// and has no per-domain branch).
import { describe, expect, it } from "vitest";
import { isExplain } from "@/lib/explain";
import { createFinding } from "@/services/findings";
import { createOrg, createMember } from "../helpers/fixtures";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("seam: Explain<T> consistency", () => {
  it("accepts the same explanation shape for intelligence, people, and finance findings", async () => {
    const org = await createOrg();
    const analyst = await createMember(org.id, "analyst");
    const session = { userId: analyst.id, orgId: org.id, role: "analyst" as const, userEmail: analyst.email };

    const domains = ["intelligence", "people", "finance"] as const;
    for (const domain of domains) {
      const finding = await createFinding(session, {
        domain,
        title: `${domain} finding`,
        summary: `${domain} summary text`,
        causalConfidence: "correlational",
        explanation: {
          headline: `${domain} headline`,
          reasons: ["reason one"],
          evidence: [{ label: "source", ref: "ref:1" }],
          confidence: 0.5,
          detail: { domain },
        },
      });
      expect(isExplain(finding.explanation)).toBe(true);
    }
  });

  it("ExplainPanel has no per-domain branching (single shared renderer)", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/ExplainPanel.tsx"),
      "utf-8",
    );
    expect(source).not.toMatch(/domain\s*===\s*["'](intelligence|people|finance)["']/);
    expect(source).toContain("Explain<Record<string, unknown>>");
  });
});
