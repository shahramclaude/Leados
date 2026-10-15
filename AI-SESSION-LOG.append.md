# LEADOS · AI SESSION LOG — Session 6 entry (APPEND this to AI-SESSION-LOG.md; do NOT replace the existing 22,103 B file)

_Naming convention: this entry is delivered as a separate file because the authoring environment writes files, not commits. Prepend or append wholesale; nothing below edits prior entries. Measured-at dates follow the rule adopted in Session 4: every measurement carries when it was taken._

---

## Session 6 — mf-2: audit-first rebuild of engine+ui; playbooks & skip-levels slice

**Date:** February 2026 (web-audit session). **Env constraint (standing):** no JS execution sandbox at authoring time; grading authority is `#/health` in the reader's browser. This session's extra constraint: **repo bytes were fetched through HTTP tools** — stated per-file what was readable vs not; nothing unread was claimed.

### §0 What this session measured about the repo itself, with sources

| Claim | Measured (this session) | Source |
|---|---|---|
| File tree | 12 files at root: `index.html` 1,920 B · `app.css` 7,814 B · `store.js` 7,630 B · `events.js` 6,630 B · `engine.js` 27,781 B · `ui.js` 38,078 B · `README.md` 16,284 B · `AI-SESSION-LOG.md` 22,103 B · `SESSION-3.patch.md` 6,508 B · `package.json` 707 B · `package-lock.json` 87,433 B · `tsconfig.json` 681 B. **No `css/` or `js/` directories exist.** | GitHub git Trees API (sha 4b829889…) |
| Prior README §6 file table (`css/app.css`, `js/store.js`…) | **WRONG as written** — files are at root; the README described the mandate, not the tree | Trees API, above |
| Prior drift-notice row "index.html = 337,974 B" | Stale: current index.html = 1,920 B (mf-1 splash shell) | Trees API + raw fetch |
| `package.json` = React 19.2.6 + Vite 7.3.2 + TS 5.9.3, gsap/lenis/lucide-react, singlefile plugin; zero source files | **VERIFIED BY DIRECT READ** (previously inherited from Session 2) | raw fetch |
| `engine.js` readability | Read in full for header, DOCTRINE, RULE_TAGS, ctx builder, R7, R6, and R1 up to its confidence block; then the fetch channel truncated (payload cut mid-rule). R2–R5 bodies, `run()`, `runGolden()` G1–G9 = **UNVERIFIED** | raw fetch (partial) |
| `ui.js` readability | Logic readable (CAPTURE spec, T1–T8, views, router, import/export handlers); **template-literal markup/SVG bodies were stripped by the fetch renderer** (e.g. `ic(){ return '' }`, icon dict values empty). Exact rendered HTML = **UNVERIFIED** | raw fetch (partial, stripped) |
| `store.js`, `events.js` | **Read in full** — claims in prior README (quarantine kinds, trySetItem, reseed-impossible, rewire walker, audit) hold as written | raw fetch (complete) |

### §1 Findings, ranked (every one tied to evidence above)

1. **BLOCKER — dead npm scaffold ships** (verified direct-read this session): `package.json`/lockfile/tsconfig describe a React+Vite+TS build that contradicts every permanent constraint and invites an accidental `npm run build`. **Prescription: delete all three files.** (Not deletable from this environment — logged as required repo action.)
2. **BLOCKER (architectural) — no migration ladder existed anywhere.** `CURRENT=1` + refuse-and-quarantine is honest for foreign bytes but leaves the mandated "schema versioning WITH migrations" unimplemented; the first schema bump would orphan every live store. → mf-2 ships `MIGRATIONS[1→2]`, documented, T10-tested with a byte-exact v1 fixture, pre-migration bytes snapshotted before write.
3. **REAL RISK — `openGoals()` ignored `goal.assign` events** (found in full read of mf-1 `events.js`): owner lived in two places; the projection read only `goal.set.data.ownerPersonId`, so an owner assigned after creation was invisible to the projection/UI link lists. Whether mf-1's R3 compensated internally is UNVERIFIED (engine truncated). → mf-2 folds `goal.assign` (latest wins) inside both `events.openGoals()` and the engine's own self-contained R3 — and the duplicate fold is intentional: the engine must run on bare fixture states with no module imports.
4. **REAL RISK — opaque ranking + no engine memory.** Scores were hand constants (R7=100, R6=90, R1=70); rank derivation wasn't printed one level down; there was no way to tell the mentor "I know, stop" — the classic path to alert fatigue. → mf-2 prints `sev × conf = score` on every row and adds snooze/dismiss/unmute **as events** (auditable, exportable, reversible; G11 goldens them).
5. **NITPICK — README said `js/`, tree said root**; nitpick only because every loader path was consistent. → mf-2 puts files under `css/` + `js/`; tree now matches docs by construction.
6. **NITPICK — `events` unbounded** (log capped at 500, events not): silent quota pressure over years; export/import exists; acceptable for now, but stated.
7. **NITPICK — mf-1 `audit()` didn't normalize event fields** (dup handling + dangling FKs only). → mf-2 `normalizeEvents()` repairs id/ts/type/data per row, at boot AND at the import gate, never dropping (T8 goldens it).

### §2 What a new multi-team leader needs that wasn't there — added, not listed

- **Skip-levels as a first class** (the prior lineage's own v19 flagship, dropped in mf-1): `people[].reportsTo` (default `'me'`), engine R8 with broken-line silence, roster line editing, dossier shows the line.
- **Playbooks layer** (the repo's own §5 gaps 6–7): 1:1 run sheet (+skip-level and load-cutting modes), SBI, DESC, delegation ladder (levels wording carried verbatim from the mf-1 read), situational D1–D4→S1–S4 with mismatch warnings, decision review, goal review. Bridge: `playbooks.forFinding()` maps every rule to the resolving playbook with prefill.
- **Honest dossier trends**: measured/estimated sparkline; trend withheld under 3 measured points, with the reason printed.
- **Printed score math** everywhere + `DOCTRINE` constants table at `#/health`.

### §3 Self-caught defects during authoring (per convention)

1. Roster cadence `<input>` sits inside a row with `data-act="dossier"` — unguarded, every edit opened the dossier. Fixed with a target guard in `onClick`.
2. Required playbooks `select`s defaulted silently to their first option (would have written "as expected" outcomes nobody chose). Fixed: empty option whenever no value pre-exists; required validation rejects the empty choice.
3. R8 reporting-line doctrine was written `length !== 1`, allowing grand-skip lines (≥2 leads between) to fire with a misleading basis comment. Fixed to exactly `length === 2`; G10 covers direct-vs-skip-vs-broken.
4. `playbooks.situational.compose` preview string contained a stray `'D?'` artifact — cosmetic, caught in reread.
5. FieldSpec `hint` strings were dropped between playbook definitions and the tuple renderer. Fixed by riding the hint/preview markers on the tuple.

### §4 Divergence register (re-authored vs continued — labeled per the session rule)

| mf-1 element | Status for mf-2 |
|---|---|
| store.js doctrine (quarantine/trySetItem/rewire/isShape) | **Carried** (full read); extended with ladder + normalize + usage() |
| events.js (emit/projections/seed/purge) | **Carried**; `goal.assign` fold FIXED; reportsTo added; demo seed extended for R8/playbooks |
| engine R6/R7 bodies, DOCTRINE, ctx | **Carried in substance** (read); R7 re-expressed on the shared `fin()` shape |
| engine R2–R5 bodies, run(), G1–G9 | **Re-authored** (unreadable); mf-2 G-suite is G1–G12 and covers all 8 rules + boundaries + malformed + memory |
| ui.js (views, CAPTURE types, T1–T8) | **Re-authored in substance** (logic read, markup stripped); views extended to Today/Roster(+dossier)/Playbooks/Health/Data; T-suite is T1–T10 |
| Delegation level wording | **Carried verbatim** as readable in the stripped ui.js fetch |
| Monolith `v3` stores / `SESSION-3.patch.md` anchors | Still **unverified by construction**: mf-2 keeps them quarantined read-only; no migration invented |

### §5 Expected (NOT yet observed) test outcomes — labeled unverified until run

T1–T10 and G1–G12 are authored to pass against the shipped code by construction and three rounds of self-review; the authoring environment cannot execute them. The authority is `#/health` on your machine. If any row shows FAIL, that row is the truth and this section is the record of the miss.

### §6 Repo actions required of the next session

1. DELETE `package.json`, `package-lock.json`, `tsconfig.json` (Blocker 1).
2. Fold this entry into `AI-SESSION-LOG.md` proper.
3. Replace the 6 build files with the mf-2 set (tree: `index.html`, `css/app.css`, `js/store.js`, `js/events.js`, `js/engine.js`, `js/playbooks.js`, `js/ui.js`) — existing `leados:data` v1 stores migrate automatically (T10 path).
