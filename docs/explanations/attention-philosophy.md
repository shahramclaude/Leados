# Attention Philosophy

## The design principle, as actually implemented

The dashboard (`src/app/page.tsx`) is built around one rule: **never show a score without showing the
evidence next to it.** Concretely:

1. The leads table shows `score` and `band` as adjacent columns, not a single opaque number
   (`src/app/page.tsx`, leads table section).
2. Directly below the leads table, the "Evidence ledger" section always renders the most recent automated
   decisions, in plain language, sourced from the same `decisions.summary` field used everywhere else in
   the system (`src/app/page.tsx`, evidence ledger section; `docs/EVIDENCE-LEDGER.md`).
3. There is no separate "explain this score" button or modal — the explanation is always visible, not
   something the user has to ask for. This was a deliberate choice: since the scoring engine is fully
   transparent by construction (`docs/explanations/intelligence-methodology.md`), hiding the explanation
   behind an extra click would contradict the point of using a transparent scorer in the first place.

## What this philosophy explicitly does not yet cover

- **No prioritization/triage view.** The dashboard lists all leads in creation order; it does not sort or
  highlight "leads needing attention first" (e.g. lowest-confidence scores, or leads with no rep assigned
  yet). This would be a natural next step but is not built.
- **No per-lead detail page.** Clicking a lead does nothing today; the evidence ledger is tenant-wide, not
  filterable by lead, from the UI (it is filterable by lead at the data level — `decisions.lead_id` — just
  not exposed as a UI filter).
- **No visual distinction for "stale" or "never scored" leads** beyond the literal text "not scored" in the
  score column.

## Why this is in `docs/explanations/`, not a UI spec

This document explains the *reasoning* behind the one layout decision that exists, so that whoever builds
the next dashboard iteration understands the constraint to preserve ("evidence stays adjacent to score"),
not a prescriptive design system (see `docs/DESIGN-SYSTEM.md`, which is an honest stub).
