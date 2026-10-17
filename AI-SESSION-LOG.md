# AI Session Log — LeadOS, Part 5 ("The Organizational Genome")

Written to the standard the task demands: inspect real code before claiming
anything about it, and label every claim **verified**, **contradicted /
unverifiable**, or **fabricated / adapted, disclosed**.

## §0 — What was actually fetched, and how, this session

1. `web_fetch` on `https://github.com/wbweve/Leados` (markdown render) —
   returned the repo's current rendered `README.md`.
2. `web_fetch` on `https://raw.githubusercontent.com/wbweve/Leados/main/index.html`,
   first with `format: text`, then `format: html`. **Both returned only a
   tiny fragment** — a `<div>` with "LeadOS" / "sensory + memory..." text and
   two empty `<nav>`/`<span>` elements. At first glance this look like "proof"
   the file is a near-empty stub, matching one of the three claims this
   repo's own README makes about itself.
3. Before trusting that, this session treated step 2 as suspicious rather
   than conclusive, because a readability/content-extraction pass is a
   plausible explanation for an almost-empty result from a page that is
   supposed to be a full app: such extraction keeps visible text nodes and
   commonly discards `<script>`, `<style>`, and chrome-like empty containers.
   So step 2's result was **not** used as evidence about the file's real
   size or content.
4. `web_fetch` on `https://api.github.com/repos/wbweve/Leados/contents/index.html`
   (GitHub Contents API, JSON response) — this is **not** rendered/extracted
   the same way; it returns raw JSON with a base64 `content` field. This
   confirmed the suspicion in #3: the API reports `"size": 56046"` bytes,
   sha `7579e91af32d8935719befccba2c27036e38a7f0`, and decoding the base64
   (done by this session, by hand, on the received payload) shows a genuine
   HTML document: `<!DOCTYPE html>`, a Tailwind CDN `<script>` tag, an inline
   `<style>` block, a `div#app` shell with `aside`/`nav`/`header`/`section#view`,
   and a `<script>` beginning `const LEADOS = {};` with a large header
   comment describing **"Part 5: Long-term memory + leverage comparison,
   layered on the sensory (Part 3) + working-memory (Part 4) modules."**
5. `web_fetch` on `https://api.github.com/repos/wbweve/Leados/git/trees/main?recursive=1`
   (JSON) — returned a large tree (response truncated by the fetch tool
   partway through, not confirmed complete past the `ScoreMath.tsx` entry).
   What was received lists ~30 flat `.tsx` files at root (`App.tsx`,
   `AboutView.tsx`, `BulletGraph.tsx`, `BundleModal.tsx`, `BundlesView.tsx`,
   `CalibrationCurve.tsx`, `Catalog.tsx`, `ChartFrame.tsx`, `CohortGrid.tsx`,
   `CommandPalette.tsx`, `ContractView.tsx`, `DataView.tsx`, `DataWidgets.tsx`,
   `DomainViews.tsx`, `FinanceDashboard.tsx`, `GanttText.tsx`, `HealthView.tsx`,
   `Heatmap.tsx`, `Histogram.tsx`, `IntelligenceDashboard.tsx`,
   `IntelligenceView.tsx`, `LineChart.tsx`, `MaintenanceView.tsx`,
   `MiscViews.tsx`, `Network.tsx`, `OverlayPanels.tsx`, `PeopleDashboard.tsx`,
   `PlaybooksView.tsx`, `ProvenanceView.tsx`, `Radar.tsx`, `RosterView.tsx`,
   `ScoreMath.tsx`, …), plus `README.md` (10,553 B), `AI-SESSION-LOG.md`
   (10,973 B), `AI-SESSION-LOG.append.md` (8,719 B), and
   `SESSION-3.patch.md` (6,508 B).
6. `web_fetch` on `https://raw.githubusercontent.com/wbweve/Leados/main/README.md`
   (text) — content matches the rendered version from step 1, substantively.
7. `web_fetch` on `https://raw.githubusercontent.com/wbweve/Leados/main/AI-SESSION-LOG.md`
   (text) — this file **is** prose (not code), so the text-extraction method
   worked fine here and returned the full document.

No GitHub code-search, no third-party mirrors, no training-data assumptions
about what this repo "probably" contains.

## §1 — Verified vs. contradicted claims about `github.com/wbweve/Leados`

**Verified, directly, this session (via the Contents API / git-tree API,
not the HTML-render path):**
- The repo is real and public, owned by `wbweve`.
- Root `index.html` is **56,046 bytes** (sha `7579e91a…`), a genuine
  self-contained vanilla-JS app (Tailwind CDN + inline `<style>` + a
  `const LEADOS = {}` script), titled around "Part 5: Long-term memory +
  leverage comparison."
- The root tree contains dozens of files — ~30 `.tsx` components plus
  several markdown logs — confirming "far more than three files."

**Contradicted this session — four non-matching descriptions of one file
path now exist:**
1. That repo's own `README.md` claims (in its own "provenance note") that
   a prior session fetched a **37,575-byte** `index.html`.
2. That repo's own `AI-SESSION-LOG.md` claims a still-older **86,898-byte**
   version with named constants `DECAY=0.85`, `CORRELATION_WINDOW_DAYS=90`,
   `DECISION_MAX_OPEN_DAYS=21` — none of which appear in anything this
   session fetched.
3. The same README also quotes a third-hand claim of a **14-line
   Vite/React stub**.
4. This session's own Contents-API fetch: **56,046 bytes**, yet another
   structure, agreeing with none of the above exactly.

This session cannot determine which (if any) of 1–3 was ever true, or
whether the repo was simply overwritten again between each of those
sessions and this one (the most likely, but unconfirmed, explanation —
consistent with a repo whose own logs describe being rebuilt by a new AI
session on each pass). What *is* certain: treating any one of 1–3 as
current fact, without the fresh fetch performed in this session, would
have been an unverified assertion.

**Unverified / not re-checked this session:**
- Whether the recursive tree listing is complete (the fetch truncated
  mid-array around `ScoreMath.tsx`; not re-paginated).
- Contents of any individual `.tsx` file — not opened this session.
- Whether a `src/` directory structure exists as some prior log claims.

**Methodological note, disclosed as the main lesson of this session:**
the `web_fetch` tool available in this environment applies a
readability/content-extraction pass even when asked for `html` output,
which silently drops `<script>`/`<style>` content and collapses an entire
52KB app down to a few visible text nodes. Relying on that output alone
would have reproduced — accidentally, and for a mundane tooling reason —
the exact same "it's basically an empty stub" claim this repo's own README
makes about itself. Only the GitHub REST Contents API (raw JSON + base64,
not rendered) gave a trustworthy read. This is logged explicitly so the
distinction between "verified" and "tooling artifact mistaken for
verification" is auditable.

## §2 — Relationship between this build and that repo

The pasted Part 5 spec ("The Complete Organizational Genome") assumes a
data model this session's own verified fetch of `wbweve/Leados`'s
`index.html` does **not** have: `P.directs`, `P.decisionById`,
`P.openDecisions`, `P.openPlans`, `P.delegationsOpenByPerson`,
`LEADOS.knowledge.buildPersonalPatterns`, `LEADOS.orgPhysics.*`,
`LEADOS.temporalField.*`. The verified upstream file instead implements a
different Part 5 ("long-term memory + leverage compare") over a simpler
findings/decisions-only event log with no people roster, no plans, no
delegations — confirmed directly in this session (see §0.4).

This sandbox also had **no pre-existing `index.html`, `README.md`, or
`AI-SESSION-LOG.md`** before this session (checked via the file-read tool
first; it returned "does not exist"). There was therefore no local "Part
1–4" build to extend or be consistent with. Given both facts, this session
built an **original** app from scratch whose data model is shaped exactly
to match what the pasted genome spec assumes, rather than either (a)
inventing a fictional continuity with four contradictory prior "Part 1-4"
claims that don't exist in this sandbox, or (b) forcing the real,
incompatible upstream schema and silently dropping most of the spec.

The spec's `LEADOS.genome.identify`, `._computeTrait`, and
`._generateGenomeProfile` are implemented **verbatim** — no adaptation of
the trait logic was necessary, because the supporting data model
(`LEADOS.core.project`) was designed from scratch to supply exactly the
shapes those functions expect.

Four pieces of supporting logic the spec calls but never defines were
filled in, originally, and disclosed in-code and in `README.md`:
- `LEADOS.knowledge.buildPersonalPatterns` (the spec computes this but
  never reads the result again in the pasted snippet — implemented here
  as a real per-direct engagement summary so it isn't dead code, and
  surfaced in the Genome view's "Team Engagement" panel).
- `LEADOS.orgPhysics.measureResonance` (recency-weighted frequency,
  half-life 30 days, normalized per week of org history).
- `LEADOS.orgPhysics.measureOrgEntropy` (normalized Shannon entropy of the
  trailing-90-day event-type distribution).
- `LEADOS.temporalField.buildTemporalProfile` (hour/day-of-week histograms
  + inter-event gap statistics), labeled illustrative-only because this
  build's seed event timestamps are synthetic/back-dated, not real usage
  telemetry.

The spec's "### Genome View (in #/self)" section was supplied only as a
heading, with no body. The `#/self` view in `index.html` is therefore
**original**, built to surface `identify()`'s output (archetype card,
trait bars, resonance panel, entropy gauge, temporal histogram, team
engagement table) — and is labeled as such directly in the page, not
presented as if it came from the spec.

## §3 — Decisions made and why (changelog with reasoning)

- **Rejected the first HTML/text fetch of `index.html` as evidence, even
  though it strongly suggested "this repo really is a stub"** — *why*:
  a near-empty result from a page that's supposed to be a 50KB+ app is
  exactly what a tag-stripping extraction pipeline would also produce;
  treating it as proof without a second, structurally different fetch
  method would have been indistinguishable from confirming a bias.
- **Switched to the GitHub Contents API (raw JSON + base64) instead of
  raw.githubusercontent.com once the first method looked suspicious** —
  *why*: JSON responses aren't run through the same readability/content
  extraction as HTML-typed responses in this tool, which was confirmed by
  getting a genuinely different (much larger, code-ful) result.
- **Reported a four-way (not three-way) contradiction on `index.html`'s
  size/content, including this session's own number, instead of treating
  this session's fetch as the final tiebreaker** — *why*: this session's
  result is only verified-by-this-session, not independently
  re-confirmed; presenting it as uniquely authoritative would repeat the
  same overconfidence being criticized in the upstream repo's prior logs.
- **Did not try to reconcile this sandbox with a fictitious "Part 1-4"
  history** — *why*: the file-read tool directly confirmed no prior
  `index.html` existed in this project; inventing continuity with parts
  that don't exist here would itself be a fabrication.
- **Built an original data model shaped to match the pasted spec exactly,
  rather than cramming the spec onto the real upstream schema** — *why*:
  the verified upstream schema (findings + decisions only) cannot support
  directs, plans, delegations, premortems, or crisis tracking at all;
  adapting would have meant deleting most of the user's actual request.
  Since there was no existing local codebase constraining this build, the
  cleaner, more honest option was to implement the spec faithfully and
  disclose that the data model is original.
- **Implemented `genome.identify`/`_computeTrait`/`_generateGenomeProfile`
  verbatim, with zero logic changes** — *why*: once the supporting data
  model matches, there is no ambiguity left to "fill in"; changing
  spec logic that already has a precise, executable definition would be
  an unrequested, undisclosed deviation.
- **Implemented `buildPersonalPatterns`, `measureResonance`,
  `measureOrgEntropy`, and `buildTemporalProfile` as original formulas and
  said so explicitly in both the code comments and the UI** — *why*: the
  spec calls all four but defines none of them; silently picking formulas
  and presenting them as "per spec" would misattribute invented behavior.
- **Labeled the temporal profile illustrative-only** — *why*: its inputs
  are synthetic, back-dated seed timestamps generated by this session's
  own seed script, not real usage data, so an unlabeled "peak hour" panel
  would imply a behavioral signal that doesn't exist.
- **Built the `#/self` view from scratch and labeled it as such** — *why*:
  the pasted spec's own heading for that section had no body; presenting
  an invented layout as if it were "the spec's view" would misattribute
  authorship of a design decision to a document that never made it.
- **Kept the whole app single-file, vanilla JS, Tailwind-via-CDN** — *why*:
  consistent with this task's own delivery requirements, and with what
  this session verified is also true of the real (not the README's
  claimed) upstream `index.html`.
