# ADR-0200: Permission-scoped quick search, an honest workspace checkup, and durable automation gaps

## Status

Accepted — 2026-11-14 (Session 268). No schema change; schema v156 unchanged.

## Context

Three separate problems shared one shape: the product knew something and could
not show it at the moment a leader needed it.

1. **Reaching a record was harder than remembering it.** The canonical app
   exposes well over a hundred tools. The sidebar search filters tool *names*;
   it cannot answer "the Aurora renewal" or "Priya's review" without the leader
   first knowing which module owns the record. The repository still carries a
   legacy `CommandPalette.tsx`, but the canonical zero-build app had no
   equivalent. Adding one is not cosmetic: route changes are cheap since
   ADR-0198, and the remaining cost is finding the right route.
2. **"Is anything wrong here?" had no single answer.** `#/assurance` reads the
   typed link graph; `#/efficiency` reads measured cost and automation; Settings
   prints the stored size and the audit log. None of them says whether a write
   landed, whether two rows share an identity, whether a cascade withheld work,
   or what could not be measured. A leader preparing to export, switch devices
   or trust a restored backup had to assemble that answer themselves.
3. **A truncated cascade left no durable evidence.** Before this ADR, when the
   automation event budget withheld source-created events, the only record was
   (a) `metrics.omittedEvents` in memory for the last write and (b) a warning on
   the render that happened to consume it. A reload erased both. The write path
   also used `automation.rule_error` for this case, conflating "a rule threw and
   its writes rolled back" with "no rule ran because the budget was spent".

Two smaller defects were found while building the checkup:

- `storeOptimizations.createKeyedMemo` wrote the new key before running the
  build. If the build threw, the next call with the *same* key hit the cache and
  returned the previous result — a cache that converts an error into stale data.
- The store estimated the workspace size on every write (five stratified
  `JSON.stringify` probes per collection) even though it was about to serialise
  the whole workspace anyway. The estimate was strictly less accurate than the
  string it was about to produce and cost **~2.0 ms per write** on the demo
  workspace (200 runs, Node 22 on this sandbox).

## Decision

### 1. One permission-scoped search catalog (`app/core/domain/quickSearch.js`)

The catalog has three explicit kinds:

- **Actions** — safe destinations only (`QUICK_ACTIONS`). Enter navigates; it
  never mutates a record.
- **Tools** — every permitted nav route, de-duplicated, with a short alias list
  for abbreviations ("one on one" → `1:1s`).
- **Records** — an explicit allowlist of 16 collections, each with one canonical
  deep link copied from the module that owns it.

The refusals are the design:

- Search never reads conflicts, pulses, leader-state notes, seals, credentials or
  the vault header. The allowlist is the list; adding a collection is a reviewed
  edit, not a side effect.
- A source is indexed only when the caller's `canReadSource(moduleRoute)` says
  the module is readable. The shell passes the router's own verdict and
  additionally withholds aggregate postures, whose record titles the rest of the
  product deliberately reduces to counts.
- The index stores titles and structural subtitles (role, kind, status) — never
  notes, reflections, bodies or free text.
- Search is built over the already seat-projected state, so a projection bug is
  a second line of defence, not the first.

Ranking requires **every** query token to match somewhere, scores exact > prefix
> word boundary > substring > one-edit typo, and prefers a focused record over a
mention. A raw subsequence match was rejected: "prya" matched arbitrary long
titles that happened to contain those letters in order.

The shell memoises the catalog on `(state object, acting seat, UTC day)`. Typing
scores an existing array; it does not rebuild the index.

### 2. ⌘K / Ctrl-K palette (`app/ui/command-palette.js`)

`openModal` already provides the dialog, focus trap, Escape handling and focus
restoration. The palette is a combobox inside it: focus stays in the input,
`aria-activedescendant` tracks the active option, every option is a real button,
and the empty state shows actions and recent destinations rather than dumping
records. Recent choices are a local convenience (label, type, route) capped at
six, validated on read, and never exported.

### 3. Workspace checkup (`app/core/domain/workspaceCheckup.js`, `#/checkup`)

Eleven readings, each with its evidence and the route that owns the decision:

| Reading | Failure means |
|---|---|
| Persistence | the last write did not reach storage |
| Storage headroom | >75% warn, >90% fail against the usual 5 MB floor |
| Schema version | older (migration missing) or newer (protected from writes) |
| Record identity | two rows in one collection share an id |
| Typed link graph | reuses `buildAssuranceReport`: dangling, duplicate, unknown relation |
| Automation failure receipts | a rule threw and downstream work may be absent |
| Automation budget gaps | a write withheld derived events |
| Last cascade | measured rollback/omission in this session |
| Performance | a measured interaction crossed the slow threshold |
| Storage protection | plain-text local storage |
| Workspace contents | demo data or the leader's own records |

A check that cannot be measured is `unknown` with the reason printed. The checkup
never repairs, never names a record, and its text export carries counts and
limits only. It is explicitly **not** a security audit: a browser profile is not
an access-control system.

### 4. A gap is its own durable event

`postCommit` now logs `automation.gap` when source-created events are withheld by
the delivery budget. `automation.rule_error` remains reserved for a rule that
threw and whose writes rolled back. A gap is a fact about one committed write:
the source record exists, the downstream work may not. The checkup reports the
count and the latest date; `#/assurance` keeps owning retries.

### 5. Price storage from what was actually written

The store retains `lastPersistBytes` — the exact length of the last payload it
read or wrote. The write path and the efficiency badge use that number; the
estimator remains only for a session that has neither read nor written. Thresholds
and messages are unchanged.

## Consequences

- **Efficiency.** The demo workspace's per-write quota estimate (~2.0 ms) is
  replaced by a number the save already produced. Palettes after the first open
  reuse the catalog; route changes remain ~20 ms (ADR-0198).
- **Intelligence.** A leader can reach a record from its name instead of its
  module, and the palette's own type labels make the ownership visible.
- **Robustness.** Two real defects are fixed: the memo cannot serve stale data
  after a failed build, and a budget gap survives a reload. Duplicate identities
  and dangling links are surfaced before an export, not after a restore.
- **Automation.** Gap and failure are now distinguishable in the durable log.
  No rule order, event budget, savepoint strategy or persistence semantics
  changed.
- **Accepted costs.** A new navigation route and one more top-level surface. A
  record index over a large workspace is bounded (400/source, 5,000 total) and
  the truncation is counted in the palette's own stats, not hidden. Search adds
  a second place where a collection allowlist must be maintained; the pure test
  asserts private collections never appear.
- **Not built.** No fuzzy phonetic matching, no cross-record content search, no
  saved searches, no server-side index, no automatic repair, no security
  certification. Real-browser assistive-technology walkthrough remains
  `[UNVERIFIED]`.
