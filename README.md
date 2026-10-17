# LeadOS pt-N — Self-Documenting, Self-Remembering, Self-Improving Sandbox

A React + Vite + Tailwind app implementing the four modules described in this
task's pasted "pt-N — Final Unification Architecture" brief — a
self-documenting system, an institutional memory system, a self-improving
system, and adaptive onboarding — wired against a small, original leadership
event-log engine.

> **Provenance — read before assuming this continues `github.com/wbweve/Leados`
> or any prior "pt-K"/"pt-L"/"pt-M" session:** `github.com/wbweve/Leados` was
> inspected directly this session (GitHub's tree/contents REST API, the
> repo's own `AI-SESSION-LOG.md`, and direct reads of `src/lib/genome.ts` and
> `src/lib/memory.ts`) before writing any code. Full ledger in
> `AI-SESSION-LOG.md` and in-app at **Provenance / About**. Short version:
>
> * The real repo is **two different deliveries in one place**: loose
>   root-level files (including a hand-authored single-file `index.html`
>   demo) plus a separate, live Vite+React+TypeScript app under `src/`.
> * **Verified directly, this session:** `src/lib/genome.ts` and
>   `src/lib/memory.ts` exist, are small, and are *explicitly disclosed by
>   their own header comments* as original reinterpretations of an earlier
>   pasted brief's ideas — with call shapes (`identify(plans, directs)`,
>   `splitLayers(allEvents, sessionStartedAt)`) that do **not** match this
>   task's pt-N brief's imagined `LEADOS.genome.identify(P, today)` /
>   `LEADOS.memory.longTerm._computeDomainActivity(P)`.
> * **Not found anywhere in the real repo, this session:** any file or
>   export named `docs.ts`, `institutionalMemory.ts`, `selfImprove.ts`,
>   `onboarding.ts`, `calibrateRules.ts`, or `knowledge.ts` — confirmed via a
>   direct listing of all 23 files in `src/lib`.
> * Other facts about the repo (a live info-theory module, a broken
>   `intelligence.ts` import, no CAS engine or risk register) are **carried
>   forward from the repo's own prior session log**, read in full this
>   session, and are flagged as such rather than re-claimed as this
>   session's own byte-for-byte verification.
>
> **This app does not fork, copy, or continue any of that history.** It is a
> fresh build, in this task's own tool environment (React + Vite + Tailwind,
> single `src/App.tsx` entry point, built with `npm run build`), implementing
> only the *functional ideas* in the pasted pt-N brief — original code
> throughout, against an original and much smaller data model.

## Run it

`npm install && npm run build`, then open `dist/index.html`. `vite-plugin-singlefile`
inlines all JS/CSS into that one HTML file (verified this session by grepping
the build output — only inert XML/SVG namespace strings and a React-docs link
baked into minified error text were found, zero runtime network calls), so
the "open one file, zero network calls" property holds here too, produced by
a build step rather than hand-authored.

For development: `npm run dev`.

State lives in `localStorage` under `leados-ptn:v1`. Use **Reset all data**
on the Today tab to clear it, or **Load sample data** to populate a small
synthetic roster + event log for exploring every tab immediately.

## Tabs

| Tab | What it does |
|---|---|
| **Today** | Onboarding banner (auto-detected stage + next action), quick-capture form for 9 event types, and the live findings list (explain / run playbook / snooze / dismiss per finding). |
| **Roster** | Add people; prerequisite for every cadence/decision/crisis rule. |
| **Docs (self-generated)** | **Part 1.** A user guide generated live from your own data (your event counts, your top finding, your most-logged event types, the installed rule catalog) plus a human-readable changelog derived directly from the audit trail. |
| **Institutional Memory** | **Part 2.** Learnings extracted from `decision.outcome.lessons`, `crisis.postmortem.action_items`, and `reflection.logged.patterns`; a behavioral "genome" ratio heuristic; a quarterly learning timeline; and a successor-ready "transferable wisdom" filter that excludes personal-voice reflections. |
| **Self-Improve** | **Part 3.** Proposals computed from your own usage: cadence-threshold recalibration (actual average 1:1 interval vs. configured setting), unlogged event-type coverage gaps, a crude playbook-effectiveness proxy, and domain-neglect detection. Every proposal requires an explicit "Approve & apply" click — nothing changes automatically. |
| **Provenance / About** | The full verification ledger, in-app. |

## The rule engine (original, disclosed-fabricated)

Five rules, each producing a `Finding { rule, title, sev, conf, score, sources, basis, play? }`
with `score = sev × confidenceFactor`:

- **R1** — Overdue 1:1 (`oneonone.logged` older than `settings.cadenceDays`)
- **R2** — Overdue skip-level (`skip.logged` older than `settings.skipDays`) — **no playbook wired**, a disclosed gap mirroring the "no playbook" pattern the pt-N brief itself describes for its own R9
- **R3** — Decision open past threshold (`decision.made` with no matching `decision.outcome`)
- **R4** — Crisis without postmortem (`crisis.logged` with no matching `crisis.postmortem`)
- **R5** — Goal without owner (`goal.set` with no `data.owner`)

This is intentionally small. It exists only to give the four pt-N modules
real data to generate documentation, memory, and proposals from — it is not
a claim about the real repo's rule catalog (unverified — see provenance
section) or a reproduction of the pt-N brief's own imagined "9+ rule"
catalog.

## Project structure

```
src/
  lib/
    types.ts               — shared types (Person, AppEvent, Finding, Settings, ...)
    store.ts                — localStorage persistence + state mutations
    seed.ts                   — synthetic roster + synthetic event log (demo data)
    engine.ts                   — 5-rule findings engine (original, disclosed)
    docs.ts                        — Part 1: self-documenting system
    institutionalMemory.ts            — Part 2: institutional memory + genome heuristic
    selfImprove.ts                       — Part 3: self-improvement proposals
    onboarding.ts                           — Part 4: adaptive onboarding stage model
  components/
    Shell.tsx, ui.tsx                        — nav shell + shared UI primitives
    OnboardingBanner.tsx, TodayView.tsx,
    RosterView.tsx, DocsView.tsx,
    MemoryView.tsx, ImproveView.tsx,
    AboutView.tsx                              — per-tab views
  App.tsx                                        — composition root (entry point)
```

## Changelog

- **Inspected `github.com/wbweve/Leados` first** — via GitHub's tree/contents
  REST API, the repo's own `AI-SESSION-LOG.md`, and direct raw-file reads of
  `src/lib/genome.ts` and `src/lib/memory.ts` — before writing any code.
  *Why:* the task requires inspecting actual code, not trusting the pasted
  pt-N brief's own framing at face value.
- **Declared the pasted "pt-N" brief an unverified specification, not repo
  fact**, after confirming no file/export named `docs.ts`,
  `institutionalMemory.ts`, `selfImprove.ts`, `onboarding.ts`,
  `calibrateRules.ts`, or `knowledge.ts` exists in the real repo's `src/lib`,
  and that the two filenames that do exist and sound related (`genome.ts`,
  `memory.ts`) have different, smaller, explicitly-original signatures.
  *Why:* half-right claims are more dangerous than fully-wrong ones; this
  README and the in-app Provenance tab spell out exactly which parts are
  verified, carried-forward, or original.
- **Built a small original 5-rule engine instead of trying to reconstruct
  the pt-N brief's implied 9+ rule catalog verbatim.** *Why:* the brief's
  rule catalog was never defined anywhere in scope (not in the real repo, not
  fully in the brief itself beyond R1/R3/R4/R5/R9 being referenced
  implicitly) — inventing a large matching catalog would misattribute
  invented work to an external spec.
- **Left R2 (skip-level) without a playbook** — *why:* mirrors the brief's
  own disclosed "no playbook for R9" pattern; resolving gaps by pointing at
  real action (log the event) rather than fabricating a playbook just to
  look complete.
- **Modeled the "genome" behavioral heuristic on `src/lib/genome.ts`'s
  verified ratio-and-confidence idea, but reimplemented independently with a
  different signature** — *why:* the idea (ratio of two self-tagged
  behaviors, gated by sample size) is simple enough to be worth reusing
  conceptually; the real file's exact signature doesn't fit this app's event
  schema, so copying it would create a false sense of continuity.
- **Used a crude playbook-effectiveness proxy (current findings vs.
  completions) instead of a true longitudinal resolution-rate** — *why:*
  this build keeps no historical finding snapshots; claiming a resolution
  *rate over time* without that history would be fabricated precision.
- **Used a new storage key (`leados-ptn:v1`)** — *why:* this workspace began
  from the default Vite scaffold with no prior app state; reusing another
  session's key would assert a shared history that does not exist here.
- **Built as a React+Vite+Tailwind app (this task's required stack) instead
  of a hand-authored single HTML file** — *why:* this environment's entry
  point is `src/App.tsx`. The build still inlines everything into one
  `dist/index.html` with zero runtime network calls (verified by grepping
  the build output), so the end-user property the brief cares about ("open
  one file") holds anyway.
