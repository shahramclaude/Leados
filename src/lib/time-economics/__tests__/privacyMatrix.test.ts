// Privacy enforcement matrix: exhaustive fixture table. Every attempt to
// read another person's individual time data must be denied unless they
// explicitly consented, regardless of the actor's role (including admin).
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateTimeDataAccess, meetsKAnonymityFloor, PRIVACY_K_ANONYMITY_FLOOR } from "../privacy";
import type { Role } from "../types";

const SELF = "user-self";
const OTHER = "user-other";

interface MatrixCase {
  description: string;
  actorRole: Role;
  resource: Parameters<typeof evaluateTimeDataAccess>[2];
  consent: { shareAggregateOnly: boolean; allowManagerView: boolean } | null;
  expectAllowed: boolean;
}

const CASES: MatrixCase[] = [
  { description: "manager reading report's interaction detail, no consent", actorRole: "manager", resource: "individual_interaction_detail", consent: null, expectAllowed: false },
  { description: "admin reading someone's interaction detail, no consent", actorRole: "admin", resource: "individual_interaction_detail", consent: null, expectAllowed: false },
  { description: "admin reading someone's interaction detail, consent=shareAggregateOnly only", actorRole: "admin", resource: "individual_interaction_detail", consent: { shareAggregateOnly: true, allowManagerView: false }, expectAllowed: false },
  { description: "manager reading consented report's interaction detail", actorRole: "manager", resource: "individual_interaction_detail", consent: { shareAggregateOnly: true, allowManagerView: true }, expectAllowed: true },
  { description: "admin reading consented person's interaction detail", actorRole: "admin", resource: "individual_interaction_detail", consent: { shareAggregateOnly: true, allowManagerView: true }, expectAllowed: true },
  { description: "member (non-manager) reading consented person's detail", actorRole: "member", resource: "individual_interaction_detail", consent: { shareAggregateOnly: true, allowManagerView: true }, expectAllowed: false },
  { description: "finance reading someone's meeting-cost detail without consent", actorRole: "finance", resource: "individual_meeting_cost_detail", consent: null, expectAllowed: false },
  { description: "finance reading someone's loaded rate (comp-adjacent, allowed by role)", actorRole: "finance", resource: "loaded_rate", consent: null, expectAllowed: true },
  { description: "admin reading someone's loaded rate (allowed by role)", actorRole: "admin", resource: "loaded_rate", consent: null, expectAllowed: true },
  { description: "manager reading someone's loaded rate (NOT finance/admin — denied)", actorRole: "manager", resource: "loaded_rate", consent: null, expectAllowed: false },
  { description: "member reading someone's strategy mirror without consent", actorRole: "member", resource: "individual_strategy_mirror", consent: null, expectAllowed: false },
  { description: "any role reading aggregate dashboard", actorRole: "member", resource: "aggregate_dashboard", consent: null, expectAllowed: true },
];

for (const c of CASES) {
  test(`privacy matrix: ${c.description}`, () => {
    const decision = evaluateTimeDataAccess({ id: OTHER + "-actor", role: c.actorRole }, SELF, c.resource, c.consent);
    assert.equal(decision.allowed, c.expectAllowed, decision.reason);
    assert.ok(decision.reason.length > 0, "every decision must carry a human-readable reason for the audit log");
  });
}

test("privacy matrix: self always allowed regardless of resource or consent", () => {
  const resources: Array<Parameters<typeof evaluateTimeDataAccess>[2]> = [
    "individual_interaction_detail",
    "individual_meeting_cost_detail",
    "individual_strategy_mirror",
    "loaded_rate",
  ];
  for (const resource of resources) {
    const decision = evaluateTimeDataAccess({ id: SELF, role: "member" }, SELF, resource, null);
    assert.equal(decision.allowed, true);
  }
});

test("k-anonymity floor rejects small groups", () => {
  assert.equal(meetsKAnonymityFloor(PRIVACY_K_ANONYMITY_FLOOR - 1), false);
  assert.equal(meetsKAnonymityFloor(PRIVACY_K_ANONYMITY_FLOOR), true);
  assert.equal(meetsKAnonymityFloor(PRIVACY_K_ANONYMITY_FLOOR + 10), true);
});
