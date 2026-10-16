# LeadOS pt-12 — Organizational Dynamics

A universal leadership and management operating system. Append-only event log, **107 validated
event types**, **62 pure rules** (R1–R40 individual · R41–R45 correlation · R46–R52 conversation
· **R53–R62 organizational**), a correlation engine (clusters · confidence-weighted decayed heat
· named patterns · benchmark gating · **network analysis · culture scoring · meeting load**), a
conversation preparation system, and 20 interactive playbook runners. Everything derived per
read; nothing derived is ever persisted.

**Run it:** open `index.html` in any modern browser. No server, build step, framework, network,
or CDN. One localStorage key.

**Verify it:** open `#/health` — the authority wall. Where this file and `#/health` disagree,
**`#/health` on your machine wins.**

---

## §0 Claim-vs-inspection audit

| Claim | Status |
|---|---|
| Upstream tree @ `a1ed70f`: 22 flat entries, no `css/`/`js/`, npm scaffold + `rules.js` tombstone, unbootable as shipped | **BYTE-VERIFIED** (pt-7 session, git trees API) |
| `store.js` full read — schema ladder, repair counting, single key, import gate | **BYTE-VERIFIED**, ported near-verbatim |
| `engine.js` fold table / buckets / aliases / open-sets / roster; pt-5 handlers; pt-6 pattern library; upstream heat `sev × decay^ageDays` (no CONF_FACTOR); upstream insight shape; promotion-rule string | **BYTE-VERIFIED (those regions)** |
| `events.js` full registry · `health.js` · `ui.js` · upstream `playbooks.js` · `HOT_SCORE` | **NOT VERIFIED** — beyond fetch truncation; never claimed |
| pt-8 … pt-12 briefs | received in full, implemented literally; every interpretation labeled |

No new upstream reads this session. **Registry: 107 contracts** (85 + 2 + 10 + 10).

## Module registry (the brief's file list, structurally)

This line has shipped **three physical files** since pt-7 (the delivery clause). The brief's
script list lives as `LeadOS.EXPECTED_MODULES`, in the brief's load order, enforced by the boot
guard (which halts and names a missing module) and asserted by G10:

`util · events · store · engine · rules · correlate · conversations · health · playbooks · ui`

`analyzeNetwork` / `scoreCulture` / `meetingLoad` extend **`correlate`**, exactly as the brief
specifies ("extend js/correlate.js").

## Schema v7 — `MIGRATIONS['6>7']`

Backfills `influenceNetworkDecayDays` **180** · `cultureSignalWindowDays` **90** ·
`infoPipelineCheckCadenceDays` **30** under the unchanged contract (leader values never
overwritten, every repair counted, idempotent). A v3 store climbs to v7.

## Organizational Network Analysis

`analyzeNetwork(P, today)` builds a directed weighted graph from `org.network.edge` events inside
`influenceNetworkDecayDays`, with **edge weight = `strength × decayFactor^(age_days / 30)`** —
the decay math is printed on every edge, and edges outside the window are listed as dropped with
their reason. Every output carries the standing label:

> **approximation derived from YOUR logged observations — not a sociometric study; the graph
> contains only edges you recorded.**

| Function | Exactness — as printed at runtime |
|---|---|
| `indegree` / `outdegree` / `weightedIn` / `weightedOut` | exact counts/sums over the decayed edge set |
| `betweenness` | **SIMPLIFIED** — one BFS shortest path per ordered pair, interior nodes credited. **Not exact Brandes** (which credits all shortest paths fractionally) |
| `stronglyConnected` | **EXACT** — Tarjan over the collaboration subgraph, O(V+E) |
| `bridges` | **SIMPLIFIED** — articulation *nodes* on the undirected projection (remove-and-count-reachable), not Tarjan bridge-*edges* |
| `clusters` | multi-node SCCs only |
| `isolates` | roster ∪ graph nodes with no collaboration edge |
| `informationBottlenecks` | high betweenness **AND** a blocked `info.pipeline.check` through them |

**`scoreCulture`** — `(positive_weighted − negative_weighted) / total_weighted × 10`, clamped
**0–10**, with `value-violated` and `villain-named` at **2× weight**. That coefficient is printed
everywhere as *"a PRINTED ASSUMPTION from organizational-psychology literature (bad signals are
stickier than good ones), NOT a coefficient measured in your org."* The score is labeled a
**composite observation, not a measurement**; with no signals it returns **null**, never a
flattering default (G58).

**`meetingLoad`** — hours/week per person, outcome distribution by *minutes* (the cost is time),
wasted-hours per person, and the loaded cost **only if you logged one** ("never invented").

## Rules R53–R62

| Rule | Fires | sev / conf |
|---|---|---|
| **R53** | roster person with no `org.network.edge` (any type), no 1:1 in 30d, no skip-level | 3 / MEDIUM — *absence of signal is the signal*, labeled |
| **R54** | `info.pipeline.check` blocked ≥ 2× for the same (from,to) in 60d | 3 / HIGH |
| **R55** | any `culture.signal` `value-violated` — **single event, immediately**, description verbatim | 3 / HIGH |
| **R56** | culture score drops **strictly more than 2** (30d vs prior 30d); score < 4 | 3 / MEDIUM (trend) · 4 |
| **R57** | psych safety ≤ 2 → 4 · = 3 → 3 · none in > 90d → 2 — **method printed in basis** | 4 / 3 / 2 |
| **R58** | `org.silo.logged` severity ≥ 3 unresolved (clamped 3–4); > 60d → 4 | 3–4 / HIGH |
| **R59** | `informalPower ≥ 4` **and** `formalPower ≤ 2` | 2 / MEDIUM — advisory, not an alarm |
| **R60** | `meeting.audit` wasted ≥ 40% → 3 · ≥ 60% → 4 · none in > 60d → 1 | 3 / 4 / 1 |
| **R61** | trust `lost` with no later `gained`, ≤ 90d; 2 distinct sources → 4 | 3 → 4 / MEDIUM |
| **R62** | R19 attrition **and** the leaver is top-2 by betweenness — betweenness printed | **5** / MEDIUM |

R62 is sev 5 on a MEDIUM confidence deliberately: *the departure is a fact, the graph is your
observations* — and that split is printed in the finding.

## New playbooks (6)

`culture-audit` · `network-review` · `silo-break` · `meeting-audit` · `trust-repair` ·
`psych-safety-build` — each prefills from the live log and emits **event specs you review before
anything is appended**. `silo-break` prints why it writes `objective.set` rather than a `goal.set`
the registry does not have, and why the second joint owner lives in the objective text.

## Views

`#/today` · `#/signals` · `#/insights` · `#/heatmap` · `#/benchmarks` · `#/conversations` ·
**`#/org`** (network summary · culture gauge with 30d trend · silo register · power map · meeting
load · open lost-trust pairs · quick capture) · `#/dossier` (now with **network position** —
in/out degree, betweenness with its approximation label, isolate and bridge flags, power map,
meeting load — plus **trust signals** involving the person) · `#/playbooks` · `#/health` · `#/data`.

## Health wall

**T1–T37** (pinned fixtures, epoch `2026-02-16T12:00:00.000Z`) · **G1–G10 · G31–G59** ·
**claims C1–C15**.

> **ID map, printed because ids are the contract:** this brief numbered its checks T31–T35, but
> T31/T32 were taken in pt-11. They ship as **T33–T37** (brief T31→T33 · T32→T34 · T33→T35 ·
> T34→T36 · T35→T37). **G51–G59 keep the brief's ids; brief G60 is folded into G40**, which now
> asserts all **62** rules fire from the extended seed (the T12b requirement).

## Explicit non-claims

- **The browser is the grader.** No JS runtime at authoring time; correctness is by construction
  and fixture tracing. Every count is executable in `#/health`; none is claimed observed.
- **Labeled interpretations:** CONF_FACTOR values · findings-suppression mechanics · ENG-fault
  embodiment · `playbook.completed`/`plan.checkin` shapes · R48's "same period" window · R50/R53's
  "direct report" = roster-membership proxy (**no `reportsTo` contract exists**) · conflict pairs
  derived from `mediation.held` alone (**no `conflict.raised` contract exists**) · the culture 2×
  weight · betweenness and bridges as **approximations**.
- **The graph is only what you logged.** Network analysis is not a sociometric study; a person
  absent from the graph is absent from your observations, which is precisely what R53 says.
- Heat and culture are composite signals, not measurements. The seed is a fixture, not a
  diagnosis. Nothing here is legal, HR, or financial counsel.
- No accounts, no sync, no network, permanently. Data leaves only when you export it.

## Ranked next

1. **`conflict.raised` / `conflict.resolved`** — pairs still derive from mediations alone.
2. **`reportsTo` + 1:1 cadence contracts** — would retire the roster proxy in R50/R53 and the
   heritage proxies in LEADERSHIP_VACUUM simultaneously.
3. **Exact Brandes betweenness** — would let R62 drop its approximation caveat.
4. **`production-stop` interactive brief** (requested pt-9, still outstanding).
5. **Byte-verify the unread upstream bodies**; reconcile registry counts honestly.
6. **Executive/board pack** (upstream queued #1, carried since pt-7).
