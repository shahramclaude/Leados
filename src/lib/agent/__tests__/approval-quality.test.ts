import { describe, expect, it } from "vitest";
import { attentionCheckPassed, MIN_REASON_QUALITY, scoreReasonQuality } from "../approval-quality";

describe("approval-reason quality scoring (anti rubber-stamp)", () => {
  it("scores boilerplate rubber-stamp reasons very low", () => {
    expect(scoreReasonQuality("ok", "reallocate budget across cost centers")).toBeLessThan(MIN_REASON_QUALITY);
    expect(scoreReasonQuality("LGTM", "reallocate budget across cost centers")).toBeLessThan(MIN_REASON_QUALITY);
    expect(scoreReasonQuality("approved", "reallocate budget across cost centers")).toBeLessThan(MIN_REASON_QUALITY);
  });

  it("scores specific, goal-grounded reasons at or above the minimum", () => {
    const score = scoreReasonQuality(
      "Reviewed the variance data backing this budget reallocation; the shift from marketing to support is justified by the Q3 overrun and nets to zero.",
      "Reallocate budget across cost centers"
    );
    expect(score).toBeGreaterThanOrEqual(MIN_REASON_QUALITY);
  });

  it("requires the attention-check nonce to appear verbatim in the reason", () => {
    expect(attentionCheckPassed("I reviewed the $0.0500 estimated cost and it is reasonable.", "0.0500")).toBe(true);
    expect(attentionCheckPassed("Looks fine to me, approving.", "0.0500")).toBe(false);
  });

  it("does not require a nonce when no attention check was assigned", () => {
    expect(attentionCheckPassed("Looks fine to me, approving.", null)).toBe(true);
  });
});
