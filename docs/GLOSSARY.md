# LEADOS Glossary

Scope note: this glossary describes **the system as it exists in this repository
right now** — one consolidated build session. It does not describe or assume a
58-part prior program; no such history was present in this workspace when this
session began (see `PROGRAM-COMPLETION-REPORT.md`).

| Term | Definition |
|---|---|
| **LEADOS** | "Leadership Operating System" — the product name used throughout this codebase. A dashboard-style app that gives an executive a single surface for decisions, communications, team signal, and governance checks. |
| **Module** | One of the 17 top-level views reachable from the sidebar (Dashboard, Conversation, Coaching, Collective Intelligence, Time Analytics, Ethics Flags, Crisis Mode, Proactive Drafts, Org/Spatial View, Industry Benchmarks, Recommender, Leader State, Legal Drafts, Reorg Simulator, Board Readiness, Algorithm Registry, Evidence Ledger). |
| **Evidence class** | A three-level honesty tag (`verified` / `simulated` / `planned`) attached to any claim the product or its build process makes about itself. Rendered via `EvidenceTag` in `src/components/ui.tsx`. |
| **Gate** | A required checkpoint an action must pass before it has an effect outside the UI. Implemented today only in the Conversation module (`Draft → Review → Commit`) and Legal Drafts (human-confirmation checkbox before "Finalize" enables). |
| **Attention budget** | A finite daily counter (default 6 units) that Proactive Drafts must spend to "send" anything. Implemented in `AppStateContext`. Prevents silent/unlimited automated outreach. |
| **Dignity boundary** | One of three non-negotiable product limits stated in `LEADOS-VISION-2.md`: LEADOS serves human judgment (never replaces it), measures systems (never people-as-output), adapts form (never substance). |
| **Honesty lint** | The check a Recommender item must pass (confidence calibration, disclosed sample size, no causal overclaim) before it is marked `lintPassed: true`. Failing items still render, visibly marked failed — they are not hidden. |
| **Human Impact Ledger** | The mandatory adjacent output the Reorg Simulator must show next to any cost/savings number — affected headcount, sentiment risk, and operational strain. The UI never renders savings without it on the same screen. |
| **Collective dissent preservation** | The rule that Collective Intelligence never collapses multiple viewpoints into a single score; minority positions render with equal visual weight to majority ones. |
| **Crisis Mode** | A single boolean application state (`AppStateContext.crisisMode`) that simultaneously narrows the sidebar to "essential" modules, recolors Sidebar/TopBar, and changes Dashboard framing — one flip, coherent whole-product effect. |
| **Algorithm Registry** | The single table (`AlgorithmRegistry` module) listing every scoring/ranking mechanism referenced anywhere in the product, each with an owner, inputs, and evidence class. The rule: if a mechanism is referenced in the UI, it must have a row here. |
| **Evidence Ledger** | Both a doc (`EVIDENCE-LEDGER.md`) and an in-app module (`EvidenceLedgerView`) listing every self-referential claim this product makes, with proof or an honest downgrade. |
| **Gate matrix** | The set of real, runnable commands that establish whether the codebase is in a known-good state: `tsc --noEmit`, `node scripts/check-ledger.mjs`, `npm run build`. Wired together in `scripts/gate-all.sh`. |
| **Structural check (ledger)** | What `scripts/check-ledger.mjs` performs: a regex-based scan proving the ledger file is well-formed (every claim has a proof field, no duplicate IDs). It does **not** prove the claims are true — that is a human judgment captured in `EVIDENCE-LEDGER.md`. |
