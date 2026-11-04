# ADR-0081: The Sealed Spine — a hash-chained, verifiable audit trail over the append-only event log

**Date:** 2026-11-04 · **Status:** implemented · **Schema:** v87 (no bump) · **Surface:** `#/seal` · **Session:** 121 · **Built on:** [0001](./ADR-0001-event-sourcing-truth-core.md) (event-sourcing truth core), [0008](./0008-post-commit-rules-hook.md) / [0026](./0026-propagation-ledger.md) (shared rule spine), [0076](./0076-operating-seat.md) (operating seat), [0080](./0080-mission-control.md) (scoped API gateway)

---

## 1. Context — an append-only log you cannot verify is a log you have to trust

Since ADR-0001 the workspace has been event-sourced: every committed transaction appends events to an append-only log, and every module's derived state is a function of that log. The log's append-only property was enforced by convention — the store never exposes a delete path — but nothing in the record *proved* it. A hand-edited `localStorage` payload, a buggy import, or a silent normalizer change could rewrite history and every downstream figure would cheerfully recompute from the altered record with no signal that anything had happened.

The 2026 vendor market does not close this gap either. The session's domain hunt (RESEARCH §103) found Lattice, Culture Amp, 15Five, Betterworks, Workday Illuminate and Peakon all selling predictive people-analytics scores and AI-drafted summaries; none offers a customer-locally-verifiable, cryptographically sealed, append-only audit chain — and none could, because their logs live on their servers. For a local-first workspace the verification can and should happen where the data lives.

Two constraints shaped the design:

- **No schema bump.** Schema v87 had just shipped (Session 120). A bump would have forced assertion sweeps across ~76 test files for zero user-visible benefit. The Operating Seat (ADR-0076) had already demonstrated the pattern: settings that default when absent need no migration.
- **One seal per transaction, across every module.** Per-module "audit trails" would be glue. The spine already runs every module's rules inside one atomic commit, so the seal belongs there — once, last, covering everything.

## 2. Decision

Turn the existing append-only event log into a **hash-chained, tamper-evident audit trail**, sealed per transaction by the shared rule spine, verified on demand from genesis, and attested up the chain of command:

1. **One `audit.seal` event per sealed transaction.** `sealRule` (RULE-SEAL-01) is registered **last** on the shared post-commit spine (61 rules), so a transaction's seal commits to exactly the events every other rule appended in that same atomic write — case propagation, DACI decisions, roll-up edges, comms drafts — by construction, not by per-module glue. The seal is `sha256(prev ‖ digest ‖ revision)` where `digest = sha256(canonicalJson(fresh events))` and `prev` is the previous seal (64 zeros at genesis). The event reuses the fixed event shape (`entityId` = 64-hex seal, `summary` = `prev=… digest=… rev=… ev=… mode=… root=…`, chain fields first so the 300-char cap can only truncate the `root`), so **schema stays v87 with no new collection**: the chain lives in the log it protects.
2. **Two modes, printed honestly everywhere.** `sealMode: 'auto'` uses HMAC-SHA256 keyed by a PBKDF2-derived 256-bit session key (domain `leados-seal-v1:`, derived from the vault passphrase at unlock / enable / change-passphrase, memory-only, cleared at every lock site) whenever the vault is unlocked; otherwise it falls back to plain SHA-256. Plain mode is integrity against corruption and honest error — anyone with write access to the log can recompute it — and every surface says so. HMAC blocks verify only with the key; a locked workspace reports `key-missing` rather than pretending.
3. **Verification from genesis, typed failures.** `verifySealChain` walks every seal from genesis and reports the first break with a typed reason — `chain-break` (a seal does not follow from its predecessor), `seal-mismatch` (a seal was edited), `content-mismatch` (a sealed block's events no longer hash to its recorded digest, blamed at the exact revision) — plus `trailingUnsealedEvents` (events appended after the last seal) and `evictedBlocks` (blocks whose events the retention cap has since evicted: still chain-verified, content honestly reported as no longer recomputable). The chain check and the content check are separate verdicts; a content tamper does not invalidate the chain of seals around it.
4. **Retention-cap exemption.** Non-seal events keep `EVENT_CAP = 600`; seal events are exempt up to their own cap (5000) and are never the first thing a full log evicts — a chain whose anchors were evicted would be decorative. Evictions are reported, not hidden.
5. **Explicit passes.** `seal.scan` (any rank, always) seals the current transaction and appends a `seal.verified` event with the verdict, even when automatic sealing is off; `sealVerify` / `sealRead` / `sealBriefText` are safe reads at any rank. `enableSealing` / `disableSealing` / `setSealAutoPropagate` are operator-only and fail closed under a declared seat (ADR-0080's gateway). Idempotence is by revision: a re-run on an already-sealed revision appends nothing.
6. **Span attestation roll-up.** Every sealed transaction is counted at the owning span **and at every leadership ancestor above it** — the same tree the seat roll-up uses — so one frontline commit attests at lead → manager → director → VP → chief in the same transaction. Under a declared seat, out-of-subtree spans collapse to a single `__out-of-scope__` aggregate row rather than leaking counts sideways. The `#/seal` screen shows chain status, span attestations, recent blocks and an identity-free **integrity certificate** (Markdown: verdicts, seal prefixes, mode and limitations — no person ids, no record content) for attaching to a board pack or an auditor.
7. **Altitude-routed NL intake (same session, same spine).** Free-text intake drafts are routed to the owning seat by walking the reporting tree to the lowest common ancestor of the mentioned people (`resolveIntakeRouting`, intake `v intake-2026.11-v2`); the suggested case carries `ownerId` + `ownerBasis` and the `#/intake` analysis prints an altitude-routing card (owning seat, altitude, roll-up path, routes, hand-up and forbidden lists). Confirming the draft creates the case with the routed owner — so the first event a new case ever generates is already sealed under the right span.

## 3. Named frameworks encoded

- **Hash chain / Merkle-style append-only integrity:** every block commits to its predecessor; genesis is fixed; verification is a linear replay — the same construction as certificate transparency logs, scoped to one browser workspace.
- **HMAC-SHA256 (RFC 2104) over SHA-256 (FIPS 180-4):** verified against RFC 4231 test vectors and FIPS examples in `sealCrypto.js` (node:crypto-confirmed) — no hand-rolled cryptography, only Web Crypto primitives composed canonically.
- **PBKDF2 (RFC 8018) key derivation:** 256-bit session seal key from the vault passphrase, domain-separated (`leados-seal-v1:`), memory-only, never persisted.
- **Canonical JSON:** sorted-key serialization so a digest is a function of content, not of key order.
- **Attestation semantics:** a seal is a statement about a transaction; the roll-up is the same event counted at each ancestor span — like a signed receipt travelling up a chain of command, without inventing a per-person signature scheme (binding rejections: no person signing identities).

## 4. Data and propagation contract

- **Schema: v87, no bump.** No new collection, no `MIGRATIONS[87]`. Seal state lives in the event log (`audit.seal`, `seal.verified`, `seal.enabled`, `seal.disabled`, `seal.scan`) plus three settings that default when absent: `sealEnabled` (false), `sealAutoPropagate` (true), `sealMode` (`auto` | `hash`, default `auto`).
- **New modules:** `sealCrypto.js` (pure SHA-256 / HMAC / canonical JSON), `sealRegistry.js` (constants, limits, premise), `sealSchema.js` (settings normalizer), `sealChain.js` (seal computation, event parsing, genesis-walk verification, span attestations), `sealRules.js` (`sealRule` = RULE-SEAL-01/02), `seal.js` view.
- **Spine order:** `… → mandateRule → authorityCalibration → … → successionRule → seatRule → sealRule` — the seat rule still reads the finished workspace at position −2; the seal closes the transaction at −1. `propagationContracts.js` carries the `sealRule` contract like every other rule.
- **Gateway:** right `audit-seal` (ranks 1–5) covers `sealScan`; `sealRead` / `sealVerify` / `sealBriefText` are `SAFE_READS`; route `seal` is on the reviewed-surface allowlist. Seal key lifecycle: derived in `store.js` at unlock/enable/change-passphrase, cleared at all five vault-lock sites.
- **Cap:** `capEvents` exempts seal events from `EVENT_CAP` (600 → non-seal; 5000 → seals) and reports `evictedBlocks` in the verification verdict.
- **Intake:** `caseSuggestion.ownerId` / `ownerBasis`; the existing `addCase` owner ∈ people check now has a routed owner to check.

## 5. Honest limits

- **This is not authentication and not a multi-user boundary.** One browser, one store, one log. The chain proves the log has not been altered *since each block was sealed* under the printed mode; it does not identify who is operating, and the browser owner can export and re-import a whole workspace.
- **Plain-hash mode is not forgery-proof.** Anyone with write access to the log can recompute the entire chain. The app prints the mode on every surface and in the certificate; HMAC mode is only as strong as the passphrase and only while the session key is held.
- **The session key is in memory.** A locked workspace cannot verify HMAC blocks (`key-missing`), and there is no HSM, no hardware token, no external timestamping authority.
- **Retention-evicted blocks stay chain-verified but content-unverifiable.** The verdict says so explicitly rather than reporting a clean recompute it cannot perform.
- **Attestation roll-up is a count of sealed transactions per span, not a signature by a person.** No identity is bound to a seal; binding rejections (no production-RBAC claims from a browser-local seat) still apply.
- **Verification is on demand, not continuous.** Nothing re-verifies the chain in the background; a tamper that happens and is repaired before the next verify leaves no trace — the same honest limit any offline log has.

## 6. Verification target

`tests/app/seal-chain.test.mjs` — **15 tests** — covers: settings normalization with schema staying v87; inertness (no seal when disabled); exactly one `audit.seal` per commit with a genesis-valid chain; per-transaction event coverage (`ev` = fresh events); tamper evidence (content edit blamed at the exact revision, forged seal caught as `seal-mismatch`, chain still valid around a content-only tamper); HMAC keyed/wrong-key/no-key behaviour; `computeSeal` binding; idempotence by revision; retention-cap exemption with `evictedBlocks` reported; the headline — one frontline `addCase` under a declared seat producing cross-module propagation + cross-altitude roll-up to lead/manager/director/VP + one seal atomically, with span attestations sealed at every ancestor and out-of-subtree spans collapsed; explicit `seal.scan`; gateway refusal for enable/disable under a seat while reads/verify/scan pass at any rank; intake altitude routing + `confirmIntakeDraft` owner; four `#/seal` panels axe-clean sealed and unsealed; and the rule-last + propagation-contract assertion.

Full-suite results, lint, boundary check, docs-link check and the standalone build are recorded in `AI-SESSION-LOG.md` (Session 121).
