import { describe, expect, it } from "vitest";
import { evaluateSla, slaHoursForTicket } from "@/lib/calc/itsm";

describe("slaHoursForTicket", () => {
  it("uses the priority-based default when no override is set", () => {
    expect(slaHoursForTicket(1, null)).toBe(4);
    expect(slaHoursForTicket(4, undefined)).toBe(72);
  });

  it("uses the override when provided", () => {
    expect(slaHoursForTicket(1, 2)).toBe(2);
  });
});

describe("evaluateSla", () => {
  it("is not breached when resolved within the SLA window", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const resolvedAt = new Date("2026-01-01T03:00:00Z");
    const now = new Date("2026-01-01T05:00:00Z");
    const result = evaluateSla(createdAt, 4, 0, now, resolvedAt);
    expect(result.breached).toBe(false);
  });

  it("is breached when resolved after the SLA window", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const resolvedAt = new Date("2026-01-01T06:00:00Z");
    const now = new Date("2026-01-01T07:00:00Z");
    const result = evaluateSla(createdAt, 4, 0, now, resolvedAt);
    expect(result.breached).toBe(true);
  });

  it("pauses the clock while waiting on the requester", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const now = new Date("2026-01-01T05:00:00Z");
    // 5 hours elapsed, 2 hours paused -> 3 effective hours against a 4-hour SLA: not breached.
    const result = evaluateSla(createdAt, 4, 2, now, null);
    expect(result.breached).toBe(false);
  });
});
