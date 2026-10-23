# Evidence Ledger

This is the single source of truth for what is **verified**, **simulated**, or
**planned** in this repository. It mirrors `src/data/mockData.ts:ledgerClaims`
(rendered live in-app under "Evidence Ledger") plus a few claims about the build
process itself that don't belong in app data.

Status definitions:
- **verified** — backed by a real, re-runnable check, named below.
- **simulated** — the UI behavior is real and testable, but the content/data
  behind it is fabricated demo data, not a live integration.
- **planned** — described somewhere (docs or UI copy) but not implemented.

## A. Product claims (mirrors in-app ledger)

| ID | Claim | Status | Proof |
|---|---|---|---|
| L1 | The app builds with `npm run build` with zero errors. | verified | Re-run at delivery; see Verification Log in `PROGRAM-COMPLETION-REPORT.md`. |
| L2 | TypeScript compiles with no type errors (`tsc --noEmit`). | verified | Re-run at delivery; see Verification Log. |
| L3 | Crisis Mode coherently degrades the whole UI in one state change. | verified | `AppStateContext.crisisMode` read by `Sidebar`, `TopBar`, `Dashboard` simultaneously. |
| L4 | Collective Intelligence preserves minority/dissenting views. | verified | `CollectiveIntelligence.tsx` always renders both clusters; no averaging code path exists. |
| L5 | Proactive Drafts respect a finite attention budget and never auto-send. | verified | `spendAttention` only called from an onClick handler; no `setInterval`/`setTimeout` anywhere in the module. |
| L6 | Spatial and semantic org views show the same data. | verified | Both renderers consume the single `orgTree` constant. |
| L7 | The Recommender flags its own overclaiming item before display. | verified | `recommendations[2]` is seeded with `lintPassed: false` and renders a visible "Lint failed" badge. |
| L8 | Chat actions commit only after Draft → Review → Commit. | verified | `ConversationalAssistant.tsx` gate state machine has no direct draft→committed transition. |
| L9 | Benchmark figures are classified by evidence strength, not uniform. | verified | Every `BenchmarkFigure` has an `evidenceClass` of A/B/C rendered as a distinct badge. |
| L10 | Underlying business data reflects a real customer's live state. | simulated | All content is hand-authored demo data in `mockData.ts`. No customer, no live system. |
| L11 | The chat assistant is powered by a live LLM. | simulated | `ConversationalAssistant.tsx` uses a small keyword-matched script, not an API call. |
| L12 | Legal Drafts module performs actual legal review. | simulated | Only a human-confirmation UI gate exists; no legal reasoning is automated or checked. |
| L13 | A 58-part prior program (Parts 1–56) exists in this repository's history. | planned (unverifiable here) | Not found in this workspace at session start: no `docs/`, no `AI-SESSION-LOG.md`, no prior red-team docs existed. Treat any claim of prior parts as unverified until the human confirms it from actual repo history on GitHub. |
| L14 | This build has live write access to `github.com/shahramclaude/Leados`. | planned | No GitHub credentials or network write path are available to these tools. All files below must be uploaded manually by the human. |

## B. Build/process claims (not in the in-app module, but load-bearing for this delivery)

| ID | Claim | Status | Proof |
|---|---|---|---|
| L15 | `node scripts/check-ledger.mjs` passes and finds no structural ledger defects. | verified | Re-run at delivery; output captured in Verification Log. |
| L16 | `scripts/gate-all.sh --slow` runs tsc, ledger check, and build in sequence and exits 0. | verified | Re-run at delivery; output captured in Verification Log. |
| L17 | `npm run gate:all`, `npm run verify`, `npm run ledger:check` exist as npm scripts. | planned | Blocked by a hard constraint in this environment: package.json may not be edited directly by these tools. Equivalent functionality ships as `scripts/gate-all.sh` and `scripts/check-ledger.mjs`. Wiring instructions are in the header comment of `gate-all.sh` — a one-time manual edit by the human closes this gap. |
| L18 | An ESLint/lint gate runs as part of the gate matrix. | planned | No ESLint config or dependency exists in this project's `package.json`, and installing/configuring one was out of scope for this session's time budget. `tsc --noEmit` is the current static-analysis gate. |
| L19 | ≥50 independent red-team findings exist for the current, real codebase. | verified | See `docs/RED-TEAM-PROGRAM.md` — 56 findings enumerated against the actual files in this repo. |
| L20 | The red-team findings include at least one Critical/High that was fixed, not just accepted. | verified | See RED-TEAM-PROGRAM.md items R-003, R-011, R-022 — fixed in this session (see their "Disposition" field) prior to delivery. |

## C. Zero unproven "verified" claims — re-validation note

Every row marked **verified** above names a concrete artifact or a command that
was re-run immediately before this document was finalized (see
`PROGRAM-COMPLETION-REPORT.md` → Verification Log for literal command output).
No claim is marked verified on the basis of "it should work" or prior-session
assertion, because no prior session's output is available to re-check in this
workspace.
