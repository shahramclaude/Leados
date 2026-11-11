# ADR-0178 — Cross-Line Ask Attribution & Shared-Contributor Load Reconciliation

**Status:** Accepted — 2026-11-11  
**Schema:** v143  
**Surface:** `#/matrix?panel=asks` · CSV #133 `delegation-lines` · `RULE-DLA-01`

## Context

A delegation named the person carrying it but not the reporting line on which it was issued. In a matrix, several managers could each see a reasonable queue while the contributor carried their sum. Reconstructing the line from a title, team, current viewer, or equal split would fabricate ownership.

## Decision

Store append-only `delegationLineActs`. Each act names one active reporting line and snapshots its manager and kind. The latest act is effective; old acts remain evidence. One-line attribution is derived. With two or more lines, an unattributed ask reads **on no line**. Automation-issued asks are counted separately through typed `issues-obligation` provenance. No existing delegation is back-filled during v142 → v143 migration.

`buildDelegationLines` is the single read model for the panel, CSV and automation rule. It partitions every visible open ask into exactly one of five classes, every shared contributor into exactly one verdict, every active line into one share state, and every line-attributed shared ask into one charter state. Each partition publishes its own exact reconciliation claim.

A line entitlement is `declared ask budget × declared line share`, compared in integer hundredths. Missing shares refuse every line entitlement for that person; nothing is divided equally. The register tests attribution against the line holding the matrix `assignment` right but never blocks work or adjudicates the charter.

`RULE-DLA-01` runs on the shared post-commit spine. For a person over the total budget, it asks the unique lowest seat covering every current line to reconcile the queue. A leader-only, tied, disconnected, or absent apex is observed, never silently replaced. The rule is bounded, idempotent, pausable, and closes its own ask when the overload or covering seat changes.

## Reliability and privacy

The panel renders the read model's values without recomputation. CSV #133 is aggregate and identity-free. Stored acts are normalized fail-closed; a wrong-person or orphan act is dropped with a counted warning, while an attribution to an ended or changed line remains visible as `stale`. Compaction may exceed its cap rather than erase the effective attribution of active work.

## Consequences

Frontline and mid-level leaders can see the common pool of work created by multiple principals and identify which line is over its declared share. Directors inherit one governed reconciliation rather than duplicate line-local alarms. Single-chain workspaces retain their prior behavior: attribution is derived and no matrix reconciliation is opened.
