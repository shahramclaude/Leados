# LEADOS — single-file sandbox rebuild

A standalone `index.html` (vanilla HTML/CSS/JS + Tailwind via CDN, no build
step, no network calls after load) implementing the functional ideas
described in `github.com/wbweve/Leados`'s README: a toggleable Signal Board,
an information-theory "Thermodynamics" panel, a small Complex Adaptive
Systems (CAS) engine, an 8-category Risk Register, and — new in this
delivery — a Leadership Scorecard (Resilience / Execution / Culture, star
ratings).

> **Provenance — read before assuming this ports or continues
> `github.com/wbweve/Leados`:** that repo was inspected directly this
> session (GitHub REST API file listings + raw-file fetches of `README.md`,
> `AI-SESSION-LOG.md`, root `index.html` title, `package.json`, `src/App.tsx`,
> and the `src/lib` directory listing). Full call-by-call ledger in
> [`AI-SESSION-LOG.md`](./AI-SESSION-LOG.md) and in-app at **About /
> Provenance**. Short version:
>
> - The real repo genuinely mixes **two deliveries**: ~30+ loose files at
>   root (mostly `.tsx`, plus several `.md` session logs and a root
>   `index.html`) and a separate, structured `src/` Vite+React+TypeScript
>   app. **[VERIFIED]**
> - `src/App.tsx`, read in full, really does import and route to
>   `TodayView`, `SignalBoardView`, `ThermodynamicsView`, `CasView`,
>   `RiskView`, `AboutView` — matching the current README's own page table.
>   **[VERIFIED]**
> - `src/lib/casEngine.ts` exists (6,628 bytes). **[VERIFIED]** — this
>   directly **contradicts** the repo's own on-disk `AI-SESSION-LOG.md`,
>   which claims no CAS-engine file exists anywhere in `src/lib`. That log
>   is stale relative to the current tree. **[CONTRADICTION, DISCLOSED]**
> - The actual line-by-line contents of `casEngine.ts`, `infoTheory.ts`,
>   `riskIntelligence.ts` were **not** read this session — only filenames
>   and byte sizes were confirmed. Whether they work as the README claims is
>   **[UNVERIFIED]** here.
> - A web-search cache turned up a *different*, older-looking README (flat
>   14-file vanilla-JS project) than what's live on `raw.githubusercontent.com`
>   right now. Treated as **[UNVERIFIED / LIKELY STALE]**, not used as fact.
>
> **This app does not fork, copy, or continue that repo's code.** It's a
> fresh, original build satisfying the same *functional ideas*, built for
> this tool environment, which only supports a single hand-authored
> `index.html` (no Vite/React build pipeline) — disclosed explicitly rather
> than implied away.

## Run it

Open `index.html` in any browser. No install, no build, no server. State
persists in `localStorage` under `leados-vanilla:v1`.

## Pages (tab-based, no routing library)

| Tab | What it does |
|---|---|
| Today | Overall risk score, active-finding count, entropy %, CAS loop/bifurcation counts, a Scorecard preview, scenario presets, and an in-browser self-test runner. |
| Signals | The Signal Board: 30 synthetic rule IDs across 8 categories, each toggleable with severity, optional person link, and a "recur x3" control for the attractor detector; plus a runway (months) slider. |
| Thermodynamics | Shannon entropy over a deterministic synthetic event log, a discretized mutual-information proxy between any two roster members, signal-to-noise ratio, and information bottlenecks (&lt;30% of mean activity). |
| CAS | Feedback loops (same person, two linked risk categories active), bifurcation points (runway &lt; 6 months, or any category's cumulative severity ≥ 10), and attractors (a rule recurring ≥3 times). |
| Risk | The 8-category Risk Register (always shows all 8, even at zero) and cross-category amplification flags. |
| Scorecard | RESILIENCE / EXECUTION / CULTURE star ratings. Resilience and Execution are computed live from the CAS/Risk panels; Culture is a disclosed manual input (see "why" below). |
| About / Provenance | The full verified-vs-unverified ledger from inspecting the real repo. |

## Leadership Scorecard — how each score is produced

- **RESILIENCE** = `5 − (active feedback loops + active bifurcations)`, clamped to 1–5. Computed live from the CAS engine.
- **EXECUTION** = `5 − floor(EXECUTION-category cumulative severity / 5)`, clamped to 1–5. Computed live from the Risk Register.
- **CULTURE** = a manual 1–5 slider, **not computed**. *Why:* the one disclosed gap I could directly verify in the real repo's current README is that "cultural bifurcation" depends on an undefined `scoreCulture()` that was never found anywhere. Inventing a culture-scoring formula here and presenting it as derived would misattribute provenance to that gap. A manual, clearly-labeled input was judged more honest than a fabricated metric.
- The app's **default demo data** was hand-chosen (one Avery signal in PEOPLE + one in EXECUTION → exactly one feedback loop; EXECUTION severity totalling 7 → one star off; culture slider left at its own default of 3) so that, on first load, the live formulas reproduce exactly RESILIENCE ★★★★☆ (4), EXECUTION ★★★★☆ (4), CULTURE ★★★☆☆ (3) — the ratings supplied in this task's prompt — without hardcoding the star counts themselves.

## What's original vs. modeled vs. a disclosed gap

- **Original, built from scratch (no verified source exists to copy):** the entire 30-rule catalog, the 8-category Risk Register logic, the CAS feedback-loop/bifurcation/attractor detectors, the Scorecard, the synthetic 5-person roster, the seeded deterministic event-log generator, and all UI.
- **Modeled on the *functional idea*, not the code, of a verified real-repo pattern:** the Thermodynamics panel's metric set (Shannon entropy, mutual information, SNR, bottlenecks) mirrors what the real repo's README claims its `infoTheory.ts`/`Thermodynamics.tsx` pair computes — standard 1948 Shannon formulas, reimplemented independently; the real file's internals were never read this session.
- **A gap, left as a gap:** no `scoreCulture()`-equivalent is computed. See Scorecard section above.

## Changelog

- **Inspected `github.com/wbweve/Leados` via GitHub's REST API and raw-file fetches before writing any code** — *why*: the task requires checking actual code/state, not trusting a README's self-description (which, per this inspection, is itself already internally inconsistent with the repo's own session log — see AI-SESSION-LOG.md §2, F5).
- **Found and disclosed a real contradiction inside the target repo** (its on-disk `AI-SESSION-LOG.md` says no CAS engine file exists; `src/lib/casEngine.ts` actually exists, 6,628 bytes) — *why disclosed prominently*: a half-right/stale claim is more misleading than an obviously-wrong one, and the task explicitly asked for inspection over assumption.
- **Flagged a web-search cache result as likely-stale rather than treating it as current fact** — *why*: it described a structurally different project (flat vanilla-JS "pt-3") than the live raw README fetched the same session; presenting both as equally true would hide a real discrepancy instead of surfacing it.
- **Built as a single hand-authored `index.html` (vanilla JS), not a port of the real repo's React/Vite `src/` app** — *why*: this tool environment only supports a single-file delivery; claiming a build pipeline here would misstate the environment, the same reasoning the inspected repo's own README uses for its own environment constraints.
- **Left CULTURE as a manual slider instead of computing it** — *why*: the only scoring-gap I could directly verify in the real repo's README text was the undefined `scoreCulture()`; computing a number under that name here would imply false provenance.
- **Tuned default demo signals (not hardcoded stars) to reproduce RESILIENCE 4 / EXECUTION 4 / CULTURE 3 on first load** — *why*: makes the requested scorecard numbers an observable consequence of the app's own formulas, so they stay honest if the user edits any signal afterward, rather than being a static image of those exact numbers.
- **Named the storage key `leados-vanilla:v1`** — *why*: distinct from any key used in the real repo's own `src/` app (unverified what key that app uses, since `store.ts` contents weren't read this session) or in prior pasted-brief lineages; avoids implying shared state continuity that doesn't exist.

## Files in this delivery

- `index.html` — the full app.
- `README.md` — this file.
- `AI-SESSION-LOG.md` — call-by-call ledger of what was fetched/verified from the real repo this session.
