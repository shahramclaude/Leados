# ADR-0205: Bounded Encrypted Event Archives — Closed-Window Proof, Never Restore

Date: 2026-11-15 · Session 273 · Schema v159 unchanged · Status: Accepted

## Context

ADR-0203 correctly refuses to attribute a posted-period drift when the oldest
surviving ordinary event is later than the posting. The live event log is
intentionally bounded at 600 ordinary events and evicts its oldest rows first.
Increasing that cap indefinitely, or quietly keeping a second in-app copy,
would turn a retention boundary into unbounded shadow storage. But once a
closed period falls out of the live suffix, a leader still needs a way to keep
its evidence outside the workspace and later establish exactly what the file
can and cannot prove.

A standalone backup is the wrong artifact: importing it would replace live
workspace state, and a backup does not define a closed-period evidence boundary,
source anchor, purpose or finite retention horizon. A bare export of event rows
is also insufficient: it can omit part of a sealed transaction or claim a
window without a later seal proving it had closed.

## Decision

Keep the live event cap unchanged. Add an explicit, bounded, encrypted external
capsule for a fully closed UTC window. Its verifier is read-only and returns
aggregate proof metadata only; it never imports, replays or restores archived
event rows into live workspace state.

### A start anchor, a complete segment and a close

The creator selects a UTC start/end day, a declared single-line purpose and a
finite retain-until date. It chooses the last retained seal strictly before
the start of the window as the start anchor. The capsule carries a bounded
proof of the seal chain from genesis through that anchor (`anchorProof`),
without copying pre-window event rows. The proof checks each seal's predecessor,
revision order, seal mode and signature; HMAC history requires the source
workspace key. It reports the number of pre-anchor transaction payloads that
were already incomplete in the live log and separately states whether the
anchor transaction's content itself was complete. Missing historical payloads
are never described as content-verified merely because their seal still
verifies.

Between that anchor and a later seal strictly after the requested end, every
included block must have all of its events, recompute its transaction digest,
continue the seal chain and respect timestamp order. The closing seal and any
post-close suffix are checked so an unsealed or same-instant event cannot be
silently left inside the claimed interval. If a required window block is
incomplete, the anchor is absent, the chain does not verify, or the period has
no later close, creation refuses rather than backfilling a boundary.

The archive is versioned (`leados.provenance-archive`, v1), identity-preserving
only where event fields are needed to recompute seals, and bounded to 5,000
blocks, 10,000 archived events, 3,650 window days, 3,650 retention days and
8,000,000 JSON characters. Purpose is required (10–600 characters). The live
ordinary-event cap remains the shared 600-event constant; there is no shadow
copy in workspace state.

### Encryption, finite retention and proof strength

The file uses the existing encrypted-envelope format with the distinct
`event-archive` purpose, an archive-only passphrase and the app's 600,000-round
PBKDF2 key derivation. A workspace backup envelope is never accepted as an
archive. A SHA-256 manifest is explicitly described as forgeable by a writer
who can rewrite the file; where a source seal key is available, the manifest
commitment is HMAC-SHA-256. Plain-hash source blocks remain tamper-evident, not
forgery-proof; HMAC-sealed source history cannot be certified without the
source key.

Expiry is enforced by the verifier: after the declared UTC retention date,
verification reports `expired` and refuses use. This local browser cannot find
or physically delete downloaded copies, enforce a custodian's external
retention policy, or supply an externally trusted timestamp. The manifest says
its times are workspace timestamps in UTC, not a trusted time source.

### Aggregate-only verification and guarded actions

`sealArchiveStatus`, `sealArchiveCreate` and `sealArchiveVerify` are registered
through the LeadOS API. Status and verification are safe reads under the access
gateway; creation is operator-only, refused while a declared seat is active,
when the workspace is locked/unsaved, or when secure encryption is unavailable.
Status reports counts and pressure only, never event summaries, names or IDs.
Verification checks the envelope purpose, decryption, archive manifest,
anchor proof, complete blocks, closing seal, counts, commitment, expiry and an
optional date-coverage comparison, then returns counts and proof statements
only (`dataReturned: false`, `restoredToWorkspace: false`).

Creating the file is not itself an in-app event. Before any ciphertext is
released, `seal.archive.created` is appended to the live log and must be
persisted successfully, advance exactly one revision, and appear in a complete,
verified seal block. The `seal.*` event trigger makes this audit commit seal
itself whether automatic sealing is disabled, paused, or enabled. A persistence
or sealing failure withholds the file. The audit summary records the archive
commitment, declared dates and expiry, but not the free-text purpose.

The Integrity & Seals screen (`#/seal?panel=archive`) provides the count-only
retention status, operator creation/download flow, encrypted-file selection
and aggregate-only verification. A download-blocked browser offers ciphertext
for manual saving only after the same audit gate succeeds.

### Structure and identity boundary

The event reader is structure-neutral: it reads the shared workspace event
log and does not infer matrix lines, hierarchy ownership, or single-chain
attribution. This keeps the same closure and proof rules for matrix and
single-chain workspaces. A declared C-suite seat is not authenticated
identity; this local browser uses the undeclared full-access operator view for
creation and explicitly says a human actor is not authenticated. No claim of
server-enforced authorization is made.

## Consequences

- Schema v159 is unchanged. No new collection, event shadow store or workspace
  backup behavior is introduced. Only an explicitly requested encrypted file
  leaves the tab.
- The old 600-event live-retention policy stays bounded. Once ordinary rows
  have been evicted, the capsule can prove the retained seal chain but cannot
  restore or independently verify missing historical payloads. The report
  marks pre-anchor gaps and anchor-content completeness explicitly.
- The archive is not automatically consumed by chargeback drift attribution.
  Reader integration remains **In Progress** and needs its own scope,
  coverage semantics and tests.
- External deletion/retention enforcement and trusted timestamps remain outside
  this local app's power. Commercial parity against tamper-evident archive and
  WORM-log services is **[BENCHMARK-UNVERIFIED]**; no hosted product was tested.

## Verification

`tests/app/event-archive.test.mjs` covers encrypted creation, durable audit
persistence and sealing, read-only verification/import refusal, all automatic
sealing-setting combinations, evicted pre-anchor payload reporting, an
incomplete anchor payload, genesis-to-anchor chain validation, missing close,
HMAC key requirements, the 600-event status/UI, accessibility, operator and
file-size refusals, and withholding ciphertext after a failed storage write.
`tests/app/seal-chain.test.mjs` pins the existing 600-event oldest-first
retention behavior and seal survival. Full-suite completion and a real-browser
walkthrough remain **[UNVERIFIED]**.
