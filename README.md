# LeadOS pt-I demo — Temporal Cognition, Part 1 only (single-file, unofficial)

> **This is not a patch to `github.com/wbweve/Leados`.** That repository was
> fetched and read directly this session (GitHub Trees API for the full file
> list, plus raw fetches of `package.json`, `store.js`, `index.html`, and
> `AI-SESSION-LOG.md`) before any code here was written. It is a **React 19 +
> Vite 7 + Tailwind 4** project (`vite-plugin-singlefile`) with 60+ files
> flat at the repo root — not the vanilla-JS, no-build architecture this
> delivery (and the two single-file deliveries before it, pt-G and pt-H)
> actually produce. The repo's own root `index.html` currently renders the
> **prior session's pt-H demo page** — evidence this repo accumulates
> layered single-file AI deliveries at its root rather than being patched in
> place. Full method and raw findings are in `AI-SESSION-LOG.md` §0. This
> delivery is a **fresh, self-contained, single-file reinterpretation** of
> only **Part 1** of the pasted pt-I brief — the brief's own text truncates
> mid-sentence right after "Causal Chain Display," before "Organizational
> Physics" or a "decision surface" (both named only in the brief's title)
> were ever specified, so neither is fabricated here.

## Run it

Open `index.html` in a browser. That's the install. One disclosed
exception, carried over from every prior delivery in this lineage: it loads
`@tailwindcss/browser` from `cdn.jsdelivr.net`, which is itself a CDN
dependency — a contradiction of this problem family's own repeated
"no CDN" instinct, same as every prior delivery.

## Files in this delivery

| File | Role |
|---|---|
| `index.html` | Everything: an append-only event store, 16 hand-computed finding rules across 5 domains, the Temporal Intelligence Field (`LEADOS.temporalField`), Temporal Causality Mapping (`LEADOS.causality`), a 4-view UI (Today / Temporal Field / Data / Health), and a live health suite — all in one file. |
| `README.md` | This file. |
| `AI-SESSION-LOG.md` | Append-only log of what was verified about the real `wbweve/Leados` repo this session, and every disclosed decision/deviation in this delivery. |

## What this is / isn't

- **Is**: a working single-file demo of **Part 1 only** of the pasted pt-I
  brief — a temporal-resolution classifier that buckets every computed
  finding into IMMEDIATE (0–7d) / OPERATIONAL (7–60d) / STRATEGIC (60–180d)
  / STRUCTURAL (180d+), diagnoses the organization's overall temporal "mode"
  from the resulting proportions (`REACTIVE` / `STRUCTURAL_STRESS` /
  `STRATEGIC_DRIFT` / `BALANCED`), and a causal-precedence mapper that, for
  each finding, looks backward through a domain-sized lookback window for
  plausible precursor events using a small, hard-coded plausibility table —
  explicitly labeled throughout as temporal correlation with a domain
  heuristic, **not** statistical causation.
- **Is not**: the brief's full system (Organizational Physics and the
  "decision surface" named in the brief's title were never pasted in enough
  detail to implement — see `AI-SESSION-LOG.md` §1.1), a PWA, a patch to the
  real `wbweve/Leados` repo, or a diff/merge against the prior pt-H
  delivery's actual code (this session could not recover pt-H's `<script>`
  contents through its fetch tooling — see `AI-SESSION-LOG.md` §0.5).

## Verified vs. fabricated, at a glance

| Claim | Status |
|---|---|
| `github.com/wbweve/Leados` exists; 60+ files, all at repo root, no `js/`/`src/` | ✅ verified this session (GitHub Trees API) |
| Real stack is React 19 + Vite 7 + Tailwind 4 + `vite-plugin-singlefile` | ✅ verified this session (read `package.json` directly) |
| Real `store.js` uses `window.LeadOS`, key `'leados:data'`, `SCHEMA_VERSION=5`, `LINEAGE_TAG='pt-6'`, a real append-only migration chain | ✅ verified this session (read `store.js` directly) |
| Repo's root `index.html` currently renders the prior session's "pt-H demo" page | ✅ verified this session (raw fetch; page `<title>` matched) |
| Prior pt-H delivery's actual `<script>` / rule set / internals | ⚠️ **not read this session** — this session's fetch tool returned only that page's title/skip-link text for a script-heavy single file; only the prior session's own README/log prose about pt-H was available, and is treated as unverified-by-this-session where cited |
| Real rule count (R1–R40), 92 event types, route list | ⚠️ reported by the repo's own README/logs — not independently re-verified this session |
| Pasted pt-I brief's Temporal Field + Causal Mapping | ✅ implemented this session, faithfully where the brief gave concrete code, with one disclosed bug fix (see below) |
| Pasted pt-I brief's "Organizational Physics" / "decision surface" | ❌ not implemented — the pasted brief never specified either before cutting off mid-sentence |
| This delivery's 16 rules, ~39 seeded events, 5 domains | ⚠️ fabricated for this demo, hand-placed in time (not random), seeded once on first load |

## Implemented from the pasted brief (this delivery)

- **Temporal Intelligence Field** (`LEADOS.temporalField`): `classifyTemporalResolution` buckets every finding by the age of its *oldest* source event into IMMEDIATE / OPERATIONAL / STRATEGIC / STRUCTURAL using the brief's own exact day cutoffs (`≤7`, `≤60`, `≤180`, else); `buildTemporalProfile` computes counts/percentages/mean-severity per bucket and calls `_diagnoseMode`, reproduced from the brief's own concrete code (not redesigned) with its exact thresholds (`>60%` → `REACTIVE`, `>30%` structural → `STRUCTURAL_STRESS`, `>50%` strategic → `STRATEGIC_DRIFT`, else `BALANCED`).
- **Temporal Causality Mapping** (`LEADOS.causality`): `buildCausalMap` looks backward from each finding's *most recent* source event through a domain-sized lookback window (`people:60, finance:90, ops:30, strategy:120, legal:180` — exact brief values) for other events not already counted as that finding's own source; `scoreCausalPlausibility` scores each candidate against a hard-coded precursor-type → rule → plausibility table (reproduced with the brief's exact seven entries, plus one disclosed addition — see below), keeps the top 3, and is displayed per finding with event, lag in days, and a plausibility bar — explicitly captioned as a heuristic, not causation.
- **Causal Chain Display**: the brief's text cuts off right after this heading with no further spec. This delivery's own completion (disclosed as such) renders it in the finding detail view, directly below a from-scratch "Score Math" block that prints the exact arithmetic behind every finding's severity.
- **16-rule finding engine**, computed live from the event log: R4, R5, R7 (people) · R12, R13, R20 (strategy) · R16, R17, R27, R28, R29 (ops) · R103, R107, R112 (finance) · R129 (people). Every rule's severity is arithmetic shown verbatim in its "Score Math" block — nothing is a display-only fabricated number.
- **Health suite** (`#/health`): `T_STORE`, `T_APPEND_ONLY`, `T_TEMPORAL_BOUNDARIES`, `T_ENGINE`, `T_CAUSAL` — live, in-browser, no external runner, and non-destructive (the store/append checks run on a throwaway key / cloned array).

## Disclosed gaps and one bug fix (named, not hidden — full detail in `AI-SESSION-LOG.md` §1)

- The brief's own pseudocode used `finding.rule` inconsistently (as an object in one function, a bare string key in the next). Fixed by keeping it as an object everywhere and reading `finding.rule.id` where a bare code was needed — named in both the code comment and the log, not silently patched.
- Rule `R29` and its `mfg.safety.incident → R29: 0.95` plausibility entry are **not in the pasted brief** — added this session because, without them, the hand-placed seed data produced zero findings in the IMMEDIATE (0–7d) bucket, leaving one of the four temporal resolutions permanently empty in the UI.
- `legal: 180` remains in `DOMAIN_LOOKBACKS` even though no legal-domain rule exists in this delivery — the brief specified it; removing an unused-but-specified value would be an undisclosed simplification.
- No roster, playbooks, command palette, or themes in this delivery — scope was kept to exactly what's needed to exercise the Temporal Field and Causal Map honestly, per this session's tool budget.
- Confidence = `baseConfidence × resolution modifier`. The modifier (0.7 / 1.0 / 0.85 / 0.6) is exactly the brief's. `baseConfidence` itself (`clamp(0.5 + 0.08×sources, 0.5, 0.95)`) is this session's own labeled simplification — the brief specified the modifier, not the base.

## The non-negotiables, as applied here

- All state in `localStorage` under one key, `leados-pti-demo:data` — deliberately distinct from the real repo's `leados:data`, the real repo's second `store.ts` artifact's `leados-pte-demo:data`, and the prior `leados-ptg-demo:data` / `leados-pth-demo:data` delivery keys, so this demo can never collide with any of them on the same origin.
- The event log (`events[]`) is append-only; nothing is rewritten in place. The live `append()` path always stamps "now"; only the one-time seed script may backdate timestamps, and it is clearly separated (`appendAt`) and marks every seeded event `meta.seeded: true`.
- Every finding's severity shows its exact arithmetic in a "Score Math" block. Every causal-chain entry shows its real computed lag and plausibility score, including when the answer is "no probable precursors found" — that negative result is rendered, not hidden.
- `#/health` runs live checks in the browser and is the authority if it ever disagrees with this document.

---

## Changelog (this delivery)

| Change | Why |
|---|---|
| Verified the real repo via GitHub Trees API + raw fetches of `package.json`, `store.js`, `index.html`, `AI-SESSION-LOG.md` before writing anything | Task requires inspecting actual code before claiming anything about it. |
| Disclosed that this session's fetch tooling could not recover the prior pt-H delivery's actual `<script>` contents (only page title/text) | Reporting a tool limitation honestly is better than silently treating a prior session's README prose as equivalent to having read its code. |
| Implemented only the Temporal Field + Causal Mapping, not "Organizational Physics" or a "decision surface" | The pasted brief's title names both, but its pasted text cuts off mid-sentence before specifying either. |
| Fixed the brief's own `finding.rule` object-vs-string inconsistency between its two pasted functions | One behavior had to be chosen to make the code run; disclosing the fix is more honest than silently picking one. |
| Added rule `R29` (and its plausibility entry) beyond the brief | The brief's referenced rule set otherwise produced zero IMMEDIATE-bucket findings against any seed, leaving a core UI quadrant permanently empty. |
| Hand-placed every seed event's time offset instead of randomizing | Needed deterministic, inspectable coverage of all 16 rules, all 4 temporal resolutions, and both outcomes ("found"/"not found") of the causal map. |
| Kept `legal: 180` in `DOMAIN_LOOKBACKS` with no legal rule implemented | The brief specified it explicitly; silently deleting unused-but-specified data would misrepresent fidelity to the source. |
| Reduced the app shell to 4 views (Today / Temporal Field / Data / Health), dropping roster/playbooks/command-palette/themes from prior deliveries | This brief is narrowly about two subsystems; reimplementing the full prior surface would not fit this session's tool-call budget — named rather than silently omitted. |
| `T_STORE` / `T_APPEND_ONLY` health checks use a throwaway key / cloned array, never the live store | Running Health repeatedly must never mutate or pollute the demo's own seeded data. |
