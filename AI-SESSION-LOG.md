# AI-SESSION-LOG.md — LEAD/OS

> ## RESUME PROTOCOL — read this block first, every new session
> 1. Read this entire file top to bottom. It is the project's memory.
> 2. Read `README.md`, then grep `index.html` for `UI.register("` for the live module list.
> 3. Constraints are permanent: vanilla JS, single-file app, no paid APIs, no OAuth,
>    no external credentials, localStorage only. Proposing a server = regression.
> 4. The Mentor + Bus design is the product's trust model: findings are deterministic,
>    live-data-grounded, and self-resolving. Do not add LLM calls, faked scores, or
>    any feature that only pretends to work offline.
> 5. Every new register needs: schema + cols + verdict + stats + ≥1 mentor rule +
>    `consumes` links + appearance in ≥1 derived view (agenda / brief / cockpit).
> 6. When the session ends: append a new session entry below, then tell the user
>    exactly which files changed so they can push to git.

Purpose: continuity across AI development sessions. Each session appends a dated entry:
decisions made, why, constraints honored, known debt, and explicit "do not redo" notes.

---

## Session 001 — Foundation build (workspace bootstrap)

**Context:** Repo reference `github.com/wbweve/Shahram` was read for intent only.
Its server-side surface (Postgres, OIDC, webhooks, bank connectors, Docker) is
**rejected permanently** — the binding constraint is: no framework, no paid APIs,
no OAuth, no external credentials, 100% client-side on localStorage. A previous
`AI-SESSION-LOG.md` did not exist anywhere; this file starts the convention.

### What exists now (single `index.html`, vanilla JS, zero build step)

Architecture layers (top-down, do not reorder):
1. `DB` — localStorage wrapper (`LEADOS.v1` key), audit log capped at 600,
   5 snapshot slots, quota guard, JSON export/import, wipe.
2. `Bus` — every `DB.add/update/remove` emits `change`; persist debounce, mentor
   rerun, and re-render all subscribe. **This is the connective tissue.**
3. `Engine` — pure calc: RPN/SMART/OKR/EVM/DISC/EI/streaks/Lencioni/Edmondson,
   workload, 1:1 auto-agenda, meeting auto-agenda, health score.
4. `Mentor` — ~30 deterministic rules, severity-ranked (alert/watch/coach),
   scope-tagged for nav badges + per-view insight boxes, state-derived
   (self-resolving) — no rule may persist after its condition is fixed.
5. UI framework — schema-driven register factory (`makeRegister`), modal form
   engine, command palette (⌘K), delegated click handlers ([data-act/rnav/jump]).
6. Views — 31 modules in 6 nav groups.

Module inventory:
- **Command:** Command Center (health score w/ disclosed formulas, today list, risk heat,
  workload, sparkline) · Coach (morning brief + 6 live-data Q&A cards + leader rhythm).
- **People:** Roster (DISC/Belbin) · 1-on-1s (auto-agenda per person) · Feedback Studio
  (SBI/COIN/Candor, 3-day decay alerts) · Recognition (fairness radar) · Delegation
  (7 levels, check-date discipline) · Performance Notes · Conflict Navigator
  (Glasl/Thomas-Kilmann/phases) · Team Pulse (Lencioni 5 + Edmondson 7) · Onboarding
  (day1/w1/m1/m3 gates) · Skills & Growth (heatmap + 70-20-10 IDPs).
- **Execution:** Task Register · Kanban (DnD, WIP limit 5) · Timeline/Milestones (slip) ·
  Meeting Engine (standup/staff/review agendas auto-built; action items → tasks) ·
  Decision Engine (weighted scorer, RAPID, review dates) · Risk Register (RPN, heat map,
  mitigation-owner alerts) · Suggestion Engine (14-day promise, accept → auto-task) ·
  Budget & EVM (formulas disclosed; SPI deliberately not modeled — schedule truth lives
  in Timeline; stated honestly in the view).
- **Self-Leadership:** SMART goals · OKRs (KR updater, honest 70% grading) · Time Matrix
  (auto-Eisenhower from tasks) · Habits (14-day grid, streaks) · Reflection & Energy
  (weekly wizard pre-fills from live data) · Leader Profile (DISC/EI sliders, Belbin,
  team-contrast panel, Johari drill).
- **Strategy:** SWOT→TOWS auto-pairing · Stakeholder Map (influence×interest, danger
  quadrant highlights) · Team Charter (poster, printable).
- **System:** Playbook Library (28 models × steps/pitfalls/live-example/jump-to-tool) ·
  Data & Trust (audit, snapshots, import/export, settings, danger zone).

### Cross-register propagation (the "one registration everywhere" contract)
- Person in Roster → appears in 1:1 cadence debt, recognition fairness, workload bars,
  onboarding gates, skills matrix, delegation/feedback pickers.
- Task → Kanban, Timeline, Time Matrix, per-person workload, dashboard KPIs, 1:1 agenda.
- Risk → RPN banding, heat maps (register + dashboard), mentor critical alerts, staff agenda.
- Idea accepted → task auto-created (idempotent via `answered` flag).
- Meeting action items → tasks (tagged `fromMeeting`). 1:1 agendas pull feedback,
  delegation checks, recognition debt, skills gaps, overdue tasks.

### Decisions and why
- **No server features.** Honesty rule: anything that can't run in-browser is cut, not stubbed.
- **English only** this session (repo's bilingual engine not ported) — revisit only if the
  user asks; mentor rules currently emit English strings.
- **Demo seed** on first run (3 members + linked records), wipeable via Data → "Reset to demo".
  Rationale: a new leader's first-run experience must show the connections working.
- **EVM scope:** CPI/EAC/VAC modeled; SPI excluded by design (needs PV curve) and disclosed
  in-view rather than faked.

### Known debt / review list for next session
1. IPD/growth-plan editing reopens via generic register form (title now set) — fine, but
   matrix inline-selects could use undo. Not blocking.
2. No unit/smoke harness in this workspace (repo had node tests — not portable client-side).
   Next session: add an in-browser self-test panel (Data & Trust) that exercises
   add→propagate→assert for each register pair.
3. Reflection wizard pre-fill only covers `win`; drain/change could pull from conflicts +
   energy trend. Deliberate scope cut, not a bug.
4. Playbooks = 28 entries. Expand only with same depth (steps+pitfalls+example+tool link);
   no shallow entries.
5. Coach Q&A answers are deterministic; do NOT add LLM calls — constraint forbids external
   credentials; deterministic-with-live-data is the product's trust model.

### Hard rules for future sessions (violating these = regression)
- No framework, no build step, no network calls, no OAuth, no keys, no `prompt()`.
- No stubs/placeholders/TODOs. A feature ships whole or not at all.
- Every new register: schema + cols + verdict + stats + at least one mentor rule +
  `consumes` links + it must appear in at least one derived view (agenda/brief/cockpit).
- Every finding must self-resolve when the underlying state is fixed.
- Update this log every session.

---

## Session 005 — Multi-Team & Professional Execution

**Critique of v1:** The app was built for a single team leader. Ambitious users
leading *several* teams need to compare health, manage hierarchy, and predict
clashes between people.

**Decisions:**
- **Portfolio View:** New Command module to compare health scores by team.
- **RACI Matrix:** Live-wired to tasks. If no 'A' is set, the system flags the leader.
- **Ofman Core Quadrant:** Professional team-development module. Automates predicted
  friction (Pit vs Allergy) and mentorship pairs (Quality vs Challenge).
- **WBS Hierarchy:** Replaces flat task lists with recursive parent-child trees.
- **Engine Upgrade:** `Engine.health` is now groupable by Team.

**Files changed:** `index.html` (~2700 lines now), `AI-SESSION-LOG.md`.

---

## Session 008 — High-Depth Synthesis & Political C2

**Critique of v2.1:** The app was becoming a collection of registers. Senior
leaders don't browse tables; they need synthesized truth. v2.1 was too passive.

**Decisions:**
- **Command & Control (C2) Summary:** Replaced the Dashboard header with a
  deterministic narrative engine. It summarizes division health, critical
  exposure, and leadership debt in 4 professional sentences.
- **Retention Radar:** Synthesizes 1:1 debt, recognition, and safety to predict
  turnover risk for high-impact talent. High scores trigger Critical Alerts.
- **Pre-Wire (Coalition) Tracker:** Explicitly tracks the "Meeting before the
  meeting." Flags decisions being called without buy-in testing.
- **Succession Heatmap:** Identifies leadership gaps. If a Lead has no successor,
  it is flagged as Leadership Debt.
- **Engine v3:** New narrative synthesis and retention-scoring logic.

**Files changed:** `index.html` (~3500 lines now), `AI-SESSION-LOG.md`.

---

## Session 009 — Strategic Prioritization & Risk Control

**Critique of v3:** The app had risks but no barriers. It had tasks but no math-based
backlog prioritization. Communication was still a "hallway" activity not a plan.
Execution lacked explicit quality gates.

**Decisions:**
- **Prioritization Backlog:** Added WSJF (Weighted Shortest Job First) and RICE
  scoring modules. Moves prioritization from "loudest voice" to "highest value."
- **Controls Ledger:** Added a layer of "Barriers" above risks. Tracks effectiveness
  and test dates. If you don't test it, it's not a control.
- **Communications Plan:** Tracks stakeholder cadence. Who needs what, when, and
  how. Flags silence as a relationship risk.
- **Quality Plan (Qualification Gates):** Critical tasks now require explicit
  Acceptance Criteria and a Sign-off step before they can be marked 'Done'.
- **Engine v4:** Added WSJF/RICE logic and control-effectiveness narrative.
- **Seed Update:** Populated the backlog, comms plan, and controls for Shahram's
  Engineering Division.

**Files changed:** `index.html`, `AI-SESSION-LOG.md`.

---

## Session 007 — Operational Depth & Forecasting

**Critique of v2:** The app was managing "work," but not the "operating system."
Leaders of leaders need to handle absences, incident learning loops, and
uncertainty in forecasting.

**Decisions:**
- **Absence Register:** Track sickness and leave. Flags Team Leads who are out
  without a named "Acting Lead."
- **Incident Lifecycle:** Risk is future pain; Incident is current pain. Added a
  loop: Impact → RCA → Corrective Action → Auto-Task.
- **Monte Carlo Simulation:** Replaces the "static date" lie with a P50/P80/P95
  confidence window based on task effort.
- **Sponsorship Acts:** Moves beyond mentorship to door-opening acts. Flags
  Leads who are not being sponsored.
- **Coach Upgrade:** Added absence alerts and incident RCA timers.

**Files changed:** `index.html` (~2900 lines), `AI-SESSION-LOG.md`.

---

## Session 006 — Rich default seed (Shahram's Engineering Division)

**Critique of Session 005 seed:** Three generic names (Sara/Omar/Freja), one task
each, one risk. Every module showed mostly-empty state. The Coach had nothing
useful to say. The Clash Radar had no data. The Portfolio had three hollow teams.
A new user seeing that would not understand what the app is for.

**What the new seed provides — every module shows meaningful, connected data:**
- Leader name set to "Shahram", workspace "Engineering Division", currency "€"
- 3 teams: Platform / Product / Infra — each with a Team Leader direct report
- 6 people total: 3 leads (Sara, Omar, Freja) + 3 ICs (Karim, Nina, Alex)
- Realistic delivery picture: one blocked critical, one missed milestone, WBS hierarchy
- GDPR risk with no mitigation → triggers Critical alert immediately
- Auth bus-factor risk → triggers recognition of the design pattern problem
- 1:1 debts: Freja, Nina, Alex never had one → mentor fires immediately
- 2 feedback drafts not yet delivered → 3-day decay alert fires
- Ofman quadrants registered for 4 people → Sara/Karim clash fires in Clash Radar
- Karim unrecognised 18d, Omar/Nina/Alex never recognised → fairness radar populated
- Team pulses: Platform recent (12d), Product old (40d), Infra never → Coach flags
- OKRs at honest mid-progress → Coach says "intervene or accept"
- Habits with a realistic streak (5/7 days on shutdown ritual)
- One weekly reflection, honest and specific
- Full charter with 4 agreements
- Skills matrix populated with honest ratings (Alex at 0-1 across the board)
- Alex onboarding: day-1 done, week-1 overdue → onboarding alert fires
- Stakeholder map: CTO at influence 10 but interest 6 → danger quadrant occupied
- Budget with real numbers including uncommitted contractor line

**Fix also applied:** `f.options` as a function (dynamic team list) now works in
the form engine — `typeof f.options === "function" ? f.options() : f.options`.

**How to apply to existing browser:** Data & Trust → Reset to demo data.
New users get it automatically on first load.

---

## Session 003 — Repo handoff, round 2 (no app-code changes)

**Verified against GitHub API (`/git/trees/main`), not user report.** First upload
attempt failed: `wbweve/Leados` contained only fragments of the OLD Shahram project
(its 364 KB session log, 42 KB README, and a browser-renamed `index (3).html` shell
missing its js/css folders). None of the new build arrived.

Lessons codified for all future handoffs:
- **GitHub web upload never extracts archives.** Upload extracted files only.
- **Browser auto-renames are fatal to Pages:** `index (3).html` ≠ `index.html`.
  Rename locally BEFORE upload; Pages requires the exact name at repo root.
- **Verify-by-content before upload:** the correct `index.html` starts
  `<!DOCTYPE html`, contains `<title>LEAD/OS`, ~2,500 lines / ~150 KB. Any ~17 KB
  file is the OLD app's module-loading shell — wrong artifact.
- **Promote verification-by-API:** after every upload, check
  `api.github.com/repos/<user>/<repo>/git/trees/main?recursive=1` for names+sizes,
  then load the Pages URL. Never close a handoff on reported success.

History chain: the OLD project's full record (364 KB `AI-SESSION-LOG.md`) lives in
`wbweve/Shahram` and is untouchable archive. THIS file continues the NEW chain in
`wbweve/Leados`. Anyone auditing lineage: Shahram = rounds 1–19 (server-coupled
era, now deprecated by permanent client-side constraint), Leados = from Session 001.

User action pending at log time: repo recreation + correct three-file upload +
Pages enable (Source: Deploy from a branch, main, root). Session 004 should open by
verifying that upload via the API check above.

Files changed: `AI-SESSION-LOG.md` (this entry). `index.html` unchanged.

---

## Session 004 — Upload verified via API; Pages enable pending

**Verified against `api.github.com/.../git/trees/main` — not user report.**
Repo `wbweve/Leados` now contains EXACTLY the correct three artifacts, nothing else:
- `index.html` — 266,614 B (the real single-file build; old shell was 17,109 B)
- `README.md` — 3,873 B (handoff README)
- `AI-SESSION-LOG.md` — 9,699 B (this chain)

No renamed files, no archives, no old-project fragments. **Code persistence goal: CLOSED.**
Git is now the second home for the code; this workspace remains the first.

Pending at log time: user enabling GitHub Pages (Settings → Pages → Build and
deployment → Source: Deploy from a branch → main / root → Save). Next session:
verify `https://wbweve.github.io/Leados/` returns 200 with the app rendering
(dark amber Command Center, LEAD/OS brand, demo roster of three). If it 404s
>15 min after enable, check Actions tab for build errors before blaming content.

Still open (standing item, not this session's): user's own leadership DATA lives in
browser localStorage only — remind monthly: in-app Data & Trust → Export JSON.

Files changed: `AI-SESSION-LOG.md` (this entry). `index.html` unchanged.
