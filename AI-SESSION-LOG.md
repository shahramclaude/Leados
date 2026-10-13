# AI-SESSION-LOG — LeadOS engineering record

## Session 8 · v7.0 build — "the org layer, the governor, and the type-count lie"

### Constraints (permanent, non-negotiable — restated, not assumed)

Vanilla JS · no framework · no backend · no APIs · no OAuth · no credentials · one `index.html` · all state `localStorage` key `leados.v6`, record `v:6` · one browser profile · nothing leaves the device.

### Session-8 critique (led with, before any code)

1. **The org was flat; the user leads leads.** v6.1's six people were peers. A leader of team leads needs the conduit layer: reporting lines, skip-level cadence, span pressure, and cascades — a case on Priya must reach Mara's agenda through the loop, not the hallway. This was the product's largest blind spot relative to its stated user.
2. **"Trust 100%" refused as specified.** Confidence is not a trust mechanism; auditability is. Position taken: no oracle features, trust via live-counted claims on `#/data`, an always-on integrity fault class, and a telemetry probe. Held under the brief's explicit wording; no counter-argument offered, position stands.
3. **Instruments existed with no actuator.** v6.1 computed load/pressure and let the user redline silently. A mentor that observes overload without governing it is a dashboard, not a mentor. Fixed with `FW.pace` + the today-page governor card.
4. **The type count lied.** Recovered `FW.caseSla` had 11 keys; README claimed 10. Code is authority: 11 shipped and printed live. This class of drift is exactly why counts are code-derived everywhere prominent.

### Positions held

- **Not a byte-transplant.** v6.1 could not pass whole through the tooling window (raw fetch truncates mid-file; the operational middle layer is unrecoverable in-session). Session 7 set the precedent: rebuild against README-as-contract plus recovered consumers, and log it. Same here. What is claimed verbatim-recovered is listed in the README honesty ledger; nothing else claims lineage.
- **No PIP/separation scripts. Still.** Also no "auto-PIP" under any other name. The lapsed-correction sweep opens an *underperformance case with a human playbook*, never a paper trail generator.
- **"Sit back and relax" interpreted as automation of detection, sequencing, propagation, record-keeping, and pace — not of judgment.** The app got *more* insistent where it matters (locked classes, double-commit HR intake, premortem floor) while getting more automated everywhere else (cascade wires, auto-agendas, auto-cases on lapsed verification, org rollups).
- **Depth that isn't wired is decoration.** Every new capability in this build is consumed: `FW.pace` → today card + review; `FW.orgRollup` → org view + person lead cards + 3 rules; cascade wire → agenda + ledger + `cascade-quiet` rule; skip-level → rule + person page + org card + org summary stat. Nothing shipped as a display-only feature.

### Changelog (v6.1 → v7.0)

**New structure**
- `managerId` on people; people page groups by manager; person pages show manager + directs. Boot guards default it (additive, no migration).
- `#/org` route: lead rollup cards (FW.orgRollup: directs, elevated, cadence breaches, open-severity subtree, team pulse w/ org-wide fallback stated, nine distribution, tier + top driver), org summary stats (conduits, skip-level freshness, org-wide open cases), cascade doctrine in plain language.
- **Cascade — 12th wire kind.** Person-scope cases write into the manager's 1:1 auto-agenda; conflict cases cascade to both managers; recorded in the propagation ledger with click-through.
- **Skip-levels:** `skipAt` per person, one-click log (writes session + notifies the lead's own agenda so the conduit is never bypassed), 45-day freshness rule.

**New actuation**
- `FW.pace` + pace governor on `#/today` (score, band, top driver, prescribed move).
- Lapsed-correction **sweep**: delivered correction +21d verification lapsed >7d auto-opens an underperformance case (idempotent, quiet-write, toast-announced, origin evidence wired).
- `verifyDone` on feedback → verification writes evidence back to the ledger.
- Goal at-risk flags now clear on the closure that owns them.

**New rules (46 → 50):** `skip-level-due · cascade-quiet · lead-overload · org-span` (+telemetry/dys/rhythm reorganizations; taxonomy this session's, contract subset preserved).
**New models (24 → 26):** `FW.pace`, `FW.orgRollup`.
**Renderers 19 → 20** (`#/org` added; 18 routes + 2 detail).

**Type-count correction:** 10 claimed → 11 shipped (leave_return was already in `caseSla` upstream; the app now tells the truth).

### QA ledger (defects found *in this session's own diff*, fixed pre-ship)

| # | Defect | Class | Fix |
| --- | --- | --- | --- |
| 1 | `caseRow` ternary mangled across string concat — would not parse | syntax | rewritten with precomputed runway |
| 2 | Dead no-op sort line in `runMentor` (leftover of a refactor) | hygiene | removed |
| 3 | Case closure didn't clear goal at-risk flags it owned | logic | closeCase clears via goal wires |
| 4 | Case-detail close/verify/re-open buttons referenced unregistered actions; `aar-for` unregistered | wiring | `case-close-open/case-verify/case-reopen/aar-for/aar-open` + forms implemented |
| 5 | Re-open didn't restart the SLA clock while the copy claimed it did | honesty | `created` restamped on re-open, timeline notes it |
| 6 | 🔒 emoji in mediation stage labels — violates no-emoji UI rule | policy | text "· locked" |
| 7 | `⚑` premortem glyph — borderline | policy | em-dash |
| 8 | `</h4>` closing a `<h3>` on Data page | markup | corrected |
| 9 | `'unte titled'` fallback string | typo | corrected |
| 10 | `kr-check-f` leftover ternary read a nonexistent field | logic | direct lookup with guards |
| 11 | Feedback model radios could show two selected styles | UI | toggle by checked state |
| 12 | Seed ledgers thinner than write paths (missing cancelled playbooks on c3, second step on c4) | fidelity | seeded exactly what `openCase` would write — audits green by construction, not by luck |

**Mechanical checks run:** marker/scaffold sweep (clean) · rule definition count = 50 (grep-counted) · all `data-a` names cross-checked against the ACTIONS registry (the 5 missing at first pass are defect #4 above) · audit classes = 14 · FW keys = 26 · tail well-formed at line 1366.

### What Session 8 did NOT do (and why)

- **No cross-device sync, no backup service.** Constraint. The export lane is the compensation and the nag is deliberate friction.
- **No notifications/scheduler beyond derive-on-commit.** An always-local single file cannot wake up in your pocket; the "automation" is that the *entire* derived state (50 rules, 26 models, audits, pace) recomputes on every commit, so nothing goes stale inside a session, and first boot of the day is always current.
- **No per-lead Edmondson scoping.** Pulse is team-scopable; the 7-item scan stays org-level — item-level attribution would deanonymize answers and poison the instrument. Recorded as a deliberate refusal.
- **No import-merge dedupe.** Merge appends with re-minted ids; dedupe-by-content is a judgment call with no safe mechanical answer. Stated in limits.

### Known limits carried open

ISO-day strings; case-derived pressure; nine-box staleness view-time-only; org rollup pulse fallback is org-wide and says so; append-only merge; fonts/icons degrade offline; first paint shows the example org (~30 advisories) by design so every instrument is visibly live.

### Files delivered this session

`index.html` (the application, complete) · `README.md` (contract, counts live-verified) · `AI-SESSION-LOG.md` (this record).
