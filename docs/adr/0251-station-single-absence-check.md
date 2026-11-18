# ADR-0251 — Single-absence staffing check for simultaneous stations

Date: 2026-11-18 · Status: Accepted · Schema v204 unchanged · CSV scope #148 extended

## Decision

On `#/standard-work?panel=stations`, show which current or upcoming windows can cover
one absence, and expose the staffing constraint before the shift starts. A feasible
plan under [ADR-0201](0201-skill-constrained-simultaneous-station-coverage.md) does not
prove a contingency: two stations can each have two qualified people, yet both can
rely on the same two people. The existing `single-point` station flag, duty handovers
and Bus Factor answer different questions; none reruns simultaneous staffing after a
candidate is removed. Targeted code and roadmap search, not a repository-wide or
market-first claim.

**Duty and coverage:** frontline supervisors and mid-managers in single-chain and
matrix structures check shift cover. Directors, VPs and CEO seats read their existing
reporting reach without receiving the scenarios or the station proof for windows they
do not hold. No new seat, escalation, rule, settings, stored result, or scheduling write.

### Inputs and proof

- Only non-retired, non-past windows with at least two concurrent stations and an
  already feasible baseline are tested. A failed baseline is not an absence finding.
  An unresolved prerequisite refuses the check; a confirmed one is not re-simulated.
- Recheck baseline using full-window availability, the latest readable U/O attestation
  effective at read time and valid through the window's end, and a live qualifying task
  belonging to the window holder. An unreadable or future-dated skills ledger refuses
  the check rather than resurrecting older proof. Active reporting lines are the
  existing matrix snapshot at read time, not a forecast. A borrowed worker may enter
  via a live line; each person has one identity and one declared capacity per window.
- Apply **N−1 contingency screening** to **capacitated bipartite matching**
  (Hall's condition in network form, max-flow/min-cut duality). Start from an exact
  baseline flow. For every distinct declared candidate, remove their whole capacity.
  If the baseline used none of it, that assignment already witnesses coverage;
  otherwise cancel the absent candidate's assignments and rematch with residual arcs.
  A station-to-person arc has capacity one even when a person can cover more than
  one station. For one worst recorded result, print the residual cut's station set.
  Its capacity bound is `sum(min(person capacity, eligible stations in the set))`;
  cut demand minus that bound must equal the residual shortfall or the result is refused.
- An absence check can pass from recorded cover alone, even with a silent potential
  candidate: losing someone outside the witnessing assignments cannot break them. A
  recorded shortfall does **not** certify a shortage if full-window availability is
  missing for an eligible person. In that case the declared-only gap prints separately
  under **Not proven**. Never count silence as a refusal, infer absence probability,
  identify which person triggered a shortfall, or score any person.
- A shared per-read work budget (5 million graph-accounting units: forward arcs,
  residual copies/cancellations and arc inspections) prioritizes earlier windows and
  refuses unfinished checks. No partial sweep becomes a result. Declaration and
  post-commit paths do not run the contingency check.

### Presentation and disclosure

Use the existing Stations panel and seat-scoped brief. Five outcomes partition visible
live windows: tolerant, exposed, not proven, withheld, not tested. Reconciliation of
those counts and definiteness of all the evidence are separate claims. The holder or
local operator receives the candidate counts and one worst-case station proof. A span
receives window outcomes above the configured candidate floor, with no scenario
counts, candidate identities, or witness details. The public station report omits the
engine's raw input bundle; local-first workflow seats still are not authentication.
CSV #148 includes the same outcome counts and flags the reader produced, not candidates,
window labels, or witness rows. Existing CSV refusal text uses fixed reasons rather
than interpolating labels from the screen.

This slice does not simulate the same absence across windows, simultaneous absences,
sequential work, attendance, working-time rules or staffing allocations. Do not use
it as a roster, regulatory clearance, or safety authorization.

## Benchmark

Published [shyftplan AI scheduling](https://shyftplan.com/en/shift-planning/workforce-scheduling-software)
and [UKG Shiftboard coverage optimization](https://www.ukg.com/glossary/what-employee-scheduling-complex-operations)
set the operational bar: qualifications and availability constrain recovery across
assignments, not just one eligible replacement for one opening. Google's
[Workforce Scheduling API](https://developers.google.com/optimization/service/reference/rest/v1/scheduling/solveShiftScheduling)
sets a formal bar for explicit mandatory coverage and feasible/infeasible solver
outcomes. The independent allocator checks LeadOS against that constraint-respecting
standard on the smaller declared problem. The differentiator here is an exhaustive
one-person sensitivity check with a reconciled capacity cut and explicit refusal for
missing evidence, not a claim about what another solver cannot do. Vendors publish
broader rostering, compliance and workflow integrations; LeadOS does not provide them
here. **[BENCHMARK-UNVERIFIED]** for hands-on comparative parity and production-scale timing.

## Verification and release scope

Focused tests use an independent allocator on 2,048 graph/capacity/demand combinations
and cross-check actual stored availability, the computed result, the rendered Stations
panel (JSDOM), the seat-scoped brief and aggregate CSV. Adjacent station and prerequisite
behavior also exercised; see the dated [session log](../../AI-SESSION-LOG.md). No new
visual or onboarding asset; the table and brief display live computed output. Higgsfield
connector lookup returned `unsupported`. The tracked offline HTML distribution was not
rebuilt for this source change. Full suite, real browser and assistive technology are
**[UNVERIFIED]**.
