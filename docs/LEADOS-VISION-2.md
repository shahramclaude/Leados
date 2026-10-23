# LEADOS Vision 2 — Completed-Session Document

> **Honesty note on scope.** This document was commissioned as "Part 57 of 58,"
> the closing chapter of a 58-part program. No prior parts exist in this
> workspace — there is no `docs/` history, no `AI-SESSION-LOG.md` trail, no
> earlier `RED-TEAM` or `EVIDENCE-LEDGER` to build on. Rather than invent that
> history, this document describes **what was actually built in this single
> session** and is honest about the gap between the brief's framing and reality.
> Treat this as Vision v1 for a real, working first build — not v2 of a program
> that, in this repository, does not yet have a v1.

---

## 1. What LEADOS **is** (ledger-traceable)

LEADOS, as delivered here, is a client-side React/TypeScript/Tailwind
application — a single coherent UI — demonstrating a specific **design
philosophy** for AI-assisted leadership tools, implemented as 17 working
modules. Every "is" claim below is traceable to `docs/EVIDENCE-LEDGER.md`:

- A dashboard that routes decisions to a human, not around one (`Dashboard`,
  `EthicsFlags`).
- A conversational surface whose actions cannot skip the Draft → Review →
  Commit gate (`ConversationalAssistant`).
- A proactive-communication system with a hard, finite daily attention budget
  that nothing in the code can silently exceed (`ProactiveDrafts`,
  `AppStateContext`).
- A collective-intelligence view that structurally cannot collapse dissent
  into a single number (`CollectiveIntelligence`).
- A reorg-planning tool that cannot show a savings number without a Human
  Impact Ledger beside it on the same screen (`ReorgSimulator`).
- A recommender that shows its own lint failures instead of hiding them
  (`Recommender`).
- A single Algorithm Registry that is the one place every scoring mechanism
  referenced anywhere in the product must be listed (`AlgorithmRegistry`).
- A crisis mode that is one state flip with a coherent, observable, whole-UI
  effect (`AppStateContext.crisisMode`).
- A self-documenting Evidence Ledger, in two forms (doc + live UI), that
  separates verified fact from simulated demo from planned-but-not-built.

What LEADOS is **not**, today: a product with a backend, a database, auth,
real users, real integrations, or any live AI model call. It is a fully
honest, fully interactive specification of a pattern — built to be extended,
not mistaken for a finished SaaS product.

## 2. What LEADOS **is not** — the dignity boundaries

Three boundaries are the non-negotiable spine of this product, independent of
any future feature pressure:

### Boundary 1 — It serves human judgment, never replaces it
**Guarded today by:** the Draft → Review → Commit gate in
`ConversationalAssistant.tsx` (no state transition skips a step); the
human-confirmation checkbox gating "Finalize" in `LegalDrafts.tsx`; the
refusal of `ReorgSimulator` to execute anything — it only produces numbers for
a conversation a human must have.
**Most at risk from:** future "autopilot" feature requests that frame
themselves as convenience ("just auto-send the routine ones"). See R-020,
R-021 in the red team — these are explicitly flagged as the most important
seams to re-verify before any real send capability is added.

### Boundary 2 — It measures systems, never people-as-output
**Guarded today by:** `Coaching.tsx`'s explicit data-wall banner and the
absence of any code path reading coaching reflections into an evaluation
flow; `LeaderState.tsx` and `TimeAnalytics.tsx` being rendered as self-scoped
with no sharing UI at all.
**Most at risk from:** a manager-dashboard feature that "just aggregates"
individual leader-state or time-allocation data "for visibility." This is the
single dignity boundary most exposed to future erosion, because the pressure
to build it will look reasonable each time ("just one rollup report") and the
current code has **no runtime assertion** stopping it — only the absence of a
wired code path (see R-025, R-027). The guard that exists today is
*structural omission*, not an enforced control. That is a real weakness, named
plainly rather than hidden.

### Boundary 3 — It adapts form, never substance
**Guarded today by:** `SpatialView.tsx`'s single shared `orgTree` data source
feeding two renderers (spatial tree, semantic list) — the data a user sees
cannot diverge based on which view they pick; Crisis Mode changes navigation
and framing, never the underlying ethics-case or board-readiness data itself.
**Most at risk from:** a future "personalized" or "simplified" view feature
that quietly drops fields for some users/roles under the banner of
"decluttering," which is a content change disguised as a form change.

## 3. The next decade of work (ranked roadmap, honest estimates)

Estimates are rough order-of-magnitude for a small team, not commitments.

| Rank | Work | Why it's next | Rough estimate |
|---|---|---|---|
| 1 | CI pipeline running `gate-all.sh` on every PR (R-044) | Zero governance value in a gate matrix nobody is forced to run | 1–2 days |
| 2 | Server-side enforcement of the attention budget and commit gates (R-020, R-021, R-023) | The dignity boundaries are currently UI-only; a backend bypass would be invisible today | 3–6 weeks |
| 3 | Automated "coaching data wall" test — a CI check that fails the build if any evaluation-flow import reaches coaching data (R-025) | Turns boundary 2 from "nobody built the bad path yet" into "the bad path cannot merge" | 1 week |
| 4 | Real authentication + tenancy model (R-006, R-042, R-043) | Required before any second real user can touch this | 6–10 weeks |
| 5 | Replace scripted assistant with a real LLM integration, kept behind the existing gate state machine unchanged (R-014) | The single highest user-value change, made safe by boundary 1's existing scaffolding | 4–8 weeks |
| 6 | Governance-capture fix: a lint/codegen rule requiring a registry row for any new score/rank/confidence field (R-048) | Prevents the Algorithm Registry from silently going stale | 1–2 weeks |
| 7 | Accessibility and i18n pass (R-018, R-034, R-054–R-056) | Table-stakes for any executive audience outside one locale | 3–4 weeks |
| 8 | Persistence layer + undo/audit trail for every gated action | Needed before any of this is more than a session-scoped demo | 4–6 weeks |
| 9 | Human Impact Ledger extended with real HR-system data instead of modeled constants (R-009) | Converts a demonstration into something a real HR leader could trust | 6–8 weeks |
| 10 | Dissent-preservation UX for "no dissent was ever collected" vs "everyone agreed" (R-029) | Closes a subtle honesty gap identified by the red team | 1 week |

## 4. The philosophy, for two audiences

**For the board:** This product is built on a bet that the next decade of
"AI for leadership" fails if it optimizes for autonomy instead of trust. Every
feature here is designed so that a skeptical, time-poor executive can verify
in seconds what the system did and did not do on their behalf — because the
single greatest commercial risk to this category is a leader who stops
believing the tool, not a leader who finds it too slow.

**For engineering:** Every "AI feature" in this codebase is a state machine
with an explicit terminal gate, not a function that returns a result and an
action in one step. If you are adding a feature that writes, sends, ranks, or
scores a person, your first commit should be a row in `AlgorithmRegistry` and
a row in `EvidenceLedgerView` — not the feature itself. Code review should
reject any PR that automates a commit-worthy action without a reviewable gate
state visible in the UI.

## 5. Risk acceptance register (ties to Red Team disposition)

Critical/High findings not fixed in this session, with explicit rationale:

| Finding | Why accepted now, not fixed | Owner's next move |
|---|---|---|
| R-006 No auth | Out of scope for a client-only demo; fixing it here would be theater without a real backend to protect | Build real auth before any real data touches this app |
| R-020/R-021 UI-only gates | Correctly flags that gates must be re-implemented server-side before any real send/commit capability ships | Treat as a blocking requirement in the roadmap item #2 above, not a "nice to have" |
| R-027 LeaderState surveillance risk | The dignity boundary is named and watched, not yet enforced in code | Build the automated wall-test (roadmap #3) before adding any manager-facing rollup |
| R-052 Promotion model trained on skewed data, still listed as usable | Registry's job is honest disclosure, not silent deletion — but disclosure alone is insufficient operational control | Add a workflow block tied to registry `evidenceClass: planned` rows, not just a visible warning label |
