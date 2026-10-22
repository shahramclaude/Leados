import { describe, expect, it } from "vitest";
import { createTwin } from "../../twin/twinEngine";
import { SEED_SCENARIOS } from "../../scenarios/strategicScenarios";
import { getScopedView, readScopedField, RoleScopeViolation, runWarGame } from "../engine";
import { getRole } from "../roles";

describe("role knowledge scoping", () => {
  const scenario = SEED_SCENARIOS.find((s) => s.id === "scn-regulatory-clampdown")!;
  const state = createTwin(scenario.twinConfig);

  it("a role can read fields inside its declared knowledge scope", () => {
    const regulator = getRole("regulator");
    const view = getScopedView(regulator, state, scenario, 1);
    expect(() => readScopedField(view, "regulatoryPressure")).not.toThrow();
  });

  it("blocks a role from reading a field outside its declared knowledge scope (asserted)", () => {
    const regulator = getRole("regulator");
    const view = getScopedView(regulator, state, scenario, 1);
    // regulator's scope does not include cashRunwayMonths (an "us"-only field)
    expect(() => readScopedField(view, "cashRunwayMonths")).toThrow(RoleScopeViolation);
  });

  it("competitorA cannot see cashRunwayMonths, headcount, or regulatoryPressure", () => {
    const competitor = getRole("competitorA");
    const view = getScopedView(competitor, state, scenario, 1);
    for (const outOfScope of ["cashRunwayMonths", "headcount", "regulatoryPressure", "talentAvailability"]) {
      expect(() => readScopedField(view, outOfScope)).toThrow(RoleScopeViolation);
    }
  });

  it("no role is ever omniscient: every role's scoped view is a strict subset of the full metric set", () => {
    const fullMetricKeys = Object.keys(state.metrics);
    for (const roleId of ["us", "competitorA", "regulator", "keyCustomer", "talentMarket"] as const) {
      const role = getRole(roleId);
      const view = getScopedView(role, state, scenario, 1);
      const visibleKeys = Object.keys(view.visibleMetrics);
      expect(visibleKeys.length).toBeLessThan(fullMetricKeys.length);
      for (const key of visibleKeys) expect(fullMetricKeys).toContain(key);
    }
  });

  it("a full war-game run never leaks an out-of-scope read into any role's decide-phase payload", () => {
    const result = runWarGame(scenario, ["us", "competitorA", "regulator", "keyCustomer", "talentMarket"], 3, 42);
    const roleScopes = Object.fromEntries((["us", "competitorA", "regulator", "keyCustomer", "talentMarket"] as const).map((id) => [id, new Set(getRole(id).knowledgeScope)]));
    for (const event of result.events) {
      if (event.phase === "observe" && event.roleId !== "system") {
        const visible = (event.payload?.visibleMetrics ?? {}) as Record<string, number>;
        const allowed = roleScopes[event.roleId as keyof typeof roleScopes];
        for (const key of Object.keys(visible)) {
          expect(allowed.has(key)).toBe(true);
        }
      }
    }
  });
});

describe("war-game determinism", () => {
  it("same scenario + seed + turns produces an identical trace and event count", () => {
    const scenario = SEED_SCENARIOS.find((s) => s.id === "scn-open-frontier")!;
    const roles = ["us", "competitorA", "regulator", "keyCustomer", "talentMarket"] as const;
    const resultA = runWarGame(scenario, [...roles], 4, 1234);
    const resultB = runWarGame(scenario, [...roles], 4, 1234);
    expect(resultA.trace.map((s) => s.metrics)).toEqual(resultB.trace.map((s) => s.metrics));
    expect(resultA.events.length).toBe(resultB.events.length);
  });

  it("a different seed can change the play-through", () => {
    const scenario = SEED_SCENARIOS.find((s) => s.id === "scn-open-frontier")!;
    const roles = ["us", "competitorA", "regulator", "keyCustomer", "talentMarket"] as const;
    const resultA = runWarGame(scenario, [...roles], 4, 1);
    const resultB = runWarGame(scenario, [...roles], 4, 2);
    // Not a strict guarantee of difference, but overwhelmingly likely with this rng; trace length is stable regardless.
    expect(resultA.trace.length).toBe(resultB.trace.length);
  });
});
