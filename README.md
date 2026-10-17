# LeadOS — Sensory & Memory build (single-file)

A leadership-cockpit UI shipped as one self-contained `index.html`
(Tailwind via CDN, vanilla JS). It implements an append-only finding/
decision event log, a findings "Today" view, a domain heatmap, a
decisions log with a quadrant classifier, a **haptics module**, a
**Web Audio sound module**, and a **session-memory module** with a
two-item finding comparison mode.

> **Provenance note (read this before trusting any claim about
> `github.com/wbweve/Leados`):** this build was made after directly
> fetching that repo's live `main` branch (GitHub REST API + raw file
> fetches), not after reading its README as fact. The repo's own
> `index.html` at `main` HEAD, fetched raw by this session, is a
> 14-line Vite/React entry stub with no inline logic — it does **not**
> currently contain the 86,898-byte vanilla-JS file with grep-verified
> constants that the repo's own `README.md`/`AI-SESSION-LOG.md`
> describe. This build therefore does not reuse any "verified upstream
> constant," because none were found to verify at the time of this
> session. Full ledger, including what *was* verified (repo identity,
> file list, the "far more than three files" contradiction) is in
> `AI-SESSION-LOG.md` and the in-app **Provenance / About** route.

## Run it

Open `index.html` in a browser. No build step, no server, no npm —
that file is the whole app.

## Durable vs. session vs. unpersisted state

| Layer | Storage | Contents |
|---|---|---|
| Durable | `localStorage['leados:events']` | append-only event log (findings created/snoozed/dismissed/resolved, decisions logged). Every view recomputes from this via `LEADOS.core.project()` on every render — nothing derived is stored. |
| Durable, user prefs | `localStorage['leados:haptics']`, `localStorage['leados:audio']` | haptics/audio opt-in flags, both default **off**. |
| Session (working memory) | `sessionStorage`, keys under `LEADOS.memory.session.KEYS` | current route/focus, nav history (last 10), the 2-item compare pair, and placeholders for familiarity/fatigue/drafts/scroll/filters/search/attention (declared per spec, not all wired to UI yet — see Changelog). |
| Session, audio restraint | `sessionStorage['leados:audio:played']` | which of the 6 distinct sounds have played this session, to enforce the "≤3 distinct sounds/session" rule live. |

## Routes

| Route | What it does |
|---|---|
| `#/today` | Open findings, newest-severity-first. Snooze / Dismiss / Resolve / add-to-Compare actions, each firing a sensory event. |
| `#/domains` | Per-domain heat = sum of severities of open findings in that domain (original to this build, disclosed as not an upstream formula). |
| `#/decisions` | Log a decision (domain, impact, reversibility, note); classified into an original, disclosed quadrant (Bold Bet / Point of No Return / Quick Call / Caution); decisions >21 days old flagged stale. |
| `#/compare` | Side-by-side diff of the two findings held in session "working memory." The exact comparison-mode spec was cut off mid-sentence in the brief this was built from — this view is a disclosed fill-in. |
| `#/sensory` | Live test bed for every haptic pattern and every synthesized sound, toggles for each channel, and a live readout of the session's 3-sound restraint budget. |
| `#/log` | Raw event log, JSON export, wipe + reseed. |
| `#/about` | The full verified / contradicted / unverified ledger for `github.com/wbweve/Leados`, and for this build. |

## The sensory system

- **Haptics** (`LEADOS.haptics`): the Web Vibration API, used only as a
  secondary confirmation channel, never as the sole carrier of
  information. Off by default. A 3-second fatigue guard is enforced in
  code (the brief described this as a principle; this build makes it
  literally true at runtime).
- **Audio** (`LEADOS.audio`): pure `Web Audio API` synthesis — sine/
  square/sawtooth tones with simple envelopes, no audio files, no CDN.
  Off by default. A session-scoped cap of 3 distinct sounds is enforced
  in code for the same reason as above.
- Both are reproduced from the literal specification given for this
  build (pattern library, pitch/duration semantics, restraint rules);
  additions beyond that spec are marked `// ADDED:` in `index.html` and
  called out here and in `AI-SESSION-LOG.md`.

## The memory system

`LEADOS.memory.session` reproduces the specified key list (`FOCUS`,
`HISTORY`, `FAMILIARITY`, `FATIGUE`, `DRAFT`, `SCROLL`, `FILTERS`,
`PANEL`, `SEARCH`, `ATTENTION`, `COMPARE`) and the `get`/`set`/
`addToCompare`/`getComparePair` helpers verbatim. Currently wired into
the UI: `FOCUS`, `HISTORY`, and `COMPARE`. The rest are declared,
namespaced, and ready to use, but have no UI surface yet in this part
of the build — disclosed rather than silently implied as "done."

## What's verified vs. fabricated vs. simplified here

**Verified, directly, this session:** the repo `wbweve/Leados` is real
and public (id `1413944295`, created 2026-10-11, last pushed
2026-10-17); its root git tree has dozens of files, not three; its
`main`-branch `index.html`, fetched raw, is currently a minimal
Vite/React stub with no inline business logic.

**Contradicted / unverifiable this session:** the repo's own
`AI-SESSION-LOG.md` claims (as "verified") an 86,898-byte vanilla
`index.html` with specific grep-confirmed constants — not reproducible
from a direct fetch of `main` HEAD during this session; a nested
`src/components/`, `src/lib/` structure the repo's README describes,
which this session's own tree fetch was truncated before confirming or
denying; whether any sensory/memory modules already exist upstream
(code-search call errored).

**Fabricated, disclosed at point of use:** all seed findings and
decisions, the domain-heat formula, the decision-quadrant thresholds,
the Compare view's exact diff behavior (spec was cut off).

**Simplified, disclosed at point of use:** "familiarity," "fatigue,"
"draft," "scroll," "filters," "search," and "attention" memory keys are
declared and namespaced per spec but not yet wired to any UI control.

## Changelog

- **Fetched the live repo directly (API + raw file fetch) before writing
  a line of code or copying a single claim** — *why*: the task requires
  verification before assertion, and the repo's own README/log are
  themselves claims, not verification.
- **Found that upstream `main`'s `index.html` is currently a bare
  Vite/React stub, contradicting that repo's own "verified" log entry
  about an 86KB vanilla file** — *why*: reporting this rather than
  quietly reusing the "verified" constants from that log avoids
  laundering an unverified (and, at HEAD, false) claim into this build.
- **Built an original, single-file vanilla app instead of attempting a
  React/Vite port** — *why*: this environment's tooling requires a
  single static `index.html`; porting a file this session could not
  verify would itself be an unverified claim of fidelity.
- **Implemented the Part 3 haptics/audio spec essentially verbatim**,
  adding only a haptic fatigue guard and an audio restraint cap — *why*:
  the brief states these as governing principles but the pasted code
  didn't enforce them; enforcing them makes the principle true instead
  of aspirational.
- **Implemented the Part 4 memory key list verbatim but only wired
  `FOCUS`/`HISTORY`/`COMPARE` into the UI** — *why*: wiring keys with no
  corresponding feature in this part of the brief (e.g. `FATIGUE`,
  `ATTENTION`) would mean inventing behavior not specified, which the
  task's own "label unverified" instruction argues against.
- **Filled in the Compare view's diff behavior with an original table**
  — *why*: the pasted Part 4 spec cuts off mid-sentence right where the
  comparison-mode behavior would be defined; shipping *something*
  functional, clearly labeled as a fill-in, was judged better than
  shipping a dead route.
