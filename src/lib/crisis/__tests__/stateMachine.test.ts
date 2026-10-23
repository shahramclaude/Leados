import { describe, it, expect } from "vitest";
import {
  canTransition,
  validateTransition,
  evaluateAutoElevation,
} from "../stateMachine";

describe("crisis state machine shape", () => {
  it("allows the canonical forward path", () => {
    expect(canTransition("normal", "elevated")).toBe(true);
    expect(canTransition("elevated", "crisis")).toBe(true);
    expect(canTransition("crisis", "recovery")).toBe(true);
    expect(canTransition("recovery", "post_mortem")).toBe(true);
    expect(canTransition("post_mortem", "closed")).toBe(true);
  });

  it("allows emergency override straight from normal to crisis", () => {
    expect(canTransition("normal", "crisis")).toBe(true);
  });

  it("rejects illegal jumps", () => {
    expect(canTransition("normal", "post_mortem")).toBe(false);
    expect(canTransition("closed", "crisis")).toBe(false);
    expect(canTransition("post_mortem", "normal")).toBe(false);
  });

  it("allows relapse from recovery back to crisis", () => {
    expect(canTransition("recovery", "crisis")).toBe(true);
  });
});

describe("declaration authority", () => {
  it("permits commander to declare crisis from elevated", () => {
    const result = validateTransition({
      from: "elevated",
      to: "crisis",
      initiatorRoleKeys: ["commander"],
    });
    expect(result.ok).toBe(true);
  });

  it("blocks a role with no declaration authority", () => {
    const result = validateTransition({
      from: "elevated",
      to: "crisis",
      initiatorRoleKeys: ["scribe"],
    });
    expect(result.ok).toBe(false);
  });

  it("enforces dual declaration when the crisis class requires it", () => {
    const single = validateTransition({
      from: "elevated",
      to: "crisis",
      initiatorRoleKeys: ["commander"],
      requiresDualDeclaration: true,
      declarerCount: 1,
    });
    expect(single.ok).toBe(false);
    expect(single.reason).toMatch(/dual declaration/i);

    const dual = validateTransition({
      from: "elevated",
      to: "crisis",
      initiatorRoleKeys: ["commander", "board_liaison"],
      requiresDualDeclaration: true,
      declarerCount: 2,
    });
    expect(dual.ok).toBe(true);
  });

  it("reroutes authority away from a compromised commander (leadership scandal scenario)", () => {
    const commanderOnly = validateTransition({
      from: "elevated",
      to: "crisis",
      initiatorRoleKeys: ["commander"],
      commanderCompromised: true,
    });
    expect(commanderOnly.ok).toBe(false);
    expect(commanderOnly.reason).toMatch(/compromised/i);

    const deputyInstead = validateTransition({
      from: "elevated",
      to: "crisis",
      initiatorRoleKeys: ["commander", "deputy_commander"],
      commanderCompromised: true,
    });
    expect(deputyInstead.ok).toBe(true);
  });
});

describe("automatic elevation from signals", () => {
  it("does nothing with no signals", () => {
    const result = evaluateAutoElevation([]);
    expect(result.shouldElevate).toBe(false);
  });

  it("elevates on a single moderate signal", () => {
    const result = evaluateAutoElevation([{ source: "monitoring", severity: 3, independentSources: 1 }]);
    expect(result.shouldElevate).toBe(true);
    expect(result.shouldDeclareCrisis).toBe(false);
  });

  it("auto-declares crisis on a corroborated severity-5 signal", () => {
    const result = evaluateAutoElevation([{ source: "monitoring", severity: 5, independentSources: 2 }]);
    expect(result.shouldDeclareCrisis).toBe(true);
  });

  it("treats a signal storm (many correlated weak signals) as an elevation trigger", () => {
    const result = evaluateAutoElevation([
      { source: "a", severity: 2, independentSources: 1 },
      { source: "b", severity: 2, independentSources: 1 },
      { source: "c", severity: 2, independentSources: 1 },
      { source: "d", severity: 3, independentSources: 1 },
    ]);
    expect(result.shouldElevate).toBe(true);
  });

  it("does not auto-declare crisis from a storm unless a corroborated severity-5 is present", () => {
    const result = evaluateAutoElevation([
      { source: "a", severity: 2, independentSources: 1 },
      { source: "b", severity: 2, independentSources: 1 },
      { source: "c", severity: 2, independentSources: 1 },
      { source: "d", severity: 3, independentSources: 1 },
    ]);
    expect(result.shouldDeclareCrisis).toBe(false);
  });
});
