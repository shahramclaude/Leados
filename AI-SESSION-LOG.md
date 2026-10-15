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
- `js/ui.js` — creat

│ TRUNCATION MARKER (Session 9): the upstream log file ends mid-line at "creat" — the read
│ cut off here. Everything above is the VERIFIED-carried portion of the Session-8 log, byte-
│ faithful to what the fetch returned. The remainder (rest of the changelog, any postscript)
│ was never readable and is not reproduced. Nothing below this marker is from Session 8.

---

## Session 9 — mf-5 · executable tree (module registry + boot guard) + R14 meeting load + R15 premortem gate

### Slice (stated before work, per process)
(a) **Structural truth, made executable**: real `css/`+`js/` tree; every module registers its
path; missing file → fatal banner naming it (no splash — a live-looking dead app is the failure
mode being killed); T13 turns the README file-table into a runtime assertion; npm artifacts and
orphan fragments removed from the file set. (b) **Repo's own ranked gap #1**, end to end:
`meeting.series` events → meetings projection → **R14** (≥480 declared recurring min/wk) →
meeting-audit playbook → goldens; `decision.severity` (additive) → **R15** (sev ≥4, age ≥2d,
ungated) → premortem playbook → goldens; capture UI for both.

### Verification trail — what was actually read before any claim
1. **`git/trees/main?recursive=1`** (`e70ca24`, response `truncated:false`) — **verified**: 14
   entries, flat root, NO `css/` or `js/` dirs. `app.css`/`store.js`/`events.js`/`engine.js`
   43,626 B/`playbooks.js` 35,071 B/`ui.js` 52,269 B at root; `package.json`, `package-lock.json`
   87,433 B, `tsconfig.json`, both fragments present.
2. **`package.json` raw** — **verified**: `"name": "react-vite-tailwind"`, deps react 19, vite 7,
   tailwind 4, gsap, lenis, lucide-react. A parallel-universe manifest contradicting the doctrine.
3. **`index.html` raw, two formats** — extraction strips `<script>/<link>` tags; 2,277 B mf-4
   shell (`#rail`, `#view`, mf-4 branding). **Asset paths UNVERIFIED.** If they reference `css|js/`,
   the upstream app is dead-but-renders-chrome; if flat, it runs and only docs lie. Labeled, not guessed.
4. **`store.js` raw** — head **verified-carried** through mid-`trySetItem` (CURRENT=3, lineage,
   `fresh()` shape, both migrations, `normalizeEvents`, `rewire` regexes, `qkey`, `canon`/`sameData`
   prelude). Tail truncated → **re-authored to contract, marked REV in the file**.
5. **`AI-SESSION-LOG.md` raw** — read to mid-changelog (ends "creat"); carried verbatim above with
   a truncation marker.
6. **Not read (would truncate): `engine.js`, `events.js`, `playbooks.js`, `ui.js`, `app.css`.**
   Re-authored to the README contract (rule parameters, storage contract, design tokens — all
   fully specified there). API names convention-carried from the S8 log's verified head-reads
   (**secondhand-verified**, labeled per file).
7. **Not read (budget): `AI-SESSION-LOG.append.md` (8,719 B), `SESSION-3.patch.md` (6,508 B).**
   Removed from the delivered file set **unread** — labeled: content unverified; the main log's
   secondhand S1–S7 summary supersedes the fragments' likely role.

### Findings (ranked, before fixes)
- **BLOCKER — README⇄tree drift, third consecutive session; the catching mechanism does not exist.**
  `#/health` executes code-path claims only. Nothing executes tree-layout claims, so the README's
  flagship structural sentence is unfalsifiable at runtime. A doc-only fix will drift again —
  S7→S8→HEAD proves it twice. Fix must be executable: the app carries its own file list.
- **BLOCKER (unresolvable from here) — upstream `index.html` asset paths.** See trail #3. Both
  branches are blockers; the mf-5 tree + boot guard make the distinction impossible to miss again.
- **REAL RISK — npm artifacts** (`package.json` React/Vite/Tailwind + 87 KB lockfile + `tsconfig.json`).
  Not inert: they invite any tooling (or session) to "modernize" the app into the stack its README
  forbids. Deleted from the file set.
- **REAL RISK — orphan fragments** (`SESSION-3.patch.md`, `AI-SESSION-LOG.append.md`): patch-against-
  what-base is unverifiable → drift fuel. Deleted (one unread, labeled).
- **REAL RISK — unbounded `state.log[]`** grows on every mutation/normalize into ONE ~5 MB key —
  the audit trail eventually kills the store it audits. mf-5: capped at 300, the cap leaves a row.
- **REAL RISK — import rewiring missed `reportsTo`**: carried walker regexes (`/(^id$|Id$)/`, `/Ids$/`)
  don't match it → imported skip-level chains silently broke (`lineToMe` → silence, doctrine-
  respected, invisible). mf-5: `rewirePersonRows()` closes it; T9 asserts it by name.
- **REAL RISK — (self-inflicted, caught in-review) `seed()` fired the change hook unconditionally**;
  T11 runs inside a render → infinite wall recursion. Fixed: seed/purge take a store arg; the hook
  fires only on the singleton path.
- **REAL RISK — (self-inflicted, caught in-review) `canon()` object check was `typeof object_check(o)`**
  — always truthy; strings would serialize as objects and corrupt the identical-import test. Fixed
  before delivery; recorded because a reviewer should see the class of bug first-run code carries.
- **NITPICK — mf-4 README "Eight entries below"**: the table has 7 rows. Sloppy counting in a doc
  whose thesis is exact counts.
- **NITPICK — mf-4 empty-counterpart semantics contradict themselves** (README: "…or 'you' when no
  counterpart is named" vs S8 log: "empty counterpart = conflict with you (pair me × person)").
  mf-5: explicit endpoint model, semantics printed in every R6 basis.

### Decisions (why, one line each)
- **No schema v4 (kept doctrine).** All mf-5 additions (`meeting.series`, `premortem.held`,
  `goal.assigned`, `decision.severity`, person `createdAt`) are additive; normalizer preserves by
  contract; ceremony ≠ safety. Recorded in `store.js`.
- **Module registry over a docs fix** for drift: an unexecuted claim is a wish; T13 + the boot
  guard make the tree self-checking in both directions (wall-from-inside, banner-from-outside).
- **Splash deleted.** The only honest uses of a splash (branding, covering slow boots) serve the
  maker, not the tool; boot is ms-scale, and the fatal banner owns the genuinely-dead case.
- **R14 threshold 480 min/wk (8 h = 20 % of 40 h)** — labeled "stated assumption, not science" in
  the basis; ad-hoc meetings uncaptured → basis says real load is ≥ computed (never overstate).
- **R15 grace 2 days** so the act of logging a sev-4 decision doesn't instantly flag it; the gate
  warns at capture (sev ≥4 inline notice + premortem link) and never blocks the write — data entry
  is the user's prerogative; nagging is the engine's.
- **Newer-schema storage → read-only boot, live key untouched.** Quarantining newer bytes and then
  booting writable-fresh would let one save destroy a newer database. mf-5 refuses the whole write path.
- **`slope ≤ −0.4` kept verbatim** (x in days: steep — 5→1 in 10 days). G8 asserts the exact
  boundary fires, so the semantics are pinned by the wall, not by memory.
- **Seed/purge parameterizable** — a health run must never touch the live store; T11 seeds a
  disposable key. Same function, two targets; doctrine (flag-before-rows) holds on both.
- **Person `createdAt` added** — "never logged a 1:1" needs a start date; missing on legacy rows →
  R1/R8 skip rather than infer (doctrine).
- **Design kept a fourth session**; mf-5 deltas are subtractions (splash) and one glyph (ink bar
  for minutes), both stated in the README design section.

### What was checked (claim → method → result)
- Repo/tree/package facts: direct API + raw reads (trail 1–2). Result: **verified**.
- store.js head carried vs re-authored boundary: raw read to mid-`trySetItem`. Result: boundary
  labeled in the file header; nothing unread claimed as inspected.
- Happy path / empty / boundary / malformed / corrupted-storage: encoded as T1–T13 + G1–G17
  (fixtures hand-derived against the rule code, including silence cases, exact boundaries:
  cadence 14d=silent/15d=fire · slope −0.40 fires · 480 min fires/478 silent · sev4 age 2 fires/
  age 1 silent). **No JS sandbox exists in this environment** (S6–S8 constraint, unchanged) —
  execution is the wall's job at first load; that limitation is stated in README non-claims, not implied.
- Reentrancy review: every `_changed`/`render` call site traced; seed/purge guarded (finding above).
- Phone width: 640 px rules kept/extended (rail horizontal, single-column forms, capture tabs wrap).
  **Unverified visually** — no renderer here; conservative single-column chosen for that reason.

### Changelog (files changed — full set; all nine, this being the restructure session)
- `index.html` — rewritten: mf-5 shell, **boot module-registry guard + fatal banner**, splash
  deleted, scripts in dependency order.
- `css/app.css` — re-authored on kept tokens (+ meeting-load bar, fatal/spark/chip styles; 640 px kept).
- `js/store.js` — head verified-carried; tail REV; **added**: `normalizePeople`, `rewirePersonRows`
  (reportsTo fix), log cap 300, read-only-on-newer, `_forceStamp` test hook, pill refresh.
- `js/events.js` — re-authored projections + **meetings weekly-load projection**, premortem
  projection, `lineToMe` **cycle guard**, explicit conflict endpoint model, person `createdAt`,
  seed/purge **parameterizable** (recursion-guarded), seed drives all 15 rules with contrasts.
- `js/engine.js` — re-authored R1–R13 to contract; **R14 + R15 new**; ENG exception guard kept;
  printed score math kept.
- `js/playbooks.js` — re-authored; **premortem + meeting-audit added**; delegation ladder, SL
  matching, SBI, DESC, reviews, arrival playbooks carried to contract.
- `js/ui.js` — re-authored: six views, generic playbook renderer (drafts survive main re-renders),
  capture bar incl. meeting series + sev≥4 premortem nudge, muted-finding management, rule registry,
  and the health wall **T1–T13 + G1–G17** (executed live, disposable keys swept).
- `README.md` — rewritten to mf-5 (tree, rules, storage notes, non-claims, re-ranked gaps).
- `AI-SESSION-LOG.md` — this append; Session-8 content carried to its truncation point, marked.
- **Upstream deletions to apply (not in the delivered set): `app.css store.js events.js engine.js
  playbooks.js ui.js` (flat copies) · `package.json` · `package-lock.json` · `tsconfig.json` ·
  `SESSION-3.patch.md` · `AI-SESSION-LOG.append.md`.**
