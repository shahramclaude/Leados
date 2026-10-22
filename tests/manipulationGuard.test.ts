import { describe, expect, it } from "vitest";
import { runGuard, wouldRenderWithoutGuard, type AdaptationAction, type GuardContext } from "@/lib/adaptation/manipulationGuard";

describe("manipulationGuard: each banned pattern has a working detector", () => {
  it("blocks urgency inflation when no real deadline exists", () => {
    const action: AdaptationAction = {
      id: "seeded-urgency",
      surface: "dashboard.finance",
      class: "emphasis",
      description: "Upgrade now",
      rationale: "testing",
      counterfactual: "testing",
      renderedText: "Act now — your account needs attention immediately!",
    };
    const context: GuardContext = { deadlineExists: false };

    // Show both: without the guard, this seeded dark-pattern attempt would render as-is.
    expect(wouldRenderWithoutGuard(action)).toBe(true);

    // With the guard, it is blocked.
    const verdict = runGuard(action, context);
    expect(verdict.blocked).toBe(true);
    expect(verdict.pattern).toBe("urgency_inflation");
  });

  it("does not block urgency language when a real deadline exists", () => {
    const action: AdaptationAction = {
      id: "legit-urgency",
      surface: "dashboard.risk",
      class: "emphasis",
      description: "Policy lapse notice",
      rationale: "Cyber policy genuinely lapses in 18 days per risk-4",
      counterfactual: "Default would show the fact without added emphasis",
      renderedText: "Act now: renew before the policy lapses in 18 days.",
    };
    const verdict = runGuard(action, { deadlineExists: true });
    expect(verdict.blocked).toBe(false);
  });

  it("blocks hiding bad news: demoting a critical fact below the neutral default rank", () => {
    const defaultOrder = ["risk-1", "risk-2", "risk-3", "risk-4"];
    const proposedOrder = ["risk-3", "risk-4", "risk-1", "risk-2"]; // demotes two criticals
    const action: AdaptationAction = {
      id: "seeded-hide-bad-news",
      surface: "dashboard.risk",
      class: "sequence",
      description: "Reorder by engagement",
      rationale: "testing",
      counterfactual: "testing",
    };
    const context: GuardContext = {
      defaultOrder,
      proposedOrder,
      severityById: { "risk-1": "critical", "risk-2": "critical", "risk-3": "medium", "risk-4": "high" },
    };
    const verdict = runGuard(action, context);
    expect(verdict.blocked).toBe(true);
    expect(verdict.pattern).toBe("hiding_bad_news");
  });

  it("allows reordering that promotes (never demotes) critical/high facts", () => {
    const defaultOrder = ["risk-1", "risk-2", "risk-3", "risk-4"];
    const proposedOrder = ["risk-1", "risk-2", "risk-4", "risk-3"]; // promotes risk-4 (high), only demotes risk-3 (medium)
    const action: AdaptationAction = {
      id: "legit-reorder",
      surface: "dashboard.risk",
      class: "sequence",
      description: "Reorder by recent usage",
      rationale: "User viewed risk-2 most recently",
      counterfactual: `Default order: ${defaultOrder.join(", ")}`,
    };
    const context: GuardContext = {
      defaultOrder,
      proposedOrder,
      severityById: { "risk-1": "critical", "risk-2": "critical", "risk-3": "medium", "risk-4": "high" },
    };
    const verdict = runGuard(action, context);
    expect(verdict.blocked).toBe(false);
  });

  it("blocks fake scarcity language unconditionally", () => {
    const action: AdaptationAction = {
      id: "seeded-scarcity",
      surface: "dashboard.finance",
      class: "presentation",
      description: "Upsell banner",
      renderedText: "Only 1 left in this pricing tier — lock it in now!",
    };
    expect(wouldRenderWithoutGuard(action)).toBe(true);
    const verdict = runGuard(action, {});
    expect(verdict.blocked).toBe(true);
    expect(verdict.pattern).toBe("fake_scarcity");
  });

  it("blocks loss-aversion exploitation on emphasis actions", () => {
    const action: AdaptationAction = {
      id: "seeded-loss-aversion",
      surface: "dashboard.finance",
      class: "emphasis",
      description: "Scare banner",
      rationale: "testing",
      counterfactual: "testing",
      renderedText: "You will lose your runway advantage by waiting on this.",
    };
    const verdict = runGuard(action, {});
    expect(verdict.blocked).toBe(true);
    expect(verdict.pattern).toBe("loss_aversion_exploit");
  });

  it("blocks confirmshaming button labels", () => {
    const action: AdaptationAction = {
      id: "seeded-confirmshame",
      surface: "dashboard.finance",
      class: "presentation",
      description: "Decline CTA",
      buttonLabels: ["Yes, show me", "No thanks, I don't care about my business"],
    };
    const verdict = runGuard(action, {});
    expect(verdict.blocked).toBe(true);
    expect(verdict.pattern).toBe("confirmshaming");
  });

  it("blocks emphasis/sequence actions that lack a rationale + counterfactual", () => {
    const action: AdaptationAction = {
      id: "seeded-missing-rationale",
      surface: "dashboard.people",
      class: "emphasis",
      description: "Highlight attrition",
    };
    const verdict = runGuard(action, {});
    expect(verdict.blocked).toBe(true);
    expect(verdict.pattern).toBe("missing_rationale");
  });

  it("passes a clean presentation-class action with no rendered-text red flags", () => {
    const action: AdaptationAction = {
      id: "legit-density",
      surface: "dashboard.finance",
      class: "presentation",
      description: "Density set to guided because expertise is novice",
    };
    const verdict = runGuard(action, {});
    expect(verdict.blocked).toBe(false);
  });
});
