# AI-SESSION-LOG — LeadCore continuation engineering

Session: rebuild + deepen from repo read. Role: technical peer, not assistant. This log is written to be argued with.

---

## 1. Critique on arrival (positions taken, held or folded)

**P1 — The upstream `index.html` fetch was truncated (~57k tokens in).**
Reconstructing "the same app" from a partial read guarantees broken contracts: README numbers the code can't back, routes that render nothing, ledger targets pointing at collections that never got written. Verdict: do not patch a ghost. Rebuild end-to-end against the spec's *verifiable invariants* and publish an honesty ledger in the README (deltas: 52 rules / 22 renderers / 26 models / 14 case types / 2 scenarios here vs 49/22/28/16/4 claimed upstream). Status: **held.**

**P2 — "More features is better" is wrong as stated, and the user's own depth rule is the rebuttal.**
The failure mode of 22 modules isn't thinness — it's **alert fatigue + ritual debt**. A new manager-of-managers ignores 50 advisories by week three unless arrival is automated. Shipped stance: *nothing enters the tree unless the case spine or another engine can write into it.* That's why diagnosis records, comms drafts, pipeline reqs, ADKAR risk rows, feedback drafts, KT fan-out all originate from `Engine.createCase` propagation rather than from manual module entry. Status: **held.** If you want MORE modules next pass, the gate is the same: name its propagation route first or it doesn't ship.

**P3 — localStorage-only is the standing production risk, structural, unfixable by cleverness.**
~5MB, synchronous, unencrypted, one profile from total loss. Mitigations are discipline, kept and surfaced: failed writes in the top bar (never silent), quota meter in sidebar + #/data, export nag past 14d, post-import auto-audit, import-time id re-mint. Status: **held.** Do not let anyone talk you into a "sync later" half-step; that way lies a credentials DB and the death of the constraint.

**P4 — Escalation automation stops in the write path, not the UI path.**
Advisory-only guardrails are theater.  The engine refuses to create playbooks for escalation-class cases; the record, the verbatim evidence, and the today's-date HR task are all that exist. The 3 unsnoozable advisories mirror that in the read path. Status: **held, non-negotiable, inherited intact.**

**P5 — Seed through the production engine or don't seed.**
A seed that writes records directly teaches drift between "demo shape" and "real shape." This build's seed calls `Engine.createCase`, `Engine.scheduleOneOnOne`, `Engine.premortemToRisks` — the example org is real org data with `seed:true` flags, erasable in one click. Status: **held.**

## 2. Changelog (this session)

- Full rebuild: 22 renderers / 19 nav routes, 52 mentor rules, 26 pure models, 14 case types, 12 lessons (6 arcs, 4 scored checks), 2 three-stage simulators, 6 guardrailed scripts.
- Case spine with propagation ledger + click-through routes for all routed writes; idempotent intake; verified closure with +30d re-openable verification.
- Escalation hard-stop in write path; kw trigger list; unsnoozable trio in mentor.
- NEW depth beyond upstream README: one-click instrumentation fixer (person + readiness), derived succession bench as pure model (nine-box × ladder × overlap × trust) feeding a rule, calibration-drift model + rule, ADKAR-on-risk with stalled-gap rule, accept cascade (person+ramp+first 1:1 in one write), premortem→risk auto-drafting, welcome-back digest, time-mix targets with rule, meeting economics, retro carry-forward, closure/correction verification loops.
- Bug fixes found on self-review post-draft (all crash-or-corrupt class, all closed): dead segment in case intake; comma-operator trap flattening readiness triples in #/self; arrow-fn-as-HTML in plan checkpoint modal; sidebar footer ternary swallowing the export line; operator precedence in feedback follow-up agenda template.
- Seed now includes a stalled pipeline candidate so Hiring is alive on first paint.

## 3. QA performed (no browser runtime here — static verification only, stated honestly)

- Full-file sweep: no TODO/FIXME/stub/placeholder-function leftovers (only legitimate `placeholder=` attributes).
- All `data-a` targets cross-checked against the Actions registry; all `Routes` referenced by NAV exist; detail routes parse in `render()`.
- Referential model: 15 ref classes enumerated in Integrity audit; ledger resolution audited; hiring cascade closed-loop checked by audit.
- Model assertions executable at runtime via audit: Edmondson reverse-scoring, KR down-direction, flight boundedness — the app tests ITSELF on demand from #/data.
- NOT done: real browser execution. If anything throws, the render-level try/catch surfaces it in-view and in telemetry instead of white-screening — verify on first open, read the top bar.

## 4. Watchlist (failure modes to attack next pass — pick one, not all)

1. **Advisory interaction listeners accumulate on #modalroot across SBI composer opens** — harmless at session scale, fix by namespacing or one-time delegated binding.
2. **Snoozed advisories are invisible on #/today** — deliberate (deferred = out of sight), but a deferred escalation-adjacent item can't exist by class; recheck if new rules ever inherit `no`.
3. **Mood capture is single-question at 1:1 close** — thin sensor feeding an 8-driver model. Next depth: optional 3-item pulse, sliding-window slope.
4. **No conflict detection between cases** — two open cases on the same person of related types (flight + underperformance) should cross-link automatically; currently they only co-appear on the person page.
5. **Scenario count is 2** — the framework (staged opts + scoring + journal write) is proven; depth here is content-hours, not code. Priority scenario: the departure/bench discipline arc, since the engine side already exists.
6. **Print stylesheet is agenda/script-first** — HR packet prints acceptably; grids could use a dedicated print reflow.
7. **localStorage JSON round-trip per write is O(state)** — fine at 5MB-scale human data; if telemetry shows write latency, move to debounced save. Don't preemptively optimize this.

## 5. Standing rules for the next session

- Depth > breadth. Every module must receive from the spine; no module ships on manual entry alone.
- No stubs, no placeholders, no `// TODO`. If it can't be finished in the pass, it doesn't ship in the pass.
- Escalation path never gets "smarter." It gets shorter.
- README numbers must match the code. Count before you write them.
- The integrity audit is the definition of done: it must stay green, and new collections mean new ref classes added to it in the same diff.
