# LeadOS — Leadership Operating System · v12.0 (Session-12 build)

An offline-first operating system for a leader **of team leads** — especially a new one. Vanilla JavaScript. No framework, no backend, no accounts, no APIs, no OAuth, no credentials, no build step, **no network dependency at all** (icons are inlined SVG; fonts are system fonts; it runs from a double-clicked file). The entire application is one `index.html`; all state lives in `localStorage` (key `leados.v6`, record version `v:6`) in one browser profile. No leadership data ever leaves the browser. **That constraint is permanent and non-negotiable.**

Open `index.html` in a browser. That is the whole install. First boot seeds a tense example org so every instrument is visibly live; set yourself (`#/data` → identity), then erase the example when your real org arrives.

---

## What this session is (read this before anything else)

The prior README/AI-SESSION-LOG in this repository described a 281 KB application (54 rules, 33 models, 21 renderers, sessions 7–11). **That application was not in the repository.** Session 12 verified by direct read: the shipped `index.html` was an 813-byte Vite/React shell for an unrelated design-studio site, mounting a `/src/main.tsx` that did not exist, with `package.json` declaring React + Vite + GSAP (framework, build step, and web-font network calls — every "permanent constraint" violated at the scaffold level). The repo history was ~2 days of web uploads with no evidence a real build ever shipped.

v12.0 keeps the *documented contract* — same store key and record version, same seed narrative, same doctrines (telemetry honesty, ethics hard-stop, propagation ledger, checked closure, dated snooze, positive lane, live counts) — and implements it **for real, in this file**. Where this build diverges from prior *prose*, this README and the session log say so. The honest numbering is: **first build where code and docs match.** The full postmortem is in `AI-SESSION-LOG.md`.

## What this is, and what it refuses to be

It is **not an oracle**. Trust here is **auditability**: every count in this README is printed live from code on `#/about`, twelve self-tests execute at every boot and are re-rendered there, the telemetry probe runs inside audit class `telemetry-honest`, and every recommendation shows its basis. The machine never fakes certainty — estimates are ≈-chipped, gate signals are labeled hints, calibration reports its own sample size.

| The app owns | You own |
|---|---|
| Detection (**39 rules**, live-counted), scoring (**31 pure FW models**, live-counted), sequencing, record-keeping, cadence, pace, escalation timing | The judgment call |
| Forcing decisions / outcomes / lessons / closures to be recorded with rationale and a date | Living with the outcome |
| The review loop that turns experience into skill — the actual course substitute | Reading the loop honestly |
| Escalation timing (hard-stops to HR) | The humanity of that room |

**The hard-stop stands.** Case intake keyword-scans every registration (harassment, discrimination, safety, medical, fraud, legal, retaliation, self-harm, threat, assault, accommodation, racism, sexual). A hit re-classifies the case to an HR escalation **before commit**, names the trip-words live in the preview, and requires two deliberate acknowledgments. On commit the machine writes exactly three things: the case record, the verbatim evidence, and an unsnoozable HR-contact task dated today. Audit class `ethics-wires` fails loudly if an ethics case ever carries any wire outside the sealed set `{intake, evidence, hr-task, agenda}`, and its safe-repair revokes the wire *records*. PIP and separation scripts do not exist anywhere in the codebase, and never will. The mediation protocol halts in one write into an HR escalation. PIP/separation content is refused by doctrine, not by a filter — there is no code path for it. Three advisory classes cannot be snoozed: **escalation-open · hr-task-due · integrity-fault**.

## The case spine (architectural core)

Register a case **once**, anywhere — top bar, quick capture (`case: …`), palette, any person page, or `C`. The intake shows a live pre-commit preview: Cynefin domain with move hint · Eisenhower quadrant · severity SLA runway (sev 5→1d, 4→2d, 3→4d, ≤2→14d) · keyword reclassification with trip-words named · the **exact list of writes** · duplicate refusal · the lesson journaled at the last closed case of the same type. The engine then:

1. Selects the type's dated playbook (up to 3 tasks) into the task stream.
2. Writes real, linked records into every routed module — evidence, 1:1 agenda injection, SBI draft, decision stub (sev≥4 / crisis), comms drawer (sev≥4), goal at-risk flag (wired both directions), cascade to the owning lead, cross-links on shared scope — every write trapped in the case's **propagation ledger** with click-through routes.
3. **Refuses identical open duplicates** and routes you to the existing case. Audit class `dup-cases` watches it hold.
4. Closure is **checked, not assumed**: outcome + lesson mandatory, orphan playbook tasks cancelled *with a count*, goal flags cleared by the closure that owns them, lesson journaled, +30d verification armed (held, or re-open — re-open restarts the SLA clock, on the record), AAR armed for sev≥4. `tuition-unpaid` holds until the AAR exists.
5. A correction whose +21d verification lapses past the 7-day grace **auto-opens a feedback-breakdown case** at boot (idempotent via `lapsedCaseId`, toast-announced) — the machine's arm, on the record.

## Module map — routes (detail views: `#/case/:id`, `#/person/:id`)

| Route | Depth |
|---|---|
| `#/today` | Pace governor (meeting- and dependency-aware) · **Next Best Move** with its ranking stated in the UI · quick capture (fixed bar) · conduits due · commitment debt both directions — **yours ranked higher** · 7-day strip · positive signals |
| `#/signal` | Full rule ledger: firing / dated snooze (3d/7d) / clear · locked lane · positive lane · severity order. Every rule states *why it exists* and *when it clears* — an advisory that cannot clear does not ship |
| `#/cases` · `#/case/:id` | 10 intake types + sealed ethics class · SLA runway bars · playbooks · failure modes inline · propagation ledger · cross-links · comms drawer · checked closure · verify / re-open |
| `#/people` · `#/person/:id` | Flight risk (**weighted driver ledger** + written intervention for the top driver) · trust equation (C+R+I)/S with weakest-numerator fix · nine-box click-grid with 120d staleness (**staleness halves the bench stamp**) · evidence ledger with case backlinks · morale telemetry with ≈ estimate chips · auto-agenda · bench read with reason ledger |
| `#/oneonones` | Cadence board (HIGH flight risk auto-compresses 14d→7d, on the record) · finish modal consumes the auto-agenda (discussed cases get ledger entries) · skip-level lane · est-flagged pulse honesty enforced at write |
| `#/feedback` | SBI/AID/COIN composer + live lint (delivery **blocked under 2/3 specificity**) · ageing clocks (praise 48h / corrections 72h) · delivered corrections owe +21d verification · balance board (60–85% zone) |
| `#/coach` | GROW runner · live quality score · question bank · arc history |
| `#/delegation` | SLII skill×will → style + rung · **mismatch warnings both directions** (over drowns them, under caps the bench) · mandatory boundary + checkpoint · verdicts feed the bench; bounced → re-contract task |
| `#/mediation` | Six stages, order enforced · stages 2 & 5 gated on written notes · halt-to-HR in one write · agreement files evidence to **both** parties + +14d follow-up task |
| `#/handoffs` | **New in v12** — cross-team dependency ledger: who owes whom what, by when, with an owner on the receiving side · silence clock + heat · stalled rules · acceptance commitments written automatically · "done" without acceptance is labeled a ledger lie |
| `#/goals` | Direction-aware KR scoring · check-ins with confidence (the **leading** indicator) · waterfall vs trajectory reasoning printed · expired goals graded only with a **causal** lesson ("because…" enforced) |
| `#/decisions` | Type-1/2 doors · premortem ≥3 enforced at the form and re-checked by audit · decide writes choice+rationale · re-date requires a recorded reason (rendered history) · outcome grading → calibration with sample-size honesty |
| `#/health` | Fortnight 6-dimension pulse with deltas + team scoping · Edmondson 7-item scan (2/4/6 reverse-scored) · five-dysfunctions ladder (advances only on written evidence) · bus-factor capability map |
| `#/org` | Lead rollup (span, flight board, cascades you asked them to handle) · team pulse with the attribution fallback **stated on the card** · bench/staleness · bus-factor exposure |
| `#/transition` | 90-day protocol · 12 gates with machine signal LIVE/PENDING + mandatory note (**closing against PENDING is allowed and stays visible**) · stakeholder map (influence × stance, hostile-first) · tours · win ledger |
| `#/ritual` | Computed staff agenda from live state (per-lead one-liners by severity+flight heat, cross-team items incl. stalled handoffs, rotating development slot from an unstudied closed case) · stamp-the-room writer (attendance, `@name · what · date` commitments into the debt ledger, optional ratified decision, dev case marked studied) · meeting kill list with **minutes × attendees** org-hours and keep/fix/kill verdicts — kill writes a decided decision so it stays dead |
| `#/aar` | Tuition-unpaid lane · expected-vs-happened **in numbers** · 5-whys · blameless stop-condition · improvements become owned, dated commitments the engine chases · live quality score |
| `#/review` | Auto 7-day digest · 8-week pressure series · 60-second upward brief (brackets are yours; the rest is assembled from records; printable) · lesson journal · stamped rituals |
| `#/academy` | 6 lessons · 3 scored checks + mandatory journaled application note each · the refusal card |
| `#/about` | The judgment contract · the refusals · **live counts** · storage reality · shortcuts · **self-test wall executed on open** |
| `#/data` | Identity (drives the 90-day clock) · storage meter · **10 executable audit classes** with safe-repair only where mechanically unambiguous · export/import (v:6-only; merge re-mints ids + rewires the graph + post-import audit) · prune with counts · example-org load/erase · system log |

## Mentor rule set

**39 rules** (printed live on `#/about` as `RULES.length`) across ethics · cases · debt · delegation · goals · decisions · feedback · cadence · people · health · ritual · meetings · handoffs · storage · review · transition · positive. 3 locked unsnoozable · 4 positive-lane rules by doctrine (a detection-only mentor trains a risk-averse operator) · `comm-debt-you` deliberately outranks `comm-debt-them` (a mentor that only audits downward trains its user to audit downward) · snooze is **dated**, never amnesia · every clear-condition is computable.

## Model library (FW)

**31 pure models** (printed live as `Object.keys(FW).length`): no I/O, no mutation, `now` always an argument. Flight risk · trust equation · direction-aware KR score/current · confidence slope · goal status · Edmondson · SLII · rung-mismatch · feedback lint · GROW quality · AAR quality · est-aware mood slope · Cynefin · Eisenhower · case SLA · nine-box + staleness · feedback balance · meeting cost · pace governor · bench score · commitment debt · dependency age/heat · team pulse with stated fallback · health composite · pressure series · decision calibration · transition score · Next Best Move · ritual agenda.

## Instrument honesty

1:1 pulse sliders are telemetry. Untouched sliders write `estimated:true`; estimates render ≈, **never move a slope, never trigger or clear an advisory**. Audit class `telemetry-honest` *executes a probe* (synthetic series with estimated injections must equal the series minus them) and range-checks every stored mood record. Estimated sessions say so in the system log at write time.

## Storage reality (stated plainly, and in the UI)

- ~5 MB cap, synchronous, **not encrypted**, single device, single profile. Cleared with site data. Live meter on `#/data`.
- Notes concern named individuals and may be disclosable — **write every note as if read aloud in the grievance room.** The phrase sits on every surface that writes about a person.
- Failed writes surface in the top bar (`saved HH:MM · N KB` → red `WRITE FAILED` with byte count and remedy), never silently.
- **Export weekly**; `export-overdue` nags past 14 days. Imports are `v:6`-only; wrong shapes fail loudly without touching state. Merge re-mints every id, rewires person/team/case/goal/handoff/commitment/evidence references through one map, then re-runs the audits.
- Corrupt state is **preserved** at a side key (`leados.v6.corrupt-<ts>`), main key untouched, in-memory blank **not saved** until you decide — download-the-damaged-copy / start-clean / import. Newer-version records (`v>6`) get the same path instead of a silent downgrade. Earlier records migrate **additively** (v1–v5→v6, defaults only) and say so in the system log, including during boot (migration notices write straight into the record's log — the global isn't wired yet at that point, and the code says so).

## Shortcuts & capture grammar

| Key | Action |
|---|---|
| `/` or Ctrl/Cmd-K | Command palette — modules, people, open cases, commands |
| `C` | Register a case (live pre-commit classification) |
| `1 2 3 4` | today · signal · cases · people |
| `5 6 7 8 9 0` | 1:1s · feedback · coach · decisions · AAR · review |
| Esc | close modal / palette |

Quick capture (fixed bar on `#/today`): `case: …` · `commit: @name … by +3` (they owe you) · `owe: @name … by tomorrow` (you owe) · `praise: @name …` (draft, 48h clock) · `note: @name …` (evidence) · `win: …` — dates: `today · tomorrow · +Nd · next week · YYYY-MM-DD`. Unparseable → **nothing written, said out loud**; unknown verb → a prefilled case intake, not a silent drop. Person matching is first-name; collisions resolve to the first match, audibly.

## Files

| File | Role |
|---|---|
| `index.html` | The entire application |
| `README.md` | This file |
| `AI-SESSION-LOG.md` | Session-12 engineering record: repo postmortem (verified), critique, positions held, QA ledger, defect ledger, honesty ledger |

## Honesty ledger (claims vs code)

- **Every count resolves to a live computation** on `#/about` (`RULES.length` → 39, `Object.keys(FW).length` → 31, `AUDITS.length` → 10, `SELFTESTS.length` → 12, `ROUTES.length+2` → 23). Method: counts verified this session by grep against `index.html` (`cat:'`→39, `{r:'`→21, `id:'t\d`→12); audit classes verified by reading the array (a naive `name:'` grep returns 25 because seed literals share the token — stated, not smoothed). File-script byte size is printed live too.
- **Runtime verification**: there is no browser or headless runner in the build environment, so behavior claims are *statically traced* and the app carries its own executed check — the `#/about` self-test wall re-runs all 12 assertions on every open and every boot. If a future edit breaks a model, the wall turns red. That is the strongest honesty mechanism available under these constraints, and the log says the same plainly.
- **Seed is tense on purpose**: two SLA-breached cases, a stalled mediation + stalled handoff wired to the same conflict, tuition unpaid on a closed sev-5, red/stalled/expired goals, a rotting decision, an ungraded one, ageing drafts, a correction inside its lapse grace, commitment debt in both directions, two unverdicted meetings, no ritual stamped, a HIGH flight risk, critical pulse dims, day-24 transition with an unheard hostile VP. The exact advisory count on first paint is whatever `#/signal` prints.
- **Known limits held open**: ISO-day strings, no timezone nuance · pressure is record-derived, not calendar-integrated (impossible under the constraints — the kill list is the local answer) · nine-box staleness is view-time, not destructive · org rollup falls back to org pulse per team, stated on the card · import-merge is append-only beyond re-minting · gate signals read app state only (the machine cannot verify what happened in a room — which is exactly why the note is mandatory) · GROW/SLII are simplified canonical mappings, labeled in-line · capture person parsing matches first names.
