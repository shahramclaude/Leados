# LeadOS — AI Session Log, pt-4 part 1 (Schema v4)

## §0. Claim-vs-inspection audit (written before any new code)

The pt-4 brief claims a pt-3 codebase of 10 files is attached and must be
carried exactly. Audit before writing anything:

| # | Claim (from brief) | Inspection performed | Result |
|---|---|---|---|
| 1 | `index.html` exists (pt-3 shell) | `read_file index.html` | **ABSENT** — file does not exist |
| 2 | `js/store.js` exists (pt-3 store) | `read_file js/store.js` | **ABSENT** — file does not exist |
| 3 | Remaining 8 pt-3 files exist (`css/app.css`, `js/events.js`, `js/engine.js`, `js/playbooks.js`, `js/health.js`, `js/ui.js`, `README.md`, `AI-SESSION-LOG.md`) | `grep_files` for `leados\|schemaVersion\|MIGRATIONS` across workspace | **ABSENT** — zero files matched |
| 4 | Doctrine: vanilla JS, no network/CDN | not inspectable (no code) | treat as binding constraint; verified post-build (G-suite + source scan) |
| 5 | Doctrine: one key `leados:data`, lineage `pt`, schema increments to v4 | not inspectable | implemented + G1/G2 |
| 6 | Doctrine: append-only; nothing derived persisted; `project()` per read | not inspectable | implemented + G3/G4/G7, T7 |
| 7 | Doctrine: health.js authority wall; T+G cover every claim | not inspectable | implemented + claim coverage map |

**Audit verdict.** No pt-3 code is physically present, so no claim about pt-3
behavior can be honored by extension. Fabricating silent continuity would
violate the doctrine this lineage stands on.

**Decision (recorded, not hidden):** faithfully reconstruct the pt-1 → pt-3
lineage from the doctrines stated in the brief — genesis at schema v4, with
`MIGRATIONS['1>2']` and `MIGRATIONS['2>3']` provided as honest replay-repair
passes for real historical payloads (v1 settings blob, v2 legacy type names) —
then implement pt-4 part 1 exactly as specified. Every reconstructed doctrine
is placed under executable T/G coverage so the reconstruction is itself
inspectable. Consequence: `migrationsApplied` on a fresh store is empty
(genesis at v4), which G6 accepts.

## §1. Scope of this part

Schema v4 — `MIGRATIONS['3>4']`: backfill `salesCycleDays` (90),
`revenueReviewCadenceDays` (30), `opsReviewCadenceDays` (14),
`boardCadenceDays` (90), `complianceAuditCadenceDays` (180); count all repairs
in `meta.migrationRepairs`. Foundation wiring so the new settings are load-bearing
(cadence engine, sales-cycle flag, 15-domain playbook map).

## §2. What was built (per file)

- `js/events.js` — registry contract for 15 event types + 15-domain map; append-gate validator.
- `js/store.js` — single key, genesis, `1>2`/`2>3`/`3>4` migrations; repair counting rule: any write beyond the version bump is a repair; repairs append as events and accumulate per migration id.
- `js/engine.js` — `project()` fold; pure selectors with injected `now` (cadenceStatus, decisionQueue, riskRegister, krView, taskLists, domainRollups).
- `js/playbooks.js` — 15 playbooks; domain→rhythm binding; emits event specs, never writes.
- `js/health.js` — T1–T9, G1–G7, and a claim→coverage map (C1–C9); boot gate runs G and halts on failure.
- `js/ui.js` — 8 views (Command, Domains, Cadences, Decisions, Risks, Event log, Health, Settings); rendering is project-per-read; inline SVG icons (no network).
- `index.html`, `css/app.css` — shell + hand-rolled design system; zero external references.
- `README.md` — doctrine, schema v4 table, rhythm map, file table (exactly the 10 delivered files).

## §3. Verification — claim coverage for pt-4 part 1

| Claim | Proof |
|---|---|
| Five v4 settings exist with exact defaults | T1, T2, G5 |
| Backfill appends repair events; never overwrites leader-set values | T4, G3 |
| All repairs counted in `meta.migrationRepairs`, reconstructible from the log | T5, G6 |
| `3>4` idempotent on replay | T3 |
| Single key / schema v4 / lineage pt | G1, G2, G4 |
| Append-only; nothing derived persisted; pure projection | G3, G4, G7, T7 |
| Cadences derive from v4 settings | T6, G5 |
| `salesCycleDays` drives the beyond-cycle flag | T9, G5 |
| Every event is registry-valid | T8, G3 |

Manual verification path: open `index.html` → boot gate runs G-suite → Health
tab shows T and G suites green and all claims *proven*. Settings tab shows each
v4 key, its default, current value, and source event (repair events labeled
with their migration id).

## §4. Deviations and admissions

1. **Reconstruction, not extension** — §0 records why. This is the only
   material deviation from the brief, and it is forced by evidence, not choice.
2. Settings are restricted to the known-defaults whitelist (validator rejects
   unknown keys) to keep the G5 inspection total.
3. Cadence boundary semantics: strictly-past-due is `overdue`; within 24h of
   due is `due`; exactly at due is `due`.

## §5. Next parts (queued)

- Part 2: finance/revenue event families (deals, invoices) consuming `salesCycleDays`.
- Part 3: people-operations module.
- Part 4: board pack compiler for the `boardCadenceDays` rhythm.
