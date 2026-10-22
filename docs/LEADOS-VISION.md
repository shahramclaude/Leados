# LEADOS Vision — Human Command Over Organizational Intelligence

*Written so a board member and an engineer both understand it. Every claim
in §1 and §2 is traceable to `docs/EVIDENCE-LEDGER.md`. Nothing in this
document should be read as a promise about a future version unless it is
explicitly in §3.*

## 0. The philosophy, in one paragraph

An organization produces far more signal than any one executive can hold in
their head at once: metrics across every domain, the health of every
automated system it relies on, every risk it carries, the financial shape of
every entity it owns, what its customers are actually saying, and where its
people's time actually goes. LEADOS's job is to make that signal visible,
honestly, in one place — and then get out of the way. **The organization's
leadership remains in command.** LEADOS never decides anything; it surfaces
what is true (or admits what is unknown), and a human presses the button
that turns that into a decision.

## 1. What LEADOS is, today

Every sentence below is backed by a row in `docs/EVIDENCE-LEDGER.md`.

- LEADOS is a single-organization dashboard that proves six real,
  tested data seams end to end: domain **fitness** scoring from metrics;
  **assurance** monitoring across a fleet of engines; **chaos**-experiment
  results that update **risk belief** scores; **global entity**
  consolidation into a **board pack**; **voice-of-customer** feedback ranked
  by urgency and linked to **strategy** items; and **process-mining**
  events scored into an **automation** score.
- Every one of those six seams is backed by a pure, unit-tested function
  (`src/lib/*.ts` + `src/lib/*.test.ts`) and an API route that persists the
  result, so the calculation and the plumbing are tested separately and
  together.
- The dashboard (`src/app/page.tsx`) reads all six seams live from
  PostgreSQL on every page load — nothing on screen is mocked or
  hardcoded.
- The product is honest about its own limits in its own output: a fitness
  score of 0 means "no metrics recorded," not "healthy"; an engine that has
  never been checked is shown as "never checked," not "pass"; an engine
  whose last check is more than 90 days old is shown as stale, not as a
  standing pass; a board pack discloses that its FX rates are snapshots and
  that intercompany eliminations are not applied; a board pack never
  softens a negative net result.
- The quality gate (`npm run gate:all`) runs lint, strict TypeScript,
  24 unit tests covering all six seams, and an evidence-ledger
  self-check, in under five seconds on this machine, well inside the
  20-minute fast-tier budget. The slow tier (`next typegen`, strict
  `tsc --noEmit`, `next build`, and the platform's `build_and_start`
  health check) is documented and has been run and passed in this session
  (see `docs/VERIFICATION-LOG.md`).

## 2. What LEADOS is not

This list exists because a vision document that only describes success is
a marketing document, not an engineering one.

- **LEADOS does not replace human judgment.** Every mutating action (run a
  chaos experiment, run a consolidation, log VoC feedback, persist an
  automation score) is triggered by an explicit button press calling an
  open API — there is no autonomous loop that acts on the organization's
  behalf.
- **LEADOS does not know what it has no data for.** A domain with zero
  metrics reports a fitness score of 0, not an estimate. An engine with no
  check reports "unmonitored," not an assumed pass. This is a deliberate
  design choice, not an oversight — the alternative (interpolating or
  assuming) is how dashboards start lying.
- **LEADOS does not currently have authentication, authorization, or
  multi-tenant isolation.** Every API route in this build is open to
  anyone who can reach it. This is the single largest reason this build is
  not production-ready, and it is the first item in §3.
- **LEADOS does not have real AI/ML models behind its "engines."** The
  `engines` / `assurance_checks` tables model the governance *contract* a
  real model would need to satisfy (a name, a type, a periodic check, a
  severity) — there is no inference code in this repository. Any UI or
  copy that could be read as implying a working model exists behind, say,
  the "Revenue Forecast Engine" is a governance placeholder, not a claim
  of a working forecaster.
- **LEADOS's financial consolidation is not auditable or statutory.** FX
  rates are manually entered snapshots; intercompany transactions are not
  eliminated. The board pack says so, in the board pack itself, every
  time.
- **LEADOS's ESG metrics are self-reported** and are seeded in this build
  with a failing, critical assurance check specifically so the dashboard
  does not imply external verification that does not exist.
- **LEADOS does not have an audit trail of who changed what.** There is no
  identity layer yet, so there is also no "who ran this chaos experiment"
  record. See Red Team finding #26.
- **LEADOS does not have 39 prior "parts" of build history in this
  repository.** See `docs/PART-DEPENDENCY.md` for exactly what was found
  at the start of this session and what this session chose to do about it.

## 3. Next program of work (ranked, effort-estimated)

| # | Item | Why it's next | Effort |
|---|---|---|---|
| 1 | Authentication + role-based authorization + per-organization data boundary | Nothing else matters if any caller can read/write any data. Pre-production blocker. | L |
| 2 | Audit log (actor, action, payload, timestamp) on every mutation | Answers "who did this and why" — required for any governance claim this product makes. | M |
| 3 | Assurance engine criticality weighting (a failing low-stakes engine should not read the same as a failing high-stakes one) | Current worst-severity logic treats all engines equally. | M |
| 4 | Fitness/target governance workflow (approve + log target changes) | Closes the "gaming" vector where lowering a target raises fitness without improving anything real. | M |
| 5 | Live FX source + intercompany elimination in consolidation | Closes the largest trust gap in the board pack. | L |
| 6 | Scheduled/background triggers for each seam (so sensing does not depend on a human clicking a button) | Needed to call any part of this an "evolution loop" rather than a dashboard. | M |
| 7 | Real inference behind at least one engine (start with churn, since it already has the weakest assurance signal) | Converts the first governance placeholder into a real, checkable model. | L |
| 8 | VoC theme normalization + real similarity matching (replace substring heuristic) | Current matching is a known, accepted heuristic gap. | M |
| 9 | Pagination + indexed batch queries (replace per-row loops in fitness/assurance routes) | Current implementation is fine at seed scale, will not be at real scale. | M |
| 10 | ESG evidence attachments + external verification status per metric | Directly addresses ESG misrepresentation risk named in the red team. | M |

Effort key: S = hours, M = days, L = multi-week.

## 4. Risk acceptance register (critical/high items not fixed this session)

Every item below is also in `docs/RED-TEAM-FINAL.md` with full evidence.
Listed here because a vision document should own its own risk, not just
point at an appendix.

- **No auth layer (Critical):** accepted for this session because this is a
  single-session build of the product core; it is item #1 in §3 and must
  be resolved before any real deployment. Mitigation in the meantime: do
  not expose this build's API routes to an untrusted network.
- **No real models behind engines (Critical):** accepted and disclosed
  explicitly in this document and the glossary, rather than fixed, because
  building a real model is a multi-week program, not a session task. The
  mitigation applied *this session* is maximum labeling honesty — nothing
  in the UI claims a working model exists.
- **Fitness/target gaming (Critical):** accepted because the fix is a
  governance process (who can change a target, and is it logged), not a
  code change alone. Partial code mitigation exists for the easier
  sibling problem (metric attainment is clamped so one outlier can't buy a
  perfect score).
- **FX/consolidation trust gap (High):** accepted; mitigated by disclosure
  text in every board pack rather than by sourcing a real FX feed this
  session.
- **Chaos belief heuristic is uncalibrated (High):** accepted; there is not
  yet enough historical experiment data in this build to calibrate against,
  and calibrating against too little data would be worse than an honest,
  disclosed heuristic.

## 5. How to falsify this document

If you can find a sentence in §1 that does not have a corresponding
**Verified** (or honestly **Partial**) row in `docs/EVIDENCE-LEDGER.md`,
that is a bug in this document. File it the same way you would file a code
bug.
