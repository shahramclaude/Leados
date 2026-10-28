# LeadOS — a leadership workspace that keeps its own receipts

LeadOS helps a first-time manager turn real conversations, feedback, goals and commitments
into evidence-linked next steps. Its team-health indicator is an explainable heuristic over
those records, not an objective leadership grade or a substitute for listening to people.

## Counterfactual mitigation lab — 2026-10-28

Open **Automation control room** (`#/assurance`) → **Counterfactual mitigation lab**.
Choose an open case, enter three proposed residual FMEA ratings and an **additional**
mitigation cost, then compare. Two disposable stores run the real validated `updateCase`
action and all production post-commit rules at the same clock: a refresh of the current
plan versus the proposed edit. Collection counts and typed relationship deltas expose
follow-through into decisions, coaching, capacity, communication and other relevant modules.
Global governors may also react: these are whole-transaction effects, not case-only causality.

The financial panel uses **Savage minimax regret** over your three declared loss scenarios.
It exposes break-even loss and both alternatives' worst regret. Occurrence rating / 10 is
explicitly an **uncalibrated sensitivity proxy**, not measured probability; historical
mitigation spending is sunk, and proposed spending is incremental. Missing baseline ratings
or loss estimates suppress economic ranking. Safety and compliance always override it.
Exports contain numeric assumptions and aggregate effects, not record titles, identities or
private narrative. Failed post-commit rules are counted and make the rehearsal incomplete.

No live writes, no messages sent, and no stale snapshot can be applied. Adoption remains an
explicit edit of the original case. HTTP runs use a module worker with a 30-second timeout;
the portable standalone falls back to local execution (large workspaces can pause its UI).
No new dependencies, network calls or schema migration were introduced.

## Early-Warning Watch — 2026-10-28 (Session 59, Schema v39)

Open **Early-warning watch** (`#/watch`, or `#/alerts`, `#/monitoring`). This is the first
LeadOS surface that treats its own alarm stream as a statistical procedure instead of a feed.

Twelve series are reconstructed from dates already on your records — open cases, decision
latency, feedback latency, delegation and case cycle time, negotiation cycle time, feedback /
1:1 / recognition cadence, delegation throughput, 1:1 mood, pulse index. Each scan tests every
reconstructable series **together**, because one chart is not surveillance: watching a dozen
series is a dozen tests per period, and the family-wise chance of at least one false alarm
climbs fast. So the scan:

1. computes each series' p value from the strongest Shewhart rule on its latest point,
   Bonferroni-inflated for the four rules tested on that chart;
2. applies a **Benjamini–Hochberg step-up** at your declared false-discovery rate and prints
   `m`, the cutoff and the expected number of false discoveries;
3. promotes **only adverse** signals the step-up rejects, and records every candidate it
   throttles — `budget`, `cooldown`, `noisy-series` — as a `suppressed` row, because a hidden
   suppression looks exactly like calm;
4. **freezes one next-week prediction per series per day** before the week it describes.

Four tabs, plus a calibration and a policy tab:

- **Queue** — signals waiting for your verdict, with the value, centre line, natural limits,
  p, rank and the frozen prediction. Confirming is the only option that creates work
  elsewhere; the other three only correct the record.
- **Scan** — every series with its chart values, its strongest rule and what the procedure did
  to it, including the series that cannot be reconstructed yet and *why*.
- **Forecast ledger** — every frozen prediction with its realised error, scored out of sample
  as `1 − model error / naive error`, and counts-only below three scored predictions.
- **Calibration** — alert precision as a **Wilson score interval** (only `confirmed` and
  `false-alarm` count; `explained` and `dismissed` are not claims about the statistics), and
  the detector's pooled skill. The demo workspace honestly reports **negative** skill
  (−3.26 over 21 predictions): a centre-line model loses to "next week looks like this week"
  on autocorrelated weekly series, and the product says so instead of hiding the baseline.
- **Policy & rules** — the published α table, the five rules, the budget and the brief.

**Nothing is automated on a p value.** `RULE-EW-01` opens exactly one operational case only
after a recorded human confirmation (then the existing case engine cascades normally);
`RULE-EW-02` turns an alert past its triage deadline into one four-option DACI decision;
`RULE-EW-03` turns budget exhaustion into one monitoring-scope decision per window;
`RULE-EW-04` opens one re-tuning decision per quarter when measured precision falls below
tolerance. Verdicts are one-way, so the precision record cannot be retro-fitted. Signals
`EW-01..05` join Insights, CSV scope #40 exports opaque detector telemetry with no free text,
and a deterministic board brief downloads from the header.

Known limits, stated on the page: Benjamini–Hochberg assumes independence or positive
dependence and these series are correlated, so the true FDR can exceed the target; the
moving-range α is a normal approximation; XmR limits are in-sample and a level shift
contaminates the centre line; a 26-week series supports a one-week prediction and nothing
longer. No calendar, message or sentiment telemetry is read, and no individual is scored.

## Structural Capital Allocation — 2026-10-28 (Session 58, Schema v38)

Open **Capital allocation** (`#/capital`). This is the first LeadOS surface that answers the
question a leader actually faces at the start of a quarter: *I have a fixed number of effort-weeks
and six ways to spend them — which mix, what does it buy, and does the model that priced it deserve
to be believed?*

Set a **budget** (1–40 effort-weeks, default 12), a **horizon** and, if you disagree with the
convention, the four **objective weights**. The engine spends the budget by marginal return per
effort-week — greedy, so every accepted increment paid for itself — and then runs a complementarity
pass, because a synergetic pair funded together is worth more than either alone.

Four tabs, in the order a leader has to think:

- **Plan** — the funded portfolio, effort spent and left, the joint trajectory against doing
  nothing, and a verdict that separates *improves* from *investment* (it raises the ceiling but
  costs this horizon's throughput) from *worsens*. Effort costs come from a published book and are
  labelled conventions, not measurements.
- **Attribution** — **exact Shapley** over every coalition of the funded levers (six levers is 64
  evaluations, so this is exact and instant, never sampled), with the efficiency gap printed. Below
  it, a substitute/complement table: `WIP cap × learning` on the demo is **+25.07** (fund them
  together), `WIP cap × delegation` is **−7.34** (they compete for the same constraint).
- **Robustness** — 32 seeded lognormal draws of every structural parameter, P10/P90 bands, and
  **Savage minimax regret** across your plan, the six named playbooks and doing nothing. On the demo
  the portfolio has mean 52.6 (P10 50.2 / P90 56.4) and max regret **26.93** — it wins because its
  worst case is the least bad, not because its mean is highest.
- **Checkpoints** — the do-nothing baseline is **frozen beside the prediction at adoption**. When the
  checkpoint arrives, the app scores the frozen prediction as a **skill score** against persistence
  (`1 − model error / naive error`), not against memory. Skill is withheld when no baseline was
  frozen, pooled skill is suppressed below two observations, and two non-positive checkpoints open
  exactly one re-baselining decision instead of silently retuning the model.

**The trust ladder is the point.** `unvalidated → refuted → provisional → backtested → validated`.
Only **backtested** or better may be called *actionable*, and every grade lists the evidence that
would move it up. The demo workspace sits at **refuted** (its dynamics hindcast has skill −5.38), so
the page tells you the recommendation is *comparative*, not something to act on. A tool that always
says "optimal" is a toy.

**Cross-module, on the same spine.** Adopting a portfolio opens exactly one DACI commitment decision
— priced by Decision Tempo in the same transaction, with the Shapley rows as options and the trust
grade in the question — and exactly one owned, dated checkpoint delegation carrying the frozen
prediction. Checkpoints append typed `scores` lineage. `SCA-01..05` signals reach Insights, CSV scope
#39 exports numeric telemetry under opaque codes (no names, titles or notes), and the header
downloads a deterministic board brief.

Nothing is auto-implemented, no data leaves the browser, and no people are ranked by the answer.

## Operating System Dynamics Lab — 2026-10-28 (Session 57, Schema v37)

Open **System dynamics** (`#/dynamics`). This is the first LeadOS module that treats the team
as a **system with accumulations and delays** instead of a snapshot: five stocks (delivery
capacity, work in progress, quality debt, perceived pressure, dependency concentration) are
derived from records you already keep, integrated forward with RK4 at a one-week step, and
read back as trajectories, loop dominance and archetypes.

Four tabs, in the order a leader has to think:

- **Structure** — the stocks, where each number came from (measured / estimated / convention),
  the simulated saturation trajectory against the 100% "fully committed" line, and the
  structural-risk score.
- **Loops** — seven named loops (burnout spiral, key-person, capability growth, backlog drain,
  hiring drag, symptom repair, intake renegotiation) ranked by **measured gain**, not by how
  loud they look, plus the dominance table week by week and the archetype findings with their
  evidence lines.
- **Policy lab** — six playbook interventions and your own experiments, each compared with
  doing nothing: delta saturation, delta WIP, delta throughput, delta capacity, and a verdict
  that distinguishes *improves* from *investment* (raises the ceiling while costing this
  quarter's throughput) from *worsens*. Adopting an experiment **freezes** the prediction and
  opens one owned checkpoint; retiring requires a written reason.
- **Calibration** — a hindcast against weekly WIP reconstructed from dated portfolio
  lifecycles, scored against naive persistence, with five refusal gates. On the demo workspace
  the model is explicitly **no better than "tomorrow equals today"** (MASE 2.53, skill -5.38).

Three rules propagate what it finds, atomically and idempotently: **RULE-DYN-01** opens exactly
one four-option DACI structural decision priced by Decision Tempo, **RULE-DYN-02** queues one
blameless, marker-leading 1:1 talking point naming the loop, and **RULE-DYN-03** opens one
delegation carrying the frozen prediction. `dynamicsAutoPropagate: false` pauses the automatic
side; an explicit **Scan now** always runs. CSV scope #38 exports 20 opaque/numeric columns
with no names, hypotheses or notes.

Honesty is enforced, not promised: every parameter carries provenance and the report prints the
split (the demo is 65% conventions, so its structural claims are labelled *provisional*); an
undated closure is excluded and counted, never interpolated; the stability verdict is a local
linearisation and is described as one; and the module never predicts morale, sentiment or
individual attrition. See ADR-0022.

**Status block, verified 2026-10-28 (this session, not carried over):** Schema v37; 125 app ES
modules; 57 test suites; **906/906 canonical tests pass** (ESLint clean, canonical boundary OK,
144 internal documentation links resolve); `npm run verify:standalone` 7/7 with the artifact
rebuilt at 2,647,591 bytes. Demo regression and all engine numbers are quoted in `ROADMAP.md`
for Session 57.

## Automation rehearsal relationship diff — 2026-10-28

In **Automation control → Rehearse a case event**, preview now compares valid
operational relationships before and after the production post-commit rules run.
It groups added and removed edges by source module, relation and target module,
including replacements where both counts rise, and shows before/after counts for
dangling, duplicate and unknown-relation diagnostics. It does not expose names or
record IDs in this diff. Private links are excluded; links are evidence, not causal
claims. Preview is disposable and only covers post-commit rules, not case-opening
action automation; refresh always recomputes against current state.

## Assumption-Aware Scenario Tails — 2026-10-28 (Session 55, derived on Schema v36)

Open **Assumption ledger → Scenario tails** (`#/premises?tab=tails`). LeadOS now answers:
*how much wider is the delivery tail because the reasons for the plan may be wrong — and
which assumption is doing the damage?* Each evidenced premise is coupled through the same
two-hop typed graph to measured committed portfolio work. A paired, seeded Monte Carlo
(Common Random Numbers — identical Beta-PERT draws with and without premise failure)
reports baseline vs premise-coupled P50/P80/P90 and overload risk. Leave-one-out
attribution shows the P90 days recovered by holding each single premise true.

Honesty gates are the feature: a premise with **no committed evidence is never coupled**
(a prior is not a frequency); belief weights a **stress test, not an actuarial forecast**;
failure shocks (+60% load-bearing / +40% major / +25% monitor effort, capped ×3/item) are
labelled conventions. Correlated-evidence clustering groups observations sharing one
typed source — one incident told three times is flagged **pseudo-replicated**, never
silently counted as three. Signals TAIL-01..03 surface tail widening, the dominant
assumption, and evidence concentration in Insights. CSV scope #37 exports opaque
telemetry only. No schema change, no new dependency, no network. See ADR-0021.

## Sensor Calibration Loop — 2026-10-27 (Schema v36)

The Assumption Ledger now closes the loop on its own sensors. When a premise becomes
knowable, use **Assess outcome** to append a human judgement: **held**, **failed**, or
**inconclusive**. A conclusive label is immutable and unique per premise; an inconclusive
checkpoint is retained but not scored. The date is when the outcome became knowable, not
when someone happened to type it. No sensor decides whether its own claim was true.

The new **Sensor calibration** tab scores the sensor's declared likelihood-ratio strength
against those later outcomes with the Brier score, mean forecast vs. observed held rate,
calibration gap, directional accuracy and a forecast-mix PSI comparison. Repeated changes
to the same typed source collapse to its last state before the outcome, and each premise
counts once per sensor. Metrics stay **counts-only below five settled premises**; PSI needs
ten earlier and ten recent samples. PSI compares separate earlier/recent settlement-date cohorts (never splitting one same-day wave) and is only a distribution-shift indicator, not a finding
that quality got worse. The LR-to-probability mapping starts from a neutral 50% prior; it is a
transparent diagnostic convention, not proof that a declared LR is empirically valid. **No
LR is automatically retuned.** Sparse, dependent leadership observations do not justify
auto-learning.

`RULE-PREM-05` links an outcome to its premise (`validates`) and linked decision (`revisits`)
on the generalized event spine. Point-in-time views exclude outcomes not yet knowable, and
clearing demo premises clears their outcomes. CSV scope #36 uses opaque premise codes and
exports numeric sensor telemetry only—no premise titles, notes, people names or evidence
text. See [ADR-0020](docs/adr/0020-outcome-scored-premise-sensor-calibration.md).

## Automation Control Room — 2026-10-27

Open **Automation control** in the sidebar (`#/assurance`). Trace shortest operational
relationship trails with per-hop rule provenance; inspect dangling endpoints, duplicate edges
and unregistered relations; export a text assurance brief. Reverse traversal is labelled: a
relationship is evidence, **not causal failure propagation**. Confidential conflicts and anonymous
pulses are excluded, and arbitrary failure-log text is never displayed or exported here.

Choose a case → **Preview in sandbox** to run the actual post-commit registry on a disposable
copy. See created/updated/removed row counts and a per-rule savepoint trace. **Refresh current
case** requires confirmation and recomputes from current facts; it never installs the preview
snapshot. It may create unsent comms drafts, decisions or coaching prompts. Nothing is sent.

Post-commit rules now use isolated savepoints: an exception discards that rule's writes and
buffered success events, records a named failure, then continues from the last successful rule.
The source action remains committed. This does **not** yet isolate action-level automation,
external effects, ID allocation or whole-transaction persistence failures. Existing storage-error
warnings remain authoritative; a successful refresh means in-memory commit, not guaranteed disk
persistence. No schema migration or runtime dependency was added. See
[the assurance architecture note](docs/adr/0010-automation-assurance-savepoints.md).

## Premise Sentinel — 2026-10-27 (Schema v36)

Open **Assumption ledger** in the sidebar (`#/premises`). Before an important decision,
write down the **load-bearing premise** — the thing that must stay true for the call to
keep working — plus the signpost that would prove it wrong. Give it an owner, a prior
belief, watch/breach thresholds and a review date. LeadOS then watches the records you
already keep: cases, stakeholders, continuity dependencies, budgets, delivery actuals,
forecast challenges, reviewed decisions and cognitive-load bands. A two-hop typed
relationship graph finds linked evidence without you re-entering it.

Each dated observation has a named likelihood ratio for or against the premise. The
engine turns those into a posterior belief using transparent log-odds, discounts old
evidence by a leader-owned half-life, and shows Wald-style evidence boundaries and
information gain in bits. **A broken signpost does not reverse your decision.** It opens
one four-option DACI re-decision (hedge, pause, reverse or buy information), one owner
verification delegation, one blameless 1:1 prompt and typed links back to the original
call; Decision Tempo prices the delay on the same event when typed value links exist.
You can pause governance fan-out, run an explicit signpost scan, reaffirm or retire a
premise with a dated note, and download a board brief. CSV scope #35 exports only opaque
premise codes and numeric belief telemetry — never titles, notes or people names. No
network, LLM, sentiment inference, conflict record or anonymous pulse is used.

The math and its limits are documented in
[ADR-0019](docs/adr/0019-assumption-ledger-premise-sentinel.md) and RESEARCH §61.
Likelihood ratios are conventions, not calibrated probabilities; Wald boundaries are
not p-values on independent trials; the leader owns every re-decision.

The **canonical application is `index.html` + `app/**`**. It runs in your browser with no
account, application backend, database or runtime package dependency. The static server
only serves files; app records stay in this browser's `localStorage` unless you explicitly
export them. **Optional passphrase encryption** can seal that stored copy (Settings → Protect
this browser copy). Exports are separate files and stay unencrypted unless you choose
*Create encrypted backup*; a lost passphrase cannot be recovered by anyone.

```sh
node scripts/serve.mjs --host 0.0.0.0 --port 5173
# or: npm run app
# Open http://localhost:5173
```

Node 18+ can serve the application; there is no build or dependency install required to run
it. For the test tooling, use Node 22+ (verified with Node 22.22.3):

```sh
npm ci --no-audit --no-fund
npm run verify:canonical     # ESLint + ADR-0007 boundary gate + docs link gate + canonical regression suite (see AI-SESSION-LOG.md for latest results)
```

## Run LeadOS from one HTML file on any PC

[`LeadOS-standalone.html`](LeadOS-standalone.html) is a **self-contained copy of the entire
application**: all 111 canonical JavaScript modules and the full stylesheet are inlined into one
~2.3 MB HTML file. There is no server, build, install, backend, account, `node_modules`, CDN,
font fetch or network request.

**To use it:**

1. Download or copy `LeadOS-standalone.html` to any PC (USB stick, desktop, shared drive — the
   filename can be changed).
2. Double-click it. It opens in any modern browser from a `file://` path.
3. Use the app normally. In the served version, **Settings → Portable offline copy** offers the
   same file as a download.

**Moving your records:** the HTML file contains the app, **not your data**. Records are kept by
that browser's local storage under a separate `leados.standalone.v1` key, so the portable copy
does not overwrite a served workspace on the same machine. Before moving PCs, use
**Settings → Export JSON**; on the other PC open the copied HTML and use **Import JSON**. Some
browsers restrict `localStorage` or Web Crypto for local files: if Settings shows a saving
warning, records are temporary and plain JSON exports are not encrypted — export before closing
the tab. The standalone file also ships a `connect-src 'none'` CSP as a defence-in-depth
guarantee that it cannot call a network API.

**Regenerate after changing the app:**

```sh
npm ci --no-audit --no-fund
npm run build:standalone       # writes/overwrites LeadOS-standalone.html
npm run verify:canonical       # full canonical regression suite
```

`esbuild` is a **build-time-only** dev dependency used by
[`scripts/build-standalone.mjs`](scripts/build-standalone.mjs); none of it is needed to run the
generated HTML. The script refuses to overwrite canonical `index.html`, computes a source
fingerprint, rejects any residual external script/stylesheet, module import, `fetch()` or
external CSS URL, and can write to any output path with `--out`. See
[ADR-0009](docs/adr/0009-single-file-offline-distribution.md) and
[RESEARCH.md](RESEARCH.md) §50 for the rationale and limits of `file://` single-file apps.

## Cognitive Load & Attention Governor — 2026-10-27 (Session 52, Schema v34)

`#/load` answers the person-side question every plan begs and no hour-booking heatmap can:
**whose cognitive capacity is the system constraint right now, and what should move?** Nothing
is measured from calendars, messages or keystrokes. Every input is a fact the leader already
records — funded portfolio commitments, the roster and its reporting graph, dependency
stewardships, onboarding plans — and nothing about the result is persisted as a rating. The
report recomputes live, on a **role in a system**, never as a score of the human.

- **One transparent saturation index, four named components** (weights shown in the policy tab,
  no hidden model): intrinsic utilization of ramp-adjusted, reserve-discounted supply (0.40),
  WIP switching against the shared Kanban convention (0.25), extraneous coordination —
  strong-tie degree, 1.5 per direct report, weighted stewardships (0.20) — and open
  delegations/cases (0.15). Five bands follow fixed cut-points with a leader-owned saturation
  threshold (default 80): headroom, managed, elevated, saturated, overloaded. The team panel
  adds Brooks's `n(n−1)/2` communication channels and the single Goldratt system constraint.
- **A seeded Monte Carlo says whether the commitments fit.** Beta-PERT effort draws against the
  person's own horizon supply produce a reproducible overload probability; commitments without
  measured triples are counted as *unquantified* and excluded from every draw — never sampled
  as zero.
- **Per-person Little/Kingman queueing, with honest floors.** Throughput and median cycle time
  come from recorded completions; expected wait is Kingman's `(ρ/(1−ρ))·c·cycle` (c = 1, an
  exported convention). Counts-only below two completions, learned at five; at ρ ≥ 1 the
  terminal reports *unstable* with no fabricated finite wait.
- **Germane load is protected, never penalised.** A ramping team member (active
  onboarding/transition plan, supply factor below one) is flagged, not scored down;
  `RULE-LOAD-04` asks the in-roster manager to protect learning time once the person reaches
  the elevated band.
- **Four event-driven rules on the generalized post-commit spine** (triggered by portfolio,
  delegation, dependency, person-archive and explicit scan events — no hardcoded glue):
  `RULE-LOAD-01` opens exactly one four-option DACI load-shedding decision (defer the lowest
  value-density thread / reassign to measured headroom, honestly naming when none exists /
  open a requisition / renegotiate scope or dates) with typed `involves`/`decides` links,
  priced by Decision Tempo in the same transaction; `RULE-LOAD-02` queues a blameless
  WIP-limit prompt; `RULE-LOAD-03` flags an individually oversized commitment *inside* the WIP
  limit; prompts self-clear when resolved and marker-idempotence makes repeated scans
  converge. A pause switch blocks automatic fan-out while an explicit human scan always runs.

Signals `LOAD-01..05` appear in Signals; CSV scope #34 exports opaque per-person telemetry
(`load_person_n` codes — no names, roles or free text); a deterministic board brief names the
constraint and its caveats. Rules: `RULE-LOAD-01..04` — see
[ADR-0018](docs/adr/0018-cognitive-load-attention-governor.md) and [RESEARCH.md](RESEARCH.md)
§60 (Sweller; Skelton & Pais; Little; Kingman; Anderson; Brooks; Goldratt). The demo ships
mid-story on real records with a visible threshold policy: one ramping team member saturated
at index 76, one engine-opened shed decision, WIP and germane prompts waiting. Thresholds and
weights are transparent conventions, not empirically validated team constants — the UI says so.

## Allocation Governor — 2026-10-27 (Session 51, Schema v33)

`#/allocation` answers the question every plan begs and no ranked list can: **where should the
next person-day go?** Classify each operating-plan item as **Core** (optimise what exists),
**Adjacent** (extend into nearby ground) or **Exploratory** (a bet on new ground) — Nagji &
Tuff's ambition horizons. Work you have not classified is shown as unmeasured; the app never
guesses. From then on the Governor does three things continuously:

- **It learns what each horizon returns.** Every delivered item with recorded actual effort and
  value becomes one settled observation. Per currency, each horizon ("arm") earns a UCB1 index —
  its mean settled value per person-day plus an exploration bonus that prices how rarely it has
  been tried (Auer, Cesa-Bianchi & Fischer 2002). Below five settled bets an arm shows counts
  only: no return is invented. Settled work without recorded actuals is excluded and counted as
  an evidence debt, never scored zero. Currencies are never mixed.
- **It watches your funding behaviour, not your intentions.** If the exploratory share of
  classified effort funded in the look-back window falls below your floor (default 10% over
  180 days), exploration is being starved — March's (1991) success trap, measured. `RULE-ALLOC-01`
  then opens exactly one DACI rebalancing decision with the queued bets attached (fund one,
  fund a smaller probe with a stop rule, defer on the record, or lower the floor deliberately),
  and Decision Tempo prices it in the same transaction. Nothing is auto-funded, ever.
- **It closes the learning loop.** A funded bet queues a 1:1 prompt to agree its learning
  checkpoint and stop rule (`RULE-ALLOC-02`); a delivery without actuals opens one
  evidence-closure delegation (`RULE-ALLOC-03`); funded-but-unclassified work prompts its owner
  to classify it, and the prompt clears itself when done (`RULE-ALLOC-04`).

Rules: `RULE-ALLOC-01..04` (see [ADR-0017](docs/adr/0017-allocation-governor-explore-exploit.md)
and [RESEARCH.md](RESEARCH.md) §59). Signals `ALLOC-01..05` appear in Signals; CSV scope #33
exports the arm table (aggregates only — no titles, no names). The demo ships mid-story: 0%
exploratory funding against a 10% floor, one engine-opened rebalancing decision waiting, arms
honestly counts-only at n<5.

Also fixed this session: blank FMEA ratings persist as *unrated* (`null`) end-to-end — cases show
"Rating needed" instead of a default RPN — and `store.lastPropagations` is wired, so action
results report the cross-module propagations that actually happened.

## Stakeholder Comms Outbox — 2026-10-27 (Session 50, Schema v32)

`#/comms` turns the stakeholder updates you already owe into drafts you can review.
When you register or update an operational case, LeadOS writes a status brief for each
**key stakeholder** (manage-closely or keep-satisfied) and each **opposing** stakeholder
(blocker or skeptical), using only facts recorded on the case: the risk rating, owner,
mitigation, review date and any financial estimate. A fact you have not recorded appears as
**"[to confirm — …]"** and lowers the readiness meter. Approving a draft with a gap requires you
to acknowledge it.

- **Nothing is sent by the app.** You approve, copy the text into your own email or chat, and
  record it as sent. A logged stakeholder touch also marks the matching draft sent.
- **Closure is owed, not assumed.** When the case resolves, unsent briefs are withdrawn. A closure
  note is drafted only for people who were actually briefed. Reopening withdraws it.
- **Edits are honest.** Changing an approved message withdraws its approval. Changing a case fact
  supersedes the draft and records why. A dismissed draft is not re-drafted until the facts change.
- **Typed links.** Each draft links to its case (`communicates`), so it appears in the case's
  linked-entity panel.

Rules: `RULE-COMMS-01..04` (see [ADR-0016](docs/adr/0016-stakeholder-comms-outbox.md) and
[RESEARCH.md](RESEARCH.md) §58). Signals `COMMS-01..03` appear in Signals. The demo workspace
ships a populated outbox.

Limits: FMEA ratings defaulted to 5 at case creation, so an unrated case could not be told apart
from a deliberate 5/5/5 — **fixed in Session 51** (blanks now persist as unrated, and the outbox
readiness check flags them). Drafts are not in CSV exports, but they are in the full JSON backup.

## Impact Ledger — 2026-10-27 (Session 49, Schema v31)

`#/impact` answers the question no other leadership tool will answer: **did that
actually work?** You declare a study before you run it — metric, direction, the
day the intervention starts, how long you are willing to wait, and (optionally)
the effect size you expect and your confidence. The app then decides whether your
records can answer the question at all, and says so when they cannot.

It is not a dashboard with a causal adjective bolted on. Every number is derived
from dates you already typed — 1:1s held, feedback given and observed,
delegations delegated and completed, cases opened and resolved, decisions taken,
pulses answered, recognition given — and the inference is designed to fail
loudly:

- **Pre-registration is a constraint, not a promise.** `declaredOn` is stamped by
  the app, so a hypothesis written down after the intervention began is filed as
  *retrospective* forever and can never count as confirmation. Predictive fields
  are refused once the window closes, and scoring freezes the evaluation
  permanently — the report reads the frozen copy, never a live recomputation.
- **Unmeasured is not zero.** A week with no observation is a gap in the chart,
  never a `0`. A closed record with no close date is excluded and counted, never
  interpolated. A metric whose log does not reach back far enough is trimmed at
  its coverage frontier rather than drawn as weeks of imaginary absence.
- **A result must clear its own noise floor.** `designPower` computes, from your
  metric's own week-to-week variation, the smallest level shift a given number of
  pre- and post-intervention weeks could detect — live, inside the dialog, before
  you commit. An effect below that floor is reported as *underpowered*, never as
  "no effect".
- **Placebo tests, with their own resolution stated.** Every other metric measured
  on the same grid is treated in turn (Abadie-style in-space placebo), and fake
  interruption dates are fitted inside the pre-period (in-time placebo). Rank
  tests report their finest attainable p-value and are refused as a gate when
  they could not possibly reject — a check that cannot fail is not a check.
- **Fragility is quantified.** The ledger states how much differential trend,
  sustained across the post-period, would reproduce the entire estimate, and
  calls the result fragile when that number is small enough to be plausible.
- **The ledger scores you, gently.** Direction accuracy, a Brier score over your
  stated confidences, and the median ratio of realised to declared effect size.
  Most leaders discover they overestimate their own impact by a factor of two or
  more; the app shows the number and moves on.

One intervention can be supported on one metric and contradicted on another — the
demo workspace ships exactly that pair, pre-registered before the same date —
which is the situation a single-line dashboard is structurally unable to
represent.

`RULE-IMP-01..06` then carry the result across the workspace in one transaction:
typed `evaluates`/`replicates` links, a 4-option DACI scale/stop decision for a
confirmatory decisive result, blameless mechanism-framed 1:1 talking points when
a people-facing intervention is contradicted, exactly one proposed replication of
a supported study, and calibration and pre-trend findings. See
[ADR-0015](docs/adr/0015-impact-ledger-preegistered-evaluation.md),
[RESEARCH.md](RESEARCH.md) §57 and `tests/app/impact.test.mjs`.

## Influence Network Intelligence — 2026-10-27 (Session 48, additive on Schema v30)

`#/network` is an offline, **surveillance-free Organizational Network Analysis**
terminal. It derives the collaboration graph **entirely from records you already
entered** — cases, DACI decisions, delegations, goals, changes, negotiations,
operational dependencies, war-room games and typed graph links. It never reads
email, chat, calendar, sentiment, or any external data, and it never rates a
person. A structural position is a fact about your recorded work graph, not a
judgment about a colleague.

- **A real graph engine, not adjectives** (`app/core/domain/orgNetwork.js`):
  Newman bipartite co-affiliation projection; Freeman/Brandes degree,
  betweenness & closeness centrality; weighted PageRank influence; Burt
  structural-hole constraint; Watts–Strogatz clustering; Tarjan articulation
  points & bridges; and Latora–Marchiori network efficiency. Every measure is
  computed by name and verified against textbook graphs.
- **A tunable strong-tie backbone:** incidental co-appearance can make a graph
  look fully connected. A tie must be at least N% as strong as the strongest tie
  (Settings / the map tab, default 50%; 0% shows every real tie). This is a
  visualisation threshold over real data — nothing is invented.
- **Structural key-person stress test:** remove any person from the map and see
  exactly how connectivity, clusters and efficiency change — a deterministic
  what-if, fused with the Operational Resilience Bus Factor (verified backup
  stewards). Identify brokers, isolates and single points of connection before
  they become a continuity problem.
- **Five tabs:** a deterministic SVG network map (accessible name + legend +
  a full data table), positions & centrality, brokers & structural holes,
  the key-person stress test, and a follow-through + board pack.
- **Atomic cross-module automation (`RULE-ORG-01..05`):** one "Run
  influence-network follow-through" fans the analysis, in a single store
  transaction, into typed person↔person graph links, a **blameless**
  cross-training delegation, a DACI org-design decision for a fragmented team,
  1:1 check-in talking points for isolates and over-loaded brokers, and
  `ORG-01..05` signals (also on Today and the nav badge). Idempotent, with
  pause semantics and self-cleaning prompts; employee-authored 1:1 topics are
  never modified. Unrelated writes do not trigger it (no alert fatigue).
- **Privacy by construction:** CSV scope #31 exports only dimensionless scores
  and integer counts keyed by an opaque `node_index` — no names, titles or free
  text. Below two active people the network is reported as unmeasurable, not a
  fabricated zero.

Additive on Schema v30: a derived lens needs no new record collection or
migration; two settings (`networkTiePct`, `networkAutoPropagate`) are handled by
normalization. See [ADR-0014](docs/adr/0014-influence-network-intelligence.md)
and [RESEARCH.md](RESEARCH.md) §56. **Honest limits:** centralities describe
recorded structure, not behaviour or performance; co-affiliation is a proxy for
collaboration, not observed communication; no predictive attrition, sentiment
inference or employee ranking.

## Robust Strategy Lab — 2026-10-27 (Session 47)

Open **War Room → Robust strategy lab** (`#/power?tab=stress`). Edit a situation
and supply an optional **payoff uncertainty ±** bound. Blank means unconfigured;
zero explicitly tests the point estimates. No uncertainty is inferred from confidence.

- **Exact continuous-box guarantees:** tests whether the target remains Nash and whether
  one fixed conditional concession works for *every* independently varying payoff.
  Shows the feasible transfer interval and its uncertainty break point.
- **Savage minimax regret vs Wald maximin:** compares pure strategies by worst regret
  and security payoff. Ties stay visible; the app never chooses for you.
- **Single-opposition shocks:** tests each non-opposed stakeholder becoming opposed,
  keeping the electorate and quota fixed. Neutral is persuadable, not committed.
- **Automatic follow-through:** extended `RULE-PWR-02/04` creates one DACI strategy
  decision, typed relationship and owner 1:1 verification prompt on stress vulnerability;
  `PWR-07` surfaces it in insights. Scripts, briefs and derived verdicts use the same
  analysis. Reanalysis is idempotent and the existing automation pause still applies.
- **Honest limits:** comparable transferable utility, independent equal-width bounds,
  pure-strategy regret and weak Nash only. Not money, a probability, a causal forecast,
  or a full robust mixed-strategy equilibrium solver. Decisions are opening snapshots;
  current analysis is in the lab. Nothing is executed or sent externally.

No runtime dependency or network architecture changes. The optional `stressRadius`
field is an additive schema-v30 extension: old records normalize to `null`, and JSON
export/import retains it. Older app versions may discard the new optional field.
The standalone HTML is regenerated with the lab included.

## Coalition & Incentive War Room — 2026-10-27 (Session 46, Schema v30)

`#/power` (and `#/power/:id`) is an offline **computational political-economy engine** — no
language model, no network, no invented numbers. It reasons over the stakeholders, weights and
payoff estimates *you* record and turns them into a confidence-scored verdict, a Nash-equilibrium
read, a mechanism-design recommendation and a tailored influence script — then fans the result
out across the whole workspace atomically. See [RESEARCH.md](RESEARCH.md) §54 for the 2026
competitive benchmark and [ADR-0013](docs/adr/0013-coalition-incentive-war-room.md).

- **Exact cooperative power indices (Banzhaf / Shapley-Shubik).** A weighted voting game over up
  to 8 stakeholders computed by exact 2ⁿ coalition and n! ordering enumeration: normalised
  Banzhaf & Shapley-Shubik power, Riker **minimum winning coalitions**, **Tsebelis veto players**,
  **dummy players** and **dictators**, plus a stance-aware "can allies/neutrals reach quota?"
  feasibility check and a Banzhaf-power **HHI** concentration score.
- **2×2 non-cooperative game (Nash).** Pure & mixed **Nash equilibria**, strictly dominant
  strategies, **Pareto frontier**, social welfare, **price of anarchy** and coordination loss for
  the leader-vs-pivotal-counterparty game, with a hand-drawn SVG payoff-space chart.
- **Mechanism design (incentive compatibility).** The **minimal transfer** that makes your
  target outcome a Nash equilibrium (revelation principle / DSIC framing), with an explicit
  feasibility bound from the leader's own headroom — i.e. the price of aligning incentives.
- **Confidence-scored, not flat.** An **equilibrium robustness margin** (distance to the nearest
  best-response boundary, relative to payoff scale) combined (weaker-of) with your declared
  estimate confidence into a high/medium/low band — a labelled management convention, not a
  statistical interval.
- **Deterministic influence script & board pack.** An SBI/DESC-framed, per-stakeholder rehearsal
  script and a copyable board brief generated from the computed numbers — explicitly labelled as
  template generation, never an LLM, and never reading confidential conflicts or anonymous pulses.
- **Atomic cross-module propagation (`RULE-PWR-01..06`).** One registered or reanalysed game
  creates typed graph links, a derived verdict snapshot, **one** DACI coalition-strategy decision
  (which the Decision Tempo engine classifies in the same transaction), **one** blameless
  incentive-alignment delegation, and **one** estimate-verification 1:1 talking point —
  idempotently, with a one-click pause. `PWR-01..06` signals, a Today triage card, a nav badge,
  CSV scope #30 (no titles or names), point-in-time rewind and clearDemo parity.

Verified this session: `npm run verify:canonical` → **666/666** tests across **46** suites, 0
ESLint errors, 0 canonical-boundary leaks (99 app modules); `npm run verify:standalone` → **7/7**.
`[UNVERIFIED]`: real-browser graphical rendering, spoken screen-reader output, general-sum
N-player solving, and empirical calibration of verdicts against realised outcomes (needs n≥5
settled games).

## Operational Resilience, Dependency & Continuity Terminal — 2026-10-27 (Session 45, Schema v29)

`#/resilience` (and `#/resilience/:id`) brings an offline, zero-telemetry **Enterprise Resilience
Decision System** into LeadOS — connecting human Bus Factor, internal platforms, and multi-tier
suppliers directly to your live Capacity, Delegations, Goals, Negotiations, Cases, and Decision Tempo:

- **Simchi-Levi Continuity Tolerances (`TTS` / `TTR` / `REI`) & Nth-Party Cascades (EU DORA Art. 29).**
  Models **Time-to-Survive (`TTS`)** vs. **Time-to-Recover (`TTR`)** across a cycle-checked multi-tier
  DAG (`service`, `system`, `process`, `vendor`), propagating upstream outages through `none`,
  `warm-standby`, and `dual-active` substitutability modes to surface common-mode and sub-tier
  choke points (`depth ≥ 2`) and per-currency **Risk Exposure Index (`REI ∈ [0, 1]`)**.
- **Avelino Minimal Hitting-Set Bus Factor & Verification Firewall.** Computes exact minimal
  personnel cut-sets across critical/important capabilities while enforcing an epistemic firewall:
  unverified backups (`verifiedOn: null`) and `trainee` shadows remain `inTraining` and never
  inflate Bus Factor until independent operation or a continuity drill is explicitly recorded.
- **Supplier Concentration (`HHI`), Williamson Hold-Up & Conformal Drill Calibration.** Computes
  DOJ/FTC **Herfindahl-Hirschman Index (`HHI`)** per currency without cross-currency summation,
  scores **Williamson (1985) supplier hold-up** leverage ahead of contract renewals, and calibrates
  `realizedTtrDays ÷ estimatedTtrDays` across continuity drills using split-conformal bands
  (suppressed to counts only below `n = 5`).
- **Zero-Write Counterfactual Stress Lab (`#/resilience?tab=stress`).** Simulates simultaneous
  key-person unavailability and multi-tier vendor/platform shocks without mutating workspace state,
  cross-checking surviving backups against `buildCapacityModel` so backups allocated `≥ 90%` in
  Capacity trigger explicit contention warnings.
- **Six Post-Commit Rules Chaining into Decision Tempo (`RULE-RES-01..06` → `RULE-DLY-03`).**
  Registering or updating a critical dependency syncs typed graph links and derived daily exposure
  (`RULE-RES-01`), opens blameless cross-training delegations and focus-protection 1:1 prompts
  (`RULE-RES-02`), opens DACI continuity trade-off decisions that Session 44's `RULE-DLY-03`
  **atomically prices and proposes a Cost-of-Delay / EVSI timebox for in the same write**
  (`RULE-RES-03`), injects hold-up warnings into supplier negotiations (`RULE-RES-04`), shifts
  underpinned goals to `at-risk` and opens remediation cases on breached drills (`RULE-RES-05`),
  and logs delegation completions without fabricating human verification (`RULE-RES-06`). See
  [ADR-0012](docs/adr/0012-operational-resilience-continuity-terminal.md) and
  [RESEARCH.md](RESEARCH.md) §53.

## Decision Tempo & Timing Terminal — 2026-10-26 (Session 44, Schema v28)

LeadOS now prices the decision nobody made. `#/tempo` treats every open decision as a timed
economic position and answers one question per call: **decide now, or is the option to wait
worth its carrying cost?** The economics are named, closed-form and auditable — no model call,
no simulation, no cloud — so the same numbers appear in the served app and the standalone file.

- **Cost of delay, priced from records you already hold.** Reinertsen's four delay profiles
  (linear, fixed-date, expedite, standard) with a weekly rate derived from *value at stake ÷
  erosion window*, capped at the value at stake. The value itself is assembled from typed
  graph links — PERT case exposure, encumbered budget lines, portfolio value, negotiated
  stakes — split by currency and never summed across currencies. Nothing linked means
  *unpriced*, not zero.
- **The option to wait, priced exactly.** Preposterior EVSI (Raiffa–Schlaifer) on the edge
  between your leading option and the runner-up: `EVSI(t) = E[max(0, posterior mean)] −
  max(0, prior mean)`, which is zero today, rises as evidence arrives at a stated half-life,
  and can never exceed the value of perfect information. Add the carrying cost and the
  evidence cost and you get the optimal decision date, the switch probability and a verdict
  — **gather that evidence first**, or **decide now**.
- **Latency that is measured, not assumed.** Decisions now record `decidedOn` — the moment
  the call was actually made. The workspace's own latency band is a split-conformal order
  statistic with its finite-sample coverage bound, suppressed to counts only below five
  measured decisions, and legacy decided records stay unmeasured rather than inferred.
- **A commitment firewall.** Automation proposes a timebox with the derived money and a
  guardrail date; it never arms one and never records the edge or the uncertainty on your
  behalf. One click pauses all automatic tempo writing while the read-side model keeps working.
- **Five rules, one terminal.** `RULE-DLY-01` settles a timebox and measures the latency
  when the call is made; `RULE-DLY-02` turns an overdue call into exactly one owned, blameless
  delegation to the recorded approver; `RULE-DLY-03` proposes one timebox for a priced,
  untimed decision; `RULE-DLY-04` refreshes the derived value when a linked record moves more
  than 20% without touching your recorded inputs; `RULE-DLY-05` opens one DACI tempo-policy
  decision when a *class* of decisions breaches its own measured p80. `DLY-01..06` surface the
  position on Signals and Today, the queue is ranked by CD3, and the board pack is
  deterministic text you can copy or download. See
  [ADR-0011](docs/adr/0011-decision-tempo-terminal.md) and [RESEARCH.md](RESEARCH.md) §52.

## Natural-Language Intake Terminal — 2026-10-26 (Session 43, Schema v27)

A leader can now paste a situation note into `#/intake` instead of opening a form, and an
on-device triage engine produces a confidence-scored routing plan with full evidence. The
engine is a pure, deterministic ES module — no network, no model download, no data leaves the
device, so it works identically in the served app and the double-clickable standalone file.

- **Fourteen-category weighted-evidence triage** with NegEx-style negation windowing,
  softmax temperature scaling and uniform-prior shrinkage so thin input cannot look certain.
  Four uncertainty controls — completeness, top-1/top-2 ambiguity, high-stakes labels and
  explicit negation — route uncertain cases to human review with the triggering reason shown.
- **Entity extraction with provenance** for roster people (first-name ambiguity is flagged,
  never auto-resolved), money in US/EU/Danish formats with a currency-assumption flag,
  durations and person-days, percentages, recurrence and severity markers, each with
  sentence and character offsets.
- **Human-confirmed, never automatic.** The engine prepares a pre-filled case and a live
  propagation preview (DACI decisions, delegations, capacity reserves, coaching,
  stakeholder schedules); the leader edits and confirms through the standard case dialog,
  which runs the existing event-driven rules engine unchanged.
- **Privacy and safety by rule.** Conflict language hits the RULE-INTAKE-04 privacy wall and
  routes the leader to the confidential conflict workspace without creating operational
  records or graph links; safety/legal stakes force the RULE-INTAKE-05 human review.
- **Calibration ledger (RULE-INTAKE-07).** Every confirmation records whether the primary
  label and entities were accepted or edited. The construct is honestly named *human
  agreement* (not accuracy), counts only below n=5, stale drafts surface as RULE-INTAKE-06
  signals, and the `intakeCalibration` CSV export contains no free text. See
  [ADR-0010](docs/adr/0010-on-device-nl-intake-triage.md) and [RESEARCH.md](RESEARCH.md) §51
  for the 2026 competitive hunt and the on-device decision.

## Forecast Integrity Terminal — 2026-10-26 (Session 41, Schema v26)

LeadOS now treats every promise as one typed **prediction atom** and scores the workspace as a
forecasting system, not a collection of unrelated forms. `#/forecasts` unifies decision
probabilities, plan effort, case exposure/diverted-days/mitigation spend, budget commitments
and negotiated value. Probabilities are scored with **Brier (1950)** and **Murphy (1973)**
reliability/resolution/uncertainty decomposition; magnitude forecasts use dimensionless
actual ÷ recorded-forecast ratios segmented by quantity, currency and deal direction. An
**exact two-sided sign test** separates systematic bias from one ugly outlier, and a
**distribution-free conformal band** (Vovk et al., 2005; Angelopoulos & Bates, 2021) produces
an 80% outside-view range with an explicit finite-sample coverage bound — counts-only below
n=5, marginal coverage only, exchangeability stated rather than assumed silently.

The loop is automated. A new generalized post-commit rules hook
([ADR-0008](docs/adr/0008-post-commit-rules-hook.md)) runs pure domain rules inside the
store's atomic transaction. `RULE-FCI-01` turns a settled outcome into idempotent
outside-view challenges for open forecasts in the same class **and**, where the pooled
evidence is biased, low-confidence challenges in other modules; `RULE-FCI-02` opens exactly
one DACI re-baseline decision per challenged class; `RULE-FCI-03` opens one blameless
measurement-recovery delegation when three settled records lack actuals; `RULE-FCI-04`
feeds `FI-01..05` signals, Today triage, a nav badge and a deterministic board-ready brief.
Every challenge is a separate reviewable record with accept/adapt/dismiss and written
rationale — **no recorded forecast is ever rewritten**.

Verified example: recording the fifth 1.5× budget actual creates one class-specific challenge
on an open budget commitment and one low-confidence mixed-quantity challenge on an open
portfolio estimate, two DACI decisions, typed `forecasts`/`decides` graph links and audit
events in the same transaction; a second scan writes nothing. Ships with an additive
v25→v26 migration, normalizer repair, `clearDemo`/point-in-time rewind parity, a 29-column
formula-safe `forecasts` CSV scope (#26), five-tab terminal UI, JSDOM/axe coverage of every
tab and the response dialog, and 22 new tests. See [RESEARCH.md](RESEARCH.md) §49 for the
2026 AI-forecasting, decision-intelligence and people-analytics hunt, academic sources and
rejected shortcuts.

## Stakeholder Influence Register — 2026-10-26 (Session 40, Schema v25)

LeadOS now keeps one persistent political map across every case, change and negotiation
(`#/stakeholders`). The lightweight embedded stakeholder stubs those modules already carry
are reconciled into a first-class register under **strict matching** — exact normalized
name or internal person link; a near-miss is counted as an unmapped hygiene gap, never
guessed into a relationship. Each record is analyzed through four named lenses that update
live as you edit: **Mendelow (1981)** power × interest quadrants in a 5×5 matrix with
cadence guidance, **Mitchell-Agle-Wood (1997)** all seven salience classes with an
evidence-confidence-adjusted score (×1.0/×0.85/×0.7), **Tsebelis (1995, 2002)** veto-player
change-difficulty bands (stance-distance × power, ≤25 points per gate, +5/+8 cohesion
penalties, feasible/contested/blocked bands, honestly labelled a heuristic, not a spatial
model), and a union-find **coalition network** — bloc leaning from power-weighted stance
centroids, directional opposition/influence edges, centrality and hidden influencers.

Political signals now propagate like everything else: an adverse veto gate on an open
initiative opens **exactly one** DACI alignment decision in the same transaction
(`RULE-STK-02`); an adverse stance shift on an internal high-salience stakeholder queues a
blameless, idempotent 1:1 talking point (`RULE-STK-03`); reconciliation maintains typed
`involves` edges (`RULE-STK-01`); and a write-free cadence watch surfaces contact decay,
urgency-without-plan and low-confidence veto assessments (`RULE-STK-04`, signals
`STK-01..07`). The register dialog shows a dry-run propagation preview before you save and
respects an `autoPropagate` pause. Stances, veto bases and influence notes are
contextual-integrity governed — redaction neutralizes them in CSV/JSON exports with a
scrub count, its CSV scope (#25) runs to 32 formula-safe columns, the v24→v25 migration is
purely additive (no invented actors), and point-in-time rewind rewinds stance/contact
history with an explicit approximate-fidelity note. A 12-record demo reconciles at 100%
coverage and stays automation-silent by design. See [RESEARCH.md](RESEARCH.md) §48 for
the academic sources, 2026 SRM competitive audit and rejected shortcuts.

## Budget & financial commitments — 2026-10-26 (Session 39)

LeadOS now has a finance leg (Schema v24). A **budget envelope** is an approved ceiling in one
currency for one period; its commitment lines follow commitment (encumbrance) accounting —
`planned` → `committed` (budget authority reserved) → `spent` (actual you recorded) or
`released` (authority returned). The headline number is **forecast at completion**: recorded
actuals + open commitments, compared with the ceiling while you can still act. Planned lines
are separate pipeline exposure; a missing actual or an unpriced commitment labels the forecast
*understated* instead of silently counting as zero, and an actual is never pre-filled from the
committed figure. A ceiling is a limit, never a spend target: underspend is not scored as
failure, and the period-end signal says so (Liebman & Mahoney, 2017, on use-it-or-lose-it
surges).

Money now propagates like everything else in the OS. A forecast breach opens **exactly one
DACI trade-off decision** (`RULE-FIN-01`); a line that funds a case, negotiation, portfolio
item, requisition, goal, decision or change creates a typed `funds` graph link, and when that
record completes the encumbrance is marked *actuals due* in the same transaction
(`RULE-FIN-02`); recording a real actual feeds a **fifth calibration ledger** that scores
actual-vs-committed honestly — counts only below n=5, ratios pooled across currencies without
FX, and a calibrated forecast shown *beside*, never instead of, the recorded one
(`RULE-FIN-03`). Signals `FIN-01..05`, a Today card, `#/finance` routes, a `finance` CSV
export scope (#24) and a Settings watch-% convention complete the loop. Conflict cases and
anonymous pulse surveys can never be funding sources. Amounts remain leader-entered evidence —
nothing here reconciles to invoices or a general ledger. See [RESEARCH.md](RESEARCH.md) §47
for sources, boundaries and rejected shortcuts.

## Negotiated-value settlement calibration — 2026-10-26 (Session 38)

The negotiation settlement ledger now closes the fourth forecast-calibration loop without
confusing a signed amount with value actually realised. `negotiationSettlementCalibration`
pairs only agreed records with a positive explicit signed deal value and an explicit realised
value; it segments by currency and issue direction, never converts FX, and keeps other settled
records in a named actuals follow-up list. Cohorts show **counts only below n=5**; at n≥5 a
median shortfall of 20% or more is a **review guardrail**, not evidence of causality or an
individual negotiation/employee score.

`RULE-NEG-07` runs beside existing `RULE-NEG-06` in the `recordNegotiationSettlement`
transaction and records an idempotent derived-calibration propagation. `NEG-09` routes a
qualifying cohort to `#/decisions`; `#/negotiations/:id` shows prior comparable settlements
for preparation while excluding the current agreement from its own reference class and never
changing the current BATNA, target or forecast. The `calibration` CSV now includes settlement
pairs, count-only cohort rows and missing-actual follow-up rows. No schema migration, FX
conversion, inferred value, automatic forecast adjustment or backend was added.

Research triangulated Flyvbjerg's outside-view method, Perold's implementation-shortfall
lens and Deming's PDCA with product patterns from Oracle's plan/actual/forecast workflow,
Coupa's sourcing-to-invoice/value-realisation story, and Suplari's published advice to agree
a baseline before negotiation and validate at invoice/ledger level. These vendor materials are
pattern references, **not independent proof** of efficacy. LeadOS does not claim savings or
invoice verification from manager-entered values. See [RESEARCH.md](RESEARCH.md) §46 for
sources, comparison limits, and rejected shortcuts.

**Verification:** the focused calibration + negotiation suites pass **40/40** tests. Full
`npm run verify:canonical` passes **485/485 tests across 38 suites**, with 0 lint errors,
0 canonical-boundary leaks and **89/89** internal Markdown links resolving. Real-browser
rendering, spoken screen-reader output, source-system validation of financial actuals and
field comprehension remain **[UNVERIFIED]**.

## Returned-commitment recovery & ex-post agreement settlement governance — 2026-10-26 (Session 37)

- **Returned-commitment recovery & immutable lineage (`RULE-NEG-05`)**: When a delegated commitment returns
  to the leader (`status: 'returned'`), the leader can now explicitly recover and re-delegate it from either
  `#/delegations` (*Re-delegate / recover*) or `#/negotiations/:id` (*Recover term*) via
  `redelegateReturnedOutcome` / `recoverNegotiationTerm`. Grounded in **Oncken & Wass (1974)** monkey-management
  control, **Grove (1983)** task-relevant maturity, and **Hollnagel (2014)** closed-loop safety recovery, the
  original returned delegation remains immutable in history (`status: 'returned'`, `returnedOn`, `returnReason`,
  `supersededByDelegationId`, `recoveredOn`) while a successor active delegation is created with
  `priorDelegationId` and a required `recoveryNote` countermeasure. Cycle-safe schema repair
  (`repairDelegationRecoveryChains`) and lineage derivation (`deriveDelegationLineage`) track attempt count and
  prior owners across reloads. `RULE-NEG-05` atomically updates `term.ownerId`, `term.dueOn`, and
  `term.priorOwners`, carries forward `tracks-followup` and `mitigates` graph links, queues a blameless 1:1
  handover talking point on the new owner naming the prior return reason and countermeasure, and clears
  `NEG-07` once an active recovery delegation is in flight.
- **Ex-post agreement settlement & BATNA-breach governance (`RULE-NEG-06`, `NEG-08`)**: Grounded in
  **Williamson (1985)** *Transaction Cost Economics*, **Hart & Moore (1988)** *Incomplete Contracts*,
  **Perold (1988)** *Implementation Shortfall*, and **Raiffa (1982)** BATNA walk-away regret, agreed
  negotiations can now record explicit post-agreement settlement actuals (`recordNegotiationSettlement`:
  `settledOn`, `realisedValue`, `counterpartyDelivered`, `note`, and quantitative per-term `settledValue`),
  never pre-filled or fabricated from signed estimates. `evaluateNegotiationSettlement` computes direction-aware
  implementation shortfall and unit-honest walk-away BATNA breach (`sameUnitDealBatna`). `RULE-NEG-06` cascades
  settlement telemetry to linked goal check-ins and opens a linked DACI settlement review decision when the
  realised outcome breaches the walk-away BATNA, suffers counterparty non-delivery, or experiences material
  implementation shortfall; `NEG-08` surfaces both completed high-stakes agreements awaiting settlement and
  adverse settled outcomes requiring governance action.
- **Store, Rewind & Test Determinism Hardening**: `store.clearDemo()` now scrubs dangling demo references on
  retained user `negotiations`; `reconstructStateAt()` rewinds `negotiations` (including post-cutoff agreements
  and settlements) and delegation recovery lineage as of `asOfDay`; `scale.test.mjs` exercises `delegations`,
  `negotiations`, and `changes` at scale; and `case-calibration.test.mjs` / `calibration.test.mjs` use
  deterministic `app.navigate(...)` + `app.destroy?.()` teardown.
- **Verification this session**: `npm run verify:canonical` passes **483/483 tests across 38 suites (`0 fail`)**,
  `0` ESLint errors, `0` boundary leaks, and `88/88` internal markdown links. Graphical browser rendering of
  the Session 35–37 Negotiation Workbench views, spoken screen-reader output, and field comprehension remain
  **[UNVERIFIED]**.

## Agreement delivery feedback — 2026-10-26 (Session 36)

The Negotiation Workbench shows each current term as **In progress, Delivered,
Returned — needs recovery, or Untracked — gap**, with a link to delegations.
`RULE-NEG-04` feeds completed/returned negotiated delegations back into agreement history
and neutral linked-goal check-ins in the same safe-write transaction. `NEG-07` surfaces
returned commitments for recovery. Neither completion nor agreement fabricates financial
actuals, goal progress, confidence changes or decision outcomes. Source negotiation/term
IDs survive normalization.

## Honest state of this repository

This checkout also contains older React/Next.js applications, consoles, database code and
large historical documents. Their presence is not evidence that those products run. Per
**[ADR-0007](docs/adr/0007-legacy-next-tree-disposition.md)**, they are quarantined as a frozen
historical archive in place, **not rebuilt or deleted**, and enforced via `npm run check:boundary`
so zero canonical `app/**` modules can ever import from them.

| Path | Current status |
|---|---|
| `index.html`, `app/**` | **Canonical product:** 94 native JavaScript modules, CSS and shell; Schema v28; tested below. |
| `scripts/serve.mjs`, `scripts/check-canonical-boundary.mjs`, `scripts/check-docs-links.mjs` | Dependency-free static server + canonical boundary and documentation link gates. |
| `tests/app/**` | Canonical automated suite (`565` tests across `42` suites), run by `npm test` / `npm run verify:canonical`. |
| `scripts/app-browser-smoke.mjs`, `scripts/app-onboarding-smoke.mjs`, `scripts/app-manager-support-smoke.mjs` | Optional real-Chromium lifecycle/mobile/accessibility checks; Session 29 also ran a full Chromium `143.0.7499.0` WCAG 2.1 AA + `1440px`/`390px`/`320px` reflow audit across 11 routes and 4 modals ([validation report](docs/VALIDATION-2026-10-25-session-29.md)). |
| `public/index.html` | Quarantined older synthetic-data console (ADR-0007), not the product; runtime status **[UNVERIFIED]**. |
| `src/**`, root React files, `drizzle/`, `openapi.yaml` | Quarantined frozen historical archive (ADR-0007); current builds, security and workflows **[UNVERIFIED]**. |
| `deprecated/vite-index.html` | Quarantined old Vite entry (ADR-0007). |

**Correction to earlier documentation:** `src/db/` exists. It contains a PostgreSQL/Drizzle
client, schema and repositories; `src/app/page.tsx` is a PostgreSQL starter page. Claims that
the data layer is absent were wrong. The starting checkout contained 3,650 tracked files,
3,495 source files and 316,352 source lines. All source was scanned for inventory/imports;
that is **not** personal line-by-line verification of the whole legacy tree. Historical
TypeScript error counts were not rerun. See the latest focused
[capacity, flow & portfolio allocation audit](docs/AUDIT-2026-10-25-session-24.md),
the [cross-domain operational cases & automation audit](docs/AUDIT-2026-10-25-session-23.md),
the [inline error accessibility audit](docs/AUDIT-2026-10-25-session-22.md), the previous
[browser validation audit](docs/AUDIT-2026-10-25-session-21.md), the earlier
[architecture inventory](docs/AUDIT-2026-10-25-session-17.md), and the corrected
[architecture decision](docs/adr/0006-canonical-zero-build-app.md).

## What it actually does

### Conversations and feedback

- Log a 1:1 as held, moved or skipped; compute cadence, cancellation streaks and adherence
  from real dates. Generate editable agenda suggestions with a reason for each item, pre-check
  the top items inside the *Log a 1:1* dialog so you can check/uncheck what was actually
  covered, and automatically exclude retired or dropped GROW commitments.
- Build a **printable, shareable one-meeting prep sheet** (`#/prep/<personId>`): the topics the
  person has asked to raise, the generated agenda with reasons, every open commitment grouped
  by source (past-1:1 actions, 30-60-90 onboarding / transition / re-boarding checkpoints,
  feedback follow-ups, development actions, delegation checkpoints), what happened since you
  last spoke, outcomes at risk, and a notes area. Check or uncheck employee topics and agenda
  suggestions directly on the prep sheet and click **Log the 1:1** to carry your exact selection
  into *Log a 1:1* with true agenda provenance (`their-topic`, `delegation`, `onboarding`, etc.) —
  clearing covered employee topics only when a `held` 1:1 is saved while keeping uncovered ones
  queued for next time. Confidential conflict records and anonymous pulse answers are excluded by
  construction and named on the sheet.
- Execute **30-60-90 check-ins from Today**: overdue and next-seven-day phase conversations
  across onboarding, internal transitions and return-to-work plans, ordered by due date.
  Today shows the four oldest conversations and an explicit link to the full **Check-ins due**
  queue (`#/onboarding?status=checkins`). Log the two-way conversation in place; cancelling
  changes nothing, saving removes only that phase from the queue, and checkpoints/other phases
  remain untouched. **Open plan** follows the exact plan (`?plan=<id>`), including a completed
  plan rather than silently substituting a newer plan for the same person. The seven-day
  look-ahead is a fixed interface convention, not a validated deadline or a notification service.
- After a Day 30/60/90 conversation is actually recorded, add an **explicit, dated manager-owned
  follow-up** for the concrete action you will take. The task keeps the exact check-in ID, plan,
  phase and date; it is separate from candid blockers, never copied into performance-review
  evidence, and never housed in a synthetic 1:1. The shared 1:1 commitment board shows it as
  yours to do, and a later real held 1:1 can mark it done, carry it forward with a date, or drop
  it. The source phase/date survives carries and is included in the commitments CSV.
- Run structured **30-60-90 onboarding, role-transition & return-to-work ("re-boarding")
  scaffolding** (`#/onboarding`, `Schema v14`): written role clarity, peer buddy assignment,
  stakeholder introduction tracking (`met`/`metOn`), a scoped early win, editable checkpoints
  across Day 30 / Day 60 / Day 90 horizons, and dated two-way phase check-in conversations. New
  joiners get the onboarding template; a tenured person promoted or moved into a new scope gets
  a labelled **role-transition** plan (old-role handover inventory, written scope/authority
  delta, first early win in the new seat, 60-day old-habits calibration); and a person returning
  from extended leave gets a **return-to-work (`reboarding`)** plan (what changed while away,
  agreed 4-week load pacing, peer catch-up buddy, key re-connections) with explicit guidance
  never to record medical or personal leave reasons. Transition and return-to-work plans anchor
  to day one of the new phase — `person.startDate`, `person.role` and tenure are never
  rewritten. Missing scaffolding is flagged on the manager (`ONB-02`…`ONB-05`), never as a
  personality or performance grade on the person, and 30-60-90 check-ins are kept out of
  performance review packets so people in a new phase can raise confusion safely.
- **Record who owes each promise, and see your own debts** (`Schema v8`): every 1:1 action
  carries an owner — *they* do it, *you* do it, or *both* of you — or is explicitly left
  unrecorded, which the board counts rather than guessing. Promises you own appear in a private
  **"What you owe"** card on Today, in an "I owe" stat and an inline owner column on the 1:1
  board, and in `CONV-07` once one is overdue. A promise that is carried forward keeps its owner;
  reassigning one is a separate, logged action, and closed promises cannot be rewritten.
- **Reconcile last time's promises when you log the next 1:1** (`Schema v7`): every open
  commitment appears with how long it has been alive and how often it has moved, and the leader
  records an explicit outcome — done in this conversation, still open, carried forward with a new
  date, or dropped with a reason. Nothing is carried automatically, the original keeps a link to
  its successor, and a broken or cyclic chain is repaired by reopening the promise rather than
  losing it. Carried promises show on the 1:1 board, the person page, the prep sheet, the CSV
  export and signal `CONV-06` once the same promise has survived two conversations.
- Capture owned, dated meeting actions; overdue commitments surface on Today.
- Record Situation → Behaviour → Impact feedback with a live, non-blocking specificity coach.
  Track praise/constructive balance and follow-up dates without imposing a target ratio.
- Store observation and conversation dates separately. Unknown observation dates stay
  unmeasured, not zero-day feedback; date corrections preserve the original note.

### Goals, delegation, development and succession

- Goals have key results, computed progress, confidence and dated check-ins. A goal with no
  measurable results is unmeasured, not 0%. Authorship is co-authored, explicitly leader-set
  or unknown; unknown does not trigger the leader-set warning.
- Delegate an outcome with one accountable owner, expected result, resources/support, dates
  and explicit decision authority: recommend, agree first, act-and-inform or own.
- Check in, record blocks, complete with the delivered result, or explicitly accept the work
  back with a reason and next step. Closed delegations retain their history. Stretch delegations
  hand off in one click (**Add to GROW** / **Start GROW plan**, `Schema v12`) into an explicitly
  linked GROW commitment (`delegationId`) that survives carry-forwards, links bidirectionally
  across `#/delegations`, `#/growth`, `#/people/<id>`, CSV exports and `Hold review`, and prompts
  explicit coaching reflection when the delegation completes or returns — never silently closing
  the GROW commitment on your behalf.
- Today now shows an executable **delegation follow-through** queue for blocked work, overdue
  outcomes, missing due dates and stale check-ins. Record a check-in or explicitly complete the
  outcome directly from the queue; the existing validated dialogs/events are reused, and marking
  work on track does not complete it. The full queue opens `#/delegations?filter=attention`.
  Items are ordered for leader support, not to score or rank the owner; the configured check-in
  cadence is a team convention, and no reminder is sent.
- GROW plans separate Goal, Reality, Options and Will. A plan without a dated commitment is
  reported as incomplete, not treated as progress. Show competency coverage across the team.
- **Development commitments follow the same ledger as 1:1 promises** (`Schema v9`): each one can be
  closed in a recorded review, **carried forward** with a new date — the original stays in the plan
  history and "carried 2× since 14 Sep" is derived from the chain, never stored as a counter — or
  **dropped with a mandatory reason**. Dropped is never counted as done, and a dropped or carried
  version leaves the completion denominator, so moving a date cannot look like progress.
- **A review is a record, not a date edit.** *Hold review* captures when it happened, what was
  discussed, the outcome for every live commitment and the next date you agreed — and Today's
  **Development reviews** queue (`#/today`) surfaces overdue, due-within-7-days and unscheduled
  GROW reviews with an inline *Hold review* button so you can settle commitments without hunting
  through another screen. Pushing the review date without holding one increments a deferral
  counter instead of silently rescheduling: `GROW-07` fires at two deferrals, and `GROW-06`
  fires when one commitment has been carried twice. A closed or moved commitment is kept in an
  expandable record with its dates and reason.
- Succession readiness challenges unsupported claims using recorded development, feedback and
  conversation evidence (`#/readiness`), stores optional development-gap & stretch notes per
  seat, and wires a one-click **Start transition** handoff (from `#/readiness` or `#/people/<id>`)
  directly into a pre-filled `role-transition` 30-60-90 plan showing the candidate's readiness
  status and notes as context — without fabricating `roleClarity` or overwriting roster titles.

### Performance reviews

- Assemble an evidence packet for a person and inclusive period: dated 1:1s, feedback,
  goal check-ins, development, recognition and delegation outcomes with source links.
- Keep four self-reflection prompts separate from three manager-assessment prompts and an
  optional behaviour-anchored rating. Reflection is manager-entered, not independently
  submitted by an employee account.
- Seven calibration checks challenge thin, recent-only, one-sided or unsupported assessments.
  These are transparent prompts, not proof of fairness or an automated performance score.
- Completion recaptures and freezes evidence; reopening and refreshing are separate audited
  actions. Current goal/development/delegation values are labelled **at capture**, not falsely
  reconstructed at period end. Browser print/save-PDF is wired; visual print output remains
  **[UNVERIFIED]** in this session.
- A completed packet offers an explicit choice to open a goal or GROW form. The review's
  development focus is editable draft text; a goal still needs a measurable key result, and a
  GROW plan still needs a newly written Will commitment. Review next steps are shown as a
  discussion prompt, never copied into commitments. Each created record retains a validated
  `sourceReviewId`, links back to the packet in the UI and CSV, and remains blank on legacy records
  (`Schema v13`). Completing a review creates nothing by itself.

### Conflict resolution — a working record, not an HR case system

- Start with a neutral situation, coordinator and follow-up date; hear 2–8 participants'
  perspectives and underlying interests, including people outside your roster.
- Participation is unknown, willing or declined. Unknown is never consent. Informal
  agreement requires an explicitly appropriate route, everyone willing/heard, and recorded
  process and information-sharing limits.
- Record an explicitly confirmed agreement and 1–12 owned, observable, dated commitments.
  Keep agreement versions and the context captured with each one.
- Record real results, then an all-party follow-up that checks those results. An agreement
  is **not** resolution; an earlier same-day check cannot verify results recorded later.
- Close only when current-context commitments and verification support it. Reopening keeps
  history and requires a fresh check; materially changed context requires a new agreement.
- For serious/uncertain matters, record the qualified support contact and next check date.
  **A support handoff sends nothing and is not resolution.** The manager must contact the
  appropriate person; the app is not a mediator, investigation or emergency service.
- Private case content is excluded from generated 1:1 agendas, person timelines, readiness,
  health scoring and performance-review evidence. General reminders use counts/status only.
  This is exposure minimisation, **not access control**: full JSON backups include the notes.

### Team pulse

- Four dimensions: psychological safety, clarity, sustainable workload and growth.
- Default reporting floor is **5 complete responses**; supported settings are 3–25.
  Aggregate, dimension means and weekly trend use the **same complete four-answer cohort**.
  Partial responses cannot supply a misleading privacy floor or distort released means.
- Suppress the entire vector when any dimension, or each response's overall mean, is
  identical across the cohort. Otherwise overall/other means could reveal a suppressed
  dimension by subtraction. Future responses are excluded from current windows.
- Comments need their **own** minimum number of nonempty, varied comments. Score-response
  count alone does not release a lone comment. Suppressed comparisons stay null, not zero.
- Anonymous records store `personId: null`; imports strip an identity value. The local app
  cannot verify independent respondents or guarantee anonymity against a determined observer.
  Writing style and someone with access to the browser/export can still identify people.

### Decisions, recognition and next steps

- DACI decisions capture roles, reversibility, options and rationale, support audited edits when
  governance metadata changes (`DEC-03`), deep-link directly from `DEC-01`/`DEC-03` signals via
  `#/decisions?decision=<id>`, surface token-matched DACI involvement on `#/people/<id>`, and
  feed Today's actionable **Decision reviews** queue (`#/today`) with inline *Review outcome*
  settlement (guarding undecided choices out of `reviewsDue` and rewinding post-snapshot reviews
  in historical trends).
- Recognition records real contributions; drought prompts use logged dates.
- **46 deterministic signal rules**, including `ONB-01`…`ONB-05`, `CFL-01`…`CFL-04`, `GROW-06` and
  `GROW-07`, produce
  evidence, urgency and one next action. Similar person findings roll up rather than flooding the
  page. Conflict reminders never include case titles, names or notes and work without a roster.
- Optional demo data is clearly labelled. The demo refuses to replace real records without
  confirmation, including workspaces containing only delegations or conflict records.

### Optional passphrase encryption of the browser copy

- Turn it on in **Settings → Protect this browser copy**. The stored blob becomes a versioned
  envelope: PBKDF2-HMAC-SHA-256 (600,000 rounds, random 16-byte salt) derives an AES-256-GCM
  key from your passphrase; every write gets a fresh 96-bit IV. The passphrase is never stored,
  and the key never leaves the tab.
- **Plaintext → encrypted is verified before it overwrites anything:** derive, encrypt,
  decrypt, compare, then write. If any step fails the workspace stays plain text and says so.
- A reload shows a **lock screen** and nothing else: no navigation, no records, no half-loaded
  state. A failed attempt reports the failure and leaves the stored ciphertext byte-identical.
- While locked, **every write path is refused** — including imports, demo loading, reset and CSV
  export — so nothing can replace the only copy of the ciphertext. `Export JSON` in that state
  hands back the untouched encrypted file rather than an empty workspace.
- **Change passphrase** re-keys with a new salt (the old passphrase stops working), **Lock now**
  discards the key after flushing pending writes, and **Turn off encryption** writes plain text
  again only after the write succeeds.
- **Idle auto-lock:** an unlocked, encrypted workspace locks itself after a configurable window of
  inactivity (default 30 minutes, 0 = off, set in Settings). It warns first with a non-destructive
  "keep working or lock now?" prompt and locks automatically after one minute, so an unattended
  unlocked tab cannot leave your notes readable. The lock is recorded in the event log.
- **Encrypted backups:** `Export encrypted JSON` produces a portable envelope for the same
  passphrase (or a new one if the workspace is not encrypted). `Import JSON` accepts both
  plain-text and encrypted files; an encrypted import into a plain workspace is explicitly
  disclosed as a downgrade, and restoring an encrypted backup into a lock screen keeps the
  workspace encrypted.
- **Limits stated in the UI, not only here:** no recovery key, no reset link, no account; a lost
  passphrase means the encrypted copy cannot be opened. Encryption protects a copied profile or
  backup file, not a browser someone can already use while the workspace is unlocked. CSV and
  plain-text JSON exports remain unencrypted. Web Crypto requires a secure context — over plain
  HTTP on a LAN address the lock screen says so before you type a passphrase.
- Envelope headers (KDF name, rounds, salt, purpose) are bound into the GCM additional
  authenticated data, so tampering with them fails authentication instead of silently weakening
  the file; a foreign envelope asking for more than 2,000,000 rounds is refused rather than
  burning the CPU.

### Cross-domain operational cases & parallel rules automation (`#/cases`, `Schema v22`)

- Register an **Operational Case** (`incident`, `risk`, `escalation`, or `initiative`) on `#/cases`
  or escalate directly from an active **Goal**, **Delegation**, or **Decision**.
- Model each case across seven connected disciplines:
  - **Engineering FMEA (`computeFmea`):** Severity × Probability × Detection RPN (`1..1000`),
    **AIAG-VDA (2019) Action Priority** (elevating Severity 9–10 failure modes even when RPN is
    modest), and post-mitigation residual RPN reduction %.
  - **Math/Statistics & Finance (`computePertImpact`):** Three-point Beta-PERT financial cost and
    diverted team-capacity days ($\mu = \frac{O + 4M + P}{6}$, $\sigma = \frac{P - O}{6}$,
    $P_{10}..P_{90}$), expected unmitigated vs residual loss, net risk-adjusted value, mitigation
    ROI multiple, and explicit opportunity cost.
  - **Production / Safety Science (`evaluateRca`):** Structured **Toyota 5-Whys** causal chain,
    **Reason Swiss-Cheese** missing systemic barrier, preventive action, and an automatic warning
    when text blames an individual without naming a process guardrail.
  - **Political Science (`summarizeStakeholderCoalition`):** **Mendelow Power × Interest**
    stakeholder matrix (*Manage closely*, *Keep satisfied*, *Keep informed*, *Monitor*), stance
    tracking (`champion` → `blocker`), and scheduled briefing checkpoints.
- **Event-driven parallel cross-module propagation (`app/core/domain/automation.js`):** saving or
  updating a case (previewed live inside the dialog before saving) evaluates deterministic,
  idempotent rules inside a single atomic store transaction to simultaneously:
  1. Schedule stakeholder coalition cadences (`RULE-STAKE-01`),
  2. Create & link a PERT-backed **DACI Decision** (`RULE-DEC-01`),
  3. Create & link an accountable **Mitigation Delegation** with calibrated authority (`RULE-DEL-01`),
  4. Append a risk check-in & adjust confidence on the impacted **Goal** (`RULE-GOAL-01`), and
  5. Queue blameless support & barrier talking points into **1:1 agendas & printable prep sheets**
     (`RULE-COACH-01`) — strictly excluded from performance-review rating evidence and isolated
     from confidential `conflicts` and anonymous `pulses`.
- **Closed-loop feedback:** completing linked mitigation delegations automatically transitions an
  open/mitigating case to **Monitoring** (`RULE-SYNC-DEL-01`), and resolving the case records
  residual FMEA verification while appending a resolution check-in on the linked goal. `RULE-COACH-02`
  also turns only that case's tagged 1:1 support topic into a blameless systemic-learning prompt;
  reopening restores active support. Employee-raised topics are preserved, and neither prompt enters
  performance-review evidence.

### Capacity, flow & portfolio allocation (`#/capacity`, `Schema v16`)

The operating-plan layer. Goals, delegations, cases and 30-60-90 plans record *intent*; this is
the only screen that answers "given the people I actually have, what can we commit to, what has
to give, and how confident should I be in that date?" It applies four disciplines to the same
records:

- **Operations research — capacity supply.** Focused hours per person ÷ an 8-hour day × the
  planning horizon, reduced by an explicit **transition ramp** (active 30-60-90 plan: 0.45 in the
  first month, 0.75 while ramping, 0.8 in a role transition, 0.7 on return-to-work) and by a
  configurable **operational reserve** (default 20%) for interrupts and support. Headcount is
  never used as capacity.
- **Queueing theory — what utilisation actually costs.** **Little's Law** (WIP = throughput ×
  cycle time; Little, 1961) and **Kingman's diffusion approximation** give a queue-delay
  multiplier from utilisation, so 86% committed is shown as *≈7× service time spent waiting*
  rather than as a reassuring percentage. Throughput is measured from delivered items only, and
  the app refuses to state a rate from a single completion.
- **Economics & finance — allocation under scarcity.** Each item carries a three-point
  **Beta-PERT** effort and value estimate; ranking uses **value density** (expected value ÷
  expected person-days), the funding boundary is marginal (the next item that fits, and the first
  one that does not), and an over-committed plan names the **lowest-value committed work to
  release first** instead of the newest or least popular.
- **Statistics — a date range, not a promise.** Independent PERT variances are additive, so the
  funded portfolio produces **P50/P80/P90** completion dates and **cumulative** target-date risk
  (each target is judged against all work due by then, not against that item alone).

**Parallel cross-module automation (Schema v16):**

1. **`RULE-CAP-01` — capacity reserve registration.** Registering a case with a capacity estimate
   creates a committed reserve entry in the plan (dated from the case, linked `consumes-capacity`);
   editing the estimate updates that same record in place; resolving the case **releases** the
   capacity; reopening it reinstates the reserve. No second data entry, no duplicate.
2. **`RULE-CAP-02` — over-allocation trade-off decision.** When committed work exceeds allocatable
   capacity, exactly one **DACI decision** is opened (never more than one while it is unanswered)
   containing the real numbers and concrete options: defer the lowest-value item, cut the next
   one, accept the queue delay, or stop starting unfunded work.
3. **`RULE-CAP-03` — funding decision → goal impact.** Deferring or cutting goal-backed work
   writes an explainable check-in on that goal and, if it was on track, moves it to at risk;
   re-funding writes the follow-up. A capacity decision can never be silently detached from the
   objective it starves.
4. **`RULE-CAP-04` — delegation completion → portfolio delivery.** When a plan item is explicitly
   linked to an active delegation, recording its verified completion marks that item delivered on
   the same date, keeps the typed graph edge, writes an automation audit event and removes its work
   from committed capacity. Returned delegations do not trigger this rule; the engine does not
   mistake reassignment for delivery. A closed delegation cannot be used to create new open plan
   demand. **Sync rules** also repairs existing completed-delegation links from older workspace
   state; it is safe and idempotent to run again.
5. **`RULE-CAP-06` — settled case capacity calibration → portfolio.** After at least five cases
   have recorded actual diverted days and the median actual/forecast ratio is at least 1.25×,
   settling or backfilling a case automatically refreshes every open case reserve in the same
   transaction. Normal-priority cases use the observed median; high-priority cases use the
   observed P80. The reserve (not the case estimate) receives the contingency, then capacity
   trade-off and seeded Monte Carlo tail-risk rules re-run. The live case dialog previews the
   adjustment and sample size. The frozen opening estimate is unchanged for honest later scoring;
   below n=5 or below the 25% threshold there is no automatic uplift. This is a local reference
   class, not a validated universal coefficient or external benchmark.

Signals `CAP-01`–`CAP-05` report utilisation, queue delay/WIP breaches, undecided demand, missing
effort estimates and unachievable target dates. A **`portfolio`** CSV scope (19 total, with `hiring`) exports the
whole ledger with derived PERT values and value density, formula-injection safe.

### Selection & hiring (`#/hiring`, `Schema v17`)

Hiring is the highest-leverage decision most managers make and the one they get the least training
for, so LeadOS models it as a measurement problem with a decision at the end rather than a pipeline
with a score. A **requisition** records what the role must be able to do, who will interview, and
(optionally) the interview effort it will consume. A **candidate** record holds the evidence
collected and the decision — and nothing about protected characteristics.

- **Industrial/organisational psychology — the method determines the weight.** Each observation is
  tagged with the method used, and methods carry the validity coefficients from **Sackett, Zhang,
  Berry & Lievens (2022)**, the re-analysis that corrected decades of range-restriction
  overcorrection: structured interviews `.42`, job-knowledge tests `.40`, work samples `.33`,
  cognitive ability `.31`, unstructured conversations `.19`, years of experience `.07`. (Schmidt &
  Hunter's 1998 table is the better-known predecessor and is higher on every method — work samples
  were `.54` and ranked first; the 2022 revision puts structured interviews first. Using the newer,
  lower numbers is the conservative choice, and it changed one product claim: the app no longer
  calls a work sample the strongest available signal.) A 5/5 structured interview moves the estimate
  by at most `.42`, which is exactly why one conversation cannot decide anything.
- **Statistics — combined in log-odds, discounted when correlated.** Evidence is summed on the
  log-odds scale and converted back once. A repeated rating of the same competency by a different
  interviewer counts half; by the same interviewer, a quarter — so five unstructured chats with one
  manager never masquerade as five independent signals. A 3/5 rating is genuinely neutral and moves
  the estimate not at all. Rater disagreement of three or more points on one competency is
  **surfaced, not averaged away**: the app says to run a work sample or a calibration conversation.
- **Decision science — the falsification test.** Every assessment states how many further strong
  observations at the opposite extreme would move the estimate across the 50% line. The estimate is
  labelled decision support, never a prediction, and the offer gate is described as a convention
  (evidence weight ≥ `0.50`, at least two methods, all required competencies covered) rather than a
  validated cutoff.
- **Economics — the vacancy is never free.** The funnel tracks stage counts and conversion rates;
  a **cost of vacancy** is reported only from a daily figure the leader recorded. If none is
  recorded the app says the delay is unpriced rather than deriving one from a salary band. Cycle
  time is withheld below two completed hires, the same small-sample discipline as the flow metrics.
- **Process fairness without protected data.** No attribute is stored, so the check made is
  procedural: the same competencies assessed for everyone who reached the same stage. A rejection
  resting on less evidence than the process promised is allowed only with an explicit, recorded
  acknowledgement — the same gate as an offer made on thin evidence.

**Parallel cross-module automation (Schema v17):**

1. **`RULE-HIRE-01` — interview effort becomes committed capacity.** An active requisition with a
   recorded three-point effort estimate creates a `hiring`-kind entry in the operating plan
   (`consumes-capacity`, funded, value deliberately unmeasured), refreshed in place when the
   estimate or target changes, **completed as delivered** when the seat is filled, and **released**
   when the role is cancelled or held. A requisition with no estimate reserves nothing: the plan
   never invents an effort figure.
2. **`RULE-HIRE-02` — an accepted offer closes the loop into people and onboarding.** Accepting an
   offer creates the roster record and a new-hire 30-60-90 plan (seeded with the standard
   checkpoints, anchored on the agreed start date), marks the role filled, writes typed edges
   `candidate → requisition`, `requisition → person` and `person → onboarding`, and completes the
   interview reserve so its capacity returns to delivery. One action, one transaction, no
   re-entry.
3. **`RULE-HIRE-03` — a stalled role becomes an operational case, once.** A role that has not moved
   for the configured window (`hiringStallDays`, default 30) is escalated through the *same* path as
   every other module, so the case arrives with FMEA severity/probability/detectability, financial
   PERT fields, a stakeholder coalition, a DACI decision and an accountable delegation already
   attached. The `autoEscalated` flag on the requisition keeps it to exactly one case for the life
   of the role, even if that case is later closed.

Signals `HIRE-02`–`HIRE-07` report stalled roles, target-date slippage, roles with no competencies,
interview effort missing from the plan, final-round decisions short on evidence, and uneven process
coverage. A **`hiring`** CSV scope (19 total) exports roles, competencies, evidence weight and
coverage per candidate with formula-injection protection; it is flagged as sensitive because it
contains named candidate data. Deleting a candidate record removes its evidence and graph edges —
data minimisation is an obligation, not an archive policy.

### Candidate data: a retention reminder, never an automatic eraser (`Schema v18`)

Candidate records are the most sensitive thing this workspace holds and the least useful once the
decision is made. They are now covered by an explicit data-minimisation review rather than by hope:

- **`candidateRetentionDays`** (default **180**, `0` turns the review off) sets how long a closed or
  settled record stays useful. A candidate still in play on an open role is never flagged — that
  record is the working file for a live decision.
- **Nothing is deleted automatically.** A timer that erases records inside a local tool that also
  keeps the audit trail can destroy the reasoning behind a decision someone is still questioning. The
  app lists what is past the window on `#/hiring` and raises signal **`HIRE-08`**; a person decides,
  record by record, with a confirmation that names what else goes (the evidence, the graph edges) and
  says it cannot be undone.
- **"Keep in touch" is an exemption, and it stays visible.** A silver medallist you intend to call
  about the next opening is listed as exempt rather than silently skipped, so retaining a record
  remains a decision you can see.
- **The clock runs from the last recorded fact** about the person (decision, offer, hire or activity).
  A record with no dates is reported as unknown age, never guessed at, and a typo in the setting falls
  back to the default rather than switching the reminder off.

### Longitudinal team-health & habit trends and scoped CSV export

- View **8-week, 12-week and 6-month** checkpoint trends across composite health, all five
  health dimensions, feedback observation-to-conversation latency and delegation follow-through
  on `#/health` (with direct dimension drill-down from `#/today`).
- Checkpoints before the workspace recorded management activity stay `pre-history` (`null`),
  never `0`. Historical reconstruction restores team members archived after a past checkpoint
  (preventing survivorship bias), uses Schema v5 dated check-in/completion snapshots where
  present, marks pre-snapshot mutable fields **`approximate`** (hollow chart markers + plain
  explanation), and compares composite deltas across **matched dimensions** so newly unlocked
  pulse data never produces a false composite drop.
- Every trend chart pairs non-color stroke/shape encoding with a collapsible HTML data table
  (`<th scope="col|row">`) carrying exact checkpoint values and privacy-suppression states.
- Export **17 purpose-limited CSV tables** from Settings (`people`, `onboarding`, `oneOnOnes`,
  `actions`, `feedback`, `goals`, `delegations`, `growthPlans`, `recognition`, `readiness`,
  `decisions`, `cases`, `caseLinks`, `reviews`, `pulseSummary`, `healthTrends`, plus
  confirmation-gated confidential `conflicts`) with a copyable preview modal when downloads are
  restricted.
- Export an **operational copy** (Settings, plain or encrypted): a restorable JSON backup with
  the confidential conflict records and their event-log traces left out, for moving devices or
  sharing records upwards. The omission is declared inside the file (counts only) and in its
  `leados-operational-…` filename; restoring one reports what was left out, and replacing a
  browser that still holds conflict records requires explicit confirmation — so the safe-to-
  share file can't quietly become the one that deleted your mediation history.
- Text cells starting with `=`, `+`, `-`, `@`, control whitespace or full-width formula
  prefixes (`＝`, `＋`, `－`, `＠`) are prefixed with `'` (OWASP CWE-1236) while negative
  numbers stay numeric and unknown values stay blank (`""`). `pulseSummary` exports only
  anonymity-checked weekly aggregates and independently thresholded comments.

## Data integrity and architecture

- **Schema v18**, with additive v1→…→v18 migrations; pre-v5 records retain `null` for unknown
  historical completion dates and check-in snapshots rather than fabricating history. Normalization
  additionally repairs hiring records rather than rejecting the workspace: an unknown candidate
  stage falls back to the earliest real stage, out-of-order effort triples are re-ordered, an
  interviewer, competency or candidate/requisition reference that no longer exists is dropped with a
  warning, and an out-of-range rating is clamped. The v5→v6
  through v10→v11 steps add onboarding, 1:1 ownership, GROW history and explicit onboarding kinds
  without inferring missing facts. v11→v12 adds explicit GROW-to-delegation links; v12→v13 adds
  nullable performance-review provenance on goals and GROW plans; v13→v14 adds the separate
  `state.managerSupport` ledger; v14→v15 adds `state.cases`, `state.links` and
  `settings.caseReviewDays` (default 14) without fabricating historical cases or links, and strips
  any forbidden `conflict` or `pulse` link references on normalization. v15→v16 adds
  `state.portfolio` and four planning conventions (`capacityHoursPerWeek`, `planningHorizonWeeks`,
  `operationalLoadPct`, `wipLimitPerPerson`); existing goals, cases and delegations are **not**
  converted into portfolio items, because an effort or value estimate nobody gave would be
  invented data. v16→v17 adds `state.requisitions`, `state.candidates` and three hiring conventions
  (`hiringBaseRate` as an explicitly labelled prior assumption, `hiringStallDays`,
  `interviewHoursPerStage`) without converting any person, goal or case into a role or a candidate:
  who you have and who you might hire are different facts, and the migration reports what it left
  empty rather than inferring it. v17→v18 adds one hiring convention — the candidate retention
  reminder — and deliberately adds **no field to any candidate record**: a retention clock has to
  start from a date that was actually recorded, so the review reads the existing dates at review time
  instead of back-filling a `retentionStartsOn` nobody ever observed. Open cases with recorded capacity days still count as implicit reserves. Existing check-ins and 1:1
  actions are never migrated into manager commitments. Recorded check-ins gain stable IDs so a
  follow-up preserves the exact phase and the date captured when the manager chose the task.
  Normalization warns on a broken source link but preserves the manager's open commitment text.
  Unrecognised 1:1 owner values are cleared and reported, never coerced into a plausible one; GROW
  "will" actions carry no owner field at all.
- Follow-through links are repaired on load and import, in plain language: a successor that is
  missing, belongs to another person, sits earlier in time or forms a cycle clears the carry and
  reopens the promise; a successor that names a predecessor with no forward link has the link
  rebuilt; duplicate action ids inside one meeting are dropped with a warning.
- Load/import normalisation reports repairs. Conflict dates, explicit confirmation, supported
  closure and reopening boundaries are rechecked; malformed/duplicate conflict history produces
  warnings. Oversize conflict writes are rejected before any state/event change, not silently cut.
- The static server allows only the canonical shell/assets, rejects write methods, and refuses
  symlink aliases. It does not publish scratch backups, `.env`, `.git`, test tools or legacy source.
  Historical console/docs files remain in the repository but are no longer served by this entry.
- Future/invalid declared schema versions are not silently downcast: imports are rejected;
  incompatible saved data is write-protected and exports unchanged for recovery. Only explicit
  compatible import/reset can replace it, and protection survives a failed replacement write.
- Corrupt JSON opens a fresh workspace with a warning; recovery quarantine is **best effort**,
  capped at 500,000 characters and can itself fail when storage is full. Keep external backups.
- Each storage write replaces one JSON blob. On ordinary write failure, changes remain **in
  memory only**, with a persistence error; conflict dialogs and Settings report this explicitly.
  Imports adopt nothing unless the replacement saves. Reloading loses unsaved in-memory changes.
- Meaningful mutations append events; the general log retains the latest **600** entries.
  Conflict agreement/check/transition history stays in its record. Neither is tamper-proof.

```text
index.html                 shell, landmarks, navigation and modal/toast roots
app/main.js                router, application context, shell and error boundary
app/actions.js             DOM-free validated write API
app/conflict-actions.js    conflict lifecycle validation and generic audit events
app/core/                  schema, injected storage/clock, pure domain modules
app/core/crypto.js         PBKDF2-SHA-256 + AES-256-GCM envelope (no I/O, injectable crypto)
app/ui/                    shared DOM/forms/dialogs/charts
app/views/                 route renderers, not persistence implementations
tests/app/                 node:test domain/store/jsdom tests
```

No runtime framework, package dependency, account, network service or model inference was
added. Research and product tradeoffs are in `RESEARCH.md` §§14–40.
The five health dimensions use weights 24/20/20/16/20 for cadence/feedback/clarity/growth/
wellbeing. Missing dimensions stay null and weights renormalise; grades are A/B/C/D/F.
Historical comparison uses Schema v5 dated snapshots where recorded and explicitly labels
checkpoints `approximate` when pre-v5 or in-place edited fields lack history.

## Verification — 2026-10-26, session 32

- `npm run verify:canonical`: **`eslint .` (`0` errors/warnings), `check:boundary` (`79` canonical ES modules & `38` test suites, `0` quarantined-tree or network leaks), `check:links` (`0` broken internal links), and `475 passed, 0 failed, 0 skipped` across 38 suites** (up from 457 across 37 before Session 34).
- New `tests/app/case-calibration.test.mjs` (10 tests, Session 32) verifies:
  1. Hand-pinned FAIR frequency × magnitude maths (occurrence Brier fixtures, exposure/spend/diverted-days
     ratios, the actuarial loss-development aggregate), snapshot-first vs `resolution-estimate` scoring,
     verdict sample floors, and reference-class hint floors.
  2. `RULE-FCT-03` opening-forecast freeze at first quantification (creation or later edit), immune to
     subsequent estimate edits; settled-actuals capture in `resolveCase` + `recordCaseActuals` backfill
     with validation; reopen voiding; point-in-time actuals rewind.
  3. `RULE-FCT-04` one-shot under-reserving governance decision (median ≥1.25× at n=5) linked to the
     worst settlement, idempotent while unreviewed; `FCT-05`…`FCT-07` firing on sufficient evidence and
     silent on the demo baseline ("collecting evidence", one settlement at 1.1939×).
  4. Regression coverage for both Session 32 audit defects: the `updateCase` closed-status capacity-reserve
     leak (reserve now released + goal check-in via the Edit path) and `reopenCase` stale resolution notes.
  5. v21→v22 additive migration with dirty-actuals/snapshot repair and null-preservation; `cases` CSV
     settlement columns + `calibration` CSV case rows with CWE-1236 escaping; JSDOM `#/cases` card,
     settled-actuals detail panel and both dialogs with `axe-core` (0 violations).
- New `tests/app/scenarios-sensitivity.test.mjs` (7 tests, Session 30) verifies:
  1. Strict zero-mutation isolation (`projectScenarioState`, `compareScenarios`, `computeSensitivityTornado`, and opening/toggling `#/scenarios` leave `store.state`, `localStorage`, and `events` untouched).
  2. Law & Kelton Common Random Numbers (`seed`) determinism and variance reduction across scenario deltas.
  3. Brooks's Law onboarding mentoring drag vs. Watkins 30-60-90 ramp crossover (late hires reduce near-term horizon net capacity; early hires with freed interview reserve add net capacity).
  4. Keeney–Raiffa Pareto frontier dominance classification and Eschenbach/Howard One-at-a-Time Tornado P80 schedule swing ranking.
  5. `RULE-SCN-01` (#21) non-destructive DACI logging (`recordScenarioDecision`) vs. atomic workspace commitment (`commitScenarioLevers`, cascading `RULE-CAP-01`, `RULE-CAP-03`, `RULE-CAP-05`, and `RULE-CHG-01`..`05`), `SCN-01` Pareto-relief insight, and `sensitivity` CSV (#21) formula-injection escaping.
  6. Regression coverage for all **7 pre-existing cross-module defects** discovered in the Session 30 audit (`documentTitle` routes, `cases[].stakeholders[].keyMessage` governance/redaction, `RULE-CAP-05` catalog threshold wording, `reconstructStateAt` candidate rewind, `personOptions`/`goalOptions` sentinels, `openSettingsDialog` simulation/change fields & zero-allowed minima, and `personSupply` future `startDate` proration).
  7. End-to-end interactive `#/scenarios` UI lever edits, hypothetical request injection, modal commitment (`RULE-SCN-01`), and `axe-core` (`0` violations in JSDOM).
- Live HTTP static server (`scripts/serve.mjs`) verified returning `200 OK` with expected MIME types for `/`, `/app/main.js`, `/app/core/domain/scenarios.js`, and `/app/views/scenarios.js`.
- **Not verified in Session 30 (`[UNVERIFIED]`):** `@sparticuz/chromium` is not installed in this container's `node_modules` and external browser CDNs are outside the sandbox allowlist, so real graphical browser rendering (`1440px`/`390px`/`320px`) of the new `#/scenarios` view and `tornadoChart`, spoken assistive-technology announcements (NVDA/JAWS/VoiceOver/Orca), Firefox/Safari engines, print pagination, and real-manager field comprehension remain **[UNVERIFIED]**.

## Verification — 2026-10-25, session 20

- `npm test`: **315 passed, 0 failed, 0 skipped** across 24 test files.
- Scoped ESLint on the changed application modules and affected tests, `node --check` for changed
  JavaScript, and `git diff --check` passed.
- JSDOM/API tests cover explicit task creation after a held phase check-in, blank user-controlled
  task text, stable source phase/date through edits/carries, Today and 1:1 ledger actions, real
  meeting reconciliation, CSV provenance, snapshot rewind, and exclusion from performance-review
  evidence. These are automated tests, not real-browser or usability validation.
- `npm ci --no-audit --no-fund` installed the existing lockfile dependencies; package manifests
  and lockfile were not changed. No build, backend, dependency or network request was added.
- Real mobile/browser and assistive-technology validation, manager/employee comprehension, print
  output, large-workspace behavior, and full manual legacy source/build/deployment audit remain
  **[UNVERIFIED]**.

## Verification — 2026-10-25, session 27

- `npm test`: **408 passed, 0 failed, 0 skipped across 29 suites** (session 26 shipped 368 across
  27). New: `tests/app/retention.test.mjs` (23, candidate-data retention), `tests/app/scale.test.mjs`
  (5, large-workspace correctness and timing) and `tests/app/access-audit.test.mjs` (12, structural
  accessibility and destructive-confirmation safety). Timings and method are in the
  [validation report](docs/VALIDATION-2026-10-25-session-27.md).
- **Dependency audit remediated:** `next` 16.2.6 → 16.4.3, `postcss` 8.5.8 → 8.5.31,
  `eslint-config-next` → 16.4.3, `drizzle-kit` 0.31.10 → 0.31.11. `npm audit --omit=dev` now reports
  **0 vulnerabilities** (was 1 critical, 2 high). Four moderate advisories remain in a dev-only
  `drizzle-kit → esbuild 0.18.20` chain whose advisory concerns a development *server* that this
  repository never runs; the offered "fix" is a breaking downgrade of the migration CLI, so it was
  declined and explained rather than applied.
- **The legacy Next app does not build, and did not before this change** — verified against both
  dependency sets: `next build` fails on `src/lib/agent/tools.ts` importing `toolEffects` from
  `src/db/schema`, and `tsc --noEmit` reports 6,977 errors. Deployment is therefore moot rather than
  "risky"; the canonical zero-build app imports none of these packages. This is recorded, not fixed:
  repairing a non-canonical tree is a separate decision.
- **Real browser and screen-reader validation could not be performed here.** Playwright's browser CDN
  and Google's are outside the sandbox network allowlist; the in-package `@sparticuz/chromium` build
  launches only with `libnspr4`/`libnss3`, which requires a system package install the container
  cannot reach. In place of a browser, a structural audit asserts what axe cannot: one `h1` per
  screen with no skipped levels, an accessible name on every interactive control, captioned tables
  with `scope`d headers, landmark structure and a working skip link, dialog focus trap and
  restoration, and state that is announced rather than only coloured. Reading order and
  comprehension with an actual assistive technology remain **[UNVERIFIED]**, as does any manager's
  real hiring decision.
- **Large-workspace validation:** a 120-person / 300-case / 180-item / 40-role / 320-candidate
  workspace with 900 typed edges normalizes in ~35 ms, builds insights in ~42 ms, and exports all 19
  CSV scopes in under 50 ms each; every edge resolves at both ends and a second normalization is a
  no-op. A 300-role × 5,000-candidate stress case exposed an O(roles × candidates) scan in
  `hiringSummary` and the hiring CSV export, now single-pass indexed (~110 ms at that ratio).
- Five defects were found by these tests and fixed: destructive confirmations that ran *before* the
  user answered (and, in cases, showed no message at all), focus lost to `<body>` when a dialog
  trigger was re-rendered away, two uncaptioned capacity tables, a retention window that a typo could
  silently switch off, and the quadratic scan above.

## Verification — 2026-10-25, session 26

- `npm test`: **368 passed, 0 failed, 0 skipped across 27 suites** (baseline before this session was
  341 across 26). The new `tests/app/hiring.test.mjs` adds 27 tests covering the evidence
  mathematics (log-odds combination, correlated-evidence discounting, neutrality at 3/5, the
  falsification test), competency coverage and the offer gate, process parity, the cycle-time floor
  and vacancy honesty, the v16→v17 migration and normalization repairs, action validation, and the
  three automation rules end to end — including "a stalled role raises exactly one case even after
  repeated syncs" and "accepting an offer creates the roster record, the 30-60-90 plan, three typed
  links and frees the reserve, once".
- `axe-core` in JSDOM: **0 violations** on `#/hiring`, on `#/hiring/:id?candidate=…` and inside the
  requisition dialog. One genuine defect was found by the suite and fixed: two tables had an empty
  header cell, which axe reports as `empty-table-header`.
- `scripts/serve.mjs` returns `200` for `/`, `app/main.js`, `app/views/hiring.js`,
  `app/ui/hiring-modals.js`, `app/core/domain/hiring.js` and `app/styles.css`.
- Not verified: no GUI browser, screen reader or mobile device was available in this container, so
  real-browser rendering, keyboard traversal, print output and assistive-technology announcements
  for the new screens remain **[UNVERIFIED]**. No manager has used this module on a real hiring
  round, so the validity weights are the published coefficients applied as weights — not evidence
  that this implementation predicts anyone's performance.

## Verification — 2026-10-25, session 22

- A review of the shared form helper found that inline validation errors were announced as alerts
  and marked invalid, but were not connected to their matching fields. The helper now adds the
  current error ID to `aria-describedby` while preserving help text; a successful retry removes
  the stale error description. See the [focused audit](docs/AUDIT-2026-10-25-session-22.md).
- The updated JSDOM and manager-follow-up Chromium checks verify the field's `aria-invalid`,
  `role=alert` error text, both help/error descriptions and error cleanup. Axe remains at zero for
  the selected views, but it did not discover this relationship gap by itself.
- No actual screen reader/assistive technology, GUI browser, or comprehension study was available.
  NVDA/JAWS/VoiceOver/TalkBack/Orca announcements, possible duplicate alerts and manager/employee
  comprehension remain **[UNVERIFIED]**.

## Verification — 2026-10-25, session 21

- The two existing Chromium smoke scripts and the new `scripts/app-manager-support-smoke.mjs`
  all pass with headless Chromium **153.0.8010.0**, using isolated fictional records and no
  external application requests.
- The new script runs the recorded Day 30 check-in → separate manager-authored action with a
  manager-chosen date → exact source link → explicit completion in a real held 1:1. It checks
  that candid blocker text is not copied into the commitment or the 1:1 board, and that opening
  the 1:1 dialog creates no synthetic meeting.
- At **1440×1000** and **390×844**, the covered screens have no horizontal overflow. Eight axe-core
  scans for WCAG 2.1 A/AA rule tags report zero findings. Browser keyboard checks cover initial
  focus, Tab and Shift+Tab containment, Escape dismissal and focus return to the opener.
- These are selected automated checks in one headless Chromium version, not full visual review,
  screen-reader certification or a manager/employee comprehension study. Those, other browser/
  device configurations, print/PDF and large-workspace behavior remain **[UNVERIFIED]**.

## Verification — 2026-10-25, session 19

- `npm test`: **312 passed, 0 failed, 0 skipped** across 24 test files.
- Scoped ESLint on changed application modules and schema-version tests, changed-module syntax
  checks, and `git diff --check` passed.
- JSDOM exercised both review handoff forms, source validation/export and reverse links. No real
  Chromium/mobile or assistive-technology test was run for this increment; those remain
  **[UNVERIFIED]**.
- Legacy build/runtime/security, print/PDF output, full manual source review, large-workspace
  performance and manager/employee outcomes remain **[UNVERIFIED]**.

## Historical verification — 2026-10-25, session 17

- `npm test`: **305 passed, 0 failed/skipped** across 23 test files (`tests/app/*.test.mjs`).
  The 293-test baseline passed before edits. Twelve new `onboarding-queue.test.mjs` tests
  cover inclusive UTC date boundaries, deterministic ordering, all three plan kinds, archived/
  inactive/orphan/future exclusions, unheld phases, no private-data access, validation, inert
  cancellation, in-place logging, exact-plan/all-due filters, persistence/audit history, visible
  failed writes, and XSS-safe rendering. Existing migration, encryption, follow-through,
  performance-review, decision, GROW, prep, pulse, export and actual-HTTP server tests still pass.
- All 55 canonical JS modules pass `node --check`; scoped ESLint passes with zero warnings.
- **Chromium 153.0.8010.0:** both optional smoke scripts pass, using isolated fictional records,
  no user's browser data and no external application requests. The new script covers Today →
  overflow → full check-in queue → validation → log re-boarding conversation → save/reload →
  exact source plan → stale-link recovery. The existing script covers conflict lifecycle,
  export/import, keyboard trapping, fifteen mobile routes and health. Combined, **11 WCAG
  A/AA axe scans report zero violations**, including color contrast in real Chromium.
- No horizontal document overflow at the tested **1440×1000** desktop and **390×844** mobile
  states. Browser verification found and repaired existing onboarding-toolbar and Settings
  export/backup-button overflow; the older smoke script's two stale checkbox selectors now
  use the real accessible labels.
- Demo re-measured at `2026-10-25T10:00:00Z`: health **55.1 (C)**, matched 30-day trend **+8.3**
  (`previous: 46.8`, `approximate`), **37 findings / 25 rule IDs / 12 urgent / 4 wins**, unchanged.
  Today's new queue shows Samuel's Day 30 check-in **8 days overdue**. No demo records changed.
- Schema stays **v12**; no migration, account, backend, runtime dependency or network call was
  introduced. `npm audit --omit=dev` still reports 1 critical / 2 high legacy dependency findings.
- **[UNVERIFIED]:** full manual line-by-line legacy review/build/runtime, Safari/Firefox,
  real screen-reader and physical-device use, print/PDF visual output, large-workspace
  performance and real-manager outcome improvements. Automated source inventory is not
  personal verification of all 333k source lines. See the [audit](docs/AUDIT-2026-10-25-session-17.md).

Optional browser reproduction on Linux (tools are test-only, installed in ignored scratch):

```sh
# Keep the static server running in another terminal.
npm install --prefix tmp/browser --no-save --no-audit --no-fund \
  playwright-core@1.64.1 @sparticuz/chromium@153.0.0 axe-core@4.11.0
node scripts/app-browser-smoke.mjs
node scripts/app-onboarding-smoke.mjs
node scripts/app-manager-support-smoke.mjs
# Evidence: tmp/browser-evidence/, tmp/onboarding-evidence/ and
# tmp/manager-support-evidence/ (not committed)
```

## Known limitations and next

- **One leader, one browser profile.** No accounts, employee submission, multi-manager sharing,
  authentication or background notifications. Never store notes you are not authorised to hold;
  export contains sensitive data. Clearing site data deletes the workspace.
- Pulse suppression is intentionally more conservative: some previously visible sparse,
  unanimous or thin-comment windows now remain hidden. A floor is not an anonymity guarantee.
- Cadence and latency/check-in cadences are configurable; the review queues use a fixed
  seven-day look-ahead. None is a validated universal deadline. No real-manager longitudinal validation or proof of improved outcomes is claimed.
- Encryption is optional and passphrase-only: no recovery key, no key escrow, and no protection while the workspace is unlocked and in active use. An unlocked, encrypted workspace now auto-locks after a configurable inactivity window (default 30 minutes, 0 = off, set in Settings), warning first so nothing in progress is discarded. CSV and plain-text JSON exports are always unencrypted, and full JSON backups still contain conflict
  notes; the operational copy leaves conflict records and their event traces out, but still
  contains 1:1 notes, feedback and reviews — "conflict-free" is not "safe for any audience".
  Its omission marker is a declaration the import path trusts, so a hand-edited unmarked file
  is indistinguishable from an honestly conflict-free workspace. Enabling encryption replaces
  the browser's single stored blob, so a passphrase lost before the next unlock is
  unrecoverable by design.
- Follow-through is self-reported. A promise is only recorded as kept, carried or dropped when
  the leader logs the next 1:1; the app cannot observe delivery, and it deliberately sends no
  reminder (no backend, no notifications). A workspace with few logged 1:1s therefore shows few
  reconciliations — the gap is the missing conversation, not a hidden tracking failure.
- Ownership is whatever the leader recorded. "Not recorded" is a real state that the board counts
  and the export leaves blank; the app never infers an owner from who tends to do that kind of
  work, and "What you owe" is private to the browser (no employee view exists, so nobody else can
  see it or hold the leader to it).
- The 1:1 prep sheet is assembled from records, not a meeting transcript: it surfaces what was
  promised and still open, and cannot recover a conversation that was never logged. "Topics they
  want to raise" is recorded by the manager because the app has no employee login — the manager
  is the scribe, not an employee-submitted form. Print/PDF visual output remains **[UNVERIFIED]**
  in a real browser.
- Hiring stores candidate names and interview evidence in the same local browser copy as everything
  else. A retention *reminder* (default 180 days, `Schema v18`) lists records past the window and
  raises a signal, but deletion stays explicit, one record at a time, and audited — a workspace shared
  with a laptop profile still shares its candidates, and a reminder is not a guarantee that anyone
  acted on it. The validity weights are published population averages used
  as fixed weights (structured interviews: `.42`, 80% interval `.18`–`.66`), not a prediction about
  any individual, and no manager has run a real hiring round against this module, so whether the
  weighted read improves a real decision is **[UNVERIFIED]**. Cost of vacancy is reported only from a
  daily figure the leader enters; if it is left blank the module shows the delay as unpriced rather
  than estimating one.
- **Organizational Design, Team Topologies & Shewhart XmR Statistical Process Control (`#/changes`, `Schema v19`)**:
  models team-boundary redesigns, charter changes, and ritual shifts across Kotter's 8-Step progression
  (with foundational-skip warnings), Lewin Force-Field driving vs. restraining barriers, Conway's Law /
  Skelton & Pais Team Topologies + Sweller Cognitive Load + Brooks inter-team coordination channels
  (`N(N-1)/2`), Galbraith's 5-Point Star + Holmström–Milgrom incentive-mismatch checks, Mendelow +
  Tsebelis veto-player coalitions, and Beta-PERT transition effort & J-Curve payback economics. Active
  changes propagate atomically (`RULE-CHG-01`..`05`) into capacity reserves (`#/capacity`), DACI charter
  decisions (`#/decisions`), opted-in Watkins 30-60-90 `role-transition` plans (`#/onboarding`) + blameless
  1:1 prep (`#/prep/:id`), coalition briefing schedules, and linked OKR risk telemetry (`#/goals`),
  cascading vertically into `RULE-CAP-02` if transition reserves + role-transition ramps push team
  capacity past 100%. Shewhart/Wheeler Individual & Moving Range (`XmR`) charts (`X̄ ± 2.66 mR̄`, `URL = 3.267 mR̄`,
  Western Electric Rules 1–4) separate routine common-cause noise from real special-cause process shifts
  on both `#/changes/:id` metrics and `#/health` longitudinal trends (requiring ≥4 measured windows and ≥3
  adjacent moving ranges; missing windows are never interpolated). Force-field weights, cognitive load
  ratings, and transition economics remain manager-estimated inputs rather than observed telemetry, and
  participation in an organizational change never enters individual performance review evidence. Real-browser
  visual rendering and screen-reader usability on `#/changes` remain **[UNVERIFIED]**.
- **Seeded Monte Carlo Portfolio, Critical-Chain Bottlenecks & Coupled J-Curve Simulation (`app/core/domain/simulation.js`, `#/capacity`, `#/changes/:id`, `Schema v20`)**:
  deterministic Mulberry32 PRNG + Marsaglia–Tsang Gamma / Vose Beta-PERT sampling (`seed = 42` default,
  configurable 250–5,000 trials in Settings) simulates right-skewed 3-point PERT commitments jointly across
  funded portfolio work, incident reserves, hiring effort, and active organizational changes. Surfaces Sam
  Savage's *Flaw of Averages* (`overloadProbability` when expected person-days appear to fit `≤ 100%`),
  Goldratt's *Critical Chain* owner-constrained `P50`/`P80`/`P90` calendar dates vs. fungible team-sum dates,
  variance-contribution sensitivity drivers, and coupled Satir J-curve valley depth & payback quantiles on
  `#/changes/:id`. Wired into `RULE-CAP-05` (idempotent goal tail-risk check-ins + Flaw-of-Averages DACI
  trade-off decisions) and `SIM-01`/`SIM-02` signals, with accessible SVG histogram & fan charts backed by
  expandable HTML data tables. Trial independence is assumed; correlated common-mode shocks are not modelled.
- **Pre-Export Candidate Retention (`HIRE-08`) & Contextual-Integrity Disclosure (`app/core/domain/export-governance.js`, `app/ui/export-dialogs.js`, `Schema v20`)**:
  before exporting plain JSON, operational JSON, encrypted backups, or `hiring`/`cases`/`changes` CSV scopes,
  LeadOS inspects the workspace for overdue candidate records past `candidateRetentionDays` (GDPR Art. 5(1)(e)
  storage limitation), disabled retention windows, confidential conflict cases, and candid `skeptical` /
  `resistant` / `opposing` stakeholder or veto-player notes (Nissenbaum *Contextual Integrity*). Offers
  optional export-only redactions (`pruneOverdueCandidates`, `redactStakeholderStances`, `redactConflicts`)
  that scrub the exported copy without mutating the live workspace and append a private-content-free
  `export.disclosed` audit event.
- **Non-Persisted Counterfactual Scenario Sandboxing, Pareto Frontier Dominance & One-at-a-Time Tornado Sensitivity (`app/core/domain/scenarios.js`, `#/scenarios`, `Schema v20`)**:
  rehearses scope trims (Reinertsen CD3), uncommitted urgent requests, incident mitigation (`#/cases`),
  active org-change phasing (`#/changes`), Brooks's Law hiring start-date vs. mentoring drag (`#/hiring`),
  and Argyris & Schön double-loop operating-policy shifts (`operationalLoadPct`, `capacityHoursPerWeek`,
  `wipLimitPerPerson`) over isolated `structuredClone` snapshots using Law & Kelton Common Random Numbers
  (`seed`), without mutating `store.state` or appending audit events until explicitly committed. Surfaces
  Keeney–Raiffa Pareto-optimal vs. dominated options, Samuelson marginal shadow pricing of capacity,
  Tsebelis veto-player / OKR coalition risk, and an accessible diverging SVG `tornadoChart` ranking
  one-at-a-time P80 schedule drivers (`sensitivity` CSV #21). Explicit commitment via `RULE-SCN-01` (#21)
  records a calibrated DACI decision (`recordScenarioDecision`) or atomically executes levers across
  portfolio, cases, changes, goals, and settings (`commitScenarioLevers`). Graphical browser rendering of
  `#/scenarios` in Session 30, spoken screen-reader output, and real-manager comprehension remain
  **[UNVERIFIED]**.
- **Forecast Calibration & Reference-Class Learning Loop (`app/core/domain/calibration.js`, `#/decisions`,
  `#/capacity`, `Schema v21`)**: closes the loop over the app's own predictions. Decisions now record an
  optional Cromwell-clamped (5–95%) probability when the call is made — scenario decisions derive theirs
  automatically from the CRN overload odds — and the outcome review scores it with Brier (1950),
  Murphy (1973) reliability/resolution/uncertainty decomposition and an accessible reliability
  (calibration-curve) diagram; the forecast is frozen after review so hindsight cannot game the record.
  Funding planned work freezes its PERT forecast into an immutable snapshot (`RULE-FCT-01`) so delivery
  actuals — now captured in the Deliver dialog or backfilled later, never pre-filled from the estimate —
  score the belief held at commitment. Median actual/estimate ratios, interval-coverage honesty, and
  Flyvbjerg (2006) reference-class uplifts feed the Capacity delivery forecast; ≥5 scored items at
  ≥1.25× median optimism opens one DACI governance decision (`RULE-FCT-02`), while `FCT-01`…`FCT-04`
  signals surface estimate bias, too-narrow ranges, decision overconfidence, and unrecorded actuals.
  Verdicts refuse to render below n=5 (the demo honestly shows "collecting evidence": Brier 0.04, n=2
  estimate pairs). Ships with the `calibration` CSV scope (#22). Graphical browser rendering of the
  Session 31 calibration card, spoken screen-reader output, and field comprehension remain
  **[UNVERIFIED]**.
- **Case-Cost Calibration Ledger (`app/core/domain/calibration.js`, `#/cases`, `Schema v22`)**: the third
  prediction ledger, completing the learning loop over operational risk. When a case is first quantified,
  `RULE-FCT-03` freezes its opening beliefs (PERT exposure distribution, diverted-capacity expectation,
  planned mitigation spend, pre-mitigation FMEA probability) into an immutable snapshot; when the case
  resolves, settled actuals — did it materialise, realised exposure, actual mitigation spend, actual
  diverted days, each recordable independently and never pre-filled from the estimate — score against
  that frozen forecast. FAIR's (Freund & Jones, 2015) two legs are scored separately: occurrence
  (FMEA-implied probability vs materialisation, Brier) and magnitude (realised vs expected exposure
  with interval-coverage honesty), alongside spend and diverted-days discipline (the diverted-days leg
  is also the first accuracy read on `RULE-CAP-01` capacity reserves, deliberately excluded from the
  effort ledger in Session 31). The aggregate Σrealised ÷ Σexpected-unmitigated is the actuarial
  loss-development factor for the case book; at n≥5 with median development ≥1.25×, `RULE-FCT-04`
  opens one DACI decision offering reference-class contingency uplifts, linked to the worst
  under-assessment, while `FCT-05`…`FCT-07` surface reserve adequacy, occurrence blind spots and
  unscored settlements. **`RULE-CAP-06` closes the ledger-to-capacity loop:** once five actual
  diverted-days settlements establish a ≥1.25× median under-reserve, open case capacity reserves
  receive a median uplift (P80 for high-priority cases), automatically re-triggering deterministic
  capacity trade-offs and seeded Monte Carlo tail-risk checks. The dialog previews the factor and
  sample count; case estimates and their frozen scoring baseline remain untouched. Five is a
  conservative product trigger, not statistical proof or a universal policy, and real-team
  validation remains **[UNVERIFIED]**. Session 32 also fixed two audited cross-module defects: closing a case via
  the Edit dialog previously leaked its capacity reserve as open forever, and reopening left stale
  resolution notes diverging from a reload. Graphical browser rendering of the case-cost card and
  `caseRatioChart`, spoken screen-reader output, and field comprehension remain **[UNVERIFIED]**.
- Legacy build/runtime, Safari/Firefox, spoken assistive-technology output and physical-device
  use, print visual output and field comprehension remain **[UNVERIFIED]**.
- **The legacy Next app does not build and is quarantined under [ADR-0007](docs/adr/0007-legacy-next-tree-disposition.md).**
  `next build` fails on `src/lib/agent/tools.ts` importing a `toolEffects` export that does not exist in
  `src/db/schema`, and `tsc --noEmit` reports 6,977 errors; the root `App.tsx` imports `./lib/store`,
  `./lib/seed`, `./lib/engine` and `./components/*` that are not in the repository. ADR-0007 freezes these
  non-canonical paths as a read-only historical archive and enforces `npm run check:boundary` so canonical
  `app/**` modules never depend on them. Session 27 removed every production advisory (`npm audit --omit=dev`:
  **0**); four moderate advisories remain in a dev-only `drizzle-kit → esbuild 0.18.20` chain.
- **Accessibility is verified in Headless Chromium `143.0.7499.0` + `jsdom`, not with spoken screen readers.**
  Session 29 executed real Headless Chromium `143.0.7499.0` against `scripts/serve.mjs` across 11 routes at
  `1440×1000`, `390×844`, and `320×800` (WCAG 1.4.10 Reflow) plus 4 live modals, uncovering and fixing 7 real
  contrast, label-in-name (`wcag21a`), and flex-reflow defects (`0` `axe-core` WCAG 2.1 AA violations and `0`
  horizontal overflows post-fix). Spoken screen-reader output (NVDA, JAWS, VoiceOver, Orca), Firefox/WebKit
  rendering, and human manager comprehension remain **[UNVERIFIED]**. See the
  [Session 29 validation report](docs/VALIDATION-2026-10-25-session-29.md) and earlier
  [Session 27 validation report](docs/VALIDATION-2026-10-25-session-27.md).

## Documentation

- [ROADMAP.md](ROADMAP.md) — verified inventory, ordered next work and rejected directions.
- [RESEARCH.md](RESEARCH.md) — frameworks, product benchmarks and design consequences.
- [ADR-0012](docs/adr/0012-operational-resilience-continuity-terminal.md) — Operational Resilience, Dependency Topology & Continuity Terminal architecture decision.
- [ADR-0011](docs/adr/0011-decision-tempo-terminal.md) — Decision Tempo & Timing Terminal architecture decision.
- [Session 29 validation report](docs/VALIDATION-2026-10-25-session-29.md) — real Chromium 143 WCAG 2.1 AA & 320px/390px/1440px reflow audit, defects fixed, and `[UNVERIFIED]` boundaries.
- [ADR-0007](docs/adr/0007-legacy-next-tree-disposition.md) — frozen archive-in-place quarantine disposition of the legacy Next.js / Vite trees.
- [Current audit](docs/AUDIT-2026-10-25-session-23.md) — Session 23 cross-domain operational cases, parallel automation engine, and verification boundaries.
- [Session 22 audit](docs/AUDIT-2026-10-25-session-22.md) — inline validation error accessibility audit.
- [Session 19 audit](docs/AUDIT-2026-10-25-session-19.md) — Session 19 handoff audit, source provenance and verification boundaries.
- [Session 18 audit](docs/AUDIT-2026-10-25-session-18.md) — delegation-queue gap decision and verification boundaries.
- [Previous audit](docs/AUDIT-2026-10-25-session-17.md) — phase-conversation queue, source inventory and browser evidence.
- [Session 4 audit](docs/AUDIT-2026-10-24-session-4.md) — conflict lifecycle and Chromium baseline.
- [Historical audit](docs/AUDIT-2026-10-24.md) — original record with explicit corrections.
- [AI-SESSION-LOG.md](AI-SESSION-LOG.md) — cumulative session history, including corrections.

## Session 56 (2026-10-28) — Predictive Anomaly Intelligence
- Added #/anomaly terminal with Shewhart XmR, linear prediction bands, Brier-calibrated confidence, and RULE-ANOM-01 event-driven cross-module propagation.

### Anomaly integrity correction (2026-10-28)
The earlier Session 56 description immediately above is **superseded**: the former anomaly rule returned descriptors, not actual cross-module records, and its forecast was not Brier-calibrated. `#/anomaly` now displays descriptive weekly open-case snapshots and exploratory in-sample XmR limits only. No forecast or anomaly-driven records are created. Detected reopenings and missing dates suppress the series; editable dates and the capped event log mean historical fidelity is not guaranteed. Existing operational-case automation remains separate and creates linked decision, delegation, goal, coaching, capacity and communication records when applicable. The canonical schema is now v37 (Session 57, Operating System Dynamics Lab); the anomaly work described here never required a version bump of its own.
