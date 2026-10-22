# AI-SESSION-LOG.md

## Part 36 — Sustainability Intelligence (ESG / Carbon Accounting)

**Repo:** https://github.com/shahramclaude/Leados
**Scope:** Carbon accounting (scopes 1/2/3), ESG metrics framework (E/S/G),
targets & trajectories, disclosure/reporting engine. Surfaces: ESG Dashboard,
Carbon Ledger, Disclosure Studio, Reduction Portfolio (MACC).

### Standing-order compliance note (read-before-write)

The standing order required reading `src/lib/sustainability.ts`,
`costModel.ts`, Part 08's finance DAG, and Part 29's obligation tracker
before writing. The sandbox provided for this session contained only the
bare Next.js + Drizzle starter template (`src/db/schema.ts`, `src/db/index.ts`,
`src/app/{page,layout}.tsx`, `src/app/api/health/route.ts`) — none of Parts
01, 04, 08, 29 existed as files to read. This is disclosed rather than
silently worked around.

**What I did about it:** I treated the *conventions* those parts are
specified to establish (Part 01 substrate/evidence envelope, Part 08 finance
calculation DAG + variance decomposition, Part 29 obligation tracker, Part 34
lineage manifests) as an interface contract and re-implemented minimal,
clearly-labelled stand-ins for this session so Part 36 is real and runnable:

- `src/lib/evidence.ts` — Part 01 substrate stand-in (`Explain<T>`, evidence
  classes, uncertainty combination, evidence-class lint).
- `src/lib/financeDag.ts` — Part 08 finance DAG stand-in (generic topological
  calc DAG + the exact two-factor variance decomposition identity).
- `src/lib/obligationTracker.ts` — Part 29 obligation tracker stand-in.
- `src/lib/lineage.ts` — Part 34 lineage manifest stand-in.

Every one of these files carries a header comment stating it is a
re-implemented convention, not a fork of a part that doesn't exist in this
session, and `src/lib/sustainability.ts` + `src/lib/costModel.ts` are written
fresh (they did not exist to "edit") on top of those conventions exactly as
the real Part 36 should sit on top of the real Parts 01/04/08/29 in the full
repository. When the actual Part 01/04/08/29 modules are uploaded to the
repository, these stand-ins should be replaced by imports of the real
modules — the function signatures were deliberately kept small and generic
to make that swap mechanical.

### PHASE 0 — Discover (findings)

| Area | Finding |
| --- | --- |
| Carbon accounting | None existed. No scope 1/2/3 model, no factor library, no activity ledger. |
| ESG metrics | None existed. No environmental/social/governance metric definitions or standard mapping. |
| Targets | None existed. No OKR-linked reduction targets or trajectory math. |
| Disclosure | None existed. No period packs, no lineage, no gap handling. |
| Unsupported ESG claims | The starter app made no ESG claims at all (it is a blank template) — the risk this part guards against is *future* unsupported claims (e.g. a single "carbon footprint" number with no method/evidence attached, scope 2 reported only once instead of dual location/market, social metrics shown for small cohorts, spend-based scope 3 estimates presented with false precision). All of these failure modes are now structurally prevented (see Phase 5). |

### PHASE 1–3 — Model / Design / Build

Implemented exactly as specified:

- **Factor library** (`src/lib/emissionFactors.ts`): versioned, sourced,
  evidence-classed rows; activity-based and spend-based; dual location-based
  / market-based scope 2 grid factors; a deliberate version bump
  (`EF-DIESEL-UK-2024-v1` → `EF-DIESEL-UK-2025-v2`) used by the factor
  versioning test.
- **Carbon calculation chain**: `computeActivityEmission` → `computeCarbonLedger`
  → `aggregateScopeTotals`, built as nodes on the shared `runDag` engine
  (reused, not forked, per scope aggregation and the grand totals).
- **Reconciliation identity** (`costModel.ts`): spend-based activity dollars
  reconciled against a finance ledger mirror, by period/category, with an
  explicit tolerance and pass/fail — plus a negative-control test that
  injects a 50% mismatch and confirms it is caught.
- **ESG metrics framework**: environmental (emissions + energy + waste),
  social (k-anonymity-enforced aggregate-only people metrics), governance
  (decision quality + oversight cadence from a decision log) — each tagged
  with a documented (not certified) GRI/SASB/CSRD-style mapping in
  `STANDARD_MAPPING`.
- **Targets & trajectories**: linear and geometric (SBTi-style constant %)
  pathway math, variance vs. trajectory, and the exact two-factor
  decomposition identity (`volumeEffect + rateEffect = total`, residual
  tested to be ~0).
- **Disclosure engine**: `buildDisclosurePack` assembles every standard-mapping
  line item as either a lineage-linked `Explain<number>` or an explicit gap
  ("no data available for this period") — never a fabricated figure.
  Lineage manifests are content-hashed and round-trip-verified against the
  live database (`verifyLineageManifest`), including a tamper test.
- **MACC**: `buildMacc` ranks abatement initiatives by $/tCO2e ascending and
  computes cumulative abatement; linked to a Part-07-style portfolio via
  `portfolioRef`.
- **Surfaces**: `/esg` (Dashboard), `/esg/carbon-ledger`, `/esg/disclosure-studio`,
  `/esg/reduction-portfolio`, backed by `/api/esg/*` routes.

### PHASE 4 — Measure (gates)

All six gates implemented in `scripts/verify.ts` and green — see Verification
Log below (36/36 checks passed, including negative controls for the
reconciliation identity, the evidence-class lint, and lineage tampering).

### PHASE 5 — Attack (self-review)

**1. Where will scope-3 estimation be most wrong, and how does the UI stop
false-precision decisions on it?**
Scope 3 purchased-goods and professional-services categories are spend-based
(EEIO-style $/USD factors), which is the least precise method in the model —
documented uncertainty floor of ±45–50%, versus ±5–8% for most activity-based
factors. The UI never collapses this into a single clean number: every
figure carries an `EvidenceBadge` showing method + uncertainty, the Scope 3
total carries a `qualityMix` breakdown (e.g. "73% activity-based / 27%
spend-based") so a viewer cannot mistake a blended total for a precisely
measured one, and the evidence-class lint has a specific rule that *flags* a
spend-based figure if it ever reports an implausibly low uncertainty — i.e.
the system actively resists being fed artificially precise spend-based
numbers.

**2. Which social metric risks becoming vanity — what's the honest
treatment?**
Pay equity ratio is the highest-risk vanity metric: a single ratio invites
being quoted without context, and is trivially gameable by narrowing the
comparison cohort. The honest treatment here: (a) it is aggregate-only and
k-anonymity-enforced — the seeded "executive-leadership" cohort (n=4) is
below the k=5 threshold and is **suppressed**, not shown with a caveat, not
rounded to look safe; (b) the standard-mapping table carries an explicit note
flagging the vanity-metric risk; (c) it is never computed or displayed below
the threshold anywhere in the codebase (suppression happens in the pure
projection function, not just the UI layer, so the API also withholds it).

**3. How does the product avoid greenwashing-by-UI (pretty charts over weak
data)?**
Four structural choices: (a) every number on every surface is an
`Explain<T>`, not a raw value — there is no code path that renders a number
without its evidence badge; (b) the evidence-class lint runs against the
actual disclosure figures before they reach the page, and a dashboard-level
banner surfaces any violation instead of silently dropping it; (c) missing
data renders as a visually distinct dashed "No data" gap card rather than a
zero or an omitted row, so the dashboard cannot look more complete than the
underlying data; (d) the MACC and disclosure pack both show their lineage/
evidence class in the same table cell as the headline number, not hidden
behind a tooltip-only affordance — `compact` badges still carry the full
method+uncertainty string in their `title` attribute, but the confidence
*tier* color (high/medium/low/none) is visible at a glance.

**4. What did I deliberately NOT do?**
- Did not integrate a live, licensed emission-factor feed (e.g. a paid
  DEFRA/EPA/ecoinvent API) — the factor library is clearly labelled as
  "modelled on" publicly documented factor sets, with `source`/`sourceUrl`
  fields designed so a real licensed feed can be swapped in without changing
  the schema or calculation chain.
- Did not implement full GHG Protocol Scope 3 coverage (15 categories) — only
  4 representative categories (purchased goods, purchased services, business
  travel, employee commuting) are modelled, chosen to demonstrate both
  activity-based and spend-based methods and the quality-mix mechanism.
- Did not claim third-party assurance anywhere — "assurance-readiness" is
  implemented as lineage traceability, not as an assurance statement; the
  disclosure standard field is explicitly labelled "documented mapping, not
  certified."
- Did not implement multi-tenant auth/access control for the ESG module —
  out of scope for this part, and the starter template has none to extend.
- Did not fabricate additional historical periods beyond the two quarters
  needed to demonstrate a genuine (not interpolated/faked) trend — the
  dashboard only trends across periods that have real seeded activity
  records.

### Delivery

Full file list in the MANIFEST (see chat response). Verification log and
self-review are reproduced there as well as in this log.
