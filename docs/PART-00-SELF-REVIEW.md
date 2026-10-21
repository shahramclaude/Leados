# Part 00 — Self-Review (Phase 5: Attack)

Answering the standing order's four required questions, with evidence, against this part's own
deliverables.

## 1. Which tenet is currently most violated by the codebase, and what in Part 01–22 fixes it?

**T1 (evidence over assertion)** is the most violated, and it is violated at two levels
simultaneously, which is why it ranks above the others:

- **Documentation level:** five separate instances (`docs/FINDINGS-2026-PART-00.md` F3, F4, F5, F6,
  F7) of a prior session's audit/architecture document asserting "I checked, this does not exist,"
  contradicted by the current, checkable file tree. This is the textbook T1 violation: a claim
  presented with the *rhetoric* of evidence ("I read the actual repository before writing anything")
  that was not, in fact, backed by a reproducible check at the time it mattered (or was true then and
  is now silently stale — either way, nothing re-verified it before it was built on).
- **Product level:** F24 — the live UI (`src/app/page.tsx`) cites "the Red Team report, finding
  SEC-1" as its justification for a missing security control, and no such report exists among the
  repository's 40 markdown files. This is not a documentation problem; it is a false citation shipped
  to end users.

**What fixes it:** Part 01 (repository consolidation) stops new work from being built on an
unverified tree — it is the first part whose entire job is to make "I checked" true by construction,
not narration. Part 22 (fairness & red team) specifically closes F24 by writing the actual Red Team
report the UI already claims exists, and by re-running (not re-reading) the proof for every ledger
row marked `verified` by a prior part. Structurally, `docs/EVIDENCE-LEDGER.md` +
`scripts/ledger-lint.mjs` (this part) is the standing mechanism that makes a T1 violation of the
F3–F7 shape mechanically harder to ship undetected going forward, for the narrow class of claims
that reduce to file/table existence — see the honest limitation on behavioral claims in
`docs/adr/ADR-0002-evidence-ledger-release-gate.md`.

## 2. Where does your own blueprint hand-wave — which layer has the fuzziest contract?

**Layer 8 (Memory & sensing)**, specifically the boundary between "a human approved this capture"
and "this is now a fact the rest of the system can rely on." The architecture document states the
inbound/outbound contract as "nothing reaches Layer 1 as a durable event without passing through an
approve/reject gate," but:
- I did not read the body of `src/app/api/capture/proposals/[id]/approve/route.ts` this session
  (logged honestly as `LD-030: unverified`), so I do not actually know whether approval today
  performs an atomic, transactional append to the event log, a best-effort fire-and-forget write, or
  something else.
- The architecture document also doesn't specify *who* is allowed to approve (is it role-gated? is it
  the same person who submitted the capture, which would be a conflict of interest for anything
  touching Layer 5's people engines?), nor what happens to a rejected proposal (deleted? retained with
  a `rejected` status for audit, per the same honesty rule the rest of the program claims to follow?).

This is the fuzziest contract in the blueprint because it's the one inbound surface from the
*outside world* (as opposed to Layers 2–7, which mostly pass already-structured data between each
other) — and "garbage in, calibrated belief out" is a much harder problem than this document
currently treats it as. Part 16 is scoped to fix the code; a future revision of
`docs/LEADOS-ARCHITECTURE-2026.md` should fix the contract description before Part 16 starts, not
after.

## 3. What is the riskiest dependency edge in PART-DEPENDENCY.md — if that part fails, what collapses?

**00 → 01**, as stated explicitly in `docs/PART-DEPENDENCY.md`'s "Riskiest edge" section, with the
reasoning repeated here because it is the single most important claim in this delivery: this is not
a hypothetical risk, it is a **demonstrated, repeated failure** in the subject repository's actual
history. At least two prior sessions (the "Part 00" author of `docs/AUDIT-2026.md` and the "Part 19"
author of `docs/history/2026-part19-baseline-note.md`) each independently declared "no duplication /
no legacy app found," and the repository's current state (1,639 files, three disconnected product
narratives, 13 duplicate causal-engine files) shows that declaration was wrong, stale, or both, by
the time of this session. If Part 01 is skipped, declared complete by narrative instead of by a
re-run `find`, or simply fails: every downstream part (02 through 22) inherits an ambiguous "which
copy is canonical" question that compounds instead of resolving, and the program repeats its own
history for a third time.

## 4. What did you deliberately NOT do?

- **I did not modify any product code in the subject repository.** This delivery is governance and
  process artifacts only (architecture doc, evidence ledger, dependency DAG, two ADRs, a lint
  script, package-script wiring, this self-review, and the session log). Rewriting `src/lib`,
  deleting duplicate files, or moving the legacy Vite app into `deprecated/` is explicitly Part 01's
  job, not Part 00's — doing it now, under deadline pressure, in the same session as writing the
  rules that are supposed to govern how it's done, is exactly the kind of two-birds change
  `docs/adr/ADR-0001-event-sourcing-truth-core.md`'s "Alternatives considered" section warns against.
- **I did not fabricate content for documents the task brief assumed exist** (`APP-STATUS-REPORT.txt`,
  `FEATURE-TRUTH-MATRIX.md`, `WHITEPAPER.md`, `knowledge.md`). I confirmed their absence
  (`docs/FINDINGS-2026-PART-00.md` method section) and reported the absence, following the same rule
  the subject repository's own `docs/CONSISTENCY-SWEEP.md` C-5 and
  `docs/history/2026-part19-baseline-note.md` already established — continuity with an existing good
  practice, not a new one invented for this response.
- **I did not execute the 77 existing `*.test.ts` files or the Stryker mutation suite against the
  full subject-repository tree.** Doing so would require `npm install` against a 1,639-file tree with
  known-broken imports (F10) and no `node_modules` present, well outside this part's scope and this
  session's time budget; every ledger row that would depend on that execution is honestly marked
  `unverified`, not `verified`, rather than guessed at.
- **I did not attempt to reconcile the three competing product narratives** (lead-scoring board / org
  readiness engine / vanilla-JS leadership-coaching SPA) into one story. That reconciliation is a
  product decision, not a documentation one, and belongs to whoever owns the roadmap — this part's
  job was to surface that the conflict exists and is unresolved (F1, F16), not to unilaterally pick a
  winner.
- **I did not claim this ledger is complete.** 42 rows is the required minimum met with margin, not
  an exhaustive inventory of every claim in a 1,639-file, 40-markdown-file repository. Future parts
  are expected to add rows, not treat 42 as final.
