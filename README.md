# LEAD/OS — Single-File Leadership Operating System

A production-grade, **fully client-side** leadership app for new team leaders and
managers leading several teams. One `index.html`. No framework, no build step, no
server, no accounts, no network calls. All state lives in `localStorage`.

## Run it

- **Local:** open `index.html` in any modern browser. That's it.
- **Hosted:** push this repo, then GitHub → Settings → Pages → Deploy from branch.
  The app runs at `https://<user>.github.io/<repo>/` and gets a stable storage origin.

## Permanent constraints (non-negotiable)

1. Vanilla JS only. No frameworks. No build tooling. Single HTML file for the app.
2. No paid APIs. No OAuth. No external credentials of any kind.
3. 100% client-side persistence (`localStorage`). No server, no database, no backend.
4. No stubs, no placeholders, no dead features. Every module is whole or absent.
5. Click-through verified: every register propagates to every dependent module via
   the internal event bus (`Bus`). "Registered anywhere → appears everywhere" is
   structural, not manual.

## What it is

31 modules across 6 groups, built as a mentor, not a spreadsheet:

- **Command** — Command Center (explainable health score, today list, risk heat,
  workload), Coach (morning brief + live-data Q&A + leader-rhythm audit).
- **People** — Roster (DISC/Belbin), 1-on-1s with auto-built agendas, Feedback
  Studio (SBI/COIN/Radical Candor, 3-day decay alerts), Recognition ledger with
  fairness radar, 7-level Delegation board, Performance notes, Conflict Navigator
  (Glasl + Thomas-Kilmann + phases model), Team Health Pulse (Lencioni 5 +
  Edmondson 7), Onboarding gates (day 1 / week 1 / month 1 / month 3), Skills
  matrix + 70-20-10 growth plans.
- **Execution** — Task register, Kanban (drag & drop, WIP limit), Timeline &
  milestones with slip detection, Meeting Engine (auto agendas, action items →
  tasks), Decision Engine (weighted scorer, RAPID, review dates), Risk Register
  (RPN/FMEA, heat map, mitigation-owner alerts), Suggestion Engine (14-day answer
  promise, accept → auto-task), Budget & EVM (disclosed formulas).
- **Self-Leadership** — SMART goals with scoring, OKRs (honest 70% grading),
  Eisenhower Time Matrix (auto-sorted), Habit engine (streaks), Reflection &
  energy journal (weekly review wizard), Leader Profile (DISC/EI/Belbin/Johari).
- **Strategy** — SWOT→TOWS auto-pairing, Stakeholder map (influence × interest),
  Team Charter (printable poster).
- **System** — Playbook Library (28 leadership models, each with steps, failure
  modes, live example, and a jump into the tool that runs it), Data & Trust
  center (audit trail, snapshots, export/import, settings).

## Architecture (read before editing)

Layers inside `index.html`, top-down:

1. `DB` — localStorage wrapper (`LEADOS.v1`), audit log, snapshots, quota guard.
2. `Bus` — every mutation emits `change`; persistence, mentor, and render subscribe.
3. `Engine` — pure calculations + all derived views (agendas, briefs, workload, debt).
4. `Mentor` — ~30 deterministic rule checks; findings are severity-ranked,
   scope-tagged (nav badges, per-view insight boxes), and **self-resolving**.
5. UI framework — schema-driven register factory, modal form engine, ⌘K palette.
6. Views — 31 `UI.register(...)` modules. Grep `UI.register("` for the full list.

## Your data vs. this code

- **Code** lives here in git.
- **Your leadership data** lives in your browser's localStorage — it is NOT in the
  repo. Back it up from inside the app: **Data & Trust → Export JSON** (restore
  with Import JSON). Snapshots (rolling 5) cover in-app time-travel.

## Development convention

`AI-SESSION-LOG.md` is the continuity layer across AI development sessions.
Every session reads it first and appends an entry when done. **Start there.**
