# AI Session Log — Bootstrap, 2026-11-04: North Star doctrine ratified (documentation only, no schema change)

**Repository identity (checked first).** `git remote -v` → `https://github.com/shahramclaude/Leados.git` (fetch and push). Branch `arena/fd884b0c-leados`, base `b18ff87`. Identity **PASS**.

**Task.** Run the LeadOS bootstrap once: confirm `origin`, check for `NORTH_STAR.md` at the repo root, create it with the binding doctrine if missing, ensure `ROADMAP.md` carries the four required sections, ensure `AI-SESSION-LOG.md` carries a dated entry for this session, commit and push, and report the actual push result.

**Audit result (blunt).**
- `NORTH_STAR.md` **did not exist** at the repo root. Created with the doctrine verbatim: mission, standard of ambition, cross-domain expertise, organizational hierarchy mandate, cross-module automation mandate, non-negotiable technical baseline, and how the document is used.
- `ROADMAP.md` **existed** (547 KB, 129 session outcomes, newest first) but did **not** carry the four required sections. Added a top-level `Bootstrap doctrine roadmap — 2026-11-04` with `Implemented`, `In Progress`, `Planned — Not Started`, and `Rejected (with one-line reason)`, every item tagged by altitude. No historical outcome was removed or rewritten.
- `AI-SESSION-LOG.md` **existed** (112 KB, newest-first session records). This dated entry is prepended; no prior entry was altered.
- No source, schema, test, build or configuration file was touched. No schema bump. No behaviour change. No new dependency.

**Verification performed (actual).**
- `node scripts/check-docs-links.mjs` → **PASS** — 708 internal links across 201 Markdown files; all resolve (the new file is included by the walker).
- `node scripts/check-canonical-boundary.mjs` → **PASS** — 420 app ES modules, 129 test suites, 23 documentation checks, 0 leaks.
- `npm run lint` → **NOT RUN** — `eslint` is not installed in this sandbox (`sh: 1: eslint: not found`); no dependency install was attempted for a documentation-only change. This is a gap, not a pass.
- `git status` / `git diff --stat` reviewed before commit: documentation files only.

**Honest limits.** This is a documentation-only bootstrap. It does not implement any doctrine item, does not authenticate the seat, and does not audit the product against the doctrine. The roadmap tags reflect the repository's own records, not an independent audit. The "In Progress" and "Planned" items are carried forward from prior sessions' stated gaps.

**Sync.** Commit and push performed after this entry; the actual result is recorded in the follow-up sync entry below.

# AI Session Log — Session 128, 2026-11-04: The Federated Envoy (Schema v93, no bump of its own, ADR-0088)

**Repository identity (checked first).** `git remote -v` → `https://github.com/shahramclaude/Leados.git`. Branch `arena/1b0133a2-leados`, base `6c73a02`. Identity **PASS**.

**Audit result (blunt).** Every module assumed one shared store: the hierarchy is real, the *organisation* is not. Cross-boundary leadership work — plant ↔ head office, acquirer ↔ acquired, partner ↔ partner — had no representation beyond a forwarded document, and `sealCrypto` proved integrity only *within* a workspace. Role-tiering exists (five declared altitudes, per-record disclosure classes, aggregate-only exports) and remains a declaration, not authentication.

**What shipped.** `envoy{Registry,Schema,Rules,Actions}.js`, `app/views/envoy.js`, five panels (`desk | packets | carriage | divergence | certificate`), three collections (`exchangePackets`, `exchangeArtefacts`, `exchangeMarkers`), a graph node (`exchangepacket`) with relations `carries` and `reconciles`, `RULE-ENV-01..03` (**69 rules / 69 contracts**), CSV scope **#84 `federated-exchange`**, gateway commands/reads, seat rights, one `disclosureManifests` row and three `RECORD_POLICIES` rows, six nav aliases, an ADR, and `tests/app/federated-envoy.test.mjs` (11 tests).

**The concrete self-test (cross-module × cross-altitude, one transaction).** A packet composed in workspace A is verified and ingested in workspace B; in the *same* atomic commit the carriage reaches **`mgr1`, `dir1` and `vp1`**, and a second identical ingest writes nothing twice. When A edits the case and re-sends, B records **one** divergent artefact, leaves its own case row byte-identical, opens **exactly one** `RULE-ENV-02` decision naming both hashes, links it `reconciles`, and an explicit `envoyScan()` adds no second decision.

**Correctness asserted, not assumed.** Item hash → Merkle root → packet identity → signature recomputed independently; an edited field, a rewritten root, a re-dated packet and a schema-ahead packet each fail with their *own* typed code; keyed mode refused when required and a keyed packet cannot pass blind verification; a names-class packet is refused at an aggregate-class seat with `altitude-mismatch` (no artefact written, refusal recorded); the attestation floor tested in both directions; coverage below five spans refused with its reason.

**Three real defects the tests found and this session fixed.** (1) The divergence rule looked packets up by row id instead of the signed content id, so no `reconciles` edge was ever written. (2) The root pseudo-seat's derived altitude (`frontline`) was used as the *chief's* packet altitude. (3) Per-item `ageDays`/`daysToExpiry` — recomputed from "now" — made an unchanged record diverge on every re-send; ages now live in the packet-level attestation only.

**Merge with `origin/main` (twice, 707 commits, found when the PR reported `CONFLICTING`).** Main merged the **Board Room** ([ADR-0085](./docs/adr/0085-board-room.md)), the **Disclosure Compiler** ([ADR-0086](./docs/adr/0086-disclosure-compiler.md), Schema v92, CSV #81) and the **Operating Cadence Clock** ([ADR-0087](./docs/adr/0087-operating-cadence-clock.md), Schema v93, CSV #82). Resolved here, not deferred:

- **Renumbered twice, finally:** this session is **Session 128**, its record is **[ADR-0088](./docs/adr/0088-federated-envoy.md)**, its export scope is **CSV #84**, appended after `operating-cadence`.
- **Schema:** main's `92 → 93` migration is untouched; this feature needs **no bump of its own** (three collections normalise from empty, no stored record is transformed), so `SCHEMA_VERSION` stays 93 and the ADR says so.
- **Spine:** `envoyRule` after `boardRule`, before `attentionMarketRule`; `sealRule` **absolutely last**; **69 rules / 69 contracts**, parity by rule name.
- **Compiler integration:** one `disclosureManifests` row, three `RECORD_POLICIES` rows, `envoy` in the reviewed fallback list, seven reads in `SAFE_READS`.
- **Main's red tree fixed here.** Main's merge of the Hoshin Carryover Terminal landed **unresolved conflict markers in `app/core/csv.js`, `app/core/schema.js` and `app/core/domain/cases.js`, plus 87 test files** — `node --check` failed on main's own sources and `schema.js` declared `SCHEMA_VERSION` twice (91 and 93). This branch repairs it: the two colliding `90` migrations are merged into one additive step (board *and* carryover collections), the duplicate declaration is removed, the cadence `92 → 93` migration is closed, and `carryover` — registered as a graph node by main — gets the resolver it never had. Every pin is regenerated from the merged reality (`migrated.applied` chains to 93, `CSV_EXPORTS.length` 84, rule count 69), and three tests that pinned "the scope I added is last" now pin ORDER, so a later session cannot break them by appending.

**Verification performed (actual).** `federated-envoy` **11/11** on the merged tree; the CSV-pinned suites swept to 83; lint/boundary/links/standalone rebuilt. The full suite is **not** claimed here — CI on the PR is the record.

**Honest limits.** A packet proves integrity and provenance of a document, not who ran the client. It is not encrypted — detail above the receiving class is refused at the source, which is the stronger claim and is printed in every certificate. It cannot prove a foreign record is true. Keyed mode needs the same session key on both sides, arranged out of band. No figure rates a person.

**Changed files.** New: `app/core/domain/envoy{Registry,Schema,Rules,Actions}.js`, `app/core/domain/envoy.js`, `app/views/envoy.js`, `docs/adr/0088-federated-envoy.md`, `tests/app/federated-envoy.test.mjs`. Modified: `app/core/schema.js`, `app/core/domain/{cases,postCommit,propagationContracts,accessGateway,seatRegistry,disclosureManifests}.js`, `app/core/csv.js`, `app/actions.js`, `app/main.js`, `tests/app/{typed-links-lineage,disclosure-compiler,board-room}.test.mjs`, the CSV-count assertions, `index.html`, `README.md`, `ROADMAP.md`, `RESEARCH.md`, `CHANGELOG.md`, `FEATURES.md`, `docs/adr/INDEX.md`, `LeadOS-standalone.html`, and this log.

# AI Session Log — Session 127, 2026-11-04: The Operating Cadence Clock (Schema v93, ADR-0087)


**Repository identity (checked first).** `git remote -v` → `https://github.com/shahramclaude/Leados.git` (fetch + push). Branch `arena/ccb2bff5-leados`, base `6c73a02` ("Merge pull request #139"), clean at session start. Identity **PASS**; no stop condition.

**Audit result (blunt).** Read at the seams that decide this session: `app/core/schema.js` (v90, `COLLECTIONS`, fail-closed normalizers, add-only `MIGRATIONS`), `store.js`/`postCommit.js` (one atomic boundary → the rule spine → derived-event guards), `propagationContracts.js` (64/64 when audited), `cases.js` (link entity/relation vocabularies), `chain.js`/`chainRegistry.js`/`seat.js`/`seatRegistry.js`/`accessGateway.js` (five altitudes, LCA, ABAC rights, deny-by-default `SAFE_READS`), `csv.js` (79 aggregate scopes), `main.js` (nav, routes, aliases, badges), and the ADR-0075–0084 domain families. **What exists and works:** the transactional store, the hierarchy/roll-up spine, the disclosure ladder, catchball, concordance, mission control, routing, the sealed spine. **What was shallow:** the governance calendar. LeadOS could say what work exists and how many person-days a span has, and it had **no model of the forum where decisions actually close** — no declared capacity, no service time, no intake by competence, no ρ, no flow time, no topology test, nothing graded. Role-tiering **does exist** (five ranks, attribute-based reads/writes, aggregate-only exports) but remains a *declared* boundary, not authentication. Untested surfaces remain `[UNVERIFIED]`; the 388-module app was not read line by line.

**What shipped.** Six new modules (`cadenceRegistry.js`, `cadenceSchema.js`, `cadence.js`, `cadenceRules.js`, `cadenceActions.js`, `app/views/cadence.js`), one shared-spine rule with an auditable contract (**67 rules / 67 contracts** on the merged tree — `boardRule` from main plus `cadenceRule` here), additive `MIGRATIONS[92]`, four collections, six clamped settings, one graph node + four relations, one CSV scope (#82 `operating-cadence`), five nav panels with aliases/badge/title, gateway + seat-registry rights, an ADR, and `tests/app/operating-cadence.test.mjs` (**17 tests**).

**The concrete self-test (cross-module × cross-altitude, one transaction).** A case filed by a frontline lead is attributed to the one competent forum in the tree; `RULE-CAD-01` writes a `queued-for` edge to that forum and a `rolls-up-to` edge per leadership ancestor (`mgr → dir → vp → ceo`) in the same commit. A director-chaired forum that meets without the manager seat that owns the work reads `disjoint` and writes a `fit-gap` edge **to the owning seat, not the reporter**. A congested forum (ρ = 14 / 10.2 = 1.373) opens exactly one governed constraint decision per ISO week, fanned up the chain, and a second and third `cadenceScan()` add nothing. A sensitive source contributes zero edges.

**Two engine defects found and fixed by the tests in this session (worth recording).**
1. **Self-reinforcing constraint.** The governed decision opened by `RULE-CAD-02` was re-harvested by `harvestWork` as ordinary cadence demand, so relieving congestion created a decision that re-congested the forum every week. Fixed by excluding decisions whose `question`/`rationale` carry the `[CAD-SIG:…]` signature from the demand pool — read from the record, not the (renameable) title. Test 16 asserts it.
2. **Topology classifier did not implement its own docstring.** `narrower-than-work` fired on *any* missing owning seat, and `wider-than-work` fired on 2-person forums with one item. Replaced with partial-coverage detection that names the missing seats, and an Ashby test requiring ≥ 4 attendees and items ≤ half the roster. The dead helper was removed.

**Statistical correctness.** ρ < 1 → Kingman `Wq = ρ/(1−ρ)·S`, `flowDays = S + Wq`; ρ ≥ 1 → flow **refused** (`null`) with verdict `congested`, never a large number. Wilson 95% for k = 8, n = 10 re-derived by long division in the test (`[49.0, 94.3]`) and withheld below `cadenceFloorN`. Brier 0.16 against a base rate of 0.16 → skill **0** on five grades at 80% (four held, one failed), signed-zero normalised so it cannot print `-0`. Escape ladder asserted against a hand-built fixture with `declaredSlackDays = −7`.

**Verification performed this session (actual, post-merge tree).** `npm run check:boundary`: **395 app ES modules / 125 test suites / 23 documentation checks, 0 leaks**. `npm run check:links`: **667 internal links across 197 markdown files, all resolve**. Focused `node --test` over `core`, `csv`, `catchball-cascade`, `altitude-router`, `propagation-ledger`, `expectation-concordance`, `board-room`, `seal-chain`, `typed-links-lineage`, `operating-cadence`: **174 tests, 174 pass, 0 fail**. `operating-cadence` alone: **17/17**. Migration chain re-verified programmatically from v1 / v73 / v88 / v89 / v90 / v91 → the expected step lists (`90 → ['90 → 91','91 → 92']`, `91 → ['91 → 92']`).

**Merge with `origin/main`, twice (found while opening PR #143 — recorded because it changed the shipped numbers).** `main` moved twice while this branch was open, and each time it had already claimed the identifiers this branch was using:

| | first merge | second merge |
|---|---|---|
| `main` shipped | **Session 125 — The Board Room** (`#/board`, ADR-0085, additive `90 → 91`, CSV #80) | **Session 126 — The Disclosure Compiler** (`#/disclosure`, ADR-0086, additive `91 → 92`, CSV #81) |
| this branch became | Session 126 / ADR-0086 / v92 / #81 / 66 rules | **Session 127 / ADR-0087 / v93 / #82 / 67 rules** |

Resolved in this branch, not deferred:

- **Renumbered:** this session is **Session 127**, its decision record **[ADR-0087](docs/adr/0087-operating-cadence-clock.md)** (file renamed twice; every code comment, doc and test reference updated), the schema is **v93 (additive `92 → 93`)**, and the cadence export is CSV scope **#82**. The Board Room keeps 125 / ADR-0085 / v91 / #80 and the Disclosure Compiler keeps 126 / ADR-0086 / v92 / #81.
- **All three features kept, the spine ordered deliberately:** `boardRule` and `disclosureRule` (main) keep their positions after the concordance rule; `cadenceRule` (this branch) runs immediately after `catchballRule` and before them, so the queue it reads already contains every cascade commitment and a constraint decision it opens is still priced by the market in the SAME commit. `sealRule` remains **absolutely last** — **67 rules / 67 contracts**.
- **Schema:** main's `90 → 91` and `91 → 92` entries are untouched; this branch adds `92 → 93`. `board-room.test.mjs`'s version and rule-count assertions were updated to the merged reality with the reason printed in the assertion, never deleted.
- **Gateway:** main's second merge replaced the hand-written route allowlist with the compiled disclosure posture. `cadence` was added to that reviewed-surface list, and `SAFE_READS` is the union of all three modules (**52 safe reads**). Neither surface lost its deny-by-default contract; `run-cadence` keeps its own right group.
- **Graph:** all three vocabularies kept — `cadenceforum` / `cadencereading` alongside `boardmemo` and `disclosuregrant`. `typed-links-lineage.test.mjs` gained real fixture rows for all three, and the test earned its keep twice: it caught a missing `disclosureGrants` fixture (the new node had none), and it re-caught the cadence integration gap where routes carried `?forum=` / `?reading=` while the view ignored them. The view now renders a focused forum card and a focused frozen reading card, so a typed edge lands somewhere real.
- **CSV registry order is asserted, not ordinal:** three tests that asserted "my scope is LAST" (`catchball`, `board`, `disclosure`) now assert relative order instead, because append-only numbering means any future session legitimately appends scope #83.
- **Docs:** `README.md`, `ROADMAP.md`, `CHANGELOG.md`, `RESEARCH.md`, `AI-SESSION-LOG.md`, `index.html` and `docs/adr/INDEX.md` carry all three sessions in descending order with matching ordinals. The Disclosure Compiler's session-log section was restored verbatim from `main` after a conflict resolution clipped it — checked by counting sections and paragraphs, not by assuming.
- **Mechanical sweeps, three passes:** 91 test files' migration chains, ~60 files' `schemaVersion` pins, ~80 files' `SCHEMA_VERSION` pins and 27 files' `CSV_EXPORTS.length` assertions were re-swept for `92 → 93`; a duplicated `concordance` key that main's own merge left in `typed-links-lineage.test.mjs` was removed.

**Still not verified locally (stated plainly).** `npm run lint` cannot run here: eslint is not installed in the sandbox and `npx` resolves a v10.14.0 that is not this repo's pinned version, so a result from it would be meaningless — it was not used as a gate. The full `npm test` (~39 minutes across 124 suites) exceeds the sandbox's per-call budget; a run started earlier was interrupted without a verdict. The complete suite runs in CI on the pull request, and its result — not this paragraph — is the record.

**Honest limits.** Local seats remain auditable declarations, not authentication. Kingman is a heavy-traffic approximation and is labelled as one; at ρ ≥ 1 no flow time is printed at all. CSV #80 suppression is small-cell withholding, not differential privacy. A forum with no recorded sitting has **no** next-sitting date — it is an intention, and the UI says so rather than returning today. Real-browser screen-reader/contrast walkthrough remains `[UNVERIFIED]`. `LeadOS-standalone.html` is regenerated, never hand-edited.

**Changed files.** New: `app/core/domain/cadenceRegistry.js`, `cadenceSchema.js`, `cadence.js`, `cadenceRules.js`, `cadenceActions.js`, `app/views/cadence.js`, `docs/adr/0087-operating-cadence-clock.md`, `tests/app/operating-cadence.test.mjs`. Modified: `app/core/schema.js`, `app/core/domain/postCommit.js`, `propagationContracts.js`, `cases.js`, `seatRegistry.js`, `accessGateway.js`, `app/core/csv.js`, `app/actions.js`, `app/main.js`, the mechanically swept version/CSV-count pins in `tests/app/*.mjs`, `README.md`, `ROADMAP.md`, `RESEARCH.md`, `CHANGELOG.md`, `docs/adr/INDEX.md`, `tests/app/typed-links-lineage.test.mjs` and `tests/app/board-room.test.mjs` (merged pins), `LeadOS-standalone.html`, and this log.

---

## 2026-11-04 — Session 126: The Disclosure Compiler (Schema v92, [ADR-0086](./docs/adr/0086-disclosure-compiler.md), `#/disclosure`, RULE-DSC-01..02)

**Repository identity (checked first).** `git remote -v` → `https://github.com/shahramclaude/Leados.git` (fetch + push). Branch `arena/b927efc3-leados`, base `3a40fbb` (= `main`, merge of PR #138), worktree clean at session start. Identity **PASS**; no stop condition.

**Blunt audit (what was actually inspected).** Read at the seams this session had to change: `app/core/domain/{seat,seatRegistry,viewScope,accessGateway,chain,cases,postCommit,propagationContracts}.js`, `app/main.js` (nav, `RENDERERS`, aliases, `render()` gate, `documentTitle`), `app/actions.js` (mount pattern), `app/core/schema.js` (v89, `COLLECTIONS`, fail-closed normalizers, add-only `MIGRATIONS`), `app/views/{cases,succession}.js`, `app/ui/components.js`, the `tests/app/{app,mission-control,operating-seat,expectation-concordance}.test.mjs` harnesses, and the ADR-0075/0076/0080/0081/0083 records. The 384-module app was **not** read line by line; claims beyond the inspected and executed surfaces remain `[UNVERIFIED]`.

- **Working and verified before any change:** the transactional store, the five-altitude chain and vertical `rolls-up-to` fan-out, the Operating Seat's attribute-based decisions (`canSee`/`canAct`), the record-level projection, the 63-rule post-commit spine with auditable contracts, and the seal.
- **Broken as a product, not as code:** `workspaceRouteVerdict` allowed exactly **five** routes (`mission`, `today`, `seat`, `routing`, `seal`) under a declared seat and refused the other 84 with "this legacy module has not yet completed its seat-scoped read audit". A director who declared their seat lost the screens they work in. Three consecutive sessions (121, 122, 123) listed "reviewed adapters for legacy modules, one module at a time" as the next step and could not finish it, because the queue scales with the catalogue.
- **Shallow:** above a class ceiling the app produced a *refusal page* even when it could have produced the aggregate the level above needs. That is a dead end dressed as a security decision.
- **Missing:** a general mechanism, a proof, and any way to grant a bounded exception. That is what shipped.

**Fresh domain hunt (snippet level, 2026-11-04; vendor claims are benchmarks, not validated capabilities).** Microsoft Viva Glint/Viva Insights (hierarchy dashboards with aggregation thresholds and small-cell suppression), Workday/Visier/ChartHop (hierarchy-derived security, aggregate cuts), OneTrust/BigID/Collibra (field-level classification, purpose-based access), Zanzibar/OpenFGA/SpiceDB (relationship-based authorization over a typed graph), FCSM cell suppression including complementary suppression, Cloverpop/Loom (decision governance without evidence governance). Recorded in `RESEARCH.md` §106. **The gap:** every vendor either filters by role or publishes floored aggregates; none makes disclosure a compiled, per-screen, per-altitude posture that a leader can read, request an exception to, and have the owning span consent to for a bounded window.

**Named frameworks encoded.** Attribute-based access control as a compile rather than adapters; statistical disclosure control (small-cell + complementary + total suppression); principal–agent consent (the span that owns the record consents, not the requester); Jaques' time span of discretion as the reason the unit of analysis changes with altitude; fail-closed defaults (`unknown` ≠ zero, undeclared = withheld); bounded-authority contracts for exceptions (reusing ADR-0078's semantics without duplicating its machinery).

**Shipped (all in this session, all executed).**

- **New:** `app/core/domain/disclosureRegistry.js`, `disclosureSchema.js`, `disclosureManifests.js` (97 rows), `disclosure.js` (compiler + aggregate + validators + brief + CSV rows), `disclosureRules.js` (RULE-DSC-01/02), `disclosureActions.js`; `app/views/disclosure.js` (console + `renderAggregatePosture`); `tests/app/disclosure-compiler.test.mjs` (20 tests); `docs/adr/0086-disclosure-compiler.md`.
- **Compiler:** `postureFor` → `detail | aggregate | withheld` per route from `(manifest × seat × live grants)`; `compileDisclosure` per render; `moduleAggregate` with per-span buckets, floor withholding, one complementary suppression, total suppression, per-currency money, `unknown` dates, and an explicit count of excluded out-of-span records.
- **Shell:** `main.js` compiles once in `render()`, feeds the nav, the gate and the screen; above a ceiling the module renders `renderAggregatePosture` instead of `renderAccessDenied`; nav marks aggregate screens `◌` with a title; new Governance section, aliases (`visibility`, `access`, `posture`, `who-sees-what`, `small-cell`), badge = consent work waiting on this seat + releases lapsing in 3 days, `documentTitle` entry.
- **Release contracts:** request (purpose ≥ 12 chars, 1–30 days, one screen × one span, cap 6, duplicate refusal) → **consent only by the span leader** (requester refused, operator view refused) → live window honoured by the projection (`viewScope` adds exactly the granted span's records, marked `__disclosureGrant`) → refuse with reason / revoke by either party or the enterprise seat → expiry swept. `enterprise` classes never releasable; a grant can never lift a floor; `aggregate`-mode terminals never releasable.
- **Propagation:** `RULE-DSC-01` in one transaction writes one governed DACI decision (release / refuse-and-share / narrow), one consent task addressed to the span, and `authorizes` + `discloses-to` + `tracks-followup` edges; `RULE-DSC-02` expires lapsed grants (including ones an imported workspace already carried as expired), opens exactly one review task per release, and reconciles stale edges. Marker-idempotent, pausable by `disclosureAutoPropagate` (operator-only), explicit scan always runs. **64 rules / 64 contracts.**
- **Graph:** node `disclosuregrant` (→ `disclosureGrants`), relations `discloses-to` and `consented-by`, registered across `LINK_ENTITY_TYPES`, `LINK_ENTITY_COLLECTIONS`, `LINK_RELATIONS`, `SYSTEM_GENERATED_LINK_RELATIONS` and `resolveLinkedEntity` (no record content projected).
- **Schema v92:** additive `MIGRATIONS[91]`, `disclosureGrants` + `disclosureMarkers`, five clamped settings, fail-closed grant normalizers (granted-without-consent-or-expiry reopens as `requested`; lapsed loads as `expired`; a row without requester, span or a real purpose is dropped with a warning).

**The concrete self-tests (cross-module × cross-altitude).**

1. *Cross-module, one transaction:* a VP requests `1:1s` detail for `mgr1`; the store gains exactly one decision carrying `RULE-DSC-01` (question names the pair and states that consent belongs to the span) and exactly one consent task addressed to `mgr1`, plus the three typed edges — asserted by tag, not by array length (other rules also fire on the same event).
2. *Cross-altitude:* one frontline case, compiled four times — `lead1` (rank 1) **detail**, `mgr1` (2) **detail**, `dir1` (3) **detail**, `vp1` (4) **aggregate** — same record, same workspace, no re-entry; and the VP's span total is ≥ the director's by construction.
3. *The leak oracle:* sentinel strings in every 1:1 note, every SBI field, every talking point and every peer-span title; **all 97 routes navigated at four altitudes** through the real `createApp` and a real DOM. No out-of-span person named, no private note above the individual ceiling, no error panel, no console error.

**Verification performed this session (actual, as run).**

- `node --test tests/app/disclosure-compiler.test.mjs` — **22/22 PASS** (schema/migration refusals, catalogue exhaustiveness, per-altitude posture matrix incl. the chief, aggregate arithmetic + complementary suppression + per-currency money + total suppression, one-transaction propagation, consent/refusal/revocation lifecycle, floor/class/mode refusals, cap and duplicate refusals, projection-vs-grant agreement, route-gate fallback, brief/CSV identity-free, four axe-clean panels, four-altitude roll-up trail, operator view unchanged).
- `node --test tests/app/app.test.mjs` — **33/33**; `tests/app/standalone.test.mjs` — **7/7** (after an honest ceiling raise for the seven new modules); `tests/app/csv.test.mjs` + `access-audit` + `event-cascade` + `redacted-export` + `storage-safety` — **48/48**; `mission-control` + `operating-seat` + `altitude-router` + `propagation-ledger` — **68/68**; `core` — **15/15**; `expectation-concordance` — **18/18**; `command-chain`, `decision-rights`, `domain`, `action-bundles`, `cases-automation` green in the same batch (160 passed / 2 failures triaged and fixed: a migration-tail assertion this session's own sweep had skipped, and the standalone size ceiling).
- `npm run lint` — **clean** (whole tree). `npm run check:boundary` — **396 app ES modules, 125 test suites, 23 documentation checks, 0 leaks**. `npm run check:links` — **637 internal links across 195 markdown files, all resolve**. `npm run build:standalone` + `verify:standalone` — **6,946,726 bytes · 383 modules · schema v92 · sha256 `c9195fcc16d503ce`**.
- Live preview served on `0.0.0.0:5173`; `/` and `/app/views/disclosure.js` both **200**.
- **Not run to completion:** the full 123-suite `npm test`. It is the slowest thing in the repo and was not allowed to finish inside this session; every suite listed above was run individually and is green, and CI runs the rest on the pull request — its result, not this paragraph, is the record. Real-browser assistive-technology walkthrough remains `[UNVERIFIED]` (axe-core in jsdom is what ran).

**Defects found and fixed in this session's own code (by the oracle and by the tests).**

- `#/succession` **crashed** under a declared seat: `successionRead` is a reviewed-adapter read that the gateway refuses, and the view dereferenced `r.view.seat` on the refusal object. Root cause was the compiler: `classPolicyFor` let an *undeclared* collection's fail-closed default override the manifest's declared class, so a portfolio-class terminal took detail posture at the frontline. Fixed by honouring only **declared** collection policies; the terminal now publishes its aggregate, as declared.
- `postureFor` honoured no grants when called without an explicit ledger — a real foot-gun for any caller (the console, a test or a future adapter). It now reads `activeGrants(state)` itself.
- A duplicate release request was accepted while an identical one sat **unanswered**; only live grants were checked. Pending requests now count toward the duplicate check and the per-seat cap.
- A release that an imported workspace already carried as **expired** owed a review that nothing opened, because the sweep only processed `granted` rows. `RULE-DSC-02` now reviews any expired release that has not been reviewed, still exactly once.
- `successionRead` refusal surfaced as a crash rather than a panel; the aggregate posture now keeps the terminal off that path entirely (and the oracle covers the whole catalogue, so the class of bug cannot return silently).
- Schema bump sweep: 85 test files' version pins and migration tails re-derived (a naive last-element replacement silently dropped `88 → 89`; caught by `core.test.mjs` and `expectation-concordance`, repaired).

**Known gaps (honest).**

- Local seat selection remains a **workflow declaration, not authentication**. No tenant isolation, no cryptographic identity, no server-side authorization. A full workspace backup still contains the whole workspace.
- ~45 analytic terminals are `aggregate` **by declaration**, not by audit: their report reads scan the whole workspace, so under a seat they publish the span aggregate and say so. The console prints this screen by screen; the roadmap's next item is to move them to `adaptive`.
- Suppression is small-cell + complementary suppression, **not differential privacy**. Repeated releases, reorganisations and time series can still difference a cell; no formal privacy review has been done.
- The leak oracle proves DOM text at four seats on one sentinel fixture. It does not prove the absence of a leak through a URL, an export, or a data shape the fixture does not contain.
- The full repository was inventoried and lint/boundary-checked, but not every legacy line was semantically reviewed. Untouched surfaces remain `[UNVERIFIED]`.

**Next 1–3 roadmap targets.**

1. **[all altitudes] Seat-scoped report reads for the analytic terminals** — move each family's read model inside the span (as the Altitude Router and the Seal already are) and flip its manifest from `aggregate` to `adaptive`, so the console's coverage number rises honestly.
2. **[all altitudes] Authenticated identity + tenant boundary** — server-side authorization on every read/write/export; the compiler is already a pure policy function and is the natural engine for it.
3. **[manager → CEO] Temporal disclosure control** — repeated-release differencing tests, a decay rule for grant frequency, and a formal privacy review before any predictive claim.

**Changed files (summary).** New: `app/core/domain/{disclosureRegistry,disclosureSchema,disclosureManifests,disclosure,disclosureRules,disclosureActions}.js`, `app/views/disclosure.js`, `tests/app/disclosure-compiler.test.mjs`, `docs/adr/0086-disclosure-compiler.md`. Modified: `app/main.js`, `app/actions.js`, `app/core/schema.js`, `app/core/domain/{seatRegistry,viewScope,accessGateway,cases,postCommit,propagationContracts}.js`, `app/styles.css`, `index.html`, `docs/adr/INDEX.md`, `README.md`, `ROADMAP.md`, `RESEARCH.md`, `CHANGELOG.md`, `FEATURES.md`, `LEADOS-STATE.md`, `LeadOS-standalone.html`, `tests/app/standalone.test.mjs`, and the schema-v90 / migration-tail sweep across 85 test files.

**Sync.** Commit, push to `origin/arena/b927efc3-leados` and the pull request are reported in the final response; the real result (and any failure) is recorded there rather than assumed here.

---

## Session 125 archive — 2026-11-04: The Board Room (Schema v91, [ADR-0085](./docs/adr/0085-board-room.md), `#/board`, RULE-BRD-01..03, CSV #80)

**Merge note (Session 126).** `main` moved twice while this branch was open — the Hoshin Catchball cascade (ADR-0084, schema v90) and then the Board Room (ADR-0085, schema v91). Both are kept whole: the disclosure work renumbers to ADR-0086 / schema v92 / `MIGRATIONS[91]`, its CSV scope moves to #81 so the board keeps #80, and both rule sets sit on the same spine (66 rules, 66 contracts). Conflicts were resolved file by file — a duplicated `SAFE_READS` declaration (unioned), two objects that had been spliced into one in `propagationContracts` and `cases` (split and closed), two migration entries sharing a key (renumbered), and every version pin re-derived (`91 → 92`).


**Repository identity (checked first).** `git remote -v` → `https://github.com/shahramclaude/Leados.git` (fetch + push). Branch `arena/ff2fa531-leados`, base `3a40fbb` (= `main`), initially clean. Identity **PASS**; no stop condition.

**Audit result (blunt).** Read at the seams that decide this session: `app/core/schema.js` (v89, `COLLECTIONS`, fail-closed normalizers, add-only `MIGRATIONS`), `store.js`/`postCommit.js` (one atomic boundary → savepointed rule spine), `propagationContracts.js` (64 rules / 64 contracts), `csv.js` (78 aggregate scopes), `main.js` (nav, 89 routes, aliases, badges), `chainRegistry.js`, `successionRegistry.js`, `seatRegistry.js`, `accessGateway.js`, `cases.js` link vocabulary, and the ADR-0069/0075–0083 domain modules. **What exists and works:** the transactional store, the hierarchy model with five declared altitudes, the disclosure ladder, the authority/mandate layer, the routing layer, mission control, the sealed spine, the concordance terminal. **What was shallow — and the finding that drove this session:** `#/board` was *promised twice* (`chainRegistry.js:396` as the chief's `board` duty; `successionRegistry.js:157` as the `board-line` relationship) and rendered **nothing**; the only "board pack" in the product was the `portfolio` tab's decision queue. The workspace could compute seven enterprise figures and had no honest way to put them in front of a board without averaging them, which is precisely the failure mode a board pack is supposed to prevent. **Role-tiering / five-altitude coverage: it exists and is real** — five ranks, attribute-based read/write decisions, a deny-by-default API allowlist, per-record disclosure classes, aggregate-only exports — but it remains a *declared* boundary enforced against a declared seat, not authentication, and every recent ADR says so. This session adds no new hierarchy primitive; it adds the enterprise-altitude surface that was missing and holds `commit-board-memo` to rank 5–5. Untested surfaces remain `[UNVERIFIED]`; the 383-module app was not read line by line.

**What shipped.** Six new modules (`boardRegistry.js`, `boardSchema.js`, `board.js`, `boardRules.js`, `boardActions.js`, `app/views/board.js`), three rules on the shared spine with three auditable contracts (**64 / 64**), additive `MIGRATIONS[89]` (`90 → 91`) with two collections (`boardMemos`, `boardMarkers`) and five clamped settings, one CSV scope (#78 → **#80**), one nav entry with a fact-only badge, seven route aliases (`board-room`, `board-pack`, `board-line`, `board-memo`, `disclosure`, `disclosure-memo`, `chair`), two API right groups, six safe reads, five axe-clean panels, a `board-*` CSS block, an ADR, and `tests/app/board-room.test.mjs` (**45 tests, 45 pass**).

**The decision that makes this a terminal rather than a pack.** Thresholds are declared *before* the first recorded look; each look stores a content fingerprint of exactly what was visible; a threshold moved afterwards carries `revisedAfterLook` permanently. Verdicts are decided by the **conservative end of a Wilson (1927) interval**, never the point estimate. Analytic cases pinned in the test file: 0 of 5 covered → upper **43.4%**, so a 60% floor **fails**; 4 of 5 → **37.6–96.4%** → `inconclusive`; 50 of 100 → ≈40–60% → straddles; 0 of 10 → upper ≈27.8%. `boardRequiredSample(50, 60) = 97`, and a claim exactly on its threshold returns `null` because no sample size decides a coin that is exactly fair — the panel prints that sentence instead of a direction.

**Refusal semantics (the two real defects found while building).** A first smoke run on an empty workspace showed `culture-signal` reading **0** — a health index over no records. Fixed: `measureCulture` now refuses below three dated records across 1:1s / feedback / pulses / recognition and prints the count. A second real defect: `Number(null)` is `0`, so a claim with **no declared threshold** was being measured against a threshold of zero and a binary claim's `null` interval was being printed as `0–0`. Fixed with a `numOrNull` helper in `board.js` and an explicit null guard in `boardSchema.js`'s `thresholdFor`; a threshold-less claim is now `refused` with "no threshold was declared … a claim without a refutation condition is an opinion".

**The concrete self-test (cross-module × cross-altitude, one transaction).** Committing a memo that carries a failing alignment claim produces, in the *same* atomic write: **one** governed DACI decision at chief altitude (title `Board line fails: “…”`, `authority: 'act-inform'`), **one** delegation to the holder of the worst span (`dueOn`/`reviewOn` = `min(60, boardRecheckDays)`), and typed `rolls-up-to` edges to every leadership ancestor of that span. A second explicit `boardScan()` adds nothing (markers). With `boardAutoPropagate: false` nothing opens automatically and the explicit scan still opens exactly one. The failing claim is built from **five divergent concordance rounds** under one director plus one aligned round under one manager — 1 of 6 clears the 60% floor, upper bound ≈56%, so the verdict is `failing`; the partition has two spans, the worst is the director's, and the delegation therefore goes to the director. Roll-up arithmetic is asserted exactly (parts sum to the claim's own denominator; a deliberately broken partition prints its delta).

**Five genuinely different pictures from one read model.** Frontline lead: which line of mine is failing, by how much, and what it costs — read-only, no commit. Manager: the span partition with the arithmetic printed. Director: named span rows and the delegation a failing span actually receives. VP: cross-module discrepancies with both numbers plus a route, the settling-sample arithmetic, and the refusal count. CEO / chief: pre-registration, chief-only `commit-board-memo` (rank window 5–5), the deterministic identity-free memorandum text, the attestation state and aggregate-only CSV #80. The navigator (`main.js`) exposes it as one nav entry, and the gateway (`accessGateway.js`) holds `#/board` in the allowlist with the two right groups.

**Deliberately rejected.** A composite "board readiness score" (hides the disagreement the board is convened to see); reporting a point estimate with a confidence note (invites the reader to use the point estimate); rendering a live dashboard at memo-view time (a committed pack must not change after it was read); auto-correcting a failing claim (the module opens a decision and a delegation, it never edits the number); a new graph node (the memo's relationships are the existing `rolls-up-to` span edges).

**Verification performed this session (actual).** `npm run lint`: exit 0 (whole tree). `npm run check:boundary`: **389 app ES modules / 124 test suites / 23 documentation checks, 0 leaks**. `npm run check:links`: **654 internal links across 196 markdown files, all resolve**. `node --test tests/app/board-room.test.mjs`: **45/45 pass**. `npm run build:standalone` rebuilt from canonical sources: **7,073,013 bytes / 388 source modules / schema v91 / sha256 `ad247b6aba74fecb`** (never hand-edited). Additive-migration sweep: **81 test files'** version pins and migration-chain tails, and **25 files'** `CSV_EXPORTS.length` assertions updated mechanically to 90 / 79, plus every `'88 → 89'` chain tail extended to `'90 → 91'` in **58 files**. Full suite (`node --test tests/app/*.test.mjs`, 122 suites before this session's addition → 123, run to completion): **2,423 tests, 2,419 pass, 4 fail** on the first pass. All four were diagnosed and resolved in this session rather than waved through: (a) `typed-links-lineage` was a **real pre-existing gap** — Session 123 registered the `concordance` link type without a fixture, and this session's `boardmemo` type would have inherited the same hole; both fixtures and both focus-parameter contracts are now added, and the suite is **8/8**. (b) `standalone` failed on its own size ceiling (6,963,600 bytes) — raised honestly to 7,050,000 with the comment naming the six modules that moved it; the density check is untouched, and the suite is **7/7**. (c) `case-rehearsal` and (d) `talent-retention` were **load flakes** under `--test-concurrency=4` (a 16 s worker timeout and a 21 s axe run), not behaviour: re-run in isolation they are **7/7** and **35/35**. After the fixes the standalone was rebuilt (6,967,506 bytes · sha256 `a8fd83d5b066fb4d`) and lint / boundary / links were re-run clean.

**Merge with `origin/main` (found while opening PR #141 — recorded because it changed the shipped numbers).** `main` had merged its own **Session 124 — Hoshin Catchball Cascade** (`#/catchball`), which already held **ADR-0084** and **Schema v90**. Reconciled in this branch, not deferred:

- **Renumbered:** this session is **Session 125**, its decision record **[ADR-0085](docs/adr/0085-board-room.md)**, the schema is **v91 (additive `90 → 91`)**, and the board export is CSV scope **#80** (Catchball keeps #79). Files renamed, docs, `index.html`, code comments and every test pin swept.
- **Spine:** both rules are kept — the merge lost no contract and the spine is **65 rules / 65 contracts** with `boardRule` before `catchballRule` before the attention market, and `sealRule` still absolutely last.
- **Real conflicts resolved on merit, not by picking a side:** a duplicated `SAFE_READS` declaration (unioned), a board contract entry whose closing brace was lost in the merge, a CSV scope appended in the wrong position (board now after catchball so numbering follows position), two `MIGRATIONS[89]` keys (Catchball stays 89, the Board Room becomes 90), and `typed-links-lineage` fixtures for both new link types. `catchball-cascade.test.mjs`'s "the newest CSV scope is last" assertion was replaced with a position assertion that survives later sessions — the contract is that Catchball's scope survives and precedes the Board Room's, not that no future session may append.
- **Post-merge regression batch (actual):** `board-room` **45/45**, `catchball-cascade` **9/9**, `propagation-ledger` **31/31** (65/65 parity), `seal-chain` **15/15**, `standalone` **7/7**, `csv` **5/5**, `typed-links-lineage` **8/8**, `app` **33/33**, `domain` **39/39**, `attention-market` **31/31**, `expectation-concordance` **18/18**. Lint, boundary and links re-run clean on the merged tree; the standalone was rebuilt from the merged sources. A second full-suite pass on the merged tree was **not** completed before the pull request was merged at the user's request — stated plainly rather than implied.

**Honest limits.** Wilson intervals assume independent observations and the spans of a reporting tree are **not** independent, so the interval is a lower bound on uncertainty and the method panel says so. Sealing prevents anchoring, not a determined reader with the backup file. Seven claims are a **chosen** instrument with default thresholds, not a validated one. A local seat remains a declaration, not authentication. No vendor page was fetched this session (sandbox egress limited to the package registries), so `RESEARCH.md` §106 marks every product-specific claim `[UNVERIFIED]`.

**Known gaps.** Authenticated identity + tenant boundary; repeated-release differencing of a quarterly pack (complementary suppression across quarters, split/merge, phased access); outcome-grading the seven claim thresholds against decisions the workspace later made; real-browser screen-reader walkthrough `[UNVERIFIED]`.

**Repository status.** Branch `arena/ff2fa531-leados`, base `3a40fbb`. Commit, push and pull-request results are stated in the final report and in the pull request itself; nothing is claimed that was not observed.

**Repository identity (checked first).** `git remote -v` → `https://github.com/shahramclaude/Leados.git` (fetch + push). Branch `arena/ff2fa531-leados`, base `3a40fbb` (= `main`), initially clean. Identity **PASS**; no stop condition.

**Audit result (blunt).** Read at the seams that decide this session: `app/core/schema.js` (v89, `COLLECTIONS`, fail-closed normalizers, add-only `MIGRATIONS`), `store.js`/`postCommit.js` (one atomic boundary → savepointed rule spine), `propagationContracts.js` (64 rules / 64 contracts), `csv.js` (78 aggregate scopes), `main.js` (nav, 89 routes, aliases, badges), `chainRegistry.js`, `successionRegistry.js`, `seatRegistry.js`, `accessGateway.js`, `cases.js` link vocabulary, and the ADR-0069/0075–0083 domain modules. **What exists and works:** the transactional store, the hierarchy model with five declared altitudes, the disclosure ladder, the authority/mandate layer, the routing layer, mission control, the sealed spine, the concordance terminal. **What was shallow — and the finding that drove this session:** `#/board` was *promised twice* (`chainRegistry.js:396` as the chief's `board` duty; `successionRegistry.js:157` as the `board-line` relationship) and rendered **nothing**; the only "board pack" in the product was the `portfolio` tab's decision queue. The workspace could compute seven enterprise figures and had no honest way to put them in front of a board without averaging them, which is precisely the failure mode a board pack is supposed to prevent. **Role-tiering / five-altitude coverage: it exists and is real** — five ranks, attribute-based read/write decisions, a deny-by-default API allowlist, per-record disclosure classes, aggregate-only exports — but it remains a *declared* boundary enforced against a declared seat, not authentication, and every recent ADR says so. This session adds no new hierarchy primitive; it adds the enterprise-altitude surface that was missing and holds `commit-board-memo` to rank 5–5. Untested surfaces remain `[UNVERIFIED]`; the 383-module app was not read line by line.

**What shipped.** Six new modules (`boardRegistry.js`, `boardSchema.js`, `board.js`, `boardRules.js`, `boardActions.js`, `app/views/board.js`), three rules on the shared spine with three auditable contracts (**64 / 64**), additive `MIGRATIONS[89]` (`90 → 91`) with two collections (`boardMemos`, `boardMarkers`) and five clamped settings, one CSV scope (#78 → **#80**), one nav entry with a fact-only badge, seven route aliases (`board-room`, `board-pack`, `board-line`, `board-memo`, `disclosure`, `disclosure-memo`, `chair`), two API right groups, six safe reads, five axe-clean panels, a `board-*` CSS block, an ADR, and `tests/app/board-room.test.mjs` (**45 tests, 45 pass**).

**The decision that makes this a terminal rather than a pack.** Thresholds are declared *before* the first recorded look; each look stores a content fingerprint of exactly what was visible; a threshold moved afterwards carries `revisedAfterLook` permanently. Verdicts are decided by the **conservative end of a Wilson (1927) interval**, never the point estimate. Analytic cases pinned in the test file: 0 of 5 covered → upper **43.4%**, so a 60% floor **fails**; 4 of 5 → **37.6–96.4%** → `inconclusive`; 50 of 100 → ≈40–60% → straddles; 0 of 10 → upper ≈27.8%. `boardRequiredSample(50, 60) = 97`, and a claim exactly on its threshold returns `null` because no sample size decides a coin that is exactly fair — the panel prints that sentence instead of a direction.

**Refusal semantics (the two real defects found while building).** A first smoke run on an empty workspace showed `culture-signal` reading **0** — a health index over no records. Fixed: `measureCulture` now refuses below three dated records across 1:1s / feedback / pulses / recognition and prints the count. A second real defect: `Number(null)` is `0`, so a claim with **no declared threshold** was being measured against a threshold of zero and a binary claim's `null` interval was being printed as `0–0`. Fixed with a `numOrNull` helper in `board.js` and an explicit null guard in `boardSchema.js`'s `thresholdFor`; a threshold-less claim is now `refused` with "no threshold was declared … a claim without a refutation condition is an opinion".

**The concrete self-test (cross-module × cross-altitude, one transaction).** Committing a memo that carries a failing alignment claim produces, in the *same* atomic write: **one** governed DACI decision at chief altitude (title `Board line fails: “…”`, `authority: 'act-inform'`), **one** delegation to the holder of the worst span (`dueOn`/`reviewOn` = `min(60, boardRecheckDays)`), and typed `rolls-up-to` edges to every leadership ancestor of that span. A second explicit `boardScan()` adds nothing (markers). With `boardAutoPropagate: false` nothing opens automatically and the explicit scan still opens exactly one. The failing claim is built from **five divergent concordance rounds** under one director plus one aligned round under one manager — 1 of 6 clears the 60% floor, upper bound ≈56%, so the verdict is `failing`; the partition has two spans, the worst is the director's, and the delegation therefore goes to the director. Roll-up arithmetic is asserted exactly (parts sum to the claim's own denominator; a deliberately broken partition prints its delta).

**Five genuinely different pictures from one read model.** Frontline lead: which line of mine is failing, by how much, and what it costs — read-only, no commit. Manager: the span partition with the arithmetic printed. Director: named span rows and the delegation a failing span actually receives. VP: cross-module discrepancies with both numbers plus a route, the settling-sample arithmetic, and the refusal count. CEO / chief: pre-registration, chief-only `commit-board-memo` (rank window 5–5), the deterministic identity-free memorandum text, the attestation state and aggregate-only CSV #80. The navigator (`main.js`) exposes it as one nav entry, and the gateway (`accessGateway.js`) holds `#/board` in the allowlist with the two right groups.

**Deliberately rejected.** A composite "board readiness score" (hides the disagreement the board is convened to see); reporting a point estimate with a confidence note (invites the reader to use the point estimate); rendering a live dashboard at memo-view time (a committed pack must not change after it was read); auto-correcting a failing claim (the module opens a decision and a delegation, it never edits the number); a new graph node (the memo's relationships are the existing `rolls-up-to` span edges).

**Verification performed this session (actual).** `npm run lint`: exit 0 (whole tree). `npm run check:boundary`: **389 app ES modules / 124 test suites / 23 documentation checks, 0 leaks**. `npm run check:links`: **654 internal links across 196 markdown files, all resolve**. `node --test tests/app/board-room.test.mjs`: **45/45 pass**. `npm run build:standalone` rebuilt from canonical sources: **7,073,013 bytes / 388 source modules / schema v91 / sha256 `ad247b6aba74fecb`** (never hand-edited). Additive-migration sweep: **81 test files'** version pins and migration-chain tails, and **25 files'** `CSV_EXPORTS.length` assertions updated mechanically to 90 / 79, plus every `'88 → 89'` chain tail extended to `'90 → 91'` in **58 files**. Full suite (`node --test tests/app/*.test.mjs`, 122 suites before this session's addition → 123, run to completion): **2,423 tests, 2,419 pass, 4 fail** on the first pass. All four were diagnosed and resolved in this session rather than waved through: (a) `typed-links-lineage` was a **real pre-existing gap** — Session 123 registered the `concordance` link type without a fixture, and this session's `boardmemo` type would have inherited the same hole; both fixtures and both focus-parameter contracts are now added, and the suite is **8/8**. (b) `standalone` failed on its own size ceiling (6,963,600 bytes) — raised honestly to 7,050,000 with the comment naming the six modules that moved it; the density check is untouched, and the suite is **7/7**. (c) `case-rehearsal` and (d) `talent-retention` were **load flakes** under `--test-concurrency=4` (a 16 s worker timeout and a 21 s axe run), not behaviour: re-run in isolation they are **7/7** and **35/35**. After the fixes the standalone was rebuilt (6,967,506 bytes · sha256 `a8fd83d5b066fb4d`) and lint / boundary / links were re-run clean.

**Merge with `origin/main` (found while opening PR #141 — recorded because it changed the shipped numbers).** `main` had merged its own **Session 124 — Hoshin Catchball Cascade** (`#/catchball`), which already held **ADR-0084** and **Schema v90**. Reconciled in this branch, not deferred:

- **Renumbered:** this session is **Session 125**, its decision record **[ADR-0085](docs/adr/0085-board-room.md)**, the schema is **v91 (additive `90 → 91`)**, and the board export is CSV scope **#80** (Catchball keeps #79). Files renamed, docs, `index.html`, code comments and every test pin swept.
- **Spine:** both rules are kept — the merge lost no contract and the spine is **67 rules / 67 contracts** with `boardRule` before `catchballRule` before the attention market, and `sealRule` still absolutely last.
- **Real conflicts resolved on merit, not by picking a side:** a duplicated `SAFE_READS` declaration (unioned), a board contract entry whose closing brace was lost in the merge, a CSV scope appended in the wrong position (board now after catchball so numbering follows position), two `MIGRATIONS[89]` keys (Catchball stays 89, the Board Room becomes 90), and `typed-links-lineage` fixtures for both new link types. `catchball-cascade.test.mjs`'s "the newest CSV scope is last" assertion was replaced with a position assertion that survives later sessions — the contract is that Catchball's scope survives and precedes the Board Room's, not that no future session may append.
- **Post-merge regression batch (actual):** `board-room` **45/45**, `catchball-cascade` **9/9**, `propagation-ledger` **31/31** (65/65 parity), `seal-chain` **15/15**, `standalone` **7/7**, `csv` **5/5**, `typed-links-lineage` **8/8**, `app` **33/33**, `domain` **39/39**, `attention-market` **31/31**, `expectation-concordance` **18/18**. Lint, boundary and links re-run clean on the merged tree; the standalone was rebuilt from the merged sources. A second full-suite pass on the merged tree was **not** completed before the pull request was merged at the user's request — stated plainly rather than implied.

**Honest limits.** Wilson intervals assume independent observations and the spans of a reporting tree are **not** independent, so the interval is a lower bound on uncertainty and the method panel says so. Sealing prevents anchoring, not a determined reader with the backup file. Seven claims are a **chosen** instrument with default thresholds, not a validated one. A local seat remains a declaration, not authentication. No vendor page was fetched this session (sandbox egress limited to the package registries), so `RESEARCH.md` §106 marks every product-specific claim `[UNVERIFIED]`.

**Known gaps.** Authenticated identity + tenant boundary; repeated-release differencing of a quarterly pack (complementary suppression across quarters, split/merge, phased access); outcome-grading the seven claim thresholds against decisions the workspace later made; real-browser screen-reader walkthrough `[UNVERIFIED]`.

**Repository status.** Branch `arena/ff2fa531-leados`, base `3a40fbb`. Commit, push and pull-request results are stated in the final report and in the pull request itself; nothing is claimed that was not observed.

## Session 124 archive — Hoshin Catchball Cascade, 2026-11-04 (Schema v90, ADR-0084)


- Added `#/catchball`: negotiated pacts and rounds, capacity and budget checks, bowler diagnostics, weakest-link roll-ups, calibration and an aggregate brief/CSV.
- Schema migration 89 → 90 adds three collections. The shared spine has 64 rules and matching contracts, with Catchball before the final attention/seat/seal passes. Typed links, seat-scoped API, insights and CSV scope #79 are integrated.
- Verification after the parallel-main merge: 73 focused Catchball, Concordance, graph, routing, seal, CSV and standalone tests passed; ESLint, boundary and documentation-link checks passed; standalone rebuilt (6,984,496 bytes, 382 source modules). The pre-merge full `npm test` was interrupted when main advanced; no final full-suite result is claimed here.
- Limits: local seats are workflow declarations, not authentication. Executive item details and calibration cells are withheld; suppression is not differential privacy. Causal-thesis alerts are review prompts, not proof of causality.

## 2026-11-04 — Session 123: The Concordance Terminal (Schema v89, [ADR-0083](./docs/adr/0083-expectation-concordance.md), `#/concordance`, RULE-ECN-01..03, CSV #78)

**Repository identity (checked first).** `git remote -v` → `https://github.com/shahramclaude/Leados.git` (fetch + push). Branch `arena/26229072-leados`, base `c9cae3a` (= `main`), initially clean. Identity **PASS**; no stop condition.

**Audit result (blunt).** Read at the seams that decide this session: `app/core/schema.js` (v88, `COLLECTIONS`, fail-closed normalizers, add-only `MIGRATIONS`), `store.js`/`postCommit.js` (one atomic boundary → savepointed rule spine → derived-event guards), `propagationContracts.js` (61 rules / 61 contracts when audited; main's Session 122 added the seal rule, so the merged tree carries 63/63), `cases.js` (`LINK_ENTITY_TYPES`, `LINK_RELATIONS`, `resolveLinkedEntity`), `chain.js`/`seat.js`/`seatRegistry.js`/`accessGateway.js` (five altitudes, LCA, per-record disclosure classes, deny-by-default API allowlist), `csv.js` (77 aggregate scopes), `main.js` (nav, 89 routes, aliases, badges), and the ADR-0069/0075–0081 domain modules. **What exists and works:** the transactional store, the hierarchy/roll-up spine, the disclosure ladder, mandate + authority calibration, routing, mission control. **What was shallow:** performance management. Reviews capture evidence, the Reliability Terminal audits a leader's ratings over *time* (ICC, Spearman–Brown), the Performance Recovery Terminal walks Mager & Pipe once someone is already in trouble — and **nothing measured whether the two people in a review mean the same thing by the sentence they are arguing about**. Role-tiering **does exist** (five ranks, attribute-based read/write decisions, aggregate-only exports) but remains a *declared* boundary, not authentication, and every recent ADR says so. Untested surfaces remain `[UNVERIFIED]`; the 371-module app was not read line by line.

**What shipped.** Six new modules (`concordanceRegistry.js`, `concordanceSchema.js`, `concordance.js`, `concordanceRules.js`, `concordanceActions.js`, `app/views/concordance.js`), one shared-spine rule with an auditable contract (63 rules / 63 contracts), additive `MIGRATIONS[88]`, two collections, six clamped settings, one graph node (`concordance`) + two relations (`re-contracts`, `re-tests`), one CSV scope (#78), five nav panels with aliases/badge/title, gateway + seat-registry rights, CSS, an ADR, and `tests/app/expectation-concordance.test.mjs` (18 tests).

**The concrete self-test (cross-module × cross-altitude, one transaction).** `concordanceSubmit(id,'member',…)` closes a round; in the *same* transaction the test proves: `RULE-ECN-02` creates exactly one governed re-contracting decision whose subject is the expectation (the title names the dimension and the pair; the question says no person is the subject), one generated agenda line appears on the pair's most recent 1:1, and `RULE-ECN-01` writes `rolls-up-to` edges to **`dir1` and `vp1`** — the pair's leader is `mgr1`, so a frontline two-gauge finding reaches director and VP with zero re-entry. A second explicit `concordanceScan()` adds nothing (markers). With `concordanceAutoPropagate: false` no decision is opened automatically and the explicit scan still opens exactly one. Roll-up arithmetic is asserted exactly: `mgr1` owns 2, `mgr2` owns 1, `dir1` owns 0 and inherits 3; at 3 assessed pairs the span rate is **withheld** below the 5-pair cell floor with the reason printed.

**Statistical correctness.** Analytic cases asserted: perfect agreement → κ = 1; a balanced 2×2 cross on the five-point scale → weighted κ = 0, PABAK = 0, AC1 ≈ 0.4286; a hand-built 6-item table recomputed independently in the test (explicit 5×5 double loop) matches the module to 1e-12; Bland–Altman bias matches 2/3 on a known difference vector. The prevalence case asserts κ < 0.2 while AC1 > 0.7 **and** that the paradox is printed as a refusal reason. Partial instruments and degenerate marginals are refused with reasons; perfect agreement prints the shared-error warning instead of a green light.

**Verification performed this session (actual, post-merge).** `npm run lint`: exit 0 (whole tree). `npm run check:boundary`: **377 app ES modules / 122 test suites / 23 documentation checks, 0 leaks**. `npm run check:links`: **631 internal links across 194 markdown files, all resolve**. Suites re-run against the merged tree, all green: `expectation-concordance` **18/18**, `seal-chain` **15/15** (main's feature, version pins updated to the merged v89 honestly), `propagation-ledger` **31/31** (63/63 rule-contract parity), `attention-market` **31/31** (seal still last, attention market still fourth-from-last), `wait-cost` **45/45**, `deferral-option` **41/41**, `domain` **39/39**, `app` **33/33**, `org-design` **22/22**, `action-bundles` **19/19**, `operating-seat` **16/16**, `access-audit` **14/14**, `event-cascade` **12/12**, `altitude-router` **11/11**, `decision-rights` **10/10**, `mission-control` **10/10**, `cases-automation` **7/7**, `core` **15/15**, `csv` **5/5**, `standalone` **7/7**. `npm run build:standalone` rebuilt from the merged canonical sources: **6,879,047 bytes / 376 modules / schema v89 / sha256 `b31c89d1fb132e58`**. Mechanised sweeps for the additive migration: 83 test files' version/migration pins and 24 files' `CSV_EXPORTS.length` assertions, re-applied to main's newer files in the same commit (including `seal-chain.test.mjs`'s two version pins).

**Merge with `origin/main` (found while opening the PR — recorded because it changed the shipped numbers).** `main` had advanced 689 commits and merged its own **Session 122 — The Sealed Spine** (`#/seal`, hash-chained `audit.seal` per transaction), which had already claimed **ADR-0082** and the "Session 122" label. Resolved in this branch, not deferred:

- **Renumbered:** this session is **Session 123** and its decision record is **[ADR-0083](docs/adr/0083-expectation-concordance.md)** (`0082` stays the Sealed Spine). Files renamed and every cross-reference in code comments, docs and tests updated — `ADR-0082` in the tree now means the seal only.
- **Both features kept, both spines ordered deliberately:** `concordanceRule` sits **before** `attentionMarketRule`; `sealRule` remains **absolutely last**, so one seal still covers every module's writes — including the concordance roll-up edges, the re-contracting decision and the 1:1 agenda line — in the same atomic commit. **63 rules / 63 contracts** (main's 62 + RULE-ECN). Main's `attentionMarketRule` index assertions (`length - 4`) still hold by construction.
- **Schema:** main's seal deliberately needed no bump, so **v89 is still exactly this session's additive migration**; the seal's settings/arrays ride along through the `88 → 89` spread untouched. `seal-chain.test.mjs`'s "no bump of its own" assertions were updated to the merged reality (89, with the reason printed in the assertion message).
- **Gateway:** both right-declaration blocks kept (`audit-seal`/`sealScan` and `close-expectation-round`); `SAFE_READS` is the union (31 reads), so neither surface lost its deny-by-default contract.
- **Docs:** `README.md`, `ROADMAP.md`, `FEATURES.md`, `CHANGELOG.md` and `RESEARCH.md` now carry both sessions in date order — this one as §105 above §104 (the seal's domain hunt). `docs/adr/INDEX.md` lists 0082 then 0083.

**Still not verified locally (stated plainly).** The full `npm test` run (121 suites) was started and had not completed inside this session's execution budget — the sandbox suspends between tool calls, so wall-clock progress stalled; it was stopped deliberately rather than reported as passing. The verification above is what actually ran and passed (13 suites re-run after the schema sweep, ~250 tests, plus lint/boundary/links/standalone). The complete suite runs in CI on the pull request, and its result — not this paragraph — is the record.

**Honest limits.** Local seat selection remains an auditable declaration, not authentication; the seal is a read-model and UI guarantee that prevents *anchoring*, not encryption against a backup file. Six items is the instrument, not a sample: no predictive claim is made. Suppression is small-cell withholding, not differential privacy. The re-test comparison is an observational association, printed as one and refused below its floor. Real-browser screen-reader/contrast walkthrough remains `[UNVERIFIED]`. `LeadOS-standalone.html` is regenerated, never hand-edited.

**Changed files.** New: `app/core/domain/concordanceRegistry.js`, `concordanceSchema.js`, `concordance.js`, `concordanceRules.js`, `concordanceActions.js`, `app/views/concordance.js`, `docs/adr/0083-expectation-concordance.md`, `tests/app/expectation-concordance.test.mjs`. Modified: `app/core/schema.js`, `app/core/domain/postCommit.js`, `app/core/domain/propagationContracts.js`, `app/core/domain/cases.js`, `app/core/domain/seatRegistry.js`, `app/core/domain/accessGateway.js`, `app/core/csv.js`, `app/actions.js`, `app/main.js`, `app/styles.css`, the 83+24 swept test assertions, `README.md`, `ROADMAP.md`, `RESEARCH.md`, `CHANGELOG.md`, `docs/adr/INDEX.md`, `LeadOS-standalone.html`, and this log.

---
## Session 122 archive — The Sealed Spine, 2026-11-04 (Schema v88, no additional bump, ADR-0082)

## Repository identity (checked first)

- `git remote -v` → `https://github.com/shahramclaude/Leados.git` (fetch + push). Branch `arena/66ef986a-leados`, base `ccecf0a4b9f1b88f923917f184379131bf244993` (= `origin/main`). Identity **PASS**; no stop condition.

## Blunt audit (what was actually inspected)

- **Inventory:** programmatic reads of `actions.js`, `store.js`, `schema.js`, `postCommit.js` (rule array + engine), `propagationContracts.js`, `seatRegistry.js`, `accessGateway.js`, `intake.js`, `chain.js`/`chainRegistry.js`, `main.js` (nav/ROUTES/aliases/badges), `ui/components.js` + `ui/download.js`, the tests fixture pattern, and the boundary/docs-link scripts.
- **Working:** transactional store (clone → mutator → audit → 60 post-commit rules with savepoints → persist), append-only event log with `EVENT_CAP`, five altitudes over `person.managerId`, Operating Seat ABAC + `rolls-up-to` fan-out, ADR-0080 gateway (allowlist + fail-closed), intake with suggestion cards.
- **The gap:** the append-only log was append-only *by convention* — no proof against a hand-edited `localStorage` payload, a buggy import or a silent normalizer rewrite, and every downstream figure would recompute from the altered record with no signal.
- **Missing (now shipped):** a hash-chained, on-demand verifiable seal over every committed transaction, keyed when the vault is unlocked, attested up the chain of command, with an integrity certificate an auditor can hold.
- **Honesty:** the full app was not semantically audited line by line; untouched surfaces remain `[UNVERIFIED]` beyond the executed tests.

## Fresh domain hunt

Recorded in `RESEARCH.md §104` (fetched 2026-11-04): the 2026 performance-management roundups (Lattice, Culture Amp, Workday, Trakstar) sell reviews/OKRs/engagement with "audit trail logging" as a vendor-held table; Lucid's Audit Logs API is an Enterprise Shield *read* of vendor rows; the hash-chain + signed-checkpoint construction exists in security-engineering practice (per-tenant `sha256(prev || canonical)` chains, write-once export, verifiers that report reordered/truncated/re-hashed rows) but no surveyed people-analytics vendor offers a customer-*locally* verifiable sealed chain. Vendor numbers are marketing claims; we did not test any vendor's log.

## Named frameworks encoded

- **Hash chain / append-only integrity:** `seal = sha256(prev ‖ digest ‖ revision)`, genesis 64 zeros, linear replay verification — certificate-transparency construction at workspace scale.
- **HMAC-SHA256 (RFC 2104) over SHA-256 (FIPS 180-4):** `sealCrypto.js` verified against RFC 4231 test vectors and FIPS examples, node:crypto-confirmed; canonical sorted-key JSON so digests are content functions.
- **PBKDF2 (RFC 8018):** 256-bit session seal key, domain `leados-seal-v1:`, derived at unlock/enable/change-passphrase, memory-only, cleared at all five lock sites.
- **Jaques' time-span of discretion / LCA ownership:** intake routing resolves the owning seat as the lowest common ancestor of the mentioned people's managers — the same tree the Command Chain and seat roll-up use.
- **Attestation semantics:** a seal is a statement about a transaction; the roll-up counts it at each ancestor span. No person is ever bound to a seal (binding rejection: no identity/signature scheme over persons).

## Shipped

- `app/core/domain/sealCrypto.js`, `sealRegistry.js`, `sealSchema.js`, `sealChain.js`, `sealRules.js` (RULE-SEAL-01/02, `sealRule.id`/`label`); `app/views/seal.js` (four panels, testids `seal-verify`/`seal-scan`/`seal-enable`/`seal-disable`/`seal-toggle-auto`/`seal-verify-top`/`seal-download-cert`).
- Wiring: `schema.js` (`normalizeSealSettings` spread), `store.js` (seal-key derive/clear at five sites, cap exemption), `postCommit.js` (`sealRule` LAST, 62 rules (merged spine)), `propagationContracts.js`, `actions.js` (`sealRead`/`sealVerify`/`sealScan`/`sealBriefText`/`enableSealing`/`disableSealing`/`setSealAutoPropagate`), `seatRegistry.js` (`audit-seal` rank 1–5), `accessGateway.js` (`SAFE_READS`, API rights, `seal` route on the reviewed allowlist), `intake.js` (`resolveIntakeRouting`, `ownerId`/`ownerBasis`, `altitudeRouting`), `views/intake.js` (altitude-routing card), `main.js` (nav/ROUTES/aliases/badges/descriptions for `#/seal`).
- Schema: **no new collection and no migration of its own** — `SCHEMA_VERSION` is 88 after Session 121's additive bump (merged in parallel); three settings default when absent (`sealEnabled`, `sealAutoPropagate`, `sealMode`).
- Tests: `tests/app/seal-chain.test.mjs` (15) + two shipped rule-order assertions updated to the ADR-0082 contract.

## Verification (actual results)

- `node --test tests/app/seal-chain.test.mjs` → **15/15 pass**.
- Regression sweep, nine suites (seal-chain, intake, operating-seat, command-chain, core, encryption, mission-control, decision-rights, access-audit) → **152/152 pass, 0 fail**.
- `node scripts/check-canonical-boundary.mjs` → OK (365 app modules, 120 test suites, 23 documentation checks, 0 leaks).
- `npx eslint .` → clean.
- `node scripts/check-docs-links.mjs` → 617/617 internal links resolve (192 markdown files).
- **Post-merge full suite (`node --test "tests/app/*.test.mjs"`): 2360/2360 pass, 0 fail — 137 suites, 41 min, EXIT=0.** This is the same command CI runs; it covers this branch and PR #136's Altitude Router side by side, including the updated tail-order assertions (seat at −2, seal at −1).
- `npm run build:standalone` → **6,804,985 bytes · 370 source modules · schema v88 · source `3dcd435d`**; `node --test tests/app/standalone.test.mjs` → **7/7 pass** against that artifact.
- **[UNVERIFIED]:** the combined `npm run verify:canonical` wrapper was not run to completion in-session (its jsdom/a11y phase times out in this container; its constituent checks — lint, boundary, links, and the targeted suites above — were run individually and are green). A real-browser assistive-technology walkthrough of `#/seal` remains `[UNVERIFIED]`, as in every session.

## Defects found and fixed in this session’s own code

- **edit_file silent no-ops (5×):** `store.js` imports, `actions.js` imports, `propagationContracts` entry, and two others reported success without changing text. Re-applied with python `str.replace` + `assert old in src` and grep-verified. (Standing rule for this repo: verify every edit_file.)
- **HMAC v1 hex-in-pipeline bug:** the digest was hex-encoded before HMAC, so RFC 4231 vectors failed; fixed and re-verified against TC1/TC2/TC6.
- **Seal summary stored only 16-hex prefixes:** verification could not recompute full hashes (chain-break/seal-mismatch on clean state). Fixed: full `prev=`/`digest=` travel in the summary with `root` last so the 300-char cap truncates only the root; parser regex `{16,64}` with padEnd fallback.
- **`ctx.previousState` is deleted by the engine before rules run:** seal freshness was rewritten to a positional scan (events after the last seal, capped at 512) with idempotence by revision.
- **`renderSeal` returned `<main>` inside the shell's `<main id="view">`:** duplicate-landmark axe failures on `#/integrity`; both returns now `div.page` like every other view.
- **Alias shadowing:** the new alias block stole `integrity` (Signal integrity) and `trust` (Promise solvency); removed — only `seal`/`seals`/`audit-chain`/`attestation` remain.
- **`sealScan` had no seat right:** refused under every declared seat; added the `audit-seal` right (ranks 1–5) plus `SAFE_READS` entries and the `seal` route allowlist entry.
- **Two shipped rule-order assertions** (`DEFAULT_POST_COMMIT_RULES.at(-1) === seatRule`) updated to the ADR-0082 contract (`seatRule` at −2, `sealRule` at −1); `sealRule.id` added to mirror `seatRule.id`.
- **Sandbox outage mid-session:** the execution sandbox died after the first regression pass ("Sandbox is probably not running anymore" across all tools, ~10 retries). Work resumed after restart; the two pending rule-order fixes and the full verification sweep above are post-restart.

## Known gaps (honest)

- Full `npm run verify:canonical` and a real-browser AT walkthrough: `[UNVERIFIED]` (constituent checks green; wrapper times out in this container).
- No external timestamping, no write-once off-site copy, no HSM, no signed checkpoints co-signed by a second party; verification is on demand, not continuous.
- The chain proves non-alteration *since seal time* under the printed mode — not wall-clock time and not who operated.
- Legacy modules remain un-scoped under declared seats (carried from ADR-0080); the gateway refuses their raw reads/writes.

## Next 1–3 roadmap targets

1. [all altitudes] Authenticated identity + tenant boundary (carried).
2. [manager → CEO] External timestamping / signed checkpoints + write-once export.
3. [all altitudes] Continuous background verification with a visible last-verified stamp, then reviewed adapters for remaining legacy modules.

## Changed files (summary)

- New: `app/core/domain/{sealCrypto,sealRegistry,sealSchema,sealChain,sealRules}.js`, `app/views/seal.js`, `tests/app/seal-chain.test.mjs`, `docs/adr/0082-sealed-spine.md`.
- Edited: `app/{main.js,actions.js}`, `app/core/{schema.js,store.js}`, `app/core/domain/{postCommit,propagationContracts,seatRegistry,accessGateway,intake}.js`, `app/views/intake.js`, `tests/app/{operating-seat,decision-rights}.test.mjs`.
- Docs: `docs/adr/INDEX.md`, `README.md`, `FEATURES.md`, `ARCHITECTURE.md`, `LEADOS-STATE.md`, `ROADMAP.md`, `RESEARCH.md` (§104), `CHANGELOG.md`, `AI-SESSION-LOG.md`, `index.html` (meta), rebuilt `LeadOS-standalone.html`.

## Merge resolution (parallel Session 121 collision)

While this branch was open, `main` merged **PR #136 — "Session 121, The Altitude Router (Schema v88, ADR-0081)"** from the same base (`ccecf0a`): a parallel session that took the same session number, the same ADR number and a schema bump. Resolutions applied when merging `origin/main` into this branch:

- **Renumbering (theirs wins):** PR #136 keeps Session 121, ADR-0081 and the additive `87 → 88` bump. This session renumbers to **Session 122 / ADR-0082** — `docs/adr/0081-sealed-spine.md` → `0082-sealed-spine.md`, INDEX entry, and every seal-context `ADR-0081` reference across `app/`, `tests/` and docs (verified: no seal-context `ADR-0081` remains; their `0081-altitude-router.md` references untouched). RESEARCH numbering likewise: their §103 stays, this session's hunt becomes **§104**.
- **Schema claims:** this feature's docs now say "no additional bump atop v88" rather than "stays v87"; `seal-chain.test.mjs` asserts `SCHEMA_VERSION === 88`.
- **Kept both, verbatim unions:** `schema.js` imports + settings spreads (`normalizeRouterSettings` + `normalizeSealSettings`), `accessGateway` rights (`route-intake` + `audit-seal`), `SAFE_READS` (routing reads + seal reads), route allowlist (`routing` + `seal`), `main.js` nav/ROUTES/aliases/badges/descriptions for both surfaces, `INDEX.md` (0081 then 0082), and both prepend-style doc entries (README/ROADMAP/CHANGELOG/log; RESEARCH in ascending § order).
- **Spine order after merge:** `… → altitudeRouterRule → attentionMarketRule → successionRule → seatRule → sealRule` — **62 rules, 62 propagation contracts, 1:1 verified**; `sealRule` stays absolutely last so the seal covers the router's writes too.
- **Their tail-order assertions updated to the merged contract** (they encoded "seatRule is last", which was true on their branch alone): `attention-market.test.mjs` (derived readers now `['successionRule','seatRule','sealRule']`, market index `length-4`, `at(-1)` split across seat/seal), `altitude-router.test.mjs` (`at(-2)`/`at(-1)`), `wait-cost.test.mjs` (`length-4`, `slice(-3)`). Position-agnostic parity asserts (`PROPAGATION_CONTRACTS.length === DEFAULT_POST_COMMIT_RULES.length`) hold at 62.
- **Shallow clone:** `.git/shallow` (depth 1) made `git merge-base` fail with "no merge base"; fixed with `git fetch --unshallow origin` before merging.
- Alias audit after merge: `integrity → integrity`, `trust → solvency` intact; seal and routing alias sets disjoint; the only duplicate keys are the three pre-existing last-wins entries (`delivery`, `reporting-lines`, `escalation`) present at baseline.

## Sync

- Feature commit `ddf9e39` (31 files, +2150/−121) pushed to `origin/arena/66ef986a-leados` (`* [new branch]`).
- **Pull request [#137](https://github.com/shahramclaude/Leados/pull/137) opened and OPEN** against `main` (verified with `gh pr view 137 --json state` → `OPEN`).
- Follow-up commit: rebuilt `LeadOS-standalone.html` against source `ddf9e39`, CHANGELOG Repository status, this sync line.
- **PR #136 collision:** `origin/main` merged a parallel Session 121 (Altitude Router, ADR-0081, v88) from the same base. Un-shallowed the clone, merged `origin/main` (`3dcd435d`), renumbered this session to Session 122 / ADR-0082 / RESEARCH §104, updated six of #136's tail-order assertions to the merged contract, and re-verified: full canonical suite **2360/2360**, lint clean, boundary OK (371/121/23), links 624/624, standalone rebuilt against `3dcd435d` (schema v88, 7/7 portability).

## 2026-11-03 — Session 121: The Altitude Router (Schema v88, [ADR-0081](./docs/adr/0081-altitude-router.md), `#/routing`, RULE-AR-01..03, CSV #77)

**Audit result.** The canonical zero-build `app/**` was read at the seams that matter: `intake.js` (14-category pure on-device triage with weighted evidence, NegEx-style negation, softmax shrinkage, confidence bands, evidence spans and a hard conflict wall — but **no** `managerId`, `buildChain`, LCA or roll-up), `chain.js` / `seat.js` / `seatRules.js` (five Jaques horizons, LCA responsibility, per-altitude clocks, typed `rolls-up-to` edges), `postCommit.js` / `propagationContracts.js` (61 declared rules, 61 contracts, savepoints, derived-event guards), `actions.js` (atomic `_intakeDraftId` adoption), `automation.js` (`ensureEntityLink` exact-edge uniqueness), `cases.js` (graph labels/resolver), `accessGateway.js` / `seatRegistry.js` (fail-closed allowlist and record policies), `csv.js` and `main.js`. The gap was precise: a note chose a **module**, and the hierarchy was a **separate model**; the note never chose an altitude, never resolved onto a real seat, and never rolled up. Role tiering **does exist** (five ranks, attribute-based read/write decisions, deny-by-default) but is a local declaration, not authenticated multi-user security — and the app says so.

**What shipped.** Six new modules (`altitudeRouterRegistry.js`, `altitudeRouterSchema.js`, `altitudeRouter.js`, `altitudeRouterRules.js`, `altitudeRouterActions.js`, `app/views/altitudeRouter.js`), a shared-spine rule registered before `attentionMarketRule` with an auditable contract, an additive `MIGRATIONS[87]`, two collections, five settings, one graph node + three relations, one CSV scope, five nav panels, aliases/badge/title, gateway + seat-registry rights, CSS, and `tests/app/altitude-router.test.mjs` (11 tests). The new test file is the session's concrete self-test: it proves a single `routingConfirm` writes the case, fires `RULE-DEC-01` / `RULE-COACH-01` / `RULE-CFP-01` / `RULE-SUC-01` **and** `RULE-AR-01` edges to `mgr1`, `dir1`, `vp1` in one atomic transaction with zero re-entry, then proves staleness refusal, privacy wall, LCA, quarter-horizon lift, five-rung disclosure ladder, out-of-sample Wilson/Brier/rank-error calibration, one governed floor-breach decision per ISO week, seat boundary, aggregate-only exports, inertness and axe-clean rendering of all five panels.

**Verification performed this session (actual, 2026-11-03).** `node --check` on every changed JS/MJS file: PASS. `tests/app/altitude-router.test.mjs`: **11/11 PASS**. `npm run lint`: exit 0. `npm run check:boundary`: **365 app ES modules / 120 test suites / 23 documentation checks, 0 quarantined-tree, network or stale-onboarding leaks**. `npm run check:links`: **612 internal links across 192 markdown files, all resolve**. `node --test tests/app/standalone.test.mjs`: **7/7 PASS**. **Full `npm test` on the final source: 2,345 tests across 137 suites — 2,345 pass, 0 fail, 0 cancelled, 0 skipped, exit 0 (2,359,433 ms).** The four stages of `npm run verify:canonical` were each run and passed individually; the chained script itself was not re-run end-to-end because a single run exceeds a 30-minute shell limit. `npm run build:standalone`: rebuilt from canonical `index.html` at **6,772,940 bytes / 364 source modules / schema v88 / sha256 `875487fd8a8e9a11`**. Live preview on `0.0.0.0:5173`: `/`, `/index.html`, `/app/main.js`, both new router modules and the standalone artifact all return 200; the `#/routing` topbar shortcut and `leados-altitude-router` meta are present; preview-style Host/Origin accepted.

**Four pre-existing failures found at baseline and fixed in this tree (no shipped behaviour was weakened).** Each was reproduced on a detached worktree at `ccecf0a` before being touched, so none is a regression from ADR-0081: (1) `dynamics.test.mjs` asserted the saturated demo's `protect-learning` policy was an `investment`, contradicting the engine's own "learning is not a rescue once the team is saturated" regression — now asserts the honest `worsens`/`neutral` verdict plus the printed invoice; (2) `signal-integrity.test.mjs` pinned a stale CSV ordinal (#60) — the new `altitude-router` scope was **moved from index 2 to the end** so it is genuinely scope #77 and no existing ordinal shifts, and a positional assertion now guards against future mid-array insertions; (3) `succession-bench.test.mjs` declared seat `mgr1` but named `ic6`, a peer-span write the boundary correctly refuses — the seat is now declared at the common leader `dir1`; (4) `typed-links-lineage.test.mjs` had no fixture rows or route contracts for `mandate`, `missionbrief`, the new `routingplan`, or the `retention` query focus — fixtures and query contracts were added, and a mandate link's resolution to its terminal is recorded as an explicit known gap rather than a fake focus parameter. The typed-links test now exercises the new `routingplan` graph node through normalization, reload, resolution and navigation.

**Sync result (actual, not assumed).** `git add -A` → commit `f417f30` ("Session 121 — The Altitude Router (Schema v88, ADR-0081)", 111 files, 2,828 insertions / 349 deletions) → `git push -u origin arena/d4a34bd8-leados` succeeded with `[new branch] arena/d4a34bd8-leados -> arena/d4a34bd8-leados`. `gh pr create --base main --head arena/d4a34bd8-leados` returned `https://github.com/shahramclaude/Leados/pull/136`; `gh pr view 136` confirms **PR #136 is OPEN**, `mergeable MERGEABLE`, base `main`, head `arena/d4a34bd8-leados`, containing commit `f417f30`. Its `canonical` GitHub Actions check is **still in progress** at the time of writing (`npm test` takes ~39 minutes in CI too) and `CodeRabbit` is skipped; no CI success is claimed. All 111 changed files are in the commit: 8 new (six `app/` modules, `docs/adr/0081-altitude-router.md`, `tests/app/altitude-router.test.mjs`) and 103 modified (canonical `index.html`, `LeadOS-standalone.html`, `README.md`, `ROADMAP.md`, `RESEARCH.md`, `CHANGELOG.md`, this log, `docs/adr/INDEX.md`, nine `app/` wiring files, `app/styles.css`, and the mechanically swept v88 / 77-scope test assertions). A small follow-up commit records this result; no sync failure occurred.

**Known gaps / honest limits.** Authenticated identity and tenant boundary; reviewed adapters for legacy raw-data modules; temporal disclosure / repeated-release differencing tests; outcome-graded recommendations rather than confidence bands; a decision-rights `mandate` link resolves to `#/mandates` but not yet to a single focused contract. No production RBAC, no differential privacy, no survey anonymity, no message/keystroke/sentiment ingestion, no person scored or ranked. Real-browser screen-reader/contrast walkthrough remains **[UNVERIFIED]**. `LeadOS-standalone.html` is regenerated, not hand-edited. Local seats are auditable declarations.

---
## PR triage note — 2026-11-03

PR #84 (Session 74, `#/pay`, Schema v51, ADR-0039) closed as superseded: PR #85 merged the Merit & Pay-Equity Terminal under the same schema version and ADR number on 2026-10-30, and main is now at Schema v87 / ADR-0080 with 67 of #84's 74 files in conflict. No code from #84 was merged. Its three unique mechanics — pay-quartile reporting, the ≥5% joint pay assessment workflow, and remediation priced by re-fitting the gap model — are preserved as candidates in the top ROADMAP entry, with the ADR-0039 privacy constraint a future session must resolve explicitly.

## Merge integration note — 2026-11-03

Main integrated retention as schema v86 while PR #133 was open. Mission briefs now migrate from v86 to v87, preserving retention records and any existing brief data; the retention CSV brings the registry to 76 scopes. The full canonical suite has not completed.

# AI Session Log — Session 120, 2026-11-03: Mission Control (Schema v86, ADR-0080)

## Repository identity (checked first)

- `git remote -v` → `https://github.com/shahramclaude/Leados.git` (fetch + push). Branch `arena/bbe11e0c-leados`, base `b3b468e4b53b8e169faae7d23bf38fb768e697ea` (= `origin/main`), initially clean. Identity **PASS**; no stop condition.

## Blunt audit (what was actually inspected)

- **Inventory:** programmatic scan + Babel parse of `app/` (348 files / 236,950 lines / 0 parse failures), quarantined `src/` (3,094 / 262,344 / 0), `scripts/` (131 / 15,026 / 0), `tests/` (228 / 74,788 / 0). `createApi` stub exposed **522 API methods**. Inventory artifact: `/home/user/leados-audit-inventory.json`.
- **Working:** transactional store (clone → mutator → audit → rules with savepoints → persist), reporting tree + five altitudes + LCA, Operating Seat disclosure ladder, shared work-source registry, Action Bundle rehearsal/atomic executor, commitment-accounting budgets, DACI decisions, mandate lifecycle and authority calibration.
- **Broken/shallow (fixed this session):** the Operating Seat mostly filtered navigation while legacy screens and API calls still touched unrestricted state; a declared seat could be described as “enforced” while a legacy screen or API call read/wrote outside the intended boundary. Mission Control now has a central fail-closed API gateway, scoped render projection, reviewed adapters, and explicit operator handover. Drill-up/down detail ceilings and mission-adapter bypasses were closed and regression-tested.
- **Missing:** a daily altitude-specific operating loop with reviewed cross-module intervention and disclosure-safe upward brief. That is what shipped.
- **Honesty:** the full app was not semantically audited line by line; untouched surfaces remain `[UNVERIFIED]` beyond executed tests.

## Fresh domain hunt

Primary vendor/documentation pages fetched this session (recorded in `RESEARCH.md §102`): Microsoft Viva Glint (hierarchy + confidentiality thresholds, default numeric floor 5, manager direct/roll-up reports), Workday Skills Cloud / People Analytics (role-tailored insight, common skills ontology, consistent security), Cloverpop (decision logging/governance/orchestration), BetterUp Manage (manager development in flow of work, confidential coaching aggregated upward). Vendor claims are benchmarks, not independently validated capabilities. The opening: role-themed dashboards are commodity; a local leadership workspace where one reviewed intervention crosses modules and altitudes in one transaction while the upward brief refuses exact small-cell disclosure is the shipped slice.

## Named frameworks encoded

- **Organizational:** Jaques’ time-span of discretion (horizon debt = work older than its owner’s altitude horizon); five altitude-specific jobs, not five skins; LCA ownership for cross-span work.
- **Operational/statistical:** FMEA severity as one triage input (not a probability or person score); primary + complementary small-cell suppression; interval parent totals to block simple parent-minus-siblings differencing; explicit “not differential privacy”.
- **Engineering:** PDCA / assumption-based planning through existing Action Bundles; disposable background rehearsal; stale-rehearsal refusal; atomic adoption + guarded compensation; typed edges in the same transaction; shared post-commit spine with `missionRule` before final `seatRule`.
- **Finance:** commitment accounting (encumber existing envelope, never actual spend, never convert currencies); budget ownership checked at gateway and mission adapter.
- **Governance:** DACI review opened by a frozen brief; identity-free snapshot with source revision, evidence fingerprint, review date and limitations; no autonomous choice.

## Shipped

- **New:** `app/core/domain/missionRegistry.js`, `missionSchema.js`, `mission.js`, `viewScope.js`, `accessGateway.js`, `missionRules.js`, `missionActions.js`; `app/views/mission.js`; `tests/app/mission-control.test.mjs` (**10 tests**); `docs/adr/0080-mission-control.md`.
- **Mission Control (`#/mission`):** four panels (now / hierarchy / interventions / brief), five operating loops (week/month/quarter/half-year/year), rank-filtered commands (frontline coaching; executive budget), hierarchy drill-up/down with acting-seat detail ceilings, scoped handoff Markdown, immutable CEO brief freeze.
- **Scoped boundary:** `guardApi` wraps every API method; declared seats get exact allowlist + rank + person/source/budget checks; unknown methods fail closed. `scopedViewState` redacts legacy state; raw events/pulses not projected; seat-resolution failure blocks projection. Legacy raw-data screens withheld under declared seats; explicit local operator view preserved.
- **Schema v86:** additive `MIGRATIONS[85]` (`missionBriefs: []`, `missionCellFloor ?? 5`), bounded immutable brief normalizer, `missionbrief` graph node + `summarizes-span` relation, `RULE-MIS-01` registered in both rule registries before `seatRule`.
- **Wiring:** `app/actions.js` mission mount + guarded API return; `app/main.js` nav/route/aliases/badge/scoped context/export-import refusal/fail-closed seat panel; `app/styles.css` mission styles; `index.html` topbar/meta; `seatRegistry.js` mission rights + brief record class; `cases.js` missionbrief resolver; `postCommit.js`/`propagationContracts.js` missionRule.
- **Docs:** ADR-0080 + INDEX, README, ROADMAP, CHANGELOG, RESEARCH §102, ARCHITECTURE. Rebuilt `LeadOS-standalone.html`.
- **CSV scope deliberately not added:** mission briefs export Markdown only; CSV registry remains 75 exports through #74. Stated explicitly rather than implying CSV coverage.

## Verification (actual results)

- `node --test tests/app/mission-control.test.mjs`: **10/10 PASS** (migration, five loops, LCA + complementary suppression, projection/API refusal, atomic frontline intervention + vertical roll-up + withdrawal, stale rehearsal, executive owned envelope, chief brief + governed review/provenance, drill-up/down + adapter bypass refusal, axe-clean four panels).
- `node --test tests/app/standalone.test.mjs`: **7/7 PASS**.
- `npm run lint`: **PASS**.
- `npm run check:boundary`: **PASS** — 356 app ES modules, 118 test suites, 23 documentation checks, 0 leaks.
- `npm run check:links`: **PASS** — 605 internal links across 190 Markdown files.
- `npm run build:standalone`: **PASS** — 6,584,153 bytes, 355 source modules, schema v86, sha256 `068c2ba19db62a4d`.
- `npm run verify:canonical`: **NOT COMPLETED IN SESSION** — the full a11y-heavy suite was run twice and stopped after exposing regressions; the regressions were fixed and targeted re-runs passed. A final full green run remains pending/CI.
- Live preview served on `0.0.0.0:5173`; `/` returns 200. Real-browser assistive-technology walkthrough remains `[UNVERIFIED]` (automated axe-core in jsdom is what ran).

## Defects found and fixed in this session’s own code

- `missionBriefSnapshot` cells dropped `seatId`, so RULE-MIS-01 had no child seats to link; fixed snapshot + normalizer to preserve `seatId`/`horizonDebt`.
- Atomic-bundle test wrongly expected `revision === before+1`; executor increments per staged command plus final persist. Correct invariant: one persistence + one `bundle.committed` receipt.
- Drill-up could expose peer titles/owners; drill-down could inherit a junior altitude’s individual-detail ceiling. Detail now follows the acting seat and downward/own span only; eligible cases require acting-seat ownership.
- Mission adapters (`missionArchive`, `missionCommit`, etc.) could bypass the gateway by calling `createApi` directly; they now pass `guardApiCall`. `setMissionFloor` removed from safe reads so rank gate applies.
- Executive budget intervention could target an unowned enterprise envelope; mission adapter now requires an owned envelope and the gateway re-checks budget ownership.
- Mechanical schema bump leftovers: 130 v86 assertions across test files; migration `applied` tails and `CSV_EXPORTS.length` (74→75) swept across 65 test files.
- Full-suite regressions found and fixed: `#/calibration` alias had been stolen by Authority Calibration (restored to Confidence Transport; Authority Calibration keeps `#/authority-calibration`); Authority Calibration rule lacked a propagation contract (added, 59 rules = 59 contracts); the new gateway blocked reviewed mandate read/preview/scan and module automation-pause settings (added scoped adapters); Settings CSV preview defaulted to a new aggregate scope instead of the people table (restored people default). Targeted re-runs: `decision-rights` 10/10, `csv` 5/5, `confidence-transport` + `deferral-option` green in the 102-test targeted batch.

## Known gaps (honest)

- Local seat selection remains a **workflow declaration, not authentication**. No tenant isolation, cryptographic identity, server-side authorization, external notification or autonomous spending. Full workspace backups still contain the whole workspace.
- Legacy modules are not all seat-scoped yet; the gateway refuses their raw reads/writes under declared seats. Mission Control + Altitude Lens are the supported scoped surfaces.
- Suppression protects exact small-cell counts in the current release; it is not a formal privacy guarantee across time, reorganisation or external auxiliary data.
- Rehearsal is a software effect diff, not a causal forecast. No message is sent and no money is spent by adoption.
- The full repository was inventoried and parsed, but not every legacy line was semantically reviewed. Untouched surfaces remain `[UNVERIFIED]`.

## Next 1–3 roadmap targets

1. **[all altitudes] Authenticated identity + tenant boundary** with server-side authorization on every read/write/export and explicit-consent migration.
2. **[all altitudes] Reviewed adapters for legacy modules** — extend the gateway/projection pattern module by module until the full catalogue is safe under declared seats.
3. **[manager → CEO] Temporal disclosure and outcome learning** — repeated-release/reorganisation differencing tests, formal privacy review, and graded intervention outcomes before predictive recommendation.

## Changed files (summary)

- New: `app/core/domain/{missionRegistry,missionSchema,mission,viewScope,accessGateway,missionRules,missionActions}.js`, `app/views/mission.js`, `tests/app/mission-control.test.mjs`, `docs/adr/0080-mission-control.md`.
- Modified: `app/core/schema.js`, `app/core/domain/{seatRegistry,cases,postCommit,propagationContracts}.js`, `app/actions.js`, `app/main.js`, `app/styles.css`, `index.html`, `docs/adr/INDEX.md`, `README.md`, `ROADMAP.md`, `CHANGELOG.md`, `RESEARCH.md`, `ARCHITECTURE.md`, `AI-SESSION-LOG.md`, `LeadOS-standalone.html`, and schema/CSV assertion sweep across `tests/app/*.test.mjs`.

## Sync

Commit/push/PR result recorded in the final session response and PR. Full canonical verification remains pending because the long a11y suite was not allowed to finish before the PR request.

---

# AI Session Log — Session 119, 2026-11-03: Authority Calibration Ledger (Schema v85, ADR-0079)

## Repository identity (checked first)

- `git remote -v` → `https://github.com/shahramclaude/Leados.git` (fetch + push). Branch `arena/1420d6fc-leados`, base `e24117d41877a38224dff7d13d4a956b9bcc8539` (= `origin/main`), initially clean. Identity **PASS**; no stop condition.

## Task shipped

**Authority Calibration Ledger** — grade accepted mandate contracts against delivered outcomes over time (Brier / base-rate by action class and receiver altitude), so the workspace learns which spans reliably hold which rights — without rating persons. Reuses ADR-0078's mandate lifecycle (proposed→active→delivered→completed/returned/expired/revoked) and `rollupMandates` receiver-partitioned roll-up. New rules on the shared postCommit spine + `rolls-up-to` edges up the seat chain = altitude integrated with cross-module propagation as one architecture (§0.3).

## Fresh domain hunt

No vendor research needed this session — the Authority Calibration Ledger builds directly on ADR-0078's Decision Rights Exchange (Session 118) and ADR-0076/0075's Operating Seat + Command Chain (Sessions 116/115). Statistical conventions follow the existing calibration read-models (`premiseCalibration.js`, `leaderCalibration.js`): Brier, Wilson 95%, counts-only floors, advisory remap never auto-applied. No person is rated or ranked — the subject of every figure is a span and an action class.

## Named frameworks encoded

- **Statistical:** Bernoulli trial per terminal mandate (completed=held, returned/expired/revoked=not held); sequential out-of-sample forecast per cell (each trial graded against the cell's hold rate from strictly-prior terminals); Wilson (1927) 95% interval; pooled Brier vs base-rate reference (Brier skill); counts-only floor (n<5 → rate refused); reliability floor (hold rate below pct → governed decision above); Fréchet lower bound beside independence reference (assumption-free vs independence assumption).
- **Organizational:** action class × receiver altitude cells; no person scores; vertical `rolls-up-to` fan-out to every leadership ancestor of the receiver seat in the same transaction; one governed DACI decision per cell below the reliability floor per ISO week, marker-idempotent, never auto-applied.

## Shipped

- **New: `app/core/domain/authorityCalibration.js`** — `calibrateAuthority()` report (cells by action class × altitude, altitude pools, workspace row), `authorityCalibrationSignals()`, `authorityCalibrationBrief()`, `isTerminalMandate()`, `mandateHeld()`, `authorityCalibrationConventions()`, Wilson 95° interval, sequential forecast, Brier/skill.
- **New: `app/core/domain/authorityCalibrationRules.js`** — RULE-ACL-01 (floor breach → one governed DACI decision per cell per ISO week + `rolls-up-to` edges from each breaching mandate to every leadership ancestor of the receiver seat), RULE-ACL-02 (advisory audit marker when a cell reaches the evidence floor). Marker-idempotent, pausable via `authorityCalibrationAutoPropagate`, explicit `calibration.scan` always runs.
- **New: `app/core/domain/authorityCalibrationRegistry.js`** — ACL rule/event IDs and limits (floorN 1–50 default 5, reliability floor 1–100 default 60).
- **New: `app/core/domain/authorityCalibrationSchema.js`** — `normalizeAuthorityCalibrationMarkers()`, `normalizeAuthorityCalibrationSettings()` (clamped ranges).
- **New: `app/views/authorityCalibration.js`** — `#/authority-calibration` with 5 panels (Overview, By altitude, Signals, Settings, Brief), stat grid, cells table (click for member contracts), altitude table, floor/reliability settings, identity-free brief download, aggregate CSV export.
- **Modified: `app/core/schema.js`** — `SCHEMA_VERSION` 84→85, new `authorityCalibrationMarkers` collection, `MIGRATIONS[84]` additive, settings normalization.
- **Modified: `app/core/domain/postCommit.js`** — `authorityCalibrationRule` registered after `mandateRule` on the shared post-commit spine.
- **Modified: `app/core/csv.js`** — CSV scope #74 `authority-calibration` (aggregate-only: cell rows, altitude rows, workspace row; no ids/names/money).
- **Modified: `app/main.js`** — nav item, route, renderer alias, attention counter, route description.
- **Modified: `app/actions.js`** — `calibrationScan()` API action emitting `calibration.scan`.
- **Modified: `tests/app/csv.test.mjs`** — CSV scope count 74→75.
- **Rebuilt:** `LeadOS-standalone.html` (~6.50 MB, schema v85).

## Verification (actual results)

- `node --check`: **PASS** on all 10 new/modified modules.
- `npm run lint`: **PASS** — 0 errors.
- `npm run check:boundary`: **PASS** — 348 app ES modules, 117 test suites, 23 documentation checks, 0 leaks.
- `npm run check:links`: **PASS** — 589 internal links across 188 Markdown files.
- `tests/app/decision-rights.test.mjs`: **PASS** (no regressions from schema v84→v85 bump).
- `tests/app/command-chain.test.mjs`: **PASS** (72 tests).
- `tests/app/operating-seat.test.mjs`: **PASS** (13 tests).
- `tests/app/core.test.mjs`: **PASS** (migration chain v83→v84→v85 verified).
- `tests/app/csv.test.mjs`: **4/5 PASS** — 1 pre-existing axe-core/formula-neutralization failure unrelated to this change (people CSV preview modal, not authority calibration).
- `npm run verify:standalone`: pending — standalone artifact rebuilt but not yet re-verified.
- `npm run verify:canonical`: pending full suite (pre-existing jsdom/a11y timeouts on full run; key domain suites all pass).

## Known gaps (honest)

- Local seat selection remains a **workflow declaration, not authentication**. No tenant isolation, cryptographic identity, server-side authorization, external notification or autonomous spending.
- The full app was not semantically audited line by line; untested surfaces are `[UNVERIFIED]`.
- Real-browser assistive-technology walkthrough remains `[UNVERIFIED]`.
- CSV scope #74 round-trips cleanly; the pre-existing settings UI CSV preview test failure is unrelated.

## Changed files (summary)

- New: `app/core/domain/authorityCalibration.js`, `app/core/domain/authorityCalibrationRules.js`, `app/core/domain/authorityCalibrationRegistry.js`, `app/core/domain/authorityCalibrationSchema.js`, `app/views/authorityCalibration.js`.
- Modified: `app/core/schema.js`, `app/core/domain/postCommit.js`, `app/core/csv.js`, `app/main.js`, `app/actions.js`, `tests/app/csv.test.mjs`, `LeadOS-standalone.html`, `AI-SESSION-LOG.md`, `ROADMAP.md`, `README.md`, `CHANGELOG.md`.

## Sync

Pending: commit, push to `origin/arena/1420d6fc-leados`, open pull request.

## Repository identity (checked first)

- `git remote -v` → `https://github.com/shahramclaude/Leados.git` (fetch + push). Branch `arena/847734d3-leados`, base `78049912ad9989f55c50dedef06349a8bec74e39` (= `origin/main`), initially clean. Identity **PASS**; no stop condition.

## Blunt audit (what was actually inspected)

- **Coverage honesty:** a programmatic scan touched all 3,895 tracked source files (bytes/markers) and `node --check` parsed every domain module before the feature. Semantic reading was targeted: `store.js`, `schema.js`, `actions.js` (relevant regions), `main.js`, `postCommit.js`, `propagationContracts.js`, `savepoint.js`, `cases.js`, `automation.js`, `chain*.js`, `seat*.js`, `finance.js`, `load.js`, `delegations.js`, `succession*.js`, `csv.js`, `ui/dom.js`, `ui/download.js`, `ui/components.js`, and ADR-0075/0076/0077. The full 343-module app was **not** read line by line; claims beyond the inspected surfaces are `[UNVERIFIED]`.
- **Working:** the transactional store (clone → mutator → audit → rules with savepoints → persist), the reporting tree + five altitudes + LCA, the operating seat disclosure ladder and vertical `rolls-up-to` fan-out, the shared work-source registry, commitment-accounting budget lines, and the DACI decision record.
- **Broken (fixed this session):** `app/views/succession.js` called `downloadText(filename, text)` while the helper takes `{filename, text, mime}` and still toasted success. Now uses the real contract and opens a copyable fallback when the browser blocks the download; regression-tested.
- **Shallow:** delegations named a task owner but not the *right* being transferred, its expiry, its budget, or its return path. Decisions recorded a choice but not the authority to make it. Executive roll-ups had counts without an authority partition to drill into.
- **Missing:** a closed-loop handoff contract — explicit accept/deliver/verify/return/revoke, capacity evidence, real encumbrance, expiry/recovery, and altitude-scoped disclosure on the same work graph. That is what shipped.

## Fresh domain hunt (snippet-level, 2026-11-03)

Named vendors and takeaways are recorded in `RESEARCH.md §101`: Workday (approval chains; Extend does not support delegation; time-boxed manager delegations), ServiceNow (`sys_user_delegate` windows), Microsoft Copilot Studio (agent flows, human approvals, unavailable-approver delegation, least-privilege autonomous-agent guidance), Aera (authority thresholds, decision memory), Cloverpop (decision flows), Visier (hierarchy-derived security, aggregate cuts), Lattice/Culture Amp (evidence-grounded coaching that does not execute tasks). **Vendor claims are benchmarks, not independently validated capabilities.** The opening: approval chains and delegation windows are commodity; a leadership-specific closed-loop authority contract is not.

## Named frameworks encoded

- **Engineering/operational:** two-sided receipt (deliver ≠ verify), append-only transition history, idempotent typed edges, savepoint-atomic propagation, small-cell refusal below n=5.
- **Economics/finance:** commitment accounting (encumber → actual → release), opportunity-cost capacity headroom, no cross-currency summation, unknown ≠ zero.
- **Strategy/political science:** principal–agent alignment (Jensen & Meckling 1976), residual control rights (Grossman–Hart–Moore), span-of-consequence / lowest common ancestor, Mendelow stakeholder salience.
- **Statistical:** exact receiver partition (no ancestor double count), pooled counts vs. refused rates, redaction rather than inferred detail.
- **Organizational:** Jaques time-span of discretion, five altitude-specific questions, recovery owned at the sending span.

## Shipped

- **Decision Rights Exchange** (`#/mandates`, aliases `decision-rights`/`authority`/`handoffs`): offer → explicit accept → evidence deliver → sender verify; return/revoke/expiry/scope/budget-drift recovery; capacity plan when headroom unknown/insufficient; spending right with same-currency budget encumbrance/actual/release; receiver-partitioned roll-up with `?panel=rollup&span=` drill-down; rank ≥4 non-party redaction; aggregate-only CSV #74 and brief; pausable automatic reconciliation + explicit scan.
- **Wiring:** schema v84 additive `MIGRATIONS[83]`, fail-closed `normalizeMandates`, `mandateAutoPropagate` setting, `mandate` graph node + `authorizes`/`binds-receiver`/`recovers-authority` relations (100 total), `authority` record class, 3 action rights, `mandateRule` (RULE-MND-01..03) before the Attention Market and final `seatRule`, propagation contract, `createApi` mount, nav/badge/route description, `index.html` link + meta, CSS, four axe-clean panels.
- **Succession download fix** + regression.

## Verification (actual results)

- `npm run lint`: **PASS**.
- `npm run check:boundary`: **PASS** — 343 app ES modules, 117 test suites, 23 documentation checks, 0 leaks.
- `npm run check:links`: **PASS** — 606 internal links across 188 Markdown files.
- `tests/app/decision-rights.test.mjs`: **10/10 PASS** (schema, routing refusals, two-sided lifecycle + cross-module/vertical propagation, capacity/fingerprint re-checks, budget encumbrance/actual/release, recovery, permissions, roll-up/redaction/aggregate export, pause/scan, axe panels + succession download regression).
- `npm run verify:standalone`: **PASS** — 7/7; `LeadOS-standalone.html` rebuilt (~6.50 MB, schema v84).
- `npm run verify:canonical` (lint + boundary + links + full suite): **PENDING_FULL_SUITE**.
- Live preview served on `0.0.0.0:5173`; `/` and `/app/views/mandates.js` return 200; index carries the `leados-decision-rights` meta and `#/mandates` link. Real-browser assistive-technology walkthrough remains `[UNVERIFIED]` (automated axe-core in jsdom is what ran).

## Known gaps (honest)

- Local seat selection is a **workflow declaration, not authentication**. No tenant isolation, cryptographic identity, server-side authorization, external notification or autonomous spending. Full workspace backups still contain the whole workspace.
- Complementary suppression across drill-down chains (differencing a small child span) is not yet implemented; root counts are exact but enterprise confidentiality is not claimed.
- No authority calibration ledger yet (grading which spans reliably hold which rights over time).
- Capacity evidence depends on the existing measured load model; spans with no quantified baseline are `unknown` and require a written plan, not an invented score.
- The full app was not semantically audited line by line; untested surfaces are `[UNVERIFIED]`.

## Next 1–3 roadmap targets

1. **[manager → CEO] Complementary suppression** across the authority roll-up + reorganisation tests (Glint-style), before claiming enterprise confidentiality.
2. **[all altitudes] Authenticated identity + tenant boundary** with server-side authorization on every read/write/export and explicit-consent migration.
3. **[director → CEO] Authority calibration ledger** — grade accepted contracts against delivered outcomes by action class and altitude (Brier/base-rate), without rating persons.

## Changed files (summary)

- New: `app/core/domain/mandate{Registry,Schema,Rules,Actions}.js`, `app/core/domain/mandates.js`, `app/views/mandates.js`, `docs/adr/0078-decision-rights-exchange.md`, `tests/app/decision-rights.test.mjs`.
- Modified: `index.html`, `app/main.js`, `app/actions.js`, `app/styles.css`, `app/core/schema.js`, `app/core/csv.js`, `app/core/domain/{cases,postCommit,propagationContracts,seat,seatRegistry}.js`, `app/views/succession.js`, `docs/adr/INDEX.md`, `README.md`, `ROADMAP.md`, `RESEARCH.md`, `CHANGELOG.md`, `FEATURES.md`, `LEADOS-STATE.md`, `LeadOS-standalone.html`, and the schema-83→84 / CSV-count assertion sweep across `tests/app/*.test.mjs`.

## Sync

- Commit `ac57f58` pushed to `origin/arena/847734d3-leados`.
- Pull request opened: **https://github.com/shahramclaude/Leados/pull/131** (base `main`).
- Full canonical suite was still running at PR open; its final result is recorded below once complete.
