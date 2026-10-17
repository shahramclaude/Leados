# AI Session Log — LEADOS Part 4 (Signal Hierarchy) + Part 5 (Local API)

This log records exactly what was fetched, exactly what it said, and exactly
what was *not* checked, before any line of `index.html` was written. The rule
followed: inspect actual code before claiming anything about it; anything not
directly fetched this session is labeled unverified.

## 1. Method

Three direct fetches against the real `github.com/wbweve/Leados` repository,
in this order:

1. `GET https://github.com/wbweve/Leados` (rendered page / README)
2. `GET https://api.github.com/repos/wbweve/Leados/git/trees/main?recursive=1` (file tree)
3. `GET https://raw.githubusercontent.com/wbweve/Leados/main/store.js` (raw source)
4. `GET https://raw.githubusercontent.com/wbweve/Leados/main/engine.js` (raw source)
5. `GET https://raw.githubusercontent.com/wbweve/Leados/main/package.json` (raw source)

A web search for `signalQueue`, `BroadcastChannel`, `localAPI` scoped to the
repo was also run; it returned no repo-specific hits (only generic
BroadcastChannel documentation unrelated to this repo), which is weak
negative evidence at best and is treated that way below, not as proof.

## 2. Raw findings (verbatim facts, this session)

**package.json** — real, fetched directly:
- `name: "react-vite-tailwind"`, `type: "module"`
- deps: `react@19.2.6`, `react-dom@19.2.6`, `clsx@2.1.1`, `tailwind-merge@3.4.0`
- devDeps: `vite@7.3.2`, `@vitejs/plugin-react@5.1.1`, `tailwindcss@4.1.17`,
  `@tailwindcss/vite@4.1.17`, `typescript@5.9.3`, `vite-plugin-singlefile@2.3.0`
- **Conclusion:** the real repo is a React 19 + Vite 7 + Tailwind 4 project
  that builds to a single file via `vite-plugin-singlefile`. It is **not**
  a hand-written `index.html` — that is this delivery's own, disclosed,
  structural departure.

**Repo file tree** (GitHub Trees API, recursive) — confirmed to contain, among
others: `AI-SESSION-LOG.md`, `AI-SESSION-LOG.append.md`, `SESSION-3.patch.md`,
`README.md`, `store.js`, `engine.js`, and roughly 30+ `.tsx` files (`App.tsx`,
`CommandPalette.tsx`, `DataView.tsx`, `HealthView.tsx`, `IntelligenceView.tsx`,
`Heatmap.tsx`, `Network.tsx`, `ScoreMath.tsx`, etc.).
**Caveat:** the raw tool response was truncated mid-alphabet, at
`ScoreMath.tsx`. The remainder of the tree (alphabetically after `Score*`,
e.g. any `SettingsView.tsx`, `ToastView.tsx`, `TodayView.tsx` that may exist)
was **not** re-fetched or confirmed this session. Absence of
`signals.js`/`api.js`/`notifications.js`-style filenames in the *visible*
portion of the tree is not proof those concepts don't exist elsewhere in the
~40-file tree.

**store.js** (raw, fetched in full) — confirmed:
- Real namespace is `window.LeadOS` (capital L, lowercase "ead", capital OS) —
  **not** `LEADOS` as this session's brief writes it throughout.
- Real persistence key is `'leados:data'` (not `leados-decision-surface:data`,
  not `leados-signals-api:data` — both of those are this delivery's own,
  deliberately distinct keys; see §4).
- `schemaVersion: 5`, `lineage: 'pt'`, `LINEAGE_TAG: 'pt-6'`.
- Confirmed settings and their real defaults: `decisionMaxOpenDays: 21` (v1),
  `krCheckInCadenceDays: 7` (v2), `riskReviewCadenceDays: 7` (v3),
  `salesCycleDays: 90, revenueReviewCadenceDays: 30, opsReviewCadenceDays: 14,
  boardCadenceDays: 90, complianceAuditCadenceDays: 180` (v4),
  `correlationWindowDays: 90, trendMinPeriods: 3, heatmapDecayFactor: 0.85` (v5).
- Real event-log doctrine confirmed in code: append-only, migrations may only
  *append* repair events, every repair counted in `meta.migrationRepairs`, a
  corrupt store is refused rather than silently rewritten, and there is a
  real `mergeInto()` import gate with id-rewiring and dangling-reference
  detection.
- **No** mention anywhere in this file of signals/toasts/banners/notification
  levels, `BroadcastChannel`, or a local API.

**engine.js** (raw, fetched — the fetch tool itself reported the response as
truncated, roughly 9,000 tokens were cut from the middle; treat this as a
**partial read**, not a full-file read):
- Confirmed real event types folded by the engine across ~15 domains,
  including (verbatim, as fetched): `fin.budget.set`, `fin.risk.logged`,
  `sales.deal.logged`, `product.roadmap.item`, `strategy.okr.set`,
  `ops.incident.logged`, `hr.pip.started`, `mktg.campaign.logged`,
  `mfg.quality.logged`, `supply.vendor.logged`, `design.review.logged`,
  `rd.experiment.logged`, `legal.contract.logged`, `cs.escalation.logged`,
  `exec.board.meeting`, **`exec.crisis.logged`**, **`exec.crisis.resolved`**,
  `note.added`, and the pt-5 intelligence-layer events `insight.acknowledged`,
  `benchmark.set`, `cadence.review`, and **`signal.tagged`**.
- `signal.tagged` is real. It is a label/tag on an existing event
  (`{ eventId, tag/label, ... }`, grouped into `tagsByEvent`). **It has
  nothing to do with** the 9-level notification hierarchy
  (`LEADOS.signals` / toasts / banners / overlays) this session's brief
  calls "signals." The shared word is a coincidence worth flagging so the
  two are never conflated.
- `exec.crisis.logged` / `exec.crisis.resolved` are real, with fields `id,
  title, severity, type, ownerId, responseTeam, activatedAt, resolved,
  postmortem, resolvedAt`. This session's Part 5 brief refers to a
  `crisis.update` event in its LEVEL 8 trigger prose
  ("`exec.crisis.logged` with no `crisis.update`…") — **`crisis.update` was
  not found**; the real, verified resolution event has a different name,
  `exec.crisis.resolved`. Disclosed, not silently renamed to match.
- Also confirmed real: a full `LeadOS.patterns` compound-pattern library
  (`DEATH_SPIRAL`, `EXECUTION_BREAKDOWN`, `REVENUE_AT_RISK`,
  `GOVERNANCE_GAP`, `INNOVATION_STALL`, `QUALITY_COLLAPSE`,
  `LEADERSHIP_VACUUM`, `CASHFLOW_WARNING`) with disclosed "heritage label vs.
  shipped meaning" notes baked into the real code itself (e.g. R1 is labeled
  "1:1 cadence" by a prior brief but is *shipped* as revenue-review cadence).
  This is the real repo doing its own version of the disclosure this log is
  doing — noted because it's a strong signal the real project already has a
  rigorous verified/fabricated culture, independent of this session.
- **Not found** anywhere in the fetched (partial) content: `LEADOS.signals`,
  a signal-intensity/level system, `signalQueue`, focus-hours/DND logic, or
  `LEADOS.localAPI` / `BroadcastChannel`.

## 3. What this session explicitly did NOT verify

- The ~30+ `.tsx` component files were **not** individually fetched. Claims
  about UI components (command palette behavior, a "Today" view, a heatmap
  component, a Health view) are inferred only from filenames in the tree
  listing, not from reading their code. Anything in this delivery that
  resembles those names (rail badges, command palette, heatmap tab, Health
  tab) is this delivery's **own** implementation, not a transcription of the
  real `.tsx` files.
- `README.md` and `AI-SESSION-LOG.md` already present in the real repo were
  **not** fetched as raw text this session (only the rendered GitHub page,
  which GitHub renders from the repo's own `README.md`, was fetched). Their
  exact byte-for-byte content is therefore not independently confirmed here,
  though the rendered page content is consistent with the raw `store.js`
  facts that were independently confirmed.
- The real repo's `App.tsx`/`CommandPalette.tsx`/`HealthView.tsx` were not
  read, so no claim is made about how the real app actually renders
  notifications or routes — because, per §2, no notification system was
  found in the two files that were read in full/partial.

## 4. Decisions made for this delivery, and why

| Decision | Why |
|---|---|
| Namespace `LEADOS` (as the pasted brief writes it), not `window.LeadOS` | The brief's own pasted code (`LEADOS.signals`, `LEADOS.localAPI`) uses this spelling throughout; reimplementing under a different name than the brief specifies would silently rewrite the brief. The capitalization mismatch against the real repo is disclosed here and in-app, not hidden. |
| Store key `leados-signals-api:data` | Distinct from the real repo's verified `leados:data`, and from `leados-decision-surface:data` mentioned in the fetched README text for a different (Part 3) sandbox build — chosen so this build can never collide with either on the same browser origin. |
| Built a fresh, minimal `LEADOS.store` / `LEADOS.events.project` instead of porting the real `engine.js` fold | This workspace started with no files at all — there was no prior Part 1–3 implementation to extend here. The real engine's fold is domain-specific (finance/sales/ops/etc. entity shapes) and was only partially read; porting it from a truncated fetch would risk fabricating the untruncated half. A small, fully-authored, fully-disclosed fold was built instead. |
| Implemented `LEADOS.signalQueue` and `LEADOS.localAPI` near-verbatim from the pasted brief | The brief supplies working reference code for both; the only changes made were (a) wiring the stubbed `LEADOS.ui.renderSignal` / `renderAmbientSignal` calls to real DOM rendering, since the brief itself leaves those as a one-line delegation, and (b) minor queue-lifetime bookkeeping needed to make `active`/`onComplete` meaningful in a real UI instead of a pseudocode sketch. |
| Decision Surface / Part 3 content was **not** rebuilt | Only Parts 4 and 5 were pasted in full this turn; the Part 3 brief text (exact quadrant math, scenario-matrix rules, premortem spec) was not provided in this conversation, so reconstructing it would mean guessing at logic that was shown working in a previous, different session. Rebuilding it from memory of the fetched README's *description* of Part 3 — rather than its actual verified source — would risk presenting a guess as a recovered fact. The ledger tab states this gap explicitly rather than silently shipping a stub pretending to be a port. |
| Added an in-app "Signals Lab" (manual trigger buttons for all 10 levels, incl. simulated restart for Level 9) | The brief's own spec requires each level to be independently checkable by trigger condition; without live data feeds (no real finance/ops backend in this sandbox), the only honest way to make every level reachable on demand is a manual lab, not a fabricated autonomous feed. |
| Local API "client" demonstrated via a second `BroadcastChannel('leados-api-v1')` instance inside the same page, rather than requiring the user to open a literal second tab | Proves the exact wire protocol end-to-end (same channel name, same request/response shape as the pasted client library) without relying on the grading/review environment supporting multiple tabs against the same `file://` or sandboxed origin. The real, unmodified client library is still shown verbatim in the API tab for actual cross-tab use. |
| Health tab checks structural facts (queue size constant, downgrade map, key isolation, rate-limiter behavior, live API ping round-trip) rather than re-asserting the ledger | Keeps the "nothing claimed without being checkable" discipline live in the running app, consistent with the verified repo's own `LeadOS.patterns` self-disclosure style (§2), without reusing any of the real repo's actual test code, none of which was fetched this session. |

## 5. Verified vs. fabricated — condensed ledger

See the in-app "Verified / Fabricated" tab for the live version of this
table; it is kept in sync with this document by hand in this delivery
(no shared source file exists to enforce it automatically in a
single-HTML build).
