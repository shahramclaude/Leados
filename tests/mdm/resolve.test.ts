import { describe, it, expect } from "vitest";
import { scoreMatch } from "@/lib/platform/mdm/matchRules";
import { classifyMatch, resolveAgainstEntities, CANDIDATE_THRESHOLD, AUTO_MERGE_THRESHOLD } from "@/lib/platform/mdm/resolve";
import type { NormalizedLead } from "@/lib/platform/types";

function lead(overrides: Partial<NormalizedLead>): NormalizedLead {
  return {
    externalId: null,
    entityType: "person",
    fullName: null,
    email: null,
    phone: null,
    company: null,
    title: null,
    country: null,
    sourceUpdatedAt: null,
    ...overrides,
  };
}

describe("Entity resolution — thresholds", () => {
  it("classifies an exact-email duplicate as auto_duplicate", () => {
    const a = lead({ fullName: "Jamie Rivera", email: "jamie.rivera@acme.com" });
    const b = lead({ fullName: "Jamie Rivera", email: "JAMIE.RIVERA@acme.com" });
    const score = scoreMatch(a, b);
    expect(score.emailExact).toBe(true);
    expect(score.score).toBeGreaterThanOrEqual(AUTO_MERGE_THRESHOLD);
    expect(classifyMatch(score)).toBe("auto_duplicate");
  });

  it("NEVER auto-merges an ambiguous same-name/company/phone-but-different-email case", () => {
    // Two plausible but distinct people: shared office phone line + similar name + same employer, different emails.
    const a = lead({ fullName: "Chris Taylor", company: "Northwind Traders", phone: "+1 312-555-0100", email: "chris.taylor@northwind.com" });
    const b = lead({ fullName: "Cris Taylor", company: "Northwind Traders", phone: "+1 312-555-0100", email: "c.taylor2@northwind.com" });
    const score = scoreMatch(a, b);
    const decision = classifyMatch(score);
    expect(decision).not.toBe("auto_duplicate");
    expect(score.score).toBeLessThan(AUTO_MERGE_THRESHOLD);
  });

  it("does not even queue unrelated records with low similarity", () => {
    const a = lead({ fullName: "Avery Stone", email: "avery.stone@foo.com" });
    const b = lead({ fullName: "Unrelated Person", email: "nobody@bar.com" });
    const score = scoreMatch(a, b);
    expect(score.score).toBeLessThan(CANDIDATE_THRESHOLD);
    expect(classifyMatch(score)).toBe("none");
  });

  it("recall/precision table on a planted-duplicate dataset", () => {
    // 10 distinct people, 4 of which have an exact-duplicate re-submission (email casing/whitespace differs).
    const base: NormalizedLead[] = [
      lead({ fullName: "Ana Silva", email: "ana.silva@corp.com", company: "Corp" }),
      lead({ fullName: "Ben Wu", email: "ben.wu@corp.com", company: "Corp" }),
      lead({ fullName: "Carla Diaz", email: "carla.diaz@corp.com", company: "Corp" }),
      lead({ fullName: "Dmitri Orlov", email: "dmitri.orlov@corp.com", company: "Corp" }),
      lead({ fullName: "Elif Yilmaz", email: "elif.yilmaz@corp.com", company: "Corp" }),
      lead({ fullName: "Faisal Noor", email: "faisal.noor@corp.com", company: "Corp" }),
    ];
    const plantedDuplicates: NormalizedLead[] = [
      lead({ fullName: "ANA SILVA", email: "Ana.Silva@corp.com", company: "Corp" }),
      lead({ fullName: "Ben  Wu", email: "ben.wu@corp.com", company: "Corp" }),
      lead({ fullName: "Carla Diaz", email: "carla.diaz@corp.com ".trim(), company: "Corp" }),
      lead({ fullName: "Dmitri Orlov", email: "dmitri.orlov@corp.com", company: "Corp" }),
    ];
    const distractors: NormalizedLead[] = [
      lead({ fullName: "Grace Kim", email: "grace.kim@other.com", company: "Other" }),
      lead({ fullName: "Hassan Ali", email: "hassan.ali@other.com", company: "Other" }),
    ];

    const candidates = base.map((record, i) => ({ id: `entity-${i}`, record }));

    let truePositives = 0;
    let falsePositives = 0;
    for (const dup of plantedDuplicates) {
      const results = resolveAgainstEntities(dup, candidates);
      if (results.length > 0 && results[0].decision !== "none") truePositives += 1;
    }
    for (const distractor of distractors) {
      const results = resolveAgainstEntities(distractor, candidates);
      if (results.length > 0 && results[0].decision !== "none") falsePositives += 1;
    }

    const recall = truePositives / plantedDuplicates.length;
    const precision = truePositives / (truePositives + falsePositives || 1);

    // Recorded in VERIFICATION LOG — recall/precision table.
    // eslint-disable-next-line no-console
    console.log(`[MDM recall/precision] recall=${recall} precision=${precision} truePositives=${truePositives} falsePositives=${falsePositives}`);

    expect(recall).toBeGreaterThanOrEqual(0.75); // declared precision/recall floor for this reference ruleset
    expect(falsePositives).toBe(0);
  });
});
