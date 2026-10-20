import { describe, expect, it } from "vitest";
import { DEMO_EVIDENCE, LEADOS_PEOPLE_SCM, generateDemoDataset } from "../domainModel";
import { buildMetricsBoard, describeMetricRelationship } from "../metricsIntelligence";
import { assertLanguageMatchesIdentifiability, scanForBannedLanguage } from "../language";

describe("metricsIntelligence language audit", () => {
  const data = generateDemoDataset(600, 55);

  it("the flagship (confounded) relationship never uses causal verbs in rendered copy", () => {
    const rel = describeMetricRelationship(
      LEADOS_PEOPLE_SCM,
      data,
      "1:1 frequency",
      "oneOnOneFrequency",
      "retention",
      "retentionStays",
      DEMO_EVIDENCE
    );
    expect(rel.estimate.identifiable).toBe(false);
    expect(() => assertLanguageMatchesIdentifiability(rel.headline, rel.estimate)).not.toThrow();
    expect(rel.headline.toLowerCase()).toContain("associated with");
  });

  it("scans the entire metrics board for banned causal language on non-identifiable rows", () => {
    const board = buildMetricsBoard(
      LEADOS_PEOPLE_SCM,
      data,
      "retentionStays",
      "retention",
      [
        { id: "oneOnOneFrequency", label: "1:1 frequency" },
        { id: "engagementScore", label: "Engagement score" },
        { id: "roleClarity", label: "Role clarity" },
        { id: "compensationCompetitiveness", label: "Compensation competitiveness" },
      ],
      DEMO_EVIDENCE
    );

    for (const row of board) {
      if (!row.estimate.identifiable) {
        const violations = scanForBannedLanguage(row.headline);
        expect(violations, `row ${row.metric} headline: "${row.headline}"`).toHaveLength(0);
      }
    }

    // Sanity: at least one row in this board IS identifiable and is allowed
    // to use causal language, proving the test isn't vacuous.
    expect(board.some((r) => r.estimate.identifiable)).toBe(true);
  });
});
