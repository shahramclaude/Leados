# ADR-0067: Outcome Attribution & Loop Settlement Terminal (`#/attribution`)

Date: 2026-11-01 · Status: implemented · Schema: v75

## Context

Response Studio (ADR-0065) and Action Bundles (ADR-0066) rehearse and atomically adopt multi-channel leadership plans across cases, DACI decisions, delegated work, assumptions, budget lines, stakeholder briefs, and 1:1 coaching prompts. Previously, however, LeadOS stopped at adoption receipts (`bundleReport`, `responsePlanReport`):

1. Neither terminal measured **Lipke Earned Schedule** ($ES$, $SPI(t)$, $SV(t)$, $IEAC(t)$) or **Goldratt Critical-Chain Buffer Fever** across the combined gates of an adopted loop.
2. Neither separated **leader-owned clearance bottlenecks** (unchosen DACI calls, unsent stakeholder briefs, unheld 1:1 support) from **delegated execution** — a classic failure mode for first-time managers who inadvertently treat their own governance latency as team drift.
3. Neither partitioned **epistemic thesis failure** (a governing assumption falsified despite $\ge 80\%$ clean delegated execution) from **implementation drift** (stalled execution on an untested hypothesis), risking two opposite managerial errors: penalising strong execution for a bad strategic bet (Holmström 1979; Kerr 1975) or abandoning a valid strategy before testing it (Fixsen et al. 2005 Type-III error; Argyris 1977 single- vs double-loop learning).
4. Neither decomposed realized vs planned loop cost into **Brinson–Fachler 3-way additive variance** (schedule drift, rate/spend revision, joint interaction) or scored **Savage ex-post policy regret** across Response Studio's three rehearsed branches (`contain`, `verify`, `wait`).

## Decision

Introduce **Schema v75 (`settlements` collection)** and the **Outcome Attribution & Loop Settlement Terminal (`#/attribution`)** built on six decoupled ES modules (`settlementRegistry.js`, `settlementSchema.js`, `settlement.js`, `settlementRules.js`, `ui/settlement-modals.js`, `views/settlement.js`):

1. **Zero-Re-Entry Loop Discovery ($O(V + E)$):** `extractControlLoops` indexes workspace entities and graph links in a single linear pass to harvest three loop families without duplicate data entry: committed Action Bundles (`bundle:<id>`), committed Response Plans (`response:<id>`), and standalone multi-channel Case Control Loops (`case:<id>`).
2. **Lipke (2003) Earned Schedule & Goldratt (1997) Fever Chart:** computes $ES = P \cdot PD$, $SPI(t) = ES / AT$, $SV(t) = ES - AT$, and $IEAC(t) = AT / P$ (withheld when $P \le 5\%$ or `reviewOn` is absent), and plots window elapsed burn $W = AT / PD$ against multi-channel clearance $P$ into Green, Watch ($W > 0.25 + 0.60P$), and Red ($W > 0.45 + 0.55P$) corridors.
3. **Pressman–Wildavsky (1973) Clearance Separation & 2×2 Attribution:** splits gates by owner side (`leader` vs `delegate` vs `shared`), computes sequential joint pass probability, and classifies every loop into six explicit regimes: `validated-win`, `thesis-falsified-clean-execution` (team exoneration), `execution-stalled-leader-gated`, `execution-drift-untested-thesis` (Type-III guard), `confounded-refused` (explicit refusal when both execution and outcome fail without a settled premise), and `in-flight-on-pace`.
4. **Brinson–Fachler (1985) 3-Way Variance & Savage (1951) Ex-Post Policy Regret:** decomposes $\Delta C = (T_1 - T_0)r_0 + [T_0(r_1 - r_0) + (M_1 - M_0)] + (T_1 - T_0)(r_1 - r_0)$ with zero unexplained residual, strict ISO currency isolation (never converting across currencies), and strict encumbrance accounting (committed budget without dated actual spend is reported `encumbrance-only`, never treated as realized spend). Adopted Response Plans also compute ex-post policy regret across `Contain now`, `Evidence first`, and `Delay the response`.
5. **Prospective Brier Calibration Ledger:** `freezeLoopSettlement` freezes a Cromwell-clamped $[5\%, 95\%]$ clean-closure forecast ahead of outcome closure; `recordLoopSettlement` and `RULE-STL-05` grade frozen forecasts once out-of-sample with Brier (1950) and Wilson (1927) 95% intervals, withholding Brier Skill Score below 5 graded samples and locking Brier-graded receipts from deletion.
6. **Generalized Post-Commit Automation (`RULE-STL-01..05`):**
   - `RULE-STL-01`: typed provenance links (`settles-loop`, `exonerates-delivery`, `flags-bottleneck`).
   - `RULE-STL-02`: on settled `thesis-falsified-clean-execution`, queues a blameless clean-delivery credit prompt on each active delegate's 1:1 list, opens one governed DACI double-loop thesis-pivot decision (priced downstream by `decisionTempoRule` in the same transaction), and seeds an After-Action Review draft when the source case is closed.
   - `RULE-STL-03`: on Red-zone `execution-stalled-leader-gated`, annotates unchosen leader-owned decisions with bottleneck provenance without touching delegated tasks.
   - `RULE-STL-04`: on `execution-drift-untested-thesis`, opens one single-loop unblocking delegation and appends a `type-iii-guard` history note on open linked premises so untested assumptions are not misread as falsified.
   - `RULE-STL-05`: O(1)-guarded automatic out-of-sample grading on `case.resolved` and `premise.outcome` plus orphan link reconciliation on scan/archive; respects `settlementAutoPropagate` while preserving untouched Action Bundle withdrawal (`transactBundle` fingerprints remain intact).

## Explicit Limits & Refusals

- **Never a person rating:** no employee score, ranking, or adverse action exists anywhere in the terminal; personal-blame language in attribution notes is rejected at the API boundary and scrubbed on import (`hasBlameLanguage`).
- **Observational attribution, not randomized causal proof:** when execution falls below the fidelity floor and the outcome fails without a settled premise, the engine outputs `confounded-refused` rather than guessing cause.
- **Strict financial walls:** mixed currencies refuse summation (`mixed-currency-refused`), and unspent budget commitments remain `encumbrance-only`.
- **Verification scope:** verified via 107 automated Node/JSDOM/`axe-core` suites and standalone build checks; live physical-browser and screen-reader walkthroughs remain `[UNVERIFIED]`.

## Benchmarks & Named Frameworks

Live GitHub API scan (`2026-11-01`): `py-why/EconML` (causal treatment heterogeneity & confounding discipline), `0xNyk/council-of-high-intelligence` & `Exponential-OS/prompt-engineering-in-action` (structured adversarial review), `brayonpi/hexstellar` & `winstonkoh87/Athena-Public` (local-first governance receipts), `weeeha/Super-Design-Lead` & `VioletScar-Hui/aipm-coach-plugin` (manager review loops lacking quantitative attribution), `seonglae/openportfolio` & `donizetiferr/forecast-calibration-kit` (additive variance & Brier/Murphy calibration). Named frameworks: Lipke (2003) Earned Schedule, Goldratt (1997) Critical-Chain Fever Charts, Pressman & Wildavsky (1973) Sequential Clearance Points, Argyris (1977) Single- vs Double-Loop Learning, Fixsen et al. (2005) Implementation Fidelity / Type-III Error, Holmström (1979) Informativeness Principle & Kerr (1975) Anti-Scapegoating, Brinson & Fachler (1985) 3-Way Variance Attribution, Savage (1951) Policy Regret, Brier (1950), and Wilson (1927).
