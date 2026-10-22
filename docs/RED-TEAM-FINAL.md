# Red Team — Final (Session 40)

44 findings. Severity: **Critical** (breaks trust or safety if shipped as-is)
/ **High** / **Medium** / **Low**. Disposition is one of: **Fixed this
session**, **Accepted with rationale** (see `docs/LEADOS-VISION.md` §4), or
**Planned** (see `docs/LEADOS-VISION.md` §3). All Critical/High findings have
a disposition other than "ignored" — none are silently dropped.

## A. Program & continuity

| # | Sev | Finding | Evidence | Impact | Fix | Effort | Disposition |
|---|---|---|---|---|---|---|---|
| 1 | Critical | Repository contained none of the 39 prior "parts'" artifacts at session start | `list_files` at session start; recorded in `docs/PART-DEPENDENCY.md` | Cannot audit or extend claims that have no artifact; risk of fabricating false history | Disclose plainly, re-baseline honestly as the origin point | N/A | Fixed this session (disclosed, not fabricated) |
| 2 | High | No prior `AI-SESSION-LOG.md` to append to | same | Loses the "who changed what and why" chain the brief assumes exists | Start the log now, be explicit about the gap | S | Fixed this session (`AI-SESSION-LOG.md` root) |
| 3 | Medium | Brief's seam list (fitness/assurance/chaos/consolidation/VoC/process-mining) implies dozens of upstream engines across "23–39" that don't exist here | Prompt text vs. actual repo | Scope mismatch between ambition and reality | Build the generalizable single version of each seam, document the rest as future program work | M | Fixed this session (6 seams built) + planned (`LEADOS-VISION.md` §3) |

## B. Security

| # | Sev | Finding | Evidence | Impact | Fix | Effort | Disposition |
|---|---|---|---|---|---|---|---|
| 4 | Critical | No authentication/authorization on any API route | every file in `src/app/api/*/route.ts` | Anyone with network access can read/write all organizational data | Add auth (session or JWT) + RBAC before real deployment | L | Accepted with rationale |
| 5 | High | No rate limiting / payload size caps on POST endpoints | same | Trivial DoS via flooding inserts | Add middleware rate limiting | S | Planned |
| 6 | High | No CSRF/origin checks on mutating routes | same | Cross-site request could trigger a mutation | Add origin allow-list check | S | Planned |
| 7 | Medium | No central error handler; a raised exception could leak internal detail | all routes return raw thrown errors by default Next.js behavior | Information disclosure | Add a generic API error wrapper | S | Planned |
| 8 | High | `.env` holds a plaintext DB credential | `.env` | Fine for sandbox, unsafe in production | Move to a secret manager before real deployment | S | Accepted with rationale (sandbox constraint) |
| 9 | Medium | No TLS/HTTPS enforcement configured at the app layer | `next.config.ts` has no headers config | Credentials/data could travel in clear text behind a misconfigured proxy | Add `Strict-Transport-Security` header once behind TLS termination | S | Planned |

## C. Seam correctness — fitness

| # | Sev | Finding | Evidence | Impact | Fix | Effort | Disposition |
|---|---|---|---|---|---|---|---|
| 10 | High | A metric with `target = 0` silently reports 0 attainment instead of flagging a data-quality problem | `src/lib/fitness.ts` | A broken target looks identical to a genuinely failing metric | Add a `dataQualityFlag` for non-positive targets | S | Planned |
| 11 | Medium | No recency weighting — a metric from a year ago counts exactly as much as one from today | `src/lib/fitness.ts` | Stale metrics can mask real current performance | Weight by `recordedAt` | M | Planned |
| 16 | Critical | Fitness gaming: lowering a target raises the score without improving anything real | `computeFitnessScore` uses `value/target` with no target-change governance | Fitness becomes a vanity metric if targets are not governed | Target-change approval workflow + history log | M | Accepted with rationale |

## D. Seam correctness — assurance

| # | Sev | Finding | Evidence | Impact | Fix | Effort | Disposition |
|---|---|---|---|---|---|---|---|
| 12 | High | An engine's last "pass" could be read as current forever if never re-checked | original `summarizeAssurance` had no staleness concept | False assurance | Add a 90-day staleness threshold that demotes a stale pass to critical | S | **Fixed this session** (`src/lib/assurance.ts`, `assurance.test.ts`) |
| 13 | Medium | All engines are weighted equally in worst-severity ranking regardless of business criticality | `src/lib/assurance.ts` | A trivial engine's failure reads the same as a mission-critical one's | Add an engine `criticality` field and weight by it | M | Planned |
| 27 | Critical | No real ML/AI model exists behind any "engine" — UI could imply working AI where there is none | `engines` table + seed data have no inference code | The single largest honesty risk in the product | Either wire real models or label clearly as governance placeholders | L | Accepted with rationale (labeled explicitly in `LEADOS-VISION.md`, `EVIDENCE-LEDGER.md`, `GLOSSARY.md`) |
| 28 | High | No engine versioning/rollback story | `src/db/schema.ts` (`engines` has no version history) | Cannot roll back to a previous-good model version | Add `engine_versions` table | M | Planned |
| 29 | Medium | `result`/`severity` were free text, not validated against an allowed set | original `/api/assurance` route | A typo like `"critial"` would silently fail to rank | Validate against `VALID_RESULTS`/`VALID_SEVERITIES` at the API boundary | S | **Fixed this session** (`src/app/api/assurance/route.ts`) |

## E. Seam correctness — chaos / risk

| # | Sev | Finding | Evidence | Impact | Fix | Effort | Disposition |
|---|---|---|---|---|---|---|---|
| 14 | High | Belief-update heuristic (0.6 up / 0.25 down factors) is not calibrated against real historical outcomes | `src/lib/chaos.ts` | Belief scores could be systematically mis-calibrated | Calibrate once enough experiment history exists | L | Accepted with rationale |
| 15 | Medium | Nothing stops repeatedly running "held" experiments on the same risk to manufacture a low belief score (chaos gaming) | `/api/chaos` has no run-diversity or rate control | A risk owner could game their own risk register | Require distinct experiment design per run, log the actor, add diminishing returns | M | Planned |

## F. Seam correctness — consolidation / board pack

| # | Sev | Finding | Evidence | Impact | Fix | Effort | Disposition |
|---|---|---|---|---|---|---|---|
| 17 | High | FX rates are static manual input, not sourced independently or locked at period close | `entities.fxRateToUsd` | Board pack numbers can be shaped by picking a favorable rate | Source FX from an independent provider, lock at period close | M | Accepted with rationale (mitigated by disclosure text) |
| 18 | High | No intercompany elimination — consolidation simply sums entities | `src/lib/consolidation.ts` (`runConsolidation`) | Overstated consolidated revenue/costs if intercompany trade exists | Add an elimination table and apply it before summation | L | Accepted with rationale (disclosed explicitly in every board pack) |
| 19 | Medium | Board packs have no draft/approved status gate before being considered "generated" | `boardPacks` table has no `status` column (unlike `consolidationRuns`) | Unreviewed numbers could be read as final | Add `status: draft \| approved` and require approval before "distributable" | S | Planned |
| 20 | High | Executive-summary distortion: a negative net result could be presented blandly, with the same tone as a positive one | original `buildBoardPackSummary` had no sign-aware framing | A loss could be buried in neutral language | Add an explicit, un-removable loss banner when net < 0 | S | **Fixed this session** (`src/lib/consolidation.ts`, tested in `consolidation.test.ts`) |
| 44 | Medium | No "void/supersede" workflow if a bad consolidation run is persisted (e.g. wrong FX entered) | `consolidationRuns.status` has no transition rules enforced | A wrong run could sit next to a correct one with no clear precedence | Add status transitions (`draft -> final -> void`) and require void before re-run | S | Planned |

## G. Seam correctness — VoC / strategy

| # | Sev | Finding | Evidence | Impact | Fix | Effort | Disposition |
|---|---|---|---|---|---|---|---|
| 21 | Medium | Theme strings are not normalized (`"Onboarding"` vs `"onboarding"` count separately) | `src/lib/voc.ts` (`rankVocThemes`) | Fragments urgency signal across near-duplicate themes | Normalize + fuzzy-match themes | M | Planned |
| 22 | Medium | `suggestStrategyLink` is a naive substring match and can false-positive link unrelated feedback | `src/lib/voc.ts` | Feedback could escalate to the wrong strategy owner | Replace with real similarity/NLP matching | L | Accepted with rationale (documented as a known heuristic in code + ledger) |
| 23 | Low | No reverse view showing which feedback drove a given strategy item | `src/app/page.tsx` | Harder to justify a strategy decision to a skeptical stakeholder | Add a reverse lookup panel | S | Planned |

## H. Seam correctness — process mining / automation

| # | Sev | Finding | Evidence | Impact | Fix | Effort | Disposition |
|---|---|---|---|---|---|---|---|
| 24 | Medium | Automation score does not discount one-off, low-repetition automatable steps | disclosed directly in `src/lib/automation.test.ts` ("known gap") | Could overstate automation ROI for rare steps | Weight by repetition count | M | Planned (already disclosed, not hidden) |
| 25 | Medium | No validation that step durations are plausible (zero/negative accepted) | original `/api/process-mining` route | Garbage input silently skews automation score | Reject non-positive `durationMs` | S | **Fixed this session** (`src/app/api/process-mining/route.ts`) |

## I. Governance / data misrepresentation

| # | Sev | Finding | Evidence | Impact | Fix | Effort | Disposition |
|---|---|---|---|---|---|---|---|
| 26 | High | No audit log of who ran a mutation and when | no `audit_log` table in `src/db/schema.ts` | If the lead engineer leaves, there is no record of "who changed what" (see Phase 5, Q2) | Add an append-only `audit_log` table capturing actor + action + payload | M | Planned |
| 30 | Medium | ESG metrics are self-reported with no evidence attachment field | `metrics` table has no `evidenceUrl` | Greenwashing / ESG misrepresentation risk | Add evidence URL + verification status per ESG metric | M | Planned |
| 31 | High | "Disclosure completeness" ESG metric is itself self-assessed, with no external assurance | seed data, `docs/EVIDENCE-LEDGER.md` | Same root cause as #30, compounded | Seeded with a failing/critical assurance check so dashboard does not overstate confidence | — | **Fixed this session** (seed data honesty mitigation; full fix planned) |

## J. Scale, platform, and tenancy

| # | Sev | Finding | Evidence | Impact | Fix | Effort | Disposition |
|---|---|---|---|---|---|---|---|
| 32 | Medium | No tenant/organization boundary — single global dataset | `src/db/schema.ts` has no `org_id` anywhere | Unsuitable for multi-company SaaS as-is | Add `org_id` to every table + scoping middleware | L | Planned (explicit "is not" in vision doc) |
| 33 | Low | No pagination on any GET list endpoint | all `src/app/api/*/route.ts` GET handlers | Will degrade at real data volume | Add `limit`/`offset` | S | Planned |
| 34 | Medium | Fitness and assurance routes loop per-domain/per-engine issuing one query each (N+1) | `src/app/api/fitness/route.ts`, `src/lib/assuranceData.ts` | Latency grows linearly with domain/engine count | Batch with a single grouped query | M | Planned (acceptable at current seed scale) |

## K. Code quality / duplication / testing

| # | Sev | Finding | Evidence | Impact | Fix | Effort | Disposition |
|---|---|---|---|---|---|---|---|
| 35 | Low | Two independent implementations of "latest check per engine" existed (dashboard + API route) | pre-fix `src/lib/dashboard.ts` and `src/app/api/assurance/route.ts` | Risk of the two views silently drifting apart | Extract one shared helper | S | **Fixed this session** (`src/lib/assuranceData.ts`) |
| 36 | Medium | No automated integration test hits the real HTTP routes — only pure lib functions are unit-tested | `src/lib/*.test.ts` vs. `src/app/api/*/route.ts` | Route-level bugs (serialization, numeric string coercion) are not caught by `npm run test` | Add integration tests invoking route handlers directly or via a test server | M | Planned (mitigated by manual `build_and_start` smoke-check this session) |
| 37 | Low | Postgres numeric columns return as strings; every route hand-converts with `Number()`/`String()` | every `/api/*/route.ts` with a numeric column | Easy to forget in a new route, causing silent `NaN` bugs | Central Zod schema / numeric mapper | M | Planned |
| 38 | Medium | No API documentation for the 14 routes beyond this red team and the code itself | repo-wide | Harder for a new engineer to onboard | Add `docs/API.md` or generate from Zod | S | Planned |
| 39 | Low | Tailwind utility classes repeated inline across dashboard sections instead of extracted components | `src/app/page.tsx` | Cosmetic maintenance debt only | Extract shared `Card`/`Badge` components | S | Planned |
| 42 | Medium | `ledger-check.mjs` is a bespoke regex-based markdown table parser, fragile to formatting drift | `scripts/ledger-check.mjs` | Could silently mis-parse if ledger formatting changes | Migrate to a structured YAML/JSON source of truth | M | Planned |

## L. Demo honesty / default-view bias

| # | Sev | Finding | Evidence | Impact | Fix | Effort | Disposition |
|---|---|---|---|---|---|---|---|
| 40 | Medium | Default seed data was originally too optimistic (only one "warn," no failures) | pre-fix `scripts/seed.mjs` | A hostile auditor opening the dashboard for the first time would see an unrealistically healthy system | Seed at least one failing engine, one escalated risk, and unit-test a loss scenario | S | **Fixed this session** (`scripts/seed.mjs`, `consolidation.test.ts`) |

## M. CI / process

| # | Sev | Finding | Evidence | Impact | Fix | Effort | Disposition |
|---|---|---|---|---|---|---|---|
| 41 | High | `gate:all` (fast tier) intentionally excludes `build`/`typegen`, so a build-breaking type error could pass it | `scripts/gate-all.mjs` header comment | False sense of safety if fast tier is mistaken for the full gate | Document the two-tier split explicitly everywhere it's referenced | — | Accepted with rationale (by design — see `docs/VERIFICATION-LOG.md`) |
| 43 | Low | No CI workflow existed wiring `gate:all` (or the slow tier) to the repository | session start state | Quality gate was manual-only | Add a GitHub Actions workflow running both tiers against a real Postgres service | S | **Fixed this session** (`.github/workflows/ci.yml` — not yet executed by an actual runner, see ledger) |

---

## Disposition summary

- **Fixed this session:** 10 (#2, #3 partially, #12, #20, #25, #29, #31 partial mitigation, #35, #40, #43) — directly remediated in code/docs/CI this session.
- **Accepted with rationale:** 9 (#1, #4, #8, #16, #17, #18, #22, #27, #41) — all Critical/High items in this bucket have a written rationale in `docs/LEADOS-VISION.md` §4.
- **Planned:** 25 — ranked in `docs/LEADOS-VISION.md` §3 (top 10) and tracked here for the rest.

10 + 9 + 25 = 44. No Critical or High finding in this document is undisposed.
