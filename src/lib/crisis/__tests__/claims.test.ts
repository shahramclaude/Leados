import { describe, it, expect } from "vitest";
import { evaluateClaim, assertSafeToStateAsFact } from "../claims";

describe("double-source rumor control rule", () => {
  it("quarantines a seeded single-source rumor as unconfirmed", () => {
    const result = evaluateClaim([{ name: "anonymous twitter post", type: "rumor", reportedAt: new Date().toISOString() }]);
    expect(result.status).toBe("unconfirmed");
    expect(result.independentSourceCount).toBe(1);
  });

  it("does not confirm from two citations of the same single source", () => {
    const result = evaluateClaim([
      { name: "Jane Doe", type: "internal", reportedAt: new Date().toISOString() },
      { name: "jane doe", type: "internal", reportedAt: new Date().toISOString() },
    ]);
    expect(result.status).toBe("unconfirmed");
    expect(result.independentSourceCount).toBe(1);
  });

  it("confirms when two independent, at-least-one-reliable sources corroborate", () => {
    const result = evaluateClaim([
      { name: "Ops on-call engineer", type: "internal", reportedAt: new Date().toISOString() },
      { name: "Cloud provider status page", type: "official", reportedAt: new Date().toISOString() },
    ]);
    expect(result.status).toBe("confirmed");
    expect(result.independentSourceCount).toBe(2);
  });

  it("still quarantines two sources if both are unreliable solo types", () => {
    const result = evaluateClaim([
      { name: "random forum post A", type: "social", reportedAt: new Date().toISOString() },
      { name: "random forum post B", type: "rumor", reportedAt: new Date().toISOString() },
    ]);
    expect(result.status).toBe("unconfirmed");
  });

  it("blocks stating an unconfirmed claim as fact in outbound comms", () => {
    const check = assertSafeToStateAsFact([{ name: "someone on social media", type: "social", reportedAt: new Date().toISOString() }]);
    expect(check.ok).toBe(false);
  });

  it("allows stating a confirmed, double-sourced claim as fact", () => {
    const check = assertSafeToStateAsFact([
      { name: "Incident commander", type: "internal", reportedAt: new Date().toISOString() },
      { name: "Vendor postmortem", type: "official", reportedAt: new Date().toISOString() },
    ]);
    expect(check.ok).toBe(true);
  });
});
