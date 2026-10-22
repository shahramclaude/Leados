// Seam: Explain<T> consistency everywhere (Part 22 Phase 0 item 1). Every
// generator of a derived value — the scoring engine, a human decision, an
// agent tool, an LLM draft — must produce the same shape.
import { describe, expect, it } from "vitest";
import { makeExplain, isExplain, defaultUncertaintyNote } from "@/lib/explain";
import { scoreLead } from "@/lib/scoring";

describe("Explain<T> seam", () => {
  it("makeExplain always fills uncertainty/basis/policyViolations defaults", () => {
    const e = makeExplain({ value: 42, confidence: 0.9, basis: [], generatedBy: "system" });
    expect(isExplain(e)).toBe(true);
    expect(e.basis.length).toBeGreaterThan(0);
    expect(e.uncertainty).toBeNull();
    expect(e.policyViolations).toEqual([]);
  });

  it("low confidence always carries a non-null uncertainty note", () => {
    const e = makeExplain({ value: "draft", confidence: 0.2, basis: ["x"], generatedBy: "llm" });
    expect(e.uncertainty).not.toBeNull();
    expect(defaultUncertaintyNote(0.2)).toMatch(/low confidence/i);
  });

  it("scoreLead (system generator) produces a conformant Explain<number>", () => {
    const e = scoreLead([{ type: "meeting_booked", confidence: 0.9, createdAt: new Date() }]);
    expect(isExplain<number>(e)).toBe(true);
    expect(typeof e.value).toBe("number");
    expect(e.generatedBy).toBe("system");
  });

  it("zero signals yields confidence 0, not a fabricated score", () => {
    const e = scoreLead([]);
    expect(e.value).toBe(0);
    expect(e.confidence).toBe(0);
  });

  it("every actor type (human/agent/llm/system) produces the same Explain<T> shape", () => {
    const actors = ["human", "agent", "llm", "system"] as const;
    for (const generatedBy of actors) {
      const e = makeExplain({ value: 1, confidence: 0.5, basis: ["b"], generatedBy });
      expect(isExplain(e)).toBe(true);
      expect(e.generatedBy).toBe(generatedBy);
    }
  });
});
