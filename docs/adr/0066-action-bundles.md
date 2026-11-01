# ADR-0066: Reviewable, reversible cross-module Action Bundles

Date: 2026-11-01 · Status: implemented · Schema: v74

## Context

Response Studio (ADR-0065) rehearses three policies but adopts only one case. A leader still has to re-enter the decision, delegated verification, assumption, budget commitment, stakeholder brief and coaching prompt in separate modules. That re-entry is where coordination and provenance break.

## Decision

Add a closed command registry and one shared executor. A bundle is anchored to an existing operational case and contains at most eight unique typed commands. The UI proposes a PDCA / assumption-based-planning loop from recorded facts; the leader edits titles, owner, date, commitment and prior, deselects actions, then rehearses.

1. **Rehearsal:** a background worker clones the workspace into a disposable store and calls the same validated production APIs. It returns collection deltas, typed relationship deltas and rule IDs. It never writes live storage and never sends a message.
2. **Adoption:** revision, input/source fingerprints and calendar day must match. Commands stage inside one `store.update`; their source events visit the full generalized rule registry in the same transaction. Rule-created targets are resolved after rules, still inside the transaction. The actual operational footprint must equal the reviewed preview. Any command failure, rule failure/receipt or footprint mismatch aborts before persistence.
3. **Provenance:** RULE-BND-01 writes typed `coordinates`, `responds-to` and `tracks-followup` edges. RULE-BND-02 creates one owned review checkpoint (pauseable). RULE-BND-03 reconciles orphan edges on explicit scan.
4. **Compensation:** withdrawal first checks every frozen target fingerprint. It then runs narrow compensators in reverse order in one transaction: return untouched work, release unspent commitments, dismiss unsent drafts, remove the exact coaching prompt, and remove only untouched decisions/assumptions. Audit events and derived downstream work remain. Any later edit protects the whole bundle.
5. **Persistence:** additive migration 73→74 creates an empty `actionBundles` ledger. Normalization bounds proposals/targets/history and demotes unverifiable receipts to draft. Terminal receipts survive demo cleanup as history; open proposals cannot outlive their source.

## Explicit limits

- This is transactional software integrity, not a causal forecast of recovery, morale or ROI.
- A commitment is not actual spend. A coaching prompt is not a person score. A brief is not a sent message.
- Compensation is not time travel. Any review, human disposition or settled outcome protects an assumption. Derived evidence present at adoption is frozen into the receipt and may be removed with the untouched assumption; later review or settlement is never silently removed. Work created by compensating commands remains auditable.
- No arbitrary API names, eval, network backend, model dependency or autonomous decision selection.
- Browser/AT behavior is verified with JSDOM + axe only; real-browser and screen-reader walkthroughs remain [UNVERIFIED].

## Benchmarks and named frameworks

Fresh GitHub source scan (2026-11-01): Temporal (durable retryable workflows), Restate (durable application building blocks), Inngest (explicit durable steps), n8n (human approvals and observability), Windmill (workspace fork, live preview/diff and protected promotion). LeadOS borrows the review-before-apply and compensation discipline, not their infrastructure. PDCA supplies the delivery loop; assumption-based planning supplies falsifiable signposts; Mendelow supplies stakeholder salience; DACI keeps choice human; opportunity-cost accounting keeps commitment distinct from spend.

## Consequences

The existing event spine gains bounded multi-event transactions (`sourceEvents`) without a second automation engine. Existing modules keep their APIs and invariants. The cost is a larger standalone bundle and a conservative withdrawal policy. Future work should add durable retry scheduling across browser sessions and outcome grading—not claim it already exists.
