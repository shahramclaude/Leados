# ADR-0018 — Cognitive Load & Attention Governor: measured saturation on a role, from the leader's own records, with queueing-theory guardrails

- **Status:** Accepted
- **Date:** 2026-10-27
- **Session:** 52
- **Supersedes:** nothing. **Extends:** ADR-0008 (post-commit rules spine, new
  rules `RULE-LOAD-01..04`), ADR-0006 (canonical zero-build app: no backend,
  no network call, no new runtime dependency), the capacity portfolio
  (Schema v16) and its focused-hours supply model, the Influence Network
  projection (ADR-0014, reused for strong-tie degree), and the onboarding
  ramp conventions already used by `personSupply`.

## Context

LeadOS could price *work* (capacity, tempo, allocation) but never measured
the **person-side constraint** that decides whether any plan survives
contact with the week: the finite cognitive capacity of the people doing
the work. Team Topologies (Skelton & Pais, 2019; 2nd ed. 2025) holds that a
team fails when responsibility exceeds its cognitive capacity and prescribes
splitting teams on load, not headcount — but its guidance is deliberately
qualitative, a workshop vocabulary (intrinsic / extraneous / germane load
after Sweller). The 2026 tooling hunt (RESEARCH §60) found what the market
sells instead: hour-booking heatmaps (Toggl 2.0, Float, Asana), drag-and-drop
rebalancing and predictive "smart scheduling" (Teamwork, October 2026),
utilization dashboards (Productive, Runn), and surveillance-derived
collaboration metrics (Microsoft Viva Insights, with minimum-group sizes
that already concede the privacy problem). None of them:

1. separates **intrinsic** load (the work itself) from **extraneous** load
   (switching, coordination, stewardship) and **germane** load (learning
   that must be protected, not penalised);
2. models the *queueing* consequence of load — Little's Law (`L = λW`) and
   the Kingman (1961) congestion formula, where expected wait grows as
   `ρ/(1−ρ)` and explodes as utilization approaches one;
3. runs deterministic, auditable governance rules on-device over records the
   leader already keeps, with no calendar, email, keystroke or message
   telemetry; or
4. treats the result as load on a **role in a system**, never a rating of
   the person.

A repository search before this session returned no saturation-index,
Kingman-wait or cognitive-band machinery. The existing Capacity terminal
models *team* utilisation against PERT supply but deliberately does not
attribute coordination, WIP-switching or ramp protection per person; the
Resilience bus-factor and Influence Network centrality answer different
questions. The gap was real and unclaimed. (Competitor claims rest on
search snippets and buyer guides, **[UNVERIFIED]** against hands-on trials.)

## Decision

1. **No new persisted collection — four policy settings only (Schema v34).**
   Saturation, queueing and coordination are **derived live** on every call
   from portfolio items, the roster graph, stewardships and onboarding
   plans. The migration (`33 → 34`) is additive and installs only
   `loadSaturationPct` (80), `loadOverloadProbPct` (80),
   `loadThroughputWindowWeeks` (8) and `loadAutoPropagate` (true); nothing
   is backfilled, because a stored index would be a stale rating the moment
   any record changed and would quietly become a performance file. The
   normalizer clamps all four to documented ranges and preserves an
   explicit `false` pause.

2. **One transparent index, four named components, fixed cut-points.** The
   per-person saturation index is `0.40·utilization + 0.25·WIP +
   0.20·coordination + 0.15·commitments`, weights exported as
   `LOAD_WEIGHTS` and rendered in the policy tab — no hidden model.
   Utilization is expected PERT effort of open funded commitments against
   the person's own ramp-adjusted, reserve-discounted allocatable supply
   (reusing `personSupply`, so onboarding and future-joiner conventions are
   inherited, not re-implemented). WIP is open funded commitments against
   twice the shared WIP-limit convention. Coordination prices strong-tie
   degree (the ADR-0014 projection), `1.5 × direct reports`, and weighted
   stewardship obligations against a budget of ten raw units; the team
   panel also reports Brooks's `n(n−1)/2` communication channels and
   network density. Commitments price active delegations and open
   operational cases against a budget of six. Bands are headroom (<40),
   managed (40–64), elevated (65+), saturated (leader threshold, default
   80) and overloaded (95+); the threshold is a policy dial, never a
   biological constant.

3. **A seeded Monte Carlo answers "will this fit?", and unmeasured work is
   never sampled as zero.** Each measured commitment contributes a
   Beta-PERT draw against the person's horizon supply using the existing
   seeded RNG and `simulationTrials` setting, so the probability is
   reproducible per person and explainable by hand. Commitments without a
   measured triple are counted separately as *unquantified* and excluded
   from every draw — zero-filling would make invisible work look like free
   capacity. A flag fires at the leader-owned probability threshold.

4. **Per-person Little/Kingman queueing with honest evidence floors.**
   Throughput is completed items per week inside the configurable window;
   median cycle time uses recorded `createdOn → completedOn`. Expected
   cycle is Little's Law (`WIP ÷ throughput`); expected wait is Kingman's
   `(ρ/(1−ρ))·c·cycle` with house convention `c = 1` (the variability
   constant is exported and labelled a convention). Below two completions
   the queue is **counts-only** (throughput and wait are `null`, never
   invented); 2–4 completions are **provisional**; five or more are
   **learned/high** — the same n=5 floor every other LeadOS engine uses.
   When `ρ ≥ 1` the system reports *unstable* and returns no finite wait:
   a fabricated number at the singularity would be a lie, and the Capacity
   terminal's own Kingman multiplier already carries the same meaning.

5. **Germane load is protected, never scored.** A person still ramping
   (active onboarding/transition plan, supply factor below one) is flagged
   on the report but the ramp never enters the index as a penalty; instead
   `RULE-LOAD-04` asks the in-roster manager to move a commitment so
   learning time is protected, once the ramping person reaches the
   elevated band.

6. **Four idempotent post-commit rules, one automatic artefact class.**
   - `RULE-LOAD-01`: a saturated/overloaded person with at least one open
     funded commitment gets **exactly one** DACI load-shedding decision
     with four named options (defer the lowest value-density thread;
     reassign the heaviest to the lowest-index teammate with headroom, or
     honestly state none exists — itself a hiring signal; open a
     requisition; renegotiate scope/dates), plus typed `involves`
     (person→decision) and `decides` (portfolio→decision) links in the
     same transaction. Registered upstream of the decision-tempo rule so
     the new decision is timed in-transaction (ADR-0008 ordering).
   - `RULE-LOAD-02`: WIP above the convention queues one blameless
     stop-starting talking point; it **self-clears** when WIP returns.
   - `RULE-LOAD-03`: a Monte Carlo flag *inside* the WIP limit queues a
     commitment-size (split/re-baseline) prompt; mutually exclusive with
     02, because one thread cannot be both a switching problem and a size
     problem.
   - `RULE-LOAD-04`: the germane-load protection prompt above, routed to
     the manager and self-clearing once ramped or back in managed band.
   Every artefact carries a `[RULE-LOAD-xx:personId]` marker that makes
   re-scans converge (no duplicate decisions or prompts) and is written to
   survive the 200-character talking-point normalizer. Triggers are the
   generalized prefix/exact set (`portfolio.`, `delegation.`,
   `dependency.`, `person.archived`, `person.restored`, `load.scan`) —
   event-driven through the ADR-0008 spine, not hardcoded glue. The pause
   switch blocks event fan-out but an explicit human `load.scan` always
   runs: a paused governor must still answer when asked.

7. **Data-minimised outputs by construction.** Signals `LOAD-01..05`
   merge into the existing Insights feed under "Load & attention". CSV
   scope #34 emits one row per active person under an opaque
   `load_person_n` code (deterministic id-sort, no names, roles or free
   text), every component score, the queue evidence and its confidence,
   the policy thresholds and the engine version. The deterministic board
   brief names the system constraint (Goldratt) and states on every page
   that this is not a performance rating.

8. **The demo exercises every path without inventing work.** The demo
   workspace sets a visible, user-editable `loadSaturationPct: 70`
   policy; one real, already-recorded team member (a role-transition
   ramp with three open funded threads) then lands at index 76, P(overload)
   = 1, producing one engine-opened shed decision plus WIP and germane
   talking points. Earlier in the session, fabricated demo portfolio items
   were tried and **deliberately removed**: the demo plan already sits at
   team ρ ≈ 0.992, where Kingman delay exists only below saturation, and
   any added effort pushed team utilization to ≥1.0 and silenced the
   Capacity terminal's CAP-02 signal — a regression. A policy setting on
   real records exercises the same code paths with zero fake data.

## Consequences

- The operating plan now has a measured, per-person demand side next to
  its supply side: a leader can see *which role* is the system constraint,
  *why* (utilization, switching, coordination or stewardship), what the
  queueing damage is, and gets a four-option decision instead of a red
  dashboard tile.
- The engine is pure and replayable: `buildLoadReport` never mutates its
  input, contains no wall-clock/DOM/storage access, and identical records
  produce byte-identical reports and Monte Carlo streams.
- New surface area: `app/core/domain/load.js`, `app/views/load.js` (four
  tabs: board, queues, coordination, policy), actions `setLoadPolicy` and
  `scanLoad`, CSV scope #34, LOAD-01..05 signals, schema v33 → v34,
  automation catalog 82 → 86 rules. No new runtime dependency, no network
  call, no persisted telemetry.
- Known limits, stated rather than smoothed over: the index weights and
  the Kingman `c = 1` convention are transparent management conventions,
  not empirically validated constants for a single team; throughput is
  measured from item counts, not effort-weighted flow (effort-weighted
  variants are a listed second pass); coordination reuses the influence
  network's tie floor, which needs at least two people with recorded
  affiliations; the Monte Carlo assumes PERT independence between items
  (correlated blockage is modelled by the dependency topology elsewhere,
  not here); the queue window requires recorded completion dates, so a
  workspace that never closes items stays counts-only — correctly, with a
  prompt to start recording rather than a fabricated baseline.
- Rejected this session: calendar/email/surveillance signal collection
  (privacy boundary and ADR-0006's no-backend rule; Viva-style minimum
  groups already concede the data is sensitive), persisting computed
  indexes (stale-rating hazard), hardcoded saturation thresholds (the
  policy dial replaces them), utilization percentage as the sole metric
  (it cannot see switching, coordination or germane load), and demo
  fixtures that perturb the existing Capacity equilibrium.
