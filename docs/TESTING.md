# Testing

## What is tested today

LEADOS v0.1.0 has **unit tests only**, for the two pure-logic modules that make automated decisions:

- `tests/scoring.test.ts` — 7 cases covering `scoreLead`, `bandForScore`, and `evaluateRule` from
  `src/lib/scoring.ts`: full match, no match, partial match/banding, all four operators, and score
  clamping to `[0, 100]`.
- `tests/rotation.test.ts` — 5 cases covering `nextRepInRotation` from `src/lib/rotation.ts`: first
  assignment, cycling, skipping inactive reps, empty rep list, and recovering when the last-assigned rep
  id no longer exists.

Run them with:

```
$ npm run test
```

Real output (captured during this part, abbreviated):

```
# tests 11
# pass 11
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

### Coverage

Coverage is measured with Node's built-in coverage reporter (no extra dependency):

```
$ node --experimental-test-coverage --import tsx --test tests/**/*.test.ts
```

Real numbers captured during this part:

| File | Line % | Branch % | Function % |
|---|---|---|---|
| `src/lib/rotation.ts` | 100.00 | 95.00 | 100.00 |
| `src/lib/scoring.ts` | 96.88 | 85.29 | 88.24 |
| **All files** | **98.76** | **87.65** | **91.84** |

These numbers only cover `src/lib/*` — the two modules that have tests. They say nothing about the API
route handlers, the dashboard page, or the database layer, which have **zero automated test coverage**
today (see below).

## What is honestly NOT tested

- **No integration/API tests.** `src/app/api/**/route.ts` handlers are exercised manually (via `curl`,
  documented in `docs/tutorials/first-hour.md`) but have no automated test suite. A request/response
  regression in a route handler would not be caught by `npm run verify`.
- **No end-to-end (browser) tests.** There is no Playwright/Cypress suite and no CI job that renders the
  dashboard page.
- **No mutation testing.** No mutation testing framework (e.g. Stryker) is installed. The consolidated
  gate table in `README.md` reports this gate as **not implemented**, not as a passing/failing score.
- **No load/performance testing.** See `docs/PERFORMANCE.md`.
- **No fairness/bias evaluation suite.** See `docs/explanations/fairness-posture.md`.
- **No LLM evaluation harness.** There is no LLM-backed functionality in this codebase to evaluate.

## `npm run verify`

`npm run verify` runs, in order: `lint` → `typecheck` → `test` → `build`. It is the single command this
repository's CI (`.github/workflows/ci.yml`) and this part's final validation both run. It does not run
coverage, e2e, mutation, or performance checks, because those tools are not wired up — adding them to
`verify` before they exist would make the command lie about what it checks.
