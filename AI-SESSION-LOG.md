# AI-SESSION-LOG

Append-only engineering log. Conventions: facts verified against code are **verified**;
facts taken from docs are **secondhand**; things that could not be read are **unverified** and
were re-authored rather than trusted.

Sessions 1–7 (mf-1 → mf-3) live in the upstream repo. Their content here is a **secondhand**
summary from mf-3's README: storage spine + migrations (S1–S5), design direction + editorial
surface (S6), arrival instrument R9–R12 + incidents + tree-drift "fix" (S7).

---

## Session 8 — mf-4 · conflict counterpart pairs (R6 per-person → per-pair) + R13 nexus

### Slice (stated before work, per process)
Conflict pairs, end to end: data model (additive `counterpartPersonId`), event wiring
(pair projection), engine (R6 rewrite + R13), playbooks (DESC two-party), UI (capture bar,
dossier pairs, finding prefill), tests (G17–G18 + R6-related goldens rewritten).

### Verification trail — what was actually read before any claim
1. **Upstream repo landing page** — full README rendered (mf-3 · Session 7). Read in full. **verified**.
2. **`contents/` API listing** — root files with sizes. **verified**.
3. **Recursive git tree of `main` HEAD** (`82f546c`, `truncated:false`): flat root (`app.css`,
   `store.js`, `events.js`, `engine.js` 39,552 B, `playbooks.js` 35,163 B, `ui.js` **71,795 B**),
   plus `package.json`, `package-lock.json` 87,433 B, `tsconfig.json`,
   `AI-SESSION-LOG.append.md`, `SESSION-3.patch.md`. **No `css/` or `js/` directories.**
4. **`store.js` head** — verified: CURRENT=3, lineage `mf`, `fresh()` shape, `isBaseShape`/`isShape`,
   MIGRATIONS 1→2 and 2→3 bodies, `normalizeEvents` (repairs, never drops), `rewire` walker regexes
   `/(^id$|Id$)/` and `/Ids$/`, `trySetItem` (quota names + codes 22/1014), `qkey` collision suffix,
   `runMigrations` with pre-migration quarantine. Tail (load pipeline, import) **truncated — unverified → re-authored to contract**.
5. **`events.js` head** — verified: emit/emitMany, addPerson/updatePerson, openDecisions/openGoals/
   openDelegations/openConflicts/openIncidents, pulsesMeasured/pulsesEstimatedCount, lastOneOnOne,
   feedbackBalance. `latestSL` onward + arrival + seed/purge **truncated → re-authored**. Key finding:
   `data.counterpart` was **free text** (`'vs ' + counterpart`), so pair logic was impossible without
   a typed link — root cause of gap #1.
6. **`engine.js` head** — verified: DOCTRINE constants, CONF_FACTOR, score math, RULE_TAGS,
   RULE_PLAYBOOK, `dayUTC`/`days`/`slope`, `fin`/`keyOf`, `buildCtx`/`lineToMe`, full R1, R2 head.
   R3–R12 and G1–G16 **truncated → re-authored to the README contract**.
7. **`playbooks.js` head** — verified: LEVELS, LEVEL_GUIDE, SL_TABLE + `slMatch` (commitment-crisis
   → D3, mixed-middle → D2 "stated assumption"), playbook shape (`guide`/`fields`/`submit`), 1:1 run
   sheet incl. measured-only pulse discipline. Rest **truncated → re-authored**.
8. **Not read (too large / would truncate): upstream `ui.js` tails, `app.css`, upstream session log.**
   All re-authored. Labeled in each file header.

### Findings (ranked, before fixes)
- **BLOCKER — README↔tree drift, second consecutive session.** mf-3's README claims `css/` + `js/`
  paths, "this tree matches this file", npm artifacts dropped. Actual HEAD tree: flat root, npm
  artifacts present, orphan session fragments. The exact defect class mf-3 criticizes in mf-2,
  repeated the very next session — by the same authority narrative. Fix: this delivery's tree
  matches its README; file table lists 8 entries because there are 8 entries.
- **BLOCKER — counterpart was free text**, making "per-pair" matching impossible without drifting
  on spelling (`"Dana"` vs `"dana k."` = different pairs). Fixed: typed `counterpartPersonId` with
  text fallback that is *priced*, not hidden (medium confidence + basis line).
- **REAL RISK — upstream goldens G1–G16 unverifiable** (truncated). Re-authored as G1–G18; R6 goldens
  updated to pair semantics. Any behavioral divergence from upstream R6 is intentional and documented.
- **REAL RISK — `lineToMe` treats archived intermediates as broken → silence.** Kept (consistent
  with doctrine), called out: archiving a lead mutes their reports' skip-level signal. Accepted —
  archiving a lead without re-parenting first is user error the engine declines to paper over.
- **NITPICK — upstream ships `SESSION-3.patch.md` / `AI-SESSION-LOG.append.md` fragments** — the
  exact "orphan session files" mf-3 cites as mf-2's sin.
- **NITPICK — legacy `.patch.md`/`.append.md` naming invited the drift.** This log: one file, append-only.

### Decisions (why, one line each)
- **No schema v4.** `counterpartPersonId` is additive inside `data{}`, which the normalizer already
  preserves; a migration for an additive nullable field is ceremony. Recorded in `store.js`.
- **Empty counterpart = conflict with "you"** (pair `me × person`), not "unlinked noise" — the
  leader's own repeated friction with a report is exactly the signal a pair rule exists to catch.
- **Text-linked pairs fire at medium confidence with the drift risk printed** rather than being
  silently trusted or silently ignored — the doctrine is transparency, not abstention.
- **R13 at medium, permanently.** A count of open loops cannot distinguish "they are the problem"
  from "they are the only one honest enough to register friction" — the why-string says so.
- **R13 excludes text-linked counterparts from the distinct-count** (can't dedupe a name reliably);
  they appear in basis instead of inflating evidence.
- **Nexus playbook = 1:1 (not DESC).** You don't DESC a pattern; DESC resolves a dispute. The nexus
  needs a pattern conversation — added as a mode in the 1:1 run sheet.
- **T7 quota test** monkey-patches `localStorage.setItem` to throw `QuotaExceededError` — the one
  deterministic way to exercise the production catch path from the inside; restored in `finally`.
- **Design direction kept (third session).** Churn of paint mid-flight is itself a trust defect.

### What was checked (claim → method → result)
- Every claim in the file headers about carried code: direct reads above. Result: carried verbatim
  where byte-readable; re-authored elsewhere, labeled.
- Happy path / empty / boundary / malformed / corrupted-storage coverage: encoded as T1–T12 +
  G1–G18, executed live at `#/health` on every render, disposable keys, self-cleaning. This
  environment has no JS sandbox (same as S6–S7 reported) — so execution results are **the wall's
  job in your browser**, stated plainly rather than implied.
- Tree↔README match: README "Files" table = the 8 paths created this session. Verified by construction.
- Phone width: 640px rules in `css/app.css` (rail → horizontal, single-column forms). Authoring
  environment renders no screenshots — **unverified visually**, conservative layout chosen for that reason.

### Changelog (files changed)
- `index.html` — created (shell: splash, rail, drawer, quota pill; loads css + 5 js in order).
- `css/app.css` — created (Session-6 tokens kept; pair/link glyph styles; 640px rules).
- `js/store.js` — created: verified head carried; load/import/browse/key-browser re-authored;
  `classify()` splits shapeless-parseable (malformed) vs wrong-lineage (foreign) — why: T3/T4 are
  two different incident classes and one bucket would hide that.
- `js/events.js` — created: verified projections carried; **added** `linkOf`, `pairKeyOf`,
  `pairLabel`, `conflictPairs`, `conflictNexus`, `openWins`, arrival, seed/purge (seed now includes
  a Dana×Priya pair and a Marcus nexus so R6/R13 demonstrably fire).
- `js/engine.js` — created: verified contract carried; R6 **rewritten per-pair**; **R13 nexus added**;
  goldens re-authored G1–G18 with boundary cases per rule (silence cases asserted as loudly as firing).
- `js/playbooks.js` — created: verified ladder/SL/1:1 carried; DESC is now two-party and closes
  conflicts via `conflict.resolved` on submit; 1:1 sheet gained nexus mode.
- `js/ui.js` — created (re-authored; upstream unreadable): Today ranked column, capture bar with
  counterpart-linked conflict registration, arrival, roster+dossier (pair labels, resolve actions),
  playbooks drawer, health wall T1–T12 + G1–G18, data tools.
- `README.md` — created: tree-matched; upstream blocker documented with evidence; non-claims explicit.
- `AI-SESSION-LOG.md` — created (this file): lineage with secondhand labeling + Session 8.

### Unverified / known limits (carried forward honestly)
- No execution of the code was possible in this authoring environment; `#/health` is the grader.
- Upstream `ui.js`/`app.css`/session-log contents: unread; anything resembling them here is
  convergence on the documented spec, not continuity of code.
- Visual check at phone width is by construction, not screenshot.
