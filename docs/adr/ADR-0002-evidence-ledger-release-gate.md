# ADR-0002: The Evidence Ledger is a machine-checked release gate, not a document

## Status
Accepted — Part 00 (this delivery).

## Context
Phase 0 discovery for this part (`docs/FINDINGS-2026-PART-00.md`) found five separate instances
(F3, F4, F5, F6, F7) of a prior session's own audit/architecture document confidently asserting, in
prose, "I checked, this does not exist" — and later repository state showing that it does exist, at
scale (hundreds of files, not an edge case). In every one of those five cases, the claim was
falsifiable with a one-line `find` or `grep` command, and nothing prevented the false claim from
being written, merged, and cited by subsequent sessions as settled fact. This is not a one-time
lapse; it is the dominant failure mode observed in this program's actual history, and it directly
produced the current state where at least three incompatible product narratives (lead-scoring board,
org/leaders/readiness-engine, and a vanilla-JS leadership-coaching SPA — F1, F3, F16) coexist in one
repository with no document reconciling them.

Two designs were considered for how the program tracks "what's actually true":
1. **Narrative documentation** (status reports, audit docs, session logs) — what every prior part
   has done, each written in good faith, none automatically re-checked by the next.
2. **A structured ledger with a machine-checked schema and existence checks**, gating the release
   process, so that a false claim cannot reach `verified` status without the checking tool itself
   being wrong (a much smaller, more auditable surface than "trust the prose").

## Decision
Adopt option 2. `docs/EVIDENCE-LEDGER.md` is the single table of capability claims, and
`scripts/ledger-lint.mjs` (wired to `npm run ledger:check`, which `npm run verify` depends on) is the
enforcement mechanism. Rules:
1. Every row must have all six columns (`claim_id, claim, layer, confidence_class, proof, part,
   status`) and `confidence_class` must be one of `observed | estimated | inferred | assumed`
   (tenet T2's closed vocabulary — no free text).
2. `claim_id` must be unique across the whole file. A retired/falsified claim's row is kept (new
   rows are added, old ones are never silently deleted — same rule as `docs/history/` in the subject
   repository) so that `npm run ledger:check -- --stats` always reflects the program's full claim
   history, not a cleaned-up subset.
3. Any row with `status: verified` and a `proof` formatted as `file:<path>` (optionally with
   `#L<line>`) **must** resolve to a real, readable file at that path relative to the repository
   root, or `ledger:check` fails the build.
4. Any row with `status: verified` and a `proof` formatted as `cmd:<command>` is accepted
   structurally by the linter (the linter does not execute arbitrary commands from a markdown table
   — that would be a code-injection surface) but **requires** the session's Verification Log to
   contain that command's actual output; this is a process rule enforced by review, not by the
   script, and is called out here as an explicit, honest limitation (see Consequences).
5. `npm run verify` runs `ledger:check` as a required step. A broken ledger blocks every release,
   the same way a broken build does.

## Consequences
- This converts "is this feature real" from a trust question into a file-existence question for the
  majority of claims (static facts: does this file exist, does this table exist, does this route
  exist), which is exactly the category where the five documented failures (F3–F7) occurred — all
  five were "I searched and found nothing" claims that a one-line `find` would have falsified
  immediately.
- It does **not** solve the harder category: claims about *behavior* (does this function return the
  correct value, does this test actually pass). Those still require someone to execute a command and
  honestly paste the output into the Verification Log. ADR scope is deliberately narrower than "solve
  all forms of dishonesty" — it solves the specific, demonstrated, repeated failure mode of
  undocumented file-tree drift.
- A new failure mode is introduced: someone could mark a `cmd:`-proof row `verified` without actually
  having run the command, and `ledger-lint.mjs` cannot catch that mechanically (rule 4's honest
  limitation). Mitigation: Part 22's red-team review is explicitly scoped
  (`docs/PART-DEPENDENCY.md`) to re-run a sample of `cmd:`-proof rows, not just `file:`-proof rows.
- Every future part's "done" claim must come with new or updated ledger rows, or it did not happen
  for the purposes of this program — this is a deliberate process cost, accepted because the
  alternative (the status quo) has already produced a 1,639-file repository where three
  independently-documented sessions each believed they were starting from a clean two-file app.

## Alternatives considered
- **Keep narrative-only documentation, add a stricter review checklist.** Rejected: checklists are
  also prose, reviewed by people who were not the ones who ran the original command, and this
  program's history shows narrative claims surviving multiple review cycles unchallenged (the
  "no duplication found" claim appears in at least two separate documents, F3 and F4/F16, written in
  what were presumably two different sessions).
- **Full automated behavioral testing of every claim (not just file existence).** Rejected as the
  *eventual* goal but not achievable in Part 00: it requires the de-duplicated, buildable tree that
  Part 01 doesn't exist yet to produce. Starting with file-existence checks is the smallest
  mechanism that is (a) implementable today, (b) directly targets the demonstrated failure mode, and
  (c) composable — later parts can add richer proof types (e.g. `test:<path>::<test name>` with an
  actual CI-executed check) without changing the ledger's schema.
- **A spreadsheet or external tracker instead of an in-repo markdown file.** Rejected: it would not
  be versioned alongside the code it describes, would not be reviewable in the same pull request as
  the change it documents, and could not be linted by `npm run verify`.
