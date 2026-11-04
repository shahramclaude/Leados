# ADR-0089: The Attested Commit — per-seat credential authorship over the sealed log (Session 129, Schema v95)

**Status:** Accepted, 2026-11-04. Supersedes no earlier decision; extends [ADR-0082 (the Sealed Spine)](./0082-sealed-spine.md) and honours the limit every ADR from [ADR-0076](./0076-operating-seat.md) onward has printed: *seats are local analytical lenses, not authenticated access controls.*

## Context

The Sealed Spine made the event log tamper-*evident*: one hash chain, sealed per transaction, verified from genesis. It answered **was this record altered?** and could not answer **who wrote this record?** Every seat was a declared label — a dropdown — and every export, certificate and README line said so in plain words. That honesty is the product; this decision does not trade it away. It adds the next question the record must be able to answer: *an operator is declared on every commit, and nothing bound that operator to the commit.* Two gaps follow concretely:

1. **Attribution is a claim, not evidence.** A seat label can be back-dated, swapped or typed by anyone holding the keyboard. When the log later says "Mei Manager closed this case", the log is repeating a self-report.
2. **Silence is invisible.** Under a workspace that *claims* attestation discipline, a commit with no signature at all is indistinguishable from a compliant one. An enforcement posture that can be silently violated is theatre.

The competitive hunt ([RESEARCH §109](../../RESEARCH.md)) found no exception to close this honestly: every vendor in people analytics (Workday, Visier, Lattice, Culture Amp, Crunchr) authenticates *server-side* via SSO and keeps its audit tables vendor-held; none offers customer-locally verifiable authorship. Public audit-log practice ([ProofLog's assurance ladder](../../RESEARCH.md), ogentic-audit, cryptography-audit-logs) orders the rungs: hash chain → HMAC signing → external signature → external anchor → trusted timestamp. The next honest rung for a local-first, single-workspace app is rung 2–3, and the last two rungs cannot exist here without leaving the product's own boundary.

## Decision

**One credential per seat, one attestation per commit, three-valued verification, one governed boundary decision per seat per week — and the enforcement gate fails closed.**

### 1. The credential is derived, and only its public half is stored (RULE-IDN-01, `identity.attested`)

A seat credential is a passphrase run through PBKDF2 (≈600k iterations, per-credential random salt) to a 256-bit key. The workspace stores **only** `salt`, `keyId` (first 16 hex of `sha256(key)` — a fingerprint, never the key) and `verifier = HMAC(key, "leados-seat-attest-v1|verify|seat|keyId")`. The key lives in memory for the session only and is cleared at **all five vault-lock sites** beside the seal key (lock, storage-clear, import, hard reset, idle expiry). A stored row can never compute a new MAC; timing-safe comparison everywhere; the JSON of the workspace state never contains the passphrase or key hex (asserted).

Enrolling is explicit consent and self-unlocks in the same breath. **The enrollment commit is the credential's first attested commit** — a credential whose first act is unsigned would defeat its own record. Rotation replaces the row (new salt, verifier, fingerprint); revocation deletes it and every past attestation of the retired key honestly degrades to *digest-verified, key unavailable* — revocation is not forgery.

### 2. One attestation per operational commit, sealed in the same transaction

Every operational commit under an unlocked session appends exactly one `identity.attested` event whose `entityId` is

```
HMAC-SHA256(key, "leados-seat-attest-v1|seat|keyId|revision|digest")
```

where `digest = sha256` over **every event the transaction appended before the attestation**, tail-capped at 512 with the uncovered prefix counted and printed (never hidden). `identityRule` runs on the shared post-commit spine **before** the attention market (the integrity decision it opens is priced as work) and **before** `sealRule` — so the seal, which runs absolutely last, covers the attestation in turn. Rung 1 chains the log; rung 2 signs each block's authorship; they compose inside one atomic transaction. The rule is **idempotent by revision**: a retried rule run on the same draft revision signs nothing twice.

### 3. RULE-IDN-02: unattributed writes are surfaced, and one governed question per seat per week

Under `identityEnforced` with no unlocked credential, an operational commit is an **authorship breach**: the rule logs `identity.unattributed` (revision-idempotent) and opens **one** DACI authorship-boundary decision per acting seat per ISO week (marker-keyed). The decision carries typed `rolls-up-to` edges to **every leadership ancestor of the acting seat in the same transaction** — frontline → manager → director → VP → chief with zero re-entry (ADR-0036 generalization, the synthetic root excluded: a single-operator workspace has no one above it). Session-lifecycle events (enroll/rotate/revoke/unlock/lock/scan/checkpoint) are **never** flagged unattributed — the boundary managing itself is not a breach. The rule is pausable (`identityAutoPropagate`); an **explicit scan always runs** and records its finding.

### 4. RULE-IDN-03: three-valued verification — the honest label is the feature

`verifyAttestations` walks the log and reports, per attestation:

- `verified` — the MAC recomputes **and** the key is in hand;
- `FAILED` — content tampered (signed window digest mismatch) or the MAC does not recompute under a presented key;
- `digest-verified · key unavailable` — the structure recomputes but no key is held (locked, revoked, another machine). **Never upgraded to "verified", never punished as "failed"** — this is the label every vendor product would quietly round upward;
- `evicted` — events the attestation covered are gone (retention or deletion): counted, not hidden.

A scan writes its own `identity.verified` verdict back into the log it verifies.

### 5. Rung 3: signed checkpoints, kept outside the workspace

A self-referential hash chain **cannot see its own tail being truncated** — the classic limitation of rung 1 (ogentic-audit; cryptography-audit-logs). `#/identity` exports a checkpoint document — event count, revision, chain head, credential fingerprint, verification counts — with `checkpoint-mac = HMAC(key, "leados-checkpoint-v1|seat|keyId|sha256(body)")`, signed when a session is unlocked and honestly stamped `UNSIGNED` (structure only) when not. Compared against a later workspace state it returns **TRUNCATED / REWOUND / REWRITTEN / chain-advanced**, and the MAC binds the document body, not just its counts. The instruction is printed on the document: *keep it outside the workspace*. An external file held by a second party turns "tamper-evident" into "tamper-detected by someone the tamperer does not control" — that, not cryptography, is what defeats the key-holder who re-chains fabricated history.

### 6. The enforcement gate fails closed, and governing the boundary is director+

`identityEnforced` makes the ADR-0080 gateway refuse **every** non-exempt write without an active credential session (`scope-refusal` with the printed reason). Exempt: boundary management itself (enroll/unlock/lock/rotate/revoke/checkpoint/scan/touch) and pure reads — you can always enroll your way in or turn enforcement off. But *governing* the boundary (`identitySetSettings`, `identityRevoke`) is the `govern-attestation` right, **rank 3–5**: a manager may not switch enforcement off on their own authority (asserted). Seat-scoped seats manage their **own** credential only. No WebCrypto → attestation is **unavailable, not downgraded**.

### 7. What is deliberately NOT pausable

Attestation is the identity of the write itself, not automation: `shouldAttest` runs even when `identityAutoPropagate` is false. Only breach escalation (RULE-IDN-02) pauses. A workspace that pauses its own signatures during an automation freeze would sign the least during exactly the period it most needs accountability.

## Rejected alternatives

- **[rung 4] ECDSA/asymmetric auditor signature — rejected:** without a second party there is no PKI to bind `seat → public key`; a self-generated keypair attests "someone with this key", no better than the HMAC, minus simplicity. If a second party arrives (tenant boundary, external auditor), revisit.
- **[rung 5] RFC 3161 external timestamping — rejected:** requires a network round-trip to a TSA; the product is local-first and works with no server, folder, install or network. External *files* (checkpoints) are the offline analog and ship now.
- **Signing each event individually — rejected:** O(n) MACs per transaction and a per-event key-use fingerprint; one attestation per commit whose digest covers the commit is the same evidence at transaction granularity, and the seal already chains events.
- **Trusting the stored verifier as a MAC key — rejected:** the verifier is an HMAC *image*; treating it as a key would make every state file a signing key. Constant-time compare, fingerprints not keys, key out of the store.
- **Silent three-way rounding (unavailable → verified) — rejected:** the entire point. A label that flatters is the defect this ADR exists to remove.

## Consequences

- The log can now say **who declared authorship of what, verifiable with a key that never left their session**, and can say **"unattributed"** out loud when nobody did.
- Verification is honest but not omnipotent: a credential whose key is gone verifies *structurally* only; a tampered window is `FAILED`; retention-truncated history is *evicted*, not clean.
- **Not claimed:** third-party non-repudiation (the passphrase is the operator's, the HMAC is symmetric), authentication of a human being, a multi-user or tenant boundary, protection against whoever controls the browser (a keylogger defeats this, as it defeats every client-side secret), or security of an unencrypted workspace backup. HMAC is tamper-evident authorship **within** the local-first boundary; the honest claim is *accountable authorship*, not identity.
- Aggregate-only CSV #84 (`seat-attestation`) and the identity-free certificate leak no seat id, name, fingerprint or MAC. Attestation rate below a 5-transaction floor is **blank**, never 0.
- Browser walkthrough of the credential flow remains `[UNVERIFIED]`; the mechanical behaviour is covered by `tests/app/identity-ledger.test.mjs` (27/27), including the cross-module propagation example and the cross-altitude roll-up mandated by the build bar.
