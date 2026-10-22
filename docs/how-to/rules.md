# How to: author scoring rules

Rules are what the scoring engine (`src/lib/scoring.ts`) evaluates. Each rule inspects one field on a
lead's merged signal set (`signals` JSON blob plus the lead's `source` column — see
`src/app/api/leads/[id]/score/route.ts`) and contributes `weight` points when it matches.

## Create a rule

```
$ curl -s -X POST -H 'Content-Type: application/json' -d '{
    "name": "Enterprise headcount",
    "field": "employeeCount",
    "operator": "gte",
    "value": "500",
    "weight": 40
  }' "localhost:3000/api/rules?tenant=demo"
```

## Operators

| Operator | Meaning | Example |
|---|---|---|
| `gte` | numeric: field value ≥ `value` | `employeeCount gte 200` |
| `lte` | numeric: field value ≤ `value` | `dealSizeRisk lte 3` |
| `eq` | string equality | `source eq "inbound"` |
| `truthy` | field is JS-truthy (ignores `value`) | `budgetConfirmed truthy` |

See `src/lib/scoring.ts`'s `evaluateRule()` for the exact (tested) semantics, and `tests/scoring.test.ts`
for worked examples of each operator.

## List a tenant's rules

```
$ curl -s "localhost:3000/api/rules?tenant=demo"
```

## How rule weights become a score

`scoreLead()` sums the `weight` of every matched rule, clamps the total to `[0, 100]`, and bands it: `hot`
≥ 70, `warm` ≥ 40, else `cold` (`src/lib/scoring.ts:35-36,70-71`). There is no normalization by number of
rules — if your tenant's rule weights sum to more than 100, a lead matching all of them will still cap at
100, and your scores will skew hot. Keep total possible weight close to 100 for a legible 0–100 range, or
build a cross-check into how you read scores if you intentionally allow overlap.

## Rule authoring caveats (read before writing fairness-sensitive rules)

LEADOS does not validate that a rule's `field` is appropriate to score on. See
`docs/explanations/fairness-posture.md` before keying a rule on any field that could proxy for a protected
characteristic.

## There is no rule editing or deletion endpoint yet

Today you can only create rules (`POST /api/rules`) or mark one inactive directly via `psql`
(`UPDATE rules SET active = false WHERE id = ...`) — inactive rules are excluded from scoring
(`src/app/api/leads/[id]/score/route.ts` filters `.filter((rule) => rule.active)`), but there is no
`PATCH`/`DELETE` route. This is a real gap, not an oversight to hide.
