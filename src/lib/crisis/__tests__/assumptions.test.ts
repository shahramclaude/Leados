import { describe, it, expect } from "vitest";
import { evaluateAssumptionTick, evaluateAssumptionTicks } from "../assumptions";

describe("assumption-register auto-reverification", () => {
  const now = new Date("2026-01-01T12:00:00Z");

  it("leaves a not-yet-due pending assumption untouched", () => {
    const result = evaluateAssumptionTick(
      { id: "a1", status: "pending", reverifyAt: new Date("2026-01-01T14:00:00Z") },
      now,
    );
    expect(result.newStatus).toBe("pending");
    expect(result.shouldEscalate).toBe(false);
  });

  it("marks an overdue pending assumption as overdue and flags escalation", () => {
    const result = evaluateAssumptionTick(
      { id: "a2", status: "pending", reverifyAt: new Date("2026-01-01T10:00:00Z") },
      now,
    );
    expect(result.newStatus).toBe("overdue");
    expect(result.shouldEscalate).toBe(true);
  });

  it("does not re-escalate an assumption that was already reverified", () => {
    const result = evaluateAssumptionTick(
      { id: "a3", status: "reverified_true", reverifyAt: new Date("2026-01-01T01:00:00Z") },
      now,
    );
    expect(result.shouldEscalate).toBe(false);
    expect(result.newStatus).toBe("reverified_true");
  });

  it("batch-evaluates a mixed set correctly", () => {
    const results = evaluateAssumptionTicks(
      [
        { id: "x", status: "pending", reverifyAt: new Date("2026-01-01T09:00:00Z") },
        { id: "y", status: "pending", reverifyAt: new Date("2026-01-01T15:00:00Z") },
      ],
      now,
    );
    expect(results.find((r) => r.id === "x")?.shouldEscalate).toBe(true);
    expect(results.find((r) => r.id === "y")?.shouldEscalate).toBe(false);
  });
});
