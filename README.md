# LeadOS pt-B — Ambient Intelligence Interface

A single-file implementation of the **pt-B** brief: a behavioral/ambient
layer (`LeadOS.ambient`, aliased as `LEADOS.ambient`) that sits between a
small sample leadership-event log and what actually gets shown to the
user — contextual greetings, a daily digest, "The Three" priority signals,
smart (context-weighted) scoring, a status strip, focus mode, a guided
weekly review, natural-language quick logging, and smart snooze options.

Open `index.html` in any modern browser. No server, build step, or network
call except the one Tailwind CDN `<script>` tag required by this
assistant's platform (purely for layout utility classes — no data of any
kind leaves the browser; everything else lives in one `localStorage` key).

> **This is not a verified continuation of `github.com/wbweve/Leados`'s
> real `engine.js`/`events.js`/`health.js`/`ui.js` code.** This session
> independently re-inspected that repository (GitHub's Git Trees API +
> direct raw-file reads of `store.js`, `events.js`, `rules.js`,
> `README.md`, `AI-SESSION-LOG.md`, and the live `index.html`) rather than
> trusting prior claims. See "What was actually inspected" below and
> `AI-SESSION-LOG.md` §0 for the full, re-derived audit.

## What was actually inspected this session (and what wasn't)

| Area | Status |
|---|---|
| Git tree at `main` HEAD | **Verified** via GitHub's Git Trees API (`truncated:false`, 21 entries). No `js/` folder exists anywhere — all `.js` files are loose at repo root. |
| `correlate.js`, `leadership_self.js` | **Verified absent.** The pt-B brief's instruction that `ambient.js` "depends on… correlate" and is "loaded after correlate.js" does not describe anything that exists in this repository. |
| `rules.js` | **Read in full (761 bytes).** It is a disclosed tombstone: its own header says the rules engine was merged into `engine.js` and that the file is not loaded by the browser. |
| `store.js` | **Read in full (14,941 bytes, byte-matched to the tree API).** Confirms: `window.LeadOS` (mixed case) namespace, one localStorage key `leados:data`, append-only doctrine, `SCHEMA_VERSION=5`, `LINEAGE_TAG='pt-6'`. |
| `events.js` | **Partially read** (~40% of 24,512 bytes; tool truncated the rest). Its own header states 92 registered event types across 15 domains. |
| `engine.js` (105,072 B), `health.js` (175,053 B), `ui.js` (97,565 B), `playbooks.js` (59,592 B), `app.css` (22,636 B) | Byte sizes **confirmed via API only**. Internal contents **not read this session** — no claim is made about their logic. |
| Live `index.html` (74,587 bytes per the API — a different number from a prior session's 145,271-byte figure for the "same" file) | Raw fetch returns only stripped visible text: `"Schema v15 · pt-A · leados:data"`. This is **suggestive but not proof** that it's a particular prior deliverable; its actual `<script>` contents were not recovered. |
| Internal consistency of the repo | **A real, independently-confirmed contradiction**: `store.js` says schema 5 / `pt-6`; the live page's rendered text says "Schema v15"; `events.js`'s own comment says 92 event types vs. "41" cited elsewhere. All three numbers were read directly this session, not relayed. |

Given this, nothing about the target repo's internal rule/engine logic is
treated as ground truth here. This build implements the **pt-B
specification text** against a new, small, clearly-labeled sample data set.

## Files in this delivery

Three files, matching this tool environment's constraint (not a claim about
the target repo's file count, which this session found to be disputed — see
above):

| File | Role |
|---|---|
| `index.html` | Everything: sample data/event layer, the `LeadOS` module namespace (`store`, `events`, `engine`, `correlate`, `leadership_self`, `playbooks`, `ambient`, UI layer), all CSS, all JS. No build step. |
| `README.md` | This file. |
| `AI-SESSION-LOG.md` | Append-style engineering log: the full claim-vs-inspection audit, what was built, every deliberate deviation and why, and a decisions log. |

## Module table (brief's required `LEADOS._mod` registry)

| Module | Status | Notes |
|---|---|---|
| `store` | Implemented (inline) | Mirrors the *verified* real doctrine: one localStorage key, append-only, single `append()` write path. New schema/lineage (`schemaVersion 1`, `pt-B`) — not a continuation of the real `pt-6`/schema-5 store. |
| `events` | Implemented (inline) | ~20-type sample registry, far smaller than the real, partially-verified 92-type registry. |
| `engine` | Implemented (inline) | Hand-written sample rule set (R103, R12, R20, R55, R71, R40…). Rule IDs are labels/homage, not verified ports. |
| `correlate` | Implemented (inline) | No real file exists to port (verified absent); minimal same-file stand-in. |
| `leadership_self` | Implemented (inline) | No real file exists to port (verified absent); minimal same-file stand-in (`avoidancePatterns`). |
| `playbooks` | Implemented (inline) | 4 sample playbook defs, open/complete/completionRate. |
| **`ambient`** | **Implemented (inline) — this is the pt-B deliverable** | All ten brief functions; 100% pure (reads only, never calls `store.append`). |
| `ui` | Implemented (inline) | Rail, Today view, domain views, digest/review modals, command palette, snooze menu, toasts. |

`LeadOS._mod.ambient` is registered and loaded (in source order) after
`correlate`/`leadership_self`/`playbooks` are defined, honoring the brief's
dependency order even though it is all one `<script>` tag rather than
separate files. The `EXPECTED` guard array checks all seven module keys at
boot and renders "Modules: N/N OK" in the rail footer.

## What's implemented (pt-B feature by feature)

- **Contextual Time Intelligence** — `currentContext()`: time-of-day bucket
  (MORNING_REVIEW/DEEP_WORK/MIDDAY_PULSE/EXECUTION/REFLECTION/ASYNC),
  day-of-week modes (WEEK_START/WEEK_END/BOARD_PREP/SPRINT_CLOSE), and an
  inferred (explicitly labeled "not confirmed schedule") cadence note from
  the day-of-week distribution of `oneonone.logged` events.
- **Daily Intelligence Digest** — `buildDigest()`, triggered only via the
  `> digest` command or button, never automatic, never cached. Every line
  is sourced inline (event/finding that produced it).
- **Behavioral Learning Engine** — `learnPatterns()`: dismissal-rate per
  rule, playbook completion rate, finding latency (R99 variant), domain
  neglect (via `leadership_self.avoidancePatterns`), snooze-fatigue. All
  observations carry the brief's exact label: "behavioral pattern
  observation — derived from your suppression and playbook history."
  Surfaced at `#/data`, with a working "mute rule globally" control writing
  to `meta.mutedRules`.
- **Smart Priority Scoring** — `smartScore()`: base sev×confidence plus the
  six multiplicative modifiers from the brief, printed as a mono
  base/smart breakdown block on every finding card. A **base vs. smart**
  rank toggle lives on The Three panel.
- **The Three** — `computeTheThree()`, top 3 by smart score, excluding
  findings already acted on this session.
- **Ambient Warning System** — clickable status strip (severity counts +
  domain bubbles), filters the finding list, persists for the session.
- **Focus Mode** — `F` key or `> focus`; hides the full list, keeps The
  Three + quick capture; auto-exits on `playbook.completed`.
- **Weekly Review Mode** — `> review`; 5-step guided wizard, saves
  `reflection.logged` (+ `commitment.made` from step 5) only at the end.
- **Natural Language Event Logging** — `parseQuickLog()`: regex + person
  lookup for the three example phrasings in the brief (1:1 + pulse, sales
  deal, conflict). Always shows parsed fields and requires an explicit
  "Confirm & save" click; never auto-saves.
- **Snooze Intelligence** — contextual `snoozeOptions()` dropdown (next
  1:1, sprint end, board meeting, Monday, tomorrow, custom), snooze-count
  chip, and a dedicated snooze-fatigue observation after 3+.
- **Notification Badges as Intelligence** — rail badges encode count via
  number, severity via (simplified) color, and trend via shape (circle/
  diamond/square), backed by a disclosed `meta.badgeHistory` cache (a
  pt-B addition analogous to the brief's own `meta.mutedRules`/`patterns`
  exceptions — see `AI-SESSION-LOG.md` §2.4).
- **Session Intelligence** — `LeadOS.session` (in-memory only, never
  persisted): `lastViewedFindings`, `actedOnFindings`, `sessionStart`,
  `viewHistory`/`searchHistory` (search history tracked via the command
  palette and quick-capture inputs).

## What's intentionally not fully implemented (and why)

See `AI-SESSION-LOG.md` §2 for the complete list with reasoning. Short
version: no port of the real `engine.js`/`health.js`/`ui.js`/`playbooks.js`
logic (not read this session — budget; see audit table above), a few
streak/series numbers (ops "3 consecutive weeks," R8/R34 quiet-win streaks)
are fabricated sample constants labeled inline rather than derived from a
real weekly-series event family that wasn't in scope to build honestly.

## Run it

Open `index.html`. `Cmd/Ctrl+K` for the command palette, `F` for focus
mode, click **digest** / **review** buttons on the Today view, click any
finding's **Snooze ▾** for contextual snooze options, visit **Data &
Calibration** in the rail for behavioral pattern observations and rule
muting.

---

## Changelog

### pt-B (this delivery)

- **Added** `LeadOS.ambient` (aliased `LEADOS.ambient`) implementing all
  ten functions the brief names — *why: this is the actual deliverable;
  everything else exists to give it real data to read.*
- **Added** Today view redesign (context greeting, status strip, The
  Three, focus mode, NL quick capture, `[NEW]` tracking) — *why: these are
  the primary surfaces the brief defines as what actually gets shown, not
  optional UI polish.*
- **Added** digest modal, 5-step weekly review wizard, command palette
  `>` commands, contextual snooze dropdown — *why: each is an explicit,
  user-triggered flow per the brief's "generated on demand, never
  cached"/"confirm always required" doctrine.*
- **Added** Data & Calibration view with working rule-mute control against
  `meta.mutedRules` — *why: the brief calls this out as a genuinely new
  pt-B capability; implementing it as a real control (not prose) honors
  the brief's "ambient surfaces, store writes" separation.*
- **Added** rail badge shape system + disclosed `meta.badgeHistory` cache
  — *why: the shape feature is meaningless without some persisted
  prior-day snapshot; the brief didn't specify where, so one sanctioned
  field was added and documented, mirroring the brief's own
  `mutedRules`/`patterns` exception pattern.*
- **Replaced** "port `js/ambient.js` alongside real `js/store.js` /
  `js/events.js` / `js/engine.js` / `js/correlate.js`" with "build pt-B
  as a new single-file sample system" — *why: independently verified this
  session that no `js/` folder, `correlate.js`, or `leadership_self.js`
  exists in the target repo at all (GitHub Git Trees API, byte-checked);
  building against a described file layout that was confirmed not to
  exist would be building on fiction rather than inspected code.*
- **Kept** `LeadOS` (mixed case) as the canonical namespace, with `LEADOS`
  as a live alias — *why: `LeadOS` is the one namespace this session
  actually verified by reading real code (`store.js`, `events.js`); the
  brief's `LEADOS` capitalization could not be verified against any real
  file, so it's supported without being asserted as "correct."*
- **Declined** to assert any internal correctness for `engine.js`,
  `health.js`, `ui.js`, or `playbooks.js` — *why: not read this session
  (budget); see `AI-SESSION-LOG.md` §0.7.*
