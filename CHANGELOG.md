## Changelog — 2026-11-06 · Session 144: The Diligence Ledger (ADR-0104, Schema v106 · additive 105 → 106, CSV #100, `#/diligence`)

**What changed, and why (plain language).** A leadership team can only learn from a decision if it knows *what it knew when it decided*. Existing audit trails record the decision and its outcome; the Hindsight Lock records the links that were made; the Epistemic Ledger records what nobody opened. None recorded the act of **looking** — especially looking at a fact, judging it irrelevant, and deliberately not using it. That is the difference between a thin process and a considered one, and it was invisible. Session 144 makes it a first-class dated record and freezes the **knowable set** it was performed against, in the same atomic transaction as the decision.

- **A derived frontier, not a typed checklist.** `RULE-DLG-01` harvests dated POINTERS from five evidence classes owned by other modules — `risk` → cases, `assumption` → premises, `commitment` → delegations, `objective` → goals, `precedent` → strictly earlier settled decisions. The id is `dlg-<FNV1a(decisionId)>`, so a rescan duplicates nothing. Undated records are excluded rather than guessed. **Why:** a human re-typing what they remember creates a second record that decays exactly where the first was ignored.
- **Looking-and-dismissing counts.** `used`, `deferred`, and `ruled-out` **with a required written reason** are append-only consultation acts. **Why:** an audit that only counts used facts punishes a leader for reading and rejecting irrelevance, and silently charges that deliberate act as a miss.
- **Statistics that can refuse.** Coverage is a Wilson (1927) 95% score interval, **BLANK** below the declared knowable floor. Class inattention uses an **exact** Jeffreys Beta(½,½) equal-tailed 90% credible interval computed from the regularised incomplete beta (Lanczos log-gamma, Numerical Recipes continued fraction, bisection); a class whose whole upper bound sits below the declared ceiling is DARK. A pre-decision **process forecast** is graded exactly ONCE, out of sample, by Brier (1950) skill against a strictly-prior maximum-entropy 0.5 base rate; negative skill is printed, never hidden. **Why:** a small-cell rate with no refusal is a number that looks like evidence but is not.
- **One governed finding per real condition.** `RULE-DLG-02` (thin settled frontier) and `RULE-DLG-03` (dark class) open bounded, marker-idempotent decisions per span/class per ISO week; `RULE-DLG-04` writes the once-only grade as a separate dated graph node. `diligenceFindingIds` excludes this module's audit output from the Hindsight Lock. **Why:** an auditor's output is not operational work; without that exclusion a second-order decision cascade is produced by the audit itself.
- **Event-scope hardening (a real regression found by the full suite).** The shared post-commit spine runs on EVERY commit. The Diligence rule now wakes only for ROOT decision lifecycle events, settlement events, its own events, or an explicit `diligence.scan`; derived `decision.created` events from other rules are audit output, not new human commitments. `settlePass` still derives status on every commit but writes no event and opens no work. Findings run only on explicit/own/settlement passes with a whole-ledger budget. **Why:** an unrelated premise write was opening governed decisions and flooding the bounded event queue; the fix keeps the generalized engine while respecting its 64-event production cap.
- **Explicit whole-workspace replays get a bounded rehearsal budget.** `MAX_REPLAY_EVENT_BUDGET = 256` in `postCommit.js`, requested by the read-only assurance rehearsal and by an operator's `retryWatchPromotion` of a failed promotion. Ordinary writes keep the 64-event cap. **Why:** at HEAD (commit `8509920`) `assurance.test.mjs` reported **56** rolled-back rules and `event-cascade.test.mjs` reported **105** on a seeded workspace — a fake failure caused by truncating a legitimate cascade, not by broken rules. Both suites are now green without weakening the production safety cap.
- **Schema v106 additive.** Four collections (`diligenceChecklists`, `diligenceConsults`, `diligenceGrades`, `diligenceMarkers`), eight clamped conventions, fail-closed normalizers, `MIGRATIONS[105]` with empty ledgers, CSV scope #100, route `#/diligence`, ADR-0104. **Why:** an upgraded workspace must open with an honest empty ledger, never an invented frontier.
- **Disclosure and rights.** `record-diligence-consult` rank 1–5; `govern-diligence` rank 4–5 **and** a full-access seat. `MODULE_MANIFESTS.diligence` is `unit` / adapter-scoped with `detailCeiling: 0`; CSV #100 is aggregate-only with BLANK refusals; the upward brief is identity-free. **Why:** the CEO needs the direction of the gap, not a person's reading history.

**Cross-module links added/updated.** `diligence-for` (frontier → decision), `deliberates-on` (frontier → each typed fact pointer across cases / premises / delegations / goals / decisions), `rolls-up-to` (one per leadership ancestor, in the SAME transaction as the decision), `tracks-followup` (governed finding → frontier), `informs` (finding → owning span), `grades-diligence` (once-only grade → frontier). All are written through the same generalized `ensureEntityLink` engine; altitude is a dimension of the shared spine, not a second workflow. The `diligenceRule` is registered before `attentionMarketRule` with a published propagation contract (85 rules / 85 contracts).

**Organizational altitude(s) served this session.** All five: frontline lead (rank 1) records what it actually consulted on a shift-level call; manager/director (2–3) see which evidence classes the span systematically walks past and whether the floor is applied consistently; VP/executive (4) re-declares conventions and reads portfolio-level thin deliberation; CEO/C-suite (5) receives the identity-free upward brief with counts, directions, refusals and pooled Brier skill. `DILIGENCE_PLAYBOOK` declares one Jaques (1956) time-span question per altitude.

**Competitive/ambition benchmark this session.** Fresh 2026 public-snippet hunt: decision-provenance guidance demands immutable input/model-version/human-override trails; forensic legal-AI logging tabulates "alternatives rejected"; EU AI Act / GDPR compliance-by-design maps to append-only decision dossiers with evidence coverage; decision-tracking products (Cloverpop, Loomio, Otter, Notion/Confluence, Fellow, Coda, Lockstep) remain manual decision registers; prediction journals (decision-log, brier.ink, imSuvro/hindsight, Foresight Arena) pre-register and score forecasts with Brier / Murphy / Wilson and explicit small-N refusals. **Gap claim, not a market-first claim:** no surveyed product was shown to derive a knowable set from five other modules at decision time, count looking-and-dismissing as diligence, detect dark evidence classes with an exact Jeffreys interval, grade the leader's own process forecast, and roll the frontier up the tree atomically under disclosure governance. Vendor capability was not audited; all sources are public snippets/secondary pages.

**Verification (exact).** `diligence-ledger` **17/17**; `borrowed-evidence` **36/36**; `assurance` **10/10**; `event-cascade` failed-promotion retry **1/1**; `standalone` **7/7**; `npm run lint` exit 0; source-wide `node --check` **554 files / 0 failures**; `check:boundary` **517 app ES modules / 148 test suites / 23 doc checks / 0 violations**; `check:links` **849 internal links / 222 markdown files / all resolve**; `build:standalone` **8,707,075 bytes · 516 modules · schema v106 · sha256 a1eb8a43308e26eb**; previously `disclosure-compiler` **21/21** and `attention-market` **31/31** after the v106 literal sweeps. Full `npm test` was started after the final source edit but **did not complete** before the PR was requested; its partial log (9 `not ok` lines, all in failure groups reproduced or partly reproduced at HEAD) is described honestly in `AI-SESSION-LOG.md`. This is **not** a green-suite claim.

**Honest limits / `[UNVERIFIED]`.** A full line-by-line audit of every one of the repository's 4,407+ files was **not** completed; claims about files not personally inspected are labelled `[UNVERIFIED]`. Coverage is bounded by what the workspace recorded: work nobody logged is invisible. Conventions are declared and clamped, never fitted. The local operating seat is a workflow declaration, **not** authentication or server-enforced access control. A real-browser assistive-technology walkthrough of the six panels is **[UNVERIFIED]** (jsdom + axe-core ran). Vendor capabilities were not audited. No LLM-invented risk, no per-person diligence score, no automatic closing of a human decision.

**Repository status.** Branch `arena/f34ca6ab-leados`; `origin https://github.com/shahramclaude/Leados.git` verified; base commit `8509920`. Commit **`54cceb9`** pushed successfully (`143 files changed, 4,231 insertions(+), 510 deletions(-)`); pull request **#171 — https://github.com/shahramclaude/Leados/pull/171** opened from this branch to `main`. `LeadOS-standalone.html` rebuilt. No merge was attempted. The full-suite limitation above is real and is not hidden by the PR.

**Next up (from roadmap).** 1) **[PLANNED, largest remaining gap — all altitudes]** natural-language intake that auto-classifies an unlogged "we looked at X" into the correct module and altitude, with confidence-scored auto-routing. 2) **[PLANNED — VP+]** decision-family diligence: judge a portfolio of related decisions as one frontier so a repeated miss is charged as a pattern. 3) **[PLANNED — Director+]** downward disclosure of a dark class via the ADR-0092 differencing register, naming the class without revealing the peer spans it was inferred from.

## Changelog — 2026-11-05 · Session 143: The Epistemic Ledger (ADR-0103, Schema v105 · additive 104 → 105, CSV #99)

**What changed, and why.** Every terminal in this workspace measures work that *reached* the record. Nothing measured the opposite: the signals the record is already carrying that nobody has opened. A risk case open for sixty-five days, a premise the record has already breached, a delegation three weeks past due, a feedback follow-up nobody closed, a goal at risk with a quarter left. Each is written down, dated and unread — and the category answers that question with a survey. `#/epistemic` reads it off the workspace's own dated records, and refuses to print anything its own floors cannot carry.

- **Nothing is invented, and nothing is copied.** Seven signal classes are harvested from records other modules own; each freezes **one** unknown per source record with an id hashed from `(class, sourceType, sourceId)`, so a rescan cannot duplicate it and a harvest can never be mistaken for a human declaration. The unknown stores a `rests-on` pointer and **no** record content.
- **The unknown is a graph node, immediately.** `RULE-EPI-01` writes one `rests-on` edge to the source record and **one `rolls-up-to` edge per leadership ancestor in the same atomic transaction** — the transaction that notices a missed signal is the transaction that makes the missed signal visible above the span that missed it. No second engine, no nightly glue.
- **Escalate on sight, never twice.** `RULE-EPI-02` opens exactly ONE governed decision per unopened danger/defect unknown past `epistemicEscalateDays`, aged from **`evidencesOn`** rather than from the day the ledger happened to look: a 65-day-old case is escalated on the day it is harvested, because the organisation already spent two months not opening it.
- **Expiry is not resolution.** `RULE-EPI-03` marks an unknown `expired` when its declared, evidence-bound window closes unanswered, and prompts once per ISO week — the workspace will not launder a missed risk into a closed one by the passage of time.
- **The overconfidence index is direction-first.** Cohen's κ (1960) on the belief × record 2×2, with the prevalence and bias indices and PABAK (Feinstein–Cicchetti 1990). **Refused** below the paired floor and where one cell carries the table; the direction is printed because an optimism gap (handed up) and an under-confidence gap (handed down) are different diseases with different owners, and an averaged index across two opposite-pointing indices is a lie.
- **A belief about work the record has already settled is refused at write time** — that is a memory, and grading it as foresight is precisely the fraud this module exists to prevent.
- **The implied ledger reads the ABSENCE of evidence.** Per span, the ratio of measurable activity that produced **no** arriving edge, with the rule of three (Hanley–Lippman-Hand 1983) as the honest upper bound where nothing arrived. Unit of analysis: the unknown, the span, the class, the cell — **never a person**.
- **The conventions are governance, not preference.** `record-epistemic-unknown` (rank 1–5) records and reads at your own span; `govern-epistemic` (rank 4–5 **and** `seat.fullAccess`) re-declares the ten conventions. A manager may say what they do not know; they may not re-declare what the whole workspace measures.
- **Schema v105** (additive `104 → 105`): four collections and ten clamped conventions, fail-closed normalizers, **no back-fill** — an upgraded workspace opens with an empty ledger and no invented finding.
- **CSV scope #99** aggregate-only, 32 columns, no unknown id, record id, note or answer; every suppressed or refused figure is **BLANK, never zero**. Disclosure manifest declares the `unit` class and a scoped adapter, and the route joins the renderer catalogue 1:1.
- **`epistemic.` is a derived-event prefix.** Re-deriving the ledger must never count as the operator doing work, or every scan would look like activity and the Operating Seat's freshness rules would be measuring this module instead of the organisation.

**Defects found and repaired, in code written this session.**
1. **`normalizeSettings` never spread `normalizeEpistemicSettings`.** All ten conventions silently reverted to defaults on every load — a window of 120 read as 90, and every floor, the dark threshold and `autoPropagate` went with it. The symptom looked like "the engine ignores my settings"; the cause was one missing spread.
2. **Live signals were aged out by the harvest window.** A goal at risk since July and a premise breached in July were dropped for being older than 120 days, i.e. the module reported its own bookmark as the finding. Signals now carry a `live` flag: live operational conditions expire from **today**, and only historical/opportunity records keep the window.
3. **Attribution climbed to the wrong seat.** The unknown was owned by the highest-ranking seat covering the work rather than the responsible one; it now resolves through `responsibleNodeId` — the same function the Command Chain uses — so the two cannot disagree about who owns an unread signal.
4. **RULE-EPI-02 aged from the bookmark, not the condition** (fixed above, listed because it changed behaviour the tests had already blessed).
5. **A fixture hand-wrote a derived premise `status`** and the engine correctly overwrote it; the fixture now supplies an `against` observation at LR 12 and asserts the derived `breached`.

6. **A rescan was not idempotent across modules (found by the merge).** Each escalation this module opened is a `decision` record, and `RULE-HND-01` froze its information set — a lock with zero consulted facts on a form the engine authored — which then became a subject for the next pass. On a seeded workspace a rescan went 109 → 213 decisions and 77 → 6,132 links. `RULE-HND-01` now skips any decision carrying a rule marker (provenance, not content), and an explicit scan escalates the whole ledger in one pass instead of six per pass. Verified: `after1 == after2 == after3`, and a regression test asserts it.
**Verification:** `epistemic-ledger` **19/19**; targeted batch `disclosure-compiler` + `hindsight` + `board-room` + `epistemic-ledger` **104 tests, 0 failures**; `npm run lint` exit 0; `check:boundary` 511 modules / 147 suites / 23 doc checks, 0 violations. Full `npm test` not run to completion — no claim made.

## Changelog — 2026-11-05 · Session 142: The Hindsight Lock (ADR-0102, Schema v104 · additive 103 → 104, CSV #98)

**What changed, and why.** The workspace could tell you whether a decision *worked*. It could not tell you whether it was *knowing* — and a good outcome from a thin process is the most expensive lesson a leadership team can learn, because it will be repeated. `#/hindsight` reads the evidence the workspace already wrote: a decision's date, its recorded outcome, the module's own six-free `decisionQuality` bar, and the typed links to cases, goals, premises, forecasts and commitments that each carry their own date.

- **The lock is a fact, not a computation.** `RULE-HND-01` freezes the decision's information set **in the transaction that records the decision** — every typed link whose `createdOn` is on or before the decision date, each resolved to its own record date. The set is stored on `decisionLocks` and is never recomputed, so the answer cannot drift as the workspace grows. It stores fact ids, types, dates and classes — **never the content of a fact**.
- **Four partitions, two of which may enter a rate.** `known` (linked when locked, dated ≤ decision), `missed` (dated ≤ decision, linked only afterwards — knowable and not consulted), `later` (dated after: printed, never charged), `undated` (excluded, never guessed). Facts pointed at by the module's **own** rules (`RULE-HND-*`) are excluded, so the audit can never inflate its own information set with its own findings.
- **Coverage refuses itself.** `known / (known + missed)`, Wilson (1927) 95% score interval, **REFUSED** below `hindsightFactFloor` (= 3) knowable facts: two of three is not a rate. A refused cell prints `refused`, never `0%`.
- **Process × information × outcome.** Sound process is `met ≥ 4` of the module's five requirements; a closed information set is coverage ≥ 60% (a declared convention, printed beside every rate). `earned` (repeat the method) / `resulted` (luck — the dangerous lesson) / `variance` (do not abandon the method) / `fixable` (the missing requirement is named) / `unmeasured` (the axis cannot be measured; the reason is printed and the decision leaves every rate). **No person is ever graded.**
- **Gated statistics.** The resulting share prints only above `max(3, cell floor)` measured decisions; the exact two-sided Fisher test (rational arithmetic, no floating point) is refused below eight settled decisions; per-span and altitude × quadrant cells below three are **suppressed**, not zeroed.
- **Cross-module links in one transaction.** `locks` (lock → decision), `consults` (lock → each consulted fact, provenance only), `rolls-up-to` (one edge per leadership ancestor), `tracks-followup` (finding → the decision it was read from).
- **`RULE-HND-02..04`** on the shared post-commit spine (**83 rules**, one propagation contract placed after the Reputational Capital Ledger): one governed process review per successful mistake — marker-idempotent, **never twice**; one gap decision when two or more knowable facts went unconsulted; one weekly ask for a decided-but-ungraded decision that passed its own review date + grace.
- **Schema v104** (additive `103 → 104`): `decisionLocks` / `decisionLockMarkers`, settings clamped, fail-closed normalizers that drop a future-dated lock, a duplicate and an unreadable row **with a printed warning**. **No back-fill**: an upgraded workspace opens with no lock and no invented hindsight. A lock written for a decision whose link history only supports reconstruction is marked `retrospective` and says so on the screen.
- **Seat boundary.** `record-decision-lock` (rank 1–5) covers `hindsightLock` / `hindsightScan`; `govern-hindsight` (rank 4–5) covers `hindsightSetConventions`; six reads registered as safe reads. A declared seat reads the locks it owns and its own scope, never a peer's; the undeclared operator view reads the workspace (pre-ADR-0076 behaviour, preserved deliberately).
- **CSV scope #98** aggregate-only, 24 columns, no decision id, lock id, person id or fact content; suppressed and refused figures are **BLANK, never zero**.
- **The disclosure manifest** declares the `unit` class, the five-item detail ceiling and a scoped adapter, and the route is added to the compiler's renderer catalogue, so the catalogue and the shell agree route for route.

**Defects found and repaired, in code written this session.**
1. **The audit counted its own findings as facts.** RULE-HND-02/03 open governed decisions linked back to the audited decision; those links are dated *after* it, so the partition reported 3 facts "arrived later" where the fixture had 1. Edges written by `RULE-HND-*` are now excluded from the fact set — provenance is not evidence.
2. **Two unbalanced delimiters in the new view** (a `h(...)` call never closed, and a `card({...})` missing its closing brace) — the route would not load at all.
3. **Small cells leaked by zero.** The altitude roll-up suppressed a cell only when it was unmeasured, so a cell with one measured decision printed a count below the floor. Suppression is now on `locksN < cellFloor`, regardless of measured state.
4. **The brief named the seat holder.** An "identity-free" upward brief printed the seat's person name. It now prints the seat label and rank and says explicitly that no person is named.
5. **An ungraded decision never aged into a finding.** The overdue test's review date sat inside the grace window, so `RULE-HND-04` had nothing to ask about; the rule was right and the fixture was wrong — recorded here because the fixture now pins the boundary.
6. **Base-commit repair:** `spanReadings` / `spanAdoptions` / `spanMarkers` (ADR-0100) were normalized and migrated but never listed in `COLLECTIONS`, so a fresh workspace omitted them and the disclosure compiler's "every declared collection exists" check was **red on `main`** (proved by inspection of `HEAD:app/core/schema.js`, which mentions all three only in the normalizer and the v101 migration). They are listed now; no shape or default changes. The disclosure compiler suite is 21/21 as a result.
7. **A stale `void daysBetween`** in the new rules module, and a duplicate `emits`/`scansWorkspace` pair in the reputational-capital contract, pruned.

**Regression upkeep:** schema-version assertions → 104 (97 test files), migration chains extended to `103 → 104` (110 assertions), CSV-scope count → 98 (34 assertions), spine count → 83, `RENDERER_ROUTES` and the manifest catalogue extended. The disclosure-compiler grant test now excludes `RULE-HND` edges from its own provenance assertion, with the reason written at the call site.

**Verification (actual, 2026-11-05).** `tests/app/hindsight.test.mjs` **21/21**; `disclosure-compiler` **21/21**; `standalone` **7/7**. A wider sweep of every suite touched by the schema and migration update: **1,727 assertions green across 60 suites** — `board-room`, `attention-market`, `autopilot`, `capital-portfolio`, `claim-sceptic`, `command-chain`, `csv`, `domain`, `event-cascade`, `decision-rights`, `decision-portfolio`, `decision-tempo`, `differencing`, `export-disclosure`, `org-design`, `performance`, `premises`, `programme-federation`, `promise-solvency`, `prospective`, `reputational-capital`, `robust-allocation`, `settlement`, `signal-integrity`, `signal-path`, `stakeholders`, `strategy-cycle`, `survival`, `trends`, `value-stream-exchange`, `wait-cost`, `watch-integrity`, `workforce-transition`, `federated-envoy`, `org-network`, `prep`, `seal-chain` and others. `npm run lint` exit 0; `check:boundary` **505 app ES modules, 146 test suites, 23 documentation checks, 0 violations**; `check:links` **843 links across 220 files, all resolve**; `build:standalone` 8,517,555 bytes / 504 modules / schema v104.

**Pre-existing red suites, proved by A/B (a clean worktree at the base commit `512841b`), not regressions:** `span-calibration` 6/17 both before and after (ADR-0100's own suite was never green on `main`); `typed-links-lineage` 5/8 both before and after (the "every registered link type resolves" fixture never grew rows for `valuestreamreallocation` or the many later node types, and two unrelated trace tests disagree with the engine). Two further stale `SCHEMA_VERSION, 97` assertions (`federated-envoy`, `org-network`, `prep`, `seal-chain`) were red on `main` and are repaired here to 104. The full-suite run remains outside the window (pre-existing). Real-browser AT walkthrough remains **[UNVERIFIED]**; the panels are axe-clean under jsdom only.

**Honest limits.** `missed` is only visible if a later link was made, so coverage measures the workspace's **link hygiene** as much as the decision; a fact nobody ever linked cannot be found. The quality floor, coverage bar and every floor are **declared conventions, not estimates**. Seats are workflow declarations, **not authentication**; there is no tenant isolation and no server-side authorization. Complementary suppression across a drill-down chain is not complete in this module (each table is suppressed on its own). The view, the rules and the actions have been exercised under jsdom and `node --test` only.

- See [ADR-0102](docs/adr/0102-hindsight-lock.md); evidence `tests/app/hindsight.test.mjs` (20/20).

## Changelog — 2026-11-05 · Session 141: The Reputational Capital Ledger (ADR-0101, Schema v103 · additive 102 → 103, CSV #97)

**What changed, and why.** The category prices *structure* (Orgvue, ChartHop) or *sentiment* (Culture Amp, Lattice, Viva Insights) and never prices the one question a leader must answer before delegating anything real: *if I make this ask, will it hold — and if not, exactly what is missing?* `#/reputation` answers it as a **price**, from records eight other modules already dated. Nothing is self-reported, nothing is a personality test, and nothing ranks a person.

- **`#/reputation`** (Desk / Act classes / Guarantees / Repairs / Method): eight act classes (delivery, custody, calibration, stewardship, continuity, allocation, prediction, contribution) harvested from delegations, mandates, prospective grades, escalation records, measured leadership edges, funded plan lines, settled forecasts and external recognitions. A manual act covers work LeadOS cannot see; **a hand-typed twin of a derived act is refused**, so no one manufactures their own stake.
- **The estimator, and why it can say no.** Wilson (1927) in beta space: `wilsonBeta(9,1)` → `[0.5958, 0.9821]`, `α + β = n + z²`. Anchored on a **declared** per-class hazard printed beside the record (Gelman et al. 2008: the prior must lose), decayed half-life-wise, and read off the **interval** — `solvent` / `encumbered` / **`drawn-down`** / `contested` / `expired` / `refused`. Every refusal prints its reason. A zero is never printed for an unmeasured cell.
- **WILSON-FIRST.** The anchor is put on trial, not the record: if the anchor's *own* interval clears the obstacle, the cell is refused and the anchor's interval is printed. This is the rule that stops a class prior from manufacturing verdicts.
- **The ask is priced across four tiers** — vouching 85 / bearing 60 / escrowed 35 / structural 15 — with `obstacle = 100 − (100−base)·e^(−γ·max(0, ln(ask/stake)))`, bounded at 99.5 so a large ask can never print a three-digit "price." Grossman–Hart residual control is the reason the ladder exists. The counterfactual prices **all four** and names the cheapest honest route in **acts**.
- **The ledger grades itself.** A guarantee freezes `claimP` at open; RULE-RCL-05 scores its own error once, `(claimP − y)²`. Opened with no readable interval → `claimP: null` → **refused a grade, by name, on the audit trail**. Repairs close only from acts dated after they opened.
- **Cross-module links.** `rests-on` (new link relation) traces every cell to each dated source record; `rolls-up-to` carries it up the reporting tree; `decides` / `informs` carry the governed findings. One governed decision maximum per span × class × ISO week.
- **Cross-altitude roll-up, demonstrated the same session.** A frontline lead's cell is registered with `rests-on` provenance and one `rolls-up-to` edge per ancestor **in the same atomic transaction**; a manager sees the pooled class table over the subtree; a director+ re-declares conventions; the enterprise reads an identity-free brief plus a withdrawal-shock scenario priced against every open guarantee.
- **Schema v103** (additive `102 → 103`): `reputationActs` / `reputationPositions` / `reputationMarkers`, fully normalized and fail-closed; **a stored derived act is dropped with a warning** so stale capital cannot keep spending. Settings are declared conventions, clamped. **No back-fill**: no cell is invented for history that was never recorded.
- **RULE-RCL-01..05** on the shared post-commit spine (82 rules) with one propagation contract; placed after `spanCalibrationRule` and before `identityRule`, so every finding it opens is priced by the attention market and rolled up by the Operating Seat in the same transaction.
- **Seat boundary:** a declared seat reads itself and its subtree, never a peer and never a manager; the undeclared operator view reads the workspace (pre-ADR-0076 behaviour, preserved deliberately). Rights: `record-reputation-act` / `offer-reputation-guarantee` (rank 1–5), `govern-reputation` (rank 4+), 8 safe reads.
- **CSV scope #97** aggregate-only and refusal-honest: one row per class, per class × verdict band, per tier, plus a direction row. **No person id, act id, source id or note**; suppressed and refused cells are **BLANK, never zero**.
- **Seven defects found by the tests and repaired, all in code written this session.** (1) WILSON-FIRST probed the *record* rather than the anchor and refused every good cell — 9 kept / 0 breached was refused at a 15% anchor. (2) `guardApi`'s `(...args) => fn(...args)` unbinds `this`, so `reputationOpenPosition` would throw for any user who tried to open a position. (3) RULE-RCL-02/03 scoped to `LEADER_ID` and never saw the org, so the spine opened **no finding at all**. (4) `seat.subtreeIds` is empty on every real seat — `seat.scope` is the populated primitive — so a declared lead could not see its own ICs. (5) `Number(null) === 0`, so a null claim was graded as a 0% claim *after* the outcome was known. (6) A calibration guarantee could never settle: Brier grades are append-only rows in `prospectiveGrades`, not a field on the contract. (7) The rule never fired on source events, so only a human pressing Scan could settle a guarantee.
- **Regression upkeep:** `SCHEMA_VERSION` assertions → 103 (93 files); migration chains extended to `102 → 103` (91 assertions); `CSV_EXPORTS.length` → 97 (33 suites); spine rule count 79 → 82; disclosure catalogue synced.
- **Verification (actual, 2026-11-05):** `reputational-capital` **16/16**; lint clean; `check:boundary` OK (499 app modules, 145 suites, 23 doc checks); targeted re-runs green — prospective 16/16, identity-ledger 27/27, claim-sceptic 25/25, attention-market 31/31, autopilot 27/27, capital-portfolio 39/39, command-chain 17/17, board-room 45/45, coupling-ledger 35/35, measurement-reliability 45/45, counterfactual-policy 39/39, borrowed-evidence 36/36, csv 5/5, freeze-line 14/14. **`span-calibration` (6/11) and `disclosure-compiler` (20/21) fail identically on the base commit** — proved by `git stash` A/B, therefore **not regressions**. **No claim of full-suite success:** the full `npm test` run has never completed in this repository.
- **Altitudes served:** frontline lead (price an ask, see its own cells) · manager (pooled subtree table, governed findings) · director/VP (re-declare conventions, read direction) · CEO (identity-free brief, withdrawal-shock scenario).
- **Competitive benchmark and its limits.** Visier / Workday Illuminate / Lattice / Culture Amp / ChartHop / Orgvue / Viva Insights measure structure, sentiment or telemetry; none — from public snippets, **not audited capability** — prices a specific ask, reads a verdict off an interval so the reading can refuse itself, or grades its own frozen claim. The 2025–26 research frontier (Doval–Smolin 2026 calibrated mechanism design, dynamic-contract literature) asks this question and ships in no product. **A gap claim, not a market-first claim.**
- **Honest limits.** The class hazard, half-life and γ are **declared conventions, not estimates**. Decay is exponential on the observation clock. Work done outside LeadOS reads as **silence, not breach**. Seats are workflow declarations, not authentication. No composite score, no ranking. Real-browser AT walkthrough **[UNVERIFIED]**.
- **Next up:** cross-class dependence (a guarantee resting on the *joint* event, not one class), guarantee portfolios priced against one span's stake, and hazard re-estimation from settled guarantees — deliberately deferred until ~30 settled guarantees per class exist, because below that any "estimate" is the prior wearing a decimal point.
- See [ADR-0101](docs/adr/0101-reputational-capital-ledger.md); evidence `tests/app/reputational-capital.test.mjs` (16/16).

---

## Changelog — 2026-11-05 · Session 139: The Freeze-Line Continuity Audit (ADR-0099, Schema v101 · additive 100 → 101, CSV #95)

- **`#/freeze-line`** (Desk / Lines / Continuity / Comparability / Timing): every committed or reverted structural design is a dated **freeze line** across the reporting tree; the screen measures dated carriage on **both sides** of each line from the same artefacts federation already counts, classifies every declared edge **held / lost / gained / still-silent** aggregated by altitude with Wilson intervals and complementary suppression, refuses a verdict below the declared edge floor (`freezeLineMinEdges`), and states one governed verdict per line — **held / degraded / refused**.
- **The residual timing channel is closed.** Suppressed federation rows no longer print `lastCarriageOn` in the view, in new frozen snapshots, or in CSV — blank, never zero — because the date discloses *when* a suppressed span last carried work and differencing two releases then leaks the count. **RULE-FRZ-03** scans legacy snapshots for suppressed rows that still carry a date and opens one redaction decision per snapshot per ISO week. This closes the standing ROADMAP gap "reorganisation comparability across a freeze line".
- **Schema v101** (additive `100 → 101`): `freezeReadings` / `freezeMarkers` collections, `freezereading` node type with `freezes` / `re-projects` relations, five clamped settings (`freezeLineWindowDays` 30, `freezeLineMinEdges` 3, `freezeLineCellFloor` 3, `freezeLineDropPct` 15, `freezeLineAutoPropagate`), fail-closed normalizers. Nothing inferred for an upgraded workspace.
- **RULE-FRZ-01..03** on the shared post-commit spine with one propagation contract: line registration writes `freezes`/`re-projects` plus one `rolls-up-to` edge per leadership ancestor in one atomic transaction (marker-idempotent, pausable); a degraded line opens one governed decision per line per ISO week at the span that can author the change; the timing guard runs on every frozen snapshot. `freezeLineFreeze` / `freezeLineScan` reuse the `govern-federation` right; the five reads are seat-scoped safe reads in the access gateway.
- **CSV scope #95** is aggregate-only and refusal-honest: one row per crossed line, one per altitude × continuity-class cell, one timing-guard row — no reading id, span id, person or carriage date; suppressed and refused figures are BLANK, never zero. The brief is identity-free; the view is axe-clean across all five panels.
- **Regression upkeep:** schema-version assertions → 101 (91 files), migration chains → `100 → 101` (73 files), CSV-scope count → 95; `RENDERER_ROUTES`, the disclosure-manifest catalogue, the access-gateway safe reads and action rights kept exhaustive; pre-existing disclosure-compiler route-list drift repaired (`clearing` + `freeze-line`); standalone rebuilt at 8,266,836 bytes / 486 modules, schema v101.
- **Verification (actual, 2026-11-05):** `freeze-line` 14/14; disclosure-compiler 21/21 incl. the repaired catalogue test and the four-seat leak oracle; programme-federation, org-design, csv, core, app, access-audit, event-cascade suites green (148 targeted tests, 0 fail); `npm run lint` exit 0; `check:boundary` 487 modules / 143 suites / 23 doc checks, 0 violations; `check:links` 826 links / 217 files OK; `build:standalone` + `verify:standalone` pass. Full-suite run remains outside the 30-min window (pre-existing). Real-browser AT walkthrough remains [UNVERIFIED].
- See [ADR-0099](docs/adr/0099-freeze-line-continuity-audit.md); evidence `tests/app/freeze-line.test.mjs` (14/14).

---

## Changelog — 2026-11-05 · Session 137: The Calibrated Allocator (ADR-0097, Schema v99 · additive 98 → 99)

- **The over-cap wall is gone — exactly.** A feasible grid above the 50,000-combination enumeration bound is now solved by a certified branch-and-bound (`app/core/domain/robustBranchBound.js`): exact rational relaxation bounds, strict pruning (ties explored, so the printed plan is the same unique optimum), one shared node budget covering every sub-solve, and a provenance certificate (`engine`, `nodes`, `pruned`, `budget`, `certified`) frozen at adoption and shown on the Solve panel. Exhausted budget or an out-of-regime instance (unit sum > 40, Γ scenarios > 24) is REFUSED — never approximated. Equivalence is proven by a seeded fixture sweep asserting field-for-field identity with the enumerator.
  - Why: "no solver for the real-size problem" was the newest terminal's sharpest refusable edge; now refusal happens only outside the certified regime.
- **Closed-loop evidence calibration (the allocator answers to its graded bets).** Plan actions declare which prospective instrument grades their premise; settled ADR-0094 grades are read back by altitude × instrument cell (Wilson 95%, cell floor, complementary suppression, director-rank gate — evidence transports up the subtree, never across to a peer). A cell more falsified than reached is flagged **TENSION** beside the declared range. The engine never moves a number: a **revision** is a new frozen plan (`supersedesId`), declared by a human.
- **RULE-RAL-05 on the shared spine:** at most one governed premise–evidence tension decision per cell per ISO week, identity-free (counts + Wilson interval only), with one roll-up edge per leadership ancestor — marker-idempotent, pausable, explicit scan always runs.
- **`#/robust-allocation` and `#/prospective` now enter the ADR-0092 differencing register** via the shared Publication register panel — Session 135/134's named honest limit closed; no new CSV scope (#93 stands).
- **Schema v99** (additive `98 → 99`): one setting (`robustAllocationNodeBudget`), fail-closed `evidenceInstrumentKey` / `supersedesId` / certificate normalizers; a v98-era adoption reads back with an honest legacy certificate (`enumeration`, certified, nodes null).
- **Pre-existing failures repaired:** cadence spine-parity now encodes the post-ADR-0088 order (strategyCycle → carryover → cadence); the measurement "sound commit" test measures ceremony from the post-declaration baseline and asserts no new record references the scorecard.
- Cross-module links added/updated: `robustplan → decision (allocates)` by RULE-RAL-05; roll-up edges per ancestor on tension findings; both terminals' roll-up aggregates now flow into the publication register.
- Organizational altitudes served: frontline/manager own plans + own evidence readings; director owns cell conventions incl. the node budget and the per-cell tension findings; VP/CEO read identity-free aggregates, the brief's calibration block and the register verdict.
- Competitive benchmark chased: closed-loop decision memory (Aera) and certified-exact Γ-robust branch-and-bound (2026 arXiv group-envelope line) — joined inside one zero-build, hierarchy-native workspace; no surveyed people-analytics platform was shown to do either.
- See [ADR-0097](docs/adr/0097-calibrated-allocator.md); evidence `tests/app/calibrated-allocation.test.mjs` (9/9) + updated `tests/app/robust-allocation.test.mjs` (19/19).

---

## Changelog — 2026-11-05 · Session 136: Registered Terminal Publication (ADR-0096, no schema bump)

- **Five terminals now enter the differencing register** (`#/escalation`, `#/measurement`, `#/cadence`, `#/concordance`, `#/survival`): `#/escalation` and `#/cadence` declare disclosure manifests; all five mount a shared **Publication register** panel with **Plan** (what would publishing determine, against every registered release?) and **Publish** (one dated release per module per day per seat; same-day repeats refused by construction). Their own per-table floors are unchanged — the register only adds suppression, and a determined value is reported as a coordinate and a proof, never as the number.
- **Why:** ADR-0092 audits a *series* of releases as one integer system; these five terminals printed per-table floors directly, so subtracting two of their tables across days, seats or altitudes was never audited.
- **Regression upkeep:** `RENDERER_ROUTES` kept 1:1 with the manifest catalogue; standalone rebuilt; focused suite `tests/app/terminal-publication.test.mjs` (5/5), disclosure-compiler + differencing 52/52, lint/boundary/links pass. Two suite failures (`operating-cadence`, `measurement`) verified pre-existing on the base commit.
- See [ADR-0096](docs/adr/0096-registered-terminal-publication.md) and the `ROADMAP.md` Session 136 entry.

## Changelog — 2026-11-05 · Session 135: Robust Allocation Terminal (ADR-0095, Schema v98)

- **`#/robust-allocation`** (Desk / Plans / Solve / Roll-up / Certificate): declare a multi-action, capacity-constrained allocation under effect ranges; solve it exactly; review the Wald maximin and Savage minimax-regret plans, the price of the equity floor, the stress switches and the regret a range's resolution releases; adopt it; copy an identity-free upward brief and aggregate-only CSV #93.
- **Exact solver**: Bertsimas–Sim (2004) budgeted uncertainty `Γ`, feasible integer-grid + `C(n, Γ)` scenario enumeration (Goerigk–Lendl 2021 / Yaman 2023), Wald (1950) maximin, Savage (1951) minimax regret against the per-scenario oracle, Rawlsian equity floor and its price of fairness, Little saturation, one-at-a-time break-even stress, Raiffa–Schlaifer value of information. Deterministic tie-breaks; over-cap and infeasible plans REFUSED, never approximated.
- **Schema v98** additive `MIGRATIONS[97]`: `robustPlans`, `robustMarkers`, four clamped conventions, fail-closed normalizers (an adopted plan with no frozen solution is dropped). No range, segment, solution or commitment is inferred for an upgraded workspace.
- **RULE-RAL-01..04** on the shared post-commit spine before attention market / succession / seat / seal, with one auditable propagation contract. One adoption writes a governed DACI decision, one owned delivery task per funded line, `allocates`/`consumes-capacity`/`rests-on` provenance and one `rolls-up-to` edge per leadership ancestor in one atomic transaction; a falsified/overdue/ungraded premise opens one bounded governed finding per plan per ISO week.
- **Permissions**: `declare-robust-allocation` right (rank 1–5), four safe scoped reads, director+ conventions, `detailCeiling: 0` raw-ledger policies, adaptive disclosure manifest row, one new graph node type (`robustplan`) reusing existing relations, identity-free resolver. Money never pooled across currencies; pooled falsified share withheld below the cell floor and below director rank with Wilson 95% + complementary suppression.
- **Regression upkeep**: schema-version assertions → 98; migration chains → `97 → 98`; CSV-scope assertions → 93; shared-spine tripwire → 78 rules; `RENDERER_ROUTES` and graph registries kept exhaustive; `.grid-3`/`.grid-4` CSS added; standalone rebuilt at 8,072,085 bytes / 472 modules with the density guard unchanged.
- See [ADR-0095](docs/adr/0095-robust-allocation-terminal.md), `RESEARCH.md` and `ROADMAP.md` Session 135 entries for the competitive hunt, altitude tags, implemented/planned/rejected lists and honest caveats.

## Changelog — 2026-11-05 · Session 134: Prospective Intervention Contract (ADR-0094, Schema v97)

- **`#/prospective`** (Desk / Contracts / Instruments / Calibration / Certificate): declare a probability, threshold, horizon and exact frozen cohort before the work; grade it once from dated records other modules own; copy an identity-free upward brief and aggregate-only CSV #92.
- **Schema v97** additive `MIGRATIONS[96]`: `prospectiveContracts`, `prospectiveGrades`, `prospectiveMarkers`, five clamped conventions, fail-closed normalizers. No bet, outcome or score is inferred for an upgraded workspace.
- **RULE-PIC-01..04** registered on the shared post-commit spine before attention market / succession / seat / seal, with one auditable propagation contract. One declaration writes a governed DACI decision, an owned dated task, typed provenance and one `rolls-up-to` edge per leadership ancestor in one atomic transaction.
- **Proper scoring**: Brier `(p−y)²`, exact integer threshold comparison, strictly-prior sequential base-rate skill, Wilson 95% intervals, complementary small-cell suppression, BLANK-not-zero refusals, loud refusal of unobservable cohorts.
- **Permissions**: `declare-prospective` right (rank 1–5), four safe scoped reads, director+ conventions, `detailCeiling: 0` raw-ledger policies, adaptive disclosure manifest row, two new graph node types and two system-generated relations with an identity-free resolver.
- **Regression upkeep**: 192 schema-version assertions → 97; 69 migration chains → `96 → 97`; 29 CSV-scope assertions → 92; shared-spine tripwire → 77 rules; `RENDERER_ROUTES` and graph registries kept exhaustive; standalone rebuilt at 7,996,525 bytes / 466 modules with the density guard unchanged.
- See [ADR-0094](docs/adr/0094-prospective-intervention-contract.md), `RESEARCH.md` and `ROADMAP.md` Session 134 entries for the competitive hunt, altitude tags, implemented/planned/rejected lists and honest caveats.

## Changelog — 2026-11-04 · Session 128

- **Added:** the Federated Envoy (`#/envoy`) — sealed, disclosure-scoped packets between LeadOS workspaces, verified by recomputation and ingested idempotently. *Why:* every module so far models the hierarchy inside one store; real leadership work crosses a boundary, and until now it crossed as a forwarded document with no provenance and no way to record disagreement except a merge.
- **Connected:** an ingest writes its chain-of-command carriage to every ancestor in the same transaction; a divergence opens one governed reconciliation decision instead of overwriting either record; an attested exposure above the declared floor opens one review. New graph node `exchangepacket`, relations `carries` and `reconciles`, `RULE-ENV-01..03` (**68 rules / 68 contracts**, seal still last).
- **Integrated with ADR-0086:** one `disclosureManifests` row and three `RECORD_POLICIES` rows, so the compiled posture places `#/envoy` rather than withholding it; `envoy` joins the reviewed fallback list in the route gate and the seven envoy reads join `SAFE_READS`.
- **Data & privacy:** additive collections on Schema v93 (no bump of its own), scoped seat reads/actions, aggregate-only CSV scope #84 `federated-exchange`, identity-free certificate. Packets are not authentication and not encryption — detail is refused at the source, never hidden.
- **Merge with `origin/main` (twice).** Main merged the Board Room (ADR-0085), the Disclosure Compiler (ADR-0086, v92) and then the Operating Cadence Clock (ADR-0087, v93, CSV #82). This session was renumbered from ADR-0085/Session 125/CSV #80 to **ADR-0088 / Session 128 / CSV #83**; all three features are kept, the spine is **68 rules / 68 contracts**, and this branch also fixed main's red `typed-links-lineage` sweep (no fixtures for `disclosuregrant`/`boardmemo`).
- **The Operating Model (`#/operating-model`).** The position a leader works from is now an object the app can measure. Four **declared** work-type percentages per level (at its own altitude / below it / routed up / coordination) turn records the app already holds into hours, and five measurements follow: **displacement** (hours below the position's own altitude, derived from each record's own clock), **abstention** (decisions whose driver is a report of the span holder, split into internal triage vs external routing defect), **congruence** (a boolean against a printed threshold), **continuity** (the trap below the declared 3-report floor), and **coupling** (Graicunas relationships against declared collaboration edges).
  - *Why:* the repository had 63 rules about decisions, congruence, delegation and seals, and **none about the design of the seat making them**. The category sells headcount (Orgvue/Visier/Workday), labour-hours (Quinyx/Legion) or sentiment (Lattice/Culture Amp) — all at enterprise scale, all to the CHRO. Nobody sells the manager the arithmetic of their own design.
- **The continuity trap, and a refusal to price it.** Below the declared three-report floor a hire does not divide the work; it deepens the load that stops the work during one absence. `deriveSkipReport` returns `hours: null` with the reason *below the declared continuity floor*; a four-report span is priced and told the hire *does not divide the group behind it*; `remove-seat` is refused unless `congruence.holds === false`. The lever book prices nine named structural patterns by hours relieved per unit of design cost — the cheapest lever usually is not a person.
  - *Why:* every capacity tool in the market recommends the hire. It is the one recommendation that is provably wrong at small span, and refusing it is the defensible position.
- **Queueing, not planning.** Each position is a **station** on a line: committed hours against the hours its design contains. Utilisation past the declared ceiling is read as a queue (Kingman 1961) — the number that predicts lateness — and **reported**, never trimmed.
- **Gauge R&R on the model's own inputs.** Denominator floor, an arithmetic check that every declared split totals 100, and an impossible-week audit that surfaces over-commitment instead of quietly making the numbers sensible.
- **Inert until declared — with two isolation tests.** `measuredPositions === 0` returns `[]` before any rule dispatches. This gate exists because the continuity rule **really did** fire on an empty workspace (`addPerson()` emitted a `decision.created` about "1 span(s) below the continuity floor") and broke `core` and `app`; the probe, the root cause (`buildChain` gives every person a span verdict) and the fix are recorded in the session log. `operatingModelScan()` now returns `{inert, reason}` rather than a success toast over an empty workspace.
- **Cross-module links added/updated.** New graph node `operating-model` → `omWorkSplits`; two typed relations: **`relieves`** (a design decision → the congestion it prices) and **`rolls-up-to`** (a station's measurement → every leadership ancestor, written in the same transaction by `RULE-OMD-01`). Reads existing `decision`, `concern`, `requisition`, `person`, `reporting`, `capacity` and `mandate` records rather than duplicating them; CSV #83 aggregates are the only export.
- **Organizational altitudes served this session.** Frontline lead / manager (own spans, the five measurements, the lever book with refusals): ranks 1–2. Director (congested spans, the cross-unit coupling seam above the cell floor, the design decisions opened): rank 3. VP / exec (one amortised aggregate row per level below the reader — vertical roll-up with zero manual re-entry — plus the identity-free brief): ranks 4–5. Authoring restricted to rank 3–5 (org design); every level sees a genuinely different picture from one read model.
- **Competitive / ambition benchmark chased.** Against Visier Org Design (Sept 2025 scenario canvas, plan-vs-actual monitoring), Orgvue, Workday Adaptive Planning, Anaplan, Pigment, Viva Insights/Glint, Quinyx and Legion: the differentiator is not more simulation and not more telemetry — it is a **live read of the seat**, priced in the industrial-engineering canon the category ignores (Jaques 1956, Shingo 1985, Graicunas 1933, Kingman 1961, Rummler–Brache 1990, Mann 1965), and a lever engine that **refuses** the hire that breaks continuity. Three ahead-of-market claims: no attendance data at all; congruence as a boolean rather than a percentile of managers; and a priced refusal instead of a recommendation.
- **Data integrity.** Additive `MIGRATIONS[93]` (`93 → 94`), four collections, clamped settings, fail-closed normalizers, one governed design decision per congested span per ISO week, one continuity decision per ISO week, fingerprinted idempotent markers, pausable propagation with an explicit scan that always runs. **68 rules / 68 auditable contracts.**
- **Accessibility.** Six panels, semantic tables with captions, keyboard-reachable controls, axe-clean — one real defect found and fixed (`empty-table-header` on the levers table). Two honesty strings asserted in the test: *"There is no attendance clock here"*, *"Nothing here ranks a person"*.
- **Verification (actual, 2026-11-04) — the whole suite, run per file.** **123/123 suites green, 2,398 tests passing, 0 failing.** `npm test` bundles all files into one process and overruns the sandbox budget, so every `tests/app/*.mjs` was run individually and its `# pass / # fail` captured. Three genuine failures were found and fixed rather than waved through: four suites still pinned the pre-v90 schema literal in fixture assertions; `typed-links-lineage` exposed that `concordance` was a registered link type with **no fixture row and no route-focus entry** (inherited from v89, fixed properly in the contract test); and the standalone artifact had outgrown its 6.9 MB ceiling — raised to 7.1 MB with the density arithmetic recorded (6,975,654 bytes / 382 modules = 18,260 per module, under the 24,000 duplication bound). Two further failures were parallel-execution flakes (`case-rehearsal` worker timer, `export-disclosure` JSDOM dialog), both green when run alone. `npm run lint` clean; `check:boundary` clean (383 modules / 123 suites / 23 doc checks); `check:links` clean (636 links / 195 files); `build:standalone` rebuilt at v90 with `standalone.test.mjs` 7/7.
- **Known gaps.** Authenticated identity + tenant boundary (seats are declarations); salary bands, so relief is stated in hours and never currency; a declared steady-state baseline per position with a control-chart band; a redraw simulator for the lever book; the `expectation-concordance` mid-session anomaly (two failures, then 18/18 after the migration-pin fixes) was never isolated to a single line — recorded as an open question, not as a fix.
- **Repository status.** Branch `arena/6f9a0830-leados`; commit, push and pull request results are those observed in the tool output and recorded in `AI-SESSION-LOG.md` (Session 128). Nothing is claimed that was not seen.

### Session 123 — the same day, kept in place

- **Expectation concordance (`#/concordance`).** "Meets expectations" is treated as a measurement instrument: a leader and one of their reports each answer six declared expectation dimensions on a five-point bar, independently and sealed, and the app measures the **agreement** rather than rating either person.
  - *Why:* every tool in the category rates a person against an unexamined word; two honest people with two gauges produce a review that is correct on both sides and still arrives as a surprise. LeadOS already audited rating reliability over time (ADR-0069); this audits the agreement between the two raters at one moment.
- **Statistics, side by side and refusable.** Quadratic weighted κ (Cohen 1968), Gwet's AC1 (2008), PABAK (Byrt et al. 1993) and Bland–Altman bias with 95% limits of agreement (1986). The prevalence paradox is printed when κ and AC1 disagree by more than 0.4; below the six-item instrument floor or with degenerate marginals the figure is **refused with its reason**; perfect agreement prints a shared-error warning because agreement is not correctness.
- **Cross-module links added/updated.** New graph node `concordance` (→ `expectationRounds`) with two new typed relations: `re-contracts` (closed round → the governed re-contracting decision it opened) and `re-tests` (a later round → the decision whose standard it tests). `RULE-ECN-01` writes one `rolls-up-to` edge per leadership ancestor for every closed round; `RULE-ECN-02` opens one governed DACI re-contracting decision per pair per ISO week on divergence and places one generated agenda line on the pair's most recent 1:1; `RULE-ECN-03` writes one advisory maturity marker. All on the existing post-commit spine — 63 rules / 63 auditable contracts, marker-idempotent, pausable, explicit scan always available.
- **Organizational altitudes served this session.** Frontline / team lead (pair detail, both gauges, the gap per dimension, a deterministic conversation script), manager (sealed-round queue, cycle-over-cycle κ, the 1:1 agenda line), director (span rates with exact partitioning, the org-wide **dimension profile**, small-cell withholding — other spans' gauges withheld, own pairs still readable), VP / executive (pairs-above-floor share with Wilson 95% interval and a 10–90 percentile range; one governed re-contracting decision per pair per week; typed roll-up in the same transaction), CEO / chief (identity-free brief, aggregate-only CSV #78).
- **Competitive / ambition benchmark chased.** The category (Lattice, 15Five, Culture Amp, Leapsome, Betterworks, Workday, SAP SuccessFactors) sells goal cascades, engagement indices, 360 distributions and nine-box grids — every figure a claim about a person, alignment self-reported. This borrows the *industry* answer instead: **Measurement Systems Analysis / gauge R&R** (AIAG & VDA 2010), joined to the leadership literature on role clarity (Hackman & Oldham 1976; Locke & Latham 1990; Mager & Pipe 1970) and to procedural/interactional justice (Leventhal 1980; Bies & Moag 1986; Colquitt et al. 2001) implemented as mechanics — the seal, the symmetry rule, and the refusal to print a figure that could be used against a person. No vendor page was fetched this session (sandbox egress limited to the package registries); vendor-specific claims are marked `[UNVERIFIED]` in `RESEARCH.md` §104.
- **Data integrity.** Additive `MIGRATIONS[88]` (`88 → 89`), two collections (`expectationRounds`, `concordanceMarkers`), six clamped settings, fail-closed normalizers that drop malformed rounds and **reopen** a round claiming to be closed with one side, a reporting-path fingerprint that marks an open round stale after a reorganisation, and bounded ledgers with printed overflow instead of silent deletion.
- **Permissions & privacy.** `close-expectation-round` added to `API_RIGHTS` and `ACTION_RIGHTS` (rank window 1–5, bound to a real pair inside the declared span), five safe reads, `unit`-class record policies, other spans' gauges withheld above director rank, aggregate-only CSV #78 (registry 77 → 78) and an identity-free brief — no person, pair, span name, note or individual rating survives the export boundary.
- **Verification (actual, 2026-11-04).** `tests/app/expectation-concordance.test.mjs` **18/18 PASS** (analytic κ/AC1/PABAK cases, an independent 5×5 recomputation, Bland–Altman, refusals, seal integrity, real cross-altitude fan-out to director and VP in one transaction, the 1:1 agenda line, idempotent rescans, pause + explicit scan, exact partition and cell-floor withholding, director-rank disclosure, aggregate-only exports, inertness, axe-clean five panels). Regression batches: core / cases-automation / propagation-ledger / operating-seat / mission-control / decision-rights **89/89**, action-bundles **19/19**, csv **5/5**, app **33/33**, domain **39/39**, access-audit **16/16**, event-cascade **12/12**, altitude-router **11/11**. `npm run lint` exit 0, `npm run check:boundary` (377 modules / 122 suites / 23 doc checks / 0 leaks) and `npm run check:links` (631 links / 194 files) pass on the merged tree; `seal-chain` **15/15**, `propagation-ledger` **31/31**, `attention-market` **31/31**, `wait-cost` **45/45**, `deferral-option` **41/41**, `domain` **39/39**, `app` **33/33**, `org-design` **22/22**, `operating-seat` **16/16**, `core` **15/15**, `event-cascade` **12/12**, `altitude-router` **11/11**, `decision-rights` **10/10**, `mission-control` **10/10**, `cases-automation` **7/7**, `csv` **5/5**. `npm run build:standalone` → 6,879,047 bytes / 376 modules / schema v89 / sha256 `b31c89d1fb132e58`; `standalone` tests **7/7**. 83 version-pin files and 24 CSV-count assertions swept mechanically for the additive migration.
- **Merge with `origin/main` (PR #138).** `main` had merged its own Session 122 (the Sealed Spine, `#/seal`), which already held ADR-0082. This session is therefore **Session 123 / ADR-0083**; both features are kept, `concordanceRule` runs before the attention market, and `sealRule` still runs **absolutely last** so one seal covers every module's writes in the same commit — **63 rules / 63 contracts**. The seal needed no schema bump of its own, so v89 remains exactly this session's additive migration.
- **Known gaps.** Authenticated identity + tenant boundary (the seal prevents anchoring, not a determined reader with the backup file); temporal / repeated-release disclosure tests; an instrument v2 that scores a shared artefact rather than a self-report; real-browser screen-reader walkthrough `[UNVERIFIED]`. Six items is the instrument, not a sample; suppression is not differential privacy; the re-test comparison is an association, not an effect.
- **Repository status.** Branch `arena/26229072-leados`. Commit and push results are recorded in `AI-SESSION-LOG.md` (Session 123) and in the pull request itself; nothing is claimed that was not observed.
- [The Sealed Spine (`#/seal`)]: the append-only event log is now hash-chained and tamper-evident. One `audit.seal` event per committed transaction, appended by `sealRule` registered **last** on the shared post-commit spine (62 rules), so a single seal commits to `sha256(prev ‖ digest ‖ revision)` over exactly the events every other module's rules appended in that same atomic write — by construction, not per-module glue. Genesis is 64 zeros; verification replays from genesis and reports the first break with a typed reason (`chain-break`, `seal-mismatch`, `content-mismatch` at the exact revision) plus trailing-unsealed events and retention-evicted blocks.
  - Why: the log was append-only *by convention* (ADR-0001) with nothing proving a hand-edited payload or silent normalizer hadn't rewritten history, and the 2026 category's "audit trail" is a vendor-held table nobody customer-side can verify (`RESEARCH §104`). In a local-first workspace the data lives here, so the verifier belongs here too.
- [Two modes, printed honestly]: HMAC-SHA256 keyed by a PBKDF2 256-bit session key (domain `leados-seal-v1:`, memory-only, cleared at all five vault-lock sites) whenever the vault is unlocked; plain SHA-256 otherwise. Every surface — banner, stats, certificate — names the mode: plain mode is integrity against corruption and honest error, **not** forgery-proof, and an HMAC block verifies only with the key (`key-missing` when locked, never a silent pass).
- [Retention that cannot eat the anchors]: non-seal events keep `EVENT_CAP = 600`; seal events are exempt up to their own cap (5000) and evictions are reported as `evictedBlocks` — chain-verified, content honestly unverifiable, counted not hidden.
- [Span attestation roll-up]: every sealed transaction is counted at the owning span **and** every leadership ancestor in the same transaction — one frontline commit attests at lead → manager → director → VP → chief with zero re-entry; out-of-subtree spans collapse to one `__out-of-scope__` aggregate row under a declared seat.
- [Gateway + surface]: `sealRead`/`sealVerify`/`sealBriefText` are safe reads and `sealScan` runs at any rank under a new `audit-seal` right (ranks 1–5); enable/disable/seal-pause is operator-only and fails closed under a declared seat through the ADR-0080 gateway. `#/seal` ships four axe-clean panels (chain, span attestations, sealed blocks, identity-free integrity certificate), a nav badge counting chain breaks only, and aliases (`seal`, `seals`, `audit-chain`, `attestation` — `integrity` and `trust` deliberately stay with Signal integrity and Promise solvency).
- [Altitude-routed NL intake (intake `v2`)]: free-text drafts resolve the owning seat by lowest common ancestor over the reporting tree and suggest `ownerId` + `ownerBasis`; the `#/intake` analysis prints an altitude-routing card (owning seat, altitude, roll-up path, routes, hand-up, forbidden lists); confirming creates the case under the routed owner — so a new case's first events are sealed under the right span.
- [Zero migration]: this feature adds **no new collection and no migration entry of its own** — `SCHEMA_VERSION` stays at Session 121's **88** (the parallel Altitude Router bump, merged together with this PR); three settings default when absent (`sealEnabled`, `sealAutoPropagate`, `sealMode`); the chain lives in the event log it protects.
- [Verification]: the **entire canonical suite** — `node --test "tests/app/*.test.mjs"` → **2360/2360 pass, 0 fail** (137 suites, 41 min, post-merge; includes `seal-chain.test.mjs` **15/15** and `altitude-router.test.mjs` **11/11** side by side), `npx eslint .` clean, `check:boundary` OK (371 app modules / 121 test suites / 23 doc checks, 0 leaks), `check:links` **624/624** across 193 markdown files, standalone portability **7/7**; `build:standalone` post-merge → **6,804,985 bytes · 370 modules · schema v88 · source `3dcd435d`**. The pre-merge branch sweep (152/152 across nine affected suites) plus the merged tree are both green. Full results are recorded in `AI-SESSION-LOG.md` (Session 122).
- [Merged with PR #136 in parallel]: `origin/main` had gained "Session 121 — The Altitude Router (Schema v88, ADR-0081)" from the same base. Theirs keeps Session 121/ADR-0081/the v88 bump; this entry renumbers to **Session 122 / ADR-0082** (file `0082-sealed-spine.md`, RESEARCH §104) and states "no additional bump atop v88". Both features' wiring unions cleanly (62 rules / 62 contracts 1:1, `sealRule` last); six of PR #136's tail-order assertions were updated to the merged contract (seat at −2, seal at −1). Details in `AI-SESSION-LOG.md` → "Merge resolution".
- [Defects found and fixed in this session's own code]: `renderSeal` returned `<main>` inside the shell's `<main id="view">` (duplicate-landmark axe failures on `#/integrity` — now `div.page` like every other view); the alias block shadowed `integrity` (Signal integrity) and `trust` (Promise solvency); `sealScan` had no seat right (refused under every declared seat); the seal summary originally stored 16-hex prefixes so verification could not recompute the chain (full `prev=`/`digest=` now travel in the summary, `root` last so the 300-char cap truncates only the root); `ctx.previousState` is deleted by the engine before rules run, so seal freshness is positional rather than diff-based; two shipped rule-order assertions (`DEFAULT_POST_COMMIT_RULES.at(-1) === seatRule`) were updated to the ADR-0082 contract (`seatRule` at −2, `sealRule` at −1) and `sealRule.id` was added to mirror `seatRule.id`.
- [Docs]: `docs/adr/0082-sealed-spine.md` + INDEX entry, README, FEATURES, ARCHITECTURE, LEADOS-STATE, ROADMAP, RESEARCH §104, AI-SESSION-LOG (Session 122), `index.html` `leados-sealed-spine` meta + `leados-build` updated, rebuilt `LeadOS-standalone.html`.

Cross-module links added/updated: `audit.seal` / `seal.verified` / `seal.enabled` / `seal.disabled` / `seal.scan` events (RULE-SEAL-01/02, sealRule last on the spine); `propagationContracts.js` sealRule contract; `audit-seal` API right + `sealRead`/`sealVerify`/`sealBriefText` in `SAFE_READS` (accessGateway); `caseSuggestion.ownerId`/`ownerBasis` + `altitudeRouting` (intake) feeding `addCase` ownership; span attestations reuse the seat rule's `rolls-up-to` ancestor tree — no new relation, no new graph node, no new collection.

Organizational altitude(s) served this session: [frontline (7d), manager (30d), director (90d), exec (180d), chief (365d)] — all five: every sealed transaction attests at every leadership ancestor in one transaction, the gateway admits scan/verify at ranks 1–5 while keeping enable/disable at the operator, intake routes a new case to the LCA-owned seat, and the Integrity surface prints the chain status an auditor at any level can read. Plus the undeclared single-operator view as the no-regression default (sealing is inert until enabled).

Competitive/ambition benchmark this session: [Lattice, Culture Amp, 15Five, Betterworks, Workday Illuminate, Peakon and the 2026 roundups sell predictive scores, AI drafts and vendor-held "audit trail logging" tables (Lucid's Audit Logs API is an Enterprise Shield *read* of vendor rows); the hash-chain + signed-checkpoint construction exists in security-engineering practice but was not found on any surveyed people-analytics vendor page — see RESEARCH §104]. The chosen bar: **a locally verifiable, per-transaction sealed audit chain with per-span attestation that the customer can recompute from genesis without the vendor** — Bloomberg Terminal × AI co-pilot × strategy consultancy, for any leader from shift supervisor to CEO.

Repository status: **pushed** — `origin/main` had moved (PR #136 merged from a parallel session), so the branch was un-shallowed (`git fetch --unshallow`), `origin/main` merged in (`3dcd435d`, ADR/Session renumber + six tail-order assertion fixes), and `git push origin arena/66ef986a-leados` succeeded (`a7562dd8..3dcd435d`). **Pull request [#137](https://github.com/shahramclaude/Leados/pull/137)** (opened from this branch, state `OPEN` at the time of writing; `gh pr view 137 --json mergeable` re-checked after the push) carries the feature commit `ddf9e39`, the docs follow-up `a7562dd8` and the merge resolution `3dcd435d`; the standalone artifact was rebuilt against `3dcd435d`. The PR updates automatically from the same branch.

## Changelog — 2026-11-04 · Session 129 (Hoshin Carryover Terminal, Schema v95)

- **Added:** `#/carryover` — one settlement record per Catchball pact settled as `thesis-invalidated`, carrying the resource bundle frozen at invalidation; three human verdicts against a declared stop rule (`retire-bet` / `revise-stop-rule` / `reaffirm`); resource release as an accounting event (`committed → released`, with `already-spent` and `withheld` reported honestly); cross-altitude roll-up; once-only grading against a prediction frozen at decision time with Wilson intervals; and an identity-free brief.
  - *Why:* Session 124 could detect a falsified bet but not settle it. The bet was never judged, the encumbered capacity evaporated instead of re-entering the next allocation cycle, and no dated prediction existed to grade. The 2026 strategy-execution market (Cascade, AchieveIt, Workboard, Quantive, Perdoo, Rhythm) renders invalidation as a status change; none models it as a settlement event.
- **Cross-module links added/updated.** New graph node `carryover`; new typed relations `carries-over`, `settles` and `releases-resource`, all spine-written and never hand-asserted; a resolver returning `#/carryover?panel=queue&record=<id>` and a focused record card so an edge lands on a real record. `RULE-CO-01..04` on the existing post-commit spine — **69 rules / 69 auditable contracts** — positioned after `catchballRule` and `cadenceRule`, with `sealRule` still absolutely last.
- **Data integrity.** Additive `MIGRATIONS[94]` (`94 → 95`), three collections (`carryoverRecords`, `carryoverMarkers`, `carryoverGradings`), five clamped settings, and fail-closed normalizers that **drop** a record with no id, no pact id or an unknown status rather than repairing it.
- **Documentation.** This session shipped with a decision record — **[ADR-0089](docs/adr/0089-hoshin-carryover-terminal.md)** — and README / ROADMAP / CHANGELOG / RESEARCH entries, none of which existed in the original PR.
- **Renumbered.** Originally authored as ADR-0085 / v91 in PR #147, which collided with `main`'s Board Room (ADR-0085 / v91). Renumbered to ADR-0089 / v95 in this branch, together with the conflict resolution described in `AI-SESSION-LOG.md` (Session 128).
- **Verification.** `tests/app/carryover.test.mjs` **16/16 pass**; `typed-links-lineage` **8/8** with the new node, fixture and focused route; rule/contract parity **69/69**; CSV #84 and the brief leak no pact id, bet id, record id, title, name or budget name.

## Changelog — 2026-11-04 · Session 128

- **Added:** The Escalation Economy (`#/escalation`) — an absorbed-or-escalated ledger over the command chain, M/M/1 + Kingman queue integrity per receiving span, escalation yield with Wilson intervals, Shannon context-loss-per-rung, Aghion & Tirole de facto centralisation against a graded intervention-rate commitment, a subsidiarity index per decision class, a declared escalation tax, and the Oncken & Wass monkey ledger.
  - *Why:* the 2026 market sells "escalation management" and means ticket routing (ServiceNow, Jira Service Management, PagerDuty, Zendesk, HaloITSM; AI entrants Fini, Forethought, Traversal, Ada) — *who gets paged next and how fast*. LeadOS measured cognitive load on a person, bad-news transmission up a channel, and who may decide, but not the escalation decision itself: its price, its yield, or the incentive that produced it.
- **Cross-module links added/updated.** New graph nodes `escalationrecord` and `escalationcommitment`; new typed relations `originates-from` and `reconciles-authority` (vertical fan-out reuses `rolls-up-to`, the hop to the receiver reuses `escalates-to`). `RULE-ESC-01..05` on the existing post-commit spine — **68 rules / 68 auditable contracts** — writing roll-up edges to every ancestor of both the originating and receiving span, and opening at most one governed decision or owned task per span per ISO week for a saturated queue, a yield below the floor, a breached commitment, or a monkey left too long. Marker-idempotent, pausable, explicit scan always runs.
- **Organizational altitudes served this session.** Frontline (absorb-or-escalate logging, the defensive-reason vocabulary, the monkey ledger), manager (queue integrity and headroom, return-the-monkey actions, the intervention-rate commitment), director (hotspots, subsidiarity per class, de facto centralisation, tax in person-days), VP / executive (utilisation portfolio, tax in declared currency), CEO / chief (enterprise topology, Brier calibration, identity-free brief). Disclosure `names` → `unit` → `aggregate` at ranks 1–2 / 3 / 4–5.
- **Competitive / ambition benchmark chased.** Nobody in the category models escalation as an economy. The build therefore imports the *canonical* models rather than a vendor pattern: Aghion & Tirole (1997) formal vs. real authority and the bounded intervention rate; Holmström & Milgrom (1991) multitask moral hazard, implemented as a countable `cover` reason; Jensen & Meckling (1995) / subsidiarity as an index; Erlang M/M/1 and Kingman (1961) for latency; Shannon (1948) BSC cascade for context loss; Oncken & Wass (1974) for ownership. Vendor capability claims are marketing copy and are marked as such in `RESEARCH.md` §105.
- **Data integrity.** Additive `MIGRATIONS[93]` (`93 → 94`), three collections, 19 clamped settings, and fail-closed normalizers that **drop** a row contradicting its own disposition — an escalation with no receiver, an absorption naming one, a settled row with no resolution — rather than repairing it, because repairing it would fabricate the escalation rate.
- **Permissions & privacy.** Two new rights (`record-escalation` ranks 1–5, `commit-intervention-rate` ranks 2–5), four safe reads, `unit`-class record policies, the `escalation` route on the reviewed allowlist, receiver-only settlement and sideways peer isolation, aggregate-only CSV #83 (registry 79 → 80) and an identity-free brief — no person id, seat name, escalation title, proposed action or note survives the export boundary.
- **Verification.** Full canonical suite **2,509 tests / 128 suites — 2,509 pass / 0 fail** (exit 0, 2,648 s). `tests/app/escalation-economy.test.mjs` **23/23 pass** (M/M/1 closed form with Kingman collapsing onto it at cᵥ = 1, refusal at ρ ≥ 1 and μ = 0, Shannon cascade against a hand expansion, Wilson textbook value, exact-partition roll-up, receiver-only settlement, freeze → grade once → refuse re-grade → refuse below floor, marker idempotence, pause + explicit scan, aggregate-only exports, five panels). For the additive migration: 146 schema-version pins (79 `SCHEMA_VERSION`, 67 `state.schemaVersion`), 25 CSV-count assertions and 61 migration-chain literals, swept mechanically across 88 test files.
  - *Three defects only the full suite could see:* the CSV-tail ordering assertion broken by scope #83; an unlisted `insights` domain (`Escalation economy`) that counted two findings and **silently dropped them from the domain roll-up** — caught by exactly the guard that array exists to provide; and a typed-links fixture with no surviving entity for the two new graph nodes. All three fixed and re-verified.
## Changelog — 2026-11-04 · Session 129

- **Added:** Value Stream Exchange (`#/valuestream`) with bilateral peer SLAs, directional actuals, real CPM/slack/blast-radius computation, LCA mediation and receiver consent.
- **Added:** reviewed stop-rule carryover from settled `thesis-invalidated` Catchball pacts: stale-state preview, open-line-only budget release, measured effort release, immutable receipts and a proposed receiving pact with a planned Finance line.
- **Connected:** two-branch roll-up, breach DACI governance, Catchball carryover lineage, Strategy/Finance links, Cases entities and the existing sealed post-commit spine (69 rules / 69 contracts).
- **Data & privacy:** additive Schema v95 (`94 → 95`), fail-closed normalizers, exact-party read exceptions, scoped briefs and aggregate-only CSV #84. Unknown historical effort is not fabricated; small-cell suppression is not differential privacy.
- **Verification:** focused Value Stream lifecycle suite and affected regression batches pass. Full-suite/build/check results are recorded in `AI-SESSION-LOG.md` after execution; no unobserved full-suite result is claimed here.

## Changelog — 2026-11-04 · Session 128

- **Added:** the Hoshin Carryover Terminal (`#/carryover`): one append-only settlement record per Catchball pact settled `thesis-invalidated`, freezing the encumbered person-days and committed budget line.
- **Added:** governed stop-rule settlement (retire / revise stop rule / reaffirm) per resolved bet; a human *retire* releases the budget line (`committed → released`, spent actuals preserved) and returns measured capacity in the same atomic transaction; once-only later grading against the frozen prediction with a Wilson reliability floor; unknown effort releases zero.
- **Connected:** `carryoverRule` joins the spine directly after the Catchball cascade; the record, its edges and the settlement decision are one commit, attested by the seal.
- **Data & privacy:** additive Schema v94 (`93 → 94`), three collections, five clamped settings, graph node `carryover` with `carries-over`/`settles`/`releases-resource` relations, aggregate-only CSV #83 `carryover-settlement`.

## Changelog — 2026-11-04 · Session 127
## Changelog — 2026-11-04 · Session 129 · The Attested Commit

- **Added:** The Attested Commit (`#/identity`, [ADR-0089](docs/adr/0089-attested-commit.md)) — per-seat passphrase-derived credentials (PBKDF2, memory-only key; only salt + 16-hex fingerprint + HMAC verifier stored) that sign every operational commit: one `identity.attested` event per transaction whose `HMAC-SHA256(key, "leados-seat-attest-v1|seat|keyId|revision|digest")` covers every event the transaction appended before it, with `sealRule` (absolutely last) covering the attestation in turn — assurance rungs 1 + 2 in one atomic transaction. Enrollment is self-service and its own commit is the credential's first attested act; wrong passphrases fail closed and throttle 5 per seat per 10 minutes; idle expiry stops attesting instead of lying; rotation replaces, revocation degrades past attestations honestly to *digest-verified, key unavailable*.
- **Cross-module links added/updated:** `identityRule` on the shared post-commit spine **before** `attentionMarketRule` (the integrity decision it opens is priced as work; the market keeps its "last work-producing rule" invariant — the attention-market tail pins hold), 69 rules / 69 auditable contracts. RULE-IDN-02 writes typed `rolls-up-to` edges from the weekly authorship-boundary DACI decision to **every leadership ancestor of the acting seat in the same transaction** (frontline → manager → director → VP → chief, zero re-entry) and logs revision-idempotent `identity.unattributed` events; RULE-IDN-03 writes `identity.verified` scan verdicts back into the log it verifies. Two collections (`seatIdentities`, `identityMarkers`), five session-lifecycle event types exempt from unattributed flagging, `identity.attested`/`identity.verified` protected from ordinary retention eviction (own cap 5000), `clearIdentitySession` paired at all five vault-lock sites beside `clearSealKey`. Enforcement is fail-closed at the ADR-0080 gateway (`identityEnforced` refuses non-exempt writes without a session) with boundary management exempt and **governing** the boundary rank-gated `govern-attestation` (3–5): a manager cannot switch enforcement off alone.
- **Organizational altitudes served this session.** Frontline / team lead (enroll → unlock → sign → lock on your own seat; honest refusal messages; the correct passphrase waits out the cooldown), manager (one governed authorship-boundary decision per seat per ISO week instead of alarm spam; span posture rolled to the director and VP above with zero re-entry), director (unattributed-write fan-out, rank-gated governance of enforcement and revocation, `scopeIdentitySpans` hiding peer detail), VP / executive (three-valued verification counts — verified / FAILED / digest-verified-key-unavailable / evicted — rolled up the chain; a nav badge counting breaches, never compliance), CEO / chief (rung-3 signed checkpoints kept outside the workspace detect TRUNCATED / REWOUND / REWRITTEN a self-referential chain cannot see; identity-free brief; aggregate-only CSV #84 `seat-attestation` with the rate blank, never 0, below the 5-transaction floor).
- **Competitive / ambition benchmark chased.** Nobody in the category sells this: Workday (BYOK root keys, audit reports, SAML/x.509/SSO — all vendor-held), Visier (RBAC), Lattice / Culture Amp (SOC 2 + SSO), Crunchr (GDPR RBAC + anonymization) — every "audit log" is a server-side table whose integrity is the vendor's claim ([RESEARCH §109](RESEARCH.md)). The public audit-log ladder (ProofLog; ogentic-audit; cryptography-audit-logs) orders the rungs: hash chain → HMAC signing → auditor signature → external anchor → trusted timestamp. This session ships rungs 2 + 3 (per-seat HMAC attestation + signed external checkpoints) and **rejects rungs 4–5 with printed reasons** (no PKI without a second party; no network in a local-first product). Frameworks named and implemented as mechanics: assurance-ladder rung composition, timing-safe MAC comparison, fingerprint-not-key storage, the three-valued verdict discipline. Honest label is the feature: *digest-verified, key unavailable* is never upgraded and never punished.
- **Data integrity & permissions.** Additive `MIGRATIONS[94]` (`94 → 95`), fail-closed normalizers (malformed credential rows dropped with warnings, iterations clamp [10000, 2000000], idle minutes clamp [1, 480]), `seatIdentities` enterprise-class record policy, two API right groups (`attest-seat-identity` rank 1–5 self-service own-seat; `govern-attestation` rank 3–5), ten safe reads, rev-idempotent rule retries, and the `ctx.api.exportCSV` defect fixed in three shipped views (`altitudeRouter`, `authorityCalibration`, `concordance` — their CSV buttons threw under scoped seats; all use `ctx.exportCSV` now).
- **Verification (actual, 2026-11-04, post-reconciliation).** `tests/app/identity-ledger.test.mjs` **27/27 PASS** — including the mandated **cross-module propagation example** (one unattributed write under enforcement via the store seam → gateway refusal + exactly one DACI decision + `rolls-up-to` edges to mgr1, dir1 AND vp1 in the same transaction + same-week idempotency) and the **cross-altitude roll-up example** (span posture: mgr1's attested count inherited by dir1 and vp1 with `ownAttestedTx` 0; out-of-subtree collapse under a declared seat). Full regression on the merged tree: **2,513 tests / 0 failures** across all 128 suites in three batches; `npm run lint` exit 0; `check:boundary` 415 app modules / 128 suites / 23 doc checks / 0 leaks; `check:links` 698 links / 200 files; `build:standalone` → 7,360,219 bytes / 414 modules / schema v95; `verify:standalone` 7/7. Version pins swept mechanically both before the merge (88 files: migration-tail arrays, `SCHEMA_VERSION`/`schemaVersion`, `CSV_EXPORTS.length`) and after reconciling with `main` (91 files renumbered to `94 → 95` / CSV #84).
- **Repository status.** Branch `arena/fe0f25f1-leados`, base `6c73a02`. Identity check PASS (origin == shahramclaude/Leados). The identity work first committed as `dabca72` (push verified); the reconciliation with `origin/main` is recorded in the merge commit on this branch and in PR **#145**, which carries the branch to `main`. Nothing is claimed here that was not observed.
- **Next 1 — [all altitudes] Authenticated identity + tenant boundary.** Server-side authorization on every read/write/export; the credential is accountable authorship inside one browser, not authentication of a human being.
- **Next 2 — [director → CEO] Temporal disclosure + reviewed legacy-module adapters.** Complementary suppression across repeated releases (differencing over time) before claiming enterprise confidentiality.
- **Next 3 — [manager → CEO] Outcome learning for authorship posture.** Grade whether weekly boundary decisions actually close the gaps they opened (Brier/base-rate on the workspace's own record), without rating persons.

## Changelog — 2026-11-04 · Session 128 · Hoshin Carryover Terminal

- **Changes.** `#/carryover` — the Hoshin Carryover Terminal ([ADR-0088](docs/adr/0088-hoshin-carryover.md), Schema v94, CSV #83): one first-class record per Catchball pact settled as thesis-invalidated, with its frozen resource bundle (person-days + encumbered budget line); one governed stop-rule settlement decision per resolved bet (retire / revise stop rule / reaffirm) with the bundle printed in the question; release of the encumbered budget line (committed → released, never erasing a spent actual) and of the person-day commitment in the same transaction; and once-only later gradings against the prediction frozen at decision time, with one governed review per altitude cell below the reliability floor per ISO week.
- **Cross-module links.** `carryoverRule` (`RULE-CO-01..04`) writes `carries-over` / `settles` / `releases-resource` edges and one `rolls-up-to` edge per leadership ancestor of the receiving span in the same atomic transaction; marker-idempotent through `carryoverMarkers`, pausable via `carryoverAutoPropagate`, explicit `carryoverScan()` always runs.
- **Altitudes served.** Frontline and manager (the invalidated pact and what it settles), director (released person-days and budget visible to the next allocation cycle), executive (altitude calibration cells: n, hold rate, Wilson 95% bounds; a refused rate is BLANK, never zero).
- **Data integrity & permissions.** Additive `MIGRATIONS[93]` (`93 → 94`), three collections (`carryoverRecords`, `carryoverMarkers`, `carryoverGradings`), five clamped settings, fail-closed normalizers, and aggregate-only CSV #83 (`carryover-settlement`) carrying no pact id, bet id, record id, title, name or budget name.
- **Repository status.** This feature merged to `main` in PR #147 with its merge conflicts left unresolved (conflict-marker text in seven core modules and dozens of tests, no ADR file, no changelog entry, and the `92 → 93` schema claim colliding with the cadence session). This reconciliation resolved the markers, numbered the session's claims (Session 128 / ADR-0088 / Schema v94 / CSV #83), registered its reads in the gateway safe-read set and its route in the legacy surface allowlist, and wrote this entry; the feature's code and tests were otherwise preserved unchanged.

## Changelog — 2026-11-04 · Session 127 · The Operating Cadence Clock

- **Changes.** New `#/cadence` — the Operating Cadence Clock (ADR-0087, Schema v93, CSV #82). The standing-forum calendar is modelled as a single-server queue: declared `decisionCapacity` + `serviceDays` per forum, demand measured in **service-days by input class** (kind competence × time-span horizon), utilisation ρ, Little's law + Kingman heavy-traffic flow time with a hard **refusal above ρ = 1**, a per-item **escape ladder** over sitting forums, a computable **Conway topology test** per forum (`mirrored` / `narrower-than-work` / `wider-than-work` / `disjoint`), the **planning-fallacy gap** between declared and measured closures-per-sitting, and frozen readings graded once with Wilson intervals + Brier skill, both withheld below the declared floor. Five panels (Clock, Workbench, Constraint, Fit, Brief), keyboard-operable, axe-clean in jsdom.
- **Cross-module links.** `cadenceRule` on the shared spine writes typed `queued-for` (cadenceforum ← item), `rolls-up-to` (one per leadership ancestor, rank-tiered disclosure), `escalates-to` (forum → governed decision) and `fit-gap` (forum → missing owning seat) edges in the same atomic transaction sealed by `sealRule`. `RULE-CAD-02` opens one DACI constraint decision per ISO week per signature and fans it up every ancestor. Sixteen new domain tests prove the fan-out reaches director, VP and CEO from a frontline case with zero re-entry. 66 rules / 66 auditable contracts on the merged tree (main's `boardRule` plus this one); `cadenceRule` runs after `catchballRule` and before board/concordance/market/seat/seal.
- **Altitudes served.** Frontline (its own forum clock, the agenda to prepare, escape count) · manager (declare/log, topology fit, `names` disclosure) · director (`unit` roll-up, secondary constraints, planning-fallacy gap) · VP/executive (`aggregate` roll-up, ρ and refused flow, weekly constraint decision it owns) · CEO (workspace ρ, the one named constraint, graded calibration, identity-free brief + aggregate CSV).
- **Competitive benchmark.** The 2026 category — governance-cadence playbooks (Atlan), agenda governance (Lucid Meetings, Docket, Beenote, MeetingKing) and board portals (Diligent, OnBoard, BoardPro, Convene, Sherpany, Ideals) — ships packet distribution, agendas, minutes, voting, audit logs and "meeting analytics" that measure attendance and engagement. **Every one of them measures the cost of the forum and none measures its capacity**: no ρ, no flow time, no refusal when arrivals exceed service, no Conway test of membership against the spans that own the work, no planning-fallacy arithmetic, and no graded forecast about its own design. See `RESEARCH.md §107`; vendor claims are `[UNVERIFIED]`.
- **Repository status.** Branch `arena/ccb2bff5-leados`. Verification actually run and observed this session: `npm run check:boundary` **395 modules / 125 suites / 23 doc checks / 0 leaks**; `npm run check:links` **667 links / 197 files**; focused `node --test` over core, csv, catchball-cascade, altitude-router, propagation-ledger, expectation-concordance, board-room, seal-chain, typed-links-lineage and operating-cadence **174/174 pass** (post-merge tree). `npm run lint` is **not** runnable here (no local eslint install) and the full `npm test` (~39 min) exceeds the sandbox budget — both are stated rather than claimed; CI on the pull request is the record for the complete suite.
- **Next up.** (1) Authenticated identity + tenant boundary — local seats are declarations, not authentication. (2) Calendar simulation: replay the last four cycles of real arrivals against a proposed interval/capacity and report the projected escape count before a forum is declared. (3) Cross-forum handup queues at the LCA when an item escapes every competent forum.

- **Added:** the Operating Cadence Clock (`#/cadence`): declared standing forums with per-forum decision capacity and service time, append-only sittings, competence routing (`queued-for`), utilisation ρ with Little/Kingman flow time refused at ρ ≥ 1, a computable Conway topology test, and frozen queue readings graded once with Brier skill.
- **Connected:** `cadenceRule` joins the shared spine after the Catchball cascade (one governed constraint decision per ISO week, fanned up the chain; agenda-fit gaps addressed to owning seats), for **67 rules / 67 contracts** on its tree.
- **Data & privacy:** additive Schema v93, four collections, six clamped settings, aggregate-only CSV #82 `operating-cadence`. No attendance list, no per-person record, and a forum with no recorded sitting has no next-sitting date.

## Changelog — 2026-11-04 (Session 126)

- **The Disclosure Compiler (`#/disclosure`, `#/cases`, `#/oneonones`, … every screen).** A declared operating seat is now usable across the whole catalogue: every route declares a module manifest, one compile derives a **posture** (detail / aggregate / withheld) from (manifest × seat × release ledger), and the shell serves the altitude-appropriate read instead of a refusal page.
  - *Why:* ADR-0076 shipped an enforced boundary that refused 84 of 89 routes pending per-screen audits. Three sessions listed "one module at a time" as the follow-up; the queue grew faster than it drained, and a director could not do their job in the app.
- **The aggregate is a real answer, not a consolation.** Above a detail ceiling a module opens as counts, open load, overdue load, severity load, oldest age, money **per currency** and per-child-span rows, with sub-floor cells withheld, **one complementary suppression** applied so the hidden cell cannot be recovered by subtraction, total suppression below the floor, an explicit count of records excluded as out-of-span, and `unknown` where a date is missing rather than zero.
- **Detail as a bounded contract.** Request → **consent by the span that owns the records** (the requester is refused) → one screen × one span × 1–30 days, addressed to one seat → expiry. `enterprise` classes (pay, parity, workforce transition) are never releasable; a grant can lift a ceiling but never a floor; a per-seat cap and duplicate refusal apply. `RULE-DSC-01` writes one governed DACI decision + one consent task + typed edges in the same transaction; `RULE-DSC-02` sweeps expiries, opens one graded review per lapsed release, and reconciles stale edges.
- **A leak oracle replaces the hand audit.** New `tests/app/disclosure-compiler.test.mjs` (22 tests) plants sentinel strings in every private field and navigates **all 96 routes at four altitudes** through the real app: no out-of-span person, peer-span record or private note reaches the DOM, no screen throws, no console error.
- **Cross-module links added/updated.** New graph node `disclosuregrant` (→ `disclosureGrants`) with relations `discloses-to` (release → the altitude it is for) and `consented-by` (release → the span that agreed), registered in `LINK_ENTITY_TYPES`, `LINK_ENTITY_COLLECTIONS`, `LINK_RELATIONS`, `SYSTEM_GENERATED_LINK_RELATIONS` and `resolveLinkedEntity`; `RULE-DSC-01` also writes `authorizes` (decision → release) and `tracks-followup` (release → consent task), `RULE-DSC-02` writes `tracks-followup` (release → review task) and expires the record it points at.
- **Organizational altitudes served.** Frontline (every frontline screen in detail inside its window; floors still refuse portfolio/enterprise), manager (individual ceiling + unit detail + the withheld-count badge), director (unit detail, individual rolls up to per-span counts, capital in detail), VP (portfolio terminals publish aggregate rather than a refusal), CEO (counts at the top of the tree, money per currency, no note or name), and every altitude (the release contract, in both directions).
- **Competitive / ambition benchmark chased.** Viva Glint's aggregation thresholds, Workday/Visier hierarchy-derived security, OneTrust/BigID field classification, Zanzibar-style relationship authorization and FCSM complementary suppression — compiled into one posture table plus a proof, which no vendor in the searched material does.
- **Data integrity.** Additive `MIGRATIONS[91]` (`91 → 92`), two collections (`disclosureGrants`, `disclosureMarkers`), five clamped settings (`disclosureCellFloor`, `disclosureMaxDays`, `disclosureMaxActiveGrants`, `disclosureReviewDays`, `disclosureAutoPropagate`), fail-closed grant normalizers (a granted row with no consent or expiry reopens as `requested`; a lapsed window loads as `expired`; a row with no requester, span or 12-character purpose is dropped), and a `disclosuregrant` resolver that projects no record content.
- **Permissions & privacy.** `ACTIONS_RIGHTS` gains `request-disclosure` and `consent-disclosure` (ranks 1–5 — either side may sit at any altitude; the pair, class, floor, purpose, days and cap are what the action checks); two API right groups (`request-disclosure`, `consent-disclosure`), six safe reads; `disclosureGrants` governed as `authority` and `disclosureMarkers` as `unit`; `workspaceRouteVerdict` now consults the compiler and keeps the old narrow allowlist when it has no compiled state (a caller that forgets to compile gets the smallest boundary, never a wider one).
- **CSV scope #81 (`disclosure-posture`).** The registry's 81st export is compiled at the exporting seat, one row per declared module: posture, record class, floor and ceiling ranks, aggregate counts, withheld cells, currency-separated money and the boundary's own reason — no record id, name, note or sentence. The number that matters is the one that is *absent*: a VP's file and a frontline lead's file differ in what the compiler would print, not in what a template chooses to hide.
- **Verification (actual).** `tests/app/disclosure-compiler.test.mjs` **22/22 PASS**; `tests/app/app.test.mjs` **33/33**; `expectation-concordance` **18/18**, `propagation-ledger` and the seat/chain/router/mission suites green (68 in the batch); `npm run lint` clean; schema sweep applied across 85 test files (version pins and migration tails re-derived, not blanket-replaced). Full `npm test` and the standalone artifact are reported in `AI-SESSION-LOG.md` exactly as they ran.
## Changelog — 2026-11-04 · Session 125 (Board Room, Schema v91)

- **Board Room (`#/board`).** The enterprise disclosure memorandum is now a pre-registered measurement surface rather than a pack: seven claims are declared with a comparator, unit and threshold **before** the first recorded look, each look stores a content fingerprint of exactly what was visible, and a threshold moved afterwards carries `revisedAfterLook` permanently on the claim, in the memo text and in the export.
  - *Why:* `chainRegistry.js` promised the chief a `board` duty and `successionRegistry.js` a `board-line`, and `#/board` rendered nothing. The category's board pack is an admin-editable target applied to an averaged index — a claim that cannot fail.
- **The interval decides.** Verdicts come from the conservative end of a Wilson (1927) interval, never the point estimate: 0 of 5 covered has an upper bound of 43.4% and **fails** a 60% floor; 4 of 5 is 37.6–96.4% and is `inconclusive`; a claim exactly on its threshold returns no required sample because no sample size decides a coin that is exactly fair. `boardRequiredSample(50, 60) = 97`.
- **Refusals, not zeroes.** An empty workspace computes **0 figures and reports seven refusals** with reasons. `refused`, `withheld`, `inconclusive` and `stale` are first-class states; every figure is tagged `recomputed`, `attested`, `asserted`, `withheld` or `refused`; a refused figure is blank in CSV and never `0`.
- **Disagreement surfaced, never composited.** Three cross-checks (coverage count vs the bench flow's joint probability, promise reliability rate vs the open promise book, seal integrity vs whether any claim was examined) print both numbers plus a route to the owning module. No composite confidence score exists in the module.
- **Reconciled roll-up.** Every attributable claim is partitioned over the reporting tree and reconciled exactly against the claim's own denominator; a broken partition is reported with its delta, and an unattributed claim is drawn as "nothing attributed" rather than as one aggregate bar.
- **Cross-module links added/updated.** `RULE-BRD-01` opens exactly one governed DACI decision per failing claim (`authority: 'act-inform'`) and — only when the worst partition row is a span — one delegation to that span's holder capped at `min(60, boardRecheckDays)` days; `RULE-BRD-02` writes typed `rolls-up-to` edges to every leadership ancestor; `RULE-BRD-03` writes one advisory maturity marker. Registered on the existing post-commit spine after the concordance rule and before the attention market; `sealRule` still runs last. **63 → 65 rules / 65 auditable contracts when merged on main** (the fully reconciled tree carries 69 rules / 69 contracts), idempotent through `boardMarkers`, pausable through `boardAutoPropagate`, explicit `boardScan()` always available.
- **Organizational altitudes served this session.** Frontline / team lead (which claim of mine is failing and what it costs; may not commit), manager (span partition with the arithmetic printed), director (named span rows, worst row identified, the delegation the failing span receives), VP / executive (cross-module discrepancies with both numbers, settling-sample arithmetic, refusal count), CEO / chief (pre-registration and chief-only `commit-board-memo` at rank window 5–5, the deterministic identity-free memorandum, attestation state, aggregate-only CSV #80).
- **Competitive / ambition benchmark chased.** The category sells dashboard libraries, scheduled board exports and editable health indices. This borrows the *research* answer instead — pre-registration (Nosek et al. 2018; Simmons, Nelson & Simonsohn 2011), Wilson (1927) intervals, HARKing as the designed-out failure (Kerr 1998), Simpson (1951) and the composite-index critique (Jacobs, Goddard & Smith 2007), and Jaques (1979) on stratum accountability. No vendor page was fetched this session (sandbox egress limited to the package registries); product claims are marked `[UNVERIFIED]` in `RESEARCH.md` §106.
- **Data integrity.** Additive `MIGRATIONS[90]` (`90 → 91`), two collections (`boardMemos`, `boardMarkers`), five clamped settings, and fail-closed normalizers that drop a claim-less memo, clamp thresholds to 0–100, drop duplicate claim keys while allowing a later valid declaration to repair an earlier unreadable one, and never coerce `null` to `0` (a board figure is blank or absent, never zero by accident).
- **Permissions & privacy.** Two API right groups (`declare-board-line`, `freeze-board-summary`) with `commit-board-memo` held to rank 5–5, six safe reads, `#/board` added to the gateway allowlist, seven route aliases, an aggregate-only CSV scope #80 (registry 79 → 80) and an identity-free memorandum — no memo id, operator, note, span or person name survives the export boundary.
- **Verification (actual, 2026-11-04).** See the Session 125 entry in `AI-SESSION-LOG.md` for the exact suites run and their results; nothing here is claimed that was not observed.

## Changelog — 2026-11-04 · Session 124

- **Added:** Hoshin Kanri & Catchball Cascade (`#/catchball`), with bilateral proposals/counters, receiver acceptance, capacity checks, bowler check-ins, settlement and optional same-currency budget commitments.
- **Connected:** strategy bets, goals, budgets and reporting ancestors through typed links on the existing post-commit spine; watermelon and double-loop concerns open review decisions, not automatic strategy changes.
- **Data & privacy:** additive Schema v90, scoped seat reads/actions, small-cell safeguards, identity-free brief and aggregate CSV #79. Local seats are not authentication; suppression is not differential privacy.
- **Verification:** 73 focused Catchball, Concordance, graph, routing, seal, CSV and standalone tests passed; ESLint, boundary and docs-link checks passed; standalone rebuilt. The pre-merge full-suite run was interrupted after main advanced; the combined tree needs a complete run.

## Changelog — 2026-11-04

- **Expectation concordance (`#/concordance`).** "Meets expectations" is treated as a measurement instrument: a leader and one of their reports each answer six declared expectation dimensions on a five-point bar, independently and sealed, and the app measures the **agreement** rather than rating either person.
  - *Why:* every tool in the category rates a person against an unexamined word; two honest people with two gauges produce a review that is correct on both sides and still arrives as a surprise. LeadOS already audited rating reliability over time (ADR-0069); this audits the agreement between the two raters at one moment.
- **Statistics, side by side and refusable.** Quadratic weighted κ (Cohen 1968), Gwet's AC1 (2008), PABAK (Byrt et al. 1993) and Bland–Altman bias with 95% limits of agreement (1986). The prevalence paradox is printed when κ and AC1 disagree by more than 0.4; below the six-item instrument floor or with degenerate marginals the figure is **refused with its reason**; perfect agreement prints a shared-error warning because agreement is not correctness.
- **Cross-module links added/updated.** New graph node `concordance` (→ `expectationRounds`) with two new typed relations: `re-contracts` (closed round → the governed re-contracting decision it opened) and `re-tests` (a later round → the decision whose standard it tests). `RULE-ECN-01` writes one `rolls-up-to` edge per leadership ancestor for every closed round; `RULE-ECN-02` opens one governed DACI re-contracting decision per pair per ISO week on divergence and places one generated agenda line on the pair's most recent 1:1; `RULE-ECN-03` writes one advisory maturity marker. All on the existing post-commit spine — 69 rules / 69 auditable contracts, marker-idempotent, pausable, explicit scan always available.
- **Organizational altitudes served this session.** Frontline / team lead (pair detail, both gauges, the gap per dimension, a deterministic conversation script), manager (sealed-round queue, cycle-over-cycle κ, the 1:1 agenda line), director (span rates with exact partitioning, the org-wide **dimension profile**, small-cell withholding — other spans' gauges withheld, own pairs still readable), VP / executive (pairs-above-floor share with Wilson 95% interval and a 10–90 percentile range; one governed re-contracting decision per pair per week; typed roll-up in the same transaction), CEO / chief (identity-free brief, aggregate-only CSV #78).
- **Competitive / ambition benchmark chased.** The category (Lattice, 15Five, Culture Amp, Leapsome, Betterworks, Workday, SAP SuccessFactors) sells goal cascades, engagement indices, 360 distributions and nine-box grids — every figure a claim about a person, alignment self-reported. This borrows the *industry* answer instead: **Measurement Systems Analysis / gauge R&R** (AIAG & VDA 2010), joined to the leadership literature on role clarity (Hackman & Oldham 1976; Locke & Latham 1990; Mager & Pipe 1970) and to procedural/interactional justice (Leventhal 1980; Bies & Moag 1986; Colquitt et al. 2001) implemented as mechanics — the seal, the symmetry rule, and the refusal to print a figure that could be used against a person. No vendor page was fetched this session (sandbox egress limited to the package registries); vendor-specific claims are marked `[UNVERIFIED]` in `RESEARCH.md` §104.
- **Data integrity.** Additive `MIGRATIONS[88]` (`88 → 89`), two collections (`expectationRounds`, `concordanceMarkers`), six clamped settings, fail-closed normalizers that drop malformed rounds and **reopen** a round claiming to be closed with one side, a reporting-path fingerprint that marks an open round stale after a reorganisation, and bounded ledgers with printed overflow instead of silent deletion.
- **Permissions & privacy.** `close-expectation-round` added to `API_RIGHTS` and `ACTION_RIGHTS` (rank window 1–5, bound to a real pair inside the declared span), five safe reads, `unit`-class record policies, other spans' gauges withheld above director rank, aggregate-only CSV #78 (registry 77 → 78) and an identity-free brief — no person, pair, span name, note or individual rating survives the export boundary.
- **Verification (actual, 2026-11-04).** `tests/app/expectation-concordance.test.mjs` **18/18 PASS** (analytic κ/AC1/PABAK cases, an independent 5×5 recomputation, Bland–Altman, refusals, seal integrity, real cross-altitude fan-out to director and VP in one transaction, the 1:1 agenda line, idempotent rescans, pause + explicit scan, exact partition and cell-floor withholding, director-rank disclosure, aggregate-only exports, inertness, axe-clean five panels). Regression batches: core / cases-automation / propagation-ledger / operating-seat / mission-control / decision-rights **89/89**, action-bundles **19/19**, csv **5/5**, app **33/33**, domain **39/39**, access-audit **16/16**, event-cascade **12/12**, altitude-router **11/11**. `npm run lint` exit 0, `npm run check:boundary` (377 modules / 122 suites / 23 doc checks / 0 leaks) and `npm run check:links` (631 links / 194 files) pass on the merged tree; `seal-chain` **15/15**, `propagation-ledger` **31/31**, `attention-market` **31/31**, `wait-cost` **45/45**, `deferral-option` **41/41**, `domain` **39/39**, `app` **33/33**, `org-design` **22/22**, `operating-seat` **16/16**, `core` **15/15**, `event-cascade` **12/12**, `altitude-router` **11/11**, `decision-rights` **10/10**, `mission-control` **10/10**, `cases-automation` **7/7**, `csv` **5/5**. `npm run build:standalone` → 6,879,047 bytes / 376 modules / schema v89 / sha256 `b31c89d1fb132e58`; `standalone` tests **7/7**. 83 version-pin files and 24 CSV-count assertions swept mechanically for the additive migration.
- **Merge with `origin/main` (PR #138).** `main` had merged its own Session 122 (the Sealed Spine, `#/seal`), which already held ADR-0082. This session is therefore **Session 123 / ADR-0083**; both features are kept, `concordanceRule` runs before the attention market, and `sealRule` still runs **absolutely last** so one seal covers every module's writes in the same commit — **69 rules / 69 contracts**. The seal needed no schema bump of its own, so v89 remains exactly this session's additive migration.
- **Known gaps.** Authenticated identity + tenant boundary (the seal prevents anchoring, not a determined reader with the backup file); temporal / repeated-release disclosure tests; an instrument v2 that scores a shared artefact rather than a self-report; real-browser screen-reader walkthrough `[UNVERIFIED]`. Six items is the instrument, not a sample; suppression is not differential privacy; the re-test comparison is an association, not an effect.
- **Repository status.** Branch `arena/26229072-leados`. Commit and push results are recorded in `AI-SESSION-LOG.md` (Session 123) and in the pull request itself; nothing is claimed that was not observed.
- [The Sealed Spine (`#/seal`)]: the append-only event log is now hash-chained and tamper-evident. One `audit.seal` event per committed transaction, appended by `sealRule` registered **last** on the shared post-commit spine (62 rules), so a single seal commits to `sha256(prev ‖ digest ‖ revision)` over exactly the events every other module's rules appended in that same atomic write — by construction, not per-module glue. Genesis is 64 zeros; verification replays from genesis and reports the first break with a typed reason (`chain-break`, `seal-mismatch`, `content-mismatch` at the exact revision) plus trailing-unsealed events and retention-evicted blocks.
  - Why: the log was append-only *by convention* (ADR-0001) with nothing proving a hand-edited payload or silent normalizer hadn't rewritten history, and the 2026 category's "audit trail" is a vendor-held table nobody customer-side can verify (`RESEARCH §104`). In a local-first workspace the data lives here, so the verifier belongs here too.
- [Two modes, printed honestly]: HMAC-SHA256 keyed by a PBKDF2 256-bit session key (domain `leados-seal-v1:`, memory-only, cleared at all five vault-lock sites) whenever the vault is unlocked; plain SHA-256 otherwise. Every surface — banner, stats, certificate — names the mode: plain mode is integrity against corruption and honest error, **not** forgery-proof, and an HMAC block verifies only with the key (`key-missing` when locked, never a silent pass).
- [Retention that cannot eat the anchors]: non-seal events keep `EVENT_CAP = 600`; seal events are exempt up to their own cap (5000) and evictions are reported as `evictedBlocks` — chain-verified, content honestly unverifiable, counted not hidden.
- [Span attestation roll-up]: every sealed transaction is counted at the owning span **and** every leadership ancestor in the same transaction — one frontline commit attests at lead → manager → director → VP → chief with zero re-entry; out-of-subtree spans collapse to one `__out-of-scope__` aggregate row under a declared seat.
- [Gateway + surface]: `sealRead`/`sealVerify`/`sealBriefText` are safe reads and `sealScan` runs at any rank under a new `audit-seal` right (ranks 1–5); enable/disable/seal-pause is operator-only and fails closed under a declared seat through the ADR-0080 gateway. `#/seal` ships four axe-clean panels (chain, span attestations, sealed blocks, identity-free integrity certificate), a nav badge counting chain breaks only, and aliases (`seal`, `seals`, `audit-chain`, `attestation` — `integrity` and `trust` deliberately stay with Signal integrity and Promise solvency).
- [Altitude-routed NL intake (intake `v2`)]: free-text drafts resolve the owning seat by lowest common ancestor over the reporting tree and suggest `ownerId` + `ownerBasis`; the `#/intake` analysis prints an altitude-routing card (owning seat, altitude, roll-up path, routes, hand-up, forbidden lists); confirming creates the case under the routed owner — so a new case's first events are sealed under the right span.
- [Zero migration]: this feature adds **no new collection and no migration entry of its own** — `SCHEMA_VERSION` stays at Session 121's **88** (the parallel Altitude Router bump, merged together with this PR); three settings default when absent (`sealEnabled`, `sealAutoPropagate`, `sealMode`); the chain lives in the event log it protects.
- [Verification]: the **entire canonical suite** — `node --test "tests/app/*.test.mjs"` → **2360/2360 pass, 0 fail** (137 suites, 41 min, post-merge; includes `seal-chain.test.mjs` **15/15** and `altitude-router.test.mjs` **11/11** side by side), `npx eslint .` clean, `check:boundary` OK (371 app modules / 121 test suites / 23 doc checks, 0 leaks), `check:links` **624/624** across 193 markdown files, standalone portability **7/7**; `build:standalone` post-merge → **6,804,985 bytes · 370 modules · schema v88 · source `3dcd435d`**. The pre-merge branch sweep (152/152 across nine affected suites) plus the merged tree are both green. Full results are recorded in `AI-SESSION-LOG.md` (Session 122).
- [Merged with PR #136 in parallel]: `origin/main` had gained "Session 121 — The Altitude Router (Schema v88, ADR-0081)" from the same base. Theirs keeps Session 121/ADR-0081/the v88 bump; this entry renumbers to **Session 122 / ADR-0082** (file `0082-sealed-spine.md`, RESEARCH §104) and states "no additional bump atop v88". Both features' wiring unions cleanly (69 rules / 69 contracts 1:1, `sealRule` last); six of PR #136's tail-order assertions were updated to the merged contract (seat at −2, seal at −1). Details in `AI-SESSION-LOG.md` → "Merge resolution".
- [Defects found and fixed in this session's own code]: `renderSeal` returned `<main>` inside the shell's `<main id="view">` (duplicate-landmark axe failures on `#/integrity` — now `div.page` like every other view); the alias block shadowed `integrity` (Signal integrity) and `trust` (Promise solvency); `sealScan` had no seat right (refused under every declared seat); the seal summary originally stored 16-hex prefixes so verification could not recompute the chain (full `prev=`/`digest=` now travel in the summary, `root` last so the 300-char cap truncates only the root); `ctx.previousState` is deleted by the engine before rules run, so seal freshness is positional rather than diff-based; two shipped rule-order assertions (`DEFAULT_POST_COMMIT_RULES.at(-1) === seatRule`) were updated to the ADR-0082 contract (`seatRule` at −2, `sealRule` at −1) and `sealRule.id` was added to mirror `seatRule.id`.
- [Docs]: `docs/adr/0082-sealed-spine.md` + INDEX entry, README, FEATURES, ARCHITECTURE, LEADOS-STATE, ROADMAP, RESEARCH §104, AI-SESSION-LOG (Session 122), `index.html` `leados-sealed-spine` meta + `leados-build` updated, rebuilt `LeadOS-standalone.html`.

Cross-module links added/updated: `audit.seal` / `seal.verified` / `seal.enabled` / `seal.disabled` / `seal.scan` events (RULE-SEAL-01/02, sealRule last on the spine); `propagationContracts.js` sealRule contract; `audit-seal` API right + `sealRead`/`sealVerify`/`sealBriefText` in `SAFE_READS` (accessGateway); `caseSuggestion.ownerId`/`ownerBasis` + `altitudeRouting` (intake) feeding `addCase` ownership; span attestations reuse the seat rule's `rolls-up-to` ancestor tree — no new relation, no new graph node, no new collection.

Organizational altitude(s) served this session: [frontline (7d), manager (30d), director (90d), exec (180d), chief (365d)] — all five: every sealed transaction attests at every leadership ancestor in one transaction, the gateway admits scan/verify at ranks 1–5 while keeping enable/disable at the operator, intake routes a new case to the LCA-owned seat, and the Integrity surface prints the chain status an auditor at any level can read. Plus the undeclared single-operator view as the no-regression default (sealing is inert until enabled).

Competitive/ambition benchmark this session: [Lattice, Culture Amp, 15Five, Betterworks, Workday Illuminate, Peakon and the 2026 roundups sell predictive scores, AI drafts and vendor-held "audit trail logging" tables (Lucid's Audit Logs API is an Enterprise Shield *read* of vendor rows); the hash-chain + signed-checkpoint construction exists in security-engineering practice but was not found on any surveyed people-analytics vendor page — see RESEARCH §104]. The chosen bar: **a locally verifiable, per-transaction sealed audit chain with per-span attestation that the customer can recompute from genesis without the vendor** — Bloomberg Terminal × AI co-pilot × strategy consultancy, for any leader from shift supervisor to CEO.

Repository status: **pushed** — `origin/main` had moved (PR #136 merged from a parallel session), so the branch was un-shallowed (`git fetch --unshallow`), `origin/main` merged in (`3dcd435d`, ADR/Session renumber + six tail-order assertion fixes), and `git push origin arena/66ef986a-leados` succeeded (`a7562dd8..3dcd435d`). **Pull request [#137](https://github.com/shahramclaude/Leados/pull/137)** (opened from this branch, state `OPEN` at the time of writing; `gh pr view 137 --json mergeable` re-checked after the push) carries the feature commit `ddf9e39`, the docs follow-up `a7562dd8` and the merge resolution `3dcd435d`; the standalone artifact was rebuilt against `3dcd435d`. The PR updates automatically from the same branch.

## Changelog — 2026-11-03

- **Altitude Router (`#/routing`).** A note is classified into modules **and** the owning altitude, resolved onto a real seat, and adopted in one atomic transaction. *Why:* the intake engine and the hierarchy model were two strong halves that never met; the leader still had to know which screen to open.
- **Cross-module links added/updated.** `routes-through` (case → routing plan), `discloses-to` (plan → owning seat), `grades-routing` (plan → calibration marker) and `rolls-up-to` (plan → every leadership ancestor), all on the existing post-commit spine. `RULE-AR-01` fires alongside the pre-existing `RULE-DEC-01` / `RULE-COACH-01` / `RULE-CFP-01` / `RULE-SUC-01` in the **same** `case.created` transaction; `RULE-AR-02` opens one governed DACI decision per breaching cell per ISO week; `RULE-AR-03` writes one advisory marker. 69 rules / 69 auditable contracts.
- **Altitudes served this session.** Frontline / team lead (shift note, named-detail view, `names` disclosure), manager (LCA of two frontline spans, handoff), director (quarter-horizon floor, `unit` disclosure, unit-level rates), VP / executive (portfolio aggregate, reliability floor decision), CEO / C-suite (aggregate-only brief, no shift notes). One parameterised read model renders five different operating pictures instead of duplicating a dashboard.
- **Competitive / ambition benchmark chased.** Moveworks + ServiceNow 2026-style confidence-gated intelligent triage (low confidence → human clarification, never a silent auto-write) joined to Microsoft Viva Glint 2026-style hierarchy confidentiality (5-response floor, 10-comment threshold, complementary suppression, hierarchy breakdowns hidden for small child teams, role-based access, reorg/inactive/phased-access scenarios) — then extended with what neither vendor surfaces publishes: an out-of-sample **strictly-prior Brier skill**, a **mean rank error** for mis-routing cost, and a typed, auditable, idempotent vertical roll-up written in the same transaction as the case. Vendor claims are `[UNVERIFIED]` marketing sources, not independent benchmarks; the implemented behaviour is proven by `tests/app/altitude-router.test.mjs`.
- **Data integrity.** Additive `MIGRATIONS[87]` (`87 → 88`), two collections (`altitudeRoutingPlans`, `altitudeRoutingMarkers`), five clamped/fail-closed settings, one graph node + three relations in `cases.js`, fail-closed normalizers that drop malformed records with a warning, fingerprint staleness refusal after reorganisations, marker-idempotent rescans, and a pausable `routingAutoPropagate` with an always-available explicit scan.
- **Permissions & privacy.** `route-intake` added to `API_RIGHTS`, `ACTION_RIGHTS` and `SAFE_READS`; scoped `routing` route in `workspaceRouteVerdict`; `unit`-class record policies for both collections; peer-span confirmation refused; conflict privacy wall carried through; aggregate-only CSV scope #77 (registry 76 → 77) and identity-free brief.
- **Verification (actual, 2026-11-03).** Full `npm test` on the final source: **2,345 tests across 137 suites — 2,345 pass, 0 fail, 0 cancelled, 0 skipped, exit 0**. `tests/app/altitude-router.test.mjs` **11/11 PASS** (joint report, LCA, quarter-horizon lift, five-rung ladder, single atomic cross-module × cross-altitude transaction, idempotent rescan, staleness refusal, privacy wall, Wilson + Brier skill + rank error, one governed floor-breach decision, seat boundary, aggregate-only exports, inertness, axe-clean five panels); standalone **7/7 PASS**; `node --check` on all changed JS/MJS files PASS; ESLint exit 0; canonical boundary **365 modules / 120 suites / 23 doc checks / 0 leaks**; doc links **612 across 192 files, all resolve**. The four `verify:canonical` stages were each run and passed individually (a single chained run exceeds a 30-minute shell limit). 83 version-assertion files and 25 CSV-count assertions updated mechanically for v88 / 77 scopes. Live preview on `0.0.0.0:5173` serves `/`, the new router modules and the standalone artifact at 200.
- **Four pre-existing failures fixed, zero regressions.** Each was first reproduced on a detached worktree at baseline `ccecf0a`: a stale `dynamics` demo verdict that contradicted the engine's own saturation rule; a stale `signal-integrity` CSV ordinal; a `succession-bench` test that declared a seat at `mgr1` while naming a peer span's `ic6` (the boundary was right, the fixture was wrong — it now declares the common leader `dir1`); and `typed-links-lineage` missing fixtures/route contracts for `mandate`, `missionbrief`, `retention` and the new `routingplan`. **The `altitude-router` CSV descriptor was moved from index 2 to the end of the registry**, so it is genuinely scope #77 and no existing ordinal shifts; a positional assertion now guards against future mid-array insertions. No shipped engine behaviour was weakened to make a test pass.
- **Repository status (actual).** Branch `arena/d4a34bd8-leados`, origin `https://github.com/shahramclaude/Leados.git`. Commit `f417f30` was pushed successfully (`[new branch] arena/d4a34bd8-leados -> arena/d4a34bd8-leados`) and **pull request [#136](https://github.com/shahramclaude/Leados/pull/136) is OPEN** against `main` — verified with `gh pr view 136`: `state OPEN`, `mergeable MERGEABLE`, head `arena/d4a34bd8-leados`. At the time of writing its `canonical` CI check (`npm ci` → boundary → links → lint → `npm test`) was still **in progress** and `CodeRabbit` was **skipped**; the same four gates were all run locally and passed (see Verification above). `LeadOS-standalone.html` regenerated from canonical `index.html` (6,772,940 bytes / 364 modules / schema v88 / sha256 `875487fd8a8e9a11`). A small follow-up commit records this sync result in the docs; the PR updates from the same branch automatically.
- **Known gaps.** Authenticated identity + tenant boundary; reviewed adapters for legacy raw-data modules; temporal/repeated-release disclosure tests; outcome-graded recommendations rather than confidence bands; a `mandate` link resolves to `#/mandates` but not yet to one focused contract; real-browser screen-reader/contrast walkthrough **[UNVERIFIED]**. Local seats are declarations, not authentication; suppression is not differential privacy.
- **Next 1–3 ambitious roadmap items.** (1) [all altitudes] **Authenticated identity + tenant boundary** with server-side authorization on every read/write/export. (2) [frontline → CEO] **Closed-loop outcome learning**: grade *interventions*, not just routing grades, so recommendations are priced by realised outcomes. (3) [manager → CEO] **Temporal disclosure & reorganisation differencing**: repeated-release, split/merge and inactive-user confidentiality tests with complementary suppression.

## Changelog — 2026-11-03

- **Mission Control (`#/mission`):** five altitude-specific operating loops with evidence-first triage, hierarchy drill-up/down, reviewed interventions and handoffs.
  - Why: the hierarchy was a model but the daily surface was still a module catalogue; each altitude now gets its actual job.
- **Scoped API gateway + render projection:** declared seats fail closed on unknown methods and legacy raw-data screens; the local operator view is preserved explicitly.
  - Why: navigation filtering alone was not a read/write boundary.
- **Disclosure-safe roll-up:** LCA partitioning, primary + complementary small-cell suppression and interval parent totals.
  - Why: an exact parent total can reveal a suppressed child by subtraction.
- **Atomic cross-module interventions:** rank-filtered Action Bundles, background rehearsal, stale-rehearsal refusal, vertical `rolls-up-to` fan-out and guarded withdrawal.
- **Immutable mission briefs (Schema v86):** identity-free CEO snapshots with evidence fingerprint and limitations; RULE-MIS-01 opens one governed review and `summarizes-span` provenance.
- **Fixed during verification:** restored `#/calibration` to Confidence Transport (Authority Calibration keeps `#/authority-calibration`), registered the missing Authority Calibration propagation contract, added reviewed mandate read/preview/scan adapters and module automation-pause settings to the seat gateway, and restored the Settings CSV preview default to the people table.
- **Honest limits:** local workflow boundary, not authenticated multi-user security; suppression is not differential privacy; rehearsal is a software diff, not a causal forecast. Mission briefs export Markdown only; no CSV scope was added (retention integration brings the registry to 76 exports).

## Changelog — 2026-11-03

- [Conflict integration — Session 45 retention]: ported the survivorship, hazard-economics, departure and retention-plan terminal into the current app as **Schema v86** (`85 → 86`), rather than reusing the historical v29 migration number. Added `#/retention`, RULE-RET-01..04, the pseudonymous retention CSV as scope #76, rewind/demo cleanup and calibration-safe reporting. PR #44's stale schema and shared-file conflicts are resolved in this integration.
- [Session 74 comparison]: retained the current `#/merit` implementation (Schema v51) as the pay-equity terminal; did not import PR #84's parallel pay model or duplicate the route/data model.
- [Authority Calibration Ledger (`#/authority-calibration`)]: accepted mandate contracts graded against delivered outcomes — Brier / base-rate by action class and receiver altitude, Wilson 95% interval, counts-only floor, reliability floor, no person scored. Schema v85, ADR-0079, RULE-ACL-01/02 on the shared post-commit spine after `mandateRule`. CSV #74 aggregate-only scope.
- [Cross-altitude roll-up]: RULE-ACL-01 opens one governed DACI decision per cell below the reliability floor per ISO week and writes `rolls-up-to` edges from each breaching mandate to every leadership ancestor of the receiver seat in the same transaction. RULE-ACL-02 writes one advisory audit marker when a cell reaches the evidence floor.
- [Schema v85]: additive `MIGRATIONS[84]` (`authorityCalibrationMarkers` collection), clamped settings (`authorityCalibrationFloorN`, `authorityCalibrationReliabilityFloorPct`, `authorityCalibrationAutoPropagate`), `calibrationScan()` API action, `calibration.scan` event.
- [Decision Rights Exchange (`#/mandates`)]: bounded authority contracts over existing open work — explicit offer/accept/deliver/verify/return/revoke, capacity evidence, real budget encumbrance → actual → release, expiry/scope/budget-drift recovery with a named owner, receiver-partitioned roll-up with drill-down, rank ≥4 non-party redaction, aggregate-only CSV #74 and brief. Schema v84, ADR-0078, RULE-MND-01..03 on the shared spine before `seatRule`.
  - Why: approval chains and delegation windows are commodity (Workday, ServiceNow, Copilot Studio, Aera, Cloverpop; RESEARCH §101); the missing object is a closed-loop leadership handoff contract on the same work graph.
- [Hierarchy]: routing reuses the reporting tree (down/up only, LCA for cross-span, rank floors, high-consequence safety); acceptance/recovery work rolls up every leadership ancestor in the same atomic transaction via typed `rolls-up-to` edges.
- [Finance]: spending right requires an active same-currency budget with headroom; acceptance encumbers the ceiling, verification posts the recorded actual, loss of authority releases only when no actual exists. Unknown is never zero.
- [Fixed]: succession brief export now calls `downloadText({filename,text,mime})` and offers a copyable fallback when the browser blocks the download; regression-tested.
- [Honest limits]: local seat selection is a workflow declaration, not authentication; no tenant isolation, external notification or autonomous spending; full backups still contain the whole workspace.

## Changelog — 2026-11-02

- [The Succession Terminal (`#/succession`)]: the bench as a **certified flow-feasibility claim** rather than a readiness colour. A Dinic maximum flow tests whether a departing holder's dated obligations can be held by the peers who remain; on failure it prints the **minimum cut** — the exact obligations nobody can take, with due dates and eligible-survivor counts.
  - Why: all twelve 2026 platforms surveyed (Workday, SAP SuccessFactors, Oracle Fusion HCM, TalentGuard, ChartHop, PeopleFluent, Darwinbox, UKG Pro, PageUp, iMocha, Lattice, Leapsome) sell a nomination plus a rated readiness aggregated into bench strength; none computes whether the work can be reabsorbed, and readiness ratings cannot answer the question asked after a resignation (`RESEARCH §100`).
- [Span as the unit, peers as survivors]: direct reports partition the roster so every obligation is tested exactly once and counts roll up by exact addition; the span lead is never a survivor; `empty-span` / `span-of-one` are drawn and refused rather than shown covered.
  - Why: testing the whole subtree counts the same item at team, directorate and function level — the first draft tripled the enterprise probability and certified a gap on a covered workspace.
- [Five graded eligibility sources]: `covered-before` / `delegated-together` / `shared-goal` / `shared-review` / `same-team`, each an edge earned by a record, with `unlinkedPairs` printing the blind spot on every span.
- [Declared overload rule]: `⌊factor × median(load) − load⌋ + 1` floored at 0, printed where used; a balanced team can absorb, a member at twice the median cannot.
- [Collective blanket + threads]: the union of dated commitments with the independent thread count beside it; recurring cadences never set the blanket; no future-dated obligation is refused, never infinite.
- [Concentration on work, never worth]: Herfindahl–Hirschman with inverse-HHI effective holders and Shannon entropy; absent holders stay in the denominator.
- [An untested bench is priced]: Lindley–Smith single-sample acceptance at 50% below the floor, Jeffreys posterior above it; the enterprise answer is a **bounds pair** (`∏(1−p)` upper beside `max p` lower), never a point estimate.
- [Money only where declared]: per-currency daily deprivation cost, exact binomial shortfall tail, equal-marginal figure labelled an upper bound; unpriced work counted and never valued, no salary inferred, currencies never summed.
- [Freeze / grade / refuse]: one prospective probability plus its lower bound, exact blocking set, verdicts, blanket and index; refuses to freeze with no measurable span or twice a day; graded once later by re-running the structural test; deleted member unmeasurable; skill withheld below five readings.
- [RULE-SUC-01..05 on the shared spine]: registered 55th of 56 **before** `seatRule`, so certificate edges must be explainable by the seat boundary above them; one governed DACI decision per span per 30-day bucket with three options (develop a second holder / reshape the span / **accept the exposure in writing**); a development commitment per 90-day bucket for concentration; dead-edge revocation that preserves other rules' edges. **One frontline team's gap reaches manager → director → VP → CEO in one atomic transaction.**
- [Schema v83, additive `82 → 83`]: `successionReadings` (cap 12) and `successionMarkers` (cap 400), 12 declared conventions, fail-closed normalisers; `successionreading` graph node and 4 new relations (97 in `LINK_RELATIONS`).
- [Wiring]: 8 action commands, 13 route aliases, nav badge counting certified gaps only, SUC-01..08 signals in a *Leadership bench* insights bucket, identity-free brief, aggregate-only CSV scope #73 (30 columns, no ids or names), six axe-clean panels, `index.html` meta and a topbar Bench shortcut.
- [Verification]: `tests/app/succession-bench.test.mjs` **16/16 pass**; 192 schema-version assertions swept across 79 test files for the bump; full canonical suite, `lint`, `check:boundary`, `check:links` and `build:standalone` results recorded in `AI-SESSION-LOG.md`.
- [Defects found and fixed in this session's own code]: `Number(null) === 0` turned an omitted review horizon into the 14-day floor and graded a probability-free reading as a 0% forecast; `successionreading` was used as an edge source before it was a registered graph entity type, so `ensureEntityLink` **silently refused** and the rule reported provenance it had never written (the link helper now logs its own refusals); decision `options` written as bare strings were dropped by the normalizer, leaving a decision with no options after reload.

- [The Operating Seat / Altitude Lens (`#/seat`)]: `settings.activeSeatId` declares the position in `person.managerId`'s reporting tree from which the workspace is operated, in an append-only `seat.switched` handover. A non-seat id is refused; a stale or hand-edited id fails closed to a genuinely read-only aggregate view; `null` is the undeclared operator view.
  - Why: the heads-up's "zero org structure" condition was verified and is false (ADR-0075 already ships the tree), but real role-based permissions were genuinely absent — ADR-0075 §5 calls its disclosure ladder display-only.
- [Enforced ABAC/RLS with printable refusals]: four sensitivity classes (`individual` 1–2, `unit` 1–5, `portfolio` 3–5, `enterprise` 4–5) and four gates (fail-closed → sideways subtree → downward rank floor → upward detail ceiling) return `full | aggregate | denied` with a reason; `projectForSeat` exposes the transparent enforcement ledger; `canAct` gates ~20 declared rights; `routeVerdict` filters the nav and refuses forged hash navigation.
- [Vertical roll-up on the shared post-commit spine]: `seatRule` registered last among 55 rules; `RULE-SEAT-01` fans one typed `rolls-up-to` edge per leadership ancestor for every `SIGNAL_SOURCES` work item, `RULE-SEAT-02` opens one governed hand-up delegation per seat per ISO week, `RULE-SEAT-03` audits the boundary. One frontline case reaches manager → director → VP → CEO in the same atomic transaction as every other module's propagation.
- [Composition-safe, derived digests]: exact counts, pooled vs mean-of-unit horizon-debt rate with a directly standardised comparison above the materiality bar, evidence-floor refusal, severity × age risk heatmap, ≥4-week arrival trend with an `unmeasured` verdict, altitude duties with permission-filtered routes, disclosure ladder and a generated board-ready line. All derived live; no stored copy.
- [Five genuinely different operating pictures]: one `#/seat` surface, altitude as a parameter — duties, routes, disclosure and board line differ by rank; 11 aliases, filtered nav, topbar seat chip, nav badge counting withheld records, altitude-specific accent tones, identity-free brief export.
- [Zero migration]: `SCHEMA_VERSION` stays 82; no new collection, no `MIGRATIONS[82]`, no stored digest. Declaration is a setting, handovers/refusals are events, provenance reuses existing relations and entity types.
  - Why: 191 hardcoded v82 assertions across 78 test files; a stored digest would be a second copy that can drift from the record it reports.
- [No-regression inertness]: the automatic pass requires a declared seat + `seatAutoPropagate` + an operational commit; explicit `seat.scan` / `seat.switched` / `seat.propagate` always run. No undeclared workspace's transaction changes.
- [Verification]: 14 new tests; 131/131 across the four affected existing files; 31/31 propagation-ledger; 7/7 standalone portability; `lint`, `check:boundary` and `check:links` all pass. Two existing positional assertions and the propagation contract registry were updated because a derived rule was appended (55 rules = 55 contracts). Full-suite status is recorded in `AI-SESSION-LOG.md`.
- [Docs]: `docs/adr/0076-operating-seat.md`, ADR INDEX, README, FEATURES, LEADOS-STATE, ROADMAP, RESEARCH §99, AI-SESSION-LOG, `index.html` meta, rebuilt `LeadOS-standalone.html` (source `755bad0`).

Cross-module links added/updated: `rolls-up-to` (case/decision/delegation/goal/feedback/perfconcern/premise/requisition → person leadership-ancestor seats, RULE-SEAT-01); `rolls-up-to` (delegation → seat person, RULE-SEAT-02); `seat.access_denied` and `automation.propagated` events (RULE-SEAT-03); `seat.switched`/`seat.scan` handover events; `propagationContracts.js` seatRule contract. All reuse existing `LINK_RELATIONS` / `LINK_ENTITY_TYPES` — no new relation, no new node type, no new collection.

Organizational altitude(s) served this session: [frontline (7d), manager (30d), director (90d), exec (180d), chief (365d)] — all five, each with its own enforced permission window, disclosure ladder, duties, one-click routes and roll-up/drill-down reading; plus the undeclared single-operator view as the no-regression default.

Competitive/ambition benchmark this session: [Betterworks/Lattice/Workday cascading OKRs and "granular permissions"; Visier Vee "permitted data"; ChartHop RBAC-aware live org model; enterprise RBAC + audit logging as a >2,000-employee buying criterion; ABAC PDP/PEP deny-by-default, need-to-know, row filters/column masking and hierarchical inheritance (Netwrix, Snowflake, TechPrescient, DataSurge, Avigilon); 2026 Simpson's-paradox guidance requiring pooled/standardised rates beside naive means — see RESEARCH §99]. The chosen bar: **no platform in the category names the reader's acting position, derives its scope from the same tree that routes work, or prints the reason a record was withheld**. Bloomberg Terminal × AI co-pilot × strategy consultancy, for any leader from shift supervisor to CEO.

Repository status: **pushed** — `git push origin arena/3772083f-leados` succeeded (`[new branch] arena/3772083f-leados -> arena/3772083f-leados`); **pull request [#128](https://github.com/shahramclaude/Leados/pull/128) opened and OPEN** against `main` from `arena/3772083f-leados` (verified with `gh pr view 128`, state `OPEN`). A follow-up commit rebuilt `LeadOS-standalone.html` against source `755bad0` and carries this changelog; the PR updates automatically from the same branch.

Next up (from roadmap): [1) cryptographic seat attestation — sign each handover with a Web Crypto key held by the departing operator so the append-only log becomes tamper-evident, the honest prerequisite for multi-user deployment; 2) succession as a measured quantity — use `subtreeIds` + item ages to compute whether a span's loss leaves work with no altitude to hold it, rather than self-assessed readiness ratings; 3) per-seat export redaction — apply `projectForSeat` to `exportRedactedJSON` so a board pack exported from a chief seat carries counts only, followed by a real-browser assistive-technology walkthrough].

## 2026-11-02 — The record, cross-examined (Session 114, Schema v81, [ADR-0074](./docs/adr/0074-cross-examination-terminal.md))

A hundred and thirteen sessions built instruments that read the leader's record; every one of them was on the leader's side. `#/sceptic` is the first surface here that argues against the record. Twelve structural detectors across six claim families — completion, assessment, prediction, diagnosis, alignment, capacity — compare two records the workspace already holds (a goal marked done with no observation, a case resolved while its mitigating delegation is open, a band asserted against an empty evidence list, a probabilistic call whose review date passed eight weeks ago) with **no new data entry and no prose reading**. Every finding prints its **refuter**, the one observation that would settle it, and the rule carries that sentence into the task it opens. Verdicts are human, reasoned and append-only — refuted / held / dismissed — and a dismissal is never scored while its rate is printed beside the hit rate. Family rates are Jeffreys `Beta(½ + refuted, ½ + held)` posteriors with 90% intervals, **refused below a declared scored floor** (the mean is shown, never priced) and computed over **every verdict ever recorded**, so a repaired claim cannot make its family look better. Coverage is discovery sampling with a Clopper–Pearson false-alarm bound: **100%** at zero examinations, 28.3% after nine. Freezing refuses to price a claim from an unmeasured family and counts the excluded claims out loud; grading is once, later, only on post-freeze verdicts, by Brier and log loss against the round's own base rate, with negative skill allowed — the demo's round scores **Brier 0.2233 vs 0.2222 (skill −0.005)**, a loss, printed. `RULE-SCP-01..05` open capped cross-examination tasks with `cross-examines` / `finds-against` edges, one governed process decision per failing family per 30-day bucket, a `records-verdict` edge per verdict, grading work, and a blameless question when the dismissal rate crosses the leader's cap — and **no rule records a verdict**. CSV scope #71, Insights bucket `Cross-examination` (`SCP-01..07`), two graph nodes, three relations, fourteen aliases, six axe-clean panels, and no person rated, ranked or named anywhere. Three designs were reversed inside the session and are recorded in the ADR: a tone detector over messages/pulses was deleted, the claim moved from "the leader is overconfident" to "this family of claim is contradicted at rate r", and the nav badge stopped counting findings because a badge that counts findings rewards producing them.

## 2026-11-02 — The promise book, priced (Session 113, Schema v80, [ADR-0073](./docs/adr/0073-promise-solvency-terminal.md))

Six collections carried an obligation date and no screen read them together. `#/solvency` now prices the **forward** promise book: per-source settlement curves with four printing verdicts, `PD(t) = S(1)/S(today − obligation)` with one virtual on-time settlement, a one-factor Gaussian copula with Tasche marginal contributions and the assumption-free interval beside it, the full count distribution `P(N = k)`, measured coverage with Little's Law and a 100/80/60/40% stress curve, repair economics against a declared breach multiplier, an append-only renegotiation ledger whose rows are graph nodes, and frozen readings graded once on the count (RPS, log score) and on every individual promise (Brier against the book's own breach rate). Two design reversals landed inside the session and are recorded in the ADR: the Fréchet ceiling is stored, printed and deliberately never scored, and Brier moved from the joint binary claim to the individual promises. `RULE-SLV-01..05` run on the shared spine and never move a date; the single cross-module write (`renegotiatePromise`) changes the real source date with a recorded reason under a declared cap. CSV scope #70, Insights bucket `Promise solvency`, 13 aliases, 6 axe-clean panels. Building it also found that the Session 111 supply screen's tables never rendered at all (`{key, header}` columns against a `{label, render}` component) — fixed, and now covered by the full-suite demo render.

## 2026-11-02 — The check that was always red: CI made to verify the product (Session 112, [ADR-0072](./docs/adr/0072-ci-verifies-canonical-app.md))

The repository has been telling the truth to itself in one place and lying in another. `README.md` states plainly that the legacy `src/**` Next.js tree **does not build, and did not before this change** — `src/db/schema.ts` is a three-line stub exporting nothing, while quarantined modules import `toolEffects`, `stepRecords` and hundreds more tables from it. [ADR-0007](./docs/adr/0007-legacy-next-tree-disposition.md) froze that tree as an archive-in-place quarantine. And `.github/workflows/node.js.yml` ran `npm run build --if-present` on every push and pull request, i.e. `next build` against exactly that frozen tree.

The result was measured, not assumed: `build (20.x)` failed on `main` at `6afa090` and again on this branch at `d8d1615`, and the matrix's default fail-fast cancelled `18.x` and `22.x` behind it. **`npm test` never ran in CI at all** — the build step died first, at roughly fifty seconds, on `The export toolEffects was not found in module src/db/schema.ts`. Every pull request therefore showed a red X that described a quarantined sales-CRM starter rather than the change under review. A gate that is always red is worse than no gate: it teaches everyone to ignore the one that matters, and it hid the 2,178-test canonical suite entirely.

- **CI now runs the canonical gates, in the same order as `npm run verify:canonical`:** `check:boundary` (ADR-0006/0007 — proves `app/**` imports nothing from the quarantined trees and makes no network calls), `check:links`, `lint` (already ADR-0007-scoped to `app/**`, `scripts/*.mjs`, `tests/app/*.mjs`), then `npm test`. This is not reduced coverage: by ADR-0007 the excluded tree is frozen, non-canonical, and unreachable by any LeadOS user.
  - Why: the product's evidence was never being run in CI. Fixing the tree would be repairing code nobody can reach; pointing CI at the product is the decision ADR-0007 already made and CI had not implemented.
- **The matrix is Node 22.x only — measured, not assumed.** Node 18 was removed (EOL 2025-04-30), and a `20.x` leg was then added and actually run: on hosted run `41393779957` it passed boundary, links and lint and **failed the canonical test suite**. Cause not diagnosed — Actions logs sit on an unreachable blob host, and no Node 21+/22+-only API is in use in `app/`, `tests/` or `scripts/` except `structuredClone` (Node 17+), so the gap is a dependency floor or a `node:test` reporter difference. Shipping an undiagnosed red leg would recreate the exact failure mode this change removes, so CI now claims only the runtime `README.md` documents and the repo has verified. The open question is in `ROADMAP.md`, not guessed at. `timeout-minutes: 120` added (the suite is 135 suites of JSDOM + axe-core, ~51 minutes on two cores).
  - Why: a truthful single-runtime matrix beats an aspirational multi-runtime one that is permanently red.
- **A second, previously invisible defect: the docs gate was Node-22-only.** `scripts/check-docs-links.mjs` imported `globSync` from `node:fs` — an API that exists only from Node 22.0. On the new `20.x` leg the step crashed with "does not provide an export named 'globSync'" rather than checking anything, which is why the first hosted run of the repaired workflow went red on `20.x` while `22.x` passed. Replaced with a plain `readdirSync` walk reproducing `globSync`'s default behaviour (dot-entries not traversed; `node_modules`, `.next`, `.git` skipped): output is byte-identical, 428 links across 180 markdown files. The defect had been unreachable because this step had never run in CI before.
  - Why: a gate that crashes on one supported runtime is not a gate, and the import silently made Node 22 a hidden requirement that `package.json` never declared.
- **The absence of `next build` is now documented rather than accidental.** [ADR-0072](./docs/adr/0072-ci-verifies-canonical-app.md) records the failure, the decision, the consequences and the verification table; README gained a CI paragraph and an addendum on the existing "does not build" bullet.

- **Verification, actually run in this session (not asserted):** `npm ci` 438 packages, 0 errors; `npm run check:boundary` — 309 app ES modules and 111 test suites, 0 quarantined-tree or network leaks; `npm run check:links` — 416 internal links across 179 markdown files, all resolve; `npm run lint` — exit 0, no output; `npm test` — **2,178 tests across 135 suites, 2,178 pass, 0 fail, 0 cancelled, 0 skipped, 50.7 minutes**; `npx next build` — **fails**, confirming the cause. `LeadOS-standalone.html` was rebuilt to a temp path and is **byte-identical** to the committed artifact (sha256 `e745909b…`, 5,954,054 bytes, 308 source modules, schema v79). The new workflow was parsed with a YAML parser and its steps, matrix and `fail-fast` asserted after parsing. No product code was changed in this session, and no real-browser or screen-reader walkthrough was performed — unchanged **[UNVERIFIED]** status.

## 2026-11-01 — Every "ask again later" was a work order: the Evidence Supply Chain (Session 111, Schema v79, [ADR-0071](./docs/adr/0071-evidence-supply-chain.md), CSV #69)

A hundred sessions of statistical honesty produced a product that refuses a great deal. Session 99 refuses a signal family below its floor; Session 100 refuses a unit below its sample floor; Session 103 refuses a delivery class below its at-risk count; Session 108 refuses a policy the record cannot identify; Session 109 refuses to separate two people its instrument cannot tell apart; Session 110 refuses a correlation band below its pair floor. **Every refusal is correct, and together they are the worst possible first quarter for someone who has never managed anyone** — sixty screens saying *ask again later* in six vocabularies, and not one of them saying which gap is worth closing, how long the record would take to close it on its own, or whether it should be closed at all. A refusal that cannot be priced is indistinguishable from a defect.

`#/supply` is the screen that answers it, and it is not another report. It treats the workspace's own ability to judge as a **production system** — a refusal is a work order, evidence is the input, and the arrival rate of evidence is measurable from records that already exist.

- **Six evidence lines, one registry, zero new data entry.** Assumption settlements, calls carrying a recorded decision day, delegations that closed, completed review observations (resolved by the reliability terminal's own harvester so the two surfaces can never disagree about what one observation is), resolved cases and graded forecasts. Each line is measured against the count its consuming instrument needs; adding a seventh is one registry entry plus one adapter, and the report, plan, rules, view, signals and CSV all iterate the registry.
- **The wait is a closed-form posterior predictive, and it refuses twice.** With `n` units across `W` weeks and a Jeffreys prior, the time to `k` more units is negative binomial with `r = n + ½`, `p = W/(W+t)`, so `P(T_k > t) = P(N(t) ≤ k − 1)` — evaluated term by term, no simulation, no factorials. Percentiles by bisection. A line that has **never** produced a unit gets no quantile at all (the number exists — about sixteen years — and printing it would read like a schedule), and the expected wait `W·k/(r − 1)` is refused outright when fewer than one unit has been observed, because an expected wait that does not exist *is* what a starved line looks like.
- **Five verdicts, each with the reason printed on the line.** *Met* (read the answer, stop gathering), *filling* (the record is doing the work), *starved* (waiting is not a plan), *retire*, *never produced*. `retire` is the module's stance and its most contestable one: starved **and** the open work it feeds is older than the declared retirement bar, so the sunk-cost rule (Arkes & Blumer 1985) is applied to *questions* — time already spent waiting is unrecoverable and must not decide whether to keep waiting.
- **The constraint is named, and the word is earned.** Pressure = open demand × (1 − P(fill inside the horizon)). The top line is the constraint; it is called **binding** only when the share of demand sitting on starved lines clears the leader's bar. Below the bar the page prints "the biggest queue, not a binding constraint" rather than borrowing the authority of a word it has not earned. A separate Little's Law read (`L = λW`) turns the whole queue into a clearance time, with its constant-demand assumption printed beside the number.
- **Capture versus wait is priced against a declared exchange rate.** The engine can measure the wait; it cannot price your hour. It asks for `supplyMinutesPerUnit` — the one input it cannot derive — then prints weeks saved per hour against a declared bar. Both figures are on screen, so a leader can disagree with the exchange rate instead of with a hidden assumption.
- **The schedule is bounded by the rope and its optimality gap is printed.** Candidates ranked by pressure per hour, filled greedily inside the declared weekly evidence hours; the fractional (LP-relaxation) value of the same ordering bounds the integer optimum from above and the gap is shown. Greedy is not optimal and the page says so. Lines with no open demand are never scheduled: evidence nobody is waiting for is inventory with no buyer.
- **One probability, and it is the assumption-free one.** A frozen plan quotes the chance that **at least one** planned line clears — headline `max(pᵢ)`, the Fréchet lower bound, valid with no independence assumption at all and therefore incapable of being optimistic; the independence value `1 − Π(1 − pᵢ)` printed beside it and labelled as an assumption, with the difference stored as `reservePct`. Members' required and observed counts freeze with the plan, so grading cannot drift with a later convention change. Graded once, by Brier, from strictly later evidence; an empty window is graded, not excused.
- **`RULE-SUP-01..05` on the shared spine.** A frozen plan opens capped capture tasks with `supplies-evidence` edges and `unblocks-judgement` edges to the real open records the line feeds; a scan opens exactly one governed capacity DACI decision per ISO week with the three Theory-of-Constraints moves printed (feed / elevate / subordinate), one retirement task per starved line per 30-day bucket, **one "read the answer now" task once per line ever** when a line reaches its floor, and grading work for a plan whose window closed ungraded. Marker-idempotent, pausable by `supplyAutoPropagate`; an explicit scan always runs.
- **Telemetry, not a target list.** `SUP-01..06` signals in a new *Evidence supply* bucket, a nav badge that counts only decision-shaped signals, an identity-free brief, aggregate-only **CSV #69** (one row per line, one per plan; blank below a floor, never zero), the `supplyplan` node with three typed relations, six axe-clean panels, twelve route aliases and a demo seed that freezes a plan from a truncated copy of the state and grades it out of sample.
- **Building it found two defects in this session's own first draft, both now pinned by tests:** the task cap counted *effects* rather than tasks (so a two-task plan silently issued one), and `supplyplan` was added to the link collection map but not to the entity-type list, which made every `supplies-evidence` edge a silent no-op — the exact failure `ensureEntityLink` exists to prevent, caught only because the suite asserts the link was written.

- **Verification, actually run in this session (not asserted):** `npm test` (`node --test tests/app/*.test.mjs`) — **2,178 tests across 135 suites, 0 failures**, 53.2 minutes; `npm run lint` (`eslint .`) — clean; `npm run check:boundary` — 309 app ES modules and 111 test suites, 0 quarantined-tree or network leaks; `npm run check:links` — 416 internal links across 179 markdown files, all resolve; `npm run build:standalone` — 5,954,054 bytes, 308 source modules, schema v79, sha256 `7d8a6754…` (inside the 6.2 MB absolute ceiling and the 24,000 B/module density bound). The three failures the first two full passes turned up were all stale assertions, never product defects: 23 files still pinned CSV scope count at 68, `typed-links-lineage` needed a `supplyPlans` fixture and the `supplyplan` query contract, `scale` needed its domain-bound moved from 28 to 29 for the new bucket, and `org-design` still expected `77 → 78` as the last migration step. The `#/evidence` routing test also had to match its nav entry by `href` rather than by the word "Evidence", because the new nav label legitimately contains it. After the final `index.html` metadata edit, `access-audit` + `app.test` + `evidence-supply` + `standalone` were re-run together (76/76 green) and the standalone artefact rebuilt. No real-browser or screen-reader walkthrough was performed — the six panels are covered by JSDOM + axe only, and the visual result of `#/supply` remains **[UNVERIFIED]**.

## Changelog — 2026-11-01 (Session 110 · Schema v78 · ADR-0070)

- **Coupling Ledger (`#/deferral?panel=coupling`): the number the product sold you and never checked.** Since Schema v69 the Deferral Portfolio asks for a pairwise correlation ρ on every premise-sharing pair and prices a correlated joint tail on it, while printing *"the graph identified the pairs; the number is yours to declare."* Honest — and it also meant the most consequential assumption in the deferral terminal was the only one with no read-back anywhere. Sessions 98 and 99 both carried "ρ calibration" as a top-three item and both attached it to a ledger that cannot do it: a Brier reading grades a probability about an outcome, while ρ is a dependence between two processes, and one book-level binary per reading identifies neither.
  - Why: the estimator was already in the data. Every decision has a creation date and, once made, a frozen `decidedOn`, so every call has an at-risk window and a resolution block — and two declared partners either resolved inside the same block or they did not.
- **The estimand is conditional, and the refusals are printed.** Co-resolution *given that both resolved*, in 30-day blocks — not co-movement of value, not a probability that either resolves. A pair with an open member is refused with its reason and **never counted as a non-coincidence**; a pair whose whole common window fits inside one block is refused because a coincidence there is arithmetically certain.
- **A structure-preserving rotation null, read at both tails.** Each call's block rotates inside its own at-risk window, so marginals survive; a call in several pairs keeps **one** placement across all of them, because per-pair p-values are not independent and Fisher's method would be invalid here; the family is deterministic, so the p-value never moves between machines. Because every rotation window is at least as wide as the pair's common window, the null is conservative — it overstates, never understates, the evidence. The upper tail alone could never report an over-declaration (with zero coincidences it returns p = 1 forever), so the deficit tail is the load-bearing statistic. On the demo record the near-independent band returns **coupled / under-declared at lift 2.93**: six pairs declared independent that all resolved together.
- **Declared ρ is a copula parameter, so both conventions are printed.** τ = ρ and the exact normal-theory Spearman transform τ = 2·sin(πρ/6) (Kruskal 1958), reproducing the printed independence rate 1/k exactly at ρ = 0 and reaching 1 as ρ → 1. Where the two mappings disagree about a magnitude, the finding is marked mapping-dependent and **no work is opened on it**.
- **A thin band prints no assessment at all.** Six verdicts → six assessments; below the pair floor the row reads *unresolved*, never *independent*, because that is the single most damaging available misreading and a test pins it. Materiality `max(5 pp, 20% of the model figure)` gates every size claim; the implied ρ is advisory with an explicit `identified` flag and is never applied.
- **Nothing is written back.** The module has no write path to `correlationDeclarations`; it never clamps, defaults, derives or applies a declaration. Frozen reviews store band aggregates, the rotation summary and member ids only — no title, no question, no person, no note — carry one prospective probability from a Laplace-smoothed hazard re-based to the review's own window, and grade exactly once. `RULE-CPL-01..03` write typed `calibrates-coupling` / `measures-coupling` edges, open at most one owned reconciliation task per contradicted band, at most one governed re-declaration decision per ISO week and at most one advisory task per band per week. CSV scope #68 is band aggregates only.
- **Building on shipped code found a real defect in it.** The bivariate normal was computing the CDF for **ρ²** — 0.290 against a true 0.333 at ρ = 0.5 — and a fixed 240-panel quadrature grid was accurate at ρ = 0.3 and badly wrong at 0.95, since the integrand's feature width is √(1−ρ). Both fixed and pinned against the closed form Φ₂(0,0;ρ) = ¼ + arcsin(ρ)/2π to six decimals across ρ ∈ [−0.5, 0.99]. Four more defects came out of building on the module: a verdict helper reading its floors off the wrong object (all `undefined`, so a two-pair band printed `coupled`); a rule returning before its own contradiction branch; a frozen claim re-basing a 90-day hazard onto a 30-day window; and the deferral terminal never having been through axe at all, because it was not in the accessibility suite's route list — a test now sweeps all six of its panels.

## Changelog — 2026-11-01 (Session 108 · Schema v76 · ADR-0068)

- **Counterfactual Policy Terminal (`#/counterfactual`): would a rule have beaten the way you actually decided?** Four families of dated decision points are harvested from records the workspace already keeps — a registered assumption and its human-assessed outcome (arm = a dated observation existed before it settled), a DACI call and its outcome review (arm = decided inside the declared review window), a delegation and its delivery date (arm = a checkpoint was held before the due date), a closed case and what actually happened (arm = mitigation spend was committed before resolution). Reward is 0 / 0.5 / 1 by each family's own declared rule. Nothing is entered for this screen and no arm is ever re-armed.
  - Why: every other terminal grades an object in the workspace; none evaluated the policy that produced the decisions, so a leader had no way to learn whether a habit costs anything — or that it doesn't.
- **Five policies race, four estimators disagree in public.** The recorded behaviour policy is exactly identified, so no model is fitted and no weight is applied — it is the plain mean, agreement 100%, and it gets no interval. Against it: always act, always hold, prequential best-so-far and adaptive-recent, each scored by a shrunk direct method, IPS, self-normalised IPS (Hájek 1971) as headline, and doubly robust (Robins, Rotnitzky & Zhao 1994).
  - Why the bounded estimator leads: an early build led with doubly robust and one decision point on a rarely-taken arm moved it 8pp (spread across the four reached 14.8pp). The spread is now printed as the fragility diagnostic — above 10pp a row is called fragile rather than reported as a finding.
- **Identification is checked before estimation, not after.** Manski (1990/1995) worst-case bounds — assumption-free and family-bounded — bracket every point estimate; the missing fraction, effective sample size and per-arm floors decide whether a row is estimated or refused. On the demo record *always act* is +0.95pp with a 95% interval of [−3.92, +5.69]pp (**no-difference**), while *always hold* (+6.94pp), *prequential best* (−7.57pp) and *adaptive-recent* (−8.26pp) sit inside their own bounds and are **refused-unidentifiable** — three of four alternatives cannot be answered by this record, and the terminal says so rather than extrapolating.
- **Hidden bias is priced, not assumed away.** Greedy nearest-neighbour matching inside a 0.5 SD caliper on pre-treatment covariates only, balance reported as ASMD (Stuart 2010) rather than assumed; exact two-sided McNemar (1947) under a Rosenbaum (1987, 2002) worst-case bound; the design sensitivity Γ* solved by bisection to the Γ that would overturn the finding; and a Hoeffding (1963) confidence sequence so the race can be re-read every morning without spending an unreported false-positive budget (half-width 0.19 at 90 decision points on the demo record).
  - Why pre-treatment only: an earlier iteration matched on observation counts and `ageDays` — both functions of the treatment or its downstream — which collapsed overlap to zero and manufactured a refusal for every policy.
- **`RULE-CFP-01..04` on the shared post-commit spine** (documented by a published propagation contract, marker-idempotent, pausable by `counterfactualAutoPropagate` while an explicit scan always runs): prospective capture before the outcome is known (flagged `late` when a log was written on or after the outcome it describes), immutable one-shot resolution from record dates, at most one governed policy-ruling DACI decision *plus* one blameless process task per ISO week, and reconciliation that drops decision points whose source record was deleted. Frozen evaluations are graded **once** from strictly later evidence and **lapse** rather than being credited when the window closes empty.
- **Surfaces & export:** six axe-clean panels (race, bounds, sensitivity, families, ledger, method), fourteen route aliases, `CFP-01..06` signals, a Counterfactual policy Insights bucket, nav badge, a deterministic identity-free board brief, and CSV scope **#66** (aggregate rows only; every figure blank below its floor and never zero; no record id, title, person or free text).
- **The terminal stays silent on a new workspace.** The floor complaint is for a record that exists and is too thin, not for one that has not started — an empty workspace still gets exactly one setup nudge.

Cross-module links added/updated: `evaluation → decision | delegation | premise | case` (`evaluates-policy`), `decision → delegation` (`grounds-practice`, the blameless process check that grounds a policy ruling); the assumption ledger, DACI reviews, delegation delivery and case actuals are now readable as one evaluation record without re-entry; Decision Tempo prices the policy-ruling DACI decision in the same transaction; Insights ← CFP-01..06; nav badge ← highest CFP severity; CSV #66.

Competitive/ambition benchmark: a 2026-11-01 scan of four independent category sources (Betterworks, PerformSpark, abloomify, Performance Magazine) finds every vendor AI capability clustered on drafting reviews, summarising engagement text, flagging attrition risk, skills inference, OKR tracking and benchmarking. None publishes an off-policy value, a partial-identification interval, an effective-sample diagnostic or a hidden-bias bound. Off-policy evaluation is a mature discipline — Dudík et al. (2011), Swaminathan & Joachims (2015), and 2026 work on OPE under unobserved confounding and nonignorable missingness — but it has never been pointed at a manager's own decision record.

## 2026-11-01 — Session 101

- Added an on-demand Beta-binomial logistic regression preview for whether the explicitly ordered delegation-authority ladder is associated with on-time delivery. It reports posterior uncertainty and refuses sparse/non-varying inputs.
- Added the accessible **Authority model** panel to Borrowed evidence. The preview does not change base forecasts, rules, propagation or personnel decisions. No schema change or dependency.
- Added ADR-0063 and competitive-research notes; updated README, roadmap, session log, canonical index metadata and generated standalone artifact.

## Changelog — 2026-10-31 (Session 100 · Schema v71 · ADR-0062)

- **Borrowed Evidence Engine (`#/credibility`)**: every small sample in the workspace — signal families, assumption criticality classes, delegation authority classes — is now priced with the evidence it shares through a Beta-binomial hierarchy fitted by full Bayes on a deterministic grid (BDA3 §5.3 hyperprior), with a 90% interval, the unit's own weight Z = n/(n+M), the exact probability it sits below its floor, the date its own record takes over, and the outcomes that would flip its verdict.
  - Why: every terminal correctly refused small samples ("too few verdicts"), which left a new manager's first quarter almost entirely unanswered; partial pooling answers early while saying exactly how much of each number is borrowed.
- **Outside view on registration (RULE-CRE-01)**: an assumption declared more confidently than its criticality class has delivered opens one governed outside-view decision per class per week, with typed `outside-view` edges — at `premise.created`, while re-pricing is still cheap. Premises flagged later that week attach to the same open decision.
- **Checkpoint tasks for late-running authority classes (RULE-CRE-01)**: a class decisively below the on-time floor opens one leader-owned task linked to every delegation falling due within 21 days, each carrying its borrowed probability of landing on time.
- **Borrowed precision for thin signal families (RULE-CRE-01 + Signal Integrity Board)**: a family the pool places decisively below the Board's floor, while its own record is too thin, opens one re-tune task; the Board's inventory now shows each thin family's borrowed precision and what a never-judged family inherits.
- **Exchangeability governance (RULE-CRE-02)**: a heterogeneous pool (χ² p < 5% and I² ≥ 50%) or one carried by a single unit (≥ 15 pp and > 1 posterior SD) opens one decision per group per week; the leader's written ruling is obeyed for 90 days, and a refused group is never pooled.
- **Borrowing is graded (RULE-CRE-03)**: every borrowed claim the rules act on is frozen with both forecasters — borrowed and own-data Jeffreys — and scored by Brier on the same outcomes; empty windows lapse; a borrowed miss own data avoided opens a blameless process task; six losing frames open the decision to stop borrowing.
- **What-if and break-even**: hypothetical outcomes re-weight the hyperposterior exactly (no refit), so the terminal prints "5 failures → below" per unit.
- **Schema v71** (additive `70 → 71`): `credibilityFrames`, `credibilityDeclarations`, `credibilityMarkers`, fifteen clamped conventions; new `credibilityframe` graph node and `borrows-evidence` / `outside-view` / `governs-pooling` relations; Insights bucket **Credibility** (CRE-01..05); CSV scope **#61**.
- **Defects found while building it**: a regime named by a significance test (now by mean posterior Z); influence on an absolute threshold (now also > 1 posterior SD); a capped continued fraction for concentrated Betas (now an Edgeworth branch, pinned < 1e-3); shrinkage measured from the Jeffreys estimate instead of x/n; a global `.row` rule that would have re-laid-out three views; same-week premises dropped from the outside-view decision.

Cross-module links added/updated: `credibilityframe → premise | alert` (`borrows-evidence`), `decision → premise` (`outside-view`), `credibilityframe → decision | delegation` (`governs-pooling`, `tracks-followup`), `delegation → delegation` (`tracks-followup`, checkpoint coverage); Signal Integrity Board inventory ← borrowed precision; Insights ← CRE-01..05; nav badge ← severity ≥ 3.

## Changelog — 2026-10-31

- **Deferral Portfolio (`#/deferral?panel=portfolio`, Schema v69, ADR-0060)**: the fifth tab of the Deferral Option Terminal reads the **whole book** of priced open calls per currency instead of one call at a time. Why: under independent exercise the expected total is the sum of the per-call premiums under *any* correlation, so every expected-value surface is structurally blind to the thing that makes a book different from a list — what correlation moves is the joint tail, the concentration of that tail, and how often coupled calls lapse together.
- **Correlation is discovered, ρ is declared.** `sharedPremisePairs` walks the premise graph (`premise.decisionId` + `rests-on`/`tests` links, open decisions only, unordered pairs); a sharing pair with no declared ρ **refuses the joint tail and names the pair**; non-sharing pairs take ρ = 0 by printed convention; ρ outside [−0.99, 0.99] is dropped, never clamped. The declared matrix is factored by Cholesky and a non-PSD matrix is **refused, never projected** onto the nearest valid one.
- **Common-random-numbers Monte Carlo on a daily grid** (convention `deferralPortfolioGridDays`, 1–7): every member follows its own ADR-0059 lattice policy (boundary tabulated per member), pays its own carry and lapses at its own deadline; correlated shocks from the factored matrix. The quoted expected total is **always the exact lattice sum** — the MC mean is printed only as its grid error with the cause named (checkpoint overshoot; the commit *rate* still matches the lattice, pinned ≤ 1.5pp by test).
- **Tail with exact attribution**: per-currency VaR/CVaR at a convention level; **Tasche component contributions** that partition CVaR exactly (no Euler approximation); HHI on premium and on contribution; the top contribution share; the diversification credit as `CVaR(book) − Σ standalone CVaR` with subadditivity and simulation noise told apart. **Premise stress**: per shared premise — members, premium share, joint lapse under ρ vs under independence, and the excess in percentage points; the reading freezes the worst excess.
- **The same forecast discipline as the per-call terminal**: an identity-free frozen reading with one probability — P(any member commits before the window closes); one freeze per currency per day; graded once, after the window, from recorded `decidedOn` dates (undated ⇒ ungradable); Brier against the frozen claim; skill withheld below five grades; a premise that moves **appends** a challenge note and never rewrites a figure.
- **`RULE-DPO-01..04` on the shared spine** (`deferralPortfolioRule`, contract published): a freeze maps the reading to every member call (`aggregates-deferral`) and every stressed premise (`stresses-premise`) and opens one concentration-watch task only past the convention; an explicit scan reconciles stale edges, opens ≤3 grading tasks and turns an expired window with open members into ONE governed decision per ISO week; a graded surprise (Brier ≥ 0.25) opens one blameless process task; a premise breach opens exactly one re-price decision per premise per week. `deferralPortfolioAutoPropagate = false` pauses automation, never an explicit scan.
- **Signals read frozen records, not live renders** (`DPO-01..05`, `Deferral portfolio` Insights bucket): the nav badge never runs the simulation — a signal cites a reading id and a freeze date.
- **Surfaces**: `portfolioreading` typed node with resolver (`?reading=<id>` focuses that record), declare-correlation and freeze dialogs, CSV scope **#59** (per-currency aggregates, BLANK below five readings), six route aliases, and a demo that seeds a coupled book — the two top-priced calls `tests`-linked to the load-bearing premise (a relation attention-market does not read as sharing) plus one declared ρ = 0.45. No forecast is pre-frozen.
- **Defects found and fixed, not waived** (full list in ADR-0060): the correlation matrix was initialised with a zero diagonal (never PSD — every declared book refused); Session 97's boundary extraction reported the *lowest* abandoned node as the abandon threshold, understating the abandon region the moment a simulation followed the policy; the diversification credit sign was inverted against the payoff-terms CVaR convention; a too-few-members refusal masked its true cause; `newDecision` hardcoded the premise rule's tag in every rationale it wrote; the portfolio panel rendered a second `h1` inside the outer page header (caught by the axe test); the `reading` deep-link param was a fake affordance; the reading schema clamped `steps` at 156 while the daily grid produces up to 366.
- **Docs**: ADR-0060 (+ index), `RESEARCH.md` §98, `ROADMAP.md` Session-98 entry, README, `LEADOS-STATE.md`, this changelog and `AI-SESSION-LOG.md`.

Cross-module links added/updated: `portfolioreading → decision` (`aggregates-deferral`, RULE-DPO-01); `portfolioreading → premise` (`stresses-premise`, RULE-DPO-01); `portfolioreading → decision` (`surfaces-impact`, RULE-DPO-02/04); new `portfolioreading` entity type with `deferralPortfolioReadings` collection owner; the panel consumes the per-call terminal's frames, budgets, premise graph and delivery-history σ; premise lifecycle events now propagate into the portfolio ledger in the same transaction as every other premise consumer.

Competitive/ambition benchmark this session: portfolio-CVaR with component contribution is standard in *investment* tooling (Portfolio Visualizer, PortfoliosLab, Asset Lens — Ledoit-Wolf covariance, concentration decomposition), and the academic method for *real-option* portfolios (Cholesky-correlated GBM with per-option optimal stopping; Gamba 2002; Schwartz's LSM abandonment) is decades old — but both live on market data or one-shot calculators (risk-register copulas, engineering-portfolio VaR in AI tool directories). No searched tool prices a leader's *own decisions* as a correlated book from their workspace records, declares ρ over a shared-premise graph, freezes P(any commit) and grades it by Brier. The claim is narrow and local; absence is a search result and **no category-first claim** is made.

Repository status: additive `68 → 69` (empty `deferralPortfolioReadings` / `correlationDeclarations` / `deferralPortfolioMarkers`, ten clamped conventions incl. the grid); no new dependency, no network call, no backend. Verification is recorded in the final session report and in `AI-SESSION-LOG.md`; real-browser and assistive-technology walkthroughs remain **[UNVERIFIED]**.

Next up (from roadmap): the repeated-look error budget with durable statistical review snapshots (owed since Session 95); immutable intake-time covariates and case-severity mix (owed since Session 96); ρ calibration from graded readings once five books exist.

## 2026-10-31 — Session 97: Deferral Option Terminal (Schema v68, ADR-0059)

- **Deferral Option Terminal (`#/deferral`, Schema v68, ADR-0059)**: new module that prices the *flexibility to wait* as an American call instead of pricing only the cost of waiting. Why: Decision Tempo, Cost of Waiting, the Consequence Lab and Information Value are all one-sided, so the product could only ever nag about delay and had no way to say that holding a call open is itself worth a measurable amount.
- **Cox–Ross–Rubinstein lattice** (20–400 steps, American exercise at every node) with the exercise boundary, flexibility premium, real-world commit probability, expected wait and expected carry; Black–Scholes–Merton retained **only** as the validation anchor (convergence pinned by test, 10.4506 reference).
- **Inputs derived from the record, never defaulted**: `V` = typed decision value terms; `K` = budget lines pointed at the decision, with reversible calls pinned to `K = 0` and told to decide now; carry = the workspace's own 12-week erosion price, charged as a cash outflow and never as drift; σ = `1.4826 × MAD(log(realised ÷ assessed))` over settled case-exposure and delivered-effort ratios, root-time annualised from a printed median horizon. Refusals below the observation floor, withholding below the σ floor, and a declared σ accepted only when labelled.
- **Break-evens solved by bisection** on the same tree (break-even carry, break-even σ) and five verdicts — commit now, waiting pays, indifferent under a materiality floor, act or drop, withheld. The premium is explicitly never added to EVSI or to the Cost of Waiting's integrated carrying cost.
- **Identity-free frozen frame** with one prospective claim (`P(commit by deadline)`), graded exactly once after the window against the decision's recorded `decidedOn`; an undated choice is ungradable, a graded frame cannot be deleted, Brier skill waits for five grades, and the 67→68 migration back-fills nothing.
- **`RULE-DRO-01..03` on the shared spine**, marker-idempotent and inside the caller's transaction: typed `defers-decision` link plus exactly one owned boundary watch for `wait`/`indifferent`; scan reconciliation with ≤3 grading tasks and one governed decision per ISO week for windows that expired with the call still open; one blameless process task on Brier ≥ 0.25. `deferralAutoPropagate = false` pauses freeze-driven writes, never an explicit scan.
- **Surfaces**: `optionframe` typed node and resolver, `Deferral options` Insights bucket (DRO-01..04), nav badge, eight route aliases, CSV scope **#58** (aggregate only, means and money blank below five frames, no titles or ids), four panels (overview / boundary / frozen / method) and a freeze dialog with a live preview.
- **Docs**: ADR-0059 (+ index), `RESEARCH.md` §97, `ROADMAP.md` Session-97 entry, README, `LEADOS-STATE.md`, `FEATURES.md`, this changelog and `AI-SESSION-LOG.md`.

Cross-module links added/updated: `optionframe → decision` (`defers-decision`, RULE-DRO-01); `optionframe → decision` (`surfaces-impact`, RULE-DRO-02 expired-window decisions); new `optionframe` entity type and `deferralFrames` collection owner; the terminal consumes Decision Tempo value terms and derived carry, the Cost of Waiting price convention, budget commitments, settled case-exposure ratios and delivered effort ratios; frozen frames are challenged/closed by scan work that lands on the same delegation and decision records as every other module.

Competitive/ambition benchmark this session: real-options tooling exists for capital projects (Mun's Real Options SLS; DPL and TreeAge Pro within decision trees) and public cost-of-delay calculators are one-sided by construction; no searched leadership workspace prices the deferral of an ordinary managerial call from the leader's own recorded stake, commitment cost, carry and measured volatility, nor freezes a timing forecast graded against the recorded decision date. The claim is narrow and local; absence is a search result and **no category-first claim** is made.

Repository status: additive `67 → 68` (empty `deferralFrames` / `deferralMarkers`, nine clamped conventions); no new dependency, no network call, no backend; the standalone artifact was regenerated and its portability suite re-run; `DELIVERY-MANIFEST.json` is untouched because it documents the quarantined legacy world-model build, not the canonical app. Verification is recorded in the final session report and in `AI-SESSION-LOG.md`; real-browser and assistive-technology walkthroughs remain **[UNVERIFIED]**.

Next up (from roadmap): portfolio deferral with declared correlation between calls; the repeated-look error budget with durable statistical review snapshots (owed since Session 95); immutable intake-time covariates and case-severity mix (owed since Session 96).

## 2026-10-31 — Session 94: Drift decomposition — did work stop finishing, or start being dropped? (ADR-0057, RULE-SURV-07, SURV-09/10, no schema change)

- The calendar-drift guardrail pooled every exit; it now decomposes. `kaplanMeier` emits **both** Aalen–Johansen incidences (completion and abandonment), so survival + the two incidences partition every cohort exactly, and the change in "still open at day 30" is the completion change plus the abandonment change with a computed zero residual. Each cause is compared across the fixed cohorts with a landmark Wald test (delta-method variances), Holm-controlled over the fixed family of six classes × two causes; the Pepe–Mori integrated difference prints as a p-free effect size. A cause below five pooled events is refused as counts. At the 0%/100% boundary the Wald variance is truly zero: identical shares are p = 1, differing shares fall back to Fisher's exact test only for verified fully-observed cohorts, otherwise refused. Nine verdicts — including **substitution**, the one-for-one swap of finishes for give-ups at unchanged exit speed that no any-exit or cycle-time view can see.
- **Defect found and fixed, not waived:** the cumulative-incidence variance shipped in Session 89 was a mis-transcription (Y² for Y(Y−d), total exits for cause exits, missing −2 cross term, final F referenced at every step) answering 0.0048 lumped and 0.0344 spread where the provable multinomial value is 0.012. Replaced with the three-term delta-method form — exact at the multinomial anchor F(1−F)/n in both configurations, now a pinned regression test. Session 89's incidence bands and quantile brackets inherit the correction; frozen readings store probabilities and are untouched.
- `RULE-SURV-07` on the shared spine: exactly one drift decision per class per week, framed by the component that moved (intake review with ≤10 recent abandonments linked as exhibits; completion review about blockers), two-way precedence with `RULE-SURV-06` (attaches to the generic review if it fired first), one owned investigation task, ≤20 `informs` links to open work, and a positive-deviance capture task on significant improvement. `SURV-09` (adverse attribution) and `SURV-10` (silent substitution) join the Delivery-survival insights bucket; the brief gains an attribution line; CSV scope #53 gains 12 decomposition columns, blank below floors; the Classes panel gains the decomposition table and the Method panel the named non-claims (no Gray test, no causality).
- 19 new tests in `tests/app/drift-decomposition.test.mjs`, including Fisher pinned to published values and a real `scanSurvival()` commit persisted across reload. No schema change, no new dependency, no network call.

## 2026-10-31 — Session 90: Cost of Waiting Terminal — pricing the queue the workspace already keeps (Schema v64, ADR-0053, RULE-WAIT-01..05, WAIT-01..06, CSV #54)

- New `#/wait` module. A leader declares one weekly price per class of work (cap 24; fail-closed normalizers drop negative or non-numeric amounts with a warning); a decision with linked committed money is priced **derived** — value at stake ÷ the 12-week erosion window, linear Reinertsen CD3 — and an item with no price is **unpriced, never zero**.
- Every open item is read against the Session 89 survival curve: `stillOpenProbability` = S(age+Δ)/S(age), refused below the at-risk floor with the count and a reason, flagged `beyondEvidence` past the longest observation. Wait-horizon scenarios (1/2/4/8 weeks) print P(still open) and expected additional cost = price × weeks × P per row; totals are **per currency and never pooled**, with top-item concentration. Rows are ranked priced-overdue first, where overdue means past the class's own completion median.
- Weekly **exposure certificates** (`waitExposures`, cap 60, newest first) freeze the priced queue, totals, scenarios and a review date — navigable via the new `exposure` typed node and SYSTEM_GENERATED `prices-delay` edges with resolver `#/wait?panel=certificates&exposure=<id>`.
- `RULE-WAIT-01..05` on the shared spine before decision tempo, marker-idempotent per ISO week: stale edge reconciliation, the weekly certificate, ≤40 exposure→item links with the price in the summary, exactly one triage DACI decision per currency per week above the declared threshold, ≤5 owned delegations (+3d, recorded owner only), ≤3 declare-a-price tasks per unpriced overdue class (+7d). `waitAutoPropagate=false` pauses automation; an explicit scan always runs and is idempotent (`changed: false` on rescan).
- Signals WAIT-01..06 in the new `Cost of waiting` insights bucket; nav badge, four route aliases; CSV scope #54 (per class × currency rows plus ALL, opaque C01.. codes, scenario figures blanked below the evidence floor, covered counts always shown); demo seeds three USD prices and deliberately no pre-frozen certificate.
- Additive `63 → 64`: `waitPrices`, `waitExposures`, `waitCostMarkers`, clamped `wait*` conventions. Empty collections are the correct upgrade state — no price or certificate is invented for existing workspaces.
- Found and fixed by the new suite, not waived: a negative weekly amount clamped to 0 instead of dropped (now fail-closed); a mis-dated hand fixture caught by the KM assertions; a jsdom-realm array in the axe assertion (now `Array.from`, colour-contrast disabled as in the survival suite).
- 43 new tests in 12 suites; suite-wide pin sweep 63→64 (61+2 files), CSV 53→54 (17 files), `waitExposures` fixture and `exposure` route contract in the typed-link lineage suite. Full suite **1,623/1,623**, lint clean, boundary 227 modules / 91 suites / 0 leaks, standalone **4,658,027 bytes at schema v64** (226 modules) with its 7 portability tests green.

## 2026-10-30 — Session 89: Delivery Survival Terminal — censoring, competing risks and the hazard of waiting (Schema v63, ADR-0052, RULE-SURV-01..05, CSV #53)

- New `#/survival` module. One curve over six source collections — funded portfolio work, cases, requisitions, change programmes, delegations, decisions — with no new data entry to get a first reading. Kaplan–Meier (Greenwood variance, log–log band) keeps open items in the risk set; **Aalen–Johansen cumulative incidence** splits completion from abandonment as competing risks, and both the naive complement and the corrected incidence are printed with the reason they differ. Plus Nelson–Aalen hazard by elapsed-time bucket with a Katz log-rate ratio, Mantel–Cox log-rank on one degree of freedom, conditional completion over a forward window, `medianExit` that says *not reached* instead of extrapolating, and an **age percentile** labelled as a share of past exits and explicitly not a probability.
- Frozen readings are falsifiable commitments (per-item probabilities, the at-risk counts they were conditioned on, the curve digest, a review date) scored once with Brier against the class's own base rate, i.e. a skill score, withheld below five settled items. Refused in the command layer: an empty prediction set, a past review date, a horizon outside 1–180 days, a second grading, deletion of a graded reading.
- `RULE-SURV-01..05` on the shared spine, marker-idempotent: typed `endangers` edges plus one owned task per doomed item (recorded owner only, max 5); one repair task when a graded reading lost to its base rate; exactly one DACI decision per class per week when abandonment reaches the declared share of exits; one task per returned delegation with no recorded reason; one grading task per stale reading. `survAutoPropagate=false` pauses automation, never an explicit scan.
- Additive `62 → 63`: `survivalReadings`, `survivalMarkers`, eight clamped `surv*` conventions. Empty readings are the correct upgrade state — a prediction cannot be back-filled without becoming a prediction made after the answer was known.
- Wiring: `reading` typed node with an `endangers` relation and a resolver; nav entry, alias table and attention badge; the `Delivery survival` Insights bucket; CSV scope #53 (22 aggregate columns, figures blanked below the evidence floor); the rule registered before decision tempo so every decision it opens is priced in the same atomic write.
- Found and fixed by the new suite, not waived: a zeroed PERT triple read as a 0-day estimate (now absent, never zero); `closedOn`/`abandonedOn` read off change records that only keep `anchoredOn` (abandoned changes are censored and counted as `abandonedUndated`); and `'reading'` filed as a link *relation* instead of an *entity type*, which silently produced zero edges for RULE-SURV-01.
- 57 new tests. Suite-wide pin sweep 62→63, CSV count 52→53 in 17 files, Insights domain ceiling 22→23, and a `survivalReadings` fixture plus a `reading` focus-route assertion in the typed-link lineage suite.

## 2026-10-30 — Session 84: Autopilot Studio — governed operating agreements (Schema v58, ADR-0049, RULE-AP-01, CSV #50)

- New `#/autopilot` module. A leader declares standing instructions in a closed vocabulary (4 sources, 14 events, 5 actions, 7 template tokens); each agreement rehearses against current records on a disposable copy and activates only by approving that exact preview (digest-bound token over definition + workspace revision + rehearsal).
- `RULE-AP-01` evaluates first on the spine so conditions see the record as the action left it; one `case.created` fans out into a decision, owned task, coaching prompt, joined assumption and stakeholder drafts with typed `automates` provenance, while built-in rules co-fire (RULE-DEC-01 declines via its existing linked-decision guard; RULE-DEL-01 still advances the case). Desired-state markers reuse across re-fires; identical facts skip silently.
- Hard refusals throughout: nothing sent, no option selected, no personnel effects in the vocabulary; missing owners and full queues block whole runs with ledger entries and pauses; 24-record batch ceiling rolls back with a receipt; agreement output cannot chain into another agreement; unprovable stored activations pause on load.
- `Autopilot` Insights bucket (`AP-01`), nav badge, CSV scope #50 (codes/counts only), deterministic brief, two demo drafts, 27-test suite, `#/autopilot` axe-gated. Additive `57 → 58`; no new runtime dependency or network call.
- Fixed: Attention Market brief download passed positional args to an object-parameter `downloadText` (would have saved "undefined"); now uses the object form with a fallback toast.

## 2026-10-29 — Session 73: The Implementation Fidelity Ledger (Schema v50, ADR-0038, RULE-FID-01..05, CSV #44)

- New `#/fidelity` module. A leader declares a plan before delivery (intervention type, population, planned units, window ≤364 days); five weighted stages are scored — reach .25, dose .30, quality .25, maintenance .10, adaptation .10 — and every stage prints its own gaming route.
- Four stages are derived from dated typed records with an explicit standard (1:1 carrying written notes; SBI-complete feedback; a delegation with a dated check-in; a key result that moved). Adaptation has no instrument and the page says so instead of substituting a proxy.
- The second reading is a dated human attestation kept beside the record reading, never averaged with it. A contradicting verdict requires a written reason and is classified optimistic/conservative/lenient/strict/mismatched.
- Exposure is multiplicative (reach × dose × quality); grading is refused below 60% coverage (`insufficient`, not a low score). Attestation calibration reports concordance and over-claim rate with Wilson 95% intervals, withheld below three verdicts.
- `RULE-FID-01..05` on the existing post-commit spine: typed `measures-delivery` links, a disagreement prompt, one repair decision plus one owned delegation per materially under-delivered settlement, one overdue-checkpoint task per plan, and a frozen `implementationSnapshot` at Impact scoring. Marker-idempotent; `fidelityAutoPropagate: false` pauses automation while an explicit scan still runs.
- Bloom/LATE dilution correction: ITT, per-complier estimate (ITT ÷ exposure) and inflated MDE are frozen together; withheld below 10% exposure; `null` (never `0`) when the evaluation could not fit a counterfactual.
- `RULE-IMP-02` now reads measured exposure: a contradicted but materially under-delivered study opens *repair delivery or stop on a weak test* rather than a stop decision.
- Additive `49 → 50`; demo cleanup keeps declared plans, removes demo plans and nulls dead pointers without rewriting a frozen settlement; CSV scope #44 and the `Implementation fidelity` Insights bucket are derived telemetry only.
- Fixed two defects the new tests found: a failed evaluation's placeholder `0` was being reported as a diluted effect of zero, and the overdue-checkpoint idempotency marker was written to `support` but probed in `title`, which would have duplicated the task on the second scan.

## 2026-10-28 — Session 55: Assumption-Aware Scenario Tails
- `#/premises?tab=tails`: paired CRN Monte Carlo (baseline vs premise-coupled P50/P80/P90), leave-one-out premise attribution, correlated-evidence pseudo-replication flags, TAIL-01..03 Insights signals, tail brief, CSV scope #37. Derived on Schema v36 — no migration. 864/864 tests, standalone rebuilt.

# Changelog

## 2026-10-30 — Session 76: The Structural Design Terminal (Schema v53, ADR-0041, RULE-ORD-01..05, CSV #47)

- New `#/orgdesign` module: the one decision every other screen assumes. Reporting structure is
  derived from the roster, not declared twice — span is out-degree, layers the longest path,
  coordination channels `n(n−1)/2` per unit with the manager included (Graicunas 1933; Brooks 1975).
  A cycle, a self-managed record and a dangling manager are reported and cut, never quietly repaired.
- The decision queue is measured per manager from that manager's own completed commitments:
  arrivals from their completion count in a declared window (Little 1961 in steady state), `Ts` the
  median of their own spans, `Cs` their own coefficient of variation, wait from Kingman's (1961)
  diffusion approximation. Below three completions the queue is `insufficient`; at ρ ≥ 1 the wait is
  `null`, because an unstable queue has no finite expectation.
- Coordination is priced from the latest effective merit cycle at the manager's loaded hourly rate.
  A unit with no recorded pay is `unpriced` and the printed total carries its priced share, so a
  partial sum can never be read as the whole.
- A design is a draft until committed. `commitOrgDesign` refuses a missing owner, no moves, a move
  that changes nothing, an archived or missing person, a self-report and a reporting cycle; then it
  applies every move to `people.managerId` and freezes the snapshot — measured and modelled values
  stored separately — in the same transaction, recording each previous line.
- `revertOrgDesign` restores exactly the line recorded at commit and leaves alone any line someone
  changed again, reporting how many it skipped rather than overwriting a later decision.
- Candidate designs are compared on four minimised objectives as a Pareto set. No weighted composite
  is computed, because it would decide the trade-off the leader has to decide.
- `RULE-ORD-01..05`: typed `structures`/`resizes` provenance; **one** DACI decision about the
  mechanism when a unit is still over the declared band plus one owned scope task on its manager —
  never a decision that moves one named report to one named manager; at most three blameless prompts
  for the people whose line or depth moved; one dated outcome review that restates the frozen
  prediction; and a scored median absolute percentage error, withheld below the declared floor.
  Marker-idempotent; `orgAutoPropagate: false` pauses the automatic side while an explicit scan runs.
- Additive `52 → 53` with five clamped settings. CSV scope #47 exports counts and ratios under opaque
  positional design codes — no name, identifier, label, note, individual pay or individual wait —
  and still exports a live reading when no design exists. Insights gains a `Structural design`
  bucket (`ORD-01..06`). Demo cleanup drops moves for removed demo people and keeps a frozen
  snapshot verbatim.
- Fixed two defects the new suite found: the commit-time rule could never see who had moved (it
  re-simulated a roster that the same transaction had already changed, so `delta.moved` was always
  zero and no moved-person prompt was ever queued); and the idempotency marker on a 1:1 talking
  point was appended *after* a 240-character truncation, so a long prompt silently lost its marker
  and would have re-appended itself on every scan.


## 2026-10-29 — Session 74: The Merit & Pay-Equity Terminal (Schema v51, ADR-0039, RULE-COMP-01..05, CSV #45)

- New `#/merit` module. A cycle declares a budget (amount or share of payroll), one comparison dimension, an owner and dated pay rows; bands are declared per level and a band that does not form a range is dropped with a warning rather than repaired into invented money.
- Three policies are priced against the same budget, each with spend, budget use, min/max increase, band violations, the four-fifths ratio it would produce, expected departures, retained value and **regret**: across the board, performance-weighted (with an explicit fallback weight for missing reviews), and a marginal-retention-value greedy allocator over replacement cost × modelled departure reduction.
- Twofold Oaxaca–Blinder on log pay over level, tenure, last rating and an explicit rating-missing term. The interval on the adjusted gap is the group coefficient's own standard error with a Cornish–Fisher small-sample t; a percentile bootstrap was implemented, measured and **rejected** because at 8+8 people it measures which level cell a resample emptied.
- The four-fifths rule runs over the *decision* (favourable = at or above the cohort median), carries Wilson intervals, reports `reliable: false` below the sample floor, and the page states that a screen is not a legal conclusion.
- No protected characteristic is stored. The audit runs on a declared comparison — hire origin or reporting line — with three fixed caveats, including that an unexplained gap is not proof of discrimination.
- The retention hazard is four printed terms (band deficit, peer deficit, recorded concern) with no coefficient fitted to the user's data; finalization freezes per-person probabilities, `person.archived` resolves them, and the Brier skill score against the observed base rate is withheld below five outcomes and printed as `null` when the base rate has no variance.
- `RULE-COMP-01..05`: typed `compensates` provenance; **exactly one** DACI mechanism decision plus one owned evidence task and one blameless preparation question when the audit is flagged — never an individual adjustment; one relative-pay task per cycle with `compares-pay-with` links; one dated outcome review; a resolved prediction on departure. Marker-idempotent; `compAutoPropagate: false` pauses automation while an explicit scan still runs.
- Additive `50 → 51`; demo cleanup removes demo cycles and rows and nulls dead pointers while keeping a frozen audit; CSV scope #45 exports ratios, counts and grades under opaque cycle codes and no salary, name, note or label; Insights gains a `Merit & pay equity` bucket (`MER-01..07`).
- Fixed six defects the new suite found: `money(null)` returned `0` via `Number(null)`, silently turning an unrecorded salary into a real zero in compa-ratios, budget arithmetic and the frozen audit; the policy comparison used the last-applied proposal as its baseline; the peer median was recomputed inside each policy, making every policy its own reference; the bootstrap interval above; the page defaulting to a frozen cycle with a live draft beside it; and the finalization guard order, which let the budget refusal mask a blank decision.


## 2026-10-28 — Correlated absence stress & hand-over briefing readiness (Schema v46, ADR-0033)

- The exact stall distribution assumed independent items. Removing that assumption on the
  demo's own records lifts the expected stall count from 16.88 to 19.07 and P90 from 19 to
  25 — a 31.6% tail lift. Both models are now reported side by side, with the lift printed,
  and never blended.
- Added `simulateCorrelatedAbsence`: one shared cause per window takes the deputies recorded
  on one team offline together (adjustable 0–100%, default 25%), each deputy is individually
  away with 8%-per-14-days odds, and cover falls back to the next eligible deputy at 75% of
  their recorded fit instead of to nobody. Coverage is now `fit × P(at their desk)`.
- Fixed a real defect: the old `pCover = fit × availability` formula made an absent deputy
  *increase* coverage, so a stress test built on it would have reported less exposure after
  removing the person the plan depends on. A test now pins that 100% absence means certain
  stalls.
- A single-team (or unrecorded-team) deputy pool is reported as a finding — `cluster.singleTeamPool`
  with a rendered label — rather than left looking like a modelling accident.
- Added `coverConcentration`: distinct eligible deputies per item at the evidence floor, so a
  plan naming one of three eligible deputies is not mistaken for a single point of failure.
- Fixed a modelling error: a person was eligible to cover contact with a stakeholder whose
  record is themselves, and received a relationship bonus for it. Self-cover is now refused
  with a stated reason, and relationship credit requires a typed `stakeholder → person` link.
  Correcting it moved the demo plan from 53.5% to 46.5% criticality coverage — the honest number.
- Added zero-write deputy-unavailability stress (`stressAbsence`): pick up to three deputies,
  re-derive the window from the remaining pool, and see which items lose cover. Deep-linkable
  via `#/handover?stress=<ids>`; writes nothing.
- Added `handoverReadiness` + `LCS-05`: a commissioned hand-over is only "briefed" when each
  cover delegation has a recorded check-in or is completed. Inside seven days, an unacknowledged
  cover delegation raises a severity-4 signal. The readiness card falls back to the newest
  commissioned hand-over, because the plan that needs briefing is the future one.
- Settings: `continuityCommonCausePct` (0–100, clamped) with a `45 → 46` migration. Existing
  drills are never rescored or re-frozen — rewriting them would make the ledger retroactive.
- Verification: 1,136 tests across 69 suites (5 new in this increment), lint, canonical
  boundary, docs links, diff check and the offline standalone rebuild.

## 2026-10-28 — Leader Continuity Drill (Schema v45, ADR-0032, RULE-LCS-01..03)

- Added `#/handover`: a simulation of the leader's **own** absence, built from dated
  obligations already in the record (open decisions and decision reviews, case review
  dates, 1:1s past cadence, active delegations, stakeholder contacts, goal check-ins).
  Nothing is inferred from a calendar, mailbox, sentiment or presence signal.
- Every item carries a printed criticality basis and one of three delegability states:
  `delegable`, `shared`, or `held` (a performance conversation, or an irreversible
  call above the big-bet threshold). Held work is never covered; it is shown as
  uncovered with the reason and raises a structural signal.
- Two distributions, one arithmetic: the stall **count** is an exact Poisson-binomial
  convolution (mean, P50/P80/P90, P(none)); currency exposure is a seeded Monte Carlo
  over the same per-item probabilities with P90 and coherent expected shortfall at 90%.
  Currencies are never summed, and unpriced critical items are counted, not valued.
- Minimum cover is an exact branch-and-bound set cover over (deputy × stall class)
  bundles with an explicit setup-minutes cost and a disclosed node cap; coverage is
  measured over **every** critical item's criticality weight, so uncoverable work can
  never be counted as covered. Deputy fit is componentised recorded evidence, never a
  performance rating and never exported by name.
- `RULE-LCS-01` commissions the plan transactionally: one four-option DACI decision,
  up to four owned delegations with explicit authority due before the absence, typed
  links to every covered record, and at most one blameless 1:1 prompt per deputy.
  Stale `planKey`/`windowStart`/`expectedRevision` is refused; duplicate commissioning
  is idempotent at the window level.
- Drills freeze the prediction, then score it: Brier, base rate, Brier skill score,
  precision/recall and a Wilson interval, withheld to counts below five predictions and
  three closed drills. `RULE-LCS-02` opens a rebase decision when measured skill is
  negative; `RULE-LCS-03` opens a structural decision when convention blocks cover.
- Added settings with clamps (`continuityHorizonDays` 1–90, `continuityMinFitPct`
  1–100, `continuityAutoPropagate`), an additive `44 → 45` migration with an empty
  drill ledger, LCS-01..04 Insights signals in `Leader continuity`, CSV scope #41
  (opaque drill/item codes, no titles, names or notes), a deterministic brief and a
  Today badge.
- Verification: 1,131 tests across 69 suites (10 new continuity tests, including exact
  vs Monte-Carlo agreement, held-never-covered, stale-plan refusal, window idempotency,
  migration, CSV opacity and JSDOM + axe); lint, canonical boundary, docs links, diff
  check and the offline standalone rebuild all pass.
- Deliberately rejected: calendar/presence capture, an aggregate "resilience score",
  an LLM handover narrative, storing scores in the record, and seeding demo drills to
  make the ledger look calibrated.

## 2026-10-28 — After-action record corroboration (Schema v44, RULE-AAR-04)

- Added dated, distinct workspace-artifact references for applied lessons, with live snapshot/state/date checks and stale-link disclosure.
- Added `lesson — corroborates → artifact` graph links, a counts-only-below-five corroboration measure, a stale-artifact signal, and a private-narrative-free 30-day sustainment delegation when an active owner exists.
- Historical Schema v43 “applied” claims remain unverified. Corroboration is record presence, not semantic validation or causal effectiveness.
- Added official Lattice and 15Five product-release research, ADR-0031, audit, roadmap and README coverage; rebuilt offline standalone.

## 2026-10-28 — Mitigation robustness & evidence gate

- Added exact interval Savage minimax regret with independent event-probability bounds,
  shared horizon, continuous loss extrema, dominance/evidence-sensitive verdicts,
  break-even thresholds, information ceiling and narrative-free numeric export.
- Added a bounded illustrative probability frontier, explicit model/safety limitations,
  and an open-case **Stress-test mitigation** entry point into Automation control room.
- Added `RULE-ROB-01` to the generalized engine: explicit human commissioning creates
  linked DACI, owned verification and blameless coaching work; automatically published
  record events also reach Decision Tempo. No mitigation is applied or communication sent.
- Added exact local revision/evidence guards, reload-safe duplicate prevention,
  queue preservation, save-status disclosure, and 17 targeted tests including one-write
  cross-module propagation, rollback, encrypted reload and structural accessibility.
- Removed two pre-existing fixed-delay UI test races by waiting for observable tempo-route
  and disclosure-dialog state instead of assuming rendering completes in 15/30ms.
- Updated research, roadmap, audit, ADR-0029 and offline standalone. Schema v43 unchanged;
  no new runtime dependency or service. Cross-tab transaction isolation, real-world
  outcome calibration and visual/screen-reader verification remain open.


## 2026-10-28 — Close 1:1 follow-ups from preparation

- The prep sheet can close completed prior 1:1 promises and manager-owned check-in follow-ups
  through existing mutation APIs; it hides the controls when printing and refreshes the open list.
- Preserves the distinction between a manager's status update and a commitment confirmed in a
  held 1:1 (`completedInMeetingId` remains empty); an eight-second undo reverses accidental
  completion; no schema or export format change.
- Added workflow coverage for successful completion, stale-action failure, accessibility and
  localStorage reload; conflict and anonymous-pulse exclusions are unchanged.

## 2026-10-28 — After-Action Review & Learning Ledger (Schema v43)

- Added the `#/learning` terminal (ADR-0028): one dated review per closed case, change, decision or
  delegation, with the intention and the outcome pre-filled from the record that froze them, and a
  human-authored cause that is never inferred.
- Added eleven lesson classes and a change ledger where `applied` / `dropped` require a dated human
  note; `changeType: 'none'` is stored as an observation and never counts toward the applied rate.
- Added measured recurrence over distinct events and the unclosed-recurrence finding: a class that
  repeats while the change committed after the first sighting is still open.
- Added `RULE-AAR-01..03` on the shared post-commit spine (auto-draft on close, one owned
  delegation / DACI decision per committed change, one close-or-drop decision per repeating class),
  plus LEARN-01..06 Insights signals, a Today card, a deterministic plain-text brief and an additive
  v42→v43 migration that invents no review.
- Coverage, applied rate, median time to apply and the composite index are withheld below their
  sample floors and print their denominators; undated closures are excluded and counted.
- Fixed a pre-existing defect in `buildForm`: it never returned `setErrors`, which three dialog
  modules already call, so a rejected submission threw instead of showing its field error.
- No CSV export scope: the free text here is the most sensitive prose in the workspace.

## 2026-10-28 — Connected response & Watch integrity (Schema v40)

- Added a bounded derived-event queue with transactional rule savepoints, automatic case /
  decision / delegation / portfolio lifecycle events, deduplication and explicit failure logging.
- Connected confirmed Watch alerts and breached resilience drills to the shared case lifecycle;
  optional validated response context powers actual decisions, delegations, goals, capacity,
  proposed timeboxes and unsent briefs. Added safe retries and v39→v40 migration.
- Withheld probability-based case loss, ROI, occurrence calibration and scenario/Pareto values
  when FMEA is unrated; retained recorded PERT magnitudes and stopped pre-filling human ratings.
- Corrected unsupported FDR / expected false-count claims; excluded legacy, demo and late
  forecasts from skill; froze first observations and report per-series comparable errors only.
- Withdrew the Session 59 demo skill and the claim that the old Watch case already cascaded.
  Current test/build/sync details are in `AI-SESSION-LOG.md`.

## 2026-10-28 — Early-Warning Watch (historical v39, corrected)

The v39 Watch introduced alert screening, human verdicts, governors and a prediction ledger.
Its original statistical and cascade claims are superseded by the v40 correction above.


## 2026-10-27 — Outcome-scored premise sensor calibration (Schema v36)

- Added a human-authored, append-only held/failed/inconclusive outcome ledger for assumption premises.
- Added sensor reliability diagnostics: Brier score, forecast-vs-realized calibration gap, 50%-threshold accuracy, and PSI forecast-mix shift; metrics are withheld below five settled premises and PSI below ten per cohort.
- Added `RULE-PREM-05` typed lineage from outcomes to premises and linked decisions, opaque CSV scope #36, point-in-time outcome filtering, and demo-clear pointer repair.
- No automatic truth labels, no automatic likelihood-ratio tuning, no new runtime dependency or network path.
- Verification results: see the Session 54 entry in `AI-SESSION-LOG.md`.


All notable changes to LEADOS are documented in this file.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and this project
uses [Semantic Versioning](https://semver.org/).

**Honesty note (Part 19):** this changelog was curated retroactively. The repository snapshot
used to write it contains no prior git history, no prior tags, and none of the stale status
reports referenced by earlier planning documents (`APP-STATUS-REPORT.txt`,
`APP-CAPABILITY-REPORT.md`, etc.) — see `docs/CONSISTENCY-SWEEP.md` for the full accounting. This
file therefore starts at the first version that can be verified against real code:
**v0.1.0**. No entries describe work that cannot be pointed at a file.

## [Unreleased]

### Added — Session 58: Structural Capital Allocation (`#/capital`, Schema v38, RULE-SCA-01..04, CSV #39)
- New local-first terminal that spends a **fixed effort-week budget** (1–40, default 12) across six
  structural levers by marginal return on the binding constraint, with a bounded integer allocation
  and a pairwise complementarity pass. Effort costs are a published convention book, printed with
  every plan, not a hidden weight.
- **Exact Shapley attribution** over every coalition of the funded levers (`≤ 64` model evaluations,
  no sampling), with the efficiency gap printed, share-of-gain percentages, and a first-class
  substitute/complement **pair-interaction** table reconciled against the solo scores.
- **Seeded Savage minimax regret** over 32 lognormal parameter draws (seed 42, CV 0.25) against the
  plan, the six named playbooks and doing nothing, with P10/P90 bands.
- **Trust ladder** `unvalidated → refuted → provisional → backtested → validated`; only rank ≥ 3 may
  be called *actionable*, and every grade lists the evidence that would move it. The demo reports
  *refuted* and the UI says "comparative".
- **Out-of-sample checkpoint scoring**: the do-nothing baseline is frozen beside the prediction at
  adoption, so a later observation yields a skill score (`1 − model error / naive error`), with the
  skill withheld when no baseline was frozen and pooled skill suppressed below n = 2.
- Post-commit propagation on the existing spine: `RULE-SCA-01` exactly one DACI commitment decision
  (Shapley rows as options, trust grade in the question) priced by Decision Tempo in the same
  transaction; `RULE-SCA-02` exactly one owned checkpoint delegation; `RULE-SCA-04` typed `scores`
  lineage; `RULE-SCA-03` exactly one re-baselining decision when pooled out-of-sample skill turns
  non-positive. `capitalAutoPropagate:false` pauses checkpoint governance only — an explicit
  adoption always fans out.
- `SCA-01..05` signals merged into Insights (own domain, `DOMAIN_ORDER`), opaque CSV scope **#39**
  (3 rows × 28 columns, no names, titles or notes), deterministic board brief, and a demo seed with
  one draft portfolio and one genuinely scored checkpoint (skill 0.85).
- Additive v37 → v38 migration: `capitalPolicies`, `dynamicsCheckpoints`, five `capital*` settings.
  Normalisers repair rather than trust: weights are clamped and renormalised, the budget is bounded,
  an adopted portfolio without a date is demoted to draft, an off-roster owner is cleared, unusable
  or duplicate checkpoints are dropped, and every stored skill is re-derived on load.
- **Fixed a namespace collision found during verification:** the new rules were initially numbered
  `RULE-CAP-*`/`CAP-*`, colliding with Capacity & Flow (98 catalog rows, 94 unique ids). Renamed to
  `RULE-SCA-*`/`SCA-*` and added a catalog-uniqueness test.
- Verification: 945/945 tests across 58 suites (capital suite 39/39), ESLint clean, boundary 129
  modules / 58 suites, 144 docs links resolve, standalone rebuilt (2,741,516 bytes, schema v38).


### Added — Session 53: Premise Sentinel / Assumption Ledger (`#/premises`, Schema v35)
- New local-first decision-continuity terminal: pre-register load-bearing assumptions
  with a DACI decision anchor, signpost owner, falsification signpost, Cromwell-clamped
  prior (5–95%), leader-owned watch/breach thresholds, evidence half-life, review date
  and typed evidence sources. Register/evidence/review dialogs preview belief impact and
  validate every input; retirement and reaffirmation are dated human acts.
- Bayesian log-odds evidence engine: dated, directional likelihood ratios decay by
  `2^(-age/halfLife)` (5% floor), produce a posterior with confidence and information
  gain in bits, and show Wald-style SPRT support/challenge boundaries. Priors and LRs
  are transparent conventions; the UI explicitly refuses to call heterogeneous
  leadership evidence a formal significance test.
- Eight declarative sensors (`PREMISE_SENSORS`) over rated FMEA cases, stakeholder veto
  stances, TTS/TTR continuity gaps, budget encumbrance, settled PERT actuals, forecast
  optimism, reviewed decision outcomes and cognitive-load bands. A two-hop typed graph
  scope finds linked records automatically; unrated/unpriced/missing-actual inputs emit
  no fabricated evidence; conflicts and anonymous pulses are never read.
- `RULE-PREM-01..04` on the ADR-0008 post-commit spine: typed scope assembly,
  append-only keyed evidence sensing, one atomic four-option DACI re-decision on a fresh
  breach (hedge / pause / reverse / buy information), one owner verification delegation,
  one blameless 1:1 prompt, value-context-inheriting typed links, and self-clearing
  overdue signpost review prompts. A breach declares `decisionTempo` on the same event,
  so `RULE-DLY-03` prices the re-decision when typed value links exist. Marker and
  review-cycle idempotency prevent duplicate decisions; nothing is auto-reversed.
- `PREM-01..05` signals merged into Insights, a Today triage card, nav attention badge,
  deterministic board brief, CSV scope #35 (opaque premise codes, no titles/notes/names
  or source free text), four-tab UI with evidence/exposure labs and policy tab, plus
  accessible keyboard-operable dialogs.
- Additive Schema v34 → v35 migration: `premises` collection, five validated settings,
  `premise` link entity type, `tests`/`revisits` relations, normalizer repairs for
  corrupt priors/refs/future dates, point-in-time rewind and `clearDemo()` pointer
  scrubbing. Automation catalog 86 → 90; CSV scopes 34 → 35; 118 canonical app modules.
- Demo ships two engine-produced premises over real continuity dependencies: one on
  watch and one supported, with typed links and dated sensor observations but no forced
  breach decision. ADR-0019, RESEARCH §61, ROADMAP Session 53, 26 new tests.

### Added — Session 52: Cognitive Load & Attention Governor (`#/load`, Schema v34)
- New `#/load` terminal measuring the person-side constraint entirely from records the
  leader already keeps (portfolio commitments, roster/reporting graph, dependency
  stewardships, onboarding plans) — no calendar, message, keystroke or meeting telemetry,
  no persisted rating, everything recomputed live.
- Per-role saturation index with four transparent, exported component weights:
  intrinsic utilization of ramp-adjusted reserve-discounted supply (0.40), WIP switching
  vs the shared Kanban convention (0.25), extraneous coordination from strong-tie degree,
  1.5× direct reports and weighted stewardships (0.20), and open delegations/cases (0.15);
  five bands (headroom/managed/elevated/saturated/overloaded) with a leader-owned
  saturation threshold (default 80). Team panel adds Brooks n(n−1)/2 channels, network
  density and the single Goldratt system constraint.
- Seeded Beta-PERT Monte Carlo overload probability per person against their own horizon
  supply; commitments without measured triples are counted as unquantified and excluded
  from every draw rather than sampled as zero.
- Per-person Little's Law and Kingman expected-wait queueing from recorded completions:
  counts-only below two completions, provisional at 2–4, learned at five; an unstable
  ρ≥1 state reports no finite wait instead of fabricating one.
- Germane-load protection: ramping team members (active onboarding/transition plan,
  supply factor below one) are flagged but never scored down.
- `RULE-LOAD-01..04` on the generalized post-commit spine (portfolio/delegation/dependency/
  person-archive/scan triggers): one idempotent four-option DACI load-shedding decision
  with typed `involves`/`decides` links, priced by Decision Tempo in the same transaction;
  self-clearing WIP-limit and commitment-size talking points (mutually exclusive);
  manager-routed ramp-protection prompt. Markers make repeated scans converge; the
  `loadAutoPropagate` pause blocks event fan-out while an explicit human scan always runs.
- Signals `LOAD-01..05` merged into Insights under "Load & attention"; deterministic board
  brief; CSV scope #34 with opaque deterministic `load_person_n` codes (no names, roles or
  free text); automation catalog 82 → 86; nav attention badge and route aliases
  (`cognitive-load`, `saturation`).
- Additive Schema v33 → v34 migration installing exactly four validated policy settings
  (`loadSaturationPct`, `loadOverloadProbPct`, `loadThroughputWindowWeeks`,
  `loadAutoPropagate`); no new collections and no backfilled ratings. New actions
  `setLoadPolicy` and `scanLoad`.
- Demo ships the Governor already run on real records behind a visible threshold policy
  (70%): one ramping team member saturated at index 76 with P(overload)=1, one
  engine-opened shed decision, WIP and germane talking points. ADR-0018, RESEARCH §60.

### Added — Session 51: Allocation Governor (`#/allocation`, Schema v33)
- Explore-vs-exploit terminal over the operating-plan portfolio: Nagji & Tuff ambition
  horizons (`core | adjacent | exploratory`, absent = honestly unclassified, never inferred),
  per-currency UCB1 arms learned from settled delivery actuals (robust MAD-scaled exploration
  bonus; counts-only below n=5; settled-without-actuals excluded as an evidence debt, never
  scored zero; currencies never mixed), hindsight-regret diagnostic, current funded mix and
  funded-flow exploration-starvation gauge (March 1991) against a leader-owned floor.
- `RULE-ALLOC-01..04` on the post-commit spine: a floor breach opens exactly one DACI
  rebalancing decision (priced by Decision Tempo in the same transaction) with typed
  `decides`/`funds` links; funded bets queue a learning-checkpoint 1:1 prompt; deliveries
  without actuals open one evidence-closure delegation; funded-unclassified work queues a
  self-clearing classification prompt. Pause switch (`allocationAutoPropagate`) from day one.
- Signals `ALLOC-01..05`; CSV scope #33 (arm aggregates only — no titles or names);
  deterministic board brief download; capacity dialog gains the horizon selector; demo
  ships the Governor already run (one engine-generated decision, counts-only arms).
- Schema v32 → v33 migration is additive (`portfolio.horizon`, allocation policy settings).
  Decision: ADR-0017.

### Fixed — Session 51
- FMEA ratings: a blank rating now persists as `null` ("not rated yet") through `addCase`,
  `updateCase` and the normalizer instead of a silent 5; case list/detail and the case dialog
  show "Rating needed" / "Not rated yet" instead of a fabricated RPN. Historical stored
  ratings are untouched. (Closes the Session 50 known limitation below and ROADMAP Next #4.)
- `store.lastPropagations` is now actually assigned after every committed mutation, so the
  ten action results that read it report real cross-module propagations instead of `[]`.
  (ROADMAP Next #5d.)

### Added — Session 50: Stakeholder Comms Outbox (`#/comms`, Schema v32)
- `RULE-COMMS-01..04` on the post-commit spine: status-brief drafts for key and opposing
  stakeholders from recorded case facts; closure notes owed only to briefed stakeholders;
  reopen withdraws closure notes; a logged stakeholder touch marks the matching draft sent.
- Human gates: approval with unconfirmed facts needs an explicit acknowledgement; editing an
  approved text withdraws approval; dismissal requires a reason; sent is terminal.
- Typed links: new entity type `comms` and relation `communicates` on the shared graph.
- Signals `COMMS-01..03` merged into the Signals feed; demo workspace ships a populated outbox.
- Schema v31 → v32 migration is additive (`commsDrafts: []`). Decision: ADR-0016.

### Known limitations — Session 50
- FMEA ratings default to 5 at case creation, so an unrated case cannot be distinguished from a 5/5/5 rating.
- Drafts are excluded from CSV export; they are included in the full JSON backup.


### Added
- **Impact Ledger — pre-registered, placebo-checked evaluation of your own
  interventions (`#/impact`, Session 49, Schema v31).** Every other surface in
  LeadOS (and in the market) answers "is it up?"; this one answers "did *I* do
  that?" — and refuses to answer when the record cannot support it.
  - `app/core/domain/vitals.js`: twelve weekly vitals reconstructed from dated
    fields already on the records, with three honesty rules enforced by tests —
    an unobserved bucket is `null` never `0`; a closed-but-undated record is
    excluded and counted, never interpolated; a metric is trimmed at its
    coverage frontier so a young log cannot render imaginary zeroes, and a
    metric with no records at all returns an empty series with a reason.
  - `app/core/domain/impact.js`: segmented interrupted time series with
    Newey–West HAC errors; unobserved periods **skipped rather than
    zero-filled**; minimum detectable effect in the metric's own units;
    Abadie-style in-space placebo inference that reports its finest attainable
    p and refuses to gate when it cannot reach α; in-time placebo
    distributions; a Rambachan–Roth-style breakdown trend; and
    `designPower`, a pre-intervention power planner driven by the metric's own
    I-MR noise and run live inside the declare dialog.
  - **Pre-registration as a constraint, not a promise**: `declaredOn` is
    stamped by the action, so `declaredOn ≤ windowStart` derives a
    *confirmatory* grade and anything later derives *retrospective*.
    Predictive fields are refused after the window closes; scoring freezes the
    evaluation, and the report always reads the frozen copy.
  - Five tabs — Vitals (with tabular CUSUM change-point prompts), Studies,
    Evaluation (counterfactual, gates, fragility, both placebo charts), Design &
    power (MDE grid and target comparison), Calibration & brief (direction
    accuracy, Brier score, effect-size realism, deterministic Markdown brief).
  - `RULE-IMP-01..06` on the shared spine before `decisionTempoRule`: typed
    `evaluates`/`replicates` links, one 4-option DACI scale/stop decision for a
    confirmatory decisive result, blameless mechanism-framed talking points for
    a contradicted people-facing intervention, exactly one proposed replication
    of a supported study, plus calibration and pre-trend findings. `IMP-01..06`
    signals feed insights, the Today triage card and the nav badge. CSV scope
    #32 exports counts and verdicts only.
  - New ADR-0015 and RESEARCH §57; 56 new tests; full gate **754/754**, 49
    suites, 107 app modules, Schema v31, standalone rebuilt.
  - Deliberately excluded: causal-claim language, fitted synthetic-control
    weights, backdated declarations, rescoring a locked study, and any use of
    the ledger to rate people rather than interventions.
- **Influence Network Intelligence (`#/network`, Session 48, additive on Schema v30).**
  A surveillance-free Organizational Network Analysis terminal derived entirely from the
  leader's own typed records — no communications telemetry, no employee ratings. A pure
  engine (`app/core/domain/orgNetwork.js`) implements Newman bipartite co-affiliation
  projection with a tunable relative strong-tie backbone, Freeman/Brandes degree ·
  betweenness · closeness centrality, weighted PageRank influence, Burt structural-hole
  constraint, Watts–Strogatz clustering, Tarjan articulation points & bridges, and
  Latora–Marchiori efficiency with a deterministic node-removal structural key-person
  stress test fused with the Operational Resilience Bus Factor (verified-backup
  stewards). Five tabs: a deterministic accessible SVG network map, centrality tables,
  brokers & holes, an interactive remove-a-person simulation, and a follow-through +
  board-ready brief. Five atomic post-commit rules (`RULE-ORG-01..05`) fan one analysis
  into typed person↔person links, a blameless cross-training delegation, a DACI
  org-design decision, blameless 1:1 talking points and `ORG-01..05` signals (insights,
  Today triage and nav badge), with idempotent markers, pause semantics and
  self-cleaning prompts. Two additive settings (`networkTiePct`, `networkAutoPropagate`)
  need no record migration. CSV scope #31 exports counts and dimensionless scores only,
  no names or free text. New ADR-0014 and RESEARCH §56; 25 new tests; full gate
  698/698. Deliberately excluded: predictive attrition, sentiment inference, employee
  ranking and any claim that centralities predict behaviour.
- **Coalition & Incentive War Room (`#/power`, Schema v30).** A pure computational
  political-economy engine (`app/core/domain/power.js`) fusing exact Banzhaf / Shapley-Shubik
  voting-power indices, minimum winning coalitions, Tsebelis veto players and dummy/dictator
  detection with 2×2 pure & mixed Nash equilibria, dominant strategies, Pareto frontier and price
  of anarchy; mechanism-design minimal incentive-alignment transfers with a feasibility bound;
  equilibrium-robustness confidence scoring; and deterministic SBI/DESC influence scripts and
  board-ready briefs. Six atomic post-commit rules (`RULE-PWR-01..06`) propagate one game into a
  DACI decision, a blameless alignment delegation, a 1:1 estimate-verification talking point,
  typed graph links and derived telemetry — chained into Decision Tempo in the same transaction —
  with `PWR-01..06` signals, a Today card, a nav badge, CSV scope #30 (no titles/names), Schema
  v29→v30 additive migration, point-in-time rewind and clearDemo parity. See ADR-0013 and
  RESEARCH §54. Canonical suite 666/666 across 46 suites; standalone rebuilt at 99 modules /
  schema v30.
- **Decision Tempo & Timing Terminal (`#/tempo`, Schema v28).** Every open decision becomes a
  priced, timed position. `app/core/domain/decisionTempo.js` prices delay with Reinertsen's
  four delay profiles (cost of delay ÷ duration, capped at the value at stake), prices the
  *option to wait* with a closed-form preposterior EVSI (Raiffa–Schlaifer: EVSI is zero at
  t = 0, monotone in time and never exceeds EVPI), and returns the horizon that maximises
  expected information value minus carrying and evidence cost with a verdict
  (`gather-first` / `decide-now` / `unpriced` / `needs-economics`) and a switch probability.
  Value at stake is assembled from typed graph links — PERT case exposure, encumbered budget
  lines, portfolio value, negotiated stakes — split by currency and never summed across
  them; a decision with nothing linked is labelled unpriced rather than priced at zero.
  Decisions now record `decidedOn` (the moment of the call) so latency is measured, never
  inferred: the class band is a split-conformal order statistic with its finite-sample
  coverage bound, counts-only below n = 5, and legacy decided records stay unmeasured.
  Five post-commit rules run inside the existing atomic transaction — settle and measure
  (DLY-01), overdue → exactly one owned blameless delegation to the recorded approver
  (DLY-02), priced-and-untimed → one *proposed* timebox that a human must arm (DLY-03),
  >20% linked-value drift → derived-value refresh that never overwrites recorded human
  inputs (DLY-04), and class p80 breach → one DACI tempo-policy decision with four real
  options (DLY-05); `DLY-01..06` signals, a Today card, a nav badge, a tempo line on every
  open decision card, a deterministic board brief, a data-minimised CSV scope #28 with no
  titles or names, a one-click pause, point-in-time rewind and clearDemo parity. Additive
  v27→v28 migration; [ADR-0011](docs/adr/0011-decision-tempo-terminal.md); RESEARCH §52.

- **Natural-Language Intake Terminal (`#/intake`, Schema v27).** An on-device triage
  engine (`app/core/domain/intake.js`) turns a free-form situation note into a
  confidence-scored, fully-evidenced routing plan: fourteen weighted-evidence categories
  with NegEx-style negation windowing, temperature-scaled softmax probabilities with
  uniform-prior shrinkage, completeness/ambiguity/stakes uncertainty controls, and entity
  extraction for roster people (ambiguity never auto-resolved), money (US/EU/Danish
  formats with currency-assumption flags), durations, person-days, percentages, recurrence
  and severity markers. Human-confirmed routing creates the operational case through the
  existing event-driven propagation engine — no parallel write path. RULE-INTAKE-04 keeps
  conflict language behind the confidential privacy wall, RULE-INTAKE-05 forces human
  review on safety/legal stakes, RULE-INTAKE-06 surfaces stale drafts on Today/Signals, and
  RULE-INTAKE-07 records human agreement (not claimed accuracy) in a calibration ledger,
  counts-only below n=5. Additive v26→v27 migration; data-minimized `intakeCalibration` CSV
  scope with no free text; demo triage queue; [ADR-0010](docs/adr/0010-on-device-nl-intake-triage.md).
- **One-file offline distribution: `LeadOS-standalone.html`.** A 1.7 MB self-contained HTML
  copy of the entire app — all 89 canonical JavaScript modules and CSS inlined, no server,
  install, folder, CDN, `node_modules`, network call or runtime dependency. Double-click it
  from any `file://` path. Generated by `npm run build:standalone` / `scripts/build-standalone.mjs`
  with an esbuild IIFE bundle, source fingerprint and hard no-external-resource invariants
  ([ADR-0009](docs/adr/0009-single-file-offline-distribution.md)).
- **Portable-copy UX and data honesty.** Distinct `leados.standalone.v1` browser-storage key,
  `connect-src 'none'` CSP, standalone banner, Settings "Portable offline copy" card with a
  download link in served mode and Export/Import JSON guidance in standalone mode. The app
  travels in the file; records do not — export before moving PCs. Browsers that block
  `localStorage` or Web Crypto for local files get an honest warning instead of a false
  persistence claim.
- **Standalone verification.** `verify:standalone` script and 7 new tests covering inline
  artifact structure, arbitrary output filename, `index.html` overwrite protection, `file://`
  boot, hash routing, zero network attempts, zero axe violations and storage-key separation.
  Also fixed an `emptyState` heading-order accessibility defect. Full suite: **565/565 across
  42 suites**.
- **Forecast Integrity Terminal (Schema v26), at `#/forecasts`.** One typed prediction-atom
  ledger over seven forecast sources; Brier/Murphy probability scoring; exact two-sided sign
  tests; distribution-free conformal outside-view bands with finite-sample coverage bounds;
  counts-only guardrails below n=5; currency/quantity/direction segmentation; interval-coverage
  diagnostics; a deterministic board-ready brief; and a five-tab terminal with overview,
  ledgers/gaps, reference classes, challenges and brief.
- **Generalized post-commit rules hook ([ADR-0008](docs/adr/0008-post-commit-rules-hook.md)).**
  `store.update` now runs pure domain rules after the source mutation and audit event, inside
  the same atomic write. Four new rules `RULE-FCI-01..04` fan a settled outcome into
  idempotent outside-view challenges, typed `forecasts` graph edges, DACI re-baseline
  decisions, a blameless measurement-recovery delegation, `FI-01..05` signals, Today triage,
  nav badge and audit events. A pause stops outcome-driven writes; an explicit scan still works.
- **Reviewable forecast challenges.** A new `forecastChallenges` collection stores the recorded
  estimate, reference-class central estimate, conformal band, evidence count, confidence and
  append-only response history. Leaders accept, adapt or dismiss with a written reason; source
  forecasts are never rewritten. Additive v25→v26 migration, repair-not-reject normalization,
  `clearDemo`/point-in-time rewind parity, 29-column formula-safe `forecasts` CSV scope (#26),
  and 22 new tests. Full suite: **558/558 across 41 suites**; 0 lint errors, 0 boundary leaks.
- **Stakeholder Influence Register (Schema v25), at `#/stakeholders`.** A first-class, portfolio-wide
  political record on top of the lightweight embedded stubs cases, changes and negotiations already
  carry. Four named frameworks ship as executable logic rather than prose: Mendelow (1981) power ×
  interest quadrants in an interactive 5×5 matrix with cadence guidance, Mitchell-Agle-Wood (1997)
  all seven salience classes with a confidence-adjusted score (high ×1.0 / medium ×0.85 / low ×0.7),
  Tsebelis (1995, 2002) veto-player change-difficulty bands (each gate ≤25 points from stance distance
  × power; cohesive opposition +5, unified blocker front +8; feasible ≤33 / contested ≤66 / blocked
  ≤100, with per-analysis confidence and an explicit "not a spatial model" label), and a union-find
  coalition network computing alliance-bloc leaning, directional opposition/influence edges,
  weighted-degree centrality and hidden influencers (low power, high out-influence).
- **Four event-driven automation rules (`RULE-STK-01..04`), 41 rules total.** RULE-STK-01 reconciles
  embedded stubs against the register under strict exact-name/person matching (near-misses become
  STK-02 hygiene counts, never guessed edges) and maintains idempotent `involves` graph edges;
  RULE-STK-02 opens exactly one linked DACI alignment decision (redesign / principled persuasion /
  documented escalation) in the same transaction when an open initiative faces an adverse veto gate,
  with per-initiative embedded stance overrides honored without rewriting the register; RULE-STK-03
  converts an adverse stance shift on a person-linked high-salience record into one managed,
  blameless 1:1 talking point; RULE-STK-04 is a write-free cadence/urgency/evidence watch feeding
  signals `STK-01..07`, Today triage and nav badges.
- **Register UX and governance.** Register/edit dialog with live salience/Mendelow/veto readouts,
  dynamic alliance editor and a dry-run cross-module propagation preview that writes nothing;
  append-only stance and contact dialogs (cadence-proposed next contact never overwrites a later
  plan); dossier with salience rationale, Mendelow guidance, per-initiative veto difficulty,
  involvement pills, coalition position and timeline history; archive vs. scoped-delete cascade;
  Today triage card; 32-column formula-safe `stakeholders` CSV scope (25th) with
  contextual-integrity redaction of stances, veto bases and influence notes plus a scrub count;
  additive v24→v25 migration; normalizer repairs with warnings; `clearDemo`/point-in-time rewind
  parity with an explicit approximate-fidelity note; 12-record demo at 100% reconciliation coverage
  that emits zero fabricated automation events. 39 new tests; full suite 536/536.
- **Negotiation Workbench (Schema v23), at `#/negotiations`.** A full negotiation-analysis module
  built on named frameworks rather than prose: Fisher & Ury (1981) BATNA discipline with a weighted
  preparation checklist (BATNA and a real walk-away price count twice), Raiffa (1982) reservation-price
  geometry that computes the ZOPA, midpoint and reservation gap per measurable issue (and reports
  *incomplete* honestly instead of treating a missing estimate as zero), and Lax & Sebenius (1986)
  package options and agreement-term ownership. Three event-driven automation rules — `RULE-NEG-01`
  (goal/coaching edges plus a pursue-agreement-vs-BATNA DACI mandate for high-stakes work),
  `RULE-NEG-02` (owned agreed terms become tracked delegations; ownerless terms stay visible as
  ownership gaps, never silent assignments) and `RULE-NEG-03` (an impasse raises exactly one
  operational escalation case through the standard FMEA/DACI fan-out, idempotently) — join six new
  insight signals `NEG-01`..`06`, a Today triage card, a purpose-limited formula-safe CSV scope
  (the 23rd), and a three-record demo workspace that stays silent on every NEG rule by design.
  18 new tests cover engine math, validation, the full cross-module propagation graph, insight
  firing/silence, CSV round-trips, v22→v23 additive migration and repair semantics, and a
  JSDOM + axe-clean list/detail/dialog workflow. A latent engine defect was fixed along the way:
  `finiteNumber(null)` previously coerced a missing reservation price to `0`, manufacturing fake
  ZOPA gaps after normalization.
- **Candidate retention review (Schema v18).** `settings.candidateRetentionDays` (default 180, `0`
  disables) drives a new `retentionReview` that lists candidate records past the window on `#/hiring`
  and raises signal `HIRE-08`. It is a *reminder*: nothing is deleted automatically, a candidate still
  in play on an open role is never flagged, a record marked "keep in touch" is listed as an exemption
  rather than silently skipped, a record with no dates is reported as unknown age, and deletion stays
  an explicit, audited action that also removes the evidence and graph edges.
- **Structural accessibility audit** (`tests/app/access-audit.test.mjs`, 12 tests): one `h1` per
  screen with no skipped heading levels, an accessible name on every interactive control (glyph-only
  buttons rejected), captioned tables with `scope`d headers and no empty header cells, landmark
  structure and skip link, dialog focus trap and restoration, and live-region announcements — on top
  of axe-core reporting zero violations across the three newest modules and their detail screens.
- **Large-workspace validation** (`tests/app/scale.test.mjs`, 5 tests): a 120-person / 240-goal /
  300-case / 180-item / 40-role / 320-candidate workspace with 900 typed edges is normalized,
  analysed, exported through all 19 CSV scopes, and rendered; every edge resolves at both ends and a
  second normalization is a no-op. Measured timings are printed so a regression is a number, not just
  a failure.
- An optional `caption` on the shared `table()` component, rendered as a visually hidden `<caption>`
  so a screen-reader user hears what a table is for before hearing its headers.

### Changed
- **Dependencies:** `next` 16.2.6 → **16.4.3**, `postcss` 8.5.8 → **8.5.31**, `eslint-config-next`
  16.2.6 → 16.4.3, `drizzle-kit` 0.31.10 → 0.31.11. `npm audit --omit=dev` goes from *1 critical,
  2 high* to **0 vulnerabilities** (11 Next advisories, including unauthenticated RCE in the Image
  Optimization API, plus PostCSS and sharp/libvips chains). The four remaining moderate advisories are
  a dev-only `drizzle-kit → esbuild 0.18.20` chain whose advisory is about a development server this
  repository never runs; the offered fix is a breaking downgrade of the migration CLI, so it was
  declined and documented instead of applied by force.
- `confirmDialog` now returns a promise and supports both call shapes (see Fixed).
- `openModal` restores focus to `main#view` when the trigger was re-rendered away, instead of dropping
  focus on `<body>`.

### Fixed
- **Destructive confirmations did not wait for an answer.** `confirmDialog` was callback-based, but
  cases, capacity and hiring used `await confirmDialog(...)` and treated the result as a boolean. The
  returned modal handle is truthy, so the record was deleted the instant the button was clicked,
  leaving a confirmation dialog on screen that could no longer change anything — and in the cases
  module the dialog had *no text*, because the caller passed `body:` while the primitive rendered
  `message:`. The promise now resolves only when the dialog closes (`true` on confirm, `false` on
  cancel, Escape, the close button or a backdrop click), `onConfirm` still fires for the
  callback-shaped callers, and `message ?? body` is rendered.
- **Two uncaptioned tables in `#/capacity`** (funding decisions, target-risk forecast) had no
  accessible name; both now carry a caption, and the shared helper supports one.
- **A typo could switch the retention reminder off.** A negative or non-numeric
  `candidateRetentionDays` was clamped to `0`, which means "off"; it now falls back to the default,
  because the safe failure direction for a privacy reminder is on.
- **O(roles × candidates) scans** in `hiringSummary` and the `hiring` CSV scope — the full candidate
  list was filtered inside the per-role loop, which is 1.5 M comparisons at 300 roles × 5,000
  candidates and ran on every render of `#/hiring`, `#/today` and the signals panel. Both now index
  candidates by role once.
- Focus lost to `<body>` after closing a dialog whose trigger a re-render had replaced.

## [Session 26] Selection & hiring (Schema v17)

### Added
- **Selection & hiring (Schema v17).** A new module at `#/hiring` treats hiring as a measurement
  problem with a decision at the end, not a pipeline with a score. A **requisition** records what the
  role must be able to do, who will interview, and (optionally) the three-point interview effort it
  consumes. A **candidate** record holds the evidence collected and the decision — and no protected
  characteristics.
  - Evidence is weighted by the method used, using Sackett et al.'s (2022) re-analysis of the
    personnel-selection meta-analyses (structured interviews `.42`, job-knowledge tests `.40`, work
    samples `.33`, cognitive ability `.31`, unstructured conversations `.19`, years of experience
    `.07`). Weights are combined in log-odds and converted back once.
  - Correlated evidence is discounted rather than double-counted: a repeat rating of the same
    competency by a different interviewer counts ×0.5, by the same interviewer ×0.25. A 3/5 rating is
    genuinely neutral. Rater disagreement of 3+ points on a competency is surfaced with an
    instruction instead of being averaged away.
  - Every assessment carries a **falsification test** ("how many strong contrary observations would
    cross the 50% line") and is labelled decision support, never a prediction. The offer gate is an
    explicit *convention* (evidence weight ≥ 0.50, ≥ 2 methods, all required competencies covered),
    and proceeding without it requires a recorded acknowledgement.
  - Funnel with conversion rates, a cycle-time figure withheld below two completed hires, and a cost
    of vacancy reported only from a daily figure the leader recorded — otherwise the delay is shown
    as unpriced rather than derived from a salary band.
  - **Process fairness without special-category data**: the same competencies assessed for everyone
    who reached the same stage, with uneven coverage reported as a finding.
- **Cross-module automation (`RULE-HIRE-01`..`03`), inside the existing event engine.**
  `RULE-HIRE-01` registers a requisition's recorded interview effort as a committed `hiring` capacity
  item, refreshes it in place, completes it as delivered when the seat is filled and releases it when
  the role is held or cancelled. `RULE-HIRE-02` turns an accepted offer into a roster record, a
  new-hire 30-60-90 plan with standard checkpoints, three typed graph edges
  (`candidate → requisition`, `requisition → person`, `person → onboarding`) and a completed
  interview reserve — in one transaction. `RULE-HIRE-03` escalates a role that has not moved for
  `hiringStallDays` (default 30) through the shared escalation path, so the resulting operational case
  arrives with FMEA, financial PERT fields, a stakeholder coalition, a DACI decision and an
  accountable delegation already attached; it fires at most once per role, even if that case is later
  closed.
- Signals `HIRE-02`–`HIRE-07` (stalled roles, target-date slippage, roles with no competencies,
  interview effort missing from the plan, final-round decisions short on evidence, uneven process
  coverage), a `#/today` hiring card, three hiring conventions in Settings, and a `hiring` CSV scope
  flagged sensitive because it contains named candidate data.
- Demo workspace now includes two live roles, one filled role, four candidates with real evidence
  (including one deliberately thin and one rejected with a written rationale), and the capacity
  reserve the rules engine would have created.

### Fixed
- Two new tables rendered an empty header cell, which `axe-core` reports as `empty-table-header`;
  both now carry a screen-reader label.

### Notes
- The first draft of this module used Schmidt & Hunter's (1998) validity table and had the
  unstructured-interview figure wrong (`.18`, which is years of experience; the 1998 value is `.38`).
  Retrieving the current literature then showed that table has been superseded: Sackett et al. (2022)
  revised every estimate downward and reordered them. The coefficients, the evidence floor and one
  UI claim ("a work sample is the highest-validity signal") were all corrected before release. See
  `RESEARCH.md` §36.

### Added
- **Team capacity, flow and portfolio allocation (Schema v16).** The app can now answer the
  question every other module assumed away: *can the people I have actually deliver what is
  committed, and what has to give?* `#/capacity` shows supply built from focused hours with a
  transition ramp and an explicit operational reserve, demand separated into **committed**,
  **requested-but-undecided** and **unestimated** work, a utilisation band (slack / healthy /
  elevated / overloaded / infeasible) with the slack or deficit in person-days, and the named
  bottleneck. Flow is modelled, not guessed: **Little's Law** gives WIP, throughput and cycle time
  from delivered items only, and the app refuses to state a rate below two completions; **Kingman's
  diffusion approximation** turns current utilisation into a queue-delay multiplier so the cost of
  over-committing is visible before it is paid. Each plan item carries a three-point PERT effort and
  value, so the view ranks by **value density**, marks the marginal funding boundary, proposes the
  lowest-value-density items to release, and forecasts a cumulative P50/P80/P90 date range with
  per-target risk instead of one false-precision date.
- **Capacity is maintained by the rules engine, not by hand.** `RULE-CAP-01` gives an Operational
  Case a committed capacity reserve the moment it is registered, refreshes it when the estimate
  changes, releases it on resolution, reinstates it on reopen and removes it on delete — so diverted
  person-days are real records, not a number in a card. `RULE-CAP-02` opens exactly one trade-off
  decision when the plan exceeds 100% utilisation, with the numbers and concrete options including
  the cheapest item to defer by name. `RULE-CAP-03` records a check-in on a goal when the work
  funding it is deferred or cut (and the follow-up when it is re-funded), while funding *new* work
  writes nothing. Five new signals (`CAP-01`..`CAP-05`) cover over-commitment, queue delay, an
  undecided backlog, unestimated work, and a plan whose targets are already unreachable.
- **Operating surface.** `#/capacity` (nav badge, Today attention card), add/edit work dialog,
  a DACI trade-off dialog and a release-with-reason dialog; per-person load bars, an approximate
  utilisation trend reconstructed from item lifespans, the active-rule card, capacity settings, and
  a new `portfolio` CSV export scope (18 total) that is formula-injection safe.

### Changed
- Schema **v16**: adds `state.portfolio` plus four planning conventions. The v15→v16 migration
  creates an empty ledger and **invents no effort or value**; open cases with recorded capacity days
  still count as implicit reserves at read time.
- `deleteCase` now also removes the case's capacity reserve; `reopenCase` reinstates it.
- README, ROADMAP, RESEARCH (§34), FEATURES and the session-24 audit document record the new layer
  and its honest limits (manager-entered estimates, an approximate trend, no real-browser
  verification in this container).

### Added in earlier sessions (Sessions 1–23)
- **Internal role-transition 30-60-90 plans (Schema v10).** A 30-60-90 plan now records what kind of
  transition it is — `new-hire` or `role-transition` — and, for transitions, a required label naming the
  new scope ("Team Lead · Platform"). A tenured person promoted or moved into a new role gets the same
  scaffolding as a joiner (role clarity, peer buddy, stakeholder introductions, early win, Day 30/60/90
  check-ins and the Day 90 completion gate), but with transition-specific starter checkpoints: agree the
  old-role **handover inventory**, write down how the new role differs, deliver a first early win *in the
  new seat*, and hold an explicit 60-day **old-habits calibration**. The plan is anchored to the day the
  new role starts and can never precede the day the person joined; `person.startDate` and tenure are never
  rewritten, so joiner-only signals (`ONB-01`, `ONB-02`) stay truthful while `ONB-03`–`ONB-05` name the
  transition. The plan dialog defaults a tenured person to a transition anchored to today; `#/onboarding`
  becomes *"Onboarding & transitions"* with per-kind counts and badges; person pages, 1:1 agendas, prep
  sheets, timelines and the `onboarding`/`actions` CSV scopes all carry the kind (formula-safe
  `plan_kind`/`plan_label` columns). Pre-v10 plans migrate as `new-hire` with no invented label, and an
  existing plan can be reclassified in place without losing checkpoints, check-ins or history.
- **Development-commitment ledger (Schema v9).** A GROW "will" action is no longer a checkbox with a
  date. Each commitment can be closed in a review, **carried forward** with a new date (the original
  stays as history and the successor keeps the first-agreed date, so "carried 2× since 14 Sep" is
  derived from the chain rather than stored), or **dropped with a mandatory reason**. Dropped is never
  counted as done and leaves the completion denominator, so moving a date cannot read as progress.
  A corrupted chain — orphaned successor, missing back-reference, cycle — is repaired by reopening the
  promise with a warning instead of losing it.
- **Development reviews as records, not edits.** *Hold review* captures the date, what was actually
  discussed, the outcome for every live commitment (done / still open / carried / dropped) and the next
  date agreed. Pushing `reviewOn` without holding a review increments `reviewDeferrals` and stamps
  `reviewMovedOn` instead of silently rescheduling; holding one resets both and sets the plan date to
  the agreed next review.
- **Two new signals.** `GROW-06` fires when one commitment has been carried two or more times (the GROW
  equivalent of `CONV-06`), and `GROW-07` fires when a review date has been moved twice without a review
  being held. Both name the person, carry the dates as evidence and one action.
- **Follow-through surfaces.** `#/growth` gains live commitments with carry badges, overdue dates,
  per-commitment **Carry** / **Drop** buttons, an expandable record of closed and moved commitments, a
  review log with what each review settled, and **Hold review**; person pages show carried work and where
  the review stands; Today's loose ends name the person whose review is overdue and flag commitments
  carried twice. The `actions` CSV adds `state`, `carried_forward_count` and `first_agreed_on` to GROW
  rows, and the `growthPlans` scope adds `will_open`, `will_carried`, `will_dropped`, `reviews_held`,
  `last_reviewed_on` and `review_deferrals`.
- **Dated snapshots rewind the development ledger too.** A commitment completed, dropped or carried
  after a snapshot date is shown as it was at that date, a successor agreed later is withheld, and a
  review recorded later is excluded with `reviewOn` left `null` and the growth dimension marked
  `approximate` rather than reconstructed.
- **Demo.** Mei's plan now exercises every state: one commitment carried twice and still open, one
  carried once and late, one closed in a review, one dropped with a reason, and a review date moved
  twice since the last review was held.

- **Commitment ownership (Schema v8).** Every 1:1 action now records who owes it — `them`,
  `leader` or `shared` — or stays explicitly unrecorded, which the board counts rather than
  guessing. A promise carried into a later 1:1 keeps its owner; reassigning one is a separate,
  audited action (`oneonone.action.owner`) that refuses closed promises and already-carried
  originals. The actions CSV carries a truthful `owner` column (blank when unrecorded, absent for
  GROW commitments) and the printable prep sheet marks who owes each promise.
- **A private "What you owe" list.** Today gains a card listing the leader's own open promises with
  a one-click Done and a 1:1 shortcut; the 1:1 board gains an "I owe" stat and an inline owner
  select (accented when the promise is the leader's). Signal `CONV-07` fires per person when the
  leader is late on a promise they own, at severity 3 — or 4 when one person is waiting on more
  than one.
- **1:1 follow-through ledger (Schema v7).** Logging a 1:1 now opens with the previous meeting's
  open promises and records an explicit outcome for each: done in this conversation, still open,
  carried forward with a new date, or dropped with a reason. The original action keeps a link to
  its successor, carry depth and "first agreed" are derived from the chain, and a broken, backward
  or cyclic link reopens the promise with a warning instead of losing it. Visible in the 1:1
  dialog, the 1:1 board (`#/oneonones` — follow-through stats, "Up next", "Commitments that keep
  moving", carried badges and a per-meeting ledger), the person page, the printable prep sheet and
  the `actions` / `oneOnOnes` CSV exports. Adds signal `CONV-06` (a promise carried at least twice)
  and a "N promises closed in a 1:1" win.
- Canonical zero-build leadership workspace with roster, 1:1s, SBI feedback, goals, GROW,
  anonymous pulse, decisions, recognition, succession, health and traceable signals.
- Feedback observation dates, configurable observation-to-conversation latency, `FB-06`, and
  date correction that leaves missing values explicitly unmeasured.
- Tri-state goal co-authorship with editable co-authored/leader-set/unknown context and explicit `GOAL-06`.
- Outcome delegation with decision authority, support, due dates, dated check-ins, completion,
  return-to-leader history, `DEL-01`…`DEL-03`, 1:1 agenda integration and a dedicated route.
- Evidence-linked performance-review packets with employee reflection, manager assessment,
  optional anchored ratings, calibration warnings, source drill-down and print/save-PDF.
  Packets now include feedback latency, goal authorship and dated delegation outcomes.
- Schema v2/v3 migrations, review/delegation export/import, frozen completion snapshots and audit events.
- 113 canonical domain, persistence and jsdom UI integration tests (`npm test`).

### Changed
- `CONV-05` now reports only commitments the team owes. Overdue promises the leader owns are
  reported by `CONV-07`, so one overdue record no longer produces two findings.
- CSV exports no longer carry a fabricated `owner` column for GROW, feedback and onboarding
  commitments: the app never recorded an owner there. The
  one-on-ones export reports `carried_in` / `carried_out` instead of the ambiguous
  `carried_forward`, and the actions export adds `state`, `carried_forward_count`,
  `first_agreed_on` and `confirmed_in_meeting`.
- Historical health snapshots rewind completions, drops and carry links together, so a trend can
  no longer show a promise as closed before the meeting that closed it.

### Fixed
- Key-result dialogs now write to the goal that opened them and missing goals fail explicitly.
- Development-plan editing preserves plan identity, options and commitments.
- Development overdue counts use the injected clock for deterministic results.
- Goal authorship editing preserves goal identity, key results and check-ins; missing goals fail explicitly.
- Delegation chronology is validated before writes, and later same-day check-ins correctly supersede
  an earlier blocked state without erasing the overdue fact.
- Demo cleanup removes delegations attached to fabricated people while preserving real-person work.
- The 1:1 board's promise table had an unlabelled action column (axe `empty-table-header`); it is
  now labelled "Actions".
- A hand-edited or future-version `owner` value is cleared and reported
  (`1:1s: cleared N unrecognised commitment owner(s)`) instead of being coerced into a plausible
  owner.

### Security
- Anonymous pulse answers and upward feedback about the manager are excluded from review
  evidence. Review source routes are normalized to local fragments on import.
- Legacy Next.js/PostCSS/Sharp advisories remain documented; the canonical app does not load
  that dependency chain and no forced major legacy upgrade was applied.

## [0.1.0] - 2026-01-01

First documented, verifiable release.

### Added
- `leads` and `score_events` tables (`src/db/schema.ts`).
- Rule-based lead scoring, `rule-v1` (`src/lib/scoring.ts`): additive, fully explainable, no ML.
- Lead API: create/list/filter (`src/app/api/leads/route.ts`), get/update/delete by id
  (`src/app/api/leads/[id]/route.ts`), force rescoring (`src/app/api/leads/[id]/score/route.ts`).
- Dashboard at `/` to add leads, view scores with breakdown tooltip, and record a
  qualify/disqualify/contacted/converted decision (`src/app/page.tsx`,
  `src/components/LeadBoard.tsx`).
- Health check endpoint reporting DB connectivity and app version
  (`src/app/api/health/route.ts`).
- Seed script with four sample leads for onboarding (`scripts/seed.ts`, `npm run seed`).
- Full Diátaxis documentation set under `docs/` (tutorial, how-to guides, reference, explanation),
  tied together by `docs/INDEX.md`.
- Release engineering: `docs/RELEASING.md`, `docs/ROLLBACK.md`,
  `.github/workflows/release.yml`, `.github/workflows/ci.yml`.
- Deployment: single canonical Docker path, `Dockerfile`, `deploy-production.sh`,
  `docs/DEPLOYMENT.md`.
- Governance: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `docs/adr/` with ADR-0001 and ADR-0002,
  `docs/MAINTAINER-RUNBOOK.md`.
- Dependency-free docs link checker (`scripts/check-docs-links.mjs`), wired into
  `npm run verify` and CI.

### Changed
- Renamed the project from the scaffold name "Arena Next.js PostgreSQL Starter" to **LEADOS**
  across `package.json`, `src/app/layout.tsx`, `src/app/page.tsx`, and an internal global variable
  in `src/db/index.ts`. See `docs/CONSISTENCY-SWEEP.md` item C-1.
- `/api/health` now also reports `service` and `version` fields, not just `ok`.

### Known gaps (tracked, not hidden)
- No authentication/authorization anywhere in the app.
- No multi-tenancy; single shared table for all leads.
- No automated tests, coverage, or mutation-testing reports.
- No realtime transport; the dashboard only refetches after actions it took itself.
- No fairness-auditing tooling, because there is no learned model to audit.
