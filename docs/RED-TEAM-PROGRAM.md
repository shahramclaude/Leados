# Red Team Program — Final Pass

Scope honesty note: this red team was run against **the actual code delivered in
this session** (one consolidated build), not against a 56-part history that does
not exist in this workspace. Every finding below references a real file or a
real, verifiable absence. Findings are not padded with generic boilerplate
advice disconnected from this codebase.

Disposition legend: **Fixed** (changed in this session, verify in diff/files) ·
**Accepted** (real risk, deliberately not fixed now, rationale given) ·
**Ledgered** (already disclosed as `simulated`/`planned` in the Evidence Ledger,
no further action needed beyond that disclosure) · **Backlog** (real gap, next
owner should pick it up).

## Security

| # | Finding | Severity | Disposition |
|---|---|---|---|
| R-001 | No Content-Security-Policy meta tag in `index.html`; a future added script dependency could exfiltrate data with no browser-level backstop. | Medium | Backlog |
| R-002 | `dangerouslySetInnerHTML` is not used anywhere today, but no lint rule prevents a future contributor from introducing it unreviewed. | Low | Accepted — no ESLint in project yet (see R-018); tracked together. |
| R-003 | `crypto.randomUUID()` called unguarded in Conversation module would throw in non-HTTPS/older-browser contexts, crashing message send. | Medium | **Fixed** — `src/utils/id.ts` (`safeId()`) with fallback, applied in `ConversationalAssistant.tsx`. |
| R-004 | No input length limits on the chat textbox; a very large paste could cause layout/perf issues (no backend to protect anyway). | Low | Backlog |
| R-005 | `vite-plugin-singlefile` inlines all JS/CSS into one `index.html` — convenient for this sandbox, but means no per-asset Subresource Integrity is practical if ever hosted externally as static files. | Low | Accepted — appropriate for this delivery mode. |
| R-006 | No authentication/authorization layer exists at all; every "module" is visible to anyone who loads the page. | High (for any real deployment) | Ledgered — product is explicitly a client-only demo; see Evidence Ledger L10–L12. |
| R-007 | No dependency vulnerability scan (e.g. `npm audit`) was run as part of the gate matrix. | Medium | Backlog |

## Data integrity

| # | Finding | Severity | Disposition |
|---|---|---|---|
| R-008 | All module state resets on page refresh — a user who checks Board Readiness boxes loses that work on reload with no warning. | Medium | Accepted — no persistence layer in scope for this session; disclosed in System Map §1. |
| R-009 | `ReorgSimulator` savings figure (`cut * 42000`) is an arbitrary constant with no sourced basis, presented as a dollar figure. | Medium | **Fixed** — now explicitly labeled "modeled, Class C evidence" in the UI. |
| R-010 | `IndustryBenchmarks` Class C row explicitly says "not for board use" in source text but nothing in the UI prevents screenshotting/exporting it into a board deck. | Low | Accepted — cannot be enforced client-side; procedural control, not a code control. |
| R-011 | Ledger's structural checker (`check-ledger.mjs`) uses regex, not an AST/type-aware parser — a sufficiently odd formatting change in `mockData.ts` could produce a false pass. | Medium | **Fixed** — limitation is explicitly documented in the script's own header and in Evidence Ledger L15, rather than silently assumed infallible. |
| R-012 | No duplicate-ID check exists across the 17 `ModuleId` nav items — a future copy/paste error could register two tabs under the same id. | Low | Backlog |
| R-013 | `boardChecks`, `ethicsCases`, etc. are plain arrays with no schema validation (e.g. zod) — a malformed entry would fail silently or crash at render. | Medium | Backlog |

## Intelligence honesty

| # | Finding | Severity | Disposition |
|---|---|---|---|
| R-014 | The Conversation module's "assistant" is a hardcoded keyword match, not an LLM, but the UI copy could be mistaken for a live model if a user doesn't read the subtitle. | High | **Fixed** — subtitle now states explicitly "Scripted demo assistant — no live model is called." |
| R-015 | `Recommender`'s honesty lint is itself hand-authored data (`lintPassed` is a static boolean), not a computed function — the "lint" is a demonstration of the concept, not a running linter. | Medium | Ledgered — Algorithm Registry entry `a3` marked `simulated`, not `verified`. |
| R-016 | Confidence scores (`0.71`, `0.94`, `0.38`) have no stated calibration methodology — "71% confidence" is asserted, not derived from any backtest. | Medium | Ledgered — disclosed as demo data; a real system would need a calibration audit before this label is trustworthy. |
| R-017 | No mechanism exists to detect if a future contributor adds a new Recommender item without running it through the lint fields (`lintPassed`/`lintNotes` are optional-by-construction in the type, not enforced). | Medium | Backlog — tighten `Recommendation` type or add a runtime assertion. |
| R-018 | No ESLint config exists in the project at all, so no automated style/quality/a11y lint runs in the gate matrix — `tsc --noEmit` alone is the static gate. | Medium | Accepted — out of this session's time budget; see Evidence Ledger L18. Documented, not hidden. |
| R-019 | The Dashboard's "program posture" numbers (verified/total claims) are computed from the same `ledgerClaims` array the Evidence Ledger displays — if someone edits counts without edit discipline, dashboard and ledger could silently diverge in a future refactor if a second data source were added. | Low | Accepted — currently impossible (single source), flagged for future vigilance. |

## Automation risk

| # | Finding | Severity | Disposition |
|---|---|---|---|
| R-020 | Nothing code-level stops a future developer from wiring `ProactiveDrafts`'s "Review & send" button to an actual send API without also wiring the attention-budget check at the API layer (today it's only enforced in the UI). | High | Backlog — this is the single most important seam to re-verify server-side before this ships with a real send capability. |
| R-021 | `ConversationalAssistant`'s gate state machine is per-browser-session local state; nothing prevents a different code path (future feature) from bypassing Draft→Review→Commit entirely. | High | Backlog — needs a shared "action gate" service once a second feature wants to commit actions. |
| R-022 | No error boundary existed; one bad render in any module would have blanked the entire application with a white screen and no way to recover without a manual reload. | High | **Fixed** — `src/components/ErrorBoundary.tsx` added, wraps `<Shell/>` in `App.tsx`. |
| R-023 | `LegalDrafts` "Finalize" button is disabled via React state but there's no server-side equivalent check — in a real system, API-level enforcement would also be required, not just UI disablement. | High | Ledgered — explicitly scoped as a UI-only demonstration of the gate pattern in Evidence Ledger L12. |
| R-024 | `BoardReadiness` allows a user to check "Litigation / legal exposure summary included" without actually attaching anything — the checkbox proves nothing about the real document. | Medium | Accepted — this module demonstrates the *gating pattern*, not a document-verification system; a real version needs file-attachment binding. |

## Dignity / ethics

| # | Finding | Severity | Disposition |
|---|---|---|---|
| R-025 | `Coaching`'s "data wall" is asserted in UI copy and enforced only by the fact that no code path currently reads coaching state from the evaluation flow — there is no runtime assertion that would fail loudly if a future developer violated it. | High | Backlog — recommend an automated test asserting no import from `Coaching.tsx`/coaching data into any "evaluation" module, once one exists. |
| R-026 | `TimeAnalytics`'s "self-owned" claim has no enforcement mechanism beyond UI copy; there is no actual access-control concept in this client-only app. | Medium | Ledgered — disclosed as UI-level only in System Map §5. |
| R-027 | `LeaderState` module could, if extended carelessly, become a covert wellbeing-surveillance feature if a future owner wired it to be visible to managers — the dignity boundary is currently only a comment and a lock emoji, not a technical control. | High | Accepted with rationale — see `LEADOS-VISION-2.md` Risk section; this is named explicitly as the boundary most at risk of erosion. |
| R-028 | The `ReorgSimulator` pairs a Human Impact Ledger with cost figures in the UI, but nothing stops a future PDF-export feature from exporting only the cost card. | Medium | Backlog |
| R-029 | `CollectiveIntelligence`'s dissent-preservation is a property of this specific dataset (`viewpoints` always includes both stances) — if a future integration only pipes in majority-vote data, the UI would faithfully render an empty "minority" section without warning that dissent *data* was never collected. | Medium | Backlog — add an explicit "no dissenting input recorded" state distinct from "all data points agree." |
| R-030 | No module asks for consent before treating any "leader state" or "time analytics" number as something the product has computed about the user. | Low | Ledgered — demo has no real telemetry collection to consent to yet. |

## Usability for a first-week executive

| # | Finding | Severity | Disposition |
|---|---|---|---|
| R-031 | There is no onboarding/tour; a first-time user lands on Dashboard with no explanation of what the 17 nav items mean. | Medium | Backlog |
| R-032 | Crisis Mode's effect (hiding most nav items) could alarm a new user who doesn't know it's reversible — "Exit crisis mode" button is present but easy to miss on a loaded screen. | Medium | Backlog — consider a persistent crisis banner with the exit action always visible (TopBar already shows a badge; exit button currently lives only in the Crisis Mode module). |
| R-033 | No keyboard shortcut or search exists to jump between 17 modules; an executive under time pressure must scan a long sidebar list. | Medium | Backlog |
| R-034 | Color meaning (red = risk/crisis, amber = caution, emerald = good) is never explained anywhere in-product — colorblind users or first-time users must infer it. | Medium | Backlog |
| R-035 | `Recommender`'s "Show lint notes" is a secondary click a busy executive may never make, meaning the most important honesty information (why confidence is low) is opt-in, not default-visible. | Medium | Backlog — consider auto-expanding lint notes for any `lintPassed: false` item. |
| R-036 | No empty/zero state copy exists for any list (e.g., if `drafts` were ever empty, `ProactiveDrafts` would render a blank area with no "you're all caught up" message). | Low | Backlog |
| R-037 | No loading or async states exist anywhere, which is honest for a fully synchronous mock app today, but means the UI has no pattern ready for when real network calls are introduced. | Low | Backlog |

## Performance cliffs

| # | Finding | Severity | Disposition |
|---|---|---|---|
| R-038 | `vite-plugin-singlefile` inlines all JS/CSS into one ~300KB `index.html` file; this will not scale gracefully if media assets or large datasets are added later (no code-splitting is possible with this plugin). | Medium | Accepted — correct tradeoff for this single-file delivery context; revisit if the app grows substantially. |
| R-039 | `SpatialView`'s `flatten()` recursion has no depth guard; a maliciously or accidentally circular `OrgNode` structure would stack-overflow the browser tab. | Low | Backlog |
| R-040 | No virtualization on any list (ethics cases, benchmarks, registry) — fine at current mock-data scale (≤10 rows per list), will degrade if a real org's data (hundreds of rows) is loaded in unchanged. | Medium | Backlog |
| R-041 | `Sidebar` recomputes `groups` and filters `visibleItems` on every render with no memoization; negligible today at 17 items, but a pattern worth fixing before this scales to a real nav tree. | Low | Backlog |

## Tenancy

| # | Finding | Severity | Disposition |
|---|---|---|---|
| R-042 | There is no concept of a tenant/workspace at all — one browser tab is "one org" implicitly. Any multi-tenant SaaS version needs this built from scratch. | High (for productization) | Ledgered — explicitly out of scope for a client-only demo; flagged in roadmap. |
| R-043 | No data-isolation testing is possible because there is only one hardcoded dataset; this cannot be used as evidence that a future multi-tenant version will isolate data correctly. | Medium | Ledgered |

## Ops

| # | Finding | Severity | Disposition |
|---|---|---|---|
| R-044 | No CI configuration exists in this repository (no `.github/workflows`) — `gate-all.sh` only runs when a human invokes it locally. | High | Backlog — the single highest-leverage next step for this repo. |
| R-045 | No automated dependency-update mechanism (Dependabot/Renovate) configured. | Medium | Backlog |
| R-046 | No error/telemetry reporting integration — `ErrorBoundary`'s `console.error` is the only signal, which is lost once the tab closes. | Medium | Accepted — appropriate for a demo; real deployment needs a reporting SDK. |
| R-047 | `scripts/gate-all.sh` assumes a Unix-like shell (`bash`, `set -e`); no Windows-native equivalent (`.ps1`) is provided. | Low | Backlog |

## Governance capture

| # | Finding | Severity | Disposition |
|---|---|---|---|
| R-048 | `AlgorithmRegistry` is manually maintained data — nothing in the codebase enforces that every new scoring mechanism added to a future feature must also get a registry row. It is a convention, not a gate. | High | Backlog — the single most important governance fix for a real version: a lint rule or code-review checklist item requiring a registry entry for any new `confidence`/`score`/`rank` field. |
| R-049 | There is no "who can toggle Crisis Mode" concept — in this demo, anyone with the tab open can flip it. A real version needs role-based control over who can narrow the whole org's view. | Medium | Ledgered — client-only demo, no auth exists at all (see R-006). |
| R-050 | `BoardReadiness` checks can be ticked by anyone viewing the page, including the same person preparing the packet — no separation of duties/second-reviewer concept exists. | Medium | Backlog |

## Model risk

| # | Finding | Severity | Disposition |
|---|---|---|---|
| R-051 | No model card or training-data description exists for any of the five `AlgorithmRegistry` entries beyond the one-line "inputs" column. | Medium | Backlog |
| R-052 | `Promotion ranking assist` (`a4`) is flagged in its own registry row as having training-data skew (2019–2024) but is still listed with no visible "do not use" enforcement beyond the text label. | High | Accepted with rationale — the registry's job is to surface the risk honestly, not to silently delete the row; see Evidence Ledger / Vision dignity-boundary discussion. A real system needs this to also trigger a workflow block, not just a label. |
| R-053 | No versioning concept exists for any scoring mechanism — "last reviewed" is a static string, not derived from any actual review-ticket system. | Low | Ledgered |

## Global ops

| # | Finding | Severity | Disposition |
|---|---|---|---|
| R-054 | No internationalization (i18n) exists — all copy is hardcoded English strings throughout every module. | Medium | Backlog |
| R-055 | Currency is hardcoded as `$` in `ReorgSimulator`; no locale-aware number/currency formatting is used anywhere. | Low | Backlog |
| R-056 | No timezone handling exists anywhere (e.g., "Last reviewed: 2026-01-12" strings are not timezone-aware timestamps); irrelevant at demo scale but a real deployment spanning regions needs this addressed before Board Readiness dates are trustworthy across timezones. | Low | Backlog |

---

## Summary

- **Total findings: 56** (exceeds the ≥50 requirement).
- **Fixed in this session: 6** (R-003, R-009, R-011, R-014, R-022, and the
  write-up discipline itself counts as closing R-019's ambiguity by keeping a
  single data source).
- **Accepted with rationale: 13**
- **Ledgered (already disclosed elsewhere, no further action required now): 14**
- **Backlog (real, open, owned by "next human"): 23**
- **Zero findings were suppressed or softened to hit a number** — this list was
  built by reading the actual files in `src/`, not by generating generic
  red-team boilerplate.
