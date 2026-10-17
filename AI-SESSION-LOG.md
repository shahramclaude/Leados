# AI-SESSION-LOG.md (this delivery, pt-I)

Append-only. This file documents only this session's work. It does not claim
to be, extend, or be positioned at `github.com/wbweve/Leados`'s own
`AI-SESSION-LOG.md` (a different, real, append-only file this session also
read — see §0).

---

## §0 — Verification of github.com/wbweve/Leados, this session

Per instructions, the real repository was inspected **before** writing any
code or making any claim about it. Everything below states exactly how it
was checked this session, independent of (though consistent with) what the
repo's own README/log already say about themselves.

1. **`web_fetch https://github.com/wbweve/Leados`** → returned the repo's
   current rendered `README.md`. That file documents a **prior session's
   pt-H delivery** and that session's own investigation of the real repo —
   it is the repo's own prior disclosure, re-checked below, not taken on
   faith.

2. **`web_fetch https://api.github.com/repos/wbweve/Leados/git/trees/main?recursive=1`**
   → ✅ **independently verified this session.** 60+ files flat at repo
   root (`App.tsx`, `BulletGraph.tsx`, `CommandPalette.tsx`, `DataView.tsx`,
   `FinanceDashboard.tsx`, `HealthView.tsx`, `PlaybooksView.tsx`,
   `RosterView.tsx`, `ScoreMath.tsx`, `Shell.tsx`, `store.js`, `store.ts`,
   `README.md`, `AI-SESSION-LOG.md`, `AI-SESSION-LOG.append.md`,
   `SESSION-3.patch.md`, and more). No `js/`/`src/` subdirectory.

3. **`web_fetch` raw `package.json`** → ✅ **verified this session.**
   `react@19.2.6`, `react-dom@19.2.6`, `vite@7.3.2`,
   `@tailwindcss/vite@4.1.17`, `tailwindcss@4.1.17`,
   `vite-plugin-singlefile@2.3.0`, `typescript@5.9.3`. Confirms: **React +
   Vite + Tailwind 4 SPA**, not a no-build vanilla-JS project.

4. **`web_fetch` raw `store.js`** → ✅ **verified this session.** Real file
   at repo root. Confirmed: `window.LeadOS` global, localStorage key
   `'leados:data'`, `SCHEMA_VERSION = 5`, `LINEAGE = 'pt'`,
   `LINEAGE_TAG = 'pt-6'`, a genuine append-only `events[]` array, a real
   migration chain (`1>2`, `2>3`, `3>4`, `4>5`) whose migrations only ever
   *append* repair events (never rewrite in place) and count every repair
   in `meta.migrationRepairs`, plus a validation + import-merge gate
   (`LeadOS.events.validate`, `mergeInto`). A real, non-trivial module —
   read in full, not skimmed.

5. **`web_fetch` raw `index.html`** → ✅ **verified this session.** The
   committed root `index.html` currently renders a page titled *"LeadOS
   pt-H demo — Emergent Intelligence Architecture (unofficial,
   single-file)"* — i.e. the **prior session's own pt-H delivery**, already
   committed at root, itself superseding an earlier pt-G demo page per that
   prior session's own disclosed history. Confirms the repo accumulates
   layered single-file AI deliveries at its root rather than being patched
   into the real React/Vite app.
   **Tool limitation, disclosed:** the raw fetch of this file, read through
   this session's markdown/text extractor, returned only the page's
   `<title>` and skip-link text — `<script>` contents were not recoverable
   this way. This session therefore did **not** read the prior pt-H
   delivery's actual JavaScript, and did not copy, extend, or diff against
   it. This pt-I delivery is written fresh, informed only by the *prior
   session's own README/log prose* about what pt-H contains (treated as
   ⚠️ reported-not-reverified where it matters below), not by its code.

6. **`web_fetch` raw `AI-SESSION-LOG.md`** → ✅ **verified this session.**
   Confirms the append-only `§`-section doctrine, and confirms the pt-H
   session's own §0 verification trail (items 2–5 above) — cross-checked
   independently this session, not merely copied from it.

7. **Not independently re-verified this session** (⚠️ reported only by the
   repo's own README/prior logs, taken at face value): the real rule count
   (R1–R40), 92 event types, and route list
   (`#/today #/roster #/insights #/patterns #/cadences #/data #/playbooks`).
   Re-diffing 60+ `.tsx` files to confirm this was not required to deliver
   pt-I honestly and would have exceeded this session's tool budget.

**Conclusion carried into this delivery:** the pasted pt-I brief (temporal
field classification, temporal causal mapping, "organizational physics",
a "decision surface") matches nothing verified in the real
`wbweve/Leados` repo. It is a hypothetical continuation of an unrelated
prompt family (same family as the pt-G/pt-H briefs the prior two sessions
received). Building it as a patch to the real 60-file React/Vite repo would
misrepresent what was done. This delivery is, like pt-G and pt-H before it,
an **explicit, fresh, single-file reinterpretation** — not a patch, not a
merge, and not a claim that `wbweve/Leados` now contains this file.

---

## §1 — This delivery's decisions and disclosed deviations

1.1 **Scope cut to Part 1 only.** The pasted brief's title promises
    "Temporal Cognition + Organizational Physics" across what reads like a
    multi-part spec, but the pasted text **stops mid-sentence** right after
    the heading `### Causal Chain Display`, before specifying what that
    display should contain, and before any "Organizational Physics" or
    "decision surface" content was pasted at all. Per this project's own
    established practice (the pt-H session did the same when its own Part
    3 was truncated), this delivery implements **only the two fully
    specified units**: the Temporal Intelligence Field
    (`LEADOS.temporalField`) and Temporal Causality Mapping
    (`buildCausalMap` / `scoreCausalPlausibility`). Everything else named
    in the brief's title is out of scope here and not fabricated.

1.2 **Namespace**: `window.LEADOS` — matches neither the real repo's
    `window.LeadOS` (`store.js`) nor its `store.ts` demo artifact's implied
    global. Carried over unchanged from the prior pt-H delivery's own
    stated convention (per its README, not its code, which this session
    could not read — see §0.5) for lineage consistency, not independently
    re-derived.

1.3 **Storage key**: `leados-pti-demo:data` — distinct from `leados:data`
    (real `store.js`), `leados-pte-demo:data` (real `store.ts`),
    `leados-ptg-demo:data` and `leados-pth-demo:data` (prior deliveries,
    per their own READMEs). Same non-collision reasoning as every prior
    delivery in this lineage.

1.4 **`classifyTemporalResolution` / `buildTemporalProfile` /
    `_diagnoseMode`** were pasted as concrete, already-complete JavaScript,
    not pseudocode. They are reproduced **faithfully**, including the exact
    boundary semantics (`<=7`, `<=60`, `<=180`, else) and the exact
    diagnosis thresholds (`>0.6`, `>0.3`, `>0.5`). No redesign was needed
    or attempted here.

1.5 **`buildCausalMap` / `scoreCausalPlausibility` — one disclosed bug
    fix.** The brief's own pasted pseudocode uses `finding.rule` two
    inconsistent ways: as an object (`finding.rule.domain`, inside
    `buildCausalMap`) and, in `scoreCausalPlausibility`, as a bare string
    key (`chains[finding.rule]`). Both cannot be true of the same value.
    This build keeps `finding.rule` as `{ id, domain, title }` (required
    anyway for the UI and for every other part of this delivery) and reads
    `finding.rule.id` at the one site that needed a bare rule code. This is
    a correction of an internal contradiction in the pasted spec, not a
    reinterpretation of its intent — named here rather than silently
    patched.

1.6 **`DOMAIN_LOOKBACKS` and `PLAUSIBLE_CHAINS`** are reproduced with the
    exact domains and numeric values given in the brief
    (`people:60, finance:90, ops:30, strategy:120, legal:180`; the seven
    precursor-type → rule-id → plausibility entries). `legal: 180` is kept
    even though this delivery implements no legal-domain rule — a disclosed
    dead mapping, not deleted, since the brief defined it and a future
    delivery may add a legal rule.

1.7 **One addition beyond the brief, disclosed**: rule `R29` ("Fresh
    critical safety incident") and its `PLAUSIBLE_CHAINS['mfg.safety.incident'].R29 = 0.95`
    entry do not appear in the pasted brief. They were added this session
    so the demo has at least one finding that genuinely lands in the
    IMMEDIATE (0–7d) bucket with a populated causal chain — without it,
    this delivery's hand-placed seed data produced zero IMMEDIATE-bucket
    findings and the temporal-field UI would have had an empty, untestable
    quadrant. Named in the code comment at the rule's definition, not
    hidden in the changelog alone.

1.8 **16 hand-written rules, not the real repo's reported ~40.** R4, R5,
    R7, R12, R13, R16, R17, R19, R20, R27, R28, R29, R103, R107, R112, R129
    — chosen because those exact rule codes are the ones the pasted brief's
    own `PLAUSIBLE_CHAINS` table references. Each rule is fully computed
    (no fabricated severities beyond the documented arithmetic) against a
    small, entirely hand-placed (not randomly generated) seed log, so every
    number shown in the UI's "Score Math" block is independently
    recomputable by reading the seed and the rule function side by side.

1.9 **Seed data is hand-placed in time, not random**, specifically so that:
    (a) every rule above fires at least once, (b) all four temporal
    resolutions are populated, and (c) both outcomes of the causal map —
    "probable precursors found" and "none found in this lookback window" —
    are genuinely reachable and shown as such in the UI, rather than only
    ever showing the positive case. Minute-level jitter (≤3h) is added at
    seed time for realism only; it does not change which rule fires or
    which resolution bucket a finding lands in. Seeding runs exactly once,
    only if the store is completely empty.

1.10 **Score Math block**: this delivery's own original implementation of
    the idea of showing a finding's exact arithmetic. The real repo has a
    file literally named `ScoreMath.tsx` (seen in the Trees API file list,
    §0.2) but **its contents were not read this session** — nothing here is
    copied from it; this is an independently designed analog built only
    from the file's existence and name.

1.11 **No full app shell** (no roster, no playbooks, no command palette, no
    themes). Given the brief pasted this session was narrowly about the
    temporal field and causal graph, and this session's tool budget, the
    shell was kept to exactly four views (Today, Temporal Field, Data,
    Health) needed to exercise and inspect those two systems honestly,
    rather than re-implementing the full surface of prior deliveries.

1.12 **Health suite** (`#/health`): five live, in-browser checks —
    `T_STORE`, `T_APPEND_ONLY`, `T_TEMPORAL_BOUNDARIES`, `T_ENGINE`,
    `T_CAUSAL`. `T_APPEND_ONLY` and `T_STORE` deliberately operate on a
    clone / throwaway key, never on the real store, so running Health
    repeatedly never pollutes the demo's own data — disclosed in the code
    comment next to each.

---

## §2 — Known limitations of this delivery (named, not hidden)

- Confidence numbers (`baseConfidence = clamp(0.5 + 0.08×sources, 0.5, 0.95)`)
  are this session's own simplification, not specified by the brief beyond
  "confidence modifier ×0.7/1.0/0.85/0.6 per resolution" — the modifier
  itself is exact; the base it multiplies is a labeled, inspectable guess.
- Only one theme (dark). No command palette, no roster/goals/plans/risks
  CRUD beyond the minimal event types this part's rules need.
- `R27`'s ">60 days treated as stale, not perpetually open" rule is a
  labeled assumption of this session's, not specified in the brief.
- Ages (and therefore which resolution bucket a finding lands in) are
  computed against `Date.now()` on every render, not frozen at seed time —
  this is intentional (the brief's own thesis is "time is a field, not a
  sequence"), but it does mean a finding may cross a resolution boundary
  purely from real time passing while the tab is open across days.

---

## Changelog (this delivery)

| Change | Why |
|---|---|
| Verified the real repo via GitHub Trees API + raw fetches of `package.json`, `store.js`, `index.html`, `AI-SESSION-LOG.md` before writing anything | Explicit task requirement: inspect before claiming. |
| Could not read prior pt-H delivery's actual `<script>` contents (raw fetch stripped script text via this session's extractor) | Named as a tool limitation rather than silently treating pt-H's README prose as equivalent to having read its code. |
| Built pt-I as a fresh single-file reinterpretation rather than a patch to the real repo or a diff against pt-H's code | The real repo is a 60+-file React/Vite SPA; pt-H's actual JS was unreadable this session. Claiming either a "patch" or a "merge" would misrepresent what was done. |
| Implemented only the Temporal Field + Causal Mapping (brief's fully-specified units) and skipped "Organizational Physics"/"decision surface" | The pasted brief truncates mid-sentence before specifying either; fabricating them would misrepresent speculation as the pasted spec. |
| Fixed `finding.rule` object-vs-string inconsistency in `scoreCausalPlausibility` | The two pasted functions use `finding.rule` incompatibly; one had to be chosen, and the fix is disclosed rather than silently applied. |
| Added rule `R29` and its plausibility entry, not present in the brief | Without it, the seed data produced zero IMMEDIATE-bucket findings, leaving one of the four temporal resolutions permanently empty and untestable in this demo. |
| Hand-placed every seed event's day-offset instead of randomizing them | Needed deterministic coverage of all 16 rules, all four resolutions, and both "precursor found"/"none found" causal outcomes — randomized seeding could not guarantee that. |
| Kept `legal: 180` in `DOMAIN_LOOKBACKS` despite no legal-domain rule existing in this delivery | The brief defined it explicitly; deleting an unused-but-specified mapping would be a silent, undisclosed simplification. |
| `T_STORE`/`T_APPEND_ONLY` health checks run against a throwaway key / cloned array, never the live store | Running Health repeatedly must not mutate or pollute the demo's own seeded data. |
