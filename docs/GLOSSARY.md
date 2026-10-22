# Glossary — LEADOS

One vocabulary, defined once, used consistently across code, docs, and the
UI. If a term is used differently anywhere in this repository, that is a
bug — file it against this glossary.

| Term | Definition |
|---|---|
| **LEADOS** | This product. An organizational-intelligence dashboard that aggregates metrics, risk, consolidation, customer feedback, and process data so a human decision-maker can see the organization clearly. Not an autonomous decision-maker. |
| **Domain** | A named area of the business (e.g. Finance, Sales, People, ESG, Customer) that owns a set of metrics. |
| **Metric** | A single measured value with a target, a unit, and a period, belonging to one domain. |
| **Fitness score** | A 0–100 score per domain computed from the attainment ratio (`value / target`) of its metrics, averaged and clamped. 0 means "no data", not "healthy". See Seam 1. |
| **Engine** | A named monitored capability (typically an AI/ML or automated decision component) that is expected to be checked periodically. In this build, "engine" describes a *governance contract*, not a guarantee that a real model exists behind it — see `docs/EVIDENCE-LEDGER.md`. |
| **Assurance check** | A single recorded test of one engine at a point in time, with a result (pass/warn/fail) and a severity (info/warning/critical). |
| **Assurance summary / coverage** | The fleet-wide view across all engines: how many have ever been checked, how many are currently passing, and whether any check has gone stale (>90 days old by default). See Seam 2. |
| **Risk** | A named thing that could go wrong, with a belief score (0–1) representing the current estimated probability it materializes. |
| **Chaos experiment** | A deliberately run test against a risk's mitigations, with an outcome of `held`, `breached`, or `inconclusive`, which updates that risk's belief score. See Seam 3. |
| **Belief score** | The current probability estimate (0–1) that a risk will materialize. Updated by chaos experiments; asymmetric by design (a breach moves it up faster than a hold moves it down), because safety-relevant beliefs should be slow to relax and fast to escalate. |
| **Entity** | A legal or operating unit (subsidiary, region) with its own currency and financials for a period. |
| **Consolidation run** | The act of converting every entity's financials to USD and summing them for a period. Does **not** currently eliminate intercompany transactions — see `docs/EVIDENCE-LEDGER.md`. See Seam 4. |
| **Board pack** | The human-readable summary generated from a consolidation run, including an explicit disclosure of its own FX and elimination limitations, and an un-softened loss warning when net is negative. |
| **VoC (Voice of Customer)** | Raw feedback items from any source (survey, support ticket, sales call) tagged with a theme and a sentiment. |
| **Theme urgency** | A ranking of VoC themes by volume weighted by negativity, used to decide which themes most need a strategy response. See Seam 5. |
| **Strategy item** | A tracked initiative with an owner, status, and priority. VoC themes are matched to strategy items by a (deliberately simple, substring-based) heuristic. |
| **Process event** | A single mined step of a business process with a duration and a flag for whether it is automatable. |
| **Automation score** | The share of a process's total mined time spent in steps flagged automatable. See Seam 6. |
| **Seam** | A point where one part of LEADOS's data must flow into and change another part. This build proves six core seams end-to-end (code + test); see `docs/SYSTEM-MAP.md`. |
| **Verified / Partial / Planned / Not implemented / Accepted risk** | The five statuses used throughout `docs/EVIDENCE-LEDGER.md`. See that file for exact definitions. |
| **Fast tier** | The `npm run gate:all` sequence (lint, typecheck, unit tests, ledger:check) — designed to complete in well under 20 minutes. |
| **Slow tier** | `next typegen` + strict `tsc --noEmit` + `npm run build` (+ `build_and_start`) — the pre-deploy sequence, not run on every local iteration. |
