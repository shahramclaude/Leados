# Current-state audit — 2026-10-24, session 6

## Scope and method (before implementation)

- Checkout: `shahramclaude/Leados`, branch `arena/1c24f8ee-leados`, base commit `499a6ae`
  (merge of PR #4). Working tree clean at session start.
- Read the canonical application graph: `index.html`, `scripts/serve.mjs`, `package.json`,
  `app/main.js`, `app/actions.js` (write API, guard wrapper), `app/core/store.js`,
  `app/core/schema.js` (settings/collections/migrations), `app/core/time.js`,
  `app/core/crypto.js` (added this session), `app/ui/dom.js` (element/modal/form primitives),
  `app/ui/components.js`, `app/views/settings.js` (export/import/reset paths),
  `tests/app/app.test.mjs` and `tests/app/storage-safety.test.mjs` (harness conventions).
  Root governance docs read: `README.md`, `ROADMAP.md` (all sections), `RESEARCH.md` (TOC,
  §14–16, standing debts), `LEADOS-STATE.md`, `docs/AUDIT-2026-10-24-session-5.md`, and the
  tail of `AI-SESSION-LOG.md` (Session 5 entry).
- Non-canonical trees (`src/**` Next.js/PostgreSQL, root `.ts`/`.tsx`, `drizzle/`, `public/`,
  `deprecated/`, `docs/**` history, `api-spec.*`, `exports/`, `reports/`) were **not**
  re-audited. `README.md` already classifies them as preserved-but-unsupported, and this
  session made no change to them. Their build/runtime/security status remains
  **[UNVERIFIED]**.
- Environment: Node v22.22.3, npm 10.9.8. `npm ci --no-audit --no-fund` installed 435
  packages. No Chromium/Firefox binary and no `playwright-core` in the container, so
  real-browser execution remains **[UNVERIFIED]** (same limitation as Sessions 4–5).
- Baseline verified by execution, not assumption: `npm test` → **173 pass / 0 fail**. The
  first run of the session failed 5 suites with `ERR_MODULE_NOT_FOUND: jsdom`; that was a
  missing dependency install, not a code defect, and disappeared after `npm ci`.
- Repository reality check: the checkout is ~3,666 tracked files, of which the canonical app is
  45 JS modules (13.8k LOC) at session start. The prompt's framing of a single `index.html`
  artifact does not match this repo; the zero-build `app/**` graph plus `index.html` is the
  canonical product per `docs/adr/0006-canonical-zero-build-app.md`.

## What works (verified)

- Zero-build ES-module app booting from `index.html`, with schema v5, additive v1→v5
  migrations, corrupt-blob quarantine, future-schema write protection and a capped event log.
- Full workflow set from Session 5 remains green under test: 1:1s, SBI feedback with latency,
  goals/KRs, delegations, GROW, succession readiness, pulse with anonymity floors, DACI
  decisions, recognition, evidence-frozen reviews with calibration, conflict working records
  isolated from scoring, longitudinal health trends, and 13 scoped formula-safe CSV exports.
- Hardened static server: canonical-asset allowlist, symlink/traversal refusal, `GET`/`HEAD`
  only. Re-verified this session against live HTTP.

## Verified defects and gaps found this session

1. **Sensitive records were stored in plain text (`app/core/store.js`).** One `localStorage`
   blob held people, 1:1 notes, review reflections and confidential conflict records, and
   every JSON/CSV export was plain text. Anyone with the browser profile or a copied backup
   could read everything. `ROADMAP.md` ranked this as the top missing capability.
2. **The store had no concept of an unreadable-but-valid blob.** Its load path treats any
   unparseable JSON as corrupt: it quarantines the value and opens an empty workspace. Any
   future encrypted format had to be detected *before* that path, or the first reload after
   encryption would have destroyed the only copy of the ciphertext.
3. **No async write path existed.** `persist()` wrote synchronously and `update()` relied on a
   synchronous boolean to label a change "saved" or "unsaved". WebCrypto is asynchronous, so
   the store needed a queued, coalescing write path plus an awaitable flush for the cases
   where adoption depends on the write landing (imports, mode changes).
4. **No secure-context detection.** `crypto.subtle` is absent over plain HTTP on a LAN
   address; without an explicit check the lock screen would fail only after someone typed
   their passphrase. Now detected up front.

## What was built (see `AI-SESSION-LOG.md` Session 6 for verification detail)

- `app/core/crypto.js` — PBKDF2-SHA-256 (600,000 rounds, 16-byte salt) + AES-256-GCM
  (96-bit IV, AAD binding format/version/iterations/salt/purpose), versioned envelope,
  strict base64, passphrase policy, iteration floor/ceiling on read, injectable WebCrypto.
- `app/core/store.js` — vault state machine (`plain`/`locked`/`unsupported`), locked-write
  guard, ciphertext-preserving load path, queued encrypted writes with `flush()`,
  awaitable `persistAwaited`, `unlock`/`lock`/`enableEncryption`/`changePassphrase`/
  `disableEncryption`/`exportEncrypted`/`importBackup`, locked-safe `exportJSON`, and
  explicit erase confirmation.
- `app/views/vault.js`, `app/ui/vault-dialogs.js`, `app/ui/download.js`,
  `app/views/settings.js`, `app/main.js`, `app/styles.css` — lock screen, encryption settings,
  encrypted backup/restore, and shell changes that render only the lock screen while locked.
- `tests/app/encryption.test.mjs` — 20 tests, several of them negative-property assertions.

## Tradeoffs and things not verified

- Encryption is opt-in. A manager who never opens Settings keeps exactly the previous
  plain-text behaviour; the Settings card states that plainly rather than implying protection.
- Encrypted writes are queued, so `update()` reports "saved" optimistically and corrects itself
  via a later `persisted`/`update-unsaved` notification. `flush()` is awaited by every path
  where adoption depends on the write.
- No idle auto-lock, no recovery key, no per-collection keys, no encryption of CSV or
  plain-text exports.
- Browser WebCrypto was not exercised in a real browser binary this session: Node's
  `webcrypto` was injected into jsdom. Genuine cross-browser unlock/decrypt remains
  **[UNVERIFIED]**, as do raster contrast sampling, print/PDF output and physical mobile
  viewports.
- The legacy Next.js tree was not rebuilt, audited or deployed; its dependency advisories are
  unchanged and still must not be treated as cleared by this session's green suite.
