# LEADOS — Autonomous Workflow Engine (sandbox, Part 2)

A single-file `index.html` implementing this task's **"Part 2: The Automated
Workflow Engine"** specification — six bounded, auditable autonomous
workflows (`LEADOS.autonomous`) and a persistent work queue
(`LEADOS.workQueue`) — on top of a small, original "Part 1" foundation built
only so the engine has real data and a real UI to operate on.

> **Provenance — read before assuming this continues `github.com/wbweve/Leados`:**
> that repo was inspected directly this session (its rendered GitHub page, its
> file tree via GitHub's REST API, and its own `AI-SESSION-LOG.md`, all fetched
> live). Full ledger in `AI-SESSION-LOG.md`, short version here, in-app at
> **About / Provenance**:
>
> * The real repo's own README describes a **React + Vite + TypeScript** app
>   (`src/App.tsx` entry point) — not a hand-authored single HTML file.
> * The real repo's own prior session log confirms a real, wired
>   `infoTheory.ts` module, but explicitly found **no CAS engine, no risk
>   register, and no trace** of that session's own pasted "pt-L" brief
>   anywhere in the repo — and treats such pasted briefs as **unverified
>   specifications**, not repo fact.
> * Whether this task's own pasted `LEADOS.autonomous` code exists anywhere in
>   the real repo **could not be checked** (GitHub code search required
>   sign-in, which this session didn't have) — **labeled unverified**, not
>   claimed either way.
>
> **This file does not fork, copy, or continue any code read from that repo.**
> It is a fresh, original build implementing only the *functional spec*
> pasted into this task.

## Run it

Open `index.html` in a browser. No build step, no network calls beyond the
Tailwind CDN `<script>` tag. State lives in `localStorage` under
`leados:autonomous-sandbox:v1`. Use **Reset data** (top-right) to clear it.

## What's actually in this file

### Part 1 (minimal, original — built only to give Part 2 something real to run on)
- A synthetic 5-person roster, event log, and open commitments.
- `LEADOS.store` — localStorage persistence + a live audit log.
- `LEADOS.engine` — 8 small rule-based findings (R1, R8, R10, R30, R39, R86, R88, R106: overdue 1:1s/skip-levels/team reviews/OKR check-ins/perf reviews, attrition risk, trust-collapse signal, runway-critical).
- `LEADOS.ambient`, `LEADOS.predict`, `LEADOS.decisions`, `LEADOS.playbooks`, `LEADOS.riskIntelligence`, `LEADOS.narrative`, `LEADOS.nlg` — small original implementations satisfying the function signatures Part 2 calls into.

### Part 2 (the actual deliverable for this task)
- `LEADOS.autonomous.WORKFLOWS` — WF-001…WF-006, implemented from the pasted
  spec as close to verbatim as possible (see **Disclosed fixes** below).
- `LEADOS.autonomous.runWorkflows(P, today, triggers, newFindings)`.
- `LEADOS.workQueue` — `add` / `accept` / `dismiss` / `pending`, exactly as
  pasted, persisted in `state.meta.workQueue`, capped at 20 items.
- A **Today** view with an "Autonomous Work Queue" section: every workflow
  result is rendered as a labeled card with its own action buttons (accept,
  regenerate, dismiss) — nothing fires silently.
- Manual trigger buttons stand in for a real scheduler (a browser tab has no
  cron): "run session-start check," "run weekly/temporal check," "simulate
  incoming critical finding."

## Boundaries (enforced in code, not just copy)

1. Never appends events without explicit user confirmation — the engine only
   ever *returns* work-product objects; nothing is written to `events` by any
   workflow.
2. Never makes decisions — only `LEADOS.workQueue.accept()`, triggered by a
   user clicking a button, changes an item's status.
3. Never sends communications — all playbook output opens in a modal headed
   "Not sent. Not saved as a decision."
4. Never overrides a user's previous decision — `accept`/`dismiss` only ever
   apply to the specific work-queue item clicked.
5. All automated work products are labeled — every card shows its workflow
   ID, status, and an amber "auto-generated" label; every draft modal repeats
   the disclaimer.
6. Every autonomous action is auditable and reversible — `LEADOS.store.auditLive`
   logs every workflow execution, acceptance, dismissal, and setting change;
   the Today view's Audit Trail panel shows the live log.

## Pages (hash routes)

| Route | What it does |
|---|---|
| `#/today` | Snapshot counters, boundaries panel, manual workflow triggers, the Autonomous Work Queue, queue history, audit trail. |
| `#/findings` | Live list of the 8 synthetic rule findings, each with a "Draft response" button into the matching playbook. |
| `#/risk` | The 8-category risk register (always shows all 8, even at zero), via `LEADOS.riskIntelligence.buildRiskRegister`. |
| `#/settings` | Edit cadence thresholds, runway, trust-collapse flag, and per-person flight-risk flag — feeds the findings engine and WF-006's drift detector live. |
| `#/about` | Full provenance ledger — what was checked against the real repo, what was found, and what's labeled unverified. |

## Changelog

- **Inspected `github.com/wbweve/Leados` first** (rendered README, GitHub REST API file tree, raw `AI-SESSION-LOG.md`, raw root `index.html`) before writing any code — *why*: the task requires inspecting actual code, not trusting either the README's self-framing or the task prompt's own pasted spec at face value.
- **Attempted but could not verify** whether the pasted `LEADOS.autonomous` code exists in the real repo (GitHub code search required sign-in) — *why disclosed*: an inconclusive check is not the same as a confirmed absence; both the log and this README say so explicitly instead of implying a cleaner finding than was actually obtained.
- **Built an original, minimal "Part 1" foundation from scratch** instead of inventing a plausible-sounding reconstruction of a prior session's Part 1 — *why*: this workspace started empty (verified: `index.html`, `README.md`, `AI-SESSION-LOG.md` all failed to read before this session wrote them); claiming continuity with an inaccessible prior session would be the same provenance error the real repo's own sessions have repeatedly flagged in each other.
- **Fixed `runWorkflows` to forward a `newFindings` argument** — *why*: the pasted `WF-003.execute(P, today, newFindings)` needs a third argument the pasted `runWorkflows` never supplied; without this, WF-003 would be permanently dead code.
- **Added a Monday-only gate for `WF-001`'s `MONDAY_07:00_LOCAL` schedule** — *why*: the pasted `runWorkflows` never reads the `schedule` field, which would make a "weekly Monday digest" fire on any day; the minimal fix makes the field's own stated contract true. `WF-005`'s `BOARD_MEETING_MINUS_14_DAYS` was left ungated at the `runWorkflows` level, exactly as pasted, since its date-window check already lives inside `execute()`.
- **Implemented `generateBoardAlert`, `computeResponseDeadline`, `computeFiveThingsThatMatter`, `detectCadenceDrift` from scratch** — *why*: referenced by name in the pasted spec but never defined in it; same convention the real repo's own sessions used for their own undefined dependencies (e.g. `scoreCulture()`), disclosed rather than silently invented.
- **Added manual "run workflow" buttons instead of a real scheduler** — *why*: a static HTML file in a browser tab has no cron/background clock; the buttons make each workflow's `trigger`/`schedule` metadata demonstrably exercisable instead of inert decoration.
- **Used a new storage key (`leados:autonomous-sandbox:v1`)** — *why*: no prior session's state is accessible from this workspace, so claiming continuity with any other key would assert a shared history that doesn't exist here.
