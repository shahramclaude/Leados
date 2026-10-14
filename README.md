# LeadOS — Leadership Operating System (rebuilt, Session 1)

A single-file, offline-first leadership mentor for someone newly put in charge of
**other team leads**. Vanilla JS, no framework, no backend, no accounts, no APIs,
no OAuth, no build step, no network calls. Open `index.html` in a browser — that
is the whole install. All state lives in `localStorage`.

## Why this README starts with a correction, not a feature list

This repository previously shipped a `v24.0` build whose own README stated, in
its own words, that ten consecutive prior sessions could not read their own
~160KB script body due to tooling limits, and that headline numbers like
"69 rule classes" / "48 self-tests" were **"specification-of-intent,"** not
measured. I hit the identical tooling wall this session (GitHub raw fetch and
blob-API fetch both get stripped/truncated before reaching script content from
my environment) and independently confirmed one concrete, checkable fact: the
README's own size table (`index.html` = 169,534 B) does not match the actual
file on `main` (201,051 B, verified via the GitHub Contents API). That's not a
rounding error, it's the project's own documentation drifting from its own
artifact while still being presented as "grep-verified."

Given that, I will not pretend to "continue" code I cannot read. **This build is
authored fresh, under its own schema (`schemaVersion: 1`, storage key
`leados:data`), with every claim below checkable by opening `#/health` in your
own browser and reading the actual assertion and actual computed value.** The
old `leados.v6` key, if present in your browser, is left untouched and
surfaced read-only on the Data page — it is not blindly imported, because its
internal shape was never independently verified by any session, including
this one.

## What it actually does, verified how

| Capability | How you verify it yourself |
|---|---|
| Schema versioning + migrations | `#/health` → test **T1**: a synthetic v0 fixture is migrated live and asserted to reach v1 with all collections present |
| Corrupted `localStorage` handling | Corrupt the `leados:data` key in DevTools (`localStorage.setItem('leados:data','{bad')`) and reload — you get a recovery banner naming the exact parse error, the raw bytes are copied to a `leados:data.corrupt.<ts>` key, and the live key is never overwritten blind |
| Quota handling | `#/health` → **T3** exercises the exact `trySetItem` function production code calls, against a mock storage that throws `QuotaExceededError`, and asserts it is caught, not thrown to the UI |
| JSON export / import with validation | `#/data` → export, then re-import the same file: byte-identical files are rejected (see `attachImportHandler`); malformed/newer-schema files are refused with a named reason, not silently accepted |
| Cross-module event/data layer ("case spine") | Register a conflict case at `#/cases` and open it — the detail view lists **every module it automatically touched** (escalation + SLA, feed entries on both parties). `#/health` → **T5** proves this on an isolated fixture, not a screenshot |
| Close-case orphan refusal | Try closing a case with an open linked escalation — it refuses and names the blocker; override requires explicit confirmation and is logged. `#/health` → **T8** |
| Transparent, non-overconfident recommendations | Every item on Home prints its **basis** (the exact data it read) and a **confidence label with the rule that produced it** (e.g. "fewer than 3 data points" → low). Nothing is asserted without a shown reason |
| Second-run reseed bug (named failure mode in the brief) | `meta.seeded` is a permanent flag, not an emptiness check — clearing all your real data later will **not** silently bring back demo people. Verify: use the app, delete everyone, reload — roster stays empty |

**What `#/health`'s automated checks do NOT prove**, stated on that page itself:
they are fixture-based assertions run by the app at boot, not a browser
automation suite, not a fuzzer, and not a guarantee against every possible
malformed-data shape. They prove the ten named behaviors execute as described
on this exact build. I do not have a JS execution sandbox in my own tooling —
I hand-traced every function while writing it and then had the app grade
itself at runtime, in your browser, which is the only honest substitute
available to me. Treat `#/health`'s live numbers as authoritative over
anything claimed here, the same standard the old README claimed to hold
itself to and, per the size-mismatch above, didn't fully meet.

## The modules (all real, all cross-wired, none are stubs)

- **Roster / person dossier** — every other module's records roll up onto the
  person page: 1:1 history, pulse history, cases, SBI feedback, bench status.
- **1:1s** — cadence-aware; overdue ones surface on Home with exact day counts.
- **Pulse** — mood/energy telemetry; a "trend" is never claimed on fewer than
  3 points (see confidence rule printed inline).
- **Goals** — ownership-gated; an unowned goal is a visible defect, not silence.
- **Cases** — the spine. One registration fans out to escalations, decisions,
  feedback, or goal risk flags depending on type, in one state transaction.
- **Decisions** — severity-≥4 cases force a premortem before you can record
  a decision; the UI refuses to let you skip it.
- **Feedback (SBI)** — Situation/Behavior/Impact; drafted-not-delivered items
  queue onto the person's *next* 1:1 agenda automatically, or flag on their
  dossier if no 1:1 is scheduled yet.
- **Delegation** — 5-level empowerment scale (gather info → full autonomy);
  10+ days without a check-in flags decay.
- **Escalations** — fixed SLA ladder by severity (S5=1d…S1=30d), breach and
  due-soon are both computed live from today's date, never cached.
- **Risks** — likelihood × impact register with review-date nudges.
- **Rituals** — recurring leadership rhythms; lapse detection is cadence-aware.
- **Talent & Bench** — 9-box placement plus named-successor coverage check
  for every team-lead seat you own.
- **Meeting Load** — self-reported weekly hours; focus time under 20% of a
  logged week is flagged at **medium** confidence (explicitly: one week is
  not a trend — stated in the UI, not just in this doc).
- **First 90 Days ("Arrival")** — the thing a newly appointed multi-team
  leader is missing most and the headline addition this session: expectations
  exchange with your boss (day-14 overdue nudge), a listening-tour coverage
  fraction across your whole roster (60% by day 60), and an early-win ledger
  that explicitly refuses to count a win nobody else has verified.
- **Data & Backup** — export, import (merge or replace, with pre-import
  snapshotting), storage usage meter, quarantine key browser, legacy-key
  surface (read-only).
- **System Health** — the self-test wall, described above.

## What a new multi-team leader still needs that isn't built yet

Ranked honestly, not padded:

1. **Calibration / compensation-cycle support** — nine-box exists, but
   translating it into promotion/comp narratives across multiple teams does
   not. This is probably the single biggest gap for someone leading leaders.
2. **Cross-team dependency map** — when Team A's goal blocks Team B's, nothing
   currently models that explicitly; goals are flat, not graphed.
3. **Narrative radar** — comparing what the org *believes* (pulse themes,
   listening-tour notes) against what the instruments show (SLA breaches,
   goal slippage) is a real gap; the raw data for it already exists in this
   build, the correlation view does not.
4. **Meeting-design studio** — load auditing exists; redesigning a specific
   recurring meeting's purpose/attendee list does not.
5. **Succession rehearsal / game-day mode** — bench names exist; a drilled
   "this seat-holder is out for 30 days" simulation does not.

## Storage contract

- Key: `leados:data`. `meta.schemaVersion` is the source of truth (currently `1`).
- Corrupt bytes, over-version bytes, and failed-migration bytes are all
  quarantined to `leados:data.<label>.<timestamp>` and **never** overwritten —
  the live key is left alone until you act from `#/data`.
- Quota failures are caught at the exact call site production code uses
  (`trySetItem`), in-memory state is preserved, and the top bar turns a
  persistent red `WRITE FAILED` pill until a save succeeds.
- Export is a full JSON dump. Import validates shape → refuses newer schemas
  → migrates older ones → refuses byte-identical files → snapshots your
  pre-import state to a quarantine key → then merges (re-minting every id and
  rewiring known foreign-key fields) or replaces, your choice.

## Explicit non-claims

- "5MB" is a conservative assumed floor for the quota meter, not a measured
  browser limit — real limits vary by browser and are not queryable from JS.
- The rule engine is intentionally small and named explicitly (see
  `RULES` array in `index.html`) rather than a larger unverified count —
  every rule is inspectable in one place, not scattered.
- This is Session 1 of this lineage. It does not inherit, and does not claim
  to inherit, any history from the prior `v1`–`v24` builds in this repository.
