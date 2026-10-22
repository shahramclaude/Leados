# How to: scenario / what-if modeling

**Status: not implemented.** There is no scenario or what-if modeling feature in LEADOS v0.1.0 — no
endpoint, no UI, no stored "scenario" concept. This how-to exists because the Diátaxis documentation plan
for this project calls for a tenancy/rules/scenarios/rotations how-to set, and leaving a gap silently would
be less honest than explaining exactly what's missing and how to approximate it today.

## The closest thing you can do today: dry-run a rule change manually

Because scoring is a pure, stateless function (`src/lib/scoring.ts`), you can approximate a "what if I
changed this rule" scenario entirely client-side, without creating the rule in the database first:

```ts
import { scoreLead } from "./src/lib/scoring";

const hypotheticalRules = [
  { name: "Enterprise headcount", field: "employeeCount", operator: "gte" as const, value: "500", weight: 40 },
  // ...your proposed rule set
];

const result = scoreLead({ employeeCount: 450, budgetConfirmed: true, engagementScore: 8 }, hypotheticalRules);
console.log(result); // { score, band, breakdown } — no database write, no side effects
```

This is exactly how `tests/scoring.test.ts` exercises the engine, and it is a legitimate, real way to
preview a rule change before calling `POST /api/rules`. It is not a product feature — there is no UI or
API for it — it is a consequence of the scoring engine being a pure function.

## What a real scenario feature would need (roadmap, not built)

- A way to run a tenant's *current* lead population against a *hypothetical* rule set via the API (e.g.
  `POST /api/scenarios/preview` accepting a rule set and returning scores for all existing leads without
  persisting anything).
- A way to compare two rule sets' score distributions side by side.
- Historical "what would this lead have scored under last quarter's rules" replay, which would require
  rule versioning — rules are not versioned today; editing is not even supported yet (see
  `docs/how-to/rules.md`).

None of this exists. Do not describe it as available in any customer-facing material until it is built and
documented here with real examples.
