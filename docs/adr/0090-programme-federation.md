# ADR-0090: Programme Federation — measure which declared leadership edges actually carry work, instead of trusting the reporting line (`#/federation`)

- **Status:** Accepted
- **Date:** 2026-11-04
- **Session:** 130 (Schema v95, CSV #86, `RULE-FED-01..03`)
- **Related:** [ADR-0008](./0008-post-commit-rules-hook.md), [ADR-0075](./0075-command-chain.md), [ADR-0076](./0076-operating-seat.md), [ADR-0084](./0084-hoshin-catchball-cascade.md), [ADR-0086](./0086-disclosure-compiler.md), [ADR-0087](./0087-operating-cadence-clock.md), [ADR-0088](./0088-federated-envoy.md), [ADR-0089](./0089-strategy-renewal-bridge.md), [ROADMAP](../../ROADMAP.md)

## 1. Context

Every module before this one builds the hierarchy from a DECLARATION: `person.managerId`, a chain node, an operating seat's rank. The chain reads how much work has outlived its owner's time span, the seat reads what a level may see, the cadence clock reads which forum is competent to close what, and the envoy carries a packet to every declared ancestor. None of them answers the prior question: **is the declared edge above a span used at all?**

A hierarchy in which every edge is declared and no artefact ever crosses one is not a connected system; it is an org chart. The 2026-11-02 roadmap entry ("integrity before enterprise claims") and Session 128's "next up" both named the missing reading: *which spans are actually connected to the span above them, measured from carriage rather than declared*. The 2026-11-04 bootstrap roadmap recorded it as a Planned item tagged **[VP → CEO]**, the altitude at which a coverage number is the only honest resolution.

The market comparison is not "nobody has a dashboard". Cascade and WorkBoard publish alignment and roll-up views; those views are declarations of intent, and this ADR makes no claim about what they measure internally. The distinction this repository can defend is narrower and testable: **every number on `#/federation` is derived from a dated artefact another module already wrote**, and the derivation is in one pure function.

## 2. Decision

Ship a bounded, seat-aware Programme Federation Reading on Schema v95. It adds one measured read model, two additive collections, three rules on the existing spine, one CSV scope, and one screen. It adds **no** writer to any measured channel.

### 2.1 The measurement, stated exactly

For every leadership seat **S** with a declared leadership span **P** above it (`parentSeatOf`), and a window of `federationWindowDays` (default 30, clamped 7–365):

- A **carriage event** is `(channel, fromSeat, toSeat, on)`, extracted from an existing ledger. `fromSeat` is S itself or a person inside S's span attributed to S by `leadershipOwnerOf`; `toSeat` is a leadership span or the workspace root pseudo-seat.
- **direct** — at least one event this window with `toSeat === P`.
- **bypass** — no direct event, but at least one with `toSeat` strictly above P. Carriage exists and skips the parent.
- **stale** — carriage exists but the newest is older than the window.
- **silent** — no carriage in the measured ledger at all.
- **root** — no leadership span above S in the declared tree; there is no edge to measure and the screen says so.

The five channels are declared once in `FEDERATION_CHANNELS` and each has exactly one extractor:

| Channel | Source ledger | Written by | Why it is carriage |
| --- | --- | --- | --- |
| `packet` | `exchangePackets` + `carries` links | RULE-ENV-01 | The receiver re-derived every item hash before storing anything |
| `renewal` | `strategyCycles` | RULE-SCR-01 | A frozen, identity-reduced reading is itself an upward report |
| `commitment` | `catchballPacts` (`agreed`) | RULE-HK-01 | The span's acceptance travels to the seat that proposed the commitment |
| `concordance` | `expectationRounds` (`closed`) | RULE-ECN-01 | Only a two-sided round has carried the member's side |
| `cadence` | `cadenceReadings` | RULE-CAD-01 | The governance reading travels above its author |

Adding a sixth channel is one registry row plus one extractor; a test asserts the registry and the extractor map cannot drift apart (`FEDERATION_EXTRACTOR_KEYS`).

Two deliberate refusals: carriage from a seat outside the declared leadership tree is **reported as unplaced and never counted** (`measurement.unplaced`), and a round that happens *inside* a span (member = IC, leader = that span's own lead) is not carriage across the edge above it.

### 2.2 Statistical disclosure control, not a bare percentage

- **Span floor.** Coverage is `connected / declared edges with a span above`. Below `federationMinSpans` (default 5, never below the cell floor) the rate and its interval are **withheld** with a printed reason. A confident-looking percentage of two is the failure mode this rule exists to prevent.
- **Bounded rate.** Above the floor, coverage is published with a **Wilson 95% interval** (score interval), not a point estimate alone.
- **Small-cell suppression with complementary suppression.** At rank 3 and above, a positive cell below `federationCellFloor` blanks itself **and** the largest open cell in the same altitude group, or the largest open cell in the table when the group has no other non-zero cell. A table whose every other cell is zero has nothing to difference against, and the withholding note says so rather than implying equal protection.
- **Altitude-appropriate rows.** Rank 1–3 sees span rows with counts and channel breakdowns; rank 4–5 sees states and counts, no per-child channel breakdown, no person named anywhere. `federationAssessments` is `detailCeiling: 0` in the declared-seat projection: a seat reads the scoped report, never the stored ledger.

Suppression reduces simple differencing. It is **not** differential privacy, and repeated-release differencing over time remains an open privacy item on the roadmap.

### 2.3 Five altitudes, five decisions

| Rank / altitude | Decision the reading exists to support | Boundary |
| --- | --- | --- |
| 1 — frontline | Did anything I produced arrive above me, and what did not? Name one dated channel in the 1:1. | Own span's channels only |
| 2 — manager | Which of my spans are connected; which are silent or bypassed? Open one direct channel. | Per-child states; sibling detail withheld |
| 3 — director | Is work from the teams below reaching me through the declared line, or arriving above it? | Span-level carriage in own span; peers aggregated |
| 4 — executive | What share of the programme is measurably connected, with what interval? | Rate with interval; refused below the span floor; complementary suppression |
| 5 — chief | Is the whole house one connected system or a set of declared lines with no traffic? | Counts by altitude and channel; no span or person named |

`FEDERATION_PLAYBOOK` encodes all five and a test asserts the titles are five distinct decisions rather than five renderings of one.

### 2.4 Rules on the existing spine

`federationRule` sits after `envoyRule` and before the attention market, so it reads the finished transaction and writes before the final work-producing pass and the seal.

- **RULE-FED-01 MEASURED.** A frozen assessment is a first-class graph node. It writes one `summarizes-span` edge to the seat it assessed and one to every leadership ancestor above that seat in the SAME atomic transaction, plus one idempotent `measured` marker. The workspace-wide operator reading owns no seat, so it links to every span it actually measured instead of to an unreachable pseudo-seat.
- **RULE-FED-02 SILENT EDGE.** For every edge measured silent, bypassed or stale, open **exactly one** governed DACI decision per edge per ISO week, owned at the span above the edge, naming the edge by altitude and typed id. Bounded at `FEDERATION_LIMITS.decisionsPerScan` per commit with a printed carry-over note. The decision's three options are: open a dated channel, correct the declared line, or record why periodic carriage is sufficient.
- **RULE-FED-03 RECOVERY.** When an edge that once produced a silent-edge finding is measurably connected again, record one `reconnects` edge from the frozen assessment to the span below it and one `reconnect` marker. The earlier decision is deliberately **not** closed: a measurement recovering is not a human sign-off. A test asserts the decision stays `pending` with an empty `chosen`.

Marker idempotency, `federationAutoPropagate` pausing and an always-runs explicit scan follow the same conventions as every other module on the spine.

### 2.5 Why these frameworks

- **Jaques, time span of discretion** — the unit of analysis is a span with a horizon; a slower level is not a worse level, it is a level whose edge needs less traffic.
- **Beer, Viable System Model** — System 3 needs a requisite information channel from System 1. A declared edge with no channel is a variety filter, not a reporting line.
- **Burt, structural holes** — carriage that reaches above the parent but never the parent makes the parent a structural hole in the information path. Measured as `bypass`, never framed as misconduct.
- **Wilson score interval** — a bounded rate on a small tree, published with its interval and refused below a floor.
- **Statistical disclosure control** — small-cell and complementary suppression, minimum-aggregate refusal, blank-never-zero.
- **Measurement-system analysis (DMAIC/MSA)** — the screen measures the measurement system of the hierarchy, not the people inside it; that framing is why no person appears in it.

## 3. Consequences

**What this buys.** A VP or chief can ask a question no earlier screen could answer with evidence: how much of this organisation is connected by traffic rather than by declaration. A manager gets a bounded, dated finding it can act on inside its own horizon, and the engine never messages anyone on its behalf.

**What it costs.** Five ledger reads on every report build; a bounded rule that runs on freeze and explicit scan only. Because the module writes nothing into a measured channel, the reading cannot be gamed from inside it — and equally, it cannot see carriage that this workspace has no ledger for. A span that carries work through a channel outside LeadOS reads as silent, and the screen states that limitation before the numbers.

**Honest limits.** Seats are local workflow declarations, not authentication, so the measurement is of one workspace's ledgers. `silent` is a finding about the edge, not evidence about a person or an intent. Suppression is not differential privacy. There is no migration of history: an older workspace starts with measured edges derived from the artefacts it already has, and an empty assessment ledger.

## 4. Verification

`tests/app/programme-federation.test.mjs` (19 cases) proves: additive 94 → 95 migration and fail-closed normalizers; registry/extractor parity; silent → direct → bypass → stale transitions from real records; self-issuance of a renewal reading; a closed round inside a span *not* counting; small-cell plus complementary suppression and a floor refusal; no person's name in report, brief, CSV or rendered HTML at five altitudes; rule/contract parity with one contract per spine rule; one decision per edge per week and none on a repeat freeze/scan; a scan from a middle manager opens findings only for edges inside its own span and a following freeze re-opens none (the `actingScope()` rule: an ASSESSED event reads the frozen assessment's span, a workspace-level event covers the tree, every other event reads the acting seat); RULE-FED-02 fires only on `SCAN`/`ASSESSED` events, so changing a convention no longer opens a governed finding for every edge it touches; a reconnection that leaves the human decision open; per-seat scoping with a peer span unreadable; the aggregate CSV; and the general graph resolver returning counts and dates but never the span list.
