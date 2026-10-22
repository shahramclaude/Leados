import { describe, expect, it } from "vitest";
import { rankVocThemes, suggestStrategyLink } from "./voc";

describe("seam 5: VoC links to strategy", () => {
  it("ranks themes by negativity-weighted volume, not raw volume alone", () => {
    const ranked = rankVocThemes([
      { theme: "onboarding", sentiment: "negative" },
      { theme: "onboarding", sentiment: "negative" },
      { theme: "pricing", sentiment: "positive" },
      { theme: "pricing", sentiment: "positive" },
      { theme: "pricing", sentiment: "positive" },
    ]);
    expect(ranked[0].theme).toBe("onboarding");
  });

  it("suggests an existing strategy item when the title mentions the theme", () => {
    const { matched } = suggestStrategyLink("onboarding", [
      "Fix onboarding drop-off",
      "Expand APAC pricing",
    ]);
    expect(matched).toBe("Fix onboarding drop-off");
  });

  it("returns no match (rather than a false positive) when nothing fits", () => {
    const { matched } = suggestStrategyLink("checkout latency", ["Expand APAC pricing"]);
    expect(matched).toBeNull();
  });
});
