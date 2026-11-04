# ADR-0087: The Federated Envoy — sealed, disclosure-scoped, Merkle-committed packets between LeadOS workspaces (`#/envoy`)

- **Status:** Accepted
- **Date:** 2026-11-04
- **Session:** 127 (Schema v92, no bump of its own)
- **Related:** [ADR-0008](./0008-post-commit-rules-hook.md), [ADR-0048](./0048-shared-barrier-exposure-sensitivity.md), [ADR-0075](./0075-command-chain.md), [ADR-0076](./0076-operating-seat.md), [ADR-0082](./0082-sealed-spine.md), [ADR-0083](./0083-expectation-concordance.md), [ADR-0084](./0084-hoshin-catchball-cascade.md), [RESEARCH §108](../../RESEARCH.md)

## 1. Context

LeadOS is local-first: a workspace is one browser's data, and every altitude above
the frontline is *inside* that one workspace. Every module built so far assumes the
whole hierarchy shares one store. That assumption is the product's ceiling, because
real organisations are not one store: a plant, a subsidiary, an acquired team, a
partner running the same tool, a chief's own second workspace. Leadership work
crosses that boundary constantly — and today it crosses it as a slide, a PDF, a
spreadsheet, or a forwarded email, i.e. as a document with **no provenance, no
disclosure scope, no tamper evidence, and no way to say "these two records
disagree" without someone quietly overwriting one of them**.

The 2026 market does not solve this either. Enterprise suites exchange data between
tenants through vendor-held APIs, so the customer cannot verify what was sent, who
could see it, or whether the value arriving at the top is the value that left the
bottom; "cross-company OKRs" and "portfolio roll-up" features are read-only
dashboards inside one vendor's cloud. `RESEARCH.md §107` records the hunt.

The constraint that decides the design: **a workspace cannot verify a signature
chain it does not hold a key for, and a recipient must not be handed detail its
altitude may not hold — filtering at the receiving end is not disclosure control.**
So the packet has to be projected *at the source*, committed *by content*, and
verified *by recomputation*, with the disagreement itself treated as a first-class
governed question rather than a merge conflict.

## 2. Decision

Ship the **Federated Envoy** (`#/envoy`) as a domain + view + rule family on the
existing spine: `app/core/domain/envoyRegistry.js`, `envoySchema.js`, `envoy.js`,
`envoyRules.js`, `envoyActions.js`, `app/views/envoy.js`.

### 2.1 One format, four claims

A packet (`leados.envoy.packet` v1) carries items, a manifest, an attestation and a
signature. Each claim is independently checkable:

1. **Integrity per item** — canonical JSON of the *projected* fields → SHA-256.
2. **Integrity of the set** — a binary Merkle root over item hashes, last leaf
   duplicated for odd counts, so a single edited item localises to its own row and
   the root changes exactly once.
3. **Identity** — `packetId = sha256(merkleRoot ‖ origin workspace ‖ recipient
   altitude ‖ created-at)`. Re-dating or re-addressing a packet changes its
   identity, so a replay cannot masquerade as a fresh release.
4. **Provenance** — HMAC-SHA256 over the same tuple when the vault is unlocked
   (session key from `sealCrypto.js`, the same key the seal uses); plain SHA-256
   otherwise, and the packet *says which mode it used*. `envoyRequireKeyedSignature`
   defaults to **true**: a workspace that expects a key refuses a plain packet
   instead of treating two different claims as one.

Verification recomputes all four and returns typed failures —
`item-hash`, `merkle-root`, `packet-id`, `schema-ahead`, `signature`,
`signature-required`, `altitude-mismatch` — never a boolean.

### 2.2 Disclosure is projection at the source, not filtering at the receiver

`ENVOY_FIELDS` declares, per kind, which field belongs to which class:
`aggregate → unit → names → detail`. The receiving seat's rank fixes the maximum
class (`classForReceivingRank`), and `projectFields` returns the *most specific
class that still carries at least one field*, dropping everything above it. A kind
with nothing left is listed as **withheld, with the need and the class it would
require printed on the desk** — so the sender sees "this span may not receive this
yet", not a silently shorter packet. The withheld count travels in the packet, so
the receiver knows what it did not get.

Deliberately **no field is recomputed from "now"** (age in days, countdown, rolling
rate). A statement that changes at midnight would make the same unchanged record
arrive looking divergent on every re-send, which is the one thing a divergence
detector must never do. Time-relative figures live in the packet's aggregate
attestation (expected to move) and in the local reading.

### 2.3 Ingest never edits

An ingested artefact is an **attested copy**: `imported` on first sight,
`duplicate` when the content hash matches, `diverged` when the same
`(origin workspace, kind, originId)` arrives with different content. A divergence
**never** overwrites the local record, never picks a winner, and never merges. It
opens exactly one governed DACI decision per origin record per ISO week
(`RULE-ENV-02`, marker-keyed) that names both hashes and asks which version is the
record of what happened.

### 2.4 Carriage rolls up and down in the same transaction

One ingest is one transaction on the shared post-commit spine:

- `RULE-ENV-01` writes a `carries` edge from the packet to the receiving seat and
  to **each ancestor** of that seat (`carries` → dir, VP, chief), so a packet
  addressed to a manager is visible to the director and VP without re-entry.
  `rolls-up-to` is reused for the chain edge itself; both are written inside the
  same commit as the artefact rows.
- `RULE-ENV-02` opens the reconciliation decision on divergence and links it to
  the packet with `reconciles`.
- `RULE-ENV-03` reads the packet's **own** attestation: at or above the declared
  `envoyAttestationRiskFloorPct` it opens one review decision for the receiving
  span and links it with `tracks-followup`; below the floor it records an advisory
  marker and opens nothing. Under the 3-item cell floor no share is published at
  all.

All three are marker-idempotent, pausable by `envoyAutoPropagate`, and an explicit
`envoy.scan` always runs.

### 2.5 Altitude-distinct surfaces

| Altitude | What `#/envoy` gives it |
|---|---|
| Frontline / team lead | The desk: who above me needs what, in the class they may hold, and exactly what is withheld (and why). |
| Manager | Compose to their own span or the leader above; packets, verdicts, typed failures, and the divergence list they must answer. |
| Director | Carriage coverage across their spans, divergences with both hashes, attested value at stake by currency. |
| VP / executive | Carriage coverage with a Wilson interval, **refused below five spans**, keyed-signature share, aggregate attestation, no titles at all. |
| CEO / chief | An identity-free certificate (`envoyBriefText`) and aggregate-only CSV scope #82 (`federated-exchange`), with the limits printed in the document itself. |

## 3. Rejected alternatives

- **A sync server / shared tenant.** Rejected: it would make the vendor the holder
  of the data and the arbiter of the merge, which is exactly the property this
  product refuses. A packet is a file a human can carry.
- **Last-write-wins merge, or auto-reconcile by timestamp.** Rejected: divergence
  between two honest workspaces is *information about two records*, not an ordering
  problem. It becomes a governed question or it becomes a silent lie.
- **Encryption of the packet.** Rejected for this slice: without a key exchange
  there is no honest confidentiality claim, and "encrypted with a key in the same
  file" is theatre. Instead detail above the receiving class is **never written**,
  which is a stronger property and is stated as such in the packet.
- **Filtering at the receiving altitude.** Rejected: the receiver would then hold
  the bytes it is not allowed to read, and every export would leak them.
- **Reusing `sealCrypto`'s HMAC without naming the mode.** Rejected: plain mode is
  integrity against corruption and honest error, *not* forgery-proof. The packet
  carries `signature.keyed` and every surface prints it.

## 4. Consequences

**Positive.** Workspaces can now exchange evidence across an organisational
boundary with provenance, disclosure scope and tamper evidence, and disagreement
arrives as a decision instead of a merge. Carriage is rolled up the hierarchy in
the same transaction and sealed by `sealRule` (still last), because it writes
through the shared spine and not around it. The certificate and CSV #82 are
identity-free by construction, so the chief can hand one up without exposing one
person.

**Costs and risks.** A packet is **not authentication**: the operating seat is a
declaration, and a determined operator of a workspace can sign anything that
workspace's records contain. It is **not encryption**. It cannot prove a foreign
record is *true*, only that it is unaltered since the sending workspace sealed it.
Keyed mode requires both sides to hold the same session key, which this slice
expects to be arranged out of band. Coverage below five spans is refused rather
than published, so a small federation gets counts and not a rate.

**Deliberately not built.** No key exchange, no revocation, no tenant isolation, no
server, no merge UI, no partial-order reconciliation, and no person-level figure of
any kind — no send rate, no compliance score, no "networked-ness" rating.

**Verification.** `tests/app/federated-envoy.test.mjs` (11 tests) covers schema
additivity and vocabulary, projection by class, keyed-vs-plain refusal, three
tampering modes, single-transaction carriage to every ancestor, divergence
idempotence and non-overwrite, altitude refusal, the attestation floor in both
directions, seat gates, and five axe-clean panels.
