# LeadOS — Sensory, Memory &amp; Long-Term Knowledge Base (single-file)

A leadership-cockpit UI shipped as one self-contained `index.html`
(Tailwind via CDN, vanilla JS). It implements an append-only finding/
decision event log, a findings "Today" view, a domain heatmap, a
decisions log with a quadrant classifier, a **haptics module**, a
**Web Audio sound module**, a **working-memory (session) module**, and
now a **long-term memory module** (episodic + semantic recall) with a
**leverage-based comparison mode** that answers "which should I address
first?" using more than raw severity.

> **Provenance note — read this before trusting any claim about
> `github.com/wbweve/Leados`:** this build was made after directly
> fetching that repo's live `main` branch three separate ways (GitHub
> REST API repo metadata, a recursive git-tree listing, and two
> independent fetches of `index.html` — raw file + Contents API blob).
> Those two independent `index.html` fetches **agree with each other**
> and show a 37,575-byte vanilla JS app — but **contradict** that same
> repo's own `README.md`, which claims `main`'s `index.html` is a
> 14-line Vite/React stub, and contradict a *third*, older claim (inside
> that repo's own `AI-SESSION-LOG.md`) of an 86,898-byte file with
> different named constants. None of the three descriptions is treated
> as ground truth here beyond what this session verified directly. Full
> ledger in `AI-SESSION-LOG.md` and the in-app **Provenance / About**
> route.

## Run it

Open `index.html` in a browser. No build step, no server, no npm —
that file is the whole app.

## Durable vs. session vs. unpersisted state

| Layer | Storage | Contents |
|---|---|---|
| Durable | `localStorage['leados:events']` | append-only event log: findings created/snoozed/dismissed/resolved, decisions logged, and (new) `finding.effort_logged` — the user's effort estimate for leverage scoring, persisted rather than kept as throwaway UI state. Every view recomputes from this via `LEADOS.core.project()` — nothing derived is stored. |
| Durable, user prefs | `localStorage['leados:haptics']`, `localStorage['leados:audio']` | haptics/audio opt-in flags, both default **off**. |
| Session (working memory) | `sessionStorage`, keys under `LEADOS.memory.session.KEYS` | current route/focus, nav history (last 10), the 2-item compare pair. `FAMILIARITY`/`FATIGUE`/`DRAFT`/`SCROLL`/`FILTERS`/`PANEL`/`SEARCH`/`ATTENTION` keys are declared per the Part 4 spec but still have no UI surface — unchanged from the prior part, disclosed again here rather than silently implied as finished. |
| Session, audio restraint | `sessionStorage['leados:audio:played']` | which of the 6 distinct sounds have played this session (≤3 distinct/session cap, enforced). |
| **Derived, recomputed on demand (new)** | n/a — pure functions over the event log | `LEADOS.memory.longTerm.recallEpisodes()` / `.recallSemanticPatterns()`. Nothing here is stored separately; it's long-term memory in the sense that the *event log itself* is the long-term memory, and this module is the query layer over it. |

## Routes

| Route | What it does |
|---|---|
| `#/today` | Open findings, newest-severity-first. Snooze / Dismiss / Resolve / add-to-Compare actions, each firing a sensory event. |
| `#/domains` | Per-domain heat = sum of severities of open findings in that domain (original to this build, disclosed as not an upstream formula). |
| `#/decisions` | Log a decision (domain, impact, reversibility, note, optional person for the people domain); classified into an original, disclosed quadrant; decisions >21 days old flagged stale. |
| `#/compare` | **Upgraded this part.** Leverage-based recommendation between the two findings held in working memory — see "Leverage scoring" below, not a plain severity diff anymore. |
| `#/memory` | **New.** The Memory Palace: episodic recall (filterable event history with "what was happening at the time" context and concurrent-event chips) and semantic recall (domain activity, temporal pattern, resolution rates, recurring themes, most-mentioned people). |
| `#/sensory` | Live test bed for every haptic pattern and every synthesized sound, with the session's 3-sound restraint budget readout. |
| `#/log` | Raw event log, JSON export, wipe + reseed. |
| `#/about` | The full verified / contradicted / adapted ledger for `github.com/wbweve/Leados` and for this build. |

## The sensory system

- **Haptics** (`LEADOS.haptics`): Web Vibration API, secondary
  confirmation channel only, never the sole carrier of information. Off
  by default. 3-second fatigue guard enforced in code.
- **Audio** (`LEADOS.audio`): pure Web Audio synthesis — no files, no
  CDN. Off by default. Session-scoped cap of 3 distinct sounds enforced
  in code.

## The long-term memory system (new this part)

`LEADOS.memory.longTerm` is an **adaptation**, not a verbatim port, of
the pasted spec. The spec assumed a people-roster + goals-engine +
playbook data model (`P.peopleById`, `LEADOS.engine.run`, findings with
IDs like "R103"/"R14", `LEADOS.knowledge.crystallizePlaybookEffectiveness`)
that does not exist in this build or in anything verifiable upstream.
Instead, this module keeps the spec's two-layer shape and computes it
against the real, simpler event log:

- **Episodic** (`recallEpisodes`): query by type/domain/keyword/date
  range; each result includes the organizational context *at the time*
  (open findings count, top finding, decisions logged so far — computed
  by re-running `LEADOS.core.project()` frozen at that event's
  timestamp) and nearby concurrent events (±3 days).
- **Semantic** (`recallSemanticPatterns`): domain activity, a temporal
  "peak hour" pattern (labeled illustrative-only, since seed timestamps
  are synthetic), resolution rates per domain, recurring keyword themes
  (replacing the unavailable `buildPersonalPatterns`), and most-mentioned
  people (replacing `peopleFrequency` — adapted to a free-text `person`
  tag on decisions, since there's no people roster here).

## Leverage-based comparison mode (upgraded this part)

The brief states the goal — "not by severity alone... but by leverage,
time required, and downstream impact" — but, like the earlier
cut-off Part 4 compare spec, does not supply an executable formula.
This build's disclosed fill-in:

```
score = (severity × 2  +  domainClusterSize × 1.5  +  log2(ageDays + 1)) / effort
```

- `domainClusterSize` = other open findings sharing the same domain
  (a downstream-impact proxy: fixing a symptom of a wider cluster
  matters more).
- `log2(ageDays + 1)` = time-in-system with diminishing returns.
- `effort` = Low(1) / Medium(3) / High(5), set per finding directly in
  the Compare view and persisted as a `finding.effort_logged` event
  (so "time required" is a real, durable input, not a hidden constant).

The Compare view shows the full breakdown per finding and a plain-language
verdict naming the dominant factor (severity, cluster size, age, or
effort-efficiency) — or says "too close to call" when scores are within
12% of each other, rather than forcing a false-precision answer.

## What's verified vs. contradicted vs. fabricated/adapted here

**Verified, directly, this session:** the repo `wbweve/Leados` is real
and public (id `1413944295`, created 2026-10-11, pushed 2026-10-17T12:29:04Z);
its root git tree has dozens of files, not three; two independent direct
fetches of `main`'s `index.html` (raw file + Contents API blob) agree
with each other and show a 37,575-byte vanilla JS app.

**Contradicted this session:** that same repo's own `README.md` claims
`main`'s `index.html` is a 14-line Vite/React stub — directly contradicted
by this session's own fetches of that file. A third, older claim (in the
repo's own `AI-SESSION-LOG.md`) describes yet a different, 86,898-byte
version with different constants. All three cannot be simultaneously
true; this build reuses none of them as fact, only what it fetched
itself. See `AI-SESSION-LOG.md` §1 for the full ledger, including the
likely (but unconfirmed) explanation: the repo kept being overwritten
between sessions.

**Fabricated/adapted, disclosed at point of use:** all seed
findings/decisions, the domain-heat formula, decision-quadrant
thresholds, the long-term-memory module's adaptation to a simpler schema,
and the leverage-compare formula.

## Changelog (this part)

- **Independently re-verified the upstream repo from scratch (repo
  metadata, tree, two separate `index.html` fetches) rather than reusing
  any previous session's "verified" claims** — *why*: this repo's own
  history shows prior sessions' claims about it are not stable ground
  truth; only a fresh, first-hand fetch counts as verification for this
  task's standard.
- **Disclosed a three-way contradiction about `index.html`'s actual
  content** (14-line stub per README vs. 86,898 bytes per an older log
  vs. 37,575 bytes per this session's own two fetches) **instead of
  picking one story** — *why*: picking the most "convenient" of three
  mutually exclusive claims would itself be an unverified assertion.
- **Adapted the Long-Term Memory spec to this build's real, simpler
  event schema instead of fabricating a people-roster/goals-engine/
  playbook subsystem to run the pasted code verbatim** — *why*: the
  alternative would mean inventing a much larger surface of unlabeled,
  made-up behavior just to look spec-compliant.
- **Persisted effort estimates as a durable event
  (`finding.effort_logged`) instead of ephemeral UI state** — *why*:
  consistent with this build's core invariant that nothing derived is
  stored and everything replays from the append-only log; it also means
  effort estimates become part of long-term memory, recallable later.
- **Showed the leverage score's full arithmetic breakdown in the UI**
  — *why*: an unexplained "trust me" recommendation score would be the
  opposite of the verification-first standard this whole task is
  built around.
- **Added a "too close to call" branch (within 12% leverage-score
  margin) instead of always naming a confident winner** — *why*: forcing
  a false-precision verdict when the inputs don't really distinguish the
  two findings would be a fabricated certainty, not a disclosed one.
- **Labeled the temporal "peak hour" panel as illustrative-only** —
  *why*: it's computed over synthetic, back-dated seed timestamps, not
  real usage data, and presenting it unlabeled would imply a behavioral
  signal that doesn't exist yet.
