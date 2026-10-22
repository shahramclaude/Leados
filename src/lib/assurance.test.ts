import { describe, expect, it } from "vitest";
import { summarizeAssurance } from "./assurance";

const NOW = new Date("2026-06-01T00:00:00Z");

describe("seam 2: assurance monitors every engine", () => {
  it("flags engines with no recorded check as unmonitored, not as passing", () => {
    const summary = summarizeAssurance(
      ["engine-a", "engine-b"],
      [{ engineKey: "engine-a", result: "pass", severity: "info", checkedAt: NOW }],
      { now: NOW },
    );
    expect(summary.unmonitored).toEqual(["engine-b"]);
    expect(summary.coveragePct).toBe(50);
  });

  it("an unmonitored engine escalates the worst-severity signal to critical", () => {
    const summary = summarizeAssurance(
      ["engine-a", "engine-b"],
      [{ engineKey: "engine-a", result: "pass", severity: "info", checkedAt: NOW }],
      { now: NOW },
    );
    expect(summary.worstSeverity).toBe("critical");
  });

  it("reports full coverage and real worst severity when every engine has a fresh check", () => {
    const summary = summarizeAssurance(
      ["engine-a"],
      [{ engineKey: "engine-a", result: "fail", severity: "critical", checkedAt: NOW }],
      { now: NOW },
    );
    expect(summary.coveragePct).toBe(100);
    expect(summary.worstSeverity).toBe("critical");
    expect(summary.failing).toBe(1);
  });

  it("a stale check (older than maxAgeMs) does not count as a live pass", () => {
    const oneYearAgo = new Date(NOW.getTime() - 365 * 24 * 60 * 60 * 1000);
    const summary = summarizeAssurance(
      ["engine-a"],
      [{ engineKey: "engine-a", result: "pass", severity: "info", checkedAt: oneYearAgo }],
      { now: NOW, maxAgeMs: 90 * 24 * 60 * 60 * 1000 },
    );
    expect(summary.passing).toBe(0);
    expect(summary.stale).toBe(1);
    expect(summary.worstSeverity).toBe("critical");
  });

  it("a fresh check within maxAgeMs still counts as a live pass", () => {
    const yesterday = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
    const summary = summarizeAssurance(
      ["engine-a"],
      [{ engineKey: "engine-a", result: "pass", severity: "info", checkedAt: yesterday }],
      { now: NOW, maxAgeMs: 90 * 24 * 60 * 60 * 1000 },
    );
    expect(summary.passing).toBe(1);
    expect(summary.stale).toBe(0);
  });
});
