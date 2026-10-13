# LeadOS — Leadership Operating System · v13.0 (Session-13 build)

An offline-first operating system for a leader **of team leads** — especially a new one. Vanilla JavaScript. No framework, no backend, no accounts, no APIs, no OAuth, no credentials, no build step, **no network dependency at all** (icons are inline SVG; fonts are system fonts; it runs from a double-clicked file). The entire application is one `index.html`; all state lives in `localStorage`.

Open `index.html` in a browser. That is the whole install. First boot seeds a tense example org so every instrument is visibly live; set yourself (`#/data` → identity), then erase the example when your real org arrives.

## The storage contract (unchanged, deliberately)

- **Key: `leados.v6` (lineage key — intentionally not renamed).** Renaming the key at v7 would silently orphan every existing user's data. The *record* carries the truth: `v:7`.
- **Migrations are additive and stepwise (v1…v6 → v7)** and announce themselves in the record's own system log. v6→v7 adds succession seats, advocacy packets, gate/study maps and per-person record dates — **no existing record is rewritten**.
- Newer records (`v>7`) are held for a decision; a silent downgrade is refused. Corrupt bytes are preserved at a side key (`leados.v6.corrupt-<ts>`), main key untouched, in-memory blank **not saved** until you decide (download-damaged / start-clean / import).
- Quota: writes surface in the top bar (`saved HH:MM · N KB` → red `WRITE FAILED` with byte count and remedy). `quota-pressure` wakes past ~70% of the ~5MB estimate. `export-overdue` nags past 14 days. Imports: v7 direct, v1–v6 migrate in-memory; wrong shapes fail loudly without touching state. Merge re-mints every id, rewires the whole graph (people/teams/cases/goals/handoffs/commitments/evidence/roles/packets/mediations/AARs/rituals) through one map, then re-runs the audits with repair.

## What v13 adds (the answer to "what else does a new multi-team leader need")

1. **`#/talent` — succession & readiness [flagship].** Key seats carry title, team, holder, criticality (1–3), **emergency cover**, and a dated successor slate (now / <1yr / 1–2yr). Readiness is computed advisory — nine-box, flight risk, trust, delegation verdicts won, telemetry depth; HIGH flight −28, stale nine-box halves — **with the basis printed per row**. Assigned-vs-computed disagreement is shown as *your call, on the record*. Four rules guard it: `talent-gap` (critical seat + HIGH-flight holder + no ready-now + no cover = firing advisory), `talent-no-cover`, `talent-stale` (60d), `talent-thin` (empty slate). Bus-factor map on `#/health` reads the same wires.
2. **`#/promote` — advocacy packets.** The app assembles a promotion case **from the evidence ledger**: evidence count (≥6), months span (≥2), backlinks to closed cases/goals/decisions, fresh nine-box. Under the bar, **submission is refused** — an unevidenced packet is an opinion with a salary attached. The narrative field is explicitly *your* voice over *their* record. A `won` verdict banks a public win; a `declined` writes a dated development task from the first open gap. `promote-stalled` fires past 45 open days; `promote-ready` is a positive-lane advisory.
3. **Sponsor duty for *your* new leads.** Any person becoming `role:lead` auto-arms a dated 3-task sponsor chain (charter/fears · first feedback · 30-day retro). `sponsor-neglect` fires when a lead in seat ≤45d goes 10 days without a *measured* session.

Also fixed this session (see defect ledger in `AI-SESSION-LOG.md`): palette keyboard selection is now visible; `FW.bench` restored to pure (now argument); sealed cases no longer show a comms drawer; seed audit-coherence held to the write path.

## The case spine (architectural core — unchanged doctrine)

Register a case **once**, anywhere — top bar, quick capture (`case: …`), palette, any person page, or `C`. The intake shows a **live pre-commit preview**: Cynefin domain with move hint · Eisenhower quadrant · severity SLA runway (5→1d, 4→2d, 3→4d, ≤2→14d) · keyword reclassification with trip-words named · the **exact list of writes** · duplicate refusal · the lesson journaled at the last closed case of the same type. On commit the engine writes real, linked records into every routed module — evidence, playbook tasks, SBI draft, decision stub (sev≥4/crisis), comms drawer (sev≥4), goal at-risk flag (bidirectional), cascade to the owning lead, cross-links on shared scope — every write trapped in the case's **propagation ledger** with click-through routes.

- **Identical open duplicates are refused** and route you to the existing case (audit class `dup-cases` watches it hold).
- **Closure is checked, not assumed**: outcome + lesson mandatory, orphan playbook tasks cancelled *with a count*, goal flags cleared only by the closure that owns them, lesson journaled, +30d verification armed (held, or honest re-open — SLA clock restarts, on the record), AAR armed for sev≥4 (`tuition-unpaid` holds until it exists).
- A delivered correction whose +21d verification lapses past the 7-day grace **auto-opens a feedback-breakdown case** at boot (idempotent via `lapsedCaseId`, toast-announced) — the machine's arm, on the record.

## The hard-stop (unchanged, non-negotiable)

Case intake keyword-scans (harassment, discrimination, safety, medical, fraud, legal, retaliation, self-harm, threat, assault, accommodation, racism, sexual, abuse, violence). A hit re-classifies to a **sealed HR escalation before commit**, names the trip-words live, and requires two deliberate acknowledgments. The machine writes exactly four wires: the case record, the verbatim evidence, an unsnoozable HR-contact task dated today, and an agenda pin. Audit class `ethics-wires` fails loudly on any fifth wire; its safe-repair revokes the wire *records*. PIP and separation templates do not exist anywhere in this codebase, and never will. Mediation halts in one write into the same sealed escalation. Three advisory classes cannot be snoozed: **escalation-open · hr-task-due · integrity-fault**.

## Module map (23 nav routes + 2 detail routes)

| Route | Depth |
|---|---|
| #/today | Pace governor · **Next Best Move with its ranking printed** (locked > sev-breach > oldest dated task > your debt > positive > signal) · dated work · conduits due (HIGH flight compresses 14d→7d) · commitment debt **both directions, yours first** · 7-day weight strip · positive signals · quick capture bar |
| #/signal | Full rule ledger: locked / firing / positive lane / dated snoozes / clear. Every rule states **why it exists** and **when it clears**. Snooze is dated, never amnesia |
| #/cases · #/case/:id | 10 intake types + sealed class · SLA runway bars · playbooks · comms drawer (never on sealed) · checked closure · verify / re-open · propagation ledger timeline |
| #/people · #/person/:id | Flight risk (weighted driver ledger + written intervention for the top driver) · trust equation (C+R+I)/S with weakest-numerator fix · clickable nine-box (120d staleness halves the bench stamp) · morale telemetry with ≈ estimate chips · auto-agenda · evidence ledger with case backlinks · succession/advocacy posture |
| #/oneonones | Cadence board · skip-level lane (45d clock) · finish modal consumes auto-agenda (discussed cases get ledger entries) · estimated-flag honesty enforced at write |
| #/feedback | SBI/AID/COIN + live lint (**delivery blocks under 2/3 specificity**) · ageing clocks (praise 48h / corrections 72h) · +21d correction verification · balance board with sample size shown |
| #/coach | GROW runner · live quality score (will-without-date fails) · question bank · arc history |
| #/delegation | SLII skill×will → style + rung · **mismatch warnings both directions** · mandatory boundary + checkpoint · verdicts feed the bench; bounced → re-contract task |
| #/mediation | Six stages, order enforced, stages 2 & 5 gated on written notes · halt-to-HR in one write · agreement filed as evidence to both parties + +14d follow-up |
| #/handoffs | Cross-team debt ledger · acceptance commitments written automatically to the receiving lead · silence clock + heat · "done" without acceptance is labeled a ledger lie |
| #/goals | Direction-aware KR scoring (down-metrics) · check-ins with **confidence as the leading indicator** · trajectory-vs-waterfall reasoning printed · expired goals graded only with a causal lesson |
| #/decisions | Type-1/2 doors · premortem ≥3 (form + audit) · decide writes choice+rationale · re-date requires a recorded reason, **rendered in history** · outcome grading → calibration with sample-size honesty |
| #/health | Fortnight 6-dim pulse with deltas · Edmondson 7-item (2/4/6 reverse-scored) · five-dysfunctions ladder gated on written evidence · **bus-factor capability map wired to succession** |
| #/org | Lead rollup (span, flight board of reports, cascades out, telemetry freshness) · team pulse with the attribution fallback **stated on the card** · bench/staleness/evidence-depth table |
| #/talent | **v13** — succession seats, readiness scores with basis, emergency cover, gap advisories. Scores advisory; the slate is yours |
| #/promote | **v13** — advocacy packets assembled from evidence; thin records refused; verdicts wired to wins and development tasks |
| #/transition | 90-day protocol · 12 gates with LIVE/PENDING machine signal + mandatory note (**signing against PENDING allowed and visibly stamped**) · stakeholder map (hostile-first) · win ledger |
| #/ritual | Computed staff agenda (lead one-liners by severity×flight heat, cross-team state, decisions ≤7d, rotating unstudied dev case) · stamp-the-room writer (attendance, `@name · what · by date` commitments into the debt ledger, optional ratified decision) · meeting kill list priced in **org-hours** — kill writes a decided decision |
| #/aar | Tuition-unpaid lane · expected-vs-happened **in numbers** · 5-whys · blameless stop-condition · improvements become owned, dated commitments · quality score |
| #/review | Auto 7-day digest · 8-week pressure series (in vs out) · 60-second upward brief (brackets are yours; the machine does not lobby) · lesson journal · stamped rituals |
| #/academy | 6 lessons · 3 scored checks + written application note each · the refusal card |
| #/about | Judgment contract · the refusals · **live counts** · storage reality · shortcuts · **self-test wall executed on open** |
| #/data | Identity (drives the 90-day clock) · storage meter · **12 executable audit classes** with safe-repair only where mechanically unambiguous · export/import · prune with counts · example-org load/erase · system log |

## Live counts (printed from code on #/about; grep-verified against this file)

- **52 rules** (`grep ^R\('` → 52) · **34 pure FW models** (`Object.keys(FW).length`, live) · **12 audit classes** (`grep ^\{id:'[a-z-]+',name:` → 12) · **16 self-tests** (`grep \{id:'t\d+',t:` → 16) · **25 routes** (23 nav + case/person detail) · **43 form surfaces, all handled** (`data-f` inventory cross-read against `FORMS`) · **48 `data-a` usages, all dispatched** (cross-read against `ACT`).

## Instrument honesty

Untouched 1:1 sliders write `estimated:true`. Estimates render ≈, **never move a slope, never trigger or clear an advisory**. Audit class `telemetry-honest` *executes a probe* (synthetic series with estimated injections must equal the series minus them) and range-checks every stored mood. Estimated sessions say so in the system log at write time. **Write every note as if it will be read aloud in the grievance room** — the phrase sits on every surface that writes about a person.

## Shortcuts & capture grammar

`/` or `Ctrl/⌘-K` palette · `C` register case · `1-9 0` jump (today · signal · cases · people · 1:1s · feedback · coach · decisions · AAR · review) · `Esc` close.

`case: …` · `commit: @name … by +3` · `owe: @name … by tomorrow` · `praise: @name …` · `note: @name …` · `win: …` — dates: `today · tomorrow · +Nd · next week · YYYY-MM-DD`. Unparseable → **nothing written, said out loud**; unknown verb → a prefilled case intake, not a silent drop. First-name collisions resolve to the first match, audibly.

## Files

| File | Role |
|---|---|
| index.html | The entire application |
| README.md | This file |
| AI-SESSION-LOG.md | Session-13 engineering record: repo verification, critique, v13 build record, QA ledger, defect ledger, honesty ledger |

## Known limits (held open, stated, not smoothed)

ISO-day strings, no timezone nuance · pressure is record-derived, not calendar-integrated (the kill list is the local answer) · nine-box staleness is view-time, not destructive · team pulse falls back to org pulse per team, stated on the card · import-merge is append-only beyond re-minting · gate signals read app state only (the machine cannot verify what happened in a room — which is exactly why the note is mandatory) · GROW/SLII are simplified canonical mappings, labeled in-line · readiness scores are advisory by doctrine · capture person parsing matches first names · the seed is tense on purpose and the first-paint advisory count is whatever `#/signal` prints.

**If any claim in this README disagrees with what `index.html` does, the file wins and the README is wrong.**
