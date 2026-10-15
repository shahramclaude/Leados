# LeadOS pt-4 — Universal Leadership OS

A universal leadership and management operating system covering every domain where
leadership and management decisions are made: engineering, finance, sales, product
strategy, operations, people/HR, marketing, manufacturing/production, design, R&D,
legal/compliance, customer success, supply chain, executive/board, and business
development — 15 domains, **87 event types under contract**, one operating rhythm.

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

## Schema v4 — `MIGRATIONS['3>4']`

v3 → v4 backfills five universal-domain settings as repair events (leader-set
values are never overwritten): `salesCycleDays` 90, `revenueReviewCadenceDays` 30,
`opsReviewCadenceDays` 14, `boardCadenceDays` 90, `complianceAuditCadenceDays` 180.
A **repair** is any write a migration performs beyond bumping `schemaVersion`;
repairs accumulate per migration id in `meta.migrationRepairs` and are
reconstructible from the log (T5/G6). `3>4` is idempotent (T3).

## Event registry (pt-4 part 2)

87 types under append-gate contract. The validator enforces: required fields,
field whitelists, enums, numeric types, numeric **ranges** (1–5 scales, 0–1
scores, −100…100 NPS), booleans, arrays, non-empty arrays, and per-type custom
rules (e.g. `chosen ∈ alternatives`, `metrics[]` shape, `keyResults[]` shape).

| Family | Types |
|---|---|
| Core (pt-1 → pt-4) | `store.initialized`, `settings.changed`, `objective.*`, `kr.*`, `task.*`, `decision.*`, `risk.*`, `review.*`, `playbook.applied` (15) |
| Finance & revenue | `fin.budget.set/actuals`, `fin.forecast.logged`, `fin.kpi.logged`, `fin.risk.logged/updated` (6) |
| Sales & revenue | `sales.deal.logged/updated/closed`, `sales.pipeline.reviewed`, `sales.quota.set/actuals` (6) |
| Product & strategy | `product.roadmap.item/updated`, `product.metric.logged`, `product.retro.logged`, `strategy.okr.set/progress/closed`, `strategy.decision` (8) |
| Operations & delivery | `ops.incident.logged/resolved`, `ops.sla.logged`, `ops.capacity.logged`, `ops.process.logged`, `ops.milestone.set/updated` (7) |
| People & HR | `hr.headcount.planned`, `hr.offer.logged`, `hr.attrition.logged`, `hr.performance.logged`, `hr.pip.started/closed`, `hr.engagement.logged`, `hr.compensation.reviewed` (8) |
| Marketing | `mktg.campaign.logged/result`, `mktg.brand.audit`, `mktg.content.published` (4) |
| Manufacturing | `mfg.production.logged`, `mfg.quality.logged`, `mfg.safety.incident`, `mfg.equipment.logged`, `mfg.yield.logged` (5) |
| Supply chain | `supply.vendor.logged/reviewed`, `supply.inventory.logged`, `supply.disruption.logged` (4) |
| Design | `design.review.logged`, `design.system.updated`, `design.research.logged`, `design.ux.metric` (4) |
| R&D | `rd.experiment.logged/result`, `rd.patent.logged`, `rd.tech.debt.logged/resolved` (5) |
| Legal & compliance | `legal.compliance.check`, `legal.risk.logged`, `legal.contract.logged/updated`, `legal.incident.logged` (5) |
| Customer success | `cs.nps.logged`, `cs.churn.logged`, `cs.escalation.logged/resolved`, `cs.health.logged` (5) |
| Executive & board | `exec.board.meeting`, `exec.kpi.reviewed`, `exec.investor.update`, `exec.crisis.logged/resolved` (5) |

Payload fields are carried exactly as specified, **plus** a system-generated
`id` on creation events whose entities are referenced later (e.g.
`fin.budget.actuals.budgetId`). That is the only deliberate payload addition, and
it is what makes referential integrity inspectable.

References are declared in the registry (`refs`, `refArrays`) and inspected by
**G8**: every `*Id` field in the log must resolve to an entity the log created.

## Derivation

`engine.project(events)` folds the log per read — nothing derived persists.
Entity families mutate in place within the projection (deals update then close;
OKR KRs take progress; incidents/milestones/PIPs/experiments/debt/contracts/
escalations/crises close). Selectors: cadences, decision queue (with the
`salesCycleDays` beyond-cycle flag), risk register, KR view, task lists, domain
rollups, `knownIds()`.

## Health — the authority wall

- **T-suite (fixtures):** T1–T5 migration `3>4`; T6 cadence boundaries; T7 fold
  purity; T8 core validator; T9 sales-cycle flag; **T10** fold flows across all
  11 new families (17 assertions); **T11** all 72 new contracts accept canonical
  payloads + 7 malformed payloads rejected.
- **G-suite (live store):** G1 single key; G2 schema/lineage; G3 append-only +
  registry validity; G4 whitelist; G5 v4 settings live; G6 repair accounting;
  G7 deterministic reads; **G8** referential integrity.
- **Claims C1–C12** in the Health tab: each claim shows the checks that
  authorize it; a failing check marks the claim *unproven*.

## Files

| File | Role |
|---|---|
| `index.html` | Shell; loads the six scripts in doctrinal order; hosts the authority-wall overlay |
| `css/app.css` | Hand-rolled design system; zero external assets |
| `js/events.js` | Event registry (87 types) + append-gate validator with refs/refArrays |
| `js/store.js` | Persistence wall: single key, schema v4, migrations with repair counting |
| `js/engine.js` | `project()` fold over all families + pure selectors + `knownIds()` |
| `js/playbooks.js` | 15-domain playbook library; emits event specs only |
| `js/health.js` | Authority wall: T1–T11, G1–G8, claim coverage C1–C12 |
| `js/ui.js` | Vanilla renderer; project-per-read; every action is an event append |
| `README.md` | This file |
| `AI-SESSION-LOG.md` | Session log; §0 is the claim-vs-inspection audit |

## Roadmap (pt-4 remaining parts)

- **Part 3 — Module surfaces:** finance/revenue cockpit (budget vs actuals,
  pipeline aging on `salesCycleDays`), people-operations view.
- **Part 4 — Executive/board pack:** one-click board narrative compiled from the log.
