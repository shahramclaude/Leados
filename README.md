# LeadOS pt-4 — Universal Leadership OS

A universal leadership and management operating system covering every domain where
leadership and management decisions are made: engineering, finance, sales, product
strategy, operations, people/HR, marketing, manufacturing/production, design, R&D,
legal/compliance, customer success, supply chain, executive/board, and business
development — 15 domains, one operating rhythm.

**Run it:** open `index.html` in any modern browser. No server, no build step, no
framework, no network, no CDN. Everything runs locally against one localStorage key.

---

## Architecture doctrine (non-negotiable)

| Doctrine | Enforcement |
|---|---|
| Vanilla JS only — no framework, no build step, no network, no CDN | classic `<script>` tags; registry validation; no external references anywhere |
| Exactly one localStorage key: `leados:data` | G1 inspects `localStorage` keys |
| Lineage `pt`; schema v4 | `store.js` constants; G2 verifies |
| Append-only event store | seq/id/time integrity checked by G3; no update/delete API exists |
| Nothing derived is ever persisted — `project()` runs per read | root/meta whitelists (G4); projection purity (G7, T7) |
| `health.js` is the authority wall | boot gate runs G-suite; failure halts rendering; every claim maps to T/G checks (see Health tab) |
| AI-SESSION-LOG §0 opens with a claim-vs-inspection audit | see `AI-SESSION-LOG.md` |

## Event sourcing in 60 seconds

- Writes happen only through `store.append(type, payload)` after registry validation.
- The log is the only persisted state: `{ schemaVersion, meta, events }` under `leados:data`.
- `engine.project(events)` folds the log into state **on every read**. Selectors
  (cadences, decision queue, risk register, domain rollups) are pure functions of
  `state` and an injected `now`.
- Migrations never rewrite history to look nice — they **append repair events**
  (`meta.repair: true`) and count every repair in `meta.migrationRepairs`.

## Schema v4 — `MIGRATIONS['3>4']` (this part)

v3 → v4 backfills five universal-domain settings. For each key, the migration
replays the log; only if the leader never set it does it append a repair event
with the v4 default. Leader-set values are never overwritten.

| Setting | Default | Governs |
|---|---|---|
| `salesCycleDays` | 90 | Beyond-cycle flag on open sales decisions |
| `revenueReviewCadenceDays` | 30 | Revenue review rhythm (finance, sales, marketing, customer success, bizdev) |
| `opsReviewCadenceDays` | 14 | Ops review rhythm (engineering, product, design, R&D, people, operations, manufacturing, supply chain) |
| `boardCadenceDays` | 90 | Board meeting rhythm (executive) |
| `complianceAuditCadenceDays` | 180 | Compliance audit rhythm (legal) |

Repair counting rule: a **repair** is any write a migration performs beyond
bumping `schemaVersion`. Repairs are accumulated per migration id in
`meta.migrationRepairs`, and each domain-data repair is also reconstructible from
the log itself (G6 proves the two agree). `3>4` is idempotent: replaying it
appends zero repairs (T3).

Earlier migrations (reconstructed lineage): `1>2` relocates a persisted settings
blob into the log and purges it; `2>3` normalizes legacy type and field names.

## Domain → review rhythm map

| Rhythm (setting) | Domains |
|---|---|
| Revenue review (`revenueReviewCadenceDays`) | finance, sales, marketing, customerSuccess, bizdev |
| Ops review (`opsReviewCadenceDays`) | engineering, product, design, rd, people, operations, manufacturing, supplyChain |
| Board meeting (`boardCadenceDays`) | executive |
| Compliance audit (`complianceAuditCadenceDays`) | legal |

## Health — the authority wall

- **T-suite (fixtures, deterministic):** T1–T5 prove `3>4` behavior (backfill set,
  exact defaults, idempotence, user-value preservation, repair accounting); T6
  cadence boundaries; T7 projection purity; T8 registry rejection; T9 sales-cycle flag.
- **G-suite (live store):** G1 single key; G2 schema/lineage; G3 append-only
  integrity + registry validity of every event; G4 whitelist (nothing derived
  persisted); G5 live projection holds the v4 settings; G6 repair accounting
  consistent; G7 deterministic non-mutating reads.
- **Claims:** the Health tab lists every pt-4 claim with the checks that
  authorize it. A claim with a failing check is visibly *unproven*.

## Files

| File | Role |
|---|---|
| `index.html` | Shell; loads the six scripts in doctrinal order; hosts the authority-wall overlay |
| `css/app.css` | Hand-rolled design system; zero external assets |
| `js/events.js` | Event registry + domain map; the append-gate contract |
| `js/store.js` | Persistence wall: single key, schema v4, `MIGRATIONS['1>2'/'2>3'/'3>4']`, `meta.migrationRepairs` |
| `js/engine.js` | `project()` fold + pure selectors (cadences, decisions, risks, rollups) |
| `js/playbooks.js` | 15-domain playbook library; domain→cadence binding; emits event specs only |
| `js/health.js` | Authority wall: T-suite + G-suite + claim coverage map |
| `js/ui.js` | Vanilla renderer; project-per-read; every action is an event append |
| `README.md` | This file |
| `AI-SESSION-LOG.md` | Session log; §0 is the claim-vs-inspection audit |

## Roadmap (pt-4 remaining parts)

- **Part 2 — Finance & revenue engine:** deal/invoice event families, pipeline
  aging on `salesCycleDays`, revenue-review pack generator.
- **Part 3 — People operations:** org/role events, attrition signals, succession map.
- **Part 4 — Executive/board pack:** one-click board narrative compiled from the log.
